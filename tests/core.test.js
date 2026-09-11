import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/engine/random.js';
import { fitWeibull, weibullCdf, conditionalFailure } from '../src/engine/weibull.js';
import { LogisticModel } from '../src/engine/logistic.js';
import { CORRIDORS, sectionAtKm, sectionsInRange } from '../src/engine/corridors.js';
import { buildFeeds, generateEscalationHistory } from '../src/engine/dataFactory.js';
import { normalize, mastToKm } from '../src/engine/normalizer.js';
import { buildRiskModels, trafficDensity, scoreAll } from '../src/engine/riskEngine.js';
import { buildDayOccupancy, freeWindows, commonFreeWindows, intersectWindows } from '../src/engine/occupancy.js';
import { evaluateWindow } from '../src/engine/delayModel.js';
import { learnDurationFactors, calibratedDuration } from '../src/engine/productivity.js';
import { createContext, runPlanning } from '../src/engine/planner.js';
import { hhmmToMin, minToHHMM, overlap } from '../src/engine/time.js';
import { MIN_PER_DAY } from '../src/engine/time.js';

test('seeded rng is reproducible', () => {
  const a = createRng(42);
  const b = createRng(42);
  const xa = Array.from({ length: 5 }, () => a.next());
  const xb = Array.from({ length: 5 }, () => b.next());
  assert.deepEqual(xa, xb);
  assert.ok(xa.every((x) => x >= 0 && x < 1));
});

test('time helpers round-trip', () => {
  assert.equal(hhmmToMin('13:45'), 825);
  assert.equal(minToHHMM(825), '13:45');
  assert.equal(minToHHMM(1500), '01:00');
  assert.equal(overlap(0, 10, 5, 20), 5);
  assert.equal(overlap(0, 10, 10, 20), 0);
});

test('weibull MLE recovers the generating parameters from censored data', () => {
  const rng = createRng(3);
  const recs = [];
  for (let i = 0; i < 400; i++) {
    const t = rng.weibull(2.5, 1000);
    const censor = rng.range(300, 1600); // independent inspection census age
    if (censor < t) recs.push({ t: censor, failed: false });
    else recs.push({ t, failed: true });
  }
  const fit = fitWeibull(recs);
  assert.ok(fit.converged);
  assert.ok(Math.abs(fit.beta - 2.5) < 0.4, `beta ${fit.beta}`);
  assert.ok(Math.abs(fit.eta - 1000) < 120, `eta ${fit.eta}`);
  assert.ok(weibullCdf(1000, 2.5, 1000) > 0.62 && weibullCdf(1000, 2.5, 1000) < 0.64);
  assert.ok(conditionalFailure(900, 30, 2.5, 1000) > conditionalFailure(100, 30, 2.5, 1000));
});

test('logistic model learns the escalation signal', () => {
  const rng = createRng(9);
  const hist = generateEscalationHistory(rng, 600);
  const m = new LogisticModel().fit(hist.slice(0, 450));
  const metrics = m.evaluate(hist.slice(450));
  assert.ok(metrics.auc > 0.8, `auc ${metrics.auc}`);
  assert.ok(metrics.accuracy > 0.7);
  const p = m.predict({ daysOverdue: 30, conditionIndex: 0.95, gmtLoad: 60, ageRatio: 1.2, safety: 1, hasTsr: 1 });
  const q = m.predict({ daysOverdue: -20, conditionIndex: 0.2, gmtLoad: 20, ageRatio: 0.3, safety: 0.4, hasTsr: 0 });
  assert.ok(p > q);
});

test('corridor geometry helpers', () => {
  const c = CORRIDORS[0];
  assert.equal(c.blockSections.length, c.stations.length - 1);
  assert.equal(sectionAtKm(c, 150).label, 'ALJN–HRS');
  assert.deepEqual(sectionsInRange(c, 160, 215).map((s) => s.label), ['ALJN–HRS', 'HRS–TDL', 'TDL–SKB']);
  assert.ok(Math.abs(mastToKm('145/12') - 145.605) < 1e-6);
});

test('timetable respects COA corridor blocks and passages are monotonic', () => {
  const c = CORRIDORS[0];
  const feeds = buildFeeds(c);
  assert.ok(feeds.timetable.length >= c.trainsPerDayTarget - 2);
  for (const t of feeds.timetable) {
    for (let i = 1; i < t.times.length; i++) assert.ok(t.times[i].arr >= t.times[i - 1].dep, `${t.number} timing order`);
    assert.equal(t.passages.length, c.blockSections.length);
  }
  for (const cb of c.corridorBlocks) {
    const s = hhmmToMin(cb.start);
    const e = hhmmToMin(cb.end);
    for (const t of feeds.timetable) {
      if (t.line !== cb.line) continue;
      for (const p of t.passages) {
        const sec = c.blockSections[p.sectionIndex];
        if (sec.endKm <= cb.fromKm || sec.startKm >= cb.toKm) continue;
        assert.equal(Math.max(p.enter, s) < Math.min(p.exit, e), false, `${t.number} inside corridor block on ${sec.label}`);
      }
    }
  }
});

test('normaliser maps every feed record onto the network graph', () => {
  const c = CORRIDORS[1];
  const feeds = buildFeeds(c);
  const { tasks, counts } = normalize(c, feeds, learnDurationFactors(feeds.executionLog));
  assert.equal(counts.rejected, 0);
  assert.equal(tasks.length, feeds.tms.length + feeds.smms.length + feeds.tdms.length);
  for (const t of tasks) {
    assert.ok(t.sections.length >= 1);
    assert.ok(t.startKm >= 0 && t.endKm <= c.lengthKm);
    assert.ok(t.totalMin >= t.durationMin);
    assert.ok(['LINE', 'NONE'].includes(t.closure));
  }
  const factors = learnDurationFactors(feeds.executionLog);
  assert.ok(factors.DEEP_SCREENING.factor > 1.1);
  assert.equal(calibratedDuration(100, 'NOPE', factors), 100);
});

test('ARCI ranks mandatory safety work first and explains itself', () => {
  const c = CORRIDORS[0];
  const feeds = buildFeeds(c);
  const { tasks } = normalize(c, feeds);
  const models = buildRiskModels(feeds);
  const dens = trafficDensity(c, feeds.timetable, feeds.freight);
  const ranked = scoreAll(tasks, models, dens, c);
  assert.ok(ranked[0].risk.mandatory);
  assert.ok(ranked[0].risk.arci >= 0.92);
  for (const t of ranked) {
    assert.ok(t.risk.arci >= 0 && t.risk.arci <= 1);
    assert.equal(t.risk.explanation.length, 6);
  }
  const imr = ranked.find((t) => t.workType === 'USFD_IMR_RAIL');
  const grind = ranked.find((t) => t.workType === 'RAIL_GRINDING');
  assert.ok(imr.risk.arci > grind.risk.arci);
});

test('free windows never overlap train passages and midnight is handled', () => {
  const c = CORRIDORS[0];
  const feeds = buildFeeds(c);
  const occ = buildDayOccupancy(c, feeds, 3, new Date(2026, 8, 7));
  for (const sec of c.blockSections) {
    for (const line of c.lines) {
      const ps = occ.occ[occ.key(sec.index, line)] || [];
      for (const p of ps) assert.ok(p.enter >= 0 && p.exit <= MIN_PER_DAY && p.exit > p.enter);
      const ws = freeWindows(occ, sec.index, line, 60, 6);
      for (const w of ws) {
        assert.ok(w.end - w.start >= 60);
        for (const p of ps) assert.equal(Math.max(p.enter - 6, w.start) < Math.min(p.exit + 6, w.end), false);
      }
    }
  }
  const a = [{ start: 0, end: 100 }, { start: 200, end: 400 }];
  const b = [{ start: 50, end: 250 }, { start: 300, end: 500 }];
  assert.deepEqual(intersectWindows(a, b, 30), [{ start: 50, end: 100 }, { start: 200, end: 250 }, { start: 300, end: 400 }]);
  assert.ok(commonFreeWindows(occ, [3, 4], 'DN', 60, 6).every((w) => w.end - w.start >= 60));
});

test('delay model: premium conflict is infeasible, free window costs nothing', () => {
  const c = CORRIDORS[0];
  const feeds = buildFeeds(c);
  const occ = buildDayOccupancy(c, feeds, 0, new Date(2026, 8, 7));
  const w = freeWindows(occ, 4, 'DN', 90, 6)[0];
  const ev = evaluateWindow(occ, [4], 'DN', w.start + 6, w.end - 6);
  assert.equal(ev.trains.length, 0);
  assert.equal(ev.weightedDelayMin, 0);
  const prem = (occ.occ[occ.key(4, 'DN')] || []).find((p) => p.premium);
  if (prem) {
    const bad = evaluateWindow(occ, [4], 'DN', prem.enter - 10, prem.exit + 10);
    assert.equal(bad.feasible, false);
    assert.ok(bad.premiumConflicts >= 1);
  }
});

test('end-to-end planning: feasible, reproducible and better than the baseline', () => {
  const ctx = createContext('SWR_SBC_JTJ');
  const r1 = runPlanning(ctx, { iterations: 1500 });
  const r2 = runPlanning(createContext('SWR_SBC_JTJ'), { iterations: 1500 });
  assert.equal(r1.weekly.ai.cost.total, r2.weekly.ai.cost.total, 'deterministic');
  assert.equal(r1.weekly.ai.cost.hard, 0, `hard: ${r1.weekly.ai.cost.hardReasons.join('; ')}`);
  const k = r1.weekly.kpis;
  const b = r1.weekly.baseKpis;
  assert.equal(k.premiumConflicts, 0);
  assert.equal(k.mandatoryCompliant, k.mandatoryTotal);
  assert.ok(k.blockCount <= b.blockCount, 'fewer possessions than baseline');
  assert.ok(k.colocationRate > b.colocationRate);
  for (const blk of r1.weekly.ai.blocks) {
    if (blk.lineClosure) assert.ok(blk.spanMin <= ctx.corridor && true || blk.spanMin <= 360);
    for (const t of blk.tasks) assert.ok(t.start >= blk.start && t.end <= blk.end);
  }
  assert.equal(r1.rolling.entries.length, ctx.tasks.filter((t) => t.capital).length);
  assert.ok(r1.monthly.calendar.length === 30);
});

test('scenario: injected IMR flaw is scheduled on day 1 and machine breakdown re-plans', () => {
  const base = createContext('ER_HWH_ASN');
  const inj = createContext('ER_HWH_ASN', { scenario: { injectTasks: [{ workType: 'USFD_IMR_RAIL', line: 'DN', startKm: 120, endKm: 120.3, daysOverdue: 0, tsrKmph: 30 }] } });
  assert.equal(inj.tasks.length, base.tasks.length + 1);
  const r = runPlanning(inj, { iterations: 1200 });
  const s = r.weekly.ai.scheduled.find((x) => x.taskId === 'INJ-01');
  assert.ok(s, 'injected task scheduled');
  assert.ok(s.day <= 1);
  const csm = base.feeds.machines.find((m) => m.type === 'CSM').id;
  const broke = createContext('ER_HWH_ASN', { scenario: { removeMachines: [csm] } });
  const r2 = runPlanning(broke, { iterations: 1200 });
  assert.equal(r2.weekly.ai.cost.hard, 0);
});
