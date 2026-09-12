/**
 * WeeklyPlanPage — the 7-day block plan (spec §3.12).
 *   edit   (planning cell): run the optimiser, pin unplaced works, send the week to Control
 *   dept   (TMS / SMMS / TDMS): joint-block suggestions and blocks awaiting my concurrence
 *   review (control / division): read-only view with a link to the board
 * Every number comes from snapshot.result.weekly (plan vs simulated baseline).
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Calendar, CheckCircle2, Clock, Download, FileJson, Gauge, Link2, Lock, Pin, RefreshCw, RotateCcw, Send, Sparkles, Users, X } from 'lucide-react';
import { usePortal, usePortalDept } from '../../app/usePortal';
import { can, type PortalId } from '../../auth/portals';
import { useAppStore } from '../../store/useAppStore';
import { blocksToCsv, toBdmsDemand } from '../../engine/exporter.js';
import { jointSuggestions, workingBlocks, type JointSuggestion, type WorkingBlock } from '../../engine/select';
import type { Dept, Snapshot, Task } from '../../engine/types';
import { useT } from '../../i18n';
import { common } from '../../i18n/common';
import { addDaysIso, dateLabel, download, duration, kmRange, num, pct } from '../../lib/format';
import { ArciBar, Badge, Card, CardBody, CardHead, DataTable, DeptBadge, PageHeader, PlanPending, Segmented, StatTile, type Column } from '../../components/ui';
import { FormSheet, PrintButton, SeedStamp, SimLabel } from '../../components/ui/extras';
import { WeeklyGantt } from '../../components/viz/WeeklyGantt';
import { StringDiagram, freeWindowsForDay } from '../../components/viz/StringDiagram';
import { BlockDrawer } from '../../components/domain/BlockDrawer';
import { TaskDrawer } from '../../components/domain/TaskDrawer';
import { useDrawerParams } from '../../components/domain/useDrawerParams';
import { ConflictsPanel } from '../../components/domain/ConflictsPanel';
import { SafetyBanner } from '../../components/domain/SafetyBanner';
import { SolverStamp } from '../../components/domain/SolverStamp';
import { SupersededList } from '../../components/domain/SupersededList';
import { useConflictRows, useSupersededRows } from '../../components/domain/planHooks';
import { KpiStrip } from './KpiStrip';
import { FEED_SEED, FLOW_LABEL, FLOW_TONE, flowState, planStrings, type KpiKey } from './planMetrics';

export interface WeeklyPlanPageProps {
  mode?: 'edit' | 'review' | 'dept';
}

type ViewMode = 'gantt' | 'string' | 'table';

const WEEKLY_KPIS: KpiKey[] = ['availability', 'closure', 'colocation', 'mandatory', 'delay'];
const DEPTS: Dept[] = ['TMS', 'SMMS', 'TDMS'];

const strings = {
  en: {
    title: 'Weekly block plan',
    ledeEdit: 'Seven days of possessions proposed by the optimiser, what could not be placed and why, and the send-to-Control step.',
    ledeDept: 'Your department’s works in this week’s possessions: joint-block chances and blocks awaiting your concurrence.',
    ledeReview: 'Read-only view of this week’s possessions as proposed by the planning cell.',
    run: 'Run optimiser',
    running: 'Planning…',
    runHint: 'Only the block planning cell can re-plan.',
    runDone: 'Weekly plan recomputed',
    runDoneBody: '{blocks} possessions · {deferred} works deferred',
    runFailed: 'The planning engine failed',
    send: 'Send week to Control',
    sendHint: 'Every block of this week is already with Control.',
    sendNoCap: 'Only the block planning cell can send the week.',
    sentTitle: '{n} blocks sent to Control; concurrence requested',
    sentBody: 'Departments asked: {depts}',
    notifyControlTitle: '{n} blocks proposed for {from} – {to}',
    notifyControlBody: 'Sent by the planning cell. Departments are asked to concur before grant.',
    notifyDeptTitle: 'Concurrence requested on {n} blocks',
    notifyDeptBody: 'Week {from} – {to}. Open your blocks to concur or object.',
    board: 'Open control board',
    exportCsv: 'BDMS CSV',
    exportJson: 'BDMS JSON',
    exported: 'Exported {n} blocks',
    exportedBody: 'BDMS payload format; nothing is transmitted to CRIS.',
    print: 'Print week',
    viewGantt: 'Gantt',
    viewString: 'Day chart',
    viewTable: 'Table',
    rowsDay: 'Rows by day',
    rowsSection: 'Rows by section',
    allDepts: 'All departments',
    baselineGhost: 'Show baseline',
    nBlocks: '{n} possessions',
    day: 'Plan day',
    ganttTitle: 'Week at a glance',
    ganttSub: 'Bars in department colours; stacked stripes are joint blocks. Click a bar to open the block.',
    stringTitle: 'Train graph · {day}',
    stringSub: 'Timetabled paths, planned blocks and free windows of at least {min} min outside the {margin} min headway margin.',
    tableTitle: 'Possession programme',
    tableSub: 'Every possession this week with its workflow state. Click a row to open the block.',
    colDay: 'Day',
    colBlock: 'Block',
    colSection: 'Section / km',
    colLine: 'Line',
    colWindow: 'Window',
    colDepts: 'Departments',
    colState: 'State',
    colImpact: 'Traffic impact',
    colResources: 'Machine / gang',
    impact: '{trains} trains · {min} min',
    joint: 'Joint',
    none: '—',
    noBlocks: 'No possessions match this filter.',
    unschedTitle: 'Unscheduled',
    unschedSub: 'Works the optimiser could not place this week, with the engine’s reason.',
    colWork: 'Work',
    colArci: 'ARCI',
    colReason: 'Reason',
    colAction: 'Action',
    pin: 'Pin & re-plan',
    pinHint: 'Raises the work to the mandatory floor for the next run; the optimiser chooses the block.',
    pinned: 'Pinned {id}; re-planning',
    pinnedBody: 'The next run places it at the mandatory floor.',
    everythingPlaced: 'Everything placed.',
    jointTitle: 'Joint block suggestions',
    jointSub: 'Works that fit an existing block of another department on the same section and line.',
    openBlock: 'Open block',
    acceptJoin: 'Accept join',
    acceptJoinHint: 'Co-locate this work into the block and re-plan',
    joinAccepted: 'Joint block accepted',
    requestJoin: 'Request join',
    requestJoinHint: 'Sends the suggestion to the planning cell',
    joinRequested: 'Join request sent to the planning cell',
    joinNotifyTitle: 'Join requested: {task} → {block}',
    dismiss: 'Dismiss',
    dismissed: 'Suggestion dismissed',
    noJoint: 'No joint block fits your open tasks this week.',
    awaitTitle: 'Awaiting my concurrence',
    awaitSub: 'Blocks sent by the planning cell that include {dept} works.',
    concur: 'Concur',
    concurred: 'Concurred on {id}',
    concurNoCap: 'Your role cannot concur for this department.',
    noAwait: 'Nothing is awaiting your concurrence.',
    printTitle: 'Weekly block plan · {corridor}',
    printRange: 'Plan week {from} – {to}',
    sendNothing: 'No block was sent — the drafts changed since the page loaded. Re-open the week.',
    confTile: 'Mean block confidence',
    confSub: 'Completion × window reliability over {n} blocks',
    confNone: 'Not computed in this run',
    supersededTitle: 'Changed after sending',
    supersededSub: 'Sent proposals the last re-plan changed. Send the replacement block again for concurrence.',
    conflictsTitle: 'Conflicts & dependencies',
    conflictsSub: 'Everything standing in the way of this week, grouped by severity. Rows open the block or the work.',
    conflictsCount: '{n} open',
  },
  hi: {
    title: 'साप्ताहिक ब्लॉक योजना',
    ledeEdit: 'ऑप्टिमाइज़र द्वारा प्रस्तावित सात दिन के पज़ेशन, जो नहीं रखे जा सके और क्यों, तथा कंट्रोल को भेजने का चरण।',
    ledeDept: 'इस सप्ताह के पज़ेशन में आपके विभाग के कार्य: संयुक्त block के अवसर और आपकी सहमति की प्रतीक्षा वाले block।',
    ledeReview: 'योजना प्रकोष्ठ द्वारा प्रस्तावित इस सप्ताह के पज़ेशन — केवल देखने हेतु।',
    run: 'ऑप्टिमाइज़र चलाएँ',
    running: 'योजना बन रही है…',
    runHint: 'केवल ब्लॉक योजना प्रकोष्ठ पुनः योजना बना सकता है।',
    runDone: 'साप्ताहिक योजना पुनः गणित',
    runDoneBody: '{blocks} पज़ेशन · {deferred} कार्य स्थगित',
    runFailed: 'योजना इंजन विफल',
    send: 'सप्ताह कंट्रोल को भेजें',
    sendHint: 'इस सप्ताह के सभी block पहले से कंट्रोल के पास हैं।',
    sendNoCap: 'केवल ब्लॉक योजना प्रकोष्ठ सप्ताह भेज सकता है।',
    sentTitle: '{n} block कंट्रोल को भेजे गए; सहमति मांगी गई',
    sentBody: 'पूछे गए विभाग: {depts}',
    notifyControlTitle: '{from} – {to} के लिए {n} block प्रस्तावित',
    notifyControlBody: 'योजना प्रकोष्ठ द्वारा भेजे गए। प्रदान से पहले विभागों से सहमति मांगी गई है।',
    notifyDeptTitle: '{n} block पर सहमति मांगी गई',
    notifyDeptBody: 'सप्ताह {from} – {to}। सहमति या आपत्ति हेतु अपने block खोलें।',
    board: 'कंट्रोल बोर्ड खोलें',
    exportCsv: 'BDMS CSV',
    exportJson: 'BDMS JSON',
    exported: '{n} block निर्यात किए गए',
    exportedBody: 'BDMS पेलोड प्रारूप; CRIS को कुछ नहीं भेजा जाता।',
    print: 'सप्ताह प्रिंट करें',
    viewGantt: 'गैंट',
    viewString: 'दिन चार्ट',
    viewTable: 'तालिका',
    rowsDay: 'दिन अनुसार पंक्तियाँ',
    rowsSection: 'सेक्शन अनुसार पंक्तियाँ',
    allDepts: 'सभी विभाग',
    baselineGhost: 'आधार-रेखा दिखाएँ',
    nBlocks: '{n} पज़ेशन',
    day: 'योजना दिन',
    ganttTitle: 'सप्ताह एक नज़र में',
    ganttSub: 'विभाग रंगों में पट्टियाँ; परतदार पट्टियाँ संयुक्त block हैं। block खोलने हेतु पट्टी पर क्लिक करें।',
    stringTitle: 'ट्रेन ग्राफ़ · {day}',
    stringSub: 'समय-सारणी पथ, नियोजित block और {margin} मिनट हेडवे मार्जिन के बाहर कम से कम {min} मिनट की मुक्त विंडो।',
    tableTitle: 'पज़ेशन कार्यक्रम',
    tableSub: 'इस सप्ताह का हर पज़ेशन उसकी वर्कफ़्लो स्थिति सहित। block खोलने हेतु पंक्ति पर क्लिक करें।',
    colDay: 'दिन',
    colBlock: 'Block',
    colSection: 'सेक्शन / कि.मी.',
    colLine: 'लाइन',
    colWindow: 'विंडो',
    colDepts: 'विभाग',
    colState: 'स्थिति',
    colImpact: 'यातायात प्रभाव',
    colResources: 'मशीन / गैंग',
    impact: '{trains} ट्रेन · {min} मिनट',
    joint: 'संयुक्त',
    none: '—',
    noBlocks: 'इस फ़िल्टर से कोई पज़ेशन मेल नहीं खाता।',
    unschedTitle: 'अनिर्धारित',
    unschedSub: 'वे कार्य जिन्हें ऑप्टिमाइज़र इस सप्ताह नहीं रख सका, इंजन के कारण सहित।',
    colWork: 'कार्य',
    colArci: 'ARCI',
    colReason: 'कारण',
    colAction: 'कार्रवाई',
    pin: 'पिन करें व पुनः योजना',
    pinHint: 'अगले run के लिए कार्य को अनिवार्य फ़्लोर पर उठाता है; block ऑप्टिमाइज़र चुनता है।',
    pinned: '{id} पिन किया गया; पुनः योजना जारी',
    pinnedBody: 'अगला run इसे अनिवार्य फ़्लोर पर रखेगा।',
    everythingPlaced: 'सभी कार्य रखे गए।',
    jointTitle: 'संयुक्त block सुझाव',
    jointSub: 'वे कार्य जो उसी सेक्शन व लाइन पर किसी दूसरे विभाग के मौजूदा block में समा सकते हैं।',
    openBlock: 'Block खोलें',
    acceptJoin: 'संयुक्त ब्लॉक स्वीकारें',
    acceptJoinHint: 'इस कार्य को ब्लॉक में शामिल कर पुनः योजना बनाएं',
    joinAccepted: 'संयुक्त ब्लॉक स्वीकृत',
    requestJoin: 'जोड़ने का अनुरोध',
    requestJoinHint: 'सुझाव योजना प्रकोष्ठ को भेजता है',
    joinRequested: 'जोड़ने का अनुरोध योजना प्रकोष्ठ को भेजा गया',
    joinNotifyTitle: 'जोड़ने का अनुरोध: {task} → {block}',
    dismiss: 'हटाएँ',
    dismissed: 'सुझाव हटाया गया',
    noJoint: 'इस सप्ताह आपके खुले कार्यों के लिए कोई संयुक्त block उपयुक्त नहीं।',
    awaitTitle: 'मेरी सहमति की प्रतीक्षा',
    awaitSub: 'योजना प्रकोष्ठ द्वारा भेजे गए block जिनमें {dept} कार्य हैं।',
    concur: 'सहमति दें',
    concurred: '{id} पर सहमति दर्ज',
    concurNoCap: 'आपकी भूमिका इस विभाग की ओर से सहमति नहीं दे सकती।',
    noAwait: 'आपकी सहमति की प्रतीक्षा में कुछ नहीं।',
    printTitle: 'साप्ताहिक ब्लॉक योजना · {corridor}',
    printRange: 'योजना सप्ताह {from} – {to}',
    sendNothing: 'कोई block नहीं भेजा गया — पेज खुलने के बाद ड्राफ़्ट बदल गए। सप्ताह फिर खोलें।',
    confTile: 'औसत block विश्वसनीयता',
    confSub: '{n} block पर पूर्णता × खिड़की विश्वसनीयता',
    confNone: 'इस run में गणित नहीं',
    supersededTitle: 'भेजने के बाद बदले',
    supersededSub: 'भेजे गए प्रस्ताव जिन्हें पिछली पुनः योजना ने बदला। विकल्प block सहमति हेतु फिर से भेजें।',
    conflictsTitle: 'टकराव व निर्भरताएँ',
    conflictsSub: 'इस सप्ताह की हर बाधा, गंभीरता अनुसार। पंक्तियाँ block या कार्य खोलती हैं।',
    conflictsCount: '{n} खुले',
  },
} as const;

export default function WeeklyPlanPage({ mode }: WeeklyPlanPageProps) {
  const snapshot = useAppStore((s) => s.snapshot);
  if (!snapshot) return <PlanPending />;
  return <WeeklyBody snapshot={snapshot} modeProp={mode} />;
}

function WeeklyBody({ snapshot, modeProp }: { snapshot: Snapshot; modeProp?: WeeklyPlanPageProps['mode'] }) {
  const t = useT(strings);
  const tk = useT(planStrings);
  const tc = useT(common);
  const nav = useNavigate();
  const portal = usePortal();
  const portalDept = usePortalDept();
  const drawer = useDrawerParams();

  const user = useAppStore((s) => s.user);
  const approvals = useAppStore((s) => s.approvals);
  const planStatus = useAppStore((s) => s.planStatus);
  const planVersion = useAppStore((s) => s.planVersion);
  const runPlan = useAppStore((s) => s.runPlan);
  const proposeBlocks = useAppStore((s) => s.proposeBlocks);
  const pinTask = useAppStore((s) => s.pinTask);
  const acceptJointBlock = useAppStore((s) => s.acceptJointBlock);
  const concur = useAppStore((s) => s.concur);
  const notify = useAppStore((s) => s.notify);
  const toast = useAppStore((s) => s.toast);

  const mode: 'edit' | 'review' | 'dept' = modeProp ?? (portalDept ? 'dept' : portal === 'control' || portal === 'division' ? 'review' : 'edit');
  const canPlan = can(user, 'plan');
  const canConcur = portalDept ? can(user, `concur:${portalDept}` as const) : false;

  const weekly = snapshot.result.weekly;
  const rules = snapshot.result.rules;
  const corridor = snapshot.corridor;
  const lastDay = Math.max(0, weekly.occupancy.length - 1);
  const planEnd = addDaysIso(snapshot.planStart, weekly.kpis.days - 1);
  const deptName = (d: Dept) => tc(d === 'TMS' ? 'tms' : d === 'SMMS' ? 'smms' : 'tdms');

  const [view, setView] = useState<ViewMode>(drawer.day !== null ? 'string' : 'gantt');
  const [ganttRows, setGanttRows] = useState<'day' | 'section'>('day');
  const [deptFilter, setDeptFilter] = useState<Dept | 'ALL'>(portalDept ?? 'ALL');
  const [showBaseline, setShowBaseline] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const selectedDay = Math.min(lastDay, Math.max(0, drawer.day ?? 0));

  const allBlocks = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals]);
  const filteredBlocks = useMemo(() => (deptFilter === 'ALL' ? allBlocks : allBlocks.filter((b) => b.departments.includes(deptFilter))), [allBlocks, deptFilter]);
  const drafts = useMemo(() => allBlocks.filter((b) => flowState(b) === 'DRAFT'), [allBlocks]);
  const tasksById = useMemo(() => new Map(snapshot.tasks.map((x) => [x.id, x])), [snapshot]);

  const selectedBlockId = useMemo(() => {
    if (drawer.blockId) return drawer.blockId;
    if (!drawer.taskId) return null;
    return allBlocks.find((b) => b.tasks.some((x) => x.id === drawer.taskId))?.id ?? null;
  }, [drawer.blockId, drawer.taskId, allBlocks]);

  // Day chart inputs
  const occ = weekly.occupancy[selectedDay];
  const dayTrains = useMemo(() => {
    if (!occ) return [];
    return [...snapshot.feeds.timetable.filter((tr) => tr.runsOn?.[occ.dow]), ...snapshot.feeds.freight.filter((f) => f.day === selectedDay)];
  }, [snapshot, occ, selectedDay]);
  const dayBlocks = useMemo(() => filteredBlocks.filter((b) => b.day === selectedDay), [filteredBlocks, selectedDay]);
  const baselineDayBlocks = useMemo(() => weekly.baseline.blocks.filter((b) => b.day === selectedDay), [weekly, selectedDay]);
  const freeWindows = useMemo(() => (occ ? freeWindowsForDay(occ, corridor, rules.minBlockMin, rules.headwayMarginMin) : []), [occ, corridor, rules.minBlockMin, rules.headwayMarginMin]);

  // Unscheduled tray
  const deferredRows = useMemo(
    () =>
      weekly.ai.deferred
        .map((d) => ({ d, task: tasksById.get(d.taskId) }))
        .filter((r): r is { d: (typeof weekly.ai.deferred)[number]; task: Task } => !!r.task)
        .filter((r) => deptFilter === 'ALL' || r.task.dept === deptFilter),
    [weekly, tasksById, deptFilter]
  );

  // Joint suggestions (own department in dept mode, else the filter)
  const jointList: JointSuggestion[] = useMemo(() => {
    const depts: Dept[] = portalDept ? [portalDept] : deptFilter === 'ALL' ? DEPTS : [deptFilter];
    return depts.flatMap((d) => jointSuggestions(snapshot, allBlocks, d)).filter((j) => !dismissed.includes(`${j.task.id}:${j.block.id}`));
  }, [snapshot, allBlocks, portalDept, deptFilter, dismissed]);

  // Dept: awaiting my concurrence
  const awaiting = useMemo(
    () => (portalDept ? allBlocks.filter((b) => b.departments.includes(portalDept) && b.state === 'PROPOSED' && !b.approval?.concur[portalDept]) : []),
    [allBlocks, portalDept]
  );

  const conflictRows = useConflictRows(snapshot, allBlocks);
  const supersededRows = useSupersededRows(snapshot, allBlocks);
  const meanConf = weekly.kpis.meanBlockConfidence;
  const confBlocks = weekly.ai.blocks.filter((b) => !!b.confidence).length;

  /* ── actions ─────────────────────────────────────────────── */
  const running = planStatus === 'running';

  const handleRun = async () => {
    await runPlan({ reason: 'weekly plan' });
    const s = useAppStore.getState();
    if (s.planStatus === 'error') toast({ title: t('runFailed'), body: s.planError ?? undefined, tone: 'crit' });
    else if (s.snapshot) toast({ title: t('runDone'), body: t('runDoneBody', { blocks: s.snapshot.result.weekly.kpis.blockCount, deferred: s.snapshot.result.weekly.kpis.tasksDeferred }), tone: 'ok' });
  };

  const handleSend = () => {
    if (!drafts.length || !canPlan) return;
    const ids = drafts.map((b) => b.id);
    const n = proposeBlocks(ids);
    if (!n) {
      // the store toasts a missing role or sign-in; zero here means none of the drafts could still be sent
      if (can(useAppStore.getState().user, 'plan')) toast({ title: t('sendNothing'), tone: 'warn' });
      return;
    }
    const from = dateLabel(snapshot.planStart);
    const to = dateLabel(planEnd);
    notify({ portals: ['control'], kind: 'ACTION', title: t('notifyControlTitle', { n, from, to }), body: t('notifyControlBody'), route: '/app/control/handoff' });
    const depts = DEPTS.filter((d) => drafts.some((b) => b.departments.includes(d)));
    for (const d of depts) {
      const n = drafts.filter((b) => b.departments.includes(d)).length;
      notify({ portals: [d.toLowerCase() as PortalId], dept: d, kind: 'ACTION', title: t('notifyDeptTitle', { n }), body: t('notifyDeptBody', { from, to }), route: `/app/${d.toLowerCase()}/blocks` });
    }
    toast({ title: t('sentTitle', { n }), body: t('sentBody', { depts: depts.map(deptName).join(', ') }), tone: 'ok' });
    nav('/app/planning/handoff');
  };

  const handlePin = (task: Task) => {
    pinTask(task.id);
    toast({ title: t('pinned', { id: task.id }), body: t('pinnedBody'), tone: 'ok' });
    void runPlan({ reason: `pinned ${task.id}` });
  };

  const handleConcur = (b: WorkingBlock) => {
    if (!portalDept || !canConcur) return;
    if (concur(b.id, portalDept)) toast({ title: t('concurred', { id: b.id }), body: `${b.sectionText} · ${b.startText}–${b.endText}`, tone: 'ok' });
  };

  const handleAcceptJoin = async (j: JointSuggestion) => {
    await acceptJointBlock({ task: j.task, block: j.block });
    toast({ title: t('joinAccepted'), body: `${j.task.id} → ${j.block.id}`, tone: 'ok' });
  };

  const handleRequestJoin = (j: JointSuggestion) => {
    notify({ portals: ['planning'], dept: j.task.dept, kind: 'ACTION', title: t('joinNotifyTitle', { task: j.task.id, block: j.block.id }), body: j.reason, route: `/app/planning/weekly?block=${j.block.id}` });
    toast({ title: t('joinRequested'), body: `${j.task.id} → ${j.block.id}`, tone: 'ok' });
  };

  const handleDismiss = (j: JointSuggestion) => {
    setDismissed((d) => [...d, `${j.task.id}:${j.block.id}`]);
    toast({ title: t('dismissed'), body: `${j.task.id} → ${j.block.id}`, tone: 'info' });
  };

  const handleExportCsv = () => {
    download(`${corridor.code}-weekly-${snapshot.planStart}.csv`, blocksToCsv(filteredBlocks, corridor), 'text/csv');
    toast({ title: t('exported', { n: filteredBlocks.length }), body: t('exportedBody'), tone: 'ok' });
  };

  const handleExportJson = () => {
    const payload = filteredBlocks.map((b) => toBdmsDemand(b, corridor, snapshot.planStart));
    download(`${corridor.code}-weekly-${snapshot.planStart}.json`, JSON.stringify(payload, null, 2), 'application/json');
    toast({ title: t('exported', { n: filteredBlocks.length }), body: t('exportedBody'), tone: 'ok' });
  };

  /* ── columns ─────────────────────────────────────────────── */
  const blockColumns: Column<WorkingBlock>[] = [
    { key: 'day', header: t('colDay'), render: (b) => <span className="small">{dateLabel(b.date)}</span> },
    {
      key: 'block',
      header: t('colBlock'),
      render: (b) => (
        <div className="stack" style={{ gap: 2 }}>
          <span className="row" style={{ gap: 6 }}>
            <span className="mono strong small">{b.id}</span>
            {b.coLocated && <Badge tone="lavender">{t('joint')}</Badge>}
            {b.state === 'LOCKED' && <Lock size={12} aria-label={tk('f_LOCKED')} />}
          </span>
          <span className="tiny muted">{b.kind}</span>
        </div>
      ),
    },
    {
      key: 'section',
      header: t('colSection'),
      hideMobile: true,
      render: (b) => (
        <div className="stack" style={{ gap: 2 }}>
          <span className="small">{b.sectionText}</span>
          <span className="tiny muted mono">{kmRange(b.startKm, b.endKm)}</span>
        </div>
      ),
    },
    { key: 'line', header: t('colLine'), render: (b) => <Badge tone="gray">{b.line}</Badge> },
    {
      key: 'window',
      header: t('colWindow'),
      render: (b) => (
        <div className="stack" style={{ gap: 2 }}>
          <span className="mono small strong">
            {b.startText}–{b.endText}
          </span>
          <span className="tiny muted">{duration(b.spanMin)}</span>
        </div>
      ),
    },
    {
      key: 'depts',
      header: t('colDepts'),
      render: (b) => (
        <div className="row-wrap" style={{ gap: 4 }}>
          {b.departments.map((d) => (
            <DeptBadge key={d} dept={d} />
          ))}
        </div>
      ),
    },
    {
      key: 'state',
      header: t('colState'),
      render: (b) => {
        const f = flowState(b);
        return <Badge tone={FLOW_TONE[f]}>{tk(FLOW_LABEL[f])}</Badge>;
      },
    },
    { key: 'impact', header: t('colImpact'), hideMobile: true, render: (b) => <span className="small num">{t('impact', { trains: b.affectedTrains.length, min: num(b.weightedDelayMin) })}</span> },
    {
      key: 'res',
      header: t('colResources'),
      hideMobile: true,
      render: (b) => (
        <div className="stack" style={{ gap: 2 }}>
          <span className="small">{b.machines.join(', ') || t('none')}</span>
          <span className="tiny muted">{b.crews.join(', ') || t('none')}</span>
        </div>
      ),
    },
  ];

  const deferredColumns: Column<{ d: (typeof weekly.ai.deferred)[number]; task: Task }>[] = [
    {
      key: 'work',
      header: t('colWork'),
      render: (r) => (
        <div className="stack" style={{ gap: 2 }}>
          <span className="small strong">{r.task.label}</span>
          <span className="tiny muted mono">
            {r.task.id} · {r.task.sectionLabel}
          </span>
        </div>
      ),
    },
    { key: 'dept', header: t('colDepts'), hideMobile: true, render: (r) => <DeptBadge dept={r.task.dept} /> },
    { key: 'arci', header: t('colArci'), render: (r) => <ArciBar value={r.d.arci} mandatory={r.task.risk.mandatory} /> },
    { key: 'reason', header: t('colReason'), render: (r) => <span className="small">{r.d.reason}</span> },
    ...(mode === 'edit'
      ? [
          {
            key: 'action',
            header: t('colAction'),
            render: (r: { task: Task }) => (
              <button
                type="button"
                className="btn btn-sm"
                disabled={!canPlan || running}
                title={canPlan ? t('pinHint') : t('runHint')}
                onClick={(e) => {
                  e.stopPropagation();
                  handlePin(r.task);
                }}
              >
                <Pin size={12} /> {t('pin')}
              </button>
            ),
          },
        ]
      : []),
  ];

  const lede = mode === 'dept' ? t('ledeDept') : mode === 'review' ? t('ledeReview') : t('ledeEdit');

  return (
    <div className="stack-lg">
      <PageHeader
        title={t('title')}
        lede={lede}
        badges={
          <>
            <Badge tone="blue">{corridor.name}</Badge>
            <Badge tone="gray" icon={<Calendar size={12} />}>
              {dateLabel(snapshot.planStart)} – {dateLabel(planEnd)}
            </Badge>
            <SeedStamp seed={FEED_SEED} runId={planVersion} iterations={weekly.ai.search.iterations} ms={snapshot.timing.ms} />
            <SolverStamp plan={weekly.ai} />
            <SimLabel kind="solver" />
          </>
        }
        actions={
          <>
            {mode === 'edit' && (
              <>
                <button type="button" className="btn btn-primary" disabled={running || !canPlan} title={canPlan ? undefined : t('runHint')} onClick={() => void handleRun()}>
                  {running ? <RefreshCw size={14} className="spin" /> : <Sparkles size={14} />} {running ? t('running') : t('run')}
                </button>
                <button type="button" className="btn" data-tour="weekly-send" disabled={!canPlan || !drafts.length} title={!canPlan ? t('sendNoCap') : drafts.length ? undefined : t('sendHint')} onClick={handleSend}>
                  <Send size={14} /> {t('send')}
                </button>
              </>
            )}
            {mode === 'review' && portal === 'control' && (
              <button type="button" className="btn btn-primary" onClick={() => nav('/app/control/board')}>
                <Clock size={14} /> {t('board')}
              </button>
            )}
            <button type="button" className="btn btn-sm" onClick={handleExportCsv} disabled={!filteredBlocks.length}>
              <Download size={13} /> {t('exportCsv')}
            </button>
            <button type="button" className="btn btn-sm" onClick={handleExportJson} disabled={!filteredBlocks.length}>
              <FileJson size={13} /> {t('exportJson')}
            </button>
            <PrintButton label={t('print')} targetId="weekly-print" />
          </>
        }
      />

      <SafetyBanner snapshot={snapshot} plan={weekly.ai} kpis={weekly.kpis} tour="weekly-safety" />

      <KpiStrip
        kpis={weekly.kpis}
        baseKpis={weekly.baseKpis}
        keys={WEEKLY_KPIS}
        runId={planVersion}
        extra={
          <StatTile
            label={t('confTile')}
            icon={<Gauge size={12} />}
            value={typeof meanConf === 'number' ? pct(meanConf, 0) : '—'}
            sub={
              <span className="row-wrap" style={{ gap: 4 }}>
                {typeof meanConf === 'number' ? t('confSub', { n: confBlocks }) : t('confNone')} <SimLabel kind="model" short />
              </span>
            }
          />
        }
      />

      <Card>
        <CardBody tight>
          <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
            <Segmented<ViewMode>
              ariaLabel={t('title')}
              value={view}
              onChange={setView}
              options={[
                { value: 'gantt', label: t('viewGantt') },
                { value: 'string', label: t('viewString') },
                { value: 'table', label: t('viewTable') },
              ]}
            />
            <div className="row-wrap">
              {view === 'gantt' && (
                <select className="select" style={{ width: 'auto' }} value={ganttRows} onChange={(e) => setGanttRows(e.target.value as 'day' | 'section')} aria-label={t('rowsDay')}>
                  <option value="day">{t('rowsDay')}</option>
                  <option value="section">{t('rowsSection')}</option>
                </select>
              )}
              {view === 'string' && (
                <select className="select" style={{ width: 'auto' }} value={selectedDay} onChange={(e) => drawer.set('day', Number(e.target.value))} aria-label={t('day')}>
                  {weekly.occupancy.map((o) => (
                    <option key={o.day} value={o.day}>
                      {dateLabel(o.date)}
                    </option>
                  ))}
                </select>
              )}
              {view !== 'table' && (
                <label className="check small">
                  <input type="checkbox" checked={showBaseline} onChange={(e) => setShowBaseline(e.target.checked)} /> {t('baselineGhost')}
                </label>
              )}
              {!portalDept && (
                <select className="select" style={{ width: 'auto' }} value={deptFilter} onChange={(e) => setDeptFilter(e.target.value as Dept | 'ALL')} aria-label={t('allDepts')}>
                  <option value="ALL">{t('allDepts')}</option>
                  {DEPTS.map((d) => (
                    <option key={d} value={d}>
                      {deptName(d)}
                    </option>
                  ))}
                </select>
              )}
              <span className="tiny muted num">{t('nBlocks', { n: filteredBlocks.length })}</span>
            </div>
          </div>
        </CardBody>
      </Card>

      {view === 'gantt' && (
        <Card>
          <CardHead title={t('ganttTitle')} sub={t('ganttSub')} right={showBaseline ? <SimLabel kind="baseline" /> : <SimLabel kind="solver" short />} />
          <CardBody flush>
            <WeeklyGantt
              blocks={allBlocks}
              planStart={snapshot.planStart}
              occupancy={weekly.occupancy}
              rows={ganttRows}
              deptFilter={deptFilter === 'ALL' ? null : deptFilter}
              selectedId={selectedBlockId}
              showBaseline={showBaseline}
              baselineBlocks={weekly.baseline.blocks}
              onBlockClick={(b) => drawer.open('block', b.id, { close: 'task' })}
            />
          </CardBody>
        </Card>
      )}

      {view === 'string' && occ && (
        <Card>
          <CardHead title={t('stringTitle', { day: dateLabel(occ.date) })} sub={t('stringSub', { min: rules.minBlockMin, margin: rules.headwayMarginMin })} right={
              <span className="row-wrap">
                <SimLabel kind="wttPositions" short />
                <SimLabel kind="seededFeed" system="COA / FOIS" seed={FEED_SEED} short />
              </span>
            }
          />
          <CardBody>
            <StringDiagram
              corridor={corridor}
              trains={dayTrains}
              blocks={dayBlocks}
              day={selectedDay}
              dow={occ.dow}
              corridorBlocks={corridor.corridorBlocks}
              freeWindows={freeWindows}
              layers={{ freeWindows: true, baseline: showBaseline }}
              baselineBlocks={baselineDayBlocks}
              height={480}
              onBlockClick={(b) => drawer.open('block', b.id, { close: 'task' })}
            />
          </CardBody>
        </Card>
      )}

      {view === 'table' && (
        <Card>
          <CardHead title={t('tableTitle')} sub={t('tableSub')} />
          <CardBody flush>
            <DataTable<WorkingBlock> rows={filteredBlocks} columns={blockColumns} rowKey={(b) => b.id} onRowClick={(b) => drawer.open('block', b.id, { close: 'task' })} selectedKey={selectedBlockId} compact empty={t('noBlocks')} />
          </CardBody>
        </Card>
      )}

      {mode === 'dept' && portalDept && (
        <Card>
          <CardHead title={t('awaitTitle')} sub={t('awaitSub', { dept: deptName(portalDept) })} icon={<CheckCircle2 size={16} />} />
          <CardBody flush>
            <DataTable<WorkingBlock>
              rows={awaiting}
              rowKey={(b) => b.id}
              onRowClick={(b) => drawer.open('block', b.id, { close: 'task' })}
              compact
              empty={t('noAwait')}
              columns={[
                blockColumns[0],
                blockColumns[1],
                blockColumns[4],
                blockColumns[5],
                {
                  key: 'concur',
                  header: t('colAction'),
                  render: (b) => (
                    <button
                      type="button"
                      className="btn btn-sm btn-ok"
                      disabled={!canConcur}
                      title={canConcur ? undefined : t('concurNoCap')}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleConcur(b);
                      }}
                    >
                      <CheckCircle2 size={12} /> {t('concur')}
                    </button>
                  ),
                },
              ]}
            />
          </CardBody>
        </Card>
      )}

      {supersededRows.length > 0 && mode !== 'dept' && (
        <Card>
          <CardHead title={t('supersededTitle')} sub={t('supersededSub')} icon={<RotateCcw size={16} />} right={<Badge tone="warn">{supersededRows.length}</Badge>} />
          <CardBody>
            <SupersededList snapshot={snapshot} blocks={allBlocks} tour="weekly-superseded" />
          </CardBody>
        </Card>
      )}

      <Card tour="weekly-conflicts">
        <CardHead title={t('conflictsTitle')} sub={t('conflictsSub')} icon={<AlertTriangle size={16} />} right={<Badge tone={conflictRows.some((c) => c.severity === 'high') ? 'crit' : conflictRows.length ? 'warn' : 'ok'}>{t('conflictsCount', { n: conflictRows.length })}</Badge>} />
        <CardBody>
          <ConflictsPanel snapshot={snapshot} blocks={allBlocks} bare />
        </CardBody>
      </Card>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card>
          <CardHead title={t('unschedTitle')} sub={t('unschedSub')} />
          <CardBody flush>
            <DataTable rows={deferredRows} columns={deferredColumns} rowKey={(r) => r.task.id} onRowClick={(r) => drawer.open('task', r.task.id, { close: 'block' })} selectedKey={drawer.taskId} compact empty={t('everythingPlaced')} />
          </CardBody>
        </Card>

        <Card>
          <CardHead title={t('jointTitle')} sub={t('jointSub')} icon={<Users size={16} />} />
          <CardBody>
            {jointList.length === 0 ? (
              <div className="empty">{t('noJoint')}</div>
            ) : (
              <div className="stack">
                {jointList.map((j) => (
                  <div key={`${j.task.id}:${j.block.id}`} className="well stack" style={{ gap: 6 }}>
                    <div className="row-wrap">
                      <DeptBadge dept={j.task.dept} />
                      <span className="small strong">{j.task.label}</span>
                      <span className="tiny muted mono">
                        {j.task.id} → {j.block.id}
                      </span>
                    </div>
                    <div className="tiny muted">{j.reason}</div>
                    <div className="row-wrap">
                      <button type="button" className="btn btn-sm" onClick={() => drawer.open('block', j.block.id, { close: 'task' })}>
                        <Link2 size={12} /> {t('openBlock')}
                      </button>
                      {canPlan ? (
                        <button type="button" className="btn btn-sm btn-primary" disabled={running} title={t('acceptJoinHint')} onClick={() => handleAcceptJoin(j)}>
                          <Users size={12} /> {t('acceptJoin')}
                        </button>
                      ) : null}
                      {mode === 'edit' ? (
                        <button type="button" className="btn btn-sm" disabled={!canPlan || running} title={canPlan ? t('pinHint') : t('runHint')} onClick={() => handlePin(j.task)}>
                          <Pin size={12} /> {t('pin')}
                        </button>
                      ) : mode === 'dept' ? (
                        <button type="button" className="btn btn-sm" title={t('requestJoinHint')} onClick={() => handleRequestJoin(j)}>
                          <Send size={12} /> {t('requestJoin')}
                        </button>
                      ) : null}
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleDismiss(j)}>
                        <X size={12} /> {t('dismiss')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="print-only">
        <FormSheet id="weekly-print" title={t('printTitle', { corridor: corridor.name })} formNo={t('printRange', { from: dateLabel(snapshot.planStart), to: dateLabel(planEnd) })}>
          <table className="tbl compact">
            <thead>
              <tr>
                <th>{t('colDay')}</th>
                <th>{t('colBlock')}</th>
                <th>{t('colSection')}</th>
                <th>{t('colLine')}</th>
                <th>{t('colWindow')}</th>
                <th>{t('colDepts')}</th>
                <th>{t('colWork')}</th>
                <th>{t('colState')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredBlocks.map((b) => (
                <tr key={b.id}>
                  <td>{dateLabel(b.date)}</td>
                  <td className="mono">{b.id}</td>
                  <td>
                    {b.sectionText} · {kmRange(b.startKm, b.endKm)}
                  </td>
                  <td>{b.line}</td>
                  <td className="mono">
                    {b.startText}–{b.endText}
                  </td>
                  <td>{b.departments.map(deptName).join(' + ')}</td>
                  <td>{b.tasks.map((x) => x.label).join('; ')}</td>
                  <td>{tk(FLOW_LABEL[flowState(b)])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </FormSheet>
      </div>

      <BlockDrawer blockId={drawer.blockId} onClose={() => drawer.close('block')} />
      <TaskDrawer taskId={drawer.taskId} onClose={() => drawer.close('task')} />
    </div>
  );
}
