/**
 * HorizonsPage — the 26-week Rolling Block Programme (capital works, 10-week
 * JPO notice check, Weibull workload forecast) and the 30-day plan.
 *   /app/planning/monthly  mode 'plan'    — planning cell prepares and submits to the DRM
 *   /app/division/plans    mode 'approve' — DRM approves or returns with remarks
 *
 * Every figure comes from snapshot.result.rolling / .monthly and the RBP / JPO
 * workflow slices of the store.
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Flag, Send } from 'lucide-react';
import { useAppStore, type RbpState } from '../../store/useAppStore';
import { can, type PortalId } from '../../auth/portals';
import { WORK_TYPES } from '../../engine/constants.js';
import type { Dept, RollingEntry } from '../../engine/types';
import { useT } from '../../i18n';
import { DEPT_LABEL, dateLabel, dateLong, download, duration, kmRange, num, pct, timeAgo } from '../../lib/format';
import { Badge, Callout, Card, CardBody, CardHead, DataTable, DeptBadge, EmptyState, Field, PageHeader, PlanPending, Segmented, StatTile, StatusBadge, Tabs, type Column } from '../../components/ui';
import { BarChart, type BarSeries } from '../../components/viz';
import { PrintButton, SeedStamp, SimLabel } from '../../components/ui/extras';
import { TaskDrawer } from '../../components/domain/TaskDrawer';
import { useDrawerParams } from '../../components/domain/useDrawerParams';

export interface HorizonsPageProps {
  mode?: 'plan' | 'approve';
}

const SEED = 26027;
const DEPTS: Dept[] = ['TMS', 'SMMS', 'TDMS'];
const WT = WORK_TYPES as Record<string, { dept: Dept; assetClass: string }>;
/** Asset class → owning department, from the work-type catalogue. */
const CLASS_DEPT: Record<string, Dept> = Object.values(WT).reduce<Record<string, Dept>>((acc, w) => {
  if (!acc[w.assetClass]) acc[w.assetClass] = w.dept;
  return acc;
}, {});

const strings = {
  en: {
    titlePlan: 'Monthly plan and {w}-week programme',
    titleApprove: 'Programme approvals',
    ledePlan: 'Capital works placed week by week with the JPO notice check, the preventive workload forecast, and the {d}-day possession plan. Submit each to the DRM.',
    ledeApprove: 'Review the {w}-week programme and the {d}-day plan submitted by the planning cell, then approve or return with remarks.',
    tabRolling: '{w}-week programme',
    tabMonthly: '{d}-day plan',
    rbpRolling: '{w}-week',
    rbpMonthly: '{d}-day',
    stDRAFT: 'Draft',
    stSUBMITTED: 'Submitted',
    stAPPROVED: 'Approved',
    stRETURNED: 'Returned',
    submit: 'Submit {kind} to DRM',
    submitHint: 'Already submitted or approved',
    needPlan: 'Submitting needs the planning capability',
    exportCsv: 'Export programme CSV',
    print: 'Print',
    submittedNote: 'Submitted by {by} {ago}. Awaiting the DRM.',
    returnedNote: 'Returned by {by} {ago}: {remarks}',
    approvedNote: 'Approved by {by} on {date}.',
    approvedRemarks: 'Remarks: {remarks}',
    stCapital: 'Capital works',
    stCapitalSub: 'Placed in the {w} weeks',
    stHours: 'Possession hours',
    stHoursSub: 'Working days × daily block',
    stMachineDays: 'Machine days',
    stMachineDaysSub: 'Works that need a track machine',
    stServed: 'JPO notice served',
    stServedSub: 'Of {n} capital works',
    stShort: 'JPO notice short',
    stShortSub: 'Notice below {w} weeks',
    forecastTitle: 'Preventive workload forecast',
    forecastSub: 'Expected works per week: asset population × weekly Weibull hazard, grouped by the department that owns the asset class.',
    forecastAll: 'All departments',
    tableTitle: 'Capital works by week',
    tableSub: '{n} works. Works that regulate passenger trains need {w} weeks of JPO notice.',
    colWeek: 'Week',
    colWork: 'Work',
    colDept: 'Dept',
    colWhere: 'Section',
    colWindow: 'Possession',
    colMachine: 'Machine',
    colNotice: 'JPO notice',
    colStatus: 'Programme',
    weekN: 'Week {n}',
    perDay: '{d} per day × {n} days',
    noticeOf: '{g} of {n} weeks',
    noticeServed: 'Served',
    noticeShort: 'Short',
    noticeDue: 'Due',
    regulates: 'Regulates trains',
    markServed: 'Mark served',
    flagLate: 'Flag late',
    flagged: 'Flagged',
    inspect: 'Open',
    noEntries: 'No capital works for this department in the {w} weeks.',
    monthTitle: 'Possession hours by block section and day',
    monthSub: '{d}-day plan from {start}. Darker cells are longer line closures; a dot marks a day with capital work.',
    mHours: 'Possession hours',
    mBlocks: 'Possessions',
    mAvail: 'Corridor availability',
    mCapital: 'Capital works placed',
    mMachineDays: 'Capital working days placed',
    mVsBase: 'Baseline {v}',
    capTitle: 'Capital works in the {d}-day plan',
    capSub: 'Each capital work is expanded into one sub-task per working day.',
    colDays: 'Working days placed',
    colFirst: 'First day',
    colLast: 'Last day',
    capEmpty: 'No capital work is placed in this {d}-day plan.',
    section: 'Block section',
    decisionTitle: 'Decision on the {kind} programme',
    decisionSub: 'Status: {status}',
    remarks: 'Remarks',
    remarksHint: 'Required to return; optional to approve.',
    approve: 'Approve',
    returnIt: 'Return with remarks',
    needAuthorise: 'Approving needs the authorise capability',
    nothingAwaiting: 'Nothing awaiting approval.',
    toastSubmitted: '{kind} programme submitted for approval',
    toastApproved: '{kind} programme approved',
    toastReturned: '{kind} programme returned to the planning cell',
    toastServed: 'JPO notice recorded as served for {task}',
    toastFlagged: 'JPO notice shortfall on {task} flagged to {dept} and the DRM',
    toastExport: '{n} rows exported',
  },
  hi: {
    titlePlan: 'मासिक योजना और {w}-सप्ताह कार्यक्रम',
    titleApprove: 'कार्यक्रम स्वीकृतियाँ',
    ledePlan: 'JPO नोटिस जाँच सहित सप्ताहवार पूँजीगत कार्य, निवारक कार्यभार पूर्वानुमान, और {d}-दिन पज़ेशन योजना। हर एक DRM को भेजें।',
    ledeApprove: 'योजना प्रकोष्ठ द्वारा भेजे {w}-सप्ताह कार्यक्रम और {d}-दिन योजना की समीक्षा करें, फिर स्वीकृत करें या टिप्पणी सहित लौटाएँ।',
    tabRolling: '{w}-सप्ताह कार्यक्रम',
    tabMonthly: '{d}-दिन योजना',
    rbpRolling: '{w}-सप्ताह',
    rbpMonthly: '{d}-दिन',
    stDRAFT: 'मसौदा',
    stSUBMITTED: 'प्रस्तुत',
    stAPPROVED: 'स्वीकृत',
    stRETURNED: 'लौटाया',
    submit: '{kind} DRM को भेजें',
    submitHint: 'पहले ही प्रस्तुत या स्वीकृत',
    needPlan: 'भेजने के लिए योजना क्षमता चाहिए',
    exportCsv: 'कार्यक्रम CSV निर्यात',
    print: 'प्रिंट',
    submittedNote: '{by} ने {ago} प्रस्तुत किया। DRM की प्रतीक्षा।',
    returnedNote: '{by} ने {ago} लौटाया: {remarks}',
    approvedNote: '{by} द्वारा {date} को स्वीकृत।',
    approvedRemarks: 'टिप्पणी: {remarks}',
    stCapital: 'पूँजीगत कार्य',
    stCapitalSub: '{w} सप्ताहों में रखे गए',
    stHours: 'पज़ेशन घंटे',
    stHoursSub: 'कार्य दिवस × दैनिक ब्लॉक',
    stMachineDays: 'मशीन दिवस',
    stMachineDaysSub: 'जिन कार्यों को ट्रैक मशीन चाहिए',
    stServed: 'JPO नोटिस प्रदत्त',
    stServedSub: '{n} पूँजीगत कार्यों में से',
    stShort: 'JPO नोटिस कम',
    stShortSub: '{w} सप्ताह से कम नोटिस',
    forecastTitle: 'निवारक कार्यभार पूर्वानुमान',
    forecastSub: 'प्रति सप्ताह अपेक्षित कार्य: परिसंपत्ति संख्या × साप्ताहिक Weibull हैज़र्ड, परिसंपत्ति वर्ग के स्वामी विभाग अनुसार।',
    forecastAll: 'सभी विभाग',
    tableTitle: 'सप्ताहवार पूँजीगत कार्य',
    tableSub: '{n} कार्य। यात्री ट्रेनें नियंत्रित करने वाले कार्यों को {w} सप्ताह का JPO नोटिस चाहिए।',
    colWeek: 'सप्ताह',
    colWork: 'कार्य',
    colDept: 'विभाग',
    colWhere: 'सेक्शन',
    colWindow: 'पज़ेशन',
    colMachine: 'मशीन',
    colNotice: 'JPO नोटिस',
    colStatus: 'कार्यक्रम',
    weekN: 'सप्ताह {n}',
    perDay: '{d} प्रति दिन × {n} दिन',
    noticeOf: '{n} में से {g} सप्ताह',
    noticeServed: 'प्रदत्त',
    noticeShort: 'कम',
    noticeDue: 'देय',
    regulates: 'ट्रेनें नियंत्रित',
    markServed: 'प्रदत्त चिह्नित करें',
    flagLate: 'देरी चिह्नित करें',
    flagged: 'चिह्नित',
    inspect: 'खोलें',
    noEntries: '{w} सप्ताहों में इस विभाग का कोई पूँजीगत कार्य नहीं।',
    monthTitle: 'ब्लॉक सेक्शन और दिन अनुसार पज़ेशन घंटे',
    monthSub: '{start} से {d}-दिन योजना। गहरे खाने लंबी लाइन बंदी हैं; बिंदु पूँजीगत कार्य वाले दिन को दर्शाता है।',
    mHours: 'पज़ेशन घंटे',
    mBlocks: 'पज़ेशन',
    mAvail: 'कॉरिडोर उपलब्धता',
    mCapital: 'रखे गए पूँजीगत कार्य',
    mMachineDays: 'रखे गए पूँजीगत कार्य दिवस',
    mVsBase: 'आधार-रेखा {v}',
    capTitle: '{d}-दिन योजना में पूँजीगत कार्य',
    capSub: 'हर पूँजीगत कार्य प्रति कार्य दिवस एक उप-कार्य में बाँटा जाता है।',
    colDays: 'रखे गए कार्य दिवस',
    colFirst: 'पहला दिन',
    colLast: 'अंतिम दिन',
    capEmpty: 'इस {d}-दिन योजना में कोई पूँजीगत कार्य नहीं।',
    section: 'ब्लॉक सेक्शन',
    decisionTitle: '{kind} कार्यक्रम पर निर्णय',
    decisionSub: 'स्थिति: {status}',
    remarks: 'टिप्पणी',
    remarksHint: 'लौटाने के लिए आवश्यक; स्वीकृति के लिए वैकल्पिक।',
    approve: 'स्वीकृत करें',
    returnIt: 'टिप्पणी सहित लौटाएँ',
    needAuthorise: 'स्वीकृति के लिए authorise क्षमता चाहिए',
    nothingAwaiting: 'स्वीकृति हेतु कुछ लंबित नहीं।',
    toastSubmitted: '{kind} कार्यक्रम स्वीकृति हेतु प्रस्तुत',
    toastApproved: '{kind} कार्यक्रम स्वीकृत',
    toastReturned: '{kind} कार्यक्रम योजना प्रकोष्ठ को लौटाया गया',
    toastServed: '{task} का JPO नोटिस प्रदत्त दर्ज',
    toastFlagged: '{task} पर JPO नोटिस की कमी {dept} और DRM को चिह्नित',
    toastExport: '{n} पंक्तियाँ निर्यात',
  },
} as const;

type Key = keyof typeof strings.en;
type TabId = 'rolling' | 'monthly';
type Kind = 'rolling' | 'monthly';
type NoticeState = 'SERVED' | 'SHORT' | 'DUE';

interface Row extends RollingEntry {
  notice: NoticeState;
  flagged: boolean;
}

interface CapitalRow {
  id: string;
  label: string;
  dept: Dept;
  sectionLabel: string;
  machine: string;
  days: number;
  first: string;
  last: string;
}

const csvCell = (v: string | number | boolean) => `"${String(v).replace(/"/g, '""')}"`;
const FLAG_PREFIX = 'JPO notice short';

export default function HorizonsPage({ mode = 'plan' }: HorizonsPageProps) {
  const t = useT(strings);
  const drawer = useDrawerParams();

  const snapshot = useAppStore((s) => s.snapshot);
  const planVersion = useAppStore((s) => s.planVersion);
  const user = useAppStore((s) => s.user);
  const rbp = useAppStore((s) => s.rbp);
  const jpoNotices = useAppStore((s) => s.jpoNotices);
  const escalations = useAppStore((s) => s.escalations);
  const submitRbp = useAppStore((s) => s.submitRbp);
  const decideRbp = useAppStore((s) => s.decideRbp);
  const markJpoServed = useAppStore((s) => s.markJpoServed);
  const escalate = useAppStore((s) => s.escalate);
  const notify = useAppStore((s) => s.notify);
  const toast = useAppStore((s) => s.toast);

  const [tab, setTab] = useState<TabId>('rolling');
  const [dept, setDept] = useState<'ALL' | Dept>('ALL');
  const [remarks, setRemarks] = useState('');

  const rows: Row[] = useMemo(() => {
    if (!snapshot) return [];
    const flaggedRefs = new Set(escalations.filter((e) => e.note.startsWith(FLAG_PREFIX)).map((e) => e.ref));
    return snapshot.result.rolling.entries.map((e) => {
      const served = !!jpoNotices[e.taskId] || e.noticeGiven >= e.noticeNeeded;
      const notice: NoticeState = served ? 'SERVED' : e.status === 'NOTICE_SHORTFALL' ? 'SHORT' : 'DUE';
      return { ...e, notice, flagged: flaggedRefs.has(e.taskId) };
    });
  }, [snapshot, jpoNotices, escalations]);

  const visible = useMemo(() => (dept === 'ALL' ? rows : rows.filter((r) => r.dept === dept)), [rows, dept]);

  const forecast = useMemo(() => {
    if (!snapshot) return { categories: [] as string[], series: [] as BarSeries[] };
    const f = snapshot.result.rolling.forecast;
    const byDept = (d: Dept) => f.map((w) => Object.entries(w.per).reduce((s, [cls, v]) => (CLASS_DEPT[cls] === d ? s + v : s), 0));
    const categories = f.map((w) => String(w.week));
    if (dept !== 'ALL') return { categories, series: [{ name: `${DEPT_LABEL[dept].short} (${DEPT_LABEL[dept].system})`, color: `var(--${dept.toLowerCase()})`, values: byDept(dept) }] };
    return { categories, series: DEPTS.map((d) => ({ name: `${DEPT_LABEL[d].short} (${DEPT_LABEL[d].system})`, color: `var(--${d.toLowerCase()})`, values: byDept(d) })) };
  }, [snapshot, dept]);

  const month = useMemo(() => {
    if (!snapshot) return null;
    const m = snapshot.result.monthly;
    const sections = snapshot.corridor.blockSections;
    const grid = sections.map(() => new Array<number>(m.calendar.length).fill(0));
    for (const day of m.calendar) for (const b of day.blocks) if (b.lineClosure) for (const s of b.sections) if (grid[s]) grid[s][day.day] += b.spanMin;
    const max = Math.max(0, ...grid.flat());
    // capital works: sub-tasks "<taskId>#<n>" placed in monthly blocks
    const cap = new Map<string, { dates: string[]; dept: Dept; label: string; section: string }>();
    for (const b of m.ai.blocks) for (const x of b.tasks) {
      if (!x.id.includes('#')) continue;
      const base = x.id.split('#')[0];
      const c = cap.get(base) ?? { dates: [], dept: x.dept, label: x.label.replace(/ — day .*$/, ''), section: b.sectionText };
      c.dates.push(b.date);
      cap.set(base, c);
    }
    const capital: CapitalRow[] = [...cap.entries()].map(([id, c]) => {
      const task = snapshot.tasks.find((x) => x.id === id);
      const entry = snapshot.result.rolling.entries.find((x) => x.taskId === id);
      const dates = c.dates.slice().sort();
      return { id, label: task?.label ?? c.label, dept: c.dept, sectionLabel: task?.sectionLabel ?? c.section, machine: entry?.machine ?? '—', days: dates.length, first: dates[0], last: dates[dates.length - 1] };
    });
    return { m, grid, max, capital, subTasks: capital.reduce((s, c) => s + c.days, 0) };
  }, [snapshot]);

  if (!snapshot || !month) return <PlanPending />;

  const rolling = snapshot.result.rolling;
  const noticeRule = rolling.noticeRule;
  const kind: Kind = tab;
  const state: RbpState = rbp[kind];
  const H = { w: rolling.weeks.length, d: snapshot.result.monthly.calendar.length };
  const kindLabel = kind === 'rolling' ? t('rbpRolling', H) : t('rbpMonthly', H);
  const canPlan = can(user, 'plan');
  const canAuthorise = can(user, 'authorise');
  const statusText = (s: RbpState['status']) => t(`st${s}` as Key);

  /* ── stats ───────────────────────────────────────────────── */
  const served = rows.filter((r) => r.notice === 'SERVED').length;
  const short = rows.filter((r) => r.notice === 'SHORT').length;
  const hours = rows.reduce((s, r) => s + (r.dailyBlockMin * r.workingDays) / 60, 0);
  const machineDays = rows.filter((r) => r.machine !== '—').reduce((s, r) => s + r.workingDays, 0);

  /* ── actions ─────────────────────────────────────────────── */
  const submit = () => {
    submitRbp(kind);
    toast({ title: t('toastSubmitted', { kind: kindLabel }), tone: 'ok' });
  };
  const approve = () => {
    decideRbp(kind, 'APPROVED', remarks.trim() || undefined);
    toast({ title: t('toastApproved', { kind: kindLabel }), tone: 'ok' });
    setRemarks('');
  };
  const giveBack = () => {
    if (!remarks.trim()) return;
    decideRbp(kind, 'RETURNED', remarks.trim());
    toast({ title: t('toastReturned', { kind: kindLabel }), body: remarks.trim(), tone: 'warn' });
    setRemarks('');
  };
  const serve = (r: Row) => {
    markJpoServed(r.taskId);
    toast({ title: t('toastServed', { task: r.taskId }), tone: 'ok' });
  };
  const flag = (r: Row) => {
    const note = `${FLAG_PREFIX} for ${r.label} (${r.sectionLabel} ${r.line}, week ${r.week}): ${r.noticeGiven} of ${r.noticeNeeded} weeks given`;
    notify({ portals: [r.dept.toLowerCase() as PortalId], dept: r.dept, kind: 'WARNING', title: `JPO notice short: ${r.taskId}`, body: note, route: `/app/${r.dept.toLowerCase()}/register` });
    escalate({ kind: 'manual', ref: r.taskId, note });
    toast({ title: t('toastFlagged', { task: r.taskId, dept: DEPT_LABEL[r.dept].short }), tone: 'warn' });
  };
  const exportCsv = () => {
    const head = ['Week', 'Week start', 'Task', 'Work', 'Dept', 'Section', 'Line', 'Km from', 'Km to', 'Working days', 'Daily block (min)', 'Machine', 'Regulates trains', 'Notice given (weeks)', 'Notice needed (weeks)', 'JPO notice', 'Programme status'];
    const lines = visible.map((r) => [r.week, r.start, r.taskId, r.label, r.dept, r.sectionLabel, r.line, r.startKm, r.endKm, r.workingDays, r.dailyBlockMin, r.machine, r.regulationNeeded, r.noticeGiven, r.noticeNeeded, r.notice, r.status].map(csvCell).join(','));
    download(`samanvay-rbp-26-weeks-${snapshot.corridor.code}.csv`, [head.map(csvCell).join(','), ...lines].join('\n'), 'text/csv');
    toast({ title: t('toastExport', { n: visible.length }), tone: 'ok' });
  };

  /* ── columns ─────────────────────────────────────────────── */
  const noticeBadge = (r: Row) => {
    const tone = r.notice === 'SERVED' ? 'ok' : r.notice === 'SHORT' ? 'crit' : 'warn';
    const label = r.notice === 'SERVED' ? t('noticeServed') : r.notice === 'SHORT' ? t('noticeShort') : t('noticeDue');
    return (
      <div>
        <Badge tone={tone} icon={r.notice === 'SERVED' ? <CheckCircle2 size={11} /> : r.notice === 'SHORT' ? <AlertTriangle size={11} /> : undefined}>{label}</Badge>
        <div className="tiny muted num">{t('noticeOf', { g: r.noticeGiven, n: r.noticeNeeded })}</div>
      </div>
    );
  };

  const cols: Column<Row>[] = [
    { key: 'week', header: t('colWeek'), render: (r) => (<div><div className="strong small">{t('weekN', { n: r.week })}</div><div className="tiny muted">{dateLabel(r.start)}</div></div>) },
    { key: 'work', header: t('colWork'), render: (r) => (<div><div className="small strong">{r.label}</div><div className="tiny muted mono">{r.taskId}</div>{r.regulationNeeded && <Badge tone="yellow" className="mt">{t('regulates')}</Badge>}</div>) },
    { key: 'dept', header: t('colDept'), render: (r) => <DeptBadge dept={r.dept} /> },
    { key: 'where', header: t('colWhere'), hideMobile: true, render: (r) => (<div><div className="small">{r.sectionLabel}</div><div className="tiny muted mono">{kmRange(r.startKm, r.endKm)} · {r.line}</div></div>) },
    { key: 'window', header: t('colWindow'), render: (r) => <span className="small">{t('perDay', { d: duration(r.dailyBlockMin), n: r.workingDays })}</span> },
    { key: 'machine', header: t('colMachine'), hideMobile: true, render: (r) => <span className="small">{r.machine}</span> },
    { key: 'notice', header: t('colNotice'), render: noticeBadge },
    { key: 'status', header: t('colStatus'), hideMobile: true, render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <div className="row-wrap" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => drawer.open('task', r.taskId)}>{t('inspect')}</button>
          {mode === 'plan' && canPlan && r.notice !== 'SERVED' && (
            <button type="button" className="btn btn-sm" onClick={() => serve(r)}>{t('markServed')}</button>
          )}
          {mode === 'plan' && canPlan && r.notice === 'SHORT' && (r.flagged ? <Badge tone="gray" icon={<Flag size={11} />}>{t('flagged')}</Badge> : (
            <button type="button" className="btn btn-sm" onClick={() => flag(r)}><Flag /> {t('flagLate')}</button>
          ))}
        </div>
      ),
    },
  ];

  const capCols: Column<CapitalRow>[] = [
    { key: 'label', header: t('colWork'), render: (c) => (<div><div className="small strong">{c.label}</div><div className="tiny muted mono">{c.id}</div></div>) },
    { key: 'dept', header: t('colDept'), render: (c) => <DeptBadge dept={c.dept} /> },
    { key: 'section', header: t('colWhere'), hideMobile: true, render: (c) => <span className="small">{c.sectionLabel}</span> },
    { key: 'machine', header: t('colMachine'), render: (c) => <span className="small">{c.machine}</span> },
    { key: 'days', header: t('colDays'), num: true, render: (c) => <span className="num">{c.days}</span> },
    { key: 'first', header: t('colFirst'), render: (c) => <span className="small">{dateLabel(c.first)}</span> },
    { key: 'last', header: t('colLast'), render: (c) => <span className="small">{dateLabel(c.last)}</span> },
  ];

  /* ── status notes ────────────────────────────────────────── */
  const statusNote = (() => {
    if (state.status === 'APPROVED')
      return (
        <Callout tone="ok">
          {t('approvedNote', { by: state.by ?? '—', date: state.at ? dateLong(state.at.slice(0, 10)) : '—' })}
          {state.remarks ? ` ${t('approvedRemarks', { remarks: state.remarks })}` : ''}
        </Callout>
      );
    if (state.status === 'RETURNED') return <Callout tone="warn">{t('returnedNote', { by: state.by ?? '—', ago: state.at ? timeAgo(state.at) : '', remarks: state.remarks ?? '' })}</Callout>;
    if (state.status === 'SUBMITTED' && mode === 'plan') return <Callout tone="info">{t('submittedNote', { by: state.by ?? '—', ago: state.at ? timeAgo(state.at) : '' })}</Callout>;
    return null;
  })();

  const canSubmit = canPlan && (state.status === 'DRAFT' || state.status === 'RETURNED');
  const m = month.m;

  return (
    <div className="stack-lg">
      <PageHeader
        title={mode === 'approve' ? t('titleApprove') : t('titlePlan', H)}
        lede={mode === 'approve' ? t('ledeApprove', H) : t('ledePlan', H)}
        badges={
          <>
            <Badge tone={rbp.rolling.status === 'APPROVED' ? 'ok' : rbp.rolling.status === 'RETURNED' ? 'warn' : rbp.rolling.status === 'SUBMITTED' ? 'info' : 'gray'}>{t('rbpRolling', H)}: {statusText(rbp.rolling.status)}</Badge>
            <Badge tone={rbp.monthly.status === 'APPROVED' ? 'ok' : rbp.monthly.status === 'RETURNED' ? 'warn' : rbp.monthly.status === 'SUBMITTED' ? 'info' : 'gray'}>{t('rbpMonthly', H)}: {statusText(rbp.monthly.status)}</Badge>
            <SeedStamp seed={SEED} runId={planVersion} ms={snapshot.timing.ms} />
          </>
        }
        actions={
          <>
            <button type="button" className="btn btn-sm" onClick={exportCsv} disabled={!visible.length}>
              <Download /> {t('exportCsv')}
            </button>
            <PrintButton label={t('print')} />
            {mode === 'plan' && (
              <button type="button" className="btn btn-sm btn-primary" onClick={submit} disabled={!canSubmit} title={!canPlan ? t('needPlan') : !canSubmit ? t('submitHint') : undefined}>
                <Send /> {t('submit', { kind: kindLabel })}
              </button>
            )}
          </>
        }
      />

      <Tabs<TabId>
        tabs={[
          { id: 'rolling', label: t('tabRolling', H), count: rows.length },
          { id: 'monthly', label: t('tabMonthly', H), count: month.capital.length },
        ]}
        value={tab}
        onChange={setTab}
      />

      {statusNote}

      {mode === 'approve' && (
        <Card>
          <CardHead title={t('decisionTitle', { kind: kindLabel })} sub={t('decisionSub', { status: statusText(state.status) })} />
          <CardBody>
            {state.status === 'SUBMITTED' ? (
              <div className="stack">
                <Field label={t('remarks')} hint={t('remarksHint')}>
                  <textarea className="textarea" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                </Field>
                <div className="row-wrap">
                  <button type="button" className="btn btn-primary" onClick={approve} disabled={!canAuthorise} title={canAuthorise ? undefined : t('needAuthorise')}>
                    <CheckCircle2 /> {t('approve')}
                  </button>
                  <button type="button" className="btn" onClick={giveBack} disabled={!canAuthorise || !remarks.trim()} title={canAuthorise ? t('remarksHint') : t('needAuthorise')}>
                    {t('returnIt')}
                  </button>
                </div>
              </div>
            ) : (
              <EmptyState title={t('nothingAwaiting')} />
            )}
          </CardBody>
        </Card>
      )}

      {tab === 'rolling' && (
        <>
          <div className="stat-grid">
            <StatTile label={t('stCapital')} value={rows.length} sub={t('stCapitalSub', H)} />
            <StatTile label={t('stHours')} value={num(hours, 0)} unit="h" sub={t('stHoursSub')} />
            <StatTile label={t('stMachineDays')} value={machineDays} sub={t('stMachineDaysSub')} />
            <StatTile label={t('stServed')} value={served} sub={t('stServedSub', { n: rows.length })} />
            <StatTile label={t('stShort')} value={short} sub={t('stShortSub', { w: noticeRule })} pastel={short ? 'pink' : undefined} />
          </div>

          <Card>
            <CardHead title={t('forecastTitle')} sub={t('forecastSub')} right={<SimLabel kind="model" />} />
            <CardBody>
              <div className="stack">
                <Segmented<'ALL' | Dept>
                  options={[{ value: 'ALL', label: t('forecastAll') }, ...DEPTS.map((d) => ({ value: d, label: DEPT_LABEL[d].short }))]}
                  value={dept}
                  onChange={setDept}
                  ariaLabel={t('colDept')}
                />
                <BarChart categories={forecast.categories} series={forecast.series} height={190} valueFormat={(v) => num(v, 1)} />
              </div>
            </CardBody>
          </Card>

          <div data-tour="programme-weeks">
            <Card>
              <CardHead title={t('tableTitle')} sub={t('tableSub', { n: visible.length, w: noticeRule })} right={<SimLabel kind="seededFeed" system="TMS / TDMS" seed={SEED} />} />
              <CardBody flush>
                <DataTable columns={cols} rows={visible} rowKey={(r) => `${r.week}-${r.taskId}`} empty={<EmptyState title={t('noEntries', H)} />} />
              </CardBody>
            </Card>
          </div>
        </>
      )}

      {tab === 'monthly' && (
        <>
          <div className="row-between">
            <span />
            <SimLabel kind="baseline" />
          </div>
          <div className="stat-grid">
            <StatTile label={t('mHours')} value={num(m.kpis.totalBlockHours, 1)} unit="h" sub={t('mVsBase', { v: num(m.baseKpis.totalBlockHours, 1) })} />
            <StatTile label={t('mBlocks')} value={m.kpis.blockCount} sub={t('mVsBase', { v: m.baseKpis.blockCount })} />
            <StatTile label={t('mAvail')} value={pct(m.kpis.availability, 2)} sub={t('mVsBase', { v: pct(m.baseKpis.availability, 2) })} />
            <StatTile label={t('mCapital')} value={month.capital.length} />
            <StatTile label={t('mMachineDays')} value={month.subTasks} />
          </div>

          <Card>
            <CardHead title={t('monthTitle')} sub={t('monthSub', { ...H, start: dateLong(snapshot.planStart) })} right={<SimLabel kind="solver" />} />
            <CardBody flush>
              <div className="table-wrap">
                <table className="tbl compact" style={{ borderCollapse: 'separate', borderSpacing: 2 }}>
                  <thead>
                    <tr>
                      <th>{t('section')}</th>
                      {m.calendar.map((d) => (
                        <th key={d.day} className="num" title={dateLong(d.date)} style={{ textAlign: 'center', padding: '4px 2px' }}>
                          <div>{d.date.slice(8)}</div>
                          <div className="tiny" style={{ color: d.capital ? 'var(--accent)' : 'transparent' }}>●</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.corridor.blockSections.map((s) => (
                      <tr key={s.index}>
                        <td className="small" style={{ whiteSpace: 'nowrap' }}>{s.label}</td>
                        {month.grid[s.index].map((v, d) => (
                          <td
                            key={d}
                            className="num tiny"
                            title={`${s.label} · ${dateLabel(m.calendar[d].date)} · ${duration(v)}`}
                            style={{ textAlign: 'center', minWidth: 30, padding: '4px 2px', borderRadius: 4, background: v ? `color-mix(in oklab, var(--series-1) ${Math.round(18 + (month.max ? (v / month.max) * 62 : 0))}%, var(--bg-1))` : 'var(--bg-2)', color: v && month.max && v / month.max > 0.55 ? 'var(--bg-1)' : 'var(--ink-2)' }}
                          >
                            {v ? num(v / 60, 1) : ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHead title={t('capTitle', H)} sub={t('capSub')} right={<SimLabel kind="seededFeed" system="TMS / TDMS" seed={SEED} />} />
            <CardBody flush>
              <DataTable columns={capCols} rows={month.capital} rowKey={(c) => c.id} onRowClick={(c) => drawer.open('task', c.id)} empty={<EmptyState title={t('capEmpty', H)} />} />
            </CardBody>
          </Card>
        </>
      )}

      <TaskDrawer taskId={drawer.taskId} onClose={() => drawer.close('task')} mode={mode === 'plan' ? 'full' : 'readOnly'} />
    </div>
  );
}
