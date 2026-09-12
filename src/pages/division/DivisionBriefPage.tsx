/**
 * DivisionBriefPage — /app/division/brief (spec §3.21).
 * What the DRM asks on Monday: outcomes vs how we used to plan, safety
 * backlog by department, adherence, what is stuck. Every figure is computed
 * from the engine snapshot or recorded workflow state. Deck targets appear
 * only behind the "Show reference targets" toggle, each with a SourceLabel.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Printer, Send } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { Anomaly, Corridor, Dept, Kpis } from '../../engine/types';
import { CORRIDORS } from '../../engine/corridors.js';
import { adherence, derivedEscalations, workingBlocks } from '../../engine/select';
import { can } from '../../auth/portals';
import { useT } from '../../i18n';
import { common } from '../../i18n/common';
import { DEPT_LABEL, dateLabel, num, pct, pts, rupees, signed, timeAgo } from '../../lib/format';
import { Badge, Callout, Card, CardBody, CardFoot, CardHead, DataTable, DeptBadge, EmptyState, Field, Modal, PageHeader, PlanPending, StatTile, type Column } from '../../components/ui';
import { RingGauge, Sparkline } from '../../components/viz';
import { NetworkMap } from '../../components/viz/NetworkMap';
import { useCorridorSwitch } from '../../components/domain/planHooks';
import { SeedStamp, SimLabel, SourceLabel } from '../../components/ui/extras';
import { roiSummary } from './roiSummary';

/** The worker is never sent a seed by the store, so the engine default applies (engine/worker.ts). */
const ENGINE_SEED = 26027;
const DEPTS: Dept[] = ['TMS', 'SMMS', 'TDMS'];
const DAY_MS = 86400000;
const CORRIDOR_LIST = CORRIDORS as Corridor[];
const ZONE_COUNT = new Set(CORRIDOR_LIST.map((c) => c.zone)).size;
const SEV_ORDER: Record<Anomaly['severity'], number> = { high: 0, medium: 1, low: 2 };
const SEV_TONE: Record<Anomaly['severity'], 'crit' | 'warn' | 'gray'> = { high: 'crit', medium: 'warn', low: 'gray' };
/** Age of a timestamp against the wall clock (same basis as lib/format timeAgo). */
const ageMs = (iso: string) => Date.now() - new Date(iso).getTime();

/** Stat tile row: kit .grid with a one-off column template. */
const TILES = { gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' } as const;

const strings = {
  en: {
    title: 'Division brief',
    lede: '{corridor} · week from {date}. Outcomes of the weekly plan against the simulated baseline, safety backlog, adherence and what is waiting for an officer.',
    direct: 'Direct department',
    openRoi: 'Open ROI audit',
    footnote: 'vs simulated decentralised FIFO baseline · seed {seed} · run {run}',
    kAvailability: 'Line availability',
    kPossession: 'Possession hours',
    kSectionHours: 'Section-line hours lost',
    kColocation: 'Co-location',
    kCompliance: 'Mandatory compliance',
    kHighRisk: 'High-risk works within 72 h',
    kDelay: 'Train delay (class-weighted)',
    kTrains: 'Trains affected',
    kTsr: 'TSR train-minutes',
    kBlocks: 'Possessions',
    kRupees: 'Saved this week',
    kRupeesSub: 'From the ROI assumptions',
    baselineShort: 'baseline {v}',
    noMandatory: 'No mandatory works',
    outcomesTitle: 'Outcomes on {corridor}',
    outcomesSub: 'Plan vs baseline for the current corridor. Other corridors are planned when selected in the top bar or in the corridor network below.',
    colMetric: 'Metric',
    colBaseline: 'Baseline',
    colPlan: 'Plan',
    colDelta: 'Δ',
    colRel: 'Δ %',
    colTarget: 'Target / literature',
    showTargets: 'Show reference targets (SIH 2026 deck — target / literature)',
    deckUptime: '+18.8 % asset uptime',
    deckDowntime: '−51.9 % corridor downtime',
    deckColocation: '96.2 % multi-department co-location',
    gaugesTitle: 'Plan against baseline',
    gAvailability: 'Availability',
    gCompliance: 'Mandatory compliance',
    gColocation: 'Co-location',
    scoreTitle: 'Department scorecards',
    scoreSub: 'This week’s plan and the execution records on this corridor',
    sOverdue: 'Overdue works',
    sMandatory: 'Mandatory placed within floor',
    sBlocks: 'Possessions this week',
    sGranted: 'Granted or locked',
    sExecuted: 'Records completed',
    sAdherence: 'Adherence',
    sNoRecords: 'No records',
    directDept: 'Direct {dept}',
    escTitle: 'Needs an officer',
    escSub: 'Top open items from the escalation desk',
    escAll: 'Open escalation desk',
    escEmpty: 'Nothing needs escalation.',
    kindMandatory: 'Mandatory past floor',
    kindRefused: 'Refused twice or more',
    kindStale: 'Stale requisition',
    kindIncident: 'Report open > 48 h',
    kindRisk: 'Predicted escalation',
    kindManual: 'Raised',
    whenOverdue: '{n} d overdue',
    whenDue: 'due in {n} d',
    whenDueToday: 'due today',
    whenRefused: 'refused {n} times',
    open: 'Open',
    adhTitle: 'Adherence',
    adhSub: 'Execution records on this corridor',
    adhCompleted: 'Completed',
    adhInProgress: 'In progress',
    adhOnTime: 'On-time start (≤ 10 min)',
    adhOverrun: 'Overrun',
    adhTsr: 'Cleared with TSR',
    adhEmpty: 'No execution records yet on this corridor.',
    adhOpen: 'Open adherence',
    incTitle: 'Reports open for more than 24 h',
    incSub: 'Hazard reports not yet converted, resolved or rejected',
    incEmpty: 'No report has been open for more than 24 h.',
    apprTitle: 'Programme approvals',
    apprSub: 'Monthly plan and 26-week Rolling Block Programme',
    apprMonthly: 'Monthly plan',
    apprRolling: '26-week programme',
    apprWaiting: 'Submitted — awaiting your decision',
    apprJpoLate: 'JPO notice short on {n} programme entries',
    apprOpen: 'Open programme',
    stDRAFT: 'Draft',
    stSUBMITTED: 'Submitted',
    stAPPROVED: 'Approved',
    stRETURNED: 'Returned',
    wlTitle: '26-week workload forecast',
    wlSub: 'Works per week from the Weibull fit',
    wlPeak: 'Peak {n} works in week {w}',
    dirTitle: 'Recent directions',
    dirEmpty: 'No directions issued yet.',
    modalTitle: 'Direction to a department',
    modalHint: 'The direction is recorded in the audit trail and sent to the department portal.',
    recipient: 'Department',
    allDepts: 'All departments and cells',
    note: 'Direction',
    notePh: 'What must be done, by when',
    send: 'Send direction',
    sent: 'Direction sent',
    sentBody: 'To {dept}',
    needsNote: 'Write the direction first',
    noAuth: 'Directions need the authorise capability (DRM).',
    netTitle: 'Corridor network',
    netSub: '{n} corridors in {z} zones, one planned at a time. Select one to switch.',
    anTitle: 'Anomalies in this run',
    anSub: 'Overruns in the execution log, failure spikes against the Weibull fit, register values out of range',
    anHigh: '{n} high',
    anMedium: '{n} medium',
    anLow: '{n} low',
    anNone: 'No anomaly flagged in this run.',
    anMissing: 'This plan run did not compute anomalies.',
    anMore: '{n} more in this run',
    anKindOVERRUN: 'Overrun',
    anKindFAILURE_SPIKE: 'Failure spike',
    anKindDATA: 'Register data',
  },
  hi: {
    title: 'मंडल सार',
    lede: '{corridor} · {date} से सप्ताह। सिम्युलेटेड आधार-रेखा की तुलना में साप्ताहिक योजना के परिणाम, सुरक्षा बैकलॉग, अनुपालन और अधिकारी की प्रतीक्षा में मदें।',
    direct: 'विभाग को निर्देश',
    openRoi: 'ROI ऑडिट खोलें',
    footnote: 'सिम्युलेटेड विकेंद्रीकृत FIFO आधार-रेखा से तुलना · seed {seed} · run {run}',
    kAvailability: 'लाइन उपलब्धता',
    kPossession: 'पज़ेशन घंटे',
    kSectionHours: 'section-line घंटे बंद',
    kColocation: 'सह-स्थान',
    kCompliance: 'अनिवार्य अनुपालन',
    kHighRisk: '72 घंटे में उच्च-जोखिम कार्य',
    kDelay: 'ट्रेन विलंब (श्रेणी-भारित)',
    kTrains: 'प्रभावित ट्रेनें',
    kTsr: 'TSR ट्रेन-मिनट',
    kBlocks: 'पज़ेशन',
    kRupees: 'इस सप्ताह बचत',
    kRupeesSub: 'ROI मान्यताओं से',
    baselineShort: 'आधार-रेखा {v}',
    noMandatory: 'कोई अनिवार्य कार्य नहीं',
    outcomesTitle: '{corridor} पर परिणाम',
    outcomesSub: 'वर्तमान कॉरिडोर के लिए योजना बनाम आधार-रेखा। अन्य कॉरिडोर ऊपर या नीचे कॉरिडोर नेटवर्क में चुनने पर नियोजित होते हैं।',
    colMetric: 'मापदंड',
    colBaseline: 'आधार-रेखा',
    colPlan: 'योजना',
    colDelta: 'Δ',
    colRel: 'Δ %',
    colTarget: 'लक्ष्य / साहित्य',
    showTargets: 'संदर्भ लक्ष्य दिखाएँ (SIH 2026 डेक — लक्ष्य / साहित्य)',
    deckUptime: '+18.8 % परिसंपत्ति अपटाइम',
    deckDowntime: '−51.9 % कॉरिडोर डाउनटाइम',
    deckColocation: '96.2 % बहु-विभागीय सह-स्थान',
    gaugesTitle: 'योजना बनाम आधार-रेखा',
    gAvailability: 'उपलब्धता',
    gCompliance: 'अनिवार्य अनुपालन',
    gColocation: 'सह-स्थान',
    scoreTitle: 'विभागीय स्कोरकार्ड',
    scoreSub: 'इस सप्ताह की योजना और इस कॉरिडोर के निष्पादन रिकॉर्ड',
    sOverdue: 'अतिदेय कार्य',
    sMandatory: 'फ़्लोर के भीतर अनिवार्य कार्य',
    sBlocks: 'इस सप्ताह पज़ेशन',
    sGranted: 'प्रदान या लॉक',
    sExecuted: 'पूर्ण रिकॉर्ड',
    sAdherence: 'अनुपालन',
    sNoRecords: 'कोई रिकॉर्ड नहीं',
    directDept: '{dept} को निर्देश',
    escTitle: 'अधिकारी की आवश्यकता',
    escSub: 'एस्केलेशन डेस्क की शीर्ष खुली मदें',
    escAll: 'एस्केलेशन डेस्क खोलें',
    escEmpty: 'किसी एस्केलेशन की आवश्यकता नहीं।',
    kindMandatory: 'फ़्लोर पार अनिवार्य',
    kindRefused: 'दो या अधिक बार अस्वीकृत',
    kindStale: 'पुरानी requisition',
    kindIncident: '48 घंटे से खुली रिपोर्ट',
    kindRisk: 'अनुमानित एस्केलेशन',
    kindManual: 'उठाया गया',
    whenOverdue: '{n} दिन अतिदेय',
    whenDue: '{n} दिन में देय',
    whenDueToday: 'आज देय',
    whenRefused: '{n} बार अस्वीकृत',
    open: 'खोलें',
    adhTitle: 'अनुपालन',
    adhSub: 'इस कॉरिडोर के निष्पादन रिकॉर्ड',
    adhCompleted: 'पूर्ण',
    adhInProgress: 'प्रगति में',
    adhOnTime: 'समय पर आरंभ (≤ 10 मिनट)',
    adhOverrun: 'अधिक समय',
    adhTsr: 'TSR के साथ क्लियर',
    adhEmpty: 'इस कॉरिडोर पर अभी कोई निष्पादन रिकॉर्ड नहीं।',
    adhOpen: 'अनुपालन खोलें',
    incTitle: '24 घंटे से अधिक खुली रिपोर्टें',
    incSub: 'खतरा रिपोर्टें जो अभी तक कार्य में बदली, हल या अस्वीकृत नहीं हुईं',
    incEmpty: 'कोई रिपोर्ट 24 घंटे से अधिक खुली नहीं है।',
    apprTitle: 'कार्यक्रम अनुमोदन',
    apprSub: 'मासिक योजना और 26-सप्ताह रोलिंग ब्लॉक कार्यक्रम',
    apprMonthly: 'मासिक योजना',
    apprRolling: '26-सप्ताह कार्यक्रम',
    apprWaiting: 'प्रस्तुत — आपके निर्णय की प्रतीक्षा',
    apprJpoLate: '{n} कार्यक्रम प्रविष्टियों पर JPO सूचना कम',
    apprOpen: 'कार्यक्रम खोलें',
    stDRAFT: 'मसौदा',
    stSUBMITTED: 'प्रस्तुत',
    stAPPROVED: 'अनुमोदित',
    stRETURNED: 'लौटाया',
    wlTitle: '26-सप्ताह कार्यभार पूर्वानुमान',
    wlSub: 'Weibull मॉडल से प्रति सप्ताह कार्य',
    wlPeak: 'सप्ताह {w} में अधिकतम {n} कार्य',
    dirTitle: 'हाल के निर्देश',
    dirEmpty: 'अभी तक कोई निर्देश नहीं।',
    modalTitle: 'विभाग को निर्देश',
    modalHint: 'निर्देश ऑडिट ट्रेल में दर्ज होता है और विभाग पोर्टल पर भेजा जाता है।',
    recipient: 'विभाग',
    allDepts: 'सभी विभाग और प्रकोष्ठ',
    note: 'निर्देश',
    notePh: 'क्या करना है, कब तक',
    send: 'निर्देश भेजें',
    sent: 'निर्देश भेजा गया',
    sentBody: '{dept} को',
    needsNote: 'पहले निर्देश लिखें',
    noAuth: 'निर्देश के लिए authorise क्षमता (DRM) चाहिए।',
    netTitle: 'कॉरिडोर नेटवर्क',
    netSub: '{z} ज़ोन में {n} कॉरिडोर, एक समय में एक की योजना। बदलने के लिए एक चुनें।',
    anTitle: 'इस run में विसंगतियाँ',
    anSub: 'निष्पादन लॉग में overrun, Weibull फ़िट की तुलना में विफलता वृद्धि, सीमा से बाहर रजिस्टर मान',
    anHigh: '{n} उच्च',
    anMedium: '{n} मध्यम',
    anLow: '{n} निम्न',
    anNone: 'इस run में कोई विसंगति नहीं मिली।',
    anMissing: 'इस योजना run में विसंगतियाँ नहीं गिनी गईं।',
    anMore: 'इस run में {n} और',
    anKindOVERRUN: 'Overrun',
    anKindFAILURE_SPIKE: 'विफलता वृद्धि',
    anKindDATA: 'रजिस्टर डेटा',
  },
} as const;

type Key = keyof typeof strings.en;

interface MetricRow {
  id: string;
  label: Key;
  base: number | null;
  plan: number | null;
  fmt: (v: number) => string;
  delta: (d: number) => string;
  lowerIsBetter: boolean | null;
  deck?: Key;
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

function metricRows(ai: Kpis, base: Kpis): MetricRow[] {
  return [
    { id: 'availability', label: 'kAvailability', base: base.availability, plan: ai.availability, fmt: (v) => pct(v, 2), delta: (d) => pts(d * 100, 2), lowerIsBetter: false, deck: 'deckUptime' },
    { id: 'possession', label: 'kPossession', base: base.totalBlockHours, plan: ai.totalBlockHours, fmt: (v) => `${num(v, 1)} h`, delta: (d) => signed(d, 1, ' h'), lowerIsBetter: true, deck: 'deckDowntime' },
    { id: 'sectionHours', label: 'kSectionHours', base: base.sectionLineHoursLost, plan: ai.sectionLineHoursLost, fmt: (v) => `${num(v, 1)} h`, delta: (d) => signed(d, 1, ' h'), lowerIsBetter: true },
    { id: 'colocation', label: 'kColocation', base: base.colocationRate, plan: ai.colocationRate, fmt: (v) => pct(v, 1), delta: (d) => pts(d * 100, 1), lowerIsBetter: false, deck: 'deckColocation' },
    { id: 'compliance', label: 'kCompliance', base: ratio(base.mandatoryCompliant, base.mandatoryTotal), plan: ratio(ai.mandatoryCompliant, ai.mandatoryTotal), fmt: (v) => pct(v, 1), delta: (d) => pts(d * 100, 1), lowerIsBetter: false },
    { id: 'highRisk', label: 'kHighRisk', base: base.highRiskTotal ? base.highRiskWithin72hRate : null, plan: ai.highRiskTotal ? ai.highRiskWithin72hRate : null, fmt: (v) => pct(v, 1), delta: (d) => pts(d * 100, 1), lowerIsBetter: false },
    { id: 'delay', label: 'kDelay', base: base.weightedDelayMin, plan: ai.weightedDelayMin, fmt: (v) => `${num(v, 0)} min`, delta: (d) => signed(d, 0, ' min'), lowerIsBetter: true },
    { id: 'trains', label: 'kTrains', base: base.trainsAffected, plan: ai.trainsAffected, fmt: (v) => num(v, 0), delta: (d) => signed(d, 0), lowerIsBetter: true },
    { id: 'tsr', label: 'kTsr', base: base.tsrTrainMinutes, plan: ai.tsrTrainMinutes, fmt: (v) => num(v, 0), delta: (d) => signed(d, 0), lowerIsBetter: true },
    { id: 'blocks', label: 'kBlocks', base: base.blockCount, plan: ai.blockCount, fmt: (v) => num(v, 0), delta: (d) => signed(d, 0), lowerIsBetter: null },
  ];
}

function deltaGood(row: MetricRow): boolean | null {
  if (row.base === null || row.plan === null || row.lowerIsBetter === null) return null;
  const d = row.plan - row.base;
  if (Math.abs(d) < 1e-9) return null;
  return row.lowerIsBetter ? d < 0 : d > 0;
}

interface EscItem {
  id: string;
  kind: 'mandatory' | 'refused' | 'stale' | 'incident' | 'escalation-risk' | 'manual';
  ref: string;
  dept: Dept | null;
  text: string;
  when: string;
}

const KIND_LABEL: Record<EscItem['kind'], Key> = { mandatory: 'kindMandatory', refused: 'kindRefused', stale: 'kindStale', incident: 'kindIncident', 'escalation-risk': 'kindRisk', manual: 'kindManual' };
const KIND_ORDER: Record<EscItem['kind'], number> = { mandatory: 0, refused: 1, incident: 2, manual: 3, stale: 4, 'escalation-risk': 5 };

export default function DivisionBriefPage() {
  const t = useT(strings);
  const tc = useT(common);
  const nav = useNavigate();

  const snapshot = useAppStore((s) => s.snapshot);
  const user = useAppStore((s) => s.user);
  const planVersion = useAppStore((s) => s.planVersion);
  const approvals = useAppStore((s) => s.approvals);
  const executionLog = useAppStore((s) => s.executionLog);
  const reports = useAppStore((s) => s.reports);
  const requisitions = useAppStore((s) => s.requisitions);
  const escalations = useAppStore((s) => s.escalations);
  const directions = useAppStore((s) => s.directions);
  const rbp = useAppStore((s) => s.rbp);
  const audit = useAppStore((s) => s.audit);
  const roiAssumptions = useAppStore((s) => s.roiAssumptions);
  const direct = useAppStore((s) => s.direct);
  const toast = useAppStore((s) => s.toast);
  const activeCorridorId = useAppStore((s) => s.corridorId);
  const { request: requestCorridor, dialog: corridorDialog } = useCorridorSwitch();

  const [showTargets, setShowTargets] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [dirDept, setDirDept] = useState<Dept | 'ALL'>('ALL');
  const [dirNote, setDirNote] = useState('');

  const canDirect = can(user, 'authorise');
  const corridorId = snapshot?.corridor.id ?? null;

  const blocks = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals]);
  const roi = useMemo(() => (snapshot ? roiSummary(snapshot.result.weekly, snapshot.corridor, roiAssumptions) : null), [snapshot, roiAssumptions]);
  const rows = useMemo(() => (snapshot ? metricRows(snapshot.result.weekly.kpis, snapshot.result.weekly.baseKpis) : []), [snapshot]);
  const corridorLog = useMemo(() => executionLog.filter((r) => r.corridorId === corridorId), [executionLog, corridorId]);
  const adh = useMemo(() => adherence(corridorLog), [corridorLog]);
  const corridorReports = useMemo(() => reports.filter((r) => r.corridorId === corridorId), [reports, corridorId]);

  const scorecards = useMemo(() => {
    if (!snapshot) return [];
    const byDay = new Map(snapshot.result.weekly.ai.scheduled.map((s) => [s.taskId, s.day]));
    return DEPTS.map((dept) => {
      const tasks = snapshot.tasks.filter((x) => x.dept === dept);
      const mandatory = tasks.filter((x) => x.risk.mandatory);
      const mandatoryMet = mandatory.filter((x) => byDay.has(x.id) && byDay.get(x.id)! <= Math.max(0, x.dueDay)).length;
      const deptBlocks = blocks.filter((b) => b.status !== 'REFUSED' && b.departments.includes(dept));
      const records = corridorLog.filter((r) => r.items.some((i) => i.dept === dept));
      const completed = records.filter((r) => r.status === 'COMPLETED' || r.status === 'CLOSED');
      return {
        dept,
        overdue: tasks.filter((x) => x.daysOverdue > 0).length,
        mandatoryTotal: mandatory.length,
        mandatoryMet,
        blocks: deptBlocks.length,
        granted: deptBlocks.filter((b) => b.status === 'GRANTED' || b.status === 'LOCKED').length,
        completed: completed.length,
        adherence: completed.length ? adherence(records).adherenceRate : null,
      };
    });
  }, [snapshot, blocks, corridorLog]);

  const reviewedIds = useMemo(() => new Set(audit.filter((a) => a.action === 'ESCALATION_REVIEWED').map((a) => a.entityId)), [audit]);

  const topEscalations: EscItem[] = useMemo(() => {
    if (!snapshot) return [];
    const reqs = requisitions.filter((r) => r.corridorId === snapshot.corridor.id).map((r) => ({ id: r.id, no: r.no, dept: r.dept, status: r.status, updatedAt: r.updatedAt }));
    const reps = corridorReports.map((r) => ({ id: r.id, at: r.at, status: r.status, dept: r.dept, description: r.description }));
    const taskById = new Map(snapshot.tasks.map((x) => [x.id, x]));
    const derived: EscItem[] = derivedEscalations(snapshot, blocks, approvals, reqs, reps)
      .filter((e) => !reviewedIds.has(e.id))
      .map((e) => {
        const task = taskById.get(e.ref);
        const report = e.kind === 'incident' ? corridorReports.find((r) => r.id === e.ref) : undefined;
        const req = e.kind === 'stale' ? reqs.find((r) => r.no === e.ref) : undefined;
        const text = task ? `${task.label} · ${task.sectionLabel}` : e.kind === 'refused' ? approvals[e.ref]?.refusal?.reason ?? e.ref : report ? report.description : e.ref;
        const when = task
          ? task.daysOverdue > 0
            ? t('whenOverdue', { n: task.daysOverdue })
            : task.daysOverdue === 0
              ? t('whenDueToday')
              : t('whenDue', { n: -task.daysOverdue })
          : e.kind === 'refused'
            ? t('whenRefused', { n: approvals[e.ref]?.refusal?.count ?? 0 })
            : report
              ? timeAgo(report.at)
              : req
                ? timeAgo(req.updatedAt)
                : '';
        return { id: e.id, kind: e.kind, ref: e.ref, dept: e.dept, text, when };
      });
    const manual: EscItem[] = escalations.filter((e) => !e.reviewed).map((e) => ({ id: e.id, kind: 'manual', ref: e.ref, dept: null, text: e.note, when: timeAgo(e.at) }));
    return [...derived, ...manual].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]).slice(0, 5);
  }, [snapshot, blocks, approvals, requisitions, corridorReports, escalations, reviewedIds, t]);

  const staleReports = useMemo(
    () => corridorReports.filter((r) => (r.status === 'UNVERIFIED' || r.status === 'TRIAGED') && ageMs(r.at) > DAY_MS).slice(0, 5),
    [corridorReports]
  );

  const anomalyList = snapshot?.anomalies;
  const anomalies = useMemo(() => {
    if (!anomalyList) return null;
    const by: Record<Anomaly['severity'], number> = { high: 0, medium: 0, low: 0 };
    for (const a of anomalyList) by[a.severity]++;
    const top = [...anomalyList].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]).slice(0, 4);
    return { by, top, total: anomalyList.length };
  }, [anomalyList]);

  if (!snapshot || !roi) return <PlanPending />;

  const weekly = snapshot.result.weekly;
  const rolling = snapshot.result.rolling;
  const jpoShort = rolling.entries.filter((e) => e.status === 'NOTICE_SHORTFALL').length;
  const forecast = rolling.forecast.map((f) => f.total);
  const peakIdx = forecast.length ? forecast.indexOf(Math.max(...forecast)) : -1;
  const row = (id: string) => rows.find((r) => r.id === id)!;

  const openDirect = (dept: Dept | 'ALL') => {
    setDirDept(dept);
    setDirNote('');
    setModalOpen(true);
  };

  const sendDirection = () => {
    const note = dirNote.trim();
    if (!note) {
      toast({ title: t('needsNote'), tone: 'warn' });
      return;
    }
    direct(dirDept, note);
    toast({ title: t('sent'), body: t('sentBody', { dept: dirDept === 'ALL' ? t('allDepts') : DEPT_LABEL[dirDept].long }), tone: 'ok' });
    setModalOpen(false);
    setDirNote('');
  };

  const tile = (id: string, extra?: { pastel?: 'green' | 'blue' | 'lavender' | 'yellow' | 'pink' | 'gray' }) => {
    const r = row(id);
    const has = r.base !== null && r.plan !== null;
    return (
      <StatTile
        label={t(r.label)}
        value={r.plan === null ? '—' : r.fmt(r.plan)}
        delta={has ? r.delta(r.plan! - r.base!) : undefined}
        deltaGood={deltaGood(r)}
        sub={r.base === null ? (id === 'compliance' ? t('noMandatory') : undefined) : t('baselineShort', { v: r.fmt(r.base) })}
        pastel={extra?.pastel}
      />
    );
  };

  const outcomeColumns: Column<MetricRow>[] = [
    { key: 'metric', header: t('colMetric'), render: (r) => <span className="small strong">{t(r.label)}</span> },
    { key: 'base', header: t('colBaseline'), num: true, render: (r) => <span className="muted">{r.base === null ? '—' : r.fmt(r.base)}</span> },
    { key: 'plan', header: t('colPlan'), num: true, render: (r) => (r.plan === null ? '—' : r.fmt(r.plan)) },
    {
      key: 'delta',
      header: t('colDelta'),
      num: true,
      render: (r) => {
        if (r.base === null || r.plan === null) return '—';
        const g = deltaGood(r);
        return <span style={{ color: g === true ? 'var(--ok)' : g === false ? 'var(--crit)' : undefined }}>{r.delta(r.plan - r.base)}</span>;
      },
    },
    {
      key: 'rel',
      header: t('colRel'),
      num: true,
      hideMobile: true,
      render: (r) => (r.base === null || r.plan === null || r.base === 0 ? '—' : signed(((r.plan - r.base) / r.base) * 100, 1, ' %')),
    },
    ...(showTargets
      ? [
          {
            key: 'target',
            header: t('colTarget'),
            render: (r: MetricRow) =>
              r.deck ? (
                <span className="row-wrap" style={{ gap: 6, background: 'var(--bg-2)', borderRadius: 'var(--radius-sm)', padding: '2px 6px' }}>
                  <span className="small muted">{t(r.deck)}</span>
                  <SourceLabel />
                </span>
              ) : (
                <span className="muted">—</span>
              ),
          } as Column<MetricRow>,
        ]
      : []),
  ];

  const rbpStatus = (s: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'RETURNED') => t(`st${s}` as Key);

  return (
    <div className="stack-lg">
      <PageHeader
        title={t('title')}
        lede={t('lede', { corridor: snapshot.corridor.name, date: dateLabel(snapshot.planStart) })}
        badges={
          <>
            <SimLabel kind="baseline" />
            <SeedStamp seed={ENGINE_SEED} runId={planVersion} iterations={weekly.ai.search.iterations} ms={snapshot.timing.ms} />
          </>
        }
        actions={
          <>
            <button type="button" className="btn btn-sm" onClick={() => window.print()}>
              <Printer /> {tc('print')}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => nav('/app/division/roi')}>
              {t('openRoi')}
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => openDirect('ALL')} disabled={!canDirect} title={canDirect ? undefined : t('noAuth')}>
              <Send /> {t('direct')}
            </button>
          </>
        }
      />

      <div className="stack">
        <div className="grid" style={TILES} data-tour="division-kpis">
          {tile('availability', { pastel: 'green' })}
          {tile('possession')}
          {tile('colocation')}
          {tile('compliance')}
          {tile('delay')}
          <StatTile label={t('kRupees')} value={rupees(roi.totalRupees)} sub={t('kRupeesSub')} honesty="assumption" pastel="yellow" />
        </div>
        <div className="row-wrap tiny muted">
          <span>{t('footnote', { seed: ENGINE_SEED, run: planVersion })}</span>
          <SimLabel kind="baseline" short />
          <SimLabel kind="assumption" short />
        </div>
      </div>

      <div className="grid grid-main-aside">
        <Card>
          <CardHead
            title={t('outcomesTitle', { corridor: snapshot.corridor.name })}
            sub={t('outcomesSub')}
            right={
              <label className="check small">
                <input type="checkbox" checked={showTargets} onChange={(e) => setShowTargets(e.target.checked)} />
                {t('showTargets')}
              </label>
            }
          />
          <CardBody flush>
            <DataTable columns={outcomeColumns} rows={rows} rowKey={(r) => r.id} compact />
          </CardBody>
        </Card>

        <Card>
          <CardHead title={t('gaugesTitle')} right={<SimLabel kind="baseline" short />} />
          <CardBody>
            <div className="row-wrap" style={{ justifyContent: 'space-around', gap: 16 }}>
              {(['availability', 'compliance', 'colocation'] as const).map((id) => {
                const r = row(id);
                const label = id === 'availability' ? 'gAvailability' : id === 'compliance' ? 'gCompliance' : 'gColocation';
                return (
                  <div key={id} className="stack" style={{ alignItems: 'center', gap: 6 }}>
                    <RingGauge value={r.plan ?? 0} size={104} label={r.plan === null ? '—' : pct(r.plan, 1)} sub={r.base === null ? undefined : t('baselineShort', { v: pct(r.base, 1) })} tone={id === 'availability' ? 'var(--series-1)' : id === 'compliance' ? 'var(--series-3)' : 'var(--series-4)'} />
                    <span className="small strong">{t(label)}</span>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-main-aside">
        <Card>
          <CardHead title={t('netTitle')} sub={t('netSub', { n: CORRIDOR_LIST.length, z: ZONE_COUNT })} />
          <CardBody>
            <NetworkMap activeId={activeCorridorId} onSelect={requestCorridor} height={280} />
          </CardBody>
        </Card>

        <Card>
          <CardHead title={t('anTitle')} sub={t('anSub')} right={<SimLabel kind="model" short />} />
          <CardBody>
            {!anomalies ? (
              <EmptyState title={t('anMissing')} />
            ) : anomalies.total === 0 ? (
              <EmptyState title={t('anNone')} />
            ) : (
              <div className="stack">
                <div className="row-wrap" style={{ gap: 6 }}>
                  <Badge tone="crit">{t('anHigh', { n: num(anomalies.by.high) })}</Badge>
                  <Badge tone="warn">{t('anMedium', { n: num(anomalies.by.medium) })}</Badge>
                  <Badge tone="gray">{t('anLow', { n: num(anomalies.by.low) })}</Badge>
                </div>
                <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {anomalies.top.map((a) => (
                    <li key={a.id} className="stack" style={{ gap: 2, borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
                      <div className="row-wrap" style={{ gap: 6 }}>
                        <Badge tone={SEV_TONE[a.severity]}>{t(`anKind${a.kind}` as Key)}</Badge>
                        {a.ref && <span className="mono tiny muted">{a.ref}</span>}
                      </div>
                      <span className="small">{a.title}</span>
                      <span className="tiny muted">{a.detail}</span>
                    </li>
                  ))}
                </ul>
                {anomalies.total > anomalies.top.length && <span className="tiny muted">{t('anMore', { n: num(anomalies.total - anomalies.top.length) })}</span>}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <section className="stack">
        <div className="row-between">
          <div>
            <div className="section-title" style={{ marginBottom: 2 }}>{t('scoreTitle')}</div>
            <div className="small muted">{t('scoreSub')}</div>
          </div>
          <SimLabel kind="seededRecords" />
        </div>
        <div className="grid grid-3">
          {scorecards.map((sc) => (
            <Card key={sc.dept}>
              <CardHead title={<DeptBadge dept={sc.dept} long />} sub={`${DEPT_LABEL[sc.dept].long} · ${DEPT_LABEL[sc.dept].officer}`} />
              <CardBody>
                <dl className="kv">
                  <dt>{t('sOverdue')}</dt>
                  <dd className="num" style={{ color: sc.overdue > 0 ? 'var(--crit)' : undefined }}>{num(sc.overdue)}</dd>
                  <dt>{t('sMandatory')}</dt>
                  <dd className="num">{sc.mandatoryTotal ? `${sc.mandatoryMet} / ${sc.mandatoryTotal} · ${pct(sc.mandatoryMet / sc.mandatoryTotal, 0)}` : t('noMandatory')}</dd>
                  <dt>{t('sBlocks')}</dt>
                  <dd className="num">{num(sc.blocks)}</dd>
                  <dt>{t('sGranted')}</dt>
                  <dd className="num">{num(sc.granted)}</dd>
                  <dt>{t('sExecuted')}</dt>
                  <dd className="num">{num(sc.completed)}</dd>
                  <dt>{t('sAdherence')}</dt>
                  <dd className="num">{sc.adherence === null ? <span className="muted">{t('sNoRecords')}</span> : pct(sc.adherence, 0)}</dd>
                </dl>
              </CardBody>
              <CardFoot>
                <button type="button" className="btn btn-sm" onClick={() => openDirect(sc.dept)} disabled={!canDirect} title={canDirect ? undefined : t('noAuth')}>
                  <Send /> {t('directDept', { dept: DEPT_LABEL[sc.dept].short })}
                </button>
              </CardFoot>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid grid-2">
        <Card>
          <CardHead
            title={t('escTitle')}
            sub={t('escSub')}
            right={
              <button type="button" className="btn btn-sm" onClick={() => nav('/app/division/escalations')}>
                {t('escAll')} <ArrowRight />
              </button>
            }
          />
          <CardBody>
            {topEscalations.length === 0 ? (
              <EmptyState title={t('escEmpty')} />
            ) : (
              <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {topEscalations.map((e) => (
                  <li key={e.id} className="row" style={{ gap: 10, alignItems: 'flex-start', borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
                    <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
                      <div className="row-wrap" style={{ gap: 6 }}>
                        <Badge tone={e.kind === 'mandatory' || e.kind === 'refused' ? 'crit' : 'warn'}>{t(KIND_LABEL[e.kind])}</Badge>
                        {e.dept && <DeptBadge dept={e.dept} />}
                        <span className="mono tiny muted">{e.ref}</span>
                      </div>
                      <span className="small truncate">{e.text}</span>
                      <span className="tiny muted">{e.when}</span>
                    </div>
                    <button type="button" className="btn btn-sm" onClick={() => nav(`/app/division/escalations?item=${encodeURIComponent(e.id)}`)}>
                      {t('open')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHead
            title={t('adhTitle')}
            sub={t('adhSub')}
            right={
              <button type="button" className="btn btn-sm" onClick={() => nav('/app/planning/adherence')}>
                {t('adhOpen')}
              </button>
            }
          />
          <CardBody>
            {corridorLog.length === 0 ? (
              <EmptyState title={t('adhEmpty')} />
            ) : (
              <div className="stack">
                <dl className="kv">
                  <dt>{t('adhCompleted')}</dt>
                  <dd className="num">{num(adh.completedBlocks)}</dd>
                  <dt>{t('adhInProgress')}</dt>
                  <dd className="num">{num(adh.inProgressBlocks)}</dd>
                  <dt>{t('adhOnTime')}</dt>
                  <dd className="num">{pct(adh.onTimeStartRate, 0)}</dd>
                  <dt>{t('sAdherence')}</dt>
                  <dd className="num">{adh.completedBlocks ? pct(adh.adherenceRate, 0) : <span className="muted">{t('sNoRecords')}</span>}</dd>
                  <dt>{t('adhOverrun')}</dt>
                  <dd className="num">{num(adh.totalOverrunMin)} min</dd>
                  <dt>{t('adhTsr')}</dt>
                  <dd className="num">{num(adh.clearedWithTsr)}</dd>
                </dl>
                <SimLabel kind="seededRecords" />
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-3">
        <Card>
          <CardHead title={t('incTitle')} sub={t('incSub')} />
          <CardBody>
            {staleReports.length === 0 ? (
              <EmptyState title={t('incEmpty')} />
            ) : (
              <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {staleReports.map((r) => (
                  <li key={r.id} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                    <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
                      <div className="row-wrap" style={{ gap: 6 }}>
                        <span className="mono small strong">{r.id}</span>
                        {r.dept && <DeptBadge dept={r.dept} />}
                        <span className="tiny muted">{timeAgo(r.at)}</span>
                      </div>
                      <span className="small truncate">{r.description}</span>
                    </div>
                    <button type="button" className="btn btn-sm" onClick={() => nav(`/app/division/incidents?report=${encodeURIComponent(r.id)}`)}>
                      {t('open')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHead
            title={t('apprTitle')}
            sub={t('apprSub')}
            right={
              <button type="button" className="btn btn-sm" onClick={() => nav('/app/division/plans')}>
                {t('apprOpen')}
              </button>
            }
          />
          <CardBody>
            <div className="stack">
              {(['monthly', 'rolling'] as const).map((k) => {
                const st = rbp[k];
                return (
                  <div key={k} className="well stack" style={{ gap: 4 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="small strong grow">{k === 'monthly' ? t('apprMonthly') : t('apprRolling')}</span>
                      <Badge tone={st.status === 'APPROVED' ? 'ok' : st.status === 'RETURNED' ? 'crit' : st.status === 'SUBMITTED' ? 'warn' : 'gray'}>{rbpStatus(st.status)}</Badge>
                    </div>
                    {st.status === 'SUBMITTED' && <span className="tiny" style={{ color: 'var(--on-yellow)' }}>{t('apprWaiting')}</span>}
                    {st.by && st.at && (
                      <span className="tiny muted">
                        {st.by} · {timeAgo(st.at)}
                      </span>
                    )}
                  </div>
                );
              })}
              {jpoShort > 0 && <Callout tone="warn">{t('apprJpoLate', { n: jpoShort })}</Callout>}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHead title={t('wlTitle')} sub={t('wlSub')} right={<SimLabel kind="model" short />} />
          <CardBody>
            <div className="stack">
              <Sparkline values={forecast} width={280} height={56} />
              {peakIdx >= 0 && <span className="small muted">{t('wlPeak', { n: num(forecast[peakIdx], 1), w: rolling.forecast[peakIdx].week })}</span>}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHead title={t('dirTitle')} />
        <CardBody>
          {directions.length === 0 ? (
            <EmptyState title={t('dirEmpty')} />
          ) : (
            <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {directions.slice(0, 5).map((d) => (
                <li key={d.id} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                  {d.dept === 'ALL' ? <Badge tone="gray">{t('allDepts')}</Badge> : <DeptBadge dept={d.dept} />}
                  <span className="small grow">{d.note}</span>
                  <span className="tiny muted" style={{ whiteSpace: 'nowrap' }}>
                    {d.by} · {timeAgo(d.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={t('modalTitle')}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setModalOpen(false)}>
              {tc('cancel')}
            </button>
            <button type="button" className="btn btn-primary" onClick={sendDirection} disabled={!dirNote.trim()}>
              <Send /> {t('send')}
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="small muted">{t('modalHint')}</div>
          <Field label={t('recipient')} htmlFor="dir-dept">
            <select id="dir-dept" className="select" value={dirDept} onChange={(e) => setDirDept(e.target.value as Dept | 'ALL')}>
              <option value="ALL">{t('allDepts')}</option>
              {DEPTS.map((d) => (
                <option key={d} value={d}>
                  {DEPT_LABEL[d].long} ({DEPT_LABEL[d].system})
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('note')} htmlFor="dir-note">
            <textarea id="dir-note" className="textarea" rows={4} placeholder={t('notePh')} value={dirNote} onChange={(e) => setDirNote(e.target.value)} />
          </Field>
        </div>
      </Modal>
      {corridorDialog}
    </div>
  );
}
