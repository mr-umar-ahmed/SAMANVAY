/**
 * IntegrationPage — the feeds SAMANVAY reads, what failed to normalise and the
 * corridor graph they land on (PS point 1). Planning cell: /app/planning/integration.
 * Division (read-only): /app/division/feeds.
 *
 * Every figure is counted from the worker snapshot. The feeds are seeded
 * native-schema data generated in the worker; there is no live link, so there
 * is no latency, uptime or "last sync" to show.
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, Braces, CheckCircle2, Download, FileJson, RefreshCw } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { can, type PortalId } from '../../auth/portals';
import type { DataIssue, Dept, Task } from '../../engine/types';
import { useT } from '../../i18n';
import { DEPT_LABEL, download, kmRange, num, timeAgo } from '../../lib/format';
import { Badge, Card, CardBody, CardFoot, CardHead, DataTable, DeptBadge, EmptyState, KeyValue, Meter, Modal, PageHeader, PlanPending, StatTile, Tabs, type Column } from '../../components/ui';
import { SeedStamp, SimLabel } from '../../components/ui/extras';
import { TaskDrawer } from '../../components/domain/TaskDrawer';
import { useDrawerParams } from '../../components/domain/useDrawerParams';

export interface IntegrationPageProps {
  readOnly?: boolean;
}

/** Seed the worker uses for every feed (src/engine/worker.ts default; the store never overrides it). */
const FEED_SEED = 26027;
const DEPTS: Dept[] = ['TMS', 'SMMS', 'TDMS'];

const strings = {
  en: {
    title: 'Feeds and data quality',
    lede: 'Native-schema registers and timetables for {corridor}, normalised onto one corridor graph before planning.',
    reseed: 'Reseed',
    reseeding: 'Reseeding…',
    reseedHint: 'Regenerates the seeded feeds and re-runs the plan',
    exportIssues: 'Export issues CSV',
    downloadGraph: 'Download graph JSON',
    readOnly: 'Read-only view for the division. Reseed and issue actions sit with the planning cell.',
    statRecords: 'Register records read',
    statRecordsSub: 'TMS {tms} · SMMS {smms} · TDMS {tdms}',
    statMapped: 'Mapped to the corridor graph',
    statMappedSub: '{n} rejected by the normaliser',
    statIssues: 'Data-quality issues',
    statIssuesSub: '{n} open',
    statPaths: 'Train paths read',
    statPathsSub: 'COA {coa} · FOIS {fois}',
    statRun: 'Last plan run',
    statRunSub: 'Finished {ago}',
    tabFeeds: 'Feeds',
    tabQuality: 'Data quality',
    tabGraph: 'Corridor graph',
    feedsTitle: 'Feeds read by the planning engine',
    feedsSub: 'Counts from the current plan run. Every feed is seeded synthetic data in the native schema of its system.',
    feedCoa: 'Working timetable (COA)',
    feedFois: 'Goods path forecast (FOIS)',
    feedTms: 'Track register (TMS)',
    feedSmms: 'Signalling register (SMMS)',
    feedTdms: 'OHE register (TDMS)',
    feedMachines: 'Track machines',
    feedCrews: 'Gangs and units',
    feedExec: 'Execution history',
    feedHistory: 'Failure and escalation history',
    schemaCoa: 'Train number, class, days of run, station arrival and departure times.',
    schemaFois: 'Rake number, commodity, tonnage, loco, planned departure by day.',
    schemaTms: 'Line code, km from–to, USFD class, TGI, GMT, TSR, days overdue.',
    schemaSmms: 'Station yard, gear id, failures in 90 days, MTBF, insulation.',
    schemaTdms: 'Mast from–to, elementary section, wire thickness, stagger, flashovers.',
    schemaMachines: 'Machine type, home station, health index, unavailability windows.',
    schemaCrews: 'Crew type, base station, reach, strength, rest day.',
    schemaExec: 'Work type, planned and actual minutes, overrun reason.',
    schemaHistory: 'Asset failure and censoring times; defect escalation outcomes.',
    unitPaths: 'paths',
    unitRecords: 'records',
    unitMachines: 'machines',
    unitCrews: 'crews',
    unitEntries: 'entries',
    mappedN: '{n} mapped',
    rejectedN: '{n} rejected',
    allMapped: 'All mapped',
    notNormalised: 'Read directly by the optimiser (no task mapping).',
    factPremium: 'Premium paths',
    factDays: 'Forecast days',
    factOverdue: 'Overdue records',
    factUnavailable: 'With unavailability',
    factStrength: 'Total strength',
    factWorkTypes: 'Work types covered',
    factFailures: 'Failure records',
    factEscalations: 'Escalation records',
    fields: 'Fields',
    sample: 'Sample record',
    sampleTitle: 'First record of {feed}',
    sampleNote: 'This is the first record exactly as the worker generated it (long lists shortened).',
    more: '… {n} more',
    close: 'Close',
    colFeed: 'Feed',
    colRecord: 'Record',
    colField: 'Field',
    colIssue: 'Issue',
    colFix: 'Suggested fix',
    colAssigned: 'Assigned to',
    colState: 'State',
    stateOpen: 'Open',
    stateAssigned: 'Assigned',
    stateResolved: 'Resolved',
    assignTo: 'Assign to {dept}',
    resolve: 'Mark resolved',
    openWork: 'Open work',
    showOnGraph: 'Show on graph',
    qualityTitle: 'Records the normaliser flagged',
    qualitySub: 'Assignments and resolutions are written to the audit trail.',
    qualityEmpty: 'All records normalised.',
    fieldWorkType: 'workType',
    fieldChainage: 'km / fromKm',
    fieldDue: 'daysOverdue',
    fieldLine: 'line',
    fieldOther: '—',
    fixWorkType: 'Map the work type to the SAMANVAY catalogue in the source register.',
    fixChainage: 'Correct the chainage in the source register.',
    fixDue: 'Verify the due date with the section SSE.',
    fixLine: 'Correct the line code (UP / DN / BOTH).',
    fixOther: 'Review the record in the source system.',
    graphTitle: 'Records and blocks per block section',
    graphSub: 'Select a block section to list the works mapped onto it.',
    graphStations: 'Stations',
    graphSections: 'Block sections',
    graphOhe: 'OHE elementary sections',
    graphCorridorBlocks: 'COA corridor blocks',
    graphPairs: 'Co-location pairs',
    colSection: 'Block section',
    colKm: 'Chainage',
    colOhe: 'OHE sections',
    colBlocks: 'Blocks this week',
    sectionWorks: 'Works on {section}',
    noWorks: 'No works are mapped onto this block section.',
    colWork: 'Work',
    colLine: 'Line',
    toastReseed: 'Feeds regenerated (seed {seed})',
    toastReseedBody: 'Same seed, same records — the plan was re-run on them.',
    toastAssigned: 'Issue {id} assigned to {dept}',
    toastResolved: 'Issue {id} marked resolved',
    toastExported: '{n} issues exported',
    toastGraph: 'Corridor graph downloaded',
  },
  hi: {
    title: 'फ़ीड और डेटा गुणवत्ता',
    lede: '{corridor} के मूल-स्कीमा रजिस्टर और समय-सारणी, योजना से पहले एक कॉरिडोर ग्राफ़ पर सामान्यीकृत।',
    reseed: 'Reseed',
    reseeding: 'Reseed हो रहा है…',
    reseedHint: 'सीडेड फ़ीड दोबारा बनाता है और योजना फिर चलाता है',
    exportIssues: 'समस्याएँ CSV में निर्यात करें',
    downloadGraph: 'ग्राफ़ JSON डाउनलोड करें',
    readOnly: 'मंडल के लिए केवल-पठन दृश्य। Reseed और समस्या कार्रवाई योजना प्रकोष्ठ के पास है।',
    statRecords: 'पढ़े गए रजिस्टर रिकॉर्ड',
    statRecordsSub: 'TMS {tms} · SMMS {smms} · TDMS {tdms}',
    statMapped: 'कॉरिडोर ग्राफ़ पर मैप',
    statMappedSub: 'नॉर्मलाइज़र ने {n} अस्वीकार किए',
    statIssues: 'डेटा-गुणवत्ता समस्याएँ',
    statIssuesSub: '{n} खुली',
    statPaths: 'पढ़े गए ट्रेन पाथ',
    statPathsSub: 'COA {coa} · FOIS {fois}',
    statRun: 'पिछला योजना रन',
    statRunSub: '{ago} पूरा हुआ',
    tabFeeds: 'फ़ीड',
    tabQuality: 'डेटा गुणवत्ता',
    tabGraph: 'कॉरिडोर ग्राफ़',
    feedsTitle: 'योजना इंजन द्वारा पढ़े गए फ़ीड',
    feedsSub: 'वर्तमान योजना रन से गिनती। हर फ़ीड अपनी प्रणाली के मूल स्कीमा में सीडेड सिंथेटिक डेटा है।',
    feedCoa: 'कार्यकारी समय-सारणी (COA)',
    feedFois: 'मालगाड़ी पाथ पूर्वानुमान (FOIS)',
    feedTms: 'ट्रैक रजिस्टर (TMS)',
    feedSmms: 'सिग्नलिंग रजिस्टर (SMMS)',
    feedTdms: 'OHE रजिस्टर (TDMS)',
    feedMachines: 'ट्रैक मशीनें',
    feedCrews: 'गैंग और यूनिट',
    feedExec: 'निष्पादन इतिहास',
    feedHistory: 'विफलता और एस्केलेशन इतिहास',
    schemaCoa: 'ट्रेन संख्या, श्रेणी, चलने के दिन, स्टेशन आगमन व प्रस्थान समय।',
    schemaFois: 'रेक संख्या, वस्तु, टन भार, लोको, दिनवार नियोजित प्रस्थान।',
    schemaTms: 'लाइन कोड, km से–तक, USFD श्रेणी, TGI, GMT, TSR, देय से अधिक दिन।',
    schemaSmms: 'स्टेशन यार्ड, गियर आईडी, 90 दिनों की विफलताएँ, MTBF, इन्सुलेशन।',
    schemaTdms: 'मास्ट से–तक, एलिमेंटरी सेक्शन, तार मोटाई, स्टैगर, फ़्लैशओवर।',
    schemaMachines: 'मशीन प्रकार, होम स्टेशन, हेल्थ इंडेक्स, अनुपलब्धता अवधि।',
    schemaCrews: 'क्रू प्रकार, बेस स्टेशन, पहुँच, संख्या, विश्राम दिन।',
    schemaExec: 'कार्य प्रकार, नियोजित व वास्तविक मिनट, ओवररन कारण।',
    schemaHistory: 'परिसंपत्ति विफलता व सेंसरिंग समय; दोष एस्केलेशन परिणाम।',
    unitPaths: 'पाथ',
    unitRecords: 'रिकॉर्ड',
    unitMachines: 'मशीनें',
    unitCrews: 'क्रू',
    unitEntries: 'प्रविष्टियाँ',
    mappedN: '{n} मैप',
    rejectedN: '{n} अस्वीकृत',
    allMapped: 'सभी मैप',
    notNormalised: 'ऑप्टिमाइज़र सीधे पढ़ता है (कार्य मैपिंग नहीं)।',
    factPremium: 'प्रीमियम पाथ',
    factDays: 'पूर्वानुमान दिन',
    factOverdue: 'देय से अधिक रिकॉर्ड',
    factUnavailable: 'अनुपलब्धता सहित',
    factStrength: 'कुल संख्या',
    factWorkTypes: 'शामिल कार्य प्रकार',
    factFailures: 'विफलता रिकॉर्ड',
    factEscalations: 'एस्केलेशन रिकॉर्ड',
    fields: 'फ़ील्ड',
    sample: 'नमूना रिकॉर्ड',
    sampleTitle: '{feed} का पहला रिकॉर्ड',
    sampleNote: 'यह पहला रिकॉर्ड है, ठीक वैसा जैसा वर्कर ने बनाया (लंबी सूचियाँ छोटी की गईं)।',
    more: '… {n} और',
    close: 'बंद करें',
    colFeed: 'फ़ीड',
    colRecord: 'रिकॉर्ड',
    colField: 'फ़ील्ड',
    colIssue: 'समस्या',
    colFix: 'सुझाया गया सुधार',
    colAssigned: 'सौंपा गया',
    colState: 'स्थिति',
    stateOpen: 'खुली',
    stateAssigned: 'सौंपी गई',
    stateResolved: 'सुलझी',
    assignTo: '{dept} को सौंपें',
    resolve: 'सुलझी चिह्नित करें',
    openWork: 'कार्य खोलें',
    showOnGraph: 'ग्राफ़ पर दिखाएँ',
    qualityTitle: 'नॉर्मलाइज़र द्वारा चिह्नित रिकॉर्ड',
    qualitySub: 'सौंपना और सुलझाना ऑडिट ट्रेल में दर्ज होता है।',
    qualityEmpty: 'सभी रिकॉर्ड सामान्यीकृत।',
    fieldWorkType: 'workType',
    fieldChainage: 'km / fromKm',
    fieldDue: 'daysOverdue',
    fieldLine: 'line',
    fieldOther: '—',
    fixWorkType: 'स्रोत रजिस्टर में कार्य प्रकार को SAMANVAY सूची से मिलाएँ।',
    fixChainage: 'स्रोत रजिस्टर में चेनेज सुधारें।',
    fixDue: 'सेक्शन SSE से देय तिथि सत्यापित करें।',
    fixLine: 'लाइन कोड सुधारें (UP / DN / BOTH)।',
    fixOther: 'स्रोत प्रणाली में रिकॉर्ड की समीक्षा करें।',
    graphTitle: 'प्रति ब्लॉक सेक्शन रिकॉर्ड और ब्लॉक',
    graphSub: 'किसी ब्लॉक सेक्शन को चुनें और उस पर मैप कार्य देखें।',
    graphStations: 'स्टेशन',
    graphSections: 'ब्लॉक सेक्शन',
    graphOhe: 'OHE एलिमेंटरी सेक्शन',
    graphCorridorBlocks: 'COA कॉरिडोर ब्लॉक',
    graphPairs: 'सह-स्थान जोड़े',
    colSection: 'ब्लॉक सेक्शन',
    colKm: 'चेनेज',
    colOhe: 'OHE सेक्शन',
    colBlocks: 'इस सप्ताह ब्लॉक',
    sectionWorks: '{section} पर कार्य',
    noWorks: 'इस ब्लॉक सेक्शन पर कोई कार्य मैप नहीं है।',
    colWork: 'कार्य',
    colLine: 'लाइन',
    toastReseed: 'फ़ीड फिर बने (seed {seed})',
    toastReseedBody: 'वही seed, वही रिकॉर्ड — योजना उन पर फिर चलाई गई।',
    toastAssigned: 'समस्या {id} {dept} को सौंपी गई',
    toastResolved: 'समस्या {id} सुलझी चिह्नित',
    toastExported: '{n} समस्याएँ निर्यात',
    toastGraph: 'कॉरिडोर ग्राफ़ डाउनलोड हुआ',
  },
} as const;

type Key = keyof typeof strings.en;
type TabId = 'feeds' | 'quality' | 'graph';
type IssueState = 'OPEN' | 'ASSIGNED' | 'RESOLVED';

interface FeedCard {
  id: string;
  system: string;
  name: Key;
  schema: Key;
  unit: Key;
  count: number;
  mapped: number | null;
  rejected: number | null;
  facts: { label: Key; value: number }[];
  sample: unknown;
}

interface IssueRow extends DataIssue {
  key: string;
  dept: Dept | null;
  field: Key;
  fix: Key;
  state: IssueState;
  assignedTo: string | null;
}

interface GraphRow {
  index: number;
  label: string;
  startKm: number;
  endKm: number;
  ohe: string[];
  counts: Record<Dept, number>;
  blocks: number;
}

const ISSUE_ASSIGNED = 'DATA_ISSUE_ASSIGNED';
const ISSUE_RESOLVED = 'DATA_ISSUE_RESOLVED';

function classify(issue: string): { field: Key; fix: Key } {
  if (issue.startsWith('Unknown work type')) return { field: 'fieldWorkType', fix: 'fixWorkType' };
  if (issue.startsWith('Chainage')) return { field: 'fieldChainage', fix: 'fixChainage' };
  if (issue.startsWith('TSR imposed')) return { field: 'fieldDue', fix: 'fixDue' };
  if (issue.startsWith('Line code')) return { field: 'fieldLine', fix: 'fixLine' };
  return { field: 'fieldOther', fix: 'fixOther' };
}

const asDept = (s: string): Dept | null => (DEPTS as string[]).includes(s) ? (s as Dept) : null;

/** Shorten long arrays so a generated record fits on screen; values are not changed. */
function preview(v: unknown, more: (n: number) => string, depth = 0): unknown {
  if (Array.isArray(v)) {
    const head = v.slice(0, 3).map((x) => preview(x, more, depth + 1));
    return v.length > 3 ? [...head, more(v.length - 3)] : head;
  }
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, depth > 2 ? '…' : preview(x, more, depth + 1)]));
  }
  return v;
}

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

export default function IntegrationPage({ readOnly = false }: IntegrationPageProps) {
  const t = useT(strings);
  const drawer = useDrawerParams();

  const snapshot = useAppStore((s) => s.snapshot);
  const planStatus = useAppStore((s) => s.planStatus);
  const lastPlannedAt = useAppStore((s) => s.lastPlannedAt);
  const planVersion = useAppStore((s) => s.planVersion);
  const user = useAppStore((s) => s.user);
  const audit = useAppStore((s) => s.audit);
  const runPlan = useAppStore((s) => s.runPlan);
  const addAudit = useAppStore((s) => s.addAudit);
  const notify = useAppStore((s) => s.notify);
  const toast = useAppStore((s) => s.toast);

  const [tab, setTab] = useState<TabId>('feeds');
  const [sample, setSample] = useState<FeedCard | null>(null);
  const [section, setSection] = useState<number | null>(null);

  const canAct = !readOnly && can(user, 'plan');

  const feeds: FeedCard[] = useMemo(() => {
    if (!snapshot) return [];
    const f = snapshot.feeds;
    const rejectedOf = (src: Dept) => snapshot.issues.filter((i) => i.source === src && !i.taskId).length;
    const overdue = (recs: Record<string, unknown>[]) => recs.filter((r) => typeof r.daysOverdue === 'number' && r.daysOverdue > 0).length;
    const register = (src: Dept, recs: Record<string, unknown>[], name: Key, schema: Key): FeedCard => {
      const rejected = rejectedOf(src);
      return { id: src, system: src, name, schema, unit: 'unitRecords', count: recs.length, mapped: recs.length - rejected, rejected, facts: [{ label: 'factOverdue', value: overdue(recs) }], sample: recs[0] ?? null };
    };
    const failures = Object.values(f.failureHistoryCounts).reduce((a, b) => a + b, 0);
    return [
      { id: 'COA', system: 'COA', name: 'feedCoa', schema: 'schemaCoa', unit: 'unitPaths', count: f.timetable.length, mapped: null, rejected: null, facts: [{ label: 'factPremium', value: f.timetable.filter((x) => x.premium).length }], sample: f.timetable[0] ?? null },
      { id: 'FOIS', system: 'FOIS', name: 'feedFois', schema: 'schemaFois', unit: 'unitPaths', count: f.freight.length, mapped: null, rejected: null, facts: [{ label: 'factDays', value: new Set(f.freight.map((x) => x.day)).size }], sample: f.freight[0] ?? null },
      register('TMS', f.tms, 'feedTms', 'schemaTms'),
      register('SMMS', f.smms, 'feedSmms', 'schemaSmms'),
      register('TDMS', f.tdms, 'feedTdms', 'schemaTdms'),
      { id: 'MACHINES', system: 'TMS / TDMS', name: 'feedMachines', schema: 'schemaMachines', unit: 'unitMachines', count: f.machines.length, mapped: null, rejected: null, facts: [{ label: 'factUnavailable', value: f.machines.filter((m) => m.unavailable.length > 0).length }], sample: f.machines[0] ?? null },
      { id: 'CREWS', system: 'TMS / SMMS / TDMS', name: 'feedCrews', schema: 'schemaCrews', unit: 'unitCrews', count: f.crews.length, mapped: null, rejected: null, facts: [{ label: 'factStrength', value: f.crews.reduce((a, c) => a + c.strength, 0) }], sample: f.crews[0] ?? null },
      { id: 'EXEC', system: 'block execution log', name: 'feedExec', schema: 'schemaExec', unit: 'unitEntries', count: f.executionLog.length, mapped: null, rejected: null, facts: [{ label: 'factWorkTypes', value: new Set(f.executionLog.map((x) => x.workType)).size }], sample: f.executionLog[0] ?? null },
      { id: 'HISTORY', system: 'failure / escalation register', name: 'feedHistory', schema: 'schemaHistory', unit: 'unitEntries', count: failures + f.escalationHistoryCount, mapped: null, rejected: null, facts: [{ label: 'factFailures', value: failures }, { label: 'factEscalations', value: f.escalationHistoryCount }], sample: null },
    ];
  }, [snapshot]);

  const issues: IssueRow[] = useMemo(() => {
    if (!snapshot) return [];
    // audit is newest first: the first hit per key is the current state
    const last = new Map<string, string>();
    const assigned = new Map<string, string>();
    for (const e of audit) {
      if (e.action !== ISSUE_ASSIGNED && e.action !== ISSUE_RESOLVED) continue;
      if (!last.has(e.entityId)) last.set(e.entityId, e.action);
      if (e.action === ISSUE_ASSIGNED && !assigned.has(e.entityId)) assigned.set(e.entityId, e.detail ?? '');
    }
    return snapshot.issues.map((i) => {
      const key = `${i.id} · ${i.issue}`;
      const a = last.get(key);
      return { ...i, key, dept: asDept(i.source), ...classify(i.issue), state: a === ISSUE_RESOLVED ? 'RESOLVED' : a === ISSUE_ASSIGNED ? 'ASSIGNED' : 'OPEN', assignedTo: assigned.get(key) ?? null };
    });
  }, [snapshot, audit]);

  const graph: GraphRow[] = useMemo(() => {
    if (!snapshot) return [];
    const c = snapshot.corridor;
    return c.blockSections.map((s) => {
      const counts: Record<Dept, number> = { TMS: 0, SMMS: 0, TDMS: 0 };
      for (const task of snapshot.tasks) if (task.sections.includes(s.index)) counts[task.dept]++;
      return {
        index: s.index,
        label: s.label,
        startKm: s.startKm,
        endKm: s.endKm,
        ohe: c.oheSections.filter((o) => Math.max(o.startKm, s.startKm) < Math.min(o.endKm, s.endKm)).map((o) => o.label),
        counts,
        blocks: snapshot.result.weekly.ai.blocks.filter((b) => b.sections.includes(s.index)).length,
      };
    });
  }, [snapshot]);

  const sectionTasks: Task[] = useMemo(() => (snapshot && section !== null ? snapshot.tasks.filter((x) => x.sections.includes(section)) : []), [snapshot, section]);

  if (!snapshot) return <PlanPending />;

  const c = snapshot.corridor;
  const counts = snapshot.counts;
  const openIssues = issues.filter((i) => i.state !== 'RESOLVED').length;
  const running = planStatus === 'running';

  /* ── actions ─────────────────────────────────────────────── */
  const reseed = async () => {
    await runPlan({ reason: 'reseed' });
    toast({ title: t('toastReseed', { seed: FEED_SEED }), body: t('toastReseedBody'), tone: 'ok' });
  };

  const assign = (i: IssueRow) => {
    if (!i.dept) return;
    addAudit({ action: ISSUE_ASSIGNED, entityType: 'plan', entityId: i.key, detail: i.dept });
    notify({ portals: [i.dept.toLowerCase() as PortalId], dept: i.dept, kind: 'ACTION', title: `Data-quality issue on ${i.id}`, body: i.issue, route: `/app/${i.dept.toLowerCase()}/register` });
    toast({ title: t('toastAssigned', { id: i.id, dept: DEPT_LABEL[i.dept].short }), tone: 'ok' });
  };

  const resolve = (i: IssueRow) => {
    addAudit({ action: ISSUE_RESOLVED, entityType: 'plan', entityId: i.key, detail: i.assignedTo ?? undefined });
    toast({ title: t('toastResolved', { id: i.id }), tone: 'ok' });
  };

  const exportIssues = () => {
    const head = [t('colFeed'), t('colRecord'), t('colField'), t('colIssue'), t('colFix'), t('colAssigned'), t('colState')];
    const rows = issues.map((i) => [i.source, i.id, t(i.field), i.issue, t(i.fix), i.assignedTo ?? '', i.state].map(csvCell).join(','));
    download(`samanvay-data-issues-${c.code}.csv`, [head.map(csvCell).join(','), ...rows].join('\n'), 'text/csv');
    toast({ title: t('toastExported', { n: issues.length }), tone: 'ok' });
  };

  const downloadGraph = () => {
    const payload = {
      corridor: { id: c.id, code: c.code, name: c.name, lengthKm: c.lengthKm, stations: c.stations, blockSections: c.blockSections, oheSections: c.oheSections, corridorBlocks: c.corridorBlocks },
      records: snapshot.tasks.map((x) => ({ id: x.id, sourceId: x.sourceId, source: x.source, dept: x.dept, line: x.line, startKm: x.startKm, endKm: x.endKm, sections: x.sections, oheSections: x.oheSections })),
      seed: FEED_SEED,
    };
    download(`samanvay-graph-${c.code}.json`, JSON.stringify(payload, null, 2), 'application/json');
    toast({ title: t('toastGraph'), tone: 'ok' });
  };

  const showOnGraph = (i: IssueRow) => {
    const task = i.taskId ? snapshot.tasks.find((x) => x.id === i.taskId) : undefined;
    setSection(task?.sections[0] ?? null);
    setTab('graph');
  };

  /* ── columns ─────────────────────────────────────────────── */
  const issueCols: Column<IssueRow>[] = [
    { key: 'source', header: t('colFeed'), render: (i) => (i.dept ? <DeptBadge dept={i.dept} /> : <Badge>{i.source}</Badge>) },
    { key: 'id', header: t('colRecord'), render: (i) => <span className="mono small">{i.id}</span> },
    { key: 'field', header: t('colField'), render: (i) => <span className="mono small">{t(i.field)}</span>, hideMobile: true },
    { key: 'issue', header: t('colIssue'), render: (i) => <span className="small">{i.issue}</span> },
    { key: 'fix', header: t('colFix'), render: (i) => <span className="small muted">{t(i.fix)}</span>, hideMobile: true },
    { key: 'assigned', header: t('colAssigned'), render: (i) => (i.assignedTo && asDept(i.assignedTo) ? <DeptBadge dept={asDept(i.assignedTo)!} /> : <span className="muted">—</span>) },
    {
      key: 'state',
      header: t('colState'),
      render: (i) => <Badge tone={i.state === 'RESOLVED' ? 'ok' : i.state === 'ASSIGNED' ? 'info' : 'warn'}>{t(i.state === 'RESOLVED' ? 'stateResolved' : i.state === 'ASSIGNED' ? 'stateAssigned' : 'stateOpen')}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      render: (i) => (
        <div className="row-wrap" style={{ justifyContent: 'flex-end' }}>
          {i.taskId && (
            <>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => drawer.open('task', i.taskId!)}>{t('openWork')}</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => showOnGraph(i)}>{t('showOnGraph')}</button>
            </>
          )}
          {canAct && i.state === 'OPEN' && i.dept && (
            <button type="button" className="btn btn-sm" onClick={() => assign(i)}>{t('assignTo', { dept: DEPT_LABEL[i.dept].short })}</button>
          )}
          {canAct && i.state !== 'RESOLVED' && (
            <button type="button" className="btn btn-sm" onClick={() => resolve(i)}>{t('resolve')}</button>
          )}
        </div>
      ),
    },
  ];

  const graphCols: Column<GraphRow>[] = [
    { key: 'label', header: t('colSection'), render: (r) => <span className="strong">{r.label}</span> },
    { key: 'km', header: t('colKm'), render: (r) => <span className="mono small">{kmRange(r.startKm, r.endKm)}</span> },
    { key: 'ohe', header: t('colOhe'), render: (r) => <span className="small" title={r.ohe.join(', ')}>{r.ohe.length}</span>, num: true, hideMobile: true },
    ...DEPTS.map((d): Column<GraphRow> => ({ key: d, header: DEPT_LABEL[d].short, num: true, render: (r) => <span className="num">{r.counts[d]}</span> })),
    { key: 'blocks', header: t('colBlocks'), num: true, render: (r) => <span className="num">{r.blocks}</span> },
  ];

  const workCols: Column<Task>[] = [
    { key: 'dept', header: '', render: (x) => <DeptBadge dept={x.dept} /> },
    { key: 'label', header: t('colWork'), render: (x) => (<div><div className="small strong">{x.label}</div><div className="tiny muted mono">{x.id} · {x.sourceId}</div></div>) },
    { key: 'line', header: t('colLine'), render: (x) => <span className="small">{x.line}</span> },
    { key: 'km', header: t('colKm'), render: (x) => <span className="mono small">{kmRange(x.startKm, x.endKm)}</span> },
  ];

  const selected = section !== null ? graph.find((g) => g.index === section) ?? null : null;

  return (
    <div className="stack-lg">
      <PageHeader
        title={t('title')}
        lede={t('lede', { corridor: c.name })}
        badges={<SeedStamp seed={FEED_SEED} runId={planVersion} ms={snapshot.timing.ms} />}
        actions={
          <>
            <button type="button" className="btn btn-sm" onClick={exportIssues} disabled={!issues.length}>
              <Download /> {t('exportIssues')}
            </button>
            <button type="button" className="btn btn-sm" onClick={downloadGraph}>
              <FileJson /> {t('downloadGraph')}
            </button>
            {canAct && (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => void reseed()} disabled={running} title={t('reseedHint')}>
                <RefreshCw className={running ? 'spin' : ''} /> {running ? t('reseeding') : t('reseed')}
              </button>
            )}
          </>
        }
      />

      {readOnly && <div className="small muted">{t('readOnly')}</div>}

      <div className="stat-grid">
        <StatTile label={t('statRecords')} value={num(counts.TMS + counts.SMMS + counts.TDMS)} sub={t('statRecordsSub', { tms: counts.TMS, smms: counts.SMMS, tdms: counts.TDMS })} />
        <StatTile label={t('statMapped')} value={num(counts.total)} sub={t('statMappedSub', { n: counts.rejected })} />
        <StatTile label={t('statIssues')} value={num(snapshot.issues.length)} sub={t('statIssuesSub', { n: openIssues })} />
        <StatTile label={t('statPaths')} value={num(snapshot.feeds.timetable.length + snapshot.feeds.freight.length)} sub={t('statPathsSub', { coa: snapshot.feeds.timetable.length, fois: snapshot.feeds.freight.length })} />
        <StatTile label={t('statRun')} value={(snapshot.timing.ms / 1000).toFixed(1)} unit="s" sub={lastPlannedAt ? t('statRunSub', { ago: timeAgo(lastPlannedAt) }) : undefined} />
      </div>

      <Tabs<TabId>
        tabs={[
          { id: 'feeds', label: t('tabFeeds'), count: feeds.length },
          { id: 'quality', label: t('tabQuality'), count: openIssues },
          { id: 'graph', label: t('tabGraph'), count: c.blockSections.length },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'feeds' && (
        <div className="stack">
          <div>
            <div className="strong">{t('feedsTitle')}</div>
            <div className="small muted">{t('feedsSub')}</div>
          </div>
          <div className="grid grid-auto" data-tour="integration-feeds">
            {feeds.map((f) => (
              <Card key={f.id}>
                <CardHead title={t(f.name)} sub={<span className="mono">{f.system}</span>} />
                <CardBody>
                  <div className="stack">
                    <div className="row" style={{ alignItems: 'baseline' }}>
                      <span className="h2 num">{num(f.count)}</span>
                      <span className="small muted">{t(f.unit)}</span>
                    </div>
                    <div className="small muted">{t(f.schema)}</div>
                    {f.mapped !== null && f.rejected !== null ? (
                      <div className="stack" style={{ gap: 4 }}>
                        <Meter value={f.count ? f.mapped / f.count : 0} tone={f.rejected ? 'warn' : 'ok'} />
                        <div className="row-between small">
                          <span className="num">{t('mappedN', { n: f.mapped })}</span>
                          {f.rejected ? (
                            <Badge tone="warn" icon={<AlertTriangle size={11} />}>{t('rejectedN', { n: f.rejected })}</Badge>
                          ) : (
                            <Badge tone="ok" icon={<CheckCircle2 size={11} />}>{t('allMapped')}</Badge>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="tiny muted">{t('notNormalised')}</div>
                    )}
                    <KeyValue items={f.facts.map((x) => [t(x.label), <span key={x.label} className="num">{num(x.value)}</span>])} />
                    {f.sample !== null && typeof f.sample === 'object' && (
                      <div className="tiny muted mono truncate" title={Object.keys(f.sample as object).join(', ')}>
                        {t('fields')}: {Object.keys(f.sample as object).slice(0, 6).join(', ')}
                      </div>
                    )}
                  </div>
                </CardBody>
                <CardFoot>
                  <div className="row-between" style={{ width: '100%' }}>
                    <SimLabel kind="seededFeed" system={f.system} seed={FEED_SEED} />
                    {f.sample !== null && (
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSample(f)}>
                        <Braces /> {t('sample')}
                      </button>
                    )}
                  </div>
                </CardFoot>
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === 'quality' && (
        <Card>
          <CardHead title={t('qualityTitle')} sub={t('qualitySub')} right={<SimLabel kind="seededFeed" system="TMS / SMMS / TDMS" seed={FEED_SEED} />} />
          <CardBody flush>
            <DataTable columns={issueCols} rows={issues} rowKey={(i) => i.key} empty={<EmptyState title={t('qualityEmpty')} icon={<CheckCircle2 />} />} />
          </CardBody>
        </Card>
      )}

      {tab === 'graph' && (
        <div className="grid grid-main-aside" style={{ alignItems: 'start' }}>
          <Card>
            <CardHead title={t('graphTitle')} sub={t('graphSub')} />
            <CardBody flush>
              <DataTable columns={graphCols} rows={graph} rowKey={(r) => String(r.index)} onRowClick={(r) => setSection(r.index)} selectedKey={section !== null ? String(section) : null} compact />
            </CardBody>
          </Card>
          <div className="stack">
            <Card>
              <CardBody>
                <KeyValue
                  items={[
                    [t('graphStations'), <span key="st" className="num">{c.stations.length}</span>],
                    [t('graphSections'), <span key="bs" className="num">{c.blockSections.length}</span>],
                    [t('graphOhe'), <span key="oh" className="num">{c.oheSections.length}</span>],
                    [t('graphCorridorBlocks'), <span key="cb" className="num">{c.corridorBlocks.length}</span>],
                    [t('graphPairs'), <span key="pr" className="num">{snapshot.pairs.length}</span>],
                  ]}
                />
              </CardBody>
            </Card>
            {selected && (
              <Card>
                <CardHead title={t('sectionWorks', { section: selected.label })} sub={<span className="mono">{kmRange(selected.startKm, selected.endKm)}</span>} />
                <CardBody flush>
                  <DataTable columns={workCols} rows={sectionTasks} rowKey={(x) => x.id} onRowClick={(x) => drawer.open('task', x.id)} empty={t('noWorks')} compact />
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      )}

      <Modal
        open={!!sample}
        onClose={() => setSample(null)}
        title={sample ? t('sampleTitle', { feed: t(sample.name) }) : ''}
        footer={
          <button type="button" className="btn" onClick={() => setSample(null)}>
            {t('close')}
          </button>
        }
      >
        {sample && (
          <div className="stack">
            <div className="row-between">
              <span className="small muted">{t('sampleNote')}</span>
              <SimLabel kind="seededFeed" system={sample.system} seed={FEED_SEED} />
            </div>
            <pre className="well mono tiny" style={{ maxHeight: 360, overflow: 'auto', margin: 0, whiteSpace: 'pre' }}>
              {JSON.stringify(preview(sample.sample, (n) => t('more', { n })), null, 2)}
            </pre>
          </div>
        )}
      </Modal>

      <TaskDrawer taskId={drawer.taskId} onClose={() => drawer.close('task')} mode={readOnly ? 'readOnly' : 'full'} />
    </div>
  );
}
