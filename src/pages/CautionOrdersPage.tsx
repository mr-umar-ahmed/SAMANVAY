import { useState } from 'react';
import { FileText, Printer, Download, AlertTriangle, CheckCircle2, Shield, QrCode } from 'lucide-react';
import { GOLDEN_CAUTION_ORDER } from '../data/seedData';
import { AshokaEmblem, IndianRailwaysLogo } from '../components/layout/Emblems';
import { soundFx } from '../utils/audio';

export default function CautionOrdersPage() {
  const [downloaded, setDownloaded] = useState(false);

  const handlePrint = () => {
    soundFx.playClick();
    window.print();
  };

  const handleExport = () => {
    soundFx.playSuccess();
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  };

  return (
    <div className="animate-fade-in-up">
      <div className="page-header">
        <div className="page-header__breadcrumb">
          <span>GOVERNANCE &amp; SAFETY</span>
          <span className="page-header__breadcrumb-sep">/</span>
          <span>INDIAN RAILWAYS OPERATING CODE</span>
          <span className="page-header__breadcrumb-sep">/</span>
          <span style={{ color: '#F59E0B' }}>FORM T/409B</span>
        </div>
        <h1 className="page-header__title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FileText size={24} style={{ color: '#F59E0B' }} />
          <span>Form T/409B &mdash; Official Caution Orders</span>
        </h1>
        <p className="page-header__subtitle">
          Statutory electronic Caution Order issued under General &amp; Subsidiary Rules (G&amp;SR 4.09) for speed restriction enforcement across Agra Division.
        </p>
      </div>

      {/* Caution Order Official Document */}
      <div className="card" style={{
        maxWidth: 780,
        margin: '0 auto',
        border: '2px solid var(--border-gold, rgba(245, 158, 11, 0.4))',
        boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
        background: 'var(--surface-0)',
        position: 'relative',
      }}>
        {/* Document Top Status Ribbon */}
        <div style={{
          background: 'linear-gradient(90deg, #1C1210 0%, #3E2723 100%)',
          color: '#FFFFFF',
          padding: '10px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <IndianRailwaysLogo size={24} />
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em' }}>
              OFFICIAL RAILWAY SAFETY DISPATCH &bull; FORM T/409B
            </span>
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: 4 }}>
            DISPATCH NO: {GOLDEN_CAUTION_ORDER.form_number}
          </span>
        </div>

        <div className="card__body" style={{ padding: 'var(--space-6)', position: 'relative' }}>
          {/* Official Indian Railways Masthead */}
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-5)', borderBottom: '1px solid var(--border-color)', paddingBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 8 }}>
              <AshokaEmblem size={42} />
              <IndianRailwaysLogo size={42} />
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-primary)', margin: 0 }}>
              भारत सरकार &bull; रेल मंत्रालय &bull; उत्तर मध्य रेलवे
            </h2>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-secondary)', marginTop: 2 }}>
              GOVERNMENT OF INDIA &bull; MINISTRY OF RAILWAYS &bull; NORTH CENTRAL RAILWAY
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Agra Division &bull; Office of the Senior Divisional Operations Manager (Sr. DOM)
            </div>

            <div style={{
              display: 'inline-block',
              margin: '12px auto 0',
              padding: '4px 16px',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#EF4444',
              fontSize: 13,
              fontWeight: 900,
              letterSpacing: '0.06em',
            }}>
              CAUTION ORDER (FORM T/409B) &bull; सतर्कता आदेश
            </div>
          </div>

          {/* Watermark Seal Representation */}
          <div style={{
            position: 'absolute',
            top: '42%',
            right: '12%',
            opacity: 0.12,
            pointerEvents: 'none',
            transform: 'rotate(-15deg)',
          }}>
            <IndianRailwaysLogo size={200} />
          </div>

          {/* Order Details Matrix */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 'var(--space-4)',
            marginBottom: 'var(--space-5)',
            fontSize: 'var(--text-sm)',
            background: 'var(--surface-1)',
            padding: 'var(--space-4)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
          }}>
            <div>
              <span className="label">Form Serial Number</span>
              <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: 13, color: '#F59E0B' }}>
                {GOLDEN_CAUTION_ORDER.form_number}
              </div>
            </div>

            <div>
              <span className="label">Associated Joint Block ID</span>
              <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: 13, color: '#D4B2BE' }}>
                {GOLDEN_CAUTION_ORDER.block_id}
              </div>
            </div>

            <div>
              <span className="label">Mandated Speed Restriction (SR)</span>
              <div style={{ fontWeight: 900, fontSize: 22, color: '#EF4444' }}>
                {GOLDEN_CAUTION_ORDER.speed_limit_kmph} km/h
              </div>
            </div>

            <div>
              <span className="label">Restricted Track Chainage</span>
              <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                KM {GOLDEN_CAUTION_ORDER.chainage_from_km} &mdash; KM {GOLDEN_CAUTION_ORDER.chainage_to_km} UP Fast
              </div>
            </div>

            <div>
              <span className="label">Enforcement Valid From</span>
              <div style={{ fontWeight: 700, fontSize: 12 }}>
                {new Date(GOLDEN_CAUTION_ORDER.valid_from).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
              </div>
            </div>

            <div>
              <span className="label">Enforcement Valid Until</span>
              <div style={{ fontWeight: 700, fontSize: 12 }}>
                {new Date(GOLDEN_CAUTION_ORDER.valid_until).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
              </div>
            </div>
          </div>

          {/* Operational Justification */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <span className="label">Operational Reason &amp; Safety Justification</span>
            <p style={{
              fontSize: 'var(--text-sm)',
              lineHeight: 1.6,
              background: 'rgba(245, 158, 11, 0.08)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              borderLeft: '4px solid #F59E0B',
              margin: '4px 0 0',
              color: 'var(--text-primary)',
            }}>
              {GOLDEN_CAUTION_ORDER.reason}
            </p>
          </div>

          {/* Departments Synchronized */}
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <span className="label">Integrated Stakeholder Departments</span>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)', flexWrap: 'wrap' }}>
              {GOLDEN_CAUTION_ORDER.departments_notified.map(d => (
                <span key={d} className={`badge ${d === 'Civil' ? 'badge--civil' : d === 'S&T' ? 'badge--snt' : 'badge--trd'}`} style={{ padding: '4px 12px', fontSize: 11 }}>
                  &bull; {d} Department Acknowledged
                </span>
              ))}
            </div>
          </div>

          <div className="divider" style={{ margin: 'var(--space-4) 0' }} />

          {/* Signatures, Official DRM Stamp & QR Code */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 'var(--space-4)',
            alignItems: 'center',
          }}>
            <div>
              <span className="label">Issued By Controller</span>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
                {GOLDEN_CAUTION_ORDER.issued_by}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Section Controller / NCR Agra
              </div>
              <div style={{ marginTop: 8, fontSize: 9.5, fontFamily: 'var(--font-mono)', color: '#10B981' }}>
                &bull; Digital Signature Verified (DSC-SIL4)
              </div>
            </div>

            {/* Official Circular DRM Stamp */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div className="gov-official-seal">
                <div>DIVISIONAL RLY MGR</div>
                <div style={{ fontSize: 12 }}>★</div>
                <div>AGRA &bull; NCR</div>
              </div>
            </div>

            {/* QR Verification for Cab In-Cab Signaling */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', textAlign: 'right' }}>
              <div style={{
                background: '#FFFFFF',
                padding: 6,
                borderRadius: 6,
                display: 'inline-flex',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              }}>
                <QrCode size={48} style={{ color: '#1C1210' }} />
              </div>
              <span style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                Scan to Verify (Loco Cab Kavach)
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="card__footer" style={{
          display: 'flex',
          gap: 'var(--space-3)',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          background: 'var(--surface-1)',
          borderTop: '1px solid var(--border-color)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            SECURITY PROTOCOL: RDSO / G&amp;SR 2025 COMPLIANT
          </span>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--sm btn--secondary" onClick={handlePrint}>
              <Printer size={13} />
              <span>Print Order (T/409B)</span>
            </button>
            <button className="btn btn--sm btn--primary" onClick={handleExport}>
              <Download size={13} />
              <span>{downloaded ? 'Exported Successfully!' : 'Export Form PDF'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
