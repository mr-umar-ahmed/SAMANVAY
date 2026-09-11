import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CORRIDORS } from '../src/engine/corridors.js';
import { positionAt, livePositions } from '../src/engine/livePosition.js';

test('livePosition interpolates position between stations correctly', () => {
  const corridor = CORRIDORS[0]; // NDLS - CNB
  const mockTrain = {
    id: 'TEST-12004',
    number: '12004',
    name: 'Lucknow Shatabdi',
    cls: 'SHT',
    line: 'DN',
    premium: true,
    times: [
      { code: 'NDLS', km: 0, arr: 360, dep: 370 },
      { code: 'GZB', km: 20, arr: 390, dep: 392 },
      { code: 'ALJN', km: 131, arr: 480, dep: 482 },
      { code: 'CNB', km: 440, arr: 720, dep: 730 }
    ]
  };

  // Before departure
  assert.equal(positionAt(mockTrain, corridor, 350), null);

  // At NDLS halt
  const atOrigin = positionAt(mockTrain, corridor, 365);
  assert.ok(atOrigin);
  assert.equal(atOrigin.km, 0);
  assert.equal(atOrigin.isHalted, true);
  assert.equal(atOrigin.currentStation, 'NDLS');

  // En route NDLS -> GZB at min 380 (halfway)
  const midway = positionAt(mockTrain, corridor, 380);
  assert.ok(midway);
  assert.equal(midway.isHalted, false);
  assert.ok(midway.km > 0 && midway.km < 20);
  assert.equal(midway.currentStation, 'NDLS');
  assert.equal(midway.nextStation, 'GZB');

  // After arrival
  assert.equal(positionAt(mockTrain, corridor, 740), null);

  // Live positions list
  const list = livePositions([mockTrain], corridor, 380);
  assert.equal(list.length, 1);
  assert.equal(list[0].trainNo, '12004');
});
