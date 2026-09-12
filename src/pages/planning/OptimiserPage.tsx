/**
 * OptimiserPage — studio / scenarios tabs (spec §3.18, PS point 3).
 * Tune the objective weights and JPO rules, run a candidate plan in the
 * worker, compare it with the working plan and the simulated baseline, and
 * promote or discard it. What-if injectors and the curated scenarios run as
 * candidates too; "Apply" puts a scenario into the working plan and re-plans.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Cpu, Flame, Play, RefreshCw, RotateCcw, Scale, ShieldAlert, Sliders, Undo2, XCircle, Zap } from 'lucide-react';
import { useAppStore, type ScenarioState, type SolverChoice } from '../../store/useAppStore';
import { can, type PortalId } from '../../auth/portals';
import { DEFAULT_WEIGHTS, WORK_TYPES } from '../../engine/constants.js';
import { SCENARIO_PRESETS, buildScenarioFromPreset } from '../../engine/scenarios.js';
import { planDiff, type PlanDiffRow } from '../../engine/select';
import type { Dept, InjectSpec, Kpis, Line, Plan, Rules, RunLine, Scenario, Snapshot, Weights } from '../../engine/types';
import { useT } from '../../i18n';
import { common } from '../../i18n/common';
import { addDaysIso, dateLabel, hhmm, num, pct, signed, toMin } from '../../lib/format';
import { Badge, Callout, Card, CardBody, CardHead, DataTable, EmptyState, Field, KeyValue, PageHeader, PlanPending, Segmented, Spinner, Tabs, type Column } from '../../components/ui';
import { SeedStamp, SimLabel, Slider } from '../../components/ui/extras';
import { BarChart } from '../../components/viz';
import { SafetyBanner } from '../../components/domain/SafetyBanner';
import { SolverDetails } from '../../components/domain/SolverStamp';
import { ALL_KPIS, compareKpi, FEED_SEED, formatKpi, formatKpiDelta, KPI_LABEL, KPI_METHOD, kpiValue, planStrings, type KpiKey } from './planMetrics';

export interface OptimiserPageProps {
  tab?: 'studio' | 'scenarios';
}

type TabId = 'studio' | 'scenarios';
type WeightKey = keyof Weights;
type NumericRuleKey = 'minBlockMin' | 'maxBlockMin' | 'headwayMarginMin' | 'slwDelayMin' | 'slwCapacityPerHour' | 'maxBlocksPerDay' | 'maxConcurrentBlocks' | 'annealT0' | 'noticeWeeksForRegulation';
type PresetId = (typeof SCENARIO_PRESETS)[number]['id'];

const WEIGHT_KEYS: WeightKey[] = ['delay', 'downtime', 'risk', 'colocation', 'tsr', 'spread', 'preference'];
const RULE_KEYS: NumericRuleKey[] = ['minBlockMin', 'maxBlockMin', 'headwayMarginMin', 'slwDelayMin', 'slwCapacityPerHour', 'maxBlocksPerDay', 'maxConcurrentBlocks', 'annealT0', 'noticeWeeksForRegulation'];
const DEFAULTS = DEFAULT_WEIGHTS as Weights;
/** UI floor of the risk weight: efficiency weights must not be able to push mandatory safety work out of the plan. */
const RISK_FLOOR_SHARE = 0.5;
const RISK_FLOOR = DEFAULTS.risk * RISK_FLOOR_SHARE;
const floorRisk = (w: Weights): Weights => (w.risk < RISK_FLOOR ? { ...w, risk: RISK_FLOOR } : w);
const COST_KEYS = ['delay', 'downtime', 'spread', 'waiting', 'deferred'] as const;

const strings = {
  en: {
    title: 'Optimiser',
    lede: 'Tune the objective and the JPO rules, run a candidate plan, and compare it with the working plan and the simulated baseline before anything changes.',
    tabStudio: 'Studio',
    tabScenarios: 'Scenarios',
    run: 'Run candidate',
    running: 'Running…',
    promote: 'Set as working plan',
    discard: 'Discard',
    reset: 'Reset defaults',
    noCap: 'Only the block planning cell can change the working plan.',
    runDone: 'Candidate ready',
    runDoneBody: 'Availability {a} · train-minutes lost {d} against the working plan',
    runFailed: 'Candidate run failed',
    promoted: 'Working plan updated',
    promotedBody: '{n} blocks changed',
    notifyPromoted: 'Working plan updated: {n} of your blocks changed',
    notifyPromotedBody: 'The planning cell promoted a new candidate plan. Review your blocks.',
    discarded: 'Candidate discarded',
    resetDone: 'Weights, rules and iterations reset to the engine defaults',
    weightsTitle: 'Objective weights',
    weightsSub: 'Cost of each term in the optimiser’s objective. The value in brackets is the multiple of the engine default.',
    w_delay: 'Train delay',
    w_delayHint: 'Per class-weighted train-minute of delay',
    w_downtime: 'Line downtime',
    w_downtimeHint: 'Per minute a line is closed',
    w_risk: 'Risk of waiting',
    w_riskHint: 'Per unit ARCI of an unplaced work per day it waits',
    w_colocation: 'Co-location bonus',
    w_colocationHint: 'Per extra department sharing a block',
    w_tsr: 'TSR exposure',
    w_tsrHint: 'Per train-minute lost to a speed restriction while its work waits',
    w_spread: 'Block count',
    w_spreadHint: 'Per block — favours fewer, fuller blocks',
    w_preference: 'Requisition preferences',
    w_preferenceHint: 'Per day away from the preferred day a requisition asked for; three times this when the work starts outside its preferred window',
    riskFloor: 'Floor {v} ({p} % of the default): efficiency weights must not override safety.',
    rulesTitle: 'JPO rules',
    rulesSub: 'Hard limits the optimiser must respect when it lays blocks.',
    r_minBlockMin: 'Minimum block (min)',
    r_maxBlockMin: 'Block ceiling (min)',
    r_headwayMarginMin: 'Headway margin (min)',
    r_slwDelayMin: 'Single-line working delay (min)',
    r_slwCapacityPerHour: 'Single-line capacity (trains/h)',
    r_maxBlocksPerDay: 'Possessions per day',
    r_maxConcurrentBlocks: 'Simultaneous closures',
    r_annealT0: 'Annealing start temperature',
    r_noticeWeeksForRegulation: 'JPO notice for regulation (weeks)',
    r_premium: 'Premium paths are a hard rule: no block may cross a Vande Bharat, Rajdhani or Shatabdi path (untick to let the optimiser block one and charge it as delay)',
    ruleMinMax: 'The minimum block must not exceed the ceiling.',
    iterTitle: 'Search',
    iterSub: 'How the plan is built, and the simulated-annealing iterations that polish it.',
    iterations: 'Iterations',
    solverNote: 'Exact MILP over the candidate possessions, solved in the browser by HiGHS (WebAssembly), then simulated-annealing polish. If HiGHS cannot load, greedy construction + annealing runs instead. OR-Tools CP-SAT is the production target.',
    solverLabel: 'Construction',
    solverMilp: 'Exact MILP (HiGHS) + annealing polish',
    solverSa: 'Greedy + annealing',
    solverSet: 'Solver set: {name}',
    solverSetBody: 'Applies to the next run — working plan or candidate.',
    lastRun: 'Last run of the working plan',
    lastCandidate: 'Candidate run',
    progress: 'Candidate run',
    compareTitle: 'Candidate · working · baseline',
    compareSub: 'Same seed and works, computed like-for-like. Δ is candidate minus working.',
    colMetric: 'Metric',
    colBaseline: 'Baseline',
    colWorking: 'Working',
    colCandidate: 'Candidate',
    colDelta: 'Δ vs working',
    noCandidate: 'Run to compare.',
    candidateFrom: 'Candidate from “{reason}”',
    searchTitle: 'Objective',
    searchSub: 'Cost terms of the weekly plan (lower is better)',
    sWorking: 'Working',
    sCandidate: 'Candidate',
    c_delay: 'Delay',
    c_downtime: 'Downtime',
    c_spread: 'Blocks',
    c_waiting: 'Waiting',
    c_deferred: 'Deferred',
    kIterations: 'Iterations',
    kCost: 'Greedy → final cost',
    kImprovement: 'Improvement by annealing',
    kAccepted: 'Accepted moves',
    kTime: 'Solver time',
    diffTitle: 'Changed blocks',
    diffSub: 'Candidate against the working plan',
    d_added: 'Added',
    d_shifted: 'Shifted',
    d_dropped: 'Dropped',
    d_kept: 'Kept',
    noChanges: 'No block changes against the working plan.',
    colChange: 'Change',
    colBlock: 'Block',
    colWhen: 'When',
    colTrains: 'Trains Δ',
    colDelay: 'Delay Δ',
    whatIfTitle: 'What-if injectors',
    whatIfSub: 'Each runs a candidate on top of the working conditions. Injected events are demo inputs.',
    runWhatIf: 'Run what-if',
    wi_defect: 'Inject a defect',
    wi_machine: 'Machine breakdown',
    wi_train: 'Cancel a train',
    wi_premium: 'Add a premium path',
    wi_freight: 'Freight surge',
    workType: 'Work',
    line: 'Line',
    fromKm: 'From km',
    toKm: 'To km',
    tsr: 'TSR km/h (optional)',
    machine: 'Machine',
    train: 'Train',
    depTime: 'Departure',
    depRequired: 'Enter a departure time.',
    kmInvalid: 'Km range must lie on the corridor, from before to.',
    surge: 'FOIS forecast multiplier',
    wiName_defect: 'Defect: {work} km {from}–{to}',
    wiName_machine: 'Breakdown: {machine}',
    wiName_train: 'Cancelled: {train}',
    wiName_premium: 'Premium path {line} {dep}',
    wiName_freight: 'Freight ×{k}',
    scenarioActive: 'Scenario active in the working plan: {name}',
    scenarioActiveBody: 'The working plan includes these injected events. Revert re-plans without them.',
    revert: 'Revert',
    reverted: 'Scenario cleared; re-planning',
    applied: 'Scenario applied; re-planning',
    scenariosSub: 'Curated disruptions. Run one as a candidate to see its computed effect, or apply it to the working plan.',
    injects: 'Injects',
    speedCap: 'Speed cap {v} km/h over the corridor',
    effect: 'Computed effect',
    effectText: 'Against the working plan: availability {a}, train-minutes lost {d}, possessions {b}, TSR-days {tsr}, mandatory compliance {m}.',
    effectNone: 'Run to compute the effect.',
    effectActive: 'Active in the working plan.',
    templateNote: 'Template text filled from engine outputs',
    runScenario: 'Run as candidate',
    applyScenario: 'Apply to working plan',
    active: 'Active',
    p_OHE_CATENARY_SAG_name: 'OHE catenary sag',
    p_OHE_CATENARY_SAG_premise: 'Contact wire droop found under heat; emergency renewal under a power block with a TSR until it is lifted.',
    p_EI_AXLE_COUNTER_FAILURE_name: 'Axle counter / EI failure',
    p_EI_AXLE_COUNTER_FAILURE_premise: 'Interlocking card replacement under an S&T disconnection notice, without a line block.',
    p_USFD_IMR_FRACTURE_name: 'USFD IMR rail flaw',
    p_USFD_IMR_FRACTURE_premise: 'Ultrasonic testing flags an IMR flaw; weld replacement is due at once under a TSR.',
    p_DENSE_WINTER_FOG_name: 'Dense winter fog',
    p_DENSE_WINTER_FOG_premise: 'Low visibility caps running speeds, stretching train paths and shrinking the free windows.',
    p_MONSOON_BRIDGE_WATCH_name: 'Monsoon bridge watch',
    p_MONSOON_BRIDGE_WATCH_premise: 'High water at a major bridge: girder inspection under a caution order on both lines.',
  },
  hi: {
    title: 'ऑप्टिमाइज़र',
    lede: 'उद्देश्य और JPO नियम ट्यून करें, candidate योजना चलाएँ, और कुछ भी बदलने से पहले उसे कार्यकारी योजना व सिम्युलेटेड आधार-रेखा से मिलाएँ।',
    tabStudio: 'स्टूडियो',
    tabScenarios: 'परिदृश्य',
    run: 'Candidate चलाएँ',
    running: 'चल रहा है…',
    promote: 'कार्यकारी योजना बनाएँ',
    discard: 'रद्द करें',
    reset: 'डिफ़ॉल्ट पर रीसेट',
    noCap: 'केवल ब्लॉक योजना प्रकोष्ठ कार्यकारी योजना बदल सकता है।',
    runDone: 'Candidate तैयार',
    runDoneBody: 'कार्यकारी योजना की तुलना में उपलब्धता {a} · ट्रेन-मिनट हानि {d}',
    runFailed: 'Candidate run विफल',
    promoted: 'कार्यकारी योजना अद्यतन',
    promotedBody: '{n} block बदले',
    notifyPromoted: 'कार्यकारी योजना अद्यतन: आपके {n} block बदले',
    notifyPromotedBody: 'योजना प्रकोष्ठ ने नई candidate योजना लागू की है। अपने block देखें।',
    discarded: 'Candidate रद्द',
    resetDone: 'भार, नियम और iterations इंजन डिफ़ॉल्ट पर रीसेट',
    weightsTitle: 'उद्देश्य भार',
    weightsSub: 'ऑप्टिमाइज़र के उद्देश्य में हर पद की लागत। कोष्ठक में इंजन डिफ़ॉल्ट का गुणज।',
    w_delay: 'ट्रेन विलंब',
    w_delayHint: 'प्रति श्रेणी-भारित ट्रेन-मिनट विलंब',
    w_downtime: 'लाइन बंदी',
    w_downtimeHint: 'लाइन बंद रहने के प्रति मिनट',
    w_risk: 'प्रतीक्षा का जोखिम',
    w_riskHint: 'अनिर्धारित कार्य के प्रति ARCI इकाई, प्रति प्रतीक्षा दिन',
    w_colocation: 'सह-स्थान बोनस',
    w_colocationHint: 'block साझा करने वाले प्रति अतिरिक्त विभाग',
    w_tsr: 'TSR प्रभाव',
    w_tsrHint: 'कार्य की प्रतीक्षा में TSR से खोए प्रति ट्रेन-मिनट',
    w_spread: 'Block संख्या',
    w_spreadHint: 'प्रति block — कम, भरे हुए block को प्राथमिकता',
    w_preference: 'माँग-पत्र प्राथमिकताएँ',
    w_preferenceHint: 'माँग-पत्र के पसंदीदा दिन से प्रति दिन की दूरी पर; पसंदीदा खिड़की से बाहर शुरू होने पर इसका तीन गुना',
    riskFloor: 'न्यूनतम {v} (डिफ़ॉल्ट का {p} %): दक्षता भार सुरक्षा पर हावी नहीं हो सकते।',
    rulesTitle: 'JPO नियम',
    rulesSub: 'block रखते समय ऑप्टिमाइज़र द्वारा मानी जाने वाली कठोर सीमाएँ।',
    r_minBlockMin: 'न्यूनतम block (मिनट)',
    r_maxBlockMin: 'block अधिकतम सीमा (मिनट)',
    r_headwayMarginMin: 'हेडवे मार्जिन (मिनट)',
    r_slwDelayMin: 'एकल-लाइन संचालन विलंब (मिनट)',
    r_slwCapacityPerHour: 'एकल-लाइन क्षमता (ट्रेन/घं.)',
    r_maxBlocksPerDay: 'प्रति दिन पज़ेशन',
    r_maxConcurrentBlocks: 'एक साथ बंदी',
    r_annealT0: 'एनीलिंग प्रारंभिक तापमान',
    r_noticeWeeksForRegulation: 'नियमन हेतु JPO नोटिस (सप्ताह)',
    r_premium: 'प्रीमियम पथ कठोर नियम हैं: कोई block वंदे भारत, राजधानी या शताब्दी पथ को नहीं काट सकता (हटाने पर ऑप्टिमाइज़र एक पथ block कर सकता है, विलंब लागत के साथ)',
    ruleMinMax: 'न्यूनतम block अधिकतम सीमा से अधिक नहीं हो सकता।',
    iterTitle: 'खोज',
    iterSub: 'योजना कैसे बनती है, और उसे सुधारने वाली सिम्युलेटेड-एनीलिंग iterations।',
    iterations: 'Iterations',
    solverNote: 'संभावित पज़ेशन पर सटीक MILP, ब्राउज़र में HiGHS (WebAssembly) से हल, फिर सिम्युलेटेड-एनीलिंग सुधार। HiGHS लोड न हो तो ग्रीडी निर्माण + एनीलिंग चलता है। उत्पादन लक्ष्य OR-Tools CP-SAT है।',
    solverLabel: 'निर्माण',
    solverMilp: 'सटीक MILP (HiGHS) + एनीलिंग सुधार',
    solverSa: 'ग्रीडी + एनीलिंग',
    solverSet: 'सॉल्वर चुना गया: {name}',
    solverSetBody: 'अगले run पर लागू — कार्यकारी योजना या candidate।',
    lastRun: 'कार्यकारी योजना का पिछला run',
    lastCandidate: 'Candidate run',
    progress: 'Candidate run',
    compareTitle: 'Candidate · कार्यकारी · आधार-रेखा',
    compareSub: 'वही seed और कार्य, समान तरीके से गणना। Δ = candidate − कार्यकारी।',
    colMetric: 'मीट्रिक',
    colBaseline: 'आधार-रेखा',
    colWorking: 'कार्यकारी',
    colCandidate: 'Candidate',
    colDelta: 'कार्यकारी से Δ',
    noCandidate: 'तुलना हेतु चलाएँ।',
    candidateFrom: '“{reason}” से candidate',
    searchTitle: 'उद्देश्य',
    searchSub: 'साप्ताहिक योजना के लागत पद (कम बेहतर)',
    sWorking: 'कार्यकारी',
    sCandidate: 'Candidate',
    c_delay: 'विलंब',
    c_downtime: 'बंदी',
    c_spread: 'Block',
    c_waiting: 'प्रतीक्षा',
    c_deferred: 'स्थगित',
    kIterations: 'Iterations',
    kCost: 'ग्रीडी → अंतिम लागत',
    kImprovement: 'एनीलिंग से सुधार',
    kAccepted: 'स्वीकृत चाल',
    kTime: 'सॉल्वर समय',
    diffTitle: 'बदले हुए block',
    diffSub: 'कार्यकारी योजना की तुलना में candidate',
    d_added: 'जोड़ा',
    d_shifted: 'खिसकाया',
    d_dropped: 'हटाया',
    d_kept: 'यथावत',
    noChanges: 'कार्यकारी योजना की तुलना में कोई block परिवर्तन नहीं।',
    colChange: 'परिवर्तन',
    colBlock: 'Block',
    colWhen: 'कब',
    colTrains: 'ट्रेन Δ',
    colDelay: 'विलंब Δ',
    whatIfTitle: 'व्हाट-इफ़ इंजेक्टर',
    whatIfSub: 'हर एक कार्यकारी स्थितियों के ऊपर candidate चलाता है। इंजेक्ट की गई घटनाएँ डेमो इनपुट हैं।',
    runWhatIf: 'व्हाट-इफ़ चलाएँ',
    wi_defect: 'दोष इंजेक्ट करें',
    wi_machine: 'मशीन खराबी',
    wi_train: 'ट्रेन रद्द करें',
    wi_premium: 'प्रीमियम पथ जोड़ें',
    wi_freight: 'मालगाड़ी वृद्धि',
    workType: 'कार्य',
    line: 'लाइन',
    fromKm: 'से कि.मी.',
    toKm: 'तक कि.मी.',
    tsr: 'TSR कि.मी./घं. (वैकल्पिक)',
    machine: 'मशीन',
    train: 'ट्रेन',
    depTime: 'प्रस्थान',
    depRequired: 'प्रस्थान समय दर्ज करें।',
    kmInvalid: 'कि.मी. सीमा कॉरिडोर पर हो और "से" "तक" से पहले हो।',
    surge: 'FOIS पूर्वानुमान गुणक',
    wiName_defect: 'दोष: {work} कि.मी. {from}–{to}',
    wiName_machine: 'खराबी: {machine}',
    wiName_train: 'रद्द: {train}',
    wiName_premium: 'प्रीमियम पथ {line} {dep}',
    wiName_freight: 'मालगाड़ी ×{k}',
    scenarioActive: 'कार्यकारी योजना में सक्रिय परिदृश्य: {name}',
    scenarioActiveBody: 'कार्यकारी योजना में ये इंजेक्ट की गई घटनाएँ शामिल हैं। रिवर्ट इनके बिना पुनः योजना बनाता है।',
    revert: 'रिवर्ट',
    reverted: 'परिदृश्य हटाया गया; पुनः योजना जारी',
    applied: 'परिदृश्य लागू; पुनः योजना जारी',
    scenariosSub: 'चुने हुए व्यवधान। गणित प्रभाव देखने हेतु candidate के रूप में चलाएँ, या कार्यकारी योजना पर लागू करें।',
    injects: 'इंजेक्ट करता है',
    speedCap: 'कॉरिडोर पर {v} कि.मी./घं. गति सीमा',
    effect: 'गणित प्रभाव',
    effectText: 'कार्यकारी योजना की तुलना में: उपलब्धता {a}, ट्रेन-मिनट हानि {d}, पज़ेशन {b}, TSR-दिन {tsr}, अनिवार्य अनुपालन {m}।',
    effectNone: 'प्रभाव गणना हेतु चलाएँ।',
    effectActive: 'कार्यकारी योजना में सक्रिय।',
    templateNote: 'इंजन परिणामों से भरा गया टेम्पलेट पाठ',
    runScenario: 'Candidate के रूप में चलाएँ',
    applyScenario: 'कार्यकारी योजना पर लागू करें',
    active: 'सक्रिय',
    p_OHE_CATENARY_SAG_name: 'OHE कैटेनरी झुकाव',
    p_OHE_CATENARY_SAG_premise: 'गर्मी में संपर्क तार झुका मिला; power block में आपात नवीनीकरण, हटने तक TSR।',
    p_EI_AXLE_COUNTER_FAILURE_name: 'एक्सल काउंटर / EI विफलता',
    p_EI_AXLE_COUNTER_FAILURE_premise: 'लाइन block के बिना S&T डिस्कनेक्शन नोटिस में इंटरलॉकिंग कार्ड बदलना।',
    p_USFD_IMR_FRACTURE_name: 'USFD IMR रेल दोष',
    p_USFD_IMR_FRACTURE_premise: 'अल्ट्रासोनिक परीक्षण में IMR दोष; TSR के साथ तुरंत वेल्ड बदलना देय।',
    p_DENSE_WINTER_FOG_name: 'घना शीतकालीन कोहरा',
    p_DENSE_WINTER_FOG_premise: 'कम दृश्यता से गति सीमित, ट्रेन पथ लंबे और मुक्त विंडो छोटी होती हैं।',
    p_MONSOON_BRIDGE_WATCH_name: 'मानसून पुल निगरानी',
    p_MONSOON_BRIDGE_WATCH_premise: 'बड़े पुल पर ऊँचा जल स्तर: दोनों लाइनों पर सतर्कता आदेश के साथ गर्डर निरीक्षण।',
  },
} as const;

type Key = keyof typeof strings.en;

interface CompareRow {
  key: KpiKey;
}

/** Merge a what-if onto the scenario already active in the working plan, so the candidate keeps today's conditions. */
function mergeScenario(base: ScenarioState | null, add: Scenario, name: string): ScenarioState {
  const b: Scenario = base?.scenario ?? {};
  return {
    presetId: null,
    name: base ? `${base.name} + ${name}` : name,
    params: { ...(base?.params ?? {}) },
    scenario: {
      ...b,
      ...add,
      name: base ? `${base.name} + ${name}` : name,
      injectTasks: [...(b.injectTasks ?? []), ...(add.injectTasks ?? [])],
      removeMachines: [...(b.removeMachines ?? []), ...(add.removeMachines ?? [])],
      cancelTrains: [...(b.cancelTrains ?? []), ...(add.cancelTrains ?? [])],
    },
  };
}

export default function OptimiserPage({ tab = 'studio' }: OptimiserPageProps) {
  const snapshot = useAppStore((s) => s.snapshot);
  if (!snapshot) return <PlanPending />;
  return <OptimiserBody snapshot={snapshot} tab={tab} />;
}

function OptimiserBody({ snapshot, tab }: { snapshot: Snapshot; tab: TabId }) {
  const t = useT(strings);
  const tk = useT(planStrings);
  const tc = useT(common);
  const nav = useNavigate();

  const user = useAppStore((s) => s.user);
  const weights = useAppStore((s) => s.weights);
  const rules = useAppStore((s) => s.rules);
  const iterations = useAppStore((s) => s.iterations);
  const scenario = useAppStore((s) => s.scenario);
  const candidate = useAppStore((s) => s.candidate);
  const candidateStatus = useAppStore((s) => s.candidateStatus);
  const candidateProgress = useAppStore((s) => s.candidateProgress);
  const candidateError = useAppStore((s) => s.candidateError);
  const planStatus = useAppStore((s) => s.planStatus);
  const planVersion = useAppStore((s) => s.planVersion);
  const resetTuning = useAppStore((s) => s.resetTuning);
  const runCandidate = useAppStore((s) => s.runCandidate);
  const promoteCandidate = useAppStore((s) => s.promoteCandidate);
  const discardCandidate = useAppStore((s) => s.discardCandidate);
  const setScenario = useAppStore((s) => s.setScenario);
  const runPlan = useAppStore((s) => s.runPlan);
  const notify = useAppStore((s) => s.notify);
  const toast = useAppStore((s) => s.toast);
  const solver = useAppStore((s) => s.solver);
  const setSolver = useAppStore((s) => s.setSolver);

  const canPlan = can(user, 'plan');
  const corridor = snapshot.corridor;
  const weekly = snapshot.result.weekly;
  const deptName = (d: Dept) => tc(d === 'TMS' ? 'tms' : d === 'SMMS' ? 'smms' : 'tdms');

  /* ── drafts (re-synced when the store changes: reset, promote, other tab) ── */
  const [localWeights, setLocalWeights] = useState<Weights>(floorRisk({ ...DEFAULTS, ...weights }));
  const [localRules, setLocalRules] = useState<Rules>({ ...rules });
  const [localIterations, setLocalIterations] = useState<number>(iterations);
  const [syncedWeights, setSyncedWeights] = useState(weights);
  if (syncedWeights !== weights) {
    setSyncedWeights(weights);
    setLocalWeights(floorRisk({ ...DEFAULTS, ...weights }));
  }
  const [syncedRules, setSyncedRules] = useState(rules);
  if (syncedRules !== rules) {
    setSyncedRules(rules);
    setLocalRules({ ...rules });
  }
  const [syncedIterations, setSyncedIterations] = useState(iterations);
  if (syncedIterations !== iterations) {
    setSyncedIterations(iterations);
    setLocalIterations(iterations);
  }

  /* ── what-if drafts ── */
  const midKm = Math.round(corridor.lengthKm / 2);
  const workTypeIds = Object.keys(WORK_TYPES) as (keyof typeof WORK_TYPES)[];
  const [wiWork, setWiWork] = useState<keyof typeof WORK_TYPES>(workTypeIds[0]);
  const [wiLine, setWiLine] = useState<Line>(corridor.lines[0] ?? 'UP');
  const [wiFrom, setWiFrom] = useState<number>(midKm);
  const [wiTo, setWiTo] = useState<number>(midKm + 0.5);
  const [wiTsr, setWiTsr] = useState<string>('');
  const [wiMachine, setWiMachine] = useState<string>(snapshot.feeds.machines[0]?.id ?? '');
  const trains = useMemo(() => [...snapshot.feeds.timetable].sort((a, b) => a.number.localeCompare(b.number)), [snapshot]);
  const [wiTrain, setWiTrain] = useState<string>(trains[0]?.id ?? '');
  const [wiPremLine, setWiPremLine] = useState<RunLine>(corridor.lines[0] ?? 'UP');
  const [wiPremDep, setWiPremDep] = useState<string>('');
  const [wiSurge, setWiSurge] = useState<number>(1.2);

  const candRunning = candidateStatus === 'running';
  const planRunning = planStatus === 'running';
  const rulesInvalid = localRules.minBlockMin > localRules.maxBlockMin;
  const kmInvalid = !(wiFrom >= 0 && wiTo <= corridor.lengthKm && wiFrom < wiTo);

  const candKpis: Kpis | null = candidate?.snapshot.result.weekly.kpis ?? null;
  const diff: PlanDiffRow[] = useMemo(() => (candidate ? planDiff(candidate.snapshot, snapshot) : []), [candidate, snapshot]);
  const diffCounts = useMemo(() => {
    const c = { added: 0, shifted: 0, dropped: 0, kept: 0 };
    for (const r of diff) c[r.kind]++;
    return c;
  }, [diff]);
  const changed = diff.filter((r) => r.kind !== 'kept');

  /* ── actions ── */
  const toastCandidate = () => {
    const s = useAppStore.getState();
    if (s.candidateStatus === 'error') return toast({ title: t('runFailed'), body: s.candidateError ?? undefined, tone: 'crit' });
    const k = s.candidate?.snapshot.result.weekly.kpis;
    if (!k) return;
    const a = compareKpi('availability', k, weekly.kpis);
    const d = compareKpi('delay', k, weekly.kpis);
    toast({ title: t('runDone'), body: t('runDoneBody', { a: formatKpiDelta('availability', a.delta), d: formatKpiDelta('delay', d.delta) }), tone: 'ok' });
  };

  const handleRun = async () => {
    if (rulesInvalid) return;
    await runCandidate({ weights: floorRisk(localWeights), rules: localRules, iterations: localIterations }, 'studio');
    toastCandidate();
  };

  const runWhatIf = async (add: Scenario, name: string) => {
    if (rulesInvalid) return;
    await runCandidate({ weights: floorRisk(localWeights), rules: localRules, iterations: localIterations, scenario: mergeScenario(scenario, add, name) }, `what-if: ${name}`);
    toastCandidate();
  };

  const handlePromote = () => {
    if (!candidate || !canPlan) return;
    const perDept = new Map<Dept, number>();
    for (const r of changed) for (const d of (r.after ?? r.before)?.departments ?? []) perDept.set(d, (perDept.get(d) ?? 0) + 1);
    promoteCandidate();
    for (const [d, n] of perDept) notify({ portals: [d.toLowerCase() as PortalId], dept: d, kind: 'INFO', title: t('notifyPromoted', { n }), body: t('notifyPromotedBody'), route: `/app/${d.toLowerCase()}/blocks` });
    toast({ title: t('promoted'), body: t('promotedBody', { n: changed.length }), tone: 'ok' });
  };

  const handleDiscard = () => {
    discardCandidate();
    toast({ title: t('discarded'), tone: 'info' });
  };

  const handleReset = () => {
    if (!canPlan) return;
    resetTuning();
    const s = useAppStore.getState();
    setLocalWeights(floorRisk({ ...DEFAULTS, ...s.weights }));
    setLocalRules({ ...s.rules });
    setLocalIterations(s.iterations);
    toast({ title: t('resetDone'), tone: 'info' });
  };

  const presetState = (id: PresetId): ScenarioState | null => {
    const sc = buildScenarioFromPreset(id, corridor) as Scenario | null;
    if (!sc) return null;
    const name = t(`p_${id}_name` as Key);
    return { presetId: id, name, params: {}, scenario: { ...sc, name } };
  };

  const handleRunPreset = async (id: PresetId) => {
    const st = presetState(id);
    if (!st) return;
    await runCandidate({ scenario: st }, `scenario: ${st.name}`);
    toastCandidate();
  };

  const handleApplyPreset = async (id: PresetId) => {
    const st = presetState(id);
    if (!st || !canPlan) return;
    setScenario(st);
    toast({ title: t('applied'), body: st.name, tone: 'warn' });
    await runPlan({ reason: `scenario ${st.name}` });
  };

  const handleSolver = (v: SolverChoice) => {
    if (!canPlan || v === solver) return;
    setSolver(v);
    toast({ title: t('solverSet', { name: v === 'milp' ? t('solverMilp') : t('solverSa') }), body: t('solverSetBody'), tone: 'info' });
  };

  const handleRevert = async () => {
    if (!canPlan) return;
    setScenario(null);
    toast({ title: t('reverted'), tone: 'ok' });
    await runPlan({ reason: 'scenario cleared' });
  };

  /* ── compare table ── */
  const compareColumns: Column<CompareRow>[] = [
    { key: 'metric', header: t('colMetric'), render: (r) => <span className="small strong" title={tk(KPI_METHOD[r.key])}>{tk(KPI_LABEL[r.key])}</span> },
    { key: 'base', header: t('colBaseline'), num: true, render: (r) => <span className="muted">{formatKpi(r.key, kpiValue(weekly.baseKpis, r.key))}</span> },
    { key: 'working', header: t('colWorking'), num: true, render: (r) => <span className="strong">{formatKpi(r.key, kpiValue(weekly.kpis, r.key))}</span> },
    { key: 'cand', header: t('colCandidate'), num: true, render: (r) => (candKpis ? <span className="strong">{formatKpi(r.key, kpiValue(candKpis, r.key))}</span> : <span className="muted">—</span>) },
    {
      key: 'delta',
      header: t('colDelta'),
      num: true,
      render: (r) => {
        if (!candKpis) return <span className="muted">—</span>;
        const c = compareKpi(r.key, candKpis, weekly.kpis);
        return <Badge tone={c.better === null ? 'gray' : c.better ? 'ok' : 'crit'}>{formatKpiDelta(r.key, c.delta)}</Badge>;
      },
    },
  ];

  const diffColumns: Column<PlanDiffRow>[] = [
    { key: 'kind', header: t('colChange'), render: (r) => <Badge tone={r.kind === 'added' ? 'ok' : r.kind === 'dropped' ? 'crit' : 'warn'}>{t(`d_${r.kind}` as Key)}</Badge> },
    {
      key: 'block',
      header: t('colBlock'),
      render: (r) => {
        const b = r.after ?? r.before;
        return b ? (
          <div className="stack" style={{ gap: 2 }}>
            <span className="small">{b.sectionText}</span>
            <span className="tiny muted">{b.departments.map(deptName).join(' + ')}</span>
          </div>
        ) : null;
      },
    },
    {
      key: 'when',
      header: t('colWhen'),
      render: (r) => {
        const b = r.after ?? r.before;
        if (!b) return null;
        const before = r.kind === 'shifted' && r.before ? `${dateLabel(addDaysIso(snapshot.planStart, r.before.day))} ${r.before.startText} → ` : '';
        return (
          <span className="mono tiny">
            {before}
            {dateLabel(addDaysIso(snapshot.planStart, b.day))} {b.startText}–{b.endText}
          </span>
        );
      },
    },
    { key: 'trains', header: t('colTrains'), num: true, hideMobile: true, render: (r) => <span className="num">{signed(r.trainsDelta)}</span> },
    { key: 'delay', header: t('colDelay'), num: true, hideMobile: true, render: (r) => <span className="num">{signed(r.delayDelta, 0, ' min')}</span> },
  ];

  /* ── search / objective ── */
  const searchItems = (p: Plan): [string, string][] => [
    [t('kImprovement'), p.search.greedyCost ? pct((p.search.greedyCost - p.search.finalCost) / p.search.greedyCost, 1) : '—'],
    [t('kAccepted'), num(p.search.accepted)],
  ];

  const compareCard = (
    <Card>
      <CardHead
        title={t('compareTitle')}
        sub={candidate ? t('candidateFrom', { reason: candidate.reason }) : t('compareSub')}
        right={
          <span className="row-wrap">
            <SimLabel kind="baseline" short />
            <SimLabel kind="solver" short />
          </span>
        }
      />
      <CardBody flush>
        <DataTable<CompareRow> rows={ALL_KPIS.map((key) => ({ key }))} columns={compareColumns} rowKey={(r) => r.key} compact />
        {!candidate && !candRunning && (
          <div className="card-body">
            <EmptyState title={t('noCandidate')} icon={<Sliders />} />
          </div>
        )}
      </CardBody>
    </Card>
  );

  const progressCallout = (candRunning || candidateStatus === 'error') && (
    <Callout tone={candidateStatus === 'error' ? 'crit' : 'info'} icon={candRunning ? <Spinner /> : undefined}>
      <b>{t('progress')}</b> · {candidateStatus === 'error' ? candidateError : candidateProgress}
    </Callout>
  );

  const scenarioBanner = scenario && (
    <Callout tone="warn" icon={<Flame />}>
      <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
        <div>
          <b>{t('scenarioActive', { name: scenario.name })}</b>
          <div className="small">{t('scenarioActiveBody')}</div>
        </div>
        <button type="button" className="btn btn-sm" disabled={!canPlan || planRunning} title={canPlan ? undefined : t('noCap')} onClick={() => void handleRevert()}>
          <Undo2 size={13} /> {t('revert')}
        </button>
      </div>
    </Callout>
  );

  const decimals = (k: WeightKey) => (DEFAULTS[k] >= 10 ? 0 : 2);

  return (
    <div className="stack-lg">
      <PageHeader
        title={t('title')}
        lede={t('lede')}
        badges={
          <>
            <Badge tone="blue">{corridor.name}</Badge>
            <SeedStamp seed={FEED_SEED} runId={planVersion} iterations={weekly.ai.search.iterations} ms={snapshot.timing.ms} />
            <SimLabel kind="solver" />
          </>
        }
        actions={
          <>
            <button type="button" className="btn btn-primary" data-tour="optimiser-run" disabled={candRunning || rulesInvalid} title={rulesInvalid ? t('ruleMinMax') : undefined} onClick={() => void handleRun()}>
              {candRunning ? <RefreshCw size={14} className="spin" /> : <Play size={14} />} {candRunning ? t('running') : t('run')}
            </button>
            {candidate && (
              <>
                <button type="button" className="btn btn-ok" disabled={!canPlan} title={canPlan ? undefined : t('noCap')} onClick={handlePromote}>
                  <CheckCircle2 size={14} /> {t('promote')}
                </button>
                <button type="button" className="btn" onClick={handleDiscard}>
                  <XCircle size={14} /> {t('discard')}
                </button>
              </>
            )}
            <button type="button" className="btn btn-ghost" disabled={!canPlan} title={canPlan ? undefined : t('noCap')} onClick={handleReset}>
              <RotateCcw size={14} /> {t('reset')}
            </button>
          </>
        }
      />

      {scenarioBanner}

      <div className="stack" data-tour="optimiser-safety">
        {candidate && candKpis ? (
          <SafetyBanner snapshot={candidate.snapshot} plan={candidate.snapshot.result.weekly.ai} kpis={candKpis} candidate />
        ) : (
          <SafetyBanner snapshot={snapshot} plan={weekly.ai} kpis={weekly.kpis} />
        )}
      </div>

      <Tabs<TabId>
        tabs={[
          { id: 'studio', label: t('tabStudio') },
          { id: 'scenarios', label: t('tabScenarios'), count: SCENARIO_PRESETS.length },
        ]}
        value={tab}
        onChange={(v) => nav(v === 'studio' ? '/app/planning/optimiser' : '/app/planning/scenarios')}
      />

      {progressCallout}

      {tab === 'studio' && (
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <div className="stack-lg">
            <Card>
              <CardHead title={t('weightsTitle')} sub={t('weightsSub')} icon={<Scale size={16} />} />
              <CardBody>
                <div className="stack">
                  {WEIGHT_KEYS.map((k) => (
                    <Slider
                      key={k}
                      label={t(`w_${k}` as Key)}
                      hint={
                        k === 'risk' ? (
                          <>
                            {t('w_riskHint')}
                            <br />
                            <span className="strong">{t('riskFloor', { v: num(RISK_FLOOR, decimals(k)), p: Math.round(RISK_FLOOR_SHARE * 100) })}</span>
                          </>
                        ) : (
                          t(`w_${k}Hint` as Key)
                        )
                      }
                      value={localWeights[k] ?? DEFAULTS[k]}
                      min={k === 'risk' ? RISK_FLOOR : 0}
                      max={DEFAULTS[k] * 3}
                      step={DEFAULTS[k] / 20}
                      format={(v) => `${num(v, decimals(k))} (${num(v / DEFAULTS[k], 2)}×)`}
                      onChange={(v) => setLocalWeights((w) => ({ ...w, [k]: k === 'risk' ? Math.max(RISK_FLOOR, v) : v }))}
                    />
                  ))}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHead title={t('rulesTitle')} sub={t('rulesSub')} icon={<ShieldAlert size={16} />} />
              <CardBody>
                <div className="form-grid">
                  {RULE_KEYS.map((k) => (
                    <Field key={k} label={t(`r_${k}` as Key)} htmlFor={`rule-${k}`} error={k === 'minBlockMin' && rulesInvalid ? t('ruleMinMax') : undefined}>
                      <input
                        id={`rule-${k}`}
                        className="input num"
                        type="number"
                        min={0}
                        value={localRules[k]}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (e.target.value !== '' && Number.isFinite(v) && v >= 0) setLocalRules((r) => ({ ...r, [k]: v }));
                        }}
                      />
                    </Field>
                  ))}
                </div>
                <label className="check small mt">
                  <input type="checkbox" checked={localRules.premiumConflictHard} onChange={(e) => setLocalRules((r) => ({ ...r, premiumConflictHard: e.target.checked }))} /> {t('r_premium')}
                </label>
              </CardBody>
            </Card>

            <Card>
              <CardHead title={t('iterTitle')} sub={t('iterSub')} icon={<Cpu size={16} />} />
              <CardBody>
                <div className="stack">
                  <div className="field" data-tour="optimiser-solver">
                    <label>{t('solverLabel')}</label>
                    <Segmented<SolverChoice>
                      ariaLabel={t('solverLabel')}
                      value={solver}
                      onChange={handleSolver}
                      options={[
                        { value: 'milp', label: t('solverMilp') },
                        { value: 'sa', label: t('solverSa') },
                      ]}
                    />
                    {!canPlan && <div className="hint">{t('noCap')}</div>}
                  </div>
                  <Slider label={t('iterations')} value={localIterations} min={500} max={20000} step={500} format={(v) => num(v)} onChange={setLocalIterations} />
                  <div className="row-wrap">
                    <SimLabel kind="solver" />
                    <span className="tiny muted">{t('solverNote')}</span>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>

          <div className="stack-lg">
            {compareCard}

            {candidate && (
              <Card>
                <CardHead title={t('diffTitle')} sub={t('diffSub')} />
                <CardBody>
                  <div className="row-wrap mb">
                    <Badge tone="ok">
                      {t('d_added')} <span className="num">{diffCounts.added}</span>
                    </Badge>
                    <Badge tone="warn">
                      {t('d_shifted')} <span className="num">{diffCounts.shifted}</span>
                    </Badge>
                    <Badge tone="crit">
                      {t('d_dropped')} <span className="num">{diffCounts.dropped}</span>
                    </Badge>
                    <Badge tone="gray">
                      {t('d_kept')} <span className="num">{diffCounts.kept}</span>
                    </Badge>
                  </div>
                </CardBody>
                <CardBody flush>
                  <DataTable<PlanDiffRow> rows={changed} columns={diffColumns} rowKey={(r) => `${r.kind}:${r.key}`} compact maxHeight={320} empty={t('noChanges')} />
                </CardBody>
              </Card>
            )}

            <Card>
              <CardHead title={t('searchTitle')} sub={t('searchSub')} right={<SimLabel kind="solver" short />} />
              <CardBody>
                <BarChart
                  categories={COST_KEYS.map((k) => t(`c_${k}` as Key))}
                  series={[
                    { name: t('sWorking'), color: 'var(--series-1)', values: COST_KEYS.map((k) => weekly.ai.cost[k]) },
                    ...(candidate ? [{ name: t('sCandidate'), color: 'var(--series-4)', values: COST_KEYS.map((k) => candidate.snapshot.result.weekly.ai.cost[k]) }] : []),
                  ]}
                  height={170}
                  valueFormat={(v) => num(v)}
                />
                <div className="grid grid-2 mt-lg">
                  <div>
                    <div className="caps mb">{t('lastRun')}</div>
                    <SolverDetails plan={weekly.ai} requested={solver} extra={<KeyValue items={searchItems(weekly.ai)} />} />
                  </div>
                  {candidate && (
                    <div>
                      <div className="caps mb">{t('lastCandidate')}</div>
                      <SolverDetails plan={candidate.snapshot.result.weekly.ai} extra={<KeyValue items={searchItems(candidate.snapshot.result.weekly.ai)} />} />
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHead title={t('whatIfTitle')} sub={t('whatIfSub')} icon={<Zap size={16} />} />
              <CardBody>
                <div className="stack-lg">
                  <div className="well stack">
                    <b className="small">{t('wi_defect')}</b>
                    <div className="form-grid">
                      <Field label={t('workType')} htmlFor="wi-work">
                        <select
                          id="wi-work"
                          className="select"
                          value={wiWork}
                          onChange={(e) => {
                            const w = e.target.value as keyof typeof WORK_TYPES;
                            setWiWork(w);
                            const tsr = WORK_TYPES[w].tsrKmph;
                            setWiTsr(tsr ? String(tsr) : '');
                          }}
                        >
                          {workTypeIds.map((w) => (
                            <option key={w} value={w}>
                              {WORK_TYPES[w].label} ({WORK_TYPES[w].dept})
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={t('line')} htmlFor="wi-line">
                        <select id="wi-line" className="select" value={wiLine} onChange={(e) => setWiLine(e.target.value as Line)}>
                          {[...corridor.lines, 'BOTH' as const].map((l) => (
                            <option key={l} value={l}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={t('fromKm')} htmlFor="wi-from" error={kmInvalid ? t('kmInvalid') : undefined}>
                        <input id="wi-from" className="input num" type="number" step={0.1} min={0} max={corridor.lengthKm} value={wiFrom} onChange={(e) => setWiFrom(Number(e.target.value))} />
                      </Field>
                      <Field label={t('toKm')} htmlFor="wi-to">
                        <input id="wi-to" className="input num" type="number" step={0.1} min={0} max={corridor.lengthKm} value={wiTo} onChange={(e) => setWiTo(Number(e.target.value))} />
                      </Field>
                      <Field label={t('tsr')} htmlFor="wi-tsr">
                        <input id="wi-tsr" className="input num" type="number" min={0} max={corridor.mpsKmph} value={wiTsr} onChange={(e) => setWiTsr(e.target.value)} />
                      </Field>
                    </div>
                    <div>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={candRunning || kmInvalid || rulesInvalid}
                        onClick={() => {
                          const spec: InjectSpec = { workType: wiWork, line: wiLine, startKm: wiFrom, endKm: wiTo, daysOverdue: 0, tsrKmph: wiTsr.trim() ? Number(wiTsr) : null, note: 'What-if injector (demo input)' };
                          void runWhatIf({ injectTasks: [spec] }, t('wiName_defect', { work: WORK_TYPES[wiWork].label, from: num(wiFrom, 1), to: num(wiTo, 1) }));
                        }}
                      >
                        <Play size={12} /> {t('runWhatIf')}
                      </button>
                    </div>
                  </div>

                  <div className="well stack">
                    <b className="small">{t('wi_machine')}</b>
                    <Field label={t('machine')} htmlFor="wi-machine">
                      <select id="wi-machine" className="select" value={wiMachine} onChange={(e) => setWiMachine(e.target.value)}>
                        {snapshot.feeds.machines.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.id} · {m.label} · {m.homeStation}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div>
                      <button type="button" className="btn btn-sm" disabled={candRunning || !wiMachine || rulesInvalid} onClick={() => void runWhatIf({ removeMachines: [wiMachine] }, t('wiName_machine', { machine: wiMachine }))}>
                        <Play size={12} /> {t('runWhatIf')}
                      </button>
                    </div>
                  </div>

                  <div className="well stack">
                    <b className="small">{t('wi_train')}</b>
                    <Field label={t('train')} htmlFor="wi-train">
                      <select id="wi-train" className="select" value={wiTrain} onChange={(e) => setWiTrain(e.target.value)}>
                        {trains.map((tr) => (
                          <option key={tr.id} value={tr.id}>
                            {tr.number} · {tr.name} · {tr.line}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={candRunning || !wiTrain || rulesInvalid}
                        onClick={() => {
                          const tr = trains.find((x) => x.id === wiTrain);
                          void runWhatIf({ cancelTrains: [wiTrain] }, t('wiName_train', { train: tr ? `${tr.number} ${tr.name}` : wiTrain }));
                        }}
                      >
                        <Play size={12} /> {t('runWhatIf')}
                      </button>
                    </div>
                  </div>

                  <div className="well stack">
                    <b className="small">{t('wi_premium')}</b>
                    <div className="form-grid">
                      <Field label={t('line')} htmlFor="wi-prem-line">
                        <select id="wi-prem-line" className="select" value={wiPremLine} onChange={(e) => setWiPremLine(e.target.value as RunLine)}>
                          {corridor.lines.map((l) => (
                            <option key={l} value={l}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={t('depTime')} htmlFor="wi-prem-dep" hint={wiPremDep ? undefined : t('depRequired')}>
                        <input id="wi-prem-dep" className="input" type="time" value={wiPremDep} onChange={(e) => setWiPremDep(e.target.value)} />
                      </Field>
                    </div>
                    <div>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={candRunning || !wiPremDep || rulesInvalid}
                        onClick={() => void runWhatIf({ addPremiumTrain: { line: wiPremLine, dep: toMin(wiPremDep) } }, t('wiName_premium', { line: wiPremLine, dep: hhmm(toMin(wiPremDep)) }))}
                      >
                        <Play size={12} /> {t('runWhatIf')}
                      </button>
                    </div>
                  </div>

                  <div className="well stack">
                    <b className="small">{t('wi_freight')}</b>
                    <Slider label={t('surge')} value={wiSurge} min={1} max={2} step={0.05} format={(v) => `×${num(v, 2)}`} onChange={setWiSurge} />
                    <div>
                      <button type="button" className="btn btn-sm" disabled={candRunning || wiSurge <= 1 || rulesInvalid} onClick={() => void runWhatIf({ freightSurge: wiSurge }, t('wiName_freight', { k: num(wiSurge, 2) }))}>
                        <Play size={12} /> {t('runWhatIf')}
                      </button>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {tab === 'scenarios' && (
        <div className="stack-lg">
          <div className="row-wrap">
            <span className="small muted grow">{t('scenariosSub')}</span>
            <SimLabel kind="solver" short />
          </div>
          <div className="grid grid-auto">
            {SCENARIO_PRESETS.map((p) => {
              const id = p.id as PresetId;
              const sc = buildScenarioFromPreset(id, corridor) as Scenario | null;
              const isActive = scenario?.presetId === id;
              const isCandidate = candidate?.patch.scenario?.presetId === id;
              const ck = isCandidate ? candKpis : null;
              const eff = ck
                ? t('effectText', {
                    a: formatKpiDelta('availability', compareKpi('availability', ck, weekly.kpis).delta),
                    d: formatKpiDelta('delay', compareKpi('delay', ck, weekly.kpis).delta),
                    b: signed(ck.blockCount - weekly.kpis.blockCount),
                    tsr: formatKpiDelta('tsrDays', compareKpi('tsrDays', ck, weekly.kpis).delta),
                    m: formatKpiDelta('mandatory', compareKpi('mandatory', ck, weekly.kpis).delta),
                  })
                : isActive
                  ? t('effectActive')
                  : t('effectNone');
              return (
                <Card key={id} pastel={isActive ? 'yellow' : undefined}>
                  <CardHead
                    title={t(`p_${id}_name` as Key)}
                    sub={p.category}
                    right={
                      <span className="row-wrap">
                        {isActive && <Badge tone="warn">{t('active')}</Badge>}
                      </span>
                    }
                  />
                  <CardBody>
                    <div className="stack">
                      <p className="small" style={{ margin: 0 }}>
                        {t(`p_${id}_premise` as Key)}
                      </p>
                      <div className="small">
                        <span className="caps">{t('injects')}</span>
                        <ul className="small" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                          {(sc?.injectTasks ?? []).map((it, i) => {
                            const wt = WORK_TYPES[it.workType as keyof typeof WORK_TYPES];
                            return (
                              <li key={i}>
                                {wt?.label ?? it.workType} · km {num(it.startKm, 1)}–{num(it.endKm, 1)} · {it.line}
                                {it.tsrKmph ? ` · TSR ${it.tsrKmph} km/h` : ''}
                              </li>
                            );
                          })}
                          {sc?.speedCapKmph ? <li>{t('speedCap', { v: sc.speedCapKmph })}</li> : null}
                        </ul>
                      </div>
                      <div className="well">
                        <div className="caps">{t('effect')}</div>
                        <div className="small">{eff}</div>
                        <div className="tiny muted mt">{t('templateNote')}</div>
                      </div>
                      <div className="row-wrap">
                        <button type="button" className="btn btn-sm" disabled={candRunning} onClick={() => void handleRunPreset(id)}>
                          <Play size={12} /> {t('runScenario')}
                        </button>
                        <button type="button" className="btn btn-sm" disabled={!canPlan || planRunning || isActive} title={canPlan ? undefined : t('noCap')} onClick={() => void handleApplyPreset(id)}>
                          <Flame size={12} /> {t('applyScenario')}
                        </button>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
          {compareCard}
        </div>
      )}
    </div>
  );
}
