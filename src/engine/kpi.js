/**
 * Key performance indicators computed from a plan (never typed in).
 */
import { MIN_PER_DAY } from './time.js';

export const KPI_ASSUMPTIONS = {
  rupeePerWeightedDelayMinute: 1250, // ₹ per class-weighted train-delay minute (crew, energy, path cost) — an assumption, editable
  rupeePerBlockHourSaved: 18000,     // ₹ opportunity value of one section-hour of line availability on an HDN route
  co2KgPerTsrTrainMinute: 0.9        // extra traction energy of braking/accelerating through a TSR
};

export function computeKpis(plan, corridor, tasks, assumptions = KPI_ASSUMPTIONS) {
  const days = plan.days;
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const closureBlocks = plan.blocks.filter((b) => b.lineClosure);
  const blockCount = closureBlocks.length;
  const totalBlockMin = closureBlocks.reduce((s, b) => s + b.spanMin, 0);
  const sectionLineMinLost = closureBlocks.reduce((s, b) => s + b.spanMin * b.sections.length * (b.line === 'BOTH' ? 2 : 1), 0);
  const capacity = corridor.blockSections.length * corridor.lines.length * MIN_PER_DAY * days;
  const availability = 1 - sectionLineMinLost / capacity;

  const scheduledIds = new Set(plan.scheduled.map((s) => s.taskId));
  const scheduledTasks = tasks.filter((t) => scheduledIds.has(t.id));
  const deferredTasks = tasks.filter((t) => !scheduledIds.has(t.id));
  const byDay = new Map(plan.scheduled.map((s) => [s.taskId, s.day]));

  const highRisk = tasks.filter((t) => t.risk.arci >= 0.65);
  const highWithin72 = highRisk.filter((t) => byDay.has(t.id) && byDay.get(t.id) <= 2).length;
  const mandatory = tasks.filter((t) => t.risk.mandatory);
  const mandatoryDone = mandatory.filter((t) => byDay.has(t.id) && byDay.get(t.id) <= Math.max(0, t.dueDay)).length;
  const withConfidence = plan.blocks.filter((b) => b.confidence);
  const meanBlockConfidence = withConfidence.length ? withConfidence.reduce((s, b) => s + b.confidence.overall, 0) / withConfidence.length : null;

  const closureTasks = scheduledTasks.filter((t) => t.closure === 'LINE');
  const coLocatedTaskIds = new Set(plan.blocks.filter((b) => b.coLocated).flatMap((b) => b.tasks.map((x) => x.id)));
  const coLocatedClosure = closureTasks.filter((t) => coLocatedTaskIds.has(t.id)).length;
  const colocationRate = closureTasks.length ? coLocatedClosure / closureTasks.length : 0;
  const deptsPerBlock = blockCount ? closureBlocks.reduce((s, b) => s + b.departments.length, 0) / blockCount : 0;

  const weightedDelay = plan.blocks.reduce((s, b) => s + b.weightedDelayMin, 0);
  const rawDelay = plan.blocks.reduce((s, b) => s + b.rawDelayMin, 0);
  const trainsAffected = plan.blocks.reduce((s, b) => s + b.affectedTrains.length, 0);
  const goodsRegulated = plan.blocks.reduce((s, b) => s + b.affectedTrains.filter((t) => t.mode === 'REGULATED').length, 0);

  // TSR exposure: task-days a speed restriction stays in force in the horizon
  let tsrDays = 0;
  let tsrTasks = 0;
  for (const t of tasks) {
    if (!t.tsrKmph) continue;
    tsrTasks++;
    tsrDays += byDay.has(t.id) ? byDay.get(t.id) : days;
  }
  const tsrTrainMinutes = tasks.filter((t) => t.tsrKmph).reduce((s, t) => s + (plan.tsrLossPerDay && plan.tsrLossPerDay[t.id] ? plan.tsrLossPerDay[t.id] * (byDay.has(t.id) ? byDay.get(t.id) : days) : 0), 0);

  const meanDayImmediate = avg(tasks.filter((t) => t.risk.urgency === 'IMMEDIATE' || t.risk.urgency === 'HIGH').map((t) => (byDay.has(t.id) ? byDay.get(t.id) + 1 : days + 1)));
  const arciCleared = scheduledTasks.reduce((s, t) => s + t.risk.arci, 0);
  const arciTotal = tasks.reduce((s, t) => s + t.risk.arci, 0);

  // machine utilisation (minutes used / available minutes over horizon, 8 h shifts)
  const mu = plan.machineUse || {};
  const machineMinutes = Object.values(mu).reduce((s, list) => s + list.reduce((a, u) => a + (u.end - u.start), 0), 0);

  return {
    days,
    blockCount,
    totalBlockHours: totalBlockMin / 60,
    avgBlockMin: blockCount ? totalBlockMin / blockCount : 0,
    sectionLineHoursLost: sectionLineMinLost / 60,
    availability,
    tasksTotal: tasks.length,
    tasksScheduled: scheduledTasks.length,
    tasksDeferred: deferredTasks.length,
    highRiskTotal: highRisk.length,
    highRiskWithin72h: highWithin72,
    highRiskWithin72hRate: highRisk.length ? highWithin72 / highRisk.length : 1,
    mandatoryTotal: mandatory.length,
    mandatoryCompliant: mandatoryDone,
    safetyConflicts: Array.isArray(plan.safetyConflicts) ? plan.safetyConflicts.length : mandatory.length - mandatoryDone,
    meanBlockConfidence,
    colocationRate,
    coLocatedBlocks: closureBlocks.filter((b) => b.coLocated).length,
    deptsPerBlock,
    weightedDelayMin: weightedDelay,
    rawDelayMin: rawDelay,
    trainsAffected,
    goodsRegulated,
    premiumConflicts: plan.blocks.reduce((s, b) => s + b.premiumConflicts, 0),
    tsrTasks,
    tsrDays,
    tsrTrainMinutes,
    meanDaysToClearUrgent: meanDayImmediate,
    arciClearedShare: arciTotal ? arciCleared / arciTotal : 0,
    machineHours: machineMinutes / 60,
    estDelayCostRupees: weightedDelay * assumptions.rupeePerWeightedDelayMinute,
    estAvailabilityValueRupees: (capacity / 60 - sectionLineMinLost / 60) * 0, // placeholder for absolute; deltas are computed in compareKpis
    assumptions
  };
}

function avg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

/** Differences that matter, AI vs baseline, with a plain-English verdict per metric. */
export function compareKpis(ai, base, assumptions = KPI_ASSUMPTIONS) {
  const d = (k) => ai[k] - base[k];
  const pct = (k) => (base[k] ? (ai[k] - base[k]) / base[k] : 0);
  const hoursSaved = base.sectionLineHoursLost - ai.sectionLineHoursLost;
  return {
    availabilityPoints: (ai.availability - base.availability) * 100,
    sectionLineHoursSaved: hoursSaved,
    blocksAvoided: base.blockCount - ai.blockCount,
    blockHoursDelta: d('totalBlockHours'),
    tasksScheduledDelta: d('tasksScheduled'),
    highRiskWithin72hDelta: d('highRiskWithin72h'),
    colocationRateDelta: ai.colocationRate - base.colocationRate,
    weightedDelayDelta: d('weightedDelayMin'),
    weightedDelayPct: pct('weightedDelayMin'),
    tsrDaysDelta: d('tsrDays'),
    tsrTrainMinutesDelta: d('tsrTrainMinutes'),
    trainsAffectedDelta: d('trainsAffected'),
    estRupeesSaved: Math.max(0, hoursSaved) * assumptions.rupeePerBlockHourSaved + Math.max(0, base.weightedDelayMin - ai.weightedDelayMin) * assumptions.rupeePerWeightedDelayMinute + Math.max(0, base.tsrTrainMinutes - ai.tsrTrainMinutes) * assumptions.rupeePerWeightedDelayMinute * 0.4,
    co2KgSaved: Math.max(0, base.tsrTrainMinutes - ai.tsrTrainMinutes) * assumptions.co2KgPerTsrTrainMinute
  };
}
