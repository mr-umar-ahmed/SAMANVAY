/**
 * Baseline: today's decentralised, manual BDMS practice — simulated so the
 * optimised plan is compared against something honest rather than a number
 * typed into a slide.
 *
 * Each department plans on its own, in request order (first-in, first-out),
 * with no knowledge of the other departments' demands. It asks for the
 * earliest window in which its work fits. The Section Controller then
 * reconciles the requisitions: when two departments ask for the same section,
 * line and day at overlapping times, the later requisition is pushed back
 * within the same gap if it still fits, otherwise it is refused and slips
 * out of the cycle. Nothing is bundled, so every requisition is its own
 * possession with its own setup and clearance.
 */
import { buildDayOccupancy, commonFreeWindows } from './occupancy.js';
import { evaluateWindow, tsrLossPerDay } from './delayModel.js';
import { RULES, DEFAULT_WEIGHTS } from './constants.js';
import { materialise } from './scheduler.js';

export function planBaseline({ corridor, feeds, tasks, days, planStart, rules = RULES, weights = DEFAULT_WEIGHTS, feedsForDay = null }) {
  const r = { ...RULES, ...rules };
  const dayOccs = [];
  // same weather as the optimised plan (fog nights re-time that day's trains), so the comparison stays like-for-like
  for (let d = 0; d < days; d++) dayOccs.push(buildDayOccupancy(corridor, feedsForDay ? feedsForDay(d) : feeds, d, planStart));
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const assign = new Map(tasks.map((t) => [t.id, null]));
  const granted = []; // {day, line, sections, start, end, dept}

  const overlapsGranted = (c, task) => granted.filter((g) => g.day === c.day && (g.line === c.line || g.line === 'BOTH' || c.line === 'BOTH') && g.sections.some((s) => task.sections.includes(s)) && Math.max(g.start, c.start) < Math.min(g.end, c.end));

  for (const dept of ['TMS', 'TDMS', 'SMMS']) {
    // FIFO by request date within the department
    const list = tasks.filter((t) => t.dept === dept).sort((a, b) => b.requestedDaysAgo - a.requestedDaysAgo);
    const deptUse = []; // machine/crew naive check: one job per machine type per day
    for (const t of list) {
      let chosen = null;
      outer: for (let d = 0; d < days; d++) {
        const lines = t.line === 'BOTH' ? ['BOTH'] : [t.line];
        for (const line of lines) {
          if (t.closure === 'NONE') {
            const c = { day: d, line, start: 540, end: 540 + t.totalMin };
            if (!deptUse.some((u) => u.day === d && u.crew === t.crew && Math.max(u.start, c.start) < Math.min(u.end, c.end))) {
              chosen = c;
              break outer;
            }
            continue;
          }
          const ws = commonFreeWindows(dayOccs[d], t.sections, line, r.minBlockMin, r.headwayMarginMin);
          for (const w of ws) {
            let c = { day: d, line, start: w.start, end: w.start + t.totalMin };
            // controller reconciliation: push back behind an earlier requisition if possible
            let clash = overlapsGranted(c, t);
            let guard = 0;
            while (clash.length && guard++ < 5) {
              const latest = Math.max(...clash.map((g) => g.end)) + 30;
              c = { day: d, line, start: latest, end: latest + t.totalMin };
              if (c.end > w.end + 0) break; // does not fit the gap any more → refused for this window
              clash = overlapsGranted(c, t);
            }
            if (clash.length) continue;
            if (c.end > w.end + 60) continue; // would eat into train paths beyond what a controller grants
            const ev = evaluateWindow(dayOccs[d], t.sections, line, c.start, c.end, r);
            if (!ev.feasible) continue;
            if (t.machine && deptUse.some((u) => u.day === d && u.machine === t.machine && Math.max(u.start, c.start) < Math.min(u.end, c.end))) continue;
            if (t.crew && deptUse.some((u) => u.day === d && u.crew === t.crew && Math.max(u.start, c.start) < Math.min(u.end, c.end))) continue;
            chosen = c;
            break outer;
          }
        }
      }
      if (chosen) {
        assign.set(t.id, chosen);
        granted.push({ ...chosen, sections: t.sections, dept });
        deptUse.push({ day: chosen.day, machine: t.machine, crew: t.crew, start: chosen.start, end: chosen.end });
      }
    }
  }

  // Materialise with separate possessions per department (no bundling): we
  // build a detail object compatible with scheduler.materialise.
  const blocks = [];
  for (const [id, a] of assign) {
    if (!a) continue;
    const t = tasksById.get(id);
    const b = { day: a.day, line: a.line, sections: t.sections, start: a.start, end: a.end, span: a.end - a.start, items: [{ id, task: t, a }], lineClosure: t.closure === 'LINE', closureSections: t.sections, closureStart: a.start, closureEnd: a.end };
    b.eval = b.lineClosure ? evaluateWindow(dayOccs[a.day], t.sections, a.line, a.start, a.end, r) : { trains: [], weightedDelayMin: 0, rawDelayMin: 0, premiumConflicts: 0, feasible: true };
    blocks.push(b);
  }
  const tsr = new Map(tasks.map((t) => [t.id, tsrLossPerDay(t, dayOccs[0], corridor)]));
  let delayCost = 0;
  let downtime = 0;
  for (const b of blocks) {
    delayCost += weights.delay * b.eval.weightedDelayMin;
    if (b.lineClosure) downtime += weights.downtime * b.span * b.closureSections.length;
  }
  let deferCost = 0;
  let waitCost = 0;
  for (const [id, a] of assign) {
    const t = tasksById.get(id);
    if (!a) deferCost += weights.risk * t.risk.arci * days + weights.tsr * (tsr.get(id) || 0) * days;
    else waitCost += weights.tsr * (tsr.get(id) || 0) * a.day + weights.risk * t.risk.arci * a.day * 0.5;
  }
  const detail = { total: delayCost + downtime + deferCost + waitCost + blocks.length * weights.spread, delayCost, downtimeCost: downtime, spreadCost: blocks.length * weights.spread, waitCost, deferCost, colocationBonus: 0, hard: 0, hardReasons: [], blocks, resources: { violations: [], machineUse: new Map(), crewUse: new Map() } };
  const plan = materialise({ corridor, feeds, tasksById, assign, detail, days, planStart, label: 'baseline', weights, rules: r });
  plan.dayOccs = dayOccs;
  plan.search = { iterations: 0, greedyCost: Math.round(detail.total), finalCost: Math.round(detail.total), improvements: 0, accepted: 0, timeMs: 0, candidateCount: 0 };
  return plan;
}
