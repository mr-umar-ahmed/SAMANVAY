/**
 * WorkflowPage — the deck's 8-step operational workflow ("Click to explore
 * the complete operational workflow"). Public at /workflow (own minimal
 * header) and inside every staff portal at /app/<portal>/workflow (shell).
 *
 * Each step: what SAMANVAY does, the live figure from the loaded snapshot and
 * the store (never typed in), and a link to the screen that does the step.
 */
import { useEffect, useMemo, type MouseEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronRight, Languages, LogIn, Moon, RefreshCw, Sun } from 'lucide-react';
import type { PortalId } from '../../auth/portals';
import type { Snapshot } from '../../engine/types';
import { cautionOrders, workingBlocks, type WorkflowState } from '../../engine/select';
import { useAppStore, type ImportedBatch } from '../../store/useAppStore';
import { LANGS, useLang, useT } from '../../i18n';
import { common } from '../../i18n/common';
import { dateLabel, num, pct } from '../../lib/format';
import { Badge, Callout, Card, CardBody, CardFoot, CardHead, PageHeader, Spinner } from '../../components/ui';
import { SimLabel } from '../../components/ui/extras';

const strings = {
  en: {
    title: 'Operational workflow',
    lede: 'Eight steps take a maintenance need from a department’s register to a cleared possession. Each card says what SAMANVAY does at that step, shows the figure from the plan loaded on this device, and opens the screen where the step is done.',
    honestIntro: 'In this prototype the TMS, SMMS and TDMS registers, the COA timetable and the FOIS goods paths are seeded data in each system’s native fields. The planning engine runs in your browser; there is no live link to CRIS systems.',
    planFrom: 'Plan from {date}',
    seedBadge: 'Seed {seed}',
    stepsNav: 'Workflow steps',
    loopNote: 'Step 8 feeds step 1 of the next plan run.',
    stepN: 'Step {n}',
    home: 'All portals',
    liveFigures: 'On this plan',
    pending: 'Figures appear once the plan has run.',
    pendingIdle: 'The planning engine has not started yet.',
    failedShort: 'No figures: the plan did not run on this device.',
    failed: 'Planning failed on this device.',
    retry: 'Run the plan again',
    retryReason: 'Workflow page: retry after a failed run',
    openPage: 'Open {page}',
    signInTo: 'Sign in to open {page}',
    footer: 'This prototype runs in your browser with seeded, native-schema feeds. Approvals, forms, acknowledgements and execution records are kept on this device only. There is no live link to CRIS systems.',

    // step titles
    s1: 'Asset data',
    s2: 'Spatial mapping',
    s3: 'Risk scoring (ARCI)',
    s4: 'Gap prediction',
    s5: 'Block optimisation',
    s6: 'Controller approval',
    s7: 'T/409B dispatch',
    s8: 'Execution & feedback',
    s1sub: 'Records from TMS, SMMS and TDMS',
    s2sub: 'Digital corridor twin',
    s3sub: 'Asset Risk & Criticality Index',
    s4sub: 'Free windows and their reliability',
    s5sub: 'Multi-objective possession plan',
    s6sub: '24-hour string chart',
    s7sub: 'Caution orders and notifications',
    s8sub: 'Site records recalibrate the plan',

    // explanations
    s1body: 'Maintenance records arrive from the three departmental systems: TMS (track), SMMS (signalling) and TDMS (OHE). Each record is checked against the work-type catalogue and the corridor. Records that cannot be placed are rejected with a reason and a suggested fix for the owning department. Here the registers are seeded in each system’s native fields; CSV or JSON files can also be imported on the Integration page.',
    s2body: 'Every record is placed on one corridor twin: stations, block sections, OHE elementary sections and the signalling gear between them. TMS records locate by line and chainage, SMMS records by station and gear id, TDMS records by mast number. Once located on the same section and line, works of different departments can share one block.',
    s3body: 'Each work gets an ARCI score from the failure probability of its asset class (Weibull fit), the measured condition, class-weighted traffic on the section, TSR impact, days overdue and an escalation model. Safety work that is due, or already under a TSR, is marked mandatory and placed first. The models are fitted on seeded failure history.',
    s4body: 'Free windows are read from the working timetable and the FOIS goods paths for every block section and line. Each window a work could use is tested against assumed train lateness to estimate how likely it is to stay free, and against past execution records to estimate whether the works will finish in time.',
    s5body: 'The optimiser places works in the free windows and bundles works of different departments into one possession where they share a section. It weighs train delay, line downtime, unscheduled risk, TSR impact and the number of blocks. Mandatory works are held to their due day; any it cannot place is listed as a safety conflict.',
    s6body: 'Nothing becomes a possession by itself. The planning cell sends blocks for departmental concurrence; the Section Controller checks them against the 24-hour string chart and grants, grants with a changed window, or refuses with a reason. Granted blocks are locked into the COA timetable for the day.',
    s7body: 'For the working plan SAMANVAY generates the caution orders: T/409 for speed restrictions in force and T/409B for restrictions that follow machine work in a granted block. Control issues them, loco pilots acknowledge them on the field portal, and departments are notified in the app and on the device. There is no SMS gateway in this prototype.',
    s8body: 'On site the engineer-in-charge starts the possession, marks each work done with its actual minutes and clears the block. Extension requests and overruns go to Control. Actual against planned minutes recalibrate work durations on the next plan run, together with the seeded execution history.',

    // pages
    pIntegration: 'Integration (import files)',
    pTwin: 'Integration (corridor twin)',
    pRisk: 'Risk ranking',
    pCapacity: 'Corridor capacity',
    pOptimiser: 'Optimiser',
    pBoard: 'Control board',
    pCaution: 'Caution & TSR desk',
    pToday: 'Field: today',
    pAdherence: 'Adherence & log',

    // figures — step 1
    fTms: 'TMS records received',
    fSmms: 'SMMS records received',
    fTdms: 'TDMS records received',
    fNormalised: 'Works normalised',
    fRejected: 'Records rejected',
    fDq: 'Seeded data-quality test records',
    fWarnings: 'Warnings raised to departments',
    fImported: 'Imported files on this device',
    fImportedVal: '{files} files, {records} records',
    none: 'None',
    // step 2
    fStations: 'Stations',
    fSections: 'Block sections',
    fOhe: 'OHE elementary sections',
    fSignals: 'Signals',
    fPoints: 'Points',
    fTrackCircuits: 'Track circuits',
    fLc: 'LC gates',
    fNoGear: 'Signalling gear',
    fNoGearVal: 'Not in this corridor data',
    fByChainage: 'Works located by chainage (TMS)',
    fByGear: 'Works located by gear id (SMMS)',
    fByMast: 'Works located by mast (TDMS)',
    // step 3
    fScored: 'Works scored',
    fMandatory: 'Mandatory works',
    fHighRisk: 'High risk (ARCI ≥ 0.85)',
    fAuc: 'Escalation model AUC (held-out split)',
    // step 4
    fCandidates: 'Candidate windows considered',
    fReliability: 'Mean window reliability ({n} blocks)',
    fConfidence: 'Mean block confidence',
    notComputed: 'Not computed on this run',
    latenessSource: 'train lateness distribution used for window reliability',
    // step 5
    fBlocks: 'Line-closure possessions this week',
    fAllBlocks: 'All blocks, incl. power-only and disconnection',
    fScheduled: 'Works scheduled (weekly horizon)',
    fOf: '{a} of {b}',
    fSolver: 'Solver used',
    solverMilp: 'Exact MILP (HiGHS) + annealing',
    solverGreedy: 'Greedy + annealing',
    solverUnknown: 'Not recorded on this run',
    fFallback: 'Fallback',
    fColoc: 'Co-location of closure works',
    fSafety: 'Safety conflicts',
    // step 6
    fInPlan: 'Blocks in the weekly plan',
    fSent: 'Sent to Control',
    fProposed: 'Awaiting concurrence',
    fConcurred: 'Concurred, awaiting grant',
    fGranted: 'Granted',
    fLocked: 'Locked',
    fRefused: 'Refused',
    fSuperseded: 'Changed by re-plan, to send again',
    // step 7
    fOrders: 'Caution orders for {date}',
    fT409b: 'T/409B among them',
    fIssued: 'Issued',
    fAcks: 'Loco pilot acknowledgements',
    fPushed: 'Notifications sent',
    // step 8
    fStarted: 'Possessions started on this device',
    fRunning: 'Running now',
    fCleared: 'Cleared',
    fExtensions: 'Extension requests pending',
    fOverruns: 'Overrun alerts',
    fHistory: 'Seeded history records used for duration calibration',
  },
  hi: {
    title: 'परिचालन कार्य-प्रवाह',
    lede: 'आठ चरण किसी विभाग के रजिस्टर की रखरखाव ज़रूरत को एक क्लियर हुए possession तक ले जाते हैं। हर कार्ड बताता है कि उस चरण पर SAMANVAY क्या करता है, इस डिवाइस पर लोड योजना से आँकड़ा दिखाता है, और वह स्क्रीन खोलता है जहाँ यह चरण होता है।',
    honestIntro: 'इस प्रोटोटाइप में TMS, SMMS और TDMS रजिस्टर, COA समय-सारणी और FOIS माल-पथ हर सिस्टम के मूल फ़ील्ड में बीज-आधारित डेटा हैं। योजना इंजन आपके ब्राउज़र में चलता है; CRIS सिस्टम से कोई लाइव कड़ी नहीं है।',
    planFrom: 'योजना {date} से',
    seedBadge: 'बीज {seed}',
    stepsNav: 'कार्य-प्रवाह के चरण',
    loopNote: 'चरण 8 अगली योजना के चरण 1 को आगे बढ़ाता है।',
    stepN: 'चरण {n}',
    home: 'सभी पोर्टल',
    liveFigures: 'इस योजना पर',
    pending: 'योजना चलने के बाद आँकड़े दिखेंगे।',
    pendingIdle: 'योजना इंजन अभी शुरू नहीं हुआ है।',
    failedShort: 'आँकड़े नहीं: इस डिवाइस पर योजना नहीं चली।',
    failed: 'इस डिवाइस पर योजना विफल रही।',
    retry: 'योजना फिर चलाएँ',
    retryReason: 'कार्य-प्रवाह पेज: विफल रन के बाद पुनः प्रयास',
    openPage: '{page} खोलें',
    signInTo: '{page} खोलने के लिए साइन इन करें',
    footer: 'यह प्रोटोटाइप आपके ब्राउज़र में बीज-आधारित, मूल-स्कीमा फ़ीड के साथ चलता है। स्वीकृतियाँ, फ़ॉर्म, पावती और निष्पादन रिकॉर्ड केवल इसी डिवाइस पर रहते हैं। CRIS सिस्टम से कोई लाइव कड़ी नहीं है।',

    s1: 'एसेट डेटा',
    s2: 'स्थानिक मैपिंग',
    s3: 'जोखिम स्कोरिंग (ARCI)',
    s4: 'गैप पूर्वानुमान',
    s5: 'Block अनुकूलन',
    s6: 'कंट्रोलर स्वीकृति',
    s7: 'T/409B प्रेषण',
    s8: 'निष्पादन और फ़ीडबैक',
    s1sub: 'TMS, SMMS और TDMS से रिकॉर्ड',
    s2sub: 'डिजिटल कॉरिडोर ट्विन',
    s3sub: 'Asset Risk & Criticality Index',
    s4sub: 'खाली विंडो और उनकी विश्वसनीयता',
    s5sub: 'बहु-उद्देश्यीय possession योजना',
    s6sub: '24 घंटे का स्ट्रिंग चार्ट',
    s7sub: 'सतर्कता आदेश और सूचनाएँ',
    s8sub: 'साइट रिकॉर्ड योजना को फिर से अंशांकित करते हैं',

    s1body: 'रखरखाव रिकॉर्ड तीन विभागीय सिस्टम से आते हैं: TMS (ट्रैक), SMMS (सिग्नलिंग) और TDMS (OHE)। हर रिकॉर्ड को work-type सूची और कॉरिडोर से जाँचा जाता है। जो रिकॉर्ड रखे नहीं जा सकते, उन्हें कारण और सुझाए गए सुधार के साथ संबंधित विभाग को लौटाया जाता है। यहाँ रजिस्टर हर सिस्टम के मूल फ़ील्ड में बीज-आधारित हैं; Integration पेज पर CSV या JSON फ़ाइलें भी आयात की जा सकती हैं।',
    s2body: 'हर रिकॉर्ड एक कॉरिडोर ट्विन पर रखा जाता है: स्टेशन, block section, OHE elementary section और उनके बीच का सिग्नलिंग गियर। TMS रिकॉर्ड लाइन और चेनेज से, SMMS रिकॉर्ड स्टेशन और gear id से, TDMS रिकॉर्ड mast संख्या से स्थित होते हैं। एक ही section और लाइन पर स्थित होने पर अलग-अलग विभागों के कार्य एक block साझा कर सकते हैं।',
    s3body: 'हर कार्य को ARCI स्कोर मिलता है: एसेट वर्ग की विफलता संभावना (Weibull फ़िट), मापी गई स्थिति, section पर वर्ग-भारित यातायात, TSR प्रभाव, बकाया दिन और एक escalation मॉडल से। जो सुरक्षा कार्य देय है या पहले से TSR में है, वह अनिवार्य माना जाता है और पहले रखा जाता है। मॉडल बीज-आधारित विफलता इतिहास पर फ़िट हैं।',
    s4body: 'हर block section और लाइन के लिए खाली विंडो कार्य समय-सारणी और FOIS माल-पथों से पढ़ी जाती हैं। किसी कार्य की हर संभावित विंडो को मानी गई ट्रेन देरी से जाँचा जाता है कि वह खाली रहने की कितनी संभावना है, और पिछले निष्पादन रिकॉर्ड से कि कार्य समय पर पूरे होंगे या नहीं।',
    s5body: 'ऑप्टिमाइज़र कार्यों को खाली विंडो में रखता है और एक ही section वाले अलग-अलग विभागों के कार्यों को एक possession में जोड़ता है। यह ट्रेन देरी, लाइन बंदी, अनियोजित जोखिम, TSR प्रभाव और block की संख्या को तौलता है। अनिवार्य कार्य अपने देय दिन तक रखे जाते हैं; जो नहीं रखा जा सका वह सुरक्षा टकराव के रूप में दिखता है।',
    s6body: 'कुछ भी अपने आप possession नहीं बनता। योजना प्रकोष्ठ block को विभागीय सहमति के लिए भेजता है; Section Controller उन्हें 24 घंटे के स्ट्रिंग चार्ट पर जाँचकर स्वीकृत करता है, बदली विंडो के साथ स्वीकृत करता है, या कारण सहित अस्वीकार करता है। स्वीकृत block उस दिन की COA समय-सारणी में लॉक होते हैं।',
    s7body: 'कार्य योजना से SAMANVAY सतर्कता आदेश बनाता है: लागू गति प्रतिबंधों के लिए T/409 और स्वीकृत block में मशीन कार्य के बाद के प्रतिबंधों के लिए T/409B। Control इन्हें जारी करता है, लोको पायलट फ़ील्ड पोर्टल पर पावती देते हैं, और विभागों को ऐप और डिवाइस पर सूचना मिलती है। इस प्रोटोटाइप में SMS गेटवे नहीं है।',
    s8body: 'साइट पर engineer-in-charge possession शुरू करता है, हर कार्य के वास्तविक मिनट के साथ उसे पूरा दर्ज करता है और block क्लियर करता है। विस्तार अनुरोध और ओवररन Control को जाते हैं। वास्तविक बनाम नियोजित मिनट, बीज-आधारित निष्पादन इतिहास के साथ, अगली योजना में कार्य अवधि को फिर से अंशांकित करते हैं।',

    pIntegration: 'Integration (फ़ाइल आयात)',
    pTwin: 'Integration (कॉरिडोर ट्विन)',
    pRisk: 'जोखिम रैंकिंग',
    pCapacity: 'कॉरिडोर क्षमता',
    pOptimiser: 'ऑप्टिमाइज़र',
    pBoard: 'Control बोर्ड',
    pCaution: 'सतर्कता व TSR डेस्क',
    pToday: 'फ़ील्ड: आज',
    pAdherence: 'पालन व लॉग',

    fTms: 'TMS रिकॉर्ड प्राप्त',
    fSmms: 'SMMS रिकॉर्ड प्राप्त',
    fTdms: 'TDMS रिकॉर्ड प्राप्त',
    fNormalised: 'सामान्यीकृत कार्य',
    fRejected: 'अस्वीकृत रिकॉर्ड',
    fDq: 'बीज-आधारित डेटा-गुणवत्ता परीक्षण रिकॉर्ड',
    fWarnings: 'विभागों को भेजी चेतावनियाँ',
    fImported: 'इस डिवाइस पर आयातित फ़ाइलें',
    fImportedVal: '{files} फ़ाइलें, {records} रिकॉर्ड',
    none: 'कोई नहीं',
    fStations: 'स्टेशन',
    fSections: 'Block section',
    fOhe: 'OHE elementary section',
    fSignals: 'सिग्नल',
    fPoints: 'पॉइंट',
    fTrackCircuits: 'ट्रैक सर्किट',
    fLc: 'LC गेट',
    fNoGear: 'सिग्नलिंग गियर',
    fNoGearVal: 'इस कॉरिडोर डेटा में नहीं',
    fByChainage: 'चेनेज से स्थित कार्य (TMS)',
    fByGear: 'gear id से स्थित कार्य (SMMS)',
    fByMast: 'mast से स्थित कार्य (TDMS)',
    fScored: 'स्कोर किए गए कार्य',
    fMandatory: 'अनिवार्य कार्य',
    fHighRisk: 'उच्च जोखिम (ARCI ≥ 0.85)',
    fAuc: 'Escalation मॉडल AUC (अलग रखा डेटा)',
    fCandidates: 'विचार की गई संभावित विंडो',
    fReliability: 'औसत विंडो विश्वसनीयता ({n} block)',
    fConfidence: 'औसत block विश्वास',
    notComputed: 'इस रन में गणना नहीं हुई',
    latenessSource: 'विंडो विश्वसनीयता के लिए मानी गई ट्रेन देरी',
    fBlocks: 'इस सप्ताह लाइन-बंदी possession',
    fAllBlocks: 'सभी block, power-only और disconnection सहित',
    fScheduled: 'निर्धारित कार्य (साप्ताहिक अवधि)',
    fOf: '{b} में से {a}',
    fSolver: 'प्रयुक्त सॉल्वर',
    solverMilp: 'Exact MILP (HiGHS) + annealing',
    solverGreedy: 'Greedy + annealing',
    solverUnknown: 'इस रन में दर्ज नहीं',
    fFallback: 'वैकल्पिक रास्ता',
    fColoc: 'लाइन-बंदी कार्यों का सह-स्थान',
    fSafety: 'सुरक्षा टकराव',
    fInPlan: 'साप्ताहिक योजना में block',
    fSent: 'Control को भेजे गए',
    fProposed: 'सहमति की प्रतीक्षा',
    fConcurred: 'सहमत, स्वीकृति की प्रतीक्षा',
    fGranted: 'स्वीकृत',
    fLocked: 'लॉक',
    fRefused: 'अस्वीकृत',
    fSuperseded: 'पुनः-योजना से बदले, फिर भेजने हैं',
    fOrders: '{date} के सतर्कता आदेश',
    fT409b: 'इनमें T/409B',
    fIssued: 'जारी',
    fAcks: 'लोको पायलट पावती',
    fPushed: 'भेजी गई सूचनाएँ',
    fStarted: 'इस डिवाइस पर शुरू हुए possession',
    fRunning: 'अभी चल रहे',
    fCleared: 'क्लियर',
    fExtensions: 'लंबित विस्तार अनुरोध',
    fOverruns: 'ओवररन अलर्ट',
    fHistory: 'अवधि अंशांकन में प्रयुक्त बीज-आधारित इतिहास रिकॉर्ड',
  },
} as const;

type K = keyof typeof strings.en;

interface StepLink {
  portal: PortalId;
  route: string;
  page: K;
}

interface StepDef {
  n: number;
  title: K;
  sub: K;
  body: K;
  /** pastel of the step number: data / planning / control / field */
  tone: 'blue' | 'lavender' | 'yellow' | 'green';
  links: StepLink[];
}

const STEPS: StepDef[] = [
  { n: 1, title: 's1', sub: 's1sub', body: 's1body', tone: 'blue', links: [{ portal: 'planning', route: '/app/planning/integration?tab=import', page: 'pIntegration' }] },
  { n: 2, title: 's2', sub: 's2sub', body: 's2body', tone: 'blue', links: [{ portal: 'planning', route: '/app/planning/integration?tab=twin', page: 'pTwin' }] },
  { n: 3, title: 's3', sub: 's3sub', body: 's3body', tone: 'lavender', links: [{ portal: 'planning', route: '/app/planning/risk', page: 'pRisk' }] },
  { n: 4, title: 's4', sub: 's4sub', body: 's4body', tone: 'lavender', links: [{ portal: 'planning', route: '/app/planning/capacity', page: 'pCapacity' }] },
  { n: 5, title: 's5', sub: 's5sub', body: 's5body', tone: 'lavender', links: [{ portal: 'planning', route: '/app/planning/optimiser', page: 'pOptimiser' }] },
  { n: 6, title: 's6', sub: 's6sub', body: 's6body', tone: 'yellow', links: [{ portal: 'control', route: '/app/control/board', page: 'pBoard' }] },
  { n: 7, title: 's7', sub: 's7sub', body: 's7body', tone: 'yellow', links: [{ portal: 'control', route: '/app/control/caution', page: 'pCaution' }] },
  {
    n: 8,
    title: 's8',
    sub: 's8sub',
    body: 's8body',
    tone: 'green',
    links: [
      { portal: 'field', route: '/app/field/today', page: 'pToday' },
      { portal: 'planning', route: '/app/planning/adherence', page: 'pAdherence' },
    ],
  },
];

const ISSUED_STATES = new Set(['ISSUED', 'ACKNOWLEDGED', 'RECEIVED']);

interface Row {
  label: string;
  value: string;
}

/** Normaliser counts carry dq / warnings on newer engines; the TS type may lag. */
type CountsV4 = Snapshot['counts'] & { dq?: number; warnings?: number };

const hasText = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

export default function WorkflowPage() {
  const t = useT(strings);
  const tc = useT(common);
  const lang = useLang();
  const loc = useLocation();
  const inShell = loc.pathname.startsWith('/app/');

  const snapshot = useAppStore((s) => s.snapshot);
  const planStatus = useAppStore((s) => s.planStatus);
  const planProgress = useAppStore((s) => s.planProgress);
  const planError = useAppStore((s) => s.planError);
  const runPlan = useAppStore((s) => s.runPlan);
  const user = useAppStore((s) => s.user);
  const approvals = useAppStore((s) => s.approvals);
  const tsrs = useAppStore((s) => s.tsrs);
  const forms = useAppStore((s) => s.forms);
  const acks = useAppStore((s) => s.acks);
  const pushed = useAppStore((s) => s.pushed);
  const executionLog = useAppStore((s) => s.executionLog);
  const extensions = useAppStore((s) => s.extensions);
  const importedFeeds = useAppStore((s) => s.importedFeeds);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const setLanguage = useAppStore((s) => s.setLanguage);

  /** Every figure below is derived here from the snapshot and the store. */
  const data = useMemo(() => {
    if (!snapshot) return null;
    const corridor = snapshot.corridor;
    const counts = snapshot.counts as CountsV4;
    const imports = Object.values(importedFeeds).filter((b): b is ImportedBatch => !!b && b.corridorId === corridor.id);
    const signals = corridor.signals ?? null;
    const kindCount = (pred: (k: string) => boolean) => (signals ? signals.filter((s) => pred(s.kind)).length : 0);
    const tasks = snapshot.tasks;
    const weekly = snapshot.result.weekly;
    const ai = weekly.ai;
    const kpis = weekly.kpis;
    const withConf = ai.blocks.filter((b) => b.confidence && Number.isFinite(b.confidence.windowReliability));
    const blocks = workingBlocks(snapshot, approvals);
    const byState = (st: WorkflowState) => blocks.filter((b) => b.state === st).length;
    const orders = cautionOrders(snapshot, blocks, tsrs, forms, 0);
    const exec = executionLog.filter((r) => r.corridorId === corridor.id);
    return {
      corridorName: corridor.name,
      planStart: snapshot.planStart,
      seed: snapshot.seed,
      // 1
      tms: counts.TMS,
      smms: counts.SMMS,
      tdms: counts.TDMS,
      normalised: counts.total,
      rejected: counts.rejected,
      dq: typeof counts.dq === 'number' ? counts.dq : null,
      warnings: typeof counts.warnings === 'number' ? counts.warnings : null,
      importFiles: imports.length,
      importRecords: imports.reduce((s, b) => s + b.records.length, 0),
      // 2
      stations: corridor.stations.length,
      sections: corridor.blockSections.length,
      ohe: corridor.oheSections.length,
      hasSignals: !!signals,
      signals: kindCount((k) => k !== 'POINT' && k !== 'TRACK_CIRCUIT' && k !== 'LC_GATE'),
      points: kindCount((k) => k === 'POINT'),
      trackCircuits: kindCount((k) => k === 'TRACK_CIRCUIT'),
      lcGates: kindCount((k) => k === 'LC_GATE'),
      byChainage: tasks.filter((x) => hasText(x.metrics?.chainageFrom)).length,
      byGear: tasks.filter((x) => hasText(x.metrics?.gearId)).length,
      byMast: tasks.filter((x) => hasText(x.metrics?.mastFrom)).length,
      // 3
      scored: tasks.length,
      mandatory: tasks.filter((x) => x.risk.mandatory).length,
      highRisk: tasks.filter((x) => x.risk.arci >= 0.85).length,
      auc: snapshot.models?.escalationMetrics?.test?.auc ?? null,
      // 4
      candidates: ai.search.candidateCount,
      reliabilityBlocks: withConf.length,
      meanReliability: withConf.length ? withConf.reduce((s, b) => s + (b.confidence?.windowReliability ?? 0), 0) / withConf.length : null,
      meanConfidence: typeof kpis.meanBlockConfidence === 'number' ? kpis.meanBlockConfidence : null,
      // 5
      blockCount: kpis.blockCount,
      allBlocks: ai.blocks.length,
      scheduled: kpis.tasksScheduled,
      total: kpis.tasksTotal,
      solver: ai.search.solver ?? null,
      fallbackReason: ai.search.fallbackReason ?? null,
      coloc: kpis.colocationRate,
      safetyConflicts: (ai.safetyConflicts ?? []).length,
      // 6
      inPlan: blocks.length,
      sent: blocks.filter((b) => b.state !== 'DRAFT').length,
      proposed: byState('PROPOSED'),
      concurred: byState('CONCURRED'),
      granted: byState('GRANTED'),
      locked: byState('LOCKED'),
      refused: byState('REFUSED'),
      superseded: byState('SUPERSEDED'),
      // 7
      orders: orders.length,
      t409b: orders.filter((o) => o.formType === 'T/409B').length,
      issued: orders.filter((o) => ISSUED_STATES.has(o.status)).length,
      acks: acks.length,
      pushed: pushed.length,
      // 8
      started: exec.length,
      running: exec.filter((r) => r.status === 'IN_PROGRESS').length,
      cleared: exec.filter((r) => r.status === 'COMPLETED' || r.status === 'CLOSED').length,
      extensionsPending: extensions.filter((e) => e.status === 'PENDING').length,
      overruns: (snapshot.anomalies ?? []).filter((a) => a.kind === 'OVERRUN').length,
      history: snapshot.feeds.executionLog.length,
    };
  }, [snapshot, approvals, tsrs, forms, acks, pushed, executionLog, extensions, importedFeeds]);

  const figures = useMemo((): Record<number, Row[]> | null => {
    if (!data) return null;
    const solverText = data.solver === 'milp+sa' ? t('solverMilp') : data.solver === 'greedy+sa' ? t('solverGreedy') : t('solverUnknown');
    return {
      1: [
        { label: t('fTms'), value: num(data.tms) },
        { label: t('fSmms'), value: num(data.smms) },
        { label: t('fTdms'), value: num(data.tdms) },
        { label: t('fNormalised'), value: num(data.normalised) },
        { label: t('fRejected'), value: num(data.rejected) },
        ...(data.dq !== null ? [{ label: t('fDq'), value: num(data.dq) }] : []),
        ...(data.warnings !== null ? [{ label: t('fWarnings'), value: num(data.warnings) }] : []),
        { label: t('fImported'), value: data.importFiles ? t('fImportedVal', { files: num(data.importFiles), records: num(data.importRecords) }) : t('none') },
      ],
      2: [
        { label: t('fStations'), value: num(data.stations) },
        { label: t('fSections'), value: num(data.sections) },
        { label: t('fOhe'), value: num(data.ohe) },
        ...(data.hasSignals
          ? [
              { label: t('fSignals'), value: num(data.signals) },
              { label: t('fPoints'), value: num(data.points) },
              { label: t('fTrackCircuits'), value: num(data.trackCircuits) },
              { label: t('fLc'), value: num(data.lcGates) },
            ]
          : [{ label: t('fNoGear'), value: t('fNoGearVal') }]),
        { label: t('fByChainage'), value: num(data.byChainage) },
        { label: t('fByGear'), value: num(data.byGear) },
        { label: t('fByMast'), value: num(data.byMast) },
      ],
      3: [
        { label: t('fScored'), value: num(data.scored) },
        { label: t('fMandatory'), value: num(data.mandatory) },
        { label: t('fHighRisk'), value: num(data.highRisk) },
        { label: t('fAuc'), value: data.auc !== null && Number.isFinite(data.auc) ? num(data.auc, 2) : t('notComputed') },
      ],
      4: [
        { label: t('fCandidates'), value: num(data.candidates) },
        { label: t('fReliability', { n: num(data.reliabilityBlocks) }), value: data.meanReliability !== null ? pct(data.meanReliability) : t('notComputed') },
        { label: t('fConfidence'), value: data.meanConfidence !== null ? pct(data.meanConfidence) : t('notComputed') },
      ],
      5: [
        { label: t('fBlocks'), value: num(data.blockCount) },
        { label: t('fAllBlocks'), value: num(data.allBlocks) },
        { label: t('fScheduled'), value: t('fOf', { a: num(data.scheduled), b: num(data.total) }) },
        { label: t('fSolver'), value: solverText },
        { label: t('fColoc'), value: pct(data.coloc) },
        { label: t('fSafety'), value: num(data.safetyConflicts) },
      ],
      6: [
        { label: t('fInPlan'), value: num(data.inPlan) },
        { label: t('fSent'), value: num(data.sent) },
        { label: t('fProposed'), value: num(data.proposed) },
        { label: t('fConcurred'), value: num(data.concurred) },
        { label: t('fGranted'), value: num(data.granted) },
        { label: t('fLocked'), value: num(data.locked) },
        { label: t('fRefused'), value: num(data.refused) },
        ...(data.superseded ? [{ label: t('fSuperseded'), value: num(data.superseded) }] : []),
      ],
      7: [
        { label: t('fOrders', { date: dateLabel(data.planStart) }), value: num(data.orders) },
        { label: t('fT409b'), value: num(data.t409b) },
        { label: t('fIssued'), value: t('fOf', { a: num(data.issued), b: num(data.orders) }) },
        { label: t('fAcks'), value: num(data.acks) },
        { label: t('fPushed'), value: num(data.pushed) },
      ],
      8: [
        { label: t('fStarted'), value: num(data.started) },
        { label: t('fRunning'), value: num(data.running) },
        { label: t('fCleared'), value: num(data.cleared) },
        { label: t('fExtensions'), value: num(data.extensionsPending) },
        { label: t('fOverruns'), value: num(data.overruns) },
        { label: t('fHistory'), value: num(data.history) },
      ],
    };
  }, [data, t]);

  // Open a deep link like /workflow#step-5 at that card.
  useEffect(() => {
    const m = /^#step-([1-8])$/.exec(loc.hash);
    if (!m) return;
    document.getElementById(`step-${m[1]}`)?.scrollIntoView({ block: 'start' });
  }, [loc.hash]);

  const jump = (n: number) => (e: MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById(`step-${n}`);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.history.replaceState(window.history.state, '', `${loc.pathname}${loc.search}#step-${n}`);
  };

  const canOpen = (portal: PortalId) => !!user && (user.portal === portal || user.role === 'DRM' || user.role === 'ADMIN');

  const seed = snapshot?.seed;

  const honesty = (n: number) => {
    switch (n) {
      case 1:
        return <SimLabel kind="seededFeed" system="TMS / SMMS / TDMS" seed={seed} />;
      case 2:
        return <SimLabel kind="seededFeed" system="TMS / SMMS / TDMS" seed={seed} />;
      case 3:
        return <SimLabel kind="model" />;
      case 4:
        return <SimLabel kind="assumption" source={t('latenessSource')} />;
      case 5:
        return <SimLabel kind="solver" />;
      case 6:
      case 7:
        return <SimLabel kind="localOnly" />;
      case 8:
        return (
          <>
            <SimLabel kind="seededRecords" />
            <SimLabel kind="localOnly" />
          </>
        );
      default:
        return null;
    }
  };

  const figureBlock = (n: number) => {
    const rows = figures?.[n];
    if (rows) {
      return (
        <div className="well">
          <div className="caps mb">{t('liveFigures')}</div>
          <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 6 }}>
            {rows.map((r) => (
              <li key={r.label} className="row small" style={{ alignItems: 'baseline' }}>
                <span className="grow muted">{r.label}</span>
                <span className="num strong" style={{ textAlign: 'right' }}>{r.value}</span>
              </li>
            ))}
          </ul>
          {n === 5 && data?.fallbackReason && (
            <div className="tiny muted mt">
              <b>{t('fFallback')}:</b> {data.fallbackReason}
            </div>
          )}
        </div>
      );
    }
    if (planStatus === 'error') return <div className="well small muted">{t('failedShort')}</div>;
    return (
      <div className="well small">
        <div className="row">
          {planStatus === 'running' && <Spinner size={14} />}
          <span className="strong">{t('pending')}</span>
        </div>
        <div className="tiny muted mt">{planProgress || (planStatus === 'idle' ? t('pendingIdle') : '')}</div>
      </div>
    );
  };

  const stepStrip = (
    <nav aria-label={t('stepsNav')} className="stack" data-tour="workflow-steps">
      <div className="row-wrap">
        {STEPS.map((s, i) => (
          <span key={s.n} className="row">
            <a href={`#step-${s.n}`} onClick={jump(s.n)} className="btn btn-sm btn-outline">
              <span className={`badge badge-pill badge-${s.tone} num`}>{s.n}</span>
              {t(s.title)}
            </a>
            {i < STEPS.length - 1 && <ChevronRight size={14} className="dim hide-mobile" aria-hidden="true" />}
          </span>
        ))}
      </div>
      <div className="tiny muted">{t('loopNote')}</div>
    </nav>
  );

  const errorCallout = planStatus === 'error' && (
    <Callout tone="crit">
      <div className="row-wrap">
        <span className="grow">
          <b>{t('failed')}</b>
          {planError ? ` ${planError}` : ''}
        </span>
        <button type="button" className="btn btn-sm" onClick={() => void runPlan({ reason: t('retryReason') })}>
          <RefreshCw />
          {t('retry')}
        </button>
      </div>
    </Callout>
  );

  const cards = (
    <div className="grid grid-2">
      {STEPS.map((s) => (
        <section key={s.n} id={`step-${s.n}`} style={{ scrollMarginTop: 72, minWidth: 0 }} aria-labelledby={`step-${s.n}-title`}>
          <Card style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardHead
              icon={<span className={`badge badge-pill badge-${s.tone} num strong`} aria-label={t('stepN', { n: s.n })}>{s.n}</span>}
              title={<span id={`step-${s.n}-title`}>{t(s.title)}</span>}
              sub={t(s.sub)}
              right={<span className="row-wrap" style={{ justifyContent: 'flex-end' }}>{honesty(s.n)}</span>}
            />
            <CardBody className="grow stack">
              <p className="small" style={{ margin: 0 }}>{t(s.body)}</p>
              {figureBlock(s.n)}
            </CardBody>
            <CardFoot>
              {s.links.map((l) => {
                const ok = canOpen(l.portal);
                const to = ok ? l.route : `/login?next=${encodeURIComponent(l.route)}`;
                return (
                  <Link key={l.route} to={to} className="btn btn-sm">
                    {ok ? <ArrowRight /> : <LogIn />}
                    {ok ? t('openPage', { page: t(l.page) }) : t('signInTo', { page: t(l.page) })}
                  </Link>
                );
              })}
            </CardFoot>
          </Card>
        </section>
      ))}
    </div>
  );

  const contextBadges = data ? (
    <>
      <Badge tone="gray">{data.corridorName}</Badge>
      <Badge tone="outline">{t('planFrom', { date: dateLabel(data.planStart) })}</Badge>
      <Badge tone="outline">
        <span className="mono">{t('seedBadge', { seed: data.seed })}</span>
      </Badge>
    </>
  ) : null;

  const footer = (
    <div className="row-wrap small muted" style={{ alignItems: 'flex-start' }}>
      <SimLabel kind="localOnly" />
      <span className="grow">{t('footer')}</span>
    </div>
  );

  if (inShell) {
    return (
      <div className="stack-lg">
        <PageHeader title={t('title')} lede={t('lede')} badges={contextBadges} />
        <div className="small muted">{t('honestIntro')}</div>
        {errorCallout}
        {stepStrip}
        {cards}
        {footer}
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <header className="citizen-top" style={{ maxWidth: 1100, margin: '0 auto', borderBottom: 'none', background: 'var(--bg)' }}>
        <Link to="/" className="row" style={{ color: 'inherit', textDecoration: 'none', minWidth: 0 }} aria-label={t('home')}>
          <img src="/favicon.svg" alt="" width={32} height={32} style={{ borderRadius: 8 }} />
        </Link>
        <div className="grow">
          <div style={{ fontWeight: 700, letterSpacing: '0.05em' }}>
            SAMANVAY <span style={{ fontWeight: 500, letterSpacing: 0, color: 'var(--ink-3)' }}>समन्वय</span>
          </div>
          <div className="tiny muted truncate">{tc('ps')}</div>
        </div>
        <label className="btn btn-sm btn-ghost" style={{ position: 'relative' }}>
          <Languages />
          <span>{LANGS.find((l) => l.code === lang)?.native}</span>
          <select value={lang} onChange={(e) => setLanguage(e.target.value as typeof lang)} aria-label={tc('language')} style={{ position: 'absolute', inset: 0, opacity: 0 }}>
            {LANGS.filter((l) => l.scope === 'all').map((l) => (
              <option key={l.code} value={l.code}>
                {l.native}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-sm btn-ghost btn-icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={tc('theme')}>
          {theme === 'dark' ? <Sun /> : <Moon />}
        </button>
        <Link to="/" className="btn btn-sm btn-ghost" aria-label={t('home')}>
          <ArrowLeft />
          <span className="hide-mobile">{t('home')}</span>
        </Link>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 16px 48px' }} className="stack-lg">
        <div style={{ maxWidth: 760 }} className="stack">
          {contextBadges && <div className="row-wrap">{contextBadges}</div>}
          <h1 style={{ fontSize: 'clamp(26px, 3.6vw, 40px)', letterSpacing: '-0.02em' }}>{t('title')}</h1>
          <p className="muted" style={{ fontSize: 15, margin: 0 }}>{t('lede')}</p>
          <p className="small muted" style={{ margin: 0 }}>{t('honestIntro')}</p>
        </div>
        {errorCallout}
        {stepStrip}
        {cards}
        {footer}
      </main>
    </div>
  );
}
