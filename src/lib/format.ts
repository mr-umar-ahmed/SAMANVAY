/** Formatting helpers shared by every page. */
import type { Dept, Line, Urgency } from '../engine/types';

export const MIN_PER_DAY = 1440;

export function hhmm(min: number): string {
  const m = ((Math.round(min) % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function toMin(hhmmStr: string): number {
  const [h, m] = hhmmStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function duration(min: number): string {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  if (r === 0) return `${h} h`;
  return `${h} h ${String(r).padStart(2, '0')} min`;
}

export function kmRange(a: number, b: number): string {
  if (Math.abs(a - b) < 0.05) return `km ${a.toFixed(1)}`;
  return `km ${a.toFixed(1)} – ${b.toFixed(1)}`;
}

export function pct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)} %`;
}

export function pts(v: number, digits = 2): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)} pts`;
}

export function signed(v: number, digits = 0, unit = ''): string {
  const s = v > 0 ? '+' : '';
  return `${s}${v.toFixed(digits)}${unit}`;
}

export function num(v: number, digits = 0): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
}

export function rupees(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(1)} L`;
  return `${sign}₹${num(Math.round(abs))}`;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${DAY_NAMES[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
}

export function dateLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function clockIST(d = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
}

/** Minute of the day in IST, for "now" markers on diagrams. */
export function nowMinuteIST(d = new Date()): number {
  const s = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return toMin(s);
}

export const DEPT_LABEL: Record<Dept, { long: string; short: string; system: string; officer: string }> = {
  TMS: { long: 'Civil Engineering (P-Way)', short: 'Civil', system: 'TMS', officer: 'Sr. DEN' },
  SMMS: { long: 'Signal & Telecom', short: 'S&T', system: 'SMMS', officer: 'Sr. DSTE' },
  TDMS: { long: 'Traction Distribution (OHE)', short: 'TRD', system: 'TDMS', officer: 'Sr. DEE' },
};

export const DEPT_CLASS: Record<Dept, string> = { TMS: 'tms', SMMS: 'smms', TDMS: 'tdms' };

export function lineLabel(line: Line): string {
  return line === 'BOTH' ? 'Both lines' : `${line} line`;
}

export const URGENCY_TONE: Record<Urgency, 'crit' | 'warn' | 'info' | 'gray'> = { IMMEDIATE: 'crit', HIGH: 'warn', TACTICAL: 'info', STRATEGIC: 'gray' };
export const URGENCY_LABEL: Record<Urgency, string> = { IMMEDIATE: 'Immediate (≤ 24 h)', HIGH: 'High (≤ 72 h)', TACTICAL: 'Tactical (this week)', STRATEGIC: 'Strategic (RBP)' };

export function arciTone(a: number): 'crit' | 'warn' | 'info' | 'ok' {
  if (a >= 0.85) return 'crit';
  if (a >= 0.65) return 'warn';
  if (a >= 0.4) return 'info';
  return 'ok';
}

export function classLabel(cls: string): string {
  return { VB: 'Vande Bharat', RAJ: 'Rajdhani / Duronto', SHT: 'Shatabdi / Tejas', SF: 'Superfast', EXP: 'Mail / Express', PASS: 'Passenger / MEMU', GOODS: 'Goods', PARCEL: 'Parcel' }[cls] ?? cls;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function download(filename: string, content: string, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
