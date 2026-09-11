/**
 * Public, mobile-first shell for passengers and citizens. No sign-in.
 * Eight languages; bottom navigation; install prompt.
 */
import { useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, Camera, Inbox, Languages, Download, Moon, Sun, LogIn } from 'lucide-react';
import { LANGS, useLang } from '../i18n';
import { citizen } from '../i18n/citizen';
import { useAppStore } from '../store/useAppStore';
import { useInstallPrompt } from '../features/pwa/useInstallPrompt';
import { Toasts } from '../components/ui';
import { translate } from '../i18n';
import './shell.css';

export function CitizenShell() {
  const lang = useLang();
  const setLanguage = useAppStore((s) => s.setLanguage);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const loc = useLocation();
  const nav = useNavigate();
  const { canInstall, install, ios, installed } = useInstallPrompt();
  const t = (k: keyof typeof citizen.en) => translate(citizen, lang, k);

  useEffect(() => window.scrollTo(0, 0), [loc.pathname]);

  const items = [
    { to: '/citizen', label: t('navAdvisories'), icon: <Home size={20} /> },
    { to: '/citizen/report', label: t('navReport'), icon: <Camera size={20} /> },
    { to: '/citizen/my-reports', label: t('navMyReports'), icon: <Inbox size={20} /> },
  ];
  const active = (to: string) => (to === '/citizen' ? loc.pathname === '/citizen' || loc.pathname.startsWith('/citizen/train') || loc.pathname.startsWith('/citizen/station') : loc.pathname.startsWith(to));

  return (
    <div className="citizen-shell" data-portal="citizen">
      <header className="citizen-top">
        <Link to="/citizen" className="row" style={{ color: 'inherit', textDecoration: 'none' }}>
          <img src="/favicon.svg" alt="" width={30} height={30} style={{ borderRadius: 8 }} />
          <span>
            <span className="strong" style={{ display: 'block', letterSpacing: '0.04em', lineHeight: 1.1 }}>SAMANVAY</span>
            <span className="tiny muted" style={{ display: 'block' }}>{t('tagline')}</span>
          </span>
        </Link>
        <span className="grow" />
        <label className="btn btn-sm btn-ghost" style={{ position: 'relative' }} title={t('language')}>
          <Languages />
          <span>{LANGS.find((l) => l.code === lang)?.native}</span>
          <select value={lang} onChange={(e) => setLanguage(e.target.value as typeof lang)} aria-label={t('language')} style={{ position: 'absolute', inset: 0, opacity: 0 }}>
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>{l.native}</option>
            ))}
          </select>
        </label>
        <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Theme">
          {theme === 'dark' ? <Sun /> : <Moon />}
        </button>
        <Link to="/login" className="btn btn-sm btn-ghost btn-icon hide-mobile" title={t('staffSignIn')} aria-label={t('staffSignIn')}>
          <LogIn />
        </Link>
      </header>
      {(canInstall || ios) && !installed && (
        <div className="callout callout-info" style={{ borderRadius: 0, alignItems: 'center' }}>
          <Download />
          <div className="grow small">{t('installHint')}</div>
          <button className="btn btn-sm btn-dark" onClick={() => (canInstall ? void install() : nav('/install'))}>{t('install')}</button>
        </div>
      )}
      <main className="citizen-content">
        <Outlet />
      </main>
      <nav className="citizen-bottom" aria-label="Citizen">
        {items.map((i) => (
          <Link key={i.to} to={i.to} className={active(i.to) ? 'active' : ''} aria-current={active(i.to) ? 'page' : undefined}>
            {i.icon}
            <span>{i.label}</span>
          </Link>
        ))}
      </nav>
      <Toasts />
    </div>
  );
}
