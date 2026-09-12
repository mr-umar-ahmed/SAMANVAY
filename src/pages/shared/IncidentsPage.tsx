/**
 * IncidentsPage — hazard reports from loco pilots, gangs and citizens
 * (docs/v4-spec.md §3.7), in three modes:
 *   - control: every report on the corridor; verify, caution, re-route, close
 *   - dept: reports routed to the department; assign, convert to task, resolve
 *   - division: every report; reassign where routing went wrong
 * The list lives here; the report itself and its triage actions open in the
 * shared ReportDrawer (?report=<id>, or the /incidents/:id route). Routing is
 * rule-based on the report category; the location is snapped to the corridor.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { TrainFront, UserRound, Wrench } from 'lucide-react';
import { usePortal, usePortalDept } from '../../app/usePortal';
import type { PortalId } from '../../auth/portals';
import { nextTrainAt } from '../../engine/select';
import type { Dept, RunLine, Snapshot, Train } from '../../engine/types';
import { useT } from '../../i18n';
import { DEPT_LABEL, nowMinuteIST, timeAgo } from '../../lib/format';
import { SEVERITY_THRESHOLDS } from '../../lib/triage';
import { deptForCategory, useAppStore, type HazardReport, type ReportCategory } from '../../store/useAppStore';
import { Badge, Callout, Card, CardBody, CardHead, DataTable, DeptBadge, PageHeader, PlanPending, StatTile, StatusBadge, Tabs, type Column, type Tone } from '../../components/ui';
import { SimLabel } from '../../components/ui/extras';
import { ReportDrawer } from '../../components/domain/ReportDrawer';
import { useDrawerParams } from '../../components/domain/useDrawerParams';

export interface IncidentsPageProps {
  mode?: 'control' | 'dept' | 'division';
}

type Mode = 'control' | 'dept' | 'division';
type StatusTab = 'UNVERIFIED' | 'TRIAGED' | 'TASK' | 'CLOSED' | 'ALL';
type Severity = 'low' | 'medium' | 'high';
const CATEGORIES: ReportCategory[] = ['track', 'signal', 'ohe', 'lc', 'fire', 'obstruction', 'other'];
const DEPTS: Dept[] = ['TMS', 'SMMS', 'TDMS'];

const strings = {
  en: {
    title: 'Incidents',
    ledeControl: 'Reports from loco pilots, gangs and citizens with km and the next train. Verify, impose a caution, re-route or close.',
    ledeDept: 'Reports routed to {dept} by category and location. Assign to field staff, convert to a task or resolve.',
    ledeDivision: 'Every report on the corridor. Reassign where the routing went wrong.',
    routing: 'Routing is rule-based on category and nearest corridor asset: {rules}; anything else goes to Control. The location is snapped to the nearest chainage; photos are stored, not analysed.',
    routeRule: '{cats} → {dept}',
    tabNew: 'New',
    tabVerifying: 'Verifying',
    tabConverted: 'Converted',
    tabClosed: 'Closed',
    tabAll: 'All',
    statNew: 'New',
    statNewSub: 'Oldest waiting {age}',
    statNewNone: 'Nothing waiting',
    statVerifying: 'Being verified',
    statVerifyingSub: '{n} assigned to field staff',
    statConverted: 'Converted to work',
    statConvertedSub: '{n} in the current plan',
    statClosed: 'Closed',
    statClosedSub: '{n} not found or duplicate',
    search: 'Search reference, text, station or train',
    allDepts: 'All departments',
    unrouted: 'Control (not routed)',
    allCats: 'All categories',
    allSev: 'All severities',
    tableTitle: 'Reports',
    tableSub: '{n} shown · open a row for the photo, routing and actions',
    colRef: 'Ref',
    colSource: 'Source',
    colCategory: 'Category',
    colLocation: 'Location',
    colAge: 'Reported',
    colRouted: 'Routed to',
    colNext: 'Next train',
    colSeverity: 'Severity',
    colStatus: 'Status',
    srcCitizen: 'Citizen',
    srcField: 'Field staff',
    srcLp: 'Loco pilot of {train}',
    srcLpNoTrain: 'Loco pilot',
    cat_track: 'Track',
    cat_signal: 'Signal',
    cat_ohe: 'OHE',
    cat_lc: 'Level crossing',
    cat_fire: 'Fire or smoke',
    cat_obstruction: 'Obstruction or animal',
    cat_other: 'Other',
    sev_low: 'Low',
    sev_medium: 'Medium',
    sev_high: 'High',
    control: 'Control',
    noKm: 'No km given',
    nextIn: '{train} in {min} min',
    nextNow: '{train} passing now',
    nextNone: 'None today',
    emptyDept: 'No open reports for {dept}.',
    emptyFilter: 'No reports match these filters.',
    severityRule: 'Where the reporter did not choose a severity, it is computed from a rule-based points table (category, minutes to the next train, premium service, running line, TSR in force): high at {h} points or more, medium at {m} or more, else low. It is not a model.',
    sevComputed: 'computed',
    sevComputedTitle: 'Computed by the rule-based points table',
    sevReporterTitle: 'Chosen by the reporter',
    catSuggested: 'rule suggests {cat}',
  },
  hi: {
    title: 'घटनाएँ',
    ledeControl: 'लोको पायलट, गैंग और नागरिकों की रिपोर्ट किमी और अगली ट्रेन सहित। सत्यापित करें, सावधानी लगाएँ, पुनः भेजें या बंद करें।',
    ledeDept: 'श्रेणी और स्थान के आधार पर {dept} को भेजी गई रिपोर्ट। फ़ील्ड स्टाफ़ को सौंपें, कार्य में बदलें या निस्तारित करें।',
    ledeDivision: 'कॉरिडोर की सभी रिपोर्ट। जहाँ रूटिंग गलत हुई हो, पुनः सौंपें।',
    routing: 'रूटिंग श्रेणी और निकटतम कॉरिडोर संपत्ति पर आधारित नियम है: {rules}; बाकी सब नियंत्रण को। स्थान निकटतम चेनेज पर जोड़ा जाता है; फ़ोटो संग्रहीत होते हैं, उनका विश्लेषण नहीं होता।',
    routeRule: '{cats} → {dept}',
    tabNew: 'नई',
    tabVerifying: 'सत्यापनाधीन',
    tabConverted: 'कार्य में बदली',
    tabClosed: 'बंद',
    tabAll: 'सभी',
    statNew: 'नई',
    statNewSub: 'सबसे पुरानी {age} से प्रतीक्षा में',
    statNewNone: 'कोई प्रतीक्षा में नहीं',
    statVerifying: 'सत्यापनाधीन',
    statVerifyingSub: '{n} फ़ील्ड स्टाफ़ को सौंपी गईं',
    statConverted: 'कार्य में बदली',
    statConvertedSub: '{n} वर्तमान योजना में',
    statClosed: 'बंद',
    statClosedSub: '{n} नहीं मिलीं या दोहराव',
    search: 'संदर्भ, विवरण, स्टेशन या ट्रेन खोजें',
    allDepts: 'सभी विभाग',
    unrouted: 'नियंत्रण (रूट नहीं)',
    allCats: 'सभी श्रेणियाँ',
    allSev: 'सभी गंभीरता',
    tableTitle: 'रिपोर्ट',
    tableSub: '{n} दिखाई गईं · फ़ोटो, रूटिंग और कार्रवाई के लिए पंक्ति खोलें',
    colRef: 'संदर्भ',
    colSource: 'स्रोत',
    colCategory: 'श्रेणी',
    colLocation: 'स्थान',
    colAge: 'रिपोर्ट',
    colRouted: 'किसे भेजी',
    colNext: 'अगली ट्रेन',
    colSeverity: 'गंभीरता',
    colStatus: 'स्थिति',
    srcCitizen: 'नागरिक',
    srcField: 'फ़ील्ड स्टाफ़',
    srcLp: '{train} के लोको पायलट',
    srcLpNoTrain: 'लोको पायलट',
    cat_track: 'ट्रैक',
    cat_signal: 'सिग्नल',
    cat_ohe: 'OHE',
    cat_lc: 'समपार फाटक',
    cat_fire: 'आग या धुआँ',
    cat_obstruction: 'अवरोध या पशु',
    cat_other: 'अन्य',
    sev_low: 'निम्न',
    sev_medium: 'मध्यम',
    sev_high: 'उच्च',
    control: 'नियंत्रण',
    noKm: 'किमी नहीं दिया',
    nextIn: '{train} {min} मिनट में',
    nextNow: '{train} अभी गुजर रही है',
    nextNone: 'आज कोई नहीं',
    emptyDept: '{dept} के लिए कोई खुली रिपोर्ट नहीं।',
    emptyFilter: 'इन फ़िल्टरों से कोई रिपोर्ट मेल नहीं खाती।',
    severityRule: 'जहाँ रिपोर्टकर्ता ने गंभीरता नहीं चुनी, वहाँ यह नियम-आधारित अंक तालिका से निकाली जाती है (श्रेणी, अगली ट्रेन तक मिनट, प्रीमियम सेवा, रनिंग लाइन, लागू TSR): {h} या अधिक अंक पर उच्च, {m} या अधिक पर मध्यम, अन्यथा निम्न। यह कोई मॉडल नहीं है।',
    sevComputed: 'गणना से',
    sevComputedTitle: 'नियम-आधारित अंक तालिका से गणना',
    sevReporterTitle: 'रिपोर्टकर्ता द्वारा चुनी गई',
    catSuggested: 'नियम सुझाव: {cat}',
  },
} as const;

type Key = keyof typeof strings.en;
const SEV_TONE: Record<Severity, Tone> = { low: 'gray', medium: 'warn', high: 'crit' };

export default function IncidentsPage({ mode }: IncidentsPageProps) {
  const snapshot = useAppStore((s) => s.snapshot);
  const portal = usePortal();
  const dept = usePortalDept();
  if (!snapshot) return <PlanPending />;
  const m: Mode = mode ?? (portal === 'division' ? 'division' : dept ? 'dept' : 'control');
  return <Incidents snapshot={snapshot} mode={m} dept={m === 'dept' ? dept : null} portal={portal} />;
}

function Incidents({ snapshot, mode, dept, portal }: { snapshot: Snapshot; mode: Mode; dept: Dept | null; portal: PortalId }) {
  const t = useT(strings);
  const nav = useNavigate();
  const { id: routeId } = useParams<{ id?: string }>();
  const drawer = useDrawerParams();
  const reports = useAppStore((s) => s.reports);

  const [tab, setTab] = useState<StatusTab | null>(null);
  const [query, setQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState<Dept | 'ALL' | 'NONE'>('ALL');
  const [category, setCategory] = useState<ReportCategory | 'ALL'>('ALL');
  const [severity, setSeverity] = useState<Severity | 'ALL'>('ALL');

  /* wall-clock minute for "next train in" (refreshed every minute) */
  const [minute, setMinute] = useState(() => nowMinuteIST());
  useEffect(() => {
    const id = window.setInterval(() => setMinute(nowMinuteIST()), 60000);
    return () => window.clearInterval(id);
  }, []);

  const corridorId = snapshot.corridor.id;
  const scoped = useMemo(() => reports.filter((r) => r.corridorId === corridorId && (mode !== 'dept' || r.dept === dept)), [reports, corridorId, mode, dept]);

  const counts = useMemo(() => {
    const c = { UNVERIFIED: 0, TRIAGED: 0, TASK: 0, CLOSED: 0, ALL: scoped.length };
    for (const r of scoped) {
      if (r.status === 'RESOLVED' || r.status === 'REJECTED') c.CLOSED++;
      else c[r.status]++;
    }
    return c;
  }, [scoped]);
  const activeTab: StatusTab = tab ?? (counts.UNVERIFIED > 0 ? 'UNVERIFIED' : 'ALL');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped
      .filter((r) => {
        if (activeTab === 'CLOSED' ? r.status !== 'RESOLVED' && r.status !== 'REJECTED' : activeTab !== 'ALL' && r.status !== activeTab) return false;
        if (mode !== 'dept' && deptFilter !== 'ALL' && (deptFilter === 'NONE' ? r.dept !== null : r.dept !== deptFilter)) return false;
        if (category !== 'ALL' && r.category !== category) return false;
        if (severity !== 'ALL' && r.severity !== severity) return false;
        if (q && ![r.id, r.description, r.nearestStation ?? '', r.trainNumber ?? '', r.reporter.name].some((s) => s.toLowerCase().includes(q))) return false;
        return true;
      })
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [scoped, activeTab, mode, deptFilter, category, severity, query]);

  /* next timetabled train at each report's chainage (plan day 0, WTT-derived) */
  const nextTrain = useMemo(() => {
    const m = new Map<string, { train: Train; inMin: number } | null>();
    for (const r of rows) {
      if (r.km === undefined) continue;
      const lines: RunLine[] = r.line === 'UP' || r.line === 'DN' ? [r.line] : ['UP', 'DN'];
      let best: { train: Train; inMin: number } | null = null;
      for (const l of lines) {
        const n = nextTrainAt(snapshot, 0, minute, r.km, l);
        if (n && (!best || n.inMin < best.inMin)) best = n;
      }
      m.set(r.id, best);
    }
    return m;
  }, [rows, snapshot, minute]);

  const inPlan = useMemo(() => new Set(snapshot.tasks.map((x) => x.sourceId)), [snapshot]);
  const oldestNew = scoped.filter((r) => r.status === 'UNVERIFIED').sort((a, b) => a.at.localeCompare(b.at))[0];

  const routingRules = DEPTS.map((d) => t('routeRule', { cats: CATEGORIES.filter((c) => deptForCategory(c) === d).map((c) => t(`cat_${c}` as Key)).join(', '), dept: DEPT_LABEL[d].short })).join('; ');
  const sourceLabel = (r: HazardReport) => (r.source === 'citizen' ? t('srcCitizen') : r.source === 'field' ? t('srcField') : r.trainNumber ? t('srcLp', { train: r.trainNumber }) : t('srcLpNoTrain'));

  const openId = drawer.reportId ?? routeId ?? null;
  const closeDrawer = () => {
    if (routeId && !drawer.reportId) nav(`/app/${portal}/incidents`, { replace: true });
    else drawer.close('report');
  };

  const cols: Column<HazardReport>[] = [
    {
      key: 'ref',
      header: t('colRef'),
      render: (r) => (
        <div className="stack" style={{ gap: 2 }}>
          <button className="btn btn-sm btn-ghost mono" style={{ paddingLeft: 0 }} onClick={(e) => { e.stopPropagation(); drawer.open('report', r.id); }}>
            {r.id}
          </button>
          {r.seeded && <SimLabel kind="seededRecords" short />}
        </div>
      ),
    },
    {
      key: 'source',
      header: t('colSource'),
      render: (r) => (
        <span className="row small" style={{ gap: 6 }}>
          {r.source === 'locoPilot' ? <TrainFront size={14} /> : r.source === 'field' ? <Wrench size={14} /> : <UserRound size={14} />}
          {sourceLabel(r)}
        </span>
      ),
    },
    {
      key: 'category',
      header: t('colCategory'),
      render: (r) => (
        <div>
          <span className="small">{t(`cat_${r.category}` as Key)}</span>
          {r.suggestedCategory && r.suggestedCategory.category !== r.category && (
            <div className="tiny muted" title={r.suggestedCategory.matched.join(', ')}>{t('catSuggested', { cat: t(`cat_${r.suggestedCategory.category}` as Key) })}</div>
          )}
        </div>
      ),
    },
    {
      key: 'location',
      header: t('colLocation'),
      render: (r) =>
        r.km === undefined ? (
          <span className="small muted">{t('noKm')}</span>
        ) : (
          <span className="small">
            <span className="mono num">km {r.km.toFixed(1)}</span>
            {r.nearestStation ? ` · ${r.nearestStation}` : ''}
            {r.line ? ` · ${r.line}` : ''}
          </span>
        ),
    },
    { key: 'age', header: t('colAge'), hideMobile: true, render: (r) => <span className="small muted">{timeAgo(r.at)}</span> },
    { key: 'routed', header: t('colRouted'), render: (r) => (r.dept ? <DeptBadge dept={r.dept} /> : <Badge tone="warn">{t('control')}</Badge>) },
    {
      key: 'next',
      header: (
        <span className="row" style={{ gap: 4 }}>
          {t('colNext')} <SimLabel kind="wttPositions" short />
        </span>
      ),
      render: (r) => {
        if (r.km === undefined) return <span className="muted">—</span>;
        const n = nextTrain.get(r.id);
        if (!n) return <span className="small muted">{t('nextNone')}</span>;
        const label = n.inMin <= 1 ? t('nextNow', { train: n.train.number }) : t('nextIn', { train: n.train.number, min: n.inMin });
        return <span className={`small num ${n.inMin <= 15 ? 'strong' : ''}`} style={n.inMin <= 15 ? { color: 'var(--crit)' } : undefined}>{label}</span>;
      },
    },
    {
      key: 'severity',
      header: t('colSeverity'),
      hideMobile: true,
      render: (r) =>
        r.severity ? (
          <div title={r.severityAuto ? [t('sevComputedTitle'), ...(r.severityReasons ?? [])].join('\n') : t('sevReporterTitle')}>
            <Badge tone={SEV_TONE[r.severity]}>{t(`sev_${r.severity}` as Key)}</Badge>
            {r.severityAuto && <div className="tiny muted">{t('sevComputed')}</div>}
          </div>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      key: 'status',
      header: t('colStatus'),
      render: (r) => (
        <div className="row-wrap" style={{ gap: 4 }}>
          <StatusBadge status={r.status} />
          {/* severity column is hidden on phones; show it here instead */}
          {r.severity && (
            <div className="show-mobile tiny">
              <Badge tone={SEV_TONE[r.severity]}>{t(`sev_${r.severity}` as Key)}</Badge>
              {r.severityAuto && <span className="muted"> {t('sevComputed')}</span>}
            </div>
          )}
        </div>
      ),
    },
  ];

  const lede = mode === 'dept' && dept ? t('ledeDept', { dept: DEPT_LABEL[dept].long }) : mode === 'division' ? t('ledeDivision') : t('ledeControl');
  const empty = mode === 'dept' && dept && activeTab !== 'CLOSED' && !query && category === 'ALL' && severity === 'ALL' ? t('emptyDept', { dept: DEPT_LABEL[dept].long }) : t('emptyFilter');

  return (
    <div className="stack-lg">
      <PageHeader title={t('title')} lede={lede} badges={mode === 'dept' && dept ? <DeptBadge dept={dept} long /> : undefined} />

      <div className="grid grid-auto">
        <StatTile label={t('statNew')} value={counts.UNVERIFIED} sub={oldestNew ? t('statNewSub', { age: timeAgo(oldestNew.at) }) : t('statNewNone')} />
        <StatTile label={t('statVerifying')} value={counts.TRIAGED} sub={t('statVerifyingSub', { n: scoped.filter((r) => r.status === 'TRIAGED' && r.assignee).length })} />
        <StatTile label={t('statConverted')} value={counts.TASK} sub={t('statConvertedSub', { n: scoped.filter((r) => r.status === 'TASK' && inPlan.has(r.taskSpec?.sourceId ?? `REPORT/${r.id}`)).length })} />
        <StatTile label={t('statClosed')} value={counts.CLOSED} sub={t('statClosedSub', { n: scoped.filter((r) => r.status === 'REJECTED').length })} />
      </div>

      <Callout tone="neutral">
        <div>{t('routing', { rules: routingRules })}</div>
        <div className="mt">{t('severityRule', { h: SEVERITY_THRESHOLDS.high, m: SEVERITY_THRESHOLDS.medium })}</div>
      </Callout>

      <Tabs<StatusTab>
        value={activeTab}
        onChange={setTab}
        tabs={[
          { id: 'UNVERIFIED', label: t('tabNew'), count: counts.UNVERIFIED },
          { id: 'TRIAGED', label: t('tabVerifying'), count: counts.TRIAGED },
          { id: 'TASK', label: t('tabConverted'), count: counts.TASK },
          { id: 'CLOSED', label: t('tabClosed'), count: counts.CLOSED },
          { id: 'ALL', label: t('tabAll'), count: counts.ALL },
        ]}
      />

      <Card>
        <CardHead title={t('tableTitle')} sub={t('tableSub', { n: rows.length })} right={scoped.some((r) => r.seeded) ? <SimLabel kind="seededRecords" /> : undefined} />
        <CardBody tight>
          <div className="row-wrap">
            <input className="input grow" style={{ flex: '1 1 220px', width: 'auto' }} type="search" placeholder={t('search')} aria-label={t('search')} value={query} onChange={(e) => setQuery(e.target.value)} />
            {mode !== 'dept' && (
              <select className="select" style={{ width: 'auto' }} aria-label={t('colRouted')} value={deptFilter} onChange={(e) => setDeptFilter(e.target.value as Dept | 'ALL' | 'NONE')}>
                <option value="ALL">{t('allDepts')}</option>
                {DEPTS.map((d) => <option key={d} value={d}>{DEPT_LABEL[d].short} ({DEPT_LABEL[d].system})</option>)}
                <option value="NONE">{t('unrouted')}</option>
              </select>
            )}
            <select className="select" style={{ width: 'auto' }} aria-label={t('colCategory')} value={category} onChange={(e) => setCategory(e.target.value as ReportCategory | 'ALL')}>
              <option value="ALL">{t('allCats')}</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{t(`cat_${c}` as Key)}</option>)}
            </select>
            <select className="select" style={{ width: 'auto' }} aria-label={t('colSeverity')} value={severity} onChange={(e) => setSeverity(e.target.value as Severity | 'ALL')}>
              <option value="ALL">{t('allSev')}</option>
              {(['high', 'medium', 'low'] as Severity[]).map((s) => <option key={s} value={s}>{t(`sev_${s}` as Key)}</option>)}
            </select>
          </div>
        </CardBody>
        <CardBody flush>
          <div data-tour="incidents-table">
            <DataTable<HazardReport> columns={cols} rows={rows} rowKey={(r) => r.id} onRowClick={(r) => drawer.open('report', r.id)} selectedKey={openId} empty={empty} />
          </div>
        </CardBody>
      </Card>

      <ReportDrawer reportId={openId} onClose={closeDrawer} />
    </div>
  );
}
