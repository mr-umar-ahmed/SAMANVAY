import { lazy, Suspense, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PORTALS, type PortalId } from './auth/portals';
import { useAppStore } from './store/useAppStore';
import { EngineBoot } from './app/EngineBoot';
import { RequireAuth } from './app/RequireAuth';
import { AppShell } from './app/AppShell';
import { CitizenShell } from './app/CitizenShell';
import { Preloader } from './features/preloader/Preloader';
import { Spinner } from './components/ui';

// public & auth
const LandingPage = lazy(() => import('./pages/auth/LandingPage'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const SignupPage = lazy(() => import('./pages/auth/SignupPage'));
const InstallPage = lazy(() => import('./pages/auth/InstallPage'));

// citizen
const CitizenHomePage = lazy(() => import('./pages/citizen/CitizenHomePage'));
const CitizenTrainPage = lazy(() => import('./pages/citizen/CitizenTrainPage'));
const CitizenStationPage = lazy(() => import('./pages/citizen/CitizenStationPage'));
const CitizenReportPage = lazy(() => import('./pages/citizen/CitizenReportPage'));
const CitizenMyReportsPage = lazy(() => import('./pages/citizen/CitizenMyReportsPage'));

// control
const ControlBoardPage = lazy(() => import('./pages/control/ControlBoardPage'));
const ReplanPage = lazy(() => import('./pages/control/ReplanPage'));

// planning
const PlanningOverviewPage = lazy(() => import('./pages/planning/PlanningOverviewPage'));
const WeeklyPlanPage = lazy(() => import('./pages/planning/WeeklyPlanPage'));
const RiskPage = lazy(() => import('./pages/planning/RiskPage'));
const OptimiserPage = lazy(() => import('./pages/planning/OptimiserPage'));
const HandoffPage = lazy(() => import('./pages/planning/HandoffPage'));
const CapacityPage = lazy(() => import('./pages/planning/CapacityPage'));

// shared
const HorizonsPage = lazy(() => import('./pages/shared/HorizonsPage'));
const IncidentsPage = lazy(() => import('./pages/shared/IncidentsPage'));
const FormsPage = lazy(() => import('./pages/shared/FormsPage'));
const RequisitionsPage = lazy(() => import('./pages/shared/RequisitionsPage'));
const ExecutionLogPage = lazy(() => import('./pages/shared/ExecutionLogPage'));
const IntegrationPage = lazy(() => import('./pages/shared/IntegrationPage'));
const MethodPage = lazy(() => import('./pages/shared/MethodPage'));
const CopilotPage = lazy(() => import('./pages/shared/CopilotPage'));
const WorkflowPage = lazy(() => import('./pages/shared/WorkflowPage'));

// departments
const DeptTodayPage = lazy(() => import('./pages/dept/DeptTodayPage'));
const DeptRegisterPage = lazy(() => import('./pages/dept/DeptRegisterPage'));

// division
const DivisionBriefPage = lazy(() => import('./pages/division/DivisionBriefPage'));
const EscalationsPage = lazy(() => import('./pages/division/EscalationsPage'));
const RoiPage = lazy(() => import('./pages/division/RoiPage'));
const AdminPage = lazy(() => import('./pages/division/AdminPage'));
const AuditPage = lazy(() => import('./pages/division/AuditPage'));

// field
const FieldTodayPage = lazy(() => import('./pages/field/FieldTodayPage'));
const FieldReportPage = lazy(() => import('./pages/field/FieldReportPage'));
const FieldCautionPage = lazy(() => import('./pages/field/FieldCautionPage'));
const FieldTrainPage = lazy(() => import('./pages/field/FieldTrainPage'));

function Fallback() {
  return (
    <div className="row muted" style={{ padding: 32, justifyContent: 'center' }}>
      <Spinner /> <span>Loading…</span>
    </div>
  );
}

/** /app → the signed-in user's portal, else sign in. */
function AppRedirect() {
  const user = useAppStore((s) => s.user);
  return <Navigate to={user ? PORTALS[user.portal].landing : '/login'} replace />;
}

function NotFound() {
  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 40 }} className="stack">
      <h1>Page not found</h1>
      <p className="muted">That address does not exist in SAMANVAY.</p>
      <a href="/" className="btn" style={{ alignSelf: 'flex-start' }}>Go to the portals</a>
    </div>
  );
}

/** A staff portal subtree: guard + shell + the pages listed. */
function portal(id: PortalId, children: ReactNode) {
  return (
    <Route key={id} path={`/app/${id}`} element={<RequireAuth />}>
      <Route element={<AppShell />}>{children}</Route>
    </Route>
  );
}

const deptChildren = (
  <>
    <Route index element={<Navigate to="today" replace />} />
    <Route path="today" element={<DeptTodayPage tab="today" />} />
    <Route path="resources" element={<DeptTodayPage tab="resources" />} />
    <Route path="register" element={<DeptRegisterPage />} />
    <Route path="requisitions" element={<RequisitionsPage mode="dept" />} />
    <Route path="demand" element={<RequisitionsPage mode="dept" />} />
    <Route path="blocks" element={<WeeklyPlanPage mode="dept" />} />
    <Route path="caution" element={<FormsPage tab="caution" />} />
    <Route path="disconnections" element={<FormsPage tab="disconnections" />} />
    <Route path="powerblocks" element={<FormsPage tab="powerblocks" />} />
    <Route path="forms" element={<FormsPage />} />
    <Route path="incidents" element={<IncidentsPage mode="dept" />} />
    <Route path="incidents/:id" element={<IncidentsPage mode="dept" />} />
    <Route path="reports" element={<IncidentsPage mode="dept" />} />
    <Route path="copilot" element={<CopilotPage />} />
    <Route path="method" element={<MethodPage />} />
    <Route path="workflow" element={<WorkflowPage />} />
    <Route path="*" element={<NotFound />} />
  </>
);

export default function App() {
  const [booting, setBooting] = useState(true);
  return (
    <BrowserRouter>
      <EngineBoot />
      {booting && <Preloader onDone={() => setBooting(false)} />}
      <Suspense fallback={<Fallback />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/install" element={<InstallPage />} />
          <Route path="/workflow" element={<WorkflowPage />} />

          <Route path="/citizen" element={<CitizenShell />}>
            <Route index element={<CitizenHomePage />} />
            <Route path="train/:number" element={<CitizenTrainPage />} />
            <Route path="station/:code" element={<CitizenStationPage />} />
            <Route path="report" element={<CitizenReportPage />} />
            <Route path="reports" element={<CitizenMyReportsPage />} />
            <Route path="reports/:ref" element={<CitizenMyReportsPage />} />
            <Route path="my-reports" element={<CitizenMyReportsPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>

          <Route path="/app" element={<AppRedirect />} />

          {portal(
            'planning',
            <>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<PlanningOverviewPage />} />
              <Route path="demands" element={<RequisitionsPage mode="cell" />} />
              <Route path="demands/:id" element={<RequisitionsPage mode="cell" />} />
              <Route path="intake" element={<RequisitionsPage mode="cell" />} />
              <Route path="risk" element={<RiskPage />} />
              <Route path="weekly" element={<WeeklyPlanPage mode="edit" />} />
              <Route path="monthly" element={<HorizonsPage mode="plan" />} />
              <Route path="optimiser" element={<OptimiserPage tab="studio" />} />
              <Route path="studio" element={<OptimiserPage tab="studio" />} />
              <Route path="scenarios" element={<OptimiserPage tab="scenarios" />} />
              <Route path="handoff" element={<HandoffPage />} />
              <Route path="adherence" element={<ExecutionLogPage mode="adherence" />} />
              <Route path="execution" element={<ExecutionLogPage mode="adherence" />} />
              <Route path="capacity" element={<CapacityPage />} />
              <Route path="integration" element={<IntegrationPage />} />
              <Route path="copilot" element={<CopilotPage />} />
              <Route path="method" element={<MethodPage />} />
              <Route path="workflow" element={<WorkflowPage />} />
              <Route path="*" element={<NotFound />} />
            </>
          )}
          {portal(
            'control',
            <>
              <Route index element={<Navigate to="board" replace />} />
              <Route path="board" element={<ControlBoardPage view="board" />} />
              <Route path="programme" element={<ControlBoardPage view="programme" />} />
              <Route path="map" element={<ControlBoardPage view="map" />} />
              <Route path="blocks" element={<ControlBoardPage view="board" />} />
              <Route path="corridor" element={<ControlBoardPage view="map" />} />
              <Route path="replan" element={<ReplanPage />} />
              <Route path="disruptions" element={<ReplanPage />} />
              <Route path="incidents" element={<IncidentsPage mode="control" />} />
              <Route path="incidents/:id" element={<IncidentsPage mode="control" />} />
              <Route path="caution" element={<FormsPage tab="caution" />} />
              <Route path="weekly" element={<WeeklyPlanPage mode="review" />} />
              <Route path="handoff" element={<HandoffPage />} />
              <Route path="log" element={<ExecutionLogPage mode="control" />} />
              <Route path="execution" element={<ExecutionLogPage mode="control" />} />
              <Route path="copilot" element={<CopilotPage />} />
              <Route path="method" element={<MethodPage />} />
              <Route path="workflow" element={<WorkflowPage />} />
              <Route path="*" element={<NotFound />} />
            </>
          )}
          {portal('tms', deptChildren)}
          {portal('smms', deptChildren)}
          {portal('tdms', deptChildren)}
          {portal(
            'division',
            <>
              <Route index element={<Navigate to="brief" replace />} />
              <Route path="brief" element={<DivisionBriefPage />} />
              <Route path="plans" element={<HorizonsPage mode="approve" />} />
              <Route path="programme" element={<HorizonsPage mode="approve" />} />
              <Route path="escalations" element={<EscalationsPage />} />
              <Route path="roi" element={<RoiPage />} />
              <Route path="incidents" element={<IncidentsPage mode="division" />} />
              <Route path="incidents/:id" element={<IncidentsPage mode="division" />} />
              <Route path="feeds" element={<IntegrationPage readOnly />} />
              <Route path="integration" element={<IntegrationPage readOnly />} />
              <Route path="admin" element={<AdminPage />} />
              <Route path="audit" element={<AuditPage />} />
              <Route path="copilot" element={<CopilotPage />} />
              <Route path="method" element={<MethodPage />} />
              <Route path="workflow" element={<WorkflowPage />} />
              <Route path="*" element={<NotFound />} />
            </>
          )}
          {portal(
            'field',
            <>
              <Route index element={<Navigate to="today" replace />} />
              <Route path="today" element={<FieldTodayPage />} />
              <Route path="report" element={<FieldReportPage tab="new" />} />
              <Route path="reports" element={<FieldReportPage tab="mine" />} />
              <Route path="reports/:ref" element={<FieldReportPage tab="mine" />} />
              <Route path="caution" element={<FieldCautionPage />} />
              <Route path="train" element={<FieldTrainPage />} />
              <Route path="copilot" element={<CopilotPage />} />
              <Route path="workflow" element={<WorkflowPage />} />
              <Route path="*" element={<NotFound />} />
            </>
          )}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
