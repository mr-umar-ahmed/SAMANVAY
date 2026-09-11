/**
 * ControlBoardPage — the Section Controller's screen for the control day
 * (docs/v4-spec.md §3.5). Three views of the same working blocks:
 *  - board: 24-h string chart and the "Tonight" list with grant / refuse / clear
 *  - programme: the day's block programme, handover note and A4 print
 *  - map: corridor map with train positions at the control clock and a train lookup
 * Every figure comes from the snapshot, the workflow slices or the scrubber.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Flame, Lock } from 'lucide-react';
import { useAppStore, type ExecRecord } from '../../store/useAppStore';
import { can } from '../../auth/portals';
import { CORRIDORS } from '../../engine/corridors.js';
import { searchTrains } from '../../engine/trainLookup.js';
import { blocksForDay, blocksMetByTrain, cautionOrders, disconnectionNotices, livePositions, workingBlocks, type WorkingBlock } from '../../engine/select';
import type { AffectedTrain, Corridor, Snapshot, Train } from '../../engine/types';
import { useT } from '../../i18n';
import { Badge, Callout, Card, CardBody, CardHead, DataTable, DeptBadge, EmptyState, Field, Modal, PageHeader, PlanPending, Segmented, StatTile, StatusBadge, type Column } from '../../components/ui';
import { ChipGroup, FormSheet, PrintButton, SimLabel, TimeScrubber } from '../../components/ui/extras';
import { StringDiagram, freeWindowsForDay, type StringDiagramLayers, type TsrBand } from '../../components/viz/StringDiagram';
import { CorridorMap } from '../../components/viz/CorridorMap';
import { BlockDrawer } from '../../components/domain/BlockDrawer';
import { TaskDrawer } from '../../components/domain/TaskDrawer';
import { ReportDrawer } from '../../components/domain/ReportDrawer';
import { GrantWithChange } from '../../components/domain/block/GrantWithChange';
import { useDrawerParams } from '../../components/domain/useDrawerParams';
import { DEPT_CLASS, DEPT_LABEL, addDaysIso, classLabel, dateLabel, duration, hhmm, kmRange, lineLabel, nowMinuteIST, toMin } from '../../lib/format';

type View = 'board' | 'programme' | 'map';
type Layer = 'passenger' | 'goods' | 'freeWindows' | 'baseline';
type RefuseReason = 'reasonTraffic' | 'reasonFailure' | 'reasonGang' | 'reasonT351' | 'reasonMachine' | 'reasonOther';
const REFUSE_REASONS: RefuseReason[] = ['reasonTraffic', 'reasonFailure', 'reasonGang', 'reasonT351', 'reasonMachine', 'reasonOther'];

export interface ControlBoardPageProps {
  view?: View;
}

const strings = {
  en: {
    title: 'Control board',
    lede: 'Blocks on the corridor for the control day: grant, refuse, clear, and the trains they regulate.',
    corridor: 'Corridor',
    corridorChanged: 'Corridor changed to {name}',
    corridorChangedBody: 'The plan is being recomputed for this corridor.',
    dayD: 'D · {date}',
    dayD1: 'D+1 · {date}',
    dayAria: 'Control day',
    viewAria: 'View',
    viewBoard: 'Chart',
    viewProgramme: 'Programme',
    viewMap: 'Map',
    lockD1: 'Lock D+1 ({n})',
    lockNoCap: 'Locking needs the lock capability (Chief Controller).',
    lockNone: 'No granted blocks on {date} to lock.',
    lockHint: 'Lock every granted block on {date}.',
    lockedToast: '{n} blocks locked for {date}',
    replanTonight: 'Re-plan tonight',
    statBlocks: 'Blocks',
    subBlocks: '{works} works · {refused} refused',
    statGranted: 'Granted',
    subGranted: '{ready} ready to grant · {waiting} awaiting concurrence',
    statProgress: 'In progress',
    subProgress: 'Started, line not yet cleared',
    statToClear: 'To clear',
    subToClear: 'Granted, line not yet handed back',
    statRegulated: 'Trains regulated',
    subRegulated: '{min} weighted train-min',
    statIncidents: 'New incidents',
    subIncidents: '{n} being verified',
    clock: 'Control clock',
    chartTitle: 'String chart · {date}',
    chartSub: 'Stations by chainage, time across. Train paths from the working timetable and the FOIS forecast; blocks in department colour.',
    layers: 'Layers',
    layerPassenger: 'Passenger',
    layerGoods: 'Goods forecast',
    layerFree: 'Free windows',
    layerBaseline: 'Baseline blocks',
    chartHint: 'Click a block on the chart to open it.',
    tonight: 'Tonight',
    tomorrow: 'Tomorrow (D+1)',
    tonightSub: '{n} blocks in time order',
    noBlocks: 'No blocks planned for {date}.',
    nextBlock: 'Next: {when} · {section} · {window}',
    noNext: 'Nothing else is planned this week.',
    grant: 'Grant',
    grantChange: 'Grant with change',
    refuse: 'Refuse',
    clear: 'Clear',
    readyToGrant: 'All departments concurred',
    awaiting: 'Awaiting concurrence: {depts}',
    noGrantCap: 'Granting needs the grant capability.',
    notStarted: 'Not started. The start is recorded by the gang or in the block drawer.',
    noExecCap: 'Recording line clear needs the execute capability.',
    started: 'Started {time}',
    cleared: 'Cleared {time}',
    clearedSpeed: 'Cleared {time} · TSR {v} km/h',
    t351Pending: 'T/351 not received',
    trainsN: '{n} trains',
    heldTitle: 'Held & regulated',
    heldSub: 'Delay model result for each block on {date}',
    heldEmpty: 'No train is regulated by the blocks on {date}.',
    modeSlw: 'Single-line working',
    modeHeld: 'Held',
    modeRegulated: 'Regulated',
    heldRow: '{mode} · block {id} · {section}',
    progTitle: 'Block programme · {date}',
    progSub: 'Every block on the day with its departments, resources and state. Click a row to open the block.',
    colWindow: 'Window',
    colSection: 'Block section',
    colLine: 'Line',
    colKind: 'Kind',
    colDepts: 'Departments',
    colWork: 'Work',
    colMachine: 'Machine',
    colIncharge: 'In-charge',
    colT351: 'T/351',
    colSpeed: 'Speed after',
    colTrains: 'Trains regulated',
    colState: 'State',
    kindTraffic: 'Traffic',
    kindPower: 'Power',
    kindTrafficPower: 'Traffic + power',
    kindDisconnection: 'S&T disconnection',
    fullSpeed: 'Full speed',
    t351NotNeeded: 'Not needed',
    moreWorks: '+{n} more',
    notSet: 'Not set',
    printProgramme: 'Print programme',
    progSheetTitle: 'Daily block programme',
    sheetSignature: 'Section Controller',
    handoverTitle: 'Handover note · {date}',
    handoverSub: 'Kept with the programme for the next shift controller; printed with it.',
    handoverLabel: 'Note for the next shift',
    handoverPlaceholder: 'Regulation still in force, S&T disconnections open, cautions handed over…',
    handoverSave: 'Save note',
    handoverSaved: 'Handover note saved',
    handoverUnchanged: 'No changes to save.',
    mapTitle: 'Corridor map · {time}',
    mapSub: 'Blocks on {date}, hazard reports and trains at the control clock.',
    trainTitle: 'Train lookup',
    trainSub: 'Trains running on {date}',
    trainSearch: 'Train number, name or station code',
    trainNone: 'No train matches “{q}” on {date}.',
    trainAt: 'km {km} · {from} → {to}',
    trainHalted: 'Halted at {station} · km {km}',
    trainNotRunning: 'Not on the corridor at {time}. {origin} {dep} → {dest} {arr}.',
    trainBlocks: 'Blocks this train meets on {date}',
    trainNoBlocks: 'No block on its path on {date}.',
    trainImpact: '{mode} · {min} min',
    trainNoImpact: 'Passes outside the block window',
    refuseTitle: 'Refuse block {id}',
    refuseBody: '{section} · {window}. The block leaves the board; planning and the departments are told why.',
    refuseReason: 'Reason',
    reasonTraffic: 'Traffic: punctuality risk',
    reasonFailure: 'Asset failure nearby',
    reasonGang: 'Gang not ready',
    reasonT351: 'T/351 not received',
    reasonMachine: 'Machine not arrived',
    reasonOther: 'Other',
    refuseNote: 'Details',
    refuseNoteRequired: 'Details are required for “Other”.',
    refuseConfirm: 'Refuse block',
    refusedToast: 'Refused {section} {window}',
    clearTitle: 'Line clear · {id}',
    clearBody: '{section} · {line}. Record when the line was handed back and the speed it is fit for.',
    clearTime: 'Line clear at',
    clearFit: 'Line fit for',
    clearFull: 'Full speed',
    clearTsr: 'TSR',
    clearSpeed: 'TSR speed (km/h)',
    clearFrom: 'From km',
    clearTo: 'To km',
    clearReason: 'Reason for the TSR',
    clearReasonDefault: 'Consolidation after block {id}',
    clearKmError: 'Km range must lie within the corridor (0–{len} km), from ≤ to.',
    clearSpeedError: 'Enter a TSR speed below the sectional speed of {mps} km/h.',
    clearConfirm: 'Record line clear',
    clearedToast: 'Line clear recorded · {section}',
    clearedFull: 'Fit for full speed',
    clearedTsr: 'TSR {v} km/h, km {a}–{b} in force; T/409 regenerated',
    t351Title: 'T/351 not yet received',
    t351Body: 'T/351 not yet received for S&T work in this block. Grant anyway?',
    t351Note: 'The grant is recorded in the audit trail with the notice still open.',
    t351Grant: 'Grant anyway',
    cancel: 'Cancel',
    minUnit: 'min',
    fs_DRAFT: 'Draft',
    fs_ISSUED: 'Issued',
    fs_RECEIVED: 'Received',
    fs_RECONNECTED: 'Reconnected',
    fs_WITHDRAWN: 'Withdrawn',
    fs_ACKNOWLEDGED: 'Acknowledged',
    bs_PROPOSED: 'Proposed',
    bs_GRANTED: 'Granted',
    bs_REFUSED: 'Refused',
    bs_LOCKED: 'Locked',
    grantedToast: 'Granted {section} {window}',
    grantedChangeToast: 'Granted with change',
  },
  hi: {
    title: 'नियंत्रण बोर्ड',
    lede: 'नियंत्रण दिवस के लिए कॉरिडोर के block: प्रदान करें, अस्वीकार करें, क्लियर करें, और उनसे नियंत्रित ट्रेनें।',
    corridor: 'कॉरिडोर',
    corridorChanged: 'कॉरिडोर बदलकर {name} किया गया',
    corridorChangedBody: 'इस कॉरिडोर के लिए योजना फिर से बन रही है।',
    dayD: 'D · {date}',
    dayD1: 'D+1 · {date}',
    dayAria: 'नियंत्रण दिवस',
    viewAria: 'दृश्य',
    viewBoard: 'चार्ट',
    viewProgramme: 'कार्यक्रम',
    viewMap: 'मानचित्र',
    lockD1: 'D+1 लॉक करें ({n})',
    lockNoCap: 'लॉक करने के लिए lock अधिकार चाहिए (मुख्य नियंत्रक)।',
    lockNone: '{date} पर लॉक करने को कोई प्रदत्त block नहीं है।',
    lockHint: '{date} के सभी प्रदत्त block लॉक करें।',
    lockedToast: '{date} के लिए {n} block लॉक किए गए',
    replanTonight: 'आज रात पुनः योजना',
    statBlocks: 'Block',
    subBlocks: '{works} कार्य · {refused} अस्वीकृत',
    statGranted: 'प्रदत्त',
    subGranted: '{ready} प्रदान हेतु तैयार · {waiting} सहमति की प्रतीक्षा में',
    statProgress: 'प्रगति पर',
    subProgress: 'शुरू, लाइन अभी क्लियर नहीं',
    statToClear: 'क्लियर शेष',
    subToClear: 'प्रदत्त, लाइन अभी वापस नहीं सौंपी गई',
    statRegulated: 'नियंत्रित ट्रेनें',
    subRegulated: '{min} भारित ट्रेन-मिनट',
    statIncidents: 'नई घटनाएँ',
    subIncidents: '{n} सत्यापनाधीन',
    clock: 'नियंत्रण घड़ी',
    chartTitle: 'स्ट्रिंग चार्ट · {date}',
    chartSub: 'चेनेज अनुसार स्टेशन, समय क्षैतिज। ट्रेन पथ कार्यकारी समय-सारणी और FOIS पूर्वानुमान से; block विभाग के रंग में।',
    layers: 'परतें',
    layerPassenger: 'यात्री',
    layerGoods: 'माल पूर्वानुमान',
    layerFree: 'खाली विंडो',
    layerBaseline: 'बेसलाइन block',
    chartHint: 'खोलने के लिए चार्ट पर block पर क्लिक करें।',
    tonight: 'आज रात',
    tomorrow: 'कल (D+1)',
    tonightSub: 'समय क्रम में {n} block',
    noBlocks: '{date} के लिए कोई block नियोजित नहीं है।',
    nextBlock: 'अगला: {when} · {section} · {window}',
    noNext: 'इस सप्ताह और कुछ नियोजित नहीं है।',
    grant: 'प्रदान करें',
    grantChange: 'बदलाव के साथ प्रदान करें',
    refuse: 'अस्वीकार करें',
    clear: 'क्लियर',
    readyToGrant: 'सभी विभागों की सहमति प्राप्त',
    awaiting: 'सहमति की प्रतीक्षा: {depts}',
    noGrantCap: 'प्रदान करने के लिए grant अधिकार चाहिए।',
    notStarted: 'शुरू नहीं हुआ। शुरुआत गैंग या block ड्रॉअर में दर्ज होती है।',
    noExecCap: 'लाइन क्लियर दर्ज करने के लिए execute अधिकार चाहिए।',
    started: '{time} पर शुरू',
    cleared: '{time} पर क्लियर',
    clearedSpeed: '{time} पर क्लियर · TSR {v} किमी/घं',
    t351Pending: 'T/351 प्राप्त नहीं',
    trainsN: '{n} ट्रेनें',
    heldTitle: 'रोकी व नियंत्रित ट्रेनें',
    heldSub: '{date} के प्रत्येक block के लिए विलंब मॉडल का परिणाम',
    heldEmpty: '{date} के block से कोई ट्रेन नियंत्रित नहीं होती।',
    modeSlw: 'एकल-लाइन संचालन',
    modeHeld: 'रोकी गई',
    modeRegulated: 'नियंत्रित',
    heldRow: '{mode} · block {id} · {section}',
    progTitle: 'Block कार्यक्रम · {date}',
    progSub: 'दिन के सभी block विभाग, संसाधन और स्थिति सहित। block खोलने के लिए पंक्ति पर क्लिक करें।',
    colWindow: 'विंडो',
    colSection: 'Block सेक्शन',
    colLine: 'लाइन',
    colKind: 'प्रकार',
    colDepts: 'विभाग',
    colWork: 'कार्य',
    colMachine: 'मशीन',
    colIncharge: 'प्रभारी',
    colT351: 'T/351',
    colSpeed: 'बाद की गति',
    colTrains: 'नियंत्रित ट्रेनें',
    colState: 'स्थिति',
    kindTraffic: 'यातायात',
    kindPower: 'पावर',
    kindTrafficPower: 'यातायात + पावर',
    kindDisconnection: 'S&T डिस्कनेक्शन',
    fullSpeed: 'पूर्ण गति',
    t351NotNeeded: 'आवश्यक नहीं',
    moreWorks: '+{n} और',
    notSet: 'निर्धारित नहीं',
    printProgramme: 'कार्यक्रम प्रिंट करें',
    progSheetTitle: 'दैनिक block कार्यक्रम',
    sheetSignature: 'सेक्शन नियंत्रक',
    handoverTitle: 'हैंडओवर नोट · {date}',
    handoverSub: 'अगली पाली के नियंत्रक के लिए कार्यक्रम के साथ रखा जाता है; उसी के साथ प्रिंट होता है।',
    handoverLabel: 'अगली पाली के लिए नोट',
    handoverPlaceholder: 'अभी लागू नियंत्रण, खुले S&T डिस्कनेक्शन, सौंपी गई सावधानियाँ…',
    handoverSave: 'नोट सहेजें',
    handoverSaved: 'हैंडओवर नोट सहेजा गया',
    handoverUnchanged: 'सहेजने को कोई बदलाव नहीं।',
    mapTitle: 'कॉरिडोर मानचित्र · {time}',
    mapSub: '{date} के block, खतरा रिपोर्ट और नियंत्रण घड़ी पर ट्रेनें।',
    trainTitle: 'ट्रेन खोज',
    trainSub: '{date} को चलने वाली ट्रेनें',
    trainSearch: 'ट्रेन संख्या, नाम या स्टेशन कोड',
    trainNone: '{date} को “{q}” से मेल खाती कोई ट्रेन नहीं।',
    trainAt: 'किमी {km} · {from} → {to}',
    trainHalted: '{station} पर रुकी · किमी {km}',
    trainNotRunning: '{time} पर कॉरिडोर पर नहीं। {origin} {dep} → {dest} {arr}।',
    trainBlocks: '{date} को इस ट्रेन के मार्ग के block',
    trainNoBlocks: '{date} को इसके मार्ग पर कोई block नहीं।',
    trainImpact: '{mode} · {min} मिनट',
    trainNoImpact: 'block विंडो के बाहर गुजरती है',
    refuseTitle: 'Block {id} अस्वीकार करें',
    refuseBody: '{section} · {window}। block बोर्ड से हट जाएगा; योजना प्रकोष्ठ और विभागों को कारण बताया जाएगा।',
    refuseReason: 'कारण',
    reasonTraffic: 'यातायात: समयपालन जोखिम',
    reasonFailure: 'निकट उपकरण विफलता',
    reasonGang: 'गैंग तैयार नहीं',
    reasonT351: 'T/351 प्राप्त नहीं',
    reasonMachine: 'मशीन नहीं पहुँची',
    reasonOther: 'अन्य',
    refuseNote: 'विवरण',
    refuseNoteRequired: '“अन्य” के लिए विवरण आवश्यक है।',
    refuseConfirm: 'Block अस्वीकार करें',
    refusedToast: '{section} {window} अस्वीकृत',
    clearTitle: 'लाइन क्लियर · {id}',
    clearBody: '{section} · {line}। लाइन वापस सौंपने का समय और उपयुक्त गति दर्ज करें।',
    clearTime: 'लाइन क्लियर समय',
    clearFit: 'लाइन उपयुक्त है',
    clearFull: 'पूर्ण गति',
    clearTsr: 'TSR',
    clearSpeed: 'TSR गति (किमी/घं)',
    clearFrom: 'किमी से',
    clearTo: 'किमी तक',
    clearReason: 'TSR का कारण',
    clearReasonDefault: 'block {id} के बाद समेकन',
    clearKmError: 'किमी सीमा कॉरिडोर के भीतर (0–{len} किमी) और से ≤ तक होनी चाहिए।',
    clearSpeedError: 'खंडीय गति {mps} किमी/घं से कम TSR गति दर्ज करें।',
    clearConfirm: 'लाइन क्लियर दर्ज करें',
    clearedToast: 'लाइन क्लियर दर्ज · {section}',
    clearedFull: 'पूर्ण गति हेतु उपयुक्त',
    clearedTsr: 'TSR {v} किमी/घं, किमी {a}–{b} लागू; T/409 पुनः बना',
    t351Title: 'T/351 अभी प्राप्त नहीं',
    t351Body: 'इस block के S&T कार्य का T/351 अभी प्राप्त नहीं हुआ। फिर भी प्रदान करें?',
    t351Note: 'प्रदान करना ऑडिट ट्रेल में खुले नोटिस के साथ दर्ज होगा।',
    t351Grant: 'फिर भी प्रदान करें',
    cancel: 'रद्द करें',
    minUnit: 'मिनट',
    fs_DRAFT: 'प्रारूप',
    fs_ISSUED: 'जारी',
    fs_RECEIVED: 'प्राप्त',
    fs_RECONNECTED: 'रीकनेक्ट',
    fs_WITHDRAWN: 'वापस लिया',
    fs_ACKNOWLEDGED: 'पावती दी',
    bs_PROPOSED: 'प्रस्तावित',
    bs_GRANTED: 'प्रदत्त',
    bs_REFUSED: 'अस्वीकृत',
    bs_LOCKED: 'लॉक',
    grantedToast: '{section} {window} प्रदत्त',
    grantedChangeToast: 'बदलाव के साथ प्रदत्त',
  },
} as const;

type Key = keyof typeof strings.en;

const win = (b: { start: number; end: number }) => `${hhmm(b.start)}–${hhmm(b.end)}`;
const kindKey = (k: WorkingBlock['kind']): Key => (k === 'POWER' ? 'kindPower' : k === 'TRAFFIC + POWER' ? 'kindTrafficPower' : k === 'DISCONNECTION' ? 'kindDisconnection' : 'kindTraffic');
const modeKey = (m: AffectedTrain['mode']): Key => (m === 'SLW' ? 'modeSlw' : m === 'HELD' ? 'modeHeld' : 'modeRegulated');
const isCleared = (r: ExecRecord | undefined) => !!r && r.status !== 'IN_PROGRESS';

/* printed sheets are always black on white (FormSheet); borders follow the text colour */
const sheetTable: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 11 };
const sheetCell: CSSProperties = { border: '1px solid currentColor', padding: '4px 6px', textAlign: 'left', verticalAlign: 'top' };
const wellBtn: CSSProperties = { textAlign: 'left', padding: '8px 10px', width: '100%' };

export default function ControlBoardPage({ view = 'board' }: ControlBoardPageProps) {
  const snapshot = useAppStore((s) => s.snapshot);
  if (!snapshot) return <PlanPending />;
  return <ControlBoard snapshot={snapshot} view={view} />;
}

function ControlBoard({ snapshot, view }: { snapshot: Snapshot; view: View }) {
  const t = useT(strings);
  const nav = useNavigate();
  const location = useLocation();
  const drawer = useDrawerParams();

  const user = useAppStore((s) => s.user);
  const approvals = useAppStore((s) => s.approvals);
  const executionLog = useAppStore((s) => s.executionLog);
  const reports = useAppStore((s) => s.reports);
  const forms = useAppStore((s) => s.forms);
  const tsrs = useAppStore((s) => s.tsrs);
  const handoverNotes = useAppStore((s) => s.handoverNotes);
  const corridorId = useAppStore((s) => s.corridorId);
  const grant = useAppStore((s) => s.grant);
  const lock = useAppStore((s) => s.lock);
  const refuse = useAppStore((s) => s.refuse);
  const clearPossession = useAppStore((s) => s.clearPossession);
  const addTsr = useAppStore((s) => s.addTsr);
  const setHandoverNote = useAppStore((s) => s.setHandoverNote);
  const setCorridor = useAppStore((s) => s.setCorridor);
  const toast = useAppStore((s) => s.toast);

  const [minute, setMinute] = useState(() => nowMinuteIST());
  const [playing, setPlaying] = useState(false);
  const [layers, setLayers] = useState<Layer[]>(['passenger', 'goods', 'freeWindows']);
  const [changeBlock, setChangeBlock] = useState<WorkingBlock | null>(null);
  const [refuseBlock, setRefuseBlock] = useState<WorkingBlock | null>(null);
  const [clearBlock, setClearBlock] = useState<WorkingBlock | null>(null);
  const [t351Block, setT351Block] = useState<WorkingBlock | null>(null);
  const [trainQuery, setTrainQuery] = useState('');
  const [trainNo, setTrainNo] = useState<string | null>(null);

  const canGrant = can(user, 'grant');
  const canLock = can(user, 'lock');
  const canExecute = can(user, 'execute');

  const corridor = snapshot.corridor;
  const rules = snapshot.result.rules;
  const day = drawer.day === 1 ? 1 : 0;
  const dayIso = addDaysIso(snapshot.planStart, day);
  const d1Iso = addDaysIso(snapshot.planStart, 1);
  const occ = snapshot.result.weekly.occupancy[day];

  /* ── derived plan state ─────────────────────────────────── */
  const allWorking = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals]);
  const dayAll = useMemo(() => blocksForDay(allWorking, day).slice().sort((a, b) => a.start - b.start), [allWorking, day]);
  const dayBlocks = useMemo(() => dayAll.filter((b) => b.status !== 'REFUSED'), [dayAll]);
  const refusedCount = dayAll.length - dayBlocks.length;
  const d1Granted = useMemo(() => blocksForDay(allWorking, 1).filter((b) => b.status === 'GRANTED'), [allWorking]);

  const nextBlock = useMemo(() => allWorking.filter((b) => b.day > day && b.status !== 'REFUSED').sort((a, b) => a.day - b.day || a.start - b.start)[0] ?? null, [allWorking, day]);

  const dayTrains = useMemo<Train[]>(() => {
    const dow = snapshot.result.weekly.occupancy[day]?.dow;
    const pax = dow === undefined ? [] : snapshot.feeds.timetable.filter((tr) => !!tr.runsOn?.[dow]);
    return [...pax, ...snapshot.feeds.freight.filter((f) => f.day === day)];
  }, [snapshot, day]);

  const positions = useMemo(() => livePositions(snapshot, day, minute, allWorking), [snapshot, day, minute, allWorking]);

  const execFor = useMemo(() => {
    const m = new Map<string, ExecRecord>();
    for (const r of executionLog) if (r.corridorId === corridor.id) m.set(r.blockId, r);
    return m;
  }, [executionLog, corridor.id]);

  /* T/351 notices of the day: statuses per block, and blocks whose notice is not yet received */
  const { t351ByBlock, t351Pending } = useMemo(() => {
    const byBlock = new Map<string, string[]>();
    const open = new Set<string>();
    for (const n of disconnectionNotices(snapshot, allWorking, forms, day)) {
      byBlock.set(n.blockId, [...(byBlock.get(n.blockId) ?? []), n.status]);
      if (n.status !== 'RECEIVED' && n.status !== 'RECONNECTED') open.add(n.blockId);
    }
    return { t351ByBlock: byBlock, t351Pending: open };
  }, [snapshot, allWorking, forms, day]);

  /* TSR bands: caution orders in force on the day (register TSRs + manual TSRs in force) */
  const tsrBands = useMemo<TsrBand[]>(
    () =>
      cautionOrders(snapshot, allWorking, tsrs, forms, day)
        .filter((o) => o.manual?.status !== 'PROPOSED')
        .map((o) => ({ fromKm: o.startKm, toKm: o.endKm, kmph: o.speedKmph, line: o.line, label: `${o.orderNo} · ${o.reason}` })),
    [snapshot, allWorking, tsrs, forms, day]
  );

  const freeWindows = useMemo(() => (occ ? freeWindowsForDay(occ, corridor, rules.minBlockMin, rules.headwayMarginMin) : []), [occ, corridor, rules.minBlockMin, rules.headwayMarginMin]);
  const baselineDay = useMemo(() => snapshot.result.weekly.baseline.blocks.filter((b) => b.day === day), [snapshot, day]);
  const chartLayers = useMemo<Partial<StringDiagramLayers>>(
    () => ({ passenger: layers.includes('passenger'), goods: layers.includes('goods'), freeWindows: layers.includes('freeWindows'), baseline: layers.includes('baseline'), blocks: true, tsr: true }),
    [layers]
  );

  const held = useMemo(() => dayBlocks.flatMap((b) => b.affectedTrains.map((a) => ({ a, b }))).sort((x, y) => y.a.delayMin - x.a.delayMin), [dayBlocks]);
  const corridorReports = useMemo(() => reports.filter((r) => r.corridorId === corridor.id), [reports, corridor.id]);

  /* ── stats ─────────────────────────────────────────────── */
  const grantedCount = dayBlocks.filter((b) => b.status === 'GRANTED' || b.status === 'LOCKED').length;
  const readyCount = dayBlocks.filter((b) => b.status === 'PROPOSED' && b.concurred).length;
  const waitingCount = dayBlocks.filter((b) => b.status === 'PROPOSED' && !b.concurred).length;
  const inProgressCount = dayBlocks.filter((b) => execFor.get(b.id)?.status === 'IN_PROGRESS').length;
  const toClearCount = dayBlocks.filter((b) => (b.status === 'GRANTED' || b.status === 'LOCKED') && !isCleared(execFor.get(b.id))).length;
  const worksCount = dayBlocks.reduce((a, b) => a + b.tasks.length, 0);
  const regulatedCount = dayBlocks.reduce((a, b) => a + b.affectedTrains.length, 0);
  const weightedMin = dayBlocks.reduce((a, b) => a + b.weightedDelayMin, 0);
  const newIncidents = corridorReports.filter((r) => r.status === 'UNVERIFIED').length;
  const verifying = corridorReports.filter((r) => r.status === 'TRIAGED').length;

  /* ── actions ───────────────────────────────────────────── */
  const grantNow = (b: WorkingBlock) => {
    grant(b.id);
    toast({ title: t('grantedToast', { section: b.sectionText, window: win(b) }), body: `${b.id} · ${duration(b.spanMin)}`, tone: 'ok' });
  };
  const doGrant = (b: WorkingBlock) => {
    if (t351Pending.has(b.id)) setT351Block(b);
    else grantNow(b);
  };
  const doGrantChange = (b: WorkingBlock, start: number, end: number) => {
    grant(b.id, { start, end });
    toast({ title: t('grantedChangeToast'), body: `${b.sectionText} · ${hhmm(start)}–${hhmm(end)} · ${duration(end - start)}`, tone: 'ok' });
    setChangeBlock(null);
  };
  const doRefuse = (b: WorkingBlock, reason: string) => {
    refuse(b.id, reason);
    toast({ title: t('refusedToast', { section: b.sectionText, window: win(b) }), body: reason, tone: 'warn' });
    setRefuseBlock(null);
  };
  const doClear = (b: WorkingBlock, r: ClearResult) => {
    if (r.tsr) addTsr({ corridorId: corridor.id, line: b.line, fromKm: r.tsr.fromKm, toKm: r.tsr.toKm, kmph: r.tsr.kmph, reason: r.tsr.reason, status: 'IN_FORCE', blockId: b.id });
    clearPossession(b.id, { actualEnd: r.actualEnd, speedOnLifting: r.tsr ? r.tsr.kmph : null, source: 'control' });
    toast({ title: t('clearedToast', { section: b.sectionText }), body: r.tsr ? t('clearedTsr', { v: r.tsr.kmph, a: r.tsr.fromKm.toFixed(1), b: r.tsr.toKm.toFixed(1) }) : t('clearedFull'), tone: 'ok' });
    setClearBlock(null);
  };
  const doLock = () => {
    const n = d1Granted.length;
    for (const b of d1Granted) lock(b.id);
    toast({ title: t('lockedToast', { n, date: dateLabel(d1Iso) }), tone: 'ok' });
  };
  const changeCorridor = (id: string) => {
    const c = (CORRIDORS as Corridor[]).find((x) => x.id === id);
    setCorridor(id);
    toast({ title: t('corridorChanged', { name: c?.name ?? id }), body: t('corridorChangedBody'), tone: 'info' });
  };
  const setView = (v: View) => nav({ pathname: `/app/control/${v}`, search: location.search }, { replace: true });

  const lockHint = !canLock ? t('lockNoCap') : d1Granted.length === 0 ? t('lockNone', { date: dateLabel(d1Iso) }) : t('lockHint', { date: dateLabel(d1Iso) });

  /* ── inline block actions (Tonight list) ────────────────── */
  const blockActions = (b: WorkingBlock) => {
    const ex = execFor.get(b.id);
    if (b.status === 'PROPOSED') {
      const missing = b.departments.filter((d) => !b.approval?.concur[d]).map((d) => DEPT_LABEL[d].short);
      const hint = !canGrant ? t('noGrantCap') : missing.length ? t('awaiting', { depts: missing.join(', ') }) : undefined;
      const ok = canGrant && b.concurred;
      return (
        <>
          <button className="btn btn-sm btn-primary" disabled={!ok} title={hint} onClick={() => doGrant(b)}>{t('grant')}</button>
          <button className="btn btn-sm" disabled={!ok} title={hint} onClick={() => setChangeBlock(b)}>{t('grantChange')}</button>
          <button className="btn btn-sm btn-ghost" disabled={!canGrant} title={canGrant ? undefined : t('noGrantCap')} onClick={() => setRefuseBlock(b)}>{t('refuse')}</button>
        </>
      );
    }
    if (b.status === 'GRANTED' || b.status === 'LOCKED') {
      if (isCleared(ex)) return <span className="tiny muted">{ex?.speedOnLifting ? t('clearedSpeed', { time: hhmm(ex.actualEnd ?? b.end), v: ex.speedOnLifting }) : t('cleared', { time: hhmm(ex?.actualEnd ?? b.end) })}</span>;
      const started = ex?.status === 'IN_PROGRESS';
      const hint = !canExecute ? t('noExecCap') : !started ? t('notStarted') : undefined;
      return (
        <>
          {started && <span className="tiny muted">{t('started', { time: hhmm(ex?.actualStart ?? b.start) })}</span>}
          <button className="btn btn-sm btn-ok" disabled={!started || !canExecute} title={hint} onClick={() => setClearBlock(b)}>{t('clear')}</button>
        </>
      );
    }
    return null;
  };

  /* ── programme columns ─────────────────────────────────── */
  const machineLabel = (id: string) => snapshot.feeds.machines.find((m) => m.id === id)?.label ?? id;
  const speedAfter = (b: WorkingBlock) => {
    const v = b.tasks.map((x) => x.tsrKmph).filter((x): x is number => !!x);
    return v.length ? `${Math.min(...v)} km/h` : t('fullSpeed');
  };
  const t351Text = (b: WorkingBlock) => {
    const st = t351ByBlock.get(b.id);
    if (!st) return t('t351NotNeeded');
    return [...new Set(st)].map((s) => t(`fs_${s}` as Key)).join(', ');
  };
  const programmeCols: Column<WorkingBlock>[] = [
    { key: 'window', header: t('colWindow'), render: (b) => <span className="mono num strong">{win(b)}</span> },
    {
      key: 'section',
      header: t('colSection'),
      render: (b) => (
        <div>
          <div className="strong">{b.sectionText}</div>
          <div className="tiny muted mono">{b.id} · {kmRange(b.startKm, b.endKm)}</div>
        </div>
      ),
    },
    { key: 'line', header: t('colLine'), render: (b) => lineLabel(b.line) },
    { key: 'kind', header: t('colKind'), render: (b) => t(kindKey(b.kind)), hideMobile: true },
    { key: 'depts', header: t('colDepts'), render: (b) => <div className="row-wrap" style={{ gap: 4 }}>{b.departments.map((d) => <DeptBadge key={d} dept={d} />)}</div> },
    {
      key: 'work',
      header: t('colWork'),
      hideMobile: true,
      render: (b) => (
        <div className="stack" style={{ gap: 2 }}>
          {b.tasks.slice(0, 2).map((x) => <span key={x.id} className="small">{x.label}</span>)}
          {b.tasks.length > 2 && <span className="tiny muted">{t('moreWorks', { n: b.tasks.length - 2 })}</span>}
        </div>
      ),
    },
    { key: 'machine', header: t('colMachine'), hideMobile: true, render: (b) => { const ids = b.approval?.resources?.machineId ? [b.approval.resources.machineId] : b.machines; return ids.length ? ids.map(machineLabel).join(', ') : '—'; } },
    { key: 'incharge', header: t('colIncharge'), hideMobile: true, render: (b) => b.approval?.incharge ?? <span className="muted">{t('notSet')}</span> },
    { key: 't351', header: t('colT351'), hideMobile: true, render: (b) => (t351Pending.has(b.id) ? <Badge tone="warn">{t351Text(b)}</Badge> : <span className="small">{t351Text(b)}</span>) },
    { key: 'speed', header: t('colSpeed'), render: (b) => speedAfter(b) },
    { key: 'trains', header: t('colTrains'), num: true, render: (b) => <span className="num">{b.affectedTrains.length}</span> },
    { key: 'state', header: t('colState'), render: (b) => <StatusBadge status={b.status} /> },
  ];

  /* ── map: selected train ───────────────────────────────── */
  const trainMatches = useMemo(() => searchTrains(dayTrains, trainQuery).slice(0, 12) as Train[], [dayTrains, trainQuery]);
  const selTrain = trainNo ? dayTrains.find((x) => x.number === trainNo) ?? null : null;
  const selPos = selTrain ? positions.find((p) => p.trainNo === selTrain.number) ?? null : null;
  const selMet = useMemo(() => (selTrain ? blocksMetByTrain(snapshot, dayBlocks, selTrain) : []), [snapshot, dayBlocks, selTrain]);

  const savedNote = handoverNotes[dayIso] ?? '';
  const emptyTonight = (
    <EmptyState
      title={t('noBlocks', { date: dateLabel(dayIso) })}
      body={nextBlock ? t('nextBlock', { when: dateLabel(nextBlock.date), section: nextBlock.sectionText, window: win(nextBlock) }) : t('noNext')}
    />
  );

  return (
    <div className="stack-lg">
      <PageHeader
        title={t('title')}
        lede={t('lede')}
        actions={
          <>
            <select className="select" style={{ width: 'auto', maxWidth: 240 }} value={corridorId} onChange={(e) => changeCorridor(e.target.value)} aria-label={t('corridor')}>
              {(CORRIDORS as Corridor[]).map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
              ))}
            </select>
            <Segmented<'0' | '1'>
              ariaLabel={t('dayAria')}
              value={day === 1 ? '1' : '0'}
              onChange={(v) => drawer.set('day', v === '1' ? 1 : null)}
              options={[
                { value: '0', label: t('dayD', { date: dateLabel(snapshot.planStart) }) },
                { value: '1', label: t('dayD1', { date: dateLabel(d1Iso) }) },
              ]}
            />
            <Segmented<View>
              ariaLabel={t('viewAria')}
              value={view}
              onChange={setView}
              options={[
                { value: 'board', label: t('viewBoard') },
                { value: 'programme', label: t('viewProgramme') },
                { value: 'map', label: t('viewMap') },
              ]}
            />
            <button className="btn btn-sm btn-dark" data-tour="control-lock" disabled={!canLock || d1Granted.length === 0} title={lockHint} onClick={doLock}>
              <Lock size={14} /> {t('lockD1', { n: d1Granted.length })}
            </button>
          </>
        }
      />

      <div className="grid grid-auto">
        <StatTile label={t('statBlocks')} value={dayBlocks.length} sub={t('subBlocks', { works: worksCount, refused: refusedCount })} />
        <StatTile label={t('statGranted')} value={grantedCount} sub={t('subGranted', { ready: readyCount, waiting: waitingCount })} />
        <StatTile label={t('statProgress')} value={inProgressCount} sub={t('subProgress')} />
        <StatTile label={t('statToClear')} value={toClearCount} sub={t('subToClear')} />
        <StatTile label={t('statRegulated')} value={regulatedCount} sub={t('subRegulated', { min: Math.round(weightedMin) })} />
        <StatTile label={t('statIncidents')} value={newIncidents} sub={t('subIncidents', { n: verifying })} />
      </div>

      <Card>
        <CardBody tight>
          <div className="row-wrap" style={{ gap: 12 }}>
            <span className="strong small">{t('clock')}</span>
            <div className="grow" style={{ minWidth: 240 }}>
              {/* TimeScrubber carries the simClock honesty label (SimLabel kind="simClock") */}
              <TimeScrubber minute={minute} onChange={setMinute} playing={playing} onPlay={setPlaying} dayLabel={dateLabel(dayIso)} onNow={() => setMinute(nowMinuteIST())} />
            </div>
          </div>
        </CardBody>
      </Card>

      {view === 'board' && (
        <div className="grid grid-main-aside" style={{ alignItems: 'start' }}>
          <div className="stack">
            <Card tour="board-chart">
              <CardHead
                title={t('chartTitle', { date: dateLabel(dayIso) })}
                sub={t('chartSub')}
                right={
                  <>
                    <SimLabel kind="wttPositions" />
                    <SimLabel kind="seededFeed" system="COA / FOIS" />
                  </>
                }
              />
              <CardBody>
                <div className="row-wrap mb">
                  <span className="small muted">{t('layers')}</span>
                  <ChipGroup<Layer>
                    multi
                    value={layers}
                    onChange={(v) => setLayers(Array.isArray(v) ? v : [v])}
                    options={[
                      { value: 'passenger', label: t('layerPassenger') },
                      { value: 'goods', label: t('layerGoods') },
                      { value: 'freeWindows', label: t('layerFree') },
                      { value: 'baseline', label: t('layerBaseline') },
                    ]}
                  />
                </div>
                <StringDiagram
                  corridor={corridor}
                  trains={dayTrains}
                  blocks={dayBlocks}
                  day={day}
                  dow={occ?.dow ?? 0}
                  corridorBlocks={corridor.corridorBlocks}
                  freeWindows={freeWindows}
                  tsrs={tsrBands}
                  nowMinute={minute}
                  layers={chartLayers}
                  baselineBlocks={baselineDay}
                  height={560}
                  onBlockClick={(b) => drawer.open('block', b.id)}
                />
              </CardBody>
            </Card>
            <div className="row-wrap">
              <span className="small muted grow">{t('chartHint')}</span>
              <button className="btn btn-sm" onClick={() => nav('/app/control/replan')}>
                <Flame size={14} /> {t('replanTonight')}
              </button>
            </div>
          </div>

          <div className="stack">
            <Card>
              <CardHead title={day === 0 ? t('tonight') : t('tomorrow')} sub={t('tonightSub', { n: dayBlocks.length })} />
              <CardBody tight>
                <div className="stack" data-tour="control-tonight" style={{ maxHeight: 460, overflowY: 'auto' }}>
                  {dayBlocks.length === 0
                    ? emptyTonight
                    : dayBlocks.map((b) => (
                        <div
                          key={b.id}
                          className="card clickable"
                          role="button"
                          tabIndex={0}
                          style={{ padding: '10px 12px', borderLeft: `3px solid var(--${DEPT_CLASS[b.departments[0]]})` }}
                          onClick={() => drawer.open('block', b.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') drawer.open('block', b.id);
                          }}
                        >
                          <div className="row">
                            <span className="strong small grow truncate">{b.sectionText}</span>
                            <StatusBadge status={b.status} />
                          </div>
                          <div className="row tiny muted" style={{ marginTop: 4 }}>
                            <span className="mono num">{win(b)} · {duration(b.spanMin)}</span>
                            <span className="right">{lineLabel(b.line)}</span>
                          </div>
                          <div className="row-wrap" style={{ gap: 4, marginTop: 6 }}>
                            {b.departments.map((d) => <DeptBadge key={d} dept={d} />)}
                            {b.affectedTrains.length > 0 && <Badge tone="warn">{t('trainsN', { n: b.affectedTrains.length })}</Badge>}
                            {t351Pending.has(b.id) && <Badge tone="crit">{t('t351Pending')}</Badge>}
                          </div>
                          {b.status === 'PROPOSED' && (
                            <div className="tiny muted" style={{ marginTop: 4 }}>
                              {b.concurred ? t('readyToGrant') : t('awaiting', { depts: b.departments.filter((d) => !b.approval?.concur[d]).map((d) => DEPT_LABEL[d].short).join(', ') })}
                            </div>
                          )}
                          <div className="row-wrap" style={{ gap: 6, marginTop: 8, justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                            {blockActions(b)}
                          </div>
                        </div>
                      ))}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHead title={t('heldTitle')} sub={t('heldSub', { date: dateLabel(dayIso) })} right={<SimLabel kind="planningEstimate" />} />
              <CardBody tight>
                {held.length === 0 ? (
                  <div className="small muted">{t('heldEmpty', { date: dateLabel(dayIso) })}</div>
                ) : (
                  <div className="stack" style={{ maxHeight: 300, overflowY: 'auto', gap: 6 }}>
                    {held.map(({ a, b }) => (
                      <button key={`${a.trainId}-${b.id}`} className="well" style={wellBtn} onClick={() => drawer.open('block', b.id)}>
                        <div className="row">
                          <span className="strong small grow truncate">
                            <span className="mono">{a.number}</span> {a.name}
                          </span>
                          <Badge tone={a.premium ? 'crit' : 'warn'}>+{Math.round(a.delayMin)} {t('minUnit')}</Badge>
                        </div>
                        <div className="tiny muted" style={{ marginTop: 2 }}>
                          {t('heldRow', { mode: t(modeKey(a.mode)), id: b.id, section: b.sectionText })} · {classLabel(a.cls)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {view === 'programme' && (
        <div className="stack-lg">
          <Card>
            <CardHead title={t('progTitle', { date: dateLabel(dayIso) })} sub={t('progSub')} right={<PrintButton label={t('printProgramme')} targetId="programme-sheet" />} />
            <CardBody flush>
              {dayBlocks.length === 0 ? emptyTonight : <DataTable<WorkingBlock> columns={programmeCols} rows={dayBlocks} rowKey={(b) => b.id} onRowClick={(b) => drawer.open('block', b.id)} />}
            </CardBody>
          </Card>
          <HandoverNote key={dayIso} dateLabelText={dateLabel(dayIso)} saved={savedNote} onSave={(note) => setHandoverNote(dayIso, note)} />
          <div className="print-only">
            <FormSheet id="programme-sheet" title={t('progSheetTitle')} formNo={`${corridor.code} · ${corridor.division} · ${dateLabel(dayIso)}`}>
              <table style={sheetTable}>
                <thead>
                  <tr>
                    {(['colWindow', 'colSection', 'colLine', 'colDepts', 'colWork', 'colIncharge', 'colT351', 'colSpeed', 'colTrains', 'colState'] as Key[]).map((k) => (
                      <th key={k} style={sheetCell}>{t(k)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dayBlocks.map((b) => (
                    <tr key={b.id}>
                      <td style={sheetCell}>{win(b)}</td>
                      <td style={sheetCell}>{b.sectionText}<br />{b.id} · {kmRange(b.startKm, b.endKm)}</td>
                      <td style={sheetCell}>{b.line}</td>
                      <td style={sheetCell}>{b.departments.map((d) => DEPT_LABEL[d].short).join(', ')}</td>
                      <td style={sheetCell}>{b.tasks.map((x) => x.label).join('; ')}</td>
                      <td style={sheetCell}>{b.approval?.incharge ?? '—'}</td>
                      <td style={sheetCell}>{t351Text(b)}</td>
                      <td style={sheetCell}>{speedAfter(b)}</td>
                      <td style={sheetCell}>{b.affectedTrains.length}</td>
                      <td style={sheetCell}>{t(`bs_${b.status}` as Key)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {savedNote && (
                <p style={{ marginTop: 12 }}>
                  <b>{t('handoverLabel')}:</b> {savedNote}
                </p>
              )}
              <div style={{ marginTop: 28, width: 220, borderTop: '1px solid currentColor', paddingTop: 4, fontSize: 11 }}>{t('sheetSignature')}</div>
            </FormSheet>
          </div>
        </div>
      )}

      {view === 'map' && (
        <div className="grid grid-main-aside" style={{ alignItems: 'start' }}>
          <Card>
            <CardHead
              title={t('mapTitle', { time: hhmm(minute) })}
              sub={t('mapSub', { date: dateLabel(dayIso) })}
              right={
                <>
                  <SimLabel kind="wttPositions" />
                  <SimLabel kind="seededFeed" system="COA" />
                </>
              }
            />
            <CardBody flush>
              <CorridorMap
                corridor={corridor}
                blocks={dayBlocks}
                trains={positions}
                incidents={corridorReports}
                height={600}
                selected={trainNo ? { kind: 'train', id: trainNo } : null}
                onSelect={(kind, id) => {
                  if (kind === 'block') drawer.open('block', id);
                  else if (kind === 'task') drawer.open('task', id);
                  else if (kind === 'report') drawer.open('report', id);
                  else if (kind === 'train') setTrainNo(id);
                  else if (kind === 'station') setTrainQuery(id);
                }}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHead title={t('trainTitle')} sub={t('trainSub', { date: dateLabel(dayIso) })} right={<SimLabel kind="wttPositions" short />} />
            <CardBody>
              <div className="stack">
                <input type="search" className="input" placeholder={t('trainSearch')} aria-label={t('trainSearch')} value={trainQuery} onChange={(e) => setTrainQuery(e.target.value)} />
                {trainMatches.length === 0 ? (
                  <div className="small muted">{t('trainNone', { q: trainQuery, date: dateLabel(dayIso) })}</div>
                ) : (
                  <div className="stack" style={{ maxHeight: 260, overflowY: 'auto', gap: 6 }}>
                    {trainMatches.map((tr) => {
                      const pos = positions.find((p) => p.trainNo === tr.number);
                      const on = trainNo === tr.number;
                      return (
                        <button key={tr.id} className="well" aria-pressed={on} style={on ? { ...wellBtn, background: 'var(--pastel-lavender)' } : wellBtn} onClick={() => setTrainNo(on ? null : tr.number)}>
                          <div className="row">
                            <span className="strong small grow truncate">
                              <span className="mono">{tr.number}</span> {tr.name}
                            </span>
                            <span className="tiny muted">{classLabel(tr.cls)}</span>
                          </div>
                          <div className="tiny muted" style={{ marginTop: 2 }}>
                            {pos ? (pos.isHalted && pos.haltStation ? t('trainHalted', { station: pos.haltStation, km: pos.km.toFixed(1) }) : t('trainAt', { km: pos.km.toFixed(1), from: pos.currentStation, to: pos.nextStation })) : t('trainNotRunning', { time: hhmm(minute), origin: tr.origin, dep: hhmm(tr.dep), dest: tr.destination, arr: hhmm(tr.arr) })}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {selTrain && (
                  <div className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                    <div className="section-title">{t('trainBlocks', { date: dateLabel(dayIso) })}</div>
                    {selMet.length === 0 ? (
                      <div className="small muted">{t('trainNoBlocks', { date: dateLabel(dayIso) })}</div>
                    ) : (
                      selMet.map(({ block, impact }) => (
                        <button key={block.id} className="well" style={wellBtn} onClick={() => drawer.open('block', block.id)}>
                          <div className="row">
                            <span className="strong small grow truncate">{block.sectionText}</span>
                            <span className="mono tiny num">{win(block)}</span>
                          </div>
                          <div className="tiny muted">{impact ? t('trainImpact', { mode: t(modeKey(impact.mode)), min: Math.round(impact.delayMin) }) : t('trainNoImpact')}</div>
                        </button>
                      ))
                    )}
                    {selPos === null && <div className="tiny muted">{t('trainNotRunning', { time: hhmm(minute), origin: selTrain.origin, dep: hhmm(selTrain.dep), dest: selTrain.destination, arr: hhmm(selTrain.arr) })}</div>}
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {changeBlock && (
        <GrantWithChange open onClose={() => setChangeBlock(null)} snapshot={snapshot} block={changeBlock} others={allWorking} t351Pending={t351Pending.has(changeBlock.id)} onConfirm={(s, e) => doGrantChange(changeBlock, s, e)} />
      )}
      {refuseBlock && <RefuseModal key={refuseBlock.id} block={refuseBlock} onClose={() => setRefuseBlock(null)} onConfirm={(reason) => doRefuse(refuseBlock, reason)} />}
      {clearBlock && <ClearModal key={clearBlock.id} block={clearBlock} corridor={corridor} defaultMinute={minute} onClose={() => setClearBlock(null)} onConfirm={(r) => doClear(clearBlock, r)} />}
      {t351Block && (
        <Modal
          open
          onClose={() => setT351Block(null)}
          title={t('t351Title')}
          footer={
            <div className="row" style={{ justifyContent: 'flex-end', width: '100%' }}>
              <button className="btn" onClick={() => setT351Block(null)}>{t('cancel')}</button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  const b = t351Block;
                  setT351Block(null);
                  grantNow(b);
                }}
              >
                {t('t351Grant')}
              </button>
            </div>
          }
        >
          <div className="stack">
            <Callout tone="warn">{t('t351Body')}</Callout>
            <div className="small muted">{t351Block.sectionText} · {win(t351Block)} · {t351Text(t351Block)}</div>
            <div className="small muted">{t('t351Note')}</div>
          </div>
        </Modal>
      )}

      <BlockDrawer blockId={drawer.blockId} onClose={() => drawer.close('block')} />
      <TaskDrawer taskId={drawer.taskId} onClose={() => drawer.close('task')} />
      <ReportDrawer reportId={drawer.reportId} onClose={() => drawer.close('report')} />
    </div>
  );
}

/* ── Handover note (local draft, saved on demand) ───────────── */
function HandoverNote({ dateLabelText, saved, onSave }: { dateLabelText: string; saved: string; onSave: (note: string) => void }) {
  const t = useT(strings);
  const toast = useAppStore((s) => s.toast);
  const [draft, setDraft] = useState(saved);
  const dirty = draft.trim() !== saved.trim();
  return (
    <Card>
      <CardHead title={t('handoverTitle', { date: dateLabelText })} sub={t('handoverSub')} />
      <CardBody>
        <Field label={t('handoverLabel')}>
          <textarea className="textarea" rows={3} value={draft} placeholder={t('handoverPlaceholder')} onChange={(e) => setDraft(e.target.value)} />
        </Field>
        <div className="row mt" style={{ justifyContent: 'flex-end' }}>
          <button
            className="btn btn-sm btn-dark"
            disabled={!dirty}
            title={dirty ? undefined : t('handoverUnchanged')}
            onClick={() => {
              onSave(draft.trim());
              toast({ title: t('handoverSaved'), body: dateLabelText, tone: 'ok' });
            }}
          >
            {t('handoverSave')}
          </button>
        </div>
      </CardBody>
    </Card>
  );
}

/* ── Refuse ─────────────────────────────────────────────────── */
function RefuseModal({ block, onClose, onConfirm }: { block: WorkingBlock; onClose: () => void; onConfirm: (reason: string) => void }) {
  const t = useT(strings);
  const [reason, setReason] = useState<RefuseReason>('reasonTraffic');
  const [note, setNote] = useState('');
  const needNote = reason === 'reasonOther' && !note.trim();
  return (
    <Modal
      open
      onClose={onClose}
      title={t('refuseTitle', { id: block.id })}
      footer={
        <div className="row" style={{ justifyContent: 'flex-end', width: '100%' }}>
          <button className="btn" onClick={onClose}>{t('cancel')}</button>
          <button className="btn btn-danger" disabled={needNote} title={needNote ? t('refuseNoteRequired') : undefined} onClick={() => onConfirm(`${t(reason)}${note.trim() ? ` — ${note.trim()}` : ''}`)}>
            {t('refuseConfirm')}
          </button>
        </div>
      }
    >
      <div className="stack">
        <div className="small">{t('refuseBody', { section: block.sectionText, window: win(block) })}</div>
        <Field label={t('refuseReason')}>
          <select className="select" value={reason} onChange={(e) => setReason(e.target.value as RefuseReason)}>
            {REFUSE_REASONS.map((r) => <option key={r} value={r}>{t(r)}</option>)}
          </select>
        </Field>
        <Field label={t('refuseNote')} error={needNote ? t('refuseNoteRequired') : undefined}>
          <textarea className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/* ── Clear (line fit for traffic) ───────────────────────────── */
interface ClearResult {
  actualEnd: number;
  tsr: { kmph: number; fromKm: number; toKm: number; reason: string } | null;
}

function ClearModal({ block, corridor, defaultMinute, onClose, onConfirm }: { block: WorkingBlock; corridor: Corridor; defaultMinute: number; onClose: () => void; onConfirm: (r: ClearResult) => void }) {
  const t = useT(strings);
  const [time, setTime] = useState(hhmm(defaultMinute));
  const [mode, setMode] = useState<'FULL' | 'TSR'>('FULL');
  const [speed, setSpeed] = useState('');
  const [fromKm, setFromKm] = useState(block.startKm.toFixed(1));
  const [toKm, setToKm] = useState(block.endKm.toFixed(1));
  const [reason, setReason] = useState('');

  const a = Number(fromKm);
  const b = Number(toKm);
  const v = Number(speed);
  const kmBad = mode === 'TSR' && (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b > corridor.lengthKm || a > b);
  const speedBad = mode === 'TSR' && (!speed.trim() || !Number.isFinite(v) || v <= 0 || v >= corridor.mpsKmph);
  const timeBad = !/^\d{2}:\d{2}$/.test(time);
  const blocked = kmBad || speedBad || timeBad;

  return (
    <Modal
      open
      onClose={onClose}
      title={t('clearTitle', { id: block.id })}
      footer={
        <div className="row" style={{ justifyContent: 'flex-end', width: '100%' }}>
          <button className="btn" onClick={onClose}>{t('cancel')}</button>
          <button
            className="btn btn-ok"
            disabled={blocked}
            onClick={() =>
              onConfirm({
                actualEnd: toMin(time),
                tsr: mode === 'TSR' ? { kmph: v, fromKm: a, toKm: b, reason: reason.trim() || t('clearReasonDefault', { id: block.id }) } : null,
              })
            }
          >
            {t('clearConfirm')}
          </button>
        </div>
      }
    >
      <div className="stack">
        <div className="small">{t('clearBody', { section: block.sectionText, line: lineLabel(block.line) })}</div>
        <div className="form-grid">
          <Field label={t('clearTime')}>
            <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label={t('clearFit')}>
            <Segmented<'FULL' | 'TSR'>
              value={mode}
              onChange={setMode}
              options={[
                { value: 'FULL', label: t('clearFull') },
                { value: 'TSR', label: t('clearTsr') },
              ]}
            />
          </Field>
        </div>
        {mode === 'TSR' && (
          <>
            <div className="grid grid-3" style={{ gap: 10 }}>
              <Field label={t('clearSpeed')} error={speedBad ? t('clearSpeedError', { mps: corridor.mpsKmph }) : undefined}>
                <input className="input" type="number" min={1} max={corridor.mpsKmph - 1} step={5} value={speed} onChange={(e) => setSpeed(e.target.value)} />
              </Field>
              <Field label={t('clearFrom')}>
                <input className="input" type="number" step={0.1} value={fromKm} onChange={(e) => setFromKm(e.target.value)} />
              </Field>
              <Field label={t('clearTo')} error={kmBad ? t('clearKmError', { len: corridor.lengthKm }) : undefined}>
                <input className="input" type="number" step={0.1} value={toKm} onChange={(e) => setToKm(e.target.value)} />
              </Field>
            </div>
            <Field label={t('clearReason')}>
              <input className="input" value={reason} placeholder={t('clearReasonDefault', { id: block.id })} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}
