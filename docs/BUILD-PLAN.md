# SAMANVAY — complete build plan

SIH 2026 · PS 26027 · *AI-Powered Automatic Block Planning to Maximize Asset Availability for Train Operations on Indian Railways*

This is the master guide: every phase needed to take SAMANVAY from an empty repo to a winning, demo-ready submission. Each phase lists its goal, what gets built, where it lives, and how to tell it is done. Live status is tracked in [`PROGRESS.md`](../PROGRESS.md). Page-level detail is in [`v4-spec.md`](v4-spec.md) and the rules every file must follow are in [`CONTRACT.md`](CONTRACT.md). Where these documents disagree, the contract wins for code and this plan wins for scope and order.

---

## How to use this plan

1. Work phases in order. A phase starts only when the one before it passes its exit checks, except the phases marked *parallel*.
2. Every item ends in something a user can see and use. Nothing is "built" until it is linked from the UI and works in the browser.
3. After each work session, update `PROGRESS.md`: tick items, add a dated log line, move open issues.
4. Before any commit: `npm run typecheck`, `npm test`, `npm run build` all pass.

### Non-negotiable rules (apply to every phase)

| Rule | What it means in practice |
|---|---|
| No dummy data | Every number is computed by the engine or recorded by a user action. Seeded inputs (feeds, registers, history) carry a `SimLabel`. Deck figures (+18.8 %, −51.9 %, 96.2 %, 11–17 %, 15 %) appear only on the Method page and optional grey columns, behind `SourceLabel`. |
| Every control works | Each button changes state, navigates with context, exports, prints, or opens a drawer. If a user cannot do something, the control is disabled with a reason. |
| Understandable first | Plain railway words (block, possession, TSR, JPO, T/409, T/351). Short sentences. One primary (orange) action per screen. |
| Deck look | White ground, pastel washes (#EDF5FD, #D9DBFD, #F7ECD7, #F1D5DB, #CCE9CD, #EDEDED), dark text #111111, accents ≤ 5 % (#F28C28, #E85D5D, #43A047), 6–12 px radii, no gradients. Light, dark and sunlight themes from tokens only. |
| Multilingual | Staff pages EN + HI. Citizen portal in 8 languages (EN, HI, BN, MR, TA, TE, GU, KN). |
| Works everywhere | 375 px phone to 1920 px desktop; nothing scrolls sideways except tables inside `table-wrap`. |
| Human in the loop | The optimiser proposes; the Section Controller grants, refuses or changes. Nothing is auto-granted. |

---

## Problem statement → feature traceability

This table is the checklist judges will implicitly run. Every row must be demonstrable in the running app.

| PS / deck requirement | Where it is answered | Evidence in the app |
|---|---|---|
| Siloed data: TMS, SMMS, TDMS, COA, FOIS | Engine feeds + normaliser; `IntegrationPage` | Five feed cards with native schema, counts, data-quality issues, corridor graph (chainage ruler) |
| Digital twin corridor graph | `normalizer.js`, Integration → Corridor graph, `CorridorMap` | Civil chainage, signal locations and OHE elementary sections on one ruler/map |
| Predictive risk prioritisation (ARCI) | `risk.js` (Weibull MLE + logistic escalation), `RiskPage` | Ranked table, term-by-term explanation, model cards (β, η, AUC, precision, recall) |
| Block optimisation / multi-objective solver | `scheduler.js` (greedy + simulated annealing), `OptimiserPage` | Weights, rules, iterations, what-ifs; candidate vs working vs baseline |
| Joint shadow blocks (co-location) | Scheduler co-location term; `WeeklyPlanPage` | Stacked department stripes on the Gantt; joint-block suggestions for departments |
| Multi-horizon planning (26-week, 30-day, 7-day, real time) | `horizons.js`, `HorizonsPage`, `WeeklyPlanPage`, `ReplanPage` | 26-week RBP with 10-week JPO notice check, monthly calendar with capital works, weekly Gantt, re-plan tonight |
| Human-controlled dispatch | JPO workflow in store; `ControlBoardPage`, `HandoffPage` | Propose → concur (per department) → grant / grant with change / refuse → lock D+1 |
| Controller validation on a 24-hour string chart | `StringDiagram` | Train strings, free headway windows, proposed/granted blocks, now-cursor |
| Adaptive disruption recovery | `ReplanPage` | Inject a failure, re-fit the rest of tonight with started blocks fixed, apply or discard the diff |
| Generate T/409B and notifications | `cautionOrder.js`, `FormsPage`, notifications | T/409, T/409B, T/351, TSR register, power-block record; print; field acknowledgement |
| Geo-intelligent incident scanning | `FieldReportPage`, `CitizenReportPage`, `IncidentsPage` | Photo + GPS snapped to km/line/section, category → department routing, verify/caution/convert to task |
| Citizens and loco pilots as end users | Citizen portal, field portal | Mobile-first, installable, 8 languages, train/station advisories, hazard report with reference tracking |
| Self-learning models | Execution log → duration recalibration; models refit every run | Adherence page "Recalibrate durations" changes the next plan |
| Measurable value (availability, downtime, co-location, disruption) | `kpi.js`, `PlanningOverviewPage`, `DivisionBriefPage` | Computed KPIs vs simulated decentralised baseline, same seed |
| Cost efficiency | `roi.js`, `RoiPage` | Line-item ₹ from editable, source-labelled assumptions |
| Role-based access, intuitive dashboards | `auth/portals.ts`, 8 portals, tour | Separate portal per role, first-run guided tour per portal |
| Scalable across divisions | Corridor selector, seeded corridors | Switch corridor → whole plan recomputes |
| Explainable AI | ARCI explanation, block drawer rule checks, Method page | Every block says why it is there, which trains it holds, which rules it passes |

---

## Phase 0 — Framing and contracts

**Goal:** agree what is being built before building it.

- [x] Read PS 26027 and the deck content; extract requirements (table above).
- [x] Primary research notes: siloed systems, decentralised BDMS demands, manual conflict resolution in COA, deferrals, cascading degradation.
- [x] Write `docs/v4-spec.md` (portals, routes, page specs, state, kit, tour, demo story, honesty rules, descoped list).
- [x] Write `docs/CONTRACT.md` (architecture, data access, store actions, kit, design rules, i18n, honesty, URL conventions, definition of done).
- [x] Decide stack: React 19 + Vite + TypeScript, zustand, react-router 7, Leaflet, driver.js, vite-plugin-pwa, idb-keyval, Web Worker engine.

**Exit check:** spec and contract committed; every PS requirement maps to a page.

## Phase 1 — Planning engine

**Goal:** a deterministic, seeded, in-browser engine that produces every number the app shows.

| Module | Responsibility |
|---|---|
| `dataFactory.js` | Seeded native-schema feeds: COA working timetable, FOIS freight forecast, TMS / SMMS / TDMS registers, machines, crews, execution and failure history |
| `normalizer.js` | Map native records onto one corridor graph (block section, chainage, line, OHE section); raise data-quality issues |
| `risk.js` | Weibull MLE per asset class, logistic escalation model with held-out metrics, ARCI score and urgency band, mandatory floor |
| `occupancy.js`, `delayModel.js` | Train passages, headway free windows, affected trains and weighted delay per block window |
| `scheduler.js` | Greedy construction + simulated annealing; rules (min/max block, headway margin, blocks per day, concurrent blocks, premium conflicts, night window); co-location; machine and crew reach |
| `baseline` (in planner) | Simulated decentralised FIFO practice, same seed, for like-for-like comparison |
| `horizons.js` | Weekly, 30-day and 26-week (RBP) horizons; JPO 10-week notice check; Weibull workload forecast |
| `kpi.js` | Availability, closure hours, co-location, mandatory compliance, train-minutes lost, TSR-days, deltas |
| `cautionOrder.js`, `advisories.js` | T/409, T/409B, T/351 text; passenger advisories from granted/locked blocks |
| `roi.js`, `copilot.js`, `scenarios.js`, `exporter.js`, `trainLookup.js`, `livePosition.js`, `intake.js`, `execution.js`, `productivity.js` | ₹ lines, grounded Q&A, scenario presets, BDMS CSV/JSON, train search, WTT positions, requisition validation, adherence, duration calibration |
| `worker.ts`, `client.ts`, `select.ts` | Off-thread runs; typed main-thread derivations |

- [x] Port engine from the fleet-management prototype; keep it pure and isomorphic.
- [x] Worker bridge with progress messages (used by the preloader).
- [x] Extensions: `pinnedTaskIds`, `excludedTaskIds`, injected tasks with `sourceId`; rolling horizon rebuilt when exclusions/pins change.
- [x] Content-stable block ids (FNV-1a hash of day, line, window, task set) so approvals survive re-plans.
- [x] Tests: `tests/core.test.js`, `cautionOrder.test.js`, `livePosition.test.js`.
- [ ] `fixedBlocks` input (started/locked blocks immutable during re-plan) — today re-plan keeps them by workflow status, not as a solver constraint.
- [ ] `groupId` on injects (accept a joint-block suggestion as a hard co-location).

**Exit check:** `npm test` green; same seed → same plan; re-plan with no change → same block ids.

## Phase 2 — Foundation

**Goal:** everything pages depend on, frozen before page work.

- [x] Store (`useAppStore`): session, settings, planning params, snapshot, candidate, JPO approvals, forms/TSRs, power blocks, RBP, requisitions, reports, execution, notifications, audit; persisted with versioned migrations.
- [x] Auth and portals (`portals.ts`, `users.ts`): 8 portals, roles, capabilities, demo accounts (password `samanvay`), browser-local sign-up.
- [ ] Restrict self sign-up to field roles with an invite code; officer, controller and admin accounts are created from Admin → Users (today any staff role can self-register).
- [x] i18n: `useT(dict)`, EN/HI app-wide, 8 citizen languages.
- [x] Design tokens: deck palette, light / dark / sunlight themes, alias tokens.
- [x] Shell: sidebar, top bar (search, corridor, re-plan, notifications, account), mobile drawer + bottom bar; citizen shell with bottom tabs.
- [x] Train video preloader tied to real worker progress; skip; plays once.
- [x] PWA: manifest, service worker, install prompt (Chrome) and iOS instructions page.
- [x] Guided tour (driver.js) per portal, first-run and on demand.
- [x] Command palette (Ctrl+K) with role-aware routes.
- [x] Notifications: derived from plan state + pushed by actions, per portal.

**Exit check:** sign in to each portal, shell renders, theme and language switch, tour starts, install option appears in Chrome.

## Phase 3 — Component kit and visualisations

**Goal:** one set of components so every page looks and behaves the same.

- [x] Primitives: Card, PageHeader, StatTile, Badge family, DataTable, Tabs, Segmented, Drawer, Modal, Toasts, EmptyState, PlanPending, Field.
- [x] Extras: SimLabel, SourceLabel, SeedStamp, AuditTrail, Timeline, TimeScrubber, ChipGroup, Slider, PrintButton + FormSheet, PhotoCapture (IndexedDB, 1280 px), LocationPicker (GPS → chainage).
- [x] Charts: RingGauge, BarChart, HBars, Sparkline, HeatStrip.
- [x] Heavy viz: `WeeklyGantt`, `StringDiagram` (24-h string chart), `CorridorMap` (Leaflet + schematic fallback, MiniMap).
- [x] Domain drawers: BlockDrawer, TaskDrawer, ReportDrawer; `useDrawerParams` (`?block=`, `?task=`, `?report=`).

**Exit check:** kit renders in all three themes without contrast failures.

## Phase 4 — Portal pages

**Goal:** each role gets its own portal with only what that role needs.

| Portal | Pages | Status |
|---|---|---|
| Planning cell | Overview, Demands, Risk & priority, Weekly plan, Monthly & 26-week, Corridor capacity, Optimiser (studio), Scenarios, BDMS hand-off, Adherence & log, Integration, Copilot, How it works | built |
| Control (TMS-side operations) | Board (string chart), Programme, Map, Blocks, Corridor, Re-plan, Incidents, Caution & TSR, Weekly (review), Hand-off, Log, Copilot, Method | built |
| Civil (TMS) / S&T (SMMS) / TRD (TDMS) | Today, Resources, Register, Requisitions, Blocks, Caution (TMS) / T/351 (SMMS) / Power blocks (TDMS), Incidents, Reports, Copilot, Method | built |
| Division (DRM) | Brief, Approvals (plans), Programme, Escalations, ROI audit, Incidents, Feeds, Integration, Admin, Audit, Method | built |
| Field (gang, keyman, loco pilot) | Today (possession card / LP run), Report, My reports, Cautions, Train | built |
| Citizen (no login) | Home, Train, Station, Report, My reports | built |
| Public | Landing, Login, Sign up, Install | built |

- [x] Every page reads the snapshot and store; no local copies of plan state.
- [x] EN + HI strings on every staff page; citizen strings in 8 languages.
- [x] `data-tour` anchors for every tour step.
- [x] Honesty labels where required.

**Exit check:** no stub text; typecheck clean; each page opens without console errors.

## Phase 5 — End-to-end workflows *(the part judges test)*

**Goal:** the portals work together as one system. Each loop below must run start to finish in the browser, across role switches, with state persisting.

1. **Plan → approve → execute (JPO loop)**
   Planner runs optimiser → sends week to Control → Sr DEN / Sr DSTE / Sr DEE concur (or object) → Section Controller grants / grants with change / refuses → locks D+1 → caution orders drafted → issued and printed → gang Start / Done / Clear → loco pilot acknowledges caution → execution log and adherence update → next plan recalibrates durations.
2. **Requisition loop**
   Department raises a requisition from a register row → validation → planning cell accepts (task injected, plan re-runs) or returns with remarks → task appears in Risk and in the weekly plan.
3. **Incident loop**
   Citizen / keyman / loco pilot reports a hazard (photo + GPS) → routed to control and the right department → control verifies or imposes a TSR → department converts to a task → plan re-runs → citizen tracks status by reference.
4. **Disruption loop**
   Control injects a failure → re-plan tonight with started blocks fixed → diff → apply (notifies departments and field) or escalate to DRM.
5. **Programme approval loop**
   Planning submits monthly plan and 26-week RBP → DRM approves or returns with remarks → JPO notices marked served / late.
6. **Escalation loop**
   Mandatory past floor, refused twice, stale demands/incidents → DRM directs a department or pins a task → planning sees it.
7. **Passenger loop**
   Granted blocks → advisories on citizen home, train and station pages in the chosen language → share / save train.

**Exit check:** each loop scripted in `PROGRESS.md` → QA section and passes on desktop and at 375 px.

## Phase 6 — Honesty and data integrity audit *(parallel with 5)*

- [x] Remove fabricated KPIs, fallbacks and fake telemetry from pages.
- [x] ROI lines from plan quantities × editable assumptions only; no placeholders.
- [x] Seeded records flagged `seeded: true` and labelled; no execution records for blocks that do not exist.
- [x] Advisories and caution-order delay estimates computed from the delay/TSR models.
- [ ] Automated honesty check: script that greps `src/pages` for numeric literals next to `%`, `₹`, `min`, `h` outside `MethodPage` and fails the build.
- [ ] Contrast test over token pairs for all three themes.

**Exit check:** a reviewer can click any number and find where it came from.

## Phase 7 — Language and accessibility

- [x] Staff EN + HI; citizen 8 languages; railway terms kept in Latin script.
- [x] Status badges, SimLabels, source labels and audit trail translated.
- [ ] Engine-side messages (requisition validation, copilot answers) in Hindi.
- [ ] Keyboard pass: focus visible, drawers/modals trap focus, Escape closes.
- [ ] Screen-reader labels on icon-only buttons.

## Phase 8 — Mobile, PWA and citizen features

- [x] Citizen and field portals mobile-first with bottom tabs; sunlight theme for field.
- [x] Install from Chrome (beforeinstallprompt) + iOS "Add to Home Screen" page; shortcuts in manifest.
- [x] Citizen: language chips, train/station search with suggestions, saved trains, advisories, share, hazard report with camera + GPS, reference tracking, first-visit tour.
- [ ] Offline check: app shell and last plan open with no network; reports queue locally.
- [ ] Lighthouse PWA + accessibility ≥ 90 on citizen home.

## Phase 9 — Browser QA *(every button, every text, every theme)*

Run these on a clean profile (Admin → Reset demo data) at 1280×800 and 375×812, in light, dark and sunlight themes.

- [ ] Planning: overview tiles open their pages; demands accept/return; risk explain/pin; optimiser run/promote/discard; scenarios apply/revert; weekly send; handoff export CSV/JSON; adherence recalibrate; integration reseed/assign/resolve; copilot answers link to the block or task they describe.
- [ ] Departments (×3): today concur/object; register raise requisition; requisitions submit/withdraw; blocks concur; forms (TSR propose / T/351 issue-reconnect / power block de-energise-energise); incidents convert/resolve/return; resources mark machine unavailable.
- [ ] Control: board grant / grant with change / refuse / clear / lock; programme print + handover note; map train lookup; re-plan run/apply/escalate; incidents verify/TSR/close; caution issue/withdraw/print; log record.
- [ ] Division: brief direct department; approvals approve/return; escalations review/pin; ROI edit/reset/export; admin users/seed/reset/tours/export-import; audit filter.
- [ ] Field: gang Start/Done/Clear with checklist and TSR; message control; report issue; LP train select + acknowledge caution.
- [ ] Citizen: all 8 languages; search; train and station pages; report with photo + GPS; my reports; install.
- [ ] Cross-cutting: Ctrl+K palette routes per role; notifications open the right page; tour on every portal; no clipped or invisible text; no horizontal scroll; no console errors.

**Exit check:** every item ticked; issues found are fixed and re-tested.

## Phase 10 — Build, tests and release hygiene

- [x] `npm run typecheck`, `npm test`, `npm run build` pass.
- [ ] Lint clean (`npm run lint`) — only intentional warnings left.
- [ ] Add workflow tests for store actions (propose → concur → grant → lock; requisition accept; report convert).
- [ ] Bundle check: initial JS under budget; engine stays in the worker chunk.
- [ ] Commit in logical steps on `rebuild-v4`; open a PR to `main` when Phase 9 passes.

## Phase 11 — Demo and submission

- [ ] Deploy the static build (Vercel or Netlify) with SPA fallback and HTTPS so PWA install works; put the URL in the README and deck.
- [ ] Rehearse the 3-minute demo story (`v4-spec.md` §7) on the deployed build; seed the demo corridor so the story's joint block, unplaced task and data-quality issues appear.
- [ ] Record a backup screen capture of the demo.
- [ ] Deck alignment: screenshots from the real app for solution, innovation, technical approach, feasibility and impact slides; deck figures labelled as targets/literature.
- [ ] README: problem, what is real vs simulated, how to run, demo accounts, architecture diagram.
- [ ] Final judge checklist: open each PS row in the traceability table and show it live.

## Phase 12 — Future scope (only after Phase 11)

- CP-SAT reference formulation executed server-side (OR-Tools) and compared with the in-browser solver.
- API adapters for TMS / SMMS / TDMS / COA / FOIS (read-only) replacing seeded feeds.
- Server sync for multi-device execution records and notifications.
- IoT / track-recording-car inputs into ARCI; ISRO-RTIS positions instead of WTT positions.
- Network-level rollout: multiple divisions, inter-division corridors.

---

## Definition of done (whole product)

1. Every PS row in the traceability table is demonstrable live.
2. All seven workflow loops run end to end across role switches.
3. Phase 9 QA list fully ticked in all three themes and both viewports.
4. Typecheck, tests, build and lint pass; honesty check passes.
5. Deployed URL installs as an app on Android Chrome and opens offline.
6. Demo rehearsed under 3 minutes with a recorded backup.
