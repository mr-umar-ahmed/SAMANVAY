# SAMANVAY v4 — Progress & Implementation Plan

_Generated 2026-09-11 by scanning the repo against `docs/v4-spec.md` (spec) and `docs/CONTRACT.md` (build contract). Branch: `rebuild-v4`._

## TL;DR

The **foundation (wave 1)** described in the contract is built and looks solid: engine, store, auth, i18n, PWA, preloader, tour scaffold, shell, kit primitives, domain drawers, and the three heavy viz components. The **26 portal pages (wave 2)** are **not started** — every page file under `src/pages/**` (33 files) except the 5 auth pages is an 11-line stub (`This page is being built.`), and `src/App.tsx`'s routes still reflect an older, pre-v4 page/route naming scheme that does not match the spec's §2 route table at all. This is the bulk of the remaining work.

---

## 1. What's done (foundation)

| Area | File(s) | Status |
|---|---|---|
| Engine (worker + pure modules) | `src/engine/*.js`, `src/engine/worker.ts`, `src/engine/client.ts`, `src/engine/select.ts` | Present, ported per contract §1. Not re-audited line-by-line against §4.1 extensions (`fixedBlocks`, `pinnedTaskIds`, `excludedTaskIds`, `InjectSpec` additions) — **needs a quick verification pass**. |
| Store | `src/store/useAppStore.ts` (1042 lines) | All action names from CONTRACT §3 are implemented: `runPlan`, `runCandidate`/`promoteCandidate`/`discardCandidate`, `pinTask`/`excludeTask`, `proposeBlocks`, `concur`/`object`/`grant`/`refuse`/`lock`, `setIncharge`/`setResources`, `setFormStatus`, `addTsr`/`updateTsr`, `setPowerBlock`, `submitRbp`/`decideRbp`/`markJpoServed`, `escalate`/`reviewEscalation`/`direct`, `startPossession`/`markItemDone`/`clearPossession`, `messageControl`/`ackCaution`, requisition actions, report/triage actions, `notify`/`markRead`, `toast`, settings actions, `resetDemoData`. Slice shapes look close to spec §4.2 but haven't been diffed field-by-field. |
| Auth / portals | `src/auth/portals.ts`, `src/auth/users.ts` | Present (portal table, demo accounts, `can()` capability checks) — source of truth per spec, not to be modified without cause. |
| i18n | `src/i18n/index.ts`, `common.ts`, `citizen.ts` | `useT`/`translate` helpers present; EN/HI scaffolding exists. **Per-page dictionaries don't exist yet** since no pages are built — this is wave-2 work per page. |
| Design tokens | `src/styles/tokens.css`, `base.css`, `components.css` | Present; three themes (white/night/sunlight) referenced in spec §5 — not verified for completeness. |
| Shell / nav | `src/app/AppShell.tsx`, `CitizenShell.tsx`, `RequireAuth.tsx`, `EngineBoot.tsx`, `usePortal.ts`, `nav.ts` | Present. `CitizenShell.tsx` has uncommitted work-in-progress wiring the tour button in. |
| Preloader | `src/features/preloader/*` | Present. |
| PWA | `src/features/pwa/useInstallPrompt.ts` | Present. |
| Command palette | `src/features/palette/*` | Present (not in spec's page list — bonus/extra feature). |
| Notifications | `src/features/notifications/useNotifications.ts` | Present. |
| Tour | `src/features/tour/tour.ts`, `steps.ts` | Scaffold + steps present for several portals (control, planning, dept?, field, and citizen just added, uncommitted). **Needs a pass to match spec §6's exact step list per portal**, and steps depend on `data-tour` anchors that don't exist yet because the pages themselves aren't built. |
| Kit — primitives | `src/components/ui/index.tsx`, `extras.tsx` | ~40 components exported (`Card`, `DataTable`, `Badge`, `StatTile`, `Drawer`, `Modal`, `Tabs`, `Segmented`, `FormSheet`, `PrintButton`, `KeyValue`, `Timeline`, `RingGauge`, `BarChart`, `Sparkline`, `PhotoCapture`, `LocationPicker`, `SimLabel`/`HonestyTag`/`SourceLabel`, `ArciBar`, `AuditTrail`, `SeedStamp`, `TimeScrubber`, etc.). Names differ slightly from spec §5's list (e.g. `Segmented` vs `SegmentedControl`, `Field` vs `FormField`) — close enough to be usable, but **not a 1:1 match**; some spec components have no obvious equivalent yet (`HandoffMatrix`, `CompareTable`, `DiffTable`, `ScenarioCard`, `RequisitionForm`, `FeedHealthStrip`/`FeedCard`, `CopilotDrawer`, `NotificationDrawer`, `PortalCard`, `RequireCap`, `MiniMap`, `CorridorRuler`, `AdvisoryList`/`AdvisoryBanner`, `PossessionCard`, `CautionCard`, `IncidentDrawer`) — likely to be built inline inside pages, or still missing. |
| Kit — visualisations | `src/components/viz/{CorridorMap,StringDiagram,WeeklyGantt}.tsx` (+ css) | Substantial, real implementations (602–1052 lines each). This is the hardest kit work and it's done. |
| Kit — domain drawers | `src/components/domain/{BlockDrawer,TaskDrawer,ReportDrawer}.tsx`, `block/GrantWithChange.tsx`, `block/strings.ts`, `useDrawerParams.ts` | Present, real implementations (522–745 lines). `useDrawerParams()` matches contract §8's URL convention. |
| Tests | `tests/{cautionOrder,core,livePosition}.test.js` | Present — engine-level only; no page/component tests yet. |

**Net:** the hard, shared infrastructure that 26 pages will import from is largely in place. This matches the plan of "freeze the kit before portal work starts" (spec §5).

---

## 2. What's not started (the 26 pages)

Per spec §2, the app should route to 26 distinct page components. Today, `src/App.tsx` routes to a **different, older set of page names** (`ControlDeskPage`, `BlockRequestsPage`, `LiveCorridorPage`, `DeptDeskPage`, `DeptRegisterPage`, `DeptDemandPage`, `DeptBlocksPage`, `DeptResourcesPage`, `DivisionOverviewPage`, `AuditPage`, etc.) at routes that **don't match** the spec's route table (e.g. spec wants `/app/control/board|programme|map` → `ControlBoardPage`; current app has `/app/control` (index) → `ControlDeskPage`, `/app/control/blocks` → `BlockRequestsPage`, `/app/control/corridor` → `LiveCorridorPage`).

Every one of these 33 files under `src/pages/**` except the 5 auth pages is currently:
```tsx
/** STUB — replaced by the implementation agent. */
export default function XyzPage() {
  return (<div><PageHeader title="XyzPage" /><Callout tone="neutral">This page is being built.</Callout></div>);
}
```

### Gap: spec page → current state

| spec page (§2/§3) | routes | current equivalent file(s) | status |
|---|---|---|---|
| `PreloaderPage` | `/` | `src/features/preloader/Preloader.tsx` (not a route page — used as boot overlay) | ⚠️ works as overlay, not as its own route per spec wording — verify intent matches |
| `LoginPage` | `/login`, `/signup` | `pages/auth/LoginPage.tsx`, `SignupPage.tsx` | ✅ built (separate files, not tabs of one — check if spec's "tab `create`" matters) |
| `CitizenHomePage` | `/citizen`, `/citizen/train/:trainNo` | `pages/citizen/CitizenHomePage.tsx`, `CitizenTrainPage.tsx` | ❌ stub |
| `CitizenReportPage` | `/citizen/report`, `/citizen/reports(/:ref)` | `pages/citizen/CitizenReportPage.tsx`, `CitizenMyReportsPage.tsx` | ❌ stub |
| `ControlBoardPage` (chart/programme/map) | `/app/control/board\|programme\|map` | `pages/control/ControlDeskPage.tsx`, `LiveCorridorPage.tsx` (routes don't match: currently index/`corridor`) | ❌ stub, routes need remapping |
| `ReplanPage` | `/app/control/replan` | *(no file, no route)* | ❌ missing entirely |
| `IncidentsPage` (control/dept/division modes) | `/app/control/incidents`, `/app/:dept/incidents`, `/app/division/incidents` | `pages/shared/ReportsPage.tsx` (routed as `reports`/`incidents` inconsistently) | ❌ stub |
| `FormsPage` (control/tms/smms/tdms tabs) | `/app/control/caution`, `/app/tms/caution`, `/app/smms/disconnections`, `/app/tdms/powerblocks` | `pages/shared/CautionDeskPage.tsx` (routed only as `caution`/`forms`, not per-dept form names) | ❌ stub |
| `ExecutionLogPage` | `/app/control/log`, `/app/planning/adherence` | `pages/shared/ExecutionLogPage.tsx` (routed as `execution`, not `log`/`adherence`) | ❌ stub |
| `HandoffPage` | `/app/planning/handoff`, `/app/control/handoff` | `pages/planning/HandoffPage.tsx` | ❌ stub (route matches for planning; control's `handoff` route also present) |
| `RequisitionsPage` (cell/dept modes) | `/app/planning/demands(/:id)`, `/app/:dept/requisitions(/new,/:id)` | `pages/planning/IntakePage.tsx`? `pages/dept/DeptDemandPage.tsx` | ❌ stub, no `demands`/`requisitions` routes exist yet |
| `WeeklyPlanPage` (edit/review/dept) | `/app/planning/weekly`, `/app/control/weekly`, `/app/:dept/blocks` | `pages/planning/WeeklyPlanPage.tsx`, `pages/dept/DeptBlocksPage.tsx` | ❌ stub; control has no `weekly` route yet |
| `HorizonsPage` (plan/approve) | `/app/planning/monthly`, `/app/division/plans` | `pages/planning/MonthlyPage.tsx` (division has no `plans` route) | ❌ stub |
| `IntegrationPage` | `/app/planning/integration`, `/app/division/feeds` | `pages/shared/IntegrationPage.tsx` (division routed as `integration`, not `feeds`) | ❌ stub |
| `MethodPage` | `/app/:portal/method` | `pages/shared/MethodPage.tsx` | ❌ stub (route wired for planning/control/dept/division, matches spec) |
| `PlanningOverviewPage` | `/app/planning/overview` | `pages/planning/OverviewPage.tsx` (routed at index, not `/overview`) | ❌ stub |
| `RiskPage` | `/app/planning/risk` | `pages/planning/RiskPage.tsx` | ❌ stub (route matches) |
| `OptimiserPage` (studio/scenarios) | `/app/planning/optimiser`, `/app/planning/scenarios` | `pages/planning/StudioPage.tsx`, `pages/shared/ScenariosPage.tsx` (routed as `studio`, not `optimiser`) | ❌ stub |
| `DeptTodayPage` (today/resources) | `/app/:dept/today` | `pages/dept/DeptDeskPage.tsx` (routed at index, no `/today`) | ❌ stub |
| `DeptRegisterPage` | `/app/:dept/register` | `pages/dept/DeptRegisterPage.tsx` | ❌ stub (route matches) |
| `DivisionBriefPage` | `/app/division/brief` | `pages/division/DivisionOverviewPage.tsx` (routed at index, no `/brief`) | ❌ stub |
| `EscalationsPage` | `/app/division/escalations` | `pages/division/EscalationsPage.tsx` | ❌ stub (route matches) |
| `RoiPage` | `/app/division/roi` | `pages/division/RoiPage.tsx` | ❌ stub (route matches) |
| `AdminPage` | `/app/division/admin` | `pages/division/AdminPage.tsx` | ❌ stub (route matches) |
| `FieldTodayPage` | `/app/field/today` | `pages/field/FieldTodayPage.tsx` (routed at index, no `/today`) | ❌ stub |
| `FieldReportPage` (new/mine) | `/app/field/report`, `/app/field/reports(/:ref)` | `pages/field/FieldReportPage.tsx` (no `reports` list route) | ❌ stub |

Also present but **not in the 26-page spec list** (legacy/extra, need a decision): `pages/control/BlockRequestsPage.tsx`, `pages/dept/DeptDemandPage.tsx`, `pages/dept/DeptResourcesPage.tsx`, `pages/division/AuditPage.tsx`, `pages/field/FieldCautionPage.tsx`, `pages/field/FieldTrainPage.tsx`, `pages/shared/CopilotPage.tsx`. Some of these map onto spec sub-features (e.g. `CopilotDrawer` is a drawer, not a page, in spec) — worth reconciling rather than deleting blindly.

---

## 3. Implementation plan

### Phase 0 — Reconcile routes with the spec (COMPLETED ✅)
1. Rewrote `App.tsx`'s route tree and `src/app/nav.ts` to match spec §1/§2 exactly with view/mode/tab parameters.
2. Created the missing spec page stubs (`ControlBoardPage`, `ReplanPage`, `IncidentsPage`, `FormsPage`, `RequisitionsPage`, `HorizonsPage`, `PlanningOverviewPage`, `OptimiserPage`, `DeptTodayPage`, `DivisionBriefPage`) with typed props.
3. Updated portal landings in `src/auth/portals.ts` to point directly to spec landing routes (`/app/control/board`, `/app/planning/overview`, etc.) while retaining root index redirects.
4. Resolved 3 baseline TypeScript `TS6133` unused-variable errors in `ReportDrawer.tsx` and `WeeklyGantt.tsx`. `npm run typecheck` and `npm run build` now pass with 0 errors.

### Phase 1 — Build the 26 pages (IN PROGRESS 🚀)
1. **Control Portal**:
   - `ControlBoardPage` (COMPLETED ✅) — Full 24-h canvas StringDiagram, printable daily working programme table with Section Controller handover log, and interactive Leaflet CorridorMap with live interpolated train positions. Action modals: Grant, Grant with change (with evaluateBlockWindow), Refuse with operational reasons, Clear with speed fitness / TSR imposition, Lock D+1 programme.
   - `ReplanPage` (COMPLETED ✅) — Real-time candidate disruption re-optimisation with started/locked blocks fixed, event injection (OHE catenary sag, rail fracture, axle counter failure, fog speed caps, etc.), planDiff visualizer table, outcome comparison KPIs, promote/discard/escalate actions.
   - `IncidentsPage` (Next up) — Geo-routed hazard reports (control / dept / division modes).
   - `FormsPage` — TSR register, T/409, T/409B, T/351, power block isolation record.
   - `ExecutionLogPage` — Execution records, adherence, duration recalibration.
   - `HandoffPage` — Concurrence matrix, BDMS CSV/JSON export.
2. **Planning Portal**: `PlanningOverviewPage`, `IntegrationPage`, `RequisitionsPage`, `RiskPage`, `OptimiserPage`, `WeeklyPlanPage`, `HorizonsPage`, `MethodPage`.
3. **Departments**: `DeptTodayPage`, `DeptRegisterPage`, dept modes of shared pages.
4. **Division**: `DivisionBriefPage`, `EscalationsPage`, `RoiPage`, `AdminPage`.
5. **Field & Citizen**: `FieldTodayPage`, `FieldReportPage`, `CitizenHomePage`, `CitizenReportPage`.

### Suggested immediate next step
Build `IncidentsPage` (control / dept / division modes) and `FormsPage` (control / tms / smms / tdms tabs) to complete the operational forms and incident desk.

---

## 4. Open questions / things to verify before or during Phase 0
- Should `PreloaderPage` become an actual route component (`/`) rather than a boot overlay rendered alongside `BrowserRouter`, per spec wording "`PreloaderPage` — `/`"? Current `App.tsx` renders `<Preloader>` as an overlay over whatever route is under it, then shows `LandingPage` at `/`. Functionally similar, but worth confirming it satisfies spec intent (train video while first plan runs, then redirect).
- `LoginPage`/`SignupPage` are two files; spec describes `/signup` as "`LoginPage` (tab `create`)" — decide whether to merge into one component with tabs, or keep as-is (functionally equivalent, just a naming/structure difference, low priority).
- The 7 extra files not in the spec's 26 — confirm with the spec owner whether they're superseded by spec pages (most look like fragments of `IncidentsPage`/`RequisitionsPage`/`FormsPage`/`WeeklyPlanPage`/`CopilotDrawer` that should be merged in) or intentionally additional.
