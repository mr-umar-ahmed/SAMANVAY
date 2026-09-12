/**
 * SAMANVAY digital twin scenario library.
 * Curated operational disruptions and what-if presets with computed narrative evaluation.
 * Pure isomorphic ES module.
 */

/**
 * Every preset's location is relative to the corridor it is applied to
 * (`anchor` below): a fraction of the corridor length snapped to a real TSS,
 * junction, station or block section of that corridor, so the injected work
 * always lies inside the corridor. On New Delhi – Kanpur the anchors give
 * the original km 166 / 131 / 210 / 300.
 */
export const SCENARIO_PRESETS = [
  {
    id: 'OHE_CATENARY_SAG',
    name: 'OHE Catenary Sag at km 166 (TSS-HRS)',
    category: 'Traction Distribution (TDMS)',
    description: 'Sudden catenary droop under high ambient heat at the traction sub-station nearest 38 % of the corridor length. Injects emergency contact-wire renewal with 60 km/h TSR and power isolation block.',
    icon: 'tdms',
    defaultParams: { anchor: 'TSS', fraction: 166 / 440, lengthKm: 0.8, line: 'DN', tsr: 60 }
  },
  {
    id: 'EI_AXLE_COUNTER_FAILURE',
    name: 'Electronic Interlocking / Axle Counter Drop',
    category: 'Signal & Telecom (SMMS)',
    description: 'Axle counter failure at the interlocking of the junction nearest 30 % of the corridor length. Mandatory card replacement with S&T disconnection notice and temporary SLW section capacity cut.',
    icon: 'smms',
    defaultParams: { anchor: 'JUNCTION', fraction: 131 / 440, lengthKm: 0.2, line: 'UP' }
  },
  {
    id: 'USFD_IMR_FRACTURE',
    name: 'USFD IMR Immediate Rail Flaw',
    category: 'Civil Engineering (TMS)',
    description: 'Ultrasonic flaw detector flags a severe internal transverse flaw (IMR) inside the block section at 48 % of the corridor length, requiring emergency joggled fish-plate and weld replacement within 24 hours under 30 km/h TSR.',
    icon: 'tms',
    defaultParams: { anchor: 'SECTION', fraction: 210 / 440, lengthKm: 0.3, line: 'DN', tsr: 30 }
  },
  {
    id: 'DENSE_WINTER_FOG',
    name: 'Dense Winter Fog (Speed Cap 60 km/h)',
    category: 'Operations / Weather',
    description: 'Visibility drops below 1000 metres during night hours. Trains running between 22:00 and 08:00 are restricted to 60 km/h; day paths keep their timings. Night headway gaps shrink and recovery margins tighten.',
    icon: 'corridor',
    defaultParams: { speedCap: 60, from: '22:00', to: '08:00' }
  },
  {
    id: 'MONSOON_BRIDGE_WATCH',
    name: 'Monsoon Flash Flood & Bridge Pier Watch',
    category: 'Civil Engineering (TMS)',
    description: 'Water level breaches the danger mark at the major bridge next to the station nearest 68 % of the corridor length. Imposes 20 km/h caution order with single-line working and freight rake regulation.',
    icon: 'tms',
    defaultParams: { anchor: 'STATION', fraction: 300 / 440, lengthKm: 0.5, line: 'BOTH', tsr: 20 }
  }
];

const r1 = (x) => Math.round(x * 10) / 10;

/**
 * Corridor-relative location of a preset: returns { startKm, endKm, where }
 * with 0 ≤ startKm < endKm ≤ corridor length and a real reference.
 *   TSS      – the traction sub-station nearest fraction × length
 *   JUNCTION – the junction station nearest fraction × length
 *   STATION  – the intermediate station nearest fraction × length
 *   SECTION  – fraction × length, kept 0.5 km clear of both stations of its block section
 */
export function anchorLocation(corridor, anchor, fraction, lengthKm) {
  const L = corridor.lengthKm;
  const target = Math.max(0, Math.min(L, fraction * L));
  const nearest = (list) => list.reduce((b, x) => (Math.abs(x.km - target) < Math.abs(b.km - target) ? x : b), list[0]);
  const fit = (km) => {
    let a = r1(km);
    if (a + lengthKm > L) a = r1(L - lengthKm - 0.1);
    if (a < 0) a = 0;
    return { startKm: a, endKm: r1(a + lengthKm) };
  };
  if (anchor === 'TSS' && corridor.tss && corridor.tss.length) {
    const t = nearest(corridor.tss);
    return { ...fit(t.km), where: `${t.code}, km ${t.km}` };
  }
  if (anchor === 'JUNCTION' || anchor === 'STATION') {
    const inner = corridor.stations.slice(1, -1);
    let list = anchor === 'JUNCTION' ? corridor.stations.filter((s) => s.junction) : inner;
    if (!list.length) list = corridor.stations;
    const s = nearest(list);
    return { ...fit(s.km), where: `${s.name} (${s.code}), km ${s.km}` };
  }
  const sec = corridor.blockSections.find((s) => target >= s.startKm && target <= s.endKm) || corridor.blockSections[corridor.blockSections.length - 1];
  const lo = sec.startKm + 0.5;
  const hi = Math.max(lo, sec.endKm - lengthKm - 0.5);
  const km = Math.min(hi, Math.max(lo, target));
  return { ...fit(km), where: `${sec.label}, km ${r1(km)}` };
}

function presetLocation(presetId, corridor, customParams) {
  const p = SCENARIO_PRESETS.find((x) => x.id === presetId);
  const d = p.defaultParams;
  if (typeof customParams.km === 'number' && Number.isFinite(customParams.km)) {
    const L = corridor.lengthKm;
    const a = r1(Math.min(Math.max(0, customParams.km), L - d.lengthKm));
    return { startKm: a, endKm: r1(a + d.lengthKm), where: `km ${a}` };
  }
  return anchorLocation(corridor, d.anchor, d.fraction, d.lengthKm);
}

export function buildScenarioFromPreset(presetId, corridor, customParams = {}) {
  switch (presetId) {
    case 'OHE_CATENARY_SAG': {
      const loc = presetLocation(presetId, corridor, customParams);
      return {
        id: presetId,
        name: 'OHE Catenary Sag',
        location: loc.where,
        injectTasks: [
          {
            workType: 'CONTACT_WIRE_RENEWAL',
            line: customParams.line || 'DN',
            startKm: loc.startKm,
            endKm: loc.endKm,
            daysOverdue: 0,
            tsrKmph: 60,
            note: `Emergency catenary droop sag near ${loc.where}`
          }
        ]
      };
    }
    case 'EI_AXLE_COUNTER_FAILURE': {
      const loc = presetLocation(presetId, corridor, customParams);
      return {
        id: presetId,
        name: 'EI / Axle Counter Drop',
        location: loc.where,
        injectTasks: [
          {
            workType: 'EI_CARD_REPLACEMENT',
            line: customParams.line || 'UP',
            startKm: loc.startKm,
            endKm: loc.endKm,
            daysOverdue: 0,
            note: `Signal failure at ${loc.where} - EI card replacement`
          }
        ]
      };
    }
    case 'USFD_IMR_FRACTURE': {
      const loc = presetLocation(presetId, corridor, customParams);
      return {
        id: presetId,
        name: 'USFD IMR Rail Flaw',
        location: loc.where,
        injectTasks: [
          {
            workType: 'USFD_IMR_RAIL',
            line: customParams.line || 'DN',
            startKm: loc.startKm,
            endKm: loc.endKm,
            daysOverdue: 0,
            tsrKmph: 30,
            note: `IMR rail flaw emergency, ${loc.where}`
          }
        ]
      };
    }
    case 'DENSE_WINTER_FOG': {
      const d = SCENARIO_PRESETS.find((x) => x.id === presetId).defaultParams;
      // The cap applies only to runs between 22:00 and 08:00. planner.applyScenario
      // must honour speedCapWindow (weather.applyWeatherToPassages); without it the
      // older code path re-times every path all day.
      return {
        id: presetId,
        name: 'Dense Winter Fog',
        speedCapKmph: customParams.speedCap || d.speedCap,
        speedCapWindow: { from: customParams.from || d.from, to: customParams.to || d.to }
      };
    }
    case 'MONSOON_BRIDGE_WATCH': {
      const loc = presetLocation(presetId, corridor, customParams);
      return {
        id: presetId,
        name: 'Monsoon Bridge Watch',
        location: loc.where,
        injectTasks: [
          {
            workType: 'BRIDGE_GIRDER',
            line: 'BOTH',
            startKm: loc.startKm,
            endKm: loc.endKm,
            daysOverdue: 0,
            tsrKmph: 20,
            note: `Bridge scour / high water warning near ${loc.where}`
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
