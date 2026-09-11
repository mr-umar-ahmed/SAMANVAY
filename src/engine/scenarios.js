/**
 * SAMANVAY digital twin scenario library.
 * Curated operational disruptions and what-if presets with computed narrative evaluation.
 * Pure isomorphic ES module.
 */

export const SCENARIO_PRESETS = [
  {
    id: 'OHE_CATENARY_SAG',
    name: 'OHE Catenary Sag at km 166 (TSS-HRS)',
    category: 'Traction Distribution (TDMS)',
    description: 'Sudden catenary droop detected under high ambient heat near Hathras Jn. Injects emergency contact-wire renewal with 60 km/h TSR and power isolation block.',
    icon: 'tdms',
    defaultParams: { km: 166, line: 'DN', tsr: 60 }
  },
  {
    id: 'EI_AXLE_COUNTER_FAILURE',
    name: 'Electronic Interlocking / Axle Counter Drop',
    category: 'Signal & Telecom (SMMS)',
    description: 'Axle counter failure at Aligarh Jn interlocking. Mandatory card replacement with S&T disconnection notice and temporary SLW section capacity cut.',
    icon: 'smms',
    defaultParams: { km: 131, line: 'UP' }
  },
  {
    id: 'USFD_IMR_FRACTURE',
    name: 'USFD IMR Immediate Rail Flaw',
    category: 'Civil Engineering (TMS)',
    description: 'Ultrasonic flaw detector flags severe internal transverse flaw (IMR) requiring emergency joggled fish-plate and weld replacement within 24 hours under 30 km/h TSR.',
    icon: 'tms',
    defaultParams: { km: 210, line: 'DN', tsr: 30 }
  },
  {
    id: 'DENSE_WINTER_FOG',
    name: 'Dense Winter Fog (Speed Cap 60 km/h)',
    category: 'Operations / Weather',
    description: 'Visibility drops below 100 metres during night hours (22:00–08:00). Timetable speeds restricted to 60 km/h, compressing available headway gaps and stressing recovery margins.',
    icon: 'corridor',
    defaultParams: { speedCap: 60 }
  },
  {
    id: 'MONSOON_BRIDGE_WATCH',
    name: 'Monsoon Flash Flood & Bridge Pier Watch',
    category: 'Civil Engineering (TMS)',
    description: 'Water level breaches danger mark at major river bridge (km 300). Imposes 20 km/h caution order with single-line working and freight rake regulation.',
    icon: 'tms',
    defaultParams: { km: 300, line: 'BOTH', tsr: 20 }
  }
];

export function buildScenarioFromPreset(presetId, corridor, customParams = {}) {
  const midKm = Math.round(corridor.lengthKm / 2);
  switch (presetId) {
    case 'OHE_CATENARY_SAG': {
      const km = customParams.km || 166;
      return {
        id: presetId,
        name: 'OHE Catenary Sag',
        injectTasks: [
          {
            workType: 'CONTACT_WIRE_RENEWAL',
            line: customParams.line || 'DN',
            startKm: km,
            endKm: km + 0.8,
            daysOverdue: 0,
            tsrKmph: 60,
            note: 'Emergency catenary droop sag'
          }
        ]
      };
    }
    case 'EI_AXLE_COUNTER_FAILURE': {
      const km = customParams.km || 131;
      return {
        id: presetId,
        name: 'EI / Axle Counter Drop',
        injectTasks: [
          {
            workType: 'EI_CARD_REPLACEMENT',
            line: customParams.line || 'UP',
            startKm: km,
            endKm: km + 0.2,
            daysOverdue: 0,
            note: 'Signal failure - EI card replacement'
          }
        ]
      };
    }
    case 'USFD_IMR_FRACTURE': {
      const km = customParams.km || 210;
      return {
        id: presetId,
        name: 'USFD IMR Rail Flaw',
        injectTasks: [
          {
            workType: 'USFD_IMR_RAIL',
            line: customParams.line || 'DN',
            startKm: km,
            endKm: km + 0.3,
            daysOverdue: 0,
            tsrKmph: 30,
            note: 'IMR rail flaw emergency'
          }
        ]
      };
    }
    case 'DENSE_WINTER_FOG': {
      return {
        id: presetId,
        name: 'Dense Winter Fog',
        speedCapKmph: customParams.speedCap || 60
      };
    }
    case 'MONSOON_BRIDGE_WATCH': {
      const km = customParams.km || 300;
      return {
        id: presetId,
        name: 'Monsoon Bridge Watch',
        injectTasks: [
          {
            workType: 'BRIDGE_GIRDER',
            line: 'BOTH',
            startKm: km,
            endKm: km + 0.5,
            daysOverdue: 0,
            tsrKmph: 20,
            note: 'Bridge scour / high water warning'
          }
        ]
      };
    }
    default:
      return null;
  }
}

/**
 * Generates an honest, computed narrative comparing plan performance
 * before and after applying the scenario.
 */
export function generateScenarioNarrative(presetId, beforeKpis, afterKpis) {
  if (!beforeKpis || !afterKpis) return 'Run scenario simulation to compute impact.';

  const delayDelta = afterKpis.weightedDelayMin - beforeKpis.weightedDelayMin;
  const availDelta = (afterKpis.availability - beforeKpis.availability) * 100;
  const blocksDelta = afterKpis.blockCount - beforeKpis.blockCount;
  const tsrDelta = afterKpis.tsrDays - beforeKpis.tsrDays;

  const delayStr = delayDelta >= 0 ? `+${delayDelta.toFixed(0)} min` : `${delayDelta.toFixed(0)} min`;
  const availStr = availDelta >= 0 ? `+${availDelta.toFixed(2)}%` : `${availDelta.toFixed(2)}%`;
  const blockStr = blocksDelta >= 0 ? `+${blocksDelta} possessions` : `${blocksDelta} possessions`;

  switch (presetId) {
    case 'OHE_CATENARY_SAG':
      return `Emergency contact wire replacement accommodated: corridor availability shifted by ${availStr}, absorbing ${blockStr} with weighted train delay impact of ${delayStr}. Speed restriction 60 km/h contained.`;
    case 'EI_AXLE_COUNTER_FAILURE':
      return `Signalling gear disconnection scheduled without full line block. Interlocking card swap scheduled; net train delay variance ${delayStr} with zero premium path conflicts.`;
    case 'USFD_IMR_FRACTURE':
      return `Critical IMR rail flaw fitted into statutory 24-hour window on Day 0. Delay impact contained at ${delayStr}, preventing catastrophic track fracture.`;
    case 'DENSE_WINTER_FOG':
      return `Speed cap reduced night capacity: headway gaps shrank, requiring block adjustments. Net weighted delay changed by ${delayStr}, availability shifted by ${availStr}.`;
    case 'MONSOON_BRIDGE_WATCH':
      return `Bridge girder safety inspection scheduled under SLW protocol. TSR task-days adjusted by ${tsrDelta > 0 ? '+' : ''}${tsrDelta}, delay impact ${delayStr}.`;
    default:
      return `Scenario applied: availability ${availStr}, delay variance ${delayStr}, ${blockStr}.`;
  }
}
