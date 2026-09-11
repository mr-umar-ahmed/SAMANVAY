/**
 * CitizenStationPage — one corridor station: track work on the block sections
 * that start or end here (published by Control, then still-planned), and the
 * timetabled passenger trains that stop here with whether they meet a
 * published block this week. Everything is derived from the snapshot.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, ChevronRight, MapPin } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { blocksMetByTrain, workingBlocks, type WorkingBlock } from '../../engine/select';
import type { Line } from '../../engine/types';
import { localeOf, useLang, useT, type Lang, type Vars } from '../../i18n';
import { citizen, type CitizenKey } from '../../i18n/citizen';
import { hhmm } from '../../lib/format';
import { Badge, EmptyState, Spinner } from '../../components/ui';
import { SimLabel } from '../../components/ui/extras';

type T = (key: CitizenKey, vars?: Vars) => string;

const TRAINS_LIMIT = 10;
const isPassenger = (cls: string) => cls !== 'GOODS' && cls !== 'PARCEL';
const isPublished = (b: WorkingBlock) => b.status === 'GRANTED' || b.status === 'LOCKED';

function fmtDate(iso: string, lang: Lang): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(localeOf(lang), { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
}

function lineText(line: Line, t: T): string {
  return line === 'UP' ? t('lineUp') : line === 'DN' ? t('lineDn') : t('lineBoth');
}

export default function CitizenStationPage() {
  const t = useT(citizen);
  const lang = useLang();
  const nav = useNavigate();
  const { code: codeParam = '' } = useParams<{ code?: string }>();
  const code = codeParam.trim().toUpperCase();

  const snapshot = useAppStore((s) => s.snapshot);
  const status = useAppStore((s) => s.planStatus);
  const runPlan = useAppStore((s) => s.runPlan);
  const approvals = useAppStore((s) => s.approvals);
  const homeStation = useAppStore((s) => s.homeStation);
  const setHomeStation = useAppStore((s) => s.setHomeStation);
  const toast = useAppStore((s) => s.toast);

  const [showAllTrains, setShowAllTrains] = useState(false);

  const blocks = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals]);
  const station = useMemo(() => snapshot?.corridor.stations.find((s) => s.code === code) ?? null, [snapshot, code]);

  /* blocks on a block section that starts or ends at this station */
  const near = useMemo(() => {
    if (!snapshot || !station) return { published: [] as WorkingBlock[], planned: [] as WorkingBlock[] };
    const sections = new Set(snapshot.corridor.blockSections.filter((s) => s.from === station.code || s.to === station.code).map((s) => s.index));
    const list = blocks.filter((b) => b.sections.some((i) => sections.has(i))).sort((a, b) => a.day - b.day || a.start - b.start);
    return { published: list.filter(isPublished), planned: list.filter((b) => b.status === 'PROPOSED') };
  }, [snapshot, station, blocks]);

  /* passenger trains stopping here, and whether they meet a published block this week */
  const trainsHere = useMemo(() => {
    if (!snapshot || !station) return [];
    const pub = blocks.filter(isPublished);
    return snapshot.feeds.timetable
      .filter((tr) => isPassenger(tr.cls))
      .flatMap((tr) => {
        const stop = tr.times.find((x) => x.code === station.code && x.halt);
        return stop ? [{ tr, stop, meets: blocksMetByTrain(snapshot, pub, tr).length > 0 }] : [];
      })
      .sort((a, b) => a.stop.arr - b.stop.arr);
  }, [snapshot, station, blocks]);

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

  if (!station) {
    return (
      <div className="stack-lg">
        {back}
        <EmptyState
          title={t('stationNotFound')}
          body={<span className="mono">{codeParam}</span>}
          action={
            <button type="button" className="btn btn-dark" style={{ minHeight: 44 }} onClick={() => nav('/citizen')}>
              {t('search')}
            </button>
          }
        />
      </div>
    );
  }

  const isMine = homeStation === station.code;
  const shownTrains = showAllTrains ? trainsHere : trainsHere.slice(0, TRAINS_LIMIT);

  const makeMine = () => {
    setHomeStation(station.code);
    toast({ title: t('stationSet'), body: `${station.code} · ${station.name}`, tone: 'ok' });
  };

  return (
    <div className="stack-lg">
      {back}

      <header className="stack" style={{ gap: 4 }}>
        <h1 style={{ fontSize: 'var(--fs-xl)' }}>
          {station.name} <span className="mono muted">({station.code})</span>
        </h1>
        <div className="row-wrap small muted">
          <MapPin size={14} />
          <span className="num">{t('atKm', { km: station.km })}</span>
          {station.junction && <Badge tone="gray">{t('junction')}</Badge>}
          <span>· {snapshot.corridor.name}</span>
        </div>
        <div className="row-wrap mt">
          {isMine ? (
            <span className="badge badge-ok" style={{ height: 32 }}>
              <Check /> {t('myStation')}
            </span>
          ) : (
            <button type="button" className="btn" style={{ minHeight: 44 }} onClick={makeMine}>
              <MapPin /> {t('setMyStation')}
            </button>
          )}
        </div>
      </header>

      {/* ── Track work next to this station ── */}
      <section className="stack">
        <h2 style={{ fontSize: 'var(--fs-lg)' }}>{t('blocksNear')}</h2>
        {near.published.length === 0 ? (
          <div className="empty">{t('noBlocksStation', { station: station.name })}</div>
        ) : (
          near.published.map((b) => <NearBlockCard key={b.id} b={b} t={t} lang={lang} published />)
        )}
        {near.planned.length > 0 && (
          <div className="stack" style={{ marginTop: 8 }}>
            <div className="row-wrap">
              <h3 style={{ fontSize: 'var(--fs-md)' }}>{t('plannedTitle')}</h3>
              <SimLabel kind="planningEstimate" />
            </div>
            <p className="small muted">{t('plannedNote')}</p>
            {near.planned.map((b) => (
              <NearBlockCard key={b.id} b={b} t={t} lang={lang} published={false} />
            ))}
          </div>
        )}
      </section>

      {/* ── Trains stopping here ── */}
      <section className="card">
        <div className="card-head">
          <h3 className="grow">{t('trainsCalling')}</h3>
        </div>
        {trainsHere.length === 0 ? (
          <div className="card-body">
            <div className="empty">{t('noTrainsStation')}</div>
          </div>
        ) : (
          <div className="stack" style={{ gap: 0, padding: 6 }}>
            {shownTrains.map(({ tr, stop, meets }) => (
              <button
                key={tr.id}
                type="button"
                className="btn btn-ghost btn-block"
                style={{ justifyContent: 'flex-start', height: 'auto', minHeight: 48, padding: '6px 10px', whiteSpace: 'normal', textAlign: 'left' }}
                onClick={() => nav(`/citizen/train/${encodeURIComponent(tr.number)}`)}
              >
                <span className="mono num small" style={{ minWidth: 48 }}>{hhmm(stop.arr)}</span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="num strong">{tr.number}</span> {tr.name}
                  {meets && (
                    <span className="small" style={{ display: 'block', color: 'var(--on-yellow)' }}>
                      {t('meetsBlock')}
                    </span>
                  )}
                </span>
                <ChevronRight />
              </button>
            ))}
            {trainsHere.length > TRAINS_LIMIT && (
              <button type="button" className="btn btn-block" style={{ minHeight: 44, marginTop: 6 }} onClick={() => setShowAllTrains((x) => !x)}>
                {showAllTrains ? t('showLess') : t('showAll', { n: trainsHere.length })}
              </button>
            )}
          </div>
        )}
        <div className="card-foot">
          <SimLabel kind="seededFeed" system="COA" seed={26027} />
          <span className="tiny muted">{t('honesty')}</span>
        </div>
      </section>
    </div>
  );
}

function NearBlockCard({ b, t, lang, published }: { b: WorkingBlock; t: T; lang: Lang; published: boolean }) {
  const pax = b.affectedTrains.filter((a) => isPassenger(a.cls));
  const maxDelay = pax.reduce((m, a) => Math.max(m, a.delayMin), 0);
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
          <span>{pax.length ? t('heldCount', { n: pax.length }) : t('noPassengerHeld')}</span>
          {maxDelay > 0 && <span className="muted">· {t('heldUpTo', { n: Math.round(maxDelay) })}</span>}
          {pax.length > 0 && <SimLabel kind="planningEstimate" />}
        </div>
      </div>
    </article>
  );
}
