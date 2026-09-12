/**
 * Main-thread derivations over the worker snapshot and the workflow state.
 * Pure functions, safe to call from useMemo. Nothing here invents a number:
 * every value is computed from the plan, the timetable or recorded actions.
 */
import { disconnectionNoticeNo, generateCautionOrders, generateDisconnectionNotices, manualOrderNo } from './cautionOrder.js';
import { generateBlockAdvisories } from './advisories.js';
import { evaluateWindow } from './delayModel.js';
import { computeExecutionMetrics } from './execution.js';
import { latLngAtKm, sectionAtKm } from './corridors.js';
import { positionAt } from './livePosition.js';
import { INCOMPATIBLE_PAIRS } from './constants.js';
import type { AffectedTrain, Block, Corridor, DayOccupancy, Dept, FixedBlockConstraint, InjectSpec, Line, Plan, Rules, Snapshot, Task, Train } from './types';
import type { Approval, ApprovalStatus, BlockGeometry, ExecRecord, FormRecord, HazardReport, IntakeTask, ManualTsr, PowerBlockStatus, Requisition } from '../store/useAppStore';
import { hhmm } from '../lib/format';

/* ── Working blocks (plan + workflow) ───────────────────────── */

/**
 * Where a block stands in the JPO workflow, derived from the stored approval:
 * DRAFT (optimiser proposal, not sent) → PROPOSED (sent, awaiting concurrence)
 * → CONCURRED (every department concurred) → GRANTED → LOCKED; REFUSED by
 * Control; SUPERSEDED when a re-plan changed a sent block (send it again).
 */
export type WorkflowState = 'DRAFT' | 'PROPOSED' | 'CONCURRED' | 'GRANTED' | 'LOCKED' | 'REFUSED' | 'SUPERSEDED';

export interface WorkingBlock extends Block {
  status: ApprovalStatus;
  approval: Approval | null;
  /** true when every department in the block has concurred */
  concurred: boolean;
  overridden: boolean;
  /** derived workflow state (see WorkflowState) */
  state: WorkflowState;
  /** the proposal was changed by a re-plan after it was sent */
  superseded: boolean;
}

const EMPTY: Approval = { status: 'PROPOSED', concur: {}, objections: [] };

/** Derived workflow state of one approval record for a block with these departments. */
export function workflowState(a: Approval | null | undefined, departments?: Dept[]): WorkflowState {
  if (!a) return 'DRAFT';
  if (a.status === 'GRANTED' || a.status === 'LOCKED' || a.status === 'REFUSED') return a.status;
  if (!a.proposedAt) return 'DRAFT';
  if (a.supersededAt) return 'SUPERSEDED';
  const depts = departments ?? a.geometry?.departments ?? [];
  return depts.length > 0 && depts.every((d) => !!a.concur[d]) ? 'CONCURRED' : 'PROPOSED';
}

export function workingBlocks(snapshot: Snapshot | null, approvals: Record<string, Approval>): WorkingBlock[] {
  if (!snapshot) return [];
  return snapshot.result.weekly.ai.blocks.map((b) => {
    const a = approvals[b.id] ?? null;
    const ap = a ?? EMPTY;
    const concurred = b.departments.every((d) => !!ap.concur[d]);
    const state = workflowState(a, b.departments);
    const superseded = state === 'SUPERSEDED';
    if (ap.override) {
      const start = ap.override.start;
      const end = ap.override.end;
      return { ...b, start, end, startText: hhmm(start), endText: hhmm(end), spanMin: end - start, status: ap.status, approval: a, concurred, overridden: true, state, superseded };
    }
    return { ...b, status: ap.status, approval: a, concurred, overridden: false, state, superseded };
  });
}

export const blocksForDay = (blocks: WorkingBlock[], day: number) => blocks.filter((b) => b.day === day);

export function blockStatusLabel(b: WorkingBlock): string {
  const state = b.state ?? workflowState(b.approval, b.departments);
  if (state === 'SUPERSEDED') return 'Changed by re-plan — send again';
  if (state === 'CONCURRED') return 'Concurred — ready to grant';
  if (state === 'PROPOSED') return 'Proposed — awaiting concurrence';
  if (state === 'DRAFT') return 'Draft (optimiser proposal)';
  return state.charAt(0) + state.slice(1).toLowerCase();
}

/* ── Approval geometry & fixed blocks (approvals survive re-plans) ── */

/** A fixed-block constraint as sent to the worker (tasks optional, see FixedBlockConstraint in types.ts). */
export type FixedBlock = FixedBlockConstraint & { tasks?: { id: string; start: number; end: number }[] };

/**
 * Geometry of a block as the workflow saw it (after any Control override):
 * the window is shifted to the override and every work window is shifted by
 * the same amount and clipped to the new window.
 */
export function captureGeometry(block: Block, override?: { start: number; end: number } | null, at?: string): BlockGeometry {
  const start = override ? override.start : block.start;
  const end = override ? override.end : block.end;
  const shift = override ? override.start - block.start : 0;
  const tasks = block.tasks.map((t) => {
    const s = Math.min(end, Math.max(start, t.start + shift));
    const e = Math.max(s, Math.min(end, t.end + shift));
    return { id: t.id, start: s, end: e };
  });
  return { day: block.day, date: block.date, line: block.line, start, end, taskIds: block.tasks.map((t) => t.id), tasks, departments: [...block.departments], capturedAt: at };
}

/** Day index of an ISO date inside a plan week that starts on planStart (may be < 0 or > 6). */
export function dayIndexOf(dateIso: string, planStart: string): number {
  const a = Date.UTC(+dateIso.slice(0, 4), +dateIso.slice(5, 7) - 1, +dateIso.slice(8, 10));
  const b = Date.UTC(+planStart.slice(0, 4), +planStart.slice(5, 7) - 1, +planStart.slice(8, 10));
  return Math.round((a - b) / 86400000);
}

const FIX_PRIORITY = { STARTED: 5, LOCKED: 4, GRANTED: 3, CONCURRED: 2 } as const;

/**
 * Blocks the optimiser must keep where they are: every CONCURRED, GRANTED or
 * LOCKED approval and every possession in progress (started, not cleared),
 * at the stored geometry, with the approval's block id. A work claimed by two
 * blocks stays in the one further along (started > locked > granted > concurred).
 */
export function fixedBlocksFromApprovals(approvals: Record<string, Approval>, executionLog: ExecRecord[], opts: { planStart?: string | null; corridorId?: string; days?: number } = {}): FixedBlock[] {
  const days = opts.days ?? 7;
  const started = new Map<string, ExecRecord>();
  for (const r of executionLog) if (r.status === 'IN_PROGRESS' && (!opts.corridorId || r.corridorId === opts.corridorId)) started.set(r.blockId, r);
  const cands: { prio: number; fb: FixedBlock }[] = [];
  const dayOf = (g: { day: number; date?: string }) => (g.date && opts.planStart ? dayIndexOf(g.date, opts.planStart) : g.day);
  for (const [id, a] of Object.entries(approvals)) {
    const state = workflowState(a);
    const isStarted = started.has(id);
    const prio = isStarted ? FIX_PRIORITY.STARTED : state === 'LOCKED' ? FIX_PRIORITY.LOCKED : state === 'GRANTED' ? FIX_PRIORITY.GRANTED : state === 'CONCURRED' ? FIX_PRIORITY.CONCURRED : 0;
    if (!prio || !a.geometry) continue;
    const g = a.geometry;
    cands.push({ prio, fb: { id, day: dayOf(g), line: g.line, start: g.start, end: g.end, taskIds: [...g.taskIds], tasks: g.tasks.map((t) => ({ ...t })) } });
  }
  // a possession in progress without a stored geometry still holds its window
  for (const [id, r] of started) {
    if (cands.some((c) => c.fb.id === id)) continue;
    const taskIds = r.items.map((i) => i.taskId);
    if (!taskIds.length) continue;
    const day = opts.planStart ? dayIndexOf(r.date, opts.planStart) : 0;
    cands.push({ prio: FIX_PRIORITY.STARTED, fb: { id, day, line: r.line, start: r.plannedStart, end: r.plannedEnd, taskIds } });
  }
  cands.sort((x, y) => y.prio - x.prio || (x.fb.id ?? '').localeCompare(y.fb.id ?? ''));
  const claimed = new Set<string>();
  const out: FixedBlock[] = [];
  for (const { fb } of cands) {
    if (fb.day < 0 || fb.day >= days || fb.end <= fb.start) continue;
    const taskIds = fb.taskIds.filter((t) => !claimed.has(t));
    if (!taskIds.length) continue;
    for (const t of taskIds) claimed.add(t);
    const keep = new Set(taskIds);
    out.push({ ...fb, taskIds, ...(fb.tasks ? { tasks: fb.tasks.filter((t) => keep.has(t.id)) } : {}) });
  }
  return out;
}

/** Merge approval-derived fixed blocks with a candidate patch; the patch wins for the same id. */
export function mergeFixedBlocks(base: FixedBlock[], patch?: FixedBlockConstraint[] | null): FixedBlock[] {
  if (!patch || !patch.length) return base;
  const ids = new Set(patch.map((p) => p.id).filter(Boolean));
  const patchTasks = new Set(patch.flatMap((p) => p.taskIds));
  // a work re-placed by the patch is released from the base block that held it
  const kept = base
    .filter((b) => !b.id || !ids.has(b.id))
    .map((b) => ({ ...b, taskIds: b.taskIds.filter((t) => !patchTasks.has(t)), ...(b.tasks ? { tasks: b.tasks.filter((t) => !patchTasks.has(t.id)) } : {}) }))
    .filter((b) => b.taskIds.length > 0);
  return [...kept, ...(patch as FixedBlock[])];
}

export interface ReconcileResult {
  approvals: Record<string, Approval>;
  /** sent proposals whose block no longer exists after the re-plan (kept, marked supersededAt) */
  superseded: string[];
  /** approvals moved to the new id of a block with the same works */
  rekeyed: { from: string; to: string }[];
  /** granted / locked / started blocks that the new plan no longer contains and could not be matched */
  orphaned: string[];
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

/**
 * After a re-plan: approvals whose block id is gone are either re-attached to
 * the block holding exactly the same works (fixed / concurred / granted /
 * locked / started), or — for sent proposals — marked superseded.
 */
export function reconcileApprovals(approvals: Record<string, Approval>, blocks: Block[], at: string, startedIds: Set<string> = new Set()): ReconcileResult {
  const ids = new Set(blocks.map((b) => b.id));
  const next: Record<string, Approval> = { ...approvals };
  const superseded: string[] = [];
  const rekeyed: { from: string; to: string }[] = [];
  const orphaned: string[] = [];
  const taken = new Set(Object.keys(approvals).filter((id) => ids.has(id)));
  for (const [id, a] of Object.entries(approvals)) {
    if (ids.has(id)) continue;
    const state = workflowState(a);
    const held = state === 'GRANTED' || state === 'LOCKED' || state === 'CONCURRED' || startedIds.has(id);
    if (held && a.geometry) {
      const match = blocks.find((b) => !taken.has(b.id) && b.day === a.geometry!.day && b.line === a.geometry!.line && sameSet(b.tasks.map((t) => t.id), a.geometry!.taskIds));
      if (match) {
        const { override, ...rest } = a;
        // keep Control's override only if the new block does not already sit at that window
        const keepOverride = override && (override.start !== match.start || override.end !== match.end) ? { override } : {};
        next[match.id] = { ...rest, ...keepOverride, rekeyedFrom: id };
        delete next[id];
        taken.add(match.id);
        rekeyed.push({ from: id, to: match.id });
        continue;
      }
    }
    if (state === 'PROPOSED' || state === 'CONCURRED') {
      next[id] = { ...a, supersededAt: at };
      superseded.push(id);
    } else if ((state === 'GRANTED' || state === 'LOCKED' || startedIds.has(id)) && !a.supersededAt) {
      next[id] = { ...a, supersededAt: at };
      orphaned.push(id);
    }
  }
  return { approvals: next, superseded, rekeyed, orphaned };
}

export interface SupersededProposal {
  blockId: string;
  approval: Approval;
  geometry: BlockGeometry | null;
  /** GRANTED / LOCKED (or started) block the new plan no longer contains */
  held: boolean;
}

/** Sent proposals (and held blocks) changed by a re-plan — for the "send again" list on the planning pages. */
export function supersededProposals(approvals: Record<string, Approval>): SupersededProposal[] {
  return Object.entries(approvals)
    .filter(([, a]) => !!a.supersededAt)
    .map(([blockId, a]) => ({ blockId, approval: a, geometry: a.geometry ?? null, held: a.status === 'GRANTED' || a.status === 'LOCKED' }))
    .sort((x, y) => (y.approval.supersededAt ?? '').localeCompare(x.approval.supersededAt ?? ''));
}

/* ── Occupancy helpers ──────────────────────────────────────── */

type DayOccLike = DayOccupancy & { key: (s: number, l: string) => string };

export function dayOcc(snapshot: Snapshot, day: number): DayOccLike | null {
  const d = snapshot.result.weekly.occupancy[day];
  if (!d) return null;
  return { ...d, key: (s: number, l: string) => `${s}:${l}` };
}

export interface WindowEvaluation {
  trains: AffectedTrain[];
  weightedDelayMin: number;
  rawDelayMin: number;
  premiumConflicts: number;
  feasible: boolean;
  ruleViolations: string[];
}

/** Re-evaluate a block window (e.g. after a ±15 min shift) with the delay model and the JPO rules. */
export function evaluateBlockWindow(snapshot: Snapshot, block: Block, start: number, end: number, others: WorkingBlock[], rules?: Rules): WindowEvaluation {
  const r = rules ?? snapshot.result.rules;
  const occ = dayOcc(snapshot, block.day);
  const base: WindowEvaluation = { trains: [], weightedDelayMin: 0, rawDelayMin: 0, premiumConflicts: 0, feasible: true, ruleViolations: [] };
  if (!occ) return base;
  const ev = block.lineClosure ? (evaluateWindow(occ, block.sections, block.line, start, end, r) as Omit<WindowEvaluation, 'ruleViolations'>) : base;
  const violations: string[] = [];
  if (end - start > r.maxBlockMin) violations.push(`Block of ${end - start} min exceeds the JPO ceiling of ${r.maxBlockMin} min`);
  if (end - start < r.minBlockMin) violations.push(`Block shorter than the ${r.minBlockMin} min minimum`);
  if (start < 0 || end > 1440) violations.push('Window must end inside the planning day');
  const sameDay = others.filter((o) => o.id !== block.id && o.day === block.day && o.lineClosure && o.status !== 'REFUSED');
  const concurrent = sameDay.filter((o) => Math.max(o.start, start) < Math.min(o.end, end)).length + 1;
  if (concurrent > r.maxConcurrentBlocks) violations.push(`${concurrent} simultaneous possessions exceed the limit of ${r.maxConcurrentBlocks}`);
  if (sameDay.length + 1 > r.maxBlocksPerDay) violations.push(`More than ${r.maxBlocksPerDay} possessions on this day`);
  if (ev.premiumConflicts > 0) violations.push(`${ev.premiumConflicts} premium path(s) would be blocked`);
  return { ...ev, ruleViolations: violations, feasible: ev.feasible && violations.length === 0 };
}

/* ── Caution orders, notices, advisories ────────────────────── */

export interface CautionOrder {
  id: string;
  orderNo: string;
  formType: 'T/409' | 'T/409B';
  formTitle: string;
  taskId: string | null;
  /** T/409B: the machine works in the block the restriction follows */
  taskIds?: string[];
  workType: string;
  reason: string;
  section: string;
  sections: number[];
  line: Line;
  startKm: number;
  endKm: number;
  speedKmph: number;
  normalSpeedKmph: number;
  daysInForce: number;
  validFrom: string;
  validTo: string;
  liftingBlockId: string | null;
  liftingDay: number | null;
  isLiftingToday: boolean;
  issuedBy: string;
  division: string;
  affectedTrains: { trainNo: string; name: string; cls: string; estDelayMin: number }[];
  /** manual TSR (from Control / field) rather than a register task */
  manual?: ManualTsr;
  status: FormRecord['status'] | 'DRAFT';
  /** loco pilot acknowledgements recorded on the form (status stays ISSUED) */
  ackCount?: number;
}

export interface DisconnectionNotice {
  id: string;
  noticeNo: string;
  formType: 'T/351';
  formTitle: string;
  blockId: string;
  taskId: string;
  gear: string;
  section: string;
  startKm: number;
  endKm: number;
  disconnectionTime: string;
  reconnectionTime: string;
  safetyAssurance: string;
  inCharge: string;
  stationMasterAcknowledge: string;
  status: FormRecord['status'] | 'DRAFT';
}

export function cautionOrders(snapshot: Snapshot, blocks: WorkingBlock[], tsrs: ManualTsr[], forms: Record<string, FormRecord>, day = 0): CautionOrder[] {
  const engineOrders = generateCautionOrders(snapshot.tasks, blocks, snapshot.corridor, day, snapshot.planStart) as Omit<CautionOrder, 'status'>[];
  const out: CautionOrder[] = engineOrders.map((o) => ({ ...o, status: forms[o.orderNo]?.status ?? 'DRAFT', ackCount: forms[o.orderNo]?.acknowledgements?.length ?? 0 }));
  for (const t of tsrs) {
    if (t.corridorId !== snapshot.corridor.id || t.status === 'WITHDRAWN') continue;
    const secs = snapshot.corridor.blockSections.filter((s) => Math.max(s.startKm, t.fromKm) < Math.min(s.endKm, t.toKm) || (t.fromKm === t.toKm && t.fromKm >= s.startKm && t.fromKm <= s.endKm)).map((s) => s.index);
    // numbered from the TSR id, so the number (and its issue status) never changes
    const orderNo = manualOrderNo(snapshot.corridor, t.id) as string;
    const daysInForce = Math.max(1, Math.round((Date.now() - new Date(t.since).getTime()) / 86400000));
    out.push({
      id: `CO-${t.id}`,
      orderNo,
      formType: 'T/409',
      formTitle: t.status === 'PROPOSED' ? 'Proposed Caution Order (Form T/409) — awaiting Control' : 'Divisional Caution Order (Form T/409)',
      taskId: t.taskId ?? null,
      workType: 'MANUAL_TSR',
      reason: t.reason,
      section: secs.map((i) => snapshot.corridor.blockSections[i].label).join(' / ') || snapshot.corridor.code,
      sections: secs,
      line: t.line,
      startKm: t.fromKm,
      endKm: t.toKm,
      speedKmph: t.kmph,
      normalSpeedKmph: snapshot.corridor.mpsKmph,
      daysInForce,
      validFrom: hhmm(new Date(t.since).getHours() * 60 + new Date(t.since).getMinutes()),
      validTo: t.until ?? 'Until Cancelled',
      liftingBlockId: t.blockId ?? null,
      liftingDay: null,
      isLiftingToday: false,
      issuedBy: t.by,
      division: snapshot.corridor.division,
      affectedTrains: [],
      manual: t,
      status: forms[orderNo]?.status ?? (t.status === 'IN_FORCE' ? 'ISSUED' : 'DRAFT'),
      ackCount: forms[orderNo]?.acknowledgements?.length ?? 0,
    });
  }
  return out;
}

export function disconnectionNotices(snapshot: Snapshot, blocks: WorkingBlock[], forms: Record<string, FormRecord>, day = 0): DisconnectionNotice[] {
  const list = generateDisconnectionNotices(snapshot.tasks, blocks, snapshot.corridor, day, snapshot.planStart) as Omit<DisconnectionNotice, 'status'>[];
  return list.map((n) => ({ ...n, status: forms[n.noticeNo]?.status ?? 'DRAFT' }));
}

/** All T/351 notices for the whole week (one per S&T work nested in a block). */
export function disconnectionNoticesWeek(snapshot: Snapshot, blocks: WorkingBlock[], forms: Record<string, FormRecord>): DisconnectionNotice[] {
  const out: DisconnectionNotice[] = [];
  for (let d = 0; d < 7; d++) out.push(...disconnectionNotices(snapshot, blocks, forms, d));
  return out;
}

export interface Advisory {
  id: string;
  bulletinNo: string;
  blockId: string;
  day: number;
  dateLabel: string;
  window: string;
  sectionText: string;
  line: Line;
  workKind: string;
  departments: string;
  affectedTrainsCount: number;
  trainNotices: { trainNo: string; name: string; cls: string; expectedDelayMin: number; impactType: string }[];
  isNoticeCompliant: boolean;
  publicMessage: string;
  status: ApprovalStatus;
}

/** Public advisories derive from GRANTED / LOCKED blocks only (drafts are not public). */
export function advisories(snapshot: Snapshot, blocks: WorkingBlock[], includeProposed = false): Advisory[] {
  const eligible = blocks.filter((b) => b.status === 'GRANTED' || b.status === 'LOCKED' || (includeProposed && b.status === 'PROPOSED'));
  const list = generateBlockAdvisories({ ai: { blocks: eligible } }, snapshot.corridor) as Omit<Advisory, 'status'>[];
  return list.map((a) => ({ ...a, status: eligible.find((b) => b.id === a.blockId)?.status ?? 'PROPOSED' }));
}

/* ── Train / task lookups ───────────────────────────────────── */

export function findTrain(snapshot: Snapshot, query: string): Train | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  const all = [...snapshot.feeds.timetable, ...snapshot.feeds.freight];
  return all.find((t) => t.number.toLowerCase() === q) ?? all.find((t) => t.number.toLowerCase().includes(q) || t.name.toLowerCase().includes(q));
}

/** Blocks a train meets during the week, with how the delay model handles it. */
export function blocksMetByTrain(_snapshot: Snapshot, blocks: WorkingBlock[], train: Train): { block: WorkingBlock; impact: AffectedTrain | null }[] {
  const out: { block: WorkingBlock; impact: AffectedTrain | null }[] = [];
  const sections = new Set(train.passages.map((p) => p.sectionIndex));
  for (const b of blocks) {
    if (b.status === 'REFUSED') continue;
    if (b.line !== 'BOTH' && b.line !== train.line) continue;
    if (!b.sections.some((s) => sections.has(s))) continue;
    if (train.source === 'COA' && train.runsOn && !train.runsOn[(new Date(`${b.date}T00:00:00`).getDay() + 7) % 7]) continue;
    if (train.source === 'FOIS' && train.day !== b.day) continue;
    const impact = b.affectedTrains.find((t) => t.trainId === train.id) ?? null;
    const overlap = train.passages.some((p) => sections.has(p.sectionIndex) && b.sections.includes(p.sectionIndex) && Math.max(p.enter, b.start) < Math.min(p.exit, b.end));
    if (impact || overlap) out.push({ block: b, impact });
  }
  return out;
}

export interface Placement {
  block: WorkingBlock | null;
  scheduled: { day: number; start: number; end: number } | null;
  deferredReason: string | null;
}

export function placement(snapshot: Snapshot, blocks: WorkingBlock[], taskId: string): Placement {
  const sched = snapshot.result.weekly.ai.scheduled.find((s) => s.taskId === taskId) ?? null;
  const block = blocks.find((b) => b.tasks.some((t) => t.id === taskId)) ?? null;
  const deferred = snapshot.result.weekly.ai.deferred.find((d) => d.taskId === taskId) ?? null;
  return { block, scheduled: sched ? { day: sched.day, start: sched.start, end: sched.end } : null, deferredReason: deferred?.reason ?? null };
}

export interface JointSuggestion {
  task: Task;
  block: WorkingBlock;
  reason: string;
}

/** Works of a department that could ride in another department's block (same section & line, block long enough). */
export function jointSuggestions(snapshot: Snapshot, blocks: WorkingBlock[], dept: Dept): JointSuggestion[] {
  const scheduledIds = new Set(snapshot.result.weekly.ai.scheduled.map((s) => s.taskId));
  const out: JointSuggestion[] = [];
  const candidates = snapshot.tasks.filter((t) => t.dept === dept && !t.capital && (!scheduledIds.has(t.id) || blocks.some((b) => b.tasks.some((x) => x.id === t.id) && b.departments.length === 1)));
  for (const t of candidates) {
    for (const b of blocks) {
      if (b.status === 'REFUSED' || b.departments.includes(dept) || !b.lineClosure) continue;
      const lineOk = t.line === 'BOTH' || b.line === 'BOTH' || t.line === b.line;
      if (!lineOk) continue;
      if (!t.sections.some((s) => b.sections.includes(s))) continue;
      if (b.spanMin < t.totalMin && t.closure === 'LINE') continue;
      out.push({ task: t, block: b, reason: `Same block section (${b.sectionText}) and line; ${b.spanMin} min window fits ${t.totalMin} min of work` });
      break;
    }
  }
  return out;
}

/* ── Plan diff (candidate vs working) ───────────────────────── */

export interface PlanDiffRow {
  key: string;
  kind: 'kept' | 'shifted' | 'dropped' | 'added';
  before: Block | null;
  after: Block | null;
  trainsDelta: number;
  delayDelta: number;
}

const blockKey = (b: Block) =>
  b.tasks
    .map((t) => t.id)
    .sort()
    .join('|');

export function planDiff(candidate: Snapshot, working: Snapshot): PlanDiffRow[] {
  const before = new Map(working.result.weekly.ai.blocks.map((b) => [blockKey(b), b]));
  const after = new Map(candidate.result.weekly.ai.blocks.map((b) => [blockKey(b), b]));
  const rows: PlanDiffRow[] = [];
  for (const [k, b] of before) {
    const a = after.get(k);
    if (!a) rows.push({ key: k, kind: 'dropped', before: b, after: null, trainsDelta: -b.affectedTrains.length, delayDelta: -b.weightedDelayMin });
    else if (a.day !== b.day || a.start !== b.start || a.end !== b.end || a.line !== b.line) rows.push({ key: k, kind: 'shifted', before: b, after: a, trainsDelta: a.affectedTrains.length - b.affectedTrains.length, delayDelta: a.weightedDelayMin - b.weightedDelayMin });
    else rows.push({ key: k, kind: 'kept', before: b, after: a, trainsDelta: 0, delayDelta: 0 });
  }
  for (const [k, a] of after) if (!before.has(k)) rows.push({ key: k, kind: 'added', before: null, after: a, trainsDelta: a.affectedTrains.length, delayDelta: a.weightedDelayMin });
  const order = { added: 0, shifted: 1, dropped: 2, kept: 3 };
  return rows.sort((x, y) => order[x.kind] - order[y.kind] || (x.after ?? x.before)!.day - (y.after ?? y.before)!.day);
}

/* ── Execution adherence ────────────────────────────────────── */

export interface Adherence {
  totalExecuted: number;
  completedBlocks: number;
  inProgressBlocks: number;
  adherenceRate: number;
  totalPlannedMin: number;
  totalActualMin: number;
  totalOverrunMin: number;
  overrunCauses: { cause: string; minutes: number }[];
  clearedWithTsr: number;
  onTimeStartRate: number;
}

/** mpsKmph: a clearance at or above line speed is not a TSR (seeded history stores full-speed clearances as MPS). */
export function adherence(log: ExecRecord[], mpsKmph = Infinity): Adherence {
  const m = computeExecutionMetrics(log.map((r) => ({ status: r.status, plannedSpanMin: r.plannedSpanMin, actualSpanMin: r.actualSpanMin, overrunCause: r.overrunCause }))) as Omit<Adherence, 'clearedWithTsr' | 'onTimeStartRate'> & { totalPlannedMin?: number; totalActualMin?: number };
  const done = log.filter((r) => r.status !== 'IN_PROGRESS');
  const onTime = log.filter((r) => r.actualStart !== undefined && r.actualStart - r.plannedStart <= 10).length;
  return {
    totalExecuted: m.totalExecuted,
    completedBlocks: m.completedBlocks,
    inProgressBlocks: m.inProgressBlocks,
    adherenceRate: m.adherenceRate,
    totalPlannedMin: m.totalPlannedMin ?? 0,
    totalActualMin: m.totalActualMin ?? 0,
    totalOverrunMin: m.totalOverrunMin,
    overrunCauses: m.overrunCauses,
    clearedWithTsr: done.filter((r) => r.speedOnLifting != null && r.speedOnLifting < mpsKmph).length,
    onTimeStartRate: log.length ? onTime / log.length : 0,
  };
}

/* ── Geography ──────────────────────────────────────────────── */

export interface Snapped {
  km: number;
  distanceM: number;
  station: string;
  stationName: string;
  sectionLabel: string;
  lat: number;
  lng: number;
}

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Snap a GPS position to the nearest chainage of the corridor polyline (sampled every 250 m). */
export function snapToCorridor(corridor: Corridor, lat: number, lng: number): Snapped {
  let best = { km: 0, d: Infinity };
  for (let km = 0; km <= corridor.lengthKm; km += 0.25) {
    const [plat, plng] = latLngAtKm(corridor, km) as [number, number];
    const d = haversineM(lat, lng, plat, plng);
    if (d < best.d) best = { km, d };
  }
  const km = Math.round(best.km * 10) / 10;
  const st = corridor.stations.reduce((a, b) => (Math.abs(b.km - km) < Math.abs(a.km - km) ? b : a), corridor.stations[0]);
  const sec = sectionAtKm(corridor, km) as { label: string };
  const [slat, slng] = latLngAtKm(corridor, km) as [number, number];
  return { km, distanceM: Math.round(best.d), station: st.code, stationName: st.name, sectionLabel: sec.label, lat: slat, lng: slng };
}

/** Minutes until the next train passes a chainage on a line (from the timetable at a given day/minute). */
export function nextTrainAt(snapshot: Snapshot, day: number, minute: number, km: number, line: 'UP' | 'DN'): { train: Train; inMin: number } | null {
  const sec = sectionAtKm(snapshot.corridor, km) as { index: number };
  const occ = dayOcc(snapshot, day);
  if (!occ) return null;
  const passages = occ.occ[`${sec.index}:${line}`] ?? [];
  const next = passages.filter((p) => p.enter >= minute).sort((a, b) => a.enter - b.enter)[0];
  if (!next) return null;
  const train = [...snapshot.feeds.timetable, ...snapshot.feeds.freight].find((t) => t.id === next.trainId);
  if (!train) return null;
  return { train, inMin: next.enter - minute };
}

export interface LivePosition {
  trainId: string;
  trainNo: string;
  name: string;
  cls: string;
  line: 'UP' | 'DN';
  premium: boolean;
  origin: string;
  destination: string;
  dep: string;
  arr: string;
  timeMin: number;
  km: number;
  lat: number;
  lng: number;
  sectionIndex: number;
  sectionLabel: string;
  currentStation: string;
  nextStation: string;
  isHalted: boolean;
  haltStation: string | null;
  speedKmph: number;
  inBlock: boolean;
  blockId: string | null;
}

/** Derived train positions at a minute of a plan day (no telemetry — interpolated from the timetable). */
export function livePositions(snapshot: Snapshot, day: number, minute: number, blocks: WorkingBlock[]): LivePosition[] {
  const date = new Date(`${snapshot.planStart}T00:00:00`);
  date.setDate(date.getDate() + day);
  const dow = date.getDay();
  const todays = blocks.filter((b) => b.day === day && b.status !== 'REFUSED');
  const trains = [...snapshot.feeds.timetable.filter((t) => t.runsOn?.[dow]), ...snapshot.feeds.freight.filter((f) => f.day === day)];
  const out: LivePosition[] = [];
  for (const t of trains) {
    const p = positionAt(t, snapshot.corridor, minute, todays) as LivePosition | null;
    if (p) out.push(p);
  }
  return out;
}

/* ── Escalations (division) ─────────────────────────────────── */

export interface DerivedEscalation {
  id: string;
  kind: 'mandatory' | 'refused' | 'stale' | 'incident' | 'escalation-risk';
  ref: string;
  dept: Dept | null;
  ageText: string;
  reason: string;
  probability?: number;
  route: string;
}

export function derivedEscalations(snapshot: Snapshot, blocks: WorkingBlock[], approvals: Record<string, Approval>, requisitions: { id: string; no: string; dept: Dept; status: string; updatedAt: string }[], reports: { id: string; at: string; status: string; dept: Dept | null; description: string }[]): DerivedEscalation[] {
  const out: DerivedEscalation[] = [];
  const scheduled = new Set(snapshot.result.weekly.ai.scheduled.map((s) => s.taskId));
  for (const t of snapshot.tasks) {
    if (t.risk.mandatory && (!scheduled.has(t.id) || t.daysOverdue > t.mandatoryWithinDays)) out.push({ id: `mand-${t.id}`, kind: 'mandatory', ref: t.id, dept: t.dept, ageText: t.daysOverdue > 0 ? `${t.daysOverdue} d overdue` : 'due', reason: `${t.label} on ${t.sectionLabel}${scheduled.has(t.id) ? ' is past its statutory floor' : ' could not be placed this week'}`, route: `/app/planning/risk?task=${t.id}` });
  }
  for (const [id, a] of Object.entries(approvals)) if ((a.refusal?.count ?? 0) >= 2) out.push({ id: `ref-${id}`, kind: 'refused', ref: id, dept: null, ageText: `${a.refusal!.count}× refused`, reason: a.refusal!.reason, route: `/app/control/blocks?block=${id}` });
  const dayMs = 86400000;
  for (const r of requisitions) if (r.status === 'SUBMITTED' && Date.now() - new Date(r.updatedAt).getTime() > 14 * dayMs) out.push({ id: `stale-${r.id}`, kind: 'stale', ref: r.no, dept: r.dept, ageText: `${Math.round((Date.now() - new Date(r.updatedAt).getTime()) / dayMs)} d`, reason: 'Requisition awaiting the planning cell for more than 14 days', route: '/app/planning/intake' });
  for (const r of reports) if ((r.status === 'UNVERIFIED' || r.status === 'TRIAGED') && Date.now() - new Date(r.at).getTime() > 2 * dayMs) out.push({ id: `inc-${r.id}`, kind: 'incident', ref: r.id, dept: r.dept, ageText: `${Math.round((Date.now() - new Date(r.at).getTime()) / dayMs)} d open`, reason: r.description.slice(0, 90), route: r.dept ? `/app/${r.dept.toLowerCase()}/reports?report=${r.id}` : `/app/control/incidents?report=${r.id}` });
  const top = snapshot.tasks
    .filter((t) => !scheduled.has(t.id) && !t.capital)
    .sort((a, b) => b.risk.escalation - a.risk.escalation)
    .slice(0, 5);
  for (const t of top) if (t.risk.escalation >= 0.6) out.push({ id: `esc-${t.id}`, kind: 'escalation-risk', ref: t.id, dept: t.dept, ageText: `${t.daysOverdue > 0 ? `${t.daysOverdue} d overdue` : `due in ${-t.daysOverdue} d`}`, reason: `${Math.round(t.risk.escalation * 100)} % probability of escalating to a stricter TSR within 30 days if unattended`, probability: t.risk.escalation, route: `/app/planning/risk?task=${t.id}` });
  void blocks;
  return out;
}

/* ── Conflicts (one list for Control, planning and the departments) ── */

export type ConflictKind =
  | 'MACHINE_OVERLAP'
  | 'CREW_OVERLAP'
  | 'INCOMPATIBLE'
  | 'CONCURRENCY'
  | 'BLOCKS_PER_DAY'
  | 'PREMIUM_PATH'
  | 'T351_PENDING'
  | 'POWER_PENDING'
  | 'OBJECTION'
  | 'SAFETY'
  | 'DEFERRED_MANDATORY'
  | 'SUPERSEDED';

export type ConflictSeverity = 'high' | 'medium' | 'low';

export interface Conflict {
  id: string;
  severity: ConflictSeverity;
  kind: ConflictKind;
  blockId?: string;
  taskId?: string;
  day?: number;
  /** numbers and names for the UI to render the EN / HI sentence (no prose here) */
  params: Record<string, string | number | boolean | null>;
}

/** Safety-rule conflicts reported by the engine (plan.safetyConflicts; absent on older snapshots). */
type SafetyConflictLike = { taskId: string; label: string; dueDay: number; placedDay: number | null; reason: string; detail?: string | null };

type ResourceOverride = { machineId?: string; crewId?: string };

/** Machines working in a block: Control's assignment when recorded, else the optimiser's allocation. */
export function effectiveMachines(b: Block, override?: ResourceOverride | null): string[] {
  return override?.machineId ? [override.machineId] : b.machines;
}

/** Gangs working in a block: Control's assignment when recorded, else the optimiser's allocation. */
export function effectiveCrews(b: Block, override?: ResourceOverride | null): string[] {
  return override?.crewId ? [override.crewId] : b.crews;
}

const INCOMPATIBLE = new Set<string>((INCOMPATIBLE_PAIRS as [string, string][]).flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
const windowsOverlap = (a: { day: number; start: number; end: number }, b: { day: number; start: number; end: number }) => a.day === b.day && Math.max(a.start, b.start) < Math.min(a.end, b.end);
const isHeld = (b: WorkingBlock) => b.state === 'GRANTED' || b.state === 'LOCKED';
const isSent = (b: WorkingBlock) => b.state === 'PROPOSED' || b.state === 'CONCURRED' || isHeld(b);
const SEVERITY_ORDER: Record<ConflictSeverity, number> = { high: 0, medium: 1, low: 2 };

export interface ResourceClash {
  kind: 'MACHINE' | 'CREW';
  resourceId: string;
  otherBlockId: string;
  day: number;
  otherStart: number;
  otherEnd: number;
}

/** Would assigning r to blockId double-book a machine or a gang already working in an overlapping block? */
export function resourceClash(blocks: WorkingBlock[], approvals: Record<string, Approval>, blockId: string, r: ResourceOverride): ResourceClash | null {
  const b = blocks.find((x) => x.id === blockId);
  if (!b) return null;
  for (const o of blocks) {
    if (o.id === blockId || o.state === 'REFUSED' || o.state === 'SUPERSEDED' || !windowsOverlap(b, o)) continue;
    const ov = approvals[o.id]?.resources;
    if (r.machineId && effectiveMachines(o, ov).includes(r.machineId)) return { kind: 'MACHINE', resourceId: r.machineId, otherBlockId: o.id, day: o.day, otherStart: o.start, otherEnd: o.end };
    if (r.crewId && effectiveCrews(o, ov).includes(r.crewId)) return { kind: 'CREW', resourceId: r.crewId, otherBlockId: o.id, day: o.day, otherStart: o.start, otherEnd: o.end };
  }
  return null;
}

/**
 * Everything that stands in the way of the week as it is now: resource
 * double-bookings, incompatible works, JPO limits, premium paths, forms and
 * isolations not in place, objections, the engine's safety conflicts and
 * deferred mandatory works, and proposals changed by a re-plan.
 */
export function conflictsFor(
  snapshot: Snapshot,
  blocks: WorkingBlock[],
  approvals: Record<string, Approval>,
  resources?: Record<string, ResourceOverride> | null,
  extra: { forms?: Record<string, FormRecord>; powerBlocks?: Record<string, { status: PowerBlockStatus }>; executionLog?: ExecRecord[]; rules?: Rules } = {}
): Conflict[] {
  const out: Conflict[] = [];
  const seen = new Set<string>();
  const push = (c: Conflict) => {
    if (seen.has(c.id)) return;
    seen.add(c.id);
    out.push(c);
  };
  const rules = extra.rules ?? snapshot.result.rules;
  const res = resources ?? Object.fromEntries(Object.entries(approvals).map(([id, a]) => [id, a.resources ?? {}]));
  const plan = snapshot.result.weekly.ai as Omit<Plan, 'safetyConflicts'> & { safetyConflicts?: SafetyConflictLike[] };
  const tasksById = new Map(snapshot.tasks.map((t) => [t.id, t]));
  const machineLabel = (id: string) => snapshot.feeds.machines.find((m) => m.id === id)?.label ?? id;
  const crewLabel = (id: string) => snapshot.feeds.crews.find((c) => c.id === id)?.label ?? id;
  const active = blocks.filter((b) => b.state !== 'REFUSED' && b.state !== 'SUPERSEDED');

  // machine / gang double-booking between overlapping blocks
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      if (!windowsOverlap(a, b)) continue;
      const sev: ConflictSeverity = isHeld(a) || isHeld(b) ? 'high' : 'medium';
      const bm = new Set(effectiveMachines(b, res[b.id]));
      for (const m of effectiveMachines(a, res[a.id])) if (bm.has(m)) push({ id: `MACHINE_OVERLAP:${a.id}:${b.id}:${m}`, severity: sev, kind: 'MACHINE_OVERLAP', blockId: a.id, day: a.day, params: { machineId: m, machine: machineLabel(m), otherBlockId: b.id, start: Math.max(a.start, b.start), end: Math.min(a.end, b.end) } });
      const bc = new Set(effectiveCrews(b, res[b.id]));
      for (const c of effectiveCrews(a, res[a.id])) if (bc.has(c)) push({ id: `CREW_OVERLAP:${a.id}:${b.id}:${c}`, severity: sev, kind: 'CREW_OVERLAP', blockId: a.id, day: a.day, params: { crewId: c, crew: crewLabel(c), otherBlockId: b.id, start: Math.max(a.start, b.start), end: Math.min(a.end, b.end) } });
    }
  }
  // resource violations the optimiser could not resolve
  for (const v of plan.resourceViolations ?? []) {
    const kind: ConflictKind = v.type === 'MACHINE' ? 'MACHINE_OVERLAP' : 'CREW_OVERLAP';
    const blk = active.find((b) => b.tasks.some((t) => t.id === v.taskId));
    push({ id: `${kind}:plan:${v.taskId}`, severity: 'medium', kind, taskId: v.taskId, blockId: blk?.id, day: blk?.day, params: { detail: v.detail, source: 'plan' } });
  }

  // incompatible works in one block
  for (const b of active) {
    for (let i = 0; i < b.tasks.length; i++) {
      for (let j = i + 1; j < b.tasks.length; j++) {
        const x = b.tasks[i];
        const y = b.tasks[j];
        if (INCOMPATIBLE.has(`${x.workType}|${y.workType}`)) push({ id: `INCOMPATIBLE:${b.id}:${x.id}:${y.id}`, severity: 'high', kind: 'INCOMPATIBLE', blockId: b.id, day: b.day, params: { taskA: x.id, taskB: y.id, workTypeA: x.workType, workTypeB: y.workType } });
      }
    }
  }

  // JPO limits per day (after Control's window changes)
  const closures = active.filter((b) => b.lineClosure);
  for (let d = 0; d < 7; d++) {
    const list = closures.filter((b) => b.day === d);
    if (list.length > rules.maxBlocksPerDay) push({ id: `BLOCKS_PER_DAY:${d}`, severity: 'medium', kind: 'BLOCKS_PER_DAY', day: d, params: { count: list.length, limit: rules.maxBlocksPerDay } });
    let worst = 0;
    let at: WorkingBlock | null = null;
    for (const b of list) {
      const n = list.filter((o) => Math.max(o.start, b.start) < Math.min(o.end, b.end)).length;
      if (n > worst) {
        worst = n;
        at = b;
      }
    }
    if (at && worst > rules.maxConcurrentBlocks) push({ id: `CONCURRENCY:${d}`, severity: 'high', kind: 'CONCURRENCY', day: d, blockId: at.id, params: { count: worst, limit: rules.maxConcurrentBlocks, start: at.start } });
  }

  // premium paths (re-evaluated for windows Control changed)
  for (const b of active) {
    if (!b.lineClosure) continue;
    let premium = b.premiumConflicts;
    if (b.overridden) {
      const occ = dayOcc(snapshot, b.day);
      if (occ) premium = (evaluateWindow(occ, b.sections, b.line, b.start, b.end, rules) as { premiumConflicts: number }).premiumConflicts;
    }
    if (premium > 0) push({ id: `PREMIUM_PATH:${b.id}`, severity: 'high', kind: 'PREMIUM_PATH', blockId: b.id, day: b.day, params: { count: premium, start: b.start, end: b.end } });
  }

  // T/351 and power isolation records
  const forms = extra.forms ?? {};
  const power = extra.powerBlocks ?? {};
  const log = extra.executionLog ?? [];
  for (const b of active) {
    if (!isSent(b)) continue;
    const st = b.tasks.filter((t) => t.dept === 'SMMS');
    if (st.length) {
      const pending = st.filter((t) => {
        const s = forms[disconnectionNoticeNo(snapshot.corridor, b.id, t.id) as string]?.status;
        return s !== 'RECEIVED' && s !== 'RECONNECTED';
      });
      if (pending.length) push({ id: `T351_PENDING:${b.id}`, severity: b.state === 'PROPOSED' ? 'low' : 'medium', kind: 'T351_PENDING', blockId: b.id, day: b.day, params: { pending: pending.length, total: st.length } });
    }
    if (isHeld(b) && b.kind.includes('POWER')) {
      const rec = log.find((r) => r.blockId === b.id);
      const ps = power[b.id]?.status;
      if (rec?.status === 'IN_PROGRESS' && ps !== 'DEENERGISED') push({ id: `POWER_PENDING:${b.id}`, severity: 'high', kind: 'POWER_PENDING', blockId: b.id, day: b.day, params: { phase: 'isolateStarted', isolation: b.powerIsolation } });
      else if (!rec && ps !== 'DEENERGISED') push({ id: `POWER_PENDING:${b.id}`, severity: 'low', kind: 'POWER_PENDING', blockId: b.id, day: b.day, params: { phase: 'isolate', isolation: b.powerIsolation } });
      else if (rec && rec.status !== 'IN_PROGRESS' && ps === 'DEENERGISED') push({ id: `POWER_PENDING:${b.id}`, severity: 'medium', kind: 'POWER_PENDING', blockId: b.id, day: b.day, params: { phase: 'reenergise', isolation: b.powerIsolation } });
    }
  }

  // objections on sent blocks
  for (const b of active) {
    const obj = b.approval?.objections ?? [];
    if (!obj.length || !(b.state === 'PROPOSED' || b.state === 'CONCURRED')) continue;
    const last = obj[obj.length - 1];
    push({ id: `OBJECTION:${b.id}`, severity: 'medium', kind: 'OBJECTION', blockId: b.id, day: b.day, params: { count: obj.length, depts: [...new Set(obj.map((o) => o.dept))].join(','), dept: last.dept, reason: last.reason, by: last.by } });
  }

  // engine: safety rules and deferred mandatory works
  for (const s of plan.safetyConflicts ?? []) push({ id: `SAFETY:${s.taskId}`, severity: 'high', kind: 'SAFETY', taskId: s.taskId, day: s.placedDay ?? undefined, params: { label: s.label, dueDay: s.dueDay, placedDay: s.placedDay, reason: s.reason, detail: s.detail ?? null } });
  const safetyTasks = new Set((plan.safetyConflicts ?? []).map((s) => s.taskId));
  for (const d of plan.deferred ?? []) {
    const t = tasksById.get(d.taskId);
    // the engine's safety list already names deferred mandatory works — one entry per work
    if (t?.risk.mandatory && !safetyTasks.has(d.taskId)) push({ id: `DEFERRED_MANDATORY:${d.taskId}`, severity: 'high', kind: 'DEFERRED_MANDATORY', taskId: d.taskId, params: { label: t.label, reason: d.reason, arci: Math.round(d.arci * 100) / 100, section: t.sectionLabel } });
  }

  // the optimiser's own hard-rule reasons, when not already covered above
  for (const r of plan.cost?.hardReasons ?? []) {
    let m: RegExpMatchArray | null;
    if ((m = r.match(/^incompatible works (\S+) \+ (\S+)/)) && !out.some((c) => c.kind === 'INCOMPATIBLE' && c.params.workTypeA === m![1] && c.params.workTypeB === m![2])) push({ id: `INCOMPATIBLE:plan:${m[1]}:${m[2]}`, severity: 'high', kind: 'INCOMPATIBLE', params: { workTypeA: m[1], workTypeB: m[2], source: 'plan' } });
    else if ((m = r.match(/more than (\d+) possessions on day (\d+)/))) push({ id: `BLOCKS_PER_DAY:${+m[2] - 1}`, severity: 'medium', kind: 'BLOCKS_PER_DAY', day: +m[2] - 1, params: { limit: +m[1], source: 'plan' } });
    else if ((m = r.match(/(\d+) simultaneous possessions on day (\d+)/))) push({ id: `CONCURRENCY:${+m[2] - 1}`, severity: 'high', kind: 'CONCURRENCY', day: +m[2] - 1, params: { count: +m[1], limit: rules.maxConcurrentBlocks, source: 'plan' } });
    else if ((m = r.match(/^mandatory task (\S+) deferred/)) && !safetyTasks.has(m[1])) {
      const t = tasksById.get(m[1]);
      push({ id: `DEFERRED_MANDATORY:${m[1]}`, severity: 'high', kind: 'DEFERRED_MANDATORY', taskId: m[1], params: { label: t?.label ?? m[1], reason: 'deferred by the optimiser', section: t?.sectionLabel ?? '' } });
    }
  }

  // sent proposals / held blocks changed by a re-plan
  for (const s of supersededProposals(approvals)) {
    push({ id: `SUPERSEDED:${s.blockId}`, severity: s.held ? 'high' : 'medium', kind: 'SUPERSEDED', blockId: s.blockId, day: s.geometry?.day, params: { status: s.approval.status, supersededAt: s.approval.supersededAt ?? null, start: s.geometry?.start ?? null, end: s.geometry?.end ?? null, works: s.geometry?.taskIds.length ?? 0 } });
  }

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.day ?? 99) - (b.day ?? 99) || a.id.localeCompare(b.id));
}

/* ── Execution deviations ───────────────────────────────────── */

export interface RunningLate {
  block: WorkingBlock;
  record: ExecRecord;
  /** minutes past the planned (or extended) end */
  overMin: number;
}

/** Possessions started, not cleared, and past their planned end at (day, minute) — the bell raises these for Control. */
export function blocksRunningPastEnd(blocks: WorkingBlock[], executionLog: ExecRecord[], minute: number, day = 0): RunningLate[] {
  const out: RunningLate[] = [];
  for (const r of executionLog) {
    if (r.status !== 'IN_PROGRESS') continue;
    const b = blocks.find((x) => x.id === r.blockId);
    if (!b) continue;
    const overMin = (day - b.day) * 1440 + minute - b.end;
    if (overMin > 0) out.push({ block: b, record: r, overMin });
  }
  return out.sort((a, b) => b.overMin - a.overMin);
}

/** Loco pilot acknowledgements of one caution order (oldest first; the store keeps newest first). */
export function acksForOrder<T extends { orderNo: string; at: string }>(acks: T[], orderNo: string): T[] {
  return acks
    .filter((a) => a.orderNo === orderNo)
    .reverse()
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** Site messages of one block and Control's replies, as a thread (oldest first; the store keeps newest first). */
export function messagesForBlock<T extends { blockId: string; at: string }>(messages: T[], blockId: string): T[] {
  return messages
    .filter((m) => m.blockId === blockId)
    .reverse()
    .sort((a, b) => a.at.localeCompare(b.at));
}

/* ── Intake → engine injects ────────────────────────────────── */

/** Injected works for one corridor: intake tasks of that corridor + converted reports that have no intake task. */
export function corridorInjects(intakeTasks: IntakeTask[], reports: HazardReport[], corridorId: string): InjectSpec[] {
  const out: InjectSpec[] = [];
  const seen = new Set<string>();
  const add = (s: InjectSpec) => {
    const key = s.sourceId ?? JSON.stringify([s.workType, s.line, s.startKm, s.endKm]);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };
  for (const t of intakeTasks) {
    const cid = t.corridorId ?? (t.spec as { corridorId?: string }).corridorId;
    if (cid === corridorId) add(t.spec);
  }
  const intakeIds = new Set(intakeTasks.map((t) => t.id));
  for (const r of reports) {
    if (r.status !== 'TASK' || !r.taskSpec || r.corridorId !== corridorId) continue;
    if (r.intakeTaskId && intakeIds.has(r.intakeTaskId)) continue; // already injected through its intake task
    add({ ...r.taskSpec, sourceId: r.taskSpec.sourceId ?? `REPORT/${r.id}`, corridorId } as InjectSpec);
  }
  return out;
}

/** Plan-week day index of a preferred date, or undefined when it falls outside the week. */
export function preferredDayOf(dateIso: string | null | undefined, planStart: string | null | undefined, days = 7): number | undefined {
  if (!dateIso || !planStart || !/^\d{4}-\d{2}-\d{2}/.test(dateIso)) return undefined;
  const d = dayIndexOf(dateIso.slice(0, 10), planStart);
  return d >= 0 && d < days ? d : undefined;
}

const BLOCK_KIND_OF: Record<Requisition['blockType'], 'TRAFFIC' | 'POWER' | 'TRAFFIC + POWER' | 'DISCONNECTION'> = { TRAFFIC: 'TRAFFIC', POWER: 'POWER', DISCONNECTION: 'DISCONNECTION', INTEGRATED: 'TRAFFIC + POWER' };

/** Source id of the injected work of a requisition (what dependsOn / coRequireWith refer to). */
export const requisitionSourceId = (reqId: string) => `REQ/${reqId}`;

/** Everything a requisition asks for, as the InjectSpec the optimiser honours. */
export function requisitionInjectSpec(req: Requisition, ctx: { planStart?: string | null; corridorId?: string; knownTaskIds?: Set<string> | null } = {}) {
  const preferredDay = preferredDayOf(req.preferredDate, ctx.planStart);
  const requires: ('POWER_BLOCK' | 'DISCONNECTION')[] = [];
  if (req.needsPowerBlock) requires.push('POWER_BLOCK');
  if (req.needsDisconnection) requires.push('DISCONNECTION');
  const replaces = req.sourceTaskId && (!ctx.knownTaskIds || ctx.knownTaskIds.has(req.sourceTaskId)) ? req.sourceTaskId : undefined;
  const spec: InjectSpec & {
    corridorId?: string;
    durationMin?: number;
    preferredDay?: number;
    preferredWindow?: 'night' | 'day' | 'any';
    machine?: string | null;
    blockKind?: 'TRAFFIC' | 'POWER' | 'TRAFFIC + POWER' | 'DISCONNECTION';
    requires?: ('POWER_BLOCK' | 'DISCONNECTION')[];
    dependsOn?: string[];
    coRequireWith?: string[];
    replacesTaskId?: string;
  } = {
    sourceId: requisitionSourceId(req.id),
    label: `${req.workType.replace(/_/g, ' ').toLowerCase()} (requisition ${req.no})`,
    workType: req.workType,
    line: req.line,
    startKm: req.startKm,
    endKm: req.endKm,
    daysOverdue: req.daysOverdue ?? 0,
    tsrKmph: req.tsrKmph ?? undefined,
    note: req.remarks,
    corridorId: ctx.corridorId ?? req.corridorId,
    durationMin: req.durationMin > 0 ? req.durationMin : undefined,
    preferredWindow: req.preferredWindow,
    machine: req.machine ?? null,
    blockKind: BLOCK_KIND_OF[req.blockType],
  };
  if (preferredDay !== undefined) spec.preferredDay = preferredDay;
  if (requires.length) spec.requires = requires;
  if (req.dependsOnReqIds?.length) spec.dependsOn = req.dependsOnReqIds.map(requisitionSourceId);
  if (req.coRequireReqIds?.length) spec.coRequireWith = req.coRequireReqIds.map(requisitionSourceId);
  if (replaces) spec.replacesTaskId = replaces;
  return spec;
}

/** Work-only planned minutes of a task for execution records: what the plan allotted and the uncalibrated standard. */
export function workOnlyMinutes(task: Pick<Task, 'durationMin' | 'baseDurationMin'> | null | undefined, fallback: number): { plannedMin: number; baseMin: number } {
  if (!task) return { plannedMin: fallback, baseMin: fallback };
  return { plannedMin: Math.round(task.durationMin), baseMin: Math.round(task.baseDurationMin ?? task.durationMin) };
}

/* ── Incident severity facts (for lib/triage computeSeverity) ── */

export interface SeverityFactsAt {
  minutesToNextTrain: number | null;
  premiumNext: boolean;
  onMainLine: boolean;
  tsrInForce: boolean;
  nextTrainNo: string | null;
}

/** Timetable and TSR facts at a chainage, from the plan snapshot and the manual TSR register. */
export function severityFactsAt(snapshot: Snapshot | null, tsrs: ManualTsr[], at: { km?: number | null; line?: Line | null; day?: number; minute: number }): SeverityFactsAt {
  const none: SeverityFactsAt = { minutesToNextTrain: null, premiumNext: false, onMainLine: false, tsrInForce: false, nextTrainNo: null };
  if (!snapshot || at.km === undefined || at.km === null || !Number.isFinite(at.km)) return none;
  const km = at.km;
  const onCorridor = km >= 0 && km <= snapshot.corridor.lengthKm;
  const lines: ('UP' | 'DN')[] = at.line === 'UP' || at.line === 'DN' ? [at.line] : ['UP', 'DN'];
  let next: { train: Train; inMin: number } | null = null;
  if (onCorridor) {
    for (const l of lines) {
      const n = nextTrainAt(snapshot, at.day ?? 0, at.minute, km, l);
      if (n && (!next || n.inMin < next.inMin)) next = n;
    }
  }
  const lineMatch = (l: Line) => !at.line || at.line === 'BOTH' || l === 'BOTH' || l === at.line;
  const manual = tsrs.some((t) => t.corridorId === snapshot.corridor.id && t.status === 'IN_FORCE' && km >= Math.min(t.fromKm, t.toKm) && km <= Math.max(t.fromKm, t.toKm) && lineMatch(t.line));
  const register = snapshot.tasks.some((t) => !!t.tsrKmph && km >= t.startKm && km <= t.endKm && lineMatch(t.line));
  return { minutesToNextTrain: next ? next.inMin : null, premiumNext: !!next?.train.premium, onMainLine: onCorridor && (at.line === 'UP' || at.line === 'DN' || at.line === 'BOTH'), tsrInForce: manual || register, nextTrainNo: next?.train.number ?? null };
}
