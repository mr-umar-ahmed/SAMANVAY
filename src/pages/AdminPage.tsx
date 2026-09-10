import { Shield, Hash, User } from 'lucide-react';
import { DEMO_AUDIT_LOG, DEMO_USERS } from '../data/seedData';
import { ROLE_LABELS } from '../types';

export default function AdminPage() {
  return (
    <div className="animate-fade-in-up">
      <div className="page-header">
        <div className="page-header__breadcrumb">
          <span>Admin</span>
          <span className="page-header__breadcrumb-sep">/</span>
          <span>Admin & Audit</span>
        </div>
        <h1 className="page-header__title">Admin Console & Audit Trail</h1>
        <p className="page-header__subtitle">
          RBAC management, append-only hash-chained audit log, and configurable safety rules.
        </p>
      </div>

      <div className="grid-2col">
        {/* RBAC User Management */}
        <div className="card">
          <div className="card__header">
            <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <User size={14} /> RBAC — Active Users
            </h4>
          </div>
          <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {DEMO_USERS.map(user => (
              <div key={user.id} style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)',
                border: 'var(--border-subtle)',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 'var(--radius-full)',
                  background: 'var(--crimson-violet)', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 'var(--text-xs)', fontWeight: 700, flexShrink: 0,
                }}>
                  {user.name.split(' ').map((n: string) => n[0]).join('')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{user.name}</div>
                  <div style={{ fontSize: '10px', opacity: 0.5 }}>{user.designation}</div>
                </div>
                <span className="badge badge--violet" style={{ fontSize: '9px' }}>
                  {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Safety Rules */}
        <div className="card">
          <div className="card__header">
            <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Shield size={14} /> Safety Constraints (Hard)
            </h4>
          </div>
          <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
            {[
              'No block may overlap with any passenger train path',
              'Minimum 10-min protection buffer before/after blocks',
              'OHE elementary sections must be fully isolated before work',
              'Interlocking points must be locked in normal position',
              'Crew shift limit: max 8 hours continuous',
              'Safety criticality = 1.0 forces ARCI ≥ 90',
              'Block-bursting prevention: auto-alert at T-45 and T-15',
              'All controller decisions require immutable audit hash',
            ].map((rule, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-3)',
                background: i % 2 === 0 ? 'var(--surface-1)' : 'transparent',
                borderRadius: 'var(--radius-sm)',
              }}>
                <Shield size={12} style={{ color: 'var(--status-approved)', marginTop: 2, flexShrink: 0 }} />
                <span>{rule}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Audit Trail */}
      <h3 className="dashboard__section-title" style={{ marginTop: 'var(--space-6)' }}>Immutable Audit Trail</h3>
      <div className="card">
        <div className="card__body" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr style={{ borderBottom: 'var(--border-medium)' }}>
                {['Timestamp', 'User', 'Role', 'Action', 'Entity', 'Hash'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left', padding: 'var(--space-2) var(--space-3)',
                    fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.1em', opacity: 0.5,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DEMO_AUDIT_LOG.map(entry => {
                const user = DEMO_USERS.find(u => u.id === entry.user_id);
                return (
                  <tr key={entry.id} style={{ borderBottom: 'var(--border-subtle)' }}>
                    <td style={{ padding: 'var(--space-2) var(--space-3)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>
                      {new Date(entry.timestamp).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td style={{ padding: 'var(--space-2) var(--space-3)', fontWeight: 600 }}>{user?.name || entry.user_id}</td>
                    <td style={{ padding: 'var(--space-2) var(--space-3)' }}>
                      <span className="badge badge--violet" style={{ fontSize: '8px' }}>{ROLE_LABELS[entry.user_role as keyof typeof ROLE_LABELS]}</span>
                    </td>
                    <td style={{ padding: 'var(--space-2) var(--space-3)', fontWeight: 600 }}>
                      {entry.action.replace(/_/g, ' ')}
                    </td>
                    <td style={{ padding: 'var(--space-2) var(--space-3)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                      {entry.entity_id}
                    </td>
                    <td style={{ padding: 'var(--space-2) var(--space-3)' }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: '10px',
                        padding: '2px 6px', background: 'var(--surface-1)',
                        borderRadius: 'var(--radius-sm)',
                      }}>
                        <Hash size={8} style={{ display: 'inline', marginRight: 2 }} />{entry.hash}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
