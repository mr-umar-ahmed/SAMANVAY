import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CORRIDORS } from '../src/engine/corridors.js';
import { generateCautionOrders, generateDisconnectionNotices, manualOrderNo, registerOrderNo } from '../src/engine/cautionOrder.js';

const corridor = CORRIDORS[0];
const mockTasks = [
  { id: 'TSR-01', label: 'Rail weld flaw', workType: 'USFD_OBS_RAIL', sectionLabel: 'NDLS–GZB', sections: [0], line: 'DN', startKm: 12, endKm: 13, tsrKmph: 30, tsrSinceDays: 2 },
  { id: 'TASK-02', label: 'Ordinary routine inspection', workType: 'USFD_OBS_RAIL', sectionLabel: 'GZB–KRJ', sections: [1], line: 'UP', startKm: 40, endKm: 41, tsrKmph: null },
];
const liftBlock = (over = {}) => ({ id: 'BLK-01', day: 0, status: 'GRANTED', startText: '10:00', endText: '12:00', sectionText: 'NDLS–GZB', sections: [0], line: 'DN', tasks: [mockTasks[0]], affectedTrains: [], ...over });
const screeningBlock = (status, over = {}) => ({ id: 'BLK-SCR', day: 0, status, startText: '01:00', endText: '04:00', sectionText: 'GZB–KRJ', sections: [1], line: 'UP', startKm: 40, endKm: 44, tasks: [{ id: 'T-DS', workType: 'DEEP_SCREENING', dept: 'TMS' }], affectedTrains: [], ...over });

test('caution orders are generated deterministically from TSR tasks', () => {
  const orders = generateCautionOrders(mockTasks, [liftBlock()], corridor, 0);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].formType, 'T/409');
  assert.equal(orders[0].speedKmph, 30);
  assert.equal(orders[0].liftingBlockId, 'BLK-01');
  assert.equal(orders[0].isLiftingToday, true);

  const notices = generateDisconnectionNotices(
    [{ id: 'SIG-01', dept: 'SMMS', blockKind: 'DISCONNECTION', label: 'Point machine overhaul', sectionLabel: 'NDLS yard', startKm: 0, endKm: 1 }],
    [{ id: 'BLK-02', day: 0, startText: '14:00', endText: '15:30', line: 'DN', tasks: [{ id: 'SIG-01', dept: 'SMMS', blockKind: 'DISCONNECTION', label: 'Point machine overhaul' }] }],
    corridor,
    0
  );
  assert.equal(notices.length, 1);
  assert.equal(notices[0].formType, 'T/351');
  assert.equal(notices[0].blockId, 'BLK-02');
});

test('T/409 numbers are derived from content: stable across re-plans, days and other orders', () => {
  const a = generateCautionOrders(mockTasks, [liftBlock()], corridor, 0, '2026-09-07');
  // re-plan moved the lifting block to another day and id; another TSR work appeared first in the register
  const extra = { id: 'TSR-00', label: 'Buckling watch', workType: 'DESTRESSING', sectionLabel: 'X', sections: [2], line: 'UP', startKm: 60, endKm: 61, tsrKmph: 45 };
  const b = generateCautionOrders([extra, ...mockTasks], [liftBlock({ id: 'BLK-99', day: 3 })], corridor, 2, '2026-09-09');
  const noA = a.find((o) => o.taskId === 'TSR-01').orderNo;
  const noB = b.find((o) => o.taskId === 'TSR-01').orderNo;
  assert.equal(noA, noB, 'same TSR keeps its order number');
  assert.equal(noA, registerOrderNo(corridor, 'TSR-01'));
  assert.notEqual(b.find((o) => o.taskId === 'TSR-00').orderNo, noA, 'different works get different numbers');
  assert.ok(!noA.includes('2026'), 'no date in the number');
  assert.match(manualOrderNo(corridor, 'TSR-ABC123'), /^T\/409\/.+\/M-[0-9A-Z]{6}$/);
  assert.equal(manualOrderNo(corridor, 'TSR-ABC123'), manualOrderNo(corridor, 'TSR-ABC123'));
});

test('T/409B is generated only for GRANTED / LOCKED blocks', () => {
  const byStatus = (status) => generateCautionOrders([], [screeningBlock(status)], corridor, 0).filter((o) => o.formType === 'T/409B');
  assert.equal(byStatus('PROPOSED').length, 0, 'no T/409B for a draft / proposed block');
  assert.equal(byStatus('REFUSED').length, 0, 'no T/409B for a refused block');
  assert.equal(byStatus(undefined).length, 0, 'raw engine blocks carry no workflow status');
  const granted = byStatus('GRANTED');
  const locked = byStatus('LOCKED');
  assert.equal(granted.length, 1);
  assert.equal(locked.length, 1);
  assert.equal(granted[0].orderNo, locked[0].orderNo, 'locking does not renumber the order');
  assert.equal(granted[0].liftingBlockId, 'BLK-SCR');
  assert.deepEqual(granted[0].taskIds, ['T-DS']);
  // another block granted on the same day does not change this block's number
  const two = generateCautionOrders([], [screeningBlock('GRANTED', { id: 'BLK-OTHER', tasks: [{ id: 'T-TAMP', workType: 'TAMPING', dept: 'TMS' }] }), screeningBlock('GRANTED')], corridor, 0);
  assert.equal(two.find((o) => o.liftingBlockId === 'BLK-SCR').orderNo, granted[0].orderNo);
});

test('T/351 numbers depend on block and work, not on the position in the list', () => {
  const blk = (id, taskId) => ({ id, day: 0, status: 'GRANTED', startText: '01:00', endText: '02:00', line: 'UP', tasks: [{ id: taskId, dept: 'SMMS', label: 'Point', startKm: 1, endKm: 2 }] });
  const one = generateDisconnectionNotices([], [blk('B1', 'S1')], corridor, 0);
  const two = generateDisconnectionNotices([], [blk('B0', 'S0'), blk('B1', 'S1')], corridor, 0);
  assert.equal(one[0].noticeNo, two.find((n) => n.blockId === 'B1').noticeNo);
  assert.equal(generateDisconnectionNotices([], [{ ...blk('B1', 'S1'), status: 'REFUSED' }], corridor, 0).length, 0, 'no T/351 for a refused block');
});
