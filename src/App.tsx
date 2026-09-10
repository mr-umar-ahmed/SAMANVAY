import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import NationalHeader, { type GovTheme, type GovLanguage } from './components/layout/NationalHeader';
import Navbar from './components/layout/Navbar';
import Sidebar from './components/layout/Sidebar';
import MobileBottomNav from './components/layout/MobileBottomNav';
import Dashboard from './pages/Dashboard';
import CorridorPage from './pages/CorridorPage';
import DemandsPage from './pages/DemandsPage';
import ARCIPage from './pages/ARCIPage';
import BundlerPage from './pages/BundlerPage';
import StringChartPage from './pages/StringChartPage';
import ControllerPage from './pages/ControllerPage';
import CautionOrdersPage from './pages/CautionOrdersPage';
import LiveBlocksPage from './pages/LiveBlocksPage';
import DisruptionPage from './pages/DisruptionPage';
import ScannerPage from './pages/ScannerPage';
import MultiHorizonPage from './pages/MultiHorizonPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AdminPage from './pages/AdminPage';
import { DEMO_USERS } from './data/seedData';
import { soundFx } from './utils/audio';
import type { User, PlanningHorizon } from './types';
import './App.css';

function App() {
  const [currentUser, setCurrentUser] = useState<User>(DEMO_USERS[0]);
  const [sidebarOpen, setSidebarOpen] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [horizon, setHorizon] = useState<PlanningHorizon>('dispatch');
  const [theme, setTheme] = useState<GovTheme>('dark');
  const [language, setLanguage] = useState<GovLanguage>('bilingual');
  const [audioMuted, setAudioMuted] = useState(false);

  useEffect(() => {
    document.documentElement.className = `theme-gov-${theme}`;
  }, [theme]);

  useEffect(() => {
    soundFx.muted = audioMuted;
  }, [audioMuted]);

  const handleStartDemo = () => {
    window.location.hash = '';
    window.location.pathname = '/';
  };

  return (
    <BrowserRouter>
      {/* Sovereign National Masthead */}
      <NationalHeader
        theme={theme}
        onThemeChange={setTheme}
        language={language}
        onLanguageChange={setLanguage}
        audioMuted={audioMuted}
        onToggleAudio={() => setAudioMuted(!audioMuted)}
      />

      <div className="app-layout">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          currentRole={currentUser.role}
          onStartDemo={handleStartDemo}
          language={language}
        />
        <div className={`app-main ${sidebarOpen ? 'app-main--sidebar-open' : 'app-main--sidebar-closed'}`}>
          <Navbar
            currentUser={currentUser}
            onUserChange={setCurrentUser}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            horizon={horizon}
            onHorizonChange={setHorizon}
            language={language}
          />
          <main className="app-content">
            <Routes>
              <Route path="/" element={<Dashboard language={language} />} />
              <Route path="/corridor" element={<CorridorPage />} />
              <Route path="/demands" element={<DemandsPage />} />
              <Route path="/arci" element={<ARCIPage />} />
              <Route path="/bundler" element={<BundlerPage />} />
              <Route path="/string-chart" element={<StringChartPage />} />
              <Route path="/controller" element={<ControllerPage />} />
              <Route path="/caution-orders" element={<CautionOrdersPage />} />
              <Route path="/live-blocks" element={<LiveBlocksPage />} />
              <Route path="/disruption" element={<DisruptionPage />} />
              <Route path="/scanner" element={<ScannerPage language={language} />} />
              <Route path="/multi-horizon" element={<MultiHorizonPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Routes>
          </main>
        </div>
      </div>

      {/* Native Mobile Bottom Navigation Dock */}
      <MobileBottomNav
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        language={language}
      />
    </BrowserRouter>
  );
}

export default App;
