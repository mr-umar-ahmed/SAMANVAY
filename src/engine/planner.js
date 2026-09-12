/**
 * Planner facade — the one entry point for the UI, the REST API, the CLI and
 * the tests. Builds a planning context for a corridor (feeds → normalised
 * tasks → risk models → ARCI ranking) and runs the horizons.
 */
import { getCorridor, CORRIDORS } from './corridors.js';
import { buildFeeds, ASSET_CLASS_PARAMS } from './dataFactory.js';
import { normalize, coLocationPairs } from './normalizer.js';
import { buildRiskModels, trafficDensity, scoreAll, bootstrapArciBands } from './riskEngine.js';
import { learnDurationFactors } from './productivity.js';
import { buildDayOccupancy } from './occupancy.js';
import { tsrLossPerDay } from './delayModel.js';
import { buildWeekly, buildMonthly, buildRolling } from './horizons.js';
import { DEFAULT_WEIGHTS, RULES, WORK_TYPES, MACHINE_TYPES } from './constants.js';
import { mergeImported } from './importer.js';
import { weatherEffects, fogDays, applyWeatherToPassages } from './weather.js';
import { detectAnomalies } from './anomaly.js';

export const DEFAULT_PLAN_START = '2026-09-07'; // Monday

export function parsePlanStart(s) {
  const [y, m, d] = String(s || DEFAULT_PLAN_START).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function createContext(corridorId, { seed = 26027, planStart = DEFAULT_PLAN_START, feeds: feedOverride = null, scenario = null, imported = null, weather = null, bootstrapSamples = 30 } = {}) {
  const corridor = getCorridor(corridorId);
  const start = parsePlanStart(planStart);
  let feeds = feedOverride || buildFeeds(corridor, { seed, planStart });
  // records imported from TMS / SMMS / TDMS files (already validated on the main thread) join the seeded registers
  if (imported) feeds = mergeImported(feeds, imported);
  if (scenario && scenario.extraExecution && scenario.extraExecution.length) {
    feeds = { ...feeds, executionLog: feeds.executionLog.concat(scenario.extraExecution) };
  }
  if (scenario) feeds = applyScenario(corridor, feeds, scenario, start);
  // weather: seeded IMD-shaped days, replaced day by day by a live forecast when one was fetched
  const wx = mergeWeather(feeds.weather || [], weather);
  feeds = { ...feeds, weather: wx };
  const weatherFx = wx.map((d) => weatherEffects(d));
  const fog = fogDays(wx);
  const fogSet = new Set(fog);
  const fogFeeds = fog.length ? applyWeatherToPassages(corridor, feeds, { freightDays: fog }) : null;
  const feedsForDay = fogFeeds ? (d) => (fogSet.has(d) ? fogFeeds : feeds) : null;
  const factors = learnDurationFactors(feeds.executionLog);
  const normalised = normalize(corridor, feeds, factors);
  const { issues, counts } = normalised;
  let tasks = normalised.tasks;
  if (scenario && scenario.injectTasks && scenario.injectTasks.length) tasks = mergeInjected(corridor, feeds, tasks, scenario.injectTasks, factors, issues);
  const models = buildRiskModels(feeds);
  const anomalies = detectAnomalies({ executionLog: feeds.executionLog, failureHistory: feeds.failureHistory, weibullModels: models.weibull, tasks, feeds });
  const density = trafficDensity(corridor, feeds.timetable, feeds.freight);
  const ranked = scoreAll(tasks, models, density, corridor);
  const bands = bootstrapSamples > 0 ? bootstrapArciBands(tasks, feeds, models, density, corridor, { samples: bootstrapSamples, seed }) : { samples: 0, timeMs: 0 };
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
  const ctx = { corridor, corridorId: corridor.id, seed, planStart: start, planStartIso: planStart, feeds, factors, tasks, ranked, issues, counts, pairs: coLocationPairs(tasks), models, density, tsrLossPerDay: tsrLoss, assetPopulation, meanAge, scenario, imported: imported || null, weatherOverride: weather || null, bands, weatherEffects: weatherFx, fogDays: fog, feedsForDay, anomalies };
  ctx.rolling = buildRolling(ctx);
  return ctx;
}

/**
 * Run all horizons.
 * opts.construct — optional construction callback (e.g. the MILP) used for
 * the WEEKLY horizon only; simulated annealing polishes its result.
 * opts.solver — 'sa' | 'milp' as requested by the UI (recorded; a 'milp'
 * request without a construct callback falls back to greedy and says so).
 */
export function runPlanning(ctx, { weights = {}, rules = {}, iterations, seed, fixedBlocks = [], construct = null, solver = null } = {}) {
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  const r = { ...RULES, ...rules };
  // the JPO notice rule is a run parameter: rebuild the programme when it differs
  const rolling = ctx.rolling && ctx.rolling.noticeRule === r.noticeWeeksForRegulation ? ctx.rolling : buildRolling(ctx, r);
  const weekly = buildWeekly(ctx, { weights: w, rules: r, iterations, seed, fixedBlocks, construct, solver });
  const monthly = buildMonthly(ctx, { weights: w, rules: r, iterations: iterations ? Math.round(iterations * 0.6) : undefined, seed, fixedBlocks, rolling });
  return { weekly, monthly, rolling, weights: w, rules: r };
}

/**
 * Seeded weather days with any fetched forecast laid over them day by day
 * (a forecast covers at most ~16 days; later days stay seeded).
 */
function mergeWeather(seeded, override) {
  if (!Array.isArray(override) || !override.length) return seeded;
  const byDay = new Map(override.filter((d) => d && Number.isFinite(d.day)).map((d) => [d.day, d]));
  const out = seeded.map((d) => byDay.get(d.day) || d);
  for (const d of byDay.values()) if (!out.some((x) => x.day === d.day)) out.push(d);
  return out.sort((a, b) => a.day - b.day);
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
  if (scenario.speedCapKmph && scenario.speedCapKmph < corridor.mpsKmph && scenario.speedCapWindow) {
    // fog: trains are capped only inside the window (e.g. 22:00–08:00), not all day
    Object.assign(out, applyWeatherToPassages(corridor, out, { capKmph: scenario.speedCapKmph, from: scenario.speedCapWindow.from, to: scenario.speedCapWindow.to }));
  } else if (scenario.speedCapKmph && scenario.speedCapKmph < corridor.mpsKmph) {
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

/**
 * Block kind and line closure of an injected work: the requisition's block
 * kind (or the work type's) plus anything it `requires`.
 *   POWER / POWER_BLOCK  → needs a power block (OHE sections isolated)
 *   DISCONNECTION        → no line closure (nested / daylight like S&T work)
 *   TRAFFIC + POWER      → both
 */
function resolveBlockKind(wtKind, spec, workType) {
  const reqKind = spec.blockKind ? (spec.blockKind === 'TRAFFIC + POWER' ? 'TRAFFIC_POWER' : spec.blockKind) : null;
  const base = reqKind || wtKind;
  const req = Array.isArray(spec.requires) ? spec.requires : [];
  const traffic = base.includes('TRAFFIC');
  const power = base.includes('POWER') || req.includes('POWER_BLOCK');
  const blockKind = traffic && power ? 'TRAFFIC_POWER' : traffic ? 'TRAFFIC' : power ? 'POWER' : 'DISCONNECTION';
  const closure = blockKind === 'DISCONNECTION' || (blockKind === 'POWER' && workType === 'TSS_MAINTENANCE') ? 'NONE' : 'LINE';
  const needsDisconnection = blockKind !== 'DISCONNECTION' && (base === 'DISCONNECTION' || req.includes('DISCONNECTION'));
  return { blockKind, closure, needsDisconnection };
}

const FIELD_LABEL = { duration: 'duration', window: 'window', preferredDay: 'preferred day', machine: 'machine', blockKind: 'block kind', dependsOn: 'sequence', coRequireWith: 'joint block', replaces: 'replaces register work' };

/**
 * Add injected works (requisitions, field reports, what-ifs) to the register:
 * skip works meant for another corridor, drop register works a requisition
 * replaces, then resolve dependsOn / coRequireWith references (sourceId or
 * task id) to task ids of this run. Unresolvable references become data issues.
 */
function mergeInjected(corridor, feeds, tasks, specs, factors, issues) {
  const built = injectTasks(corridor, specs, factors, feeds, issues);
  const replaced = new Map(); // register task id -> replacing task id
  for (const t of built) if (t.replacesTaskId) replaced.set(t.replacesTaskId, t.id);
  for (const [old, by] of replaced) if (!tasks.some((t) => t.id === old) && !built.some((t) => t.id === old)) issues.push({ source: 'REQUISITION', id: by, issue: `replacesTaskId ${old} matches no work in the register`, taskId: by });
  const all = tasks.concat(built).filter((t) => !replaced.has(t.id) || replaced.get(t.id) === t.id);
  const ref = new Map();
  for (const t of all) ref.set(t.id, t.id);
  for (const t of all) if (t.sourceId && !ref.has(t.sourceId)) ref.set(t.sourceId, t.id);
  for (const [old, by] of replaced) if (!ref.has(old)) ref.set(old, by);
  const resolve = (t, list, key) => {
    const out = [];
    for (const x of list) {
      const id = ref.get(x);
      if (id && id !== t.id) out.push(id);
      else if (!id) issues.push({ source: 'REQUISITION', id: t.sourceId, issue: `${key} "${x}" matches no work in this run`, taskId: t.id });
    }
    return [...new Set(out)];
  };
  const byId = new Map(all.map((t) => [t.id, t]));
  for (const t of built) {
    if (!byId.has(t.id)) continue;
    if (t.dependsOn) t.dependsOn = resolve(t, t.dependsOn, 'dependsOn');
    if (t.coRequireWith) t.coRequireWith = resolve(t, t.coRequireWith, 'coRequireWith');
  }
  // joint-block requirements are mutual
  for (const t of built) {
    for (const p of t.coRequireWith || []) {
      const other = byId.get(p);
      if (!other) continue;
      other.coRequireWith = [...new Set([...(other.coRequireWith || []), t.id])];
    }
  }
  return all;
}

function injectTasks(corridor, list, factors, feeds, issues = []) {
  const out = [];
  list.forEach((spec, i) => {
    if (!spec) return;
    // a requisition raised on another corridor is not planned here
    if (spec.corridorId && spec.corridorId !== corridor.id) return;
    const wt = WORK_TYPES[spec.workType] || WORK_TYPES.USFD_IMR_RAIL;
    const startKm = spec.startKm ?? 100;
    const endKm = spec.endKm ?? startKm + 0.3;
    const secs = sectionsInRange(corridor, startKm, endKm).map((s) => s.index);
    const fields = [];
    const requested = Number(spec.durationMin);
    const hasDuration = spec.durationMin != null && Number.isFinite(requested) && requested > 0;
    // a requested duration is used exactly as given (no calibration factor applied)
    const durationMin = hasDuration ? Math.round(requested) : calibratedDuration(wt.durationMin, spec.workType, factors);
    if (hasDuration) fields.push('duration');
    let machine = wt.machine;
    if (spec.machine !== undefined) {
      if (spec.machine === null || spec.machine === '') {
        machine = null;
        fields.push('machine');
      } else if (MACHINE_TYPES[spec.machine]) {
        machine = spec.machine;
        fields.push('machine');
      } else {
        const unit = (feeds.machines || []).find((m) => m.id === spec.machine);
        if (unit) {
          machine = unit.type;
          fields.push('machine');
        } else issues.push({ source: 'REQUISITION', id: spec.sourceId || `inject #${i + 1}`, issue: `Machine "${spec.machine}" not recognised; work-type default kept` });
      }
    }
    const kind = resolveBlockKind(wt.blockKind, spec, spec.workType);
    if (spec.blockKind || (Array.isArray(spec.requires) && spec.requires.length)) fields.push('blockKind');
    const preferredDay = Number.isInteger(spec.preferredDay) && spec.preferredDay >= 0 ? spec.preferredDay : null;
    if (preferredDay != null) fields.push('preferredDay');
    const preferredWindow = spec.preferredWindow === 'night' || spec.preferredWindow === 'day' ? spec.preferredWindow : null;
    if (preferredWindow) fields.push('window');
    const dependsOn = Array.isArray(spec.dependsOn) && spec.dependsOn.length ? spec.dependsOn.map(String) : null;
    if (dependsOn) fields.push('dependsOn');
    const coRequireWith = Array.isArray(spec.coRequireWith) && spec.coRequireWith.length ? spec.coRequireWith.map(String) : null;
    if (coRequireWith) fields.push('coRequireWith');
    if (spec.replacesTaskId) fields.push('replaces');
    const daysOverdue = spec.daysOverdue ?? 0;
    const listText = fields.map((f) => FIELD_LABEL[f]);
    const note = fields.length ? `${listText.length > 1 ? `${listText.slice(0, -1).join(', ')} and ${listText[listText.length - 1]}` : listText[0]} from ${spec.sourceId ? `requisition ${spec.sourceId}` : 'the injected work'}` : null;
    out.push({
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
      blockKind: kind.blockKind,
      closure: kind.closure,
      needsDisconnection: kind.needsDisconnection,
      requires: Array.isArray(spec.requires) ? spec.requires.slice() : [],
      // with a requested duration the base is the request itself, so it is not shown as "calibrated"
      baseDurationMin: hasDuration ? durationMin : wt.durationMin,
      durationMin,
      durationSource: hasDuration ? 'requisition' : 'calibrated',
      setupMin: wt.setupMin,
      clearanceMin: wt.clearanceMin,
      totalMin: wt.setupMin + durationMin + wt.clearanceMin,
      machine,
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
      groupId: spec.groupId || null,
      targetBlock: spec.targetBlock || null,
      preferredDay,
      preferredWindow,
      dependsOn,
      coRequireWith,
      replacesTaskId: spec.replacesTaskId || null,
      injectedFields: fields.length ? { sourceId: spec.sourceId || null, fields, note: note.charAt(0).toUpperCase() + note.slice(1) } : null,
      injected: true
    });
  });
  return out;
}

export { CORRIDORS, DEFAULT_WEIGHTS, RULES };
