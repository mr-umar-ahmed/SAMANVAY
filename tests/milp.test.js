/**
 * MILP construction (src/engine/milp.js, HiGHS WebAssembly) against the
 * scheduler's own rules and cost function.
 *
 * The construct input is captured from scheduler.planHorizon itself (its
 * `construct` hook), so the model sees exactly the candidate windows, day
 * occupancies and TSR losses the scheduler built. Plans are scored by
 * planHorizon with `iterations: 0` (no annealing), i.e. by makeEvaluator.
 *
 * MILP_TIME_LIMIT (seconds, default 6) sets the solver budget per corridor.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import loadHighs from 'highs';
import { createContext } from '../src/engine/planner.js';
import { CORRIDORS } from '../src/engine/corridors.js';
import { planHorizon } from '../src/engine/scheduler.js';
import { buildMilpModel, toLp, solveLp, parseMilpSolution, verifyAssignment, makeMilpConstruct } from '../src/engine/milp.js';

const highs = await loadHighs();
const TIME = Number(process.env.MILP_TIME_LIMIT || 6);
const quick = { alternatives: { perTask: 0 }, confidence: null };
const sameCand = (a, b) => a.day === b.day && a.line === b.line && a.start === b.start && a.end === b.end;

function weeklyArgs(ctx) {
  const tasks = ctx.tasks.filter((t) => !t.capital);
  return { corridor: ctx.corridor, feeds: ctx.feeds, tasks, days: 7, planStart: ctx.planStart, seed: 7, label: 'milp-test', feedsForDay: ctx.feedsForDay || null, weather: ctx.weatherEffects || null, factors: ctx.factors, ...quick };
}

/** The object planHorizon hands to `construct` (null if this scheduler has no hook). */
function captureInput(args) {
  let input = null;
  planHorizon({
    ...args,
    iterations: 0,
    construct: (i) => {
      input = i;
      throw new Error('input captured');
    }
  });
  // the weather term is priced per placement; pass it along like the worker should
  return input && { ...input, weather: args.weather };
}

/** Scheduler plan -> assignment over the captured candidate objects. */
function planToAssign(plan, input) {
  const assign = new Map(input.tasks.map((t) => [t.id, null]));
  for (const s of plan.scheduled) {
    const c = input.cands.get(s.taskId).find((x) => sameCand(x, s));
    assert.ok(c, `scheduled window of ${s.taskId} is one of its candidates`);
    assign.set(s.taskId, c);
  }
  return assign;
}

test('HiGHS (WebAssembly) loads in Node and solves a small MILP', () => {
  assert.match(highs.version.string, /^\d+\.\d+\.\d+$/);
  const r = highs.solve('Maximize\n obj: 30 c + 50 t\nSubject To\n a: c + 2 t <= 40\n b: 2 c + t <= 50\nGenerals\n c t\nEnd', { output_flag: false });
  assert.equal(r.Status, 'Optimal');
  assert.equal(r.ObjectiveValue, 1100);
});

test('verifyAssignment prices a plan exactly as the scheduler does', (t) => {
  for (const c of CORRIDORS) {
    const ctx = createContext(c.id);
    const args = weeklyArgs(ctx);
    const input = captureInput(args);
    if (!input) return t.skip('scheduler.planHorizon has no construct hook');
    const greedy = planHorizon({ ...args, iterations: 0 });
    const annealed = planHorizon({ ...args, iterations: 1500 });
    for (const plan of [greedy, annealed]) {
      const check = verifyAssignment(planToAssign(plan, input), input);
      assert.ok(Math.abs(check.cost.total - plan.cost.total) <= 1, `${c.id}: mirror ${check.cost.total.toFixed(1)} vs scheduler ${plan.cost.total}`);
      assert.ok(Math.abs(check.cost.hard - plan.cost.hard) < 1, `${c.id}: hard ${check.cost.hard} vs ${plan.cost.hard}`);
    }
  }
});

test('buildMilpModel emits CPLEX LP that HiGHS parses; parseMilpSolution maps columns to candidate windows', (t) => {
  const ctx = createContext('SWR_SBC_JTJ');
  const input = captureInput(weeklyArgs(ctx));
  if (!input) return t.skip('scheduler.planHorizon has no construct hook');
  const { lp, index } = buildMilpModel(input, { maxCandidatesPerTask: 12 });
  assert.match(lp, /^\\ SAMANVAY/);
  assert.ok(index.vars.length > 0 && index.rows.length > 0);
  const light = toLp(index, { groups: ['core', 'hall'] });
  const res = solveLp(highs, light, { timeLimitSec: 3 });
  assert.ok(res.hasSolution, `HiGHS status ${res.Status}`);
  const parsed = parseMilpSolution(res, index, input);
  assert.equal(parsed.assign.size, input.tasks.length);
  for (const [id, a] of parsed.assign) if (a) assert.ok(input.cands.get(id).includes(a), `${id} placed on one of its own candidate objects`);
  assert.ok(parsed.meta.bound === null || parsed.meta.bound <= parsed.meta.objective + 1e-6);
  assert.ok(parsed.meta.possessionsOpen > 0);
  // every open possession is exactly one line-closure block of formBlocks()
  const check = verifyAssignment(parsed.assign, input);
  assert.equal(check.blocks.filter((b) => b.lineClosure).length, parsed.meta.possessionsOpen);
});

const results = [];

for (const c of CORRIDORS) {
  test(`MILP construction on ${c.id}: valid windows, mandatory works placed, no hard violation`, (t) => {
    const ctx = createContext(c.id);
    const args = weeklyArgs(ctx);
    const probe = captureInput(args);
    if (!probe) return t.skip('scheduler.planHorizon has no construct hook');
    const milp = makeMilpConstruct(highs, { timeLimitSec: TIME });
    let first = null;
    const construct = (input) => {
      if (!first) {
        const out = milp({ ...input, weather: args.weather });
        first = { input, out };
      }
      return first.out; // a second planHorizon call reuses the solve (matched by window)
    };

    // the MILP plan alone, scored by the scheduler
    const plan = planHorizon({ ...args, iterations: 0, construct });
    const { input, out } = first;
    const m = out.meta;
    assert.equal(plan.search.solver, 'milp+sa', plan.search.fallbackReason || '');
    assert.equal(out.assign.size, input.tasks.length);
    for (const [id, a] of out.assign) if (a) assert.ok(input.cands.get(id).includes(a), `${id}: value is one of its candidate objects`);
    const mandatory = input.tasks.filter((x) => x.risk.mandatory);
    for (const x of mandatory) assert.ok(out.assign.get(x.id), `mandatory ${x.id} placed`);
    assert.deepEqual(m.mandatoryUnplaced, []);
    assert.equal(plan.cost.hard, 0, plan.cost.hardReasons.join('; '));
    assert.deepEqual(m.remainingViolations, []);
    assert.ok(Math.abs(plan.cost.total - m.planCost) <= 1, `scheduler ${plan.cost.total} vs model-side ${m.planCost}`);
    assert.ok(m.bound === null || m.bound <= m.objective + 1e-6, 'proven bound below the incumbent');

    // never worse than the scheduler's own greedy construction
    const greedy = planHorizon({ ...args, iterations: 0 });
    assert.ok(plan.cost.total <= greedy.cost.total + 1, `MILP ${plan.cost.total} vs greedy ${greedy.cost.total}`);

    // with simulated annealing polishing both starts
    const milpSa = planHorizon({ ...args, iterations: 6000, construct });
    const sa = planHorizon({ ...args, iterations: 6000 });
    assert.equal(milpSa.cost.hard, 0, milpSa.cost.hardReasons.join('; '));
    assert.equal(sa.cost.hard, 0, sa.cost.hardReasons.join('; '));
    const blocks = (p) => `${p.blocks.filter((b) => b.lineClosure).length} possessions, ${p.blocks.filter((b) => b.coLocated).length} co-located`;
    const row = {
      corridor: c.id,
      tasks: input.tasks.length,
      status: m.status,
      source: m.source,
      objective: Math.round(m.objective),
      bound: m.bound === null ? null : Math.round(m.bound),
      gapPct: m.gapPct === null ? null : Number(m.gapPct.toFixed(2)),
      timeMs: m.timeMs,
      variables: m.variables,
      constraints: m.constraints,
      milp: plan.cost.total,
      greedy: greedy.cost.total,
      milpSa: milpSa.cost.total,
      sa: sa.cost.total
    };
    results.push(row);
    t.diagnostic(`${c.id}: HiGHS ${m.status} obj ${row.objective} bound ${row.bound} gap ${row.gapPct}% in ${m.timeMs} ms (${m.variables} vars, ${m.constraints} rows; plan from ${m.source})`);
    t.diagnostic(`${c.id}: scheduler cost MILP ${plan.cost.total} | greedy ${greedy.cost.total} | MILP+SA ${milpSa.cost.total} (${blocks(milpSa)}) | greedy+SA ${sa.cost.total} (${blocks(sa)})`);
  });
}

test('approved blocks are held by the MILP construction', (t) => {
  const ctx = createContext('SWR_SBC_JTJ');
  const args = weeklyArgs(ctx);
  const seed = planHorizon({ ...args, iterations: 0 });
  const block = seed.blocks.find((b) => b.lineClosure && b.tasks.length === 1);
  assert.ok(block, 'a single-work possession to approve');
  const fixedBlocks = [{ id: block.id, day: block.day, line: block.line, start: block.start, end: block.end, taskIds: [block.tasks[0].id] }];
  let out = null;
  const milp = makeMilpConstruct(highs, { timeLimitSec: Math.min(TIME, 3) });
  const plan = planHorizon({ ...args, fixedBlocks, iterations: 0, construct: (input) => (out = milp(input)) });
  if (!out) return t.skip('scheduler.planHorizon has no construct hook');
  const a = out.assign.get(block.tasks[0].id);
  assert.ok(a && a.day === block.day && a.start === block.start && a.end === block.end, 'fixed work kept on its approved window');
  assert.equal(plan.cost.hard, 0, plan.cost.hardReasons.join('; '));
});

test('MILP vs simulated annealing summary', (t) => {
  if (!results.length) return t.skip('no corridor solved');
  for (const r of results) t.diagnostic(JSON.stringify(r));
});
