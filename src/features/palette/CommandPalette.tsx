/**
 * Ctrl+K palette: pages of the current portal, works, blocks, trains and
 * stations from the live snapshot. Everything it lists opens somewhere real.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, CornerDownLeft, Train, MapPin, Wrench, CalendarCheck, FileText } from 'lucide-react';
import type { PortalId } from '../../auth/portals';
import { useLang } from '../../i18n';
import { useAppStore } from '../../store/useAppStore';
import { navItemsFlat } from '../../app/nav';
import { DeptBadge } from '../../components/ui';
import type { Dept } from '../../engine/types';
import './palette.css';

interface Hit {
  id: string;
  kind: 'page' | 'task' | 'block' | 'train' | 'station';
  title: string;
  sub?: string;
  route: string;
  dept?: Dept;
}

/** Where a task / block / train / station opens for each portal (pages that mount the matching drawer). */
export function routeForTask(portal: PortalId, taskId: string): string {
  if (portal === 'tms' || portal === 'smms' || portal === 'tdms') return `/app/${portal}/register?task=${taskId}`;
  if (portal === 'control') return `/app/control/board?task=${taskId}`;
  if (portal === 'division') return `/app/division/escalations?task=${taskId}`;
  if (portal === 'field') return '/app/field/today';
  return `/app/planning/risk?task=${taskId}`;
}
export function routeForBlock(portal: PortalId, blockId: string): string {
  if (portal === 'tms' || portal === 'smms' || portal === 'tdms') return `/app/${portal}/blocks?block=${blockId}`;
  if (portal === 'control') return `/app/control/board?block=${blockId}`;
  if (portal === 'division') return `/app/division/brief?block=${blockId}`;
  if (portal === 'field') return `/app/field/today?block=${blockId}`;
  return `/app/planning/weekly?block=${blockId}`;
}
export function routeForTrain(portal: PortalId, number: string): string {
  if (portal === 'control') return `/app/control/map?train=${number}`;
  if (portal === 'field') return `/app/field/train?train=${number}`;
  return `/citizen/train/${number}`;
}
export function routeForStation(portal: PortalId, code: string): string {
  if (portal === 'control') return `/app/control/map?station=${code}`;
  return `/citizen/station/${code}`;
}
export function routeForReport(portal: PortalId, reportId: string): string {
  if (portal === 'tms' || portal === 'smms' || portal === 'tdms') return `/app/${portal}/incidents?report=${reportId}`;
  if (portal === 'division') return `/app/division/incidents?report=${reportId}`;
  if (portal === 'field') return `/app/field/reports?report=${reportId}`;
  if (portal === 'citizen') return `/citizen/reports?report=${reportId}`;
  return `/app/control/incidents?report=${reportId}`;
}

export function CommandPalette({ open, onClose, portal }: { open: boolean; onClose: () => void; portal: PortalId }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();
  const lang = useLang();
  const snapshot = useAppStore((s) => s.snapshot);

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const hits = useMemo<Hit[]>(() => {
    const query = q.trim().toLowerCase();
    const out: Hit[] = [];
    const pages = navItemsFlat(portal).map<Hit>((i) => ({ id: i.route, kind: 'page', title: i.label[lang === 'hi' ? 'hi' : 'en'], sub: i.route, route: i.route }));
    if (!query) return pages.slice(0, 8);
    for (const p of pages) if (p.title.toLowerCase().includes(query) || p.route.includes(query)) out.push(p);
    if (snapshot) {
      for (const t of snapshot.tasks) {
        if (out.length > 40) break;
        if (t.id.toLowerCase().includes(query) || t.label.toLowerCase().includes(query) || t.sectionLabel.toLowerCase().includes(query) || t.sourceId.toLowerCase().includes(query))
          out.push({ id: t.id, kind: 'task', title: `${t.id} · ${t.label}`, sub: `${t.sectionLabel} · ${t.line} · ARCI ${t.risk.arci.toFixed(2)}`, route: routeForTask(portal, t.id), dept: t.dept });
      }
      for (const b of snapshot.result.weekly.ai.blocks) {
        if (out.length > 50) break;
        if (b.id.toLowerCase().includes(query) || b.sectionText.toLowerCase().includes(query))
          out.push({ id: b.id, kind: 'block', title: `${b.id} · ${b.sectionText} ${b.line}`, sub: `${b.dateLabel} ${b.startText}–${b.endText} · ${b.departments.join(' + ')}`, route: routeForBlock(portal, b.id) });
      }
      for (const tr of snapshot.feeds.timetable) {
        if (out.length > 60) break;
        if (tr.number.includes(query) || tr.name.toLowerCase().includes(query))
          out.push({ id: tr.id, kind: 'train', title: `${tr.number} · ${tr.name}`, sub: `${tr.origin} → ${tr.destination} · ${tr.line} · ${tr.classLabel}`, route: routeForTrain(portal, tr.number) });
      }
      for (const st of snapshot.corridor.stations) {
        if (st.code.toLowerCase().includes(query) || st.name.toLowerCase().includes(query))
          out.push({ id: st.code, kind: 'station', title: `${st.code} · ${st.name}`, sub: `km ${st.km}${st.junction ? ' · junction' : ''}`, route: routeForStation(portal, st.code) });
      }
    }
    return out.slice(0, 40);
  }, [q, snapshot, portal, lang]);

  useEffect(() => {
    setIdx(0);
  }, [hits.length]);

  if (!open) return null;
  const go = (h: Hit) => {
    onClose();
    nav(h.route);
  };
  const icon = (k: Hit['kind']) => (k === 'page' ? <FileText size={15} /> : k === 'task' ? <Wrench size={15} /> : k === 'block' ? <CalendarCheck size={15} /> : k === 'train' ? <Train size={15} /> : <MapPin size={15} />);

  return createPortal(
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search">
        <div className="palette-input">
          <Search size={18} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={lang === 'hi' ? 'पेज, कार्य, ब्लॉक, ट्रेन, स्टेशन खोजें…' : 'Search pages, works, blocks, trains, stations…'}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(hits.length - 1, i + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
              if (e.key === 'Enter' && hits[idx]) go(hits[idx]);
            }}
          />
          <kbd className="kbd">Esc</kbd>
        </div>
        <div className="palette-list" role="listbox">
          {hits.length === 0 && <div className="empty" style={{ border: 'none' }}>{lang === 'hi' ? 'कोई परिणाम नहीं' : 'No matches'}</div>}
          {hits.map((h, i) => (
            <button key={`${h.kind}-${h.id}`} className={`palette-item ${i === idx ? 'active' : ''}`} onMouseEnter={() => setIdx(i)} onClick={() => go(h)} role="option" aria-selected={i === idx}>
              <span className="palette-kind">{icon(h.kind)}</span>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="strong small truncate" style={{ display: 'block' }}>{h.title}</span>
                {h.sub && <span className="tiny muted truncate" style={{ display: 'block' }}>{h.sub}</span>}
              </span>
              {h.dept && <DeptBadge dept={h.dept} />}
              {i === idx && <CornerDownLeft size={14} className="muted" />}
            </button>
          ))}
        </div>
      </div>
    </>,
    document.body
  );
}
