/**
 * Weather source for the planner.
 *
 * Two feeds with one shape (WeatherDay):
 *   buildWeatherFeed  – seeded, IMD-shaped daily weather for the corridor's
 *                       region and the calendar month (source 'seeded').
 *   parseOpenMeteo    – the same shape parsed from the public Open-Meteo
 *                       forecast API (source 'open-meteo'); openMeteoUrl
 *                       builds the request for the corridor mid-point.
 *
 * weatherEffects turns one WeatherDay into planning effects (night fog speed
 * cap, outdoor-work penalty, work types to avoid, heat-buckling risk), and
 * applyWeatherToPassages re-times train paths under a night-only speed cap.
 *
 * The monthly normals below are rounded approximations of IMD climatological
 * normals for a representative station of each region (rain in mm/month,
 * mean daily maximum temperature in °C, share of nights with dense fog). They
 * shape the seeded feed; they are not an IMD product.
 */
import { createRng } from './random.js';
import { latLngAtKm } from './corridors.js';
import { TRAIN_CLASSES } from './constants.js';

//                     Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec
const CLIMATE = {
  // Delhi – Kanpur plains: winter fog, pre-monsoon heat, monsoon Jul–Sep
  NORTH_PLAINS: {
    label: 'Indo-Gangetic plains (north)',
    rain: [19, 20, 15, 10, 25, 70, 210, 250, 120, 15, 5, 9],
    tmax: [20, 24, 30, 36, 40, 39, 35, 34, 34, 33, 28, 22],
    fog: [0.5, 0.25, 0.03, 0, 0, 0, 0, 0, 0, 0.02, 0.12, 0.42],
    wind: [8, 10, 12, 14, 16, 16, 12, 10, 9, 7, 6, 7]
  },
  // Mumbai – Ahmedabad: very heavy SW monsoon on the coast
  WEST_COAST: {
    label: 'West coast (Konkan / Gujarat)',
    rain: [1, 1, 0, 1, 15, 450, 700, 450, 280, 60, 10, 2],
    tmax: [31, 32, 34, 35, 35, 33, 31, 30, 31, 34, 33, 32],
    fog: [0.05, 0.02, 0, 0, 0, 0, 0, 0, 0, 0, 0.01, 0.03],
    wind: [10, 11, 12, 13, 15, 20, 22, 20, 14, 10, 9, 9]
  },
  // Bengaluru – Jolarpettai: moderate SW monsoon, NE monsoon Oct–Nov
  SOUTH_DECCAN: {
    label: 'Deccan plateau (south)',
    rain: [3, 7, 15, 45, 115, 80, 110, 140, 195, 160, 60, 20],
    tmax: [28, 31, 33, 34, 33, 29, 28, 28, 28, 28, 27, 27],
    fog: [0.06, 0.03, 0, 0, 0, 0, 0, 0, 0, 0, 0.03, 0.06],
    wind: [9, 9, 9, 10, 13, 18, 18, 16, 12, 9, 9, 9]
  },
  // Howrah – Asansol: heavy monsoon, winter fog in Dec–Jan
  EAST: {
    label: 'Gangetic West Bengal (east)',
    rain: [12, 25, 30, 50, 130, 280, 330, 320, 280, 140, 20, 5],
    tmax: [26, 29, 34, 36, 36, 34, 32, 32, 32, 32, 30, 27],
    fog: [0.33, 0.15, 0.02, 0, 0, 0, 0, 0, 0, 0.01, 0.08, 0.3],
    wind: [7, 8, 10, 13, 14, 13, 12, 11, 10, 8, 6, 6]
  }
};

/** Region of a corridor from its mean station position. */
export function weatherRegion(corridor) {
  const st = corridor.stations;
  const lat = st.reduce((a, s) => a + s.lat, 0) / st.length;
  const lng = st.reduce((a, s) => a + s.lng, 0) / st.length;
  if (lng >= 84) return 'EAST';
  if (lat >= 24) return 'NORTH_PLAINS';
  if (lng < 75 && lat >= 15) return 'WEST_COAST';
  return 'SOUTH_DECCAN';
}

export function climateOf(region) {
  return CLIMATE[region] || CLIMATE.NORTH_PLAINS;
}

/* --------------------------------------------------------------------- */
/* Dates (UTC arithmetic on ISO dates, so the time zone never shifts a day) */
/* --------------------------------------------------------------------- */

export function toIsoDate(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoToUtcMs(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDaysIso(iso, n) {
  const dt = new Date(isoToUtcMs(iso) + n * 86400000);
  return dt.toISOString().slice(0, 10);
}

function dayDiff(aIso, bIso) {
  return Math.round((isoToUtcMs(aIso) - isoToUtcMs(bIso)) / 86400000);
}

function hashInt(text) {
  let h = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const r1 = (x) => Math.round(x * 10) / 10;

/**
 * Seeded daily weather for `days` days from planStart (Date or 'YYYY-MM-DD').
 * Each date draws from its own RNG (corridor + seed + date), so a date always
 * has the same weather whatever window it is requested in.
 * @returns {Array<{day:number,date:string,fogNight:boolean,visibilityM:number,rainMm:number,maxTempC:number,windKmph:number,source:'seeded',region:string}>}
 */
export function buildWeatherFeed(corridor, seed = 26027, planStart = '2026-09-07', days = 30) {
  const region = weatherRegion(corridor);
  const c = climateOf(region);
  const startIso = toIsoDate(planStart);
  const out = [];
  for (let day = 0; day < days; day++) {
    const date = addDaysIso(startIso, day);
    const month = Number(date.slice(5, 7)) - 1;
    const rng = createRng(hashInt(`${corridor.id}|${seed}|${date}`));
    const monthlyRain = c.rain[month];
    const rainyDays = Math.min(24, 1 + monthlyRain / 22);
    const pRain = rainyDays / 30;
    let rainMm = 0;
    if (rng.next() < pRain) rainMm = r1((monthlyRain / rainyDays) * -Math.log(1 - rng.next()));
    else rng.next();
    const maxTempC = r1(c.tmax[month] + rng.normal(0, 1.8) - (rainMm > 10 ? 2.5 : 0));
    const fogNight = rng.next() < c.fog[month];
    const u = rng.next();
    const visibilityM = fogNight ? Math.round(50 + u * 750) : rainMm > 20 ? Math.round(1500 + u * 2500) : Math.round(4000 + u * 6000);
    const windKmph = Math.round(c.wind[month] + rng.next() * 8 + (rainMm > 30 ? 12 : 0));
    out.push({ day, date, fogNight, visibilityM, rainMm, maxTempC, windKmph, source: 'seeded', region });
  }
  return out;
}

/* --------------------------------------------------------------------- */
/* Effects                                                                */
/* --------------------------------------------------------------------- */

/**
 * Planning thresholds. IMD rainfall categories: heavy ≥ 64.5 mm/day, very
 * heavy ≥ 115.6 mm/day. Fog: visibility below 1000 m at night; loco pilots
 * run at the fog speed (60 km/h modelled) between 22:00 and 08:00. Rail
 * temperature is taken as air maximum + 20 °C (sunlit rail proxy); at air
 * 40 °C (rail ≈ 60 °C) ballast-disturbing work on LWR track is avoided by day.
 */
export const WEATHER_RULES = {
  fogVisibilityM: 1000,
  fogSpeedKmph: 60,
  fogFrom: '22:00',
  fogTo: '08:00',
  rainyDayMm: 2.5,
  heavyRainMm: 64.5,
  veryHeavyRainMm: 115.6,
  heatMaxTempC: 40,
  railOverAirC: 20,
  windStopKmph: 50,
  heatDaytime: ['10:00', '17:00']
};

const hm = (s) => {
  const [h, m] = String(s).split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Work types that involve welding / USFD testing (not done in heavy rain). */
const WET_WELD_TYPES = ['USFD_IMR_RAIL', 'USFD_OBS_RAIL', 'DESTRESSING'];
/** Formation / ballast works (not done in very heavy rain). */
const FORMATION_TYPES = ['DEEP_SCREENING', 'TAMPING', 'CTR', 'BRIDGE_GIRDER'];
/** Tower-wagon / wiring-train OHE works (not done in high wind). */
const OHE_HEIGHT_TYPES = ['CONTACT_WIRE_RENEWAL', 'OHE_REWIRING', 'DROPPER_STAGGER', 'CANTILEVER_REPLACEMENT'];
/** Ballast-disturbing works on LWR track (avoid in the heat of the day). */
const HEAT_TYPES = ['TAMPING', 'DEEP_SCREENING', 'CTR', 'DESTRESSING'];

/**
 * Planning effects of one weather day. Mandatory safety work (USFD IMR etc.)
 * is never deferred by weather — the planner should treat avoidWorkTypes as a
 * soft penalty for non-mandatory tasks only.
 * @returns {{nightSpeedCapKmph:number|null, nightCapWindow:{from:string,to:string,fromMin:number,toMin:number}|null,
 *   outdoorPenalty:number, avoidWorkTypes:string[], daytimeAvoidWorkTypes:string[], daytimeWindow:{fromMin:number,toMin:number}|null,
 *   heatBucklingRisk:boolean, railTempC:number|null, reasons:string[]}}
 */
export function weatherEffects(day, rules = {}) {
  const R = { ...WEATHER_RULES, ...rules };
  const reasons = [];
  if (!day) return { nightSpeedCapKmph: null, nightCapWindow: null, outdoorPenalty: 0, avoidWorkTypes: [], daytimeAvoidWorkTypes: [], daytimeWindow: null, heatBucklingRisk: false, railTempC: null, reasons };
  const rain = Number(day.rainMm) || 0;
  const wind = Number(day.windKmph) || 0;
  const tmax = Number.isFinite(day.maxTempC) ? day.maxTempC : null;
  const fog = !!day.fogNight || (Number.isFinite(day.visibilityM) && day.visibilityM < R.fogVisibilityM);

  let nightSpeedCapKmph = null;
  let nightCapWindow = null;
  if (fog) {
    nightSpeedCapKmph = R.fogSpeedKmph;
    nightCapWindow = { from: R.fogFrom, to: R.fogTo, fromMin: hm(R.fogFrom), toMin: hm(R.fogTo) };
    reasons.push(`Fog: night visibility ${Number.isFinite(day.visibilityM) ? `${day.visibilityM} m` : 'below limit'} (< ${R.fogVisibilityM} m) — trains capped at ${R.fogSpeedKmph} km/h from ${R.fogFrom} to ${R.fogTo}`);
  }

  const avoid = new Set();
  let penalty = 0;
  if (rain >= R.rainyDayMm) {
    penalty += 0.1 + 0.5 * Math.min(1, rain / R.veryHeavyRainMm);
    if (rain < R.heavyRainMm) reasons.push(`Rain ${rain} mm — outdoor work slower`);
  }
  if (rain >= R.heavyRainMm) {
    WET_WELD_TYPES.forEach((w) => avoid.add(w));
    reasons.push(`Heavy rain ${rain} mm (≥ ${R.heavyRainMm} mm, IMD "heavy") — no welding or USFD testing`);
  }
  if (rain >= R.veryHeavyRainMm) {
    FORMATION_TYPES.forEach((w) => avoid.add(w));
    reasons.push(`Very heavy rain ${rain} mm (≥ ${R.veryHeavyRainMm} mm) — no deep screening, tamping, track renewal or girder work`);
  }
  if (wind >= R.windStopKmph) {
    OHE_HEIGHT_TYPES.forEach((w) => avoid.add(w));
    penalty += 0.2;
    reasons.push(`Wind ${wind} km/h (≥ ${R.windStopKmph} km/h) — no tower-wagon OHE work`);
  }
  let heatBucklingRisk = false;
  let railTempC = null;
  let daytimeAvoidWorkTypes = [];
  let daytimeWindow = null;
  if (tmax !== null) {
    railTempC = r1(tmax + R.railOverAirC);
    if (tmax >= R.heatMaxTempC) {
      heatBucklingRisk = true;
      penalty += 0.2;
      daytimeAvoidWorkTypes = HEAT_TYPES.slice();
      daytimeWindow = { fromMin: hm(R.heatDaytime[0]), toMin: hm(R.heatDaytime[1]) };
      reasons.push(`Heat: air ${tmax} °C, rail ≈ ${railTempC} °C — buckling risk on LWR; keep ballast-disturbing work out of ${R.heatDaytime[0]}–${R.heatDaytime[1]}`);
    }
  }
  return {
    nightSpeedCapKmph,
    nightCapWindow,
    outdoorPenalty: Math.round(Math.min(1, penalty) * 100) / 100,
    avoidWorkTypes: [...avoid],
    daytimeAvoidWorkTypes,
    daytimeWindow,
    heatBucklingRisk,
    railTempC,
    reasons
  };
}

/* --------------------------------------------------------------------- */
/* Open-Meteo                                                             */
/* --------------------------------------------------------------------- */

/** Open-Meteo forecast request for the corridor mid-point (≤ 16 days). */
export function openMeteoUrl(corridor, startIso, days = 16) {
  const [lat, lng] = latLngAtKm(corridor, corridor.lengthKm / 2);
  const start = toIsoDate(startIso);
  const n = Math.max(1, Math.min(16, Math.round(days)));
  const end = addDaysIso(start, n - 1);
  const q = [
    `latitude=${lat.toFixed(4)}`,
    `longitude=${lng.toFixed(4)}`,
    'daily=precipitation_sum,temperature_2m_max,wind_speed_10m_max',
    'hourly=visibility',
    'timezone=Asia%2FKolkata',
    `start_date=${start}`,
    `end_date=${end}`
  ];
  return `https://api.open-meteo.com/v1/forecast?${q.join('&')}`;
}

/**
 * Parse an Open-Meteo response into WeatherDay[] (days before planStart are
 * dropped). Fog night = any hour 00:00–07:59 or 22:00–23:59 of that date
 * with visibility < 1000 m; visibilityM is the lowest such night reading.
 */
export function parseOpenMeteo(json, planStartIso) {
  const daily = (json && json.daily) || {};
  const hourly = (json && json.hourly) || {};
  const times = daily.time || [];
  const start = toIsoDate(planStartIso);
  const nightVis = {};
  (hourly.time || []).forEach((t, i) => {
    const v = (hourly.visibility || [])[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) return;
    const date = String(t).slice(0, 10);
    const h = Number(String(t).slice(11, 13));
    if (!(h < 8 || h >= 22)) return;
    nightVis[date] = nightVis[date] === undefined ? v : Math.min(nightVis[date], v);
  });
  const num = (arr, i) => {
    const v = (arr || [])[i];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  const out = [];
  times.forEach((date, i) => {
    const day = dayDiff(date, start);
    if (day < 0) return;
    const vis = nightVis[date];
    out.push({
      day,
      date,
      fogNight: vis !== undefined && vis < WEATHER_RULES.fogVisibilityM,
      visibilityM: vis !== undefined ? Math.round(vis) : null,
      rainMm: num(daily.precipitation_sum, i) ?? 0,
      maxTempC: num(daily.temperature_2m_max, i),
      windKmph: num(daily.wind_speed_10m_max, i) ?? 0,
      source: 'open-meteo'
    });
  });
  return out;
}

/* --------------------------------------------------------------------- */
/* Night-only speed cap on train paths                                    */
/* --------------------------------------------------------------------- */

function inWindow(minute, fromMin, toMin) {
  const m = ((minute % 1440) + 1440) % 1440;
  return fromMin > toMin ? m >= fromMin || m < toMin : m >= fromMin && m < toMin;
}

function passagesOf(corridor, times) {
  const out = [];
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

/**
 * Re-time one train so that every inter-station run that starts inside the
 * window [fromMin, toMin) (wrapping midnight) is made at min(class speed,
 * MPS, cap). Runs outside the window, halts and dwells are unchanged.
 * Returns a new train object (times, passages, arr updated) and the minutes lost.
 */
export function retimeTrainForWindow(corridor, train, capKmph, fromMin, toMin) {
  const cls = TRAIN_CLASSES[train.cls] || TRAIN_CLASSES.EXP;
  const vFree = Math.min(cls.speedKmph, corridor.mpsKmph) * 0.9;
  const vCap = Math.min(cls.speedKmph, corridor.mpsKmph, capKmph) * 0.9;
  if (!(vCap < vFree) || !train.times || train.times.length < 2) return { train, lostMin: 0 };
  const times = [];
  let shift = 0;
  for (let i = 0; i < train.times.length; i++) {
    const cur = train.times[i];
    if (i === 0) {
      times.push({ ...cur });
      continue;
    }
    const prevOrig = train.times[i - 1];
    const prevNew = times[i - 1];
    const run = cur.arr - prevOrig.dep;
    const dist = Math.abs(cur.km - prevOrig.km);
    const moving = (dist / vFree) * 60;
    const allowance = Math.max(0, run - moving);
    const newRun = inWindow(prevNew.dep, fromMin, toMin) ? Math.round(allowance + (dist / vCap) * 60) : run;
    const arr = prevNew.dep + newRun;
    const dwell = cur.dep - cur.arr;
    times.push({ ...cur, arr, dep: arr + dwell });
    shift = arr - cur.arr;
  }
  const nt = { ...train, times };
  nt.passages = passagesOf(corridor, times);
  nt.arr = times[times.length - 1].arr;
  return { train: nt, lostMin: shift };
}

/**
 * Night-only speed cap (fog) applied to the timetable and FOIS paths.
 * opts: { capKmph = 60, from = '22:00', to = '08:00', freightDays?: number[] }
 * freightDays limits the freight re-timing to paths running on those plan
 * days (e.g. the fog nights of a weather feed); omit it to re-time all.
 * Returns a new feeds object; the input is not modified.
 */
export function applyWeatherToPassages(corridor, feeds, opts = {}) {
  const cap = opts.capKmph ?? WEATHER_RULES.fogSpeedKmph;
  const fromMin = hm(opts.from ?? WEATHER_RULES.fogFrom);
  const toMin = hm(opts.to ?? WEATHER_RULES.fogTo);
  if (!(cap < corridor.mpsKmph)) return feeds;
  const days = opts.freightDays ? new Set(opts.freightDays) : null;
  let lost = 0;
  const retime = (t) => {
    const r = retimeTrainForWindow(corridor, t, cap, fromMin, toMin);
    lost += r.lostMin;
    return r.train;
  };
  const timetable = (feeds.timetable || []).map(retime);
  const freight = (feeds.freight || []).map((f) => (days && !days.has(f.day) ? f : retime(f)));
  return { ...feeds, timetable, freight, weatherApplied: { capKmph: cap, from: opts.from ?? WEATHER_RULES.fogFrom, to: opts.to ?? WEATHER_RULES.fogTo, trainMinutesLost: lost } };
}

/** Plan-day indices whose weather calls for the night fog cap. */
export function fogDays(weatherDays, rules = {}) {
  return (weatherDays || []).filter((d) => weatherEffects(d, rules).nightSpeedCapKmph).map((d) => d.day);
}

/** Totals over a past weather window (used to shape the seeded failure log). */
export function weatherTotals(weatherDays, rules = {}) {
  const R = { ...WEATHER_RULES, ...rules };
  let rainMm = 0;
  let fogNights = 0;
  let hotDays = 0;
  let heavyRainDays = 0;
  for (const d of weatherDays || []) {
    rainMm += d.rainMm || 0;
    if (d.fogNight) fogNights++;
    if ((d.maxTempC ?? 0) >= R.heatMaxTempC) hotDays++;
    if ((d.rainMm || 0) >= R.heavyRainMm) heavyRainDays++;
  }
  return { days: (weatherDays || []).length, rainMm: Math.round(rainMm), fogNights, hotDays, heavyRainDays };
}
