import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import NationalHeader, { type GovTheme, type GovLanguage } from './components/layout/NationalHeader';
import Navbar from './components/layout/Navbar';
import Sidebar from './components/layout/Sidebar';
import MobileBottomNav from './components/layout/MobileBottomNav';

// 17 Enterprise Rail Command Modules
import Dashboard from './pages/Dashboard';
import WeeklyPlanPage from './pages/WeeklyPlanPage';
import MultiHorizonPage from './pages/MultiHorizonPage';
import StringChartPage from './pages/StringChartPage';
import ARCIPage from './pages/ARCIPage';
import IntegrationHubPage from './pages/IntegrationHubPage';
import OptimiserStudioPage from './pages/OptimiserStudioPage';
import BDMSHandoffPage from './pages/BDMSHandoffPage';
import CorridorPage from './pages/CorridorPage';
import RoleWorkbenchesPage from './pages/RoleWorkbenchesPage';
import CautionOrdersPage from './pages/CautionOrdersPage';
import DemandsPage from './pages/DemandsPage';
import ExecutionLogPage from './pages/ExecutionLogPage';
import DisruptionPage from './pages/DisruptionPage';
import AICopilotPage from './pages/AICopilotPage';
import DRMROIAuditPage from './pages/DRMROIAuditPage';
import ShowcaseTourPage from './pages/ShowcaseTourPage';

// Additional Utility & Admin Pages
import ScannerPage from './pages/ScannerPage';
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
    window.location.pathname = '/showcase';
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
              {/* PLAN (Tactical & Strategic) */}
              <Route path="/" element={<Dashboard language={language} />} />
              <Route path="/weekly" element={<WeeklyPlanPage />} />
              <Route path="/monthly" element={<MultiHorizonPage />} />
              <Route path="/multi-horizon" element={<MultiHorizonPage />} />

              {/* ANALYSE (Corridor & Risk) */}
              <Route path="/corridor" element={<StringChartPage />} />
              <Route path="/string-chart" element={<StringChartPage />} />
              <Route path="/risk" element={<ARCIPage />} />
              <Route path="/arci" element={<ARCIPage />} />
              <Route path="/integration" element={<IntegrationHubPage />} />

              {/* ACT (Optimization & Governance) */}
              <Route path="/studio" element={<OptimiserStudioPage />} />
              <Route path="/bundler" element={<OptimiserStudioPage />} />
              <Route path="/handoff" element={<BDMSHandoffPage />} />

              {/* LIVE & FIELD (Real-Time Ops) */}
              <Route path="/live-corridor" element={<CorridorPage />} />
              <Route path="/live-blocks" element={<CorridorPage />} />
              <Route path="/workbenches" element={<RoleWorkbenchesPage />} />
              <Route path="/controller" element={<RoleWorkbenchesPage />} />
              <Route path="/caution-orders" element={<CautionOrdersPage />} />
              <Route path="/demand-intake" element={<DemandsPage />} />
              <Route path="/demands" element={<DemandsPage />} />
              <Route path="/execution-log" element={<ExecutionLogPage />} />
              <Route path="/scenarios" element={<DisruptionPage />} />
              <Route path="/disruption" element={<DisruptionPage />} />
              <Route path="/copilot" element={<AICopilotPage />} />
              <Route path="/roi-audit" element={<DRMROIAuditPage />} />
              <Route path="/analytics" element={<DRMROIAuditPage />} />
              <Route path="/showcase" element={<ShowcaseTourPage />} />

              {/* Auxiliary & Field Inspections */}
              <Route path="/scanner" element={<ScannerPage language={language} />} />
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
