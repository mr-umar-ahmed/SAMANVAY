/**
 * SAMANVAY component kit. Small, typed wrappers over the classes in
 * src/styles/components.css so that every page looks the same.
 */
import { useEffect, useRef, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, Inbox, X, Loader2, FlaskConical, Calculator, ShieldCheck } from 'lucide-react';
import type { Dept, Urgency } from '../../engine/types';
import { DEPT_CLASS, DEPT_LABEL, URGENCY_LABEL, URGENCY_TONE, arciTone } from '../../lib/format';
import { useAppStore } from '../../store/useAppStore';

/* ── Layout ─────────────────────────────────────────────────── */
export function Card({ children, className = '', pastel, style, onClick, tour }: { children: ReactNode; className?: string; pastel?: 'blue' | 'lavender' | 'yellow' | 'pink' | 'green' | 'gray'; style?: CSSProperties; onClick?: () => void; tour?: string }) {
  return (
    <div className={`card ${pastel ? `pastel-${pastel}` : ''} ${onClick ? 'clickable' : ''} ${className}`} style={style} onClick={onClick} data-tour={tour}>
      {children}
    </div>
  );
}

export function CardHead({ title, sub, right, icon }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="card-head">
      {icon && <span className="row" style={{ color: 'var(--ink-3)' }}>{icon}</span>}
      <div className="grow">
        <h3>{title}</h3>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {right && <div className="row">{right}</div>}
    </div>
  );
}

export function CardBody({ children, tight, flush, className = '' }: { children: ReactNode; tight?: boolean; flush?: boolean; className?: string }) {
  return <div className={`card-body ${tight ? 'tight' : ''} ${flush ? 'flush' : ''} ${className}`}>{children}</div>;
}

export function CardFoot({ children }: { children: ReactNode }) {
  return <div className="card-foot">{children}</div>;
}

export function PageHeader({ title, lede, actions, badges, tour }: { title: ReactNode; lede?: ReactNode; actions?: ReactNode; badges?: ReactNode; tour?: string }) {
  return (
    <div className="page-head" data-tour={tour}>
      <div>
        {badges && <div className="row-wrap mb">{badges}</div>}
        <h1>{title}</h1>
        {lede && <div className="lede">{lede}</div>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="row" style={{ marginBottom: 8 }}>
      <div className="section-title" style={{ marginBottom: 0 }}>{children}</div>
      {right && <div className="right row">{right}</div>}
    </div>
  );
}

/* ── Stats ──────────────────────────────────────────────────── */
export type HonestyKind = 'computed' | 'simulated' | 'assumption';

export function HonestyTag({ kind, title }: { kind: HonestyKind; title?: string }) {
  const map = {
    computed: { cls: 'tag-computed', label: 'Computed', icon: <Calculator size={10} />, t: 'Computed by the planning engine from the corridor data' },
    simulated: { cls: 'tag-sim', label: 'Simulated', icon: <FlaskConical size={10} />, t: 'Synthetic data shaped like the real feed (no live CRIS access)' },
    assumption: { cls: 'tag-assumption', label: 'Assumption', icon: <ShieldCheck size={10} />, t: 'Unit value is an editable assumption' },
  }[kind];
  return (
    <span className={map.cls} title={title ?? map.t}>
      {map.icon}
      {map.label}
    </span>
  );
}

export function StatTile({ label, value, unit, delta, deltaGood, sub, pastel, honesty, icon, tour, className = '' }: { label: ReactNode; value: ReactNode; unit?: string; delta?: ReactNode; deltaGood?: boolean | null; sub?: ReactNode; pastel?: 'blue' | 'lavender' | 'yellow' | 'pink' | 'green' | 'gray'; honesty?: HonestyKind; icon?: ReactNode; tour?: string; className?: string }) {
  return (
    <div className={`stat ${pastel ? `pastel-${pastel}` : ''} ${className}`} data-tour={tour}>
      <div className="label">
        {icon}
        <span className="grow">{label}</span>
        {honesty && <HonestyTag kind={honesty} />}
      </div>
      <div className="value num">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {(delta || sub) && (
        <div className={`delta ${deltaGood === true ? 'up' : deltaGood === false ? 'down' : ''}`}>
          {delta && <b>{delta}</b>}
          {sub && <span>{sub}</span>}
        </div>
      )}
    </div>
  );
}

/* ── Badges ─────────────────────────────────────────────────── */
export type Tone = 'gray' | 'blue' | 'lavender' | 'yellow' | 'pink' | 'green' | 'ok' | 'warn' | 'crit' | 'info' | 'outline' | 'solid-crit' | 'solid-ok' | 'solid-accent' | 'tms' | 'smms' | 'tdms' | 'coa' | 'fois';

export function Badge({ tone = 'gray', children, pill, icon, title, className = '' }: { tone?: Tone; children: ReactNode; pill?: boolean; icon?: ReactNode; title?: string; className?: string }) {
  return (
    <span className={`badge badge-${tone} ${pill ? 'badge-pill' : ''} ${className}`} title={title}>
      {icon}
      {children}
    </span>
  );
}

export function DeptBadge({ dept, long }: { dept: Dept; long?: boolean }) {
  const d = DEPT_LABEL[dept];
  return (
    <span className={`badge badge-${DEPT_CLASS[dept]}`} title={`${d.long} · ${d.system}`}>
      <span className={`dot dot-${DEPT_CLASS[dept]}`} />
      {long ? `${d.short} · ${d.system}` : d.short}
    </span>
  );
}

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  return <Badge tone={URGENCY_TONE[urgency]}>{URGENCY_LABEL[urgency]}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone: Tone = status === 'LOCKED' ? 'info' : status === 'GRANTED' ? 'ok' : status === 'RETURNED' || status === 'REJECTED' ? 'crit' : status === 'TASK' ? 'ok' : status === 'UNVERIFIED' ? 'warn' : status === 'IN_PROGRESS' ? 'warn' : status === 'COMPLETED' || status === 'CLOSED' ? 'ok' : status === 'NOTICE_SHORTFALL' ? 'crit' : 'gray';
  const label = status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  return <Badge tone={tone}>{label}</Badge>;
}

/* ── Meters ─────────────────────────────────────────────────── */
export function Meter({ value, tone, style }: { value: number; tone?: 'ok' | 'warn' | 'crit' | 'info' | 'tms' | 'smms' | 'tdms'; style?: CSSProperties }) {
  return (
    <span className={`meter ${tone ?? ''}`} style={style} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
    </span>
  );
}

export function ArciBar({ value, mandatory }: { value: number; mandatory?: boolean }) {
  return (
    <span className="arci" title={`ARCI ${value.toFixed(2)}${mandatory ? ' · mandatory' : ''}`}>
      <Meter value={value} tone={arciTone(value)} />
      <span className="num">{value.toFixed(2)}</span>
    </span>
  );
}

/* ── Table ──────────────────────────────────────────────────── */
export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T, i: number) => ReactNode;
  num?: boolean;
  width?: string | number;
  hideMobile?: boolean;
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick, selectedKey, empty, compact, tour, maxHeight }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; selectedKey?: string | null; empty?: ReactNode; compact?: boolean; tour?: string; maxHeight?: number | string }) {
  if (!rows.length) return <div className="empty">{empty ?? 'Nothing to show.'}</div>;
  return (
    <div className="table-wrap" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined} data-tour={tour}>
      <table className={`tbl ${compact ? 'compact' : ''}`}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={`${c.num ? 'num' : ''} ${c.hideMobile ? 'hide-mobile' : ''}`} style={{ width: c.width }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const k = rowKey(r);
            return (
              <tr key={k} className={`${onRowClick ? 'selectable' : ''} ${selectedKey === k ? 'selected' : ''}`} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                {columns.map((c) => (
                  <td key={c.key} className={`${c.num ? 'num' : ''} ${c.hideMobile ? 'hide-mobile' : ''}`}>
                    {c.render ? c.render(r, i) : String((r as Record<string, unknown>)[c.key] ?? '')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Key / value ────────────────────────────────────────────── */
export function KeyValue({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="kv">
      {items.map(([k, v], i) => (
        <div key={i} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ── Tabs / segmented ───────────────────────────────────────── */
export function Tabs<T extends string>({ tabs, value, onChange, tour }: { tabs: { id: T; label: ReactNode; count?: number; icon?: ReactNode }[]; value: T; onChange: (v: T) => void; tour?: string }) {
  return (
    <div className="tabs" role="tablist" data-tour={tour}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>
          {t.icon}
          {t.label}
          {t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; ariaLabel?: string }) {
  return (
    <div className="seg" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Feedback ───────────────────────────────────────────────── */
export function Callout({ tone = 'info', children, icon }: { tone?: 'info' | 'warn' | 'crit' | 'ok' | 'neutral'; children: ReactNode; icon?: ReactNode }) {
  const def = tone === 'crit' ? <AlertTriangle /> : tone === 'warn' ? <AlertTriangle /> : tone === 'ok' ? <CheckCircle2 /> : <Info />;
  return (
    <div className={`callout callout-${tone}`}>
      {icon ?? def}
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ title, body, action, icon }: { title: ReactNode; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <Inbox />}
      <div className="strong" style={{ color: 'var(--ink-2)' }}>{title}</div>
      {body && <div className="mt">{body}</div>}
      {action && <div className="mt-lg">{action}</div>}
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="spin" aria-label="Loading" />;
}

export function PlanPending({ text }: { text?: string }) {
  const progress = useAppStore((s) => s.planProgress);
  const status = useAppStore((s) => s.planStatus);
  const error = useAppStore((s) => s.planError);
  const run = useAppStore((s) => s.runPlan);
  if (status === 'error')
    return (
      <div className="card">
        <div className="card-body">
          <Callout tone="crit">
            <b>The planning engine failed.</b> {error}
            <div className="mt">
              <button className="btn btn-sm" onClick={() => void run({ reason: 'retry' })}>Retry</button>
            </div>
          </Callout>
        </div>
      </div>
    );
  return (
    <div className="card">
      <div className="card-body row" style={{ gap: 12 }}>
        <Spinner />
        <div>
          <div className="strong">{text ?? 'Computing the block plan'}</div>
          <div className="small muted">{progress || 'Starting the planning engine'}</div>
        </div>
      </div>
    </div>
  );
}

/* ── Form ───────────────────────────────────────────────────── */
export function Field({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <div className="error">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

/* ── Overlays ───────────────────────────────────────────────── */
function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
}

export function Drawer({ open, onClose, title, subtitle, children, footer, badges, width }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; badges?: ReactNode; width?: number }) {
  useEscape(open, onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  if (!open) return null;
  return createPortal(
    <>
      <div className="backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Details'} ref={ref} tabIndex={-1} style={width ? { width: `min(${width}px, 100vw)` } : undefined}>
        <div className="drawer-head">
          <div className="grow">
            {subtitle && <div className="caps">{subtitle}</div>}
            <h2>{title}</h2>
            {badges && <div className="row-wrap mt">{badges}</div>}
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </>,
    document.body
  );
}

export function Modal({ open, onClose, title, children, footer, width }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEscape(open, onClose);
  if (!open) return null;
  return createPortal(
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="modal-wrap" onClick={onClose}>
        <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={width ? { width: `min(${width}px, 100%)` } : undefined}>
          <div className="drawer-head">
            <h2 className="grow">{title}</h2>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close">
              <X />
            </button>
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="drawer-foot">{footer}</div>}
        </div>
      </div>
    </>,
    document.body
  );
}

export function Toasts() {
  const toasts = useAppStore((s) => s.toasts);
  const dismiss = useAppStore((s) => s.dismissToast);
  if (!toasts.length) return null;
  return createPortal(
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`} onClick={() => dismiss(t.id)}>
          {t.tone === 'ok' ? <CheckCircle2 /> : t.tone === 'crit' || t.tone === 'warn' ? <AlertTriangle /> : <Info />}
          <div>
            <div className="t-title">{t.title}</div>
            {t.body && <div style={{ opacity: 0.85 }}>{t.body}</div>}
          </div>
        </div>
      ))}
    </div>,
    document.body
  );
}
