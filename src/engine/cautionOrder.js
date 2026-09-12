/**
 * SAMANVAY Caution Order & TSR desk generator.
 * Produces deterministic Indian Railways Form T/409 / T/409B Caution Orders
 * and Form T/351 S&T Disconnection Memos grounded in real tasks and planned blocks.
 * Pure isomorphic ES module.
 *
 * Numbering: every order / notice number is derived from its content (task id,
 * block id + task ids, TSR id) with stableHash, never from a running sequence,
 * so the same order keeps the same number — and the status recorded against
 * that number (ISSUED, acknowledgements …) — across re-plans and across days.
 */
import { stableHash } from './time.js';

/** Corridor code usable inside a form number ("NDLS–CNB" → "NDLS-CNB"). */
export function corridorTag(corridor) {
  return String(corridor?.code ?? 'CORR').replace(/–/g, '-');
}

/** T/409 number for a speed restriction from the register (one per work, independent of the lifting block). */
export function registerOrderNo(corridor, taskId) {
  return `T/409/${corridorTag(corridor)}/${stableHash(`T409|${taskId}`, 6)}`;
}

/** T/409 number for a manual / emergency TSR recorded by Control or the field. */
export function manualOrderNo(corridor, tsrId) {
  return `T/409/${corridorTag(corridor)}/M-${stableHash(`T409M|${tsrId}`, 6)}`;
}

/** T/409B number for the post-machine-work restriction of one block (block id + the machine works in it). */
export function postWorkOrderNo(corridor, blockId, taskIds) {
  return `T/409B/${corridorTag(corridor)}/${stableHash(`T409B|${blockId}|${[...taskIds].sort().join(',')}`, 6)}`;
}

/** T/351 number for one S&T work disconnected in one block. */
export function disconnectionNoticeNo(corridor, blockId, taskId) {
  return `T/351/${corridorTag(corridor)}/${stableHash(`T351|${blockId}|${taskId}`, 6)}`;
}

const POST_WORK_TYPES = new Set(['TAMPING', 'DEEP_SCREENING']);
/** T/409B drafts only exist once Control has granted (or locked) the block. */
const isGranted = (b) => b.status === 'GRANTED' || b.status === 'LOCKED';

/**
 * Generates all Caution Orders in force for a given corridor and day.
 * `blocks` are working blocks (plan + workflow status); T/409B orders are
 * produced only for GRANTED / LOCKED blocks — never for drafts, proposals or
 * refused blocks.
 */
export function generateCautionOrders(tasks, blocks, corridor, day = 0, _dateIso = '2026-09-07') {
  const orders = [];

  // 1. Caution orders from active TSR tasks in the register
  for (const t of tasks) {
    if (!t.tsrKmph) continue;

    // Find the (non-refused) block scheduled to lift this TSR (if any)
    const liftingBlock = blocks.find((b) => b.status !== 'REFUSED' && b.tasks && b.tasks.some((bt) => bt.id === t.id));
    const liftingDay = liftingBlock ? liftingBlock.day : null;
    const isLiftingToday = liftingDay === day;

    // Time lost by one train running through the restriction: restricted length
    // (+1 km for braking / re-acceleration) at the TSR speed instead of line speed.
    const lenKm = Math.max(0.5, (t.lengthKm || 0) + 1.0);
    const tsrLoss = (cls) => {
      const v = Math.min(corridor.mpsKmph, cls === 'GOODS' ? 65 : 110);
      return Math.max(0, Math.round((lenKm / t.tsrKmph) * 60 + 2.5 - (lenKm / v) * 60));
    };
    const affectedTrains = (liftingBlock ? liftingBlock.affectedTrains : []).map((tr) => ({
      trainNo: tr.number || tr.id,
      name: tr.name || 'Train',
      cls: tr.cls || 'EXP',
      estDelayMin: tsrLoss(tr.cls)
    }));

    const orderNo = registerOrderNo(corridor, t.id);
    orders.push({
      id: `CO-${stableHash(orderNo, 6)}`,
      orderNo,
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
  }

  // 2. Post-work speed restrictions imposed upon lifting heavy track machine blocks (tamping / screening),
  //    only for blocks Control has granted or locked.
  for (const b of blocks.filter((x) => x.day === day && isGranted(x))) {
    const machineWorks = (b.tasks || []).filter((t) => POST_WORK_TYPES.has(t.workType));
    if (!machineWorks.length) continue;
    const orderNo = postWorkOrderNo(corridor, b.id, machineWorks.map((t) => t.id));
    orders.push({
      id: `CO-${stableHash(orderNo, 6)}`,
      orderNo,
      formType: 'T/409B',
      formTitle: 'Reminder Caution Order (Form T/409B - Post Machine Work)',
      taskId: null,
      taskIds: machineWorks.map((t) => t.id),
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
      affectedTrains: (b.affectedTrains || []).map((tr) => ({ trainNo: tr.number || tr.trainNo || tr.id, name: tr.name || 'Train', cls: tr.cls || 'EXP', estDelayMin: tr.delayMin ?? tr.estDelayMin ?? 0 }))
    });
  }

  return orders;
}

/**
 * Generates S&T Disconnection Notices (Form T/351) for signalling tasks.
 */
export function generateDisconnectionNotices(tasks, blocks, corridor, day = 0, _dateIso = '2026-09-07') {
  const notices = [];

  for (const b of blocks.filter((x) => x.day === day && x.status !== 'REFUSED')) {
    const stTasks = (b.tasks || []).filter((t) => t.dept === 'SMMS' || t.blockKind === 'DISCONNECTION');
    for (const t of stTasks) {
      // numbered by block and work so a notice keeps its number (and status) across re-plans
      const noticeNo = disconnectionNoticeNo(corridor, b.id, t.id);
      const src = tasks.find((x) => x.id === t.id);
      notices.push({
        id: `DISC-${stableHash(noticeNo, 6)}`,
        noticeNo,
        formType: 'T/351',
        formTitle: 'Signal Disconnection / Reconnection Notice (Form T/351)',
        blockId: b.id,
        taskId: t.id,
        gear: t.label,
        section: t.sectionLabel || src?.sectionLabel || b.sectionText,
        startKm: t.startKm,
        endKm: t.endKm,
        disconnectionTime: b.startText,
        reconnectionTime: b.endText,
        safetyAssurance: 'Facing point lock and crank handle secured in normal position under station master supervision',
        inCharge: 'Sectional Engineer (Signal)',
        stationMasterAcknowledge: isGranted(b) ? 'Block granted — acknowledge on disconnection' : 'Pending grant'
      });
    }
  }

  return notices;
}
