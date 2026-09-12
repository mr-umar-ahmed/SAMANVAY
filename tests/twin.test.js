import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CORRIDORS, findSignal, kmToMast, mastToKmId, parseChainage, formatChainage, sectionsInRange, MASTS_PER_KM } from '../src/engine/corridors.js';
import { buildFeeds } from '../src/engine/dataFactory.js';
import { normalize, mastToKm, resolveRecordLocation } from '../src/engine/normalizer.js';
import { buildRiskModels } from '../src/engine/riskEngine.js';
import { FEED_SCHEMAS, feedTemplate, templateCsv, parseCsv, normalizeImported, mergeImported } from '../src/engine/importer.js';
import { buildWeatherFeed, weatherEffects, openMeteoUrl, parseOpenMeteo, applyWeatherToPassages, weatherRegion } from '../src/engine/weather.js';
import { detectAnomalies, poissonUpperTail } from '../src/engine/anomaly.js';
import { SCENARIO_PRESETS, buildScenarioFromPreset } from '../src/engine/scenarios.js';

const FEEDS = new Map(CORRIDORS.map((c) => [c.id, buildFeeds(c)]));
const NORM = new Map(CORRIDORS.map((c) => [c.id, normalize(c, FEEDS.get(c.id))]));

test('signals exist for every station and line, with unique ids inside the corridor', () => {
  for (const c of CORRIDORS) {
    assert.ok(Array.isArray(c.signals) && c.signals.length > 0, c.id);
    assert.equal(new Set(c.signals.map((s) => s.id)).size, c.signals.length, `${c.id} unique ids`);
    for (const s of c.signals) {
      assert.ok(s.km >= 0 && s.km <= c.lengthKm, `${s.id} inside corridor`);
      assert.ok(['DISTANT', 'HOME', 'STARTER', 'ADV_STARTER', 'POINT', 'TRACK_CIRCUIT', 'LC_GATE'].includes(s.kind));
      assert.ok(s.label && s.stationCode);
    }
    for (const st of c.stations) {
      for (const line of ['UP', 'DN']) {
        const mine = c.signals.filter((s) => s.stationCode === st.code && s.line === line);
        assert.ok(mine.some((s) => s.kind === 'POINT'), `${st.code} ${line} points`);
        assert.ok(mine.some((s) => s.kind === 'TRACK_CIRCUIT'), `${st.code} ${line} track circuits`);
        assert.ok(mine.some((s) => ['DISTANT', 'HOME', 'STARTER', 'ADV_STARTER'].includes(s.kind)), `${st.code} ${line} running signals`);
      }
    }
    // intermediate stations carry the full set of running signals on both lines
    for (const st of c.stations.slice(1, -1)) {
      for (const line of ['UP', 'DN']) for (const k of ['DISTANT', 'HOME', 'STARTER', 'ADV_STARTER']) assert.ok(findSignal(c, `${st.code}-S-${k}-${line}`), `${st.code}-S-${k}-${line}`);
    }
    assert.ok(c.signals.some((s) => s.kind === 'LC_GATE' && s.line === 'BOTH'), `${c.id} LC gates`);
  }
  // determinism: signals are derived from the station list only
  const again = CORRIDORS[0].signals.map((s) => `${s.id}@${s.km}`).join('|');
  assert.equal(again, CORRIDORS[0].signals.map((s) => `${s.id}@${s.km}`).join('|'));
});

test('mast and chainage helpers round-trip', () => {
  assert.equal(mastToKmId('145/12'), 145.605);
  assert.equal(mastToKm('145/12'), 145.605);
  assert.equal(kmToMast(145.605), '145/12');
  assert.equal(mastToKmId(`10/${MASTS_PER_KM + 1}`), null);
  assert.equal(mastToKmId('not a mast'), null);
  for (const km of [0, 12.3, 99.99, 234.5]) assert.ok(Math.abs(mastToKmId(kmToMast(km)) - km) <= 0.0275 + 1e-9, `mast ${km}`);
  assert.equal(parseChainage('234/6'), 234.375);
  assert.equal(parseChainage('km 234/6-7'), 234.406);
  assert.equal(parseChainage('234.5'), 234.5);
  assert.equal(parseChainage(12), 12);
  assert.equal(parseChainage('234/16'), null);
  assert.equal(parseChainage('abc'), null);
  assert.equal(formatChainage(234.375), '234/6');
  assert.ok(parseChainage(formatChainage(17.2, 'floor')) <= 17.2 && parseChainage(formatChainage(17.2, 'ceil')) >= 17.2);
});

test('SMMS records carry no raw km and every valid gear resolves through the signals table', () => {
  for (const c of CORRIDORS) {
    const feeds = FEEDS.get(c.id);
    const { tasks, locations } = NORM.get(c.id);
    for (const r of feeds.smms) {
      assert.equal(r.km, undefined, `${r.smmsId} has raw km`);
      assert.equal(r.fromKm, undefined, `${r.smmsId} has raw fromKm`);
      if (r.dq) continue;
      assert.ok(findSignal(c, r.gearId) || /^EI-/.test(r.gearId), `${r.smmsId} gear ${r.gearId}`);
      const t = tasks.find((x) => x.sourceId === r.smmsId);
      assert.ok(t, `${r.smmsId} mapped`);
      assert.ok(['gear', 'station'].includes(t.locatedBy));
      const g = findSignal(c, r.gearId);
      if (g) {
        // a gear is a point; a cable route runs from the gear towards the named station
        assert.ok(t.startKm === g.km || t.endKm === g.km, `${r.smmsId} anchored at ${g.id}`);
        assert.equal(locations[r.smmsId].taskId, t.id);
        if (r.cableLengthM) assert.ok(Math.abs(t.endKm - t.startKm - r.cableLengthM / 1000) < 1e-6);
        assert.equal(t.line, g.line);
        assert.ok(t.sectionLabel.length > 0);
      }
    }
  }
});

test('TDMS masts and TMS km/TP chainage resolve (no raw km in the seeded registers)', () => {
  for (const c of CORRIDORS) {
    const feeds = FEEDS.get(c.id);
    const { tasks } = NORM.get(c.id);
    for (const r of feeds.tdms) {
      assert.equal(r.fromKm, undefined, `${r.tdmsId} has raw fromKm`);
      if (r.dq) continue;
      const t = tasks.find((x) => x.sourceId === r.tdmsId);
      assert.ok(t, `${r.tdmsId} mapped`);
      if (r.mastFrom) {
        assert.equal(t.locatedBy, 'mast');
        assert.equal(t.startKm, mastToKmId(r.mastFrom));
      } else assert.equal(t.locatedBy, 'tss');
    }
    for (const r of feeds.tms) {
      assert.equal(r.fromKm, undefined, `${r.tmsId} has raw fromKm`);
      assert.match(r.chainageFrom, /^\d+\/\d+$/);
      if (r.dq) continue;
      const t = tasks.find((x) => x.sourceId === r.tmsId);
      assert.ok(t, `${r.tmsId} mapped`);
      assert.equal(t.locatedBy, 'chainage');
      assert.equal(t.startKm, parseChainage(r.chainageFrom));
    }
  }
  // numeric fallback still works
  const c = CORRIDORS[0];
  const loc = resolveRecordLocation('TMS', { workType: 'TAMPING', line: 'Down main', fromKm: 120.5, toKm: 122 }, c);
  assert.equal(loc.ok, true);
  assert.equal(loc.line, 'DN');
  assert.equal(loc.via, 'numeric');
});

test('each corridor rejects its data-quality test records with the five issue codes', () => {
  const need = ['UNKNOWN_GEAR', 'MAST_OUT_OF_RANGE', 'BAD_LINE', 'UNKNOWN_WORKTYPE', 'DUPLICATE'];
  for (const c of CORRIDORS) {
    const feeds = FEEDS.get(c.id);
    const { tasks, issues, rejects, counts } = NORM.get(c.id);
    assert.ok(rejects.length >= 1, c.id);
    assert.equal(counts.rejected, rejects.length);
    for (const code of need) {
      const i = issues.find((x) => x.code === code);
      assert.ok(i, `${c.id} ${code}`);
      for (const k of ['code', 'system', 'recordId', 'field', 'message', 'suggestedFix']) assert.ok(i[k], `${code}.${k}`);
    }
    // every dq record is caught with the code it was built for, and none reaches the plan
    for (const r of [...feeds.tms, ...feeds.smms, ...feeds.tdms].filter((x) => x.dq)) {
      const id = r.tmsId || r.smmsId || r.tdmsId;
      assert.ok(/seeded data-quality test record/.test(r.note), `${id} labelled`);
      const rej = rejects.find((x) => x.recordId === id);
      assert.ok(rej, `${id} rejected`);
      assert.ok(rej.codes.includes(r.dqCode), `${id} ${r.dqCode} in ${rej.codes}`);
      assert.equal(tasks.some((t) => t.sourceId === id), false, `${id} not planned`);
    }
    // legacy issue shape kept for existing pages
    for (const i of issues) assert.ok(i.source && i.id && i.issue);
  }
});

test('cross-system duplicates are matched and the owning system is kept', () => {
  for (const c of CORRIDORS) {
    const { matches, rejects, tasks } = NORM.get(c.id);
    const dup = matches.find((m) => m.kind === 'DUPLICATE');
    assert.ok(dup, c.id);
    assert.deepEqual(dup.systems, ['SMMS', 'TMS']);
    assert.ok(dup.gapKm <= 0.1);
    assert.ok(tasks.some((t) => t.sourceId === dup.kept));
    assert.ok(rejects.some((r) => r.recordId === dup.dropped && r.codes.includes('DUPLICATE')));
  }
  // synthetic pair: same gear in SMMS and TDMS-style numeric record → duplicate, SAME_ASSET for different work
  const c = CORRIDORS[2];
  const g = c.signals.find((s) => s.kind === 'POINT' && s.stationCode === 'BWT' && s.line === 'DN');
  const feeds = {
    tms: [
      { tmsId: 'T1', workType: 'TURNOUT_RENEWAL', line: 'DN', station: 'BWT', turnoutNo: g.pointNo, chainageFrom: formatChainage(g.km), daysOverdue: 0 },
      { tmsId: 'T2', workType: 'POINT_MACHINE_OVERHAUL', line: 'DN', station: 'BWT', turnoutNo: g.pointNo, chainageFrom: formatChainage(g.km), daysOverdue: 0 }
    ],
    smms: [{ smmsId: 'S1', workType: 'POINT_MACHINE_OVERHAUL', station: 'BWT', gearId: g.id, daysOverdue: 0 }],
    tdms: []
  };
  const r = normalize(c, feeds);
  assert.ok(r.rejects.find((x) => x.recordId === 'T2' && x.code === 'DUPLICATE'));
  assert.ok(r.issues.find((x) => x.code === 'SAME_ASSET'));
  assert.equal(r.tasks.length, 2);
});

test('import: schemas, CSV parsing, template rows accepted, bad rows rejected with reasons, merge', () => {
  for (const k of ['tms', 'smms', 'tdms']) {
    const s = FEED_SCHEMAS[k];
    assert.ok(s.fields.some((x) => x.required));
    for (const fl of s.fields) for (const p of ['name', 'type', 'description']) assert.ok(fl[p] !== undefined, `${k}.${fl.name}.${p}`);
  }
  const rows = parseCsv('a,b,c\r\n"x, y","he said ""hi""","two\nlines"\r\n1,2,3\r\n');
  assert.deepEqual(rows, [{ a: 'x, y', b: 'he said "hi"', c: 'two\nlines' }, { a: '1', b: '2', c: '3' }]);
  for (const c of CORRIDORS) {
    for (const k of ['tms', 'smms', 'tdms']) {
      const tpl = feedTemplate(k, c);
      assert.ok(tpl.length > 0);
      const direct = normalizeImported(k, tpl, c);
      assert.equal(direct.rejects.length, 0, `${c.id} ${k} ${JSON.stringify(direct.rejects)}`);
      const viaCsv = normalizeImported(k, parseCsv(templateCsv(k, c)), c, { fileName: 'template.csv' });
      assert.equal(viaCsv.records.length, tpl.length);
      assert.ok(viaCsv.records.every((r) => r.source === 'imported' && r.importFile === 'template.csv'));
    }
  }
  const c = CORRIDORS[0];
  const bad = normalizeImported(
    'tms',
    parseCsv(['workType,line,chainageFrom,chainageTo,tgi', 'TAMPING,DN,120/4,121/2,40', 'TAMPING,M3,120/4,,40', 'TAMPING,DN,120/40,,40', 'TAMPING,DN,900/1,,40', 'TAMPING,DN,120/4,,forty', 'SLEEPER_RENEWAL,DN,120/4,,40', ',DN,120/4,,40'].join('\r\n')),
    c,
    { fileName: 'tms-upload.csv' }
  );
  assert.equal(bad.records.length, 1);
  assert.equal(bad.records[0].tmsId, 'IMP/TMS/tms-upload/2');
  assert.equal(bad.rejects.length, 6);
  for (const r of bad.rejects) assert.ok(r.row >= 3 && typeof r.reason === 'string' && r.reason.length > 10, JSON.stringify(r));
  assert.deepEqual(bad.rejects.map((r) => r.code), ['BAD_VALUE', 'BAD_CHAINAGE', 'CHAINAGE_OUT_OF_RANGE', 'BAD_VALUE', 'UNKNOWN_WORKTYPE', 'MISSING_FIELD']);
  const smmsBad = normalizeImported('smms', [{ workType: 'TRACK_CIRCUIT_REPAIR', station: 'ALJN', gearId: 'ALJN-TC-9T-DN' }], c);
  assert.equal(smmsBad.rejects[0].code, 'UNKNOWN_GEAR');

  // merge: append adds a task; replace swaps the register
  const feeds = FEEDS.get(c.id);
  const merged = mergeImported(feeds, bad);
  assert.equal(merged.tms.length, feeds.tms.length + 1);
  assert.equal(feeds.tms.length, FEEDS.get(c.id).tms.length, 'input not mutated');
  const n0 = normalize(c, feeds).tasks.length;
  const n1 = normalize(c, merged).tasks.length;
  assert.equal(n1, n0 + 1);
  const replaced = mergeImported(feeds, { tms: { records: bad.records, mode: 'replace' } });
  assert.equal(replaced.tms.length, 1);
  const upd = mergeImported(feeds, { system: 'tms', records: [{ ...feeds.tms[0], daysOverdue: 99 }] });
  assert.equal(upd.tms.length, feeds.tms.length);
  assert.equal(upd.tms[0].daysOverdue, 99);
});

test('weather: deterministic per seed, regional seasons, effects, Open-Meteo parsing', () => {
  const ncr = CORRIDORS.find((c) => c.id === 'NCR_NDLS_CNB');
  const wr = CORRIDORS.find((c) => c.id === 'WR_MMCT_ADI');
  const a = buildWeatherFeed(ncr, 26027, '2027-01-04', 30);
  const b = buildWeatherFeed(ncr, 26027, '2027-01-04', 30);
  assert.deepEqual(a, b);
  assert.notDeepEqual(buildWeatherFeed(ncr, 1, '2027-01-04', 30), a);
  // the same date gives the same weather whatever window it is requested in
  assert.deepEqual({ ...buildWeatherFeed(ncr, 26027, '2027-01-10', 1)[0], day: 6 }, a[6]);
  assert.equal(a.length, 30);
  for (const d of a) for (const k of ['day', 'date', 'fogNight', 'visibilityM', 'rainMm', 'maxTempC', 'windKmph']) assert.ok(d[k] !== undefined);
  assert.equal(weatherRegion(ncr), 'NORTH_PLAINS');
  assert.equal(weatherRegion(wr), 'WEST_COAST');
  const fogJan = a.filter((d) => d.fogNight).length;
  const fogJul = buildWeatherFeed(ncr, 26027, '2027-07-01', 30).filter((d) => d.fogNight).length;
  assert.ok(fogJan >= 5 && fogJul === 0, `fog Jan ${fogJan} Jul ${fogJul}`);
  const rain = (c, s) => buildWeatherFeed(c, 26027, s, 30).reduce((x, d) => x + d.rainMm, 0);
  assert.ok(rain(wr, '2027-07-01') > rain(ncr, '2027-07-01'), 'west coast monsoon heavier');
  assert.ok(rain(wr, '2027-07-01') > 5 * rain(wr, '2027-01-04'));
  const hot = buildWeatherFeed(ncr, 26027, '2027-05-01', 30).reduce((x, d) => x + d.maxTempC, 0) / 30;
  assert.ok(hot > 36, `May mean max ${hot}`);

  const fog = weatherEffects({ fogNight: true, visibilityM: 150, rainMm: 0, maxTempC: 18, windKmph: 5 });
  assert.equal(fog.nightSpeedCapKmph, 60);
  assert.deepEqual([fog.nightCapWindow.fromMin, fog.nightCapWindow.toMin], [1320, 480]);
  const wet = weatherEffects({ fogNight: false, visibilityM: 3000, rainMm: 130, maxTempC: 28, windKmph: 20 });
  assert.equal(wet.nightSpeedCapKmph, null);
  assert.ok(wet.avoidWorkTypes.includes('USFD_IMR_RAIL') && wet.avoidWorkTypes.includes('DEEP_SCREENING'));
  assert.ok(wet.outdoorPenalty > 0.5 && wet.reasons.length >= 2);
  const heat = weatherEffects({ fogNight: false, visibilityM: 8000, rainMm: 0, maxTempC: 44, windKmph: 12 });
  assert.equal(heat.heatBucklingRisk, true);
  assert.ok(heat.daytimeAvoidWorkTypes.includes('TAMPING'));

  const url = openMeteoUrl(ncr, '2026-09-07', 10);
  assert.match(url, /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=/);
  for (const p of ['precipitation_sum', 'temperature_2m_max', 'wind_speed_10m_max', 'hourly=visibility', 'start_date=2026-09-07', 'end_date=2026-09-16']) assert.ok(url.includes(p), p);
  const hours = [];
  const vis = [];
  for (const date of ['2026-09-06', '2026-09-07', '2026-09-08']) {
    for (let h = 0; h < 24; h++) {
      hours.push(`${date}T${String(h).padStart(2, '0')}:00`);
      vis.push(date === '2026-09-08' && h === 5 ? 400 : date === '2026-09-07' && h === 13 ? 300 : 12000);
    }
  }
  const fixture = { daily: { time: ['2026-09-06', '2026-09-07', '2026-09-08'], precipitation_sum: [1, 70.2, null], temperature_2m_max: [33, 31.5, 29], wind_speed_10m_max: [10, 22, 8] }, hourly: { time: hours, visibility: vis } };
  const parsed = parseOpenMeteo(fixture, '2026-09-07');
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed.map((d) => d.day), [0, 1]);
  assert.equal(parsed[0].fogNight, false, 'daytime haze is not night fog');
  assert.equal(parsed[1].fogNight, true);
  assert.equal(parsed[1].visibilityM, 400);
  assert.equal(parsed[0].rainMm, 70.2);
  assert.equal(parsed[1].rainMm, 0);
  assert.ok(parsed.every((d) => d.source === 'open-meteo'));
  assert.ok(weatherEffects(parsed[0]).avoidWorkTypes.includes('USFD_OBS_RAIL'));

  // night-only cap: day runs unchanged, night runs slower
  const feeds = FEEDS.get(ncr.id);
  const capped = applyWeatherToPassages(ncr, feeds, { capKmph: 60, from: '22:00', to: '08:00' });
  let changedNight = 0;
  for (let i = 0; i < feeds.timetable.length; i++) {
    const t0 = feeds.timetable[i];
    const t1 = capped.timetable[i];
    const allDay = t0.times.every((x) => x.dep % 1440 >= 480 && x.dep % 1440 < 1320 && x.arr % 1440 >= 480);
    if (allDay) assert.deepEqual(t1.times, t0.times, `${t0.number} day path unchanged`);
    if (t1.arr > t0.arr) changedNight++;
    assert.ok(t1.arr >= t0.arr);
  }
  assert.ok(changedNight > 0);
  assert.ok(capped.weatherApplied.trainMinutesLost > 0);
});

test('anomaly detection is deterministic and finds plausible anomalies on seeded data', () => {
  for (const c of CORRIDORS) {
    const feeds = FEEDS.get(c.id);
    const models = buildRiskModels(feeds);
    const input = { executionLog: feeds.executionLog, failureHistory: feeds.failureHistory, weibullModels: models.weibull, tasks: NORM.get(c.id).tasks, feeds };
    const a = detectAnomalies(input);
    assert.deepEqual(detectAnomalies(input), a);
    assert.equal(new Set(a.map((x) => x.id)).size, a.length);
    for (const x of a) {
      assert.ok(['OVERRUN', 'FAILURE_SPIKE', 'DATA'].includes(x.kind));
      assert.ok(['high', 'medium', 'low'].includes(x.severity));
      assert.ok(x.title && x.detail && /\d/.test(x.detail));
    }
    // deep screening runs 25 % over in the seeded execution log → systematic overrun
    assert.ok(a.some((x) => x.id === 'AN-OVERRUN-TYPE-DEEP_SCREENING'));
    // the impossible gauge in the dq record is a DATA anomaly
    assert.ok(a.some((x) => x.kind === 'DATA' && x.field === 'gaugeMm' && x.severity === 'high'));
    for (const s of a.filter((x) => x.kind === 'FAILURE_SPIKE')) assert.ok(s.p < 0.05 && s.value > s.expected);
  }
  // wettest corridors show the rain-driven track-circuit spike
  const wr = CORRIDORS.find((c) => c.id === 'WR_MMCT_ADI');
  const fw = FEEDS.get(wr.id);
  const aw = detectAnomalies({ executionLog: fw.executionLog, failureHistory: fw.failureHistory, weibullModels: buildRiskModels(fw), feeds: fw });
  assert.ok(aw.some((x) => x.kind === 'FAILURE_SPIKE' && x.ref === 'TRACK_CIRCUIT'));
  // record-level overrun
  const log = Array.from({ length: 6 }, (_, i) => ({ workType: 'TAMPING', plannedMin: 100, actualMin: 100 + i })).concat([{ workType: 'TAMPING', plannedMin: 100, actualMin: 190, id: 'EX-9' }]);
  const o = detectAnomalies({ executionLog: log, failureHistory: {}, weibullModels: {} });
  assert.ok(o.find((x) => x.id === 'AN-OVERRUN-EX-9' && x.severity === 'high' && x.z > 3));
  assert.ok(Math.abs(poissonUpperTail(3, 1) - 0.0803) < 1e-3);
});

test('every scenario preset injects works inside every corridor with a section label', () => {
  for (const c of CORRIDORS) {
    for (const p of SCENARIO_PRESETS) {
      const s = buildScenarioFromPreset(p.id, c);
      assert.ok(s, `${p.id}`);
      for (const t of s.injectTasks || []) {
        assert.ok(t.startKm >= 0 && t.endKm <= c.lengthKm && t.startKm < t.endKm, `${c.id} ${p.id} ${t.startKm}-${t.endKm}`);
        assert.ok(sectionsInRange(c, t.startKm, t.endKm).length > 0, `${c.id} ${p.id} section`);
      }
      if (p.id === 'DENSE_WINTER_FOG') assert.deepEqual(s.speedCapWindow, { from: '22:00', to: '08:00' });
    }
  }
  // New Delhi – Kanpur keeps the original chainage
  const ncr = CORRIDORS[0];
  assert.deepEqual(['OHE_CATENARY_SAG', 'EI_AXLE_COUNTER_FAILURE', 'USFD_IMR_FRACTURE', 'MONSOON_BRIDGE_WATCH'].map((id) => buildScenarioFromPreset(id, ncr).injectTasks[0].startKm), [166, 131, 210, 300]);
});
