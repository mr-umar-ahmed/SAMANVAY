import { MapPin, Layers, Wifi } from 'lucide-react';
import { STATIONS } from '../data/seedData';

export default function CorridorPage() {
  return (
    <div className="animate-fade-in-up">
      <div className="page-header">
        <div className="page-header__breadcrumb">
          <span>Overview</span>
          <span className="page-header__breadcrumb-sep">/</span>
          <span>Corridor Digital Twin</span>
        </div>
        <h1 className="page-header__title">Digital Twin — LRS Corridor</h1>
        <p className="page-header__subtitle">
          New Delhi → Agra Cantt • 195 km • 9 stations • NetworkX directed graph with geo↔chainage bi-directional resolution.
        </p>
      </div>

      {/* Schematic Map */}
      <div className="card" style={{ marginBottom: 'var(--space-4)', overflow: 'hidden' }}>
        <div className="card__header">
          <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <MapPin size={14} /> Corridor Schematic
          </h4>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <span className="badge badge--civil">Civil</span>
            <span className="badge badge--snt">S&T</span>
            <span className="badge badge--trd">TRD</span>
          </div>
        </div>
        <div className="card__body" style={{ padding: 'var(--space-6)', overflowX: 'auto' }}>
          {/* Linear Schematic */}
          <div style={{ position: 'relative', minWidth: 600, height: 120 }}>
            {/* Track Line */}
            <div style={{
              position: 'absolute', top: 45, left: 20, right: 20, height: 4,
              background: 'var(--deep-espresso)', borderRadius: 2,
            }} />
            <div style={{
              position: 'absolute', top: 53, left: 20, right: 20, height: 4,
              background: 'var(--deep-espresso)', borderRadius: 2, opacity: 0.3,
            }} />

            {/* Stations */}
            {STATIONS.map((st, i) => {
              const pct = (st.chainage_km / 195) * 100;
              return (
                <div
                  key={st.id}
                  style={{
                    position: 'absolute',
                    left: `calc(${pct}% + 10px)`,
                    top: 20,
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    animation: `fadeInUp 0.4s ease ${i * 80}ms both`,
                  }}
                >
                  <span style={{
                    fontSize: '9px', fontWeight: 700, whiteSpace: 'nowrap',
                    transform: i % 2 === 0 ? 'none' : 'translateY(68px)',
                  }}>
                    {st.code}
                  </span>
                  <div style={{
                    width: st.hasInterlocking ? 14 : 8,
                    height: st.hasInterlocking ? 14 : 8,
                    borderRadius: '50%',
                    background: st.hasInterlocking ? 'var(--deep-espresso)' : 'var(--surface-3)',
                    border: '2px solid var(--deep-espresso)',
                    marginTop: i % 2 === 0 ? 4 : 0,
                  }} />
                  <span style={{
                    fontSize: '8px', opacity: 0.4, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
                    transform: i % 2 !== 0 ? 'none' : 'translateY(4px)',
                  }}>
                    KM {st.chainage_km}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Station Table */}
      <div className="card">
        <div className="card__header">
          <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>Station & Infrastructure Register</h4>
        </div>
        <div className="card__body" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr style={{ borderBottom: 'var(--border-medium)' }}>
                <th style={{ textAlign: 'left', padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.5 }}>Code</th>
                <th style={{ textAlign: 'left', padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.5 }}>Station</th>
                <th style={{ textAlign: 'right', padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.5 }}>KM</th>
                <th style={{ textAlign: 'center', padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.5 }}>Lines</th>
                <th style={{ textAlign: 'center', padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.5 }}>Features</th>
              </tr>
            </thead>
            <tbody>
              {STATIONS.map(st => (
                <tr key={st.id} style={{ borderBottom: 'var(--border-subtle)' }}>
                  <td style={{ padding: 'var(--space-2) var(--space-3)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{st.code}</td>
                  <td style={{ padding: 'var(--space-2) var(--space-3)' }}>{st.name}</td>
                  <td style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{st.chainage_km}</td>
                  <td style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'center' }}>{st.lines}</td>
                  <td style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'center', flexWrap: 'wrap' }}>
                      {st.hasInterlocking && <span className="badge badge--snt" style={{ fontSize: '8px' }}>ILK</span>}
                      {st.hasLC && <span className="badge badge--proposed" style={{ fontSize: '8px' }}>LC</span>}
                      {st.hasNeutralSection && <span className="badge badge--trd" style={{ fontSize: '8px' }}>NS</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
