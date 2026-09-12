import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContext, runPlanning } from '../src/engine/planner.js';
import { planHorizon } from '../src/engine/scheduler.js';
import { inDailyWindow, buildDayOccupancy, commonFreeWindows } from '../src/engine/occupancy.js';
import { RULES, DEFAULT_WEIGHTS } from '../src/engine/constants.js';

const CORRIDOR_IDS = ['NCR_NDLS_CNB', 'WR_MMCT_ADI', 'SWR_SBC_JTJ', 'ER_HWH_ASN'];
const SEED = 26027;

/** A single-line, line-closure register work to anchor injected works on real track. */
function site(ctx) {
  const t = ctx.tasks.find((x) => x.closure === 'LINE' && x.line !== 'BOTH' && !x.capital);
  return { line: t.line, startKm: t.startKm, endKm: Math.max(t.endKm, t.startKm + 0.3) };
}

function injected(ctx, sourceId) {
  return ctx.tasks.find((t) => t.sourceId === sourceId);
}

test('safety first: every mandatory work is placed on or before its due day on all 4 corridors (default settings)', () => {
  for (const id of CORRIDOR_IDS) {
    const ctx = createContext(id, { seed: SEED });
    const r = runPlanning(ctx, {});
    const ai = r.weekly.ai;
    const mandatory = r.weekly.tasks.filter((t) => t.risk.mandatory);
    assert.ok(mandatory.length > 0, `${id}: has mandatory work`);
    for (const t of mandatory) {
      const s = ai.scheduled.find((x) => x.taskId === t.id);
      assert.ok(s, `${id}: mandatory ${t.id} scheduled`);
      assert.ok(s.day <= Math.max(0, t.dueDay), `${id}: ${t.id} on day ${s.day}, due ${t.dueDay}`);
      assert.ok(t.risk.mandatoryReason, `${id}: ${t.id} explains why it is mandatory`);
    }
    assert.deepEqual(ai.safetyConflicts, [], `${id}: no safety conflicts`);
    assert.equal(ai.cost.hard, 0, `${id}: ${ai.cost.hardReasons.join('; ')}`);
    assert.equal(r.weekly.kpis.mandatoryCompliant, r.weekly.kpis.mandatoryTotal);
    assert.deepEqual(r.monthly.ai.safetyConflicts, [], `${id}: monthly safety conflicts`);
  }
});

test('extended mandatory floor: safety ≥ 0.8 with a TSR in force or overdue is mandatory', () => {
  const ctx = createContext('NCR_NDLS_CNB', { seed: SEED });
  const b = ctx.tasks.filter((t) => t.risk.mandatoryRule === 'B');
  assert.ok(b.length > 0);
  for (const t of b) {
    assert.ok(t.safety >= 0.8 && (t.tsrKmph || t.daysOverdue > 0));
    assert.ok(t.risk.arci >= 0.92);
    assert.match(t.risk.explanation.find((e) => e.key === 'safety').text, /Mandatory: safety severity/);
  }
});

test('a mandatory work with no window yields a safety conflict with a plain-English reason', () => {
  const ctx0 = createContext('SWR_SBC_JTJ', { seed: SEED });
  const s = site(ctx0);
  // IMR flaw with TSR (mandatory rule A) whose requested duration cannot fit any day
  const ctx = createContext('SWR_SBC_JTJ', { seed: SEED, scenario: { injectTasks: [{ sourceId: 'REQ/TOO-LONG', workType: 'USFD_IMR_RAIL', ...s, tsrKmph: 30, durationMin: 1500 }] } });
  const t = injected(ctx, 'REQ/TOO-LONG');
  assert.ok(t.risk.mandatory);
  const r = runPlanning(ctx, { iterations: 300 });
  const c = r.weekly.ai.safetyConflicts.find((x) => x.taskId === t.id);
  assert.ok(c, 'conflict reported');
  assert.equal(c.placedDay, null);
  assert.equal(c.reason, 'No free window long enough for the work anywhere in the horizon');

  // an approved block holding the whole of day 0 on the work's sections: no window on or before due
  const tasks = ctx0.tasks.filter((x) => !x.capital);
  const base = tasks.find((x) => x.closure === 'LINE' && x.line !== 'BOTH' && !x.risk.mandatory && !x.machine);
  const m = { ...base, id: 'M-TEST', dueDay: 0, risk: { ...base.risk, mandatory: true, arci: 0.95 } };
  const hold = { ...base, id: 'HOLD-1', risk: { ...base.risk, mandatory: false } };
  const plan = planHorizon({ corridor: ctx0.corridor, feeds: ctx0.feeds, tasks: [m, hold, ...tasks.filter((x) => x.id !== base.id)], days: 7, planStart: ctx0.planStart, iterations: 300, seed: 7, fixedBlocks: [{ id: 'BLK-HOLD', day: 0, line: base.line, start: 0, end: 1440, taskIds: ['HOLD-1'] }] });
  const c2 = plan.safetyConflicts.find((x) => x.taskId === 'M-TEST');
  assert.ok(c2, 'held-out mandatory work reported');
  assert.ok(c2.placedDay >= 1);
  assert.equal(c2.reason, 'No free window on or before its due day');
});

test('an approved block keeps its id and per-work windows when a new overlapping work is injected', () => {
  const ctx = createContext('SWR_SBC_JTJ', { seed: SEED });
  const r1 = runPlanning(ctx, { iterations: 600 });
  const b = r1.weekly.ai.blocks.find((x) => x.lineClosure && x.tasks.length >= 2 && x.tasks.some((t) => t.start !== x.start || t.end !== x.end));
  assert.ok(b, 'a joint block with distinct work windows exists');
  const fixed = { id: 'BLK-APPROVED-1', day: b.day, line: b.line, start: b.start, end: b.end, taskIds: [...b.tasks.map((t) => t.id), 'GONE-1'], tasks: b.tasks.map((t) => ({ id: t.id, start: t.start, end: t.end })) };
  const first = ctx.tasks.find((t) => t.id === b.tasks[0].id);
  const spec = { sourceId: 'REQ/OVERLAP', workType: 'USFD_OBS_RAIL', line: b.line === 'BOTH' ? 'DN' : b.line, startKm: first.startKm, endKm: first.startKm + 0.3, preferredDay: b.day };
  const ctx2 = createContext('SWR_SBC_JTJ', { seed: SEED, scenario: { injectTasks: [spec] } });
  const inj = injected(ctx2, 'REQ/OVERLAP');
  const r2 = runPlanning(ctx2, { iterations: 600, fixedBlocks: [fixed] });
  const kept = r2.weekly.ai.blocks.find((x) => x.id === 'BLK-APPROVED-1');
  assert.ok(kept, 'approval id reused');
  assert.equal(kept.fixed, true);
  assert.deepEqual(kept.tasks.map((t) => t.id).sort(), b.tasks.map((t) => t.id).sort(), 'no other work merged in');
  for (const t of b.tasks) {
    const k = kept.tasks.find((x) => x.id === t.id);
    assert.equal(k.start, t.start, `${t.id} start not stretched`);
    assert.equal(k.end, t.end, `${t.id} end not stretched`);
  }
  const s = r2.weekly.ai.scheduled.find((x) => x.taskId === inj.id);
  if (s && s.day === b.day) assert.ok(s.end <= b.start || s.start >= b.end || !(s.line === b.line || s.line === 'BOTH' || b.line === 'BOTH'), 'injected work does not overlap the approved block');
  const rep = r2.weekly.ai.fixedReport.find((x) => x.id === 'BLK-APPROVED-1');
  assert.deepEqual(rep.missingTaskIds, ['GONE-1']);
  assert.equal(rep.held, true);
  // the monthly plan holds the same approved block (days 0–6)
  assert.ok(r2.monthly.ai.blocks.some((x) => x.id === 'BLK-APPROVED-1'), 'monthly keeps the approval');
});

test('requisitions: dependsOn order, coRequireWith joint block, durationMin, machine and replacesTaskId', () => {
  const ctx0 = createContext('ER_HWH_ASN', { seed: SEED });
  const s = site(ctx0);
  const replaced = ctx0.tasks.find((t) => !t.capital && !t.risk.mandatory && t.dept === 'TMS');
  // A is held on day 3 (joint-block target) so B, which prefers day 0, must wait for it
  const anchor = ctx0.tasks.find((t) => t.line === s.line && t.startKm === s.startKm);
  const w3 = commonFreeWindows(buildDayOccupancy(ctx0.corridor, ctx0.feeds, 3, ctx0.planStart), anchor.sections, s.line, 150, RULES.headwayMarginMin)[0];
  const specs = [
    { sourceId: 'REQ/A', workType: 'USFD_OBS_RAIL', ...s, targetBlock: { day: 3, line: s.line, start: w3.start, end: w3.start + 150 } },
    { sourceId: 'REQ/B', workType: 'SIGNAL_CABLE', ...s, preferredDay: 0, dependsOn: ['REQ/A'] },
    // C and D prefer different days; the joint-block rule must still put them together
    { sourceId: 'REQ/C', workType: 'USFD_OBS_RAIL', ...s, preferredDay: 1, coRequireWith: ['REQ/D'] },
    { sourceId: 'REQ/D', workType: 'DROPPER_STAGGER', ...s, machine: null, preferredDay: 5 },
    { sourceId: 'REQ/E', workType: 'DESTRESSING', ...s, durationMin: 200, preferredWindow: 'night', replacesTaskId: replaced.id },
    { sourceId: 'REQ/OTHER', corridorId: 'NCR_NDLS_CNB', workType: 'USFD_OBS_RAIL', ...s }
  ];
  const ctx = createContext('ER_HWH_ASN', { seed: SEED, scenario: { injectTasks: specs } });
  assert.equal(injected(ctx, 'REQ/OTHER'), undefined, 'other corridor skipped');
  assert.equal(ctx.tasks.find((t) => t.id === replaced.id), undefined, 'replaced register work dropped');
  const [A, B, C, D, E] = ['REQ/A', 'REQ/B', 'REQ/C', 'REQ/D', 'REQ/E'].map((x) => injected(ctx, x));
  assert.deepEqual(B.dependsOn, [A.id]);
  assert.deepEqual(D.coRequireWith, [C.id], 'joint block requirement is mutual');
  assert.equal(D.machine, null);
  assert.equal(E.durationMin, 200);
  assert.equal(E.durationSource, 'requisition');
  assert.equal(E.totalMin, E.setupMin + 200 + E.clearanceMin);
  assert.equal(E.replacesTaskId, replaced.id);
  assert.match(E.injectedFields.note, /^Duration, window and replaces register work from requisition REQ\/E$/);

  const r = runPlanning(ctx, { iterations: 1500 });
  const ai = r.weekly.ai;
  assert.equal(ai.cost.hard, 0, ai.cost.hardReasons.join('; '));
  const at = (t) => ai.scheduled.find((x) => x.taskId === t.id);
  const a = at(A);
  const b = at(B);
  assert.ok(a && b, 'both sequenced works scheduled');
  assert.equal(a.day, 3);
  assert.ok(a.day < b.day || (a.day === b.day && a.end <= b.start), `B (${b.day} ${b.start}) after A (${a.day} ${a.end})`);
  const blkC = ai.blocks.find((x) => x.tasks.some((t) => t.id === C.id));
  assert.ok(blkC && blkC.tasks.some((t) => t.id === D.id), 'co-required works share one block');
  const e = at(E);
  assert.ok(e, 'requested-duration work scheduled');
  assert.equal(e.end - e.start, E.totalMin);
  assert.ok(!ai.scheduled.some((x) => x.taskId === replaced.id));
});

test("preferredWindow 'day' is honoured when feasible, and a kept night start is charged and visible", () => {
  const ctx = createContext('SWR_SBC_JTJ', { seed: SEED });
  const tasks = ctx.tasks.filter((t) => !t.capital);
  const common = { corridor: ctx.corridor, feeds: ctx.feeds, days: 7, planStart: ctx.planStart, iterations: 600, seed: 7, alternatives: { perTask: 0 }, confidence: null };
  const base = planHorizon({ ...common, tasks });
  const isNight = (m) => inDailyWindow(m, RULES.nightWindow);
  // works the optimiser puts at night when nobody asks otherwise
  const night = base.scheduled.filter((s) => isNight(s.start) && !tasks.find((t) => t.id === s.taskId).risk.mandatory).slice(0, 4);
  assert.ok(night.length > 0);
  let honoured = 0;
  for (const s of night) {
    const withPref = tasks.map((t) => (t.id === s.taskId ? { ...t, preferredWindow: 'day' } : t));
    const p = planHorizon({ ...common, tasks: withPref });
    const x = p.scheduled.find((y) => y.taskId === s.taskId);
    assert.ok(x);
    if (!isNight(x.start)) honoured++;
    // soft rule: if the night start is kept, the penalty is in the cost breakdown (every cheaper day window was worse)
    else assert.equal(p.cost.preference, DEFAULT_WEIGHTS.preference * 3);
    // a strong preference weight always wins when a day window exists
    const strong = planHorizon({ ...common, tasks: withPref, weights: { preference: 1000 } });
    const y = strong.scheduled.find((z) => z.taskId === s.taskId);
    assert.equal(isNight(y.start), false, `${s.taskId} with a strong preference starts in the day`);
  }
  assert.ok(honoured > 0, 'default weight honours the preference when a day window is close in cost');
});

test('alternatives exist, are ranked by deltaCost and carry plain-English notes', () => {
  const ctx = createContext('SWR_SBC_JTJ', { seed: SEED });
  const ai = runPlanning(ctx, { iterations: 600 }).weekly.ai;
  const lists = Object.values(ai.alternatives);
  assert.ok(lists.length >= ai.scheduled.length * 0.8, 'most scheduled works have alternatives');
  let n = 0;
  for (const list of lists) {
    assert.ok(list.length <= 3);
    for (let i = 1; i < list.length; i++) assert.ok(list[i].deltaCost >= list[i - 1].deltaCost, 'ranked by deltaCost');
    for (const a of list) {
      assert.equal(typeof a.note, 'string');
      assert.ok(a.note.length > 0);
      assert.equal(a.feasible, a.reason === null);
      n++;
    }
  }
  assert.ok(n > 0);
  assert.ok(ai.blocks.some((b) => b.alternatives && b.alternatives.length > 0));
  for (const b of ai.blocks) for (let i = 1; i < (b.alternatives || []).length; i++) assert.ok(b.alternatives[i].deltaCost >= b.alternatives[i - 1].deltaCost);
});

test('block confidence values are probabilities with a stated basis', () => {
  const ctx = createContext('NCR_NDLS_CNB', { seed: SEED });
  const r = runPlanning(ctx, { iterations: 600 });
  for (const b of r.weekly.ai.blocks.concat(r.monthly.ai.blocks)) {
    const c = b.confidence;
    assert.ok(c, `${b.id} has confidence`);
    for (const k of ['completion', 'windowReliability', 'overall']) assert.ok(c[k] >= 0 && c[k] <= 1, `${b.id} ${k}=${c[k]}`);
    assert.ok(Math.abs(c.overall - c.completion * c.windowReliability) < 0.002);
    assert.ok(c.basis.length > 0);
    if (!b.lineClosure) assert.equal(c.windowReliability, 1);
  }
  const f = ctx.factors.TAMPING;
  assert.ok(f.n >= 3 && f.sdLog > 0, 'dispersion learned from the execution log');
});

test('ARCI bands contain the point ARCI', () => {
  for (const id of ['NCR_NDLS_CNB', 'ER_HWH_ASN']) {
    const ctx = createContext(id, { seed: SEED });
    for (const t of ctx.tasks) {
      const b = t.risk.band;
      assert.ok(b, `${t.id} has a band`);
      assert.equal(b.samples, 30);
      assert.ok(b.low <= t.risk.arci + 1e-9 && t.risk.arci <= b.high + 1e-9, `${t.id}: ${b.low} ≤ ${t.risk.arci} ≤ ${b.high}`);
      assert.ok(b.low >= 0 && b.high <= 1);
    }
  }
});

test('rules and solver plumbing: premium rule, notice weeks, construct callback and fallback', () => {
  const ctx = createContext('ER_HWH_ASN', { seed: SEED });
  const r = runPlanning(ctx, { iterations: 200, rules: { noticeWeeksForRegulation: 12 } });
  assert.equal(r.rolling.noticeRule, 12);
  assert.equal(r.weekly.ai.search.solver, 'greedy+sa');
  const tasks = ctx.tasks.filter((t) => !t.capital);
  const common = { corridor: ctx.corridor, feeds: ctx.feeds, tasks, days: 7, planStart: ctx.planStart, iterations: 200, seed: 7 };
  // a valid external construction is polished by annealing
  const first = ({ tasks: ts, cands }) => ({ assign: new Map(ts.map((t) => [t.id, cands.get(t.id)[0] || null])), meta: { status: 'test' } });
  const p1 = planHorizon({ ...common, construct: first });
  assert.equal(p1.search.solver, 'milp+sa');
  assert.deepEqual(p1.search.milp, { status: 'test' });
  // an invalid one falls back to greedy and says why
  const bad = ({ tasks: ts }) => ({ assign: new Map(ts.map((t) => [t.id, { day: 0, line: 'UP', start: -5, end: 1, gap: 0 }])) });
  const p2 = planHorizon({ ...common, construct: bad });
  assert.equal(p2.search.solver, 'greedy+sa');
  assert.match(p2.search.fallbackReason, /outside its candidate windows/);
  const p3 = planHorizon({ ...common, construct: () => { throw new Error('solver down'); } });
  assert.match(p3.search.fallbackReason, /solver down/);
  const p4 = planHorizon({ ...common, requestedSolver: 'milp' });
  assert.match(p4.search.fallbackReason, /no MILP construction/);
  // premium paths may be touched only when the rule is switched off
  const soft = planHorizon({ ...common, rules: { premiumConflictHard: false } });
  assert.ok(soft.cost.hardReasons.every((x) => !/premium/.test(x)));
});
