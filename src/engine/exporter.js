/**
 * Export helpers: BDMS-style block requisition rows (CSV / JSON) and a
 * printable requisition record per block.
 */
import { DEPARTMENTS } from './constants.js';

const esc = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const BDMS_COLUMNS = ['Block ID', 'Date', 'Day', 'Corridor', 'Section', 'Line', 'From (hh:mm)', 'To (hh:mm)', 'Duration (min)', 'Block type', 'Departments', 'Works', 'Km from', 'Km to', 'Power isolation', 'Machines', 'Gangs', 'Trains affected', 'Weighted delay (min)', 'Status'];

export function blockToRow(b, corridor) {
  return [b.id, b.date, b.dateLabel, corridor.code || corridor.id, b.sectionText, b.line, b.startText, b.endText, b.spanMin, b.kind, b.departments.map((d) => (DEPARTMENTS[d] || { short: d }).short).join(' + '), b.tasks.map((t) => `${t.id} ${t.label}`).join(' | '), b.startKm, b.endKm, b.powerIsolation || '', b.machines.join(' '), b.crews.join(' '), b.affectedTrains.length, b.weightedDelayMin, b.status];
}

export function blocksToCsv(blocks, corridor) {
  const lines = [BDMS_COLUMNS.join(',')];
  for (const b of blocks) lines.push(blockToRow(b, corridor).map(esc).join(','));
  return lines.join('\n');
}

/** BDMS demand payload for one block (what the API would POST to RBS/BDMS). */
export function toBdmsDemand(b, corridor, planStart) {
  return {
    demandType: b.kind === 'DISCONNECTION' ? 'DISCONNECTION' : b.kind.includes('POWER') && b.kind.includes('TRAFFIC') ? 'TRAFFIC_AND_POWER_BLOCK' : b.kind === 'POWER' ? 'POWER_BLOCK' : 'TRAFFIC_BLOCK',
    reference: b.id,
    division: corridor.division,
    zone: corridor.zone,
    corridor: corridor.code,
    section: b.sectionText,
    line: b.line,
    date: b.date,
    from: b.startText,
    to: b.endText,
    durationMin: b.spanMin,
    kmFrom: b.startKm,
    kmTo: b.endKm,
    oheIsolation: b.powerIsolation,
    departments: b.departments,
    works: b.tasks.map((t) => ({ id: t.id, dept: t.dept, description: t.label, from: t.startText, to: t.endText, machine: t.machineId, gang: t.crewId, arci: Number(t.arci.toFixed(3)) })),
    trafficImpact: { trainsAffected: b.affectedTrains.map((t) => ({ number: t.number, mode: t.mode, delayMin: t.delayMin })), weightedDelayMin: b.weightedDelayMin, premiumConflicts: b.premiumConflicts },
    plannedBy: 'SAMANVAY optimiser',
    planStart,
    status: b.status
  };
}
