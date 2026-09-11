/**
 * DeptTodayPage — /app/:dept/today and /app/:dept/resources (spec §3.19).
 * The SSE's first screen in the department's own vocabulary: overdue and
 * mandatory works, tonight's possessions with inline concurrence, the
 * department's own forms (TSRs / T/351 / power blocks), routed incidents,
 * requisitions needing action, notifications; and on the resources tab the
 * machines (7-day use from the plan) and gangs. Parameterised by the portal.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, ExternalLink, FileText, ListChecks, Power, PowerOff, Wrench } from 'lucide-react';
import { useAppStore, type ScenarioState } from '../../store/useAppStore';
import type { Dept, Machine, Task } from '../../engine/types';
import { cautionOrders, disconnectionNoticesWeek, placement, workingBlocks, type WorkingBlock } from '../../engine/select';
import { WORK_TYPES } from '../../engine/constants.js';
import { usePortal } from '../../app/usePortal';
import { can, type PortalId } from '../../auth/portals';
import { useT } from '../../i18n';
import { common, type CommonKey } from '../../i18n/common';
import { DEPT_LABEL, dateLabel, duration, kmRange, lineLabel, num, timeAgo } from '../../lib/format';
import { ArciBar, Badge, Card, CardBody, CardHead, DataTable, DeptBadge, EmptyState, PageHeader, PlanPending, StatTile, Tabs, UrgencyBadge, type Column, type Tone } from '../../components/ui';
import { BarChart } from '../../components/viz';
import { SeedStamp, SimLabel } from '../../components/ui/extras';
import { BlockDrawer } from '../../components/domain/BlockDrawer';
import { TaskDrawer } from '../../components/domain/TaskDrawer';
import { ReportDrawer } from '../../components/domain/ReportDrawer';
import { useDrawerParams } from '../../components/domain/useDrawerParams';

export interface DeptTodayPageProps {
  tab?: 'today' | 'resources';
}

/** The worker is never sent a seed by the store, so the engine default applies (engine/worker.ts). */
const ENGINE_SEED = 26027;
const MACHINE_SCENARIO = 'Machine availability (department)';
const WT = WORK_TYPES as Record<string, { label: string }>;
const DOW_KEYS: CommonKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Stat tile row: kit .grid with a one-off column template. */
const TILES = { gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' } as const;

const strings = {
  en: {
    titleTMS: 'Civil (P-Way) — today',
    titleSMMS: 'Signal & Telecom — today',
    titleTDMS: 'Traction distribution (OHE) — today',
    lede: '{corridor} · plan from {date}. Your works, tonight’s possessions and what needs your action.',
    tabToday: 'Today',
    tabResources: 'Machines and gangs',
    register: 'Register',
    requisitions: 'Requisitions',
    weekBlocks: 'Week’s blocks',
    sOverdue: 'Overdue works',
    sOverdueSub: 'of {n} in the register',
    sMandatory: 'Mandatory works',
    sMandatorySub: '{n} placed within the floor',
    sReq: 'Requisitions awaiting me',
    sReqSub: '{n} with the planning cell',
    sBlocks: 'Blocks this week',
    sBlocksSub: '{n} awaiting my concurrence',
    sTsr: 'TSRs on my section',
    sTsrSub: '{n} proposed',
    sT351: 'T/351 not reconnected',
    sT351Sub: 'This week’s S&T disconnections',
    sPower: 'Power blocks pending',
    sPowerSub: 'Isolation not yet recorded',
    sInc: 'Incidents routed',
    sIncSub: '{n} not yet verified',
    tonightTitle: 'Tonight',
    tonightSub: 'Possessions on {date} that include {dept} work',
    tonightEmpty: 'No blocks for {dept} tonight.',
    tonightNext: 'Next: {next}',
    tonightNone: 'No further block for {dept} this week.',
    colBlock: 'Block',
    colWindow: 'Window',
    colSection: 'Section',
    colJob: 'My work',
    colPartners: 'Partners',
    colState: 'State',
    colForms: 'Forms',
    colAction: '',
    stDraft: 'Draft',
    stAwaiting: 'Awaiting concurrence',
    stConcurred: 'Concurred',
    stGranted: 'Granted',
    stLocked: 'Locked',
    myConcur: 'You concurred',
    incharge: 'In-charge {name}',
    noPartner: 'Own block',
    concur: 'Concur',
    concurred: 'Concurred',
    concurredBody: '{dept} concurrence recorded for {block}',
    noConcurCap: 'Concurrence is recorded by the {officer}',
    notSent: 'Not yet sent for concurrence',
    t351: 'T/351 {s}',
    power: 'Power {s}',
    fDRAFT: 'draft',
    fISSUED: 'issued',
    fRECEIVED: 'received',
    fRECONNECTED: 'reconnected',
    fWITHDRAWN: 'withdrawn',
    fACKNOWLEDGED: 'acknowledged',
    pPENDING: 'pending',
    pDEENERGISED: 'de-energised',
    pENERGISED: 're-energised',
    awaitTitle: 'Awaiting my concurrence',
    awaitSub: 'Blocks sent to Control this week that include {dept} work',
    awaitEmpty: 'Nothing awaits your concurrence.',
    priorityTitle: 'Overdue and mandatory works',
    prioritySub: 'Highest ARCI first',
    priorityEmpty: 'No overdue or mandatory work in the register.',
    placedIn: 'Placed {date} {window}',
    notPlaced: 'Not placed this week',
    overdueBy: '{n} d overdue',
    dueIn: 'due in {n} d',
    dueToday: 'due today',
    formsTitleTMS: 'TSRs on my section',
    formsTitleSMMS: 'T/351 disconnections this week',
    formsTitleTDMS: 'Power blocks this week',
    formsSubTMS: 'Caution orders in force from the register and manual TSRs',
    formsSubSMMS: 'One notice per S&T work nested in a block',
    formsSubTDMS: 'Isolation record per block with OHE work',
    formsEmptyTMS: 'No TSR in force on your section.',
    formsEmptySMMS: 'No S&T disconnection this week.',
    formsEmptyTDMS: 'No power block this week.',
    openForms: 'Open forms',
    kmph: '{v} km/h',
    lifting: 'Lifted by {block}',
    proposedTsr: 'Proposed',
    incTitle: 'Incidents routed to {dept}',
    incSub: 'Reports not yet converted or closed',
    incEmpty: 'No open reports for {dept}.',
    acknowledge: 'Acknowledge',
    acknowledged: 'Incident acknowledged',
    acknowledgedBody: '{id} verified by {dept}',
    noTriage: 'Acknowledging needs the triage capability ({officer})',
    openIncidents: 'Open incidents',
    reqTitle: 'Requisitions',
    reqSub: 'Returned or draft need your action; submitted wait for the planning cell',
    reqEmpty: 'No requisitions yet — raise one from the Register.',
    rRETURNED: 'Returned',
    rDRAFT: 'Draft',
    rSUBMITTED: 'Submitted',
    notesTitle: 'Notifications',
    notesEmpty: 'Nothing new for this portal.',
    markAll: 'Mark all read',
    open: 'Open',
    machinesTitle: 'Machines and tower wagons',
    machinesSub: 'Hours booked by the plan on each of the seven days',
    machinesEmpty: 'S&T works need no track machine in this plan. Units are listed below.',
    home: 'Home {st}',
    health: 'Health {v} %',
    sinceOh: '{v} h since overhaul',
    speed: '{v} km/h',
    usedIn: 'Booked in {n} works this week',
    unused: 'Not booked this week',
    unavailFeed: 'Off days {from}–{to}: {reason}',
    offByYou: 'Marked unavailable',
    markOff: 'Mark unavailable',
    markOn: 'Mark available',
    noResCap: 'Machine status is set by department staff or the planning cell',
    machineOff: '{m} marked unavailable — plan re-run',
    machineOn: '{m} back in service — plan re-run',
    notifyOff: '{m} unavailable ({dept})',
    notifyOn: '{m} back in service ({dept})',
    notifyBody: 'Marked by {by}. The plan was re-run; blocks using it were re-placed.',
    hours: 'Hours',
    gangsTitle: 'Gangs and units',
    gangsSub: 'Roster from the seeded feed, hours from this week’s plan',
    colGang: 'Gang / unit',
    colBase: 'Base',
    colReach: 'Reach',
    colStrength: 'Strength',
    colShift: 'Max per day',
    colRest: 'Rest day',
    colPlanned: 'Planned this week',
    colNext: 'Next assignment',
    none: '—',
  },
  hi: {
    titleTMS: 'सिविल (P-Way) — आज',
    titleSMMS: 'सिग्नल व दूरसंचार — आज',
    titleTDMS: 'कर्षण वितरण (OHE) — आज',
    lede: '{corridor} · {date} से योजना। आपके कार्य, आज रात के पज़ेशन और आपकी कार्रवाई की प्रतीक्षा में मदें।',
    tabToday: 'आज',
    tabResources: 'मशीनें और गैंग',
    register: 'रजिस्टर',
    requisitions: 'Requisitions',
    weekBlocks: 'सप्ताह के ब्लॉक',
    sOverdue: 'अतिदेय कार्य',
    sOverdueSub: 'रजिस्टर के {n} में से',
    sMandatory: 'अनिवार्य कार्य',
    sMandatorySub: '{n} फ़्लोर के भीतर नियोजित',
    sReq: 'मेरी प्रतीक्षा में requisitions',
    sReqSub: '{n} योजना प्रकोष्ठ के पास',
    sBlocks: 'इस सप्ताह ब्लॉक',
    sBlocksSub: '{n} मेरी सहमति की प्रतीक्षा में',
    sTsr: 'मेरे सेक्शन पर TSR',
    sTsrSub: '{n} प्रस्तावित',
    sT351: 'T/351 पुनः संयोजित नहीं',
    sT351Sub: 'इस सप्ताह के S&T डिस्कनेक्शन',
    sPower: 'लंबित पावर ब्लॉक',
    sPowerSub: 'आइसोलेशन अभी दर्ज नहीं',
    sInc: 'भेजी गई घटनाएँ',
    sIncSub: '{n} अभी सत्यापित नहीं',
    tonightTitle: 'आज रात',
    tonightSub: '{date} के पज़ेशन जिनमें {dept} कार्य है',
    tonightEmpty: 'आज रात {dept} के लिए कोई ब्लॉक नहीं।',
    tonightNext: 'अगला: {next}',
    tonightNone: 'इस सप्ताह {dept} के लिए और कोई ब्लॉक नहीं।',
    colBlock: 'ब्लॉक',
    colWindow: 'समय-खिड़की',
    colSection: 'सेक्शन',
    colJob: 'मेरा कार्य',
    colPartners: 'सहयोगी',
    colState: 'स्थिति',
    colForms: 'प्रपत्र',
    colAction: '',
    stDraft: 'मसौदा',
    stAwaiting: 'सहमति की प्रतीक्षा',
    stConcurred: 'सहमति प्राप्त',
    stGranted: 'प्रदान',
    stLocked: 'लॉक',
    myConcur: 'आपने सहमति दी',
    incharge: 'प्रभारी {name}',
    noPartner: 'स्वयं का ब्लॉक',
    concur: 'सहमति दें',
    concurred: 'सहमति दर्ज',
    concurredBody: '{block} के लिए {dept} सहमति दर्ज',
    noConcurCap: 'सहमति {officer} द्वारा दर्ज होती है',
    notSent: 'अभी सहमति हेतु नहीं भेजा गया',
    t351: 'T/351 {s}',
    power: 'पावर {s}',
    fDRAFT: 'मसौदा',
    fISSUED: 'जारी',
    fRECEIVED: 'प्राप्त',
    fRECONNECTED: 'पुनः संयोजित',
    fWITHDRAWN: 'वापस',
    fACKNOWLEDGED: 'स्वीकृत',
    pPENDING: 'लंबित',
    pDEENERGISED: 'डी-एनर्जाइज़्ड',
    pENERGISED: 'पुनः एनर्जाइज़्ड',
    awaitTitle: 'मेरी सहमति की प्रतीक्षा',
    awaitSub: 'इस सप्ताह Control को भेजे गए ब्लॉक जिनमें {dept} कार्य है',
    awaitEmpty: 'आपकी सहमति की कोई प्रतीक्षा नहीं।',
    priorityTitle: 'अतिदेय और अनिवार्य कार्य',
    prioritySub: 'सबसे ऊँचा ARCI पहले',
    priorityEmpty: 'रजिस्टर में कोई अतिदेय या अनिवार्य कार्य नहीं।',
    placedIn: '{date} {window} नियोजित',
    notPlaced: 'इस सप्ताह नियोजित नहीं',
    overdueBy: '{n} दिन अतिदेय',
    dueIn: '{n} दिन में देय',
    dueToday: 'आज देय',
    formsTitleTMS: 'मेरे सेक्शन पर TSR',
    formsTitleSMMS: 'इस सप्ताह T/351 डिस्कनेक्शन',
    formsTitleTDMS: 'इस सप्ताह पावर ब्लॉक',
    formsSubTMS: 'रजिस्टर से प्रभावी सतर्कता आदेश और मैनुअल TSR',
    formsSubSMMS: 'ब्लॉक में हर S&T कार्य के लिए एक सूचना',
    formsSubTDMS: 'OHE कार्य वाले हर ब्लॉक का आइसोलेशन रिकॉर्ड',
    formsEmptyTMS: 'आपके सेक्शन पर कोई TSR प्रभावी नहीं।',
    formsEmptySMMS: 'इस सप्ताह कोई S&T डिस्कनेक्शन नहीं।',
    formsEmptyTDMS: 'इस सप्ताह कोई पावर ब्लॉक नहीं।',
    openForms: 'प्रपत्र खोलें',
    kmph: '{v} km/h',
    lifting: '{block} द्वारा हटेगा',
    proposedTsr: 'प्रस्तावित',
    incTitle: '{dept} को भेजी गई घटनाएँ',
    incSub: 'रिपोर्टें जो अभी कार्य में नहीं बदलीं या बंद नहीं हुईं',
    incEmpty: '{dept} के लिए कोई खुली रिपोर्ट नहीं।',
    acknowledge: 'स्वीकार करें',
    acknowledged: 'घटना स्वीकार की गई',
    acknowledgedBody: '{id} {dept} द्वारा सत्यापित',
    noTriage: 'स्वीकार करने के लिए triage क्षमता चाहिए ({officer})',
    openIncidents: 'घटनाएँ खोलें',
    reqTitle: 'Requisitions',
    reqSub: 'लौटाई या मसौदा में आपकी कार्रवाई चाहिए; प्रस्तुत योजना प्रकोष्ठ की प्रतीक्षा में',
    reqEmpty: 'अभी कोई requisition नहीं — रजिस्टर से बनाएँ।',
    rRETURNED: 'लौटाई गई',
    rDRAFT: 'मसौदा',
    rSUBMITTED: 'प्रस्तुत',
    notesTitle: 'सूचनाएँ',
    notesEmpty: 'इस पोर्टल के लिए कुछ नया नहीं।',
    markAll: 'सभी पढ़ी हुई करें',
    open: 'खोलें',
    machinesTitle: 'मशीनें और टावर वैगन',
    machinesSub: 'सात दिनों में हर दिन योजना द्वारा बुक घंटे',
    machinesEmpty: 'इस योजना में S&T कार्यों को ट्रैक मशीन नहीं चाहिए। इकाइयाँ नीचे हैं।',
    home: 'मुख्यालय {st}',
    health: 'स्थिति {v} %',
    sinceOh: 'ओवरहॉल से {v} घंटे',
    speed: '{v} km/h',
    usedIn: 'इस सप्ताह {n} कार्यों में बुक',
    unused: 'इस सप्ताह बुक नहीं',
    unavailFeed: 'अनुपलब्ध दिन {from}–{to}: {reason}',
    offByYou: 'अनुपलब्ध चिह्नित',
    markOff: 'अनुपलब्ध चिह्नित करें',
    markOn: 'उपलब्ध चिह्नित करें',
    noResCap: 'मशीन स्थिति विभाग कर्मचारी या योजना प्रकोष्ठ तय करते हैं',
    machineOff: '{m} अनुपलब्ध — योजना दोबारा चली',
    machineOn: '{m} सेवा में वापस — योजना दोबारा चली',
    notifyOff: '{m} अनुपलब्ध ({dept})',
    notifyOn: '{m} सेवा में वापस ({dept})',
    notifyBody: '{by} द्वारा चिह्नित। योजना दोबारा चली; इसका उपयोग करने वाले ब्लॉक दोबारा रखे गए।',
    hours: 'घंटे',
    gangsTitle: 'गैंग और इकाइयाँ',
    gangsSub: 'Seeded फ़ीड से रोस्टर, इस सप्ताह की योजना से घंटे',
    colGang: 'गैंग / इकाई',
    colBase: 'मुख्यालय',
    colReach: 'पहुँच',
    colStrength: 'संख्या',
    colShift: 'प्रति दिन अधिकतम',
    colRest: 'विश्राम दिवस',
    colPlanned: 'इस सप्ताह नियोजित',
    colNext: 'अगला कार्य',
    none: '—',
  },
} as const;

type Key = keyof typeof strings.en;

const DEPT_OF_PORTAL: Partial<Record<PortalId, Dept>> = { tms: 'TMS', smms: 'SMMS', tdms: 'TDMS' };

export default function DeptTodayPage({ tab = 'today' }: DeptTodayPageProps) {
  const t = useT(strings);
  const tc = useT(common);
  const nav = useNavigate();
  const portal = usePortal();
  const dept: Dept = DEPT_OF_PORTAL[portal] ?? 'TMS';
  const drawer = useDrawerParams();

  const snapshot = useAppStore((s) => s.snapshot);
  const user = useAppStore((s) => s.user);
  const approvals = useAppStore((s) => s.approvals);
  const forms = useAppStore((s) => s.forms);
  const tsrs = useAppStore((s) => s.tsrs);
  const powerBlocks = useAppStore((s) => s.powerBlocks);
  const requisitions = useAppStore((s) => s.requisitions);
  const reports = useAppStore((s) => s.reports);
  const pushed = useAppStore((s) => s.pushed);
  const readNotifications = useAppStore((s) => s.readNotifications);
  const scenario = useAppStore((s) => s.scenario);
  const planStatus = useAppStore((s) => s.planStatus);
  const planVersion = useAppStore((s) => s.planVersion);
  const concur = useAppStore((s) => s.concur);
  const setScenario = useAppStore((s) => s.setScenario);
  const runPlan = useAppStore((s) => s.runPlan);
  const notify = useAppStore((s) => s.notify);
  const triageReport = useAppStore((s) => s.triageReport);
  const markRead = useAppStore((s) => s.markRead);
  const markAllRead = useAppStore((s) => s.markAllRead);
  const toast = useAppStore((s) => s.toast);

  const officer = DEPT_LABEL[dept].officer;
  const deptShort = DEPT_LABEL[dept].short;
  const canConcur = can(user, `concur:${dept}`);
  const canTriage = can(user, 'triage');
  const canResources = can(user, 'intake') || can(user, 'execute') || can(user, 'plan');
  const corridorId = snapshot?.corridor.id ?? null;

  const blocks = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals]);
  const weekBlocks = useMemo(() => blocks.filter((b) => b.status !== 'REFUSED' && b.departments.includes(dept)).sort((a, b) => a.day - b.day || a.start - b.start), [blocks, dept]);
  const tonight = useMemo(() => weekBlocks.filter((b) => b.day === 0), [weekBlocks]);
  const nextBlock = useMemo(() => weekBlocks.find((b) => b.day > 0) ?? null, [weekBlocks]);
  const awaiting = useMemo(() => weekBlocks.filter((b) => b.status === 'PROPOSED' && !!b.approval?.proposedAt && !b.approval.concur[dept]), [weekBlocks, dept]);

  const deptTasks = useMemo(() => (snapshot ? snapshot.tasks.filter((x) => x.dept === dept) : []), [snapshot, dept]);
  const byDay = useMemo(() => new Map((snapshot?.result.weekly.ai.scheduled ?? []).map((s) => [s.taskId, s.day])), [snapshot]);
  const overdue = useMemo(() => deptTasks.filter((x) => x.daysOverdue > 0), [deptTasks]);
  const mandatory = useMemo(() => deptTasks.filter((x) => x.risk.mandatory), [deptTasks]);
  const mandatoryMet = useMemo(() => mandatory.filter((x) => byDay.has(x.id) && byDay.get(x.id)! <= Math.max(0, x.dueDay)).length, [mandatory, byDay]);
  const priority = useMemo(() => deptTasks.filter((x) => x.daysOverdue > 0 || x.risk.mandatory).sort((a, b) => b.risk.arci - a.risk.arci).slice(0, 8), [deptTasks]);

  const reqs = useMemo(() => requisitions.filter((r) => r.corridorId === corridorId && r.dept === dept && (r.status === 'RETURNED' || r.status === 'DRAFT' || r.status === 'SUBMITTED')), [requisitions, corridorId, dept]);
  const reqsAwaiting = reqs.filter((r) => r.status !== 'SUBMITTED');
  const incidents = useMemo(() => reports.filter((r) => r.corridorId === corridorId && r.dept === dept && (r.status === 'UNVERIFIED' || r.status === 'TRIAGED')), [reports, corridorId, dept]);
  const notes = useMemo(() => pushed.filter((n) => n.portals.includes(portal) && (!n.dept || n.dept === dept)).slice(0, 6), [pushed, portal, dept]);

  const tsrOrders = useMemo(() => {
    if (!snapshot || dept !== 'TMS') return [];
    const deptOf = new Map(snapshot.tasks.map((x) => [x.id, x.dept]));
    return cautionOrders(snapshot, blocks, tsrs, forms, 0).filter((o) => o.formType === 'T/409' && (o.manual ? true : o.taskId ? deptOf.get(o.taskId) === 'TMS' : false));
  }, [snapshot, blocks, tsrs, forms, dept]);
  const allNotices = useMemo(() => (snapshot ? disconnectionNoticesWeek(snapshot, blocks, forms) : []), [snapshot, blocks, forms]);
  const notices = dept === 'SMMS' ? allNotices : [];
  const noticesByBlock = useMemo(() => {
    const m = new Map<string, typeof allNotices>();
    for (const n of allNotices) m.set(n.blockId, [...(m.get(n.blockId) ?? []), n]);
    return m;
  }, [allNotices]);
  const powerList = useMemo(() => weekBlocks.filter((b) => b.powerIsolation || b.kind === 'POWER' || b.kind === 'TRAFFIC + POWER'), [weekBlocks]);

  const machines = useMemo(() => (snapshot ? snapshot.feeds.machines.filter((m) => m.dept === dept) : []), [snapshot, dept]);
  const crews = useMemo(() => (snapshot ? snapshot.feeds.crews.filter((c) => c.dept === dept) : []), [snapshot, dept]);

  if (!snapshot) return <PlanPending />;

  const weekly = snapshot.result.weekly;
  const dates = weekly.occupancy.map((o) => o.date);
  const removed = scenario?.scenario.removeMachines ?? [];

  /* ── helpers ─────────────────────────────────────────────── */
  const dueText = (x: Task) => (x.daysOverdue > 0 ? t('overdueBy', { n: x.daysOverdue }) : x.daysOverdue === 0 ? t('dueToday') : t('dueIn', { n: -x.daysOverdue }));
  const stateOf = (b: WorkingBlock): { label: string; tone: Tone } => {
    if (b.status === 'LOCKED') return { label: t('stLocked'), tone: 'info' };
    if (b.status === 'GRANTED') return { label: t('stGranted'), tone: 'ok' };
    if (!b.approval?.proposedAt) return { label: t('stDraft'), tone: 'gray' };
    return b.concurred ? { label: t('stConcurred'), tone: 'ok' } : { label: t('stAwaiting'), tone: 'warn' };
  };
  const hoursByDay = (uses: { day: number; start: number; end: number }[]) => Array.from({ length: 7 }, (_, d) => uses.filter((u) => u.day === d).reduce((s, u) => s + (u.end - u.start) / 60, 0));
  const dayCat = (d: number) => (dates[d] ? dateLabel(dates[d]).slice(0, 6) : `D${d}`);

  const onConcur = (b: WorkingBlock) => {
    concur(b.id, dept);
    toast({ title: t('concurred'), body: t('concurredBody', { dept: deptShort, block: `${b.id} · ${b.sectionText}` }), tone: 'ok' });
  };

  const onAcknowledge = (id: string) => {
    triageReport(id, 'verify', { dept, note: `Acknowledged by ${user?.name ?? deptShort}` });
    toast({ title: t('acknowledged'), body: t('acknowledgedBody', { id, dept: deptShort }), tone: 'ok' });
  };

  const onToggleMachine = (m: Machine) => {
    const off = !removed.includes(m.id);
    const next = off ? [...removed, m.id] : removed.filter((x) => x !== m.id);
    const base: ScenarioState = scenario ?? { presetId: null, name: MACHINE_SCENARIO, params: {}, scenario: {} };
    const onlyMachines = base.presetId === null && base.name === MACHINE_SCENARIO && Object.keys(base.scenario).every((k) => k === 'removeMachines');
    setScenario(!off && next.length === 0 && onlyMachines ? null : { ...base, scenario: { ...base.scenario, removeMachines: next } });
    notify({
      portals: ['planning', 'control'],
      dept,
      kind: off ? 'WARNING' : 'INFO',
      title: t(off ? 'notifyOff' : 'notifyOn', { m: `${m.id} (${m.label})`, dept: deptShort }),
      body: t('notifyBody', { by: user?.name ?? deptShort }),
      route: '/app/planning/weekly',
    });
    void runPlan({ reason: off ? `machine ${m.id} unavailable` : `machine ${m.id} available` });
    toast({ title: t(off ? 'machineOff' : 'machineOn', { m: m.id }), tone: off ? 'warn' : 'ok' });
  };

  const openNote = (id: string, route?: string) => {
    markRead(id);
    if (route) nav(route);
  };

  /* ── columns ─────────────────────────────────────────────── */
  const blockColumns: Column<WorkingBlock>[] = [
    {
      key: 'block',
      header: t('colBlock'),
      render: (b) => (
        <span className="stack" style={{ gap: 1 }}>
          <span className="mono small strong">{b.id}</span>
          <span className="tiny muted">{dateLabel(b.date)}</span>
        </span>
      ),
    },
    {
      key: 'window',
      header: t('colWindow'),
      render: (b) => (
        <span className="stack" style={{ gap: 1 }}>
          <span className="num small strong">{b.startText}–{b.endText}</span>
          <span className="tiny muted">{duration(b.spanMin)}</span>
        </span>
      ),
    },
    {
      key: 'section',
      header: t('colSection'),
      hideMobile: true,
      render: (b) => (
        <span className="stack" style={{ gap: 1 }}>
          <span className="small">{b.sectionText} · {lineLabel(b.line)}</span>
          <span className="tiny muted num">{kmRange(b.startKm, b.endKm)}</span>
        </span>
      ),
    },
    {
      key: 'job',
      header: t('colJob'),
      render: (b) => (
        <span className="stack" style={{ gap: 1 }}>
          {b.tasks.filter((x) => x.dept === dept).map((x) => (
            <span key={x.id} className="small">{x.label}</span>
          ))}
        </span>
      ),
    },
    {
      key: 'partners',
      header: t('colPartners'),
      hideMobile: true,
      render: (b) => {
        const others = b.departments.filter((d) => d !== dept);
        return (
          <span className="stack" style={{ gap: 2 }}>
            <span className="row-wrap" style={{ gap: 4 }}>{others.length ? others.map((d) => <DeptBadge key={d} dept={d} />) : <span className="tiny muted">{t('noPartner')}</span>}</span>
            {b.approval?.incharge && <span className="tiny muted">{t('incharge', { name: b.approval.incharge })}</span>}
          </span>
        );
      },
    },
    {
      key: 'state',
      header: t('colState'),
      render: (b) => {
        const s = stateOf(b);
        return (
          <span className="stack" style={{ gap: 2 }}>
            <Badge tone={s.tone}>{s.label}</Badge>
            {b.approval?.concur[dept] && <span className="tiny" style={{ color: 'var(--ok)' }}>{t('myConcur')}</span>}
          </span>
        );
      },
    },
    {
      key: 'forms',
      header: t('colForms'),
      hideMobile: true,
      render: (b) => {
        const ns = noticesByBlock.get(b.id) ?? [];
        const hasPower = !!b.powerIsolation || b.kind === 'POWER' || b.kind === 'TRAFFIC + POWER';
        const p = powerBlocks[b.id]?.status ?? 'PENDING';
        return (
          <span className="stack" style={{ gap: 2 }}>
            {ns.map((n) => (
              <span key={n.id} className="tiny">{t('t351', { s: t(`f${n.status}` as Key) })}</span>
            ))}
            {hasPower && <span className="tiny">{t('power', { s: t(`p${p}` as Key) })}</span>}
            {!ns.length && !hasPower && <span className="tiny muted">{t('none')}</span>}
          </span>
        );
      },
    },
    {
      key: 'action',
      header: t('colAction'),
      render: (b) => {
        if (b.approval?.concur[dept] || b.status !== 'PROPOSED') return null;
        const sent = !!b.approval?.proposedAt;
        const hint = !canConcur ? t('noConcurCap', { officer }) : !sent ? t('notSent') : undefined;
        return (
          <button
            type="button"
            className="btn btn-sm btn-ok"
            disabled={!canConcur || !sent}
            title={hint}
            onClick={(e) => {
              e.stopPropagation();
              onConcur(b);
            }}
          >
            <CheckCheck /> {t('concur')}
          </button>
        );
      },
    },
  ];

  const deptCard =
    dept === 'TMS'
      ? { label: t('sTsr'), value: tsrOrders.length, sub: t('sTsrSub', { n: tsrOrders.filter((o) => o.manual?.status === 'PROPOSED').length }) }
      : dept === 'SMMS'
        ? { label: t('sT351'), value: notices.filter((n) => n.status !== 'RECONNECTED' && n.status !== 'WITHDRAWN').length, sub: t('sT351Sub') }
        : { label: t('sPower'), value: powerList.filter((b) => (powerBlocks[b.id]?.status ?? 'PENDING') === 'PENDING').length, sub: t('sPowerSub') };

  const formsRoute = dept === 'TMS' ? 'caution' : dept === 'SMMS' ? 'disconnections' : 'powerblocks';
  const title = t(`title${dept}` as Key);

  return (
    <div className="stack-lg">
      <PageHeader
        title={title}
        lede={t('lede', { corridor: snapshot.corridor.name, date: dateLabel(snapshot.planStart) })}
        badges={
          <>
            <DeptBadge dept={dept} long />
            <SimLabel kind="seededFeed" system={dept} seed={ENGINE_SEED} />
            <SeedStamp seed={ENGINE_SEED} runId={planVersion} ms={snapshot.timing.ms} />
          </>
        }
        actions={
          <>
            <button type="button" className="btn btn-sm" onClick={() => nav(`/app/${portal}/register`)}>
              <FileText /> {t('register')}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => nav(`/app/${portal}/requisitions`)}>
              <ListChecks /> {t('requisitions')}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => nav(`/app/${portal}/blocks`)}>
              {t('weekBlocks')}
            </button>
          </>
        }
      />

      <Tabs
        value={tab}
        onChange={(v) => nav(`/app/${portal}/${v}`)}
        tabs={[
          { id: 'today', label: t('tabToday') },
          { id: 'resources', label: t('tabResources'), count: machines.length + crews.length },
        ]}
      />

      <div className="grid" style={TILES} data-tour="dept-queue">
        <StatTile label={t('sOverdue')} value={overdue.length} sub={t('sOverdueSub', { n: deptTasks.length })} pastel={overdue.length ? 'pink' : undefined} />
        <StatTile label={t('sMandatory')} value={mandatory.length} sub={t('sMandatorySub', { n: mandatoryMet })} />
        <StatTile label={t('sReq')} value={reqsAwaiting.length} sub={t('sReqSub', { n: reqs.length - reqsAwaiting.length })} />
        <StatTile label={t('sBlocks')} value={weekBlocks.length} sub={t('sBlocksSub', { n: awaiting.length })} pastel={awaiting.length ? 'yellow' : undefined} />
        <StatTile label={deptCard.label} value={deptCard.value} sub={deptCard.sub} />
        <StatTile label={t('sInc')} value={incidents.length} sub={t('sIncSub', { n: incidents.filter((r) => r.status === 'UNVERIFIED').length })} />
      </div>

      {tab === 'today' && (
        <>
          <Card>
            <CardHead title={t('tonightTitle')} sub={t('tonightSub', { date: dateLabel(snapshot.planStart), dept: deptShort })} right={<SimLabel kind="solver" short />} />
            <CardBody flush>
              {tonight.length ? (
                <DataTable columns={blockColumns} rows={tonight} rowKey={(b) => b.id} onRowClick={(b) => drawer.open('block', b.id)} />
              ) : (
                <EmptyState
                  title={t('tonightEmpty', { dept: deptShort })}
                  body={nextBlock ? t('tonightNext', { next: `${dateLabel(nextBlock.date)} ${nextBlock.startText}–${nextBlock.endText} · ${nextBlock.sectionText}` }) : t('tonightNone', { dept: deptShort })}
                  action={
                    nextBlock ? (
                      <button type="button" className="btn btn-sm" onClick={() => drawer.open('block', nextBlock.id)}>
                        {t('open')}
                      </button>
                    ) : undefined
                  }
                />
              )}
            </CardBody>
          </Card>

          {awaiting.filter((b) => b.day > 0).length > 0 && (
            <Card>
              <CardHead title={t('awaitTitle')} sub={t('awaitSub', { dept: deptShort })} />
              <CardBody flush>
                <DataTable columns={blockColumns} rows={awaiting.filter((b) => b.day > 0)} rowKey={(b) => b.id} onRowClick={(b) => drawer.open('block', b.id)} empty={t('awaitEmpty')} />
              </CardBody>
            </Card>
          )}

          <div className="grid grid-main-aside">
            <Card>
              <CardHead
                title={t('priorityTitle')}
                sub={t('prioritySub')}
                right={
                  <button type="button" className="btn btn-sm" onClick={() => nav(`/app/${portal}/register`)}>
                    {t('register')}
                  </button>
                }
              />
              <CardBody flush>
                <DataTable
                  rows={priority}
                  rowKey={(x) => x.id}
                  onRowClick={(x) => drawer.open('task', x.id)}
                  empty={<EmptyState title={t('priorityEmpty')} />}
                  columns={[
                    {
                      key: 'work',
                      header: t('colJob'),
                      render: (x) => (
                        <span className="stack" style={{ gap: 1 }}>
                          <span className="small strong">{x.label}</span>
                          <span className="tiny muted">{x.sectionLabel} · {x.line} · <span className="num">{kmRange(x.startKm, x.endKm)}</span></span>
                        </span>
                      ),
                    },
                    { key: 'due', header: tc('status'), render: (x) => <span className="small" style={{ color: x.daysOverdue > 0 ? 'var(--crit)' : undefined, whiteSpace: 'nowrap' }}>{dueText(x)}</span> },
                    { key: 'arci', header: tc('arci'), render: (x) => <ArciBar value={x.risk.arci} mandatory={x.risk.mandatory} /> },
                    { key: 'band', header: tc('urgency'), hideMobile: true, render: (x) => <UrgencyBadge urgency={x.risk.urgency} /> },
                    {
                      key: 'placed',
                      header: tc('block'),
                      hideMobile: true,
                      render: (x) => {
                        const p = placement(snapshot, blocks, x.id);
                        return p.block ? <span className="tiny num">{t('placedIn', { date: dateLabel(p.block.date), window: `${p.block.startText}–${p.block.endText}` })}</span> : <span className="tiny muted">{t('notPlaced')}</span>;
                      },
                    },
                  ]}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHead
                title={t('notesTitle')}
                icon={<Bell size={16} />}
                right={
                  notes.some((n) => !readNotifications.includes(n.id)) ? (
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => markAllRead(notes.map((n) => n.id))}>
                      {t('markAll')}
                    </button>
                  ) : undefined
                }
              />
              <CardBody>
                {notes.length === 0 ? (
                  <EmptyState title={t('notesEmpty')} />
                ) : (
                  <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {notes.map((n) => {
                      const unread = !readNotifications.includes(n.id);
                      return (
                        <li key={n.id}>
                          <button type="button" className="btn btn-ghost btn-block" style={{ justifyContent: 'flex-start', textAlign: 'left', height: 'auto', padding: '6px 8px' }} onClick={() => openNote(n.id, n.route)}>
                            <span className="stack" style={{ gap: 1, minWidth: 0 }}>
                              <span className={`small ${unread ? 'strong' : ''}`}>{n.title}</span>
                              <span className="tiny muted truncate">{n.body}</span>
                              <span className="tiny muted">{timeAgo(n.at)}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>

          <div className="grid grid-3">
            <Card>
              <CardHead
                title={t(`formsTitle${dept}` as Key)}
                sub={t(`formsSub${dept}` as Key)}
                right={
                  <button type="button" className="btn btn-sm" onClick={() => nav(`/app/${portal}/${formsRoute}`)}>
                    {t('openForms')}
                  </button>
                }
              />
              <CardBody>
                {dept === 'TMS' &&
                  (tsrOrders.length === 0 ? (
                    <EmptyState title={t('formsEmptyTMS')} />
                  ) : (
                    <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {tsrOrders.slice(0, 6).map((o) => (
                        <li key={o.id} className="stack" style={{ gap: 1, borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
                          <span className="row-wrap" style={{ gap: 6 }}>
                            <Badge tone="warn">{t('kmph', { v: o.speedKmph })}</Badge>
                            <span className="small strong">{o.section}</span>
                            <span className="tiny muted">{o.line}</span>
                            {o.manual?.status === 'PROPOSED' && <Badge tone="gray">{t('proposedTsr')}</Badge>}
                          </span>
                          <span className="tiny muted num">{kmRange(o.startKm, o.endKm)} · {o.reason}</span>
                          {o.liftingBlockId && <span className="tiny">{t('lifting', { block: o.liftingBlockId })}</span>}
                        </li>
                      ))}
                    </ul>
                  ))}
                {dept === 'SMMS' &&
                  (notices.length === 0 ? (
                    <EmptyState title={t('formsEmptySMMS')} />
                  ) : (
                    <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {notices.slice(0, 6).map((n) => (
                        <li key={n.id} className="stack" style={{ gap: 1, borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
                          <span className="row-wrap" style={{ gap: 6 }}>
                            <span className="mono tiny strong">{n.noticeNo}</span>
                            <Badge tone={n.status === 'RECONNECTED' ? 'ok' : n.status === 'DRAFT' ? 'gray' : 'warn'}>{t(`f${n.status}` as Key)}</Badge>
                          </span>
                          <span className="tiny muted">{n.gear} · {n.section} · {n.disconnectionTime}–{n.reconnectionTime}</span>
                        </li>
                      ))}
                    </ul>
                  ))}
                {dept === 'TDMS' &&
                  (powerList.length === 0 ? (
                    <EmptyState title={t('formsEmptyTDMS')} />
                  ) : (
                    <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {powerList.slice(0, 6).map((b) => {
                        const p = powerBlocks[b.id]?.status ?? 'PENDING';
                        return (
                          <li key={b.id} className="stack" style={{ gap: 1, borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
                            <span className="row-wrap" style={{ gap: 6 }}>
                              <button type="button" className="btn btn-sm btn-ghost mono" style={{ padding: '0 4px' }} onClick={() => drawer.open('block', b.id)}>
                                {b.id}
                              </button>
                              <Badge tone={p === 'ENERGISED' ? 'ok' : p === 'DEENERGISED' ? 'warn' : 'gray'}>{t(`p${p}` as Key)}</Badge>
                            </span>
                            <span className="tiny muted">
                              {dateLabel(b.date)} {b.startText}–{b.endText} · {b.sectionText}
                              {b.oheSections.length ? ` · ${b.oheSections.map((s) => s.label).join(', ')}` : ''}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ))}
              </CardBody>
            </Card>

            <Card>
              <CardHead
                title={t('incTitle', { dept: deptShort })}
                sub={t('incSub')}
                right={
                  <button type="button" className="btn btn-sm" onClick={() => nav(`/app/${portal}/incidents`)}>
                    {t('openIncidents')}
                  </button>
                }
              />
              <CardBody>
                {incidents.length === 0 ? (
                  <EmptyState title={t('incEmpty', { dept: deptShort })} />
                ) : (
                  <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {incidents.slice(0, 6).map((r) => (
                      <li key={r.id} className="row" style={{ gap: 8, alignItems: 'flex-start', borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
                        <span className="grow stack" style={{ gap: 1, minWidth: 0 }}>
                          <span className="row-wrap" style={{ gap: 6 }}>
                            <span className="mono small strong">{r.id}</span>
                            <Badge tone={r.status === 'UNVERIFIED' ? 'warn' : 'info'}>{r.category}</Badge>
                            <span className="tiny muted">{timeAgo(r.at)}</span>
                          </span>
                          <span className="tiny truncate">{r.description}</span>
                          {r.km !== undefined && <span className="tiny muted num">km {r.km.toFixed(1)}{r.line ? ` · ${r.line}` : ''}{r.nearestStation ? ` · ${r.nearestStation}` : ''}</span>}
                        </span>
                        <span className="stack" style={{ gap: 4 }}>
                          {r.status === 'UNVERIFIED' && (
                            <button type="button" className="btn btn-sm" onClick={() => onAcknowledge(r.id)} disabled={!canTriage} title={canTriage ? undefined : t('noTriage', { officer })}>
                              {t('acknowledge')}
                            </button>
                          )}
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => drawer.open('report', r.id)}>
                            {t('open')}
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHead
                title={t('reqTitle')}
                sub={t('reqSub')}
                right={
                  <button type="button" className="btn btn-sm" onClick={() => nav(`/app/${portal}/requisitions`)}>
                    {t('requisitions')}
                  </button>
                }
              />
              <CardBody>
                {reqs.length === 0 ? (
                  <EmptyState title={t('reqEmpty')} />
                ) : (
                  <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {reqs.slice(0, 6).map((r) => (
                      <li key={r.id} className="row" style={{ gap: 8, alignItems: 'flex-start', borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
                        <span className="grow stack" style={{ gap: 1, minWidth: 0 }}>
                          <span className="row-wrap" style={{ gap: 6 }}>
                            <span className="mono tiny strong">{r.no}</span>
                            <Badge tone={r.status === 'RETURNED' ? 'crit' : r.status === 'DRAFT' ? 'gray' : 'info'}>{t(`r${r.status}` as Key)}</Badge>
                          </span>
                          <span className="tiny">{WT[r.workType]?.label ?? r.workType} · {r.line} · km {r.startKm}–{r.endKm}</span>
                          {r.status === 'RETURNED' && r.cellRemarks && <span className="tiny" style={{ color: 'var(--crit)' }}>{r.cellRemarks}</span>}
                        </span>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => nav(`/app/${portal}/requisitions?req=${encodeURIComponent(r.id)}`)}>
                          <ExternalLink /> {t('open')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        </>
      )}

      {tab === 'resources' && (
        <>
          <Card>
            <CardHead title={t('machinesTitle')} sub={t('machinesSub')} icon={<Wrench size={16} />} right={<SimLabel kind="seededFeed" system={dept} seed={ENGINE_SEED} />} />
            <CardBody>
              {machines.length === 0 ? (
                <EmptyState title={t('machinesEmpty')} />
              ) : (
                <div className="grid grid-auto">
                  {machines.map((m) => {
                    const uses = weekly.ai.machineUse[m.id] ?? [];
                    const off = removed.includes(m.id);
                    const feedOff = m.unavailable.filter((u) => !(off && u.reason === 'Scenario: breakdown'));
                    return (
                      <div key={m.id} className={`card ${off ? 'pastel-pink' : ''}`} style={{ padding: 12 }}>
                        <div className="stack" style={{ gap: 6 }}>
                          <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                            <span className="grow stack" style={{ gap: 1 }}>
                              <span className="small strong">{m.label}</span>
                              <span className="tiny muted mono">{m.id} · {t('home', { st: m.homeStation })}</span>
                            </span>
                            {off && <Badge tone="crit">{t('offByYou')}</Badge>}
                          </div>
                          <span className="tiny muted">
                            {t('health', { v: m.healthIndex })} · {t('sinceOh', { v: num(m.hoursSinceOverhaul) })} · {t('speed', { v: m.speedKmph })}
                          </span>
                          {feedOff.map((u, i) => (
                            <span key={i} className="tiny" style={{ color: 'var(--on-yellow)' }}>
                              {t('unavailFeed', { from: dayCat(u.fromDay), to: u.toDay < 7 ? dayCat(u.toDay) : `D${u.toDay}`, reason: u.reason })}
                            </span>
                          ))}
                          <BarChart categories={Array.from({ length: 7 }, (_, d) => dayCat(d))} series={[{ name: t('hours'), color: 'var(--series-1)', values: hoursByDay(uses) }]} height={96} valueFormat={(v) => `${v.toFixed(1)} h`} />
                          <span className="tiny muted">{uses.length ? t('usedIn', { n: uses.length }) : t('unused')}</span>
                          <div>
                            <button type="button" className={`btn btn-sm ${off ? 'btn-ok' : ''}`} onClick={() => onToggleMachine(m)} disabled={!canResources || planStatus === 'running'} title={canResources ? undefined : t('noResCap')}>
                              {off ? <Power /> : <PowerOff />} {off ? t('markOn') : t('markOff')}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHead title={t('gangsTitle')} sub={t('gangsSub')} right={<SimLabel kind="seededFeed" system={dept} seed={ENGINE_SEED} />} />
            <CardBody flush>
              <DataTable
                rows={crews}
                rowKey={(c) => c.id}
                columns={[
                  {
                    key: 'gang',
                    header: t('colGang'),
                    render: (c) => (
                      <span className="stack" style={{ gap: 1 }}>
                        <span className="small strong">{c.label}</span>
                        <span className="tiny muted mono">{c.id}</span>
                      </span>
                    ),
                  },
                  { key: 'base', header: t('colBase'), render: (c) => <span className="small">{c.baseStation} · <span className="num">km {num(c.baseKm, 1)}</span></span> },
                  { key: 'reach', header: t('colReach'), num: true, hideMobile: true, render: (c) => `${num(c.reachKm)} km` },
                  { key: 'strength', header: t('colStrength'), num: true, render: (c) => num(c.strength) },
                  { key: 'shift', header: t('colShift'), num: true, hideMobile: true, render: (c) => duration(c.maxMinPerDay) },
                  { key: 'rest', header: t('colRest'), hideMobile: true, render: (c) => tc(DOW_KEYS[c.restDay] ?? 'sun') },
                  {
                    key: 'planned',
                    header: t('colPlanned'),
                    num: true,
                    render: (c) => {
                      const h = (weekly.ai.crewUse[c.id] ?? []).reduce((s, u) => s + (u.end - u.start) / 60, 0);
                      return h ? `${num(h, 1)} h` : <span className="muted">{t('none')}</span>;
                    },
                  },
                  {
                    key: 'next',
                    header: t('colNext'),
                    hideMobile: true,
                    render: (c) => {
                      const u = [...(weekly.ai.crewUse[c.id] ?? [])].sort((a, b) => a.day - b.day || a.start - b.start)[0];
                      if (!u) return <span className="muted">{t('none')}</span>;
                      const b = blocks.find((x) => x.tasks.some((y) => y.id === u.taskId));
                      return b ? (
                        <button type="button" className="btn btn-sm btn-ghost" style={{ padding: '0 4px' }} onClick={() => drawer.open('block', b.id)}>
                          <span className="small num">{dayCat(u.day)} · {b.startText}–{b.endText}</span>
                        </button>
                      ) : (
                        <span className="small num">{dayCat(u.day)}</span>
                      );
                    },
                  },
                ]}
              />
            </CardBody>
          </Card>
        </>
      )}

      <BlockDrawer blockId={drawer.blockId} onClose={() => drawer.close('block')} />
      <TaskDrawer taskId={drawer.taskId} onClose={() => drawer.close('task')} />
      <ReportDrawer reportId={drawer.reportId} onClose={() => drawer.close('report')} />
    </div>
  );
}
