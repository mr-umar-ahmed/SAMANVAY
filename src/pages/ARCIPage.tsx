import { useState } from 'react';
import { GOLDEN_DEMANDS, GOLDEN_ARCI_BREAKDOWNS, ADDITIONAL_DEMANDS } from '../data/seedData';
import { DEFAULT_ARCI_WEIGHTS, type ARCIWeights } from '../types';
import { SlidersHorizontal, Info } from 'lucide-react';

const ALL_DEMANDS = [...GOLDEN_DEMANDS, ...ADDITIONAL_DEMANDS].sort((a, b) => b.arci_score - a.arci_score);

const COMPONENT_LABELS: Record<keyof ARCIWeights, { label: string; color: string }> = {
  failure_probability: { label: 'Failure Probability', color: '#EF5350' },
  safety_criticality: { label: 'Safety Criticality', color: '#FF7043' },
  tsr_delay_penalty: { label: 'TSR Delay Penalty', color: '#FFA726' },
  overdue_days: { label: 'Overdue Days', color: '#FFCA28' },
  traffic_density: { label: 'Traffic Density', color: '#66BB6A' },
  route_criticality: { label: 'Route Criticality', color: '#42A5F5' },
};

function getARCIColor(score: number) {
  if (score >= 90) return '#B71C1C';
  if (score >= 70) return '#EF5350';
  if (score >= 40) return '#FFA726';
  return '#66BB6A';
}

export default function ARCIPage() {
  const [weights, setWeights] = useState<ARCIWeights>({ ...DEFAULT_ARCI_WEIGHTS });
  const [selectedDemand, setSelectedDemand] = useState<string>('D-2025-001');

  const handleWeightChange = (key: keyof ARCIWeights, value: number) => {
    setWeights(prev => ({ ...prev, [key]: value }));
  };

  const breakdown = GOLDEN_ARCI_BREAKDOWNS[selectedDemand];

  const computedScore = breakdown
    ? Math.round(100 * Object.keys(weights).reduce((sum, k) => {
        const key = k as keyof ARCIWeights;
        return sum + weights[key] * (breakdown[key] || 0);
      }, 0))
    : 0;

  return (
    <div className="animate-fade-in-up">
      <div className="page-header">
        <div className="page-header__breadcrumb">
          <span>Prioritisation</span>
          <span className="page-header__breadcrumb-sep">/</span>
          <span>ARCI Risk Scoring</span>
        </div>
        <h1 className="page-header__title">Asset Risk & Criticality Index</h1>
        <p className="page-header__subtitle">
          Multi-attribute risk scoring with admin-tunable weights. Safety override: safety=1.0 → ARCI ≥ 90.
        </p>
      </div>

      <div className="grid-2col">
        {/* Left: Score Visualization */}
        <div>
          {/* Score Circle */}
          <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="card__body" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
              <div style={{
                width: 140, height: 140, borderRadius: '50%', margin: '0 auto var(--space-4)',
                background: `conic-gradient(${getARCIColor(computedScore)} ${computedScore * 3.6}deg, var(--surface-2) 0deg)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 0 40px ${getARCIColor(computedScore)}30`,
              }}>
                <div style={{
                  width: 110, height: 110, borderRadius: '50%', background: 'var(--surface-0)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, color: getARCIColor(computedScore) }}>
                    {computedScore}
                  </span>
                  <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.5 }}>
                    ARCI Score
                  </span>
                </div>
              </div>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--espresso-light)', opacity: 0.6 }}>
                {computedScore >= 90 ? '🔴 CRITICAL — Immediate action required'
                  : computedScore >= 70 ? '🟠 HIGH — Schedule within 7 days'
                  : computedScore >= 40 ? '🟡 MODERATE — Plan in next cycle'
                  : '🟢 LOW — Routine maintenance'}
              </p>
            </div>
          </div>

          {/* Breakdown Bars */}
          {breakdown && (
            <div className="card">
              <div className="card__header">
                <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>Score Decomposition</h4>
                <Info size={14} style={{ opacity: 0.4 }} />
              </div>
              <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {(Object.keys(COMPONENT_LABELS) as (keyof ARCIWeights)[]).map(key => {
                  const val = breakdown[key] || 0;
                  const weighted = Math.round(val * weights[key] * 100);
                  return (
                    <div key={key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--espresso-light)' }}>
                          {COMPONENT_LABELS[key].label}
                        </span>
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, fontFamily: 'var(--font-mono)', color: COMPONENT_LABELS[key].color }}>
                          {weighted} pts ({(weights[key] * 100).toFixed(0)}% × {(val * 100).toFixed(0)}%)
                        </span>
                      </div>
                      <div style={{ height: 8, borderRadius: 'var(--radius-full)', background: 'var(--surface-2)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 'var(--radius-full)',
                          width: `${val * 100}%`,
                          background: COMPONENT_LABELS[key].color,
                          transition: 'width 0.4s cubic-bezier(0.16,1,0.3,1)',
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Weight Tuner + Demand Selector */}
        <div>
          {/* Demand Selector */}
          <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="card__header">
              <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>Select Demand</h4>
            </div>
            <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {GOLDEN_DEMANDS.map(d => (
                <button
                  key={d.id}
                  className={`sidebar__link ${selectedDemand === d.id ? 'sidebar__link--active' : ''}`}
                  onClick={() => setSelectedDemand(d.id)}
                  style={{ fontSize: 'var(--text-sm)' }}
                >
                  <span className={`badge ${d.department === 'Civil' ? 'badge--civil' : d.department === 'S&T' ? 'badge--snt' : 'badge--trd'}`} style={{ fontSize: '9px' }}>
                    {d.department}
                  </span>
                  <span style={{ flex: 1, textAlign: 'left' }}>{d.title.split('—')[0].trim()}</span>
                  <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: getARCIColor(d.arci_score) }}>
                    {d.arci_score}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Weight Tuner */}
          <div className="card">
            <div className="card__header">
              <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <SlidersHorizontal size={14} /> Weight Tuner
              </h4>
              <button className="btn btn--sm btn--ghost" onClick={() => setWeights({ ...DEFAULT_ARCI_WEIGHTS })}>
                Reset
              </button>
            </div>
            <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {(Object.keys(COMPONENT_LABELS) as (keyof ARCIWeights)[]).map(key => (
                <div key={key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label className="label" style={{ margin: 0 }}>{COMPONENT_LABELS[key].label}</label>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      {(weights[key] * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={weights[key] * 100}
                    onChange={(e) => handleWeightChange(key, parseInt(e.target.value) / 100)}
                    style={{
                      width: '100%', appearance: 'none', height: 6, borderRadius: 'var(--radius-full)',
                      background: `linear-gradient(to right, ${COMPONENT_LABELS[key].color} ${weights[key] * 100}%, var(--surface-2) ${weights[key] * 100}%)`,
                      outline: 'none', cursor: 'pointer',
                    }}
                  />
                </div>
              ))}
              <div style={{ padding: 'var(--space-2) var(--space-3)', background: 'var(--status-proposed-bg)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)' }}>
                <strong>Total Weight:</strong>{' '}
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  {(Object.values(weights).reduce((s, v) => s + v, 0) * 100).toFixed(0)}%
                </span>
                {' '}(should sum to 100% for calibrated scoring)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
