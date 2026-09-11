/**
 * CitizenMyReportsPage — reports sent from this device (store.myReportIds) and
 * status by reference (/citizen/reports/:ref). The citizen view shows the
 * status steps only — never staff names or triage notes.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, ChevronRight, Copy, Search } from 'lucide-react';
import { useAppStore, type HazardReport, type ReportCategory, type ReportStatus } from '../../store/useAppStore';
import type { Dept } from '../../engine/types';
import { localeOf, useLang, useT, type Lang, type Vars } from '../../i18n';
import { citizen, type CitizenKey } from '../../i18n/citizen';
import { copyText } from '../../lib/format';
import { Badge, EmptyState, type Tone } from '../../components/ui';
import { SimLabel, Timeline } from '../../components/ui/extras';

type T = (key: CitizenKey, vars?: Vars) => string;

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
            <dd>{t(CAT_KEY[r.category])}</dd>
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
