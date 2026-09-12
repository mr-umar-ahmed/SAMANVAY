/**
 * FieldTodayPage — the field portal's first screen (mobile, sunlight theme).
 *
 *  Gang view: the possession granted to my gang (crew match on the working
 *  blocks), Start → Done → Clear recorded in the execution log, a site
 *  checklist that gates Start and Clear, message to Control, and TSRs on the
 *  gang's reach.
 *  Loco pilot view: my train (remembered), caution orders on its route in
 *  running order with Acknowledge, and today's blocks on the route with the
 *  delay model's regulation.
 *
 * Nothing here is invented: windows, works, partners, forms, speeds and delays
 * come from the snapshot and the workflow slices; times are what the user
 * recorded.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock, FileText, Flame, HardHat, MessageSquare, Play, ShieldCheck, Timer, Train as TrainIcon, Wifi, WifiOff, Zap } from 'lucide-react';
import { useAppStore, type ExtensionRequest, type PowerBlockStatus } from '../../store/useAppStore';
import { can } from '../../auth/portals';
import { acksForOrder, blocksMetByTrain, blocksRunningPastEnd, cautionOrders, disconnectionNotices, messagesForBlock, workingBlocks, type CautionOrder, type WorkingBlock } from '../../engine/select';
import type { AffectedTrain, Crew, Dept, Train } from '../../engine/types';
import { useT } from '../../i18n';
import { duration, hhmm, kmRange, nowMinuteIST } from '../../lib/format';
import { Badge, Callout, Card, CardBody, CardHead, DeptBadge, EmptyState, KeyValue, Modal, PageHeader, PlanPending, Segmented, type Tone } from '../../components/ui';
import { SimLabel, Timeline } from '../../components/ui/extras';
import { BlockDrawer } from '../../components/domain/BlockDrawer';
import { useDrawerParams } from '../../components/domain/useDrawerParams';

const THEME_KEY = 'samanvay.field.theme';
const CREW_KEY = 'samanvay.field.crew';
const BEAT_LIMIT = 6;

type Mode = 'gang' | 'lp';
type Checklist = { blocked: boolean; protection: boolean; workDone: boolean; lineFit: boolean };
const EMPTY_CHECKLIST: Checklist = { blocked: false, protection: false, workDone: false, lineFit: false };

const strings = {
  en: {
    titleGang: 'Today’s possession',
    titleLp: 'Today’s run',
    modeGang: 'Gang',
    modeLp: 'Loco pilot',
    online: 'Online',
    offline: 'Offline — records stay on this phone',
    myGang: 'My gang',
    chooseGang: 'Choose your gang',
    chooseGangBody: 'Pick your gang to see its possession.',
    gangGranted: '{n} granted this week',
    noBlockToday: 'No block for your gang today.',
    noBlockNext: 'Next: {day} {window} {section}.',
    noBlockWeek: 'No block has been granted to your gang this week.',
    awaitingTitle: 'Planned for your gang, awaiting Control',
    plannedFor: 'Planned for {date}. Record Start only when the line is handed over.',
    nextTitle: 'Next possession',
    section: 'Block section',
    line: 'Line',
    window: 'Granted window',
    works: 'Works',
    blockRef: 'Block ref',
    partners: 'Partners',
    incharge: 'In-charge',
    notRecorded: 'Not recorded',
    machine: 'Machine',
    manual: 'Manual (no machine)',
    t351: 'T/351 disconnection',
    notNeeded: 'Not needed',
    power: 'Power block',
    speedAfter: 'Speed after block',
    speedT409b: '{v} km/h caution (T/409B)',
    speedNormal: 'Normal — sectional MPS {v} km/h',
    liftsTsr: 'Lifts TSR {v} km/h, {km}',
    stGranted: 'Granted',
    stLocked: 'Locked',
    stProposed: 'Awaiting Control',
    stInProgress: 'In progress',
    stCleared: 'Line clear',
    tlGranted: 'Granted',
    tlStart: 'Start',
    tlDone: 'Done',
    tlClear: 'Clear',
    tlFull: 'fit for full speed',
    tlTsr: 'fit for {v} km/h',
    btnStart: 'Start possession',
    btnDone: 'Work done',
    btnClear: 'Clear line',
    hintNoExecute: 'Your role cannot record Start, Done or Clear.',
    hintNotGranted: 'Start is available once Control grants this block.',
    hintChkStart: 'Tick “line blocked” and “protection placed” to start.',
    hintChkClear: 'Tick “work done” and “line fit” to clear.',
    hintCleared: 'Line handed back to Control.',
    checklist: 'Site checklist',
    chkBlocked: 'Line blocked by the Station Master',
    chkProtection: 'Protection placed (banner flags, detonators)',
    chkWorkDone: 'Work done, fittings secured',
    chkLineFit: 'Line fit — men, tools and machines clear',
    msgControl: 'Message Control',
    reportIssue: 'Report issue',
    blockDetails: 'Block details',
    toastStart: 'Start recorded {hhmm}',
    toastDone: 'Work complete recorded',
    toastClear: 'Line clear sent to Control',
    toastMsg: 'Message sent to Control',
    toastAck: 'Caution order {no} acknowledged',
    doneTitle: 'Work done — actual minutes',
    doneHint: 'Planned minutes are filled in; change them to what each work actually took.',
    plannedMin: 'planned {n} min',
    confirmDone: 'Record work done',
    clearTitle: 'Clear the line',
    fitFull: 'Full speed',
    fitTsr: 'With a speed restriction',
    fitFullNote: 'Line fit for the sectional MPS of {v} km/h.',
    tsrSpeed: 'TSR speed (km/h)',
    fromKm: 'From km',
    toKm: 'To km',
    remarks: 'Remarks / overrun cause (optional)',
    t351Warn: 'T/351 reconnection is not recorded for this block. You can still clear; Control is told with your remarks.',
    t351Msg: 'Line cleared with T/351 reconnection not recorded',
    tsrInvalid: 'Enter a speed above 0 and below the sectional MPS of {v} km/h, and a km range on the corridor.',
    tsrReason: 'Speed restriction on lifting block {id}',
    confirmClear: 'Send line clear to Control',
    msgTitle: 'Message to Control',
    msgPlaceholder: 'What should Control know?',
    quick1: 'Protection placed',
    quick2: 'Machine on site',
    quick3: 'Block extension needed',
    send: 'Send',
    cancel: 'Cancel',
    tsrBeat: 'TSRs on my beat',
    tsrBeatSub: 'Within the reach of {crew}, {km}',
    tsrBeatAll: 'Whole corridor',
    tsrNone: 'No caution order on your beat today.',
    issued: 'Issued',
    draft: 'Draft — not issued by Control',
    allCautions: 'All caution orders',
    weekTitle: 'My gang this week',
    localNote: 'Records are stored in this browser; multi-device sync needs a server.',
    lpTrain: 'Train number',
    lpEnter: 'Enter your train number.',
    lpNotFound: 'No train {no} in this corridor’s timetable.',
    lpCautions: 'Caution orders on your route',
    lpCautionsNone: 'No caution order on your route today.',
    lpBlocks: 'Blocks on your route today',
    lpBlocksNone: 'No block on your route today.',
    lpHeld: '{mode}, about {n} min',
    lpNoHold: 'Passes during the window; no hold computed',
    modeSLW: 'Single-line working',
    modeHELD: 'Held',
    modeREGULATED: 'Regulated',
    lpNote: 'View of the generated caution order, not the signed T/409 handed over at the station.',
    ack: 'Acknowledge',
    acked: 'Acknowledged',
    openTrain: 'Full run',
    inForceDays: 'in force {n} d',
    show: 'Show',
    extAsk: 'Ask Control for more time',
    extTitle: 'Ask Control for more time',
    extMinutes: 'Extra minutes (5–240)',
    extReason: 'Reason',
    extReasonPh: 'Why is more time needed? (e.g. rail cut took longer, machine breakdown)',
    extNewEnd: 'The block would end at {end} instead of {was}.',
    extInvalid: 'Ask for 5 to 240 minutes and give a reason.',
    extSend: 'Send request',
    extToast: 'Extension of {n} min asked · {id}',
    extToastBody: 'Control decides; you will be notified here.',
    extHeading: 'Extension requests',
    extPending: '+{n} min asked at {time} — waiting for Control',
    extApproved: '+{n} min granted by {by} at {time}',
    extRefused: '+{n} min refused by {by} at {time}',
    extControlNote: 'Control: {note}',
    extWaiting: 'A request is already waiting for Control.',
    extNotInProgress: 'Available while the possession is in progress.',
    extended: 'Extended by {n} min',
    runningLate: 'Running {n} min past the granted end ({end}). Ask Control for more time or clear the line.',
    thread: 'Messages with Control',
    threadSub: 'This block’s site messages and Control’s replies',
    threadNone: 'No messages on this block yet.',
    fromControl: 'Control',
    fromSite: 'Site',
    pbNONE: 'Not recorded',
    pbPENDING: 'Pending',
    pbDEENERGISED: 'De-energised (permit to work)',
    pbENERGISED: 'Energised',
    powerWarnTitle: 'Power block not recorded as de-energised',
    powerWarn: 'This block needs OHE isolation. The power-block record is: {status}. Do not work near OHE until TRD confirms the power block and the permit to work.',
    powerConfirmTitle: 'Start without a de-energised power-block record?',
    powerConfirmBody: 'The power-block record for {id} ({isolation}) is: {status}. Start only if the OHE has been isolated and earthed on site and TRD has issued the permit to work. Your Start is recorded and Control is told the record was not de-energised.',
    powerConfirmBtn: 'Start — isolation confirmed on site',
    powerMsg: 'Possession started with the power-block record {status} (isolation confirmed on site by {name})',
  },
  hi: {
    titleGang: 'आज का पज़ेशन',
    titleLp: 'आज की यात्रा',
    modeGang: 'गैंग',
    modeLp: 'लोको पायलट',
    online: 'ऑनलाइन',
    offline: 'ऑफ़लाइन — रिकॉर्ड इसी फ़ोन में रहेंगे',
    myGang: 'मेरी गैंग',
    chooseGang: 'अपनी गैंग चुनें',
    chooseGangBody: 'पज़ेशन देखने के लिए अपनी गैंग चुनें।',
    gangGranted: 'इस सप्ताह {n} स्वीकृत',
    noBlockToday: 'आज आपकी गैंग के लिए कोई ब्लॉक नहीं।',
    noBlockNext: 'अगला: {day} {window} {section}।',
    noBlockWeek: 'इस सप्ताह आपकी गैंग को कोई ब्लॉक स्वीकृत नहीं हुआ।',
    awaitingTitle: 'आपकी गैंग के लिए नियोजित, कंट्रोल की स्वीकृति लंबित',
    plannedFor: '{date} के लिए नियोजित। लाइन सौंपे जाने पर ही Start दर्ज करें।',
    nextTitle: 'अगला पज़ेशन',
    section: 'ब्लॉक सेक्शन',
    line: 'लाइन',
    window: 'स्वीकृत समय',
    works: 'कार्य',
    blockRef: 'ब्लॉक संदर्भ',
    partners: 'साझेदार विभाग',
    incharge: 'प्रभारी',
    notRecorded: 'दर्ज नहीं',
    machine: 'मशीन',
    manual: 'मैनुअल (मशीन नहीं)',
    t351: 'T/351 डिसकनेक्शन',
    notNeeded: 'आवश्यक नहीं',
    power: 'पावर ब्लॉक',
    speedAfter: 'ब्लॉक के बाद गति',
    speedT409b: '{v} km/h सतर्कता (T/409B)',
    speedNormal: 'सामान्य — सेक्शनल MPS {v} km/h',
    liftsTsr: 'TSR {v} km/h हटेगा, {km}',
    stGranted: 'स्वीकृत',
    stLocked: 'लॉक',
    stProposed: 'कंट्रोल की स्वीकृति लंबित',
    stInProgress: 'कार्य जारी',
    stCleared: 'लाइन क्लियर',
    tlGranted: 'स्वीकृत',
    tlStart: 'Start',
    tlDone: 'Done',
    tlClear: 'Clear',
    tlFull: 'पूर्ण गति हेतु फ़िट',
    tlTsr: '{v} km/h हेतु फ़िट',
    btnStart: 'पज़ेशन Start करें',
    btnDone: 'कार्य पूर्ण (Done)',
    btnClear: 'लाइन Clear करें',
    hintNoExecute: 'आपकी भूमिका Start, Done या Clear दर्ज नहीं कर सकती।',
    hintNotGranted: 'कंट्रोल द्वारा ब्लॉक स्वीकृत होने पर Start उपलब्ध होगा।',
    hintChkStart: 'Start के लिए “लाइन ब्लॉक” और “सुरक्षा लगाई” चुनें।',
    hintChkClear: 'Clear के लिए “कार्य पूर्ण” और “लाइन फ़िट” चुनें।',
    hintCleared: 'लाइन कंट्रोल को वापस दी गई।',
    checklist: 'साइट चेकलिस्ट',
    chkBlocked: 'स्टेशन मास्टर द्वारा लाइन ब्लॉक',
    chkProtection: 'सुरक्षा लगाई (बैनर फ़्लैग, डेटोनेटर)',
    chkWorkDone: 'कार्य पूर्ण, फ़िटिंग कसी',
    chkLineFit: 'लाइन फ़िट — कर्मचारी, औज़ार व मशीन हटे',
    msgControl: 'कंट्रोल को संदेश',
    reportIssue: 'समस्या रिपोर्ट करें',
    blockDetails: 'ब्लॉक विवरण',
    toastStart: 'Start दर्ज {hhmm}',
    toastDone: 'कार्य पूर्ण दर्ज',
    toastClear: 'लाइन क्लियर कंट्रोल को भेजा',
    toastMsg: 'कंट्रोल को संदेश भेजा',
    toastAck: 'सतर्कता आदेश {no} की पावती दी',
    doneTitle: 'कार्य पूर्ण — वास्तविक मिनट',
    doneHint: 'नियोजित मिनट भरे हैं; हर कार्य में लगे वास्तविक समय के अनुसार बदलें।',
    plannedMin: 'नियोजित {n} मिनट',
    confirmDone: 'कार्य पूर्ण दर्ज करें',
    clearTitle: 'लाइन क्लियर करें',
    fitFull: 'पूर्ण गति',
    fitTsr: 'गति प्रतिबंध के साथ',
    fitFullNote: 'लाइन सेक्शनल MPS {v} km/h हेतु फ़िट।',
    tsrSpeed: 'TSR गति (km/h)',
    fromKm: 'किमी से',
    toKm: 'किमी तक',
    remarks: 'टिप्पणी / ओवररन कारण (वैकल्पिक)',
    t351Warn: 'इस ब्लॉक का T/351 रीकनेक्शन दर्ज नहीं है। फिर भी Clear कर सकते हैं; आपकी टिप्पणी के साथ कंट्रोल को सूचना जाएगी।',
    t351Msg: 'T/351 रीकनेक्शन दर्ज किए बिना लाइन क्लियर',
    tsrInvalid: '0 से अधिक और सेक्शनल MPS {v} km/h से कम गति, और कॉरिडोर पर किमी सीमा दर्ज करें।',
    tsrReason: 'ब्लॉक {id} हटाने पर गति प्रतिबंध',
    confirmClear: 'लाइन क्लियर कंट्रोल को भेजें',
    msgTitle: 'कंट्रोल को संदेश',
    msgPlaceholder: 'कंट्रोल को क्या बताना है?',
    quick1: 'सुरक्षा लगा दी गई',
    quick2: 'मशीन साइट पर',
    quick3: 'ब्लॉक बढ़ाने की आवश्यकता',
    send: 'भेजें',
    cancel: 'रद्द करें',
    tsrBeat: 'मेरी बीट पर TSR',
    tsrBeatSub: '{crew} की पहुँच में, {km}',
    tsrBeatAll: 'पूरा कॉरिडोर',
    tsrNone: 'आज आपकी बीट पर कोई सतर्कता आदेश नहीं।',
    issued: 'जारी',
    draft: 'ड्राफ़्ट — कंट्रोल ने जारी नहीं किया',
    allCautions: 'सभी सतर्कता आदेश',
    weekTitle: 'इस सप्ताह मेरी गैंग',
    localNote: 'रिकॉर्ड इसी ब्राउज़र में संग्रहीत हैं; कई डिवाइस पर सिंक के लिए सर्वर चाहिए।',
    lpTrain: 'ट्रेन संख्या',
    lpEnter: 'अपनी ट्रेन संख्या दर्ज करें।',
    lpNotFound: 'इस कॉरिडोर की समय-सारणी में ट्रेन {no} नहीं है।',
    lpCautions: 'आपके मार्ग पर सतर्कता आदेश',
    lpCautionsNone: 'आज आपके मार्ग पर कोई सतर्कता आदेश नहीं।',
    lpBlocks: 'आज आपके मार्ग पर ब्लॉक',
    lpBlocksNone: 'आज आपके मार्ग पर कोई ब्लॉक नहीं।',
    lpHeld: '{mode}, लगभग {n} मिनट',
    lpNoHold: 'विंडो के दौरान गुज़रती है; कोई रुकावट गणना नहीं',
    modeSLW: 'सिंगल-लाइन वर्किंग',
    modeHELD: 'रोकी जाएगी',
    modeREGULATED: 'रेगुलेटेड',
    lpNote: 'यह जनरेट किए गए सतर्कता आदेश का दृश्य है, स्टेशन पर दिया गया हस्ताक्षरित T/409 नहीं।',
    ack: 'पावती दें',
    acked: 'पावती दी',
    openTrain: 'पूरी यात्रा',
    inForceDays: '{n} दिन से लागू',
    show: 'दिखाएँ',
    extAsk: 'कंट्रोल से और समय माँगें',
    extTitle: 'कंट्रोल से और समय माँगें',
    extMinutes: 'अतिरिक्त मिनट (5–240)',
    extReason: 'कारण',
    extReasonPh: 'और समय क्यों चाहिए? (जैसे रेल कटिंग में देर, मशीन ख़राब)',
    extNewEnd: 'ब्लॉक {was} के बजाय {end} पर समाप्त होगा।',
    extInvalid: '5 से 240 मिनट माँगें और कारण लिखें।',
    extSend: 'अनुरोध भेजें',
    extToast: '{n} मिनट का विस्तार माँगा · {id}',
    extToastBody: 'निर्णय कंट्रोल करेगा; सूचना यहीं मिलेगी।',
    extHeading: 'विस्तार अनुरोध',
    extPending: '{time} पर +{n} मिनट माँगे — कंट्रोल के निर्णय की प्रतीक्षा',
    extApproved: '{by} ने {time} पर +{n} मिनट स्वीकृत किए',
    extRefused: '{by} ने {time} पर +{n} मिनट अस्वीकार किए',
    extControlNote: 'कंट्रोल: {note}',
    extWaiting: 'एक अनुरोध पहले से कंट्रोल के पास है।',
    extNotInProgress: 'पज़ेशन जारी रहने पर उपलब्ध।',
    extended: '{n} मिनट बढ़ाया गया',
    runningLate: 'स्वीकृत समाप्ति ({end}) से {n} मिनट अधिक चल रहा है। कंट्रोल से और समय माँगें या लाइन Clear करें।',
    thread: 'कंट्रोल से संदेश',
    threadSub: 'इस ब्लॉक के साइट संदेश और कंट्रोल के उत्तर',
    threadNone: 'इस ब्लॉक पर अभी कोई संदेश नहीं।',
    fromControl: 'कंट्रोल',
    fromSite: 'साइट',
    pbNONE: 'दर्ज नहीं',
    pbPENDING: 'लंबित',
    pbDEENERGISED: 'विद्युत बंद (कार्य अनुमति)',
    pbENERGISED: 'विद्युत चालू',
    powerWarnTitle: 'पावर ब्लॉक विद्युत-बंद के रूप में दर्ज नहीं',
    powerWarn: 'इस ब्लॉक में OHE आइसोलेशन आवश्यक है। पावर-ब्लॉक रिकॉर्ड: {status}। TRD द्वारा पावर ब्लॉक और कार्य अनुमति की पुष्टि तक OHE के पास काम न करें।',
    powerConfirmTitle: 'विद्युत-बंद पावर-ब्लॉक रिकॉर्ड के बिना Start करें?',
    powerConfirmBody: '{id} ({isolation}) का पावर-ब्लॉक रिकॉर्ड: {status}। Start तभी करें जब साइट पर OHE आइसोलेट व अर्थ हो चुका हो और TRD ने कार्य अनुमति दी हो। आपका Start दर्ज होगा और कंट्रोल को बताया जाएगा कि रिकॉर्ड विद्युत-बंद नहीं था।',
    powerConfirmBtn: 'Start — साइट पर आइसोलेशन की पुष्टि',
    powerMsg: 'पावर-ब्लॉक रिकॉर्ड {status} के साथ पज़ेशन शुरू (साइट पर आइसोलेशन की पुष्टि {name} द्वारा)',
  },
} as const;

type Key = keyof typeof strings.en;

const DEPT_PASTEL: Record<Dept, 'green' | 'blue' | 'yellow'> = { TMS: 'green', SMMS: 'blue', TDMS: 'yellow' };
const CREW_PATTERNS: [RegExp, string][] = [
  [/p-?\s?way\s+gang\s*(\d+)/i, 'PWAY_GANG'],
  [/bridge\s+gang\s*(\d+)/i, 'BRIDGE_GANG'],
  [/s\s?&\s?t\s+unit\s*(\d+)/i, 'SIG_UNIT'],
  [/ohe\s+gang\s*(\d+)/i, 'OHE_GANG'],
  [/tss\s+crew\s*(\d+)/i, 'TSS_CREW'],
];

function crewFromDesignation(designation: string | undefined, crews: Crew[]): string | null {
  if (!designation) return null;
  for (const [rx, type] of CREW_PATTERNS) {
    const m = designation.match(rx);
    if (!m) continue;
    const id = `${type}-${m[1]}`;
    if (crews.some((c) => c.id === id)) return id;
  }
  return null;
}

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode) — the choice lasts for this visit */
  }
}

function clockOf(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

const isGranted = (b: WorkingBlock) => b.status === 'GRANTED' || b.status === 'LOCKED';
const isIssued = (o: CautionOrder) => o.status === 'ISSUED' || o.status === 'RECEIVED' || o.status === 'ACKNOWLEDGED';

/** Caution orders that apply to a train, in the order the train meets them. */
function ordersForTrain(orders: CautionOrder[], train: Train): CautionOrder[] {
  const pos = new Map(train.passages.map((p, i) => [p.sectionIndex, i]));
  const first = (o: CautionOrder) => Math.min(...o.sections.map((s) => pos.get(s) ?? Number.POSITIVE_INFINITY));
  return orders.filter((o) => o.status !== 'WITHDRAWN' && (o.line === 'BOTH' || o.line === train.line) && o.sections.some((s) => pos.has(s))).sort((a, b) => first(a) - first(b));
}

export default function FieldTodayPage() {
  const t = useT(strings);
  const nav = useNavigate();
  const drawer = useDrawerParams();

  const snapshot = useAppStore((s) => s.snapshot);
  const user = useAppStore((s) => s.user);
  const approvals = useAppStore((s) => s.approvals);
  const executionLog = useAppStore((s) => s.executionLog);
  const tsrs = useAppStore((s) => s.tsrs);
  const forms = useAppStore((s) => s.forms);
  const powerBlocks = useAppStore((s) => s.powerBlocks);
  const acks = useAppStore((s) => s.acks);
  const lastTrainNo = useAppStore((s) => s.lastTrainNo);
  const setLastTrainNo = useAppStore((s) => s.setLastTrainNo);
  const setTheme = useAppStore((s) => s.setTheme);
  const startPossession = useAppStore((s) => s.startPossession);
  const markItemDone = useAppStore((s) => s.markItemDone);
  const clearPossession = useAppStore((s) => s.clearPossession);
  const messageControl = useAppStore((s) => s.messageControl);
  const ackCaution = useAppStore((s) => s.ackCaution);
  const addTsr = useAppStore((s) => s.addTsr);
  const notify = useAppStore((s) => s.notify);
  const toast = useAppStore((s) => s.toast);
  const extensions = useAppStore((s) => s.extensions);
  const requestExtension = useAppStore((s) => s.requestExtension);
  const messages = useAppStore((s) => s.messages);

  /* first visit to the field portal: sunlight theme */
  useEffect(() => {
    if (readLocal(THEME_KEY) === null) {
      setTheme('sunlight');
      writeLocal(THEME_KEY, 'sunlight');
    }
  }, [setTheme]);

  /* real connectivity, not a decoration */
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const [mode, setMode] = useState<Mode>(user?.role === 'LOCO_PILOT' ? 'lp' : 'gang');
  const [crewChoice, setCrewChoice] = useState<string | null>(() => readLocal(CREW_KEY));
  const [focusId, setFocusId] = useState<string | null>(null);
  const [checklists, setChecklists] = useState<Record<string, Checklist>>({});
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [doneOpen, setDoneOpen] = useState(false);
  const [doneDraft, setDoneDraft] = useState<Record<string, string>>({});
  const [clearOpen, setClearOpen] = useState(false);
  const [fit, setFit] = useState<'full' | 'tsr'>('full');
  const [tsrKmph, setTsrKmph] = useState('');
  const [tsrFrom, setTsrFrom] = useState('');
  const [tsrTo, setTsrTo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [trainInput, setTrainInput] = useState(lastTrainNo ?? '');
  const [extOpen, setExtOpen] = useState(false);
  const [extMin, setExtMin] = useState('30');
  const [extReason, setExtReason] = useState('');
  const [powerConfirmOpen, setPowerConfirmOpen] = useState(false);
  /* wall-clock minute, refreshed every 30 s (running-late check) */
  const [nowMin, setNowMin] = useState(() => nowMinuteIST());
  useEffect(() => {
    const id = setInterval(() => setNowMin(nowMinuteIST()), 30000);
    return () => clearInterval(id);
  }, []);

  const blocks = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals]);
  const crews = useMemo(() => snapshot?.feeds.crews ?? [], [snapshot]);
  const crewId = useMemo(() => {
    if (crewChoice && crews.some((c) => c.id === crewChoice)) return crewChoice;
    return crewFromDesignation(user?.designation, crews);
  }, [crewChoice, crews, user?.designation]);
  const crew = useMemo(() => crews.find((c) => c.id === crewId) ?? null, [crews, crewId]);

  /* my gang's blocks this week (crew on the block, or assigned by Control) */
  const myBlocks = useMemo(
    () =>
      crewId
        ? blocks.filter((b) => b.status !== 'REFUSED' && (b.crews.includes(crewId) || b.approval?.resources?.crewId === crewId)).sort((a, b) => a.day - b.day || a.start - b.start)
        : [],
    [blocks, crewId]
  );
  const grantedMine = useMemo(() => myBlocks.filter(isGranted), [myBlocks]);
  const awaitingMine = useMemo(() => myBlocks.filter((b) => b.status === 'PROPOSED'), [myBlocks]);
  const recOf = (id: string) => executionLog.find((r) => r.blockId === id) ?? null;

  const focus: WorkingBlock | null = useMemo(() => {
    const chosen = focusId ? grantedMine.find((b) => b.id === focusId) : undefined;
    if (chosen) return chosen;
    const rec = (id: string) => executionLog.find((r) => r.blockId === id);
    return (
      grantedMine.find((b) => rec(b.id)?.status === 'IN_PROGRESS') ??
      grantedMine.find((b) => b.day === 0 && !rec(b.id)) ??
      grantedMine.find((b) => b.day === 0) ??
      grantedMine.find((b) => b.day > 0 && !rec(b.id)) ??
      null
    );
  }, [focusId, grantedMine, executionLog]);

  const orders = useMemo(() => (snapshot ? cautionOrders(snapshot, blocks, tsrs, forms, 0) : []), [snapshot, blocks, tsrs, forms]);
  const focusNotices = useMemo(() => (snapshot && focus ? disconnectionNotices(snapshot, blocks, forms, focus.day).filter((n) => n.blockId === focus.id) : []), [snapshot, blocks, forms, focus]);
  const focusOrders = useMemo(() => (snapshot && focus ? cautionOrders(snapshot, blocks, tsrs, forms, focus.day).filter((o) => o.liftingBlockId === focus.id) : []), [snapshot, blocks, tsrs, forms, focus]);

  /* beat = the gang's reach along the corridor */
  const beat = useMemo(() => {
    if (!snapshot) return null;
    if (!crew) return { from: 0, to: snapshot.corridor.lengthKm, whole: true };
    return { from: Math.max(0, crew.baseKm - crew.reachKm), to: Math.min(snapshot.corridor.lengthKm, crew.baseKm + crew.reachKm), whole: false };
  }, [snapshot, crew]);
  const beatOrders = useMemo(() => (beat ? orders.filter((o) => o.status !== 'WITHDRAWN' && Math.max(o.startKm, beat.from) <= Math.min(o.endKm, beat.to)) : []), [orders, beat]);

  /* loco pilot: my train */
  const train = useMemo(() => {
    const q = (lastTrainNo ?? '').trim().toLowerCase();
    if (!snapshot || !q) return null;
    return [...snapshot.feeds.timetable, ...snapshot.feeds.freight].find((tr) => tr.number.toLowerCase() === q) ?? null;
  }, [snapshot, lastTrainNo]);
  const trainOrders = useMemo(() => (train ? ordersForTrain(orders, train) : []), [orders, train]);
  const trainBlocks = useMemo(() => (snapshot && train ? blocksMetByTrain(snapshot, blocks.filter((b) => b.day === 0), train).sort((a, b) => a.block.start - b.block.start) : []), [snapshot, blocks, train]);

  if (!snapshot) return <PlanPending />;

  const canExecute = can(user, 'execute');
  const ackBy = user?.name ?? 'Loco pilot';
  const myAck = (orderNo: string) => acksForOrder(acks, orderNo).find((a) => a.by === ackBy) ?? null;
  const mps = snapshot.corridor.mpsKmph;
  const machineLabel = (id: string) => snapshot.feeds.machines.find((m) => m.id === id)?.label ?? id;
  const crewLabel = (id: string) => crews.find((c) => c.id === id)?.label ?? id;
  const statusLabel = (b: WorkingBlock) => (b.status === 'LOCKED' ? t('stLocked') : b.status === 'GRANTED' ? t('stGranted') : t('stProposed'));
  const modeLabel = (m: AffectedTrain['mode']) => (m === 'SLW' ? t('modeSLW') : m === 'HELD' ? t('modeHELD') : t('modeREGULATED'));

  /* ── focus block state ── */
  const rec = focus ? recOf(focus.id) : null;
  const chk = focus ? checklists[focus.id] ?? EMPTY_CHECKLIST : EMPTY_CHECKLIST;
  const setChk = (k: keyof Checklist, v: boolean) => {
    if (focus) setChecklists((all) => ({ ...all, [focus.id]: { ...(all[focus.id] ?? EMPTY_CHECKLIST), [k]: v } }));
  };
  const inProgress = rec?.status === 'IN_PROGRESS';
  const cleared = rec?.status === 'COMPLETED' || rec?.status === 'CLOSED';
  const allDone = !!rec && rec.items.length > 0 && rec.items.every((i) => i.done);
  const t351Pending = focusNotices.some((n) => n.status !== 'RECONNECTED');
  /* power block: the block kind, or a work in it that asked for OHE isolation */
  const tasksById = new Map(snapshot.tasks.map((tk) => [tk.id, tk]));
  const powerNeeded = focus ? focus.kind === 'POWER' || focus.kind === 'TRAFFIC + POWER' || focus.tasks.some((tk) => tasksById.get(tk.id)?.requires?.includes('POWER_BLOCK')) : false;
  const pbStatus: PowerBlockStatus | null = focus ? powerBlocks[focus.id]?.status ?? null : null;
  const pbLabel = (st: PowerBlockStatus | null) => t(st ? (`pb${st}` as Key) : 'pbNONE');
  const powerUnsafe = powerNeeded && pbStatus !== 'DEENERGISED';
  /* extensions and site messages of the block */
  const blockExt: ExtensionRequest[] = focus ? extensions.filter((e) => e.blockId === focus.id) : [];
  const extPendingReq = blockExt.find((e) => e.status === 'PENDING') ?? null;
  const thread = focus ? messagesForBlock(messages, focus.id) : [];
  const late = focus && inProgress ? blocksRunningPastEnd(blocks, executionLog, nowMin, 0).find((r) => r.block.id === focus.id) ?? null : null;
  const extEnabled = !!focus && inProgress && canExecute && !extPendingReq;
  const extHint = !focus ? null : !canExecute ? t('hintNoExecute') : !inProgress ? t('extNotInProgress') : extPendingReq ? t('extWaiting') : null;
  const startEnabled = !!focus && !rec && canExecute && chk.blocked && chk.protection;
  const doneEnabled = !!focus && inProgress && !allDone && canExecute;
  const clearEnabled = !!focus && inProgress && allDone && canExecute && chk.workDone && chk.lineFit;
  const startHint = !focus ? null : !canExecute ? t('hintNoExecute') : rec ? null : !chk.blocked || !chk.protection ? t('hintChkStart') : null;
  const clearHint = !focus || !inProgress || !allDone ? null : !canExecute ? t('hintNoExecute') : !chk.workDone || !chk.lineFit ? t('hintChkClear') : null;

  /* ── actions ── */
  const onStart = () => {
    if (!focus || !startEnabled) return;
    // the store allows Start without a de-energised record; the field user confirms isolation explicitly
    if (powerUnsafe) {
      setPowerConfirmOpen(true);
      return;
    }
    doStart(false);
  };
  const doStart = (powerOverride: boolean) => {
    if (!focus || !startEnabled) return;
    const now = nowMinuteIST();
    const ok = startPossession({
      blockId: focus.id,
      corridorId: snapshot.corridor.id,
      date: focus.date,
      sectionText: focus.sectionText,
      line: focus.line,
      plannedStart: focus.start,
      plannedEnd: focus.end,
      plannedSpanMin: focus.spanMin,
      actualStart: now,
      items: focus.tasks.map((tk) => ({ taskId: tk.id, label: tk.label, dept: tk.dept, workType: tk.workType, plannedMin: Math.max(0, tk.end - tk.start), done: false })),
      source: 'field',
    });
    setPowerConfirmOpen(false);
    if (!ok) return; // refused: the store toasted why
    if (powerOverride) messageControl(focus.id, t('powerMsg', { status: pbLabel(pbStatus), name: user?.name ?? '' }));
    toast({ title: t('toastStart', { hhmm: hhmm(now) }), body: `${focus.id} · ${focus.sectionText} ${focus.line}`, tone: powerOverride ? 'warn' : 'ok' });
  };

  const openExt = () => {
    setExtMin('30');
    setExtReason('');
    setExtOpen(true);
  };
  const extN = Math.round(Number(extMin));
  const extValid = Number.isFinite(extN) && extN >= 5 && extN <= 240 && extReason.trim().length > 0;
  const onSendExt = () => {
    if (!focus || !extValid) return;
    const req = requestExtension(focus.id, { extraMin: extN, reason: extReason.trim() });
    if (!req) return; // refused: the store toasted why
    toast({ title: t('extToast', { n: req.extraMin, id: focus.id }), body: t('extToastBody'), tone: 'ok' });
    setExtOpen(false);
  };

  const openDone = () => {
    if (!rec) return;
    setDoneDraft(Object.fromEntries(rec.items.filter((i) => !i.done).map((i) => [i.taskId, String(i.plannedMin)])));
    setDoneOpen(true);
  };
  const doneValid = rec ? rec.items.filter((i) => !i.done).every((i) => Number(doneDraft[i.taskId]) > 0) : false;
  const onConfirmDone = () => {
    if (!focus || !rec || !doneValid) return;
    const ok = rec.items.filter((i) => !i.done).filter((it) => markItemDone(focus.id, it.taskId, Math.round(Number(doneDraft[it.taskId])))).length;
    if (!ok) return; // refused: the store toasted why
    notify({ portals: ['control'], kind: 'INFO', title: `Work complete · ${focus.id}`, body: `${focus.sectionText} ${focus.line} — awaiting line clear`, route: `/app/control/board?block=${focus.id}` });
    toast({ title: t('toastDone'), body: focus.id, tone: 'ok' });
    setDoneOpen(false);
  };

  const openClear = () => {
    if (!focus) return;
    setFit('full');
    setTsrKmph('');
    setTsrFrom(focus.startKm.toFixed(1));
    setTsrTo(focus.endKm.toFixed(1));
    setRemarks('');
    setClearOpen(true);
  };
  const tsrA = Number(tsrFrom);
  const tsrB = Number(tsrTo);
  const tsrV = Number(tsrKmph);
  const tsrValid = fit === 'full' || (tsrV > 0 && tsrV < mps && Number.isFinite(tsrA) && Number.isFinite(tsrB) && tsrA >= 0 && tsrB >= tsrA && tsrB <= snapshot.corridor.lengthKm);
  const onConfirmClear = () => {
    if (!focus || !tsrValid) return;
    const kmph = fit === 'tsr' ? Math.round(tsrV) : null;
    if (!clearPossession(focus.id, { actualEnd: nowMinuteIST(), speedOnLifting: kmph, overrunCause: remarks.trim() || undefined, source: 'field' })) return;
    if (kmph) addTsr({ corridorId: snapshot.corridor.id, line: focus.line, fromKm: tsrA, toKm: tsrB, kmph, reason: t('tsrReason', { id: focus.id }), status: 'IN_FORCE', blockId: focus.id });
    if (t351Pending) messageControl(focus.id, remarks.trim() ? `${t('t351Msg')}: ${remarks.trim()}` : t('t351Msg'));
    toast({ title: t('toastClear'), body: kmph ? `${focus.id} · ${kmph} km/h · ${kmRange(tsrA, tsrB)}` : `${focus.id} · ${t('tlFull')}`, tone: 'ok' });
    setClearOpen(false);
  };

  const onSendMsg = () => {
    if (!focus || !msgText.trim()) return;
    messageControl(focus.id, msgText.trim());
    toast({ title: t('toastMsg'), body: focus.id, tone: 'ok' });
    setMsgText('');
    setMsgOpen(false);
  };

  // one acknowledgement per person, with the train number; the store notifies Control (and toasts a refusal)
  const onAck = (o: CautionOrder) => {
    if (ackCaution(o.orderNo, train?.number)) toast({ title: t('toastAck', { no: o.orderNo }), body: train ? `${ackBy} · ${train.number}` : ackBy, tone: 'ok' });
  };

  const chooseCrew = (id: string) => {
    setCrewChoice(id || null);
    setFocusId(null);
    if (id) writeLocal(CREW_KEY, id);
  };

  const commitTrain = () => {
    const v = trainInput.trim();
    setLastTrainNo(v || null);
  };

  /* ── pieces ── */
  const statusChip = (
    <span className={`badge ${online ? 'badge-ok' : 'badge-warn'}`} data-tour="offline-chip" title={t('localNote')}>
      {online ? <Wifi /> : <WifiOff />} {online ? t('online') : t('offline')}
    </span>
  );

  const orderRow = (o: CautionOrder, withAck: boolean) => {
    const issued = isIssued(o);
    const mine = myAck(o.orderNo);
    return (
      <div key={o.id} className="well stack" style={{ gap: 6 }}>
        <div className="row-wrap" style={{ gap: 6 }}>
          <Badge tone="solid-crit">{o.speedKmph} km/h</Badge>
          <span className="num strong small">{kmRange(o.startKm, o.endKm)}</span>
          <span className="small">{o.line}</span>
          <span className="grow" />
          <Badge tone={issued ? 'ok' : 'gray'}>{issued ? t('issued') : t('draft')}</Badge>
        </div>
        <div className="small">{o.reason}</div>
        <div className="tiny muted">
          <span className="mono">{o.orderNo}</span> · {o.section} · {t('inForceDays', { n: o.daysInForce })}
        </div>
        {withAck && issued && (
          <div>
            {mine ? (
              <Badge tone="ok" icon={<CheckCircle2 />}>
                {t('acked')} {clockOf(mine.at)}
                {mine.trainNo ? ` · ${mine.trainNo}` : ''}
              </Badge>
            ) : (
              <button type="button" className="btn btn-dark" style={{ minHeight: 44 }} onClick={() => onAck(o)}>
                <CheckCircle2 /> {t('ack')}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  /* ── gang view ── */
  const gangView = () => {
    const nextGranted = grantedMine.find((b) => b.day > 0) ?? null;
    const lead = focus?.departments[0];
    const timelineSteps = focus
      ? [
          { label: t('tlGranted'), when: clockOf(focus.approval?.grantedAt), note: `${focus.startText}–${focus.endText}`, state: 'done' as const },
          { label: t('tlStart'), when: rec?.actualStart !== undefined ? hhmm(rec.actualStart) : undefined, state: rec ? ('done' as const) : ('current' as const) },
          { label: t('tlDone'), when: allDone && rec ? duration(rec.items.reduce((s, i) => s + (i.actualMin ?? 0), 0)) : undefined, state: allDone ? ('done' as const) : inProgress ? ('current' as const) : ('pending' as const) },
          {
            label: t('tlClear'),
            when: cleared && rec?.actualEnd !== undefined ? hhmm(rec.actualEnd) : undefined,
            note: cleared ? (rec?.speedOnLifting ? t('tlTsr', { v: rec.speedOnLifting }) : t('tlFull')) : undefined,
            state: cleared ? ('done' as const) : allDone ? ('current' as const) : ('pending' as const),
          },
        ]
      : [];
    const stBadge: { tone: Tone; label: string } | null = focus ? (cleared ? { tone: 'ok', label: t('stCleared') } : inProgress ? { tone: 'warn', label: t('stInProgress') } : { tone: 'ok', label: statusLabel(focus) }) : null;
    const t409b = focusOrders.find((o) => o.formType === 'T/409B');
    const lifts = focusOrders.filter((o) => o.formType === 'T/409' && o.taskId);

    return (
      <div className="stack-lg">
        {/* gang chooser */}
        <div className="card">
          <div className="card-body tight row-wrap">
            <HardHat size={18} />
            <label className="strong small" htmlFor="field-crew">{t('myGang')}</label>
            <select id="field-crew" className="select grow" style={{ minHeight: 44, minWidth: 0 }} value={crewId ?? ''} onChange={(e) => chooseCrew(e.target.value)}>
              <option value="">{t('chooseGang')}</option>
              {crews.map((c) => {
                const n = blocks.filter((b) => isGranted(b) && (b.crews.includes(c.id) || b.approval?.resources?.crewId === c.id)).length;
                return (
                  <option key={c.id} value={c.id}>
                    {c.label}{n ? ` · ${t('gangGranted', { n })}` : ''}
                  </option>
                );
              })}
            </select>
            <SimLabel kind="seededFeed" system="crew roster" seed={26027} short />
          </div>
        </div>

        {!crewId ? (
          <div data-tour="field-card">
            <EmptyState title={t('chooseGang')} body={t('chooseGangBody')} icon={<HardHat />} />
          </div>
        ) : !focus ? (
          <div data-tour="field-card">
          <Callout tone="neutral">
            <div className="stack" style={{ gap: 4 }}>
              <span className="strong">{t('noBlockToday')}</span>
              <span>{nextGranted ? t('noBlockNext', { day: nextGranted.dateLabel, window: `${nextGranted.startText}–${nextGranted.endText}`, section: nextGranted.sectionText }) : t('noBlockWeek')}</span>
            </div>
          </Callout>
          </div>
        ) : (
          <>
            {grantedMine.length > 1 && (
              <div className="row-wrap" role="group" aria-label={t('weekTitle')}>
                {grantedMine.map((b) => (
                  <button key={b.id} type="button" className={`btn ${b.id === focus.id ? 'btn-dark' : ''}`} style={{ minHeight: 44 }} aria-pressed={b.id === focus.id} onClick={() => setFocusId(b.id)}>
                    {b.dateLabel} · {b.startText}
                  </button>
                ))}
              </div>
            )}

            {/* possession card, tinted by the lead department */}
            <Card pastel={lead ? DEPT_PASTEL[lead] : undefined} tour="field-card">
              <CardHead
                title={focus.day === 0 ? t('titleGang') : `${t('nextTitle')} · ${focus.dateLabel}`}
                sub={
                  <span className="row-wrap" style={{ gap: 6 }}>
                    <span className="num">{focus.sectionText} · {focus.line} · {kmRange(focus.startKm, focus.endKm)}</span>
                  </span>
                }
                icon={<ShieldCheck />}
                right={stBadge && <Badge tone={stBadge.tone}>{stBadge.label}</Badge>}
              />
              <CardBody>
                <div className="stack-lg">
                  {focus.day !== 0 && !rec && <Callout tone="info">{t('plannedFor', { date: focus.dateLabel })}</Callout>}
                  <KeyValue
                    items={[
                      [t('window'), <span key="w" className="num strong">{focus.startText}–{focus.endText} · {duration(focus.spanMin)}</span>],
                      [t('works'), <span key="k" className="stack" style={{ gap: 4 }}>{focus.tasks.map((tk) => <span key={tk.id} className="row-wrap" style={{ gap: 6 }}><DeptBadge dept={tk.dept} /> <span>{tk.label}</span> <span className="tiny muted num">{tk.startText}–{tk.endText}</span></span>)}</span>],
                      [t('blockRef'), <span key="r" className="mono">{focus.id}</span>],
                      [t('partners'), <span key="p" className="row-wrap" style={{ gap: 6 }}>{focus.departments.map((d) => <DeptBadge key={d} dept={d} long />)}</span>],
                      [t('incharge'), focus.approval?.incharge ?? t('notRecorded')],
                      [t('machine'), (focus.approval?.resources?.machineId ? [focus.approval.resources.machineId] : focus.machines).map(machineLabel).join(', ') || t('manual')],
                      [t('t351'), focusNotices.length ? focusNotices.map((n) => `${n.noticeNo} · ${n.status}`).join(', ') : t('notNeeded')],
                      [t('power'), powerNeeded ? <Badge key="pb" tone={pbStatus === 'DEENERGISED' ? 'ok' : 'warn'} icon={<Zap />}>{pbLabel(pbStatus)}</Badge> : t('notNeeded')],
                      [t('speedAfter'), <span key="s" className="stack" style={{ gap: 2 }}>
                        <span>{t409b ? t('speedT409b', { v: t409b.speedKmph }) : t('speedNormal', { v: mps })}</span>
                        {lifts.map((o) => <span key={o.id} className="small muted">{t('liftsTsr', { v: o.speedKmph, km: kmRange(o.startKm, o.endKm) })}</span>)}
                      </span>],
                    ]}
                  />

                  <Timeline steps={timelineSteps} />

                  {late && <Callout tone="crit">{t('runningLate', { n: late.overMin, end: hhmm(late.block.end) })}</Callout>}

                  {powerUnsafe && !rec && (
                    <Callout tone="warn" icon={<Zap />}>
                      <b>{t('powerWarnTitle')}</b>
                      <div>{t('powerWarn', { status: pbLabel(pbStatus) })}</div>
                    </Callout>
                  )}

                  {/* Start → Done → Clear, enabled in sequence */}
                  <div className="stack" data-tour="field-buttons" style={{ gap: 10 }}>
                    <button type="button" className={`btn btn-lg btn-block ${startEnabled ? 'btn-primary' : ''}`} style={{ minHeight: 56 }} disabled={!startEnabled} onClick={onStart}>
                      <Play /> {t('btnStart')}
                    </button>
                    <button type="button" className={`btn btn-lg btn-block ${doneEnabled ? 'btn-primary' : ''}`} style={{ minHeight: 56 }} disabled={!doneEnabled} onClick={openDone}>
                      <CheckCircle2 /> {t('btnDone')}
                    </button>
                    <button type="button" className={`btn btn-lg btn-block ${clearEnabled ? 'btn-primary' : ''}`} style={{ minHeight: 56 }} disabled={!clearEnabled} onClick={openClear}>
                      <ShieldCheck /> {t('btnClear')}
                    </button>
                    {cleared ? (
                      <div className="small">{t('hintCleared')}</div>
                    ) : (
                      (startHint || clearHint) && <div className="small muted">{startHint ?? clearHint}</div>
                    )}
                  </div>

                  {/* extension: more time from Control while the possession runs */}
                  <div className="stack" style={{ gap: 6 }} data-tour="field-extension">
                    <button type="button" className={`btn btn-block ${late && extEnabled ? 'btn-dark' : ''}`} style={{ minHeight: 48 }} disabled={!extEnabled} onClick={openExt}>
                      <Timer /> {t('extAsk')}
                    </button>
                    {extHint && !cleared && <div className="tiny muted">{extHint}</div>}
                    {blockExt.length > 0 && (
                      <div className="stack" style={{ gap: 4 }}>
                        <span className="tiny caps">{t('extHeading')}</span>
                        {blockExt.map((e) => (
                          <div key={e.id} className="row-wrap small" style={{ gap: 6 }}>
                            <Badge tone={e.status === 'APPROVED' ? 'ok' : e.status === 'REFUSED' ? 'crit' : 'warn'}>
                              {e.status === 'PENDING'
                                ? t('extPending', { n: e.extraMin, time: clockOf(e.at) ?? '' })
                                : e.status === 'APPROVED'
                                  ? t('extApproved', { n: e.extraMin, by: e.decidedBy ?? '', time: clockOf(e.decidedAt) ?? '' })
                                  : t('extRefused', { n: e.extraMin, by: e.decidedBy ?? '', time: clockOf(e.decidedAt) ?? '' })}
                            </Badge>
                            <span className="muted">{e.reason}</span>
                            {e.note && <span>{t('extControlNote', { note: e.note })}</span>}
                          </div>
                        ))}
                        {(focus.approval?.extendedMin ?? 0) > 0 && (
                          <span className="tiny muted num">
                            {t('extended', { n: focus.approval?.extendedMin ?? 0 })} · {focus.startText}–{focus.endText}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="row-wrap">
                    <button type="button" className="btn" style={{ minHeight: 44 }} onClick={() => setMsgOpen(true)}>
                      <MessageSquare /> {t('msgControl')}
                    </button>
                    <button type="button" className="btn" style={{ minHeight: 44 }} onClick={() => nav(`/app/field/report?block=${encodeURIComponent(focus.id)}`)}>
                      <Flame /> {t('reportIssue')}
                    </button>
                    <button type="button" className="btn" style={{ minHeight: 44 }} onClick={() => drawer.open('block', focus.id)}>
                      <FileText /> {t('blockDetails')}
                    </button>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* site messages of this block with Control's replies */}
            <Card>
              <CardHead
                title={t('thread')}
                sub={t('threadSub')}
                icon={<MessageSquare />}
                right={
                  <button type="button" className="btn btn-sm" onClick={() => setMsgOpen(true)}>
                    {t('msgControl')}
                  </button>
                }
              />
              <CardBody tight>
                {thread.length === 0 ? (
                  <div className="empty">{t('threadNone')}</div>
                ) : (
                  <div className="stack" style={{ gap: 8 }} aria-live="polite">
                    {thread.map((m) => {
                      const ctl = m.from === 'control';
                      return (
                        <div key={m.id} className="well stack" style={{ gap: 2, marginLeft: ctl ? 0 : 'auto', marginRight: ctl ? 'auto' : 0, maxWidth: '92%', borderLeft: ctl ? '3px solid var(--info)' : undefined }}>
                          <div className="row-wrap tiny muted" style={{ gap: 6 }}>
                            <Badge tone={ctl ? 'info' : 'gray'}>{ctl ? t('fromControl') : t('fromSite')}</Badge>
                            <span>{m.by}</span>
                            <span className="num">{clockOf(m.at)}</span>
                          </div>
                          <div className="small" style={{ overflowWrap: 'anywhere' }}>{m.text}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardBody>
            </Card>

            {/* site checklist — gates Start and Clear */}
            <Card>
              <CardHead title={t('checklist')} icon={<ShieldCheck />} />
              <CardBody>
                <div className="stack" style={{ gap: 4 }}>
                  {(
                    [
                      ['blocked', t('chkBlocked')],
                      ['protection', t('chkProtection')],
                      ['workDone', t('chkWorkDone')],
                      ['lineFit', t('chkLineFit')],
                    ] as const
                  ).map(([k, label]) => (
                    <label key={k} className="check" style={{ minHeight: 44 }}>
                      <input type="checkbox" checked={chk[k]} onChange={(e) => setChk(k, e.target.checked)} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </CardBody>
            </Card>
          </>
        )}

        {awaitingMine.length > 0 && (
          <Card>
            <CardHead title={t('awaitingTitle')} sub={t('hintNotGranted')} icon={<Clock />} />
            <CardBody tight>
              <div className="stack" style={{ gap: 6 }}>
                {awaitingMine.map((b) => (
                  <button key={b.id} type="button" className="btn btn-ghost btn-block" style={{ justifyContent: 'flex-start', height: 'auto', minHeight: 44, whiteSpace: 'normal', textAlign: 'left' }} onClick={() => drawer.open('block', b.id)}>
                    <span className="num strong">{b.dateLabel} {b.startText}–{b.endText}</span>
                    <span className="grow small">{b.sectionText} · {b.line}</span>
                    <Badge tone="gray">{t('stProposed')}</Badge>
                  </button>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        {/* TSRs on the gang's beat */}
        <Card>
          <CardHead
            title={t('tsrBeat')}
            sub={beat && (beat.whole ? t('tsrBeatAll') : t('tsrBeatSub', { crew: crew ? crewLabel(crew.id) : '', km: kmRange(beat.from, beat.to) }))}
            icon={<AlertTriangle />}
            right={
              <button type="button" className="btn btn-sm" onClick={() => nav('/app/field/caution')}>
                {t('allCautions')}
              </button>
            }
          />
          <CardBody tight>
            {beatOrders.length === 0 ? (
              <div className="empty">{t('tsrNone')}</div>
            ) : (
              <div className="stack">{beatOrders.slice(0, BEAT_LIMIT).map((o) => orderRow(o, false))}</div>
            )}
          </CardBody>
        </Card>
      </div>
    );
  };

  /* ── loco pilot view ── */
  const lpView = () => (
    <div className="stack-lg">
      <Card>
        <CardBody>
          <form
            className="row"
            style={{ gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              commitTrain();
            }}
          >
            <TrainIcon size={18} />
            <input
              className="input input-lg grow mono"
              style={{ minWidth: 0 }}
              list="field-trains"
              autoComplete="off"
              placeholder={t('lpTrain')}
              aria-label={t('lpTrain')}
              value={trainInput}
              onChange={(e) => setTrainInput(e.target.value)}
              onBlur={commitTrain}
            />
            <datalist id="field-trains">
              {snapshot.feeds.timetable.map((tr) => (
                <option key={tr.id} value={tr.number}>{tr.name}</option>
              ))}
            </datalist>
            <button type="submit" className="btn btn-dark btn-lg">{t('show')}</button>
          </form>
          {train && (
            <div className="stack mt" style={{ gap: 2 }}>
              <div className="strong">
                <span className="num">{train.number}</span> {train.name}
              </div>
              <div className="small muted num">
                {train.origin} → {train.destination} · {train.line} · {hhmm(train.dep)}–{hhmm(train.arr)}
              </div>
              <div className="mt">
                <button type="button" className="btn" style={{ minHeight: 44 }} onClick={() => nav('/app/field/train')}>
                  <TrainIcon /> {t('openTrain')}
                </button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {!lastTrainNo ? (
        <EmptyState title={t('lpEnter')} icon={<TrainIcon />} />
      ) : !train ? (
        <EmptyState title={t('lpNotFound', { no: lastTrainNo })} icon={<TrainIcon />} />
      ) : (
        <>
          <Card>
            <CardHead title={t('lpCautions')} icon={<AlertTriangle />} />
            <CardBody tight>
              {trainOrders.length === 0 ? <div className="empty">{t('lpCautionsNone')}</div> : <div className="stack">{trainOrders.map((o) => orderRow(o, true))}</div>}
              <p className="tiny muted mt">{t('lpNote')}</p>
            </CardBody>
          </Card>
          <Card>
            <CardHead title={t('lpBlocks')} icon={<Clock />} right={<SimLabel kind="planningEstimate" short />} />
            <CardBody tight>
              {trainBlocks.length === 0 ? (
                <div className="empty">{t('lpBlocksNone')}</div>
              ) : (
                <div className="stack">
                  {trainBlocks.map(({ block: b, impact }) => (
                    <div key={b.id} className="well stack" style={{ gap: 4 }}>
                      <div className="row-wrap" style={{ gap: 6 }}>
                        <span className="num strong">{b.startText}–{b.endText}</span>
                        <span className="small">{b.sectionText} · {b.line}</span>
                        <span className="grow" />
                        <Badge tone={isGranted(b) ? 'ok' : 'gray'}>{statusLabel(b)}</Badge>
                      </div>
                      <div className="small">{impact ? t('lpHeld', { mode: modeLabel(impact.mode), n: Math.round(impact.delayMin) }) : t('lpNoHold')}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );

  return (
    <div className="stack-lg">
      <PageHeader
        title={mode === 'gang' ? t('titleGang') : t('titleLp')}
        lede={snapshot.corridor.name}
        badges={statusChip}
        actions={
          <Segmented<Mode>
            ariaLabel={t('modeGang')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'gang', label: t('modeGang') },
              { value: 'lp', label: t('modeLp') },
            ]}
          />
        }
      />

      {mode === 'gang' ? gangView() : lpView()}

      <div className="row-wrap tiny muted">
        <SimLabel kind="localOnly" />
        <span>{t('localNote')}</span>
      </div>

      {/* message to Control */}
      <Modal
        open={msgOpen && !!focus}
        onClose={() => setMsgOpen(false)}
        title={t('msgTitle')}
        footer={
          <>
            <button type="button" className="btn" style={{ minHeight: 44 }} onClick={() => setMsgOpen(false)}>{t('cancel')}</button>
            <button type="button" className="btn btn-primary" style={{ minHeight: 44 }} disabled={!msgText.trim()} onClick={onSendMsg}>{t('send')}</button>
          </>
        }
      >
        <div className="stack">
          <div className="row-wrap">
            {(['quick1', 'quick2'] as const).map((k: Key) => (
              <button key={k} type="button" className="btn btn-sm" onClick={() => setMsgText(t(k))}>{t(k)}</button>
            ))}
          </div>
          <textarea className="textarea" rows={4} value={msgText} onChange={(e) => setMsgText(e.target.value)} placeholder={t('msgPlaceholder')} aria-label={t('msgTitle')} />
        </div>
      </Modal>

      {/* work done: actual minutes per work */}
      <Modal
        open={doneOpen && !!rec}
        onClose={() => setDoneOpen(false)}
        title={t('doneTitle')}
        footer={
          <>
            <button type="button" className="btn" style={{ minHeight: 44 }} onClick={() => setDoneOpen(false)}>{t('cancel')}</button>
            <button type="button" className="btn btn-primary" style={{ minHeight: 44 }} disabled={!doneValid} onClick={onConfirmDone}>{t('confirmDone')}</button>
          </>
        }
      >
        <div className="stack">
          <p className="small muted">{t('doneHint')}</p>
          {rec?.items.filter((i) => !i.done).map((it) => (
            <div key={it.taskId} className="field">
              <label htmlFor={`done-${it.taskId}`}>
                {it.label} <span className="tiny muted">({t('plannedMin', { n: it.plannedMin })})</span>
              </label>
              <input id={`done-${it.taskId}`} className="input input-lg num" type="number" min={1} inputMode="numeric" value={doneDraft[it.taskId] ?? ''} onChange={(e) => setDoneDraft((d) => ({ ...d, [it.taskId]: e.target.value }))} />
            </div>
          ))}
        </div>
      </Modal>

      {/* clear: line fit at full speed or with a TSR */}
      <Modal
        open={clearOpen && !!focus}
        onClose={() => setClearOpen(false)}
        title={t('clearTitle')}
        footer={
          <>
            <button type="button" className="btn" style={{ minHeight: 44 }} onClick={() => setClearOpen(false)}>{t('cancel')}</button>
            <button type="button" className="btn btn-primary" style={{ minHeight: 44 }} disabled={!tsrValid} onClick={onConfirmClear}>{t('confirmClear')}</button>
          </>
        }
      >
        <div className="stack-lg">
          {t351Pending && <Callout tone="warn">{t('t351Warn')}</Callout>}
          <Segmented<'full' | 'tsr'>
            ariaLabel={t('clearTitle')}
            value={fit}
            onChange={setFit}
            options={[
              { value: 'full', label: t('fitFull') },
              { value: 'tsr', label: t('fitTsr') },
            ]}
          />
          {fit === 'full' ? (
            <p className="small">{t('fitFullNote', { v: mps })}</p>
          ) : (
            <div className="stack">
              <div className="field">
                <label htmlFor="clr-v">{t('tsrSpeed')}</label>
                <input id="clr-v" className="input input-lg num" type="number" min={1} max={mps - 1} inputMode="numeric" value={tsrKmph} onChange={(e) => setTsrKmph(e.target.value)} />
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="clr-a">{t('fromKm')}</label>
                  <input id="clr-a" className="input input-lg num" type="number" step={0.1} min={0} value={tsrFrom} onChange={(e) => setTsrFrom(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="clr-b">{t('toKm')}</label>
                  <input id="clr-b" className="input input-lg num" type="number" step={0.1} min={0} value={tsrTo} onChange={(e) => setTsrTo(e.target.value)} />
                </div>
              </div>
              {!tsrValid && tsrKmph !== '' && <div className="small" style={{ color: 'var(--crit)' }}>{t('tsrInvalid', { v: mps })}</div>}
            </div>
          )}
          <div className="field">
            <label htmlFor="clr-r">{t('remarks')}</label>
            <input id="clr-r" className="input input-lg" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </div>
      </Modal>

      {/* extension request */}
      <Modal
        open={extOpen && !!focus}
        onClose={() => setExtOpen(false)}
        title={t('extTitle')}
        footer={
          <>
            <button type="button" className="btn" style={{ minHeight: 44 }} onClick={() => setExtOpen(false)}>{t('cancel')}</button>
            <button type="button" className="btn btn-primary" style={{ minHeight: 44 }} disabled={!extValid} onClick={onSendExt}>{t('extSend')}</button>
          </>
        }
      >
        {focus && (
          <div className="stack">
            <div className="field">
              <label htmlFor="ext-min">{t('extMinutes')}</label>
              <input id="ext-min" className="input input-lg num" type="number" min={5} max={240} step={5} inputMode="numeric" value={extMin} onChange={(e) => setExtMin(e.target.value)} />
            </div>
            <div className="row-wrap" role="group" aria-label={t('extMinutes')}>
              {[15, 30, 45, 60].map((n) => (
                <button key={n} type="button" className={`btn btn-sm ${extN === n ? 'btn-dark' : ''}`} aria-pressed={extN === n} onClick={() => setExtMin(String(n))}>
                  +{n}
                </button>
              ))}
            </div>
            <div className="field">
              <label htmlFor="ext-reason">{t('extReason')}</label>
              <textarea id="ext-reason" className="textarea" rows={3} value={extReason} onChange={(e) => setExtReason(e.target.value)} placeholder={t('extReasonPh')} />
            </div>
            {Number.isFinite(extN) && extN > 0 && <div className="small num">{t('extNewEnd', { end: hhmm(focus.end + extN), was: focus.endText })}</div>}
            {!extValid && extReason.trim() !== '' && <div className="small" style={{ color: 'var(--crit)' }}>{t('extInvalid')}</div>}
          </div>
        )}
      </Modal>

      {/* power block not de-energised: explicit confirmation before Start */}
      <Modal
        open={powerConfirmOpen && !!focus}
        onClose={() => setPowerConfirmOpen(false)}
        title={t('powerConfirmTitle')}
        footer={
          <>
            <button type="button" className="btn" style={{ minHeight: 44 }} onClick={() => setPowerConfirmOpen(false)}>{t('cancel')}</button>
            <button type="button" className="btn btn-danger" style={{ minHeight: 44 }} onClick={() => doStart(true)}>{t('powerConfirmBtn')}</button>
          </>
        }
      >
        {focus && (
          <Callout tone="crit" icon={<Zap />}>
            {t('powerConfirmBody', { id: focus.id, isolation: focus.powerIsolation ?? focus.sectionText, status: pbLabel(pbStatus) })}
          </Callout>
        )}
      </Modal>

      <BlockDrawer blockId={drawer.blockId} onClose={() => drawer.close('block')} />
    </div>
  );
}
