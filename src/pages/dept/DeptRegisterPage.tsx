/**
 * DeptRegisterPage — /app/:dept/register (spec §3.20).
 * The department's own register in its native columns (TMS: chainage, USFD,
 * TGI, GMT; SMMS: gear id, failures, MTBF; TDMS: elementary section, masts,
 * wire wear, insulators), with the normalised section / chainage, the ARCI
 * band from the engine and data-quality flags. Actions: raise a BDMS-style
 * requisition, record an inspection, mark attended after the possession is
 * cleared (closes the work and re-plans), reopen.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCheck, ClipboardCheck, FilePlus2, RotateCcw, Search, X } from 'lucide-react';
import { useAppStore, type AuditEntry, type BlockType } from '../../store/useAppStore';
import type { DataIssue, Dept, Line, Task, Urgency } from '../../engine/types';
import { WORK_TYPES, MACHINE_TYPES, CREW_TYPES } from '../../engine/constants.js';
import { validateDemand } from '../../engine/intake.js';
import { usePortal } from '../../app/usePortal';
import { can, type PortalId } from '../../auth/portals';
import { useLang, useT } from '../../i18n';
import { common } from '../../i18n/common';
import { DEPT_LABEL, dateLabel, duration, kmRange, num, timeAgo } from '../../lib/format';
import { ArciBar, Badge, Callout, Card, CardBody, CardHead, DataTable, EmptyState, Field, Modal, PageHeader, PlanPending, StatTile, UrgencyBadge, type Column } from '../../components/ui';
import { SeedStamp, SimLabel } from '../../components/ui/extras';
import { TaskDrawer } from '../../components/domain/TaskDrawer';
import { useDrawerParams } from '../../components/domain/useDrawerParams';

/** The worker is never sent a seed by the store, so the engine default applies (engine/worker.ts). */
const ENGINE_SEED = 26027;
const DEPT_OF_PORTAL: Partial<Record<PortalId, Dept>> = { tms: 'TMS', smms: 'SMMS', tdms: 'TDMS' };
const FEED_KEY: Record<Dept, 'tms' | 'smms' | 'tdms'> = { TMS: 'tms', SMMS: 'smms', TDMS: 'tdms' };
const ID_KEY: Record<Dept, string> = { TMS: 'tmsId', SMMS: 'smmsId', TDMS: 'tdmsId' };

type WorkSpec = { dept: Dept; label: string; blockKind: string; durationMin: number; setupMin: number; clearanceMin: number; machine: string | null; crew: string; tsrKmph: number | null };
const WT = WORK_TYPES as Record<string, WorkSpec>;
const MT = MACHINE_TYPES as Record<string, { label: string; dept: Dept }>;
const CT = CREW_TYPES as Record<string, { label: string; dept: Dept }>;
const BLOCK_TYPE_OF: Record<string, BlockType> = { TRAFFIC: 'TRAFFIC', POWER: 'POWER', TRAFFIC_POWER: 'INTEGRATED', DISCONNECTION: 'DISCONNECTION' };
const BANDS: Urgency[] = ['IMMEDIATE', 'HIGH', 'TACTICAL', 'STRATEGIC'];
const BAND_KEY: Record<Urgency, 'immediate' | 'high' | 'tactical' | 'strategic'> = { IMMEDIATE: 'immediate', HIGH: 'high', TACTICAL: 'tactical', STRATEGIC: 'strategic' };

/** Stat tile row: kit .grid with a one-off column template. */
const TILES = { gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' } as const;

const strings = {
  en: {
    titleTMS: 'Track register (TMS)',
    titleSMMS: 'Signal gear register (SMMS)',
    titleTDMS: 'OHE register (TDMS)',
    lede: 'Register seeded in native {system} schema, seed {seed}, mapped by the normaliser onto {corridor}. The band is the engine’s ARCI band.',
    search: 'Search id, asset, station, km or work',
    band: 'Band',
    allBands: 'All bands',
    overdue: 'Overdue',
    tsr: 'TSR in force',
    unmapped: 'Not mapped',
    clear: 'Clear filters',
    assetFilter: 'Showing {asset}',
    sRecords: 'Records',
    sRecordsSub: '{n} mapped to works',
    sOverdue: 'Overdue',
    sOverdueSub: 'Past their due date',
    sMandatory: 'Mandatory',
    sMandatorySub: 'At the statutory floor',
    sTsr: 'With a TSR',
    sTsrSub: 'Speed restriction in force',
    sIssues: 'Data-quality flags',
    sIssuesSub: '{n} records not mapped',
    colRecord: 'Record',
    colKm: 'Chainage · line',
    colAsset: 'Asset',
    colAttention: 'Attention',
    colGear: 'Gear',
    colFailures: 'Failures · MTBF',
    colCondition: 'Condition',
    colOhe: 'Elementary section',
    colStructure: 'Structure',
    colDue: 'Due',
    colTsr: 'TSR',
    colMapped: 'Normalised',
    colBand: 'Band · ARCI',
    colInspected: 'Last inspection',
    colActions: '',
    overdueBy: '{n} d overdue',
    dueIn: 'due in {n} d',
    dueToday: 'due today',
    tsrText: '{v} km/h · {d} d',
    kmphOnly: '{v} km/h',
    notMapped: 'Not mapped',
    closed: 'Closed (attended)',
    never: 'Not recorded',
    turnout: 'Turnout {no} · {st}',
    bridge: 'Bridge {no}',
    atStation: 'At {st}',
    usfd: 'USFD {cls}: {flaw}',
    tgi: 'TGI {v}',
    gmt: '{v} GMT',
    failures: '{n} in 90 d',
    mtbf: 'MTBF {v} h',
    backlash: 'Backlash {v} mm',
    insulation: 'Insulation {v} MΩ',
    resets: '{n} resets in 7 d',
    wire: 'Contact wire {v} mm',
    stagger: 'Stagger dev. {v} mm',
    height: 'Height dev. {v} mm',
    sparking: '{n} sparking events in 30 d',
    flashovers: '{n} flashovers in 90 d',
    contamination: 'Contamination {v}',
    corrosion: 'Corrosion {v}',
    oil: 'Oil BDV {bdv} kV · {temp} °C',
    mva: '{v} MVA',
    raise: 'Raise requisition',
    inspect: 'Record inspection',
    attended: 'Mark attended',
    reopen: 'Reopen',
    openWork: 'Open work',
    noIntake: 'Raising a requisition needs the intake capability',
    noStaff: 'Needs department staff (intake or execute)',
    attendHint: 'Enabled after the possession carrying this work is cleared',
    empty: 'No records match.',
    raiseTitle: 'Requisition from {id}',
    raiseHint: 'BDMS-style fields, prefilled from the register record. Nothing is sent to CRIS.',
    fWork: 'Work',
    fLine: 'Line',
    fFrom: 'From km',
    fTo: 'To km',
    fDuration: 'Work duration (min)',
    fDurationHint: 'Set-up {setup} min and clearance {clear} min are added: possession {total}.',
    fDate: 'Preferred date',
    fWindow: 'Preferred window',
    wNight: 'Night',
    wDay: 'Day',
    wAny: 'Any',
    fMachine: 'Machine',
    noMachine: 'None',
    fBlockType: 'Block type',
    btTRAFFIC: 'Traffic block',
    btPOWER: 'Power block',
    btDISCONNECTION: 'S&T disconnection',
    btINTEGRATED: 'Integrated (traffic + power)',
    fSpeedAfter: 'Speed after block (km/h)',
    fSpeedDays: 'For days',
    fCrew: 'Gang / unit',
    fIncharge: 'In-charge',
    fRemarks: 'Remarks',
    ceiling: 'Possession of {total} exceeds the JPO ceiling of {max}',
    saveDraft: 'Save draft',
    submit: 'Submit to planning cell',
    drafted: 'Requisition saved as draft',
    submitted: 'Requisition {no} submitted',
    submittedBody: 'For {id} — the planning cell has been notified',
    inspTitle: 'Inspection of {id}',
    inspHint: 'Recorded in the audit trail with your name. The seeded register is not changed, so the ARCI band moves only when the source record does.',
    fBy: 'Inspected by',
    fOn: 'Date',
    fFindings: 'Findings',
    fResult: 'Result',
    resFit: 'Fit for normal speed',
    resTsr: 'Fit with a speed restriction',
    resNotFit: 'Not fit — attention needed',
    fSpeed: 'Restriction (km/h)',
    inspSave: 'Record inspection',
    inspDone: 'Inspection recorded',
    inspDoneBody: '{id} · {result}',
    attTitle: 'Mark {id} attended',
    attBody: 'The possession {block} carrying this work was cleared {when}. Marking it attended closes the work and re-runs the plan without it.',
    attConfirm: 'Mark attended and re-plan',
    attDone: 'Marked attended — plan re-run',
    attDoneBody: '{id} closed',
    reopened: 'Work reopened — plan re-run',
  },
  hi: {
    titleTMS: 'ट्रैक रजिस्टर (TMS)',
    titleSMMS: 'सिग्नल उपकरण रजिस्टर (SMMS)',
    titleTDMS: 'OHE रजिस्टर (TDMS)',
    lede: 'मूल {system} स्कीमा में seeded रजिस्टर, seed {seed}, normaliser द्वारा {corridor} पर मैप। श्रेणी इंजन की ARCI श्रेणी है।',
    search: 'id, परिसंपत्ति, स्टेशन, km या कार्य खोजें',
    band: 'श्रेणी',
    allBands: 'सभी श्रेणियाँ',
    overdue: 'अतिदेय',
    tsr: 'TSR प्रभावी',
    unmapped: 'मैप नहीं',
    clear: 'फ़िल्टर हटाएँ',
    assetFilter: '{asset} दिखाया जा रहा है',
    sRecords: 'रिकॉर्ड',
    sRecordsSub: '{n} कार्यों से मैप',
    sOverdue: 'अतिदेय',
    sOverdueSub: 'देय तिथि पार',
    sMandatory: 'अनिवार्य',
    sMandatorySub: 'वैधानिक फ़्लोर पर',
    sTsr: 'TSR सहित',
    sTsrSub: 'गति प्रतिबंध प्रभावी',
    sIssues: 'डेटा-गुणवत्ता संकेत',
    sIssuesSub: '{n} रिकॉर्ड मैप नहीं',
    colRecord: 'रिकॉर्ड',
    colKm: 'Chainage · लाइन',
    colAsset: 'परिसंपत्ति',
    colAttention: 'ध्यान',
    colGear: 'उपकरण',
    colFailures: 'विफलताएँ · MTBF',
    colCondition: 'स्थिति',
    colOhe: 'Elementary section',
    colStructure: 'संरचना',
    colDue: 'देय',
    colTsr: 'TSR',
    colMapped: 'Normalised',
    colBand: 'श्रेणी · ARCI',
    colInspected: 'अंतिम निरीक्षण',
    colActions: '',
    overdueBy: '{n} दिन अतिदेय',
    dueIn: '{n} दिन में देय',
    dueToday: 'आज देय',
    tsrText: '{v} km/h · {d} दिन',
    kmphOnly: '{v} km/h',
    notMapped: 'मैप नहीं',
    closed: 'बंद (पूर्ण)',
    never: 'दर्ज नहीं',
    turnout: 'टर्नआउट {no} · {st}',
    bridge: 'पुल {no}',
    atStation: '{st} पर',
    usfd: 'USFD {cls}: {flaw}',
    tgi: 'TGI {v}',
    gmt: '{v} GMT',
    failures: '90 दिन में {n}',
    mtbf: 'MTBF {v} घंटे',
    backlash: 'Backlash {v} mm',
    insulation: 'Insulation {v} MΩ',
    resets: '7 दिन में {n} reset',
    wire: 'Contact wire {v} mm',
    stagger: 'Stagger विचलन {v} mm',
    height: 'ऊँचाई विचलन {v} mm',
    sparking: '30 दिन में {n} sparking',
    flashovers: '90 दिन में {n} flashover',
    contamination: 'प्रदूषण {v}',
    corrosion: 'जंग {v}',
    oil: 'Oil BDV {bdv} kV · {temp} °C',
    mva: '{v} MVA',
    raise: 'Requisition बनाएँ',
    inspect: 'निरीक्षण दर्ज करें',
    attended: 'पूर्ण चिह्नित करें',
    reopen: 'फिर खोलें',
    openWork: 'कार्य खोलें',
    noIntake: 'Requisition के लिए intake क्षमता चाहिए',
    noStaff: 'विभाग कर्मचारी चाहिए (intake या execute)',
    attendHint: 'इस कार्य वाले पज़ेशन के क्लियर होने के बाद सक्रिय',
    empty: 'कोई रिकॉर्ड मेल नहीं खाता।',
    raiseTitle: '{id} से requisition',
    raiseHint: 'BDMS जैसे फ़ील्ड, रजिस्टर रिकॉर्ड से पहले से भरे। CRIS को कुछ नहीं भेजा जाता।',
    fWork: 'कार्य',
    fLine: 'लाइन',
    fFrom: 'km से',
    fTo: 'km तक',
    fDuration: 'कार्य अवधि (मिनट)',
    fDurationHint: 'सेट-अप {setup} मिनट और क्लियरेंस {clear} मिनट जुड़ते हैं: पज़ेशन {total}।',
    fDate: 'पसंदीदा तिथि',
    fWindow: 'पसंदीदा समय',
    wNight: 'रात',
    wDay: 'दिन',
    wAny: 'कोई भी',
    fMachine: 'मशीन',
    noMachine: 'कोई नहीं',
    fBlockType: 'ब्लॉक प्रकार',
    btTRAFFIC: 'ट्रैफ़िक ब्लॉक',
    btPOWER: 'पावर ब्लॉक',
    btDISCONNECTION: 'S&T डिस्कनेक्शन',
    btINTEGRATED: 'एकीकृत (ट्रैफ़िक + पावर)',
    fSpeedAfter: 'ब्लॉक के बाद गति (km/h)',
    fSpeedDays: 'दिनों तक',
    fCrew: 'गैंग / इकाई',
    fIncharge: 'प्रभारी',
    fRemarks: 'टिप्पणी',
    ceiling: '{total} का पज़ेशन JPO सीमा {max} से अधिक',
    saveDraft: 'मसौदा सहेजें',
    submit: 'योजना प्रकोष्ठ को भेजें',
    drafted: 'Requisition मसौदे में सहेजी गई',
    submitted: 'Requisition {no} प्रस्तुत',
    submittedBody: '{id} के लिए — योजना प्रकोष्ठ को सूचना दी गई',
    inspTitle: '{id} का निरीक्षण',
    inspHint: 'आपके नाम के साथ ऑडिट ट्रेल में दर्ज। Seeded रजिस्टर नहीं बदलता, इसलिए ARCI श्रेणी स्रोत रिकॉर्ड बदलने पर ही बदलती है।',
    fBy: 'निरीक्षक',
    fOn: 'तिथि',
    fFindings: 'निष्कर्ष',
    fResult: 'परिणाम',
    resFit: 'सामान्य गति के लिए उपयुक्त',
    resTsr: 'गति प्रतिबंध के साथ उपयुक्त',
    resNotFit: 'उपयुक्त नहीं — ध्यान आवश्यक',
    fSpeed: 'प्रतिबंध (km/h)',
    inspSave: 'निरीक्षण दर्ज करें',
    inspDone: 'निरीक्षण दर्ज',
    inspDoneBody: '{id} · {result}',
    attTitle: '{id} पूर्ण चिह्नित करें',
    attBody: 'इस कार्य वाला पज़ेशन {block} {when} क्लियर हुआ। पूर्ण चिह्नित करने से कार्य बंद होता है और योजना इसके बिना दोबारा चलती है।',
    attConfirm: 'पूर्ण चिह्नित करें और पुनः योजना',
    attDone: 'पूर्ण चिह्नित — योजना दोबारा चली',
    attDoneBody: '{id} बंद',
    reopened: 'कार्य फिर खोला — योजना दोबारा चली',
  },
} as const;

type Key = keyof typeof strings.en;
type Rec = Record<string, unknown>;

const str = (r: Rec, k: string): string | undefined => (typeof r[k] === 'string' ? (r[k] as string) : undefined);
const nbr = (r: Rec, k: string): number | undefined => (typeof r[k] === 'number' ? (r[k] as number) : undefined);

interface Row {
  key: string;
  rec: Rec;
  workType: string;
  task: Task | null;
  expectedId: string;
  closed: boolean;
  issues: DataIssue[];
  daysOverdue: number;
  tsrKmph: number | null;
  inspection: AuditEntry | null;
  clearedIn: { blockId: string; at: string } | null;
}

interface RaiseForm {
  workType: string;
  line: Line;
  startKm: string;
  endKm: string;
  durationMin: string;
  preferredDate: string;
  preferredWindow: 'night' | 'day' | 'any';
  machine: string;
  blockType: BlockType;
  speedAfterKmph: string;
  speedAfterDays: string;
  crew: string;
  incharge: string;
  remarks: string;
}

interface InspForm {
  by: string;
  on: string;
  findings: string;
  result: 'fit' | 'tsr' | 'notFit';
  speed: string;
}

export default function DeptRegisterPage() {
  const t = useT(strings);
  const tc = useT(common);
  const lang = useLang();
  const portal = usePortal();
  const dept: Dept = DEPT_OF_PORTAL[portal] ?? 'TMS';
  const drawer = useDrawerParams();
  const [params, setParams] = useSearchParams();

  const snapshot = useAppStore((s) => s.snapshot);
  const user = useAppStore((s) => s.user);
  const planVersion = useAppStore((s) => s.planVersion);
  const planStatus = useAppStore((s) => s.planStatus);
  const excludedTaskIds = useAppStore((s) => s.excludedTaskIds);
  const executionLog = useAppStore((s) => s.executionLog);
  const audit = useAppStore((s) => s.audit);
  const excludeTask = useAppStore((s) => s.excludeTask);
  const includeTask = useAppStore((s) => s.includeTask);
  const runPlan = useAppStore((s) => s.runPlan);
  const saveRequisition = useAppStore((s) => s.saveRequisition);
  const submitRequisition = useAppStore((s) => s.submitRequisition);
  const addAudit = useAppStore((s) => s.addAudit);
  const toast = useAppStore((s) => s.toast);

  const [q, setQ] = useState('');
  const [band, setBand] = useState<Urgency | 'ALL'>('ALL');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [tsrOnly, setTsrOnly] = useState(false);
  const [unmappedOnly, setUnmappedOnly] = useState(false);
  const [raiseRow, setRaiseRow] = useState<Row | null>(null);
  const [raise, setRaise] = useState<RaiseForm | null>(null);
  const [inspRow, setInspRow] = useState<Row | null>(null);
  const [insp, setInsp] = useState<InspForm | null>(null);
  const [attRow, setAttRow] = useState<Row | null>(null);

  const assetParam = params.get('asset');
  const canIntake = can(user, 'intake');
  const canStaff = can(user, 'intake') || can(user, 'execute');
  const system = DEPT_LABEL[dept].system;

  const rows: Row[] = useMemo(() => {
    if (!snapshot) return [];
    const feeds = snapshot.feeds;
    const recs = (feeds[FEED_KEY[dept]] ?? []) as Rec[];
    // Task ids follow the normaliser's running counter over TMS → SMMS → TDMS records (engine/normalizer.js).
    const offset = dept === 'TMS' ? 0 : dept === 'SMMS' ? feeds.tms.length : feeds.tms.length + feeds.smms.length;
    const taskBySource = new Map(snapshot.tasks.filter((x) => x.source === dept).map((x) => [x.sourceId, x]));
    const issuesBySource = new Map<string, DataIssue[]>();
    for (const i of snapshot.issues) if (i.source === dept) issuesBySource.set(i.id, [...(issuesBySource.get(i.id) ?? []), i]);
    const inspections = new Map<string, AuditEntry>();
    for (const a of audit) if (a.action === 'INSPECTION_RECORDED' && !inspections.has(a.entityId)) inspections.set(a.entityId, a);
    const cleared = new Map<string, { blockId: string; at: string }>();
    for (const r of executionLog) {
      if (r.corridorId !== snapshot.corridor.id || (r.status !== 'COMPLETED' && r.status !== 'CLOSED')) continue;
      for (const it of r.items) if (it.done && !cleared.has(it.taskId)) cleared.set(it.taskId, { blockId: r.blockId, at: r.updatedAt });
    }
    const excluded = new Set(excludedTaskIds);
    return recs.map((rec, i) => {
      const sourceId = str(rec, ID_KEY[dept]) ?? `${dept}-${i + 1}`;
      const task = taskBySource.get(sourceId) ?? null;
      const expectedId = task?.id ?? `${dept}-${String(offset + i + 1).padStart(3, '0')}`;
      return {
        key: sourceId,
        rec,
        workType: str(rec, 'workType') ?? '',
        task,
        expectedId,
        closed: !task && excluded.has(expectedId),
        issues: issuesBySource.get(sourceId) ?? [],
        daysOverdue: nbr(rec, 'daysOverdue') ?? 0,
        tsrKmph: nbr(rec, 'tsrKmph') ?? null,
        inspection: inspections.get(sourceId) ?? null,
        clearedIn: cleared.get(expectedId) ?? null,
      };
    });
  }, [snapshot, dept, audit, executionLog, excludedTaskIds]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (assetParam && r.key !== assetParam && str(r.rec, 'gearId') !== assetParam) return false;
      if (band !== 'ALL' && r.task?.risk.urgency !== band) return false;
      if (overdueOnly && r.daysOverdue <= 0) return false;
      if (tsrOnly && !r.tsrKmph) return false;
      if (unmappedOnly && (r.task || r.closed)) return false;
      if (!needle) return true;
      const hay = [r.key, r.workType, WT[r.workType]?.label, str(r.rec, 'station'), str(r.rec, 'gearId'), str(r.rec, 'gearType'), str(r.rec, 'mastFrom'), str(r.rec, 'tssCode'), r.task?.sectionLabel, String(nbr(r.rec, 'fromKm') ?? nbr(r.rec, 'km') ?? '')];
      return hay.some((s) => s && s.toLowerCase().includes(needle));
    });
  }, [rows, q, band, overdueOnly, tsrOnly, unmappedOnly, assetParam]);

  if (!snapshot) return <PlanPending />;

  const corridor = snapshot.corridor;
  const mapped = rows.filter((r) => r.task).length;
  const unmappedCount = rows.filter((r) => !r.task && !r.closed).length;
  const issueCount = rows.reduce((s, r) => s + r.issues.length, 0);
  const filtersOn = q.trim() !== '' || band !== 'ALL' || overdueOnly || tsrOnly || unmappedOnly;

  /* ── helpers ─────────────────────────────────────────────── */
  const dueText = (d: number) => (d > 0 ? t('overdueBy', { n: d }) : d === 0 ? t('dueToday') : t('dueIn', { n: -d }));
  const kmOf = (r: Row) => {
    const a = nbr(r.rec, 'fromKm') ?? nbr(r.rec, 'km');
    const b = nbr(r.rec, 'toKm') ?? a;
    return a === undefined ? null : kmRange(a, b ?? a);
  };
  const clearAsset = () =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('asset');
        return next;
      },
      { replace: true }
    );

  const openRaise = (r: Row) => {
    const spec = WT[r.workType];
    const from = nbr(r.rec, 'fromKm') ?? nbr(r.rec, 'km') ?? 0;
    const to = nbr(r.rec, 'toKm') ?? from;
    const line = (str(r.rec, 'line') as Line | undefined) ?? 'DN';
    const summary = [str(r.rec, 'flawType'), str(r.rec, 'gearId'), str(r.rec, 'mastFrom') ? `${str(r.rec, 'mastFrom')} → ${str(r.rec, 'mastTo') ?? ''}` : undefined, str(r.rec, 'tssCode')].filter(Boolean).join(' · ');
    setRaiseRow(r);
    setRaise({
      workType: r.workType,
      line,
      startKm: String(from),
      endKm: String(to),
      durationMin: String(r.task?.durationMin ?? spec?.durationMin ?? ''),
      preferredDate: snapshot.planStart,
      preferredWindow: 'night',
      machine: r.task?.machine ?? spec?.machine ?? '',
      blockType: BLOCK_TYPE_OF[spec?.blockKind ?? 'TRAFFIC'] ?? 'TRAFFIC',
      speedAfterKmph: '',
      speedAfterDays: '',
      crew: r.task?.crew ?? spec?.crew ?? '',
      incharge: user?.name ?? '',
      remarks: `Register ${r.key}${summary ? ` — ${summary}` : ''}`,
    });
  };

  const raiseSpec = raise ? WT[raise.workType] : undefined;
  const raiseTotal = raise && raiseSpec ? raiseSpec.setupMin + (Number(raise.durationMin) || 0) + raiseSpec.clearanceMin : 0;
  const raiseErrors: string[] = (() => {
    if (!raise) return [];
    const v = validateDemand({ workType: raise.workType, startKm: raise.startKm, endKm: raise.endKm, line: raise.line, durationMin: raise.durationMin }, corridor, snapshot.factors, { lang }) as { valid: boolean; errors: string[] };
    const errs = [...v.errors];
    const maxMin = snapshot.result.rules.maxBlockMin;
    if (raiseSpec && raise.blockType !== 'DISCONNECTION' && raiseTotal > maxMin) errs.push(t('ceiling', { total: duration(raiseTotal), max: duration(maxMin) }));
    if (!(Number(raise.durationMin) > 0)) errs.push(`${t('fDuration')}: > 0`);
    return errs;
  })();

  const doRaise = (submitNow: boolean) => {
    if (!raise || !raiseRow || raiseErrors.length) return;
    const req = saveRequisition({
      corridorId: corridor.id,
      dept,
      workType: raise.workType,
      line: raise.line,
      startKm: Number(raise.startKm),
      endKm: Number(raise.endKm),
      durationMin: Number(raise.durationMin),
      preferredDate: raise.preferredDate || undefined,
      preferredWindow: raise.preferredWindow,
      machine: raise.machine || null,
      crew: raise.crew || null,
      blockType: raise.blockType,
      speedAfterKmph: raise.speedAfterKmph ? Number(raise.speedAfterKmph) : null,
      speedAfterDays: raise.speedAfterDays ? Number(raise.speedAfterDays) : undefined,
      gang: raise.crew ? CT[raise.crew]?.label ?? raise.crew : undefined,
      incharge: raise.incharge || undefined,
      assetIds: [raiseRow.key, str(raiseRow.rec, 'gearId')].filter(Boolean).join(', '),
      remarks: raise.remarks || undefined,
      tsrKmph: raiseRow.tsrKmph,
      daysOverdue: raiseRow.daysOverdue,
      status: 'DRAFT',
      validation: [],
    });
    if (submitNow) {
      submitRequisition(req.id);
      toast({ title: t('submitted', { no: req.no }), body: t('submittedBody', { id: raiseRow.key }), tone: 'ok' });
    } else {
      toast({ title: t('drafted'), body: req.no, tone: 'info' });
    }
    setRaise(null);
    setRaiseRow(null);
  };

  const openInspect = (r: Row) => {
    setInspRow(r);
    setInsp({ by: user?.name ?? '', on: new Date().toISOString().slice(0, 10), findings: '', result: 'fit', speed: '' });
  };

  const resultText = (f: InspForm) => (f.result === 'fit' ? t('resFit') : f.result === 'tsr' ? `${t('resTsr')} (${f.speed || '—'} km/h)` : t('resNotFit'));

  const doInspect = () => {
    if (!insp || !inspRow || !insp.findings.trim()) return;
    addAudit({ action: 'INSPECTION_RECORDED', entityType: 'task', entityId: inspRow.key, detail: `${resultText(insp)} · ${insp.findings.trim()} · by ${insp.by || user?.name || 'Unknown'} on ${insp.on}` });
    toast({ title: t('inspDone'), body: t('inspDoneBody', { id: inspRow.key, result: resultText(insp) }), tone: 'ok' });
    setInsp(null);
    setInspRow(null);
  };

  const doAttend = () => {
    if (!attRow?.task || !attRow.clearedIn) return;
    excludeTask(attRow.task.id, `Attended — cleared in ${attRow.clearedIn.blockId} (register ${attRow.key})`);
    void runPlan({ reason: `${attRow.task.id} attended and closed` });
    toast({ title: t('attDone'), body: t('attDoneBody', { id: attRow.key }), tone: 'ok' });
    setAttRow(null);
  };

  const doReopen = (r: Row) => {
    includeTask(r.expectedId);
    addAudit({ action: 'TASK_REOPENED', entityType: 'task', entityId: r.expectedId, detail: `Register ${r.key} reopened` });
    void runPlan({ reason: `${r.expectedId} reopened` });
    toast({ title: t('reopened'), body: r.key, tone: 'info' });
  };

  /* ── columns ─────────────────────────────────────────────── */
  const recordCol: Column<Row> = {
    key: 'record',
    header: t('colRecord'),
    render: (r) => (
      <span className="stack" style={{ gap: 1, minWidth: 150 }}>
        {r.task ? (
          <button type="button" className="btn btn-sm btn-ghost mono" style={{ alignSelf: 'flex-start', padding: '0 4px' }} onClick={() => drawer.open('task', r.task!.id)} title={t('openWork')}>
            {r.key}
          </button>
        ) : (
          <span className="mono small">{r.key}</span>
        )}
        <span className="tiny muted">{WT[r.workType]?.label ?? r.workType}</span>
      </span>
    ),
  };

  const nativeCols: Column<Row>[] =
    dept === 'TMS'
      ? [
          { key: 'km', header: t('colKm'), render: (r) => <span className="small num" style={{ whiteSpace: 'nowrap' }}>{kmOf(r) ?? '—'} · {str(r.rec, 'line') ?? '—'}</span> },
          {
            key: 'asset',
            header: t('colAsset'),
            hideMobile: true,
            render: (r) => {
              const st = str(r.rec, 'station');
              const tn = str(r.rec, 'turnoutNo');
              const br = str(r.rec, 'bridgeNo');
              return <span className="small">{tn && st ? t('turnout', { no: tn, st }) : br ? t('bridge', { no: br }) : st ? t('atStation', { st }) : '—'}</span>;
            },
          },
          {
            key: 'attention',
            header: t('colAttention'),
            render: (r) => {
              const cls = str(r.rec, 'usfdClass');
              const tgi = nbr(r.rec, 'tgi');
              const gmt = nbr(r.rec, 'gmt');
              return (
                <span className="stack" style={{ gap: 1 }}>
                  {cls && <span className="small strong">{t('usfd', { cls, flaw: str(r.rec, 'flawType') ?? '' })}</span>}
                  {tgi !== undefined && <span className="small">{t('tgi', { v: tgi })}</span>}
                  {gmt !== undefined && <span className="tiny muted">{t('gmt', { v: gmt })}</span>}
                  {str(r.rec, 'detectedBy') && <span className="tiny muted">{str(r.rec, 'detectedBy')}</span>}
                </span>
              );
            },
          },
        ]
      : dept === 'SMMS'
        ? [
            {
              key: 'gear',
              header: t('colGear'),
              render: (r) => (
                <span className="stack" style={{ gap: 1 }}>
                  <span className="mono small strong">{str(r.rec, 'gearId') ?? '—'}</span>
                  <span className="tiny muted">{str(r.rec, 'gearType') ?? ''}{str(r.rec, 'station') ? ` · ${str(r.rec, 'station')}` : ''} · {str(r.rec, 'line') ?? ''}</span>
                </span>
              ),
            },
            {
              key: 'failures',
              header: t('colFailures'),
              render: (r) => (
                <span className="stack" style={{ gap: 1 }}>
                  <span className="small num">{nbr(r.rec, 'failures90d') === undefined ? '—' : t('failures', { n: nbr(r.rec, 'failures90d')! })}</span>
                  {nbr(r.rec, 'mtbfHours') !== undefined && <span className="tiny muted num">{t('mtbf', { v: num(nbr(r.rec, 'mtbfHours')!) })}</span>}
                </span>
              ),
            },
            {
              key: 'condition',
              header: t('colCondition'),
              hideMobile: true,
              render: (r) => {
                const bl = nbr(r.rec, 'backlashMm');
                const ins = nbr(r.rec, 'insulationMohm');
                const rs = nbr(r.rec, 'resetCount7d');
                return (
                  <span className="stack" style={{ gap: 1 }}>
                    {bl !== undefined && <span className="tiny num">{t('backlash', { v: bl.toFixed(1) })}</span>}
                    {ins !== undefined && <span className="tiny num">{t('insulation', { v: ins.toFixed(1) })}</span>}
                    {rs !== undefined && <span className="tiny num">{t('resets', { n: rs })}</span>}
                    {bl === undefined && ins === undefined && rs === undefined && <span className="tiny muted">—</span>}
                  </span>
                );
              },
            },
            { key: 'km', header: t('colKm'), hideMobile: true, render: (r) => <span className="small num">{kmOf(r) ?? '—'}</span> },
          ]
        : [
            {
              key: 'ohe',
              header: t('colOhe'),
              render: (r) => {
                const labels = r.task ? r.task.oheSections.map((i) => corridor.oheSections[i]?.label).filter(Boolean) : [];
                return <span className="small">{labels.length ? labels.join(', ') : '—'}</span>;
              },
            },
            {
              key: 'structure',
              header: t('colStructure'),
              render: (r) => {
                const tss = str(r.rec, 'tssCode');
                const mf = str(r.rec, 'mastFrom');
                return (
                  <span className="stack" style={{ gap: 1 }}>
                    <span className="mono small">{tss ?? (mf ? `${mf} → ${str(r.rec, 'mastTo') ?? mf}` : '—')}</span>
                    <span className="tiny muted num">{kmOf(r) ?? ''} · {str(r.rec, 'line') ?? ''}</span>
                  </span>
                );
              },
            },
            {
              key: 'condition',
              header: t('colCondition'),
              render: (r) => {
                const parts: string[] = [];
                const w = nbr(r.rec, 'wireThicknessMm');
                if (w !== undefined) parts.push(t('wire', { v: w.toFixed(2) }));
                const sd = nbr(r.rec, 'staggerDevMm');
                if (sd !== undefined) parts.push(t('stagger', { v: sd }));
                const hd = nbr(r.rec, 'heightDevMm');
                if (hd !== undefined) parts.push(t('height', { v: hd }));
                const sp = nbr(r.rec, 'sparkingEvents30d');
                if (sp !== undefined) parts.push(t('sparking', { n: sp }));
                const it = str(r.rec, 'insulatorType');
                if (it) parts.push(it);
                const fo = nbr(r.rec, 'flashoverCount90d');
                if (fo !== undefined) parts.push(t('flashovers', { n: fo }));
                const cc = str(r.rec, 'contaminationClass');
                if (cc) parts.push(t('contamination', { v: cc }));
                const cg = str(r.rec, 'corrosionGrade');
                if (cg) parts.push(t('corrosion', { v: cg }));
                const ns = str(r.rec, 'nsType');
                if (ns) parts.push(ns);
                const mva = nbr(r.rec, 'transformerMva');
                if (mva !== undefined) parts.push(t('mva', { v: mva }));
                const bdv = nbr(r.rec, 'oilBdvKv');
                if (bdv !== undefined) parts.push(t('oil', { bdv, temp: nbr(r.rec, 'oilTempC') ?? '—' }));
                return (
                  <span className="stack" style={{ gap: 1 }}>
                    {parts.length ? parts.map((p) => <span key={p} className="tiny num">{p}</span>) : <span className="tiny muted">—</span>}
                  </span>
                );
              },
            },
          ];

  const commonCols: Column<Row>[] = [
    { key: 'due', header: t('colDue'), render: (r) => <span className="small" style={{ whiteSpace: 'nowrap', color: r.daysOverdue > 0 ? 'var(--crit)' : undefined }}>{dueText(r.daysOverdue)}</span> },
    {
      key: 'tsr',
      header: t('colTsr'),
      render: (r) => {
        if (!r.tsrKmph) return <span className="muted">—</span>;
        const since = nbr(r.rec, 'tsrSinceDays');
        return <Badge tone="warn">{since === undefined ? t('kmphOnly', { v: r.tsrKmph }) : t('tsrText', { v: r.tsrKmph, d: since })}</Badge>;
      },
    },
    {
      key: 'mapped',
      header: t('colMapped'),
      hideMobile: true,
      render: (r) =>
        r.task ? (
          <span className="stack" style={{ gap: 1 }}>
            <span className="small">{r.task.sectionLabel}</span>
            <span className="tiny muted num">{kmRange(r.task.startKm, r.task.endKm)} · {r.task.line}</span>
            {r.issues.map((i) => (
              <Badge key={i.issue} tone="yellow" title={i.issue}>
                {i.issue}
              </Badge>
            ))}
          </span>
        ) : r.closed ? (
          <Badge tone="ok">{t('closed')}</Badge>
        ) : (
          <span className="stack" style={{ gap: 2 }}>
            <Badge tone="crit">{t('notMapped')}</Badge>
            {r.issues.map((i) => (
              <span key={i.issue} className="tiny muted">{i.issue}</span>
            ))}
          </span>
        ),
    },
    {
      key: 'band',
      header: t('colBand'),
      render: (r) =>
        r.task ? (
          <span className="stack" style={{ gap: 3 }}>
            <UrgencyBadge urgency={r.task.risk.urgency} />
            <ArciBar value={r.task.risk.arci} mandatory={r.task.risk.mandatory} />
          </span>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      key: 'inspected',
      header: t('colInspected'),
      hideMobile: true,
      render: (r) =>
        r.inspection ? (
          <span className="stack" style={{ gap: 1 }} title={r.inspection.detail}>
            <span className="small">{timeAgo(r.inspection.at)}</span>
            <span className="tiny muted">{r.inspection.by}</span>
          </span>
        ) : (
          <span className="tiny muted">{t('never')}</span>
        ),
    },
    {
      key: 'actions',
      header: t('colActions'),
      render: (r) =>
        r.closed ? (
          <button type="button" className="btn btn-sm" onClick={() => doReopen(r)} disabled={!canStaff || planStatus === 'running'} title={canStaff ? undefined : t('noStaff')}>
            <RotateCcw /> {t('reopen')}
          </button>
        ) : (
          <span className="row" style={{ gap: 4 }}>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => openRaise(r)} disabled={!canIntake} title={canIntake ? t('raise') : t('noIntake')} aria-label={t('raise')}>
              <FilePlus2 />
            </button>
            <button type="button" className="btn btn-sm" onClick={() => openInspect(r)} disabled={!canStaff} title={canStaff ? t('inspect') : t('noStaff')} aria-label={t('inspect')}>
              <ClipboardCheck />
            </button>
            {r.task && (
              <button type="button" className="btn btn-sm btn-ok" onClick={() => setAttRow(r)} disabled={!canStaff || !r.clearedIn || planStatus === 'running'} title={!canStaff ? t('noStaff') : r.clearedIn ? t('attended') : t('attendHint')} aria-label={t('attended')}>
                <CheckCheck />
              </button>
            )}
          </span>
        ),
    },
  ];

  const columns = [recordCol, ...nativeCols, ...commonCols];

  return (
    <div className="stack-lg">
      <PageHeader
        title={t(`title${dept}` as Key)}
        lede={t('lede', { system, seed: ENGINE_SEED, corridor: corridor.name })}
        badges={
          <>
            <SimLabel kind="seededFeed" system={system} seed={ENGINE_SEED} />
            <SeedStamp seed={ENGINE_SEED} runId={planVersion} ms={snapshot.timing.ms} />
          </>
        }
      />

      <div className="grid" style={TILES}>
        <StatTile label={t('sRecords')} value={rows.length} sub={t('sRecordsSub', { n: mapped })} pastel="blue" />
        <StatTile label={t('sOverdue')} value={rows.filter((r) => r.daysOverdue > 0).length} sub={t('sOverdueSub')} />
        <StatTile label={t('sMandatory')} value={rows.filter((r) => r.task?.risk.mandatory).length} sub={t('sMandatorySub')} />
        <StatTile label={t('sTsr')} value={rows.filter((r) => r.tsrKmph).length} sub={t('sTsrSub')} />
        <StatTile label={t('sIssues')} value={issueCount} sub={t('sIssuesSub', { n: unmappedCount })} />
      </div>

      <Card>
        <CardHead title={t(`title${dept}` as Key)} sub={`${filtered.length} / ${rows.length}`} right={<SimLabel kind="seededFeed" system={system} seed={ENGINE_SEED} short />} />
        <CardBody>
          <div className="row-wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
            <div className="field grow" style={{ minWidth: 220 }}>
              <label htmlFor="reg-q" className="row" style={{ gap: 4 }}>
                <Search size={12} /> {tc('search')}
              </label>
              <input id="reg-q" className="input" value={q} placeholder={t('search')} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="reg-band">{t('band')}</label>
              <select id="reg-band" className="select" value={band} onChange={(e) => setBand(e.target.value as Urgency | 'ALL')}>
                <option value="ALL">{t('allBands')}</option>
                {BANDS.map((b) => (
                  <option key={b} value={b}>{tc(BAND_KEY[b])}</option>
                ))}
              </select>
            </div>
            <label className="check small">
              <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
              {t('overdue')}
            </label>
            <label className="check small">
              <input type="checkbox" checked={tsrOnly} onChange={(e) => setTsrOnly(e.target.checked)} />
              {t('tsr')}
            </label>
            <label className="check small">
              <input type="checkbox" checked={unmappedOnly} onChange={(e) => setUnmappedOnly(e.target.checked)} />
              {t('unmapped')}
            </label>
            {filtersOn && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setQ(''); setBand('ALL'); setOverdueOnly(false); setTsrOnly(false); setUnmappedOnly(false); }}>
                <X /> {t('clear')}
              </button>
            )}
          </div>
          {assetParam && (
            <div className="mt">
              <span className="badge badge-blue">
                {t('assetFilter', { asset: assetParam })}
                <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={clearAsset} aria-label={t('clear')} style={{ height: 18, width: 18 }}>
                  <X size={12} />
                </button>
              </span>
            </div>
          )}
        </CardBody>
        <CardBody flush>
          <div data-tour="register-table">
            <DataTable columns={columns} rows={filtered} rowKey={(r) => r.key} selectedKey={assetParam} empty={<EmptyState title={t('empty')} />} />
          </div>
        </CardBody>
      </Card>

      <TaskDrawer taskId={drawer.taskId} onClose={() => drawer.close('task')} />

      <Modal
        open={!!raise && !!raiseRow}
        onClose={() => { setRaise(null); setRaiseRow(null); }}
        title={raiseRow ? t('raiseTitle', { id: raiseRow.key }) : ''}
        width={720}
        footer={
          <>
            <button type="button" className="btn" onClick={() => { setRaise(null); setRaiseRow(null); }}>
              {tc('cancel')}
            </button>
            <button type="button" className="btn" onClick={() => doRaise(false)} disabled={raiseErrors.length > 0}>
              {t('saveDraft')}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => doRaise(true)} disabled={raiseErrors.length > 0}>
              <FilePlus2 /> {t('submit')}
            </button>
          </>
        }
      >
        {raise && (
          <div className="stack">
            <div className="small muted">{t('raiseHint')}</div>
            <div className="form-grid">
              <Field label={t('fWork')} htmlFor="rq-work">
                <select id="rq-work" className="select" value={raise.workType} onChange={(e) => setRaise({ ...raise, workType: e.target.value })}>
                  {Object.entries(WT).filter(([, w]) => w.dept === dept).map(([k, w]) => (
                    <option key={k} value={k}>{w.label}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('fLine')} htmlFor="rq-line">
                <select id="rq-line" className="select" value={raise.line} onChange={(e) => setRaise({ ...raise, line: e.target.value as Line })}>
                  <option value="UP">{tc('upLine')}</option>
                  <option value="DN">{tc('dnLine')}</option>
                  <option value="BOTH">{tc('bothLines')}</option>
                </select>
              </Field>
              <Field label={t('fFrom')} htmlFor="rq-from">
                <input id="rq-from" className="input num" type="number" step={0.1} min={0} max={corridor.lengthKm} value={raise.startKm} onChange={(e) => setRaise({ ...raise, startKm: e.target.value })} />
              </Field>
              <Field label={t('fTo')} htmlFor="rq-to">
                <input id="rq-to" className="input num" type="number" step={0.1} min={0} max={corridor.lengthKm} value={raise.endKm} onChange={(e) => setRaise({ ...raise, endKm: e.target.value })} />
              </Field>
              <Field label={t('fDuration')} htmlFor="rq-dur" hint={raiseSpec ? t('fDurationHint', { setup: raiseSpec.setupMin, clear: raiseSpec.clearanceMin, total: duration(raiseTotal) }) : undefined}>
                <input id="rq-dur" className="input num" type="number" min={1} step={5} value={raise.durationMin} onChange={(e) => setRaise({ ...raise, durationMin: e.target.value })} />
              </Field>
              <Field label={t('fBlockType')} htmlFor="rq-bt">
                <select id="rq-bt" className="select" value={raise.blockType} onChange={(e) => setRaise({ ...raise, blockType: e.target.value as BlockType })}>
                  {(['TRAFFIC', 'POWER', 'DISCONNECTION', 'INTEGRATED'] as BlockType[]).map((b) => (
                    <option key={b} value={b}>{t(`bt${b}` as Key)}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('fDate')} htmlFor="rq-date" hint={dateLabel(raise.preferredDate)}>
                <input id="rq-date" className="input" type="date" min={snapshot.planStart} value={raise.preferredDate} onChange={(e) => setRaise({ ...raise, preferredDate: e.target.value })} />
              </Field>
              <Field label={t('fWindow')} htmlFor="rq-win">
                <select id="rq-win" className="select" value={raise.preferredWindow} onChange={(e) => setRaise({ ...raise, preferredWindow: e.target.value as RaiseForm['preferredWindow'] })}>
                  <option value="night">{t('wNight')}</option>
                  <option value="day">{t('wDay')}</option>
                  <option value="any">{t('wAny')}</option>
                </select>
              </Field>
              <Field label={t('fMachine')} htmlFor="rq-machine">
                <select id="rq-machine" className="select" value={raise.machine} onChange={(e) => setRaise({ ...raise, machine: e.target.value })}>
                  <option value="">{t('noMachine')}</option>
                  {Object.entries(MT).map(([k, m]) => (
                    <option key={k} value={k}>{m.label}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('fCrew')} htmlFor="rq-crew">
                <select id="rq-crew" className="select" value={raise.crew} onChange={(e) => setRaise({ ...raise, crew: e.target.value })}>
                  {Object.entries(CT).filter(([, c]) => c.dept === dept).map(([k, c]) => (
                    <option key={k} value={k}>{c.label}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('fSpeedAfter')} htmlFor="rq-speed">
                <input id="rq-speed" className="input num" type="number" min={0} max={corridor.mpsKmph} step={5} value={raise.speedAfterKmph} onChange={(e) => setRaise({ ...raise, speedAfterKmph: e.target.value })} />
              </Field>
              <Field label={t('fSpeedDays')} htmlFor="rq-days">
                <input id="rq-days" className="input num" type="number" min={0} step={1} value={raise.speedAfterDays} onChange={(e) => setRaise({ ...raise, speedAfterDays: e.target.value })} />
              </Field>
              <Field label={t('fIncharge')} htmlFor="rq-ic">
                <input id="rq-ic" className="input" value={raise.incharge} onChange={(e) => setRaise({ ...raise, incharge: e.target.value })} />
              </Field>
            </div>
            <Field label={t('fRemarks')} htmlFor="rq-rem">
              <textarea id="rq-rem" className="textarea" rows={3} value={raise.remarks} onChange={(e) => setRaise({ ...raise, remarks: e.target.value })} />
            </Field>
            {raiseErrors.length > 0 && (
              <Callout tone="crit">
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {raiseErrors.map((e) => (
                    <li key={e} className="small">{e}</li>
                  ))}
                </ul>
              </Callout>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!insp && !!inspRow}
        onClose={() => { setInsp(null); setInspRow(null); }}
        title={inspRow ? t('inspTitle', { id: inspRow.key }) : ''}
        footer={
          <>
            <button type="button" className="btn" onClick={() => { setInsp(null); setInspRow(null); }}>
              {tc('cancel')}
            </button>
            <button type="button" className="btn btn-primary" onClick={doInspect} disabled={!insp?.findings.trim() || (insp?.result === 'tsr' && !insp.speed)}>
              <ClipboardCheck /> {t('inspSave')}
            </button>
          </>
        }
      >
        {insp && (
          <div className="stack">
            <div className="small muted">{t('inspHint')}</div>
            <div className="form-grid">
              <Field label={t('fBy')} htmlFor="in-by">
                <input id="in-by" className="input" value={insp.by} onChange={(e) => setInsp({ ...insp, by: e.target.value })} />
              </Field>
              <Field label={t('fOn')} htmlFor="in-on">
                <input id="in-on" className="input" type="date" value={insp.on} onChange={(e) => setInsp({ ...insp, on: e.target.value })} />
              </Field>
              <Field label={t('fResult')} htmlFor="in-res">
                <select id="in-res" className="select" value={insp.result} onChange={(e) => setInsp({ ...insp, result: e.target.value as InspForm['result'] })}>
                  <option value="fit">{t('resFit')}</option>
                  <option value="tsr">{t('resTsr')}</option>
                  <option value="notFit">{t('resNotFit')}</option>
                </select>
              </Field>
              {insp.result === 'tsr' && (
                <Field label={t('fSpeed')} htmlFor="in-speed">
                  <input id="in-speed" className="input num" type="number" min={0} max={corridor.mpsKmph} step={5} value={insp.speed} onChange={(e) => setInsp({ ...insp, speed: e.target.value })} />
                </Field>
              )}
            </div>
            <Field label={t('fFindings')} htmlFor="in-find">
              <textarea id="in-find" className="textarea" rows={4} value={insp.findings} onChange={(e) => setInsp({ ...insp, findings: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={!!attRow}
        onClose={() => setAttRow(null)}
        title={attRow ? t('attTitle', { id: attRow.key }) : ''}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setAttRow(null)}>
              {tc('cancel')}
            </button>
            <button type="button" className="btn btn-ok" onClick={doAttend} disabled={!attRow?.clearedIn}>
              <CheckCheck /> {t('attConfirm')}
            </button>
          </>
        }
      >
        {attRow?.clearedIn && <Callout tone="ok">{t('attBody', { block: attRow.clearedIn.blockId, when: timeAgo(attRow.clearedIn.at) })}</Callout>}
      </Modal>
    </div>
  );
}
