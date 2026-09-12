/**
 * Block scheduling optimiser.
 *
 * Decision: for every task, either an assignment (day, line, start) inside the
 * horizon, or "deferred". Tasks that share a block section, a line, a day and
 * overlapping time are merged into one *block* (possession). Departments
 * sharing a block is the co-location ("shadow block") effect the JPO asks for.
 *
 * Safety before optimisation: a mandatory task only gets candidate windows on
 * or before its due day (all windows are kept only when none exist, so it can
 * still be placed late and reported), greedy construction never leaves a
 * mandatory task deferred while any window exists, and its penalties
 * (deferred 4 × HARD, late 2 × HARD) dominate every controller-workload rule
 * (HARD each). Every mandatory task still deferred or late after the search is
 * listed in plan.safetyConflicts with a plain-English reason.
 *
 * Objective (minimised):
 *   Σ_blocks  w.delay · weighted knock-on delay(block)
 *           + w.downtime · span(block) · |sections(block)| · (2 if both lines closed)
 *           + w.spread
 *           − w.colocation · (departments(block) − 1)
 *   Σ_scheduled tasks  w.tsr · tsrLoss/day · day + w.risk · ARCI · day · 0.5
 *                    + w.risk · ARCI · max(0, day − dueDay)
 *                    + w.preference · |day − preferredDay|
 *                    + 3 · w.preference  if the start is outside the preferred window
 *   Σ_deferred tasks   w.risk · ARCI · horizonDays + w.tsr · tsrLoss/day · horizonDays
 *   + hard-constraint penalties: mandatory task deferred (4 × HARD) or after its
 *     due day (2 × HARD); premium path conflict, incompatible pair in one block,
 *     block longer than the JPO limit, possessions per day, simultaneous
 *     possessions, machine / gang capacity, requisition dependencies (dependsOn)
 *     and joint-block requirements (coRequireWith) — HARD each.
 *
 * Search: greedy construction in ARCI order (predecessors first), or a MILP
 * construction supplied by the caller, then simulated annealing over
 * (move task to another candidate | defer task | restore task | joint move of
 * co-required works) moves with a seeded RNG, so results are reproducible.
 * Candidate windows are the natural headway gaps of the working time table
 * plus the FOIS forecast, so every evaluated block is laid against real train
 * paths. Approved blocks (fixedBlocks) are held exactly and no other work may
 * merge into them, so their approval stays attached across re-plans.
 */
import { createRng } from './random.js';
import { buildDayOccupancy, commonFreeWindows, freeWindowAt, inDailyWindow } from './occupancy.js';
import { evaluateWindow, tsrLossPerDay, windowReliability } from './delayModel.js';
import { DEFAULT_WEIGHTS, RULES, INCOMPATIBLE_PAIRS, MACHINE_TYPES, PREFERENCE_WINDOW_FACTOR, DEFAULT_DURATION_SD } from './constants.js';
import { addDays, isoDate, fmtDate, minToHHMM, MIN_PER_DAY, stableHash, DAY_NAMES_LONG } from './time.js';
import { learnDurationFactors, durationDispersion } from './productivity.js';

export const HARD = 1e6;
/** Penalty ladder: safety first, then controller workload / resources. */
export const PENALTY = { MANDATORY_DEFERRED: 4 * HARD, MANDATORY_LATE: 2 * HARD, RULE: HARD };
const incompatible = new Set(INCOMPATIBLE_PAIRS.map(([a, b]) => `${a}|${b}`).concat(INCOMPATIBLE_PAIRS.map(([a, b]) => `${b}|${a}`)));
const lineOk = (lx, ly) => lx === ly || lx === 'BOTH' || ly === 'BOTH';

/* ------------------------------------------------------------------------ */
/* Fixed (approved) blocks                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Turn FixedBlockConstraint[] into per-task fixed assignments (per-task
 * windows when given, else the whole block span) and protected zones that no
 * other task may merge into or nest inside.
 */
function prepareFixed(fixedBlocks, tasksById, days) {
  const assignments = new Map();
  const zones = [];
  const report = [];
  for (const b of Array.isArray(fixedBlocks) ? fixedBlocks : []) {
    if (!b || !Number.isFinite(b.day)) continue;
    const tids = Array.isArray(b.taskIds) ? b.taskIds : Array.isArray(b.tasks) ? b.tasks.map((t) => t.id) : [];
    if (b.day < 0 || b.day >= days) {
      report.push({ id: b.id || null, day: b.day, taskIds: tids, heldTaskIds: [], missingTaskIds: [], held: false, note: 'outside this horizon' });
      continue;
    }
    const windows = new Map((Array.isArray(b.tasks) ? b.tasks : []).filter((t) => t && t.id != null && Number.isFinite(t.start) && Number.isFinite(t.end) && t.end > t.start).map((t) => [t.id, t]));
    const present = tids.filter((id) => tasksById.has(id));
    const missing = tids.filter((id) => !tasksById.has(id));
    let zStart = b.start;
    let zEnd = b.end;
    for (const tid of present) {
      const task = tasksById.get(tid);
      const w = windows.get(tid);
      const start = w ? w.start : b.start;
      const end = w ? w.end : b.end;
      zStart = Math.min(zStart, start);
      zEnd = Math.max(zEnd, end);
      // a single-line work inside a both-lines block keeps its own line (it only closes both lines while the partner is there)
      const line = b.line === 'BOTH' && task.line !== 'BOTH' && w ? task.line : b.line;
      assignments.set(tid, { day: b.day, line, start, end, gap: end - start, fixed: true, fixedBlockId: b.id || null });
    }
    if (present.length) zones.push({ id: b.id || null, day: b.day, line: b.line, sections: [...new Set(present.flatMap((id) => tasksById.get(id).sections))], start: zStart, end: zEnd });
    report.push({ id: b.id || null, day: b.day, taskIds: tids, heldTaskIds: present, missingTaskIds: missing, held: present.length > 0, note: present.length ? (missing.length ? `${missing.length} work(s) no longer in the register (attended / excluded)` : null) : 'no work of this block remains in the register' });
  }
  return { assignments, zones, report };
}

/* ------------------------------------------------------------------------ */
/* Candidate generation                                                      */
/* ------------------------------------------------------------------------ */

function rawCandidates(task, dayOccs, rules, days) {
  if (task.targetBlock) {
    const tb = task.targetBlock;
    if (!(tb.day >= 0 && tb.day < days)) return [];
    return [{ day: tb.day, line: tb.line, start: tb.start, end: Math.min(tb.end, tb.start + task.totalMin), gap: tb.end - tb.start }];
  }
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
        for (const w of ws) if (w.start + task.totalMin <= MIN_PER_DAY) out.push({ day: d, line, start: w.start, end: w.start + task.totalMin, gap: w.end - w.start });
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

/**
 * Candidate windows of one task → { list, raw, noEarlyWindow }.
 *  - fixed (approved) tasks: exactly their fixed window;
 *  - other tasks: never overlapping a fixed block on a shared section / line;
 *  - mandatory tasks: only windows on or before max(0, dueDay), unless none
 *    exist (then all windows, flagged noEarlyWindow).
 */
/**
 * Weather screen for one task's candidates: drop days whose weather rules out
 * the work type (heavy rain → no welding / USFD; very heavy rain → no
 * formation work; high wind → no tower-wagon OHE work) and daytime starts on
 * heat days for ballast-disturbing work. Mandatory works are never screened
 * out, and if screening would leave nothing the unscreened list is kept.
 */
function weatherScreen(task, list, weather) {
  if (!weather || !weather.length || (task.risk && task.risk.mandatory)) return list;
  const ok = list.filter((c) => {
    const fx = weather[c.day];
    if (!fx) return true;
    if (fx.avoidWorkTypes && fx.avoidWorkTypes.includes(task.workType)) return false;
    if (fx.daytimeWindow && fx.daytimeAvoidWorkTypes && fx.daytimeAvoidWorkTypes.includes(task.workType)) {
      if (Math.max(c.start, fx.daytimeWindow.fromMin) < Math.min(c.end, fx.daytimeWindow.toMin)) return false;
    }
    return true;
  });
  return ok.length ? ok : list;
}

function candidatesFor(task, dayOccs, rules, days, fixed, weather = null) {
  if (fixed.assignments.has(task.id)) return { list: [{ ...fixed.assignments.get(task.id) }], raw: 1, noEarlyWindow: false };
  let out = weatherScreen(task, rawCandidates(task, dayOccs, rules, days), weather);
  if (fixed.zones.length && !task.targetBlock) {
    out = out.filter((c) => !fixed.zones.some((z) => z.day === c.day && lineOk(z.line, c.line) && sectionsOverlap(z.sections, task.sections) && Math.max(z.start, c.start) < Math.min(z.end, c.end)));
  }
  const raw = out.length;
  let noEarlyWindow = false;
  if (task.risk && task.risk.mandatory && out.length) {
    const due = Math.max(0, task.dueDay);
    const early = out.filter((c) => c.day <= due);
    if (early.length) out = early;
    else noEarlyWindow = true;
  }
  return { list: out, raw, noEarlyWindow };
}

/* ------------------------------------------------------------------------ */
/* Block formation                                                           */
/* ------------------------------------------------------------------------ */

function sectionsOverlap(a, b) {
  for (const s of a) if (b.includes(s)) return true;
  return false;
}

/**
 * Could task x at candidate cx and task y at candidate cy end up in one block
 * (same rule as formBlocks: union of line closures, nesting of disconnections)?
 */
function canShare(x, cx, y, cy) {
  if (!cx || !cy || cx.day !== cy.day || !lineOk(cx.line, cy.line) || !sectionsOverlap(x.sections, y.sections)) return false;
  const xl = x.closure === 'LINE';
  const yl = y.closure === 'LINE';
  if (xl === yl) return Math.max(cx.start, cy.start) < Math.min(cx.end, cy.end);
  const [inner, outer] = xl ? [cy, cx] : [cx, cy];
  return inner.start >= outer.start && inner.end <= outer.end;
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
      it.a.machineId = null;
      it.a.crewId = null;
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
        if (!chosen) violations.push({ taskId: t.id, type: 'MACHINE', detail: `No ${MACHINE_TYPES[t.machine] ? MACHINE_TYPES[t.machine].label : t.machine} free on day ${day + 1} at ${minToHHMM(it.a.start)}` });
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
  const { dayOccs, rules, weights, tasksById, machines, crews, days, tsrLoss, allowPremium, depPairs = [], coPairs = [], weather = null } = ctx;
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
  const prefW = Number.isFinite(weights.preference) ? weights.preference : DEFAULT_WEIGHTS.preference;

  const cost = (assign, detailed = false) => {
    const pending = ctx.pending; // greedy construction: works not decided yet are exempt from pair rules
    let delayCost = 0;
    let downtimeCost = 0;
    let colocationBonus = 0;
    let spreadCost = 0;
    let waitCost = 0;
    let deferCost = 0;
    let preferenceCost = 0;
    let weatherCost = 0;
    let hard = 0;
    const hardReasons = [];
    const blocks = formBlocks(assign, tasksById);
    for (const b of blocks) {
      const ev = evalBlock(b);
      b.eval = ev;
      delayCost += weights.delay * ev.weightedDelayMin;
      if (!ev.feasible) {
        hard += HARD * ev.premiumConflicts;
        hardReasons.push(`premium path conflict on day ${b.day + 1}`);
      }
      if (b.lineClosure) {
        // both lines closed = twice the section-line minutes lost (as in kpi.js)
        downtimeCost += weights.downtime * (b.closureEnd - b.closureStart) * b.closureSections.length * (b.line === 'BOTH' ? 2 : 1);
        spreadCost += weights.spread;
        if (b.closureEnd - b.closureStart > rules.maxBlockMin) {
          hard += HARD;
          hardReasons.push(`block exceeds JPO ${Math.round(rules.maxBlockMin / 60)} h limit on day ${b.day + 1}`);
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
          hard += PENALTY.MANDATORY_DEFERRED;
          hardReasons.push(`mandatory task ${id} deferred`);
        }
        deferCost += weights.risk * t.risk.arci * days + weights.tsr * loss * days;
      } else {
        waitCost += weights.tsr * loss * a.day + weights.risk * t.risk.arci * a.day * 0.5;
        if (a.day > t.dueDay) waitCost += weights.risk * t.risk.arci * (a.day - t.dueDay);
        if (t.risk.mandatory && a.day > Math.max(0, t.dueDay)) {
          hard += PENALTY.MANDATORY_LATE;
          hardReasons.push(`mandatory task ${id} beyond due day`);
        }
        // wet / windy / hot days slow outdoor work in a possession: priced like extra downtime
        const fx = weather && weather[a.day];
        if (fx && fx.outdoorPenalty && t.closure === 'LINE') weatherCost += weights.downtime * fx.outdoorPenalty * (a.end - a.start);
        if (t.preferredDay != null && Number.isFinite(t.preferredDay)) preferenceCost += prefW * Math.abs(a.day - t.preferredDay);
        if (t.preferredWindow === 'night' || t.preferredWindow === 'day') {
          const night = inDailyWindow(a.start, rules.nightWindow);
          if ((t.preferredWindow === 'night') !== night) preferenceCost += prefW * PREFERENCE_WINDOW_FACTOR;
        }
      }
    }
    // requisition dependencies: the dependent starts only after its predecessor ends
    for (const [pre, dep] of depPairs) {
      if (pending && (pending.has(pre) || pending.has(dep))) continue;
      const ad = assign.get(dep);
      if (!ad) continue;
      const ap = assign.get(pre);
      if (!ap) {
        hard += HARD;
        hardReasons.push(`${dep} depends on ${pre}, which is not scheduled`);
      } else if (!(ap.day < ad.day || (ap.day === ad.day && ap.end <= ad.start))) {
        hard += HARD;
        hardReasons.push(`${dep} must start after ${pre} ends`);
      }
    }
    // joint-block requirements: both works in the same block
    if (coPairs.length) {
      const blockOf = new Map();
      blocks.forEach((b, i) => {
        for (const it of b.items) blockOf.set(it.id, i);
      });
      for (const [x, y] of coPairs) {
        if (pending && (pending.has(x) || pending.has(y))) continue;
        const ax = assign.get(x);
        const ay = assign.get(y);
        if (!ax && !ay) continue;
        if (!ax || !ay || blockOf.get(x) !== blockOf.get(y)) {
          hard += HARD;
          hardReasons.push(`${x} and ${y} must share one block`);
        }
      }
    }
    const res = allocateResources(assign, tasksById, machines, crews, days);
    hard += HARD * res.violations.length;
    for (const v of res.violations) hardReasons.push(`${v.type === 'MACHINE' ? 'machine' : 'gang'} not available for ${v.taskId}`);
    const total = delayCost + downtimeCost + spreadCost + waitCost + deferCost + preferenceCost + weatherCost - colocationBonus + hard;
    if (!detailed) return total;
    return { total, delayCost, downtimeCost, spreadCost, waitCost, deferCost, preferenceCost, weatherCost, colocationBonus, hard, hardReasons, blocks, resources: res };
  };
  return { cost, evalBlock };
}

/* ------------------------------------------------------------------------ */
/* Search                                                                    */
/* ------------------------------------------------------------------------ */

/** Pairs [predecessor, dependent] and [x, y] (co-required) among the tasks present. */
function pairRules(tasks, tasksById) {
  const depPairs = [];
  const coSeen = new Set();
  const coPairs = [];
  const partners = new Map();
  for (const t of tasks) {
    for (const p of Array.isArray(t.dependsOn) ? t.dependsOn : []) if (p !== t.id && tasksById.has(p)) depPairs.push([p, t.id]);
    for (const p of Array.isArray(t.coRequireWith) ? t.coRequireWith : []) {
      if (p === t.id || !tasksById.has(p)) continue;
      const key = t.id < p ? `${t.id}|${p}` : `${p}|${t.id}`;
      if (coSeen.has(key)) continue;
      coSeen.add(key);
      coPairs.push(t.id < p ? [t.id, p] : [p, t.id]);
    }
  }
  for (const [x, y] of coPairs) {
    if (!partners.has(x)) partners.set(x, []);
    if (!partners.has(y)) partners.set(y, []);
    partners.get(x).push(y);
    partners.get(y).push(x);
  }
  return { depPairs, coPairs, partners };
}

/** Highest ARCI first, but never before a predecessor (cycles broken by ARCI). */
function constructionOrder(tasks, depPairs) {
  const preds = new Map();
  for (const [p, d] of depPairs) {
    if (!preds.has(d)) preds.set(d, []);
    preds.get(d).push(p);
  }
  const remaining = tasks.slice().sort((a, b) => b.risk.arci - a.risk.arci);
  if (!depPairs.length) return remaining;
  const placed = new Set();
  const order = [];
  while (remaining.length) {
    let idx = remaining.findIndex((t) => (preds.get(t.id) || []).every((p) => placed.has(p)));
    if (idx < 0) idx = 0;
    const [t] = remaining.splice(idx, 1);
    order.push(t);
    placed.add(t.id);
  }
  return order;
}

function sameCand(a, b) {
  return a.day === b.day && a.line === b.line && a.start === b.start && a.end === b.end;
}

/** Validate a MILP (or any external) construction: every task present, every value one of its candidates or null. */
function validateConstruct(out, tasks, cands) {
  if (!out || !(out.assign instanceof Map)) return { ok: false, reason: 'construction returned no assignment map' };
  const assign = new Map();
  for (const t of tasks) {
    if (!out.assign.has(t.id)) return { ok: false, reason: `construction missing task ${t.id}` };
    const v = out.assign.get(t.id);
    if (v == null) {
      assign.set(t.id, null);
      continue;
    }
    const match = cands.get(t.id).find((c) => c === v || sameCand(c, v));
    if (!match) return { ok: false, reason: `construction placed ${t.id} outside its candidate windows` };
    assign.set(t.id, { ...match });
  }
  return { ok: true, assign };
}

export function planHorizon({ corridor, feeds, tasks, days, planStart, weights = DEFAULT_WEIGHTS, rules = RULES, iterations = 6000, seed = 7, allowPremium, label = 'plan', fixedBlocks = [], construct = null, requestedSolver = null, alternatives = { perTask: 30 }, confidence = { samples: 100 }, factors = null, feedsForDay = null, weather = null }) {
  const t0 = Date.now();
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  const r = { ...RULES, ...rules };
  // premium paths may be touched only when the rule is switched off explicitly
  const allowP = allowPremium != null ? !!allowPremium : r.premiumConflictHard === false;
  const dayOccs = [];
  // fog nights re-time trains for that day only (feedsForDay), so the headway gaps shrink
  for (let d = 0; d < days; d++) dayOccs.push(buildDayOccupancy(corridor, feedsForDay ? feedsForDay(d) : feeds, d, planStart));
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const tsrLoss = new Map(tasks.map((t) => [t.id, tsrLossPerDay(t, dayOccs[0], corridor)]));

  const fixed = prepareFixed(fixedBlocks, tasksById, days);
  const fixedAssignments = fixed.assignments;
  const cands = new Map();
  const noEarly = new Set();
  const rawCount = new Map();
  for (const t of tasks) {
    const c = candidatesFor(t, dayOccs, r, days, fixed, weather);
    cands.set(t.id, c.list);
    rawCount.set(t.id, c.raw);
    if (c.noEarlyWindow) noEarly.add(t.id);
  }
  const { depPairs, coPairs, partners } = pairRules(tasks, tasksById);
  const ctx = { dayOccs, rules: r, weights: w, tasksById, machines: feeds.machines, crews: feeds.crews, days, tsrLoss, allowPremium: allowP, depPairs, coPairs, pending: null, weather };
  const { cost } = makeEvaluator(ctx);
  const rng = createRng(seed);

  // ---- construction: external (MILP) when supplied and valid, else greedy
  let solver = 'greedy+sa';
  let milpMeta = null;
  let fallbackReason = null;
  let assign = null;
  if (typeof construct === 'function') {
    try {
      const out = construct({ tasks, cands, dayOccs, rules: r, weights: w, tasksById, machines: feeds.machines, crews: feeds.crews, days, tsrLoss, fixedAssignments, allowPremium: allowP });
      const v = validateConstruct(out, tasks, cands);
      milpMeta = out && out.meta !== undefined ? out.meta : null;
      if (v.ok) {
        assign = v.assign;
        for (const [id, c] of fixedAssignments) if (assign.has(id)) assign.set(id, { ...c });
        solver = 'milp+sa';
      } else fallbackReason = `${v.reason}; greedy construction used`;
    } catch (e) {
      fallbackReason = `MILP construction failed (${e && e.message ? e.message : String(e)}); greedy construction used`;
    }
  } else if (requestedSolver === 'milp') {
    fallbackReason = 'MILP solver requested but no MILP construction is wired into this run; greedy construction used';
  }

  if (!assign) {
    assign = new Map(tasks.map((t) => [t.id, null]));
    const pending = new Set(tasks.map((t) => t.id));
    ctx.pending = pending;
    for (const t of constructionOrder(tasks, depPairs)) {
      pending.delete(t.id);
      if (fixedAssignments.has(t.id)) {
        assign.set(t.id, { ...fixedAssignments.get(t.id) });
        continue;
      }
      let list = cands.get(t.id);
      // joint-block requirement: prefer windows every still-open partner can join
      const open = (partners.get(t.id) || []).filter((p) => pending.has(p));
      if (open.length && list.length) {
        const f = list.filter((c) => open.every((p) => cands.get(p).some((pc) => canShare(t, c, tasksById.get(p), pc))));
        if (f.length) list = f;
      }
      assign.set(t.id, null);
      let bestCost = cost(assign); // staying deferred
      let best = null;
      let least = null;
      let leastCost = Infinity;
      for (const c of list) {
        assign.set(t.id, { ...c });
        const cc = cost(assign);
        if (cc < bestCost - 1e-9) {
          bestCost = cc;
          best = c;
        }
        if (cc < leastCost) {
          leastCost = cc;
          least = c;
        }
      }
      // safety first: a mandatory task is never left deferred while a window exists
      if (!best && t.risk.mandatory && least) best = least;
      assign.set(t.id, best ? { ...best } : null);
    }
    ctx.pending = null;
  } else {
    // external construction: same safety repair
    for (const t of tasks) {
      if (assign.get(t.id) || !t.risk.mandatory || !cands.get(t.id).length) continue;
      let least = null;
      let leastCost = Infinity;
      for (const c of cands.get(t.id)) {
        assign.set(t.id, { ...c });
        const cc = cost(assign);
        if (cc < leastCost) {
          leastCost = cc;
          least = c;
        }
      }
      assign.set(t.id, { ...least });
    }
  }
  let current = cost(assign);
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
  for (let i = 0; i < iterations && ids.length; i++) {
    if (i > 0 && i % 400 === 0 && current > bestCost * 1.05 + 50) {
      // drifted too far from the incumbent: restart from best
      assign.clear();
      for (const [k, v] of best) assign.set(k, v ? { ...v } : null);
      current = bestCost;
    }
    const id = rng.pick(ids);
    if (fixedAssignments.has(id)) continue;
    const t = tasksById.get(id);
    const prev = assign.get(id);
    const cs = cands.get(id);
    const ps = partners.get(id);
    const roll = rng.next();
    const moved = [[id, prev]];
    let next;
    if (roll < 0.12 && prev && !t.risk.mandatory) next = null; // defer
    else if (cs.length) next = { ...rng.pick(cs) };
    else next = null;
    assign.set(id, next);
    if (ps && ps.length) {
      // joint move: co-required partners follow (or are deferred with) the work
      if (!next) {
        for (const p of ps) {
          if (fixedAssignments.has(p) || tasksById.get(p).risk.mandatory) continue;
          moved.push([p, assign.get(p)]);
          assign.set(p, null);
        }
      } else if (rng.next() < 0.7) {
        for (const p of ps) {
          if (fixedAssignments.has(p)) continue;
          const pt = tasksById.get(p);
          const pcs = cands.get(p).filter((pc) => canShare(t, next, pt, pc));
          if (!pcs.length) continue;
          moved.push([p, assign.get(p)]);
          assign.set(p, { ...rng.pick(pcs) });
        }
      }
    }
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
    } else for (const [k, v] of moved) assign.set(k, v);
    T *= alpha;
  }
  const searchMs = Date.now() - t0;

  const detail = cost(best, true);
  const plan = materialise({ corridor, feeds, tasksById, assign: best, detail, days, planStart, label, weights: w, rules: r, fixedBlocks });

  // ---- safety conflicts with reasons
  plan.safetyConflicts = explainSafety({ best, detail, tasksById, cands, noEarly, rawCount, fixedAssignments, cost });

  // ---- alternatives per task and per block
  const t1 = Date.now();
  const perTask = alternatives && Number.isFinite(alternatives.perTask) ? alternatives.perTask : 0;
  plan.alternatives = perTask > 0 ? computeAlternatives({ best, detail, cands, tasksById, fixedAssignments, cost, perTask, planStart, rules: r }) : {};
  if (perTask > 0) attachBlockAlternatives({ plan, best, detail, tasksById, fixedAssignments, cost, planStart, rules: r });
  const altMs = Date.now() - t1;

  // ---- confidence per block
  const t2 = Date.now();
  if (confidence) {
    const f = factors || learnDurationFactors(feeds.executionLog || []);
    for (const b of plan.blocks) b.confidence = blockConfidence(b, { dayOccs, rules: r, factors: f, tasksById, samples: confidence.samples || 100 });
  }
  const confMs = Date.now() - t2;

  plan.fixedReport = fixed.report;
  plan.search = {
    iterations,
    greedyCost: Math.round(greedyCost),
    finalCost: Math.round(bestCost),
    improvements,
    accepted,
    timeMs: Date.now() - t0,
    searchMs,
    alternativesMs: altMs,
    confidenceMs: confMs,
    candidateCount: [...cands.values()].reduce((s, c) => s + c.length, 0),
    solver,
    milp: milpMeta,
    fallbackReason
  };
  plan.dayOccs = dayOccs;
  return plan;
}

/* ------------------------------------------------------------------------ */
/* Safety conflicts                                                          */
/* ------------------------------------------------------------------------ */

const REASON_RULES = [
  [/possessions on day/, 'Rule: blocks per day'],
  [/simultaneous possessions/, 'Rule: simultaneous possessions'],
  [/premium path/, 'A premium train path crosses every earlier window'],
  [/incompatible works/, 'Incompatible work already planned in the same block'],
  [/JPO/, 'Rule: block length limit'],
  [/depends on|must start after/, 'Waits for a predecessor work'],
  [/share one block/, 'Must share a block with a co-requisite work'],
  [/machine not available/, 'Machine / gang not available'],
  [/gang not available/, 'Machine / gang not available']
];

function explainSafety({ best, detail, tasksById, cands, noEarly, rawCount, fixedAssignments, cost }) {
  const out = [];
  const baseReasons = new Set(detail.hardReasons);
  for (const [id, a] of best) {
    const t = tasksById.get(id);
    if (!t.risk.mandatory) continue;
    const due = Math.max(0, t.dueDay);
    const viol = detail.resources.violations.find((v) => v.taskId === id);
    if (a && a.day <= due && !viol) continue;
    let reason;
    let detailText = null;
    if (a && a.day <= due && viol) {
      reason = 'Machine / gang not available';
      detailText = viol.detail;
    } else if (fixedAssignments.has(id)) reason = 'Held in an approved block that lies after its due day';
    else if (!rawCount.get(id)) reason = 'No free window long enough for the work anywhere in the horizon';
    else if (noEarly.has(id)) reason = 'No free window on or before its due day';
    else {
      // try its on-time windows with everything else held and see what breaks
      const early = cands.get(id).filter((c) => c.day <= due).slice(0, 20);
      const tally = new Map();
      const trial = new Map(best);
      for (const c of early) {
        trial.set(id, { ...c });
        const d = cost(trial, true);
        const mine = d.resources.violations.find((v) => v.taskId === id);
        const fresh = d.hardReasons.filter((x) => !baseReasons.has(x) && !/beyond due day|deferred/.test(x));
        const labels = new Set(fresh.map((x) => (REASON_RULES.find(([re]) => re.test(x)) || [null, null])[1]).filter(Boolean));
        if (mine) labels.add('Machine / gang not available');
        for (const l of labels) tally.set(l, (tally.get(l) || 0) + 1);
      }
      const top = [...tally.entries()].sort((x, y) => y[1] - x[1])[0];
      reason = top ? top[0] : 'Search found no cheaper on-time window (increase iterations)';
      if (top) detailText = `${top[1]} of ${early.length} on-time windows break this rule`;
    }
    out.push({ taskId: id, label: t.label, dueDay: t.dueDay, placedDay: a ? a.day : null, reason, detail: detailText });
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* Alternatives                                                              */
/* ------------------------------------------------------------------------ */

function fmtShift(min) {
  const m = Math.abs(Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  const txt = h ? (r ? `${h} h ${r} min` : `${h} h`) : `${r} min`;
  return min > 0 ? `${txt} later` : `${txt} earlier`;
}

function altNote(c, a, planStart, rules) {
  const lineTxt = c.line !== a.line ? `, ${c.line === 'BOTH' ? 'both lines' : `${c.line} line`}` : '';
  if (c.day === a.day) {
    const night = inDailyWindow(c.start, rules.nightWindow) && inDailyWindow(a.start, rules.nightWindow);
    const shift = c.start === a.start ? 'same start' : fmtShift(c.start - a.start);
    return `${night ? 'Same night' : 'Same day'}, ${shift}${lineTxt}`;
  }
  const dayName = DAY_NAMES_LONG[addDays(planStart, c.day).getDay()];
  return `${dayName} ${minToHHMM(c.start)}${lineTxt}`;
}

/** Up to `max` distinct windows other than the chosen one: some the same day, the rest spread over the nearest days. */
function pickAltPool(list, a, max) {
  const seen = new Set([`${a.day}|${a.line}|${a.start}`]);
  const uniq = [];
  for (const c of list) {
    const k = `${c.day}|${c.line}|${c.start}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(c);
  }
  const byStart = (x, y) => Math.abs(x.start - a.start) - Math.abs(y.start - a.start) || x.start - y.start;
  const same = uniq.filter((c) => c.day === a.day).sort(byStart);
  const groups = new Map();
  for (const c of uniq) {
    if (c.day === a.day) continue;
    if (!groups.has(c.day)) groups.set(c.day, []);
    groups.get(c.day).push(c);
  }
  const dayOrder = [...groups.keys()].sort((x, y) => Math.abs(x - a.day) - Math.abs(y - a.day) || x - y);
  for (const d of dayOrder) groups.get(d).sort(byStart);
  const picked = same.slice(0, Math.ceil(max / 3));
  for (let k = 0; picked.length < max; k++) {
    let added = false;
    for (const d of dayOrder) {
      const g = groups.get(d);
      if (k < g.length) {
        picked.push(g[k]);
        added = true;
        if (picked.length >= max) break;
      }
    }
    if (!added) break;
  }
  for (const c of same.slice(Math.ceil(max / 3))) {
    if (picked.length >= max) break;
    picked.push(c);
  }
  return picked;
}

function altRecord(c, a, d, baseTotal, baseReasons, holder, planStart, rules, scope) {
  const ev = holder && holder.eval ? holder.eval : { weightedDelayMin: 0, trains: [], premiumConflicts: 0 };
  const fresh = d.hardReasons.find((x) => !baseReasons.has(x)) || null;
  return {
    day: c.day,
    line: c.line,
    start: c.start,
    end: c.end,
    startText: minToHHMM(c.start),
    endText: minToHHMM(c.end),
    deltaCost: Math.round(d.total - baseTotal),
    weightedDelayMin: ev.weightedDelayMin,
    trainsAffected: ev.trains.length,
    premiumConflicts: ev.premiumConflicts,
    feasible: d.hard === 0,
    reason: d.hard === 0 ? null : fresh || d.hardReasons[0] || null,
    note: altNote(c, a, planStart, rules),
    scope
  };
}

/**
 * For every scheduled non-fixed task: up to 3 other windows ranked by the
 * change in total plan cost when only that task moves (all others held).
 * At most `perTask` cost evaluations per task.
 */
function computeAlternatives({ best, detail, cands, tasksById, fixedAssignments, cost, perTask, planStart, rules }) {
  const out = {};
  const baseTotal = detail.total;
  const baseReasons = new Set(detail.hardReasons);
  const trial = new Map(best);
  for (const [id, a] of best) {
    if (!a || fixedAssignments.has(id) || tasksById.get(id).targetBlock) continue;
    const pool = pickAltPool(cands.get(id), a, perTask);
    const scored = [];
    for (const c of pool) {
      trial.set(id, { ...c });
      const d = cost(trial, true);
      const holder = d.blocks.find((b) => b.items.some((it) => it.id === id));
      scored.push({ c, d, holder });
    }
    trial.set(id, a);
    scored.sort((x, y) => x.d.total - y.d.total || x.c.day - y.c.day || x.c.start - y.c.start);
    out[id] = scored.slice(0, 3).map((s) => altRecord(s.c, a, s.d, baseTotal, baseReasons, s.holder, planStart, rules, 'task'));
  }
  return out;
}

/**
 * Block alternatives: the alternatives of the block's highest-ARCI work,
 * re-evaluated as a move of the whole block (every work keeps its offset)
 * when all works share one line; otherwise that work's own list.
 */
function attachBlockAlternatives({ plan, best, detail, tasksById, fixedAssignments, cost, planStart, rules }) {
  const baseTotal = detail.total;
  const baseReasons = new Set(detail.hardReasons);
  for (const b of plan.blocks) {
    if (b.fixed) {
      b.alternatives = [];
      continue;
    }
    const movable = b.tasks.filter((x) => !fixedAssignments.has(x.id) && !tasksById.get(x.id).targetBlock);
    if (!movable.length) {
      b.alternatives = [];
      continue;
    }
    const top = movable.slice().sort((x, y) => y.arci - x.arci)[0];
    const own = plan.alternatives[top.id] || [];
    const ta = best.get(top.id);
    const sameLine = b.tasks.every((x) => best.get(x.id) && best.get(x.id).line === ta.line);
    if (b.tasks.length === 1 || !sameLine || movable.length !== b.tasks.length) {
      b.alternatives = own.map((x) => ({ ...x, scope: 'task' }));
      continue;
    }
    const list = [];
    for (const alt of own) {
      const off = alt.start - ta.start;
      const trial = new Map(best);
      let ok = true;
      for (const x of b.tasks) {
        const xa = best.get(x.id);
        const ns = xa.start + off;
        const ne = xa.end + off;
        if (ns < 0 || ne > MIN_PER_DAY) {
          ok = false;
          break;
        }
        trial.set(x.id, { day: alt.day, line: alt.line, start: ns, end: ne, gap: 0 });
      }
      if (!ok) {
        list.push({ ...alt, scope: 'task' });
        continue;
      }
      const d = cost(trial, true);
      const holder = d.blocks.find((blk) => blk.items.some((it) => it.id === top.id));
      const span = { day: alt.day, line: alt.line, start: b.start + off, end: b.end + off };
      list.push(altRecord(span, { day: b.day, line: b.line, start: b.start }, d, baseTotal, baseReasons, holder, planStart, rules, 'block'));
    }
    list.sort((x, y) => x.deltaCost - y.deltaCost);
    b.alternatives = list;
  }
}

/* ------------------------------------------------------------------------ */
/* Confidence                                                                */
/* ------------------------------------------------------------------------ */

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7). */
function normCdf(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

const r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * Block confidence (all computed):
 *  completion        P(every work finishes in the time available): work time
 *                    lognormal around the planned duration, bias and spread
 *                    learned per work type from the execution log; time
 *                    available runs from the work's start to the end of the
 *                    free timetable window that contains the block.
 *  windowReliability Monte-Carlo P(no late train path intrudes into the
 *                    window, headway margin included).
 *  overall           completion × windowReliability.
 */
export function blockConfidence(block, { dayOccs, rules, factors, tasksById, samples = 100 }) {
  const occ = dayOccs[block.day];
  const win = occ ? freeWindowAt(occ, block.sections, block.line, block.start, rules.headwayMarginMin) : null;
  const availEnd = Math.min(MIN_PER_DAY, Math.max(block.end, win ? win.end : block.end));
  let completion = 1;
  const learned = [];
  const defaulted = [];
  for (const bt of block.tasks) {
    const t = tasksById.get(bt.id);
    if (!t) continue;
    const disp = durationDispersion(t.workType, factors);
    (disp.defaulted ? defaulted : learned).push(`${t.workType} n=${disp.n}`);
    const workAvail = availEnd - bt.start - (t.setupMin || 0) - (t.clearanceMin || 0);
    const base = t.baseDurationMin || t.durationMin;
    const p = workAvail <= 0 || !(base > 0) ? 0 : normCdf((Math.log(workAvail / base) - disp.mu) / disp.sd);
    completion *= p;
  }
  let reliability = 1;
  let wr = null;
  if (block.lineClosure && occ) {
    const exclude = new Set((block.affectedTrains || []).map((x) => x.trainId));
    wr = windowReliability(occ, block.sections, block.line, block.start, block.end, rules, { samples, seed: parseInt(stableHash(`${block.day}|${block.line}|${block.start}|${block.end}|${block.sections.join(',')}`, 6), 36), exclude });
    reliability = wr.probability;
  }
  const uniq = (xs) => [...new Set(xs)];
  const basis = [
    `Completion: lognormal work time; spread from execution log (${uniq(learned).join(', ') || 'no work type with ≥ 3 records'})`,
    defaulted.length ? `default spread ${DEFAULT_DURATION_SD} for ${uniq(defaulted).join(', ')} (< 3 records)` : null,
    `time available to ${minToHHMM(availEnd)}${win && win.end > block.end ? ' (end of the free window)' : ' (block end)'}`,
    block.lineClosure ? `Window: ${wr && wr.samples ? `${wr.samples} Monte-Carlo samples, ${wr.threats} earlier train path(s)` : 'no earlier train path on these sections'}; train lateness is an assumption (TRAIN_LATENESS)` : 'Window: disconnection, no line closure — lateness not applicable',
    block.tasks.length > 1 ? 'works assumed independent' : null
  ].filter(Boolean).join('; ');
  return { completion: r3(completion), windowReliability: r3(reliability), overall: r3(completion * reliability), basis, availableUntil: availEnd };
}

/* ------------------------------------------------------------------------ */
/* Output                                                                    */
/* ------------------------------------------------------------------------ */

export function materialise({ corridor, feeds, tasksById, assign, detail, days, planStart, label, weights, rules, fixedBlocks = [] }) {
  const code = corridor.code.replace('–', '');
  const fixedList = (Array.isArray(fixedBlocks) ? fixedBlocks : [])
    .filter((f) => f && f.id)
    .map((f) => ({ id: f.id, ids: new Set(Array.isArray(f.taskIds) ? f.taskIds : Array.isArray(f.tasks) ? f.tasks.map((x) => x.id) : []) }));
  const sorted = detail.blocks.slice().sort((a, b) => a.day - b.day || a.start - b.start);
  // approvals stay attached: a block made only of works of one fixed block keeps that block's id
  const fixedOf = sorted.map((b) => {
    if (!fixedList.length || !b.items.length) return null;
    return fixedList.find((f) => b.items.every((it) => f.ids.has(it.task.id))) || null;
  });
  const reserved = new Set();
  const fixedIdFor = sorted.map((b, i) => {
    const f = fixedOf[i];
    if (!f || reserved.has(f.id)) return null;
    reserved.add(f.id);
    return f.id;
  });
  const seen = new Set(reserved);
  const blocks = sorted.map((b, bi) => {
    const date = addDays(planStart, b.day);
    let id = fixedIdFor[bi];
    if (!id) {
      // Content-derived id: the same works on the same day, line and window keep
      // the same id across re-plans; any change yields a new block to approve.
      const signature = `${b.day}|${b.line}|${b.start}|${b.end}|${b.items.map((it) => it.task.id).sort().join(',')}`;
      id = `BLK-${code}-${stableHash(signature)}`;
      for (let k = 2; seen.has(id); k++) id = `BLK-${code}-${stableHash(`${signature}#${k}`)}`;
      seen.add(id);
    }
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
      id,
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
      fixed: !!fixedOf[bi],
      status: 'PROPOSED'
    };
  });
  const scheduled = [];
  const deferred = [];
  const safetyConflicts = [];
  for (const [id, a] of assign) {
    const t = tasksById.get(id);
    if (a) scheduled.push({ taskId: id, day: a.day, line: a.line, start: a.start, end: a.end });
    else deferred.push({ taskId: id, arci: t.risk.arci, urgency: t.risk.urgency, reason: deferReason(t, detail) });
    if (t.risk.mandatory && (!a || a.day > Math.max(0, t.dueDay))) safetyConflicts.push({ taskId: id, label: t.label, dueDay: t.dueDay, placedDay: a ? a.day : null, reason: a ? 'Placed after its due day' : 'Not placed in this horizon', detail: null });
  }
  return {
    label,
    corridorId: corridor.id,
    planStart: isoDate(planStart),
    days,
    blocks,
    scheduled,
    deferred,
    safetyConflicts,
    cost: { total: Math.round(detail.total), delay: Math.round(detail.delayCost), downtime: Math.round(detail.downtimeCost), spread: Math.round(detail.spreadCost), waiting: Math.round(detail.waitCost), deferred: Math.round(detail.deferCost), preference: Math.round(detail.preferenceCost || 0), weather: Math.round(detail.weatherCost || 0), colocationBonus: Math.round(detail.colocationBonus), hard: detail.hard, hardReasons: detail.hardReasons },
    resourceViolations: detail.resources.violations,
    machineUse: Object.fromEntries(detail.resources.machineUse),
    crewUse: Object.fromEntries(detail.resources.crewUse),
    weights,
    rules
  };
}

function deferReason(t, detail) {
  if (t.risk.mandatory) return 'Mandatory work with no window in this horizon — see safety conflicts';
  if (t.capital) return 'Capital work — planned in the 26-week programme';
  if (t.risk.arci < 0.4) return 'Low ARCI: deferred to next cycle, no TSR in force';
  return 'No feasible window without disturbing protected paths / resources this cycle';
}
