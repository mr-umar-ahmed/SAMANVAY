import { useState, useEffect } from 'react';
import { Volume2, VolumeX, Shield, Sun, Moon, Zap, Wifi } from 'lucide-react';
import { AshokaEmblem, TricolorRibbon } from './Emblems';
import './NationalHeader.css';

export type GovTheme = 'dark' | 'light' | 'contrast';
export type GovLanguage = 'en' | 'hi' | 'bilingual';

interface NationalHeaderProps {
  theme: GovTheme;
  onThemeChange: (theme: GovTheme) => void;
  language: GovLanguage;
  onLanguageChange: (lang: GovLanguage) => void;
  audioMuted: boolean;
  onToggleAudio: () => void;
}

export default function NationalHeader({
  theme,
  onThemeChange,
  language,
  onLanguageChange,
  audioMuted,
  onToggleAudio,
}: NationalHeaderProps) {
  const [istTime, setIstTime] = useState<string>('');
  const [dateStr, setDateStr] = useState<string>('');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      // IST time formatted
      const options: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      };
      const dateOptions: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      };
      setIstTime(new Intl.DateTimeFormat('en-GB', options).format(now));
      setDateStr(new Intl.DateTimeFormat('en-GB', dateOptions).format(now));
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const nextTheme = () => {
    if (theme === 'dark') onThemeChange('light');
    else if (theme === 'light') onThemeChange('contrast');
    else onThemeChange('dark');
  };

  const nextLanguage = () => {
    if (language === 'bilingual') onLanguageChange('en');
    else if (language === 'en') onLanguageChange('hi');
    else onLanguageChange('bilingual');
  };

  return (
    <header className="gov-header-wrapper" role="banner">
      {/* 3-stripe National Tricolor Ribbon */}
      <TricolorRibbon height={3} />

      <div className="gov-masthead">
        <div className="gov-masthead__container">
          {/* Left: Emblem of India & Ministry Titles */}
          <div className="gov-masthead__left">
            <AshokaEmblem size={34} className="gov-masthead__emblem" />
            <div className="gov-masthead__hierarchy">
              <div className="gov-masthead__titles-hi">
                भारत सरकार &bull; रेल मंत्रालय
              </div>
              <div className="gov-masthead__titles-en">
                GOVERNMENT OF INDIA &bull; MINISTRY OF RAILWAYS
              </div>
              <div className="gov-masthead__division">
                उत्तर मध्य रेलवे (आगरा मंडल) &bull; North Central Railway (Agra Division)
              </div>
            </div>
          </div>

          {/* Center: Live Command Telemetry */}
          <div className="gov-masthead__center">
            <div className="gov-telemetry-badge gov-telemetry-badge--clock">
              <span className="gov-telemetry-dot gov-telemetry-dot--green" />
              <span className="gov-telemetry-label">IST</span>
              <span className="gov-telemetry-time">{istTime || '19:30:00'}</span>
              <span className="gov-telemetry-date">{dateStr}</span>
            </div>

            <div className="gov-telemetry-badge gov-telemetry-badge--kavach">
              <Shield size={12} className="gov-telemetry-icon--green" />
              <span>KAVACH 4.0 SIL-4: ACTIVE</span>
            </div>

            <div className="gov-telemetry-badge gov-telemetry-badge--fois">
              <Wifi size={11} className="gov-telemetry-icon--cyan" />
              <span>FOIS/COA: 100%</span>
            </div>
          </div>

          {/* Right: Security, Language & Theme Controls */}
          <div className="gov-masthead__right">
            <span className="gov-security-badge" title="Restricted Ministry Access">
              RESTRICTED
            </span>

            {/* Language Switcher Button */}
            <button
              className="gov-control-btn"
              onClick={nextLanguage}
              title="Toggle Language: English / हिंदी / Bilingual"
              aria-label="Toggle language"
            >
              <span className="gov-control-btn__icon">🌐</span>
              <span className="gov-control-btn__text">
                {language === 'bilingual' ? 'द्विभाषी' : language === 'hi' ? 'हिंदी' : 'English'}
              </span>
            </button>

            {/* Theme Switcher Button */}
            <button
              className="gov-control-btn"
              onClick={nextTheme}
              title="Toggle Theme: Night Command / Official Light / High Contrast"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <>
                  <Moon size={13} className="gov-icon--gold" />
                  <span className="gov-control-btn__text">Night Ops</span>
                </>
              ) : theme === 'light' ? (
                <>
                  <Sun size={13} className="gov-icon--gold" />
                  <span className="gov-control-btn__text">Portal</span>
                </>
              ) : (
                <>
                  <Zap size={13} className="gov-icon--gold" />
                  <span className="gov-control-btn__text">Contrast</span>
                </>
              )}
            </button>

            {/* Audio Toggle */}
            <button
              className="gov-control-btn gov-control-btn--icon-only"
              onClick={onToggleAudio}
              title={audioMuted ? 'Unmute Audio Cues' : 'Mute Audio Cues'}
              aria-label={audioMuted ? 'Unmute Audio Cues' : 'Mute Audio Cues'}
            >
              {audioMuted ? <VolumeX size={14} /> : <Volume2 size={14} className="gov-icon--cyan" />}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
