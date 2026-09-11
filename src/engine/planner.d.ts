import type { Corridor, Rules, Scenario, Snapshot, Task, Weights, WeeklyResult, MonthlyResult, Rolling, InjectSpec } from './types';

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
}

export function createContext(
  corridorId: string,
  opts?: { seed?: number; planStart?: string; feeds?: PlanningContext['feeds'] | null; scenario?: Scenario | null }
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
  opts?: { weights?: Partial<Weights>; rules?: Partial<Rules>; iterations?: number; seed?: number }
): PlanningResult;

export function applyScenario(corridor: Corridor, feeds: PlanningContext['feeds'], scenario: Scenario, planStart: Date): PlanningContext['feeds'];

export const CORRIDORS: Corridor[];
export const DEFAULT_WEIGHTS: Weights;
export const RULES: Rules;
export type { InjectSpec };
