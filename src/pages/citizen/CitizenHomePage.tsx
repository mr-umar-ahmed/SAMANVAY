/**
 * CitizenHomePage — public advisories for planned maintenance blocks.
 *
 *  - search a train (number / name) or a station (code / name) and open it
 *  - published advisories: blocks GRANTED or LOCKED by Control
 *  - planned advisories: blocks still awaiting Control, clearly labelled
 *  - one computed figure: passenger trains that meet no published block
 * Every number comes from the snapshot (plan + timetable) and the workflow.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Camera, ChevronRight, Download, Inbox, MapPin, Search, Share2, Train as TrainIcon } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { advisories, workingBlocks, type WorkingBlock } from '../../engine/select';
import type { AffectedTrain, Line } from '../../engine/types';
import { localeOf, useLang, useT, type Lang, type Vars } from '../../i18n';
import { citizen, type CitizenKey } from '../../i18n/citizen';
import { copyText } from '../../lib/format';
import { useInstallPrompt } from '../../features/pwa/useInstallPrompt';
import { Badge, Spinner, StatTile } from '../../components/ui';
import { SimLabel } from '../../components/ui/extras';

type T = (key: CitizenKey, vars?: Vars) => string;

interface AdvisoryView {
  block: WorkingBlock;
  published: boolean;
  /** passenger trains the delay model holds or regulates, largest delay first */
  passengers: AffectedTrain[];
}

const PUBLISHED_LIMIT = 6;
const PLANNED_LIMIT = 4;
const TRAINS_PER_CARD = 3;

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

function handlingText(mode: AffectedTrain['mode'], t: T): string {
  return mode === 'SLW' ? t('slw') : mode === 'HELD' ? t('held') : t('regulated');
}

export default function CitizenHomePage() {
  const t = useT(citizen);
  const lang = useLang();
  const nav = useNavigate();

  const snapshot = useAppStore((s) => s.snapshot);
  const status = useAppStore((s) => s.planStatus);
  const runPlan = useAppStore((s) => s.runPlan);
  const approvals = useAppStore((s) => s.approvals);
  const homeStation = useAppStore((s) => s.homeStation);
  const setHomeStation = useAppStore((s) => s.setHomeStation);
  const savedTrains = useAppStore((s) => s.savedTrains);
  const toast = useAppStore((s) => s.toast);
  const { canInstall, install, ios, installed } = useInstallPrompt();

  const [query, setQuery] = useState('');
  const [showAllPublished, setShowAllPublished] = useState(false);
  const [showAllPlanned, setShowAllPlanned] = useState(false);

  const blocks = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals]);

  /* ── search suggestions (timetable trains, corridor stations) ── */
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!snapshot || !q) return { trains: [], stations: [] };
    const trains = snapshot.feeds.timetable
      .filter((tr) => tr.number.toLowerCase().includes(q) || tr.name.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.number.toLowerCase().startsWith(q)) - Number(!b.number.toLowerCase().startsWith(q)) || a.number.localeCompare(b.number))
      .slice(0, 6);
    const stations = snapshot.corridor.stations
      .filter((st) => st.code.toLowerCase().includes(q) || st.name.toLowerCase().includes(q))
      .sort((a, b) => Number(a.code.toLowerCase() !== q) - Number(b.code.toLowerCase() !== q))
      .slice(0, 4);
    return { trains, stations };
  }, [snapshot, query]);

  /* ── advisories: published (GRANTED / LOCKED) and planned (awaiting Control) ── */
  const views = useMemo(() => {
    if (!snapshot) return { published: [] as AdvisoryView[], planned: [] as AdvisoryView[] };
    const byId = new Map(blocks.map((b) => [b.id, b]));
    const toView = (blockId: string, published: boolean): AdvisoryView | null => {
      const block = byId.get(blockId);
      if (!block) return null;
      const passengers = block.affectedTrains.filter((a) => isPassenger(a.cls)).sort((a, b) => b.delayMin - a.delayMin);
      return { block, published, passengers };
    };
    const order = (a: AdvisoryView, b: AdvisoryView) => a.block.day - b.block.day || a.block.start - b.block.start;
    const pub = advisories(snapshot, blocks);
    const pubIds = new Set(pub.map((a) => a.blockId));
    const planned = advisories(snapshot, blocks, true).filter((a) => !pubIds.has(a.blockId));
    return {
      published: pub.map((a) => toView(a.blockId, true)).filter((v): v is AdvisoryView => v !== null).sort(order),
      planned: planned.map((a) => toView(a.blockId, false)).filter((v): v is AdvisoryView => v !== null).sort(order),
    };
  }, [snapshot, blocks]);

  /* ── filter by the citizen's station: blocks on a block section that starts or ends there ── */
  const station = useMemo(() => (snapshot && homeStation ? snapshot.corridor.stations.find((s) => s.code === homeStation) ?? null : null), [snapshot, homeStation]);
  const filtered = useMemo(() => {
    if (!snapshot || !station) return views;
    const sections = new Set(snapshot.corridor.blockSections.filter((s) => s.from === station.code || s.to === station.code).map((s) => s.index));
    const near = (v: AdvisoryView) => v.block.sections.some((i) => sections.has(i));
    return { published: views.published.filter(near), planned: views.planned.filter(near) };
  }, [snapshot, station, views]);

  /* ── computed: passenger trains that meet no published block this week ── */
  const clearStat = useMemo(() => {
    if (!snapshot) return null;
    const pax = snapshot.feeds.timetable.filter((tr) => isPassenger(tr.cls));
    if (!pax.length) return null;
    const held = new Set(blocks.filter(isPublished).flatMap((b) => b.affectedTrains.map((a) => a.trainId)));
    const clear = pax.filter((tr) => !held.has(tr.id)).length;
    return { clear, total: pax.length, pct: Math.round((clear / pax.length) * 100) };
  }, [snapshot, blocks]);

  const goTrain = (no: string) => nav(`/citizen/train/${encodeURIComponent(no)}`);
  const goStation = (code: string) => nav(`/citizen/station/${encodeURIComponent(code)}`);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim().toLowerCase();
    if (!snapshot || !q) return;
    const exactTrain = snapshot.feeds.timetable.find((tr) => tr.number.toLowerCase() === q);
    if (exactTrain) return goTrain(exactTrain.number);
    const exactStation = snapshot.corridor.stations.find((s) => s.code.toLowerCase() === q);
    if (exactStation) return goStation(exactStation.code);
    if (suggestions.trains[0]) return goTrain(suggestions.trains[0].number);
    if (suggestions.stations[0]) return goStation(suggestions.stations[0].code);
  };

  const share = async (v: AdvisoryView) => {
    const b = v.block;
    const lines = [
      `${fmtDate(b.date, lang)} ${b.startText}–${b.endText} · ${b.sectionText} · ${lineText(b.line, t)}${v.published ? '' : ` (${t('plannedTitle')})`}`,
      v.passengers.length ? t('heldCount', { n: v.passengers.length }) : t('noPassengerHeld'),
      ...v.passengers.slice(0, 5).map((a) => `${a.number} ${a.name}: ${a.delayMin > 0 ? t('heldUpTo', { n: Math.round(a.delayMin) }) : handlingText(a.mode, t)}`),
      t('estimateNote'),
      `SAMANVAY · ${window.location.origin}/citizen`,
    ];
    const ok = await copyText(lines.join('\n'));
    toast(ok ? { title: t('copied'), tone: 'ok' } : { title: t('copyFailed'), tone: 'warn' });
  };

  /* ── loading / error ── */
  if (!snapshot) {
    const failed = status === 'error';
    return (
      <div className="stack-lg">
        <h1 style={{ fontSize: 'var(--fs-xl)' }}>{t('homeTitle')}</h1>
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

  const q = query.trim();
  const noMatch = q.length > 0 && suggestions.trains.length === 0 && suggestions.stations.length === 0;
  const publishedShown = showAllPublished ? filtered.published : filtered.published.slice(0, PUBLISHED_LIMIT);
  const plannedShown = showAllPlanned ? filtered.planned : filtered.planned.slice(0, PLANNED_LIMIT);

  return (
    <div className="stack-lg">
      {/* ── Hero: flat pastel card with search ── */}
      <section className="card pastel-blue" style={{ color: 'var(--on-blue)' }}>
        <div className="card-body stack" style={{ gap: 12 }}>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <h1 style={{ fontSize: 'var(--fs-xl)', color: 'inherit' }}>{t('homeTitle')}</h1>
              <p className="small" style={{ marginTop: 4 }}>{t('homeLede')}</p>
            </div>
            {(canInstall || ios) && !installed && (
              <button type="button" className="btn" data-tour="install" style={{ minHeight: 44 }} onClick={() => (canInstall ? void install() : nav('/install'))}>
                <Download /> {t('install')}
              </button>
            )}
          </div>

          <form role="search" onSubmit={onSearch} className="row" style={{ gap: 8 }}>
            <div className="grow" style={{ position: 'relative' }}>
              <Search size={18} aria-hidden="true" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)' }} />
              <input
                data-tour="search"
                className="input input-lg"
                style={{ paddingLeft: 40 }}
                type="search"
                inputMode="search"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchPlaceholder')}
              />
            </div>
            <button type="submit" className="btn btn-dark btn-lg" disabled={!q}>
              {t('search')}
            </button>
          </form>

          {q && (
            <div className="card" style={{ color: 'var(--ink)' }}>
              {suggestions.trains.length > 0 && (
                <div className="stack" style={{ gap: 0, padding: '6px 6px 0' }}>
                  <div className="caps" style={{ padding: '4px 8px' }}>{t('suggestTrains')}</div>
                  {suggestions.trains.map((tr) => (
                    <button key={tr.id} type="button" className="btn btn-ghost btn-block" style={{ justifyContent: 'flex-start', minHeight: 44, height: 'auto' }} onClick={() => goTrain(tr.number)}>
                      <TrainIcon />
                      <span className="num strong">{tr.number}</span>
                      <span className="grow truncate" style={{ textAlign: 'left' }}>{tr.name}</span>
                      <ChevronRight />
                    </button>
                  ))}
                </div>
              )}
              {suggestions.stations.length > 0 && (
                <div className="stack" style={{ gap: 0, padding: 6 }}>
                  <div className="caps" style={{ padding: '4px 8px' }}>{t('suggestStations')}</div>
                  {suggestions.stations.map((st) => (
                    <button key={st.code} type="button" className="btn btn-ghost btn-block" style={{ justifyContent: 'flex-start', minHeight: 44, height: 'auto' }} onClick={() => goStation(st.code)}>
                      <MapPin />
                      <span className="mono strong">{st.code}</span>
                      <span className="grow truncate" style={{ textAlign: 'left' }}>{st.name}</span>
                      <ChevronRight />
                    </button>
                  ))}
                </div>
              )}
              {noMatch && <div className="small muted" style={{ padding: 12 }}>{t('noMatch', { q })}</div>}
            </div>
          )}

          {savedTrains.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <div className="caps" style={{ color: 'inherit' }}>{t('savedTrains')}</div>
              <div className="row-wrap">
                {savedTrains.map((no) => (
                  <button key={no} type="button" className="btn" style={{ minHeight: 40 }} onClick={() => goTrain(no)}>
                    <TrainIcon /> <span className="num">{no}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="tiny">{t('scopeNote')}</p>
        </div>
      </section>

      {/* ── Report a hazard ── */}
      <section className="card">
        <div className="card-body stack" style={{ gap: 10 }}>
          <div className="strong">{t('reportCta')}</div>
          <div className="row-wrap">
            <button type="button" className="btn btn-primary btn-lg grow" data-tour="report" style={{ minHeight: 48 }} onClick={() => nav('/citizen/report')}>
              <Camera /> {t('reportButton')}
            </button>
            <button type="button" className="btn btn-lg" style={{ minHeight: 48 }} onClick={() => nav('/citizen/reports')}>
              <Inbox /> {t('navMyReports')}
            </button>
          </div>
        </div>
      </section>

      {/* ── Computed figures ── */}
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <StatTile label={t('statPublished')} value={views.published.length} sub={t('statPublishedSub')} pastel="gray" />
        {clearStat && (
          <StatTile
            label={t('statClear')}
            value={clearStat.pct}
            unit="%"
            pastel="gray"
            sub={
              <>
                <span>{t('statClearSub', { clear: clearStat.clear, total: clearStat.total })}</span>
                <SimLabel kind="planningEstimate" />
              </>
            }
          />
        )}
      </div>

      {/* ── Advisories ── */}
      <section className="stack" data-tour="advisory">
        <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>{t('advisoriesTitle')}</h2>
          <label className="row small" style={{ gap: 6 }}>
            <span className="muted">{t('showFor')}</span>
            <select className="select" style={{ width: 'auto', minHeight: 44 }} value={homeStation ?? ''} onChange={(e) => setHomeStation(e.target.value || null)} aria-label={t('myStation')}>
              <option value="">{t('allStations')}</option>
              {snapshot.corridor.stations.map((s) => (
                <option key={s.code} value={s.code}>{s.code} · {s.name}</option>
              ))}
            </select>
          </label>
        </div>

        {filtered.published.length === 0 ? (
          <div className="empty">{station ? t('noBlocksStation', { station: station.name }) : t('publishedNone')}</div>
        ) : (
          <div className="stack">
            {publishedShown.map((v) => (
              <AdvisoryCard key={v.block.id} v={v} t={t} lang={lang} onTrain={goTrain} onShare={() => void share(v)} />
            ))}
            {filtered.published.length > PUBLISHED_LIMIT && (
              <button type="button" className="btn btn-block" style={{ minHeight: 44 }} onClick={() => setShowAllPublished((x) => !x)}>
                {showAllPublished ? t('showLess') : t('showAll', { n: filtered.published.length })}
              </button>
            )}
          </div>
        )}

        {filtered.planned.length > 0 && (
          <div className="stack" style={{ marginTop: 8 }}>
            <div className="row-wrap">
              <h3 style={{ fontSize: 'var(--fs-md)' }}>{t('plannedTitle')}</h3>
              <SimLabel kind="planningEstimate" />
            </div>
            <p className="small muted">{t('plannedNote')}</p>
            {plannedShown.map((v) => (
              <AdvisoryCard key={v.block.id} v={v} t={t} lang={lang} onTrain={goTrain} onShare={() => void share(v)} />
            ))}
            {filtered.planned.length > PLANNED_LIMIT && (
              <button type="button" className="btn btn-block" style={{ minHeight: 44 }} onClick={() => setShowAllPlanned((x) => !x)}>
                {showAllPlanned ? t('showLess') : t('showAll', { n: filtered.planned.length })}
              </button>
            )}
          </div>
        )}
      </section>

      <p className="tiny muted">{t('honesty')}</p>
    </div>
  );
}

function AdvisoryCard({ v, t, lang, onTrain, onShare }: { v: AdvisoryView; t: T; lang: Lang; onTrain: (no: string) => void; onShare: () => void }) {
  const b = v.block;
  return (
    <article className="card" style={v.published ? undefined : { borderStyle: 'dashed' }}>
      <div className="card-body tight stack" style={{ gap: 8 }}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <div className="strong">
              {fmtDate(b.date, lang)} · <span className="num">{b.startText}–{b.endText}</span>
            </div>
            <div className="small muted">
              {b.sectionText} · {lineText(b.line, t)}
            </div>
          </div>
          {!v.published && <Badge tone="gray">{t('plannedTitle')}</Badge>}
          <button type="button" className="btn btn-ghost btn-icon" style={{ width: 44, height: 44 }} onClick={onShare} aria-label={t('share')} title={t('share')}>
            <Share2 />
          </button>
        </div>
        <div className="row-wrap small">
          <span>{v.passengers.length ? t('heldCount', { n: v.passengers.length }) : t('noPassengerHeld')}</span>
          {v.passengers.length > 0 && <SimLabel kind="planningEstimate" />}
        </div>
        {v.passengers.slice(0, TRAINS_PER_CARD).map((a) => (
          <button
            key={a.trainId}
            type="button"
            className="btn btn-ghost btn-block"
            style={{ justifyContent: 'flex-start', height: 'auto', minHeight: 44, padding: '6px 8px', whiteSpace: 'normal', textAlign: 'left' }}
            onClick={() => onTrain(a.number)}
          >
            <TrainIcon />
            <span className="grow">
              <span className="num strong">{a.number}</span> {a.name}
              <span className="small muted" style={{ display: 'block' }}>
                {a.delayMin > 0 ? t('heldUpTo', { n: Math.round(a.delayMin) }) : handlingText(a.mode, t)}
              </span>
            </span>
            <ChevronRight />
          </button>
        ))}
        {v.passengers.length > TRAINS_PER_CARD && <div className="tiny muted">{t('moreTrains', { n: v.passengers.length - TRAINS_PER_CARD })}</div>}
      </div>
    </article>
  );
}
