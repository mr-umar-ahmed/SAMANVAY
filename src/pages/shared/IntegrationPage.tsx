/**
 * IntegrationPage — the feeds SAMANVAY reads, the import adapters for
 * department register files, what failed to normalise, the weather the plan
 * uses, the digital corridor twin and the anomalies found on the data
 * (PS point 1, deck wheel steps 1–2). Planning cell: /app/planning/integration.
 * Division (read-only): /app/division/feeds. ?tab=feeds|import|quality|weather|twin|anomalies.
 *
 * Every figure is counted from the worker snapshot or the store. The feeds are
 * seeded native-schema data generated in the worker; imported files come from
 * the user; the live forecast comes from Open-Meteo when fetched. There is no
 * live link to CRIS systems, so there is no latency, uptime or "last sync".
 */
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, AlertTriangle, Braces, CheckCircle2, CloudFog, CloudSun, Download, FileJson, FileUp, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useAppStore, type FeedSystem, type ImportedBatch } from '../../store/useAppStore';
import { can, type PortalId } from '../../auth/portals';
import type { Anomaly, DataIssue, Dept, Snapshot, Task, WeatherDay } from '../../engine/types';
import { workingBlocks } from '../../engine/select';
import { WORK_TYPES } from '../../engine/constants.js';
import { resolveRecordLocation } from '../../engine/normalizer.js';
import { openMeteoUrl, parseOpenMeteo, weatherEffects, weatherTotals, WEATHER_RULES } from '../../engine/weather.js';
import { useT } from '../../i18n';
import { DEPT_LABEL, dateLabel, download, kmRange, num, pct, timeAgo } from '../../lib/format';
import { Badge, Callout, Card, CardBody, CardFoot, CardHead, DataTable, DeptBadge, EmptyState, KeyValue, Meter, Modal, PageHeader, PlanPending, Segmented, StatTile, Tabs, type Column, type Tone } from '../../components/ui';
import { SeedStamp, SimLabel } from '../../components/ui/extras';
import { CorridorRuler } from '../../components/viz/CorridorRuler';
import { TaskDrawer } from '../../components/domain/TaskDrawer';
import { BlockDrawer } from '../../components/domain/BlockDrawer';
import { useDrawerParams } from '../../components/domain/useDrawerParams';

export interface IntegrationPageProps {
  readOnly?: boolean;
}

const DEPTS: Dept[] = ['TMS', 'SMMS', 'TDMS'];
const SYSTEMS: FeedSystem[] = ['tms', 'smms', 'tdms'];
const SYS_UP: Record<FeedSystem, Dept> = { tms: 'TMS', smms: 'SMMS', tdms: 'TDMS' };
/** Largest file the browser import accepts (records are kept in local storage with the plan inputs). */
const MAX_ROWS = 5000;

const strings = {
  en: {
    title: 'Feeds and data quality',
    lede: 'Native-schema registers and timetables for {corridor}, normalised onto one corridor graph before planning.',
    reseed: 'Reseed',
    reseeding: 'Reseeding…',
    reseedHint: 'Regenerates the seeded feeds and re-runs the plan',
    exportIssues: 'Export issues CSV',
    downloadGraph: 'Download graph JSON',
    readOnly: 'Read-only view for the division. Imports, weather, reseed and issue actions sit with the planning cell.',
    statRecords: 'Register records read',
    statRecordsSub: 'TMS {tms} · SMMS {smms} · TDMS {tdms}',
    statMapped: 'Mapped to the corridor graph',
    statMappedSub: '{n} rejected by the normaliser',
    statIssues: 'Data-quality issues',
    statIssuesSub: '{n} open',
    statPaths: 'Train paths read',
    statPathsSub: 'COA {coa} · FOIS {fois}',
    statRun: 'Last plan run',
    statRunSub: 'Finished {ago}',
    tabFeeds: 'Feeds',
    tabImport: 'Import files',
    tabQuality: 'Data quality',
    tabWeather: 'Weather',
    tabGraph: 'Corridor twin',
    tabAnomalies: 'Anomalies',
    feedsTitle: 'Feeds read by the planning engine',
    feedsSub: 'Counts from the current plan run. Every feed is seeded synthetic data in the native schema of its system, plus any file you imported.',
    feedCoa: 'Working timetable (COA)',
    feedFois: 'Goods path forecast (FOIS)',
    feedTms: 'Track register (TMS)',
    feedSmms: 'Signalling register (SMMS)',
    feedTdms: 'OHE register (TDMS)',
    feedMachines: 'Track machines',
    feedCrews: 'Gangs and units',
    feedExec: 'Execution history',
    feedHistory: 'Failure and escalation history',
    feedWeather: 'Weather (plan days)',
    schemaCoa: 'Train number, class, days of run, station arrival and departure times.',
    schemaFois: 'Rake number, commodity, tonnage, loco, planned departure by day.',
    schemaTms: 'Line code, chainage km/TP from–to, USFD class, TGI, GMT, TSR, days overdue.',
    schemaSmms: 'Station yard, gear id from the interlocking plan, failures in 90 days, MTBF, insulation.',
    schemaTdms: 'Mast km/mast from–to or TSS, elementary section, wire thickness, stagger, flashovers.',
    schemaMachines: 'Machine type, home station, health index, unavailability windows.',
    schemaCrews: 'Crew type, base station, reach, strength, rest day.',
    schemaExec: 'Work type, planned and actual minutes, overrun reason.',
    schemaHistory: 'Asset failure and censoring times; defect escalation outcomes.',
    schemaWeather: 'Night visibility (fog), rain, maximum temperature and wind per day.',
    unitPaths: 'paths',
    unitRecords: 'records',
    unitMachines: 'machines',
    unitCrews: 'crews',
    unitEntries: 'entries',
    unitDays: 'days',
    mappedN: '{n} mapped',
    rejectedN: '{n} rejected',
    allMapped: 'All mapped',
    notNormalised: 'Read directly by the optimiser (no task mapping).',
    factPremium: 'Premium paths',
    factDays: 'Forecast days',
    factOverdue: 'Overdue records',
    factImported: 'From imported file',
    factTestRecords: 'Data-quality test records',
    factUnavailable: 'With unavailability',
    factStrength: 'Total strength',
    factWorkTypes: 'Work types covered',
    factFailures: 'Failure records',
    factEscalations: 'Escalation records',
    factFogNights: 'Fog nights',
    factLiveDays: 'Days from Open-Meteo',
    fields: 'Fields',
    sample: 'Sample record',
    sampleTitle: 'First record of {feed}',
    sampleNote: 'This is the first record exactly as the worker generated it (long lists shortened).',
    recordTitle: 'Record {id} ({system})',
    recordNote: 'The native record as the register holds it.',
    more: '… {n} more',
    close: 'Close',
    colFeed: 'System',
    colRecord: 'Record',
    colCode: 'Code',
    colField: 'Field',
    colIssue: 'Message',
    colFix: 'Suggested fix',
    colAssigned: 'Assigned to',
    colState: 'State',
    stateOpen: 'Open',
    stateAssigned: 'Assigned',
    stateResolved: 'Resolved',
    assignTo: 'Assign to {dept}',
    resolve: 'Mark resolved',
    openWork: 'Open work',
    showRecord: 'Record',
    showOnGraph: 'Show on twin',
    qualityTitle: 'Records the normaliser flagged',
    qualitySub: 'Assignments and resolutions are written to the audit trail.',
    qualityEmpty: 'All records normalised.',
    rejectsTitle: 'Rejected — not planned',
    rejectsSub: 'Quarantined records: they never reach the plan until corrected in the source system.',
    warningsTitle: 'Warnings — planned and raised back to the source',
    warningsSub: 'The record was planned; the finding goes back to the owning department.',
    otherTitle: 'Planner inputs',
    otherSub: 'Requisition references the planner could not resolve in this run.',
    testRecord: 'Seeded test record',
    testRecordHint: 'Deliberately bad record in the seeded feed, there to exercise the normaliser.',
    testOnly: 'Test records only',
    allCodes: 'All codes',
    qStatRejected: 'Records rejected',
    qStatRejectedSub: '{n} of them seeded test records',
    qStatWarnings: 'Warnings on planned records',
    qStatWarningsSub: 'Raised back to the source system',
    fieldOther: '—',
    fixWorkType: 'Map the work type to the SAMANVAY catalogue in the source register.',
    fixChainage: 'Correct the chainage in the source register.',
    fixDue: 'Verify the due date with the section SSE.',
    fixLine: 'Correct the line code (UP / DN / BOTH).',
    fixOther: 'Review the record in the source system.',
    graphTitle: 'Records and blocks per block section',
    graphSub: 'Select a block section to list the works mapped onto it.',
    twinTitle: 'Digital corridor twin',
    twinSub: 'Stations, block sections, signalling, OHE and every register record at its resolved chainage, with this week’s blocks. Zoom and pan; hover or tap a mark for its native reference.',
    graphStations: 'Stations',
    graphSections: 'Block sections',
    graphOhe: 'OHE elementary sections',
    graphSignals: 'Signals',
    graphPoints: 'Points',
    graphTrackCircuits: 'Track circuits and axle counters',
    graphLc: 'LC gates',
    graphTss: 'Traction sub-stations',
    graphCorridorBlocks: 'COA corridor blocks',
    graphPairs: 'Co-location pairs',
    graphLocated: 'Works located by gear id · mast · chainage',
    colSection: 'Block section',
    colKm: 'Chainage',
    colOhe: 'OHE sections',
    colBlocks: 'Blocks this week',
    sectionWorks: 'Works on {section}',
    noWorks: 'No works are mapped onto this block section.',
    colWork: 'Work',
    colLine: 'Line',
    toastReseed: 'Feeds regenerated (seed {seed})',
    toastReseedBody: 'Same seed, same records — the plan was re-run on them.',
    toastAssigned: 'Issue {id} assigned to {dept}',
    toastResolved: 'Issue {id} marked resolved',
    toastExported: '{n} issues exported',
    toastGraph: 'Corridor graph downloaded',
    /* import */
    impTitle: 'Import a register file',
    impSub: 'Load a TMS, SMMS or TDMS file in the system’s own columns. Rows are validated and located exactly like the seeded register before anything reaches the plan.',
    impSystem: 'System',
    impSchemaTitle: '{system} file schema',
    impLocationRule: 'Location: {rule}',
    impIdField: 'Record id column: {field}',
    impTemplate: 'Download CSV template',
    impSchemaJson: 'Download schema JSON',
    impTemplateNote: 'The template’s sample rows are the first records of the seeded register (seed {seed}).',
    colName: 'Column',
    colType: 'Type',
    colUnit: 'Unit',
    colReq: 'Required',
    colExample: 'Example',
    colDesc: 'Meaning',
    required: 'Required',
    optional: 'Optional',
    impFile: 'Choose a CSV or JSON file',
    impPaste: 'Or paste CSV or JSON',
    impPastePh: 'workType,line,chainageFrom,…',
    impClear: 'Clear',
    impLoading: 'Loading the import adapters…',
    impLoadFailed: 'The import adapters could not be loaded: {msg}',
    impParseError: 'The file could not be read: {msg}',
    impTooMany: 'The file has {n} rows; the browser import takes at most {max}.',
    impNoRows: 'No data rows found (a CSV needs a header row and at least one row).',
    impRead: '{rows} rows read · {ok} accepted · {bad} rejected · {warn} warnings',
    impAccepted: 'Accepted records',
    impAcceptedMore: 'First {n} of {total} shown.',
    impRejects: 'Rejected rows',
    impWarnings: 'Warnings',
    colRow: 'Line / item',
    colReason: 'Reason',
    colNative: 'Native reference',
    colResolved: 'Resolved',
    colWorkType: 'Work type',
    impMode: 'How to use the file',
    modeAppend: 'Append to the register',
    modeReplace: 'Replace the register',
    modeAppendHint: 'Records are added to the seeded register; a record with the same id updates it.',
    modeReplaceHint: 'The seeded {system} register is replaced by this file for this corridor.',
    impReplacesBatch: 'This replaces the {system} file already imported ({file}).',
    impAdd: 'Add to plan',
    impAddHint: 'Stores the accepted records with the plan inputs and re-runs the plan.',
    impNoRecords: 'No accepted record to add.',
    impNotPlan: 'Only the block planning cell can import files.',
    impLabel: 'Imported file — no live link to {system}',
    impBatches: 'Imported files',
    impBatchesEmpty: 'No file imported. The plan uses the seeded registers only.',
    impBatchLine: '{n} records · {rej} rejected on import · {mode} · {ago}',
    impBatchOther: 'For corridor {id} — not used on this corridor.',
    impInPlan: 'In this plan: {n} records from the file, {tasks} planned as works, {rej} rejected by the normaliser.',
    impRemove: 'Remove',
    toastImported: '{n} {system} records added to the plan',
    toastImportedBody: '{file} · {mode} · re-planning now',
    toastRemoved: '{system} import removed',
    toastRemovedBody: 'The plan is re-run on the seeded register.',
    toastTemplate: '{system} template downloaded',
    toastSchema: '{system} schema downloaded',
    replanImport: 'feed import',
    replanImportRemoved: 'feed import removed',
    /* weather */
    wxTitle: 'Weather the plan uses',
    wxSub: 'Per plan day: fog at night caps train speeds; heavy rain, wind and heat screen out some works (mandatory safety work is never deferred by weather).',
    wxSeeded: 'Seeded IMD-shaped weather, seed {seed}',
    wxSeededRegion: 'Seeded IMD-shaped weather for {region}, seed {seed}',
    wxLive: 'Open-Meteo forecast, fetched {time} — not IMD',
    wxLiveOther: 'A live forecast is stored for corridor {id}; this corridor uses seeded weather.',
    wxFetch: 'Fetch live forecast (Open-Meteo)',
    wxFetching: 'Fetching…',
    wxUseSeeded: 'Use seeded weather',
    wxFetchHint: 'Asks api.open-meteo.com for {n} days at the corridor mid-point ({lat}, {lng}). Only the coordinates and dates are sent.',
    wxOffline: 'You are offline — the live forecast cannot be fetched. The plan keeps its current weather.',
    wxError: 'Forecast not fetched: {msg}. The plan keeps its current weather.',
    wxNoDays: 'The forecast has no day inside this plan’s window (plan starts {date}).',
    wxWeek: 'Plan week',
    wxAll: 'All {n} days',
    colDate: 'Day',
    colSource: 'Source',
    colFog: 'Night visibility',
    colRain: 'Rain',
    colTemp: 'Max temp',
    colWind: 'Wind',
    colEffects: 'Planning effects',
    srcSeeded: 'Seeded',
    srcLive: 'Open-Meteo',
    fog: 'Fog {v} m',
    clear: '{v} m',
    noEffect: 'No effect',
    fxFog: 'Trains capped at {cap} km/h {from}–{to}',
    fxRain: 'Outdoor work slower (+{pen})',
    fxHeavy: 'No welding / USFD: {types}',
    fxVeryHeavy: 'No formation work: {types}',
    fxWind: 'No tower-wagon OHE work: {types}',
    fxHeat: 'Rail ≈ {rail} °C: ballast work out of {from}–{to}',
    wxStatFog: 'Fog nights this week',
    wxStatRain: 'Rain this week',
    wxStatHeavy: 'Heavy-rain days',
    wxStatHot: 'Days ≥ {t} °C',
    wxRules: 'Thresholds: fog below {vis} m at night (speed cap {cap} km/h, {from}–{to}); heavy rain ≥ {heavy} mm (IMD); very heavy ≥ {vheavy} mm; wind ≥ {wind} km/h; heat ≥ {heat} °C air.',
    toastWx: 'Live forecast applied: {n} days from Open-Meteo',
    toastWxBody: 'Re-planning with the forecast.',
    toastWxFail: 'Forecast not fetched',
    toastWxSeeded: 'Seeded weather restored',
    replanWx: 'live weather forecast',
    replanWxSeeded: 'seeded weather',
    /* anomalies */
    anTitle: 'Anomalies in the data',
    anSub: 'Found by the engine on every run: overruns by robust z-score, failure spikes against the fitted Weibull hazard, and impossible or stale register values.',
    anModel: 'Model output on seeded history',
    anNone: 'No anomaly found in this run.',
    kindFAILURE_SPIKE: 'Failure spikes',
    kindOVERRUN: 'Execution overruns',
    kindDATA: 'Register values',
    sevhigh: 'High',
    sevmedium: 'Medium',
    sevlow: 'Low',
    anValue: 'Value {v}',
    anExpected: 'expected {v}',
    anZ: 'z {v}',
    anP: 'p {v}',
    anOpenTask: 'Open work {id}',
    anOpenType: 'Open a {type} work',
    anRegister: 'Register',
    anAdherence: 'Execution log',
  },
  hi: {
    title: 'फ़ीड और डेटा गुणवत्ता',
    lede: '{corridor} के मूल-स्कीमा रजिस्टर और समय-सारणी, योजना से पहले एक कॉरिडोर ग्राफ़ पर सामान्यीकृत।',
    reseed: 'Reseed',
    reseeding: 'Reseed हो रहा है…',
    reseedHint: 'सीडेड फ़ीड दोबारा बनाता है और योजना फिर चलाता है',
    exportIssues: 'समस्याएँ CSV में निर्यात करें',
    downloadGraph: 'ग्राफ़ JSON डाउनलोड करें',
    readOnly: 'मंडल के लिए केवल-पठन दृश्य। आयात, मौसम, Reseed और समस्या कार्रवाई योजना प्रकोष्ठ के पास है।',
    statRecords: 'पढ़े गए रजिस्टर रिकॉर्ड',
    statRecordsSub: 'TMS {tms} · SMMS {smms} · TDMS {tdms}',
    statMapped: 'कॉरिडोर ग्राफ़ पर मैप',
    statMappedSub: 'नॉर्मलाइज़र ने {n} अस्वीकार किए',
    statIssues: 'डेटा-गुणवत्ता समस्याएँ',
    statIssuesSub: '{n} खुली',
    statPaths: 'पढ़े गए ट्रेन पाथ',
    statPathsSub: 'COA {coa} · FOIS {fois}',
    statRun: 'पिछला योजना रन',
    statRunSub: '{ago} पूरा हुआ',
    tabFeeds: 'फ़ीड',
    tabImport: 'फ़ाइल आयात',
    tabQuality: 'डेटा गुणवत्ता',
    tabWeather: 'मौसम',
    tabGraph: 'कॉरिडोर ट्विन',
    tabAnomalies: 'विसंगतियाँ',
    feedsTitle: 'योजना इंजन द्वारा पढ़े गए फ़ीड',
    feedsSub: 'वर्तमान योजना रन से गिनती। हर फ़ीड अपनी प्रणाली के मूल स्कीमा में सीडेड सिंथेटिक डेटा है, साथ में आपकी आयात की गई फ़ाइल।',
    feedCoa: 'कार्यकारी समय-सारणी (COA)',
    feedFois: 'मालगाड़ी पाथ पूर्वानुमान (FOIS)',
    feedTms: 'ट्रैक रजिस्टर (TMS)',
    feedSmms: 'सिग्नलिंग रजिस्टर (SMMS)',
    feedTdms: 'OHE रजिस्टर (TDMS)',
    feedMachines: 'ट्रैक मशीनें',
    feedCrews: 'गैंग और यूनिट',
    feedExec: 'निष्पादन इतिहास',
    feedHistory: 'विफलता और एस्केलेशन इतिहास',
    feedWeather: 'मौसम (योजना दिन)',
    schemaCoa: 'ट्रेन संख्या, श्रेणी, चलने के दिन, स्टेशन आगमन व प्रस्थान समय।',
    schemaFois: 'रेक संख्या, वस्तु, टन भार, लोको, दिनवार नियोजित प्रस्थान।',
    schemaTms: 'लाइन कोड, चेनेज km/TP से–तक, USFD श्रेणी, TGI, GMT, TSR, देय से अधिक दिन।',
    schemaSmms: 'स्टेशन यार्ड, इंटरलॉकिंग प्लान से गियर आईडी, 90 दिनों की विफलताएँ, MTBF, इन्सुलेशन।',
    schemaTdms: 'मास्ट km/मास्ट से–तक या TSS, एलिमेंटरी सेक्शन, तार मोटाई, स्टैगर, फ़्लैशओवर।',
    schemaMachines: 'मशीन प्रकार, होम स्टेशन, हेल्थ इंडेक्स, अनुपलब्धता अवधि।',
    schemaCrews: 'क्रू प्रकार, बेस स्टेशन, पहुँच, संख्या, विश्राम दिन।',
    schemaExec: 'कार्य प्रकार, नियोजित व वास्तविक मिनट, ओवररन कारण।',
    schemaHistory: 'परिसंपत्ति विफलता व सेंसरिंग समय; दोष एस्केलेशन परिणाम।',
    schemaWeather: 'हर दिन रात की दृश्यता (कोहरा), वर्षा, अधिकतम तापमान और हवा।',
    unitPaths: 'पाथ',
    unitRecords: 'रिकॉर्ड',
    unitMachines: 'मशीनें',
    unitCrews: 'क्रू',
    unitEntries: 'प्रविष्टियाँ',
    unitDays: 'दिन',
    mappedN: '{n} मैप',
    rejectedN: '{n} अस्वीकृत',
    allMapped: 'सभी मैप',
    notNormalised: 'ऑप्टिमाइज़र सीधे पढ़ता है (कार्य मैपिंग नहीं)।',
    factPremium: 'प्रीमियम पाथ',
    factDays: 'पूर्वानुमान दिन',
    factOverdue: 'देय से अधिक रिकॉर्ड',
    factImported: 'आयात की गई फ़ाइल से',
    factTestRecords: 'डेटा-गुणवत्ता परीक्षण रिकॉर्ड',
    factUnavailable: 'अनुपलब्धता सहित',
    factStrength: 'कुल संख्या',
    factWorkTypes: 'शामिल कार्य प्रकार',
    factFailures: 'विफलता रिकॉर्ड',
    factEscalations: 'एस्केलेशन रिकॉर्ड',
    factFogNights: 'कोहरे की रातें',
    factLiveDays: 'Open-Meteo से दिन',
    fields: 'फ़ील्ड',
    sample: 'नमूना रिकॉर्ड',
    sampleTitle: '{feed} का पहला रिकॉर्ड',
    sampleNote: 'यह पहला रिकॉर्ड है, ठीक वैसा जैसा वर्कर ने बनाया (लंबी सूचियाँ छोटी की गईं)।',
    recordTitle: 'रिकॉर्ड {id} ({system})',
    recordNote: 'रजिस्टर में जैसा है वैसा मूल रिकॉर्ड।',
    more: '… {n} और',
    close: 'बंद करें',
    colFeed: 'प्रणाली',
    colRecord: 'रिकॉर्ड',
    colCode: 'कोड',
    colField: 'फ़ील्ड',
    colIssue: 'संदेश',
    colFix: 'सुझाया गया सुधार',
    colAssigned: 'सौंपा गया',
    colState: 'स्थिति',
    stateOpen: 'खुली',
    stateAssigned: 'सौंपी गई',
    stateResolved: 'सुलझी',
    assignTo: '{dept} को सौंपें',
    resolve: 'सुलझी चिह्नित करें',
    openWork: 'कार्य खोलें',
    showRecord: 'रिकॉर्ड',
    showOnGraph: 'ट्विन पर दिखाएँ',
    qualityTitle: 'नॉर्मलाइज़र द्वारा चिह्नित रिकॉर्ड',
    qualitySub: 'सौंपना और सुलझाना ऑडिट ट्रेल में दर्ज होता है।',
    qualityEmpty: 'सभी रिकॉर्ड सामान्यीकृत।',
    rejectsTitle: 'अस्वीकृत — योजना में नहीं',
    rejectsSub: 'रोके गए रिकॉर्ड: स्रोत प्रणाली में सुधार तक योजना में नहीं आते।',
    warningsTitle: 'चेतावनी — योजना में, स्रोत को वापस भेजी गई',
    warningsSub: 'रिकॉर्ड नियोजित हुआ; निष्कर्ष संबंधित विभाग को जाता है।',
    otherTitle: 'प्लानर इनपुट',
    otherSub: 'माँग-पत्र संदर्भ जिन्हें प्लानर इस रन में नहीं पहचान सका।',
    testRecord: 'सीडेड परीक्षण रिकॉर्ड',
    testRecordHint: 'सीडेड फ़ीड में जान-बूझकर गलत रिकॉर्ड, नॉर्मलाइज़र की जाँच के लिए।',
    testOnly: 'केवल परीक्षण रिकॉर्ड',
    allCodes: 'सभी कोड',
    qStatRejected: 'अस्वीकृत रिकॉर्ड',
    qStatRejectedSub: 'इनमें {n} सीडेड परीक्षण रिकॉर्ड',
    qStatWarnings: 'नियोजित रिकॉर्ड पर चेतावनी',
    qStatWarningsSub: 'स्रोत प्रणाली को वापस भेजी गई',
    fieldOther: '—',
    fixWorkType: 'स्रोत रजिस्टर में कार्य प्रकार को SAMANVAY सूची से मिलाएँ।',
    fixChainage: 'स्रोत रजिस्टर में चेनेज सुधारें।',
    fixDue: 'सेक्शन SSE से देय तिथि सत्यापित करें।',
    fixLine: 'लाइन कोड सुधारें (UP / DN / BOTH)।',
    fixOther: 'स्रोत प्रणाली में रिकॉर्ड की समीक्षा करें।',
    graphTitle: 'प्रति ब्लॉक सेक्शन रिकॉर्ड और ब्लॉक',
    graphSub: 'किसी ब्लॉक सेक्शन को चुनें और उस पर मैप कार्य देखें।',
    twinTitle: 'डिजिटल कॉरिडोर ट्विन',
    twinSub: 'स्टेशन, ब्लॉक सेक्शन, सिग्नलिंग, OHE और हर रजिस्टर रिकॉर्ड अपने निर्धारित चेनेज पर, इस सप्ताह के ब्लॉक सहित। ज़ूम व पैन करें; मूल संदर्भ के लिए निशान पर होवर या टैप करें।',
    graphStations: 'स्टेशन',
    graphSections: 'ब्लॉक सेक्शन',
    graphOhe: 'OHE एलिमेंटरी सेक्शन',
    graphSignals: 'सिग्नल',
    graphPoints: 'पॉइंट',
    graphTrackCircuits: 'ट्रैक सर्किट व एक्सल काउंटर',
    graphLc: 'LC गेट',
    graphTss: 'कर्षण उप-स्टेशन (TSS)',
    graphCorridorBlocks: 'COA कॉरिडोर ब्लॉक',
    graphPairs: 'सह-स्थान जोड़े',
    graphLocated: 'गियर आईडी · मास्ट · चेनेज से स्थित कार्य',
    colSection: 'ब्लॉक सेक्शन',
    colKm: 'चेनेज',
    colOhe: 'OHE सेक्शन',
    colBlocks: 'इस सप्ताह ब्लॉक',
    sectionWorks: '{section} पर कार्य',
    noWorks: 'इस ब्लॉक सेक्शन पर कोई कार्य मैप नहीं है।',
    colWork: 'कार्य',
    colLine: 'लाइन',
    toastReseed: 'फ़ीड फिर बने (seed {seed})',
    toastReseedBody: 'वही seed, वही रिकॉर्ड — योजना उन पर फिर चलाई गई।',
    toastAssigned: 'समस्या {id} {dept} को सौंपी गई',
    toastResolved: 'समस्या {id} सुलझी चिह्नित',
    toastExported: '{n} समस्याएँ निर्यात',
    toastGraph: 'कॉरिडोर ग्राफ़ डाउनलोड हुआ',
    impTitle: 'रजिस्टर फ़ाइल आयात करें',
    impSub: 'TMS, SMMS या TDMS फ़ाइल उसी प्रणाली के कॉलम में लोड करें। योजना तक पहुँचने से पहले पंक्तियाँ सीडेड रजिस्टर की तरह ही जाँची और स्थित की जाती हैं।',
    impSystem: 'प्रणाली',
    impSchemaTitle: '{system} फ़ाइल स्कीमा',
    impLocationRule: 'स्थान: {rule}',
    impIdField: 'रिकॉर्ड आईडी कॉलम: {field}',
    impTemplate: 'CSV टेम्पलेट डाउनलोड करें',
    impSchemaJson: 'स्कीमा JSON डाउनलोड करें',
    impTemplateNote: 'टेम्पलेट की नमूना पंक्तियाँ सीडेड रजिस्टर के पहले रिकॉर्ड हैं (seed {seed})।',
    colName: 'कॉलम',
    colType: 'प्रकार',
    colUnit: 'इकाई',
    colReq: 'आवश्यक',
    colExample: 'उदाहरण',
    colDesc: 'अर्थ',
    required: 'आवश्यक',
    optional: 'वैकल्पिक',
    impFile: 'CSV या JSON फ़ाइल चुनें',
    impPaste: 'या CSV / JSON चिपकाएँ',
    impPastePh: 'workType,line,chainageFrom,…',
    impClear: 'साफ़ करें',
    impLoading: 'आयात एडेप्टर लोड हो रहे हैं…',
    impLoadFailed: 'आयात एडेप्टर लोड नहीं हुए: {msg}',
    impParseError: 'फ़ाइल पढ़ी नहीं जा सकी: {msg}',
    impTooMany: 'फ़ाइल में {n} पंक्तियाँ हैं; ब्राउज़र आयात अधिकतम {max} लेता है।',
    impNoRows: 'कोई डेटा पंक्ति नहीं मिली (CSV में हेडर पंक्ति और कम से कम एक पंक्ति चाहिए)।',
    impRead: '{rows} पंक्तियाँ पढ़ीं · {ok} स्वीकृत · {bad} अस्वीकृत · {warn} चेतावनी',
    impAccepted: 'स्वीकृत रिकॉर्ड',
    impAcceptedMore: '{total} में से पहले {n} दिखाए।',
    impRejects: 'अस्वीकृत पंक्तियाँ',
    impWarnings: 'चेतावनियाँ',
    colRow: 'पंक्ति / आइटम',
    colReason: 'कारण',
    colNative: 'मूल संदर्भ',
    colResolved: 'निर्धारित',
    colWorkType: 'कार्य प्रकार',
    impMode: 'फ़ाइल का उपयोग',
    modeAppend: 'रजिस्टर में जोड़ें',
    modeReplace: 'रजिस्टर बदलें',
    modeAppendHint: 'रिकॉर्ड सीडेड रजिस्टर में जुड़ते हैं; समान आईडी वाला रिकॉर्ड उसे अद्यतन करता है।',
    modeReplaceHint: 'इस कॉरिडोर के लिए सीडेड {system} रजिस्टर इस फ़ाइल से बदल जाता है।',
    impReplacesBatch: 'यह पहले आयात की गई {system} फ़ाइल ({file}) की जगह लेगी।',
    impAdd: 'योजना में जोड़ें',
    impAddHint: 'स्वीकृत रिकॉर्ड योजना इनपुट के साथ सहेजता है और योजना फिर चलाता है।',
    impNoRecords: 'जोड़ने के लिए कोई स्वीकृत रिकॉर्ड नहीं।',
    impNotPlan: 'फ़ाइल आयात केवल ब्लॉक योजना प्रकोष्ठ कर सकता है।',
    impLabel: 'आयात की गई फ़ाइल — {system} से कोई लाइव कड़ी नहीं',
    impBatches: 'आयात की गई फ़ाइलें',
    impBatchesEmpty: 'कोई फ़ाइल आयात नहीं। योजना केवल सीडेड रजिस्टर उपयोग करती है।',
    impBatchLine: '{n} रिकॉर्ड · आयात पर {rej} अस्वीकृत · {mode} · {ago}',
    impBatchOther: 'कॉरिडोर {id} के लिए — इस कॉरिडोर पर उपयोग नहीं।',
    impInPlan: 'इस योजना में: फ़ाइल से {n} रिकॉर्ड, {tasks} कार्य के रूप में नियोजित, नॉर्मलाइज़र ने {rej} अस्वीकार किए।',
    impRemove: 'हटाएँ',
    toastImported: '{n} {system} रिकॉर्ड योजना में जोड़े',
    toastImportedBody: '{file} · {mode} · योजना फिर चल रही है',
    toastRemoved: '{system} आयात हटाया',
    toastRemovedBody: 'योजना सीडेड रजिस्टर पर फिर चलाई गई।',
    toastTemplate: '{system} टेम्पलेट डाउनलोड हुआ',
    toastSchema: '{system} स्कीमा डाउनलोड हुआ',
    replanImport: 'feed import',
    replanImportRemoved: 'feed import removed',
    wxTitle: 'योजना द्वारा उपयोग किया मौसम',
    wxSub: 'हर योजना दिन: रात का कोहरा ट्रेन गति सीमित करता है; भारी वर्षा, हवा और गर्मी कुछ कार्य रोकती है (अनिवार्य सुरक्षा कार्य मौसम से कभी नहीं टलता)।',
    wxSeeded: 'सीडेड IMD-जैसा मौसम, seed {seed}',
    wxSeededRegion: '{region} के लिए सीडेड IMD-जैसा मौसम, seed {seed}',
    wxLive: 'Open-Meteo पूर्वानुमान, {time} पर लिया — IMD नहीं',
    wxLiveOther: 'कॉरिडोर {id} के लिए लाइव पूर्वानुमान संग्रहीत है; यह कॉरिडोर सीडेड मौसम उपयोग करता है।',
    wxFetch: 'लाइव पूर्वानुमान लें (Open-Meteo)',
    wxFetching: 'लिया जा रहा है…',
    wxUseSeeded: 'सीडेड मौसम उपयोग करें',
    wxFetchHint: 'api.open-meteo.com से कॉरिडोर मध्य-बिंदु ({lat}, {lng}) के {n} दिन माँगता है। केवल निर्देशांक और तिथियाँ भेजी जाती हैं।',
    wxOffline: 'आप ऑफ़लाइन हैं — लाइव पूर्वानुमान नहीं लिया जा सकता। योजना वर्तमान मौसम रखती है।',
    wxError: 'पूर्वानुमान नहीं मिला: {msg}। योजना वर्तमान मौसम रखती है।',
    wxNoDays: 'पूर्वानुमान में इस योजना की अवधि का कोई दिन नहीं (योजना {date} से)।',
    wxWeek: 'योजना सप्ताह',
    wxAll: 'सभी {n} दिन',
    colDate: 'दिन',
    colSource: 'स्रोत',
    colFog: 'रात की दृश्यता',
    colRain: 'वर्षा',
    colTemp: 'अधिकतम तापमान',
    colWind: 'हवा',
    colEffects: 'योजना पर प्रभाव',
    srcSeeded: 'सीडेड',
    srcLive: 'Open-Meteo',
    fog: 'कोहरा {v} m',
    clear: '{v} m',
    noEffect: 'कोई प्रभाव नहीं',
    fxFog: 'ट्रेनें {from}–{to} {cap} km/h तक सीमित',
    fxRain: 'बाहरी कार्य धीमा (+{pen})',
    fxHeavy: 'वेल्डिंग / USFD नहीं: {types}',
    fxVeryHeavy: 'फ़ॉर्मेशन कार्य नहीं: {types}',
    fxWind: 'टावर-वैगन OHE कार्य नहीं: {types}',
    fxHeat: 'रेल ≈ {rail} °C: {from}–{to} बैलास्ट कार्य नहीं',
    wxStatFog: 'इस सप्ताह कोहरे की रातें',
    wxStatRain: 'इस सप्ताह वर्षा',
    wxStatHeavy: 'भारी वर्षा के दिन',
    wxStatHot: '{t} °C या अधिक के दिन',
    wxRules: 'सीमाएँ: रात में दृश्यता {vis} m से कम पर कोहरा (गति सीमा {cap} km/h, {from}–{to}); भारी वर्षा ≥ {heavy} mm (IMD); अति भारी ≥ {vheavy} mm; हवा ≥ {wind} km/h; गर्मी ≥ {heat} °C।',
    toastWx: 'लाइव पूर्वानुमान लागू: Open-Meteo से {n} दिन',
    toastWxBody: 'पूर्वानुमान के साथ योजना फिर चल रही है।',
    toastWxFail: 'पूर्वानुमान नहीं मिला',
    toastWxSeeded: 'सीडेड मौसम बहाल',
    replanWx: 'live weather forecast',
    replanWxSeeded: 'seeded weather',
    anTitle: 'डेटा में विसंगतियाँ',
    anSub: 'हर रन पर इंजन द्वारा: robust z-score से ओवररन, फ़िट Weibull hazard के विरुद्ध विफलता वृद्धि, और असंभव या पुराने रजिस्टर मान।',
    anModel: 'सीडेड इतिहास पर मॉडल आउटपुट',
    anNone: 'इस रन में कोई विसंगति नहीं।',
    kindFAILURE_SPIKE: 'विफलता वृद्धि',
    kindOVERRUN: 'निष्पादन ओवररन',
    kindDATA: 'रजिस्टर मान',
    sevhigh: 'अधिक',
    sevmedium: 'मध्यम',
    sevlow: 'कम',
    anValue: 'मान {v}',
    anExpected: 'अपेक्षित {v}',
    anZ: 'z {v}',
    anP: 'p {v}',
    anOpenTask: 'कार्य {id} खोलें',
    anOpenType: '{type} कार्य खोलें',
    anRegister: 'रजिस्टर',
    anAdherence: 'निष्पादन लॉग',
  },
} as const;

type Key = keyof typeof strings.en;
type TFn = (key: Key, vars?: Record<string, string | number>) => string;
type TabId = 'feeds' | 'import' | 'quality' | 'weather' | 'twin' | 'anomalies';
const TAB_IDS: TabId[] = ['feeds', 'import', 'quality', 'weather', 'twin', 'anomalies'];
type IssueState = 'OPEN' | 'ASSIGNED' | 'RESOLVED';

/** Normaliser / importer issue (engine/normalizer.js issueOf); older snapshots carry only source / id / issue. */
type Issue = DataIssue & { code?: string; severity?: 'reject' | 'warn'; system?: string; recordId?: string; field?: string; message?: string; suggestedFix?: string; rejected?: boolean; dq?: boolean; relatedId?: string };
type CountsV4 = Snapshot['counts'] & { dq?: number; warnings?: number; byCode?: Record<string, number> };
type AnomalyV4 = Anomaly & { workType?: string; assetClass?: string; system?: string; field?: string; taskId?: string; p?: number };
type WeatherDayV4 = WeatherDay & { region?: string };
type Rec = Record<string, unknown>;

interface FeedCard {
  id: string;
  system: string;
  name: Key;
  schema: Key;
  unit: Key;
  count: number;
  mapped: number | null;
  rejected: number | null;
  facts: { label: Key; value: number }[];
  sample: unknown;
  seeded: boolean;
}

interface IssueRow extends Issue {
  key: string;
  dept: Dept | null;
  fieldText: string;
  fixText: string;
  state: IssueState;
  assignedTo: string | null;
}

interface GraphRow {
  index: number;
  label: string;
  startKm: number;
  endKm: number;
  ohe: string[];
  counts: Record<Dept, number>;
  blocks: number;
}

/** Record viewer (feeds sample or a flagged record). */
interface RecordView {
  title: string;
  note: string;
  system: string;
  data: unknown;
  seeded: boolean;
}

const ISSUE_ASSIGNED = 'DATA_ISSUE_ASSIGNED';
const ISSUE_RESOLVED = 'DATA_ISSUE_RESOLVED';

/** Fallback field / fix for issues from older snapshots (no code or suggestedFix). */
function classify(issue: string): { field: string | null; fix: Key } {
  if (issue.startsWith('Unknown work type') || issue.startsWith('Work type')) return { field: 'workType', fix: 'fixWorkType' };
  if (issue.startsWith('Chainage')) return { field: 'km / fromKm', fix: 'fixChainage' };
  if (issue.startsWith('TSR imposed')) return { field: 'daysOverdue', fix: 'fixDue' };
  if (issue.startsWith('Line code')) return { field: 'line', fix: 'fixLine' };
  return { field: null, fix: 'fixOther' };
}

const asDept = (s: string | undefined): Dept | null => (s && (DEPTS as string[]).includes(s) ? (s as Dept) : null);
const recordIdOf = (r: Rec) => (r.tmsId ?? r.smmsId ?? r.tdmsId ?? r.id ?? null) as string | null;
const str = (r: Rec, k: string) => (typeof r[k] === 'string' && (r[k] as string).trim() !== '' ? (r[k] as string) : undefined);

/** Native location reference of a register record (what the source system calls the place). */
function nativeRef(sys: Dept, r: Rec): string {
  if (sys === 'SMMS') return [str(r, 'gearId'), str(r, 'station')].filter(Boolean).join(' · ') || '—';
  if (sys === 'TDMS') return str(r, 'tssCode') ?? (str(r, 'mastFrom') ? `${str(r, 'mastFrom')}${str(r, 'mastTo') ? ` → ${str(r, 'mastTo')}` : ''}${str(r, 'elementarySection') ? ` (${str(r, 'elementarySection')})` : ''}` : '—');
  const ch = str(r, 'chainageFrom');
  if (ch) return `km/TP ${ch}${str(r, 'chainageTo') ? `–${str(r, 'chainageTo')}` : ''}`;
  if (typeof r.fromKm === 'number') return `km ${r.fromKm}${typeof r.toKm === 'number' ? `–${r.toKm}` : ''}`;
  return str(r, 'station') ?? '—';
}

/** Shorten long arrays so a generated record fits on screen; values are not changed. */
function preview(v: unknown, more: (n: number) => string, depth = 0): unknown {
  if (Array.isArray(v)) {
    const head = v.slice(0, 3).map((x) => preview(x, more, depth + 1));
    return v.length > 3 ? [...head, more(v.length - 3)] : head;
  }
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, depth > 2 ? '…' : preview(x, more, depth + 1)]));
  }
  return v;
}

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

export default function IntegrationPage({ readOnly = false }: IntegrationPageProps) {
  const t = useT(strings);
  const drawer = useDrawerParams();
  const [params, setParams] = useSearchParams();

  const snapshot = useAppStore((s) => s.snapshot);
  const planStatus = useAppStore((s) => s.planStatus);
  const lastPlannedAt = useAppStore((s) => s.lastPlannedAt);
  const planVersion = useAppStore((s) => s.planVersion);
  const user = useAppStore((s) => s.user);
  const audit = useAppStore((s) => s.audit);
  const approvals = useAppStore((s) => s.approvals);
  const dataIssueStatus = useAppStore((s) => s.dataIssueStatus);
  const assignDataIssue = useAppStore((s) => s.assignDataIssue);
  const resolveDataIssue = useAppStore((s) => s.resolveDataIssue);
  const runPlan = useAppStore((s) => s.runPlan);
  const notify = useAppStore((s) => s.notify);
  const toast = useAppStore((s) => s.toast);

  const rawTab = params.get('tab');
  const tab: TabId = rawTab === 'graph' ? 'twin' : TAB_IDS.includes(rawTab as TabId) ? (rawTab as TabId) : 'feeds';
  const setTab = (v: TabId) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', v);
        return next;
      },
      { replace: true }
    );
  const [view, setView] = useState<RecordView | null>(null);
  const [section, setSection] = useState<number | null>(null);
  const [codeFilter, setCodeFilter] = useState<string | null>(null);
  const [testOnly, setTestOnly] = useState(false);

  const canAct = !readOnly && can(user, 'plan');
  const blocks = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals]);

  const issuesAll = useMemo(() => (snapshot?.issues ?? []) as Issue[], [snapshot]);

  const feeds: FeedCard[] = useMemo(() => {
    if (!snapshot) return [];
    const f = snapshot.feeds;
    const rejectedOf = (src: Dept) => new Set(issuesAll.filter((i) => (i.system ?? i.source) === src && (i.rejected === true || i.severity === 'reject' || (i.rejected === undefined && !i.taskId))).map((i) => i.recordId ?? i.id)).size;
    const overdue = (recs: Rec[]) => recs.filter((r) => typeof r.daysOverdue === 'number' && r.daysOverdue > 0).length;
    const register = (src: Dept, recs: Rec[], name: Key, schema: Key): FeedCard => {
      const rejected = rejectedOf(src);
      return {
        id: src,
        system: src,
        name,
        schema,
        unit: 'unitRecords',
        count: recs.length,
        mapped: recs.length - rejected,
        rejected,
        facts: [
          { label: 'factOverdue', value: overdue(recs) },
          { label: 'factImported', value: recs.filter((r) => r.source === 'imported').length },
          { label: 'factTestRecords', value: recs.filter((r) => r.dq === true).length },
        ],
        sample: recs.find((r) => r.source !== 'imported') ?? recs[0] ?? null,
        seeded: true,
      };
    };
    const failures = Object.values(f.failureHistoryCounts).reduce((a, b) => a + b, 0);
    const wx = (f.weather ?? []) as WeatherDayV4[];
    return [
      { id: 'COA', system: 'COA', name: 'feedCoa', schema: 'schemaCoa', unit: 'unitPaths', count: f.timetable.length, mapped: null, rejected: null, facts: [{ label: 'factPremium', value: f.timetable.filter((x) => x.premium).length }], sample: f.timetable[0] ?? null, seeded: true },
      { id: 'FOIS', system: 'FOIS', name: 'feedFois', schema: 'schemaFois', unit: 'unitPaths', count: f.freight.length, mapped: null, rejected: null, facts: [{ label: 'factDays', value: new Set(f.freight.map((x) => x.day)).size }], sample: f.freight[0] ?? null, seeded: true },
      register('TMS', f.tms, 'feedTms', 'schemaTms'),
      register('SMMS', f.smms, 'feedSmms', 'schemaSmms'),
      register('TDMS', f.tdms, 'feedTdms', 'schemaTdms'),
      { id: 'MACHINES', system: 'TMS / TDMS', name: 'feedMachines', schema: 'schemaMachines', unit: 'unitMachines', count: f.machines.length, mapped: null, rejected: null, facts: [{ label: 'factUnavailable', value: f.machines.filter((m) => m.unavailable.length > 0).length }], sample: f.machines[0] ?? null, seeded: true },
      { id: 'CREWS', system: 'TMS / SMMS / TDMS', name: 'feedCrews', schema: 'schemaCrews', unit: 'unitCrews', count: f.crews.length, mapped: null, rejected: null, facts: [{ label: 'factStrength', value: f.crews.reduce((a, c) => a + c.strength, 0) }], sample: f.crews[0] ?? null, seeded: true },
      { id: 'EXEC', system: 'block execution log', name: 'feedExec', schema: 'schemaExec', unit: 'unitEntries', count: f.executionLog.length, mapped: null, rejected: null, facts: [{ label: 'factWorkTypes', value: new Set(f.executionLog.map((x) => x.workType)).size }], sample: f.executionLog[0] ?? null, seeded: true },
      { id: 'HISTORY', system: 'failure / escalation register', name: 'feedHistory', schema: 'schemaHistory', unit: 'unitEntries', count: failures + f.escalationHistoryCount, mapped: null, rejected: null, facts: [{ label: 'factFailures', value: failures }, { label: 'factEscalations', value: f.escalationHistoryCount }], sample: null, seeded: true },
      { id: 'WEATHER', system: 'weather', name: 'feedWeather', schema: 'schemaWeather', unit: 'unitDays', count: wx.length, mapped: null, rejected: null, facts: [{ label: 'factFogNights', value: wx.filter((d) => d.day < 7 && d.fogNight).length }, { label: 'factLiveDays', value: wx.filter((d) => d.source === 'open-meteo').length }], sample: wx[0] ?? null, seeded: !wx.some((d) => d.source === 'open-meteo') },
    ];
  }, [snapshot, issuesAll]);

  const issues: IssueRow[] = useMemo(() => {
    if (!snapshot) return [];
    // audit is newest first: fallback for historical logs
    const last = new Map<string, string>();
    const assigned = new Map<string, string>();
    for (const e of audit) {
      if (e.action !== ISSUE_ASSIGNED && e.action !== ISSUE_RESOLVED) continue;
      if (!last.has(e.entityId)) last.set(e.entityId, e.action);
      if (e.action === ISSUE_ASSIGNED && !assigned.has(e.entityId)) assigned.set(e.entityId, e.detail ?? '');
    }
    return issuesAll.map((i) => {
      const key = `${i.id} · ${i.issue}`;
      const direct = dataIssueStatus?.[key];
      const a = direct ? direct.state : last.get(key);
      const assignedTo = direct ? (direct.assignedTo ?? null) : (assigned.get(key) ?? null);
      const fb = classify(i.issue);
      return {
        ...i,
        key,
        dept: asDept(i.system ?? i.source),
        fieldText: i.field ?? fb.field ?? t('fieldOther'),
        fixText: i.suggestedFix ?? t(fb.fix),
        state: a === 'RESOLVED' || a === ISSUE_RESOLVED ? 'RESOLVED' : a === 'ASSIGNED' || a === ISSUE_ASSIGNED ? 'ASSIGNED' : 'OPEN',
        assignedTo,
      };
    });
  }, [snapshot, issuesAll, audit, dataIssueStatus, t]);

  const graph: GraphRow[] = useMemo(() => {
    if (!snapshot) return [];
    const c = snapshot.corridor;
    return c.blockSections.map((s) => {
      const counts: Record<Dept, number> = { TMS: 0, SMMS: 0, TDMS: 0 };
      for (const task of snapshot.tasks) if (task.sections.includes(s.index)) counts[task.dept]++;
      return {
        index: s.index,
        label: s.label,
        startKm: s.startKm,
        endKm: s.endKm,
        ohe: c.oheSections.filter((o) => Math.max(o.startKm, s.startKm) < Math.min(o.endKm, s.endKm)).map((o) => o.label),
        counts,
        blocks: snapshot.result.weekly.ai.blocks.filter((b) => b.sections.includes(s.index)).length,
      };
    });
  }, [snapshot]);

  const sectionTasks: Task[] = useMemo(() => (snapshot && section !== null ? snapshot.tasks.filter((x) => x.sections.includes(section)) : []), [snapshot, section]);

  if (!snapshot) return <PlanPending />;

  const c = snapshot.corridor;
  const seed = snapshot.seed;
  const counts = snapshot.counts as CountsV4;
  const openIssues = issues.filter((i) => i.state !== 'RESOLVED').length;
  const running = planStatus === 'running';
  const anomalies = (snapshot.anomalies ?? []) as AnomalyV4[];

  /* ── actions ─────────────────────────────────────────────── */
  const reseed = async () => {
    await runPlan({ reason: 'reseed' });
    toast({ title: t('toastReseed', { seed }), body: t('toastReseedBody'), tone: 'ok' });
  };

  const assign = (i: IssueRow) => {
    if (!i.dept) return;
    assignDataIssue(i.key, i.dept);
    notify({ portals: [i.dept.toLowerCase() as PortalId], dept: i.dept, kind: 'ACTION', title: `Data-quality issue on ${i.recordId ?? i.id}`, body: `${i.code ? `${i.code}: ` : ''}${i.message ?? i.issue}`, route: `/app/${i.dept.toLowerCase()}/register?asset=${encodeURIComponent(i.recordId ?? i.id)}` });
    toast({ title: t('toastAssigned', { id: i.recordId ?? i.id, dept: DEPT_LABEL[i.dept].short }), tone: 'ok' });
  };

  const resolve = (i: IssueRow) => {
    resolveDataIssue(i.key);
    toast({ title: t('toastResolved', { id: i.recordId ?? i.id }), tone: 'ok' });
  };

  const exportIssues = () => {
    const head = [t('colFeed'), t('colRecord'), t('colCode'), t('colField'), t('colIssue'), t('colFix'), 'rejected', 'dq', t('colAssigned'), t('colState')];
    const rows = issues.map((i) => [i.system ?? i.source, i.recordId ?? i.id, i.code ?? '', i.fieldText, i.message ?? i.issue, i.fixText, i.rejected ? 'yes' : 'no', i.dq ? 'yes' : 'no', i.assignedTo ?? '', i.state].map(csvCell).join(','));
    download(`samanvay-data-issues-${c.code}.csv`, [head.map(csvCell).join(','), ...rows].join('\n'), 'text/csv');
    toast({ title: t('toastExported', { n: issues.length }), tone: 'ok' });
  };

  const downloadGraph = () => {
    const payload = {
      corridor: { id: c.id, code: c.code, name: c.name, lengthKm: c.lengthKm, stations: c.stations, blockSections: c.blockSections, oheSections: c.oheSections, tss: c.tss, signals: c.signals ?? [], corridorBlocks: c.corridorBlocks },
      records: snapshot.tasks.map((x) => ({ id: x.id, sourceId: x.sourceId, source: x.source, dept: x.dept, line: x.line, startKm: x.startKm, endKm: x.endKm, nativeLocation: x.nativeLocation, sections: x.sections, oheSections: x.oheSections })),
      seed,
    };
    download(`samanvay-graph-${c.code}.json`, JSON.stringify(payload, null, 2), 'application/json');
    toast({ title: t('toastGraph'), tone: 'ok' });
  };

  const showOnGraph = (i: IssueRow) => {
    const task = i.taskId ? snapshot.tasks.find((x) => x.id === i.taskId) : undefined;
    setSection(task?.sections[0] ?? null);
    setTab('twin');
  };

  const showRecord = (i: IssueRow) => {
    const sys = asDept(i.system ?? i.source);
    if (!sys) return;
    const recs = snapshot.feeds[sys.toLowerCase() as FeedSystem] as Rec[];
    const rec = recs.find((r) => recordIdOf(r) === (i.recordId ?? i.id));
    if (!rec) return;
    setView({ title: t('recordTitle', { id: i.recordId ?? i.id, system: sys }), note: t('recordNote'), system: sys, data: rec, seeded: rec.source !== 'imported' });
  };

  /* ── columns ─────────────────────────────────────────────── */
  const issueCols = (withRecordBtn: boolean): Column<IssueRow>[] => [
    { key: 'source', header: t('colFeed'), render: (i) => (i.dept ? <DeptBadge dept={i.dept} /> : <Badge>{i.system ?? i.source}</Badge>) },
    {
      key: 'id',
      header: t('colRecord'),
      render: (i) => (
        <span className="stack" style={{ gap: 2 }}>
          <span className="mono small">{i.recordId ?? i.id}</span>
          {i.dq && (
            <Badge tone="lavender" title={t('testRecordHint')}>
              {t('testRecord')}
            </Badge>
          )}
        </span>
      ),
    },
    { key: 'code', header: t('colCode'), render: (i) => (i.code ? <span className="mono tiny">{i.code}</span> : <span className="muted">—</span>) },
    { key: 'field', header: t('colField'), render: (i) => <span className="mono small">{i.fieldText}</span>, hideMobile: true },
    { key: 'issue', header: t('colIssue'), render: (i) => <span className="small">{i.message ?? i.issue}</span> },
    { key: 'fix', header: t('colFix'), render: (i) => <span className="small muted">{i.fixText}</span>, hideMobile: true },
    { key: 'assigned', header: t('colAssigned'), hideMobile: true, render: (i) => (i.assignedTo && asDept(i.assignedTo) ? <DeptBadge dept={asDept(i.assignedTo)!} /> : <span className="muted">—</span>) },
    {
      key: 'state',
      header: t('colState'),
      render: (i) => <Badge tone={i.state === 'RESOLVED' ? 'ok' : i.state === 'ASSIGNED' ? 'info' : 'warn'}>{t(i.state === 'RESOLVED' ? 'stateResolved' : i.state === 'ASSIGNED' ? 'stateAssigned' : 'stateOpen')}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      render: (i) => (
        <div className="row-wrap" style={{ justifyContent: 'flex-end' }}>
          {withRecordBtn && i.dept && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => showRecord(i)}>
              <Braces /> {t('showRecord')}
            </button>
          )}
          {i.taskId && (
            <>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => drawer.open('task', i.taskId!)}>{t('openWork')}</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => showOnGraph(i)}>{t('showOnGraph')}</button>
            </>
          )}
          {canAct && i.state === 'OPEN' && i.dept && (
            <button type="button" className="btn btn-sm" onClick={() => assign(i)}>{t('assignTo', { dept: DEPT_LABEL[i.dept].short })}</button>
          )}
          {canAct && i.state !== 'RESOLVED' && (
            <button type="button" className="btn btn-sm" onClick={() => resolve(i)}>{t('resolve')}</button>
          )}
        </div>
      ),
    },
  ];

  const graphCols: Column<GraphRow>[] = [
    { key: 'label', header: t('colSection'), render: (r) => <span className="strong">{r.label}</span> },
    { key: 'km', header: t('colKm'), render: (r) => <span className="mono small">{kmRange(r.startKm, r.endKm)}</span> },
    { key: 'ohe', header: t('colOhe'), render: (r) => <span className="small" title={r.ohe.join(', ')}>{r.ohe.length}</span>, num: true, hideMobile: true },
    ...DEPTS.map((d): Column<GraphRow> => ({ key: d, header: DEPT_LABEL[d].short, num: true, render: (r) => <span className="num">{r.counts[d]}</span> })),
    { key: 'blocks', header: t('colBlocks'), num: true, render: (r) => <span className="num">{r.blocks}</span> },
  ];

  const workCols: Column<Task>[] = [
    { key: 'dept', header: '', render: (x) => <DeptBadge dept={x.dept} /> },
    { key: 'label', header: t('colWork'), render: (x) => (<div><div className="small strong">{x.label}</div><div className="tiny muted mono">{x.id} · {x.nativeLocation ?? x.sourceId}</div></div>) },
    { key: 'line', header: t('colLine'), render: (x) => <span className="small">{x.line}</span> },
    { key: 'km', header: t('colKm'), render: (x) => <span className="mono small">{kmRange(x.startKm, x.endKm)}</span> },
  ];

  const selected = section !== null ? graph.find((g) => g.index === section) ?? null : null;

  /* quality split: rejects / warnings / planner inputs */
  const filteredIssues = issues.filter((i) => (!codeFilter || i.code === codeFilter) && (!testOnly || i.dq));
  const isReject = (i: IssueRow) => i.rejected === true || i.severity === 'reject';
  const isWarn = (i: IssueRow) => !isReject(i) && i.severity === 'warn';
  const rejectRows = filteredIssues.filter(isReject);
  const warnRows = filteredIssues.filter(isWarn);
  const otherRows = filteredIssues.filter((i) => !isReject(i) && !isWarn(i));
  const byCode = counts.byCode ?? Object.fromEntries([...new Set(issues.map((i) => i.code).filter((x): x is string => !!x))].map((k) => [k, issues.filter((i) => i.code === k).length]));
  const rejectedRecords = new Set(issues.filter(isReject).map((i) => `${i.system ?? i.source}:${i.recordId ?? i.id}`));
  const dqRejected = new Set(issues.filter((i) => isReject(i) && i.dq).map((i) => `${i.system ?? i.source}:${i.recordId ?? i.id}`)).size;

  /* twin facts */
  const signals = c.signals ?? [];
  const sigKinds = (kinds: string[]) => signals.filter((s) => kinds.includes(s.kind)).length;
  const located = { gear: snapshot.tasks.filter((x) => typeof x.metrics.gearId === 'string').length, mast: snapshot.tasks.filter((x) => typeof x.metrics.mastFrom === 'string').length, chainage: snapshot.tasks.filter((x) => typeof x.metrics.chainageFrom === 'string').length };

  return (
    <div className="stack-lg">
      <PageHeader
        title={t('title')}
        lede={t('lede', { corridor: c.name })}
        badges={<SeedStamp seed={seed} runId={planVersion} ms={snapshot.timing.ms} />}
        actions={
          <>
            <button type="button" className="btn btn-sm" onClick={exportIssues} disabled={!issues.length}>
              <Download /> {t('exportIssues')}
            </button>
            <button type="button" className="btn btn-sm" onClick={downloadGraph}>
              <FileJson /> {t('downloadGraph')}
            </button>
            {canAct && (
              <button type="button" className="btn btn-sm" onClick={() => void reseed()} disabled={running} title={t('reseedHint')}>
                <RefreshCw className={running ? 'spin' : ''} /> {running ? t('reseeding') : t('reseed')}
              </button>
            )}
          </>
        }
      />

      {readOnly && <div className="small muted">{t('readOnly')}</div>}

      <div className="stat-grid">
        <StatTile label={t('statRecords')} value={num(counts.TMS + counts.SMMS + counts.TDMS)} sub={t('statRecordsSub', { tms: counts.TMS, smms: counts.SMMS, tdms: counts.TDMS })} />
        <StatTile label={t('statMapped')} value={num(counts.total)} sub={t('statMappedSub', { n: counts.rejected })} />
        <StatTile label={t('statIssues')} value={num(issues.length)} sub={t('statIssuesSub', { n: openIssues })} />
        <StatTile label={t('statPaths')} value={num(snapshot.feeds.timetable.length + snapshot.feeds.freight.length)} sub={t('statPathsSub', { coa: snapshot.feeds.timetable.length, fois: snapshot.feeds.freight.length })} />
        <StatTile label={t('statRun')} value={(snapshot.timing.ms / 1000).toFixed(1)} unit="s" sub={lastPlannedAt ? t('statRunSub', { ago: timeAgo(lastPlannedAt) }) : undefined} />
      </div>

      <Tabs<TabId>
        tabs={[
          { id: 'feeds', label: t('tabFeeds'), count: feeds.length },
          { id: 'import', label: t('tabImport') },
          { id: 'quality', label: t('tabQuality'), count: openIssues },
          { id: 'weather', label: t('tabWeather') },
          { id: 'twin', label: t('tabGraph'), count: c.blockSections.length },
          { id: 'anomalies', label: t('tabAnomalies'), count: anomalies.length },
        ]}
        value={tab}
        onChange={setTab}
        tour="integration-tabs"
      />

      {tab === 'feeds' && (
        <div className="stack">
          <div>
            <div className="strong">{t('feedsTitle')}</div>
            <div className="small muted">{t('feedsSub')}</div>
          </div>
          <div className="grid grid-auto" data-tour="integration-feeds">
            {feeds.map((f) => (
              <Card key={f.id}>
                <CardHead title={t(f.name)} sub={<span className="mono">{f.system}</span>} />
                <CardBody>
                  <div className="stack">
                    <div className="row" style={{ alignItems: 'baseline' }}>
                      <span className="h2 num">{num(f.count)}</span>
                      <span className="small muted">{t(f.unit)}</span>
                    </div>
                    <div className="small muted">{t(f.schema)}</div>
                    {f.mapped !== null && f.rejected !== null ? (
                      <div className="stack" style={{ gap: 4 }}>
                        <Meter value={f.count ? f.mapped / f.count : 0} tone={f.rejected ? 'warn' : 'ok'} />
                        <div className="row-between small">
                          <span className="num">{t('mappedN', { n: f.mapped })}</span>
                          {f.rejected ? (
                            <Badge tone="warn" icon={<AlertTriangle size={11} />}>{t('rejectedN', { n: f.rejected })}</Badge>
                          ) : (
                            <Badge tone="ok" icon={<CheckCircle2 size={11} />}>{t('allMapped')}</Badge>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="tiny muted">{t('notNormalised')}</div>
                    )}
                    <KeyValue items={f.facts.map((x) => [t(x.label), <span key={x.label} className="num">{num(x.value)}</span>])} />
                    {f.sample !== null && typeof f.sample === 'object' && (
                      <div className="tiny muted mono truncate" title={Object.keys(f.sample as object).join(', ')}>
                        {t('fields')}: {Object.keys(f.sample as object).slice(0, 6).join(', ')}
                      </div>
                    )}
                  </div>
                </CardBody>
                <CardFoot>
                  <div className="row-between" style={{ width: '100%' }}>
                    {f.seeded ? <SimLabel kind="seededFeed" system={f.system} seed={seed} /> : <span className="tag-sim">{t('srcLive')}</span>}
                    {f.sample !== null && (
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setView({ title: t('sampleTitle', { feed: t(f.name) }), note: t('sampleNote'), system: f.system, data: f.sample, seeded: f.seeded })}>
                        <Braces /> {t('sample')}
                      </button>
                    )}
                  </div>
                </CardFoot>
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === 'import' && <ImportPanel snapshot={snapshot} canAct={canAct} readOnly={readOnly} t={t} />}

      {tab === 'quality' && (
        <div className="stack-lg">
          <div className="stat-grid">
            <StatTile label={t('qStatRejected')} value={num(rejectedRecords.size)} sub={t('qStatRejectedSub', { n: dqRejected })} pastel={rejectedRecords.size ? 'pink' : undefined} />
            <StatTile label={t('qStatWarnings')} value={num(counts.warnings ?? issues.filter(isWarn).length)} sub={t('qStatWarningsSub')} />
            <StatTile label={t('factTestRecords')} value={num(counts.dq ?? 0)} sub={t('testRecordHint')} />
          </div>
          <div className="row-wrap" data-tour="quality-filters">
            <button type="button" className={`btn btn-sm ${codeFilter === null ? 'btn-dark' : ''}`} aria-pressed={codeFilter === null} onClick={() => setCodeFilter(null)}>
              {t('allCodes')}
            </button>
            {Object.entries(byCode)
              .sort((a, b) => b[1] - a[1])
              .map(([code, n]) => (
                <button key={code} type="button" className={`btn btn-sm ${codeFilter === code ? 'btn-dark' : ''}`} aria-pressed={codeFilter === code} onClick={() => setCodeFilter(codeFilter === code ? null : code)}>
                  <span className="mono">{code}</span> <span className="num">{n}</span>
                </button>
              ))}
            <label className="check small">
              <input type="checkbox" checked={testOnly} onChange={(e) => setTestOnly(e.target.checked)} />
              {t('testOnly')}
            </label>
          </div>
          <Card>
            <CardHead title={t('rejectsTitle')} sub={t('rejectsSub')} right={<SimLabel kind="seededFeed" system="TMS / SMMS / TDMS" seed={seed} />} />
            <CardBody flush>
              <DataTable columns={issueCols(true)} rows={rejectRows} rowKey={(i) => i.key} empty={<EmptyState title={t('qualityEmpty')} icon={<CheckCircle2 />} />} />
            </CardBody>
          </Card>
          <Card>
            <CardHead title={t('warningsTitle')} sub={t('warningsSub')} />
            <CardBody flush>
              <DataTable columns={issueCols(true)} rows={warnRows} rowKey={(i) => i.key} empty={<EmptyState title={t('qualityEmpty')} icon={<CheckCircle2 />} />} />
            </CardBody>
          </Card>
          {otherRows.length > 0 && (
            <Card>
              <CardHead title={t('otherTitle')} sub={t('otherSub')} />
              <CardBody flush>
                <DataTable columns={issueCols(false)} rows={otherRows} rowKey={(i) => i.key} />
              </CardBody>
            </Card>
          )}
          <div className="tiny muted">{t('qualitySub')}</div>
        </div>
      )}

      {tab === 'weather' && <WeatherPanel snapshot={snapshot} canAct={canAct} t={t} />}

      {tab === 'twin' && (
        <div className="stack-lg">
          <Card tour="corridor-twin">
            <CardHead title={t('twinTitle')} sub={t('twinSub')} icon={<Activity />} />
            <CardBody>
              <CorridorRuler corridor={c} tasks={snapshot.tasks} blocks={blocks} onOpenTask={(id) => drawer.open('task', id, { close: 'block' })} onOpenBlock={(id) => drawer.open('block', id, { close: 'task' })} />
            </CardBody>
          </Card>
          <div className="grid grid-main-aside" style={{ alignItems: 'start' }}>
            <Card>
              <CardHead title={t('graphTitle')} sub={t('graphSub')} />
              <CardBody flush>
                <DataTable columns={graphCols} rows={graph} rowKey={(r) => String(r.index)} onRowClick={(r) => setSection(r.index)} selectedKey={section !== null ? String(section) : null} compact />
              </CardBody>
            </Card>
            <div className="stack">
              <Card>
                <CardBody>
                  <KeyValue
                    items={[
                      [t('graphStations'), <span key="st" className="num">{c.stations.length}</span>],
                      [t('graphSections'), <span key="bs" className="num">{c.blockSections.length}</span>],
                      [t('graphOhe'), <span key="oh" className="num">{c.oheSections.length}</span>],
                      [t('graphTss'), <span key="ts" className="num">{c.tss.length}</span>],
                      [t('graphSignals'), <span key="sg" className="num">{sigKinds(['DISTANT', 'HOME', 'STARTER', 'ADV_STARTER'])}</span>],
                      [t('graphPoints'), <span key="pt" className="num">{sigKinds(['POINT'])}</span>],
                      [t('graphTrackCircuits'), <span key="tc" className="num">{sigKinds(['TRACK_CIRCUIT'])}</span>],
                      [t('graphLc'), <span key="lc" className="num">{sigKinds(['LC_GATE'])}</span>],
                      [t('graphLocated'), <span key="lo" className="num">{located.gear} · {located.mast} · {located.chainage}</span>],
                      [t('graphCorridorBlocks'), <span key="cb" className="num">{c.corridorBlocks.length}</span>],
                      [t('graphPairs'), <span key="pr" className="num">{snapshot.pairs.length}</span>],
                    ]}
                  />
                </CardBody>
              </Card>
              {selected && (
                <Card>
                  <CardHead title={t('sectionWorks', { section: selected.label })} sub={<span className="mono">{kmRange(selected.startKm, selected.endKm)}</span>} />
                  <CardBody flush>
                    <DataTable columns={workCols} rows={sectionTasks} rowKey={(x) => x.id} onRowClick={(x) => drawer.open('task', x.id)} empty={t('noWorks')} compact />
                  </CardBody>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'anomalies' && <AnomalyPanel snapshot={snapshot} anomalies={anomalies} readOnly={readOnly} t={t} openTask={(id) => drawer.open('task', id)} />}

      <Modal
        open={!!view}
        onClose={() => setView(null)}
        title={view?.title ?? ''}
        footer={
          <button type="button" className="btn" onClick={() => setView(null)}>
            {t('close')}
          </button>
        }
      >
        {view && (
          <div className="stack">
            <div className="row-between">
              <span className="small muted">{view.note}</span>
              {view.seeded ? <SimLabel kind="seededFeed" system={view.system} seed={seed} /> : <span className="tag-sim">{view.system === 'weather' ? t('srcLive') : t('impLabel', { system: view.system })}</span>}
            </div>
            <pre className="well mono tiny" style={{ maxHeight: 360, overflow: 'auto', margin: 0, whiteSpace: 'pre' }}>
              {JSON.stringify(preview(view.data, (n) => t('more', { n })), null, 2)}
            </pre>
          </div>
        )}
      </Modal>

      <TaskDrawer taskId={drawer.taskId} onClose={() => drawer.close('task')} mode={readOnly ? 'readOnly' : 'full'} />
      <BlockDrawer blockId={drawer.blockId} onClose={() => drawer.close('block')} />
    </div>
  );
}

/* ── Import adapters ────────────────────────────────────────── */

type ImporterModule = typeof import('../../engine/importer.js');
interface SchemaField {
  name: string;
  type: string;
  unit: string;
  example: string;
  description: string;
  required: boolean;
  values?: string[];
  min?: number;
  max?: number;
}
interface FeedSchema {
  system: string;
  name: string;
  idField: string;
  locationRule: string;
  fields: SchemaField[];
}
interface ImportResult {
  records: Rec[];
  rejects: { row: number; reason: string; code?: string; field?: string }[];
  issues: Issue[];
}

function parseInput(text: string, importer: ImporterModule): { rows: Rec[]; error?: string } {
  const s = text.replace(/^﻿/, '').trim();
  if (!s) return { rows: [] };
  if (s.startsWith('[') || s.startsWith('{')) {
    try {
      const j = JSON.parse(s) as unknown;
      const arr = Array.isArray(j) ? j : j && typeof j === 'object' && Array.isArray((j as { records?: unknown }).records) ? ((j as { records: unknown[] }).records) : null;
      if (!arr) return { rows: [], error: 'JSON must be an array of records or { "records": [...] }' };
      return {
        rows: arr.map((o, i) => {
          const r: Rec = o && typeof o === 'object' && !Array.isArray(o) ? { ...(o as Rec) } : {};
          Object.defineProperty(r, '__line', { value: i + 1, enumerable: false });
          return r;
        }),
      };
    } catch (e) {
      return { rows: [], error: (e as Error).message };
    }
  }
  return { rows: importer.parseCsv(s) as unknown as Rec[] };
}

function ImportPanel({ snapshot, canAct, readOnly, t }: { snapshot: Snapshot; canAct: boolean; readOnly: boolean; t: TFn }) {
  const importedFeeds = useAppStore((s) => s.importedFeeds);
  const importFeed = useAppStore((s) => s.importFeed);
  const clearImportedFeed = useAppStore((s) => s.clearImportedFeed);
  const runPlan = useAppStore((s) => s.runPlan);
  const planStatus = useAppStore((s) => s.planStatus);
  const toast = useAppStore((s) => s.toast);
  const corridor = snapshot.corridor;

  const [importer, setImporter] = useState<ImporterModule | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sys, setSys] = useState<FeedSystem>('tms');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('pasted.csv');
  const [mode, setMode] = useState<'append' | 'replace'>('append');

  // the adapters pull in the feed generator (for templates): load them only when this tab is opened
  useEffect(() => {
    let alive = true;
    import('../../engine/importer.js')
      .then((m) => alive && setImporter(m))
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const SYS = SYS_UP[sys];
  const parsed = useMemo(() => (importer ? parseInput(text, importer) : { rows: [] as Rec[] }), [importer, text]);
  const tooMany = parsed.rows.length > MAX_ROWS;
  const result: ImportResult | null = useMemo(() => {
    if (!importer || parsed.error || !parsed.rows.length || tooMany) return null;
    return importer.normalizeImported(sys, parsed.rows, corridor, { fileName }) as ImportResult;
  }, [importer, parsed, tooMany, sys, corridor, fileName]);

  const schema = importer ? ((importer.FEED_SCHEMAS as Record<FeedSystem, FeedSchema>)[sys]) : null;
  const existing = importedFeeds[sys];

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setFileName(f.name);
    setText(await f.text());
  };

  const downloadTemplate = () => {
    if (!importer) return;
    download(`${SYS}-template-${corridor.code.replace(/[^A-Za-z0-9-]/g, '')}.csv`, importer.templateCsv(sys, corridor, snapshot.seed, 5) as string, 'text/csv');
    toast({ title: t('toastTemplate', { system: SYS }), tone: 'ok' });
  };
  const downloadSchema = () => {
    if (!schema) return;
    download(`${SYS}-schema.json`, JSON.stringify(schema, null, 2), 'application/json');
    toast({ title: t('toastSchema', { system: SYS }), tone: 'ok' });
  };

  const addToPlan = async () => {
    if (!result || !result.records.length || !canAct) return;
    importFeed(sys, { corridorId: corridor.id, fileName, records: result.records, rejected: result.rejects.length, mode });
    toast({ title: t('toastImported', { n: result.records.length, system: SYS }), body: t('toastImportedBody', { file: fileName, mode: mode === 'append' ? t('modeAppend') : t('modeReplace') }), tone: 'ok' });
    setText('');
    await runPlan({ reason: t('replanImport') });
  };

  const remove = async (s: FeedSystem) => {
    clearImportedFeed(s);
    toast({ title: t('toastRemoved', { system: SYS_UP[s] }), body: t('toastRemovedBody'), tone: 'info' });
    await runPlan({ reason: t('replanImportRemoved') });
  };

  const locOf = (r: Rec) => {
    const loc = resolveRecordLocation(SYS, r, corridor) as { ok: boolean; startKm: number | null; endKm: number | null; sectionLabel: string | null };
    return loc.ok && loc.startKm !== null ? `${kmRange(loc.startKm, loc.endKm ?? loc.startKm)}${loc.sectionLabel ? ` · ${loc.sectionLabel}` : ''}` : '—';
  };

  const schemaCols: Column<SchemaField>[] = [
    { key: 'name', header: t('colName'), render: (f) => <span className="mono small strong">{f.name}</span> },
    { key: 'type', header: t('colType'), render: (f) => <span className="small">{f.type}{f.values ? ` (${f.values.length})` : ''}</span> },
    { key: 'unit', header: t('colUnit'), hideMobile: true, render: (f) => <span className="small">{f.unit || '—'}</span> },
    { key: 'req', header: t('colReq'), render: (f) => (f.required ? <Badge tone="warn">{t('required')}</Badge> : <span className="tiny muted">{t('optional')}</span>) },
    { key: 'example', header: t('colExample'), hideMobile: true, render: (f) => <span className="mono tiny">{f.example}</span> },
    { key: 'desc', header: t('colDesc'), render: (f) => <span className="tiny">{f.description}{f.values ? ` — ${f.values.join(', ')}` : ''}{f.min !== undefined ? ` [${f.min}–${f.max}]` : ''}</span> },
  ];
  const recCols: Column<Rec>[] = [
    { key: 'id', header: t('colRecord'), render: (r) => <span className="mono small">{String(r[schema?.idField ?? 'id'] ?? '')}</span> },
    { key: 'wt', header: t('colWorkType'), render: (r) => <span className="small">{(WORK_TYPES as Record<string, { label: string }>)[String(r.workType)]?.label ?? String(r.workType)}</span> },
    { key: 'line', header: t('colLine'), render: (r) => <span className="small">{String(r.line ?? '—')}</span> },
    { key: 'native', header: t('colNative'), render: (r) => <span className="mono tiny">{nativeRef(SYS, r)}</span> },
    { key: 'resolved', header: t('colResolved'), render: (r) => <span className="small num">{locOf(r)}</span> },
  ];
  type RejectRow = ImportResult['rejects'][number];
  const rejCols: Column<RejectRow>[] = [
    { key: 'row', header: t('colRow'), num: true, render: (r) => <span className="num">{r.row}</span> },
    { key: 'code', header: t('colCode'), render: (r) => <span className="mono tiny">{r.code ?? '—'}</span> },
    { key: 'field', header: t('colField'), render: (r) => <span className="mono small">{r.field ?? '—'}</span> },
    { key: 'reason', header: t('colReason'), render: (r) => <span className="small">{r.reason}</span> },
  ];
  const warnCols: Column<Issue>[] = [
    { key: 'code', header: t('colCode'), render: (i) => <span className="mono tiny">{i.code ?? '—'}</span> },
    { key: 'rec', header: t('colRecord'), render: (i) => <span className="mono small">{i.recordId ?? i.id}</span> },
    { key: 'field', header: t('colField'), hideMobile: true, render: (i) => <span className="mono small">{i.field ?? '—'}</span> },
    { key: 'msg', header: t('colIssue'), render: (i) => <span className="small">{i.message ?? i.issue}</span> },
    { key: 'fix', header: t('colFix'), hideMobile: true, render: (i) => <span className="small muted">{i.suggestedFix ?? ''}</span> },
  ];

  const batches = (Object.entries(importedFeeds) as [FeedSystem, ImportedBatch | undefined][]).filter((e): e is [FeedSystem, ImportedBatch] => !!e[1]);
  const inPlan = (s: FeedSystem, b: ImportedBatch) => {
    const recs = (snapshot.feeds[s] as Rec[]).filter((r) => r.source === 'imported' && (r.importFile === undefined || r.importFile === b.fileName));
    const ids = new Set(recs.map(recordIdOf));
    const tasks = snapshot.tasks.filter((x) => x.metrics.source === 'imported' && ids.has(recordIdOf(x.metrics)) && x.source === SYS_UP[s]).length;
    const rej = new Set(((snapshot.issues ?? []) as Issue[]).filter((i) => (i.rejected || i.severity === 'reject') && ids.has(i.recordId ?? i.id)).map((i) => i.recordId ?? i.id)).size;
    return { n: recs.length, tasks, rej };
  };

  return (
    <div className="stack-lg">
      {loadError && <Callout tone="crit">{t('impLoadFailed', { msg: loadError })}</Callout>}

      <Card tour="import-adapters">
        <CardHead
          title={t('impTitle')}
          sub={t('impSub')}
          icon={<FileUp />}
          right={<Segmented<FeedSystem> ariaLabel={t('impSystem')} value={sys} onChange={setSys} options={SYSTEMS.map((s) => ({ value: s, label: SYS_UP[s] }))} />}
        />
        <CardBody>
          {!importer ? (
            <div className="small muted">{loadError ? '' : t('impLoading')}</div>
          ) : (
            <div className="stack-lg">
              {schema && (
                <div className="stack">
                  <div className="row-between">
                    <div>
                      <div className="strong">{t('impSchemaTitle', { system: SYS })}</div>
                      <div className="small muted">{schema.name}</div>
                      <div className="tiny muted">{t('impIdField', { field: schema.idField })} · {t('impLocationRule', { rule: schema.locationRule })}</div>
                    </div>
                    <div className="row-wrap">
                      <button type="button" className="btn btn-sm" onClick={downloadTemplate}>
                        <Download /> {t('impTemplate')}
                      </button>
                      <button type="button" className="btn btn-sm" onClick={downloadSchema}>
                        <FileJson /> {t('impSchemaJson')}
                      </button>
                    </div>
                  </div>
                  <details>
                    <summary className="small strong" style={{ cursor: 'pointer' }}>
                      {schema.fields.length} {t('colName').toLowerCase()} · {schema.fields.filter((f) => f.required).length} {t('required').toLowerCase()}
                    </summary>
                    <div className="mt">
                      <DataTable columns={schemaCols} rows={schema.fields} rowKey={(f) => f.name} compact maxHeight={320} />
                    </div>
                  </details>
                  <div className="tiny muted">{t('impTemplateNote', { seed: snapshot.seed })}</div>
                </div>
              )}

              {readOnly ? null : (
                <div className="stack">
                  <div className="row-wrap">
                    <label className="btn btn-sm" style={{ position: 'relative' }}>
                      <Upload /> {t('impFile')}
                      <input type="file" accept=".csv,.json,text/csv,application/json" onChange={(e) => void onFile(e)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} aria-label={t('impFile')} />
                    </label>
                    {text && (
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setText('')}>
                        <Trash2 /> {t('impClear')}
                      </button>
                    )}
                    {text && <span className="mono tiny muted">{fileName}</span>}
                  </div>
                  <div className="field">
                    <label htmlFor="imp-paste">{t('impPaste')}</label>
                    <textarea
                      id="imp-paste"
                      className="textarea mono"
                      rows={5}
                      value={text}
                      placeholder={t('impPastePh')}
                      onChange={(e) => {
                        if (!text) setFileName(e.target.value.trim().startsWith('[') || e.target.value.trim().startsWith('{') ? 'pasted.json' : 'pasted.csv');
                        setText(e.target.value);
                      }}
                    />
                  </div>

                  {parsed.error && <Callout tone="crit">{t('impParseError', { msg: parsed.error })}</Callout>}
                  {tooMany && <Callout tone="crit">{t('impTooMany', { n: parsed.rows.length, max: MAX_ROWS })}</Callout>}
                  {text.trim() && !parsed.error && !parsed.rows.length && <Callout tone="warn">{t('impNoRows')}</Callout>}

                  {result && (
                    <div className="stack">
                      <div className="row-wrap">
                        <span className="tag-sim">{t('impLabel', { system: SYS })}</span>
                        <span className="small num strong">{t('impRead', { rows: parsed.rows.length, ok: result.records.length, bad: result.rejects.length, warn: result.issues.length })}</span>
                      </div>
                      {result.records.length > 0 && (
                        <div>
                          <div className="section-title">{t('impAccepted')}</div>
                          <DataTable columns={recCols} rows={result.records.slice(0, 100)} rowKey={(r) => String(r[schema?.idField ?? 'id'] ?? Math.random())} compact maxHeight={280} />
                          {result.records.length > 100 && <div className="tiny muted">{t('impAcceptedMore', { n: 100, total: result.records.length })}</div>}
                        </div>
                      )}
                      {result.rejects.length > 0 && (
                        <div>
                          <div className="section-title">{t('impRejects')}</div>
                          <DataTable columns={rejCols} rows={result.rejects} rowKey={(r) => `${r.row}-${r.code ?? ''}`} compact maxHeight={240} />
                        </div>
                      )}
                      {result.issues.length > 0 && (
                        <div>
                          <div className="section-title">{t('impWarnings')}</div>
                          <DataTable columns={warnCols} rows={result.issues} rowKey={(i) => `${i.recordId ?? i.id}-${i.code ?? ''}-${i.field ?? ''}`} compact maxHeight={200} />
                        </div>
                      )}
                      <div className="field">
                        <label>{t('impMode')}</label>
                        <Segmented<'append' | 'replace'>
                          ariaLabel={t('impMode')}
                          value={mode}
                          onChange={setMode}
                          options={[
                            { value: 'append', label: t('modeAppend') },
                            { value: 'replace', label: t('modeReplace') },
                          ]}
                        />
                        <div className="hint">{mode === 'append' ? t('modeAppendHint') : t('modeReplaceHint', { system: SYS })}</div>
                      </div>
                      {existing && <Callout tone="warn">{t('impReplacesBatch', { system: SYS, file: existing.fileName })}</Callout>}
                      <div className="row-wrap">
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={!canAct || !result.records.length || planStatus === 'running'}
                          title={!canAct ? t('impNotPlan') : !result.records.length ? t('impNoRecords') : t('impAddHint')}
                          onClick={() => void addToPlan()}
                        >
                          <Upload /> {t('impAdd')}
                        </button>
                        <span className="tiny muted">{!canAct ? t('impNotPlan') : !result.records.length ? t('impNoRecords') : t('impAddHint')}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHead title={t('impBatches')} />
        <CardBody>
          {batches.length === 0 ? (
            <div className="small muted">{t('impBatchesEmpty')}</div>
          ) : (
            <div className="stack">
              {batches.map(([s, b]) => {
                const here = b.corridorId === corridor.id;
                const ip = here ? inPlan(s, b) : null;
                return (
                  <div key={s} className="well stack" style={{ gap: 4 }}>
                    <div className="row-wrap" style={{ gap: 6 }}>
                      <DeptBadge dept={SYS_UP[s]} />
                      <span className="mono small strong">{b.fileName}</span>
                      <span className="tag-sim">{t('impLabel', { system: SYS_UP[s] })}</span>
                      <span className="grow" />
                      {canAct && (
                        <button type="button" className="btn btn-sm btn-danger" disabled={planStatus === 'running'} onClick={() => void remove(s)}>
                          <Trash2 /> {t('impRemove')}
                        </button>
                      )}
                    </div>
                    <div className="small num">{t('impBatchLine', { n: b.records.length, rej: b.rejected, mode: b.mode === 'append' ? t('modeAppend') : t('modeReplace'), ago: timeAgo(b.at) })}</div>
                    {here && ip ? <div className="small">{t('impInPlan', { n: ip.n, tasks: ip.tasks, rej: ip.rej })}</div> : <div className="small muted">{t('impBatchOther', { id: b.corridorId })}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/* ── Weather ────────────────────────────────────────────────── */

function WeatherPanel({ snapshot, canAct, t }: { snapshot: Snapshot; canAct: boolean; t: TFn }) {
  const weatherOverride = useAppStore((s) => s.weatherOverride);
  const setWeatherOverride = useAppStore((s) => s.setWeatherOverride);
  const runPlan = useAppStore((s) => s.runPlan);
  const planStatus = useAppStore((s) => s.planStatus);
  const toast = useAppStore((s) => s.toast);
  const corridor = snapshot.corridor;
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = (snapshot.feeds.weather ?? []) as WeatherDayV4[];
  const week = days.filter((d) => d.day >= 0 && d.day < 7);
  const shown = all ? days : week;
  const override = weatherOverride && weatherOverride.corridorId === corridor.id ? weatherOverride : null;
  const otherOverride = weatherOverride && weatherOverride.corridorId !== corridor.id ? weatherOverride : null;
  const region = days.find((d) => d.region)?.region;
  const totals = weatherTotals(week) as { days: number; rainMm: number; fogNights: number; hotDays: number; heavyRainDays: number };
  const R = WEATHER_RULES as { fogVisibilityM: number; fogSpeedKmph: number; fogFrom: string; fogTo: string; rainyDayMm: number; heavyRainMm: number; veryHeavyRainMm: number; heatMaxTempC: number; windStopKmph: number; heatDaytime: string[] };
  const FETCH_DAYS = 16;
  const mid = corridor.stations.length ? corridor.stations[Math.floor(corridor.stations.length / 2)] : null;
  const midLatLng = (() => {
    const m = openMeteoUrl(corridor, snapshot.planStart, FETCH_DAYS).match(/latitude=([\d.-]+)&longitude=([\d.-]+)/);
    return m ? { lat: m[1], lng: m[2] } : { lat: mid ? mid.lat.toFixed(4) : '—', lng: mid ? mid.lng.toFixed(4) : '—' };
  })();
  const wtLabel = (w: string) => (WORK_TYPES as Record<string, { label: string }>)[w]?.label ?? w;

  const fetchLive = async () => {
    setError(null);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError(t('wxOffline'));
      toast({ title: t('toastWxFail'), body: t('wxOffline'), tone: 'warn' });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(openMeteoUrl(corridor, snapshot.planStart, FETCH_DAYS));
      const body = (await res.json().catch(() => null)) as { reason?: string } | null;
      if (!res.ok) throw new Error(body?.reason ?? `HTTP ${res.status}`);
      const parsed = parseOpenMeteo(body, snapshot.planStart) as WeatherDay[];
      if (!parsed.length) throw new Error(t('wxNoDays', { date: dateLabel(snapshot.planStart) }));
      setWeatherOverride({ corridorId: corridor.id, source: 'open-meteo', fetchedAt: new Date().toISOString(), days: parsed });
      toast({ title: t('toastWx', { n: parsed.length }), body: t('toastWxBody'), tone: 'ok' });
      await runPlan({ reason: t('replanWx') });
    } catch (e) {
      const msg = typeof navigator !== 'undefined' && navigator.onLine === false ? t('wxOffline') : t('wxError', { msg: (e as Error).message || 'network error' });
      setError(msg);
      toast({ title: t('toastWxFail'), body: msg, tone: 'crit' });
    } finally {
      setBusy(false);
    }
  };

  const useSeeded = async () => {
    setWeatherOverride(null);
    setError(null);
    toast({ title: t('toastWxSeeded'), tone: 'info' });
    await runPlan({ reason: t('replanWxSeeded') });
  };

  const effects = (d: WeatherDayV4) => {
    const fx = weatherEffects(d) as { nightSpeedCapKmph: number | null; nightCapWindow: { from: string; to: string } | null; outdoorPenalty: number; avoidWorkTypes: string[]; daytimeAvoidWorkTypes: string[]; daytimeWindow: { fromMin: number; toMin: number } | null; heatBucklingRisk: boolean; railTempC: number | null };
    const out: { tone: Tone; text: string }[] = [];
    if (fx.nightSpeedCapKmph && fx.nightCapWindow) out.push({ tone: 'warn', text: t('fxFog', { cap: fx.nightSpeedCapKmph, from: fx.nightCapWindow.from, to: fx.nightCapWindow.to }) });
    const rain = Number(d.rainMm) || 0;
    if (rain >= R.rainyDayMm) out.push({ tone: 'info', text: t('fxRain', { pen: pct(fx.outdoorPenalty, 0) }) });
    const heavy = rain >= R.heavyRainMm ? fx.avoidWorkTypes.filter((w) => ['USFD_IMR_RAIL', 'USFD_OBS_RAIL', 'DESTRESSING'].includes(w)) : [];
    if (heavy.length) out.push({ tone: 'crit', text: t('fxHeavy', { types: heavy.map(wtLabel).join(', ') }) });
    const vheavy = rain >= R.veryHeavyRainMm ? fx.avoidWorkTypes.filter((w) => !heavy.includes(w) && ['DEEP_SCREENING', 'TAMPING', 'CTR', 'BRIDGE_GIRDER'].includes(w)) : [];
    if (vheavy.length) out.push({ tone: 'crit', text: t('fxVeryHeavy', { types: vheavy.map(wtLabel).join(', ') }) });
    const windTypes = (Number(d.windKmph) || 0) >= R.windStopKmph ? fx.avoidWorkTypes.filter((w) => !heavy.includes(w) && !vheavy.includes(w)) : [];
    if (windTypes.length) out.push({ tone: 'warn', text: t('fxWind', { types: windTypes.map(wtLabel).join(', ') }) });
    if (fx.heatBucklingRisk && fx.railTempC !== null) out.push({ tone: 'warn', text: t('fxHeat', { rail: fx.railTempC, from: R.heatDaytime[0], to: R.heatDaytime[1] }) });
    return out;
  };

  const cols: Column<WeatherDayV4>[] = [
    { key: 'date', header: t('colDate'), render: (d) => <span className="small num" style={{ whiteSpace: 'nowrap' }}>{dateLabel(d.date)}</span> },
    { key: 'src', header: t('colSource'), render: (d) => <Badge tone={d.source === 'open-meteo' ? 'blue' : 'gray'}>{d.source === 'open-meteo' ? t('srcLive') : t('srcSeeded')}</Badge> },
    { key: 'fog', header: t('colFog'), render: (d) => (d.visibilityM === null ? <span className="muted">—</span> : d.fogNight ? <Badge tone="warn" icon={<CloudFog size={11} />}>{t('fog', { v: num(d.visibilityM) })}</Badge> : <span className="small num">{t('clear', { v: num(d.visibilityM) })}</span>) },
    { key: 'rain', header: t('colRain'), num: true, render: (d) => <span className="num small">{num(d.rainMm, 1)} mm</span> },
    { key: 'temp', header: t('colTemp'), num: true, hideMobile: true, render: (d) => <span className="num small">{d.maxTempC === null || d.maxTempC === undefined ? '—' : `${num(d.maxTempC, 1)} °C`}</span> },
    { key: 'wind', header: t('colWind'), num: true, hideMobile: true, render: (d) => <span className="num small">{d.windKmph === null ? '—' : `${num(d.windKmph)} km/h`}</span> },
    {
      key: 'fx',
      header: t('colEffects'),
      render: (d) => {
        const list = effects(d);
        return list.length ? (
          <span className="stack" style={{ gap: 2 }}>
            {list.map((e) => (
              <Badge key={e.text} tone={e.tone}>
                {e.text}
              </Badge>
            ))}
          </span>
        ) : (
          <span className="tiny muted">{t('noEffect')}</span>
        );
      },
    },
  ];

  return (
    <div className="stack-lg">
      <div className="stat-grid">
        <StatTile label={t('wxStatFog')} value={totals.fogNights} pastel={totals.fogNights ? 'yellow' : undefined} />
        <StatTile label={t('wxStatRain')} value={num(totals.rainMm)} unit="mm" />
        <StatTile label={t('wxStatHeavy')} value={totals.heavyRainDays} />
        <StatTile label={t('wxStatHot', { t: R.heatMaxTempC })} value={totals.hotDays} />
      </div>
      <Card tour="weather-card">
        <CardHead
          title={t('wxTitle')}
          sub={t('wxSub')}
          icon={<CloudSun />}
          right={
            <Segmented<'week' | 'all'>
              ariaLabel={t('wxTitle')}
              value={all ? 'all' : 'week'}
              onChange={(v) => setAll(v === 'all')}
              options={[
                { value: 'week', label: t('wxWeek') },
                { value: 'all', label: t('wxAll', { n: days.length }) },
              ]}
            />
          }
        />
        <CardBody>
          <div className="stack">
            <div className="row-wrap">
              {override ? <span className="tag-sim">{t('wxLive', { time: new Date(override.fetchedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) })}</span> : null}
              {(!override || days.some((d) => d.source === 'seeded')) && (
                <span className="tag-sim" title={region ? `Region ${region}` : undefined}>
                  {region ? t('wxSeededRegion', { region, seed: snapshot.seed }) : t('wxSeeded', { seed: snapshot.seed })}
                </span>
              )}
            </div>
            {otherOverride && <div className="small muted">{t('wxLiveOther', { id: otherOverride.corridorId })}</div>}
            {canAct && (
              <div className="row-wrap">
                <button type="button" className="btn btn-sm btn-primary" disabled={busy || planStatus === 'running'} onClick={() => void fetchLive()}>
                  <CloudSun className={busy ? 'spin' : ''} /> {busy ? t('wxFetching') : t('wxFetch')}
                </button>
                {override && (
                  <button type="button" className="btn btn-sm" disabled={busy || planStatus === 'running'} onClick={() => void useSeeded()}>
                    {t('wxUseSeeded')}
                  </button>
                )}
                <span className="tiny muted">{t('wxFetchHint', { n: FETCH_DAYS, lat: midLatLng.lat, lng: midLatLng.lng })}</span>
              </div>
            )}
            {error && <Callout tone="crit">{error}</Callout>}
          </div>
        </CardBody>
        <CardBody flush>
          <DataTable columns={cols} rows={shown} rowKey={(d) => `${d.day}-${d.date}`} compact empty={<EmptyState title={t('noEffect')} />} />
        </CardBody>
        <CardFoot>
          <span className="tiny muted">
            {t('wxRules', { vis: R.fogVisibilityM, cap: R.fogSpeedKmph, from: R.fogFrom, to: R.fogTo, heavy: R.heavyRainMm, vheavy: R.veryHeavyRainMm, wind: R.windStopKmph, heat: R.heatMaxTempC })}
          </span>
        </CardFoot>
      </Card>
    </div>
  );
}

/* ── Anomalies ──────────────────────────────────────────────── */

const SEV_TONE: Record<Anomaly['severity'], Tone> = { high: 'crit', medium: 'warn', low: 'gray' };
const KIND_ORDER: Anomaly['kind'][] = ['FAILURE_SPIKE', 'OVERRUN', 'DATA'];

function AnomalyPanel({ snapshot, anomalies, readOnly, t, openTask }: { snapshot: Snapshot; anomalies: AnomalyV4[]; readOnly: boolean; t: TFn; openTask: (id: string) => void }) {
  const user = useAppStore((s) => s.user);
  const canOpenDept = (d: Dept) => !!user && (user.portal === d.toLowerCase() || user.role === 'DRM' || user.role === 'ADMIN');
  const topTask = (pred: (x: Task) => boolean) => snapshot.tasks.filter(pred).sort((a, b) => b.risk.arci - a.risk.arci)[0] ?? null;
  const wtLabel = (w: string) => (WORK_TYPES as Record<string, { label: string }>)[w]?.label ?? w;

  if (!anomalies.length)
    return (
      <Card>
        <CardBody>
          <EmptyState title={t('anNone')} icon={<CheckCircle2 />} />
        </CardBody>
      </Card>
    );

  return (
    <div className="stack-lg">
      <div className="stat-grid">
        {KIND_ORDER.map((k) => (
          <StatTile key={k} label={t(`kind${k}` as Key)} value={anomalies.filter((a) => a.kind === k).length} sub={`${anomalies.filter((a) => a.kind === k && a.severity === 'high').length} ${t('sevhigh').toLowerCase()}`} />
        ))}
      </div>
      <div className="row-wrap small muted">
        <SimLabel kind="model" />
        <span>{t('anModel')}</span>
        <span>· {t('anSub')}</span>
      </div>
      {KIND_ORDER.map((k) => {
        const list = anomalies.filter((a) => a.kind === k);
        if (!list.length) return null;
        return (
          <Card key={k} tour={`anomalies-${k.toLowerCase()}`}>
            <CardHead title={t(`kind${k}` as Key)} sub={`${list.length}`} right={<SimLabel kind="model" short />} />
            <CardBody>
              <div className="stack">
                {list.map((a) => {
                  const task = a.taskId ? snapshot.tasks.find((x) => x.id === a.taskId) ?? null : a.workType ? topTask((x) => x.workType === a.workType) : a.assetClass ? topTask((x) => x.assetClass === a.assetClass) : null;
                  const sysDept = asDept(a.system);
                  return (
                    <div key={a.id} className="well stack" style={{ gap: 4 }}>
                      <div className="row-wrap" style={{ gap: 6 }}>
                        <Badge tone={SEV_TONE[a.severity]}>{t(`sev${a.severity}` as Key)}</Badge>
                        <span className="small strong grow">{a.title}</span>
                        {a.ref && <span className="mono tiny muted">{a.ref}</span>}
                      </div>
                      <div className="small">{a.detail}</div>
                      <div className="row-wrap tiny num" style={{ gap: 8 }}>
                        {a.value !== undefined && <span>{t('anValue', { v: a.value })}</span>}
                        {a.expected !== undefined && <span className="muted">{t('anExpected', { v: a.expected })}</span>}
                        {a.z !== undefined && <span>{t('anZ', { v: a.z })}</span>}
                        {a.p !== undefined && <span>{t('anP', { v: a.p })}</span>}
                      </div>
                      <div className="row-wrap">
                        {task && (
                          <button type="button" className="btn btn-sm" onClick={() => openTask(task.id)}>
                            {a.taskId ? t('anOpenTask', { id: task.id }) : t('anOpenType', { type: a.workType ? wtLabel(a.workType) : task.label })}
                          </button>
                        )}
                        {a.kind === 'DATA' && sysDept && a.ref && canOpenDept(sysDept) && (
                          <a className="btn btn-sm btn-ghost" href={`/app/${sysDept.toLowerCase()}/register?asset=${encodeURIComponent(a.ref)}`}>
                            {t('anRegister')} · {sysDept}
                          </a>
                        )}
                        {a.kind === 'OVERRUN' && !readOnly && (
                          <a className="btn btn-sm btn-ghost" href="/app/planning/adherence">
                            {t('anAdherence')}
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
