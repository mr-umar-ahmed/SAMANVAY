# SAMANVAY · समन्वय — Integrated block planning for Indian Railways

**Smart India Hackathon 2026 · Problem Statement 26027 · Ministry of Railways**

*Samanvay* means coordination. Today Civil (TMS), Signal & Telecom (SMMS) and Traction (TDMS) each ask the Control Office for line blocks on their own, by hand, through BDMS. SAMANVAY reads all three registers together with the COA working timetable and the FOIS goods forecast, scores every pending job for risk (ARCI), and lays the fewest possible possessions into the natural gaps of the timetable — bundling departments into one block wherever they touch the same piece of railway — for the next week, the next month and the 26-week Rolling Block Programme. The Section Controller keeps the final word.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build with the PWA service worker
npm test             # engine tests (node --test)
npm run typecheck
```

No backend. The planning engine runs in a Web Worker on your device; accounts live in the browser; feeds are synthetic data in the native schema of each source system (there is no public access to CRIS). Everything on screen is computed from those feeds or recorded by a user action — the app labels what is simulated and what is an assumption.

## Portals and demo accounts

Password for every demo account: `samanvay`.

| Portal | Who | Demo account |
|---|---|---|
| Control Office (COA) | Section Controller / Chief Controller | `sc.mtj@ir.demo`, `chc@ir.demo` |
| Block Planning Cell | Block planner | `planner@ir.demo` |
| Civil Engineering (TMS) | Sr. DEN, SSE/P-Way | `srden@ir.demo`, `sse.pway@ir.demo` |
| Signal & Telecom (SMMS) | Sr. DSTE, SSE/Signal | `srdste@ir.demo`, `sse.sig@ir.demo` |
| Traction Distribution (TDMS) | Sr. DEE, SSE/TRD | `srdee@ir.demo`, `sse.trd@ir.demo` |
| Divisional Management | DRM, administrator | `drm@ir.demo`, `admin@ir.demo` |
| Field staff (mobile) | Gang in-charge, loco pilot | `gang4@ir.demo`, `lp@ir.demo` |
| Passengers & citizens (mobile, public) | anyone | no sign-in — `/citizen` |

The app is installable (PWA): use the browser's install prompt or the "Install app" button.

## What is real

| Layer | Implementation |
|---|---|
| Integration | Five feeds generated in their native schemas (COA WTT, FOIS forecast, TMS, SMMS, TDMS) from a seeded RNG, normalised onto one corridor graph — block sections × running lines × OHE elementary sections. Data-quality issues are raised, not hidden. |
| Learning | Weibull survival models fitted per asset class (censored MLE); logistic escalation predictor with held-out metrics; duration calibration from the execution log. |
| Prioritisation | ARCI = √safety × (0.30·P_f′ + 0.25·ODI + 0.25·overdue + 0.20·E_ml) + TSR uplift, mandatory floor for USFD-IMR and interlocking work. Every score is explained term by term. |
| Corridor model | Day-by-day occupancy per (section, line) from the timetable and the goods forecast; headway gaps; a delay-propagation model (single-line working, holding, regulation); premium paths protected. |
| Optimisation | Greedy construction in ARCI order + simulated annealing; hard rules: JPO 6-hour ceiling, possessions per day, concurrency, machine and gang capacity with travel, incompatible work pairs. A CP-SAT (OR-Tools) formulation of the same problem is documented in the earlier build. |
| Horizons | Weekly tactical plan · 30-day plan with capital works · 26-week Rolling Block Programme with the 10-week JPO notice check and a Weibull workload forecast. |
| Evidence | A simulated decentralised baseline (FIFO per department) on the same data, so every KPI delta is computed, not asserted. |
| Workflow | Requisition → validation → plan → concurrence → grant (with change) → lock → caution orders (T/409, T/409B) and disconnection notices (T/351) → execution log → duration recalibration. Citizen and field hazard reports are triaged into works. Every action is audited. |

## Repository

```
src/engine/          planning engine (JS, isomorphic) + worker bridge + typed selectors
src/store/           app state (zustand, persisted)
src/auth/            portals, roles, capabilities, demo accounts, browser-local sign-up
src/app/             shell, navigation, routing guards
src/pages/           one folder per portal
src/components/      ui kit, charts, domain drawers (block / task / report), Gantt, string diagram, map
src/features/        preloader, tour, command palette, notifications, PWA install
src/i18n/            English + Hindi app-wide, eight languages in the citizen portal
docs/                v4-spec.md (page spec) · CONTRACT.md (implementation contract)
tests/               engine tests
```

## Honesty notes

Feeds are synthetic but shaped like the real systems and calibrated against public manuals; they are deterministic for a given seed. Rupee figures come from labelled, editable assumptions. Figures from the pitch deck appear only on the "How it works" page, marked as target / literature. Train positions are derived from the timetable, not GPS.
