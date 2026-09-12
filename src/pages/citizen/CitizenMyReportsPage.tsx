/**
 * CitizenMyReportsPage — reports sent from this device (store.myReportIds) and
 * status by reference (/citizen/reports/:ref). The citizen view shows the
 * status steps only — never staff names or triage notes.
 *
 * Priority: when the store set the severity itself (severityAuto), the page
 * shows one plain sentence and the points behind it. Stored reports carry the
 * reasons as English strings (store.submitReport → lib/triage computeSeverity);
 * they are parsed back into factors here so they can be shown in any language.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, ChevronRight, Copy, Search } from 'lucide-react';
import { useAppStore, type HazardReport, type ReportCategory, type ReportStatus } from '../../store/useAppStore';
import type { Dept } from '../../engine/types';
import { localeOf, useLang, useT, type Lang, type Vars } from '../../i18n';
import { citizen, type CitizenKey } from '../../i18n/citizen';
import { copyText } from '../../lib/format';
import { SEVERITY_THRESHOLDS, type SeverityFactor, type SeverityLevel } from '../../lib/triage';
import { Badge, EmptyState, type Tone } from '../../components/ui';
import { SimLabel, Timeline } from '../../components/ui/extras';

type T = (key: CitizenKey, vars?: Vars) => string;

/* ── rule-based priority (lib/triage points table) ── */

/** Factors computed on the page right after submit (same inputs as the store). */
export interface ComputedPriority {
  factors: SeverityFactor[];
  trainNo: string | null;
}

const FACTOR_KEY: Record<SeverityFactor['key'], CitizenKey> = {
  category: 'facCategory',
  nextTrain: 'facNextTrain',
  nextTrainUnknown: 'facNextTrainUnknown',
  premium: 'facPremium',
  mainLine: 'facMainLine',
  offLine: 'facOffLine',
  tsr: 'facTsr',
};

const isCategory = (v: unknown): v is ReportCategory => typeof v === 'string' && Object.prototype.hasOwnProperty.call(CAT_KEY, v);

/** Parse the English reason strings the store saved back into factors (points from the "(+n)" / "(−n)" suffix). */
function parseReasons(reasons: string[] | undefined): ComputedPriority {
  const factors: SeverityFactor[] = [];
  let trainNo: string | null = null;
  for (const r of reasons ?? []) {
    const pm = /\(([+−-])(\d+)\)\s*$/.exec(r);
    const points = pm ? (pm[1] === '+' ? 1 : -1) * Number(pm[2]) : 0;
    const cat = /^Category "([a-z]+)"/.exec(r);
    const next = /Next train due in (\d+) min/.exec(r);
    const no = /^Next train: (\S+) \(timetable\)/.exec(r);
    if (cat) factors.push({ key: 'category', points, params: { category: cat[1] } });
    else if (next) factors.push({ key: 'nextTrain', points, params: { min: Number(next[1]) } });
    else if (no) trainNo = no[1];
    else if (/not known/i.test(r)) factors.push({ key: 'nextTrainUnknown', points, params: {} });
    else if (/premium/i.test(r)) factors.push({ key: 'premium', points, params: {} });
    else if (/running line not identified/i.test(r)) factors.push({ key: 'offLine', points, params: {} });
    else if (/running line/i.test(r)) factors.push({ key: 'mainLine', points, params: {} });
    else if (/speed restriction/i.test(r)) factors.push({ key: 'tsr', points, params: {} });
  }
  return { factors, trainNo };
}

const fmtPts = (p: number) => (p > 0 ? `+${p}` : p < 0 ? `−${Math.abs(p)}` : '+0');

/** One plain sentence: the level and the factor that explains it best. */
function prioritySentence(level: SeverityLevel, factors: SeverityFactor[], t: T): string {
  const find = (k: SeverityFactor['key']) => factors.find((f) => f.key === k);
  const next = find('nextTrain');
  const min = next ? Number(next.params.min) : null;
  // a next-train factor that scored points means the train is close enough to count
  const soon = !!next && next.points > 0;
  let reason: string;
  if (!factors.length) reason = t('whyRules');
  else if (level !== 'low') reason = soon ? t('whyTrainSoon', { min: min ?? '' }) : find('premium') ? t('whyPremium') : t('whyType');
  else if (min === null) reason = t('whyUnknown');
  else if (!soon) reason = t('whyNoTrainSoon', { min });
  else if (find('tsr')) reason = t('whyTsr');
  else reason = t('whyTrainLater', { min });
  return t(level === 'high' ? 'prioHigh' : level === 'medium' ? 'prioMedium' : 'prioLow', { reason });
}

/**
 * Rule-based priority of a report whose severity the store computed. `computed`
 * (factors from the page, same inputs as the store) is used when given;
 * otherwise the stored reasons are parsed. `compact` renders the sentence only.
 */
export function PriorityNote({ report, computed, compact }: { report: HazardReport; computed?: ComputedPriority | null; compact?: boolean }) {
  const t = useT(citizen);
  const { factors, trainNo } = useMemo(() => computed ?? parseReasons(report.severityReasons), [computed, report.severityReasons]);
  if (!report.severityAuto || !report.severity) return null;
  const sentence = prioritySentence(report.severity, factors, t);
  if (compact) return <span className="small" style={{ display: 'block' }}>{sentence}</span>;

  const total = factors.reduce((s, f) => s + f.points, 0);
  const fromTimetable = factors.some((f) => f.key === 'nextTrain') || !!trainNo;
  const factorText = (f: SeverityFactor) => {
    const cat = f.params.category;
    const vars: Vars = { ...f.params, pts: fmtPts(f.points) };
    if (f.key === 'category') vars.cat = isCategory(cat) ? t(CAT_KEY[cat]) : String(cat ?? '');
    return t(FACTOR_KEY[f.key], vars);
  };
  return (
    <div className="well stack" style={{ gap: 6 }}>
      <p className="strong">{sentence}</p>
      <p className="tiny muted">{t('rulesNote')}</p>
      {factors.length > 0 && (
        <details>
          <summary className="small" style={{ cursor: 'pointer', minHeight: 32, display: 'flex', alignItems: 'center' }}>{t('howDecided')}</summary>
          <ul className="small stack" style={{ gap: 4, margin: '6px 0 0', paddingLeft: 18 }}>
            {factors.map((f, i) => (
              <li key={`${f.key}-${i}`}>{factorText(f)}</li>
            ))}
            {trainNo && <li>{t('facTrainNo', { no: trainNo })}</li>}
          </ul>
          <p className="tiny muted" style={{ marginTop: 6 }}>{t('facTotal', { points: total, high: SEVERITY_THRESHOLDS.high, medium: SEVERITY_THRESHOLDS.medium })}</p>
          {fromTimetable && (
            <div className="row-wrap tiny muted" style={{ marginTop: 6 }}>
              <SimLabel kind="wttPositions" />
            </div>
          )}
        </details>
      )}
    </div>
  );
}

const CAT_KEY: Record<ReportCategory, CitizenKey> = {
  track: 'catTrack',
  signal: 'catSignal',
  ohe: 'catOhe',
  lc: 'catLc',
  fire: 'catFire',
  obstruction: 'catObstruction',
  other: 'catOther',
};
const DEPT_KEY: Record<Dept, CitizenKey> = { TMS: 'deptTMS', SMMS: 'deptSMMS', TDMS: 'deptTDMS' };
const STATUS_KEY: Record<ReportStatus, CitizenKey> = {
  UNVERIFIED: 'statusUnverified',
  TRIAGED: 'statusTriaged',
  TASK: 'statusTask',
  RESOLVED: 'statusResolved',
  REJECTED: 'statusRejected',
};
const STATUS_TONE: Record<ReportStatus, Tone> = { UNVERIFIED: 'warn', TRIAGED: 'info', TASK: 'blue', RESOLVED: 'ok', REJECTED: 'gray' };

function fmtWhen(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(localeOf(lang), { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

function placeText(r: HazardReport, t: T): string {
  const parts: string[] = [];
  if (r.nearestStation) parts.push(r.nearestStation);
  if (r.km !== undefined) parts.push(t('atKm', { km: r.km.toFixed(1) }));
  return parts.join(' · ');
}

export default function CitizenMyReportsPage() {
  const t = useT(citizen);
  const lang = useLang();
  const nav = useNavigate();
  const { ref } = useParams<{ ref?: string }>();

  const reports = useAppStore((s) => s.reports);
  const myReportIds = useAppStore((s) => s.myReportIds);
  const toast = useAppStore((s) => s.toast);

  const [refInput, setRefInput] = useState('');

  const mine = useMemo(() => myReportIds.map((id) => reports.find((r) => r.id === id)).filter((r): r is HazardReport => !!r), [myReportIds, reports]);
  const detail = useMemo(() => (ref ? reports.find((r) => r.source === 'citizen' && r.id.toUpperCase() === ref.trim().toUpperCase()) ?? null : null), [reports, ref]);

  const deptName = (d: Dept | null) => (d ? t(DEPT_KEY[d]) : t('deptControl'));

  const onTrack = (e: FormEvent) => {
    e.preventDefault();
    const v = refInput.trim().toUpperCase();
    if (!v) return;
    nav(`/citizen/reports/${encodeURIComponent(v)}`);
  };

  const copyRef = async (id: string) => {
    const ok = await copyText(id);
    toast(ok ? { title: t('copied'), body: id, tone: 'ok' } : { title: t('copyFailed'), tone: 'warn' });
  };

  const trackForm = (
    <form onSubmit={onTrack} className="card" role="search">
      <div className="card-body stack" style={{ gap: 8 }}>
        <label className="strong" htmlFor="cz-ref">{t('trackByRef')}</label>
        <div className="row" style={{ gap: 8 }}>
          <input
            id="cz-ref"
            className="input input-lg mono grow"
            autoComplete="off"
            autoCapitalize="characters"
            placeholder={t('refLabel')}
            value={refInput}
            onChange={(e) => setRefInput(e.target.value)}
          />
          <button type="submit" className="btn btn-dark btn-lg" disabled={!refInput.trim()}>
            <Search /> {t('showStatus')}
          </button>
        </div>
      </div>
    </form>
  );

  /* ── status by reference ── */
  if (ref) {
    if (!detail) {
      return (
        <div className="stack-lg">
          <button type="button" className="btn" style={{ minHeight: 44, alignSelf: 'flex-start' }} onClick={() => nav('/citizen/reports')}>
            <ArrowLeft /> {t('allMyReports')}
          </button>
          <EmptyState title={t('refNotFound', { ref: ref.toUpperCase() })} />
          {trackForm}
        </div>
      );
    }
    return (
      <div className="stack-lg">
        <button type="button" className="btn" style={{ minHeight: 44, alignSelf: 'flex-start' }} onClick={() => nav('/citizen/reports')}>
          <ArrowLeft /> {t('allMyReports')}
        </button>
        <ReportDetail r={detail} t={t} lang={lang} deptName={deptName} onCopy={() => void copyRef(detail.id)} />
        <button type="button" className="btn btn-primary btn-lg btn-block" style={{ minHeight: 52 }} onClick={() => nav('/citizen/report')}>
          <Camera /> {t('reportAnother')}
        </button>
      </div>
    );
  }

  /* ── my reports from this device ── */
  return (
    <div className="stack-lg">
      <header className="stack" style={{ gap: 4 }}>
        <h1 style={{ fontSize: 'var(--fs-xl)' }}>{t('myReportsTitle')}</h1>
        <p className="muted">{t('myReportsLede')}</p>
      </header>

      {mine.length === 0 ? (
        <EmptyState
          title={t('noReports')}
          action={
            <button type="button" className="btn btn-primary btn-lg" style={{ minHeight: 48 }} onClick={() => nav('/citizen/report')}>
              <Camera /> {t('reportButton')}
            </button>
          }
        />
      ) : (
        <div className="stack">
          {mine.map((r) => (
            <button
              key={r.id}
              type="button"
              className="card"
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, textAlign: 'left', width: '100%', minHeight: 64 }}
              onClick={() => nav(`/citizen/reports/${encodeURIComponent(r.id)}`)}
            >
              {r.thumbDataUrl ? (
                <img src={r.thumbDataUrl} alt={t('photo')} width={52} height={52} style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)', flex: 'none' }} />
              ) : null}
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="row-wrap" style={{ gap: 6 }}>
                  <span className="mono strong">{r.id}</span>
                  <Badge tone={STATUS_TONE[r.status]}>{t(STATUS_KEY[r.status])}</Badge>
                </span>
                <span className="small" style={{ display: 'block' }}>{t(CAT_KEY[r.category])}</span>
                {r.suggestedCategory && (
                  <span className="tiny muted" style={{ display: 'block' }}>{t('suggestedType', { cat: t(CAT_KEY[r.suggestedCategory.category]) })}</span>
                )}
                <PriorityNote report={r} compact />
                <span className="tiny muted" style={{ display: 'block' }}>
                  {t('reportedOn', { when: fmtWhen(r.at, lang) })}
                  {placeText(r, t) ? ` · ${placeText(r, t)}` : ''}
                </span>
              </span>
              <ChevronRight size={18} style={{ color: 'var(--ink-3)', flex: 'none' }} />
            </button>
          ))}
        </div>
      )}

      {trackForm}

      <div className="row-wrap small muted">
        <SimLabel kind="localOnly" />
        <span>{t('localOnlyNote')}</span>
      </div>
    </div>
  );
}

function ReportDetail({ r, t, lang, deptName, onCopy }: { r: HazardReport; t: T; lang: Lang; deptName: (d: Dept | null) => string; onCopy: () => void }) {
  const at = (actions: string[]) => r.history.find((h) => actions.includes(h.action))?.at;
  const verifiedAt = at(['VERIFY', 'ASSIGN', 'REROUTE']);
  const plannedAt = at(['ACCEPT']);
  const closedAt = at(['RESOLVE', 'REJECT']);
  const s = r.status;
  const past = (list: ReportStatus[]) => list.includes(s);

  const steps: { label: string; when?: string; state: 'done' | 'current' | 'pending' }[] = [
    { label: t('stepReceived'), when: fmtWhen(r.at, lang), state: 'done' },
    { label: t('stepRouted', { dept: deptName(r.dept) }), state: 'done' },
    { label: t('stepVerifying'), when: verifiedAt ? fmtWhen(verifiedAt, lang) : undefined, state: past(['TASK', 'RESOLVED', 'REJECTED']) ? 'done' : 'current' },
  ];
  if (s !== 'REJECTED') steps.push({ label: t('stepPlanned'), when: plannedAt ? fmtWhen(plannedAt, lang) : undefined, state: s === 'TASK' ? 'current' : plannedAt || s === 'RESOLVED' ? 'done' : 'pending' });
  steps.push(
    s === 'REJECTED'
      ? { label: t('statusRejected'), when: closedAt ? fmtWhen(closedAt, lang) : undefined, state: 'done' }
      : { label: t('stepResolved'), when: closedAt ? fmtWhen(closedAt, lang) : undefined, state: s === 'RESOLVED' ? 'done' : 'pending' }
  );

  return (
    <section className="card">
      <div className="card-body stack" style={{ gap: 12 }}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <div className="caps">{t('reportId')}</div>
            <div className="mono strong" style={{ fontSize: 'var(--fs-xl)' }}>{r.id}</div>
          </div>
          <button type="button" className="btn" style={{ minHeight: 44 }} onClick={onCopy}>
            <Copy /> {t('copyRef')}
          </button>
        </div>
        <div className="row-wrap">
          <Badge tone={STATUS_TONE[s]}>{t(STATUS_KEY[s])}</Badge>
          <span className="small muted">{t('reportedOn', { when: fmtWhen(r.at, lang) })}</span>
        </div>

        <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
          {r.thumbDataUrl && (
            <img src={r.thumbDataUrl} alt={t('photo')} style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)', flex: 'none' }} />
          )}
          <dl className="kv grow">
            <dt>{t('category')}</dt>
            <dd>
              {t(CAT_KEY[r.category])}
              {r.suggestedCategory && (
                <span className="tiny muted" style={{ display: 'block' }}>{t('suggestedType', { cat: t(CAT_KEY[r.suggestedCategory.category]) })}</span>
              )}
            </dd>
            {placeText(r, t) && (
              <>
                <dt>{t('location')}</dt>
                <dd>{placeText(r, t)}</dd>
              </>
            )}
            {r.description && (
              <>
                <dt>{t('whatDidYouSee')}</dt>
                <dd>{r.description}</dd>
              </>
            )}
          </dl>
        </div>

        <PriorityNote report={r} />

        <Timeline steps={steps} />

        <p className="small muted">{t('routingNote')}</p>
        <div className="row-wrap small muted">
          <SimLabel kind="localOnly" />
          <span>{t('localOnlyNote')}</span>
        </div>
      </div>
    </section>
  );
}
