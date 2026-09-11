/**
 * SAMANVAY BDMS demand intake and normalisation engine.
 * Validates manual requisitions and field hazard submissions against corridor graph.
 * Pure isomorphic ES module.
 */
import { WORK_TYPES } from './constants.js';
import { sectionsInRange, oheSectionsInRange } from './corridors.js';
import { calibratedDuration } from './productivity.js';

export function validateDemand(fields, corridor, factors = {}, opts = {}) {
  const lang = opts.lang || fields.lang || 'en';
  const isHi = lang === 'hi';
  const errors = [];
  const errorDetails = [];
  const wtKey = fields.workType;
  const wt = WORK_TYPES[wtKey];

  if (!wt) {
    const en = `Invalid work type: ${wtKey}`;
    const hi = `अमान्य कार्य प्रकार: ${wtKey}`;
    errors.push(isHi ? hi : en);
    errorDetails.push({ code: 'WORK_TYPE_INVALID', en, hi });
  }

  const startKm = Number(fields.startKm);
  const endKm = Number(fields.endKm || fields.startKm);

  if (isNaN(startKm) || startKm < 0 || startKm > corridor.lengthKm) {
    const en = `Start km ${fields.startKm} is outside corridor chainage (0 to ${corridor.lengthKm} km)`;
    const hi = `प्रारंभिक किमी ${fields.startKm} कॉरिडोर चेनेज (0 से ${corridor.lengthKm} किमी) से बाहर है`;
    errors.push(isHi ? hi : en);
    errorDetails.push({ code: 'START_KM_OUT_OF_RANGE', en, hi });
  }
  if (isNaN(endKm) || endKm < startKm || endKm > corridor.lengthKm) {
    const en = `End km ${fields.endKm} must be between start km and ${corridor.lengthKm} km`;
    const hi = `समाप्ति किमी ${fields.endKm} प्रारंभिक किमी और ${corridor.lengthKm} किमी के बीच होना चाहिए`;
    errors.push(isHi ? hi : en);
    errorDetails.push({ code: 'END_KM_INVALID', en, hi });
  }

  const line = fields.line || 'DN';
  if (!['UP', 'DN', 'BOTH'].includes(line)) {
    const en = `Line must be UP, DN, or BOTH`;
    const hi = `लाइन UP, DN या BOTH होनी चाहिए`;
    errors.push(isHi ? hi : en);
    errorDetails.push({ code: 'LINE_INVALID', en, hi });
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      errorDetails,
      localizedErrors: {
        en: errorDetails.map((e) => e.en),
        hi: errorDetails.map((e) => e.hi)
      },
      task: null
    };
  }

  const secs = sectionsInRange(corridor, startKm, endKm).map((s) => s.index);
  const oheSecs = oheSectionsInRange(corridor, startKm, endKm).map((s) => s.index);
  const baseDuration = Number(fields.durationMin) || wt.durationMin;
  const duration = calibratedDuration(baseDuration, wtKey, factors);
  const totalMin = wt.setupMin + duration + wt.clearanceMin;

  const task = {
    id: `INTAKE-${Date.now().toString().slice(-4)}`,
    sourceId: `BDMS/MANUAL/${Date.now().toString().slice(-4)}`,
    source: 'BDMS-INTAKE',
    dept: wt.dept,
    deptLabel: wt.dept,
    workType: wtKey,
    label: fields.description ? `${wt.label} — ${fields.description}` : wt.label,
    assetClass: wt.assetClass,
    line,
    startKm,
    endKm: Math.max(endKm, startKm + 0.1),
    lengthKm: Math.max(0.1, Math.round((endKm - startKm) * 10) / 10),
    sections: secs.length ? secs : [0],
    sectionLabel: secs.map((s) => corridor.blockSections[s]?.label || `Section ${s}`).join(' / '),
    oheSections: oheSecs,
    station: null,
    blockKind: wt.blockKind,
    closure: wt.blockKind === 'DISCONNECTION' ? 'NONE' : 'LINE',
    baseDurationMin: baseDuration,
    durationMin: duration,
    setupMin: wt.setupMin,
    clearanceMin: wt.clearanceMin,
    totalMin,
    machine: fields.machine || wt.machine,
    crew: fields.crew || wt.crew,
    safety: wt.safety,
    capital: !!wt.capital,
    mandatoryWithinDays: wt.mandatoryWithinDays,
    daysOverdue: Number(fields.daysOverdue) || 0,
    dueDay: Math.max(0, wt.mandatoryWithinDays - (Number(fields.daysOverdue) || 0)),
    requestedDaysAgo: 0,
    ageDays: Number(fields.ageDays) || 500,
    conditionIndex: Number(fields.conditionIndex) || 0.85,
    tsrKmph: fields.tsrKmph ? Number(fields.tsrKmph) : wt.tsrKmph,
    tsrSinceDays: fields.tsrKmph ? 1 : 0,
    status: fields.unverified ? 'UNVERIFIED' : 'VERIFIED',
    reporter: fields.reporter || 'Field Engineer',
    role: fields.role || 'SR_DEN',
    photoUrl: fields.photoUrl || null,
    metrics: {
      detectedBy: fields.unverified ? 'Citizen / Field Hazard Notice' : 'Manual BDMS requisition',
      flawType: fields.description || 'Maintenance requisition'
    },
    nativeLocation: `${line} line, km ${startKm}–${endKm}`
  };

  return { valid: true, errors: [], task };
}
