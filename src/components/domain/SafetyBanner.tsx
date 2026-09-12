/**
 * Safety before optimisation — a banner for a plan (working or candidate):
 * every mandatory safety work the optimiser could not place on or before its
 * due day (plan.safetyConflicts, with the engine's reason) and every hard
 * rule the plan still breaks (plan.cost.hardReasons). When there are none,
 * a quiet line with the computed count of mandatory works placed on time.
 */
import type { ReactNode } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import type { Kpis, Plan, Snapshot } from '../../engine/types';
import { useLang, useT } from '../../i18n';
import { Callout } from '../ui';
import { conflictSentence, hardReasonRow, type ConflictRow } from './conflictText';

const strings = {
  en: {
    titleWorking: 'Safety before optimisation',
    titleCandidate: 'Safety check of this candidate',
    conflicts: '{n} mandatory safety work(s) cannot be placed on or before the due day.',
    hard: 'The plan breaks {n} hard rule(s):',
    allPlaced: 'All mandatory safety work placed on or before its due day ({a}/{b}).',
    noMandatory: 'No mandatory safety work in this horizon.',
    more: '+{n} more',
  },
  hi: {
    titleWorking: 'अनुकूलन से पहले सुरक्षा',
    titleCandidate: 'इस विकल्प की सुरक्षा जाँच',
    conflicts: '{n} अनिवार्य सुरक्षा कार्य देय दिन तक नहीं रखे जा सकते।',
    hard: 'योजना {n} कठोर नियम तोड़ती है:',
    allPlaced: 'सभी अनिवार्य सुरक्षा कार्य अपने देय दिन तक रखे गए ({a}/{b})।',
    noMandatory: 'इस अवधि में कोई अनिवार्य सुरक्षा कार्य नहीं।',
    more: '+{n} और',
  },
} as const;

export interface SafetyBannerProps {
  /** snapshot the plan belongs to (dates, work names) */
  snapshot: Snapshot;
  plan: Plan;
  kpis: Kpis;
  candidate?: boolean;
  /** rows listed before "+n more" */
  limit?: number;
  action?: ReactNode;
  tour?: string;
}

/** Safety conflicts and hard reasons of a plan (older snapshots may lack either). */
function planSafety(plan: Plan) {
  const safety = plan.safetyConflicts ?? [];
  const hard = plan.cost?.hardReasons ?? [];
  return { safety, hard, broken: safety.length > 0 || hard.length > 0 };
}

export function SafetyBanner({ snapshot, plan, kpis, candidate = false, limit = 5, action, tour }: SafetyBannerProps) {
  const t = useT(strings);
  const lang = useLang();
  const { safety, hard } = planSafety(plan);
  const tasksById = new Map(snapshot.tasks.map((x) => [x.id, x]));
  const taskName = (id: string) => tasksById.get(id)?.label ?? id;
  const safetyIds = new Set(safety.map((s) => s.taskId));

  if (!safety.length && !hard.length) {
    return (
      <div className="row small" style={{ gap: 6, color: 'var(--ok)' }} data-tour={tour} role="status">
        <ShieldCheck size={14} />
        <span>{kpis.mandatoryTotal > 0 ? t('allPlaced', { a: kpis.mandatoryCompliant, b: kpis.mandatoryTotal }) : t('noMandatory')}</span>
      </div>
    );
  }

  const safetyRows: ConflictRow[] = safety.map((s) => ({ id: `SAFETY:${s.taskId}`, severity: 'high', kind: 'SAFETY', taskId: s.taskId, day: s.placedDay ?? undefined, params: { label: s.label, dueDay: s.dueDay, placedDay: s.placedDay, reason: s.reason, detail: s.detail ?? null } }));
  // hard reasons about works already named above are not repeated
  const hardRows = hard.map((r) => hardReasonRow(r, snapshot, plan.rules ?? snapshot.result.rules)).filter((r) => !((r.kind === 'BEYOND_DUE' || r.kind === 'DEFERRED_MANDATORY') && r.taskId && safetyIds.has(r.taskId)));

  return (
    <div data-tour={tour}>
      <Callout tone="crit" icon={<ShieldAlert />}>
        <div className="strong">{candidate ? t('titleCandidate') : t('titleWorking')}</div>
        {safetyRows.length > 0 && (
          <>
            <div className="small">{t('conflicts', { n: safetyRows.length })}</div>
            <ul className="small" style={{ margin: '4px 0 0 16px', padding: 0 }}>
              {safetyRows.slice(0, limit).map((r) => (
                <li key={r.id}>{conflictSentence(r, snapshot, lang, taskName)}</li>
              ))}
              {safetyRows.length > limit && <li className="muted">{t('more', { n: safetyRows.length - limit })}</li>}
            </ul>
          </>
        )}
        {hardRows.length > 0 && (
          <>
            <div className="small" style={{ marginTop: 6 }}>{t('hard', { n: hardRows.length })}</div>
            <ul className="small" style={{ margin: '4px 0 0 16px', padding: 0 }}>
              {hardRows.slice(0, limit).map((r) => (
                <li key={r.id}>{conflictSentence(r, snapshot, lang, taskName)}</li>
              ))}
              {hardRows.length > limit && <li className="muted">{t('more', { n: hardRows.length - limit })}</li>}
            </ul>
          </>
        )}
        {action && <div className="row-wrap mt">{action}</div>}
      </Callout>
    </div>
  );
}

export default SafetyBanner;
