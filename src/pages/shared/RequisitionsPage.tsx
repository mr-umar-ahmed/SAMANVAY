/**
 * RequisitionsPage — BDMS-style block requisitions (docs/v4-spec.md §3.11).
 *   - dept: raise, edit and resubmit, withdraw, duplicate, print
 *   - cell: validate, accept (the work is injected and the week re-planned),
 *     return with remarks, create on behalf of a department
 * Validation combines the engine's intake normalisation with the JPO rules;
 * accepted requisitions are traced into the working plan (scheduled →
 * granted → executed) from the snapshot, the workflow and the execution log.
 */
import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Copy, Download, Pencil, Plus, RotateCcw, Send, X } from 'lucide-react';
import { usePortalDept } from '../../app/usePortal';
import { can } from '../../auth/portals';
import { MACHINE_TYPES, WORK_TYPES } from '../../engine/constants.js';
import { sectionsInRange } from '../../engine/corridors.js';
import { validateDemand } from '../../engine/intake.js';
import { placement, preferredDayOf, requisitionInjectSpec, requisitionSourceId, workingBlocks, type Placement } from '../../engine/select';
import type { BlockSection, Dept, Line, Snapshot, Task } from '../../engine/types';
import { useT } from '../../i18n';
import { DEPT_LABEL, addDaysIso, dateLabel, dateLong, download, duration, hhmm, kmRange, lineLabel, timeAgo } from '../../lib/format';
import { useAppStore, type BlockType, type Requisition, type RequisitionStatus } from '../../store/useAppStore';
import { Badge, Callout, Card, CardBody, CardHead, DataTable, DeptBadge, EmptyState, Field, KeyValue, Modal, PageHeader, PlanPending, StatTile, Tabs, type Column, type Tone } from '../../components/ui';
import { FormSheet, PrintButton, SimLabel, Timeline } from '../../components/ui/extras';
import { BlockDrawer } from '../../components/domain/BlockDrawer';
import { TaskDrawer } from '../../components/domain/TaskDrawer';
import { useDrawerParams } from '../../components/domain/useDrawerParams';

export interface RequisitionsPageProps {
  mode?: 'cell' | 'dept';
}

type Mode = 'cell' | 'dept';
type ReqState = RequisitionStatus | 'SCHEDULED' | 'GRANTED' | 'EXECUTED';
type TabId = ReqState | 'ALL';
type Window = 'night' | 'day' | 'any';
const STATES: ReqState[] = ['DRAFT', 'SUBMITTED', 'RETURNED', 'ACCEPTED', 'SCHEDULED', 'GRANTED', 'EXECUTED', 'WITHDRAWN'];
const STATE_TONE: Record<ReqState, Tone> = { DRAFT: 'gray', SUBMITTED: 'info', RETURNED: 'crit', ACCEPTED: 'blue', SCHEDULED: 'lavender', GRANTED: 'ok', EXECUTED: 'green', WITHDRAWN: 'outline' };
const BLOCK_TYPES: BlockType[] = ['TRAFFIC', 'POWER', 'DISCONNECTION', 'INTEGRATED'];
const DEPTS: Dept[] = ['TMS', 'SMMS', 'TDMS'];

interface WorkTypeDef {
  dept: Dept;
  label: string;
  blockKind: string;
  durationMin: number;
  machine: string | null;
}
const WT = WORK_TYPES as Record<string, WorkTypeDef>;
const MT = MACHINE_TYPES as Record<string, { label: string; dept: Dept }>;
const expectedBlockType = (wt: string): BlockType => {
  const k = WT[wt]?.blockKind;
  return k === 'POWER' ? 'POWER' : k === 'TRAFFIC_POWER' ? 'INTEGRATED' : k === 'DISCONNECTION' ? 'DISCONNECTION' : 'TRAFFIC';
};
const firstWork = (d: Dept) => Object.keys(WT).find((k) => WT[k].dept === d) ?? Object.keys(WT)[0];

const strings = {
  en: {
    title: 'Block requisitions',
    ledeCell: 'Requisitions from the three departments. Validate, accept into the plan or return with remarks.',
    ledeDept: 'Raise block requisitions in the BDMS fields you already fill; follow them into the plan.',
    bdmsNote: 'Requisition format mirrors BDMS fields; it is not submitted to CRIS.',
    raise: 'Raise requisition',
    onBehalf: 'Create on behalf',
    exportCsv: 'Export CSV',
    exported: '{n} requisitions exported',
    noIntake: 'Raising requisitions needs the intake capability.',
    noPlan: 'Accepting and returning need the plan capability.',
    statSubmitted: 'Awaiting the cell',
    statSubmittedSub: 'Oldest waiting {age}',
    statNoneWaiting: 'Nothing waiting',
    statReturned: 'Returned',
    statReturnedSub: 'Back with the department for changes',
    statAccepted: 'Accepted, not placed',
    statAcceptedSub: 'Not in a block of the working plan',
    statInPlan: 'In the plan',
    statInPlanSub: '{g} granted · {e} executed',
    tabAll: 'All',
    st_DRAFT: 'Draft',
    st_SUBMITTED: 'Submitted',
    st_RETURNED: 'Returned',
    st_ACCEPTED: 'Accepted',
    st_SCHEDULED: 'Scheduled',
    st_GRANTED: 'Granted',
    st_EXECUTED: 'Executed',
    st_WITHDRAWN: 'Withdrawn',
    listTitle: 'Requisitions',
    listSub: '{n} shown · click a row to open it',
    colNo: 'No.',
    colDept: 'Dept',
    colSection: 'Block section',
    colLine: 'Line',
    colWork: 'Work',
    colDuration: 'Duration',
    colPreferred: 'Preferred',
    colMachine: 'Machine',
    colBlockType: 'Block type',
    colState: 'State',
    colIssues: 'Issues',
    bt_TRAFFIC: 'Traffic block',
    bt_POWER: 'Power block',
    bt_DISCONNECTION: 'S&T disconnection',
    bt_INTEGRATED: 'Integrated (traffic + power)',
    win_night: 'Night ({a}–{b})',
    win_day: 'Day gap',
    win_any: 'Any window',
    flexible: 'Flexible',
    noMachine: 'No machine',
    issuesN: '{n} to fix',
    warnN: '{n} to check',
    clean: 'Clean',
    emptyDept: 'No requisitions yet — raise one from the Register or here.',
    emptyCell: 'Inbox empty.',
    selectOne: 'Select a requisition to see its validation, placement and history.',
    formTitleNew: 'Raise a requisition',
    formTitleEdit: 'Edit {no}',
    formSub: 'Checked against the corridor and the JPO rules as you type.',
    fDept: 'Department',
    fWork: 'Work',
    fLine: 'Line',
    fFrom: 'From km',
    fTo: 'To km',
    fDuration: 'Duration of work (min)',
    fDurationHint: 'Usual for this work: {v} min; setup and clearance are added.',
    fDate: 'Preferred date',
    fWindow: 'Preferred window',
    fMachine: 'Machine',
    fBlockType: 'Block type',
    fSpeed: 'Speed after block (km/h)',
    fSpeedHint: 'Empty if the line is fit for full speed.',
    fSpeedDays: 'Days before normal speed',
    fGang: 'Gang',
    fIncharge: 'In-charge',
    fAssets: 'Asset ids (points, track circuits, elementary sections)',
    fRemarks: 'Remarks',
    lineUp: 'UP line',
    lineDn: 'DN line',
    lineBoth: 'Both lines',
    saveDraft: 'Save draft',
    submit: 'Submit',
    cancel: 'Cancel',
    errWork: 'Choose a work of this department.',
    errKm: 'Km must lie within the corridor (0–{len} km), from ≤ to.',
    errDuration: 'Enter the duration of the work in minutes.',
    errCeiling: 'Duration {dur} with setup and clearance ({total}) exceeds the ceiling {max} (rules.maxBlockMin).',
    warnBoundary: '{range} crosses a block section boundary ({labels}).',
    warnBlockType: 'This work needs a {need}.',
    warnDate: 'Preferred date is outside the plan week ({a} – {b}); the optimiser places it by risk.',
    warnSpeed: 'Speed after block is not below the sectional speed of {mps} km/h.',
    validation: 'Validation',
    validationClean: 'Validation clean.',
    mapping: 'Normalised: {sections} · {total} with setup and clearance{ohe}',
    mappingOhe: ' · OHE {ohe}',
    kvWork: 'Work',
    kvLocation: 'Location',
    kvSections: 'Block sections',
    kvDuration: 'Duration',
    kvPreferred: 'Preferred',
    kvMachine: 'Machine',
    kvBlockType: 'Block type',
    kvSpeed: 'Speed after block',
    kvSpeedVal: '{v} km/h for {d} days',
    kvSpeedValNoDays: '{v} km/h',
    kvFull: 'Full speed',
    kvGang: 'Gang',
    kvIncharge: 'In-charge',
    kvAssets: 'Asset ids',
    kvRaised: 'Raised by',
    remarks: 'Department remarks',
    cellRemarks: 'Cell remarks',
    placementTitle: 'Placement in the working plan',
    placed: 'Placed {date} {window} in {block}',
    partners: 'With {works}',
    alone: 'Single-department block',
    resources: 'Machine {m} · gang {c}',
    deferred: 'Not placed this week: {reason}',
    notInPlan: 'Not in the current plan yet. The work enters the plan on the next run.',
    openTask: 'Task {id}',
    openBlock: 'Block {id}',
    nearbyTitle: 'Nearby works on the same block section',
    nearbyNone: 'No other work on this block section and line.',
    history: 'History',
    edit: 'Edit',
    withdraw: 'Withdraw',
    duplicate: 'Duplicate',
    accept: 'Accept',
    returnBtn: 'Return with remarks',
    fixFirst: 'Fix the validation errors first.',
    print: 'Print requisition',
    returnTitle: 'Return {no}',
    returnBody: 'Tell the department exactly what to change; the remarks go back with the requisition.',
    returnRemarks: 'Remarks to the department',
    returnRequired: 'Remarks are required.',
    toastSaved: 'Draft {no} saved',
    toastSubmitted: 'Requisition {no} submitted',
    toastAccepted: 'Accepted — task {id} is in the next plan',
    toastReturned: 'Requisition {no} returned',
    toastWithdrawn: 'Requisition {no} withdrawn',
    toastWithdrawnReplan: 'Its work leaves the plan; the week is being recomputed',
    toastDuplicated: 'Draft {no} created from {from}',
    replanAccepted: 'requisition {no} accepted',
    replanWithdrawn: 'requisition {no} withdrawn',
    sheetTitle: 'Block requisition',
    sheetSignDept: 'Requesting officer',
    sheetSignCell: 'Block planning cell',
    h_CREATED: 'Created',
    h_EDITED: 'Edited',
    h_DRAFT: 'Draft saved',
    h_SUBMITTED: 'Submitted to the cell',
    h_RETURNED: 'Returned with remarks',
    h_ACCEPTED: 'Accepted into the plan',
    h_WITHDRAWN: 'Withdrawn',
    fNeedsPower: 'Needs power block (OHE isolated)',
    fNeedsDisc: 'Needs S&T disconnection (T/351)',
    fDependsOn: 'Must follow requisition(s)',
    fDependsOnHint: 'This work starts only after these finish (a hard rule for the planner). Your department’s other requisitions on this corridor.',
    fCoRequire: 'Must share a block with requisition(s)',
    fCoRequireHint: 'Placed in the same possession as these (a hard rule). Any department on this corridor; they must be on the same block section and line.',
    noOthers: 'No other requisition to pick.',
    errBothDep: '{no} cannot be both a predecessor and a joint-block partner.',
    errCycle: 'Circular sequence: {no} already has to follow this requisition.',
    errCoSection: '{no} is on {sections}, {line}; a joint block needs the same block section and a common line.',
    warnDepState: '{no} is {state}: the planner uses it only once it is accepted.',
    warnDepDate: '{no} prefers {date}, after this requisition’s preferred date.',
    warnRedundantPower: 'The block type already includes a power block.',
    kvNeedsPower: 'Power block (OHE)',
    kvNeedsDisc: 'S&T disconnection',
    kvDependsOn: 'Must follow',
    kvCoRequire: 'Shares a block with',
    kvReplaces: 'Replaces register work',
    yes: 'Yes',
    no: 'No',
    none: 'None',
    plannerTitle: 'What the planner will do',
    plannerSub: 'The inputs the optimiser receives when this requisition is accepted',
    pDuration: 'Duration {dur} used as given (not recalibrated); possession about {total} with setup and clearance.',
    pDurationCal: 'No duration given: the calibrated standard for the work type is used.',
    pDay: 'Preferred day {date} (plan day {d}); each day away adds {w} to the plan cost.',
    pDayOutside: 'Preferred date {date} is outside this plan week ({a} – {b}); the work is placed by risk.',
    pDayNone: 'No preferred day: placed by risk and traffic.',
    pWindowNight: 'Prefers the night window {a}–{b}; a start outside it costs three times the preference weight.',
    pWindowDay: 'Prefers a day gap; a night start costs three times the preference weight.',
    pWindowAny: 'Any window.',
    pMachine: 'Machine: {m}.',
    pNoMachine: 'No machine: manual work.',
    pKind: 'Block kind: {kind}{extra}.',
    pKindPower: ' with an OHE power block',
    pKindDisc: ' with an S&T disconnection (T/351)',
    pDepends: 'Sequence: starts only after {list} finish.',
    pCo: 'Joint block: placed in the same possession as {list}.',
    pReplaces: 'Replaces register work {id}{label}: that work leaves the run and this requisition is planned instead.',
    pReplacesGone: 'Register work {id} is not in the current run, so nothing is replaced.',
    pNew: 'New work: no register work is replaced.',
    landedTitle: 'Where the work landed',
    landedDeps: '{no}: {where}',
    landedDepPlaced: 'placed {date} {window}',
    landedDepNot: 'not placed this week',
    landedDepMissing: 'not in this run yet',
  },
  hi: {
    title: 'Block माँग-पत्र',
    ledeCell: 'तीनों विभागों के माँग-पत्र। सत्यापित करें, योजना में स्वीकार करें या टिप्पणी सहित लौटाएँ।',
    ledeDept: 'BDMS के परिचित फ़ील्ड में block माँग-पत्र दर्ज करें; योजना में उनकी स्थिति देखें।',
    bdmsNote: 'माँग-पत्र का प्रारूप BDMS फ़ील्ड जैसा है; यह CRIS को नहीं भेजा जाता।',
    raise: 'माँग-पत्र दर्ज करें',
    onBehalf: 'विभाग की ओर से बनाएँ',
    exportCsv: 'CSV निर्यात',
    exported: '{n} माँग-पत्र निर्यात किए गए',
    noIntake: 'माँग-पत्र के लिए intake अधिकार चाहिए।',
    noPlan: 'स्वीकार करने और लौटाने के लिए plan अधिकार चाहिए।',
    statSubmitted: 'प्रकोष्ठ की प्रतीक्षा में',
    statSubmittedSub: 'सबसे पुराना {age} से प्रतीक्षा में',
    statNoneWaiting: 'कोई प्रतीक्षा में नहीं',
    statReturned: 'लौटाए गए',
    statReturnedSub: 'बदलाव के लिए विभाग के पास',
    statAccepted: 'स्वीकृत, अनियोजित',
    statAcceptedSub: 'कार्यकारी योजना के किसी block में नहीं',
    statInPlan: 'योजना में',
    statInPlanSub: '{g} प्रदत्त · {e} निष्पादित',
    tabAll: 'सभी',
    st_DRAFT: 'प्रारूप',
    st_SUBMITTED: 'प्रस्तुत',
    st_RETURNED: 'लौटाया',
    st_ACCEPTED: 'स्वीकृत',
    st_SCHEDULED: 'नियोजित',
    st_GRANTED: 'प्रदत्त',
    st_EXECUTED: 'निष्पादित',
    st_WITHDRAWN: 'वापस लिया',
    listTitle: 'माँग-पत्र',
    listSub: '{n} दिखाए गए · खोलने के लिए पंक्ति पर क्लिक करें',
    colNo: 'सं.',
    colDept: 'विभाग',
    colSection: 'Block सेक्शन',
    colLine: 'लाइन',
    colWork: 'कार्य',
    colDuration: 'अवधि',
    colPreferred: 'पसंदीदा',
    colMachine: 'मशीन',
    colBlockType: 'Block प्रकार',
    colState: 'स्थिति',
    colIssues: 'समस्याएँ',
    bt_TRAFFIC: 'यातायात block',
    bt_POWER: 'पावर block',
    bt_DISCONNECTION: 'S&T डिस्कनेक्शन',
    bt_INTEGRATED: 'एकीकृत (यातायात + पावर)',
    win_night: 'रात ({a}–{b})',
    win_day: 'दिन का अंतराल',
    win_any: 'कोई भी विंडो',
    flexible: 'लचीला',
    noMachine: 'मशीन नहीं',
    issuesN: '{n} सुधारें',
    warnN: '{n} जाँचें',
    clean: 'ठीक',
    emptyDept: 'अभी कोई माँग-पत्र नहीं — रजिस्टर से या यहाँ से दर्ज करें।',
    emptyCell: 'इनबॉक्स खाली है।',
    selectOne: 'सत्यापन, नियोजन और इतिहास देखने के लिए माँग-पत्र चुनें।',
    formTitleNew: 'माँग-पत्र दर्ज करें',
    formTitleEdit: '{no} संपादित करें',
    formSub: 'लिखते समय कॉरिडोर और JPO नियमों पर जाँचा जाता है।',
    fDept: 'विभाग',
    fWork: 'कार्य',
    fLine: 'लाइन',
    fFrom: 'किमी से',
    fTo: 'किमी तक',
    fDuration: 'कार्य की अवधि (मिनट)',
    fDurationHint: 'इस कार्य के लिए सामान्य: {v} मिनट; सेटअप और क्लीयरेंस जोड़े जाते हैं।',
    fDate: 'पसंदीदा तिथि',
    fWindow: 'पसंदीदा विंडो',
    fMachine: 'मशीन',
    fBlockType: 'Block प्रकार',
    fSpeed: 'Block के बाद गति (किमी/घं)',
    fSpeedHint: 'यदि लाइन पूर्ण गति हेतु उपयुक्त हो तो खाली छोड़ें।',
    fSpeedDays: 'सामान्य गति से पहले दिन',
    fGang: 'गैंग',
    fIncharge: 'प्रभारी',
    fAssets: 'संपत्ति आईडी (पॉइंट, ट्रैक सर्किट, एलीमेंट्री सेक्शन)',
    fRemarks: 'टिप्पणी',
    lineUp: 'UP लाइन',
    lineDn: 'DN लाइन',
    lineBoth: 'दोनों लाइनें',
    saveDraft: 'प्रारूप सहेजें',
    submit: 'प्रस्तुत करें',
    cancel: 'रद्द करें',
    errWork: 'इस विभाग का कार्य चुनें।',
    errKm: 'किमी कॉरिडोर के भीतर (0–{len} किमी) और से ≤ तक होना चाहिए।',
    errDuration: 'कार्य की अवधि मिनट में दर्ज करें।',
    errCeiling: 'अवधि {dur}, सेटअप और क्लीयरेंस सहित ({total}), सीमा {max} (rules.maxBlockMin) से अधिक है।',
    warnBoundary: '{range} block सेक्शन की सीमा पार करता है ({labels})।',
    warnBlockType: 'इस कार्य के लिए {need} चाहिए।',
    warnDate: 'पसंदीदा तिथि योजना सप्ताह ({a} – {b}) से बाहर है; ऑप्टिमाइज़र जोखिम के अनुसार स्थान देता है।',
    warnSpeed: 'Block के बाद की गति खंडीय गति {mps} किमी/घं से कम नहीं है।',
    validation: 'सत्यापन',
    validationClean: 'सत्यापन ठीक है।',
    mapping: 'मानकीकृत: {sections} · सेटअप और क्लीयरेंस सहित {total}{ohe}',
    mappingOhe: ' · OHE {ohe}',
    kvWork: 'कार्य',
    kvLocation: 'स्थान',
    kvSections: 'Block सेक्शन',
    kvDuration: 'अवधि',
    kvPreferred: 'पसंदीदा',
    kvMachine: 'मशीन',
    kvBlockType: 'Block प्रकार',
    kvSpeed: 'Block के बाद गति',
    kvSpeedVal: '{d} दिन तक {v} किमी/घं',
    kvSpeedValNoDays: '{v} किमी/घं',
    kvFull: 'पूर्ण गति',
    kvGang: 'गैंग',
    kvIncharge: 'प्रभारी',
    kvAssets: 'संपत्ति आईडी',
    kvRaised: 'दर्ज कर्ता',
    remarks: 'विभाग की टिप्पणी',
    cellRemarks: 'प्रकोष्ठ की टिप्पणी',
    placementTitle: 'कार्यकारी योजना में स्थान',
    placed: '{date} {window} को {block} में',
    partners: 'साथ में {works}',
    alone: 'एकल-विभाग block',
    resources: 'मशीन {m} · गैंग {c}',
    deferred: 'इस सप्ताह नियोजित नहीं: {reason}',
    notInPlan: 'अभी वर्तमान योजना में नहीं। कार्य अगले रन में योजना में आएगा।',
    openTask: 'कार्य {id}',
    openBlock: 'Block {id}',
    nearbyTitle: 'उसी block सेक्शन के निकट कार्य',
    nearbyNone: 'इस block सेक्शन और लाइन पर कोई अन्य कार्य नहीं।',
    history: 'इतिहास',
    edit: 'संपादित करें',
    withdraw: 'वापस लें',
    duplicate: 'प्रतिलिपि',
    accept: 'स्वीकार करें',
    returnBtn: 'टिप्पणी सहित लौटाएँ',
    fixFirst: 'पहले सत्यापन त्रुटियाँ ठीक करें।',
    print: 'माँग-पत्र प्रिंट करें',
    returnTitle: '{no} लौटाएँ',
    returnBody: 'विभाग को ठीक-ठीक बताएँ कि क्या बदलना है; टिप्पणी माँग-पत्र के साथ लौटती है।',
    returnRemarks: 'विभाग के लिए टिप्पणी',
    returnRequired: 'टिप्पणी आवश्यक है।',
    toastSaved: 'प्रारूप {no} सहेजा गया',
    toastSubmitted: 'माँग-पत्र {no} प्रस्तुत',
    toastAccepted: 'स्वीकृत — कार्य {id} अगली योजना में है',
    toastReturned: 'माँग-पत्र {no} लौटाया गया',
    toastWithdrawn: 'माँग-पत्र {no} वापस लिया गया',
    toastWithdrawnReplan: 'इसका कार्य योजना से हटता है; सप्ताह फिर से गणना हो रहा है',
    toastDuplicated: '{from} से प्रारूप {no} बना',
    replanAccepted: 'माँग-पत्र {no} स्वीकृत',
    replanWithdrawn: 'माँग-पत्र {no} वापस',
    sheetTitle: 'Block माँग-पत्र',
    sheetSignDept: 'माँगकर्ता अधिकारी',
    sheetSignCell: 'Block योजना प्रकोष्ठ',
    h_CREATED: 'बनाया गया',
    h_EDITED: 'संपादित',
    h_DRAFT: 'प्रारूप सहेजा',
    h_SUBMITTED: 'प्रकोष्ठ को प्रस्तुत',
    h_RETURNED: 'टिप्पणी सहित लौटाया',
    h_ACCEPTED: 'योजना में स्वीकृत',
    h_WITHDRAWN: 'वापस लिया',
    fNeedsPower: 'पावर block चाहिए (OHE आइसोलेट)',
    fNeedsDisc: 'S&T डिस्कनेक्शन चाहिए (T/351)',
    fDependsOn: 'इन माँग-पत्रों के बाद ही',
    fDependsOnHint: 'यह कार्य इनके पूरा होने के बाद ही शुरू होगा (प्लानर का कठोर नियम)। इस कॉरिडोर पर आपके विभाग के अन्य माँग-पत्र।',
    fCoRequire: 'इन माँग-पत्रों के साथ एक ही block में',
    fCoRequireHint: 'इनके साथ एक ही पज़ेशन में रखा जाएगा (कठोर नियम)। इस कॉरिडोर का कोई भी विभाग; block सेक्शन और लाइन समान होनी चाहिए।',
    noOthers: 'चुनने के लिए कोई अन्य माँग-पत्र नहीं।',
    errBothDep: '{no} पूर्ववर्ती और संयुक्त-block साझेदार दोनों नहीं हो सकता।',
    errCycle: 'चक्रीय क्रम: {no} को पहले से इस माँग-पत्र के बाद होना है।',
    errCoSection: '{no} {sections}, {line} पर है; संयुक्त block के लिए समान block सेक्शन और साझा लाइन चाहिए।',
    warnDepState: '{no} {state} है: प्लानर इसे स्वीकृत होने पर ही उपयोग करता है।',
    warnDepDate: '{no} की पसंदीदा तिथि {date} है, जो इस माँग-पत्र की पसंदीदा तिथि के बाद है।',
    warnRedundantPower: 'Block प्रकार में पावर block पहले से शामिल है।',
    kvNeedsPower: 'पावर block (OHE)',
    kvNeedsDisc: 'S&T डिस्कनेक्शन',
    kvDependsOn: 'इनके बाद',
    kvCoRequire: 'इनके साथ block में',
    kvReplaces: 'रजिस्टर कार्य की जगह',
    yes: 'हाँ',
    no: 'नहीं',
    none: 'कोई नहीं',
    plannerTitle: 'प्लानर क्या करेगा',
    plannerSub: 'स्वीकार होने पर ऑप्टिमाइज़र को मिलने वाले इनपुट',
    pDuration: 'अवधि {dur} जैसी दी गई वैसी (पुनः कैलिब्रेट नहीं); सेटअप और क्लीयरेंस सहित पज़ेशन लगभग {total}।',
    pDurationCal: 'अवधि नहीं दी: कार्य प्रकार का कैलिब्रेटेड मानक उपयोग होगा।',
    pDay: 'पसंदीदा दिन {date} (योजना दिन {d}); हर दिन की दूरी योजना लागत में {w} जोड़ती है।',
    pDayOutside: 'पसंदीदा तिथि {date} इस योजना सप्ताह ({a} – {b}) से बाहर है; कार्य जोखिम के अनुसार रखा जाएगा।',
    pDayNone: 'कोई पसंदीदा दिन नहीं: जोखिम और यातायात के अनुसार।',
    pWindowNight: 'रात की विंडो {a}–{b} पसंद; इसके बाहर शुरुआत पर वरीयता भार का तीन गुना।',
    pWindowDay: 'दिन का अंतराल पसंद; रात में शुरुआत पर वरीयता भार का तीन गुना।',
    pWindowAny: 'कोई भी विंडो।',
    pMachine: 'मशीन: {m}।',
    pNoMachine: 'मशीन नहीं: हाथ से कार्य।',
    pKind: 'Block प्रकार: {kind}{extra}।',
    pKindPower: ' OHE पावर block सहित',
    pKindDisc: ' S&T डिस्कनेक्शन (T/351) सहित',
    pDepends: 'क्रम: {list} पूरे होने के बाद ही शुरू।',
    pCo: 'संयुक्त block: {list} के साथ एक ही पज़ेशन में।',
    pReplaces: 'रजिस्टर कार्य {id}{label} की जगह: वह कार्य रन से हटेगा और यह माँग-पत्र नियोजित होगा।',
    pReplacesGone: 'रजिस्टर कार्य {id} वर्तमान रन में नहीं है, इसलिए कुछ नहीं बदलेगा।',
    pNew: 'नया कार्य: कोई रजिस्टर कार्य नहीं बदलता।',
    landedTitle: 'कार्य कहाँ नियोजित हुआ',
    landedDeps: '{no}: {where}',
    landedDepPlaced: '{date} {window} को नियोजित',
    landedDepNot: 'इस सप्ताह नियोजित नहीं',
    landedDepMissing: 'अभी इस रन में नहीं',
  },
} as const;

type Key = keyof typeof strings.en;
type TFn = (key: Key, vars?: Record<string, string | number>) => string;

const sheetTable: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 11, margin: '10px 0' };
const sheetCell: CSSProperties = { border: '1px solid currentColor', padding: '5px 7px', textAlign: 'left', verticalAlign: 'top' };
const signGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 24, marginTop: 28, fontSize: 11 };
const signLine: CSSProperties = { borderTop: '1px solid currentColor', paddingTop: 4 };
const wellBtn: CSSProperties = { textAlign: 'left', padding: '8px 10px', width: '100%' };

/* ── Validation (engine normalisation + JPO rules) ─────────── */
interface ReqFields {
  dept: Dept;
  workType: string;
  line: Line;
  startKm: number;
  endKm: number;
  durationMin: number;
  blockType: BlockType;
  preferredDate?: string;
  speedAfterKmph?: number | null;
  id?: string;
  needsPowerBlock?: boolean;
  needsDisconnection?: boolean;
  dependsOnReqIds?: string[];
  coRequireReqIds?: string[];
}
interface CheckResult {
  errors: string[];
  warnings: string[];
  sections: BlockSection[];
  totalMin: number | null;
  ohe: string;
}

function checkRequisition(f: ReqFields, snapshot: Snapshot, t: TFn, all: Requisition[] = []): CheckResult {
  const corridor = snapshot.corridor;
  const rules = snapshot.result.rules;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!WT[f.workType] || WT[f.workType].dept !== f.dept) errors.push(t('errWork'));
  const kmOk = Number.isFinite(f.startKm) && Number.isFinite(f.endKm) && f.startKm >= 0 && f.endKm <= corridor.lengthKm && f.startKm <= f.endKm;
  if (!kmOk) errors.push(t('errKm', { len: corridor.lengthKm }));
  if (!Number.isFinite(f.durationMin) || f.durationMin <= 0) errors.push(t('errDuration'));
  let sections: BlockSection[] = [];
  let totalMin: number | null = null;
  let ohe = '';
  if (!errors.length) {
    const res = validateDemand({ workType: f.workType, line: f.line, startKm: f.startKm, endKm: f.endKm, durationMin: f.durationMin }, corridor, snapshot.factors) as { valid: boolean; task: { totalMin: number; oheSections: number[] } | null };
    sections = sectionsInRange(corridor, f.startKm, f.endKm) as BlockSection[];
    if (res.task) {
      totalMin = res.task.totalMin;
      ohe = res.task.oheSections.map((i) => corridor.oheSections[i]?.label ?? String(i)).join(', ');
      if (totalMin > rules.maxBlockMin) errors.push(t('errCeiling', { dur: hhmm(f.durationMin), total: hhmm(totalMin), max: hhmm(rules.maxBlockMin) }));
    }
    if (sections.length > 1) warnings.push(t('warnBoundary', { range: kmRange(f.startKm, f.endKm), labels: sections.map((s) => s.label).join(' / ') }));
    const need = expectedBlockType(f.workType);
    if (need !== f.blockType) warnings.push(t('warnBlockType', { need: t(`bt_${need}` as Key) }));
  }
  const weekEnd = addDaysIso(snapshot.planStart, snapshot.result.weekly.occupancy.length - 1);
  if (f.preferredDate && (f.preferredDate < snapshot.planStart || f.preferredDate > weekEnd)) warnings.push(t('warnDate', { a: dateLabel(snapshot.planStart), b: dateLabel(weekEnd) }));
  if (f.speedAfterKmph && f.speedAfterKmph >= corridor.mpsKmph) warnings.push(t('warnSpeed', { mps: corridor.mpsKmph }));
  if (f.needsPowerBlock && (f.blockType === 'POWER' || f.blockType === 'INTEGRATED')) warnings.push(t('warnRedundantPower'));
  // sequence and joint-block links to other requisitions
  const byId = new Map(all.map((x) => [x.id, x]));
  const deps = (f.dependsOnReqIds ?? []).filter((id) => byId.has(id));
  const cos = (f.coRequireReqIds ?? []).filter((id) => byId.has(id));
  const noOf = (id: string) => byId.get(id)?.no ?? id;
  for (const id of deps) if (cos.includes(id)) errors.push(t('errBothDep', { no: noOf(id) }));
  if (f.id) {
    for (const d of deps) {
      const seen = new Set<string>();
      const stack = [d];
      let loop = false;
      while (stack.length && !loop) {
        const x = stack.pop()!;
        if (seen.has(x)) continue;
        seen.add(x);
        for (const y of byId.get(x)?.dependsOnReqIds ?? []) {
          if (y === f.id) loop = true;
          else stack.push(y);
        }
      }
      if (loop) errors.push(t('errCycle', { no: noOf(d) }));
    }
  }
  const mySecs = new Set(sections.map((s) => s.index));
  for (const id of cos) {
    const o = byId.get(id)!;
    const oSecs = sectionsInRange(corridor, o.startKm, o.endKm) as BlockSection[];
    const lineOk = o.line === f.line || o.line === 'BOTH' || f.line === 'BOTH';
    if (mySecs.size && (!lineOk || !oSecs.some((s) => mySecs.has(s.index)))) errors.push(t('errCoSection', { no: o.no, sections: oSecs.map((s) => s.label).join(' / ') || kmRange(o.startKm, o.endKm), line: lineLabel(o.line) }));
  }
  for (const id of [...deps, ...cos]) {
    const o = byId.get(id)!;
    if (o.status !== 'ACCEPTED' && o.status !== 'SUBMITTED') warnings.push(t('warnDepState', { no: o.no, state: t(`st_${o.status}` as Key) }));
  }
  for (const id of deps) {
    const o = byId.get(id)!;
    if (o.preferredDate && f.preferredDate && o.preferredDate > f.preferredDate) warnings.push(t('warnDepDate', { no: o.no, date: dateLabel(o.preferredDate) }));
  }
  return { errors, warnings, sections, totalMin, ohe };
}

const fieldsOf = (r: Requisition): ReqFields => ({ id: r.id, dept: r.dept, workType: r.workType, line: r.line, startKm: r.startKm, endKm: r.endKm, durationMin: r.durationMin, blockType: r.blockType, preferredDate: r.preferredDate, speedAfterKmph: r.speedAfterKmph, needsPowerBlock: r.needsPowerBlock, needsDisconnection: r.needsDisconnection, dependsOnReqIds: r.dependsOnReqIds, coRequireReqIds: r.coRequireReqIds });

interface Trace {
  state: ReqState;
  task: Task | null;
  placement: Placement | null;
}

export default function RequisitionsPage({ mode }: RequisitionsPageProps) {
  const snapshot = useAppStore((s) => s.snapshot);
  const dept = usePortalDept();
  if (!snapshot) return <PlanPending />;
  const m: Mode = mode ?? (dept ? 'dept' : 'cell');
  return <Requisitions snapshot={snapshot} mode={m} dept={m === 'dept' ? dept : null} />;
}

function Requisitions({ snapshot, mode, dept }: { snapshot: Snapshot; mode: Mode; dept: Dept | null }) {
  const t = useT(strings);
  const drawer = useDrawerParams();
  const { id: routeId } = useParams<{ id?: string }>();

  const user = useAppStore((s) => s.user);
  const requisitions = useAppStore((s) => s.requisitions);
  const approvals = useAppStore((s) => s.approvals);
  const executionLog = useAppStore((s) => s.executionLog);
  const saveRequisition = useAppStore((s) => s.saveRequisition);
  const submitRequisition = useAppStore((s) => s.submitRequisition);
  const acceptRequisition = useAppStore((s) => s.acceptRequisition);
  const returnRequisition = useAppStore((s) => s.returnRequisition);
  const withdrawRequisition = useAppStore((s) => s.withdrawRequisition);
  const runPlan = useAppStore((s) => s.runPlan);
  const toast = useAppStore((s) => s.toast);

  const corridor = snapshot.corridor;
  const canIntake = can(user, 'intake');
  const canPlan = can(user, 'plan');
  const canRaise = mode === 'dept' ? canIntake : canPlan || canIntake;

  const [tab, setTab] = useState<TabId | null>(null);
  const [deptFilter, setDeptFilter] = useState<Dept | 'ALL'>('ALL');
  const [compose, setCompose] = useState<{ editId: string | null } | null>(null);
  const [returning, setReturning] = useState<Requisition | null>(null);

  /* ── derived: scope, checks, trace into the plan ─────────── */
  const blocks = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals]);
  const scoped = useMemo(() => requisitions.filter((r) => r.corridorId === corridor.id && (mode !== 'dept' || r.dept === dept)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [requisitions, corridor.id, mode, dept]);
  const corridorReqs = useMemo(() => requisitions.filter((r) => r.corridorId === corridor.id), [requisitions, corridor.id]);
  const checks = useMemo(() => new Map(scoped.map((r) => [r.id, checkRequisition(fieldsOf(r), snapshot, t, corridorReqs)])), [scoped, snapshot, t, corridorReqs]);
  const traces = useMemo(() => {
    const bySource = new Map(snapshot.tasks.map((x) => [x.sourceId, x]));
    const m = new Map<string, Trace>();
    for (const r of scoped) {
      if (r.status !== 'ACCEPTED') {
        m.set(r.id, { state: r.status, task: null, placement: null });
        continue;
      }
      // the injected work carries the requisition's source id (select.requisitionSourceId → "REQ/<id>")
      const task = bySource.get(requisitionSourceId(r.id)) ?? bySource.get(`BDMS/${r.no}`) ?? null;
      const pl = task ? placement(snapshot, blocks, task.id) : null;
      const b = pl?.block ?? null;
      const ex = b ? executionLog.find((e) => e.blockId === b.id && e.corridorId === corridor.id) : undefined;
      const state: ReqState = !b ? 'ACCEPTED' : ex && ex.status !== 'IN_PROGRESS' ? 'EXECUTED' : b.status === 'GRANTED' || b.status === 'LOCKED' ? 'GRANTED' : 'SCHEDULED';
      m.set(r.id, { state, task, placement: pl });
    }
    return m;
  }, [scoped, snapshot, blocks, executionLog, corridor.id]);
  const stateOf = useCallback((r: Requisition): ReqState => traces.get(r.id)?.state ?? r.status, [traces]);

  const counts = useMemo(() => {
    const c = Object.fromEntries([...STATES, 'ALL'].map((s) => [s, 0])) as Record<TabId, number>;
    for (const r of scoped) {
      c[stateOf(r)]++;
      c.ALL++;
    }
    return c;
  }, [scoped, stateOf]);
  const activeTab: TabId = tab ?? (mode === 'cell' && counts.SUBMITTED > 0 ? 'SUBMITTED' : 'ALL');
  const rows = scoped.filter((r) => (activeTab === 'ALL' || stateOf(r) === activeTab) && (mode === 'dept' || deptFilter === 'ALL' || r.dept === deptFilter));

  const selectedId = drawer.reqId ?? routeId ?? null;
  const selected = selectedId ? scoped.find((r) => r.id === selectedId) ?? null : null;
  const editing = compose?.editId ? scoped.find((r) => r.id === compose.editId) ?? null : null;
  const showForm = !!compose || (mode === 'dept' && !selected);
  const oldestSubmitted = scoped.filter((r) => r.status === 'SUBMITTED').sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];

  /* ── actions ───────────────────────────────────────────── */
  const openReq = useCallback(
    (id: string) => {
      setCompose(null);
      drawer.open('req', id);
    },
    [drawer]
  );
  const handleSubmitRequisition = useCallback(
    (r: Requisition) => {
      submitRequisition(r.id);
      toast({ title: t('toastSubmitted', { no: r.no }), tone: 'ok' });
    },
    [submitRequisition, toast, t]
  );
  const handleAccept = useCallback(
    (r: Requisition) => {
      const task = acceptRequisition(r.id);
      if (!task) return;
      toast({ title: t('toastAccepted', { id: task.id }), body: r.no, tone: 'ok' });
      void runPlan({ reason: t('replanAccepted', { no: r.no }) });
    },
    [acceptRequisition, runPlan, toast, t]
  );
  const handleWithdrawRequisition = useCallback(
    (r: Requisition) => {
      const wasAccepted = r.status === 'ACCEPTED';
      withdrawRequisition(r.id);
      toast({ title: t('toastWithdrawn', { no: r.no }), body: wasAccepted ? t('toastWithdrawnReplan') : undefined, tone: 'info' });
      if (wasAccepted) void runPlan({ reason: t('replanWithdrawn', { no: r.no }) });
    },
    [withdrawRequisition, runPlan, toast, t]
  );
  const handleDuplicate = useCallback(
    (r: Requisition) => {
      // the copy keeps the requirements and links but not the replaced register work (one requisition replaces it)
      const copy = saveRequisition({ corridorId: r.corridorId, dept: r.dept, workType: r.workType, line: r.line, startKm: r.startKm, endKm: r.endKm, durationMin: r.durationMin, preferredDate: r.preferredDate, preferredWindow: r.preferredWindow, machine: r.machine, crew: r.crew, blockType: r.blockType, speedAfterKmph: r.speedAfterKmph, speedAfterDays: r.speedAfterDays, gang: r.gang, incharge: r.incharge, assetIds: r.assetIds, remarks: r.remarks, needsPowerBlock: r.needsPowerBlock, needsDisconnection: r.needsDisconnection, dependsOnReqIds: r.dependsOnReqIds, coRequireReqIds: r.coRequireReqIds, status: 'DRAFT', validation: r.validation });
      toast({ title: t('toastDuplicated', { no: copy.no, from: r.no }), tone: 'ok' });
      openReq(copy.id);
    },
    [saveRequisition, toast, t, openReq]
  );
  const exportCsv = () => {
    const head = ['No', 'Dept', 'WorkType', 'Line', 'StartKm', 'EndKm', 'DurationMin', 'PreferredDate', 'PreferredWindow', 'Machine', 'BlockType', 'State', 'Issues'];
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const body = rows.map((r) => [r.no, r.dept, r.workType, r.line, r.startKm, r.endKm, r.durationMin, r.preferredDate, r.preferredWindow, r.machine, r.blockType, stateOf(r), (checks.get(r.id)?.errors ?? []).join('; ')].map(q).join(','));
    download(`bdms-requisitions-${corridor.code.replace(/[^A-Za-z0-9-]/g, '')}.csv`, [head.join(','), ...body].join('\n'), 'text/csv');
    toast({ title: t('exported', { n: rows.length }), tone: 'ok' });
  };

  /* ── columns ───────────────────────────────────────────── */
  const cols = useMemo<Column<Requisition>[]>(
    () => [
      {
        key: 'no',
        header: t('colNo'),
        render: (r) => (
          <div className="stack" style={{ gap: 2 }}>
            <span className="mono small strong">{r.no}</span>
            <span className="tiny muted">{timeAgo(r.updatedAt)}</span>
            {r.seeded && <SimLabel kind="seededRecords" short />}
          </div>
        ),
      },
      { key: 'dept', header: t('colDept'), render: (r) => <DeptBadge dept={r.dept} /> },
      { key: 'section', header: t('colSection'), hideMobile: true, render: (r) => <span className="small">{(checks.get(r.id)?.sections ?? []).map((s) => s.label).join(' / ') || kmRange(r.startKm, r.endKm)}</span> },
      { key: 'line', header: t('colLine'), render: (r) => <span className="small">{r.line} · {kmRange(r.startKm, r.endKm)}</span> },
      { key: 'work', header: t('colWork'), render: (r) => <span className="small">{WT[r.workType]?.label ?? r.workType}</span> },
      { key: 'duration', header: t('colDuration'), num: true, render: (r) => <span className="num small">{duration(r.durationMin)}</span> },
      { key: 'preferred', header: t('colPreferred'), hideMobile: true, render: (r) => <span className="small">{r.preferredDate ? dateLabel(r.preferredDate) : t('flexible')}{r.preferredWindow ? ` · ${t(`win_${r.preferredWindow}` as Key, { a: hhmm(snapshot.result.rules.nightWindow[0]), b: hhmm(snapshot.result.rules.nightWindow[1]) })}` : ''}</span> },
      { key: 'machine', header: t('colMachine'), hideMobile: true, render: (r) => <span className="small">{r.machine ? MT[r.machine]?.label ?? r.machine : t('noMachine')}</span> },
      { key: 'blockType', header: t('colBlockType'), hideMobile: true, render: (r) => <span className="small">{t(`bt_${r.blockType}` as Key)}</span> },
      { key: 'state', header: t('colState'), render: (r) => <Badge tone={STATE_TONE[stateOf(r)]}>{t(`st_${stateOf(r)}` as Key)}</Badge> },
      {
        key: 'issues',
        header: t('colIssues'),
        render: (r) => {
          const c = checks.get(r.id);
          if (!c) return null;
          if (c.errors.length) return <Badge tone="crit">{t('issuesN', { n: c.errors.length })}</Badge>;
          if (c.warnings.length) return <Badge tone="warn">{t('warnN', { n: c.warnings.length })}</Badge>;
          return <span className="small muted">{t('clean')}</span>;
        },
      },
    ],
    [t, checks, stateOf, snapshot]
  );

  const tabs: { id: TabId; label: string; count: number }[] = [{ id: 'ALL', label: t('tabAll'), count: counts.ALL }, ...STATES.map((s) => ({ id: s as TabId, label: t(`st_${s}` as Key), count: counts[s] }))];

  return (
    <div className="stack-lg">
      <PageHeader
        title={t('title')}
        lede={mode === 'cell' ? t('ledeCell') : t('ledeDept')}
        badges={
          <>
            {dept && <DeptBadge dept={dept} long />}
            <span className="tiny muted">{t('bdmsNote')}</span>
          </>
        }
        actions={
          <>
            <button className="btn btn-primary btn-sm" disabled={!canRaise} title={canRaise ? undefined : mode === 'dept' ? t('noIntake') : t('noPlan')} onClick={() => { setCompose({ editId: null }); drawer.close('req'); }}>
              <Plus size={14} /> {mode === 'cell' ? t('onBehalf') : t('raise')}
            </button>
            <button className="btn btn-sm" disabled={rows.length === 0} onClick={exportCsv}>
              <Download size={14} /> {t('exportCsv')}
            </button>
          </>
        }
      />

      <div className="grid grid-auto">
        <StatTile label={t('statSubmitted')} value={counts.SUBMITTED} sub={oldestSubmitted ? t('statSubmittedSub', { age: timeAgo(oldestSubmitted.updatedAt) }) : t('statNoneWaiting')} />
        <StatTile label={t('statReturned')} value={counts.RETURNED} sub={t('statReturnedSub')} />
        <StatTile label={t('statAccepted')} value={counts.ACCEPTED} sub={t('statAcceptedSub')} />
        <StatTile label={t('statInPlan')} value={counts.SCHEDULED + counts.GRANTED + counts.EXECUTED} sub={t('statInPlanSub', { g: counts.GRANTED, e: counts.EXECUTED })} />
      </div>

      <Tabs<TabId> tabs={tabs} value={activeTab} onChange={setTab} />

      <div className="grid grid-main-aside" style={{ alignItems: 'start' }}>
        <Card>
          <CardHead
            title={t('listTitle')}
            sub={t('listSub', { n: rows.length })}
            right={
              mode === 'cell' ? (
                <select className="select" style={{ width: 'auto' }} aria-label={t('colDept')} value={deptFilter} onChange={(e) => setDeptFilter(e.target.value as Dept | 'ALL')}>
                  <option value="ALL">{t('tabAll')}</option>
                  {DEPTS.map((d) => <option key={d} value={d}>{DEPT_LABEL[d].short} ({DEPT_LABEL[d].system})</option>)}
                </select>
              ) : undefined
            }
          />
          <CardBody flush>
            <div data-tour="requisitions-table">
              <DataTable<Requisition> columns={cols} rows={rows} rowKey={(r) => r.id} onRowClick={(r) => openReq(r.id)} selectedKey={showForm ? null : selected?.id} empty={mode === 'dept' ? t('emptyDept') : t('emptyCell')} />
            </div>
          </CardBody>
        </Card>

        {showForm ? (
          <RequisitionForm
            key={compose?.editId ?? 'new'}
            snapshot={snapshot}
            allReqs={corridorReqs}
            mode={mode}
            fixedDept={dept}
            initial={editing}
            canSave={canRaise}
            onCancel={compose ? () => setCompose(null) : undefined}
            onDone={(r) => openReq(r.id)}
          />
        ) : selected ? (
          <RequisitionDetail
            req={selected}
            state={stateOf(selected)}
            check={checks.get(selected.id) ?? checkRequisition(fieldsOf(selected), snapshot, t, corridorReqs)}
            allReqs={corridorReqs}
            onOpenReq={openReq}
            trace={traces.get(selected.id) ?? null}
            snapshot={snapshot}
            mode={mode}
            canIntake={canIntake}
            canPlan={canPlan}
            onEdit={() => setCompose({ editId: selected.id })}
            onSubmit={() => handleSubmitRequisition(selected)}
            onWithdraw={() => handleWithdrawRequisition(selected)}
            onDuplicate={() => handleDuplicate(selected)}
            onAccept={() => handleAccept(selected)}
            onReturn={() => setReturning(selected)}
            openTask={(id) => drawer.open('task', id)}
            openBlock={(id) => drawer.open('block', id)}
          />
        ) : (
          <Card>
            <CardBody>
              <EmptyState title={t('selectOne')} />
            </CardBody>
          </Card>
        )}
      </div>

      {returning && (
        <ReturnModal
          req={returning}
          onClose={() => setReturning(null)}
          onConfirm={(remarks) => {
            // the store refuses (and toasts why) unless the requisition is still SUBMITTED
            if (returnRequisition(returning.id, remarks)) toast({ title: t('toastReturned', { no: returning.no }), body: remarks, tone: 'warn' });
            setReturning(null);
          }}
        />
      )}

      <TaskDrawer taskId={drawer.taskId} onClose={() => drawer.close('task')} />
      <BlockDrawer blockId={drawer.blockId} onClose={() => drawer.close('block')} />
    </div>
  );
}

/* ── Detail ────────────────────────────────────────────────── */
function RequisitionDetail(props: {
  req: Requisition;
  state: ReqState;
  check: CheckResult;
  trace: Trace | null;
  snapshot: Snapshot;
  mode: Mode;
  canIntake: boolean;
  canPlan: boolean;
  onEdit: () => void;
  onSubmit: () => void;
  onWithdraw: () => void;
  onDuplicate: () => void;
  onAccept: () => void;
  onReturn: () => void;
  openTask: (id: string) => void;
  openBlock: (id: string) => void;
  allReqs: Requisition[];
  onOpenReq: (id: string) => void;
}) {
  const { req: r, state, check, trace, snapshot, mode, canIntake, canPlan, allReqs } = props;
  const t = useT(strings);
  const weights = useAppStore((s) => s.weights);
  const reqById = new Map(allReqs.map((x) => [x.id, x]));
  const reqLinks = (ids: string[] | undefined) => (ids ?? []).map((id) => reqById.get(id)).filter((x): x is Requisition => !!x);
  const depReqs = reqLinks(r.dependsOnReqIds);
  const coReqs = reqLinks(r.coRequireReqIds);
  const linkList = (list: Requisition[]) =>
    list.length ? (
      <span className="row-wrap" style={{ gap: 4 }}>
        {list.map((x) => (
          <button key={x.id} type="button" className="btn btn-sm btn-ghost mono" style={{ padding: '0 6px' }} onClick={() => props.onOpenReq(x.id)}>
            {x.no} · {t(`st_${x.status}` as Key)}
          </button>
        ))}
      </span>
    ) : (
      t('none')
    );
  const linkText = (list: Requisition[]) => (list.length ? list.map((x) => x.no).join(', ') : t('none'));
  const corridor = snapshot.corridor;
  const rules = snapshot.result.rules;
  const machineLabel = (id: string) => snapshot.feeds.machines.find((m) => m.id === id)?.label ?? id;
  const crewLabel = (id: string) => snapshot.feeds.crews.find((c) => c.id === id)?.label ?? id;
  const windowText = r.preferredWindow ? t(`win_${r.preferredWindow}` as Key, { a: hhmm(rules.nightWindow[0]), b: hhmm(rules.nightWindow[1]) }) : '';
  const hasErrors = check.errors.length > 0;

  const sectionIdx = new Set(check.sections.map((s) => s.index));
  const nearby = snapshot.tasks
    .filter((x) => x.id !== trace?.task?.id && x.sections.some((s) => sectionIdx.has(s)) && (x.line === 'BOTH' || r.line === 'BOTH' || x.line === r.line))
    .sort((a, b) => b.risk.arci - a.risk.arci)
    .slice(0, 5);

  const pl = trace?.placement ?? null;
  const block = pl?.block ?? null;
  const partners = block && trace?.task ? block.tasks.filter((x) => x.id !== trace.task?.id) : [];

  const deptActions = mode === 'dept' && canIntake;
  const cellActions = mode === 'cell' && canPlan;

  return (
    <Card>
      <CardHead
        title={
          <span className="row-wrap" style={{ gap: 6 }}>
            <span className="mono">{r.no}</span>
            <DeptBadge dept={r.dept} />
            <Badge tone={STATE_TONE[state]}>{t(`st_${state}` as Key)}</Badge>
          </span>
        }
        sub={WT[r.workType]?.label ?? r.workType}
        right={<PrintButton label={t('print')} targetId="req-sheet" />}
      />
      <CardBody>
        <div className="stack-lg">
          <KeyValue
            items={[
              [t('kvLocation'), `${lineLabel(r.line)} · ${kmRange(r.startKm, r.endKm)}`],
              [t('kvSections'), check.sections.map((s) => s.label).join(' / ') || '—'],
              [t('kvBlockType'), t(`bt_${r.blockType}` as Key)],
              [t('kvDuration'), duration(r.durationMin)],
              [t('kvPreferred'), `${r.preferredDate ? dateLong(r.preferredDate) : t('flexible')}${windowText ? ` · ${windowText}` : ''}`],
              [t('kvMachine'), r.machine ? MT[r.machine]?.label ?? r.machine : t('noMachine')],
              [t('kvSpeed'), r.speedAfterKmph ? (r.speedAfterDays ? t('kvSpeedVal', { v: r.speedAfterKmph, d: r.speedAfterDays }) : t('kvSpeedValNoDays', { v: r.speedAfterKmph })) : t('kvFull')],
              [t('kvNeedsPower'), r.needsPowerBlock ? t('yes') : t('no')],
              [t('kvNeedsDisc'), r.needsDisconnection ? t('yes') : t('no')],
              [t('kvDependsOn'), linkList(depReqs)],
              [t('kvCoRequire'), linkList(coReqs)],
              ...(r.sourceTaskId
                ? [
                    [
                      t('kvReplaces'),
                      <button key="rep" type="button" className="btn btn-sm btn-ghost mono" style={{ padding: '0 6px' }} onClick={() => props.openTask(r.sourceTaskId!)}>
                        {r.sourceTaskId}
                      </button>,
                    ] as [string, ReactNode],
                  ]
                : []),
              ...(r.gang ? [[t('kvGang'), r.gang] as [string, string]] : []),
              ...(r.incharge ? [[t('kvIncharge'), r.incharge] as [string, string]] : []),
              ...(r.assetIds ? [[t('kvAssets'), r.assetIds] as [string, string]] : []),
              [t('kvRaised'), `${r.by} · ${r.role.replace(/_/g, ' ')} · ${timeAgo(r.at)}`],
            ]}
          />

          {r.remarks && (
            <div className="well">
              <div className="section-title">{t('remarks')}</div>
              <div className="small">{r.remarks}</div>
            </div>
          )}
          {r.cellRemarks && (
            <Callout tone={r.status === 'RETURNED' ? 'warn' : 'info'}>
              <b>{t('cellRemarks')}:</b> {r.cellRemarks}
            </Callout>
          )}

          <div>
            <div className="section-title">{t('validation')}</div>
            {check.errors.length > 0 && (
              <Callout tone="crit">
                <ul style={{ margin: 0, paddingLeft: 18 }}>{check.errors.map((e) => <li key={e}>{e}</li>)}</ul>
              </Callout>
            )}
            {check.warnings.length > 0 && (
              <div className="mt">
                <Callout tone="warn">
                  <ul style={{ margin: 0, paddingLeft: 18 }}>{check.warnings.map((e) => <li key={e}>{e}</li>)}</ul>
                </Callout>
              </div>
            )}
            {!check.errors.length && !check.warnings.length && <Callout tone="ok">{t('validationClean')}</Callout>}
            {check.totalMin !== null && (
              <div className="tiny muted mt">{t('mapping', { sections: check.sections.map((s) => s.label).join(' / '), total: duration(check.totalMin), ohe: check.ohe ? t('mappingOhe', { ohe: check.ohe }) : '' })}</div>
            )}
          </div>

          <PlannerPlan req={r} snapshot={snapshot} reqById={reqById} weights={weights} />

          {r.status === 'ACCEPTED' && trace?.task?.injectedFields?.note && (
            <Callout tone="info">
              <b>{t('landedTitle')}:</b> {trace.task.injectedFields.note}
              {(trace.task.dependsOn ?? []).length > 0 && (
                <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {(trace.task.dependsOn ?? []).map((pid) => {
                    const pt = snapshot.tasks.find((x) => x.id === pid);
                    const ps = snapshot.result.weekly.ai.scheduled.find((x) => x.taskId === pid);
                    const where = !pt ? t('landedDepMissing') : ps ? t('landedDepPlaced', { date: dateLabel(addDaysIso(snapshot.planStart, ps.day)), window: `${hhmm(ps.start)}–${hhmm(ps.end)}` }) : t('landedDepNot');
                    return <li key={pid}>{t('landedDeps', { no: pt?.label ?? pid, where })}</li>;
                  })}
                </ul>
              )}
            </Callout>
          )}

          {r.status === 'ACCEPTED' && (
            <div>
              <div className="section-title row">
                {t('placementTitle')} <SimLabel kind="solver" short />
              </div>
              {!trace?.task ? (
                <div className="small muted">{t('notInPlan')}</div>
              ) : (
                <div className="stack" style={{ gap: 6 }}>
                  <button className="well" style={wellBtn} onClick={() => props.openTask(trace.task!.id)}>
                    <span className="small strong">{t('openTask', { id: trace.task.id })}</span> <span className="small">· {trace.task.label}</span>
                  </button>
                  {block ? (
                    <button className="well" style={wellBtn} onClick={() => props.openBlock(block.id)}>
                      <div className="small strong">{t('placed', { date: dateLabel(block.date), window: `${hhmm(block.start)}–${hhmm(block.end)}`, block: block.id })}</div>
                      <div className="tiny muted">{partners.length ? t('partners', { works: partners.map((x) => `${x.label} (${DEPT_LABEL[x.dept].short})`).join(', ') }) : t('alone')}</div>
                      {(block.machines.length > 0 || block.crews.length > 0) && <div className="tiny muted">{t('resources', { m: block.machines.map(machineLabel).join(', ') || '—', c: block.crews.map(crewLabel).join(', ') || '—' })}</div>}
                    </button>
                  ) : pl?.deferredReason ? (
                    <div className="small muted">{t('deferred', { reason: pl.deferredReason })}</div>
                  ) : null}
                </div>
              )}
            </div>
          )}

          <div>
            <div className="section-title">{t('nearbyTitle')}</div>
            {nearby.length === 0 ? (
              <div className="small muted">{t('nearbyNone')}</div>
            ) : (
              <div className="stack" style={{ gap: 6 }}>
                {nearby.map((x) => (
                  <button key={x.id} className="well" style={wellBtn} onClick={() => props.openTask(x.id)}>
                    <div className="row">
                      <DeptBadge dept={x.dept} />
                      <span className="small grow truncate">{x.label}</span>
                      <span className="mono tiny num">{kmRange(x.startKm, x.endKm)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="section-title row">
              {t('history')} {r.seeded && <SimLabel kind="seededRecords" short />}
            </div>
            <Timeline steps={r.history.map((h) => ({ label: `h_${h.action}` in strings.en ? t(`h_${h.action}` as Key) : h.action.charAt(0) + h.action.slice(1).toLowerCase(), when: timeAgo(h.at), state: 'done' as const, note: h.note ? `${h.by} · ${h.note}` : h.by }))} />
          </div>

          <div className="row-wrap">
            {deptActions && (r.status === 'DRAFT' || r.status === 'RETURNED') && (
              <>
                <button className="btn btn-primary btn-sm" disabled={hasErrors} title={hasErrors ? t('fixFirst') : undefined} onClick={props.onSubmit}>
                  <Send size={14} /> {t('submit')}
                </button>
                <button className="btn btn-sm" onClick={props.onEdit}>
                  <Pencil size={14} /> {t('edit')}
                </button>
              </>
            )}
            {cellActions && r.status === 'SUBMITTED' && (
              <>
                <button className="btn btn-primary btn-sm" disabled={hasErrors} title={hasErrors ? t('fixFirst') : undefined} onClick={props.onAccept}>
                  <Check size={14} /> {t('accept')}
                </button>
                <button className="btn btn-sm" onClick={props.onReturn}>
                  <RotateCcw size={14} /> {t('returnBtn')}
                </button>
              </>
            )}
            {deptActions && r.status !== 'WITHDRAWN' && (
              <button className="btn btn-sm btn-ghost" onClick={props.onWithdraw}>
                <X size={14} /> {t('withdraw')}
              </button>
            )}
            {(deptActions || cellActions) && (
              <button className="btn btn-sm btn-ghost" onClick={props.onDuplicate}>
                <Copy size={14} /> {t('duplicate')}
              </button>
            )}
            {mode === 'dept' && !canIntake && <span className="tiny muted">{t('noIntake')}</span>}
            {mode === 'cell' && !canPlan && <span className="tiny muted">{t('noPlan')}</span>}
          </div>
        </div>

        <div className="print-only">
          <FormSheet id="req-sheet" title={t('sheetTitle')} formNo={`${r.no} · ${corridor.code}`}>
            <table style={sheetTable}>
              <tbody>
                <tr><th style={sheetCell}>{t('fDept')}</th><td style={sheetCell}>{DEPT_LABEL[r.dept].long} ({DEPT_LABEL[r.dept].system})</td></tr>
                <tr><th style={sheetCell}>{t('kvWork')}</th><td style={sheetCell}>{WT[r.workType]?.label ?? r.workType}</td></tr>
                <tr><th style={sheetCell}>{t('kvLocation')}</th><td style={sheetCell}>{lineLabel(r.line)} · {kmRange(r.startKm, r.endKm)} · {check.sections.map((s) => s.label).join(' / ')}</td></tr>
                <tr><th style={sheetCell}>{t('kvBlockType')}</th><td style={sheetCell}>{t(`bt_${r.blockType}` as Key)}</td></tr>
                <tr><th style={sheetCell}>{t('kvDuration')}</th><td style={sheetCell}>{duration(r.durationMin)}</td></tr>
                <tr><th style={sheetCell}>{t('kvPreferred')}</th><td style={sheetCell}>{r.preferredDate ? dateLong(r.preferredDate) : t('flexible')}{windowText ? ` · ${windowText}` : ''}</td></tr>
                <tr><th style={sheetCell}>{t('kvMachine')}</th><td style={sheetCell}>{r.machine ? MT[r.machine]?.label ?? r.machine : t('noMachine')}</td></tr>
                <tr><th style={sheetCell}>{t('kvSpeed')}</th><td style={sheetCell}>{r.speedAfterKmph ? t('kvSpeedValNoDays', { v: r.speedAfterKmph }) : t('kvFull')}</td></tr>
                <tr><th style={sheetCell}>{t('kvNeedsPower')}</th><td style={sheetCell}>{r.needsPowerBlock ? t('yes') : t('no')}</td></tr>
                <tr><th style={sheetCell}>{t('kvNeedsDisc')}</th><td style={sheetCell}>{r.needsDisconnection ? t('yes') : t('no')}</td></tr>
                <tr><th style={sheetCell}>{t('kvDependsOn')}</th><td style={sheetCell}>{linkText(depReqs)}</td></tr>
                <tr><th style={sheetCell}>{t('kvCoRequire')}</th><td style={sheetCell}>{linkText(coReqs)}</td></tr>
                {r.sourceTaskId && <tr><th style={sheetCell}>{t('kvReplaces')}</th><td style={sheetCell}>{r.sourceTaskId}</td></tr>}
                <tr><th style={sheetCell}>{t('kvGang')}</th><td style={sheetCell}>{r.gang ?? '—'}</td></tr>
                <tr><th style={sheetCell}>{t('kvIncharge')}</th><td style={sheetCell}>{r.incharge ?? '—'}</td></tr>
                <tr><th style={sheetCell}>{t('remarks')}</th><td style={sheetCell}>{r.remarks ?? '—'}</td></tr>
                <tr><th style={sheetCell}>{t('colState')}</th><td style={sheetCell}>{t(`st_${state}` as Key)}</td></tr>
              </tbody>
            </table>
            <div style={signGrid}>
              <div style={signLine}>{t('sheetSignDept')} · {r.by}</div>
              <div style={signLine}>{t('sheetSignCell')}</div>
            </div>
          </FormSheet>
        </div>
      </CardBody>
    </Card>
  );
}

/* ── Form (raise / edit / create on behalf) ────────────────── */
function RequisitionForm({ snapshot, mode, fixedDept, initial, canSave, onCancel, onDone, allReqs }: { snapshot: Snapshot; mode: Mode; fixedDept: Dept | null; initial: Requisition | null; canSave: boolean; onCancel?: () => void; onDone: (r: Requisition) => void; allReqs: Requisition[] }) {
  const t = useT(strings);
  const user = useAppStore((s) => s.user);
  const saveRequisition = useAppStore((s) => s.saveRequisition);
  const submitRequisition = useAppStore((s) => s.submitRequisition);
  const toast = useAppStore((s) => s.toast);
  const corridor = snapshot.corridor;
  const rules = snapshot.result.rules;

  const initDept: Dept = initial?.dept ?? fixedDept ?? 'TMS';
  const initWork = initial?.workType ?? firstWork(initDept);
  const [dept, setDept] = useState<Dept>(initDept);
  const [workType, setWorkType] = useState(initWork);
  const [line, setLine] = useState<Line>(initial?.line ?? 'UP');
  const [from, setFrom] = useState(initial ? String(initial.startKm) : '');
  const [to, setTo] = useState(initial ? String(initial.endKm) : '');
  const [dur, setDur] = useState(String(initial?.durationMin ?? WT[initWork]?.durationMin ?? ''));
  const [date, setDate] = useState(initial?.preferredDate ?? '');
  const [win, setWin] = useState<Window>(initial?.preferredWindow ?? 'night');
  const [machine, setMachine] = useState(initial ? initial.machine ?? '' : WT[initWork]?.machine ?? '');
  const [blockType, setBlockType] = useState<BlockType>(initial?.blockType ?? expectedBlockType(initWork));
  const [speed, setSpeed] = useState(initial?.speedAfterKmph ? String(initial.speedAfterKmph) : '');
  const [speedDays, setSpeedDays] = useState(initial?.speedAfterDays ? String(initial.speedAfterDays) : '');
  const [gang, setGang] = useState(initial?.gang ?? '');
  const [incharge, setIncharge] = useState(initial?.incharge ?? user?.name ?? '');
  const [assets, setAssets] = useState(initial?.assetIds ?? '');
  const [remarks, setRemarks] = useState(initial?.remarks ?? '');
  const [needsPower, setNeedsPower] = useState(!!initial?.needsPowerBlock);
  const [needsDisc, setNeedsDisc] = useState(!!initial?.needsDisconnection);
  const [dependsOn, setDependsOn] = useState<string[]>(initial?.dependsOnReqIds ?? []);
  const [coRequire, setCoRequire] = useState<string[]>(initial?.coRequireReqIds ?? []);
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const others = allReqs.filter((x) => x.id !== initial?.id && x.status !== 'WITHDRAWN');
  const depCandidates = others.filter((x) => x.dept === dept);
  const coCandidates = others;

  const changeWork = (wt: string) => {
    setWorkType(wt);
    setDur(String(WT[wt]?.durationMin ?? ''));
    setMachine(WT[wt]?.machine ?? '');
    setBlockType(expectedBlockType(wt));
  };
  const changeDept = (d: Dept) => {
    setDept(d);
    changeWork(firstWork(d));
  };

  const depIds = dependsOn.filter((id) => depCandidates.some((x) => x.id === id));
  const coIds = coRequire.filter((id) => coCandidates.some((x) => x.id === id));
  const fields: ReqFields = { id: initial?.id, dept, workType, line, startKm: from.trim() === '' ? NaN : Number(from), endKm: to.trim() === '' ? NaN : Number(to), durationMin: Number(dur), blockType, preferredDate: date || undefined, speedAfterKmph: speed.trim() ? Number(speed) : null, needsPowerBlock: needsPower, needsDisconnection: needsDisc, dependsOnReqIds: depIds, coRequireReqIds: coIds };
  const check = checkRequisition(fields, snapshot, t, allReqs);
  const touched = from !== '' || to !== '';
  const draftOk = canSave && !!WT[workType] && Number.isFinite(fields.startKm) && Number.isFinite(fields.endKm);

  const save = (submit: boolean) => {
    const saved = saveRequisition({
      id: initial?.id,
      corridorId: corridor.id,
      dept,
      workType,
      line,
      startKm: fields.startKm,
      endKm: fields.endKm,
      durationMin: fields.durationMin,
      preferredDate: date || undefined,
      preferredWindow: win,
      machine: machine || null,
      crew: initial?.crew ?? null,
      blockType,
      speedAfterKmph: fields.speedAfterKmph,
      speedAfterDays: speedDays.trim() ? Number(speedDays) : undefined,
      gang: gang.trim() || undefined,
      incharge: incharge.trim() || undefined,
      assetIds: assets.trim() || undefined,
      remarks: remarks.trim() || undefined,
      needsPowerBlock: needsPower,
      needsDisconnection: needsDisc,
      dependsOnReqIds: depIds.length ? depIds : undefined,
      coRequireReqIds: coIds.length ? coIds : undefined,
      sourceTaskId: initial?.sourceTaskId,
      status: initial?.status === 'RETURNED' ? 'RETURNED' : 'DRAFT',
      validation: [...check.errors, ...check.warnings],
    });
    if (submit) {
      submitRequisition(saved.id);
      toast({ title: t('toastSubmitted', { no: saved.no }), tone: 'ok' });
    } else toast({ title: t('toastSaved', { no: saved.no }), tone: 'ok' });
    onDone(saved);
  };

  const works = Object.entries(WT).filter(([, d]) => d.dept === dept);
  const machines = Object.entries(MT).filter(([, m]) => m.dept === dept);

  return (
    <Card tour="requisition-form">
      <CardHead title={initial ? t('formTitleEdit', { no: initial.no }) : t('formTitleNew')} sub={t('formSub')} right={<span className="tiny muted">{t('bdmsNote')}</span>} />
      <CardBody>
        <div className="stack">
          <div className="form-grid">
            {mode === 'cell' && !initial ? (
              <Field label={t('fDept')}>
                <select className="select" value={dept} onChange={(e) => changeDept(e.target.value as Dept)}>
                  {DEPTS.map((d) => <option key={d} value={d}>{DEPT_LABEL[d].long} ({DEPT_LABEL[d].system})</option>)}
                </select>
              </Field>
            ) : (
              <Field label={t('fDept')}>
                <div className="row" style={{ minHeight: 38 }}>
                  <DeptBadge dept={dept} long />
                </div>
              </Field>
            )}
            <Field label={t('fWork')}>
              <select className="select" value={workType} onChange={(e) => changeWork(e.target.value)}>
                {works.map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
              </select>
            </Field>
            <Field label={t('fLine')}>
              <select className="select" value={line} onChange={(e) => setLine(e.target.value as Line)}>
                <option value="UP">{t('lineUp')}</option>
                <option value="DN">{t('lineDn')}</option>
                <option value="BOTH">{t('lineBoth')}</option>
              </select>
            </Field>
            <Field label={t('fBlockType')}>
              <select className="select" value={blockType} onChange={(e) => setBlockType(e.target.value as BlockType)}>
                {BLOCK_TYPES.map((b) => <option key={b} value={b}>{t(`bt_${b}` as Key)}</option>)}
              </select>
            </Field>
            <Field label={t('fFrom')}>
              <input className="input" type="number" step={0.1} min={0} max={corridor.lengthKm} value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label={t('fTo')}>
              <input className="input" type="number" step={0.1} min={0} max={corridor.lengthKm} value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <Field label={t('fDuration')} hint={WT[workType] ? t('fDurationHint', { v: WT[workType].durationMin }) : undefined}>
              <input className="input" type="number" step={15} min={0} value={dur} onChange={(e) => setDur(e.target.value)} />
            </Field>
            <Field label={t('fMachine')}>
              <select className="select" value={machine} onChange={(e) => setMachine(e.target.value)}>
                <option value="">{t('noMachine')}</option>
                {machines.map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
              </select>
            </Field>
            <Field label={t('fDate')}>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label={t('fWindow')}>
              <select className="select" value={win} onChange={(e) => setWin(e.target.value as Window)}>
                {(['night', 'day', 'any'] as Window[]).map((w) => <option key={w} value={w}>{t(`win_${w}` as Key, { a: hhmm(rules.nightWindow[0]), b: hhmm(rules.nightWindow[1]) })}</option>)}
              </select>
            </Field>
            <Field label={t('fSpeed')} hint={t('fSpeedHint')}>
              <input className="input" type="number" step={5} min={0} max={corridor.mpsKmph} value={speed} onChange={(e) => setSpeed(e.target.value)} />
            </Field>
            <Field label={t('fSpeedDays')}>
              <input className="input" type="number" step={1} min={0} value={speedDays} disabled={!speed.trim()} onChange={(e) => setSpeedDays(e.target.value)} />
            </Field>
            <Field label={t('fGang')}>
              <input className="input" value={gang} onChange={(e) => setGang(e.target.value)} />
            </Field>
            <Field label={t('fIncharge')}>
              <input className="input" value={incharge} onChange={(e) => setIncharge(e.target.value)} />
            </Field>
          </div>
          {dept !== 'TMS' && (
            <Field label={t('fAssets')}>
              <input className="input" value={assets} onChange={(e) => setAssets(e.target.value)} />
            </Field>
          )}
          <div className="row-wrap">
            <label className="check small">
              <input type="checkbox" checked={needsPower} onChange={(e) => setNeedsPower(e.target.checked)} />
              {t('fNeedsPower')}
            </label>
            <label className="check small">
              <input type="checkbox" checked={needsDisc} onChange={(e) => setNeedsDisc(e.target.checked)} />
              {t('fNeedsDisc')}
            </label>
          </div>
          <div className="form-grid">
            <Field label={t('fDependsOn')} hint={t('fDependsOnHint')}>
              <ReqPicker list={depCandidates} selected={depIds} onToggle={(id) => setDependsOn((l) => toggle(l, id))} emptyText={t('noOthers')} t={t} />
            </Field>
            <Field label={t('fCoRequire')} hint={t('fCoRequireHint')}>
              <ReqPicker list={coCandidates} selected={coIds} onToggle={(id) => setCoRequire((l) => toggle(l, id))} emptyText={t('noOthers')} t={t} />
            </Field>
          </div>
          <Field label={t('fRemarks')}>
            <textarea className="textarea" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>

          {touched && check.errors.length > 0 && (
            <Callout tone="crit">
              <ul style={{ margin: 0, paddingLeft: 18 }}>{check.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </Callout>
          )}
          {touched && check.warnings.length > 0 && (
            <Callout tone="warn">
              <ul style={{ margin: 0, paddingLeft: 18 }}>{check.warnings.map((e) => <li key={e}>{e}</li>)}</ul>
            </Callout>
          )}
          {touched && !check.errors.length && check.totalMin !== null && (
            <div className="tiny muted">{t('mapping', { sections: check.sections.map((s) => s.label).join(' / '), total: duration(check.totalMin), ohe: check.ohe ? t('mappingOhe', { ohe: check.ohe }) : '' })}</div>
          )}

          <div className="row-wrap" style={{ justifyContent: 'flex-end' }}>
            {onCancel && <button className="btn btn-sm btn-ghost" onClick={onCancel}>{t('cancel')}</button>}
            <button className="btn btn-sm" disabled={!draftOk} title={canSave ? undefined : mode === 'dept' ? t('noIntake') : t('noPlan')} onClick={() => save(false)}>
              {t('saveDraft')}
            </button>
            <button className="btn btn-sm btn-primary" disabled={!canSave || check.errors.length > 0} title={!canSave ? (mode === 'dept' ? t('noIntake') : t('noPlan')) : check.errors.length ? t('fixFirst') : undefined} onClick={() => save(true)}>
              <Send size={14} /> {t('submit')}
            </button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/** Tick-list of other requisitions (sequence / joint-block links). */
function ReqPicker({ list, selected, onToggle, emptyText, t }: { list: Requisition[]; selected: string[]; onToggle: (id: string) => void; emptyText: string; t: TFn }) {
  if (!list.length) return <div className="small muted">{emptyText}</div>;
  return (
    <div className="stack" style={{ gap: 2, maxHeight: 168, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: '4px 8px' }}>
      {list.map((x) => (
        <label key={x.id} className="check small" style={{ alignItems: 'flex-start' }}>
          <input type="checkbox" checked={selected.includes(x.id)} onChange={() => onToggle(x.id)} />
          <span>
            <span className="mono">{x.no}</span> <span className="tiny muted">· {DEPT_LABEL[x.dept].short} · {WT[x.workType]?.label ?? x.workType} · {x.line} {kmRange(x.startKm, x.endKm)} · {t(`st_${x.status}` as Key)}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

/** What the optimiser receives for a requisition (select.requisitionInjectSpec), in plain words. */
function PlannerPlan({ req: r, snapshot, reqById, weights }: { req: Requisition; snapshot: Snapshot; reqById: Map<string, Requisition>; weights: { preference?: number } }) {
  const t = useT(strings);
  const rules = snapshot.result.rules;
  const known = r.status === 'ACCEPTED' ? null : new Set(snapshot.tasks.map((x) => x.id));
  const spec = requisitionInjectSpec(r, { planStart: snapshot.planStart, corridorId: r.corridorId, knownTaskIds: known });
  const wt = WT[r.workType] as (WorkTypeDef & { setupMin?: number; clearanceMin?: number }) | undefined;
  const total = spec.durationMin ? spec.durationMin + (wt?.setupMin ?? 0) + (wt?.clearanceMin ?? 0) : null;
  const weekEnd = addDaysIso(snapshot.planStart, snapshot.result.weekly.occupancy.length - 1);
  const day = preferredDayOf(r.preferredDate, snapshot.planStart, snapshot.result.weekly.occupancy.length);
  const kindKey: Record<string, Key> = { TRAFFIC: 'bt_TRAFFIC', POWER: 'bt_POWER', 'TRAFFIC + POWER': 'bt_INTEGRATED', DISCONNECTION: 'bt_DISCONNECTION' };
  const reqNo = (sid: string) => {
    const id = sid.replace(/^REQ\//, '');
    return reqById.get(id)?.no ?? sid;
  };
  const replacedTask = spec.replacesTaskId ? snapshot.tasks.find((x) => x.id === spec.replacesTaskId) : undefined;
  const lines: string[] = [
    spec.durationMin && total !== null ? t('pDuration', { dur: duration(spec.durationMin), total: duration(total) }) : t('pDurationCal'),
    day !== undefined ? t('pDay', { date: dateLabel(addDaysIso(snapshot.planStart, day)), d: day + 1, w: weights.preference ?? 0 }) : r.preferredDate ? t('pDayOutside', { date: dateLabel(r.preferredDate), a: dateLabel(snapshot.planStart), b: dateLabel(weekEnd) }) : t('pDayNone'),
    spec.preferredWindow === 'night' ? t('pWindowNight', { a: hhmm(rules.nightWindow[0]), b: hhmm(rules.nightWindow[1]) }) : spec.preferredWindow === 'day' ? t('pWindowDay') : t('pWindowAny'),
    spec.machine ? t('pMachine', { m: MT[spec.machine]?.label ?? spec.machine }) : t('pNoMachine'),
    t('pKind', { kind: t(kindKey[spec.blockKind ?? 'TRAFFIC'] ?? 'bt_TRAFFIC'), extra: `${spec.requires?.includes('POWER_BLOCK') ? t('pKindPower') : ''}${spec.requires?.includes('DISCONNECTION') ? t('pKindDisc') : ''}` }),
    ...(spec.dependsOn?.length ? [t('pDepends', { list: spec.dependsOn.map(reqNo).join(', ') })] : []),
    ...(spec.coRequireWith?.length ? [t('pCo', { list: spec.coRequireWith.map(reqNo).join(', ') })] : []),
    spec.replacesTaskId ? t('pReplaces', { id: spec.replacesTaskId, label: replacedTask ? ` (${replacedTask.label}, ${kmRange(replacedTask.startKm, replacedTask.endKm)})` : '' }) : r.sourceTaskId ? t('pReplacesGone', { id: r.sourceTaskId }) : t('pNew'),
  ];
  return (
    <div data-tour="requisition-planner">
      <div className="section-title row">
        {t('plannerTitle')} <SimLabel kind="solver" short />
      </div>
      <div className="tiny muted" style={{ marginBottom: 6 }}>{t('plannerSub')}</div>
      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

function ReturnModal({ req, onClose, onConfirm }: { req: Requisition; onClose: () => void; onConfirm: (remarks: string) => void }) {
  const t = useT(strings);
  const [remarks, setRemarks] = useState(req.cellRemarks ?? '');
  const empty = !remarks.trim();
  return (
    <Modal
      open
      onClose={onClose}
      title={t('returnTitle', { no: req.no })}
      footer={
        <div className="row" style={{ justifyContent: 'flex-end', width: '100%' }}>
          <button className="btn" onClick={onClose}>{t('cancel')}</button>
          <button className="btn btn-primary" disabled={empty} title={empty ? t('returnRequired') : undefined} onClick={() => onConfirm(remarks.trim())}>{t('returnBtn')}</button>
        </div>
      }
    >
      <div className="stack">
        <div className="small">{t('returnBody')}</div>
        <Field label={t('returnRemarks')} error={empty ? t('returnRequired') : undefined}>
          <textarea className="textarea" rows={4} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
