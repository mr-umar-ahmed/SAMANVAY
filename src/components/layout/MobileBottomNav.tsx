import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Camera, Layers, FileText, Menu } from 'lucide-react';
import { soundFx } from '../../utils/audio';
import type { GovLanguage } from './NationalHeader';
import './MobileBottomNav.css';

interface MobileBottomNavProps {
  onToggleSidebar: () => void;
  language?: GovLanguage;
}

export default function MobileBottomNav({ onToggleSidebar, language = 'bilingual' }: MobileBottomNavProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleNav = (path: string) => {
    soundFx.playClick();
    navigate(path);
  };

  const navItems = [
    {
      id: 'overview',
      path: '/',
      icon: <LayoutDashboard size={20} />,
      labelEn: 'Overview',
      labelHi: 'विहंगावलोकन',
    },
    {
      id: 'weekly',
      path: '/weekly',
      icon: <Layers size={20} />,
      labelEn: 'Weekly Gantt',
      labelHi: 'साप्ताहिक',
    },
    {
      id: 'live-corridor',
      path: '/live-corridor',
      icon: <Camera size={20} />,
      labelEn: 'Live GIS',
      labelHi: 'लाइव ट्विन',
    },
    {
      id: 'caution-orders',
      path: '/caution-orders',
      icon: <FileText size={20} />,
      labelEn: 'Caution',
      labelHi: 'सतर्कता T/409B',
    },
  ];

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        const label = language === 'hi' ? item.labelHi : item.labelEn;

        return (
          <button
            key={item.id}
            className={`mobile-bottom-nav__item ${isActive ? 'mobile-bottom-nav__item--active' : ''}`}
            onClick={() => handleNav(item.path)}
          >
            <div className="mobile-bottom-nav__icon">{item.icon}</div>
            <span className="mobile-bottom-nav__label">{label}</span>
          </button>
        );
      })}

      <button
        className="mobile-bottom-nav__item"
        onClick={() => {
          soundFx.playClick();
          onToggleSidebar();
        }}
      >
        <div className="mobile-bottom-nav__icon">
          <Menu size={20} />
        </div>
        <span className="mobile-bottom-nav__label">
          {language === 'hi' ? 'मेनू' : 'Menu'}
        </span>
      </button>
    </nav>
  );
}
