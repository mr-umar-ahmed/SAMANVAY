/**
 * SAMANVAY Planned Block Passenger & Freight Advisory Generator.
 * Creates clean public bulletins for PRS / NTES and FOIS without fake telemetry.
 * Pure isomorphic ES module.
 *
 * Bulletin numbers are derived from the block id (stableHash), not a running
 * sequence, so a bulletin keeps its number when other blocks are added,
 * refused or moved.
 */
import { stableHash } from './time.js';

/** ISO week number of a yyyy-mm-dd date (bulletins are numbered by week). */
function isoWeekOf(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return { year: 0, week: 0 };
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { year: d.getUTCFullYear(), week: Math.ceil(((d - yearStart) / 86400000 + 1) / 7) };
}

export function generateBlockAdvisories(weeklyResult, corridor) {
  const blocks = weeklyResult?.ai?.blocks || [];
  const advisories = [];

  for (const b of blocks) {
    if (!b.lineClosure && b.affectedTrains.length === 0) continue;

    const trainNotices = (b.affectedTrains || []).map((t) => ({
      trainNo: t.number || t.id,
      name: t.name || 'Train',
      cls: t.cls || 'EXP',
      expectedDelayMin: t.delayMin ?? 0,
      impactType: t.mode === 'REGULATED' ? 'Regulated at previous junction' : 'Single-Line Working (SLW) speed restriction'
    }));

    const wk = isoWeekOf(b.date);
    const ref = stableHash(`ADV|${b.id}`, 5);
    advisories.push({
      id: `ADV-${ref}`,
      bulletinNo: `IR/SAMANVAY/${corridor.code.replace(/–/g, '-')}/${wk.year}-W${String(wk.week).padStart(2, '0')}-${ref}`,
      blockId: b.id,
      day: b.day,
      dateLabel: b.dateLabel || `Day ${b.day}`,
      window: `${b.startText}–${b.endText} (${b.spanMin} min)`,
      sectionText: b.sectionText,
      line: b.line,
      workKind: b.kind,
      departments: b.departments.join(' + '),
      affectedTrainsCount: trainNotices.length,
      trainNotices,
      isNoticeCompliant: true,
      publicMessage: trainNotices.length > 0
        ? `Traffic regulation on ${b.sectionText} (${b.line} line) from ${b.startText} to ${b.endText}. ${trainNotices.length} train(s) will observe regulated speed or terminal re-timings.`
        : `Track maintenance window on ${b.sectionText} from ${b.startText} to ${b.endText}. All scheduled passenger services running on path.`
    });
  }

  return advisories;
}

export function advisoriesToCsv(advisories) {
  const cols = ['bulletinNo', 'blockId', 'dateLabel', 'window', 'sectionText', 'line', 'workKind', 'departments', 'affectedTrainsCount', 'publicMessage'];
  const lines = [cols.join(',')];
  for (const a of advisories) {
    lines.push(cols.map((k) => JSON.stringify(a[k] ?? '')).join(','));
  }
  return lines.join('\n');
}
