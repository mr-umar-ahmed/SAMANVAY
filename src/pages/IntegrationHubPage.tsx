import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Share2, RefreshCw } from 'lucide-react';
import { soundFx } from '../utils/audio';

interface FeedSource {
  id: string;
  name: string;
  system: string;
  department: string;
  records: string;
  lastSync: string;
  status: 'ACTIVE' | 'SYNCHRONIZING' | 'LATENCY_WARN';
  latency: string;
  keyMetric: string;
}

const FEEDS: FeedSource[] = [
  {
    id: 'tms',
    name: 'TMS (Track Management System)',
    system: 'CRIS-TMS-v4.8',
    department: 'Civil Engineering',
    records: '14,820 Km Records',
    lastSync: '12s ago',
    status: 'ACTIVE',
    latency: '18ms',
    keyMetric: 'TGI Index: 88.4 (Good)',
  },
  {
    id: 'smms',
    name: 'SMMS (Signal Maintenance System)',
    system: 'CRIS-SMMS-v3.2',
    department: 'Signal & Telecom',
    records: '4,190 Assets',
    lastSync: '28s ago',
    status: 'ACTIVE',
    latency: '24ms',
    keyMetric: 'Interlockings: 12/12 Normal',
  },
  {
    id: 'tdms',
    name: 'TDMS (Traction Distribution System)',
    system: 'CRIS-TDMS-v2.9',
    department: 'Electrical TRD',
    records: '8,420 Masts',
    lastSync: '4s ago',
    status: 'ACTIVE',
    latency: '14ms',
    keyMetric: '25kV Wire Wear: 11.2mm min',
  },
  {
    id: 'coa',
    name: 'COA (Control Office Application)',
    system: 'CRIS-COA-PROD',
    department: 'Operating / Control',
    records: '155 Train Paths/day',
    lastSync: '1s ago',
    status: 'ACTIVE',
    latency: '8ms',
    keyMetric: 'Punctuality: 99.8%',
  },
  {
    id: 'fois',
    name: 'FOIS (Freight Operations Info System)',
    system: 'CRIS-FOIS-CORE',
    department: 'Traffic / Freight',
    records: '48 Active Rakes',
    lastSync: '45s ago',
    status: 'ACTIVE',
    latency: '32ms',
    keyMetric: 'Throughput: 38.4 MT/yr',
  },
];

export default function IntegrationHubPage() {
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);
  const [selectedDept, setSelectedDept] = useState<'TMS' | 'SMMS' | 'TDMS' | 'COA'>('TMS');

  const handleSyncAll = () => {
    soundFx.playSuccess();
    setSyncing(true);
    setTimeout(() => setSyncing(false), 1200);
  };

  return (
    <div className="integration-hub-page animate-fade-in" style={{ padding: '4px 0 40px' }}>
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--muted-sage)', textTransform: 'uppercase', fontWeight: 700 }}>
          <span>ANALYSE (CORRIDOR &amp; RISK)</span>
          <span>/</span>
          <span>MODULE 6</span>
          <span>/</span>
          <span style={{ color: 'var(--warm-stone)' }}>NATIVE CRIS INGESTION</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: '4px 0 0', color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Share2 size={24} style={{ color: '#4B655C' }} />
            <span>Multi-Departmental Integration Hub</span>
          </h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn--forest btn--sm"
              onClick={handleSyncAll}
              disabled={syncing}
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              <span>{syncing ? 'Syncing CRIS Pipelines...' : 'Force Ingest All Feeds'}</span>
            </button>
            <button className="btn btn--secondary btn--sm" onClick={() => navigate('/risk')}>
              <span>View ARCI Scoring</span>
            </button>
          </div>
        </div>
      </div>

      {/* 5 Ingestion Tiles Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: 12,
        marginBottom: 'var(--space-5)'
      }}>
        {FEEDS.map(feed => (
          <div key={feed.id} className="card--editorial" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted-sage)' }}>
                {feed.department}
              </div>
              <span className="badge badge--forest-green" style={{ fontSize: 9 }}>
                {feed.status}
              </span>
            </div>

            <div style={{ fontSize: 15, fontWeight: 800, color: '#111614', marginTop: 4 }}>
              {feed.name.split(' ')[0]}
            </div>
            <div style={{ fontSize: 11, color: '#738166' }}>
              {feed.system}
            </div>

            <div style={{ borderTop: '1px solid #E1E4DC', marginTop: 10, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ fontWeight: 700, color: '#111614' }}>{feed.records}</span>
              <span style={{ color: 'var(--muted-sage)' }}>{feed.lastSync}</span>
            </div>

            <div style={{ fontSize: 10.5, color: '#4B655C', fontWeight: 700, marginTop: 4 }}>
              {feed.keyMetric}
            </div>
          </div>
        ))}
      </div>

      {/* Side-by-Side Department Portals Tabview */}
      <div className="card--panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: 12, marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
              Live Telemetry Streams by Railway Directorate
            </h3>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Normalized spatial data matching route-km with OHE elementary switching zones
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {(['TMS', 'SMMS', 'TDMS', 'COA'] as const).map(d => (
              <button
                key={d}
                className={`btn btn--sm ${selectedDept === d ? 'btn--forest' : 'btn--secondary'}`}
                onClick={() => {
                  soundFx.playClick();
                  setSelectedDept(d);
                }}
              >
                {d === 'TMS' ? 'Track (TMS)' : d === 'SMMS' ? 'Signal (SMMS)' : d === 'TDMS' ? 'Electrical (TDMS)' : 'Control (COA)'}
              </button>
            ))}
          </div>
        </div>

        {/* Selected Directorate Inspection Records */}
        {selectedDept === 'TMS' && (
          <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            <div className="card--editorial" style={{ padding: '14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-sage)' }}>TRACK GEOMETRY INDEX (TGI)</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#111614' }}>88.4 / 100</div>
              <p style={{ fontSize: 11, color: '#738166', marginTop: 4 }}>
                Analyzed via OMS-2000 Accelerometer Car trial run (NDLS-AGC UP Line).
              </p>
            </div>
            <div className="card--editorial" style={{ padding: '14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-sage)' }}>USFD FLAW REGISTER</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#872D1C' }}>1 IMR &bull; 4 OBS Flaws</div>
              <p style={{ fontSize: 11, color: '#738166', marginTop: 4 }}>
                Ultrasonic flaw detection flagged transverse crack at KM 142.4.
              </p>
            </div>
            <div className="card--editorial" style={{ padding: '14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-sage)' }}>ANNUAL GMT TONNAGE</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#111614' }}>42.8 GMT</div>
              <p style={{ fontSize: 11, color: '#738166', marginTop: 4 }}>
                60 kg/m 90 UTS rails reached 78% of total fatigue life cycle.
              </p>
            </div>
          </div>
        )}

        {selectedDept === 'SMMS' && (
          <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            <div className="card--editorial" style={{ padding: '14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-sage)' }}>ELECTRONIC INTERLOCKING HEALTH</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#4B655C' }}>100% Redundant Locked</div>
              <p style={{ fontSize: 11, color: '#738166', marginTop: 4 }}>
                Kyosan &bull; Medha EI systems functioning with 0 telegram errors.
              </p>
            </div>
            <div className="card--editorial" style={{ padding: '14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-sage)' }}>POINT MACHINE TIMING VARIANCE</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#F59E0B' }}>Point 204B: 4.8s (Alert)</div>
              <p style={{ fontSize: 11, color: '#738166', marginTop: 4 }}>
                Throw time exceeds 4.0s nominal limit. Auto-queued for lubrication.
              </p>
            </div>
            <div className="card--editorial" style={{ padding: '14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-sage)' }}>TRACK CIRCUIT VOLTAGE</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#111614' }}>5.2V DC Stable</div>
              <p style={{ fontSize: 11, color: '#738166', marginTop: 4 }}>
                Audio Frequency Track Circuits (AFTC) ballast resistance normal.
              </p>
            </div>
          </div>
        )}

        {selectedDept === 'TDMS' && (
          <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            <div className="card--editorial" style={{ padding: '14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-sage)' }}>25 KV OHE CONTACT WIRE THICKNESS</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#111614' }}>11.2 mm (Min: 8.25mm)</div>
              <p style={{ fontSize: 11, color: '#738166', marginTop: 4 }}>
                107 sq mm copper catenary wire wear level within safe limits.
              </p>
            </div>
            <div className="card--editorial" style={{ padding: '14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-sage)' }}>CANTILEVER STAGGER VARIANCE</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#4B655C' }}>&plusmn;180 mm Nominal</div>
              <p style={{ fontSize: 11, color: '#738166', marginTop: 4 }}>
                Pantograph pan sweep verified for high-speed 160 km/h operations.
              </p>
            </div>
            <div className="card--editorial" style={{ padding: '14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-sage)' }}>TRACTION SUBSTATION (TSS) LOAD</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#111614' }}>21.6 MVA Peak</div>
              <p style={{ fontSize: 11, color: '#738166', marginTop: 4 }}>
                Mathura TSS capacitor banks healthy with power factor 0.98.
              </p>
            </div>
          </div>
        )}

        {selectedDept === 'COA' && (
          <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            <div className="card--editorial" style={{ padding: '14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-sage)' }}>SCHEDULED PASSENGER PATHS</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#111614' }}>155 Trains / 24 hrs</div>
              <p style={{ fontSize: 11, color: '#738166', marginTop: 4 }}>
                Vande Bharat, Gatimaan, and Rajdhani premium services mapped.
              </p>
            </div>
            <div className="card--editorial" style={{ padding: '14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-sage)' }}>ACTIVE FREIGHT RAKES</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#4B655C' }}>48 Coal &bull; Container</div>
              <p style={{ fontSize: 11, color: '#738166', marginTop: 4 }}>
                Scheduled freight slotting into non-peak headway windows.
              </p>
            </div>
            <div className="card--editorial" style={{ padding: '14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-sage)' }}>OVERALL SECTION HEADWAY</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#4B655C' }}>6.4 min Average</div>
              <p style={{ fontSize: 11, color: '#738166', marginTop: 4 }}>
                Automatic 4-aspect signalling enforcing minimum safe distance.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
