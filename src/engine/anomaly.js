/**
 * Anomaly detection over the ingested registers and the learning data.
 * Deterministic (no RNG): the same inputs always give the same anomalies.
 *
 *   OVERRUN       – block execution log: per work type, the actual / planned
 *                   duration ratio is scored with a robust z-score
 *                   z = 0.6745 (r − median) / MAD. Records with |z| > 3 or a
 *                   ratio above 1.5 are flagged (only when the work type has
 *                   at least `minSamples` records), and so are work types
 *                   whose median ratio exceeds 1.2 (a systematic overrun).
 *   FAILURE_SPIKE – per asset class, failures in the recent window of the
 *                   failure log vs. the count expected from the fitted Weibull
 *                   hazard of the in-service population: E = Σ[H(a) − H(a−W)],
 *                   H(t) = (t/η)^β, a = ages of the assets still in service
 *                   (censored records of the failure register). Flagged when
 *                   the Poisson upper-tail probability P(X ≥ observed | E) < 0.05.
 *   DATA          – register values that are physically impossible, values
 *                   beyond maintenance limits, and inspections past their cycle.
 */
import { WORK_TYPES } from './constants.js';
import { PLAUSIBLE_RANGES, recordIdOf } from './normalizer.js';

/**
 * Maintenance limits (possible values that need attention). Gauge: BG
 * nominal 1676 mm, −6 / +15 mm; contact wire: condemning thickness 8.25 mm.
 */
export const MAINTENANCE_LIMITS = {
  gaugeMm: { min: 1670, max: 1691, unit: 'mm', what: 'track gauge', rule: 'BG 1676 mm, −6 / +15 mm' },
  wireThicknessMm: { min: 8.25, max: 12.5, unit: 'mm', what: 'contact-wire thickness', rule: 'condemning limit 8.25 mm' }
};

const SEV_ORDER = { high: 0, medium: 1, low: 2 };
const KIND_ORDER = { FAILURE_SPIKE: 0, OVERRUN: 1, DATA: 2 };
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;

export function median(xs) {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Median absolute deviation. */
export function mad(xs, med = median(xs)) {
  return median(xs.map((x) => Math.abs(x - med)));
}

function logFactorial(k) {
  let s = 0;
  for (let i = 2; i <= k; i++) s += Math.log(i);
  return s;
}

/** P(X ≥ k) for X ~ Poisson(lambda). */
export function poissonUpperTail(k, lambda) {
  if (k <= 0) return 1;
  if (!(lambda > 0)) return 0;
  let cdf = 0;
  for (let i = 0; i < k; i++) cdf += Math.exp(-lambda + i * Math.log(lambda) - logFactorial(i));
  return Math.max(0, Math.min(1, 1 - cdf));
}

const labelOf = (wt) => (WORK_TYPES[wt] ? WORK_TYPES[wt].label : wt);

function overrunAnomalies(executionLog, minSamples) {
  const out = [];
  const byType = {};
  executionLog.forEach((r, idx) => {
    if (!r || !(r.plannedMin > 0) || !(r.actualMin > 0)) return;
    (byType[r.workType] = byType[r.workType] || []).push({ r, idx, ratio: r.actualMin / r.plannedMin });
  });
  for (const wt of Object.keys(byType).sort()) {
    const list = byType[wt];
    const n = list.length;
    if (n < minSamples) continue;
    const ratios = list.map((x) => x.ratio);
    const med = median(ratios);
    const m = mad(ratios, med);
    for (const x of list) {
      const z = m > 0 ? (0.6745 * (x.ratio - med)) / m : 0;
      if (Math.abs(z) > 3 || x.ratio > 1.5) {
        const high = x.ratio > 1.5 || z > 3;
        const ref = x.r.id || x.r.blockId || `${wt}#${x.idx + 1}`;
        const pct = Math.round(Math.abs(x.ratio - 1) * 100);
        const vsPlan = x.ratio >= 1 ? `${pct} % over plan` : `${pct} % under plan`;
        out.push({
          id: `AN-OVERRUN-${ref}`,
          kind: 'OVERRUN',
          severity: x.ratio > 1.5 ? 'high' : high ? 'medium' : 'low',
          title: high ? `${labelOf(wt)}: block overran ${pct} %` : `${labelOf(wt)}: block far shorter than usual (${vsPlan})`,
          detail: `Actual ${x.r.actualMin} min against ${x.r.plannedMin} min planned (ratio ${r2(x.ratio)}). For this work type the median ratio is ${r2(med)} and the MAD ${r3(m)} over ${n} records, so the robust z-score is ${r2(z)}${x.r.daysAgo !== undefined ? `; recorded ${x.r.daysAgo} days ago` : ''}${x.r.overrunReason ? `; reason given: ${x.r.overrunReason}` : ''}.${high ? '' : ' Check the entry before it trains the duration factor.'}`,
          ref,
          workType: wt,
          value: r3(x.ratio),
          expected: r3(med),
          z: r2(z)
        });
      }
    }
    if (med > 1.2) {
      out.push({
        id: `AN-OVERRUN-TYPE-${wt}`,
        kind: 'OVERRUN',
        severity: med > 1.35 ? 'high' : 'medium',
        title: `${labelOf(wt)}: blocks overrun systematically`,
        detail: `Median actual / planned ratio ${r2(med)} over ${n} executed blocks (threshold 1.2). ${list.filter((x) => x.ratio > 1.1).length} of ${n} ran more than 10 % over. The duration calibration already stretches this work; review the standard duration or the resources sent.`,
        ref: wt,
        workType: wt,
        value: r3(med),
        expected: 1
      });
    }
  }
  return out;
}

function failureSpikeAnomalies(failureLog, failureHistory, weibull, alpha) {
  const out = [];
  if (!failureLog || !Array.isArray(failureLog.events)) return out;
  const W = failureLog.windowDays || 90;
  const observedBy = {};
  for (const e of failureLog.events) observedBy[e.assetClass] = (observedBy[e.assetClass] || 0) + 1;
  for (const cls of Object.keys(weibull || {}).sort()) {
    const m = weibull[cls];
    if (!m || !(m.beta > 0) || !(m.eta > 0)) continue;
    const ages = (failureHistory[cls] || []).filter((r) => !r.failed).map((r) => r.t);
    if (!ages.length) continue;
    const H = (t) => Math.pow(Math.max(0, t) / m.eta, m.beta);
    const expected = ages.reduce((a, t) => a + H(t) - H(t - W), 0);
    const observed = observedBy[cls] || 0;
    if (observed <= expected) continue;
    const p = poissonUpperTail(observed, expected);
    if (p >= alpha) continue;
    const z = (observed - expected) / Math.sqrt(Math.max(expected, 1e-9));
    const label = m.label || cls;
    const sample = failureLog.events.filter((e) => e.assetClass === cls).slice(0, 3).map((e) => e.assetRef).filter(Boolean);
    const mult = failureLog.multipliers && failureLog.multipliers[cls];
    out.push({
      id: `AN-SPIKE-${cls}`,
      kind: 'FAILURE_SPIKE',
      severity: p < 0.001 ? 'high' : p < 0.01 ? 'medium' : 'low',
      title: `${label}: ${observed} failures in ${W} days, ${r2(observed / Math.max(expected, 1e-9))}× the expected rate`,
      detail: `Fitted Weibull β ${r2(m.beta)}, η ${Math.round(m.eta)} days over ${ages.length} assets in service gives ${r2(expected)} expected failures in the last ${W} days; ${observed} were logged. Poisson P(X ≥ ${observed}) = ${p < 0.0001 ? p.toExponential(1) : r3(p)} (< ${alpha}).${sample.length ? ` Recent: ${sample.join(', ')}.` : ''}${mult ? ` Seeded log: ${mult.reason}.` : ''}`,
      ref: cls,
      assetClass: cls,
      value: observed,
      expected: r2(expected),
      z: r2(z),
      p: Number(p.toPrecision(3))
    });
  }
  return out;
}

function dataAnomalies(feeds, taskBySource) {
  const out = [];
  for (const [sys, key] of [['TMS', 'tms'], ['SMMS', 'smms'], ['TDMS', 'tdms']]) {
    for (const rec of feeds[key] || []) {
      const rid = recordIdOf(rec) || '?';
      const taskId = taskBySource.get(rid) || undefined;
      for (const [field, r] of Object.entries(PLAUSIBLE_RANGES)) {
        const v = rec[field];
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        if (v < r.min || v > r.max) {
          out.push({ id: `AN-DATA-${rid}-${field}`, kind: 'DATA', severity: 'high', title: `${sys} ${rid}: ${r.what} ${v}${r.unit ? ` ${r.unit}` : ''} is physically impossible`, detail: `Possible range ${r.min}–${r.max}${r.unit ? ` ${r.unit}` : ''}. The value is treated as a keying or sensor error; the record needs correcting in ${sys}.`, ref: rid, system: sys, field, value: v, expected: r.min > 0 ? r.min : r.max, ...(taskId ? { taskId } : {}) });
          continue;
        }
        const lim = MAINTENANCE_LIMITS[field];
        if (lim && (v < lim.min || v > lim.max)) {
          out.push({ id: `AN-DATA-${rid}-${field}-LIMIT`, kind: 'DATA', severity: 'medium', title: `${sys} ${rid}: ${lim.what} ${v} ${lim.unit} beyond the maintenance limit`, detail: `Limit: ${lim.rule} (${lim.min}–${lim.max} ${lim.unit}). The value is possible but calls for attention or a speed restriction.`, ref: rid, system: sys, field, value: v, expected: v < lim.min ? lim.min : lim.max, ...(taskId ? { taskId } : {}) });
        }
      }
      const last = rec.lastInspectionDaysAgo;
      const cycle = rec.inspectionCycleDays;
      if (typeof last === 'number' && typeof cycle === 'number' && cycle > 0 && last > cycle) {
        const ratio = last / cycle;
        out.push({ id: `AN-DATA-${rid}-STALE`, kind: 'DATA', severity: ratio >= 2 ? 'high' : ratio >= 1.5 ? 'medium' : 'low', title: `${sys} ${rid}: inspection ${last - cycle} days past its cycle`, detail: `Last inspected ${last} days ago against a ${cycle}-day cycle for ${labelOf(rec.workType)} (${r2(ratio)}× the cycle). The condition data this record carries may be stale.`, ref: rid, system: sys, field: 'lastInspectionDaysAgo', value: last, expected: cycle, ...(taskId ? { taskId } : {}) });
      }
    }
  }
  return out;
}

/**
 * @param {object} input
 * @param {Array}  input.executionLog   planned vs actual records ({ workType, plannedMin, actualMin, daysAgo?, id?|blockId? })
 * @param {object} input.failureHistory failure register per asset class ({ t, failed }[])
 * @param {object} input.weibullModels  fitted models per class (models.weibull) or the whole models object
 * @param {Array}  [input.tasks]        normalised tasks (links DATA anomalies to task ids)
 * @param {object} [input.feeds]        feeds (tms / smms / tdms registers, failureLog)
 * @param {object} [input.failureLog]   overrides feeds.failureLog
 * @param {number} [input.minSamples=5] minimum records per work type for OVERRUN
 * @param {number} [input.alpha=0.05]   significance for FAILURE_SPIKE
 * @returns {Array<{id,kind,severity,title,detail,ref?,value?,expected?,z?}>}
 */
export function detectAnomalies({ executionLog, failureHistory, weibullModels, tasks = [], feeds = {}, failureLog, minSamples = 5, alpha = 0.05 } = {}) {
  const weibull = weibullModels && weibullModels.weibull ? weibullModels.weibull : weibullModels || {};
  const history = failureHistory || feeds.failureHistory || {};
  const taskBySource = new Map((tasks || []).map((t) => [t.sourceId, t.id]));
  const all = [
    ...overrunAnomalies(executionLog || feeds.executionLog || [], minSamples),
    ...failureSpikeAnomalies(failureLog || feeds.failureLog, history, weibull, alpha),
    ...dataAnomalies(feeds, taskBySource)
  ];
  const seen = new Set();
  const out = [];
  for (const a of all) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
  }
  return out.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id.localeCompare(b.id));
}

/** Count of anomalies by kind (for KPI tiles). */
export function anomalyCounts(anomalies) {
  const c = { OVERRUN: 0, FAILURE_SPIKE: 0, DATA: 0, total: anomalies.length };
  for (const a of anomalies) c[a.kind] = (c[a.kind] || 0) + 1;
  return c;
}
