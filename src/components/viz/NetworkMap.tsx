/**
 * NetworkMap — every corridor in engine/corridors.js CORRIDORS on one small
 * Leaflet map, each drawn through its stations with its code. The active
 * corridor is drawn in --ink, the others muted in --ink-4. Clicking a line
 * or a button in the list below calls onSelect(id); the page decides what a
 * switch means (the division brief asks for confirmation via
 * useCorridorSwitch). Same tile / schematic fallback as CorridorMap.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import { CORRIDORS } from '../../engine/corridors.js';
import type { Corridor } from '../../engine/types';
import { useAppStore } from '../../store/useAppStore';
import { useT } from '../../i18n';
import { num } from '../../lib/format';
import { Badge } from '../ui';
import './CorridorMap.css';
import './NetworkMap.css';

export interface NetworkMapProps {
  /** corridor id drawn as active (store corridorId) */
  activeId: string;
  /** called with a corridor id when a line or list button is chosen (never for the active one) */
  onSelect: (id: string) => void;
  /** map height in px (the list below is extra) */
  height?: number;
}

const strings = {
  en: {
    mapLabel: 'Corridor network map',
    listLabel: 'Corridors',
    tilesDown: 'Map tiles unavailable — schematic view',
    active: 'Planned now',
    km: 'km',
    stations: '{n} stations',
    select: 'Select {code} to switch',
    isActive: '{code} is the corridor being planned',
  },
  hi: {
    mapLabel: 'कॉरिडोर नेटवर्क मानचित्र',
    listLabel: 'कॉरिडोर',
    tilesDown: 'मानचित्र टाइल उपलब्ध नहीं — योजनाबद्ध दृश्य',
    active: 'अभी नियोजित',
    km: 'किमी',
    stations: '{n} स्टेशन',
    select: 'बदलने के लिए {code} चुनें',
    isActive: '{code} की योजना अभी बन रही है',
  },
} as const;

const LIST = CORRIDORS as Corridor[];
const BLANK_TILE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

interface Tok {
  ink: string;
  ink3: string;
  ink4: string;
  bg1: string;
}

function readTokens(): Tok {
  const cs = typeof window === 'undefined' ? null : getComputedStyle(document.documentElement);
  const g = (n: string, fb: string) => (cs ? cs.getPropertyValue(n).trim() : '') || fb;
  return { ink: g('--ink', '#111111'), ink3: g('--ink-3', '#6b7280'), ink4: g('--ink-4', '#9ca3af'), bg1: g('--bg-1', '#ffffff') };
}

const pts = (c: Corridor) => c.stations.map((s) => [s.lat, s.lng] as L.LatLngTuple);

export function NetworkMap({ activeId, onSelect, height = 300 }: NetworkMapProps) {
  const t = useT(strings);
  const theme = useAppStore((s) => s.theme);
  const [tok, setTok] = useState<Tok>(() => readTokens());
  const [tilesFailed, setTilesFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const groupRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  useLayoutEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    const id = requestAnimationFrame(() => setTok(readTokens()));
    return () => cancelAnimationFrame(id);
  }, [theme]);

  /* map instance — once per mount; fits every corridor */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, dragging: !L.Browser.mobile, boxZoom: false, keyboard: false, zoomSnap: 0.25 });
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
      errorTileUrl: BLANK_TILE,
    });
    let loaded = 0;
    let errors = 0;
    tiles.on('tileload', () => {
      loaded++;
    });
    tiles.on('tileerror', () => {
      errors++;
      if (loaded === 0 && errors >= 2 && map.hasLayer(tiles)) {
        map.removeLayer(tiles);
        setTilesFailed(true);
      }
    });
    tiles.addTo(map);
    groupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const bounds = L.latLngBounds(LIST.flatMap(pts));
    const fit = () => map.fitBounds(bounds, { padding: [28, 28], animate: false });
    fit();
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
      fit();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      groupRef.current = null;
    };
  }, []);

  /* corridor lines — redrawn on theme or active change */
  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    g.clearLayers();
    // active last so it sits on top
    const order = [...LIST].sort((a, b) => Number(a.id === activeId) - Number(b.id === activeId));
    for (const c of order) {
      const active = c.id === activeId;
      const base = { color: active ? tok.ink : tok.ink4, weight: active ? 5 : 3, opacity: active ? 1 : 0.9 };
      const line = L.polyline(pts(c), { ...base, lineJoin: 'round', lineCap: 'round', interactive: false }).addTo(g);
      line.bindTooltip(c.code, { permanent: true, direction: 'top', offset: [0, -6], className: `cmap-label${active ? ' junction' : ''}`, opacity: 1 });
      const ends = [c.stations[0], c.stations[c.stations.length - 1]];
      for (const s of ends) L.circleMarker([s.lat, s.lng], { radius: active ? 4 : 3, color: base.color, weight: 1.5, fillColor: tok.bg1, fillOpacity: 1, interactive: false }).addTo(g);
      // wide transparent twin: an easy click / hover target
      const hit = L.polyline(pts(c), { color: base.color, weight: 18, opacity: 0, lineCap: 'round' }).addTo(g);
      const tip = `${c.code} · ${c.name} · ${c.zone} · ${num(c.lengthKm)} ${t('km')}`;
      hit.bindTooltip(active ? `${tip} · ${t('active')}` : `${tip} · ${t('select', { code: c.code })}`, { sticky: true, className: 'cmap-tip' });
      if (!active) {
        hit.on('mouseover', () => line.setStyle({ color: tok.ink3, weight: 5 }));
        hit.on('mouseout', () => line.setStyle({ color: base.color, weight: base.weight }));
        hit.on('click', () => onSelectRef.current(c.id));
      }
    }
  }, [tok, activeId, t]);

  return (
    <div className="stack">
      <div className={`cmap nmap${tilesFailed ? ' schematic' : ''}`} style={{ height }}>
        <div ref={containerRef} className="cmap-canvas" role="region" aria-label={t('mapLabel')} />
        {tilesFailed && (
          <span className="cmap-chip" role="status">
            {t('tilesDown')}
          </span>
        )}
      </div>
      <ul className="nmap-list" aria-label={t('listLabel')}>
        {LIST.map((c) => {
          const active = c.id === activeId;
          return (
            <li key={c.id}>
              <button
                type="button"
                className={`nmap-item${active ? ' active' : ''}`}
                onClick={() => onSelect(c.id)}
                disabled={active}
                aria-current={active ? 'true' : undefined}
                title={active ? t('isActive', { code: c.code }) : t('select', { code: c.code })}
              >
                <span className="nmap-code mono strong">{c.code}</span>
                <span className="nmap-name small truncate">{c.name}</span>
                <span className="nmap-meta tiny muted">
                  {c.zone} · {c.division} · <span className="num">{num(c.lengthKm)}</span> {t('km')} · {t('stations', { n: c.stations.length })}
                </span>
                {active && (
                  <Badge tone="blue" className="nmap-badge">
                    {t('active')}
                  </Badge>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default NetworkMap;
