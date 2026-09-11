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
import type { Dept, ExecutionLogRecord, InjectSpec, Kpis, KpiDelta, Line, PlanRequest, Rules, Scenario, Snapshot, Weights } from '../engine/types';
import type { PortalId, SessionUser } from '../auth/portals';
import type { Lang } from '../i18n';

/* ───────────────────────── types ───────────────────────── */

export type Theme = 'light' | 'dark' | 'sunlight';
export type PlanStatus = 'idle' | 'running' | 'ready' | 'error';

export type ApprovalStatus = 'PROPOSED' | 'GRANTED' | 'REFUSED' | 'LOCKED';

export interface Approval {
  status: ApprovalStatus;
  concur: Partial<Record<Dept, { by: string; at: string; note?: string }>>;
  objections: { dept: Dept; by: string; at: string; reason: string }[];
  /** window override recorded by Control ("grant with change") */
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
}

export type AuditEntityType = 'block' | 'task' | 'report' | 'plan' | 'caution' | 'user' | 'settings' | 'tsr' | 'form' | 'requisition' | 'rbp' | 'escalation' | 'direction';

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
  plannedMin: number;
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
}

export type ReportCategory = 'track' | 'signal' | 'ohe' | 'lc' | 'fire' | 'obstruction' | 'other';
export type ReportStatus = 'UNVERIFIED' | 'TRIAGED' | 'TASK' | 'RESOLVED' | 'REJECTED';
export type ReportSource = 'citizen' | 'field' | 'locoPilot';

export interface HazardReport {
  id: string;
  at: string;
  source: ReportSource;
  reporter: { name: string; role: string; portal: PortalId; contact?: string };
  lang: Lang;
  description: string;
  category: ReportCategory;
  severity?: 'low' | 'medium' | 'high';
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
  spec: InjectSpec;
  label: string;
  dept: Dept;
  submittedBy: string;
  role: string;
  at: string;
  source: 'BDMS-INTAKE' | 'FIELD' | 'CITIZEN' | 'EMERGENCY-TSR' | 'REQUISITION';
}

export type RequisitionStatus = 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'ACCEPTED' | 'WITHDRAWN';
export type BlockType = 'TRAFFIC' | 'POWER' | 'DISCONNECTION' | 'INTEGRATED';

export interface Requisition {
  id: string;
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
  setCorridor: (id: string) => void;
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
  runPlan: (opts?: { reason?: string }) => Promise<void>;
  candidate: Candidate | null;
  candidateStatus: 'idle' | 'running' | 'error';
  candidateProgress: string;
  candidateError: string | null;
  runCandidate: (patch: CandidatePatch, reason: string) => Promise<void>;
  promoteCandidate: () => void;
  discardCandidate: () => void;

  // JPO workflow
  approvals: Record<string, Approval>;
  proposeBlocks: (blockIds: string[]) => void;
  concur: (blockId: string, dept: Dept, note?: string) => void;
  object: (blockId: string, dept: Dept, reason: string) => void;
  grant: (blockId: string, override?: { start: number; end: number }) => void;
  refuse: (blockId: string, reason: string) => void;
  lock: (blockId: string) => void;
  setIncharge: (blockId: string, name: string) => void;
  setResources: (blockId: string, r: { machineId?: string; crewId?: string }) => void;
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
  startPossession: (rec: Omit<ExecRecord, 'status' | 'by' | 'updatedAt' | 'actualStart' | 'source'> & { actualStart: number; source?: 'field' | 'control' }) => void;
  markItemDone: (blockId: string, taskId: string, actualMin: number, remarks?: string) => void;
  clearPossession: (blockId: string, data: { actualEnd: number; overrunCause?: string; speedOnLifting?: number | null; source?: 'field' | 'control' }) => void;
  resetExecution: () => void;
  messages: { id: string; blockId: string; text: string; by: string; at: string }[];
  messageControl: (blockId: string, text: string) => void;
  acks: { id: string; orderNo: string; by: string; at: string }[];
  ackCaution: (orderNo: string) => void;

  // requisitions (BDMS-style)
  requisitions: Requisition[];
  saveRequisition: (r: Omit<Requisition, 'id' | 'no' | 'at' | 'updatedAt' | 'history' | 'by' | 'role'> & { id?: string }) => Requisition;
  submitRequisition: (id: string) => void;
  returnRequisition: (id: string, remarks: string) => void;
  acceptRequisition: (id: string) => IntakeTask | null;
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

/** Records from the UI execution log that the engine can learn duration factors from. */
function executionRecordsForEngine(log: ExecRecord[]): ExecutionLogRecord[] {
  const out: ExecutionLogRecord[] = [];
  for (const rec of log) {
    for (const it of rec.items) {
      if (!it.done || !it.actualMin) continue;
      out.push({ workType: it.workType, plannedMin: it.plannedMin, actualMin: it.actualMin, daysAgo: 0, overrunReason: it.actualMin > it.plannedMin * 1.1 ? rec.overrunCause || 'Overrun (execution log)' : null });
    }
  }
  return out;
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

/** Build the worker request from the store's parameters (+ an optional candidate patch). */
function buildRequest(s: AppState, patch: CandidatePatch = {}): PlanRequest {
  const scenarioState = patch.scenario === undefined ? s.scenario : patch.scenario;
  const injected: InjectSpec[] = [
    ...(scenarioState?.scenario.injectTasks ?? []),
    ...s.intakeTasks.map((t) => t.spec),
    ...s.reports
      .filter((r) => r.status === 'TASK' && r.taskSpec && r.corridorId === s.corridorId && !r.intakeTaskId)
      .map((r) => ({ ...r.taskSpec!, sourceId: r.taskSpec!.sourceId ?? `REPORT/${r.id}` })),
  ];
  const scenario: Scenario = {
    ...(scenarioState?.scenario ?? {}),
    name: scenarioState?.name,
    id: scenarioState?.presetId ?? undefined,
    injectTasks: injected,
    extraExecution: executionRecordsForEngine(s.executionLog),
  };
  return {
    corridorId: s.corridorId,
    weights: { ...s.weights, ...(patch.weights ?? {}) },
    rules: { ...s.rules, ...(patch.rules ?? {}) },
    iterations: patch.iterations ?? s.iterations,
    scenario,
    pinnedTaskIds: patch.pinnedTaskIds ?? s.pinnedTaskIds,
    excludedTaskIds: patch.excludedTaskIds ?? s.excludedTaskIds,
  };
}

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
        if (id === get().corridorId) return;
        set({ corridorId: id, approvals: {}, executionLog: [], forms: {}, powerBlocks: {}, candidate: null, pinnedTaskIds: [], excludedTaskIds: [], handoverNotes: {} });
        get().addAudit({ action: 'CORRIDOR_CHANGED', entityType: 'settings', entityId: id });
        void get().runPlan({ reason: 'corridor changed' });
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

      intakeTasks: [],
      addIntakeTask: (t) => {
        const task: IntakeTask = { ...t, id: `INTAKE-${short()}`, at: now() };
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
        try {
          const snapshot = await runPlanInWorker(buildRequest(s), (m) => set({ planProgress: m.text }));
          set({ snapshot, planStatus: 'ready', planProgress: 'Plan ready', planVersion: get().planVersion + 1, lastPlannedAt: now() });
          get().addAudit({ action: 'PLAN_COMPUTED', entityType: 'plan', entityId: snapshot.corridor.code, detail: `${opts?.reason ?? 're-plan'} · ${snapshot.result.weekly.kpis.blockCount} possessions · ${(snapshot.timing.ms / 1000).toFixed(1)} s` });
        } catch (e) {
          set({ planStatus: 'error', planError: (e as Error).message });
        }
        if (get().pendingRerun) {
          set({ pendingRerun: false });
          void get().runPlan({ reason: 'queued re-plan' });
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
        get().addAudit({ action: 'WORKING_PLAN_UPDATED', entityType: 'plan', entityId: c.snapshot.corridor.code, detail: `${c.reason} · ${c.snapshot.result.weekly.kpis.blockCount} possessions` });
      },
      discardCandidate: () => set({ candidate: null, candidateStatus: 'idle', candidateError: null }),

      /* JPO workflow */
      approvals: {},
      proposeBlocks: (ids) => {
        const u = get().user;
        const next = { ...get().approvals };
        for (const id of ids) next[id] = { ...(next[id] ?? emptyApproval()), proposedBy: u?.name ?? 'Planning cell', proposedAt: now() };
        set({ approvals: next });
        get().addAudit({ action: 'SENT_TO_CONTROL', entityType: 'plan', entityId: `${ids.length} blocks`, detail: ids.slice(0, 6).join(', ') });
      },
      concur: (blockId, dept, note) => {
        const u = get().user;
        const a = get().approvals[blockId] ?? emptyApproval();
        set({ approvals: { ...get().approvals, [blockId]: { ...a, concur: { ...a.concur, [dept]: { by: u?.name ?? 'Unknown', at: now(), note } }, objections: a.objections.filter((o) => o.dept !== dept) } } });
        get().addAudit({ action: `CONCUR_${dept}`, entityType: 'block', entityId: blockId, detail: note ? `${dept} concurrence · ${note}` : `${dept} concurrence recorded` });
      },
      object: (blockId, dept, reason) => {
        const u = get().user;
        const a = get().approvals[blockId] ?? emptyApproval();
        const { [dept]: _removed, ...rest } = a.concur;
        set({ approvals: { ...get().approvals, [blockId]: { ...a, concur: rest, objections: [...a.objections, { dept, by: u?.name ?? 'Unknown', at: now(), reason }] } } });
        get().addAudit({ action: `OBJECTION_${dept}`, entityType: 'block', entityId: blockId, detail: reason });
        get().notify({ portals: ['planning', 'control'], kind: 'WARNING', title: `Objection on ${blockId} from ${dept}`, body: reason, route: `/app/planning/handoff?block=${blockId}` });
      },
      grant: (blockId, override) => {
        const u = get().user;
        const a = get().approvals[blockId] ?? emptyApproval();
        const next: Approval = { ...a, status: 'GRANTED', grantedBy: u?.name ?? 'Unknown', grantedAt: now() };
        if (override) next.override = { ...override, by: u?.name ?? 'Unknown', at: now() };
        set({ approvals: { ...get().approvals, [blockId]: next } });
        get().addAudit({ action: override ? 'BLOCK_GRANTED_WITH_CHANGE' : 'BLOCK_GRANTED', entityType: 'block', entityId: blockId, detail: override ? `Window changed to ${Math.floor(override.start / 60)}:${String(override.start % 60).padStart(2, '0')}–${Math.floor(override.end / 60)}:${String(override.end % 60).padStart(2, '0')}` : 'Possession granted by Control' });
        get().notify({ portals: ['planning', 'tms', 'smms', 'tdms', 'field'], kind: 'OK', title: `Block ${blockId} granted`, body: override ? 'Granted with a changed window' : 'Granted by Control', route: `/app/planning/weekly?block=${blockId}` });
      },
      refuse: (blockId, reason) => {
        const u = get().user;
        const a = get().approvals[blockId] ?? emptyApproval();
        set({ approvals: { ...get().approvals, [blockId]: { ...a, status: 'REFUSED', refusal: { reason, count: (a.refusal?.count ?? 0) + 1, by: u?.name ?? 'Unknown', at: now() } } } });
        get().addAudit({ action: 'BLOCK_REFUSED', entityType: 'block', entityId: blockId, detail: reason });
        get().notify({ portals: ['planning', 'tms', 'smms', 'tdms'], kind: 'WARNING', title: `Block ${blockId} refused by Control`, body: reason, route: `/app/planning/weekly?block=${blockId}` });
      },
      lock: (blockId) => {
        const u = get().user;
        const a = get().approvals[blockId] ?? emptyApproval();
        set({ approvals: { ...get().approvals, [blockId]: { ...a, status: 'LOCKED', lockedBy: u?.name ?? 'Unknown', lockedAt: now() } } });
        get().addAudit({ action: 'BLOCK_LOCKED', entityType: 'block', entityId: blockId, detail: 'Locked into the COA working time table' });
      },
      setIncharge: (blockId, name) => {
        const a = get().approvals[blockId] ?? emptyApproval();
        set({ approvals: { ...get().approvals, [blockId]: { ...a, incharge: name } } });
        get().addAudit({ action: 'INCHARGE_SET', entityType: 'block', entityId: blockId, detail: name });
      },
      setResources: (blockId, r) => {
        const a = get().approvals[blockId] ?? emptyApproval();
        set({ approvals: { ...get().approvals, [blockId]: { ...a, resources: { ...(a.resources ?? {}), ...r } } } });
        get().addAudit({ action: 'RESOURCES_ASSIGNED', entityType: 'block', entityId: blockId, detail: [r.machineId, r.crewId].filter(Boolean).join(' · ') });
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
      tsrs: [],
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
      executionLog: [],
      startPossession: (rec) => {
        const u = get().user;
        const existing = get().executionLog.filter((r) => r.blockId !== rec.blockId);
        set({ executionLog: [{ ...rec, status: 'IN_PROGRESS', by: u?.name ?? 'Field', source: rec.source ?? 'field', updatedAt: now() }, ...existing] });
        get().addAudit({ action: 'POSSESSION_STARTED', entityType: 'block', entityId: rec.blockId, detail: `Actual start ${String(Math.floor(rec.actualStart / 60)).padStart(2, '0')}:${String(rec.actualStart % 60).padStart(2, '0')}` });
        get().notify({ portals: ['control', 'planning'], kind: 'INFO', title: `Possession started · ${rec.blockId}`, body: `${rec.sectionText} ${rec.line} — gang on site`, route: `/app/control/blocks?block=${rec.blockId}` });
      },
      markItemDone: (blockId, taskId, actualMin, remarks) => {
        set({
          executionLog: get().executionLog.map((r) =>
            r.blockId !== blockId ? r : { ...r, updatedAt: now(), items: r.items.map((it) => (it.taskId === taskId ? { ...it, done: true, actualMin, remarks } : it)) }
          ),
        });
        get().addAudit({ action: 'WORK_COMPLETED', entityType: 'task', entityId: taskId, detail: `${actualMin} min actual${remarks ? ` · ${remarks}` : ''}` });
      },
      clearPossession: (blockId, data) => {
        set({
          executionLog: get().executionLog.map((r) => {
            if (r.blockId !== blockId) return r;
            const start = r.actualStart ?? r.plannedStart;
            return { ...r, status: 'COMPLETED', actualEnd: data.actualEnd, actualSpanMin: Math.max(0, data.actualEnd - start), overrunCause: data.overrunCause, speedOnLifting: data.speedOnLifting ?? null, source: data.source ?? r.source, updatedAt: now() };
          }),
        });
        get().addAudit({ action: 'POSSESSION_CLEARED', entityType: 'block', entityId: blockId, detail: data.speedOnLifting ? `Line handed back with ${data.speedOnLifting} km/h restriction` : 'Line handed back at normal speed' });
        get().notify({ portals: ['control', 'planning'], kind: 'OK', title: `Line clear · ${blockId}`, body: data.speedOnLifting ? `Fit for ${data.speedOnLifting} km/h` : 'Fit for full speed', route: `/app/control/execution` });
      },
      resetExecution: () => set({ executionLog: [] }),
      messages: [],
      messageControl: (blockId, text) => {
        const u = get().user;
        const m = { id: uid(), blockId, text, by: u?.name ?? 'Field', at: now() };
        set({ messages: [m, ...get().messages].slice(0, 200) });
        get().notify({ portals: ['control'], kind: 'INFO', title: `Message from site · ${blockId}`, body: text, route: `/app/control/blocks?block=${blockId}` });
      },
      acks: [],
      ackCaution: (orderNo) => {
        const u = get().user;
        set({ acks: [{ id: uid(), orderNo, by: u?.name ?? 'Loco pilot', at: now() }, ...get().acks].slice(0, 300) });
        get().addAudit({ action: 'CAUTION_ACKNOWLEDGED', entityType: 'caution', entityId: orderNo });
      },

      /* requisitions */
      requisitions: [],
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
        set({ requisitions: get().requisitions.map((r) => (r.id === id ? { ...r, status: 'RETURNED', cellRemarks: remarks, updatedAt: now(), history: [...r.history, { at: now(), by: u?.name ?? 'Unknown', action: 'RETURNED', note: remarks }] } : r)) });
        const req = get().requisitions.find((r) => r.id === id);
        get().addAudit({ action: 'REQUISITION_RETURNED', entityType: 'requisition', entityId: req?.no ?? id, detail: remarks });
        if (req) get().notify({ portals: [req.dept.toLowerCase() as PortalId], kind: 'WARNING', title: `Requisition ${req.no} returned`, body: remarks, route: `/app/${req.dept.toLowerCase()}/demand?req=${req.id}` });
      },
      acceptRequisition: (id) => {
        const u = get().user;
        const req = get().requisitions.find((r) => r.id === id);
        if (!req) return null;
        const task = get().addIntakeTask({
          spec: { sourceId: `BDMS/${req.no}`, label: `${req.workType.replace(/_/g, ' ').toLowerCase()} (requisition ${req.no})`, workType: req.workType, line: req.line, startKm: req.startKm, endKm: req.endKm, daysOverdue: req.daysOverdue ?? 0, tsrKmph: req.tsrKmph ?? undefined, note: req.remarks },
          label: `${req.workType} · km ${req.startKm}–${req.endKm} ${req.line}`,
          dept: req.dept,
          submittedBy: req.by,
          role: req.role,
          source: 'REQUISITION',
        });
        set({ requisitions: get().requisitions.map((r) => (r.id === id ? { ...r, status: 'ACCEPTED', intakeTaskId: task.id, updatedAt: now(), history: [...r.history, { at: now(), by: u?.name ?? 'Unknown', action: 'ACCEPTED' }] } : r)) });
        get().addAudit({ action: 'REQUISITION_ACCEPTED', entityType: 'requisition', entityId: req.no, detail: `→ ${task.id}` });
        get().notify({ portals: [req.dept.toLowerCase() as PortalId], kind: 'OK', title: `Requisition ${req.no} accepted`, body: 'The work is in the next plan run', route: `/app/${req.dept.toLowerCase()}/blocks` });
        return task;
      },
      withdrawRequisition: (id) => {
        const u = get().user;
        const req = get().requisitions.find((r) => r.id === id);
        if (!req) return;
        if (req.intakeTaskId) get().removeIntakeTask(req.intakeTaskId);
        set({ requisitions: get().requisitions.map((r) => (r.id === id ? { ...r, status: 'WITHDRAWN', updatedAt: now(), history: [...r.history, { at: now(), by: u?.name ?? 'Unknown', action: 'WITHDRAWN' }] } : r)) });
        get().addAudit({ action: 'REQUISITION_WITHDRAWN', entityType: 'requisition', entityId: req.no });
      },

      /* hazard reports */
      reports: [],
      submitReport: (r) => {
        const dept = r.dept === undefined ? deptForCategory(r.category) : r.dept;
        const rep: HazardReport = { ...r, dept, id: `HZ-${short()}`, at: now(), status: 'UNVERIFIED', history: [{ at: now(), by: r.reporter.name || 'Reporter', action: 'RECEIVED', note: dept ? `Routed to ${dept}` : 'Routed to Control for triage' }] };
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
                created = get().addIntakeTask({ spec: { ...spec, sourceId: spec.sourceId ?? `REPORT/${r.id}` }, label: spec.label ?? `${spec.workType} from report ${r.id}`, dept: (data?.dept ?? r.dept ?? 'TMS') as Dept, submittedBy: by, role: u?.role ?? 'UNKNOWN', source: r.source === 'citizen' ? 'CITIZEN' : 'FIELD' });
                return { ...r, status: 'TASK', taskSpec: spec, intakeTaskId: created.id, dept: data?.dept ?? r.dept, history: h };
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
      notify: (n) => set({ pushed: [{ ...n, id: uid(), at: now() }, ...get().pushed].slice(0, 200) }),
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
          forms: {}, tsrs: [], powerBlocks: {}, rbp: { monthly: { status: 'DRAFT' }, rolling: { status: 'DRAFT' } }, jpoNotices: {}, escalations: [], directions: [], handoverNotes: {}, messages: [], acks: [], pinnedTaskIds: [], excludedTaskIds: [], myReportIds: [],
        });
        get().resetTuning();
        get().addAudit({ action: 'DEMO_DATA_RESET', entityType: 'settings', entityId: 'all' });
        void get().runPlan({ reason: 'demo data reset' });
      },
    }),
    {
      name: 'samanvay.v4',
      version: 2,
      storage: createJSONStorage(() => localStorage),
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
        messages: s.messages,
        acks: s.acks,
        requisitions: s.requisitions,
        reports: s.reports,
        pushed: s.pushed,
        readNotifications: s.readNotifications,
        toursDone: s.toursDone,
        roiAssumptions: s.roiAssumptions,
      }),
    }
  )
);

/* ── Selectors ─────────────────────────────────────────────── */
export const useSnapshot = () => useAppStore((s) => s.snapshot);
export const useUser = () => useAppStore((s) => s.user);
export const usePlanStatus = () => useAppStore((s) => s.planStatus);
