/**
 * Import adapters for department registers (TMS / SMMS / TDMS files).
 *
 *   FEED_SCHEMAS            field list per system in its native vocabulary
 *   feedTemplate / templateCsv  sample rows taken from the seeded feed (download template)
 *   parseCsv                RFC-4180 style CSV (quoted fields, "" escapes, commas, CRLF)
 *   normalizeImported       validate rows (required fields, types, units, ranges),
 *                           resolve the location exactly like the normaliser, and
 *                           return native records tagged source 'imported'
 *   mergeImported           append (or replace) imported records into the feeds
 *
 * Nothing here talks to CRIS systems: files come from the user.
 */
import { WORK_TYPES } from './constants.js';
import { buildFeeds } from './dataFactory.js';
import { resolveRecordLocation, checkValues, normalizeLine, PLAUSIBLE_RANGES } from './normalizer.js';

const f = (name, type, unit, example, description, extra = {}) => ({ name, type, unit, example, description, required: false, ...extra });
const req = (field) => ({ ...field, required: true });

const COMMON_TAIL = [
  f('daysOverdue', 'integer', 'days', '4', 'Days past the due date (negative = due in future)', { min: -3650, max: 3650 }),
  f('tsrKmph', 'number', 'km/h', '30', 'Temporary speed restriction in force because of this defect (blank if none)', { min: 5, max: 160 }),
  f('tsrSinceDays', 'integer', 'days', '2', 'Days the TSR has been in force', { min: 0, max: 3650 }),
  f('ageDays', 'integer', 'days', '1200', 'Age of the asset since laying / commissioning', { min: 0, max: 36500 }),
  f('conditionIndex', 'number', '0–1', '0.72', 'Condition index from the latest inspection (1 = worst)', { min: 0, max: 1 }),
  f('requestedDaysAgo', 'integer', 'days', '3', 'Days since the work was requested', { min: 0, max: 3650 }),
  f('lastInspectionDaysAgo', 'integer', 'days', '40', 'Days since the last inspection of this asset', { min: 0, max: 36500 }),
  f('inspectionCycleDays', 'integer', 'days', '60', 'Inspection periodicity for this asset', { min: 1, max: 3650 })
];

const CAPITAL_TAIL = [
  f('capital', 'boolean', '', 'false', 'Capital (Rolling Block Programme) work'),
  f('noticeWeeksGiven', 'integer', 'weeks', '8', 'JPO notice already given', { min: 0, max: 52 }),
  f('targetWeek', 'integer', 'week', '6', 'Target week of the 26-week programme', { min: 1, max: 26 }),
  f('workingDaysNeeded', 'integer', 'days', '5', 'Block days needed for the capital work', { min: 1, max: 60 })
];

const wtOf = (dept) => Object.keys(WORK_TYPES).filter((k) => WORK_TYPES[k].dept === dept);

/** Field schemas per system, in each system's own vocabulary. */
export const FEED_SCHEMAS = {
  tms: {
    system: 'TMS',
    name: 'Track Management System — defect and due-maintenance register',
    idField: 'tmsId',
    locationRule: 'chainageFrom (km/TP) or fromKm (decimal km) is required',
    fields: [
      f('tmsId', 'string', '', 'TMS/NDLS–CNB/101', 'Record id in TMS (generated from the file name and row if blank)'),
      req(f('workType', 'enum', '', 'USFD_IMR_RAIL', 'Work type code', { values: wtOf('TMS') })),
      req(f('line', 'enum', '', 'DN', 'Line: UP, DN or BOTH (Up main / Down main accepted)', { values: ['UP', 'DN', 'BOTH'] })),
      f('chainageFrom', 'chainage', 'km/TP', '234/6', 'Start chainage as km / telegraph post'),
      f('chainageTo', 'chainage', 'km/TP', '234/9', 'End chainage as km / telegraph post'),
      f('fromKm', 'number', 'km', '234.375', 'Start chainage as decimal km (used when chainageFrom is blank)', { min: 0, max: 5000 }),
      f('toKm', 'number', 'km', '234.56', 'End chainage as decimal km', { min: 0, max: 5000 }),
      f('station', 'string', '', 'ALJN', 'Station code (yard works)'),
      f('turnoutNo', 'string', '', '21A', 'Turnout / points number (yard works)'),
      f('bridgeNo', 'string', '', 'Br. 412', 'Bridge number'),
      f('usfdClass', 'enum', '', 'IMR', 'USFD classification', { values: ['IMR', 'OBS'] }),
      f('flawType', 'string', '', 'Bolt-hole crack', 'Flaw description'),
      f('tgi', 'number', 'index', '44', 'Track geometry index from the TRC run', { min: 0, max: 150 }),
      f('gmt', 'number', 'GMT/yr', '45', 'Annual traffic in gross million tonnes', { min: 0, max: 200 }),
      f('gaugeMm', 'number', 'mm', '1679', 'Measured gauge (BG nominal 1676 mm)', { min: 1650, max: 1720 }),
      f('detectedBy', 'string', '', 'USFD Testing Car', 'Inspection that found the defect'),
      ...COMMON_TAIL,
      ...CAPITAL_TAIL
    ]
  },
  smms: {
    system: 'SMMS',
    name: 'Signalling Maintenance Management System — gear health register',
    idField: 'smmsId',
    locationRule: 'gearId from the station signal interlocking plan (or EI-<station>) is required',
    fields: [
      f('smmsId', 'string', '', 'SMMS/NDLS–CNB/201', 'Record id in SMMS (generated if blank)'),
      req(f('workType', 'enum', '', 'POINT_MACHINE_OVERHAUL', 'Work type code', { values: wtOf('SMMS') })),
      req(f('station', 'string', '', 'ALJN', 'Station yard the gear belongs to')),
      req(f('gearId', 'gear', '', 'ALJN-P-21A', 'Gear id: points ALJN-P-21A, track circuit ALJN-TC-2T-DN, signal ALJN-S-HOME-UP, LC gate LC-12, interlocking EI-ALJN')),
      f('line', 'enum', '', 'UP', 'Line (optional; the gear table decides)', { values: ['UP', 'DN', 'BOTH'] }),
      f('gearType', 'string', '', 'IRS electric point machine', 'Make / type of gear'),
      f('failures90d', 'integer', 'failures', '3', 'Failures in the last 90 days', { min: 0, max: 500 }),
      f('mtbfHours', 'number', 'h', '1200', 'Mean time between failures', { min: 0, max: 1000000 }),
      f('backlashMm', 'number', 'mm', '2.1', 'Point-machine backlash', { min: 0, max: 20 }),
      f('insulationMohm', 'number', 'MΩ', '14', 'Insulation resistance', { min: 0, max: 10000 }),
      f('resetCount7d', 'integer', 'resets', '2', 'Axle-counter resets in 7 days', { min: 0, max: 500 }),
      f('cableLengthM', 'number', 'm', '1800', 'Cable route length from the gear (cable works)', { min: 1, max: 50000 }),
      f('towards', 'string', '', 'HRS', 'Station the cable route runs towards'),
      ...COMMON_TAIL
    ]
  },
  tdms: {
    system: 'TDMS',
    name: 'Traction Distribution Management System — OHE condition register',
    idField: 'tdmsId',
    locationRule: 'mastFrom (km/mast) or tssCode is required',
    fields: [
      f('tdmsId', 'string', '', 'TDMS/NDLS–CNB/301', 'Record id in TDMS (generated if blank)'),
      req(f('workType', 'enum', '', 'CONTACT_WIRE_RENEWAL', 'Work type code', { values: wtOf('TDMS') })),
      f('line', 'enum', '', 'DN', 'Line: UP, DN or BOTH (required unless tssCode is given)', { values: ['UP', 'DN', 'BOTH'] }),
      f('mastFrom', 'mast', 'km/mast', '234/12', 'Start OHE mast as km / mast number'),
      f('mastTo', 'mast', 'km/mast', '235/4', 'End OHE mast'),
      f('elementarySection', 'string', '', 'ES-06', 'Elementary section of the start mast'),
      f('tssCode', 'string', '', 'TSS-HRS', 'Traction sub-station (TSS works)'),
      f('wireThicknessMm', 'number', 'mm', '8.4', 'Contact-wire residual thickness (new 12.24 mm)', { min: 4, max: 12.5 }),
      f('staggerDevMm', 'number', 'mm', '45', 'Stagger deviation', { min: 0, max: 500 }),
      f('heightDevMm', 'number', 'mm', '20', 'Contact-wire height deviation', { min: 0, max: 500 }),
      f('sparkingEvents30d', 'integer', 'events', '6', 'Sparking events in 30 days', { min: 0, max: 1000 }),
      f('insulatorType', 'string', '', 'Composite silicone', 'Insulator type'),
      f('flashoverCount90d', 'integer', 'events', '2', 'Flashovers in 90 days', { min: 0, max: 1000 }),
      f('contaminationClass', 'string', '', 'Medium', 'Pollution class'),
      f('corrosionGrade', 'string', '', 'C4', 'Cantilever corrosion grade'),
      f('nsType', 'string', '', 'Short neutral section (PTFE)', 'Neutral section type'),
      f('transformerMva', 'number', 'MVA', '21.6', 'Traction transformer rating', { min: 1, max: 200 }),
      f('oilBdvKv', 'number', 'kV', '45', 'Transformer oil breakdown voltage', { min: 0, max: 120 }),
      f('oilTempC', 'number', '°C', '58', 'Transformer oil temperature', { min: -10, max: 130 }),
      ...COMMON_TAIL,
      ...CAPITAL_TAIL
    ]
  }
};

const SYS_KEY = (system) => {
  const k = String(system || '').toLowerCase();
  if (!FEED_SCHEMAS[k]) throw new Error(`Unknown system "${system}" (tms, smms or tdms)`);
  return k;
};

/* ------------------------------------------------------------------------ */
/* Templates                                                                 */
/* ------------------------------------------------------------------------ */

const round = (v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v);

/**
 * Sample rows for a download template: the first `n` seeded records of the
 * system (data-quality test records excluded), projected onto the schema
 * columns in schema order. Values are the seeded values (floats rounded to 2 dp).
 */
export function feedTemplate(system, corridor, seed = 26027, n = 5) {
  const key = SYS_KEY(system);
  const feeds = buildFeeds(corridor, { seed });
  const schema = FEED_SCHEMAS[key];
  const recs = (feeds[key] || []).filter((r) => !r.dq).slice(0, n);
  return recs.map((rec) => {
    const row = {};
    for (const fl of schema.fields) {
      const v = rec[fl.name];
      row[fl.name] = v === undefined || v === null ? '' : round(v);
    }
    return row;
  });
}

function csvCell(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows → CSV text with a header row (columns = headers or the keys of the first row). */
export function toCsv(rows, headers) {
  const cols = headers || (rows[0] ? Object.keys(rows[0]) : []);
  const lines = [cols.map(csvCell).join(',')];
  for (const r of rows) lines.push(cols.map((c) => csvCell(r[c])).join(','));
  return lines.join('\r\n') + '\r\n';
}

/** Download template as CSV text: all schema columns, seeded sample rows. */
export function templateCsv(system, corridor, seed = 26027, n = 5) {
  const key = SYS_KEY(system);
  return toCsv(feedTemplate(key, corridor, seed, n), FEED_SCHEMAS[key].fields.map((x) => x.name));
}

/* ------------------------------------------------------------------------ */
/* CSV                                                                       */
/* ------------------------------------------------------------------------ */

/** CSV text → array of string arrays (handles quotes, "" escapes, CR/LF/CRLF, BOM). */
export function parseCsvRows(text) {
  const s = String(text ?? '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

/**
 * CSV text → array of row objects keyed by the header row (header names
 * trimmed). Each object also carries a non-enumerable __line (1-based line
 * number of the data row in the file, header = line 1).
 */
export function parseCsv(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r, i) => {
    const o = {};
    headers.forEach((h, j) => {
      if (h) o[h] = r[j] !== undefined ? r[j] : '';
    });
    Object.defineProperty(o, '__line', { value: i + 2, enumerable: false });
    return o;
  });
}

/* ------------------------------------------------------------------------ */
/* Validation                                                                */
/* ------------------------------------------------------------------------ */

const blank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

function coerce(fl, raw) {
  if (blank(raw)) return { value: undefined };
  const s = typeof raw === 'string' ? raw.trim() : raw;
  if (fl.type === 'number' || fl.type === 'integer') {
    const x = typeof s === 'number' ? s : Number(String(s).replace(/,/g, ''));
    if (!Number.isFinite(x)) return { error: `${fl.name} "${raw}" is not a number${fl.unit ? ` (${fl.unit})` : ''}` };
    if (fl.type === 'integer' && !Number.isInteger(x)) return { error: `${fl.name} "${raw}" must be a whole number${fl.unit ? ` of ${fl.unit}` : ''}` };
    if (fl.min !== undefined && x < fl.min) return { error: `${fl.name} ${x}${fl.unit ? ` ${fl.unit}` : ''} is below ${fl.min}` };
    if (fl.max !== undefined && x > fl.max) return { error: `${fl.name} ${x}${fl.unit ? ` ${fl.unit}` : ''} is above ${fl.max}` };
    return { value: x };
  }
  if (fl.type === 'boolean') {
    const t = String(s).toLowerCase();
    if (['true', 'yes', 'y', '1'].includes(t)) return { value: true };
    if (['false', 'no', 'n', '0'].includes(t)) return { value: false };
    return { error: `${fl.name} "${raw}" must be true or false` };
  }
  if (fl.type === 'enum') {
    if (fl.name === 'line') {
      const l = normalizeLine(s);
      return l ? { value: l } : { error: `line "${raw}" is not UP, DN or BOTH` };
    }
    const v = String(s).toUpperCase();
    if (fl.name === 'workType') return { value: v }; // catalogue membership checked below with a clearer message
    return fl.values && !fl.values.includes(v) ? { error: `${fl.name} "${raw}" must be one of ${fl.values.join(', ')}` } : { value: v };
  }
  return { value: String(s) };
}

const slug = (s) => String(s || 'file').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 40) || 'file';

/**
 * Validate and resolve imported rows.
 * @param system 'tms' | 'smms' | 'tdms'
 * @param rows   row objects (from parseCsv or feedTemplate; values may be strings or numbers)
 * @param corridor enriched corridor
 * @param opts   { fileName?: string }
 * @returns {{ system, fileName, records, rejects: {row, reason, code?, field?}[], issues }}
 *   records are native register records (same shape as the seeded ones) with
 *   source 'imported', importFile and importRow; issues are warnings in the
 *   normaliser's issue shape (code, system, recordId, field, message, suggestedFix).
 */
export function normalizeImported(system, rows, corridor, opts = {}) {
  const key = SYS_KEY(system);
  const schema = FEED_SCHEMAS[key];
  const SYS = schema.system;
  const fileName = typeof opts === 'string' ? opts : opts.fileName || null;
  const known = new Set(schema.fields.map((x) => x.name));
  const records = [];
  const rejects = [];
  const issues = [];
  const seenIds = new Set();
  const unknownCols = new Set();
  (rows || []).forEach((row, i) => {
    const line = row && row.__line ? row.__line : i + 2;
    const fail = (reason, code, field) => rejects.push({ row: line, reason, ...(code ? { code } : {}), ...(field ? { field } : {}) });
    if (!row || typeof row !== 'object') return fail('Row is empty', 'EMPTY_ROW');
    const vals = Object.values(row);
    if (vals.every(blank)) return fail('Row is empty', 'EMPTY_ROW');
    for (const k of Object.keys(row)) if (!known.has(k)) unknownCols.add(k);
    const rec = {};
    for (const fl of schema.fields) {
      const c = coerce(fl, row[fl.name]);
      if (c.error) return fail(c.error, 'BAD_VALUE', fl.name);
      if (c.value === undefined) {
        if (fl.required) return fail(`Required field ${fl.name} is blank`, 'MISSING_FIELD', fl.name);
        continue;
      }
      rec[fl.name] = c.value;
    }
    if (!WORK_TYPES[rec.workType]) return fail(`Work type "${rec.workType}" is not in the catalogue (${SYS}: ${schema.fields[1].values.join(', ')})`, 'UNKNOWN_WORKTYPE', 'workType');
    if (key === 'tms' && rec.chainageFrom === undefined && rec.fromKm === undefined && !rec.station) return fail(`No location: give chainageFrom (km/TP) or fromKm`, 'MISSING_LOCATION', 'chainageFrom');
    if (key === 'tdms' && rec.mastFrom === undefined && !rec.tssCode && rec.fromKm === undefined) return fail('No location: give mastFrom (km/mast) or tssCode', 'MISSING_LOCATION', 'mastFrom');
    if (key === 'tdms' && !rec.tssCode && !rec.line) return fail('Required field line is blank (UP, DN or BOTH)', 'MISSING_FIELD', 'line');
    const idField = schema.idField;
    if (!rec[idField]) rec[idField] = `IMP/${SYS}/${slug(fileName)}/${line}`;
    if (seenIds.has(rec[idField])) return fail(`Duplicate record id ${rec[idField]} in this file`, 'DUPLICATE_ID', idField);
    const bad = checkValues(rec);
    if (bad.length) return fail(bad[0].message, bad[0].code, bad[0].field);
    const loc = resolveRecordLocation(SYS, rec, corridor);
    if (!loc.ok) {
      const e = loc.errors[0];
      return fail(`${e.message}. ${e.suggestedFix}`, e.code, e.field);
    }
    seenIds.add(rec[idField]);
    const out = { ...rec, source: 'imported', importRow: line, ...(fileName ? { importFile: fileName } : {}) };
    for (const w of loc.warnings) issues.push({ code: w.code, severity: 'warn', system: SYS, source: SYS, recordId: rec[idField], id: rec[idField], field: w.field, message: w.message, issue: w.message, suggestedFix: w.suggestedFix, rejected: false, row: line });
    records.push(out);
  });
  if (unknownCols.size) issues.push({ code: 'UNKNOWN_COLUMN', severity: 'warn', system: SYS, source: SYS, recordId: fileName || 'file', id: fileName || 'file', field: [...unknownCols].join(', '), message: `Columns not in the ${SYS} schema were ignored: ${[...unknownCols].join(', ')}`, issue: `Ignored columns: ${[...unknownCols].join(', ')}`, suggestedFix: 'Rename them to schema field names (see the template) or drop them.', rejected: false });
  return { system: key, fileName, records, rejects, issues };
}

/**
 * Put imported records into the feeds the planner uses.
 * `imported` may be:
 *   - the result of normalizeImported ({ system, records, mode? })
 *   - an array of such batches
 *   - a map { tms?: records[] | {records, mode}, smms?: …, tdms?: … } (PlanRequest.imported)
 * mode 'append' (default): records are added; a record with the same id as a
 * register record replaces it (an update). mode 'replace': the system's
 * seeded register is replaced by the imported records.
 * opts.mode sets the default mode for batches that do not carry one.
 * Returns a new feeds object (input untouched) with feeds.importSummary.
 */
export function mergeImported(feeds, imported, opts = {}) {
  if (!imported) return feeds;
  let batches;
  if (Array.isArray(imported)) batches = imported;
  else if (imported.system && Array.isArray(imported.records)) batches = [imported];
  else batches = Object.entries(imported).filter(([k]) => FEED_SCHEMAS[k.toLowerCase()]).map(([system, v]) => (Array.isArray(v) ? { system, records: v } : { system, ...(v || {}) }));
  const out = { ...feeds };
  const summary = [];
  for (const b of batches) {
    if (!b || !b.system) continue;
    const key = SYS_KEY(b.system);
    const idField = FEED_SCHEMAS[key].idField;
    const mode = b.mode || opts.mode || 'append';
    const base = mode === 'replace' ? [] : (out[key] || []).slice();
    let added = 0;
    let updated = 0;
    for (const rec of b.records || []) {
      const idx = rec[idField] ? base.findIndex((r) => r[idField] === rec[idField]) : -1;
      if (idx >= 0) {
        base[idx] = rec;
        updated++;
      } else {
        base.push(rec);
        added++;
      }
    }
    out[key] = base;
    summary.push({ system: key, mode, added, updated, total: base.length, fileName: b.fileName || null });
  }
  out.importSummary = (feeds.importSummary || []).concat(summary);
  return out;
}

export { PLAUSIBLE_RANGES };
