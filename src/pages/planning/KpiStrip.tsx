/**
 * KPI tiles for the planning pages: plan value, Δ vs the simulated FIFO
 * baseline computed like-for-like from the same snapshot, the method on
 * hover, and the seed / run footnote.
 */
import { Info } from 'lucide-react';
import type { Kpis } from '../../engine/types';
import { useT } from '../../i18n';
import { StatTile } from '../../components/ui';
import { SimLabel } from '../../components/ui/extras';
import { compareKpi, formatKpi, formatKpiDelta, FEED_SEED, KPI_LABEL, KPI_METHOD, planStrings, type KpiKey } from './planMetrics';

export function KpiStrip({ kpis, baseKpis, keys, runId, tour }: { kpis: Kpis; baseKpis: Kpis; keys: KpiKey[]; runId: number; tour?: string }) {
  const t = useT(planStrings);
  return (
    <div className="stack">
      <div className={keys.length === 6 ? 'grid grid-3' : 'stat-grid'} data-tour={tour}>
        {keys.map((key) => {
          const c = compareKpi(key, kpis, baseKpis);
          const noMandatory = key === 'mandatory' && c.value === null;
          return (
            <StatTile
              key={key}
              label={<span title={t(KPI_METHOD[key])}>{t(KPI_LABEL[key])}</span>}
              icon={
                <span className="row" title={t(KPI_METHOD[key])} aria-label={t(KPI_METHOD[key])}>
                  <Info size={12} />
                </span>
              }
              value={formatKpi(key, c.value)}
              delta={c.delta === null ? undefined : formatKpiDelta(key, c.delta)}
              deltaGood={c.better}
              sub={noMandatory ? t('noMandatory') : t('baselineIs', { v: formatKpi(key, c.ref) })}
            />
          );
        })}
      </div>
      <div className="row-wrap tiny muted">
        <SimLabel kind="baseline" />
        <span>{t('footnote', { seed: FEED_SEED, run: runId })}</span>
      </div>
    </div>
  );
}

export default KpiStrip;
