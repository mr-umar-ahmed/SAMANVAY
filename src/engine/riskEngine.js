/**
 * ARCI — Asset Risk & Criticality Index.
 *
 *   ARCI = clamp01( √S_safe × ( 0.30·P_f' + 0.25·ODI + 0.25·O_due + 0.20·E_ml ) + TSR_uplift )
 *
 *   P_f'   blended failure probability: 0.6 × Weibull conditional failure
 *          probability over the next 30 days (fitted per asset class from the
 *          failure register) + 0.4 × measured condition index.
 *   ODI    operational disruption index: class-weighted trains/day crossing
 *          the asset's block sections on its line, normalised against the
 *          busiest section of the corridor, plus the speed-restriction loss.
 *   O_due  overdue statutory penalty: (Δ/Δmax)^1.5 capped at 1.
 *   E_ml   logistic-regression probability that the defect escalates to a
 *          (stricter) TSR in 30 days if not attended.
 *   S_safe safety severity of the work type (USFD IMR & interlocking = 1.0).
 *
 * Mandatory rule: safety ≥ 0.95 with the work due (or a TSR already in force)
 * floors ARCI at 0.92 — these are scheduled first regardless of cost.
 */
import { fitWeibull, conditionalFailure, weibullSummary } from './weibull.js';
import { LogisticModel } from './logistic.js';
import { ASSET_CLASS_PARAMS } from './dataFactory.js';

export const URGENCY = [
  { key: 'IMMEDIATE', min: 0.85, label: 'Immediate (≤ 24 h)', days: 1 },
  { key: 'HIGH', min: 0.65, label: 'High (≤ 72 h)', days: 3 },
  { key: 'TACTICAL', min: 0.4, label: 'Tactical (this week)', days: 7 },
  { key: 'STRATEGIC', min: 0, label: 'Strategic (RBP)', days: 30 }
];

export function urgencyOf(arci) {
  return URGENCY.find((u) => arci >= u.min) || URGENCY[URGENCY.length - 1];
}

/** Fit the learning models from the historical registers. */
export function buildRiskModels(feeds, { holdout = 0.25 } = {}) {
  const weibull = {};
  for (const [cls, recs] of Object.entries(feeds.failureHistory || {})) {
    const fit = fitWeibull(recs);
    weibull[cls] = { ...fit, ...weibullSummary(fit.beta, fit.eta), truth: ASSET_CLASS_PARAMS[cls] || null, label: (ASSET_CLASS_PARAMS[cls] || {}).label || cls };
  }
  const hist = feeds.escalationHistory || [];
  const cut = Math.floor(hist.length * (1 - holdout));
  const train = hist.slice(0, cut);
  const test = hist.slice(cut);
  const escalation = new LogisticModel().fit(train);
  const metrics = escalation.evaluate(test);
  const trainMetrics = escalation.evaluate(train);
  escalation.metrics = metrics;
  return { weibull, escalation, escalationMetrics: { test: metrics, train: trainMetrics, nTrain: train.length, nTest: test.length } };
}

/**
 * Class-weighted traffic per (section, line) per day from the timetable, used
 * for the operational disruption index.
 */
export function trafficDensity(corridor, timetable, freight, days = 7) {
  const dens = {};
  const key = (s, l) => `${s}:${l}`;
  for (const t of timetable) {
    const runs = t.runsOn.reduce((a, b) => a + b, 0) / 7;
    for (const p of t.passages) {
      const k = key(p.sectionIndex, t.line);
      dens[k] = (dens[k] || 0) + t.weight * runs;
    }
  }
  const fdays = Math.max(1, Math.min(days, 1 + Math.max(0, ...freight.map((f) => f.day))));
  for (const f of freight) {
    if (f.day >= days) continue;
    for (const p of f.passages) {
      const k = key(p.sectionIndex, f.line);
      dens[k] = (dens[k] || 0) + f.weight / fdays;
    }
  }
  const max = Math.max(1, ...Object.values(dens));
  return { dens, max, key };
}

export function scoreTask(task, models, density, corridor) {
  const w = models.weibull[task.assetClass] || { beta: 1.5, eta: 1500 };
  const pfWindow = conditionalFailure(task.ageDays, 30, w.beta, w.eta);
  const pfBlend = 0.6 * pfWindow + 0.4 * task.conditionIndex;

  const lines = task.line === 'BOTH' ? ['UP', 'DN'] : [task.line];
  let traffic = 0;
  for (const s of task.sections) for (const l of lines) traffic += density.dens[density.key(s, l)] || 0;
  traffic /= lines.length;
  const trafficNorm = Math.min(1, traffic / density.max);
  const tsrLoss = task.tsrKmph ? Math.min(1, 1 - task.tsrKmph / corridor.mpsKmph) : 0;
  const odi = Math.min(1, 0.65 * trafficNorm + 0.35 * tsrLoss + (corridor.densityClass.startsWith('HDN-1') ? 0.05 : 0));

  const dMax = Math.max(3, task.mandatoryWithinDays);
  const overdue = task.daysOverdue > 0 ? Math.min(1, Math.pow(task.daysOverdue / dMax, 1.5)) : 0;

  const features = {
    daysOverdue: task.daysOverdue,
    conditionIndex: task.conditionIndex,
    gmtLoad: task.metrics.gmt || 35,
    ageRatio: task.ageDays / (w.eta || 1),
    safety: task.safety,
    hasTsr: task.tsrKmph ? 1 : 0
  };
  const escalation = models.escalation.trained ? models.escalation.predict(features) : 0.5;

  let arci = Math.sqrt(task.safety) * (0.3 * pfBlend + 0.25 * odi + 0.25 * overdue + 0.2 * escalation);
  const tsrUplift = task.tsrKmph ? 0.1 : 0;
  arci += tsrUplift;
  let mandatory = false;
  if (task.safety >= 0.95 && (task.daysOverdue >= 0 || task.tsrKmph)) {
    arci = Math.max(arci, 0.92);
    mandatory = true;
  }
  arci = Math.min(1, Math.max(0, arci));
  const urgency = urgencyOf(arci);

  const explanation = [
    { key: 'pf', label: 'Failure probability (30 d, Weibull)', value: pfWindow, weight: 0.3 * 0.6, text: `β=${w.beta.toFixed(2)}, η=${Math.round(w.eta)} d; asset age ${task.ageDays} d` },
    { key: 'condition', label: 'Measured condition index', value: task.conditionIndex, weight: 0.3 * 0.4, text: conditionText(task) },
    { key: 'odi', label: 'Operational disruption index', value: odi, weight: 0.25, text: `${traffic.toFixed(1)} weighted trains/day on ${task.sectionLabel}${task.tsrKmph ? `, TSR ${task.tsrKmph} km/h` : ''}` },
    { key: 'overdue', label: 'Overdue penalty', value: overdue, weight: 0.25, text: task.daysOverdue > 0 ? `${task.daysOverdue} d overdue against ${task.mandatoryWithinDays} d rule` : `due in ${-task.daysOverdue} d` },
    { key: 'escalation', label: 'ML escalation probability', value: escalation, weight: 0.2, text: 'logistic model on historical escalation register' },
    { key: 'safety', label: 'Safety severity multiplier', value: task.safety, weight: null, text: mandatory ? 'Mandatory: scheduled first' : 'square root scales the weighted sum' }
  ];

  task.risk = { pfWindow, pfBlend, odi, traffic, overdue, escalation, tsrUplift, arci, urgency: urgency.key, urgencyLabel: urgency.label, mandatory, weibull: { beta: w.beta, eta: w.eta }, explanation, mlContributions: models.escalation.trained ? models.escalation.contributions(features) : [] };
  return task.risk;
}

function conditionText(task) {
  const m = task.metrics;
  if (m.usfdClass) return `USFD class ${m.usfdClass}: ${m.flawType}`;
  if (m.tgi) return `TGI ${m.tgi} (limit 36 for 130 km/h)`;
  if (m.wireThicknessMm) return `contact wire ${m.wireThicknessMm.toFixed(2)} mm (min 8.25)`;
  if (m.backlashMm) return `backlash ${m.backlashMm.toFixed(1)} mm, ${m.failures90d} failures/90 d`;
  if (m.failures90d !== undefined) return `${m.failures90d} failures in 90 d, MTBF ${m.mtbfHours} h`;
  if (m.flashoverCount90d !== undefined) return `${m.flashoverCount90d} flashovers/90 d`;
  if (m.corrosionGrade) return `corrosion grade ${m.corrosionGrade}`;
  if (m.oilBdvKv) return `oil BDV ${m.oilBdvKv} kV, ${m.oilTempC} °C`;
  return `condition index ${task.conditionIndex.toFixed(2)}`;
}

export function scoreAll(tasks, models, density, corridor) {
  for (const t of tasks) scoreTask(t, models, density, corridor);
  return tasks.slice().sort((a, b) => b.risk.arci - a.risk.arci);
}
