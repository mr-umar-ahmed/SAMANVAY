import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CORRIDORS } from '../src/engine/corridors.js';
import { createContext } from '../src/engine/planner.js';
import { planHorizon } from '../src/engine/scheduler.js';
import { validateDemand } from '../src/engine/intake.js';

test('validateDemand produces bilingual errors correctly', () => {
  const corridor = CORRIDORS[0];

  // Invalid demand: outside chainage
  const resEn = validateDemand({ workType: 'USFD_IMR_RAIL', startKm: -5, endKm: 10, line: 'UP' }, corridor, {}, { lang: 'en' });
  assert.equal(resEn.valid, false);
  assert.ok(resEn.errors.some((e) => e.includes('outside corridor chainage')));
  assert.ok(resEn.localizedErrors.hi.some((e) => e.includes('कॉरिडोर चेनेज')));

  const resHi = validateDemand({ workType: 'USFD_IMR_RAIL', startKm: -5, endKm: 10, line: 'UP' }, corridor, {}, { lang: 'hi' });
  assert.equal(resHi.valid, false);
  assert.ok(resHi.errors.some((e) => e.includes('कॉरिडोर चेनेज')));

  // Invalid line
  const resLine = validateDemand({ workType: 'USFD_IMR_RAIL', startKm: 10, endKm: 15, line: 'INVALID' }, corridor);
  assert.equal(resLine.valid, false);
  assert.ok(resLine.errors.some((e) => e.includes('Line must be UP, DN, or BOTH')));

  // Valid demand
  const resValid = validateDemand({ workType: 'USFD_IMR_RAIL', startKm: 20, endKm: 21, line: 'DN', durationMin: 120 }, corridor);
  assert.equal(resValid.valid, true);
  assert.ok(resValid.task);
  assert.equal(resValid.task.workType, 'USFD_IMR_RAIL');
});

test('planHorizon respects fixedBlocks solver constraints during re-planning', () => {
  const ctx = createContext('NCR_DLI_AGC', { seed: 26027 });
  const tasks = ctx.tasks.filter((t) => !t.capital);

  // Pick a task from the corridor
  const testTask = tasks[0];
  assert.ok(testTask, 'test task exists');

  // Define a fixed block constraint on Day 2, Line DN, 600..750 min
  const fixedBlock = {
    id: 'BLK-FIXED-01',
    day: 2,
    line: 'DN',
    start: 600,
    end: 750,
    taskIds: [testTask.id]
  };

  const plan = planHorizon({
    corridor: ctx.corridor,
    feeds: ctx.feeds,
    tasks,
    days: 7,
    planStart: ctx.planStart,
    fixedBlocks: [fixedBlock],
    iterations: 800,
    seed: 7
  });

  const scheduled = plan.scheduled.find((s) => s.taskId === testTask.id);
  assert.ok(scheduled, 'fixed task was scheduled');
  assert.equal(scheduled.day, 2, 'task kept on fixed day');
  assert.equal(scheduled.line, 'DN', 'task kept on fixed line');
  assert.equal(scheduled.start, 600, 'task kept at fixed start window');
  assert.equal(scheduled.end, 750, 'task kept at fixed end window');

  // Verify the block created contains the fixed task
  const blockWithTask = plan.blocks.find((b) => b.tasks.some((t) => t.id === testTask.id));
  assert.ok(blockWithTask, 'block formed for fixed task');
  assert.equal(blockWithTask.day, 2);
  assert.equal(blockWithTask.line, 'DN');
  assert.equal(blockWithTask.start, 600);
});

test('joint-block suggestion targetBlock binding co-locates task into host window', () => {
  const ctx = createContext('NCR_DLI_AGC', { seed: 26027 });
  const tasks = ctx.tasks.filter((t) => !t.capital);

  // Target window
  const targetBlock = {
    day: 3,
    line: 'UP',
    start: 660,
    end: 800
  };

  const jointTask = {
    ...tasks[1],
    id: 'TASK-JOINT-TEST',
    targetBlock
  };

  const allTasks = [jointTask, ...tasks.filter((t) => t.id !== tasks[1].id)];

  const plan = planHorizon({
    corridor: ctx.corridor,
    feeds: ctx.feeds,
    tasks: allTasks,
    days: 7,
    planStart: ctx.planStart,
    iterations: 600,
    seed: 11
  });

  const scheduled = plan.scheduled.find((s) => s.taskId === 'TASK-JOINT-TEST');
  assert.ok(scheduled, 'joint task scheduled');
  assert.equal(scheduled.day, 3);
  assert.equal(scheduled.line, 'UP');
  assert.equal(scheduled.start, 660);
});
