/**
 * SAMANVAY execution log and possession closure engine.
 * Tracks actual vs planned possession execution, learns actual machine
 * and gang durations, and computes plan adherence metrics.
 * Pure isomorphic ES module.
 */

/**
 * Updates or adds an execution record for a block.
 */
export function recordExecution(executionLog = [], record) {
  const existingIndex = executionLog.findIndex((e) => e.blockId === record.blockId);
  const now = new Date();
  const timeStr = now.toTimeString().slice(0, 5);

  const updatedRecord = {
    ...record,
    updatedAt: timeStr,
    timestamp: now.toISOString()
  };

  const newLog = [...executionLog];
  if (existingIndex >= 0) {
    newLog[existingIndex] = { ...newLog[existingIndex], ...updatedRecord };
  } else {
    newLog.push(updatedRecord);
  }
  return newLog;
}

/**
 * Computes plan adherence and execution statistics from execution records.
 */
export function computeExecutionMetrics(executionLog = [], plannedBlocks = []) {
  if (!executionLog || executionLog.length === 0) {
    return {
      totalExecuted: 0,
      adherenceRate: 1.0,
      totalOverrunMin: 0,
      completedBlocks: 0,
      inProgressBlocks: 0,
      overrunCauses: []
    };
  }

  let plannedMinSum = 0;
  let actualMinSum = 0;
  let overrunMinSum = 0;
  let completed = 0;
  let inProgress = 0;
  const causesMap = {};

  for (const exec of executionLog) {
    if (exec.status === 'IN_PROGRESS') inProgress++;
    if (exec.status === 'COMPLETED' || exec.status === 'CLOSED') {
      completed++;
      const planned = exec.plannedSpanMin || 120;
      const actual = exec.actualSpanMin || planned;
      plannedMinSum += planned;
      actualMinSum += actual;

      if (actual > planned) {
        const diff = actual - planned;
        overrunMinSum += diff;
        const cause = exec.overrunCause || 'Traffic handover delay';
        causesMap[cause] = (causesMap[cause] || 0) + diff;
      }
    }
  }

  const adherence = actualMinSum > 0 ? Math.min(1.0, plannedMinSum / actualMinSum) : 1.0;
  const overrunCauses = Object.entries(causesMap).map(([cause, minutes]) => ({ cause, minutes }));

  return {
    totalExecuted: executionLog.length,
    completedBlocks: completed,
    inProgressBlocks: inProgress,
    adherenceRate: Math.round(adherence * 100) / 100,
    totalPlannedMin: plannedMinSum,
    totalActualMin: actualMinSum,
    totalOverrunMin: overrunMinSum,
    overrunCauses
  };
}
