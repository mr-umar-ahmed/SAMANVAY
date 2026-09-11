/**
 * CapacityPage — /app/planning/capacity.
 * How much of each block section's day the timetable already occupies and
 * where the natural free windows are, for one plan day and one line. All
 * figures come from snapshot.result.weekly.occupancy (passages per section
 * and line) with the headway margin and minimum block length in force.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, CalendarRange, CheckCircle2, Clock, Gauge } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { workingBlocks } from '../../engine/select';
import type { RunLine, Snapshot } from '../../engine/types';
import { freeWindowsForDay, type FreeWindow } from '../../components/viz/StringDiagram';
import { useT } from '../../i18n';
import { dateLabel, duration, hhmm, MIN_PER_DAY, num, pct } from '../../lib/format';
import { Badge, Card, CardBody, CardHead, DataTable, PageHeader, PlanPending, Segmented, StatTile, type Column } from '../../components/ui';
import { SimLabel } from '../../components/ui/extras';
import { BarChart } from '../../components/viz';
import { argMax, argMin, FEED_SEED, hourProfile, hourRange } from './planMetrics';

const strings = {
  en: {
    title: 'Line capacity & free windows',
    lede: 'How much of each block section’s day the timetable already occupies, and the natural gaps where a block fits without touching a train path.',
    day: 'Plan day',
    line: 'Line',
    openDay: 'Open day chart',
    statOccupied: 'Line time occupied',
    statOccupiedSub: 'Mean over {n} sections · busiest {section} {share}',
    statWindows: 'Free windows',
    statWindowsSub: 'At least {min} min, outside the {margin} min headway margin',
    statLongest: 'Longest free window',
    statLongestSub: '{section} · {start}–{end}',
    statNone: 'No free window',
    statPeak: 'Peak trains per hour',
    statPeakSub: '{hour} on the busiest section',
    hourlyTitle: 'Trains per hour',
    hourlySub: 'Mean trains touching each hour, per block section on the {line} line',
    series: 'Mean trains per section',
    quiet: 'Quietest hour {h} · {v} trains',
    busy: 'Busiest hour {h} · {v} trains',
    windowsTitle: 'Free windows',
    windowsSub: 'Gaps between timetabled paths on the {line} line, longest first. Click a row to open the day chart.',
    colSection: 'Block section',
    colWindow: 'Window',
    colDuration: 'Clear duration',
    colFits: 'Fits',
    colUsed: 'Planned block',
    fitsCeiling: 'A ceiling block ({max} min)',
    fitsUpTo: 'A block up to {span}',
    notUsed: '—',
    empty: 'No free window of the minimum block length on this line and day.',
  },
  hi: {
    title: 'लाइन क्षमता व मुक्त विंडो',
    lede: 'हर ब्लॉक सेक्शन के दिन का कितना हिस्सा समय-सारणी पहले से घेरती है, और वे प्राकृतिक अंतराल जहाँ block किसी ट्रेन पथ को छुए बिना समा सकता है।',
    day: 'योजना दिन',
    line: 'लाइन',
    openDay: 'दिन चार्ट खोलें',
    statOccupied: 'घिरा हुआ लाइन समय',
    statOccupiedSub: '{n} सेक्शनों का औसत · सबसे व्यस्त {section} {share}',
    statWindows: 'मुक्त विंडो',
    statWindowsSub: 'कम से कम {min} मिनट, {margin} मिनट हेडवे मार्जिन के बाहर',
    statLongest: 'सबसे लंबी मुक्त विंडो',
    statLongestSub: '{section} · {start}–{end}',
    statNone: 'कोई मुक्त विंडो नहीं',
    statPeak: 'प्रति घंटा अधिकतम ट्रेनें',
    statPeakSub: 'सबसे व्यस्त सेक्शन पर {hour}',
    hourlyTitle: 'प्रति घंटा ट्रेनें',
    hourlySub: '{line} लाइन पर प्रति ब्लॉक सेक्शन हर घंटे को छूने वाली औसत ट्रेनें',
    series: 'प्रति सेक्शन औसत ट्रेनें',
    quiet: 'सबसे शांत घंटा {h} · {v} ट्रेनें',
    busy: 'सबसे व्यस्त घंटा {h} · {v} ट्रेनें',
    windowsTitle: 'मुक्त विंडो',
    windowsSub: '{line} लाइन पर समय-सारणी पथों के बीच के अंतराल, सबसे लंबे पहले। दिन चार्ट खोलने हेतु पंक्ति पर क्लिक करें।',
    colSection: 'ब्लॉक सेक्शन',
    colWindow: 'विंडो',
    colDuration: 'मुक्त अवधि',
    colFits: 'समाता है',
    colUsed: 'नियोजित block',
    fitsCeiling: 'अधिकतम सीमा का block ({max} मिनट)',
    fitsUpTo: '{span} तक का block',
    notUsed: '—',
    empty: 'इस लाइन व दिन पर न्यूनतम block लंबाई की कोई मुक्त विंडो नहीं।',
  },
} as const;

/** Window end as hh:mm, with the end of the plan day shown as 24:00 rather than 00:00. */
const endText = (m: number) => (m >= MIN_PER_DAY ? '24:00' : hhmm(m));

interface WindowRow extends FreeWindow {
  label: string;
  span: number;
  blockId: string | null;
}

export default function CapacityPage() {
  const snapshot = useAppStore((s) => s.snapshot);
  if (!snapshot) return <PlanPending />;
  return <CapacityBody snapshot={snapshot} />;
}

function CapacityBody({ snapshot }: { snapshot: Snapshot }) {
  const t = useT(strings);
  const nav = useNavigate();
  const approvals = useAppStore((s) => s.approvals);

  const corridor = snapshot.corridor;
  const weekly = snapshot.result.weekly;
  const rules = snapshot.result.rules;

  const [day, setDay] = useState(0);
  const [line, setLine] = useState<RunLine>(corridor.lines[0] ?? 'UP');

  const occ = weekly.occupancy[day] ?? weekly.occupancy[0];
  const blocks = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals]);
  const profile = useMemo(() => (occ ? hourProfile(occ, corridor, rules.headwayMarginMin, line) : null), [occ, corridor, rules.headwayMarginMin, line]);

  const rows: WindowRow[] = useMemo(() => {
    if (!occ) return [];
    const dayBlocks = blocks.filter((b) => b.day === occ.day && b.status !== 'REFUSED' && (b.line === line || b.line === 'BOTH'));
    return freeWindowsForDay(occ, corridor, rules.minBlockMin, rules.headwayMarginMin)
      .filter((w) => w.line === line)
      .map((w) => {
        const hit = dayBlocks.find((b) => b.sections.includes(w.sectionIndex) && Math.max(b.start, w.start) < Math.min(b.end, w.end));
        return { ...w, label: corridor.blockSections[w.sectionIndex]?.label ?? String(w.sectionIndex), span: w.end - w.start, blockId: hit?.id ?? null };
      })
      .sort((a, b) => b.span - a.span);
  }, [occ, blocks, corridor, rules.minBlockMin, rules.headwayMarginMin, line]);

  const longest = rows[0] ?? null;
  const peakHour = profile ? argMax(profile.trainsMax) : 0;
  const quietHour = profile ? argMin(profile.trainsMean) : 0;
  const busyHour = profile ? argMax(profile.trainsMean) : 0;

  const openDay = (blockId?: string | null) => nav(`/app/planning/weekly?day=${occ?.day ?? day}${blockId ? `&block=${encodeURIComponent(blockId)}` : ''}`);

  const columns: Column<WindowRow>[] = [
    { key: 'section', header: t('colSection'), render: (w) => <span className="small strong">{w.label}</span> },
    {
      key: 'window',
      header: t('colWindow'),
      render: (w) => (
        <span className="mono small">
          {hhmm(w.start)}–{endText(w.end)}
        </span>
      ),
    },
    { key: 'duration', header: t('colDuration'), num: true, render: (w) => <span className="num">{duration(w.span)}</span> },
    {
      key: 'fits',
      header: t('colFits'),
      hideMobile: true,
      render: (w) => (w.span >= rules.maxBlockMin ? <Badge tone="ok">{t('fitsCeiling', { max: rules.maxBlockMin })}</Badge> : <Badge tone="gray">{t('fitsUpTo', { span: duration(w.span) })}</Badge>),
    },
    {
      key: 'used',
      header: t('colUsed'),
      render: (w) =>
        w.blockId ? (
          <button
            type="button"
            className="btn btn-sm btn-ghost mono"
            onClick={(e) => {
              e.stopPropagation();
              openDay(w.blockId);
            }}
          >
            {w.blockId}
          </button>
        ) : (
          <span className="tiny muted">{t('notUsed')}</span>
        ),
    },
  ];

  return (
    <div className="stack-lg">
      <PageHeader
        title={t('title')}
        lede={t('lede')}
        badges={
          <>
            <Badge tone="blue">{corridor.name}</Badge>
            <SimLabel kind="seededFeed" system="COA / FOIS" seed={FEED_SEED} />
          </>
        }
        actions={
          <>
            <select className="select" style={{ width: 'auto' }} value={day} onChange={(e) => setDay(Number(e.target.value))} aria-label={t('day')}>
              {weekly.occupancy.map((o) => (
                <option key={o.day} value={o.day}>
                  {dateLabel(o.date)}
                </option>
              ))}
            </select>
            <Segmented<RunLine> ariaLabel={t('line')} value={line} onChange={setLine} options={corridor.lines.map((l) => ({ value: l, label: l }))} />
            <button type="button" className="btn" onClick={() => openDay()}>
              <CalendarRange size={14} /> {t('openDay')}
            </button>
          </>
        }
      />

      {profile && (
        <div className="stat-grid">
          <StatTile
            label={t('statOccupied')}
            icon={<Gauge size={14} />}
            value={pct(profile.occupiedMean, 1)}
            sub={t('statOccupiedSub', { n: profile.rows, section: profile.busiest?.sectionLabel ?? '—', share: profile.busiest ? pct(profile.busiest.share, 1) : '—' })}
          />
          <StatTile label={t('statWindows')} icon={<CheckCircle2 size={14} />} value={rows.length} sub={t('statWindowsSub', { min: rules.minBlockMin, margin: rules.headwayMarginMin })} />
          <StatTile
            label={t('statLongest')}
            icon={<Clock size={14} />}
            value={longest ? duration(longest.span) : '—'}
            sub={longest ? t('statLongestSub', { section: longest.label, start: hhmm(longest.start), end: endText(longest.end) }) : t('statNone')}
          />
          <StatTile label={t('statPeak')} icon={<BarChart3 size={14} />} value={num(profile.trainsMax[peakHour])} sub={t('statPeakSub', { hour: hourRange(peakHour) })} />
        </div>
      )}

      {profile && (
        <Card>
          <CardHead title={t('hourlyTitle')} sub={t('hourlySub', { line })} icon={<BarChart3 size={16} />} />
          <CardBody>
            <div className="stack">
              <BarChart
                categories={Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))}
                series={[{ name: t('series'), color: 'var(--series-1)', values: profile.trainsMean }]}
                height={170}
                valueFormat={(v) => num(v, 1)}
              />
              <div className="row-wrap">
                <Badge tone="green">{t('quiet', { h: hourRange(quietHour), v: num(profile.trainsMean[quietHour], 1) })}</Badge>
                <Badge tone="pink">{t('busy', { h: hourRange(busyHour), v: num(profile.trainsMean[busyHour], 1) })}</Badge>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHead title={t('windowsTitle')} sub={t('windowsSub', { line })} icon={<Clock size={16} />} />
        <CardBody flush>
          <DataTable<WindowRow> rows={rows} columns={columns} rowKey={(w) => `${w.sectionIndex}-${w.line}-${w.start}`} onRowClick={() => openDay()} compact maxHeight={560} empty={t('empty')} />
        </CardBody>
      </Card>
    </div>
  );
}
