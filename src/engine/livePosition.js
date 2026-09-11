/**
 * SAMANVAY live train position engine.
 * Computes deterministic train positions, speeds, next station halts,
 * and block collisions at any given minute (0..1440) across the corridor.
 * Pure isomorphic ES module — runs in Node, Worker, or Browser.
 */
import { latLngAtKm, sectionAtKm } from './corridors.js';
import { minToHHMM } from './time.js';

/**
 * Calculates current position and state of a single train at minute `timeMin`.
 * @param {Object} train Timetable or freight train object
 * @param {Object} corridor Corridor definition
 * @param {number} timeMin Minute of day (0..1440)
 * @param {Array} blocks Active blocks for this day
 * @returns {Object|null} Position descriptor or null if not currently running
 */
export function positionAt(train, corridor, timeMin, blocks = []) {
  if (!train.times || train.times.length === 0) return null;

  const first = train.times[0];
  const last = train.times[train.times.length - 1];

  const startMin = first.arr !== undefined ? first.arr : first.dep;

  // Train hasn't formed/departed yet or has already arrived
  if (timeMin < startMin || timeMin > last.arr) {
    return null;
  }

  let currentKm = first.km;
  let currentStation = first.code;
  let nextStation = last.code;
  let isHalted = false;
  let haltStation = null;
  let segmentSpeed = train.speed || 80;

  // Find exact time bracket
  for (let i = 0; i < train.times.length; i++) {
    const st = train.times[i];
    
    // Train currently at station halt
    if (timeMin >= st.arr && timeMin <= st.dep) {
      currentKm = st.km;
      currentStation = st.code;
      isHalted = true;
      haltStation = st.code;
      nextStation = i < train.times.length - 1 ? train.times[i + 1].code : st.code;
      break;
    }

    // Train traveling between station i and i+1
    if (i < train.times.length - 1) {
      const nextSt = train.times[i + 1];
      if (timeMin > st.dep && timeMin < nextSt.arr) {
        const dt = nextSt.arr - st.dep;
        const fraction = dt > 0 ? (timeMin - st.dep) / dt : 0;
        currentKm = st.km + (nextSt.km - st.km) * fraction;
        currentStation = st.code;
        nextStation = nextSt.code;
        const dKm = Math.abs(nextSt.km - st.km);
        if (dt > 0) segmentSpeed = Math.round((dKm / (dt / 60)));
        break;
      }
    }
  }

  const [lat, lng] = latLngAtKm(corridor, currentKm);
  const sec = sectionAtKm(corridor, currentKm);

  // Check if current position coincides with any active block window
  let inBlock = null;
  for (const b of blocks) {
    if (timeMin >= b.start && timeMin <= b.end) {
      const secMatch = b.sections && sec && b.sections.includes(sec.index);
      const lineMatch = b.line === 'BOTH' || b.line === train.line;
      if (secMatch && lineMatch) {
        inBlock = b;
        break;
      }
    }
  }

  return {
    trainId: train.id,
    trainNo: train.number,
    name: train.name,
    cls: train.cls,
    line: train.line,
    premium: !!train.premium,
    origin: train.origin || first.code,
    destination: train.destination || last.code,
    dep: minToHHMM(first.dep),
    arr: minToHHMM(last.arr),
    timeMin,
    km: Math.round(currentKm * 10) / 10,
    lat,
    lng,
    sectionIndex: sec ? sec.index : 0,
    sectionLabel: sec ? sec.label : 'Corridor',
    currentStation,
    nextStation,
    isHalted,
    haltStation,
    speedKmph: isHalted ? 0 : segmentSpeed,
    inBlock: !!inBlock,
    blockId: inBlock ? inBlock.id : null
  };
}

/**
 * Returns all active train positions on the corridor at `timeMin`.
 */
export function livePositions(trains, corridor, timeMin, blocks = []) {
  const positions = [];
  for (const t of trains) {
    const pos = positionAt(t, corridor, timeMin, blocks);
    if (pos) positions.push(pos);
  }
  return positions;
}
