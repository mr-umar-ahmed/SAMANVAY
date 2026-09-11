# SAMANVAY v4 — Final build specification

Merged from the judge, operator and builder proposals. Words and page content follow the operator lens; prominence and demo path follow the judge lens; structure, state model and descoping follow the builder lens. Source-of-truth files already in the repo and not to be re-invented: `src/engine/*` (engine, unchanged except the extensions in §4.1), `src/auth/portals.ts` (portals, roles, demo accounts, password `samanvay`), `src/auth/users.ts` (browser-local accounts), `src/i18n/index.ts` (`useT(dict)`, EN/HI app-wide, BN/MR/TA/TE/GU/KN citizen-only), `src/styles/tokens.css` (palette). Portal accents are the `pastel` values already in `portals.ts`; department category colours are the `--tms / --smms / --tdms` slots in `tokens.css`. Do not change either.

Conventions used below: **store slices** are named as in §4; `replan` means `plan.replan(reason)` (worker run, new snapshot); "toast" strings are exact; routes under `/app/<portal>/…` are guarded by `RequirePortal`; capability names are the `Capability` union in `portals.ts` (additions listed in §4.3).

---

## 1. PORTAL TABLE

| id | audience | landing route | accent pastel | mobile-first? | nav items (route → label) |
|---|---|---|---|---|---|
| control | Section Controller, Chief Controller (COA users on the board) | `/app/control/board` | lavender `#D9DBFD` | no | `/app/control/board` → Board · `/app/control/programme` → Programme · `/app/control/map` → Map · `/app/control/incidents` → Incidents · `/app/control/caution` → Caution & TSR · `/app/control/replan` → Re-plan · `/app/control/weekly` → Weekly (review) · `/app/control/handoff` → Hand-off · `/app/control/log` → Log · `/app/control/method` → Method |
| planning | Divisional block planning cell (Sr DOM office + Sr DEN block cell); owns engine runs and demand → plan → hand-off | `/app/planning/overview` | blue `#EDF5FD` | no | `/app/planning/overview` → Overview · `/app/planning/demands` → Demands · `/app/planning/risk` → Risk & priority · `/app/planning/weekly` → Weekly plan · `/app/planning/monthly` → Monthly & 26-week · `/app/planning/optimiser` → Optimiser · `/app/planning/scenarios` → Scenarios · `/app/planning/handoff` → Hand-off · `/app/planning/adherence` → Adherence · `/app/planning/integration` → Integration · `/app/planning/method` → Method |
| tms | Civil / P-Way: Sr DEN, SSE/P-Way (TMS users) | `/app/tms/today` | green `#CCE9CD` | no | `/app/tms/today` → Today · `/app/tms/register` → Register · `/app/tms/requisitions` → Requisitions · `/app/tms/blocks` → Blocks · `/app/tms/caution` → Caution & TSR · `/app/tms/incidents` → Incidents · `/app/tms/method` → Method |
| smms | Signal & Telecom: Sr DSTE, SSE/Signal (SMMS users) | `/app/smms/today` | blue `#EDF5FD` | no | `/app/smms/today` → Today · `/app/smms/register` → Register · `/app/smms/requisitions` → Requisitions · `/app/smms/blocks` → Blocks · `/app/smms/disconnections` → T/351 · `/app/smms/incidents` → Incidents · `/app/smms/method` → Method |
| tdms | Traction Distribution: Sr DEE (TRD), SSE/TRD (TDMS users) | `/app/tdms/today` | yellow `#F7ECD7` | no | `/app/tdms/today` → Today · `/app/tdms/register` → Register · `/app/tdms/requisitions` → Requisitions · `/app/tdms/blocks` → Blocks · `/app/tdms/powerblocks` → Power blocks · `/app/tdms/incidents` → Incidents · `/app/tdms/method` → Method |
| division | DRM, ADRM, branch officers; System Administrator (admin is a capability, not a portal) | `/app/division/brief` | pink `#F1D5DB` | no | `/app/division/brief` → Brief · `/app/division/plans` → Approvals · `/app/division/escalations` → Escalations · `/app/division/roi` → ROI audit · `/app/division/incidents` → Incidents · `/app/division/feeds` → Feeds · `/app/division/method` → Method · `/app/division/admin` → Admin (shown only with `admin` capability) |
| field | Gang in-charge / keyman / SSE at site; loco pilots | `/app/field/today` | gray `#EDEDED` shell; possession card tinted by its lead department | yes | `/app/field/today` → Today · `/app/field/report` → Report · `/app/field/reports` → My reports |
| citizen | Passengers and public; no login needed | `/citizen` | green `#CCE9CD` | yes | `/citizen` → Home · `/citizen/report` → Report · `/citizen/reports` → My reports (About is a sheet on Home) |

Field and citizen use a bottom tab bar; the six staff portals use a sidebar. `tms`, `smms`, `tdms` are one code module (`DeptTodayPage`, `DeptRegisterPage`, and dept modes of shared pages) parameterised by `dept` from the route.

---

## 2. ROUTE TABLE

26 page components. `/app` and `/app/:portal` redirect to the session portal's landing (or `/login`).

| route | page component | portals | purpose |
|---|---|---|---|
| `/` | `PreloaderPage` | public | Train video while the worker runs the first plan; then `/login` or last portal landing |
| `/login` | `LoginPage` | public | Portal tiles + sign in; demo accounts; continue as citizen |
| `/signup` | `LoginPage` (tab `create`) | public | Create a browser-local account (citizen or field) |
| `/citizen`, `/citizen/train/:trainNo` | `CitizenHomePage` | citizen | Language, train/station search, advisories; train panel at `:trainNo` |
| `/citizen/report`, `/citizen/reports`, `/citizen/reports/:ref` | `CitizenReportPage` | citizen | Hazard report; my reports; status by reference |
| `/app/control/board`, `/app/control/programme`, `/app/control/map` | `ControlBoardPage` (view = chart / programme / map) | control | 24-h string chart with tonight's blocks and grant/refuse/clear; printable programme; corridor map with train lookup |
| `/app/control/replan` | `ReplanPage` | control | Inject a failure, re-optimise the rest of today, approve or discard the diff |
| `/app/control/incidents`, `/app/:dept/incidents`, `/app/division/incidents` (+`/:id`) | `IncidentsPage` (mode = control / dept / division) | control, tms, smms, tdms, division | Geo-routed reports: verify, caution, convert to task, resolve |
| `/app/control/caution`, `/app/tms/caution`, `/app/smms/disconnections`, `/app/tdms/powerblocks` | `FormsPage` (tabs by role) | control, tms, smms, tdms | TSR register, T/409, T/409B, T/351, power-block isolation record; print |
| `/app/control/log`, `/app/planning/adherence` | `ExecutionLogPage` | control, planning | Granted/started/done/cleared records, adherence, duration recalibration (planning) |
| `/app/planning/handoff`, `/app/control/handoff` | `HandoffPage` | planning, control | Concurrence → grant → lock matrix, audit trail, BDMS CSV/JSON, advisory text |
| `/app/planning/demands` (+`/:id`), `/app/:dept/requisitions` (+`/new`, `/:id`) | `RequisitionsPage` (mode = cell / dept) | planning, tms, smms, tdms | BDMS-style requisitions: raise (dept), validate/accept/return (cell) |
| `/app/planning/weekly`, `/app/control/weekly`, `/app/:dept/blocks` | `WeeklyPlanPage` (mode = edit / review / dept) | planning, control, tms, smms, tdms | 7-day Gantt + day string chart; block drawer; shift; send to Control; concur/object; joint-block suggestions |
| `/app/planning/monthly`, `/app/division/plans` | `HorizonsPage` (mode = plan / approve) | planning, division | 30-day plan with capital works; 26-week RBP with JPO notice and Weibull workload; submit/approve |
| `/app/planning/integration`, `/app/division/feeds` | `IntegrationPage` (readOnly for division) | planning, division | Feed health, data-quality issues, corridor graph (twin) |
| `/app/:portal/method` | `MethodPage` | control, planning, tms, smms, tdms, division | Pipeline, model metrics, what is simulated, deck targets as target/literature, glossary, tour launcher |
| `/app/planning/overview` | `PlanningOverviewPage` | planning | Computed KPIs vs simulated baseline, gauge, headway, queues |
| `/app/planning/risk` | `RiskPage` | planning | ARCI table with term-by-term explanation, bands, mandatory floor, model cards |
| `/app/planning/optimiser`, `/app/planning/scenarios` | `OptimiserPage` (tab = studio / scenarios) | planning | Weights, rules, iterations, what-ifs, candidate vs working vs baseline; 5 presets |
| `/app/:dept/today` | `DeptTodayPage` (tab = today / resources) | tms, smms, tdms | SSE's first screen: overdue, tonight's blocks, requisitions needing action, incidents; gangs & machines |
| `/app/:dept/register` | `DeptRegisterPage` | tms, smms, tdms | Native-schema register with ARCI band; raise requisition from a row |
| `/app/division/brief` | `DivisionBriefPage` | division | Outcomes vs baseline by corridor, scorecards, safety backlog, adherence |
| `/app/division/escalations` | `EscalationsPage` | division | Mandatory past floor, refused ≥2, stale demands/incidents, predicted escalations |
| `/app/division/roi` | `RoiPage` | division | Line-item ₹ from editable, source-labelled assumptions |
| `/app/division/admin` | `AdminPage` | division (`admin` capability) | Users, seed, defaults, storage, tour reset |
| `/app/field/today` | `FieldTodayPage` | field | Gang: possession card with Start/Done/Clear + TSRs on beat. Loco pilot: today's run with caution orders |
| `/app/field/report`, `/app/field/reports` (+`/:ref`) | `FieldReportPage` (tab = new / mine) | field | Incident capture; my reports and block history |

Drawers/sheets that are not pages: `NotificationDrawer` (bell), `CopilotDrawer` (control, planning, division), `SettingsSheet` (account menu), `BlockDrawer`, `TaskDrawer`, `IncidentDrawer`, `AboutSheet` (citizen).

---

## 3. PAGE SPECS

Global behaviour for every page: while `plan.status === 'running'` the previous snapshot stays rendered with an "Updating…" chip in the TopBar (`RunBanner` shows the worker step text); if no snapshot exists yet, pages render `PageSkeleton`. Every page reads from `useSnapshot(selector)` and `useAppStore`; no page keeps derived plan state locally. Every action with a state effect writes an `audit` entry `{ts, user, action, ref, detail}`.

### 3.1 `PreloaderPage` — `/`
- Purpose: one-time cinematic entry while the worker runs the first plan.
- Engine inputs: `plan.replan('boot')` progress messages (`ingest`, `risk`, `weekly`, `monthly`).
- Layout: full-bleed muted `<video playsinline>` (existing asset in `public/media`, poster frame; `prefers-reduced-motion` → still image) → wordmark "SAMANVAY" + "Block planning for Indian Railways divisions" → `ProgressBar` whose caption is the live worker step text → `Button` "Skip" appears after 1.5 s.
- Actions: **Skip** / video end → wait for `plan.status !== 'running'` → navigate to `session.user ? portal landing : /login`; sets `settings.introPlayed = true` (never replays unless "Replay intro" in SettingsSheet).
- Labels: none. Loading: this page is the loading state. If the worker errors: `EmptyState` "The planning engine could not start" with "Retry" (`plan.replan('boot')`).

### 3.2 `LoginPage` — `/login`, `/signup`
- Purpose: choose a portal and sign in; demo accounts exposed honestly.
- Engine inputs: none (auth from `users.ts`).
- Layout: `PageHeader` wordmark → left 60 %: 8 `PortalCard`s (lucide icon, portal label, one-line audience, accent stripe) → right 40 %: `Tabs` Sign in | Create account. Sign in: `FormField` email, password, "Remember on this device", `Button` Sign in; disclosure "Demo accounts" lists `DEMO_ACCOUNTS` with "Use" buttons; link "Continue as citizen". Create account: `SegmentedControl` Citizen | Field staff; citizen: name, language; field: name, email, password, department, section, invite code (seeded `SAMANVAY-FIELD`). Footer: `LanguageSwitch`, `ThemeSwitch`, `SimLabel kind="localAuth"`.
- Actions: **Sign in** → `auth.signIn(email, pw)`; on success `session.user` set, `session.lastPortal` set, navigate to landing (or `?next`), start tour if `!tour.done[portal]`; on failure inline error "Email or password not recognised". **Use demo account** → fills and signs in. **Continue as citizen** → `session.user = null`, navigate `/citizen`. **Create account** → `users.signup` with role `CITIZEN` or `GANG_INCHARGE`/`LOCO_PILOT`; wrong invite code → inline error; success → sign in + navigate.
- Labels: "Browser-local demo accounts — no server, no real authentication". Empty/loading: button spinner during hash.

### 3.3 `CitizenHomePage` — `/citizen`, `/citizen/train/:trainNo`
- Purpose: language, train/station search, published advisories; train panel.
- Engine inputs: `select.advisories` (from GRANTED/LOCKED blocks via `advisories.js`), `trainLookup.search/itinerary/blocksMet`, `snapshot.corridor.stations`, `snapshot.feeds.timetable`.
- Layout: `LanguageSwitch` chips (8 languages) → `SearchBar` (train no/name, station name/code; suggestions) → saved trains chips → honest line "Planned maintenance blocks and expected regulation only. No PNR, seat, berth or live running status." → `AdvisoryList` (next 7 days; card: date, window, section, trains affected count) filtered by `settings.homeStation` when set → `InstallPrompt` banner → footer link "About" (`AboutSheet`: what this is / is not, install instructions, languages, "Demo built for SIH 2026 PS 26027"). At `/citizen/train/:trainNo` a `Drawer` (full-screen on mobile): train header, `AdvisoryBanner` ("This train may be held up to about {n} min near {station}" or "Nothing planned for this train in the next 7 days"), `StationList` itinerary with block markers, note card.
- Actions: **Choose station** → `settings.homeStation`; **Search** → navigate `/citizen/train/:no` or filter by station; **Save train** → `settings.savedTrains`; toast "Saved"; **Share** → clipboard copy of advisory text; toast "Copied"; **Report a hazard** → `/citizen/report`; **Install app** → `InstallPrompt.prompt()`.
- Labels: `SimLabel kind="planningEstimate"` on every regulation figure; `SimLabel kind="seededFeed" system="COA"` on the itinerary footer.
- Empty: no advisories → "No planned blocks affect {station} in the next 7 days." Unknown train → "No train {no} in this corridor's timetable."

### 3.4 `CitizenReportPage` — `/citizen/report`, `/citizen/reports`, `/citizen/reports/:ref`
- Purpose: hazard report → reference; track status.
- Engine inputs: `normalizer.snapToCorridor(lat,lng)` (nearest station, km, line, section), routing rule category → dept; `intake.reports`.
- Layout (new): `Stepper` cards: `PhotoCapture` → `LocationPicker` (GPS with accuracy chip, map tap, or nearest station + km) → category `ChipGroup` (track, overhead wire, signal, level crossing, fire or smoke, obstruction or animal, other) → description (`FormField textarea`, in chosen language) → optional name/phone (stored locally) → consent line → `Button` Submit. Success card: reference `SAM-0042`, "Routed to Engineering (Civil)" in plain words. List (`/citizen/reports`): `ReportCard`s from `intake.myReportRefs`. Detail: `Timeline` Received → Routed to {dept} → Being verified → Work planned → Resolved / Not found; photo thumbnail; no staff names.
- Actions: **Submit** → `intake.reportIncident({source:'citizen', …})` → status `UNVERIFIED`, `notify.push` to control + routed dept ("New hazard report {ref} near {station}"), navigate `/citizen/reports/:ref`; toast "Report {ref} received". **Track by reference** → navigate. **Report another** → `/citizen/report`.
- Labels: "Stored in this browser only — nothing is transmitted"; "Routing is rule-based on category and nearest corridor asset".
- Empty: "You have not reported anything from this device."

### 3.5 `ControlBoardPage` — `/app/control/board` | `/programme` | `/map`
- Purpose: the SC's single screen for the control day: what is on my section, what is granted, what is still to clear, which train is held next.
- Engine inputs: `select.workingBlocks` for `corridor.clock.day` (snapshot blocks merged with `approvals` statuses/overrides); `snapshot.result.weekly.occupancy[day]` (passages, free windows, hourly load); `livePosition.at(snapshot, day, minute)`; `block.affectedTrains`, `weightedDelayMin`, `premiumConflicts`; `select.tsrsInForce`; `select.cautionOrders`; `execution.records`; `intake.reports` count (`UNVERIFIED`).
- Layout: `PageHeader` (corridor `Select`, control day `SegmentedControl` D | D+1, `TimeScrubber` with play/"Now", `SegmentedControl` Chart | Programme | Map) → `StatTile` row: Blocks tonight · Granted · In progress · To clear · Trains regulated · Open incidents → **Chart view**: `StringChart` (Y stations by chainage, X 00:00–24:00; train strings by class colour; free headway windows as pale green bands; PROPOSED/CONCURRED blocks as orange-outlined hatched rectangles; GRANTED/LOCKED solid in department pastel with nested S&T stripes; STARTED with orange edge; TSR bands; now-cursor; layer toggles passenger / goods forecast / free windows / baseline) + right rail: "Tonight" list (`BlockRow`s in time order with `Badge` status and inline Grant/Refuse/Clear) and "Held & regulated" list (train, station, minutes, block). **Programme view**: `DataTable` grouped by block section (Time, Block section, Line, Kind, Departments, Work, Machine, In-charge, T/351, JPO, Speed after, Trains regulated, State), handover note `FormField` (`approvals.handoverNotes[date]`), `PrintButton`. **Map view**: `CorridorMap` (Leaflet; corridor polyline, stations, tonight's block segments in dept pastel, OHE sections toggle, depots, incident pins, train markers at scrubber minute; schematic fallback offline) + `TrainLookupPanel`.
- Actions:
  - **Open block** → `BlockDrawer` (role bar: control).
  - **Grant** (`grant`; enabled when status `CONCURRED`; if block has SMMS disconnection and T/351 not `RECEIVED` → `Modal` "T/351 not yet received for S&T work in this block. Grant anyway?") → `approvals.grant(blockKey)` → status `GRANTED`; advisories now derive for its trains; T/409B drafts derive; `notify.push` to depts in block + field ("Block {section} {window} granted"); audit; toast "Granted {section} {window}".
  - **Grant with change** → `Modal` with ±15/±30/±60 min shift and shorten-to inputs; `delayModel.evaluateWindow` recomputes affected trains inline (rule checks: `maxBlockMin`, `maxBlocksPerDay`, `maxConcurrentBlocks`, headway margin) → Confirm → `approvals.override(blockKey,{start,end})` + `approvals.grant`; toast "Granted with change".
  - **Refuse** → reason `Select` (traffic, failure, gang not ready, T/351 not received, machine not arrived, other) → `approvals.refuse(blockKey, reason)` → status `REFUSED`, `refusal.count++`; block hidden from board; tasks appear in WeeklyPlanPage tray "Refused by Control: {reason}"; notify planning + depts; toast "Refused".
  - **Clear** (`execute`; enabled when STARTED/DONE) → `Modal` "Line fit for traffic: full speed | TSR __ km/h from km __ to km __ until __" → `execution.record(blockKey,'CLEARED',{speedKmph, source:'control'})`; if TSR → `approvals.tsrs.push` (in force) → T/409 regenerates; adherence recomputes; toast "Line clear recorded".
  - **Lock D+1** (`lock`) → `approvals.lock(all GRANTED on D+1)` → status `LOCKED`; `plan.request.fixedBlocks` updated; BDMS payload staged in HandoffPage; toast "{n} blocks locked for {date}".
  - **Scrub time** → `corridor.clock` only. **Re-plan tonight** → `/app/control/replan`. **Issue caution order** → `/app/control/caution?block=`. **Search train** (map) → `trainLookup`; **Open incident** (map pin) → `/app/control/incidents/:id`. **Print** (programme) → print stylesheet.
- Labels: `SimLabel kind="simClock"` beside the scrubber; `kind="wttPositions"` on train markers/strings; `kind="seededFeed"` (COA, FOIS) in the legend; programme print watermark `kind="notOfficial"`.
- Empty: no blocks tonight → `EmptyState` "No blocks planned for {date}. Next: {next block}." Map tiles offline → schematic line + chip "Map tiles unavailable — schematic view".

### 3.6 `ReplanPage` — `/app/control/replan`
- Purpose: real-time re-optimisation after a failure with started blocks fixed; the SC sees a diff and applies or discards.
- Engine inputs: `plan.runCandidate({scenario: merge(working, event), fixedBlocks: STARTED ∪ LOCKED}, 'disruption')`; diff between `plan.candidate.snapshot` and working (`select.planDiff` matches blocks by task set: kept / shifted / dropped / added); KPI before/after (`HorizonResult.kpis`); `block.affectedTrains`.
- Layout: `PageHeader` → left `Card` "Event": `Select` type (OHE trip between A–B → `speedCapKmph`/`injectTasks` OHE; rail fracture at km → `injectTasks` track; signal failure at station → `injectTasks` SMMS; machine breakdown → `removeMachines`; late/added premium train → `addPremiumTrain`; train cancelled → `cancelTrains`; freight surge → `freightSurge`) with fields, time, line; "From incident" prefill via `?incident=`; "Fixed" list of STARTED/LOCKED blocks → centre `DiffTable` (Block, Planned window, Proposed: Keep / Shift to hh:mm / Cancel tonight / New, Trains affected Δ, Mandatory still met) → right `StatTile` mini before/after (closure hours tonight, train-minutes, mandatory compliance %) → `ProgressBar` during run → action bar.
- Actions: **Run re-plan** → `plan.runCandidate` (replan, candidate only; working plan untouched); **Apply** (`grant`) → `plan.promoteCandidate()` (working request absorbs the scenario event), `approvals` statuses re-keyed by task set (shifted GRANTED blocks keep GRANTED with new window logged), `notify.push` to affected depts and field ("Re-plan applied by Control at hh:mm: {n} blocks moved"), audit; toast "Re-plan applied"; navigate `/app/control/board`. **Discard** → `plan.discardCandidate()`. **Escalate to DRM** → `approvals.escalate({kind:'disruption', ref, note})` → appears on EscalationsPage; toast "Escalated".
- Labels: "Failure events are injected for the demo; in service they come from COA/TPC"; `kind="solver"`.
- Empty: before a run → `EmptyState` "Describe the event and run the re-plan." Candidate identical → "No change needed — the plan already fits."

### 3.7 `IncidentsPage` — control / dept / division modes
- Purpose: geo-routed reports (loco pilot, keyman, citizen) with km, nearest train and routed department; control decides caution/hold-list/verify; department verifies, converts, resolves; division reads and reassigns.
- Engine inputs: `intake.reports` (filtered: control = all; dept = `report.dept === dept`; division = all); `normalizer.snapToCorridor`; `livePosition.nextTrain(snapshot, day, minute, km, line)`; photos from IndexedDB; `snapshot.corridor` for `MiniMap`.
- Layout: `PageHeader` with status `Tabs` New (`UNVERIFIED`) | Verifying (`TRIAGED`) | Converted (`TASK`) | Closed (`RESOLVED`,`REJECTED`) → left `DataTable` (Ref, Source (LP of {train} / Keyman / Citizen), Category, km/chainage + nearest station + line, Age, `DeptChip` routed, Next train in {min}) → right `IncidentDrawer` (photo, reporter text with language tag — no machine translation, `MiniMap` pin + next train marker, routing explanation "Category: track → Civil; nearest asset: km 234/5 UP", `Timeline`, action bar by mode).
- Actions (all → `report.history` entry + audit + `notify.push` to reporter's portal):
  - control: **Verify via keyman/SSE** → `intake.triage(id,{action:'verify', dept})` → `TRIAGED`; notifies dept + field. **Impose caution** → opens TSR `Modal` prefilled (km range, line, 30 km/h, reason) → `approvals.tsrs.push` in force → T/409 regenerates → advisories update; toast "TSR {km}–{km} at {v} km/h in force". **Re-route** → `intake.triage(id,{action:'reroute', dept})`. **Close** → outcome (confirmed & attended / not found / duplicate) → `RESOLVED` or `REJECTED`. **Re-plan tonight** → `/app/control/replan?incident=`.
  - dept: **Assign to field staff** → `TRIAGED` with assignee; notify field. **Convert to task** (`triage`) → `intake.convertToTask(id)` → creates `InjectSpec` from category/km/line (status `TASK`), `plan.request.injects.push`, **replan** ('incident'); toast "Task created and sent to the optimiser"; the task shows in RiskPage with `injected` badge. **Resolve** → note (+photo) → `RESOLVED`. **Not ours — return to control** → dept cleared, status back to `UNVERIFIED` with note.
  - division: **Reassign** only.
- Labels: "Routing is rule-based on category and nearest corridor asset"; `kind="wttPositions"` on next-train minutes; seeded historical incidents carry `kind="seededRecords"`.
- Empty: "No open reports for {dept}."

### 3.8 `FormsPage` — control / tms / smms / tdms
- Purpose: the forms the plan implies. Control: TSR register, T/409 per station, T/409B, T/351 register — issue and print. TMS: propose TSR after work, request relaxation, preview T/409. SMMS: issue T/351, mark reconnected. TDMS: isolation sheet, de-energised/energised record.
- Engine inputs: `select.cautionOrders` = `cautionOrder.js` over working blocks + `approvals.tsrs`, merged with `approvals.forms[formId].status`; `snapshot.tsrLossPerDay`; `block.powerIsolation`, `block.oheSections`; `approvals.powerBlocks`.
- Layout: `PageHeader` → `Tabs` (control: TSRs in force | Caution orders T/409 | T/409B | T/351 register; tms: TSRs on my section | Propose TSR | T/409 preview; smms: T/351 register; tdms: Power blocks) → left `DataTable` per tab (TSR: section, line, km–km, speed, since, until, reason, train-minutes/day, relaxation requested; T/409: station picker → orders; T/351: block, station, asset ids, planned time, issued, received, reconnected; Power: block, elementary sections, isolators, TPC, window, de-energised, energised, tower wagon) → right `FormSheet` printable preview with `PrintButton`.
- Actions: control **Add TSR** / **Withdraw TSR** (requires a TMS relaxation request or Clear record; else disabled with hint) → `approvals.tsrs`; **Issue** (`issueCaution`) → `approvals.forms[id] = ISSUED` → visible in FieldTodayPage (LP) → notify field; toast "Issued {form} {serial}". **Withdraw** → `WITHDRAWN` with reason. **Mark T/351 received** → `RECEIVED` (clears the grant warning). tms **Propose TSR** → `approvals.tsrs.push({status:'PROPOSED'})` → control tab shows it; **Request relaxation** → flag on TSR; notify control. smms **Issue T/351** → `ISSUED`; notify control; **Mark reconnected** → `RECONNECTED`. tdms **Mark de-energised / energised** → `approvals.powerBlocks[blockKey]`; shows in BlockDrawer. **Print** → print stylesheet for the selected form only. **Attach to block** → opens BlockDrawer.
- Labels: every print carries `kind="notOfficial"` watermark "Generated by SAMANVAY — not an official document until signed"; "Form nomenclature follows the engine (T/409, T/409B, T/351)"; TDMS: "TPC interaction recorded in-app; no SCADA link".
- Empty: "No {form} drafts — drafts appear when a block with {condition} is granted."

### 3.9 `ExecutionLogPage` — `/app/control/log`, `/app/planning/adherence`
- Purpose: who was granted what and when, started, done, cleared at what speed, overrun; recalibrate durations (planning).
- Engine inputs: `snapshot.feeds.executionLog` (seeded history) + `execution.records`; `execution.js` adherence (on-time start %, mean overrun, bursts, cleared-with-TSR); `snapshot.factors` (productivity factor, samples, overrun rate per work type); `productivity.js`.
- Layout: `PageHeader` filters (date range, corridor, department, state, source) → `StatTile` row (on-time start %, mean overrun min, blocks burst, cleared with TSR) → `DataTable` (Block, Planned start–end, Granted, Started, Done, Cleared, Speed after, Overrun, In-charge, Source board/field) with red overrun `Badge` → planning only: `Card` "Productivity" (work type × machine: planned min, observed min, n, factor, last calibrated) with `BarChart` planned vs actual.
- Actions: **Record start/done/clear** (control, `execute`, on behalf of gang) → `execution.record(...,{source:'control'})`. **Recalibrate durations** (planning, `plan`) → `plan.request.extraExecution = execution.records` → **replan** ('recalibrate'); toast "Durations recalibrated from {n} records"; note appears in OptimiserPage. **Export CSV** → download filtered rows. **Open block** → BlockDrawer.
- Labels: `kind="seededRecords"` "Records before today are seeded history; records made on this device are real app state".
- Empty: "No execution records match the filter."

### 3.10 `HandoffPage` — `/app/planning/handoff`, `/app/control/handoff`
- Purpose: concurrence → grant → lock per block with audit trail, BDMS CSV/JSON payload, advisory text.
- Engine inputs: `select.workingBlocks` × `approvals.blocks` (status, concurrence map, objections, audit); `exporter.js` (`bdmsCsv`, `bdmsJson`); `select.advisories`; `select.events`.
- Layout: `PageHeader` filters (week, corridor, department, state) → `HandoffMatrix` `DataTable` (Block, Window, Departments, Civil / S&T / TRD concurrence pills (pending / concurred / objection), Controller state, Last action by/at) → `Drawer` on row: `AuditTrail`, objections with reasons, concurrence checklist, `Tabs` Export (CSV/JSON preview) | Advisories (per-train text as the citizen sees it) | Events.
- Actions: planning **Request concurrence** → `approvals.propose(blockKey)` → status `PROPOSED`; `notify.push` to each dept in block ("Concurrence requested: {section} {window}"); toast "Concurrence requested from {depts}". **Record concurrence on behalf** (note required: phone/paper) → `approvals.concur(blockKey, dept, user, note)`; when all depts concurred → `CONCURRED`. **Export BDMS CSV / JSON** → `exporter` download; audit "Exported {n} blocks". **Copy payload** → clipboard; toast "Copied". control **Grant / Refuse / Lock** → same effects as §3.5. **Re-run after objection** → `/app/planning/weekly`.
- Labels: "BDMS payload matches the demand format; nothing is transmitted to CRIS"; "Grant is recorded by Control".
- Empty: "No blocks sent to hand-off yet — send the week from Weekly plan."

### 3.11 `RequisitionsPage` — cell / dept modes
- Purpose: BDMS-style requisitions in the fields departments already fill by hand; the cell validates, normalises, returns or accepts.
- Engine inputs: `intake.validate(form)` (field-level messages: "Duration 07:00 exceeds ceiling 06:00 (rules.maxBlockMin)", "Km 233/2–236/8 crosses block section boundary", "Elementary section E-14 not on this block section"); `normalizer` mapping preview; `snapshot.pairs` (nearby jobs for "Merge with nearby job" hint); `select.placement(taskId)` (block, window, partners, machine, crew).
- Layout: list: `PageHeader` + status `Tabs` Draft | Submitted | Returned | Accepted | Scheduled | Granted | Executed | Withdrawn → `DataTable` (No., Dept, Block section, Line, Work, Duration, Preferred window, Machine, Block type, State, Issues). `/new` (dept) or `/:id`: `RequisitionForm` — Civil: division, section, block section, line, km from–to, work (deep screening / through packing / rail renewal / sleeper renewal / turnout renewal / ballasting / welding / USFD / curve realignment / bridge), machine (CSM / BCM / UNIMAT / DTS / T-28 / BRM / PQRS / TRT / none), block type (Traffic / Power / S&T disconnection / Integrated), duration hh:mm, preferred date & window, speed after block (km/h, days), gang, in-charge, remarks; S&T adds asset ids, disconnection type, non-interlocked working flag; TRD adds elementary sections, isolators, tower wagon. Cell drawer adds validation panel, mapping preview, "Nearby jobs" list, remarks box. Placement `Card`: "Placed Thu 01:10–04:10 with S&T point 21A overhaul; CSM-3; Gang 7".
- Actions: dept **Submit** → `intake.submitRequisition` → validate; errors inline; pass → `SUBMITTED`; notify planning; toast "Requisition {no} submitted". **Edit & resubmit** (Returned). **Withdraw** → `WITHDRAWN`; if already accepted → `plan.request.excludedTaskIds.push` + **replan**. **Duplicate** → new draft. **Print requisition** → `FormSheet`. cell (`plan`) **Accept** → `intake.acceptRequisition(id)` → creates `InjectSpec{sourceId, dept, workType, line, startKm, endKm, …}` in `plan.request.injects` → status `ACCEPTED` → **replan** ('requisition'); toast "Accepted — task {id} is in the next plan"; task appears in RiskPage. **Return with remarks** → `RETURNED`; notify dept. **Merge with nearby job** → sets `groupId` on the inject (scheduler prefers co-location). **Create on behalf** → opens the dept form.
- Labels: "Requisition format mirrors BDMS fields; it is not submitted to CRIS"; seeded requisitions `kind="seededRecords"`.
- Empty: dept "No requisitions yet — raise one from the Register or here."; cell "Inbox empty."

### 3.12 `WeeklyPlanPage` — edit / review / dept modes
- Purpose: the 7-day plan: what the optimiser proposes, what is unscheduled and why, joint blocks, the send-to-Control step; departments concur/object and accept joint-block suggestions; control reviews.
- Engine inputs: `snapshot.result.weekly.ai` (blocks, unscheduled with reasons, stats, kpis) vs `.baseline.kpis`; `snapshot.result.weekly.occupancy` (free windows shading; day string chart); `block.affectedTrains/weightedDelayMin/premiumConflicts/coLocated/machines/crews/powerIsolation`; `snapshot.tasks[].risk`; `approvals.blocks`; `select.jointSuggestions(dept)` (unscheduled or single-dept tasks of `dept` whose section and window fit an existing block of another dept within rules: "Your task X can ride in block Y (S&T, 02:10–04:10, same section), saves N possession-hours"); `delayModel.evaluateWindow` for shifts; `plan.runStamp`.
- Layout: `PageHeader` (week, corridor, `SegmentedControl` Gantt | Day chart, plan state, `SeedStamp`) → KPI strip `StatTile`×5 (availability %, closure hours, co-location %, mandatory compliance %, train-minutes lost) each with Δ vs baseline and method popover → `Gantt` (rows block section × line, 7 × 24 h, night windows shaded from occupancy, bars in dept pastel with nested S&T stripes, joint glyph, lock glyph, status outline) or `StringChart` for the selected day with free windows and "Try a block here" drag-select popover (impact only, no state) → bottom tray `DataTable` "Unscheduled" (task, reason: no window / machine busy / crew out of reach / block ceiling / blocks per day / refused by Control: {reason}) → dept mode adds `Card` "Joint block suggestions" and "Awaiting my concurrence" → `BlockDrawer` (member tasks with ARCI bars and band, partners with in-charge, machine and crew with travel/reach check, rule checks pass/fail, trains regulated with minutes, premium trains protected, T/351 / power block status, speed after block, `AuditTrail`, role action bar).
- Actions: edit (`plan`) **Run optimiser** → **replan** ('weekly'); Gantt diff highlight 5 s. **Shift block** ±15/±30/±60 → `delayModel.evaluateWindow` + rule checks inline → accept → `approvals.override` (+ `fixedBlocks`); reject → toast "Cannot shift: {rule}". **Remove task from block** → `plan.request.excludedTaskIds` (temporary, this week) → **replan**. **Pin task** → `plan.request.pinnedTaskIds` → replan. **Lock block** → `approvals.lock` (planning may lock DRAFT blocks as fixed input; controller lock is the workflow lock). **Send week to Control** → `approvals.propose(all DRAFT this week)` → `PROPOSED`; notify control + depts; navigate `/app/planning/handoff`; toast "{n} blocks sent to Control; concurrence requested". **Export CSV/JSON** → `exporter`. **Print** → week table. dept (`concur:<DEPT>`) **Concur** → `approvals.concur`; toast "Concurred". **Object** → reason (gang unavailable / machine / notice too short / partner not ready) → `approvals.object` → status back to `PROPOSED` with objection; notify planning. **Accept join** → adds `groupId` linking task to block's tasks → **replan** ('join'); toast "Task added to the joint block — co-location updated". **Decline** → suggestion dismissed (local, with reason). **Assign gang / machine** (`execute`) → `approvals.blocks[key].resources` override with reach check; audit. **Set in-charge** → name shown on field card and programme. **Print work order** → `FormSheet`. review (control) read-only + open block + navigate to board.
- Labels: KPI popover "vs simulated decentralised FIFO baseline, same seed {n}"; `kind="solver"` in run stamp; `kind="seededFeed"` (machines, crews) in drawer.
- Empty: unscheduled tray empty → "Everything placed."; no suggestions → "No joint block fits your open tasks this week." Loading: Gantt skeleton rows.

### 3.13 `HorizonsPage` — plan / approve modes
- Purpose: 30-day plan with capital works and the 26-week Rolling Block Programme with 10-week JPO notice check and Weibull workload; DRM approves.
- Engine inputs: `snapshot.result.monthly` (calendar days, capital works, blocks, kpis vs baseline); `snapshot.result.rolling` (26 `RollingWeek`s, entries with `noticeWeeksGiven`, `targetWeek`, demand by dept, workload forecast per asset class); `approvals.rbp`, `approvals.jpoNotices`.
- Layout: `Tabs` Monthly | 26-week → Monthly: calendar heat grid section × day (possession hours), capital works `DataTable` (work, machine days, window) → 26-week: `DataTable` weeks × sections (planned hours; JPO notice: served / due by / late `Badge`), `BarChart` workload forecast per week by asset class, dept filter; approve mode adds summary `Card`s (closure hours, capital works, machine days, JPO late count, KPIs vs baseline) and remarks box.
- Actions: **Open week** → `/app/planning/weekly?week=N`. **Mark JPO notice served** → `approvals.jpoNotices[taskId]`; late flag clears; audit. **Flag JPO notice late** → notify owning dept; escalation entry. **Submit to DRM** (`plan`) → `approvals.rbp.{monthly|rolling} = SUBMITTED`; notify division; toast "Submitted for approval". approve mode (`authorise`) **Approve** → `APPROVED` with DRM stamp/date; notify planning + depts; **Return with remarks** → `RETURNED`; remarks shown in plan mode. **Export CSV** → 26-week table. **Print**.
- Labels: "Workload forecast from Weibull fit on seeded failure history" (`kind="model"`); "Capital works are seeded from the registers".
- Empty: approve mode with nothing submitted → "Nothing awaiting approval."

### 3.14 `IntegrationPage` — `/app/planning/integration`, `/app/division/feeds`
- Purpose: PS point 1 — show the feeds, their schema, what failed to normalise, and the corridor graph they land on.
- Engine inputs: `snapshot.feeds` (timetable, freight, tms, smms, tdms, machines, crews, executionLog, failureHistoryCounts, escalationHistoryCount), `snapshot.counts`, `snapshot.issues` (`DataIssue`), `intake.issueStatus`, `snapshot.corridor` (stations, blockSections, oheSections, corridorBlocks), `snapshot.tasks[].startKm/endKm/dept`.
- Layout: `Tabs` Feeds | Data quality | Corridor graph → Feeds: `FeedCard` grid (system, native schema note, record count, seed, health pill, mapped/rejected coverage bar) → Data quality: `DataTable` (Feed, Record, Field, Issue, Suggested fix, Assigned to, State) → Corridor graph: `CorridorRuler` (chainage ruler with stations; lanes: block sections, OHE elementary sections, COA corridor blocks, TMS/SMMS/TDMS records as pastel ticks, planned blocks) + right list "Unresolved references"; "Check an asset id" input.
- Actions: **Reseed feed** (planning) → `plan.replan('reseed')` with same seed; toast "Feeds regenerated (seed {n})". **Assign issue to department** → `intake.issueStatus[id] = ASSIGNED`; notify dept. **Resolve issue** → `RESOLVED`. **Open record on ruler** → switches to Corridor graph tab with record highlighted. **Open asset** → `/app/:dept/register?asset=`. **Download graph JSON** / **Export issues CSV**. Division: read-only.
- Labels: every `FeedCard` carries `kind="seededFeed"` "Seeded native-schema data — no live link to {SYSTEM}"; Reseed button reads "Reseed", never "Sync".
- Empty: no issues → "All records normalised."

### 3.15 `MethodPage` — `/app/:portal/method`
- Purpose: the honesty page: how each number is computed (live), what is simulated, model metrics, deck targets as target/literature, glossary, tours.
- Engine inputs: `HorizonResult.kpis` plan vs baseline; `snapshot.models.weibull` (β, η, n, censored), `snapshot.models.escalationMetrics` (test AUC/precision/recall, nTrain/nTest); `snapshot.result.rules/weights`; `snapshot.factors`; `settings.roiAssumptions`; `plan.runStamp`.
- Layout: reading order `Card`s: Problem (PS 26027, one paragraph) → Data in (feed list with seeded tags) → Normaliser (graph counts) → ARCI (terms, live top item) → Optimiser (rules and weights in force; live KPIs vs baseline) → Controller validation (link to board) → Forms generated → "What is simulated" `DataTable` (item, what is simulated, label) → Model metrics cards → `DataTable` "Computed this seed vs target / literature" (metric, computed, target, `SourceLabel`) → Limitations (client-side, seeded feeds, SA not CP-SAT, browser-local auth) → Glossary EN/HI (`KeyValue`) → Tours (one `TourButton` per portal the user can open) → Keyboard shortcuts.
- Actions: **Start tour: {portal}** → `tour.reset(portal)` + navigate landing. **Open page** links. **Copy citation** → clipboard. **Open assumptions** → `/app/division/roi` (division) or read-only list.
- Labels: deck figures appear only here, each with `SourceLabel` "Target / literature (SIH 2026 deck)".
- Empty: none.

### 3.16 `PlanningOverviewPage` — `/app/planning/overview`
- Purpose: one screen with the engine's own numbers against the simulated baseline plus queues.
- Engine inputs: weekly `ai.kpis` vs `baseline.kpis` (`KpiDelta`), `occupancy[].hourly` (free headway per hour), `snapshot.issues.length`, `intake.requisitions` (SUBMITTED), `intake.reports` (UNVERIFIED), `snapshot.result.rolling` JPO late count, `approvals` state counts, `select.events`.
- Layout: `PageHeader` (corridor, week, `SeedStamp`) → `StatTile`×6 (availability %, closure hours, co-location %, mandatory compliance %, train-minutes lost, TSR-days) value / baseline / Δ with method popover → row: `RingGauge` triple (baseline / plan / theoretical ceiling) + `Sparkline`/`BarChart` "Free headway per hour" with minimum-valley badge → `FeedHealthStrip` → `Card`s: Pending requisitions (n), Unmapped records (n), New reports (n), JPO notices late (n), Plan state (Draft / Proposed / Concurred / Granted / Locked counts) → `DataTable` "Top 10 by ARCI" → recent events.
- Actions: **Open tile** → deep link (weekly / adherence / caution / risk). **Run weekly optimiser** → **replan**. **Open queue** → demands / integration / incidents / monthly.
- Labels: every tile footnote "vs simulated decentralised FIFO baseline · seed {n} · run {id}".
- Empty: none (skeleton while loading).

### 3.17 `RiskPage` — `/app/planning/risk`
- Purpose: PS point 2 — the ARCI number a judge can interrogate term by term.
- Engine inputs: `snapshot.tasks[].risk` (score, band `Urgency`, `explanation` terms: Weibull hazard, traffic density, overdue days, TSR impact, escalation probability, mandatory floor), `mandatoryWithinDays`, `daysOverdue`, `snapshot.models.weibull` per asset class (hazard curve), `snapshot.models.escalationMetrics`, `plan.request.pinnedTaskIds`, `select.placement`.
- Layout: `PageHeader` filters (corridor, dept, band IMMEDIATE / HIGH / TACTICAL / STRATEGIC, mandatory, injected) → `DataTable` tabular numerals (Rank, Task, Dept, Asset, Section/km, ARCI, Band, Mandatory floor, Escalation p, Due/overdue, In plan?) → row expand `ArciBar` term-by-term with one-sentence plain explanation per term → right `Card` "Models": Weibull card per asset class (β, η, n, censored, hazard `Sparkline`), logistic card (AUC, precision, recall, held-out n).
- Actions: **Explain** → expand. **Pin to next run** → `plan.request.pinnedTaskIds` → toast "Pinned — will be placed in the next run" (no replan until Run). **Override band** → reason required → `approvals.bandOverrides[taskId]`; audit; scheduler respects via `pinnedTaskIds` when raised to mandatory. **Show in plan** → `/app/planning/weekly?task=`. **Open in graph** → `/app/planning/integration#graph?task=`. **Change weights** → `/app/planning/optimiser`.
- Labels: `kind="model"` "Models fitted on seeded failure and escalation history; metrics on a held-out split".
- Empty: filter yields nothing → "No tasks in this band."

### 3.18 `OptimiserPage` — studio / scenarios tabs
- Purpose: PS point 3 — tune, run, compare; curated scenarios.
- Engine inputs: `plan.request.weights` (`delay, downtime, risk, colocation, tsr, spread`), `plan.request.rules` (`minBlockMin, maxBlockMin, headwayMarginMin, slwDelayMin, slwCapacityPerHour, premiumConflictHard, maxBlocksPerDay, maxConcurrentBlocks, annealT0, nightWindow, noticeWeeksForRegulation`), `iterations`, `seed`; `plan.runCandidate`; `scenarios.js` presets (5) with computed narrative; `select.planDiff`; `HorizonResult.kpis`.
- Layout: Studio: left `Card` Weights (six `Slider`s) + `Card` Rules (`FormField`s) + `Card` Iterations/seed + `Card` What-if (five injectors as small forms: inject defect, machine breakdown, cancel train, add premium train, freight surge) → centre `Button` Run + `ProgressBar` + objective/KPI `BarChart` → right `CompareTable` (Candidate / Working / Baseline × 6 KPIs) + changed blocks list + mini Gantt diff → footer note on CP-SAT. Scenarios: 5 `ScenarioCard`s (name, premise, injectors, computed narrative, last KPI Δ) + user-saved scenarios; `CompareTable` on select.
- Actions: **Run** → `plan.runCandidate({weights, rules, iterations, scenario: injectors}, 'studio')` (candidate only). **Set as working plan** → `plan.promoteCandidate()`; weekly/monthly refresh; notify depts whose blocks changed ("Working plan updated: {n} of your blocks changed"); toast "Working plan updated"; audit with settings. **Discard** → `plan.discardCandidate()`. **Reset defaults** → `DEFAULT_WEIGHTS`, `RULES`. **Save as scenario** → `settings.userScenarios`. **Run scenario** → candidate with preset. **Apply scenario** → `plan.applyScenario(id)` → **replan**; banner "Scenario {name} active" with **Revert** (`applyScenario(null)`). **Send to Disruption desk** → `/app/control/replan?scenario=`.
- Labels: `kind="solver"` "In-browser solver: greedy + simulated annealing; CP-SAT reference formulation documented, not executed"; "Injected events are demo inputs"; "Narratives are template text filled from engine outputs".
- Empty: no candidate → "Run to compare."

### 3.19 `DeptTodayPage` — `/app/:dept/today` (tabs today / resources)
- Purpose: SSE's first screen in the department's own vocabulary.
- Engine inputs: `snapshot.tasks` filtered dept (bands, overdue, mandatory), `select.workingBlocks` this week where `departments` includes dept (+ partner in-charge names from `approvals.blocks[].incharge`), `approvals.blocks` awaiting `concur:<DEPT>`, `intake.requisitions` (dept, RETURNED/SUBMITTED), dept-specific: TMS `approvals.tsrs` on section; SMMS T/351 pending; TDMS `approvals.powerBlocks` pending; `intake.reports` (dept, UNVERIFIED/TRIAGED); `snapshot.feeds.machines/crews` filtered dept + allocations; `notifications` for portal.
- Layout: `PageHeader` (dept, section, date) → `StatTile` row: Overdue · Mandatory items · Requisitions awaiting me · Blocks this week · dept card (TSRs on my section / T/351 pending / Power blocks pending) · Incidents routed → `Card` "Tonight" list (block, window, my job, partners with in-charge, `Badge` state, T/351 or power status, inline Concur) → `Card` Notifications. Resources tab: `Card`s per machine / tower wagon (type, depot, reach km, 7-day utilisation `BarChart`), gang roster `DataTable`, allocation strip.
- Actions: **Concur** → `approvals.concur`; toast "Concurred". **Acknowledge incident** → `intake.triage(id,{action:'verify'})`. **Open** → register / requisitions / blocks. **Mark machine unavailable** → `plan.request.scenario.removeMachines.push(id)` → **replan** ('machine'); notify planning; affected blocks flagged; toast "{machine} marked unavailable — plan re-run". **Mark available** → remove + replan.
- Labels: `kind="seededFeed"` on register/roster cards.
- Empty: "No blocks for {dept} tonight. Next: {next}."

### 3.20 `DeptRegisterPage` — `/app/:dept/register`
- Purpose: the department's own register in its own columns with ARCI band; one click to a requisition.
- Engine inputs: `snapshot.feeds[tms|smms|tdms]` native records; `snapshot.tasks` mapped by `sourceId` (section, km, line, risk); `snapshot.issues` for this dept; `select.placement`.
- Layout: `PageHeader` search + filters (overdue, TSR, band, unmapped) → `DataTable` — TMS: Km from–to, Line, Asset, Attention (USFD flag class / tamping due / deep screening due / GMT), Due, Overdue days, Band, Hazard; SMMS: Asset id, Type, Station, Failures 12 m, Overhaul due, Band; TDMS: Elementary section, Structure, Asset (wear %, dropper, insulator, cantilever, isolator, ATD), Due, Band — plus normalised columns (section, chainage) and data-quality flag → `TaskDrawer` (ARCI explanation sentences, last inspection, history, planned block, `MiniMap`).
- Actions: **Raise requisition** → `/app/:dept/requisitions/new?asset=` prefilled. **Update inspection** → local record on task (`intake.inspections[taskId]`); band recomputed on next run; toast "Inspection recorded". **Mark attended** (enabled after CLEARED) → `plan.request.excludedTaskIds.push` (closes defect) → **replan**; audit.
- Labels: `kind="seededFeed"` "Register seeded in native {SYSTEM} schema, seed {n}".
- Empty: filter empty → "No records match."

### 3.21 `DivisionBriefPage` — `/app/division/brief`
- Purpose: what the DRM asks on Monday: outcomes vs how we used to plan, safety backlog, adherence, what is stuck.
- Engine inputs: weekly/monthly `kpis` and `KpiDelta` per corridor (cached snapshots per corridor, `plan.byCorridor`), `snapshot.tasks` mandatory overdue by dept, `execution` adherence 7-day, `intake.reports` open > 24 h, `approvals.rbp`, `select.escalations` top 5, `rolling` workload `Sparkline`.
- Layout: `StatTile` row (availability %, closure hours, co-location %, mandatory compliance %, train-minutes, ₹ delta) plan / baseline / Δ with footnote → `RingGauge` → `DataTable` by corridor → department scorecards (`Card`×3: overdue, mandatory compliance, blocks executed/planned, adherence) → top escalations → adherence → open incidents > 24 h → approvals pending → footer toggle "Show reference targets (SIH 2026 deck — target / literature)" adds a grey column with `SourceLabel`.
- Actions: **Direct department** → note `Modal` → `approvals.directions.push` + `notify.push` to dept ("Direction from DRM: …"); toast "Direction sent". **Open RBP** → `/app/division/plans`. **Open ROI** → `/app/division/roi`. **Open escalation** → `/app/division/escalations?item=`. **Print brief**.
- Labels: "Baseline: simulated decentralised FIFO practice"; ₹ tiles `kind="assumption"`; deck column `SourceLabel`.
- Empty: none.

### 3.22 `EscalationsPage` — `/app/division/escalations`
- Purpose: what needs an officer.
- Engine inputs: `select.escalations` = mandatory past floor (`snapshot.tasks`), blocks refused ≥ 2 (`approvals.blocks[].refusal.count`), requisitions stale > 14 d, reports open > 48 h, logistic escalation probability top-N (`snapshot.models.escalation` applied to tasks), manual `approvals.escalations`.
- Layout: `Tabs` by type → `DataTable` (Item, Dept, Age, Reason, Predicted escalation %, Planned block, State) → `Drawer` history.
- Actions: **Direct department** → as §3.21. **Pin to next run** → `plan.request.pinnedTaskIds`; notify planning; toast "Pinned". **Mark reviewed** → `approvals.escalationReviews[id]` with initials; audit. **Open item** → underlying page.
- Labels: `kind="model"` "Escalation probability from a model fitted on seeded history".
- Empty: "Nothing needs escalation."

### 3.23 `RoiPage` — `/app/division/roi`
- Purpose: ₹ impact from labelled, editable assumptions; deck figures in their own column.
- Engine inputs: `roi.js` lines from `KpiDelta` and `settings.roiAssumptions` (₹ per train-minute, ₹ per closure hour, machine day, gang day, TSR ₹/day, planning man-hours/week); `snapshot.result.weekly` kpis.
- Layout: `AssumptionEditor` `DataTable` (key, value `FormField`, `SourceLabel`) → line items `DataTable` (Item, Plan, Baseline, Δ, ₹ Δ, Assumption used) → total `StatTile` → sensitivity `Slider` ±20 % → grey column "Deck target / literature".
- Actions: **Edit assumption** (`admin` or `authorise`; read-only otherwise) → `settings.roiAssumptions[key]`; recompute; audit old/new. **Reset** → defaults. **Export CSV**. **Print**.
- Labels: "₹ figures come from editable assumptions, not accounts data"; `SourceLabel` on the deck column.
- Empty: none.

### 3.24 `AdminPage` — `/app/division/admin` (`admin`)
- Purpose: users and roles in this browser, seed, defaults, storage, tours.
- Engine inputs: `users.listRegistered`, `DEMO_ACCOUNTS`, `plan.request.seed`, IndexedDB photo usage.
- Layout: `Tabs` Users | Data | Defaults | Storage → Users: `DataTable` (name, email, role, portal, dept, created) + add/edit `Modal` (pending field requests shown as "Awaiting approval" if invite code path used) → Data: seed `FormField`, "Reseed", "Reset demo data" → Defaults: language, theme per portal, audio cues, ROI assumptions link → Storage: photos MB, "Clear photos", "Export state JSON", "Import state" → Tours: "Reset all tours".
- Actions: **Add / edit / remove user** → `users.ts`. **Change seed / Reseed** → `plan.setSeed` → **replan**; `Modal` confirm because workflow slices keyed to blocks are cleared. **Reset demo data** → clears `approvals, execution, intake, notifications, tour` + replan. **Toggle audio cues** → `settings.audioCues`. **Export / Import state** → JSON of persisted slices. **Reset tours** → `tour.reset()`.
- Labels: `kind="localAuth"`.
- Empty: no registered users → "Only demo accounts exist on this device."

### 3.25 `FieldTodayPage` — `/app/field/today`
- Purpose: gang: the one card with Start / Done / Clear; loco pilot: today's run with caution orders and blocks on route.
- Engine inputs: `select.workingBlocks` day 0 (and next) filtered by `session.user` gang (`crews` match) and status ≥ `GRANTED`; `execution.records` for block; T/351 / power status from `approvals`; `select.cautionOrders` ISSUED for the section (gang) or for `trainNo` (LP: `trainLookup.itinerary` + `blocksMet` + expected regulation); `approvals.tsrs` in force.
- Layout: bottom tab shell, `sunlight` theme default → gang: `PossessionCard` tinted by lead dept (block section, line, granted window, work, JPO ref, partners with in-charge, machine, disconnection T/351 status, power block status, speed after block, caution badge) → `Timeline` Granted hh:mm → Start → Done → Clear → three 56-px full-width `Button`s enabled in sequence → checklist toggles (line blocked, protection placed, work done, line fit) → "Message control" → "Report issue" → `Card` "TSRs on my beat" → "Earlier this week" compact list. LP: train `FormField` (remembered) → run card (train, route) → `CautionCard`s in running order (km, speed, reason, since) with Acknowledge → "Blocks on your route tonight" with expected regulation → offline indicator chip.
- Actions: **Start** → `execution.record(key,'STARTED',{source:'field', geo?})`; board bar gets orange edge; notify control ("Gang started {section}"); toast "Start recorded {hh:mm}". **Done** → `'DONE'`; notify control "Work complete". **Clear** → sheet "Line fit: full speed | TSR __ km/h km __–__" (warning if S&T disconnection not `RECONNECTED`, still allowed with note) → `'CLEARED'` + TSR if any → notify control; toast "Line clear sent to Control". **Message control** → `execution.messages.push` + notify control. **Report issue** → `/app/field/report?block=`. **Acknowledge** (LP) → `execution.acks.push`; notify control. **Select train** → `settings.lastTrainNo`.
- Labels: "Records stored in this browser; multi-device sync needs a server"; LP view: "View of the generated caution order, not the signed T/409 handed over at the station"; `kind="seededFeed"` on roster.
- Empty: gang "No block for your gang today. Next: {day} {window} {section}." LP: "Enter your train number."

### 3.26 `FieldReportPage` — `/app/field/report`, `/app/field/reports` (+`/:ref`)
- Purpose: photo + location + category from the line or the cab; my reports and block history.
- Engine inputs: `normalizer.snapToCorridor`; `livePosition` (LP: prefill train and approximate km from time); `intake.reports` filtered `source in (field, locoPilot)` and by user; `execution.records` for my gang.
- Layout: `Tabs` New | My reports → New: `PhotoCapture` (compressed to 1280 px, IndexedDB) → `LocationPicker` (GPS + accuracy chip "snapped to km 234/5 UP", editable km/line, map tap) → category `ChipGroup` per dept (rail fracture / buckling / lurch / ballast wash / OHE sagging / broken dropper / bird flashover / signal lamp out / point not setting / LC gate / obstruction / fire / other) → severity → note → language → LP adds train number → Submit → result card (reference, routed dept). Mine: `ReportCard` list with status `Timeline`; "My blocks" list (date, section, planned vs actual, cleared speed).
- Actions: **Use current location** / **Pick on map** → fields. **Submit** → `intake.reportIncident({source: role==='LOCO_PILOT'?'locoPilot':'field', …})` → `UNVERIFIED`; notify control + dept; navigate `/app/field/reports/:ref`; toast "Report {ref} routed to {dept}".
- Labels: "Routing is rule-based on category and nearest asset"; "Stored in this browser only".
- Empty: "No reports from this device."

---

## 4. SHARED STATE

Single Zustand store `useAppStore` (extend the existing `src/store/useAppStore.ts`), `persist` middleware key `samanvay.v4`, `partialize` per slice as marked. Photos live in IndexedDB store `samanvay.photos` (idb-keyval), referenced by `photoId`.

### 4.1 Engine contract (worker) — required extensions
`PlanRequest` gains: `fixedBlocks?: {key, taskIds[], day, line, start, end}[]` (pre-placed, immutable, occupy capacity; scheduler skips them in annealing), `pinnedTaskIds?: string[]` (treated as mandatory floor), `excludedTaskIds?: string[]` (dropped before ranking). `InjectSpec` gains `sourceId?`, `dept?`, `label?`, `groupId?` (accepted requisitions and converted incidents become injected tasks with `injected: true`). `Scenario` merge order: preset → `injects` → `removeMachines` → `extraExecution`. Main-thread derivation modules (memoised selectors in `src/engine/select.ts`): `occupancy.freeWindows`, `delayModel.evaluateWindow(snapshot, window) → {affectedTrains, weightedDelayMin, premiumConflicts, ruleViolations[]}`, `cautionOrder`, `advisories`, `eventsFromPlan`, `exporter`, `trainLookup`, `livePosition.at`, `copilot.ask`, `roi.lines`, `intake.validate`, `execution.adherence`, `productivity.calibrate`, `normalizer.snapToCorridor`. Only `runPlanning` runs in the worker. Snapshots are immutable; block identity across runs is `blockKey = sha1(sorted taskIds)`.

### 4.2 Slices
| slice | shape (abridged) | persisted |
|---|---|---|
| `session` | `user: SessionUser \| null`, `lastPortal`, `remember` | yes (user only if remember) |
| `corridor` | `corridorId` (default first of `CORRIDORS`), `clock: {day 0–6, minute 0–1439, playing}` | `corridorId` only |
| `plan` | `request: PlanRequest & {injects, fixedBlocks, pinnedTaskIds, excludedTaskIds, extraExecution, scenarioId}`, `snapshot` (memory), `byCorridor: Record<id, Snapshot>` (memory), `status: idle/running/error`, `progress`, `runStamp: {runId, seed, iterations, ms, finishedAt}`, `candidate: {snapshot, request, reason} \| null`. Actions: `replan(reason)`, `runCandidate(patch, reason)`, `promoteCandidate()`, `discardCandidate()`, `setWeights/setRules/setIterations/setSeed`, `applyScenario(id\|null)`, `addInject`, `pinTask`, `excludeTask` | `request` only; snapshot rebuilt on boot |
| `approvals` | `blocks: Record<blockKey, {status: DRAFT/PROPOSED/CONCURRED/GRANTED/LOCKED/REFUSED/WITHDRAWN, taskIds, concurrence: Partial<Record<Dept,{by,ts,note}>>, objections[], override?: {start,end}, resources?, incharge?, grantedBy/At, lockedAt, refusal?: {reason,count}}>`, `forms: Record<formId,{status: DRAFT/ISSUED/RECEIVED/RECONNECTED/WITHDRAWN, by, ts, reason?}>`, `tsrs: {id, sectionIdx, line, fromKm, toKm, kmph, reason, status: PROPOSED/IN_FORCE/WITHDRAWN, relaxationRequested, since, until}[]`, `powerBlocks: Record<blockKey, PENDING/DEENERGISED/ENERGISED>`, `rbp: {monthly, rolling: {status: DRAFT/SUBMITTED/APPROVED/RETURNED, by, ts, remarks}}`, `jpoNotices`, `bandOverrides`, `handoverNotes`, `escalations[]`, `escalationReviews`, `directions[]`, `audit: {id, ts, user, action, ref, detail}[]`. Actions: `propose, concur, object, grant, refuse, override, lock, escalate, direct` | yes |
| `execution` | `records: {id, blockKey, kind: STARTED/DONE/CLEARED, ts, by, source: field/control, speedKmph?, note?, geo?}[]`, `acks[]`, `messages[]`. Actions: `record`, `ack`, `message` | yes |
| `intake` | `requisitions: {id, dept, form…, status: DRAFT/SUBMITTED/RETURNED/ACCEPTED/WITHDRAWN, validation, remarks, injectId?}[]`, `reports: {ref, source: citizen/field/locoPilot, trainNo?, photoId?, lat, lng, snapped: {km, line, sectionIdx, station}, category, severity, note, lang, dept, status: UNVERIFIED→TRIAGED→TASK (→RESOLVED/REJECTED), assignee?, taskId?, history[]}[]`, `issueStatus: Record<issueId,{status: OPEN/ASSIGNED/RESOLVED, dept?}>`, `inspections`, `myReportRefs[]`. Actions: `submitRequisition, returnRequisition, acceptRequisition, withdraw, reportIncident, triage, convertToTask, resolve, reject` | yes |
| `notifications` | `items: {id, ts, portals: PortalId[], dept?, kind, title, body, route, read}[]` (cap 200). Actions: `push, markRead, markAllRead(portal)`; audio cue only when `settings.audioCues && portal==='control'` | yes |
| `settings` | `theme: white/night/sunlight`, `language: Lang`, `audioCues`, `introPlayed`, `homeStation?`, `savedTrains[]`, `lastTrainNo?`, `citizenProfile?`, `roiAssumptions`, `userScenarios[]`, `installDismissedAt?` | yes |
| `tour` | `done: Partial<Record<PortalId, boolean>>`, `active: {portal, step} \| null`. Actions: `start(portal), next, skip, markDone, reset(portal?)` | `done` only |

Derived selectors (never stored): `workingBlocks` (snapshot blocks + approvals overrides/statuses; REFUSED hidden), `blocksForDay`, `freeWindows`, `cautionOrders`, `advisories` (GRANTED/LOCKED only), `events`, `adherence`, `kpis`, `roiLines`, `escalations`, `jointSuggestions(dept)`, `placement(taskId)`, `planDiff(candidate, working)`.

### 4.3 Roles / capabilities
Use `can(user, cap)` from `portals.ts`. Additions to `ROLES`: `SECTION_CONTROLLER` gets `lock` and `triage`; `CHIEF_CONTROLLER` gets `triage`. Action → capability: Grant/Refuse/Grant-with-change `grant`; Lock `lock`; Approve/Return RBP `authorise`; Concur/Object `concur:<DEPT>`; Accept/Return requisition, Run optimiser, Promote candidate, Send to Control `plan`; Raise requisition `intake`; Incident triage `triage`; Start/Done/Clear, assign gang `execute`; Issue/withdraw forms `issueCaution`; Admin page, seed, assumptions `admin`; Report `report`.

---

## 5. SHARED COMPONENT KIT (`src/kit`)

Frozen before portal work starts. Pages import only from `@/kit`, `@/engine`, `@/store`, `@/i18n`, `@/auth`.

| component | props summary |
|---|---|
| `AppShell` | `portal`; renders `Sidebar` (staff) or `BottomTabs` (field, citizen), `TopBar`, `RunBanner`, `NotificationDrawer`, `CopilotDrawer` (when portal ∈ control/planning/division), `SettingsSheet`, `TourSpotlight`; applies accent stripe and theme class |
| `Sidebar` | `items: {route, label, icon}[]`, collapsed state |
| `TopBar` | `portalLabel`, `corridorSelect?`, `clock?` (control), `bell` unread count, `LanguageSwitch`, `ThemeSwitch`, `AccountMenu` (Switch demo account — demo users only, Replay intro, Restart tour, Install app, Settings, Sign out) |
| `PageHeader` | `title`, `subtitle?`, `filters?: ReactNode`, `actions?: ReactNode`, `stamp?: SeedStamp` |
| `StatTile` | `label`, `value`, `unit?`, `baseline?`, `delta?`, `method?: {formula, seed, runId}` (popover), `onOpen?`, `label?: SimLabelKind` |
| `Card` | `title?`, `actions?`, `pad?` |
| `DataTable` | `columns`, `rows`, `sortable`, `filter?`, `stickyHeader`, `onRowClick`, `rowBadge?`, `empty: EmptyStateProps`, tabular-nums |
| `Badge` | `kind: status/band/dept/form`, `value` (fixed vocab from `vocab.ts`) |
| `DeptChip` | `dept: Dept`, `size` (uses tokens `--tms/--smms/--tdms`) |
| `ArciBar` | `terms: {key, label, value, sentence}[]`, `total`, `band` |
| `Drawer` | `open`, `side`, `width`, `title`, `onClose`; full-screen on mobile |
| `Modal` | `open`, `title`, `onConfirm`, `confirmLabel`, `danger?` |
| `Toast` | via `toast(message, {kind, action?})` |
| `EmptyState` | `title`, `body?`, `action?: {label, onClick}` |
| `Tabs` | `items`, `value`, `onChange`, route-synced option |
| `SegmentedControl` | `options`, `value`, `onChange` |
| `KeyValue` | `rows: [key, value][]`, `columns?` |
| `Timeline` | `steps: {label, ts?, state: done/current/pending}[]` |
| `Gantt` | `rows: {sectionIdx, line}[]`, `days`, `blocks`, `freeWindows?`, `highlightKeys?`, `onBlockClick`, `deptFilter?` |
| `StringDiagram` (StringChart) | `day`, `stations`, `passages`, `blocks`, `freeWindows`, `tsrs`, `nowMinute`, `layers`, `onBlockClick`, `onWindowSelect?` (try-a-block); canvas, throttled |
| `TimeScrubber` | `minute`, `playing`, `onChange`, `onPlay`, `nowLabel` |
| `CorridorMap` | `corridor`, `trains`, `blocks`, `incidents`, `depots`, `layers`, `center?`, `onSelect`; schematic fallback when tiles fail; `MiniMap` variant |
| `CorridorRuler` | `corridor`, `lanes`, `records`, `highlightId`, `onSelect` |
| `RingGauge` | `values: {label, pct}[]` (triple concentric) |
| `BarChart` | `series`, `categories`, `stacked?`, `valueFormat` |
| `Sparkline` | `points`, `markerIndex?` |
| `FormField` | `label`, `type: text/number/select/textarea/date/time/toggle`, `error?`, `hint?`, `required` |
| `Slider` | `min/max/step/value/onChange`, `label` |
| `ChipGroup` | `options`, `value(s)`, `multi?` |
| `PhotoCapture` | `onCapture(photoId)`, `maxPx=1280`, `quality=0.7` |
| `LocationPicker` | `value: {lat,lng,km,line,station}`, `onChange`, `corridor`; GPS button, map tap, km input |
| `LanguageSwitch` | `scope: all/citizen` |
| `ThemeSwitch` | `options` limited per portal (control: white/night; field: sunlight/white; others: white) |
| `InstallPrompt` | captures `beforeinstallprompt`; `variant: banner/button`; iOS instructions fallback |
| `TourButton` / `TourSpotlight` | `portal`; steps from `src/tours/<portal>.ts` `{route, selector: '[data-tour=…]', title, body}` |
| `SimLabel` | `kind: seededFeed/wttPositions/simClock/baseline/model/solver/assumption/planningEstimate/localAuth/notOfficial/seededRecords/localOnly`, `system?`, `seed?`; tooltip text from §8 |
| `SourceLabel` | `source: 'deck'`; renders "Target / literature (SIH 2026 deck)" |
| `SeedStamp` | `seed`, `runId`, `iterations`, `ms` |
| `BlockDrawer` | `blockKey`, `role: control/planning/dept/review/field`; sections: tasks (`ArciBar`), partners, resources, rule checks, delay impact, forms status, `AuditTrail`; action bar by role |
| `TaskDrawer` | `taskId`; asset, register source, ARCI explanation, placement |
| `IncidentDrawer` | `ref`, `mode` |
| `AuditTrail` | `entries` |
| `HandoffMatrix` | `rows`, `onAction` |
| `CompareTable` | `columns: Candidate/Working/Baseline`, `kpis` |
| `DiffTable` | `diff: planDiff` |
| `ScenarioCard` | `scenario`, `result?`, `onRun`, `onApply` |
| `RequisitionForm` | `dept`, `value`, `errors`, `onSubmit` |
| `FormSheet` + `PrintButton` | `form: T409/T409B/T351/programme/workOrder/isolation/requisition`, `data`; print CSS; watermark |
| `PossessionCard` | `block`, `records`, `onStart/onDone/onClear` |
| `CautionCard` | `order`, `onAck` |
| `AdvisoryList` / `AdvisoryBanner` | `advisories`, `lang` |
| `FeedHealthStrip` / `FeedCard` | `feeds`, `issuesByFeed` |
| `NotificationDrawer` | `portal` |
| `CopilotDrawer` | `ask(q) → {answer, citations: {kind, id, route}[]}`; suggested chips |
| `RequirePortal` / `RequireCap` | `portal`, `cap`; redirect to `/login?next=` |
| `PortalCard` | `portal`, `onSelect` |
| `ProgressBar` / `RunBanner` / `PageSkeleton` | worker progress text |

Themes: `white` (deck palette, default), `night` (control opt-in: near-black ground, same pastel hues at lower luminance), `sunlight` (field default: max contrast, 56-px targets). All tokens defined for all three in `tokens.css`; a contrast test over token pairs runs in CI.

---

## 6. TOUR

Steps are `{route, selector, title, body}`; selectors are `data-tour` attributes that the page owner must add. First run per portal (`!tour.done[portal]`), restart from AccountMenu or MethodPage.

**control**
1. `[data-tour=board-chart]` — "Tonight's chart" — "Stations down the side, time across. Thin lines are timetabled trains; the cursor is now."
2. `[data-tour=board-freewindows]` — "Free headway windows" — "Pale green bands are the gaps the optimiser found between trains."
3. `[data-tour=board-proposed]` — "Proposed blocks" — "Hatched orange outlines are waiting for you. Solid pastel means granted."
4. `[data-tour=board-tonight]` — "Tonight's programme" — "Every block in time order with its state. A block is grantable once all departments have concurred."
5. `[data-tour=board-drawer-actions]` — "Grant, change, refuse" — "Grant with change shifts the window; the delay model recomputes before you confirm."
6. `[data-tour=board-lock]` — "Lock D+1" — "Locking freezes tomorrow and stages the BDMS payload and caution drafts."
7. `[data-tour=nav-incidents]` — "Incidents" — "Reports from loco pilots, keymen and citizens land here with km and the next train."
8. `[data-tour=nav-replan]` — "Re-plan" — "If something fails, re-fit the rest of tonight with started blocks fixed and see the diff first."

**planning**
1. `[data-tour=overview-kpis]` — "Computed, not claimed" — "Six numbers against a simulated FIFO baseline. Seed and method are on every tile."
2. `[data-tour=nav-integration]` — "Feeds on one graph" — "What came from TMS, SMMS, TDMS, COA and FOIS, and what failed to normalise."
3. `[data-tour=nav-demands]` — "Demands" — "Requisitions from the three departments; validation tells them exactly what to fix."
4. `[data-tour=nav-risk]` — "Risk & priority" — "ARCI ranks the backlog. Open any row to see the terms."
5. `[data-tour=nav-optimiser]` — "Optimiser" — "Weights, rules, iterations, what-ifs. Nothing becomes the working plan until you say so."
6. `[data-tour=weekly-gantt]` — "Weekly plan" — "Joint blocks show stacked department stripes. The tray explains what could not be placed."
7. `[data-tour=weekly-send]` — "Send to Control" — "Blocks become proposals; departments are asked to concur; Control grants."
8. `[data-tour=nav-monthly]` — "26 weeks" — "The Rolling Block Programme with the 10-week JPO notice check."

**tms / smms / tdms** (same structure, dept words)
1. `[data-tour=today-stats]` — "Today" — "Overdue on your section, tonight's blocks with partners, requisitions waiting on you."
2. `[data-tour=nav-register]` — "Register" — tms: "Your TMS columns with the ARCI band." / smms: "Signals, points, track circuits with failures and overhaul due." / tdms: "By elementary section with wear and due dates."
3. `[data-tour=register-raise]` — "Raise a requisition" — "Prefilled from the row, validated as you type."
4. `[data-tour=nav-blocks]` — "Blocks" — "Concur or object. Joint block suggestions let your task ride in another department's possession."
5. `[data-tour=nav-forms]` — tms: "Caution & TSR — propose the restriction after your work." / smms: "T/351 — issue the disconnection notice and record reconnection." / tdms: "Power blocks — print the isolation sheet; record de-energised and energised."
6. `[data-tour=nav-incidents]` — "Incidents" — "Reports routed to you by location; convert to a task in one step."

**division**
1. `[data-tour=brief-kpis]` — "Outcomes vs baseline" — "Computed availability against the old practice, by corridor."
2. `[data-tour=brief-scorecards]` — "Department scorecards" — "Overdue, compliance, blocks executed, adherence."
3. `[data-tour=nav-plans]` — "Approvals" — "The monthly plan and the 26-week RBP wait here."
4. `[data-tour=nav-escalations]` — "Escalations" — "Mandatory past floor, blocks refused twice, stale demands and incidents."
5. `[data-tour=nav-roi]` — "ROI audit" — "Every rupee traces to an assumption you can edit; deck figures sit in their own column."
6. `[data-tour=nav-method]` — "Method & evidence" — "Computed this seed vs target / literature."

**field**
1. `[data-tour=possession-card]` — "Today's block" — "Section, window, partners, machine, in-charge."
2. `[data-tour=possession-buttons]` — "Start, Done, Clear" — "Press in order. Clear asks the speed the line is fit for."
3. `[data-tour=tab-report]` — "Report" — "Photo and location snapped to km; it goes to Control and the right department."
4. `[data-tour=cautions]` — "Cautions" — "Loco pilots see orders for their train; gangs see TSRs on their beat."
5. `[data-tour=offline-chip]` — "Offline" — "Works without signal; records stay on this phone."

**citizen**
1. `[data-tour=lang]` — "Your language" — "Applies to everything in this portal."
2. `[data-tour=search]` — "Train or station" — "See planned maintenance blocks for the next 7 days."
3. `[data-tour=advisory]` — "What it means" — "Window and how long the train may be held. No PNR, seat or live running here."
4. `[data-tour=report]` — "Report a hazard" — "Photo and location; keep the reference to track it."
5. `[data-tour=install]` — "Install" — "Keep it on your phone."

---

## 7. DEMO STORY (3:00)

- **0:00–0:15** Cold load `/`: video plays while the worker runs (captions are the real steps). Skip at 3 s. `/login` → Use demo account "Block Planner".
- **0:15–0:40 (PS point 1)** `/app/planning/integration`: five `FeedCard`s (COA WTT, FOIS forecast, TMS, SMMS, TDMS) with counts and "Seeded native-schema data" labels; Data quality tab shows two issues; click one → Corridor graph tab shows the record on the chainage ruler.
- **0:40–1:05 (point 2)** `/app/planning/demands`: open a Civil requisition (deep screening, CSM, 6 h, UP A–B), validation clean, Accept → toast, plan re-runs. `/app/planning/risk`: it lands near the top; expand → `ArciBar` terms (Weibull hazard, traffic density, overdue days, TSR impact, escalation p) and the mandatory floor; Weibull and AUC cards on the right.
- **1:05–1:35 (points 3 and 4)** `/app/planning/optimiser`: Run → progress → `CompareTable` candidate vs working vs baseline; Set as working plan. `/app/planning/weekly`: open Thursday 01:10–04:10 A–B UP: Civil deep screening + nested S&T point overhaul + TRD dropper renewal in one possession; drawer shows CSM-3, Gang 7 reach ok, block ceiling met, 2 goods trains regulated 9 and 12 min, premium path untouched; the tray shows one task unplaced (machine out of reach). KPI strip Δ vs baseline with `SeedStamp`; open one method popover. Send week to Control. Flip to `/app/planning/monthly` 26-week tab for JPO notice status.
- **1:35–1:50** AccountMenu → Switch demo account → Sr DEN: `/app/tms/today` shows "Awaiting my concurrence" → Concur. (S&T and TRD concurrences are pre-seeded for the demo block, labelled in the audit as "seeded demo concurrence".)
- **1:50–2:15 (human in the loop)** Switch → Section Controller, theme Night: `/app/control/board` string chart with the block hatched in the free window; Grant with change (+15 min) → delay model shows one goods train held 9 min; confirm; scrub to 01:10 to watch the regulated trains; Lock D+1 → `/app/control/caution` shows the T/409B draft → Issue → Print preview; `/app/control/handoff` Export CSV.
- **2:15–2:35 (incident loop)** Phone frame: `/citizen/report` photo + GPS snaps to km 234/5 UP + category track + Hindi → "SAM-0042 routed to Engineering". Switch → Sr DEN `/app/tms/incidents`: it is there with next train in 14 min → Convert to task → plan re-runs. Switch → Gang in-charge `/app/field/today`: Start → back on `/app/control/board` the bar shows in progress.
- **2:35–2:50** `/app/control/replan`: machine breakdown → Run → two blocks shifted, mandatory still met → Apply.
- **2:50–3:00** Switch → DRM `/app/division/brief` KPIs vs baseline; `/app/division/method` table "Computed this seed vs target / literature". Close on that table.

Seeded for the demo (documented in `dataFactory`): one joint block on Thursday with SMMS and TDMS concurrence pre-recorded; one unplaced task with "machine out of reach"; two data-quality issues; one machine whose removal shifts two blocks.

---

## 8. HONESTY RULES

Computed (engine, this seed): every KPI and delta, ARCI and terms, bands, Weibull/logistic fits and held-out metrics, plan blocks and windows, affected trains and minutes, free windows, caution order text, advisories, adherence, ROI line items (from assumptions), scenario narratives (templates filled from outputs). Simulated (seeded by `dataFactory`, seed shown): all feeds, timetable and goods forecast, registers, machines and crews, failure and escalation history, execution history, pre-seeded demo concurrences, injected disruption events, the clock. Assumptions (editable, source-labelled): ₹ rates, planning man-hours. Target / literature: every figure from the pitch deck; shown only on `MethodPage` and the optional grey column on `DivisionBriefPage` and `RoiPage`.

Rendering rule: a figure that depends on a simulated input renders with `SimLabel`; a figure that depends on an assumption renders with `SimLabel kind="assumption"`; a deck figure renders only through `SourceLabel`. No page-level banners; no label on computed results that are not simulated. Fixed wording (tooltip text):

| kind | label text |
|---|---|
| `seededFeed` | "Simulated feed — seeded {SYSTEM}-shaped data, seed {n}. No live link." |
| `seededRecords` | "Records before today are seeded history; records made on this device are real app state." |
| `wttPositions` | "Train positions derived from the working timetable, not GPS or NTES." |
| `simClock` | "Simulated clock (scrubber), not wall time." |
| `baseline` | "Baseline: simulated decentralised FIFO practice, same seed, computed like-for-like." |
| `model` | "Model fitted on seeded history; metrics on a held-out split." |
| `solver` | "In-browser solver: greedy construction + simulated annealing. CP-SAT reference formulation documented, not executed." |
| `assumption` | "Assumption — editable. Source: {source}." |
| `planningEstimate` | "Planning estimate from the block programme, not live running." |
| `localAuth` | "Browser-local demo accounts — no server, no real authentication." |
| `localOnly` | "Stored in this browser only — nothing is transmitted." |
| `notOfficial` | "Generated by SAMANVAY — not an official document until signed." |
| `SourceLabel` | "Target / literature (SIH 2026 deck)" |

Citizen wording is always "may be held up to about {n} min". Integration buttons say "Reseed", never "Sync". A CI script greps `src/pages` for numeric literals adjacent to `%`, `₹`, `min`, `h` outside `MethodPage` and fails the build.

---

## 9. DESCOPED

- Separate pages for corridor twin, capacity, scenarios, notifications, copilot, settings, citizen station and about, division incidents map, field orders/history — folded into tabs, drawers or sheets to hold 26 pages.
- Drag-and-drop Gantt — replaced by ±15/±30/±60 shift with rule check (same engine validation, far less UI risk).
- Manual "hold / regulate train" — regulation is computed by `delayModel`; the Held list is read-only.
- Command palette (Ctrl+K) — demo switching lives in AccountMenu; palette adds no demo value.
- Hard T/351 and power-block gates on Grant/Clear — soft warnings only, to keep the 3-minute path unblocked.
- "Refit models" button — models fit on every run.
- Edit machine reach/depot, TRD permit-to-work forms, station-master notifications, tel: controller links, Web Share — low demo value.
- Live BDMS/CRIS/COA/FOIS/SCADA/NTES links, GPS train positions, PNR/seat/berth, multi-device sync — no backend; labelled everywhere.
- Real authentication — browser-local only, labelled.
- CP-SAT in browser — documented reference only.
- Citizen languages beyond the six already in `i18n` (no ML/PA/OR); Hindi for staff keeps ground vocabulary (block, TSR, JPO, T/351) untranslated.
- Auto night theme by time — manual opt-in in control only; sunlight default in field.
- Audio cues on by default — flag off by default, control only.
- Per-block advisory publish toggle — advisories derive automatically from GRANTED/LOCKED blocks.
- CSV export beyond BDMS payload, execution log, 26-week table, ROI and issues.
- Photo storage in localStorage — IndexedDB with 1280-px compression and admin storage view.
- Snapshot persistence — inputs persist, snapshot recomputes on boot (preloader covers it).