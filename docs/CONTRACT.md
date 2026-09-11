# SAMANVAY v4 — implementation contract

Read this before writing any page or component. It is the authority where it differs from `docs/v4-spec.md` (the page spec, which you must also read for the page you own). The product: AI-powered automatic block planning for Indian Railways (SIH 2026, PS 26027). Every number a user sees is computed by the engine or recorded by a user action. There are no dummy numbers, no decorative buttons, no marketing badges.

## 1. Architecture (already built — do not modify without saying so in your result)

```
src/engine/*.js          isomorphic planning engine (feeds → normalise → ARCI → optimiser → KPIs → horizons)
src/engine/types.ts      TypeScript shapes of the snapshot (Snapshot, Task, Block, Kpis, Train, …)
src/engine/worker.ts     runs the engine off-thread; src/engine/client.ts → runPlan(request)
src/engine/select.ts     main-thread derivations (working blocks, caution orders, advisories, diff, GPS snapping …)
src/store/useAppStore.ts zustand store: session, settings, planning params, snapshot, JPO workflow, forms/TSRs, requisitions, reports, execution, notifications, audit
src/auth/portals.ts      PORTALS, ROLES, DEMO_ACCOUNTS, can(user, cap); src/auth/users.ts browser-local accounts
src/i18n/index.ts        useT(dict), useLang(), LANGS; src/i18n/common.ts shared strings; src/i18n/citizen.ts 8 languages
src/components/ui/       kit (index.tsx + extras.tsx); src/components/viz/ charts
src/app/                 AppShell (sidebar/topbar/mobile), CitizenShell, nav.ts (routes per portal), usePortal(), RequireAuth
src/features/            preloader, tour (driver.js), palette (Ctrl+K), notifications, pwa
src/pages/<portal>/      one file per page (you own only the files assigned to you)
src/styles/              tokens.css (deck palette, light/dark/sunlight), base.css, components.css
```

Routes are in `src/App.tsx`; nav labels in `src/app/nav.ts`. Portals: `control` (Section/Chief Controller), `planning` (block planning cell), `tms` / `smms` / `tdms` (departments), `division` (DRM + admin), `field` (gangs, loco pilots, mobile-first), `citizen` (public, mobile-first, no login).

## 2. Reading data

```ts
import { useAppStore } from '../../store/useAppStore';
const snapshot = useAppStore((s) => s.snapshot);      // Snapshot | null — null until the worker finishes
const status   = useAppStore((s) => s.planStatus);    // 'idle' | 'running' | 'ready' | 'error'
```
- If `snapshot` is null render `<PlanPending />` (from the kit) and nothing else.
- While `status === 'running'` keep rendering the previous snapshot (the shell shows the progress bar).
- Never keep derived plan state in local React state; derive with `useMemo` from the snapshot + store slices.
- `const blocks = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals])` gives blocks with workflow status and Control's window overrides applied. Use it everywhere blocks are shown.

Key snapshot fields: `snapshot.corridor` (stations, blockSections, oheSections, corridorBlocks, mpsKmph), `snapshot.tasks[]` (each with `risk.arci`, `risk.urgency`, `risk.mandatory`, `risk.explanation[]`, `risk.mlContributions[]`, `dept`, `workType`, `sectionLabel`, `line`, `startKm/endKm`, `totalMin`, `machine`, `crew`, `tsrKmph`, `daysOverdue`, `capital`, `metrics` (native record), `nativeLocation`, `sourceId`, `source`, `injected`), `snapshot.result.weekly` (`ai`, `baseline`, `kpis`, `baseKpis`, `delta`, `occupancy[7]`), `snapshot.result.monthly` (`calendar[30]`, kpis…), `snapshot.result.rolling` (`weeks[26]`, `entries`, `forecast`, `noticeRule`), `snapshot.feeds` (timetable, freight, tms/smms/tdms native records, machines, crews, executionLog), `snapshot.models` (weibull per asset class, escalationMetrics), `snapshot.factors`, `snapshot.issues`, `snapshot.pairs`, `snapshot.counts`, `snapshot.timing.ms`, `snapshot.scenario`.

Engine helpers you may import directly (plain JS, untyped params): `WORK_TYPES, DEPARTMENTS, MACHINE_TYPES, CREW_TYPES, TRAIN_CLASSES, DEFAULT_WEIGHTS, RULES` from `src/engine/constants.js`; `CORRIDORS` from `src/engine/corridors.js`; `toBdmsDemand, blocksToCsv` from `exporter.js`; `askCopilot(query, snapshot)` from `copilot.js`; `SCENARIO_PRESETS, buildScenarioFromPreset, generateScenarioNarrative` from `scenarios.js`; `computeRoiModel(weeklyResult, corridor, assumptions)` from `roi.js`; `searchTrains, getTrainItinerary` from `trainLookup.js`; `validateDemand(fields, corridor, factors)` from `intake.js`; `advisoriesToCsv` from `advisories.js`; `hhmmToMin, minToHHMM, fmtDuration` from `time.js`.

`src/engine/select.ts` (typed): `workingBlocks`, `blocksForDay`, `blockStatusLabel`, `evaluateBlockWindow(snapshot, block, start, end, others)` → affected trains + `ruleViolations[]`, `cautionOrders(snapshot, blocks, tsrs, forms, day)`, `disconnectionNotices(snapshot, blocks, forms, day)`, `disconnectionNoticesWeek`, `advisories(snapshot, blocks)` (GRANTED/LOCKED only), `findTrain`, `blocksMetByTrain`, `placement(snapshot, blocks, taskId)`, `jointSuggestions(snapshot, blocks, dept)`, `planDiff(candidate, working)`, `adherence(executionLog)`, `snapToCorridor(corridor, lat, lng)`, `nextTrainAt(snapshot, day, minute, km, line)`, `livePositions(snapshot, day, minute, blocks)`, `derivedEscalations(...)`.

## 3. Writing state (store actions — the only way to change anything)

| Action | Effect |
|---|---|
| `runPlan({reason})` | worker re-run with current params, intake tasks, accepted reports, execution log; audit |
| `runCandidate(patch, reason)` / `promoteCandidate()` / `discardCandidate()` | what-if run kept as `candidate` until promoted |
| `setWeights / setRules / setIterations / resetTuning / setScenario` | planning parameters (then call `runPlan`) |
| `pinTask(id) / unpinTask / excludeTask(id, reason) / includeTask` | mandatory floor / closed works for the next run |
| `proposeBlocks(ids)` | planning sends blocks to Control (records proposedAt) |
| `concur(blockId, dept, note?)` / `object(blockId, dept, reason)` | departmental concurrence / objection (needs `can(user, 'concur:<DEPT>')`) |
| `grant(blockId, override?)` / `refuse(blockId, reason)` / `lock(blockId)` | Control workflow (`grant`, `lock` capabilities) |
| `setIncharge(blockId, name)` / `setResources(blockId, {machineId, crewId})` | execution details on a block |
| `setFormStatus(formId, status, reason?)` | T/409 / T/409B / T/351 status: DRAFT → ISSUED → RECEIVED / RECONNECTED / WITHDRAWN / ACKNOWLEDGED |
| `addTsr({...})` / `updateTsr(id, patch)` | manual / emergency TSRs (`status: 'PROPOSED' | 'IN_FORCE' | 'WITHDRAWN'`) |
| `setPowerBlock(blockId, 'PENDING'|'DEENERGISED'|'ENERGISED')` | TRD isolation record |
| `submitRbp(kind)` / `decideRbp(kind, decision, remarks)` / `markJpoServed(taskId)` | programme approvals |
| `escalate({...})` / `reviewEscalation(id)` / `direct(dept, note)` | DRM desk |
| `startPossession(rec)` / `markItemDone(blockId, taskId, actualMin, remarks?)` / `clearPossession(blockId, {actualEnd, overrunCause?, speedOnLifting?})` | execution log (feeds duration calibration on the next run) |
| `messageControl(blockId, text)` / `ackCaution(orderNo)` | field messages / loco pilot acknowledgements |
| `saveRequisition(draft)` / `submitRequisition(id)` / `returnRequisition(id, remarks)` / `acceptRequisition(id)` / `withdrawRequisition(id)` | BDMS-style requisitions (accept → injected task on next run) |
| `submitReport({...})` / `triageReport(id, action, data)` | hazard reports: `verify | assign | reroute | accept (taskSpec) | reject | resolve | return` |
| `notify({...})` (rarely needed — most actions already notify) / `markRead` | notifications |
| `toast({title, body?, tone})` | feedback after every action that changes state |
| `setTheme('light'|'dark'|'sunlight')`, `setLanguage`, `setCorridor`, `setHomeStation`, `toggleSavedTrain`, `setLastTrainNo`, `setCitizenName`, `setRoiAssumptions`, `resetDemoData`, `resetTours` | settings |

Every action already writes the audit trail; do not duplicate. After an action that should change the plan (accept requisition, convert report, mark machine unavailable, apply scenario) call `runPlan({reason})` and toast what happened. After an action that only changes workflow state (concur, grant, issue form) do NOT re-plan.

Capabilities: `can(user, 'grant' | 'lock' | 'authorise' | 'concur:TMS' | 'concur:SMMS' | 'concur:TDMS' | 'plan' | 'intake' | 'triage' | 'execute' | 'issueCaution' | 'admin' | 'report')`. Hide or disable (with a hint) what the user cannot do.

## 4. Kit (`src/components/ui`)

`index.tsx`: `Card, CardHead, CardBody, CardFoot, PageHeader, SectionTitle, StatTile, HonestyTag, Badge, DeptBadge, UrgencyBadge, StatusBadge, Meter, ArciBar, DataTable, KeyValue, Tabs, Segmented, Callout, EmptyState, Spinner, PlanPending, Field, Drawer, Modal, Toasts`.
`extras.tsx`: `SimLabel({kind})` (fixed honesty wording — kinds: seededFeed, seededRecords, wttPositions, simClock, baseline, model, solver, assumption, planningEstimate, localAuth, localOnly, notOfficial), `SourceLabel`, `SeedStamp`, `AuditTrail`, `Timeline`, `TimeScrubber`, `ChipGroup`, `Slider`, `PrintButton` + `FormSheet` (A4 print, watermark), `PhotoCapture` (IndexedDB, 1280 px), `loadPhoto(photoId)`, `LocationPicker` (GPS → chainage).
`viz/index.tsx`: `RingGauge, BarChart, HBars, Sparkline, HeatStrip`.
Shared domain components (wave 1, `src/components/domain`): `TaskDrawer`, `BlockDrawer`, `ReportDrawer`, `RequisitionForm`, `useDrawerParams`; viz: `WeeklyGantt`, `StringDiagram`, `CorridorMap` (+ `MiniMap`), `CorridorRuler`.
`src/lib/format.ts`: `hhmm, toMin, duration, kmRange, pct, pts, signed, num, rupees, dateLabel, dateLong, addDaysIso, timeAgo, clockIST, nowMinuteIST, DEPT_LABEL, DEPT_CLASS, lineLabel, URGENCY_LABEL, URGENCY_TONE, arciTone, classLabel, clamp, download, copyText`.

CSS classes (components.css): `btn btn-primary|btn-dark|btn-ghost|btn-danger|btn-ok btn-sm|btn-lg|btn-icon|btn-block`, `card card-head card-body card-foot`, `stat`, `badge badge-<tone>`, `tbl`, `kv`, `field input select textarea check`, `seg`, `tabs`, `callout callout-<tone>`, `meter`, `timeline`, `page-head`, `grid grid-2|3|4|auto|main-aside`, `row row-wrap stack stack-lg grow right`, `muted dim small tiny strong caps mono num truncate`, `hide-mobile show-mobile`, `tag-sim tag-assumption tag-computed`. Pastel washes: `pastel-blue|lavender|yellow|pink|green|gray` on `.card` / `.stat`. Prefer classes over inline styles; inline `style` only for layout one-offs.

## 5. Design rules (deck palette — non-negotiable)

- White page and cards, 1 px hairlines, 8–12 px radii. Pastel washes for grouping. Orange `--accent` only for the one primary action on a screen; red only for critical; green only for OK/granted. No gradients, no dark panels (dark theme is a separate token set — never hard-code colours; use tokens so light / dark / sunlight all work).
- Department colour means department (`DeptBadge`, `dot-tms/smms/tdms`, `--tms/--smms/--tdms`). Never use it as decoration.
- Numbers: `className="num"` (tabular). Tables: `DataTable`. Charts: `BarChart/HBars/Sparkline/RingGauge` — one axis, thin marks, legend when ≥ 2 series.
- Copy: railway vocabulary (possession, block, TSR, JPO, T/409, T/351, USFD IMR, TGI, OHE, elementary section, SLW). Short sentences. No exclamation marks, no "AI-powered", no "cryptographic", "SIL-4", "Kavach", "99.8 %". Titles are nouns.
- Every interactive element does something real (state change, navigation with context, export, print, drawer). If an action is not possible for the user, show why (disabled + hint) — never a silent no-op.
- Every page works on a 375 px phone (stack, wrap, `table-wrap` scroll) and on desktop.
- Add `data-tour="…"` anchors listed in your assignment; the tour targets them.

## 6. i18n

Every page declares a local dictionary and uses it for all visible strings:
```ts
const strings = { en: { title: 'Weekly block plan', ... }, hi: { title: 'साप्ताहिक ब्लॉक योजना', ... } } as const;
const t = useT(strings);   // t('title')
```
English and Hindi are required for staff pages (Hindi keeps railway terms — block, TSR, JPO, T/351 — in Latin script). Citizen pages use `src/i18n/citizen.ts` (8 languages; add keys there if you need more, with all 8 translations). Shared words (`Save`, `Cancel`, `Grant block`, department names, day names…) come from `src/i18n/common.ts` via `useT(common)`. Dates/numbers: `dateLabel`, `num`, `rupees` from `lib/format`.

## 7. Honesty labels

- Feed-derived tables/cards: `<SimLabel kind="seededFeed" system="TMS" seed={snapshot.feeds ? 26027 : undefined} />`.
- Baseline comparisons: `kind="baseline"`. Model metrics: `kind="model"`. Optimiser: `kind="solver"`. ₹ figures: `kind="assumption" source="…"`. Train positions / next-train minutes: `kind="wttPositions"`. Scrubber: `kind="simClock"`. Printed forms: `FormSheet` carries the not-official watermark. Accounts: `kind="localAuth"`; device-only storage: `kind="localOnly"`.
- Deck numbers (+18.8 %, −51.9 %, 96.2 %, 11–17 %, 15 %) appear only on `MethodPage` (and the optional grey column on `DivisionOverviewPage` / `RoiPage`) with `<SourceLabel />`. Nowhere else. No other literal KPI numbers anywhere.

## 8. URL conventions

Drawers open from query params so links work across portals: `?block=<id>` opens `BlockDrawer`, `?task=<id>` opens `TaskDrawer`, `?report=<id>` opens `ReportDrawer`, `?train=<no>` selects a train, `?station=<code>` a station, `?req=<id>` a requisition, `?day=<0-6>` a plan day, `?week=<n>` an RBP week. Use `useDrawerParams()` (wave 1) which returns `{ blockId, taskId, reportId, open(kind, id), close() }`.

## 9. Files you own

You own only the files listed in your assignment. Create additional files only inside your own page folder (e.g. `src/pages/planning/weekly/*.tsx`). Do not edit `store`, `select`, `kit`, `nav`, `App.tsx`, `styles`, other agents' pages. If the foundation blocks you, work around it inside your files and report the gap precisely in your result (file, symbol, what is missing) so the integrator can fix it.

## 10. Definition of done (per file)

1. `npx tsc -p tsconfig.app.json --noEmit` passes for your files (run it; fix your errors; ignore errors in other agents' files but report them).
2. No stub text remains ("This page is being built").
3. Every button/link/row click has a real effect. Every state-changing action toasts and (where it changes the plan) re-plans.
4. EN + HI dictionaries complete for every visible string on the page.
5. Empty / loading / error states handled (`PlanPending`, `EmptyState`, `Callout`).
6. Honesty labels present where §7 requires.
7. `data-tour` anchors from your assignment present.
8. Renders correctly at 375 px and 1280 px; nothing overflows horizontally (wide tables inside `table-wrap`).
