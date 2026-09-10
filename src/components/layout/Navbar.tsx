import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Menu, Bell, ChevronDown, Shield, X, Search, AlertCircle, Plus,
  CheckCircle2, Clock, MapPin, Radio, KeyRound
} from 'lucide-react';
import { DEMO_USERS } from '../../data/seedData';
import { ROLE_LABELS, type User, type PlanningHorizon } from '../../types';
import { IndianRailwaysLogo, GovAuthBadge } from './Emblems';
import { soundFx } from '../../utils/audio';
import { NAV_ITEMS } from './Sidebar';
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

const CORRIDORS = [
  { id: 'NCR_NDLS_CNB', name: 'NCR NDLS–CNB', fullName: 'New Delhi – Kanpur Central (440 KM)' },
  { id: 'NCR_NDLS_AGC', name: 'NCR NDLS–AGC', fullName: 'Delhi – Agra Cantt Chord (195 KM)' },
];

const ROLE_AVATAR_COLORS: Record<string, string> = {
  section_controller: '#343927',
  block_planner: '#4B655C',
  civil_engineer: '#A85A48',
  snt_engineer: '#8B5CF6',
  trd_engineer: '#A8A174',
  field_reporter: '#EA580C',
  zonal_management: '#7A284C',
  admin: '#872D1C',
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
  const navigate = useNavigate();
  const [showRoleSwitcher, setShowRoleSwitcher] = useState(false);
  const [showCorridorMenu, setShowCorridorMenu] = useState(false);
  const [selectedCorridor, setSelectedCorridor] = useState(CORRIDORS[0]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [grantSuccess, setGrantSuccess] = useState(false);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const handleHorizonClick = (h: PlanningHorizon) => {
    soundFx.playClick();
    onHorizonChange(h);
  };

  const handleGrantPermit = () => {
    soundFx.playSuccess();
    setGrantSuccess(true);
    setTimeout(() => {
      setGrantSuccess(false);
      setShowGrantModal(false);
    }, 1800);
  };

  const filteredNavItems = NAV_ITEMS.filter(item =>
    item.labelEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.labelHi.includes(searchQuery) ||
    item.code.toLowerCase() === searchQuery.toLowerCase()
  );

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
                AI Automatic Block Planning &bull; PS 26027
              </div>
            </div>
          </div>

          {/* Active Corridor Selector Dropdown */}
          <div className="navbar__corridor-selector">
            <button
              className="navbar__corridor-btn"
              onClick={() => {
                soundFx.playClick();
                setShowCorridorMenu(!showCorridorMenu);
              }}
              title="Change Active Rail Corridor"
            >
              <Radio size={12} className="text-forest" />
              <span>{selectedCorridor.name}</span>
              <ChevronDown size={12} />
            </button>

            {showCorridorMenu && (
              <>
                <div className="overlay" onClick={() => setShowCorridorMenu(false)} style={{ background: 'transparent' }} />
                <div className="corridor-menu animate-scale-in">
                  <div className="corridor-menu__header">Registered High-Density Corridors</div>
                  {CORRIDORS.map(cor => (
                    <button
                      key={cor.id}
                      className={`corridor-menu__item ${cor.id === selectedCorridor.id ? 'corridor-menu__item--active' : ''}`}
                      onClick={() => {
                        soundFx.playClick();
                        setSelectedCorridor(cor);
                        setShowCorridorMenu(false);
                      }}
                    >
                      <div className="corridor-menu__name">{cor.name}</div>
                      <div className="corridor-menu__sub">{cor.fullName}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Center: Planning Horizon Switcher */}
        <div className="navbar__center">
          {(Object.keys(HORIZON_LABELS_MAP) as PlanningHorizon[]).map((h) => {
            const lbl = HORIZON_LABELS_MAP[h];
            const displayLabel = language === 'hi' ? lbl.hi : lbl.en;
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
              onClick={() => setSearchOpen(true)}
              title="Search Modules, Trains, Stations (Ctrl+K)"
            >
              <Search size={14} />
              <span className="navbar__search-label">Quick Search...</span>
              <kbd className="navbar__kbd">Ctrl K</kbd>
            </button>
          </div>

          {/* Quick Action: + Grant Block */}
          <button
            className="navbar__grant-btn btn--forest"
            onClick={() => {
              soundFx.playClick();
              setShowGrantModal(true);
            }}
            title="Digitally Authorize Block Possession"
          >
            <Plus size={14} />
            <span>+ Grant Block</span>
          </button>

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
              style={{ background: ROLE_AVATAR_COLORS[currentUser.role] || '#343927' }}
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
                  Operational Persona Switcher
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
                      style={{ background: ROLE_AVATAR_COLORS[user.role] || '#343927' }}
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

      {/* Global Quick Search Modal (17 Modules Search) */}
      {searchOpen && (
        <div className="search-modal-backdrop" onClick={() => setSearchOpen(false)}>
          <div className="search-modal" onClick={e => e.stopPropagation()}>
            <div className="search-modal__input-wrap">
              <Search size={18} className="search-modal__icon" />
              <input
                type="text"
                autoFocus
                placeholder="Search 17 modules, stations, trains, or block ID (e.g. 1, Gantt, T/409B)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="search-modal__input"
              />
              <button className="search-modal__close" onClick={() => setSearchOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="search-modal__results">
              <span className="search-modal__quick-title">Platform Modules &amp; Shortcuts:</span>
              <div className="search-modal__list">
                {filteredNavItems.slice(0, 8).map(item => (
                  <button
                    key={item.id}
                    className="search-modal__item"
                    onClick={() => {
                      soundFx.playClick();
                      navigate(item.path);
                      setSearchOpen(false);
                    }}
                  >
                    <div className="search-modal__item-left">
                      <span className="search-modal__code">[{item.code}]</span>
                      <span className="search-modal__icon-wrap">{item.icon}</span>
                      <span className="search-modal__name">{item.labelEn}</span>
                    </div>
                    <span className="search-modal__sec">{item.sectionEn.split(' ')[0]}</span>
                  </button>
                ))}
              </div>

              <div className="search-modal__chips" style={{ marginTop: 12 }}>
                <span className="search-modal__chip" onClick={() => navigate('/weekly')}>[2] Weekly Plan Gantt</span>
                <span className="search-modal__chip" onClick={() => navigate('/risk')}>[5] ARCI Risk Engine</span>
                <span className="search-modal__chip" onClick={() => navigate('/caution-orders')}>[C] Form T/409B Caution</span>
                <span className="search-modal__chip" onClick={() => navigate('/live-corridor')}>[9] Live Corridor GIS</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Digital Block Permit Grant Modal */}
      {showGrantModal && (
        <div className="search-modal-backdrop" onClick={() => setShowGrantModal(false)}>
          <div className="grant-modal" onClick={e => e.stopPropagation()}>
            <div className="grant-modal__header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="grant-modal__icon-badge">
                  <KeyRound size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
                    Digital Block Possession Permit
                  </h3>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Statutory Permit issuance under G&amp;SR 4.09 &bull; NCR Agra Division
                  </div>
                </div>
              </div>
              <button className="search-modal__close" onClick={() => setShowGrantModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="grant-modal__body">
              {grantSuccess ? (
                <div style={{ padding: '30px 10px', textAlign: 'center' }}>
                  <CheckCircle2 size={48} style={{ color: '#4B655C', margin: '0 auto 12px' }} />
                  <h3 style={{ fontSize: 18, fontWeight: 900, color: '#FFFFFF', margin: '0 0 6px' }}>
                    Block Possession Authorized!
                  </h3>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
                    Permit <strong>#BP-NCR-2026-09-10-042</strong> transmitted to Section Controller, Field Gangs &amp; COA.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grant-modal__grid">
                    <div className="grant-modal__field">
                      <span className="grant-modal__label">Corridor Section</span>
                      <div className="grant-modal__val">
                        <MapPin size={12} /> {selectedCorridor.name} (KM 142.4 &ndash; 148.2)
                      </div>
                    </div>
                    <div className="grant-modal__field">
                      <span className="grant-modal__label">Scheduled Possession</span>
                      <div className="grant-modal__val">
                        <Clock size={12} /> 01:05 &ndash; 04:15 IST (190 Min)
                      </div>
                    </div>
                    <div className="grant-modal__field">
                      <span className="grant-modal__label">Bundled Departments</span>
                      <div className="grant-modal__val">
                        <span className="badge badge--dark-olive">Civil (Track)</span>
                        <span className="badge badge--forest-green">S&amp;T (Points)</span>
                        <span className="badge badge--warm-stone">TRD (OHE)</span>
                      </div>
                    </div>
                    <div className="grant-modal__field">
                      <span className="grant-modal__label">WTT Timetable Free Gap</span>
                      <div className="grant-modal__val" style={{ color: '#8be0c3' }}>
                        +14.2 min between #12051 and #22436
                      </div>
                    </div>
                  </div>

                  <div style={{
                    margin: '14px 0',
                    padding: '10px 14px',
                    background: 'rgba(52, 57, 39, 0.4)',
                    border: '1px solid var(--muted-sage)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 11.5,
                    lineHeight: 1.5,
                  }}>
                    <strong>Joint Concurrence Status:</strong> Sr. DEN (Civil), Sr. DEE (TRD), and Sr. DSTE (S&amp;T) cryptographic signatures verified. Automatic SIL-4 track isolation ready.
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                    <button className="btn btn--secondary" onClick={() => setShowGrantModal(false)}>
                      Cancel
                    </button>
                    <button className="btn btn--forest" onClick={handleGrantPermit}>
                      <KeyRound size={15} />
                      <span>Digitally Authorize &amp; Transmit Permit</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
