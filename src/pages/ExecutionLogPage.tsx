import { useState } from 'react';
import { PlayCircle, CheckCircle2, CheckSquare, Search } from 'lucide-react';
import { soundFx } from '../utils/audio';

interface BlockExecutionRecord {
  id: string;
  blockNo: string;
  section: string;
  line: 'UP' | 'DN' | 'Both';
  dept: 'ENG' | 'OHE' | 'SIG' | 'JOINT';
  task: string;
  machine: string;
  plannedStart: string;
  plannedEnd: string;
  actualStart?: string;
  actualEnd?: string;
  status: 'PENDING_START' | 'IN_PROGRESS' | 'CLEARED' | 'OVERRUN';
  planAdherenceMin?: number;
  burstDelayMin?: number;
  handbackChecklistDone: boolean;
}

const INITIAL_RECORDS: BlockExecutionRecord[] = [
  {
    id: 'EXEC-001',
    blockNo: 'BLK-NCR-2026-0881',
    section: 'KRJ – SOM (KM 118.2 – 124.8)',
    line: 'UP',
    dept: 'JOINT',
    task: 'Co-located Track Tamping (CSM 922) + Catenary Wire Adjustment',
    machine: 'CSM 922, T-Wagon 12',
    plannedStart: '01:30',
    plannedEnd: '04:30',
    actualStart: '01:32',
    actualEnd: undefined,
    status: 'IN_PROGRESS',
    planAdherenceMin: -2,
    burstDelayMin: 0,
    handbackChecklistDone: false,
  },
  {
    id: 'EXEC-002',
    blockNo: 'BLK-NCR-2026-0882',
    section: 'DKDE – WAIR (KM 64.0 – 68.5)',
    line: 'DN',
    dept: 'ENG',
    task: 'Rail Defect USFD IMR Joint Replacement (Cut & Weld)',
    machine: 'A-Frame Mobile Gantry',
    plannedStart: '02:00',
    plannedEnd: '03:30',
    actualStart: '02:00',
    actualEnd: '03:26',
    status: 'CLEARED',
    planAdherenceMin: 4,
    burstDelayMin: 0,
    handbackChecklistDone: true,
  },
  {
    id: 'EXEC-003',
    blockNo: 'BLK-NCR-2026-0883',
    section: 'ALJN Yard (Point 204B)',
    line: 'Both',
    dept: 'SIG',
    task: 'Point Machine Replacement & Interlocking Disconnection',
    machine: 'S&T Gang Tool Set',
    plannedStart: '03:00',
    plannedEnd: '04:15',
    actualStart: undefined,
    actualEnd: undefined,
    status: 'PENDING_START',
    planAdherenceMin: undefined,
    burstDelayMin: 0,
    handbackChecklistDone: false,
  },
  {
    id: 'EXEC-004',
    blockNo: 'BLK-NCR-2026-0879',
    section: 'DAR – SKQ (KM 94.0 – 99.2)',
    line: 'UP',
    dept: 'OHE',
    task: 'Dropper Replacement & Cantilever Inspection',
    machine: 'TRD Tower Wagon 04',
    plannedStart: '23:30',
    plannedEnd: '01:00',
    actualStart: '23:35',
    actualEnd: '01:14',
    status: 'CLEARED',
    planAdherenceMin: -14,
    burstDelayMin: 14,
    handbackChecklistDone: true,
  },
];

export default function ExecutionLogPage() {
  const [records, setRecords] = useState<BlockExecutionRecord[]>(INITIAL_RECORDS);
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<BlockExecutionRecord | null>(INITIAL_RECORDS[0]);

  const handleStartBlock = (id: string) => {
    soundFx.playSuccess();
    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 5);
    setRecords((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, status: 'IN_PROGRESS', actualStart: timeStr } : r
      )
    );
  };

  const handleClearBlock = (id: string) => {
    soundFx.playSuccess();
    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 5);
    setRecords((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: 'CLEARED',
              actualEnd: timeStr,
              handbackChecklistDone: true,
            }
          : r
      )
    );
  };

  const filtered = records.filter((r) => {
    const matchesDept = selectedDept === 'ALL' || r.dept === selectedDept;
    const matchesSearch =
      r.blockNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.section.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.task.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesDept && matchesSearch;
  });

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
            <PlayCircle size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: 700, margin: 0, color: '#FFFFFF' }}>
                Block Execution Log &bull; ब्लॉक निष्पादन लॉग
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
                [E] Module 13
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '0.86rem', color: 'rgba(255,255,255,0.7)' }}>
              Real-time field block possession tracking, digital start/clear commands, plan adherence KPIs, and track safety handback verification.
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
            PLAN ADHERENCE: 98.4%
          </span>
        </div>
      </div>

      {/* KPI Overview Pods */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '14px'
      }}>
        <div className="card--editorial" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '0.74rem', color: '#666' }}>Active Possessions</span>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-forest-green)' }}>
            1 In Progress
          </div>
          <span style={{ fontSize: '0.7rem', color: '#888' }}>1 Pending Start &bull; 2 Cleared Today</span>
        </div>

        <div className="card--editorial" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '0.74rem', color: '#666' }}>Avg. Handback Variance</span>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-dark-olive)' }}>
            +3.2 mins
          </div>
          <span style={{ fontSize: '0.7rem', color: '#888' }}>Target: &lt; 5 mins &bull; JPO Compliant</span>
        </div>

        <div className="card--editorial" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '0.74rem', color: '#666' }}>Burst Delay Impact</span>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-rust)' }}>
            14 mins
          </div>
          <span style={{ fontSize: '0.7rem', color: '#888' }}>OHE Dropper swap late clearance</span>
        </div>

        <div className="card--editorial" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '0.74rem', color: '#666' }}>Safety Reconnection Form T/351</span>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-forest-green)' }}>
            100% Signed
          </div>
          <span style={{ fontSize: '0.7rem', color: '#888' }}>0 Uninterlocked moves permitted</span>
        </div>
      </div>

      {/* Main Grid: Table & Inspection Drawer */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: '20px' }}>
        
        {/* Execution Table */}
        <div className="card--editorial" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Controls Strip */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F8FAF6', padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', flex: 1, minWidth: '200px' }}>
              <Search size={14} color="#888" />
              <input
                type="text"
                placeholder="Search block no, section, or task..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.82rem', width: '100%', color: '#111614' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              {['ALL', 'JOINT', 'ENG', 'OHE', 'SIG'].map((dept) => (
                <button
                  key={dept}
                  onClick={() => setSelectedDept(dept)}
                  style={{
                    background: selectedDept === dept ? 'var(--color-dark-olive)' : '#F8FAF6',
                    color: selectedDept === dept ? '#FFFFFF' : '#444',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-pill)',
                    padding: '4px 10px',
                    fontSize: '0.74rem',
                    cursor: 'pointer',
                    fontWeight: selectedDept === dept ? 600 : 400
                  }}
                >
                  {dept}
                </button>
              ))}
            </div>
          </div>

          {/* List of Blocks */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filtered.map((item) => {
              const isSelected = selectedRecord?.id === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedRecord(item)}
                  style={{
                    padding: '14px',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${isSelected ? 'var(--color-forest-green)' : 'var(--color-border)'}`,
                    background: isSelected ? 'rgba(75, 101, 92, 0.04)' : '#F8FAF6',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.84rem', color: '#111614' }}>
                        {item.blockNo}
                      </span>
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 'var(--radius-pill)',
                        background: item.dept === 'JOINT' ? 'rgba(75, 101, 92, 0.2)' : 'rgba(52, 57, 39, 0.15)',
                        color: item.dept === 'JOINT' ? 'var(--color-forest-green)' : 'var(--color-dark-olive)'
                      }}>
                        {item.dept} &bull; {item.line} Line
                      </span>
                    </div>

                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-pill)',
                      background: item.status === 'IN_PROGRESS'
                        ? 'rgba(75, 101, 92, 0.15)'
                        : item.status === 'CLEARED'
                        ? 'rgba(52, 57, 39, 0.15)'
                        : 'rgba(168, 161, 116, 0.25)',
                      color: item.status === 'IN_PROGRESS'
                        ? 'var(--color-forest-green)'
                        : item.status === 'CLEARED'
                        ? 'var(--color-dark-olive)'
                        : '#738166'
                    }}>
                      {item.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.8rem', color: '#333', fontWeight: 500 }}>
                    {item.task}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', color: '#666', borderTop: '1px dashed #E0E4DE', paddingTop: '6px' }}>
                    <span>{item.section}</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                      Planned: {item.plannedStart} &ndash; {item.plannedEnd}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

        </div>

        {/* Selected Block Action & Handback Station */}
        {selectedRecord && (
          <div className="card--editorial" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--color-warm-stone)', background: 'var(--color-surface)', padding: '2px 8px', borderRadius: 'var(--radius-pill)' }}>
                  EXECUTION DESK
                </span>
                <h3 style={{ margin: '8px 0 2px', fontSize: '1.15rem', fontWeight: 700, color: '#111614' }}>
                  {selectedRecord.blockNo}
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#666' }}>{selectedRecord.section}</div>
              </div>

              <span style={{
                fontSize: '0.74rem',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 'var(--radius-pill)',
                background: selectedRecord.status === 'IN_PROGRESS' ? 'rgba(75, 101, 92, 0.15)' : 'rgba(52, 57, 39, 0.15)',
                color: selectedRecord.status === 'IN_PROGRESS' ? 'var(--color-forest-green)' : 'var(--color-dark-olive)'
              }}>
                {selectedRecord.status.replace('_', ' ')}
              </span>
            </div>

            {/* Timings & Adherence Bar */}
            <div style={{ background: '#F8FAF6', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: '#666' }}>Planned Duration:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#111614' }}>
                  {selectedRecord.plannedStart} &ndash; {selectedRecord.plannedEnd} (180 mins)
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: '#666' }}>Actual Start Timestamp:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-forest-green)' }}>
                  {selectedRecord.actualStart ? `${selectedRecord.actualStart} IST` : 'Not Started'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: '#666' }}>Actual Handback Clearance:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: selectedRecord.actualEnd ? 'var(--color-forest-green)' : '#888' }}>
                  {selectedRecord.actualEnd ? `${selectedRecord.actualEnd} IST` : 'Line Occupied'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: '#666' }}>Assigned Machinery:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#111614' }}>
                  {selectedRecord.machine}
                </span>
              </div>
            </div>

            {/* Safety Handback Checklist */}
            <div>
              <h4 style={{ margin: '0 0 8px', fontSize: '0.86rem', fontWeight: 600, color: '#111614' }}>
                Statutory Track Handback Checklist (Form T/351 & T/409B):
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {[
                  'Track gauge, cross-level & alignment verified within IRPWM limits',
                  'Heavy machines (CSM/BCM) cleared from section and secured on sidings',
                  'OHE 25 kV traction earth discharge rods safely removed by TRD gang',
                  'Station Master Form T/351 Reconnection memo transmitted and acknowledged',
                  'All detonators and danger red banner flags removed from track'
                ].map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#444' }}>
                    <CheckSquare size={14} color="var(--color-forest-green)" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Operational Action Buttons */}
            <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
              {selectedRecord.status === 'PENDING_START' && (
                <button
                  onClick={() => handleStartBlock(selectedRecord.id)}
                  className="btn--forest"
                  style={{ flex: 1, padding: '12px', fontSize: '0.86rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <PlayCircle size={16} />
                  Authorize & Start Block Possession
                </button>
              )}

              {selectedRecord.status === 'IN_PROGRESS' && (
                <button
                  onClick={() => handleClearBlock(selectedRecord.id)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    fontSize: '0.86rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    background: 'var(--color-dark-olive)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <CheckCircle2 size={16} />
                  Execute Safety Handback & Clear Block
                </button>
              )}

              {selectedRecord.status === 'CLEARED' && (
                <div style={{
                  flex: 1,
                  padding: '12px',
                  background: 'rgba(75, 101, 92, 0.15)',
                  border: '1px solid var(--color-forest-green)',
                  borderRadius: 'var(--radius-sm)',
                  textAlign: 'center',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  color: 'var(--color-forest-green)'
                }}>
                  Block Fully Cleared & Logged in Audit Ledger
                </div>
              )}
            </div>

          </div>
        )}

      </div>

    </div>
  );
}
