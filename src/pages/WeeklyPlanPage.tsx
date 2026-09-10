import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays, AlertTriangle, Layers, Shield, CheckCircle2
} from 'lucide-react';
import { soundFx } from '../utils/audio';

interface BlockTask {
  id: string;
  name: string;
  department: 'Civil' | 'S&T' | 'TRD';
  day: string;
  startHour: number;
  durationHours: number;
  kmStart: number;
  kmEnd: number;
  line: 'UP' | 'DN';
  status: 'Approved' | 'Clashing' | 'Pending';
  machine: string;
  freightImpact: string;
}

const WEEKLY_BLOCKS: BlockTask[] = [
  {
    id: 'BLK-W01',
    name: 'CSM 09-32 Track Tamping & Alignment',
    department: 'Civil',
    day: 'Mon',
    startHour: 1,
    durationHours: 3.2,
    kmStart: 142.4,
    kmEnd: 148.2,
    line: 'UP',
    status: 'Approved',
    machine: 'Plasser CSM 09-32',
    freightImpact: '0 delays (WTT Gap 14.2m utilized)',
  },
  {
    id: 'BLK-W02',
    name: 'OHE Catenary Dropper & Insulator Replace',
    department: 'TRD',
    day: 'Mon',
    startHour: 1,
    durationHours: 3.2,
    kmStart: 142.4,
    kmEnd: 148.2,
    line: 'UP',
    status: 'Approved',
    machine: 'Self-Propelled Tower Wagon #804',
    freightImpact: 'Bundled with Civil Tamping',
  },
  {
    id: 'BLK-W03',
    name: 'Point Machine 204B Overhaul & Lubrication',
    department: 'S&T',
    day: 'Mon',
    startHour: 1.5,
    durationHours: 2.0,
    kmStart: 143.0,
    kmEnd: 143.2,
    line: 'UP',
    status: 'Approved',
    machine: 'Digital Point Analyzer Kit',
    freightImpact: 'Form T/351 Disconnection Active',
  },
  {
    id: 'BLK-W04',
    name: 'Flash Butt Rail Welding (USFD IMR Removal)',
    department: 'Civil',
    day: 'Wed',
    startHour: 13,
    durationHours: 2.5,
    kmStart: 88.0,
    kmEnd: 88.5,
    line: 'DN',
    status: 'Approved',
    machine: 'FBW Plant Mobile Unit #12',
    freightImpact: '1 Freight held at Vrindavan Siding (22 min)',
  },
  {
    id: 'BLK-W05',
    name: 'OHE Cantilever Stagger Re-alignment',
    department: 'TRD',
    day: 'Wed',
    startHour: 13.5,
    durationHours: 2.0,
    kmStart: 87.5,
    kmEnd: 89.0,
    line: 'DN',
    status: 'Approved',
    machine: 'Wiring Train WT-44',
    freightImpact: 'Co-located on single DN power cut',
  },
  {
    id: 'BLK-W06',
    name: 'Electronic Interlocking VDU Diagnostic Audit',
    department: 'S&T',
    day: 'Fri',
    startHour: 2,
    durationHours: 2.0,
    kmStart: 110.0,
    kmEnd: 112.0,
    line: 'UP',
    status: 'Approved',
    machine: 'Kyosan EI Firmware Programmer',
    freightImpact: 'Zero traffic interruption',
  },
  {
    id: 'BLK-W07',
    name: 'BCM Ballast Cleaning Machine Trial',
    department: 'Civil',
    day: 'Sat',
    startHour: 0,
    durationHours: 4.0,
    kmStart: 62.0,
    kmEnd: 66.0,
    line: 'DN',
    status: 'Clashing',
    machine: 'Plasser BCM RM-80',
    freightImpact: 'CONFLICT: Intersects with Train #12952 (Rajdhani)',
  },
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function WeeklyPlanPage() {
  const navigate = useNavigate();
  const [selectedLine, setSelectedLine] = useState<'ALL' | 'UP' | 'DN'>('ALL');
  const [selectedDept, setSelectedDept] = useState<'ALL' | 'Civil' | 'TRD' | 'S&T'>('ALL');
  const [activeBlock, setActiveBlock] = useState<BlockTask | null>(WEEKLY_BLOCKS[0]);

  const filteredBlocks = WEEKLY_BLOCKS.filter(b => {
    const lineMatch = selectedLine === 'ALL' || b.line === selectedLine;
    const deptMatch = selectedDept === 'ALL' || b.department === selectedDept;
    return lineMatch && deptMatch;
  });

  return (
    <div className="weekly-plan-page animate-fade-in" style={{ padding: '4px 0 40px' }}>
      {/* Module Title Header */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--muted-sage)', textTransform: 'uppercase', fontWeight: 700 }}>
          <span>PLAN (TACTICAL)</span>
          <span>/</span>
          <span>MODULE 2</span>
          <span>/</span>
          <span style={{ color: 'var(--warm-stone)' }}>7-DAY TACTICAL GANTT</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: '4px 0 0', color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: 10 }}>
            <CalendarDays size={24} style={{ color: '#4B655C' }} />
            <span>Weekly Block Plan (7-Day Micro Gantt)</span>
          </h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--forest btn--sm" onClick={() => navigate('/studio')}>
              <Layers size={14} />
              <span>Tune Optimizer</span>
            </button>
            <button className="btn btn--secondary btn--sm" onClick={() => navigate('/handoff')}>
              <Shield size={14} />
              <span>BDMS Sign-off</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter Toolbar & Line Controls */}
      <div className="card--panel" style={{ padding: '12px 16px', marginBottom: 'var(--space-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        {/* Line Filter Toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-sage)' }}>Line:</span>
          {(['ALL', 'UP', 'DN'] as const).map(line => (
            <button
              key={line}
              className={`btn btn--sm ${selectedLine === line ? 'btn--forest' : 'btn--secondary'}`}
              onClick={() => {
                soundFx.playClick();
                setSelectedLine(line);
              }}
              style={{ padding: '4px 12px', fontSize: 11 }}
            >
              {line === 'ALL' ? 'Both Lines' : `${line} Line`}
            </button>
          ))}
        </div>

        {/* Department Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-sage)' }}>Department:</span>
          {(['ALL', 'Civil', 'TRD', 'S&T'] as const).map(dept => (
            <button
              key={dept}
              className={`btn btn--sm ${selectedDept === dept ? 'btn--forest' : 'btn--secondary'}`}
              onClick={() => {
                soundFx.playClick();
                setSelectedDept(dept);
              }}
              style={{ padding: '4px 10px', fontSize: 11 }}
            >
              {dept === 'ALL' ? 'All Depts' : dept === 'Civil' ? 'TMS (Civil)' : dept === 'TRD' ? 'TDMS (TRD)' : 'SMMS (S&T)'}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--warm-stone)', fontWeight: 700 }}>
          {filteredBlocks.length} Scheduled Windows
        </div>
      </div>

      {/* Main Gantt Grid Canvas */}
      <div className="card--editorial" style={{ padding: '16px', marginBottom: 'var(--space-4)', overflowX: 'auto' }}>
        <div style={{ minWidth: 920 }}>
          {/* Gantt Hours Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '80px repeat(24, 1fr)', borderBottom: '2px solid #E1E4DC', paddingBottom: 8, marginBottom: 8, fontSize: 10, fontFamily: 'var(--font-mono)', color: '#738166', textAlign: 'center' }}>
            <div style={{ textAlign: 'left', fontWeight: 800 }}>DAY</div>
            {HOURS.map(h => (
              <div key={h}>{h < 10 ? `0${h}` : h}h</div>
            ))}
          </div>

          {/* Days Rows */}
          {DAYS.map(day => {
            const dayBlocks = filteredBlocks.filter(b => b.day === day);
            return (
              <div key={day} style={{ display: 'grid', gridTemplateColumns: '80px 1fr', borderBottom: '1px solid #E1E4DC', minHeight: 48, alignItems: 'center', padding: '4px 0' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#111614' }}>
                  {day}
                </div>

                <div style={{ position: 'relative', width: '100%', height: 38, background: '#F8FAF6', borderRadius: 6 }}>
                  {/* Grid hour divider lines */}
                  {HOURS.map(h => (
                    <div key={h} style={{ position: 'absolute', left: `${(h / 24) * 100}%`, top: 0, bottom: 0, width: 1, background: '#E1E4DC' }} />
                  ))}

                  {/* Scheduled Block Bars */}
                  {dayBlocks.map(block => {
                    const leftPct = (block.startHour / 24) * 100;
                    const widthPct = (block.durationHours / 24) * 100;
                    const isSelected = activeBlock?.id === block.id;
                    const isClashing = block.status === 'Clashing';

                    return (
                      <div
                        key={block.id}
                        onClick={() => {
                          soundFx.playClick();
                          setActiveBlock(block);
                        }}
                        style={{
                          position: 'absolute',
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          top: 4,
                          bottom: 4,
                          background: isClashing ? '#872D1C' : block.department === 'Civil' ? '#4B655C' : block.department === 'TRD' ? '#343927' : '#8B5CF6',
                          color: '#FFFFFF',
                          borderRadius: 6,
                          padding: '2px 8px',
                          fontSize: 10,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          boxShadow: isSelected ? '0 0 0 2px #A8A174, 0 4px 12px rgba(0,0,0,0.3)' : '0 2px 4px rgba(0,0,0,0.15)',
                          border: isClashing ? '1px solid #FF8080' : 'none',
                          zIndex: isSelected ? 10 : 2,
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          transition: 'transform 100ms',
                        }}
                        title={`${block.id}: ${block.name} (${block.department})`}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          [{block.department}] {block.name}
                        </span>
                        <span style={{ fontSize: 9, fontFamily: 'monospace', opacity: 0.85, marginLeft: 4 }}>
                          {block.durationHours}h
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Block Drawer Inspector (Details for Clicked Block) */}
      {activeBlock && (
        <div className="card--panel animate-scale-in" style={{ padding: '20px', border: '1px solid var(--muted-sage)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, borderBottom: '1px solid var(--border-color)', paddingBottom: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span className="badge badge--dark-olive">INSPECTOR: {activeBlock.id}</span>
                <span className={`badge ${activeBlock.status === 'Clashing' ? 'badge--rust' : 'badge--forest-green'}`}>
                  {activeBlock.status}
                </span>
                <span className="badge badge--warm-stone">{activeBlock.line} LINE</span>
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: '#FFFFFF', margin: 0 }}>
                {activeBlock.name}
              </h2>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {activeBlock.status === 'Clashing' ? (
                <button
                  className="btn btn--rust btn--sm"
                  onClick={() => {
                    soundFx.playSuccess();
                    navigate('/studio');
                  }}
                >
                  <AlertTriangle size={14} />
                  <span>Resolve in Optimiser Studio</span>
                </button>
              ) : (
                <button
                  className="btn btn--forest btn--sm"
                  onClick={() => {
                    soundFx.playSuccess();
                    navigate('/handoff');
                  }}
                >
                  <CheckCircle2 size={14} />
                  <span>Sign Digital Concurrence</span>
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 16 }}>
            <div>
              <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--muted-sage)', fontWeight: 700 }}>Chainage Location:</span>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', marginTop: 2 }}>
                KM {activeBlock.kmStart} &ndash; KM {activeBlock.kmEnd} ({activeBlock.line} Fast Track)
              </div>
            </div>

            <div>
              <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--muted-sage)', fontWeight: 700 }}>Possession Window:</span>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', marginTop: 2 }}>
                {activeBlock.day} &bull; {activeBlock.startHour}:00 &ndash; {activeBlock.startHour + Math.floor(activeBlock.durationHours)}:{(activeBlock.durationHours % 1 * 60).toFixed(0).padStart(2, '0')} IST ({activeBlock.durationHours} hrs)
              </div>
            </div>

            <div>
              <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--muted-sage)', fontWeight: 700 }}>Deployed Machinery:</span>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#8be0c3', marginTop: 2 }}>
                {activeBlock.machine}
              </div>
            </div>

            <div>
              <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--muted-sage)', fontWeight: 700 }}>Train Traffic Impact:</span>
              <div style={{ fontSize: 12, fontWeight: 600, color: activeBlock.status === 'Clashing' ? '#F87171' : 'var(--text-secondary)', marginTop: 2 }}>
                {activeBlock.freightImpact}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
