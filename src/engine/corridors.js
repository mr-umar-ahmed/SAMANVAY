/**
 * Corridor master data (the "network graph" that the spatial alignment engine
 * maps every departmental record onto).
 *
 * Chainage (km) increases in the DOWN direction. Every corridor is modelled
 * as a double line (UP / DN). Block sections are derived between consecutive
 * stations; OHE elementary sections are derived from switching posts.
 *
 * Coordinates are approximate station locations and are used only for the map.
 */

const corridorDefs = [
  {
    id: 'NCR_NDLS_CNB',
    code: 'NDLS–CNB',
    name: 'New Delhi – Kanpur Central',
    zone: 'North Central Railway',
    division: 'Prayagraj (via Delhi)',
    lengthKm: 440,
    mpsKmph: 130,
    densityClass: 'HDN-1 (Delhi–Howrah trunk)',
    trainsPerDayTarget: 46,
    freightPathsPerDay: 18,
    stations: [
      { code: 'NDLS', name: 'New Delhi', km: 0, lat: 28.6431, lng: 77.2197, junction: true },
      { code: 'GZB', name: 'Ghaziabad Jn', km: 20, lat: 28.6449, lng: 77.4270, junction: true },
      { code: 'KRJ', name: 'Khurja Jn', km: 83, lat: 28.2514, lng: 77.8560, junction: true },
      { code: 'ALJN', name: 'Aligarh Jn', km: 131, lat: 27.8974, lng: 78.0880, junction: true },
      { code: 'HRS', name: 'Hathras Jn', km: 166, lat: 27.6020, lng: 78.0520, junction: false },
      { code: 'TDL', name: 'Tundla Jn', km: 209, lat: 27.2153, lng: 78.2376, junction: true },
      { code: 'SKB', name: 'Shikohabad Jn', km: 246, lat: 27.1050, lng: 78.5800, junction: true },
      { code: 'ETW', name: 'Etawah Jn', km: 300, lat: 26.7800, lng: 79.0200, junction: true },
      { code: 'PHD', name: 'Phaphund', km: 351, lat: 26.6000, lng: 79.4600, junction: false },
      { code: 'CNB', name: 'Kanpur Central', km: 440, lat: 26.4536, lng: 80.3510, junction: true }
    ],
    // Pre-provisioned corridor blocks written into the WTT by COA (line, window, section range).
    corridorBlocks: [
      { line: 'DN', start: '10:30', end: '13:30', days: [1, 2, 3, 4, 5, 6], fromKm: 131, toKm: 246 },
      { line: 'UP', start: '13:45', end: '16:15', days: [1, 2, 3, 4, 5, 6], fromKm: 246, toKm: 440 }
    ],
    switchingPosts: [0, 20, 48, 83, 108, 131, 166, 188, 209, 246, 275, 300, 351, 395, 440],
    tss: [
      { code: 'TSS-GZB', km: 20 }, { code: 'TSS-KRJ', km: 83 }, { code: 'TSS-HRS', km: 166 },
      { code: 'TSS-SKB', km: 246 }, { code: 'TSS-PHD', km: 351 }, { code: 'TSS-CNB', km: 440 }
    ]
  },
  {
    id: 'WR_MMCT_ADI',
    code: 'MMCT–ADI',
    name: 'Mumbai Central – Ahmedabad Jn',
    zone: 'Western Railway',
    division: 'Mumbai / Vadodara',
    lengthKm: 493,
    mpsKmph: 130,
    densityClass: 'HDN-2 (Golden Quadrilateral, mixed traffic)',
    trainsPerDayTarget: 40,
    freightPathsPerDay: 14,
    stations: [
      { code: 'MMCT', name: 'Mumbai Central', km: 0, lat: 18.9690, lng: 72.8194, junction: true },
      { code: 'BVI', name: 'Borivali', km: 30, lat: 19.2290, lng: 72.8570, junction: true },
      { code: 'VR', name: 'Virar', km: 60, lat: 19.4550, lng: 72.8120, junction: true },
      { code: 'VAPI', name: 'Vapi', km: 170, lat: 20.3720, lng: 72.9060, junction: false },
      { code: 'BL', name: 'Valsad', km: 194, lat: 20.6100, lng: 72.9300, junction: false },
      { code: 'ST', name: 'Surat', km: 263, lat: 21.2050, lng: 72.8410, junction: true },
      { code: 'BH', name: 'Bharuch Jn', km: 322, lat: 21.7050, lng: 72.9960, junction: true },
      { code: 'BRC', name: 'Vadodara Jn', km: 392, lat: 22.3100, lng: 73.1810, junction: true },
      { code: 'ANND', name: 'Anand Jn', km: 428, lat: 22.5600, lng: 72.9600, junction: true },
      { code: 'ADI', name: 'Ahmedabad Jn', km: 493, lat: 23.0260, lng: 72.6010, junction: true }
    ],
    corridorBlocks: [
      { line: 'UP', start: '11:00', end: '14:00', days: [1, 2, 3, 4, 5, 6], fromKm: 170, toKm: 322 },
      { line: 'DN', start: '01:00', end: '04:00', days: [0, 1, 2, 3, 4, 5, 6], fromKm: 322, toKm: 493 }
    ],
    switchingPosts: [0, 30, 60, 95, 130, 170, 194, 230, 263, 295, 322, 358, 392, 428, 460, 493],
    tss: [
      { code: 'TSS-VR', km: 60 }, { code: 'TSS-VAPI', km: 170 }, { code: 'TSS-ST', km: 263 },
      { code: 'TSS-BH', km: 322 }, { code: 'TSS-BRC', km: 392 }, { code: 'TSS-ADI', km: 493 }
    ]
  },
  {
    id: 'SWR_SBC_JTJ',
    code: 'SBC–JTJ',
    name: 'KSR Bengaluru – Jolarpettai Jn',
    zone: 'South Western Railway',
    division: 'Bengaluru',
    lengthKm: 145,
    mpsKmph: 110,
    densityClass: 'Group B (Bengaluru–Chennai)',
    trainsPerDayTarget: 30,
    freightPathsPerDay: 8,
    stations: [
      { code: 'SBC', name: 'KSR Bengaluru', km: 0, lat: 12.9779, lng: 77.5713, junction: true },
      { code: 'KJM', name: 'Krishnarajapuram', km: 14, lat: 12.9975, lng: 77.6790, junction: false },
      { code: 'WFD', name: 'Whitefield', km: 24, lat: 12.9870, lng: 77.7480, junction: false },
      { code: 'MLO', name: 'Malur', km: 46, lat: 13.0000, lng: 77.9380, junction: false },
      { code: 'BWT', name: 'Bangarapet Jn', km: 70, lat: 12.9930, lng: 78.1780, junction: true },
      { code: 'KPN', name: 'Kuppam', km: 104, lat: 12.7480, lng: 78.3660, junction: false },
      { code: 'JTJ', name: 'Jolarpettai Jn', km: 145, lat: 12.5720, lng: 78.5750, junction: true }
    ],
    corridorBlocks: [
      { line: 'DN', start: '11:30', end: '14:00', days: [1, 2, 3, 4, 5, 6], fromKm: 46, toKm: 145 }
    ],
    switchingPosts: [0, 24, 46, 70, 104, 125, 145],
    tss: [{ code: 'TSS-WFD', km: 24 }, { code: 'TSS-BWT', km: 70 }, { code: 'TSS-JTJ', km: 145 }]
  },
  {
    id: 'ER_HWH_ASN',
    code: 'HWH–ASN',
    name: 'Howrah Jn – Asansol Jn (Chord)',
    zone: 'Eastern Railway',
    division: 'Howrah / Asansol',
    lengthKm: 200,
    mpsKmph: 130,
    densityClass: 'HDN-1 (coal & mineral trunk)',
    trainsPerDayTarget: 38,
    freightPathsPerDay: 22,
    stations: [
      { code: 'HWH', name: 'Howrah Jn', km: 0, lat: 22.5830, lng: 88.3420, junction: true },
      { code: 'DKAE', name: 'Dankuni Jn', km: 16, lat: 22.6800, lng: 88.2900, junction: true },
      { code: 'KQU', name: 'Kamarkundu', km: 40, lat: 22.8100, lng: 88.1600, junction: true },
      { code: 'BWN', name: 'Barddhaman Jn', km: 95, lat: 23.2420, lng: 87.8620, junction: true },
      { code: 'PAN', name: 'Panagarh', km: 140, lat: 23.4500, lng: 87.4300, junction: false },
      { code: 'DGR', name: 'Durgapur', km: 158, lat: 23.5210, lng: 87.3120, junction: false },
      { code: 'UDL', name: 'Andal Jn', km: 170, lat: 23.5900, lng: 87.2400, junction: true },
      { code: 'ASN', name: 'Asansol Jn', km: 200, lat: 23.6850, lng: 86.9720, junction: true }
    ],
    corridorBlocks: [
      { line: 'UP', start: '10:00', end: '13:00', days: [1, 2, 3, 4, 5, 6], fromKm: 40, toKm: 140 },
      { line: 'DN', start: '14:00', end: '16:30', days: [1, 3, 5], fromKm: 95, toKm: 200 }
    ],
    switchingPosts: [0, 16, 40, 66, 95, 118, 140, 158, 170, 200],
    tss: [{ code: 'TSS-DKAE', km: 16 }, { code: 'TSS-BWN', km: 95 }, { code: 'TSS-DGR', km: 158 }, { code: 'TSS-ASN', km: 200 }]
  }
];

/** Build derived structures (block sections, OHE sections) for a corridor. */
function enrich(def) {
  const blockSections = [];
  for (let i = 0; i < def.stations.length - 1; i++) {
    const a = def.stations[i];
    const b = def.stations[i + 1];
    blockSections.push({
      id: `${def.id}:${a.code}-${b.code}`,
      index: i,
      from: a.code,
      to: b.code,
      label: `${a.code}–${b.code}`,
      startKm: a.km,
      endKm: b.km,
      lengthKm: b.km - a.km
    });
  }
  const oheSections = [];
  for (let i = 0; i < def.switchingPosts.length - 1; i++) {
    oheSections.push({
      id: `${def.id}:OHE-${i + 1}`,
      index: i,
      label: `ES-${String(i + 1).padStart(2, '0')}`,
      startKm: def.switchingPosts[i],
      endKm: def.switchingPosts[i + 1],
      spFrom: `SP-${def.switchingPosts[i]}`,
      spTo: `SP-${def.switchingPosts[i + 1]}`
    });
  }
  return { ...def, lines: ['UP', 'DN'], blockSections, oheSections };
}

export const CORRIDORS = corridorDefs.map(enrich);

export function getCorridor(id) {
  return CORRIDORS.find((c) => c.id === id) || CORRIDORS[0];
}

/** Find the block section containing a chainage. */
export function sectionAtKm(corridor, km) {
  const k = Math.min(Math.max(km, 0), corridor.lengthKm);
  return corridor.blockSections.find((s) => k >= s.startKm && k <= s.endKm) || corridor.blockSections[corridor.blockSections.length - 1];
}

/** All block sections overlapping [startKm, endKm]. */
export function sectionsInRange(corridor, startKm, endKm) {
  return corridor.blockSections.filter((s) => Math.max(s.startKm, startKm) < Math.min(s.endKm, endKm) || (startKm === endKm && startKm >= s.startKm && startKm <= s.endKm));
}

/** OHE elementary sections overlapping [startKm, endKm]. */
export function oheSectionsInRange(corridor, startKm, endKm) {
  return corridor.oheSections.filter((s) => Math.max(s.startKm, startKm) < Math.min(s.endKm, endKm) || (startKm === endKm && startKm >= s.startKm && startKm <= s.endKm));
}

/** Interpolate a lat/lng along the corridor for a chainage. */
export function latLngAtKm(corridor, km) {
  const st = corridor.stations;
  if (km <= st[0].km) return [st[0].lat, st[0].lng];
  for (let i = 0; i < st.length - 1; i++) {
    const a = st[i];
    const b = st[i + 1];
    if (km >= a.km && km <= b.km) {
      const t = (km - a.km) / (b.km - a.km || 1);
      return [a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t];
    }
  }
  const last = st[st.length - 1];
  return [last.lat, last.lng];
}
