import { Layers, ArrowRight, Clock, MinusCircle, CheckCircle, Zap, Shield } from 'lucide-react';
import { GOLDEN_DEMANDS, GOLDEN_JOINT_BLOCK, BUNDLING_COMPARISON } from '../data/seedData';

export default function BundlerPage() {
  const { before, after } = BUNDLING_COMPARISON;

  return (
    <div className="animate-fade-in-up">
      <div className="page-header">
        <div className="page-header__breadcrumb">
          <span>Optimisation</span>
          <span className="page-header__breadcrumb-sep">/</span>
          <span>Joint Shadow Bundler</span>
        </div>
        <h1 className="page-header__title">Joint Shadow Block Bundler</h1>
        <p className="page-header__subtitle">
          Spatial proximity detection groups overlapping demands into coordinated joint shadow blocks.
        </p>
      </div>

      {/* Input Demands */}
      <h3 className="dashboard__section-title">Input Demands (3 Separate Requests)</h3>
      <div className="grid-3col" style={{ marginBottom: 'var(--space-6)' }}>
        {GOLDEN_DEMANDS.map((d, i) => (
          <div
            key={d.id}
            className="card animate-fade-in-up"
            style={{
              animationDelay: `${i * 100}ms`,
              borderLeft: `4px solid ${d.department === 'Civil' ? 'var(--civil-primary)' : d.department === 'S&T' ? 'var(--snt-primary)' : 'var(--trd-primary)'}`,
            }}
          >
            <div className="card__body">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                <span className={`badge ${d.department === 'Civil' ? 'badge--civil' : d.department === 'S&T' ? 'badge--snt' : 'badge--trd'}`}>
                  {d.department}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', opacity: 0.4 }}>{d.id}</span>
              </div>
              <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                {d.title.split('—')[0].trim()}
              </h4>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--espresso-light)', opacity: 0.6, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span>📍 KM {d.chainage_start_km}–{d.chainage_end_km} {d.line}</span>
                <span>⏱️ {d.estimated_duration_min} min</span>
                <span>🔧 {d.work_type}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bundling Arrow */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: 'var(--space-4) 0' }}>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)',
          padding: 'var(--space-4)', background: 'var(--ivory-hearth)', borderRadius: 'var(--radius-xl)',
          border: 'var(--border-medium)',
        }}>
          <Layers size={24} style={{ color: 'var(--crimson-violet)' }} />
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Bundler Engine
          </span>
          <span style={{ fontSize: '10px', opacity: 0.5 }}>≤ 500m proximity • shared protection envelope</span>
          <ArrowRight size={18} style={{ transform: 'rotate(90deg)', color: 'var(--crimson-violet)' }} />
        </div>
      </div>

      {/* Output: Joint Block */}
      <div className="card card--espresso animate-scale-in" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card__body" style={{ padding: 'var(--space-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <span className="badge badge--petal">{GOLDEN_JOINT_BLOCK.id}</span>
            <span className="badge badge--civil">Civil</span>
            <span className="badge badge--snt">S&T</span>
            <span className="badge badge--trd">TRD</span>
          </div>
          <h3 style={{ fontSize: 'var(--text-xl)', fontWeight: 800, marginBottom: 'var(--space-2)', color: 'var(--ivory-hearth)' }}>
            Joint Shadow Block Created
          </h3>
          <p style={{ fontSize: 'var(--text-sm)', opacity: 0.6, marginBottom: 'var(--space-4)', color: 'var(--ivory-hearth)' }}>
            {GOLDEN_JOINT_BLOCK.solver_rationale}
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.5 }}>Location</div>
              <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                KM {GOLDEN_JOINT_BLOCK.chainage_start_km}–{GOLDEN_JOINT_BLOCK.chainage_end_km} {GOLDEN_JOINT_BLOCK.line}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.5 }}>Window</div>
              <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>01:05 – 04:15</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.5 }}>Duration</div>
              <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{GOLDEN_JOINT_BLOCK.duration_min} min</div>
            </div>
          </div>
        </div>
      </div>

      {/* Before / After Comparison */}
      <h3 className="dashboard__section-title">Before vs After Comparison</h3>
      <div className="grid-2col">
        {/* Before */}
        <div className="card" style={{ borderTop: '4px solid var(--status-critical)' }}>
          <div className="card__header">
            <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <MinusCircle size={14} style={{ color: 'var(--status-critical)' }} />
              Before (Fragmented)
            </h4>
          </div>
          <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-sm)' }}>Line Closures</span>
              <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--status-critical)' }}>{before.total_closures}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-sm)' }}>Total Block Minutes</span>
              <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--status-critical)' }}>{before.total_block_minutes} min</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-sm)' }}>Setup Overhead</span>
              <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--status-critical)' }}>{before.setup_overhead_min} min</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-sm)' }}>Freight Delays</span>
              <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--status-critical)' }}>{before.freight_delays_min} min</span>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', opacity: 0.5, borderTop: 'var(--border-subtle)', paddingTop: 'var(--space-2)' }}>
              {before.description}
            </p>
          </div>
        </div>

        {/* After */}
        <div className="card" style={{ borderTop: '4px solid var(--status-approved)' }}>
          <div className="card__header">
            <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <CheckCircle size={14} style={{ color: 'var(--status-approved)' }} />
              After (Joint Shadow Block)
            </h4>
          </div>
          <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-sm)' }}>Line Closures</span>
              <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--status-approved)' }}>{after.total_closures}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-sm)' }}>Total Block Minutes</span>
              <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--status-approved)' }}>{after.total_block_minutes} min</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-sm)' }}>Setup Overhead</span>
              <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--status-approved)' }}>{after.setup_overhead_min} min</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-sm)' }}>Freight Delays</span>
              <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--status-approved)' }}>{after.freight_delays_min} min</span>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', opacity: 0.5, borderTop: 'var(--border-subtle)', paddingTop: 'var(--space-2)' }}>
              {after.description}
            </p>
          </div>
        </div>
      </div>

      {/* Savings Summary */}
      <div style={{ marginTop: 'var(--space-4)' }}>
        <div className="grid-kpi">
          <div className="kpi-tile" style={{ background: 'var(--status-approved-bg)' }}>
            <span className="kpi-tile__label">Closures Saved</span>
            <span className="kpi-tile__value" style={{ color: 'var(--status-approved)' }}>
              {before.total_closures - after.total_closures}
            </span>
            <span className="kpi-tile__tag">[Measured in Demo]</span>
          </div>
          <div className="kpi-tile" style={{ background: 'var(--status-approved-bg)' }}>
            <span className="kpi-tile__label">Minutes Saved</span>
            <span className="kpi-tile__value" style={{ color: 'var(--status-approved)' }}>
              {(before.total_block_minutes + before.setup_overhead_min) - (after.total_block_minutes + after.setup_overhead_min)}
            </span>
            <span className="kpi-tile__tag">[Measured in Demo]</span>
          </div>
          <div className="kpi-tile" style={{ background: 'var(--status-approved-bg)' }}>
            <span className="kpi-tile__label">Passenger Delays</span>
            <span className="kpi-tile__value" style={{ color: 'var(--status-approved)' }}>0 min</span>
            <span className="kpi-tile__tag">[Measured in Demo]</span>
          </div>
          <div className="kpi-tile" style={{ background: 'var(--status-approved-bg)' }}>
            <span className="kpi-tile__label">Freight Impact</span>
            <span className="kpi-tile__value" style={{ color: 'var(--status-approved)' }}>
              {after.freight_delays_min} min
            </span>
            <span className="kpi-tile__tag">[Measured in Demo]</span>
          </div>
        </div>
      </div>
    </div>
  );
}
