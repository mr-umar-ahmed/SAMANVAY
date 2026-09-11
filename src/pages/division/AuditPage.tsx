/**
 * AuditPage — /app/division/audit.
 * Every state change the store records (concurrence, grant, refusal, lock,
 * directions, plan runs, TSRs, forms, requisitions, reports, settings) with
 * who, when and what. The trail lives in this browser (persisted store).
 * Filters are built from the actions actually present, not a fixed list.
 */
import { useMemo, useState } from 'react';
import { Download, ExternalLink, Printer, Search, X } from 'lucide-react';
import { useAppStore, type AuditEntityType, type AuditEntry } from '../../store/useAppStore';
import { workingBlocks } from '../../engine/select';
import { useT } from '../../i18n';
import { common } from '../../i18n/common';
import { download, num, timeAgo } from '../../lib/format';
import { Badge, Card, CardBody, CardFoot, CardHead, DataTable, EmptyState, PageHeader, StatTile, type Column, type Tone } from '../../components/ui';
import { SimLabel } from '../../components/ui/extras';
import { TaskDrawer } from '../../components/domain/TaskDrawer';
import { BlockDrawer } from '../../components/domain/BlockDrawer';
import { ReportDrawer } from '../../components/domain/ReportDrawer';
import { useDrawerParams } from '../../components/domain/useDrawerParams';

const PAGE = 200;

const ENTITY_TYPES: AuditEntityType[] = ['block', 'task', 'report', 'plan', 'caution', 'tsr', 'form', 'requisition', 'rbp', 'escalation', 'direction', 'user', 'settings'];

/** Stat tile row: kit .grid with a one-off column template. */
const TILES = { gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' } as const;

const strings = {
  en: {
    title: 'Audit trail',
    lede: 'Who did what, when. Every workflow action writes one entry; the trail is kept in this browser and exported as CSV.',
    exportCsv: 'Export CSV',
    exported: 'Audit trail exported',
    exportedBody: '{n} entries',
    sTotal: 'Entries',
    sTotalSub: 'Newest first, last 800 kept',
    sGrants: 'Blocks granted',
    sGrantsSub: 'Including grants with change',
    sConcur: 'Concurrences',
    sConcurSub: 'Objections {n}',
    sRefused: 'Refusals',
    sRefusedSub: 'By Control',
    sDirections: 'Directions',
    sDirectionsSub: 'From the division',
    sRuns: 'Plan runs',
    sRunsSub: 'Engine runs and promotions',
    tableTitle: 'Entries',
    tableSub: '{shown} of {total} shown',
    searchPh: 'Search action, person, reference or detail',
    entity: 'Entity',
    action: 'Action',
    allEntities: 'All entities',
    allActions: 'All actions',
    clear: 'Clear filters',
    colWhen: 'When',
    colBy: 'By',
    colAction: 'Action',
    colEntity: 'Entity',
    colDetail: 'Detail',
    open: 'Open',
    more: 'Show {n} more',
    empty: 'No actions recorded yet.',
    emptyFiltered: 'No entries match the filters.',
    eblock: 'Block',
    etask: 'Work',
    ereport: 'Report',
    eplan: 'Plan',
    ecaution: 'Caution order',
    etsr: 'TSR',
    eform: 'Form',
    erequisition: 'Requisition',
    erbp: 'Programme',
    eescalation: 'Escalation',
    edirection: 'Direction',
    euser: 'User',
    esettings: 'Settings',
  },
  hi: {
    title: 'ऑडिट ट्रेल',
    lede: 'किसने क्या, कब किया। हर कार्यप्रवाह कार्रवाई एक प्रविष्टि लिखती है; ट्रेल इसी ब्राउज़र में रहती है और CSV में निर्यात होती है।',
    exportCsv: 'CSV निर्यात',
    exported: 'ऑडिट ट्रेल निर्यात',
    exportedBody: '{n} प्रविष्टियाँ',
    sTotal: 'प्रविष्टियाँ',
    sTotalSub: 'नवीनतम पहले, अंतिम 800 सुरक्षित',
    sGrants: 'प्रदान ब्लॉक',
    sGrantsSub: 'परिवर्तन सहित प्रदान भी',
    sConcur: 'सहमतियाँ',
    sConcurSub: 'आपत्तियाँ {n}',
    sRefused: 'अस्वीकृतियाँ',
    sRefusedSub: 'Control द्वारा',
    sDirections: 'निर्देश',
    sDirectionsSub: 'मंडल से',
    sRuns: 'योजना run',
    sRunsSub: 'इंजन run और promotion',
    tableTitle: 'प्रविष्टियाँ',
    tableSub: '{total} में से {shown} दिखाई गईं',
    searchPh: 'कार्रवाई, व्यक्ति, संदर्भ या विवरण खोजें',
    entity: 'इकाई',
    action: 'कार्रवाई',
    allEntities: 'सभी इकाइयाँ',
    allActions: 'सभी कार्रवाइयाँ',
    clear: 'फ़िल्टर हटाएँ',
    colWhen: 'कब',
    colBy: 'किसने',
    colAction: 'कार्रवाई',
    colEntity: 'इकाई',
    colDetail: 'विवरण',
    open: 'खोलें',
    more: '{n} और दिखाएँ',
    empty: 'अभी कोई कार्रवाई दर्ज नहीं।',
    emptyFiltered: 'फ़िल्टर से कोई प्रविष्टि मेल नहीं खाती।',
    eblock: 'ब्लॉक',
    etask: 'कार्य',
    ereport: 'रिपोर्ट',
    eplan: 'योजना',
    ecaution: 'सतर्कता आदेश',
    etsr: 'TSR',
    eform: 'प्रपत्र',
    erequisition: 'requisition',
    erbp: 'कार्यक्रम',
    eescalation: 'एस्केलेशन',
    edirection: 'निर्देश',
    euser: 'उपयोगकर्ता',
    esettings: 'सेटिंग्स',
  },
} as const;

type Key = keyof typeof strings.en;

const humanAction = (a: string) => a.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

function actionTone(a: string): Tone {
  if (a.includes('REFUSED') || a.includes('OBJECTION') || a.includes('REJECT') || a === 'TSR_IMPOSED') return 'crit';
  if (a.includes('GRANTED') || a.includes('CONCUR') || a.includes('CLEARED') || a.includes('APPROVED') || a.includes('ACCEPTED') || a.includes('RESOLVE')) return 'ok';
  if (a.includes('LOCKED')) return 'info';
  if (a.includes('DIRECTION') || a.includes('ESCALAT') || a.includes('PINNED')) return 'warn';
  return 'gray';
}

const fmtWhen = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

export default function AuditPage() {
  const t = useT(strings);
  const tc = useT(common);
  const drawer = useDrawerParams();

  const audit = useAppStore((s) => s.audit);
  const snapshot = useAppStore((s) => s.snapshot);
  const approvals = useAppStore((s) => s.approvals);
  const reports = useAppStore((s) => s.reports);
  const toast = useAppStore((s) => s.toast);

  const [q, setQ] = useState('');
  const [entity, setEntity] = useState<AuditEntityType | 'all'>('all');
  const [action, setAction] = useState('all');
  const [limit, setLimit] = useState(PAGE);

  const blockIds = useMemo(() => new Set(workingBlocks(snapshot, approvals).map((b) => b.id)), [snapshot, approvals]);
  const taskIds = useMemo(() => new Set(snapshot?.tasks.map((x) => x.id) ?? []), [snapshot]);
  const reportIds = useMemo(() => new Set(reports.map((r) => r.id)), [reports]);

  const actions = useMemo(() => Array.from(new Set(audit.map((a) => a.action))).sort(), [audit]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return audit.filter((a) => {
      if (entity !== 'all' && a.entityType !== entity) return false;
      if (action !== 'all' && a.action !== action) return false;
      if (!needle) return true;
      return [a.action, humanAction(a.action), a.by, a.role, a.entityId, a.detail ?? ''].some((s) => s.toLowerCase().includes(needle));
    });
  }, [audit, q, entity, action]);

  const stats = useMemo(() => {
    const has = (pred: (a: AuditEntry) => boolean) => audit.filter(pred).length;
    return {
      grants: has((a) => a.action === 'BLOCK_GRANTED' || a.action === 'BLOCK_GRANTED_WITH_CHANGE'),
      concur: has((a) => a.action.startsWith('CONCUR_')),
      objections: has((a) => a.action.startsWith('OBJECTION_')),
      refused: has((a) => a.action === 'BLOCK_REFUSED'),
      directions: has((a) => a.action === 'DIRECTION_ISSUED'),
      runs: has((a) => a.action === 'PLAN_COMPUTED' || a.action === 'WORKING_PLAN_UPDATED'),
    };
  }, [audit]);

  const openable = (a: AuditEntry): 'block' | 'task' | 'report' | null => {
    if (a.entityType === 'block' && blockIds.has(a.entityId)) return 'block';
    if (a.entityType === 'task' && taskIds.has(a.entityId)) return 'task';
    if (a.entityType === 'report' && reportIds.has(a.entityId)) return 'report';
    return null;
  };

  const filtersOn = q.trim() !== '' || entity !== 'all' || action !== 'all';

  const onExport = () => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = [
      ['Time (ISO)', 'By', 'Role', 'Action', 'Entity type', 'Entity', 'Detail'].join(','),
      ...filtered.map((a) => [a.at, esc(a.by), esc(a.role), a.action, a.entityType, esc(a.entityId), esc(a.detail ?? '')].join(',')),
    ].join('\n');
    download(`samanvay-audit-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
    toast({ title: t('exported'), body: t('exportedBody', { n: filtered.length }), tone: 'ok' });
  };

  const columns: Column<AuditEntry>[] = [
    {
      key: 'when',
      header: t('colWhen'),
      render: (a) => (
        <span className="stack" style={{ gap: 1 }}>
          <span className="small num" style={{ whiteSpace: 'nowrap' }}>{fmtWhen(a.at)}</span>
          <span className="tiny muted">{timeAgo(a.at)}</span>
        </span>
      ),
    },
    {
      key: 'by',
      header: t('colBy'),
      render: (a) => (
        <span className="stack" style={{ gap: 1 }}>
          <span className="small strong">{a.by}</span>
          <span className="tiny muted">{a.role.replace(/_/g, ' ').toLowerCase()}</span>
        </span>
      ),
    },
    { key: 'action', header: t('colAction'), render: (a) => <Badge tone={actionTone(a.action)}>{humanAction(a.action)}</Badge> },
    {
      key: 'entity',
      header: t('colEntity'),
      render: (a) => {
        const kind = openable(a);
        return (
          <span className="stack" style={{ gap: 2 }}>
            <span className="tiny muted">{t(`e${a.entityType}` as Key)}</span>
            {kind ? (
              <button type="button" className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start', padding: '0 6px' }} onClick={() => drawer.open(kind, a.entityId)} title={t('open')}>
                <span className="mono small">{a.entityId}</span> <ExternalLink size={12} />
              </button>
            ) : (
              <span className="mono small">{a.entityId}</span>
            )}
          </span>
        );
      },
    },
    { key: 'detail', header: t('colDetail'), hideMobile: true, render: (a) => <span className="small" style={{ display: 'block', maxWidth: 420 }}>{a.detail ?? ''}</span> },
  ];

  return (
    <div className="stack-lg">
      <PageHeader
        title={t('title')}
        lede={t('lede')}
        badges={<SimLabel kind="localOnly" />}
        actions={
          <>
            <button type="button" className="btn btn-sm" onClick={onExport} disabled={!filtered.length}>
              <Download /> {t('exportCsv')}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => window.print()}>
              <Printer /> {tc('print')}
            </button>
          </>
        }
      />

      <div className="grid" style={TILES}>
        <StatTile label={t('sTotal')} value={num(audit.length)} sub={t('sTotalSub')} pastel="blue" />
        <StatTile label={t('sGrants')} value={num(stats.grants)} sub={t('sGrantsSub')} />
        <StatTile label={t('sConcur')} value={num(stats.concur)} sub={t('sConcurSub', { n: stats.objections })} />
        <StatTile label={t('sRefused')} value={num(stats.refused)} sub={t('sRefusedSub')} />
        <StatTile label={t('sDirections')} value={num(stats.directions)} sub={t('sDirectionsSub')} />
        <StatTile label={t('sRuns')} value={num(stats.runs)} sub={t('sRunsSub')} />
      </div>

      <Card>
        <CardHead title={t('tableTitle')} sub={t('tableSub', { shown: Math.min(limit, filtered.length), total: filtered.length })} />
        <CardBody>
          <div className="row-wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
            <div className="field grow" style={{ minWidth: 220 }}>
              <label htmlFor="audit-q" className="row" style={{ gap: 4 }}>
                <Search size={12} /> {tc('search')}
              </label>
              <input id="audit-q" className="input" value={q} placeholder={t('searchPh')} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
            </div>
            <div className="field">
              <label htmlFor="audit-entity">{t('entity')}</label>
              <select id="audit-entity" className="select" value={entity} onChange={(e) => { setEntity(e.target.value as AuditEntityType | 'all'); setLimit(PAGE); }}>
                <option value="all">{t('allEntities')}</option>
                {ENTITY_TYPES.map((k) => (
                  <option key={k} value={k}>{t(`e${k}` as Key)}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="audit-action">{t('action')}</label>
              <select id="audit-action" className="select" value={action} onChange={(e) => { setAction(e.target.value); setLimit(PAGE); }}>
                <option value="all">{t('allActions')}</option>
                {actions.map((a) => (
                  <option key={a} value={a}>{humanAction(a)}</option>
                ))}
              </select>
            </div>
            {filtersOn && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setQ(''); setEntity('all'); setAction('all'); setLimit(PAGE); }}>
                <X /> {t('clear')}
              </button>
            )}
          </div>
        </CardBody>
        <CardBody flush>
          <div data-tour="audit-trail">
            <DataTable columns={columns} rows={filtered.slice(0, limit)} rowKey={(a) => a.id} compact empty={<EmptyState title={audit.length ? t('emptyFiltered') : t('empty')} />} />
          </div>
        </CardBody>
        {filtered.length > limit && (
          <CardFoot>
            <button type="button" className="btn btn-sm" onClick={() => setLimit((l) => l + PAGE)}>
              {t('more', { n: Math.min(PAGE, filtered.length - limit) })}
            </button>
          </CardFoot>
        )}
      </Card>

      <TaskDrawer taskId={drawer.taskId} onClose={() => drawer.close('task')} mode="readOnly" />
      <BlockDrawer blockId={drawer.blockId} onClose={() => drawer.close('block')} />
      <ReportDrawer reportId={drawer.reportId} onClose={() => drawer.close('report')} />
    </div>
  );
}
