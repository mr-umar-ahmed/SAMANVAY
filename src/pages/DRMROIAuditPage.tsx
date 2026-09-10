import { useState } from 'react';
import { TrendingUp, Download, Sliders } from 'lucide-react';
import { soundFx } from '../utils/audio';

export default function DRMROIAuditPage() {
  const [freightRate, setFreightRate] = useState<number>(18500); // ₹18,500/hr
  const [punctualityRate, setPunctualityRate] = useState<number>(12000); // ₹12,000/hr
  const [tsrRatePerMin, setTsrRatePerMin] = useState<number>(450); // ₹450/train-min

  // Operational metrics
  const freightHoursSaved = 412; // monthly
  const passengerHoursPreserved = 184; // monthly
  const tsrMinutesAvoided = 3300; // monthly

  const freightSavings = freightHoursSaved * freightRate;
  const passengerSavings = passengerHoursPreserved * punctualityRate;
  const tsrSavings = tsrMinutesAvoided * tsrRatePerMin;
  const totalSavings = freightSavings + passengerSavings + tsrSavings;

  const formatLakhs = (val: number) => {
    const lakhs = (val / 100000).toFixed(2);
    return `₹${lakhs} Lakhs`;
  };

  const formatRupees = (val: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
  };

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
            <TrendingUp size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: 700, margin: 0, color: '#FFFFFF' }}>
                DRM ROI & Financial Audit &bull; वित्तीय व समय बचत ऑडिट
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
                [M] Module 16
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '0.86rem', color: 'rgba(255,255,255,0.7)' }}>
              Economic dividend audit calculating freight throughput savings, passenger punctuality preservation, and TSR kinetic energy recovery.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={() => soundFx.playSuccess()}
            className="btn--forest"
            style={{ padding: '8px 16px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Download size={14} />
            <span>Export Board Audit (PDF)</span>
          </button>
        </div>
      </div>

      {/* Hero Financial Summary Banner */}
      <div style={{
        background: 'linear-gradient(135deg, var(--color-surface) 0%, var(--color-dark-olive) 100%)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '28px 32px',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '24px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--color-warm-stone)', background: 'rgba(0,0,0,0.4)', padding: '2px 8px', borderRadius: 'var(--radius-pill)' }}>
              AUDITED ECONOMIC DIVIDEND &bull; MONTHLY
            </span>
          </div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '2.8rem', fontWeight: 800, color: '#FFFFFF', margin: '8px 0 4px', letterSpacing: '-0.5px' }}>
            {formatLakhs(totalSavings)}
          </div>
          <div style={{ fontSize: '0.88rem', color: 'var(--color-warm-stone)' }}>
            Exact Net Total: <strong>{formatRupees(totalSavings)}</strong> returned to Prayagraj Division (NCR) every month.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '14px 20px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.7)' }}>Freight Hours Saved</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-warm-stone)', marginTop: '4px' }}>
              +412 hrs
            </div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>FOIS Tracked Velocity</div>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '14px 20px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.7)' }}>Line Closures Avoided</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 800, color: '#FFFFFF', marginTop: '4px' }}>
              -10 blocks
            </div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>31.2% co-location reduction</div>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '14px 20px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.7)' }}>TSR Drag Avoided</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-warm-stone)', marginTop: '4px' }}>
              -92.8%
            </div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>1 task-day vs 14 manual</div>
          </div>
        </div>
      </div>

      {/* 3 Pillar Breakdown Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        
        {/* Pillar 1: Freight Value */}
        <div className="card--editorial" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-forest-green)', textTransform: 'uppercase' }}>
              Pillar 1: Freight Productivity
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', background: '#F8FAF6', padding: '2px 8px', borderRadius: 'var(--radius-pill)', color: '#666' }}>
              ₹18,500/hr
            </span>
          </div>

          <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#111614' }}>
            {formatRupees(freightSavings)}
          </h3>

          <p style={{ fontSize: '0.82rem', color: '#555', margin: 0 }}>
            By co-locating OHE power isolations and track tamping during low-density night valleys (01:30–04:30), freight paths are not held in waiting loops.
          </p>

          <div style={{ background: '#F8FAF6', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: '0.76rem', color: '#666', marginTop: 'auto' }}>
            <strong>Calculation:</strong> 412 train-hours returned &times; ₹18,500/hr = {formatRupees(freightSavings)}
          </div>
        </div>

        {/* Pillar 2: Passenger Punctuality */}
        <div className="card--editorial" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-dark-olive)', textTransform: 'uppercase' }}>
              Pillar 2: Punctuality Protection
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', background: '#F8FAF6', padding: '2px 8px', borderRadius: 'var(--radius-pill)', color: '#666' }}>
              ₹12,000/hr
            </span>
          </div>

          <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#111614' }}>
            {formatRupees(passengerSavings)}
          </h3>

          <p style={{ fontSize: '0.82rem', color: '#555', margin: 0 }}>
            Zero Mail/Express delays. Vande Bharat and Rajdhani premium paths are protected with a mandatory +14.2m headway valley buffer.
          </p>

          <div style={{ background: '#F8FAF6', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: '0.76rem', color: '#666', marginTop: 'auto' }}>
            <strong>Calculation:</strong> 184 passenger hours protected &times; ₹12,000/hr = {formatRupees(passengerSavings)}
          </div>
        </div>

        {/* Pillar 3: Traction Kinetic Energy & TSR */}
        <div className="card--editorial" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-rust)', textTransform: 'uppercase' }}>
              Pillar 3: Kinetic Energy Recovery
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', background: '#F8FAF6', padding: '2px 8px', borderRadius: 'var(--radius-pill)', color: '#666' }}>
              ₹450/min
            </span>
          </div>

          <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#111614' }}>
            {formatRupees(tsrSavings)}
          </h3>

          <p style={{ fontSize: '0.82rem', color: '#555', margin: 0 }}>
            Immediate flaw removal compresses Temporary Speed Restrictions (TSR) from 14 days to 1 day, eliminating massive braking and acceleration losses.
          </p>

          <div style={{ background: '#F8FAF6', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: '0.76rem', color: '#666', marginTop: 'auto' }}>
            <strong>Calculation:</strong> 3,300 TSR minutes avoided &times; ₹450/min = {formatRupees(tsrSavings)}
          </div>
        </div>

      </div>

      {/* Interactive Economic Parameter Adjuster */}
      <div className="card--editorial" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111614', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={18} color="var(--color-forest-green)" />
            Auditor Parameter Console & Sensitivity Analysis
          </h3>
          <span style={{ fontSize: '0.74rem', color: '#666' }}>DRM Executive Privilege</span>
        </div>
        <p style={{ fontSize: '0.82rem', color: '#555', margin: 0 }}>
          Adjust financial baseline valuations to run sensitivity checks against varying seasonal traffic volumes and electric traction tariffs.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '8px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, color: '#333', marginBottom: '6px' }}>
              <span>Freight Delay Cost (₹/hr)</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-forest-green)' }}>₹{freightRate}</span>
            </div>
            <input
              type="range"
              min="10000"
              max="30000"
              step="500"
              value={freightRate}
              onChange={(e) => setFreightRate(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--color-forest-green)' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, color: '#333', marginBottom: '6px' }}>
              <span>Punctuality Penalty Cost (₹/hr)</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-dark-olive)' }}>₹{punctualityRate}</span>
            </div>
            <input
              type="range"
              min="5000"
              max="25000"
              step="500"
              value={punctualityRate}
              onChange={(e) => setPunctualityRate(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--color-dark-olive)' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, color: '#333', marginBottom: '6px' }}>
              <span>TSR Energy Drag Cost (₹/min)</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-rust)' }}>₹{tsrRatePerMin}</span>
            </div>
            <input
              type="range"
              min="200"
              max="1000"
              step="50"
              value={tsrRatePerMin}
              onChange={(e) => setTsrRatePerMin(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--color-rust)' }}
            />
          </div>
        </div>
      </div>

    </div>
  );
}
