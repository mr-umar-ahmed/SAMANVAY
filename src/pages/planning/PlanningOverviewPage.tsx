/**
 * PlanningOverviewPage — /app/planning/overview (spec §3.16).
 * The engine's own numbers for this week against the simulated decentralised
 * FIFO baseline, the free headway per hour from the timetable occupancy, the
 * queues that wait on the planning cell, the highest-ARCI works and the
 * recent audit trail. Every figure is read from the snapshot or the store.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertOctagon, AlertTriangle, CalendarRange, CheckSquare, FileText, ListFilter, RefreshCw, Send, ShieldAlert, Sliders, Sparkles } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { can } from '../../auth/portals';
import { workingBlocks } from '../../engine/select';
import type { Snapshot, Task } from '../../engine/types';
import { useT } from '../../i18n';
import { addDaysIso, dateLabel, kmRange, num, pct, pts } from '../../lib/format';
import { ArciBar, Badge, Card, CardBody, CardFoot, CardHead, DataTable, DeptBadge, PageHeader, PlanPending, SectionTitle, UrgencyBadge, type Column } from '../../components/ui';
import { AuditTrail, SeedStamp, SimLabel } from '../../components/ui/extras';
import { BarChart, RingGauge } from '../../components/viz';
import { TaskDrawer } from '../../components/domain/TaskDrawer';
import { ReportDrawer } from '../../components/domain/ReportDrawer';
import { useDrawerParams } from '../../components/domain/useDrawerParams';
import { SafetyBanner } from '../../components/domain/SafetyBanner';
import { SolverStamp } from '../../components/domain/SolverStamp';
import { useConflictRows } from '../../components/domain/planHooks';
import { KpiStrip } from './KpiStrip';
import { ALL_KPIS, argMax, argMin, FEED_SEED, FLOW_LABEL, FLOW_TONE, flowState, hourProfile, hourRange, planStrings, type FlowState } from './planMetrics';

const strings = {
  en: {
    title: 'Planning overview',
    lede: 'This week’s plan against the simulated decentralised baseline, and the queues waiting on the cell.',
    run: 'Run weekly optimiser',
    running: 'Planning…',
    runHint: 'Only the block planning cell can re-plan.',
    tuning: 'Optimiser',
    handoff: 'Hand-off',
    runDone: 'Weekly plan recomputed',
    runDoneBody: '{blocks} possessions · {deferred} works deferred',
    runFailed: 'The planning engine failed',
    gaugeTitle: 'Availability vs baseline',
    gaugeSub: 'Same seed, same works, computed like-for-like',
    gaugeBase: 'Baseline',
    gaugePlan: 'SAMANVAY plan',
    gaugeDelta: '{d} against the baseline',
    gaugeNote: 'Computed over {sections} block sections × {lines} lines × {days} days.',
    openWeekly: 'Open weekly plan',
    headTitle: 'Free headway per hour',
    headSub: 'Minutes per hour clear of every train and the {m} min headway margin, mean over {n} section-lines',
    day: 'Plan day',
    seriesFree: 'Free minutes per hour',
    tightest: 'Tightest hour {h} · {v} free min',
    loosest: 'Most free hour {h} · {v} free min',
    busiest: 'Busiest hour {h} · {v} trains per section-line',
    queues: 'Queues',
    qReqs: 'Pending requisitions',
    qReqsSub: 'Submitted by departments, awaiting the cell',
    qReqsBtn: 'Open demands',
    qIssues: 'Unmapped records',
    qIssuesSub: '{mapped} records mapped · {rejected} rejected',
    qIssuesBtn: 'Open integration',
    qReports: 'New hazard reports',
    qReportsSub: 'Unverified reports on this corridor',
    qReportsBtn: 'Open oldest report',
    qReportsNone: 'No report waiting',
    qJpo: 'JPO notices late',
    qJpoSub: 'Programme works short of the {weeks}-week notice',
    qJpoBtn: 'Open 26-week programme',
    qState: 'Plan state',
    qStateSub: '{n} possessions this week',
    qStateBtn: 'Open hand-off',
    topTitle: 'Highest ARCI works',
    topSub: 'Top {n} of {total} works, ranked by the risk engine',
    openRisk: 'Open risk register',
    colRank: 'Rank',
    colWork: 'Work',
    colDept: 'Dept',
    colLocation: 'Section / km',
    colArci: 'ARCI',
    colBand: 'Band',
    colFloor: 'Floor',
    colPlan: 'In plan',
    mandatory: 'Mandatory',
    placed: 'Placed {day}',
    deferred: 'Deferred',
    notPlaced: 'Not placed',
    injected: 'Injected',
    noTasks: 'No works in the register.',
    recentTitle: 'Recent actions',
    recentSub: 'Audit trail recorded on this device',
    qConflicts: 'Conflicts',
    qConflictsSub: '{high} high · {medium} medium · {low} low severity',
    qConflictsBtn: 'Open conflicts',
    qAnomalies: 'Anomalies flagged',
    qAnomaliesSub: '{high} high severity · overruns, failure spikes and data',
    qAnomaliesNone: 'Not computed in this run',
    qAnomaliesBtn: 'Open integration',
  },
  hi: {
    title: 'योजना अवलोकन',
    lede: 'इस सप्ताह की योजना बनाम सिम्युलेटेड विकेंद्रीकृत आधार-रेखा, और प्रकोष्ठ की प्रतीक्षा में कतारें।',
    run: 'साप्ताहिक ऑप्टिमाइज़र चलाएँ',
    running: 'योजना बन रही है…',
    runHint: 'केवल ब्लॉक योजना प्रकोष्ठ पुनः योजना बना सकता है।',
    tuning: 'ऑप्टिमाइज़र',
    handoff: 'हैंड-ऑफ़',
    runDone: 'साप्ताहिक योजना पुनः गणित',
    runDoneBody: '{blocks} पज़ेशन · {deferred} कार्य स्थगित',
    runFailed: 'योजना इंजन विफल',
    gaugeTitle: 'उपलब्धता बनाम आधार-रेखा',
    gaugeSub: 'वही seed, वही कार्य, समान तरीके से गणना',
    gaugeBase: 'आधार-रेखा',
    gaugePlan: 'समन्वय योजना',
    gaugeDelta: 'आधार-रेखा की तुलना में {d}',
    gaugeNote: '{sections} ब्लॉक सेक्शन × {lines} लाइन × {days} दिन पर गणना।',
    openWeekly: 'साप्ताहिक योजना खोलें',
    headTitle: 'प्रति घंटा मुक्त हेडवे',
    headSub: 'हर ट्रेन और {m} मिनट हेडवे मार्जिन से मुक्त मिनट प्रति घंटा, {n} सेक्शन-लाइनों का औसत',
    day: 'योजना दिन',
    seriesFree: 'प्रति घंटा मुक्त मिनट',
    tightest: 'सबसे तंग घंटा {h} · {v} मुक्त मिनट',
    loosest: 'सबसे खुला घंटा {h} · {v} मुक्त मिनट',
    busiest: 'सबसे व्यस्त घंटा {h} · {v} ट्रेन प्रति सेक्शन-लाइन',
    queues: 'कतारें',
    qReqs: 'लंबित मांगपत्र',
    qReqsSub: 'विभागों द्वारा जमा, प्रकोष्ठ की प्रतीक्षा में',
    qReqsBtn: 'मांगें खोलें',
    qIssues: 'अमैप्ड रिकॉर्ड',
    qIssuesSub: '{mapped} रिकॉर्ड मैप · {rejected} अस्वीकृत',
    qIssuesBtn: 'एकीकरण खोलें',
    qReports: 'नई खतरा रिपोर्टें',
    qReportsSub: 'इस कॉरिडोर की असत्यापित रिपोर्टें',
    qReportsBtn: 'सबसे पुरानी रिपोर्ट खोलें',
    qReportsNone: 'कोई रिपोर्ट प्रतीक्षा में नहीं',
    qJpo: 'विलंबित JPO नोटिस',
    qJpoSub: '{weeks}-सप्ताह नोटिस से कम समय वाले कार्यक्रम कार्य',
    qJpoBtn: '26-सप्ताह कार्यक्रम खोलें',
    qState: 'योजना स्थिति',
    qStateSub: 'इस सप्ताह {n} पज़ेशन',
    qStateBtn: 'हैंड-ऑफ़ खोलें',
    topTitle: 'सर्वाधिक ARCI वाले कार्य',
    topSub: 'जोखिम इंजन द्वारा क्रमित {total} में से शीर्ष {n} कार्य',
    openRisk: 'जोखिम रजिस्टर खोलें',
    colRank: 'क्रम',
    colWork: 'कार्य',
    colDept: 'विभाग',
    colLocation: 'सेक्शन / कि.मी.',
    colArci: 'ARCI',
    colBand: 'श्रेणी',
    colFloor: 'फ़्लोर',
    colPlan: 'योजना में',
    mandatory: 'अनिवार्य',
    placed: '{day} को रखा गया',
    deferred: 'स्थगित',
    notPlaced: 'नहीं रखा गया',
    injected: 'इंजेक्टेड',
    noTasks: 'रजिस्टर में कोई कार्य नहीं।',
    recentTitle: 'हाल की कार्रवाइयाँ',
    recentSub: 'इस डिवाइस पर दर्ज ऑडिट ट्रेल',
    qConflicts: 'टकराव',
    qConflictsSub: '{high} उच्च · {medium} मध्यम · {low} निम्न गंभीरता',
    qConflictsBtn: 'टकराव खोलें',
    qAnomalies: 'चिह्नित विसंगतियाँ',
    qAnomaliesSub: '{high} उच्च गंभीरता · ओवररन, विफलता वृद्धि और डेटा',
    qAnomaliesNone: 'इस run में गणित नहीं',
    qAnomaliesBtn: 'एकीकरण खोलें',
  },
} as const;

const FLOW_ORDER: FlowState[] = ['DRAFT', 'AWAITING', 'READY', 'GRANTED', 'LOCKED', 'REFUSED', 'SUPERSEDED'];

export default function PlanningOverviewPage() {
  const snapshot = useAppStore((s) => s.snapshot);
  if (!snapshot) return <PlanPending />;
  return <OverviewBody snapshot={snapshot} />;
}

function OverviewBody({ snapshot }: { snapshot: Snapshot }) {
  const t = useT(strings);
  const tk = useT(planStrings);
  const nav = useNavigate();
  const drawer = useDrawerParams();

  const user = useAppStore((s) => s.user);
  const corridorId = useAppStore((s) => s.corridorId);
  const approvals = useAppStore((s) => s.approvals);
  const requisitions = useAppStore((s) => s.requisitions);
  const reports = useAppStore((s) => s.reports);
  const jpoNotices = useAppStore((s) => s.jpoNotices);
  const audit = useAppStore((s) => s.audit);
  const planStatus = useAppStore((s) => s.planStatus);
  const planVersion = useAppStore((s) => s.planVersion);
  const runPlan = useAppStore((s) => s.runPlan);
  const toast = useAppStore((s) => s.toast);

  const [day, setDay] = useState(0);

  const canPlan = can(user, 'plan');
  const weekly = snapshot.result.weekly;
  const rules = snapshot.result.rules;
  const corridor = snapshot.corridor;

  const blocks = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals]);

  const flowCounts = useMemo(() => {
    const out: Record<FlowState, number> = { DRAFT: 0, AWAITING: 0, READY: 0, GRANTED: 0, LOCKED: 0, REFUSED: 0, SUPERSEDED: 0 };
    for (const b of blocks) out[flowState(b)]++;
    return out;
  }, [blocks]);

  const conflictRows = useConflictRows(snapshot, blocks);
  const sevCount = (s: 'high' | 'medium' | 'low') => conflictRows.filter((c) => c.severity === s).length;
  const anomalies = snapshot.anomalies;

  const ranked = useMemo(() => [...snapshot.tasks].sort((a, b) => b.risk.arci - a.risk.arci), [snapshot]);
  const topTasks = useMemo(() => ranked.slice(0, 10), [ranked]);

  const placementOf = useMemo(() => {
    const sched = new Map(weekly.ai.scheduled.map((s) => [s.taskId, s]));
    const deferred = new Map(weekly.ai.deferred.map((d) => [d.taskId, d]));
    return { sched, deferred };
  }, [weekly]);

  const occ = weekly.occupancy[day] ?? weekly.occupancy[0];
  const profile = useMemo(() => (occ ? hourProfile(occ, corridor, rules.headwayMarginMin) : null), [occ, corridor, rules.headwayMarginMin]);

  const pendingReqs = useMemo(() => requisitions.filter((r) => r.corridorId === corridorId && r.status === 'SUBMITTED').length, [requisitions, corridorId]);
  const unverified = useMemo(
    () => reports.filter((r) => r.corridorId === corridorId && r.status === 'UNVERIFIED').sort((a, b) => a.at.localeCompare(b.at)),
    [reports, corridorId]
  );
  const jpoLate = useMemo(() => snapshot.result.rolling.entries.filter((e) => e.status === 'NOTICE_SHORTFALL' && !jpoNotices[e.taskId]).length, [snapshot, jpoNotices]);

  const running = planStatus === 'running';
  const planEnd = addDaysIso(snapshot.planStart, weekly.kpis.days - 1);
  const availDelta = (weekly.kpis.availability - weekly.baseKpis.availability) * 100;

  const handleRun = async () => {
    await runPlan({ reason: 'weekly optimiser (overview)' });
    const s = useAppStore.getState();
    if (s.planStatus === 'error') toast({ title: t('runFailed'), body: s.planError ?? undefined, tone: 'crit' });
    else if (s.snapshot) toast({ title: t('runDone'), body: t('runDoneBody', { blocks: s.snapshot.result.weekly.kpis.blockCount, deferred: s.snapshot.result.weekly.kpis.tasksDeferred }), tone: 'ok' });
  };

  const columns: Column<Task>[] = [
    { key: 'rank', header: t('colRank'), width: 56, num: true, render: (_r, i) => <span className="mono strong">{i + 1}</span> },
    {
      key: 'work',
      header: t('colWork'),
      render: (r) => (
        <div className="stack" style={{ gap: 2 }}>
          <span className="small strong">{r.label}</span>
          <span className="tiny muted mono">
            {r.id}
            {r.injected ? ` · ${t('injected')}` : ''}
          </span>
        </div>
      ),
    },
    { key: 'dept', header: t('colDept'), render: (r) => <DeptBadge dept={r.dept} /> },
    {
      key: 'loc',
      header: t('colLocation'),
      hideMobile: true,
      render: (r) => (
        <div className="stack" style={{ gap: 2 }}>
          <span className="small">{r.sectionLabel}</span>
          <span className="tiny muted mono">
            {kmRange(r.startKm, r.endKm)} · {r.line}
          </span>
        </div>
      ),
    },
    { key: 'arci', header: t('colArci'), render: (r) => <ArciBar value={r.risk.arci} mandatory={r.risk.mandatory} /> },
    { key: 'band', header: t('colBand'), hideMobile: true, render: (r) => <UrgencyBadge urgency={r.risk.urgency} /> },
    { key: 'floor', header: t('colFloor'), hideMobile: true, render: (r) => (r.risk.mandatory ? <Badge tone="crit" icon={<ShieldAlert size={12} />}>{t('mandatory')}</Badge> : <span className="tiny muted">—</span>) },
    {
      key: 'plan',
      header: t('colPlan'),
      render: (r) => {
        const s = placementOf.sched.get(r.id);
        if (s) return <Badge tone="ok">{t('placed', { day: dateLabel(addDaysIso(snapshot.planStart, s.day)) })}</Badge>;
        const d = placementOf.deferred.get(r.id);
        if (d) return <Badge tone="warn" title={d.reason}>{t('deferred')}</Badge>;
        return <span className="tiny muted">{t('notPlaced')}</span>;
      },
    },
  ];

  const tight = profile ? argMin(profile.freeMean) : 0;
  const loose = profile ? argMax(profile.freeMean) : 0;
  const busy = profile ? argMax(profile.trainsMean) : 0;

  return (
    <div className="stack-lg">
      <PageHeader
        title={t('title')}
        lede={t('lede')}
        badges={
          <>
            <Badge tone="blue">{corridor.name}</Badge>
            <Badge tone="gray" icon={<CalendarRange size={12} />}>
              {dateLabel(snapshot.planStart)} – {dateLabel(planEnd)}
            </Badge>
            <SeedStamp seed={FEED_SEED} runId={planVersion} iterations={weekly.ai.search.iterations} ms={snapshot.timing.ms} />
            <SolverStamp plan={weekly.ai} />
            <SimLabel kind="solver" />
          </>
        }
        actions={
          <>
            <button type="button" className="btn btn-primary" disabled={running || !canPlan} title={canPlan ? undefined : t('runHint')} onClick={() => void handleRun()}>
              {running ? <RefreshCw size={14} className="spin" /> : <Sparkles size={14} />} {running ? t('running') : t('run')}
            </button>
            <button type="button" className="btn" onClick={() => nav('/app/planning/optimiser')}>
              <Sliders size={14} /> {t('tuning')}
            </button>
            <button type="button" className="btn" onClick={() => nav('/app/planning/handoff')}>
              <Send size={14} /> {t('handoff')}
            </button>
          </>
        }
      />

      <SafetyBanner snapshot={snapshot} plan={weekly.ai} kpis={weekly.kpis} tour="overview-safety" />

      <KpiStrip kpis={weekly.kpis} baseKpis={weekly.baseKpis} keys={ALL_KPIS} runId={planVersion} tour="overview-kpis" />

      <div className="grid grid-2">
        <Card>
          <CardHead title={t('gaugeTitle')} sub={t('gaugeSub')} right={<SimLabel kind="baseline" />} />
          <CardBody>
            <div className="row-wrap" style={{ justifyContent: 'space-around', gap: 24 }}>
              <div className="stack" style={{ alignItems: 'center' }}>
                <RingGauge value={weekly.baseKpis.availability} size={112} stroke={9} tone="var(--ink-4)" label={<span style={{ fontSize: 'var(--fs-lg)' }}>{pct(weekly.baseKpis.availability, 2)}</span>} />
                <span className="small strong">{t('gaugeBase')}</span>
              </div>
              <div className="stack" style={{ alignItems: 'center' }}>
                <RingGauge value={weekly.kpis.availability} size={128} stroke={11} tone="var(--series-1)" label={<span style={{ fontSize: 'var(--fs-xl)' }}>{pct(weekly.kpis.availability, 2)}</span>} />
                <span className="small strong">{t('gaugePlan')}</span>
                <span className="tiny muted num">{t('gaugeDelta', { d: pts(availDelta, 2) })}</span>
              </div>
            </div>
            <div className="tiny muted mt-lg">{t('gaugeNote', { sections: corridor.blockSections.length, lines: corridor.lines.length, days: weekly.kpis.days })}</div>
          </CardBody>
          <CardFoot>
            <button type="button" className="btn btn-sm" onClick={() => nav('/app/planning/weekly')}>
              <CalendarRange size={13} /> {t('openWeekly')}
            </button>
          </CardFoot>
        </Card>

        <Card>
          <CardHead
            title={t('headTitle')}
            sub={profile ? t('headSub', { m: rules.headwayMarginMin, n: profile.rows }) : undefined}
            right={
              <select className="select" value={day} onChange={(e) => setDay(Number(e.target.value))} aria-label={t('day')} style={{ width: 'auto' }}>
                {weekly.occupancy.map((o) => (
                  <option key={o.day} value={o.day}>
                    {dateLabel(o.date)}
                  </option>
                ))}
              </select>
            }
          />
          <CardBody>
            {profile && (
              <div className="stack">
                <BarChart
                  categories={Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))}
                  series={[{ name: t('seriesFree'), color: 'var(--series-1)', values: profile.freeMean }]}
                  height={170}
                  yMax={60}
                  valueFormat={(v) => String(Math.round(v))}
                />
                <div className="row-wrap">
                  <Badge tone="pink">{t('tightest', { h: hourRange(tight), v: num(profile.freeMean[tight], 0) })}</Badge>
                  <Badge tone="green">{t('loosest', { h: hourRange(loose), v: num(profile.freeMean[loose], 0) })}</Badge>
                  <Badge tone="gray">{t('busiest', { h: hourRange(busy), v: num(profile.trainsMean[busy], 1) })}</Badge>
                </div>
                <div className="row-wrap">
                  <SimLabel kind="seededFeed" system="COA / FOIS" seed={FEED_SEED} />
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <div>
        <SectionTitle>{t('queues')}</SectionTitle>
        <div className="grid grid-auto">
          <Card>
            <CardHead title={t('qReqs')} sub={t('qReqsSub')} icon={<FileText size={16} />} />
            <CardBody>
              <div className="h2 num">{pendingReqs}</div>
            </CardBody>
            <CardFoot>
              <button type="button" className="btn btn-sm" onClick={() => nav('/app/planning/demands')}>
                {t('qReqsBtn')}
              </button>
            </CardFoot>
          </Card>

          <Card>
            <CardHead title={t('qIssues')} sub={t('qIssuesSub', { mapped: snapshot.counts.total, rejected: snapshot.counts.rejected })} icon={<AlertOctagon size={16} />} />
            <CardBody>
              <div className="h2 num">{snapshot.issues.length}</div>
              <div className="mt">
                <SimLabel kind="seededFeed" system="TMS / SMMS / TDMS" seed={FEED_SEED} />
              </div>
            </CardBody>
            <CardFoot>
              <button type="button" className="btn btn-sm" onClick={() => nav('/app/planning/integration')}>
                {t('qIssuesBtn')}
              </button>
            </CardFoot>
          </Card>

          <Card>
            <CardHead title={t('qReports')} sub={t('qReportsSub')} icon={<ShieldAlert size={16} />} />
            <CardBody>
              <div className="h2 num">{unverified.length}</div>
            </CardBody>
            <CardFoot>
              <button type="button" className="btn btn-sm" disabled={!unverified.length} title={unverified.length ? undefined : t('qReportsNone')} onClick={() => unverified[0] && drawer.open('report', unverified[0].id)}>
                {t('qReportsBtn')}
              </button>
            </CardFoot>
          </Card>

          <Card>
            <CardHead title={t('qJpo')} sub={t('qJpoSub', { weeks: snapshot.result.rolling.noticeRule })} icon={<CalendarRange size={16} />} />
            <CardBody>
              <div className="h2 num">{jpoLate}</div>
            </CardBody>
            <CardFoot>
              <button type="button" className="btn btn-sm" onClick={() => nav('/app/planning/monthly')}>
                {t('qJpoBtn')}
              </button>
            </CardFoot>
          </Card>

          <Card>
            <CardHead title={t('qState')} sub={t('qStateSub', { n: blocks.length })} icon={<CheckSquare size={16} />} />
            <CardBody>
              <div className="row-wrap">
                {FLOW_ORDER.filter((f) => flowCounts[f] > 0 || (f !== 'REFUSED' && f !== 'SUPERSEDED')).map((f) => (
                  <Badge key={f} tone={FLOW_TONE[f]}>
                    <span className="num">{flowCounts[f]}</span> {tk(FLOW_LABEL[f])}
                  </Badge>
                ))}
              </div>
            </CardBody>
            <CardFoot>
              <button type="button" className="btn btn-sm" onClick={() => nav('/app/planning/handoff')}>
                {t('qStateBtn')}
              </button>
            </CardFoot>
          </Card>

          <Card pastel={sevCount('high') ? 'pink' : undefined}>
            <CardHead title={t('qConflicts')} sub={t('qConflictsSub', { high: sevCount('high'), medium: sevCount('medium'), low: sevCount('low') })} icon={<AlertTriangle size={16} />} />
            <CardBody>
              <div className="h2 num">{conflictRows.length}</div>
            </CardBody>
            <CardFoot>
              <button type="button" className="btn btn-sm" onClick={() => nav('/app/planning/weekly')}>
                {t('qConflictsBtn')}
              </button>
            </CardFoot>
          </Card>

          <Card>
            <CardHead title={t('qAnomalies')} sub={anomalies ? t('qAnomaliesSub', { high: anomalies.filter((a) => a.severity === 'high').length }) : t('qAnomaliesNone')} icon={<Activity size={16} />} />
            <CardBody>
              <div className="h2 num">{anomalies ? anomalies.length : '—'}</div>
              <div className="mt">
                <SimLabel kind="model" />
              </div>
            </CardBody>
            <CardFoot>
              <button type="button" className="btn btn-sm" onClick={() => nav('/app/planning/integration')}>
                {t('qAnomaliesBtn')}
              </button>
            </CardFoot>
          </Card>
        </div>
      </div>

      <div className="grid grid-main-aside">
        <Card>
          <CardHead
            title={t('topTitle')}
            sub={t('topSub', { n: topTasks.length, total: ranked.length })}
            right={
              <button type="button" className="btn btn-sm" onClick={() => nav('/app/planning/risk')}>
                <ListFilter size={13} /> {t('openRisk')}
              </button>
            }
          />
          <CardBody flush>
            <DataTable<Task> rows={topTasks} columns={columns} rowKey={(r) => r.id} onRowClick={(r) => drawer.open('task', r.id)} selectedKey={drawer.taskId} compact empty={t('noTasks')} />
          </CardBody>
        </Card>

        <Card>
          <CardHead title={t('recentTitle')} sub={t('recentSub')} />
          <CardBody>
            <AuditTrail entries={audit} limit={8} />
          </CardBody>
        </Card>
      </div>

      <TaskDrawer taskId={drawer.taskId} onClose={() => drawer.close('task')} />
      <ReportDrawer reportId={drawer.reportId} onClose={() => drawer.close('report')} />
    </div>
  );
}
