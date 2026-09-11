/**
 * RiskPage — /app/planning/risk (spec §3.17, PS point 2).
 * The ARCI ranking a reviewer can interrogate term by term: every term,
 * weight and explanation comes from task.risk (src/engine/riskEngine.js);
 * the Weibull and escalation cards show the fitted models and their
 * held-out metrics from snapshot.models.
 */
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Brain, ExternalLink, Eye, Pin, PinOff, Play, Search, ShieldAlert, Share2, Sliders } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { can } from '../../auth/portals';
import { workingBlocks } from '../../engine/select';
import type { Dept, Snapshot, Task, Urgency, WeibullFit } from '../../engine/types';
import { useT } from '../../i18n';
import { common } from '../../i18n/common';
import { addDaysIso, arciTone, dateLabel, hhmm, kmRange, num, pct } from '../../lib/format';
import { ArciBar, Badge, Callout, Card, CardBody, CardHead, DataTable, DeptBadge, EmptyState, KeyValue, Meter, PageHeader, PlanPending, StatTile, UrgencyBadge, type Column } from '../../components/ui';
import { SeedStamp, SimLabel } from '../../components/ui/extras';
import { Sparkline } from '../../components/viz';
import { TaskDrawer } from '../../components/domain/TaskDrawer';
import { useDrawerParams } from '../../components/domain/useDrawerParams';
import { FEED_SEED } from './planMetrics';

const DEPTS: Dept[] = ['TMS', 'SMMS', 'TDMS'];
const BANDS: Urgency[] = ['IMMEDIATE', 'HIGH', 'TACTICAL', 'STRATEGIC'];

const strings = {
  en: {
    title: 'Risk & priority (ARCI)',
    lede: 'Every work in the register ranked by the Asset Risk & Criticality Index. Open a row to see each term, its weight and why it has that value.',
    nWorks: '{n} works',
    changeWeights: 'Change weights',
    runPinned: 'Re-plan with {n} pinned',
    runPinnedHint: 'Pinned works are raised to the mandatory floor on the next run.',
    runNoCap: 'Only the block planning cell can re-plan.',
    runDone: 'Plan recomputed with the pinned works',
    runFailed: 'The planning engine failed',
    statImmediate: 'Immediate band',
    statImmediateSub: 'Works that need a block within a day',
    statMandatory: 'Mandatory floor',
    statMandatorySub: 'Safety-critical works placed first',
    statMean: 'Mean ARCI',
    statMeanSub: 'Over {n} works',
    statOverdue: 'Overdue',
    statOverdueSub: 'Past their maintenance interval',
    statPinned: 'Pinned for next run',
    statPinnedSub: 'Raised to the floor when you re-plan',
    search: 'Search work, id, asset or km',
    allDepts: 'All departments',
    allBands: 'All bands',
    mandatoryOnly: 'Mandatory only',
    injectedOnly: 'Injected only',
    showing: 'Showing {n} of {total}',
    tableTitle: 'Ranked register',
    tableSub: 'Sorted by ARCI. Click a row to explain it.',
    colRank: 'Rank',
    colWork: 'Work',
    colDept: 'Dept',
    colAsset: 'Asset',
    colLocation: 'Section / km',
    colArci: 'ARCI',
    colBand: 'Band',
    colFloor: 'Mandatory floor',
    colEsc: 'Escalation p',
    colDue: 'Due / overdue',
    colPlan: 'In plan',
    colActions: 'Actions',
    floorYes: 'Mandatory',
    floorRule: '≤ {d} d rule',
    overdue: '{d} d overdue',
    dueIn: 'due in {d} d',
    placed: '{day} · {block}',
    deferred: 'Deferred',
    notPlaced: 'Not placed',
    pinnedBadge: 'Pinned',
    injected: 'Injected',
    explain: 'Explain',
    pin: 'Pin to next run',
    unpin: 'Unpin',
    pinNoCap: 'Only the block planning cell can pin works.',
    pinnedToast: 'Pinned — will be placed in the next run',
    unpinnedToast: 'Unpinned — ranked by ARCI again on the next run',
    emptyTitle: 'No tasks in this band.',
    emptyBody: 'Relax the department, band or search filter.',
    resetFilters: 'Reset filters',
    whyTitle: 'Why this score',
    score: 'ARCI',
    formula: 'ARCI = √safety × Σ (weight × term){uplift}',
    upliftPart: ' + TSR uplift {u}',
    computation: 'Weighted sum {sum} × √{safety} {uplift}= {raw}',
    raisedToFloor: 'Raised to the mandatory floor: {arci}',
    mandatoryNotice: 'Mandatory floor: a safety-critical work that is due, or already under a TSR, is placed first regardless of delay cost.',
    colTerm: 'Term',
    colValue: 'Value',
    colWeight: 'Weight',
    colContribution: 'Contribution',
    multiplier: 'multiplier',
    t_pf: 'Failure probability (30 d, Weibull)',
    t_condition: 'Measured condition index',
    t_odi: 'Operational disruption index',
    t_overdue: 'Overdue penalty',
    t_escalation: 'ML escalation probability',
    t_safety: 'Safety severity multiplier',
    t_pinned: 'Pinned by planner',
    placement: 'This week',
    placementScheduled: 'Placed {day} {start}–{end} in {block}',
    placementDeferred: 'Deferred: {reason}',
    placementNone: 'Not in this week’s plan',
    showInPlan: 'Show in weekly plan',
    openGraph: 'Open in integration',
    details: 'Details',
    selectPrompt: 'Select a work in the register to see its terms.',
    weibullTitle: 'Weibull models',
    weibullSub: 'Per asset class, fitted on seeded failure history. Curve: hazard rate over two characteristic lives.',
    beta: 'β',
    eta: 'η',
    n: 'n',
    censored: 'censored',
    b10: 'B10',
    wearOut: 'Wear-out',
    random: 'Random / early',
    days: '{d} d',
    escTitle: 'Escalation model',
    escSub: 'Logistic regression: probability a defect escalates to a stricter TSR within 30 days if unattended.',
    auc: 'AUC (held-out)',
    precision: 'Precision',
    recall: 'Recall',
    logLoss: 'Log loss',
    split: 'Train / held-out',
    splitValue: '{train} / {test}',
  },
  hi: {
    title: 'जोखिम व प्राथमिकता (ARCI)',
    lede: 'रजिस्टर का हर कार्य परिसंपत्ति जोखिम व गंभीरता सूचकांक (ARCI) से क्रमित। हर पद, उसका भार और मान का कारण देखने हेतु पंक्ति खोलें।',
    nWorks: '{n} कार्य',
    changeWeights: 'भार बदलें',
    runPinned: '{n} पिन के साथ पुनः योजना',
    runPinnedHint: 'पिन किए गए कार्य अगले run में अनिवार्य फ़्लोर पर उठाए जाते हैं।',
    runNoCap: 'केवल ब्लॉक योजना प्रकोष्ठ पुनः योजना बना सकता है।',
    runDone: 'पिन किए गए कार्यों सहित योजना पुनः गणित',
    runFailed: 'योजना इंजन विफल',
    statImmediate: 'तत्काल श्रेणी',
    statImmediateSub: 'एक दिन के भीतर block चाहने वाले कार्य',
    statMandatory: 'अनिवार्य फ़्लोर',
    statMandatorySub: 'सुरक्षा-महत्वपूर्ण कार्य पहले रखे जाते हैं',
    statMean: 'औसत ARCI',
    statMeanSub: '{n} कार्यों पर',
    statOverdue: 'विलंबित',
    statOverdueSub: 'अनुरक्षण अंतराल से आगे',
    statPinned: 'अगले run हेतु पिन',
    statPinnedSub: 'पुनः योजना पर फ़्लोर तक उठाए जाएँगे',
    search: 'कार्य, आईडी, परिसंपत्ति या कि.मी. खोजें',
    allDepts: 'सभी विभाग',
    allBands: 'सभी श्रेणियाँ',
    mandatoryOnly: 'केवल अनिवार्य',
    injectedOnly: 'केवल इंजेक्टेड',
    showing: '{total} में से {n}',
    tableTitle: 'क्रमित रजिस्टर',
    tableSub: 'ARCI अनुसार क्रमित। व्याख्या हेतु पंक्ति पर क्लिक करें।',
    colRank: 'क्रम',
    colWork: 'कार्य',
    colDept: 'विभाग',
    colAsset: 'परिसंपत्ति',
    colLocation: 'सेक्शन / कि.मी.',
    colArci: 'ARCI',
    colBand: 'श्रेणी',
    colFloor: 'अनिवार्य फ़्लोर',
    colEsc: 'एस्केलेशन p',
    colDue: 'देय / विलंब',
    colPlan: 'योजना में',
    colActions: 'कार्रवाई',
    floorYes: 'अनिवार्य',
    floorRule: '≤ {d} दिन नियम',
    overdue: '{d} दिन विलंबित',
    dueIn: '{d} दिन में देय',
    placed: '{day} · {block}',
    deferred: 'स्थगित',
    notPlaced: 'नहीं रखा गया',
    pinnedBadge: 'पिन',
    injected: 'इंजेक्टेड',
    explain: 'व्याख्या',
    pin: 'अगले run हेतु पिन',
    unpin: 'पिन हटाएँ',
    pinNoCap: 'केवल ब्लॉक योजना प्रकोष्ठ कार्य पिन कर सकता है।',
    pinnedToast: 'पिन किया गया — अगले run में रखा जाएगा',
    unpinnedToast: 'पिन हटाया गया — अगले run में फिर ARCI से क्रमित',
    emptyTitle: 'इस श्रेणी में कोई कार्य नहीं।',
    emptyBody: 'विभाग, श्रेणी या खोज फ़िल्टर ढीला करें।',
    resetFilters: 'फ़िल्टर रीसेट करें',
    whyTitle: 'यह स्कोर क्यों',
    score: 'ARCI',
    formula: 'ARCI = √safety × Σ (भार × पद){uplift}',
    upliftPart: ' + TSR वृद्धि {u}',
    computation: 'भारित योग {sum} × √{safety} {uplift}= {raw}',
    raisedToFloor: 'अनिवार्य फ़्लोर तक उठाया गया: {arci}',
    mandatoryNotice: 'अनिवार्य फ़्लोर: देय या पहले से TSR वाला सुरक्षा-महत्वपूर्ण कार्य विलंब लागत की परवाह किए बिना पहले रखा जाता है।',
    colTerm: 'पद',
    colValue: 'मान',
    colWeight: 'भार',
    colContribution: 'योगदान',
    multiplier: 'गुणक',
    t_pf: 'विफलता संभावना (30 दिन, Weibull)',
    t_condition: 'मापा गया स्थिति सूचकांक',
    t_odi: 'परिचालन व्यवधान सूचकांक',
    t_overdue: 'विलंब दंड',
    t_escalation: 'ML एस्केलेशन संभावना',
    t_safety: 'सुरक्षा गंभीरता गुणक',
    t_pinned: 'योजनाकार द्वारा पिन',
    placement: 'इस सप्ताह',
    placementScheduled: '{day} {start}–{end}, {block} में रखा गया',
    placementDeferred: 'स्थगित: {reason}',
    placementNone: 'इस सप्ताह की योजना में नहीं',
    showInPlan: 'साप्ताहिक योजना में देखें',
    openGraph: 'एकीकरण में खोलें',
    details: 'विवरण',
    selectPrompt: 'पद देखने हेतु रजिस्टर से कोई कार्य चुनें।',
    weibullTitle: 'Weibull मॉडल',
    weibullSub: 'परिसंपत्ति वर्ग अनुसार, सीडेड विफलता इतिहास पर फिट। वक्र: दो विशिष्ट आयु तक हैज़र्ड दर।',
    beta: 'β',
    eta: 'η',
    n: 'n',
    censored: 'सेंसर्ड',
    b10: 'B10',
    wearOut: 'घिसाव',
    random: 'यादृच्छिक / प्रारंभिक',
    days: '{d} दिन',
    escTitle: 'एस्केलेशन मॉडल',
    escSub: 'लॉजिस्टिक रिग्रेशन: बिना ध्यान दिए दोष के 30 दिन में कड़े TSR तक बढ़ने की संभावना।',
    auc: 'AUC (होल्ड-आउट)',
    precision: 'प्रिसिज़न',
    recall: 'रिकॉल',
    logLoss: 'लॉग लॉस',
    split: 'प्रशिक्षण / होल्ड-आउट',
    splitValue: '{train} / {test}',
  },
} as const;

type TermKey = 't_pf' | 't_condition' | 't_odi' | 't_overdue' | 't_escalation' | 't_safety' | 't_pinned';
const TERM_KEY: Record<string, TermKey> = { pf: 't_pf', condition: 't_condition', odi: 't_odi', overdue: 't_overdue', escalation: 't_escalation', safety: 't_safety', pinned: 't_pinned' };

/** Weibull hazard h(t) = (β/η)(t/η)^(β−1), sampled over (0, 2η]. */
function hazardCurve(fit: WeibullFit, points = 24): number[] {
  const out: number[] = [];
  for (let i = 1; i <= points; i++) {
    const tDays = (2 * fit.eta * i) / points;
    out.push((fit.beta / fit.eta) * Math.pow(tDays / fit.eta, fit.beta - 1));
  }
  return out;
}

export default function RiskPage() {
  const snapshot = useAppStore((s) => s.snapshot);
  if (!snapshot) return <PlanPending />;
  return <RiskBody snapshot={snapshot} />;
}

function RiskBody({ snapshot }: { snapshot: Snapshot }) {
  const t = useT(strings);
  const tc = useT(common);
  const nav = useNavigate();
  const drawer = useDrawerParams();

  const user = useAppStore((s) => s.user);
  const approvals = useAppStore((s) => s.approvals);
  const pinnedTaskIds = useAppStore((s) => s.pinnedTaskIds);
  const pinTask = useAppStore((s) => s.pinTask);
  const unpinTask = useAppStore((s) => s.unpinTask);
  const runPlan = useAppStore((s) => s.runPlan);
  const planStatus = useAppStore((s) => s.planStatus);
  const planVersion = useAppStore((s) => s.planVersion);
  const toast = useAppStore((s) => s.toast);

  const canPlan = can(user, 'plan');
  const deptName = (d: Dept) => tc(d === 'TMS' ? 'tms' : d === 'SMMS' ? 'smms' : 'tdms');

  const [deptFilter, setDeptFilter] = useState<Dept | 'ALL'>('ALL');
  const [band, setBand] = useState<Urgency | 'ALL'>('ALL');
  const [mandatoryOnly, setMandatoryOnly] = useState(false);
  const [injectedOnly, setInjectedOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(drawer.taskId);

  const blocks = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals]);
  const ranked = useMemo(() => [...snapshot.tasks].sort((a, b) => b.risk.arci - a.risk.arci), [snapshot]);
  const rankOf = useMemo(() => new Map(ranked.map((x, i) => [x.id, i + 1])), [ranked]);

  const placementOf = useMemo(() => {
    const sched = new Map(snapshot.result.weekly.ai.scheduled.map((s) => [s.taskId, s]));
    const deferred = new Map(snapshot.result.weekly.ai.deferred.map((d) => [d.taskId, d]));
    const blockOf = new Map<string, string>();
    for (const b of blocks) for (const x of b.tasks) blockOf.set(x.id, b.id);
    return { sched, deferred, blockOf };
  }, [snapshot, blocks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ranked.filter((x) => {
      if (deptFilter !== 'ALL' && x.dept !== deptFilter) return false;
      if (band !== 'ALL' && x.risk.urgency !== band) return false;
      if (mandatoryOnly && !x.risk.mandatory) return false;
      if (injectedOnly && !x.injected) return false;
      if (q) {
        const hay = `${x.id} ${x.label} ${x.workType} ${x.assetClass} ${x.sectionLabel} ${x.startKm} ${x.endKm}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [ranked, deptFilter, band, mandatoryOnly, injectedOnly, query]);

  const active: Task | null = useMemo(() => (selectedId ? ranked.find((x) => x.id === selectedId) ?? null : filtered[0] ?? null), [ranked, selectedId, filtered]);

  const stats = useMemo(() => {
    let immediate = 0;
    let mandatory = 0;
    let overdue = 0;
    let sum = 0;
    for (const x of ranked) {
      if (x.risk.urgency === 'IMMEDIATE') immediate++;
      if (x.risk.mandatory) mandatory++;
      if (x.daysOverdue > 0) overdue++;
      sum += x.risk.arci;
    }
    return { immediate, mandatory, overdue, mean: ranked.length ? sum / ranked.length : 0 };
  }, [ranked]);

  const handleTogglePin = useCallback(
    (taskId: string) => {
      if (!canPlan) return;
      if (pinnedTaskIds.includes(taskId)) {
        unpinTask(taskId);
        toast({ title: t('unpinnedToast'), body: taskId, tone: 'info' });
      } else {
        pinTask(taskId);
        toast({ title: t('pinnedToast'), body: taskId, tone: 'ok' });
      }
    },
    [canPlan, pinnedTaskIds, pinTask, unpinTask, toast, t]
  );

  const handleRunPinned = async () => {
    await runPlan({ reason: `pinned works (${pinnedTaskIds.length})` });
    const s = useAppStore.getState();
    if (s.planStatus === 'error') toast({ title: t('runFailed'), body: s.planError ?? undefined, tone: 'crit' });
    else toast({ title: t('runDone'), body: pinnedTaskIds.join(', '), tone: 'ok' });
  };

  const resetFilters = () => {
    setDeptFilter('ALL');
    setBand('ALL');
    setMandatoryOnly(false);
    setInjectedOnly(false);
    setQuery('');
  };

  const columns: Column<Task>[] = useMemo(
    () => [
      { key: 'rank', header: t('colRank'), num: true, width: 56, render: (r) => <span className="mono strong">{rankOf.get(r.id)}</span> },
      {
        key: 'work',
        header: t('colWork'),
        render: (r) => (
          <div className="stack" style={{ gap: 2 }}>
            <span className="small strong">{r.label}</span>
            <span className="row-wrap tiny muted" style={{ gap: 4 }}>
              <span className="mono">{r.id}</span>
              {pinnedTaskIds.includes(r.id) && <Badge tone="blue">{t('pinnedBadge')}</Badge>}
              {r.injected && <Badge tone="yellow">{t('injected')}</Badge>}
            </span>
          </div>
        ),
      },
      { key: 'dept', header: t('colDept'), render: (r) => <DeptBadge dept={r.dept} /> },
      { key: 'asset', header: t('colAsset'), hideMobile: true, render: (r) => <span className="small mono">{r.assetClass}</span> },
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
      { key: 'band', header: t('colBand'), render: (r) => <UrgencyBadge urgency={r.risk.urgency} /> },
      {
        key: 'floor',
        header: t('colFloor'),
        hideMobile: true,
        render: (r) => (r.risk.mandatory ? <Badge tone="crit" icon={<ShieldAlert size={12} />}>{t('floorYes')}</Badge> : <span className="tiny muted">{t('floorRule', { d: r.mandatoryWithinDays })}</span>),
      },
      { key: 'esc', header: t('colEsc'), num: true, hideMobile: true, render: (r) => <span className="mono small">{pct(r.risk.escalation, 0)}</span> },
      {
        key: 'due',
        header: t('colDue'),
        render: (r) => (r.daysOverdue > 0 ? <Badge tone="crit">{t('overdue', { d: r.daysOverdue })}</Badge> : <span className="tiny muted">{t('dueIn', { d: -r.daysOverdue })}</span>),
      },
      {
        key: 'plan',
        header: t('colPlan'),
        hideMobile: true,
        render: (r) => {
          const s = placementOf.sched.get(r.id);
          if (s) return <Badge tone="ok">{t('placed', { day: dateLabel(addDaysIso(snapshot.planStart, s.day)), block: placementOf.blockOf.get(r.id) ?? '—' })}</Badge>;
          const d = placementOf.deferred.get(r.id);
          if (d) return <Badge tone="warn" title={d.reason}>{t('deferred')}</Badge>;
          return <span className="tiny muted">{t('notPlaced')}</span>;
        },
      },
      {
        key: 'actions',
        header: t('colActions'),
        render: (r) => {
          const pinned = pinnedTaskIds.includes(r.id);
          return (
            <div className="row" style={{ gap: 4 }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(r.id);
                }}
              >
                <Eye size={12} /> {t('explain')}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-icon"
                disabled={!canPlan}
                title={!canPlan ? t('pinNoCap') : pinned ? t('unpin') : t('pin')}
                aria-label={pinned ? t('unpin') : t('pin')}
                aria-pressed={pinned}
                onClick={(e) => {
                  e.stopPropagation();
                  handleTogglePin(r.id);
                }}
              >
                {pinned ? <PinOff size={12} /> : <Pin size={12} />}
              </button>
            </div>
          );
        },
      },
    ],
    [t, rankOf, pinnedTaskIds, placementOf, snapshot.planStart, canPlan, handleTogglePin]
  );

  const weibull = Object.entries(snapshot.models.weibull);
  const esc = snapshot.models.escalationMetrics;
  const running = planStatus === 'running';

  // Term-by-term arithmetic for the selected work
  const breakdown = useMemo(() => {
    if (!active) return null;
    const terms = active.risk.explanation;
    const weighted = terms.filter((x) => x.weight !== null);
    const sum = weighted.reduce((a, x) => a + (x.weight ?? 0) * x.value, 0);
    const safety = terms.find((x) => x.key === 'safety')?.value ?? null;
    const raw = safety !== null ? Math.sqrt(safety) * sum + active.risk.tsrUplift : null;
    return { terms, sum, safety, raw };
  }, [active]);

  const activePlacement = active ? { sched: placementOf.sched.get(active.id), deferred: placementOf.deferred.get(active.id), block: placementOf.blockOf.get(active.id) } : null;

  return (
    <div className="stack-lg">
      <PageHeader
        title={t('title')}
        lede={t('lede')}
        badges={
          <>
            <Badge tone="blue">{snapshot.corridor.name}</Badge>
            <Badge tone="gray">{t('nWorks', { n: ranked.length })}</Badge>
            <SeedStamp seed={FEED_SEED} runId={planVersion} ms={snapshot.timing.ms} />
            <SimLabel kind="model" />
          </>
        }
        actions={
          <>
            <button type="button" className="btn" onClick={() => nav('/app/planning/optimiser')}>
              <Sliders size={14} /> {t('changeWeights')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canPlan || running || !pinnedTaskIds.length}
              title={canPlan ? t('runPinnedHint') : t('runNoCap')}
              onClick={() => void handleRunPinned()}
            >
              <Play size={14} /> {t('runPinned', { n: pinnedTaskIds.length })}
            </button>
          </>
        }
      />

      <div className="stat-grid">
        <StatTile label={t('statImmediate')} value={stats.immediate} sub={t('statImmediateSub')} />
        <StatTile label={t('statMandatory')} value={stats.mandatory} sub={t('statMandatorySub')} />
        <StatTile label={t('statMean')} value={num(stats.mean, 3)} sub={t('statMeanSub', { n: ranked.length })} />
        <StatTile label={t('statOverdue')} value={stats.overdue} sub={t('statOverdueSub')} />
        <StatTile label={t('statPinned')} value={pinnedTaskIds.length} sub={t('statPinnedSub')} />
      </div>

      <Card>
        <CardBody tight>
          <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
            <div className="row-wrap grow">
              <label className="row grow" style={{ minWidth: 200, position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--ink-3)' }} aria-hidden="true" />
                <input className="input" type="search" placeholder={t('search')} aria-label={t('search')} value={query} onChange={(e) => setQuery(e.target.value)} style={{ paddingLeft: 30 }} />
              </label>
              <select className="select" style={{ width: 'auto' }} value={deptFilter} onChange={(e) => setDeptFilter(e.target.value as Dept | 'ALL')} aria-label={t('allDepts')}>
                <option value="ALL">{t('allDepts')}</option>
                {DEPTS.map((d) => (
                  <option key={d} value={d}>
                    {deptName(d)}
                  </option>
                ))}
              </select>
              <select className="select" style={{ width: 'auto' }} value={band} onChange={(e) => setBand(e.target.value as Urgency | 'ALL')} aria-label={t('allBands')}>
                <option value="ALL">{t('allBands')}</option>
                {BANDS.map((b) => (
                  <option key={b} value={b}>
                    {tc(b === 'IMMEDIATE' ? 'immediate' : b === 'HIGH' ? 'high' : b === 'TACTICAL' ? 'tactical' : 'strategic')}
                  </option>
                ))}
              </select>
              <label className="check small">
                <input type="checkbox" checked={mandatoryOnly} onChange={(e) => setMandatoryOnly(e.target.checked)} /> {t('mandatoryOnly')}
              </label>
              <label className="check small">
                <input type="checkbox" checked={injectedOnly} onChange={(e) => setInjectedOnly(e.target.checked)} /> {t('injectedOnly')}
              </label>
            </div>
            <span className="tiny muted num">{t('showing', { n: filtered.length, total: ranked.length })}</span>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-main-aside" style={{ alignItems: 'start' }}>
        <Card>
          <CardHead title={t('tableTitle')} sub={t('tableSub')} />
          <CardBody flush>
            <div data-tour="risk-table">
              {filtered.length ? (
                <DataTable<Task> rows={filtered} columns={columns} rowKey={(r) => r.id} onRowClick={(r) => setSelectedId(r.id)} selectedKey={active?.id ?? null} compact maxHeight={640} />
              ) : (
                <EmptyState
                  title={t('emptyTitle')}
                  body={t('emptyBody')}
                  action={
                    <button type="button" className="btn btn-sm" onClick={resetFilters}>
                      {t('resetFilters')}
                    </button>
                  }
                />
              )}
            </div>
          </CardBody>
        </Card>

        <div className="stack-lg">
          <Card>
            {active && breakdown ? (
              <>
                <CardHead
                  title={t('whyTitle')}
                  sub={
                    <span className="row-wrap" style={{ gap: 6 }}>
                      <span className="mono">{active.id}</span>
                      <DeptBadge dept={active.dept} />
                      <UrgencyBadge urgency={active.risk.urgency} />
                    </span>
                  }
                  right={
                    <button type="button" className="btn btn-sm" onClick={() => drawer.open('task', active.id)}>
                      <ExternalLink size={12} /> {t('details')}
                    </button>
                  }
                />
                <CardBody>
                  <div className="stack">
                    <div className="small strong">{active.label}</div>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="small muted">{t('score')}</span>
                      <span className="h2 num">{num(active.risk.arci, 3)}</span>
                    </div>
                    <ArciBar value={active.risk.arci} mandatory={active.risk.mandatory} />
                    {active.risk.mandatory && <Callout tone="crit">{t('mandatoryNotice')}</Callout>}

                    <div className="tiny muted mono">{t('formula', { uplift: active.risk.tsrUplift ? t('upliftPart', { u: num(active.risk.tsrUplift, 2) }) : '' })}</div>

                    <div className="table-wrap">
                      <table className="tbl compact">
                        <thead>
                          <tr>
                            <th>{t('colTerm')}</th>
                            <th className="num">{t('colValue')}</th>
                            <th className="num">{t('colWeight')}</th>
                            <th className="num">{t('colContribution')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {breakdown.terms.map((x) => (
                            <tr key={x.key}>
                              <td>
                                <div className="small strong">{TERM_KEY[x.key] ? t(TERM_KEY[x.key]) : x.label}</div>
                                <div className="tiny muted">{x.text}</div>
                                {x.weight !== null && <Meter value={x.value} tone={arciTone(x.value)} style={{ marginTop: 4 }} />}
                              </td>
                              <td className="num mono">{num(x.value, 2)}</td>
                              <td className="num mono">{x.weight !== null ? num(x.weight, 2) : x.key === 'safety' ? t('multiplier') : '—'}</td>
                              <td className="num mono">{x.weight !== null ? num(x.weight * x.value, 3) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {breakdown.raw !== null && breakdown.safety !== null && (
                      <div className="tiny muted mono">
                        {t('computation', {
                          sum: num(breakdown.sum, 3),
                          safety: num(breakdown.safety, 2),
                          uplift: active.risk.tsrUplift ? `+ ${num(active.risk.tsrUplift, 2)} ` : '',
                          raw: num(Math.min(1, breakdown.raw), 3),
                        })}
                        {active.risk.arci > Math.min(1, breakdown.raw) + 1e-6 && <div>{t('raisedToFloor', { arci: num(active.risk.arci, 3) })}</div>}
                      </div>
                    )}

                    <div className="well stack" style={{ gap: 6 }}>
                      <span className="caps">{t('placement')}</span>
                      <span className="small">
                        {activePlacement?.sched
                          ? t('placementScheduled', {
                              day: dateLabel(addDaysIso(snapshot.planStart, activePlacement.sched.day)),
                              start: hhmm(activePlacement.sched.start),
                              end: hhmm(activePlacement.sched.end),
                              block: activePlacement.block ?? '—',
                            })
                          : activePlacement?.deferred
                            ? t('placementDeferred', { reason: activePlacement.deferred.reason })
                            : t('placementNone')}
                      </span>
                      <div className="row-wrap">
                        <button type="button" className="btn btn-sm" onClick={() => nav(`/app/planning/weekly?task=${encodeURIComponent(active.id)}`)}>
                          <ArrowRight size={12} /> {t('showInPlan')}
                        </button>
                        <button type="button" className="btn btn-sm" onClick={() => nav(`/app/planning/integration?task=${encodeURIComponent(active.id)}`)}>
                          <Share2 size={12} /> {t('openGraph')}
                        </button>
                        <button type="button" className="btn btn-sm" disabled={!canPlan} title={canPlan ? undefined : t('pinNoCap')} onClick={() => handleTogglePin(active.id)}>
                          {pinnedTaskIds.includes(active.id) ? <PinOff size={12} /> : <Pin size={12} />} {pinnedTaskIds.includes(active.id) ? t('unpin') : t('pin')}
                        </button>
                      </div>
                    </div>
                  </div>
                </CardBody>
              </>
            ) : (
              <CardBody>
                <div className="empty">{t('selectPrompt')}</div>
              </CardBody>
            )}
          </Card>

          <Card>
            <CardHead title={t('weibullTitle')} sub={t('weibullSub')} icon={<Brain size={16} />} right={<SimLabel kind="model" short />} />
            <CardBody>
              <div className="stack">
                {weibull.map(([cls, fit]) => (
                  <div key={cls} className="well" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'center' }}>
                    <div className="stack" style={{ gap: 4 }}>
                      <span className="row-wrap" style={{ gap: 6 }}>
                        <span className="small strong">{fit.label || cls}</span>
                        <Badge tone={fit.wearOut ? 'warn' : 'gray'}>{fit.wearOut ? t('wearOut') : t('random')}</Badge>
                      </span>
                      <span className="tiny muted mono">
                        {t('beta')} {num(fit.beta, 2)} · {t('eta')} {t('days', { d: num(fit.eta) })} · {t('n')} {fit.n} · {t('censored')} {Math.max(0, fit.n - fit.failures)} · {t('b10')} {t('days', { d: num(fit.b10Days) })}
                      </span>
                    </div>
                    <Sparkline values={hazardCurve(fit)} width={96} height={30} color="var(--series-4)" />
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHead title={t('escTitle')} sub={t('escSub')} right={<SimLabel kind="model" short />} />
            <CardBody>
              <KeyValue
                items={[
                  [t('auc'), <span key="auc" className="num mono">{num(esc.test.auc, 2)}</span>],
                  [t('precision'), <span key="precision" className="num mono">{pct(esc.test.precision, 0)}</span>],
                  [t('recall'), <span key="recall" className="num mono">{pct(esc.test.recall, 0)}</span>],
                  [t('logLoss'), <span key="logLoss" className="num mono">{num(esc.test.logLoss, 3)}</span>],
                  [t('split'), <span key="split" className="num mono">{t('splitValue', { train: esc.nTrain, test: esc.nTest })}</span>],
                ]}
              />
            </CardBody>
          </Card>
        </div>
      </div>

      <TaskDrawer taskId={drawer.taskId} onClose={() => drawer.close('task')} />
    </div>
  );
}
