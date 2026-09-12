/**
 * Store & workflow tests. The store, the selectors and lib/triage are
 * TypeScript; Node 20 cannot import .ts, so a tiny loader below transpiles
 * them with the project's own `typescript` package into node_modules/.tmp
 * (import specifiers rewritten to absolute file URLs) and imports the result.
 * The zustand store runs for real (in-memory localStorage shim); the planning
 * worker is not available in Node, so re-plans are simulated by promoting a
 * candidate snapshot, which runs the same reconciliation as runPlan.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RULES } from '../src/engine/constants.js';
import { registerOrderNo } from '../src/engine/cautionOrder.js';

/* ── TS loader ─────────────────────────────────────────────── */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'node_modules', '.tmp', 'ts-test');
const compiled = new Map();

function resolveSpec(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, join(base, 'index.ts')]) if (existsSync(c) && statSync(c).isFile()) return c;
  throw new Error(`cannot resolve ${spec} from ${fromFile}`);
}

function compile(file) {
  if (compiled.has(file)) return compiled.get(file);
  const outFile = join(OUT, relative(ROOT, file)).replace(/\.tsx?$/, '.mjs');
  compiled.set(file, outFile);
  const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, isolatedModules: true },
  });
  const code = outputText.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\2/g, (_m, pre, q, spec) => {
    const target = resolveSpec(file, spec);
    const url = /\.tsx?$/.test(target) ? pathToFileURL(compile(target)).href : pathToFileURL(target).href;
    return `${pre}${q}${url}${q}`;
  });
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, code);
  return outFile;
}

const importTs = (rel) => import(pathToFileURL(compile(resolve(ROOT, rel))).href);

// in-memory localStorage for the persist middleware
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
};

const sel = await importTs('src/engine/select.ts');
const triage = await importTs('src/lib/triage.ts');
const portals = await importTs('src/auth/portals.ts');
const storeMod = await importTs('src/store/useAppStore.ts');
const { useAppStore, buildRequest, executionRecordsForEngine } = storeMod;

/* ── fixtures ──────────────────────────────────────────────── */

const CORR = 'NCR_NDLS_CNB';
const as = (email) => portals.toSession(portals.DEMO_ACCOUNTS.find((a) => a.email === email));
const USERS = {
  planner: () => as('planner@ir.demo'),
  den: () => as('srden@ir.demo'),
  dste: () => as('srdste@ir.demo'),
  sse: () => as('sse.pway@ir.demo'),
  aen: () => as('aen@ir.demo'),
  je: () => as('je.pway@ir.demo'),
  sc: () => as('sc.mtj@ir.demo'),
  gang: () => as('gang4@ir.demo'),
  lp: () => as('lp@ir.demo'),
};

const bt = (id, workType, dept, start, end, extra = {}) => ({ id, workType, label: `${workType} ${id}`, dept, start, end, startText: '', endText: '', arci: 0.5, urgency: 'TACTICAL', machineId: null, crewId: null, startKm: 50, endKm: 52, closure: 'LINE', tsrKmph: null, ...extra });

function block(id, over = {}) {
  const b = {
    id,
    day: 1,
    date: '2026-09-08',
    dateLabel: 'Tue 08 Sep',
    line: 'UP',
    kind: 'TRAFFIC',
    lineClosure: true,
    sections: [2],
    sectionLabels: ['A–B'],
    sectionText: 'A–B',
    startKm: 50,
    endKm: 52,
    start: 60,
    end: 180,
    startText: '01:00',
    endText: '03:00',
    spanMin: 120,
    departments: ['TMS'],
    coLocated: false,
    tasks: [bt('T1', 'TAMPING', 'TMS', 70, 170)],
    machines: ['CSM-1'],
    crews: ['PW-1'],
    oheSections: [],
    powerIsolation: null,
    affectedTrains: [],
    weightedDelayMin: 0,
    rawDelayMin: 0,
    premiumConflicts: 0,
    status: 'PROPOSED',
    ...over,
  };
  b.spanMin = b.end - b.start;
  return b;
}

const task = (id, workType, dept, over = {}) => ({ id, workType, dept, label: `${workType} ${id}`, durationMin: 110, baseDurationMin: 100, sectionLabel: 'A–B', startKm: 50, endKm: 52, line: 'UP', tsrKmph: null, risk: { mandatory: false, arci: 0.5 }, ...over });

function snapshotWith(blocks, extra = {}) {
  return {
    seed: 26027,
    corridor: { id: CORR, code: 'NDLS–CNB', name: 'test', lengthKm: 440, mpsKmph: 130, division: 'Agra', blockSections: [0, 1, 2, 3].map((i) => ({ id: `S${i}`, index: i, from: `X${i}`, to: `X${i + 1}`, label: `X${i}–X${i + 1}`, startKm: i * 25, endKm: (i + 1) * 25, lengthKm: 25 })), stations: [], oheSections: [] },
    planStart: '2026-09-07',
    tasks: [task('T1', 'TAMPING', 'TMS'), task('T2', 'DEEP_SCREENING', 'TMS'), task('S1', 'POINT_MACHINE_OVERHAUL', 'SMMS'), task('T3', 'USFD_OBS_RAIL', 'TMS')],
    feeds: { machines: [{ id: 'CSM-1', label: 'CSM tamper 1' }, { id: 'BCM-1', label: 'BCM 1' }], crews: [{ id: 'PW-1', label: 'P-Way gang 1' }, { id: 'SIG-1', label: 'Signal unit 1' }], timetable: [], freight: [], executionLog: [] },
    result: { weekly: { ai: { blocks, scheduled: [], deferred: [], cost: { hardReasons: [] }, resourceViolations: [], safetyConflicts: [] }, occupancy: [], kpis: { blockCount: blocks.length } }, rules: RULES },
    scenario: null,
    timing: { ms: 1 },
    ...extra,
  };
}

const B1 = block('B1');
const B2 = block('B2', { day: 2, date: '2026-09-09', departments: ['TMS', 'SMMS'], coLocated: true, tasks: [bt('T2', 'DEEP_SCREENING', 'TMS', 100, 250), bt('S1', 'POINT_MACHINE_OVERHAUL', 'SMMS', 120, 200)], start: 90, end: 260, machines: ['BCM-1'], crews: ['PW-1', 'SIG-1'] });
const B3 = block('B3', { day: 1, line: 'DN', start: 120, end: 200, tasks: [bt('T3', 'USFD_OBS_RAIL', 'TMS', 125, 195)], machines: [], crews: [] });

const st = () => useAppStore.getState();
const lastToast = () => st().toasts[st().toasts.length - 1]?.title ?? '';
function reset(user, blocks = [B1, B2, B3]) {
  useAppStore.setState({ user, corridorId: CORR, snapshot: snapshotWith(blocks), approvals: {}, executionLog: [], forms: {}, powerBlocks: {}, extensions: [], messages: [], acks: [], pushed: [], toasts: [], audit: [], intakeTasks: [], reports: [], scenario: null, language: 'en', candidate: null, planStatus: 'ready' });
}
const promote = (blocks) => {
  useAppStore.setState({ candidate: { snapshot: snapshotWith(blocks), patch: {}, reason: 'test re-plan', at: new Date().toISOString() } });
  st().promoteCandidate();
};

/* ── the propose → concur → grant → lock chain ─────────────── */

test('propose step is enforced and capabilities are checked inside the actions', () => {
  reset(USERS.sc());
  assert.equal(st().grant('B1'), false, 'cannot grant a draft');
  assert.match(lastToast(), /not been sent/);

  useAppStore.setState({ user: USERS.den() });
  assert.equal(st().concur('B1', 'TMS'), false, 'no concurrence before the block is sent');

  useAppStore.setState({ user: USERS.sse() });
  assert.equal(st().proposeBlocks(['B1']), 0, 'SSE cannot send blocks');

  useAppStore.setState({ user: USERS.planner() });
  assert.equal(st().proposeBlocks(['B1', 'B2', 'NOPE']), 2, 'only blocks of the current plan are sent');
  const g = st().approvals.B1.geometry;
  assert.deepEqual({ day: g.day, date: g.date, line: g.line, start: g.start, end: g.end, taskIds: g.taskIds }, { day: 1, date: '2026-09-08', line: 'UP', start: 60, end: 180, taskIds: ['T1'] });
  assert.deepEqual(g.tasks, [{ id: 'T1', start: 70, end: 170 }]);
  assert.equal(st().concur('B1', 'TMS'), false, 'planning concurrence on behalf needs a note');
  assert.equal(st().proposeBlocks(['B1']), 0, 'an already sent block is not re-sent');

  useAppStore.setState({ user: USERS.sse() });
  assert.equal(st().concur('B1', 'TMS'), false, 'SSE / P-Way has no concur:TMS');
  useAppStore.setState({ user: USERS.dste() });
  assert.equal(st().concur('B1', 'SMMS'), false, 'S&T has no work in B1');

  useAppStore.setState({ user: USERS.sc() });
  assert.equal(st().grant('B1'), false, 'cannot grant before concurrence');
  assert.match(lastToast(), /TMS pending/);
  assert.equal(st().lock('B1'), false, 'cannot lock a proposed block');

  useAppStore.setState({ user: USERS.aen() });
  assert.equal(st().concur('B1', 'TMS', 'AEN on behalf of Sr. DEN'), true, 'ADEN carries concur:TMS');
  assert.equal(sel.workflowState(st().approvals.B1, ['TMS']), 'CONCURRED');

  useAppStore.setState({ user: USERS.gang() });
  assert.equal(st().grant('B1'), false, 'gang cannot grant');

  useAppStore.setState({ user: USERS.sc() });
  assert.equal(st().grant('B1', { start: 90, end: 210 }), true, 'grant with change on a concurred block');
  const a = st().approvals.B1;
  assert.equal(a.status, 'GRANTED');
  assert.deepEqual([a.geometry.start, a.geometry.end], [90, 210], 'geometry follows the override');
  assert.deepEqual(a.geometry.tasks, [{ id: 'T1', start: 100, end: 200 }], 'work windows shift with the override');
  assert.equal(st().refuse('B1', 'late'), false, 'a granted block cannot be refused');
  const granted = st().pushed[0];
  assert.deepEqual([...granted.portals].sort(), ['field', 'planning', 'tms'], 'grant goes to the departments in the block, field and planning');

  useAppStore.setState({ user: USERS.lp() });
  assert.equal(st().lock('B1'), false, 'loco pilot cannot lock');
  useAppStore.setState({ user: USERS.sc() });
  const before = st().pushed.length;
  assert.equal(st().lock('B1'), true);
  assert.equal(st().approvals.B1.status, 'LOCKED');
  const n = st().pushed[0];
  assert.equal(st().pushed.length, before + 1, 'one lock notification');
  assert.match(n.title, /^Block B1 locked for Tue 08 Sep$/);
  assert.deepEqual([...n.portals].sort(), ['field', 'planning', 'tms']);
  assert.ok(st().audit.some((e) => e.action === 'BLOCK_LOCKED' && e.entityId === 'B1'), 'lock audited');
  assert.equal(st().lock('B1'), false, 'a locked block is not locked again');
});

test('planning may record concurrence on behalf with a note; objections reopen concurrence', () => {
  reset(USERS.planner());
  st().proposeBlocks(['B2']);
  assert.equal(st().concur('B2', 'TMS', 'Phone, Sr. DEN 21:40'), true);
  assert.match(st().approvals.B2.concur.TMS.note, /^On behalf/);
  assert.equal(sel.workflowState(st().approvals.B2, ['TMS', 'SMMS']), 'PROPOSED', 'partly concurred');
  useAppStore.setState({ user: USERS.dste() });
  assert.equal(st().object('B2', 'SMMS', 'Point 112 not ready'), true);
  assert.equal(st().pushed[0].title, 'Objection on B2 from SMMS');
  assert.equal(st().concur('B2', 'SMMS', 'resolved'), true);
  assert.equal(sel.workflowState(st().approvals.B2, ['TMS', 'SMMS']), 'CONCURRED');
  assert.equal(st().approvals.B2.objections.length, 0);
});

/* ── approvals survive re-plans ────────────────────────────── */

test('buildRequest holds concurred / granted / locked / started blocks fixed at their geometry', () => {
  reset(USERS.planner());
  st().proposeBlocks(['B1', 'B2', 'B3']);
  useAppStore.setState({ user: USERS.den() });
  st().concur('B1', 'TMS');
  st().concur('B3', 'TMS');
  st().concur('B2', 'TMS'); // B2 still waits for S&T
  useAppStore.setState({ user: USERS.sc() });
  st().grant('B3', { start: 130, end: 210 });

  const req = buildRequest(st(), { fixedBlocks: [{ id: 'B1', day: 1, line: 'UP', start: 300, end: 420, taskIds: ['T1'] }] });
  const byId = Object.fromEntries(req.fixedBlocks.map((f) => [f.id, f]));
  assert.ok(!byId.B2, 'a partly concurred block is not fixed');
  assert.equal(byId.B1.start, 300, 'the candidate patch wins for the same id');
  assert.deepEqual([byId.B3.start, byId.B3.end, byId.B3.day, byId.B3.line], [130, 210, 1, 'DN'], 'granted with change: override geometry');
  assert.deepEqual(byId.B3.tasks, [{ id: 'T3', start: 135, end: 205 }]);

  const plain = buildRequest(st());
  assert.deepEqual(plain.fixedBlocks.map((f) => f.id).sort(), ['B1', 'B3']);
});

test('fixedBlocksFromApprovals: started possession wins a work claimed twice; days follow the plan week', () => {
  const geo = (id, day, date, taskIds, start = 60) => ({ day, date, line: 'UP', start, end: start + 100, taskIds, tasks: taskIds.map((t) => ({ id: t, start, end: start + 100 })), departments: ['TMS'] });
  const approvals = {
    OLD: { status: 'GRANTED', concur: { TMS: {} }, objections: [], proposedAt: 'x', geometry: geo('OLD', 1, '2026-09-08', ['T1', 'T9']) },
    NEW: { status: 'PROPOSED', concur: { TMS: {} }, objections: [], proposedAt: 'x', geometry: geo('NEW', 2, '2026-09-09', ['T1'], 200) },
    GONE: { status: 'LOCKED', concur: {}, objections: [], proposedAt: 'x', geometry: geo('GONE', 0, '2026-09-01', ['T5']) },
  };
  const log = [{ blockId: 'NEW', corridorId: CORR, status: 'IN_PROGRESS', date: '2026-09-09', line: 'UP', plannedStart: 200, plannedEnd: 300, items: [{ taskId: 'T1' }] }];
  const fixed = sel.fixedBlocksFromApprovals(approvals, log, { planStart: '2026-09-07', corridorId: CORR });
  const byId = Object.fromEntries(fixed.map((f) => [f.id, f]));
  assert.deepEqual(byId.NEW.taskIds, ['T1'], 'the started block keeps T1');
  assert.deepEqual(byId.OLD.taskIds, ['T9'], 'T1 is released from the other block');
  assert.ok(!byId.GONE, 'a block dated before the plan week is not sent');
  assert.equal(byId.NEW.day, 2);
});

test('re-plan: fixed blocks re-attach by works, sent proposals that moved are superseded and planning is told', () => {
  reset(USERS.planner());
  st().proposeBlocks(['B1', 'B2']);
  useAppStore.setState({ user: USERS.den() });
  st().concur('B1', 'TMS');
  useAppStore.setState({ user: USERS.sc() });
  st().grant('B1');
  st().startPossession({ blockId: 'B1', corridorId: CORR, date: '2026-09-08', sectionText: 'A–B', line: 'UP', plannedStart: 60, plannedEnd: 180, plannedSpanMin: 120, items: [{ taskId: 'T1', label: 'x', dept: 'TMS', workType: 'TAMPING', plannedMin: 100, done: false }], actualStart: 65, source: 'control' });

  // the new plan: B1's works under another id (same window), B2 moved to another night
  const B1b = block('B1-NEW');
  const B2b = block('B2-MOVED', { ...B2, id: 'B2-MOVED', day: 4, date: '2026-09-11' });
  promote([B1b, B2b, B3]);
  const ap = st().approvals;
  assert.ok(!ap.B1 && ap['B1-NEW'], 'granted approval re-keyed to the block with the same works');
  assert.equal(ap['B1-NEW'].status, 'GRANTED');
  assert.equal(ap['B1-NEW'].rekeyedFrom, 'B1');
  assert.equal(st().executionLog[0].blockId, 'B1-NEW', 'the possession in progress moves with it');
  assert.ok(ap.B2.supersededAt, 'the moved proposal is kept and marked superseded');
  assert.equal(sel.workflowState(ap.B2), 'SUPERSEDED');
  const n = st().pushed.find((p) => /changed after re-plan/.test(p.title));
  assert.ok(n, 'planning notified');
  assert.equal(n.title, '1 proposed block changed after re-plan — send again');
  assert.deepEqual(n.portals, ['planning']);
  assert.ok(st().audit.some((e) => e.action === 'PROPOSAL_SUPERSEDED' && e.entityId === 'B2'));
  const list = sel.supersededProposals(ap);
  assert.deepEqual(list.map((x) => x.blockId), ['B2']);

  // concurrence on the superseded record is refused; sending the new block replaces it
  useAppStore.setState({ user: USERS.den() });
  assert.equal(st().concur('B2', 'TMS'), false);
  useAppStore.setState({ user: USERS.planner() });
  assert.equal(st().proposeBlocks(['B2-MOVED']), 1);
  assert.ok(!st().approvals.B2, 'superseded record replaced by the re-sent block');
  assert.equal(sel.supersededProposals(st().approvals).length, 0);
});

/* ── resources, requisitions, corridor isolation ──────────── */

test('setResources refuses a machine or gang double-booking', () => {
  reset(USERS.sc());
  assert.equal(st().setResources('B3', { machineId: 'CSM-1' }), false, 'CSM-1 works in B1 at an overlapping time');
  assert.match(lastToast(), /CSM tamper 1 is already working in block B1/);
  assert.equal(st().setResources('B3', { crewId: 'SIG-1' }), true, 'SIG-1 is free on that day');
  assert.equal(st().approvals.B3.resources.crewId, 'SIG-1');
  assert.equal(st().setResources('B1', { crewId: 'SIG-1' }), false, 'now SIG-1 is booked in B3');
});

test('acceptRequisition carries every requisition field into the InjectSpec; withdraw removes it', () => {
  reset(USERS.planner());
  const base = { corridorId: CORR, dept: 'TMS', workType: 'TURNOUT_RENEWAL', line: 'UP', startKm: 50, endKm: 50.4, durationMin: 200, preferredDate: '2026-09-10', preferredWindow: 'night', machine: 'UNIMAT', crew: 'PWAY_GANG', blockType: 'INTEGRATED', validation: [], status: 'SUBMITTED' };
  useAppStore.setState({ requisitions: [] });
  const r1 = st().saveRequisition({ ...base, workType: 'POINT_MACHINE_OVERHAUL', dept: 'SMMS', blockType: 'DISCONNECTION', preferredDate: '2026-10-01' });
  const r2 = st().saveRequisition({ ...base, needsPowerBlock: true, needsDisconnection: true, dependsOnReqIds: [r1.id], coRequireReqIds: [r1.id], sourceTaskId: 'T3' });
  useAppStore.setState({ requisitions: st().requisitions.map((r) => ({ ...r, status: 'SUBMITTED' })) });

  const t2 = st().acceptRequisition(r2.id);
  const s = t2.spec;
  assert.equal(s.sourceId, `REQ/${r2.id}`);
  assert.equal(s.durationMin, 200);
  assert.equal(s.preferredDay, 3, '2026-09-10 is day 3 of the week from 2026-09-07');
  assert.equal(s.preferredWindow, 'night');
  assert.equal(s.machine, 'UNIMAT');
  assert.equal(s.blockKind, 'TRAFFIC + POWER');
  assert.deepEqual(s.requires, ['POWER_BLOCK', 'DISCONNECTION']);
  assert.deepEqual(s.dependsOn, [`REQ/${r1.id}`]);
  assert.deepEqual(s.coRequireWith, [`REQ/${r1.id}`]);
  assert.equal(s.corridorId, CORR);
  assert.equal(s.replacesTaskId, 'T3');
  const t1 = st().acceptRequisition(r1.id);
  assert.equal(t1.spec.preferredDay, undefined, 'a preferred date outside the week is omitted');
  assert.equal(t1.spec.blockKind, 'DISCONNECTION');
  assert.equal(st().acceptRequisition(r1.id), null, 'an accepted requisition is not accepted twice');

  const injects = buildRequest(st()).scenario.injectTasks.map((x) => x.sourceId);
  assert.deepEqual(injects.sort(), [`REQ/${r1.id}`, `REQ/${r2.id}`].sort());
  st().withdrawRequisition(r2.id);
  assert.ok(!st().intakeTasks.some((t) => t.id === t2.id), 'withdrawing removes the injected work');
  assert.deepEqual(buildRequest(st()).scenario.injectTasks.map((x) => x.sourceId), [`REQ/${r1.id}`]);

  useAppStore.setState({ user: USERS.sse() });
  const r3 = st().saveRequisition({ ...base });
  useAppStore.setState({ requisitions: st().requisitions.map((r) => (r.id === r3.id ? { ...r, status: 'SUBMITTED' } : r)) });
  assert.equal(st().acceptRequisition(r3.id), null, 'only the planning cell accepts');
});

test('corridor isolation: only the active corridor intake and reports are injected; switching clears the scenario', () => {
  reset(USERS.planner());
  st().addIntakeTask({ spec: { sourceId: 'X/1', workType: 'TAMPING', line: 'UP', startKm: 1, endKm: 2 }, label: 'here', dept: 'TMS', submittedBy: 'a', role: 'r', source: 'FIELD' });
  st().addIntakeTask({ spec: { sourceId: 'X/2', workType: 'TAMPING', line: 'UP', startKm: 1, endKm: 2 }, label: 'there', dept: 'TMS', submittedBy: 'a', role: 'r', source: 'FIELD', corridorId: 'OTHER' });
  const rep = (id, corridorId, intakeTaskId) => ({ id, corridorId, status: 'TASK', taskSpec: { workType: 'TAMPING', line: 'UP', startKm: 3, endKm: 4 }, intakeTaskId });
  useAppStore.setState({ reports: [rep('R1', CORR, 'INTAKE-GONE'), rep('R2', 'OTHER'), rep('R3', CORR, st().intakeTasks[0].id)] });
  const ids = buildRequest(st()).scenario.injectTasks.map((x) => x.sourceId).sort();
  assert.deepEqual(ids, ['REPORT/R1', 'X/1'], 'other corridor excluded; a report whose intake task exists is not injected twice');
  assert.equal(st().intakeTasks[0].corridorId, CORR, 'intake stamped with the active corridor');

  useAppStore.setState({ scenario: { presetId: null, name: 'Tamper down', params: {}, scenario: { removeMachines: ['CSM-1'] } } });
  st().proposeBlocks(['B1']);
  const impact = st().corridorSwitchImpact();
  assert.equal(impact.approvals, 1);
  assert.equal(impact.scenario, true);
  assert.equal(impact.machineRemovals, 1);
  st().setCorridor('NCR_DLI_AGC');
  assert.equal(st().scenario, null, 'scenario and its machine removals cleared');
  assert.deepEqual(st().approvals, {});
  assert.ok(st().audit.some((e) => e.action === 'CORRIDOR_CHANGED' && /1 approvals/.test(e.detail)));
});

/* ── execution: work-only minutes, extensions, messages, acks ─ */

test('execution records use work-only planned minutes (calibration basis = seeded log)', () => {
  reset(USERS.planner());
  st().proposeBlocks(['B1']);
  useAppStore.setState({ user: USERS.den() });
  st().concur('B1', 'TMS');
  useAppStore.setState({ user: USERS.sc() });
  st().grant('B1');
  useAppStore.setState({ user: USERS.gang() });
  // the page passes the whole task window (100 min incl. setup / clearance)
  assert.equal(st().startPossession({ blockId: 'B1', corridorId: CORR, date: '2026-09-08', sectionText: 'A–B', line: 'UP', plannedStart: 60, plannedEnd: 180, plannedSpanMin: 120, items: [{ taskId: 'T1', label: 'x', dept: 'TMS', workType: 'TAMPING', plannedMin: 100, done: false }], actualStart: 62 }), true);
  const it = st().executionLog[0].items[0];
  assert.equal(it.plannedMin, 110, 'work-only minutes the plan allotted (task.durationMin)');
  assert.equal(it.baseMin, 100, 'uncalibrated standard minutes (task.baseDurationMin)');
  assert.equal(st().startPossession({ blockId: 'B1', corridorId: CORR, date: '2026-09-08', sectionText: 'A–B', line: 'UP', plannedStart: 60, plannedEnd: 180, plannedSpanMin: 120, items: [], actualStart: 62 }), false, 'no second start');
  assert.equal(st().markItemDone('B1', 'T1', 130), true);
  const recs = executionRecordsForEngine(st().executionLog);
  assert.deepEqual(recs.map((r) => [r.workType, r.plannedMin, r.actualMin]), [['TAMPING', 100, 130]]);
  assert.ok(recs[0].overrunReason, '130 > 1.1 × 100 is an overrun');
  // records made before baseMin existed are corrected from the plan's tasks
  const legacy = [{ ...st().executionLog[0], items: [{ taskId: 'T1', workType: 'TAMPING', plannedMin: 150, done: true, actualMin: 120 }] }];
  assert.equal(executionRecordsForEngine(legacy, st().snapshot.tasks)[0].plannedMin, 100);
  assert.equal(st().clearPossession('B1', { actualEnd: 190 }), true);
  assert.equal(st().clearPossession('B1', { actualEnd: 195 }), false, 'nothing in progress any more');
  // not granted → cannot start
  assert.equal(st().startPossession({ blockId: 'B3', corridorId: CORR, date: '2026-09-08', sectionText: 'A–B', line: 'DN', plannedStart: 120, plannedEnd: 200, plannedSpanMin: 80, items: [], actualStart: 120 }), false);
});

test('extension requested by site and approved by Control extends the window and the fixed geometry', () => {
  reset(USERS.planner());
  st().proposeBlocks(['B1']);
  useAppStore.setState({ user: USERS.den() });
  st().concur('B1', 'TMS');
  useAppStore.setState({ user: USERS.sc() });
  st().grant('B1');
  useAppStore.setState({ user: USERS.lp() });
  assert.equal(st().requestExtension('B1', { extraMin: 30, reason: 'x' }), null, 'loco pilot has no execute');
  useAppStore.setState({ user: USERS.je() });
  assert.equal(st().requestExtension('B1', { extraMin: 2, reason: 'short' }), null, 'too short');
  const e = st().requestExtension('B1', { extraMin: 30, reason: 'Ballast train late' });
  assert.ok(e && e.status === 'PENDING');
  assert.equal(st().pushed[0].title, 'Extension requested · B1');
  assert.deepEqual(st().pushed[0].portals, ['control']);
  assert.equal(st().requestExtension('B1', { extraMin: 15, reason: 'again' }), null, 'one pending request at a time');
  assert.equal(st().decideExtension('B1', e.id, true), false, 'JE cannot decide');
  useAppStore.setState({ user: USERS.sc() });
  assert.equal(st().decideExtension('B1', e.id, true, 'Next path at 03:40'), true);
  const a = st().approvals.B1;
  assert.deepEqual([a.override.start, a.override.end, a.geometry.end, a.extendedMin], [60, 210, 210, 30]);
  assert.equal(st().pushed[0].title, 'Extension granted · B1');
  assert.deepEqual([...st().pushed[0].portals].sort(), ['field', 'tms']);
  assert.equal(buildRequest(st()).fixedBlocks.find((f) => f.id === 'B1').end, 210);
  assert.equal(st().decideExtension('B1', e.id, true), false, 'already decided');
  assert.ok(st().audit.some((x) => x.action === 'EXTENSION_REQUESTED') && st().audit.some((x) => x.action === 'EXTENSION_APPROVED'));
});

test('running past planned end, site messages with replies, loco pilot acknowledgements', () => {
  reset(USERS.planner());
  st().proposeBlocks(['B1']);
  useAppStore.setState({ user: USERS.den() });
  st().concur('B1', 'TMS');
  useAppStore.setState({ user: USERS.sc() });
  st().grant('B1');
  st().startPossession({ blockId: 'B1', corridorId: CORR, date: '2026-09-08', sectionText: 'A–B', line: 'UP', plannedStart: 60, plannedEnd: 180, plannedSpanMin: 120, items: [], actualStart: 60, source: 'control' });
  const wb = sel.workingBlocks(st().snapshot, st().approvals);
  assert.equal(sel.blocksRunningPastEnd(wb, st().executionLog, 170, 1).length, 0, 'before the planned end');
  const late = sel.blocksRunningPastEnd(wb, st().executionLog, 200, 1);
  assert.deepEqual(late.map((l) => [l.block.id, l.overMin]), [['B1', 20]]);
  assert.equal(sel.blocksRunningPastEnd(wb, st().executionLog, 10, 2)[0].overMin, 1440 + 10 - 180, 'next day');

  useAppStore.setState({ user: USERS.gang() });
  st().messageControl('B1', 'Machine 20 min late');
  const m = st().messages[0];
  assert.equal(st().replyToMessage(m.id, 'Noted'), false, 'field cannot reply as Control');
  useAppStore.setState({ user: USERS.sc() });
  assert.equal(st().replyToMessage(m.id, 'Noted, extend if needed'), true);
  assert.equal(st().pushed[0].title, 'Control replied · B1');
  assert.deepEqual(st().pushed[0].portals, ['field']);
  const thread = sel.messagesForBlock(st().messages, 'B1');
  assert.deepEqual(thread.map((x) => x.from), ['field', 'control']);
  assert.equal(thread[1].replyTo, m.id);

  const orderNo = registerOrderNo(st().snapshot.corridor, 'T1');
  useAppStore.setState({ forms: { [orderNo]: { status: 'ISSUED', by: 'SC', at: 'x' } }, user: USERS.lp() });
  assert.equal(st().ackCaution(orderNo, '12952'), true);
  assert.equal(st().ackCaution(orderNo, '12952'), false, 'one acknowledgement per person');
  assert.equal(st().forms[orderNo].status, 'ISSUED', 'status kept');
  assert.equal(st().forms[orderNo].acknowledgements.length, 1);
  assert.equal(st().pushed[0].title, `Caution order acknowledged · ${orderNo}`);
  assert.deepEqual(st().pushed[0].portals, ['control']);
  assert.equal(sel.acksForOrder(st().acks, orderNo).length, 1);
});

/* ── conflicts ─────────────────────────────────────────────── */

test('conflictsFor lists double bookings, incompatible works, objections, safety, superseded — with params', () => {
  const inc = block('B4', { day: 3, date: '2026-09-10', departments: ['TMS', 'TDMS'], tasks: [bt('T2', 'DEEP_SCREENING', 'TMS', 60, 170), bt('W1', 'CONTACT_WIRE_RENEWAL', 'TDMS', 60, 170)], machines: [], crews: [] });
  const clash = block('B5', { line: 'DN', start: 100, end: 200, tasks: [bt('T9', 'TAMPING', 'TMS', 100, 200)], machines: ['CSM-1'], crews: [] });
  const snap = snapshotWith([B1, clash, inc]);
  snap.tasks.push(task('M1', 'USFD_IMR_RAIL', 'TMS', { risk: { mandatory: true, arci: 0.97 } }), task('M2', 'USFD_IMR_RAIL', 'TMS', { risk: { mandatory: true, arci: 0.9 } }));
  snap.result.weekly.ai.safetyConflicts = [{ taskId: 'M1', label: 'IMR weld', dueDay: 0, placedDay: null, reason: 'No free window on or before its due day', detail: null }];
  snap.result.weekly.ai.deferred = [{ taskId: 'M1', arci: 0.97, urgency: 'IMMEDIATE', reason: 'x' }, { taskId: 'M2', arci: 0.9, urgency: 'IMMEDIATE', reason: 'no window' }];
  const approvals = {
    B5: { status: 'PROPOSED', concur: {}, objections: [{ dept: 'TMS', by: 'DEN', at: 'x', reason: 'Gang on leave' }], proposedAt: 'x', geometry: { day: 1, line: 'DN', start: 100, end: 200, taskIds: ['T9'], tasks: [], departments: ['TMS'] } },
    OLD: { status: 'PROPOSED', concur: {}, objections: [], proposedAt: 'x', supersededAt: '2026-09-12T00:00:00Z', geometry: { day: 2, line: 'UP', start: 1, end: 2, taskIds: ['T7'], tasks: [] } },
  };
  const wb = sel.workingBlocks(snap, approvals);
  const list = sel.conflictsFor(snap, wb, approvals);
  const kinds = list.map((c) => c.kind);
  const mo = list.find((c) => c.kind === 'MACHINE_OVERLAP');
  assert.equal(mo.params.machineId, 'CSM-1');
  assert.equal(mo.params.machine, 'CSM tamper 1');
  assert.deepEqual([mo.blockId, mo.params.otherBlockId].sort(), ['B1', 'B5']);
  assert.ok(kinds.includes('INCOMPATIBLE'));
  assert.equal(list.find((c) => c.kind === 'OBJECTION').params.reason, 'Gang on leave');
  assert.equal(list.filter((c) => c.taskId === 'M1').length, 1, 'safety conflict and deferred mandatory are one entry');
  assert.equal(list.find((c) => c.taskId === 'M1').kind, 'SAFETY');
  assert.equal(list.find((c) => c.taskId === 'M2').kind, 'DEFERRED_MANDATORY');
  assert.equal(list.find((c) => c.kind === 'SUPERSEDED').blockId, 'OLD');
  assert.ok(list.every((c) => ['high', 'medium', 'low'].includes(c.severity)));
  const order = { high: 0, medium: 1, low: 2 };
  assert.ok(list.every((c, i) => i === 0 || order[list[i - 1].severity] <= order[c.severity]), 'sorted by severity');
  // resources override moves the machine: no overlap
  const moved = sel.conflictsFor(snap, wb, approvals, { B5: { machineId: 'BCM-1' } });
  assert.ok(!moved.some((c) => c.kind === 'MACHINE_OVERLAP'));
  // JPO day limits after overrides
  const many = sel.conflictsFor(snap, wb, approvals, null, { rules: { ...RULES, maxConcurrentBlocks: 1, maxBlocksPerDay: 1 } });
  assert.ok(many.some((c) => c.kind === 'CONCURRENCY' && c.day === 1 && c.params.count === 2));
  assert.ok(many.some((c) => c.kind === 'BLOCKS_PER_DAY' && c.day === 1));
});

/* ── triage ────────────────────────────────────────────────── */

test('suggestCategory: keyword rules in English, Hindi and other citizen languages', () => {
  const cat = (s) => triage.suggestCategory(s)?.category ?? null;
  assert.equal(cat('Crack in the rail near km 234'), 'track');
  assert.equal(cat('पटरी में दरार दिख रही है'), 'track');
  assert.equal(cat('Overhead wire sagging, sparks'), 'ohe');
  assert.equal(cat('बिजली का तार नीचे लटक रहा है'), 'ohe');
  assert.equal(cat('Signal lamp out at the home signal'), 'signal');
  assert.equal(cat('सिग्नल बंद है'), 'signal');
  assert.equal(cat('Smoke and fire near the line'), 'fire');
  assert.equal(cat('आग और धुआँ'), 'fire');
  assert.equal(cat('LC gate boom broken'), 'lc');
  assert.equal(cat('फाटक टूटा'), 'lc');
  assert.equal(cat('Cattle on track'), 'obstruction', '"track" as a location loses the tie');
  assert.equal(cat('Tree fallen across both lines'), 'obstruction');
  assert.equal(cat('Track circuit failure at home signal'), 'signal', 'a longer S&T phrase is not also a track word');
  assert.equal(cat('Severe track jerk, possible weld defect or rail dip'), 'track');
  assert.equal(cat('লাইনের পাশে আগুন'), 'fire', 'Bengali');
  assert.equal(cat('தண்டவாளம் விரிசல்'), 'track', 'Tamil');
  assert.equal(cat('ಹಳಿ ಬಿರುಕು'), 'track', 'Kannada');
  assert.equal(cat('રેલવે ફાટક બંધ નથી'), 'lc', 'Gujarati');
  assert.equal(cat('nothing here'), null);
  assert.equal(cat(''), null);
  assert.equal(cat('The trailer passed'), null, 'no match inside another word');
  assert.deepEqual(triage.suggestCategory('Tree branch touching the OHE wire').matched.sort(), ['ohe', 'wire'].sort(), 'OHE outranks obstruction on a tie');
});

test('computeSeverity: transparent points table', () => {
  const hi = triage.computeSeverity({ category: 'track', minutesToNextTrain: 8, premiumNext: true, onMainLine: true });
  assert.equal(hi.level, 'high');
  assert.equal(hi.points, 3 + 2 + 1 + 1);
  assert.equal(hi.reasons.length, hi.factors.length);
  assert.ok(hi.reasons.some((r) => /8 min/.test(r)));
  assert.equal(triage.computeSeverity({ category: 'track', minutesToNextTrain: 90, onMainLine: true }).level, 'medium');
  assert.equal(triage.computeSeverity({ category: 'track', minutesToNextTrain: 8, onMainLine: true, tsrInForce: true }).level, 'medium', 'a TSR in force lowers it');
  assert.equal(triage.computeSeverity({ category: 'other', minutesToNextTrain: null }).level, 'low');
  assert.equal(triage.computeSeverity({ category: 'lc' }).factors.find((f) => f.key === 'nextTrainUnknown').points, 0);
});

test('submitReport computes severity when the reporter gives none, and keeps a given one', () => {
  reset(null);
  const r = st().submitReport({ source: 'citizen', reporter: { name: 'A', role: 'Passenger', portal: 'citizen' }, lang: 'hi', description: 'पटरी में दरार', category: 'other', km: 51, line: 'UP', corridorId: CORR });
  assert.equal(r.severityAuto, true);
  assert.ok(['high', 'medium', 'low'].includes(r.severity));
  assert.ok(r.severityReasons.length >= 2);
  assert.equal(r.suggestedCategory.category, 'track', 'keyword suggestion kept for triage');
  const given = st().submitReport({ source: 'field', reporter: { name: 'B', role: 'Keyman', portal: 'field' }, lang: 'en', description: 'weld crack', category: 'track', severity: 'low', corridorId: CORR });
  assert.equal(given.severity, 'low');
  assert.equal(given.severityAuto, undefined);
});

/* ── roles ─────────────────────────────────────────────────── */

test('ADEN and JE / P-Way roles: TMS portal, capabilities, demo accounts; self sign-up stays field-only', async () => {
  const { ROLES, PORTALS, DEMO_ACCOUNTS, can, toSession } = portals;
  assert.equal(ROLES.ADEN.portal, 'tms');
  assert.equal(ROLES.JE_PWAY.portal, 'tms');
  assert.ok(PORTALS.tms.roles.includes('ADEN') && PORTALS.tms.roles.includes('JE_PWAY'));
  assert.ok(ROLES.ADEN.label.hi && ROLES.JE_PWAY.label.hi);
  const aen = toSession(DEMO_ACCOUNTS.find((a) => a.email === 'aen@ir.demo'));
  const je = toSession(DEMO_ACCOUNTS.find((a) => a.email === 'je.pway@ir.demo'));
  assert.equal(aen.portal, 'tms');
  assert.equal(aen.dept, 'TMS');
  for (const c of ['intake', 'execute', 'report', 'concur:TMS']) assert.ok(can(aen, c), `ADEN ${c}`);
  for (const c of ['intake', 'execute', 'report']) assert.ok(can(je, c), `JE ${c}`);
  assert.ok(!can(je, 'concur:TMS') && !can(je, 'grant'));
  assert.equal(can({ ...je, role: 'NO_SUCH_ROLE' }, 'report'), false, 'unknown persisted role does not crash');
  globalThis.crypto ??= (await import('node:crypto')).webcrypto;
  const users = await importTs('src/auth/users.ts');
  assert.deepEqual(users.SELF_SIGNUP_ROLES, ['GANG_INCHARGE', 'LOCO_PILOT']);
  const bad = await users.signup({ name: 'X', email: 'x@y.z', password: 'abcd', role: 'ADEN', isSelfSignup: true, inviteCode: 'FIELD2026' });
  assert.deepEqual(bad, { ok: false, error: 'invalid_role' });
  assert.ok(await users.login('aen@ir.demo', 'samanvay'));
  assert.equal((await users.login('je.pway@ir.demo', 'samanvay')).role, 'JE_PWAY');
});
