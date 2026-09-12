# SAMANVAY v4 — User Guide & Problem-Solving Reference

> **AI-Powered Automatic Block Planning to Maximize Asset Availability for Train Operations on Indian Railways**  
> *Smart India Hackathon 2026 — Problem Statement 26027*

---

## 1. Executive Summary: Is SAMANVAY Completed?

**Yes, the prototype is complete, fully demonstrable, and rigorously tested.**

- **PS 26027 Coverage:** 100% compliant with the requirements of unifying maintenance across departments, predictive risk scoring (ARCI), automated timetable conflict minimization, joint possession co-location, human-in-the-loop dispatch, and safe digital execution.
- **Deck Alignment:** Every slide promise from `SIH2026-FINAL-PPT.pdf` has been implemented in code (audited in [`docs/PPT-COMPLIANCE.md`](PPT-COMPLIANCE.md)).
- **Verification Metrics:**
  - **67 / 67 automated tests passing** across engine safety, exact MILP optimality, store workflows, and digital twin mappings.
  - **0 TypeScript compilation errors** (`tsc --noEmit`).
  - **Zero-Fabrication Honesty Audit:** 41 scanned pages confirmed free of uncomputed or hardcoded fake telemetry.
  - **WCAG 2.1 AA Contrast:** All color token pairs verified across **Light**, **Dark**, and high-glare **Sunlight** themes.
  - **Production PWA:** Bundled with service workers, WebAssembly solvers, and offline IndexedDB support.

---

## 2. Problem-to-Feature Matrix (What Solves What?)

| # | Indian Railways Problem | Traditional Consequence | SAMANVAY Feature & Solution | Where to See It |
|---|---|---|---|---|
| **1** | **Departmental Silos**<br>(Civil / TMS, S&T / SMMS, Electrical / TDMS operate independently) | Multiple separate line closures in the same section on consecutive days, killing section throughput | **Unified Normalizer & Joint Shadow Blocks**<br>Normalizes native schemas onto one corridor graph. When one department requires a line closure, the engine automatically clusters co-located works into one shared possession. | `Planning → Weekly Plan`<br>`Control → Board`<br>`Workflow → Step 1 & 4` |
| **2** | **Subjective / Reactive Maintenance Prioritization** | Critical track flaws (e.g. USFD IMR) wait while low-urgency routine jobs get priority | **Asset Reliability & Criticality Index (ARCI)**<br>Weibull hazard rate + logistic escalation model + traffic density + TSR impact + overdue days. Mandatory safety works enforce a hard floor that the solver cannot defer. | `Planning → Risk & Priority`<br>`SafetyBanner`<br>`PlanExplain` |
| **3** | **Heuristic Bottlenecks & Capacity Waste** | Manual controllers fit maintenance into arbitrary gaps, resulting in train delays or refused blocks | **Exact MILP Optimization (HiGHS WebAssembly)**<br>Exact branch-and-cut optimization solving multi-objective scheduling against timetables, freight paths, machine travel, and gang capacities, with proven optimality gaps (0.3%–5.9%). | `Planning → Optimiser Studio`<br>`SolverStamp`<br>[`docs/MILP-FORMULATION.md`](MILP-FORMULATION.md) |
| **4** | **Human Dispatch Authority & Fear of "AI Overrides"** | Controllers reject black-box automation that takes away operational safety authority | **Human-in-the-Loop JPO Governance**<br>The AI proposes, but never auto-grants. Propose → Department Concurrence → Section Controller Grant / Grant with Change / Refuse → D+1 Lock. | `Control → Board`<br>`Planning → Handoff`<br>`BlockDrawer` |
| **5** | **Ad-hoc Re-planning when Disruptions Occur** | Sudden machine breakdown or emergency TSR causes chaotic cascading cancellations | **Solver-Constrained Re-Planning with Fixed Blocks**<br>Already started, locked, or concurred blocks are held fixed (`fixedBlocks`); the solver dynamically re-optimizes remaining slots without disturbing ongoing site work. | `Control → Re-plan`<br>`SupersededList` |
| **6** | **Weather & Seasonal Risks**<br>(Dense winter fog, extreme summer rail buckling) | Track work during 50°C+ rail temperatures causes rail fractures; work in fog causes collision risks | **Weather-Aware Planning Constraints**<br>Ingests regional seasonal models + live Open-Meteo. Automatically applies fog speed caps and forbids rail replacement/welding when rail temperature exceeds 60°C. | `Integration → Weather`<br>`Optimiser Studio` |
| **7** | **Safety Communication Gaps in the Field** | Verbal phone instructions lead to misunderstanding speed restrictions; loco pilots miss paper caution orders | **Digital T/409, T/409B & T/351 Caution Orders**<br>Content-stable caution order generation directly from scheduled blocks and TSRs. Loco pilots view and acknowledge cautions digitally on tablet. | `Control → Caution & TSR`<br>`Field → Cautions`<br>`Citizen → Advisories` |
| **8** | **Hazard Reporting Lag by Public & Patrolmen** | Citizens and trackmen see track defects (broken fasteners, cattle on track) but have no fast channel | **Geo-Tagged Citizen & Field Triage**<br>Camera capture + GPS snapped to corridor chainage. Rule-based natural language categorization + automatic severity scoring (`low`/`medium`/`high`). | `Citizen → Report`<br>`Field → Report`<br>`Incident loop` |
| **9** | **Dirty / Inconsistent Legacy Data** | Mismatched station codes, chainages out of bounds, duplicate defect registrations | **Data Quality Shield & Import Adapters**<br>CSV/JSON import engine with strict schema validators, anomaly detection (TSR bunching), and 5 standard rejection codes with suggested fixes. | `Integration → Data Quality & Import`<br>`Anomaly cards` |
| **10** | **Multi-Role Live Demonstration Friction** | Presenting to SIH judges usually requires switching users on one screen or re-logging constantly | **Cross-Tab Live Event Bus**<br>`BroadcastChannel` synchronizes state instantaneously across browser tabs. Open Controller in Tab 1 and Gang in Tab 2 to watch actions update in real time. | `src/features/bus/crossTab.ts`<br>All live pages |

---

## 3. Walkthrough of the 8 User Portals

### 1. Planning Cell Portal (`/app/planning`)
- **Who uses it:** Senior Divisional Operations Manager (Sr. DOM), Chief Block Planner.
- **Key Pages:**
  - `Overview`: Flagship availability gauges, headcount, weekly block count, and asset health status.
  - `Demands`: Ingestion of department work requisitions with accept/return workflows.
  - `Risk & Priority`: ARCI breakdown, ML term weights, explainability cards, and mandatory safety floor.
  - `Weekly Plan`: Interactive weekly Gantt chart showing line closures, disconnections, and joint blocks.
  - `Optimiser Studio`: Tune weights (delay vs. downtime vs. co-location), choose solver (Exact MILP vs. Simulated Annealing), inspect optimality gaps, and promote candidate plans.
  - `Handoff`: Official handoff matrix sending approved weekly packages to Section Controllers.

### 2. Section Control Portal (`/app/control`)
- **Who uses it:** Chief Controller, Section Controller (SC).
- **Key Pages:**
  - `Control Board`: Live 24-hour string diagram (time-distance graph) showing train paths, scheduled possessions, and real-time grant/refuse actions.
  - `Re-plan`: Dynamic disruption recovery (e.g. machine breakdown). Automatically holds locked/active blocks fixed while re-optimizing the corridor.
  - `Caution & TSR`: Generation, printing, and digital dispatch of official T/409, T/409B, and T/351 caution orders.
  - `Incidents`: Immediate imposition of emergency speed restrictions from field reports.

### 3. Department Portals (`/app/tms` Civil, `/app/smms` S&T, `/app/tdms` Electrical)
- **Who uses it:** Sr. DEN (Civil), Sr. DSTE (Signaling), Sr. DEE (Traction/TRD), ADEN, and Junior Engineers (JE).
- **Key Pages:**
  - `Today`: Operational checklist for today's possessions; track power isolation and S&T disconnection notices.
  - `Register`: Department asset register with automatic location resolution (masts, chainage, signal IDs).
  - `Requisitions`: Draft and submit formal BDMS-style block requisitions.
  - `Concurrence`: Official multi-departmental concurrence or objection on proposed joint blocks.

### 4. Field Portal (`/app/field`)
- **Who uses it:** Permanent Way Gang In-charges, Track Maintainers, Keymen, Loco Pilots.
- **Key Pages & Features:**
  - **Mobile-First & Sunlight Theme:** High-contrast design specifically readable outdoors in bright sunlight.
  - `Today`: Digital possession card with one-touch **Start Possession**, **Checklist Item Done**, and **Clear Possession** with track-fit certifications.
  - `Cautions`: Loco pilot dashboard displaying applicable caution orders for the selected train, with digital acknowledgement.
  - `Report`: Quick defect reporting with camera capture and offline GPS chainage snapping.

### 5. Citizen Portal (`/citizen`)
- **Who uses it:** Train passengers and the general public (no login required).
- **Key Pages & Features:**
  - **8 Indian Languages:** English, Hindi, Bengali, Marathi, Gujarati, Tamil, Telugu, Kannada.
  - `Home & Train Search`: Real-time passenger advisories computed from granted maintenance blocks ("Train 12004 regulated by 12 mins at Aligarh Jn").
  - `Report Track Hazard`: Public safety portal allowing citizens to submit photos and GPS locations of track obstructions, immediately alerting Section Control.

### 6. Division Leadership Portal (`/app/division`)
- **Who uses it:** Divisional Railway Manager (DRM), Additional DRM (ADRM).
- **Key Pages:**
  - `Division Brief`: Executive overview of section throughput, safety compliance, and departmental performance.
  - `Approvals`: DRM sign-off for 30-day and 26-week Rolling Block Programmes (RBP).
  - `ROI & Value Audit`: Transparent financial audit showing ₹ savings from reduced train delay, diesel idling avoidance, and machine utilization efficiency.

### 7. Interactive Workflow Showcase (`/app/workflow`)
- **Who uses it:** SIH Judges, Senior Railway Officials, Trainees.
- **What it does:** Directly mirrors **Slide 2** of the competition deck ("Click to explore the complete operational workflow"). Takes the user step-by-step through the 8 stages of modern railway block planning with live links to each screen.

### 8. Integration & Data Hub (`/app/integration`)
- **Who uses it:** System Administrators, CRIS Data Integrators.
- **What it does:** CSV/JSON file import adapters, Digital Twin signals & mast lookup, weather forecast controls, anomaly detection radar, and raw data quality issue resolution.

---

## 4. How to Demo SAMANVAY in 3 Minutes (SIH Pitch Script)

1. **Step 1: Unified Ingestion & Digital Twin (0:00 - 0:45)**
   - Open `/app/workflow` to show the 8-step lifecycle.
   - Navigate to `/app/integration` and show how TMS (track), SMMS (signals), and TDMS (OHE) feeds are normalized onto the corridor track graph with signal and mast twin resolution.
   - Point out the **Anomaly Detection** card showing TSR clustering.
2. **Step 2: ARCI & Exact MILP Optimization (0:45 - 1:30)**
   - Navigate to `/app/planning/risk` and show the **ARCI risk score** and the **Safety Banner** proving mandatory works cannot be skipped.
   - Open `/app/planning/optimiser` and show the **Solver Stamp**: HiGHS WebAssembly MILP ran with a proven optimality gap (e.g. 1.3%), placing 73.5% of works in **Joint Shadow Blocks**.
3. **Step 3: Human Controller Authority & JPO Handoff (1:30 - 2:15)**
   - Open `/app/planning/handoff` and click **"Send Week to Control"**.
   - Switch to `/app/control/board` (or open in a second tab using the live cross-tab sync) to show the Section Controller granting the block.
   - Show the **Grant with Change** drawer and **Caution Order T/409B** generation.
4. **Step 4: Field Execution & Citizen Advisories (2:15 - 3:00)**
   - Switch to `/app/field/today` in **Sunlight Theme**: show the gang in-charge starting possession and completing items.
   - Switch to `/citizen` in Hindi or Tamil: show the passenger advisory automatically generated from the granted block.
   - End on `/app/division/roi`: show the computed monetary ROI (delay reduction + asset uptime).
