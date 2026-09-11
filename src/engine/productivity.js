/**
 * Execution feedback loop: the block execution log (planned vs. actual block
 * duration per work type) is used to calibrate the duration the optimiser
 * reserves for a task. Exponential smoothing keeps the estimate responsive
 * to the latest gangs / machines without over-reacting to one bad night.
 */
export function learnDurationFactors(executionLog, { alpha = 0.3, clamp = [0.8, 1.6] } = {}) {
  const byType = {};
  for (const rec of executionLog) {
    if (!rec.plannedMin || !rec.actualMin) continue;
    const ratio = rec.actualMin / rec.plannedMin;
    if (!byType[rec.workType]) byType[rec.workType] = { factor: ratio, samples: 0, sumRatio: 0, overruns: 0 };
    const t = byType[rec.workType];
    t.factor = t.samples === 0 ? ratio : alpha * ratio + (1 - alpha) * t.factor;
    t.samples += 1;
    t.sumRatio += ratio;
    if (ratio > 1.1) t.overruns += 1;
  }
  for (const k of Object.keys(byType)) {
    const t = byType[k];
    t.factor = Math.min(Math.max(t.factor, clamp[0]), clamp[1]);
    t.meanRatio = t.sumRatio / t.samples;
    t.overrunRate = t.overruns / t.samples;
  }
  return byType;
}

/** Duration the plan should reserve for a task (rounded to 5 minutes). */
export function calibratedDuration(baseMin, workType, factors) {
  const f = factors && factors[workType] ? factors[workType].factor : 1;
  return Math.round((baseMin * f) / 5) * 5;
}
