import { useState } from 'react';
import { CheckSquare, Download, History, Printer, Key } from 'lucide-react';
import { soundFx } from '../utils/audio';

interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  operator: string;
  details: string;
  hash: string;
}

const AUDIT_LOG: AuditEntry[] = [
  {
    id: 'AUD-089',
    timestamp: '2026-09-10 20:45:12 IST',
    action: 'JOINT_CONCURRENCE_SIGNED',
    operator: 'Sr. DEN / Civil / Agra',
    details: 'Digital Certificate DSC-DEN-4491 applied to JB-2025-03-12-001',
    hash: '0x8f4c...91b2',
  },
  {
    id: 'AUD-088',
    timestamp: '2026-09-10 20:44:50 IST',
    action: 'JOINT_CONCURRENCE_SIGNED',
    operator: 'Sr. DEE / TRD / Agra',
    details: 'Digital Certificate DSC-DEE-2018 applied to 25kV OHE isolation',
    hash: '0x3a19...d04e',
  },
  {
    id: 'AUD-087',
    timestamp: '2026-09-10 20:42:01 IST',
    action: 'OPTIMIZER_EXECUTION_COMPLETED',
    operator: 'SYSTEM / CP-SAT Annealer',
    details: 'Iterations: 6,000, Objective Z: 240.5, Blocks bundled: 18',
    hash: '0xec72...49a1',
  },
  {
    id: 'AUD-086',
    timestamp: '2026-09-10 19:15:30 IST',
    action: 'TSR_409B_DISPATCHED',
    operator: 'Section Controller / Agra',
    details: 'Speed restriction 30 km/h KM 143+120 transmitted to Kavach HUD',
    hash: '0x712d...ff84',
  },
];

export default function BDMSHandoffPage() {
  const denSigned = true;
  const deeSigned = true;
  const [dsteSigned, setDsteSigned] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const handleSignDste = () => {
    soundFx.playSuccess();
    setDsteSigned(true);
  };

  const handleDownloadJson = () => {
    soundFx.playClick();
    const payload = {
      bdms_schema_version: '4.2-CRIS',
      corridor_code: 'NCR_NDLS_CNB',
      division: 'AGRA',
      export_timestamp: new Date().toISOString(),
      authorized_joint_blocks: [
        {
          block_id: 'JB-2025-03-12-001',
          chainage_from: 142.4,
          chainage_to: 148.2,
          line: 'UP',
          start_time: '01:05',
          end_time: '04:15',
          duration_min: 190,
          departments: ['Civil', 'S&T', 'TRD'],
          concurrence_status: 'FULLY_CONCURRED',
        }
      ]
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'BDMS_Joint_Blocks_Export_NCR.json';
    a.click();
    setExportNotice('Downloaded official BDMS-compliant JSON payload.');
  };

  return (
    <div className="bdms-handoff-page animate-fade-in" style={{ padding: '4px 0 40px' }}>
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--muted-sage)', textTransform: 'uppercase', fontWeight: 700 }}>
          <span>ACT (OPTIMIZATION &amp; GOVERNANCE)</span>
          <span>/</span>
          <span>MODULE 8</span>
          <span>/</span>
          <span style={{ color: 'var(--warm-stone)' }}>CRIS BDMS HAND-OFF &amp; AUDIT</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: '4px 0 0', color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckSquare size={24} style={{ color: '#4B655C' }} />
            <span>BDMS Hand-off Console &amp; Immutable Audit Ledger</span>
          </h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--forest btn--sm" onClick={handleDownloadJson}>
              <Download size={14} />
              <span>Export BDMS JSON</span>
            </button>
            <button className="btn btn--secondary btn--sm" onClick={() => window.print()}>
              <Printer size={14} />
              <span>Print Joint Circular</span>
            </button>
          </div>
        </div>
      </div>

      {exportNotice && (
        <div className="animate-fade-in" style={{
          padding: '10px 14px',
          background: 'rgba(75, 101, 92, 0.25)',
          border: '1px solid #4B655C',
          borderRadius: 'var(--radius-sm)',
          color: '#8be0c3',
          fontSize: 12,
          fontWeight: 700,
          marginBottom: 'var(--space-4)'
        }}>
          &bull; {exportNotice}
        </div>
      )}

      {/* Joint Concurrence Sign-off Matrix */}
      <div className="card--editorial" style={{ padding: '20px', marginBottom: 'var(--space-5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: '#111614' }}>
              Joint Inter-Directorate Concurrence Matrix
            </h3>
            <div style={{ fontSize: 11, color: 'var(--muted-sage)' }}>
              Official multi-departmental concurrence required before transmission to Control Office Application (COA)
            </div>
          </div>
          <span className={`badge ${denSigned && deeSigned && dsteSigned ? 'badge--forest-green' : 'badge--warm-stone'}`}>
            {denSigned && deeSigned && dsteSigned ? 'FULLY AUTHORIZED (3/3)' : 'PENDING 1 SIGNATURE'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {/* Officer 1: Sr. DEN (Civil) */}
          <div style={{ padding: '14px', background: '#F8FAF6', borderRadius: 8, border: '1px solid #E1E4DC' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#A85A48' }}>CIVIL (P-WAY)</span>
              <span className="badge badge--forest-green" style={{ fontSize: 9 }}>CONCURRED</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#111614', marginTop: 4 }}>Sr. Divisional Engineer</div>
            <div style={{ fontSize: 11, color: '#738166', marginTop: 2 }}>DSC Certificate: DSC-DEN-4491 Verified</div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#4B655C', marginTop: 6 }}>
              Timestamp: 2026-09-10 20:45:12 IST
            </div>
          </div>

          {/* Officer 2: Sr. DEE (Electrical TRD) */}
          <div style={{ padding: '14px', background: '#F8FAF6', borderRadius: 8, border: '1px solid #E1E4DC' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#A8A174' }}>ELECTRICAL (TRD)</span>
              <span className="badge badge--forest-green" style={{ fontSize: 9 }}>CONCURRED</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#111614', marginTop: 4 }}>Sr. Divisional Electrical Engr</div>
            <div style={{ fontSize: 11, color: '#738166', marginTop: 2 }}>DSC Certificate: DSC-DEE-2018 Verified</div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#4B655C', marginTop: 6 }}>
              Timestamp: 2026-09-10 20:44:50 IST
            </div>
          </div>

          {/* Officer 3: Sr. DSTE (Signal & Telecom) */}
          <div style={{ padding: '14px', background: '#F8FAF6', borderRadius: 8, border: '1px solid #E1E4DC' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#8B5CF6' }}>SIGNAL &amp; TELECOM</span>
              <span className={`badge ${dsteSigned ? 'badge--forest-green' : 'badge--rust'}`} style={{ fontSize: 9 }}>
                {dsteSigned ? 'CONCURRED' : 'PENDING'}
              </span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#111614', marginTop: 4 }}>Sr. Div Signal &amp; Telecom Engr</div>
            <div style={{ fontSize: 11, color: '#738166', marginTop: 2 }}>
              {dsteSigned ? 'DSC Certificate: DSC-DSTE-9102 Verified' : 'Awaiting digital token PIN signature'}
            </div>
            {dsteSigned ? (
              <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#4B655C', marginTop: 6 }}>
                Timestamp: Just now
              </div>
            ) : (
              <button
                className="btn btn--forest btn--sm"
                onClick={handleSignDste}
                style={{ marginTop: 8, width: '100%' }}
              >
                <Key size={12} />
                <span>Apply DSC Token Signature</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Immutable Chronological Audit Trail */}
      <div className="card--panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, borderBottom: '1px solid var(--border-color)', paddingBottom: 10 }}>
          <History size={18} style={{ color: 'var(--warm-stone)' }} />
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: '#FFFFFF' }}>
            Immutable Statutory Audit Trail (SHA-256 Verified)
          </h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {AUDIT_LOG.map(entry => (
            <div key={entry.id} style={{
              padding: '12px 14px',
              background: 'var(--surface-2)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#FFFFFF' }}>{entry.action}</span>
                  <span className="badge badge--dark-olive">{entry.id}</span>
                  <span style={{ fontSize: 10, color: 'var(--muted-sage)', fontFamily: 'var(--font-mono)' }}>{entry.timestamp}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {entry.details} &bull; <em>{entry.operator}</em>
                </div>
              </div>

              <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--warm-stone)', background: 'var(--surface-3)', padding: '2px 8px', borderRadius: 4 }}>
                Hash: {entry.hash}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
