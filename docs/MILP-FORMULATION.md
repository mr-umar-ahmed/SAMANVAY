# MILP construction for the weekly block plan

`src/engine/milp.js` builds a mixed-integer linear program (MILP) of the weekly possession plan. It solves the program with HiGHS 1.15.1, which runs as WebAssembly from the npm package `highs` 1.15.3, inside the planning worker. The scheduler exposes a `construct` hook in `planHorizon`, and the MILP plugs into it in place of greedy construction. Simulated annealing (SA) then polishes whichever plan is handed over, using the scheduler's own cost function.

This page covers what runs today, and what does not.

| | Status in this prototype |
|---|---|
| Exact MILP (branch-and-cut, proven bound and gap) | **Runs**: HiGHS WebAssembly, in the browser worker and in Node tests |
| Simulated annealing polish and fallback | **Runs**: `scheduler.js`, unchanged |
| OR-Tools CP-SAT | **Does not run here.** Section 9 describes the path to a server-side CP-SAT |

## 1. What the deck's "MOCBSP" maps to

MOCBSP stands for Multi-Objective Constraint-Based Scheduling Problem. In this prototype, it is:

- **Multi-objective**: one weighted sum. It uses the same terms and weights as the scheduler, which the user can tune in the studio: train delay, line downtime, block spread, co-location bonus, TSR loss while a work waits, risk (ARCI) while waiting, lateness past the due day, deferral, requisition preferences and the weather outdoor penalty. Because the MILP objective and the scheduler cost are equal for every plan the model can represent, the numbers can be compared directly.
- **Constraint-based**: the JPO and controller rules are hard constraints of the model, not penalties. These are:
  - premium paths
  - the 6 h block limit
  - blocks per day
  - simultaneous possessions
  - incompatible works
  - machine and gang capacity
  - requisition sequences and joint blocks
  - approved (fixed) blocks
  - mandatory works (safety)
- **Solver**: an exact MILP (HiGHS) takes the place of the deck's CP-SAT inside the browser. SA remains as a polish step and as the fallback.

## 2. Sets and parameters

All sets and parameters come from the object `planHorizon` passes to `construct`, so the model uses the scheduler's own inputs.

| Symbol | Meaning |
|---|---|
| `I` | Works (tasks) of the horizon. `I_L` holds line-closure works (`closure = 'LINE'`) and `I_N` holds disconnection works (`'NONE'`). |
| `K_i` | Candidate windows of work `i`, built by `candidatesFor`. Each window is `(day, line, start, end)`. Windows are pre-filtered, and each work keeps at most `maxCandidatesPerTask` (default 20), cheapest first. A window is dropped when:<ul><li>no unit or gang of the right type exists that day, or</li><li>it hits a premium path (unless `allowPremium` is on), or</li><li>it is longer than `rules.maxBlockMin`.</li></ul> |
| `P` | Possessions. Every kept line-closure window `(i,k)` is a potential possession with rectangle `R(i,k)` = (day, line `L`, block sections `S_i`, span `[start, end)`). Each group of approved closure works is one fixed possession, grouped as `formBlocks` would group them. |
| `c^place_ik` | Cost of placing work `i` in window `k`:<ul><li>`w.tsr·TSRloss_i·day + w.risk·ARCI_i·day/2`</li><li>`+ w.risk·ARCI_i·max(0, day − due_i)`</li><li>`+` the mandatory-late penalty</li><li>`+` the requisition preference</li><li>`+` the weather outdoor penalty</li></ul> |
| `c^defer_i` | `w.risk·ARCI_i·H + w.tsr·TSRloss_i·H`, plus the mandatory-deferred penalty. `H` is the number of horizon days. |
| `c^poss_P` | `w.delay·evaluateWindow(R_P).weightedDelay + w.downtime·span·|S|·(2 if both lines) + w.spread`. It is priced with `evaluateWindow` from `delayModel.js`, on the possession's own rectangle. |

## 3. Variables

| Variable | Type | Meaning |
|---|---|---|
| `x_ik` | binary | Work `i` uses window `k`. |
| `u_i` | binary | Work `i` is deferred this horizon. |
| `p_P` | binary | Possession `P` is opened. Its rectangle is the block's rectangle. |
| `d_P,D` | continuous in [0,1] | Department `D` (other than the leader's) works inside `P`. Earns the co-location bonus. |
| `n_jk,P` | continuous in [0,1] | Disconnection window `(j,k)` is nested in closure possession `P`. Earns the nesting bonus. |
| `S_d,t`, `E_d,t` | continuous | Per day `d`: open possessions starting at or before `t`, and ending at or before `t`. |
| `w_ik,m`, `z_ik,g` | binary | Only in the exact allocation model (phase 2). Job `(i,k)` gets machine unit `m` or gang `g`. |

## 4. Constraints

**Assignment.** For each work, exactly one window or deferral: `Σ_k x_ik + u_i = 1`. An approved work is fixed at its window: `x = 1`.

**Possessions (the core idea).**
- A possession needs its leader: `p_(i,k) ≤ x_ik`.
- **Membership:** every chosen closure window lies in exactly one open possession, its own or a host's: `x_jk ≤ Σ_{P ∋ (j,k)} p_P`.
  - `P ∋ (j,k)` means the window fits the rectangle: same day, `line_j ⊆ L_P` (a single line fits `BOTH`), `S_j ⊆ S_P` and `[start, end) ⊆ span_P`.
- **Disjointness:** two open possessions never share a (day, block section, line) at the same minute: `Σ_{P covers (d,s,ℓ,t)} p_P ≤ 1`.
  - One row per maximal clique of each (day, section, line) interval family.

Together, these rows make every open possession exactly one block of the scheduler's `formBlocks()`:
- Members lie inside the leader's rectangle, so they always merge with it.
- Windows of different possessions can never overlap on a shared section and line, so they never merge.

Downtime, spread, delay and co-location are therefore priced per possession. They are not priced per task.

**Co-location bonus.**
- `d_P,D ≤ p_P` and `d_P,D ≤ Σ` (windows of department `D` inside `P`).
- Disconnection nesting follows the scheduler's automatic nesting rule:
  - `n_jk,P ≤ p_P` and `Σ_P n_jk,P ≤ x_jk`.
  - The rule is: same day, compatible line, a shared section, and the window lies entirely inside the span.

**Incompatible works** (`INCOMPATIBLE_PAIRS`):
- A window may not sit inside an open possession whose leader it conflicts with: `x + p ≤ 1`.
- Two conflicting members of one possession: `x_a + x_b + p_P ≤ 2`.

**Controller workload.**
- Blocks per day: `Σ_{P on day d} p_P ≤ maxBlocksPerDay`.
- Simultaneous possessions, in the scheduler's per-block form. The possessions overlapping `P`, `P` included, number `S_d(last start < end_P) − E_d(start_P)`, so:
  - `S_d(·) − E_d(start_P) + M·p_P ≤ M + maxConcurrentBlocks`, with `M = maxBlocksPerDay − maxConcurrentBlocks`.
  - An instant-wise row `S_d(t) − E_d(t) ≤ maxConcurrentBlocks` tightens the LP.
  - Each row has 3 terms instead of one term per overlapping possession, which roughly halved the matrix.

**Requisitions.**
- `dependsOn`: `x_dep,k ≤ Σ` (predecessor windows that end before `k` starts).
- `coRequireWith`: both works are placed or both are deferred, and each chosen window has a chosen partner window that shares its block (the scheduler's `canShare`).

**Machines and gangs**, in two strengths:
- *Capacity rows* (group `hall`, phase 1). These are necessary conditions:
  - Time-point limits per (day, type), with the scheduler's 20-minute positioning time.
  - For single-unit types: pairwise conflicts when the unit cannot travel between two sites in time.
  - For gangs: Hall-type limits on each eligibility set (reach, rest day, and the mandatory reach ×1.5 rule). These cover both concurrent jobs and the 480 minutes per day.
- *Exact first-fit rows* (group `ff`, phase 2). `allocateResources()` handles a day's jobs in start order and gives each job the first unit or gang in list order that is free. That order is fixed over candidate windows, so first-fit is modelled exactly:
  - Assignment columns `w` and `z`.
  - One unit or gang has no overlapping jobs, and a machine must reach the next site in time.
  - A job may take the q-th unit or gang only if every earlier one in the list is unavailable to it: busy with an earlier overlapping job, out of minutes, or unable to arrive in time.

**Mandatory works.** `u_i` carries the scheduler's penalty (4 × 10⁶, and 2 × 10⁶ for a late placement), so the model is never infeasible. Any mandatory work left out is listed in `meta.mandatoryUnplaced`. Separately, the scheduler keeps a mandatory work's windows on or before its due day.

## 5. Objective

Minimise:

`Σ c^place_ik·x_ik + Σ c^defer_i·u_i + Σ c^poss_P·p_P − w.colocation·Σ d_P,D − (w.colocation/2)·Σ n_jk,P`

This is `makeEvaluator` term for term. For any plan the model can represent, the objective equals the scheduler's cost. The tests check this: the scheduler's score of the returned plan equals `meta.planCost`, and `verifyAssignment`, the in-module mirror, matches the scheduler on greedy and annealed plans on all four corridors.

## 6. How it is solved (`makeMilpConstruct`)

1. **Fallback plan.** The scheduler's own greedy construction is reproduced with the mirrored cost, so the hook never hands SA a worse start than greedy would.
2. **MIP start.** A greedy plan inside the model's plan space (blocks laid on one work's own window) is passed to HiGHS with `setSolution`. Branch-and-cut therefore has an incumbent from its first second.
3. **Phase 1.** HiGHS solves the model with `core + hall` rows. The solve uses 80 % of the remaining budget, `mip_rel_gap = 0.5 %`, and `mip_pool_soft_limit = 300` (a small cut pool reaches the primal heuristics sooner). HiGHS returns its status, incumbent objective, proven bound and gap.
4. **Allocation check.** The plan is checked with the scheduler's first-fit rule, mirrored. If a machine or gang is refused, two things happen:
   - A local repair moves the offending work.
   - **Phase 2** re-solves the exact `core + ff` model on two widening neighbourhoods. Every work outside the neighbourhood stays where phase 1 put it (fixed by equality rows), and each re-solve is warm-started from the previous one.
     - 2a: the failing day and resource group.
     - 2b: every work on the failing days.
5. **Selection.** Of all the plans, the cheapest one that breaks no rule is returned, priced by the mirrored scheduler cost. If HiGHS produces no feasible solution at all, `construct` **throws**, and the scheduler records the reason and falls back to greedy.
6. **Polish.** The scheduler validates the assignment and runs SA from it. SA is unchanged: it can make merges the model does not represent, and it has the final word on cost.

`meta` reports:
- solver version, `status`, `objective`, `bound`, `gapPct`
- `planCost`, `planGapPct`, `source` (which plan won)
- `phases[]`, each with status, objective, bound, gap, time and nodes
- model size: `variables`, `binaries`, `constraints`, `firstFitRows`
- candidate counts and drops
- `mandatoryUnplaced`, `repairedTasks`, `remainingViolations`
- `approximations[]`

## 7. What is exact and what is approximated

**Exact** (for the windows kept):
- the per-possession delay, downtime, spread and co-location, and the per-task waiting, TSR, lateness, deferral, preference and weather terms
- premium paths, the block length limit, blocks per day and simultaneous possessions (the scheduler's per-block rule)
- incompatible works, requisition sequences and joint blocks, and approved blocks
- in phase 2, the scheduler's first-fit allocation of units and gangs, including travel time and gang reach

**Approximated, and said so:**
- **Candidate windows.** Each work keeps the 20 cheapest windows. The proven bound therefore holds for that window set, not for the scheduler's full candidate list.
- **Possession shape.** A block is laid on one work's own window and the other works nest inside it. Staggered or cross-section merges, where the union of two windows widens the block, are outside the model. SA can still make them. The bound holds for the model's plan space. It is not a lower bound on every plan the scheduler could form.
- **Resources in phase 1.** Machines and gangs are necessary conditions in phase 1. Exact first-fit is solved only on a neighbourhood (phase 2), so the global optimum under exact allocation is not proven. `meta.approximations` states this.
- **Scheduler rules copied into the module.** `verifyAssignment` and `canShare` copy the scheduler's rules, and the scheduler remains the authority. If `formBlocks`, `allocateResources` or `makeEvaluator` change, these copies must change too. `tests/milp.test.js` fails when they drift.

## 8. Measured numbers

Weekly horizon, default weights and rules, seed 26027, 6 s budget per corridor. Every cost is the **scheduler's own cost function** (`planHorizon`, `iterations: 0` for construction only), taken from `node --test tests/milp.test.js` on the current tree:

| Corridor | Works | Phase-1 model (vars / rows) | HiGHS status | Objective | Bound | Gap | MILP time | MILP plan | Greedy plan | MILP + SA | Greedy + SA |
|---|---|---|---|---|---|---|---|---|---|---|---|
| NCR NDLS–CNB | 48 | 3 311 / 5 071 | time limit | 8 404 | 8 293 | 1.32 % | 5.6 s | 8 326 | 11 554 | **8 326** | 10 878 |
| WR MMCT–ADI | 53 | 3 887 / 5 953 | time limit | 12 524 | 11 888 | 5.08 % | 6.1 s | 12 410 | 14 643 | **12 410** | 14 305 |
| SWR SBC–JTJ | 26 | 2 052 / 3 117 | time limit | 5 960 | 5 638 | 5.40 % | 6.1 s | 6 734 | 7 136 | **6 324** | 6 679 |
| ER HWH–ASN | 26 | 2 083 / 3 122 | optimal (gap < 0.5 %) | 3 451 | 3 441 | 0.29 % | 4.4 s | 3 451 | 5 142 | **3 446** | 3 942 |

- **Hard violations:** none, in all 16 plans in the table. All mandatory works were placed.
- **Compared with greedy + SA:** MILP + SA cost is lower by 23 % on NCR, 13 % on WR, 5 % on SWR and 13 % on ER. Most of the gain comes from fewer, fuller possessions and earlier placement of high-ARCI works. For example, NCR has 18 possessions with 11 co-located, against 21.
- **Run-to-run variation:** results change by a few percent from run to run, because the solves are time-limited and the machine load varies. With a 4 s budget, WR sometimes returns the greedy fallback, because HiGHS's first strong incumbent arrives after about 3.3 s on that corridor.
- **Browser:** a Chrome module worker, loaded through `highsLoader.ts` from a production build, gave the same results. The wasm loaded in 50–70 ms. NCR finished in 4.9–5.6 s (MILP plan 8 396, 8 276 after SA) and ER was optimal in 1.3 s.

## 9. Moving to OR-Tools CP-SAT in production

CP-SAT has no browser build suitable for this worker, so the prototype uses HiGHS locally. On a divisional server, the same model carries over directly:

- **Variables.** `x`, `u`, `p`, `w` and `z` become `BoolVar`s. The counters `S` and `E` become `IntVar`s, or disappear entirely.
- **Constraints.** Assignment, membership and disjointness keep their form. CP-SAT's `AddNoOverlap` on optional interval variables replaces the clique rows and the first-fit busy rows, and `AddCumulative` covers units, gangs and simultaneous possessions directly. Implications (`OnlyEnforceIf`) replace the big-M rows.
- **Objective.** Integer-scaled, with the same terms. CP-SAT's parallel portfolio (8–16 workers) and solution hints would carry over the warm start and the phase-1 plan.
- **Deployment.** A small service with `POST /plan`, taking the same `construct` input serialised to JSON. The worker would call it when online. Offline, it would keep using HiGHS WebAssembly and then greedy with SA, and label which solver produced the plan.
- **Scale.** The server removes the two approximations that exist only for the browser budget: the 20-window cap, and phase-2 neighbourhoods for resources (the full exact allocation model runs with a longer time limit).

## 10. Files

| File | Contents |
|---|---|
| `src/engine/milp.js` | `makeMilpConstruct(highs, options)` → `construct(input) → { assign, meta }`. Also exports `buildMilpModel`, `toLp`, `solveLp`, `parseMilpSolution` and `verifyAssignment`. |
| `src/engine/highsLoader.ts` | `loadHighs(): Promise<Highs>` for the worker. It imports `highs/runtime?url` and passes it as `locateFile`, and caches the instance. |
| `vite.config.ts` | PWA precache includes `*.wasm`, so the solver works offline. The wasm is 3.53 MB (1.23 MB gzip), under the 6 MB precache limit. |
| `tests/milp.test.js` | Loader, LP round trip, cost mirror, per-corridor validity, fixed blocks, and the comparison with SA. `MILP_TIME_LIMIT` overrides the 6 s budget. |
