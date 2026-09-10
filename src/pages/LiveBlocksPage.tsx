import { useState, useEffect } from 'react';
import { Radio, Clock, Shield, AlertTriangle, CheckCircle } from 'lucide-react';
import { GOLDEN_JOINT_BLOCK } from '../data/seedData';
import type { BlockStatus } from '../types';

const STATUSES: { key: BlockStatus; label: string; color: string; icon: React.ReactNode }[] = [
  { key: 'planned', label: 'Planned', color: 'var(--status-info)', icon: <Clock size={14} /> },
  { key: 'protected', label: 'Protected', color: 'var(--status-proposed)', icon: <Shield size={14} /> },
  { key: 'in_progress', label: 'In Progress', color: 'var(--status-approved)', icon: <Radio size={14} /> },
  { key: 'clearing', label: 'Clearing', color: 'var(--status-clearing)', icon: <AlertTriangle size={14} /> },
  { key: 'closed', label: 'Closed', color: 'var(--deep-espresso)', icon: <CheckCircle size={14} /> },
];

export default function LiveBlocksPage() {
  const [currentStatus, setCurrentStatus] = useState<BlockStatus>('in_progress');
  const [countdown, setCountdown] = useState(45);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : 0));
    }, 60000); // every minute in real usage; demo slowed down
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="animate-fade-in-up">
      <div className="page-header">
        <div className="page-header__breadcrumb">
          <span>Governance</span>
          <span className="page-header__breadcrumb-sep">/</span>
          <span>Live Block Board</span>
        </div>
        <h1 className="page-header__title">Live Block Execution Board</h1>
        <p className="page-header__subtitle">
          Real-time block state machine with T-45 / T-15 clearance countdown warnings.
        </p>
      </div>

      {/* Status Pipeline */}
      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="card__body" style={{ padding: 'var(--space-6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
            {STATUSES.map((s, i) => {
              const isCurrent = s.key === currentStatus;
              const isPast = STATUSES.findIndex(x => x.key === currentStatus) > i;
              return (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: 1, minWidth: 100 }}>
                  <button
                    onClick={() => setCurrentStatus(s.key)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                      padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', flex: 1,
                      background: isCurrent ? `${s.color}15` : 'transparent',
                      border: isCurrent ? `2px solid ${s.color}` : '2px solid transparent',
                      cursor: 'pointer', transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: isPast || isCurrent ? s.color : 'var(--surface-2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: isPast || isCurrent ? 'white' : 'var(--espresso-light)',
                      transition: 'all 0.3s ease',
                    }}>
                      {s.icon}
                    </div>
                    <span style={{
                      fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.08em', color: isCurrent ? s.color : 'var(--espresso-light)',
                      opacity: isCurrent ? 1 : 0.5,
                    }}>
                      {s.label}
                    </span>
                  </button>
                  {i < STATUSES.length - 1 && (
                    <div style={{
                      width: 20, height: 2, background: isPast ? 'var(--deep-espresso)' : 'var(--surface-3)',
                      flexShrink: 0, borderRadius: 1,
                    }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid-2col">
        {/* Block Details */}
        <div className="card card--espresso">
          <div className="card__body" style={{ padding: 'var(--space-6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              <Radio size={16} />
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Active Block
              </span>
            </div>
            <h3 style={{ fontSize: 'var(--text-xl)', fontWeight: 800, marginBottom: 'var(--space-4)', color: 'var(--ivory-hearth)' }}>
              {GOLDEN_JOINT_BLOCK.id}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
              <div>
                <div style={{ fontSize: '10px', opacity: 0.5, textTransform: 'uppercase' }}>Location</div>
                <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>KM {GOLDEN_JOINT_BLOCK.chainage_start_km}–{GOLDEN_JOINT_BLOCK.chainage_end_km}</div>
              </div>
              <div>
                <div style={{ fontSize: '10px', opacity: 0.5, textTransform: 'uppercase' }}>Window</div>
                <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>01:05 – 04:15</div>
              </div>
              <div>
                <div style={{ fontSize: '10px', opacity: 0.5, textTransform: 'uppercase' }}>Duration</div>
                <div style={{ fontWeight: 600 }}>{GOLDEN_JOINT_BLOCK.duration_min} min</div>
              </div>
              <div>
                <div style={{ fontSize: '10px', opacity: 0.5, textTransform: 'uppercase' }}>Departments</div>
                <div style={{ display: 'flex', gap: '4px', marginTop: 4 }}>
                  <span className="badge badge--civil" style={{ fontSize: '8px' }}>Civil</span>
                  <span className="badge badge--snt" style={{ fontSize: '8px' }}>S&T</span>
                  <span className="badge badge--trd" style={{ fontSize: '8px' }}>TRD</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Countdown */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
            <div style={{
              width: 120, height: 120, borderRadius: '50%', margin: '0 auto var(--space-3)',
              border: `4px solid ${countdown <= 15 ? 'var(--status-critical)' : countdown <= 45 ? 'var(--status-proposed)' : 'var(--status-approved)'}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              animation: countdown <= 15 ? 'countdownPulse 1.5s ease-in-out infinite' : 'none',
            }}>
              <span style={{
                fontSize: 'var(--text-3xl)', fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                color: countdown <= 15 ? 'var(--status-critical)' : 'var(--deep-espresso)',
              }}>
                T-{countdown}
              </span>
              <span style={{ fontSize: '10px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                minutes
              </span>
            </div>
            <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: countdown <= 15 ? 'var(--status-critical)' : 'var(--espresso-light)' }}>
              {countdown <= 15 ? '⚠️ URGENT: Block ending soon!' : countdown <= 45 ? '🔔 T-45 clearance warning' : 'Clearance countdown'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
