import { useState } from 'react';
import { AlertTriangle, Clock, ArrowRight, CheckCircle, Zap, XCircle } from 'lucide-react';
import { GOLDEN_DISRUPTION, GOLDEN_RECOVERY_OPTIONS, GOLDEN_JOINT_BLOCK } from '../data/seedData';

const OPTION_ICONS: Record<string, React.ReactNode> = {
  compress: <Zap size={16} />,
  shift: <ArrowRight size={16} />,
  split: <Clock size={16} />,
  cancel: <XCircle size={16} />,
};

const OPTION_COLORS: Record<string, string> = {
  compress: 'var(--status-approved)',
  shift: 'var(--status-info)',
  split: 'var(--status-proposed)',
  cancel: 'var(--status-critical)',
};

export default function DisruptionPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [injected, setInjected] = useState(false);

  return (
    <div className="animate-fade-in-up">
      <div className="page-header">
        <div className="page-header__breadcrumb">
          <span>Governance</span>
          <span className="page-header__breadcrumb-sep">/</span>
          <span>Disruption Recovery</span>
        </div>
        <h1 className="page-header__title">Adaptive Disruption Recovery</h1>
        <p className="page-header__subtitle">
          Inject disruptions and trigger instant CP-SAT re-solve for non-cancel recovery options.
        </p>
      </div>

      {/* Inject Disruption */}
      {!injected ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          <AlertTriangle size={48} style={{ color: 'var(--status-proposed)', marginBottom: 'var(--space-3)' }} />
          <h3 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
            Simulate Disruption
          </h3>
          <p style={{ fontSize: 'var(--text-sm)', opacity: 0.6, marginBottom: 'var(--space-4)', maxWidth: 500, margin: '0 auto var(--space-4)' }}>
            Inject a 40-minute freight train delay scenario during the active joint block to test the recovery engine.
          </p>
          <button className="btn btn--primary btn--lg" onClick={() => setInjected(true)}>
            <AlertTriangle size={16} /> Inject Disruption
          </button>
        </div>
      ) : (
        <>
          {/* Disruption Alert Card */}
          <div className="card" style={{ borderLeft: '4px solid var(--status-critical)', marginBottom: 'var(--space-4)', animation: 'fadeInLeft 0.4s ease both' }}>
            <div className="card__body" style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{
                width: 48, height: 48, borderRadius: 'var(--radius-lg)', background: 'var(--status-critical-bg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <AlertTriangle size={24} style={{ color: 'var(--status-critical)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ fontSize: 'var(--text-base)', fontWeight: 700, marginBottom: 'var(--space-1)' }}>
                  ⚠️ Disruption Detected — {GOLDEN_DISRUPTION.type.replace('_', ' ').toUpperCase()}
                </h4>
                <p style={{ fontSize: 'var(--text-sm)', opacity: 0.7, marginBottom: 'var(--space-2)' }}>
                  {GOLDEN_DISRUPTION.description}
                </p>
                <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: 'var(--text-xs)', opacity: 0.5 }}>
                  <span>📍 KM {GOLDEN_DISRUPTION.affected_chainage_km}</span>
                  <span>⏱️ +{GOLDEN_DISRUPTION.delay_minutes} min</span>
                  <span>🕐 {new Date(GOLDEN_DISRUPTION.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
              <span className="badge badge--critical">ACTIVE</span>
            </div>
          </div>

          {/* Affected Block */}
          <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="card__header">
              <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>Affected Block: {GOLDEN_JOINT_BLOCK.id}</h4>
              <span className="badge badge--proposed">Recalculating...</span>
            </div>
            <div className="card__body">
              <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', fontSize: 'var(--text-sm)' }}>
                <span>KM {GOLDEN_JOINT_BLOCK.chainage_start_km}–{GOLDEN_JOINT_BLOCK.chainage_end_km}</span>
                <span>01:05–04:15</span>
                <span>{GOLDEN_JOINT_BLOCK.duration_min} min</span>
              </div>
            </div>
          </div>

          {/* Recovery Options */}
          <h3 className="dashboard__section-title">AI Recovery Options (ranked by feasibility)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {GOLDEN_RECOVERY_OPTIONS.map((opt, i) => (
              <div
                key={opt.option}
                className={`card ${selected === opt.option ? '' : ''}`}
                style={{
                  borderLeft: `4px solid ${OPTION_COLORS[opt.option]}`,
                  cursor: 'pointer',
                  animation: `fadeInUp 0.4s ease ${i * 100}ms both`,
                  outline: selected === opt.option ? `2px solid ${OPTION_COLORS[opt.option]}` : 'none',
                }}
                onClick={() => setSelected(opt.option)}
              >
                <div className="card__body" style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 'var(--radius-lg)',
                    background: `${OPTION_COLORS[opt.option]}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: OPTION_COLORS[opt.option], flexShrink: 0,
                  }}>
                    {OPTION_ICONS[opt.option]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                      <h4 style={{ fontSize: 'var(--text-base)', fontWeight: 700 }}>{opt.label}</h4>
                      {i === 0 && <span className="badge badge--approved">Recommended</span>}
                    </div>
                    <p style={{ fontSize: 'var(--text-sm)', opacity: 0.6, marginBottom: 'var(--space-2)' }}>
                      {opt.description}
                    </p>
                    <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', fontSize: 'var(--text-xs)', opacity: 0.5 }}>
                      {opt.new_start_time && (
                        <span>🕐 {opt.new_start_time.split('T')[1].slice(0, 5)}–{opt.new_end_time?.split('T')[1].slice(0, 5)}</span>
                      )}
                      {opt.new_duration_min && <span>⏱️ {opt.new_duration_min} min</span>}
                      <span>👤 0 passenger delay</span>
                      <span>🚛 {opt.freight_delay_min} min freight delay</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{
                      fontSize: 'var(--text-xl)', fontWeight: 800, color: OPTION_COLORS[opt.option],
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {opt.feasibility_score}%
                    </div>
                    <div style={{ fontSize: '10px', opacity: 0.5 }}>Feasibility</div>
                    <div style={{
                      fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', opacity: 0.4,
                      marginTop: '4px',
                    }}>
                      {opt.solver_time_ms}ms solve
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Apply Button */}
          {selected && (
            <div style={{ marginTop: 'var(--space-4)', textAlign: 'center', animation: 'fadeInUp 0.3s ease both' }}>
              <button className="btn btn--approve btn--lg">
                <CheckCircle size={16} /> Apply "{GOLDEN_RECOVERY_OPTIONS.find(o => o.option === selected)?.label}" Recovery
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
