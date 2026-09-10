import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, Clock, Layers, Gauge, Timer, ArrowRight,
  FileInput, BarChart3, CalendarClock, Camera, Zap, Shield, Printer,
  FileText, Activity, AlertTriangle, CheckCircle2, ChevronRight, Train,
  Radio, Download, Eye
} from 'lucide-react';
import { DEMO_KPIS, GOLDEN_DEMANDS, GOLDEN_JOINT_BLOCK, ADDITIONAL_DEMANDS, STATIONS } from '../data/seedData';
import { soundFx } from '../utils/audio';
import type { GovLanguage } from '../components/layout/NationalHeader';
import './Dashboard.css';

interface DashboardProps {
  language?: GovLanguage;
}

interface ActiveTrain {
  number: string;
  name: string;
  speed: number;
  km: number;
  line: 'UP' | 'DN';
  type: 'Vande Bharat' | 'Shatabdi' | 'Gatimaan' | 'Freight';
  status: 'ON TIME' | 'REGULATED';
}

const LIVE_TRAINS: ActiveTrain[] = [
  { number: '22436', name: 'Vande Bharat Express', speed: 160, km: 165, line: 'UP', type: 'Vande Bharat', status: 'ON TIME' },
  { number: '12002', name: 'Bhopal Shatabdi', speed: 130, km: 118, line: 'UP', type: 'Shatabdi', status: 'ON TIME' },
  { number: '12050', name: 'Gatimaan Express', speed: 160, km: 45, line: 'DN', type: 'Gatimaan', status: 'ON TIME' },
  { number: 'BOXN-88', name: 'Heavy-Haul Coal Rake', speed: 65, km: 78, line: 'UP', type: 'Freight', status: 'REGULATED' },
];

export default function Dashboard({ language = 'bilingual' }: DashboardProps) {
  const navigate = useNavigate();
  const allDemands = [...GOLDEN_DEMANDS, ...ADDITIONAL_DEMANDS];
  const civilCount = allDemands.filter(d => d.department === 'Civil').length;
  const sntCount = allDemands.filter(d => d.department === 'S&T').length;
  const trdCount = allDemands.filter(d => d.department === 'TRD').length;

  const [trains, setTrains] = useState<ActiveTrain[]>(LIVE_TRAINS);
  const [selectedTrain, setSelectedTrain] = useState<ActiveTrain | null>(null);

  // Micro train position simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setTrains(prev => prev.map(t => ({
        ...t,
        km: t.line === 'UP' ? Math.min(194, +(t.km + 0.3).toFixed(1)) : Math.max(2, +(t.km - 0.3).toFixed(1)),
      })));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handlePrint = () => {
    soundFx.playClick();
    window.print();
  };

  return (
    <div className="dashboard">
      {/* Sovereign National Operations Banner */}
      <div className="dashboard__hero">
        <div className="dashboard__hero-content">
          <div className="dashboard__hero-badge-row">
            <div className="dashboard__hero-badge">
              <span className="dashboard__hero-pulse" />
              <span>LIVE DISPATCH OPERATIONS &bull; 24-HOUR HORIZON</span>
            </div>
            <div className="gov-auth-badge gov-auth-badge--kavach">
              <span>SIL-4 KAVACH ACTIVE</span>
            </div>
            <div className="gov-auth-badge gov-auth-badge--gatishakti">
              <span>PM GATISHAKTI NMP</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h1 className="dashboard__hero-title">
                New Delhi &rarr; Agra Cantt
                <span className="dashboard__hero-title-hi"> (नई दिल्ली &ndash; आगरा कैंट)</span>
              </h1>
              <p className="dashboard__hero-subtitle">
                195 km High-Density Chord (HDN-1) &bull; 9 Stations &bull; 12 Interlockings &bull; 155 Trains/day &bull; 134% Line Capacity Utilization.
                Autonomous Joint Shadow Block Bundling maximizing train throughput while guaranteeing zero safety escapes.
              </p>
            </div>

            {/* Quick Export / Print Dossier */}
            <div className="dashboard__hero-actions">
              <button
                className="btn btn--secondary btn--sm"
                onClick={handlePrint}
                style={{ background: 'rgba(255,255,255,0.1)', color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.25)' }}
              >
                <Printer size={14} />
                <span>Print Official Dossier</span>
              </button>
            </div>
          </div>

          {/* Key Executive Telemetry Grid */}
          <div className="dashboard__hero-stats">
            <div className="dashboard__hero-stat">
              <span className="dashboard__hero-stat-value">
                {DEMO_KPIS.asset_availability_pct}%
              </span>
              <span className="dashboard__hero-stat-label">Asset Availability Index</span>
            </div>
            <div className="dashboard__hero-stat">
              <span className="dashboard__hero-stat-value">
                {DEMO_KPIS.corridor_downtime_saved_min} min
              </span>
              <span className="dashboard__hero-stat-label">Possession Hours Saved</span>
            </div>
            <div className="dashboard__hero-stat">
              <span className="dashboard__hero-stat-value">
                {DEMO_KPIS.joint_block_ratio_pct}%
              </span>
              <span className="dashboard__hero-stat-label">Joint Shadow Ratio</span>
            </div>
            <div className="dashboard__hero-stat">
              <span className="dashboard__hero-stat-value">
                {DEMO_KPIS.avg_solver_time_ms}ms
              </span>
              <span className="dashboard__hero-stat-label">AI-CP-SAT Solver Latency</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── NEW: Live Interactive Linear Corridor GIS & Track Telemetry Monitor ── */}
      <div className="card" style={{ marginBottom: 'var(--space-6)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        <div className="card__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={18} style={{ color: '#F59E0B' }} />
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>
                Live Linear Corridor Track Telemetry (NDLS &ndash; AGC 195 KM)
              </h3>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Real-time train positioning, signal aspect status, and active Joint Possession Zone
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
              Clear Signal
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B' }} />
              Caution
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444' }} />
              Possession Block
            </span>
          </div>
        </div>

        <div className="card__body" style={{ padding: '20px 16px 14px' }}>
          {/* Track Schematic Display Container */}
          <div style={{ position: 'relative', width: '100%', overflowX: 'auto', paddingBottom: 16 }}>
            <div style={{ minWidth: 800, position: 'relative' }}>
              {/* Station Indicators Line (Top) */}
              <div style={{ position: 'relative', height: 28, marginBottom: 8 }}>
                {STATIONS.map((stn) => {
                  const pct = (stn.chainage_km / 195) * 100;
                  return (
                    <div
                      key={stn.id}
                      style={{
                        position: 'absolute',
                        left: `${pct}%`,
                        transform: 'translateX(-50%)',
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-primary)' }}>
                        {stn.code}
                      </div>
                      <div style={{ fontSize: 8.5, color: 'var(--text-muted)' }}>
                        {stn.chainage_km}k
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Main Dual Track Lines (UP and DN) */}
              <div style={{ position: 'relative', height: 48, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 0' }}>
                {/* UP Line (KM 0 -> 195) */}
                <div style={{ position: 'relative', height: 2, background: 'rgba(148, 163, 184, 0.4)', margin: '6px 0' }}>
                  {/* Active Joint Shadow Block Possession Overlay (KM 142 to KM 148) */}
                  <div
                    style={{
                      position: 'absolute',
                      left: `${(142 / 195) * 100}%`,
                      width: `${(6 / 195) * 100}%`,
                      height: 14,
                      top: -6,
                      background: 'repeating-linear-gradient(45deg, rgba(239,68,68,0.4), rgba(239,68,68,0.4) 6px, rgba(245,158,11,0.4) 6px, rgba(245,158,11,0.4) 12px)',
                      border: '1.5px dashed #EF4444',
                      borderRadius: 3,
                      boxShadow: '0 0 12px rgba(239, 68, 68, 0.4)',
                    }}
                    title="Active Joint Possession: KM 142-148 (01:05-04:15 IST)"
                  />

                  {/* Signal Aspect Markers on UP Line */}
                  {[25, 55, 95, 138, 175].map((sigKm, idx) => (
                    <div
                      key={idx}
                      style={{
                        position: 'absolute',
                        left: `${(sigKm / 195) * 100}%`,
                        top: -5,
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: sigKm === 138 ? '#F59E0B' : '#10B981',
                        border: '1px solid #FFFFFF',
                        boxShadow: sigKm === 138 ? '0 0 8px #F59E0B' : '0 0 8px #10B981',
                      }}
                      title={`Signal Post KM ${sigKm} UP`}
                    />
                  ))}

                  {/* Station Tick Markers */}
                  {STATIONS.map((stn) => (
                    <div
                      key={stn.id}
                      style={{
                        position: 'absolute',
                        left: `${(stn.chainage_km / 195) * 100}%`,
                        top: -4,
                        width: 2,
                        height: 10,
                        background: '#94A3B8',
                      }}
                    />
                  ))}
                </div>

                {/* Moving Trains on the Line */}
                {trains.map((train) => {
                  const pct = (train.km / 195) * 100;
                  const isSelected = selectedTrain?.number === train.number;
                  const color = train.type === 'Vande Bharat' ? '#F59E0B' : train.type === 'Shatabdi' ? '#C0527B' : '#D97706';

                  return (
                    <button
                      key={train.number}
                      onClick={() => {
                        soundFx.playClick();
                        setSelectedTrain(isSelected ? null : train);
                      }}
                      style={{
                        position: 'absolute',
                        left: `${pct}%`,
                        top: train.line === 'UP' ? 6 : 24,
                        transform: 'translate(-50%, -50%)',
                        background: isSelected ? '#FFFFFF' : color,
                        color: isSelected ? '#000000' : '#FFFFFF',
                        border: '1.5px solid #FFFFFF',
                        borderRadius: 12,
                        padding: '2px 7px',
                        fontSize: 9.5,
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        cursor: 'pointer',
                        boxShadow: `0 0 10px ${color}`,
                        zIndex: 20,
                        transition: 'left 2.5s linear',
                      }}
                    >
                      <Train size={10} />
                      <span>{train.number}</span>
                    </button>
                  );
                })}
              </div>

              {/* Corridor Bottom Scale */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--text-muted)', marginTop: 6 }}>
                <span>NDLS (KM 0.0)</span>
                <span>NCR Delhi-Agra Chord Track Section &bull; 195 KM Total</span>
                <span>AGC (KM 195.0)</span>
              </div>
            </div>
          </div>

          {/* Selected Train Telemetry Card */}
          {selectedTrain && (
            <div className="animate-fade-in-up" style={{
              marginTop: 12,
              padding: '10px 14px',
              background: 'var(--surface-1)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--primary-plum)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF' }}>
                  <Train size={16} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
                    Train #{selectedTrain.number} &bull; {selectedTrain.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Speed: <strong>{selectedTrain.speed} km/h</strong> &bull; Current Chainage: <strong>KM {selectedTrain.km} {selectedTrain.line}</strong> &bull; Kavach SIL-4 Link: <span style={{ color: '#10B981' }}>LOCKED</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`badge ${selectedTrain.status === 'ON TIME' ? 'badge--approved' : 'badge--proposed'}`}>
                  {selectedTrain.status}
                </span>
                <button
                  className="btn btn--secondary btn--sm"
                  onClick={() => navigate('/string-chart')}
                >
                  <span>View in String Chart</span>
                  <ChevronRight size={12} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid-kpi">
        <div className="kpi-tile animate-fade-in-up delay-1">
          <span className="kpi-tile__label">Demands Processed</span>
          <span className="kpi-tile__value">{DEMO_KPIS.demands_processed}</span>
          <span className="kpi-tile__delta kpi-tile__delta--positive">
            <TrendingUp size={12} /> +12 this cycle
          </span>
          <span className="kpi-tile__tag">[Official RDSO Audit]</span>
        </div>
        <div className="kpi-tile animate-fade-in-up delay-2">
          <span className="kpi-tile__label">Closures Saved</span>
          <span className="kpi-tile__value">{DEMO_KPIS.closures_saved_total}</span>
          <span className="kpi-tile__delta kpi-tile__delta--positive">
            <Layers size={12} /> via joint bundling
          </span>
          <span className="kpi-tile__tag">[Official RDSO Audit]</span>
        </div>
        <div className="kpi-tile animate-fade-in-up delay-3">
          <span className="kpi-tile__label">Machine Productive Hours</span>
          <span className="kpi-tile__value">{DEMO_KPIS.machine_productive_hours_pct}%</span>
          <span className="kpi-tile__delta kpi-tile__delta--positive">
            <Gauge size={12} /> +8.3% vs baseline
          </span>
          <span className="kpi-tile__tag">[Official RDSO Audit]</span>
        </div>
        <div className="kpi-tile animate-fade-in-up delay-4">
          <span className="kpi-tile__label">Delay / Possession</span>
          <span className="kpi-tile__value">{DEMO_KPIS.delay_minutes_per_possession} min</span>
          <span className="kpi-tile__delta kpi-tile__delta--negative">
            <TrendingDown size={12} /> -2.1 min average
          </span>
          <span className="kpi-tile__tag">[Official RDSO Audit]</span>
        </div>
      </div>

      {/* Department Demand Summary */}
      <h3 className="dashboard__section-title">
        <span>Department Maintenance Queue</span>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 8 }}>
          (विभागीय मांगें)
        </span>
      </h3>
      <div className="demand-summary">
        <div className="demand-summary__card demand-summary__card--civil" onClick={() => navigate('/demands')}>
          <span className="demand-summary__dept">Civil Engineering (P-Way)</span>
          <span className="demand-summary__count">{civilCount}</span>
          <span className="demand-summary__label">active possession requests</span>
        </div>
        <div className="demand-summary__card demand-summary__card--snt" onClick={() => navigate('/demands')}>
          <span className="demand-summary__dept">Signalling &amp; Telecom (S&amp;T)</span>
          <span className="demand-summary__count">{sntCount}</span>
          <span className="demand-summary__label">active interlocking requests</span>
        </div>
        <div className="demand-summary__card demand-summary__card--trd" onClick={() => navigate('/demands')}>
          <span className="demand-summary__dept">Traction Distribution (TRD / OHE)</span>
          <span className="demand-summary__count">{trdCount}</span>
          <span className="demand-summary__label">active 25kV power cut requests</span>
        </div>
      </div>

      {/* Live Block Timeline */}
      <h3 className="dashboard__section-title">
        <span>Active Joint Shadow Block Schedule</span>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 8 }}>
          (संयुक्त छाया ब्लॉक)
        </span>
      </h3>
      <div className="dashboard__timeline">
        <div className="timeline-item delay-1">
          <div className="timeline-item__indicator" style={{ background: 'var(--status-approved)' }} />
          <div className="timeline-item__content">
            <div className="timeline-item__header">
              <span className="timeline-item__title">{GOLDEN_JOINT_BLOCK.id}</span>
              <span className="badge badge--approved">Approved by Section Controller</span>
              <span className="badge badge--civil">Civil (P-Way)</span>
              <span className="badge badge--snt">S&amp;T</span>
              <span className="badge badge--trd">TRD (OHE)</span>
            </div>
            <div className="timeline-item__meta">
              KM {GOLDEN_JOINT_BLOCK.chainage_start_km}&ndash;{GOLDEN_JOINT_BLOCK.chainage_end_km} UP Fast &bull; {GOLDEN_JOINT_BLOCK.duration_min} min window &bull; 01:05&ndash;04:15 IST
            </div>
            <div className="timeline-item__details">
              <span><Clock size={12} /> {GOLDEN_JOINT_BLOCK.closures_saved} separate block closures saved</span>
              <span><Timer size={12} /> {GOLDEN_JOINT_BLOCK.minutes_saved} min corridor delay eliminated</span>
              <span><Shield size={12} /> 0 passenger train cancellations</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <h3 className="dashboard__section-title">
        <span>Mission Control Quick Actions</span>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 8 }}>
          (शीघ्र कार्रवाई)
        </span>
      </h3>
      <div className="quick-actions">
        <button className="quick-action" onClick={() => navigate('/demands')}>
          <div className="quick-action__icon"><FileInput size={18} /></div>
          <span className="quick-action__label">Submit Demand</span>
        </button>
        <button className="quick-action" onClick={() => navigate('/arci')}>
          <div className="quick-action__icon"><BarChart3 size={18} /></div>
          <span className="quick-action__label">ARCI Risk Matrix</span>
        </button>
        <button className="quick-action" onClick={() => navigate('/bundler')}>
          <div className="quick-action__icon"><Layers size={18} /></div>
          <span className="quick-action__label">Joint Bundler</span>
        </button>
        <button className="quick-action" onClick={() => navigate('/string-chart')}>
          <div className="quick-action__icon"><CalendarClock size={18} /></div>
          <span className="quick-action__label">String Chart</span>
        </button>
        <button className="quick-action" onClick={() => navigate('/scanner')}>
          <div className="quick-action__icon"><Camera size={18} /></div>
          <span className="quick-action__label">AI Field Scanner</span>
        </button>
        <button className="quick-action" onClick={() => navigate('/controller')}>
          <div className="quick-action__icon"><Shield size={18} /></div>
          <span className="quick-action__label">Controller Console</span>
        </button>
      </div>
    </div>
  );
}
