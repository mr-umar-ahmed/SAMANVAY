import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PORTALS, PORTAL_ORDER, ROLES, type RoleId } from '../../auth/portals';
import { signup } from '../../auth/users';
import { useLang, useT } from '../../i18n';
import { common } from '../../i18n/common';
import { useAppStore } from '../../store/useAppStore';
import { Field } from '../../components/ui';
import { AuthHero } from './AuthHero';

export default function SignupPage() {
  const t = useT(common);
  const lang = useLang();
  const nav = useNavigate();
  const doLogin = useAppStore((s) => s.login);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<RoleId>('SSE_PWAY');
  const [designation, setDesignation] = useState('');
  const [division, setDivision] = useState('Agra');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hi = lang === 'hi';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await signup({ name, email, password, role, designation, division });
    setBusy(false);
    if (!r.ok) return setError(r.error === 'exists' ? t('accountExists') : hi ? 'कृपया सभी फ़ील्ड सही भरें (पासवर्ड ≥ 4 अक्षर)।' : 'Please complete every field (password of at least 4 characters).');
    doLogin(r.user);
    nav(PORTALS[r.user.portal].landing, { replace: true });
  };

  const staffRoles = PORTAL_ORDER.filter((p) => p !== 'citizen').flatMap((p) => PORTALS[p].roles.map((rid) => ({ rid, portal: PORTALS[p] })));

  return (
    <div className="auth-wrap">
      <AuthHero />
      <div className="auth-panel">
        <div className="auth-card stack-lg">
          <div>
            <div className="caps">{t('railwayEntry')}</div>
            <h1 style={{ marginTop: 4 }}>{t('signUp')}</h1>
            <p className="muted small mt">{hi ? 'भूमिका चुनें — यही तय करती है कि आपको कौन-सा पोर्टल दिखेगा।' : 'Pick your role — it decides which portal you see.'}</p>
          </div>
          <form className="stack-lg" onSubmit={submit}>
            <Field label={t('fullName')} htmlFor="name">
              <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </Field>
            <Field label={t('email')} htmlFor="semail">
              <input id="semail" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="name@nr.railnet.gov.in" required />
            </Field>
            <Field label={t('password')} htmlFor="spass" hint={hi ? 'कम से कम 4 अक्षर' : 'At least 4 characters'}>
              <input id="spass" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={4} />
            </Field>
            <Field label={t('role')} htmlFor="role">
              <select id="role" className="select" value={role} onChange={(e) => setRole(e.target.value as RoleId)}>
                {staffRoles.map(({ rid, portal }) => (
                  <option key={rid} value={rid}>
                    {ROLES[rid].label[hi ? 'hi' : 'en']} — {portal.short[hi ? 'hi' : 'en']}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label={t('designation')} htmlFor="desig">
                <input id="desig" className="input" value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder={ROLES[role].label.en} />
              </Field>
              <Field label={hi ? 'मंडल' : 'Division'} htmlFor="div">
                <input id="div" className="input" value={division} onChange={(e) => setDivision(e.target.value)} />
              </Field>
            </div>
            {error && <div className="callout callout-crit">{error}</div>}
            <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
              {t('signUp')} <ArrowRight />
            </button>
          </form>
          <div className="row small muted">
            <span>{t('haveAccount')}</span>
            <Link to="/login">{t('signIn')}</Link>
            <span className="right" />
            <Link to="/citizen">{t('citizenEntry')}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
