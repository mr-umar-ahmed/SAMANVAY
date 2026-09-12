/**
 * Execution feedback loop: the block execution log (planned vs. actual block
 * duration per work type) is used to calibrate the duration the optimiser
 * reserves for a task. Exponential smoothing keeps the estimate responsive
 * to the latest gangs / machines without over-reacting to one bad night.
 *
 * The same records give the spread of actual durations: the mean and the
 * standard deviation of log(actual / planned) per work type. The block
 * completion confidence models the actual work time as lognormal with these
 * parameters.
 */
import { DEFAULT_DURATION_SD } from './constants.js';

export function learnDurationFactors(executionLog, { alpha = 0.3, clamp = [0.8, 1.6] } = {}) {
  const byType = {};
  for (const rec of executionLog || []) {
    if (!rec.plannedMin || !rec.actualMin) continue;
    const ratio = rec.actualMin / rec.plannedMin;
    if (!byType[rec.workType]) byType[rec.workType] = { factor: ratio, samples: 0, sumRatio: 0, overruns: 0, logs: [] };
    const t = byType[rec.workType];
    t.factor = t.samples === 0 ? ratio : alpha * ratio + (1 - alpha) * t.factor;
    t.samples += 1;
    t.sumRatio += ratio;
    t.logs.push(Math.log(ratio));
    if (ratio > 1.1) t.overruns += 1;
  }
  for (const k of Object.keys(byType)) {
    const t = byType[k];
    t.factor = Math.min(Math.max(t.factor, clamp[0]), clamp[1]);
    t.meanRatio = t.sumRatio / t.samples;
    t.overrunRate = t.overruns / t.samples;
    const n = t.logs.length;
    const meanLog = t.logs.reduce((a, b) => a + b, 0) / n;
    const varLog = n > 1 ? t.logs.reduce((a, b) => a + (b - meanLog) ** 2, 0) / (n - 1) : 0;
    t.n = n;
    t.meanLog = meanLog;
    t.sdLog = Math.sqrt(varLog);
    delete t.logs;
  }
  return byType;
}

/** Duration the plan should reserve for a task (rounded to 5 minutes). */
export function calibratedDuration(baseMin, workType, factors) {
  const f = factors && factors[workType] ? factors[workType].factor : 1;
  return Math.round((baseMin * f) / 5) * 5;
}

/**
 * Lognormal parameters of actual / planned work duration for a work type.
 * Falls back to a zero-bias, DEFAULT_DURATION_SD spread when fewer than 3
 * execution records exist (`defaulted: true`).
 */
export function durationDispersion(workType, factors) {
  const f = factors && factors[workType];
  if (!f || !(f.n >= 3)) return { mu: f && f.n ? f.meanLog : 0, sd: DEFAULT_DURATION_SD, n: f ? f.n || 0 : 0, defaulted: true };
  return { mu: f.meanLog, sd: Math.max(0.02, f.sdLog), n: f.n, defaulted: false };
}
