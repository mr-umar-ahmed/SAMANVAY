/**
 * Block scheduling optimiser.
 *
 * Decision: for every task, either an assignment (day, line, start) inside the
 * horizon, or "deferred". Tasks that share a block section, a line, a day and
 * overlapping time are merged into one *block* (possession). Departments
 * sharing a block is the co-location ("shadow block") effect the JPO asks for.
 *
 * Objective (minimised):
 *   Σ_blocks  w.delay · weighted knock-on delay(block)
 *           + w.downtime · span(block) · |sections(block)|
 *           + w.spread
 *           − w.colocation · (departments(block) − 1)
 *   Σ_scheduled tasks  w.tsr · tsrLoss/day · day + w.risk · ARCI · day · 0.5
 *                    + w.risk · ARCI · max(0, day − dueDay)
 *   Σ_deferred tasks   w.risk · ARCI · horizonDays + w.tsr · tsrLoss/day · horizonDays
 *   + hard-constraint penalties (premium path conflict, mandatory task deferred,
 *     incompatible pair in one block, block longer than the JPO limit,
 *     machine / gang capacity exceeded)
 *
 * Search: greedy construction in ARCI order, then simulated annealing over
 * (move task to another candidate | defer task | restore task) moves with a
 * seeded RNG, so results are reproducible. Candidate windows are the natural
 * headway gaps of the working time table plus the FOIS forecast, so every
 * evaluated block is laid against real train paths.
 */
import { createRng } from './random.js';
import { buildDayOccupancy, commonFreeWindows } from './occupancy.js';
import { evaluateWindow, tsrLossPerDay } from './delayModel.js';
import { DEFAULT_WEIGHTS, RULES, INCOMPATIBLE_PAIRS, MACHINE_TYPES } from './constants.js';
import { addDays, isoDate, fmtDate, minToHHMM, MIN_PER_DAY } from './time.js';

const HARD = 1e6;
const incompatible = new Set(INCOMPATIBLE_PAIRS.map(([a, b]) => `${a}|${b}`).concat(INCOMPATIBLE_PAIRS.map(([a, b]) => `${b}|${a}`)));

/* ------------------------------------------------------------------------ */
/* Candidate generation                                                      */
/* ------------------------------------------------------------------------ */

function candidatesFor(task, dayOccs, rules, days) {
  const out = [];
  const lines = task.line === 'BOTH' ? ['BOTH'] : [task.line];
  for (let d = 0; d < days; d++) {
    const occ = dayOccs[d];
    for (const line of lines) {
      if (task.closure === 'NONE') {
        // disconnection / TSS work: daylight starts, no line closure
        for (const s of [480, 600, 840, 960]) out.push({ day: d, line, start: s, end: s + task.totalMin, gap: 0 });
        // ...and also aligned with headway gaps so the optimiser can nest it in a traffic block
        const ws = commonFreeWindows(occ, task.sections, task.line === 'BOTH' ? 'DN' : task.line, rules.minBlockMin, rules.headwayMarginMin);
        for (const w of ws) out.push({ day: d, line, start: w.start, end: w.start + task.totalMin, gap: w.end - w.start });
        continue;
      }
      const ws = commonFreeWindows(occ, task.sections, line, rules.minBlockMin, rules.headwayMarginMin);
      for (const w of ws) {
        const len = w.end - w.start;
        // a block must finish inside the planning day (next-day paths are not in this day's occupancy)
        if (w.start + task.totalMin > MIN_PER_DAY) {
          if (w.end - task.totalMin >= w.start) out.push({ day: d, line, start: w.end - task.totalMin, end: w.end, gap: len });
          continue;
        }
        out.push({ day: d, line, start: w.start, end: w.start + task.totalMin, gap: len });
        if (len >= task.totalMin + 30) out.push({ day: d, line, start: w.end - task.totalMin, end: w.end, gap: len });
        if (len >= task.totalMin * 2 + 30) {
          const mid = Math.round((w.start + (len - task.totalMin) / 2) / 5) * 5;
          out.push({ day: d, line, start: mid, end: mid + task.totalMin, gap: len });
        }
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* Block formation                                                           */
/* ------------------------------------------------------------------------ */

function sectionsOverlap(a, b) {
  for (const s of a) if (b.includes(s)) return true;
  return false;
}

/**
 * Merge assignments into blocks. Line-closure tasks (traffic / power blocks)
 * are unioned when they share a day, a compatible line, a block section and
 * overlapping time. Disconnection tasks (no line closure) are nested inside a
 * closure block only when they lie entirely within its span — otherwise they
 * form their own disconnection groups.
 */
function formBlocks(assign, tasksById) {
  const items = [];
  for (const [id, a] of assign) {
    if (!a) continue;
    items.push({ id, task: tasksById.get(id), a });
  }
  const closure = items.filter((it) => it.task.closure === 'LINE');
  const open = items.filter((it) => it.task.closure !== 'LINE');
  const lineOk = (lx, ly) => lx === ly || lx === 'BOTH' || ly === 'BOTH';
  const union = (list) => {
    const parent = list.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const x = list[i];
        const y = list[j];
        if (x.a.day !== y.a.day || !lineOk(x.a.line, y.a.line)) continue;
        if (!sectionsOverlap(x.task.sections, y.task.sections)) continue;
        if (Math.max(x.a.start, y.a.start) >= Math.min(x.a.end, y.a.end)) continue;
        parent[find(i)] = find(j);
      }
    }
    const groups = new Map();
    list.forEach((it, i) => {
      const r = find(i);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(it);
    });
    return [...groups.values()];
  };
  const blocks = [];
  for (const g of union(closure)) {
    const sections = [...new Set(g.flatMap((it) => it.task.sections))].sort((a, b) => a - b);
    const line = g.some((it) => it.a.line === 'BOTH') ? 'BOTH' : g[0].a.line;
    const start = Math.min(...g.map((it) => it.a.start));
    const end = Math.max(...g.map((it) => it.a.end));
    blocks.push({ day: g[0].a.day, line, sections, start, end, span: end - start, items: g, lineClosure: true, closureSections: sections, closureStart: start, closureEnd: end, nested: [] });
  }
  const loose = [];
  for (const it of open) {
    const host = blocks.find((b) => b.lineClosure && b.day === it.a.day && lineOk(b.line, it.a.line) && sectionsOverlap(b.sections, it.task.sections) && it.a.start >= b.closureStart && it.a.end <= b.closureEnd);
    if (host) {
      host.items.push(it);
      host.nested.push(it);
    } else loose.push(it);
  }
  for (const g of union(loose)) {
    const sections = [...new Set(g.flatMap((it) => it.task.sections))].sort((a, b) => a - b);
    const line = g.some((it) => it.a.line === 'BOTH') ? 'BOTH' : g[0].a.line;
    const start = Math.min(...g.map((it) => it.a.start));
    const end = Math.max(...g.map((it) => it.a.end));
    blocks.push({ day: g[0].a.day, line, sections, start, end, span: end - start, items: g, lineClosure: false, closureSections: [], closureStart: null, closureEnd: null, nested: [] });
  }
  return blocks;
}

/* ------------------------------------------------------------------------ */
/* Resource feasibility                                                      */
/* ------------------------------------------------------------------------ */

function travelMin(fromKm, toKm, speed) {
  return (Math.abs(fromKm - toKm) / speed) * 60 + 20; // + 20 min positioning
}

/**
 * Assign machine units and gangs to the scheduled tasks (interval scheduling
 * per resource type per day). Returns { violations, machineUse, crewUse }.
 */
function allocateResources(assign, tasksById, machines, crews, days) {
  const violations = [];
  const machineUse = new Map(); // machineId -> [{day,start,end,taskId}]
  const crewUse = new Map();
  const perDay = new Map(); // day -> tasks sorted by start
  for (const [id, a] of assign) {
    if (!a) continue;
    if (!perDay.has(a.day)) perDay.set(a.day, []);
    perDay.get(a.day).push({ id, a, task: tasksById.get(id) });
  }
  for (const [day, list] of perDay) {
    list.sort((x, y) => x.a.start - y.a.start);
    const dow = day % 7;
    for (const it of list) {
      const t = it.task;
      // machine
      if (t.machine) {
        const units = machines.filter((m) => m.type === t.machine && !m.unavailable.some((u) => day >= u.fromDay && day <= u.toDay));
        let chosen = null;
        for (const m of units) {
          const use = machineUse.get(m.id) || [];
          const last = use.filter((u) => u.day === day).sort((a, b) => b.end - a.end)[0];
          const fromKm = last ? last.km : m.homeKm;
          const ready = last ? last.end + travelMin(fromKm, t.startKm, m.speedKmph) : 0;
          if (ready <= it.a.start) {
            chosen = m;
            break;
          }
        }
        if (!chosen) violations.push({ taskId: t.id, type: 'MACHINE', detail: `No ${MACHINE_TYPES[t.machine].label} free on day ${day + 1} at ${minToHHMM(it.a.start)}` });
        else {
          if (!machineUse.has(chosen.id)) machineUse.set(chosen.id, []);
          machineUse.get(chosen.id).push({ day, start: it.a.start, end: it.a.end, taskId: t.id, km: t.endKm });
          it.a.machineId = chosen.id;
        }
      }
      // crew
      if (t.crew) {
        let gangs = crews.filter((c) => c.type === t.crew && c.restDay !== dow && Math.abs(c.baseKm - t.startKm) <= c.reachKm);
        if (!gangs.length && t.risk && t.risk.mandatory) gangs = crews.filter((c) => c.type === t.crew && Math.abs(c.baseKm - t.startKm) <= c.reachKm * 1.5);
        let chosen = null;
        for (const c of gangs) {
          const use = crewUse.get(c.id) || [];
          const today = use.filter((u) => u.day === day);
          const minutes = today.reduce((s, u) => s + (u.end - u.start), 0);
          const busy = today.some((u) => Math.max(u.start, it.a.start) < Math.min(u.end, it.a.end));
          if (!busy && minutes + (it.a.end - it.a.start) <= c.maxMinPerDay) {
            chosen = c;
            break;
          }
        }
        if (!chosen) violations.push({ taskId: t.id, type: 'CREW', detail: `No ${t.crew.replace('_', ' ').toLowerCase()} within reach on day ${day + 1}` });
        else {
          if (!crewUse.has(chosen.id)) crewUse.set(chosen.id, []);
          crewUse.get(chosen.id).push({ day, start: it.a.start, end: it.a.end, taskId: t.id });
          it.a.crewId = chosen.id;
        }
      }
    }
  }
  return { violations, machineUse, crewUse };
}

/* ------------------------------------------------------------------------ */
/* Cost                                                                      */
/* ------------------------------------------------------------------------ */

function makeEvaluator(ctx) {
  const { dayOccs, rules, weights, tasksById, machines, crews, days, tsrLoss, allowPremium } = ctx;
  const cache = new Map();
  const evalBlock = (b) => {
    if (!b.lineClosure) return { weightedDelayMin: 0, rawDelayMin: 0, trains: [], premiumConflicts: 0, feasible: true };
    const key = `${b.day}|${b.line}|${b.closureSections.join(',')}|${b.closureStart}|${b.closureEnd}`;
    let r = cache.get(key);
    if (!r) {
      r = evaluateWindow(dayOccs[b.day], b.closureSections, b.line, b.closureStart, b.closureEnd, rules, { allowPremium });
      cache.set(key, r);
    }
    return r;
  };

  const cost = (assign, detailed = false) => {
    let delayCost = 0;
    let downtimeCost = 0;
    let colocationBonus = 0;
    let spreadCost = 0;
    let waitCost = 0;
    let deferCost = 0;
    let hard = 0;
    const hardReasons = [];
    const blocks = formBlocks(assign, tasksById);
    for (const b of blocks) {
      const ev = evalBlock(b);
      b.eval = ev;
      delayCost += weights.delay * ev.weightedDelayMin;
      if (!ev.feasible) {
        hard += HARD * ev.premiumConflicts;
        hardReasons.push(`premium path conflict on ${b.day}`);
      }
      if (b.lineClosure) {
        downtimeCost += weights.downtime * (b.closureEnd - b.closureStart) * b.closureSections.length;
        spreadCost += weights.spread;
        if (b.closureEnd - b.closureStart > rules.maxBlockMin) {
          hard += HARD;
          hardReasons.push('block exceeds JPO 6 h limit');
        }
      }
      const depts = new Set(b.items.map((it) => it.task.dept));
      colocationBonus += weights.colocation * (depts.size - 1);
      // disconnection work nested inside a traffic block is safer and free
      if (b.lineClosure) colocationBonus += weights.colocation * 0.5 * b.nested.length;
      // incompatible pairs
      for (let i = 0; i < b.items.length; i++) {
        for (let j = i + 1; j < b.items.length; j++) {
          if (incompatible.has(`${b.items[i].task.workType}|${b.items[j].task.workType}`)) {
            hard += HARD;
            hardReasons.push(`incompatible works ${b.items[i].task.workType} + ${b.items[j].task.workType}`);
          }
        }
      }
    }
    // controller workload: closures per day and simultaneous closures
    const perDay = new Map();
    for (const b of blocks) {
      if (!b.lineClosure) continue;
      if (!perDay.has(b.day)) perDay.set(b.day, []);
      perDay.get(b.day).push(b);
    }
    for (const [day, list] of perDay) {
      if (list.length > rules.maxBlocksPerDay) {
        hard += HARD * (list.length - rules.maxBlocksPerDay);
        hardReasons.push(`more than ${rules.maxBlocksPerDay} possessions on day ${day + 1}`);
      }
      for (const b of list) {
        const concurrent = list.filter((o) => Math.max(o.closureStart, b.closureStart) < Math.min(o.closureEnd, b.closureEnd)).length;
        if (concurrent > rules.maxConcurrentBlocks) {
          hard += HARD;
          hardReasons.push(`${concurrent} simultaneous possessions on day ${day + 1}`);
          break;
        }
      }
    }
    for (const [id, a] of assign) {
      const t = tasksById.get(id);
      const loss = tsrLoss.get(id) || 0;
      if (!a) {
        if (t.risk.mandatory) {
          hard += HARD;
          hardReasons.push(`mandatory task ${id} deferred`);
        }
        deferCost += weights.risk * t.risk.arci * days + weights.tsr * loss * days;
      } else {
        waitCost += weights.tsr * loss * a.day + weights.risk * t.risk.arci * a.day * 0.5;
        if (a.day > t.dueDay) waitCost += weights.risk * t.risk.arci * (a.day - t.dueDay);
        if (t.risk.mandatory && a.day > Math.max(0, t.dueDay)) {
          hard += HARD / 2;
          hardReasons.push(`mandatory task ${id} beyond due day`);
        }
      }
    }
    const res = allocateResources(assign, tasksById, machines, crews, days);
    hard += HARD * res.violations.length;
    const total = delayCost + downtimeCost + spreadCost + waitCost + deferCost - colocationBonus + hard;
    if (!detailed) return total;
    return { total, delayCost, downtimeCost, spreadCost, waitCost, deferCost, colocationBonus, hard, hardReasons, blocks, resources: res };
  };
  return { cost, evalBlock };
}

/* ------------------------------------------------------------------------ */
/* Search                                                                    */
/* ------------------------------------------------------------------------ */

export function planHorizon({ corridor, feeds, tasks, days, planStart, weights = DEFAULT_WEIGHTS, rules = RULES, iterations = 6000, seed = 7, allowPremium = false, label = 'plan' }) {
  const t0 = Date.now();
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  const r = { ...RULES, ...rules };
  const dayOccs = [];
  for (let d = 0; d < days; d++) dayOccs.push(buildDayOccupancy(corridor, feeds, d, planStart));
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const tsrLoss = new Map(tasks.map((t) => [t.id, tsrLossPerDay(t, dayOccs[0], corridor)]));
  const cands = new Map(tasks.map((t) => [t.id, candidatesFor(t, dayOccs, r, days)]));
  const ctx = { dayOccs, rules: r, weights: w, tasksById, machines: feeds.machines, crews: feeds.crews, days, tsrLoss, allowPremium };
  const { cost } = makeEvaluator(ctx);
  const rng = createRng(seed);

  // ---- greedy construction in ARCI order
  const order = tasks.slice().sort((a, b) => b.risk.arci - a.risk.arci);
  const assign = new Map(tasks.map((t) => [t.id, null]));
  let current = cost(assign);
  for (const t of order) {
    let best = null;
    let bestCost = current; // staying deferred
    for (const c of cands.get(t.id)) {
      assign.set(t.id, { ...c });
      const cc = cost(assign);
      if (cc < bestCost - 1e-9) {
        bestCost = cc;
        best = c;
      }
    }
    assign.set(t.id, best ? { ...best } : null);
    current = bestCost;
  }
  const greedyCost = current;

  // ---- simulated annealing
  let best = new Map([...assign].map(([k, v]) => [k, v ? { ...v } : null]));
  let bestCost = current;
  let T = r.annealT0 || 300;
  const Tend = 2;
  const alpha = Math.pow(Tend / T, 1 / Math.max(1, iterations));
  let improvements = 0;
  let accepted = 0;
  const ids = tasks.map((t) => t.id);
  for (let i = 0; i < iterations; i++) {
    if (i > 0 && i % 400 === 0 && current > bestCost * 1.05 + 50) {
      // drifted too far from the incumbent: restart from best
      assign.clear();
      for (const [k, v] of best) assign.set(k, v ? { ...v } : null);
      current = bestCost;
    }
    const id = rng.pick(ids);
    const t = tasksById.get(id);
    const prev = assign.get(id);
    const cs = cands.get(id);
    const roll = rng.next();
    let next;
    if (roll < 0.12 && prev && !t.risk.mandatory) next = null; // defer
    else if (cs.length) next = { ...rng.pick(cs) };
    else next = null;
    assign.set(id, next);
    const cc = cost(assign);
    const delta = cc - current;
    if (delta <= 0 || rng.next() < Math.exp(-delta / T)) {
      current = cc;
      accepted++;
      if (cc < bestCost - 1e-9) {
        bestCost = cc;
        best = new Map([...assign].map(([k, v]) => [k, v ? { ...v } : null]));
        improvements++;
      }
    } else assign.set(id, prev);
    T *= alpha;
  }

  const detail = cost(best, true);
  const plan = materialise({ corridor, feeds, tasksById, assign: best, detail, days, planStart, label, weights: w, rules: r });
  plan.search = { iterations, greedyCost: Math.round(greedyCost), finalCost: Math.round(bestCost), improvements, accepted, timeMs: Date.now() - t0, candidateCount: [...cands.values()].reduce((s, c) => s + c.length, 0) };
  plan.dayOccs = dayOccs;
  return plan;
}

/* ------------------------------------------------------------------------ */
/* Output                                                                    */
/* ------------------------------------------------------------------------ */

export function materialise({ corridor, feeds, tasksById, assign, detail, days, planStart, label, weights, rules }) {
  let n = 0;
  const blocks = detail.blocks
    .slice()
    .sort((a, b) => a.day - b.day || a.start - b.start)
    .map((b) => {
      n++;
      const date = addDays(planStart, b.day);
      const items = b.items.slice().sort((x, y) => x.a.start - y.a.start);
      const depts = [...new Set(items.map((it) => it.task.dept))];
      const kinds = new Set(items.map((it) => it.task.blockKind));
      const needsPower = [...kinds].some((k) => k.includes('POWER'));
      const needsTraffic = [...kinds].some((k) => k.includes('TRAFFIC'));
      const kind = b.lineClosure ? (needsPower && needsTraffic ? 'TRAFFIC + POWER' : needsPower ? 'POWER' : 'TRAFFIC') : 'DISCONNECTION';
      const ohe = needsPower ? [...new Set(items.flatMap((it) => it.task.oheSections))].sort((a, c) => a - c) : [];
      const secs = b.sections.map((i) => corridor.blockSections[i]);
      const startKm = Math.min(...items.map((it) => it.task.startKm));
      const endKm = Math.max(...items.map((it) => it.task.endKm));
      return {
        id: `BLK-${corridor.code.replace('–', '')}-${String(n).padStart(3, '0')}`,
        day: b.day,
        date: isoDate(date),
        dateLabel: fmtDate(date),
        line: b.line,
        kind,
        lineClosure: b.lineClosure,
        sections: b.sections,
        sectionLabels: secs.map((s) => s.label),
        sectionText: secs.length === 1 ? secs[0].label : `${secs[0].from}–${secs[secs.length - 1].to}`,
        startKm,
        endKm,
        start: b.start,
        end: b.end,
        startText: minToHHMM(b.start),
        endText: minToHHMM(b.end),
        spanMin: b.span,
        departments: depts,
        coLocated: depts.length > 1,
        tasks: items.map((it) => ({ id: it.task.id, workType: it.task.workType, label: it.task.label, dept: it.task.dept, start: it.a.start, end: it.a.end, startText: minToHHMM(it.a.start), endText: minToHHMM(it.a.end), arci: it.task.risk.arci, urgency: it.task.risk.urgency, machineId: it.a.machineId || null, crewId: it.a.crewId || null, startKm: it.task.startKm, endKm: it.task.endKm, closure: it.task.closure, tsrKmph: it.task.tsrKmph })),
        machines: [...new Set(items.map((it) => it.a.machineId).filter(Boolean))],
        crews: [...new Set(items.map((it) => it.a.crewId).filter(Boolean))],
        oheSections: ohe.map((i) => corridor.oheSections[i]),
        powerIsolation: needsPower && ohe.length ? `${corridor.oheSections[ohe[0]].spFrom} → ${corridor.oheSections[ohe[ohe.length - 1]].spTo}` : null,
        affectedTrains: b.eval ? b.eval.trains : [],
        weightedDelayMin: b.eval ? b.eval.weightedDelayMin : 0,
        rawDelayMin: b.eval ? b.eval.rawDelayMin : 0,
        premiumConflicts: b.eval ? b.eval.premiumConflicts : 0,
        status: 'PROPOSED'
      };
    });
  const scheduled = [];
  const deferred = [];
  for (const [id, a] of assign) {
    const t = tasksById.get(id);
    if (a) scheduled.push({ taskId: id, day: a.day, line: a.line, start: a.start, end: a.end });
    else deferred.push({ taskId: id, arci: t.risk.arci, urgency: t.risk.urgency, reason: deferReason(t, detail) });
  }
  return {
    label,
    corridorId: corridor.id,
    planStart: isoDate(planStart),
    days,
    blocks,
    scheduled,
    deferred,
    cost: { total: Math.round(detail.total), delay: Math.round(detail.delayCost), downtime: Math.round(detail.downtimeCost), spread: Math.round(detail.spreadCost), waiting: Math.round(detail.waitCost), deferred: Math.round(detail.deferCost), colocationBonus: Math.round(detail.colocationBonus), hard: detail.hard, hardReasons: detail.hardReasons },
    resourceViolations: detail.resources.violations,
    machineUse: Object.fromEntries(detail.resources.machineUse),
    crewUse: Object.fromEntries(detail.resources.crewUse),
    weights,
    rules
  };
}

function deferReason(t, detail) {
  if (t.capital) return 'Capital work — planned in the 26-week programme';
  if (t.risk.arci < 0.4) return 'Low ARCI: deferred to next cycle, no TSR in force';
  return 'No feasible window without disturbing protected paths / resources this cycle';
}
