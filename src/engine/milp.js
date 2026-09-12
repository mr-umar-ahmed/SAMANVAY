/**
 * Exact possession-assignment model (mixed-integer linear program) for the
 * block plan, solved by HiGHS compiled to WebAssembly (npm `highs`).
 *
 * It plugs into scheduler.planHorizon as `construct(input)`: it replaces the
 * greedy construction, and simulated annealing then polishes the result under
 * the scheduler's own cost function. The formulation is documented in
 * docs/MILP-FORMULATION.md; in short:
 *
 *   x[i,k]   task i uses candidate window k                        (binary)
 *   u[i]     task i is deferred this horizon                       (binary)
 *   p[P]     possession P is opened. Every line-closure candidate is a
 *            potential possession: its rectangle (day, line, sections, span)
 *            becomes the block's rectangle, and other works whose own
 *            rectangle fits inside it join it as members        (binary)
 *   d[P,D]   department D (other than the leader's) works inside P  (bonus)
 *   n[j,k,P] disconnection candidate nested inside closure possession P
 *
 * Two open possessions never share a (day, block section, line) at the same
 * minute, so every open possession is exactly one block of the scheduler's
 * formBlocks(): downtime, spread, train delay and the co-location bonus are
 * priced per possession with evaluateWindow(), not per task. Blocks per day,
 * simultaneous closures (the scheduler's per-block rule), the JPO length
 * limit, premium paths, incompatible works, requisition sequences and joint
 * blocks are constraints. Machine units and gangs come in two strengths: as
 * capacity limits (necessary conditions, phase 1) and as an exact model of the
 * scheduler's first-fit allocation incl. travel time and gang reach (phase 2,
 * solved on a neighbourhood of the phase-1 plan when that plan fails it).
 *
 * Pure functions (buildMilpModel, toLp, solveLp, parseMilpSolution,
 * verifyAssignment) are exported for the tests; makeMilpConstruct(highs,
 * options) is the plug-in. Synchronous once `highs` is loaded.
 */
import { evaluateWindow } from './delayModel.js';
import * as constants from './constants.js';
import * as scheduler from './scheduler.js';

const { INCOMPATIBLE_PAIRS } = constants;
/** Same penalty unit as scheduler.js so objective values are comparable. */
const HARD = 1e6;
/** scheduler travelMin(): every move of a machine between two jobs costs at least 20 min positioning. */
const MACHINE_POSITIONING_MIN = 20;
const MIN_PER_DAY = 1440;

/** Penalty ladder of the scheduler in this tree (read lazily: no load-order dependency). */
function penalties() {
  const p = scheduler.PENALTY;
  return p && Number.isFinite(p.MANDATORY_DEFERRED) ? p : { MANDATORY_DEFERRED: HARD, MANDATORY_LATE: HARD / 2, RULE: HARD };
}

const incompatibleSet = new Set(INCOMPATIBLE_PAIRS.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
const isIncompatible = (a, b) => incompatibleSet.has(`${a}|${b}`);
const lineOk = (x, y) => x === y || x === 'BOTH' || y === 'BOTH';
const lineWithin = (inner, outer) => inner === outer || outer === 'BOTH';
const cellLines = (l) => (l === 'BOTH' ? ['UP', 'DN'] : [l]);
const subsetOf = (a, b) => a.every((s) => b.includes(s));
const intersects = (a, b) => a.some((s) => b.includes(s));
const sortedSections = (s) => [...s].sort((a, b) => a - b);
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const isHardType = (type) => type !== 'MANDATORY_DEFERRED' && type !== 'MANDATORY_LATE';

/* ------------------------------------------------------------------------ */
/* Scheduler rules mirrored for pre-filtering, pricing and verification      */
/* ------------------------------------------------------------------------ */

function inDailyWindow(minute, win) {
  if (!win || win.length < 2) return false;
  const m = ((minute % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
  const [from, to] = win;
  return from <= to ? m >= from && m < to : m >= from || m < to;
}

function machineUnits(machines, type, day) {
  return machines.filter((m) => m.type === type && !(m.unavailable || []).some((u) => day >= u.fromDay && day <= u.toDay));
}

/** Gangs the scheduler's allocateResources() may give task t on `day` (incl. its mandatory relaxation). */
function eligibleGangs(crews, t, day) {
  const dow = day % 7;
  let gangs = crews.filter((c) => c.type === t.crew && c.restDay !== dow && Math.abs(c.baseKm - t.startKm) <= c.reachKm);
  if (!gangs.length && t.risk && t.risk.mandatory) gangs = crews.filter((c) => c.type === t.crew && Math.abs(c.baseKm - t.startKm) <= c.reachKm * 1.5);
  return gangs;
}

/**
 * Per-task terms of placing t at candidate c (scheduler makeEvaluator):
 * waiting (TSR loss + risk) and lateness, the mandatory-late penalty, the
 * requisition preference, and the weather screen's outdoor penalty for line
 * closures (when the caller passes `weather`, one entry per day).
 */
function placementParts(t, c, loss, w, rules, weather = null) {
  let wait = w.tsr * loss * c.day + w.risk * t.risk.arci * c.day * 0.5;
  if (c.day > t.dueDay) wait += w.risk * t.risk.arci * (c.day - t.dueDay);
  const late = t.risk.mandatory && c.day > Math.max(0, t.dueDay) ? penalties().MANDATORY_LATE : 0;
  const prefW = Number.isFinite(w.preference) ? w.preference : (constants.DEFAULT_WEIGHTS && constants.DEFAULT_WEIGHTS.preference) || 0;
  let preference = 0;
  if (t.preferredDay != null && Number.isFinite(t.preferredDay)) preference += prefW * Math.abs(c.day - t.preferredDay);
  if (t.preferredWindow === 'night' || t.preferredWindow === 'day') {
    const night = inDailyWindow(c.start, rules.nightWindow);
    if ((t.preferredWindow === 'night') !== night) preference += prefW * (constants.PREFERENCE_WINDOW_FACTOR ?? 3);
  }
  const fx = weather && weather[c.day];
  const outdoor = fx && fx.outdoorPenalty && t.closure === 'LINE' ? w.downtime * fx.outdoorPenalty * (c.end - c.start) : 0;
  return { wait, late, preference, weather: outdoor };
}

function placementCost(t, c, loss, w, rules, weather = null) {
  const p = placementParts(t, c, loss, w, rules, weather);
  return p.wait + p.late + p.preference + p.weather;
}

function deferCost(t, loss, w, days) {
  return w.risk * t.risk.arci * days + w.tsr * loss * days + (t.risk.mandatory ? penalties().MANDATORY_DEFERRED : 0);
}

/** Downtime + spread + train delay of one closure rectangle (scheduler makeEvaluator terms). */
function rectCost(ev, line, sections, a, b, w) {
  return w.delay * ev.weightedDelayMin + w.downtime * (b - a) * sections.length * (line === 'BOTH' ? 2 : 1) + w.spread;
}

/** scheduler canShare(): could the two placements end up in one block? */
function canShare(x, cx, y, cy) {
  if (!cx || !cy || cx.day !== cy.day || !lineOk(cx.line, cy.line) || !intersects(x.sections, y.sections)) return false;
  const xl = x.closure === 'LINE';
  const yl = y.closure === 'LINE';
  if (xl === yl) return Math.max(cx.start, cy.start) < Math.min(cx.end, cy.end);
  const [inner, outer] = xl ? [cy, cx] : [cx, cy];
  return inner.start >= outer.start && inner.end <= outer.end;
}

/** Requisition pairs among the tasks present (scheduler pairRules()). */
function pairRules(tasks, tasksById) {
  const depPairs = [];
  const coPairs = [];
  const seen = new Set();
  for (const t of tasks) {
    for (const p of Array.isArray(t.dependsOn) ? t.dependsOn : []) if (p !== t.id && tasksById.has(p)) depPairs.push([p, t.id]);
    for (const p of Array.isArray(t.coRequireWith) ? t.coRequireWith : []) {
      if (p === t.id || !tasksById.has(p)) continue;
      const pair = t.id < p ? [t.id, p] : [p, t.id];
      const key = pair.join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      coPairs.push(pair);
    }
  }
  return { depPairs, coPairs };
}

/**
 * Maximal cliques of a family of half-open intervals [a, b). A point clique
 * is kept only where some member ends before the next start point, which
 * yields exactly the maximal ones.
 */
function maximalCliques(items) {
  if (items.length < 2) return items.length ? [items.map((it) => it.ref)] : [];
  const starts = [...new Set(items.map((it) => it.a))].sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i < starts.length; i++) {
    const t = starts[i];
    const active = items.filter((it) => it.a <= t && t < it.b);
    const next = i + 1 < starts.length ? starts[i + 1] : Infinity;
    if (active.some((it) => it.b <= next)) out.push(active.map((it) => it.ref));
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* Model                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Build the MILP for one planning input (the object scheduler.planHorizon
 * passes to `construct`). Returns { lp, index }: `lp` is the full model as
 * CPLEX-LP text; `index` maps columns back to decisions and keeps the tagged
 * rows so sub-models can be serialised with toLp(index, { groups, fix }).
 * Options: maxCandidatesPerTask (default 60 here, 20 in the plug-in),
 * perDayCandidates (keep the cheapest n windows of every day first).
 */
export function buildMilpModel(input, options = {}) {
  const { tasks, cands, dayOccs, rules, weights: w, machines = [], crews = [], days, tsrLoss = new Map(), fixedAssignments = new Map(), allowPremium = false, weather = null } = input;
  const tasksById = input.tasksById || new Map(tasks.map((t) => [t.id, t]));
  const maxPer = options.maxCandidatesPerTask ?? 60;

  const evalCache = new Map();
  const evalRect = (day, line, sections, a, b) => {
    const key = `${day}|${line}|${sections.join(',')}|${a}|${b}`;
    let r = evalCache.get(key);
    if (!r) {
      r = evaluateWindow(dayOccs[day], sections, line, a, b, rules, { allowPremium });
      evalCache.set(key, r);
    }
    return r;
  };

  // every row / column belongs to a group so the solve can serialise sub-models:
  //   core  assignment, possessions, co-location, controller workload, pairs
  //   hall  machine / gang capacity as necessary conditions (light, phase 1)
  //   ff    the scheduler's first-fit unit / gang allocation, exactly (phase 2)
  let group = 'core';
  const vars = [];
  const varByName = new Map();
  const addVar = (name, kind, obj, type = 'bin', extra = {}) => {
    const v = { name, kind, obj, type, group, ...extra };
    vars.push(v);
    varByName.set(name, v);
    return v;
  };
  const rows = [];
  const rowKeys = new Set();
  const addRow = (prefix, terms, sense, rhs, key = null) => {
    if (key) {
      if (rowKeys.has(key)) return null;
      rowKeys.add(key);
    }
    const r = { name: `${prefix}${rows.length}`, terms, sense, rhs, group };
    rows.push(r);
    return r;
  };

  /* ---- tasks and candidate filtering ---------------------------------- */
  const dropped = { resource: 0, premium: 0, length: 0, pruned: 0 };
  const T = tasks.map((t, ti) => {
    const fixed = fixedAssignments.has(t.id);
    const loss = tsrLoss.get(t.id) || 0;
    const sections = sortedSections(t.sections);
    let list = (cands.get(t.id) || []).map((c) => ({ c }));
    if (!fixed) {
      const reject = (c) => {
        // a unit / gang the scheduler could never give on that day: certain violation
        if (t.machine && machineUnits(machines, t.machine, c.day).length === 0) return 'resource';
        if (t.crew && eligibleGangs(crews, t, c.day).length === 0) return 'resource';
        if (t.closure === 'LINE' && c.end - c.start > rules.maxBlockMin) return 'length';
        if (t.closure === 'LINE' && !evalRect(c.day, c.line, sections, c.start, c.end).feasible) return 'premium';
        return null;
      };
      list = list.filter(({ c }) => {
        const why = reject(c);
        if (why) dropped[why]++;
        return !why;
      });
      if (list.length > maxPer) {
        const score = ({ c }) => placementCost(t, c, loss, w, rules, weather) + (t.closure === 'LINE' ? w.delay * evalRect(c.day, c.line, sections, c.start, c.end).weightedDelayMin : 0);
        const ranked = list.map((it, k) => ({ it, s: score(it), k })).sort((a, b) => a.s - b.s || a.it.c.day - b.it.c.day || a.k - b.k);
        dropped.pruned += list.length - maxPer;
        if (options.perDayCandidates) {
          // keep the cheapest few windows of every day, then fill up cheapest-first
          const keep = new Set();
          const perDay = new Map();
          for (const r of ranked) {
            const n = perDay.get(r.it.c.day) || 0;
            if (n < options.perDayCandidates && keep.size < maxPer) {
              keep.add(r);
              perDay.set(r.it.c.day, n + 1);
            }
          }
          for (const r of ranked) if (keep.size < maxPer) keep.add(r);
          list = ranked.filter((r) => keep.has(r)).map((r) => r.it);
        } else list = ranked.slice(0, maxPer).map((r) => r.it);
      }
    }
    return { t, ti, fixed, loss, sections, list };
  });
  const infoById = new Map(T.map((i) => [i.t.id, i]));

  /* ---- x and u --------------------------------------------------------- */
  const xRefs = [];
  for (const info of T) {
    const { t, ti, fixed, loss } = info;
    info.list.forEach((it, k) => {
      it.k = k;
      it.x = addVar(`x${ti}_${k}`, 'x', placementCost(t, it.c, loss, w, rules, weather), 'bin', { ti, k, cand: it.c });
      xRefs.push({ v: it.x, c: it.c, info });
    });
    if (fixed) {
      for (const it of info.list) addRow('fx', [[it.x.name, 1]], '=', 1);
    } else {
      info.u = addVar(`u${ti}`, 'u', deferCost(t, loss, w, days), 'bin', { ti });
      addRow('as', info.list.map((it) => [it.x.name, 1]).concat([[info.u.name, 1]]), '=', 1);
    }
  }

  /* ---- possessions ----------------------------------------------------- */
  const poss = [];
  // approved (fixed) closure works are grouped exactly as formBlocks() groups them
  const fixedClosure = T.filter((i) => i.fixed && i.t.closure === 'LINE' && i.list.length);
  const parent = fixedClosure.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < fixedClosure.length; i++) {
    for (let j = i + 1; j < fixedClosure.length; j++) {
      const cx = fixedClosure[i].list[0].c;
      const cy = fixedClosure[j].list[0].c;
      if (cx.day !== cy.day || !lineOk(cx.line, cy.line) || !intersects(fixedClosure[i].sections, fixedClosure[j].sections)) continue;
      if (Math.max(cx.start, cy.start) >= Math.min(cx.end, cy.end)) continue;
      parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  fixedClosure.forEach((it, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(it);
  });
  for (const g of groups.values()) {
    const cs = g.map((it) => it.list[0].c);
    const sections = sortedSections([...new Set(g.flatMap((it) => it.sections))]);
    const line = cs.some((c) => c.line === 'BOTH') ? 'BOTH' : cs[0].line;
    const a = Math.min(...cs.map((c) => c.start));
    const b = Math.max(...cs.map((c) => c.end));
    const depts = new Set(g.map((it) => it.t.dept));
    const P = { idx: poss.length, day: cs[0].day, line, sections, a, b, fixed: true, leaderTi: null, leaderK: null, depts, types: g.map((it) => it.t.workType) };
    P.v = addVar(`pf${P.idx}`, 'p', rectCost(evalRect(P.day, line, sections, a, b), line, sections, a, b, w) - w.colocation * (depts.size - 1), 'bin', { poss: P });
    addRow('fp', [[P.v.name, 1]], '=', 1);
    poss.push(P);
  }
  for (const info of T) {
    if (info.fixed || info.t.closure !== 'LINE') continue;
    for (const it of info.list) {
      const c = it.c;
      const P = { idx: poss.length, day: c.day, line: c.line, sections: info.sections, a: c.start, b: c.end, fixed: false, leaderTi: info.ti, leaderK: it.k, depts: new Set([info.t.dept]), types: [info.t.workType] };
      P.v = addVar(`p${info.ti}_${it.k}`, 'p', rectCost(evalRect(c.day, c.line, info.sections, c.start, c.end), c.line, info.sections, c.start, c.end, w), 'bin', { poss: P });
      it.p = P;
      addRow('lx', [[P.v.name, 1], [it.x.name, -1]], '<=', 0); // a possession needs its leader
      poss.push(P);
    }
  }
  const possByDay = Array.from({ length: days }, () => []);
  for (const P of poss) if (possByDay[P.day]) possByDay[P.day].push(P);
  const compatibleWith = (P, type) => !P.types.some((ty) => isIncompatible(ty, type));

  /* ---- membership, nesting, co-location -------------------------------- */
  const inP = poss.map(() => []); // candidates that sit inside P when chosen
  for (const info of T) {
    const { t, ti, fixed } = info;
    for (const it of info.list) {
      const c = it.c;
      const here = possByDay[c.day] || [];
      if (t.closure === 'LINE') {
        if (fixed) continue; // members of their fixed group by construction
        const containers = [];
        for (const P of here) {
          if (P.leaderTi === ti) {
            if (P.leaderK === it.k) containers.push(P);
            continue;
          }
          if (!lineWithin(c.line, P.line) || !subsetOf(info.sections, P.sections) || P.a > c.start || c.end > P.b) continue;
          if (!compatibleWith(P, t.workType)) {
            addRow('ic', [[it.x.name, 1], [P.v.name, 1]], '<=', 1);
            continue;
          }
          containers.push(P);
          inP[P.idx].push({ x: it.x, ti, dept: t.dept, type: t.workType });
        }
        // every chosen closure window lies in exactly one open possession (its own or a host's)
        addRow('mb', [[it.x.name, 1]].concat(containers.map((P) => [P.v.name, -1])), '<=', 0);
      } else {
        const nest = [];
        for (const P of here) {
          if (!lineOk(P.line, c.line) || !intersects(P.sections, info.sections) || P.a > c.start || c.end > P.b) continue;
          if (!compatibleWith(P, t.workType)) {
            // nesting is automatic in formBlocks(): the window may not lie inside P at all
            addRow('ic', [[it.x.name, 1], [P.v.name, 1]], '<=', 1);
            continue;
          }
          const n = addVar(`n${ti}_${it.k}_${P.idx}`, 'n', -w.colocation * 0.5, 'cont', { ti, poss: P });
          addRow('nh', [[n.name, 1], [P.v.name, -1]], '<=', 0);
          nest.push(n);
          inP[P.idx].push({ x: it.x, n, ti, dept: t.dept, type: t.workType });
        }
        if (nest.length) addRow('nx', nest.map((n) => [n.name, 1]).concat([[it.x.name, -1]]), '<=', 0);
      }
    }
  }
  let triples = 0;
  for (const P of poss) {
    const members = inP[P.idx];
    if (!members.length) continue;
    // co-location: one bonus per extra department present in the possession
    const byDept = new Map();
    for (const m of members) {
      if (P.depts.has(m.dept)) continue;
      if (!byDept.has(m.dept)) byDept.set(m.dept, []);
      byDept.get(m.dept).push(m.n ? m.n : m.x);
    }
    for (const [dept, list] of byDept) {
      const dv = addVar(`d${P.idx}_${dept}`, 'd', -w.colocation, 'cont', { poss: P, dept });
      addRow('dp', [[dv.name, 1], [P.v.name, -1]], '<=', 0);
      addRow('dm', [[dv.name, 1]].concat(list.map((v) => [v.name, -1])), '<=', 0);
    }
    // incompatible works that would both sit inside this possession
    for (let a = 0; a < members.length; a++) {
      for (let b = a + 1; b < members.length; b++) {
        const ma = members[a];
        const mb = members[b];
        if (ma.ti === mb.ti || !isIncompatible(ma.type, mb.type)) continue;
        triples++;
        addRow('it', [[ma.x.name, 1], [mb.x.name, 1], [P.v.name, 1]], '<=', 2);
      }
    }
  }

  /* ---- possession disjointness per (day, section, line) ---------------- */
  const cells = new Map();
  for (const P of poss) {
    for (const s of P.sections) {
      for (const l of cellLines(P.line)) {
        const key = `${P.day}|${s}|${l}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(P);
      }
    }
  }
  for (const list of cells.values()) {
    for (const clique of maximalCliques(list.map((P) => ({ a: P.a, b: P.b, ref: P })))) {
      if (clique.length < 2) continue;
      addRow('cl', clique.map((P) => [P.v.name, 1]), '<=', 1, `cl|${clique.map((P) => P.idx).sort((x, y) => x - y).join(',')}`);
    }
  }

  /* ---- controller workload --------------------------------------------- */
  // Per day, cumulative counters over the possession start / end minutes:
  //   S(t) = open possessions starting at or before t, E(t) = ending at or before t.
  // Possessions overlapping P (itself included) = S(last start before P.b) - E(P.a),
  // so the scheduler's per-block rule and the instant-wise limit are 3-term rows.
  const maxC = rules.maxConcurrentBlocks;
  for (let d = 0; d < days; d++) {
    const list = possByDay[d];
    if (!list.length) continue;
    const fixedHere = list.filter((P) => P.fixed).length;
    const dayCap = Math.max(rules.maxBlocksPerDay, fixedHere);
    if (list.length > rules.maxBlocksPerDay) addRow('bd', list.map((P) => [P.v.name, 1]), '<=', dayCap);
    if (list.length <= maxC) continue;
    const times = [...new Set(list.flatMap((P) => [P.a, P.b]))].sort((x, y) => x - y);
    const at = new Map(times.map((t, k) => [t, k]));
    const S = times.map((_, k) => addVar(`sc${d}_${k}`, 'c', 0, 'cont', { ub: Infinity }));
    const E = times.map((_, k) => addVar(`ec${d}_${k}`, 'c', 0, 'cont', { ub: Infinity }));
    times.forEach((t, k) => {
      const starting = list.filter((P) => P.a === t).map((P) => [P.v.name, -1]);
      const ending = list.filter((P) => P.b === t).map((P) => [P.v.name, -1]);
      addRow('sd', [[S[k].name, 1]].concat(k ? [[S[k - 1].name, -1]] : [], starting), '=', 0);
      addRow('ed', [[E[k].name, 1]].concat(k ? [[E[k - 1].name, -1]] : [], ending), '=', 0);
    });
    const fixedOverlap = (P) => list.filter((o) => o.fixed && Math.max(o.a, P.a) < Math.min(o.b, P.b)).length;
    // instant-wise: at every start minute at most maxC possessions are open
    for (const t of new Set(list.map((P) => P.a))) {
      const k = at.get(t);
      const fx = list.filter((o) => o.fixed && o.a <= t && t < o.b).length;
      addRow('cc', [[S[k].name, 1], [E[k].name, -1]], '<=', Math.max(maxC, fx));
    }
    // per block (the scheduler's rule): an open P overlaps at most maxC - 1 others
    const M = dayCap - maxC;
    if (M <= 0) continue;
    for (const P of list) {
      const kb = times.findIndex((t) => t >= P.b) - 1; // last event strictly before P.b
      const kLastStart = (() => {
        for (let k = kb; k >= 0; k--) if (list.some((o) => o.a === times[k])) return k;
        return -1;
      })();
      if (kLastStart < 0) continue;
      const fx = P.fixed ? fixedOverlap(P) : 0;
      addRow('cx', [[S[kLastStart].name, 1], [E[at.get(P.a)].name, -1], [P.v.name, M]], '<=', M + Math.max(maxC, fx), `cx|${P.idx}`);
    }
  }

  /* ---- requisition sequences and joint blocks --------------------------- */
  const { depPairs, coPairs } = pairRules(tasks, tasksById);
  for (const [pre, dep] of depPairs) {
    const ip = infoById.get(pre);
    const id = infoById.get(dep);
    for (const it of id.list) {
      const before = ip.list.filter((pt) => pt.c.day < it.c.day || (pt.c.day === it.c.day && pt.c.end <= it.c.start));
      addRow('sq', [[it.x.name, 1]].concat(before.map((pt) => [pt.x.name, -1])), '<=', 0);
    }
  }
  for (const [a, b] of coPairs) {
    const ia = infoById.get(a);
    const ib = infoById.get(b);
    // both placed or both deferred ...
    const placed = (info) => info.list.map((it) => [it.x.name, 1]);
    addRow('jb', placed(ia).concat(placed(ib).map(([n]) => [n, -1])), '=', 0);
    // ... and in windows that land in one block
    for (const [x, y] of [[ia, ib], [ib, ia]]) {
      for (const it of x.list) {
        const mates = y.list.filter((ot) => canShare(x.t, it.c, y.t, ot.c));
        addRow('jw', [[it.x.name, 1]].concat(mates.map((ot) => [ot.x.name, -1])), '<=', 0);
      }
    }
  }

  /* ---- machines and gangs, necessary conditions (group "hall") ----------- */
  group = 'hall';
  let resourceRows = 0;
  const jobsOf = (key) => {
    const m = new Map();
    for (const r of xRefs) {
      const k = key(r);
      if (k === null) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return m;
  };
  for (const [key, list] of jobsOf((r) => (r.info.t.machine ? `${r.c.day}|${r.info.t.machine}` : null))) {
    const [dayS, type] = key.split('|');
    const units = machineUnits(machines, type, Number(dayS));
    // two jobs of one unit need end1 + travel (>= 20 min positioning) <= start2
    const jobs = list.map((r) => ({ a: r.c.start - MACHINE_POSITIONING_MIN, b: r.c.end, ref: r }));
    for (const clique of maximalCliques(jobs)) {
      if (clique.length <= units.length) continue;
      resourceRows++;
      addRow('mc', clique.map((r) => [r.v.name, 1]), '<=', Math.max(units.length, clique.filter((r) => r.info.fixed).length));
    }
    if (units.length !== 1) continue;
    // one unit: two jobs it cannot chain in either order may not both be chosen
    const speed = units[0].speedKmph || 40;
    const chain = (p, q) => p.c.end + (Math.abs(p.info.t.endKm - q.info.t.startKm) / speed) * 60 + MACHINE_POSITIONING_MIN <= q.c.start;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const p = list[i];
        const q = list[j];
        if (p.info === q.info || (p.info.fixed && q.info.fixed) || Math.max(p.c.start - MACHINE_POSITIONING_MIN, q.c.start - MACHINE_POSITIONING_MIN) < Math.min(p.c.end, q.c.end)) continue;
        if (chain(p, q) || chain(q, p)) continue;
        resourceRows++;
        addRow('mt', [[p.v.name, 1], [q.v.name, 1]], '<=', 1);
      }
    }
  }
  for (const [dkey, list] of jobsOf((r) => (r.info.t.crew ? `${r.c.day}|${r.info.t.crew}` : null))) {
    const day = Number(dkey.split('|')[0]);
    const jobs = list.map((r) => {
      const gangs = eligibleGangs(crews, r.info.t, day);
      return { r, gangs, set: gangs.map((g) => g.id).sort() };
    });
    const sets = new Map();
    for (const j of jobs) if (j.set.length) sets.set(j.set.join(','), j);
    for (const [skey, proto] of sets) {
      // Hall-type condition: jobs that can only use gangs in E never need more than |E| of them
      const inside = jobs.filter((j) => j.set.length && subsetOf(j.set, proto.set));
      for (const clique of maximalCliques(inside.map((j) => ({ a: j.r.c.start, b: j.r.c.end, ref: j.r })))) {
        if (clique.length <= proto.set.length) continue;
        resourceRows++;
        addRow('gc', clique.map((r) => [r.v.name, 1]), '<=', Math.max(proto.set.length, clique.filter((r) => r.info.fixed).length), `gc|${dkey}|${clique.map((r) => r.v.name).sort().join(',')}`);
      }
      const minutes = proto.gangs.reduce((sum, g) => sum + (g.maxMinPerDay || 480), 0);
      if (inside.reduce((sum, j) => sum + (j.r.c.end - j.r.c.start), 0) > minutes) {
        resourceRows++;
        addRow('gm', inside.map((j) => [j.r.v.name, j.r.c.end - j.r.c.start]), '<=', Math.max(minutes, inside.filter((j) => j.r.info.fixed).reduce((sum, j) => sum + (j.r.c.end - j.r.c.start), 0)), `gm|${dkey}|${skey}`);
      }
    }
  }

  /* ---- machines and gangs: the scheduler's first-fit allocation (group "ff") */
  // allocateResources() handles a day's jobs in start order (ties: task order)
  // and gives each the first unit / gang in list order that is free. That order
  // is fixed over candidate windows, so first-fit is modelled exactly: an
  // assignment column per (job, eligible unit), and a job may take the q-th
  // unit only if every earlier unit in the list is unavailable to it.
  group = 'ff';
  let firstFitRows = 0;
  const before = (p, q) => p.c.start < q.c.start || (p.c.start === q.c.start && p.info.ti < q.info.ti);
  const overlap = (p, q) => Math.max(p.c.start, q.c.start) < Math.min(p.c.end, q.c.end);
  // (day, type) groups the approved works alone already overload are left to verification
  const fixedOnly = new Map([...fixedAssignments].filter(([id]) => tasksById.has(id)));
  const fixedTrouble = new Set(allocateMirror(fixedOnly, tasksById, machines, crews).violations.map((v) => `${v.day}|${v.resource}`));

  for (const [key, jobs] of jobsOf((r) => (r.info.t.machine ? `${r.c.day}|${r.info.t.machine}` : null))) {
    if (fixedTrouble.has(key)) continue;
    const [dayS, type] = key.split('|');
    const units = machineUnits(machines, type, Number(dayS));
    const chain = (p, q, m) => p.c.end + (Math.abs(p.info.t.endKm - q.info.t.startKm) / m.speedKmph) * 60 + MACHINE_POSITIONING_MIN <= q.c.start;
    for (const r of jobs) {
      r.units = units;
      r.w = units.map((m, ui) => (units.length === 1 ? r.v.name : addVar(`wm${r.info.ti}_${r.v.k}_${ui}`, 'w', 0, 'bin').name));
      if (units.length > 1) addRow('wa', r.w.map((n) => [n, 1]).concat([[r.v.name, -1]]), '=', 0);
    }
    units.forEach((m, ui) => {
      // one unit: no two overlapping jobs, and every earlier job must be able to reach the next site in time
      for (const clique of maximalCliques(jobs.map((r) => ({ a: r.c.start, b: r.c.end, ref: r })))) {
        if (clique.length < 2) continue;
        firstFitRows++;
        addRow('wo', clique.map((r) => [r.w[ui], 1]), '<=', 1);
      }
      for (const j of jobs) {
        const nc = jobs.filter((k) => k.info !== j.info && before(k, j) && !overlap(k, j) && !chain(k, j, m));
        if (!nc.length) continue;
        firstFitRows++;
        addRow('wt', nc.map((k) => [k.w[ui], 1]).concat([[j.w[ui], nc.length]]), '<=', nc.length);
      }
    });
    if (units.length < 2) continue;
    for (const j of jobs) {
      for (let q = 1; q < units.length; q++) {
        for (let i = 0; i < q; i++) {
          // unit i is unavailable to j only if an earlier job on it cannot hand over in time
          const blockers = jobs.filter((k) => k.info !== j.info && before(k, j) && !chain(k, j, units[i]));
          firstFitRows++;
          addRow('wf', [[j.w[q], 1]].concat(blockers.map((k) => [k.w[i], -1])), '<=', 0);
        }
      }
    }
  }

  for (const [key, jobs] of jobsOf((r) => (r.info.t.crew ? `${r.c.day}|${r.info.t.crew}` : null))) {
    if (fixedTrouble.has(key)) continue;
    const day = Number(key.split('|')[0]);
    for (const r of jobs) {
      r.gangs = eligibleGangs(crews, r.info.t, day);
      r.z = new Map(r.gangs.map((g) => [g.id, r.gangs.length === 1 ? r.v.name : addVar(`zg${r.info.ti}_${r.v.k}_${g.id.replace(/[^A-Za-z0-9]/g, '')}`, 'z', 0, 'bin').name]));
      if (r.gangs.length > 1) addRow('za', [...r.z.values()].map((n) => [n, 1]).concat([[r.v.name, -1]]), '=', 0);
    }
    const gangIds = [...new Set(jobs.flatMap((r) => r.gangs.map((g) => g.id)))];
    for (const gid of gangIds) {
      const g = crews.find((c) => c.id === gid);
      const on = jobs.filter((r) => r.z.has(gid));
      for (const clique of maximalCliques(on.map((r) => ({ a: r.c.start, b: r.c.end, ref: r })))) {
        if (clique.length < 2) continue;
        firstFitRows++;
        addRow('zo', clique.map((r) => [r.z.get(gid), 1]), '<=', 1);
      }
      if (on.reduce((s, r) => s + (r.c.end - r.c.start), 0) > g.maxMinPerDay) {
        firstFitRows++;
        addRow('zm', on.map((r) => [r.z.get(gid), r.c.end - r.c.start]), '<=', g.maxMinPerDay);
      }
    }
    for (const j of jobs) {
      if (j.gangs.length < 2) continue;
      const len = j.c.end - j.c.start;
      const shortVar = new Map();
      j.gangs.forEach((gq, q) => {
        if (q === 0) return;
        for (let i = 0; i < q; i++) {
          const gi = j.gangs[i];
          const earlier = jobs.filter((k) => k.info !== j.info && before(k, j) && k.z.has(gi.id));
          const busy = earlier.filter((k) => overlap(k, j)).map((k) => [k.z.get(gi.id), -1]);
          // gang i may also be out of minutes: s = 1 needs its earlier minutes > maxMin - len
          let sTerm = [];
          const need = gi.maxMinPerDay - len + 1;
          if (earlier.reduce((s, k) => s + (k.c.end - k.c.start), 0) >= need) {
            if (!shortVar.has(gi.id)) {
              const sv = addVar(`sg${j.info.ti}_${j.v.k}_${gi.id.replace(/[^A-Za-z0-9]/g, '')}`, 's', 0, 'cont');
              addRow('zs', [[sv.name, need]].concat(earlier.map((k) => [k.z.get(gi.id), -(k.c.end - k.c.start)])), '<=', 0);
              shortVar.set(gi.id, sv.name);
            }
            sTerm = [[shortVar.get(gi.id), -1]];
          }
          firstFitRows++;
          addRow('zf', [[j.z.get(gq.id), 1]].concat(busy, sTerm), '<=', 0);
        }
      });
    }
  }
  group = 'core';

  const index = {
    vars,
    varByName,
    xRefs,
    rows,
    rowKeys,
    T,
    poss,
    possByDay,
    days,
    counts: {
      tasks: tasks.length,
      candidatesIn: T.reduce((s, i) => s + (cands.get(i.t.id) || []).length, 0),
      candidatesKept: xRefs.length,
      dropped,
      possessions: poss.length,
      incompatibleTriples: triples,
      resourceRows,
      firstFitRows,
      rows: rows.length,
      sequencePairs: depPairs.length,
      jointPairs: coPairs.length
    }
  };
  return { lp: toLp(index), index };
}

/* ------------------------------------------------------------------------ */
/* CPLEX LP serialisation                                                    */
/* ------------------------------------------------------------------------ */

const fmt = (n) => {
  const r = Math.round(n * 1e4) / 1e4;
  return Object.is(r, -0) ? '0' : String(r);
};

function expr(terms) {
  const parts = [];
  for (const [name, coef] of terms) {
    if (coef === 0) continue;
    const mag = Math.abs(coef);
    const body = mag === 1 ? name : `${fmt(mag)} ${name}`;
    parts.push(coef < 0 ? `- ${body}` : parts.length ? `+ ${body}` : body);
  }
  if (!parts.length) return '0';
  const lines = [];
  for (let i = 0; i < parts.length; i += 12) lines.push(parts.slice(i, i + 12).join(' '));
  return lines.join('\n   ');
}

/**
 * Serialise the model held in `index` as CPLEX LP text. `groups` selects the
 * row / column groups (default: all); `fix` is a list of [column, value]
 * pairs added as equality rows (used to solve a neighbourhood of a plan).
 */
export function toLp(index, { groups = null, fix = null } = {}) {
  const on = (g) => !groups || groups.includes(g || 'core');
  const vars = index.vars.filter((v) => on(v.group));
  const out = ['\\ SAMANVAY possession-assignment MILP', 'Minimize', ` obj: ${expr(vars.filter((v) => v.obj !== 0).map((v) => [v.name, v.obj]))}`, 'Subject To'];
  for (const r of index.rows) if (on(r.group)) out.push(` ${r.name}: ${expr(r.terms)} ${r.sense} ${fmt(r.rhs)}`);
  if (fix) fix.forEach(([name, value], i) => out.push(` fix${i}: ${name} = ${fmt(value)}`));
  out.push('Bounds');
  for (const v of vars) if (v.type === 'cont') out.push(v.ub === Infinity ? ` ${v.name} >= 0` : ` 0 <= ${v.name} <= 1`);
  out.push('Binaries');
  const bins = vars.filter((v) => v.type === 'bin').map((v) => v.name);
  for (let i = 0; i < bins.length; i += 20) out.push(` ${bins.slice(i, i + 20).join(' ')}`);
  out.push('End');
  return out.join('\n');
}

/* ------------------------------------------------------------------------ */
/* Solve and read back                                                       */
/* ------------------------------------------------------------------------ */

/**
 * Run HiGHS on LP text. Uses the persistent model API when present (it
 * exposes the proven bound and gap, and accepts a MIP start) and the one-shot
 * highs.solve() otherwise. `start` is an optional { name: value } map of
 * integer columns (a feasible plan); HiGHS completes the continuous columns.
 * Returns { Status, ObjectiveValue, Columns: {name: {Primal}}, hasSolution,
 * bound, gap, timeSec, nodes, startAccepted }.
 */
export function solveLp(highs, lp, { timeLimitSec = 4, mipRelGap = 0.005, start = null, highsOptions = {} } = {}) {
  const options = { output_flag: false, time_limit: Math.max(0.05, timeLimitSec), mip_rel_gap: mipRelGap, ...highsOptions };
  if (typeof highs.withModel === 'function' && highs.constants && highs.constants.modelStatus) {
    const names = Object.fromEntries(Object.entries(highs.constants.modelStatus).map(([k, v]) => [v, k]));
    return highs.withModel({ format: 'lp', data: lp }, (m) => {
      m.options.set(options);
      const info = (k) => {
        try {
          return Number(m.info.get(k));
        } catch {
          return null;
        }
      };
      let colNames = null;
      const columnNames = () => {
        if (!colNames) {
          const n = m.getDimensions().numCols;
          colNames = Array.from({ length: n }, (_, i) => m.getColName(i));
        }
        return colNames;
      };
      let startAccepted = null;
      if (start && typeof m.setSolution === 'function') {
        try {
          const indices = [];
          const values = [];
          columnNames().forEach((name, i) => {
            if (Object.prototype.hasOwnProperty.call(start, name)) {
              indices.push(i);
              values.push(start[name]);
            }
          });
          m.setSolution({ indices: Int32Array.from(indices), values: Float64Array.from(values) });
          startAccepted = true;
        } catch {
          startAccepted = false;
        }
      }
      m.run();
      const code = m.getModelStatus();
      const hasSolution = info('primal_solution_status') === 2;
      const Columns = {};
      if (hasSolution) {
        const sol = m.getSolution();
        const cn = columnNames();
        for (let i = 0; i < sol.colValue.length; i++) Columns[cn[i]] = { Primal: sol.colValue[i] };
      }
      return { Status: names[code] || String(code), ObjectiveValue: hasSolution ? m.getObjectiveValue() : null, Columns, hasSolution, bound: info('mip_dual_bound'), gap: info('mip_gap'), timeSec: m.getRunTime(), nodes: info('mip_node_count'), startAccepted };
    });
  }
  const t0 = now();
  const r = highs.solve(lp, options);
  const hasSolution = !!r.Columns && Object.values(r.Columns).some((c) => typeof c.Primal === 'number');
  return { ...r, hasSolution, bound: null, gap: null, timeSec: (now() - t0) / 1000, nodes: null, startAccepted: null };
}

/**
 * Map a HiGHS result back to decisions. `result` is a solveLp() result or a
 * raw highs.solve() result (Columns keyed by name, Primal values).
 * Returns { assign: Map<taskId, candidate|null>, open: possessions, meta }.
 */
export function parseMilpSolution(result, index, input) {
  const val = (name) => {
    const c = result.Columns && result.Columns[name];
    return c && typeof c.Primal === 'number' ? c.Primal : 0;
  };
  const assign = new Map(input.tasks.map((t) => [t.id, null]));
  for (const info of index.T) {
    for (const it of info.list) if (val(it.x.name) > 0.5 && !assign.get(info.t.id)) assign.set(info.t.id, it.c);
  }
  const open = index.poss.filter((P) => val(P.v.name) > 0.5);
  const objective = typeof result.ObjectiveValue === 'number' ? result.ObjectiveValue : null;
  const bound = typeof result.bound === 'number' && Number.isFinite(result.bound) ? result.bound : null;
  let gapPct = null;
  if (typeof result.gap === 'number' && Number.isFinite(result.gap)) gapPct = result.gap * 100;
  else if (bound !== null && objective !== null) gapPct = (Math.abs(objective - bound) / Math.max(1, Math.abs(objective))) * 100;
  return {
    assign,
    open,
    meta: {
      status: result.Status,
      objective,
      bound,
      gapPct,
      timeSec: result.timeSec ?? null,
      nodes: result.nodes ?? null,
      variables: index.vars.length,
      binaries: index.vars.filter((v) => v.type === 'bin').length,
      constraints: index.rows.length,
      possessionsOpen: open.length,
      scheduled: [...assign.values()].filter(Boolean).length,
      deferred: [...assign.values()].filter((a) => !a).length,
      mandatoryUnplaced: input.tasks.filter((t) => t.risk && t.risk.mandatory && !assign.get(t.id)).map((t) => t.id)
    }
  };
}

/* ------------------------------------------------------------------------ */
/* Verification: the scheduler's hard rules and cost, mirrored               */
/* ------------------------------------------------------------------------ */

/** Same grouping as scheduler.formBlocks(). */
function formBlocksMirror(assign, tasksById) {
  const items = [];
  for (const [id, a] of assign) if (a) items.push({ id, task: tasksById.get(id), a });
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
        if (!intersects(x.task.sections, y.task.sections)) continue;
        if (Math.max(x.a.start, y.a.start) >= Math.min(x.a.end, y.a.end)) continue;
        parent[find(i)] = find(j);
      }
    }
    const g = new Map();
    list.forEach((it, i) => {
      const r = find(i);
      if (!g.has(r)) g.set(r, []);
      g.get(r).push(it);
    });
    return [...g.values()];
  };
  const blocks = [];
  for (const g of union(closure)) {
    const sections = [...new Set(g.flatMap((it) => it.task.sections))].sort((a, b) => a - b);
    const line = g.some((it) => it.a.line === 'BOTH') ? 'BOTH' : g[0].a.line;
    blocks.push({ day: g[0].a.day, line, sections, start: Math.min(...g.map((it) => it.a.start)), end: Math.max(...g.map((it) => it.a.end)), items: g, lineClosure: true, nested: [] });
  }
  const loose = [];
  for (const it of open) {
    const host = blocks.find((b) => b.lineClosure && b.day === it.a.day && lineOk(b.line, it.a.line) && intersects(b.sections, it.task.sections) && it.a.start >= b.start && it.a.end <= b.end);
    if (host) {
      host.items.push(it);
      host.nested.push(it);
    } else loose.push(it);
  }
  for (const g of union(loose)) {
    const sections = [...new Set(g.flatMap((it) => it.task.sections))].sort((a, b) => a - b);
    const line = g.some((it) => it.a.line === 'BOTH') ? 'BOTH' : g[0].a.line;
    blocks.push({ day: g[0].a.day, line, sections, start: Math.min(...g.map((it) => it.a.start)), end: Math.max(...g.map((it) => it.a.end)), items: g, lineClosure: false, nested: [] });
  }
  return blocks;
}

/** Same unit / gang choice as scheduler.allocateResources(), without touching the candidates. */
function allocateMirror(assign, tasksById, machines, crews) {
  const violations = [];
  const machineOf = new Map();
  const crewOf = new Map();
  const machineUse = new Map();
  const crewUse = new Map();
  const perDay = new Map();
  for (const [id, a] of assign) {
    if (!a) continue;
    if (!perDay.has(a.day)) perDay.set(a.day, []);
    perDay.get(a.day).push({ id, a, task: tasksById.get(id) });
  }
  for (const [day, list] of perDay) {
    list.sort((x, y) => x.a.start - y.a.start);
    const dow = day % 7;
    list.forEach((it, pos) => {
      const t = it.task;
      if (t.machine) {
        let chosen = null;
        for (const m of machineUnits(machines, t.machine, day)) {
          const last = (machineUse.get(m.id) || []).filter((u) => u.day === day).sort((a, b) => b.end - a.end)[0];
          const fromKm = last ? last.km : m.homeKm;
          const ready = last ? last.end + (Math.abs(fromKm - t.startKm) / m.speedKmph) * 60 + 20 : 0;
          if (ready <= it.a.start) {
            chosen = m;
            break;
          }
        }
        if (!chosen) violations.push({ type: 'MACHINE', taskIds: [t.id], day, resource: t.machine, upto: list.slice(0, pos + 1).filter((o) => o.task.machine === t.machine).map((o) => o.id) });
        else {
          machineOf.set(t.id, chosen.id);
          if (!machineUse.has(chosen.id)) machineUse.set(chosen.id, []);
          machineUse.get(chosen.id).push({ day, start: it.a.start, end: it.a.end, km: t.endKm });
        }
      }
      if (t.crew) {
        let gangs = crews.filter((c) => c.type === t.crew && c.restDay !== dow && Math.abs(c.baseKm - t.startKm) <= c.reachKm);
        if (!gangs.length && t.risk && t.risk.mandatory) gangs = crews.filter((c) => c.type === t.crew && Math.abs(c.baseKm - t.startKm) <= c.reachKm * 1.5);
        let chosen = null;
        for (const c of gangs) {
          const today = (crewUse.get(c.id) || []).filter((u) => u.day === day);
          const minutes = today.reduce((s, u) => s + (u.end - u.start), 0);
          const busy = today.some((u) => Math.max(u.start, it.a.start) < Math.min(u.end, it.a.end));
          if (!busy && minutes + (it.a.end - it.a.start) <= c.maxMinPerDay) {
            chosen = c;
            break;
          }
        }
        if (!chosen) violations.push({ type: 'CREW', taskIds: [t.id], day, resource: t.crew, upto: list.slice(0, pos + 1).filter((o) => o.task.crew === t.crew).map((o) => o.id) });
        else {
          crewOf.set(t.id, chosen.id);
          if (!crewUse.has(chosen.id)) crewUse.set(chosen.id, []);
          crewUse.get(chosen.id).push({ day, start: it.a.start, end: it.a.end });
        }
      }
    });
  }
  return { violations, machineOf, crewOf };
}

/**
 * Check an assignment against the scheduler's hard rules and price it with
 * the scheduler's cost terms (a mirror of makeEvaluator in scheduler.js; the
 * scheduler stays the authority — this picks and repairs plans and reports whether
 * the model priced the plan exactly). Returns { violations, cost, blocks }.
 */
export function verifyAssignment(assign, input, evalCache = null) {
  const { tasks, dayOccs, rules, weights: w, machines = [], crews = [], days, tsrLoss = new Map(), allowPremium = false, weather = null } = input;
  const evalBlock = (b) => {
    const key = `${b.day}|${b.line}|${b.sections.join(',')}|${b.start}|${b.end}`;
    let r = evalCache && evalCache.get(key);
    if (!r) {
      r = evaluateWindow(dayOccs[b.day], b.sections, b.line, b.start, b.end, rules, { allowPremium });
      if (evalCache) evalCache.set(key, r);
    }
    return r;
  };
  const tasksById = input.tasksById || new Map(tasks.map((t) => [t.id, t]));
  const ordered = new Map(tasks.map((t) => [t.id, assign.get(t.id) || null]));
  const P = penalties();
  const violations = [];
  const cost = { delay: 0, downtime: 0, spread: 0, colocation: 0, wait: 0, defer: 0, preference: 0, weather: 0, hard: 0 };
  const blocks = formBlocksMirror(ordered, tasksById);
  for (const b of blocks) {
    const ids = b.items.map((it) => it.id);
    if (b.lineClosure) {
      const ev = evalBlock(b);
      b.eval = ev;
      cost.delay += w.delay * ev.weightedDelayMin;
      if (!ev.feasible) {
        cost.hard += HARD * ev.premiumConflicts;
        violations.push({ type: 'PREMIUM', taskIds: ids, day: b.day });
      }
      cost.downtime += w.downtime * (b.end - b.start) * b.sections.length * (b.line === 'BOTH' ? 2 : 1);
      cost.spread += w.spread;
      if (b.end - b.start > rules.maxBlockMin) {
        cost.hard += HARD;
        violations.push({ type: 'LENGTH', taskIds: ids, day: b.day });
      }
      cost.colocation += w.colocation * 0.5 * b.nested.length;
    }
    cost.colocation += w.colocation * (new Set(b.items.map((it) => it.task.dept)).size - 1);
    for (let i = 0; i < b.items.length; i++) {
      for (let j = i + 1; j < b.items.length; j++) {
        if (isIncompatible(b.items[i].task.workType, b.items[j].task.workType)) {
          cost.hard += HARD;
          violations.push({ type: 'INCOMPATIBLE', taskIds: ids, day: b.day });
        }
      }
    }
  }
  const perDay = new Map();
  for (const b of blocks) {
    if (!b.lineClosure) continue;
    if (!perDay.has(b.day)) perDay.set(b.day, []);
    perDay.get(b.day).push(b);
  }
  for (const [day, list] of perDay) {
    if (list.length > rules.maxBlocksPerDay) {
      cost.hard += HARD * (list.length - rules.maxBlocksPerDay);
      violations.push({ type: 'BLOCKS_PER_DAY', taskIds: list.flatMap((b) => b.items.map((it) => it.id)), day });
    }
    let counted = false;
    for (const b of list) {
      const over = list.filter((o) => Math.max(o.start, b.start) < Math.min(o.end, b.end));
      if (over.length > rules.maxConcurrentBlocks) {
        if (!counted) cost.hard += HARD; // the scheduler charges one per day
        counted = true;
        violations.push({ type: 'CONCURRENT', taskIds: over.flatMap((o) => o.items.map((it) => it.id)), day, block: b });
      }
    }
  }
  for (const t of tasks) {
    const a = ordered.get(t.id);
    const loss = tsrLoss.get(t.id) || 0;
    if (!a) {
      if (t.risk.mandatory) {
        cost.hard += P.MANDATORY_DEFERRED;
        violations.push({ type: 'MANDATORY_DEFERRED', taskIds: [t.id] });
      }
      cost.defer += w.risk * t.risk.arci * days + w.tsr * loss * days;
    } else {
      const parts = placementParts(t, a, loss, w, rules, weather);
      cost.wait += parts.wait;
      cost.preference += parts.preference;
      cost.weather += parts.weather;
      if (parts.late) {
        cost.hard += parts.late;
        violations.push({ type: 'MANDATORY_LATE', taskIds: [t.id], day: a.day });
      }
    }
  }
  const { depPairs, coPairs } = pairRules(tasks, tasksById);
  for (const [pre, dep] of depPairs) {
    const ad = ordered.get(dep);
    if (!ad) continue;
    const ap = ordered.get(pre);
    if (!ap || !(ap.day < ad.day || (ap.day === ad.day && ap.end <= ad.start))) {
      cost.hard += HARD;
      violations.push({ type: 'SEQUENCE', taskIds: [pre, dep] });
    }
  }
  if (coPairs.length) {
    const blockOf = new Map();
    blocks.forEach((b, i) => b.items.forEach((it) => blockOf.set(it.id, i)));
    for (const [x, y] of coPairs) {
      const ax = ordered.get(x);
      const ay = ordered.get(y);
      if (!ax && !ay) continue;
      if (!ax || !ay || blockOf.get(x) !== blockOf.get(y)) {
        cost.hard += HARD;
        violations.push({ type: 'JOINT', taskIds: [x, y] });
      }
    }
  }
  const alloc = allocateMirror(ordered, tasksById, machines, crews);
  cost.hard += HARD * alloc.violations.length;
  violations.push(...alloc.violations);
  cost.total = cost.delay + cost.downtime + cost.spread + cost.wait + cost.defer + cost.preference + cost.weather - cost.colocation + cost.hard;
  return { violations, cost, blocks, alloc };
}

/* ------------------------------------------------------------------------ */
/* Warm start                                                                */
/* ------------------------------------------------------------------------ */

/** The possession of the model whose rectangle is this closure block, if any. */
function leaderOf(block, index, byTaskId) {
  if (!block.lineClosure) return null;
  const key = block.sections.join(',');
  const fixedP = index.poss.find((P) => P.fixed && P.day === block.day && P.a === block.start && P.b === block.end && P.line === block.line && P.sections.join(',') === key);
  if (fixedP) return fixedP;
  for (const it of block.items) {
    if (it.task.closure !== 'LINE') continue;
    const a = it.a;
    if (a.day !== block.day || a.line !== block.line || a.start !== block.start || a.end !== block.end) continue;
    const info = byTaskId.get(it.id);
    if (!info || info.fixed || info.sections.join(',') !== key) continue;
    const kept = info.list.find((l) => l.c === a);
    if (kept && kept.p) return kept.p;
  }
  return null;
}

/** Scheduler constructionOrder(): highest ARCI first, never before a predecessor. */
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

/**
 * Greedy construction priced with the mirrored scheduler cost, in the
 * scheduler's order. With `inModel` it uses the model's candidate windows and
 * keeps every block laid on one work's own window, so the plan is a valid MIP
 * start; without it, it reproduces the scheduler's own greedy on the default
 * register (the fallback plan: never worse than greedy construction).
 */
function greedyStart(input, index, cache, deadline, { inModel = true } = {}) {
  const byTaskId = new Map(index.T.map((i) => [i.t.id, i]));
  const assign = new Map(input.tasks.map((t) => [t.id, null]));
  for (const info of index.T) if (info.fixed && info.list.length) assign.set(info.t.id, info.list[0].c);
  const tasksById = input.tasksById || new Map(input.tasks.map((t) => [t.id, t]));
  const { depPairs } = pairRules(input.tasks, tasksById);
  const representable = (blocks) => !inModel || blocks.every((b) => !b.lineClosure || b.items.length === 1 || leaderOf(b, index, byTaskId));
  let current = verifyAssignment(assign, input, cache).cost.total;
  for (const t of constructionOrder(input.tasks, depPairs)) {
    const info = byTaskId.get(t.id);
    if (info.fixed) continue;
    if (now() > deadline) break;
    const windows = inModel ? info.list.map((it) => it.c) : input.cands.get(t.id) || [];
    let best = null;
    let bestCost = t.risk.mandatory ? Infinity : current;
    for (const c of windows) {
      assign.set(t.id, c);
      const chk = verifyAssignment(assign, input, cache);
      if (chk.cost.total < bestCost - 1e-9 && representable(chk.blocks)) {
        bestCost = chk.cost.total;
        best = c;
      }
    }
    assign.set(t.id, best);
    if (best) current = bestCost;
  }
  return assign;
}

/** Integer column values of a plan (x, u, p) for HiGHS setSolution; null if the plan is not representable. */
function startValues(assign, index, input, cache) {
  const byTaskId = new Map(index.T.map((i) => [i.t.id, i]));
  const values = {};
  for (const info of index.T) {
    const a = assign.get(info.t.id);
    let placed = 0;
    for (const it of info.list) {
      const on = it.c === a ? 1 : 0;
      values[it.x.name] = on;
      placed += on;
      if (it.p) values[it.p.v.name] = 0;
    }
    if (a && !placed) return null; // window pruned from the model
    if (info.u) values[info.u.name] = placed ? 0 : 1;
  }
  for (const P of index.poss) if (P.fixed) values[P.v.name] = 1;
  const check = verifyAssignment(assign, input, cache);
  for (const b of check.blocks) {
    if (!b.lineClosure) continue;
    const P = leaderOf(b, index, byTaskId);
    if (!P) return null;
    values[P.v.name] = 1;
  }
  // units and gangs exactly as the scheduler's first-fit hands them out
  const { machineOf, crewOf } = check.alloc;
  for (const r of index.xRefs) {
    const chosen = assign.get(r.info.t.id) === r.c;
    if (r.w && r.units.length > 1) r.units.forEach((m, ui) => (values[r.w[ui]] = chosen && machineOf.get(r.info.t.id) === m.id ? 1 : 0));
    if (r.z && r.gangs.length > 1) for (const [gid, name] of r.z) values[name] = chosen && crewOf.get(r.info.t.id) === gid ? 1 : 0;
  }
  return values;
}

/**
 * Local repair after the last solve: while a hard rule is broken, apply the
 * single move of an offending work (another kept window, or deferral for a
 * non-mandatory work) that lowers the mirrored scheduler cost the most.
 */
function repairAssignment(assign0, check0, input, index, cache = new Map()) {
  const assign = new Map(assign0);
  let check = check0;
  const repaired = [];
  const fixed = input.fixedAssignments || new Map();
  const tasksById = input.tasksById || new Map(input.tasks.map((t) => [t.id, t]));
  const kept = new Map(index.T.map((i) => [i.t.id, i.list.map((it) => it.c)]));
  for (let guard = 0; guard < 2 * input.tasks.length; guard++) {
    if (!check.violations.some((v) => isHardType(v.type))) break;
    // candidates for a move: the works named in a violation and, for machine / gang
    // failures, every same-resource job the allocation handled before the failing one
    const ids = [...new Set(check.violations.filter((v) => isHardType(v.type)).flatMap((v) => v.upto || v.taskIds))].filter((id) => assign.get(id) && !fixed.has(id));
    let best = null;
    for (const id of ids) {
      const cur = assign.get(id);
      const options = (kept.get(id) || []).concat(tasksById.get(id).risk.mandatory ? [] : [null]);
      for (const c of options) {
        if (c === cur) continue;
        assign.set(id, c);
        const total = verifyAssignment(assign, input, cache).cost.total;
        if (!best || total < best.total) best = { id, c, total };
      }
      assign.set(id, cur);
    }
    if (!best || best.total >= check.cost.total - 1e-6) break;
    assign.set(best.id, best.c);
    repaired.push(best.id);
    check = verifyAssignment(assign, input, cache);
  }
  return { assign, check, repaired };
}

/* ------------------------------------------------------------------------ */
/* Plug-in                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Factory for scheduler.planHorizon's `construct` hook.
 *
 *   const highs = await loadHighs();
 *   const construct = makeMilpConstruct(highs, { timeLimitSec: 5 });
 *   runPlanning(ctx, { ..., construct, solver: 'milp' });
 *
 * construct(input) is synchronous and returns { assign, meta }. It throws when
 * HiGHS returns no feasible solution, so the caller falls back to greedy.
 *
 * Solve: warm start (greedy inside the model) -> phase 1, branch-and-cut on
 * the model with machine / gang capacity as necessary conditions -> if the
 * scheduler's first-fit allocation rejects that plan, phase 2 re-solves with
 * the exact first-fit rows, every work outside the failing (day, resource)
 * groups held where phase 1 put it. The cheapest violation-free plan wins.
 */
export function makeMilpConstruct(highs, options = {}) {
  // mip_pool_soft_limit: a small cut pool gets branch-and-cut to its primal heuristics
  // sooner, which matters more than the last points of bound inside a few seconds
  const opts = { timeLimitSec: 6, mipRelGap: 0.005, maxCandidatesPerTask: 20, startShare: 0.2, phase2Share: 0.2, ...options };
  opts.highsOptions = { mip_pool_soft_limit: 300, ...(options.highsOptions || {}) };
  return function milpConstruct(input) {
    const t0 = now();
    const budgetMs = opts.timeLimitSec * 1000;
    const left = () => (budgetMs - (now() - t0)) / 1000;
    const built = buildMilpModel(input, opts);
    const { index } = built;
    const buildMs = now() - t0;
    const cache = new Map();
    const tasksById = input.tasksById || new Map(input.tasks.map((t) => [t.id, t]));
    const hardOf = (check) => check.violations.filter((v) => isHardType(v.type));
    const plans = [];
    const consider = (assign, check, source, repaired = []) => plans.push({ assign, check, source, repaired, seq: plans.length });

    // fallback: the scheduler's own greedy construction (so this hook never
    // hands annealing a worse start than it would have had) ...
    const g0 = now();
    const deadline = t0 + budgetMs * opts.startShare;
    const plain = greedyStart(input, index, cache, deadline, { inModel: false });
    consider(plain, verifyAssignment(plain, input, cache), 'greedy construction');
    // ... and the MIP start: greedy inside the model, repaired against the scheduler's rules
    const greedy = greedyStart(input, index, cache, deadline, { inModel: true });
    const warm = repairAssignment(greedy, verifyAssignment(greedy, input, cache), input, index, cache);
    consider(warm.assign, warm.check, 'warm start', warm.repaired);
    const warmMs = now() - g0;

    // phase 1: capacity as necessary conditions
    const phases = [];
    const light = ['core', 'hall'];
    const limit1 = Math.max(0.2, left() * (1 - opts.phase2Share));
    const res1 = solveLp(highs, toLp(index, { groups: light }), { timeLimitSec: limit1, mipRelGap: opts.mipRelGap, start: startValues(warm.assign, index, input, cache), highsOptions: opts.highsOptions });
    let p1 = null;
    if (res1.hasSolution) {
      p1 = parseMilpSolution(res1, index, input);
      p1.check = verifyAssignment(p1.assign, input, cache);
      const bad = hardOf(p1.check);
      phases.push({ phase: 1, model: 'capacity as necessary conditions', status: res1.Status, objective: res1.ObjectiveValue, bound: p1.meta.bound, gapPct: p1.meta.gapPct, timeSec: res1.timeSec, nodes: res1.nodes, allocationFailures: bad.length, startAccepted: res1.startAccepted });
      if (!bad.length) consider(p1.assign, p1.check, 'MILP');
      else {
        const fixedUp = repairAssignment(p1.assign, p1.check, input, index, cache);
        consider(fixedUp.assign, fixedUp.check, 'MILP + local repair', fixedUp.repaired);

        // phase 2: exact first-fit allocation around the failures, in two
        // widening neighbourhoods (2a: the failing day + resource groups,
        // 2b: every work on the failing days), each warm-started from the last
        const badDays = new Set(bad.map((v) => v.day).filter((d) => d != null));
        const groupFreed = new Set();
        for (const v of bad) {
          if (v.type === 'MACHINE' || v.type === 'CREW') {
            const key = v.type === 'MACHINE' ? 'machine' : 'crew';
            for (const [id, a] of p1.assign) if (a && a.day === v.day && tasksById.get(id)[key] === v.resource) groupFreed.add(id);
          }
          for (const id of v.taskIds) groupFreed.add(id);
        }
        const dayFreed = new Set(groupFreed);
        for (const [id, a] of p1.assign) if (a && badDays.has(a.day)) dayFreed.add(id);
        let incumbent = hardOf(fixedUp.check).length ? null : fixedUp;
        const scopes = [['2a', groupFreed, 0.45], ['2b', dayFreed, 1]].filter(([, set], i) => i === 0 || set.size > groupFreed.size);
        for (const [label, freed, share] of scopes) {
          if (left() < 0.1) break;
          const fix = [];
          for (const info of index.T) {
            if (info.fixed || freed.has(info.t.id)) continue;
            const a = p1.assign.get(info.t.id);
            const it = a ? info.list.find((l) => l.c === a) : null;
            if (it) fix.push([it.x.name, 1]);
            else if (info.u) fix.push([info.u.name, 1]);
          }
          const start = incumbent ? startValues(incumbent.assign, index, input, cache) : null;
          const res2 = solveLp(highs, toLp(index, { groups: ['core', 'ff'], fix }), { timeLimitSec: Math.max(0.1, left() * share), mipRelGap: opts.mipRelGap, start, highsOptions: opts.highsOptions });
          if (!res2.hasSolution) {
            phases.push({ phase: label, freed: freed.size, status: res2.Status, timeSec: res2.timeSec, solution: false });
            continue;
          }
          const p2 = parseMilpSolution(res2, index, input);
          const c2 = verifyAssignment(p2.assign, input, cache);
          phases.push({ phase: label, model: 'exact first-fit allocation; works outside the neighbourhood held', freed: freed.size, status: res2.Status, objective: res2.ObjectiveValue, bound: p2.meta.bound, gapPct: p2.meta.gapPct, timeSec: res2.timeSec, nodes: res2.nodes, allocationFailures: hardOf(c2).length, startAccepted: res2.startAccepted });
          consider(p2.assign, c2, 'MILP (exact allocation phase)');
          if (!hardOf(c2).length && (!incumbent || c2.cost.total < incumbent.check.cost.total)) incumbent = { assign: p2.assign, check: c2 };
        }
      }
    } else phases.push({ phase: 1, status: res1.Status, timeSec: res1.timeSec, solution: false });
    if (!p1) throw new Error(`HiGHS found no feasible plan within ${opts.timeLimitSec} s (${res1.Status})`);

    // cheapest plan under the scheduler's rules; one that still breaks a rule is repaired first
    for (const pl of plans) {
      if (!hardOf(pl.check).length) continue;
      const r = repairAssignment(pl.assign, pl.check, input, index, cache);
      Object.assign(pl, { assign: r.assign, check: r.check, repaired: pl.repaired.concat(r.repaired) });
    }
    plans.sort((x, y) => x.check.cost.total - y.check.cost.total || y.seq - x.seq); // ties: the solver's plan
    const best = plans[0];
    const { assign, check } = best;
    const bound = p1.meta.bound;
    const meta = {
      solver: `HiGHS ${highs.version && highs.version.string ? highs.version.string : ''}`.trim() + ' (WebAssembly, branch-and-cut)',
      model: 'possession-assignment MILP',
      status: res1.Status,
      optimal: /optimal/i.test(String(res1.Status)) && best.source === 'MILP',
      source: best.source,
      objective: p1.meta.objective,
      bound,
      gapPct: p1.meta.gapPct,
      planCost: Math.round(check.cost.total),
      planGapPct: bound != null ? Math.max(0, ((check.cost.total - bound) / Math.max(1, Math.abs(check.cost.total))) * 100) : null,
      warmStartCost: Math.round(warm.check.cost.total),
      greedyCost: Math.round(plans.find((pl) => pl.source === 'greedy construction').check.cost.total),
      timeMs: Math.round(now() - t0),
      buildMs: Math.round(buildMs),
      warmStartMs: Math.round(warmMs),
      solveSec: phases.reduce((sum, ph) => sum + (ph.timeSec || 0), 0),
      phases,
      variables: index.vars.filter((v) => light.includes(v.group)).length,
      binaries: index.vars.filter((v) => light.includes(v.group) && v.type === 'bin').length,
      constraints: index.rows.filter((r) => light.includes(r.group)).length,
      ...index.counts,
      scheduled: [...assign.values()].filter(Boolean).length,
      deferred: [...assign.values()].filter((a) => !a).length,
      mandatoryUnplaced: input.tasks.filter((t) => t.risk && t.risk.mandatory && !assign.get(t.id)).map((t) => t.id),
      repairedTasks: best.repaired || [],
      remainingViolations: hardOf(check).map((v) => ({ type: v.type, taskIds: v.taskIds, day: v.day })),
      approximations: [
        'Phase 1 treats machine units and gangs as capacity limits (necessary conditions); when the scheduler first-fit allocation rejects that plan, phase 2 solves the exact first-fit allocation for the failing day and resource with the other works held.',
        'A possession is laid on one work window and the others nest inside it; staggered or cross-section merges that widen a block are left to simulated annealing.',
        `Each work keeps at most ${opts.maxCandidatesPerTask} candidate windows, cheapest first.`
      ]
    };
    return { assign, meta };
  };
}
