/**
 * Time–distance (string) diagram on canvas.
 *
 * x = time of day (00:00–24:00), y = chainage (0 … corridor.lengthKm) with
 * station lines labelled by code. Layers, all engine-driven:
 *  - train paths for the day (WTT + FOIS), coloured by class
 *  - COA corridor blocks provisioned for the weekday (hatched bands)
 *  - planned blocks for the day (department fill, workflow-status outline)
 *  - baseline (rule-based) blocks as grey dashed outlines
 *  - free headway windows per section / line (pale green)
 *  - TSR bands (thin red band across the day)
 *  - a "now" cursor with its time label
 * Hover → tooltip; click a block → onBlockClick; drag across the diagram →
 * onWindowSelect({ sectionIndex, start, end }) ("try a block here").
 *
 * The component is pure: it draws exactly what it is given. Pages add
 * honesty labels (SimLabel) around it.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Block, Corridor, CorridorBlock, DayOccupancy, Dept, RunLine, Train } from '../../engine/types';
import { hhmm, duration, kmRange, num } from '../../lib/format';
import { useT } from '../../i18n';
import './StringDiagram.css';

/* ── Public types ───────────────────────────────────────────── */

export interface FreeWindow {
  sectionIndex: number;
  /** omitted = both lines */
  line?: RunLine;
  start: number;
  end: number;
}

export interface TsrBand {
  fromKm: number;
  toKm: number;
  kmph: number;
  line?: RunLine | 'BOTH';
  /** shown in the tooltip (reason, order number …) */
  label?: string;
}

export interface StringDiagramLayers {
  passenger: boolean;
  goods: boolean;
  freeWindows: boolean;
  baseline: boolean;
  blocks: boolean;
  tsr: boolean;
}

export interface WindowSelection {
  sectionIndex: number;
  start: number;
  end: number;
}

export interface StringDiagramProps {
  corridor: Corridor;
  /** the day's trains: [...timetable.filter(runsOn[dow]), ...freight.filter(day === d)] */
  trains: Train[];
  /** planned blocks (WorkingBlock[] — status read from `block.status`) */
  blocks: Block[];
  day: number;
  dow: number;
  corridorBlocks: CorridorBlock[];
  freeWindows?: FreeWindow[];
  tsrs?: TsrBand[];
  nowMinute?: number;
  layers?: Partial<StringDiagramLayers>;
  /** rule-based plan for the same day, drawn when layers.baseline is on */
  baselineBlocks?: Block[];
  highlightSection?: number | null;
  /** canvas height in CSS px */
  height?: number;
  onBlockClick?: (block: Block) => void;
  onWindowSelect?: (sel: WindowSelection) => void;
  /** hide the legend row (page renders its own) */
  legend?: boolean;
}

const DEFAULT_LAYERS: StringDiagramLayers = { passenger: true, goods: true, freeWindows: false, baseline: false, blocks: true, tsr: true };

const MIN_PER_DAY = 1440;
const PAD_L = 58;
const PAD_R = 12;
const PAD_T = 22;
const PAD_B = 24;
const SNAP_MIN = 5;

/* ── Free windows from serialised occupancy ─────────────────── */

/**
 * Free windows per (section, line) computed from a serialised DayOccupancy
 * (snapshot.result.weekly.occupancy[day]). Port of engine/occupancy.js
 * freeWindows() — a headway margin is kept on both sides of every passage.
 */
export function freeWindowsForDay(occupancy: DayOccupancy, corridor: Corridor, minLen: number, margin: number): FreeWindow[] {
  const out: FreeWindow[] = [];
  for (const sec of corridor.blockSections) {
    for (const line of corridor.lines) {
      const ps = occupancy.occ[`${sec.index}:${line}`] ?? [];
      let cursor = 0;
      for (const p of ps) {
        const s = p.enter - margin;
        if (s - cursor >= minLen) out.push({ sectionIndex: sec.index, line, start: cursor, end: s });
        cursor = Math.max(cursor, p.exit + margin);
      }
      if (MIN_PER_DAY - cursor >= minLen) out.push({ sectionIndex: sec.index, line, start: cursor, end: MIN_PER_DAY });
    }
  }
  return out;
}

/* ── Theme colours (read from CSS variables so every theme works) ── */

interface Palette {
  line: string;
  line2: string;
  ink: string;
  ink2: string;
  ink3: string;
  ink4: string;
  bg1: string;
  accent: string;
  ok: string;
  crit: string;
  info: string;
  coa: string;
  tms: string;
  smms: string;
  tdms: string;
  vb: string;
  prem: string;
  pass: string;
  goods: string;
  green: string;
  mono: string;
}

function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    line: v('--line', '#e6e6e6'),
    line2: v('--line-2', '#d6d6d6'),
    ink: v('--ink', '#111111'),
    ink2: v('--ink-2', '#4b5563'),
    ink3: v('--ink-3', '#6b7280'),
    ink4: v('--ink-4', '#9ca3af'),
    bg1: v('--bg-1', '#ffffff'),
    accent: v('--accent', '#f28c28'),
    ok: v('--ok', '#43a047'),
    crit: v('--crit', '#e85d5d'),
    info: v('--info', '#2f6fde'),
    coa: v('--coa', '#7e57c2'),
    tms: v('--tms', '#2e7d32'),
    smms: v('--smms', '#2f6fde'),
    tdms: v('--tdms', '#d9700f'),
    vb: v('--train-vb', '#111111'),
    prem: v('--train-prem', '#b08900'),
    pass: v('--train-pass', '#5b6470'),
    goods: v('--train-goods', '#9ca3af'),
    green: v('--pastel-green', '#cce9cd'),
    mono: v('--font-mono', 'ui-monospace, monospace'),
  };
}

function deptColour(p: Palette, d: Dept): string {
  return d === 'TMS' ? p.tms : d === 'SMMS' ? p.smms : p.tdms;
}

/** Diagonal hatch pattern (optionally on a fill), drawn at device resolution. */
function hatchPattern(ctx: CanvasRenderingContext2D, stroke: string, alpha: number, dpr: number, size = 6): CanvasPattern | string {
  const c = document.createElement('canvas');
  c.width = c.height = Math.round(size * dpr);
  const g = c.getContext('2d');
  if (!g) return stroke;
  g.scale(dpr, dpr);
  g.globalAlpha = alpha;
  g.strokeStyle = stroke;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(-1, size + 1);
  g.lineTo(size + 1, -1);
  g.stroke();
  const pat = ctx.createPattern(c, 'repeat');
  if (!pat) return stroke;
  pat.setTransform(new DOMMatrix().scale(1 / dpr));
  return pat;
}

/** Stripes of the given colours (joint blocks). */
function stripePattern(ctx: CanvasRenderingContext2D, colours: string[], alpha: number, dpr: number, band = 4): CanvasPattern | string {
  const size = band * colours.length;
  const c = document.createElement('canvas');
  c.width = c.height = Math.round(size * dpr);
  const g = c.getContext('2d');
  if (!g) return colours[0];
  g.scale(dpr, dpr);
  g.globalAlpha = alpha;
  g.lineWidth = band;
  // diagonal stripes: draw each colour as a set of 45° lines offset by band
  for (let i = 0; i < colours.length; i++) {
    g.strokeStyle = colours[i];
    for (let k = -size; k <= size * 2; k += size) {
      const o = k + i * band * Math.SQRT2;
      g.beginPath();
      g.moveTo(o - size, size * 2);
      g.lineTo(o + size * 2, -size);
      g.stroke();
    }
  }
  const pat = ctx.createPattern(c, 'repeat');
  if (!pat) return colours[0];
  pat.setTransform(new DOMMatrix().scale(1 / dpr));
  return pat;
}

/* ── Hit regions ────────────────────────────────────────────── */

type Hit =
  | { type: 'train'; train: Train; pts: [number, number][] }
  | { type: 'block'; block: Block; box: [number, number, number, number] }
  | { type: 'baseline'; block: Block; box: [number, number, number, number] }
  | { type: 'window'; win: FreeWindow; box: [number, number, number, number] }
  | { type: 'tsr'; tsr: TsrBand; box: [number, number, number, number] }
  | { type: 'coa'; cb: CorridorBlock; box: [number, number, number, number] };

interface Geometry {
  W: number;
  H: number;
  iw: number;
  ih: number;
  lengthKm: number;
}

const inBox = (x: number, y: number, b: [number, number, number, number]) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

function distToSeg(px: number, py: number, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1;
  let t = ((px - a[0]) * dx + (py - a[1]) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

function statusOf(b: Block): string {
  return (b.status || 'PROPOSED').toUpperCase();
}

/* ── Drawing ────────────────────────────────────────────────── */

interface DrawInput {
  corridor: Corridor;
  trains: Train[];
  blocks: Block[];
  baselineBlocks: Block[];
  day: number;
  dow: number;
  corridorBlocks: CorridorBlock[];
  freeWindows: FreeWindow[];
  tsrs: TsrBand[];
  nowMinute: number | undefined;
  layers: StringDiagramLayers;
  highlightSection: number | null | undefined;
  labels: { coa: string; tsr: string; blk: string; disc: string; now: string };
}

function draw(canvas: HTMLCanvasElement, W: number, H: number, input: DrawInput): { hits: Hit[]; geo: Geometry } {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');
  const geo: Geometry = { W, H, iw: W - PAD_L - PAD_R, ih: H - PAD_T - PAD_B, lengthKm: Math.max(1, input.corridor.lengthKm) };
  const hits: Hit[] = [];
  if (!ctx) return { hits, geo };
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const p = readPalette();
  const { corridor, layers } = input;
  const { iw, ih, lengthKm } = geo;
  const sx = (m: number) => PAD_L + (m / MIN_PER_DAY) * iw;
  const sy = (km: number) => PAD_T + (km / lengthKm) * ih;
  const mono = (px: number, weight = '') => `${weight ? `${weight} ` : ''}${px}px ${p.mono}`;

  ctx.clearRect(0, 0, W, H);

  /* grid — hours */
  const hourStep = iw < 420 ? 4 : iw < 720 ? 3 : 2;
  ctx.font = mono(9.5);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (let h = 0; h <= 24; h += 1) {
    const x = sx(h * 60);
    ctx.strokeStyle = h % hourStep === 0 ? p.line2 : p.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, PAD_T);
    ctx.lineTo(x, PAD_T + ih);
    ctx.stroke();
    if (h % hourStep === 0) {
      ctx.fillStyle = p.ink3;
      ctx.fillText(`${String(h).padStart(2, '0')}:00`, x, H - 8);
    }
  }

  /* grid — stations (labels thinned when they would collide) */
  ctx.textAlign = 'right';
  let lastLabelY = -Infinity;
  const stations = [...corridor.stations].sort((a, b) => a.km - b.km);
  for (const st of stations) {
    const y = sy(st.km);
    ctx.strokeStyle = st.junction ? p.line2 : p.line;
    ctx.lineWidth = st.junction ? 1.2 : 1;
    ctx.beginPath();
    ctx.moveTo(PAD_L, y);
    ctx.lineTo(W - PAD_R, y);
    ctx.stroke();
    if (st.junction || y - lastLabelY >= 11) {
      ctx.fillStyle = st.junction ? p.ink : p.ink2;
      ctx.font = mono(9.5, st.junction ? '600' : '');
      ctx.fillText(st.code, PAD_L - 6, y + 3);
      lastLabelY = y;
    }
  }

  /* plot area clip */
  ctx.save();
  ctx.beginPath();
  ctx.rect(PAD_L, PAD_T, iw, ih);
  ctx.clip();

  /* highlighted section wash */
  if (input.highlightSection !== null && input.highlightSection !== undefined) {
    const s = corridor.blockSections[input.highlightSection];
    if (s) {
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = p.info;
      ctx.fillRect(PAD_L, sy(s.startKm), iw, sy(s.endKm) - sy(s.startKm));
      ctx.globalAlpha = 1;
    }
  }

  /* free headway windows */
  if (layers.freeWindows) {
    for (const w of input.freeWindows) {
      const s = corridor.blockSections[w.sectionIndex];
      if (!s) continue;
      const top = sy(s.startKm);
      const bottom = sy(s.endKm);
      const half = (bottom - top) / 2;
      const y0 = w.line === 'DN' ? top + half : top;
      const y1 = w.line === 'UP' ? top + half : bottom;
      const x0 = sx(Math.max(0, w.start));
      const x1 = sx(Math.min(MIN_PER_DAY, w.end));
      ctx.fillStyle = p.green;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.globalAlpha = 1;
      hits.push({ type: 'window', win: w, box: [x0, y0, x1, y1] });
    }
  }

  /* COA corridor blocks provisioned on this weekday */
  const coaHatch = hatchPattern(ctx, p.coa, 0.5, dpr);
  ctx.font = mono(9);
  for (const cb of input.corridorBlocks) {
    if (!cb.days.includes(input.dow)) continue;
    const [sh, sm] = cb.start.split(':').map(Number);
    const [eh, em] = cb.end.split(':').map(Number);
    const x0 = sx(sh * 60 + (sm || 0));
    const x1 = sx(eh * 60 + (em || 0));
    const y0 = sy(cb.fromKm);
    const y1 = sy(cb.toKm);
    ctx.fillStyle = coaHatch;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeStyle = p.coa;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
    ctx.setLineDash([]);
    ctx.fillStyle = p.coa;
    ctx.textAlign = 'left';
    ctx.fillText(`${input.labels.coa} ${cb.line}`, x0 + 4, y0 + 11);
    hits.push({ type: 'coa', cb, box: [x0, y0, x1, y1] });
  }

  /* TSR bands across the day */
  if (layers.tsr) {
    ctx.font = mono(9, '600');
    for (const t of input.tsrs) {
      const y0 = sy(Math.min(t.fromKm, t.toKm));
      const y1 = Math.max(y0 + 4, sy(Math.max(t.fromKm, t.toKm)));
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = p.crit;
      ctx.fillRect(PAD_L, y0, iw, y1 - y0);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = p.crit;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(PAD_L, y0 + 0.5);
      ctx.lineTo(W - PAD_R, y0 + 0.5);
      ctx.moveTo(PAD_L, y1 - 0.5);
      ctx.lineTo(W - PAD_R, y1 - 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = p.crit;
      ctx.textAlign = 'left';
      ctx.fillText(`${input.labels.tsr} ${t.kmph} km/h${t.line && t.line !== 'BOTH' ? ` ${t.line}` : ''}`, PAD_L + 4, Math.min(y1 + 10, y0 + 10));
      hits.push({ type: 'tsr', tsr: t, box: [PAD_L, y0 - 2, W - PAD_R, y1 + 2] });
    }
  }

  /* train paths */
  const classColour = (t: Train) => {
    switch (t.cls) {
      case 'VB': return p.vb;
      case 'RAJ':
      case 'SHT': return p.prem;
      case 'GOODS':
      case 'PARCEL': return p.goods;
      default: return p.pass;
    }
  };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const t of input.trains) {
    const goods = t.cls === 'GOODS' || t.cls === 'PARCEL';
    if (goods && !layers.goods) continue;
    if (!goods && !layers.passenger) continue;
    if (!t.times || t.times.length === 0) continue;
    ctx.strokeStyle = classColour(t);
    ctx.lineWidth = t.premium || t.cls === 'VB' ? 2 : goods ? 1 : 1.2;
    ctx.globalAlpha = goods ? 0.75 : 0.95;
    ctx.setLineDash(goods ? [4, 3] : []);
    ctx.beginPath();
    const pts: [number, number][] = [];
    let first = true;
    for (const tm of t.times) {
      const x = sx(tm.arr);
      const y = sy(tm.km);
      if (first) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      first = false;
      pts.push([x, y]);
      if (tm.dep !== tm.arr) {
        const xd = sx(tm.dep);
        ctx.lineTo(xd, y);
        pts.push([xd, y]);
      }
    }
    ctx.stroke();
    hits.push({ type: 'train', train: t, pts });
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  /* baseline (rule-based) blocks */
  if (layers.baseline) {
    ctx.strokeStyle = p.ink4;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    for (const b of input.baselineBlocks) {
      if (b.day !== input.day) continue;
      const box = blockBox(b, corridor, sx, sy);
      if (!box) continue;
      ctx.strokeRect(box[0] + 0.5, box[1] + 0.5, box[2] - box[0] - 1, box[3] - box[1] - 1);
      hits.push({ type: 'baseline', block: b, box });
    }
    ctx.setLineDash([]);
  }

  /* planned blocks */
  if (layers.blocks) {
    const proposedHatch = hatchPattern(ctx, p.accent, 0.55, dpr, 5);
    for (const b of input.blocks) {
      if (b.day !== input.day) continue;
      const status = statusOf(b);
      if (status === 'REFUSED') continue;
      const box = blockBox(b, corridor, sx, sy);
      if (!box) continue;
      const [x0, y0, x1, y1] = box;
      const w = x1 - x0;
      const h = y1 - y0;
      const depts = b.departments.length ? b.departments : (['TMS'] as Dept[]);
      const colours = depts.map((d) => deptColour(p, d));
      if (colours.length > 1) {
        ctx.fillStyle = stripePattern(ctx, colours, 0.35, dpr);
        ctx.fillRect(x0, y0, w, h);
      } else {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = colours[0];
        ctx.fillRect(x0, y0, w, h);
        ctx.globalAlpha = 1;
      }
      if (status === 'PROPOSED') {
        ctx.fillStyle = proposedHatch;
        ctx.fillRect(x0, y0, w, h);
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 2]);
      } else if (status === 'GRANTED') {
        ctx.strokeStyle = p.ok;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([]);
      } else if (status === 'LOCKED') {
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = colours[0];
        ctx.lineWidth = 1.2;
        ctx.setLineDash(b.lineClosure ? [] : [3, 2]);
      }
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
      ctx.setLineDash([]);
      /* label */
      if (w > 34 && h > 12) {
        ctx.fillStyle = p.ink;
        ctx.textAlign = 'left';
        ctx.font = mono(9, '600');
        const tag = `${b.line} ${b.kind === 'DISCONNECTION' ? input.labels.disc : input.labels.blk} ${depts.map((d) => d[0]).join('')}`;
        ctx.fillText(tag, x0 + 3, y0 + 10);
        if (h > 24 && w > 60) {
          ctx.font = mono(8.5);
          ctx.fillStyle = p.ink2;
          ctx.fillText(`${b.startText}–${b.endText}`, x0 + 3, y0 + 21);
        }
      }
      hits.push({ type: 'block', block: b, box });
    }
  }

  ctx.restore();

  /* now cursor — drawn outside the clip so the label can sit in the top pad */
  if (input.nowMinute !== undefined && input.nowMinute >= 0 && input.nowMinute <= MIN_PER_DAY) {
    const nx = sx(input.nowMinute);
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(nx, PAD_T);
    ctx.lineTo(nx, PAD_T + ih);
    ctx.stroke();
    const label = `${input.labels.now} ${hhmm(input.nowMinute)}`;
    ctx.font = mono(9, '600');
    const tw = ctx.measureText(label).width + 10;
    const lx = Math.min(Math.max(PAD_L, nx - tw / 2), W - PAD_R - tw);
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.roundRect(lx, 3, tw, 15, 4);
    ctx.fill();
    ctx.fillStyle = '#111111';
    ctx.textAlign = 'center';
    ctx.fillText(label, lx + tw / 2, 14);
  }

  /* axis frame */
  ctx.strokeStyle = p.line2;
  ctx.lineWidth = 1;
  ctx.strokeRect(PAD_L + 0.5, PAD_T + 0.5, iw - 1, ih - 1);

  // blocks first so they win the hit test, then trains, then bands
  const order: Record<Hit['type'], number> = { block: 0, train: 1, baseline: 2, window: 3, tsr: 4, coa: 5 };
  hits.sort((a, b) => order[a.type] - order[b.type]);
  return { hits, geo };
}

function blockBox(b: Block, corridor: Corridor, sx: (m: number) => number, sy: (km: number) => number): [number, number, number, number] | null {
  const secs = b.sections.map((i) => corridor.blockSections[i]).filter(Boolean);
  const kmA = secs.length ? Math.min(...secs.map((s) => s.startKm)) : b.startKm;
  const kmB = secs.length ? Math.max(...secs.map((s) => s.endKm)) : b.endKm;
  if (!Number.isFinite(kmA) || !Number.isFinite(kmB)) return null;
  const x0 = sx(Math.max(0, b.start));
  const x1 = sx(Math.min(MIN_PER_DAY, b.end));
  return [x0, sy(kmA), x1, sy(kmB)];
}

/* ── Tooltip model ──────────────────────────────────────────── */

type Tip = { x: number; y: number; hit: Hit };

/* ── i18n ───────────────────────────────────────────────────── */

const strings = {
  en: {
    ariaLabel: 'Time–distance diagram: {trains} train paths, {blocks} blocks on day {day}',
    coa: 'COA corridor block',
    tsr: 'TSR',
    blk: 'BLK',
    disc: 'DISC',
    now: 'Now',
    vb: 'Vande Bharat',
    prem: 'Rajdhani / Shatabdi',
    pass: 'Mail / Express / Passenger',
    goods: 'Goods / parcel',
    blockTms: 'Civil block',
    blockSmms: 'S&T block',
    blockTdms: 'TRD block',
    blockJoint: 'Joint block',
    proposed: 'Proposed',
    granted: 'Granted',
    locked: 'Locked',
    baseline: 'Baseline block',
    freeWindow: 'Free headway window',
    tsrBand: 'TSR band',
    nowCursor: 'Now cursor',
    dragHint: 'Drag across the diagram to try a block window',
    trainsAffected: 'trains affected',
    weightedDelay: 'weighted delay',
    workItems: 'work items',
    workItem: 'work item',
    both: 'Both lines',
    section: 'Section',
    freeWindowTip: 'Free headway window',
    clickToTry: 'Click to try a block here',
    baselineTip: 'Baseline (rule-based) block',
    tonnes: 't',
    speedLimit: 'Speed restriction',
    provisioned: 'Provisioned in the working time table',
    status: 'Status',
    draft: 'Draft',
    refused: 'Refused',
  },
  hi: {
    ariaLabel: 'समय–दूरी डायग्राम: {trains} ट्रेन पथ, दिन {day} पर {blocks} block',
    coa: 'COA corridor block',
    tsr: 'TSR',
    blk: 'BLK',
    disc: 'DISC',
    now: 'अभी',
    vb: 'वंदे भारत',
    prem: 'राजधानी / शताब्दी',
    pass: 'मेल / एक्सप्रेस / पैसेंजर',
    goods: 'मालगाड़ी / पार्सल',
    blockTms: 'सिविल block',
    blockSmms: 'S&T block',
    blockTdms: 'TRD block',
    blockJoint: 'संयुक्त block',
    proposed: 'प्रस्तावित',
    granted: 'स्वीकृत',
    locked: 'लॉक',
    baseline: 'Baseline block',
    freeWindow: 'खाली headway विंडो',
    tsrBand: 'TSR बैंड',
    nowCursor: 'वर्तमान समय',
    dragHint: 'block विंडो आज़माने के लिए डायग्राम पर खींचें',
    trainsAffected: 'प्रभावित ट्रेनें',
    weightedDelay: 'भारित विलंब',
    workItems: 'कार्य',
    workItem: 'कार्य',
    both: 'दोनों लाइनें',
    section: 'सेक्शन',
    freeWindowTip: 'खाली headway विंडो',
    clickToTry: 'यहाँ block आज़माने के लिए क्लिक करें',
    baselineTip: 'Baseline (नियम-आधारित) block',
    tonnes: 'टन',
    speedLimit: 'गति प्रतिबंध',
    provisioned: 'working time table में प्रावधानित',
    status: 'स्थिति',
    draft: 'ड्राफ्ट',
    refused: 'अस्वीकृत',
  },
} as const;

/* ── Component ──────────────────────────────────────────────── */

export function StringDiagram({ corridor, trains, blocks, day, dow, corridorBlocks, freeWindows = [], tsrs = [], nowMinute, layers, baselineBlocks = [], highlightSection = null, height = 460, onBlockClick, onWindowSelect, legend = true }: StringDiagramProps) {
  const t = useT(strings);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitsRef = useRef<Hit[]>([]);
  const geoRef = useRef<Geometry>({ W: 0, H: height, iw: 1, ih: 1, lengthKm: 1 });
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ x0: number; y: number; sectionIndex: number; moved: boolean; pointerId: number } | null>(null);
  const [width, setWidth] = useState(0);
  const [themeTick, setThemeTick] = useState(0);
  const [tip, setTip] = useState<Tip | null>(null);
  const [hover, setHover] = useState<Hit['type'] | null>(null);
  const [sel, setSel] = useState<{ x0: number; x1: number; y0: number; y1: number; start: number; end: number } | null>(null);

  const mergedLayers = useMemo<StringDiagramLayers>(() => ({ ...DEFAULT_LAYERS, ...(layers ?? {}) }), [layers]);

  /* size: follow the container; theme: follow data-theme */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0]?.contentRect.width ?? el.clientWidth);
      setWidth((prev) => (prev === w ? prev : w));
    });
    ro.observe(el);
    setWidth(Math.floor(el.clientWidth));
    const mo = new MutationObserver(() => setThemeTick((n) => n + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  /* draw on every change */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width < 40) return;
    const W = width;
    const H = Math.max(160, height);
    canvas.style.height = `${H}px`;
    const { hits, geo } = draw(canvas, W, H, {
      corridor,
      trains,
      blocks,
      baselineBlocks,
      day,
      dow,
      corridorBlocks,
      freeWindows,
      tsrs,
      nowMinute,
      layers: mergedLayers,
      highlightSection,
      labels: { coa: t('coa'), tsr: t('tsr'), blk: t('blk'), disc: t('disc'), now: t('now') },
    });
    hitsRef.current = hits;
    geoRef.current = geo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, themeTick, corridor, trains, blocks, baselineBlocks, day, dow, corridorBlocks, freeWindows, tsrs, nowMinute, mergedLayers, highlightSection, t]);

  /* hit test at canvas-local coordinates */
  const hitAt = useCallback((x: number, y: number): Hit | null => {
    const hits = hitsRef.current;
    for (const h of hits) if (h.type === 'block' && inBox(x, y, h.box)) return h;
    let best = 5;
    let found: Hit | null = null;
    for (const h of hits) {
      if (h.type !== 'train') continue;
      for (let i = 0; i < h.pts.length - 1; i++) {
        const d = distToSeg(x, y, h.pts[i], h.pts[i + 1]);
        if (d < best) {
          best = d;
          found = h;
        }
      }
    }
    if (found) return found;
    for (const h of hits) if (h.type !== 'train' && h.type !== 'block' && inBox(x, y, h.box)) return h;
    return null;
  }, []);

  const minuteAt = useCallback((x: number) => {
    const { iw } = geoRef.current;
    const m = ((x - PAD_L) / Math.max(1, iw)) * MIN_PER_DAY;
    return Math.max(0, Math.min(MIN_PER_DAY, Math.round(m / SNAP_MIN) * SNAP_MIN));
  }, []);

  const sectionAt = useCallback((y: number): number | null => {
    const { ih, lengthKm } = geoRef.current;
    const km = ((y - PAD_T) / Math.max(1, ih)) * lengthKm;
    const s = corridor.blockSections.find((sec) => km >= sec.startKm && km <= sec.endKm);
    return s ? s.index : null;
  }, [corridor]);

  const local = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /* hover — throttled to one hit test per animation frame */
  const flushHover = useCallback(() => {
    rafRef.current = null;
    const p = pendingRef.current;
    if (!p) return;
    const d = dragRef.current;
    if (d) {
      const { iw, ih, lengthKm } = geoRef.current;
      if (Math.abs(p.x - d.x0) > 4) d.moved = true;
      const sec = corridor.blockSections[d.sectionIndex];
      if (sec && d.moved) {
        const a = Math.min(d.x0, p.x);
        const b = Math.max(d.x0, p.x);
        const x0 = Math.max(PAD_L, a);
        const x1 = Math.min(PAD_L + iw, b);
        const y0 = PAD_T + (sec.startKm / lengthKm) * ih;
        const y1 = PAD_T + (sec.endKm / lengthKm) * ih;
        setSel({ x0, x1, y0, y1, start: minuteAt(x0), end: minuteAt(x1) });
        setTip(null);
      }
      return;
    }
    const h = hitAt(p.x, p.y);
    setHover(h ? h.type : null);
    setTip(h ? { x: p.x, y: p.y, hit: h } : null);
  }, [corridor, hitAt, minuteAt]);

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    pendingRef.current = local(e);
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(flushHover);
  };

  const onPointerLeave = () => {
    pendingRef.current = null;
    if (!dragRef.current) {
      setTip(null);
      setHover(null);
    }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const { x, y } = local(e);
    const h = hitAt(x, y);
    if (h?.type === 'block') return; // click handled on pointer-up
    if (!onWindowSelect) {
      // touch: tap shows the tooltip
      if (e.pointerType !== 'mouse') {
        setTip(h ? { x, y, hit: h } : null);
        setHover(h ? h.type : null);
      }
      return;
    }
    const sectionIndex = sectionAt(y);
    if (sectionIndex === null || x < PAD_L || x > geoRef.current.W - PAD_R) return;
    dragRef.current = { x0: x, y, sectionIndex, moved: false, pointerId: e.pointerId };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
  };

  const finishDrag = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setSel(null);
    if (!d) return false;
    if (!d.moved || !onWindowSelect) return false;
    const { x } = local(e);
    const a = Math.min(d.x0, x);
    const b = Math.max(d.x0, x);
    const start = minuteAt(a);
    const end = minuteAt(b);
    if (end - start >= SNAP_MIN) onWindowSelect({ sectionIndex: d.sectionIndex, start, end });
    return true;
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const dragged = finishDrag(e);
    if (dragged) return;
    const { x, y } = local(e);
    const h = hitAt(x, y);
    if (h?.type === 'block' && onBlockClick) onBlockClick(h.block);
    else if (h?.type === 'window' && onWindowSelect) onWindowSelect({ sectionIndex: h.win.sectionIndex, start: h.win.start, end: h.win.end });
  };

  const onPointerCancel = () => {
    dragRef.current = null;
    setSel(null);
  };

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  /* tooltip placement inside the stage */
  const tipStyle = useMemo(() => {
    if (!tip) return undefined;
    const { W, H } = geoRef.current;
    const left = tip.x + 14 + 280 > W ? Math.max(0, tip.x - 294) : tip.x + 14;
    const top = tip.y + 12 + 96 > H ? Math.max(0, tip.y - 100) : tip.y + 12;
    return { left, top };
  }, [tip]);

  const canvasClass = ['sd-canvas', onWindowSelect ? 'sd-selectable' : '', hover === 'block' && onBlockClick ? 'sd-hit' : '', sel ? 'sd-dragging' : ''].filter(Boolean).join(' ');
  const dayBlocks = blocks.filter((b) => b.day === day && statusOf(b) !== 'REFUSED').length;
  const hasJoint = blocks.some((b) => b.day === day && b.departments.length > 1);

  return (
    <div className="sd" data-tour="string-diagram">
      <div className="sd-stage" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className={canvasClass}
          role="img"
          aria-label={t('ariaLabel', { trains: trains.length, blocks: dayBlocks, day: day + 1 })}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        />
        {sel && (
          <div className="sd-sel" style={{ left: sel.x0, width: Math.max(1, sel.x1 - sel.x0), top: sel.y0, height: Math.max(1, sel.y1 - sel.y0) }}>
            <span className="sd-sel-label num">{hhmm(sel.start)}–{hhmm(sel.end)} · {duration(sel.end - sel.start)}</span>
          </div>
        )}
        {tip && tipStyle && (
          <div className="sd-tip" style={tipStyle} role="tooltip">
            <TipBody hit={tip.hit} corridor={corridor} t={t} canSelect={!!onWindowSelect} />
          </div>
        )}
      </div>
      {legend && (
        <div className="sd-legend" aria-hidden="true">
          {mergedLayers.passenger && (
            <>
              <span><i className="sd-sw sd-sw-vb" />{t('vb')}</span>
              <span><i className="sd-sw sd-sw-prem" />{t('prem')}</span>
              <span><i className="sd-sw sd-sw-pass" />{t('pass')}</span>
            </>
          )}
          {mergedLayers.goods && <span><i className="sd-sw sd-sw-goods" />{t('goods')}</span>}
          <i className="sd-sep" />
          {mergedLayers.blocks && (
            <>
              <span><i className="sd-box sd-box-tms" />{t('blockTms')}</span>
              <span><i className="sd-box sd-box-smms" />{t('blockSmms')}</span>
              <span><i className="sd-box sd-box-tdms" />{t('blockTdms')}</span>
              {hasJoint && <span><i className="sd-box sd-box-joint" />{t('blockJoint')}</span>}
              <span><i className="sd-box sd-box-proposed" />{t('proposed')}</span>
              <span><i className="sd-box sd-box-granted" />{t('granted')}</span>
              <span><i className="sd-box sd-box-locked" />{t('locked')}</span>
            </>
          )}
          {mergedLayers.baseline && <span><i className="sd-box sd-box-baseline" />{t('baseline')}</span>}
          <span><i className="sd-box sd-box-coa" />{t('coa')}</span>
          {mergedLayers.freeWindows && <span><i className="sd-box sd-box-free" />{t('freeWindow')}</span>}
          {mergedLayers.tsr && <span><i className="sd-box sd-box-tsr" />{t('tsrBand')}</span>}
          {nowMinute !== undefined && <span><i className="sd-sw sd-sw-now" />{t('nowCursor')}</span>}
          {onWindowSelect && (
            <>
              <i className="sd-sep" />
              <span className="dim">{t('dragHint')}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Tooltip body ───────────────────────────────────────────── */

type T = ReturnType<typeof useT<keyof typeof strings.en>>;

function statusText(status: string, t: T): string {
  switch (status) {
    case 'GRANTED': return t('granted');
    case 'LOCKED': return t('locked');
    case 'REFUSED': return t('refused');
    case 'PROPOSED': return t('proposed');
    default: return t('draft');
  }
}

function TipBody({ hit, corridor, t, canSelect }: { hit: Hit; corridor: Corridor; t: T; canSelect: boolean }) {
  switch (hit.type) {
    case 'train': {
      const tr = hit.train;
      return (
        <>
          <b className="num">{tr.number}</b> {tr.name}
          <div className="sd-tip-sub">
            {tr.classLabel} · {tr.line} · {tr.origin} <span className="num">{hhmm(tr.dep)}</span> → {tr.destination} <span className="num">{hhmm(tr.arr)}</span>
          </div>
          {tr.tonnage ? (
            <div className="sd-tip-sub num">{num(tr.tonnage)} {t('tonnes')}{tr.loco ? ` · ${tr.loco}` : ''}{tr.commodity ? ` · ${tr.commodity}` : ''}</div>
          ) : null}
        </>
      );
    }
    case 'block': {
      const b = hit.block;
      const n = b.tasks.length;
      return (
        <>
          <b className="num">{b.id}</b> · {b.kind} · {b.line === 'BOTH' ? t('both') : b.line}
          <div className="sd-tip-sub">
            {b.sectionText} · <span className="num">{b.startText}–{b.endText}</span> ({duration(b.spanMin)})
          </div>
          <div className="sd-tip-sub">
            {b.departments.join(' + ')} · <span className="num">{n}</span> {n === 1 ? t('workItem') : t('workItems')}
          </div>
          <div className="sd-tip-sub">
            {t('trainsAffected')} <span className="num">{b.affectedTrains.length}</span> · {t('weightedDelay')} <span className="num">{Math.round(b.weightedDelayMin)}</span> min
          </div>
          <div className="sd-tip-sub">{t('status')}: {statusText(statusOf(b), t)}</div>
        </>
      );
    }
    case 'baseline': {
      const b = hit.block;
      return (
        <>
          <b>{t('baselineTip')}</b>
          <div className="sd-tip-sub">
            {b.sectionText} · <span className="num">{b.startText}–{b.endText}</span> · {b.departments.join(' + ')}
          </div>
        </>
      );
    }
    case 'window': {
      const w = hit.win;
      const s = corridor.blockSections[w.sectionIndex];
      return (
        <>
          <b>{t('freeWindowTip')}</b>
          <div className="sd-tip-sub">
            {s?.label ?? `${t('section')} ${w.sectionIndex}`} · {w.line ?? t('both')} · <span className="num">{hhmm(w.start)}–{hhmm(w.end)}</span> ({duration(w.end - w.start)})
          </div>
          {canSelect && <div className="sd-tip-sub">{t('clickToTry')}</div>}
        </>
      );
    }
    case 'tsr': {
      const x = hit.tsr;
      return (
        <>
          <b>{t('speedLimit')} <span className="num">{x.kmph}</span> km/h</b>
          <div className="sd-tip-sub">
            {kmRange(x.fromKm, x.toKm)}{x.line && x.line !== 'BOTH' ? ` · ${x.line}` : ''}
          </div>
          {x.label && <div className="sd-tip-sub">{x.label}</div>}
        </>
      );
    }
    case 'coa': {
      const cb = hit.cb;
      return (
        <>
          <b>{t('coa')} · {cb.line}</b>
          <div className="sd-tip-sub">
            <span className="num">{cb.start}–{cb.end}</span> · {kmRange(cb.fromKm, cb.toKm)}
          </div>
          <div className="sd-tip-sub">{t('provisioned')}</div>
        </>
      );
    }
    default:
      return null;
  }
}

export default StringDiagram;
