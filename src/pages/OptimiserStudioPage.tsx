import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sliders, Cpu, CheckCircle2, Scale } from 'lucide-react';
import { soundFx } from '../utils/audio';

export default function OptimiserStudioPage() {
  const navigate = useNavigate();

  // Objective Function Weights per Specification Formula
  const [wDelay, setWDelay] = useState(0.35);
  const [wDowntime, setWDowntime] = useState(0.25);
  const [wColoc, setWColoc] = useState(0.20);
  const [wTsr, setWTsr] = useState(0.12);

  // Hard Constraints
  const [enforceJpoMax, setEnforceJpoMax] = useState(true);
  const [enforceDailyCap, setEnforceDailyCap] = useState(true);
  const [enforceMachineLimits, setEnforceMachineLimits] = useState(true);

  // Simulated Annealing Iterations
  const [iterations, setIterations] = useState(6000);
  const [isSolving, setIsSolving] = useState(false);

  const handleRunOptimizer = () => {
    soundFx.playSuccess();
    setIsSolving(true);
    setTimeout(() => {
      setIsSolving(false);
    }, 1200);
  };

  // Delta calculations based on sliders
  const simulatedAvailability = (96.2 + (wColoc * 3.5) + (wDowntime * 2.1)).toFixed(1);
  const simulatedClosures = Math.round(32 - (wColoc * 35));
  const simulatedHoursSaved = Math.round(110 + (wColoc * 280) + (wDelay * 120));

  return (
    <div className="optimiser-studio-page animate-fade-in" style={{ padding: '4px 0 40px' }}>
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--muted-sage)', textTransform: 'uppercase', fontWeight: 700 }}>
          <span>ACT (OPTIMIZATION &amp; GOVERNANCE)</span>
          <span>/</span>
          <span>MODULE 7</span>
          <span>/</span>
          <span style={{ color: 'var(--warm-stone)' }}>SIMULATED ANNEALING SANDBOX</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: '4px 0 0', color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sliders size={24} style={{ color: '#4B655C' }} />
            <span>Optimiser Studio &amp; Rule Tuning Sandbox</span>
          </h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn--forest btn--sm"
              onClick={handleRunOptimizer}
              disabled={isSolving}
            >
              <Cpu size={14} className={isSolving ? 'animate-spin' : ''} />
              <span>{isSolving ? 'Solving OR-Tools CP-SAT...' : 'Run Annealing Optimization'}</span>
            </button>
            <button className="btn btn--secondary btn--sm" onClick={() => navigate('/handoff')}>
              <CheckCircle2 size={14} />
              <span>Export to BDMS</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Sliders on Left, Live Delta Comparison on Right */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 'var(--space-4)' }}>
        {/* Left Column: Sliders & Constraint Toggles */}
        <div className="card--panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Scale size={18} style={{ color: 'var(--warm-stone)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: '#FFFFFF' }}>
              Multi-Objective Trade-Off Weights
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Weight 1: Delay Penalty */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, color: '#FFFFFF' }}>Delay Penalty Weight ($w_{'delay'}$)</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#8be0c3' }}>{wDelay}</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.60"
                step="0.01"
                value={wDelay}
                onChange={e => setWDelay(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#4B655C' }}
              />
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Minimizes cascading passenger train delay minutes</div>
            </div>

            {/* Weight 2: Downtime Penalty */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, color: '#FFFFFF' }}>Downtime Penalty ($w_{'downtime'}$)</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#8be0c3' }}>{wDowntime}</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.50"
                step="0.01"
                value={wDowntime}
                onChange={e => setWDowntime(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#4B655C' }}
              />
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Penalizes total hours of physical line closure</div>
            </div>

            {/* Weight 3: Co-location Reward */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, color: '#FFFFFF' }}>Co-location Reward ($w_{'coloc'}$)</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#FBBF24' }}>{wColoc}</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.50"
                step="0.01"
                value={wColoc}
                onChange={e => setWColoc(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#F59E0B' }}
              />
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Incentivizes multi-departmental bundling into shadow blocks</div>
            </div>

            {/* Weight 4: TSR Persistence */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, color: '#FFFFFF' }}>TSR Persistence Penalty ($w_{'tsr'}$)</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#8be0c3' }}>{wTsr}</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.30"
                step="0.01"
                value={wTsr}
                onChange={e => setWTsr(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#4B655C' }}
              />
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Accelerates clearance of statutory speed restrictions</div>
            </div>

            {/* Annealing Iterations */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, color: '#FFFFFF' }}>Simulated Annealing Iterations</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--warm-stone)' }}>{iterations.toLocaleString()} cycles</span>
              </div>
              <input
                type="range"
                min="1000"
                max="10000"
                step="500"
                value={iterations}
                onChange={e => setIterations(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: '#A8A174' }}
              />
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Cooling rate: $T_{'{k+1}'} = 0.995 T_k$ (Deterministic Convergence)</div>
            </div>

            {/* Hard Constraints Toggles */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted-sage)', textTransform: 'uppercase', marginBottom: 10 }}>
                Hard Operational Constraints (JPO Rules)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={enforceJpoMax}
                    onChange={e => setEnforceJpoMax(e.target.checked)}
                    style={{ accentColor: '#4B655C' }}
                  />
                  <span>Enforce Max 6-Hour Single Block Duration (JPO Clause 4.2)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={enforceDailyCap}
                    onChange={e => setEnforceDailyCap(e.target.checked)}
                    style={{ accentColor: '#4B655C' }}
                  />
                  <span>Limit to 2 Concurrent Section Possessions Max</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={enforceMachineLimits}
                    onChange={e => setEnforceMachineLimits(e.target.checked)}
                    style={{ accentColor: '#4B655C' }}
                  />
                  <span>Strict Machine Depo Roster Limits (CSM, BCM, PQRS)</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Delta Comparison Canvas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card--editorial" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: '#111614' }}>
                Simulated Annealing Delta Preview
              </h3>
              <span className="badge badge--forest-green">
                {isSolving ? 'Solving...' : 'Active Parameter State'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ padding: '12px', background: '#F8FAF6', borderRadius: 8, border: '1px solid #E1E4DC' }}>
                <div style={{ fontSize: 10.5, color: '#738166', fontWeight: 700, textTransform: 'uppercase' }}>Availability Yield</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#111614', marginTop: 2 }}>{simulatedAvailability}%</div>
                <div style={{ fontSize: 10.5, color: '#4B655C', fontWeight: 700, marginTop: 2 }}>+{(parseFloat(simulatedAvailability) - 94.2).toFixed(1)}% vs Unbundled</div>
              </div>

              <div style={{ padding: '12px', background: '#F8FAF6', borderRadius: 8, border: '1px solid #E1E4DC' }}>
                <div style={{ fontSize: 10.5, color: '#738166', fontWeight: 700, textTransform: 'uppercase' }}>Line Closures Required</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#111614', marginTop: 2 }}>{simulatedClosures} <span style={{ fontSize: 13, color: '#738166' }}>/ 32</span></div>
                <div style={{ fontSize: 10.5, color: '#4B655C', fontWeight: 700, marginTop: 2 }}>{32 - simulatedClosures} closures eliminated</div>
              </div>
            </div>

            <div style={{ padding: '14px', background: '#343927', color: '#FFFFFF', borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--warm-stone)', fontWeight: 700, textTransform: 'uppercase' }}>
                Net Monthly Corridor Time Returned
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>
                +{simulatedHoursSaved} Hours / Month
              </div>
              <div style={{ fontSize: 11, color: '#E1E4DC', marginTop: 4 }}>
                Equivalent to ₹{(simulatedHoursSaved * 18500 / 100000).toFixed(1)} Lakhs in freight capacity throughput.
              </div>
            </div>
          </div>

          {/* Mathematical Objective Card */}
          <div className="card--panel" style={{ padding: '18px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--warm-stone)', textTransform: 'uppercase', marginBottom: 6 }}>
              Governing Mathematical Objective Function
            </div>
            <div style={{
              background: 'rgba(0,0,0,0.4)',
              padding: '10px 12px',
              borderRadius: 6,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: '#8be0c3',
              lineHeight: 1.6,
              overflowX: 'auto',
            }}>
              min Z = &sum; Cost(b) + &sum; Penalty(i) + &sum; Deferral(j)<br />
              Cost(b) = {wDelay} &times; Delay(b) + {wDowntime} &times; Span(b) - {wColoc} &times; (Depts - 1)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
