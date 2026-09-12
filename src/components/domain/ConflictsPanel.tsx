/**
 * Conflicts & dependencies — one list of everything standing in the way of
 * the week as it is now (select.conflictsFor: double-booked machines and
 * gangs, incompatible works, JPO limits, premium paths, T/351 and OHE
 * isolation records, objections, the engine's safety conflicts and deferred
 * mandatory works, proposals changed by a re-plan) plus the optimiser's
 * hard-rule reasons for dependencies and co-requisite blocks, grouped by
 * severity; and the dependency / joint-block requirements of requisition
 * works, met or not. Rows open the block or the work (?block= / ?task=).
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, CheckCircle2, ExternalLink, Info, Link2 } from 'lucide-react';
import type { ConflictSeverity, WorkingBlock } from '../../engine/select';
import type { Snapshot } from '../../engine/types';
import { usePortal } from '../../app/usePortal';
import { useLang, useT } from '../../i18n';
import { Badge, Card, CardBody, CardHead, Segmented } from '../ui';
import { SimLabel } from '../ui/extras';
import { useDrawerParams } from './useDrawerParams';
import { conflictSentence, dayText, requirementChecks, type ConflictRow, type Requirement } from './conflictText';
import { useConflictRows } from './planHooks';

const strings = {
  en: {
    title: 'Conflicts & dependencies',
    sub: 'Resource double-booking, JPO limits, premium paths, forms and isolations, objections and safety — computed from the plan and the recorded workflow.',
    scopeDay: '{day} ({n})',
    scopeWeek: 'Whole week ({n})',
    scopeAria: 'Conflict scope',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    none: 'No conflicts for {scope}.',
    noneWeek: 'No conflicts this week.',
    openBlock: 'Open block',
    openWork: 'Open work',
    sendAgain: 'Send again',
    showAll: 'Show all {n}',
    showLess: 'Show fewer',
    reqTitle: 'Dependencies and joint-block requirements',
    reqSub: 'From requisitions: works that must finish first, and works that must share one possession.',
    reqNone: 'No work in this week’s register carries a dependency or a joint-block requirement.',
    reqDep: '{task} after {other}',
    reqCo: '{task} with {other} in one block',
    met: 'Met',
    notMet: 'Not met',
    whyUnplaced: 'one of the works is not scheduled',
    whyOrder: 'the predecessor ends after this work starts',
    whySeparate: 'the works sit in different blocks',
    inBlock: 'block {id}',
    sourceNote: 'Hard-rule rows marked “plan” come from the optimiser’s own check of the working plan.',
    planTag: 'plan',
  },
  hi: {
    title: 'टकराव व निर्भरताएँ',
    sub: 'संसाधन की दोहरी बुकिंग, JPO सीमाएँ, प्रीमियम पथ, फ़ॉर्म व आइसोलेशन, आपत्तियाँ और सुरक्षा — योजना और दर्ज वर्कफ़्लो से गणित।',
    scopeDay: '{day} ({n})',
    scopeWeek: 'पूरा सप्ताह ({n})',
    scopeAria: 'टकराव का दायरा',
    high: 'उच्च',
    medium: 'मध्यम',
    low: 'निम्न',
    none: '{scope} के लिए कोई टकराव नहीं।',
    noneWeek: 'इस सप्ताह कोई टकराव नहीं।',
    openBlock: 'Block खोलें',
    openWork: 'कार्य खोलें',
    sendAgain: 'फिर से भेजें',
    showAll: 'सभी {n} दिखाएँ',
    showLess: 'कम दिखाएँ',
    reqTitle: 'निर्भरताएँ और संयुक्त block आवश्यकताएँ',
    reqSub: 'माँग-पत्रों से: वे कार्य जो पहले पूरे होने चाहिए, और वे जो एक ही पज़ेशन साझा करें।',
    reqNone: 'इस सप्ताह के रजिस्टर में किसी कार्य पर निर्भरता या संयुक्त block आवश्यकता नहीं।',
    reqDep: '{other} के बाद {task}',
    reqCo: '{task} और {other} एक block में',
    met: 'पूरी',
    notMet: 'पूरी नहीं',
    whyUnplaced: 'कोई एक कार्य नियोजित नहीं',
    whyOrder: 'पूर्ववर्ती कार्य इस कार्य की शुरुआत के बाद समाप्त होता है',
    whySeparate: 'कार्य अलग-अलग block में हैं',
    inBlock: 'block {id}',
    sourceNote: '“plan” चिह्नित कठोर-नियम पंक्तियाँ चालू योजना की ऑप्टिमाइज़र जाँच से आती हैं।',
    planTag: 'plan',
  },
} as const;

const SEVERITIES: ConflictSeverity[] = ['high', 'medium', 'low'];
const TONE: Record<ConflictSeverity, 'crit' | 'warn' | 'gray'> = { high: 'crit', medium: 'warn', low: 'gray' };
const ICON: Record<ConflictSeverity, React.ReactNode> = { high: <AlertOctagon size={14} />, medium: <AlertTriangle size={14} />, low: <Info size={14} /> };

export interface ConflictsPanelProps {
  snapshot: Snapshot;
  blocks: WorkingBlock[];
  /** a plan day: offers "this day / whole week" (default this day) */
  day?: number | null;
  /** rows per severity before "show all" */
  limit?: number;
  /** show the dependency / joint-block requirement list */
  requirements?: boolean;
  /** render without the card chrome (e.g. inside a tab) */
  bare?: boolean;
  tour?: string;
}

export function ConflictsPanel({ snapshot, blocks, day = null, limit = 6, requirements = true, bare = false, tour }: ConflictsPanelProps) {
  const t = useT(strings);
  const lang = useLang();
  const portal = usePortal();
  const drawer = useDrawerParams();
  const all = useConflictRows(snapshot, blocks);
  const reqs = useMemo(() => (requirements ? requirementChecks(snapshot, blocks) : []), [requirements, snapshot, blocks]);
  const [scope, setScope] = useState<'day' | 'week'>(day === null ? 'week' : 'day');
  const [expanded, setExpanded] = useState<ConflictSeverity[]>([]);

  const tasksById = useMemo(() => new Map(snapshot.tasks.map((x) => [x.id, x])), [snapshot]);
  const blockIds = useMemo(() => new Set(blocks.map((b) => b.id)), [blocks]);
  const taskName = (id: string) => tasksById.get(id)?.label ?? id;
  const dayRows = useMemo(() => (day === null ? all : all.filter((c) => c.day === day)), [all, day]);
  const rows = scope === 'day' && day !== null ? dayRows : all;
  const scopeLabel = day !== null && scope === 'day' ? dayText(snapshot, day) : '';

  const rowView = (c: ConflictRow) => {
    const text = conflictSentence(c, snapshot, lang, taskName);
    const openBlock = c.blockId && blockIds.has(c.blockId) ? c.blockId : null;
    const openTask = !openBlock && c.taskId && tasksById.has(c.taskId) ? c.taskId : null;
    return (
      <li key={c.id} className="row" style={{ alignItems: 'flex-start', gap: 8, padding: '6px 0', borderTop: '1px solid var(--line)' }}>
        <span style={{ color: `var(--${TONE[c.severity] === 'gray' ? 'ink-3' : TONE[c.severity]})`, marginTop: 2 }} aria-hidden="true">{ICON[c.severity]}</span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="small">{text}</div>
          <div className="row-wrap tiny muted" style={{ gap: 6, marginTop: 2 }}>
            {c.day !== undefined && c.day !== null && <span>{dayText(snapshot, c.day)}</span>}
            {c.blockId && <span className="mono">{c.blockId}</span>}
            {c.params.source === 'plan' && <Badge tone="outline">{t('planTag')}</Badge>}
          </div>
        </div>
        <div className="row-wrap" style={{ gap: 4, justifyContent: 'flex-end' }}>
          {openBlock && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => drawer.open('block', openBlock, { close: 'task' })}>
              <ExternalLink size={12} /> {t('openBlock')}
            </button>
          )}
          {openTask && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => drawer.open('task', openTask, { close: 'block' })}>
              <ExternalLink size={12} /> {t('openWork')}
            </button>
          )}
          {c.kind === 'SUPERSEDED' && portal === 'planning' && (
            <Link className="btn btn-sm btn-ghost" to="/app/planning/handoff">
              {t('sendAgain')}
            </Link>
          )}
        </div>
      </li>
    );
  };

  const body = (
    <div className="stack" data-tour={bare ? tour : undefined}>
      {day !== null && (
        <Segmented<'day' | 'week'>
          ariaLabel={t('scopeAria')}
          value={scope}
          onChange={setScope}
          options={[
            { value: 'day', label: t('scopeDay', { day: dayText(snapshot, day), n: dayRows.length }) },
            { value: 'week', label: t('scopeWeek', { n: all.length }) },
          ]}
        />
      )}
      {rows.length === 0 ? (
        <div className="row small" style={{ gap: 6, color: 'var(--ok)' }}>
          <CheckCircle2 size={14} /> <span>{scopeLabel ? t('none', { scope: scopeLabel }) : t('noneWeek')}</span>
        </div>
      ) : (
        SEVERITIES.map((sev) => {
          const list = rows.filter((c) => c.severity === sev);
          if (!list.length) return null;
          const open = expanded.includes(sev);
          const shown = open ? list : list.slice(0, limit);
          return (
            <div key={sev}>
              <div className="row" style={{ gap: 6 }}>
                <Badge tone={TONE[sev]}>{t(sev)}</Badge>
                <span className="tiny muted num">{list.length}</span>
              </div>
              <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>{shown.map(rowView)}</ul>
              {list.length > limit && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setExpanded((e) => (open ? e.filter((x) => x !== sev) : [...e, sev]))}>
                  {open ? t('showLess') : t('showAll', { n: list.length })}
                </button>
              )}
            </div>
          );
        })
      )}
      {rows.some((c) => c.params.source === 'plan') && <div className="tiny muted">{t('sourceNote')}</div>}
      {requirements && <RequirementList reqs={reqs} taskName={taskName} />}
    </div>
  );

  if (bare) return body;
  return (
    <Card tour={tour}>
      <CardHead title={t('title')} sub={t('sub')} right={<SimLabel kind="solver" short />} />
      <CardBody>{body}</CardBody>
    </Card>
  );
}

function RequirementList({ reqs, taskName }: { reqs: Requirement[]; taskName: (id: string) => string }) {
  const t = useT(strings);
  const drawer = useDrawerParams();
  return (
    <div className="stack" style={{ gap: 6, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
      <div>
        <div className="small strong row" style={{ gap: 6 }}>
          <Link2 size={14} /> {t('reqTitle')}
        </div>
        <div className="tiny muted">{t('reqSub')}</div>
      </div>
      {reqs.length === 0 ? (
        <div className="tiny muted">{t('reqNone')}</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {reqs.map((r) => (
            <li key={r.id} className="row-wrap" style={{ gap: 6, padding: '4px 0' }}>
              <Badge tone={r.met ? 'ok' : 'crit'}>{r.met ? t('met') : t('notMet')}</Badge>
              <button type="button" className="btn btn-sm btn-ghost" style={{ textAlign: 'left' }} onClick={() => drawer.open('task', r.taskId, { close: 'block' })}>
                {r.kind === 'dependsOn' ? t('reqDep', { task: taskName(r.taskId), other: taskName(r.otherId) }) : t('reqCo', { task: taskName(r.taskId), other: taskName(r.otherId) })}
              </button>
              <span className="tiny muted">
                {r.met ? (r.blockId ? t('inBlock', { id: r.blockId }) : '') : r.why === 'order' ? t('whyOrder') : r.why === 'separate' ? t('whySeparate') : t('whyUnplaced')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ConflictsPanel;
