/**
 * CorridorMap — Leaflet map of one corridor: track polyline through the
 * stations, block sections coloured by tonight's possessions, work sites
 * (ARCI-sized), WTT-derived train positions, hazard pins, depots, OHE
 * elementary sections and S&T signalling assets (signals, points, track
 * circuits, LC gates).
 * Everything drawn comes from the snapshot or from recorded actions.
 * When OSM tiles cannot be fetched the vector layers stay on a blank
 * ground (schematic view). Layer toggles are rendered by the page.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as L from 'leaflet';
import { latLngAtKm } from '../../engine/corridors.js';
import type { Block, Corridor, Crew, Dept, Line, Machine, Signal, Task } from '../../engine/types';
import type { LivePosition } from '../../engine/select';
import { useAppStore, type HazardReport } from '../../store/useAppStore';
import { useT } from '../../i18n';
import { DEPT_LABEL, URGENCY_LABEL, classLabel, dateLabel, kmRange, lineLabel } from '../../lib/format';
import './CorridorMap.css';

/** 'signal' is accepted by `selected` (highlight ring); the map never calls onSelect with it. */
export type MapSelectKind = 'task' | 'block' | 'train' | 'report' | 'station' | 'machine' | 'crew' | 'signal';

export interface MapLayers {
  stations?: boolean;
  blocks?: boolean;
  tasks?: boolean;
  trains?: boolean;
  incidents?: boolean;
  /** machine / gang home depots — needs the `machines` / `crews` props */
  depots?: boolean;
  /** OHE elementary sections + traction sub-stations */
  ohe?: boolean;
  /** corridor.signals — S&T signalling assets (default off) */
  signals?: boolean;
}

/** Signal kinds produced by engine/corridors.js buildSignals. */
export type SignalKind = 'DISTANT' | 'HOME' | 'STARTER' | 'ADV_STARTER' | 'POINT' | 'TRACK_CIRCUIT' | 'LC_GATE';

/** Below this zoom the signals layer shows one count per station (plus LC gates); at or above it, every asset. */
export const SIGNAL_DETAIL_ZOOM = 13;

export interface MapPin {
  km: number;
  line?: Line;
  label?: string;
}

export interface CorridorMapProps {
  corridor: Corridor;
  blocks?: Block[];
  tasks?: Task[];
  /** from select.livePositions — interpolated from the WTT, not telemetry */
  trains?: LivePosition[];
  incidents?: HazardReport[];
  machines?: Machine[];
  crews?: Crew[];
  layers?: MapLayers;
  /** only these signal kinds when layers.signals is on (omit for all; an empty array shows none) */
  signalKinds?: string[];
  /** id (any kind) or {kind, id} — gets a highlight ring */
  selected?: string | { kind: MapSelectKind; id: string } | null;
  onSelect?: (kind: MapSelectKind, id: string) => void;
  height?: number;
  mini?: boolean;
  /** a single chainage pin (used by MiniMap) */
  pin?: MapPin | null;
  className?: string;
  tour?: string;
}

const strings = {
  en: {
    tilesDown: 'Map tiles unavailable — schematic view',
    open: 'Open',
    junction: 'Junction',
    station: 'Station',
    km: 'km',
    window: 'Window',
    section: 'Block section',
    line: 'Line',
    kind: 'Kind',
    departments: 'Departments',
    status: 'Status',
    arci: 'ARCI',
    urgency: 'Urgency',
    work: 'Work',
    trainClass: 'Class',
    next: 'Next station',
    haltedAt: 'Halted at',
    speed: 'Speed',
    kmph: 'km/h',
    insideBlock: 'Inside a planned block section',
    incident: 'Hazard report',
    category: 'Category',
    reported: 'Reported',
    depot: 'Home depot',
    machine: 'Machine',
    crew: 'Gang',
    ohe: 'OHE elementary section',
    tss: 'Traction sub-station',
    legendBlock: 'Block tonight',
    legendProposed: 'Proposed',
    legendWork: 'Work site (size = ARCI)',
    legendTrain: 'Train (WTT position)',
    legendIncident: 'Hazard',
    legendDepot: 'Depot',
    wttNote: 'Train positions are interpolated from the working timetable, not telemetry.',
    pinAt: 'Pin at',
    health: 'Health',
    reach: 'Reach',
    legendOhe: 'OHE elementary section',
    legendTss: 'TSS',
    kDISTANT: 'Distant signal',
    kHOME: 'Home signal',
    kSTARTER: 'Starter signal',
    kADV_STARTER: 'Advanced starter signal',
    kPOINT: 'Points',
    kTRACK_CIRCUIT: 'Track circuit',
    kLC_GATE: 'LC gate',
    legendSignal: 'Signal',
    legendPoint: 'Points',
    legendTc: 'Track circuit',
    legendLc: 'LC gate',
    assetId: 'Asset id',
    signalNo: 'Signal no.',
    pointNo: 'Point no.',
    detection: 'Detection',
    lcClass: 'LC class',
    interlocking: 'Interlocking',
    interlocked: 'Interlocked',
    nonInterlocked: 'Non-interlocked',
    towards: 'Towards',
    bothLines: 'Both lines',
    sigAssets: 'signalling assets',
    zoomIn: 'Click to zoom in to each asset',
    sigNote: 'Signalling assets are typical placements from the station layout, not a surveyed interlocking plan. UP-line assets are drawn above the track, DN below.',
    sigZoomNote: 'Zoomed out: one count per station. Zoom in to see each signal, point and track circuit.',
  },
  hi: {
    tilesDown: 'मानचित्र टाइल उपलब्ध नहीं — योजनाबद्ध दृश्य',
    open: 'खोलें',
    junction: 'जंक्शन',
    station: 'स्टेशन',
    km: 'किमी',
    window: 'समय-खिड़की',
    section: 'ब्लॉक सेक्शन',
    line: 'लाइन',
    kind: 'प्रकार',
    departments: 'विभाग',
    status: 'स्थिति',
    arci: 'ARCI',
    urgency: 'तात्कालिकता',
    work: 'कार्य',
    trainClass: 'श्रेणी',
    next: 'अगला स्टेशन',
    haltedAt: 'ठहराव',
    speed: 'गति',
    kmph: 'किमी/घं',
    insideBlock: 'नियोजित ब्लॉक सेक्शन के भीतर',
    incident: 'खतरा रिपोर्ट',
    category: 'श्रेणी',
    reported: 'सूचित',
    depot: 'होम डिपो',
    machine: 'मशीन',
    crew: 'गैंग',
    ohe: 'OHE एलिमेंटरी सेक्शन',
    tss: 'ट्रैक्शन सब-स्टेशन',
    legendBlock: 'आज रात का ब्लॉक',
    legendProposed: 'प्रस्तावित',
    legendWork: 'कार्य स्थल (आकार = ARCI)',
    legendTrain: 'ट्रेन (WTT स्थिति)',
    legendIncident: 'खतरा',
    legendDepot: 'डिपो',
    wttNote: 'ट्रेन स्थितियाँ कार्य समय-सारणी से अनुमानित हैं, टेलीमेट्री से नहीं।',
    pinAt: 'पिन',
    health: 'स्वास्थ्य',
    reach: 'पहुँच',
    legendOhe: 'OHE एलिमेंटरी सेक्शन',
    legendTss: 'TSS',
    kDISTANT: 'Distant सिग्नल',
    kHOME: 'Home सिग्नल',
    kSTARTER: 'Starter सिग्नल',
    kADV_STARTER: 'Advanced starter सिग्नल',
    kPOINT: 'Points (कांटा)',
    kTRACK_CIRCUIT: 'Track circuit',
    kLC_GATE: 'LC गेट (समपार फाटक)',
    legendSignal: 'सिग्नल',
    legendPoint: 'Points',
    legendTc: 'Track circuit',
    legendLc: 'LC गेट',
    assetId: 'परिसंपत्ति id',
    signalNo: 'सिग्नल क्रमांक',
    pointNo: 'Point क्रमांक',
    detection: 'डिटेक्शन',
    lcClass: 'LC श्रेणी',
    interlocking: 'इंटरलॉकिंग',
    interlocked: 'इंटरलॉक्ड',
    nonInterlocked: 'नॉन-इंटरलॉक्ड',
    towards: 'की ओर',
    bothLines: 'दोनों लाइनें',
    sigAssets: 'सिग्नलिंग परिसंपत्तियाँ',
    zoomIn: 'हर परिसंपत्ति देखने के लिए क्लिक कर ज़ूम करें',
    sigNote: 'सिग्नलिंग परिसंपत्तियाँ स्टेशन लेआउट की सामान्य स्थितियाँ हैं, सर्वेक्षित इंटरलॉकिंग योजना नहीं। UP लाइन की परिसंपत्तियाँ ट्रैक के ऊपर, DN नीचे दिखाई गई हैं।',
    sigZoomNote: 'ज़ूम आउट: प्रति स्टेशन एक गिनती। हर सिग्नल, point और track circuit देखने के लिए ज़ूम करें।',
  },
} as const;

type TKey = keyof typeof strings.en;
type Tf = (k: TKey) => string;

/* ── tokens ──────────────────────────────────────────────────── */

interface Tok {
  ink: string;
  ink3: string;
  ink4: string;
  bg1: string;
  accent: string;
  crit: string;
  TMS: string;
  SMMS: string;
  TDMS: string;
  coa: string;
  trainVb: string;
  trainPrem: string;
  trainPass: string;
  trainGoods: string;
}

function readTokens(): Tok {
  const cs = typeof window === 'undefined' ? null : getComputedStyle(document.documentElement);
  const g = (n: string, fb: string) => (cs ? cs.getPropertyValue(n).trim() : '') || fb;
  return {
    ink: g('--ink', '#111111'),
    ink3: g('--ink-3', '#6b7280'),
    ink4: g('--ink-4', '#9ca3af'),
    bg1: g('--bg-1', '#ffffff'),
    accent: g('--accent', '#f28c28'),
    crit: g('--crit', '#e85d5d'),
    TMS: g('--tms', '#2e7d32'),
    SMMS: g('--smms', '#2f6fde'),
    TDMS: g('--tdms', '#d9700f'),
    coa: g('--coa', '#7e57c2'),
    trainVb: g('--train-vb', '#111111'),
    trainPrem: g('--train-prem', '#b08900'),
    trainPass: g('--train-pass', '#5b6470'),
    trainGoods: g('--train-goods', '#9ca3af'),
  };
}

const deptColor = (tok: Tok, d: Dept | null | undefined) => (d ? tok[d] : tok.ink4);

function trainColor(tok: Tok, p: LivePosition): string {
  if (p.cls === 'VB') return tok.trainVb;
  if (p.premium) return tok.trainPrem;
  if (p.cls === 'GOODS' || p.cls === 'PARCEL') return tok.trainGoods;
  return tok.trainPass;
}

/* ── geometry ────────────────────────────────────────────────── */

const at = (corridor: Corridor, km: number): L.LatLngTuple => latLngAtKm(corridor, km) as L.LatLngTuple;

/** Polyline points along the corridor between two chainages (through intermediate stations). */
function pathKm(corridor: Corridor, a: number, b: number): L.LatLngTuple[] {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const pts: L.LatLngTuple[] = [at(corridor, lo)];
  for (const s of corridor.stations) if (s.km > lo && s.km < hi) pts.push([s.lat, s.lng]);
  pts.push(at(corridor, hi));
  return pts;
}

/* ── popup DOM (Leaflet takes an element, so the Open button is a real handler) ── */

function popupEl(title: string, rows: [string, string][], opts?: { text?: string; open?: { label: string; onOpen: () => void }; swatch?: string }): HTMLElement {
  const el = document.createElement('div');
  el.className = 'cmap-pop';
  const h = document.createElement('div');
  h.className = 'cmap-pop-title';
  if (opts?.swatch) {
    const sw = document.createElement('span');
    sw.className = 'dot';
    sw.style.background = opts.swatch;
    h.appendChild(sw);
  }
  h.appendChild(document.createTextNode(title));
  el.appendChild(h);
  if (opts?.text) {
    const p = document.createElement('div');
    p.className = 'cmap-pop-text';
    p.textContent = opts.text;
    el.appendChild(p);
  }
  for (const [k, v] of rows) {
    const r = document.createElement('div');
    r.className = 'cmap-pop-row';
    const ks = document.createElement('span');
    ks.textContent = k;
    const vs = document.createElement('b');
    vs.textContent = v;
    r.append(ks, vs);
    el.appendChild(r);
  }
  if (opts?.open) {
    const f = document.createElement('div');
    f.className = 'cmap-pop-foot';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-sm btn-dark';
    b.textContent = opts.open.label;
    b.addEventListener('click', opts.open.onOpen);
    f.appendChild(b);
    el.appendChild(f);
  }
  return el;
}

const TRIANGLE = (color: string, stroke: string) =>
  `<svg width="22" height="20" viewBox="0 0 22 20" aria-hidden="true"><path d="M11 1.5 L21 18.5 L1 18.5 Z" fill="${color}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/><rect x="10" y="7" width="2" height="6" rx="1" fill="${stroke}"/><circle cx="11" cy="15.5" r="1.2" fill="${stroke}"/></svg>`;

const PIN = (color: string, stroke: string) =>
  `<svg width="18" height="24" viewBox="0 0 18 24" aria-hidden="true"><path d="M9 1.5c-4.1 0-7.5 3.3-7.5 7.4 0 5.4 7.5 13.6 7.5 13.6s7.5-8.2 7.5-13.6C16.5 4.8 13.1 1.5 9 1.5z" fill="${color}" stroke="${stroke}" stroke-width="1.5"/><circle cx="9" cy="9" r="2.6" fill="${stroke}"/></svg>`;

const BLANK_TILE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const PANES: [string, number][] = [
  ['cmap-corridor', 401],
  ['cmap-blocks', 402],
  ['cmap-ohe', 403],
  ['cmap-tasks', 404],
  ['cmap-stations', 405],
  ['cmap-highlight', 406],
  // marker pane (divIcons): above the vector panes, below trains / hazards (markerPane 600)
  ['cmap-signals', 450],
];

interface Groups {
  corridor: L.LayerGroup;
  ohe: L.LayerGroup;
  signals: L.LayerGroup;
  blocks: L.LayerGroup;
  tasks: L.LayerGroup;
  trains: L.LayerGroup;
  incidents: L.LayerGroup;
  depots: L.LayerGroup;
  pin: L.LayerGroup;
  highlight: L.LayerGroup;
}

const DEFAULT_LAYERS: Required<MapLayers> = { stations: true, blocks: true, tasks: true, trains: true, incidents: true, depots: false, ohe: false, signals: false };

function statusOf(b: Block): string {
  return (b as { status?: string }).status ?? 'PROPOSED';
}

/** Extra fields buildSignals puts on some kinds (engine/corridors.js). */
type SignalAsset = Signal & { number?: string; pointNo?: string; detection?: string; towards?: string; lcClass?: string; interlocked?: boolean };

const SIG_SHAPE: Record<string, string> = {
  DISTANT: 'k-sig distant',
  HOME: 'k-sig',
  STARTER: 'k-sig',
  ADV_STARTER: 'k-sig',
  POINT: 'k-point',
  TRACK_CIRCUIT: 'k-tc',
  LC_GATE: 'k-lc',
};
const isSignalKind = (k: string): k is SignalKind => k in SIG_SHAPE;
/** zoom used when a station count is clicked */
const SIGNAL_STATION_ZOOM = 15;

/* ── component ───────────────────────────────────────────────── */

export function CorridorMap({ corridor, blocks = [], tasks = [], trains = [], incidents = [], machines = [], crews = [], layers, signalKinds, selected = null, onSelect, height = 460, mini = false, pin = null, className = '', tour }: CorridorMapProps) {
  const t = useT(strings) as Tf;
  const theme = useAppStore((s) => s.theme);
  const [tok, setTok] = useState<Tok>(() => readTokens());
  const [tilesFailed, setTilesFailed] = useState(false);
  /** zoom band for the signals layer (station counts vs every asset) */
  const [sigDetail, setSigDetail] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const groupsRef = useRef<Groups | null>(null);
  const fittedRef = useRef<string | null>(null);
  const onSelectRef = useRef(onSelect);
  const tRef = useRef(t);
  // latest handler / translator for Leaflet callbacks (updated before the drawing effects run)
  useLayoutEffect(() => {
    onSelectRef.current = onSelect;
    tRef.current = t;
  });

  const lay = useMemo(() => ({ ...DEFAULT_LAYERS, ...(layers ?? {}) }), [layers]);
  const sel = useMemo(() => (typeof selected === 'string' ? { kind: null as MapSelectKind | null, id: selected } : selected ? { kind: selected.kind, id: selected.id } : null), [selected]);

  // token colours follow the theme (light / dark / sunlight)
  useEffect(() => {
    const id = requestAnimationFrame(() => setTok(readTokens()));
    return () => cancelAnimationFrame(id);
  }, [theme]);

  const select = (kind: MapSelectKind, id: string) => onSelectRef.current?.(kind, id);

  /* map instance — once per mount */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const map = L.map(el, {
      zoomControl: !mini,
      attributionControl: true,
      scrollWheelZoom: !mini,
      dragging: !mini || !L.Browser.mobile,
      doubleClickZoom: !mini,
      touchZoom: !mini,
      boxZoom: false,
      keyboard: !mini,
      zoomSnap: 0.25,
    });
    if (mini) map.attributionControl.setPrefix(false);
    for (const [name, z] of PANES) {
      const p = map.createPane(name);
      p.style.zIndex = String(z);
    }
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
    map.on('zoomend', () => setSigDetail(map.getZoom() >= SIGNAL_DETAIL_ZOOM));
    const mk = () => L.layerGroup().addTo(map);
    groupsRef.current = { corridor: mk(), ohe: mk(), signals: mk(), blocks: mk(), tasks: mk(), trains: mk(), incidents: mk(), depots: mk(), pin: mk(), highlight: mk() };
    mapRef.current = map;
    fittedRef.current = null;
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      groupsRef.current = null;
    };
  }, [mini]);

  /* corridor polyline + stations; fit bounds on corridor change only */
  useEffect(() => {
    const map = mapRef.current;
    const g = groupsRef.current;
    if (!map || !g) return;
    g.corridor.clearLayers();
    const pts = corridor.stations.map((s) => [s.lat, s.lng] as L.LatLngTuple);
    const line = L.polyline(pts, { pane: 'cmap-corridor', color: tok.ink, weight: 3, opacity: 0.9, lineJoin: 'round' }).addTo(g.corridor);
    if (lay.stations) {
      for (const s of corridor.stations) {
        const m = L.circleMarker([s.lat, s.lng], { pane: 'cmap-stations', radius: s.junction ? (mini ? 4.5 : 6) : mini ? 3 : 4, color: tok.ink, weight: 1.5, fillColor: tok.bg1, fillOpacity: 1 });
        m.bindTooltip(s.code, { permanent: !mini || s.junction, direction: 'top', offset: [0, -6], className: `cmap-label${s.junction ? ' junction' : ''}`, opacity: 1 });
        m.bindPopup(() => popupEl(`${s.name} (${s.code})`, [[tRef.current('km'), s.km.toFixed(1)], [tRef.current('station'), s.junction ? tRef.current('junction') : tRef.current('station')]], onSelectRef.current ? { open: { label: tRef.current('open'), onOpen: () => select('station', s.code) } } : undefined));
        m.addTo(g.corridor);
      }
    }
    if (fittedRef.current !== corridor.id) {
      map.fitBounds(line.getBounds(), { padding: mini ? [12, 12] : [28, 28], animate: false });
      fittedRef.current = corridor.id;
    }
  }, [corridor, tok, lay.stations, mini]);

  /* OHE elementary sections + traction sub-stations */
  useEffect(() => {
    const g = groupsRef.current;
    if (!g) return;
    g.ohe.clearLayers();
    if (!lay.ohe) return;
    corridor.oheSections.forEach((es, i) => {
      const pl = L.polyline(pathKm(corridor, es.startKm, es.endKm), { pane: 'cmap-ohe', color: tok.TDMS, weight: 2.5, opacity: i % 2 ? 0.45 : 0.9, dashArray: i % 2 ? '6 5' : undefined });
      pl.bindTooltip(`${es.label} · ${kmRange(es.startKm, es.endKm)} · ${es.spFrom} → ${es.spTo}`, { sticky: true, className: 'cmap-tip' });
      pl.addTo(g.ohe);
    });
    for (const s of corridor.tss) {
      const m = L.marker(at(corridor, s.km), { icon: L.divIcon({ className: 'cmap-icon', iconSize: [0, 0], html: `<span class="cmap-depot" style="background:${tok.TDMS};transform:translate(-50%,-50%) rotate(45deg)"></span>` }), keyboard: false });
      m.bindTooltip(`${tRef.current('tss')} ${s.code} · km ${s.km}`, { direction: 'top', className: 'cmap-tip' });
      m.addTo(g.ohe);
    }
  }, [corridor, tok, lay.ohe]);

  /* S&T signalling assets — shapes and colour come from CSS classes (var(--smms) = S&T) */
  const sigKey = signalKinds ? signalKinds.join('|') : '*';
  useEffect(() => {
    const g = groupsRef.current;
    const map = mapRef.current;
    if (!g || !map) return;
    g.signals.clearLayers();
    if (!lay.signals || mini) return;
    const want = sigKey === '*' ? null : new Set(sigKey.split('|'));
    const list = ((corridor.signals ?? []) as SignalAsset[]).filter((s) => !want || want.has(s.kind));
    const tr = t;
    const kindName = (k: string) => (isSignalKind(k) ? tr(`k${k}` as TKey) : k);
    const stationOf = (code: string) => corridor.stations.find((s) => s.code === code);

    const addOne = (s: SignalAsset) => {
      const shape = SIG_SHAPE[s.kind] ?? 'k-point';
      const off = s.line === 'UP' ? ' l-up' : s.line === 'DN' ? ' l-dn' : '';
      const lc = s.kind === 'LC_GATE' && s.interlocked === false ? ' unint' : '';
      const icon = L.divIcon({ className: 'cmap-icon', iconSize: [0, 0], html: `<span class="cmap-sa ${shape}${off}${lc}"></span>` });
      const m = L.marker(at(corridor, s.km), { icon, pane: 'cmap-signals', keyboard: false, riseOnHover: true });
      m.bindTooltip(s.label, { direction: 'top', offset: [0, s.line === 'DN' ? 0 : -8], className: 'cmap-tip' });
      m.bindPopup(() => {
        const t2 = tRef.current;
        const st = stationOf(s.stationCode);
        const rows: [string, string][] = [
          [t2('assetId'), s.id],
          [t2('kind'), kindName(s.kind)],
        ];
        if (s.number) rows.push([t2('signalNo'), s.number]);
        if (s.pointNo) rows.push([t2('pointNo'), s.pointNo]);
        if (s.detection) rows.push([t2('detection'), s.detection]);
        if (s.lcClass) rows.push([t2('lcClass'), s.lcClass]);
        if (s.interlocked !== undefined) rows.push([t2('interlocking'), s.interlocked ? t2('interlocked') : t2('nonInterlocked')]);
        if (s.towards) rows.push([t2('towards'), s.towards]);
        rows.push([t2('km'), s.km.toFixed(3)], [t2('line'), s.line === 'BOTH' ? t2('bothLines') : s.line], [t2('station'), st ? `${st.name} (${st.code})` : s.stationCode]);
        return popupEl(s.label, rows, { swatch: tok.SMMS });
      });
      m.addTo(g.signals);
    };

    if (sigDetail) {
      for (const s of list) addOne(s);
      return;
    }
    // zoomed out: one count per station (assets sit within ±1.6 km of it); LC gates stay individual
    const byStation = new Map<string, SignalAsset[]>();
    for (const s of list) {
      if (s.kind === 'LC_GATE') {
        addOne(s);
        continue;
      }
      const arr = byStation.get(s.stationCode);
      if (arr) arr.push(s);
      else byStation.set(s.stationCode, [s]);
    }
    for (const [code, arr] of byStation) {
      const st = stationOf(code);
      if (!st) continue;
      const counts = new Map<string, number>();
      for (const s of arr) {
        const k = s.kind === 'DISTANT' || s.kind === 'HOME' || s.kind === 'STARTER' || s.kind === 'ADV_STARTER' ? 'legendSignal' : s.kind === 'POINT' ? 'legendPoint' : s.kind === 'TRACK_CIRCUIT' ? 'legendTc' : 'other';
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const parts = [...counts].map(([k, n]) => `${n} ${k === 'other' ? '' : tr(k as TKey)}`.trim());
      const icon = L.divIcon({ className: 'cmap-icon', iconSize: [0, 0], html: `<span class="cmap-sa-group">${arr.length}</span>` });
      const m = L.marker([st.lat, st.lng], { icon, pane: 'cmap-signals', keyboard: false });
      m.bindTooltip(`${code} · ${arr.length} ${tr('sigAssets')} (${parts.join(' · ')}) · ${tr('zoomIn')}`, { direction: 'bottom', offset: [0, 18], className: 'cmap-tip' });
      m.on('click', () => map.setView([st.lat, st.lng], Math.max(SIGNAL_STATION_ZOOM, map.getZoom())));
      m.addTo(g.signals);
    }
  }, [corridor, tok, t, lay.signals, sigKey, sigDetail, mini]);

  /* tonight's block sections */
  useEffect(() => {
    const g = groupsRef.current;
    if (!g) return;
    g.blocks.clearLayers();
    if (!lay.blocks) return;
    for (const b of blocks) {
      const status = statusOf(b);
      const lead = b.departments[0];
      const refused = status === 'REFUSED';
      const color = refused ? tok.ink4 : deptColor(tok, lead);
      const weight = refused ? 4 : !b.lineClosure ? 4 : b.departments.length > 1 ? 9 : 7;
      const dash = refused ? '3 7' : status === 'PROPOSED' ? '10 6' : undefined;
      const pl = L.polyline(pathKm(corridor, b.startKm, b.endKm), { pane: 'cmap-blocks', color, weight, opacity: refused ? 0.7 : 0.8, dashArray: dash, lineCap: 'butt' });
      pl.bindTooltip(`${b.sectionText} · ${b.startText}–${b.endText} · ${b.departments.map((d) => DEPT_LABEL[d].short).join(' + ')}`, { sticky: true, className: 'cmap-tip' });
      pl.bindPopup(() =>
        popupEl(
          b.id,
          [
            [tRef.current('window'), `${dateLabel(b.date)} ${b.startText}–${b.endText}`],
            [tRef.current('section'), b.sectionText],
            [tRef.current('line'), lineLabel(b.line)],
            [tRef.current('kind'), b.kind],
            [tRef.current('departments'), b.departments.map((d) => DEPT_LABEL[d].short).join(' + ')],
            [tRef.current('status'), status],
          ],
          { swatch: color, open: onSelectRef.current ? { label: tRef.current('open'), onOpen: () => select('block', b.id) } : undefined }
        )
      );
      pl.addTo(g.blocks);
    }
  }, [blocks, corridor, tok, lay.blocks]);

  /* work sites — radius by ARCI */
  useEffect(() => {
    const g = groupsRef.current;
    if (!g) return;
    g.tasks.clearLayers();
    if (!lay.tasks) return;
    for (const task of tasks) {
      const color = deptColor(tok, task.dept);
      const r = 4 + Math.max(0, Math.min(1, task.risk.arci)) * 6;
      const m = L.circleMarker(at(corridor, task.startKm), { pane: 'cmap-tasks', radius: r, color: tok.bg1, weight: 1, fillColor: color, fillOpacity: 0.85 });
      m.bindTooltip(`${task.label} · ${kmRange(task.startKm, task.endKm)} · ARCI ${task.risk.arci.toFixed(2)}`, { direction: 'top', className: 'cmap-tip' });
      m.bindPopup(() =>
        popupEl(
          task.label,
          [
            [tRef.current('arci'), task.risk.arci.toFixed(2)],
            [tRef.current('urgency'), URGENCY_LABEL[task.risk.urgency]],
            [tRef.current('section'), task.sectionLabel],
            [tRef.current('km'), kmRange(task.startKm, task.endKm)],
            [tRef.current('line'), lineLabel(task.line)],
            [tRef.current('departments'), DEPT_LABEL[task.dept].short],
          ],
          { swatch: color, open: onSelectRef.current ? { label: tRef.current('open'), onOpen: () => select('task', task.id) } : undefined }
        )
      );
      m.addTo(g.tasks);
    }
  }, [tasks, corridor, tok, lay.tasks]);

  /* train markers (WTT-derived) */
  useEffect(() => {
    const g = groupsRef.current;
    if (!g) return;
    g.trains.clearLayers();
    if (!lay.trains) return;
    for (const p of trains) {
      const color = trainColor(tok, p);
      const cls = `cmap-train${p.premium || p.cls === 'VB' ? ' premium' : ''}${p.isHalted ? ' halted' : ''}${p.inBlock ? ' in-block' : ''}`;
      const icon = L.divIcon({ className: 'cmap-train-wrap', iconSize: [0, 0], html: `<span class="${cls}" style="color:${color}">${p.trainNo}</span>` });
      const m = L.marker([p.lat, p.lng], { icon, keyboard: false, zIndexOffset: p.premium ? 100 : 0 });
      const rows: [string, string][] = [
        [tRef.current('trainClass'), classLabel(p.cls)],
        [tRef.current('line'), lineLabel(p.line)],
        [tRef.current('km'), p.km.toFixed(1)],
        p.isHalted ? [tRef.current('haltedAt'), p.haltStation ?? p.currentStation] : [tRef.current('next'), p.nextStation],
        [tRef.current('speed'), `${Math.round(p.speedKmph)} ${tRef.current('kmph')}`],
      ];
      m.bindPopup(() => popupEl(`${p.trainNo} ${p.name}`, rows, { swatch: color, text: p.inBlock ? tRef.current('insideBlock') : `${p.origin} → ${p.destination} · ${p.dep}–${p.arr}`, open: onSelectRef.current ? { label: tRef.current('open'), onOpen: () => select('train', p.trainNo) } : undefined }));
      m.addTo(g.trains);
    }
  }, [trains, tok, lay.trains]);

  /* hazard reports */
  useEffect(() => {
    const g = groupsRef.current;
    if (!g) return;
    g.incidents.clearLayers();
    if (!lay.incidents) return;
    for (const r of incidents) {
      const ll: L.LatLngTuple | null = r.lat != null && r.lng != null ? [r.lat, r.lng] : r.km != null ? at(corridor, r.km) : null;
      if (!ll) continue;
      const closed = r.status === 'RESOLVED' || r.status === 'REJECTED';
      const icon = L.divIcon({ className: 'cmap-icon', iconSize: [0, 0], html: `<span class="cmap-incident">${TRIANGLE(closed ? tok.ink4 : tok.crit, tok.bg1)}</span>` });
      const m = L.marker(ll, { icon, keyboard: false, zIndexOffset: 200 });
      m.bindTooltip(`${tRef.current('incident')} ${r.id} · ${r.category}`, { direction: 'top', offset: [0, -18], className: 'cmap-tip' });
      m.bindPopup(() =>
        popupEl(
          `${tRef.current('incident')} ${r.id}`,
          [
            [tRef.current('category'), r.category],
            [tRef.current('km'), r.km != null ? `${r.km.toFixed(1)}${r.line ? ` · ${r.line}` : ''}` : '—'],
            [tRef.current('status'), r.status],
            [tRef.current('reported'), `${r.reporter.name} · ${new Date(r.at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}`],
          ],
          { swatch: closed ? tok.ink4 : tok.crit, text: r.description.length > 140 ? `${r.description.slice(0, 140)}…` : r.description, open: onSelectRef.current ? { label: tRef.current('open'), onOpen: () => select('report', r.id) } : undefined }
        )
      );
      m.addTo(g.incidents);
    }
  }, [incidents, corridor, tok, lay.incidents]);

  /* machine / gang home depots */
  useEffect(() => {
    const g = groupsRef.current;
    if (!g) return;
    g.depots.clearLayers();
    if (!lay.depots) return;
    // several machines / gangs share a home depot: fan them out sideways so each stays clickable
    const seen = new Map<string, number>();
    const add = (kind: 'machine' | 'crew', id: string, label: string, dept: Dept, km: number, station: string, extra: () => [string, string][]) => {
      const color = deptColor(tok, dept);
      const key = `${station}|${km}`;
      const i = seen.get(key) ?? 0;
      seen.set(key, i + 1);
      const dx = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 13;
      const icon = L.divIcon({ className: 'cmap-icon', iconSize: [0, 0], html: `<span class="cmap-depot ${kind}" style="background:${color};margin-left:${dx}px"></span>` });
      const m = L.marker(at(corridor, km), { icon, keyboard: false });
      m.bindTooltip(`${label} · ${station}`, { direction: 'top', offset: [dx, -4], className: 'cmap-tip' });
      m.bindPopup(() => popupEl(label, [[kind === 'machine' ? tRef.current('machine') : tRef.current('crew'), id], [tRef.current('depot'), `${station} · ${tRef.current('km')} ${km}`], [tRef.current('departments'), DEPT_LABEL[dept].short], ...extra()], { swatch: color, open: onSelectRef.current ? { label: tRef.current('open'), onOpen: () => select(kind, id) } : undefined }));
      m.addTo(g.depots);
    };
    for (const m of machines) add('machine', m.id, m.label, m.dept, m.homeKm, m.homeStation, () => [[tRef.current('health'), `${Math.round(m.healthIndex * 100)} %`]]);
    for (const c of crews) add('crew', c.id, c.label, c.dept, c.baseKm, c.baseStation, () => [[tRef.current('reach'), `${c.reachKm} ${tRef.current('km')}`]]);
  }, [machines, crews, corridor, tok, lay.depots]);

  /* single chainage pin (MiniMap) */
  useEffect(() => {
    const g = groupsRef.current;
    if (!g) return;
    g.pin.clearLayers();
    if (!pin) return;
    const icon = L.divIcon({ className: 'cmap-icon', iconSize: [0, 0], html: `<span class="cmap-pin">${PIN(tok.accent, tok.ink)}</span>` });
    const m = L.marker(at(corridor, pin.km), { icon, keyboard: false, interactive: false, zIndexOffset: 300 });
    m.bindTooltip(pin.label ?? `${tRef.current('pinAt')} km ${pin.km.toFixed(1)}${pin.line ? ` · ${pin.line}` : ''}`, { permanent: true, direction: 'right', offset: [8, -12], className: 'cmap-tip' });
    m.addTo(g.pin);
  }, [pin, corridor, tok]);

  /* highlight ring for the selected item */
  useEffect(() => {
    const g = groupsRef.current;
    const map = mapRef.current;
    if (!g || !map) return;
    g.highlight.clearLayers();
    if (!sel) return;
    const want = (k: MapSelectKind) => sel.kind === null || sel.kind === k;
    let target: L.LatLngTuple | L.LatLngTuple[] | null = null;
    if (want('task')) {
      const x = tasks.find((v) => v.id === sel.id);
      if (x) target = at(corridor, x.startKm);
    }
    if (!target && want('block')) {
      const x = blocks.find((v) => v.id === sel.id);
      if (x) target = pathKm(corridor, x.startKm, x.endKm);
    }
    if (!target && want('train')) {
      const x = trains.find((v) => v.trainNo === sel.id || v.trainId === sel.id);
      if (x) target = [x.lat, x.lng];
    }
    if (!target && want('report')) {
      const x = incidents.find((v) => v.id === sel.id);
      if (x) target = x.lat != null && x.lng != null ? [x.lat, x.lng] : x.km != null ? at(corridor, x.km) : null;
    }
    if (!target && want('station')) {
      const x = corridor.stations.find((v) => v.code === sel.id);
      if (x) target = [x.lat, x.lng];
    }
    if (!target && want('machine')) {
      const x = machines.find((v) => v.id === sel.id);
      if (x) target = at(corridor, x.homeKm);
    }
    if (!target && want('crew')) {
      const x = crews.find((v) => v.id === sel.id);
      if (x) target = at(corridor, x.baseKm);
    }
    if (!target && want('signal')) {
      const x = corridor.signals?.find((v) => v.id === sel.id);
      if (x) target = at(corridor, x.km);
    }
    if (!target) return;
    if (Array.isArray(target[0])) {
      const pl = L.polyline(target as L.LatLngTuple[], { pane: 'cmap-highlight', color: tok.accent, weight: 14, opacity: 0.35, lineCap: 'round', interactive: false, className: 'cmap-pulse' }).addTo(g.highlight);
      if (!map.getBounds().contains(pl.getBounds())) map.fitBounds(pl.getBounds(), { padding: [40, 40] });
    } else {
      const ll = target as L.LatLngTuple;
      L.circleMarker(ll, { pane: 'cmap-highlight', radius: 15, color: tok.accent, weight: 2.5, fillColor: tok.accent, fillOpacity: 0.15, interactive: false, className: 'cmap-pulse' }).addTo(g.highlight);
      if (!map.getBounds().contains(ll)) map.panTo(ll);
    }
  }, [sel, tasks, blocks, trains, incidents, machines, crews, corridor, tok]);

  const anyBlocks = lay.blocks && blocks.length > 0;
  const anyProposed = anyBlocks && blocks.some((b) => statusOf(b) === 'PROPOSED');
  const sigShown = useMemo(() => {
    if (!lay.signals || mini) return null;
    const want = sigKey === '*' ? null : new Set(sigKey.split('|'));
    const kinds = new Set((corridor.signals ?? []).filter((s) => !want || want.has(s.kind)).map((s) => s.kind));
    return {
      signal: kinds.has('DISTANT') || kinds.has('HOME') || kinds.has('STARTER') || kinds.has('ADV_STARTER'),
      point: kinds.has('POINT'),
      tc: kinds.has('TRACK_CIRCUIT'),
      lc: kinds.has('LC_GATE'),
      any: kinds.size > 0,
    };
  }, [corridor, lay.signals, sigKey, mini]);

  return (
    <div className={`cmap${mini ? ' mini' : ''}${tilesFailed ? ' schematic' : ''} ${className}`} style={{ height }} data-tour={tour ?? (mini ? undefined : 'corridor-map')}>
      <div ref={containerRef} className="cmap-canvas" role="region" aria-label={corridor.name} />
      {tilesFailed && (
        <span className="cmap-chip" role="status">
          {t('tilesDown')}
        </span>
      )}
      {!mini && (
        <div className="cmap-legend" aria-hidden="true">
          {(['TMS', 'SMMS', 'TDMS'] as Dept[]).map((d) => (
            <span key={d} className="lg">
              <span className="sw" style={{ background: `var(--${d.toLowerCase()})` }} /> {DEPT_LABEL[d].short}
            </span>
          ))}
          {anyProposed && (
            <span className="lg" style={{ color: 'var(--ink-3)' }}>
              <span className="sw dash" /> {t('legendProposed')}
            </span>
          )}
          {lay.tasks && tasks.length > 0 && (
            <span className="lg">
              <span className="sw dot" style={{ background: 'var(--ink-3)' }} /> {t('legendWork')}
            </span>
          )}
          {lay.trains && trains.length > 0 && (
            <span className="lg">
              <span className="mono" style={{ fontSize: 9, border: '1px solid var(--ink)', borderRadius: 999, padding: '0 4px' }}>12951</span> {t('legendTrain')}
            </span>
          )}
          {lay.incidents && incidents.length > 0 && (
            <span className="lg">
              <span style={{ display: 'inline-block', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '9px solid var(--crit)' }} /> {t('legendIncident')}
            </span>
          )}
          {lay.depots && (machines.length > 0 || crews.length > 0) && (
            <span className="lg">
              <span className="sw sq" style={{ background: 'var(--ink-3)' }} /> {t('legendDepot')}
            </span>
          )}
          {lay.ohe && corridor.oheSections.length > 0 && (
            <span className="lg">
              <span className="sw" style={{ background: 'var(--tdms)' }} /> {t('legendOhe')}
            </span>
          )}
          {lay.ohe && corridor.tss.length > 0 && (
            <span className="lg">
              <span className="sw sq diamond" style={{ background: 'var(--tdms)' }} /> {t('legendTss')}
            </span>
          )}
          {sigShown?.signal && (
            <span className="lg">
              <span className="cmap-sa k-sig in-legend" /> {t('legendSignal')}
            </span>
          )}
          {sigShown?.point && (
            <span className="lg">
              <span className="cmap-sa k-point in-legend" /> {t('legendPoint')}
            </span>
          )}
          {sigShown?.tc && (
            <span className="lg">
              <span className="cmap-sa k-tc in-legend" /> {t('legendTc')}
            </span>
          )}
          {sigShown?.lc && (
            <span className="lg">
              <span className="cmap-sa k-lc in-legend" /> {t('legendLc')}
            </span>
          )}
          {lay.trains && trains.length > 0 && <span className="note">{t('wttNote')}</span>}
          {sigShown?.any && <span className="note">{sigDetail ? t('sigNote') : `${t('sigZoomNote')} ${t('sigNote')}`}</span>}
        </div>
      )}
    </div>
  );
}

/** Small corridor map with one chainage pin — for drawers (task, report, requisition). */
export function MiniMap({ corridor, km, line, label, height = 180, className, tour }: { corridor: Corridor; km: number; line?: Line; label?: string; height?: number; className?: string; tour?: string }) {
  const pin = useMemo<MapPin>(() => ({ km, line, label }), [km, line, label]);
  return <CorridorMap corridor={corridor} mini height={height} pin={pin} layers={{ stations: true, blocks: false, tasks: false, trains: false, incidents: false, depots: false, ohe: false }} className={className} tour={tour} />;
}

export default CorridorMap;
