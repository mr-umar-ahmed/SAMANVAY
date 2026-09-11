/**
 * Portal shell: sidebar (desktop) / drawer + bottom bar (mobile), top bar with
 * search, corridor, re-plan, notifications and the user menu. Pages render in
 * <Outlet/>. The shell never shows a number it did not get from the store.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, AlertTriangle, Bell, BookOpen, Calendar, CalendarRange, Camera, CheckSquare, ClipboardList, Compass, Download, FileText, Flame, Home, Inbox, List, LogOut, Map as MapIcon, Menu, Moon, PlayCircle, PlusCircle, Radio, RefreshCw, Search, Settings, Share2, Shield, Sliders, Sparkles, Sun, Train, TrendingUp, Users, Wrench, X, Zap, Languages, HelpCircle, ChevronDown,
} from 'lucide-react';
import { PORTALS, PORTAL_ORDER, ROLES } from '../auth/portals';
import { CORRIDORS } from '../engine/corridors.js';
import type { Corridor } from '../engine/types';
import { LANGS, useLang, useT } from '../i18n';
import { common } from '../i18n/common';
import { useAppStore } from '../store/useAppStore';
import { findNavItem, PORTAL_NAV, type NavIcon } from './nav';
import { usePortal } from './usePortal';
import { useNotifications } from '../features/notifications/useNotifications';
import { useInstallPrompt } from '../features/pwa/useInstallPrompt';
import { CommandPalette } from '../features/palette/CommandPalette';
import { Badge, Toasts } from '../components/ui';
import { startTour } from '../features/tour/tour';
import { TOUR_STEPS } from '../features/tour/steps';
import './shell.css';

const ICONS: Record<NavIcon, React.ComponentType<{ size?: number }>> = {
  home: Home, calendar: Calendar, 'calendar-range': CalendarRange, activity: Activity, 'alert-triangle': AlertTriangle, share: Share2, sliders: Sliders, 'check-square': CheckSquare, map: MapIcon, users: Users, 'file-text': FileText, 'plus-circle': PlusCircle, 'play-circle': PlayCircle, flame: Flame, sparkles: Sparkles, 'trending-up': TrendingUp, compass: Compass, list: List, wrench: Wrench, radio: Radio, zap: Zap, shield: Shield, camera: Camera, train: Train, inbox: Inbox, settings: Settings, clipboard: ClipboardList, book: BookOpen,
};

export function AppShell() {
  const user = useAppStore((s) => s.user);
  const portal = usePortal();
  const meta = PORTALS[portal];
  const lang = useLang();
  const t = useT(common);
  const loc = useLocation();
  const nav = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const corridorId = useAppStore((s) => s.corridorId);
  const setCorridor = useAppStore((s) => s.setCorridor);
  const status = useAppStore((s) => s.planStatus);
  const progress = useAppStore((s) => s.planProgress);
  const runPlan = useAppStore((s) => s.runPlan);
  const logout = useAppStore((s) => s.logout);
  const snapshot = useAppStore((s) => s.snapshot);
  const toursDone = useAppStore((s) => s.toursDone);
  const markTourDone = useAppStore((s) => s.markTourDone);
  const { list: notifications, unread } = useNotifications();
  const markAllRead = useAppStore((s) => s.markAllRead);
  const markRead = useAppStore((s) => s.markRead);
  const { canInstall, install, ios } = useInstallPrompt();

  const groups = PORTAL_NAV[portal];
  const current = findNavItem(portal, loc.pathname);
  const mobileItems = groups.flatMap((g) => g.items).filter((i) => i.mobile).slice(0, 4);
  const corridors = CORRIDORS as Corridor[];
  const langOptions = LANGS.filter((l) => l.scope === 'all');

  useEffect(() => {
    setDrawer(false);
    setNotifOpen(false);
    setUserOpen(false);
  }, [loc.pathname]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === 'Escape') {
        setNotifOpen(false);
        setUserOpen(false);
        setDrawer(false);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const runTour = () => {
    const steps = TOUR_STEPS[portal]?.[lang === 'hi' ? 'hi' : 'en'];
    if (!steps?.length) return;
    startTour(steps, {
      navigate: (r) => nav(r),
      onDone: () => markTourDone(portal),
      labels: lang === 'hi' ? { next: 'आगे', prev: 'वापस', done: 'पूर्ण', progress: '{{current}} / {{total}}' } : { next: 'Next', prev: 'Back', done: 'Done', progress: '{{current}} of {{total}}' },
    });
  };

  // first-run tour, once the plan is ready
  useEffect(() => {
    if (status !== 'ready' || toursDone[portal]) return;
    const timer = setTimeout(runTour, 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, portal]);

  const pageTitle = current ? current.label[lang === 'hi' ? 'hi' : 'en'] : meta.label[lang === 'hi' ? 'hi' : 'en'];
  const engineTone = status === 'ready' ? 'ok' : status === 'error' ? 'crit' : 'warn';
  const engineText = status === 'ready' ? t('engineReady') : status === 'error' ? t('engineError') : status === 'running' ? t('engineRunning') : t('engineIdle');
  const kpi = snapshot?.result.weekly.kpis;
  const showReplan = portal !== 'field' && portal !== 'citizen';
  const otherPortals = useMemo(() => PORTAL_ORDER.filter((p) => p !== portal && p !== 'citizen'), [portal]);
  const canSwitch = user?.role === 'DRM' || user?.role === 'ADMIN';

  return (
    <div className={`shell portal-${portal}`} data-portal={portal}>
      {/* ── Sidebar ─────────────────────────────────────────── */}
      {drawer && <div className="shell-backdrop" onClick={() => setDrawer(false)} />}
      <aside className={`shell-side ${drawer ? 'open' : ''}`} data-tour="sidebar">
        <div className="shell-brand">
          <img src="/favicon.svg" alt="" width={32} height={32} />
          <div className="grow">
            <div className="shell-brand-name">SAMANVAY <span>समन्वय</span></div>
            <div className="shell-brand-sub">{t('ps')}</div>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm show-mobile" onClick={() => setDrawer(false)} aria-label={t('closeMenu')}>
            <X />
          </button>
        </div>
        <div className={`shell-portal pastel-${meta.pastel}`} data-tour="portal-chip">
          <div className="caps" style={{ color: 'inherit', opacity: 0.8 }}>{t('switchPortal')}</div>
          <div className="strong">{meta.label[lang === 'hi' ? 'hi' : 'en']}</div>
          {user && <div className="small" style={{ opacity: 0.85 }}>{ROLES[user.role].label[lang === 'hi' ? 'hi' : 'en']}</div>}
        </div>
        <nav className="shell-nav" aria-label="Main">
          {groups.map((g) => (
            <div key={g.label.en} className="shell-group">
              <div className="shell-group-label">{g.label[lang === 'hi' ? 'hi' : 'en']}</div>
              {g.items.map((item) => {
                const Icon = ICONS[item.icon];
                const active = current?.route === item.route;
                return (
                  <Link key={item.route} to={item.route} className={`shell-link ${active ? 'active' : ''}`} data-tour={item.tour} aria-current={active ? 'page' : undefined}>
                    <Icon size={17} />
                    <span>{item.label[lang === 'hi' ? 'hi' : 'en']}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="shell-side-foot">
          <div className="row small" title={progress}>
            <span className={`dot dot-${engineTone} ${status === 'running' ? 'dot-live' : ''}`} />
            <span className="grow truncate">{engineText}</span>
            {kpi && <span className="tiny muted num">{kpi.blockCount} {t('blocks').toLowerCase()}</span>}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={t('theme')} data-tour="theme">
              {theme === 'dark' ? <Sun /> : <Moon />}
              <span>{theme === 'dark' ? t('themeLight') : t('themeDark')}</span>
            </button>
            <label className="btn btn-sm btn-ghost" title={t('language')} data-tour="language" style={{ position: 'relative' }}>
              <Languages />
              <span>{LANGS.find((l) => l.code === language)?.native ?? 'English'}</span>
              <select value={langOptions.some((l) => l.code === language) ? language : 'en'} onChange={(e) => setLanguage(e.target.value as typeof language)} aria-label={t('language')} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}>
                {langOptions.map((l) => (
                  <option key={l.code} value={l.code}>{l.native}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-sm btn-ghost" onClick={runTour} data-tour="tour-button">
              <HelpCircle />
              <span>{t('tour')}</span>
            </button>
            {(canInstall || ios) && (
              <button className="btn btn-sm btn-ghost" onClick={() => (canInstall ? void install() : nav('/install'))} title={t('installHint')}>
                <Download />
                <span>{t('installApp')}</span>
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main column ─────────────────────────────────────── */}
      <div className="shell-main">
        <header className="shell-top">
          <button className="btn btn-ghost btn-icon show-mobile" onClick={() => setDrawer(true)} aria-label={t('openMenu')}>
            <Menu />
          </button>
          <div className="shell-title grow">
            <div className="caps hide-mobile">{meta.short[lang === 'hi' ? 'hi' : 'en']}</div>
            <div className="strong truncate">{pageTitle}</div>
          </div>
          <button className="btn btn-sm shell-search hide-mobile" onClick={() => setPaletteOpen(true)} data-tour="search">
            <Search />
            <span className="muted">{t('search')}…</span>
            <kbd className="kbd">Ctrl K</kbd>
          </button>
          <button className="btn btn-ghost btn-icon show-mobile" onClick={() => setPaletteOpen(true)} aria-label={t('search')}>
            <Search />
          </button>
          {showReplan && (
            <label className="shell-corridor hide-mobile" data-tour="corridor">
              <span className="caps">{t('corridor')}</span>
              <select className="select" value={corridorId} onChange={(e) => setCorridor(e.target.value)} aria-label={t('corridor')}>
                {corridors.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
                ))}
              </select>
            </label>
          )}
          {showReplan && (
            <button className="btn btn-sm hide-mobile" onClick={() => void runPlan({ reason: 'manual re-plan' })} disabled={status === 'running'} data-tour="replan" title={progress}>
              <RefreshCw className={status === 'running' ? 'spin' : ''} />
              <span>{status === 'running' ? t('replanning') : t('replan')}</span>
            </button>
          )}
          <div style={{ position: 'relative' }}>
            <button className="btn btn-ghost btn-icon" onClick={() => setNotifOpen((v) => !v)} aria-label={t('notifications')} data-tour="notifications">
              <Bell />
              {unread > 0 && <span className="shell-bell-badge num">{unread > 9 ? '9+' : unread}</span>}
            </button>
            {notifOpen && (
              <>
                <div className="shell-popover-backdrop" onClick={() => setNotifOpen(false)} />
                <div className="shell-popover shell-notifs">
                  <div className="row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
                    <b className="grow">{t('notifications')}</b>
                    {unread > 0 && (
                      <button className="btn btn-sm btn-ghost" onClick={() => markAllRead(notifications.map((n) => n.id))}>{t('markAllRead')}</button>
                    )}
                  </div>
                  <div className="shell-notif-list">
                    {notifications.length === 0 && <div className="empty" style={{ border: 'none' }}>{t('noNotifications')}</div>}
                    {notifications.map((n) => (
                      <button
                        key={n.id}
                        className={`shell-notif ${n.read ? 'read' : ''}`}
                        onClick={() => {
                          markRead(n.id);
                          setNotifOpen(false);
                          if (n.route) nav(n.route);
                        }}
                      >
                        <span className={`dot ${n.type === 'CRITICAL' ? 'dot-crit' : n.type === 'WARNING' ? 'dot-warn' : n.type === 'ACTION' ? 'dot-smms' : 'dot-ok'}`} />
                        <span className="grow">
                          <span className="strong small">{n.title}</span>
                          <span className="tiny muted" style={{ display: 'block' }}>{n.detail}</span>
                        </span>
                        {n.tag && <Badge tone="outline">{n.tag}</Badge>}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          {user && (
            <div style={{ position: 'relative' }}>
              <button className="shell-user" onClick={() => setUserOpen((v) => !v)} data-tour="user-menu">
                <span className={`shell-avatar pastel-${meta.pastel}`}>{initials(user.name)}</span>
                <span className="hide-mobile" style={{ textAlign: 'left', lineHeight: 1.15 }}>
                  <span className="strong small" style={{ display: 'block' }}>{user.name}</span>
                  <span className="tiny muted" style={{ display: 'block' }}>{user.designation}</span>
                </span>
                <ChevronDown size={14} className="hide-mobile" style={{ opacity: 0.5 }} />
              </button>
              {userOpen && (
                <>
                  <div className="shell-popover-backdrop" onClick={() => setUserOpen(false)} />
                  <div className="shell-popover shell-usermenu">
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
                      <div className="strong">{user.name}</div>
                      <div className="small muted">{ROLES[user.role].label[lang === 'hi' ? 'hi' : 'en']} · {user.division} division</div>
                      {user.demo && <Badge tone="yellow" className="mt">Demo account</Badge>}
                    </div>
                    {canSwitch && (
                      <div style={{ padding: '8px 6px', borderBottom: '1px solid var(--line)' }}>
                        <div className="caps" style={{ padding: '4px 8px' }}>{t('switchPortal')}</div>
                        {otherPortals.map((p) => (
                          <Link key={p} to={PORTALS[p].landing} className="shell-menu-item">
                            <span className={`dot`} style={{ background: `var(--pastel-${PORTALS[p].pastel})`, border: '1px solid var(--line-2)' }} />
                            {PORTALS[p].label[lang === 'hi' ? 'hi' : 'en']}
                          </Link>
                        ))}
                      </div>
                    )}
                    <div style={{ padding: '6px' }}>
                      <Link to="/" className="shell-menu-item"><Compass size={15} /> All portals</Link>
                      <button className="shell-menu-item" onClick={() => { logout(); nav('/login'); }}>
                        <LogOut size={15} /> {t('signOut')}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </header>

        {status === 'running' && (
          <div className="shell-progress" role="status">
            <RefreshCw size={12} className="spin" />
            <span className="truncate">{progress}</span>
          </div>
        )}

        <main className="shell-content" id="main">
          <Outlet />
        </main>

        {/* ── Mobile bottom bar ──────────────────────────────── */}
        <nav className="shell-bottom show-mobile" aria-label="Mobile">
          {mobileItems.map((item) => {
            const Icon = ICONS[item.icon];
            const active = current?.route === item.route;
            return (
              <Link key={item.route} to={item.route} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
                <Icon size={20} />
                <span>{item.label[lang === 'hi' ? 'hi' : 'en']}</span>
              </Link>
            );
          })}
          <button onClick={() => setDrawer(true)}>
            <Menu size={20} />
            <span>{lang === 'hi' ? 'मेनू' : 'Menu'}</span>
          </button>
        </nav>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} portal={portal} />
      <Toasts />
    </div>
  );
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
