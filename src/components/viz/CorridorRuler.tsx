/**
 * CorridorRuler — horizontal chainage ruler (digital corridor twin) of one
 * corridor. Lanes, top to bottom:
 *   1. km axis + stations (junctions marked)
 *   2. block sections
 *   3. signalling assets from corridor.signals (UP row, DN row, LC gates across)
 *   4. OHE: elementary sections, switching posts, TSS
 *   5–7. TMS / SMMS / TDMS records at their resolved km (department colour)
 *   8. this week's planned blocks (day filter, fill by workflow state)
 * Zoom / pan keeps a visible window [fromKm, toKm]; only items inside it are
 * drawn. Hover shows a tooltip; click pins a details panel with the native
 * reference (gear id, OHE mast, km/TP) and the resolved km in all three
 * reference systems. Every colour is a CSS variable, so light / dark /
 * sunlight themes follow without re-reading tokens.
 */
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Crosshair, Maximize2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { formatChainage, kmToMast, MAST_SPAN_KM, TP_PER_KM } from '../../engine/corridors.js';
import type { Block, Corridor, Line, Signal, Task } from '../../engine/types';
import { useT } from '../../i18n';
import { num } from '../../lib/format';
import { SimLabel } from '../ui/extras';
import './CorridorRuler.css';

/* ── Public API ─────────────────────────────────────────────── */

export interface CorridorRulerProps {
  corridor: Corridor;
  /** snapshot.tasks — drawn in the TMS / SMMS / TDMS lanes at startKm–endKm */
  tasks: Task[];
  /** this week's planned blocks; WorkingBlock (with `state`) preferred, else `status` is read */
  blocks: Block[];
  onOpenTask?: (taskId: string) => void;
  onOpenBlock?: (blockId: string) => void;
  /** plan day (0-based) or 'all' for the block lane filter; default 'all' */
  initialDay?: number | 'all';
  /** data-tour anchor; default 'corridor-ruler' */
  tour?: string;
}

/* ── Strings ────────────────────────────────────────────────── */

const strings = {
  en: {
    laneAxis: 'Stations · km',
    laneSections: 'Block sections',
    laneSignals: 'Signalling',
    laneOhe: 'OHE',
    laneTms: 'TMS records',
    laneSmms: 'SMMS records',
    laneTdms: 'TDMS records',
    laneBlocks: 'Planned blocks',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    whole: 'Whole corridor',
    pan: 'Pan along the corridor',
    windowLabel: 'Visible window',
    day: 'Day',
    allDays: 'All days',
    dayN: 'Day {n}',
    ariaRuler: 'Chainage ruler of {corridor}, km {a} to {b}',
    keysHint: 'Ctrl + wheel zooms, drag pans, arrow keys move the window, Esc closes details.',
    clickHint: 'Click to pin details',
    noBlocksWeek: 'No planned blocks this week',
    noBlocksDay: 'No planned blocks on this day',
    noSignals: 'No signalling table for this corridor',
    kStation: 'Station',
    kJunction: 'Junction station',
    kSection: 'Block section',
    kEs: 'OHE elementary section',
    kSp: 'OHE switching post',
    kTss: 'Traction sub-station (TSS)',
    kTask: '{sys} record',
    kBlock: 'Planned block',
    sigDistant: 'Distant signal',
    sigHome: 'Home signal',
    sigStarter: 'Starter signal',
    sigAdv: 'Advanced starter',
    sigPoint: 'Points',
    sigTc: 'Track circuit',
    sigLc: 'LC gate',
    sigOther: 'Signalling asset',
    stGranted: 'Granted',
    stLocked: 'Locked',
    stConcurred: 'Concurred',
    stProposed: 'Proposed',
    stSuperseded: 'Changed by re-plan',
    stDraft: 'Draft',
    stRefused: 'Refused',
    lineUp: 'UP line',
    lineDn: 'DN line',
    lineBoth: 'Both lines',
    fCode: 'Code',
    fSections: 'Block sections',
    fFromTo: 'Between',
    fLength: 'Length',
    fRecords: 'Records in section',
    fStation: 'Station',
    fLine: 'Line',
    fSps: 'Switching posts',
    fTss: 'TSS in section',
    fEs: 'Elementary sections',
    fRecord: 'Native record',
    fDept: 'Department',
    fWork: 'Work type',
    fSection: 'Block section',
    fArci: 'ARCI',
    fInjected: 'Injected from',
    fDate: 'Date',
    fWindow: 'Window',
    fKind: 'Block kind',
    fState: 'Workflow state',
    fWorks: 'Works',
    fNative: 'Native reference',
    fKm: 'Resolved km',
    fKmTp: 'km/TP',
    fMast: 'OHE mast',
    injReq: 'Requisition',
    injReport: 'Field report',
    injJoint: 'Joint-block work',
    injOther: 'Injected work',
    gear: 'Gear',
    yard: 'yard',
    turnout: 'turnout',
    mast: 'Mast',
    location: 'Location',
    details: 'Details',
    openWork: 'Open work',
    openBlock: 'Open block',
    zoomHere: 'Zoom here',
    close: 'Close details',
    lgStations: 'Stations',
    lgJunction: 'Junction',
    lgStation: 'Station',
    lgSignals: 'Signalling',
    lgOhe: 'OHE',
    lgEs: 'Elementary section',
    lgSp: 'Switching post',
    lgTss: 'TSS',
    lgRecords: 'Records',
    lgInjected: 'Requisition / report work (outlined)',
    lgBlocks: 'Blocks by state',
    signalNote: 'Signal and LC positions are typical placements from the station list, not a surveyed signal interlocking plan.',
    convNote: 'km/TP assumes {tp} telegraph posts per km; OHE mast numbers assume a {span} m span.',
  },
  hi: {
    laneAxis: 'स्टेशन · km',
    laneSections: 'ब्लॉक सेक्शन',
    laneSignals: 'सिग्नलिंग',
    laneOhe: 'OHE',
    laneTms: 'TMS रिकॉर्ड',
    laneSmms: 'SMMS रिकॉर्ड',
    laneTdms: 'TDMS रिकॉर्ड',
    laneBlocks: 'नियोजित ब्लॉक',
    zoomIn: 'ज़ूम इन',
    zoomOut: 'ज़ूम आउट',
    whole: 'पूरा कॉरिडोर',
    pan: 'कॉरिडोर के साथ खिसकाएँ',
    windowLabel: 'दृश्य खंड',
    day: 'दिन',
    allDays: 'सभी दिन',
    dayN: 'दिन {n}',
    ariaRuler: '{corridor} का चेनेज पैमाना, km {a} से {b}',
    keysHint: 'Ctrl + व्हील से ज़ूम, खींचकर खिसकाएँ, तीर कुंजियों से खंड बदलें, Esc से विवरण बंद।',
    clickHint: 'विवरण के लिए क्लिक करें',
    noBlocksWeek: 'इस सप्ताह कोई नियोजित ब्लॉक नहीं',
    noBlocksDay: 'इस दिन कोई नियोजित ब्लॉक नहीं',
    noSignals: 'इस कॉरिडोर की सिग्नलिंग तालिका उपलब्ध नहीं',
    kStation: 'स्टेशन',
    kJunction: 'जंक्शन स्टेशन',
    kSection: 'ब्लॉक सेक्शन',
    kEs: 'OHE एलिमेंटरी सेक्शन',
    kSp: 'OHE स्विचिंग पोस्ट',
    kTss: 'ट्रैक्शन सब-स्टेशन (TSS)',
    kTask: '{sys} रिकॉर्ड',
    kBlock: 'नियोजित ब्लॉक',
    sigDistant: 'Distant सिग्नल',
    sigHome: 'Home सिग्नल',
    sigStarter: 'Starter सिग्नल',
    sigAdv: 'Advanced starter सिग्नल',
    sigPoint: 'पॉइंट्स',
    sigTc: 'ट्रैक सर्किट',
    sigLc: 'LC गेट',
    sigOther: 'सिग्नलिंग परिसंपत्ति',
    stGranted: 'स्वीकृत',
    stLocked: 'लॉक',
    stConcurred: 'सहमति प्राप्त',
    stProposed: 'प्रस्तावित',
    stSuperseded: 'री-प्लान से बदला',
    stDraft: 'ड्राफ्ट',
    stRefused: 'अस्वीकृत',
    lineUp: 'UP लाइन',
    lineDn: 'DN लाइन',
    lineBoth: 'दोनों लाइनें',
    fCode: 'कोड',
    fSections: 'ब्लॉक सेक्शन',
    fFromTo: 'के बीच',
    fLength: 'लंबाई',
    fRecords: 'सेक्शन में रिकॉर्ड',
    fStation: 'स्टेशन',
    fLine: 'लाइन',
    fSps: 'स्विचिंग पोस्ट',
    fTss: 'सेक्शन में TSS',
    fEs: 'एलिमेंटरी सेक्शन',
    fRecord: 'मूल रिकॉर्ड',
    fDept: 'विभाग',
    fWork: 'कार्य प्रकार',
    fSection: 'ब्लॉक सेक्शन',
    fArci: 'ARCI',
    fInjected: 'स्रोत',
    fDate: 'तारीख',
    fWindow: 'समय-खिड़की',
    fKind: 'ब्लॉक प्रकार',
    fState: 'कार्यप्रवाह स्थिति',
    fWorks: 'कार्य',
    fNative: 'मूल संदर्भ',
    fKm: 'निर्धारित km',
    fKmTp: 'km/TP',
    fMast: 'OHE mast',
    injReq: 'Requisition',
    injReport: 'फ़ील्ड रिपोर्ट',
    injJoint: 'संयुक्त ब्लॉक कार्य',
    injOther: 'जोड़ा गया कार्य',
    gear: 'गियर',
    yard: 'यार्ड',
    turnout: 'टर्नआउट',
    mast: 'Mast',
    location: 'स्थान',
    details: 'विवरण',
    openWork: 'कार्य खोलें',
    openBlock: 'ब्लॉक खोलें',
    zoomHere: 'यहाँ ज़ूम करें',
    close: 'विवरण बंद करें',
    lgStations: 'स्टेशन',
    lgJunction: 'जंक्शन',
    lgStation: 'स्टेशन',
    lgSignals: 'सिग्नलिंग',
    lgOhe: 'OHE',
    lgEs: 'एलिमेंटरी सेक्शन',
    lgSp: 'स्विचिंग पोस्ट',
    lgTss: 'TSS',
    lgRecords: 'रिकॉर्ड',
    lgInjected: 'Requisition / रिपोर्ट कार्य (रेखांकित)',
    lgBlocks: 'स्थिति अनुसार ब्लॉक',
    signalNote: 'सिग्नल और LC स्थितियाँ स्टेशन सूची से सामान्य स्थान हैं, सर्वेक्षित सिग्नल इंटरलॉकिंग प्लान नहीं।',
    convNote: 'km/TP में प्रति km {tp} टेलीग्राफ पोस्ट और OHE mast संख्या में {span} m स्पैन माना गया है।',
  },
} as const;

type TKey = keyof typeof strings.en;
type Tf = (key: TKey, vars?: Record<string, string | number>) => string;

/* ── Geometry constants ─────────────────────────────────────── */

/** SVG never narrower than this; on phones it scrolls inside its container. */
const MIN_SVG_W = 720;
const PAD_X = 14;
/** smallest visible window (km) */
const MIN_SPAN_KM = 2;
/** a point record still gets this many px */
const MIN_MARK_PX = 4;
const CHAR_W = 6.2;
const TRACKS = 3;
const TRACK_H = 6;
const TRACK_GAP = 1;
const SUBROW_H = TRACKS * TRACK_H + (TRACKS - 1) * TRACK_GAP; // 20
const H_AXIS = 50;
const H_SECTIONS = 30;
const H_SIGNALS = 52;
const H_OHE = 42;
const H_RECORDS = 4 + SUBROW_H + 4 + SUBROW_H + 4; // 52
const BLOCK_ROW_ALL = 14;
const BLOCK_ROW_DAY = 30;
const TICK_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];

const RECORD_LANES = ['TMS', 'SMMS', 'TDMS'] as const;
type RecordLane = (typeof RECORD_LANES)[number];
type LaneKey = 'axis' | 'sections' | 'signals' | 'ohe' | RecordLane | 'blocks';

const LANE_LABEL: Record<LaneKey, TKey> = { axis: 'laneAxis', sections: 'laneSections', signals: 'laneSignals', ohe: 'laneOhe', TMS: 'laneTms', SMMS: 'laneSmms', TDMS: 'laneTdms', blocks: 'laneBlocks' };

const SIGNAL_KINDS = ['DISTANT', 'HOME', 'STARTER', 'ADV_STARTER', 'POINT', 'TRACK_CIRCUIT', 'LC_GATE'] as const;
const SIGNAL_KEY: Record<string, TKey> = { DISTANT: 'sigDistant', HOME: 'sigHome', STARTER: 'sigStarter', ADV_STARTER: 'sigAdv', POINT: 'sigPoint', TRACK_CIRCUIT: 'sigTc', LC_GATE: 'sigLc' };

const BLOCK_STATES = ['LOCKED', 'GRANTED', 'CONCURRED', 'PROPOSED', 'DRAFT', 'SUPERSEDED', 'REFUSED'] as const;
type BState = (typeof BLOCK_STATES)[number];
const STATE_KEY: Record<BState, TKey> = { GRANTED: 'stGranted', LOCKED: 'stLocked', CONCURRED: 'stConcurred', PROPOSED: 'stProposed', SUPERSEDED: 'stSuperseded', DRAFT: 'stDraft', REFUSED: 'stRefused' };
const STATE_BADGE: Record<BState, string> = { GRANTED: 'badge-ok', LOCKED: 'badge-ok', CONCURRED: 'badge-warn', PROPOSED: 'badge-info', SUPERSEDED: 'badge-gray', DRAFT: 'badge-gray', REFUSED: 'badge-crit' };
/** draw order: weakest first so granted / locked sit on top */
const STATE_Z: Record<BState, number> = { REFUSED: 0, SUPERSEDED: 1, DRAFT: 2, PROPOSED: 3, CONCURRED: 4, GRANTED: 5, LOCKED: 6 };

/* ── Pure helpers ───────────────────────────────────────────── */

function clampWindow(from: number, to: number, lengthKm: number, minSpan: number): [number, number] {
  const L = Math.max(0, lengthKm);
  const span = Math.min(L, Math.max(Math.min(minSpan, L), to - from));
  let f = Number.isFinite(from) ? from : 0;
  if (f < 0) f = 0;
  if (f + span > L) f = L - span;
  return [f, f + span];
}

/** Labelled tick step (km) so labels are at least `minPx` apart, and a minor step (or null). */
function tickSteps(pxPerKm: number, minPx = 64): { step: number; minor: number | null } {
  const step = TICK_STEPS.find((s) => s * pxPerKm >= minPx) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const mant = Math.round(step / 10 ** Math.floor(Math.log10(step) + 1e-9));
  const cands = mant === 2 ? [step / 4, step / 2] : [step / 5, step / 2];
  const minor = cands.find((m) => m * pxPerKm >= 9) ?? null;
  return { step, minor };
}

/** Greedy interval packing into `tracks` rows; overflow goes to the row that frees first. Items must be sorted by x0. */
function packTracks(items: { x0: number; x1: number }[], tracks: number): number[] {
  const ends: number[] = new Array(tracks).fill(-Infinity);
  return items.map((it) => {
    let t = ends.findIndex((e) => e + 1 <= it.x0);
    if (t < 0) {
      t = 0;
      for (let i = 1; i < tracks; i++) if (ends[i] < ends[t]) t = i;
    }
    ends[t] = Math.max(ends[t], it.x1);
    return t;
  });
}

/** Which labels fit without overlapping; higher priority placed first. */
function thinLabels(items: { a: number; b: number; pri: number }[]): boolean[] {
  const order = items.map((_, i) => i).sort((i, j) => items[j].pri - items[i].pri || items[i].a - items[j].a);
  const placed: [number, number][] = [];
  const show = items.map(() => false);
  for (const i of order) {
    const { a, b } = items[i];
    if (placed.some(([p, q]) => a < q + 4 && b > p - 4)) continue;
    placed.push([a, b]);
    show[i] = true;
  }
  return show;
}

const laneOf = (t: Task): RecordLane => (t.source === 'TMS' || t.source === 'SMMS' || t.source === 'TDMS' ? t.source : t.dept);

function stateOf(b: Block): BState {
  const raw = String((b as Block & { state?: string }).state ?? b.status ?? 'DRAFT').toUpperCase();
  return (BLOCK_STATES as readonly string[]).includes(raw) ? (raw as BState) : 'DRAFT';
}

const textW = (s: string) => s.length * CHAR_W;

function metricText(task: Task, key: string): string | null {
  const v = task.metrics?.[key];
  if (v === undefined || v === null || v === '') return null;
  return String(v).trim() || null;
}

/** Native location reference as the source system writes it. */
function nativeRef(task: Task, t: Tf): string {
  const lane = laneOf(task);
  const m = (k: string) => metricText(task, k);
  if (lane === 'SMMS') {
    const gear = m('gearId');
    if (gear) {
      const st = m('station');
      return `${t('gear')} ${gear}${st ? ` · ${st} ${t('yard')}` : ''}`;
    }
  } else if (lane === 'TDMS') {
    const tss = m('tssCode');
    if (tss) return tss;
    const mf = m('mastFrom');
    if (mf) {
      const mt = m('mastTo');
      const es = m('elementarySection');
      return `${t('mast')} ${mf}${mt && mt !== mf ? ` – ${mt}` : ''}${es ? ` · ${es}` : ''}`;
    }
  } else {
    const cf = m('chainageFrom') ?? m('chainage');
    const ct = m('chainageTo');
    const ch = cf ? `km ${cf}${ct && ct !== cf ? ` – ${ct}` : ''}` : null;
    const st = m('station');
    const to = m('turnoutNo');
    if (st && to) return `${st} ${t('yard')}, ${t('turnout')} ${to}${ch ? ` (${ch})` : ''}`;
    if (ch) return ch;
  }
  return task.nativeLocation;
}

function injectedFrom(task: Task, t: Tf): string {
  const p = String(task.sourceId ?? '').split('/')[0].toUpperCase();
  const kind = p === 'REQ' ? t('injReq') : p === 'REPORT' ? t('injReport') : p === 'JOINT' ? t('injJoint') : t('injOther');
  return `${kind} · ${task.sourceId}`;
}

const lineText = (line: Line, t: Tf) => (line === 'UP' ? t('lineUp') : line === 'DN' ? t('lineDn') : t('lineBoth'));
const kmDec = (x: number) => x.toFixed(3);
const rangeText = (a: number, b: number, f: (x: number) => string) => (Math.abs(b - a) < 0.0005 ? f(a) : `${f(a)} – ${f(b)}`);
const tpText = (x: number) => formatChainage(x) ?? '—';
const mastText = (x: number) => kmToMast(x) ?? '—';
const windowDigits = (span: number) => (span < 10 ? 2 : span < 100 ? 1 : 0);

/* ── Model (everything drawn, in SVG px) ────────────────────── */

type HitKind = 'station' | 'section' | 'signal' | 'es' | 'sp' | 'tss' | 'task' | 'block';
interface HitRef {
  kind: HitKind;
  id: string;
}
interface HitBox {
  ref: HitRef;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface LaneLayout {
  key: LaneKey;
  y: number;
  h: number;
  subs: { y: number; text: string }[];
}
interface Model {
  W: number;
  H: number;
  iw: number;
  from: number;
  to: number;
  lanes: LaneLayout[];
  ly: Record<LaneKey, number>;
  ticks: { x: number; major: boolean; label: string | null }[];
  grid: number[];
  stations: { code: string; x: number; junction: boolean; label: boolean }[];
  sections: { idx: number; label: string; x0: number; x1: number; alt: boolean; showLabel: boolean }[];
  signals: { sig: Signal; x: number; cy: number }[];
  lcs: { sig: Signal; x: number }[];
  es: { id: string; label: string; x0: number; x1: number; alt: boolean; showLabel: boolean }[];
  sps: { km: number; x: number }[];
  tss: { code: string; x: number; label: boolean }[];
  recs: { task: Task; x0: number; x1: number; y: number }[];
  bars: { b: Block; state: BState; x0: number; x1: number; y: number; h: number; label: boolean }[];
  blockRows: number[];
  rowH: number;
  blocksInFilter: number;
  hits: HitBox[];
}

interface ModelInput {
  corridor: Corridor;
  tasksByLane: Record<RecordLane, Task[]>;
  blocks: Block[];
  from: number;
  to: number;
  W: number;
  day: number | 'all';
  days: number[];
  dayShort: Map<number, string>;
}

function buildModel({ corridor, tasksByLane, blocks, from, to, W, day, days, dayShort }: ModelInput): Model {
  const span = Math.max(1e-6, to - from);
  const iw = W - 2 * PAD_X;
  const k = iw / span;
  const sx = (km: number) => PAD_X + (km - from) * k;
  const inView = (a: number, b: number, padPx = 8) => Math.max(a, b) >= from - padPx / k && Math.min(a, b) <= to + padPx / k;
  const clipX = (x: number) => Math.max(0, Math.min(W, x));
  const hits: HitBox[] = [];

  /* lanes */
  const lanes: LaneLayout[] = [];
  const ly = {} as Record<LaneKey, number>;
  let y = 0;
  const push = (key: LaneKey, h: number, subs: { y: number; text: string }[] = []) => {
    lanes.push({ key, y, h, subs: subs.map((s) => ({ y: y + s.y, text: s.text })) });
    ly[key] = y;
    y += h;
  };
  const upDn = (upY: number, dnY: number) => [
    { y: upY, text: 'UP' },
    { y: dnY, text: 'DN' },
  ];
  push('axis', H_AXIS);
  push('sections', H_SECTIONS);
  push('signals', H_SIGNALS, upDn(14, 38));
  push('ohe', H_OHE);
  for (const lane of RECORD_LANES) push(lane, H_RECORDS, upDn(4 + SUBROW_H / 2, 4 + SUBROW_H + 4 + SUBROW_H / 2));
  const blockRows = day === 'all' ? days : [day];
  const rowH = day === 'all' ? BLOCK_ROW_ALL : BLOCK_ROW_DAY;
  const half = (rowH - 3) / 2;
  const nRows = Math.max(1, blockRows.length);
  push(
    'blocks',
    6 + nRows * rowH + 4,
    day === 'all' ? blockRows.map((d, i) => ({ y: 6 + i * rowH + rowH / 2, text: dayShort.get(d) ?? `D${d + 1}` })) : upDn(6 + 1 + half / 2, 6 + 2 + half + half / 2),
  );
  const H = y;

  /* km ticks */
  const ticks: Model['ticks'] = [];
  const { step, minor } = tickSteps(k);
  const unit = minor ?? step;
  const i0 = Math.ceil(from / unit - 1e-9);
  const i1 = Math.floor(to / unit + 1e-9);
  const digits = step < 1 ? 1 : 0;
  if (i1 - i0 < 4000) {
    for (let i = i0; i <= i1; i++) {
      const km = i * unit;
      const r = km / step;
      const major = Math.abs(r - Math.round(r)) < 1e-6;
      ticks.push({ x: sx(km), major, label: major ? (Math.round(km / step) * step).toFixed(digits) : null });
    }
  }

  /* stations */
  const visStations = corridor.stations.filter((s) => inView(s.km, s.km, 40));
  const grid = visStations.map((s) => sx(s.km));
  const stShow = thinLabels(visStations.map((s) => {
    const x = sx(s.km);
    const w = textW(s.code) + 2;
    return { a: x - w / 2, b: x + w / 2, pri: s.junction ? 2 : 1 };
  }));
  const stations = visStations.map((s, i) => ({ code: s.code, x: sx(s.km), junction: s.junction, label: stShow[i] }));
  for (const s of stations) hits.push({ ref: { kind: 'station', id: s.code }, x0: s.x - 6, y0: 21, x1: s.x + 6, y1: H_AXIS - 2 });

  /* block sections */
  const secY = ly.sections;
  const sections: Model['sections'] = [];
  for (const sec of corridor.blockSections) {
    if (!inView(sec.startKm, sec.endKm, 0)) continue;
    const x0 = clipX(sx(sec.startKm));
    const x1 = clipX(sx(sec.endKm));
    sections.push({ idx: sec.index, label: sec.label, x0, x1, alt: sec.index % 2 === 1, showLabel: x1 - x0 >= textW(sec.label) + 10 });
    hits.push({ ref: { kind: 'section', id: String(sec.index) }, x0, y0: secY + 4, x1, y1: secY + H_SECTIONS - 4 });
  }

  /* signalling */
  const sigY = ly.signals;
  const signals: Model['signals'] = [];
  const lcs: Model['lcs'] = [];
  for (const sig of corridor.signals ?? []) {
    if (!inView(sig.km, sig.km, 6)) continue;
    const x = sx(sig.km);
    if (sig.kind === 'LC_GATE') {
      lcs.push({ sig, x });
      hits.push({ ref: { kind: 'signal', id: sig.id }, x0: x - 4, y0: sigY + 4, x1: x + 4, y1: sigY + H_SIGNALS - 4 });
      continue;
    }
    const cy = sigY + (sig.line === 'UP' ? 14 : sig.line === 'DN' ? 38 : 26);
    signals.push({ sig, x, cy });
    hits.push({ ref: { kind: 'signal', id: sig.id }, x0: x - 4, y0: cy - 6, x1: x + 4, y1: cy + 6 });
  }

  /* OHE */
  const oheY = ly.ohe;
  const es: Model['es'] = [];
  for (const s of corridor.oheSections) {
    if (!inView(s.startKm, s.endKm, 0)) continue;
    const x0 = clipX(sx(s.startKm));
    const x1 = clipX(sx(s.endKm));
    es.push({ id: s.id, label: s.label, x0, x1, alt: s.index % 2 === 1, showLabel: x1 - x0 >= textW(s.label) + 10 });
    hits.push({ ref: { kind: 'es', id: s.id }, x0, y0: oheY + 3, x1, y1: oheY + 20 });
  }
  const sps = corridor.switchingPosts.filter((km) => inView(km, km, 4)).map((km) => ({ km, x: sx(km) }));
  for (const p of sps) hits.push({ ref: { kind: 'sp', id: String(p.km) }, x0: p.x - 3, y0: oheY + 1, x1: p.x + 3, y1: oheY + 24 });
  const visTss = corridor.tss.filter((s) => inView(s.km, s.km, 60));
  const tssShow = thinLabels(visTss.map((s) => {
    const x = sx(s.km);
    return { a: x + 6, b: x + 8 + textW(s.code), pri: 1 };
  }));
  const tss = visTss.map((s, i) => ({ code: s.code, x: sx(s.km), label: tssShow[i] }));
  for (const s of tss) hits.push({ ref: { kind: 'tss', id: s.code }, x0: s.x - 6, y0: oheY + 25, x1: s.x + 6, y1: oheY + H_OHE - 2 });

  /* records: UP sub-row (UP + BOTH), DN sub-row (DN + BOTH), packed into tracks */
  const recs: Model['recs'] = [];
  for (const lane of RECORD_LANES) {
    const top = ly[lane];
    const items = tasksByLane[lane]
      .filter((t) => inView(t.startKm, t.endKm, MIN_MARK_PX))
      .map((task) => {
        let x0 = sx(Math.min(task.startKm, task.endKm));
        let x1 = sx(Math.max(task.startKm, task.endKm));
        if (x1 - x0 < MIN_MARK_PX) {
          const c = (x0 + x1) / 2;
          x0 = c - MIN_MARK_PX / 2;
          x1 = c + MIN_MARK_PX / 2;
        }
        return { task, x0: Math.max(-2, x0), x1: Math.min(W + 2, x1) };
      })
      .sort((a, b) => a.x0 - b.x0 || a.x1 - b.x1);
    for (const [sub, y0] of [['UP', top + 4], ['DN', top + 4 + SUBROW_H + 4]] as const) {
      const rows = items.filter((it) => it.task.line === sub || it.task.line === 'BOTH');
      const tracks = packTracks(rows, TRACKS);
      rows.forEach((it, i) => {
        const ry = y0 + tracks[i] * (TRACK_H + TRACK_GAP);
        recs.push({ task: it.task, x0: it.x0, x1: it.x1, y: ry });
        hits.push({ ref: { kind: 'task', id: it.task.id }, x0: it.x0, y0: ry, x1: it.x1, y1: ry + TRACK_H });
      });
    }
  }

  /* planned blocks */
  const bTop = ly.blocks + 6;
  const inFilter = day === 'all' ? blocks : blocks.filter((b) => b.day === day);
  const bars: Model['bars'] = [];
  for (const b of inFilter) {
    const row = blockRows.indexOf(b.day);
    if (row < 0 || !inView(b.startKm, b.endKm, MIN_MARK_PX)) continue;
    let x0 = sx(Math.min(b.startKm, b.endKm));
    let x1 = sx(Math.max(b.startKm, b.endKm));
    if (x1 - x0 < MIN_MARK_PX) {
      const c = (x0 + x1) / 2;
      x0 = c - MIN_MARK_PX / 2;
      x1 = c + MIN_MARK_PX / 2;
    }
    x0 = Math.max(-2, x0);
    x1 = Math.min(W + 2, x1);
    const ry = bTop + row * rowH;
    const by = b.line === 'DN' ? ry + 2 + half : ry + 1;
    const bh = b.line === 'BOTH' ? rowH - 2 : half;
    bars.push({ b, state: stateOf(b), x0, x1, y: by, h: bh, label: day !== 'all' && x1 - x0 >= textW(b.id) + 8 });
  }
  bars.sort((a, b) => STATE_Z[a.state] - STATE_Z[b.state]);
  for (const bar of bars) hits.push({ ref: { kind: 'block', id: bar.b.id }, x0: bar.x0, y0: bar.y, x1: bar.x1, y1: bar.y + bar.h });

  return { W, H, iw, from, to, lanes, ly, ticks, grid, stations, sections, signals, lcs, es, sps, tss, recs, bars, blockRows, rowH, blocksInFilter: inFilter.length, hits };
}

/** Best hit under a point: small marks win over wide bands, then the nearest centre. */
function hitTest(hits: HitBox[], x: number, y: number): HitBox | null {
  let best: HitBox | null = null;
  let bestScore = Infinity;
  for (const h of hits) {
    if (x < h.x0 - 2 || x > h.x1 + 2 || y < h.y0 - 1 || y > h.y1 + 1) continue;
    const w = h.x1 - h.x0;
    const score = Math.min(w, 400) * 4 + Math.abs(x - (h.x0 + h.x1) / 2);
    if (score < bestScore) {
      bestScore = score;
      best = h;
    }
  }
  return best;
}

const sameRef = (a: HitRef | null | undefined, b: HitRef | null | undefined) => !!a && !!b && a.kind === b.kind && a.id === b.id;

/* ── Marks ──────────────────────────────────────────────────── */

function SignalMark({ kind, x, cy, dir }: { kind: string; x: number; cy: number; dir: 1 | -1 }) {
  switch (kind) {
    case 'DISTANT':
      return <circle className="cr-sig cr-sig-distant" cx={x} cy={cy} r={3} />;
    case 'HOME':
      return <circle className="cr-sig cr-sig-home" cx={x} cy={cy} r={3} />;
    case 'STARTER':
      return <rect className="cr-sig cr-sig-starter" x={x - 3} y={cy - 3} width={6} height={6} />;
    case 'ADV_STARTER':
      return <path className="cr-sig cr-sig-adv" d={`M${x - 3.5 * dir} ${cy - 3.5}L${x + 3.5 * dir} ${cy}L${x - 3.5 * dir} ${cy + 3.5}Z`} />;
    case 'POINT':
      return <path className="cr-sig cr-sig-point" d={`M${x - 4} ${cy + 3}L${x + 4} ${cy + 3}M${x - 4} ${cy + 3}L${x + 4} ${cy - 3}`} />;
    case 'TRACK_CIRCUIT':
      return <rect className="cr-sig cr-sig-tc" x={x - 4} y={cy - 1.25} width={8} height={2.5} />;
    default:
      return <circle className="cr-sig cr-sig-other" cx={x} cy={cy} r={2} />;
  }
}

function LcMark({ x, y0, y1, cy }: { x: number; y0: number; y1: number; cy: number }) {
  return (
    <g className="cr-lc">
      <line x1={x} x2={x} y1={y0} y2={y1} />
      <path d={`M${x - 3} ${cy - 3}L${x + 3} ${cy + 3}M${x - 3} ${cy + 3}L${x + 3} ${cy - 3}`} />
    </g>
  );
}

const Swatch = ({ children, w = 16 }: { children: ReactNode; w?: number }) => (
  <svg className="cr-sw" width={w} height={12} viewBox={`0 0 ${w} 12`} aria-hidden="true">
    {children}
  </svg>
);

/** The drawn ruler; memoised so hover / tooltip state does not rebuild hundreds of marks. */
const RulerMarks = memo(function RulerMarks({ m, emptyText, noSignalsText, hasSignals }: { m: Model; emptyText: string; noSignalsText: string; hasSignals: boolean }) {
  const { W, H, ly } = m;
  const sigY = ly.signals;
  const oheY = ly.ohe;
  return (
    <>
      {/* station grid behind everything */}
      <g className="cr-grid">
        {m.grid.map((x, i) => (
          <line key={i} x1={x} x2={x} y1={ly.sections} y2={H} />
        ))}
      </g>
      {m.lanes.slice(1).map((l) => (
        <line key={l.key} className="cr-sep" x1={0} x2={W} y1={l.y + 0.5} y2={l.y + 0.5} />
      ))}

      {/* 1 · km axis + stations */}
      <line className="cr-axis" x1={PAD_X} x2={W - PAD_X} y1={20.5} y2={20.5} />
      {m.ticks.map((tk, i) =>
        tk.major ? (
          <g key={i}>
            <line className="cr-tick-major" x1={tk.x} x2={tk.x} y1={14} y2={20.5} />
            <text className="cr-tick-label" x={tk.x} y={11}>
              {tk.label}
            </text>
          </g>
        ) : (
          <line key={i} className="cr-tick" x1={tk.x} x2={tk.x} y1={17} y2={20.5} />
        ),
      )}
      {m.stations.map((s) => (
        <g key={s.code}>
          <line className="cr-stn-tick" x1={s.x} x2={s.x} y1={20.5} y2={27} />
          {s.junction ? <rect className="cr-stn-jn" x={s.x - 3.5} y={26.5} width={7} height={7} /> : <circle className="cr-stn" cx={s.x} cy={30} r={3.2} />}
          {s.label && (
            <text className={`cr-stn-code${s.junction ? ' jn' : ''}`} x={s.x} y={45}>
              {s.code}
            </text>
          )}
        </g>
      ))}

      {/* 2 · block sections */}
      {m.sections.map((s) => (
        <g key={s.idx}>
          <rect className={`cr-sec${s.alt ? ' alt' : ''}`} x={s.x0} y={ly.sections + 4} width={Math.max(0, s.x1 - s.x0)} height={H_SECTIONS - 8} />
          {s.showLabel && (
            <text className="cr-sec-label" x={(s.x0 + s.x1) / 2} y={ly.sections + 18.5}>
              {s.label}
            </text>
          )}
        </g>
      ))}

      {/* 3 · signalling */}
      <line className="cr-div" x1={0} x2={W} y1={sigY + 26.5} y2={sigY + 26.5} />
      {m.lcs.map(({ sig, x }) => (
        <LcMark key={sig.id} x={x} y0={sigY + 5} y1={sigY + H_SIGNALS - 5} cy={sigY + 26} />
      ))}
      {m.signals.map(({ sig, x, cy }) => (
        <SignalMark key={sig.id} kind={sig.kind} x={x} cy={cy} dir={sig.line === 'UP' ? -1 : 1} />
      ))}
      {!hasSignals && (
        <text className="cr-empty" x={W / 2} y={sigY + 30}>
          {noSignalsText}
        </text>
      )}

      {/* 4 · OHE */}
      {m.es.map((s) => (
        <g key={s.id}>
          <rect className={`cr-es${s.alt ? ' alt' : ''}`} x={s.x0} y={oheY + 3} width={Math.max(0, s.x1 - s.x0)} height={17} />
          {s.showLabel && (
            <text className="cr-es-label" x={(s.x0 + s.x1) / 2} y={oheY + 15}>
              {s.label}
            </text>
          )}
        </g>
      ))}
      {m.sps.map((p) => (
        <line key={p.km} className="cr-sp" x1={p.x} x2={p.x} y1={oheY + 1} y2={oheY + 24} />
      ))}
      {m.tss.map((s) => (
        <g key={s.code}>
          <path className="cr-tss" d={`M${s.x} ${oheY + 26}L${s.x + 5} ${oheY + 31}L${s.x} ${oheY + 36}L${s.x - 5} ${oheY + 31}Z`} />
          {s.label && (
            <text className="cr-tss-code" x={s.x + 7} y={oheY + 34.5}>
              {s.code}
            </text>
          )}
        </g>
      ))}

      {/* 5–7 · records */}
      {RECORD_LANES.map((lane) => (
        <line key={lane} className="cr-div" x1={0} x2={W} y1={ly[lane] + 4 + SUBROW_H + 2.5} y2={ly[lane] + 4 + SUBROW_H + 2.5} />
      ))}
      {m.recs.map((r, i) => (
        <rect key={`${r.task.id}-${i}`} className={`cr-rec cr-rec-${r.task.dept.toLowerCase()}${r.task.injected ? ' inj' : ''}`} x={r.x0} y={r.y} width={Math.max(1, r.x1 - r.x0)} height={TRACK_H} rx={1.5} />
      ))}

      {/* 8 · planned blocks */}
      {m.blockRows.length > 1 &&
        m.blockRows.slice(1).map((d, i) => <line key={d} className="cr-div" x1={0} x2={W} y1={ly.blocks + 6 + (i + 1) * m.rowH - 0.5} y2={ly.blocks + 6 + (i + 1) * m.rowH - 0.5} />)}
      {m.bars.map((bar) => (
        <g key={bar.b.id}>
          <rect className={`cr-blk cr-blk-${bar.state.toLowerCase()}`} x={bar.x0} y={bar.y} width={Math.max(1, bar.x1 - bar.x0)} height={bar.h} rx={2} />
          {bar.label && (
            <text className="cr-blk-id" x={(bar.x0 + bar.x1) / 2} y={bar.y + bar.h / 2 + 3.3}>
              {bar.b.id}
            </text>
          )}
        </g>
      ))}
      {m.blocksInFilter === 0 && (
        <text className="cr-empty" x={W / 2} y={ly.blocks + 6 + (m.rowH * Math.max(1, m.blockRows.length)) / 2 + 3.5}>
          {emptyText}
        </text>
      )}
    </>
  );
});

/* ── Descriptions (tooltip + details panel) ─────────────────── */

interface Desc {
  kind: string;
  title: string;
  rows: [string, string][];
  native: string | null;
  kmA: number;
  kmB: number;
  badge?: { cls: string; text: string };
  taskId?: string;
  blockId?: string;
}

interface DescCtx {
  corridor: Corridor;
  tasks: Task[];
  taskById: Map<string, Task>;
  blockById: Map<string, Block>;
  signalById: Map<string, Signal>;
  t: Tf;
}

function describe(ref: HitRef, c: DescCtx): Desc | null {
  const { corridor, t } = c;
  const stName = (code: string) => corridor.stations.find((s) => s.code === code)?.name ?? code;
  const esAt = (km: number) => corridor.oheSections.filter((s) => km >= s.startKm - 1e-9 && km <= s.endKm + 1e-9).map((s) => s.label).join(', ') || '—';
  switch (ref.kind) {
    case 'station': {
      const s = corridor.stations.find((x) => x.code === ref.id);
      if (!s) return null;
      const secs = corridor.blockSections.filter((b) => b.from === s.code || b.to === s.code).map((b) => b.label).join(', ') || '—';
      return { kind: s.junction ? t('kJunction') : t('kStation'), title: `${s.name} (${s.code})`, rows: [[t('fCode'), s.code], [t('fSections'), secs]], native: null, kmA: s.km, kmB: s.km };
    }
    case 'section': {
      const s = corridor.blockSections[Number(ref.id)];
      if (!s) return null;
      const n = c.tasks.filter((x) => x.sections.includes(s.index)).length;
      return {
        kind: t('kSection'),
        title: s.label,
        rows: [
          [t('fFromTo'), `${stName(s.from)} – ${stName(s.to)}`],
          [t('fLength'), `${num(s.lengthKm, 1)} km`],
          [t('fRecords'), num(n)],
        ],
        native: null,
        kmA: s.startKm,
        kmB: s.endKm,
      };
    }
    case 'signal': {
      const s = c.signalById.get(ref.id);
      if (!s) return null;
      return {
        kind: t(SIGNAL_KEY[s.kind] ?? 'sigOther'),
        title: s.label,
        rows: [
          [t('fStation'), `${stName(s.stationCode)} (${s.stationCode})`],
          [t('fLine'), lineText(s.line, t)],
        ],
        native: `${t('gear')} ${s.id}`,
        kmA: s.km,
        kmB: s.km,
      };
    }
    case 'es': {
      const s = corridor.oheSections.find((x) => x.id === ref.id);
      if (!s) return null;
      const tss = corridor.tss.filter((x) => x.km >= s.startKm && x.km <= s.endKm).map((x) => x.code).join(', ') || '—';
      return {
        kind: t('kEs'),
        title: s.label,
        rows: [
          [t('fSps'), `${s.spFrom} → ${s.spTo}`],
          [t('fLength'), `${num(s.endKm - s.startKm, 1)} km`],
          [t('fTss'), tss],
        ],
        native: null,
        kmA: s.startKm,
        kmB: s.endKm,
      };
    }
    case 'sp': {
      const km = Number(ref.id);
      if (!Number.isFinite(km)) return null;
      return { kind: t('kSp'), title: `SP-${ref.id}`, rows: [[t('fEs'), esAt(km)]], native: null, kmA: km, kmB: km };
    }
    case 'tss': {
      const s = corridor.tss.find((x) => x.code === ref.id);
      if (!s) return null;
      return { kind: t('kTss'), title: s.code, rows: [[t('fEs'), esAt(s.km)]], native: s.code, kmA: s.km, kmB: s.km };
    }
    case 'task': {
      const x = c.taskById.get(ref.id);
      if (!x) return null;
      const lane = laneOf(x);
      const rows: [string, string][] = [
        [t('fRecord'), x.sourceId],
        [t('fDept'), x.dept],
        [t('fWork'), x.workType],
        [t('fLine'), lineText(x.line, t)],
        [t('fSection'), x.sectionLabel],
        [t('fArci'), x.risk.arci.toFixed(2)],
      ];
      if (x.injected) rows.push([t('fInjected'), injectedFrom(x, t)]);
      return {
        kind: t('kTask', { sys: lane }),
        title: x.label,
        rows,
        native: nativeRef(x, t),
        kmA: Math.min(x.startKm, x.endKm),
        kmB: Math.max(x.startKm, x.endKm),
        badge: { cls: `badge-${x.dept.toLowerCase()}`, text: lane },
        taskId: x.id,
      };
    }
    case 'block': {
      const b = c.blockById.get(ref.id);
      if (!b) return null;
      const st = stateOf(b);
      return {
        kind: t('kBlock'),
        title: b.id,
        rows: [
          [t('fDate'), b.dateLabel],
          [t('fWindow'), `${b.startText}–${b.endText}`],
          [t('fSection'), b.sectionText],
          [t('fLine'), lineText(b.line, t)],
          [t('fKind'), b.kind],
          [t('fDept'), b.departments.join(' + ')],
          [t('fWorks'), num(b.tasks.length)],
        ],
        native: null,
        kmA: Math.min(b.startKm, b.endKm),
        kmB: Math.max(b.startKm, b.endKm),
        badge: { cls: STATE_BADGE[st], text: t(STATE_KEY[st]) },
        blockId: b.id,
      };
    }
    default:
      return null;
  }
}

/** Native reference + the resolved km in all three reference systems. */
function locationRows(d: Desc, t: Tf): [string, string, string][] {
  const rows: [string, string, string][] = [];
  if (d.native) rows.push([t('fNative'), d.native, 'mono']);
  rows.push([t('fKm'), `km ${rangeText(d.kmA, d.kmB, kmDec)}`, 'num']);
  rows.push([t('fKmTp'), rangeText(d.kmA, d.kmB, tpText), 'mono']);
  rows.push([t('fMast'), rangeText(d.kmA, d.kmB, mastText), 'mono']);
  return rows;
}

/* ── Component ──────────────────────────────────────────────── */

interface Hover {
  ref: HitRef;
  x: number;
  y: number;
  rw: number;
  rh: number;
}

export function CorridorRuler({ corridor, tasks, blocks, onOpenTask, onOpenBlock, initialDay = 'all', tour }: CorridorRulerProps) {
  const t = useT(strings) as Tf;
  const L = Math.max(0.1, corridor.lengthKm);
  const minSpan = Math.min(MIN_SPAN_KM, L);

  const rulerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const modelRef = useRef<Model | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ cx: number; cy: number; sx: number; sy: number } | null>(null);
  const dragRef = useRef<{ id: number; x0: number; y0: number; from0: number; to0: number; moved: boolean; mouse: boolean } | null>(null);

  const [boxW, setBoxW] = useState(0);
  const [vs, setVs] = useState(() => ({ cid: corridor.id, from: 0, to: L }));
  const [day, setDay] = useState<number | 'all'>(initialDay);
  const [hover, setHover] = useState<Hover | null>(null);
  const [pinned, setPinned] = useState<HitRef | null>(null);
  const [dragging, setDragging] = useState(false);

  /* visible window (reset when the corridor changes) */
  const [from, to] = vs.cid === corridor.id ? clampWindow(vs.from, vs.to, L, minSpan) : [0, L];
  const span = to - from;
  const isWhole = span >= L - 1e-6;

  const applyView = useCallback(
    (fn: (f: number, e: number) => [number, number]) => {
      setVs((prev) => {
        const base = prev.cid === corridor.id ? clampWindow(prev.from, prev.to, L, minSpan) : ([0, L] as [number, number]);
        const [a, b] = fn(base[0], base[1]);
        const [f, e] = clampWindow(a, b, L, minSpan);
        return { cid: corridor.id, from: f, to: e };
      });
    },
    [corridor.id, L, minSpan],
  );
  const zoomAt = useCallback((km: number, factor: number) => applyView((f, e) => [km - (km - f) * factor, km + (e - km) * factor]), [applyView]);
  const zoomBy = useCallback((factor: number) => applyView((f, e) => {
    const c = (f + e) / 2;
    const h = ((e - f) * factor) / 2;
    return [c - h, c + h];
  }), [applyView]);
  const panBy = useCallback((dk: number) => applyView((f, e) => [f + dk, e + dk]), [applyView]);
  const showWhole = useCallback(() => applyView(() => [0, L]), [applyView, L]);
  const zoomTo = useCallback((a: number, b: number) => {
    const pad = Math.max(0.5, (b - a) * 0.3);
    const lo = a - pad;
    const hi = Math.max(b + pad, lo + minSpan);
    applyView(() => [lo, hi]);
  }, [applyView, minSpan]);

  /* container width */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0]?.contentRect.width ?? el.clientWidth);
      setBoxW((prev) => (prev === w ? prev : w));
    });
    ro.observe(el);
    setBoxW(Math.floor(el.clientWidth));
    return () => ro.disconnect();
  }, []);
  const W = Math.max(MIN_SVG_W, boxW);

  /* data prepared once per input */
  const tasksByLane = useMemo(() => {
    const out: Record<RecordLane, Task[]> = { TMS: [], SMMS: [], TDMS: [] };
    for (const x of tasks) out[laneOf(x)].push(x);
    return out;
  }, [tasks]);
  const { days, dayShort, dayLong } = useMemo(() => {
    const short = new Map<number, string>();
    const long = new Map<number, string>();
    for (const b of blocks) {
      if (!long.has(b.day)) {
        long.set(b.day, b.dateLabel);
        short.set(b.day, b.dateLabel.split(' ')[0] || `D${b.day + 1}`);
      }
    }
    return { days: [...long.keys()].sort((a, b) => a - b), dayShort: short, dayLong: long };
  }, [blocks]);
  const dayOptions = useMemo(() => (typeof day === 'number' && !days.includes(day) ? [...days, day].sort((a, b) => a - b) : days), [days, day]);
  const signalById = useMemo(() => new Map((corridor.signals ?? []).map((s) => [s.id, s])), [corridor.signals]);
  const taskById = useMemo(() => new Map(tasks.map((x) => [x.id, x])), [tasks]);
  const blockById = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks]);

  /* legend counts (whole corridor / whole filter) */
  const signalCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of corridor.signals ?? []) out[s.kind] = (out[s.kind] ?? 0) + 1;
    return out;
  }, [corridor.signals]);
  const junctions = useMemo(() => corridor.stations.filter((s) => s.junction).length, [corridor.stations]);
  const injectedCount = useMemo(() => tasks.filter((x) => x.injected).length, [tasks]);
  const stateCounts = useMemo(() => {
    const out = {} as Record<BState, number>;
    for (const b of blocks) if (day === 'all' || b.day === day) out[stateOf(b)] = (out[stateOf(b)] ?? 0) + 1;
    return out;
  }, [blocks, day]);

  /* the drawn model — only the visible window */
  const model = useMemo(() => buildModel({ corridor, tasksByLane, blocks, from, to, W, day, days: dayOptions, dayShort }), [corridor, tasksByLane, blocks, from, to, W, day, dayOptions, dayShort]);
  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  /* ctrl + wheel zooms about the cursor; horizontal wheel pans when zoomed */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const m = modelRef.current;
      const svg = svgRef.current;
      if (!m || !svg) return;
      const r = svg.getBoundingClientRect();
      const km = m.from + ((e.clientX - r.left - PAD_X) / m.iw) * (m.to - m.from);
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomAt(km, Math.exp(Math.max(-0.5, Math.min(0.5, e.deltaY * 0.0025))));
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && el.scrollWidth <= el.clientWidth + 1 && m.to - m.from < L - 1e-6) {
        e.preventDefault();
        panBy((e.deltaX / m.iw) * (m.to - m.from));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt, panBy, L]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  /* pointer: hover (rAF-throttled), mouse drag pans, click / tap pins */
  const local = (e: ReactPointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const flushHover = useCallback(() => {
    rafRef.current = null;
    const p = pendingRef.current;
    const m = modelRef.current;
    const root = rulerRef.current;
    if (!p || !m || !root) return;
    const h = hitTest(m.hits, p.sx, p.sy);
    if (!h) {
      setHover(null);
      return;
    }
    const r = root.getBoundingClientRect();
    setHover({ ref: h.ref, x: p.cx - r.left, y: p.cy - r.top, rw: r.width, rh: r.height });
  }, []);

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = local(e);
    const mouse = e.pointerType === 'mouse';
    dragRef.current = { id: e.pointerId, x0: p.x, y0: p.y, from0: from, to0: to, moved: false, mouse };
    if (mouse) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* capture is best-effort */
      }
    }
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const p = local(e);
    const d = dragRef.current;
    if (d) {
      const dx = p.x - d.x0;
      if (!d.moved && Math.hypot(dx, p.y - d.y0) > (d.mouse ? 3 : 8)) {
        d.moved = true;
        if (d.mouse && !isWhole) setDragging(true);
      }
      if (d.mouse && d.moved && !isWhole) {
        const dk = (dx / model.iw) * (d.to0 - d.from0);
        applyView(() => [d.from0 - dk, d.to0 - dk]);
        setHover(null);
        return;
      }
      if (!d.mouse) return;
    }
    pendingRef.current = { cx: e.clientX, cy: e.clientY, sx: p.x, sy: p.y };
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(flushHover);
  };
  const endPointer = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (d?.mouse) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    return d;
  };
  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = endPointer(e);
    if (!d || d.moved) return;
    const p = local(e);
    const h = hitTest(model.hits, p.x, p.y);
    if (h) {
      setPinned(h.ref);
      if (!d.mouse) setHover(null);
    }
  };
  const onPointerCancel = () => {
    dragRef.current = null;
    setDragging(false);
  };
  const onPointerLeave = () => {
    pendingRef.current = null;
    if (!dragRef.current) setHover(null);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    let handled = true;
    switch (e.key) {
      case 'ArrowLeft':
        panBy(-span * 0.2);
        break;
      case 'ArrowRight':
        panBy(span * 0.2);
        break;
      case '+':
      case '=':
        zoomBy(0.5);
        break;
      case '-':
      case '_':
        zoomBy(2);
        break;
      case '0':
      case 'Home':
        showWhole();
        break;
      case 'Escape':
        if (pinned) setPinned(null);
        else handled = false;
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  };

  /* descriptions */
  const ctx = useMemo<DescCtx>(() => ({ corridor, tasks, taskById, blockById, signalById, t }), [corridor, tasks, taskById, blockById, signalById, t]);
  const pinnedDesc = useMemo(() => (pinned ? describe(pinned, ctx) : null), [pinned, ctx]);
  const hoverDesc = useMemo(() => (hover ? describe(hover.ref, ctx) : null), [hover, ctx]);
  const pinnedBoxes = useMemo(() => (pinned && pinnedDesc ? model.hits.filter((h) => sameRef(h.ref, pinned)) : []), [model, pinned, pinnedDesc]);
  const hoverBoxes = useMemo(() => (hover && !sameRef(hover.ref, pinned) ? model.hits.filter((h) => sameRef(h.ref, hover.ref)) : []), [model, hover, pinned]);

  const digits = windowDigits(span);
  const winText = `km ${from.toFixed(digits)} – ${to.toFixed(digits)}`;
  const panStep = Math.max(0.01, Math.round((span / 200) * 100) / 100);
  const hasSignals = (corridor.signals?.length ?? 0) > 0;
  const emptyText = day === 'all' ? t('noBlocksWeek') : t('noBlocksDay');

  const tipStyle = hover ? { left: hover.x + 14 + 270 > hover.rw ? Math.max(4, hover.x - 284) : hover.x + 14, top: hover.y + 16 + 96 > hover.rh ? Math.max(4, hover.y - 104) : hover.y + 16 } : undefined;
  const svgClass = ['cr-svg', hover ? 'hit' : '', dragging ? 'dragging' : '', isWhole ? '' : 'pannable'].filter(Boolean).join(' ');

  return (
    <div className="cr" data-tour={tour ?? 'corridor-ruler'}>
      {/* toolbar */}
      <div className="cr-toolbar">
        <div className="row" role="group" aria-label={t('windowLabel')}>
          <button type="button" className="btn btn-sm btn-icon" onClick={() => zoomBy(2)} disabled={isWhole} aria-label={t('zoomOut')} title={t('zoomOut')}>
            <ZoomOut />
          </button>
          <button type="button" className="btn btn-sm btn-icon" onClick={() => zoomBy(0.5)} disabled={span <= minSpan + 1e-6} aria-label={t('zoomIn')} title={t('zoomIn')}>
            <ZoomIn />
          </button>
          <button type="button" className="btn btn-sm" onClick={showWhole} disabled={isWhole} aria-label={t('whole')} title={t('whole')}>
            <Maximize2 />
            <span className="hide-mobile">{t('whole')}</span>
          </button>
        </div>
        <input
          type="range"
          className="cr-pan"
          min={0}
          max={Math.max(0, L - span)}
          step={panStep}
          value={from}
          disabled={isWhole}
          onChange={(e) => {
            const f = Number(e.target.value);
            applyView(() => [f, f + span]);
          }}
          aria-label={t('pan')}
          aria-valuetext={winText}
        />
        <span className="cr-win small mono num" aria-live="polite" title={t('windowLabel')}>
          {winText}
        </span>
        <select className="select cr-day" value={String(day)} onChange={(e) => setDay(e.target.value === 'all' ? 'all' : Number(e.target.value))} aria-label={t('day')}>
          <option value="all">{t('allDays')}</option>
          {dayOptions.map((d) => (
            <option key={d} value={String(d)}>
              {dayLong.get(d) ?? t('dayN', { n: d + 1 })}
            </option>
          ))}
        </select>
      </div>

      {/* ruler: fixed lane gutter + horizontally scrollable drawing */}
      <div className="cr-ruler" ref={rulerRef}>
        <div className="cr-gutter" aria-hidden="true">
          {model.lanes.map((l) => (
            <div key={l.key} className={`cr-glane${l.subs.length ? '' : ' nosub'}`} style={{ height: l.h }}>
              <span className="cr-glabel">{t(LANE_LABEL[l.key])}</span>
              {l.subs.map((s, i) => (
                <span key={i} className="cr-gsub" style={{ top: s.y - l.y }}>
                  {s.text}
                </span>
              ))}
            </div>
          ))}
        </div>
        <div className="cr-scroll" ref={scrollRef} tabIndex={0} role="region" onKeyDown={onKeyDown} aria-label={t('keysHint')}>
          <svg
            ref={svgRef}
            className={svgClass}
            width={model.W}
            height={model.H}
            viewBox={`0 0 ${model.W} ${model.H}`}
            role="img"
            aria-label={t('ariaRuler', { corridor: corridor.code, a: from.toFixed(digits), b: to.toFixed(digits) })}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onPointerLeave={onPointerLeave}
          >
            <RulerMarks m={model} emptyText={emptyText} noSignalsText={t('noSignals')} hasSignals={hasSignals} />
            {hoverBoxes.map((h, i) => (
              <rect key={`hv${i}`} className="cr-hv" x={h.x0 - 1.5} y={h.y0 - 1.5} width={h.x1 - h.x0 + 3} height={h.y1 - h.y0 + 3} rx={2} />
            ))}
            {pinnedBoxes.map((h, i) => (
              <rect key={`pin${i}`} className="cr-hl" x={h.x0 - 2} y={h.y0 - 2} width={h.x1 - h.x0 + 4} height={h.y1 - h.y0 + 4} rx={2.5} />
            ))}
          </svg>
        </div>
        {hover && hoverDesc && tipStyle && (
          <div className="cr-tip" style={tipStyle} role="tooltip">
            <div className="cr-tip-kind">{hoverDesc.kind}</div>
            <b>{hoverDesc.title}</b>
            {hoverDesc.badge && hover.ref.kind === 'block' && <div className="cr-tip-sub">{hoverDesc.badge.text}</div>}
            {hoverDesc.native && hoverDesc.native !== hoverDesc.title && <div className="cr-tip-sub mono">{hoverDesc.native}</div>}
            <div className="cr-tip-sub num">{`km ${rangeText(hoverDesc.kmA, hoverDesc.kmB, kmDec)}`}</div>
            {!sameRef(hover.ref, pinned) && <div className="cr-tip-hint">{t('clickHint')}</div>}
          </div>
        )}
      </div>

      {/* pinned details */}
      {pinned && pinnedDesc && (
        <section className="cr-details" aria-label={t('details')}>
          <div className="cr-details-head">
            <div className="grow">
              <div className="row-wrap">
                <span className="tiny muted">{pinnedDesc.kind}</span>
                {pinnedDesc.badge && <span className={`badge ${pinnedDesc.badge.cls}`}>{pinnedDesc.badge.text}</span>}
              </div>
              <div className="cr-details-title">{pinnedDesc.title}</div>
            </div>
            <button type="button" className="btn btn-sm btn-icon btn-ghost" onClick={() => setPinned(null)} aria-label={t('close')} title={t('close')}>
              <X />
            </button>
          </div>
          <div className="cr-details-body">
            <dl className="kv">
              {pinnedDesc.rows.map(([k, v]) => (
                <Fragment key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </Fragment>
              ))}
            </dl>
            <dl className="kv">
              {locationRows(pinnedDesc, t).map(([k, v, cls]) => (
                <Fragment key={k}>
                  <dt>{k}</dt>
                  <dd className={cls}>{v}</dd>
                </Fragment>
              ))}
            </dl>
          </div>
          <div className="cr-details-foot">
            {pinnedDesc.taskId && onOpenTask && (
              <button type="button" className="btn btn-sm btn-dark" onClick={() => onOpenTask(pinnedDesc.taskId as string)}>
                {t('openWork')}
              </button>
            )}
            {pinnedDesc.blockId && onOpenBlock && (
              <button type="button" className="btn btn-sm btn-dark" onClick={() => onOpenBlock(pinnedDesc.blockId as string)}>
                {t('openBlock')}
              </button>
            )}
            <button type="button" className="btn btn-sm" onClick={() => zoomTo(pinnedDesc.kmA, pinnedDesc.kmB)}>
              <Crosshair />
              {t('zoomHere')}
            </button>
            <span className="tiny dim">{t('convNote', { tp: TP_PER_KM, span: Math.round(MAST_SPAN_KM * 1000) })}</span>
          </div>
        </section>
      )}

      {/* legend (counts computed from the corridor, the records and the blocks) */}
      <div className="cr-legend">
        <div className="cr-lg-group">
          <span className="cr-lg-title">{t('lgStations')}</span>
          <span className="cr-lg">
            <Swatch w={12}>
              <rect className="cr-stn-jn" x={2.5} y={2.5} width={7} height={7} />
            </Swatch>
            {t('lgJunction')} <span className="num">{num(junctions)}</span>
          </span>
          <span className="cr-lg">
            <Swatch w={12}>
              <circle className="cr-stn" cx={6} cy={6} r={3.2} />
            </Swatch>
            {t('lgStation')} <span className="num">{num(corridor.stations.length - junctions)}</span>
          </span>
        </div>
        <div className="cr-lg-group">
          <span className="cr-lg-title">{t('lgSignals')}</span>
          {SIGNAL_KINDS.map((k) => (
            <span key={k} className="cr-lg">
              <Swatch>{k === 'LC_GATE' ? <LcMark x={8} y0={0} y1={12} cy={6} /> : <SignalMark kind={k} x={8} cy={6} dir={1} />}</Swatch>
              {t(SIGNAL_KEY[k])} <span className="num">{num(signalCounts[k] ?? 0)}</span>
            </span>
          ))}
        </div>
        <div className="cr-lg-group">
          <span className="cr-lg-title">{t('lgOhe')}</span>
          <span className="cr-lg">
            <Swatch>
              <rect className="cr-es" x={1} y={3} width={14} height={6} />
            </Swatch>
            {t('lgEs')} <span className="num">{num(corridor.oheSections.length)}</span>
          </span>
          <span className="cr-lg">
            <Swatch w={10}>
              <line className="cr-sp" x1={5} x2={5} y1={0} y2={12} />
            </Swatch>
            {t('lgSp')} <span className="num">{num(corridor.switchingPosts.length)}</span>
          </span>
          <span className="cr-lg">
            <Swatch w={12}>
              <path className="cr-tss" d="M6 1L11 6L6 11L1 6Z" />
            </Swatch>
            {t('lgTss')} <span className="num">{num(corridor.tss.length)}</span>
          </span>
        </div>
        <div className="cr-lg-group">
          <span className="cr-lg-title">{t('lgRecords')}</span>
          {RECORD_LANES.map((lane) => (
            <span key={lane} className="cr-lg">
              <Swatch>
                <rect className={`cr-rec cr-rec-${lane.toLowerCase()}`} x={1} y={3} width={14} height={6} rx={1.5} />
              </Swatch>
              {lane} <span className="num">{num(tasksByLane[lane].length)}</span>
            </span>
          ))}
          {injectedCount > 0 && (
            <span className="cr-lg">
              <Swatch>
                <rect className="cr-rec cr-rec-tms inj" x={1.5} y={3} width={13} height={6} rx={1.5} />
              </Swatch>
              {t('lgInjected')} <span className="num">{num(injectedCount)}</span>
            </span>
          )}
          <SimLabel kind="seededFeed" system="TMS / SMMS / TDMS" />
        </div>
        <div className="cr-lg-group">
          <span className="cr-lg-title">{t('lgBlocks')}</span>
          {BLOCK_STATES.filter((s) => (stateCounts[s] ?? 0) > 0).map((s) => (
            <span key={s} className="cr-lg">
              <Swatch>
                <rect className={`cr-blk cr-blk-${s.toLowerCase()}`} x={1.5} y={2.5} width={13} height={7} rx={2} />
              </Swatch>
              {t(STATE_KEY[s])} <span className="num">{num(stateCounts[s] ?? 0)}</span>
            </span>
          ))}
          {model.blocksInFilter === 0 && <span className="dim">{emptyText}</span>}
        </div>
      </div>
      <p className="cr-note tiny muted">{t('signalNote')}</p>
      <p className="cr-note tiny dim hide-mobile">{t('keysHint')}</p>
    </div>
  );
}

export default CorridorRuler;
