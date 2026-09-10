import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Map, BarChart3, FileInput, Layers, CalendarClock,
  Shield, FileText, Radio, Camera, Calendar, LineChart, Settings, Play,
  AlertTriangle, CheckCircle2,
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

interface SidebarNavItem {
  id: string;
  labelEn: string;
  labelHi: string;
  icon: React.ReactNode;
  path: string;
  sectionEn: string;
  sectionHi: string;
  badge?: number;
  roles?: UserRole[];
}

const NAV_ITEMS: SidebarNavItem[] = [
  // Overview
  { id: 'dashboard', labelEn: 'Dashboard', labelHi: 'डैशबोर्ड', icon: <LayoutDashboard size={18} />, path: '/', sectionEn: 'Overview', sectionHi: 'विहंगावलोकन' },
  { id: 'corridor', labelEn: 'Corridor Digital Twin', labelHi: 'डिजिटल ट्विन', icon: <Map size={18} />, path: '/corridor', sectionEn: 'Overview', sectionHi: 'विहंगावलोकन' },

  // Prioritisation
  { id: 'demands', labelEn: 'Maintenance Demands', labelHi: 'अनुरक्षण मांगें', icon: <FileInput size={18} />, path: '/demands', sectionEn: 'Prioritisation', sectionHi: 'प्राथमिकता', badge: 7 },
  { id: 'arci', labelEn: 'ARCI Risk Scoring', labelHi: 'जोखिम मूल्यांकन', icon: <BarChart3 size={18} />, path: '/arci', sectionEn: 'Prioritisation', sectionHi: 'प्राथमिकता' },

  // Optimisation
  { id: 'bundler', labelEn: 'Joint Shadow Bundler', labelHi: 'बंडलिंग इंजन', icon: <Layers size={18} />, path: '/bundler', sectionEn: 'Optimisation', sectionHi: 'अनुकूलन' },
  { id: 'string-chart', labelEn: 'Block String Chart', labelHi: 'टाइम-स्पेस चार्ट', icon: <CalendarClock size={18} />, path: '/string-chart', sectionEn: 'Optimisation', sectionHi: 'अनुकूलन' },

  // Governance
  { id: 'controller', labelEn: 'Controller Console', labelHi: 'नियंत्रक कंसोल', icon: <Shield size={18} />, path: '/controller', sectionEn: 'Governance', sectionHi: 'प्रशासन व सुरक्षा', roles: ['section_controller', 'admin'] },
  { id: 'caution-orders', labelEn: 'Caution Orders', labelHi: 'सतर्कता आदेश (T/409B)', icon: <FileText size={18} />, path: '/caution-orders', sectionEn: 'Governance', sectionHi: 'प्रशासन व सुरक्षा' },
  { id: 'live-blocks', labelEn: 'Live Block Board', labelHi: 'लाइव ब्लॉक पटल', icon: <Radio size={18} />, path: '/live-blocks', sectionEn: 'Governance', sectionHi: 'प्रशासन व सुरक्षा', badge: 2 },
  { id: 'disruption', labelEn: 'Disruption Recovery', labelHi: 'व्यवधान समाधान', icon: <AlertTriangle size={18} />, path: '/disruption', sectionEn: 'Governance', sectionHi: 'प्रशासन व सुरक्षा' },

  // Field
  { id: 'scanner', labelEn: 'AI Incident Scanner', labelHi: 'एआई डिफेक्ट स्कैनर', icon: <Camera size={18} />, path: '/scanner', sectionEn: 'Field Ops', sectionHi: 'फील्ड ऑपरेशंस' },

  // Planning
  { id: 'multi-horizon', labelEn: 'Multi-Horizon', labelHi: 'बहु-क्षितिज योजना', icon: <Calendar size={18} />, path: '/multi-horizon', sectionEn: 'Planning', sectionHi: 'दीर्घकालिक योजना' },
  { id: 'analytics', labelEn: 'Analytics & KPIs', labelHi: 'विश्लेषण व केपीआई', icon: <LineChart size={18} />, path: '/analytics', sectionEn: 'Planning', sectionHi: 'दीर्घकालिक योजना' },

  // Admin
  { id: 'admin', labelEn: 'Admin & Audit', labelHi: 'सिस्टम ऑडिट', icon: <Settings size={18} />, path: '/admin', sectionEn: 'Admin', sectionHi: 'सिस्टम प्रशासन', roles: ['admin'] },
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

  const sectionsEn = [...new Set(filteredItems.map((i) => i.sectionEn))];

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
              GOVT OF INDIA &bull; NORTH CENTRAL RAILWAY
            </span>
          </div>
        </div>

        {/* Division & Section Indicator */}
        <div className="sidebar__section-info">
          <div className="sidebar__section-tag">
            <span className="sidebar__status-dot" />
            <span>AGRA DIVISION (NDLS-AGC 195 KM)</span>
          </div>
        </div>

        {/* Navigation Sections */}
        <nav className="sidebar__nav">
          {sectionsEn.map((secEn) => {
            const items = filteredItems.filter((i) => i.sectionEn === secEn);
            const secHi = items[0]?.sectionHi || secEn;
            const sectionDisplay = language === 'hi' ? secHi : language === 'en' ? secEn : `${secEn} • ${secHi}`;

            return (
              <div key={secEn} className="sidebar__section-group">
                <div className="sidebar__section-label">{sectionDisplay}</div>
                {items.map((item) => {
                  const label = language === 'hi' ? item.labelHi : language === 'en' ? item.labelEn : item.labelEn;
                  const subLabel = language === 'bilingual' ? item.labelHi : null;
                  const isActive = location.pathname === item.path;

                  return (
                    <button
                      key={item.id}
                      className={`sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                      onClick={() => handleNav(item.path)}
                    >
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
            <span>Golden Journey Demo</span>
          </button>
          
          <div className="sidebar__gov-verify">
            <CheckCircle2 size={11} className="sidebar__verify-icon" />
            <span>CRIS &bull; GatiShakti Verified v4.2</span>
          </div>
          <p className="sidebar__footer-text">
            OFFICIAL GOVERNMENT PORTAL &bull; RESTRICTED USE
          </p>
        </div>
      </aside>
    </>
  );
}
