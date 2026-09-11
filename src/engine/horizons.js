/**
 * Multi-horizon assembly.
 *
 *  weekly  – 7-day tactical plan: every non-capital task, full optimiser.
 *  monthly – 30-day plan: non-capital tasks plus capital works that fall in
 *            the first four weeks of the rolling programme (expanded into one
 *            working-day sub-task per day), coarser search.
 *  rolling – 26-week Rolling Block Programme: capital works placed by target
 *            week, JPO 10-week notice, machine availability, and a
 *            Weibull-based forecast of the preventive workload each week.
 */
import { planHorizon } from './scheduler.js';
import { planBaseline } from './baseline.js';
import { computeKpis, compareKpis } from './kpi.js';
import { weibullHazard } from './weibull.js';
import { addDays, isoDate, fmtDate, isoWeek } from './time.js';
import { RULES, WORK_TYPES, MACHINE_TYPES } from './constants.js';

export function buildWeekly(ctx, opts = {}) {
  const tasks = ctx.tasks.filter((t) => !t.capital);
  const common = { corridor: ctx.corridor, feeds: ctx.feeds, tasks, days: 7, planStart: ctx.planStart, weights: opts.weights, rules: opts.rules, fixedBlocks: opts.fixedBlocks };
  const ai = planHorizon({ ...common, iterations: opts.iterations ?? 6000, seed: opts.seed ?? 7, label: 'weekly-ai' });
  const baseline = planBaseline({ ...common, label: 'weekly-baseline' });
  const tsrLossPerDay = Object.fromEntries(tasks.map((t) => [t.id, ctx.tsrLossPerDay[t.id] || 0]));
  ai.tsrLossPerDay = tsrLossPerDay;
  baseline.tsrLossPerDay = tsrLossPerDay;
  const kpis = computeKpis(ai, ctx.corridor, tasks);
  const baseKpis = computeKpis(baseline, ctx.corridor, tasks);
  return { horizon: 'weekly', tasks, ai, baseline, kpis, baseKpis, delta: compareKpis(kpis, baseKpis) };
}

/** Expand a capital work into per-day sub-tasks for the monthly plan. */
function expandCapital(task, weeksAhead) {
  const out = [];
  const nDays = Math.min(task.workingDaysNeeded || 1, 10);
  for (let i = 0; i < nDays; i++) {
    out.push({ ...task, id: `${task.id}#${i + 1}`, groupId: task.id, label: `${task.label} — day ${i + 1}/${nDays}`, dueDay: Math.max(7, weeksAhead * 7 + 6), daysOverdue: 0, risk: { ...task.risk, mandatory: false } });
  }
  return out;
}

export function buildMonthly(ctx, opts = {}) {
  const rolling = ctx.rolling || buildRolling(ctx);
  const capitalInMonth = rolling.entries.filter((e) => e.week <= 4 && e.status !== 'NOTICE_SHORTFALL');
  const capitalTasks = capitalInMonth.flatMap((e) => expandCapital(ctx.tasks.find((t) => t.id === e.taskId), e.week));
  const tasks = ctx.tasks.filter((t) => !t.capital).concat(capitalTasks);
  const common = { corridor: ctx.corridor, feeds: ctx.feeds, tasks, days: 30, planStart: ctx.planStart, weights: opts.weights, rules: opts.rules };
  const ai = planHorizon({ ...common, iterations: opts.iterations ?? 3500, seed: opts.seed ?? 11, label: 'monthly-ai' });
  const baseline = planBaseline({ ...common, label: 'monthly-baseline' });
  const tsrLossPerDay = Object.fromEntries(tasks.map((t) => [t.id, ctx.tsrLossPerDay[t.groupId || t.id] || 0]));
  ai.tsrLossPerDay = tsrLossPerDay;
  baseline.tsrLossPerDay = tsrLossPerDay;
  const kpis = computeKpis(ai, ctx.corridor, tasks);
  const baseKpis = computeKpis(baseline, ctx.corridor, tasks);
  // calendar: per day summary
  const calendar = [];
  for (let d = 0; d < 30; d++) {
    const date = addDays(ctx.planStart, d);
    const blocks = ai.blocks.filter((b) => b.day === d);
    calendar.push({ day: d, date: isoDate(date), label: fmtDate(date), dow: date.getDay(), blocks, closureMin: blocks.filter((b) => b.lineClosure).reduce((s, b) => s + b.spanMin, 0), departments: [...new Set(blocks.flatMap((b) => b.departments))], capital: blocks.some((b) => b.tasks.some((t) => t.id.includes('#'))) });
  }
  return { horizon: 'monthly', tasks, ai, baseline, kpis, baseKpis, delta: compareKpis(kpis, baseKpis), calendar };
}

/**
 * 26-week Rolling Block Programme.
 */
export function buildRolling(ctx) {
  const corridor = ctx.corridor;
  const capital = ctx.tasks.filter((t) => t.capital).slice().sort((a, b) => (a.targetWeek || 26) - (b.targetWeek || 26));
  const weeks = [];
  for (let w = 1; w <= 26; w++) {
    const start = addDays(ctx.planStart, (w - 1) * 7);
    weeks.push({ week: w, isoWeek: isoWeek(start), start: isoDate(start), end: isoDate(addDays(start, 6)), label: `Wk ${w} · ${fmtDate(start)}`, entries: [], machineLoad: {}, megaBlocks: 0 });
  }
  const machineWeeklyCap = { PQRS: 1, WIRING_TRAIN: 1, CRANE: 1, BCM: 2, CSM: 3, TOWER_WAGON: 3, UNIMAT: 2, RGM: 2 };
  const entries = [];
  for (const t of capital) {
    const regulationNeeded = t.workType === 'BRIDGE_GIRDER' || t.workType === 'CTR' || t.totalMin > 300;
    const noticeNeeded = regulationNeeded ? RULES.noticeWeeksForRegulation : 3;
    const noticeGiven = t.noticeWeeksGiven || 0;
    let week = Math.max(t.targetWeek || 6, regulationNeeded ? Math.max(1, noticeNeeded - noticeGiven + 1) : 1);
    // machine capacity per week
    let guard = 0;
    while (guard++ < 26) {
      const wk = weeks[Math.min(25, week - 1)];
      const load = wk.machineLoad[t.machine] || 0;
      if ((!t.machine || load < (machineWeeklyCap[t.machine] || 2)) && wk.megaBlocks < 2) break;
      week++;
      if (week > 26) {
        week = 26;
        break;
      }
    }
    const wk = weeks[week - 1];
    if (t.machine) wk.machineLoad[t.machine] = (wk.machineLoad[t.machine] || 0) + 1;
    wk.megaBlocks++;
    let status;
    if (regulationNeeded && noticeGiven < noticeNeeded && week < noticeNeeded - noticeGiven + 1) status = 'NOTICE_SHORTFALL';
    else if (week <= 10) status = 'LOCKED';
    else status = 'PROPOSED';
    const e = { taskId: t.id, week, weekLabel: wk.label, start: wk.start, end: wk.end, label: t.label, dept: t.dept, workType: t.workType, sectionLabel: t.sectionLabel, line: t.line, startKm: t.startKm, endKm: t.endKm, workingDays: t.workingDaysNeeded, dailyBlockMin: t.totalMin, machine: t.machine ? MACHINE_TYPES[t.machine].label : '—', regulationNeeded, noticeNeeded, noticeGiven, status, targetWeek: t.targetWeek, arci: t.risk.arci };
    wk.entries.push(e);
    entries.push(e);
  }
  // Weibull workload forecast: expected preventive tasks per week per asset class
  const forecast = weeks.map((wk) => {
    const per = {};
    let total = 0;
    for (const [cls, m] of Object.entries(ctx.models.weibull)) {
      const population = ctx.assetPopulation[cls] || 0;
      const t = ctx.meanAge[cls] || m.eta * 0.5;
      const h = weibullHazard(t + (wk.week - 1) * 7, m.beta, m.eta) * 7; // weekly hazard
      const expected = population * Math.min(1, h);
      per[cls] = expected;
      total += expected;
    }
    return { week: wk.week, per, total };
  });
  return { entries, weeks, forecast, noticeRule: RULES.noticeWeeksForRegulation };
}

export function workTypeLabel(wt) {
  return WORK_TYPES[wt] ? WORK_TYPES[wt].label : wt;
}
