/**
 * FieldReportPage — incident capture from the line or the cab, and my reports.
 *
 *  New: photo (compressed, IndexedDB) → location (GPS snapped to km, nearest
 *  station, or my block / my train's timetable position) → line → defect →
 *  severity → note → submit. Routing is rule-based on the category
 *  (deptForCategory); nothing is inferred from the photo.
 *  Mine: reports I sent (by my name) with status, and the blocks I recorded.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, Crosshair, Lightbulb, MapPin, Send, Train as TrainIcon } from 'lucide-react';
import { deptForCategory, useAppStore, type HazardReport, type ReportCategory, type ReportStatus } from '../../store/useAppStore';
import { getCorridor } from '../../engine/corridors.js';
import { livePositions, severityFactsAt, workingBlocks } from '../../engine/select';
import { computeSeverity, SEVERITY_THRESHOLDS, suggestCategory } from '../../lib/triage';
import type { Corridor, Dept, Line } from '../../engine/types';
import { useT } from '../../i18n';
import { DEPT_LABEL, hhmm, nowMinuteIST, timeAgo } from '../../lib/format';
import { Badge, Callout, Card, CardBody, CardHead, DeptBadge, EmptyState, PageHeader, Segmented, Tabs, type Tone } from '../../components/ui';
import { LocationPicker, PhotoCapture, SimLabel, type LocationValue } from '../../components/ui/extras';
import { ReportDrawer } from '../../components/domain/ReportDrawer';
import { useDrawerParams } from '../../components/domain/useDrawerParams';

export interface FieldReportPageProps {
  tab?: 'new' | 'mine';
}

type Severity = 'low' | 'medium' | 'high';
type SeverityChoice = Severity | 'auto';

const strings = {
  en: {
    title: 'Report an incident',
    titleMine: 'My reports',
    lede: 'Photo, location and a few words. The report goes to Control and the department for its category.',
    tabNew: 'New report',
    tabMine: 'My reports',
    photo: 'Photo',
    takePhoto: 'Take or choose a photo',
    location: 'Location',
    useGps: 'Use my location',
    locating: 'Finding your location…',
    found: 'Snapped to',
    denied: 'Location not available — pick the nearest station or enter km.',
    station: 'Nearest station',
    km: 'Chainage (km)',
    useBlock: 'Use my block ({section})',
    useTrain: 'Use my train’s position ({no})',
    trainNotRunning: 'Train {no} is not running on this corridor now by the timetable.',
    line: 'Line',
    lineUnknown: 'Not known',
    both: 'Both',
    defect: 'Defect',
    severity: 'Severity',
    sevLow: 'Low',
    sevMedium: 'Medium',
    sevHigh: 'High',
    note: 'Note',
    notePlaceholder: 'What you saw, exact spot, whether a train is due',
    trainNo: 'Train number (loco pilot)',
    routesTo: 'Routes to',
    routesControl: 'Control for triage',
    routingNote: 'Routing is rule-based on category and nearest asset.',
    submit: 'Send report',
    required: 'Add a photo or a note.',
    toastSubmitted: 'Report {ref} routed to {dept}',
    stored: 'Stored in this browser only.',
    mineEmpty: 'No reports from this device.',
    mineLede: 'Reports sent under your name from this device.',
    myBlocks: 'My blocks',
    myBlocksEmpty: 'No block recorded by you on this device yet.',
    planned: 'planned {a}–{b}',
    actual: 'actual {a}–{b}',
    inProgress: 'In progress',
    clearedFull: 'Cleared at full speed',
    clearedTsr: 'Cleared with {v} km/h',
    stUNVERIFIED: 'Awaiting verification',
    stTRIAGED: 'Being verified',
    stTASK: 'Converted to work',
    stRESOLVED: 'Resolved',
    stREJECTED: 'Not confirmed',
    cat_railFracture: 'Rail fracture',
    cat_buckling: 'Track buckling',
    cat_lurch: 'Lurch / bad riding',
    cat_ballastWash: 'Ballast wash',
    cat_oheSag: 'OHE sagging',
    cat_dropper: 'Broken dropper',
    cat_birdFlash: 'Bird flashover',
    cat_lampOut: 'Signal lamp out',
    cat_pointFail: 'Point not setting',
    cat_lcGate: 'LC gate',
    cat_obstruction: 'Obstruction',
    cat_fire: 'Fire',
    cat_other: 'Other',
    sevAuto: 'Rule table',
    sevAutoHint: 'Leave on “Rule table” unless you are sure: severity is then computed from the category, the next train at this spot, the line and any TSR in force.',
    sevPreview: 'Rule table now gives: {level} ({points} points)',
    sevThresholds: 'High at {high} points or more, medium at {medium}–{mediumTop}, low below.',
    sevNeedsPlan: 'Next-train facts appear once the plan has run and a km is given.',
    suggestTitle: 'From your note this looks like {cat}',
    suggestWords: 'words: {words}',
    suggestPick: 'Pick the defect:',
    catName_track: 'a track defect',
    catName_signal: 'a signal / points fault',
    catName_ohe: 'an OHE fault',
    catName_lc: 'a level-crossing gate problem',
    catName_fire: 'a fire',
    catName_obstruction: 'an obstruction',
    catName_other: 'something else',
    sentTitle: 'Report {ref} sent',
    sentRouted: 'Routed to {dept}.',
    sentSeverity: 'Severity {level}, computed by the rule table',
    sentChosen: 'Severity {level}, as you chose',
    sentOpen: 'Open report',
    sentNote: 'Rule-based points table, not a model. Control verifies every report.',
    lvl_high: 'high',
    lvl_medium: 'medium',
    lvl_low: 'low',
    f_category: 'Category: {cat} (+{p})',
    f_nextTrain: 'Next train due here in {min} min (+{p})',
    f_nextTrainUnknown: 'Next train at this spot not known (+0)',
    f_premium: 'Next train is a premium service (+1)',
    f_mainLine: 'On a running line (+1)',
    f_offLine: 'Running line not identified (+0)',
    f_tsr: 'Speed restriction already in force here (−1)',
    f_nextNo: 'Next train: {no} (timetable)',
    sevComputedBadge: 'computed',
  },
  hi: {
    title: 'घटना की रिपोर्ट',
    titleMine: 'मेरी रिपोर्ट',
    lede: 'फ़ोटो, स्थान और कुछ शब्द। रिपोर्ट कंट्रोल और श्रेणी के विभाग तक जाती है।',
    tabNew: 'नई रिपोर्ट',
    tabMine: 'मेरी रिपोर्ट',
    photo: 'फ़ोटो',
    takePhoto: 'फ़ोटो लें या चुनें',
    location: 'स्थान',
    useGps: 'मेरा स्थान उपयोग करें',
    locating: 'आपका स्थान खोजा जा रहा है…',
    found: 'स्नैप किया गया',
    denied: 'स्थान उपलब्ध नहीं — निकटतम स्टेशन चुनें या किमी दर्ज करें।',
    station: 'निकटतम स्टेशन',
    km: 'चेनेज (किमी)',
    useBlock: 'मेरे ब्लॉक का स्थान ({section})',
    useTrain: 'मेरी ट्रेन की स्थिति ({no})',
    trainNotRunning: 'समय-सारणी के अनुसार ट्रेन {no} अभी इस कॉरिडोर पर नहीं चल रही।',
    line: 'लाइन',
    lineUnknown: 'पता नहीं',
    both: 'दोनों',
    defect: 'दोष',
    severity: 'गंभीरता',
    sevLow: 'कम',
    sevMedium: 'मध्यम',
    sevHigh: 'अधिक',
    note: 'टिप्पणी',
    notePlaceholder: 'क्या देखा, सही जगह, कोई ट्रेन आने वाली है या नहीं',
    trainNo: 'ट्रेन संख्या (लोको पायलट)',
    routesTo: 'भेजी जाएगी',
    routesControl: 'कंट्रोल (ट्राइएज)',
    routingNote: 'रूटिंग श्रेणी और निकटतम एसेट के नियम पर आधारित है।',
    submit: 'रिपोर्ट भेजें',
    required: 'फ़ोटो या टिप्पणी जोड़ें।',
    toastSubmitted: 'रिपोर्ट {ref} {dept} को भेजी गई',
    stored: 'केवल इस ब्राउज़र में संग्रहीत।',
    mineEmpty: 'इस डिवाइस से कोई रिपोर्ट नहीं।',
    mineLede: 'इस डिवाइस से आपके नाम से भेजी गई रिपोर्ट।',
    myBlocks: 'मेरे ब्लॉक',
    myBlocksEmpty: 'इस डिवाइस पर आपके द्वारा अभी कोई ब्लॉक दर्ज नहीं।',
    planned: 'नियोजित {a}–{b}',
    actual: 'वास्तविक {a}–{b}',
    inProgress: 'कार्य जारी',
    clearedFull: 'पूर्ण गति पर क्लियर',
    clearedTsr: '{v} km/h के साथ क्लियर',
    stUNVERIFIED: 'जाँच लंबित',
    stTRIAGED: 'जाँच जारी',
    stTASK: 'कार्य में बदली गई',
    stRESOLVED: 'निपटाई गई',
    stREJECTED: 'पुष्टि नहीं हुई',
    cat_railFracture: 'रेल फ्रैक्चर',
    cat_buckling: 'ट्रैक बकलिंग',
    cat_lurch: 'लर्च / खराब राइडिंग',
    cat_ballastWash: 'बैलास्ट बह जाना',
    cat_oheSag: 'OHE लटका हुआ',
    cat_dropper: 'टूटा ड्रॉपर',
    cat_birdFlash: 'बर्ड फ्लैशओवर',
    cat_lampOut: 'सिग्नल लैंप बुझा',
    cat_pointFail: 'पॉइंट सेट नहीं हो रहा',
    cat_lcGate: 'LC गेट',
    cat_obstruction: 'अवरोध',
    cat_fire: 'आग',
    cat_other: 'अन्य',
    sevAuto: 'नियम तालिका',
    sevAutoHint: 'पक्का न हो तो “नियम तालिका” रहने दें: तब गंभीरता श्रेणी, इस स्थान पर अगली ट्रेन, लाइन और लागू TSR से गणित होती है।',
    sevPreview: 'नियम तालिका अभी: {level} ({points} अंक)',
    sevThresholds: '{high} या अधिक अंक पर अधिक, {medium}–{mediumTop} पर मध्यम, उससे कम पर कम।',
    sevNeedsPlan: 'योजना चलने और किमी दर्ज होने पर अगली ट्रेन के तथ्य दिखेंगे।',
    suggestTitle: 'आपकी टिप्पणी से यह {cat} लगता है',
    suggestWords: 'शब्द: {words}',
    suggestPick: 'दोष चुनें:',
    catName_track: 'ट्रैक दोष',
    catName_signal: 'सिग्नल / पॉइंट दोष',
    catName_ohe: 'OHE दोष',
    catName_lc: 'समपार फाटक की समस्या',
    catName_fire: 'आग',
    catName_obstruction: 'अवरोध',
    catName_other: 'कुछ और',
    sentTitle: 'रिपोर्ट {ref} भेजी गई',
    sentRouted: '{dept} को भेजी गई।',
    sentSeverity: 'गंभीरता {level}, नियम तालिका से गणित',
    sentChosen: 'गंभीरता {level}, आपके चयन अनुसार',
    sentOpen: 'रिपोर्ट खोलें',
    sentNote: 'नियम-आधारित अंक तालिका, कोई मॉडल नहीं। हर रिपोर्ट कंट्रोल जाँचता है।',
    lvl_high: 'अधिक',
    lvl_medium: 'मध्यम',
    lvl_low: 'कम',
    f_category: 'श्रेणी: {cat} (+{p})',
    f_nextTrain: 'अगली ट्रेन यहाँ {min} मिनट में (+{p})',
    f_nextTrainUnknown: 'इस स्थान पर अगली ट्रेन ज्ञात नहीं (+0)',
    f_premium: 'अगली ट्रेन प्रीमियम सेवा है (+1)',
    f_mainLine: 'रनिंग लाइन पर (+1)',
    f_offLine: 'रनिंग लाइन पहचानी नहीं गई (+0)',
    f_tsr: 'यहाँ पहले से गति प्रतिबंध लागू (−1)',
    f_nextNo: 'अगली ट्रेन: {no} (समय-सारणी)',
    sevComputedBadge: 'गणित',
  },
} as const;

type Key = keyof typeof strings.en;

/** Field defect list → the store's report category (which drives routing). */
const DEFECTS: { id: string; key: Key; cat: ReportCategory }[] = [
  { id: 'railFracture', key: 'cat_railFracture', cat: 'track' },
  { id: 'buckling', key: 'cat_buckling', cat: 'track' },
  { id: 'lurch', key: 'cat_lurch', cat: 'track' },
  { id: 'ballastWash', key: 'cat_ballastWash', cat: 'track' },
  { id: 'oheSag', key: 'cat_oheSag', cat: 'ohe' },
  { id: 'dropper', key: 'cat_dropper', cat: 'ohe' },
  { id: 'birdFlash', key: 'cat_birdFlash', cat: 'ohe' },
  { id: 'lampOut', key: 'cat_lampOut', cat: 'signal' },
  { id: 'pointFail', key: 'cat_pointFail', cat: 'signal' },
  { id: 'lcGate', key: 'cat_lcGate', cat: 'lc' },
  { id: 'obstruction', key: 'cat_obstruction', cat: 'obstruction' },
  { id: 'fire', key: 'cat_fire', cat: 'fire' },
  { id: 'other', key: 'cat_other', cat: 'other' },
];

const STATUS_TONE: Record<ReportStatus, Tone> = { UNVERIFIED: 'warn', TRIAGED: 'info', TASK: 'blue', RESOLVED: 'ok', REJECTED: 'gray' };
const SEV_TONE: Record<Severity, Tone> = { high: 'crit', medium: 'warn', low: 'gray' };

type Factor = { key: 'category' | 'nextTrain' | 'nextTrainUnknown' | 'premium' | 'mainLine' | 'offLine' | 'tsr' | 'nextNo'; params: Record<string, string | number> };

/** The store keeps the severity reasons as English sentences (lib/triage); read them back as factors to translate. */
function parseReasons(reasons: string[] | undefined): Factor[] {
  const out: Factor[] = [];
  for (const r of reasons ?? []) {
    let m: RegExpMatchArray | null;
    if ((m = r.match(/^Category "(\w+)" \(\+(\d+)\)/))) out.push({ key: 'category', params: { cat: m[1], p: Number(m[2]) } });
    else if ((m = r.match(/^Next train due in (\d+) min \(\+(\d+)\)/))) out.push({ key: 'nextTrain', params: { min: Number(m[1]), p: Number(m[2]) } });
    else if (/^Next train at this location not known/.test(r)) out.push({ key: 'nextTrainUnknown', params: {} });
    else if (/^Next train is a premium/.test(r)) out.push({ key: 'premium', params: {} });
    else if (/^On a running line/.test(r)) out.push({ key: 'mainLine', params: {} });
    else if (/^Running line not identified/.test(r)) out.push({ key: 'offLine', params: {} });
    else if (/^Speed restriction already in force/.test(r)) out.push({ key: 'tsr', params: {} });
    else if ((m = r.match(/^Next train: (\S+)/))) out.push({ key: 'nextNo', params: { no: m[1] } });
  }
  return out;
}
const deptText = (d: Dept) => `${DEPT_LABEL[d].short} (${DEPT_LABEL[d].system})`;

export default function FieldReportPage({ tab = 'new' }: FieldReportPageProps) {
  const t = useT(strings);
  const nav = useNavigate();
  const drawer = useDrawerParams();
  const { ref } = useParams<{ ref?: string }>();

  const snapshot = useAppStore((s) => s.snapshot);
  const corridorId = useAppStore((s) => s.corridorId);
  const user = useAppStore((s) => s.user);
  const approvals = useAppStore((s) => s.approvals);
  const reports = useAppStore((s) => s.reports);
  const executionLog = useAppStore((s) => s.executionLog);
  const lastTrainNo = useAppStore((s) => s.lastTrainNo);
  const language = useAppStore((s) => s.language);
  const submitReport = useAppStore((s) => s.submitReport);
  const toast = useAppStore((s) => s.toast);

  const isLp = user?.role === 'LOCO_PILOT';

  // The static corridor is enough to capture a report while the planning engine runs.
  const corridor = useMemo<Corridor>(() => snapshot?.corridor ?? (getCorridor(corridorId) as Corridor), [snapshot, corridorId]);
  const blocks = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals]);
  const myBlock = useMemo(() => (drawer.blockId ? blocks.find((b) => b.id === drawer.blockId) ?? null : null), [blocks, drawer.blockId]);

  const [photo, setPhoto] = useState<{ photoId: string; thumb: string } | null>(null);
  const [loc, setLoc] = useState<LocationValue>({});
  const [line, setLine] = useState<Line | ''>('');
  const [defect, setDefect] = useState<string>('other');
  const [severity, setSeverity] = useState<SeverityChoice>('auto');
  const [note, setNote] = useState('');
  const [trainNo, setTrainNo] = useState(isLp ? lastTrainNo ?? '' : '');
  const [error, setError] = useState<string | null>(null);

  const chosen = DEFECTS.find((d) => d.id === defect) ?? DEFECTS[DEFECTS.length - 1];
  const routedDept = deptForCategory(chosen.cat);
  const tsrs = useAppStore((s) => s.tsrs);
  const [params] = useSearchParams();
  const sentId = params.get('sent');

  /* keyword suggestion from the note (rule-based, EN / HI words) — the user picks the defect */
  const suggestion = useMemo(() => suggestCategory(note), [note]);
  const suggestOthers = suggestion && suggestion.category !== chosen.cat ? DEFECTS.filter((d) => d.cat === suggestion.category) : [];

  /* live preview of the rule table at the chosen location (same inputs the store uses on submit) */
  const preview = useMemo(() => {
    const snap = snapshot && snapshot.corridor.id === corridor.id ? snapshot : null;
    const facts = severityFactsAt(snap, tsrs, { km: loc.km, line: line || undefined, day: 0, minute: nowMinuteIST() });
    return { facts, sev: computeSeverity({ category: chosen.cat, ...facts }) };
  }, [snapshot, corridor.id, tsrs, loc.km, line, chosen.cat]);

  /* my train's timetable position now (WTT-derived, plan day 0) */
  const trainPos = useMemo(() => {
    const no = trainNo.trim();
    if (!snapshot || !no) return null;
    return livePositions(snapshot, 0, nowMinuteIST(), blocks).find((p) => p.trainNo === no) ?? null;
  }, [snapshot, blocks, trainNo]);

  const mine = useMemo(
    () => reports.filter((r) => (r.source === 'field' || r.source === 'locoPilot') && !!user && r.reporter.name === user.name),
    [reports, user]
  );
  const myExec = useMemo(() => (user ? executionLog.filter((r) => r.by === user.name) : []), [executionLog, user]);

  const fillFromBlock = () => {
    if (!myBlock) return;
    const km = Math.round(((myBlock.startKm + myBlock.endKm) / 2) * 10) / 10;
    const st = corridor.stations.reduce((a, b) => (Math.abs(b.km - km) < Math.abs(a.km - km) ? b : a), corridor.stations[0]);
    setLoc({ km, station: st.code, lat: undefined, lng: undefined });
    if (myBlock.line) setLine(myBlock.line);
  };

  const fillFromTrain = () => {
    if (!trainPos) {
      toast({ title: t('trainNotRunning', { no: trainNo.trim() }), tone: 'warn' });
      return;
    }
    const km = Math.round(trainPos.km * 10) / 10;
    const st = corridor.stations.reduce((a, b) => (Math.abs(b.km - km) < Math.abs(a.km - km) ? b : a), corridor.stations[0]);
    setLoc({ km, station: st.code, lat: trainPos.lat, lng: trainPos.lng });
    setLine(trainPos.line);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = note.trim();
    if (!photo && !text) {
      setError(t('required'));
      return;
    }
    setError(null);
    const label = strings.en[chosen.key];
    const rep = submitReport({
      source: isLp ? 'locoPilot' : 'field',
      reporter: { name: user?.name ?? 'Field staff', role: user?.designation ?? user?.role ?? 'Field', portal: 'field' },
      lang: language,
      description: text ? `${label}: ${text}` : label,
      category: chosen.cat,
      // 'auto': the store computes severity from the timetable / TSR facts at the location
      severity: severity === 'auto' ? undefined : severity,
      photoId: photo?.photoId,
      thumbDataUrl: photo?.thumb,
      lat: loc.lat,
      lng: loc.lng,
      accuracyM: loc.accuracyM,
      km: loc.km,
      line: line || undefined,
      nearestStation: loc.station,
      corridorId: corridor.id,
      trainNumber: trainNo.trim() || undefined,
    });
    const sevText = rep.severity ? (rep.severityAuto ? t('sentSeverity', { level: t(`lvl_${rep.severity}` as Key) }) : t('sentChosen', { level: t(`lvl_${rep.severity}` as Key) })) : undefined;
    toast({ title: t('toastSubmitted', { ref: rep.id, dept: rep.dept ? deptText(rep.dept) : t('routesControl') }), body: sevText, tone: 'ok' });
    setPhoto(null);
    setLoc({});
    setNote('');
    setSeverity('auto');
    nav(`/app/field/reports?sent=${encodeURIComponent(rep.id)}`);
  };

  const factorText = (f: Factor) => {
    switch (f.key) {
      case 'category':
        return t('f_category', { cat: t(`catName_${String(f.params.cat)}` as Key), p: f.params.p });
      case 'nextTrain':
        return t('f_nextTrain', { min: f.params.min, p: f.params.p });
      case 'nextNo':
        return t('f_nextNo', { no: f.params.no });
      default:
        return t(`f_${f.key}` as Key);
    }
  };
  const sent = sentId ? reports.find((r) => r.id === sentId) ?? null : null;

  const reportId = ref ?? drawer.reportId;
  const closeReport = () => (ref ? nav('/app/field/reports') : drawer.close('report'));

  return (
    <div className="stack-lg">
      <PageHeader title={tab === 'new' ? t('title') : t('titleMine')} lede={`${tab === 'new' ? t('lede') : t('mineLede')} · ${corridor.name}`} />

      <Tabs<'new' | 'mine'>
        value={tab}
        onChange={(v) => nav(v === 'new' ? '/app/field/report' : '/app/field/reports')}
        tabs={[
          { id: 'new', label: t('tabNew') },
          { id: 'mine', label: t('tabMine'), count: mine.length },
        ]}
      />

      {tab === 'new' ? (
        <form onSubmit={onSubmit} className="stack-lg" data-tour="report-form" noValidate>
          <Card>
            <CardHead title={t('photo')} />
            <CardBody>
              <PhotoCapture value={photo} onChange={setPhoto} label={t('takePhoto')} />
            </CardBody>
          </Card>

          <Card>
            <CardHead title={t('location')} icon={<MapPin />} />
            <CardBody>
              <div className="stack-lg">
                <LocationPicker corridor={corridor} value={loc} onChange={setLoc} labels={{ use: t('useGps'), locating: t('locating'), found: t('found'), denied: t('denied'), station: t('station'), km: t('km') }} />
                {(myBlock || trainNo.trim()) && (
                  <div className="row-wrap">
                    {myBlock && (
                      <button type="button" className="btn" style={{ minHeight: 44 }} onClick={fillFromBlock}>
                        <Crosshair /> {t('useBlock', { section: myBlock.sectionText })}
                      </button>
                    )}
                    {trainNo.trim() && snapshot && (
                      <button type="button" className="btn" style={{ minHeight: 44 }} onClick={fillFromTrain}>
                        <TrainIcon /> {t('useTrain', { no: trainNo.trim() })}
                      </button>
                    )}
                    {trainNo.trim() && snapshot && <SimLabel kind="wttPositions" short />}
                  </div>
                )}
                <div className="field">
                  <label>{t('line')}</label>
                  <Segmented<Line | ''>
                    ariaLabel={t('line')}
                    value={line}
                    onChange={setLine}
                    options={[
                      { value: 'UP', label: 'UP' },
                      { value: 'DN', label: 'DN' },
                      { value: 'BOTH', label: t('both') },
                      { value: '', label: t('lineUnknown') },
                    ]}
                  />
                </div>
                <div className="field">
                  <label htmlFor="fr-train">{t('trainNo')}</label>
                  <input id="fr-train" className="input input-lg mono" autoComplete="off" value={trainNo} onChange={(e) => setTrainNo(e.target.value)} />
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHead title={t('defect')} right={routedDept ? <DeptBadge dept={routedDept} /> : <Badge tone="gray">{t('routesControl')}</Badge>} />
            <CardBody>
              <div className="stack-lg">
                {suggestion && suggestOthers.length > 0 && (
                  <Callout tone="info" icon={<Lightbulb />}>
                    <div className="stack" style={{ gap: 6 }}>
                      <span>
                        <b>{t('suggestTitle', { cat: t(`catName_${suggestion.category}` as Key) })}</b> <span className="muted small">({t('suggestWords', { words: suggestion.matched.join(', ') })})</span>
                      </span>
                      <div className="row-wrap">
                        <span className="small">{t('suggestPick')}</span>
                        {suggestOthers.map((d) => (
                          <button key={d.id} type="button" className="btn btn-sm" style={{ minHeight: 40 }} onClick={() => setDefect(d.id)}>
                            {t(d.key)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </Callout>
                )}
                <div className="row-wrap" role="group" aria-label={t('defect')}>
                  {DEFECTS.map((d) => {
                    const on = d.id === defect;
                    return (
                      <button key={d.id} type="button" className={`btn ${on ? 'btn-dark' : ''}`} style={{ minHeight: 44 }} aria-pressed={on} onClick={() => setDefect(d.id)}>
                        {t(d.key)}
                      </button>
                    );
                  })}
                </div>
                <div className="small">
                  <span className="strong">{t('routesTo')}: {routedDept ? deptText(routedDept) : t('routesControl')}</span>
                  <span className="muted"> · {t('routingNote')}</span>
                </div>
                <div className="field">
                  <label>{t('severity')}</label>
                  <Segmented<SeverityChoice>
                    ariaLabel={t('severity')}
                    value={severity}
                    onChange={setSeverity}
                    options={[
                      { value: 'auto', label: t('sevAuto') },
                      { value: 'low', label: t('sevLow') },
                      { value: 'medium', label: t('sevMedium') },
                      { value: 'high', label: t('sevHigh') },
                    ]}
                  />
                  {severity === 'auto' && (
                    <div className="stack mt" style={{ gap: 4 }}>
                      <div className="row-wrap small">
                        <Badge tone={SEV_TONE[preview.sev.level]}>{t('sevPreview', { level: t(`lvl_${preview.sev.level}` as Key), points: preview.sev.points })}</Badge>
                        {preview.facts.minutesToNextTrain !== null && <SimLabel kind="wttPositions" short />}
                      </div>
                      <ul className="tiny muted" style={{ margin: 0, paddingLeft: 18 }}>
                        {parseReasons([...preview.sev.reasons, ...(preview.facts.nextTrainNo ? [`Next train: ${preview.facts.nextTrainNo} (timetable)`] : [])]).map((f, i) => (
                          <li key={i}>{factorText(f)}</li>
                        ))}
                      </ul>
                      <div className="tiny muted">{t('sevAutoHint')} {t('sevThresholds', { high: SEVERITY_THRESHOLDS.high, medium: SEVERITY_THRESHOLDS.medium, mediumTop: SEVERITY_THRESHOLDS.high - 1 })}</div>
                      {(!snapshot || loc.km === undefined) && <div className="tiny muted">{t('sevNeedsPlan')}</div>}
                    </div>
                  )}
                </div>
                <div className="field">
                  <label htmlFor="fr-note">{t('note')}</label>
                  <textarea id="fr-note" className="textarea" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePlaceholder')} />
                </div>
              </div>
            </CardBody>
          </Card>

          {error && <Callout tone="warn">{error}</Callout>}

          <button type="submit" className="btn btn-primary btn-lg btn-block" style={{ minHeight: 56 }}>
            <Send /> {t('submit')}
          </button>
          <div className="row-wrap tiny muted">
            <SimLabel kind="localOnly" />
            <span>{t('stored')}</span>
          </div>
        </form>
      ) : (
        <div className="stack-lg">
          {sent && (
            <Card pastel={sent.severity === 'high' ? 'pink' : sent.severity === 'medium' ? 'yellow' : 'green'} tour="field-report-sent">
              <CardHead title={t('sentTitle', { ref: sent.id })} sub={t('sentRouted', { dept: sent.dept ? deptText(sent.dept) : t('routesControl') })} right={sent.severity && <Badge tone={SEV_TONE[sent.severity]}>{t(`lvl_${sent.severity}` as Key)}</Badge>} />
              <CardBody>
                <div className="stack" style={{ gap: 6 }}>
                  {sent.severity && <div className="strong small">{sent.severityAuto ? t('sentSeverity', { level: t(`lvl_${sent.severity}` as Key) }) : t('sentChosen', { level: t(`lvl_${sent.severity}` as Key) })}</div>}
                  {sent.severityAuto && (
                    <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                      {parseReasons(sent.severityReasons).map((f, i) => (
                        <li key={i}>{factorText(f)}</li>
                      ))}
                    </ul>
                  )}
                  {sent.severityAuto && <div className="tiny muted">{t('sentNote')}</div>}
                  <div>
                    <button type="button" className="btn btn-sm" onClick={() => nav(`/app/field/reports/${encodeURIComponent(sent.id)}`)}>
                      {t('sentOpen')}
                    </button>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}
          {mine.length === 0 ? (
            <EmptyState title={t('mineEmpty')} />
          ) : (
            <div className="stack">
              {mine.map((r) => (
                <ReportRow key={r.id} r={r} label={t(`st${r.status}` as Key)} sevLabel={r.severity ? `${t(`lvl_${r.severity}` as Key)}${r.severityAuto ? ` · ${t('sevComputedBadge')}` : ''}` : null} onOpen={() => nav(`/app/field/reports/${encodeURIComponent(r.id)}`)} />
              ))}
            </div>
          )}

          <Card>
            <CardHead title={t('myBlocks')} />
            <CardBody tight>
              {myExec.length === 0 ? (
                <div className="empty">{t('myBlocksEmpty')}</div>
              ) : (
                <div className="stack">
                  {myExec.map((r) => (
                    <div key={r.blockId} className="well stack" style={{ gap: 4 }}>
                      <div className="row-wrap" style={{ gap: 6 }}>
                        <span className="strong">{r.sectionText} · {r.line}</span>
                        <span className="grow" />
                        <span className="tiny muted mono">{r.blockId}</span>
                      </div>
                      <div className="small num">
                        {r.date} · {t('planned', { a: hhmm(r.plannedStart), b: hhmm(r.plannedEnd) })}
                        {r.actualStart !== undefined ? ` · ${t('actual', { a: hhmm(r.actualStart), b: r.actualEnd !== undefined ? hhmm(r.actualEnd) : '…' })}` : ''}
                      </div>
                      <div className="small">
                        {r.status === 'IN_PROGRESS' ? t('inProgress') : r.speedOnLifting ? t('clearedTsr', { v: r.speedOnLifting }) : t('clearedFull')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <div className="row-wrap tiny muted">
            <SimLabel kind="localOnly" />
            <span>{t('stored')}</span>
          </div>
        </div>
      )}

      <ReportDrawer reportId={reportId} onClose={closeReport} />
    </div>
  );
}

function ReportRow({ r, label, sevLabel, onOpen }: { r: HazardReport; label: string; sevLabel: string | null; onOpen: () => void }) {
  return (
    <button type="button" className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, textAlign: 'left', width: '100%', minHeight: 64 }} onClick={onOpen}>
      {r.thumbDataUrl && <img src={r.thumbDataUrl} alt="" width={52} height={52} style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)', flex: 'none' }} />}
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="row-wrap" style={{ gap: 6 }}>
          <span className="mono strong">{r.id}</span>
          <Badge tone={STATUS_TONE[r.status]}>{label}</Badge>
          {r.severity && sevLabel && <Badge tone={SEV_TONE[r.severity]}>{sevLabel}</Badge>}
          {r.dept && <DeptBadge dept={r.dept} />}
        </span>
        <span className="small truncate" style={{ display: 'block' }}>{r.description}</span>
        <span className="tiny muted" style={{ display: 'block' }}>
          {timeAgo(r.at)}
          {r.km !== undefined ? ` · km ${r.km.toFixed(1)}` : ''}
          {r.line ? ` ${r.line}` : ''}
          {r.nearestStation ? ` · ${r.nearestStation}` : ''}
        </span>
      </span>
      <ChevronRight size={18} style={{ color: 'var(--ink-3)', flex: 'none' }} />
    </button>
  );
}
