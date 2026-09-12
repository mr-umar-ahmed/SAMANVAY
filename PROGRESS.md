# SAMANVAY — progress

Live tracker for [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md). Updated at the end of every work session and whenever a phase item changes.

**Branch:** `rebuild-v4` (local changes in progress)
**Last updated:** 2026-09-12
**Health:** typecheck clean · 67/67 engine & workflow tests pass · production build OK (108 precache entries)

---

## Phase status

| # | Phase | Status | Notes |
|---|---|---|---|
| 0 | Framing and contracts | ✅ done | `docs/v4-spec.md`, `docs/CONTRACT.md`, `docs/PPT-COMPLIANCE.md`, `docs/MILP-FORMULATION.md` |
| 1 | Planning engine | ✅ done | Exact MILP (HiGHS WebAssembly) + SA polish, weather constraints, anomaly detection, fixed blocks hold |
| 2 | Foundation | ✅ done | Cross-tab broadcast bus (`crossTab.ts`), service worker notifications, RBAC with ADEN/JE roles |
| 3 | Component kit and viz | ✅ done | `SolverStamp`, `SafetyBanner`, `ConflictsPanel`, `SupersededList`, `CorridorRuler`, `NetworkMap` |
| 4 | Portal pages | ✅ done | 8-step live `WorkflowPage`, native register CSV/JSON importer, geo-triage auto-severity |
| 5 | End-to-end workflows | ✅ done | 7/7 operational loops automated & verified in `tests/store-workflow.test.js` & `tests/workflow.test.js` |
| 6 | Honesty audit | ✅ done | Automated honesty scan (`check-honesty.js`) passes (41 files), WCAG AA contrast verified |
| 7 | Language and accessibility | ✅ done | Staff EN+HI, Citizen 8 languages, bilingual validation errors and factor breakdowns |
| 8 | Mobile, PWA, citizen | ✅ done | Offline PWA with IndexedDB photo storage, sunlight theme for field, push notifications |
| 9 | Browser QA | 🔵 in progress | Multi-role cross-tab workflow testing on 1280 px and 375 px |
| 10 | Build, tests, release hygiene | ✅ done | 67/67 tests passing (`npm test`), 0 TypeScript errors, bundle built in 1.3s |
| 11 | Demo and submission | 🟡 ready | Deck alignment (`docs/PPT-COMPLIANCE.md`), live workflow script, demo corridor seeds |
| 12 | Future scope | ⬜ later | Multi-division network scaling, live ISRO-RTIS WebSocket feeds |

Legend: ✅ done · 🟡 mostly done / ready · 🔵 in progress · ⬜ not started

---

## What is built

- **Engine** — seeded native-schema feeds (COA, FOIS, TMS, SMMS, TDMS), normaliser onto digital corridor graph with signals twin, Weibull + logistic risk models, ARCI with bootstrap confidence bands, occupancy and headway windows, delay model, **exact MILP solver (HiGHS WebAssembly) with simulated-annealing polish**, weather-aware constraints (fog, rain, rail temp), anomaly detection, decentralised FIFO baseline, weekly / 30-day / 26-week horizons, caution orders (T/409, T/409B, T/351), advisories, ROI, copilot, BDMS export. Runs in a Web Worker. Block ids are content-stable across re-plans.
- **Foundation** — zustand store with versioned persistence, cross-tab event bus (`crossTab.ts`) for multi-role live demos, service worker notifications (`sw-notify.js`), first-class data issue status with 5 standard codes, 8 portals with roles (including ADEN, JE, Gang In-charge, Loco Pilot), invite-code protected field self-signup, demo accounts, EN/HI + 8 citizen languages, deck palette with light / dark / sunlight themes, shell with sidebar / top bar / mobile bar, PWA install, driver.js tour, Ctrl+K palette, notifications.
- **Pages & Components** — 8-step interactive operational `WorkflowPage`, Planning 13, Control 11, each department 9, Division 9, Field 5, Citizen 3 tabs plus train and station pages, public 4. All computed from the plan; zero stub text. Native CSV/JSON register importer, geo-triage auto-severity preview, `SafetyBanner`, `SolverStamp`, `ConflictsPanel`, `SupersededList`.

## Session log

- **2026-09-12** — **SIH 2026 PS 26027 & Presentation Deck Compliance Round**:
  - Audited prototype against `SIH2026-FINAL-PPT.pdf` and recorded findings in `docs/PPT-COMPLIANCE.md`.
  - Implemented exact MILP solver using **HiGHS WebAssembly** (`src/engine/milp.js`, `highsLoader.ts`, `docs/MILP-FORMULATION.md`) as the primary construction phase with simulated annealing polish, proving optimality gaps on IR corridors.
  - Added Digital Twin signals, points, track circuits, and LC gates table (`src/engine/corridors.js`) with gear-id and mast resolution (`tests/twin.test.js`).
  - Added weather engine (`src/engine/weather.js`) with regional seasonal seeds and Open-Meteo integration; constraints enforce fog speed caps and extreme heat buckling rules.
  - Implemented anomaly detection (`src/engine/anomaly.js`) identifying speed restriction clusters and repeat component failures.
  - Added native CSV/JSON import adapters (`src/engine/importer.js`) with strict schema validation and 5 rejection codes.
  - Created 8-step live operational `WorkflowPage.tsx` demonstrating end-to-end PS 26027 workflow with direct deep links.
  - Added cross-tab synchronization bus (`src/features/bus/crossTab.ts`) and device notification service worker (`public/sw-notify.js`).
  - Implemented rule-based geo-triage auto-severity scoring and factor explanations in `src/pages/field/FieldReportPage.tsx` and `src/lib/triage.ts`.
  - Expanded automated test suite from 18 to **67 passing tests** (`npm test`), verifying safety invariants, MILP optimality, store workflows, and digital twin mappings.
  - Verified clean TypeScript build (`0` errors), clean automated honesty audit (41 files), clean WCAG AA contrast check, and production PWA bundle.

- **2026-09-11** — Foundation, engine port, spec and contract committed (`67c0b49`, `3554d9c`, `2f1bf02`). All portal pages built and honesty audit applied (`aba3e29`). Complete build plan (`docs/BUILD-PLAN.md`) created. Issues 2–7 resolved:
  - Restricted self sign-up to field roles (`GANG_INCHARGE`, `LOCO_PILOT`) requiring invite code (`FIELD2026`).
  - Added `fixedBlocks` solver constraint support to `scheduler.js`, `horizons.js`, `worker.ts`, and `ReplanPage.tsx`.
  - Added `groupId` and `targetBlock` co-location engine binding and `acceptJointBlock` action in store and `WeeklyPlanPage.tsx`.
  - Added first-class `dataIssueStatus` to store state and hooked into `IntegrationPage.tsx`.
  - Localized requisition validation errors in `src/engine/intake.js` (EN + HI).
  - Created automated honesty audit (`npm run check-honesty`) and WCAG contrast check (`npm run check-contrast`).
  - Added `tests/workflow.test.js`: 18/18 tests passing, clean typecheck, clean build.

## Next actions

1. Review and commit the compliance and enhancement round files in clean atomic feature commits.
2. Conduct browser QA on the new `WorkflowPage`, HiGHS solver stamp, and cross-tab multi-role demo flow.
3. Deploy to production (Vercel / Netlify) to update the demo link for presentation rehearsals.
