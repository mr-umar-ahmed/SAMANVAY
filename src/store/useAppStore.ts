/**
 * One store for the whole app (zustand + localStorage persistence).
 *
 *  - session / settings / planning parameters / workflow state are persisted
 *  - the engine snapshot is NOT persisted (the worker recomputes it on boot)
 *  - every user action that changes railway state also appends an audit entry
 *
 * Block identity: engine block ids (BLK-…) are stable for a given corridor,
 * seed and inputs; workflow slices are keyed by them and cleared when the
 * corridor changes or demo data is reset.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { runPlan as runPlanInWorker } from '../engine/client';
import { DEFAULT_WEIGHTS, RULES } from '../engine/constants.js';
import { DEFAULT_ROI_ASSUMPTIONS } from '../engine/roi.js';
import type { Block, Dept, ExecutionLogRecord, FixedBlockConstraint, InjectSpec, Kpis, KpiDelta, Line, PlanRequest, Rules, Scenario, Snapshot, Task, WeatherDay, Weights } from '../engine/types';
import {
  captureGeometry,
  corridorInjects,
  fixedBlocksFromApprovals,
  mergeFixedBlocks,
  reconcileApprovals,
  requisitionInjectSpec,
  resourceClash,
  severityFactsAt,
  workflowState,
  workingBlocks,
  workOnlyMinutes,
  type FixedBlock,
  type WorkflowState,
} from '../engine/select';
import { can, type Capability, type PortalId, type SessionUser } from '../auth/portals';
import { computeSeverity, suggestCategory, type CategorySuggestion } from '../lib/triage';
import { hhmm, nowMinuteIST } from '../lib/format';
import type { Lang } from '../i18n';

/* ───────────────────────── types ───────────────────────── */

export type Theme = 'light' | 'dark' | 'sunlight';
export type SolverChoice = 'milp' | 'sa';
export type FeedSystem = 'tms' | 'smms' | 'tdms';
/** One imported register file (records already validated by importer.normalizeImported). */
export interface ImportedBatch {
  corridorId: string;
  fileName: string;
  records: Record<string, unknown>[];
  rejected: number;
  mode: 'append' | 'replace';
  at: string;
}
export type ImportedFeeds = Partial<Record<FeedSystem, ImportedBatch>>;
export interface WeatherOverride {
  corridorId: string;
  source: 'open-meteo';
  fetchedAt: string;
  days: WeatherDay[];
}
export type PlanStatus = 'idle' | 'running' | 'ready' | 'error';

/**
 * Stored approval status. The finer workflow state (DRAFT / PROPOSED /
 * CONCURRED / GRANTED / LOCKED / REFUSED / SUPERSEDED) is derived by
 * workflowState() in engine/select.ts from this record.
 */
export type ApprovalStatus = 'PROPOSED' | 'GRANTED' | 'REFUSED' | 'LOCKED';

/** Where a block sat when the workflow last touched it (after any Control override). */
export interface BlockGeometry {
  day: number;
  /** ISO date of the day, so the day index can be recomputed against another plan week */
  date?: string;
  line: Line;
  start: number;
  end: number;
  taskIds: string[];
  tasks: { id: string; start: number; end: number }[];
  departments?: Dept[];
  capturedAt?: string;
}

export interface Approval {
  status: ApprovalStatus;
  concur: Partial<Record<Dept, { by: string; at: string; note?: string }>>;
  objections: { dept: Dept; by: string; at: string; reason: string }[];
  /** window override recorded by Control ("grant with change", approved extension) */
  override?: { start: number; end: number; by: string; at: string };
  incharge?: string;
  resources?: { machineId?: string; crewId?: string };
  proposedBy?: string;
  proposedAt?: string;
  grantedBy?: string;
  grantedAt?: string;
  lockedBy?: string;
  lockedAt?: string;
  refusal?: { reason: string; count: number; by: string; at: string };
  /** geometry at the last propose / concur / object / grant / lock / override — sent to the optimiser as a fixed block */
  geometry?: BlockGeometry;
  /** a re-plan changed this sent block: the planning cell must send the new block again */
  supersededAt?: string;
  /** the approval was moved from this block id to the block holding the same works */
  rekeyedFrom?: string;
  /** minutes added to the window by approved extensions */
  extendedMin?: number;
}

/** InjectSpec with the fields the engine honours for requisitions and reports (see types.ts contract). */
export type InjectSpecV4 = InjectSpec & {
  corridorId?: string;
  durationMin?: number;
  preferredDay?: number;
  preferredWindow?: 'night' | 'day' | 'any';
  machine?: string | null;
  blockKind?: 'TRAFFIC' | 'POWER' | 'TRAFFIC + POWER' | 'DISCONNECTION';
  requires?: Array<'POWER_BLOCK' | 'DISCONNECTION'>;
  dependsOn?: string[];
  coRequireWith?: string[];
  replacesTaskId?: string;
};

export interface ExtensionRequest {
  id: string;
  blockId: string;
  extraMin: number;
  reason: string;
  by: string;
  role: string;
  at: string;
  status: 'PENDING' | 'APPROVED' | 'REFUSED';
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
}

export interface SiteMessage {
  id: string;
  blockId: string;
  text: string;
  by: string;
  at: string;
  role?: string;
  /** field → Control, or Control's reply */
  from?: 'field' | 'control';
  /** id of the message this replies to */
  replyTo?: string;
}

export interface CautionAck {
  id: string;
  orderNo: string;
  by: string;
  at: string;
  role?: string;
  trainNo?: string;
}

/** What a corridor switch would clear (for the confirmation dialog). */
export interface CorridorSwitchImpact {
  approvals: number;
  sentOrHeld: number;
  granted: number;
  executionRecords: number;
  forms: number;
  powerBlocks: number;
  extensions: number;
  handoverNotes: number;
  scenario: boolean;
  machineRemovals: number;
  pinned: number;
  excluded: number;
}

export type AuditEntityType = 'block' | 'task' | 'report' | 'plan' | 'caution' | 'user' | 'settings' | 'tsr' | 'form' | 'requisition' | 'rbp' | 'escalation' | 'direction' | 'feed';

export interface AuditEntry {
  id: string;
  at: string;
  by: string;
  role: string;
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  detail?: string;
}

export interface ExecItem {
  taskId: string;
  label: string;
  dept: Dept;
  workType: string;
  /** work-only minutes the plan allotted (no setup / clearance) */
  plannedMin: number;
  /** uncalibrated standard minutes for the work — what duration calibration compares against */
  baseMin?: number;
  done: boolean;
  actualMin?: number;
  remarks?: string;
}

export interface ExecRecord {
  blockId: string;
  corridorId: string;
  date: string;
  sectionText: string;
  line: Line;
  plannedStart: number;
  plannedEnd: number;
  plannedSpanMin: number;
  actualStart?: number;
  actualEnd?: number;
  actualSpanMin?: number;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED';
  overrunCause?: string;
  speedOnLifting?: number | null;
  items: ExecItem[];
  by: string;
  source: 'field' | 'control';
  updatedAt: string;
  /** minutes added by extensions Control approved during the possession */
  extendedMin?: number;
}

export type ReportCategory = 'track' | 'signal' | 'ohe' | 'lc' | 'fire' | 'obstruction' | 'other';
export type ReportStatus = 'UNVERIFIED' | 'TRIAGED' | 'TASK' | 'RESOLVED' | 'REJECTED';
export type ReportSource = 'citizen' | 'field' | 'locoPilot';

export interface HazardReport {
  id: string;
  /** demo record shipped with the build */
  seeded?: boolean;
  at: string;
  source: ReportSource;
  reporter: { name: string; role: string; portal: PortalId; contact?: string };
  lang: Lang;
  description: string;
  category: ReportCategory;
  severity?: 'low' | 'medium' | 'high';
  /** severity computed by the points table in lib/triage (the reporter did not choose one) */
  severityAuto?: boolean;
  severityReasons?: string[];
  /** keyword suggestion from lib/triage when it differs from the reporter's category */
  suggestedCategory?: CategorySuggestion | null;
  /** small JPEG data URL for lists; the full photo lives in IndexedDB under photoId */
  thumbDataUrl?: string;
  photoId?: string;
  lat?: number;
  lng?: number;
  accuracyM?: number;
  km?: number;
  line?: Line;
  nearestStation?: string;
  corridorId: string;
  trainNumber?: string;
  /** routed department (rule-based on category) */
  dept: Dept | null;
  status: ReportStatus;
  assignee?: string;
  taskSpec?: InjectSpec;
  intakeTaskId?: string;
  history: { at: string; by: string; action: string; note?: string }[];
}

export interface IntakeTask {
  id: string;
  spec: InjectSpecV4;
  label: string;
  dept: Dept;
  submittedBy: string;
  role: string;
  at: string;
  source: 'BDMS-INTAKE' | 'FIELD' | 'CITIZEN' | 'EMERGENCY-TSR' | 'REQUISITION';
  /** corridor the work belongs to — only the active corridor's intake is sent to the optimiser */
  corridorId?: string;
}

export type RequisitionStatus = 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'ACCEPTED' | 'WITHDRAWN';
export type BlockType = 'TRAFFIC' | 'POWER' | 'DISCONNECTION' | 'INTEGRATED';

export interface Requisition {
  id: string;
  /** demo record shipped with the build */
  seeded?: boolean;
  no: string;
  corridorId: string;
  dept: Dept;
  workType: string;
  line: Line;
  startKm: number;
  endKm: number;
  durationMin: number;
  preferredDate?: string;
  preferredWindow?: 'night' | 'day' | 'any';
  machine?: string | null;
  crew?: string | null;
  blockType: BlockType;
  speedAfterKmph?: number | null;
  speedAfterDays?: number;
  gang?: string;
  incharge?: string;
  assetIds?: string;
  remarks?: string;
  tsrKmph?: number | null;
  daysOverdue?: number;
  /** the work needs an OHE power block (TRD isolation) */
  needsPowerBlock?: boolean;
  /** the work needs an S&T disconnection (T/351) */
  needsDisconnection?: boolean;
  /** requisitions (ids) that must be done before this one */
  dependsOnReqIds?: string[];
  /** requisitions (ids) that must share the block with this one */
  coRequireReqIds?: string[];
  /** register task the requisition was raised from (the accepted work replaces it) */
  sourceTaskId?: string;
  status: RequisitionStatus;
  validation: string[];
  cellRemarks?: string;
  intakeTaskId?: string;
  by: string;
  role: string;
  at: string;
  updatedAt: string;
  history: { at: string; by: string; action: string; note?: string }[];
}

export interface ScenarioState {
  presetId: string | null;
  name: string;
  params: Record<string, number | string>;
  scenario: Scenario;
}

export interface RoiAssumptions {
  delayPerMinuteVb: number;
  delayPerMinuteMailExp: number;
  delayPerMinuteGoods: number;
  lineHourOpportunity: number;
  freightDemurragePerHour: number;
  tsrEnergyPerTrainMin: number;
  machineSetupPerBlock: number;
  co2KgPerTsrMin: number;
  carbonCreditPerTon: number;
}

export interface Toast {
  id: string;
  title: string;
  body?: string;
  tone: 'ok' | 'warn' | 'crit' | 'info';
}

export interface PreviousResult {
  kpis: Kpis;
  baseKpis: Kpis;
  delta: KpiDelta;
  scenarioName: string | null;
  blockCount: number;
}

export type FormStatus = 'DRAFT' | 'ISSUED' | 'RECEIVED' | 'RECONNECTED' | 'WITHDRAWN' | 'ACKNOWLEDGED';
export interface FormRecord {
  status: FormStatus;
  by: string;
  at: string;
  reason?: string;
  /** loco pilots who acknowledged the order (the status stays ISSUED) */
  acknowledgements?: { by: string; at: string; role?: string; trainNo?: string }[];
}

export interface ManualTsr {
  id: string;
  corridorId: string;
  line: Line;
  fromKm: number;
  toKm: number;
  kmph: number;
  reason: string;
  status: 'PROPOSED' | 'IN_FORCE' | 'WITHDRAWN';
  since: string;
  until?: string;
  by: string;
  taskId?: string;
  blockId?: string;
  relaxationRequested?: { by: string; at: string; note?: string };
}

export type PowerBlockStatus = 'PENDING' | 'DEENERGISED' | 'ENERGISED';

export interface RbpState {
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'RETURNED';
  by?: string;
  at?: string;
  remarks?: string;
}

export interface Escalation {
  id: string;
  kind: 'disruption' | 'mandatory' | 'refused' | 'stale' | 'incident' | 'manual';
  ref: string;
  note: string;
  by: string;
  at: string;
  reviewed?: { by: string; at: string };
}

export interface Direction {
  id: string;
  dept: Dept | 'ALL';
  note: string;
  by: string;
  at: string;
}

export interface PushedNotification {
  id: string;
  at: string;
  portals: PortalId[];
  dept?: Dept;
  kind: 'INFO' | 'WARNING' | 'CRITICAL' | 'ACTION' | 'OK';
  title: string;
  body: string;
  route?: string;
}

export interface CandidatePatch {
  weights?: Partial<Weights>;
  rules?: Partial<Rules>;
  iterations?: number;
  scenario?: ScenarioState | null;
  pinnedTaskIds?: string[];
  excludedTaskIds?: string[];
  /** merged with the fixed blocks derived from approvals; the patch wins for the same id */
  fixedBlocks?: (FixedBlockConstraint | FixedBlock)[];
}

export interface Candidate {
  snapshot: Snapshot;
  patch: CandidatePatch;
  reason: string;
  at: string;
}

export type TriageAction = 'verify' | 'assign' | 'reroute' | 'accept' | 'reject' | 'resolve' | 'return';

/* ───────────────────────── state ───────────────────────── */

export interface AppState {
  // session
  user: SessionUser | null;
  login: (u: SessionUser) => void;
  logout: () => void;

  // settings
  theme: Theme;
  setTheme: (t: Theme) => void;
  language: Lang;
  setLanguage: (l: Lang) => void;
  corridorId: string;
  /** switch corridor: clears approvals, execution records, forms, power blocks, scenario (incl. machine removals), pins, extensions */
  setCorridor: (id: string) => void;
  /** what setCorridor would clear — show it in a confirmation before switching */
  corridorSwitchImpact: () => CorridorSwitchImpact;
  /** system notifications on this device when the tab is hidden (browser permission) */
  deviceNotifications: boolean;
  enableDeviceNotifications: () => Promise<NotificationPermission | 'unsupported'>;
  disableDeviceNotifications: () => void;
  audioMuted: boolean;
  setAudioMuted: (m: boolean) => void;
  preloaderSeen: boolean;
  setPreloaderSeen: (v: boolean) => void;
  homeStation: string | null;
  setHomeStation: (s: string | null) => void;
  savedTrains: string[];
  toggleSavedTrain: (n: string) => void;
  lastTrainNo: string | null;
  setLastTrainNo: (n: string | null) => void;
  citizenName: string;
  setCitizenName: (n: string) => void;
  myReportIds: string[];

  // planning parameters
  /** 'milp' = exact MILP (HiGHS) construction polished by simulated annealing; 'sa' = greedy + simulated annealing */
  solver: SolverChoice;
  setSolver: (s: SolverChoice) => void;
  /** records imported from TMS / SMMS / TDMS files for one corridor (validated on the main thread) */
  importedFeeds: ImportedFeeds;
  importFeed: (system: FeedSystem, batch: Omit<ImportedBatch, 'at'>) => void;
  clearImportedFeed: (system: FeedSystem) => void;
  /** live forecast fetched for a corridor (laid over the seeded weather day by day) */
  weatherOverride: WeatherOverride | null;
  setWeatherOverride: (w: WeatherOverride | null) => void;
  weights: Weights;
  rules: Rules;
  iterations: number;
  scenario: ScenarioState | null;
  pinnedTaskIds: string[];
  excludedTaskIds: string[];
  setWeights: (w: Partial<Weights>) => void;
  setRules: (r: Partial<Rules>) => void;
  setIterations: (n: number) => void;
  resetTuning: () => void;
  setScenario: (s: ScenarioState | null) => void;
  pinTask: (id: string) => void;
  unpinTask: (id: string) => void;
  excludeTask: (id: string, reason: string) => void;
  includeTask: (id: string) => void;

  intakeTasks: IntakeTask[];
  addIntakeTask: (t: Omit<IntakeTask, 'id' | 'at'>) => IntakeTask;
  removeIntakeTask: (id: string) => void;

  // engine
  snapshot: Snapshot | null;
  planStatus: PlanStatus;
  planProgress: string;
  planError: string | null;
  planVersion: number;
  lastPlannedAt: string | null;
  previousResult: PreviousResult | null;
  pendingRerun: boolean;
  /** silent: re-run triggered by another tab — reconcile approvals but do not audit / notify again */
  runPlan: (opts?: { reason?: string; silent?: boolean }) => Promise<void>;
  candidate: Candidate | null;
  candidateStatus: 'idle' | 'running' | 'error';
  candidateProgress: string;
  candidateError: string | null;
  runCandidate: (patch: CandidatePatch, reason: string) => Promise<void>;
  promoteCandidate: () => void;
  discardCandidate: () => void;

  // JPO workflow — every guarded action returns true when it changed state, false (with a toast saying why) when refused
  approvals: Record<string, Approval>;
  /** planning (`plan`): send DRAFT / REFUSED blocks for concurrence; returns how many were sent */
  proposeBlocks: (blockIds: string[]) => number;
  /** `concur:<DEPT>`, or `plan` with a note (recorded on behalf); only on PROPOSED / partly concurred blocks */
  concur: (blockId: string, dept: Dept, note?: string) => boolean;
  object: (blockId: string, dept: Dept, reason: string) => boolean;
  /** `grant`; only on CONCURRED blocks */
  grant: (blockId: string, override?: { start: number; end: number }) => boolean;
  /** `grant`; only on PROPOSED / CONCURRED blocks */
  refuse: (blockId: string, reason: string) => boolean;
  /** `lock`; only on GRANTED blocks */
  lock: (blockId: string) => boolean;
  /** `lock`; locks every GRANTED block in the list with one notification per department; returns how many */
  lockBlocks: (blockIds: string[]) => number;
  setIncharge: (blockId: string, name: string) => boolean;
  /** refuses (toast) a machine or gang already working in an overlapping block */
  setResources: (blockId: string, r: { machineId?: string; crewId?: string }) => boolean;
  resetApprovals: () => void;
  handoverNotes: Record<string, string>;
  setHandoverNote: (date: string, note: string) => void;

  // forms, TSRs, power blocks
  forms: Record<string, FormRecord>;
  setFormStatus: (formId: string, status: FormStatus, reason?: string) => void;
  tsrs: ManualTsr[];
  addTsr: (t: Omit<ManualTsr, 'id' | 'since' | 'by'>) => ManualTsr;
  updateTsr: (id: string, patch: Partial<ManualTsr>) => void;
  powerBlocks: Record<string, { status: PowerBlockStatus; by: string; at: string }>;
  setPowerBlock: (blockId: string, status: PowerBlockStatus) => void;

  // programme approvals
  rbp: { monthly: RbpState; rolling: RbpState };
  submitRbp: (kind: 'monthly' | 'rolling') => void;
  decideRbp: (kind: 'monthly' | 'rolling', decision: 'APPROVED' | 'RETURNED', remarks?: string) => void;
  jpoNotices: Record<string, { by: string; at: string }>;
  markJpoServed: (taskId: string) => void;
  escalations: Escalation[];
  escalate: (e: Omit<Escalation, 'id' | 'at' | 'by'>) => void;
  reviewEscalation: (id: string) => void;
  directions: Direction[];
  direct: (dept: Dept | 'ALL', note: string) => void;

  // audit
  audit: AuditEntry[];
  addAudit: (e: Omit<AuditEntry, 'id' | 'at' | 'by' | 'role'> & { by?: string; role?: string }) => void;

  // execution
  executionLog: ExecRecord[];
  /** `execute`; only GRANTED / LOCKED blocks. Item planned minutes are replaced by work-only minutes from the plan. */
  startPossession: (rec: Omit<ExecRecord, 'status' | 'by' | 'updatedAt' | 'actualStart' | 'source'> & { actualStart: number; source?: 'field' | 'control' }) => boolean;
  markItemDone: (blockId: string, taskId: string, actualMin: number, remarks?: string) => boolean;
  clearPossession: (blockId: string, data: { actualEnd: number; overrunCause?: string; speedOnLifting?: number | null; source?: 'field' | 'control' }) => boolean;
  resetExecution: () => void;
  /** extension requests from site (field / SSE) decided by Control */
  extensions: ExtensionRequest[];
  /** `execute`; block GRANTED / LOCKED; notifies Control */
  requestExtension: (blockId: string, req: { extraMin: number; reason: string }) => ExtensionRequest | null;
  /** `grant`; approve → window end += extraMin (override + fixed geometry); notifies field + departments */
  decideExtension: (blockId: string, requestId: string, approve: boolean, note?: string) => boolean;
  messages: SiteMessage[];
  messageControl: (blockId: string, text: string) => void;
  /** Control (`grant` or `execute` in the control / division portal) replies to a site message; notifies field */
  replyToMessage: (messageId: string, text: string) => boolean;
  acks: CautionAck[];
  /** loco pilot acknowledgement: recorded once per person, added to the form record (status unchanged), notifies Control */
  ackCaution: (orderNo: string, trainNo?: string) => boolean;

  // requisitions (BDMS-style)
  requisitions: Requisition[];
  saveRequisition: (r: Omit<Requisition, 'id' | 'no' | 'at' | 'updatedAt' | 'history' | 'by' | 'role'> & { id?: string }) => Requisition;
  submitRequisition: (id: string) => void;
  /** `plan`; SUBMITTED only */
  returnRequisition: (id: string, remarks: string) => boolean;
  /** `plan`; SUBMITTED only; the InjectSpec carries duration, preferred day/window, machine, block kind, requirements, dependencies, corridor, replaced task */
  acceptRequisition: (id: string) => IntakeTask | null;
  /** removes the injected work of an accepted requisition (call runPlan after) */
  withdrawRequisition: (id: string) => void;

  // hazard reports (citizen + field + loco pilot)
  reports: HazardReport[];
  submitReport: (r: Omit<HazardReport, 'id' | 'at' | 'status' | 'history' | 'dept'> & { dept?: Dept | null }) => HazardReport;
  triageReport: (id: string, action: TriageAction, data?: { note?: string; dept?: Dept; assignee?: string; taskSpec?: InjectSpec }) => void;

  // notifications
  pushed: PushedNotification[];
  notify: (n: Omit<PushedNotification, 'id' | 'at'>) => void;
  readNotifications: string[];
  markRead: (id: string) => void;
  markAllRead: (ids: string[]) => void;

  // tour
  toursDone: Partial<Record<PortalId, boolean>>;
  markTourDone: (p: PortalId) => void;
  resetTours: () => void;

  // ROI
  roiAssumptions: RoiAssumptions;
  setRoiAssumptions: (a: Partial<RoiAssumptions>) => void;
  resetRoiAssumptions: () => void;

  // data quality issues
  dataIssueStatus: Record<string, { state: 'OPEN' | 'ASSIGNED' | 'RESOLVED'; assignedTo?: Dept | null; resolvedAt?: string }>;
  assignDataIssue: (issueKey: string, dept: Dept) => void;
  resolveDataIssue: (issueKey: string) => void;

  // joint blocks
  acceptJointBlock: (arg: { task: Task; block: { id: string; day: number; line: Line; start: number; end: number; departments: string[] } }) => Promise<void>;

  // toasts (ephemeral)
  toasts: Toast[];
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;

  resetDemoData: () => void;
}

/* ───────────────────────── helpers ───────────────────────── */

const uid = () => (typeof globalThis.crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
const short = () => uid().slice(0, 6).toUpperCase();
const now = () => new Date().toISOString();

const DEFAULT_ITERATIONS = 6000;
const DEFAULT_CORRIDOR = 'NCR_NDLS_CNB';

const emptyApproval = (): Approval => ({ status: 'PROPOSED', concur: {}, objections: [] });

/**
 * Records from the UI execution log that the engine can learn duration
 * factors from. Planned minutes are work-only standard minutes (baseMin, or
 * the task's baseDurationMin for records made before baseMin existed) — the
 * same basis as the seeded history — never the whole block window.
 */
export function executionRecordsForEngine(log: ExecRecord[], tasks?: Pick<Task, 'id' | 'baseDurationMin' | 'durationMin'>[] | null): ExecutionLogRecord[] {
  const byId = new Map((tasks ?? []).map((t) => [t.id, t]));
  const out: ExecutionLogRecord[] = [];
  for (const rec of log) {
    const daysAgo = Math.max(0, Math.round((Date.now() - Date.parse(rec.updatedAt || rec.date)) / 86400000)) || 0;
    for (const it of rec.items) {
      if (!it.done || !it.actualMin) continue;
      const t = byId.get(it.taskId);
      const planned = it.baseMin ?? (t ? Math.round(t.baseDurationMin ?? t.durationMin) : it.plannedMin);
      if (!planned || planned <= 0) continue;
      out.push({ workType: it.workType, plannedMin: planned, actualMin: it.actualMin, daysAgo, overrunReason: it.actualMin > planned * 1.1 ? rec.overrunCause || 'Overrun (execution log)' : null });
    }
  }
  return out;
}

/* bilingual refusal toasts (store messages follow the UI language: EN / HI) */
const TX = {
  en: {
    signIn: 'Sign in to do this',
    noPlan: 'Only the block planning cell can do this',
    noConcur: 'Your role cannot record {dept} concurrence',
    onBehalfNote: 'Concurrence on behalf of {dept} needs a note (phone / paper reference)',
    deptNotIn: '{dept} has no work in block {id}',
    notSent: 'Block {id} has not been sent for concurrence yet',
    superseded: 'Block {id} was changed by a re-plan — the planning cell must send the new block again',
    concurClosed: 'Concurrence on block {id} is closed — it is {state}',
    noGrant: 'Your role cannot grant or refuse possessions',
    notConcurred: 'Block {id} cannot be granted before every department concurs ({missing} pending)',
    grantState: 'Only a concurred block can be granted — block {id} is {state}',
    badWindow: 'The changed window must lie inside the day and end after it starts',
    refuseState: 'Only a proposed or concurred block can be refused — block {id} is {state}',
    noLock: 'Your role cannot lock blocks',
    lockState: 'Only a granted block can be locked — block {id} is {state}',
    notInPlan: 'Block {id} is not in the current plan',
    noResources: 'Your role cannot assign machines or gangs',
    clash: '{res} is already working in block {other} ({window}) — double booking refused',
    noExecute: 'Your role cannot record possession start, work done or line clear',
    notGranted: 'Block {id} is not granted — the possession cannot start',
    alreadyStarted: 'The possession of block {id} is already recorded',
    notStarted: 'No possession in progress on block {id}',
    ackDup: 'You have already acknowledged {no}',
    extInvalid: 'Ask for 5 to 240 minutes, with a reason',
    extState: 'An extension can be asked only for a granted block',
    extPending: 'An extension for block {id} is already waiting for Control',
    extMidnight: 'The extended block would run past 24:00',
    extNotFound: 'That extension request is not waiting for a decision',
    noReply: 'Only Control can reply to site messages',
    emptyText: 'Write the message first',
    msgNotFound: 'Message not found',
    reqState: 'Requisition {no} is {status} — only a submitted requisition can be accepted or returned',
  },
  hi: {
    signIn: 'यह करने के लिए साइन इन करें',
    noPlan: 'यह केवल ब्लॉक योजना प्रकोष्ठ कर सकता है',
    noConcur: 'आपकी भूमिका {dept} की सहमति दर्ज नहीं कर सकती',
    onBehalfNote: '{dept} की ओर से सहमति के लिए टिप्पणी (फ़ोन / पत्र संदर्भ) आवश्यक है',
    deptNotIn: 'ब्लॉक {id} में {dept} का कोई कार्य नहीं है',
    notSent: 'ब्लॉक {id} अभी सहमति के लिए नहीं भेजा गया है',
    superseded: 'ब्लॉक {id} पुनः योजना से बदल गया — योजना प्रकोष्ठ नया ब्लॉक फिर से भेजे',
    concurClosed: 'ब्लॉक {id} पर सहमति बंद है — यह {state} है',
    noGrant: 'आपकी भूमिका पज़ेशन प्रदान या अस्वीकार नहीं कर सकती',
    notConcurred: 'सभी विभागों की सहमति से पहले ब्लॉक {id} प्रदान नहीं हो सकता ({missing} शेष)',
    grantState: 'केवल सहमत ब्लॉक प्रदान हो सकता है — ब्लॉक {id} {state} है',
    badWindow: 'बदली गई अवधि दिन के भीतर हो और शुरू होने के बाद समाप्त हो',
    refuseState: 'केवल प्रस्तावित या सहमत ब्लॉक अस्वीकार हो सकता है — ब्लॉक {id} {state} है',
    noLock: 'आपकी भूमिका ब्लॉक लॉक नहीं कर सकती',
    lockState: 'केवल प्रदान किया गया ब्लॉक लॉक हो सकता है — ब्लॉक {id} {state} है',
    notInPlan: 'ब्लॉक {id} वर्तमान योजना में नहीं है',
    noResources: 'आपकी भूमिका मशीन या गैंग नियत नहीं कर सकती',
    clash: '{res} पहले से ब्लॉक {other} ({window}) में लगा है — दोहरी बुकिंग अस्वीकृत',
    noExecute: 'आपकी भूमिका पज़ेशन शुरू, कार्य पूर्ण या लाइन क्लियर दर्ज नहीं कर सकती',
    notGranted: 'ब्लॉक {id} प्रदान नहीं हुआ — पज़ेशन शुरू नहीं हो सकता',
    alreadyStarted: 'ब्लॉक {id} का पज़ेशन पहले से दर्ज है',
    notStarted: 'ब्लॉक {id} पर कोई पज़ेशन जारी नहीं है',
    ackDup: 'आप {no} पहले ही स्वीकार कर चुके हैं',
    extInvalid: '5 से 240 मिनट माँगें, कारण सहित',
    extState: 'विस्तार केवल प्रदान किए गए ब्लॉक के लिए माँगा जा सकता है',
    extPending: 'ब्लॉक {id} का विस्तार अनुरोध पहले से नियंत्रण के पास है',
    extMidnight: 'विस्तारित ब्लॉक 24:00 के बाद तक चलेगा',
    extNotFound: 'यह विस्तार अनुरोध निर्णय की प्रतीक्षा में नहीं है',
    noReply: 'साइट संदेशों का उत्तर केवल नियंत्रण दे सकता है',
    emptyText: 'पहले संदेश लिखें',
    msgNotFound: 'संदेश नहीं मिला',
    reqState: 'माँग-पत्र {no} {status} है — केवल प्रस्तुत माँग-पत्र स्वीकार या लौटाया जा सकता है',
  },
} as const;
type TxKey = keyof typeof TX.en;

const STATE_WORD: Record<WorkflowState, { en: string; hi: string }> = {
  DRAFT: { en: 'a draft', hi: 'ड्राफ़्ट' },
  PROPOSED: { en: 'awaiting concurrence', hi: 'सहमति की प्रतीक्षा में' },
  CONCURRED: { en: 'concurred', hi: 'सहमत' },
  GRANTED: { en: 'granted', hi: 'प्रदान' },
  LOCKED: { en: 'locked', hi: 'लॉक' },
  REFUSED: { en: 'refused', hi: 'अस्वीकृत' },
  SUPERSEDED: { en: 'changed by a re-plan', hi: 'पुनः योजना से बदला हुआ' },
};

function txt(lang: Lang, key: TxKey, params: Record<string, string | number> = {}): string {
  const dict = lang === 'hi' ? TX.hi : TX.en;
  return dict[key].replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ''));
}

/** Refuse an action: toast why (in the UI language) and return false. */
function deny(get: () => AppState, key: TxKey, params: Record<string, string | number> = {}): false {
  const s = get();
  s.toast({ title: txt(s.language, key, params), tone: 'warn' });
  return false;
}

const stateWord = (get: () => AppState, st: WorkflowState) => STATE_WORD[st][get().language === 'hi' ? 'hi' : 'en'];

/** Concurrence / objection is open only on sent blocks that are not yet granted (partly concurred included). */
function checkConcurOpen(get: () => AppState, blockId: string, state: WorkflowState): boolean {
  if (state === 'PROPOSED' || state === 'CONCURRED') return true;
  if (state === 'DRAFT') return deny(get, 'notSent', { id: blockId });
  if (state === 'SUPERSEDED') return deny(get, 'superseded', { id: blockId });
  return deny(get, 'concurClosed', { id: blockId, state: stateWord(get, state) });
}

const deptPortals = (depts: Dept[]): PortalId[] => depts.map((d) => d.toLowerCase() as PortalId);

/** Who may record the in-charge / machine / gang of a block. */
const RESOURCE_CAPS: Capability[] = ['plan', 'intake', 'execute', 'grant'];

/** Plan-affecting key of a request (used to decide whether a re-plan is needed). */
export function planRequestKey(req: PlanRequest): string {
  return JSON.stringify(req);
}

export function deptForCategory(cat: ReportCategory): Dept | null {
  switch (cat) {
    case 'track':
    case 'obstruction':
      return 'TMS';
    case 'signal':
    case 'lc':
      return 'SMMS';
    case 'ohe':
    case 'fire':
      return 'TDMS';
    default:
      return null;
  }
}

/**
 * Build the worker request from the store's parameters (+ an optional candidate patch).
 *  - injects: scenario injects + intake tasks and converted reports of the ACTIVE corridor only
 *  - fixedBlocks: every CONCURRED / GRANTED / LOCKED approval and every possession in progress,
 *    at its stored geometry and with its block id (merged with patch.fixedBlocks; the patch wins)
 */
export function buildRequest(s: Pick<AppState, 'scenario' | 'intakeTasks' | 'reports' | 'corridorId' | 'executionLog' | 'weights' | 'rules' | 'iterations' | 'pinnedTaskIds' | 'excludedTaskIds' | 'approvals' | 'snapshot'> & Partial<Pick<AppState, 'solver' | 'importedFeeds' | 'weatherOverride'>>, patch: CandidatePatch = {}): PlanRequest {
  const scenarioState = patch.scenario === undefined ? s.scenario : patch.scenario;
  const injected: InjectSpec[] = [...(scenarioState?.scenario.injectTasks ?? []), ...corridorInjects(s.intakeTasks, s.reports, s.corridorId)];
  const planStart = s.snapshot && s.snapshot.corridor.id === s.corridorId ? s.snapshot.planStart : null;
  const scenario: Scenario = {
    ...(scenarioState?.scenario ?? {}),
    name: scenarioState?.name,
    id: scenarioState?.presetId ?? undefined,
    injectTasks: injected,
    extraExecution: executionRecordsForEngine(s.executionLog, s.snapshot?.tasks),
  };
  const fixed = mergeFixedBlocks(fixedBlocksFromApprovals(s.approvals, s.executionLog, { planStart, corridorId: s.corridorId }), patch.fixedBlocks);
  return {
    corridorId: s.corridorId,
    weights: { ...s.weights, ...(patch.weights ?? {}) },
    rules: { ...s.rules, ...(patch.rules ?? {}) },
    iterations: patch.iterations ?? s.iterations,
    scenario,
    pinnedTaskIds: patch.pinnedTaskIds ?? s.pinnedTaskIds,
    excludedTaskIds: patch.excludedTaskIds ?? s.excludedTaskIds,
    fixedBlocks: fixed.length ? fixed : undefined,
    solver: s.solver ?? 'milp',
    imported: importedForCorridor(s.importedFeeds, s.corridorId),
    weather: s.weatherOverride && s.weatherOverride.corridorId === s.corridorId ? s.weatherOverride.days : null,
  };
}

/** Imported records of the active corridor, in the shape mergeImported() takes ({ tms: { records, mode } }). */
function importedForCorridor(feeds: ImportedFeeds | undefined, corridorId: string): PlanRequest['imported'] {
  if (!feeds) return null;
  const out: NonNullable<PlanRequest['imported']> = {};
  for (const sys of ['tms', 'smms', 'tdms'] as const) {
    const b = feeds[sys];
    if (b && b.corridorId === corridorId && b.records.length) out[sys] = { records: b.records, mode: b.mode };
  }
  return Object.keys(out).length ? out : null;
}

/** Raw engine block, approval and derived workflow state of one block id. */
function blockCtx(s: AppState, blockId: string): { raw: Block | null; a: Approval | null; departments: Dept[]; state: WorkflowState } {
  const raw = s.snapshot?.result.weekly.ai.blocks.find((b) => b.id === blockId) ?? null;
  const a = s.approvals[blockId] ?? null;
  const departments = raw?.departments ?? a?.geometry?.departments ?? [];
  return { raw, a, departments, state: workflowState(a, departments) };
}

/**
 * Show a system notification for an item addressed to this device's user when
 * the tab is hidden (service-worker registration first, page Notification as
 * fallback). Nothing is sent anywhere — no SMS, no e-mail, no push server.
 */
export function deviceNotifyIfHidden(item: PushedNotification, st: Pick<AppState, 'deviceNotifications' | 'user'>): void {
  if (!st.deviceNotifications || typeof document === 'undefined' || !document.hidden) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const u = st.user;
  if (!u || !item.portals.includes(u.portal)) return;
  if (item.dept && u.dept && item.dept !== u.dept) return;
  const opts: NotificationOptions = { body: item.body, tag: item.id, data: { route: item.route ?? null } };
  void (async () => {
    try {
      const reg = typeof navigator !== 'undefined' && navigator.serviceWorker ? await navigator.serviceWorker.getRegistration() : undefined;
      if (reg) {
        await reg.showNotification(item.title, opts);
        return;
      }
    } catch {
      /* fall through to the page notification */
    }
    try {
      const n = new Notification(item.title, opts);
      n.onclick = () => {
        window.focus();
        if (item.route) window.location.assign(item.route);
        n.close();
      };
    } catch {
      /* this browser only allows notifications from a service worker */
    }
  })();
}

type StoreGet = () => AppState;
type StoreSet = (partial: Partial<AppState>) => void;

/**
 * After a new working snapshot: re-attach approvals of fixed / held blocks
 * whose id changed to the block with the same works (moving their execution
 * record, power-block record, extensions and messages with them), and mark
 * sent proposals whose block no longer exists as superseded (kept, audited,
 * planning notified). silent: the same reconciliation made by another tab.
 */
function reconcileAfterPlan(get: StoreGet, set: StoreSet, snapshot: Snapshot, silent = false) {
  const st = get();
  if (snapshot.corridor.id !== st.corridorId) return;
  const started = new Set(st.executionLog.filter((r) => r.status === 'IN_PROGRESS' && r.corridorId === st.corridorId).map((r) => r.blockId));
  const at = now();
  // approvals recorded before geometry existed: capture it from the block while it is still in the plan
  let approvals = st.approvals;
  let backfilled = false;
  for (const b of snapshot.result.weekly.ai.blocks) {
    const a = approvals[b.id];
    if (!a || a.geometry || (!a.proposedAt && a.status === 'PROPOSED')) continue;
    if (!backfilled) approvals = { ...approvals };
    approvals[b.id] = { ...a, geometry: captureGeometry(b, a.override, at) };
    backfilled = true;
  }
  const rec = reconcileApprovals(approvals, snapshot.result.weekly.ai.blocks, at, started);
  if (!rec.superseded.length && !rec.rekeyed.length && !rec.orphaned.length) {
    if (backfilled) set({ approvals });
    return;
  }
  const move = new Map(rec.rekeyed.map((r) => [r.from, r.to]));
  const re = (id: string) => move.get(id) ?? id;
  const patch: Partial<AppState> = { approvals: rec.approvals };
  if (move.size) {
    patch.executionLog = st.executionLog.map((r) => (move.has(r.blockId) ? { ...r, blockId: re(r.blockId) } : r));
    patch.powerBlocks = Object.fromEntries(Object.entries(st.powerBlocks).map(([k, v]) => [re(k), v]));
    patch.extensions = st.extensions.map((e) => (move.has(e.blockId) ? { ...e, blockId: re(e.blockId) } : e));
    patch.messages = st.messages.map((m) => (move.has(m.blockId) ? { ...m, blockId: re(m.blockId) } : m));
  }
  set(patch);
  if (silent) return;
  for (const r of rec.rekeyed) get().addAudit({ action: 'APPROVAL_REKEYED', entityType: 'block', entityId: r.to, detail: `Same works re-planned: approval moved from ${r.from}`, by: 'System', role: 'SYSTEM' });
  for (const id of rec.superseded) get().addAudit({ action: 'PROPOSAL_SUPERSEDED', entityType: 'block', entityId: id, detail: 'Block changed by re-plan — concurrence must be requested again', by: 'System', role: 'SYSTEM' });
  for (const id of rec.orphaned) get().addAudit({ action: 'HELD_BLOCK_DROPPED', entityType: 'block', entityId: id, detail: `${rec.approvals[id]?.status ?? ''} block not found in the new plan`, by: 'System', role: 'SYSTEM' });
  const n = rec.superseded.length;
  if (n) get().notify({ portals: ['planning'], kind: 'WARNING', title: `${n} proposed block${n > 1 ? 's' : ''} changed after re-plan — send again`, body: rec.superseded.slice(0, 4).join(', '), route: '/app/planning/handoff' });
  const o = rec.orphaned.length;
  if (o) get().notify({ portals: ['control', 'planning'], kind: 'CRITICAL', title: `${o} granted block${o > 1 ? 's' : ''} no longer in the plan`, body: rec.orphaned.slice(0, 4).join(', '), route: '/app/control/board' });
}

/** Demo reports so the incident queues are not empty on first run (marked seeded: true). */
export const SEED_REPORTS: HazardReport[] = [
  {
    id: 'HZ-1042',
    seeded: true,
    at: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    source: 'locoPilot',
    reporter: { name: 'S. K. Verma', role: 'Loco Pilot (Train 12952)', portal: 'field' },
    trainNumber: '12952',
    lang: 'en',
    description: 'Severe vertical track jerk observed at km 234/6 UP while trailing at 120 km/h. Possible weld defect or deep rail dip near Shikohabad.',
    category: 'track',
    severity: 'high',
    km: 234.6,
    line: 'UP',
    nearestStation: 'SKB',
    corridorId: 'NCR_NDLS_CNB',
    dept: 'TMS',
    status: 'UNVERIFIED',
    history: [{ at: new Date(Date.now() - 42 * 60 * 1000).toISOString(), by: 'S. K. Verma', action: 'RECEIVED', note: 'Reported from cab of 12952 Rajdhani Express' }],
  },
  {
    id: 'HZ-1039',
    seeded: true,
    at: new Date(Date.now() - 115 * 60 * 1000).toISOString(),
    source: 'field',
    reporter: { name: 'Ram Naresh', role: 'Keyman (Gang 4, Hathras)', portal: 'field' },
    lang: 'hi',
    description: 'किमी 164/2 डाउन लाइन पर ग्लूड जॉइंट में इंसुलेशन जलने के लक्षण दिख रहे हैं। ट्रैक सर्किट फ्लिकरिंग हो सकती है।',
    category: 'signal',
    severity: 'medium',
    km: 164.2,
    line: 'DN',
    nearestStation: 'HRS',
    corridorId: 'NCR_NDLS_CNB',
    dept: 'SMMS',
    status: 'TRIAGED',
    assignee: 'R. P. Singh (SSE/Sig/HRS)',
    history: [
      { at: new Date(Date.now() - 115 * 60 * 1000).toISOString(), by: 'Ram Naresh', action: 'RECEIVED', note: 'Reported during morning foot inspection' },
      { at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), by: 'Chief Controller', action: 'VERIFY', note: 'Verified by Control, routed to SMMS' },
      { at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), by: 'Sr DSTE Cell', action: 'ASSIGN', note: 'Assigned to R. P. Singh (SSE/Sig/HRS)' },
    ],
  },
  {
    id: 'HZ-1035',
    seeded: true,
    at: new Date(Date.now() - 240 * 60 * 1000).toISOString(),
    source: 'citizen',
    reporter: { name: 'Anurag Sharma', role: 'Passenger', portal: 'citizen' },
    lang: 'en',
    description: 'Large banyan tree branch dangling within 1.5 metres of overhead catenary wire near Khurja outer signal.',
    category: 'ohe',
    severity: 'medium',
    km: 82.4,
    line: 'BOTH',
    nearestStation: 'KRJ',
    corridorId: 'NCR_NDLS_CNB',
    dept: 'TDMS',
    status: 'TRIAGED',
    assignee: 'OHE gang, Khurja',
    history: [
      { at: new Date(Date.now() - 240 * 60 * 1000).toISOString(), by: 'Anurag Sharma', action: 'RECEIVED', note: 'Citizen mobile hazard report' },
      { at: new Date(Date.now() - 180 * 60 * 1000).toISOString(), by: 'Section Controller', action: 'VERIFY', note: 'Routed to TDMS for site check' },
      { at: new Date(Date.now() - 120 * 60 * 1000).toISOString(), by: 'SSE/TRD/KRJ', action: 'ASSIGN', note: 'OHE gang to inspect clearance' },
    ],
  },
  {
    id: 'HZ-1028',
    seeded: true,
    at: new Date(Date.now() - 420 * 60 * 1000).toISOString(),
    source: 'field',
    reporter: { name: 'Mahesh Babu', role: 'Gateman (LC-81)', portal: 'field' },
    lang: 'hi',
    description: 'समपार फाटक 81 पर रोड मेटल ट्रैक में फंस गया था, गैंग 2 द्वारा हटाकर लाइन क्लियर दी गई।',
    category: 'lc',
    severity: 'low',
    km: 208.5,
    line: 'UP',
    nearestStation: 'TDL',
    corridorId: 'NCR_NDLS_CNB',
    dept: 'SMMS',
    status: 'RESOLVED',
    history: [
      { at: new Date(Date.now() - 420 * 60 * 1000).toISOString(), by: 'Mahesh Babu', action: 'RECEIVED', note: 'Gateman call to SM Tundla' },
      { at: new Date(Date.now() - 390 * 60 * 1000).toISOString(), by: 'SM TDL', action: 'VERIFY', note: 'LC flangeway inspected and cleared by gang' },
      { at: new Date(Date.now() - 360 * 60 * 1000).toISOString(), by: 'Section Controller', action: 'RESOLVE', note: 'Flangeway cleared, speed normal' },
    ],
  },
  {
    id: 'HZ-1022',
    seeded: true,
    at: new Date(Date.now() - 600 * 60 * 1000).toISOString(),
    source: 'citizen',
    reporter: { name: 'Sunil Kumar', role: 'Citizen', portal: 'citizen' },
    lang: 'en',
    description: 'Ballast washing observed after heavy downpour near culvert at km 349 Phaphund.',
    category: 'track',
    severity: 'low',
    km: 349.1,
    line: 'DN',
    nearestStation: 'PHD',
    corridorId: 'NCR_NDLS_CNB',
    dept: 'TMS',
    status: 'RESOLVED',
    history: [
      { at: new Date(Date.now() - 600 * 60 * 1000).toISOString(), by: 'Sunil Kumar', action: 'RECEIVED', note: 'Citizen hazard submission' },
      { at: new Date(Date.now() - 540 * 60 * 1000).toISOString(), by: 'SSE/P-Way/PHD', action: 'VERIFY', note: 'Keyman inspected, culvert waterway clear' },
      { at: new Date(Date.now() - 480 * 60 * 1000).toISOString(), by: 'SSE/P-Way/PHD', action: 'RESOLVE', note: 'Track stable, ballast packing completed' },
    ],
  },
];

/** No seeded manual TSRs: speed restrictions in force come from the TMS register in the plan. */
export const SEED_TSRS: ManualTsr[] = [];

/** No seeded execution records: seeded history lives in the engine feed (snapshot.feeds.executionLog). */
export const SEED_EXECUTION_LOG: ExecRecord[] = [];

/** Demo BDMS requisitions so the planning cell inbox is not empty on first run (marked seeded: true). */
export const SEED_REQUISITIONS: Requisition[] = [
  {
    id: 'REQ-001',
    seeded: true,
    no: 'BDMS/TMS/2026/041',
    corridorId: 'NCR_NDLS_CNB',
    dept: 'TMS',
    workType: 'DEEP_SCREENING',
    line: 'DN',
    startKm: 142.2,
    endKm: 145.8,
    durationMin: 210,
    preferredDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    preferredWindow: 'night',
    machine: 'BCM',
    crew: 'PWAY_GANG',
    blockType: 'TRAFFIC',
    speedAfterKmph: 45,
    speedAfterDays: 7,
    gang: 'Unit 4 (Aligarh Section)',
    incharge: 'R. K. Meena (SSE/P-Way/ALJN)',
    remarks: 'Ballast fouling index exceeds 45%; high risk of rail pumping during monsoon.',
    status: 'SUBMITTED',
    validation: [],
    by: 'R. K. Meena',
    role: 'SSE/P-Way',
    at: new Date(Date.now() - 3600000 * 4).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    history: [
      { at: new Date(Date.now() - 3600000 * 4).toISOString(), by: 'R. K. Meena', action: 'SUBMITTED' }
    ],
  },
  {
    id: 'REQ-002',
    seeded: true,
    no: 'BDMS/SMMS/2026/028',
    corridorId: 'NCR_NDLS_CNB',
    dept: 'SMMS',
    workType: 'POINT_MACHINE_OVERHAUL',
    line: 'UP',
    startKm: 166.4,
    endKm: 166.6,
    durationMin: 90,
    preferredDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    preferredWindow: 'night',
    machine: null,
    crew: 'SIG_UNIT',
    blockType: 'DISCONNECTION',
    speedAfterKmph: null,
    incharge: 'D. K. Yadav (SSE/Sig/HRS)',
    remarks: 'Point 112A/B facing point lock inspection and cross-rod renewal.',
    status: 'SUBMITTED',
    validation: [],
    by: 'D. K. Yadav',
    role: 'SSE/Signal',
    at: new Date(Date.now() - 3600000 * 12).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    history: [
      { at: new Date(Date.now() - 3600000 * 12).toISOString(), by: 'D. K. Yadav', action: 'SUBMITTED' }
    ],
  },
  {
    id: 'REQ-003',
    seeded: true,
    no: 'BDMS/TDMS/2026/019',
    corridorId: 'NCR_NDLS_CNB',
    dept: 'TDMS',
    workType: 'CONTACT_WIRE_RENEWAL',
    line: 'DN',
    startKm: 210.1,
    endKm: 211.5,
    durationMin: 150,
    preferredDate: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
    preferredWindow: 'night',
    machine: 'TOWER_WAGON',
    crew: 'OHE_GANG',
    blockType: 'POWER',
    incharge: 'S. N. Tripathi (SSE/TRD/TDL)',
    remarks: 'Dropper re-spacing & insulator washing between km 210/12–211/24.',
    status: 'SUBMITTED',
    validation: [],
    by: 'S. N. Tripathi',
    role: 'SSE/TRD',
    at: new Date(Date.now() - 3600000 * 6).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 6).toISOString(),
    history: [
      { at: new Date(Date.now() - 3600000 * 6).toISOString(), by: 'S. N. Tripathi', action: 'SUBMITTED' }
    ],
  },
  {
    id: 'REQ-004',
    seeded: true,
    no: 'BDMS/TMS/2026/042',
    corridorId: 'NCR_NDLS_CNB',
    dept: 'TMS',
    workType: 'TURNOUT_RENEWAL',
    line: 'BOTH',
    startKm: 188.0,
    endKm: 188.4,
    durationMin: 240,
    preferredDate: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
    preferredWindow: 'night',
    machine: 'UNIMAT',
    crew: 'PWAY_GANG',
    blockType: 'INTEGRATED',
    speedAfterKmph: 30,
    speedAfterDays: 5,
    incharge: 'A. K. Srivastava (SSE/P-Way)',
    remarks: '1 in 12 CMS crossing replacement; requires S&T point motor disconnection.',
    status: 'RETURNED',
    validation: [],
    cellRemarks: 'Raise the matching S&T point machine disconnection with SMMS first, so both works can share one block.',
    by: 'A. K. Srivastava',
    role: 'SSE/P-Way',
    at: new Date(Date.now() - 3600000 * 24).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    history: [
      { at: new Date(Date.now() - 3600000 * 24).toISOString(), by: 'A. K. Srivastava', action: 'SUBMITTED' },
      { at: new Date(Date.now() - 3600000 * 8).toISOString(), by: 'Planning Cell', action: 'RETURNED' }
    ],
  },
  {
    id: 'REQ-005',
    seeded: true,
    no: 'BDMS/SMMS/2026/029',
    corridorId: 'NCR_NDLS_CNB',
    dept: 'SMMS',
    workType: 'TRACK_CIRCUIT_REPAIR',
    line: 'DN',
    startKm: 131.0,
    endKm: 131.5,
    durationMin: 60,
    preferredDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    preferredWindow: 'day',
    machine: null,
    crew: 'SIG_UNIT',
    blockType: 'DISCONNECTION',
    incharge: 'M. P. Sharma (SSE/Sig)',
    remarks: 'G33 insulation joint replacement in yard.',
    status: 'DRAFT',
    validation: [],
    by: 'M. P. Sharma',
    role: 'SSE/Signal',
    at: new Date(Date.now() - 3600000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    history: [
      { at: new Date(Date.now() - 3600000 * 2).toISOString(), by: 'M. P. Sharma', action: 'DRAFT' }
    ],
  },
];

/* ───────────────────────── store ───────────────────────── */

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      /* session */
      user: null,
      login: (u) => {
        set({ user: u });
        get().addAudit({ action: 'SIGN_IN', entityType: 'user', entityId: u.id, detail: `${u.name} signed in to the ${u.portal} portal`, by: u.name, role: u.role });
      },
      logout: () => {
        const u = get().user;
        if (u) get().addAudit({ action: 'SIGN_OUT', entityType: 'user', entityId: u.id, by: u.name, role: u.role });
        set({ user: null });
      },

      /* settings */
      theme: 'light',
      setTheme: (t) => {
        set({ theme: t });
        document.documentElement.setAttribute('data-theme', t);
      },
      language: 'en',
      setLanguage: (l) => set({ language: l }),
      corridorId: DEFAULT_CORRIDOR,
      setCorridor: (id) => {
        const s = get();
        if (id === s.corridorId) return;
        const impact = s.corridorSwitchImpact();
        // approvals, execution records, forms, power blocks, the scenario (with its machine removals),
        // pins / closures and extensions all belong to the corridor being left
        set({ corridorId: id, approvals: {}, executionLog: [], forms: {}, powerBlocks: {}, candidate: null, pinnedTaskIds: [], excludedTaskIds: [], handoverNotes: {}, dataIssueStatus: {}, scenario: null, extensions: [] });
        get().addAudit({
          action: 'CORRIDOR_CHANGED',
          entityType: 'settings',
          entityId: id,
          detail: `from ${s.corridorId} · cleared ${impact.approvals} approvals, ${impact.executionRecords} execution records, ${impact.forms} forms${impact.scenario ? `, scenario "${s.scenario?.name ?? ''}"` : ''}${impact.machineRemovals ? `, ${impact.machineRemovals} machine removals` : ''}`,
        });
        void get().runPlan({ reason: 'corridor changed' });
      },
      corridorSwitchImpact: () => {
        const s = get();
        const list = Object.values(s.approvals);
        return {
          approvals: list.length,
          sentOrHeld: list.filter((a) => !!a.proposedAt || a.status !== 'PROPOSED').length,
          granted: list.filter((a) => a.status === 'GRANTED' || a.status === 'LOCKED').length,
          executionRecords: s.executionLog.length,
          forms: Object.keys(s.forms).length,
          powerBlocks: Object.keys(s.powerBlocks).length,
          extensions: s.extensions.length,
          handoverNotes: Object.keys(s.handoverNotes).length,
          scenario: !!s.scenario,
          machineRemovals: s.scenario?.scenario.removeMachines?.length ?? 0,
          pinned: s.pinnedTaskIds.length,
          excluded: s.excludedTaskIds.length,
        };
      },
      deviceNotifications: false,
      enableDeviceNotifications: async () => {
        if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'unsupported';
        let p: NotificationPermission = Notification.permission;
        if (p === 'default') {
          try {
            p = await Notification.requestPermission();
          } catch {
            p = Notification.permission;
          }
        }
        set({ deviceNotifications: p === 'granted' });
        get().addAudit({ action: p === 'granted' ? 'DEVICE_NOTIFICATIONS_ON' : 'DEVICE_NOTIFICATIONS_DENIED', entityType: 'settings', entityId: 'deviceNotifications', detail: `Browser permission: ${p}` });
        return p;
      },
      disableDeviceNotifications: () => {
        set({ deviceNotifications: false });
        get().addAudit({ action: 'DEVICE_NOTIFICATIONS_OFF', entityType: 'settings', entityId: 'deviceNotifications' });
      },
      audioMuted: true,
      setAudioMuted: (m) => set({ audioMuted: m }),
      preloaderSeen: false,
      setPreloaderSeen: (v) => set({ preloaderSeen: v }),
      homeStation: null,
      setHomeStation: (s) => set({ homeStation: s }),
      savedTrains: [],
      toggleSavedTrain: (n) => set({ savedTrains: get().savedTrains.includes(n) ? get().savedTrains.filter((x) => x !== n) : [...get().savedTrains, n] }),
      lastTrainNo: null,
      setLastTrainNo: (n) => set({ lastTrainNo: n }),
      citizenName: '',
      setCitizenName: (n) => set({ citizenName: n }),
      myReportIds: [],

      /* planning parameters */
      solver: 'milp',
      setSolver: (sv) => {
        set({ solver: sv });
        get().addAudit({ action: 'SOLVER_SET', entityType: 'plan', entityId: sv, detail: sv === 'milp' ? 'Exact MILP (HiGHS) + simulated annealing polish' : 'Greedy + simulated annealing' });
      },
      importedFeeds: {},
      importFeed: (system, batch) => {
        const at = now();
        set({ importedFeeds: { ...get().importedFeeds, [system]: { ...batch, at } } });
        get().addAudit({ action: 'FEED_IMPORTED', entityType: 'feed', entityId: system.toUpperCase(), detail: `${batch.records.length} record(s) from ${batch.fileName} (${batch.mode}); ${batch.rejected} rejected` });
      },
      clearImportedFeed: (system) => {
        const next = { ...get().importedFeeds };
        delete next[system];
        set({ importedFeeds: next });
        get().addAudit({ action: 'FEED_IMPORT_CLEARED', entityType: 'feed', entityId: system.toUpperCase() });
      },
      weatherOverride: null,
      setWeatherOverride: (w) => {
        set({ weatherOverride: w });
        get().addAudit({ action: w ? 'WEATHER_FORECAST_APPLIED' : 'WEATHER_FORECAST_CLEARED', entityType: 'feed', entityId: 'WEATHER', detail: w ? `${w.days.length} day(s) from ${w.source} for ${w.corridorId}` : undefined });
      },
      weights: { ...(DEFAULT_WEIGHTS as Weights) },
      rules: { ...(RULES as Rules) },
      iterations: DEFAULT_ITERATIONS,
      scenario: null,
      pinnedTaskIds: [],
      excludedTaskIds: [],
      setWeights: (w) => set({ weights: { ...get().weights, ...w } }),
      setRules: (r) => set({ rules: { ...get().rules, ...r } }),
      setIterations: (n) => set({ iterations: Math.max(500, Math.min(20000, Math.round(n))) }),
      resetTuning: () => set({ weights: { ...(DEFAULT_WEIGHTS as Weights) }, rules: { ...(RULES as Rules) }, iterations: DEFAULT_ITERATIONS }),
      setScenario: (s) => {
        set({ scenario: s });
        get().addAudit({ action: s ? 'SCENARIO_APPLIED' : 'SCENARIO_CLEARED', entityType: 'plan', entityId: s?.presetId ?? 'none', detail: s?.name });
      },
      pinTask: (id) => {
        if (get().pinnedTaskIds.includes(id)) return;
        set({ pinnedTaskIds: [...get().pinnedTaskIds, id] });
        get().addAudit({ action: 'TASK_PINNED', entityType: 'task', entityId: id, detail: 'Raised to the mandatory floor for the next run' });
      },
      unpinTask: (id) => set({ pinnedTaskIds: get().pinnedTaskIds.filter((x) => x !== id) }),
      excludeTask: (id, reason) => {
        if (get().excludedTaskIds.includes(id)) return;
        set({ excludedTaskIds: [...get().excludedTaskIds, id] });
        get().addAudit({ action: 'TASK_CLOSED', entityType: 'task', entityId: id, detail: reason });
      },
      includeTask: (id) => set({ excludedTaskIds: get().excludedTaskIds.filter((x) => x !== id) }),

      /* data quality issues */
      dataIssueStatus: {},
      assignDataIssue: (issueKey, dept) => {
        set((s) => ({
          dataIssueStatus: {
            ...s.dataIssueStatus,
            [issueKey]: { state: 'ASSIGNED', assignedTo: dept },
          },
        }));
        get().addAudit({ action: 'ISSUE_ASSIGNED', entityType: 'plan', entityId: issueKey, detail: dept });
      },
      resolveDataIssue: (issueKey) => {
        set((s) => ({
          dataIssueStatus: {
            ...s.dataIssueStatus,
            [issueKey]: { state: 'RESOLVED', assignedTo: s.dataIssueStatus[issueKey]?.assignedTo ?? null, resolvedAt: now() },
          },
        }));
        get().addAudit({ action: 'ISSUE_RESOLVED', entityType: 'plan', entityId: issueKey });
      },

      /* joint blocks */
      acceptJointBlock: async ({ task, block }) => {
        const s = get();
        const spec: InjectSpec = {
          sourceId: `JOINT/${task.id}/${block.id}`,
          label: `${task.label} (joint block)`,
          workType: task.workType,
          line: block.line === 'BOTH' ? (task.line === 'BOTH' ? 'DN' : task.line) : block.line,
          startKm: task.startKm,
          endKm: task.endKm,
          daysOverdue: task.daysOverdue,
          tsrKmph: task.tsrKmph,
          groupId: block.id,
          targetBlock: {
            day: block.day,
            line: block.line,
            start: block.start,
            end: block.end,
          },
          note: `Joint block with ${block.departments.join(' + ')} (${block.id})`,
        };
        const excludedTaskIds = s.excludedTaskIds.includes(task.id) ? s.excludedTaskIds : [...s.excludedTaskIds, task.id];
        const currentScenario = s.scenario?.scenario ?? {};
        const injectTasks = [...(currentScenario.injectTasks ?? []).filter((it) => it.sourceId !== spec.sourceId), spec];
        const newScenario: ScenarioState = {
          presetId: s.scenario?.presetId ?? null,
          name: s.scenario?.name ? `${s.scenario.name} + Joint ${task.id}` : `Joint ${task.id} into ${block.id}`,
          params: s.scenario?.params ?? {},
          scenario: {
            ...currentScenario,
            injectTasks,
          },
        };
        set({
          excludedTaskIds,
          scenario: newScenario,
        });
        get().addAudit({ action: 'JOINT_BLOCK_ACCEPTED', entityType: 'task', entityId: task.id, detail: `Co-located into ${block.id}` });
        await get().runPlan({ reason: `Joint block accepted: ${task.id} into ${block.id}` });
      },

      intakeTasks: [],
      addIntakeTask: (t) => {
        // every intake belongs to a corridor (the active one unless the caller says otherwise)
        const corridorId = t.corridorId ?? t.spec.corridorId ?? get().corridorId;
        const task: IntakeTask = { ...t, spec: { ...t.spec, corridorId }, corridorId, id: `INTAKE-${short()}`, at: now() };
        set({ intakeTasks: [...get().intakeTasks, task] });
        get().addAudit({ action: 'DEMAND_RAISED', entityType: 'task', entityId: task.id, detail: `${task.label} (${task.source})` });
        return task;
      },
      removeIntakeTask: (id) => {
        set({ intakeTasks: get().intakeTasks.filter((t) => t.id !== id) });
        get().addAudit({ action: 'DEMAND_WITHDRAWN', entityType: 'task', entityId: id });
      },

      /* engine */
      snapshot: null,
      planStatus: 'idle',
      planProgress: '',
      planError: null,
      planVersion: 0,
      lastPlannedAt: null,
      previousResult: null,
      pendingRerun: false,

      runPlan: async (opts) => {
        const s = get();
        if (s.planStatus === 'running') {
          set({ pendingRerun: true });
          return;
        }
        const prev = s.snapshot;
        const previousResult: PreviousResult | null = prev
          ? { kpis: prev.result.weekly.kpis, baseKpis: prev.result.weekly.baseKpis, delta: prev.result.weekly.delta, scenarioName: prev.scenario?.name ?? null, blockCount: prev.result.weekly.kpis.blockCount }
          : s.previousResult;
        set({ planStatus: 'running', planProgress: 'Starting the planning engine', planError: null, previousResult });
        const req = buildRequest(s);
        try {
          const snapshot = await runPlanInWorker(req, (m) => set({ planProgress: m.text }));
          set({ snapshot, planStatus: 'ready', planProgress: 'Plan ready', planVersion: get().planVersion + 1, lastPlannedAt: now() });
          reconcileAfterPlan(get, set, snapshot, !!opts?.silent);
          if (!opts?.silent) get().addAudit({ action: 'PLAN_COMPUTED', entityType: 'plan', entityId: snapshot.corridor.code, detail: `${opts?.reason ?? 're-plan'} · ${snapshot.result.weekly.kpis.blockCount} possessions · ${(snapshot.timing.ms / 1000).toFixed(1)} s` });
          // a block concurred / granted / locked / started while the engine ran was not held fixed: run again
          const heldKey = (fb: FixedBlockConstraint[] | undefined) => (fb ?? []).map((f) => `${f.day}|${f.line}|${f.start}|${f.end}|${[...f.taskIds].sort().join(',')}`).sort().join(';');
          if (heldKey(buildRequest(get()).fixedBlocks) !== heldKey(req.fixedBlocks) && snapshot.corridor.id === get().corridorId) set({ pendingRerun: true });
        } catch (e) {
          set({ planStatus: 'error', planError: (e as Error).message });
        }
        if (get().pendingRerun) {
          set({ pendingRerun: false });
          void get().runPlan({ reason: 'queued re-plan', silent: opts?.silent });
        }
      },

      candidate: null,
      candidateStatus: 'idle',
      candidateProgress: '',
      candidateError: null,
      runCandidate: async (patch, reason) => {
        const s = get();
        if (s.candidateStatus === 'running') return;
        set({ candidateStatus: 'running', candidateProgress: 'Starting candidate run', candidateError: null });
        try {
          const snapshot = await runPlanInWorker(buildRequest(s, patch), (m) => set({ candidateProgress: m.text }));
          set({ candidate: { snapshot, patch, reason, at: now() }, candidateStatus: 'idle', candidateProgress: 'Candidate ready' });
          get().addAudit({ action: 'CANDIDATE_COMPUTED', entityType: 'plan', entityId: snapshot.corridor.code, detail: reason });
        } catch (e) {
          set({ candidateStatus: 'error', candidateError: (e as Error).message });
        }
      },
      promoteCandidate: () => {
        const c = get().candidate;
        if (!c) return;
        const s = get();
        const previousResult: PreviousResult | null = s.snapshot
          ? { kpis: s.snapshot.result.weekly.kpis, baseKpis: s.snapshot.result.weekly.baseKpis, delta: s.snapshot.result.weekly.delta, scenarioName: s.snapshot.scenario?.name ?? null, blockCount: s.snapshot.result.weekly.kpis.blockCount }
          : s.previousResult;
        set({
          snapshot: c.snapshot,
          planStatus: 'ready',
          planVersion: s.planVersion + 1,
          lastPlannedAt: now(),
          previousResult,
          weights: { ...s.weights, ...(c.patch.weights ?? {}) },
          rules: { ...s.rules, ...(c.patch.rules ?? {}) },
          iterations: c.patch.iterations ?? s.iterations,
          scenario: c.patch.scenario === undefined ? s.scenario : c.patch.scenario,
          pinnedTaskIds: c.patch.pinnedTaskIds ?? s.pinnedTaskIds,
          excludedTaskIds: c.patch.excludedTaskIds ?? s.excludedTaskIds,
          candidate: null,
        });
        reconcileAfterPlan(get, set, c.snapshot);
        get().addAudit({ action: 'WORKING_PLAN_UPDATED', entityType: 'plan', entityId: c.snapshot.corridor.code, detail: `${c.reason} · ${c.snapshot.result.weekly.kpis.blockCount} possessions` });
      },
      discardCandidate: () => set({ candidate: null, candidateStatus: 'idle', candidateError: null }),

      /* JPO workflow */
      approvals: {},
      proposeBlocks: (ids) => {
        const s = get();
        const u = s.user;
        if (!u) { deny(get, 'signIn'); return 0; }
        if (!can(u, 'plan')) { deny(get, 'noPlan'); return 0; }
        const at = now();
        const next = { ...s.approvals };
        const sent: string[] = [];
        const replaced: string[] = [];
        for (const id of ids) {
          const { raw, a, state } = blockCtx(s, id);
          // only drafts and refused blocks can be (re)sent; a block must exist in the current plan
          if (!raw || !(state === 'DRAFT' || state === 'REFUSED')) continue;
          const base = a ?? emptyApproval();
          next[id] = { ...base, status: 'PROPOSED', proposedBy: u.name, proposedAt: at, supersededAt: undefined, geometry: captureGeometry(raw, base.override, at) };
          sent.push(id);
          // a superseded proposal for any of these works is replaced by the new block
          for (const [oid, oa] of Object.entries(next)) {
            if (oid === id || !oa.supersededAt || oa.status !== 'PROPOSED' || !oa.geometry) continue;
            if (oa.geometry.taskIds.some((t) => raw.tasks.some((x) => x.id === t))) {
              delete next[oid];
              replaced.push(oid);
            }
          }
        }
        if (!sent.length) return 0;
        set({ approvals: next });
        get().addAudit({ action: 'SENT_TO_CONTROL', entityType: 'plan', entityId: `${sent.length} blocks`, detail: `${sent.slice(0, 6).join(', ')}${replaced.length ? ` · replaces superseded ${replaced.join(', ')}` : ''}` });
        return sent.length;
      },
      concur: (blockId, dept, note) => {
        const s = get();
        const u = s.user;
        if (!u) return deny(get, 'signIn');
        const own = can(u, `concur:${dept}` as Capability);
        const onBehalf = !own && can(u, 'plan');
        if (!own && !onBehalf) return deny(get, 'noConcur', { dept });
        if (onBehalf && !note?.trim()) return deny(get, 'onBehalfNote', { dept });
        const { raw, a, departments, state } = blockCtx(s, blockId);
        const open = checkConcurOpen(get, blockId, state);
        if (!open || !a) return false;
        if (departments.length && !departments.includes(dept)) return deny(get, 'deptNotIn', { dept, id: blockId });
        const at = now();
        const next: Approval = { ...a, concur: { ...a.concur, [dept]: { by: u.name, at, note: onBehalf ? `On behalf · ${note}` : note } }, objections: a.objections.filter((o) => o.dept !== dept) };
        if (raw) next.geometry = captureGeometry(raw, a.override, at);
        set({ approvals: { ...s.approvals, [blockId]: next } });
        get().addAudit({ action: `CONCUR_${dept}`, entityType: 'block', entityId: blockId, detail: `${dept} concurrence${onBehalf ? ' recorded on behalf by the planning cell' : ''}${note ? ` · ${note}` : ''}` });
        return true;
      },
      object: (blockId, dept, reason) => {
        const s = get();
        const u = s.user;
        if (!u) return deny(get, 'signIn');
        if (!can(u, `concur:${dept}` as Capability)) return deny(get, 'noConcur', { dept });
        const { raw, a, departments, state } = blockCtx(s, blockId);
        if (!checkConcurOpen(get, blockId, state) || !a) return false;
        if (departments.length && !departments.includes(dept)) return deny(get, 'deptNotIn', { dept, id: blockId });
        const at = now();
        const { [dept]: _removed, ...rest } = a.concur;
        const next: Approval = { ...a, concur: rest, objections: [...a.objections, { dept, by: u.name, at, reason }] };
        if (raw) next.geometry = captureGeometry(raw, a.override, at);
        set({ approvals: { ...s.approvals, [blockId]: next } });
        get().addAudit({ action: `OBJECTION_${dept}`, entityType: 'block', entityId: blockId, detail: reason });
        get().notify({ portals: ['planning', 'control'], kind: 'WARNING', title: `Objection on ${blockId} from ${dept}`, body: reason, route: `/app/planning/handoff?block=${blockId}` });
        return true;
      },
      grant: (blockId, override) => {
        const s = get();
        const u = s.user;
        if (!u) return deny(get, 'signIn');
        if (!can(u, 'grant')) return deny(get, 'noGrant');
        const { raw, a, departments, state } = blockCtx(s, blockId);
        if (!raw || !a) return deny(get, state === 'DRAFT' && raw ? 'notSent' : 'notInPlan', { id: blockId });
        if (state === 'SUPERSEDED') return deny(get, 'superseded', { id: blockId });
        if (state === 'PROPOSED') return deny(get, 'notConcurred', { id: blockId, missing: departments.filter((d) => !a.concur[d]).join(', ') });
        if (state !== 'CONCURRED') return deny(get, state === 'DRAFT' ? 'notSent' : 'grantState', { id: blockId, state: stateWord(get, state) });
        if (override && !(override.start >= 0 && override.end <= 1440 && override.end > override.start)) return deny(get, 'badWindow');
        const at = now();
        const next: Approval = { ...a, status: 'GRANTED', grantedBy: u.name, grantedAt: at };
        if (override) next.override = { ...override, by: u.name, at };
        next.geometry = captureGeometry(raw, next.override, at);
        set({ approvals: { ...s.approvals, [blockId]: next } });
        const win = `${hhmm(next.geometry.start)}–${hhmm(next.geometry.end)}`;
        get().addAudit({ action: override ? 'BLOCK_GRANTED_WITH_CHANGE' : 'BLOCK_GRANTED', entityType: 'block', entityId: blockId, detail: override ? `Window changed to ${win}` : `Possession granted by Control · ${win}` });
        get().notify({ portals: ['planning', ...deptPortals(departments), 'field'], kind: 'OK', title: `Block ${blockId} granted`, body: `${raw.sectionText} ${raw.line} · ${raw.dateLabel} ${win}${override ? ' (window changed by Control)' : ''}`, route: `/app/planning/weekly?block=${blockId}` });
        return true;
      },
      refuse: (blockId, reason) => {
        const s = get();
        const u = s.user;
        if (!u) return deny(get, 'signIn');
        if (!can(u, 'grant')) return deny(get, 'noGrant');
        const { raw, a, departments, state } = blockCtx(s, blockId);
        if (!a || !(state === 'PROPOSED' || state === 'CONCURRED')) return deny(get, state === 'DRAFT' ? 'notSent' : 'refuseState', { id: blockId, state: stateWord(get, state) });
        const at = now();
        const next: Approval = { ...a, status: 'REFUSED', refusal: { reason, count: (a.refusal?.count ?? 0) + 1, by: u.name, at } };
        if (raw) next.geometry = captureGeometry(raw, a.override, at);
        set({ approvals: { ...s.approvals, [blockId]: next } });
        get().addAudit({ action: 'BLOCK_REFUSED', entityType: 'block', entityId: blockId, detail: reason });
        get().notify({ portals: ['planning', ...deptPortals(departments)], kind: 'WARNING', title: `Block ${blockId} refused by Control`, body: reason, route: `/app/planning/weekly?block=${blockId}` });
        return true;
      },
      lock: (blockId) => get().lockBlocks([blockId]) === 1,
      lockBlocks: (ids) => {
        const s = get();
        const u = s.user;
        if (!u) { deny(get, 'signIn'); return 0; }
        if (!can(u, 'lock')) { deny(get, 'noLock'); return 0; }
        const at = now();
        const next = { ...s.approvals };
        const locked: { id: string; raw: Block | null; departments: Dept[]; geometry: BlockGeometry | undefined }[] = [];
        for (const id of ids) {
          const { raw, a, departments, state } = blockCtx(s, id);
          if (!a || state !== 'GRANTED') {
            if (ids.length === 1) deny(get, 'lockState', { id, state: stateWord(get, state) });
            continue;
          }
          const geometry = raw ? captureGeometry(raw, a.override, at) : a.geometry;
          next[id] = { ...a, status: 'LOCKED', lockedBy: u.name, lockedAt: at, geometry };
          locked.push({ id, raw, departments, geometry });
        }
        if (!locked.length) return 0;
        set({ approvals: next });
        for (const l of locked) {
          const g = l.geometry;
          get().addAudit({ action: 'BLOCK_LOCKED', entityType: 'block', entityId: l.id, detail: `Locked into the COA working time table${g ? ` · ${g.date ?? `day ${g.day}`} ${hhmm(g.start)}–${hhmm(g.end)}` : ''}` });
        }
        // one notification per addressee group: the departments in the locked blocks, field and planning
        const depts = [...new Set(locked.flatMap((l) => l.departments))];
        const first = locked[0];
        const when = first.raw?.dateLabel ?? first.geometry?.date ?? '';
        const title = locked.length === 1 ? `Block ${first.id} locked for ${when}` : `${locked.length} blocks locked for ${[...new Set(locked.map((l) => l.raw?.dateLabel ?? l.geometry?.date ?? ''))].join(', ')}`;
        const body = locked
          .slice(0, 3)
          .map((l) => `${l.raw?.sectionText ?? l.id} ${l.geometry ? `${hhmm(l.geometry.start)}–${hhmm(l.geometry.end)}` : ''}`.trim())
          .join(' · ');
        get().notify({ portals: [...deptPortals(depts), 'field', 'planning'], kind: 'OK', title, body, route: locked.length === 1 ? `/app/planning/weekly?block=${first.id}` : '/app/planning/handoff' });
        return locked.length;
      },
      setIncharge: (blockId, name) => {
        const u = get().user;
        if (!u) return deny(get, 'signIn');
        if (!RESOURCE_CAPS.some((c) => can(u, c))) return deny(get, 'noResources');
        const a = get().approvals[blockId] ?? emptyApproval();
        set({ approvals: { ...get().approvals, [blockId]: { ...a, incharge: name } } });
        get().addAudit({ action: 'INCHARGE_SET', entityType: 'block', entityId: blockId, detail: name });
        return true;
      },
      setResources: (blockId, r) => {
        const s = get();
        const u = s.user;
        if (!u) return deny(get, 'signIn');
        if (!RESOURCE_CAPS.some((c) => can(u, c))) return deny(get, 'noResources');
        // refuse a machine or gang that is already working in an overlapping block
        const clash = resourceClash(workingBlocks(s.snapshot, s.approvals), s.approvals, blockId, r);
        if (clash) {
          const label = clash.kind === 'MACHINE' ? s.snapshot?.feeds.machines.find((m) => m.id === clash.resourceId)?.label : s.snapshot?.feeds.crews.find((c) => c.id === clash.resourceId)?.label;
          return deny(get, 'clash', { res: label ?? clash.resourceId, other: clash.otherBlockId, window: `${hhmm(clash.otherStart)}–${hhmm(clash.otherEnd)}` });
        }
        const a = s.approvals[blockId] ?? emptyApproval();
        set({ approvals: { ...s.approvals, [blockId]: { ...a, resources: { ...(a.resources ?? {}), ...r } } } });
        get().addAudit({ action: 'RESOURCES_ASSIGNED', entityType: 'block', entityId: blockId, detail: [r.machineId, r.crewId].filter(Boolean).join(' · ') || 'Back to the planned allocation' });
        return true;
      },
      resetApprovals: () => set({ approvals: {} }),
      handoverNotes: {},
      setHandoverNote: (date, note) => set({ handoverNotes: { ...get().handoverNotes, [date]: note } }),

      /* forms, TSRs, power blocks */
      forms: {},
      setFormStatus: (formId, status, reason) => {
        const u = get().user;
        set({ forms: { ...get().forms, [formId]: { status, by: u?.name ?? 'Unknown', at: now(), reason } } });
        get().addAudit({ action: `FORM_${status}`, entityType: 'form', entityId: formId, detail: reason });
        if (status === 'ISSUED') get().notify({ portals: ['field', 'control'], kind: 'INFO', title: `${formId} issued`, body: reason ?? 'Caution / disconnection form issued', route: '/app/field/caution' });
      },
      tsrs: SEED_TSRS,
      addTsr: (t) => {
        const u = get().user;
        const tsr: ManualTsr = { ...t, id: `TSR-${short()}`, since: now(), by: u?.name ?? 'Unknown' };
        set({ tsrs: [tsr, ...get().tsrs] });
        get().addAudit({ action: tsr.status === 'IN_FORCE' ? 'TSR_IMPOSED' : 'TSR_PROPOSED', entityType: 'tsr', entityId: tsr.id, detail: `${tsr.kmph} km/h km ${tsr.fromKm}–${tsr.toKm} ${tsr.line} · ${tsr.reason}` });
        get().notify({ portals: ['control', 'field', 'tms', 'planning'], kind: tsr.status === 'IN_FORCE' ? 'CRITICAL' : 'WARNING', title: tsr.status === 'IN_FORCE' ? `TSR ${tsr.kmph} km/h in force` : `TSR ${tsr.kmph} km/h proposed`, body: `km ${tsr.fromKm}–${tsr.toKm} ${tsr.line} · ${tsr.reason}`, route: '/app/control/caution' });
        return tsr;
      },
      updateTsr: (id, patch) => {
        set({ tsrs: get().tsrs.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
        get().addAudit({ action: patch.status ? `TSR_${patch.status}` : 'TSR_UPDATED', entityType: 'tsr', entityId: id, detail: patch.relaxationRequested ? 'Relaxation requested' : patch.status });
      },
      powerBlocks: {},
      setPowerBlock: (blockId, status) => {
        const u = get().user;
        set({ powerBlocks: { ...get().powerBlocks, [blockId]: { status, by: u?.name ?? 'Unknown', at: now() } } });
        get().addAudit({ action: `POWER_${status}`, entityType: 'block', entityId: blockId, detail: status === 'DEENERGISED' ? 'OHE de-energised, permit to work in force' : status === 'ENERGISED' ? 'OHE re-energised' : 'Isolation pending' });
      },

      /* programme approvals */
      rbp: { monthly: { status: 'DRAFT' }, rolling: { status: 'DRAFT' } },
      submitRbp: (kind) => {
        const u = get().user;
        set({ rbp: { ...get().rbp, [kind]: { status: 'SUBMITTED', by: u?.name ?? 'Planning cell', at: now() } } });
        get().addAudit({ action: 'RBP_SUBMITTED', entityType: 'rbp', entityId: kind });
        get().notify({ portals: ['division'], kind: 'ACTION', title: `${kind === 'monthly' ? 'Monthly plan' : '26-week programme'} submitted for approval`, body: `By ${u?.name ?? 'Planning cell'}`, route: '/app/division/programme' });
      },
      decideRbp: (kind, decision, remarks) => {
        const u = get().user;
        set({ rbp: { ...get().rbp, [kind]: { status: decision, by: u?.name ?? 'DRM', at: now(), remarks } } });
        get().addAudit({ action: `RBP_${decision}`, entityType: 'rbp', entityId: kind, detail: remarks });
        get().notify({ portals: ['planning', 'tms', 'smms', 'tdms'], kind: decision === 'APPROVED' ? 'OK' : 'WARNING', title: `${kind === 'monthly' ? 'Monthly plan' : '26-week programme'} ${decision.toLowerCase()} by DRM`, body: remarks ?? '', route: '/app/planning/monthly' });
      },
      jpoNotices: {},
      markJpoServed: (taskId) => {
        const u = get().user;
        set({ jpoNotices: { ...get().jpoNotices, [taskId]: { by: u?.name ?? 'Unknown', at: now() } } });
        get().addAudit({ action: 'JPO_NOTICE_SERVED', entityType: 'task', entityId: taskId, detail: '10-week notice recorded' });
      },
      escalations: [],
      escalate: (e) => {
        const u = get().user;
        const esc: Escalation = { ...e, id: `ESC-${short()}`, at: now(), by: u?.name ?? 'System' };
        set({ escalations: [esc, ...get().escalations] });
        get().addAudit({ action: 'ESCALATED', entityType: 'escalation', entityId: esc.id, detail: `${esc.kind} · ${esc.ref} · ${esc.note}` });
        get().notify({ portals: ['division'], kind: 'ACTION', title: `Escalation: ${esc.ref}`, body: esc.note, route: '/app/division/escalations' });
      },
      reviewEscalation: (id) => {
        const u = get().user;
        set({ escalations: get().escalations.map((e) => (e.id === id ? { ...e, reviewed: { by: u?.name ?? 'DRM', at: now() } } : e)) });
        get().addAudit({ action: 'ESCALATION_REVIEWED', entityType: 'escalation', entityId: id });
      },
      directions: [],
      direct: (dept, note) => {
        const u = get().user;
        const d: Direction = { id: `DIR-${short()}`, dept, note, by: u?.name ?? 'DRM', at: now() };
        set({ directions: [d, ...get().directions] });
        get().addAudit({ action: 'DIRECTION_ISSUED', entityType: 'direction', entityId: d.id, detail: `${dept}: ${note}` });
        const portals: PortalId[] = dept === 'ALL' ? ['tms', 'smms', 'tdms', 'planning', 'control'] : [dept.toLowerCase() as PortalId];
        get().notify({ portals, kind: 'ACTION', title: `Direction from ${d.by}`, body: note });
      },

      /* audit */
      audit: [],
      addAudit: (e) => {
        const u = get().user;
        const entry: AuditEntry = { id: uid(), at: now(), by: e.by ?? u?.name ?? 'System', role: e.role ?? u?.role ?? 'SYSTEM', action: e.action, entityType: e.entityType, entityId: e.entityId, detail: e.detail };
        set({ audit: [entry, ...get().audit].slice(0, 800) });
      },

      /* execution */
      executionLog: SEED_EXECUTION_LOG,
      startPossession: (rec) => {
        const s = get();
        const u = s.user;
        if (!u) return deny(get, 'signIn');
        if (!can(u, 'execute')) return deny(get, 'noExecute');
        const { raw, a, state } = blockCtx(s, rec.blockId);
        if (!(state === 'GRANTED' || state === 'LOCKED') || !a) return deny(get, 'notGranted', { id: rec.blockId });
        if (s.executionLog.some((r) => r.blockId === rec.blockId)) return deny(get, 'alreadyStarted', { id: rec.blockId });
        // work-only planned minutes per task (the seeded history's basis), never the block window
        const tasks = new Map((s.snapshot?.tasks ?? []).map((t) => [t.id, t]));
        const items = rec.items.map((it) => ({ ...it, ...workOnlyMinutes(tasks.get(it.taskId), it.plannedMin) }));
        const at = now();
        set({ executionLog: [{ ...rec, items, status: 'IN_PROGRESS', by: u.name, source: rec.source ?? 'field', updatedAt: at }, ...s.executionLog] });
        // the started block is held fixed on the next re-plan at its current geometry
        if (raw && !a.geometry) set({ approvals: { ...get().approvals, [rec.blockId]: { ...a, geometry: captureGeometry(raw, a.override, at) } } });
        get().addAudit({ action: 'POSSESSION_STARTED', entityType: 'block', entityId: rec.blockId, detail: `Actual start ${hhmm(rec.actualStart)}${rec.source === 'control' ? ' (recorded by Control)' : ''}` });
        get().notify({ portals: ['control', 'planning'], kind: 'INFO', title: `Possession started · ${rec.blockId}`, body: `${rec.sectionText} ${rec.line} — gang on site at ${hhmm(rec.actualStart)}`, route: `/app/control/blocks?block=${rec.blockId}` });
        return true;
      },
      markItemDone: (blockId, taskId, actualMin, remarks) => {
        const s = get();
        const u = s.user;
        if (!u) return deny(get, 'signIn');
        if (!can(u, 'execute')) return deny(get, 'noExecute');
        if (!s.executionLog.some((r) => r.blockId === blockId && r.items.some((it) => it.taskId === taskId))) return deny(get, 'notStarted', { id: blockId });
        const task = s.snapshot?.tasks.find((t) => t.id === taskId);
        set({
          executionLog: s.executionLog.map((r) =>
            r.blockId !== blockId
              ? r
              : {
                  ...r,
                  updatedAt: now(),
                  // records made before work-only minutes existed are corrected from the plan here
                  items: r.items.map((it) => (it.taskId === taskId ? { ...it, ...(it.baseMin === undefined && task ? workOnlyMinutes(task, it.plannedMin) : {}), done: true, actualMin, remarks } : it)),
                }
          ),
        });
        get().addAudit({ action: 'WORK_COMPLETED', entityType: 'task', entityId: taskId, detail: `${actualMin} min actual${remarks ? ` · ${remarks}` : ''}` });
        return true;
      },
      clearPossession: (blockId, data) => {
        const s = get();
        const u = s.user;
        if (!u) return deny(get, 'signIn');
        if (!can(u, 'execute')) return deny(get, 'noExecute');
        if (!s.executionLog.some((r) => r.blockId === blockId && r.status === 'IN_PROGRESS')) return deny(get, 'notStarted', { id: blockId });
        set({
          executionLog: s.executionLog.map((r) => {
            if (r.blockId !== blockId) return r;
            const start = r.actualStart ?? r.plannedStart;
            return { ...r, status: 'COMPLETED', actualEnd: data.actualEnd, actualSpanMin: Math.max(0, data.actualEnd - start), overrunCause: data.overrunCause, speedOnLifting: data.speedOnLifting ?? null, source: data.source ?? r.source, updatedAt: now() };
          }),
        });
        get().addAudit({ action: 'POSSESSION_CLEARED', entityType: 'block', entityId: blockId, detail: data.speedOnLifting ? `Line handed back with ${data.speedOnLifting} km/h restriction` : 'Line handed back at normal speed' });
        get().notify({ portals: ['control', 'planning'], kind: 'OK', title: `Line clear · ${blockId}`, body: data.speedOnLifting ? `Fit for ${data.speedOnLifting} km/h` : 'Fit for full speed', route: `/app/control/execution` });
        return true;
      },
      resetExecution: () => set({ executionLog: [] }),

      extensions: [],
      requestExtension: (blockId, req) => {
        const s = get();
        const u = s.user;
        if (!u) {
          deny(get, 'signIn');
          return null;
        }
        if (!can(u, 'execute')) {
          deny(get, 'noExecute');
          return null;
        }
        const extraMin = Math.round(Number(req.extraMin));
        if (!Number.isFinite(extraMin) || extraMin < 5 || extraMin > 240 || !req.reason?.trim()) {
          deny(get, 'extInvalid');
          return null;
        }
        const { raw, a, state } = blockCtx(s, blockId);
        if (!(state === 'GRANTED' || state === 'LOCKED') || !a) {
          deny(get, 'extState');
          return null;
        }
        if (s.extensions.some((e) => e.blockId === blockId && e.status === 'PENDING')) {
          deny(get, 'extPending', { id: blockId });
          return null;
        }
        const end = a.override?.end ?? raw?.end ?? a.geometry?.end ?? 0;
        if (end + extraMin > 1440) {
          deny(get, 'extMidnight');
          return null;
        }
        const e: ExtensionRequest = { id: `EXT-${short()}`, blockId, extraMin, reason: req.reason.trim(), by: u.name, role: u.role, at: now(), status: 'PENDING' };
        set({ extensions: [e, ...s.extensions].slice(0, 200) });
        get().addAudit({ action: 'EXTENSION_REQUESTED', entityType: 'block', entityId: blockId, detail: `+${extraMin} min · ${e.reason}` });
        get().notify({ portals: ['control'], kind: 'ACTION', title: `Extension requested · ${blockId}`, body: `+${extraMin} min to ${hhmm(end + extraMin)} · ${e.reason} (${u.name})`, route: `/app/control/board?block=${blockId}` });
        return e;
      },
      decideExtension: (blockId, requestId, approve, note) => {
        const s = get();
        const u = s.user;
        if (!u) return deny(get, 'signIn');
        if (!can(u, 'grant')) return deny(get, 'noGrant');
        const req = s.extensions.find((e) => e.id === requestId && e.blockId === blockId && e.status === 'PENDING');
        if (!req) return deny(get, 'extNotFound');
        const { raw, a, departments, state } = blockCtx(s, blockId);
        const at = now();
        const decided: ExtensionRequest = { ...req, status: approve ? 'APPROVED' : 'REFUSED', decidedBy: u.name, decidedAt: at, note: note?.trim() || undefined };
        if (approve) {
          if (!(state === 'GRANTED' || state === 'LOCKED') || !a) return deny(get, 'extState');
          const start = a.override?.start ?? raw?.start ?? a.geometry?.start ?? 0;
          const end = (a.override?.end ?? raw?.end ?? a.geometry?.end ?? 0) + req.extraMin;
          if (end > 1440) return deny(get, 'extMidnight');
          const override = { start, end, by: u.name, at };
          const geometry = raw ? captureGeometry(raw, override, at) : a.geometry ? { ...a.geometry, end, capturedAt: at } : undefined;
          set({
            approvals: { ...s.approvals, [blockId]: { ...a, override, geometry, extendedMin: (a.extendedMin ?? 0) + req.extraMin } },
            executionLog: s.executionLog.map((r) => (r.blockId === blockId && r.status === 'IN_PROGRESS' ? { ...r, extendedMin: (r.extendedMin ?? 0) + req.extraMin, updatedAt: at } : r)),
            extensions: s.extensions.map((e) => (e.id === requestId ? decided : e)),
          });
          get().addAudit({ action: 'EXTENSION_APPROVED', entityType: 'block', entityId: blockId, detail: `+${req.extraMin} min · block now ${hhmm(start)}–${hhmm(end)}${decided.note ? ` · ${decided.note}` : ''}` });
          get().notify({ portals: ['field', ...deptPortals(departments)], kind: 'OK', title: `Extension granted · ${blockId}`, body: `Block now ends ${hhmm(end)} (+${req.extraMin} min)${decided.note ? ` · ${decided.note}` : ''}`, route: `/app/field/today?block=${blockId}` });
        } else {
          set({ extensions: s.extensions.map((e) => (e.id === requestId ? decided : e)) });
          get().addAudit({ action: 'EXTENSION_REFUSED', entityType: 'block', entityId: blockId, detail: `+${req.extraMin} min refused${decided.note ? ` · ${decided.note}` : ''}` });
          get().notify({ portals: ['field', ...deptPortals(departments)], kind: 'WARNING', title: `Extension refused · ${blockId}`, body: decided.note ?? 'Clear the line by the granted end time', route: `/app/field/today?block=${blockId}` });
        }
        return true;
      },

      messages: [],
      messageControl: (blockId, text) => {
        const u = get().user;
        if (!text.trim()) {
          deny(get, 'emptyText');
          return;
        }
        const m: SiteMessage = { id: uid(), blockId, text: text.trim(), by: u?.name ?? 'Field', role: u?.role, at: now(), from: 'field' };
        set({ messages: [m, ...get().messages].slice(0, 300) });
        get().addAudit({ action: 'SITE_MESSAGE', entityType: 'block', entityId: blockId, detail: m.text.slice(0, 120) });
        get().notify({ portals: ['control'], kind: 'INFO', title: `Message from site · ${blockId}`, body: `${m.text} (${m.by})`, route: `/app/control/board?block=${blockId}` });
      },
      replyToMessage: (messageId, text) => {
        const s = get();
        const u = s.user;
        if (!u) return deny(get, 'signIn');
        if (!(can(u, 'grant') || u.portal === 'control')) return deny(get, 'noReply');
        if (!text.trim()) return deny(get, 'emptyText');
        const orig = s.messages.find((m) => m.id === messageId);
        if (!orig) return deny(get, 'msgNotFound');
        const m: SiteMessage = { id: uid(), blockId: orig.blockId, text: text.trim(), by: u.name, role: u.role, at: now(), from: 'control', replyTo: messageId };
        set({ messages: [m, ...s.messages].slice(0, 300) });
        get().addAudit({ action: 'SITE_MESSAGE_REPLIED', entityType: 'block', entityId: orig.blockId, detail: m.text.slice(0, 120) });
        get().notify({ portals: ['field'], kind: 'INFO', title: `Control replied · ${orig.blockId}`, body: m.text, route: `/app/field/today?block=${orig.blockId}` });
        return true;
      },
      acks: [],
      ackCaution: (orderNo, trainNo) => {
        const s = get();
        const u = s.user;
        if (!u) return deny(get, 'signIn');
        if (s.acks.some((a) => a.orderNo === orderNo && a.by === u.name)) return deny(get, 'ackDup', { no: orderNo });
        const at = now();
        const ack: CautionAck = { id: uid(), orderNo, by: u.name, role: u.role, at, trainNo: trainNo || undefined };
        const entry = { by: u.name, at, role: u.role, trainNo: trainNo || undefined };
        const f = s.forms[orderNo];
        // the order keeps its status (ISSUED); acknowledgements are listed on it. A manual TSR order in force
        // has no form record until someone touches it — it is issued by being in force, so one is created.
        const forms = f ? { ...s.forms, [orderNo]: { ...f, acknowledgements: [...(f.acknowledgements ?? []), entry] } } : /\/M-/.test(orderNo) ? { ...s.forms, [orderNo]: { status: 'ISSUED' as FormStatus, by: 'Control (TSR in force)', at, acknowledgements: [entry] } } : s.forms;
        set({ acks: [ack, ...s.acks].slice(0, 300), forms });
        const count = [ack, ...s.acks].filter((a) => a.orderNo === orderNo).length;
        get().addAudit({ action: 'CAUTION_ACKNOWLEDGED', entityType: 'caution', entityId: orderNo, detail: `${u.name}${trainNo ? ` · train ${trainNo}` : ''} · ${count} acknowledgement${count > 1 ? 's' : ''}` });
        get().notify({ portals: ['control'], kind: 'INFO', title: `Caution order acknowledged · ${orderNo}`, body: `${u.name}${trainNo ? ` (train ${trainNo})` : ''} · ${count} acknowledgement${count > 1 ? 's' : ''} so far`, route: '/app/control/caution' });
        return true;
      },

      /* requisitions */
      requisitions: SEED_REQUISITIONS,
      saveRequisition: (r) => {
        const u = get().user;
        const existing = r.id ? get().requisitions.find((x) => x.id === r.id) : undefined;
        const t = now();
        const req: Requisition = existing
          ? { ...existing, ...r, id: existing.id, updatedAt: t, history: [...existing.history, { at: t, by: u?.name ?? 'Unknown', action: 'EDITED' }] }
          : { ...r, id: `REQ-${short()}`, no: `BDMS/${r.dept}/${new Date().getFullYear()}/${String(get().requisitions.length + 1).padStart(3, '0')}`, by: u?.name ?? 'Unknown', role: u?.role ?? 'UNKNOWN', at: t, updatedAt: t, history: [{ at: t, by: u?.name ?? 'Unknown', action: 'CREATED' }] };
        set({ requisitions: existing ? get().requisitions.map((x) => (x.id === req.id ? req : x)) : [req, ...get().requisitions] });
        if (!existing) get().addAudit({ action: 'REQUISITION_CREATED', entityType: 'requisition', entityId: req.no, detail: `${req.workType} ${req.line} km ${req.startKm}–${req.endKm}` });
        return req;
      },
      submitRequisition: (id) => {
        const u = get().user;
        set({ requisitions: get().requisitions.map((r) => (r.id === id ? { ...r, status: 'SUBMITTED', updatedAt: now(), history: [...r.history, { at: now(), by: u?.name ?? 'Unknown', action: 'SUBMITTED' }] } : r)) });
        const req = get().requisitions.find((r) => r.id === id);
        get().addAudit({ action: 'REQUISITION_SUBMITTED', entityType: 'requisition', entityId: req?.no ?? id });
        get().notify({ portals: ['planning'], kind: 'ACTION', title: `Requisition ${req?.no ?? id} submitted`, body: `${req?.dept} · ${req?.workType} · ${req?.line} km ${req?.startKm}–${req?.endKm}`, route: '/app/planning/intake' });
      },
      returnRequisition: (id, remarks) => {
        const u = get().user;
        if (!u) return deny(get, 'signIn');
        if (!can(u, 'plan')) return deny(get, 'noPlan');
        const cur = get().requisitions.find((r) => r.id === id);
        if (!cur || cur.status !== 'SUBMITTED') return deny(get, 'reqState', { no: cur?.no ?? id, status: cur?.status ?? '—' });
        set({ requisitions: get().requisitions.map((r) => (r.id === id ? { ...r, status: 'RETURNED', cellRemarks: remarks, updatedAt: now(), history: [...r.history, { at: now(), by: u?.name ?? 'Unknown', action: 'RETURNED', note: remarks }] } : r)) });
        const req = get().requisitions.find((r) => r.id === id);
        get().addAudit({ action: 'REQUISITION_RETURNED', entityType: 'requisition', entityId: req?.no ?? id, detail: remarks });
        if (req) get().notify({ portals: [req.dept.toLowerCase() as PortalId], kind: 'WARNING', title: `Requisition ${req.no} returned`, body: remarks, route: `/app/${req.dept.toLowerCase()}/demand?req=${req.id}` });
        return true;
      },
      acceptRequisition: (id) => {
        const s = get();
        const u = s.user;
        const req = s.requisitions.find((r) => r.id === id);
        if (!req) return null;
        if (!u) {
          deny(get, 'signIn');
          return null;
        }
        if (!can(u, 'plan')) {
          deny(get, 'noPlan');
          return null;
        }
        if (req.status !== 'SUBMITTED') {
          deny(get, 'reqState', { no: req.no, status: req.status });
          return null;
        }
        // everything the requisition asks for goes to the optimiser: duration, preferred day / window,
        // machine, block kind, power block / disconnection, dependencies, corridor, replaced register work
        const planStart = s.snapshot && s.snapshot.corridor.id === req.corridorId ? s.snapshot.planStart : null;
        const knownTaskIds = s.snapshot && s.snapshot.corridor.id === req.corridorId ? new Set(s.snapshot.tasks.map((t) => t.id)) : null;
        const spec = requisitionInjectSpec(req, { planStart, corridorId: req.corridorId, knownTaskIds });
        const task = get().addIntakeTask({
          spec,
          label: `${req.workType} · km ${req.startKm}–${req.endKm} ${req.line}`,
          dept: req.dept,
          submittedBy: req.by,
          role: req.role,
          source: 'REQUISITION',
          corridorId: req.corridorId,
        });
        set({ requisitions: get().requisitions.map((r) => (r.id === id ? { ...r, status: 'ACCEPTED', intakeTaskId: task.id, updatedAt: now(), history: [...r.history, { at: now(), by: u.name, action: 'ACCEPTED' }] } : r)) });
        const honoured = [
          spec.durationMin ? `${spec.durationMin} min` : null,
          spec.preferredDay !== undefined ? `day ${spec.preferredDay + 1}` : req.preferredDate ? 'preferred date outside this week' : null,
          spec.preferredWindow && spec.preferredWindow !== 'any' ? spec.preferredWindow : null,
          spec.machine ?? null,
          spec.requires?.join(' + ') ?? null,
          spec.dependsOn?.length ? `after ${spec.dependsOn.join(', ')}` : null,
          spec.coRequireWith?.length ? `with ${spec.coRequireWith.join(', ')}` : null,
          spec.replacesTaskId ? `replaces ${spec.replacesTaskId}` : null,
        ].filter(Boolean);
        get().addAudit({ action: 'REQUISITION_ACCEPTED', entityType: 'requisition', entityId: req.no, detail: `→ ${task.id}${honoured.length ? ` · ${honoured.join(' · ')}` : ''}` });
        get().notify({ portals: [req.dept.toLowerCase() as PortalId], kind: 'OK', title: `Requisition ${req.no} accepted`, body: 'The work is in the next plan run', route: `/app/${req.dept.toLowerCase()}/blocks` });
        return task;
      },
      withdrawRequisition: (id) => {
        const u = get().user;
        const req = get().requisitions.find((r) => r.id === id);
        if (!req) return;
        // an accepted requisition's injected work leaves the optimiser input with it
        if (req.intakeTaskId && get().intakeTasks.some((t) => t.id === req.intakeTaskId)) get().removeIntakeTask(req.intakeTaskId);
        set({ requisitions: get().requisitions.map((r) => (r.id === id ? { ...r, status: 'WITHDRAWN', intakeTaskId: undefined, updatedAt: now(), history: [...r.history, { at: now(), by: u?.name ?? 'Unknown', action: 'WITHDRAWN', note: req.intakeTaskId ? `Injected work ${req.intakeTaskId} removed` : undefined }] } : r)) });
        get().addAudit({ action: 'REQUISITION_WITHDRAWN', entityType: 'requisition', entityId: req.no, detail: req.intakeTaskId ? `Injected work ${req.intakeTaskId} removed — re-plan to drop it` : undefined });
        if (req.status === 'ACCEPTED') get().notify({ portals: ['planning'], kind: 'WARNING', title: `Requisition ${req.no} withdrawn`, body: 'Its work leaves the next plan run', route: '/app/planning/demands' });
      },

      /* hazard reports */
      reports: SEED_REPORTS,
      submitReport: (r) => {
        const s = get();
        const dept = r.dept === undefined ? deptForCategory(r.category) : r.dept;
        // keyword suggestion (shown to triage when it differs from what the reporter picked)
        const sug = suggestCategory(r.description);
        const suggestedCategory = sug && sug.category !== r.category ? sug : null;
        // severity: the reporter's choice, else the points table over timetable / TSR facts at the location
        let auto: Pick<HazardReport, 'severity' | 'severityAuto' | 'severityReasons'> = {};
        if (!r.severity) {
          const facts = severityFactsAt(s.snapshot && s.snapshot.corridor.id === r.corridorId ? s.snapshot : null, s.tsrs, { km: r.km, line: r.line, day: 0, minute: nowMinuteIST() });
          const sev = computeSeverity({ category: r.category, ...facts });
          auto = { severity: sev.level, severityAuto: true, severityReasons: [...sev.reasons, ...(facts.nextTrainNo ? [`Next train: ${facts.nextTrainNo} (timetable)`] : [])] };
        }
        const rep: HazardReport = { ...r, ...auto, suggestedCategory, dept, id: `HZ-${short()}`, at: now(), status: 'UNVERIFIED', history: [{ at: now(), by: r.reporter.name || 'Reporter', action: 'RECEIVED', note: `${dept ? `Routed to ${dept}` : 'Routed to Control for triage'}${auto.severityAuto ? ` · severity ${auto.severity} (rule-based)` : ''}` }] };
        set({ reports: [rep, ...get().reports], myReportIds: r.source === 'citizen' ? [rep.id, ...get().myReportIds] : get().myReportIds });
        get().addAudit({ action: 'HAZARD_REPORTED', entityType: 'report', entityId: rep.id, detail: `${rep.category} · ${rep.description.slice(0, 80)}`, by: rep.reporter.name || 'Reporter', role: rep.reporter.role });
        const portals: PortalId[] = ['control', 'planning', ...(dept ? [dept.toLowerCase() as PortalId] : [])];
        get().notify({ portals, kind: 'ACTION', title: `New hazard report ${rep.id}`, body: `${rep.category}${rep.nearestStation ? ` near ${rep.nearestStation}` : ''}${rep.km !== undefined ? ` · km ${rep.km.toFixed(1)}` : ''}`, route: dept ? `/app/${dept.toLowerCase()}/reports?report=${rep.id}` : `/app/control/incidents?report=${rep.id}` });
        return rep;
      },
      triageReport: (id, action, data) => {
        const u = get().user;
        const by = u?.name ?? 'Unknown';
        const t = now();
        let created: IntakeTask | null = null;
        set({
          reports: get().reports.map((r) => {
            if (r.id !== id) return r;
            const h = [...r.history, { at: t, by, action: action.toUpperCase(), note: data?.note }];
            switch (action) {
              case 'verify':
                return { ...r, status: 'TRIAGED', dept: data?.dept ?? r.dept, history: h };
              case 'assign':
                return { ...r, status: 'TRIAGED', assignee: data?.assignee, history: h };
              case 'reroute':
                return { ...r, status: 'UNVERIFIED', dept: data?.dept ?? r.dept, history: h };
              case 'return':
                return { ...r, status: 'UNVERIFIED', dept: null, history: h };
              case 'accept': {
                const spec = data?.taskSpec ?? r.taskSpec;
                if (!spec) return r;
                // the work belongs to the report's corridor, whatever corridor is active now
                const withCorridor: InjectSpecV4 = { ...spec, sourceId: spec.sourceId ?? `REPORT/${r.id}`, corridorId: r.corridorId };
                created = get().addIntakeTask({ spec: withCorridor, label: spec.label ?? `${spec.workType} from report ${r.id}`, dept: (data?.dept ?? r.dept ?? 'TMS') as Dept, submittedBy: by, role: u?.role ?? 'UNKNOWN', source: r.source === 'citizen' ? 'CITIZEN' : 'FIELD', corridorId: r.corridorId });
                return { ...r, status: 'TASK', taskSpec: withCorridor, intakeTaskId: created.id, dept: data?.dept ?? r.dept, history: h };
              }
              case 'reject':
                return { ...r, status: 'REJECTED', history: h };
              case 'resolve':
                return { ...r, status: 'RESOLVED', history: h };
              default:
                return r;
            }
          }),
        });
        get().addAudit({ action: `REPORT_${action.toUpperCase()}`, entityType: 'report', entityId: id, detail: data?.note ?? data?.taskSpec?.workType ?? data?.dept });
        if (action === 'accept' && created) get().notify({ portals: ['planning', 'control'], kind: 'INFO', title: `Report ${id} converted to work`, body: `${(created as IntakeTask).label} — planned on the next run`, route: '/app/planning/risk' });
      },

      /* notifications */
      pushed: [],
      notify: (n) => {
        const item: PushedNotification = { ...n, id: uid(), at: now() };
        set({ pushed: [item, ...get().pushed].slice(0, 200) });
        // system notification on this device when the item is for this user's portal and the tab is hidden
        deviceNotifyIfHidden(item, get());
      },
      readNotifications: [],
      markRead: (id) => set({ readNotifications: Array.from(new Set([...get().readNotifications, id])) }),
      markAllRead: (ids) => set({ readNotifications: Array.from(new Set([...get().readNotifications, ...ids])) }),

      /* tour */
      toursDone: {},
      markTourDone: (p) => set({ toursDone: { ...get().toursDone, [p]: true } }),
      resetTours: () => set({ toursDone: {} }),

      /* ROI */
      roiAssumptions: { ...(DEFAULT_ROI_ASSUMPTIONS as RoiAssumptions) },
      setRoiAssumptions: (a) => {
        const before = get().roiAssumptions;
        set({ roiAssumptions: { ...before, ...a } });
        get().addAudit({ action: 'ROI_ASSUMPTION_CHANGED', entityType: 'settings', entityId: Object.keys(a).join(','), detail: Object.entries(a).map(([k, v]) => `${k}: ${before[k as keyof RoiAssumptions]} → ${v}`).join('; ') });
      },
      resetRoiAssumptions: () => set({ roiAssumptions: { ...(DEFAULT_ROI_ASSUMPTIONS as RoiAssumptions) } }),

      /* toasts */
      toasts: [],
      toast: (t) => {
        const id = uid();
        set({ toasts: [...get().toasts, { ...t, id }] });
        setTimeout(() => get().dismissToast(id), t.tone === 'crit' ? 8000 : 5000);
      },
      dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

      resetDemoData: () => {
        set({
          approvals: {}, executionLog: [], reports: [], intakeTasks: [], requisitions: [], scenario: null, audit: [], readNotifications: [], pushed: [], previousResult: null, candidate: null,
          forms: {}, tsrs: [], powerBlocks: {}, rbp: { monthly: { status: 'DRAFT' }, rolling: { status: 'DRAFT' } }, jpoNotices: {}, escalations: [], directions: [], handoverNotes: {}, messages: [], acks: [], pinnedTaskIds: [], excludedTaskIds: [], myReportIds: [], dataIssueStatus: {}, extensions: [],
        });
        get().resetTuning();
        get().addAudit({ action: 'DEMO_DATA_RESET', entityType: 'settings', entityId: 'all' });
        void get().runPlan({ reason: 'demo data reset' });
      },
    }),
    {
      name: 'samanvay.v4',
      version: 4,
      storage: createJSONStorage(() => localStorage),
      // v3: drop the old seeded execution records / manual TSRs (fake block ids) and
      // replace old seeded reports and requisitions with the corrected demo set.
      // v4: every intake task carries its corridor (from its requisition / report, else the corridor active then).
      migrate: (persisted, version) => {
        const st = (persisted ?? {}) as Partial<AppState>;
        if (version < 3) {
          const isOldSeedReport = (r: HazardReport) => /^HZ-10\d\d$/.test(r.id);
          const isOldSeedReq = (r: Requisition) => /^REQ-00\d$/.test(r.id);
          st.executionLog = (st.executionLog ?? []).filter((r) => !/^BLK-0\d$/.test(r.blockId));
          st.tsrs = (st.tsrs ?? []).filter((t) => !/^TSR-010\d$/.test(t.id));
          st.reports = [...SEED_REPORTS, ...(st.reports ?? []).filter((r) => !isOldSeedReport(r))];
          st.requisitions = [...SEED_REQUISITIONS, ...(st.requisitions ?? []).filter((r) => !isOldSeedReq(r))];
        }
        if (version < 4) {
          const fallback = st.corridorId ?? DEFAULT_CORRIDOR;
          st.intakeTasks = (st.intakeTasks ?? []).map((t) => {
            if (t.corridorId) return t;
            const cid = st.requisitions?.find((r) => r.intakeTaskId === t.id)?.corridorId ?? st.reports?.find((r) => r.intakeTaskId === t.id)?.corridorId ?? fallback;
            return { ...t, corridorId: cid, spec: { ...t.spec, corridorId: cid } };
          });
          st.extensions = st.extensions ?? [];
        }
        return st as AppState;
      },
      partialize: (s) => ({
        user: s.user,
        theme: s.theme,
        language: s.language,
        corridorId: s.corridorId,
        audioMuted: s.audioMuted,
        preloaderSeen: s.preloaderSeen,
        homeStation: s.homeStation,
        savedTrains: s.savedTrains,
        lastTrainNo: s.lastTrainNo,
        citizenName: s.citizenName,
        myReportIds: s.myReportIds,
        weights: s.weights,
        rules: s.rules,
        iterations: s.iterations,
        solver: s.solver,
        importedFeeds: s.importedFeeds,
        weatherOverride: s.weatherOverride,
        scenario: s.scenario,
        pinnedTaskIds: s.pinnedTaskIds,
        excludedTaskIds: s.excludedTaskIds,
        intakeTasks: s.intakeTasks,
        approvals: s.approvals,
        handoverNotes: s.handoverNotes,
        forms: s.forms,
        tsrs: s.tsrs,
        powerBlocks: s.powerBlocks,
        rbp: s.rbp,
        jpoNotices: s.jpoNotices,
        escalations: s.escalations,
        directions: s.directions,
        audit: s.audit,
        executionLog: s.executionLog,
        extensions: s.extensions,
        deviceNotifications: s.deviceNotifications,
        messages: s.messages,
        acks: s.acks,
        requisitions: s.requisitions,
        reports: s.reports,
        pushed: s.pushed,
        readNotifications: s.readNotifications,
        toursDone: s.toursDone,
        roiAssumptions: s.roiAssumptions,
        dataIssueStatus: s.dataIssueStatus,
      }),
    }
  )
);

/* ── Selectors ─────────────────────────────────────────────── */
export const useSnapshot = () => useAppStore((s) => s.snapshot);
export const useUser = () => useAppStore((s) => s.user);
export const usePlanStatus = () => useAppStore((s) => s.planStatus);
