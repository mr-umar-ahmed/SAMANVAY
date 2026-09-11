/**
 * ExecutionLogPage — who was granted what and when, started, done, cleared at
 * what speed, and by how much a possession overran.
 *   /app/control/log        mode 'control'   — Control records clearance on behalf of the gang
 *   /app/planning/adherence mode 'adherence' — planning cell recalibrates work durations
 *
 * Rows are the app's execution records (seeded history plus anything recorded
 * on this device). The productivity table reads the duration factors the
 * engine learned on the last run (seeded execution history + device records).
 */
import { useMemo, useState } from 'react';
import { Download, ExternalLink, RefreshCw } from 'lucide-react';
import { useAppStore, type ExecRecord } from '../../store/useAppStore';
import { can } from '../../auth/portals';
import { WORK_TYPES } from '../../engine/constants.js';
import { adherence, workingBlocks, type WorkingBlock } from '../../engine/select';
import type { Dept } from '../../engine/types';
import { useT } from '../../i18n';
import { DEPT_LABEL, dateLabel, download, duration, hhmm, num, pct, timeAgo, toMin } from '../../lib/format';
import { Badge, Callout, Card, CardBody, CardHead, DataTable, DeptBadge, EmptyState, Field, Modal, PageHeader, PlanPending, Segmented, StatTile, Tabs, type Column } from '../../components/ui';
import { BarChart } from '../../components/viz';
import { SimLabel } from '../../components/ui/extras';
import { BlockDrawer } from '../../components/domain/BlockDrawer';
import { useDrawerParams } from '../../components/domain/useDrawerParams';

export interface ExecutionLogPageProps {
  mode?: 'control' | 'adherence';
}

const WT = WORK_TYPES as Record<string, { label: string; durationMin: number; dept: Dept }>;
const DEPTS: Dept[] = ['TMS', 'SMMS', 'TDMS'];

const strings = {
  en: {
    titleControl: 'Execution log',
    titleAdherence: 'Adherence and duration calibration',
    ledeControl: 'Possessions started, worked and cleared on this corridor, with the speed the line was handed back at.',
    ledeAdherence: 'Planned against actual possession time, and the duration factors the optimiser learns from execution history.',
    exportCsv: 'Export CSV',
    recalibrate: 'Recalibrate durations',
    recalibrating: 'Re-planning…',
    recalibrateHint: 'Re-runs the plan so that the latest execution records feed the duration factors',
    statOnTime: 'On-time start',
    statOnTimeSub: '{n} of {total} records started',
    statAdherence: 'Plan adherence',
    statAdherenceSub: 'Planned ÷ actual minutes, cleared possessions',
    statOverrun: 'Mean overrun',
    statOverrunSub: '{n} cleared possessions',
    statBurst: 'Overran the window',
    statBurstSub: 'Cleared later than planned',
    statTsr: 'Cleared with a TSR',
    statTsrSub: 'Handed back below MPS {mps} km/h',
    statActive: 'In progress',
    noData: '—',
    tabAll: 'All',
    tabActive: 'In progress',
    tabCleared: 'Cleared',
    tabOverrun: 'Overran',
    filterSource: 'Recorded from',
    sourceAll: 'All sources',
    sourceField: 'Field',
    sourceControl: 'Control',
    filterDept: 'Department',
    deptAll: 'All departments',
    filterDate: 'Date',
    dateAll: 'All dates',
    tableTitle: 'Possession records',
    tableSub: '{n} records match the filter',
    colBlock: 'Block',
    colPlanned: 'Planned',
    colGranted: 'Granted',
    colStarted: 'Started',
    colDone: 'Works done',
    colCleared: 'Cleared',
    colSpeed: 'Speed after',
    colOverrun: 'Overrun',
    colIncharge: 'In-charge',
    colSource: 'Source',
    fullSpeed: 'Full speed',
    tsrSpeed: 'TSR {v} km/h',
    inProgress: 'In progress',
    recordedBy: 'recorded by {by}',
    clear: 'Record clearance',
    openBlock: 'Open block',
    clearNeedsExecute: 'Recording clearance needs the execute capability',
    empty: 'No execution records match the filter.',
    emptyBody: 'Records appear when a gang starts a possession on site or Control records it from the board.',
    prodTitle: 'Productivity by work type',
    prodSub: 'Duration factors learned on the last plan run ({ago}) from {n} execution entries: seeded history plus the work items recorded on this device ({device} now).',
    prodChart: 'Planned against observed mean, in minutes — largest deviations',
    colWork: 'Work type',
    colBase: 'Planned',
    colObserved: 'Observed mean',
    colFactor: 'Factor',
    colSamples: 'Samples',
    colOverrunRate: 'Overran',
    seriesPlanned: 'Planned minutes',
    seriesObserved: 'Observed mean minutes',
    prodEmpty: 'No execution history on this run.',
    modalTitle: 'Record clearance for {id}',
    modalBody: 'Confirm that work has ceased, men and machines are clear, and record the speed the line is fit for.',
    fieldEnd: 'Line handed back at (hh:mm)',
    fieldFitness: 'Line fit for',
    fitFull: 'Full speed (MPS {mps} km/h)',
    fitTsr: 'Speed restriction',
    fieldKmph: 'TSR speed (km/h)',
    kmphInvalid: 'Enter a speed above 0 and below MPS {mps} km/h',
    fieldCause: 'Overrun or restriction reason',
    tsrWillImpose: 'A TSR will be put in force over {km} {line} and the caution orders regenerate.',
    tsrNoChainage: 'This record has no block in the current plan, so no chainage: the speed is recorded on the clearance only.',
    overrunBy: 'Clears {min} min after the planned end.',
    endInvalid: 'Enter a time as hh:mm',
    cancel: 'Cancel',
    save: 'Save clearance',
    toastCleared: 'Line clear recorded for {id}',
    toastTsr: 'TSR {v} km/h in force over {km}',
    toastRecal: 'Durations recalibrated from {n} records',
    toastRecalFail: 'Re-plan failed — durations not recalibrated',
    toastExport: '{n} records exported',
  },
  hi: {
    titleControl: 'निष्पादन लॉग',
    titleAdherence: 'अनुपालन और अवधि कैलिब्रेशन',
    ledeControl: 'इस कॉरिडोर पर शुरू, पूर्ण और क्लियर किए गए पज़ेशन, और लाइन जिस गति पर लौटाई गई।',
    ledeAdherence: 'नियोजित बनाम वास्तविक पज़ेशन समय, और निष्पादन इतिहास से ऑप्टिमाइज़र द्वारा सीखे गए अवधि गुणक।',
    exportCsv: 'CSV निर्यात',
    recalibrate: 'अवधि फिर कैलिब्रेट करें',
    recalibrating: 'पुनः योजना…',
    recalibrateHint: 'योजना फिर चलाता है ताकि नवीनतम निष्पादन रिकॉर्ड अवधि गुणकों में जाएँ',
    statOnTime: 'समय पर शुरुआत',
    statOnTimeSub: '{total} में से {n} रिकॉर्ड शुरू',
    statAdherence: 'योजना अनुपालन',
    statAdherenceSub: 'नियोजित ÷ वास्तविक मिनट, क्लियर पज़ेशन',
    statOverrun: 'औसत ओवररन',
    statOverrunSub: '{n} क्लियर पज़ेशन',
    statBurst: 'खिड़की से आगे गए',
    statBurstSub: 'नियोजित से देर से क्लियर',
    statTsr: 'TSR के साथ क्लियर',
    statTsrSub: 'MPS {mps} km/h से कम पर लौटाए',
    statActive: 'प्रगति पर',
    noData: '—',
    tabAll: 'सभी',
    tabActive: 'प्रगति पर',
    tabCleared: 'क्लियर',
    tabOverrun: 'ओवररन',
    filterSource: 'कहाँ से दर्ज',
    sourceAll: 'सभी स्रोत',
    sourceField: 'फ़ील्ड',
    sourceControl: 'नियंत्रण',
    filterDept: 'विभाग',
    deptAll: 'सभी विभाग',
    filterDate: 'तिथि',
    dateAll: 'सभी तिथियाँ',
    tableTitle: 'पज़ेशन रिकॉर्ड',
    tableSub: 'फ़िल्टर से {n} रिकॉर्ड मेल खाते हैं',
    colBlock: 'ब्लॉक',
    colPlanned: 'नियोजित',
    colGranted: 'प्रदान',
    colStarted: 'शुरू',
    colDone: 'पूर्ण कार्य',
    colCleared: 'क्लियर',
    colSpeed: 'बाद की गति',
    colOverrun: 'ओवररन',
    colIncharge: 'प्रभारी',
    colSource: 'स्रोत',
    fullSpeed: 'पूर्ण गति',
    tsrSpeed: 'TSR {v} km/h',
    inProgress: 'प्रगति पर',
    recordedBy: '{by} द्वारा दर्ज',
    clear: 'क्लियरेंस दर्ज करें',
    openBlock: 'ब्लॉक खोलें',
    clearNeedsExecute: 'क्लियरेंस दर्ज करने के लिए execute क्षमता चाहिए',
    empty: 'फ़िल्टर से कोई निष्पादन रिकॉर्ड मेल नहीं खाता।',
    emptyBody: 'रिकॉर्ड तब आते हैं जब गैंग साइट पर पज़ेशन शुरू करती है या नियंत्रण बोर्ड से दर्ज करता है।',
    prodTitle: 'कार्य प्रकार अनुसार उत्पादकता',
    prodSub: 'पिछले योजना रन ({ago}) पर {n} निष्पादन प्रविष्टियों से सीखे गए अवधि गुणक: सीडेड इतिहास और इस डिवाइस पर दर्ज कार्य (अभी {device})।',
    prodChart: 'नियोजित बनाम प्रेक्षित औसत, मिनट में — सबसे बड़े विचलन',
    colWork: 'कार्य प्रकार',
    colBase: 'नियोजित',
    colObserved: 'प्रेक्षित औसत',
    colFactor: 'गुणक',
    colSamples: 'नमूने',
    colOverrunRate: 'ओवररन',
    seriesPlanned: 'नियोजित मिनट',
    seriesObserved: 'प्रेक्षित औसत मिनट',
    prodEmpty: 'इस रन में कोई निष्पादन इतिहास नहीं।',
    modalTitle: '{id} का क्लियरेंस दर्ज करें',
    modalBody: 'पुष्टि करें कि कार्य बंद है, कर्मचारी और मशीनें हट गई हैं, और लाइन जिस गति के योग्य है वह दर्ज करें।',
    fieldEnd: 'लाइन लौटाई गई (hh:mm)',
    fieldFitness: 'लाइन योग्य है',
    fitFull: 'पूर्ण गति (MPS {mps} km/h)',
    fitTsr: 'गति प्रतिबंध',
    fieldKmph: 'TSR गति (km/h)',
    kmphInvalid: '0 से अधिक और MPS {mps} km/h से कम गति दर्ज करें',
    fieldCause: 'ओवररन या प्रतिबंध का कारण',
    tsrWillImpose: '{km} {line} पर TSR लागू होगा और सतर्कता आदेश फिर बनेंगे।',
    tsrNoChainage: 'इस रिकॉर्ड का वर्तमान योजना में कोई ब्लॉक नहीं, इसलिए चेनेज नहीं: गति केवल क्लियरेंस पर दर्ज होगी।',
    overrunBy: 'नियोजित समाप्ति से {min} मिनट बाद क्लियर।',
    endInvalid: 'समय hh:mm में दर्ज करें',
    cancel: 'रद्द करें',
    save: 'क्लियरेंस सहेजें',
    toastCleared: '{id} के लिए लाइन क्लियर दर्ज',
    toastTsr: '{km} पर TSR {v} km/h लागू',
    toastRecal: '{n} रिकॉर्ड से अवधि फिर कैलिब्रेट हुई',
    toastRecalFail: 'पुनः योजना विफल — अवधि कैलिब्रेट नहीं हुई',
    toastExport: '{n} रिकॉर्ड निर्यात',
  },
} as const;

type StateFilter = 'ALL' | 'IN_PROGRESS' | 'CLEARED' | 'OVERRUN';
type Fitness = 'full' | 'tsr';

interface FactorRow {
  wt: string;
  label: string;
  base: number | null;
  factor: number;
  meanRatio: number;
  samples: number;
  overrunRate: number;
}

const HHMM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const isCleared = (r: ExecRecord) => r.status === 'COMPLETED' || r.status === 'CLOSED';
const overrunOf = (r: ExecRecord) => (isCleared(r) && r.actualSpanMin !== undefined ? r.actualSpanMin - r.plannedSpanMin : null);
const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
const clockOf = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
const kmText = (b: WorkingBlock) => `km ${b.startKm.toFixed(1)}–${b.endKm.toFixed(1)}`;

export default function ExecutionLogPage({ mode = 'control' }: ExecutionLogPageProps) {
  const t = useT(strings);
  const drawer = useDrawerParams();

  const snapshot = useAppStore((s) => s.snapshot);
  const planStatus = useAppStore((s) => s.planStatus);
  const lastPlannedAt = useAppStore((s) => s.lastPlannedAt);
  const corridorId = useAppStore((s) => s.corridorId);
  const user = useAppStore((s) => s.user);
  const approvals = useAppStore((s) => s.approvals);
  const executionLog = useAppStore((s) => s.executionLog);
  const clearPossession = useAppStore((s) => s.clearPossession);
  const addTsr = useAppStore((s) => s.addTsr);
  const runPlan = useAppStore((s) => s.runPlan);
  const toast = useAppStore((s) => s.toast);

  const [stateFilter, setStateFilter] = useState<StateFilter>('ALL');
  const [source, setSource] = useState<'ALL' | 'field' | 'control'>('ALL');
  const [dept, setDept] = useState<'ALL' | Dept>('ALL');
  const [date, setDate] = useState<string>('ALL');

  const [clearFor, setClearFor] = useState<ExecRecord | null>(null);
  const [endText, setEndText] = useState('');
  const [fitness, setFitness] = useState<Fitness>('full');
  const [kmphText, setKmphText] = useState('');
  const [cause, setCause] = useState('');

  const blocks = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals]);
  const blockById = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks]);
  const records = useMemo(() => executionLog.filter((r) => r.corridorId === corridorId), [executionLog, corridorId]);
  const dates = useMemo(() => [...new Set(records.map((r) => r.date))].sort().reverse(), [records]);

  const filtered = useMemo(
    () =>
      records.filter((r) => {
        if (stateFilter === 'IN_PROGRESS' && r.status !== 'IN_PROGRESS') return false;
        if (stateFilter === 'CLEARED' && !isCleared(r)) return false;
        if (stateFilter === 'OVERRUN' && !((overrunOf(r) ?? 0) > 0)) return false;
        if (source !== 'ALL' && r.source !== source) return false;
        if (dept !== 'ALL' && !r.items.some((it) => it.dept === dept)) return false;
        if (date !== 'ALL' && r.date !== date) return false;
        return true;
      }),
    [records, stateFilter, source, dept, date]
  );

  const stats = useMemo(() => {
    const cleared = records.filter(isCleared);
    const started = records.filter((r) => r.actualStart !== undefined);
    const a = records.length ? adherence(records) : null;
    return {
      a,
      started: started.length,
      cleared,
      meanOverrun: cleared.length && a ? a.totalOverrunMin / cleared.length : null,
      burst: cleared.filter((r) => (overrunOf(r) ?? 0) > 0).length,
      active: records.filter((r) => r.status === 'IN_PROGRESS').length,
    };
  }, [records]);

  const factorRows: FactorRow[] = useMemo(() => {
    if (!snapshot) return [];
    return Object.entries(snapshot.factors)
      .map(([wt, f]) => ({ wt, label: WT[wt]?.label ?? wt, base: WT[wt]?.durationMin ?? null, factor: f.factor, meanRatio: f.meanRatio, samples: f.samples, overrunRate: f.overrunRate }))
      .sort((x, y) => Math.abs(y.factor - 1) - Math.abs(x.factor - 1));
  }, [snapshot]);

  const deviceItems = useMemo(() => executionLog.flatMap((r) => r.items).filter((it) => it.done && it.actualMin).length, [executionLog]);

  if (!snapshot) return <PlanPending />;

  const mps = snapshot.corridor.mpsKmph;
  const clearedWithTsr = stats.cleared.filter((r) => r.speedOnLifting !== undefined && r.speedOnLifting !== null && r.speedOnLifting < mps).length;
  const canExecute = can(user, 'execute');
  const canPlan = can(user, 'plan');
  const running = planStatus === 'running';

  /* ── actions ─────────────────────────────────────────────── */
  const openClear = (r: ExecRecord) => {
    setClearFor(r);
    setEndText(hhmm(r.plannedEnd));
    setFitness('full');
    setKmphText('');
    setCause('');
  };

  const endValid = HHMM_RE.test(endText.trim());
  const kmph = Number(kmphText);
  const kmphValid = fitness === 'full' || (kmphText.trim() !== '' && Number.isFinite(kmph) && kmph > 0 && kmph < mps);
  const clearBlock = clearFor ? blockById.get(clearFor.blockId) ?? null : null;
  const clearOverrun = clearFor && endValid ? toMin(endText.trim()) - clearFor.plannedEnd : 0;

  const saveClear = () => {
    if (!clearFor || !endValid || !kmphValid) return;
    const actualEnd = toMin(endText.trim());
    const speed = fitness === 'tsr' ? kmph : null;
    clearPossession(clearFor.blockId, { actualEnd, overrunCause: cause.trim() || undefined, speedOnLifting: speed, source: 'control' });
    toast({ title: t('toastCleared', { id: clearFor.blockId }), body: speed ? t('tsrSpeed', { v: speed }) : t('fitFull', { mps }), tone: 'ok' });
    if (speed && clearBlock) {
      addTsr({ corridorId, line: clearBlock.line, fromKm: clearBlock.startKm, toKm: clearBlock.endKm, kmph: speed, reason: `Speed after block ${clearBlock.id}${cause.trim() ? ` — ${cause.trim()}` : ''}`, status: 'IN_FORCE', blockId: clearBlock.id });
      toast({ title: t('toastTsr', { v: speed, km: kmText(clearBlock) }), tone: 'warn' });
    }
    setClearFor(null);
  };

  const recalibrate = async () => {
    await runPlan({ reason: 'recalibrate' });
    const s = useAppStore.getState();
    if (s.planStatus === 'error' || !s.snapshot) toast({ title: t('toastRecalFail'), body: s.planError ?? undefined, tone: 'crit' });
    else toast({ title: t('toastRecal', { n: s.snapshot.feeds.executionLog.length }), tone: 'ok' });
  };

  const exportCsv = () => {
    const head = ['Block', 'Date', 'Section', 'Line', 'Planned start', 'Planned end', 'Planned min', 'Granted at', 'Actual start', 'Actual end', 'Actual min', 'Overrun min', 'Works done', 'Speed after (km/h)', 'Overrun cause', 'In-charge', 'Recorded by', 'Source', 'Status'];
    const rows = filtered.map((r) => {
      const ap = approvals[r.blockId];
      const ov = overrunOf(r);
      return [
        r.blockId, r.date, r.sectionText, r.line, hhmm(r.plannedStart), hhmm(r.plannedEnd), r.plannedSpanMin, ap?.grantedAt ?? '',
        r.actualStart !== undefined ? hhmm(r.actualStart) : '', r.actualEnd !== undefined ? hhmm(r.actualEnd) : '', r.actualSpanMin ?? '', ov ?? '',
        `${r.items.filter((i) => i.done).length}/${r.items.length}`, r.speedOnLifting ?? '', r.overrunCause ?? '', ap?.incharge ?? '', r.by, r.source, r.status,
      ].map(csvCell).join(',');
    });
    download(`samanvay-execution-${snapshot.corridor.code}.csv`, [head.map(csvCell).join(','), ...rows].join('\n'), 'text/csv');
    toast({ title: t('toastExport', { n: filtered.length }), tone: 'ok' });
  };

  /* ── columns ─────────────────────────────────────────────── */
  const columns: Column<ExecRecord>[] = [
    {
      key: 'block',
      header: t('colBlock'),
      render: (r) => (
        <div>
          <div className="mono small strong">{r.blockId}</div>
          <div className="tiny muted">{r.sectionText} · {r.line} · {dateLabel(r.date)}</div>
          <div className="row-wrap" style={{ gap: 4, marginTop: 2 }}>
            {[...new Set(r.items.map((i) => i.dept))].map((d) => <DeptBadge key={d} dept={d} />)}
          </div>
        </div>
      ),
    },
    { key: 'planned', header: t('colPlanned'), render: (r) => (<div><span className="mono num">{hhmm(r.plannedStart)}–{hhmm(r.plannedEnd)}</span><div className="tiny muted">{duration(r.plannedSpanMin)}</div></div>) },
    { key: 'granted', header: t('colGranted'), hideMobile: true, render: (r) => { const g = approvals[r.blockId]?.grantedAt; return g ? <span className="mono num">{clockOf(g)}</span> : <span className="muted">—</span>; } },
    { key: 'started', header: t('colStarted'), render: (r) => (r.actualStart !== undefined ? <span className="mono num">{hhmm(r.actualStart)}</span> : <span className="muted">—</span>) },
    { key: 'done', header: t('colDone'), num: true, hideMobile: true, render: (r) => <span className="num">{r.items.filter((i) => i.done).length} / {r.items.length}</span> },
    { key: 'cleared', header: t('colCleared'), render: (r) => (r.actualEnd !== undefined ? <span className="mono num">{hhmm(r.actualEnd)}</span> : r.status === 'IN_PROGRESS' ? <Badge tone="warn">{t('inProgress')}</Badge> : <span className="muted">—</span>) },
    {
      key: 'speed',
      header: t('colSpeed'),
      render: (r) => {
        if (!isCleared(r)) return <span className="muted">—</span>;
        const v = r.speedOnLifting;
        return v === undefined || v === null || v >= mps ? <Badge tone="ok">{t('fullSpeed')}</Badge> : <Badge tone="warn">{t('tsrSpeed', { v })}</Badge>;
      },
    },
    {
      key: 'overrun',
      header: t('colOverrun'),
      num: true,
      render: (r) => {
        const ov = overrunOf(r);
        if (ov === null) return <span className="muted">—</span>;
        return (
          <div>
            <Badge tone={ov > 0 ? 'crit' : 'ok'}>{ov > 0 ? '+' : ov < 0 ? '−' : ''}{duration(Math.abs(ov))}</Badge>
            {r.overrunCause && <div className="tiny muted truncate" style={{ maxWidth: 180 }} title={r.overrunCause}>{r.overrunCause}</div>}
          </div>
        );
      },
    },
    {
      key: 'incharge',
      header: t('colIncharge'),
      hideMobile: true,
      render: (r) => (
        <div>
          <div className="small">{approvals[r.blockId]?.incharge ?? '—'}</div>
          <div className="tiny muted">{t('recordedBy', { by: r.by })}</div>
        </div>
      ),
    },
    { key: 'source', header: t('colSource'), render: (r) => <Badge tone={r.source === 'control' ? 'lavender' : 'gray'}>{r.source === 'control' ? t('sourceControl') : t('sourceField')}</Badge> },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <div className="row-wrap" style={{ justifyContent: 'flex-end' }}>
          {mode === 'control' && r.status === 'IN_PROGRESS' && (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => openClear(r)} disabled={!canExecute} title={canExecute ? undefined : t('clearNeedsExecute')}>
              {t('clear')}
            </button>
          )}
          {blockById.has(r.blockId) && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => drawer.open('block', r.blockId)} aria-label={t('openBlock')} title={t('openBlock')}>
              <ExternalLink />
            </button>
          )}
        </div>
      ),
    },
  ];

  const factorCols: Column<FactorRow>[] = [
    { key: 'label', header: t('colWork'), render: (f) => (<div><div className="small strong">{f.label}</div><div className="tiny muted mono">{f.wt}</div></div>) },
    { key: 'base', header: t('colBase'), num: true, render: (f) => <span className="num">{f.base !== null ? duration(f.base) : '—'}</span> },
    { key: 'observed', header: t('colObserved'), num: true, render: (f) => <span className="num">{f.base !== null ? duration(f.base * f.meanRatio) : '—'}</span> },
    { key: 'factor', header: t('colFactor'), num: true, render: (f) => <Badge tone={f.factor > 1 ? 'warn' : 'ok'}>{f.factor.toFixed(2)}×</Badge> },
    { key: 'samples', header: t('colSamples'), num: true, render: (f) => <span className="num">{f.samples}</span> },
    { key: 'overrunRate', header: t('colOverrunRate'), num: true, hideMobile: true, render: (f) => <span className="num">{pct(f.overrunRate, 0)}</span> },
  ];

  const chartRows = factorRows.filter((f) => f.base !== null).slice(0, 6);
  const shortLabel = (s: string) => (s.length > 16 ? `${s.slice(0, 15)}…` : s);

  return (
    <div className="stack-lg">
      <PageHeader
        title={mode === 'control' ? t('titleControl') : t('titleAdherence')}
        lede={mode === 'control' ? t('ledeControl') : t('ledeAdherence')}
        badges={<SimLabel kind="seededRecords" />}
        actions={
          <>
            <button type="button" className="btn btn-sm" onClick={exportCsv} disabled={!filtered.length}>
              <Download /> {t('exportCsv')}
            </button>
            {mode === 'adherence' && canPlan && (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => void recalibrate()} disabled={running} title={t('recalibrateHint')}>
                <RefreshCw className={running ? 'spin' : ''} /> {running ? t('recalibrating') : t('recalibrate')}
              </button>
            )}
          </>
        }
      />

      <div className="stat-grid">
        <StatTile label={t('statOnTime')} value={stats.a && stats.started ? pct(stats.a.onTimeStartRate, 0) : t('noData')} sub={t('statOnTimeSub', { n: stats.started, total: records.length })} />
        <StatTile label={t('statAdherence')} value={stats.a && stats.cleared.length ? pct(stats.a.adherenceRate, 0) : t('noData')} sub={t('statAdherenceSub')} />
        <StatTile label={t('statOverrun')} value={stats.meanOverrun !== null ? duration(stats.meanOverrun) : t('noData')} sub={t('statOverrunSub', { n: stats.cleared.length })} />
        <StatTile label={t('statBurst')} value={stats.burst} sub={t('statBurstSub')} />
        <StatTile label={t('statTsr')} value={clearedWithTsr} sub={t('statTsrSub', { mps })} />
        <StatTile label={t('statActive')} value={stats.active} />
      </div>

      <div className="row-between">
        <Tabs<StateFilter>
          tabs={[
            { id: 'ALL', label: t('tabAll'), count: records.length },
            { id: 'IN_PROGRESS', label: t('tabActive'), count: stats.active },
            { id: 'CLEARED', label: t('tabCleared'), count: stats.cleared.length },
            { id: 'OVERRUN', label: t('tabOverrun'), count: stats.burst },
          ]}
          value={stateFilter}
          onChange={setStateFilter}
        />
        <div className="row-wrap">
          <select className="select" value={source} onChange={(e) => setSource(e.target.value as typeof source)} aria-label={t('filterSource')}>
            <option value="ALL">{t('sourceAll')}</option>
            <option value="field">{t('sourceField')}</option>
            <option value="control">{t('sourceControl')}</option>
          </select>
          <select className="select" value={dept} onChange={(e) => setDept(e.target.value as typeof dept)} aria-label={t('filterDept')}>
            <option value="ALL">{t('deptAll')}</option>
            {DEPTS.map((d) => (
              <option key={d} value={d}>{DEPT_LABEL[d].short} ({DEPT_LABEL[d].system})</option>
            ))}
          </select>
          <select className="select" value={date} onChange={(e) => setDate(e.target.value)} aria-label={t('filterDate')}>
            <option value="ALL">{t('dateAll')}</option>
            {dates.map((d) => (
              <option key={d} value={d}>{dateLabel(d)}</option>
            ))}
          </select>
        </div>
      </div>

      <div data-tour="execution-table">
        <Card>
          <CardHead title={t('tableTitle')} sub={t('tableSub', { n: filtered.length })} />
          <CardBody flush>
            <DataTable columns={columns} rows={filtered} rowKey={(r) => r.blockId} empty={<EmptyState title={t('empty')} body={t('emptyBody')} />} />
          </CardBody>
        </Card>
      </div>

      {mode === 'adherence' && (
        <Card>
          <CardHead title={t('prodTitle')} sub={t('prodSub', { ago: lastPlannedAt ? timeAgo(lastPlannedAt) : '—', n: snapshot.feeds.executionLog.length, device: deviceItems })} right={<SimLabel kind="seededRecords" />} />
          {factorRows.length ? (
            <>
              <CardBody>
                <div className="section-title">{t('prodChart')}</div>
                <BarChart
                  categories={chartRows.map((f) => shortLabel(f.label))}
                  series={[
                    { name: t('seriesPlanned'), color: 'var(--series-1)', values: chartRows.map((f) => f.base ?? 0) },
                    { name: t('seriesObserved'), color: 'var(--series-2)', values: chartRows.map((f) => (f.base ?? 0) * f.meanRatio) },
                  ]}
                  height={200}
                  valueFormat={(v) => num(v, 0)}
                />
              </CardBody>
              <CardBody flush>
                <DataTable columns={factorCols} rows={factorRows} rowKey={(f) => f.wt} compact />
              </CardBody>
            </>
          ) : (
            <CardBody>
              <EmptyState title={t('prodEmpty')} />
            </CardBody>
          )}
        </Card>
      )}

      <Modal
        open={!!clearFor}
        onClose={() => setClearFor(null)}
        title={clearFor ? t('modalTitle', { id: clearFor.blockId }) : ''}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setClearFor(null)}>{t('cancel')}</button>
            <button type="button" className="btn btn-primary" onClick={saveClear} disabled={!endValid || !kmphValid}>{t('save')}</button>
          </>
        }
      >
        {clearFor && (
          <div className="stack">
            <div className="small muted">{t('modalBody')}</div>
            <div className="well small">
              <b className="mono">{clearFor.blockId}</b> · {clearFor.sectionText} {clearFor.line} · {hhmm(clearFor.plannedStart)}–{hhmm(clearFor.plannedEnd)}
            </div>
            <Field label={t('fieldEnd')} error={endValid ? undefined : t('endInvalid')} hint={endValid && clearOverrun > 0 ? t('overrunBy', { min: clearOverrun }) : undefined}>
              <input className="input mono" value={endText} onChange={(e) => setEndText(e.target.value)} inputMode="numeric" />
            </Field>
            <Field label={t('fieldFitness')}>
              <Segmented<Fitness> options={[{ value: 'full', label: t('fitFull', { mps }) }, { value: 'tsr', label: t('fitTsr') }]} value={fitness} onChange={setFitness} ariaLabel={t('fieldFitness')} />
            </Field>
            {fitness === 'tsr' && (
              <>
                <Field label={t('fieldKmph')} error={kmphText.trim() && !kmphValid ? t('kmphInvalid', { mps }) : undefined}>
                  <input className="input" type="number" min={1} max={mps - 1} value={kmphText} onChange={(e) => setKmphText(e.target.value)} />
                </Field>
                <Callout tone={clearBlock ? 'warn' : 'neutral'}>{clearBlock ? t('tsrWillImpose', { km: kmText(clearBlock), line: clearBlock.line }) : t('tsrNoChainage')}</Callout>
              </>
            )}
            {(fitness === 'tsr' || clearOverrun > 0) && (
              <Field label={t('fieldCause')}>
                <input className="input" value={cause} onChange={(e) => setCause(e.target.value)} />
              </Field>
            )}
          </div>
        )}
      </Modal>

      <BlockDrawer blockId={drawer.blockId} onClose={() => drawer.close('block')} />
    </div>
  );
}
