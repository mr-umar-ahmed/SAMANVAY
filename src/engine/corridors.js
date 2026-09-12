/**
 * Corridor master data (the "network graph" that the spatial alignment engine
 * maps every departmental record onto).
 *
 * Chainage (km) increases in the DOWN direction. Every corridor is modelled
 * as a double line (UP / DN). Block sections are derived between consecutive
 * stations; OHE elementary sections are derived from switching posts.
 *
 * Coordinates are approximate station locations and are used only for the map.
 *
 * The twin carries three location reference systems and converts between
 * them: civil chainage ("km/TP", TMS), signalling assets (gear ids laid out
 * per station and line, SMMS — corridor.signals) and OHE mast numbers /
 * elementary sections (TDMS). All resolve to route km + line + block section.
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

/* ------------------------------------------------------------------------ */
/* Location reference systems of the digital twin                            */
/* ------------------------------------------------------------------------ */

/**
 * OHE mast numbering. A mast id "234/12" is km 234 + the 12th mast of that
 * kilometre, masts being planted at the standard span below (mast 1 stands at
 * the km post). Real spans vary 27–72 m with curvature; 55 m is the modelled
 * average (the same constant the normaliser has always used).
 */
export const MAST_SPAN_KM = 0.055;
/** Highest mast index inside one kilometre (1 + floor(1000 m / 55 m) = 19). */
export const MASTS_PER_KM = Math.floor(1 / MAST_SPAN_KM) + 1;
/**
 * Civil chainage "km/TP": km post + telegraph-post number inside that km.
 * Telegraph posts are modelled at 16 per km (62.5 m spacing, TP 0–15).
 * This spacing is an assumption; divisions record the actual TP layout.
 */
export const TP_PER_KM = 16;

const round3 = (x) => Math.round(x * 1000) / 1000;
const round2 = (x) => Math.round(x * 100) / 100;
const quant = (x) => Math.round(x * 1e6) / 1e6; // strip float noise before floor / ceil

/** km → OHE mast id "234/12". mode: 'round' (nearest mast), 'floor' or 'ceil'. */
export function kmToMast(km, mode = 'round') {
  if (typeof km !== 'number' || !Number.isFinite(km) || km < 0) return null;
  let whole = Math.floor(quant(km));
  const f = mode === 'floor' ? Math.floor : mode === 'ceil' ? Math.ceil : Math.round;
  let idx = f(quant((km - whole) / MAST_SPAN_KM)) + 1;
  if (idx > MASTS_PER_KM) {
    whole += 1;
    idx = 1;
  }
  return `${whole}/${idx}`;
}

/**
 * OHE mast id → km. Accepts "234/12", "M 234/12", "OHE mast 234/12".
 * Returns null when the id is not a mast reference or the mast index is not
 * possible inside one kilometre.
 */
export function mastToKmId(mastId) {
  const m = String(mastId ?? '').trim().match(/(\d+)\s*\/\s*(\d+)\s*$/);
  if (!m) return null;
  const whole = Number(m[1]);
  const idx = Number(m[2]);
  if (!Number.isInteger(idx) || idx < 1 || idx > MASTS_PER_KM) return null;
  return round3(whole + (idx - 1) * MAST_SPAN_KM);
}

/**
 * Civil chainage text → km. Accepts "234/6" (km 234, telegraph post 6),
 * "234/6-7" (between TP 6 and 7 → midpoint), "km 234/6", and a plain
 * decimal "234.375" or a number (numeric fallback). Returns null if the text
 * cannot be read or the TP number is not possible.
 */
export function parseChainage(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').trim().replace(/^km\s*/i, '');
  if (!s) return null;
  const m = s.match(/^(\d+)\s*\/\s*(\d+)(?:\s*-\s*(\d+))?$/);
  if (m) {
    const k = Number(m[1]);
    const a = Number(m[2]);
    const b = m[3] !== undefined ? Number(m[3]) : a;
    if (a > TP_PER_KM - 1 || b > TP_PER_KM - 1) return null;
    return round3(k + (a + b) / 2 / TP_PER_KM);
  }
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  return null;
}

/** km → civil chainage text "234/6". mode: 'round', 'floor' or 'ceil'. */
export function formatChainage(km, mode = 'round') {
  if (typeof km !== 'number' || !Number.isFinite(km) || km < 0) return null;
  let whole = Math.floor(quant(km));
  const f = mode === 'floor' ? Math.floor : mode === 'ceil' ? Math.ceil : Math.round;
  let tp = f(quant((km - whole) * TP_PER_KM));
  if (tp >= TP_PER_KM) {
    whole += 1;
    tp = 0;
  }
  return `${whole}/${tp}`;
}

/** FNV-1a hash → unsigned int (deterministic layout jitter, no RNG). */
function hashInt(text) {
  let h = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Railway signalling assets per station and line, laid out deterministically
 * from the station list (no RNG). Chainage increases in the DN direction, so
 * a DN train approaches a station from lower km.
 *
 * Offsets from the station centre (km, towards the approach side negative):
 *   Distant −1.6 · approach track circuit AT −1.0 · Home −0.5 ·
 *   home-to-points track circuit 1T −0.4 · receiving-end points −0.30/−0.26 ·
 *   berthing track circuit 2T 0 · Starter +0.3 · dispatch-end points
 *   +0.35/+0.39 · junction points +0.45/+0.49 (junctions only) ·
 *   dispatch track circuit 3T +0.5 · Advanced starter +0.7 ·
 *   BPAC axle-counter head +0.75 (block section proving towards the next station).
 * These are typical placements (braking-distance spacing of Distant to Home,
 * Advanced starter beyond the last points), not a surveyed signal
 * interlocking plan. Assets that would fall outside the corridor are omitted.
 *
 * Level-crossing gates: floor(section length / 12 km) gates per block section,
 * evenly spaced with a hash-derived offset of up to ±0.8 km.
 */
function buildSignals(def) {
  const out = [];
  const L = def.lengthKm;
  const st = def.stations;
  const add = (o) => {
    if (o.km < 0 || o.km > L) return;
    out.push({ ...o, km: round2(o.km) });
  };
  st.forEach((s, i) => {
    for (const line of ['DN', 'UP']) {
      const dir = line === 'DN' ? 1 : -1;
      const at = (off) => s.km + dir * off;
      const next = line === 'DN' ? st[i + 1] : st[i - 1];
      const base = line === 'DN' ? 0 : 20; // signals S1–S4 on DN, S21–S24 on UP
      const pp = line === 'DN' ? 1 : 2; // points 11A–13B on DN, 21A–23B on UP
      const sig = (kind, off, no, words) =>
        add({ id: `${s.code}-S-${kind}-${line}`, kind, stationCode: s.code, km: at(off), line, label: `${s.code} ${line} ${words} (S${base + no})`, number: `S${base + no}` });
      sig('DISTANT', -1.6, 1, 'Distant');
      sig('HOME', -0.5, 2, 'Home');
      sig('STARTER', 0.3, 3, 'Starter');
      sig('ADV_STARTER', 0.7, 4, 'Advanced starter');
      const pts = [
        [`${pp}1A`, -0.3, 'receiving end'],
        [`${pp}1B`, -0.26, 'receiving end'],
        [`${pp}2A`, 0.35, 'dispatch end'],
        [`${pp}2B`, 0.39, 'dispatch end']
      ];
      if (s.junction) pts.push([`${pp}3A`, 0.45, 'junction'], [`${pp}3B`, 0.49, 'junction']);
      for (const [no, off, where] of pts) {
        add({ id: `${s.code}-P-${no}`, kind: 'POINT', stationCode: s.code, km: at(off), line, label: `${s.code} points ${no} (${line}, ${where})`, pointNo: no });
      }
      const tcs = [
        ['AT', -1.0, 'AFTC', 'approach'],
        ['1T', -0.4, s.junction ? 'AFTC' : 'DC', 'home to points'],
        ['2T', 0, 'DC', 'main line berthing'],
        ['3T', 0.5, s.junction ? 'AFTC' : 'DC', 'dispatch']
      ];
      for (const [no, off, detection, words] of tcs) {
        add({ id: `${s.code}-TC-${no}-${line}`, kind: 'TRACK_CIRCUIT', stationCode: s.code, km: at(off), line, label: `${s.code} ${line} ${words} track circuit ${no} (${detection})`, detection });
      }
      if (next) {
        add({ id: `${s.code}-TC-AXC-${line}`, kind: 'TRACK_CIRCUIT', stationCode: s.code, km: at(0.75), line, label: `${s.code} ${line} BPAC axle-counter head towards ${next.code} (SSDAC)`, detection: 'SSDAC', towards: next.code });
      }
    }
  });
  let lcNo = 0;
  for (let i = 0; i < st.length - 1; i++) {
    const a = st[i];
    const b = st[i + 1];
    const len = b.km - a.km;
    const n = Math.floor(len / 12);
    for (let j = 0; j < n; j++) {
      lcNo++;
      const h = hashInt(`${def.id}|${a.code}|${j}`);
      const jitter = ((h % 1000) / 1000 - 0.5) * 1.6;
      const km = a.km + (len * (j + 1)) / (n + 1) + jitter;
      const cls = ['Special', 'A', 'B', 'C'][h % 4];
      const interlocked = h % 3 !== 0;
      add({ id: `LC-${lcNo}`, kind: 'LC_GATE', stationCode: a.code, km, line: 'BOTH', label: `LC ${lcNo} (${cls} class, ${interlocked ? 'interlocked' : 'non-interlocked'}) ${a.code}–${b.code}`, lcClass: cls, interlocked });
    }
  }
  return out.sort((x, y) => x.km - y.km || x.id.localeCompare(y.id));
}

const signalIndexCache = new WeakMap();

/** Look up a signalling asset by id on a corridor (null if unknown). */
export function findSignal(corridor, id) {
  if (!corridor || !corridor.signals || id === undefined || id === null) return null;
  let idx = signalIndexCache.get(corridor.signals);
  if (!idx) {
    idx = new Map(corridor.signals.map((s) => [s.id, s]));
    signalIndexCache.set(corridor.signals, idx);
  }
  return idx.get(String(id).trim()) || null;
}

/** Station by code (null if not on this corridor). */
export function stationByCode(corridor, code) {
  if (!code) return null;
  const c = String(code).trim().toUpperCase();
  return corridor.stations.find((s) => s.code === c) || null;
}

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
  return { ...def, lines: ['UP', 'DN'], blockSections, oheSections, signals: buildSignals(def), mastSpanKm: MAST_SPAN_KM, tpPerKm: TP_PER_KM };
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
