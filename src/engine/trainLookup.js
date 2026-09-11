/**
 * SAMANVAY train itinerary lookup & halts engine.
 * Searches and models full train runs across the corridor WTT and FOIS timetable,
 * station halts, block section passages, and maintenance blocks crossed.
 * Pure isomorphic ES module.
 */
import { positionAt } from './livePosition.js';
import { minToHHMM } from './time.js';

/**
 * Searches trains in timetable by query string (train number, name, or station code).
 */
export function searchTrains(timetable = [], query = '') {
  const q = String(query).trim().toLowerCase();
  if (!q) return timetable.slice(0, 25);

  return timetable.filter((t) => {
    const num = String(t.number || '').toLowerCase();
    const name = String(t.name || '').toLowerCase();
    const cls = String(t.cls || '').toLowerCase();
    const origin = String(t.origin || '').toLowerCase();
    const dest = String(t.destination || '').toLowerCase();
    return num.includes(q) || name.includes(q) || cls.includes(q) || origin.includes(q) || dest.includes(q);
  }).slice(0, 30);
}

/**
 * Gets detailed itinerary for a specific train, including halts, passages,
 * live position at timeMin, and maintenance blocks that intersect its path.
 */
export function getTrainItinerary(train, corridor, plan = null, timeMin = 720) {
  if (!train) return null;

  const halts = (train.times || []).map((t, idx) => ({
    stationCode: t.code,
    km: t.km,
    arrMin: t.arr,
    depMin: t.dep,
    arrTime: minToHHMM(t.arr),
    depTime: minToHHMM(t.dep),
    haltMin: t.dep - t.arr,
    isOrigin: idx === 0,
    isDestination: idx === (train.times.length - 1)
  }));

  const passages = (train.passages || []).map((p) => {
    const sec = corridor.blockSections[p.sectionIndex] || { label: `Section ${p.sectionIndex}`, startKm: 0, endKm: 0 };
    return {
      sectionIndex: p.sectionIndex,
      sectionLabel: sec.label,
      startKm: sec.startKm,
      endKm: sec.endKm,
      enterMin: p.enter,
      exitMin: p.exit,
      enterTime: minToHHMM(p.enter),
      exitTime: minToHHMM(p.exit),
      transitMin: p.exit - p.enter
    };
  });

  // Calculate live position at current scrubber minute
  const blocks = plan && plan.blocks ? plan.blocks : [];
  const live = positionAt(train, corridor, timeMin, blocks);

  // Identify any planned blocks on the corridor that intersect this train's journey
  const intersectingBlocks = [];
  if (plan && plan.blocks) {
    for (const b of plan.blocks) {
      if (b.line !== 'BOTH' && b.line !== train.line) continue;
      // Check section overlap
      const trainSections = new Set((train.passages || []).map((p) => p.sectionIndex));
      const hasSectionOverlap = b.sections.some((s) => trainSections.has(s));
      if (!hasSectionOverlap) continue;

      // Check time overlap with train journey
      const trainStart = train.times[0]?.dep ?? 0;
      const trainEnd = train.times[train.times.length - 1]?.arr ?? 1440;
      if (Math.max(trainStart, b.start) < Math.min(trainEnd, b.end)) {
        intersectingBlocks.push({
          blockId: b.id,
          day: b.day,
          line: b.line,
          sectionText: b.sectionText,
          spanMin: b.spanMin,
          window: `${b.startText}–${b.endText}`,
          kind: b.kind,
          departments: b.departments
        });
      }
    }
  }

  return {
    train,
    trainNo: train.number,
    name: train.name,
    cls: train.cls,
    classLabel: train.classLabel || train.cls,
    line: train.line,
    premium: !!train.premium,
    origin: train.origin || (train.times[0] ? train.times[0].code : 'NDLS'),
    destination: train.destination || (train.times[train.times.length - 1] ? train.times[train.times.length - 1].code : 'CNB'),
    halts,
    passages,
    live,
    intersectingBlocks
  };
}
