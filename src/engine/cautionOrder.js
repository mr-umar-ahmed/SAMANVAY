/**
 * SAMANVAY Caution Order & TSR desk generator.
 * Produces deterministic Indian Railways Form T/409 / T/409B Caution Orders
 * and Form T/351 S&T Disconnection Memos grounded in real tasks and planned blocks.
 * Pure isomorphic ES module.
 */
import { minToHHMM } from './time.js';

/**
 * Generates all Caution Orders in force for a given corridor and day.
 */
export function generateCautionOrders(tasks, blocks, corridor, day = 0, dateIso = '2026-09-07') {
  const orders = [];
  let seq = 1;

  // 1. Caution orders from active TSR tasks in the register
  for (const t of tasks) {
    if (!t.tsrKmph) continue;

    // Find block scheduled to lift this TSR (if any)
    const liftingBlock = blocks.find((b) => b.tasks && b.tasks.some((bt) => bt.id === t.id));
    const liftingDay = liftingBlock ? liftingBlock.day : null;
    const isLiftingToday = liftingDay === day;

    // Estimate affected trains crossing this section
    const affectedTrains = (liftingBlock ? liftingBlock.affectedTrains : []).map((tr) => ({
      trainNo: tr.number || tr.id,
      name: tr.name || 'Train',
      cls: tr.cls || 'EXP',
      estDelayMin: Math.round(15 + (t.lengthKm || 1) * 3)
    }));

    orders.push({
      id: `CO-${String(seq).padStart(3, '0')}`,
      orderNo: `T/409-${corridor.code.replace('–', '-')}-${dateIso.replace(/-/g, '')}-${String(seq).padStart(3, '0')}`,
      formType: 'T/409',
      formTitle: 'Divisional Caution Order (Form T/409)',
      taskId: t.id,
      workType: t.workType,
      reason: t.label,
      section: t.sectionLabel,
      sections: t.sections,
      line: t.line,
      startKm: t.startKm,
      endKm: t.endKm,
      speedKmph: t.tsrKmph,
      normalSpeedKmph: corridor.mpsKmph,
      daysInForce: t.tsrSinceDays !== undefined ? t.tsrSinceDays + day : day + 1,
      validFrom: '00:00',
      validTo: liftingBlock ? `${liftingBlock.endText} (Day ${liftingDay})` : 'Until Cancelled',
      liftingBlockId: liftingBlock ? liftingBlock.id : null,
      liftingDay,
      isLiftingToday,
      issuedBy: 'Sr. DEN (Track) & Section Controller',
      division: corridor.division || 'Division',
      affectedTrains
    });
    seq++;
  }

  // 2. Post-work speed restrictions imposed upon lifting heavy track machine blocks (e.g. tamping)
  for (const b of blocks.filter((x) => x.day === day)) {
    const hasTamping = b.tasks && b.tasks.some((t) => t.workType === 'TAMPING' || t.workType === 'DEEP_SCREENING');
    if (hasTamping) {
      orders.push({
        id: `CO-${String(seq).padStart(3, '0')}`,
        orderNo: `T/409B-${corridor.code.replace('–', '-')}-${dateIso.replace(/-/g, '')}-${String(seq).padStart(3, '0')}`,
        formType: 'T/409B',
        formTitle: 'Reminder Caution Order (Form T/409B - Post Machine Work)',
        taskId: null,
        workType: 'POST_TAMPING_RESTRICTION',
        reason: `Initial speed restriction post-tamping / screening in block ${b.id}`,
        section: b.sectionText,
        sections: b.sections,
        line: b.line,
        startKm: b.startKm || corridor.blockSections[b.sections[0]]?.startKm || 0,
        endKm: b.endKm || corridor.blockSections[b.sections[b.sections.length - 1]]?.endKm || 0,
        speedKmph: 45,
        normalSpeedKmph: corridor.mpsKmph,
        daysInForce: 1,
        validFrom: b.endText,
        validTo: '24:00',
        liftingBlockId: b.id,
        liftingDay: day,
        isLiftingToday: false,
        issuedBy: 'Section Controller / Machine Supervisor',
        division: corridor.division || 'Division',
        affectedTrains: b.affectedTrains || []
      });
      seq++;
    }
  }

  return orders;
}

/**
 * Generates S&T Disconnection Notices (Form T/351) for signalling tasks.
 */
export function generateDisconnectionNotices(tasks, blocks, corridor, day = 0, dateIso = '2026-09-07') {
  const notices = [];
  let seq = 1;

  for (const b of blocks.filter((x) => x.day === day)) {
    const stTasks = (b.tasks || []).filter((t) => t.dept === 'SMMS' || t.blockKind === 'DISCONNECTION');
    for (const t of stTasks) {
      notices.push({
        id: `DISC-${String(seq).padStart(3, '0')}`,
        noticeNo: `T/351-${corridor.code.replace('–', '-')}-${dateIso.replace(/-/g, '')}-${String(seq).padStart(3, '0')}`,
        formType: 'T/351',
        formTitle: 'Signal Disconnection / Reconnection Notice (Form T/351)',
        blockId: b.id,
        taskId: t.id,
        gear: t.label,
        section: t.sectionLabel,
        startKm: t.startKm,
        endKm: t.endKm,
        disconnectionTime: b.startText,
        reconnectionTime: b.endText,
        safetyAssurance: 'Facing point lock and crank handle secured in normal position under station master supervision',
        inCharge: 'Sectional Engineer (Signal)',
        stationMasterAcknowledge: 'Pending grant'
      });
      seq++;
    }
  }

  return notices;
}
