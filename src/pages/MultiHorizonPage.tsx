import { useState } from 'react';
import { Calendar, ArrowRight, AlertTriangle } from 'lucide-react';
import type { PlanningHorizon } from '../types';

const HORIZONS: { key: PlanningHorizon; label: string; range: string; description: string; color: string }[] = [
  { key: 'strategic', label: 'Strategic', range: '26-Week Rolling Programme', description: 'Long-term block allocation aligned with machine deployment, seasonal constraints, and cross-divisional coordination.', color: 'var(--crimson-violet)' },
  { key: 'tactical', label: 'Tactical', range: '7-Day Lookahead', description: 'Week-ahead confirmation and resource locking. Final bundling and protection envelope computation.', color: 'var(--status-info)' },
  { key: 'dispatch', label: 'Dispatch', range: '24-Hour Real-Time', description: 'Live execution with real-time train telemetry, block countdown, and adaptive disruption recovery.', color: 'var(--status-approved)' },
];

export default function MultiHorizonPage() {
  const [activeHorizon, setActiveHorizon] = useState<PlanningHorizon>('dispatch');

  return (
    <div className="animate-fade-in-up">
      <div className="page-header">
        <div className="page-header__breadcrumb">
          <span>Planning</span>
          <span className="page-header__breadcrumb-sep">/</span>
          <span>Multi-Horizon</span>
        </div>
        <h1 className="page-header__title">Multi-Horizon Orchestration</h1>
        <p className="page-header__subtitle">
          3-tier synchronized planning: Strategic (26-week) → Tactical (7-day) → Dispatch (24-hour).
        </p>
      </div>

      {/* Horizon Selector */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
        {HORIZONS.map((h, i) => (
          <div key={h.key} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: 1, minWidth: 250 }}>
            <button
              className={`card ${activeHorizon === h.key ? '' : 'card--flat'}`}
              style={{
                flex: 1, cursor: 'pointer', transition: 'all 0.2s ease', textAlign: 'left',
                border: activeHorizon === h.key ? `2px solid ${h.color}` : undefined,
                background: activeHorizon === h.key ? `${h.color}08` : undefined,
              }}
              onClick={() => setActiveHorizon(h.key)}
            >
              <div className="card__body" style={{ padding: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                  <Calendar size={14} style={{ color: h.color }} />
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: h.color }}>{h.label}</span>
                </div>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>{h.range}</div>
                <p style={{ fontSize: 'var(--text-xs)', opacity: 0.5 }}>{h.description}</p>
              </div>
            </button>
            {i < HORIZONS.length - 1 && (
              <ArrowRight size={16} style={{ opacity: 0.2, flexShrink: 0 }} />
            )}
          </div>
        ))}
      </div>

      {/* Maintenance Debt Indicator */}
      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="card__header">
          <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <AlertTriangle size={14} style={{ color: 'var(--status-proposed)' }} /> Maintenance Debt Tracker
          </h4>
        </div>
        <div className="card__body">
          <p style={{ fontSize: 'var(--text-sm)', opacity: 0.6, marginBottom: 'var(--space-3)' }}>
            Day-of-cancellations roll deficits upward into tactical and strategic targets.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <span className="label">Strategic Debt</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <div style={{ flex: 1, height: 8, borderRadius: 'var(--radius-full)', background: 'var(--surface-2)', overflow: 'hidden' }}>
                  <div style={{ width: '12%', height: '100%', background: 'var(--arci-low)', borderRadius: 'var(--radius-full)' }} />
                </div>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>12%</span>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <span className="label">Tactical Debt</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <div style={{ flex: 1, height: 8, borderRadius: 'var(--radius-full)', background: 'var(--surface-2)', overflow: 'hidden' }}>
                  <div style={{ width: '28%', height: '100%', background: 'var(--arci-moderate)', borderRadius: 'var(--radius-full)' }} />
                </div>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>28%</span>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <span className="label">Dispatch Debt</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <div style={{ flex: 1, height: 8, borderRadius: 'var(--radius-full)', background: 'var(--surface-2)', overflow: 'hidden' }}>
                  <div style={{ width: '8%', height: '100%', background: 'var(--arci-low)', borderRadius: 'var(--radius-full)' }} />
                </div>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>8%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Horizon Content */}
      <div className="card">
        <div className="card__header">
          <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>
            {HORIZONS.find(h => h.key === activeHorizon)?.label} View — {HORIZONS.find(h => h.key === activeHorizon)?.range}
          </h4>
        </div>
        <div className="card__body" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          <Calendar size={48} style={{ color: 'var(--surface-3)', marginBottom: 'var(--space-3)' }} />
          <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
            {activeHorizon === 'strategic' ? '26-Week Rolling Block Programme' :
              activeHorizon === 'tactical' ? '7-Day Tactical Plan' :
              '24-Hour Dispatch Board'}
          </h3>
          <p style={{ fontSize: 'var(--text-sm)', opacity: 0.5, maxWidth: 500, margin: '0 auto' }}>
            {activeHorizon === 'strategic'
              ? 'Gantt view of machine deployment, seasonal constraints, and long-term maintenance targets across the corridor.'
              : activeHorizon === 'tactical'
              ? 'Day-by-day block schedule with confirmed resource assignments and protection envelopes.'
              : 'Real-time block execution with live train telemetry and adaptive disruption recovery.'}
          </p>
          <span className="tag--simulation" style={{ marginTop: 'var(--space-3)', display: 'inline-block' }}>
            Interactive Gantt/Calendar view available in full deployment
          </span>
        </div>
      </div>
    </div>
  );
}
