/**
 * SAMANVAY Planned Block Passenger & Freight Advisory Generator.
 * Creates clean public bulletins for PRS / NTES and FOIS without fake telemetry.
 * Pure isomorphic ES module.
 */

export function generateBlockAdvisories(weeklyResult, corridor) {
  const blocks = weeklyResult?.ai?.blocks || [];
  const advisories = [];
  let seq = 1;

  for (const b of blocks) {
    if (!b.lineClosure && b.affectedTrains.length === 0) continue;

    const trainNotices = (b.affectedTrains || []).map((t) => ({
      trainNo: t.number || t.id,
      name: t.name || 'Train',
      cls: t.cls || 'EXP',
      expectedDelayMin: t.delayMin || 15,
      impactType: t.mode === 'REGULATED' ? 'Regulated at previous junction' : 'Single-Line Working (SLW) speed restriction'
    }));

    advisories.push({
      id: `ADV-${String(seq).padStart(3, '0')}`,
      bulletinNo: `IR/SAMANVAY/${corridor.code.replace('–', '-')}/2026-W36-${String(seq).padStart(3, '0')}`,
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
    seq++;
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
