import { useState } from 'react';
import { ArrowUpDown, Filter, AlertTriangle, MapPin, Clock, Wrench } from 'lucide-react';
import { GOLDEN_DEMANDS, ADDITIONAL_DEMANDS } from '../data/seedData';
import type { MaintenanceDemand, Department } from '../types';

const ALL_DEMANDS = [...GOLDEN_DEMANDS, ...ADDITIONAL_DEMANDS].sort((a, b) => b.arci_score - a.arci_score);

const DEPT_BADGE: Record<Department, string> = { 'Civil': 'badge--civil', 'S&T': 'badge--snt', 'TRD': 'badge--trd' };

function getARCIColor(score: number) {
  if (score >= 90) return 'var(--arci-critical)';
  if (score >= 70) return 'var(--arci-high)';
  if (score >= 40) return 'var(--arci-moderate)';
  return 'var(--arci-low)';
}

export default function DemandsPage() {
  const [filter, setFilter] = useState<Department | 'all'>('all');
  const [sortBy, setSortBy] = useState<'arci' | 'date'>('arci');

  const filtered = ALL_DEMANDS
    .filter(d => filter === 'all' || d.department === filter)
    .sort((a, b) => sortBy === 'arci' ? b.arci_score - a.arci_score : new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());

  return (
    <div className="animate-fade-in-up">
      <div className="page-header">
        <div className="page-header__breadcrumb">
          <span>Prioritisation</span>
          <span className="page-header__breadcrumb-sep">/</span>
          <span>Maintenance Demands</span>
        </div>
        <h1 className="page-header__title">Maintenance Demand Queue</h1>
        <p className="page-header__subtitle">
          {ALL_DEMANDS.length} demands across 3 departments • Sorted by ARCI risk score
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <button className={`btn btn--sm ${filter === 'all' ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setFilter('all')}>
          <Filter size={12} /> All ({ALL_DEMANDS.length})
        </button>
        {(['Civil', 'S&T', 'TRD'] as Department[]).map(dept => (
          <button key={dept} className={`btn btn--sm ${filter === dept ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setFilter(dept)}>
            {dept} ({ALL_DEMANDS.filter(d => d.department === dept).length})
          </button>
        ))}
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn--sm btn--ghost" onClick={() => setSortBy(sortBy === 'arci' ? 'date' : 'arci')}>
            <ArrowUpDown size={12} /> {sortBy === 'arci' ? 'By ARCI' : 'By Date'}
          </button>
        </div>
      </div>

      {/* Demand Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {filtered.map((demand, i) => (
          <DemandCard key={demand.id} demand={demand} index={i} />
        ))}
      </div>
    </div>
  );
}

function DemandCard({ demand, index }: { demand: MaintenanceDemand; index: number }) {
  return (
    <div className="card animate-fade-in-up" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="card__body" style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* ARCI Score Pill */}
        <div style={{
          width: 56, height: 56, borderRadius: 'var(--radius-lg)',
          background: getARCIColor(demand.arci_score),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontWeight: 800, fontSize: 'var(--text-lg)',
          flexShrink: 0, boxShadow: `0 4px 12px ${getARCIColor(demand.arci_score)}40`,
        }}>
          {demand.arci_score}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)', flexWrap: 'wrap' }}>
            <span className={`badge ${DEPT_BADGE[demand.department]}`}>{demand.department}</span>
            <span className={`badge ${demand.priority === 'emergency' ? 'badge--critical' : demand.priority === 'urgent' ? 'badge--proposed' : 'badge--info'}`}>
              {demand.priority === 'emergency' && <AlertTriangle size={10} />}
              {demand.priority}
            </span>
            <span className="badge badge--violet">{demand.status}</span>
            <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--espresso-light)', opacity: 0.5, fontFamily: 'var(--font-mono)' }}>
              {demand.id}
            </span>
          </div>
          <h4 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
            {demand.title}
          </h4>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--espresso-light)', opacity: 0.7, marginBottom: 'var(--space-2)' }}>
            {demand.description}
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', fontSize: 'var(--text-xs)', color: 'var(--espresso-light)', opacity: 0.5 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <MapPin size={11} /> KM {demand.chainage_start_km}–{demand.chainage_end_km} {demand.line}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={11} /> {demand.estimated_duration_min} min
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Wrench size={11} /> {demand.work_type}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
