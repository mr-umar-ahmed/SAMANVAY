/**
 * Synthetic-but-faithful data factory.
 *
 * SAMANVAY does not have live access to CRIS systems, so this module produces
 * the feeds the platform would ingest, in the *native* shape of each source
 * system:
 *
 *   COA   – Working Time Table (passenger paths, running days, corridor blocks)
 *   FOIS  – 30-day goods-train forecast (rake paths, tonnage, commodity)
 *   TMS   – track defect & due-maintenance register (USFD, TGI, GMT ...)
 *   SMMS  – signalling gear health & overdue overhaul register
 *   TDMS  – OHE condition register (contact wire wear, stagger, insulators ...)
 *   plus  – machine fleet, gangs, historical failure register (for Weibull
 *           fitting), historical escalation register (for the ML predictor),
 *           and the block execution log (for duration calibration).
 *
 * Everything is generated from a seeded RNG so the demo is reproducible.
 * Numbers are calibrated against public IR manuals (USFD manual, IRPWM, ACTM)
 * to be *plausible*, not to represent any real division's data.
 */
import { createRng } from './random.js';
import { hhmmToMin, MIN_PER_DAY } from './time.js';
import { TRAIN_CLASSES, WORK_TYPES, MACHINE_TYPES } from './constants.js';
import { sectionAtKm, kmToMast, formatChainage, findSignal } from './corridors.js';
import { buildWeatherFeed, weatherTotals, addDaysIso, toIsoDate } from './weather.js';

/** "True" Weibull parameters (days) used to synthesise the failure history. */
export const ASSET_CLASS_PARAMS = {
  RAIL: { beta: 2.2, eta: 3200, label: 'Rail / weld' },
  BALLAST: { beta: 2.8, eta: 540, label: 'Ballast / geometry (tamping cycle)' },
  TURNOUT: { beta: 2.4, eta: 1400, label: 'Turnout / crossing' },
  BRIDGE: { beta: 3.5, eta: 9000, label: 'Bridge girder' },
  POINT_MACHINE: { beta: 1.9, eta: 900, label: 'Point machine' },
  TRACK_CIRCUIT: { beta: 1.6, eta: 700, label: 'Track circuit' },
  AXLE_COUNTER: { beta: 1.8, eta: 1100, label: 'Axle counter' },
  EI: { beta: 1.4, eta: 1500, label: 'Electronic interlocking' },
  CABLE: { beta: 1.5, eta: 2400, label: 'Signal cable / OFC' },
  LC_GATE: { beta: 2.0, eta: 800, label: 'LC gate interlocking' },
  CONTACT_WIRE: { beta: 3.0, eta: 4200, label: 'OHE contact wire' },
  INSULATOR: { beta: 2.5, eta: 1300, label: 'OHE insulator' },
  CANTILEVER: { beta: 2.6, eta: 2600, label: 'OHE cantilever' },
  NEUTRAL_SECTION: { beta: 2.2, eta: 1100, label: 'Neutral section' },
  TSS: { beta: 1.7, eta: 900, label: 'Traction sub-station' }
};

const TRAIN_NAMES = {
  VB: ['Vande Bharat Express'],
  RAJ: ['Rajdhani Express', 'Duronto Express', 'Tejas Rajdhani'],
  SHT: ['Shatabdi Express', 'Tejas Express', 'Jan Shatabdi Express'],
  SF: ['Superfast Express', 'Sampark Kranti Express', 'Garib Rath Express', 'Humsafar Express', 'Amrit Bharat Express'],
  EXP: ['Mail', 'Express', 'Intercity Express', 'Link Express', 'Special Express'],
  PASS: ['MEMU', 'Passenger', 'EMU Local', 'DEMU'],
  PARCEL: ['Parcel Express', 'Military Special']
};

const COMMODITIES = ['Coal', 'Iron ore', 'Container', 'Cement', 'Food grain', 'POL (petroleum)', 'Steel coil', 'Fertiliser', 'Fly ash', 'Automobile'];
const LOCOS = ['WAG-9H', 'WAG-12B', 'WAG-7', 'WAG-9HC'];

/* ------------------------------------------------------------------------ */
/* Working Time Table (COA)                                                  */
/* ------------------------------------------------------------------------ */

function classMix(target) {
  // per direction counts; scaled to target trains/day (both directions)
  const perDir = target / 2;
  const mix = { VB: 0.05, RAJ: 0.07, SHT: 0.06, SF: 0.22, EXP: 0.28, PASS: 0.26, PARCEL: 0.06 };
  const counts = {};
  let total = 0;
  for (const [k, share] of Object.entries(mix)) {
    counts[k] = Math.max(k === 'VB' ? 1 : 0, Math.round(perDir * share));
    total += counts[k];
  }
  while (total < perDir) {
    counts.EXP++;
    total++;
  }
  return counts;
}

function pickDeparture(rng, cls) {
  // Departure-time distribution at origin (minutes). Premium trains cluster
  // at morning/evening peaks; passengers spread; parcel at night.
  const peaks = {
    VB: [[330, 420], [960, 1050]],
    RAJ: [[960, 1080], [1200, 1320]],
    SHT: [[330, 450], [1020, 1080]],
    SF: [[300, 600], [900, 1380]],
    EXP: [[240, 720], [840, 1400]],
    PASS: [[300, 660], [840, 1200]],
    PARCEL: [[0, 240], [1320, 1439]]
  };
  const p = rng.pick(peaks[cls]);
  return Math.round(rng.range(p[0], p[1]) / 5) * 5;
}

/**
 * Compute station-by-station timings of a train from its departure, class
 * speed and halting pattern. Returns the times array (per station in travel
 * order).
 */
export function computeTimings(corridor, cls, line, dep, haltCodes, speedCap) {
  const speed = Math.min(TRAIN_CLASSES[cls].speedKmph, speedCap) * 0.9; // 10 % schedule allowance
  const stations = line === 'DN' ? corridor.stations : corridor.stations.slice().reverse();
  const times = [];
  let t = dep;
  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    if (i > 0) {
      const dist = Math.abs(st.km - stations[i - 1].km);
      const halt = haltCodes.has(stations[i - 1].code) || i === 1;
      // accelerate/decelerate allowance when departing/arriving at a halt
      t += (dist / speed) * 60 + (halt ? 2 : 0);
    }
    const isHalt = haltCodes.has(st.code) || i === 0 || i === stations.length - 1;
    const arr = Math.round(t);
    let dwell = 0;
    if (isHalt && i > 0 && i < stations.length - 1) dwell = cls === 'PASS' ? 1 : st.junction ? 3 : 2;
    times.push({ code: st.code, km: st.km, arr, dep: arr + dwell, halt: isHalt });
    t = arr + dwell;
  }
  return times;
}

/** Section crossing intervals [enter, exit) for each block section index. */
export function sectionPassages(corridor, train) {
  const out = [];
  const times = train.times;
  for (let i = 0; i < times.length - 1; i++) {
    const a = times[i];
    const b = times[i + 1];
    const lo = Math.min(a.km, b.km);
    const sec = corridor.blockSections.find((s) => s.startKm === lo);
    if (!sec) continue;
    out.push({ sectionIndex: sec.index, enter: a.dep, exit: b.arr });
  }
  return out;
}

function violatesCorridorBlocks(corridor, train, dayOfWeek) {
  for (const cb of corridor.corridorBlocks) {
    if (cb.line !== train.line) continue;
    if (dayOfWeek !== undefined && !cb.days.includes(dayOfWeek)) continue;
    const s = hhmmToMin(cb.start);
    const e = hhmmToMin(cb.end);
    for (const p of train.passages) {
      const sec = corridor.blockSections[p.sectionIndex];
      if (sec.endKm <= cb.fromKm || sec.startKm >= cb.toKm) continue;
      if (Math.max(p.enter, s) < Math.min(p.exit, e)) return true;
    }
  }
  return false;
}

export function generateTimetable(corridor, rng) {
  const trains = [];
  const counts = classMix(corridor.trainsPerDayTarget);
  const junctions = corridor.stations.filter((s) => s.junction).map((s) => s.code);
  const all = corridor.stations.map((s) => s.code);
  let seq = 0;
  const base = { NCR_NDLS_CNB: 12000, WR_MMCT_ADI: 12900, SWR_SBC_JTJ: 16500, ER_HWH_ASN: 13000 }[corridor.id] || 15000;

  for (const line of ['DN', 'UP']) {
    for (const [cls, n] of Object.entries(counts)) {
      for (let k = 0; k < n; k++) {
        seq++;
        let haltCodes;
        if (cls === 'VB' || cls === 'RAJ') haltCodes = new Set(rng.shuffle(junctions).slice(0, Math.max(1, Math.floor(junctions.length / 3))));
        else if (cls === 'SHT' || cls === 'SF') haltCodes = new Set(rng.shuffle(junctions).slice(0, Math.max(2, Math.floor(junctions.length / 2))));
        else if (cls === 'EXP') haltCodes = new Set(junctions);
        else if (cls === 'PARCEL') haltCodes = new Set();
        else haltCodes = new Set(all);
        const number = String(base + seq * 2 + (line === 'UP' ? 1 : 0));
        const name = `${rng.pick(TRAIN_NAMES[cls])}`;
        const dep = pickDeparture(rng, cls);
        const train = {
          id: `${corridor.id}:${number}`,
          number,
          name,
          cls,
          classLabel: TRAIN_CLASSES[cls].label,
          weight: TRAIN_CLASSES[cls].weight,
          premium: TRAIN_CLASSES[cls].premium,
          line,
          source: 'COA',
          runsOn: cls === 'PASS' || cls === 'EXP' || cls === 'VB' ? [1, 1, 1, 1, 1, 1, 1] : [0, 1, 2, 3, 4, 5, 6].map(() => (rng.chance(0.8) ? 1 : 0)),
          dep
        };
        if (train.runsOn.every((d) => d === 0)) train.runsOn[rng.int(0, 6)] = 1;
        train.times = computeTimings(corridor, cls, line, dep, haltCodes, corridor.mpsKmph);
        train.passages = sectionPassages(corridor, train);
        // Respect COA corridor blocks: shift departure until the path is clear.
        let shifted = 0;
        const offsets = [0, 15, -15, 30, -30, 45, -45, 60, -60, 90, -90, 120, -120, 150, -150, 180, -180, 240, -240];
        for (const off of offsets) {
          const cand = { ...train, dep: (dep + off + MIN_PER_DAY) % MIN_PER_DAY };
          cand.times = computeTimings(corridor, cls, line, cand.dep, haltCodes, corridor.mpsKmph);
          cand.passages = sectionPassages(corridor, cand);
          if (!violatesCorridorBlocks(corridor, cand)) {
            Object.assign(train, cand);
            shifted = off;
            break;
          }
        }
        train.shiftedMin = shifted;
        train.origin = train.times[0].code;
        train.destination = train.times[train.times.length - 1].code;
        train.arr = train.times[train.times.length - 1].arr;
        trains.push(train);
      }
    }
  }
  trains.sort((a, b) => a.dep - b.dep);
  return trains;
}

/* ------------------------------------------------------------------------ */
/* FOIS goods forecast                                                       */
/* ------------------------------------------------------------------------ */

export function generateFreightForecast(corridor, rng, days) {
  const paths = [];
  const stations = corridor.stations;
  let seq = 0;
  for (let day = 0; day < days; day++) {
    const dow = day % 7;
    const n = Math.round(corridor.freightPathsPerDay * (dow === 0 ? 1.15 : 1) * rng.range(0.85, 1.15));
    for (let k = 0; k < n; k++) {
      seq++;
      const line = rng.chance(0.5) ? 'DN' : 'UP';
      // night-heavy departures
      const dep = rng.chance(0.55) ? rng.int(0, 360) : rng.int(360, 1439);
      // partial paths between yards ~35 %
      let oIdx = 0;
      let dIdx = stations.length - 1;
      if (rng.chance(0.35)) {
        const j = stations.map((s, i) => (s.junction ? i : -1)).filter((i) => i >= 0);
        const a = rng.pick(j);
        let b = rng.pick(j);
        if (a === b) b = j[(j.indexOf(a) + 1) % j.length];
        oIdx = Math.min(a, b);
        dIdx = Math.max(a, b);
        if (dIdx - oIdx < 1) {
          oIdx = 0;
          dIdx = stations.length - 1;
        }
      }
      const commodity = rng.pick(COMMODITIES);
      const train = {
        id: `${corridor.id}:G${day}-${seq}`,
        number: `${rng.pick(['BOXN', 'BCNHL', 'BTPN', 'BLC', 'BOST'])}-${rng.int(1000, 9999)}`,
        name: `${commodity} rake`,
        cls: 'GOODS',
        classLabel: TRAIN_CLASSES.GOODS.label,
        weight: TRAIN_CLASSES.GOODS.weight,
        premium: false,
        line,
        source: 'FOIS',
        day,
        tonnage: rng.int(2600, 5800),
        loco: rng.pick(LOCOS),
        commodity,
        dep
      };
      const sub = { ...corridor, stations: stations.slice(oIdx, dIdx + 1) };
      const timesFull = computeTimings(sub, 'GOODS', line, dep, new Set(), corridor.mpsKmph);
      train.times = timesFull;
      train.passages = sectionPassages(corridor, train);
      train.origin = train.times[0].code;
      train.destination = train.times[train.times.length - 1].code;
      train.arr = train.times[train.times.length - 1].arr;
      paths.push(train);
    }
  }
  return paths;
}

/* ------------------------------------------------------------------------ */
/* Departmental registers (native schemas)                                  */
/* ------------------------------------------------------------------------ */

/** Elementary section label (ES-nn) containing a chainage. */
function esLabel(corridor, km) {
  const es = corridor.oheSections.find((s) => km >= s.startKm && km <= s.endKm) || corridor.oheSections[corridor.oheSections.length - 1];
  return es.label;
}

function scaleCount(corridor, n) {
  const f = Math.max(0.5, corridor.lengthKm / 400);
  return Math.max(1, Math.round(n * f));
}

function pickSectionKm(rng, corridor, lengthKm = 2) {
  const sec = rng.pick(corridor.blockSections);
  const start = Math.round(rng.range(sec.startKm + 0.5, Math.max(sec.startKm + 0.6, sec.endKm - lengthKm - 0.5)) * 10) / 10;
  return { startKm: start, endKm: Math.round((start + lengthKm) * 10) / 10, section: sec };
}

function ageFor(rng, cls, urgency) {
  // urgency 0..1 → age as fraction of characteristic life
  const p = ASSET_CLASS_PARAMS[cls];
  const frac = 0.35 + urgency * 0.75 + rng.range(-0.08, 0.08);
  return Math.round(p.eta * Math.max(0.1, frac));
}

export function generateTmsRegister(corridor, rng) {
  const recs = [];
  let seq = 100;
  const push = (r) => recs.push({ tmsId: `TMS/${corridor.code}/${++seq}`, ...r });
  const lines = ['UP', 'DN'];

  // USFD IMR flaws (mandatory 24 h)
  for (let i = 0; i < scaleCount(corridor, 2); i++) {
    const k = pickSectionKm(rng, corridor, 0.2);
    push({ workType: 'USFD_IMR_RAIL', line: rng.pick(lines), chainageFrom: formatChainage(k.startKm, 'floor'), chainageTo: formatChainage(k.endKm, 'ceil'), usfdClass: 'IMR', flawType: rng.pick(['Transverse fissure (head)', 'Bolt-hole crack', 'Weld foot crack']), tgi: null, gmt: rng.int(20, 60), daysOverdue: rng.int(0, 2), tsrKmph: 30, tsrSinceDays: rng.int(0, 2), ageDays: ageFor(rng, 'RAIL', 0.9), conditionIndex: rng.range(0.85, 0.98), detectedBy: 'USFD Testing Car', requestedDaysAgo: rng.int(0, 2) });
  }
  // USFD OBS
  for (let i = 0; i < scaleCount(corridor, 3); i++) {
    const k = pickSectionKm(rng, corridor, 0.3);
    push({ workType: 'USFD_OBS_RAIL', line: rng.pick(lines), chainageFrom: formatChainage(k.startKm, 'floor'), chainageTo: formatChainage(k.endKm, 'ceil'), usfdClass: 'OBS', flawType: rng.pick(['Head check', 'Shelling', 'Weld porosity']), tgi: null, gmt: rng.int(20, 55), daysOverdue: rng.int(-10, 6), tsrKmph: null, ageDays: ageFor(rng, 'RAIL', 0.6), conditionIndex: rng.range(0.5, 0.75), detectedBy: 'USFD trolley', requestedDaysAgo: rng.int(1, 8) });
  }
  // Tamping due (TGI based)
  for (let i = 0; i < scaleCount(corridor, 6); i++) {
    const k = pickSectionKm(rng, corridor, rng.range(2, 4));
    const tgi = rng.int(28, 62);
    push({ workType: 'TAMPING', line: rng.pick(lines), chainageFrom: formatChainage(k.startKm, 'floor'), chainageTo: formatChainage(k.endKm, 'ceil'), usfdClass: null, tgi, gmt: rng.int(25, 60), daysOverdue: rng.int(-20, 25), tsrKmph: tgi < 36 ? 75 : null, tsrSinceDays: tgi < 36 ? rng.int(3, 20) : 0, ageDays: ageFor(rng, 'BALLAST', tgi < 40 ? 0.85 : 0.55), conditionIndex: Math.min(0.95, (70 - tgi) / 50), detectedBy: 'TRC run', requestedDaysAgo: rng.int(3, 25) });
  }
  // Deep screening
  for (let i = 0; i < scaleCount(corridor, 2); i++) {
    const k = pickSectionKm(rng, corridor, rng.range(1, 2));
    push({ workType: 'DEEP_SCREENING', line: rng.pick(lines), chainageFrom: formatChainage(k.startKm, 'floor'), chainageTo: formatChainage(k.endKm, 'ceil'), usfdClass: null, tgi: rng.int(30, 45), gmt: rng.int(35, 65), daysOverdue: rng.int(-30, 20), tsrKmph: rng.chance(0.5) ? 50 : null, tsrSinceDays: rng.int(5, 40), ageDays: ageFor(rng, 'BALLAST', 0.9), conditionIndex: rng.range(0.7, 0.9), detectedBy: 'Ballast profile survey', requestedDaysAgo: rng.int(10, 40) });
  }
  // Turnout renewal at junctions
  const junctions = corridor.stations.filter((s) => s.junction);
  const usedPoints = new Set();
  for (let i = 0; i < scaleCount(corridor, 2); i++) {
    const st = rng.pick(junctions);
    // draw order kept identical to the v4.0 generator (line, turnout number, …)
    const line = rng.pick(lines);
    const tn = rng.int(101, 130);
    const ab = rng.pick(['A', 'B']);
    // the turnout is one of the station's real points in the twin (points 11A…23B)
    const pt = pickGear(gearsOf(corridor, (g) => g.kind === 'POINT' && g.stationCode === st.code && g.line === line), tn + (ab === 'B' ? 1 : 0), usedPoints);
    push({ workType: 'TURNOUT_RENEWAL', line, chainageFrom: formatChainage(pt.km, 'floor'), chainageTo: formatChainage(pt.km + 0.1, 'ceil'), station: st.code, turnoutNo: pt.pointNo, usfdClass: null, tgi: null, gmt: rng.int(30, 60), daysOverdue: rng.int(-10, 15), tsrKmph: rng.chance(0.6) ? 45 : null, tsrSinceDays: rng.int(2, 30), ageDays: ageFor(rng, 'TURNOUT', 0.8), conditionIndex: rng.range(0.6, 0.9), detectedBy: 'Switch inspection', requestedDaysAgo: rng.int(5, 30) });
  }
  // Rail grinding, de-stressing
  for (let i = 0; i < scaleCount(corridor, 2); i++) {
    const k = pickSectionKm(rng, corridor, rng.range(3, 6));
    push({ workType: 'RAIL_GRINDING', line: rng.pick(lines), chainageFrom: formatChainage(k.startKm, 'floor'), chainageTo: formatChainage(k.endKm, 'ceil'), usfdClass: null, tgi: null, gmt: rng.int(30, 60), daysOverdue: rng.int(-40, 10), tsrKmph: null, ageDays: ageFor(rng, 'RAIL', 0.4), conditionIndex: rng.range(0.3, 0.5), detectedBy: 'Rail profile survey', requestedDaysAgo: rng.int(10, 40) });
  }
  for (let i = 0; i < scaleCount(corridor, 2); i++) {
    const k = pickSectionKm(rng, corridor, rng.range(1.5, 3));
    push({ workType: 'DESTRESSING', line: rng.pick(lines), chainageFrom: formatChainage(k.startKm, 'floor'), chainageTo: formatChainage(k.endKm, 'ceil'), usfdClass: null, tgi: null, gmt: rng.int(30, 60), daysOverdue: rng.int(-15, 12), tsrKmph: null, ageDays: ageFor(rng, 'RAIL', 0.55), conditionIndex: rng.range(0.45, 0.7), detectedBy: 'Creep / SEJ gap measurement', requestedDaysAgo: rng.int(5, 30) });
  }
  // Capital works (26-week RBP)
  for (let i = 0; i < scaleCount(corridor, 3); i++) {
    const k = pickSectionKm(rng, corridor, rng.range(2, 4));
    push({ workType: 'CTR', line: rng.pick(lines), chainageFrom: formatChainage(k.startKm, 'floor'), chainageTo: formatChainage(k.endKm, 'ceil'), usfdClass: null, tgi: rng.int(30, 45), gmt: rng.int(40, 70), daysOverdue: rng.int(-120, -20), tsrKmph: null, ageDays: ageFor(rng, 'RAIL', 0.8), conditionIndex: rng.range(0.6, 0.8), detectedBy: 'Annual renewal programme', requestedDaysAgo: rng.int(30, 90), capital: true, noticeWeeksGiven: rng.int(4, 14), targetWeek: rng.int(2, 24), workingDaysNeeded: rng.int(4, 10) });
  }
  {
    const k = pickSectionKm(rng, corridor, 0.3);
    push({ workType: 'BRIDGE_GIRDER', line: rng.pick(lines), chainageFrom: formatChainage(k.startKm, 'floor'), chainageTo: formatChainage(k.endKm, 'ceil'), bridgeNo: `Br. ${rng.int(100, 900)}`, usfdClass: null, tgi: null, gmt: rng.int(40, 70), daysOverdue: rng.int(-100, -30), tsrKmph: 20, tsrSinceDays: rng.int(30, 120), ageDays: ageFor(rng, 'BRIDGE', 0.9), conditionIndex: rng.range(0.75, 0.9), detectedBy: 'Bridge inspection (ORN 3)', requestedDaysAgo: rng.int(40, 120), capital: true, noticeWeeksGiven: rng.int(8, 16), targetWeek: rng.int(3, 22), workingDaysNeeded: rng.int(3, 6) });
  }
  return recs;
}

export function generateSmmsRegister(corridor, rng) {
  const recs = [];
  let seq = 200;
  const push = (r) => recs.push({ smmsId: `SMMS/${corridor.code}/${++seq}`, ...r });
  const stations = corridor.stations;
  const junctions = stations.filter((s) => s.junction);
  const lines = ['UP', 'DN'];
  const used = new Set();
  // SMMS records carry the station yard and a gear id from the corridor's
  // signalling table (corridor.signals) — no chainage. The normaliser resolves
  // gear → km, line and block section. RNG draw order is kept identical to the
  // v4.0 generator so the rest of the seeded feed does not move.

  for (let i = 0; i < scaleCount(corridor, 4); i++) {
    const st = rng.pick(junctions);
    const failures = rng.int(1, 5);
    const line = rng.pick(lines);
    const n = rng.int(101, 140);
    const ab = rng.pick(['A', 'B']);
    const rec = { mtbfHours: rng.int(400, 2400), backlashMm: rng.range(1.6, 3.2), insulationMohm: rng.range(2, 40), daysOverdue: rng.int(-5, 12), ageDays: ageFor(rng, 'POINT_MACHINE', failures > 2 ? 0.85 : 0.6), conditionIndex: Math.min(0.95, 0.3 + failures * 0.15), requestedDaysAgo: rng.int(1, 12) };
    const gear = pickGear(gearsOf(corridor, (g) => g.kind === 'POINT' && g.stationCode === st.code && g.line === line), n + (ab === 'B' ? 1 : 0), used);
    push({ workType: 'POINT_MACHINE_OVERHAUL', station: gear.stationCode, gearId: gear.id, gearType: 'IRS electric point machine', failures90d: failures, ...rec });
  }
  for (let i = 0; i < scaleCount(corridor, 3); i++) {
    const k = pickSectionKm(rng, corridor, 0.5);
    const line = rng.pick(lines);
    rng.int(1, 30); // legacy draw (old free-text gear number)
    rng.pick(['DC track circuit', 'AFTC']); // legacy draw (gear type now comes from the twin)
    const rec = { failures90d: rng.int(1, 6), mtbfHours: rng.int(300, 1800), insulationMohm: rng.range(0.5, 20), daysOverdue: rng.int(-4, 9), ageDays: ageFor(rng, 'TRACK_CIRCUIT', 0.7), conditionIndex: rng.range(0.5, 0.9), requestedDaysAgo: rng.int(1, 9) };
    const sec = k.section;
    const inSec = gearsOf(corridor, (g) => g.kind === 'TRACK_CIRCUIT' && g.detection !== 'SSDAC' && g.line === line && g.km >= sec.startKm && g.km <= sec.endKm);
    const gear = nearestGear(inSec.length ? inSec : gearsOf(corridor, (g) => g.kind === 'TRACK_CIRCUIT' && g.detection !== 'SSDAC' && g.line === line), k.startKm, used);
    push({ workType: 'TRACK_CIRCUIT_REPAIR', station: gear.stationCode, gearId: gear.id, gearType: gear.detection === 'AFTC' ? 'AFTC' : 'DC track circuit', ...rec });
  }
  for (let i = 0; i < scaleCount(corridor, 2); i++) {
    const k = pickSectionKm(rng, corridor, 0.3);
    const line = rng.pick(lines);
    rng.int(1, 9); // legacy draw
    const rec = { failures90d: rng.int(1, 4), resetCount7d: rng.int(1, 6), mtbfHours: rng.int(500, 2500), daysOverdue: rng.int(-6, 8), ageDays: ageFor(rng, 'AXLE_COUNTER', 0.65), conditionIndex: rng.range(0.45, 0.85), requestedDaysAgo: rng.int(1, 10) };
    // BPAC axle-counter head at the sending station's advanced starter
    const sec = k.section;
    const ids = line === 'DN' ? [`${sec.from}-TC-AXC-DN`, `${sec.to}-TC-AXC-UP`] : [`${sec.to}-TC-AXC-UP`, `${sec.from}-TC-AXC-DN`];
    const cands = ids.map((id) => findSignal(corridor, id)).filter(Boolean);
    const gear = cands.find((g) => !used.has(g.id)) || cands[0];
    used.add(gear.id);
    push({ workType: 'AXLE_COUNTER_RESET', station: gear.stationCode, gearId: gear.id, gearType: 'SSDAC dual head', ...rec });
  }
  for (let i = 0; i < scaleCount(corridor, 1); i++) {
    const st = rng.pick(junctions);
    // station-yard asset: the electronic interlocking of the station (no gear table entry)
    push({ workType: 'EI_CARD_REPLACEMENT', station: st.code, line: rng.pick(lines), gearId: `EI-${st.code}`, gearType: '2oo3 electronic interlocking', failures90d: rng.int(1, 3), mtbfHours: rng.int(800, 3000), daysOverdue: rng.int(-2, 4), ageDays: ageFor(rng, 'EI', 0.7), conditionIndex: rng.range(0.6, 0.9), requestedDaysAgo: rng.int(0, 4) });
  }
  for (let i = 0; i < scaleCount(corridor, 2); i++) {
    const k = pickSectionKm(rng, corridor, rng.range(1, 2.5));
    const line = rng.pick(lines);
    const gearType = rng.pick(['Signalling cable 12 core', 'OFC 24F']);
    const rec = { failures90d: rng.int(0, 2), mtbfHours: rng.int(2000, 8000), insulationMohm: rng.range(1, 50), daysOverdue: rng.int(-40, 10), ageDays: ageFor(rng, 'CABLE', 0.5), conditionIndex: rng.range(0.3, 0.6), requestedDaysAgo: rng.int(5, 40) };
    // cable route: from the location box at a signal of this line, a length towards the far station of the section
    const sec = k.section;
    const gear = nearestGear(gearsOf(corridor, (g) => g.line === line && g.kind !== 'POINT' && g.km >= sec.startKm && g.km <= sec.endKm), k.startKm, used);
    const towards = gear.km - sec.startKm < sec.endKm - gear.km ? sec.to : sec.from;
    push({ workType: 'SIGNAL_CABLE', station: gear.stationCode, gearId: gear.id, towards, cableLengthM: Math.round((k.endKm - k.startKm) * 1000), gearType, ...rec });
  }
  for (let i = 0; i < scaleCount(corridor, 2); i++) {
    const k = pickSectionKm(rng, corridor, 0.1);
    rng.int(1, 120); // legacy draws (old free-text LC number)
    rng.pick(['A', 'B', 'C']);
    const rec = { failures90d: rng.int(0, 3), mtbfHours: rng.int(600, 3000), daysOverdue: rng.int(-10, 10), ageDays: ageFor(rng, 'LC_GATE', 0.6), conditionIndex: rng.range(0.4, 0.8), requestedDaysAgo: rng.int(2, 14) };
    const lcs = gearsOf(corridor, (g) => g.kind === 'LC_GATE' && g.interlocked);
    const gear = nearestGear(lcs.length ? lcs : gearsOf(corridor, (g) => g.kind === 'LC_GATE'), k.startKm, used);
    push({ workType: 'LC_GATE_INTERLOCK', station: gear.stationCode, gearId: gear.id, gearType: 'Interlocked LC gate', ...rec });
  }
  return recs;
}

/* Gear table helpers (corridor.signals) */
function gearsOf(corridor, pred) {
  return (corridor.signals || []).filter(pred);
}

/** k-th gear of a list, skipping ones already used by another record. */
function pickGear(list, k, used) {
  const start = ((k % list.length) + list.length) % list.length;
  for (let j = 0; j < list.length; j++) {
    const g = list[(start + j) % list.length];
    if (!used.has(g.id)) {
      used.add(g.id);
      return g;
    }
  }
  return list[start];
}

/** Gear nearest to a chainage, skipping ones already used. */
function nearestGear(list, km, used) {
  const sorted = list.slice().sort((a, b) => Math.abs(a.km - km) - Math.abs(b.km - km) || a.id.localeCompare(b.id));
  const g = sorted.find((x) => !used.has(x.id)) || sorted[0];
  used.add(g.id);
  return g;
}

export function generateTdmsRegister(corridor, rng) {
  const recs = [];
  let seq = 300;
  const push = (r) => recs.push({ tdmsId: `TDMS/${corridor.code}/${++seq}`, ...r });
  const lines = ['UP', 'DN'];

  for (let i = 0; i < scaleCount(corridor, 2); i++) {
    const k = pickSectionKm(rng, corridor, rng.range(1, 2));
    const thick = rng.range(7.9, 8.6);
    push({ workType: 'CONTACT_WIRE_RENEWAL', line: rng.pick(lines), mastFrom: kmToMast(k.startKm, 'floor'), mastTo: kmToMast(k.endKm, 'ceil'), elementarySection: esLabel(corridor, k.startKm), wireThicknessMm: thick, staggerDevMm: rng.int(20, 80), heightDevMm: rng.int(10, 40), sparkingEvents30d: rng.int(3, 15), daysOverdue: rng.int(-3, 9), tsrKmph: thick < 8.25 ? 60 : null, tsrSinceDays: rng.int(1, 12), ageDays: ageFor(rng, 'CONTACT_WIRE', 0.95), conditionIndex: Math.min(0.98, (9.2 - thick) / 1.2), requestedDaysAgo: rng.int(1, 10) });
  }
  for (let i = 0; i < scaleCount(corridor, 3); i++) {
    const k = pickSectionKm(rng, corridor, rng.range(0.5, 1.2));
    push({ workType: 'DROPPER_STAGGER', line: rng.pick(lines), mastFrom: kmToMast(k.startKm, 'floor'), mastTo: kmToMast(k.endKm, 'ceil'), elementarySection: esLabel(corridor, k.startKm), wireThicknessMm: rng.range(9, 10.5), staggerDevMm: rng.int(40, 110), heightDevMm: rng.int(20, 60), sparkingEvents30d: rng.int(0, 6), daysOverdue: rng.int(-15, 14), tsrKmph: null, ageDays: ageFor(rng, 'CONTACT_WIRE', 0.5), conditionIndex: rng.range(0.35, 0.7), requestedDaysAgo: rng.int(3, 20) });
  }
  for (let i = 0; i < scaleCount(corridor, 4); i++) {
    const k = pickSectionKm(rng, corridor, rng.range(0.3, 1));
    push({ workType: 'INSULATOR_REPLACEMENT', line: rng.pick(lines), mastFrom: kmToMast(k.startKm, 'floor'), mastTo: kmToMast(k.endKm, 'ceil'), elementarySection: esLabel(corridor, k.startKm), insulatorType: rng.pick(['Porcelain 9-tonne', 'Composite silicone']), flashoverCount90d: rng.int(0, 4), contaminationClass: rng.pick(['Light', 'Medium', 'Heavy (industrial)']), daysOverdue: rng.int(-20, 12), tsrKmph: null, ageDays: ageFor(rng, 'INSULATOR', 0.65), conditionIndex: rng.range(0.4, 0.85), requestedDaysAgo: rng.int(3, 25) });
  }
  for (let i = 0; i < scaleCount(corridor, 2); i++) {
    const k = pickSectionKm(rng, corridor, rng.range(0.3, 0.8));
    push({ workType: 'CANTILEVER_REPLACEMENT', line: rng.pick(lines), mastFrom: kmToMast(k.startKm, 'floor'), mastTo: kmToMast(k.endKm, 'ceil'), elementarySection: esLabel(corridor, k.startKm), corrosionGrade: rng.pick(['C3', 'C4', 'C5']), daysOverdue: rng.int(-30, 10), tsrKmph: null, ageDays: ageFor(rng, 'CANTILEVER', 0.7), conditionIndex: rng.range(0.4, 0.8), requestedDaysAgo: rng.int(5, 35) });
  }
  for (let i = 0; i < scaleCount(corridor, 1); i++) {
    const tss = rng.pick(corridor.tss);
    const km = Math.max(0.5, tss.km - rng.range(4, 12));
    push({ workType: 'NEUTRAL_SECTION', line: rng.pick(lines), mastFrom: kmToMast(km, 'floor'), mastTo: kmToMast(km + 0.4, 'ceil'), elementarySection: esLabel(corridor, km), nsType: 'Short neutral section (PTFE)', flashoverCount90d: rng.int(1, 5), daysOverdue: rng.int(-5, 10), tsrKmph: rng.chance(0.5) ? 60 : null, tsrSinceDays: rng.int(1, 15), ageDays: ageFor(rng, 'NEUTRAL_SECTION', 0.8), conditionIndex: rng.range(0.6, 0.9), requestedDaysAgo: rng.int(2, 12) });
  }
  for (let i = 0; i < scaleCount(corridor, 2); i++) {
    const tss = rng.pick(corridor.tss);
    push({ workType: 'TSS_MAINTENANCE', line: 'BOTH', tssCode: tss.code, transformerMva: rng.pick([21.6, 30]), oilBdvKv: rng.int(30, 60), oilTempC: rng.int(45, 72), daysOverdue: rng.int(-40, 15), tsrKmph: null, ageDays: ageFor(rng, 'TSS', 0.6), conditionIndex: rng.range(0.3, 0.7), requestedDaysAgo: rng.int(5, 40) });
  }
  for (let i = 0; i < scaleCount(corridor, 2); i++) {
    const k = pickSectionKm(rng, corridor, rng.range(3, 6));
    push({ workType: 'OHE_REWIRING', line: rng.pick(lines), mastFrom: kmToMast(k.startKm, 'floor'), mastTo: kmToMast(k.endKm, 'ceil'), elementarySection: esLabel(corridor, k.startKm), wireThicknessMm: rng.range(8.6, 9.2), staggerDevMm: rng.int(20, 60), heightDevMm: rng.int(10, 40), sparkingEvents30d: rng.int(0, 4), daysOverdue: rng.int(-120, -20), tsrKmph: null, ageDays: ageFor(rng, 'CONTACT_WIRE', 0.85), conditionIndex: rng.range(0.6, 0.8), requestedDaysAgo: rng.int(30, 100), capital: true, noticeWeeksGiven: rng.int(4, 14), targetWeek: rng.int(2, 24), workingDaysNeeded: rng.int(5, 12) });
  }
  return recs;
}

/* ------------------------------------------------------------------------ */
/* Resources                                                                 */
/* ------------------------------------------------------------------------ */

export function generateMachines(corridor, rng) {
  const spec = corridor.lengthKm >= 300
    ? [['CSM', 2], ['BCM', 1], ['UNIMAT', 1], ['RGM', 1], ['PQRS', 1], ['CRANE', 1], ['TOWER_WAGON', 3], ['WIRING_TRAIN', 1]]
    : [['CSM', 1], ['BCM', 1], ['UNIMAT', 1], ['RGM', 1], ['PQRS', 1], ['CRANE', 1], ['TOWER_WAGON', 2], ['WIRING_TRAIN', 1]];
  const out = [];
  let n = 0;
  for (const [type, count] of spec) {
    for (let i = 0; i < count; i++) {
      n++;
      const home = rng.pick(corridor.stations.filter((s) => s.junction));
      const unavailable = [];
      if (rng.chance(0.3)) {
        const s = rng.int(2, 20);
        unavailable.push({ fromDay: s, toDay: s + rng.int(1, 4), reason: rng.pick(['Scheduled POH', 'Deputed to adjoining division', 'Hydraulic repair']) });
      }
      out.push({ id: `${type}-${String(n).padStart(2, '0')}`, type, label: MACHINE_TYPES[type].label, dept: MACHINE_TYPES[type].dept, homeStation: home.code, homeKm: home.km, healthIndex: rng.int(78, 98), hoursSinceOverhaul: rng.int(200, 2400), unavailable, speedKmph: MACHINE_TYPES[type].speedKmph });
    }
  }
  return out;
}

export function generateCrews(corridor, rng) {
  const junctions = corridor.stations.filter((s) => s.junction);
  const spec = corridor.lengthKm >= 300
    ? [['PWAY_GANG', 5], ['BRIDGE_GANG', 1], ['SIG_UNIT', 4], ['OHE_GANG', 3], ['TSS_CREW', 1]]
    : [['PWAY_GANG', 3], ['BRIDGE_GANG', 1], ['SIG_UNIT', 2], ['OHE_GANG', 2], ['TSS_CREW', 1]];
  const names = { PWAY_GANG: 'P-Way gang', BRIDGE_GANG: 'Bridge gang', SIG_UNIT: 'S&T unit', OHE_GANG: 'OHE gang', TSS_CREW: 'TSS crew' };
  const out = [];
  for (const [type, count] of spec) {
    for (let i = 0; i < count; i++) {
      // gangs are based at the junction nearest to an even spacing along the corridor
      const targetKm = ((i + 0.5) / count) * corridor.lengthKm;
      const base = junctions.reduce((best, s) => (Math.abs(s.km - targetKm) < Math.abs(best.km - targetKm) ? s : best), junctions[0]);
      const reach = type === 'TSS_CREW' ? corridor.lengthKm : Math.max(90, Math.ceil((0.75 * corridor.lengthKm) / count) + 30);
      out.push({ id: `${type}-${i + 1}`, type, label: `${names[type]} ${i + 1} (${base.code})`, dept: type === 'SIG_UNIT' ? 'SMMS' : type === 'OHE_GANG' || type === 'TSS_CREW' ? 'TDMS' : 'TMS', baseStation: base.code, baseKm: base.km, reachKm: reach, strength: rng.int(6, 16), maxMinPerDay: 480, restDay: rng.int(0, 6) });
    }
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* Learning data                                                             */
/* ------------------------------------------------------------------------ */

/** Historical failure register for Weibull fitting, per asset class. */
export function generateFailureHistory(rng, perClass = 80) {
  const out = {};
  for (const [cls, p] of Object.entries(ASSET_CLASS_PARAMS)) {
    const recs = [];
    for (let i = 0; i < perClass; i++) {
      const tFail = rng.weibull(p.beta, p.eta) * rng.range(0.9, 1.1);
      // right-censoring: the asset is still in service at the census date,
      // which is independent of when it would have failed
      const tCensor = rng.range(0.25 * p.eta, 1.6 * p.eta);
      if (tCensor < tFail) recs.push({ t: Math.round(tCensor), failed: false });
      else recs.push({ t: Math.round(tFail), failed: true });
    }
    out[cls] = recs;
  }
  return out;
}

/**
 * Historical escalation register for the ML predictor. The label is drawn
 * from a latent logistic relation so the learner has something real to
 * discover (and so its evaluation metrics are honest).
 */
export function generateEscalationHistory(rng, n = 600) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = {
      daysOverdue: rng.int(-30, 40),
      conditionIndex: rng.range(0.1, 0.98),
      gmtLoad: rng.int(15, 70),
      ageRatio: rng.range(0.2, 1.4),
      safety: rng.pick([0.35, 0.5, 0.6, 0.7, 0.8, 0.85, 0.95, 1.0]),
      hasTsr: rng.chance(0.3) ? 1 : 0
    };
    const z = -5.6 + 0.05 * s.daysOverdue + 3.0 * s.conditionIndex + 0.025 * s.gmtLoad + 1.4 * s.ageRatio + 1.2 * s.safety + 0.8 * s.hasTsr + rng.normal(0, 1.0);
    s.escalated = 1 / (1 + Math.exp(-z)) > 0.5;
    out.push(s);
  }
  return out;
}

/** Block execution log: planned vs actual durations by work type. */
export function generateExecutionLog(rng, perType = 8) {
  const bias = { TAMPING: 1.12, DEEP_SCREENING: 1.25, CONTACT_WIRE_RENEWAL: 1.18, TURNOUT_RENEWAL: 1.15, USFD_IMR_RAIL: 0.95, POINT_MACHINE_OVERHAUL: 1.05 };
  const out = [];
  for (const [wt, spec] of Object.entries(WORK_TYPES)) {
    const b = bias[wt] || 1.0;
    for (let i = 0; i < perType; i++) {
      const planned = spec.durationMin;
      const actual = Math.round(planned * b * rng.range(0.85, 1.15));
      out.push({ workType: wt, plannedMin: planned, actualMin: actual, daysAgo: rng.int(3, 120), overrunReason: actual > planned * 1.1 ? rng.pick(['Late machine arrival', 'Power block delayed', 'Material shortfall', 'Weather']) : null });
    }
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* Inspection schedule fields (separate RNG stream — the registers above do  */
/* not move)                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Inspection periodicity per work type, days. Approximate schedules in the
 * spirit of the IRPWM / USFD manual / S&T and ACTM maintenance schedules
 * (assumption for the seeded feed, not a rule book extract).
 */
export const INSPECTION_CYCLE_DAYS = {
  USFD_IMR_RAIL: 60, USFD_OBS_RAIL: 60, TAMPING: 120, DEEP_SCREENING: 180, TURNOUT_RENEWAL: 90, RAIL_GRINDING: 180, DESTRESSING: 180, CTR: 365, BRIDGE_GIRDER: 365,
  POINT_MACHINE_OVERHAUL: 30, TRACK_CIRCUIT_REPAIR: 30, AXLE_COUNTER_RESET: 90, EI_CARD_REPLACEMENT: 90, SIGNAL_CABLE: 180, LC_GATE_INTERLOCK: 30,
  CONTACT_WIRE_RENEWAL: 180, DROPPER_STAGGER: 180, INSULATOR_REPLACEMENT: 90, CANTILEVER_REPLACEMENT: 365, NEUTRAL_SECTION: 90, TSS_MAINTENANCE: 30, OHE_REWIRING: 365
};

/**
 * Adds lastInspectionDaysAgo / inspectionCycleDays to every register record
 * (about 1 in 12 seeded records is past its cycle) and a measured gauge
 * (gaugeMm, BG nominal 1676 mm) to TRC-derived tamping records.
 */
export function annotateInspections(registers, rng) {
  for (const key of ['tms', 'smms', 'tdms']) {
    for (const rec of registers[key] || []) {
      const cycle = INSPECTION_CYCLE_DAYS[rec.workType] || 90;
      const late = rng.chance(0.08);
      const frac = late ? rng.range(1.1, 2.4) : rng.range(0.05, 0.95);
      rec.inspectionCycleDays = cycle;
      rec.lastInspectionDaysAgo = Math.max(1, Math.round(cycle * frac));
      if (rec.workType === 'TAMPING' && rec.gaugeMm === undefined) rec.gaugeMm = 1676 + rng.int(-4, 9);
    }
  }
  return registers;
}

/* ------------------------------------------------------------------------ */
/* Data-quality test records                                                 */
/* ------------------------------------------------------------------------ */

const DQ_NOTE = 'seeded data-quality test record';

/**
 * A small, clearly labelled set of records per corridor that the normaliser
 * must catch (dq: true, note "seeded data-quality test record …", dqCode =
 * the issue code the record is built to trigger). Derived from the corridor
 * and the seeded registers only (no RNG).
 */
export function generateDqRecords(corridor, registers) {
  const code = corridor.code;
  const L = corridor.lengthKm;
  const junctions = corridor.stations.filter((s) => s.junction);
  const mid = junctions.reduce((best, s) => (Math.abs(s.km - L / 2) < Math.abs(best.km - L / 2) ? s : best), junctions[0]);
  const sec = corridor.blockSections[Math.floor(corridor.blockSections.length / 2)];
  const secB = corridor.blockSections[Math.max(0, Math.floor(corridor.blockSections.length / 2) - 1)];
  const lastEs = corridor.oheSections[corridor.oheSections.length - 1];
  const tms = [];
  const smms = [];
  const tdms = [];

  // 1. SMMS gear id that is not in the station's signalling table
  smms.push({ smmsId: `SMMS/${code}/DQ-1`, workType: 'POINT_MACHINE_OVERHAUL', station: mid.code, gearId: `${mid.code}-P-97C`, gearType: 'IRS electric point machine', failures90d: 2, mtbfHours: 900, backlashMm: 2.4, insulationMohm: 12, daysOverdue: 3, ageDays: 700, conditionIndex: 0.6, requestedDaysAgo: 2, dq: true, dqCode: 'UNKNOWN_GEAR', note: `${DQ_NOTE}: gear id ${mid.code}-P-97C is not in the ${mid.code} signalling table` });

  // 2. TDMS mast beyond the end of the corridor
  const far = L + 7;
  tdms.push({ tdmsId: `TDMS/${code}/DQ-1`, workType: 'INSULATOR_REPLACEMENT', line: 'DN', mastFrom: `${far}/4`, mastTo: `${far}/9`, elementarySection: lastEs.label, insulatorType: 'Composite silicone', flashoverCount90d: 1, contaminationClass: 'Medium', daysOverdue: 2, tsrKmph: null, ageDays: 800, conditionIndex: 0.55, requestedDaysAgo: 4, dq: true, dqCode: 'MAST_OUT_OF_RANGE', note: `${DQ_NOTE}: mast ${far}/4 lies beyond the corridor end (km ${L})` });

  // 3. TMS record with a line code the double-line twin does not have
  const a3 = Math.round((sec.startKm + Math.min(3, sec.lengthKm / 3)) * 10) / 10;
  tms.push({ tmsId: `TMS/${code}/DQ-1`, workType: 'TAMPING', line: 'M3', chainageFrom: formatChainage(a3, 'floor'), chainageTo: formatChainage(a3 + 1.5, 'ceil'), usfdClass: null, tgi: 44, gmt: 40, gaugeMm: 1678, daysOverdue: 4, tsrKmph: null, ageDays: 400, conditionIndex: 0.52, detectedBy: 'TRC run', requestedDaysAgo: 6, dq: true, dqCode: 'BAD_LINE', note: `${DQ_NOTE}: line code "M3" (a third line) is not UP, DN or BOTH on this double-line corridor` });

  // 4. TDMS record with a work type the planner has no rule for
  const a4 = Math.round((secB.startKm + Math.min(2, secB.lengthKm / 3)) * 10) / 10;
  tdms.push({ tdmsId: `TDMS/${code}/DQ-2`, workType: 'MAST_REALIGNMENT', line: 'UP', mastFrom: kmToMast(a4, 'floor'), mastTo: kmToMast(a4 + 0.3, 'ceil'), elementarySection: esLabel(corridor, a4), daysOverdue: 0, tsrKmph: null, ageDays: 3000, conditionIndex: 0.5, requestedDaysAgo: 3, dq: true, dqCode: 'UNKNOWN_WORKTYPE', note: `${DQ_NOTE}: work type MAST_REALIGNMENT is not in the work-type catalogue` });

  // 5. The same point machine reported in TMS (joint inspection) and in SMMS
  const pm = (registers.smms || []).find((r) => r.workType === 'POINT_MACHINE_OVERHAUL' && !r.dq);
  const gear = pm ? findSignal(corridor, pm.gearId) : null;
  if (pm && gear) {
    tms.push({ tmsId: `TMS/${code}/DQ-2`, workType: 'POINT_MACHINE_OVERHAUL', line: gear.line, station: gear.stationCode, turnoutNo: gear.pointNo, chainageFrom: formatChainage(gear.km), chainageTo: formatChainage(gear.km), usfdClass: null, tgi: null, gmt: 40, daysOverdue: pm.daysOverdue, tsrKmph: null, ageDays: pm.ageDays, conditionIndex: pm.conditionIndex, detectedBy: 'Joint P-Way / S&T point inspection', requestedDaysAgo: 1, dq: true, dqCode: 'DUPLICATE', note: `${DQ_NOTE}: points ${gear.pointNo} at ${gear.stationCode} are also on the SMMS register` });
  }

  // 6. A physically impossible measurement (gauge keyed as 1740 mm)
  const a6 = Math.round((sec.startKm + Math.min(5, sec.lengthKm / 2)) * 10) / 10;
  tms.push({ tmsId: `TMS/${code}/DQ-3`, workType: 'TAMPING', line: 'DN', chainageFrom: formatChainage(a6, 'floor'), chainageTo: formatChainage(a6 + 1.2, 'ceil'), usfdClass: null, tgi: 41, gmt: 38, gaugeMm: 1740, daysOverdue: 2, tsrKmph: null, ageDays: 380, conditionIndex: 0.55, detectedBy: 'TRC run', requestedDaysAgo: 5, dq: true, dqCode: 'VALUE_OUT_OF_RANGE', note: `${DQ_NOTE}: gauge keyed as 1740 mm (broad gauge nominal 1676 mm)` });

  const dqInspect = (r) => ({ ...r, inspectionCycleDays: INSPECTION_CYCLE_DAYS[r.workType] || 90, lastInspectionDaysAgo: 10 });
  return { tms: tms.map(dqInspect), smms: smms.map(dqInspect), tdms: tdms.map(dqInspect) };
}

/* ------------------------------------------------------------------------ */
/* Recent failure log (for failure-spike detection)                         */
/* ------------------------------------------------------------------------ */

const CLASS_SYSTEM = { RAIL: 'TMS', BALLAST: 'TMS', TURNOUT: 'TMS', BRIDGE: 'TMS', POINT_MACHINE: 'SMMS', TRACK_CIRCUIT: 'SMMS', AXLE_COUNTER: 'SMMS', EI: 'SMMS', CABLE: 'SMMS', LC_GATE: 'SMMS', CONTACT_WIRE: 'TDMS', INSULATOR: 'TDMS', CANTILEVER: 'TDMS', NEUTRAL_SECTION: 'TDMS', TSS: 'TDMS' };

/**
 * Seasonal hazard multipliers used to seed the recent failure log from the
 * past window's weather (assumed couplings, stated with each factor):
 * rain → track-circuit / axle-counter / point / LC-gate failures (ballast
 * resistance, water ingress), fog nights → insulator flashovers (pollution
 * + moisture), hot days → rail and contact-wire defects.
 */
export function seasonalHazardMultipliers(totals) {
  const f = (x) => Math.round(x * 100) / 100;
  return {
    TRACK_CIRCUIT: { factor: f(1 + Math.min(1.5, totals.rainMm / 600)), reason: `${totals.rainMm} mm rain in the window lowers ballast resistance` },
    AXLE_COUNTER: { factor: f(1 + Math.min(0.8, totals.rainMm / 1200)), reason: `${totals.rainMm} mm rain (water ingress in detector heads)` },
    POINT_MACHINE: { factor: f(1 + Math.min(0.6, totals.rainMm / 1500)), reason: `${totals.rainMm} mm rain (insulation and friction)` },
    LC_GATE: { factor: f(1 + Math.min(0.5, totals.rainMm / 2000)), reason: `${totals.rainMm} mm rain` },
    INSULATOR: { factor: f(1 + Math.min(1.2, totals.fogNights / 25)), reason: `${totals.fogNights} fog nights (pollution flashover)` },
    RAIL: { factor: f(1 + Math.min(0.8, totals.hotDays / 40)), reason: `${totals.hotDays} days at ≥ 40 °C` },
    CONTACT_WIRE: { factor: f(1 + Math.min(0.5, totals.hotDays / 60)), reason: `${totals.hotDays} days at ≥ 40 °C (sag, hard spots)` }
  };
}

/**
 * Seeded failure log for the `windowDays` before plan start. The in-service
 * population of each asset class is the censored part of the failure
 * register (assets still running at census, with their ages); the expected
 * count in the window is Σ[H(a) − H(a − W)] with the class's generating
 * Weibull, scaled by the seasonal multiplier above; the log holds that
 * expected count (rounded), so a class shows a spike only when the weather
 * multiplier drives it. Event dates and assets are drawn from the RNG and
 * carry a real reference from the twin (gear id, mast, chainage, TSS).
 */
export function generateFailureLog(corridor, failureHistory, pastWeather, rng, { windowDays = 90, planStart = '2026-09-07' } = {}) {
  const totals = weatherTotals(pastWeather);
  const mult = seasonalHazardMultipliers(totals);
  const startIso = toIsoDate(planStart);
  const signals = corridor.signals || [];
  const pickSig = (pred) => {
    const list = signals.filter(pred);
    return list.length ? rng.pick(list).id : null;
  };
  const junctions = corridor.stations.filter((s) => s.junction);
  const events = [];
  const expectedTrue = {};
  let seq = 0;
  for (const [cls, p] of Object.entries(ASSET_CLASS_PARAMS)) {
    const ages = (failureHistory[cls] || []).filter((r) => !r.failed).map((r) => r.t);
    const H = (t) => Math.pow(Math.max(0, t) / p.eta, p.beta);
    const base = ages.reduce((a, t) => a + H(t) - H(t - windowDays), 0);
    const factor = mult[cls] ? mult[cls].factor : 1;
    expectedTrue[cls] = Math.round(base * factor * 100) / 100;
    const n = Math.round(base * factor); // expected count under the seasonal multiplier (dates and assets are drawn)
    for (let i = 0; i < n; i++) {
      seq++;
      const daysAgo = rng.int(1, windowDays);
      const km = Math.round(rng.range(0.5, corridor.lengthKm - 0.5) * 100) / 100;
      let assetRef;
      if (cls === 'POINT_MACHINE' || cls === 'TURNOUT') assetRef = pickSig((g) => g.kind === 'POINT');
      else if (cls === 'TRACK_CIRCUIT') assetRef = pickSig((g) => g.kind === 'TRACK_CIRCUIT' && g.detection !== 'SSDAC');
      else if (cls === 'AXLE_COUNTER') assetRef = pickSig((g) => g.detection === 'SSDAC');
      else if (cls === 'LC_GATE') assetRef = pickSig((g) => g.kind === 'LC_GATE');
      else if (cls === 'CABLE') assetRef = pickSig((g) => g.kind !== 'POINT');
      else if (cls === 'EI') assetRef = `EI-${rng.pick(junctions).code}`;
      else if (cls === 'TSS') assetRef = rng.pick(corridor.tss).code;
      else if (cls === 'CONTACT_WIRE' || cls === 'INSULATOR' || cls === 'CANTILEVER' || cls === 'NEUTRAL_SECTION') assetRef = `mast ${kmToMast(km)}`;
      else assetRef = `km ${formatChainage(km)}`;
      events.push({ id: `FL/${corridor.code}/${seq}`, assetClass: cls, system: CLASS_SYSTEM[cls], daysAgo, date: addDaysIso(startIso, -daysAgo), assetRef, source: 'seeded' });
    }
  }
  events.sort((a, b) => a.daysAgo - b.daysAgo || a.id.localeCompare(b.id));
  return {
    windowDays,
    source: 'seeded',
    note: 'Seeded failure log: per class, the count expected from the generating Weibull hazard of the in-service population, scaled by weather-driven seasonal multipliers (assumed couplings); dates and assets drawn at random.',
    weather: totals,
    multipliers: mult,
    expectedTrue,
    events
  };
}

/* ------------------------------------------------------------------------ */
/* Bundle                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * @param corridor enriched corridor
 * @param opts.seed       RNG seed (26027)
 * @param opts.forecastDays FOIS / weather horizon (30)
 * @param opts.planStart  plan start (Date or 'YYYY-MM-DD'); dates the weather feed and the failure log
 * @param opts.dqRecords  append the labelled data-quality test records (true)
 */
export function buildFeeds(corridor, { seed = 26027, forecastDays = 30, planStart = '2026-09-07', dqRecords = true } = {}) {
  const rng = createRng(seed + corridor.id.length * 31 + corridor.lengthKm);
  const timetable = generateTimetable(corridor, rng);
  const freight = generateFreightForecast(corridor, rng, forecastDays);
  const tms = generateTmsRegister(corridor, rng);
  const smms = generateSmmsRegister(corridor, rng);
  const tdms = generateTdmsRegister(corridor, rng);
  const machines = generateMachines(corridor, rng);
  const crews = generateCrews(corridor, rng);
  const shared = createRng(seed);
  const failureHistory = generateFailureHistory(shared);
  const escalationHistory = generateEscalationHistory(shared);
  const executionLog = generateExecutionLog(shared);
  // separate streams: adding these never moves the records above
  annotateInspections({ tms, smms, tdms }, createRng((seed ^ 0x1b5e) + corridor.lengthKm));
  if (dqRecords) {
    const dq = generateDqRecords(corridor, { tms, smms, tdms });
    tms.push(...dq.tms);
    smms.push(...dq.smms);
    tdms.push(...dq.tdms);
  }
  const startIso = toIsoDate(planStart);
  const weather = buildWeatherFeed(corridor, seed, startIso, forecastDays);
  const pastWeather = buildWeatherFeed(corridor, seed, addDaysIso(startIso, -90), 90);
  const failureLog = generateFailureLog(corridor, failureHistory, pastWeather, createRng((seed ^ 0xfa11) + corridor.lengthKm), { windowDays: 90, planStart: startIso });
  return { corridorId: corridor.id, seed, planStart: startIso, timetable, freight, tms, smms, tdms, machines, crews, failureHistory, escalationHistory, executionLog, weather, failureLog };
}

export function assetClassOf(workType) {
  return WORK_TYPES[workType] ? WORK_TYPES[workType].assetClass : 'RAIL';
}

export { sectionAtKm };
