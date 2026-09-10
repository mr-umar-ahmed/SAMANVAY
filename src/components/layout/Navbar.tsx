import { useState } from 'react';
import { Menu, Bell, ChevronDown, Shield, X, Search, AlertCircle } from 'lucide-react';
import { DEMO_USERS } from '../../data/seedData';
import { ROLE_LABELS, type User, type PlanningHorizon } from '../../types';
import { IndianRailwaysLogo, GovAuthBadge } from './Emblems';
import { soundFx } from '../../utils/audio';
import type { GovLanguage } from './NationalHeader';
import './Navbar.css';

interface NavbarProps {
  currentUser: User;
  onUserChange: (user: User) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  horizon: PlanningHorizon;
  onHorizonChange: (h: PlanningHorizon) => void;
  language?: GovLanguage;
}

const HORIZON_LABELS_MAP: Record<PlanningHorizon, { en: string; hi: string }> = {
  strategic: { en: '26-Week Strategic', hi: '26-सप्ताह रणनीतिक' },
  tactical: { en: '7-Day Tactical', hi: '7-दिवसीय रणनीतिक' },
  dispatch: { en: '24-Hour Dispatch', hi: '24-घंटे नियंत्रण' },
};

const ROLE_AVATAR_COLORS: Record<string, string> = {
  section_controller: '#3E2723',
  block_planner: '#7A284C',
  civil_engineer: '#A85A48',
  snt_engineer: '#8B5CF6',
  trd_engineer: '#D97706',
  field_reporter: '#EA580C',
  zonal_management: '#9D3862',
  admin: '#DC2626',
};

export default function Navbar({
  currentUser,
  onUserChange,
  sidebarOpen,
  onToggleSidebar,
  horizon,
  onHorizonChange,
  language = 'bilingual',
}: NavbarProps) {
  const [showRoleSwitcher, setShowRoleSwitcher] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const handleHorizonClick = (h: PlanningHorizon) => {
    soundFx.playClick();
    onHorizonChange(h);
  };

  return (
    <div className="navbar-container">
      <nav className={`navbar ${sidebarOpen ? 'navbar--sidebar-open' : ''}`}>
        <div className="navbar__left">
          <button
            className="navbar__menu-btn"
            onClick={() => {
              soundFx.playClick();
              onToggleSidebar();
            }}
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          
          <div className="navbar__brand">
            <div className="navbar__logo">
              <IndianRailwaysLogo size={30} />
            </div>
            <div className="navbar__titles">
              <div className="navbar__title-wrap">
                <span className="navbar__title">SAMANVAY</span>
                <span className="navbar__title-hindi">समन्वय</span>
              </div>
              <div className="navbar__tagline">
                AI Automatic Block Planning &bull; Indian Railways
              </div>
            </div>
          </div>
        </div>

        {/* Center: Planning Horizon Switcher */}
        <div className="navbar__center">
          {(Object.keys(HORIZON_LABELS_MAP) as PlanningHorizon[]).map((h) => {
            const lbl = HORIZON_LABELS_MAP[h];
            const displayLabel = language === 'hi' ? lbl.hi : language === 'en' ? lbl.en : `${lbl.en}`;
            return (
              <button
                key={h}
                className={`navbar__horizon-btn ${horizon === h ? 'navbar__horizon-btn--active' : ''}`}
                onClick={() => handleHorizonClick(h)}
              >
                {displayLabel}
              </button>
            );
          })}
        </div>

        {/* Right Action Icons & User Switcher */}
        <div className="navbar__right">
          {/* Quick Search */}
          <div className="navbar__search-wrap">
            <button
              className="navbar__search-btn"
              onClick={() => setSearchOpen(!searchOpen)}
              title="Search Trains, Stations, Blocks (Ctrl+K)"
            >
              <Search size={14} />
              <span className="navbar__search-label">Search Corridor...</span>
              <kbd className="navbar__kbd">⌘K</kbd>
            </button>
          </div>

          <GovAuthBadge type="cris" />

          <button
            className="navbar__alert-btn"
            aria-label="Alerts"
            onClick={() => soundFx.playClick()}
          >
            <Bell size={18} />
            <span className="navbar__alert-badge" />
          </button>

          <button
            className="navbar__user"
            onClick={() => {
              soundFx.playClick();
              setShowRoleSwitcher(!showRoleSwitcher);
            }}
          >
            <div
              className="navbar__avatar"
              style={{ background: ROLE_AVATAR_COLORS[currentUser.role] || '#3E2723' }}
            >
              {getInitials(currentUser.name)}
            </div>
            <div className="navbar__user-info">
              <span className="navbar__user-name">{currentUser.name}</span>
              <span className="navbar__user-role">{ROLE_LABELS[currentUser.role]}</span>
            </div>
            <ChevronDown size={14} style={{ opacity: 0.5 }} />
          </button>

          {showRoleSwitcher && (
            <>
              <div
                className="overlay"
                onClick={() => setShowRoleSwitcher(false)}
                style={{ background: 'transparent', backdropFilter: 'none' }}
              />
              <div className="role-switcher">
                <div className="role-switcher__title">
                  <Shield size={12} style={{ display: 'inline', marginRight: 6 }} />
                  Railway Authority Switcher (Demo)
                </div>
                {DEMO_USERS.map((user) => (
                  <button
                    key={user.id}
                    className={`role-switcher__item ${user.id === currentUser.id ? 'role-switcher__item--active' : ''}`}
                    onClick={() => {
                      soundFx.playSuccess();
                      onUserChange(user);
                      setShowRoleSwitcher(false);
                    }}
                  >
                    <div
                      className="role-switcher__item-avatar"
                      style={{ background: ROLE_AVATAR_COLORS[user.role] || '#3E2723' }}
                    >
                      {getInitials(user.name)}
                    </div>
                    <div className="role-switcher__item-info">
                      <div className="role-switcher__item-name">{user.name}</div>
                      <div className="role-switcher__item-designation">{user.designation} &bull; {user.division}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </nav>

      {/* Operational Emergency / Caution Order Marquee Ticker */}
      <div className="national-ticker" role="region" aria-label="Operational Bulletins">
        <div className="national-ticker__badge">
          <AlertCircle size={10} />
          <span>CAUTION NOTICE</span>
        </div>
        <div className="national-ticker__content-wrap">
          <div className="national-ticker__content">
            &bull; <strong>SPEED RESTRICTION:</strong> SR 30 km/h active KM 143+120 UP Fast (Kosi Kalan &ndash; Chhata) due to P-Way fastener check &bull; 
            &bull; <strong>JOINT SHADOW BLOCK:</strong> 180 min possession window scheduled 01:05&ndash;04:15 IST (Civil + S&amp;T + TRD Bundled) &bull; 
            &bull; <strong>KAVACH 4.0:</strong> Radio towers synchronized across Delhi-Agra High Density Chord (195 km) &bull; 
            &bull; <strong>ZERO DELAY IMPACT:</strong> 14 unnecessary closures eliminated &bull; 
            &bull; <strong>WEATHER ADVISORY:</strong> Normal visibility &gt; 1200m across NCR Section.
          </div>
        </div>
      </div>

      {/* Global Quick Search Modal */}
      {searchOpen && (
        <div className="search-modal-backdrop" onClick={() => setSearchOpen(false)}>
          <div className="search-modal" onClick={e => e.stopPropagation()}>
            <div className="search-modal__input-wrap">
              <Search size={18} className="search-modal__icon" />
              <input
                type="text"
                autoFocus
                placeholder="Type station (NDLS, AGC), train no (12002, 22436), or block ID..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="search-modal__input"
              />
              <button className="search-modal__close" onClick={() => setSearchOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="search-modal__quick-picks">
              <span className="search-modal__quick-title">Quick Navigation:</span>
              <div className="search-modal__chips">
                <span className="search-modal__chip">🚆 22436 Vande Bharat</span>
                <span className="search-modal__chip">🚉 AGC Agra Cantt</span>
                <span className="search-modal__chip">📦 JB-2025-03-12-001 (Joint Block)</span>
                <span className="search-modal__chip">📍 KM 143+120</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
