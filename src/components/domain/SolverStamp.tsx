/**
 * What the optimiser actually ran for a plan: plan.search.solver
 * ('milp+sa' exact MILP construction by HiGHS in WebAssembly, then simulated
 * annealing polish; 'greedy+sa' greedy construction + annealing), the MILP
 * metadata the construction returned (status, objective, best bound, gap,
 * size, time) and the fallback reason when the MILP was requested but not
 * used. Only values present in the snapshot are shown.
 */
import type { ReactNode } from 'react';
import { Cpu } from 'lucide-react';
import type { Plan } from '../../engine/types';
import { useT } from '../../i18n';
import { num } from '../../lib/format';
import { Badge, Callout, KeyValue } from '../ui';
import { SimLabel } from '../ui/extras';
import { milpMeta } from './solverMeta';

const strings = {
  en: {
    used: 'Solver used',
    milpSa: 'Exact MILP (HiGHS) + annealing polish',
    greedySa: 'Greedy + annealing',
    unknown: 'Greedy + annealing (older run, solver not recorded)',
    engine: 'Engine',
    status: 'MILP status',
    optimal: 'optimal',
    source: 'Construction kept',
    objective: 'MILP objective',
    bound: 'Best bound',
    gap: 'Optimality gap',
    planCost: 'Plan cost after polish',
    greedyCost: 'Construction cost (before annealing)',
    size: 'Model size',
    sizeValue: '{v} variables ({b} binary) · {c} constraints',
    sizeValueNoBin: '{v} variables · {c} constraints',
    time: 'MILP time',
    searchTime: 'Optimiser time',
    iterations: 'Annealing iterations',
    fallback: 'Fallback',
    fallbackBody: 'The exact MILP was not used for this run: {reason}',
    requestedMilp: 'Exact MILP requested for the next run.',
    requestedSa: 'Greedy + annealing requested for the next run.',
    compactMilp: 'MILP (HiGHS) + SA',
    compactGreedy: 'Greedy + SA',
    compactStatus: '{status}',
    compactGap: 'gap {v} %',
    compactTime: '{v} s',
    compactFallback: 'MILP not used',
    ms: '{v} ms',
    s: '{v} s',
  },
  hi: {
    used: 'प्रयुक्त सॉल्वर',
    milpSa: 'सटीक MILP (HiGHS) + एनीलिंग सुधार',
    greedySa: 'ग्रीडी + एनीलिंग',
    unknown: 'ग्रीडी + एनीलिंग (पुराना run, सॉल्वर दर्ज नहीं)',
    engine: 'इंजन',
    status: 'MILP स्थिति',
    optimal: 'इष्टतम',
    source: 'रखा गया निर्माण',
    objective: 'MILP उद्देश्य मान',
    bound: 'सर्वश्रेष्ठ सीमा (bound)',
    gap: 'इष्टतमता अंतर (gap)',
    planCost: 'सुधार के बाद योजना लागत',
    greedyCost: 'निर्माण लागत (एनीलिंग से पहले)',
    size: 'मॉडल आकार',
    sizeValue: '{v} चर ({b} बाइनरी) · {c} बाधाएँ',
    sizeValueNoBin: '{v} चर · {c} बाधाएँ',
    time: 'MILP समय',
    searchTime: 'ऑप्टिमाइज़र समय',
    iterations: 'एनीलिंग पुनरावृत्तियाँ',
    fallback: 'विकल्प (fallback)',
    fallbackBody: 'इस run में सटीक MILP प्रयुक्त नहीं हुआ: {reason}',
    requestedMilp: 'अगले run के लिए सटीक MILP चुना गया है।',
    requestedSa: 'अगले run के लिए ग्रीडी + एनीलिंग चुना गया है।',
    compactMilp: 'MILP (HiGHS) + SA',
    compactGreedy: 'ग्रीडी + SA',
    compactStatus: '{status}',
    compactGap: 'gap {v} %',
    compactTime: '{v} s',
    compactFallback: 'MILP प्रयुक्त नहीं',
    ms: '{v} ms',
    s: '{v} s',
  },
} as const;

const fmtNum = (v: number | null | undefined, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? num(v, d) : null);

/** Full table of the last run's search metadata. */
export function SolverDetails({ plan, requested, extra }: { plan: Plan; requested?: 'milp' | 'sa'; extra?: ReactNode }) {
  const t = useT(strings);
  const s = plan.search;
  const m = milpMeta(plan);
  const used = s.solver === 'milp+sa' ? t('milpSa') : s.solver === 'greedy+sa' ? t('greedySa') : t('unknown');
  const items: [ReactNode, ReactNode][] = [[t('used'), <span key="used" className="row-wrap" style={{ gap: 6 }}><b>{used}</b><SimLabel kind="solver" short /></span>]];
  if (m?.solver) items.push([t('engine'), <span key="engine" className="small">{m.solver}</span>]);
  if (m?.status) items.push([t('status'), <span key="status" className="row-wrap" style={{ gap: 6 }}><span className="mono small">{m.status}</span>{m.optimal && <Badge tone="ok">{t('optimal')}</Badge>}</span>]);
  if (m?.source) items.push([t('source'), <span key="source" className="small">{m.source}</span>]);
  const obj = fmtNum(m?.objective);
  if (obj !== null) items.push([t('objective'), <span key="objective" className="num">{obj}</span>]);
  const bound = fmtNum(m?.bound);
  if (bound !== null) items.push([t('bound'), <span key="bound" className="num">{bound}</span>]);
  const gap = fmtNum(m?.gapPct, 2);
  if (gap !== null) items.push([t('gap'), <span key="gap" className="num">{gap} %</span>]);
  if (typeof m?.variables === 'number' && typeof m?.constraints === 'number')
    items.push([t('size'), <span key="size" className="num small">{typeof m.binaries === 'number' ? t('sizeValue', { v: num(m.variables), b: num(m.binaries), c: num(m.constraints) }) : t('sizeValueNoBin', { v: num(m.variables), c: num(m.constraints) })}</span>]);
  const mt = fmtNum(m?.timeMs);
  if (mt !== null) items.push([t('time'), <span key="time" className="num">{t('ms', { v: mt })}</span>]);
  items.push([t('greedyCost'), <span key="greedy" className="num">{num(s.greedyCost)}</span>]);
  items.push([t('planCost'), <span key="plan" className="num">{num(s.finalCost)}</span>]);
  items.push([t('iterations'), <span key="iter" className="num">{num(s.iterations)}</span>]);
  items.push([t('searchTime'), <span key="stime" className="num">{t('s', { v: (s.timeMs / 1000).toFixed(1) })}</span>]);
  return (
    <div className="stack">
      <KeyValue items={items} />
      {s.fallbackReason && (
        <Callout tone="warn">
          <b>{t('fallback')}.</b> {t('fallbackBody', { reason: s.fallbackReason })}
        </Callout>
      )}
      {requested && ((requested === 'milp') !== (s.solver === 'milp+sa') || !s.solver) && <div className="tiny muted">{requested === 'milp' ? t('requestedMilp') : t('requestedSa')}</div>}
      {extra}
    </div>
  );
}

/** One-line stamp for run headers (weekly plan, candidate cards). */
export function SolverStamp({ plan }: { plan: Plan }) {
  const t = useT(strings);
  const s = plan.search;
  const m = milpMeta(plan);
  const parts: string[] = [s.solver === 'milp+sa' ? t('compactMilp') : t('compactGreedy')];
  if (s.solver === 'milp+sa' && m) {
    if (m.status) parts.push(t('compactStatus', { status: m.status }));
    const gap = fmtNum(m.gapPct, 2);
    if (gap !== null) parts.push(t('compactGap', { v: gap }));
    if (typeof m.timeMs === 'number') parts.push(t('compactTime', { v: (m.timeMs / 1000).toFixed(1) }));
  }
  if (s.fallbackReason) parts.push(t('compactFallback'));
  return (
    <span className="tiny muted row" style={{ gap: 4 }} title={s.fallbackReason ?? m?.solver ?? undefined}>
      <Cpu size={12} />
      <span className="mono">{parts.join(' · ')}</span>
    </span>
  );
}

export default SolverStamp;
