import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CORRIDORS } from '../src/engine/corridors.js';
import { generateCautionOrders, generateDisconnectionNotices } from '../src/engine/cautionOrder.js';

test('caution orders are generated deterministically from TSR tasks', () => {
  const corridor = CORRIDORS[0];
  const mockTasks = [
    { id: 'TSR-01', label: 'Rail weld flaw', workType: 'USFD_OBS_RAIL', sectionLabel: 'NDLS–GZB', sections: [0], line: 'DN', startKm: 12, endKm: 13, tsrKmph: 30, tsrSinceDays: 2 },
    { id: 'TASK-02', label: 'Ordinary routine inspection', workType: 'USFD_OBS_RAIL', sectionLabel: 'GZB–KRJ', sections: [1], line: 'UP', startKm: 40, endKm: 41, tsrKmph: null }
  ];
  const mockBlocks = [
    { id: 'BLK-01', day: 0, startText: '10:00', endText: '12:00', sectionText: 'NDLS–GZB', sections: [0], line: 'DN', tasks: [mockTasks[0]], affectedTrains: [] }
  ];

  const orders = generateCautionOrders(mockTasks, mockBlocks, corridor, 0);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].formType, 'T/409');
  assert.equal(orders[0].speedKmph, 30);
  assert.equal(orders[0].liftingBlockId, 'BLK-01');
  assert.equal(orders[0].isLiftingToday, true);

  const notices = generateDisconnectionNotices([
    { id: 'SIG-01', dept: 'SMMS', blockKind: 'DISCONNECTION', label: 'Point machine overhaul', sectionLabel: 'NDLS yard', startKm: 0, endKm: 1 }
  ], [{
    id: 'BLK-02', day: 0, startText: '14:00', endText: '15:30', line: 'DN', tasks: [{ id: 'SIG-01', dept: 'SMMS', blockKind: 'DISCONNECTION', label: 'Point machine overhaul' }]
  }], corridor, 0);

  assert.equal(notices.length, 1);
  assert.equal(notices[0].formType, 'T/351');
  assert.equal(notices[0].blockId, 'BLK-02');
});
