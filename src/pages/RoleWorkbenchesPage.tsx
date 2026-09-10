import { useState } from 'react';
import {
  Users, Shield, Train, Wrench, Zap, Radio, Award,
  CheckCircle2, Activity, Clock, FileCheck
} from 'lucide-react';
import { soundFx } from '../utils/audio';

type RoleKey = 'controller' | 'den' | 'dee' | 'dste' | 'drm';

interface RoleMeta {
  key: RoleKey;
  code: string;
  titleEn: string;
  titleHi: string;
  dept: string;
  badge: string;
  icon: React.ReactNode;
  tagline: string;
}

const ROLES: RoleMeta[] = [
  {
    key: 'controller',
    code: 'COA-CTRL',
    titleEn: 'Section Controller Desk',
    titleHi: 'अनुभाग नियंत्रक डेस्क',
    dept: 'Operating (COA)',
    badge: 'Real-Time Dispatch',
    icon: <Train size={18} />,
    tagline: 'Active train paths, headway enforcement, dynamic block grant permits & freight diversion.',
  },
  {
    key: 'den',
    code: 'SR-DEN-HQ',
    titleEn: 'Sr. DEN (Track / Civil)',
    titleHi: 'वरिष्ठ मंडल इंजीनियर (ट्रैक)',
    dept: 'Engineering (TMS)',
    badge: 'Track Safety',
    icon: <Wrench size={18} />,
    tagline: 'USFD IMR removal queue, track tamping machines (CSM/BCM), deep screening & TGI compliance.',
  },
  {
    key: 'dee',
    code: 'SR-DEE-TRD',
    titleEn: 'Sr. DEE (Electrical TRD)',
    titleHi: 'वरिष्ठ मंडल विद्युत इंजीनियर',
    dept: 'Electrical TRD (TDMS)',
    badge: '25 kV Traction',
    icon: <Zap size={18} />,
    tagline: '25 kV OHE power isolations, tower wagon rosters, catenary contact wire wear & sub-station feeding.',
  },
  {
    key: 'dste',
    code: 'SR-DSTE-SIG',
    titleEn: 'Sr. DSTE (Signal & Telecom)',
    titleHi: 'वरिष्ठ मंडल सिग्नल इंजीनियर',
    dept: 'S&T (SMMS)',
    badge: 'Electronic Interlocking',
    icon: <Radio size={18} />,
    tagline: 'Interlocking disconnections (Form T/351), dual-detection axle counters, point machines & Kavach.',
  },
  {
    key: 'drm',
    code: 'DRM-EXEC',
    titleEn: 'DRM Executive Cockpit',
    titleHi: 'मंडल रेल प्रबंधक कॉकपिट',
    dept: 'Divisional Management',
    badge: 'P&L & Punctuality',
    icon: <Award size={18} />,
    tagline: 'Macro availability KPIs (97.6%), freight throughput velocity, inter-dept concurrence & ROI audit.',
  },
];

export default function RoleWorkbenchesPage() {
  const [activeRole, setActiveRole] = useState<RoleKey>('controller');

  const handleRoleSelect = (key: RoleKey) => {
    soundFx.playClick();
    setActiveRole(key);
  };

  const cur = ROLES.find((r) => r.key === activeRole) || ROLES[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1440px', margin: '0 auto', paddingBottom: '40px' }}>
      
      {/* Editorial Header */}
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '24px 28px',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-dark-olive)',
            color: 'var(--color-warm-stone)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Users size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: 700, margin: 0, color: '#FFFFFF' }}>
                Role Workbenches &bull; पद-आधारित कार्यक्षेत्र
              </h1>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                padding: '2px 8px',
                borderRadius: 'var(--radius-pill)',
                background: 'rgba(75, 101, 92, 0.3)',
                color: 'var(--color-warm-stone)',
                border: '1px solid var(--color-forest-green)'
              }}>
                [0] Module 10
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '0.86rem', color: 'rgba(255,255,255,0.7)' }}>
              Purpose-built operational consoles for Operating, Engineering, Electrical TRD, S&T, and Divisional Management.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.76rem',
            padding: '4px 10px',
            borderRadius: 'var(--radius-pill)',
            background: 'rgba(52, 57, 39, 0.8)',
            color: 'var(--color-warm-stone)',
            border: '1px solid var(--color-border)'
          }}>
            ROLE SWITCHER &bull; JPO COMPLIANT
          </span>
        </div>
      </div>

      {/* Role Navigation Strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '12px'
      }}>
        {ROLES.map((role) => {
          const isSelected = role.key === activeRole;
          return (
            <button
              key={role.key}
              onClick={() => handleRoleSelect(role.key)}
              style={{
                background: isSelected ? 'var(--color-dark-olive)' : 'var(--color-surface)',
                border: `1px solid ${isSelected ? 'var(--color-warm-stone)' : 'var(--color-border)'}`,
                borderRadius: 'var(--radius-md)',
                padding: '14px 16px',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                transition: 'all 0.18s ease',
                boxShadow: isSelected ? '0 4px 16px rgba(0,0,0,0.4)' : 'none'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--radius-sm)',
                  background: isSelected ? 'var(--color-forest-green)' : 'rgba(255,255,255,0.06)',
                  color: isSelected ? '#FFFFFF' : 'var(--color-warm-stone)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {role.icon}
                </div>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem',
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-pill)',
                  background: 'rgba(0,0,0,0.3)',
                  color: 'var(--color-warm-stone)'
                }}>
                  {role.code}
                </span>
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#FFFFFF' }}>{role.titleEn}</div>
                <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.6)' }}>{role.dept}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Role Banner / Active Workspace Context */}
      <div style={{
        background: 'linear-gradient(135deg, var(--color-surface) 0%, var(--color-dark-olive) 100%)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 20px',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-forest-green)',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {cur.icon}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#FFFFFF' }}>{cur.titleEn}</span>
              <span style={{ fontSize: '0.84rem', color: 'var(--color-warm-stone)' }}>({cur.titleHi})</span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)' }}>
              {cur.tagline}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            padding: '4px 10px',
            borderRadius: 'var(--radius-pill)',
            background: 'rgba(0,0,0,0.4)',
            color: 'var(--color-warm-stone)',
            border: '1px solid var(--color-border)'
          }}>
            {cur.badge}
          </span>
        </div>
      </div>

      {/* Role-Specific Workstation Body */}
      {activeRole === 'controller' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
          {/* Section Controller: Train Dispatch & Headway Control */}
          <div className="card--editorial" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111614', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Train size={18} color="var(--color-forest-green)" />
                Live Train Separation & Headway Enforcement
              </h3>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', background: 'var(--color-surface)', color: 'var(--color-warm-stone)', padding: '2px 8px', borderRadius: 'var(--radius-pill)' }}>
                COA FEED ACTIVE
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#555', margin: 0 }}>
              Live auto-headway calculation against Section 42 JPO rules. Shows required separation gaps to insert 120-min maintenance possession without stalling Rajdhani paths.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { train: '12004 NDLS–LKO Shatabdi', km: 'KM 118.2 DN', speed: '130 km/h', status: 'ON TIME', clearance: '+18.4 min gap behind' },
                { train: '12424 DBRT Rajdhani Exp', km: 'KM 94.6 DN', speed: '128 km/h', status: 'ON TIME', clearance: '+24.1 min gap behind' },
                { train: 'BOXNHL Freight (Coal)', km: 'KM 142.1 UP', speed: '62 km/h', status: 'DIVERTED', clearance: 'Held at ALJN Loop 2' },
                { train: '22436 Vande Bharat Exp', km: 'KM 62.8 DN', speed: '130 km/h', status: 'ON TIME', clearance: '+14.2m optimal slot' },
              ].map((t, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  background: 'var(--color-surface-light)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)'
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.84rem', color: '#111614' }}>{t.train}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: '#666' }}>{t.km} &bull; {t.speed}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-pill)',
                      background: t.status === 'DIVERTED' ? 'rgba(135, 45, 28, 0.15)' : 'rgba(75, 101, 92, 0.15)',
                      color: t.status === 'DIVERTED' ? 'var(--color-rust)' : 'var(--color-forest-green)'
                    }}>
                      {t.status}
                    </span>
                    <div style={{ fontSize: '0.72rem', color: '#777', marginTop: '2px' }}>{t.clearance}</div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => soundFx.playSuccess()}
              className="btn--forest"
              style={{ width: '100%', padding: '10px', fontSize: '0.84rem', marginTop: 'auto' }}
            >
              Issue Section 42 Holding Alert to Aligarh Jn
            </button>
          </div>

          {/* Section Controller: Direct Possession Authorization */}
          <div className="card--editorial" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111614', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={18} color="var(--color-forest-green)" />
                Block Grant & Traffic Power Isolation Desk
              </h3>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', background: 'rgba(75, 101, 92, 0.15)', color: 'var(--color-forest-green)', padding: '2px 8px', borderRadius: 'var(--radius-pill)', fontWeight: 600 }}>
                READY FOR GRANT
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#555', margin: 0 }}>
              Joint possession authorization desk for Block No. <strong>BLK-NCR-2026-0881</strong>. Grants synchronized Engineering track possession and Electrical 25 kV power block.
            </p>

            <div style={{ background: '#F8FAF6', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: '#666' }}>Designated Section:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#111614' }}>KRJ &ndash; SOM (UP Line, KM 118.2 to 124.8)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: '#666' }}>Possession Window:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#111614' }}>01:30 to 04:30 IST (180 mins)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: '#666' }}>Joint Departments:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-forest-green)' }}>Engineering (BCM 45) + OHE TRD (T-Wagon 12)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: '#666' }}>Safety Interlocking:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#111614' }}>Form T/351 Disconnection Verified</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
              <button
                onClick={() => soundFx.playSuccess()}
                className="btn--forest"
                style={{ flex: 1, padding: '10px', fontSize: '0.84rem' }}
              >
                Transmit Grant Signal (COA &rarr; Field)
              </button>
              <button
                onClick={() => soundFx.playClick()}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--color-rust)',
                  color: 'var(--color-rust)',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Defer (15m)
              </button>
            </div>
          </div>
        </div>
      )}

      {activeRole === 'den' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
          {/* Sr. DEN: USFD IMR Queue & Track Geometry */}
          <div className="card--editorial" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111614', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Wrench size={18} color="var(--color-rust)" />
                USFD IMR Removal & Flaw Remediation Queue
              </h3>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', background: 'rgba(135, 45, 28, 0.15)', color: 'var(--color-rust)', padding: '2px 8px', borderRadius: 'var(--radius-pill)', fontWeight: 700 }}>
                2 EMERGENCY
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#555', margin: 0 }}>
              Ultrasonic Flaw Detection (USFD) Immediate Removal (IMR) and Remedial Action (REM) defects imported from TMS.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { id: 'FLAW-NCR-092', km: 'KM 142.4 UP Rail Left', defect: 'Transverse Fissure (70% Head Area)', arci: '0.96', action: 'Jogoggled fishplate clamp within 24h' },
                { id: 'FLAW-NCR-104', km: 'KM 98.1 DN Rail Right', defect: 'Horizontal Split Web at weld', arci: '0.89', action: 'Rail piece replacement (6m cut)' },
                { id: 'FLAW-NCR-118', km: 'KM 167.3 UP Rail Left', defect: 'Gauge Corner Cracking (OBS)', arci: '0.74', action: 'Rail grinding profile pass scheduled' },
              ].map((f, idx) => (
                <div key={idx} style={{
                  padding: '12px 14px',
                  background: '#F8FAF6',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.82rem', color: '#111614' }}>{f.id}</span>
                      <span style={{ fontSize: '0.72rem', color: '#666' }}>&bull; {f.km}</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#444', marginTop: '2px' }}>{f.defect}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-forest-green)', fontWeight: 600, marginTop: '2px' }}>Action: {f.action}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.05rem', fontWeight: 800, color: Number(f.arci) >= 0.9 ? 'var(--color-rust)' : 'var(--color-forest-green)' }}>
                      {f.arci}
                    </div>
                    <span style={{ fontSize: '0.68rem', color: '#888' }}>ARCI Risk</span>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => soundFx.playSuccess()}
              className="btn--forest"
              style={{ width: '100%', padding: '10px', fontSize: '0.84rem', marginTop: 'auto' }}
            >
              Push IMR Slots to Weekly Optimizer Engine
            </button>
          </div>

          {/* Sr. DEN: Heavy Track Machine Deployment */}
          <div className="card--editorial" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111614', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={18} color="var(--color-forest-green)" />
                Heavy Track Machine Fleet Deployment
              </h3>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', background: 'var(--color-surface)', color: 'var(--color-warm-stone)', padding: '2px 8px', borderRadius: 'var(--radius-pill)' }}>
                3/4 DEPLOYED
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#555', margin: 0 }}>
              Track machines tracked via TMS telemetry. SAMANVAY maximizes machine output by bundling with TRD OHE wagons.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { machine: 'CSM 922 (Continuous Tamping)', loc: 'KM 118.2 &ndash; 124.8 UP', output: '1.8 km/hr target', fuel: '88% Tank', status: 'ACTIVE' },
                { machine: 'BCM 45 (Ballast Cleaning)', loc: 'KM 142.1 UP', output: '650 m3/hr ballast', fuel: '74% Tank', status: 'MOBILIZED' },
                { machine: 'DGS 188 (Dynamic Stabilizer)', loc: 'KM 118.2 &ndash; 124.8 UP', output: 'Follows CSM 922', fuel: '92% Tank', status: 'ACTIVE' },
                { machine: 'TRT (Track Renewal Train)', loc: 'Base Depot (GZB Yard)', output: '0.8 km sleeper/rail swap', fuel: '100% Ready', status: 'IDLE (RBP)' },
              ].map((m, idx) => (
                <div key={idx} style={{
                  padding: '12px 14px',
                  background: '#F8FAF6',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.84rem', color: '#111614' }}>{m.machine}</div>
                    <div style={{ fontSize: '0.74rem', color: '#666' }}>Location: <span dangerouslySetInnerHTML={{ __html: m.loc }} /></div>
                    <div style={{ fontSize: '0.72rem', color: '#888' }}>{m.output} &bull; Fuel: {m.fuel}</div>
                  </div>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-pill)',
                    background: m.status === 'ACTIVE' ? 'rgba(75, 101, 92, 0.15)' : 'rgba(168, 161, 116, 0.2)',
                    color: m.status === 'ACTIVE' ? 'var(--color-forest-green)' : '#555'
                  }}>
                    {m.status}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={() => soundFx.playClick()}
              className="btn--forest"
              style={{ width: '100%', padding: '10px', fontSize: '0.84rem', marginTop: 'auto' }}
            >
              Sync Machine Rosters with TDMS Tower Wagons
            </button>
          </div>
        </div>
      )}

      {activeRole === 'dee' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
          {/* Sr. DEE: 25 kV Catenary & Power Block Schedule */}
          <div className="card--editorial" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111614', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={18} color="var(--color-forest-green)" />
                25 kV Traction Power Block & Substation Isolations
              </h3>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', background: 'var(--color-surface)', color: 'var(--color-warm-stone)', padding: '2px 8px', borderRadius: 'var(--radius-pill)' }}>
                TDMS LIVE
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#555', margin: 0 }}>
              SCADA-controlled power isolations. Co-locating 25 kV shutdown with Engineering civil blocks eliminates independent power disruptions.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { sub: 'TSS Khurja (TSS-KRJ-01)', sector: 'Sub-Sector 14 (UP Line)', iso: 'ISO-214 Open', window: '01:30 - 04:30 IST', status: 'CO-LOCATED WITH DEN' },
                { sub: 'TSS Aligarh (TSS-ALJN-02)', sector: 'Sub-Sector 18 (DN Line)', iso: 'ISO-108 Closed', window: 'Standby / Feeding Adjacent', status: 'NORMAL FEED' },
                { sub: 'SP Somna (SP-SOM-01)', sector: 'Bridging Interrupter BM-301', iso: 'Closed (Fed via KRJ)', window: 'Full Loop Redundancy', status: 'INTERLOCKED' },
              ].map((s, idx) => (
                <div key={idx} style={{
                  padding: '12px 14px',
                  background: '#F8FAF6',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.84rem', color: '#111614' }}>{s.sub}</div>
                    <div style={{ fontSize: '0.74rem', color: '#666' }}>{s.sector} &bull; {s.iso}</div>
                    <div style={{ fontSize: '0.72rem', color: '#888' }}>Window: {s.window}</div>
                  </div>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-pill)',
                    background: 'rgba(75, 101, 92, 0.15)',
                    color: 'var(--color-forest-green)'
                  }}>
                    {s.status}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={() => soundFx.playSuccess()}
              className="btn--forest"
              style={{ width: '100%', padding: '10px', fontSize: '0.84rem', marginTop: 'auto' }}
            >
              Authorize SCADA Remote Isolation Sequence
            </button>
          </div>

          {/* Sr. DEE: Catenary Contact Wire Inspection */}
          <div className="card--editorial" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111614', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={18} color="var(--color-forest-green)" />
                Catenary Contact Wire Thickness Telemetry
              </h3>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', background: 'rgba(75, 101, 92, 0.15)', color: 'var(--color-forest-green)', padding: '2px 8px', borderRadius: 'var(--radius-pill)' }}>
                OLWR INSPECTION
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#555', margin: 0 }}>
              Optical Laser Wire Recording (OLWR) data showing contact wire remaining diameter. Highlights sections nearing 8.25mm condemning limit.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { mast: 'Mast 118/24 to 119/02', wire: 'Hard-drawn Copper 107mm2', thickness: '8.42 mm', limit: '8.25 mm', urgency: 'URGENT REPLACE' },
                { mast: 'Mast 142/10 to 142/36', wire: 'Hard-drawn Copper 107mm2', thickness: '9.80 mm', limit: '8.25 mm', urgency: 'GOOD' },
                { mast: 'Mast 98/04 to 98/28', wire: 'Hard-drawn Copper 107mm2', thickness: '9.15 mm', limit: '8.25 mm', urgency: 'NORMAL' },
              ].map((w, idx) => (
                <div key={idx} style={{
                  padding: '12px 14px',
                  background: '#F8FAF6',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.84rem', color: '#111614' }}>{w.mast}</div>
                    <div style={{ fontSize: '0.74rem', color: '#666' }}>{w.wire}</div>
                    <div style={{ fontSize: '0.72rem', color: '#888' }}>Condemning limit: {w.limit}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 800, color: w.urgency.includes('URGENT') ? 'var(--color-rust)' : 'var(--color-forest-green)' }}>
                      {w.thickness}
                    </div>
                    <span style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      color: w.urgency.includes('URGENT') ? 'var(--color-rust)' : 'var(--color-forest-green)'
                    }}>
                      {w.urgency}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => soundFx.playClick()}
              className="btn--forest"
              style={{ width: '100%', padding: '10px', fontSize: '0.84rem', marginTop: 'auto' }}
            >
              Dispatch Tower Wagon 12 to KM 118/24
            </button>
          </div>
        </div>
      )}

      {activeRole === 'dste' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
          {/* Sr. DSTE: Form T/351 Disconnection Queue */}
          <div className="card--editorial" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111614', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileCheck size={18} color="var(--color-forest-green)" />
                Form T/351 Disconnection & Interlocking Memos
              </h3>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', background: 'rgba(75, 101, 92, 0.15)', color: 'var(--color-forest-green)', padding: '2px 8px', borderRadius: 'var(--radius-pill)' }}>
                SMMS INTEGRATED
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#555', margin: 0 }}>
              Statutory Form T/351 Disconnection and Reconnection Memos required before disturbing electronic interlocking, point machines, or track circuits.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { memo: 'T/351-NCR-2026-041', station: 'Khurja Jn (KRJ)', gear: 'Point Machine 204B & Crank Handle 1', reason: 'Facing point lock testing & rod lubrication', status: 'PENDING SM CONCURRENCE' },
                { memo: 'T/351-NCR-2026-039', station: 'Somna (SOM)', gear: 'Track Circuit TC-1012 Relay', reason: 'Dual-detection DAC card replacement', status: 'RECONNECTED (SIL-4)' },
                { memo: 'T/351-NCR-2026-038', station: 'Aligarh Jn (ALJN)', gear: 'Signal 12 (Down Home)', reason: 'LED unit replacement & aspect check', status: 'RECONNECTED (SIL-4)' },
              ].map((m, idx) => (
                <div key={idx} style={{
                  padding: '12px 14px',
                  background: '#F8FAF6',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.82rem', color: '#111614' }}>{m.memo}</span>
                      <span style={{ fontSize: '0.74rem', color: '#666' }}>&bull; {m.station}</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#333', marginTop: '2px' }}>{m.gear}</div>
                    <div style={{ fontSize: '0.72rem', color: '#777' }}>{m.reason}</div>
                  </div>
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-pill)',
                    background: m.status.includes('PENDING') ? 'rgba(168, 161, 116, 0.25)' : 'rgba(75, 101, 92, 0.15)',
                    color: m.status.includes('PENDING') ? '#738166' : 'var(--color-forest-green)'
                  }}>
                    {m.status}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={() => soundFx.playSuccess()}
              className="btn--forest"
              style={{ width: '100%', padding: '10px', fontSize: '0.84rem', marginTop: 'auto' }}
            >
              Generate Digital Form T/351 for Station Master
            </button>
          </div>

          {/* Sr. DSTE: Kavach Trackside Balise & SIL-4 Telemetry */}
          <div className="card--editorial" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111614', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Radio size={18} color="var(--color-forest-green)" />
                Kavach SIL-4 Trackside Balise & Radio Link
              </h3>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', background: 'var(--color-surface)', color: 'var(--color-warm-stone)', padding: '2px 8px', borderRadius: 'var(--radius-pill)' }}>
                SIL-4 CERTIFIED
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#555', margin: 0 }}>
              Automatic Train Protection (ATP) trackside health. Verification of stationary balises and UHF radio towers on the Golden Corridor.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { balise: 'Balise Group B-KRJ-118', km: 'KM 118.4', function: 'Speed profile & TSR beacon', rssi: '-68 dBm (Strong)', status: 'HEALTHY' },
                { balise: 'Balise Group B-SOM-124', km: 'KM 124.6', function: 'Approach warning to Home signal', rssi: '-71 dBm (Strong)', status: 'HEALTHY' },
                { balise: 'Tower Radio TR-ALJN-01', km: 'KM 130.0', function: 'UHF Radio Link (400 MHz)', rssi: '-64 dBm (Clear)', status: 'HEALTHY' },
              ].map((b, idx) => (
                <div key={idx} style={{
                  padding: '12px 14px',
                  background: '#F8FAF6',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.84rem', color: '#111614' }}>{b.balise}</div>
                    <div style={{ fontSize: '0.74rem', color: '#666' }}>{b.km} &bull; {b.function}</div>
                    <div style={{ fontSize: '0.72rem', color: '#888' }}>Signal strength: {b.rssi}</div>
                  </div>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-pill)',
                    background: 'rgba(75, 101, 92, 0.15)',
                    color: 'var(--color-forest-green)'
                  }}>
                    {b.status}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={() => soundFx.playClick()}
              className="btn--forest"
              style={{ width: '100%', padding: '10px', fontSize: '0.84rem', marginTop: 'auto' }}
            >
              Run Trackside Balise Integrity Diagnostics
            </button>
          </div>
        </div>
      )}

      {activeRole === 'drm' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
          {/* DRM: Macro Operational Performance */}
          <div className="card--editorial" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111614', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Award size={18} color="var(--color-forest-green)" />
                Division Operational Availability Scorecard
              </h3>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', background: 'rgba(75, 101, 92, 0.15)', color: 'var(--color-forest-green)', padding: '2px 8px', borderRadius: 'var(--radius-pill)', fontWeight: 700 }}>
                97.6% (TARGET: &gt;95%)
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#555', margin: 0 }}>
              Real-time corridor scorecard synthesized by SAMANVAY across all three engineering disciplines and Operating COA feeds.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ background: '#F8FAF6', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '0.74rem', color: '#666' }}>Co-location Rate</div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-forest-green)', margin: '4px 0 0' }}>56.2%</div>
                <div style={{ fontSize: '0.7rem', color: '#888' }}>Target: 50% &bull; Up from 18% manual</div>
              </div>
              <div style={{ background: '#F8FAF6', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '0.74rem', color: '#666' }}>Line Closures Avoided</div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-dark-olive)', margin: '4px 0 0' }}>22 vs 32</div>
                <div style={{ fontSize: '0.7rem', color: '#888' }}>-31.2% disruptive line shutdowns</div>
              </div>
              <div style={{ background: '#F8FAF6', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '0.74rem', color: '#666' }}>Passenger Punctuality</div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-forest-green)', margin: '4px 0 0' }}>99.8%</div>
                <div style={{ fontSize: '0.7rem', color: '#888' }}>Zero Rajdhani/Vande Bharat delays</div>
              </div>
              <div style={{ background: '#F8FAF6', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '0.74rem', color: '#666' }}>TSR Task-Days</div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-rust)', margin: '4px 0 0' }}>1 vs 14</div>
                <div style={{ fontSize: '0.7rem', color: '#888' }}>-92.8% speed restriction drag</div>
              </div>
            </div>

            <button
              onClick={() => soundFx.playSuccess()}
              className="btn--forest"
              style={{ width: '100%', padding: '10px', fontSize: '0.84rem', marginTop: 'auto' }}
            >
              Export DRM Weekly Performance Briefing (PDF)
            </button>
          </div>

          {/* DRM: Tri-Departmental Concurrence Status */}
          <div className="card--editorial" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111614', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={18} color="var(--color-forest-green)" />
                Inter-Departmental Joint Concurrence Status
              </h3>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', background: 'rgba(75, 101, 92, 0.15)', color: 'var(--color-forest-green)', padding: '2px 8px', borderRadius: 'var(--radius-pill)', fontWeight: 700 }}>
                READY FOR SIGN-OFF
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#555', margin: 0 }}>
              Weekly block programme JPO sign-off tracking across the 3 engineering heads. All three digital signatures required before BDMS publication.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { officer: 'Sr. DEN (Co-ord)', name: 'Shri Rajesh Sharma, IRSE', dept: 'Civil Engineering (TMS)', signed: true, time: '10-Sep 16:42 IST' },
                { officer: 'Sr. DEE (TRD)', name: 'Shri Amit Verma, IRSEE', dept: 'Electrical TRD (TDMS)', signed: true, time: '10-Sep 17:15 IST' },
                { officer: 'Sr. DSTE (Co-ord)', name: 'Shri Vikram Singh, IRSSE', dept: 'Signal & Telecom (SMMS)', signed: true, time: '10-Sep 17:40 IST' },
                { officer: 'Sr. DOM (Co-ord)', name: 'Smt. Ananya Rao, IRTS', dept: 'Operating Traffic (COA)', signed: true, time: '10-Sep 18:05 IST' },
              ].map((s, idx) => (
                <div key={idx} style={{
                  padding: '12px 14px',
                  background: '#F8FAF6',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.84rem', color: '#111614' }}>{s.officer} &bull; {s.name}</div>
                    <div style={{ fontSize: '0.74rem', color: '#666' }}>{s.dept}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-forest-green)', fontFamily: 'var(--font-mono)' }}>Signed: {s.time}</div>
                  </div>
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: 'rgba(75, 101, 92, 0.15)',
                    color: 'var(--color-forest-green)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <CheckCircle2 size={16} />
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => soundFx.playSuccess()}
              className="btn--forest"
              style={{ width: '100%', padding: '10px', fontSize: '0.84rem', marginTop: 'auto' }}
            >
              Affix DRM Final Sovereign Seal & Publish to BDMS
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
