/**
 * CitizenTrainPage — one timetabled train: planned track work on its path this
 * week (published by Control, then still-planned), how it is handled, and its
 * stops on this corridor. Every figure comes from blocksMetByTrain() over the
 * working blocks and the timetable in the snapshot.
 */
import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Bookmark, BookmarkCheck, CheckCircle2, Info, Share2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { blocksMetByTrain, workingBlocks, type WorkingBlock } from '../../engine/select';
import type { AffectedTrain, Line } from '../../engine/types';
import { localeOf, useLang, useT, type Lang, type Vars } from '../../i18n';
import { citizen, type CitizenKey } from '../../i18n/citizen';
import { classLabel, copyText, hhmm } from '../../lib/format';
import { Badge, Callout, EmptyState, Spinner } from '../../components/ui';
import { SimLabel } from '../../components/ui/extras';

type T = (key: CitizenKey, vars?: Vars) => string;
type Met = { block: WorkingBlock; impact: AffectedTrain | null };

const isPublished = (b: WorkingBlock) => b.status === 'GRANTED' || b.status === 'LOCKED';
const byDayStart = (a: Met, b: Met) => a.block.day - b.block.day || a.block.start - b.block.start;

function fmtDate(iso: string, lang: Lang): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(localeOf(lang), { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
}

function weekdayName(dow: number, lang: Lang): string {
  // 1 Jan 2023 was a Sunday; dow 0 = Sunday, as in Train.runsOn
  return new Intl.DateTimeFormat(localeOf(lang), { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + dow)));
}

function lineText(line: Line, t: T): string {
  return line === 'UP' ? t('lineUp') : line === 'DN' ? t('lineDn') : t('lineBoth');
}

function impactText(impact: AffectedTrain | null, t: T): string {
  if (!impact) return t('noDelay');
  if (impact.delayMin > 0) return t('heldUpTo', { n: Math.round(impact.delayMin) });
  return impact.mode === 'SLW' ? t('slw') : impact.mode === 'HELD' ? t('held') : t('regulated');
}

export default function CitizenTrainPage() {
  const t = useT(citizen);
  const lang = useLang();
  const nav = useNavigate();
  const { number = '' } = useParams<{ number?: string }>();

  const snapshot = useAppStore((s) => s.snapshot);
  const status = useAppStore((s) => s.planStatus);
  const runPlan = useAppStore((s) => s.runPlan);
  const approvals = useAppStore((s) => s.approvals);
  const savedTrains = useAppStore((s) => s.savedTrains);
  const toggleSavedTrain = useAppStore((s) => s.toggleSavedTrain);
  const toast = useAppStore((s) => s.toast);

  const blocks = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals]);
  const train = useMemo(() => {
    const q = number.trim().toLowerCase();
    if (!snapshot || !q) return null;
    return snapshot.feeds.timetable.find((tr) => tr.number.toLowerCase() === q) ?? null;
  }, [snapshot, number]);

  const met = useMemo(() => (snapshot && train ? blocksMetByTrain(snapshot, blocks, train) : []), [snapshot, blocks, train]);
  const published = useMemo(() => met.filter((m) => isPublished(m.block)).sort(byDayStart), [met]);
  const planned = useMemo(() => met.filter((m) => m.block.status === 'PROPOSED').sort(byDayStart), [met]);
  const worst = useMemo(() => published.reduce<Met | null>((best, m) => ((m.impact?.delayMin ?? 0) > (best?.impact?.delayMin ?? 0) ? m : best), null), [published]);

  /* stations next to a block section this train meets */
  const nearCodes = useMemo(() => {
    const pub = new Set<string>();
    const plan = new Set<string>();
    if (!snapshot) return { pub, plan };
    for (const m of met) {
      const target = isPublished(m.block) ? pub : plan;
      for (const i of m.block.sections) {
        const sec = snapshot.corridor.blockSections[i];
        if (sec) {
          target.add(sec.from);
          target.add(sec.to);
        }
      }
    }
    return { pub, plan };
  }, [snapshot, met]);

  const back = (
    <button type="button" className="btn" style={{ minHeight: 44, alignSelf: 'flex-start' }} onClick={() => nav('/citizen')}>
      <ArrowLeft /> {t('back')}
    </button>
  );

  if (!snapshot) {
    const failed = status === 'error';
    return (
      <div className="stack-lg">
        {back}
        <div className="card">
          <div className="card-body row" style={{ gap: 12 }}>
            {failed ? <AlertTriangle size={18} style={{ color: 'var(--crit)' }} /> : <Spinner />}
            <div className="grow">{failed ? t('planFailed') : t('loadingPlan')}</div>
            {failed && (
              <button type="button" className="btn" style={{ minHeight: 44 }} onClick={() => void runPlan({ reason: 'retry' })}>
                {t('retry')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!train) {
    return (
      <div className="stack-lg">
        {back}
        <EmptyState
          title={t('trainNotFound')}
          body={<span className="mono">{number}</span>}
          action={
            <button type="button" className="btn btn-dark" style={{ minHeight: 44 }} onClick={() => nav('/citizen')}>
              {t('search')}
            </button>
          }
        />
      </div>
    );
  }

  const isSaved = savedTrains.includes(train.number);
  const stationName = (code: string) => snapshot.corridor.stations.find((s) => s.code === code)?.name ?? code;
  const halts = train.times.filter((x) => x.halt);
  const runDays = (train.runsOn ?? []).map((on, dow) => (on ? weekdayName(dow, lang) : null)).filter((x): x is string => x !== null);

  const onSave = () => {
    toggleSavedTrain(train.number);
    toast({ title: isSaved ? t('removed') : t('saved'), body: `${train.number} ${train.name}`, tone: 'ok' });
  };

  const onShare = async () => {
    const lines = [
      `${train.number} ${train.name} (${train.origin} → ${train.destination})`,
      published.length === 0 ? t('trainClear') : worst?.impact && worst.impact.delayMin > 0 ? t('trainHeld', { n: Math.round(worst.impact.delayMin), section: worst.block.sectionText }) : t('noDelay'),
      ...published.map((m) => `${fmtDate(m.block.date, lang)} ${m.block.startText}–${m.block.endText} · ${m.block.sectionText}: ${impactText(m.impact, t)}`),
      t('estimateNote'),
      `SAMANVAY · ${window.location.origin}/citizen/train/${encodeURIComponent(train.number)}`,
    ];
    const ok = await copyText(lines.join('\n'));
    toast(ok ? { title: t('copied'), tone: 'ok' } : { title: t('copyFailed'), tone: 'warn' });
  };

  return (
    <div className="stack-lg">
      {back}

      <header className="stack" style={{ gap: 4 }}>
        <h1 style={{ fontSize: 'var(--fs-xl)' }}>
          <span className="num">{train.number}</span> {train.name}
        </h1>
        <div className="muted">
          {train.origin} → {train.destination} · {lineText(train.line, t)} · {classLabel(train.cls)}
        </div>
        {runDays.length > 0 && (
          <div className="small muted">
            {t('runsOn')}: {runDays.join(', ')}
          </div>
        )}
        <div className="row-wrap mt">
          <button type="button" className={`btn ${isSaved ? 'btn-dark' : ''}`} style={{ minHeight: 44 }} onClick={onSave} aria-pressed={isSaved}>
            {isSaved ? <BookmarkCheck /> : <Bookmark />} {isSaved ? t('unsaveTrain') : t('saveTrain')}
          </button>
          <button type="button" className="btn" style={{ minHeight: 44 }} onClick={() => void onShare()}>
            <Share2 /> {t('share')}
          </button>
        </div>
      </header>

      {/* ── What it means for this train (published blocks only) ── */}
      {published.length === 0 ? (
        <Callout tone="ok" icon={<CheckCircle2 />}>
          {t('trainClear')}
        </Callout>
      ) : worst?.impact && worst.impact.delayMin > 0 ? (
        <Callout tone="warn">
          <div className="stack" style={{ gap: 4 }}>
            <span>{t('trainHeld', { n: Math.round(worst.impact.delayMin), section: worst.block.sectionText })}</span>
            <span><SimLabel kind="planningEstimate" /></span>
          </div>
        </Callout>
      ) : (
        <Callout tone="info" icon={<Info />}>
          {t('noDelay')}
        </Callout>
      )}

      {published.length > 0 && (
        <section className="stack">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>{t('blocksMet')}</h2>
          {published.map((m) => (
            <MetCard key={m.block.id} m={m} t={t} lang={lang} published />
          ))}
        </section>
      )}

      {planned.length > 0 && (
        <section className="stack">
          <div className="row-wrap">
            <h2 style={{ fontSize: 'var(--fs-lg)' }}>{t('plannedTitle')}</h2>
            <SimLabel kind="planningEstimate" />
          </div>
          <p className="small muted">{t('plannedNote')}</p>
          {planned.map((m) => (
            <MetCard key={m.block.id} m={m} t={t} lang={lang} published={false} />
          ))}
        </section>
      )}

      {/* ── Stops on this corridor ── */}
      <section className="card">
        <div className="card-head">
          <h3 className="grow">{t('itinerary')}</h3>
        </div>
        <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: '8px 18px', gap: 0 }}>
          {halts.map((h, i) => {
            const first = i === 0;
            const last = i === halts.length - 1;
            const pub = nearCodes.pub.has(h.code);
            const plan = !pub && nearCodes.plan.has(h.code);
            return (
              <li key={h.code} className="row" style={{ minHeight: 44, borderBottom: last ? 'none' : '1px solid var(--line)', gap: 10 }}>
                <span className="mono num small" style={{ minWidth: 92 }}>
                  {first ? `${t('dep')} ${hhmm(h.dep)}` : last ? `${t('arr')} ${hhmm(h.arr)}` : `${hhmm(h.arr)}–${hhmm(h.dep)}`}
                </span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="mono strong">{h.code}</span> <span className="small">{stationName(h.code)}</span>
                </span>
                {pub && <Badge tone="warn">{t('trackWorkNearby')}</Badge>}
                {plan && <Badge tone="outline">{t('trackWorkNearby')}</Badge>}
              </li>
            );
          })}
        </ul>
        <div className="card-foot">
          <SimLabel kind="seededFeed" system="COA" seed={26027} />
          <span className="tiny muted">{t('honesty')}</span>
        </div>
      </section>
    </div>
  );
}

function MetCard({ m, t, lang, published }: { m: Met; t: T; lang: Lang; published: boolean }) {
  const b = m.block;
  return (
    <article className="card" style={published ? undefined : { borderStyle: 'dashed' }}>
      <div className="card-body tight stack" style={{ gap: 6 }}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <div className="strong">
              {fmtDate(b.date, lang)} · <span className="num">{b.startText}–{b.endText}</span>
            </div>
            <div className="small muted">
              {b.sectionText} · {lineText(b.line, t)}
            </div>
          </div>
          {!published && <Badge tone="gray">{t('plannedTitle')}</Badge>}
        </div>
        <div className="row-wrap small">
          <span className="muted">{t('handling')}:</span>
          <span className="strong">{impactText(m.impact, t)}</span>
          {m.impact && m.impact.delayMin > 0 && <SimLabel kind="planningEstimate" />}
        </div>
      </div>
    </article>
  );
}
