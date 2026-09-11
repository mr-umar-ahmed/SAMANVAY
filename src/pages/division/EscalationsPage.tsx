/**
 * EscalationsPage — /app/division/escalations (spec §3.22).
 * What needs an officer: mandatory works past their floor, blocks refused
 * twice or more, requisitions stale for 14 days, reports open for 48 h,
 * works the fitted escalation model rates ≥ 60 %, and escalations raised by
 * other desks. Items come from select.derivedEscalations + the store; review
 * marks are kept in the audit trail (derived items) or on the escalation.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCheck, ExternalLink, Pin, PinOff, Send } from 'lucide-react';
import { useAppStore, type AuditEntry } from '../../store/useAppStore';
import type { Dept, Task } from '../../engine/types';
import { derivedEscalations, placement, workingBlocks } from '../../engine/select';
import { WORK_TYPES } from '../../engine/constants.js';
import { can } from '../../auth/portals';
import { useT } from '../../i18n';
import { common } from '../../i18n/common';
import { DEPT_LABEL, dateLabel, pct, timeAgo } from '../../lib/format';
import { Badge, Callout, Card, CardBody, CardFoot, DataTable, DeptBadge, Drawer, EmptyState, Field, KeyValue, Modal, PageHeader, PlanPending, StatTile, Tabs, type Column } from '../../components/ui';
import { AuditTrail, SimLabel } from '../../components/ui/extras';
import { TaskDrawer } from '../../components/domain/TaskDrawer';
import { BlockDrawer } from '../../components/domain/BlockDrawer';
import { ReportDrawer } from '../../components/domain/ReportDrawer';
import { useDrawerParams } from '../../components/domain/useDrawerParams';

const DEPTS: Dept[] = ['TMS', 'SMMS', 'TDMS'];
const DAY_MS = 86400000;
const WT = WORK_TYPES as Record<string, { label: string }>;
/** Age of a timestamp against the wall clock (same basis as lib/format timeAgo). */
const ageMs = (iso: string) => Date.now() - new Date(iso).getTime();

type Kind = 'mandatory' | 'refused' | 'stale' | 'incident' | 'escalation-risk' | 'manual';
type TabId = 'all' | Kind;

/** Stat tile row: kit .grid with a one-off column template. */
const TILES = { gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' } as const;

const strings = {
  en: {
    title: 'Escalations',
    lede: 'Items that need an officer on {corridor}. Reviewing an item records it in the audit trail; pinning raises a work to the mandatory floor for the next run.',
    tabAll: 'All',
    tabMandatory: 'Mandatory past floor',
    tabRefused: 'Refused ≥ 2',
    tabStale: 'Stale requisitions',
    tabIncident: 'Open reports',
    tabRisk: 'Predicted',
    tabManual: 'Raised',
    showReviewed: 'Show reviewed items',
    sOpen: 'Open items',
    sOpenSub: 'Not yet reviewed',
    sMandatory: 'Mandatory past floor',
    sMandatorySub: 'Statutory works',
    sRefused: 'Refused ≥ 2',
    sRefusedSub: 'Blocks refused by Control',
    sRisk: 'Predicted ≥ 60 %',
    sRiskSub: 'Unplaced works, fitted model',
    sReviewed: 'Reviewed',
    sReviewedSub: 'By an officer',
    colItem: 'Item',
    colDept: 'Dept',
    colAge: 'Age',
    colReason: 'Reason',
    colProb: 'Predicted escalation',
    colBlock: 'Planned block',
    colState: 'State',
    colActions: 'Actions',
    kindMandatory: 'Mandatory past floor',
    kindRefused: 'Refused by Control',
    kindStale: 'Stale requisition',
    kindIncident: 'Report open > 48 h',
    kindRisk: 'Predicted escalation',
    kindManual: 'Raised',
    rMandatoryPast: 'Placed this week but past its statutory floor of {n} d',
    rMandatoryUnplaced: 'Could not be placed this week (statutory floor {n} d)',
    rRefused: 'Refused {n} times. Last reason: {reason}',
    rStale: '{work} awaiting the planning cell since {when}',
    rRisk: '{p} probability of escalating to a stricter TSR within 30 days if unattended',
    whenOverdue: '{n} d overdue',
    whenDue: 'due in {n} d',
    whenDueToday: 'due today',
    whenRefused: '{n}× refused',
    whenDays: '{n} d',
    notPlaced: 'Not placed',
    stOpen: 'Open',
    stReviewed: 'Reviewed',
    pinned: 'Pinned',
    review: 'Mark reviewed',
    reviewed: 'Marked reviewed',
    reviewedBody: '{ref} — recorded in the audit trail',
    reviewedBy: 'Reviewed by {by} · {when}',
    open: 'Open item',
    details: 'Details',
    pin: 'Pin to next run',
    unpin: 'Unpin',
    pinnedToast: 'Pinned — will be placed in the next run',
    pinnedBody: '{id} raised to the mandatory floor; planning cell notified',
    unpinnedToast: 'Unpinned',
    unpinnedBody: '{id} returns to its ARCI rank on the next run',
    notifyPinTitle: 'Pinned by the division: {id}',
    notifyPinBody: '{label} — raise it in the next run',
    noPin: 'Pinning needs the authorise or plan capability',
    direct: 'Direct department',
    modalTitle: 'Direction to a department',
    modalHint: 'The direction is recorded in the audit trail and sent to the department portal.',
    recipient: 'Department',
    allDepts: 'All departments and cells',
    note: 'Direction',
    send: 'Send direction',
    sent: 'Direction sent',
    sentBody: 'To {dept}',
    needsNote: 'Write the direction first',
    noAuth: 'Directions need the authorise capability (DRM).',
    history: 'History',
    historyEmpty: 'No actions recorded on this item yet.',
    kvKind: 'Type',
    kvRef: 'Reference',
    kvDept: 'Department',
    kvAge: 'Age',
    kvProb: 'Predicted escalation',
    kvBlock: 'Planned block',
    kvState: 'State',
    empty: 'Nothing needs escalation.',
    emptyFiltered: 'Nothing in this list. Reviewed items are hidden.',
    modelNote: 'Escalation probability from a logistic model fitted on seeded history (held-out AUC {auc}).',
  },
  hi: {
    title: 'एस्केलेशन',
    lede: '{corridor} पर अधिकारी की आवश्यकता वाली मदें। समीक्षा ऑडिट ट्रेल में दर्ज होती है; पिन करने से कार्य अगले run में अनिवार्य फ़्लोर पर आता है।',
    tabAll: 'सभी',
    tabMandatory: 'फ़्लोर पार अनिवार्य',
    tabRefused: 'अस्वीकृत ≥ 2',
    tabStale: 'पुरानी requisition',
    tabIncident: 'खुली रिपोर्टें',
    tabRisk: 'अनुमानित',
    tabManual: 'उठाई गई',
    showReviewed: 'समीक्षित मदें दिखाएँ',
    sOpen: 'खुली मदें',
    sOpenSub: 'अभी समीक्षा नहीं',
    sMandatory: 'फ़्लोर पार अनिवार्य',
    sMandatorySub: 'वैधानिक कार्य',
    sRefused: 'अस्वीकृत ≥ 2',
    sRefusedSub: 'Control द्वारा अस्वीकृत ब्लॉक',
    sRisk: 'अनुमानित ≥ 60 %',
    sRiskSub: 'अनियोजित कार्य, fitted मॉडल',
    sReviewed: 'समीक्षित',
    sReviewedSub: 'अधिकारी द्वारा',
    colItem: 'मद',
    colDept: 'विभाग',
    colAge: 'आयु',
    colReason: 'कारण',
    colProb: 'अनुमानित एस्केलेशन',
    colBlock: 'नियोजित ब्लॉक',
    colState: 'स्थिति',
    colActions: 'कार्रवाई',
    kindMandatory: 'फ़्लोर पार अनिवार्य',
    kindRefused: 'Control द्वारा अस्वीकृत',
    kindStale: 'पुरानी requisition',
    kindIncident: '48 घंटे से खुली रिपोर्ट',
    kindRisk: 'अनुमानित एस्केलेशन',
    kindManual: 'उठाई गई',
    rMandatoryPast: 'इस सप्ताह नियोजित पर {n} दिन के वैधानिक फ़्लोर से बाहर',
    rMandatoryUnplaced: 'इस सप्ताह नियोजित नहीं हो सका (वैधानिक फ़्लोर {n} दिन)',
    rRefused: '{n} बार अस्वीकृत। अंतिम कारण: {reason}',
    rStale: '{work} {when} से योजना प्रकोष्ठ की प्रतीक्षा में',
    rRisk: 'यदि अनदेखा रहा तो 30 दिन में कड़े TSR में बदलने की {p} संभावना',
    whenOverdue: '{n} दिन अतिदेय',
    whenDue: '{n} दिन में देय',
    whenDueToday: 'आज देय',
    whenRefused: '{n}× अस्वीकृत',
    whenDays: '{n} दिन',
    notPlaced: 'नियोजित नहीं',
    stOpen: 'खुली',
    stReviewed: 'समीक्षित',
    pinned: 'पिन',
    review: 'समीक्षित चिह्नित करें',
    reviewed: 'समीक्षित चिह्नित',
    reviewedBody: '{ref} — ऑडिट ट्रेल में दर्ज',
    reviewedBy: '{by} द्वारा समीक्षित · {when}',
    open: 'मद खोलें',
    details: 'विवरण',
    pin: 'अगले run में पिन करें',
    unpin: 'पिन हटाएँ',
    pinnedToast: 'पिन किया — अगले run में नियोजित होगा',
    pinnedBody: '{id} अनिवार्य फ़्लोर पर; योजना प्रकोष्ठ को सूचना',
    unpinnedToast: 'पिन हटाया',
    unpinnedBody: '{id} अगले run में अपने ARCI क्रम पर लौटेगा',
    notifyPinTitle: 'मंडल द्वारा पिन: {id}',
    notifyPinBody: '{label} — अगले run में लें',
    noPin: 'पिन के लिए authorise या plan क्षमता चाहिए',
    direct: 'विभाग को निर्देश',
    modalTitle: 'विभाग को निर्देश',
    modalHint: 'निर्देश ऑडिट ट्रेल में दर्ज होता है और विभाग पोर्टल पर भेजा जाता है।',
    recipient: 'विभाग',
    allDepts: 'सभी विभाग और प्रकोष्ठ',
    note: 'निर्देश',
    send: 'निर्देश भेजें',
    sent: 'निर्देश भेजा गया',
    sentBody: '{dept} को',
    needsNote: 'पहले निर्देश लिखें',
    noAuth: 'निर्देश के लिए authorise क्षमता (DRM) चाहिए।',
    history: 'इतिहास',
    historyEmpty: 'इस मद पर अभी कोई कार्रवाई दर्ज नहीं।',
    kvKind: 'प्रकार',
    kvRef: 'संदर्भ',
    kvDept: 'विभाग',
    kvAge: 'आयु',
    kvProb: 'अनुमानित एस्केलेशन',
    kvBlock: 'नियोजित ब्लॉक',
    kvState: 'स्थिति',
    empty: 'किसी एस्केलेशन की आवश्यकता नहीं।',
    emptyFiltered: 'इस सूची में कुछ नहीं। समीक्षित मदें छिपी हैं।',
    modelNote: 'एस्केलेशन संभावना seeded इतिहास पर fitted logistic मॉडल से (held-out AUC {auc})।',
  },
} as const;

type Key = keyof typeof strings.en;

const KIND_LABEL: Record<Kind, Key> = { mandatory: 'kindMandatory', refused: 'kindRefused', stale: 'kindStale', incident: 'kindIncident', 'escalation-risk': 'kindRisk', manual: 'kindManual' };
const KIND_TONE: Record<Kind, 'crit' | 'warn' | 'info' | 'gray'> = { mandatory: 'crit', refused: 'crit', stale: 'warn', incident: 'warn', 'escalation-risk': 'info', manual: 'gray' };

interface Row {
  id: string;
  kind: Kind;
  ref: string;
  dept: Dept | null;
  title: string;
  reason: string;
  age: string;
  probability: number | null;
  taskId?: string;
  blockId?: string;
  reportId?: string;
  reqId?: string;
  reqNo?: string;
  manualId?: string;
  planned: string | null;
  reviewed: { by: string; at: string } | null;
  pinned: boolean;
}

export default function EscalationsPage() {
  const t = useT(strings);
  const tc = useT(common);
  const nav = useNavigate();
  const drawer = useDrawerParams();
  const [params, setParams] = useSearchParams();

  const snapshot = useAppStore((s) => s.snapshot);
  const user = useAppStore((s) => s.user);
  const approvals = useAppStore((s) => s.approvals);
  const requisitions = useAppStore((s) => s.requisitions);
  const reports = useAppStore((s) => s.reports);
  const escalations = useAppStore((s) => s.escalations);
  const audit = useAppStore((s) => s.audit);
  const pinnedTaskIds = useAppStore((s) => s.pinnedTaskIds);
  const pinTask = useAppStore((s) => s.pinTask);
  const unpinTask = useAppStore((s) => s.unpinTask);
  const reviewEscalation = useAppStore((s) => s.reviewEscalation);
  const addAudit = useAppStore((s) => s.addAudit);
  const notify = useAppStore((s) => s.notify);
  const direct = useAppStore((s) => s.direct);
  const toast = useAppStore((s) => s.toast);

  const [tab, setTab] = useState<TabId>('all');
  const [showReviewed, setShowReviewed] = useState(false);
  const [dirOpen, setDirOpen] = useState(false);
  const [dirDept, setDirDept] = useState<Dept | 'ALL'>('ALL');
  const [dirNote, setDirNote] = useState('');

  const canDirect = can(user, 'authorise');
  const canPin = can(user, 'authorise') || can(user, 'plan');

  const blocks = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals]);

  const reviewedAudit = useMemo(() => {
    const m = new Map<string, AuditEntry>();
    for (const a of audit) if (a.action === 'ESCALATION_REVIEWED' && !m.has(a.entityId)) m.set(a.entityId, a);
    return m;
  }, [audit]);

  const rows: Row[] = useMemo(() => {
    if (!snapshot) return [];
    const corridorId = snapshot.corridor.id;
    const reqs = requisitions.filter((r) => r.corridorId === corridorId);
    const reps = reports.filter((r) => r.corridorId === corridorId);
    const taskById = new Map<string, Task>(snapshot.tasks.map((x) => [x.id, x]));
    const scheduled = new Set(snapshot.result.weekly.ai.scheduled.map((s) => s.taskId));
    const ageOfTask = (x: Task) => (x.daysOverdue > 0 ? t('whenOverdue', { n: x.daysOverdue }) : x.daysOverdue === 0 ? t('whenDueToday') : t('whenDue', { n: -x.daysOverdue }));
    const plannedOfTask = (x: Task) => {
      const p = placement(snapshot, blocks, x.id);
      return p.block ? `${p.block.id} · ${dateLabel(p.block.date)} ${p.block.startText}–${p.block.endText}` : null;
    };
    const derived = derivedEscalations(
      snapshot,
      blocks,
      approvals,
      reqs.map((r) => ({ id: r.id, no: r.no, dept: r.dept, status: r.status, updatedAt: r.updatedAt })),
      reps.map((r) => ({ id: r.id, at: r.at, status: r.status, dept: r.dept, description: r.description }))
    );
    const out: Row[] = [];
    for (const e of derived) {
      const rev = reviewedAudit.get(e.id);
      const base = { id: e.id, kind: e.kind as Kind, ref: e.ref, dept: e.dept, reviewed: rev ? { by: rev.by, at: rev.at } : null, pinned: false, probability: null, planned: null };
      if (e.kind === 'mandatory' || e.kind === 'escalation-risk') {
        const x = taskById.get(e.ref);
        if (!x) continue;
        out.push({
          ...base,
          title: `${x.label} · ${x.sectionLabel}`,
          reason: e.kind === 'mandatory' ? t(scheduled.has(x.id) ? 'rMandatoryPast' : 'rMandatoryUnplaced', { n: x.mandatoryWithinDays }) : t('rRisk', { p: pct(x.risk.escalation, 0) }),
          age: ageOfTask(x),
          probability: x.risk.escalation,
          taskId: x.id,
          planned: plannedOfTask(x),
          pinned: pinnedTaskIds.includes(x.id),
        });
      } else if (e.kind === 'refused') {
        const a = approvals[e.ref];
        const b = blocks.find((x) => x.id === e.ref);
        out.push({
          ...base,
          title: b ? `${b.id} · ${b.sectionText} · ${b.line}` : e.ref,
          reason: t('rRefused', { n: a?.refusal?.count ?? 0, reason: a?.refusal?.reason ?? '—' }),
          age: t('whenRefused', { n: a?.refusal?.count ?? 0 }),
          blockId: e.ref,
          dept: b?.departments[0] ?? null,
          planned: b ? `${dateLabel(b.date)} ${b.startText}–${b.endText}` : null,
        });
      } else if (e.kind === 'stale') {
        const r = reqs.find((x) => x.no === e.ref);
        if (!r) continue;
        const days = Math.round(ageMs(r.updatedAt) / DAY_MS);
        out.push({
          ...base,
          title: `${r.no} · km ${r.startKm}–${r.endKm} ${r.line}`,
          reason: t('rStale', { work: WT[r.workType]?.label ?? r.workType, when: dateLabel(r.updatedAt.slice(0, 10)) }),
          age: t('whenDays', { n: days }),
          reqId: r.id,
          reqNo: r.no,
        });
      } else if (e.kind === 'incident') {
        const r = reps.find((x) => x.id === e.ref);
        if (!r) continue;
        out.push({
          ...base,
          title: `${r.id} · ${r.category}${r.km !== undefined ? ` · km ${r.km.toFixed(1)}` : ''}`,
          reason: r.description,
          age: timeAgo(r.at),
          reportId: r.id,
        });
      }
    }
    for (const m of escalations) {
      const x = taskById.get(m.ref);
      const b = blocks.find((y) => y.id === m.ref);
      out.push({
        id: m.id,
        kind: 'manual',
        ref: m.ref,
        dept: x?.dept ?? b?.departments[0] ?? null,
        title: `${m.id} · ${m.ref}`,
        reason: m.note,
        age: timeAgo(m.at),
        probability: x ? x.risk.escalation : null,
        taskId: x?.id,
        blockId: b?.id,
        manualId: m.id,
        planned: x ? plannedOfTask(x) : b ? `${dateLabel(b.date)} ${b.startText}–${b.endText}` : null,
        reviewed: m.reviewed ?? null,
        pinned: x ? pinnedTaskIds.includes(x.id) : false,
      });
    }
    return out;
  }, [snapshot, blocks, approvals, requisitions, reports, escalations, reviewedAudit, pinnedTaskIds, t]);

  const selectedId = params.get('item');
  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);
  const history = useMemo(() => {
    if (!selected) return [];
    const refs = new Set([selected.id, selected.ref, selected.taskId, selected.blockId, selected.reportId, selected.reqNo, selected.manualId].filter(Boolean) as string[]);
    return audit.filter((a) => refs.has(a.entityId));
  }, [audit, selected]);

  if (!snapshot) return <PlanPending />;

  const open = rows.filter((r) => !r.reviewed);
  const visible = rows.filter((r) => (tab === 'all' || r.kind === tab) && (showReviewed || !r.reviewed));
  const count = (k: Kind) => rows.filter((r) => r.kind === k && (showReviewed || !r.reviewed)).length;

  const setItem = (id: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('item', id);
        else next.delete('item');
        return next;
      },
      { replace: true }
    );

  const openItem = (r: Row) => {
    if (r.reqId) {
      nav(`/app/planning/demands?req=${encodeURIComponent(r.reqId)}`);
      return;
    }
    const kind = r.taskId ? 'task' : r.blockId ? 'block' : r.reportId ? 'report' : null;
    const id = r.taskId ?? r.blockId ?? r.reportId;
    if (!kind || !id) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('item');
        next.set(kind, id);
        return next;
      },
      { replace: true }
    );
  };

  const markReviewed = (r: Row) => {
    if (r.manualId) reviewEscalation(r.manualId);
    else addAudit({ action: 'ESCALATION_REVIEWED', entityType: 'escalation', entityId: r.id, detail: `${r.kind} · ${r.ref}` });
    toast({ title: t('reviewed'), body: t('reviewedBody', { ref: r.ref }), tone: 'ok' });
  };

  const togglePin = (r: Row) => {
    if (!r.taskId) return;
    const task = snapshot.tasks.find((x) => x.id === r.taskId);
    if (r.pinned) {
      unpinTask(r.taskId);
      addAudit({ action: 'TASK_UNPINNED', entityType: 'task', entityId: r.taskId, detail: 'Returned to its ARCI rank for the next run' });
      toast({ title: t('unpinnedToast'), body: t('unpinnedBody', { id: r.taskId }), tone: 'info' });
    } else {
      pinTask(r.taskId);
      notify({ portals: ['planning'], kind: 'ACTION', title: t('notifyPinTitle', { id: r.taskId }), body: t('notifyPinBody', { label: task?.label ?? r.title }), route: `/app/planning/risk?task=${r.taskId}` });
      toast({ title: t('pinnedToast'), body: t('pinnedBody', { id: r.taskId }), tone: 'ok' });
    }
  };

  const openDirect = (r: Row | null) => {
    setDirDept(r?.dept ?? 'ALL');
    setDirNote(r ? `${r.title}: ` : '');
    setDirOpen(true);
  };

  const closeDirect = () => {
    setDirOpen(false);
    setDirNote('');
  };

  const sendDirection = () => {
    const note = dirNote.trim();
    if (!note) {
      toast({ title: t('needsNote'), tone: 'warn' });
      return;
    }
    direct(dirDept, note);
    toast({ title: t('sent'), body: t('sentBody', { dept: dirDept === 'ALL' ? t('allDepts') : DEPT_LABEL[dirDept].long }), tone: 'ok' });
    closeDirect();
  };

  const auc = snapshot.models.escalationMetrics.test.auc;

  const columns: Column<Row>[] = [
    {
      key: 'item',
      header: t('colItem'),
      render: (r) => (
        <div className="stack" style={{ gap: 3, minWidth: 180 }}>
          <span className="small strong">{r.title}</span>
          <span className="row-wrap" style={{ gap: 6 }}>
            <Badge tone={KIND_TONE[r.kind]}>{t(KIND_LABEL[r.kind])}</Badge>
            <span className="mono tiny muted">{r.ref}</span>
          </span>
        </div>
      ),
    },
    { key: 'dept', header: t('colDept'), render: (r) => (r.dept ? <DeptBadge dept={r.dept} /> : <span className="muted">—</span>) },
    { key: 'age', header: t('colAge'), render: (r) => <span className="small" style={{ whiteSpace: 'nowrap' }}>{r.age}</span> },
    { key: 'reason', header: t('colReason'), hideMobile: true, render: (r) => <span className="small" style={{ display: 'block', maxWidth: 360 }}>{r.reason}</span> },
    {
      key: 'prob',
      header: (
        <span className="row" style={{ gap: 4 }}>
          {t('colProb')} <SimLabel kind="model" short />
        </span>
      ),
      num: true,
      render: (r) => (r.probability === null ? <span className="muted">—</span> : <span style={{ color: r.probability >= 0.6 ? 'var(--crit)' : undefined }}>{pct(r.probability, 0)}</span>),
    },
    { key: 'block', header: t('colBlock'), hideMobile: true, render: (r) => (r.planned ? <span className="small mono">{r.planned}</span> : <span className="small muted">{r.taskId ? t('notPlaced') : '—'}</span>) },
    {
      key: 'state',
      header: t('colState'),
      render: (r) => (
        <span className="row-wrap" style={{ gap: 4 }}>
          <Badge tone={r.reviewed ? 'ok' : 'outline'}>{r.reviewed ? t('stReviewed') : t('stOpen')}</Badge>
          {r.pinned && (
            <Badge tone="info" icon={<Pin size={10} />}>
              {t('pinned')}
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: 'actions',
      header: t('colActions'),
      render: (r) => (
        <span className="row" style={{ gap: 6 }}>
          {!r.reviewed && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                markReviewed(r);
              }}
            >
              <CheckCheck /> {t('review')}
            </button>
          )}
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={(e) => {
              e.stopPropagation();
              setItem(r.id);
            }}
          >
            {t('details')}
          </button>
        </span>
      ),
    },
  ];

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'all', label: t('tabAll'), count: showReviewed ? rows.length : open.length },
    { id: 'mandatory', label: t('tabMandatory'), count: count('mandatory') },
    { id: 'refused', label: t('tabRefused'), count: count('refused') },
    { id: 'stale', label: t('tabStale'), count: count('stale') },
    { id: 'incident', label: t('tabIncident'), count: count('incident') },
    { id: 'escalation-risk', label: t('tabRisk'), count: count('escalation-risk') },
    { id: 'manual', label: t('tabManual'), count: count('manual') },
  ];

  return (
    <div className="stack-lg">
      <PageHeader
        title={t('title')}
        lede={t('lede', { corridor: snapshot.corridor.name })}
        badges={<SimLabel kind="model" />}
        actions={
          <button type="button" className="btn btn-sm btn-primary" onClick={() => openDirect(null)} disabled={!canDirect} title={canDirect ? undefined : t('noAuth')}>
            <Send /> {t('direct')}
          </button>
        }
      />

      <div className="grid" style={TILES}>
        <StatTile label={t('sOpen')} value={open.length} sub={t('sOpenSub')} pastel="pink" />
        <StatTile label={t('sMandatory')} value={open.filter((r) => r.kind === 'mandatory').length} sub={t('sMandatorySub')} />
        <StatTile label={t('sRefused')} value={open.filter((r) => r.kind === 'refused').length} sub={t('sRefusedSub')} />
        <StatTile label={t('sRisk')} value={open.filter((r) => r.kind === 'escalation-risk').length} sub={t('sRiskSub')} />
        <StatTile label={t('sReviewed')} value={rows.length - open.length} sub={t('sReviewedSub')} />
      </div>

      <div className="row-between">
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
        <label className="check small">
          <input type="checkbox" checked={showReviewed} onChange={(e) => setShowReviewed(e.target.checked)} />
          {t('showReviewed')}
        </label>
      </div>

      <Card>
        <CardBody flush>
          <div data-tour="escalations-table">
            <DataTable
              columns={columns}
              rows={visible}
              rowKey={(r) => r.id}
              onRowClick={(r) => setItem(r.id)}
              selectedKey={selectedId}
              empty={<EmptyState title={rows.length ? t('emptyFiltered') : t('empty')} />}
            />
          </div>
        </CardBody>
        <CardFoot>
          <span className="tiny muted">{t('modelNote', { auc: auc.toFixed(2) })}</span>
        </CardFoot>
      </Card>

      <Drawer
        open={!!selected}
        onClose={() => setItem(null)}
        title={selected?.title ?? ''}
        subtitle={selected ? t(KIND_LABEL[selected.kind]) : undefined}
        badges={
          selected ? (
            <>
              {selected.dept && <DeptBadge dept={selected.dept} />}
              <Badge tone={selected.reviewed ? 'ok' : 'outline'}>{selected.reviewed ? t('stReviewed') : t('stOpen')}</Badge>
              {selected.pinned && <Badge tone="info">{t('pinned')}</Badge>}
            </>
          ) : undefined
        }
        footer={
          selected ? (
            <>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => openDirect(selected)} disabled={!canDirect} title={canDirect ? undefined : t('noAuth')}>
                <Send /> {t('direct')}
              </button>
              {selected.taskId && (
                <button type="button" className="btn btn-sm" onClick={() => togglePin(selected)} disabled={!canPin} title={canPin ? undefined : t('noPin')}>
                  {selected.pinned ? <PinOff /> : <Pin />} {selected.pinned ? t('unpin') : t('pin')}
                </button>
              )}
              {!selected.reviewed && (
                <button type="button" className="btn btn-sm" onClick={() => markReviewed(selected)}>
                  <CheckCheck /> {t('review')}
                </button>
              )}
              {(selected.taskId || selected.blockId || selected.reportId || selected.reqId) && (
                <button type="button" className="btn btn-sm btn-ghost right" onClick={() => openItem(selected)}>
                  <ExternalLink /> {t('open')}
                </button>
              )}
            </>
          ) : undefined
        }
      >
        {selected && (
          <div className="stack-lg">
            <Callout tone={KIND_TONE[selected.kind] === 'crit' ? 'crit' : 'neutral'}>{selected.reason}</Callout>
            <KeyValue
              items={[
                [t('kvKind'), t(KIND_LABEL[selected.kind])],
                [t('kvRef'), <span key="ref" className="mono">{selected.ref}</span>],
                [t('kvDept'), selected.dept ? DEPT_LABEL[selected.dept].long : '—'],
                [t('kvAge'), selected.age],
                [t('kvProb'), selected.probability === null ? '—' : <span key="p" className="num">{pct(selected.probability, 0)}</span>],
                [t('kvBlock'), selected.planned ?? (selected.taskId ? t('notPlaced') : '—')],
                [t('kvState'), selected.reviewed ? t('reviewedBy', { by: selected.reviewed.by, when: timeAgo(selected.reviewed.at) }) : t('stOpen')],
              ]}
            />
            <section>
              <div className="section-title">{t('history')}</div>
              {history.length ? <AuditTrail entries={history} limit={20} /> : <div className="small muted">{t('historyEmpty')}</div>}
            </section>
          </div>
        )}
      </Drawer>

      <Modal
        open={dirOpen}
        onClose={closeDirect}
        title={t('modalTitle')}
        footer={
          <>
            <button type="button" className="btn" onClick={closeDirect}>
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
          <Field label={t('recipient')} htmlFor="esc-dept">
            <select id="esc-dept" className="select" value={dirDept} onChange={(e) => setDirDept(e.target.value as Dept | 'ALL')}>
              <option value="ALL">{t('allDepts')}</option>
              {DEPTS.map((d) => (
                <option key={d} value={d}>
                  {DEPT_LABEL[d].long} ({DEPT_LABEL[d].system})
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('note')} htmlFor="esc-note">
            <textarea id="esc-note" className="textarea" rows={4} value={dirNote} onChange={(e) => setDirNote(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <TaskDrawer taskId={drawer.taskId} onClose={() => drawer.close('task')} />
      <BlockDrawer blockId={drawer.blockId} onClose={() => drawer.close('block')} />
      <ReportDrawer reportId={drawer.reportId} onClose={() => drawer.close('report')} />
    </div>
  );
}
