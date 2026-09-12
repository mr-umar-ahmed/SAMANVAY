/**
 * TypeScript view of the planning engine's data. The engine itself is plain
 * ES-module JavaScript (src/engine/*.js) so that the same code runs in the
 * browser worker, in Node (tests / CLI) and stays structured-cloneable.
 * Every shape here mirrors an object literal produced by that code.
 */

export type Dept = 'TMS' | 'SMMS' | 'TDMS';
export type Line = 'UP' | 'DN' | 'BOTH';
export type RunLine = 'UP' | 'DN';
export type TrainClass = 'VB' | 'RAJ' | 'SHT' | 'SF' | 'EXP' | 'PASS' | 'GOODS' | 'PARCEL';
export type Urgency = 'IMMEDIATE' | 'HIGH' | 'TACTICAL' | 'STRATEGIC';
export type BlockKind = 'TRAFFIC' | 'POWER' | 'TRAFFIC_POWER' | 'DISCONNECTION';

export interface Station {
  code: string;
  name: string;
  km: number;
  lat: number;
  lng: number;
  junction: boolean;
}

export interface BlockSection {
  id: string;
  index: number;
  from: string;
  to: string;
  label: string;
  startKm: number;
  endKm: number;
  lengthKm: number;
}

export interface OheSection {
  id: string;
  index: number;
  label: string;
  startKm: number;
  endKm: number;
  spFrom: string;
  spTo: string;
}

export interface CorridorBlock {
  line: RunLine;
  start: string;
  end: string;
  days: number[];
  fromKm: number;
  toKm: number;
}

export interface Signal {
  id: string;
  kind: string;
  stationCode: string;
  km: number;
  line: Line;
  label: string;
}

export interface Corridor {
  id: string;
  code: string;
  name: string;
  zone: string;
  division: string;
  lengthKm: number;
  mpsKmph: number;
  densityClass: string;
  trainsPerDayTarget: number;
  freightPathsPerDay: number;
  stations: Station[];
  corridorBlocks: CorridorBlock[];
  switchingPosts: number[];
  tss: { code: string; km: number }[];
  lines: RunLine[];
  blockSections: BlockSection[];
  oheSections: OheSection[];
  signals?: Signal[];
}

export interface TrainTime {
  code: string;
  km: number;
  arr: number;
  dep: number;
  halt: boolean;
}

export interface Passage {
  sectionIndex: number;
  enter: number;
  exit: number;
}

export interface Train {
  id: string;
  number: string;
  name: string;
  cls: TrainClass;
  classLabel: string;
  weight: number;
  premium: boolean;
  line: RunLine;
  source: 'COA' | 'FOIS';
  runsOn?: number[];
  dep: number;
  arr: number;
  times: TrainTime[];
  passages: Passage[];
  origin: string;
  destination: string;
  shiftedMin?: number;
  /** FOIS paths only */
  day?: number;
  tonnage?: number;
  loco?: string;
  commodity?: string;
}

export interface Machine {
  id: string;
  type: string;
  label: string;
  dept: Dept;
  homeStation: string;
  homeKm: number;
  healthIndex: number;
  hoursSinceOverhaul: number;
  unavailable: { fromDay: number; toDay: number; reason: string }[];
  speedKmph: number;
}

export interface Crew {
  id: string;
  type: string;
  label: string;
  dept: Dept;
  baseStation: string;
  baseKm: number;
  reachKm: number;
  strength: number;
  maxMinPerDay: number;
  restDay: number;
}

export interface RiskExplanation {
  key: string;
  label: string;
  value: number;
  weight: number | null;
  text: string;
}

export interface Risk {
  pfWindow: number;
  pfBlend: number;
  odi: number;
  traffic: number;
  overdue: number;
  escalation: number;
  tsrUplift: number;
  arci: number;
  urgency: Urgency;
  urgencyLabel: string;
  mandatory: boolean;
  /** 'A' safety ≥ 0.95 and due / TSR; 'B' safety ≥ 0.8 with TSR in force or overdue; null otherwise */
  mandatoryRule?: 'A' | 'B' | null;
  /** plain-English reason for the mandatory floor (null when not mandatory) */
  mandatoryReason?: string | null;
  weibull: { beta: number; eta: number };
  explanation: RiskExplanation[];
  mlContributions: { key: string; value: number; contribution: number }[];
  /** bootstrap uncertainty band of ARCI (always contains `arci`) */
  band?: ArciBand;
}

export interface ArciBand {
  /** 5th percentile of bootstrap ARCI (widened to the point estimate if needed) */
  low: number;
  /** 95th percentile of bootstrap ARCI (widened to the point estimate if needed) */
  high: number;
  samples: number;
  method: string;
}

/** Which task values came from the requisition that injected it (UI provenance). */
export interface InjectedFields {
  sourceId: string | null;
  fields: Array<'duration' | 'window' | 'preferredDay' | 'machine' | 'blockKind' | 'dependsOn' | 'coRequireWith' | 'replaces'>;
  /** e.g. "Duration and window from requisition REQ/REQ-0012" */
  note: string;
}

export interface Task {
  id: string;
  sourceId: string;
  source: string;
  dept: Dept;
  deptLabel: string;
  workType: string;
  label: string;
  assetClass: string;
  line: Line;
  startKm: number;
  endKm: number;
  lengthKm: number;
  sections: number[];
  sectionLabel: string;
  oheSections: number[];
  station: string | null;
  blockKind: BlockKind;
  closure: 'LINE' | 'NONE';
  baseDurationMin: number;
  durationMin: number;
  setupMin: number;
  clearanceMin: number;
  totalMin: number;
  machine: string | null;
  crew: string;
  safety: number;
  capital: boolean;
  mandatoryWithinDays: number;
  daysOverdue: number;
  dueDay: number;
  requestedDaysAgo: number;
  ageDays: number;
  conditionIndex: number;
  tsrKmph: number | null;
  tsrSinceDays: number;
  noticeWeeksGiven: number | null;
  targetWeek: number | null;
  workingDaysNeeded: number;
  metrics: Record<string, unknown>;
  nativeLocation: string;
  risk: Risk;
  injected?: boolean;
  groupId?: string;
  /** injected works: a block the work must join (joint-block suggestion) */
  targetBlock?: { day: number; line: Line; start: number; end: number } | null;
  /** 'requisition' when the requested duration was used as given, else 'calibrated' */
  durationSource?: 'requisition' | 'calibrated';
  /** traffic / power block that also needs an S&T disconnection (requisition `requires`) */
  needsDisconnection?: boolean;
  requires?: Array<'POWER_BLOCK' | 'DISCONNECTION'>;
  /** soft preferences from the requisition (plan day 0-based; 'night' = RULES.nightWindow) */
  preferredDay?: number | null;
  preferredWindow?: 'night' | 'day' | null;
  /** task ids that must end before this work starts (resolved from sourceIds) */
  dependsOn?: string[] | null;
  /** task ids that must share this work's block (mutual) */
  coRequireWith?: string[] | null;
  /** register task this requisition replaces (dropped from the run) */
  replacesTaskId?: string | null;
  injectedFields?: InjectedFields | null;
}

export interface AffectedTrain {
  trainId: string;
  number: string;
  name: string;
  cls: TrainClass;
  weight: number;
  premium: boolean;
  line: RunLine;
  mode: 'SLW' | 'HELD' | 'REGULATED';
  delayMin: number;
  weightedDelay: number;
}

export interface BlockTask {
  id: string;
  workType: string;
  label: string;
  dept: Dept;
  start: number;
  end: number;
  startText: string;
  endText: string;
  arci: number;
  urgency: Urgency;
  machineId: string | null;
  crewId: string | null;
  startKm: number;
  endKm: number;
  closure: 'LINE' | 'NONE';
  tsrKmph: number | null;
}

export interface Block {
  id: string;
  day: number;
  date: string;
  dateLabel: string;
  line: Line;
  kind: 'TRAFFIC' | 'POWER' | 'TRAFFIC + POWER' | 'DISCONNECTION';
  lineClosure: boolean;
  sections: number[];
  sectionLabels: string[];
  sectionText: string;
  startKm: number;
  endKm: number;
  start: number;
  end: number;
  startText: string;
  endText: string;
  spanMin: number;
  departments: Dept[];
  coLocated: boolean;
  tasks: BlockTask[];
  machines: string[];
  crews: string[];
  oheSections: OheSection[];
  powerIsolation: string | null;
  affectedTrains: AffectedTrain[];
  weightedDelayMin: number;
  rawDelayMin: number;
  premiumConflicts: number;
  /** made only of works of an approved (fixed) block — keeps that block's id */
  fixed?: boolean;
  /** other windows for this block (whole-block move) or for its highest-ARCI work */
  alternatives?: BlockAlternative[];
  confidence?: BlockConfidence;
  status: string;
}

/** Another window for a work (or a whole block), everything else held. */
export interface BlockAlternative {
  day: number;
  line: Line;
  start: number;
  end: number;
  startText: string;
  endText: string;
  /** change in total plan cost if moved there (negative = cheaper) */
  deltaCost: number;
  /** of the block the work would sit in */
  weightedDelayMin: number;
  trainsAffected: number;
  premiumConflicts: number;
  /** no hard constraint broken anywhere in the plan */
  feasible: boolean;
  /** the hard rule it would break, when not feasible */
  reason: string | null;
  /** e.g. "Same night, 50 min later", "Thursday 23:10, UP line" */
  note: string;
  /** 'block' = whole block moved with every work keeping its offset; 'task' = only this work moved */
  scope: 'task' | 'block';
}

/** Computed confidence of a block (0–1). */
export interface BlockConfidence {
  /** P(all works finish in the time available) — lognormal durations learned from the execution log */
  completion: number;
  /** Monte-Carlo P(no late train path intrudes into the window) — train lateness is an assumption */
  windowReliability: number;
  /** completion × windowReliability */
  overall: number;
  basis: string;
  /** minute of day the work can run to (end of the free window containing the block, or the block end) */
  availableUntil: number;
}

export interface SafetyConflict {
  taskId: string;
  label: string;
  dueDay: number;
  placedDay: number | null;
  /** plain English, e.g. "No free window on or before its due day", "Machine / gang not available", "Rule: blocks per day" */
  reason: string;
  detail: string | null;
}

export interface Weights {
  delay: number;
  downtime: number;
  risk: number;
  colocation: number;
  tsr: number;
  spread: number;
  /** requisition preferences: per day away from preferredDay; 3× for a start outside preferredWindow */
  preference: number;
}

export interface Rules {
  minBlockMin: number;
  maxBlockMin: number;
  headwayMarginMin: number;
  slwDelayMin: number;
  slwCapacityPerHour: number;
  premiumConflictHard: boolean;
  maxBlocksPerDay: number;
  maxConcurrentBlocks: number;
  annealT0: number;
  nightWindow: [number, number];
  noticeWeeksForRegulation: number;
}

export interface ResourceUse {
  day: number;
  start: number;
  end: number;
  taskId: string;
  km?: number;
}

export interface Plan {
  label: string;
  corridorId: string;
  planStart: string;
  days: number;
  blocks: Block[];
  scheduled: { taskId: string; day: number; line: Line; start: number; end: number }[];
  deferred: { taskId: string; arci: number; urgency: Urgency; reason: string }[];
  /** every mandatory work deferred or placed after max(0, dueDay) (or placed without a machine / gang), with a reason */
  safetyConflicts: SafetyConflict[];
  cost: {
    total: number;
    delay: number;
    downtime: number;
    spread: number;
    waiting: number;
    deferred: number;
    /** requisition preference penalty (absent on older snapshots) */
    preference?: number;
    colocationBonus: number;
    hard: number;
    /** plain-text list of every hard constraint broken (empty when feasible) */
    hardReasons: string[];
  };
  resourceViolations: ResourceViolation[];
  machineUse: Record<string, ResourceUse[]>;
  crewUse: Record<string, ResourceUse[]>;
  weights: Weights;
  rules: Rules;
  /** optimiser plans only: up to 3 other windows per scheduled non-fixed work, ranked by deltaCost */
  alternatives?: Record<string, BlockAlternative[]>;
  /** optimiser plans only: how each fixed (approved) block was held */
  fixedReport?: FixedBlockReport[];
  search: {
    iterations: number;
    greedyCost: number;
    finalCost: number;
    improvements: number;
    accepted: number;
    timeMs: number;
    candidateCount: number;
    /** optimiser plans only */
    searchMs?: number;
    alternativesMs?: number;
    confidenceMs?: number;
    solver?: 'greedy+sa' | 'milp+sa';
    /** metadata returned by the MILP construction, when used */
    milp?: MilpMeta | null;
    /** why the requested / supplied construction was not used */
    fallbackReason?: string | null;
  };
  tsrLossPerDay?: Record<string, number>;
}

export interface ResourceViolation {
  taskId: string;
  type: 'MACHINE' | 'CREW';
  detail: string;
}

export interface FixedBlockReport {
  id: string | null;
  day: number;
  taskIds: string[];
  heldTaskIds: string[];
  /** works of the approved block no longer in the register (attended / excluded) */
  missingTaskIds: string[];
  held: boolean;
  note: string | null;
}

export interface KpiAssumptions {
  rupeePerWeightedDelayMinute: number;
  rupeePerBlockHourSaved: number;
  co2KgPerTsrTrainMinute: number;
}

export interface Kpis {
  days: number;
  blockCount: number;
  totalBlockHours: number;
  avgBlockMin: number;
  sectionLineHoursLost: number;
  availability: number;
  tasksTotal: number;
  tasksScheduled: number;
  tasksDeferred: number;
  highRiskTotal: number;
  highRiskWithin72h: number;
  highRiskWithin72hRate: number;
  mandatoryTotal: number;
  mandatoryCompliant: number;
  /** plan.safetyConflicts.length (absent on older snapshots) */
  safetyConflicts?: number;
  /** mean block confidence.overall (null when the plan has no confidence, e.g. the baseline) */
  meanBlockConfidence?: number | null;
  colocationRate: number;
  coLocatedBlocks: number;
  deptsPerBlock: number;
  weightedDelayMin: number;
  rawDelayMin: number;
  trainsAffected: number;
  goodsRegulated: number;
  premiumConflicts: number;
  tsrTasks: number;
  tsrDays: number;
  tsrTrainMinutes: number;
  meanDaysToClearUrgent: number;
  arciClearedShare: number;
  machineHours: number;
  estDelayCostRupees: number;
  assumptions: KpiAssumptions;
}

export interface KpiDelta {
  availabilityPoints: number;
  sectionLineHoursSaved: number;
  blocksAvoided: number;
  blockHoursDelta: number;
  tasksScheduledDelta: number;
  highRiskWithin72hDelta: number;
  colocationRateDelta: number;
  weightedDelayDelta: number;
  weightedDelayPct: number;
  tsrDaysDelta: number;
  tsrTrainMinutesDelta: number;
  trainsAffectedDelta: number;
  estRupeesSaved: number;
  co2KgSaved: number;
}

export interface OccPassage extends Passage {
  trainId: string;
  number: string;
  name: string;
  cls: TrainClass;
  weight: number;
  premium: boolean;
  source: 'COA' | 'FOIS';
  line: RunLine;
}

export interface DayOccupancy {
  day: number;
  date: string;
  dow: number;
  /** key `${sectionIndex}:${line}` → sorted passages */
  occ: Record<string, OccPassage[]>;
  hourly: { section: BlockSection; line: RunLine; hours: number[] }[];
}

export interface HorizonResult {
  horizon: 'weekly' | 'monthly';
  tasks: Task[];
  ai: Plan;
  baseline: Plan;
  kpis: Kpis;
  baseKpis: Kpis;
  delta: KpiDelta;
}

export interface WeeklyResult extends HorizonResult {
  horizon: 'weekly';
  occupancy: DayOccupancy[];
}

export interface CalendarDay {
  day: number;
  date: string;
  label: string;
  dow: number;
  blocks: Block[];
  closureMin: number;
  departments: Dept[];
  capital: boolean;
}

export interface MonthlyResult extends HorizonResult {
  horizon: 'monthly';
  calendar: CalendarDay[];
}

export interface RollingEntry {
  taskId: string;
  week: number;
  weekLabel: string;
  start: string;
  end: string;
  label: string;
  dept: Dept;
  workType: string;
  sectionLabel: string;
  line: Line;
  startKm: number;
  endKm: number;
  workingDays: number;
  dailyBlockMin: number;
  machine: string;
  regulationNeeded: boolean;
  noticeNeeded: number;
  noticeGiven: number;
  status: 'LOCKED' | 'PROPOSED' | 'NOTICE_SHORTFALL';
  targetWeek: number | null;
  arci: number;
}

export interface RollingWeek {
  week: number;
  isoWeek: number;
  start: string;
  end: string;
  label: string;
  entries: RollingEntry[];
  machineLoad: Record<string, number>;
  megaBlocks: number;
}

export interface Rolling {
  entries: RollingEntry[];
  weeks: RollingWeek[];
  forecast: { week: number; per: Record<string, number>; total: number }[];
  noticeRule: number;
}

export interface WeibullFit {
  beta: number;
  eta: number;
  n: number;
  failures: number;
  converged: boolean;
  logLik: number;
  b10Days: number;
  medianDays: number;
  wearOut: boolean;
  truth: { beta: number; eta: number; label: string } | null;
  label: string;
}

export interface ClassifierMetrics {
  n: number;
  accuracy: number;
  precision: number;
  recall: number;
  auc: number;
  logLoss: number;
  confusion: { tp: number; fp: number; tn: number; fn: number };
}

export interface DurationFactor {
  factor: number;
  samples: number;
  meanRatio: number;
  overrunRate: number;
  /** records used for the spread (= samples) */
  n?: number;
  /** mean of log(actual / planned) */
  meanLog?: number;
  /** sd of log(actual / planned); the block completion model uses 0.18 when n < 3 */
  sdLog?: number;
}

export interface ExecutionLogRecord {
  workType: string;
  plannedMin: number;
  actualMin: number;
  daysAgo: number;
  overrunReason: string | null;
}

export interface DataIssue {
  source: string;
  id: string;
  issue: string;
  taskId?: string;
}

export interface Snapshot {
  /** RNG seed the feeds were generated with */
  seed: number;
  corridor: Corridor;
  planStart: string;
  feeds: {
    timetable: Train[];
    freight: Train[];
    tms: Record<string, unknown>[];
    smms: Record<string, unknown>[];
    tdms: Record<string, unknown>[];
    machines: Machine[];
    crews: Crew[];
    executionLog: ExecutionLogRecord[];
    failureHistoryCounts: Record<string, number>;
    escalationHistoryCount: number;
    weather?: WeatherDay[];
  };
  counts: { TMS: number; SMMS: number; TDMS: number; total: number; rejected: number };
  issues: DataIssue[];
  anomalies?: Anomaly[];
  pairs: { a: string; b: string; sections: number[] }[];
  tasks: Task[];
  models: {
    weibull: Record<string, WeibullFit>;
    escalationMetrics: { test: ClassifierMetrics; train: ClassifierMetrics; nTrain: number; nTest: number };
    escalation: { keys: string[]; w: number[]; b: number; mean: number[]; sd: number[] };
  };
  factors: Record<string, DurationFactor>;
  tsrLossPerDay: Record<string, number>;
  assetPopulation: Record<string, number>;
  density: { dens: Record<string, number>; max: number };
  result: {
    weekly: WeeklyResult;
    monthly: MonthlyResult;
    rolling: Rolling;
    weights: Weights;
    rules: Rules;
  };
  scenario: Scenario | null;
  timing: { ms: number };
}

/** A field / intake / scenario defect injected into the task register before planning. */
export interface InjectSpec {
  /** stable id of the requisition / report that produced this work (provenance) */
  sourceId?: string;
  label?: string;
  workType: string;
  line: Line;
  startKm: number;
  endKm: number;
  daysOverdue?: number;
  tsrKmph?: number | null;
  note?: string;
  ageDays?: number;
  conditionIndex?: number;
  groupId?: string | null;
  targetBlock?: { day: number; line: Line; start: number; end: number } | null;
  /** planned only on this corridor (skipped by runs of other corridors) */
  corridorId?: string;
  /** work minutes requested; used as given instead of the work type's calibrated duration */
  durationMin?: number;
  /** soft preference: plan day 0–6 (weight `preference` per day away) */
  preferredDay?: number;
  /** soft preference: 'night' = RULES.nightWindow (wraps midnight), 'day' = outside it */
  preferredWindow?: 'night' | 'day' | 'any';
  /** machine type (MACHINE_TYPES key) or unit id; null = no machine */
  machine?: string | null;
  blockKind?: 'TRAFFIC' | 'POWER' | 'TRAFFIC + POWER' | 'DISCONNECTION';
  requires?: Array<'POWER_BLOCK' | 'DISCONNECTION'>;
  /** sourceIds or task ids that must be finished before this work starts (hard) */
  dependsOn?: string[];
  /** sourceIds or task ids that must share this work's block (hard) */
  coRequireWith?: string[];
  /** register task id this requisition replaces (dropped from the run) */
  replacesTaskId?: string;
}

export interface FixedBlockConstraint { id?: string; day: number; line: Line; start: number; end: number; taskIds: string[]; /** per-task windows as they were when fixed */ tasks?: { id: string; start: number; end: number }[] }

export interface WeatherDay { day: number; date: string; fogNight: boolean; visibilityM: number | null; rainMm: number; maxTempC: number; windKmph: number | null; source: 'seeded' | 'open-meteo' }

export interface Anomaly { id: string; kind: 'OVERRUN' | 'FAILURE_SPIKE' | 'DATA'; severity: 'high' | 'medium' | 'low'; title: string; detail: string; ref?: string; value?: number; expected?: number; z?: number }

export interface Scenario {
  id?: string;
  name?: string;
  injectTasks?: InjectSpec[];
  removeMachines?: string[];
  cancelTrains?: string[];
  addPremiumTrain?: { line: RunLine; dep: number } | null;
  freightSurge?: number;
  speedCapKmph?: number;
  /** actual-vs-planned records from the execution log, re-learned into duration factors */
  extraExecution?: ExecutionLogRecord[];
}

/** Imported register rows: a plain list is appended; { records, mode: 'replace' } swaps the seeded register. */
export type ImportedRegister = Record<string, unknown>[] | { records: Record<string, unknown>[]; mode?: 'append' | 'replace' };

export interface PlanRequest {
  corridorId: string;
  weights?: Partial<Weights>;
  rules?: Partial<Rules>;
  iterations?: number;
  seed?: number;
  scenario?: Scenario | null;
  /** raised to the mandatory floor for this run */
  pinnedTaskIds?: string[];
  /** dropped before ranking (attended, withdrawn) */
  excludedTaskIds?: string[];
  /** concurred / granted / locked / in-progress blocks held fixed as solver constraints on every run */
  fixedBlocks?: FixedBlockConstraint[];
  /** construction for the weekly plan: 'sa' greedy + annealing (default), 'milp' MILP + annealing when wired */
  solver?: 'sa' | 'milp';
  /** records imported from TMS / SMMS / TDMS files (passed through to the planning context) */
  imported?: { tms?: ImportedRegister; smms?: ImportedRegister; tdms?: ImportedRegister } | null;
  /** weather for the plan days (passed through to the planning context) */
  weather?: WeatherDay[] | null;
}

/** One candidate window of a task in the optimiser (scheduler.js candidatesFor). */
export interface SolverCandidate {
  day: number;
  line: Line;
  start: number;
  end: number;
  gap: number;
  fixed?: boolean;
  fixedBlockId?: string | null;
}

/** Arguments handed to an external construction (e.g. the MILP) by planHorizon. */
export interface ConstructArgs {
  tasks: Task[];
  cands: Map<string, SolverCandidate[]>;
  dayOccs: unknown[];
  rules: Rules;
  weights: Weights;
  tasksById: Map<string, Task>;
  machines: Machine[];
  crews: Crew[];
  days: number;
  tsrLoss: Map<string, number>;
  fixedAssignments: Map<string, SolverCandidate>;
  allowPremium: boolean;
  /** per-day planning effect of the weather (weather.js weatherEffects), when known */
  weather?: unknown[] | null;
}

/** What the exact MILP construction (src/engine/milp.js, HiGHS) reports about its solve. */
export interface MilpMeta {
  /** e.g. "HiGHS 1.15.1 (WebAssembly, branch-and-cut)" */
  solver: string;
  model: string;
  /** HiGHS model status, e.g. "Optimal" or "Time limit reached" */
  status: string;
  optimal: boolean;
  /** which construction won: 'MILP' or 'greedy construction' */
  source: string;
  objective: number | null;
  bound: number | null;
  gapPct: number | null;
  planCost: number;
  planGapPct: number | null;
  greedyCost: number;
  timeMs: number;
  solveSec: number;
  variables: number;
  binaries: number;
  constraints: number;
  scheduled: number;
  deferred: number;
  mandatoryUnplaced: string[];
  approximations: string[];
  [k: string]: unknown;
}

/** Must return, for every task id, one of its candidates (same fields) or null; may throw. */
export type ConstructFn = (args: ConstructArgs) => { assign: Map<string, SolverCandidate | null>; meta?: unknown };

export type WorkerMessage =
  | { id: number; type: 'progress'; step: string; text: string }
  | { id: number; type: 'done'; snapshot: Snapshot }
  | { id: number; type: 'error'; message: string; stack?: string };

export type ProgressHandler = (m: { step: string; text: string }) => void;

/** Omit that distributes over a union (plain Omit collapses discriminated unions). */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
