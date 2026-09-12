/**
 * Spatial-temporal normalisation engine.
 *
 * Every departmental system references location differently:
 *   TMS  – line code + civil chainage "km/telegraph-post" text ("234/6")
 *   SMMS – station yard + gear id from the signalling table (corridor.signals)
 *   TDMS – OHE mast numbers ("234/12") + elementary section, or a TSS code
 * This module resolves all of them onto the corridor network graph (route km,
 * line, block sections, OHE elementary sections), validates each record,
 * matches the same asset reported in two systems, and produces one unified
 * task register for the risk engine and the optimiser. Records that cannot
 * be placed or trusted are rejected (they never reach the plan) and every
 * finding is raised as an issue back to the source system.
 */
import { WORK_TYPES, DEPARTMENTS } from './constants.js';
import { sectionsInRange, oheSectionsInRange, sectionAtKm, findSignal, stationByCode, mastToKmId, parseChainage } from './corridors.js';
import { calibratedDuration } from './productivity.js';

/** Parse "145/12" mast reference back to a chainage (km). */
export function mastToKm(ref) {
  const k = mastToKmId(ref);
  if (k !== null) return k;
  const [km, idx] = String(ref).split('/').map(Number);
  return km + ((idx || 1) - 1) * 0.055;
}

/**
 * Issue codes. severity 'reject' = the record is quarantined and does not
 * enter the plan; 'warn' = the record is planned and the finding is raised
 * back to the source system.
 */
export const ISSUE_CODES = {
  UNKNOWN_WORKTYPE: { severity: 'reject', label: 'Work type not in the catalogue' },
  BAD_LINE: { severity: 'reject', label: 'Line code not recognised' },
  UNKNOWN_GEAR: { severity: 'reject', label: 'Gear id not in the signalling table' },
  UNKNOWN_STATION: { severity: 'reject', label: 'Station code not on this corridor' },
  UNKNOWN_TSS: { severity: 'reject', label: 'TSS code not on this corridor' },
  BAD_MAST: { severity: 'reject', label: 'Mast id not readable' },
  MAST_OUT_OF_RANGE: { severity: 'reject', label: 'Mast outside the corridor' },
  BAD_CHAINAGE: { severity: 'reject', label: 'Chainage not readable' },
  CHAINAGE_OUT_OF_RANGE: { severity: 'reject', label: 'Chainage outside the corridor' },
  MISSING_LOCATION: { severity: 'reject', label: 'No location reference' },
  VALUE_OUT_OF_RANGE: { severity: 'reject', label: 'Measurement physically impossible' },
  DUPLICATE: { severity: 'reject', label: 'Same asset and work already reported in another system' },
  SAME_ASSET: { severity: 'warn', label: 'Same asset has works in two systems' },
  GEAR_STATION_MISMATCH: { severity: 'warn', label: 'Gear belongs to a different station' },
  LINE_MISMATCH: { severity: 'warn', label: 'Line differs from the gear table' },
  ES_MISMATCH: { severity: 'warn', label: 'Mast not in the stated elementary section' },
  TSR_NOT_DUE: { severity: 'warn', label: 'TSR in force but work not yet due' }
};

/**
 * Physically possible ranges of register measurements. A value outside is a
 * keying / sensor error (VALUE_OUT_OF_RANGE), not a defect.
 */
export const PLAUSIBLE_RANGES = {
  gaugeMm: { min: 1650, max: 1720, unit: 'mm', what: 'track gauge (BG nominal 1676 mm)' },
  wireThicknessMm: { min: 4, max: 12.5, unit: 'mm', what: 'contact-wire residual thickness (new wire 12.24 mm)' },
  wearPct: { min: 0, max: 100, unit: '%', what: 'contact-wire wear' },
  conditionIndex: { min: 0, max: 1, unit: '', what: 'condition index (0–1)' },
  ageDays: { min: 0, max: 36500, unit: 'days', what: 'asset age' },
  tsrKmph: { min: 5, max: 160, unit: 'km/h', what: 'TSR speed' },
  tgi: { min: 0, max: 150, unit: '', what: 'track geometry index' },
  gmt: { min: 0, max: 200, unit: 'GMT/yr', what: 'annual traffic' },
  oilTempC: { min: -10, max: 130, unit: '°C', what: 'transformer oil temperature' },
  oilBdvKv: { min: 0, max: 120, unit: 'kV', what: 'oil breakdown voltage' },
  insulationMohm: { min: 0, max: 10000, unit: 'MΩ', what: 'insulation resistance' },
  backlashMm: { min: 0, max: 20, unit: 'mm', what: 'point-machine backlash' },
  failures90d: { min: 0, max: 500, unit: 'failures', what: 'failures in 90 days' },
  staggerDevMm: { min: 0, max: 500, unit: 'mm', what: 'stagger deviation' },
  heightDevMm: { min: 0, max: 500, unit: 'mm', what: 'contact-wire height deviation' },
  mtbfHours: { min: 0, max: 1000000, unit: 'h', what: 'MTBF' },
  lastInspectionDaysAgo: { min: 0, max: 36500, unit: 'days', what: 'days since last inspection' }
};

const LINE_ALIASES = {
  UP: 'UP', U: 'UP', 'UP MAIN': 'UP', 'UP LINE': 'UP', UPMAIN: 'UP', UP_MAIN: 'UP',
  DN: 'DN', D: 'DN', DOWN: 'DN', 'DN MAIN': 'DN', 'DOWN MAIN': 'DN', 'DN LINE': 'DN', 'DOWN LINE': 'DN', DNMAIN: 'DN', DN_MAIN: 'DN',
  BOTH: 'BOTH', B: 'BOTH', 'UP & DN': 'BOTH', 'UP/DN': 'BOTH', 'UP&DN': 'BOTH', 'UP-DN': 'BOTH', 'DN/UP': 'BOTH', 'UP AND DN': 'BOTH'
};

/** Normalise a line code ("Down main" → DN). Returns null if not recognised. */
export function normalizeLine(raw) {
  if (raw === undefined || raw === null) return null;
  const k = String(raw).trim().toUpperCase().replace(/\s+/g, ' ');
  return LINE_ALIASES[k] || null;
}

const isNum = (v) => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
const toNum = (v) => (typeof v === 'number' ? v : Number(v));
const present = (v) => v !== undefined && v !== null && String(v).trim() !== '';
const r3 = (x) => Math.round(x * 1000) / 1000;

/** Record id of a native register record. */
export function recordIdOf(rec) {
  return rec.tmsId || rec.smmsId || rec.tdmsId || rec.id || null;
}

/** Physically impossible measurements → VALUE_OUT_OF_RANGE errors. */
export function checkValues(rec) {
  const out = [];
  for (const [field, r] of Object.entries(PLAUSIBLE_RANGES)) {
    const v = rec[field];
    if (v === undefined || v === null || v === '') continue;
    if (!isNum(v)) continue;
    const x = toNum(v);
    if (x < r.min || x > r.max) {
      out.push({ code: 'VALUE_OUT_OF_RANGE', field, message: `${r.what} recorded as ${x}${r.unit ? ` ${r.unit}` : ''}; possible range is ${r.min}–${r.max}${r.unit ? ` ${r.unit}` : ''}`, suggestedFix: `Re-measure or correct the ${field} entry in the source register (likely a keying error).` });
    }
  }
  return out;
}

function gearHint(corridor, rec) {
  const st = stationByCode(corridor, rec.station) || null;
  const id = String(rec.gearId || '');
  const kind = /-P-/.test(id) ? 'POINT' : /-TC-/.test(id) ? 'TRACK_CIRCUIT' : /-S-/.test(id) ? null : /^LC/i.test(id) ? 'LC_GATE' : null;
  let list = corridor.signals || [];
  if (st) list = list.filter((g) => g.stationCode === st.code);
  if (kind) list = list.filter((g) => g.kind === kind);
  else if (/-S-/.test(id)) list = list.filter((g) => ['DISTANT', 'HOME', 'STARTER', 'ADV_STARTER'].includes(g.kind));
  const ids = list.slice(0, 6).map((g) => g.id);
  return ids.length ? `Check the gear id against the ${st ? st.code : 'station'} signal interlocking plan; known ids there include ${ids.join(', ')}.` : 'Check the gear id against the station signal interlocking plan and the station code.';
}

/**
 * Resolve the location of one native record (TMS / SMMS / TDMS) on the
 * corridor. Returns { ok, startKm, endKm, line, via, station, assetKey,
 * gearId, sectionLabel, errors[], warnings[] }; errors carry
 * { code, field, message, suggestedFix }.
 */
export function resolveRecordLocation(system, rec, corridor) {
  const sys = String(system || '').toUpperCase();
  const errors = [];
  const warnings = [];
  const E = (code, field, message, suggestedFix) => errors.push({ code, field, message, suggestedFix });
  const W = (code, field, message, suggestedFix) => warnings.push({ code, field, message, suggestedFix });
  const L = corridor.lengthKm;
  let startKm = null;
  let endKm = null;
  let line = null;
  let via = null;
  let station = null;
  let assetKey = null;
  let gearId = null;
  const badLine = () => E('BAD_LINE', 'line', `Line code "${rec.line ?? ''}" is not UP, DN or BOTH on this double-line corridor`, 'Correct the line code in the source register (UP, DN or BOTH); third lines and loops are not modelled in the corridor twin.');
  const numericFallback = () => {
    const a = isNum(rec.fromKm) ? toNum(rec.fromKm) : isNum(rec.km) ? toNum(rec.km) : null;
    if (a === null) return false;
    startKm = a;
    endKm = isNum(rec.toKm) ? toNum(rec.toKm) : a;
    via = 'numeric';
    return true;
  };

  if (sys === 'SMMS') {
    const g = present(rec.gearId) ? findSignal(corridor, rec.gearId) : null;
    const yard = present(rec.gearId) ? String(rec.gearId).trim().match(/^EI-([A-Z]+)$/i) : null;
    if (g) {
      gearId = g.id;
      startKm = g.km;
      endKm = g.km;
      line = g.line;
      station = g.stationCode;
      via = 'gear';
      assetKey = g.kind === 'POINT' ? `PT:${g.stationCode}:${g.pointNo}` : `SIG:${g.id}`;
      const recSt = present(rec.station) ? String(rec.station).trim().toUpperCase() : null;
      if (recSt && recSt !== g.stationCode) W('GEAR_STATION_MISMATCH', 'station', `Gear ${g.id} belongs to ${g.stationCode}, but the record names station ${recSt}`, `Correct the station to ${g.stationCode} or the gear id in SMMS.`);
      if (present(rec.line)) {
        const rl = normalizeLine(rec.line);
        if (rl && g.line !== 'BOTH' && rl !== 'BOTH' && rl !== g.line) W('LINE_MISMATCH', 'line', `Record says ${rl} line but gear ${g.id} is on the ${g.line} line in the signalling table`, 'The gear table wins; correct the line in SMMS.');
      }
      if (isNum(rec.cableLengthM) && toNum(rec.cableLengthM) > 0) {
        const tw = stationByCode(corridor, rec.towards);
        const dir = tw ? Math.sign(tw.km - g.km) || 1 : 1;
        endKm = r3(g.km + (dir * toNum(rec.cableLengthM)) / 1000);
        if (endKm < startKm) [startKm, endKm] = [endKm, startKm];
        if (present(rec.towards) && !tw) W('UNKNOWN_STATION', 'towards', `Cable route direction "${rec.towards}" is not a station on this corridor`, 'Name the station the cable route runs towards.');
      }
    } else if (yard) {
      const st = stationByCode(corridor, yard[1]);
      if (st) {
        gearId = `EI-${st.code}`;
        startKm = st.km;
        endKm = st.km;
        station = st.code;
        via = 'station';
        assetKey = `EI:${st.code}`;
        line = present(rec.line) ? normalizeLine(rec.line) : 'BOTH';
        if (!line) badLine();
      } else {
        E('UNKNOWN_GEAR', 'gearId', `Interlocking "${rec.gearId}" names station ${yard[1].toUpperCase()}, which is not on ${corridor.code}`, 'Correct the station part of the EI id (EI-<station code>).');
      }
    } else if (!present(rec.gearId) && numericFallback()) {
      line = normalizeLine(rec.line);
      if (!line) badLine();
      station = present(rec.station) ? String(rec.station).trim().toUpperCase() : null;
    } else if (present(rec.gearId)) {
      E('UNKNOWN_GEAR', 'gearId', `Gear id "${rec.gearId}" is not in the ${corridor.code} signalling table${present(rec.station) ? ` (station ${rec.station})` : ''}`, gearHint(corridor, rec));
    } else {
      E('MISSING_LOCATION', 'gearId', 'SMMS record has no gear id and no chainage', 'Add the gear id from the station signal interlocking plan.');
    }
  } else if (sys === 'TDMS') {
    if (present(rec.tssCode)) {
      const code = String(rec.tssCode).trim().toUpperCase();
      const t = corridor.tss.find((x) => x.code.toUpperCase() === code);
      if (t) {
        startKm = t.km;
        endKm = t.km;
        via = 'tss';
        assetKey = `TSS:${t.code}`;
        line = present(rec.line) ? normalizeLine(rec.line) : 'BOTH';
        if (!line) badLine();
      } else {
        E('UNKNOWN_TSS', 'tssCode', `TSS "${rec.tssCode}" is not on ${corridor.code} (TSS: ${corridor.tss.map((x) => x.code).join(', ')})`, 'Correct the TSS code in TDMS.');
      }
    } else if (present(rec.mastFrom)) {
      const a = mastToKmId(rec.mastFrom);
      const b = present(rec.mastTo) ? mastToKmId(rec.mastTo) : a;
      via = 'mast';
      if (a === null) E('BAD_MAST', 'mastFrom', `Mast id "${rec.mastFrom}" is not in km/mast form`, 'Write the mast as km/mast number, e.g. 234/12.');
      else if (a < 0 || a > L) E('MAST_OUT_OF_RANGE', 'mastFrom', `Mast ${rec.mastFrom} is at km ${a}, outside the corridor (km 0–${L})`, 'Check the mast number against the OHE layout plan; the record may belong to the adjoining division.');
      if (present(rec.mastTo) && b === null) E('BAD_MAST', 'mastTo', `Mast id "${rec.mastTo}" is not in km/mast form`, 'Write the mast as km/mast number, e.g. 234/12.');
      else if (b !== null && a !== null && a >= 0 && a <= L && (b < 0 || b > L)) E('MAST_OUT_OF_RANGE', 'mastTo', `Mast ${rec.mastTo} is at km ${b}, outside the corridor (km 0–${L})`, 'Check the end mast against the OHE layout plan.');
      if (a !== null && b !== null) {
        startKm = Math.min(a, b);
        endKm = Math.max(a, b);
        assetKey = `MAST:${String(rec.mastFrom).trim()}`;
        if (present(rec.elementarySection) && startKm >= 0 && startKm <= L) {
          const es = corridor.oheSections.find((s) => s.label === String(rec.elementarySection).trim());
          if (!es) W('ES_MISMATCH', 'elementarySection', `Elementary section "${rec.elementarySection}" does not exist on ${corridor.code}`, `Use the ES label from the OHE sectioning diagram (${corridor.oheSections[0].label}–${corridor.oheSections[corridor.oheSections.length - 1].label}).`);
          else if (startKm < es.startKm - 0.1 || startKm > es.endKm + 0.1) W('ES_MISMATCH', 'elementarySection', `Mast ${rec.mastFrom} (km ${startKm}) is not inside ${es.label} (km ${es.startKm}–${es.endKm})`, 'Correct the mast number or the elementary section in TDMS.');
        }
      }
      line = normalizeLine(rec.line);
      if (!line) badLine();
    } else if (numericFallback()) {
      line = normalizeLine(rec.line);
      if (!line) badLine();
    } else {
      E('MISSING_LOCATION', 'mastFrom', 'TDMS record has no mast, TSS code or chainage', 'Add the mast number (km/mast) or the TSS code.');
    }
  } else {
    // TMS
    line = normalizeLine(rec.line);
    if (!line) badLine();
    const fromTxt = present(rec.chainageFrom) ? rec.chainageFrom : present(rec.chainage) ? rec.chainage : null;
    if (fromTxt !== null) {
      via = 'chainage';
      startKm = parseChainage(fromTxt);
      if (startKm === null) E('BAD_CHAINAGE', 'chainageFrom', `Chainage "${fromTxt}" is not in km/telegraph-post form`, 'Write chainage as km/TP, e.g. 234/6 or 234/6-7.');
      if (present(rec.chainageTo)) {
        endKm = parseChainage(rec.chainageTo);
        if (endKm === null) E('BAD_CHAINAGE', 'chainageTo', `Chainage "${rec.chainageTo}" is not in km/telegraph-post form`, 'Write chainage as km/TP, e.g. 234/9.');
      } else endKm = startKm;
    } else if (!numericFallback()) {
      const st = present(rec.station) ? stationByCode(corridor, rec.station) : null;
      if (st) {
        startKm = st.km;
        endKm = st.km;
        via = 'station';
      } else if (present(rec.station)) E('UNKNOWN_STATION', 'station', `Station "${rec.station}" is not on ${corridor.code}`, 'Correct the station code or give the chainage (km/TP).');
      else E('MISSING_LOCATION', 'chainageFrom', 'TMS record has no chainage, km or station', 'Add the chainage as km/TP.');
    }
    if (present(rec.station)) {
      const st = stationByCode(corridor, rec.station);
      station = st ? st.code : String(rec.station).trim().toUpperCase();
      if (present(rec.turnoutNo)) assetKey = `PT:${station}:${String(rec.turnoutNo).trim()}`;
    }
    if (present(rec.bridgeNo)) assetKey = `BR:${String(rec.bridgeNo).trim()}`;
  }

  if (startKm !== null && endKm !== null && !errors.some((e) => e.code === 'MAST_OUT_OF_RANGE' || e.code === 'BAD_CHAINAGE' || e.code === 'BAD_MAST')) {
    if (startKm > endKm) [startKm, endKm] = [endKm, startKm];
    if (startKm < 0 || endKm > L) E('CHAINAGE_OUT_OF_RANGE', via === 'chainage' ? 'chainageFrom' : 'fromKm', `Location km ${startKm}–${endKm} is outside the corridor (km 0–${L})`, 'Check the chainage; the work may belong to the adjoining division.');
  }
  let sectionLabel = null;
  if (!errors.length && startKm !== null) {
    const secs = sectionsInRange(corridor, startKm, endKm);
    sectionLabel = (secs.length ? secs : [sectionAtKm(corridor, startKm)]).map((s) => s.label).join(' / ');
  }
  return { ok: errors.length === 0, startKm, endKm, line, via, station, assetKey, gearId, sectionLabel, errors, warnings };
}

function closureOf(blockKind, workType) {
  if (blockKind === 'DISCONNECTION') return 'NONE';
  if (workType === 'TSS_MAINTENANCE') return 'NONE'; // extended feed from adjacent TSS
  return 'LINE';
}

function baseTask(corridor, source, rec, id, loc) {
  const spec = WORK_TYPES[rec.workType];
  const startKm = loc.startKm;
  const endKm = loc.endKm;
  const secs = sectionsInRange(corridor, startKm, endKm);
  const sections = secs.length ? secs.map((s) => s.index) : [sectionAtKm(corridor, startKm).index];
  const ohe = oheSectionsInRange(corridor, startKm, endKm).map((s) => s.index);
  const daysOverdue = rec.daysOverdue || 0;
  const dueDay = spec.mandatoryWithinDays - daysOverdue; // day index (relative to plan start) by which the work must be done
  return {
    id,
    sourceId: recordIdOf(rec),
    source,
    dept: spec.dept,
    deptLabel: DEPARTMENTS[spec.dept].short,
    workType: rec.workType,
    label: spec.label,
    assetClass: spec.assetClass,
    line: loc.line || 'DN',
    startKm,
    endKm,
    lengthKm: Math.max(0, endKm - startKm),
    sections,
    sectionLabel: sections.map((i) => corridor.blockSections[i].label).join(' / '),
    oheSections: ohe,
    station: rec.station || loc.station || null,
    locatedBy: loc.via,
    blockKind: spec.blockKind,
    closure: closureOf(spec.blockKind, rec.workType),
    baseDurationMin: spec.durationMin,
    durationMin: spec.durationMin,
    setupMin: spec.setupMin,
    clearanceMin: spec.clearanceMin,
    machine: spec.machine,
    crew: spec.crew,
    safety: spec.safety,
    capital: !!spec.capital,
    mandatoryWithinDays: spec.mandatoryWithinDays,
    daysOverdue,
    dueDay,
    requestedDaysAgo: rec.requestedDaysAgo || 0,
    ageDays: rec.ageDays || 0,
    conditionIndex: rec.conditionIndex || 0.5,
    tsrKmph: rec.tsrKmph || null,
    tsrSinceDays: rec.tsrKmph ? rec.tsrSinceDays || 0 : 0,
    noticeWeeksGiven: rec.noticeWeeksGiven || null,
    targetWeek: rec.targetWeek || null,
    workingDaysNeeded: rec.workingDaysNeeded || 1,
    metrics: rec
  };
}

const kmTxt = (x) => (Math.round(x * 1000) / 1000).toString();

/** Human readable native location for provenance display. */
function nativeLocation(source, rec, loc) {
  if (source === 'TMS') {
    const ch = present(rec.chainageFrom) ? `km ${rec.chainageFrom}${present(rec.chainageTo) && rec.chainageTo !== rec.chainageFrom ? `–${rec.chainageTo}` : ''}` : `km ${kmTxt(loc.startKm)}–${kmTxt(loc.endKm)}`;
    if (rec.station && rec.turnoutNo) return `${rec.station} yard, turnout ${rec.turnoutNo} (${ch})`;
    if (rec.bridgeNo) return `${rec.line} line, ${rec.bridgeNo} (${ch})`;
    return `${rec.line} line, ${ch}`;
  }
  if (source === 'SMMS') {
    const base = `${rec.station || loc.station} yard · ${rec.gearId || `km ${kmTxt(loc.startKm)}`}`;
    return rec.cableLengthM ? `${base} → ${rec.towards || ''} ${rec.cableLengthM} m`.replace(/\s+/g, ' ').trim() : base;
  }
  if (rec.tssCode) return rec.tssCode;
  if (rec.mastFrom) return `Mast ${rec.mastFrom} → ${rec.mastTo || rec.mastFrom} (${rec.line}${rec.elementarySection ? `, ${rec.elementarySection}` : ''})`;
  return `${rec.line} line, km ${kmTxt(loc.startKm)}–${kmTxt(loc.endKm)}`;
}

/**
 * Entity matching across systems: two records on the same line (or BOTH),
 * km within 0.1 of each other, describing an overlapping asset.
 *   same work type (or same asset key and asset class) → DUPLICATE: the record
 *     from the system that owns the work type is kept, the other rejected;
 *   same asset key or asset class, different work → SAME_ASSET (warning).
 * Mutates the candidates' errors / warnings and returns the matches.
 */
export function matchEntities(cands, tolKm = 0.1) {
  const matches = [];
  for (let i = 0; i < cands.length; i++) {
    for (let j = i + 1; j < cands.length; j++) {
      const a = cands[i];
      const b = cands[j];
      if (a.errors.length || b.errors.length) continue;
      if (a.sys === b.sys) continue;
      const la = a.loc.line;
      const lb = b.loc.line;
      if (!(la === lb || la === 'BOTH' || lb === 'BOTH')) continue;
      const gap = Math.abs(a.loc.startKm - b.loc.startKm);
      if (gap > tolKm + 1e-9) continue;
      const wa = WORK_TYPES[a.rec.workType];
      const wb = WORK_TYPES[b.rec.workType];
      const sameKey = !!a.loc.assetKey && a.loc.assetKey === b.loc.assetKey;
      const sameClass = wa.assetClass === wb.assetClass;
      const sameWork = a.rec.workType === b.rec.workType;
      const where = `${a.loc.line === 'BOTH' ? b.loc.line : a.loc.line} line km ${kmTxt(a.loc.startKm)}${a.loc.assetKey ? ` (${a.loc.assetKey.replace(/^[A-Z]+:/, '').replace(/:/g, ' ')})` : ''}`;
      if (sameWork || (sameKey && sameClass)) {
        const aOwns = wa.dept === a.sys;
        const bOwns = wb.dept === b.sys;
        const keep = aOwns || !bOwns ? a : b;
        const drop = keep === a ? b : a;
        const owner = WORK_TYPES[keep.rec.workType].dept;
        drop.errors.push({
          code: 'DUPLICATE',
          field: drop.loc.gearId ? 'gearId' : drop.rec.turnoutNo ? 'turnoutNo' : 'workType',
          message: `Same asset and work as ${keep.sys} ${keep.recordId} at ${where}; counted once`,
          suggestedFix: `Close the ${drop.sys} entry or link it to ${keep.recordId}; the ${keep.sys} record is kept${keep.sys === owner ? ` because ${DEPARTMENTS[owner].short} owns ${WORK_TYPES[keep.rec.workType].label.toLowerCase()}` : ' (reported first)'}.`,
          relatedId: keep.recordId,
          relatedSystem: keep.sys
        });
        matches.push({ kind: 'DUPLICATE', kept: keep.recordId, dropped: drop.recordId, systems: [keep.sys, drop.sys], km: a.loc.startKm, line: a.loc.line, assetKey: a.loc.assetKey || null, gapKm: r3(gap) });
      } else if (sameKey || sameClass) {
        b.warnings.push({
          code: 'SAME_ASSET',
          field: 'workType',
          message: `Same asset also on ${a.sys} as ${a.recordId} (${wa.label}) at ${where}`,
          suggestedFix: 'Plan the two works as one joint block, or sequence them if they cannot share the possession.',
          relatedId: a.recordId,
          relatedSystem: a.sys
        });
        matches.push({ kind: 'SAME_ASSET', a: a.recordId, b: b.recordId, systems: [a.sys, b.sys], km: a.loc.startKm, line: a.loc.line, assetKey: a.loc.assetKey || null, gapKm: r3(gap) });
      }
    }
  }
  return matches;
}

const SYSTEMS = [
  ['TMS', 'tms', 'tmsId'],
  ['SMMS', 'smms', 'smmsId'],
  ['TDMS', 'tdms', 'tdmsId']
];

/**
 * Build the unified task register.
 * @param corridor enriched corridor
 * @param feeds output of dataFactory.buildFeeds (or live / imported feeds with the same shape)
 * @param durationFactors output of productivity.learnDurationFactors
 * @returns {{ tasks, issues, rejects, matches, locations, counts }}
 *   issues[]  { code, severity:'reject'|'warn', system, source, recordId, id, field, message, issue, suggestedFix, rejected, dq, taskId?, relatedId? }
 *   rejects[] { code, codes, system, recordId, field, message, suggestedFix, dq, record }
 *   counts    { TMS, SMMS, TDMS, total, rejected, dq, warnings, byCode }
 *   Task ids follow a running counter over TMS → SMMS → TDMS records
 *   (rejected records keep their number), e.g. TMS-001, SMMS-031.
 */
export function normalize(corridor, feeds, durationFactors = {}) {
  const cands = [];
  let n = 0;
  for (const [sys, key, idKey] of SYSTEMS) {
    for (const rec of feeds[key] || []) {
      n++;
      const recordId = rec[idKey] || recordIdOf(rec) || `${sys}/UNNAMED/${n}`;
      const c = { sys, rec, recordId, seq: n, errors: [], warnings: [] };
      if (!WORK_TYPES[rec.workType]) {
        const own = Object.entries(WORK_TYPES).filter(([, w]) => w.dept === sys).map(([k]) => k);
        c.errors.push({ code: 'UNKNOWN_WORKTYPE', field: 'workType', message: `Work type "${rec.workType ?? ''}" is not in the work-type catalogue, so no block kind, duration or crew can be assigned`, suggestedFix: `Map it to a catalogue work type (${sys}: ${own.join(', ')}) or add it to the catalogue with its block kind and duration.` });
      }
      c.loc = resolveRecordLocation(sys, rec, corridor);
      c.errors.push(...c.loc.errors);
      c.warnings.push(...c.loc.warnings);
      c.errors.push(...checkValues(rec));
      cands.push(c);
    }
  }
  const matches = matchEntities(cands);

  const tasks = [];
  const issues = [];
  const rejects = [];
  const locations = {};
  const issueOf = (c, e, severity, taskId) => ({
    code: e.code,
    severity,
    system: c.sys,
    source: c.sys,
    recordId: c.recordId,
    id: c.recordId,
    field: e.field,
    message: e.message,
    issue: e.message,
    suggestedFix: e.suggestedFix,
    rejected: severity === 'reject',
    dq: !!c.rec.dq,
    ...(taskId ? { taskId } : {}),
    ...(e.relatedId ? { relatedId: e.relatedId, relatedSystem: e.relatedSystem } : {})
  });
  for (const c of cands) {
    const id = `${c.sys}-${String(c.seq).padStart(3, '0')}`;
    if (c.errors.length) {
      const first = c.errors[0];
      rejects.push({ code: first.code, codes: c.errors.map((e) => e.code), system: c.sys, recordId: c.recordId, field: first.field, message: first.message, suggestedFix: first.suggestedFix, dq: !!c.rec.dq, record: c.rec });
      for (const e of c.errors) issues.push(issueOf(c, e, 'reject'));
      locations[c.recordId] = { startKm: c.loc.startKm, endKm: c.loc.endKm, line: c.loc.line, via: c.loc.via, sectionLabel: null, taskId: null, rejected: true };
      continue;
    }
    const t = baseTask(corridor, c.sys, c.rec, id, c.loc);
    t.durationMin = calibratedDuration(t.baseDurationMin, t.workType, durationFactors);
    t.totalMin = t.setupMin + t.durationMin + t.clearanceMin;
    t.nativeLocation = nativeLocation(c.sys, c.rec, c.loc);
    tasks.push(t);
    for (const w of c.warnings) issues.push(issueOf(c, w, 'warn', t.id));
    locations[c.recordId] = { startKm: t.startKm, endKm: t.endKm, line: t.line, via: c.loc.via, sectionLabel: t.sectionLabel, taskId: t.id, rejected: false };
  }

  // Checks on the planned tasks that the integration layer raises back to the source system.
  for (const t of tasks) {
    if (t.tsrKmph && t.daysOverdue < -5) issues.push({ code: 'TSR_NOT_DUE', severity: 'warn', system: t.source, source: t.source, recordId: t.sourceId, id: t.sourceId, field: 'daysOverdue', message: `TSR of ${t.tsrKmph} km/h in force but the work is not due for ${-t.daysOverdue} days — verify the due date`, issue: 'TSR imposed but task not yet due — verify due date', suggestedFix: 'Bring the work forward or confirm the TSR is still needed.', rejected: false, dq: !!t.metrics.dq, taskId: t.id });
  }

  const byCode = {};
  for (const i of issues) byCode[i.code] = (byCode[i.code] || 0) + 1;
  const count = (k) => (feeds[k] || []).length;
  const dq = SYSTEMS.reduce((a, [, k]) => a + (feeds[k] || []).filter((r) => r.dq).length, 0);
  return {
    tasks,
    issues,
    rejects,
    matches,
    locations,
    counts: { TMS: count('tms'), SMMS: count('smms'), TDMS: count('tdms'), total: tasks.length, rejected: rejects.length, dq, warnings: issues.filter((i) => i.severity === 'warn').length, byCode }
  };
}

/** Co-location candidates: pairs of tasks from different departments sharing a block section and line. */
export function coLocationPairs(tasks) {
  const pairs = [];
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const a = tasks[i];
      const b = tasks[j];
      if (a.dept === b.dept) continue;
      if (a.closure === 'NONE' && b.closure === 'NONE') continue;
      const lineOk = a.line === b.line || a.line === 'BOTH' || b.line === 'BOTH';
      if (!lineOk) continue;
      const shared = a.sections.filter((s) => b.sections.includes(s));
      if (shared.length) pairs.push({ a: a.id, b: b.id, sections: shared });
    }
  }
  return pairs;
}
