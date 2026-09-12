/**
 * Shared, pure helpers for the planning pages: KPI comparison (plan vs
 * baseline vs candidate), block workflow state, and hourly occupancy
 * profiles derived from snapshot.result.weekly.occupancy. Nothing here
 * invents a number — every value is read from or computed on the snapshot.
 */
import type { Corridor, DayOccupancy, Kpis, RunLine } from '../../engine/types';
import type { WorkingBlock } from '../../engine/select';
import { MIN_PER_DAY, num, pct, pts, signed } from '../../lib/format';

/**
 * Seed of the seeded feeds. The store never sends a seed, so the worker plans
 * with its default (`seed || 26027`, src/engine/worker.ts → dataFactory.buildFeeds).
 */
export const FEED_SEED = 26027;

/* ── KPIs ───────────────────────────────────────────────────── */

export type KpiKey = 'availability' | 'closure' | 'colocation' | 'mandatory' | 'delay' | 'tsrDays';

export const ALL_KPIS: KpiKey[] = ['availability', 'closure', 'colocation', 'mandatory', 'delay', 'tsrDays'];

/** Keys where a smaller number is the better plan. */
const LOWER_IS_BETTER: Record<KpiKey, boolean> = { availability: false, closure: true, colocation: false, mandatory: false, delay: true, tsrDays: true };
/** Keys stored as a 0..1 share (delta shown in percentage points). */
const IS_SHARE: Record<KpiKey, boolean> = { availability: true, closure: false, colocation: true, mandatory: true, delay: false, tsrDays: false };

export function mandatoryRate(k: Kpis): number | null {
  return k.mandatoryTotal > 0 ? k.mandatoryCompliant / k.mandatoryTotal : null;
}

export function kpiValue(k: Kpis, key: KpiKey): number | null {
  switch (key) {
    case 'availability':
      return k.availability;
    case 'closure':
      return k.totalBlockHours;
    case 'colocation':
      return k.colocationRate;
    case 'mandatory':
      return mandatoryRate(k);
    case 'delay':
      return k.weightedDelayMin;
    case 'tsrDays':
      return k.tsrDays;
  }
}

export interface KpiCompare {
  key: KpiKey;
  value: number | null;
  ref: number | null;
  /** value − ref (same unit as the value; shares stay 0..1) */
  delta: number | null;
  /** true = better than the reference, false = worse, null = equal / not comparable */
  better: boolean | null;
}

export function compareKpi(key: KpiKey, value: Kpis, ref: Kpis): KpiCompare {
  const a = kpiValue(value, key);
  const b = kpiValue(ref, key);
  if (a === null || b === null) return { key, value: a, ref: b, delta: null, better: null };
  const delta = a - b;
  const eps = IS_SHARE[key] ? 1e-6 : 1e-3;
  const better = Math.abs(delta) < eps ? null : LOWER_IS_BETTER[key] ? delta < 0 : delta > 0;
  return { key, value: a, ref: b, delta, better };
}

export function formatKpi(key: KpiKey, v: number | null): string {
  if (v === null) return '—';
  switch (key) {
    case 'availability':
      return pct(v, 2);
    case 'colocation':
    case 'mandatory':
      return pct(v, 1);
    case 'closure':
      return `${num(v, 1)} h`;
    case 'delay':
      return `${num(v)} min`;
    case 'tsrDays':
      return `${num(v)} d`;
  }
}

export function formatKpiDelta(key: KpiKey, d: number | null): string {
  if (d === null) return '—';
  switch (key) {
    case 'availability':
      return pts(d * 100, 2);
    case 'colocation':
    case 'mandatory':
      return pts(d * 100, 1);
    case 'closure':
      return signed(d, 1, ' h');
    case 'delay':
      return signed(d, 0, ' min');
    case 'tsrDays':
      return signed(d, 0, ' d');
  }
}

/* ── Block workflow state ───────────────────────────────────── */

export type FlowState = 'DRAFT' | 'AWAITING' | 'READY' | 'GRANTED' | 'LOCKED' | 'REFUSED' | 'SUPERSEDED';

/** Planning-page label of the derived workflow state (select.workflowState via WorkingBlock.state). */
export function flowState(b: WorkingBlock): FlowState {
  switch (b.state) {
    case 'PROPOSED':
      return 'AWAITING';
    case 'CONCURRED':
      return 'READY';
    case 'GRANTED':
    case 'LOCKED':
    case 'REFUSED':
    case 'SUPERSEDED':
    case 'DRAFT':
      return b.state;
    default:
      return 'DRAFT';
  }
}

export const FLOW_TONE: Record<FlowState, 'gray' | 'warn' | 'ok' | 'info' | 'crit' | 'blue'> = {
  DRAFT: 'gray',
  AWAITING: 'warn',
  READY: 'blue',
  GRANTED: 'ok',
  LOCKED: 'info',
  REFUSED: 'crit',
  SUPERSEDED: 'warn',
};

/* ── Hourly occupancy profile ───────────────────────────────── */

export interface HourProfile {
  /** section-line rows included */
  rows: number;
  /** free minutes per hour (outside the headway margin of every train), mean over rows */
  freeMean: number[];
  /** free minutes per hour on the tightest row */
  freeMin: number[];
  /** trains touching the hour, mean over rows */
  trainsMean: number[];
  /** trains touching the hour on the busiest row */
  trainsMax: number[];
  /** share of the day within the headway margin of a train, mean over rows */
  occupiedMean: number;
  /** the busiest row by occupied share */
  busiest: { sectionLabel: string; line: RunLine; share: number } | null;
}

/**
 * Hour-by-hour profile of one plan day from the serialised occupancy
 * (passages per block section and line) with the rule headway margin.
 */
export function hourProfile(day: DayOccupancy, corridor: Corridor, marginMin: number, line?: RunLine): HourProfile {
  const freeRows: number[][] = [];
  const trainRows: number[][] = [];
  let busiest: HourProfile['busiest'] = null;
  let occupiedSum = 0;
  for (const sec of corridor.blockSections) {
    for (const l of corridor.lines) {
      if (line && l !== line) continue;
      const ps = day.occ[`${sec.index}:${l}`] ?? [];
      const busy: [number, number][] = [];
      for (const p of ps) {
        const s = Math.max(0, p.enter - marginMin);
        const e = Math.min(MIN_PER_DAY, p.exit + marginMin);
        if (e <= s) continue;
        const last = busy[busy.length - 1];
        if (last && s <= last[1]) last[1] = Math.max(last[1], e);
        else busy.push([s, e]);
      }
      const free = new Array<number>(24).fill(60);
      let occupied = 0;
      for (const [s, e] of busy) {
        occupied += e - s;
        for (let h = Math.floor(s / 60); h <= Math.min(23, Math.floor((e - 1) / 60)); h++) {
          const ov = Math.min(e, (h + 1) * 60) - Math.max(s, h * 60);
          if (ov > 0) free[h] -= ov;
        }
      }
      freeRows.push(free.map((v) => Math.max(0, v)));
      const hourly = day.hourly.find((r) => r.section.index === sec.index && r.line === l);
      trainRows.push(hourly ? hourly.hours : new Array<number>(24).fill(0));
      const share = occupied / MIN_PER_DAY;
      occupiedSum += share;
      if (!busiest || share > busiest.share) busiest = { sectionLabel: sec.label, line: l, share };
    }
  }
  const n = freeRows.length;
  const col = (rows: number[][], h: number) => rows.map((r) => r[h] ?? 0);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const hours = Array.from({ length: 24 }, (_, h) => h);
  return {
    rows: n,
    freeMean: hours.map((h) => mean(col(freeRows, h))),
    freeMin: hours.map((h) => (n ? Math.min(...col(freeRows, h)) : 0)),
    trainsMean: hours.map((h) => mean(col(trainRows, h))),
    trainsMax: hours.map((h) => (n ? Math.max(...col(trainRows, h)) : 0)),
    occupiedMean: n ? occupiedSum / n : 0,
    busiest,
  };
}

export function argMin(xs: number[]): number {
  let best = 0;
  for (let i = 1; i < xs.length; i++) if (xs[i] < xs[best]) best = i;
  return best;
}

export function argMax(xs: number[]): number {
  let best = 0;
  for (let i = 1; i < xs.length; i++) if (xs[i] > xs[best]) best = i;
  return best;
}

/** "08:00–09:00" for an hour index. */
export function hourRange(h: number): string {
  return `${String(h).padStart(2, '0')}:00–${String((h + 1) % 24).padStart(2, '0')}:00`;
}

/* ── Strings shared by the planning pages ───────────────────── */

export const planStrings = {
  en: {
    k_availability: 'Corridor availability',
    k_closure: 'Line-closure hours',
    k_colocation: 'Co-location',
    k_mandatory: 'Mandatory compliance',
    k_delay: 'Train-minutes lost',
    k_tsrDays: 'TSR-days in force',
    m_availability: 'Share of section-line time open to traffic: 1 − closed section-line minutes ÷ all section-line minutes in the horizon.',
    m_closure: 'Sum of the spans of every line-closure block in the horizon.',
    m_colocation: 'Share of line-closure works that share their block with another department.',
    m_mandatory: 'Mandatory works placed on or before their due day ÷ all mandatory works.',
    m_delay: 'Class-weighted train-minutes of delay caused by the blocks (delay model on the timetable).',
    m_tsrDays: 'Task-days a speed restriction stays in force before its lifting block.',
    baselineIs: 'Baseline {v}',
    noMandatory: 'No mandatory works this horizon',
    footnote: 'vs simulated decentralised FIFO baseline · seed {seed} · run {run}',
    f_DRAFT: 'Draft',
    f_AWAITING: 'Awaiting concurrence',
    f_READY: 'Concurred — ready to grant',
    f_GRANTED: 'Granted',
    f_LOCKED: 'Locked',
    f_REFUSED: 'Refused',
    f_SUPERSEDED: 'Changed by re-plan — send again',
  },
  hi: {
    k_availability: 'कॉरिडोर उपलब्धता',
    k_closure: 'लाइन-बंदी घंटे',
    k_colocation: 'सह-स्थान (co-location)',
    k_mandatory: 'अनिवार्य कार्य अनुपालन',
    k_delay: 'ट्रेन-मिनट हानि',
    k_tsrDays: 'लागू TSR-दिन',
    m_availability: 'यातायात के लिए खुला सेक्शन-लाइन समय: 1 − बंद सेक्शन-लाइन मिनट ÷ अवधि के कुल सेक्शन-लाइन मिनट।',
    m_closure: 'अवधि के सभी लाइन-बंदी block की अवधियों का योग।',
    m_colocation: 'लाइन-बंदी कार्यों का वह हिस्सा जो अपना block किसी दूसरे विभाग के साथ साझा करता है।',
    m_mandatory: 'नियत दिन तक रखे गए अनिवार्य कार्य ÷ सभी अनिवार्य कार्य।',
    m_delay: 'block से होने वाला श्रेणी-भारित ट्रेन विलंब (समय-सारणी पर विलंब मॉडल)।',
    m_tsrDays: 'lifting block से पहले TSR जितने कार्य-दिन लागू रहता है।',
    baselineIs: 'आधार-रेखा {v}',
    noMandatory: 'इस अवधि में कोई अनिवार्य कार्य नहीं',
    footnote: 'सिम्युलेटेड विकेंद्रीकृत FIFO आधार-रेखा की तुलना में · seed {seed} · run {run}',
    f_DRAFT: 'ड्राफ्ट',
    f_AWAITING: 'सहमति प्रतीक्षित',
    f_READY: 'सहमत — प्रदान हेतु तैयार',
    f_GRANTED: 'प्रदान',
    f_LOCKED: 'लॉक',
    f_REFUSED: 'अस्वीकृत',
    f_SUPERSEDED: 'पुनः योजना से बदला — फिर से भेजें',
  },
} as const;

export type PlanKey = keyof typeof planStrings.en;

export const KPI_LABEL: Record<KpiKey, PlanKey> = { availability: 'k_availability', closure: 'k_closure', colocation: 'k_colocation', mandatory: 'k_mandatory', delay: 'k_delay', tsrDays: 'k_tsrDays' };
export const KPI_METHOD: Record<KpiKey, PlanKey> = { availability: 'm_availability', closure: 'm_closure', colocation: 'm_colocation', mandatory: 'm_mandatory', delay: 'm_delay', tsrDays: 'm_tsrDays' };
export const FLOW_LABEL: Record<FlowState, PlanKey> = { DRAFT: 'f_DRAFT', AWAITING: 'f_AWAITING', READY: 'f_READY', GRANTED: 'f_GRANTED', LOCKED: 'f_LOCKED', REFUSED: 'f_REFUSED', SUPERSEDED: 'f_SUPERSEDED' };
