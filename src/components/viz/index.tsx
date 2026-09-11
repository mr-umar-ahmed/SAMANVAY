/**
 * Small SVG chart primitives. Rules (dataviz skill): one axis, thin marks,
 * recessive grid, text in ink tokens, hover tooltips, colours from tokens.
 */
import { useId, useState, type ReactNode } from 'react';

export function RingGauge({ value, size = 120, stroke = 10, label, sub, tone = 'var(--series-3)', track = 'var(--bg-3)' }: { value: number; size?: number; stroke?: number; label?: ReactNode; sub?: ReactNode; tone?: string; track?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, value));
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(v * 100)} percent`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset 600ms var(--ease)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div className="num" style={{ fontSize: size / 4.6, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1 }}>{label ?? `${(v * 100).toFixed(1)}%`}</div>
          {sub && <div className="tiny muted" style={{ marginTop: 2 }}>{sub}</div>}
        </div>
      </div>
    </div>
  );
}

export interface BarSeries {
  name: string;
  color: string;
  values: number[];
}

/**
 * Grouped bar chart with a single y-axis. Categories along x, ≤ 3 series.
 */
export function BarChart({ categories, series, height = 180, unit = '', yMax, valueFormat }: { categories: string[]; series: BarSeries[]; height?: number; unit?: string; yMax?: number; valueFormat?: (v: number) => string }) {
  const id = useId();
  const [hover, setHover] = useState<{ ci: number; si: number } | null>(null);
  const padL = 34;
  const padB = 22;
  const padT = 10;
  const W = 600;
  const H = height;
  const max = yMax ?? Math.max(1, ...series.flatMap((s) => s.values)) * 1.15;
  const iw = W - padL - 8;
  const ih = H - padT - padB;
  const gw = iw / categories.length;
  const bw = Math.min(28, (gw * 0.7) / series.length);
  const fmt = valueFormat ?? ((v: number) => `${Math.round(v)}${unit}`);
  const ticks = 4;
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-labelledby={`${id}-t`} style={{ overflow: 'visible' }}>
        <title id={`${id}-t`}>{series.map((s) => s.name).join(' vs ')}</title>
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const y = padT + (ih * i) / ticks;
          const val = max * (1 - i / ticks);
          return (
            <g key={i}>
              <line x1={padL} x2={W - 8} y1={y} y2={y} stroke="var(--grid)" strokeWidth={1} />
              <text x={padL - 6} y={y + 3.5} textAnchor="end" fontSize={10} fill="var(--ink-3)" className="num">{fmt(val)}</text>
            </g>
          );
        })}
        {categories.map((c, ci) => {
          const x0 = padL + ci * gw + (gw - bw * series.length - 2 * (series.length - 1)) / 2;
          return (
            <g key={c}>
              {series.map((s, si) => {
                const v = s.values[ci] ?? 0;
                const h = Math.max(0, (v / max) * ih);
                const x = x0 + si * (bw + 2);
                const y = padT + ih - h;
                const active = hover && hover.ci === ci && hover.si === si;
                return (
                  <g key={s.name} onMouseEnter={() => setHover({ ci, si })} onMouseLeave={() => setHover(null)}>
                    <rect x={x} y={y} width={bw} height={h} rx={3} fill={s.color} opacity={hover && !active ? 0.55 : 1} />
                    <rect x={x - 2} y={padT} width={bw + 4} height={ih} fill="transparent" />
                    {active && (
                      <text x={x + bw / 2} y={y - 5} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--ink)" className="num">{fmt(v)}</text>
                    )}
                  </g>
                );
              })}
              <text x={padL + ci * gw + gw / 2} y={H - 6} textAnchor="middle" fontSize={10.5} fill="var(--ink-3)">{c}</text>
            </g>
          );
        })}
        <line x1={padL} x2={W - 8} y1={padT + ih} y2={padT + ih} stroke="var(--axis)" />
      </svg>
      {series.length > 1 && (
        <div className="row-wrap small muted" style={{ marginTop: 6 }}>
          {series.map((s) => (
            <span key={s.name} className="row" style={{ gap: 5 }}>
              <span className="dot" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Horizontal bars — one series, labelled directly. */
export function HBars({ rows, max, color = 'var(--series-1)', format }: { rows: { label: ReactNode; value: number; color?: string; note?: ReactNode }[]; max?: number; color?: string; format?: (v: number) => string }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  const f = format ?? ((v: number) => String(Math.round(v)));
  return (
    <div className="stack" style={{ gap: 8 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(80px, 1.4fr) 3fr auto', gap: 10, alignItems: 'center', fontSize: 'var(--fs-sm)' }}>
          <span className="truncate">{r.label}</span>
          <span className="meter" style={{ height: 10 }}>
            <i style={{ width: `${Math.round((r.value / m) * 100)}%`, background: r.color ?? color }} />
          </span>
          <span className="num strong" style={{ minWidth: 48, textAlign: 'right' }}>{f(r.value)}</span>
          {r.note && <span className="tiny muted" style={{ gridColumn: '1 / -1' }}>{r.note}</span>}
        </div>
      ))}
    </div>
  );
}

export function Sparkline({ values, width = 120, height = 32, color = 'var(--series-1)', fill = true }: { values: number[]; width?: number; height?: number; color?: string; fill?: boolean }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * width, height - ((v - min) / (max - min || 1)) * (height - 4) - 2] as const);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {fill && <path d={`${d} L${width},${height} L0,${height} Z`} fill={color} opacity={0.12} />}
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** 24-hour heat strip: one row per section, cells per hour. */
export function HeatStrip({ rows, max }: { rows: { label: string; hours: number[] }[]; max?: number }) {
  const m = max ?? Math.max(1, ...rows.flatMap((r) => r.hours));
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '110px repeat(24, 1fr)', gap: 2, fontSize: 9.5, color: 'var(--ink-3)' }}>
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="num" style={{ textAlign: 'center' }}>{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>
        ))}
      </div>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '110px repeat(24, 1fr)', gap: 2, alignItems: 'center' }}>
          <span className="tiny truncate" title={r.label}>{r.label}</span>
          {r.hours.map((v, h) => (
            <span key={h} title={`${r.label} · ${String(h).padStart(2, '0')}:00 · ${v} trains`} style={{ height: 14, borderRadius: 3, background: v === 0 ? 'var(--pastel-green)' : `color-mix(in oklab, var(--series-1) ${Math.round(25 + (v / m) * 75)}%, var(--bg-1))` }} />
          ))}
        </div>
      ))}
      <div className="row tiny muted" style={{ gap: 12, marginTop: 4 }}>
        <span className="row" style={{ gap: 4 }}><span className="dot" style={{ background: 'var(--pastel-green)' }} /> free hour</span>
        <span className="row" style={{ gap: 4 }}><span className="dot" style={{ background: 'var(--series-1)' }} /> busy hour</span>
      </div>
    </div>
  );
}
