import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Lock, Mail, UserRound } from 'lucide-react';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, PORTALS, ROLES, toSession } from '../../auth/portals';
import { login } from '../../auth/users';
import { useLang, useT } from '../../i18n';
import { common } from '../../i18n/common';
import { useAppStore } from '../../store/useAppStore';
import { Badge, Field } from '../../components/ui';
import { AuthHero } from './AuthHero';

export default function LoginPage() {
  const t = useT(common);
  const lang = useLang();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const doLogin = useAppStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDemo, setShowDemo] = useState(true);
  const next = params.get('next');

  const finish = (u: ReturnType<typeof toSession>) => {
    doLogin(u);
    nav(next && next.startsWith('/app') ? next : PORTALS[u.portal].landing, { replace: true });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const u = await login(email, password);
    setBusy(false);
    if (!u) return setError(t('invalidLogin'));
    finish(u);
  };

  return (
    <div className="auth-wrap">
      <AuthHero />
      <div className="auth-panel">
        <div className="auth-card stack-lg">
          <div>
            <div className="caps">{t('railwayEntry')}</div>
            <h1 style={{ marginTop: 4 }}>{t('signIn')}</h1>
            <p className="muted small mt">{lang === 'hi' ? 'अपने विभागीय पोर्टल में प्रवेश करें। यह बिल्ड ब्राउज़र में ही खाते रखता है — कोई सर्वर नहीं।' : 'Enter your departmental portal. Accounts in this build live in your browser only — there is no server.'}</p>
          </div>
          <form className="stack-lg" onSubmit={submit}>
            <Field label={t('email')} htmlFor="email">
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--ink-4)' }} />
                <input id="email" className="input" style={{ paddingLeft: 36 }} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="name@ir.demo" required />
              </div>
            </Field>
            <Field label={t('password')} htmlFor="password">
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--ink-4)' }} />
                <input id="password" type="password" className="input" style={{ paddingLeft: 36 }} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              </div>
            </Field>
            {error && <div className="callout callout-crit">{error}</div>}
            <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
              {t('signIn')} <ArrowRight />
            </button>
          </form>
          <div className="row small muted">
            <span>{t('noAccount')}</span>
            <Link to="/signup">{t('signUp')}</Link>
            <span className="right" />
            <Link to="/citizen">{t('citizenEntry')}</Link>
          </div>

          <div className="card">
            <div className="card-head" style={{ cursor: 'pointer' }} onClick={() => setShowDemo((v) => !v)}>
              <UserRound size={16} className="muted" />
              <div className="grow">
                <h3>{t('demoAccounts')}</h3>
                <div className="sub">{lang === 'hi' ? `पासवर्ड: ${DEMO_PASSWORD}` : `Password for every demo account: ${DEMO_PASSWORD}`}</div>
              </div>
              <Badge tone="yellow">{lang === 'hi' ? 'डेमो' : 'Demo'}</Badge>
            </div>
            {showDemo && (
              <div className="card-body flush">
                {DEMO_ACCOUNTS.map((a) => {
                  const role = ROLES[a.role];
                  const portal = PORTALS[role.portal];
                  return (
                    <button key={a.id} className="row" style={{ width: '100%', textAlign: 'left', padding: '9px 16px', borderBottom: '1px solid var(--line)', gap: 12 }} onClick={() => finish(toSession(a))}>
                      <span className={`shell-avatar pastel-${portal.pastel}`}>{a.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}</span>
                      <span className="grow" style={{ minWidth: 0 }}>
                        <span className="strong small" style={{ display: 'block' }}>{a.name}</span>
                        <span className="tiny muted truncate" style={{ display: 'block' }}>{role.label[lang === 'hi' ? 'hi' : 'en']} · {a.email}</span>
                      </span>
                      <Badge tone={portal.pastel}>{portal.short[lang === 'hi' ? 'hi' : 'en']}</Badge>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
