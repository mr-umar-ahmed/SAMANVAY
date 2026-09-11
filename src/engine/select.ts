/**
 * Main-thread derivations over the worker snapshot and the workflow state.
 * Pure functions, safe to call from useMemo. Nothing here invents a number:
 * every value is computed from the plan, the timetable or recorded actions.
 */
import { generateCautionOrders, generateDisconnectionNotices } from './cautionOrder.js';
import { generateBlockAdvisories } from './advisories.js';
import { evaluateWindow } from './delayModel.js';
import { computeExecutionMetrics } from './execution.js';
import { latLngAtKm, sectionAtKm } from './corridors.js';
import { positionAt } from './livePosition.js';
import type { AffectedTrain, Block, Corridor, DayOccupancy, Dept, Line, Rules, Snapshot, Task, Train } from './types';
import type { Approval, ApprovalStatus, ExecRecord, FormRecord, ManualTsr } from '../store/useAppStore';
import { hhmm } from '../lib/format';

/* ── Working blocks (plan + workflow) ───────────────────────── */

export interface WorkingBlock extends Block {
  status: ApprovalStatus;
  approval: Approval | null;
  /** true when every department in the block has concurred */
  concurred: boolean;
  overridden: boolean;
}

const EMPTY: Approval = { status: 'PROPOSED', concur: {}, objections: [] };

export function workingBlocks(snapshot: Snapshot | null, approvals: Record<string, Approval>): WorkingBlock[] {
  if (!snapshot) return [];
  return snapshot.result.weekly.ai.blocks.map((b) => {
    const a = approvals[b.id] ?? null;
    const ap = a ?? EMPTY;
    const concurred = b.departments.every((d) => !!ap.concur[d]);
    if (ap.override) {
      const start = ap.override.start;
      const end = ap.override.end;
      return { ...b, start, end, startText: hhmm(start), endText: hhmm(end), spanMin: end - start, status: ap.status, approval: a, concurred, overridden: true };
    }
    return { ...b, status: ap.status, approval: a, concurred, overridden: false };
  });
}

export const blocksForDay = (blocks: WorkingBlock[], day: number) => blocks.filter((b) => b.day === day);

export function blockStatusLabel(b: WorkingBlock): string {
  if (b.status === 'PROPOSED') return b.concurred ? 'Concurred — ready to grant' : b.approval?.proposedAt ? 'Proposed — awaiting concurrence' : 'Draft (optimiser proposal)';
  return b.status.charAt(0) + b.status.slice(1).toLowerCase();
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
  const out: CautionOrder[] = engineOrders.map((o) => ({ ...o, status: forms[o.orderNo]?.status ?? 'DRAFT' }));
  let seq = out.length;
  for (const t of tsrs) {
    if (t.corridorId !== snapshot.corridor.id || t.status === 'WITHDRAWN') continue;
    seq++;
    const secs = snapshot.corridor.blockSections.filter((s) => Math.max(s.startKm, t.fromKm) < Math.min(s.endKm, t.toKm) || (t.fromKm === t.toKm && t.fromKm >= s.startKm && t.fromKm <= s.endKm)).map((s) => s.index);
    const orderNo = `T/409-${snapshot.corridor.code.replace('–', '-')}-${snapshot.planStart.replace(/-/g, '')}-M${String(seq).padStart(3, '0')}`;
    const daysInForce = Math.max(1, Math.round((Date.now() - new Date(t.since).getTime()) / 86400000));
    out.push({
      id: `CO-M${String(seq).padStart(3, '0')}`,
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
