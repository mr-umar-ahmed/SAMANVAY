/**
 * ReportDrawer — one hazard report (citizen / field / loco pilot) with its
 * photo, reporter text (shown as received, no machine translation), snapped
 * location, rule-based routing, the next timetabled train at that chainage
 * and the triage actions the signed-in role may take on the current portal.
 * Opens from ?report=<id> on any portal via useDrawerParams().
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRightLeft, CheckCircle2, Flame, ImageOff, Undo2, UserRound, Wrench, XCircle } from 'lucide-react';
import { can } from '../../auth/portals';
import { usePortal } from '../../app/usePortal';
import { WORK_TYPES } from '../../engine/constants.js';
import { getCorridor, sectionAtKm } from '../../engine/corridors.js';
import { nextTrainAt } from '../../engine/select';
import type { Corridor, Dept, InjectSpec, Line, RunLine } from '../../engine/types';
import { LANGS, useT } from '../../i18n';
import { common } from '../../i18n/common';
import { DEPT_LABEL, clamp, nowMinuteIST, timeAgo } from '../../lib/format';
import { SEVERITY_THRESHOLDS } from '../../lib/triage';
import { deptForCategory, useAppStore, type HazardReport, type ReportCategory } from '../../store/useAppStore';
import { Badge, Callout, DeptBadge, Drawer, EmptyState, Field, KeyValue, Modal, SectionTitle, Segmented, StatusBadge, type Tone } from '../ui';
import { SimLabel, Timeline, loadPhoto } from '../ui/extras';
import { MiniMap } from '../viz/CorridorMap';

/* ── engine shapes (constants.js is untyped) ─────────────────── */
interface WorkTypeDef {
  dept: Dept;
  label: string;
  blockKind: string;
  durationMin: number;
  tsrKmph: number | null;
  capital?: boolean;
}
const WT = WORK_TYPES as Record<string, WorkTypeDef>;
const DEPTS: Dept[] = ['TMS', 'SMMS', 'TDMS'];
const CAUTION_SPEEDS = [30, 45, 60] as const;
const KM_HALO = 0.3;

/* ── strings ─────────────────────────────────────────────────── */
const strings = {
  en: {
    title: 'Hazard report',
    notFound: 'Report not found',
    notFoundBody: 'It may have been cleared with the demo data or belongs to another corridor.',
    source: 'Source',
    srcCitizen: 'Citizen',
    srcField: 'Field staff',
    srcLocoPilot: 'Loco pilot of train {n}',
    srcLocoPilotNoTrain: 'Loco pilot',
    reporter: 'Reporter',
    category: 'Category',
    severity: 'Severity',
    sevLow: 'Low',
    sevMedium: 'Medium',
    sevHigh: 'High',
    catTrack: 'Track',
    catSignal: 'Signal',
    catOhe: 'OHE',
    catLc: 'Level crossing',
    catFire: 'Fire',
    catObstruction: 'Obstruction',
    catOther: 'Other',
    description: 'Reporter text',
    langTag: 'Written in {lang} — shown as received, not translated',
    photoNone: 'No photo attached',
    photoAlt: 'Photo attached to the report',
    location: 'Location',
    chainage: 'Chainage',
    nearestStation: 'Nearest station',
    section: 'Block section',
    line: 'Line',
    accuracy: 'GPS accuracy',
    noLocation: 'No chainage recorded — the reporter gave no location.',
    routing: 'Routing',
    routingSentence: 'Category: {cat} → {dept}; nearest asset: km {km}, section {sec}',
    routingNoKm: 'Category: {cat} → {dept}; no chainage given',
    routingControl: 'Control for triage',
    routingNote: 'Routing is rule-based on category and nearest corridor asset.',
    nextTrain: 'Next train at this chainage',
    nextTrainIn: '{train} · {line} line · in {min} min',
    nextTrainNow: '{train} · {line} line · passing now',
    noNextTrain: 'No further timetabled train at this chainage today.',
    planPending: 'Plan not ready — the next train is not known yet.',
    otherCorridor: 'Report is on another corridor; switch the corridor to see the next train.',
    timeline: 'Timeline',
    hRECEIVED: 'Received',
    hVERIFY: 'Verified',
    hASSIGN: 'Assigned',
    hREROUTE: 'Re-routed',
    hACCEPT: 'Converted to work',
    hREJECT: 'Rejected',
    hRESOLVE: 'Resolved',
    hRETURN: 'Returned to Control',
    awaitingVerification: 'Awaiting verification',
    underVerification: 'Being verified',
    assignedTo: 'Assigned to {name}',
    converted: 'Converted to work — planned on the next run',
    closedResolved: 'Closed — attended',
    closedRejected: 'Closed — not confirmed',
    taskLink: 'Open in the risk register',
    verify: 'Verify',
    reroute: 'Re-route',
    imposeCaution: 'Impose caution',
    closeReport: 'Close',
    replanTonight: 'Re-plan tonight',
    assign: 'Assign to field staff',
    convert: 'Convert to task',
    resolve: 'Resolve',
    returnControl: 'Not ours — return to Control',
    dept: 'Department',
    assigneeName: 'Field staff name',
    note: 'Note',
    optional: 'optional',
    outcome: 'Outcome',
    outConfirmed: 'Confirmed and attended',
    outNotFound: 'Not found on site',
    outDuplicate: 'Duplicate of another report',
    tsrTitle: 'Impose temporary speed restriction',
    fromKm: 'From km',
    toKm: 'To km',
    speed: 'Speed (km/h)',
    reason: 'Reason',
    imposeBtn: 'Impose TSR',
    tsrToast: 'TSR km {a}–{b} at {v} km/h in force',
    tsrBody: 'T/409 regenerates on the caution desk; advisories update.',
    convertTitle: 'Convert report to work',
    workType: 'Work type',
    tsrOptional: 'TSR proposed (km/h, optional)',
    convertBtn: 'Create task and re-plan',
    convertToast: 'Task created and sent to the optimiser',
    convertBody: '{label} · km {a}–{b} {line}',
    verifiedToast: 'Report {id} verified',
    verifiedBody: 'Routed to {dept}; the department and field staff are notified.',
    reroutedToast: 'Report {id} re-routed to {dept}',
    assignedToast: 'Report {id} assigned to {name}',
    resolvedToast: 'Report {id} closed',
    rejectedToast: 'Report {id} closed as not confirmed',
    returnedToast: 'Report {id} returned to Control',
    readOnly: 'Read-only on this portal.',
    noCap: 'Your role cannot triage reports.',
    noCapDept: 'Only the department this report is routed to can act on it.',
    noCaution: 'Only Control can impose a caution.',
    closedHint: 'This report is closed. No further action.',
    reasonDefault: 'Hazard report {id}: {desc}',
    replanReason: 'incident converted',
    sevAuto: 'Computed from the report and the timetable',
    sevReporter: 'Chosen by the reporter',
    sevNone: 'No severity recorded.',
    sevRule: 'Points table: high at {h} points or more, medium at {m} or more, else low.',
    sevReasons: 'Why this severity (rule table, as recorded)',
    ruleBased: 'Rule-based, not a model',
    suggestTitle: 'Category check',
    suggestLine: 'Suggested category: {cat} (keyword match: {words})',
    suggestDiffers: 'The reporter chose {cur}. Re-routing changes the department only; the recorded category stays.',
    suggestSameDept: 'Already routed to {dept}.',
    suggestNoDept: 'This category goes to Control for triage.',
    routeTo: 'Route to {dept}',
    suggestRouteNote: 'Keyword suggestion: {cat} ({words})',
  },
  hi: {
    title: 'खतरा रिपोर्ट',
    notFound: 'रिपोर्ट नहीं मिली',
    notFoundBody: 'यह डेमो डेटा के साथ हटाई गई हो सकती है या किसी अन्य कॉरिडोर की है।',
    source: 'स्रोत',
    srcCitizen: 'नागरिक',
    srcField: 'फ़ील्ड स्टाफ़',
    srcLocoPilot: 'ट्रेन {n} के लोको पायलट',
    srcLocoPilotNoTrain: 'लोको पायलट',
    reporter: 'रिपोर्टकर्ता',
    category: 'श्रेणी',
    severity: 'गंभीरता',
    sevLow: 'कम',
    sevMedium: 'मध्यम',
    sevHigh: 'उच्च',
    catTrack: 'ट्रैक',
    catSignal: 'सिग्नल',
    catOhe: 'OHE',
    catLc: 'समपार फाटक',
    catFire: 'आग',
    catObstruction: 'अवरोध',
    catOther: 'अन्य',
    description: 'रिपोर्टकर्ता का विवरण',
    langTag: '{lang} में लिखा — जैसा प्राप्त हुआ, अनुवाद नहीं',
    photoNone: 'कोई फ़ोटो संलग्न नहीं',
    photoAlt: 'रिपोर्ट से संलग्न फ़ोटो',
    location: 'स्थान',
    chainage: 'चेनेज',
    nearestStation: 'निकटतम स्टेशन',
    section: 'ब्लॉक सेक्शन',
    line: 'लाइन',
    accuracy: 'GPS सटीकता',
    noLocation: 'कोई चेनेज दर्ज नहीं — रिपोर्टकर्ता ने स्थान नहीं दिया।',
    routing: 'रूटिंग',
    routingSentence: 'श्रेणी: {cat} → {dept}; निकटतम परिसंपत्ति: किमी {km}, सेक्शन {sec}',
    routingNoKm: 'श्रेणी: {cat} → {dept}; चेनेज नहीं दिया गया',
    routingControl: 'ट्रायेज हेतु नियंत्रण',
    routingNote: 'रूटिंग श्रेणी और निकटतम कॉरिडोर परिसंपत्ति पर नियम-आधारित है।',
    nextTrain: 'इस चेनेज पर अगली ट्रेन',
    nextTrainIn: '{train} · {line} लाइन · {min} मिनट में',
    nextTrainNow: '{train} · {line} लाइन · अभी गुज़र रही है',
    noNextTrain: 'आज इस चेनेज पर कोई और समय-सारणीबद्ध ट्रेन नहीं।',
    planPending: 'योजना तैयार नहीं — अगली ट्रेन अभी ज्ञात नहीं।',
    otherCorridor: 'रिपोर्ट दूसरे कॉरिडोर की है; अगली ट्रेन देखने हेतु कॉरिडोर बदलें।',
    timeline: 'समयरेखा',
    hRECEIVED: 'प्राप्त',
    hVERIFY: 'सत्यापित',
    hASSIGN: 'सौंपा गया',
    hREROUTE: 'पुनः रूट',
    hACCEPT: 'कार्य में परिवर्तित',
    hREJECT: 'अस्वीकृत',
    hRESOLVE: 'निपटाया',
    hRETURN: 'नियंत्रण को लौटाया',
    awaitingVerification: 'सत्यापन की प्रतीक्षा',
    underVerification: 'सत्यापन जारी',
    assignedTo: '{name} को सौंपा',
    converted: 'कार्य में परिवर्तित — अगले रन में योजनाबद्ध',
    closedResolved: 'बंद — निपटाया गया',
    closedRejected: 'बंद — पुष्टि नहीं हुई',
    taskLink: 'जोखिम रजिस्टर में खोलें',
    verify: 'सत्यापित करें',
    reroute: 'पुनः रूट करें',
    imposeCaution: 'सतर्कता लगाएँ',
    closeReport: 'बंद करें',
    replanTonight: 'आज रात पुनर्योजना',
    assign: 'फ़ील्ड स्टाफ़ को सौंपें',
    convert: 'कार्य में बदलें',
    resolve: 'निपटाएँ',
    returnControl: 'हमारा नहीं — नियंत्रण को लौटाएँ',
    dept: 'विभाग',
    assigneeName: 'फ़ील्ड स्टाफ़ का नाम',
    note: 'टिप्पणी',
    optional: 'वैकल्पिक',
    outcome: 'परिणाम',
    outConfirmed: 'पुष्टि हुई और निपटाया गया',
    outNotFound: 'मौके पर नहीं मिला',
    outDuplicate: 'किसी अन्य रिपोर्ट की प्रति',
    tsrTitle: 'अस्थायी गति प्रतिबंध (TSR) लगाएँ',
    fromKm: 'किमी से',
    toKm: 'किमी तक',
    speed: 'गति (किमी/घं.)',
    reason: 'कारण',
    imposeBtn: 'TSR लागू करें',
    tsrToast: 'TSR किमी {a}–{b} पर {v} किमी/घं. लागू',
    tsrBody: 'T/409 सतर्कता डेस्क पर पुनः बनेगा; सूचनाएँ अद्यतन होंगी।',
    convertTitle: 'रिपोर्ट को कार्य में बदलें',
    workType: 'कार्य प्रकार',
    tsrOptional: 'प्रस्तावित TSR (किमी/घं., वैकल्पिक)',
    convertBtn: 'कार्य बनाएँ और पुनर्योजना करें',
    convertToast: 'कार्य बना और ऑप्टिमाइज़र को भेजा गया',
    convertBody: '{label} · किमी {a}–{b} {line}',
    verifiedToast: 'रिपोर्ट {id} सत्यापित',
    verifiedBody: '{dept} को रूट किया; विभाग और फ़ील्ड स्टाफ़ को सूचना दी गई।',
    reroutedToast: 'रिपोर्ट {id} {dept} को पुनः रूट की गई',
    assignedToast: 'रिपोर्ट {id} {name} को सौंपी गई',
    resolvedToast: 'रिपोर्ट {id} बंद',
    rejectedToast: 'रिपोर्ट {id} अपुष्ट के रूप में बंद',
    returnedToast: 'रिपोर्ट {id} नियंत्रण को लौटाई गई',
    readOnly: 'इस पोर्टल पर केवल पढ़ने योग्य।',
    noCap: 'आपकी भूमिका रिपोर्ट ट्रायेज नहीं कर सकती।',
    noCapDept: 'केवल वही विभाग कार्रवाई कर सकता है जिसे यह रिपोर्ट रूट की गई है।',
    noCaution: 'केवल नियंत्रण सतर्कता लगा सकता है।',
    closedHint: 'यह रिपोर्ट बंद है। आगे कोई कार्रवाई नहीं।',
    reasonDefault: 'खतरा रिपोर्ट {id}: {desc}',
    replanReason: 'incident converted',
    sevAuto: 'रिपोर्ट और समय-सारणी से गणना',
    sevReporter: 'रिपोर्टकर्ता द्वारा चुनी गई',
    sevNone: 'कोई गंभीरता दर्ज नहीं।',
    sevRule: 'अंक तालिका: {h} या अधिक अंक पर उच्च, {m} या अधिक पर मध्यम, अन्यथा कम।',
    sevReasons: 'यह गंभीरता क्यों (नियम तालिका, जैसे दर्ज हुई)',
    ruleBased: 'नियम-आधारित, मॉडल नहीं',
    suggestTitle: 'श्रेणी जाँच',
    suggestLine: 'सुझाई गई श्रेणी: {cat} (कीवर्ड मेल: {words})',
    suggestDiffers: 'रिपोर्टकर्ता ने {cur} चुना। पुनः रूट से केवल विभाग बदलता है; दर्ज श्रेणी वही रहती है।',
    suggestSameDept: 'पहले से {dept} को रूट।',
    suggestNoDept: 'यह श्रेणी ट्रायेज हेतु नियंत्रण को जाती है।',
    routeTo: '{dept} को रूट करें',
    suggestRouteNote: 'कीवर्ड सुझाव: {cat} ({words})',
  },
} as const;

type Mode = 'verify' | 'reroute' | 'caution' | 'close' | 'assign' | 'convert' | 'resolve' | 'return' | null;
type Outcome = 'confirmed' | 'notFound' | 'duplicate';

const CAT_KEY: Record<ReportCategory, keyof typeof strings.en> = { track: 'catTrack', signal: 'catSignal', ohe: 'catOhe', lc: 'catLc', fire: 'catFire', obstruction: 'catObstruction', other: 'catOther' };
const SEV_TONE: Record<'low' | 'medium' | 'high', Tone> = { low: 'gray', medium: 'warn', high: 'crit' };

function deptText(d: Dept): string {
  return `${DEPT_LABEL[d].short} (${DEPT_LABEL[d].system})`;
}

export function ReportDrawer({ reportId, onClose }: { reportId: string | null; onClose: () => void }) {
  const t = useT(strings);
  const c = useT(common);
  const portal = usePortal();
  const user = useAppStore((s) => s.user);
  const snapshot = useAppStore((s) => s.snapshot);
  const reports = useAppStore((s) => s.reports);
  const triageReport = useAppStore((s) => s.triageReport);
  const addTsr = useAppStore((s) => s.addTsr);
  const runPlan = useAppStore((s) => s.runPlan);
  const toast = useAppStore((s) => s.toast);

  const report: HazardReport | undefined = useMemo(() => reports.find((r) => r.id === reportId), [reports, reportId]);
  const corridor = useMemo(() => (report ? (getCorridor(report.corridorId) as Corridor) : null), [report]);

  /* photo: full-size from IndexedDB, else thumbnail, else placeholder */
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const photoId = report?.photoId;
  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    setPhotoUrl(null);
    if (photoId) {
      loadPhoto(photoId)
        .then((u) => {
          if (!alive) {
            if (u) URL.revokeObjectURL(u);
            return;
          }
          url = u;
          setPhotoUrl(u);
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photoId]);

  /* next timetabled train at the report chainage (WTT-derived, plan day 0) */
  const next = useMemo(() => {
    if (!snapshot || !report || report.km === undefined || snapshot.corridor.id !== report.corridorId) return null;
    const minute = nowMinuteIST();
    const lines: RunLine[] = report.line === 'UP' || report.line === 'DN' ? [report.line] : ['UP', 'DN'];
    let best: { train: string; line: RunLine; inMin: number } | null = null;
    for (const l of lines) {
      const r = nextTrainAt(snapshot, 0, minute, report.km, l);
      if (r && (!best || r.inMin < best.inMin)) best = { train: `${r.train.number} ${r.train.name}`, line: l, inMin: r.inMin };
    }
    return best;
  }, [snapshot, report]);

  const [mode, setMode] = useState<Mode>(null);
  const [dept, setDept] = useState<Dept>('TMS');
  const [note, setNote] = useState('');
  const [assignee, setAssignee] = useState('');
  const [outcome, setOutcome] = useState<Outcome>('confirmed');
  const [tsr, setTsr] = useState<{ line: Line; fromKm: string; toKm: string; kmph: number; reason: string }>({ line: 'BOTH', fromKm: '0', toKm: '0', kmph: CAUTION_SPEEDS[0], reason: '' });
  const [conv, setConv] = useState<{ dept: Dept; workType: string; line: Line; fromKm: string; toKm: string; tsrKmph: string; note: string }>({ dept: 'TMS', workType: '', line: 'BOTH', fromKm: '0', toKm: '0', tsrKmph: '', note: '' });

  useEffect(() => {
    setMode(null);
  }, [reportId]);

  if (!reportId) return null;
  if (!report || !corridor) {
    return (
      <Drawer open onClose={onClose} title={t('title')} subtitle={reportId}>
        <EmptyState title={t('notFound')} body={t('notFoundBody')} />
      </Drawer>
    );
  }

  /* ── derived display values ── */
  const km = report.km;
  const section = km !== undefined ? (sectionAtKm(corridor, km) as { label: string }) : null;
  const routedDept = report.dept ?? deptForCategory(report.category);
  const catLabel = t(CAT_KEY[report.category]);
  const deptLabel = report.dept ? deptText(report.dept) : t('routingControl');
  const routing = km !== undefined && section ? t('routingSentence', { cat: catLabel, dept: deptLabel, km: km.toFixed(1), sec: section.label }) : t('routingNoKm', { cat: catLabel, dept: deptLabel });
  const langMeta = LANGS.find((l) => l.code === report.lang);
  const closed = report.status === 'RESOLVED' || report.status === 'REJECTED';
  const isTask = report.status === 'TASK';
  const sourceLabel = report.source === 'citizen' ? t('srcCitizen') : report.source === 'field' ? t('srcField') : report.trainNumber ? t('srcLocoPilot', { n: report.trainNumber }) : t('srcLocoPilotNoTrain');

  /* ── who may do what (capability × portal) ── */
  const isControl = portal === 'control';
  const isDept = portal === 'tms' || portal === 'smms' || portal === 'tdms';
  const isPlanning = portal === 'planning';
  const isDivision = portal === 'division';
  const triage = can(user, 'triage');
  const cautionOk = can(user, 'issueCaution');
  // Control roles carry issueCaution/grant rather than triage in auth/portals.ts; treat either as the desk's triage right.
  const controlOk = triage || cautionOk;
  const deptOk = triage && !!user?.dept && user.dept === report.dept;
  const planningOk = triage;
  const divisionOk = can(user, 'authorise') || can(user, 'admin');

  const kmClamp = (v: number) => clamp(Math.round(v * 10) / 10, 0, corridor.lengthKm);

  const open = (m: Exclude<Mode, null>) => {
    setNote('');
    setDept(routedDept ?? 'TMS');
    if (m === 'caution') {
      const base = km ?? 0;
      setTsr({ line: report.line ?? 'BOTH', fromKm: kmClamp(base - KM_HALO).toFixed(1), toKm: kmClamp(base + KM_HALO).toFixed(1), kmph: CAUTION_SPEEDS[0], reason: t('reasonDefault', { id: report.id, desc: report.description.slice(0, 80) }) });
    }
    if (m === 'convert') {
      const d: Dept = isPlanning ? (routedDept ?? 'TMS') : (user?.dept ?? routedDept ?? 'TMS');
      const first = Object.keys(WT).find((k) => WT[k].dept === d) ?? Object.keys(WT)[0];
      const base = km ?? 0;
      setConv({ dept: d, workType: first, line: report.line ?? 'BOTH', fromKm: kmClamp(base - 0.1).toFixed(1), toKm: kmClamp(base + 0.1).toFixed(1), tsrKmph: WT[first]?.tsrKmph ? String(WT[first].tsrKmph) : '', note: report.description.slice(0, 120) });
    }
    setMode(m);
  };

  /* ── actions ── */
  const doVerify = () => {
    triageReport(report.id, 'verify', { dept, note: note || undefined });
    toast({ title: t('verifiedToast', { id: report.id }), body: t('verifiedBody', { dept: deptText(dept) }), tone: 'ok' });
    setMode(null);
  };
  const doReroute = () => {
    triageReport(report.id, 'reroute', { dept, note: note || undefined });
    toast({ title: t('reroutedToast', { id: report.id, dept: deptText(dept) }), tone: 'info' });
    setMode(null);
  };
  const doCaution = () => {
    const a = kmClamp(Number(tsr.fromKm));
    const b = Math.max(a, kmClamp(Number(tsr.toKm)));
    addTsr({ corridorId: report.corridorId, line: tsr.line, fromKm: a, toKm: b, kmph: tsr.kmph, reason: tsr.reason.trim() || t('reasonDefault', { id: report.id, desc: catLabel }), status: 'IN_FORCE' });
    toast({ title: t('tsrToast', { a: a.toFixed(1), b: b.toFixed(1), v: tsr.kmph }), body: t('tsrBody'), tone: 'crit' });
    setMode(null);
  };
  const doClose = () => {
    const outcomeText = outcome === 'confirmed' ? t('outConfirmed') : outcome === 'notFound' ? t('outNotFound') : t('outDuplicate');
    const n = note.trim() ? `${outcomeText} · ${note.trim()}` : outcomeText;
    if (outcome === 'confirmed') {
      triageReport(report.id, 'resolve', { note: n });
      toast({ title: t('resolvedToast', { id: report.id }), body: outcomeText, tone: 'ok' });
    } else {
      triageReport(report.id, 'reject', { note: n });
      toast({ title: t('rejectedToast', { id: report.id }), body: outcomeText, tone: 'info' });
    }
    setMode(null);
  };
  const doAssign = () => {
    const name = assignee.trim();
    if (!name) return;
    triageReport(report.id, 'assign', { assignee: name, note: note || undefined });
    toast({ title: t('assignedToast', { id: report.id, name }), tone: 'ok' });
    setMode(null);
  };
  const doConvert = () => {
    const wt = WT[conv.workType];
    if (!wt) return;
    const a = kmClamp(Number(conv.fromKm));
    const b = Math.max(a + 0.1, kmClamp(Number(conv.toKm)));
    const spec: InjectSpec = {
      sourceId: `REPORT/${report.id}`,
      label: `${wt.label} — ${report.id}`,
      workType: conv.workType,
      line: conv.line,
      startKm: a,
      endKm: b,
      tsrKmph: conv.tsrKmph.trim() ? Number(conv.tsrKmph) : wt.tsrKmph,
      daysOverdue: 0,
      note: conv.note.trim() || undefined,
    };
    triageReport(report.id, 'accept', { dept: conv.dept, taskSpec: spec, note: spec.label });
    void runPlan({ reason: t('replanReason') });
    toast({ title: t('convertToast'), body: t('convertBody', { label: wt.label, a: a.toFixed(1), b: b.toFixed(1), line: conv.line }), tone: 'ok' });
    setMode(null);
  };
  const doResolve = () => {
    triageReport(report.id, 'resolve', { note: note.trim() || undefined });
    toast({ title: t('resolvedToast', { id: report.id }), tone: 'ok' });
    setMode(null);
  };
  const doReturn = () => {
    triageReport(report.id, 'return', { note: note.trim() || undefined });
    toast({ title: t('returnedToast', { id: report.id }), tone: 'info' });
    setMode(null);
  };

  /* ── rule-based severity + keyword category suggestion (lib/triage) ── */
  const sevLabel = report.severity === 'low' ? t('sevLow') : report.severity === 'medium' ? t('sevMedium') : t('sevHigh');
  const sug = report.suggestedCategory && report.suggestedCategory.category !== report.category ? report.suggestedCategory : null;
  const sugCat = sug ? t(CAT_KEY[sug.category as ReportCategory]) : '';
  const sugDept = sug ? deptForCategory(sug.category as ReportCategory) : null;
  // the store's 'reroute' changes the department only; offered where the action bar already re-routes (Control, division) and to planning triage
  const rerouteOk = isControl ? controlOk : isDivision ? divisionOk || triage : isPlanning ? planningOk : false;
  const offerRoute = !!sug && !!sugDept && sugDept !== report.dept && !closed && !isTask && (isControl || isDivision || isPlanning);
  const doRouteSuggested = () => {
    if (!sug || !sugDept) return;
    triageReport(report.id, 'reroute', { dept: sugDept, note: t('suggestRouteNote', { cat: sugCat, words: sug.matched.join(', ') }) });
    toast({ title: t('reroutedToast', { id: report.id, dept: deptText(sugDept) }), tone: 'info' });
  };

  /* ── timeline ── */
  const histLabel = (action: string) => {
    const key = `h${action}` as keyof typeof strings.en;
    return key in strings.en ? t(key) : action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (ch) => ch.toUpperCase());
  };
  const steps: { label: string; when?: string; state: 'done' | 'current' | 'pending'; note?: string }[] = report.history.map((h) => ({ label: histLabel(h.action), when: timeAgo(h.at), state: 'done', note: h.note ? `${h.by} · ${h.note}` : h.by }));
  if (report.status === 'UNVERIFIED') steps.push({ label: t('awaitingVerification'), state: 'current' });
  else if (report.status === 'TRIAGED') steps.push({ label: report.assignee ? t('assignedTo', { name: report.assignee }) : t('underVerification'), state: 'current' });
  else if (report.status === 'TASK') steps.push({ label: t('converted'), state: 'current', note: report.intakeTaskId });
  else if (report.status === 'RESOLVED') steps.push({ label: t('closedResolved'), state: 'done' });
  else steps.push({ label: t('closedRejected'), state: 'done' });

  /* ── action bar ── */
  const btn = (label: string, onClick: () => void, allowed: boolean, hint: string, opts?: { primary?: boolean; danger?: boolean; icon?: React.ReactNode }) => (
    <button key={label} className={`btn btn-sm ${opts?.primary ? 'btn-primary' : ''} ${opts?.danger ? 'btn-danger' : ''}`} onClick={onClick} disabled={!allowed} title={allowed ? undefined : hint}>
      {opts?.icon}
      {label}
    </button>
  );
  const deptSelect = (value: Dept, onChange: (d: Dept) => void) => (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value as Dept)}>
      {DEPTS.map((d) => (
        <option key={d} value={d}>{DEPT_LABEL[d].long} · {DEPT_LABEL[d].system}</option>
      ))}
    </select>
  );

  let actions: React.ReactNode = null;
  if (closed) actions = <Callout tone="neutral">{t('closedHint')}</Callout>;
  else if (isControl)
    actions = (
      <div className="row-wrap" data-tour="report-actions">
        {!isTask && btn(t('verify'), () => open('verify'), controlOk, t('noCap'), { primary: true, icon: <CheckCircle2 /> })}
        {btn(t('reroute'), () => open('reroute'), controlOk, t('noCap'), { icon: <ArrowRightLeft /> })}
        {btn(t('imposeCaution'), () => open('caution'), cautionOk, t('noCaution'), { icon: <AlertTriangle /> })}
        {btn(t('closeReport'), () => open('close'), controlOk, t('noCap'), { icon: <XCircle /> })}
        <Link className="btn btn-sm btn-ghost" to={`/app/control/disruptions?report=${report.id}`}>
          <Flame /> {t('replanTonight')}
        </Link>
      </div>
    );
  else if (isDept || isPlanning) {
    const ok = isPlanning ? planningOk : deptOk;
    const hint = isPlanning ? t('noCap') : triage ? t('noCapDept') : t('noCap');
    actions = (
      <div className="row-wrap" data-tour="report-actions">
        {!isTask && btn(t('assign'), () => open('assign'), ok, hint, { icon: <UserRound /> })}
        {!isTask && btn(t('convert'), () => open('convert'), ok, hint, { primary: true, icon: <Wrench /> })}
        {btn(t('resolve'), () => open('resolve'), ok, hint, { icon: <CheckCircle2 /> })}
        {!isTask && btn(t('returnControl'), () => open('return'), ok, hint, { icon: <Undo2 /> })}
      </div>
    );
  } else if (isDivision) actions = <div className="row-wrap" data-tour="report-actions">{btn(t('reroute'), () => open('reroute'), divisionOk, t('noCap'), { icon: <ArrowRightLeft /> })}</div>;
  else actions = <div className="small muted">{t('readOnly')}</div>;

  const modalFooter = (confirm: string, onConfirm: () => void, disabled = false, danger = false) => (
    <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
      <button className="btn btn-sm" onClick={() => setMode(null)}>{c('cancel')}</button>
      <button className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={disabled}>{confirm}</button>
    </div>
  );

  const convWorkTypes = Object.keys(WT).filter((k) => (isPlanning ? WT[k].dept === conv.dept : WT[k].dept === (user?.dept ?? conv.dept)));

  return (
    <Drawer
      open
      onClose={onClose}
      title={t('title')}
      subtitle={report.id}
      width={560}
      badges={
        <>
          <StatusBadge status={report.status} />
          {report.dept ? <DeptBadge dept={report.dept} /> : <Badge tone="warn">{t('routingControl')}</Badge>}
          <Badge tone="outline">{sourceLabel}</Badge>
          {report.severity && <Badge tone={SEV_TONE[report.severity]} title={report.severityAuto ? t('sevAuto') : t('sevReporter')}>{sevLabel}</Badge>}
          {report.seeded && <SimLabel kind="seededRecords" />}
        </>
      }
      footer={actions}
    >
      <div className="stack-lg" data-tour="report-drawer">
        {/* photo */}
        {photoUrl || report.thumbDataUrl ? (
          <img src={photoUrl ?? report.thumbDataUrl} alt={t('photoAlt')} style={{ width: '100%', maxHeight: 280, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line)' }} />
        ) : (
          <div className="row small muted" style={{ gap: 8, padding: 14, border: '1px dashed var(--line)', borderRadius: 10, justifyContent: 'center' }}>
            <ImageOff size={16} /> {t('photoNone')}
          </div>
        )}

        {/* reporter text */}
        <div>
          <div className="section-title">{t('description')}</div>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }} lang={report.lang}>{report.description}</p>
          <div className="tiny muted mt">{t('langTag', { lang: langMeta ? `${langMeta.native} (${langMeta.name})` : report.lang })}</div>
        </div>

        <KeyValue
          items={[
            [t('source'), sourceLabel],
            [t('reporter'), `${report.reporter.name || '—'} · ${report.reporter.role.replace(/_/g, ' ').toLowerCase()}`],
            [t('category'), catLabel],
            [c('status'), <StatusBadge key="s" status={report.status} />],
          ]}
        />

        {/* location */}
        <div>
          <div className="section-title">{t('location')}</div>
          {km === undefined ? (
            <Callout tone="warn">{t('noLocation')}</Callout>
          ) : (
            <div className="stack">
              <KeyValue
                items={[
                  [t('chainage'), <span key="k" className="num">km {km.toFixed(1)}</span>],
                  [t('nearestStation'), report.nearestStation ?? '—'],
                  [t('section'), section?.label ?? '—'],
                  [t('line'), report.line ? (report.line === 'BOTH' ? c('bothLines') : report.line === 'UP' ? c('upLine') : c('dnLine')) : '—'],
                  [t('accuracy'), report.accuracyM ? <span key="a" className="num">±{report.accuracyM} m</span> : '—'],
                ]}
              />
              <MiniMap corridor={corridor} km={km} line={report.line} height={160} />
            </div>
          )}
        </div>

        {/* routing */}
        <div>
          <div className="section-title">{t('routing')}</div>
          <Callout tone="info">
            <div>{routing}</div>
            <div className="tiny muted mt">{t('routingNote')}</div>
          </Callout>
        </div>

        {/* severity (reporter's choice or the rule-based points table) */}
        <div>
          <SectionTitle right={report.severityAuto ? <span className="tiny muted">{t('ruleBased')}</span> : undefined}>{t('severity')}</SectionTitle>
          {report.severity ? (
            <div className="stack" style={{ gap: 8 }}>
              <div className="row-wrap" style={{ gap: 8 }}>
                <Badge tone={SEV_TONE[report.severity]}>{sevLabel}</Badge>
                <span className="small muted">{report.severityAuto ? t('sevAuto') : t('sevReporter')}</span>
              </div>
              {report.severityAuto && <div className="tiny muted">{t('sevRule', { h: SEVERITY_THRESHOLDS.high, m: SEVERITY_THRESHOLDS.medium })}</div>}
              {report.severityReasons && report.severityReasons.length > 0 && (
                <div>
                  <div className="small strong">{t('sevReasons')}</div>
                  <ul className="small" style={{ margin: '4px 0 0', paddingLeft: 18 }} lang="en">
                    {report.severityReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="small muted">{t('sevNone')}</div>
          )}
        </div>

        {/* keyword category suggestion, when it differs from the reporter's category */}
        {sug && (
          <div>
            <SectionTitle right={<span className="tiny muted">{t('ruleBased')}</span>}>{t('suggestTitle')}</SectionTitle>
            <Callout tone="neutral">
              <div>{t('suggestLine', { cat: sugCat, words: sug.matched.join(', ') })}</div>
              <div className="tiny muted mt">{t('suggestDiffers', { cur: catLabel })}</div>
              {!sugDept ? (
                <div className="tiny muted mt">{t('suggestNoDept')}</div>
              ) : sugDept === report.dept ? (
                <div className="tiny muted mt">{t('suggestSameDept', { dept: deptText(sugDept) })}</div>
              ) : offerRoute ? (
                <div className="mt">
                  <button className="btn btn-sm" onClick={doRouteSuggested} disabled={!rerouteOk} title={rerouteOk ? undefined : t('noCap')}>
                    <ArrowRightLeft /> {t('routeTo', { dept: deptText(sugDept) })}
                  </button>
                </div>
              ) : null}
            </Callout>
          </div>
        )}

        {/* next train */}
        <div>
          <div className="section-title">
            {t('nextTrain')} <SimLabel kind="wttPositions" short />
          </div>
          {km === undefined ? (
            <div className="small muted">{t('noLocation')}</div>
          ) : !snapshot ? (
            <div className="small muted">{t('planPending')}</div>
          ) : snapshot.corridor.id !== report.corridorId ? (
            <div className="small muted">{t('otherCorridor')}</div>
          ) : next ? (
            <div className="strong">{next.inMin <= 0 ? t('nextTrainNow', { train: next.train, line: next.line }) : t('nextTrainIn', { train: next.train, line: next.line, min: next.inMin })}</div>
          ) : (
            <div className="small muted">{t('noNextTrain')}</div>
          )}
        </div>

        {/* task link */}
        {isTask && (
          <Callout tone="ok">
            {t('converted')}
            {report.intakeTaskId && <span className="mono small"> · {report.intakeTaskId}</span>}
            <div className="mt">
              <Link className="btn btn-sm" to="/app/planning/risk">{t('taskLink')}</Link>
            </div>
          </Callout>
        )}

        {/* timeline */}
        <div>
          <div className="section-title">{t('timeline')}</div>
          <Timeline steps={steps} />
        </div>
      </div>

      {/* ── modals ── */}
      <Modal open={mode === 'verify'} onClose={() => setMode(null)} title={t('verify')} footer={modalFooter(t('verify'), doVerify)}>
        <div className="stack">
          <Field label={t('dept')}>{deptSelect(dept, setDept)}</Field>
          <Field label={`${t('note')} (${t('optional')})`}>
            <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal open={mode === 'reroute'} onClose={() => setMode(null)} title={t('reroute')} footer={modalFooter(t('reroute'), doReroute)}>
        <div className="stack">
          <Field label={t('dept')}>{deptSelect(dept, setDept)}</Field>
          <Field label={`${t('note')} (${t('optional')})`}>
            <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal open={mode === 'caution'} onClose={() => setMode(null)} title={t('tsrTitle')} footer={modalFooter(t('imposeBtn'), doCaution, Number(tsr.toKm) < Number(tsr.fromKm), true)}>
        <div className="stack">
          <Field label={t('line')}>
            <Segmented<Line> options={[{ value: 'UP', label: 'UP' }, { value: 'DN', label: 'DN' }, { value: 'BOTH', label: c('bothLines') }]} value={tsr.line} onChange={(line) => setTsr({ ...tsr, line })} />
          </Field>
          <div className="form-grid">
            <Field label={t('fromKm')}>
              <input className="input num" type="number" step={0.1} min={0} max={corridor.lengthKm} value={tsr.fromKm} onChange={(e) => setTsr({ ...tsr, fromKm: e.target.value })} />
            </Field>
            <Field label={t('toKm')}>
              <input className="input num" type="number" step={0.1} min={0} max={corridor.lengthKm} value={tsr.toKm} onChange={(e) => setTsr({ ...tsr, toKm: e.target.value })} />
            </Field>
          </div>
          <Field label={t('speed')}>
            <Segmented<string> options={CAUTION_SPEEDS.map((v) => ({ value: String(v), label: <span className="num">{v}</span> }))} value={String(tsr.kmph)} onChange={(v) => setTsr({ ...tsr, kmph: Number(v) })} />
          </Field>
          <Field label={t('reason')}>
            <textarea className="textarea" value={tsr.reason} onChange={(e) => setTsr({ ...tsr, reason: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal open={mode === 'close'} onClose={() => setMode(null)} title={t('closeReport')} footer={modalFooter(t('closeReport'), doClose)}>
        <div className="stack">
          <Field label={t('outcome')}>
            <div className="stack" style={{ gap: 6 }}>
              {(['confirmed', 'notFound', 'duplicate'] as Outcome[]).map((o) => (
                <label key={o} className="check">
                  <input type="radio" name="outcome" checked={outcome === o} onChange={() => setOutcome(o)} />
                  {o === 'confirmed' ? t('outConfirmed') : o === 'notFound' ? t('outNotFound') : t('outDuplicate')}
                </label>
              ))}
            </div>
          </Field>
          <Field label={`${t('note')} (${t('optional')})`}>
            <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal open={mode === 'assign'} onClose={() => setMode(null)} title={t('assign')} footer={modalFooter(t('assign'), doAssign, !assignee.trim())}>
        <div className="stack">
          <Field label={t('assigneeName')}>
            <input className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)} autoFocus />
          </Field>
          <Field label={`${t('note')} (${t('optional')})`}>
            <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal open={mode === 'convert'} onClose={() => setMode(null)} title={t('convertTitle')} footer={modalFooter(t('convertBtn'), doConvert, !WT[conv.workType] || Number(conv.toKm) < Number(conv.fromKm))} width={560}>
        <div className="stack">
          {isPlanning && (
            <Field label={t('dept')}>
              {deptSelect(conv.dept, (d) => {
                const first = Object.keys(WT).find((k) => WT[k].dept === d) ?? '';
                setConv({ ...conv, dept: d, workType: first, tsrKmph: WT[first]?.tsrKmph ? String(WT[first].tsrKmph) : '' });
              })}
            </Field>
          )}
          <Field label={t('workType')}>
            <select className="select" value={conv.workType} onChange={(e) => setConv({ ...conv, workType: e.target.value, tsrKmph: WT[e.target.value]?.tsrKmph ? String(WT[e.target.value].tsrKmph) : '' })}>
              {convWorkTypes.map((k) => (
                <option key={k} value={k}>{WT[k].label} · {WT[k].blockKind.replace('_', ' + ')}</option>
              ))}
            </select>
          </Field>
          <Field label={t('line')}>
            <Segmented<Line> options={[{ value: 'UP', label: 'UP' }, { value: 'DN', label: 'DN' }, { value: 'BOTH', label: c('bothLines') }]} value={conv.line} onChange={(line) => setConv({ ...conv, line })} />
          </Field>
          <div className="form-grid">
            <Field label={t('fromKm')}>
              <input className="input num" type="number" step={0.1} min={0} max={corridor.lengthKm} value={conv.fromKm} onChange={(e) => setConv({ ...conv, fromKm: e.target.value })} />
            </Field>
            <Field label={t('toKm')}>
              <input className="input num" type="number" step={0.1} min={0} max={corridor.lengthKm} value={conv.toKm} onChange={(e) => setConv({ ...conv, toKm: e.target.value })} />
            </Field>
          </div>
          <Field label={t('tsrOptional')}>
            <input className="input num" type="number" min={10} max={corridor.mpsKmph} step={5} value={conv.tsrKmph} onChange={(e) => setConv({ ...conv, tsrKmph: e.target.value })} />
          </Field>
          <Field label={t('note')}>
            <textarea className="textarea" value={conv.note} onChange={(e) => setConv({ ...conv, note: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal open={mode === 'resolve'} onClose={() => setMode(null)} title={t('resolve')} footer={modalFooter(t('resolve'), doResolve)}>
        <Field label={t('note')}>
          <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
        </Field>
      </Modal>

      <Modal open={mode === 'return'} onClose={() => setMode(null)} title={t('returnControl')} footer={modalFooter(t('returnControl'), doReturn, false, true)}>
        <Field label={`${t('note')} (${t('optional')})`}>
          <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
        </Field>
      </Modal>
    </Drawer>
  );
}

export default ReportDrawer;
