/**
 * SAMANVAY BDMS demand intake and normalisation engine.
 * Validates manual requisitions and field hazard submissions against corridor graph.
 * Pure isomorphic ES module.
 */
import { WORK_TYPES } from './constants.js';
import { sectionsInRange, oheSectionsInRange } from './corridors.js';
import { calibratedDuration } from './productivity.js';

export function validateDemand(fields, corridor, factors = {}) {
  const errors = [];
  const wtKey = fields.workType;
  const wt = WORK_TYPES[wtKey];

  if (!wt) {
    errors.push(`Invalid work type: ${wtKey}`);
  }

  const startKm = Number(fields.startKm);
  const endKm = Number(fields.endKm || fields.startKm);

  if (isNaN(startKm) || startKm < 0 || startKm > corridor.lengthKm) {
    errors.push(`Start km ${fields.startKm} is outside corridor chainage (0 to ${corridor.lengthKm} km)`);
  }
  if (isNaN(endKm) || endKm < startKm || endKm > corridor.lengthKm) {
    errors.push(`End km ${fields.endKm} must be between start km and ${corridor.lengthKm} km`);
  }

  const line = fields.line || 'DN';
  if (!['UP', 'DN', 'BOTH'].includes(line)) {
    errors.push(`Line must be UP, DN, or BOTH`);
  }

  if (errors.length > 0) {
    return { valid: false, errors, task: null };
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
