/**
 * Planner facade — the one entry point for the UI, the REST API, the CLI and
 * the tests. Builds a planning context for a corridor (feeds → normalised
 * tasks → risk models → ARCI ranking) and runs the horizons.
 */
import { getCorridor, CORRIDORS } from './corridors.js';
import { buildFeeds, ASSET_CLASS_PARAMS } from './dataFactory.js';
import { normalize, coLocationPairs } from './normalizer.js';
import { buildRiskModels, trafficDensity, scoreAll } from './riskEngine.js';
import { learnDurationFactors } from './productivity.js';
import { buildDayOccupancy } from './occupancy.js';
import { tsrLossPerDay } from './delayModel.js';
import { buildWeekly, buildMonthly, buildRolling } from './horizons.js';
import { DEFAULT_WEIGHTS, RULES, WORK_TYPES } from './constants.js';

export const DEFAULT_PLAN_START = '2026-09-07'; // Monday

export function parsePlanStart(s) {
  const [y, m, d] = String(s || DEFAULT_PLAN_START).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function createContext(corridorId, { seed = 26027, planStart = DEFAULT_PLAN_START, feeds: feedOverride = null, scenario = null } = {}) {
  const corridor = getCorridor(corridorId);
  const start = parsePlanStart(planStart);
  let feeds = feedOverride || buildFeeds(corridor, { seed });
  if (scenario && scenario.extraExecution && scenario.extraExecution.length) {
    feeds = { ...feeds, executionLog: feeds.executionLog.concat(scenario.extraExecution) };
  }
  if (scenario) feeds = applyScenario(corridor, feeds, scenario, start);
  const factors = learnDurationFactors(feeds.executionLog);
  const { tasks, issues, counts } = normalize(corridor, feeds, factors);
  if (scenario && scenario.injectTasks) for (const t of injectTasks(corridor, scenario.injectTasks, factors)) tasks.push(t);
  const models = buildRiskModels(feeds);
  const density = trafficDensity(corridor, feeds.timetable, feeds.freight);
  const ranked = scoreAll(tasks, models, density, corridor);
  const day0 = buildDayOccupancy(corridor, feeds, 0, start);
  const tsrLoss = Object.fromEntries(tasks.map((t) => [t.id, tsrLossPerDay(t, day0, corridor)]));
  // asset population estimate per class (for the workload forecast)
  const assetPopulation = {};
  const meanAge = {};
  for (const cls of Object.keys(ASSET_CLASS_PARAMS)) {
    const pop = { RAIL: corridor.blockSections.length * 2 * 4, BALLAST: corridor.blockSections.length * 2 * 6, TURNOUT: corridor.stations.filter((s) => s.junction).length * 6, BRIDGE: Math.round(corridor.lengthKm / 25), POINT_MACHINE: corridor.stations.length * 8, TRACK_CIRCUIT: corridor.stations.length * 12, AXLE_COUNTER: corridor.blockSections.length * 4, EI: corridor.stations.filter((s) => s.junction).length, CABLE: corridor.blockSections.length * 2, LC_GATE: Math.round(corridor.lengthKm / 8), CONTACT_WIRE: corridor.oheSections.length * 2, INSULATOR: corridor.oheSections.length * 40, CANTILEVER: corridor.oheSections.length * 30, NEUTRAL_SECTION: corridor.tss.length, TSS: corridor.tss.length }[cls];
    assetPopulation[cls] = pop || 10;
    const ages = tasks.filter((t) => t.assetClass === cls).map((t) => t.ageDays);
    meanAge[cls] = ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : (ASSET_CLASS_PARAMS[cls].eta * 0.45);
  }
  const ctx = { corridor, corridorId: corridor.id, seed, planStart: start, planStartIso: planStart, feeds, factors, tasks, ranked, issues, counts, pairs: coLocationPairs(tasks), models, density, tsrLossPerDay: tsrLoss, assetPopulation, meanAge, scenario };
  ctx.rolling = buildRolling(ctx);
  return ctx;
}

/** Run all horizons. */
export function runPlanning(ctx, { weights = {}, rules = {}, iterations, seed } = {}) {
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  const r = { ...RULES, ...rules };
  const weekly = buildWeekly(ctx, { weights: w, rules: r, iterations, seed });
  const monthly = buildMonthly(ctx, { weights: w, rules: r, iterations: iterations ? Math.round(iterations * 0.6) : undefined, seed });
  return { weekly, monthly, rolling: ctx.rolling, weights: w, rules: r };
}

/* ------------------------------------------------------------------------ */
/* What-if scenarios                                                         */
/* ------------------------------------------------------------------------ */

/**
 * scenario = {
 *   removeMachines: ['CSM-01'],          machine breakdown
 *   cancelTrains: ['NCR_NDLS_CNB:12034'], train cancelled for the week
 *   addPremiumTrain: { line:'DN', dep: 420 }  new Vande Bharat path
 *   injectTasks: [{ workType, line, startKm, endKm, daysOverdue, tsrKmph }]
 *   freightSurge: 1.3                     FOIS forecast multiplier
 * }
 */
export function applyScenario(corridor, feeds, scenario, planStart) {
  const out = { ...feeds };
  if (scenario.removeMachines && scenario.removeMachines.length) {
    out.machines = feeds.machines.map((m) => (scenario.removeMachines.includes(m.id) ? { ...m, unavailable: [{ fromDay: 0, toDay: 60, reason: 'Scenario: breakdown' }] } : m));
  }
  if (scenario.cancelTrains && scenario.cancelTrains.length) {
    out.timetable = feeds.timetable.filter((t) => !scenario.cancelTrains.includes(t.id) && !scenario.cancelTrains.includes(t.number));
  }
  if (scenario.addPremiumTrain) {
    const { computeTimings, sectionPassages } = scenarioHelpers;
    const p = scenario.addPremiumTrain;
    const junctions = new Set(corridor.stations.filter((s) => s.junction).map((s) => s.code));
    const train = { id: `${corridor.id}:VB-NEW`, number: 'VB-NEW', name: 'Vande Bharat (proposed path)', cls: 'VB', classLabel: 'Vande Bharat', weight: 1, premium: true, line: p.line || 'DN', source: 'COA', runsOn: [1, 1, 1, 1, 1, 1, 1], dep: p.dep || 420 };
    train.times = computeTimings(corridor, 'VB', train.line, train.dep, junctions, corridor.mpsKmph);
    train.passages = sectionPassages(corridor, train);
    train.origin = train.times[0].code;
    train.destination = train.times[train.times.length - 1].code;
    train.arr = train.times[train.times.length - 1].arr;
    out.timetable = (out.timetable || feeds.timetable).concat([train]);
  }
  if (scenario.speedCapKmph && scenario.speedCapKmph < corridor.mpsKmph) {
    // Dense fog / weather: every path is re-timed under the speed cap, which
    // stretches passages and shrinks the natural headway gaps.
    const { computeTimings, sectionPassages } = scenarioHelpers;
    const cap = scenario.speedCapKmph;
    const retime = (t) => {
      const halts = new Set((t.times || []).filter((x) => x.halt).map((x) => x.code));
      const nt = { ...t };
      nt.times = computeTimings(corridor, t.cls, t.line, t.dep, halts, cap);
      nt.passages = sectionPassages(corridor, nt);
      nt.arr = nt.times[nt.times.length - 1].arr;
      return nt;
    };
    out.timetable = (out.timetable || feeds.timetable).map(retime);
    out.freight = (out.freight || feeds.freight).map((f) => {
      const sub = { ...corridor, stations: corridor.stations.filter((s) => f.times.some((x) => x.code === s.code)) };
      const nf = { ...f };
      nf.times = computeTimings(sub, 'GOODS', f.line, f.dep, new Set(), cap);
      nf.passages = sectionPassages(corridor, nf);
      nf.arr = nf.times[nf.times.length - 1].arr;
      return nf;
    });
  }
  if (scenario.freightSurge && scenario.freightSurge !== 1) {
    const k = scenario.freightSurge;
    if (k < 1) out.freight = feeds.freight.filter((f, i) => (i % 10) / 10 < k);
    else {
      const extra = Math.round((k - 1) * feeds.freight.length);
      const add = feeds.freight.slice(0, extra).map((f, i) => ({ ...f, id: `${f.id}-x${i}`, number: `${f.number}X`, dep: (f.dep + 37) % 1440, passages: f.passages.map((p) => ({ ...p, enter: p.enter + 37, exit: p.exit + 37 })) }));
      out.freight = feeds.freight.concat(add);
    }
  }
  return out;
}

import { computeTimings, sectionPassages } from './dataFactory.js';
import { sectionsInRange, oheSectionsInRange } from './corridors.js';
import { calibratedDuration } from './productivity.js';
import { stableHash } from './time.js';
const scenarioHelpers = { computeTimings, sectionPassages };

function injectTasks(corridor, list, factors) {
  return list.map((spec, i) => {
    const wt = WORK_TYPES[spec.workType] || WORK_TYPES.USFD_IMR_RAIL;
    const startKm = spec.startKm ?? 100;
    const endKm = spec.endKm ?? startKm + 0.3;
    const secs = sectionsInRange(corridor, startKm, endKm).map((s) => s.index);
    const durationMin = calibratedDuration(wt.durationMin, spec.workType, factors);
    const daysOverdue = spec.daysOverdue ?? 0;
    return {
      // stable across runs: derived from the requisition / report that produced it
      id: spec.sourceId ? `INJ-${stableHash(`${spec.sourceId}|${spec.workType}|${startKm}|${endKm}`)}` : `INJ-${String(i + 1).padStart(2, '0')}`,
      sourceId: spec.sourceId || `FIELD/${spec.workType}/${i + 1}`,
      source: spec.sourceId ? String(spec.sourceId).split('/')[0] : wt.dept,
      dept: wt.dept,
      deptLabel: wt.dept,
      workType: spec.workType,
      label: spec.label || `${wt.label} (field report)`,
      assetClass: wt.assetClass,
      line: spec.line || 'DN',
      startKm,
      endKm,
      lengthKm: endKm - startKm,
      sections: secs.length ? secs : [0],
      sectionLabel: secs.map((s) => corridor.blockSections[s].label).join(' / '),
      oheSections: oheSectionsInRange(corridor, startKm, endKm).map((s) => s.index),
      station: null,
      blockKind: wt.blockKind,
      closure: wt.blockKind === 'DISCONNECTION' ? 'NONE' : 'LINE',
      baseDurationMin: wt.durationMin,
      durationMin,
      setupMin: wt.setupMin,
      clearanceMin: wt.clearanceMin,
      totalMin: wt.setupMin + durationMin + wt.clearanceMin,
      machine: wt.machine,
      crew: wt.crew,
      safety: wt.safety,
      capital: !!wt.capital,
      mandatoryWithinDays: wt.mandatoryWithinDays,
      daysOverdue,
      dueDay: wt.mandatoryWithinDays - daysOverdue,
      requestedDaysAgo: 0,
      ageDays: spec.ageDays ?? 900,
      conditionIndex: spec.conditionIndex ?? 0.9,
      tsrKmph: spec.tsrKmph ?? wt.tsrKmph,
      tsrSinceDays: 0,
      noticeWeeksGiven: null,
      targetWeek: null,
      workingDaysNeeded: 1,
      metrics: { detectedBy: 'Field report (scenario)', flawType: spec.note || 'Field-reported defect', gmt: 40 },
      nativeLocation: `${spec.line || 'DN'} line, km ${startKm}–${endKm}`,
      injected: true
    };
  });
}

export { CORRIDORS, DEFAULT_WEIGHTS, RULES };
