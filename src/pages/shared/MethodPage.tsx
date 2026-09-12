/**
 * MethodPage — the honesty page (/app/:portal/method): how each number is
 * computed on this run, what is simulated, model metrics, the pitch-deck
 * figures as target / literature next to what this seed computes, the
 * glossary and the tours.
 *
 * This is the only page that shows the deck figures, each with <SourceLabel />.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, ExternalLink, PlayCircle } from 'lucide-react';
import { useAppStore, type RoiAssumptions } from '../../store/useAppStore';
import { usePortal } from '../../app/usePortal';
import { PORTALS, PORTAL_ORDER, type PortalId } from '../../auth/portals';
import { URGENCY } from '../../engine/riskEngine.js';
import { cautionOrders, disconnectionNoticesWeek, workingBlocks } from '../../engine/select';
import type { RiskExplanation, WeibullFit } from '../../engine/types';
import { useLang, useT } from '../../i18n';
import { common } from '../../i18n/common';
import { copyText, duration, num, pct, rupees } from '../../lib/format';
import { ArciBar, Card, CardBody, CardHead, DataTable, KeyValue, PageHeader, PlanPending, type Column } from '../../components/ui';
import { SeedStamp, SimLabel, SourceLabel, type SimKind } from '../../components/ui/extras';
import { TOUR_STEPS } from '../../features/tour/steps';
import { startTour } from '../../features/tour/tour';
import { TaskDrawer } from '../../components/domain/TaskDrawer';
import { SolverDetails } from '../../components/domain/SolverStamp';
import { useDrawerParams } from '../../components/domain/useDrawerParams';

/** Seed the worker uses for every feed (src/engine/worker.ts default). */
const SEED = 26027;

const strings = {
  en: {
    title: 'Method and evidence',
    lede: 'How every number in SAMANVAY is computed, what is simulated, and how this run compares with the figures in the SIH 2026 deck.',
    copyCitation: 'Copy citation',
    copied: 'Citation copied',
    copyFailed: 'Could not copy — clipboard not available',
    openPage: 'Open page',
    openWork: 'Open work',
    problemTitle: 'Problem',
    problemBody: 'PS 26027 asks for automatic block planning: the maintenance demands of Civil (TMS), Signal & Telecom (SMMS) and Traction (TDMS) brought into one plan per division, fitted into the natural gaps of the working timetable, ordered by risk, checked by the Section Controller and handed off in the BDMS demand format. Today each department asks for its own possessions; the same section is closed several times a week and trains are regulated each time.',
    dataTitle: 'Data in',
    dataSub: 'Feeds read on this run. All are seeded, native-schema data generated in the planning worker.',
    dCoa: 'COA working timetable paths',
    dFois: 'FOIS goods paths (forecast)',
    dTms: 'TMS track records',
    dSmms: 'SMMS signalling records',
    dTdms: 'TDMS OHE records',
    dMachines: 'Track machines',
    dCrews: 'Gangs and units',
    dExec: 'Execution history entries',
    dFail: 'Failure history records',
    dEsc: 'Escalation history records',
    normTitle: 'Normaliser',
    normSub: 'TMS locates by line and km, SMMS by station yard and gear id, TDMS by mast number and elementary section. Each record is mapped onto one corridor graph.',
    nStations: 'Stations',
    nSections: 'Block sections',
    nOhe: 'OHE elementary sections',
    nMapped: 'Records mapped to works',
    nRejected: 'Records rejected',
    nIssues: 'Data-quality issues raised',
    nPairs: 'Co-location pairs found',
    nTasks: 'Works in this plan (incl. injected)',
    arciTitle: 'ARCI — Asset Risk & Criticality Index',
    arciSub: 'Every work is ranked by one explainable score; mandatory safety work is floored and placed first.',
    arciFormula: 'ARCI = clamp01( √S × (0.30·Pf′ + 0.25·ODI + 0.25·Odue + 0.20·Eml) + TSR uplift )',
    arciTerms: 'Pf′ blends the 30-day Weibull failure probability with the measured condition index; ODI is class-weighted traffic on the section plus the speed-restriction loss; Odue is the overdue penalty against the statutory interval; Eml is the logistic probability that the defect escalates to a stricter TSR; S is the safety severity of the work type. Safety ≥ 0.95 that is due, or already under a TSR, is floored at 0.92.',
    arciBands: 'Bands on this engine',
    arciTop: 'Highest-ranked work on this run',
    colTerm: 'Term',
    colValue: 'Value',
    colWeight: 'Weight',
    colWhy: 'Explanation',
    optTitle: 'Optimiser',
    optSub: 'An exact MILP over the candidate possessions in the free timetable windows (JPO rules, machine and gang capacity, requisition sequences and approved blocks as hard constraints; one weighted objective) is solved in the browser by HiGHS (WebAssembly); simulated annealing then moves and bundles works. If HiGHS cannot load, greedy construction + annealing runs instead. OR-Tools CP-SAT is the production target. Formulation: docs/MILP-FORMULATION.md. Rules, weights and search figures below are the ones of this run.',
    solverRunTitle: 'Solver of this run',
    rulesTitle: 'Rules in force',
    rMax: 'Longest possession',
    rMin: 'Shortest possession',
    rHeadway: 'Headway margin',
    rSlw: 'Single-line working penalty',
    rPerDay: 'Possessions per day',
    rConcurrent: 'Simultaneous possessions',
    rNotice: 'JPO notice for regulation',
    rPremium: 'Premium paths may be blocked',
    weeksN: '{n} weeks',
    yes: 'Yes',
    no: 'No',
    weightsTitle: 'Objective weights',
    wDelay: 'Class-weighted delay',
    wDowntime: 'Line downtime',
    wRisk: 'Unscheduled risk',
    wColocation: 'Co-location bonus',
    wTsr: 'TSR train-minutes',
    wSpread: 'Per-block penalty',
    wPreference: 'Requisition preference (per day away)',
    searchTitle: 'Search on this run',
    sIterations: 'Iterations',
    sImprovements: 'Improvements accepted',
    sCost: 'Cost: construction → after annealing',
    sTime: 'Solver time',
    kpiTitle: 'This week: plan against the simulated baseline',
    colMetric: 'Metric',
    colPlan: 'Plan',
    colBaseline: 'Baseline',
    colDelta: 'Difference',
    kAvail: 'Corridor availability',
    kHours: 'Possession hours',
    kBlocks: 'Possessions',
    kColoc: 'Co-location of closure works',
    kMand: 'Mandatory works in time',
    kDelay: 'Class-weighted train delay (min)',
    kTsr: 'TSR train-minutes',
    ctrlTitle: 'Controller validation',
    ctrlBody: 'Nothing the optimiser proposes becomes a possession until departments concur and the Section Controller grants it. Control can grant with a changed window (re-checked against the timetable and the JPO rules), refuse with a reason, lock the next day into the COA timetable, and re-plan the rest of the day after a failure with started blocks held fixed.',
    formsTitle: 'Forms generated',
    formsSub: 'Derived from the working plan and the TSR register; printed copies carry a not-official watermark.',
    fT409: 'Caution orders for the first plan day (T/409, T/409B)',
    fT351: 'Disconnection notices this week (T/351)',
    fBdms: 'Possessions in the BDMS demand payload',
    simTitle: 'What is simulated',
    simSub: 'Everything else on screen is computed from these inputs or recorded by a user action.',
    colItem: 'Item',
    colWhat: 'What is simulated',
    colLabel: 'Label',
    s1: 'COA timetable and FOIS goods forecast',
    s1d: 'Train paths generated from corridor geometry and a class mix for the corridor.',
    s2: 'TMS, SMMS and TDMS registers',
    s2d: 'Defect and due-maintenance records in each system’s native fields.',
    s3: 'Machines and gangs',
    s3d: 'Fleet, home stations, reach, strength and unavailability windows.',
    s4: 'Failure and escalation history',
    s4d: 'Training data for the Weibull fits and the escalation model.',
    s5: 'Execution history before today',
    s5d: 'Planned against actual minutes that calibrate work durations.',
    s6: 'Decentralised baseline',
    s6d: 'Each department books its own possessions first-come-first-served on the same seed.',
    s7: 'Train positions',
    s7d: 'Interpolated from the working timetable at a chosen minute.',
    s8: 'Control clock',
    s8d: 'The scrubber minute on the board, not wall time.',
    s9: '₹ unit rates',
    s9d: 'Editable unit values used by the ROI audit.',
    s10: 'Accounts',
    s10d: 'Demo accounts stored in this browser.',
    s11: 'Printed forms',
    s11d: 'T/409, T/409B and T/351 sheets are drafts until signed.',
    modelsTitle: 'Model metrics',
    modelsSub: 'Fitted on seeded history on every plan run. The seeded truth is shown so the fit can be checked.',
    colClass: 'Asset class',
    colBeta: 'β (shape)',
    colEta: 'η (days)',
    colFail: 'Failures / n',
    colCens: 'Censored',
    colB10: 'B10 life (days)',
    colTruth: 'Seeded truth β / η',
    logTitle: 'Escalation model (logistic regression, held-out split)',
    mAuc: 'AUC',
    mPrecision: 'Precision',
    mRecall: 'Recall',
    mAccuracy: 'Accuracy',
    mTrain: 'Training records',
    mTest: 'Held-out records',
    targetsTitle: 'Computed this seed vs target / literature',
    targetsSub: 'The right-hand column is quoted from the SIH 2026 deck. The middle column is what this run computes against the simulated baseline.',
    colDeck: 'Deck metric',
    colComputed: 'Computed on this seed',
    colTarget: 'Target / literature',
    tUptime: 'Potential asset uptime improvement',
    tUptimeM: 'Corridor availability, relative change vs baseline ({plan} vs {base})',
    tDowntime: 'Potential corridor downtime reduction',
    tDowntimeM: 'Section-line hours closed, change vs baseline ({plan} h vs {base} h)',
    tColoc: 'Multi-department task co-location',
    tColocM: 'Share of line-closure works placed in a joint block ({n} of {total} blocks joint)',
    tPlanCost: 'Lower maintenance planning costs',
    tPlanCostM: 'Not modelled — no planning-cost model. Nearest computed quantity: possessions to arrange, {v} vs baseline.',
    tMaintCost: 'Reduction in total maintenance costs',
    tMaintCostM: 'Not modelled — no maintenance-cost model. Nearest computed quantity: possession hours, {v} vs baseline.',
    notModelled: 'Not modelled',
    tUptimeV: '+18.8 %',
    tDowntimeV: '−51.9 %',
    tColocV: '96.2 %',
    tPlanCostV: '11–17 %',
    tMaintCostV: 'up to 15 %',
    limitsTitle: 'Limitations',
    l1: 'Runs entirely in the browser: no server and no sync between devices.',
    l2: 'Feeds are seeded; there is no live link to CRIS, COA, FOIS, BDMS or SCADA.',
    l3: 'The exact solver is a MILP solved by HiGHS in the browser within a few seconds, with simulated annealing as polish and fallback; OR-Tools CP-SAT on a server is the production target and is not run here. The MILP keeps at most 20 candidate windows per work, so its optimality gap is for that candidate set.',
    l4: 'Accounts are browser-local demo accounts.',
    l5: 'No PNR, seat, berth or live running status anywhere in the product.',
    l6: 'The copilot is rule-based and answers in English.',
    assumpTitle: 'Assumptions',
    assumpSub: 'Unit values behind every ₹ figure. They are editable in the ROI audit.',
    openAssumptions: 'Open assumptions',
    aDelayVb: 'Premium train delay, per minute',
    aDelayMail: 'Mail / Express delay, per minute',
    aDelayGoods: 'Goods path delay, per minute',
    aLineHour: 'Line availability, per section-hour',
    aDemurrage: 'Freight demurrage, per rake-hour',
    aTsrEnergy: 'TSR traction energy, per train-minute',
    aSetup: 'Machine set-up, per possession',
    aCo2: 'CO₂ per TSR minute (kg)',
    aCarbon: 'Carbon credit, per tonne CO₂',
    glossaryTitle: 'Glossary',
    gBlock: 'A period during which a line or section is closed to traffic so that maintenance can be done.',
    gJpo: 'Joint Procedure Order: the rules departments and Control follow to request, concur, grant and clear a block.',
    gT409: 'Caution order handed to loco pilots for speed restrictions in force (T/409B for restrictions from a block).',
    gT351: 'Disconnection notice for signalling gear taken out of use during S&T work.',
    gTsr: 'Temporary speed restriction imposed on a stretch of track.',
    gSlw: 'Single-line working: trains of both directions use the line that stays open.',
    gUsfd: 'Ultrasonic flaw detection; IMR is the class of flaw to be removed immediately.',
    gTgi: 'Track geometry index from the track recording car.',
    gOhe: 'Overhead equipment; an elementary section is the smallest part that can be isolated.',
    gArci: 'Asset Risk & Criticality Index — the priority score above.',
    gRbp: 'Rolling Block Programme: the 26-week plan of large works with notice to operating.',
    gBdms: 'Block Demand Management System: the demand format the plan is exported in.',
    gCoa: 'Control Office Application: the controller’s charting and timetable system.',
    gFois: 'Freight Operations Information System.',
    gMps: 'Maximum permissible speed of the section.',
    toursTitle: 'Tours',
    toursSub: 'Walk through a portal. The tour opens its landing page.',
    startTour: 'Start tour: {portal}',
    keysTitle: 'Keyboard shortcuts',
    kPalette: 'Open the command palette',
    kEscape: 'Close drawers, menus and dialogs',
  },
  hi: {
    title: 'पद्धति और प्रमाण',
    lede: 'SAMANVAY का हर आँकड़ा कैसे गणित होता है, क्या सिम्युलेटेड है, और यह रन SIH 2026 डेक के आँकड़ों से कैसे तुलना करता है।',
    copyCitation: 'उद्धरण कॉपी करें',
    copied: 'उद्धरण कॉपी हुआ',
    copyFailed: 'कॉपी नहीं हो सका — क्लिपबोर्ड उपलब्ध नहीं',
    openPage: 'पेज खोलें',
    openWork: 'कार्य खोलें',
    problemTitle: 'समस्या',
    problemBody: 'PS 26027 स्वचालित ब्लॉक योजना माँगता है: सिविल (TMS), सिग्नल व दूरसंचार (SMMS) और कर्षण (TDMS) की अनुरक्षण माँगें प्रति मंडल एक योजना में, कार्यकारी समय-सारणी के प्राकृतिक अंतरालों में, जोखिम के क्रम में, अनुभाग नियंत्रक द्वारा जाँची हुई और BDMS माँग प्रारूप में सौंपी हुई। आज हर विभाग अपना पज़ेशन अलग माँगता है; एक ही सेक्शन सप्ताह में कई बार बंद होता है और हर बार ट्रेनें नियंत्रित होती हैं।',
    dataTitle: 'इनपुट डेटा',
    dataSub: 'इस रन में पढ़े गए फ़ीड। सभी योजना वर्कर में बने सीडेड, मूल-स्कीमा डेटा हैं।',
    dCoa: 'COA कार्यकारी समय-सारणी पाथ',
    dFois: 'FOIS मालगाड़ी पाथ (पूर्वानुमान)',
    dTms: 'TMS ट्रैक रिकॉर्ड',
    dSmms: 'SMMS सिग्नलिंग रिकॉर्ड',
    dTdms: 'TDMS OHE रिकॉर्ड',
    dMachines: 'ट्रैक मशीनें',
    dCrews: 'गैंग और यूनिट',
    dExec: 'निष्पादन इतिहास प्रविष्टियाँ',
    dFail: 'विफलता इतिहास रिकॉर्ड',
    dEsc: 'एस्केलेशन इतिहास रिकॉर्ड',
    normTitle: 'नॉर्मलाइज़र',
    normSub: 'TMS लाइन व km से, SMMS स्टेशन यार्ड व गियर आईडी से, TDMS मास्ट संख्या व एलिमेंटरी सेक्शन से स्थान बताता है। हर रिकॉर्ड एक कॉरिडोर ग्राफ़ पर मैप होता है।',
    nStations: 'स्टेशन',
    nSections: 'ब्लॉक सेक्शन',
    nOhe: 'OHE एलिमेंटरी सेक्शन',
    nMapped: 'कार्यों में मैप रिकॉर्ड',
    nRejected: 'अस्वीकृत रिकॉर्ड',
    nIssues: 'उठाई गई डेटा-गुणवत्ता समस्याएँ',
    nPairs: 'मिले सह-स्थान जोड़े',
    nTasks: 'इस योजना में कार्य (इंजेक्ट सहित)',
    arciTitle: 'ARCI — परिसंपत्ति जोखिम व गंभीरता सूचकांक',
    arciSub: 'हर कार्य एक व्याख्येय स्कोर से रैंक होता है; अनिवार्य सुरक्षा कार्य फ़्लोर होकर पहले रखे जाते हैं।',
    arciFormula: 'ARCI = clamp01( √S × (0.30·Pf′ + 0.25·ODI + 0.25·Odue + 0.20·Eml) + TSR uplift )',
    arciTerms: 'Pf′ 30-दिन की Weibull विफलता संभावना और मापे गए स्थिति सूचकांक का मिश्रण है; ODI सेक्शन पर श्रेणी-भारित यातायात और गति-प्रतिबंध हानि है; Odue वैधानिक अंतराल से अधिक देरी का दंड है; Eml दोष के सख़्त TSR तक बढ़ने की लॉजिस्टिक संभावना है; S कार्य प्रकार की सुरक्षा गंभीरता है। सुरक्षा ≥ 0.95 वाला देय कार्य, या जिस पर TSR लागू है, 0.92 पर फ़्लोर होता है।',
    arciBands: 'इस इंजन के बैंड',
    arciTop: 'इस रन का सर्वोच्च-रैंक कार्य',
    colTerm: 'पद',
    colValue: 'मान',
    colWeight: 'भार',
    colWhy: 'व्याख्या',
    optTitle: 'ऑप्टिमाइज़र',
    optSub: 'मुक्त समय-सारणी खिड़कियों में संभावित पज़ेशन पर एक सटीक MILP (JPO नियम, मशीन व गैंग क्षमता, माँग-पत्र क्रम और स्वीकृत block कठोर बाधाओं के रूप में; एक भारित उद्देश्य) ब्राउज़र में HiGHS (WebAssembly) से हल होता है; फिर सिम्युलेटेड एनीलिंग कार्यों को खिसकाती और बंडल करती है। HiGHS लोड न हो तो ग्रीडी निर्माण + एनीलिंग चलता है। उत्पादन लक्ष्य OR-Tools CP-SAT है। सूत्रीकरण: docs/MILP-FORMULATION.md। नीचे इस रन के नियम, भार और खोज आँकड़े हैं।',
    solverRunTitle: 'इस रन का सॉल्वर',
    rulesTitle: 'लागू नियम',
    rMax: 'सबसे लंबा पज़ेशन',
    rMin: 'सबसे छोटा पज़ेशन',
    rHeadway: 'हेडवे मार्जिन',
    rSlw: 'सिंगल-लाइन वर्किंग दंड',
    rPerDay: 'प्रति दिन पज़ेशन',
    rConcurrent: 'एक साथ पज़ेशन',
    rNotice: 'नियंत्रण हेतु JPO नोटिस',
    rPremium: 'प्रीमियम पाथ ब्लॉक हो सकते हैं',
    weeksN: '{n} सप्ताह',
    yes: 'हाँ',
    no: 'नहीं',
    weightsTitle: 'उद्देश्य भार',
    wDelay: 'श्रेणी-भारित विलंब',
    wDowntime: 'लाइन बंदी',
    wRisk: 'अनियोजित जोखिम',
    wColocation: 'सह-स्थान बोनस',
    wTsr: 'TSR ट्रेन-मिनट',
    wSpread: 'प्रति-ब्लॉक दंड',
    wPreference: 'माँग-पत्र प्राथमिकता (प्रति दिन दूरी)',
    searchTitle: 'इस रन की खोज',
    sIterations: 'पुनरावृत्तियाँ',
    sImprovements: 'स्वीकृत सुधार',
    sCost: 'लागत: निर्माण → एनीलिंग के बाद',
    sTime: 'सॉल्वर समय',
    kpiTitle: 'यह सप्ताह: योजना बनाम सिम्युलेटेड आधार-रेखा',
    colMetric: 'मापदंड',
    colPlan: 'योजना',
    colBaseline: 'आधार-रेखा',
    colDelta: 'अंतर',
    kAvail: 'कॉरिडोर उपलब्धता',
    kHours: 'पज़ेशन घंटे',
    kBlocks: 'पज़ेशन',
    kColoc: 'लाइन-बंदी कार्यों का सह-स्थान',
    kMand: 'समय पर अनिवार्य कार्य',
    kDelay: 'श्रेणी-भारित ट्रेन विलंब (मिनट)',
    kTsr: 'TSR ट्रेन-मिनट',
    ctrlTitle: 'नियंत्रक सत्यापन',
    ctrlBody: 'ऑप्टिमाइज़र का कोई प्रस्ताव तब तक पज़ेशन नहीं बनता जब तक विभाग सहमति न दें और अनुभाग नियंत्रक उसे प्रदान न करे। नियंत्रण बदली खिड़की के साथ प्रदान कर सकता है (समय-सारणी और JPO नियमों पर फिर जाँचा जाता है), कारण सहित मना कर सकता है, अगला दिन COA समय-सारणी में लॉक कर सकता है, और विफलता के बाद शुरू हुए ब्लॉक स्थिर रखकर शेष दिन की पुनः योजना बना सकता है।',
    formsTitle: 'बने फ़ॉर्म',
    formsSub: 'कार्यकारी योजना और TSR रजिस्टर से व्युत्पन्न; मुद्रित प्रतियों पर अनौपचारिक वॉटरमार्क होता है।',
    fT409: 'पहले योजना दिन के सतर्कता आदेश (T/409, T/409B)',
    fT351: 'इस सप्ताह डिस्कनेक्शन सूचनाएँ (T/351)',
    fBdms: 'BDMS माँग पेलोड में पज़ेशन',
    simTitle: 'क्या सिम्युलेटेड है',
    simSub: 'स्क्रीन पर बाकी सब इन्हीं इनपुट से गणित होता है या उपयोगकर्ता कार्रवाई से दर्ज होता है।',
    colItem: 'मद',
    colWhat: 'क्या सिम्युलेटेड है',
    colLabel: 'लेबल',
    s1: 'COA समय-सारणी और FOIS मालगाड़ी पूर्वानुमान',
    s1d: 'कॉरिडोर ज्यामिति और श्रेणी मिश्रण से बने ट्रेन पाथ।',
    s2: 'TMS, SMMS और TDMS रजिस्टर',
    s2d: 'हर प्रणाली के मूल फ़ील्ड में दोष और देय अनुरक्षण रिकॉर्ड।',
    s3: 'मशीनें और गैंग',
    s3d: 'बेड़ा, होम स्टेशन, पहुँच, संख्या और अनुपलब्धता।',
    s4: 'विफलता और एस्केलेशन इतिहास',
    s4d: 'Weibull फ़िट और एस्केलेशन मॉडल का प्रशिक्षण डेटा।',
    s5: 'आज से पहले का निष्पादन इतिहास',
    s5d: 'नियोजित बनाम वास्तविक मिनट जो कार्य अवधि को कैलिब्रेट करते हैं।',
    s6: 'विकेंद्रीकृत आधार-रेखा',
    s6d: 'हर विभाग उसी seed पर पहले-आओ-पहले-पाओ से अपने पज़ेशन बुक करता है।',
    s7: 'ट्रेन स्थितियाँ',
    s7d: 'चुने गए मिनट पर कार्यकारी समय-सारणी से अंतर्वेशित।',
    s8: 'नियंत्रण घड़ी',
    s8d: 'बोर्ड पर स्क्रबर का मिनट, वास्तविक समय नहीं।',
    s9: '₹ इकाई दरें',
    s9d: 'ROI ऑडिट में प्रयुक्त संपादन-योग्य इकाई मान।',
    s10: 'खाते',
    s10d: 'इस ब्राउज़र में रखे डेमो खाते।',
    s11: 'मुद्रित फ़ॉर्म',
    s11d: 'T/409, T/409B और T/351 हस्ताक्षर तक मसौदा हैं।',
    modelsTitle: 'मॉडल मापदंड',
    modelsSub: 'हर योजना रन पर सीडेड इतिहास पर फ़िट। जाँच के लिए सीडेड सत्य दिखाया गया है।',
    colClass: 'परिसंपत्ति वर्ग',
    colBeta: 'β (आकार)',
    colEta: 'η (दिन)',
    colFail: 'विफलताएँ / n',
    colCens: 'सेंसर्ड',
    colB10: 'B10 आयु (दिन)',
    colTruth: 'सीडेड सत्य β / η',
    logTitle: 'एस्केलेशन मॉडल (लॉजिस्टिक रिग्रेशन, अलग परीक्षण भाग)',
    mAuc: 'AUC',
    mPrecision: 'प्रिसिज़न',
    mRecall: 'रिकॉल',
    mAccuracy: 'शुद्धता',
    mTrain: 'प्रशिक्षण रिकॉर्ड',
    mTest: 'परीक्षण रिकॉर्ड',
    targetsTitle: 'इस seed पर गणना बनाम लक्ष्य / साहित्य',
    targetsSub: 'दाहिना स्तंभ SIH 2026 डेक से उद्धृत है। बीच का स्तंभ वह है जो यह रन सिम्युलेटेड आधार-रेखा के विरुद्ध गणित करता है।',
    colDeck: 'डेक मापदंड',
    colComputed: 'इस seed पर गणना',
    colTarget: 'लक्ष्य / साहित्य',
    tUptime: 'संभावित परिसंपत्ति अपटाइम सुधार',
    tUptimeM: 'कॉरिडोर उपलब्धता, आधार-रेखा से सापेक्ष परिवर्तन ({plan} बनाम {base})',
    tDowntime: 'संभावित कॉरिडोर बंदी में कमी',
    tDowntimeM: 'बंद सेक्शन-लाइन घंटे, आधार-रेखा से परिवर्तन ({plan} घं. बनाम {base} घं.)',
    tColoc: 'बहु-विभागीय कार्य सह-स्थान',
    tColocM: 'संयुक्त ब्लॉक में रखे लाइन-बंदी कार्यों का अंश ({total} में से {n} ब्लॉक संयुक्त)',
    tPlanCost: 'कम अनुरक्षण योजना लागत',
    tPlanCostM: 'मॉडल नहीं — योजना-लागत मॉडल नहीं है। निकटतम गणित मात्रा: व्यवस्थित किए जाने वाले पज़ेशन, आधार-रेखा से {v}।',
    tMaintCost: 'कुल अनुरक्षण लागत में कमी',
    tMaintCostM: 'मॉडल नहीं — अनुरक्षण-लागत मॉडल नहीं है। निकटतम गणित मात्रा: पज़ेशन घंटे, आधार-रेखा से {v}।',
    notModelled: 'मॉडल नहीं',
    tUptimeV: '+18.8 %',
    tDowntimeV: '−51.9 %',
    tColocV: '96.2 %',
    tPlanCostV: '11–17 %',
    tMaintCostV: '15 % तक',
    limitsTitle: 'सीमाएँ',
    l1: 'पूरी तरह ब्राउज़र में चलता है: कोई सर्वर नहीं, उपकरणों के बीच सिंक नहीं।',
    l2: 'फ़ीड सीडेड हैं; CRIS, COA, FOIS, BDMS या SCADA से कोई लाइव लिंक नहीं।',
    l3: 'सटीक सॉल्वर एक MILP है जिसे HiGHS ब्राउज़र में कुछ सेकंड में हल करता है, सिम्युलेटेड एनीलिंग सुधार और विकल्प के रूप में; सर्वर पर OR-Tools CP-SAT उत्पादन लक्ष्य है और यहाँ नहीं चलता। MILP हर कार्य की अधिकतम 20 संभावित खिड़कियाँ रखता है, इसलिए उसका इष्टतमता अंतर उसी समूह के लिए है।',
    l4: 'खाते ब्राउज़र-स्थानीय डेमो खाते हैं।',
    l5: 'उत्पाद में कहीं भी PNR, सीट, बर्थ या लाइव रनिंग स्थिति नहीं।',
    l6: 'कोपायलट नियम-आधारित है और अंग्रेज़ी में उत्तर देता है।',
    assumpTitle: 'मान्यताएँ',
    assumpSub: 'हर ₹ आँकड़े के पीछे के इकाई मान। ROI ऑडिट में संपादन-योग्य।',
    openAssumptions: 'मान्यताएँ खोलें',
    aDelayVb: 'प्रीमियम ट्रेन विलंब, प्रति मिनट',
    aDelayMail: 'मेल / एक्सप्रेस विलंब, प्रति मिनट',
    aDelayGoods: 'मालगाड़ी पाथ विलंब, प्रति मिनट',
    aLineHour: 'लाइन उपलब्धता, प्रति सेक्शन-घंटा',
    aDemurrage: 'मालभाड़ा डेमरेज, प्रति रेक-घंटा',
    aTsrEnergy: 'TSR कर्षण ऊर्जा, प्रति ट्रेन-मिनट',
    aSetup: 'मशीन सेट-अप, प्रति पज़ेशन',
    aCo2: 'प्रति TSR मिनट CO₂ (kg)',
    aCarbon: 'कार्बन क्रेडिट, प्रति टन CO₂',
    glossaryTitle: 'शब्दावली',
    gBlock: 'वह अवधि जब अनुरक्षण के लिए लाइन या सेक्शन यातायात हेतु बंद रहता है।',
    gJpo: 'संयुक्त प्रक्रिया आदेश: ब्लॉक माँगने, सहमति, प्रदान और क्लियर करने के नियम।',
    gT409: 'लागू गति प्रतिबंधों के लिए लोको पायलट को दिया जाने वाला सतर्कता आदेश (ब्लॉक से उत्पन्न प्रतिबंध हेतु T/409B)।',
    gT351: 'S&T कार्य के दौरान उपयोग से हटाए गए सिग्नलिंग उपकरण की डिस्कनेक्शन सूचना।',
    gTsr: 'ट्रैक के किसी हिस्से पर लगाया गया अस्थायी गति प्रतिबंध।',
    gSlw: 'सिंगल-लाइन वर्किंग: दोनों दिशाओं की ट्रेनें खुली लाइन का उपयोग करती हैं।',
    gUsfd: 'अल्ट्रासोनिक दोष पहचान; IMR वह दोष श्रेणी है जिसे तुरंत हटाना होता है।',
    gTgi: 'ट्रैक रिकॉर्डिंग कार से ट्रैक ज्यामिति सूचकांक।',
    gOhe: 'ओवरहेड उपकरण; एलिमेंटरी सेक्शन सबसे छोटा भाग है जिसे अलग किया जा सकता है।',
    gArci: 'परिसंपत्ति जोखिम व गंभीरता सूचकांक — ऊपर दिया प्राथमिकता स्कोर।',
    gRbp: 'रोलिंग ब्लॉक कार्यक्रम: परिचालन को नोटिस सहित बड़े कार्यों की 26-सप्ताह योजना।',
    gBdms: 'ब्लॉक डिमांड मैनेजमेंट सिस्टम: वह माँग प्रारूप जिसमें योजना निर्यात होती है।',
    gCoa: 'कंट्रोल ऑफ़िस एप्लिकेशन: नियंत्रक का चार्टिंग और समय-सारणी तंत्र।',
    gFois: 'फ़्रेट ऑपरेशंस इन्फ़ॉर्मेशन सिस्टम।',
    gMps: 'सेक्शन की अधिकतम अनुमेय गति।',
    toursTitle: 'टूर',
    toursSub: 'किसी पोर्टल का परिचय लें। टूर उसका मुख्य पेज खोलता है।',
    startTour: 'टूर शुरू करें: {portal}',
    keysTitle: 'कीबोर्ड शॉर्टकट',
    kPalette: 'कमांड पैलेट खोलें',
    kEscape: 'ड्रॉअर, मेनू और डायलॉग बंद करें',
  },
} as const;

type Key = keyof typeof strings.en;

const GLOSSARY: [string, Key][] = [
  ['Block / possession', 'gBlock'],
  ['JPO', 'gJpo'],
  ['T/409, T/409B', 'gT409'],
  ['T/351', 'gT351'],
  ['TSR', 'gTsr'],
  ['SLW', 'gSlw'],
  ['USFD IMR', 'gUsfd'],
  ['TGI', 'gTgi'],
  ['OHE, elementary section', 'gOhe'],
  ['ARCI', 'gArci'],
  ['RBP', 'gRbp'],
  ['BDMS', 'gBdms'],
  ['COA', 'gCoa'],
  ['FOIS', 'gFois'],
  ['MPS', 'gMps'],
];

const SIMULATED: { item: Key; what: Key; kind: SimKind; system?: string }[] = [
  { item: 's1', what: 's1d', kind: 'seededFeed', system: 'COA / FOIS' },
  { item: 's2', what: 's2d', kind: 'seededFeed', system: 'TMS / SMMS / TDMS' },
  { item: 's3', what: 's3d', kind: 'seededFeed', system: 'machine and gang' },
  { item: 's4', what: 's4d', kind: 'model' },
  { item: 's5', what: 's5d', kind: 'seededRecords' },
  { item: 's6', what: 's6d', kind: 'baseline' },
  { item: 's7', what: 's7d', kind: 'wttPositions' },
  { item: 's8', what: 's8d', kind: 'simClock' },
  { item: 's9', what: 's9d', kind: 'assumption' },
  { item: 's10', what: 's10d', kind: 'localAuth' },
  { item: 's11', what: 's11d', kind: 'notOfficial' },
];

const ASSUMPTION_KEYS: { key: keyof RoiAssumptions; label: Key; rupee: boolean }[] = [
  { key: 'delayPerMinuteVb', label: 'aDelayVb', rupee: true },
  { key: 'delayPerMinuteMailExp', label: 'aDelayMail', rupee: true },
  { key: 'delayPerMinuteGoods', label: 'aDelayGoods', rupee: true },
  { key: 'lineHourOpportunity', label: 'aLineHour', rupee: true },
  { key: 'freightDemurragePerHour', label: 'aDemurrage', rupee: true },
  { key: 'tsrEnergyPerTrainMin', label: 'aTsrEnergy', rupee: true },
  { key: 'machineSetupPerBlock', label: 'aSetup', rupee: true },
  { key: 'co2KgPerTsrMin', label: 'aCo2', rupee: false },
  { key: 'carbonCreditPerTon', label: 'aCarbon', rupee: true },
];

/** Signed relative change, e.g. "+3.4 %" / "−12.0 %"; null when the base is zero. */
function relChange(plan: number, base: number): string | null {
  if (!base) return null;
  const v = (plan - base) / base;
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${Math.abs(v * 100).toFixed(1)} %`;
}

function signedNum(v: number, digits = 1): string {
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${num(Math.abs(v), digits)}`;
}

interface TargetRow {
  id: string;
  metric: Key;
  computed: string | null;
  measure: string;
  target: Key;
}

interface KpiRow {
  id: string;
  metric: Key;
  plan: string;
  base: string;
  delta: string;
}

type WeibullRow = WeibullFit & { cls: string };

export default function MethodPage() {
  const t = useT(strings);
  const tc = useT(common);
  const lang = useLang();
  const nav = useNavigate();
  const portal = usePortal();
  const drawer = useDrawerParams();

  const snapshot = useAppStore((s) => s.snapshot);
  const user = useAppStore((s) => s.user);
  const approvals = useAppStore((s) => s.approvals);
  const tsrs = useAppStore((s) => s.tsrs);
  const forms = useAppStore((s) => s.forms);
  const planVersion = useAppStore((s) => s.planVersion);
  const lastPlannedAt = useAppStore((s) => s.lastPlannedAt);
  const roiAssumptions = useAppStore((s) => s.roiAssumptions);
  const markTourDone = useAppStore((s) => s.markTourDone);
  const toast = useAppStore((s) => s.toast);

  const blocks = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals]);
  const formCounts = useMemo(() => {
    if (!snapshot) return null;
    return { t409: cautionOrders(snapshot, blocks, tsrs, forms, 0).length, t351: disconnectionNoticesWeek(snapshot, blocks, forms).length };
  }, [snapshot, blocks, tsrs, forms]);

  const topTask = useMemo(() => (snapshot ? [...snapshot.tasks].sort((a, b) => b.risk.arci - a.risk.arci)[0] ?? null : null), [snapshot]);

  const targets: TargetRow[] = useMemo(() => {
    if (!snapshot) return [];
    const k = snapshot.result.weekly.kpis;
    const b = snapshot.result.weekly.baseKpis;
    return [
      { id: 'uptime', metric: 'tUptime', computed: relChange(k.availability, b.availability), measure: t('tUptimeM', { plan: pct(k.availability, 2), base: pct(b.availability, 2) }), target: 'tUptimeV' },
      { id: 'downtime', metric: 'tDowntime', computed: relChange(k.sectionLineHoursLost, b.sectionLineHoursLost), measure: t('tDowntimeM', { plan: num(k.sectionLineHoursLost, 1), base: num(b.sectionLineHoursLost, 1) }), target: 'tDowntimeV' },
      { id: 'coloc', metric: 'tColoc', computed: pct(k.colocationRate, 1), measure: t('tColocM', { n: k.coLocatedBlocks, total: k.blockCount }), target: 'tColocV' },
      { id: 'planCost', metric: 'tPlanCost', computed: null, measure: t('tPlanCostM', { v: relChange(k.blockCount, b.blockCount) ?? '—' }), target: 'tPlanCostV' },
      { id: 'maintCost', metric: 'tMaintCost', computed: null, measure: t('tMaintCostM', { v: relChange(k.totalBlockHours, b.totalBlockHours) ?? '—' }), target: 'tMaintCostV' },
    ];
  }, [snapshot, t]);

  const kpiRows: KpiRow[] = useMemo(() => {
    if (!snapshot) return [];
    const k = snapshot.result.weekly.kpis;
    const b = snapshot.result.weekly.baseKpis;
    const d = snapshot.result.weekly.delta;
    return [
      { id: 'avail', metric: 'kAvail', plan: pct(k.availability, 2), base: pct(b.availability, 2), delta: `${signedNum(d.availabilityPoints, 2)} pts` },
      { id: 'hours', metric: 'kHours', plan: num(k.totalBlockHours, 1), base: num(b.totalBlockHours, 1), delta: signedNum(d.blockHoursDelta, 1) },
      { id: 'blocks', metric: 'kBlocks', plan: num(k.blockCount), base: num(b.blockCount), delta: signedNum(k.blockCount - b.blockCount, 0) },
      { id: 'coloc', metric: 'kColoc', plan: pct(k.colocationRate, 1), base: pct(b.colocationRate, 1), delta: `${signedNum(d.colocationRateDelta * 100, 1)} pts` },
      { id: 'mand', metric: 'kMand', plan: `${k.mandatoryCompliant} / ${k.mandatoryTotal}`, base: `${b.mandatoryCompliant} / ${b.mandatoryTotal}`, delta: signedNum(k.mandatoryCompliant - b.mandatoryCompliant, 0) },
      { id: 'delay', metric: 'kDelay', plan: num(k.weightedDelayMin, 0), base: num(b.weightedDelayMin, 0), delta: relChange(k.weightedDelayMin, b.weightedDelayMin) ?? signedNum(d.weightedDelayDelta, 0) },
      { id: 'tsr', metric: 'kTsr', plan: num(k.tsrTrainMinutes, 0), base: num(b.tsrTrainMinutes, 0), delta: signedNum(d.tsrTrainMinutesDelta, 0) },
    ];
  }, [snapshot]);

  const weibullRows: WeibullRow[] = useMemo(() => (snapshot ? Object.entries(snapshot.models.weibull).map(([cls, w]) => ({ ...w, cls })) : []), [snapshot]);

  /* ── helpers ─────────────────────────────────────────────── */
  const canOpen = (route: string) => {
    if (route.startsWith('/citizen')) return true;
    if (!user) return false;
    const p = route.split('/')[2];
    return p === user.portal || user.role === 'DRM' || user.role === 'ADMIN';
  };
  const firstOpenable = (routes: string[]) => routes.find(canOpen) ?? null;
  const openLink = (routes: string[]) => {
    const r = firstOpenable(routes);
    if (!r) return null;
    return (
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => nav(r)}>
        <ExternalLink /> {t('openPage')}
      </button>
    );
  };

  const citation = `SAMANVAY — integrated block planning for Indian Railways. Smart India Hackathon 2026, problem statement 26027.${snapshot ? ` Plan for ${snapshot.corridor.name}, seed ${SEED}, run ${planVersion}${lastPlannedAt ? `, computed ${new Date(lastPlannedAt).toLocaleString('en-IN')}` : ''}.` : ''}`;
  const copyCitation = async () => {
    const ok = await copyText(citation);
    toast({ title: ok ? t('copied') : t('copyFailed'), body: ok ? citation : undefined, tone: ok ? 'ok' : 'warn' });
  };

  const tourPortals: PortalId[] = PORTAL_ORDER.filter((p) => TOUR_STEPS[p] && (p === 'citizen' || canOpen(PORTALS[p].landing)));
  const runTour = (p: PortalId) => {
    const steps = TOUR_STEPS[p]?.[lang === 'hi' ? 'hi' : 'en'];
    if (!steps?.length) return;
    // mark first so the shell's first-run tour does not start a second copy
    markTourDone(p);
    startTour(steps, {
      navigate: (r) => nav(r),
      onDone: () => markTourDone(p),
      labels: lang === 'hi' ? { next: 'आगे', prev: 'वापस', done: 'पूर्ण', progress: '{{current}} / {{total}}' } : { next: 'Next', prev: 'Back', done: 'Done', progress: '{{current}} of {{total}}' },
    });
  };

  /* ── columns ─────────────────────────────────────────────── */
  const termCols: Column<RiskExplanation>[] = [
    { key: 'label', header: t('colTerm'), render: (e) => <span className="small strong">{e.label}</span> },
    { key: 'value', header: t('colValue'), num: true, render: (e) => <span className="num">{e.value.toFixed(2)}</span> },
    { key: 'weight', header: t('colWeight'), num: true, render: (e) => <span className="num">{e.weight === null ? '—' : e.weight.toFixed(2)}</span> },
    { key: 'text', header: t('colWhy'), render: (e) => <span className="small muted">{e.text}</span>, hideMobile: true },
  ];
  const kpiCols: Column<KpiRow>[] = [
    { key: 'metric', header: t('colMetric'), render: (r) => t(r.metric) },
    { key: 'plan', header: t('colPlan'), num: true, render: (r) => <span className="num strong">{r.plan}</span> },
    { key: 'base', header: t('colBaseline'), num: true, render: (r) => <span className="num muted">{r.base}</span> },
    { key: 'delta', header: t('colDelta'), num: true, render: (r) => <span className="num">{r.delta}</span> },
  ];
  const simCols: Column<(typeof SIMULATED)[number]>[] = [
    { key: 'item', header: t('colItem'), render: (r) => <span className="strong small">{t(r.item)}</span> },
    { key: 'what', header: t('colWhat'), render: (r) => <span className="small">{t(r.what)}</span> },
    { key: 'label', header: t('colLabel'), render: (r) => <SimLabel kind={r.kind} system={r.system} seed={r.kind === 'seededFeed' ? SEED : undefined} source={r.kind === 'assumption' ? 'ROI audit' : undefined} /> },
  ];
  const weibullCols: Column<WeibullRow>[] = [
    { key: 'cls', header: t('colClass'), render: (w) => (<div><div className="small strong">{w.label}</div><div className="tiny muted mono">{w.cls}</div></div>) },
    { key: 'beta', header: t('colBeta'), num: true, render: (w) => <span className="num">{w.beta.toFixed(2)}</span> },
    { key: 'eta', header: t('colEta'), num: true, render: (w) => <span className="num">{num(w.eta, 0)}</span> },
    { key: 'n', header: t('colFail'), num: true, render: (w) => <span className="num">{w.failures} / {w.n}</span> },
    { key: 'cens', header: t('colCens'), num: true, render: (w) => <span className="num">{w.n - w.failures}</span>, hideMobile: true },
    { key: 'b10', header: t('colB10'), num: true, render: (w) => <span className="num">{num(w.b10Days, 0)}</span>, hideMobile: true },
    { key: 'truth', header: t('colTruth'), num: true, render: (w) => <span className="num muted">{w.truth ? `${w.truth.beta} / ${num(w.truth.eta, 0)}` : '—'}</span>, hideMobile: true },
  ];
  const targetCols: Column<TargetRow>[] = [
    { key: 'metric', header: t('colDeck'), render: (r) => <span className="strong small">{t(r.metric)}</span> },
    {
      key: 'computed',
      header: t('colComputed'),
      render: (r) => (
        <div className="stack" style={{ gap: 2 }}>
          <span className={r.computed ? 'num strong' : 'muted small'}>{r.computed ?? t('notModelled')}</span>
          <span className="tiny muted">{r.measure}</span>
        </div>
      ),
    },
    {
      key: 'target',
      header: t('colTarget'),
      render: (r) => (
        <div className="row-wrap">
          <span className="num strong">{t(r.target)}</span>
          <SourceLabel />
        </div>
      ),
    },
  ];

  /* ── cards ───────────────────────────────────────────────── */
  const problemCard = (
    <Card>
      <CardHead title={t('problemTitle')} />
      <CardBody>
        <p className="small" style={{ margin: 0, lineHeight: 1.6 }}>{t('problemBody')}</p>
      </CardBody>
    </Card>
  );

  const controllerCard = (
    <Card>
      <CardHead title={t('ctrlTitle')} right={openLink(['/app/control/board'])} />
      <CardBody>
        <p className="small" style={{ margin: 0, lineHeight: 1.6 }}>{t('ctrlBody')}</p>
      </CardBody>
    </Card>
  );

  const simulatedCard = (
    <Card>
      <CardHead title={t('simTitle')} sub={t('simSub')} />
      <CardBody flush>
        <DataTable columns={simCols} rows={SIMULATED} rowKey={(r) => r.item} compact />
      </CardBody>
    </Card>
  );

  const planCards = snapshot ? (
    (() => {
      const f = snapshot.feeds;
      const c = snapshot.corridor;
      const w = snapshot.result.weekly;
      const rules = snapshot.result.rules;
      const weights = snapshot.result.weights;
      const search = w.ai.search;
      const esc = snapshot.models.escalationMetrics;
      const failures = Object.values(f.failureHistoryCounts).reduce((a, b) => a + b, 0);
      const seeded = (system: string) => <SimLabel kind="seededFeed" system={system} seed={SEED} short />;
      return (
        <>
          <div className="grid grid-2">
            <Card>
              <CardHead title={t('dataTitle')} sub={t('dataSub')} right={openLink(['/app/planning/integration', '/app/division/feeds'])} />
              <CardBody>
                <KeyValue
                  items={[
                    [t('dCoa'), <span key="coa" className="row-wrap"><span className="num">{num(f.timetable.length)}</span>{seeded('COA')}</span>],
                    [t('dFois'), <span key="fois" className="row-wrap"><span className="num">{num(f.freight.length)}</span>{seeded('FOIS')}</span>],
                    [t('dTms'), <span key="tms" className="row-wrap"><span className="num">{num(f.tms.length)}</span>{seeded('TMS')}</span>],
                    [t('dSmms'), <span key="smms" className="row-wrap"><span className="num">{num(f.smms.length)}</span>{seeded('SMMS')}</span>],
                    [t('dTdms'), <span key="tdms" className="row-wrap"><span className="num">{num(f.tdms.length)}</span>{seeded('TDMS')}</span>],
                    [t('dMachines'), <span key="mc" className="num">{num(f.machines.length)}</span>],
                    [t('dCrews'), <span key="cr" className="num">{num(f.crews.length)}</span>],
                    [t('dExec'), <span key="ex" className="num">{num(f.executionLog.length)}</span>],
                    [t('dFail'), <span key="fl" className="num">{num(failures)}</span>],
                    [t('dEsc'), <span key="es" className="num">{num(f.escalationHistoryCount)}</span>],
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHead title={t('normTitle')} sub={t('normSub')} />
              <CardBody>
                <KeyValue
                  items={[
                    [t('nStations'), <span key="st" className="num">{c.stations.length}</span>],
                    [t('nSections'), <span key="bs" className="num">{c.blockSections.length}</span>],
                    [t('nOhe'), <span key="oh" className="num">{c.oheSections.length}</span>],
                    [t('nMapped'), <span key="mp" className="num">{num(snapshot.counts.total)}</span>],
                    [t('nRejected'), <span key="rj" className="num">{num(snapshot.counts.rejected)}</span>],
                    [t('nIssues'), <span key="is" className="num">{num(snapshot.issues.length)}</span>],
                    [t('nPairs'), <span key="pr" className="num">{num(snapshot.pairs.length)}</span>],
                    [t('nTasks'), <span key="tk" className="num">{num(snapshot.tasks.length)}</span>],
                  ]}
                />
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHead title={t('arciTitle')} sub={t('arciSub')} right={<><SimLabel kind="model" />{openLink(['/app/planning/risk'])}</>} />
            <CardBody>
              <div className="stack">
                <div className="well mono small" style={{ overflowX: 'auto', whiteSpace: 'nowrap' }}>{t('arciFormula')}</div>
                <p className="small muted" style={{ margin: 0, lineHeight: 1.6 }}>{t('arciTerms')}</p>
                <div className="row-wrap small">
                  <span className="muted">{t('arciBands')}:</span>
                  {URGENCY.map((u) => (
                    <span key={u.key} className="badge badge-outline">{tc(u.key.toLowerCase() as 'immediate' | 'high' | 'tactical' | 'strategic')} · ARCI ≥ {u.min.toFixed(2)}</span>
                  ))}
                </div>
                {topTask && (
                  <div className="stack">
                    <div className="row-between">
                      <div>
                        <div className="caps">{t('arciTop')}</div>
                        <div className="strong">{topTask.label}</div>
                        <div className="tiny muted mono">{topTask.id} · {topTask.sectionLabel} · {topTask.line}</div>
                      </div>
                      <div className="row">
                        <ArciBar value={topTask.risk.arci} mandatory={topTask.risk.mandatory} />
                        <button type="button" className="btn btn-sm" onClick={() => drawer.open('task', topTask.id)}>{t('openWork')}</button>
                      </div>
                    </div>
                    <DataTable columns={termCols} rows={topTask.risk.explanation} rowKey={(e) => e.key} compact />
                  </div>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHead title={t('optTitle')} sub={t('optSub')} right={<><SimLabel kind="solver" />{openLink(['/app/planning/optimiser'])}</>} />
            <CardBody>
              <div className="stack-lg">
                <div className="grid grid-3">
                  <div>
                    <div className="section-title">{t('rulesTitle')}</div>
                    <KeyValue
                      items={[
                        [t('rMax'), duration(rules.maxBlockMin)],
                        [t('rMin'), duration(rules.minBlockMin)],
                        [t('rHeadway'), duration(rules.headwayMarginMin)],
                        [t('rSlw'), duration(rules.slwDelayMin)],
                        [t('rPerDay'), rules.maxBlocksPerDay],
                        [t('rConcurrent'), rules.maxConcurrentBlocks],
                        [t('rNotice'), t('weeksN', { n: rules.noticeWeeksForRegulation })],
                        [t('rPremium'), rules.premiumConflictHard ? t('no') : t('yes')],
                      ]}
                    />
                  </div>
                  <div>
                    <div className="section-title">{t('weightsTitle')}</div>
                    <KeyValue
                      items={[
                        [t('wDelay'), num(weights.delay, 2)],
                        [t('wDowntime'), num(weights.downtime, 2)],
                        [t('wRisk'), num(weights.risk, 0)],
                        [t('wColocation'), num(weights.colocation, 0)],
                        [t('wTsr'), num(weights.tsr, 2)],
                        [t('wSpread'), num(weights.spread, 0)],
                        ...(typeof weights.preference === 'number' ? ([[t('wPreference'), num(weights.preference, 0)]] as [string, string][]) : []),
                      ]}
                    />
                  </div>
                  <div>
                    <div className="section-title">{t('searchTitle')}</div>
                    <KeyValue
                      items={[
                        [t('sIterations'), num(search.iterations)],
                        [t('sImprovements'), num(search.improvements)],
                        [t('sCost'), `${num(search.greedyCost, 0)} → ${num(search.finalCost, 0)}`],
                        [t('sTime'), `${(search.timeMs / 1000).toFixed(2)} s`],
                      ]}
                    />
                  </div>
                </div>
                <div data-tour="method-solver">
                  <div className="section-title">{t('solverRunTitle')}</div>
                  <SolverDetails plan={w.ai} />
                </div>
                <div>
                  <div className="row-between mb">
                    <div className="section-title" style={{ marginBottom: 0 }}>{t('kpiTitle')}</div>
                    <SimLabel kind="baseline" />
                  </div>
                  <DataTable columns={kpiCols} rows={kpiRows} rowKey={(r) => r.id} compact />
                </div>
              </div>
            </CardBody>
          </Card>

          <div className="grid grid-2">
            {controllerCard}
            <Card>
              <CardHead title={t('formsTitle')} sub={t('formsSub')} right={openLink(['/app/control/caution', '/app/tms/caution', '/app/smms/disconnections', '/app/tdms/powerblocks'])} />
              <CardBody>
                <KeyValue
                  items={[
                    [t('fT409'), <span key="409" className="num">{formCounts ? formCounts.t409 : null}</span>],
                    [t('fT351'), <span key="351" className="num">{formCounts ? formCounts.t351 : null}</span>],
                    [t('fBdms'), <span key="bdms" className="num">{w.ai.blocks.length}</span>],
                  ]}
                />
              </CardBody>
            </Card>
          </div>

          {simulatedCard}

          <Card>
            <CardHead title={t('modelsTitle')} sub={t('modelsSub')} right={<SimLabel kind="model" />} />
            <CardBody flush>
              <DataTable columns={weibullCols} rows={weibullRows} rowKey={(w) => w.cls} compact />
            </CardBody>
            <CardBody>
              <div className="section-title">{t('logTitle')}</div>
              <KeyValue
                items={[
                  [t('mAuc'), <span key="auc" className="num">{esc.test.auc.toFixed(3)}</span>],
                  [t('mPrecision'), <span key="pr" className="num">{esc.test.precision.toFixed(3)}</span>],
                  [t('mRecall'), <span key="rc" className="num">{esc.test.recall.toFixed(3)}</span>],
                  [t('mAccuracy'), <span key="ac" className="num">{esc.test.accuracy.toFixed(3)}</span>],
                  [t('mTrain'), <span key="tr" className="num">{num(esc.nTrain)}</span>],
                  [t('mTest'), <span key="te" className="num">{num(esc.nTest)}</span>],
                ]}
              />
            </CardBody>
          </Card>

          <Card tour="method-targets">
            <CardHead title={t('targetsTitle')} sub={t('targetsSub')} right={<><SimLabel kind="baseline" />{openLink(['/app/planning/overview', '/app/division/brief'])}</>} />
            <CardBody flush>
              <DataTable columns={targetCols} rows={targets} rowKey={(r) => r.id} />
            </CardBody>
          </Card>
        </>
      );
    })()
  ) : (
    <>
      <PlanPending />
      {controllerCard}
      {simulatedCard}
    </>
  );

  return (
    <div className="stack-lg" style={{ maxWidth: 1120, margin: '0 auto', width: '100%' }}>
      <PageHeader
        title={t('title')}
        lede={t('lede')}
        badges={snapshot ? <SeedStamp seed={SEED} runId={planVersion} iterations={snapshot.result.weekly.ai.search.iterations} ms={snapshot.timing.ms} /> : undefined}
        actions={
          <button type="button" className="btn btn-sm" onClick={() => void copyCitation()}>
            <Copy /> {t('copyCitation')}
          </button>
        }
      />

      {problemCard}
      {planCards}

      <div className="grid grid-2">
        <Card>
          <CardHead title={t('limitsTitle')} />
          <CardBody>
            <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              {(['l1', 'l2', 'l3', 'l4', 'l5', 'l6'] as const).map((k) => (
                <li key={k}>{t(k)}</li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHead
            title={t('assumpTitle')}
            sub={t('assumpSub')}
            right={
              canOpen('/app/division/roi') ? (
                <button type="button" className="btn btn-sm" onClick={() => nav('/app/division/roi')}>
                  <ExternalLink /> {t('openAssumptions')}
                </button>
              ) : (
                <SimLabel kind="assumption" source="ROI audit" />
              )
            }
          />
          <CardBody>
            <KeyValue items={ASSUMPTION_KEYS.map((a) => [t(a.label), <span key={a.key} className="num">{a.rupee ? rupees(roiAssumptions[a.key]) : num(roiAssumptions[a.key], 2)}</span>])} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHead title={t('glossaryTitle')} />
        <CardBody>
          <KeyValue items={GLOSSARY.map(([term, def]) => [<span key={term} className="strong">{term}</span>, t(def)])} />
        </CardBody>
      </Card>

      <div className="grid grid-2">
        <Card>
          <CardHead title={t('toursTitle')} sub={t('toursSub')} />
          <CardBody>
            <div className="row-wrap">
              {tourPortals.map((p) => (
                <button key={p} type="button" className="btn btn-sm" onClick={() => runTour(p)}>
                  <PlayCircle /> {t('startTour', { portal: PORTALS[p].short[lang === 'hi' ? 'hi' : 'en'] })}
                </button>
              ))}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHead title={t('keysTitle')} />
          <CardBody>
            <KeyValue
              items={[
                [<span key="k" className="row"><kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">K</kbd></span>, t('kPalette')],
                [<kbd key="e" className="kbd">Esc</kbd>, t('kEscape')],
              ]}
            />
          </CardBody>
        </Card>
      </div>

      <TaskDrawer taskId={drawer.taskId} onClose={() => drawer.close('task')} mode={portal === 'planning' ? 'full' : 'readOnly'} />
    </div>
  );
}
