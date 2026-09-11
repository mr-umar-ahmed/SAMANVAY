import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Info } from 'lucide-react';
import { PORTALS, ROLES, type RoleId } from '../../auth/portals';
import { FIELD_INVITE_CODE, SELF_SIGNUP_ROLES, signup } from '../../auth/users';
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
  const [role, setRole] = useState<RoleId>('GANG_INCHARGE');
  const [inviteCode, setInviteCode] = useState('');
  const [designation, setDesignation] = useState('');
  const [division, setDivision] = useState('Agra');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hi = lang === 'hi';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await signup({ name, email, password, role, designation, division, inviteCode, isSelfSignup: true });
    setBusy(false);
    if (!r.ok) {
      if (r.error === 'exists') return setError(t('accountExists'));
      if (r.error === 'invalid_code') return setError(hi ? 'अमान्य आमंत्रण कोड। फ़ील्ड स्टाफ़ आमंत्रण कोड दर्ज करें (उदा. FIELD2026)।' : 'Invalid invite code. Enter a field staff invite code (e.g. FIELD2026).');
      if (r.error === 'invalid_role') return setError(hi ? 'केवल फ़ील्ड स्टाफ़ स्वयं पंजीकरण कर सकते हैं।' : 'Only field staff can self-register.');
      return setError(hi ? 'कृपया सभी फ़ील्ड सही भरें (पासवर्ड ≥ 4 अक्षर)।' : 'Please complete every field (password of at least 4 characters).');
    }
    doLogin(r.user);
    nav(PORTALS[r.user.portal].landing, { replace: true });
  };

  const allowedRoles = SELF_SIGNUP_ROLES.map((rid) => ({
    rid,
    portal: PORTALS[ROLES[rid].portal],
  }));

  return (
    <div className="auth-wrap">
      <AuthHero />
      <div className="auth-panel">
        <div className="auth-card stack-lg">
          <div>
            <div className="caps">{t('railwayEntry')}</div>
            <h1 style={{ marginTop: 4 }}>{t('signUp')}</h1>
            <p className="muted small mt">{hi ? 'फ़ील्ड स्टाफ़ पंजीकरण (गैंग प्रभारी / लोको पायलट)।' : 'Field staff registration (Gang Incharge / Loco Pilot).'}</p>
          </div>

          <div className="callout callout-info small row" style={{ gap: 8, alignItems: 'flex-start' }}>
            <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              {hi
                ? 'मंडल अधिकारी, योजनाकार और नियंत्रक खाते मंडल व्यवस्थापक (Admin → Users) द्वारा बनाए जाते हैं।'
                : 'Officer, Controller, and Planner accounts are provisioned by Division Admin in Admin → Users.'}
            </div>
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
            <Field label={t('role')} htmlFor="role" hint={hi ? 'केवल फ़ील्ड भूमिकाएं' : 'Field roles only'}>
              <select id="role" className="select" value={role} onChange={(e) => setRole(e.target.value as RoleId)}>
                {allowedRoles.map(({ rid, portal }) => (
                  <option key={rid} value={rid}>
                    {ROLES[rid].label[hi ? 'hi' : 'en']} — {portal.short[hi ? 'hi' : 'en']}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={hi ? 'फ़ील्ड आमंत्रण कोड' : 'Field invite code'}
              htmlFor="invcode"
              hint={hi ? 'डेमो कोड: FIELD2026' : `Demo code: ${FIELD_INVITE_CODE}`}
            >
              <input
                id="invcode"
                className="input mono"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder={FIELD_INVITE_CODE}
                required
              />
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
