/**
 * ReplanPage — Control re-plans after a failure (docs/v4-spec.md §3.6).
 *
 * The event is merged into the working scenario and the optimiser runs a
 * candidate off-thread; the working plan is untouched until Apply. The
 * engine has no fixed-block input, so the candidate re-optimises the whole
 * week: started and locked blocks are listed for context, and any of them
 * that move are flagged in the diff before Control applies it.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Check, Play, X } from 'lucide-react';
import { useAppStore, type CandidatePatch, type HazardReport, type ReportCategory, type ScenarioState } from '../../store/useAppStore';
import { can, type PortalId } from '../../auth/portals';
import { WORK_TYPES } from '../../engine/constants.js';
import { planDiff, workingBlocks, type PlanDiffRow } from '../../engine/select';
import type { Block, Dept, Kpis, Line, RunLine, Scenario, Snapshot } from '../../engine/types';
import { useT } from '../../i18n';
import { Badge, Callout, Card, CardBody, CardHead, DataTable, EmptyState, Field, Modal, PageHeader, PlanPending, Spinner, StatTile, StatusBadge, type Column } from '../../components/ui';
import { SimLabel } from '../../components/ui/extras';
import { BlockDrawer } from '../../components/domain/BlockDrawer';
import { TaskDrawer } from '../../components/domain/TaskDrawer';
import { useDrawerParams } from '../../components/domain/useDrawerParams';
import { dateLabel, duration, hhmm, kmRange, lineLabel, nowMinuteIST, num, pct, signed, timeAgo, toMin } from '../../lib/format';

type EventKind = 'ohe' | 'rail' | 'signal' | 'machine' | 'premium' | 'cancel' | 'surge';
type InjectKind = 'ohe' | 'rail' | 'signal';
const EVENT_KINDS: EventKind[] = ['ohe', 'rail', 'signal', 'machine', 'premium', 'cancel', 'surge'];
const EVENT_DEPT: Record<InjectKind, Dept> = { ohe: 'TDMS', rail: 'TMS', signal: 'SMMS' };
const DEFAULT_WORK: Record<InjectKind, string> = { ohe: 'CONTACT_WIRE_RENEWAL', rail: 'USFD_IMR_RAIL', signal: 'EI_CARD_REPLACEMENT' };
const SURGE_OPTIONS = [1.1, 1.2, 1.3, 1.5];
const isInject = (k: EventKind): k is InjectKind => k === 'ohe' || k === 'rail' || k === 'signal';
const defaultTsr = (workType: string) => {
  const v = (WORK_TYPES as Record<string, { tsrKmph: number | null }>)[workType]?.tsrKmph;
  return v ? String(v) : '';
};

interface WorkTypeDef {
  dept: Dept;
  label: string;
  tsrKmph: number | null;
}
const WT = WORK_TYPES as Record<string, WorkTypeDef>;

const strings = {
  en: {
    title: 'Re-plan',
    lede: 'Describe a failure, run the optimiser on a candidate and compare it with the working plan before applying it.',
    back: 'Back to board',
    escalate: 'Escalate to DRM',
    eventTitle: 'Event',
    eventSub: 'What failed, where and when. The event is added to the working scenario for the candidate run only.',
    fromReport: 'Prefilled from report {id}',
    kind: 'Event',
    kind_ohe: 'OHE failure between stations',
    kind_rail: 'Rail fracture at km',
    kind_signal: 'Signal failure at station',
    kind_machine: 'Machine breakdown',
    kind_premium: 'Added premium train',
    kind_cancel: 'Train cancelled',
    kind_surge: 'Freight surge',
    workNeeded: 'Work needed',
    station: 'Nearest station',
    stationAny: 'Enter km directly',
    fromKm: 'From km',
    toKm: 'To km',
    line: 'Line',
    lineUp: 'UP line',
    lineDn: 'DN line',
    lineBoth: 'Both lines',
    tsr: 'TSR in force (km/h)',
    tsrHintDefault: 'Prefilled with the usual restriction for this work; left empty, {v} km/h applies.',
    tsrHintNone: 'This work carries no restriction by default; enter one if imposed.',
    ptsUnit: 'pts',
    machine: 'Machine',
    machinePick: 'Choose a machine',
    premLine: 'Line',
    premDep: 'Departure from origin',
    train: 'Train',
    trainPick: 'Choose a train',
    surge: 'Additional goods paths',
    surgeOpt: '+{p} % of the FOIS forecast',
    note: 'Note',
    notePlaceholder: 'Controller observations, TPC or S&T fault record…',
    injectedNote: 'Failure events are injected for the demo; in service they come from COA/TPC.',
    mergedWith: 'Merged with the working scenario “{name}”.',
    errKm: 'Km range must lie within the corridor (0–{len} km), from ≤ to.',
    errTsr: 'TSR must be below the sectional speed of {mps} km/h.',
    errMachine: 'Choose the machine that broke down.',
    errTrain: 'Choose the cancelled train.',
    errTime: 'Enter the departure time.',
    run: 'Run re-plan',
    running: 'Running the optimiser…',
    noRunCap: 'Re-planning needs the grant capability (Control).',
    reason: 'Disruption: {event}',
    runDone: 'Candidate ready',
    runDoneBody: '{n} blocks change against the working plan',
    runFailed: 'The candidate run failed',
    contextTitle: 'Started and locked blocks',
    contextSub: 'Shown for context. The optimiser has no fixed-block input: a re-run re-optimises the whole week, and any of these that move are flagged in the diff.',
    contextEmpty: 'No block is started or locked on this corridor.',
    started: 'Started',
    locked: 'Locked',
    kpiTitle: 'Plan week: working and candidate',
    workingPlan: 'Working plan',
    vsWorking: 'Working: {v}',
    kpiHours: 'Block hours',
    kpiDelay: 'Weighted train-delay',
    kpiMandatory: 'Mandatory compliance',
    kpiMandatorySub: '{done} of {total} mandatory works placed',
    kpiNoMandatory: 'No mandatory works this week',
    kpiScheduled: 'Works scheduled',
    kpiScheduledSub: '{n} of {total} works',
    diffTitle: 'Diff: candidate against working plan',
    candidateOf: 'Candidate: {reason} · {when}',
    showKept: 'Show unchanged ({n})',
    hideKept: 'Hide unchanged',
    fixedMoved: '{n} started or locked blocks move in this candidate. Check them before applying.',
    noCandidate: 'Describe the event and run the re-plan.',
    noChange: 'No change needed — the plan already fits.',
    colBlock: 'Block',
    colPlanned: 'Planned',
    colProposed: 'Proposed',
    colTrains: 'Trains affected Δ',
    colDelay: 'Weighted delay Δ',
    colMandatory: 'Mandatory',
    keep: 'Keep',
    shiftTo: 'Shift to {date} {window}',
    dropped: 'Not placed this week',
    added: 'New · {date} {window}',
    openWorking: 'Open this block in the working plan',
    newWorks: 'New block for: {works}',
    movesStarted: 'Started block moves',
    movesLocked: 'Locked block moves',
    mandatoryMet: 'Still met',
    mandatoryLost: '{n} mandatory unplaced',
    apply: 'Apply',
    discard: 'Discard',
    noApplyCap: 'Applying needs the grant capability.',
    applyNote: 'Concurrence, grant and lock records are kept by block number; review the board after applying.',
    appliedToast: 'Re-plan applied',
    appliedBody: '{n} blocks moved; the board shows the new plan',
    discardedToast: 'Candidate discarded',
    notifyTitle: 'Re-plan applied by Control at {time}: {n} blocks moved',
    escalateTitle: 'Escalate to DRM',
    escalateBody: 'The escalation appears on the DRM escalations desk with this note.',
    escalateNote: 'Why Control needs a decision',
    escalateRequired: 'A note is required.',
    escalateConfirm: 'Escalate',
    escalatedToast: 'Escalated',
    escalatedBody: 'Sent to the DRM escalations desk',
    cancel: 'Cancel',
    minUnit: 'min',
    hourUnit: 'h',
  },
  hi: {
    title: 'पुनः योजना',
    lede: 'विफलता का विवरण दें, एक प्रत्याशी योजना पर ऑप्टिमाइज़र चलाएँ और लागू करने से पहले कार्यकारी योजना से तुलना करें।',
    back: 'बोर्ड पर लौटें',
    escalate: 'DRM को एस्केलेट करें',
    eventTitle: 'घटना',
    eventSub: 'क्या विफल हुआ, कहाँ और कब। घटना केवल प्रत्याशी रन के लिए कार्यकारी परिदृश्य में जोड़ी जाती है।',
    fromReport: 'रिपोर्ट {id} से भरा गया',
    kind: 'घटना',
    kind_ohe: 'स्टेशनों के बीच OHE विफलता',
    kind_rail: 'किमी पर रेल फ्रैक्चर',
    kind_signal: 'स्टेशन पर सिग्नल विफलता',
    kind_machine: 'मशीन खराबी',
    kind_premium: 'अतिरिक्त प्रीमियम ट्रेन',
    kind_cancel: 'ट्रेन रद्द',
    kind_surge: 'माल यातायात वृद्धि',
    workNeeded: 'आवश्यक कार्य',
    station: 'निकटतम स्टेशन',
    stationAny: 'सीधे किमी दर्ज करें',
    fromKm: 'किमी से',
    toKm: 'किमी तक',
    line: 'लाइन',
    lineUp: 'UP लाइन',
    lineDn: 'DN लाइन',
    lineBoth: 'दोनों लाइनें',
    tsr: 'लागू TSR (किमी/घं)',
    tsrHintDefault: 'इस कार्य का सामान्य प्रतिबंध भरा गया है; खाली छोड़ने पर {v} किमी/घं लागू होगा।',
    tsrHintNone: 'इस कार्य पर सामान्यतः कोई प्रतिबंध नहीं; लगाया गया हो तो दर्ज करें।',
    ptsUnit: 'अंक',
    machine: 'मशीन',
    machinePick: 'मशीन चुनें',
    premLine: 'लाइन',
    premDep: 'मूल स्टेशन से प्रस्थान',
    train: 'ट्रेन',
    trainPick: 'ट्रेन चुनें',
    surge: 'अतिरिक्त माल पथ',
    surgeOpt: 'FOIS पूर्वानुमान का +{p} %',
    note: 'नोट',
    notePlaceholder: 'नियंत्रक के अवलोकन, TPC या S&T दोष रिकॉर्ड…',
    injectedNote: 'डेमो के लिए विफलता घटनाएँ इंजेक्ट की जाती हैं; सेवा में ये COA/TPC से आती हैं।',
    mergedWith: 'कार्यकारी परिदृश्य “{name}” के साथ जोड़ा गया।',
    errKm: 'किमी सीमा कॉरिडोर के भीतर (0–{len} किमी) और से ≤ तक होनी चाहिए।',
    errTsr: 'TSR खंडीय गति {mps} किमी/घं से कम होना चाहिए।',
    errMachine: 'खराब हुई मशीन चुनें।',
    errTrain: 'रद्द हुई ट्रेन चुनें।',
    errTime: 'प्रस्थान समय दर्ज करें।',
    run: 'पुनः योजना चलाएँ',
    running: 'ऑप्टिमाइज़र चल रहा है…',
    noRunCap: 'पुनः योजना के लिए grant अधिकार चाहिए (नियंत्रण)।',
    reason: 'व्यवधान: {event}',
    runDone: 'प्रत्याशी योजना तैयार',
    runDoneBody: 'कार्यकारी योजना की तुलना में {n} block बदलते हैं',
    runFailed: 'प्रत्याशी रन विफल रहा',
    contextTitle: 'शुरू और लॉक किए गए block',
    contextSub: 'संदर्भ के लिए। ऑप्टिमाइज़र में स्थिर-block इनपुट नहीं है: पुनः रन पूरे सप्ताह को फिर से अनुकूलित करता है, और इनमें से जो भी हिलें वे अंतर तालिका में चिह्नित होते हैं।',
    contextEmpty: 'इस कॉरिडोर पर कोई block शुरू या लॉक नहीं है।',
    started: 'शुरू',
    locked: 'लॉक',
    kpiTitle: 'योजना सप्ताह: कार्यकारी और प्रत्याशी',
    workingPlan: 'कार्यकारी योजना',
    vsWorking: 'कार्यकारी: {v}',
    kpiHours: 'Block घंटे',
    kpiDelay: 'भारित ट्रेन-विलंब',
    kpiMandatory: 'अनिवार्य अनुपालन',
    kpiMandatorySub: '{total} में से {done} अनिवार्य कार्य नियोजित',
    kpiNoMandatory: 'इस सप्ताह कोई अनिवार्य कार्य नहीं',
    kpiScheduled: 'नियोजित कार्य',
    kpiScheduledSub: '{total} में से {n} कार्य',
    diffTitle: 'अंतर: प्रत्याशी बनाम कार्यकारी योजना',
    candidateOf: 'प्रत्याशी: {reason} · {when}',
    showKept: 'अपरिवर्तित दिखाएँ ({n})',
    hideKept: 'अपरिवर्तित छिपाएँ',
    fixedMoved: 'इस प्रत्याशी में {n} शुरू या लॉक block हिलते हैं। लागू करने से पहले जाँचें।',
    noCandidate: 'घटना का विवरण दें और पुनः योजना चलाएँ।',
    noChange: 'कोई बदलाव आवश्यक नहीं — योजना पहले से फिट है।',
    colBlock: 'Block',
    colPlanned: 'नियोजित',
    colProposed: 'प्रस्तावित',
    colTrains: 'प्रभावित ट्रेनें Δ',
    colDelay: 'भारित विलंब Δ',
    colMandatory: 'अनिवार्य',
    keep: 'यथावत',
    shiftTo: '{date} {window} पर खिसकाएँ',
    dropped: 'इस सप्ताह नियोजित नहीं',
    added: 'नया · {date} {window}',
    openWorking: 'कार्यकारी योजना में यह block खोलें',
    newWorks: 'इनके लिए नया block: {works}',
    movesStarted: 'शुरू block हिलता है',
    movesLocked: 'लॉक block हिलता है',
    mandatoryMet: 'अब भी पूर्ण',
    mandatoryLost: '{n} अनिवार्य अनियोजित',
    apply: 'लागू करें',
    discard: 'रद्द करें',
    noApplyCap: 'लागू करने के लिए grant अधिकार चाहिए।',
    applyNote: 'सहमति, प्रदान और लॉक रिकॉर्ड block संख्या से जुड़े रहते हैं; लागू करने के बाद बोर्ड देखें।',
    appliedToast: 'पुनः योजना लागू',
    appliedBody: '{n} block बदले; बोर्ड नई योजना दिखाता है',
    discardedToast: 'प्रत्याशी योजना रद्द',
    notifyTitle: 'नियंत्रण द्वारा {time} पर पुनः योजना लागू: {n} block बदले',
    escalateTitle: 'DRM को एस्केलेट करें',
    escalateBody: 'यह एस्केलेशन इस नोट के साथ DRM एस्केलेशन डेस्क पर दिखेगा।',
    escalateNote: 'नियंत्रण को निर्णय क्यों चाहिए',
    escalateRequired: 'नोट आवश्यक है।',
    escalateConfirm: 'एस्केलेट करें',
    escalatedToast: 'एस्केलेट किया गया',
    escalatedBody: 'DRM एस्केलेशन डेस्क को भेजा गया',
    cancel: 'रद्द करें',
    minUnit: 'मिनट',
    hourUnit: 'घं',
  },
} as const;

type Key = keyof typeof strings.en;

const kindFromCategory = (c: ReportCategory): EventKind => (c === 'ohe' || c === 'fire' ? 'ohe' : c === 'signal' || c === 'lc' ? 'signal' : 'rail');
const win = (b: Block) => `${hhmm(b.start)}–${hhmm(b.end)}`;
const compliance = (k: Kpis) => (k.mandatoryTotal ? k.mandatoryCompliant / k.mandatoryTotal : null);

export default function ReplanPage() {
  const snapshot = useAppStore((s) => s.snapshot);
  const [params] = useSearchParams();
  const reportId = params.get('incident') ?? params.get('report');
  if (!snapshot) return <PlanPending />;
  return <Replan key={reportId ?? 'none'} snapshot={snapshot} reportId={reportId} />;
}

function Replan({ snapshot, reportId }: { snapshot: Snapshot; reportId: string | null }) {
  const t = useT(strings);
  const nav = useNavigate();
  const drawer = useDrawerParams();

  const user = useAppStore((s) => s.user);
  const approvals = useAppStore((s) => s.approvals);
  const executionLog = useAppStore((s) => s.executionLog);
  const reports = useAppStore((s) => s.reports);
  const scenarioState = useAppStore((s) => s.scenario);
  const candidate = useAppStore((s) => s.candidate);
  const candidateStatus = useAppStore((s) => s.candidateStatus);
  const candidateProgress = useAppStore((s) => s.candidateProgress);
  const candidateError = useAppStore((s) => s.candidateError);
  const runCandidate = useAppStore((s) => s.runCandidate);
  const promoteCandidate = useAppStore((s) => s.promoteCandidate);
  const discardCandidate = useAppStore((s) => s.discardCandidate);
  const escalate = useAppStore((s) => s.escalate);
  const notify = useAppStore((s) => s.notify);
  const toast = useAppStore((s) => s.toast);

  const corridor = snapshot.corridor;
  const canGrant = can(user, 'grant');
  const seedReport: HazardReport | undefined = reportId ? reports.find((r) => r.id === reportId && r.corridorId === corridor.id) : undefined;

  /* ── event form (prefilled once from ?incident= / ?report=) ── */
  const [kind, setKind] = useState<EventKind>(() => (seedReport ? kindFromCategory(seedReport.category) : 'ohe'));
  const [workType, setWorkType] = useState<string>(() => DEFAULT_WORK[seedReport ? (kindFromCategory(seedReport.category) as InjectKind) : 'ohe']);
  const [tsr, setTsr] = useState(() => defaultTsr(DEFAULT_WORK[seedReport ? (kindFromCategory(seedReport.category) as InjectKind) : 'ohe']));
  const [station, setStation] = useState('');
  const [fromKm, setFromKm] = useState(() => (seedReport?.km !== undefined ? seedReport.km.toFixed(1) : ''));
  const [toKm, setToKm] = useState(() => (seedReport?.km !== undefined ? seedReport.km.toFixed(1) : ''));
  const [line, setLine] = useState<Line>(() => seedReport?.line ?? 'UP');
  const [machineId, setMachineId] = useState('');
  const [premLine, setPremLine] = useState<RunLine>('DN');
  const [premDep, setPremDep] = useState(() => hhmm(nowMinuteIST()));
  const [trainId, setTrainId] = useState('');
  const [surge, setSurge] = useState(SURGE_OPTIONS[1]);
  const [note, setNote] = useState(() => (seedReport ? `${seedReport.id}: ${seedReport.description}` : ''));
  const [showKept, setShowKept] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);

  const changeKind = (k: EventKind) => {
    setKind(k);
    if (isInject(k)) changeWork(DEFAULT_WORK[k]);
  };
  const changeWork = (wt: string) => {
    setWorkType(wt);
    setTsr(defaultTsr(wt));
  };
  const pickStation = (code: string) => {
    setStation(code);
    const st = corridor.stations.find((s) => s.code === code);
    if (st) {
      setFromKm(st.km.toFixed(1));
      setToKm(st.km.toFixed(1));
    }
  };

  /* ── validation + event → scenario ─────────────────────── */
  const a = Number(fromKm);
  const b = Number(toKm);
  const v = Number(tsr);
  const kmErr = isInject(kind) && (fromKm.trim() === '' || toKm.trim() === '' || !Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b > corridor.lengthKm || a > b);
  const tsrErr = isInject(kind) && tsr.trim() !== '' && (!Number.isFinite(v) || v <= 0 || v >= corridor.mpsKmph);
  const machineErr = kind === 'machine' && !machineId;
  const trainErr = kind === 'cancel' && !trainId;
  const timeErr = kind === 'premium' && !/^\d{2}:\d{2}$/.test(premDep);
  const invalid = kmErr || tsrErr || machineErr || trainErr || timeErr;

  const buildEvent = (): { scenario: Scenario; label: string } => {
    if (isInject(kind)) {
      const wt = WT[workType];
      const label = `${t(`kind_${kind}` as Key)} · ${kmRange(a, b)} ${line}`;
      return { label, scenario: { injectTasks: [{ sourceId: `DISRUPTION/${kind.toUpperCase()}${seedReport ? `/${seedReport.id}` : ''}`, label: `${wt?.label ?? workType} — ${t(`kind_${kind}` as Key)}`, workType, line, startKm: a, endKm: b, daysOverdue: 0, tsrKmph: tsr.trim() ? v : undefined, note: note.trim() || undefined }] } };
    }
    if (kind === 'machine') {
      const m = snapshot.feeds.machines.find((x) => x.id === machineId);
      return { label: `${t('kind_machine')} · ${m?.label ?? machineId}`, scenario: { removeMachines: [machineId] } };
    }
    if (kind === 'premium') return { label: `${t('kind_premium')} · ${premLine} ${premDep}`, scenario: { addPremiumTrain: { line: premLine, dep: toMin(premDep) } } };
    if (kind === 'cancel') {
      const tr = snapshot.feeds.timetable.find((x) => x.id === trainId);
      return { label: `${t('kind_cancel')} · ${tr ? `${tr.number} ${tr.name}` : trainId}`, scenario: { cancelTrains: [trainId] } };
    }
    return { label: `${t('kind_surge')} · ${t('surgeOpt', { p: Math.round((surge - 1) * 100) })}`, scenario: { freightSurge: surge } };
  };

  const mergeScenario = (ev: Scenario, label: string): ScenarioState => {
    const base = scenarioState?.scenario ?? {};
    const merged: Scenario = {
      ...base,
      injectTasks: [...(base.injectTasks ?? []), ...(ev.injectTasks ?? [])],
      removeMachines: [...new Set([...(base.removeMachines ?? []), ...(ev.removeMachines ?? [])])],
      cancelTrains: [...new Set([...(base.cancelTrains ?? []), ...(ev.cancelTrains ?? [])])],
      addPremiumTrain: ev.addPremiumTrain ?? base.addPremiumTrain ?? null,
      freightSurge: ev.freightSurge ?? base.freightSurge,
    };
    return { presetId: scenarioState?.presetId ?? null, name: scenarioState ? `${scenarioState.name} + ${label}` : label, params: { ...(scenarioState?.params ?? {}), disruption: label }, scenario: merged };
  };

  /* ── derived plan state ─────────────────────────────────── */
  const allWorking = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals]);
  const startedIds = useMemo(() => new Set(executionLog.filter((r) => r.corridorId === corridor.id && r.status === 'IN_PROGRESS').map((r) => r.blockId)), [executionLog, corridor.id]);
  const contextBlocks = useMemo(() => allWorking.filter((x) => x.status === 'LOCKED' || startedIds.has(x.id)), [allWorking, startedIds]);
  const fixedKind = useMemo(() => {
    const m = new Map<string, 'started' | 'locked'>();
    for (const x of contextBlocks) m.set(x.id, startedIds.has(x.id) ? 'started' : 'locked');
    return m;
  }, [contextBlocks, startedIds]);

  const diff = useMemo(() => (candidate ? planDiff(candidate.snapshot, snapshot) : []), [candidate, snapshot]);
  const changed = useMemo(() => diff.filter((r) => r.kind !== 'kept'), [diff]);
  const rows = showKept ? diff : changed;
  const fixedMoved = changed.filter((r) => r.before && fixedKind.has(r.before.id)).length;

  const mandatoryIds = useMemo(() => new Set(snapshot.tasks.filter((x) => x.risk.mandatory).map((x) => x.id)), [snapshot]);
  const candScheduled = useMemo(() => new Set(candidate ? candidate.snapshot.result.weekly.ai.scheduled.map((s) => s.taskId) : []), [candidate]);
  const mandatoryLost = (r: PlanDiffRow) => (r.before ? r.before.tasks.filter((x) => mandatoryIds.has(x.id) && !candScheduled.has(x.id)).length : 0);

  /* ── actions ───────────────────────────────────────────── */
  const run = async () => {
    const ev = buildEvent();
    const patch: CandidatePatch = { scenario: mergeScenario(ev.scenario, ev.label) };
    await runCandidate(patch, t('reason', { event: ev.label }));
    const s = useAppStore.getState();
    if (s.candidateStatus === 'error') toast({ title: t('runFailed'), body: s.candidateError ?? undefined, tone: 'crit' });
    else if (s.candidate && s.snapshot) {
      const n = planDiff(s.candidate.snapshot, s.snapshot).filter((r) => r.kind !== 'kept').length;
      toast({ title: t('runDone'), body: t('runDoneBody', { n }), tone: n ? 'warn' : 'ok' });
    }
  };
  const apply = () => {
    if (!candidate) return;
    const n = changed.length;
    const depts = [...new Set(changed.flatMap((r) => (r.after ?? r.before)?.departments ?? []))];
    const reason = candidate.reason;
    promoteCandidate();
    notify({ portals: ['field', 'planning', ...depts.map((d) => d.toLowerCase() as PortalId)], kind: 'WARNING', title: t('notifyTitle', { time: hhmm(nowMinuteIST()), n }), body: reason, route: '/app/control/board' });
    toast({ title: t('appliedToast'), body: t('appliedBody', { n }), tone: 'ok' });
    nav('/app/control/board');
  };
  const discard = () => {
    discardCandidate();
    toast({ title: t('discardedToast'), tone: 'info' });
  };

  /* ── KPI tiles ─────────────────────────────────────────── */
  const wk = snapshot.result.weekly.kpis;
  const ck = candidate?.snapshot.result.weekly.kpis ?? null;
  const shown = ck ?? wk;
  const wc = compliance(wk);
  const sc = compliance(shown);

  /* ── diff columns ──────────────────────────────────────── */
  const cols: Column<PlanDiffRow>[] = [
    {
      key: 'block',
      header: t('colBlock'),
      render: (r) => {
        const x = r.after ?? r.before;
        if (!x) return '—';
        const fk = r.before && r.kind !== 'kept' ? fixedKind.get(r.before.id) : undefined;
        return (
          <div>
            <div className="strong">{x.sectionText}</div>
            <div className="tiny muted">
              {lineLabel(x.line)} · {kmRange(x.startKm, x.endKm)}
            </div>
            {r.before ? (
              <button className="btn btn-sm btn-ghost mono" style={{ paddingLeft: 0 }} title={t('openWorking')} onClick={() => drawer.open('block', r.before!.id)}>
                {r.before.id}
              </button>
            ) : (
              <div className="tiny">{t('newWorks', { works: x.tasks.map((w) => w.label).join(', ') })}</div>
            )}
            {fk && <Badge tone="warn" icon={<AlertTriangle size={12} />}>{fk === 'started' ? t('movesStarted') : t('movesLocked')}</Badge>}
          </div>
        );
      },
    },
    { key: 'planned', header: t('colPlanned'), render: (r) => (r.before ? <span className="mono small num">{dateLabel(r.before.date)} {win(r.before)}</span> : <span className="muted">—</span>) },
    {
      key: 'proposed',
      header: t('colProposed'),
      render: (r) => {
        if (r.kind === 'kept') return <span className="small muted">{t('keep')}</span>;
        if (r.kind === 'dropped') return <Badge tone="crit">{t('dropped')}</Badge>;
        if (!r.after) return '—';
        const text = r.kind === 'added' ? t('added', { date: dateLabel(r.after.date), window: win(r.after) }) : t('shiftTo', { date: dateLabel(r.after.date), window: win(r.after) });
        return <Badge tone={r.kind === 'added' ? 'blue' : 'warn'}>{text}</Badge>;
      },
    },
    { key: 'trains', header: t('colTrains'), num: true, render: (r) => <span className={`num ${r.trainsDelta > 0 ? 'strong' : ''}`} style={r.trainsDelta > 0 ? { color: 'var(--crit)' } : undefined}>{signed(r.trainsDelta)}</span> },
    { key: 'delay', header: t('colDelay'), num: true, hideMobile: true, render: (r) => <span className={`num ${r.delayDelta > 0 ? 'strong' : ''}`} style={r.delayDelta > 0 ? { color: 'var(--crit)' } : undefined}>{signed(r.delayDelta, 0)} {t('minUnit')}</span> },
    {
      key: 'mandatory',
      header: t('colMandatory'),
      render: (r) => {
        if (!r.before) return <span className="muted">—</span>;
        const n = mandatoryLost(r);
        return n ? <Badge tone="crit">{t('mandatoryLost', { n })}</Badge> : <span className="small">{t('mandatoryMet')}</span>;
      },
    },
  ];

  const running = candidateStatus === 'running';
  const runHint = !canGrant ? t('noRunCap') : undefined;

  return (
    <div className="stack-lg">
      <PageHeader
        title={t('title')}
        lede={t('lede')}
        badges={<SimLabel kind="solver" />}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => nav('/app/control/board')}>{t('back')}</button>
            <button className="btn" onClick={() => setEscalateOpen(true)}>
              <AlertTriangle size={14} /> {t('escalate')}
            </button>
          </>
        }
      />

      <div className="grid grid-main-aside" style={{ alignItems: 'start' }}>
        <div className="stack-lg">
          <Card tour="replan-diff">
            <CardHead
              title={t('diffTitle')}
              sub={candidate ? t('candidateOf', { reason: candidate.reason, when: timeAgo(candidate.at) }) : undefined}
              right={
                candidate ? (
                  <>
                    <SimLabel kind="solver" short />
                    <button className="btn btn-sm btn-ghost" onClick={discard}>
                      <X size={14} /> {t('discard')}
                    </button>
                    <button className="btn btn-sm btn-primary" disabled={!canGrant} title={canGrant ? undefined : t('noApplyCap')} onClick={apply}>
                      <Check size={14} /> {t('apply')}
                    </button>
                  </>
                ) : undefined
              }
            />
            <CardBody flush>
              {running ? (
                <div className="card-body row">
                  <Spinner />
                  <span className="small">{candidateProgress || t('running')}</span>
                </div>
              ) : !candidate ? (
                <EmptyState title={t('noCandidate')} />
              ) : (
                <div className="stack">
                  {fixedMoved > 0 && (
                    <div className="card-body" style={{ paddingBottom: 0 }}>
                      <Callout tone="warn">{t('fixedMoved', { n: fixedMoved })}</Callout>
                    </div>
                  )}
                  {changed.length === 0 && !showKept ? (
                    <EmptyState title={t('noChange')} />
                  ) : (
                    <DataTable<PlanDiffRow> columns={cols} rows={rows} rowKey={(r) => r.key} />
                  )}
                  <div className="card-body row-wrap" style={{ paddingTop: 0 }}>
                    {diff.length - changed.length > 0 && (
                      <button className="btn btn-sm btn-ghost" onClick={() => setShowKept(!showKept)}>
                        {showKept ? t('hideKept') : t('showKept', { n: diff.length - changed.length })}
                      </button>
                    )}
                    <span className="tiny muted grow">{t('applyNote')}</span>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          <div>
            <div className="section-title">{t('kpiTitle')}</div>
            <div className="grid grid-auto">
              <StatTile label={t('kpiHours')} value={num(shown.totalBlockHours, 1)} unit={t('hourUnit')} delta={ck ? `${signed(ck.totalBlockHours - wk.totalBlockHours, 1)} ${t('hourUnit')}` : undefined} deltaGood={ck ? ck.totalBlockHours <= wk.totalBlockHours : null} sub={ck ? t('vsWorking', { v: `${num(wk.totalBlockHours, 1)} ${t('hourUnit')}` }) : t('workingPlan')} />
              <StatTile label={t('kpiDelay')} value={num(shown.weightedDelayMin)} unit={t('minUnit')} delta={ck ? `${signed(ck.weightedDelayMin - wk.weightedDelayMin, 0)} ${t('minUnit')}` : undefined} deltaGood={ck ? ck.weightedDelayMin <= wk.weightedDelayMin : null} sub={ck ? t('vsWorking', { v: `${num(wk.weightedDelayMin)} ${t('minUnit')}` }) : t('workingPlan')} />
              <StatTile
                label={t('kpiMandatory')}
                value={sc === null ? '—' : pct(sc)}
                delta={ck && sc !== null && wc !== null ? `${signed((sc - wc) * 100, 1)} ${t('ptsUnit')}` : undefined}
                deltaGood={ck && sc !== null && wc !== null ? sc >= wc : null}
                sub={shown.mandatoryTotal ? t('kpiMandatorySub', { done: shown.mandatoryCompliant, total: shown.mandatoryTotal }) : t('kpiNoMandatory')}
              />
              <StatTile label={t('kpiScheduled')} value={shown.tasksScheduled} delta={ck ? signed(ck.tasksScheduled - wk.tasksScheduled) : undefined} deltaGood={ck ? ck.tasksScheduled >= wk.tasksScheduled : null} sub={t('kpiScheduledSub', { n: shown.tasksScheduled, total: shown.tasksTotal })} />
            </div>
          </div>
        </div>

        <div className="stack-lg">
          <Card>
            <CardHead title={t('eventTitle')} sub={seedReport ? t('fromReport', { id: seedReport.id }) : t('eventSub')} />
            <CardBody>
              <div className="stack">
                <Field label={t('kind')}>
                  <select className="select" value={kind} onChange={(e) => changeKind(e.target.value as EventKind)}>
                    {EVENT_KINDS.map((k) => <option key={k} value={k}>{t(`kind_${k}` as Key)}</option>)}
                  </select>
                </Field>

                {isInject(kind) && (
                  <>
                    <Field label={t('workNeeded')}>
                      <select className="select" value={workType} onChange={(e) => changeWork(e.target.value)}>
                        {Object.entries(WT)
                          .filter(([, d]) => d.dept === EVENT_DEPT[kind])
                          .map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
                      </select>
                    </Field>
                    <Field label={t('station')}>
                      <select className="select" value={station} onChange={(e) => pickStation(e.target.value)}>
                        <option value="">{t('stationAny')}</option>
                        {corridor.stations.map((s) => <option key={s.code} value={s.code}>{s.code} · {s.name} (km {s.km})</option>)}
                      </select>
                    </Field>
                    <div className="grid grid-3" style={{ gap: 10 }}>
                      <Field label={t('fromKm')}>
                        <input className="input" type="number" step={0.1} value={fromKm} onChange={(e) => setFromKm(e.target.value)} />
                      </Field>
                      <Field label={t('toKm')}>
                        <input className="input" type="number" step={0.1} value={toKm} onChange={(e) => setToKm(e.target.value)} />
                      </Field>
                      <Field label={t('line')}>
                        <select className="select" value={line} onChange={(e) => setLine(e.target.value as Line)}>
                          <option value="UP">{t('lineUp')}</option>
                          <option value="DN">{t('lineDn')}</option>
                          <option value="BOTH">{t('lineBoth')}</option>
                        </select>
                      </Field>
                    </div>
                    {kmErr && (fromKm !== '' || toKm !== '') && <div className="small" style={{ color: 'var(--crit)' }}>{t('errKm', { len: corridor.lengthKm })}</div>}
                    <Field label={t('tsr')} hint={WT[workType]?.tsrKmph ? t('tsrHintDefault', { v: WT[workType].tsrKmph ?? '' }) : t('tsrHintNone')} error={tsrErr ? t('errTsr', { mps: corridor.mpsKmph }) : undefined}>
                      <input className="input" type="number" min={1} max={corridor.mpsKmph - 1} step={5} value={tsr} onChange={(e) => setTsr(e.target.value)} />
                    </Field>
                  </>
                )}

                {kind === 'machine' && (
                  <Field label={t('machine')} error={machineErr ? t('errMachine') : undefined}>
                    <select className="select" value={machineId} onChange={(e) => setMachineId(e.target.value)}>
                      <option value="">{t('machinePick')}</option>
                      {snapshot.feeds.machines.map((m) => <option key={m.id} value={m.id}>{m.label} · {m.homeStation}</option>)}
                    </select>
                  </Field>
                )}

                {kind === 'premium' && (
                  <div className="grid grid-2" style={{ gap: 10 }}>
                    <Field label={t('premLine')}>
                      <select className="select" value={premLine} onChange={(e) => setPremLine(e.target.value as RunLine)}>
                        <option value="UP">{t('lineUp')}</option>
                        <option value="DN">{t('lineDn')}</option>
                      </select>
                    </Field>
                    <Field label={t('premDep')} error={timeErr ? t('errTime') : undefined}>
                      <input className="input" type="time" value={premDep} onChange={(e) => setPremDep(e.target.value)} />
                    </Field>
                  </div>
                )}

                {kind === 'cancel' && (
                  <Field label={t('train')} error={trainErr ? t('errTrain') : undefined}>
                    <select className="select" value={trainId} onChange={(e) => setTrainId(e.target.value)}>
                      <option value="">{t('trainPick')}</option>
                      {snapshot.feeds.timetable.map((tr) => <option key={tr.id} value={tr.id}>{tr.number} · {tr.name} ({tr.line} {hhmm(tr.dep)})</option>)}
                    </select>
                  </Field>
                )}

                {kind === 'surge' && (
                  <Field label={t('surge')}>
                    <select className="select" value={surge} onChange={(e) => setSurge(Number(e.target.value))}>
                      {SURGE_OPTIONS.map((k) => <option key={k} value={k}>{t('surgeOpt', { p: Math.round((k - 1) * 100) })}</option>)}
                    </select>
                  </Field>
                )}

                <Field label={t('note')}>
                  <textarea className="textarea" rows={2} value={note} placeholder={t('notePlaceholder')} onChange={(e) => setNote(e.target.value)} />
                </Field>

                <Callout tone="neutral">
                  {t('injectedNote')}
                  {scenarioState && <div className="tiny mt">{t('mergedWith', { name: scenarioState.name })}</div>}
                </Callout>

                <button className="btn btn-primary btn-block" disabled={invalid || running || !canGrant} title={runHint} onClick={() => void run()}>
                  {running ? <Spinner /> : <Play size={15} />} {running ? t('running') : t('run')}
                </button>
                {candidateStatus === 'error' && candidateError && <Callout tone="crit">{t('runFailed')}: {candidateError}</Callout>}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHead title={t('contextTitle')} sub={t('contextSub')} />
            <CardBody tight>
              {contextBlocks.length === 0 ? (
                <div className="small muted">{t('contextEmpty')}</div>
              ) : (
                <div className="stack" style={{ gap: 6 }}>
                  {contextBlocks.map((x) => (
                    <button key={x.id} className="well" style={{ textAlign: 'left', width: '100%', padding: '8px 10px' }} onClick={() => drawer.open('block', x.id)}>
                      <div className="row">
                        <span className="strong small grow truncate">{x.sectionText}</span>
                        {fixedKind.get(x.id) === 'started' ? <Badge tone="warn">{t('started')}</Badge> : <StatusBadge status={x.status} />}
                      </div>
                      <div className="tiny muted mono">
                        {x.id} · {dateLabel(x.date)} {win(x)} · {duration(x.spanMin)} · {lineLabel(x.line)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {escalateOpen && <EscalateModal defaultRef={candidate?.reason ?? t('reason', { event: t(`kind_${kind}` as Key) })} defaultNote={note} onClose={() => setEscalateOpen(false)} onConfirm={(ref, text) => {
        escalate({ kind: 'disruption', ref, note: text });
        toast({ title: t('escalatedToast'), body: t('escalatedBody'), tone: 'warn' });
        setEscalateOpen(false);
      }} />}

      <BlockDrawer blockId={drawer.blockId} onClose={() => drawer.close('block')} />
      <TaskDrawer taskId={drawer.taskId} onClose={() => drawer.close('task')} />
    </div>
  );
}

function EscalateModal({ defaultRef, defaultNote, onClose, onConfirm }: { defaultRef: string; defaultNote: string; onClose: () => void; onConfirm: (ref: string, note: string) => void }) {
  const t = useT(strings);
  const [text, setText] = useState(defaultNote);
  const empty = !text.trim();
  return (
    <Modal
      open
      onClose={onClose}
      title={t('escalateTitle')}
      footer={
        <div className="row" style={{ justifyContent: 'flex-end', width: '100%' }}>
          <button className="btn" onClick={onClose}>{t('cancel')}</button>
          <button className="btn btn-danger" disabled={empty} title={empty ? t('escalateRequired') : undefined} onClick={() => onConfirm(defaultRef, text.trim())}>
            {t('escalateConfirm')}
          </button>
        </div>
      }
    >
      <div className="stack">
        <div className="small">{t('escalateBody')}</div>
        <div className="tiny muted">{defaultRef}</div>
        <Field label={t('escalateNote')} error={empty ? t('escalateRequired') : undefined}>
          <textarea className="textarea" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
