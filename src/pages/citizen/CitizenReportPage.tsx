/**
 * CitizenReportPage — hazard report from a passenger or member of the public.
 * Photo (compressed, IndexedDB) → location (GPS snapped to the corridor, or the
 * nearest station) → type of problem → description → optional contact.
 *
 * Honesty: this build has no server. The report is stored in this browser and
 * appears in the Control Office and department queues of this app on this
 * device. Routing is rule-based on the category (deptForCategory); nothing is
 * inferred from the photo.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Copy, Inbox, Send } from 'lucide-react';
import { deptForCategory, useAppStore, type ReportCategory } from '../../store/useAppStore';
import { getCorridor } from '../../engine/corridors.js';
import type { Corridor, Dept } from '../../engine/types';
import { useLang, useT } from '../../i18n';
import { citizen, type CitizenKey } from '../../i18n/citizen';
import { copyText } from '../../lib/format';
import { Callout } from '../../components/ui';
import { LocationPicker, PhotoCapture, SimLabel, type LocationValue } from '../../components/ui/extras';

const CATEGORIES: { value: ReportCategory; key: CitizenKey }[] = [
  { value: 'track', key: 'catTrack' },
  { value: 'ohe', key: 'catOhe' },
  { value: 'signal', key: 'catSignal' },
  { value: 'lc', key: 'catLc' },
  { value: 'fire', key: 'catFire' },
  { value: 'obstruction', key: 'catObstruction' },
  { value: 'other', key: 'catOther' },
];

const DEPT_KEY: Record<Dept, CitizenKey> = { TMS: 'deptTMS', SMMS: 'deptSMMS', TDMS: 'deptTDMS' };

export default function CitizenReportPage() {
  const t = useT(citizen);
  const lang = useLang();
  const nav = useNavigate();

  const snapshot = useAppStore((s) => s.snapshot);
  const corridorId = useAppStore((s) => s.corridorId);
  const submitReport = useAppStore((s) => s.submitReport);
  const citizenName = useAppStore((s) => s.citizenName);
  const setCitizenName = useAppStore((s) => s.setCitizenName);
  const toast = useAppStore((s) => s.toast);

  // The form does not need the plan: the corridor geometry is static, so a
  // hazard can be reported while the planning engine is still running.
  const corridor = useMemo<Corridor>(() => snapshot?.corridor ?? (getCorridor(corridorId) as Corridor), [snapshot, corridorId]);

  const [photo, setPhoto] = useState<{ photoId: string; thumb: string } | null>(null);
  const [loc, setLoc] = useState<LocationValue>({});
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [description, setDescription] = useState('');
  const [trainNo, setTrainNo] = useState('');
  const [name, setName] = useState(citizenName);
  const [contact, setContact] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ ref: string; dept: Dept | null } | null>(null);

  const deptName = (d: Dept | null) => (d ? t(DEPT_KEY[d]) : t('deptControl'));
  const routedTo = deptForCategory(category ?? 'other');

  const reset = () => {
    setPhoto(null);
    setLoc({});
    setCategory(null);
    setDescription('');
    setTrainNo('');
    setContact('');
    setError(null);
    setDone(null);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!photo && !description.trim()) {
      setError(t('required'));
      return;
    }
    setError(null);
    const who = name.trim();
    if (who !== citizenName) setCitizenName(who);
    const rep = submitReport({
      source: 'citizen',
      reporter: { name: who || 'Citizen', role: 'Citizen', portal: 'citizen', contact: contact.trim() || undefined },
      lang,
      description: description.trim(),
      category: category ?? 'other',
      photoId: photo?.photoId,
      thumbDataUrl: photo?.thumb,
      lat: loc.lat,
      lng: loc.lng,
      accuracyM: loc.accuracyM,
      km: loc.km,
      nearestStation: loc.station,
      corridorId: corridor.id,
      trainNumber: trainNo.trim() || undefined,
    });
    toast({ title: t('reportToast', { ref: rep.id }), body: t('stepRouted', { dept: deptName(rep.dept) }), tone: 'ok' });
    setDone({ ref: rep.id, dept: rep.dept });
    window.scrollTo(0, 0);
  };

  const copyRef = async (ref: string) => {
    const ok = await copyText(ref);
    toast(ok ? { title: t('copied'), body: ref, tone: 'ok' } : { title: t('copyFailed'), tone: 'warn' });
  };

  /* ── after submit: honest confirmation ── */
  if (done) {
    return (
      <div className="stack-lg">
        <section className="card">
          <div className="card-body stack" style={{ gap: 12 }}>
            <div className="row" style={{ gap: 10 }}>
              <CheckCircle2 size={28} style={{ color: 'var(--ok)', flex: 'none' }} />
              <h1 style={{ fontSize: 'var(--fs-xl)' }}>{t('successTitle')}</h1>
            </div>
            <div className="well row" style={{ justifyContent: 'space-between' }}>
              <div>
                <div className="caps">{t('reportId')}</div>
                <div className="mono strong" style={{ fontSize: 'var(--fs-xl)' }}>{done.ref}</div>
              </div>
              <button type="button" className="btn" style={{ minHeight: 44 }} onClick={() => void copyRef(done.ref)}>
                <Copy /> {t('copyRef')}
              </button>
            </div>
            <p>{t('successBody', { ref: done.ref, dept: deptName(done.dept) })}</p>
            <p className="small muted">{t('routingNote')}</p>
            <div className="row-wrap small muted">
              <SimLabel kind="localOnly" />
              <span>{t('localOnlyNote')}</span>
            </div>
            <div className="stack" style={{ gap: 8 }}>
              <button type="button" className="btn btn-primary btn-lg btn-block" style={{ minHeight: 52 }} onClick={() => nav(`/citizen/reports/${encodeURIComponent(done.ref)}`)}>
                <Inbox /> {t('trackStatus')}
              </button>
              <button type="button" className="btn btn-lg btn-block" style={{ minHeight: 48 }} onClick={reset}>
                {t('reportAnother')}
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <header className="stack" style={{ gap: 4 }}>
        <h1 style={{ fontSize: 'var(--fs-xl)' }}>{t('reportTitle')}</h1>
        <p className="muted">{t('reportLede')}</p>
      </header>

      <form onSubmit={onSubmit} className="stack-lg" data-tour="report-form" noValidate>
        {/* 1 · photo */}
        <section className="card">
          <div className="card-head">
            <h3 className="grow">{t('photo')}</h3>
          </div>
          <div className="card-body">
            <PhotoCapture value={photo} onChange={setPhoto} label={t('takePhoto')} />
          </div>
        </section>

        {/* 2 · location */}
        <section className="card">
          <div className="card-head">
            <h3 className="grow">{t('location')}</h3>
          </div>
          <div className="card-body">
            <LocationPicker
              corridor={corridor}
              value={loc}
              onChange={setLoc}
              labels={{ use: t('useMyLocation'), locating: t('locating'), found: t('locationFound'), denied: t('locationDenied'), station: t('nearestStation'), km: t('chainageKm') }}
            />
          </div>
        </section>

        {/* 3 · type of problem → rule-based routing */}
        <section className="card">
          <div className="card-head">
            <h3 className="grow">{t('category')}</h3>
          </div>
          <div className="card-body stack">
            <div className="row-wrap" role="group" aria-label={t('category')}>
              {CATEGORIES.map((c) => {
                const on = category === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    className={`btn ${on ? 'btn-dark' : ''}`}
                    style={{ minHeight: 44, height: 'auto', padding: '8px 12px', whiteSpace: 'normal', textAlign: 'left' }}
                    aria-pressed={on}
                    onClick={() => setCategory(c.value)}
                  >
                    {t(c.key)}
                  </button>
                );
              })}
            </div>
            <div className="small">
              <span className="strong">{t('stepRouted', { dept: deptName(routedTo) })}</span>
              <span className="muted"> · {t('routingNote')}</span>
            </div>
          </div>
        </section>

        {/* 4 · description and optional details */}
        <section className="card">
          <div className="card-head">
            <h3 className="grow">{t('whatDidYouSee')}</h3>
          </div>
          <div className="card-body stack">
            <div className="field">
              <label htmlFor="cz-desc">{t('whatDidYouSee')}</label>
              <textarea id="cz-desc" className="textarea" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('describePlaceholder')} lang={lang} />
            </div>
            <div className="field">
              <label htmlFor="cz-train">{t('trainNumberOpt')}</label>
              <input id="cz-train" className="input input-lg" inputMode="numeric" autoComplete="off" value={trainNo} onChange={(e) => setTrainNo(e.target.value)} />
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="cz-name">{t('yourName')}</label>
                <input id="cz-name" className="input input-lg" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="cz-contact">{t('contact')}</label>
                <input id="cz-contact" className="input input-lg" type="tel" autoComplete="tel" value={contact} onChange={(e) => setContact(e.target.value)} />
              </div>
            </div>
            <p className="tiny muted">{t('consent')}</p>
          </div>
        </section>

        {error && <Callout tone="warn">{error}</Callout>}

        <button type="submit" className="btn btn-primary btn-lg btn-block" style={{ minHeight: 52 }}>
          <Send /> {t('submit')}
        </button>
        <div className="row-wrap small muted">
          <SimLabel kind="localOnly" />
          <span>{t('localOnlyNote')}</span>
        </div>
      </form>
    </div>
  );
}
