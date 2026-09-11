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
  weibull: { beta: number; eta: number };
  explanation: RiskExplanation[];
  mlContributions: { key: string; value: number; contribution: number }[];
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
  status: string;
}

export interface Weights {
  delay: number;
  downtime: number;
  risk: number;
  colocation: number;
  tsr: number;
  spread: number;
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
  cost: {
    total: number;
    delay: number;
    downtime: number;
    spread: number;
    waiting: number;
    deferred: number;
    colocationBonus: number;
    hard: number;
    hardReasons: string[];
  };
  resourceViolations: { taskId: string; type: 'MACHINE' | 'CREW'; detail: string }[];
  machineUse: Record<string, ResourceUse[]>;
  crewUse: Record<string, ResourceUse[]>;
  weights: Weights;
  rules: Rules;
  search: {
    iterations: number;
    greedyCost: number;
    finalCost: number;
    improvements: number;
    accepted: number;
    timeMs: number;
    candidateCount: number;
  };
  tsrLossPerDay?: Record<string, number>;
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
  };
  counts: { TMS: number; SMMS: number; TDMS: number; total: number; rejected: number };
  issues: DataIssue[];
  pairs: { a: string; b: string; sections: number[] }[];
  tasks: Task[];
  models: {
    weibull: Record<string, WeibullFit>;
    escalationMetrics: { test: ClassifierMetrics; train: ClassifierMetrics; nTrain: number; nTest: number };
    escalation: { keys: string[]; w: number[]; b: number; mean: number[]; sd: number[] };
  };
  factors: Record<string, { factor: number; samples: number; meanRatio: number; overrunRate: number }>;
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
}

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
}

export type WorkerMessage =
  | { id: number; type: 'progress'; step: string; text: string }
  | { id: number; type: 'done'; snapshot: Snapshot }
  | { id: number; type: 'error'; message: string; stack?: string };

export type ProgressHandler = (m: { step: string; text: string }) => void;

/** Omit that distributes over a union (plain Omit collapses discriminated unions). */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
