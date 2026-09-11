/// <reference lib="webworker" />
/**
 * Planning worker: runs the whole engine (feeds → normalise → risk models →
 * weekly / monthly / 26-week plans → baseline → KPIs) off the main thread and
 * posts a plain-data snapshot back.
 */
import { createContext, runPlanning } from './planner.js';
import { hourlyLoad } from './occupancy.js';
import { isoDate } from './time.js';
import type { DayOccupancy, DistributiveOmit, PlanRequest, Snapshot, WorkerMessage } from './types';

declare const self: DedicatedWorkerGlobalScope;

type OccInternal = { day: number; date: Date; dow: number; occ: DayOccupancy['occ'] };

function serialiseOcc(dayOccs: OccInternal[], corridor: Snapshot['corridor']): DayOccupancy[] {
  return dayOccs.map((d) => ({
    day: d.day,
    date: isoDate(d.date),
    dow: d.dow,
    occ: d.occ,
    hourly: hourlyLoad(d, corridor) as DayOccupancy['hourly'],
  }));
}

self.onmessage = (ev: MessageEvent<PlanRequest & { id: number }>) => {
  const { id, corridorId, weights, rules, iterations, scenario, seed, pinnedTaskIds = [], excludedTaskIds = [] } = ev.data;
  const post = (m: DistributiveOmit<WorkerMessage, 'id'>) => self.postMessage({ id, ...m } as WorkerMessage);
  const t0 = Date.now();
  try {
    post({ type: 'progress', step: 'ingest', text: 'Reading COA timetable, FOIS forecast and the TMS / SMMS / TDMS registers' });
    const ctx = createContext(corridorId, { seed: seed || 26027, scenario: scenario || null });
    post({
      type: 'progress',
      step: 'risk',
      text: `Weibull models fitted · escalation predictor trained (AUC ${ctx.models.escalationMetrics.test.auc.toFixed(2)}) · ${ctx.tasks.length} works scored`,
    });
    // Planner overrides: excluded works are dropped (attended / withdrawn); pinned works are raised to the mandatory floor.
    if (excludedTaskIds.length) {
      const ex = new Set(excludedTaskIds);
      ctx.tasks = ctx.tasks.filter((t) => !ex.has(t.id));
      ctx.ranked = ctx.ranked.filter((t) => !ex.has(t.id));
    }
    if (pinnedTaskIds.length) {
      const pin = new Set(pinnedTaskIds);
      for (const t of ctx.tasks) {
        if (!pin.has(t.id)) continue;
        t.risk.mandatory = true;
        t.risk.arci = Math.max(t.risk.arci, 0.92);
        t.risk.urgency = 'IMMEDIATE';
        t.risk.urgencyLabel = 'Immediate (≤ 24 h)';
        if (t.dueDay > 1) t.dueDay = 1;
        t.risk.explanation.push({ key: 'pinned', label: 'Pinned by planner', value: 1, weight: null, text: 'raised to the mandatory floor for this run' });
      }
    }
    post({ type: 'progress', step: 'weekly', text: 'Optimising the weekly plan (greedy construction + simulated annealing)' });
    const result = runPlanning(ctx, { weights, rules, iterations });
    post({ type: 'progress', step: 'monthly', text: 'Monthly plan and 26-week programme assembled' });

    const strip = <T extends { dayOccs?: unknown }>(p: T) => {
      const copy = { ...p } as T & { dayOccs?: unknown };
      delete copy.dayOccs;
      return copy;
    };
    const m = ctx.models.escalation;
    const weeklyAi = result.weekly.ai;
    const snapshot: Snapshot = {
      corridor: ctx.corridor,
      planStart: ctx.planStartIso,
      feeds: {
        timetable: ctx.feeds.timetable,
        freight: ctx.feeds.freight,
        tms: ctx.feeds.tms,
        smms: ctx.feeds.smms,
        tdms: ctx.feeds.tdms,
        machines: ctx.feeds.machines,
        crews: ctx.feeds.crews,
        executionLog: ctx.feeds.executionLog,
        failureHistoryCounts: Object.fromEntries(Object.entries(ctx.feeds.failureHistory).map(([k, v]) => [k, v.length])),
        escalationHistoryCount: ctx.feeds.escalationHistory.length,
      },
      counts: ctx.counts,
      issues: ctx.issues,
      pairs: ctx.pairs,
      tasks: ctx.tasks,
      models: {
        weibull: ctx.models.weibull,
        escalationMetrics: ctx.models.escalationMetrics,
        escalation: { keys: m.keys, w: m.w, b: m.b, mean: m.mean, sd: m.sd },
      },
      factors: ctx.factors,
      tsrLossPerDay: ctx.tsrLossPerDay,
      assetPopulation: ctx.assetPopulation,
      density: { dens: ctx.density.dens, max: ctx.density.max },
      result: {
        weekly: {
          ...result.weekly,
          ai: strip(weeklyAi),
          baseline: strip(result.weekly.baseline),
          occupancy: serialiseOcc(weeklyAi.dayOccs as OccInternal[], ctx.corridor),
        },
        monthly: { ...result.monthly, ai: strip(result.monthly.ai), baseline: strip(result.monthly.baseline) },
        rolling: result.rolling,
        weights: result.weights,
        rules: result.rules,
      },
      scenario: scenario || null,
      timing: { ms: Date.now() - t0 },
    };
    post({ type: 'done', snapshot });
  } catch (e) {
    const err = e as Error;
    post({ type: 'error', message: err.message, stack: err.stack });
  }
};
