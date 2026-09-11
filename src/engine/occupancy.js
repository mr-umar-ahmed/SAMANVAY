/**
 * Corridor occupancy model.
 *
 * For a given planning day it merges the Working Time Table (trains running on
 * that weekday) with the FOIS goods forecast for that day, and produces, for
 * every (block section, line), the sorted list of train passages. From this
 * the free windows (natural headway gaps) are derived — these are the only
 * places a block can be laid without touching a train path.
 */
import { MIN_PER_DAY } from './time.js';

export function buildDayOccupancy(corridor, feeds, day, planStart) {
  const date = new Date(planStart.getTime());
  date.setDate(date.getDate() + day);
  const dow = date.getDay();
  const occ = {};
  const key = (s, l) => `${s}:${l}`;
  const push = (train, p) => {
    const k = key(p.sectionIndex, train.line);
    if (!occ[k]) occ[k] = [];
    occ[k].push({ enter: p.enter, exit: p.exit, trainId: train.id, number: train.number, name: train.name, cls: train.cls, weight: train.weight, premium: train.premium, source: train.source, line: train.line });
  };
  // A passage [enter, exit) may cross midnight. The part before 24:00 belongs
  // to the day the train departed; the part after belongs to the next day.
  const addSplit = (train, p, dayShift) => {
    const enter = p.enter - dayShift;
    const exit = p.exit - dayShift;
    if (exit <= 0 || enter >= MIN_PER_DAY) return;
    push(train, { sectionIndex: p.sectionIndex, enter: Math.max(0, enter), exit: Math.min(exit, MIN_PER_DAY) });
  };
  for (const t of feeds.timetable) {
    if (t.runsOn[dow]) for (const p of t.passages) addSplit(t, p, 0);
  }
  // trains that departed yesterday and are still on the corridor after midnight
  const prevDow = (dow + 6) % 7;
  for (const t of feeds.timetable) {
    if (t.runsOn[prevDow]) for (const p of t.passages) addSplit(t, p, MIN_PER_DAY);
  }
  for (const f of feeds.freight) {
    if (f.day === day) for (const p of f.passages) addSplit(f, p, 0);
    if (f.day === day - 1) for (const p of f.passages) addSplit(f, p, MIN_PER_DAY);
  }
  for (const k of Object.keys(occ)) occ[k].sort((a, b) => a.enter - b.enter);
  return { day, date, dow, occ, key, corridor };
}

/** Passages for one section/line. */
export function passages(dayOcc, sectionIndex, line) {
  return dayOcc.occ[dayOcc.key(sectionIndex, line)] || [];
}

/**
 * Free windows on one (section, line) with a headway margin on both sides of
 * every train. Returns [{start, end}] with end-start >= minLen.
 */
export function freeWindows(dayOcc, sectionIndex, line, minLen, margin) {
  const ps = passages(dayOcc, sectionIndex, line);
  const out = [];
  let cursor = 0;
  for (const p of ps) {
    const s = p.enter - margin;
    if (s - cursor >= minLen) out.push({ start: cursor, end: s });
    cursor = Math.max(cursor, p.exit + margin);
  }
  if (MIN_PER_DAY - cursor >= minLen) out.push({ start: cursor, end: MIN_PER_DAY });
  return out;
}

/** Intersect two sorted window lists. */
export function intersectWindows(a, b, minLen) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const s = Math.max(a[i].start, b[j].start);
    const e = Math.min(a[i].end, b[j].end);
    if (e - s >= minLen) out.push({ start: s, end: e });
    if (a[i].end < b[j].end) i++;
    else j++;
  }
  return out;
}

/**
 * Free windows common to a set of sections on one line (or on both lines when
 * line === 'BOTH').
 */
export function commonFreeWindows(dayOcc, sections, line, minLen, margin) {
  const lines = line === 'BOTH' ? ['UP', 'DN'] : [line];
  let acc = null;
  for (const l of lines) {
    for (const s of sections) {
      const w = freeWindows(dayOcc, s, l, minLen, margin);
      acc = acc === null ? w : intersectWindows(acc, w, minLen);
      if (!acc.length) return [];
    }
  }
  return acc || [];
}

/** Occupancy summary for heat-maps: trains per hour per section/line. */
export function hourlyLoad(dayOcc, corridor) {
  const rows = [];
  for (const sec of corridor.blockSections) {
    for (const line of corridor.lines) {
      const hours = new Array(24).fill(0);
      for (const p of passages(dayOcc, sec.index, line)) {
        const h0 = Math.max(0, Math.floor(p.enter / 60));
        const h1 = Math.min(23, Math.floor(Math.max(p.enter, p.exit - 1) / 60));
        for (let h = h0; h <= h1; h++) hours[h] += 1;
      }
      rows.push({ section: sec, line, hours });
    }
  }
  return rows;
}
