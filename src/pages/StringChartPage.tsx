import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { TRAINS, STATIONS, GOLDEN_JOINT_BLOCK } from '../data/seedData';
import { ZoomIn, ZoomOut, RotateCcw, Info } from 'lucide-react';

const CHART_MARGIN = { top: 40, right: 30, bottom: 40, left: 80 };

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function formatTime(mins: number): string {
  const h = Math.floor(((mins % 1440) + 1440) % 1440 / 60);
  const m = ((mins % 1440) + 1440) % 1440 % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const TRAIN_COLORS: Record<string, string> = {
  rajdhani: '#E53935',
  shatabdi: '#1E88E5',
  express: '#43A047',
  mail: '#7B1FA2',
  freight: '#F4A460',
  suburban: '#78909C',
  special: '#FF8F00',
};

export default function StringChartPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 900, height: 600 });

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setDimensions({
          width: Math.max(entry.contentRect.width, 360),
          height: Math.max(entry.contentRect.height, 400),
        });
      }
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;

    const { width, height } = dimensions;
    const innerW = width - CHART_MARGIN.left - CHART_MARGIN.right;
    const innerH = height - CHART_MARGIN.top - CHART_MARGIN.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Scales
    const xScale = d3.scaleLinear().domain([0, 1440]).range([0, innerW]);
    const yScale = d3.scaleLinear().domain([0, 200]).range([0, innerH]);

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${CHART_MARGIN.left},${CHART_MARGIN.top})`);

    // Background
    g.append('rect')
      .attr('width', innerW)
      .attr('height', innerH)
      .attr('fill', '#FAFAF5')
      .attr('rx', 4);

    // Night band (22:00 – 06:00)
    const nightStart = xScale(22 * 60);
    const nightEnd = xScale(1440);
    const morningEnd = xScale(6 * 60);
    g.append('rect').attr('x', nightStart).attr('y', 0).attr('width', nightEnd - nightStart).attr('height', innerH).attr('fill', 'rgba(62,39,35,0.04)');
    g.append('rect').attr('x', 0).attr('y', 0).attr('width', morningEnd).attr('height', innerH).attr('fill', 'rgba(62,39,35,0.04)');

    // Grid lines - time
    for (let h = 0; h <= 24; h++) {
      const x = xScale(h * 60);
      g.append('line')
        .attr('x1', x).attr('y1', 0).attr('x2', x).attr('y2', innerH)
        .attr('stroke', 'rgba(62,39,35,0.06)')
        .attr('stroke-dasharray', h % 6 === 0 ? 'none' : '2,4');
      g.append('text')
        .attr('x', x).attr('y', -8)
        .attr('text-anchor', 'middle')
        .attr('font-size', 10).attr('font-weight', h % 6 === 0 ? 700 : 400)
        .attr('fill', 'rgba(62,39,35,0.4)')
        .attr('font-family', 'var(--font-mono)')
        .text(`${String(h % 24).padStart(2, '0')}:00`);
    }

    // Grid lines - stations
    STATIONS.forEach(st => {
      const y = yScale(st.chainage_km);
      g.append('line')
        .attr('x1', 0).attr('y1', y).attr('x2', innerW).attr('y2', y)
        .attr('stroke', 'rgba(62,39,35,0.08)');
      g.append('text')
        .attr('x', -8).attr('y', y + 4)
        .attr('text-anchor', 'end')
        .attr('font-size', 10).attr('font-weight', 600)
        .attr('fill', 'rgba(62,39,35,0.5)')
        .text(st.code);
    });

    // Joint Block overlay
    const blockStartMin = 1 * 60 + 5;
    const blockEndMin = 4 * 60 + 15;
    const blockY1 = yScale(GOLDEN_JOINT_BLOCK.chainage_start_km);
    const blockY2 = yScale(GOLDEN_JOINT_BLOCK.chainage_end_km);

    g.append('rect')
      .attr('x', xScale(blockStartMin))
      .attr('y', blockY1)
      .attr('width', xScale(blockEndMin) - xScale(blockStartMin))
      .attr('height', blockY2 - blockY1)
      .attr('fill', 'rgba(142, 147, 203, 0.18)')
      .attr('stroke', 'var(--crimson-violet)')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '6,3')
      .attr('rx', 4);

    // Block label
    g.append('text')
      .attr('x', xScale(blockStartMin) + 6)
      .attr('y', blockY1 - 6)
      .attr('font-size', 9).attr('font-weight', 700)
      .attr('fill', 'var(--violet-deep)')
      .text('JB-2025-001 • Joint Shadow Block');

    // Train paths
    TRAINS.forEach(train => {
      const pathData: [number, number][] = train.path.map(p => {
        let mins = parseTime(p.departure || p.arrival);
        if (train.path[0] && parseTime(train.path[0].departure || train.path[0].arrival) > 20 * 60 && mins < 6 * 60) {
          mins += 1440; // wrap past midnight
        }
        return [xScale(Math.min(mins, 1440)), yScale(p.chainage_km)];
      });

      const lineGen = d3.line<[number, number]>().x(d => d[0]).y(d => d[1]);

      g.append('path')
        .datum(pathData)
        .attr('d', lineGen)
        .attr('fill', 'none')
        .attr('stroke', TRAIN_COLORS[train.type] || '#999')
        .attr('stroke-width', train.type === 'freight' ? 1.5 : 2)
        .attr('stroke-dasharray', train.type === 'freight' ? '4,3' : 'none')
        .attr('opacity', 0.7);

      // Train label at start
      if (pathData.length > 0) {
        g.append('text')
          .attr('x', pathData[0][0] + 4)
          .attr('y', pathData[0][1] - 4)
          .attr('font-size', 8).attr('font-weight', 600)
          .attr('fill', TRAIN_COLORS[train.type] || '#999')
          .text(train.number);
      }
    });

    // Axes labels
    g.append('text')
      .attr('x', innerW / 2).attr('y', innerH + 30)
      .attr('text-anchor', 'middle')
      .attr('font-size', 11).attr('font-weight', 600)
      .attr('fill', 'rgba(62,39,35,0.4)')
      .text('Time (24-Hour)');

    svg.append('text')
      .attr('x', 14).attr('y', height / 2)
      .attr('text-anchor', 'middle')
      .attr('transform', `rotate(-90, 14, ${height / 2})`)
      .attr('font-size', 11).attr('font-weight', 600)
      .attr('fill', 'rgba(62,39,35,0.4)')
      .text('Chainage (km from New Delhi)');

  }, [dimensions]);

  return (
    <div className="animate-fade-in-up">
      <div className="page-header">
        <div className="page-header__breadcrumb">
          <span>Optimisation</span>
          <span className="page-header__breadcrumb-sep">/</span>
          <span>Block String Chart</span>
        </div>
        <h1 className="page-header__title">24-Hour Time-Space String Chart</h1>
        <p className="page-header__subtitle">
          Interactive train path and block possession visualization for New Delhi – Agra Cantt corridor.
        </p>
      </div>

      {/* Legend */}
      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="card__body" style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
          {Object.entries(TRAIN_COLORS).map(([type, color]) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)' }}>
              <div style={{
                width: 20, height: 3, borderRadius: 2, background: color,
                borderTop: type === 'freight' ? `2px dashed ${color}` : `2px solid ${color}`,
              }} />
              <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{type}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)' }}>
            <div style={{ width: 20, height: 12, borderRadius: 2, background: 'rgba(142, 147, 203, 0.18)', border: '1px dashed var(--crimson-violet)' }} />
            <span style={{ fontWeight: 600 }}>Joint Block</span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-1)' }}>
            <button className="btn btn--icon btn--ghost"><ZoomIn size={14} /></button>
            <button className="btn btn--icon btn--ghost"><ZoomOut size={14} /></button>
            <button className="btn btn--icon btn--ghost"><RotateCcw size={14} /></button>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div ref={containerRef} style={{ width: '100%', height: 'clamp(400px, 60vh, 700px)', overflow: 'auto' }}>
          <svg ref={svgRef} style={{ display: 'block' }} />
        </div>
      </div>

      {/* Block Details Panel */}
      <div className="card" style={{ marginTop: 'var(--space-4)' }}>
        <div className="card__header">
          <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Info size={14} /> AI Rationale — {GOLDEN_JOINT_BLOCK.id}
          </h4>
        </div>
        <div className="card__body">
          <p style={{ fontSize: 'var(--text-sm)', lineHeight: 1.7, color: 'var(--espresso-light)' }}>
            {GOLDEN_JOINT_BLOCK.solver_rationale}
          </p>
          <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            {GOLDEN_JOINT_BLOCK.affected_trains.map(t => (
              <div key={t.train_id} style={{
                padding: 'var(--space-2) var(--space-3)', background: 'var(--status-proposed-bg)',
                borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)',
              }}>
                <strong>{t.train_number}</strong> — {t.impact_type} • {t.delay_minutes} min delay
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
