import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, CalendarDays, Calendar, GitCommit, AlertTriangle,
  Share2, Sliders, CheckSquare, Map, Users, FileText, PlusCircle,
  PlayCircle, Flame, Sparkles, TrendingUp, Compass, Play, CheckCircle2,
} from 'lucide-react';
import type { UserRole } from '../../types';
import { IndianRailwaysLogo, AshokaEmblem } from './Emblems';
import { soundFx } from '../../utils/audio';
import type { GovLanguage } from './NationalHeader';
import './Sidebar.css';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  currentRole: UserRole;
  onStartDemo: () => void;
  language?: GovLanguage;
}

export interface SidebarNavItem {
  id: string;
  code: string;
  labelEn: string;
  labelHi: string;
  icon: React.ReactNode;
  path: string;
  sectionEn: string;
  sectionHi: string;
  badge?: string | number;
  roles?: UserRole[];
}

export const NAV_ITEMS: SidebarNavItem[] = [
  // ── PLAN (Tactical & Strategic) ──
  {
    id: 'overview',
    code: '1',
    labelEn: 'Command Overview',
    labelHi: 'कमांड विहंगावलोकन',
    icon: <LayoutDashboard size={17} />,
    path: '/',
    sectionEn: 'PLAN (Tactical & Strategic)',
    sectionHi: 'योजना (रणनीतिक व सामरिक)',
  },
  {
    id: 'weekly',
    code: '2',
    labelEn: 'Weekly Block Plan (Gantt)',
    labelHi: 'साप्ताहिक ब्लॉक योजना (गैंट)',
    icon: <CalendarDays size={17} />,
    path: '/weekly',
    sectionEn: 'PLAN (Tactical & Strategic)',
    sectionHi: 'योजना (रणनीतिक व सामरिक)',
    badge: '7d',
  },
  {
    id: 'monthly',
    code: '3',
    labelEn: 'Monthly & 26-Week RBP',
    labelHi: 'मासिक व 26-सप्ताह आरबीपी',
    icon: <Calendar size={17} />,
    path: '/monthly',
    sectionEn: 'PLAN (Tactical & Strategic)',
    sectionHi: 'योजना (रणनीतिक व सामरिक)',
    badge: '10w',
  },

  // ── ANALYSE (Corridor & Risk) ──
  {
    id: 'corridor-capacity',
    code: '4',
    labelEn: 'Corridor Capacity (String Diagram)',
    labelHi: 'कॉरिडोर क्षमता (टाइम-स्पेस)',
    icon: <GitCommit size={17} />,
    path: '/corridor',
    sectionEn: 'ANALYSE (Corridor & Risk)',
    sectionHi: 'विश्लेषण (कॉरिडोर व जोखिम)',
  },
  {
    id: 'risk-arci',
    code: '5',
    labelEn: 'Risk & Priority (ARCI Engine)',
    labelHi: 'जोखिम व प्राथमिकता (ARCI)',
    icon: <AlertTriangle size={17} />,
    path: '/risk',
    sectionEn: 'ANALYSE (Corridor & Risk)',
    sectionHi: 'विश्लेषण (कॉरिडोर व जोखिम)',
    badge: '0.96',
  },
  {
    id: 'integration-hub',
    code: '6',
    labelEn: 'Integration Hub (Native Feeds)',
    labelHi: 'एकीकरण हब (CRIS डेटा)',
    icon: <Share2 size={17} />,
    path: '/integration',
    sectionEn: 'ANALYSE (Corridor & Risk)',
    sectionHi: 'विश्लेषण (कॉरिडोर व जोखिम)',
    badge: '5 Live',
  },

  // ── ACT (Optimization & Governance) ──
  {
    id: 'optimiser-studio',
    code: '7',
    labelEn: 'Optimiser Studio',
    labelHi: 'ऑप्टिमाइज़र स्टूडियो',
    icon: <Sliders size={17} />,
    path: '/studio',
    sectionEn: 'ACT (Optimization & Governance)',
    sectionHi: 'कार्रवाई (अनुकूलन व प्रशासन)',
  },
  {
    id: 'bdms-handoff',
    code: '8',
    labelEn: 'BDMS Hand-off & Audit',
    labelHi: 'BDMS हैंड-ऑफ व ऑडिट',
    icon: <CheckSquare size={17} />,
    path: '/handoff',
    sectionEn: 'ACT (Optimization & Governance)',
    sectionHi: 'कार्रवाई (अनुकूलन व प्रशासन)',
    badge: 'Sign',
  },

  // ── LIVE & FIELD (Real-Time Ops) ──
  {
    id: 'live-corridor',
    code: '9',
    labelEn: 'Live Corridor (GIS Digital Twin)',
    labelHi: 'लाइव कॉरिडोर (GIS डिजिटल ट्विन)',
    icon: <Map size={17} />,
    path: '/live-corridor',
    sectionEn: 'LIVE & FIELD (Real-Time Ops)',
    sectionHi: 'लाइव व फील्ड (रियल-टाइम)',
    badge: 'SIL-4',
  },
  {
    id: 'role-workbenches',
    code: '0',
    labelEn: 'Role Workbenches',
    labelHi: 'पद-आधारित कार्यक्षेत्र',
    icon: <Users size={17} />,
    path: '/workbenches',
    sectionEn: 'LIVE & FIELD (Real-Time Ops)',
    sectionHi: 'लाइव व फील्ड (रियल-टाइम)',
  },
  {
    id: 'caution-desk',
    code: 'C',
    labelEn: 'Caution & TSR Desk (Form T/409B)',
    labelHi: 'सतर्कता डेस्क (T/409B आदेश)',
    icon: <FileText size={17} />,
    path: '/caution-orders',
    sectionEn: 'LIVE & FIELD (Real-Time Ops)',
    sectionHi: 'लाइव व फील्ड (रियल-टाइम)',
  },
  {
    id: 'demand-intake',
    code: 'D',
    labelEn: 'Demand Intake',
    labelHi: 'अनुरक्षण मांग पंजीकरण',
    icon: <PlusCircle size={17} />,
    path: '/demand-intake',
    sectionEn: 'LIVE & FIELD (Real-Time Ops)',
    sectionHi: 'लाइव व फील्ड (रियल-टाइम)',
  },
  {
    id: 'execution-log',
    code: 'E',
    labelEn: 'Execution Log (Start/Clear)',
    labelHi: 'ब्लॉक निष्पादन लॉग',
    icon: <PlayCircle size={17} />,
    path: '/execution-log',
    sectionEn: 'LIVE & FIELD (Real-Time Ops)',
    sectionHi: 'लाइव व फील्ड (रियल-टाइम)',
  },
  {
    id: 'scenario-library',
    code: 'S',
    labelEn: 'Scenario Library (Disruptions)',
    labelHi: 'परिदृश्य पुस्तकालय (व्यवधान)',
    icon: <Flame size={17} />,
    path: '/scenarios',
    sectionEn: 'LIVE & FIELD (Real-Time Ops)',
    sectionHi: 'लाइव व फील्ड (रियल-टाइम)',
    badge: '5 Sim',
  },
  {
    id: 'ai-copilot',
    code: '?',
    labelEn: 'AI Copilot',
    labelHi: 'एआई सह-चालक',
    icon: <Sparkles size={17} />,
    path: '/copilot',
    sectionEn: 'LIVE & FIELD (Real-Time Ops)',
    sectionHi: 'लाइव व फील्ड (रियल-टाइम)',
  },
  {
    id: 'drm-roi-audit',
    code: 'M',
    labelEn: 'DRM ROI Audit',
    labelHi: 'DRM वित्तीय व समय बचत ऑडिट',
    icon: <TrendingUp size={17} />,
    path: '/roi-audit',
    sectionEn: 'LIVE & FIELD (Real-Time Ops)',
    sectionHi: 'लाइव व फील्ड (रियल-टाइम)',
  },
  {
    id: 'showcase-tour',
    code: 'G',
    labelEn: 'Showcase & Guided Tour',
    labelHi: 'सिस्टम टूर व प्रदर्शन',
    icon: <Compass size={17} />,
    path: '/showcase',
    sectionEn: 'LIVE & FIELD (Real-Time Ops)',
    sectionHi: 'लाइव व फील्ड (रियल-टाइम)',
  },
];

export default function Sidebar({
  open,
  onClose,
  currentRole,
  onStartDemo,
  language = 'bilingual',
}: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const filteredItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(currentRole) || currentRole === 'admin'
  );

  const sectionsEn = Array.from(new Set(filteredItems.map((i) => i.sectionEn)));

  const handleNav = (path: string) => {
    soundFx.playClick();
    navigate(path);
    if (window.innerWidth < 1024) {
      onClose();
    }
  };

  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'sidebar--open' : 'sidebar--closed'}`}>
        {/* Official Header Badge */}
        <div className="sidebar__header">
          <div className="sidebar__emblem-pair">
            <AshokaEmblem size={28} />
            <IndianRailwaysLogo size={32} />
          </div>
          <div className="sidebar__brand-text">
            <div className="sidebar__brand-title">
              <span className="sidebar__brand-name">SAMANVAY</span>
              <span className="sidebar__brand-hi">समन्वय</span>
            </div>
            <span className="sidebar__brand-sub">
              GOVT OF INDIA &bull; PS 26027
            </span>
          </div>
        </div>

        {/* Division & Section Indicator */}
        <div className="sidebar__section-info">
          <div className="sidebar__section-tag">
            <span className="sidebar__status-dot" />
            <span>NCR NDLS–CNB / NDLS–AGC CHORD</span>
          </div>
        </div>

        {/* Navigation Sections */}
        <nav className="sidebar__nav">
          {sectionsEn.map((secEn) => {
            const items = filteredItems.filter((i) => i.sectionEn === secEn);
            const secHi = items[0]?.sectionHi || secEn;
            const sectionDisplay = language === 'hi' ? secHi : language === 'en' ? secEn : `${secEn}`;

            return (
              <div key={secEn} className="sidebar__section-group">
                <div className="sidebar__section-label">{sectionDisplay}</div>
                {items.map((item) => {
                  const label = language === 'hi' ? item.labelHi : item.labelEn;
                  const subLabel = language === 'bilingual' ? item.labelHi : null;
                  const isActive = location.pathname === item.path ||
                    (item.path === '/' && location.pathname === '') ||
                    (item.id === 'risk-arci' && location.pathname === '/arci') ||
                    (item.id === 'corridor-capacity' && location.pathname === '/string-chart') ||
                    (item.id === 'scenario-library' && location.pathname === '/disruption') ||
                    (item.id === 'caution-desk' && location.pathname === '/caution-orders') ||
                    (item.id === 'demand-intake' && location.pathname === '/demands') ||
                    (item.id === 'drm-roi-audit' && location.pathname === '/analytics');

                  return (
                    <button
                      key={item.id}
                      className={`sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                      onClick={() => handleNav(item.path)}
                      title={`${item.labelEn} [${item.code}]`}
                    >
                      <span className="sidebar__link-code">[{item.code}]</span>
                      <span className="sidebar__link-icon">{item.icon}</span>
                      <div className="sidebar__link-content">
                        <span className="sidebar__link-title">{label}</span>
                        {subLabel && <span className="sidebar__link-sub">{subLabel}</span>}
                      </div>
                      {item.badge && <span className="sidebar__link-badge">{item.badge}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Official Footer / Demo Launch */}
        <div className="sidebar__footer">
          <button
            className="sidebar__demo-btn"
            onClick={() => {
              soundFx.playSuccess();
              onStartDemo();
            }}
          >
            <Play size={14} />
            <span>Golden Corridor Tour</span>
          </button>
          
          <div className="sidebar__gov-verify">
            <CheckCircle2 size={11} className="sidebar__verify-icon" />
            <span>CRIS &bull; GatiShakti &bull; SIL-4</span>
          </div>
          <p className="sidebar__footer-text">
            MINISTRY OF RAILWAYS &bull; SIH 2026
          </p>
        </div>
      </aside>
    </>
  );
}
