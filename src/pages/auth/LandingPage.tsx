import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Compass, Download, Languages, Moon, Sun } from 'lucide-react';
import { PORTALS, PORTAL_ORDER } from '../../auth/portals';
import { LANGS, useLang, useT } from '../../i18n';
import { common } from '../../i18n/common';
import { useAppStore } from '../../store/useAppStore';
import { useInstallPrompt } from '../../features/pwa/useInstallPrompt';
import { Badge } from '../../components/ui';

/** "/" — choose a portal. Signed-in users are offered their own portal first. */
export default function LandingPage() {
  const t = useT(common);
  const lang = useLang();
  const hi = lang === 'hi';
  const nav = useNavigate();
  const user = useAppStore((s) => s.user);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const { canInstall, install, ios } = useInstallPrompt();

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <header className="citizen-top" style={{ maxWidth: 1100, margin: '0 auto', borderBottom: 'none', background: 'transparent' }}>
        <img src="/favicon.svg" alt="" width={32} height={32} style={{ borderRadius: 8 }} />
        <div className="grow">
          <div style={{ fontWeight: 700, letterSpacing: '0.05em' }}>SAMANVAY <span style={{ fontWeight: 500, letterSpacing: 0, color: 'var(--ink-3)' }}>समन्वय</span></div>
          <div className="tiny muted">{t('ps')}</div>
        </div>
        <label className="btn btn-sm btn-ghost" style={{ position: 'relative' }}>
          <Languages />
          <span>{LANGS.find((l) => l.code === lang)?.native}</span>
          <select value={lang} onChange={(e) => setLanguage(e.target.value as typeof lang)} aria-label={t('language')} style={{ position: 'absolute', inset: 0, opacity: 0 }}>
            {LANGS.filter((l) => l.scope === 'all').map((l) => (
              <option key={l.code} value={l.code}>{l.native}</option>
            ))}
          </select>
        </label>
        <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={t('theme')}>
          {theme === 'dark' ? <Sun /> : <Moon />}
        </button>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 16px 48px' }} className="stack-lg">
        <div style={{ maxWidth: 720 }}>
          <h1 style={{ fontSize: 'clamp(26px, 3.6vw, 40px)', letterSpacing: '-0.02em' }}>{hi ? 'भारतीय रेल के लिए समन्वित ब्लॉक योजना' : 'Coordinated block planning for Indian Railways'}</h1>
          <p className="muted mt" style={{ fontSize: 15 }}>
            {hi
              ? 'हर उपयोगकर्ता का अपना पोर्टल है। रेल कर्मचारी साइन इन करें; यात्री और नागरिक बिना खाते के सूचनाएँ देख सकते हैं और खतरे की रिपोर्ट कर सकते हैं।'
              : 'Every kind of user has their own portal. Railway staff sign in; passengers and citizens can read block advisories and report a track hazard without an account.'}
          </p>
          <div className="row-wrap mt-lg">
            {user && (
              <button className="btn btn-primary" onClick={() => nav(PORTALS[user.portal].landing)}>
                {hi ? `${PORTALS[user.portal].label.hi} पर जाएँ` : `Continue to ${PORTALS[user.portal].label.en}`} <ArrowRight />
              </button>
            )}
            <Link to="/workflow" className="btn" data-tour="landing-workflow">
              <Compass /> {hi ? 'कार्य-प्रवाह के 8 चरण देखें' : 'See the 8-step workflow'}
            </Link>
          </div>
        </div>

        <div className="portal-grid">
          {PORTAL_ORDER.map((id) => {
            const p = PORTALS[id];
            const to = id === 'citizen' ? p.landing : user && (user.portal === id || user.role === 'DRM' || user.role === 'ADMIN') ? p.landing : `/login?next=${encodeURIComponent(p.landing)}`;
            return (
              <Link key={id} to={to} className="portal-card" data-tour={`portal-${id}`}>
                <div className="row">
                  <span className="swatch" style={{ background: `var(--pastel-${p.pastel})`, color: `var(--on-${p.pastel})` }}>
                    <span className="strong">{p.short.en.slice(0, 2).toUpperCase()}</span>
                  </span>
                  <span className="right">{p.mobileFirst ? <Badge tone="gray">{hi ? 'मोबाइल' : 'Mobile-first'}</Badge> : id === 'citizen' ? null : <Badge tone="outline">{hi ? 'साइन इन' : 'Sign in'}</Badge>}</span>
                </div>
                <div className="strong">{p.label[hi ? 'hi' : 'en']}</div>
                <div className="small muted">{p.description[hi ? 'hi' : 'en']}</div>
              </Link>
            );
          })}
        </div>

        {(canInstall || ios) && (
          <div className="callout callout-info" style={{ alignItems: 'center' }}>
            <Download />
            <div className="grow">
              <b>{t('installApp')}</b> — {t('installHint')}
            </div>
            <button className="btn btn-sm btn-dark" onClick={() => (canInstall ? void install() : nav('/install'))}>{t('installApp')}</button>
          </div>
        )}

        <div className="small muted">
          {hi ? 'यह बिल्ड सर्वर के बिना चलता है: फ़ीड सिंथेटिक हैं (मूल स्कीमा), खाते ब्राउज़र में हैं, योजना इंजन आपके डिवाइस पर चलता है।' : 'This build runs without a server: feeds are synthetic (native schemas), accounts live in the browser, and the planning engine runs on your device.'}
        </div>
      </main>
    </div>
  );
}
