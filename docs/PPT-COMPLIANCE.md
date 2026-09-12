# SAMANVAY — PS 26027 and deck compliance

Audit of the prototype against **SIH 2026 PS 26027** ("AI-Powered Automatic Block Planning to Maximize Asset Availability for Train Operations on Indian Railways") and every promise in the team deck `SIH2026-FINAL-PPT.pdf` (6 slides, team Code Sapiens). Each row was checked by reading the code, not the comments.

**Date of audit:** 2026-09-12 · **Branch:** `rebuild-v4` · **Prototype link on the deck:** https://samanvay-swart.vercel.app/ (points to an older deployment — redeploy this branch before submission)

Verdicts: ✅ delivered · 🟡 partial · ❌ not delivered · 🛠 being fixed in this round · 📝 deck wording should change

---

## 1. Does the prototype solve PS 26027?

The problem statement asks for automatic block planning that raises asset availability by coordinating departmental maintenance with train operations. The prototype's core loop does this:

| PS need | How SAMANVAY answers it | Verdict |
|---|---|---|
| One planning view across Civil (TMS), S&T (SMMS) and Electrical (TDMS) | Seeded native-schema registers from all three plus COA timetable and FOIS freight are normalised onto one corridor and ranked together | ✅ (data is seeded — see §3) |
| Prioritise what matters | ARCI: Weibull failure probability, condition, traffic density, TSR impact, overdue days, escalation model; mandatory safety floor | ✅ |
| Fit maintenance into traffic gaps automatically | Free headway windows from the timetable and freight paths; optimiser places works in them against rules | ✅ |
| Fewer, better closures (co-location) | Joint blocks: works of different departments on the same section and window share one possession | ✅ |
| Keep the controller in charge | Propose → department concurrence → Section Controller grant / grant with change / refuse → lock | ✅ with a serious bug: approvals were lost on re-plan 🛠 |
| Safe execution | Caution orders (T/409, T/409B, T/351), power-block records, field Start / Done / Clear, loco-pilot acknowledgement | ✅ |
| Measurable availability gain | KPIs computed against a simulated decentralised baseline, same seed | ✅ (numbers differ from the deck — see §4) |

**Blocking defects found and being fixed:** approvals lost when the plan re-runs; mandatory safety work could land after its due date without warning when efficiency weights were raised; requisition details (duration, preferred window, dependencies) dropped before planning; works leaking across corridors; caution-order numbers changing between re-plans.

---

## 2. Slide-by-slide promises

### Slide 2 — Solution, workflow wheel, innovation, why we stand out

| Promise | Verdict | Evidence / action |
|---|---|---|
| Unified Maintenance Intelligence (TMS, SMMS, TDMS, COA) | ✅ seeded | `src/engine/dataFactory.js`, `normalizer.js`, Integration page |
| Predictive Risk Prioritization (ARCI) | ✅ | `src/engine/riskEngine.js` — terms, weights and model cards on the Risk page |
| AI Block Optimization — "CP-SAT fits maintenance into traffic gaps" | ❌ → 🛠 | Only greedy + simulated annealing existed. Adding an exact MILP solver (HiGHS, WebAssembly, in the browser worker) with SA as polish and fallback; formulation in `docs/MILP-FORMULATION.md`. 📝 Say "exact MILP (HiGHS) in the prototype; OR-Tools CP-SAT in production". |
| Joint Shadow Blocks | ✅ | Co-location in `scheduler.js`; department joint-block suggestions and accept |
| Human-Controlled Dispatch | ✅ | Control board grant / change / refuse; nothing auto-granted |
| Wheel 1 — Asset data | ✅ seeded | Registers per department |
| Wheel 2 — Spatial mapping (digital corridor graph) | 🟡 → 🛠 | No signal locations existed and the "twin" was a table. Adding signals, points, track circuits and LC gates, gear-id and mast resolution, and a visible corridor twin |
| Wheel 3 — Risk scoring (ARCI) | ✅ | |
| Wheel 4 — Gap prediction | 🟡 → 🛠 | Deterministic gaps only. Adding window reliability under train lateness |
| Wheel 5 — Block optimisation (multi-objective) | 🟡 → 🛠 | See CP-SAT row |
| Wheel 6 — Controller approval | ✅ | |
| Wheel 7 — T/409B dispatch | ✅ with numbering bug 🛠 | Order numbers now stable; T/409B only for granted blocks |
| Wheel 8 — Execution & feedback | 🟡 → 🛠 | Adding extension requests, overrun alerts, visible site messages; durations recalibrate from outcomes |
| "Click to explore the complete operational workflow" | 🟡 → 🛠 | Adding an 8-step workflow page, each step linked to the live screen |
| Innovation — Digital Twin Corridor Graph | 🟡 → 🛠 | As wheel 2 |
| Innovation — ARCI | ✅ | |
| Innovation — Multi-Objective Constraint Solver | ❌ → 🛠 | As CP-SAT row |
| Innovation — Multi-Horizon Orchestration | 🟡 | 26-week RBP, 30-day and 7-day plans and real-time re-plan exist; the horizons are not nested into each other yet |
| Innovation — Adaptive Disruption Recovery | 🟡 → 🛠 | Re-plan with locked/started blocks fixed exists; fixes to keep all approved blocks fixed on every run |
| Why we stand out — One corridor, three departments | ✅ | |
| Why we stand out — Safety before optimisation | 🟡 → 🛠 | Mandatory works now hard-constrained to their due day; explicit safety conflicts shown |
| Why we stand out — One block, multiple jobs | ✅ | |
| Why we stand out — AI proposes, controller approves | ✅ | |

### Slide 3 — Technical approach (architecture)

The slide shows the production architecture. The prototype is a client-side build (engine in a Web Worker, state in the browser). Rows below say what exists in the prototype.

| Element | Verdict | Note |
|---|---|---|
| Tier 1 ingestion from TMS / SMMS / TDMS / O&A | 🟡 → 🛠 | Seeded feeds; adding CSV/JSON import adapters with schema validation and templates |
| Real-time streams & event bus | ❌ | Not in a browser-only build; cross-tab sync being added for multi-role demos. 📝 Mark as production architecture |
| Data validation & normalisation, entity matching | 🟡 → 🛠 | Adding real rejects, duplicate detection and issue codes |
| Tier 2 ML models (predictive maintenance, failure risk) | ✅ | Weibull MLE + logistic escalation model with held-out metrics |
| Tier 2 OR-Tools solver | ❌ → 🛠 | Exact MILP (HiGHS) being added; 📝 wording |
| Tier 2 optimisation engine (minimal TSR impact) | ✅ | TSR cost terms in the objective |
| Tier 2 continuous learning | 🟡 | Durations recalibrate from execution records; risk models refit each run on seeded history |
| Tier 3 automated block orders from TMS/BDMS | 🟡 | BDMS-format export; 📝 say "BDMS-format demand export" |
| Tier 3 24-hour planning dashboard | ✅ | Control board string chart |
| Tier 3 live train tracking hub | 🟡 | Timetable-derived positions, labelled; 📝 say "timetable-derived tracking" |
| Tier 3 live disruption alerts & rerouting insights | 🟡 | Alerts yes; rerouting = regulation / single-line working only. 📝 wording |
| Users: field engineer, section controller, maintenance depts, supervisor/AE/JE, division | 🟡 → 🛠 | Adding ADEN and JE roles |
| Access (SSO / RBAC) | 🟡 | RBAC yes; SSO no (browser-local demo accounts, labelled) |
| Web dashboard + mobile app | ✅ | Installable PWA; field and citizen portals mobile-first |
| AI assistant (query, block suggestions, status, reports) | 🟡 → 🛠 | Rule-based copilot; adding block suggestion, status lookup and daily report |
| Data sources: weather | ❌ → 🛠 | Adding a seeded weather feed with fog / rain / heat effects and an optional live Open-Meteo fetch |
| Data sources: geo-spatial | 🟡 | OpenStreetMap corridor map with schematic fallback |
| AI/ML modules: risk scoring, due prediction, constraint solver, optimisation, anomaly detection, scenario simulation | 🟡 → 🛠 | Anomaly detection being added; constraint solver being added |
| Notifications: SMS / email / in-app / dashboard | 🟡 → 🛠 | In-app + device notifications; no SMS gateway. 📝 wording |
| Visualisation: network view, corridor view, asset layers | 🟡 | Corridor map; asset layers exist in the component but are not switchable yet |
| Databases (PostgreSQL, PostGIS, data lake, model store) | ❌ | Browser storage in the prototype, labelled. 📝 production architecture |
| Infrastructure (Docker, Kubernetes, Grafana, auto scaling, backup) | ❌ | Not applicable to the prototype. 📝 production architecture |
| Audit logs, access control | ✅ | Audit trail on every workflow action |

### Slide 4 — Feasibility, viability, practical implementation, challenges, strategies

| Promise | Verdict | Note |
|---|---|---|
| Economic feasibility — existing data ecosystems via adapters | 🟡 → 🛠 | Import adapters being added |
| Proven optimisation technology (AI/ML, OR-Tools, CP-SAT, survival analysis) | 🟡 → 🛠 | Survival analysis ✅; exact MILP being added |
| Software-first deployment | ✅ | No hardware; runs in a browser |
| Operational feasibility — authority stays with the Section Controller | ✅ | |
| Viability: higher availability, reduced downtime, more co-location, lower disruption | ✅ computed | See §4 for the real numbers |
| Scalable across divisions | 🟡 | Four corridors in four zones; one at a time |
| User viability incl. citizens and loco pilots (geo-tagged images) | ✅ | Citizen and field reports with photo + GPS snapped to chainage; 📝 "AI scanner" → "rule-based geo-triage" |
| Implementation step 1 — read existing data via APIs | 🟡 → 🛠 | Import adapters |
| Step 2 — normalise corridor references | 🟡 → 🛠 | Twin work above |
| Step 3 — deploy MOCBSP (CP-SAT) | ❌ → 🛠 | Exact MILP |
| Step 4 — controller validation in 24-hour string chart | ✅ | |
| Step 5 — generate T/409B and notifications | ✅ | |
| Step 6 — expand division by division | 🟡 | Corridor selector |
| Challenge/strategy 1 — API integration & normalisation | 🟡 → 🛠 | |
| Challenge/strategy 2 — real-time conflict detection & rapid re-optimisation | 🟡 → 🛠 | Adding a consolidated conflicts view and double-booking checks |
| Challenge/strategy 3 — explainable AI with confidence levels and reasoning | 🟡 → 🛠 | Reasoning ✅; adding block confidence (completion and window reliability) and ARCI uncertainty bands |
| Challenge/strategy 4 — phased rollout, rapid re-planning | ✅ | |

### Slide 5 — Impact, stakeholders, promise

| Promise | Verdict | Note |
|---|---|---|
| Economic / social / environmental benefits | ✅ computed | KPIs and ROI lines from the plan and editable assumptions |
| Maintenance departments: Civil, S&T, Electrical **and C&A** | 🟡 | Three departments are modelled; C&A (coaching & assets) is not. 📝 remove C&A or mark as future scope |
| Departments submit via BDMS with condition, urgency, preferred windows, inter-dependencies | 🟡 → 🛠 | Preferred window, duration, machine, block type, "needs power block / disconnection", "depends on / must share block with" now used by the planner |
| SAMANVAY AI outputs: feasible options, joint plan, risk & impact, recommendations with alternatives | 🟡 → 🛠 | Adding up to three ranked alternative windows per block |
| Planning & control: review, analyse conflicts & dependencies, finalise, issue caution orders | 🟡 → 🛠 | Conflicts view |
| Operations: implement, coordinate, monitor, update live status, manage deviations | 🟡 → 🛠 | Extension requests and overrun alerts |
| Network & passengers: predictable journeys | ✅ | Citizen advisories in 8 languages from granted blocks |
| "Our promise" figures +18.8 % / 96.2 % / −51.9 % labelled "simulation-based impact metrics from the current prototype model" | ❌ 📝 | The prototype does not compute these values — see §4 |

### Slide 6 — Research and references

Research slide; no product promises beyond those above. The XGBoost freight-forecast item is secondary research — the prototype uses a seeded FOIS forecast, not an XGBoost model. 📝 keep it under "research", not "features".

---

## 3. What is simulated (say this to judges)

All feeds (COA timetable, FOIS forecast, TMS / SMMS / TDMS registers, machines, gangs, failure and execution history) are seeded native-schema data for four corridors. Every number on screen is computed from them by the engine in the browser, with the seed shown. Accounts are browser-local. There is no live link to CRIS systems.

---

## 4. The three headline figures

The deck's "Our promise" box says the figures are "projected / simulation-based impact metrics from the current prototype model". The prototype computes, on the default seed 26027 (weekly plan vs simulated decentralised baseline, same seed and data):

**Before this round** (greedy + simulated annealing, 2026-09-12 morning)

| Deck figure | Metric as defined in the app | NDLS–CNB | MMCT–ADI | SBC–JTJ | HWH–ASN |
|---|---|---|---|---|---|
| +18.8 % asset uptime | relative change in corridor availability | +0.53 % | +0.42 % | +0.39 % | +0.45 % |
| −51.9 % corridor downtime | change in section-line hours closed | −16.6 % | −12.7 % | −14.5 % | −19.9 % |
| 96.2 % multi-department co-location | share of line-closure works in a joint block | 55.9 % | 40.5 % | 38.9 % | 55.6 % |

**After this round** (exact MILP with HiGHS + simulated annealing polish, safety floor extended, weather applied)

| Metric | NDLS–CNB | MMCT–ADI | SBC–JTJ | HWH–ASN |
|---|---|---|---|---|
| Relative change in corridor availability | +1.09 % | +0.72 % | +0.57 % | +0.47 % |
| Section-line hours closed vs baseline | **−34.0 %** | −21.5 % | −21.4 % | −20.9 % |
| Line-closure works in a joint block | **73.5 %** | 62.2 % | 44.4 % | 61.1 % |
| Possessions (baseline → plan) | 32 → 18 | 35 → 24 | 18 → 13 | 18 → 13 |
| Mandatory safety works on or before due day (plan vs baseline) | 9/9 vs 5/9 | 12/12 vs 7/12 | 8/8 vs 4/8 | 6/6 vs 4/6 |
| Class-weighted train delay, minutes (baseline → plan) | 251 → 207 | 201 → 109 | 90 → 40 | 133 → 41 |
| MILP optimality gap reported by HiGHS | 1.6 % | 5.9 % | 5.4 % | 0.3 % |

Measured in Node with the same engine the browser runs (`solver: 'milp'`, 6 s HiGHS time limit). Results vary by a few percent between runs because the solve is time-limited.

**Recommendation:** the prototype does not produce +18.8 %, −51.9 % or 96.2 %. Replace the three figures on slides 4 and 5 with the values the app shows on its Method page at submission time (for example "up to 34 % fewer closed section-line hours, up to 74 % of closure works in joint blocks, every mandatory safety work on time vs 50–60 % in the simulated baseline"), or relabel the deck figures "targets from literature" — do not present them as prototype output. "Asset uptime" is not a metric the app computes; if the team wants it, define it first (for example share of assets without a speed restriction) and add it to `kpi.js`.

---

## 5. Work in this round

Tracked in [`PROGRESS.md`](../PROGRESS.md). Engine core (safety, fixed blocks, requisitions, alternatives, confidence) · data layer (signals twin, import adapters, weather, anomaly detection, bad-data tests, corridor-relative scenarios) · exact MILP solver (HiGHS) · store and workflow (approvals across re-plans, propose enforcement, lock notices, extensions, messages, acknowledgements, stable caution numbers, conflicts, triage severity, cross-tab sync, device notifications, ADEN/JE roles) · UI for all of the above.
