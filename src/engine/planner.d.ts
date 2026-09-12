import type { Corridor, Rules, Scenario, Snapshot, Task, Weights, WeeklyResult, MonthlyResult, Rolling, InjectSpec, FixedBlockConstraint, PlanRequest, WeatherDay, ConstructFn, Anomaly } from './types';

export const DEFAULT_PLAN_START: string;
export function parsePlanStart(s?: string): Date;

export interface PlanningContext {
  corridor: Corridor;
  corridorId: string;
  seed: number;
  planStart: Date;
  planStartIso: string;
  feeds: {
    corridorId: string;
    seed: number;
    timetable: Snapshot['feeds']['timetable'];
    freight: Snapshot['feeds']['freight'];
    tms: Record<string, unknown>[];
    smms: Record<string, unknown>[];
    tdms: Record<string, unknown>[];
    machines: Snapshot['feeds']['machines'];
    crews: Snapshot['feeds']['crews'];
    failureHistory: Record<string, { t: number; failed: boolean }[]>;
    escalationHistory: Record<string, number | boolean>[];
    executionLog: Snapshot['feeds']['executionLog'];
    weather?: WeatherDay[];
  };
  factors: Snapshot['factors'];
  tasks: Task[];
  ranked: Task[];
  issues: Snapshot['issues'];
  counts: Snapshot['counts'];
  pairs: Snapshot['pairs'];
  models: {
    weibull: Snapshot['models']['weibull'];
    escalation: { keys: string[]; w: number[]; b: number; mean: number[]; sd: number[]; trained: boolean };
    escalationMetrics: Snapshot['models']['escalationMetrics'];
  };
  density: { dens: Record<string, number>; max: number; key: (s: number, l: string) => string };
  tsrLossPerDay: Record<string, number>;
  assetPopulation: Record<string, number>;
  meanAge: Record<string, number>;
  scenario: Scenario | null;
  rolling: Rolling;
  /** records imported from department files (request pass-through; wired by the data layer) */
  imported: PlanRequest['imported'];
  /** weather supplied with the request (pass-through; wired by the data layer) */
  weatherOverride: WeatherDay[] | null;
  /** planning effect of each day's weather (fog night cap, rain / wind / heat screens) */
  weatherEffects: Array<{ nightSpeedCapKmph: number | null; outdoorPenalty: number; avoidWorkTypes: string[]; daytimeAvoidWorkTypes: string[]; heatBucklingRisk: boolean; railTempC: number | null; reasons: string[] }>;
  /** plan days with a fog night (trains re-timed under the fog cap that night) */
  fogDays: number[];
  feedsForDay: ((day: number) => PlanningContext['feeds']) | null;
  anomalies: Anomaly[];
  /** ARCI bootstrap run: resamples and time taken */
  bands: { samples: number; timeMs: number };
}

export function createContext(
  corridorId: string,
  opts?: {
    seed?: number;
    planStart?: string;
    feeds?: PlanningContext['feeds'] | null;
    scenario?: Scenario | null;
    imported?: PlanRequest['imported'];
    weather?: WeatherDay[] | null;
    /** ARCI bootstrap resamples (0 = no bands) */
    bootstrapSamples?: number;
  }
): PlanningContext;

export interface PlanningResult {
  weekly: WeeklyResult & { ai: WeeklyResult['ai'] & { dayOccs: unknown[] }; baseline: WeeklyResult['baseline'] & { dayOccs: unknown[] } };
  monthly: MonthlyResult & { ai: MonthlyResult['ai'] & { dayOccs: unknown[] }; baseline: MonthlyResult['baseline'] & { dayOccs: unknown[] } };
  rolling: Rolling;
  weights: Weights;
  rules: Rules;
}

export function runPlanning(
  ctx: PlanningContext,
  opts?: {
    weights?: Partial<Weights>;
    rules?: Partial<Rules>;
    iterations?: number;
    seed?: number;
    fixedBlocks?: FixedBlockConstraint[];
    /** construction for the WEEKLY horizon (e.g. MILP); annealing polishes it */
    construct?: ConstructFn | null;
    /** requested solver (recorded; 'milp' without `construct` falls back to greedy with a reason) */
    solver?: PlanRequest['solver'] | null;
  }
): PlanningResult;

export function applyScenario(corridor: Corridor, feeds: PlanningContext['feeds'], scenario: Scenario, planStart: Date): PlanningContext['feeds'];

export const CORRIDORS: Corridor[];
export const DEFAULT_WEIGHTS: Weights;
export const RULES: Rules;
export type { InjectSpec };
