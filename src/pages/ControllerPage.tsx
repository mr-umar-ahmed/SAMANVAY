import { useState } from 'react';
import { Shield, CheckCircle, XCircle, Edit3, Clock, AlertTriangle, Train } from 'lucide-react';
import { GOLDEN_JOINT_BLOCK, GOLDEN_DEMANDS } from '../data/seedData';
import type { ControllerAction } from '../types';

export default function ControllerPage() {
  const [action, setAction] = useState<ControllerAction | null>(null);
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    setSubmitted(true);
  };

  return (
    <div className="animate-fade-in-up">
      <div className="page-header">
        <div className="page-header__breadcrumb">
          <span>Governance</span>
          <span className="page-header__breadcrumb-sep">/</span>
          <span>Controller Console</span>
        </div>
        <h1 className="page-header__title">Section Controller Console</h1>
        <p className="page-header__subtitle">
          Review, modify, and approve/reject block proposals. Every action is immutably audit-logged.
        </p>
      </div>

      <div className="grid-2col">
        {/* Block Proposal */}
        <div>
          <div className="card card--espresso" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="card__body" style={{ padding: 'var(--space-6)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                <Shield size={16} />
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Block Proposal for Review
                </span>
              </div>
              <h3 style={{ fontSize: 'var(--text-xl)', fontWeight: 800, marginBottom: 'var(--space-3)', color: 'var(--ivory-hearth)' }}>
                {GOLDEN_JOINT_BLOCK.id}
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                <div>
                  <div style={{ fontSize: '10px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Location</div>
                  <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
                    KM {GOLDEN_JOINT_BLOCK.chainage_start_km}–{GOLDEN_JOINT_BLOCK.chainage_end_km}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Line</div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{GOLDEN_JOINT_BLOCK.line}</div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Window</div>
                  <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>01:05 – 04:15</div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Duration</div>
                  <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>{GOLDEN_JOINT_BLOCK.duration_min} min</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <span className="badge badge--civil">Civil</span>
                <span className="badge badge--snt">S&T</span>
                <span className="badge badge--trd">TRD</span>
                <span className="badge badge--petal">Power Block Required</span>
              </div>
            </div>
          </div>

          {/* Included Demands */}
          <h3 className="dashboard__section-title">Included Demands</h3>
          {GOLDEN_DEMANDS.map((d, i) => (
            <div key={d.id} className="card" style={{ marginBottom: 'var(--space-2)', borderLeft: `3px solid ${d.department === 'Civil' ? 'var(--civil-primary)' : d.department === 'S&T' ? 'var(--snt-primary)' : 'var(--trd-primary)'}` }}>
              <div className="card__body" style={{ padding: 'var(--space-3) var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span className={`badge ${d.department === 'Civil' ? 'badge--civil' : d.department === 'S&T' ? 'badge--snt' : 'badge--trd'}`} style={{ fontSize: '9px' }}>{d.department}</span>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{d.title.split('—')[0].trim()}</span>
                </div>
                <div style={{ fontSize: 'var(--text-xs)', opacity: 0.5, marginTop: '4px' }}>
                  ARCI: {d.arci_score} • {d.estimated_duration_min} min • {d.work_type}
                </div>
              </div>
            </div>
          ))}

          {/* Train Impact */}
          <h3 className="dashboard__section-title" style={{ marginTop: 'var(--space-4)' }}>Affected Trains</h3>
          {GOLDEN_JOINT_BLOCK.affected_trains.map(t => (
            <div key={t.train_id} className="card" style={{ marginBottom: 'var(--space-2)' }}>
              <div className="card__body" style={{ padding: 'var(--space-3) var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <Train size={16} style={{ color: '#F4A460', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{t.train_number} — {t.train_name}</div>
                  <div style={{ fontSize: 'var(--text-xs)', opacity: 0.5 }}>Impact: {t.impact_type} • {t.delay_minutes} min delay</div>
                </div>
                <span className={`badge ${t.delay_minutes > 10 ? 'badge--critical' : 'badge--proposed'}`}>
                  {t.delay_minutes} min
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Right: Action Panel */}
        <div>
          <div className="card" style={{ position: 'sticky', top: 'calc(var(--navbar-height) + var(--space-4))' }}>
            <div className="card__header">
              <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>Controller Decision</h4>
            </div>
            <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {submitted ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
                  <CheckCircle size={48} style={{ color: 'var(--status-approved)', marginBottom: 'var(--space-3)' }} />
                  <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
                    {action === 'approve' ? 'Block Approved' : action === 'modify_approve' ? 'Modified & Approved' : 'Block Rejected'}
                  </h3>
                  <p style={{ fontSize: 'var(--text-sm)', opacity: 0.6 }}>
                    Decision logged to immutable audit trail. Form T/409B caution order generated.
                  </p>
                  <span className="tag--measured" style={{ marginTop: 'var(--space-2)', display: 'inline-block' }}>
                    Audit Hash: e7b6a2c5d9f1
                  </span>
                </div>
              ) : (
                <>
                  {/* Action Buttons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <button
                      className={`btn ${action === 'approve' ? 'btn--approve' : 'btn--secondary'} btn--lg`}
                      onClick={() => setAction('approve')}
                      style={{ justifyContent: 'flex-start' }}
                    >
                      <CheckCircle size={16} /> Approve Block
                    </button>
                    <button
                      className={`btn ${action === 'modify_approve' ? 'btn--primary' : 'btn--secondary'} btn--lg`}
                      onClick={() => setAction('modify_approve')}
                      style={{ justifyContent: 'flex-start' }}
                    >
                      <Edit3 size={16} /> Modify & Approve
                    </button>
                    <button
                      className={`btn ${action === 'reject' ? 'btn--reject' : 'btn--secondary'} btn--lg`}
                      onClick={() => setAction('reject')}
                      style={{ justifyContent: 'flex-start' }}
                    >
                      <XCircle size={16} /> Reject Block
                    </button>
                  </div>

                  {action && (
                    <div style={{ animation: 'fadeInUp 0.3s ease both' }}>
                      <div className="divider" />
                      <label className="label">
                        {action === 'reject' ? 'Rejection Reason (Required)' : 'Controller Notes'}
                      </label>
                      <textarea
                        className="input"
                        rows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={action === 'modify_approve' ? 'e.g. End time modified to 04:00...' : action === 'reject' ? 'Reason code required...' : 'Optional notes...'}
                        style={{ resize: 'vertical' }}
                      />
                      <button
                        className="btn btn--primary btn--lg"
                        style={{ width: '100%', marginTop: 'var(--space-3)' }}
                        onClick={handleSubmit}
                        disabled={action === 'reject' && !notes.trim()}
                      >
                        Confirm Decision
                      </button>
                    </div>
                  )}

                  {/* Safety Notice */}
                  <div style={{
                    padding: 'var(--space-3)',
                    background: 'var(--status-proposed-bg)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--text-xs)',
                    display: 'flex',
                    gap: 'var(--space-2)',
                    alignItems: 'flex-start',
                  }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0, color: 'var(--status-proposed)', marginTop: 2 }} />
                    <span>
                      <strong>Human-in-the-Loop:</strong> This system recommends but never autonomously dispatches.
                      Your decision is final and will be audit-logged with an immutable hash chain.
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
