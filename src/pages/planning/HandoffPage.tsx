/**
 * HandoffPage — /app/planning/handoff, /app/control/handoff (spec §3.10).
 * Concurrence → grant → lock per block with its audit trail, the BDMS
 * demand payload (CSV / JSON) and the public advisory text.
 *   planning: request concurrence, record concurrence on behalf (note required), export
 *   control:  grant, refuse, lock (capability-gated), export
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Copy, Download, ExternalLink, FileJson, Lock, PhoneCall, RotateCcw, Send, XCircle } from 'lucide-react';
import { usePortal } from '../../app/usePortal';
import { can, type PortalId } from '../../auth/portals';
import { useAppStore } from '../../store/useAppStore';
import { blocksToCsv, toBdmsDemand } from '../../engine/exporter.js';
import { advisories, workingBlocks, type WorkingBlock } from '../../engine/select';
import type { Dept, Snapshot } from '../../engine/types';
import { useT } from '../../i18n';
import { common } from '../../i18n/common';
import { addDaysIso, copyText, dateLabel, download, duration, timeAgo } from '../../lib/format';
import { Badge, Callout, Card, CardBody, CardHead, DataTable, DeptBadge, EmptyState, Field, Modal, PageHeader, PlanPending, StatTile, Tabs, type Column } from '../../components/ui';
import { AuditTrail, SimLabel } from '../../components/ui/extras';
import { BlockDrawer } from '../../components/domain/BlockDrawer';
import { useDrawerParams } from '../../components/domain/useDrawerParams';
import { FLOW_LABEL, FLOW_TONE, flowState, planStrings, type FlowState } from './planMetrics';

export interface HandoffPageProps {
  mode?: 'planning' | 'control';
}

type FilterTab = 'ALL' | FlowState | 'OBJECTIONS';
type PanelTab = 'concurrence' | 'export' | 'advisories' | 'events';
type RefuseKey = 'refTraffic' | 'refT351' | 'refMachine' | 'refGang' | 'refPath' | 'refOther';

const DEPTS: Dept[] = ['TMS', 'SMMS', 'TDMS'];
const FILTERS: FilterTab[] = ['ALL', 'DRAFT', 'AWAITING', 'READY', 'GRANTED', 'LOCKED', 'REFUSED', 'OBJECTIONS'];
const REFUSE_KEYS: RefuseKey[] = ['refTraffic', 'refT351', 'refMachine', 'refGang', 'refPath', 'refOther'];

const strings = {
  en: {
    title: 'Hand-off',
    ledePlanning: 'Concurrence from Civil, S&T and TRD, the Control decision on each block, the BDMS demand payload and the advisory passengers will see.',
    ledeControl: 'Blocks sent by the planning cell: grant what every department has concurred, refuse with a reason, lock D+1.',
    exportCsv: 'BDMS CSV',
    exportJson: 'BDMS JSON',
    exported: 'Exported {n} blocks',
    exportedBody: 'BDMS payload format; nothing is transmitted to CRIS.',
    requestAll: 'Request concurrence ({n} drafts)',
    requestNone: 'No draft block is waiting to be sent.',
    lockD1: 'Lock D+1 ({n})',
    lockD1None: 'No granted block for D+1.',
    noCapPlan: 'Only the block planning cell can do this.',
    noCapGrant: 'Your role cannot grant or refuse blocks.',
    noCapLock: 'Your role cannot lock blocks (Chief Controller).',
    requested: 'Concurrence requested from {depts}',
    requestedBody: '{n} blocks sent to Control',
    notifyDeptTitle: 'Concurrence requested on {n} blocks',
    notifyDeptBody: '{first}',
    notifyControlTitle: '{n} blocks proposed for concurrence',
    statDraft: 'Draft',
    statAwaiting: 'Awaiting concurrence',
    statReady: 'Ready to grant',
    statGranted: 'Granted',
    statLocked: 'Locked',
    statObjections: 'Objections',
    allTab: 'All',
    objectionsTab: 'Objections',
    allDays: 'All days',
    allDepts: 'All departments',
    matrixTitle: 'Concurrence matrix',
    matrixSub: '{n} blocks · click a row to review',
    colBlock: 'Block',
    colWindow: 'Window',
    colSection: 'Section / line',
    colState: 'Control state',
    colLast: 'Last action',
    pillConcurred: 'Concurred',
    pillPending: 'Pending',
    pillObjection: 'Objection',
    pillNotAsked: 'Not asked',
    none: '—',
    emptySent: 'No blocks sent to hand-off yet — send the week from Weekly plan.',
    emptyFilter: 'No blocks match the filter.',
    openWeekly: 'Open weekly plan',
    openBlock: 'Open block',
    selectPrompt: 'Select a block in the matrix.',
    tabConcurrence: 'Concurrence',
    tabExport: 'BDMS payload',
    tabAdvisories: 'Advisories',
    tabEvents: 'Events',
    concurredBy: 'Concurred by {by} · {when}',
    objectedBy: '{reason} — {by} · {when}',
    awaitingDept: 'Awaiting concurrence',
    notAskedDept: 'Concurrence not requested yet',
    request: 'Request concurrence',
    onBehalf: 'Record concurrence on behalf',
    rerun: 'Re-plan after objection',
    grant: 'Grant',
    refuse: 'Refuse',
    lock: 'Lock',
    grantedToast: 'Block {id} granted',
    refusedToast: 'Block {id} refused',
    lockedToast: 'Block {id} locked',
    lockedD1Toast: '{n} D+1 blocks locked',
    concurToast: 'Concurrence recorded for {dept}',
    grantNote: 'Grant is recorded by Control.',
    payloadNote: 'BDMS payload matches the demand format; nothing is transmitted to CRIS.',
    copy: 'Copy payload',
    copied: 'Payload copied',
    copyFailed: 'Could not copy — select the text instead',
    advisoryPublicNote: 'Public once Control grants the block.',
    noAdvisory: 'No passenger train is expected to be held by this block.',
    trainsCount: '{n} trains',
    heldUpTo: 'may be held up to about {n} min',
    noEvents: 'No action recorded on this block yet.',
    modalConcurTitle: 'Record concurrence on behalf',
    modalConcurBody: 'For a concurrence received by phone or on paper. The note and your name go into the audit trail.',
    fieldDept: 'Department',
    fieldOfficer: 'Officer who concurred',
    fieldNote: 'Phone / paper reference',
    officerRequired: 'Enter the officer’s name.',
    noteRequired: 'A note is required (phone call or memo reference).',
    onBehalfNote: 'On behalf of {officer} · {note}',
    modalRefuseTitle: 'Refuse block',
    modalRefuseBody: 'The planning cell and the departments are told the reason.',
    fieldReason: 'Reason',
    fieldDetail: 'Detail',
    detailRequired: 'Describe the reason.',
    confirm: 'Confirm',
    refTraffic: 'Traffic cannot be regulated in this window',
    refT351: 'T/351 disconnection not yet acknowledged by the Station Master',
    refMachine: 'Track machine not at the site in time',
    refGang: 'Gang not reported at site',
    refPath: 'Path needed for an out-of-course train',
    refOther: 'Other',
  },
  hi: {
    title: 'हैंड-ऑफ़',
    ledePlanning: 'सिविल, S&T और TRD की सहमति, हर block पर कंट्रोल का निर्णय, BDMS मांग पेलोड और यात्रियों को दिखने वाली सूचना।',
    ledeControl: 'योजना प्रकोष्ठ द्वारा भेजे गए block: सभी विभागों की सहमति वाले block प्रदान करें, कारण सहित अस्वीकार करें, D+1 लॉक करें।',
    exportCsv: 'BDMS CSV',
    exportJson: 'BDMS JSON',
    exported: '{n} block निर्यात किए गए',
    exportedBody: 'BDMS पेलोड प्रारूप; CRIS को कुछ नहीं भेजा जाता।',
    requestAll: 'सहमति मांगें ({n} ड्राफ्ट)',
    requestNone: 'भेजने हेतु कोई ड्राफ्ट block नहीं।',
    lockD1: 'D+1 लॉक करें ({n})',
    lockD1None: 'D+1 हेतु कोई प्रदान किया गया block नहीं।',
    noCapPlan: 'यह केवल ब्लॉक योजना प्रकोष्ठ कर सकता है।',
    noCapGrant: 'आपकी भूमिका block प्रदान या अस्वीकार नहीं कर सकती।',
    noCapLock: 'आपकी भूमिका block लॉक नहीं कर सकती (मुख्य नियंत्रक)।',
    requested: '{depts} से सहमति मांगी गई',
    requestedBody: '{n} block कंट्रोल को भेजे गए',
    notifyDeptTitle: '{n} block पर सहमति मांगी गई',
    notifyDeptBody: '{first}',
    notifyControlTitle: 'सहमति हेतु {n} block प्रस्तावित',
    statDraft: 'ड्राफ्ट',
    statAwaiting: 'सहमति प्रतीक्षित',
    statReady: 'प्रदान हेतु तैयार',
    statGranted: 'प्रदान',
    statLocked: 'लॉक',
    statObjections: 'आपत्तियाँ',
    allTab: 'सभी',
    objectionsTab: 'आपत्तियाँ',
    allDays: 'सभी दिन',
    allDepts: 'सभी विभाग',
    matrixTitle: 'सहमति मैट्रिक्स',
    matrixSub: '{n} block · समीक्षा हेतु पंक्ति पर क्लिक करें',
    colBlock: 'Block',
    colWindow: 'विंडो',
    colSection: 'सेक्शन / लाइन',
    colState: 'कंट्रोल स्थिति',
    colLast: 'अंतिम कार्रवाई',
    pillConcurred: 'सहमत',
    pillPending: 'लंबित',
    pillObjection: 'आपत्ति',
    pillNotAsked: 'नहीं मांगी',
    none: '—',
    emptySent: 'अभी तक कोई block हैंड-ऑफ़ को नहीं भेजा गया — साप्ताहिक योजना से सप्ताह भेजें।',
    emptyFilter: 'इस फ़िल्टर से कोई block मेल नहीं खाता।',
    openWeekly: 'साप्ताहिक योजना खोलें',
    openBlock: 'Block खोलें',
    selectPrompt: 'मैट्रिक्स में कोई block चुनें।',
    tabConcurrence: 'सहमति',
    tabExport: 'BDMS पेलोड',
    tabAdvisories: 'सूचनाएँ',
    tabEvents: 'घटनाएँ',
    concurredBy: '{by} द्वारा सहमति · {when}',
    objectedBy: '{reason} — {by} · {when}',
    awaitingDept: 'सहमति प्रतीक्षित',
    notAskedDept: 'सहमति अभी मांगी नहीं गई',
    request: 'सहमति मांगें',
    onBehalf: 'की ओर से सहमति दर्ज करें',
    rerun: 'आपत्ति के बाद पुनः योजना',
    grant: 'प्रदान करें',
    refuse: 'अस्वीकार करें',
    lock: 'लॉक करें',
    grantedToast: 'Block {id} प्रदान किया गया',
    refusedToast: 'Block {id} अस्वीकृत',
    lockedToast: 'Block {id} लॉक किया गया',
    lockedD1Toast: 'D+1 के {n} block लॉक किए गए',
    concurToast: '{dept} की सहमति दर्ज',
    grantNote: 'प्रदान कंट्रोल द्वारा दर्ज किया जाता है।',
    payloadNote: 'BDMS पेलोड मांग प्रारूप से मेल खाता है; CRIS को कुछ नहीं भेजा जाता।',
    copy: 'पेलोड कॉपी करें',
    copied: 'पेलोड कॉपी हुआ',
    copyFailed: 'कॉपी नहीं हो सका — पाठ चुनकर कॉपी करें',
    advisoryPublicNote: 'कंट्रोल द्वारा block प्रदान होने पर सार्वजनिक।',
    noAdvisory: 'इस block से किसी यात्री ट्रेन के रुकने की संभावना नहीं।',
    trainsCount: '{n} ट्रेनें',
    heldUpTo: 'लगभग {n} मिनट तक रुक सकती है',
    noEvents: 'इस block पर अभी कोई कार्रवाई दर्ज नहीं।',
    modalConcurTitle: 'की ओर से सहमति दर्ज करें',
    modalConcurBody: 'फ़ोन या कागज़ पर मिली सहमति हेतु। नोट और आपका नाम ऑडिट ट्रेल में जाते हैं।',
    fieldDept: 'विभाग',
    fieldOfficer: 'सहमति देने वाले अधिकारी',
    fieldNote: 'फ़ोन / कागज़ संदर्भ',
    officerRequired: 'अधिकारी का नाम दर्ज करें।',
    noteRequired: 'नोट आवश्यक है (फ़ोन कॉल या मेमो संदर्भ)।',
    onBehalfNote: '{officer} की ओर से · {note}',
    modalRefuseTitle: 'Block अस्वीकार करें',
    modalRefuseBody: 'योजना प्रकोष्ठ और विभागों को कारण बताया जाता है।',
    fieldReason: 'कारण',
    fieldDetail: 'विवरण',
    detailRequired: 'कारण का वर्णन करें।',
    confirm: 'पुष्टि करें',
    refTraffic: 'इस विंडो में यातायात नियमित नहीं किया जा सकता',
    refT351: 'T/351 डिस्कनेक्शन स्टेशन मास्टर द्वारा अभी स्वीकार नहीं',
    refMachine: 'ट्रैक मशीन समय पर साइट पर नहीं',
    refGang: 'गैंग साइट पर नहीं पहुँची',
    refPath: 'असामान्य ट्रेन हेतु पथ आवश्यक',
    refOther: 'अन्य',
  },
} as const;

export default function HandoffPage({ mode }: HandoffPageProps) {
  const snapshot = useAppStore((s) => s.snapshot);
  if (!snapshot) return <PlanPending />;
  return <HandoffBody snapshot={snapshot} modeProp={mode} />;
}

function HandoffBody({ snapshot, modeProp }: { snapshot: Snapshot; modeProp?: HandoffPageProps['mode'] }) {
  const t = useT(strings);
  const tk = useT(planStrings);
  const tc = useT(common);
  const nav = useNavigate();
  const portal = usePortal();
  const drawer = useDrawerParams();

  const user = useAppStore((s) => s.user);
  const approvals = useAppStore((s) => s.approvals);
  const audit = useAppStore((s) => s.audit);
  const proposeBlocks = useAppStore((s) => s.proposeBlocks);
  const concur = useAppStore((s) => s.concur);
  const grant = useAppStore((s) => s.grant);
  const refuse = useAppStore((s) => s.refuse);
  const lock = useAppStore((s) => s.lock);
  const notify = useAppStore((s) => s.notify);
  const addAudit = useAppStore((s) => s.addAudit);
  const toast = useAppStore((s) => s.toast);

  const mode: 'planning' | 'control' = modeProp ?? (portal === 'control' ? 'control' : 'planning');
  const canPlan = can(user, 'plan');
  const canGrant = can(user, 'grant');
  const canLock = can(user, 'lock');
  const corridor = snapshot.corridor;
  const days = snapshot.result.weekly.kpis.days;
  const deptName = (d: Dept) => tc(d === 'TMS' ? 'tms' : d === 'SMMS' ? 'smms' : 'tdms');

  const [filter, setFilter] = useState<FilterTab>('ALL');
  const [dayFilter, setDayFilter] = useState<number | 'ALL'>('ALL');
  const [deptFilter, setDeptFilter] = useState<Dept | 'ALL'>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(drawer.blockId);
  const [panel, setPanel] = useState<PanelTab>('concurrence');
  const [modal, setModal] = useState<'concur' | 'refuse' | null>(null);
  const [concurDept, setConcurDept] = useState<Dept>('TMS');
  const [officer, setOfficer] = useState('');
  const [concurNote, setConcurNote] = useState('');
  const [refuseKey, setRefuseKey] = useState<RefuseKey>('refTraffic');
  const [refuseDetail, setRefuseDetail] = useState('');
  const [touched, setTouched] = useState(false);

  const blocks = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals]);

  const counts = useMemo(() => {
    const c: Record<FilterTab, number> = { ALL: blocks.length, DRAFT: 0, AWAITING: 0, READY: 0, GRANTED: 0, LOCKED: 0, REFUSED: 0, OBJECTIONS: 0 };
    for (const b of blocks) {
      c[flowState(b)]++;
      if (b.approval?.objections.length) c.OBJECTIONS++;
    }
    return c;
  }, [blocks]);

  const rows = useMemo(
    () =>
      blocks.filter((b) => {
        if (dayFilter !== 'ALL' && b.day !== dayFilter) return false;
        if (deptFilter !== 'ALL' && !b.departments.includes(deptFilter)) return false;
        if (filter === 'OBJECTIONS') return !!b.approval?.objections.length;
        if (filter !== 'ALL') return flowState(b) === filter;
        return true;
      }),
    [blocks, dayFilter, deptFilter, filter]
  );

  const active: WorkingBlock | null = useMemo(() => (selectedId ? blocks.find((b) => b.id === selectedId) ?? null : rows[0] ?? null), [blocks, selectedId, rows]);

  const lastAction = useMemo(() => {
    const m = new Map<string, { by: string; at: string }>();
    for (const e of audit) if (e.entityType === 'block' && !m.has(e.entityId)) m.set(e.entityId, { by: e.by, at: e.at });
    return m;
  }, [audit]);

  const blockEvents = useMemo(() => (active ? audit.filter((e) => e.entityType === 'block' && e.entityId === active.id) : []), [audit, active]);
  const blockAdvisories = useMemo(() => (active ? advisories(snapshot, [active], true) : []), [snapshot, active]);
  const payloadJson = useMemo(() => (active ? JSON.stringify(toBdmsDemand(active, corridor, snapshot.planStart), null, 2) : ''), [active, corridor, snapshot.planStart]);

  const drafts = blocks.filter((b) => flowState(b) === 'DRAFT');
  const d1Granted = blocks.filter((b) => b.day === 1 && b.status === 'GRANTED');
  const sentCount = blocks.length - counts.DRAFT;

  /* ── actions ─────────────────────────────────────────────── */
  const requestConcurrence = (list: WorkingBlock[]) => {
    if (!canPlan || !list.length) return;
    proposeBlocks(list.map((b) => b.id));
    const depts = DEPTS.filter((d) => list.some((b) => b.departments.includes(d)));
    const first = `${list[0].sectionText} · ${dateLabel(list[0].date)} ${list[0].startText}–${list[0].endText}`;
    for (const d of depts) {
      const n = list.filter((b) => b.departments.includes(d)).length;
      notify({ portals: [d.toLowerCase() as PortalId], dept: d, kind: 'ACTION', title: t('notifyDeptTitle', { n }), body: t('notifyDeptBody', { first }), route: `/app/${d.toLowerCase()}/blocks` });
    }
    notify({ portals: ['control'], kind: 'ACTION', title: t('notifyControlTitle', { n: list.length }), body: first, route: '/app/control/handoff' });
    toast({ title: t('requested', { depts: depts.map(deptName).join(', ') }), body: t('requestedBody', { n: list.length }), tone: 'ok' });
  };

  const openConcur = (b: WorkingBlock) => {
    const pending = b.departments.filter((d) => !b.approval?.concur[d]);
    setConcurDept(pending[0] ?? b.departments[0]);
    setOfficer('');
    setConcurNote('');
    setTouched(false);
    setModal('concur');
  };

  const submitConcur = () => {
    setTouched(true);
    if (!active || !officer.trim() || !concurNote.trim()) return;
    concur(active.id, concurDept, t('onBehalfNote', { officer: officer.trim(), note: concurNote.trim() }));
    toast({ title: t('concurToast', { dept: deptName(concurDept) }), body: active.id, tone: 'ok' });
    setModal(null);
  };

  const doGrant = (b: WorkingBlock) => {
    if (!canGrant) return;
    grant(b.id);
    toast({ title: t('grantedToast', { id: b.id }), body: `${b.sectionText} · ${b.startText}–${b.endText}`, tone: 'ok' });
  };

  const submitRefuse = () => {
    setTouched(true);
    if (!active || !canGrant) return;
    if (refuseKey === 'refOther' && !refuseDetail.trim()) return;
    const reason = `${t(refuseKey)}${refuseDetail.trim() ? ` — ${refuseDetail.trim()}` : ''}`;
    refuse(active.id, reason);
    toast({ title: t('refusedToast', { id: active.id }), body: reason, tone: 'warn' });
    setModal(null);
  };

  const doLock = (b: WorkingBlock) => {
    if (!canLock) return;
    lock(b.id);
    toast({ title: t('lockedToast', { id: b.id }), body: b.sectionText, tone: 'ok' });
  };

  const lockD1 = () => {
    if (!canLock || !d1Granted.length) return;
    for (const b of d1Granted) lock(b.id);
    toast({ title: t('lockedD1Toast', { n: d1Granted.length }), body: dateLabel(addDaysIso(snapshot.planStart, 1)), tone: 'ok' });
  };

  const exportFile = (kind: 'csv' | 'json') => {
    const name = `${corridor.code}-bdms-${snapshot.planStart}.${kind}`;
    if (kind === 'csv') download(name, blocksToCsv(rows, corridor), 'text/csv');
    else download(name, JSON.stringify(rows.map((b) => toBdmsDemand(b, corridor, snapshot.planStart)), null, 2), 'application/json');
    addAudit({ action: 'BDMS_EXPORTED', entityType: 'plan', entityId: corridor.code, detail: `Exported ${rows.length} blocks · ${kind.toUpperCase()}` });
    toast({ title: t('exported', { n: rows.length }), body: t('exportedBody'), tone: 'ok' });
  };

  const doCopy = async () => {
    const ok = await copyText(payloadJson);
    toast({ title: ok ? t('copied') : t('copyFailed'), body: active?.id, tone: ok ? 'ok' : 'warn' });
  };

  /* ── matrix ──────────────────────────────────────────────── */
  const pill = (b: WorkingBlock, d: Dept) => {
    if (!b.departments.includes(d)) return <span className="tiny muted">{t('none')}</span>;
    const obj = b.approval?.objections.find((o) => o.dept === d);
    if (obj) return <Badge tone="crit" title={obj.reason}>{t('pillObjection')}</Badge>;
    const c = b.approval?.concur[d];
    if (c) return <Badge tone="ok" title={`${c.by}${c.note ? ` · ${c.note}` : ''}`}>{t('pillConcurred')}</Badge>;
    return b.approval?.proposedAt ? <Badge tone="warn">{t('pillPending')}</Badge> : <Badge tone="gray">{t('pillNotAsked')}</Badge>;
  };

  const columns: Column<WorkingBlock>[] = [
    {
      key: 'block',
      header: t('colBlock'),
      render: (b) => (
        <div className="stack" style={{ gap: 2 }}>
          <span className="mono strong small">{b.id}</span>
          <span className="tiny muted">{b.kind}</span>
        </div>
      ),
    },
    {
      key: 'window',
      header: t('colWindow'),
      render: (b) => (
        <div className="stack" style={{ gap: 2 }}>
          <span className="mono small strong">
            {b.startText}–{b.endText}
          </span>
          <span className="tiny muted">
            {dateLabel(b.date)} · {duration(b.spanMin)}
          </span>
        </div>
      ),
    },
    {
      key: 'section',
      header: t('colSection'),
      hideMobile: true,
      render: (b) => (
        <span className="small">
          {b.sectionText} <Badge tone="gray">{b.line}</Badge>
        </span>
      ),
    },
    ...DEPTS.map((d) => ({ key: d, header: <DeptBadge dept={d} />, render: (b: WorkingBlock) => pill(b, d) })),
    {
      key: 'state',
      header: t('colState'),
      render: (b) => {
        const f = flowState(b);
        return <Badge tone={FLOW_TONE[f]}>{tk(FLOW_LABEL[f])}</Badge>;
      },
    },
    {
      key: 'last',
      header: t('colLast'),
      hideMobile: true,
      render: (b) => {
        const l = lastAction.get(b.id);
        return l ? (
          <span className="tiny muted">
            {l.by} · {timeAgo(l.at)}
          </span>
        ) : (
          <span className="tiny muted">{t('none')}</span>
        );
      },
    },
  ];

  const filterLabel = (f: FilterTab) => (f === 'ALL' ? t('allTab') : f === 'OBJECTIONS' ? t('objectionsTab') : tk(FLOW_LABEL[f]));

  /* ── panel ───────────────────────────────────────────────── */
  const activeFlow = active ? flowState(active) : null;
  const activeHasObjection = !!active?.approval?.objections.length;
  const pendingDepts = active ? active.departments.filter((d) => !active.approval?.concur[d]) : [];

  const panelBody = active && (
    <>
      {panel === 'concurrence' && (
        <div className="stack">
          {active.departments.map((d) => {
            const c = active.approval?.concur[d];
            const obj = active.approval?.objections.find((o) => o.dept === d);
            return (
              <div key={d} className="well stack" style={{ gap: 4 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <DeptBadge dept={d} long />
                  {pill(active, d)}
                </div>
                <span className="tiny muted">
                  {c
                    ? `${t('concurredBy', { by: c.by, when: timeAgo(c.at) })}${c.note ? ` · ${c.note}` : ''}`
                    : obj
                      ? t('objectedBy', { reason: obj.reason, by: obj.by, when: timeAgo(obj.at) })
                      : active.approval?.proposedAt
                        ? t('awaitingDept')
                        : t('notAskedDept')}
                </span>
              </div>
            );
          })}

          {mode === 'planning' ? (
            <div className="stack">
              <div className="row-wrap">
                {activeFlow === 'DRAFT' && (
                  <button type="button" className="btn btn-sm" disabled={!canPlan} title={canPlan ? undefined : t('noCapPlan')} onClick={() => requestConcurrence([active])}>
                    <Send size={13} /> {t('request')}
                  </button>
                )}
                {active.status === 'PROPOSED' && pendingDepts.length > 0 && (
                  <button type="button" className="btn btn-sm" disabled={!canPlan} title={canPlan ? undefined : t('noCapPlan')} onClick={() => openConcur(active)}>
                    <PhoneCall size={13} /> {t('onBehalf')}
                  </button>
                )}
                {(activeHasObjection || activeFlow === 'REFUSED') && (
                  <button type="button" className="btn btn-sm" onClick={() => nav(`/app/planning/weekly?block=${encodeURIComponent(active.id)}`)}>
                    <RotateCcw size={13} /> {t('rerun')}
                  </button>
                )}
              </div>
              <span className="tiny muted">{t('grantNote')}</span>
            </div>
          ) : (
            <div className="row-wrap">
              {activeFlow === 'READY' && (
                <button type="button" className="btn btn-sm btn-ok" disabled={!canGrant} title={canGrant ? undefined : t('noCapGrant')} onClick={() => doGrant(active)}>
                  <CheckCircle2 size={13} /> {t('grant')}
                </button>
              )}
              {active.status === 'PROPOSED' && (
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  disabled={!canGrant}
                  title={canGrant ? undefined : t('noCapGrant')}
                  onClick={() => {
                    setRefuseKey('refTraffic');
                    setRefuseDetail('');
                    setTouched(false);
                    setModal('refuse');
                  }}
                >
                  <XCircle size={13} /> {t('refuse')}
                </button>
              )}
              {active.status === 'GRANTED' && (
                <button type="button" className="btn btn-sm" disabled={!canLock} title={canLock ? undefined : t('noCapLock')} onClick={() => doLock(active)}>
                  <Lock size={13} /> {t('lock')}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {panel === 'export' && (
        <div className="stack">
          <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
            <span className="tiny muted">{t('payloadNote')}</span>
            <button type="button" className="btn btn-sm" onClick={() => void doCopy()}>
              <Copy size={13} /> {t('copy')}
            </button>
          </div>
          <pre className="well mono tiny" style={{ margin: 0, maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {payloadJson}
          </pre>
        </div>
      )}

      {panel === 'advisories' && (
        <div className="stack">
          <div className="row-wrap">
            <SimLabel kind="planningEstimate" />
            {active.status !== 'GRANTED' && active.status !== 'LOCKED' && <span className="tiny muted">{t('advisoryPublicNote')}</span>}
          </div>
          {blockAdvisories.length === 0 || blockAdvisories.every((a) => !a.trainNotices.length) ? (
            <Callout tone="ok">{t('noAdvisory')}</Callout>
          ) : (
            blockAdvisories.map((a) => (
              <div key={a.id} className="well stack" style={{ gap: 6 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="mono small strong">{a.bulletinNo}</span>
                  <Badge tone="gray">{t('trainsCount', { n: a.trainNotices.length })}</Badge>
                </div>
                <span className="small">{a.publicMessage}</span>
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                  {a.trainNotices.map((n, i) => (
                    <li key={`${n.trainNo}-${i}`}>
                      <span className="mono">{n.trainNo}</span> {n.name} — {t('heldUpTo', { n: n.expectedDelayMin })}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}

      {panel === 'events' && (blockEvents.length ? <AuditTrail entries={blockEvents} limit={20} /> : <div className="empty">{t('noEvents')}</div>)}
    </>
  );

  return (
    <div className="stack-lg">
      <PageHeader
        title={t('title')}
        lede={mode === 'control' ? t('ledeControl') : t('ledePlanning')}
        badges={
          <>
            <Badge tone="blue">{corridor.name}</Badge>
            <Badge tone="gray">
              {dateLabel(snapshot.planStart)} – {dateLabel(addDaysIso(snapshot.planStart, days - 1))}
            </Badge>
          </>
        }
        actions={
          <>
            <button type="button" className="btn btn-sm" disabled={!rows.length} onClick={() => exportFile('csv')}>
              <Download size={13} /> {t('exportCsv')}
            </button>
            <button type="button" className="btn btn-sm" disabled={!rows.length} onClick={() => exportFile('json')}>
              <FileJson size={13} /> {t('exportJson')}
            </button>
            {mode === 'planning' ? (
              <button type="button" className="btn btn-primary" disabled={!canPlan || !drafts.length} title={!canPlan ? t('noCapPlan') : drafts.length ? undefined : t('requestNone')} onClick={() => requestConcurrence(drafts)}>
                <Send size={14} /> {t('requestAll', { n: drafts.length })}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" disabled={!canLock || !d1Granted.length} title={!canLock ? t('noCapLock') : d1Granted.length ? undefined : t('lockD1None')} onClick={lockD1}>
                <Lock size={14} /> {t('lockD1', { n: d1Granted.length })}
              </button>
            )}
          </>
        }
      />

      <div className="stat-grid">
        <StatTile label={t('statDraft')} value={counts.DRAFT} />
        <StatTile label={t('statAwaiting')} value={counts.AWAITING} pastel={counts.AWAITING ? 'yellow' : undefined} />
        <StatTile label={t('statReady')} value={counts.READY} pastel={counts.READY ? 'blue' : undefined} />
        <StatTile label={t('statGranted')} value={counts.GRANTED} pastel={counts.GRANTED ? 'green' : undefined} />
        <StatTile label={t('statLocked')} value={counts.LOCKED} />
        <StatTile label={t('statObjections')} value={counts.OBJECTIONS} pastel={counts.OBJECTIONS ? 'pink' : undefined} />
      </div>

      <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
        <Tabs<FilterTab> tabs={FILTERS.map((f) => ({ id: f, label: filterLabel(f), count: counts[f] }))} value={filter} onChange={setFilter} />
        <div className="row-wrap">
          <select className="select" style={{ width: 'auto' }} value={dayFilter} onChange={(e) => setDayFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))} aria-label={t('allDays')}>
            <option value="ALL">{t('allDays')}</option>
            {Array.from({ length: days }, (_, d) => (
              <option key={d} value={d}>
                {dateLabel(addDaysIso(snapshot.planStart, d))}
              </option>
            ))}
          </select>
          <select className="select" style={{ width: 'auto' }} value={deptFilter} onChange={(e) => setDeptFilter(e.target.value as Dept | 'ALL')} aria-label={t('allDepts')}>
            <option value="ALL">{t('allDepts')}</option>
            {DEPTS.map((d) => (
              <option key={d} value={d}>
                {deptName(d)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-main-aside" style={{ alignItems: 'start' }}>
        <Card>
          <CardHead title={t('matrixTitle')} sub={t('matrixSub', { n: rows.length })} />
          <CardBody flush>
            <div data-tour="handoff-matrix">
              {rows.length ? (
                <DataTable<WorkingBlock> rows={rows} columns={columns} rowKey={(b) => b.id} onRowClick={(b) => setSelectedId(b.id)} selectedKey={active?.id ?? null} compact maxHeight={620} />
              ) : (
                <EmptyState
                  title={sentCount === 0 && filter !== 'DRAFT' ? t('emptySent') : t('emptyFilter')}
                  action={
                    <button type="button" className="btn btn-sm" onClick={() => nav(mode === 'control' ? '/app/control/weekly' : '/app/planning/weekly')}>
                      {t('openWeekly')}
                    </button>
                  }
                />
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          {active ? (
            <>
              <CardHead
                title={
                  <span className="row-wrap" style={{ gap: 6 }}>
                    <span className="mono">{active.id}</span>
                    {activeFlow && <Badge tone={FLOW_TONE[activeFlow]}>{tk(FLOW_LABEL[activeFlow])}</Badge>}
                  </span>
                }
                sub={`${active.sectionText} · ${active.line} · ${dateLabel(active.date)} ${active.startText}–${active.endText}`}
                right={
                  <button type="button" className="btn btn-sm" onClick={() => drawer.open('block', active.id)}>
                    <ExternalLink size={13} /> {t('openBlock')}
                  </button>
                }
              />
              <CardBody>
                <div className="stack">
                  <Tabs<PanelTab>
                    tabs={[
                      { id: 'concurrence', label: t('tabConcurrence') },
                      { id: 'export', label: t('tabExport') },
                      { id: 'advisories', label: t('tabAdvisories'), count: blockAdvisories.reduce((a, x) => a + x.trainNotices.length, 0) },
                      { id: 'events', label: t('tabEvents'), count: blockEvents.length },
                    ]}
                    value={panel}
                    onChange={setPanel}
                  />
                  {panelBody}
                </div>
              </CardBody>
            </>
          ) : (
            <CardBody>
              <div className="empty">{sentCount === 0 ? t('emptySent') : t('selectPrompt')}</div>
            </CardBody>
          )}
        </Card>
      </div>

      <BlockDrawer blockId={drawer.blockId} onClose={() => drawer.close('block')} />

      {active && (
        <Modal
          open={modal === 'concur'}
          onClose={() => setModal(null)}
          title={t('modalConcurTitle')}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>
                {tc('cancel')}
              </button>
              <button type="button" className="btn btn-primary" onClick={submitConcur}>
                {t('confirm')}
              </button>
            </>
          }
        >
          <div className="stack">
            <span className="small muted">{t('modalConcurBody')}</span>
            <div className="well small">
              <span className="mono">{active.id}</span> · {active.sectionText} · {dateLabel(active.date)} {active.startText}–{active.endText}
            </div>
            <Field label={t('fieldDept')} htmlFor="concur-dept">
              <select id="concur-dept" className="select" value={concurDept} onChange={(e) => setConcurDept(e.target.value as Dept)}>
                {(pendingDepts.length ? pendingDepts : active.departments).map((d) => (
                  <option key={d} value={d}>
                    {deptName(d)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('fieldOfficer')} htmlFor="concur-officer" error={touched && !officer.trim() ? t('officerRequired') : undefined}>
              <input id="concur-officer" className="input" value={officer} onChange={(e) => setOfficer(e.target.value)} />
            </Field>
            <Field label={t('fieldNote')} htmlFor="concur-note" error={touched && !concurNote.trim() ? t('noteRequired') : undefined}>
              <textarea id="concur-note" className="textarea" rows={3} value={concurNote} onChange={(e) => setConcurNote(e.target.value)} />
            </Field>
          </div>
        </Modal>
      )}

      {active && (
        <Modal
          open={modal === 'refuse'}
          onClose={() => setModal(null)}
          title={t('modalRefuseTitle')}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>
                {tc('cancel')}
              </button>
              <button type="button" className="btn btn-danger" onClick={submitRefuse}>
                {t('confirm')}
              </button>
            </>
          }
        >
          <div className="stack">
            <span className="small muted">{t('modalRefuseBody')}</span>
            <Field label={t('fieldReason')} htmlFor="refuse-reason">
              <select id="refuse-reason" className="select" value={refuseKey} onChange={(e) => setRefuseKey(e.target.value as RefuseKey)}>
                {REFUSE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {t(k)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('fieldDetail')} htmlFor="refuse-detail" error={touched && refuseKey === 'refOther' && !refuseDetail.trim() ? t('detailRequired') : undefined}>
              <textarea id="refuse-detail" className="textarea" rows={3} value={refuseDetail} onChange={(e) => setRefuseDetail(e.target.value)} />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
