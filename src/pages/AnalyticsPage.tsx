import { TrendingUp, TrendingDown, BarChart3, Layers, Gauge, Timer, Clock, Target } from 'lucide-react';
import { DEMO_KPIS } from '../data/seedData';

export default function AnalyticsPage() {
  return (
    <div className="animate-fade-in-up">
      <div className="page-header">
        <div className="page-header__breadcrumb">
          <span>Planning</span>
          <span className="page-header__breadcrumb-sep">/</span>
          <span>Analytics & KPIs</span>
        </div>
        <h1 className="page-header__title">Closed-Loop Analytics Dashboard</h1>
        <p className="page-header__subtitle">
          Post-work condition capture, model recalibration, and executive KPI tiles.
        </p>
      </div>

      {/* KPI Tiles */}
      <div className="grid-kpi" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="kpi-tile animate-fade-in-up delay-1">
          <span className="kpi-tile__label"><Target size={12} style={{ display: 'inline', marginRight: 4 }} /> Asset Availability</span>
          <span className="kpi-tile__value">{DEMO_KPIS.asset_availability_pct}%</span>
          <span className="kpi-tile__delta kpi-tile__delta--positive">
            <TrendingUp size={12} /> +3.4% vs baseline
          </span>
          <span className="kpi-tile__tag">[Simulation Projection]</span>
        </div>
        <div className="kpi-tile animate-fade-in-up delay-2">
          <span className="kpi-tile__label"><Clock size={12} style={{ display: 'inline', marginRight: 4 }} /> Downtime Saved</span>
          <span className="kpi-tile__value">{DEMO_KPIS.corridor_downtime_saved_min} min</span>
          <span className="kpi-tile__delta kpi-tile__delta--positive">
            <TrendingUp size={12} /> 14 hours total
          </span>
          <span className="kpi-tile__tag">[Simulation Projection]</span>
        </div>
        <div className="kpi-tile animate-fade-in-up delay-3">
          <span className="kpi-tile__label"><Layers size={12} style={{ display: 'inline', marginRight: 4 }} /> Joint Block Ratio</span>
          <span className="kpi-tile__value">{DEMO_KPIS.joint_block_ratio_pct}%</span>
          <span className="kpi-tile__delta kpi-tile__delta--positive">
            <TrendingUp size={12} /> Target: 70%
          </span>
          <span className="kpi-tile__tag">[Simulation Projection]</span>
        </div>
        <div className="kpi-tile animate-fade-in-up delay-4">
          <span className="kpi-tile__label"><Gauge size={12} style={{ display: 'inline', marginRight: 4 }} /> Machine Hours</span>
          <span className="kpi-tile__value">{DEMO_KPIS.machine_productive_hours_pct}%</span>
          <span className="kpi-tile__delta kpi-tile__delta--positive">
            <TrendingUp size={12} /> +8.3% utilisation
          </span>
          <span className="kpi-tile__tag">[Simulation Projection]</span>
        </div>
      </div>

      {/* Secondary KPIs */}
      <div className="grid-kpi" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="kpi-tile animate-fade-in-up delay-5">
          <span className="kpi-tile__label">Delay / Possession</span>
          <span className="kpi-tile__value">{DEMO_KPIS.delay_minutes_per_possession} min</span>
          <span className="kpi-tile__delta kpi-tile__delta--positive">
            <TrendingDown size={12} /> -2.1 min avg
          </span>
          <span className="kpi-tile__tag">[Simulation Projection]</span>
        </div>
        <div className="kpi-tile animate-fade-in-up delay-6">
          <span className="kpi-tile__label">Closures Saved</span>
          <span className="kpi-tile__value">{DEMO_KPIS.closures_saved_total}</span>
          <span className="kpi-tile__delta kpi-tile__delta--positive">
            <Layers size={12} /> via bundling
          </span>
          <span className="kpi-tile__tag">[Simulation Projection]</span>
        </div>
        <div className="kpi-tile animate-fade-in-up delay-5">
          <span className="kpi-tile__label">Demands Processed</span>
          <span className="kpi-tile__value">{DEMO_KPIS.demands_processed}</span>
          <span className="kpi-tile__delta kpi-tile__delta--positive">
            <TrendingUp size={12} /> +12 this week
          </span>
          <span className="kpi-tile__tag">[Simulation Projection]</span>
        </div>
        <div className="kpi-tile animate-fade-in-up delay-6">
          <span className="kpi-tile__label">Avg Solver Time</span>
          <span className="kpi-tile__value">{DEMO_KPIS.avg_solver_time_ms}ms</span>
          <span className="kpi-tile__delta kpi-tile__delta--positive">
            <Timer size={12} /> &lt; 5s target
          </span>
          <span className="kpi-tile__tag">[Measured in Demo]</span>
        </div>
      </div>

      {/* Simulated Bar Chart */}
      <div className="card">
        <div className="card__header">
          <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <BarChart3 size={14} /> Weekly Block Efficiency Trend
          </h4>
          <span className="tag--simulation">[Simulation Projection]</span>
        </div>
        <div className="card__body" style={{ padding: 'var(--space-6)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end', height: 200 }}>
            {[
              { label: 'W1', value: 52, color: 'var(--surface-3)' },
              { label: 'W2', value: 58, color: 'var(--surface-3)' },
              { label: 'W3', value: 61, color: 'var(--surface-3)' },
              { label: 'W4', value: 65, color: 'var(--crimson-violet)' },
              { label: 'W5', value: 68, color: 'var(--crimson-violet)' },
              { label: 'W6', value: 72, color: 'var(--status-approved)' },
              { label: 'W7', value: 68, color: 'var(--status-approved)' },
            ].map((w, i) => (
              <div key={w.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  {w.value}%
                </span>
                <div style={{
                  width: '100%', borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
                  height: `${w.value * 2}px`, background: w.color,
                  transition: 'height 0.6s cubic-bezier(0.16,1,0.3,1)',
                  animationDelay: `${i * 100}ms`,
                }} />
                <span style={{ fontSize: '10px', opacity: 0.5, fontWeight: 600 }}>{w.label}</span>
              </div>
            ))}
          </div>
          <div className="divider" />
          <p style={{ fontSize: 'var(--text-xs)', opacity: 0.5, textAlign: 'center' }}>
            Joint Block Ratio (%) — Week-over-week trend showing adoption of coordinated possessions
          </p>
        </div>
      </div>
    </div>
  );
}
