/**
 * RoiPage — /app/division/roi (spec §3.23).
 * Rupee impact of the weekly plan vs the simulated baseline, computed by
 * computeRoiModel (engine/roi.js) from plan quantities × editable unit
 * assumptions. The only deck figures on this page sit in the grey reference
 * note with a SourceLabel; nothing here is typed in.
 */
import { useMemo, useState } from 'react';
import { Download, Printer, RotateCcw } from 'lucide-react';
import { useAppStore, type RoiAssumptions } from '../../store/useAppStore';
import { DEFAULT_ROI_ASSUMPTIONS } from '../../engine/roi.js';
import type { Kpis } from '../../engine/types';
import { can } from '../../auth/portals';
import { useT } from '../../i18n';
import { common } from '../../i18n/common';
import { download, num, rupees } from '../../lib/format';
import { Callout, Card, CardBody, CardHead, DataTable, PageHeader, PlanPending, StatTile, type Column } from '../../components/ui';
import { SeedStamp, SimLabel, Slider, SourceLabel } from '../../components/ui/extras';
import { roiSummary, scaleAssumptions, type RoiLine, type RoiLineKey } from './roiSummary';

/** The worker is never sent a seed by the store, so the engine default applies (engine/worker.ts). */
const ENGINE_SEED = 26027;
const DEFAULTS = DEFAULT_ROI_ASSUMPTIONS as RoiAssumptions;

/** Stat tile row: kit .grid with a one-off column template. */
const TILES = { gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' } as const;

const strings = {
  en: {
    title: 'ROI audit',
    lede: 'Rupee value of the weekly plan against the simulated baseline, line by line, from unit assumptions you can edit.',
    honesty: '₹ figures come from editable assumptions, not accounts data. Quantities are the engine’s own plan and baseline outputs.',
    exportCsv: 'Export CSV',
    resetDefaults: 'Reset to defaults',
    resetDone: 'ROI assumptions reset to defaults',
    resetAudit: 'All ROI assumptions reset to defaults',
    tileWeekly: 'Saved this week',
    tileWeeklySub: 'Counted lines + carbon offset',
    tileYear: 'If every week matched',
    tileYearSub: 'Weekly total × 52',
    tileCo2: 'CO₂ avoided',
    tileCo2Sub: 'From TSR train-minutes avoided',
    linesTitle: 'Line items',
    linesSub: 'Plan vs baseline quantity, and the rupee difference at the current assumptions',
    colItem: 'Item',
    colBaseline: 'Baseline',
    colPlan: 'Plan',
    colDelta: 'Δ',
    colRupees: '₹ saved / week',
    colAssumption: 'Assumption used',
    itemDelay: 'Train delay',
    itemDelayUnit: 'train-minutes, priced by class',
    itemLine: 'Line availability',
    itemLineUnit: 'section-line h lost',
    itemDemurrage: 'Freight rake detention',
    itemDemurrageUnit: 'rake-hours regulated at yards',
    itemEnergy: 'Traction energy through TSRs',
    itemEnergyUnit: 'train-min under TSR',
    itemMobilisation: 'Machine and gang mobilisation',
    itemMobilisationUnit: 'possessions',
    itemCarbon: 'Carbon offset',
    itemCarbonUnit: 'kg CO₂ avoided',
    planCostsMore: 'Plan costs {amt} more on this line — netted in the total',
    notComputed: 'Not computed',
    demurrageNote: 'The plan or the baseline regulates no goods train, so roi.js falls back to a placeholder rake count. This line is left out of the total ({amt}).',
    demurrageHold: 'Rake-hours are the hold times of goods trains regulated by the delay model.',
    total: 'Total (counted lines)',
    editorTitle: 'Unit assumptions',
    editorSub: 'Edits are audited (old → new) and every figure on this page recomputes at once.',
    editorReadOnly: 'Read-only — editing needs the admin or authorise capability.',
    colKey: 'Assumption',
    colValue: 'Value',
    colDefault: 'Default',
    colSource: 'Source',
    aDelay: 'Delay cost per passenger train-minute',
    aDelayPremium: 'Delay cost per premium train-minute (VB, Rajdhani, Shatabdi)',
    aDelayGoods: 'Delay cost per goods train-minute under single-line working',
    aLine: 'Opportunity value of a section-line hour',
    aDemurrage: 'Freight detention per rake-hour',
    aEnergy: 'Extra traction energy per TSR train-minute',
    aMobilisation: 'Mobilisation and set-up per possession',
    aCo2: 'CO₂ per TSR train-minute',
    aCarbon: 'Carbon credit value per tonne',
    uPerMin: '₹ / min',
    uPerHour: '₹ / h',
    uPerRakeHour: '₹ / rake-h',
    uPerTrainMin: '₹ / train-min',
    uPerBlock: '₹ / possession',
    uKgPerMin: 'kg / train-min',
    uPerTonne: '₹ / t',
    changed: 'edited',
    invalid: 'Enter a number of 0 or more',
    updated: 'Assumption updated',
    updatedBody: '{label}: {old} → {new}',
    sensTitle: 'Sensitivity',
    sensSub: 'Scale every rupee unit value together. The plan quantities do not change.',
    sensLabel: 'Scale of ₹ unit values',
    sensTotal: 'Weekly total at ×{k}',
    sensRange: 'Range at ±20 %: {lo} to {hi}',
    deckTitle: 'Deck target / literature',
    deckSub: 'Reference figures from the SIH 2026 deck. Not computed here and not part of any total.',
    deckPlanning: '11–17 % lower maintenance planning cost',
    deckTotal: 'Up to 15 % reduction in total maintenance cost',
    exportedRows: '{n} rows written',
  },
  hi: {
    title: 'ROI ऑडिट',
    lede: 'सिम्युलेटेड आधार-रेखा की तुलना में साप्ताहिक योजना का रुपये में मूल्य, मद-वार, संपादन-योग्य इकाई मान्यताओं से।',
    honesty: '₹ आँकड़े संपादन-योग्य मान्यताओं से हैं, लेखा डेटा से नहीं। मात्राएँ इंजन की अपनी योजना और आधार-रेखा से हैं।',
    exportCsv: 'CSV निर्यात',
    resetDefaults: 'डिफ़ॉल्ट पर लौटाएँ',
    resetDone: 'ROI मान्यताएँ डिफ़ॉल्ट पर लौटाई गईं',
    resetAudit: 'सभी ROI मान्यताएँ डिफ़ॉल्ट पर लौटाई गईं',
    tileWeekly: 'इस सप्ताह बचत',
    tileWeeklySub: 'गिनी गई मदें + कार्बन ऑफ़सेट',
    tileYear: 'यदि हर सप्ताह ऐसा हो',
    tileYearSub: 'साप्ताहिक योग × 52',
    tileCo2: 'CO₂ में कमी',
    tileCo2Sub: 'बचाए गए TSR ट्रेन-मिनट से',
    linesTitle: 'मदें',
    linesSub: 'योजना बनाम आधार-रेखा मात्रा, और वर्तमान मान्यताओं पर रुपये का अंतर',
    colItem: 'मद',
    colBaseline: 'आधार-रेखा',
    colPlan: 'योजना',
    colDelta: 'Δ',
    colRupees: '₹ बचत / सप्ताह',
    colAssumption: 'प्रयुक्त मान्यता',
    itemDelay: 'ट्रेन विलंब',
    itemDelayUnit: 'ट्रेन-मिनट, श्रेणी अनुसार मूल्य',
    itemLine: 'लाइन उपलब्धता',
    itemLineUnit: 'section-line घंटे बंद',
    itemDemurrage: 'मालगाड़ी रेक रोक',
    itemDemurrageUnit: 'यार्ड में नियंत्रित रेक-घंटे',
    itemEnergy: 'TSR से कर्षण ऊर्जा',
    itemEnergyUnit: 'TSR के अंतर्गत ट्रेन-मिनट',
    itemMobilisation: 'मशीन व गैंग संचालन',
    itemMobilisationUnit: 'पज़ेशन',
    itemCarbon: 'कार्बन ऑफ़सेट',
    itemCarbonUnit: 'kg CO₂ बचत',
    planCostsMore: 'इस पंक्ति पर योजना {amt} अधिक महँगी — कुल में घटाई गई',
    notComputed: 'गणना नहीं',
    demurrageNote: 'योजना या आधार-रेखा में कोई मालगाड़ी नियंत्रित नहीं है, इसलिए roi.js एक प्लेसहोल्डर रेक संख्या लेता है। यह मद योग से बाहर है ({amt})।',
    demurrageHold: 'रेक-घंटे विलंब मॉडल द्वारा नियंत्रित मालगाड़ियों के रोक-समय हैं।',
    total: 'योग (गिनी गई मदें)',
    editorTitle: 'इकाई मान्यताएँ',
    editorSub: 'संपादन ऑडिट होते हैं (पुराना → नया) और इस पृष्ठ का हर आँकड़ा तुरंत दोबारा गणना होता है।',
    editorReadOnly: 'केवल पढ़ें — संपादन के लिए admin या authorise क्षमता चाहिए।',
    colKey: 'मान्यता',
    colValue: 'मान',
    colDefault: 'डिफ़ॉल्ट',
    colSource: 'स्रोत',
    aDelay: 'प्रति यात्री ट्रेन-मिनट विलंब लागत',
    aDelayPremium: 'प्रति प्रीमियम ट्रेन-मिनट विलंब लागत (VB, राजधानी, शताब्दी)',
    aDelayGoods: 'सिंगल-लाइन वर्किंग में प्रति मालगाड़ी-मिनट विलंब लागत',
    aLine: 'एक section-line घंटे का अवसर मूल्य',
    aDemurrage: 'प्रति रेक-घंटा मालगाड़ी रोक',
    aEnergy: 'प्रति TSR ट्रेन-मिनट अतिरिक्त कर्षण ऊर्जा',
    aMobilisation: 'प्रति पज़ेशन संचालन व सेट-अप',
    aCo2: 'प्रति TSR ट्रेन-मिनट CO₂',
    aCarbon: 'प्रति टन कार्बन क्रेडिट मूल्य',
    uPerMin: '₹ / मिनट',
    uPerHour: '₹ / घंटा',
    uPerRakeHour: '₹ / रेक-घंटा',
    uPerTrainMin: '₹ / ट्रेन-मिनट',
    uPerBlock: '₹ / पज़ेशन',
    uKgPerMin: 'kg / ट्रेन-मिनट',
    uPerTonne: '₹ / टन',
    changed: 'संपादित',
    invalid: '0 या अधिक संख्या दर्ज करें',
    updated: 'मान्यता अद्यतन',
    updatedBody: '{label}: {old} → {new}',
    sensTitle: 'संवेदनशीलता',
    sensSub: 'सभी रुपये इकाई मान एक साथ बदलें। योजना की मात्राएँ नहीं बदलतीं।',
    sensLabel: '₹ इकाई मानों का पैमाना',
    sensTotal: '×{k} पर साप्ताहिक योग',
    sensRange: '±20 % पर सीमा: {lo} से {hi}',
    deckTitle: 'डेक लक्ष्य / साहित्य',
    deckSub: 'SIH 2026 डेक से संदर्भ आँकड़े। यहाँ गणना नहीं होती और किसी योग में शामिल नहीं।',
    deckPlanning: 'अनुरक्षण योजना लागत में 11–17 % कमी',
    deckTotal: 'कुल अनुरक्षण लागत में 15 % तक कमी',
    exportedRows: '{n} पंक्तियाँ लिखी गईं',
  },
} as const;

type Key = keyof typeof strings.en;

interface AssumptionRow {
  key: keyof RoiAssumptions;
  label: Key;
  unit: Key;
  digits: number;
}

const ASSUMPTION_ROWS: AssumptionRow[] = [
  { key: 'delayPerMinuteVb', label: 'aDelayPremium', unit: 'uPerMin', digits: 0 },
  { key: 'delayPerMinuteMailExp', label: 'aDelay', unit: 'uPerMin', digits: 0 },
  { key: 'delayPerMinuteGoods', label: 'aDelayGoods', unit: 'uPerMin', digits: 0 },
  { key: 'lineHourOpportunity', label: 'aLine', unit: 'uPerHour', digits: 0 },
  { key: 'freightDemurragePerHour', label: 'aDemurrage', unit: 'uPerRakeHour', digits: 0 },
  { key: 'tsrEnergyPerTrainMin', label: 'aEnergy', unit: 'uPerTrainMin', digits: 0 },
  { key: 'machineSetupPerBlock', label: 'aMobilisation', unit: 'uPerBlock', digits: 0 },
  { key: 'co2KgPerTsrMin', label: 'aCo2', unit: 'uKgPerMin', digits: 2 },
  { key: 'carbonCreditPerTon', label: 'aCarbon', unit: 'uPerTonne', digits: 0 },
];

interface LineMeta {
  label: Key;
  unit: Key;
  assumption: keyof RoiAssumptions;
  assumptionUnit: Key;
  qty: (k: Kpis) => number;
  digits: number;
}

const LINE_META: Record<Exclude<RoiLineKey, 'other'>, LineMeta> = {
  delay: { label: 'itemDelay', unit: 'itemDelayUnit', assumption: 'delayPerMinuteMailExp', assumptionUnit: 'uPerMin', qty: (k) => k.weightedDelayMin, digits: 0 },
  line: { label: 'itemLine', unit: 'itemLineUnit', assumption: 'lineHourOpportunity', assumptionUnit: 'uPerHour', qty: (k) => k.sectionLineHoursLost, digits: 1 },
  demurrage: { label: 'itemDemurrage', unit: 'itemDemurrageUnit', assumption: 'freightDemurragePerHour', assumptionUnit: 'uPerRakeHour', qty: (k) => k.goodsRegulated, digits: 1 },
  energy: { label: 'itemEnergy', unit: 'itemEnergyUnit', assumption: 'tsrEnergyPerTrainMin', assumptionUnit: 'uPerTrainMin', qty: (k) => k.tsrTrainMinutes, digits: 0 },
  mobilisation: { label: 'itemMobilisation', unit: 'itemMobilisationUnit', assumption: 'machineSetupPerBlock', assumptionUnit: 'uPerBlock', qty: (k) => k.blockCount, digits: 0 },
};

interface TableRow {
  id: string;
  label: string;
  unit: string;
  baseline: string;
  plan: string;
  delta: string;
  rupeesText: string;
  rupeesMuted: boolean;
  note?: string;
  assumption: string;
  isTotal?: boolean;
}

const signedNum = (v: number, digits: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(v), digits)}`;

const fmtAssumption = (key: keyof RoiAssumptions, v: number) => num(v, ASSUMPTION_ROWS.find((r) => r.key === key)?.digits ?? 0);

export default function RoiPage() {
  const t = useT(strings);
  const tc = useT(common);

  const snapshot = useAppStore((s) => s.snapshot);
  const user = useAppStore((s) => s.user);
  const planVersion = useAppStore((s) => s.planVersion);
  const assumptions = useAppStore((s) => s.roiAssumptions);
  const setRoiAssumptions = useAppStore((s) => s.setRoiAssumptions);
  const resetRoiAssumptions = useAppStore((s) => s.resetRoiAssumptions);
  const addAudit = useAppStore((s) => s.addAudit);
  const toast = useAppStore((s) => s.toast);

  const [sensitivity, setSensitivity] = useState(1);
  const [drafts, setDrafts] = useState<Partial<Record<keyof RoiAssumptions, string>>>({});

  const canEdit = can(user, 'admin') || can(user, 'authorise');
  const weekly = snapshot?.result.weekly ?? null;
  const corridor = snapshot?.corridor ?? null;

  const summary = useMemo(() => (weekly && corridor ? roiSummary(weekly, corridor, assumptions) : null), [weekly, corridor, assumptions]);
  const scaled = useMemo(() => {
    if (!weekly || !corridor) return null;
    return {
      at: roiSummary(weekly, corridor, scaleAssumptions(assumptions, sensitivity)).totalRupees,
      lo: roiSummary(weekly, corridor, scaleAssumptions(assumptions, 0.8)).totalRupees,
      hi: roiSummary(weekly, corridor, scaleAssumptions(assumptions, 1.2)).totalRupees,
    };
  }, [weekly, corridor, assumptions, sensitivity]);

  const isDefault = useMemo(() => ASSUMPTION_ROWS.every((r) => assumptions[r.key] === DEFAULTS[r.key]), [assumptions]);

  const tableRows: TableRow[] = useMemo(() => {
    if (!summary || !weekly) return [];
    const base = weekly.baseKpis;
    const ai = weekly.kpis;
    const rows: TableRow[] = summary.lines.map((l: RoiLine, i) => {
      const meta = l.key === 'other' ? null : LINE_META[l.key];
      const bq = l.baselineQty ?? (meta ? meta.qty(base) : null);
      const pq = l.planQty ?? (meta ? meta.qty(ai) : null);
      const notes: string[] = [];
      if (!l.counted) notes.push(t('demurrageNote', { amt: rupees(l.savingsRupees) }));
      else if (l.key === 'demurrage') notes.push(t('demurrageHold'));
      if (l.planCostsMore) notes.push(t('planCostsMore', { amt: rupees(l.planRupees - l.baselineRupees) }));
      return {
        id: `${l.key}-${i}`,
        label: meta ? t(meta.label) : l.category,
        unit: meta ? t(meta.unit) : '',
        baseline: bq === null ? '—' : num(bq, meta!.digits),
        plan: pq === null ? '—' : num(pq, meta!.digits),
        delta: bq === null || pq === null ? '—' : signedNum(pq - bq, meta!.digits),
        rupeesText: l.counted ? rupees(l.savingsRupees) : t('notComputed'),
        rupeesMuted: !l.counted,
        note: notes.join(' '),
        assumption:
          l.key === 'delay'
            ? `${fmtAssumption('delayPerMinuteVb', assumptions.delayPerMinuteVb)} / ${fmtAssumption('delayPerMinuteMailExp', assumptions.delayPerMinuteMailExp)} / ${fmtAssumption('delayPerMinuteGoods', assumptions.delayPerMinuteGoods)} ${t('uPerMin')}`
            : meta
              ? `${fmtAssumption(meta.assumption, assumptions[meta.assumption])} ${t(meta.assumptionUnit)}`
              : '—',
      };
    });
    const baseCo2 = base.tsrTrainMinutes * assumptions.co2KgPerTsrMin;
    const planCo2 = ai.tsrTrainMinutes * assumptions.co2KgPerTsrMin;
    rows.push({
      id: 'carbon',
      label: t('itemCarbon'),
      unit: t('itemCarbonUnit'),
      baseline: num(baseCo2, 0),
      plan: num(planCo2, 0),
      delta: signedNum(planCo2 - baseCo2, 0),
      rupeesText: rupees(summary.carbonRupees),
      rupeesMuted: false,
      assumption: `${fmtAssumption('carbonCreditPerTon', assumptions.carbonCreditPerTon)} ${t('uPerTonne')}`,
    });
    rows.push({ id: 'total', label: t('total'), unit: '', baseline: '', plan: '', delta: '', rupeesText: rupees(summary.totalRupees), rupeesMuted: false, assumption: '', isTotal: true });
    return rows;
  }, [summary, weekly, assumptions, t]);

  if (!snapshot || !summary || !weekly || !scaled) return <PlanPending />;

  const commit = (row: AssumptionRow) => {
    const raw = drafts[row.key];
    if (raw === undefined) return;
    const v = Number(raw);
    setDrafts((d) => {
      const next = { ...d };
      delete next[row.key];
      return next;
    });
    if (raw.trim() === '' || !Number.isFinite(v) || v < 0) {
      toast({ title: t('invalid'), tone: 'warn' });
      return;
    }
    const old = assumptions[row.key];
    if (v === old) return;
    setRoiAssumptions({ [row.key]: v } as Partial<RoiAssumptions>);
    toast({ title: t('updated'), body: t('updatedBody', { label: t(row.label), old: fmtAssumption(row.key, old), new: fmtAssumption(row.key, v) }), tone: 'ok' });
  };

  const onReset = () => {
    resetRoiAssumptions();
    setDrafts({});
    setSensitivity(1);
    addAudit({ action: 'ROI_ASSUMPTIONS_RESET', entityType: 'settings', entityId: 'roi', detail: t('resetAudit') });
    toast({ title: t('resetDone'), tone: 'info' });
  };

  const onExport = () => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = [
      ['Item', 'Unit', 'Baseline', 'Plan', 'Delta', 'Rupees saved per week', 'Counted', 'Assumption used', 'Note'].join(','),
      ...tableRows.map((r) => [esc(r.label), esc(r.unit), esc(r.baseline), esc(r.plan), esc(r.delta), esc(r.rupeesText), r.rupeesMuted ? 'no' : 'yes', esc(r.assumption), esc(r.note ?? '')].join(',')),
      '',
      ['Assumption', 'Value', 'Default'].join(','),
      ...ASSUMPTION_ROWS.map((r) => [esc(t(r.label)), assumptions[r.key], DEFAULTS[r.key]].join(',')),
      '',
      `Seed,${ENGINE_SEED}`,
      `Run,${planVersion}`,
      `Corridor,${esc(snapshot.corridor.name)}`,
    ];
    download(`samanvay-roi-${snapshot.corridor.code.replace(/[^A-Za-z0-9]+/g, '-')}-${snapshot.planStart}.csv`, lines.join('\n'), 'text/csv;charset=utf-8');
    toast({ title: t('exportCsv'), body: t('exportedRows', { n: tableRows.length }), tone: 'ok' });
  };

  const lineColumns: Column<TableRow>[] = [
    {
      key: 'item',
      header: t('colItem'),
      render: (r) => (
        <div className="stack" style={{ gap: 2 }}>
          <span className={r.isTotal ? 'strong' : 'strong small'}>{r.label}</span>
          {r.unit && <span className="tiny muted">{r.unit}</span>}
          {r.note && <span className="tiny" style={{ color: 'var(--on-yellow)' }}>{r.note}</span>}
        </div>
      ),
    },
    { key: 'baseline', header: t('colBaseline'), num: true, render: (r) => <span className="muted">{r.baseline}</span> },
    { key: 'plan', header: t('colPlan'), num: true, render: (r) => r.plan },
    { key: 'delta', header: t('colDelta'), num: true, hideMobile: true, render: (r) => r.delta },
    { key: 'rupees', header: t('colRupees'), num: true, render: (r) => <span className={r.rupeesMuted ? 'muted' : 'strong'}>{r.rupeesText}</span> },
    { key: 'assumption', header: t('colAssumption'), hideMobile: true, render: (r) => <span className="small muted">{r.assumption}</span> },
  ];

  const assumptionColumns: Column<AssumptionRow>[] = [
    { key: 'label', header: t('colKey'), render: (r) => <span className="small strong">{t(r.label)}</span> },
    {
      key: 'value',
      header: t('colValue'),
      render: (r) =>
        canEdit ? (
          <div className="row" style={{ gap: 6 }}>
            <input
              className="input num"
              style={{ maxWidth: 130 }}
              type="number"
              min={0}
              step={r.digits ? 0.01 : 100}
              aria-label={t(r.label)}
              value={drafts[r.key] ?? String(assumptions[r.key])}
              onChange={(e) => setDrafts((d) => ({ ...d, [r.key]: e.target.value }))}
              onBlur={() => commit(r)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
            />
            <span className="tiny muted">{t(r.unit)}</span>
          </div>
        ) : (
          <span className="num">
            {fmtAssumption(r.key, assumptions[r.key])} <span className="tiny muted">{t(r.unit)}</span>
          </span>
        ),
    },
    {
      key: 'default',
      header: t('colDefault'),
      num: true,
      hideMobile: true,
      render: (r) => (
        <span className="muted">
          {fmtAssumption(r.key, DEFAULTS[r.key])}
          {assumptions[r.key] !== DEFAULTS[r.key] && <span className="badge badge-yellow" style={{ marginLeft: 6 }}>{t('changed')}</span>}
        </span>
      ),
    },
    { key: 'source', header: t('colSource'), render: () => <SimLabel kind="assumption" /> },
  ];

  return (
    <div className="stack-lg">
      <PageHeader
        title={t('title')}
        lede={`${t('lede')} ${snapshot.corridor.name}.`}
        badges={
          <>
            <SimLabel kind="assumption" />
            <SimLabel kind="baseline" />
            <SeedStamp seed={ENGINE_SEED} runId={planVersion} iterations={weekly.ai.search.iterations} ms={snapshot.timing.ms} />
          </>
        }
        actions={
          <>
            <button type="button" className="btn btn-sm" onClick={onExport}>
              <Download /> {t('exportCsv')}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => window.print()}>
              <Printer /> {tc('print')}
            </button>
            {canEdit && (
              <button type="button" className="btn btn-sm" onClick={onReset} disabled={isDefault}>
                <RotateCcw /> {t('resetDefaults')}
              </button>
            )}
          </>
        }
      />

      <Callout tone="neutral">{t('honesty')}</Callout>

      <div className="grid" style={TILES}>
        <StatTile label={t('tileWeekly')} value={rupees(summary.totalRupees)} sub={t('tileWeeklySub')} pastel="green" honesty="assumption" />
        <StatTile label={t('tileYear')} value={rupees(summary.totalRupees * 52)} sub={t('tileYearSub')} honesty="assumption" />
        <StatTile label={t('tileCo2')} value={num(summary.co2KgSaved / 1000, 2)} unit="t" sub={t('tileCo2Sub')} honesty="assumption" />
      </div>

      <Card>
        <CardHead title={t('linesTitle')} sub={t('linesSub')} right={<SimLabel kind="baseline" />} />
        <CardBody flush>
          <DataTable columns={lineColumns} rows={tableRows} rowKey={(r) => r.id} />
        </CardBody>
      </Card>

      <div className="grid grid-main-aside">
        <Card tour="roi-table">
          <CardHead title={t('editorTitle')} sub={canEdit ? t('editorSub') : t('editorReadOnly')} right={<SimLabel kind="assumption" />} />
          <CardBody flush>
            <DataTable columns={assumptionColumns} rows={ASSUMPTION_ROWS} rowKey={(r) => r.key} />
          </CardBody>
        </Card>

        <div className="stack-lg">
          <Card>
            <CardHead title={t('sensTitle')} sub={t('sensSub')} />
            <CardBody>
              <Slider label={t('sensLabel')} value={sensitivity} min={0.8} max={1.2} step={0.05} onChange={setSensitivity} format={(v) => `×${v.toFixed(2)}`} />
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="small muted">{t('sensTotal', { k: sensitivity.toFixed(2) })}</span>
                <span className="num strong">{rupees(scaled.at)}</span>
              </div>
              <div className="tiny muted mt">{t('sensRange', { lo: rupees(scaled.lo), hi: rupees(scaled.hi) })}</div>
            </CardBody>
          </Card>

          <Card pastel="gray">
            <CardHead title={t('deckTitle')} sub={t('deckSub')} />
            <CardBody>
              <ul className="stack" style={{ margin: 0, paddingLeft: 18 }}>
                <li className="small">
                  {t('deckPlanning')} <SourceLabel />
                </li>
                <li className="small">
                  {t('deckTotal')} <SourceLabel />
                </li>
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
