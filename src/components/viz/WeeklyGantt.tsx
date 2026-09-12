/**
 * WeeklyGantt — the 7 × 24 h possession chart.
 *
 * Bars are WorkingBlock[] (select.workingBlocks: plan + workflow status +
 * Control's window overrides). Nothing here invents a number: positions come
 * from block.start / block.end, shading from the occupancy table, labels from
 * the block itself. Overlapping bars on one row are stacked into lanes.
 *
 *   rows = 'day'     → one row per plan day, 24 hour columns (default)
 *   rows = 'section' → one row per block section × line, 7 × 24 h compressed
 *
 * Exports: WeeklyGantt (default + named), BlockBar (inline bar for lists).
 */
import { useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { Link2, Lock } from 'lucide-react';
import type { Block, DayOccupancy, Dept, Line } from '../../engine/types';
import type { WorkingBlock } from '../../engine/select';
import { addDaysIso, dateLabel, DEPT_CLASS, DEPT_LABEL, duration } from '../../lib/format';
import { useLang, useT } from '../../i18n';
import { common } from '../../i18n/common';
import './WeeklyGantt.css';

/* ── i18n ───────────────────────────────────────────────────── */

const strings = {
  en: {
    sectionLine: 'Section · line',
    day: 'Day',
    empty: 'No possessions in this plan.',
    legendDept: 'Department',
    legendStatus: 'Status',
    legendOther: 'Marks',
    joint: 'Joint block (stacked departments)',
    disconnection: 'Disconnection only — no line closure',
    draft: 'Draft (optimiser proposal)',
    proposed: 'Proposed — awaiting concurrence',
    concurred: 'Concurred — ready to grant',
    granted: 'Granted',
    locked: 'Locked into COA',
    refused: 'Refused by Control',
    changed: 'Window changed by Control',
    night: 'Night 22:00–06:00',
    quiet: 'Quiet hour — no train on any section',
    quietRow: 'Quiet hour — no train on this section',
    baseline: 'Baseline block (decentralised)',
    tipSection: 'Section',
    tipWindow: 'Window',
    tipDepartments: 'Departments',
    tipTrains: 'Trains affected',
    tipDelay: 'Weighted delay',
    tipPremium: 'Premium paths blocked',
    tipWorks: 'Works',
    tipStatus: 'Status',
    tipRefusal: 'Refusal',
    tipObjection: 'Objection',
    tipPower: 'Power block',
    tipMachines: 'Machines',
    possessions: '{n} possessions',
    possession: '1 possession',
    closureHours: '{h} closure',
    more: '+{n} more',
    both: 'Both',
    minShort: 'min',
    openBlock: 'Open block {id}',
  },
  hi: {
    sectionLine: 'सेक्शन · लाइन',
    day: 'दिन',
    empty: 'इस योजना में कोई पज़ेशन नहीं है।',
    legendDept: 'विभाग',
    legendStatus: 'स्थिति',
    legendOther: 'चिह्न',
    joint: 'संयुक्त ब्लॉक (विभाग एक के ऊपर एक)',
    disconnection: 'केवल डिस्कनेक्शन — लाइन बंद नहीं',
    draft: 'ड्राफ़्ट (ऑप्टिमाइज़र प्रस्ताव)',
    proposed: 'प्रस्तावित — सहमति प्रतीक्षित',
    concurred: 'सहमति प्राप्त — प्रदान हेतु तैयार',
    granted: 'प्रदान',
    locked: 'COA में लॉक',
    refused: 'कंट्रोल द्वारा अस्वीकृत',
    changed: 'कंट्रोल ने समय-खिड़की बदली',
    night: 'रात्रि 22:00–06:00',
    quiet: 'शांत घंटा — किसी सेक्शन पर ट्रेन नहीं',
    quietRow: 'शांत घंटा — इस सेक्शन पर ट्रेन नहीं',
    baseline: 'आधार-रेखा ब्लॉक (विकेंद्रीकृत)',
    tipSection: 'सेक्शन',
    tipWindow: 'समय-खिड़की',
    tipDepartments: 'विभाग',
    tipTrains: 'प्रभावित ट्रेनें',
    tipDelay: 'भारित विलंब',
    tipPremium: 'अवरुद्ध प्रीमियम पाथ',
    tipWorks: 'कार्य',
    tipStatus: 'स्थिति',
    tipRefusal: 'अस्वीकृति',
    tipObjection: 'आपत्ति',
    tipPower: 'पावर ब्लॉक',
    tipMachines: 'मशीनें',
    possessions: '{n} पज़ेशन',
    possession: '1 पज़ेशन',
    closureHours: '{h} बंदी',
    more: '+{n} और',
    both: 'दोनों',
    minShort: 'मिनट',
    openBlock: 'ब्लॉक {id} खोलें',
  },
} as const;

type StatusKey = 'draft' | 'proposed' | 'concurred' | 'granted' | 'locked' | 'refused';

/** Bar style from the derived workflow state (select.workflowState). */
function statusKey(b: WorkingBlock): StatusKey {
  switch (b.state) {
    case 'GRANTED':
      return 'granted';
    case 'LOCKED':
      return 'locked';
    case 'REFUSED':
      return 'refused';
    case 'CONCURRED':
      return 'concurred';
    case 'PROPOSED':
    case 'SUPERSEDED':
      return 'proposed';
    default:
      return 'draft';
  }
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/* ── Geometry ───────────────────────────────────────────────── */

const MIN_DAY = 1440;
const BAR_H = 22;
const GAP = 4;
const PAD = 6;
const GHOST_H = 6;
const NIGHT_START = 22;
const NIGHT_END = 6;

/** Greedy lane packing: items sorted by start, first lane whose last end ≤ start. */
function assignLanes(items: { start: number; end: number }[]): number[] {
  const order = items.map((_, i) => i).sort((a, b) => items[a].start - items[b].start || items[b].end - items[a].end);
  const laneEnd: number[] = [];
  const lanes = new Array<number>(items.length).fill(0);
  for (const i of order) {
    const it = items[i];
    let lane = laneEnd.findIndex((e) => e <= it.start);
    if (lane === -1) {
      lane = laneEnd.length;
      laneEnd.push(0);
    }
    laneEnd[lane] = it.end;
    lanes[i] = lane;
  }
  return lanes;
}

/** Merge consecutive hour flags into runs of [fromHour, toHour). */
function runs(flags: boolean[]): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let start = -1;
  flags.forEach((f, h) => {
    if (f && start === -1) start = h;
    if (!f && start !== -1) {
      out.push({ from: start, to: h });
      start = -1;
    }
  });
  if (start !== -1) out.push({ from: start, to: flags.length });
  return out;
}

interface Placed {
  key: string;
  block: WorkingBlock;
  lane: number;
  left: number;
  width: number;
}

interface Ghost {
  key: string;
  left: number;
  width: number;
  title: string;
}

interface Span {
  left: number;
  width: number;
}

interface RowSpec {
  key: string;
  label: ReactNode;
  sub?: ReactNode;
  placed: Placed[];
  lanes: number;
  ghosts: Ghost[];
  quiet: Span[];
}

/* ── Bar face (shared by chart bars and inline bars) ────────── */

function deptShort(d: Dept): string {
  return DEPT_LABEL[d].short;
}

function barClasses(b: WorkingBlock): string {
  const cls = ['wg-bar', `st-${statusKey(b)}`];
  if (b.coLocated && b.departments.length > 1) cls.push('joint');
  else cls.push(`d-${DEPT_CLASS[b.departments[0] ?? 'TMS']}`);
  if (!b.lineClosure) cls.push('disc');
  if (b.overridden) cls.push('changed');
  return cls.join(' ');
}

function BarFace({ block, changedTitle }: { block: WorkingBlock; changedTitle: string }) {
  const joint = block.coLocated && block.departments.length > 1;
  const st = statusKey(block);
  return (
    <>
      {joint && (
        <span className="wg-stripes" aria-hidden="true">
          {block.departments.map((d) => (
            <i key={d} className={`wg-stripe d-${DEPT_CLASS[d]}`} />
          ))}
        </span>
      )}
      <span className="wg-bar-text">
        <span className="num">{block.startText}–{block.endText}</span>
        <span className="wg-bar-dept">{block.departments.map(deptShort).join('+')}</span>
        {block.tasks.length > 1 && <span className="num">×{block.tasks.length}</span>}
      </span>
      <span className="wg-glyphs" aria-hidden="true">
        {block.overridden && <i className="wg-changed" title={changedTitle}>Δ</i>}
        {joint && <Link2 size={11} strokeWidth={2.5} />}
        {st === 'locked' && <Lock size={11} strokeWidth={2.5} />}
      </span>
    </>
  );
}

/** Inline bar for lists / drawers — same face as the chart, flows with text. */
export function BlockBar({ block, onClick, className = '', style }: { block: WorkingBlock; onClick?: (block: WorkingBlock) => void; className?: string; style?: CSSProperties }) {
  const t = useT(strings);
  const face = <BarFace block={block} changedTitle={t('changed')} />;
  const cls = `${barClasses(block)} wg-inline ${className}`;
  if (!onClick) return <span className={cls} style={style}>{face}</span>;
  return (
    <button type="button" className={cls} style={style} onClick={() => onClick(block)} aria-label={t('openBlock', { id: block.id })}>
      {face}
    </button>
  );
}

/* ── Tooltip ────────────────────────────────────────────────── */

function Tip({ block, x, y, dayText }: { block: WorkingBlock; x: number; y: number; dayText: string }) {
  const t = useT(strings);
  const tc = useT(common);
  const st = statusKey(block);
  const lineText = block.line === 'BOTH' ? tc('bothLines') : block.line === 'UP' ? tc('upLine') : tc('dnLine');
  const works = block.tasks.slice(0, 3);
  const rest = block.tasks.length - works.length;
  const objection = block.approval?.objections[block.approval.objections.length - 1];
  return (
    <div className="wg-tip" style={{ left: x, top: y }} role="tooltip">
      <div className="wg-tip-head">
        <span className="mono strong">{block.id}</span>
        <span className={`wg-tip-status st-${st}`}>{t(st)}</span>
      </div>
      <dl className="wg-tip-body">
        <dt>{t('tipSection')}</dt>
        <dd>{block.sectionText} · {lineText}</dd>
        <dt>{t('tipWindow')}</dt>
        <dd className="num">{dayText} {block.startText}–{block.endText} · {duration(block.spanMin)}{block.overridden && <span className="wg-tip-note"> · {t('changed')}</span>}</dd>
        <dt>{t('tipDepartments')}</dt>
        <dd>
          {block.departments.map((d) => (
            <span key={d} className="wg-tip-dept">
              <i className={`dot dot-${DEPT_CLASS[d]}`} />
              {DEPT_LABEL[d].short}
            </span>
          ))}
          {!block.lineClosure && <span className="wg-tip-note">· {t('disconnection')}</span>}
        </dd>
        <dt>{t('tipWorks')}</dt>
        <dd>
          {works.map((w) => (
            <div key={w.id} className="truncate"><span className="mono">{w.id}</span> {w.label}</div>
          ))}
          {rest > 0 && <div className="muted">{t('more', { n: rest })}</div>}
        </dd>
        <dt>{t('tipTrains')}</dt>
        <dd className="num">
          {block.affectedTrains.length} · {t('tipDelay').toLowerCase()} {Math.round(block.weightedDelayMin)} {t('minShort')}
          {block.premiumConflicts > 0 && <span className="wg-tip-crit"> · {t('tipPremium')}: {block.premiumConflicts}</span>}
        </dd>
        {block.powerIsolation && (
          <>
            <dt>{t('tipPower')}</dt>
            <dd>{block.powerIsolation}</dd>
          </>
        )}
        {block.machines.length > 0 && (
          <>
            <dt>{t('tipMachines')}</dt>
            <dd className="mono">{block.machines.join(', ')}</dd>
          </>
        )}
        {block.approval?.refusal && (
          <>
            <dt>{t('tipRefusal')}</dt>
            <dd className="wg-tip-crit">{block.approval.refusal.reason}</dd>
          </>
        )}
        {objection && (
          <>
            <dt>{t('tipObjection')}</dt>
            <dd>{DEPT_LABEL[objection.dept].short}: {objection.reason}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

/* ── Component ──────────────────────────────────────────────── */

export interface WeeklyGanttProps {
  blocks: WorkingBlock[];
  /** plan days shown (default 7) */
  days?: number;
  /** ISO date of day 0 */
  planStart: string;
  /** snapshot.result.weekly.occupancy — shades hours with zero passages */
  occupancy?: DayOccupancy[];
  rows?: 'day' | 'section';
  /** dims blocks that do not involve this department */
  deptFilter?: Dept | null;
  /** pulsing ring, e.g. blocks changed by the last run */
  highlightIds?: string[];
  selectedId?: string | null;
  onBlockClick?: (block: WorkingBlock) => void;
  /** draw baselineBlocks as grey ghosts under each row */
  showBaseline?: boolean;
  baselineBlocks?: Block[];
  tour?: string;
}

const lineKey = (l: Line) => l;

export function WeeklyGantt({ blocks, days = 7, planStart, occupancy, rows = 'day', deptFilter = null, highlightIds, selectedId = null, onBlockClick, showBaseline = false, baselineBlocks, tour }: WeeklyGanttProps) {
  const t = useT(strings);
  const tc = useT(common);
  const lang = useLang();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ block: WorkingBlock; x: number; y: number } | null>(null);

  const dayText = (d: number): string => {
    const iso = addDaysIso(planStart, d);
    const en = dateLabel(iso);
    if (lang === 'hi') {
      const dow = new Date(`${iso}T00:00:00`).getDay();
      return `${tc(DAY_KEYS[dow])} ${en.slice(4)}`;
    }
    return en;
  };

  const lineText = (l: Line) => (l === 'BOTH' ? t('both') : l);

  const rowSpecs = useMemo<RowSpec[]>(() => {
    const inRange = blocks.filter((b) => b.day >= 0 && b.day < days);
    const ghostsFor = (list: Block[], toLeft: (b: Block) => number, toWidth: (b: Block) => number): Ghost[] =>
      showBaseline ? list.map((b) => ({ key: b.id, left: toLeft(b), width: toWidth(b), title: `${t('baseline')} · ${b.sectionText} ${b.startText}–${b.endText} ${b.departments.map(deptShort).join('+')}` })) : [];

    if (rows === 'day') {
      return Array.from({ length: days }, (_, d) => {
        const dayBlocks = inRange.filter((b) => b.day === d);
        const lanes = assignLanes(dayBlocks.map((b) => ({ start: b.start, end: b.end })));
        const placed: Placed[] = dayBlocks.map((b, i) => ({ key: b.id, block: b, lane: lanes[i], left: b.start / MIN_DAY, width: Math.max(0.006, (Math.min(MIN_DAY, b.end) - b.start) / MIN_DAY) }));
        const closureMin = dayBlocks.filter((b) => b.lineClosure && b.status !== 'REFUSED').reduce((s, b) => s + b.spanMin, 0);
        const occ = occupancy?.[d];
        const quietFlags = occ && occ.hourly.length ? Array.from({ length: 24 }, (_, h) => occ.hourly.every((e) => (e.hours[h] ?? 0) === 0)) : [];
        const quiet: Span[] = runs(quietFlags).map((r) => ({ left: r.from / 24, width: (r.to - r.from) / 24 }));
        const ghosts = ghostsFor((baselineBlocks ?? []).filter((b) => b.day === d), (b) => b.start / MIN_DAY, (b) => Math.max(0.006, (Math.min(MIN_DAY, b.end) - b.start) / MIN_DAY));
        return {
          key: `day-${d}`,
          label: dayText(d),
          sub: dayBlocks.length ? `${dayBlocks.length === 1 ? t('possession') : t('possessions', { n: dayBlocks.length })}${closureMin ? ` · ${t('closureHours', { h: duration(closureMin) })}` : ''}` : undefined,
          placed,
          lanes: Math.max(1, ...lanes.map((l) => l + 1)),
          ghosts,
          quiet,
        };
      });
    }

    /* section × line rows, 7 × 24 h compressed into one track */
    const total = days * MIN_DAY;
    const abs = (b: Block) => b.day * MIN_DAY + b.start;
    const toLeft = (b: Block) => abs(b) / total;
    const toWidth = (b: Block) => Math.max(0.004, (Math.min(MIN_DAY, b.end) - b.start) / total);
    const map = new Map<string, { sec: number; label: string; line: Line; blocks: WorkingBlock[]; base: Block[] }>();
    const ensure = (sec: number, label: string, line: Line) => {
      const k = `${sec}:${lineKey(line)}`;
      let r = map.get(k);
      if (!r) {
        r = { sec, label, line, blocks: [], base: [] };
        map.set(k, r);
      }
      return r;
    };
    for (const b of inRange) b.sections.forEach((s, i) => ensure(s, b.sectionLabels[i] ?? String(s), b.line).blocks.push(b));
    if (showBaseline) for (const b of (baselineBlocks ?? []).filter((x) => x.day >= 0 && x.day < days)) b.sections.forEach((s, i) => ensure(s, b.sectionLabels[i] ?? String(s), b.line).base.push(b));
    const lineOrder: Record<Line, number> = { UP: 0, DN: 1, BOTH: 2 };
    return [...map.values()]
      .sort((a, b) => a.sec - b.sec || lineOrder[a.line] - lineOrder[b.line])
      .map((r) => {
        const lanes = assignLanes(r.blocks.map((b) => ({ start: abs(b), end: abs(b) + b.spanMin })));
        const placed: Placed[] = r.blocks.map((b, i) => ({ key: `${b.id}-${r.sec}`, block: b, lane: lanes[i], left: toLeft(b), width: toWidth(b) }));
        const quiet: Span[] = [];
        if (occupancy) {
          for (let d = 0; d < days; d++) {
            const occ = occupancy[d];
            if (!occ) continue;
            const entries = occ.hourly.filter((e) => e.section.index === r.sec && (r.line === 'BOTH' || e.line === r.line));
            if (!entries.length) continue;
            const flags = Array.from({ length: 24 }, (_, h) => entries.every((e) => (e.hours[h] ?? 0) === 0));
            for (const run of runs(flags)) quiet.push({ left: (d * 24 + run.from) / (days * 24), width: (run.to - run.from) / (days * 24) });
          }
        }
        return {
          key: `sec-${r.sec}-${r.line}`,
          label: (
            <>
              <span className="mono">{r.label}</span> <span className="wg-line">{lineText(r.line)}</span>
            </>
          ),
          sub: r.blocks.length === 1 ? t('possession') : t('possessions', { n: r.blocks.length }),
          placed,
          lanes: Math.max(1, ...lanes.map((l) => l + 1)),
          ghosts: ghostsFor(r.base, toLeft, toWidth),
          quiet,
        };
      });
    // dayText / lineText / t are derived from lang; lang is a dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, days, planStart, occupancy, rows, showBaseline, baselineBlocks, lang]);

  const hasQuiet = rowSpecs.some((r) => r.quiet.length > 0);
  const hasGhost = showBaseline && rowSpecs.some((r) => r.ghosts.length > 0);
  const hasJoint = blocks.some((b) => b.coLocated && b.departments.length > 1);
  const hasDisc = blocks.some((b) => !b.lineClosure);
  const hasChanged = blocks.some((b) => b.overridden);
  const highlight = useMemo(() => new Set(highlightIds ?? []), [highlightIds]);

  const showTip = (b: WorkingBlock, e: MouseEvent<HTMLElement>) => {
    const box = scrollRef.current;
    if (!box) return;
    const r = e.currentTarget.getBoundingClientRect();
    const c = box.getBoundingClientRect();
    const x = Math.max(0, Math.min(r.left - c.left + box.scrollLeft, box.scrollWidth - 292));
    const y = r.bottom - c.top + box.scrollTop + 6;
    setHover({ block: b, x, y });
  };

  const hourLabels = Array.from({ length: 24 }, (_, h) => h);
  const dayCells = Array.from({ length: days }, (_, d) => d);

  if (!blocks.length) {
    return (
      <div className="wg-empty muted small" data-tour={tour}>
        {t('empty')}
      </div>
    );
  }

  return (
    <div className={`wg wg-${rows}`} data-tour={tour ?? 'weekly-gantt'}>
      <div className="table-wrap wg-scroll" ref={scrollRef} onScroll={() => hover && setHover(null)}>
        <div className="wg-grid" style={{ '--wg-days': days } as CSSProperties}>
          {/* header */}
          <div className="wg-row wg-head">
            <div className="wg-label caps">{rows === 'day' ? t('day') : t('sectionLine')}</div>
            <div className="wg-track">
              {rows === 'day' ? (
                <div className="wg-cells wg-hours">
                  {hourLabels.map((h) => (
                    <span key={h} className={`wg-cell${h >= NIGHT_START || h < NIGHT_END ? ' night' : ''}`}>
                      {h % 3 === 0 && <b className="num">{String(h).padStart(2, '0')}</b>}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="wg-cells wg-days">
                  {dayCells.map((d) => (
                    <span key={d} className="wg-cell wg-daycell">
                      <b>{dayText(d)}</b>
                      <em className="num">00 · 06 · 12 · 18</em>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* rows */}
          {rowSpecs.map((row) => {
            const height = PAD * 2 + row.lanes * (BAR_H + GAP) - GAP + (row.ghosts.length ? GHOST_H + GAP : 0);
            return (
              <div key={row.key} className="wg-row" style={{ height }}>
                <div className="wg-label">
                  <div className="wg-label-main">{row.label}</div>
                  {row.sub && <div className="tiny muted num">{row.sub}</div>}
                </div>
                <div className="wg-track">
                  {rows === 'day' ? (
                    <div className="wg-cells wg-hours" aria-hidden="true">
                      {hourLabels.map((h) => (
                        <span key={h} className={`wg-cell${h >= NIGHT_START || h < NIGHT_END ? ' night' : ''}`} />
                      ))}
                    </div>
                  ) : (
                    <div className="wg-cells wg-days" aria-hidden="true">
                      {dayCells.map((d) => (
                        <span key={d} className="wg-cell wg-daycell" />
                      ))}
                    </div>
                  )}
                  {row.quiet.map((q, i) => (
                    <i key={i} className="wg-quiet" style={{ left: `${q.left * 100}%`, width: `${q.width * 100}%` }} title={rows === 'day' ? t('quiet') : t('quietRow')} />
                  ))}
                  {row.placed.map((p) => {
                    const b = p.block;
                    const dim = deptFilter && !b.departments.includes(deptFilter);
                    const cls = [barClasses(b), dim ? 'dim' : '', highlight.has(b.id) ? 'hl' : '', selectedId === b.id ? 'sel' : ''].filter(Boolean).join(' ');
                    return (
                      <button
                        key={p.key}
                        type="button"
                        className={cls}
                        style={{ left: `${p.left * 100}%`, width: `${p.width * 100}%`, top: PAD + p.lane * (BAR_H + GAP) }}
                        onClick={() => onBlockClick?.(b)}
                        onMouseEnter={(e) => showTip(b, e)}
                        onMouseLeave={() => setHover(null)}
                        onFocus={(e) => showTip(b, e as unknown as MouseEvent<HTMLElement>)}
                        onBlur={() => setHover(null)}
                        aria-label={`${t('openBlock', { id: b.id })} · ${b.sectionText} ${b.startText}–${b.endText} · ${b.departments.map(deptShort).join('+')} · ${t(statusKey(b))}`}
                        data-block={b.id}
                      >
                        <BarFace block={b} changedTitle={t('changed')} />
                      </button>
                    );
                  })}
                  {row.ghosts.map((g) => (
                    <i key={g.key} className="wg-ghost" style={{ left: `${g.left * 100}%`, width: `${g.width * 100}%`, top: height - PAD - GHOST_H }} title={g.title} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {hover && <Tip block={hover.block} x={hover.x} y={hover.y} dayText={dayText(hover.block.day)} />}
      </div>

      {/* legend */}
      <div className="wg-legend tiny muted">
        <span className="wg-legend-group">
          <span className="caps">{t('legendDept')}</span>
          {(['TMS', 'SMMS', 'TDMS'] as Dept[]).map((d) => (
            <span key={d} className="wg-legend-item">
              <i className={`dot dot-${DEPT_CLASS[d]}`} />
              {tc(DEPT_CLASS[d] as 'tms' | 'smms' | 'tdms')}
            </span>
          ))}
          {hasJoint && (
            <span className="wg-legend-item">
              <i className="wg-sample wg-sample-joint" aria-hidden="true"><b className="d-tms" /><b className="d-smms" /></i>
              <Link2 size={11} strokeWidth={2.5} /> {t('joint')}
            </span>
          )}
          {hasDisc && (
            <span className="wg-legend-item">
              <i className="wg-sample wg-sample-disc" aria-hidden="true" /> {t('disconnection')}
            </span>
          )}
        </span>
        <span className="wg-legend-group">
          <span className="caps">{t('legendStatus')}</span>
          {(['proposed', 'concurred', 'granted', 'locked', 'refused'] as StatusKey[]).map((s) => (
            <span key={s} className="wg-legend-item">
              <i className={`wg-sample st-${s}`} aria-hidden="true" />
              {s === 'locked' && <Lock size={11} strokeWidth={2.5} />}
              {t(s)}
            </span>
          ))}
        </span>
        <span className="wg-legend-group">
          <span className="caps">{t('legendOther')}</span>
          <span className="wg-legend-item"><i className="wg-sample wg-sample-night" aria-hidden="true" /> {t('night')}</span>
          {hasQuiet && <span className="wg-legend-item"><i className="wg-sample wg-sample-quiet" aria-hidden="true" /> {rows === 'day' ? t('quiet') : t('quietRow')}</span>}
          {hasChanged && <span className="wg-legend-item"><i className="wg-changed wg-changed-legend" aria-hidden="true">Δ</i> {t('changed')}</span>}
          {hasGhost && <span className="wg-legend-item"><i className="wg-sample wg-sample-ghost" aria-hidden="true" /> {t('baseline')}</span>}
        </span>
      </div>
    </div>
  );
}

export default WeeklyGantt;
