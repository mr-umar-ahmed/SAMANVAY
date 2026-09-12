/** Typed view of plan.search.milp — the metadata engine/milp.js makeMilpConstruct returns. */
import type { Plan } from '../../engine/types';

/** Fields of plan.search.milp (engine/milp.js makeMilpConstruct meta); every one optional. */
export interface MilpMeta {
  solver?: string;
  model?: string;
  status?: string;
  optimal?: boolean;
  source?: string;
  objective?: number | null;
  bound?: number | null;
  gapPct?: number | null;
  planCost?: number | null;
  planGapPct?: number | null;
  warmStartCost?: number | null;
  timeMs?: number | null;
  solveSec?: number | null;
  variables?: number | null;
  binaries?: number | null;
  constraints?: number | null;
  repairedTasks?: string[];
  approximations?: string[];
}

export function milpMeta(plan: Plan | null | undefined): MilpMeta | null {
  const m = plan?.search?.milp;
  return m && typeof m === 'object' ? (m as MilpMeta) : null;
}

