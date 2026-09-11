/**
 * Spatial-temporal normalisation engine.
 *
 * Every departmental system references location differently: TMS uses line
 * code + route km, SMMS uses station yard + gear id, TDMS uses OHE mast
 * numbers and elementary sections. This module maps all of them onto the
 * corridor network graph (block sections, lines, OHE elementary sections) and
 * produces one unified task register that the risk engine and the optimiser
 * consume.
 */
import { WORK_TYPES, DEPARTMENTS } from './constants.js';
import { sectionsInRange, oheSectionsInRange, sectionAtKm } from './corridors.js';
import { calibratedDuration } from './productivity.js';

/** Parse "145/12" mast reference back to a chainage (km). */
export function mastToKm(ref) {
  const [km, idx] = String(ref).split('/').map(Number);
  return km + ((idx || 1) - 1) * 0.055;
}

function closureOf(blockKind, workType) {
  if (blockKind === 'DISCONNECTION') return 'NONE';
  if (workType === 'TSS_MAINTENANCE') return 'NONE'; // extended feed from adjacent TSS
  return 'LINE';
}

function baseTask(corridor, source, rec, id) {
  const spec = WORK_TYPES[rec.workType];
  const startKm = rec.fromKm !== undefined ? rec.fromKm : rec.km;
  const endKm = rec.toKm !== undefined ? rec.toKm : rec.km;
  const secs = sectionsInRange(corridor, startKm, endKm);
  const sections = secs.length ? secs.map((s) => s.index) : [sectionAtKm(corridor, startKm).index];
  const ohe = oheSectionsInRange(corridor, startKm, endKm).map((s) => s.index);
  const daysOverdue = rec.daysOverdue || 0;
  const dueDay = spec.mandatoryWithinDays - daysOverdue; // day index (relative to plan start) by which the work must be done
  return {
    id,
    sourceId: rec.tmsId || rec.smmsId || rec.tdmsId,
    source,
    dept: spec.dept,
    deptLabel: DEPARTMENTS[spec.dept].short,
    workType: rec.workType,
    label: spec.label,
    assetClass: spec.assetClass,
    line: rec.line || 'DN',
    startKm,
    endKm,
    lengthKm: Math.max(0, endKm - startKm),
    sections,
    sectionLabel: sections.map((i) => corridor.blockSections[i].label).join(' / '),
    oheSections: ohe,
    station: rec.station || null,
    blockKind: spec.blockKind,
    closure: closureOf(spec.blockKind, rec.workType),
    baseDurationMin: spec.durationMin,
    durationMin: spec.durationMin,
    setupMin: spec.setupMin,
    clearanceMin: spec.clearanceMin,
    machine: spec.machine,
    crew: spec.crew,
    safety: spec.safety,
    capital: !!spec.capital,
    mandatoryWithinDays: spec.mandatoryWithinDays,
    daysOverdue,
    dueDay,
    requestedDaysAgo: rec.requestedDaysAgo || 0,
    ageDays: rec.ageDays || 0,
    conditionIndex: rec.conditionIndex || 0.5,
    tsrKmph: rec.tsrKmph || null,
    tsrSinceDays: rec.tsrKmph ? rec.tsrSinceDays || 0 : 0,
    noticeWeeksGiven: rec.noticeWeeksGiven || null,
    targetWeek: rec.targetWeek || null,
    workingDaysNeeded: rec.workingDaysNeeded || 1,
    metrics: rec
  };
}

/** Human readable native location for provenance display. */
function nativeLocation(source, rec) {
  if (source === 'TMS') return rec.station ? `${rec.station} yard, turnout ${rec.turnoutNo || ''}`.trim() : `${rec.line} line, km ${rec.fromKm}–${rec.toKm}`;
  if (source === 'SMMS') return `${rec.station} yard · ${rec.gearId}`;
  if (rec.tssCode) return rec.tssCode;
  return `Mast ${rec.mastFrom} → ${rec.mastTo} (${rec.line})`;
}

/**
 * Build the unified task register.
 * @param corridor enriched corridor
 * @param feeds output of dataFactory.buildFeeds (or live feeds with the same shape)
 * @param durationFactors output of productivity.learnDurationFactors
 */
export function normalize(corridor, feeds, durationFactors = {}) {
  const tasks = [];
  const issues = [];
  let n = 0;
  const add = (source, rec) => {
    n++;
    if (!WORK_TYPES[rec.workType]) {
      issues.push({ source, id: rec.tmsId || rec.smmsId || rec.tdmsId, issue: `Unknown work type ${rec.workType}` });
      return;
    }
    const km = rec.fromKm !== undefined ? rec.fromKm : rec.km;
    if (km === undefined || km < 0 || km > corridor.lengthKm) {
      issues.push({ source, id: rec.tmsId || rec.smmsId || rec.tdmsId, issue: `Chainage ${km} outside corridor` });
      return;
    }
    const t = baseTask(corridor, source, rec, `${source}-${String(n).padStart(3, '0')}`);
    t.durationMin = calibratedDuration(t.baseDurationMin, t.workType, durationFactors);
    t.totalMin = t.setupMin + t.durationMin + t.clearanceMin;
    t.nativeLocation = nativeLocation(source, rec);
    tasks.push(t);
  };
  (feeds.tms || []).forEach((r) => add('TMS', r));
  (feeds.smms || []).forEach((r) => {
    // SMMS records for OHE-independent gear: line as given; map mast refs if any
    add('SMMS', r);
  });
  (feeds.tdms || []).forEach((r) => {
    const rec = { ...r };
    if (rec.fromKm === undefined && rec.mastFrom) {
      rec.fromKm = mastToKm(rec.mastFrom);
      rec.toKm = mastToKm(rec.mastTo || rec.mastFrom);
    }
    add('TDMS', rec);
  });

  // Data quality checks that the integration layer would raise back to the source system.
  for (const t of tasks) {
    if (t.tsrKmph && t.daysOverdue < -5) issues.push({ source: t.source, id: t.sourceId, issue: 'TSR imposed but task not yet due — verify due date', taskId: t.id });
    if (t.closure === 'LINE' && !['UP', 'DN', 'BOTH'].includes(t.line)) issues.push({ source: t.source, id: t.sourceId, issue: `Line code "${t.line}" not recognised`, taskId: t.id });
  }

  return { tasks, issues, counts: { TMS: (feeds.tms || []).length, SMMS: (feeds.smms || []).length, TDMS: (feeds.tdms || []).length, total: tasks.length, rejected: n - tasks.length } };
}

/** Co-location candidates: pairs of tasks from different departments sharing a block section and line. */
export function coLocationPairs(tasks) {
  const pairs = [];
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const a = tasks[i];
      const b = tasks[j];
      if (a.dept === b.dept) continue;
      if (a.closure === 'NONE' && b.closure === 'NONE') continue;
      const lineOk = a.line === b.line || a.line === 'BOTH' || b.line === 'BOTH';
      if (!lineOk) continue;
      const shared = a.sections.filter((s) => b.sections.includes(s));
      if (shared.length) pairs.push({ a: a.id, b: b.id, sections: shared });
    }
  }
  return pairs;
}
