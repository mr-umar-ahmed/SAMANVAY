/**
 * ROI view model shared by DivisionBriefPage and RoiPage so both show the
 * same rupee figure. Every rupee comes from computeRoiModel (src/engine/roi.js)
 * over the weekly plan vs the simulated baseline, multiplied by the editable
 * assumptions in the store. Nothing here adds a number of its own.
 *
 * One guard: roi.js substitutes placeholder rake counts (4 baseline / 1 plan)
 * when a plan regulates no goods train. A line built on a placeholder is shown
 * as "not computed" and left out of the total.
 */
import { computeRoiModel } from '../../engine/roi.js';
import type { Corridor, WeeklyResult } from '../../engine/types';
import type { RoiAssumptions } from '../../store/useAppStore';

export type RoiLineKey = 'delay' | 'line' | 'demurrage' | 'energy' | 'mobilisation' | 'other';

const CATEGORY_KEY: Record<string, RoiLineKey> = {
  'Punctuality & Delay Penalties': 'delay',
  'Corridor Line Capacity': 'line',
  'Freight Turnaround & Demurrage': 'demurrage',
  'Traction Energy & Fuel': 'energy',
  'Machine & Gang Mobilization': 'mobilisation',
};

export interface RoiLine {
  key: RoiLineKey;
  /** English category from roi.js (used when the page has no translation for it) */
  category: string;
  baselineRupees: number;
  planRupees: number;
  /** baseline − plan, as computed by roi.js (negative when the plan costs more) */
  savingsRupees: number;
  /** the model's own quantity for this line, when it is not a single KPI (delay: train-minutes; demurrage: rake-hours) */
  baselineQty?: number;
  planQty?: number;
  /** true when the plan costs more than the baseline on this line (roi.js floors the saving at zero) */
  planCostsMore: boolean;
  /** false when the line rests on a roi.js placeholder and is left out of the total */
  counted: boolean;
}

export interface RoiSummary {
  lines: RoiLine[];
  carbonRupees: number;
  co2KgSaved: number;
  /** weekly total of counted lines + carbon offset */
  totalRupees: number;
  /** rupees left out of the total because they rest on a placeholder */
  excludedRupees: number;
  demurragePlaceholder: boolean;
}

/** Rupee-valued assumption keys (scaled by the sensitivity slider). co2KgPerTsrMin is physical, not scaled. */
export const RUPEE_KEYS: (keyof RoiAssumptions)[] = ['delayPerMinuteVb', 'delayPerMinuteMailExp', 'delayPerMinuteGoods', 'lineHourOpportunity', 'freightDemurragePerHour', 'tsrEnergyPerTrainMin', 'machineSetupPerBlock', 'carbonCreditPerTon'];

export function scaleAssumptions(a: RoiAssumptions, k: number): RoiAssumptions {
  const out = { ...a };
  for (const key of RUPEE_KEYS) out[key] = a[key] * k;
  return out;
}

type DelayQty = { premiumMin: number; passengerMin: number; goodsSlwMin: number };
function lineQty(key: string, q: { baseline: unknown; plan: unknown } | undefined): { baselineQty?: number; planQty?: number } {
  if (!q) return {};
  if (key === 'delay') {
    const total = (d: DelayQty) => d.premiumMin + d.passengerMin + d.goodsSlwMin;
    return { baselineQty: total(q.baseline as DelayQty), planQty: total(q.plan as DelayQty) };
  }
  if (key === 'demurrage') return { baselineQty: (q.baseline as number) / 60, planQty: (q.plan as number) / 60 };
  return {};
}

export function roiSummary(weekly: WeeklyResult, corridor: Corridor, assumptions: RoiAssumptions): RoiSummary {
  const model = computeRoiModel(weekly, corridor, assumptions);
  // roi.js no longer substitutes placeholder quantities: every line is counted.
  const demurragePlaceholder = false;
  const lines: RoiLine[] = model.lineItems.map((li) => {
    const key = CATEGORY_KEY[li.category] ?? 'other';
    return {
      key,
      category: li.category,
      baselineRupees: li.baselineRupees,
      planRupees: li.aiRupees,
      savingsRupees: li.savingsRupees,
      planCostsMore: li.aiRupees > li.baselineRupees,
      counted: true,
      ...lineQty(key, li.quantities),
    };
  });
  const excludedRupees = lines.filter((l) => !l.counted).reduce((s, l) => s + l.savingsRupees, 0);
  return {
    lines,
    carbonRupees: model.carbonRupees,
    co2KgSaved: model.co2KgSaved,
    totalRupees: model.totalSavingsRupees - excludedRupees,
    excludedRupees,
    demurragePlaceholder,
  };
}
