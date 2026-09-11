/**
 * SAMANVAY operational event models for state transitions.
 * Pure isomorphic ES module.
 */

export const EVENT_TYPES = {
  DISPATCH_MACHINE: 'DISPATCH_MACHINE',
  TRIP_FEEDER: 'TRIP_FEEDER',
  APPROVE_PLAN: 'APPROVE_PLAN',
  GRANT_BLOCK: 'GRANT_BLOCK',
  LOCK_BLOCK: 'LOCK_BLOCK',
  START_POSSESSION: 'START_POSSESSION',
  COMPLETE_WORK: 'COMPLETE_WORK',
  CLEAR_POSSESSION: 'CLEAR_POSSESSION',
  SUBMIT_DEMAND: 'SUBMIT_DEMAND'
};

export function createOperationalEvent(type, payload = {}, role = 'CONTROLLER') {
  const now = new Date();
  const timeStr = now.toTimeString().slice(0, 5);
  return {
    id: `EVT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    type,
    payload,
    role,
    time: timeStr,
    timestamp: now.toISOString()
  };
}
