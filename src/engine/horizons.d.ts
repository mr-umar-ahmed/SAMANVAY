import type { Rolling, Rules } from './types';
import type { PlanningContext } from './planner';

/** 26-week Rolling Block Programme; `rules.noticeWeeksForRegulation` sets the JPO notice (default RULES). */
export function buildRolling(ctx: PlanningContext, rules?: Partial<Rules>): Rolling;
