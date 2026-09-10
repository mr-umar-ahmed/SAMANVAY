import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, Clock, Layers,
  CalendarClock, Shield, Printer, Calendar,
  FileText, Activity, AlertTriangle, CheckCircle2, ChevronRight, Train,
  AlertOctagon, Sparkles
} from 'lucide-react';
import { STATIONS } from '../data/seedData';
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

export default function Dashboard({ }: DashboardProps) {
  const navigate = useNavigate();
  const [trains, setTrains] = useState<ActiveTrain[]>(LIVE_TRAINS);
  const [selectedTrain, setSelectedTrain] = useState<ActiveTrain | null>(null);
  const [attentionDismissed] = useState<Record<string, boolean>>({});

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
      {/* ── 1. Top Metric Grid (Per Specification) ────────────────── */}
      <div className="dashboard__metric-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 'var(--space-3)',
        marginBottom: 'var(--space-5)',
      }}>
        <div className="card--editorial" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-sage)' }}>
            Corridor Availability
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, fontFamily: 'var(--font-heading)', color: '#111614', marginTop: 2 }}>
            97.6%
          </div>
          <div style={{ fontSize: 11, color: '#4B655C', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <TrendingUp size={12} /> +3.2% vs Baseline
          </div>
        </div>

        <div className="card--editorial" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-sage)' }}>
            Line Closures
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, fontFamily: 'var(--font-heading)', color: '#111614', marginTop: 2 }}>
            22 <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted-sage)' }}>vs 32 base</span>
          </div>
          <div style={{ fontSize: 11, color: '#4B655C', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <CheckCircle2 size={12} /> -31.2% Track Blockades
          </div>
        </div>

        <div className="card--editorial" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-sage)' }}>
            Co-Location Rate
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, fontFamily: 'var(--font-heading)', color: '#111614', marginTop: 2 }}>
            56.2%
          </div>
          <div style={{ fontSize: 11, color: '#4B655C', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <Layers size={12} /> Joint Shadow Bundled
          </div>
        </div>

        <div className="card--editorial" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-sage)' }}>
            Punctuality Preserved
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, fontFamily: 'var(--font-heading)', color: '#111614', marginTop: 2 }}>
            99.8%
          </div>
          <div style={{ fontSize: 11, color: '#4B655C', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <Shield size={12} /> 0 Express Regulated
          </div>
        </div>

        <div className="card--editorial" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-sage)' }}>
            TSR Task-Days
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, fontFamily: 'var(--font-heading)', color: '#872D1C', marginTop: 2 }}>
            1 <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted-sage)' }}>vs 14 base</span>
          </div>
          <div style={{ fontSize: 11, color: '#872D1C', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <TrendingDown size={12} /> -92.8% Restriction Days
          </div>
        </div>
      </div>

      {/* ── 2. Hero Dark Card (High-Priority Command Console) ───────── */}
      <div className="card--hero-dark" style={{ padding: '24px', marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span className="badge badge--dark-olive">MODULE 1 &bull; COMMAND OVERVIEW</span>
              <span className="badge badge--forest-green">NCR NDLS–CNB &bull; 440 KM</span>
              <span className="badge badge--warm-stone">SIL-4 KAVACH</span>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 6px', color: '#FFFFFF', letterSpacing: '-0.02em' }}>
              North Central Railway Mission Control Cockpit
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 740, margin: 0, lineHeight: 1.5 }}>
              Continuous multi-departmental asset availability monitor for High Density Network (HDN-1).
              Synchronizing <strong>155 train paths/day</strong> with zero-delay shadow maintenance blocks.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--forest" onClick={() => navigate('/weekly')}>
              <CalendarClock size={14} />
              <span>Weekly Gantt</span>
            </button>
            <button className="btn btn--secondary" onClick={handlePrint} style={{ background: 'rgba(255,255,255,0.08)', color: '#FFFFFF' }}>
              <Printer size={14} />
              <span>Print Dossier</span>
            </button>
          </div>
        </div>

        {/* Hero Sub-Metric Pods */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
          marginTop: 20,
          paddingTop: 16,
          borderTop: '1px solid rgba(255,255,255,0.12)'
        }}>
          <div style={{ background: 'rgba(0,0,0,0.25)', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
            <div style={{ fontSize: 10.5, color: 'var(--warm-stone)', fontWeight: 700, textTransform: 'uppercase' }}>Active Trains in Section</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#FFFFFF', marginTop: 2 }}>48 Active Trains</div>
            <div style={{ fontSize: 10, color: '#8be0c3', marginTop: 2 }}>43 Passenger &bull; 5 Freight Rakes</div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.25)', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
            <div style={{ fontSize: 10.5, color: 'var(--warm-stone)', fontWeight: 700, textTransform: 'uppercase' }}>Net Freight Hours Saved</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#FFFFFF', marginTop: 2 }}>+180.5 hrs/mo</div>
            <div style={{ fontSize: 10, color: '#8be0c3', marginTop: 2 }}>Direct ₹33.4L Savings Value</div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.25)', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
            <div style={{ fontSize: 10.5, color: 'var(--warm-stone)', fontWeight: 700, textTransform: 'uppercase' }}>Cleared / Bundled Blocks</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#FFFFFF', marginTop: 2 }}>18 / 22 Blocks</div>
            <div style={{ fontSize: 10, color: '#8be0c3', marginTop: 2 }}>100% Statutory JPO Notice</div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.25)', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
            <div style={{ fontSize: 10.5, color: 'var(--warm-stone)', fontWeight: 700, textTransform: 'uppercase' }}>Active Emergency TSRs</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#F87171', marginTop: 2 }}>1 Speed Restriction</div>
            <div style={{ fontSize: 10, color: '#F87171', marginTop: 2 }}>KM 143+120 SR 30 km/h Form T/409B</div>
          </div>
        </div>
      </div>

      {/* ── 3. High-Clarity Light Cards: Concentric Gauge & Headway Spline ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: 'var(--space-4)',
        marginBottom: 'var(--space-6)'
      }}>
        {/* Triple Concentric Radial Availability Gauge */}
        <div className="card--editorial" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: '#111614' }}>
                Corridor Multi-Ring Availability Gauge
              </h3>
              <div style={{ fontSize: 11, color: 'var(--muted-sage)' }}>
                Asset Readiness by Department (Track &bull; OHE &bull; S&amp;T)
              </div>
            </div>
            <span className="badge badge--forest-green">Target &gt; 95%</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', flexWrap: 'wrap', gap: 16, padding: '10px 0' }}>
            {/* SVG Triple Concentric Ring Gauge */}
            <svg width="180" height="180" viewBox="0 0 180 180">
              {/* Outer Ring: Track 96% */}
              <circle cx="90" cy="90" r="75" fill="none" stroke="#E1E4DC" strokeWidth="10" />
              <circle cx="90" cy="90" r="75" fill="none" stroke="#4B655C" strokeWidth="10"
                strokeDasharray="471" strokeDashoffset={471 * (1 - 0.96)} strokeLinecap="round" transform="rotate(-90 90 90)" />

              {/* Middle Ring: S&T 97% */}
              <circle cx="90" cy="90" r="58" fill="none" stroke="#E1E4DC" strokeWidth="10" />
              <circle cx="90" cy="90" r="58" fill="none" stroke="#8B5CF6" strokeWidth="10"
                strokeDasharray="364" strokeDashoffset={364 * (1 - 0.97)} strokeLinecap="round" transform="rotate(-90 90 90)" />

              {/* Inner Ring: OHE 92% */}
              <circle cx="90" cy="90" r="41" fill="none" stroke="#E1E4DC" strokeWidth="10" />
              <circle cx="90" cy="90" r="41" fill="none" stroke="#A8A174" strokeWidth="10"
                strokeDasharray="257" strokeDashoffset={257 * (1 - 0.92)} strokeLinecap="round" transform="rotate(-90 90 90)" />

              <text x="90" y="86" textAnchor="middle" fill="#111614" fontSize="22" fontWeight="900" fontFamily="Outfit">
                97.6%
              </text>
              <text x="90" y="104" textAnchor="middle" fill="#738166" fontSize="10" fontWeight="700">
                COMPOSITE
              </text>
            </svg>

            {/* Department Breakdown Legend */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 160 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#111614' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#4B655C' }} /> Track (Civil P-Way)
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#4B655C' }}>96.0%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#111614' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#8B5CF6' }} /> Signal &amp; Telecom (S&amp;T)
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#8B5CF6' }}>97.0%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#111614' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#A8A174' }} /> OHE Traction (TRD)
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#A8A174' }}>92.0%</span>
              </div>
              <div style={{ borderTop: '1px solid #E1E4DC', paddingTop: 6, fontSize: 10.5, color: '#738166' }}>
                All systems meet SIL-4 statutory thresholds.
              </div>
            </div>
          </div>
        </div>

        {/* Headway Spline Chart with +14.2m Optimal Separation Badge */}
        <div className="card--editorial" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: '#111614' }}>
                WTT Headway vs. Throughput Curve
              </h3>
              <div style={{ fontSize: 11, color: 'var(--muted-sage)' }}>
                Scheduled Timetable Gaps vs. Dynamic Slot Compression
              </div>
            </div>
            <span className="badge badge--forest-green" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Sparkles size={11} /> +14.2m Optimal Gap
            </span>
          </div>

          <div style={{ position: 'relative', width: '100%', height: 160 }}>
            {/* SVG Headway Spline Graph */}
            <svg width="100%" height="160" viewBox="0 0 400 160" preserveAspectRatio="none">
              <defs>
                <linearGradient id="headwayFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4B655C" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#4B655C" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1="0" y1="40" x2="400" y2="40" stroke="#E1E4DC" strokeDasharray="3 3" />
              <line x1="0" y1="80" x2="400" y2="80" stroke="#E1E4DC" strokeDasharray="3 3" />
              <line x1="0" y1="120" x2="400" y2="120" stroke="#E1E4DC" strokeDasharray="3 3" />

              {/* Planned Headway Curve (Sage) */}
              <path d="M 0,110 Q 70,60 140,80 T 260,50 T 400,90" fill="none" stroke="#738166" strokeWidth="2" strokeDasharray="4 2" />

              {/* Actual Optimized Throughput Spline (Forest Green) */}
              <path d="M 0,140 Q 60,70 140,40 T 260,30 T 400,60 L 400,160 L 0,160 Z" fill="url(#headwayFill)" />
              <path d="M 0,140 Q 60,70 140,40 T 260,30 T 400,60" fill="none" stroke="#4B655C" strokeWidth="3" />

              {/* Highlight Optimal Slot Marker */}
              <circle cx="200" cy="35" r="5" fill="#4B655C" stroke="#FFFFFF" strokeWidth="2" />
              <rect x="150" y="8" width="100" height="20" rx="4" fill="#343927" />
              <text x="200" y="22" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="800" fontFamily="monospace">
                14.2 min Gap
              </text>
            </svg>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#738166', marginTop: 8 }}>
            <span>00:00 (NDLS Departure)</span>
            <span>12:00 (Mathura Jn Peak)</span>
            <span>24:00 (Agra Cantt Arrival)</span>
          </div>
        </div>
      </div>

      {/* ── 4. "What Needs Attention Right Now" Actionable Deck ─────── */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 className="dashboard__section-title" style={{ margin: 0 }}>
            <span>What Needs Attention Right Now</span>
            <span style={{ fontSize: 11, color: 'var(--muted-sage)', marginLeft: 8 }}>
              (अति-आवश्यक प्राथमिकताएं)
            </span>
          </h3>
          <span className="badge badge--rust">3 Critical Actions Pending</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
          {/* Action 1: Overdue IMR Flaw */}
          {!attentionDismissed['flaw1'] && (
            <div className="card--panel" style={{ padding: '14px 16px', borderLeft: '4px solid #872D1C' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertOctagon size={16} style={{ color: '#F87171' }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#F87171' }}>OVERDUE USFD IMR FLAW</span>
                </div>
                <span className="badge badge--rust">ARCI: 0.96</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>
                KM 142.4 UP Fast &bull; Transverse Rail Fatigue
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Weibull survival critical ($P_f' = 0.88$). Requires emergency 90 min rail renewal block.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  className="btn btn--rust btn--sm"
                  onClick={() => {
                    soundFx.playSuccess();
                    navigate('/caution-orders');
                  }}
                >
                  <FileText size={12} />
                  <span>Issue Form T/409B</span>
                </button>
                <button
                  className="btn btn--secondary btn--sm"
                  onClick={() => {
                    soundFx.playClick();
                    navigate('/risk');
                  }}
                >
                  <span>Inspect ARCI</span>
                </button>
              </div>
            </div>
          )}

          {/* Action 2: Point Machine Overhaul */}
          {!attentionDismissed['point1'] && (
            <div className="card--panel" style={{ padding: '14px 16px', borderLeft: '4px solid #A8A174' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={16} style={{ color: '#FBBF24' }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#FBBF24' }}>POINT 204B LOCK TIMING VARIANCE</span>
                </div>
                <span className="badge badge--warm-stone">ARCI: 0.84</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>
                Kosi Kalan Yard &bull; Throw Time &gt; 4.8s (Limit 4.0s)
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                S&amp;T Form T/351 Disconnection Memo drafted. Co-locate with Civil tamping block.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  className="btn btn--forest btn--sm"
                  onClick={() => {
                    soundFx.playSuccess();
                    navigate('/weekly');
                  }}
                >
                  <Clock size={12} />
                  <span>Grant Block in Gantt</span>
                </button>
                <button
                  className="btn btn--secondary btn--sm"
                  onClick={() => {
                    soundFx.playClick();
                    navigate('/handoff');
                  }}
                >
                  <span>BDMS Sign-off</span>
                </button>
              </div>
            </div>
          )}

          {/* Action 3: 10-Week Notice Validation Shortfall */}
          {!attentionDismissed['notice1'] && (
            <div className="card--panel" style={{ padding: '14px 16px', borderLeft: '4px solid #F59E0B' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Activity size={16} style={{ color: '#F59E0B' }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#F59E0B' }}>10-WEEK JPO NOTICE SHORTFALL</span>
                </div>
                <span className="badge badge--dark-olive">RBP Week 9</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>
                CTR Track Relaying Machine &bull; Mathura Jn
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Requires public advance bulletin for 2 passenger regulations before lock date.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  className="btn btn--forest btn--sm"
                  onClick={() => {
                    soundFx.playSuccess();
                    navigate('/monthly');
                  }}
                >
                  <Calendar size={12} />
                  <span>Open 26-Week RBP</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 5. Live Interactive Linear Corridor GIS & Track Telemetry Monitor ── */}
      <div className="card--panel" style={{ marginBottom: 'var(--space-6)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={18} style={{ color: '#4B655C' }} />
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: '#FFFFFF' }}>
                Live Linear Corridor Track Telemetry (NDLS &ndash; AGC 195 KM)
              </h3>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Real-time train positioning, signal aspect status, and active Joint Possession Zone
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4B655C' }} />
              Clear Signal
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B' }} />
              Caution Aspect
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#872D1C' }} />
              Possession Block
            </span>
          </div>
        </div>

        <div style={{ padding: '20px 16px 14px' }}>
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
                <div style={{ position: 'relative', height: 2, background: 'rgba(115, 129, 102, 0.4)', margin: '6px 0' }}>
                  {/* Active Joint Shadow Block Possession Overlay (KM 142 to KM 148) */}
                  <div
                    style={{
                      position: 'absolute',
                      left: `${(142 / 195) * 100}%`,
                      width: `${(6 / 195) * 100}%`,
                      height: 14,
                      top: -6,
                      background: 'repeating-linear-gradient(45deg, rgba(135,45,28,0.5), rgba(135,45,28,0.5) 6px, rgba(245,158,11,0.5) 6px, rgba(245,158,11,0.5) 12px)',
                      border: '1.5px dashed #872D1C',
                      borderRadius: 3,
                      boxShadow: '0 0 12px rgba(135, 45, 28, 0.4)',
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
                        background: sigKm === 138 ? '#F59E0B' : '#4B655C',
                        border: '1px solid #FFFFFF',
                        boxShadow: sigKm === 138 ? '0 0 8px #F59E0B' : '0 0 8px #4B655C',
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
                        background: '#738166',
                      }}
                    />
                  ))}
                </div>

                {/* Moving Trains on the Line */}
                {trains.map((train) => {
                  const pct = (train.km / 195) * 100;
                  const isSelected = selectedTrain?.number === train.number;
                  const color = train.type === 'Vande Bharat' ? '#F59E0B' : train.type === 'Shatabdi' ? '#4B655C' : '#A8A174';

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
              background: 'var(--surface-2)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--dark-olive)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF' }}>
                  <Train size={16} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
                    Train #{selectedTrain.number} &bull; {selectedTrain.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Speed: <strong>{selectedTrain.speed} km/h</strong> &bull; Current Chainage: <strong>KM {selectedTrain.km} {selectedTrain.line}</strong> &bull; Kavach SIL-4 Link: <span style={{ color: '#4B655C' }}>LOCKED</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`badge ${selectedTrain.status === 'ON TIME' ? 'badge--approved' : 'badge--proposed'}`}>
                  {selectedTrain.status}
                </span>
                <button
                  className="btn btn--secondary btn--sm"
                  onClick={() => navigate('/corridor')}
                >
                  <span>View in String Diagram</span>
                  <ChevronRight size={12} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
