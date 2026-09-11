# SAMANVAY — progress

Live tracker for [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md). Updated at the end of every work session and whenever a phase item changes.

**Branch:** `rebuild-v4` (local; not yet pushed to GitHub)
**Last updated:** 2026-09-11
**Health:** typecheck clean · 15/15 engine tests pass · production build OK

---

## Phase status

| # | Phase | Status | Notes |
|---|---|---|---|
| 0 | Framing and contracts | ✅ done | `docs/v4-spec.md`, `docs/CONTRACT.md`, this plan |
| 1 | Planning engine | ✅ done | `fixedBlocks` solver constraint & joint-block `groupId` implemented & tested |
| 2 | Foundation | ✅ done | Self sign-up restricted to field roles with invite code |
| 3 | Component kit and viz | ✅ done | |
| 4 | Portal pages | ✅ done | 8 portals, all routes built, EN+HI, tour anchors |
| 5 | End-to-end workflows | 🔵 in QA | Workflow tests passing; JPO loop verified up to "send week to Control" |
| 6 | Honesty audit | ✅ done | Automated honesty grep (`check-honesty.js`) & contrast test (`check-contrast.js`) |
| 7 | Language and accessibility | 🟡 mostly done | Intake messages bilingual (EN+HI); keyboard/SR pass pending |
| 8 | Mobile, PWA, citizen | 🟡 mostly done | Offline check and Lighthouse pending |
| 9 | Browser QA | 🔵 in progress | See QA checklist below |
| 10 | Build, tests, release hygiene | 🟡 partial | 18/18 tests passing, honesty/contrast scripts wired, lint clean |
| 11 | Demo and submission | ⬜ not started | Deploy, rehearse, record, deck screenshots |
| 12 | Future scope | ⬜ later | Only after Phase 11 |

Legend: ✅ done · 🟡 mostly done (gaps listed) · 🔵 in progress · ⬜ not started

---

## What is built

- **Engine** — seeded native-schema feeds (COA, FOIS, TMS, SMMS, TDMS), normaliser onto one corridor graph, Weibull + logistic risk models, ARCI, occupancy and headway windows, delay model, greedy + simulated-annealing scheduler with `fixedBlocks` constraint support, decentralised FIFO baseline, weekly / 30-day / 26-week horizons, caution orders (T/409, T/409B, T/351), advisories, ROI, copilot, BDMS export. Runs in a Web Worker. Block ids are content-stable across re-plans.
- **Foundation** — zustand store with versioned persistence (v3 migration) and first-class data issue status, 8 portals with roles and capabilities, invite-code protected field self-signup, 13 demo accounts (password `samanvay`), EN/HI + 8 citizen languages, deck palette with light / dark / sunlight themes, shell with sidebar / top bar / mobile bar, train video preloader, PWA install, driver.js tour per portal, Ctrl+K palette, notifications.
- **Pages** — screens in each portal's menu: Planning 13, Control 11, each department 9, Division 9, Field 5, Citizen 3 tabs plus train and station pages, public 4 (landing, login, sign-up, install). All computed from the plan; no stub text.

## Browser QA checklist

Tested in the in-app browser. ✔ = passed, ✖ = failed (see issues), blank = not yet run.

| Area | Check | Result |
|---|---|---|
| Citizen (375 px) | Home renders, language chips, first-visit tour | ✔ |
| Citizen (375 px) | Train search suggestions → train page | ✔ |
| Citizen | Station page, report with photo + GPS, my reports, install | |
| Planning (1100 px) | Overview tiles and KPIs | ✔ |
| Planning | Weekly Gantt renders (29 bars), legend readable | ✔ |
| Planning | Send week to Control → hand-off shows 29 awaiting concurrence | ✔ |
| Planning | Demands accept/return, risk explain/pin, optimiser run/promote, scenarios, adherence recalibrate, integration | |
| Departments | Concur / object as Sr DEN, Sr DSTE, Sr DEE | |
| Departments | Register → raise requisition; forms (TSR, T/351, power block); incidents | |
| Control | Grant / grant with change / refuse / lock D+1 as SC | |
| Control | Caution order issue + print; re-plan apply; incidents TSR | |
| Field | Gang Start / Done / Clear; LP acknowledge caution | |
| Citizen | Advisories appear after grant | |
| Division | Brief, approvals, escalations, ROI, admin, audit | |
| Cross-cutting | Dark and sunlight themes: all text visible | |
| Cross-cutting | Ctrl+K routes, notifications, tours on every portal | |

## Open issues

| # | Issue | Where | Status |
|---|---|---|---|
| 1 | Sidebar shows "22 blocks" (line closures only) while the week has 29 blocks (7 disconnection-only); the send toast says 29 | `src/app/AppShell.tsx` | ✅ fixed `8c709c7` |
| 2 | Any staff role, including DRM and System Administrator, can self-register | `src/pages/auth/SignupPage.tsx` | ✅ fixed |
| 3 | Re-plan keeps started/locked blocks by workflow status, not as a solver constraint (`fixedBlocks`) | `src/engine/scheduler.js`, `worker.ts`, `ReplanPage.tsx` | ✅ fixed |
| 4 | "Accept join" for joint-block suggestions has no engine support (`groupId`) | `src/engine/planner.js`, store, `WeeklyPlanPage.tsx` | ✅ fixed |
| 5 | Data-quality issue status is recorded in the audit trail only | store / `IntegrationPage` | ✅ fixed |
| 6 | Requisition validation messages are English-only | `src/engine/intake.js`, `DeptRegisterPage.tsx` | ✅ fixed |
| 7 | No automated honesty grep or theme contrast test | `scripts/check-honesty.js`, `scripts/check-contrast.js` | ✅ fixed |
| 8 | Top-bar title truncated at laptop widths | `src/app/shell.css` | ✅ fixed `8c709c7` |

## Session log

- **2026-09-11** — Foundation, engine port, spec and contract committed (`67c0b49`, `3554d9c`, `2f1bf02`). All portal pages built and honesty audit applied (`aba3e29`). Complete build plan (`docs/BUILD-PLAN.md`) created. Issues 2–7 resolved:
  - Restricted self sign-up to field roles (`GANG_INCHARGE`, `LOCO_PILOT`) requiring invite code (`FIELD2026`).
  - Added `fixedBlocks` solver constraint support to `scheduler.js`, `horizons.js`, `worker.ts`, and `ReplanPage.tsx`.
  - Added `groupId` and `targetBlock` co-location engine binding and `acceptJointBlock` action in store and `WeeklyPlanPage.tsx`.
  - Added first-class `dataIssueStatus` to store state and hooked into `IntegrationPage.tsx`.
  - Localized requisition validation errors in `src/engine/intake.js` (EN + HI).
  - Created automated honesty audit (`npm run check-honesty`) and WCAG contrast check (`npm run check-contrast`).
  - Added `tests/workflow.test.js`: 18/18 tests passing, clean typecheck, clean build.

## Next actions

1. Continue the JPO loop QA: concur as the three department officers → grant / grant with change / lock as Section Controller → issue and print caution orders → field Start / Done / Clear → loco pilot acknowledgement → citizen advisories.
2. Division pages QA, then themes (dark, sunlight) and 375 px pass on every portal.
3. Phase 11: deploy, rehearse the 3-minute demo, record a backup.
