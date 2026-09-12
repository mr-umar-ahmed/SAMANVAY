/**
 * Knock-on delay model.
 *
 * When a block occupies (sections, line) over [start, end], every train whose
 * passage on that line intersects the window (plus headway margins) is
 * affected. On a double line the traffic is worked over the surviving line
 * under single-line working (SLW) as long as that line has spare capacity in
 * the window; otherwise the train is held at the previous station until the
 * block is lifted. Goods trains beyond the SLW capacity are regulated at the
 * previous yard (FOIS forecast is advisory, so these carry the lowest weight).
 *
 * Premium passenger paths (Vande Bharat, Rajdhani, Shatabdi) are never
 * touched in the tactical horizon — such windows are reported infeasible.
 * Only the 26-week programme may regulate them, and only with the 10-week
 * JPO notice.
 */
import { passages } from './occupancy.js';
import { RULES, TRAIN_LATENESS } from './constants.js';
import { createRng } from './random.js';

export function evaluateWindow(dayOcc, sections, line, start, end, rules = RULES, { allowPremium = false } = {}) {
  const lines = line === 'BOTH' ? ['UP', 'DN'] : [line];
  const s0 = start - rules.headwayMarginMin;
  const e0 = end + rules.headwayMarginMin;
  const affected = new Map();
  let premiumConflicts = 0;

  for (const l of lines) {
    const other = l === 'UP' ? 'DN' : 'UP';
    const otherBlocked = line === 'BOTH';
    // capacity of the surviving line during the window
    let otherLoad = 0;
    if (!otherBlocked) {
      for (const s of sections) for (const p of passages(dayOcc, s, other)) if (Math.max(p.enter, s0) < Math.min(p.exit, e0)) otherLoad++;
    }
    const hours = Math.max(0.5, (e0 - s0) / 60);
    let slwSlots = otherBlocked ? 0 : Math.max(0, Math.floor(rules.slwCapacityPerHour * hours) - otherLoad);

    const seen = new Set();
    const list = [];
    for (const s of sections) {
      for (const p of passages(dayOcc, s, l)) {
        if (seen.has(p.trainId)) continue;
        if (Math.max(p.enter, s0) < Math.min(p.exit, e0)) {
          seen.add(p.trainId);
          list.push(p);
        }
      }
    }
    list.sort((a, b) => a.enter - b.enter);
    for (const p of list) {
      if (p.premium && !allowPremium) premiumConflicts++;
      let mode;
      let delay;
      if (slwSlots > 0 && p.cls !== 'GOODS') {
        slwSlots--;
        mode = 'SLW';
        delay = rules.slwDelayMin + (otherLoad > 0 ? Math.min(12, otherLoad * 2) : 0);
      } else if (slwSlots > 0) {
        slwSlots--;
        mode = 'SLW';
        delay = rules.slwDelayMin + 6;
      } else if (p.cls === 'GOODS') {
        mode = 'REGULATED';
        delay = Math.max(0, e0 - p.enter);
      } else {
        mode = 'HELD';
        delay = Math.max(0, e0 - p.enter);
      }
      const prev = affected.get(p.trainId);
      if (!prev || prev.delayMin < delay) affected.set(p.trainId, { trainId: p.trainId, number: p.number, name: p.name, cls: p.cls, weight: p.weight, premium: p.premium, line: l, mode, delayMin: Math.round(delay), weightedDelay: Math.round(delay * p.weight) });
    }
  }
  const trains = [...affected.values()];
  const weightedDelayMin = trains.reduce((a, t) => a + t.weightedDelay, 0);
  const rawDelayMin = trains.reduce((a, t) => a + t.delayMin, 0);
  return { trains, weightedDelayMin, rawDelayMin, premiumConflicts, feasible: premiumConflicts === 0 || allowPremium };
}

/**
 * Window reliability: Monte-Carlo probability that no train path intrudes
 * into the protected block window [start − margin, end + margin) when trains
 * run late. Only trains scheduled to clear the sections *before* the window
 * can intrude (lateness only delays); trains already inside the window are
 * the ones the delay model plans around (SLW / held) and are excluded via
 * `exclude`. Lateness per class comes from TRAIN_LATENESS (assumptions).
 * One lateness draw per train per sample, shared by all its passages.
 */
export function windowReliability(dayOcc, sections, line, start, end, rules = RULES, { samples = 100, seed = 1, exclude = null, lateness = TRAIN_LATENESS } = {}) {
  const lines = line === 'BOTH' ? ['UP', 'DN'] : [line];
  const s0 = start - rules.headwayMarginMin;
  const e0 = end + rules.headwayMarginMin;
  const threats = new Map(); // trainId -> { cls, passages: [{enter, exit}] }
  for (const l of lines) {
    for (const s of sections) {
      for (const p of passages(dayOcc, s, l)) {
        if (p.exit > s0) continue; // inside or after the window
        if (exclude && exclude.has(p.trainId)) continue;
        let th = threats.get(p.trainId);
        if (!th) threats.set(p.trainId, (th = { cls: p.cls, list: [] }));
        th.list.push(p);
      }
    }
  }
  if (!threats.size) return { probability: 1, samples: 0, threats: 0 };
  const rng = createRng(seed >>> 0);
  const ths = [...threats.values()];
  let clean = 0;
  for (let k = 0; k < samples; k++) {
    let hit = false;
    for (const th of ths) {
      const lp = lateness[th.cls] || lateness.EXP;
      const u = rng.next();
      const late = u < lp.onTime ? 0 : -lp.meanLateMin * Math.log(1 - rng.next());
      if (late <= 0) continue;
      for (const p of th.list) {
        if (p.exit + late > s0 && p.enter + late < e0) {
          hit = true;
          break;
        }
      }
      if (hit) break;
    }
    if (!hit) clean++;
  }
  return { probability: clean / samples, samples, threats: ths.length };
}

/**
 * Train-minutes lost per day to a temporary speed restriction on a task's
 * sections — the cost of *not* doing the work.
 */
export function tsrLossPerDay(task, dayOcc, corridor) {
  if (!task.tsrKmph) return 0;
  const lines = task.line === 'BOTH' ? ['UP', 'DN'] : [task.line];
  const len = Math.max(0.5, task.lengthKm + 1.0); // restricted length + accel/decel run
  let minutes = 0;
  for (const l of lines) {
    for (const s of task.sections) {
      for (const p of passages(dayOcc, s, l)) {
        const v = Math.min(corridor.mpsKmph, p.cls === 'GOODS' ? 65 : 110);
        const normal = (len / v) * 60;
        const slow = (len / task.tsrKmph) * 60 + 2.5; // + braking/acceleration
        minutes += Math.max(0, slow - normal) * p.weight;
      }
    }
  }
  return minutes;
}
