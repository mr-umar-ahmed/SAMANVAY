/**
 * CopilotPage — plain-language questions about the current plan.
 *
 * The engine's rule-based router (askCopilot, src/engine/copilot.js) decides
 * what is being asked and computes the figures; the answer text is written
 * here from those figures, the snapshot and the working blocks, so every
 * number shown is computed. The router also receives the workflow records of
 * the store (approvals, requisitions, reports, extensions, execution log,
 * forms, power blocks, site messages, conflicts, possessions running late).
 *
 * The block suggestion, status and today's report answers follow the chosen
 * language (EN / HI); the older answers are in English. Passenger reservation
 * (PNR) questions are out of scope.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, RotateCcw, Send } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { usePortal } from '../../app/usePortal';
import type { PortalId } from '../../auth/portals';
import { askCopilot } from '../../engine/copilot.js';
import { blockStatusLabel, blocksRunningPastEnd, conflictsFor, workingBlocks, type WorkingBlock, type WorkflowState } from '../../engine/select';
import type { Snapshot, Task } from '../../engine/types';
import { useT } from '../../i18n';
import { addDaysIso, classLabel, dateLabel, duration, hhmm, nowMinuteIST, num, pct, rupees } from '../../lib/format';
import { Card, CardBody, PageHeader, PlanPending } from '../../components/ui';
import { SimLabel, type SimKind } from '../../components/ui/extras';
import { TaskDrawer } from '../../components/domain/TaskDrawer';
import { BlockDrawer } from '../../components/domain/BlockDrawer';
import { useDrawerParams } from '../../components/domain/useDrawerParams';

const strings = {
  en: {
    title: 'Copilot',
    lede: 'Questions about this week’s plan on {corridor}: suggest a block for a work, the status of a block, requisition or report, today’s report, why a work ranks where it does, what is planned on a day, which trains a block touches, TSRs in force, and the plan against the baseline.',
    clear: 'Clear conversation',
    placeholder: 'Ask about a work, a block, a requisition, a report or today…',
    send: 'Ask',
    you: 'You',
    copilot: 'Copilot',
    source: 'Computed from: {source}',
    note: 'Answers are built from the current plan by a rule-based router, not a language model. Block suggestions, status and today’s report follow the chosen language; the other answers are in English. Passenger reservation (PNR), seat and live running data are out of scope.',
    welcome: 'Ask a question below, or pick one of the suggestions. Every answer is computed from the plan and the records now on this device.',
    pSuggest: 'Suggest a block for {id}',
    pStatus: 'Status of {id}',
    pToday: 'Today’s report',
    pWhy: 'Why is the top-ranked work first?',
    pTomorrow: 'What blocks are planned tomorrow?',
    pBlock: 'Which trains does block {id} affect?',
    pTsr: 'Show TSRs in force',
    pBaseline: 'Compare the plan with the baseline',
    pTop: 'Top priority works',
    pMandatory: 'Explain the mandatory safety floor',
    openTask: 'Open {id}',
    openBlock: 'Open {id}',
    openReq: 'Open requisition {id}',
    openReport: 'Open report {id}',
    openRisk: 'Risk & priority',
    openWeekly: 'Weekly plan',
    openCaution: 'Caution & TSR',
    openOverview: 'Overview',
    openExecution: 'Execution log',
    openIncidents: 'Incidents',
    help: 'I did not match that to a plan question. Try one of these:\n• "Suggest a block for {task}" or "Find a window for tamping at km 120"\n• "Status of {block}", "Status of REQ-…" or "Where is HZ-…"\n• "Today’s report"\n• "Why is task {task} ranked where it is?"\n• "What blocks are planned on Thursday?"\n• "Which trains does block {block} affect?"\n• "Show TSRs in force"\n• "Compare the plan with the baseline"\n• "Top priority works"',
    srcRouter: 'question router',
    srcScope: 'scope of SAMANVAY',
    srcSolver: 'optimiser alternatives of the weekly plan',
    srcScan: 'free-window scan of the working timetable with the delay model',
    srcRegister: 'task register',
    srcRecords: 'workflow records on this device',
    srcToday: 'plan day 0, workflow records and the execution log',
    outOfScope: 'Passenger reservation (PNR) data is out of scope for SAMANVAY. It plans maintenance blocks and has no link to the reservation system.',
    lnBoth: 'both lines',
    lnOne: '{line} line',
    // suggest
    sgHead: '**{label}** ({id}) on **{section}**, {line}, {min} min of work{mand}.',
    sgMand: ', mandatory, due by {date}',
    sgNearest: 'Nearest of {n} works of type “{type}” to km {km} ({d} km away).',
    sgOnlyKm: 'The only work of type “{type}” ({d} km from km {km}).',
    sgTop: 'Highest-ARCI of {n} works of type “{type}”.',
    sgOnly: 'The only work of type “{type}”.',
    sgViaReq: 'The work of requisition {ref}.',
    sgViaReport: 'The work converted from report {ref}.',
    plPlaced: 'Now placed on **{date} {start}–{end}** ({line}){block}.',
    plInBlock: ' in block **{id}** ({state})',
    plOverride: 'Control changed the block window to {start}–{end}.',
    plDeferred: 'Not placed this week: {reason}.',
    plRolling: 'Capital work in the 26-week programme, {week}.',
    plNone: 'Not in this week’s plan.',
    sgSolverHead: '**Other windows the optimiser evaluated** (everything else in the plan held; best first):',
    sgAlt: '• {date} {start}–{end} {line}{scope}: trains {trains}, class-weighted delay {delay} train-min, premium paths {premium}{bad}',
    sgCost: ', plan cost {cost}',
    sgScopeBlock: ' (whole block moved)',
    sgInfeasible: ' — breaks a rule: {reason}',
    sgScanHead: 'The optimiser has no alternative windows for this work, so the working timetable was scanned: {days} days, {lines}, windows of {win} min ({work} min of work, minimum block {minb} min) with {margin} min headway margins, clear of this week’s blocks on {sections}. {evaluated} windows evaluated, {clash} skipped for a block clash, {zero} fit a gap without touching a train.',
    sgScanOpen: 'The work does not close the line (disconnection / feed work), so no train is held.',
    sgScanMax: 'The work needs {win} min, more than the {max} min block ceiling: split it, or take it as a mega block with sanction.',
    sgScanRank: '**Best {n}** (one per day and line; ranked by rule limits{due}, premium paths, class-weighted delay, trains affected):',
    sgScanRankDue: ', due day',
    sgScanAlt: '• {date} {start}–{end} {line}: trains {trains}, class-weighted delay {delay} train-min, premium paths {premium}{list}{extra}',
    sgAfterDue: ' — after the due day',
    sgBreaks: ' — breaks: {rules}',
    rulePerDay: 'more than {limit} possessions that day',
    ruleConcurrent: '{value} simultaneous possessions (limit {limit})',
    rulePremium: '{value} premium path(s) blocked',
    sgNoWindow: 'No window found in the week on these sections.',
    sgTypeHead: '**{type}** at km {km} ({sections}): no such work is in the register, so the standard {min} min of the work type is used.',
    sgNeedKm: 'No work of type “{type}” is in the register of {corridor}. Add a chainage, for example “Suggest a block for {example} at km {km}”, and the free windows there will be scanned.',
    sgOffCorridor: 'km {km} is not on {corridor} (km 0–{len}).',
    sgNotFoundId: 'No work, requisition or report with id **{id}** is in the current plan or records.',
    sgNotFound: 'I could not tell which work is meant. Name a work id (for example {id}), a requisition or report id, or a work type such as tamping, USFD or contact wire renewal.',
    sgUnplanned: '**{ref}** ({status}) has no work in the current plan yet. A requisition joins the plan when the cell accepts it and the plan is re-run; a report joins when it is converted to a work.',
    // status
    stBlockHead: 'Block **{id}**: **{state}**.',
    stMoved: 'The approval moved from {old} to this block after a re-plan.',
    stWindow: '{date} {start}–{end}, {line}{section}, {depts}.',
    stNotInPlan: 'Not in the current plan (window as last sent).',
    stTrains: 'Trains affected: {n}, class-weighted delay {delay} train-min.',
    stSent: 'Sent to Control by {by}, {at}.',
    stNotSent: 'Not yet sent to Control.',
    stConcurHead: '**Concurrences:**',
    stConcur: '• {dept}: concurred by {by}, {at}{note}',
    stConcurPending: '• {dept}: pending',
    stObjection: '• {dept} objected ({by}, {at}): {reason}',
    stGranted: 'Granted by {by}, {at}.',
    stLocked: 'Locked by {by}, {at}.',
    stRefused: 'Refused by {by}, {at}: {reason}.',
    stOverride: 'Control changed the window from {from} to {to} ({by}, {at}).',
    stSuperseded: 'Changed by a re-plan after it was sent ({at}); the planning cell must send it again.',
    stIncharge: 'Engineer-in-charge: {name}.',
    stExt: 'Extensions: {pending} pending, {approved} approved ({min} min added), {refused} refused.',
    stExtNone: 'No extension asked.',
    stExec: 'Execution: **{status}**{started}{cleared}; {done} of {items} works done.',
    stExecStarted: ', started {time}',
    stExecCleared: ', cleared {time}',
    stExecCause: 'Overrun cause: {cause}.',
    stExecNone: 'No execution record: the possession has not started.',
    stPower: 'Power block (TRD isolation): {status} ({by}, {at}).',
    stPowerNone: 'Power block: no isolation recorded yet.',
    stT351: 'T/351 disconnection notices: {done} of {n} received or reconnected.',
    stMsgs: 'Site messages: {n}{last}.',
    stMsgLast: ' (last {at})',
    stReqHead: 'Requisition **{no}** ({id}): **{status}**.',
    stReqWork: '{dept}, {work}, {line} km {from}–{to}, {min} min{pref}.',
    stReqPref: ', preferred {date}',
    stReqRemarks: 'Cell remarks: {text}.',
    stReqValidation: 'Validation notes: {text}.',
    stHistory: '**History:**',
    stHistLine: '• {at} {action} ({by}){note}',
    stLanded: 'In the plan as work **{task}**: {placement}',
    stReqWaiting: 'Accepted; the work joins the plan on the next run.',
    stOther: 'This record belongs to another corridor; the plan on screen is {corridor}.',
    stRepHead: 'Report **{id}**: **{status}**.',
    stRepWhat: '{category}, severity {severity}{auto}, routed to {dept}{assignee}{where}.',
    stRepAuto: ' (rule-based: {reasons})',
    stRepAssignee: ', assigned to {name}',
    stRepWhere: ', km {km}{line}',
    stRepControl: 'Control',
    stRepWaiting: 'Converted to a work; it joins the plan on the next run.',
    stNotFound: '**{id}** was not found. Ids understood: blocks (BLK-…), requisitions (REQ-… or the BDMS number), hazard reports (HZ-…) and works (for example {task}).',
    sevUnrated: 'not rated',
    // today
    tdHead: '**Today** here means plan day 0, **{date}**, the first day of the plan on screen. Wall clock now {time} IST.',
    tdBlocks: '• Blocks on day 0: **{n}**{states}',
    tdPossessions: '• Possessions: **{started}** started, **{cleared}** cleared, **{inprog}** in progress{late}',
    tdLate: ', {n} cleared after the planned end',
    tdConflicts: '• Conflicts on day 0: **{n}** (high {h}, medium {m}, low {l}); in the whole week {w}',
    tdSafety: '• Safety conflicts (safety rule or deferred mandatory work): **{n}** in the week, {today} on day 0',
    tdRunning: '• Possessions running past the planned end now: **{n}**{worst}',
    tdWorst: ', worst {min} min ({id})',
    tdAnoms: '• Overrun anomalies found in the execution history: **{n}** (high {h}, medium {m}, low {l})',
    tdIncidents: '• Open incidents on this corridor: **{n}** (high {h}, medium {m}, low {l}, not rated {u}; {unv} unverified, {tri} triaged)',
    tdExt: '• Extensions pending with Control: **{n}**{min}',
    tdExtMin: ' ({min} min asked)',
    tdCaution: '• Caution orders (T/409, T/409B) issued: **{n}**; T/351 notices issued: {t351}',
  },
  hi: {
    title: 'कोपायलट',
    lede: '{corridor} पर इस सप्ताह की योजना के प्रश्न: किसी कार्य के लिए ब्लॉक सुझाव, ब्लॉक, मांग-पत्र या रिपोर्ट की स्थिति, आज की रिपोर्ट, कोई कार्य उस क्रम पर क्यों है, किसी दिन क्या नियोजित है, कोई ब्लॉक किन ट्रेनों को प्रभावित करता है, लागू TSR, और आधार-रेखा से तुलना।',
    clear: 'बातचीत साफ़ करें',
    placeholder: 'किसी कार्य, ब्लॉक, मांग-पत्र, रिपोर्ट या आज के बारे में पूछें (अंग्रेज़ी में)…',
    send: 'पूछें',
    you: 'आप',
    copilot: 'कोपायलट',
    source: 'स्रोत: {source}',
    note: 'उत्तर वर्तमान योजना से नियम-आधारित राउटर बनाता है, कोई भाषा मॉडल नहीं। ब्लॉक सुझाव, स्थिति और आज की रिपोर्ट चुनी गई भाषा में हैं; बाकी उत्तर अंग्रेज़ी में हैं। यात्री आरक्षण (PNR), सीट और लाइव रनिंग डेटा इसके दायरे से बाहर हैं।',
    welcome: 'नीचे प्रश्न पूछें या कोई सुझाव चुनें। हर उत्तर इस डिवाइस पर मौजूद योजना और रिकॉर्ड से गणित होता है।',
    pSuggest: '{id} के लिए ब्लॉक सुझाएँ',
    pStatus: '{id} की स्थिति',
    pToday: 'आज की रिपोर्ट',
    pWhy: 'सबसे ऊँचे रैंक का कार्य पहले क्यों है?',
    pTomorrow: 'कल कौन से ब्लॉक नियोजित हैं?',
    pBlock: 'ब्लॉक {id} किन ट्रेनों को प्रभावित करता है?',
    pTsr: 'लागू TSR दिखाएँ',
    pBaseline: 'योजना की आधार-रेखा से तुलना',
    pTop: 'सर्वोच्च प्राथमिकता वाले कार्य',
    pMandatory: 'अनिवार्य सुरक्षा फ़्लोर समझाएँ',
    openTask: '{id} खोलें',
    openBlock: '{id} खोलें',
    openReq: 'मांग-पत्र {id} खोलें',
    openReport: 'रिपोर्ट {id} खोलें',
    openRisk: 'जोखिम व प्राथमिकता',
    openWeekly: 'साप्ताहिक योजना',
    openCaution: 'सतर्कता व TSR',
    openOverview: 'अवलोकन',
    openExecution: 'निष्पादन लॉग',
    openIncidents: 'घटनाएँ',
    help: 'यह प्रश्न किसी योजना-प्रश्न से मेल नहीं खाया। इनमें से कोई पूछें (अंग्रेज़ी में):\n• "Suggest a block for {task}" या "Find a window for tamping at km 120"\n• "Status of {block}", "Status of REQ-…" या "Where is HZ-…"\n• "Today’s report"\n• "Why is task {task} ranked where it is?"\n• "What blocks are planned on Thursday?"\n• "Which trains does block {block} affect?"\n• "Show TSRs in force"\n• "Compare the plan with the baseline"\n• "Top priority works"',
    srcRouter: 'प्रश्न राउटर',
    srcScope: 'SAMANVAY का दायरा',
    srcSolver: 'साप्ताहिक योजना के ऑप्टिमाइज़र विकल्प',
    srcScan: 'कार्य समय-सारणी के खाली अंतरालों की जाँच, विलंब मॉडल सहित',
    srcRegister: 'कार्य रजिस्टर',
    srcRecords: 'इस डिवाइस पर कार्यप्रवाह रिकॉर्ड',
    srcToday: 'योजना दिवस 0, कार्यप्रवाह रिकॉर्ड और निष्पादन लॉग',
    outOfScope: 'यात्री आरक्षण (PNR) डेटा SAMANVAY के दायरे से बाहर है। यह रखरखाव ब्लॉक की योजना बनाता है; आरक्षण प्रणाली से इसका कोई संबंध नहीं है।',
    lnBoth: 'दोनों लाइनें',
    lnOne: '{line} लाइन',
    sgHead: '**{label}** ({id}), **{section}**, {line}, {min} मिनट का कार्य{mand}।',
    sgMand: ', अनिवार्य, {date} तक देय',
    sgNearest: 'km {km} के सबसे निकट “{type}” प्रकार के {n} कार्यों में से ({d} km दूर)।',
    sgOnlyKm: '“{type}” प्रकार का एकमात्र कार्य (km {km} से {d} km)।',
    sgTop: '“{type}” प्रकार के {n} कार्यों में सबसे ऊँचा ARCI।',
    sgOnly: '“{type}” प्रकार का एकमात्र कार्य।',
    sgViaReq: 'मांग-पत्र {ref} का कार्य।',
    sgViaReport: 'रिपोर्ट {ref} से बना कार्य।',
    plPlaced: 'अभी **{date} {start}–{end}** ({line}) पर रखा गया है{block}।',
    plInBlock: ', ब्लॉक **{id}** ({state}) में',
    plOverride: 'कंट्रोल ने ब्लॉक का समय {start}–{end} किया।',
    plDeferred: 'इस सप्ताह नहीं रखा गया: {reason}।',
    plRolling: '26-सप्ताह कार्यक्रम में पूँजीगत कार्य, {week}।',
    plNone: 'इस सप्ताह की योजना में नहीं है।',
    sgSolverHead: '**ऑप्टिमाइज़र द्वारा जाँचे गए अन्य समय** (योजना का बाकी हिस्सा यथावत; सबसे अच्छा पहले):',
    sgAlt: '• {date} {start}–{end} {line}{scope}: ट्रेनें {trains}, श्रेणी-भारित विलंब {delay} ट्रेन-मिनट, प्रीमियम पथ {premium}{bad}',
    sgCost: ', योजना लागत {cost}',
    sgScopeBlock: ' (पूरा ब्लॉक खिसकाकर)',
    sgInfeasible: ' — नियम टूटता है: {reason}',
    sgScanHead: 'ऑप्टिमाइज़र के पास इस कार्य के लिए अन्य समय नहीं हैं, इसलिए कार्य समय-सारणी जाँची गई: {days} दिन, {lines}, {win} मिनट के समय ({work} मिनट कार्य, न्यूनतम ब्लॉक {minb} मिनट), {margin} मिनट हेडवे मार्जिन सहित, {sections} पर इस सप्ताह के ब्लॉकों से अलग। {evaluated} समय जाँचे गए, {clash} ब्लॉक टकराव से छोड़े गए, {zero} किसी ट्रेन को छुए बिना अंतराल में आते हैं।',
    sgScanOpen: 'यह कार्य लाइन बंद नहीं करता (डिस्कनेक्शन / फ़ीड कार्य), इसलिए कोई ट्रेन नहीं रुकती।',
    sgScanMax: 'कार्य को {win} मिनट चाहिए, जो {max} मिनट की ब्लॉक सीमा से अधिक है: इसे बाँटें, या स्वीकृति के साथ मेगा ब्लॉक लें।',
    sgScanRank: '**सबसे अच्छे {n}** (हर दिन और लाइन पर एक; क्रम: नियम सीमाएँ{due}, प्रीमियम पथ, श्रेणी-भारित विलंब, प्रभावित ट्रेनें):',
    sgScanRankDue: ', देय दिवस',
    sgScanAlt: '• {date} {start}–{end} {line}: ट्रेनें {trains}, श्रेणी-भारित विलंब {delay} ट्रेन-मिनट, प्रीमियम पथ {premium}{list}{extra}',
    sgAfterDue: ' — देय दिवस के बाद',
    sgBreaks: ' — टूटता है: {rules}',
    rulePerDay: 'उस दिन {limit} से अधिक ब्लॉक',
    ruleConcurrent: '{value} एक साथ ब्लॉक (सीमा {limit})',
    rulePremium: '{value} प्रीमियम पथ बाधित',
    sgNoWindow: 'इन सेक्शनों पर सप्ताह में कोई समय नहीं मिला।',
    sgTypeHead: '**{type}**, km {km} ({sections}): रजिस्टर में ऐसा कोई कार्य नहीं है, इसलिए कार्य-प्रकार के मानक {min} मिनट लिए गए।',
    sgNeedKm: '{corridor} के रजिस्टर में “{type}” प्रकार का कोई कार्य नहीं है। किलोमीटर जोड़ें, जैसे “Suggest a block for {example} at km {km}”, तब वहाँ के खाली समय जाँचे जाएँगे।',
    sgOffCorridor: 'km {km} {corridor} पर नहीं है (km 0–{len})।',
    sgNotFoundId: 'id **{id}** वाला कोई कार्य, मांग-पत्र या रिपोर्ट वर्तमान योजना या रिकॉर्ड में नहीं है।',
    sgNotFound: 'कौन सा कार्य है, यह स्पष्ट नहीं हुआ। कार्य id (जैसे {id}), मांग-पत्र या रिपोर्ट id, या कार्य-प्रकार जैसे tamping, USFD, contact wire renewal बताएँ।',
    sgUnplanned: '**{ref}** ({status}) का कोई कार्य अभी योजना में नहीं है। मांग-पत्र सेल की स्वीकृति और योजना दोबारा चलाने पर जुड़ता है; रिपोर्ट कार्य में बदलने पर जुड़ती है।',
    stBlockHead: 'ब्लॉक **{id}**: **{state}**।',
    stMoved: 'री-प्लान के बाद स्वीकृति {old} से इस ब्लॉक पर आई।',
    stWindow: '{date} {start}–{end}, {line}{section}, {depts}।',
    stNotInPlan: 'वर्तमान योजना में नहीं (अंतिम बार भेजा गया समय)।',
    stTrains: 'प्रभावित ट्रेनें: {n}, श्रेणी-भारित विलंब {delay} ट्रेन-मिनट।',
    stSent: '{by} ने कंट्रोल को भेजा, {at}।',
    stNotSent: 'अभी कंट्रोल को नहीं भेजा गया।',
    stConcurHead: '**सहमतियाँ:**',
    stConcur: '• {dept}: {by} की सहमति, {at}{note}',
    stConcurPending: '• {dept}: लंबित',
    stObjection: '• {dept} की आपत्ति ({by}, {at}): {reason}',
    stGranted: '{by} ने स्वीकृत किया, {at}।',
    stLocked: '{by} ने लॉक किया, {at}।',
    stRefused: '{by} ने अस्वीकार किया, {at}: {reason}।',
    stOverride: 'कंट्रोल ने समय {from} से {to} किया ({by}, {at})।',
    stSuperseded: 'भेजे जाने के बाद री-प्लान से बदला ({at}); योजना सेल को इसे दोबारा भेजना होगा।',
    stIncharge: 'प्रभारी अभियंता: {name}।',
    stExt: 'विस्तार: {pending} लंबित, {approved} स्वीकृत ({min} मिनट जोड़े), {refused} अस्वीकृत।',
    stExtNone: 'कोई विस्तार नहीं माँगा गया।',
    stExec: 'निष्पादन: **{status}**{started}{cleared}; {items} में से {done} कार्य पूर्ण।',
    stExecStarted: ', शुरू {time}',
    stExecCleared: ', क्लियर {time}',
    stExecCause: 'ओवररन का कारण: {cause}।',
    stExecNone: 'निष्पादन रिकॉर्ड नहीं: ब्लॉक शुरू नहीं हुआ।',
    stPower: 'पावर ब्लॉक (TRD आइसोलेशन): {status} ({by}, {at})।',
    stPowerNone: 'पावर ब्लॉक: अभी कोई आइसोलेशन दर्ज नहीं।',
    stT351: 'T/351 डिस्कनेक्शन नोटिस: {n} में से {done} प्राप्त या पुनः जोड़े गए।',
    stMsgs: 'साइट संदेश: {n}{last}।',
    stMsgLast: ' (अंतिम {at})',
    stReqHead: 'मांग-पत्र **{no}** ({id}): **{status}**।',
    stReqWork: '{dept}, {work}, {line} km {from}–{to}, {min} मिनट{pref}।',
    stReqPref: ', पसंदीदा {date}',
    stReqRemarks: 'सेल की टिप्पणी: {text}।',
    stReqValidation: 'जाँच टिप्पणियाँ: {text}।',
    stHistory: '**इतिहास:**',
    stHistLine: '• {at} {action} ({by}){note}',
    stLanded: 'योजना में कार्य **{task}** के रूप में: {placement}',
    stReqWaiting: 'स्वीकृत; कार्य अगली योजना-रन में जुड़ेगा।',
    stOther: 'यह रिकॉर्ड दूसरे कॉरिडोर का है; स्क्रीन पर {corridor} की योजना है।',
    stRepHead: 'रिपोर्ट **{id}**: **{status}**।',
    stRepWhat: '{category}, गंभीरता {severity}{auto}, {dept} को भेजी गई{assignee}{where}।',
    stRepAuto: ' (नियम-आधारित: {reasons})',
    stRepAssignee: ', {name} को सौंपी गई',
    stRepWhere: ', km {km}{line}',
    stRepControl: 'कंट्रोल',
    stRepWaiting: 'कार्य में बदली गई; अगली योजना-रन में जुड़ेगी।',
    stNotFound: '**{id}** नहीं मिला। समझे जाने वाले id: ब्लॉक (BLK-…), मांग-पत्र (REQ-… या BDMS संख्या), खतरा रिपोर्ट (HZ-…) और कार्य (जैसे {task})।',
    sevUnrated: 'निर्धारित नहीं',
    tdHead: 'यहाँ **आज** का अर्थ योजना दिवस 0, **{date}** है, यानी स्क्रीन पर योजना का पहला दिन। अभी घड़ी में {time} IST।',
    tdBlocks: '• दिवस 0 के ब्लॉक: **{n}**{states}',
    tdPossessions: '• ब्लॉक: **{started}** शुरू, **{cleared}** क्लियर, **{inprog}** प्रगति पर{late}',
    tdLate: ', {n} नियोजित समाप्ति के बाद क्लियर',
    tdConflicts: '• दिवस 0 के टकराव: **{n}** (उच्च {h}, मध्यम {m}, निम्न {l}); पूरे सप्ताह में {w}',
    tdSafety: '• सुरक्षा टकराव (सुरक्षा नियम या टला अनिवार्य कार्य): सप्ताह में **{n}**, दिवस 0 पर {today}',
    tdRunning: '• अभी नियोजित समाप्ति से आगे चल रहे ब्लॉक: **{n}**{worst}',
    tdWorst: ', सबसे अधिक {min} मिनट ({id})',
    tdAnoms: '• निष्पादन इतिहास में ओवररन विसंगतियाँ: **{n}** (उच्च {h}, मध्यम {m}, निम्न {l})',
    tdIncidents: '• इस कॉरिडोर पर खुली घटनाएँ: **{n}** (उच्च {h}, मध्यम {m}, निम्न {l}, निर्धारित नहीं {u}; {unv} असत्यापित, {tri} जाँची गईं)',
    tdExt: '• कंट्रोल के पास लंबित विस्तार: **{n}**{min}',
    tdExtMin: ' ({min} मिनट माँगे)',
    tdCaution: '• जारी सतर्कता आदेश (T/409, T/409B): **{n}**; जारी T/351 नोटिस: {t351}',
  },
} as const;

/** Workflow, record and category words used inside answers (EN / HI). */
const words = {
  en: {
    sDRAFT: 'draft', sPROPOSED: 'proposed', sCONCURRED: 'concurred', sGRANTED: 'granted', sLOCKED: 'locked', sREFUSED: 'refused', sSUPERSEDED: 'changed by re-plan',
    DRAFT: 'Draft (optimiser proposal)', PROPOSED: 'Proposed — awaiting concurrence', CONCURRED: 'Concurred — ready to grant', GRANTED: 'Granted', LOCKED: 'Locked', REFUSED: 'Refused', SUPERSEDED: 'Changed by re-plan — send again',
    rDRAFT: 'Draft', rSUBMITTED: 'Submitted', rRETURNED: 'Returned', rACCEPTED: 'Accepted', rWITHDRAWN: 'Withdrawn',
    hUNVERIFIED: 'Unverified', hTRIAGED: 'Triaged', hTASK: 'Converted to a work', hRESOLVED: 'Resolved', hREJECTED: 'Rejected',
    eIN_PROGRESS: 'In progress', eCOMPLETED: 'Completed', eCLOSED: 'Closed',
    pPENDING: 'pending', pDEENERGISED: 'de-energised', pENERGISED: 're-energised',
    high: 'high', medium: 'medium', low: 'low',
    ctrack: 'track', csignal: 'signal', cohe: 'OHE', clc: 'level crossing', cfire: 'fire', cobstruction: 'obstruction', cother: 'other',
  },
  hi: {
    sDRAFT: 'ड्राफ़्ट', sPROPOSED: 'प्रस्तावित', sCONCURRED: 'सहमत', sGRANTED: 'स्वीकृत', sLOCKED: 'लॉक', sREFUSED: 'अस्वीकृत', sSUPERSEDED: 'री-प्लान से बदला',
    DRAFT: 'ड्राफ़्ट (ऑप्टिमाइज़र प्रस्ताव)', PROPOSED: 'प्रस्तावित — सहमति प्रतीक्षित', CONCURRED: 'सहमत — स्वीकृति हेतु तैयार', GRANTED: 'स्वीकृत', LOCKED: 'लॉक', REFUSED: 'अस्वीकृत', SUPERSEDED: 'री-प्लान से बदला — दोबारा भेजें',
    rDRAFT: 'ड्राफ़्ट', rSUBMITTED: 'जमा', rRETURNED: 'लौटाया गया', rACCEPTED: 'स्वीकृत', rWITHDRAWN: 'वापस लिया गया',
    hUNVERIFIED: 'असत्यापित', hTRIAGED: 'जाँची गई', hTASK: 'कार्य में बदली गई', hRESOLVED: 'हल', hREJECTED: 'अस्वीकृत',
    eIN_PROGRESS: 'प्रगति पर', eCOMPLETED: 'पूर्ण', eCLOSED: 'बंद',
    pPENDING: 'लंबित', pDEENERGISED: 'विद्युत बंद', pENERGISED: 'विद्युत बहाल',
    high: 'उच्च', medium: 'मध्यम', low: 'निम्न',
    ctrack: 'ट्रैक', csignal: 'सिग्नल', cohe: 'OHE', clc: 'समपार (LC)', cfire: 'आग', cobstruction: 'अवरोध', cother: 'अन्य',
  },
} as const;

type Key = keyof typeof strings.en;
type WordKey = keyof typeof words.en;

/* ── shapes returned by askCopilot (src/engine/copilot.js) ───── */

interface EngineLink {
  type: string;
  id: string;
  text: string;
}
interface EngineAnswer {
  intent: string;
  answer: string;
  dataSource: string;
  links: EngineLink[];
  data?: unknown;
}

interface PlacementData {
  scheduled: { day: number; date: string; line: string; start: number; end: number; startText: string; endText: string } | null;
  blockId: string | null;
  blockState: WorkflowState | null;
  blockWindow: { startText: string; endText: string; overridden: boolean } | null;
  deferredReason: string | null;
  rolling: { weekLabel: string } | null;
}
interface AltData {
  source: 'solver' | 'scan';
  day: number;
  date: string;
  line: string;
  startText: string;
  endText: string;
  trainsAffected: number;
  weightedDelayMin: number;
  premiumConflicts: number;
  deltaCost?: number;
  feasible?: boolean;
  reason?: string | null;
  scope?: 'task' | 'block';
  trains?: { number: string; mode: string; delayMin: number }[];
  ruleViolations?: { rule: 'perDay' | 'concurrent' | 'premium'; limit: number; value: number }[];
  afterDue?: boolean;
}
interface SuggestData {
  outcome: 'task' | 'workType' | 'needKm' | 'offCorridor' | 'notFound' | 'unplanned';
  query: { target: string; km: number | null; line: string | null };
  task: { id: string; label: string; sectionLabel: string; line: string; totalMin: number; mandatory: boolean; dueDay: number } | null;
  workType: { code: string; label: string; totalMin?: number } | null;
  matchedBy: 'id' | 'sourceId' | 'requisition' | 'report' | 'workType' | null;
  matches: number | null;
  kmDistance: number | null;
  ref: string | null;
  refStatus: string | null;
  notFoundId?: string | null;
  corridorKm?: number;
  placement: PlacementData | null;
  basis: 'solver' | 'scan' | 'none';
  alternatives: AltData[];
  scan: { windowMin: number; workMin: number; marginMin: number; minBlockMin: number; maxBlockMin: number; exceedsMax: boolean; lines: string[]; sections: string[]; days: number; evaluated: number; zeroTrainWindows: number; clashesSkipped: number; lineClosure: boolean; mandatory: boolean; dueDay: number | null } | null;
}
interface HistoryData {
  at: string;
  by: string;
  action: string;
  note: string | null;
}
interface LandedData {
  taskId: string;
  placement: PlacementData;
}
interface BlockStatusData {
  kind: 'block';
  id: string;
  movedFrom: string | null;
  state: WorkflowState;
  block: { inPlan: boolean; date: string | null; line: string | null; sectionText: string | null; startText: string | null; endText: string | null; departments: string[]; trainsAffected: number | null; weightedDelayMin: number | null };
  approval: {
    proposedBy: string | null;
    proposedAt: string | null;
    concur: { dept: string; by: string | null; at: string | null; note: string | null }[];
    objections: { dept: string; by: string; at: string; reason: string }[];
    grantedBy: string | null;
    grantedAt: string | null;
    lockedBy: string | null;
    lockedAt: string | null;
    refusal: { reason: string; by: string; at: string } | null;
    override: { startText: string; endText: string; by: string; at: string; planStartText: string | null; planEndText: string | null } | null;
    supersededAt: string | null;
    incharge: string | null;
  } | null;
  extensions: { list: unknown[]; pending: number; approved: number; refused: number; approvedMin: number };
  execution: { status: 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED'; actualStartText: string | null; actualEndText: string | null; itemsDone: number; items: number; overrunCause: string | null } | null;
  power: { status: 'PENDING' | 'DEENERGISED' | 'ENERGISED'; by: string | null; at: string | null } | null;
  powerNeeded: boolean;
  messages: { count: number; lastAt: string | null };
  t351: { status: string | null }[];
}
interface ReqStatusData {
  kind: 'req';
  id: string;
  req: { id: string; no: string; status: string; dept: string; workLabel: string; line: string; startKm: number; endKm: number; durationMin: number; preferredDate: string | null; cellRemarks: string | null; validation: string[]; otherCorridor: boolean };
  history: HistoryData[];
  landed: LandedData | null;
  awaitingReplan: boolean;
}
interface ReportStatusData {
  kind: 'report';
  id: string;
  report: { id: string; status: string; category: string; severity: 'low' | 'medium' | 'high' | null; severityAuto: boolean; severityReasons: string[]; dept: string | null; assignee: string | null; km: number | null; line: string | null; otherCorridor: boolean };
  history: HistoryData[];
  landed: LandedData | null;
  awaitingReplan: boolean;
}
type StatusData = BlockStatusData | ReqStatusData | ReportStatusData | { kind: 'notFound'; id: string };
type Sev = { high: number; medium: number; low: number };
interface TodayData {
  date: string;
  nowMinute: number | null;
  blocks: { total: number; byState: Record<WorkflowState, number> };
  execution: { started: number; cleared: number; inProgress: number; clearedLate: number };
  conflicts: { today: Sev & { total: number }; week: Sev & { total: number }; safetyToday: number; safetyWeek: number } | null;
  running: { count: number; maxOverMin: number; blockIds: string[] } | null;
  anomalies: Sev & { overrun: number };
  incidents: Sev & { open: number; unrated: number; unverified: number; triaged: number };
  extensions: { pending: number; pendingMin: number };
  caution: { issued: number; t351Issued: number };
}

/* ── answers ─────────────────────────────────────────────────── */

type RouteKind = 'overview' | 'caution' | 'weekly' | 'risk' | 'execution' | 'incidents';
type Action = { kind: 'task' | 'block'; id: string } | { kind: 'req' | 'report'; id: string } | { kind: 'route'; to: RouteKind };

interface Answer {
  text: string;
  source: string;
  labels: SimKind[];
  actions: Action[];
}

interface Message {
  id: string;
  who: 'user' | 'copilot';
  text: string;
  at: string;
  answer?: Answer;
}

const DEPT_PORTALS: PortalId[] = ['tms', 'smms', 'tdms'];

/** Routes each portal can open for a link kind (only the user's own portal). */
const ROUTES: Record<RouteKind, Partial<Record<PortalId, string>>> = {
  overview: { planning: '/app/planning/overview', division: '/app/division/brief', control: '/app/control/board', tms: '/app/tms/today', smms: '/app/smms/today', tdms: '/app/tdms/today', field: '/app/field/today' },
  caution: { control: '/app/control/caution', tms: '/app/tms/caution', smms: '/app/smms/caution', tdms: '/app/tdms/caution', field: '/app/field/caution' },
  weekly: { planning: '/app/planning/weekly', control: '/app/control/weekly', tms: '/app/tms/blocks', smms: '/app/smms/blocks', tdms: '/app/tdms/blocks' },
  risk: { planning: '/app/planning/risk' },
  execution: { planning: '/app/planning/execution', control: '/app/control/log' },
  incidents: { control: '/app/control/incidents', division: '/app/division/incidents', tms: '/app/tms/incidents', smms: '/app/smms/incidents', tdms: '/app/tdms/incidents', field: '/app/field/reports' },
};
const ROUTE_LABEL: Record<RouteKind, Key> = { overview: 'openOverview', caution: 'openCaution', weekly: 'openWeekly', risk: 'openRisk', execution: 'openExecution', incidents: 'openIncidents' };

/** Where a requisition opens in this portal (?req= drawer on the requisitions page), or null when the portal has none. */
function reqHref(portal: PortalId, id: string): string | null {
  const q = `?req=${encodeURIComponent(id)}`;
  if (portal === 'planning') return `/app/planning/demands${q}`;
  if (DEPT_PORTALS.includes(portal)) return `/app/${portal}/requisitions${q}`;
  return null;
}

/** Where a hazard report opens in this portal (?report= drawer on the incidents page), or null when the portal has none. */
function reportHref(portal: PortalId, id: string): string | null {
  const q = `?report=${encodeURIComponent(id)}`;
  if (portal === 'control' || portal === 'division' || DEPT_PORTALS.includes(portal)) return `/app/${portal}/incidents${q}`;
  if (portal === 'field') return `/app/field/reports/${encodeURIComponent(id)}`;
  return null;
}

const MANDATORY_RE = /mandatory|safety floor/i;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MODE_TEXT: Record<string, string> = { SLW: 'worked over the other line', HELD: 'held', REGULATED: 'regulated' };

/** Plan day (0 = first day of the plan) named in the question, if any. */
function dayFromQuery(q: string, planStart: string): number | null {
  const m = q.match(/day\s*(\d)/i);
  if (m) return Math.min(6, Math.max(0, Number(m[1])));
  if (/tomorrow/i.test(q)) return 1;
  if (/today|tonight/i.test(q)) return 0;
  const startDow = new Date(`${planStart}T00:00:00`).getDay();
  const named = WEEKDAYS.findIndex((d) => q.toLowerCase().includes(d));
  if (named >= 0) return (named - startDow + 7) % 7;
  return null;
}

function placementText(snapshot: Snapshot, task: Task): string {
  const w = snapshot.result.weekly.ai;
  const s = w.scheduled.find((x) => x.taskId === task.id);
  if (s) return `Placed on ${dateLabel(addDaysIso(snapshot.planStart, s.day))}, ${hhmm(s.start)}–${hhmm(s.end)}.`;
  const d = w.deferred.find((x) => x.taskId === task.id);
  if (d) return `Not placed this week: ${d.reason}.`;
  const r = snapshot.result.rolling.entries.find((x) => x.taskId === task.id);
  if (r) return `Capital work in the 26-week programme, ${r.weekLabel}.`;
  return 'Not in this week’s plan.';
}

/** Record time stamp in IST (e.g. "Mon 07 Sep 15:30"). */
function when(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  );
  return `${dateLabel(`${parts.year}-${parts.month}-${parts.day}`)} ${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`;
}

const signedNum = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(Math.round(v)))}`;

/** Minimal **bold** rendering for answer text; everything else is plain. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <div key={i} style={{ minHeight: '1em' }}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith('**') && part.endsWith('**') ? <strong key={j}>{part.slice(2, -2)}</strong> : <span key={j}>{part.replace(/\*([^*]+)\*/g, '$1')}</span>
          )}
        </div>
      ))}
    </>
  );
}

const clock = () => new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
/** Unique id for a question/answer pair (called from the submit handler only). */
const messageStamp = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export default function CopilotPage() {
  const t = useT(strings);
  const w = useT(words);
  const nav = useNavigate();
  const portal = usePortal();
  const drawer = useDrawerParams();

  const snapshot = useAppStore((s) => s.snapshot);
  const approvals = useAppStore((s) => s.approvals);
  const tsrs = useAppStore((s) => s.tsrs);
  const requisitions = useAppStore((s) => s.requisitions);
  const reports = useAppStore((s) => s.reports);
  const extensions = useAppStore((s) => s.extensions);
  const executionLog = useAppStore((s) => s.executionLog);
  const forms = useAppStore((s) => s.forms);
  const powerBlocks = useAppStore((s) => s.powerBlocks);
  const siteMessages = useAppStore((s) => s.messages);

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);

  const blocks = useMemo(() => workingBlocks(snapshot, approvals), [snapshot, approvals]);
  const firstBlockWithTrains = useMemo(() => blocks.find((b) => b.affectedTrains.length > 0) ?? blocks[0] ?? null, [blocks]);
  const statusBlock = useMemo(() => blocks.find((b) => b.approval) ?? blocks[0] ?? null, [blocks]);
  const suggestTaskId = useMemo(() => {
    if (!snapshot) return null;
    const deferred = [...snapshot.result.weekly.ai.deferred].sort((a, b) => b.arci - a.arci)[0];
    return deferred?.taskId ?? [...snapshot.tasks].sort((a, b) => b.risk.arci - a.risk.arci)[0]?.id ?? null;
  }, [snapshot]);

  if (!snapshot) return <PlanPending />;

  const k = snapshot.result.weekly.kpis;
  const b = snapshot.result.weekly.baseKpis;
  const d = snapshot.result.weekly.delta;
  const dayDate = (day: number) => dateLabel(addDaysIso(snapshot.planStart, day));
  const routeFor = (to: RouteKind) => ROUTES[to][portal] ?? null;
  const lineText = (line: string | null | undefined) => (!line ? '' : line === 'BOTH' ? t('lnBoth') : t('lnOne', { line }));

  /* ── answer builders (every figure from the snapshot / the router) ── */
  const whyAnswer = (task: Task): Answer => {
    const r = task.risk;
    const terms = r.explanation.map((e) => `• **${e.label}** (${e.value.toFixed(2)}${e.weight !== null ? `, weight ${e.weight.toFixed(2)}` : ''}): ${e.text}`).join('\n');
    return {
      text: `**${task.label}** (${task.id}) on **${task.sectionLabel}**, ${task.line} line — ARCI **${r.arci.toFixed(2)}**, ${r.urgencyLabel}${r.mandatory ? ', mandatory' : ''}.\n\n**Why this rank:**\n${terms}\n\n${placementText(snapshot, task)}`,
      source: 'ARCI risk engine (Weibull fits and escalation model)',
      labels: ['model'],
      actions: [{ kind: 'task', id: task.id }, { kind: 'route', to: 'risk' }],
    };
  };

  const dayAnswer = (day: number): Answer => {
    const list = blocks.filter((x) => x.day === day && x.status !== 'REFUSED').sort((x, y) => x.start - y.start);
    if (!list.length) return { text: `No possessions are planned on **${dayDate(day)}**.`, source: 'weekly plan', labels: ['solver'], actions: [{ kind: 'route', to: 'weekly' }] };
    const lines = list.map((x: WorkingBlock) => `• **${x.id}** ${x.startText}–${x.endText} (${duration(x.spanMin)}) · ${x.sectionText} ${x.line} · ${x.departments.join(' + ')} · ${blockStatusLabel(x)}`).join('\n');
    return {
      text: `**${list.length} possession${list.length === 1 ? '' : 's'}** planned on **${dayDate(day)}**:\n\n${lines}`,
      source: 'weekly plan with Control decisions',
      labels: ['solver'],
      actions: [...list.slice(0, 3).map((x): Action => ({ kind: 'block', id: x.id })), { kind: 'route', to: 'weekly' }],
    };
  };

  const blockAnswer = (block: WorkingBlock): Answer => {
    const head = `Block **${block.id}** — ${block.sectionText} ${block.line}, ${dayDate(block.day)} ${block.startText}–${block.endText}`;
    if (!block.affectedTrains.length) return { text: `${head}.\n\nIt fits a timetable gap: no train is held, regulated or worked over the other line.`, source: 'delay model over the working timetable', labels: ['planningEstimate'], actions: [{ kind: 'block', id: block.id }] };
    const lines = block.affectedTrains.map((x) => `• **${x.number}** ${x.name} (${classLabel(x.cls)}): ${MODE_TEXT[x.mode] ?? x.mode}, ${x.delayMin} min`).join('\n');
    return {
      text: `${head} — **${block.affectedTrains.length} train${block.affectedTrains.length === 1 ? '' : 's'}**:\n\n${lines}\n\nClass-weighted delay: **${num(block.weightedDelayMin)} train-minutes**${block.overridden ? ' (computed for the optimiser window; Control changed the window)' : ''}.`,
      source: 'delay model over the working timetable',
      labels: ['planningEstimate'],
      actions: [{ kind: 'block', id: block.id }],
    };
  };

  const tsrAnswer = (): Answer => {
    const registered = snapshot.tasks.filter((x) => x.tsrKmph);
    const manual = tsrs.filter((x) => x.corridorId === snapshot.corridor.id && x.status === 'IN_FORCE');
    if (!registered.length && !manual.length) return { text: 'No TSR is in force on this corridor in the registers or the TSR register.', source: 'TMS / SMMS / TDMS registers and the TSR register', labels: ['seededFeed'], actions: [] };
    const reg = registered.map((x) => `• **${x.id}** ${x.tsrKmph} km/h on ${x.sectionLabel} ${x.line} — ${x.label}${x.tsrSinceDays ? `, in force ${x.tsrSinceDays} d` : ''}`).join('\n');
    const man = manual.map((x) => `• **${x.id}** ${x.kmph} km/h, km ${x.fromKm}–${x.toKm} ${x.line} — ${x.reason}`).join('\n');
    return {
      text: `${registered.length ? `**${registered.length} TSR${registered.length === 1 ? '' : 's'} from the registers:**\n${reg}\n\n` : ''}${manual.length ? `**${manual.length} TSR${manual.length === 1 ? '' : 's'} imposed in the TSR register:**\n${man}\n\n` : ''}Train-minutes lost to register TSRs this week under the plan: **${num(k.tsrTrainMinutes)}** (baseline ${num(b.tsrTrainMinutes)}).`,
      source: 'TMS / SMMS / TDMS registers and the TSR register',
      labels: ['seededFeed'],
      actions: [{ kind: 'route', to: 'caution' }],
    };
  };

  const baselineAnswer = (): Answer => ({
    text:
      `**Plan against the simulated decentralised baseline (same seed):**\n\n` +
      `• Possessions: **${k.blockCount}** vs ${b.blockCount}\n` +
      `• Possession hours: **${num(k.totalBlockHours, 1)}** vs ${num(b.totalBlockHours, 1)}\n` +
      `• Section-line hours closed: **${num(k.sectionLineHoursLost, 1)}** vs ${num(b.sectionLineHoursLost, 1)} (${num(d.sectionLineHoursSaved, 1)} returned to traffic)\n` +
      `• Corridor availability: **${pct(k.availability, 2)}** vs ${pct(b.availability, 2)}\n` +
      `• Co-location of closure works: **${pct(k.colocationRate, 1)}** vs ${pct(b.colocationRate, 1)}\n` +
      `• Mandatory works in time: **${k.mandatoryCompliant} of ${k.mandatoryTotal}** vs ${b.mandatoryCompliant} of ${b.mandatoryTotal}\n` +
      `• Class-weighted train delay: **${num(k.weightedDelayMin)}** vs ${num(b.weightedDelayMin)} train-minutes\n` +
      `• Estimated value this week: **${rupees(d.estRupeesSaved)}** (unit rates are assumptions)`,
    source: 'KPI engine, like-for-like against the baseline',
    labels: ['baseline', 'assumption'],
    actions: [{ kind: 'route', to: 'overview' }],
  });

  const mandatoryAnswer = (): Answer => {
    const list = snapshot.tasks.filter((x) => x.risk.mandatory).sort((x, y) => y.risk.arci - x.risk.arci);
    const lines = list.slice(0, 6).map((x) => `• **${x.id}** ${x.label} on ${x.sectionLabel} ${x.line} — ${placementText(snapshot, x)}`).join('\n');
    return {
      text: `The risk engine marks a work mandatory when its safety severity is at the top of the scale and it is due, or a TSR is already in force. Its ARCI is raised to the mandatory floor and the optimiser places it before any other work, whatever the cost.\n\nThis run: **${k.mandatoryTotal}** mandatory works, **${k.mandatoryCompliant}** placed by their due day (baseline ${b.mandatoryCompliant}).${lines ? `\n\n${lines}` : ''}`,
      source: 'ARCI risk engine and weekly plan',
      labels: ['model', 'solver'],
      actions: [...list.slice(0, 3).map((x): Action => ({ kind: 'task', id: x.id })), { kind: 'route', to: 'risk' }],
    };
  };

  const helpAnswer = (): Answer => ({
    text: t('help', { task: snapshot.tasks[0]?.id ?? '', block: firstBlockWithTrains?.id ?? '' }),
    source: t('srcRouter'),
    labels: [],
    actions: [],
  });

  /* ── new intents: text in the chosen language from the router's figures ── */
  const placementLine = (p: PlacementData): string => {
    if (p.scheduled) {
      const blockPart = p.blockId ? t('plInBlock', { id: p.blockId, state: p.blockState ? w(`s${p.blockState}` as WordKey) : '' }) : '';
      const main = t('plPlaced', { date: dateLabel(p.scheduled.date), start: p.scheduled.startText, end: p.scheduled.endText, line: lineText(p.scheduled.line), block: blockPart });
      return p.blockWindow?.overridden ? `${main} ${t('plOverride', { start: p.blockWindow.startText, end: p.blockWindow.endText })}` : main;
    }
    if (p.deferredReason) return t('plDeferred', { reason: p.deferredReason });
    if (p.rolling) return t('plRolling', { week: p.rolling.weekLabel });
    return t('plNone');
  };

  const ruleText = (v: NonNullable<AltData['ruleViolations']>[number]) =>
    v.rule === 'perDay' ? t('rulePerDay', { limit: v.limit }) : v.rule === 'concurrent' ? t('ruleConcurrent', { value: v.value, limit: v.limit }) : t('rulePremium', { value: v.value });

  const suggestAnswer = (sd: SuggestData): Answer => {
    const exampleTask = snapshot.tasks[0]?.id ?? '';
    if (sd.outcome === 'notFound') {
      return { text: sd.notFoundId ? t('sgNotFoundId', { id: sd.notFoundId }) : t('sgNotFound', { id: exampleTask }), source: t('srcRegister'), labels: [], actions: [] };
    }
    if (sd.outcome === 'unplanned' && sd.ref) {
      const kind = sd.matchedBy === 'report' ? 'report' : 'req';
      const status = sd.refStatus ? (kind === 'report' ? w(`h${sd.refStatus}` as WordKey) : w(`r${sd.refStatus}` as WordKey)) : '';
      return { text: t('sgUnplanned', { ref: sd.ref, status }), source: t('srcRecords'), labels: ['seededRecords'], actions: [{ kind, id: sd.ref }] };
    }
    if (sd.outcome === 'needKm' && sd.workType) {
      const midKm = Math.round(snapshot.corridor.lengthKm / 2);
      return { text: t('sgNeedKm', { type: sd.workType.label, corridor: snapshot.corridor.code, example: sd.query.target, km: midKm }), source: t('srcRegister'), labels: ['seededFeed'], actions: [] };
    }
    if (sd.outcome === 'offCorridor') {
      return { text: t('sgOffCorridor', { km: sd.query.km ?? '', corridor: snapshot.corridor.code, len: num(sd.corridorKm ?? snapshot.corridor.lengthKm) }), source: t('srcRegister'), labels: [], actions: [] };
    }
    const lines: string[] = [];
    const actions: Action[] = [];
    if (sd.task) {
      const task = sd.task;
      if (sd.matchedBy === 'workType' && sd.workType) {
        const many = (sd.matches ?? 0) > 1;
        if (sd.query.km !== null) lines.push(many ? t('sgNearest', { n: sd.matches ?? 0, type: sd.workType.label, km: sd.query.km, d: num(sd.kmDistance ?? 0, 1) }) : t('sgOnlyKm', { type: sd.workType.label, km: sd.query.km, d: num(sd.kmDistance ?? 0, 1) }));
        else lines.push(many ? t('sgTop', { n: sd.matches ?? 0, type: sd.workType.label }) : t('sgOnly', { type: sd.workType.label }));
      } else if (sd.matchedBy === 'requisition' && sd.ref) lines.push(t('sgViaReq', { ref: sd.ref }));
      else if (sd.matchedBy === 'report' && sd.ref) lines.push(t('sgViaReport', { ref: sd.ref }));
      const mand = task.mandatory ? t('sgMand', { date: dayDate(Math.max(0, task.dueDay)) }) : '';
      lines.push(t('sgHead', { label: task.label, id: task.id, section: task.sectionLabel, line: lineText(task.line), min: num(task.totalMin), mand }));
      if (sd.placement) lines.push(placementLine(sd.placement));
      actions.push({ kind: 'task', id: task.id });
      if (sd.placement?.blockId) actions.push({ kind: 'block', id: sd.placement.blockId });
      if (sd.matchedBy === 'requisition' && sd.ref) actions.push({ kind: 'req', id: sd.ref });
      if (sd.matchedBy === 'report' && sd.ref) actions.push({ kind: 'report', id: sd.ref });
    } else if (sd.workType && sd.scan) {
      lines.push(t('sgTypeHead', { type: sd.workType.label, km: sd.query.km ?? '', sections: sd.scan.sections.join(', '), min: num(sd.scan.workMin) }));
    }
    if (sd.basis === 'solver') {
      lines.push('', t('sgSolverHead'));
      for (const a of sd.alternatives) {
        lines.push(
          t('sgAlt', {
            date: dateLabel(a.date),
            start: a.startText,
            end: a.endText,
            line: a.line,
            scope: a.scope === 'block' ? t('sgScopeBlock') : '',
            trains: a.trainsAffected,
            delay: num(a.weightedDelayMin),
            premium: a.premiumConflicts,
            // a window that breaks a hard rule carries the rule penalty in its cost; show the rule instead of that number
            bad: a.feasible === false ? t('sgInfeasible', { reason: a.reason ?? '—' }) : t('sgCost', { cost: signedNum(a.deltaCost ?? 0) }),
          })
        );
      }
      return { text: lines.join('\n'), source: t('srcSolver'), labels: ['solver', 'planningEstimate'], actions };
    }
    if (sd.basis === 'scan' && sd.scan) {
      const s = sd.scan;
      lines.push(
        '',
        t('sgScanHead', {
          days: s.days,
          lines: s.lines.map((l) => lineText(l)).join(' / '),
          win: num(s.windowMin),
          work: num(s.workMin),
          minb: s.minBlockMin,
          margin: s.marginMin,
          sections: s.sections.join(', '),
          evaluated: s.evaluated,
          clash: s.clashesSkipped,
          zero: s.zeroTrainWindows,
        })
      );
      if (!s.lineClosure) lines.push(t('sgScanOpen'));
      if (s.exceedsMax) lines.push(t('sgScanMax', { win: num(s.windowMin), max: s.maxBlockMin }));
      if (!sd.alternatives.length) lines.push('', t('sgNoWindow'));
      else {
        lines.push('', t('sgScanRank', { n: sd.alternatives.length, due: s.mandatory ? t('sgScanRankDue') : '' }));
        for (const a of sd.alternatives) {
          const trains = a.trains?.length ? ` (${a.trains.map((x) => `${x.number} ${x.mode} ${x.delayMin} min`).join(', ')})` : '';
          const extra = `${a.ruleViolations?.length ? t('sgBreaks', { rules: a.ruleViolations.map(ruleText).join('; ') }) : ''}${a.afterDue ? t('sgAfterDue') : ''}`;
          lines.push(t('sgScanAlt', { date: dateLabel(a.date), start: a.startText, end: a.endText, line: a.line, trains: a.trainsAffected, delay: num(a.weightedDelayMin), premium: a.premiumConflicts, list: trains, extra }));
        }
      }
      return { text: lines.join('\n'), source: t('srcScan'), labels: ['planningEstimate', 'wttPositions'], actions };
    }
    return { text: lines.join('\n'), source: t('srcRegister'), labels: [], actions };
  };

  const historyLines = (h: HistoryData[]) => (h.length ? [t('stHistory'), ...h.map((x) => t('stHistLine', { at: when(x.at), action: x.action, by: x.by, note: x.note ? `: ${x.note}` : '' }))] : []);

  const statusAnswer = (sd: StatusData): Answer => {
    if (sd.kind === 'notFound') return { text: t('stNotFound', { id: sd.id, task: snapshot.tasks[0]?.id ?? '' }), source: t('srcRecords'), labels: [], actions: [] };
    const lines: string[] = [];
    const actions: Action[] = [];
    if (sd.kind === 'block') {
      const bw = sd.block;
      lines.push(t('stBlockHead', { id: sd.id, state: w(sd.state) }));
      if (sd.movedFrom) lines.push(t('stMoved', { old: sd.movedFrom }));
      if (bw.date && bw.startText && bw.endText) lines.push(t('stWindow', { date: dateLabel(bw.date), start: bw.startText, end: bw.endText, line: lineText(bw.line), section: bw.sectionText ? `, ${bw.sectionText}` : '', depts: bw.departments.join(' + ') }));
      if (!bw.inPlan) lines.push(t('stNotInPlan'));
      if (bw.trainsAffected !== null) lines.push(t('stTrains', { n: bw.trainsAffected, delay: num(bw.weightedDelayMin ?? 0) }));
      const ap = sd.approval;
      if (ap) {
        lines.push(ap.proposedAt ? t('stSent', { by: ap.proposedBy ?? '—', at: when(ap.proposedAt) }) : t('stNotSent'));
        if (ap.concur.length) {
          lines.push(t('stConcurHead'));
          for (const c of ap.concur) lines.push(c.by ? t('stConcur', { dept: c.dept, by: c.by, at: when(c.at), note: c.note ? ` — ${c.note}` : '' }) : t('stConcurPending', { dept: c.dept }));
        }
        for (const o of ap.objections) lines.push(t('stObjection', { dept: o.dept, by: o.by, at: when(o.at), reason: o.reason }));
        if (ap.grantedAt) lines.push(t('stGranted', { by: ap.grantedBy ?? '—', at: when(ap.grantedAt) }));
        if (ap.lockedAt) lines.push(t('stLocked', { by: ap.lockedBy ?? '—', at: when(ap.lockedAt) }));
        if (ap.refusal) lines.push(t('stRefused', { by: ap.refusal.by, at: when(ap.refusal.at), reason: ap.refusal.reason }));
        if (ap.override) lines.push(t('stOverride', { from: ap.override.planStartText && ap.override.planEndText ? `${ap.override.planStartText}–${ap.override.planEndText}` : '—', to: `${ap.override.startText}–${ap.override.endText}`, by: ap.override.by, at: when(ap.override.at) }));
        if (ap.supersededAt) lines.push(t('stSuperseded', { at: when(ap.supersededAt) }));
        if (ap.incharge) lines.push(t('stIncharge', { name: ap.incharge }));
      } else lines.push(t('stNotSent'));
      const ex = sd.extensions;
      lines.push(ex.list.length ? t('stExt', { pending: ex.pending, approved: ex.approved, min: num(ex.approvedMin), refused: ex.refused }) : t('stExtNone'));
      if (sd.execution) {
        const e = sd.execution;
        lines.push(t('stExec', { status: w(`e${e.status}` as WordKey), started: e.actualStartText ? t('stExecStarted', { time: e.actualStartText }) : '', cleared: e.actualEndText ? t('stExecCleared', { time: e.actualEndText }) : '', done: e.itemsDone, items: e.items }));
        if (e.overrunCause) lines.push(t('stExecCause', { cause: e.overrunCause }));
      } else lines.push(t('stExecNone'));
      if (sd.power) lines.push(t('stPower', { status: w(`p${sd.power.status}` as WordKey), by: sd.power.by ?? '—', at: when(sd.power.at) }));
      else if (sd.powerNeeded) lines.push(t('stPowerNone'));
      if (sd.t351.length) lines.push(t('stT351', { done: sd.t351.filter((x) => x.status === 'RECEIVED' || x.status === 'RECONNECTED').length, n: sd.t351.length }));
      lines.push(t('stMsgs', { n: sd.messages.count, last: sd.messages.lastAt ? t('stMsgLast', { at: when(sd.messages.lastAt) }) : '' }));
      if (bw.inPlan) actions.push({ kind: 'block', id: sd.id });
      if (sd.execution) actions.push({ kind: 'route', to: 'execution' });
      return { text: lines.join('\n'), source: t('srcRecords'), labels: ['seededRecords', 'solver'], actions };
    }
    const landedLine = (l: LandedData | null, waiting: boolean, waitKey: Key) => {
      if (l) {
        actions.push({ kind: 'task', id: l.taskId });
        if (l.placement.blockId) actions.push({ kind: 'block', id: l.placement.blockId });
        return t('stLanded', { task: l.taskId, placement: placementLine(l.placement) });
      }
      return waiting ? t(waitKey) : null;
    };
    if (sd.kind === 'req') {
      const r = sd.req;
      actions.push({ kind: 'req', id: r.id });
      lines.push(t('stReqHead', { no: r.no, id: r.id, status: w(`r${r.status}` as WordKey) }));
      lines.push(t('stReqWork', { dept: r.dept, work: r.workLabel, line: lineText(r.line), from: r.startKm, to: r.endKm, min: num(r.durationMin), pref: r.preferredDate ? t('stReqPref', { date: dateLabel(r.preferredDate.slice(0, 10)) }) : '' }));
      if (r.otherCorridor) lines.push(t('stOther', { corridor: snapshot.corridor.code }));
      if (r.cellRemarks) lines.push(t('stReqRemarks', { text: r.cellRemarks }));
      if (r.validation.length) lines.push(t('stReqValidation', { text: r.validation.join('; ') }));
      const landed = landedLine(sd.landed, sd.awaitingReplan, 'stReqWaiting');
      if (landed) lines.push(landed);
      lines.push(...historyLines(sd.history));
      return { text: lines.join('\n'), source: t('srcRecords'), labels: ['seededRecords'], actions };
    }
    const r = sd.report;
    actions.push({ kind: 'report', id: r.id });
    lines.push(t('stRepHead', { id: r.id, status: w(`h${r.status}` as WordKey) }));
    lines.push(
      t('stRepWhat', {
        category: w(`c${r.category}` as WordKey),
        severity: r.severity ? w(r.severity) : t('sevUnrated'),
        auto: r.severityAuto && r.severityReasons.length ? t('stRepAuto', { reasons: r.severityReasons.join('; ') }) : '',
        dept: r.dept ?? t('stRepControl'),
        assignee: r.assignee ? t('stRepAssignee', { name: r.assignee }) : '',
        where: r.km !== null ? t('stRepWhere', { km: num(r.km, 2), line: r.line ? ` ${lineText(r.line)}` : '' }) : '',
      })
    );
    if (r.otherCorridor) lines.push(t('stOther', { corridor: snapshot.corridor.code }));
    const landed = landedLine(sd.landed, sd.awaitingReplan, 'stRepWaiting');
    if (landed) lines.push(landed);
    lines.push(...historyLines(sd.history));
    return { text: lines.join('\n'), source: t('srcRecords'), labels: ['seededRecords'], actions };
  };

  const todayAnswer = (td: TodayData): Answer => {
    const lines: string[] = [];
    lines.push(t('tdHead', { date: dateLabel(td.date), time: td.nowMinute !== null ? hhmm(td.nowMinute) : '—' }), '');
    const states = (Object.entries(td.blocks.byState) as [WorkflowState, number][]).filter(([, n]) => n > 0).map(([s, n]) => `${n} ${w(`s${s}` as WordKey)}`);
    lines.push(t('tdBlocks', { n: td.blocks.total, states: states.length ? ` (${states.join(', ')})` : '' }));
    lines.push(t('tdPossessions', { started: td.execution.started, cleared: td.execution.cleared, inprog: td.execution.inProgress, late: td.execution.clearedLate ? t('tdLate', { n: td.execution.clearedLate }) : '' }));
    if (td.conflicts) {
      lines.push(t('tdConflicts', { n: td.conflicts.today.total, h: td.conflicts.today.high, m: td.conflicts.today.medium, l: td.conflicts.today.low, w: td.conflicts.week.total }));
      lines.push(t('tdSafety', { n: td.conflicts.safetyWeek, today: td.conflicts.safetyToday }));
    }
    if (td.running) lines.push(t('tdRunning', { n: td.running.count, worst: td.running.count ? t('tdWorst', { min: num(td.running.maxOverMin), id: td.running.blockIds[0] ?? '' }) : '' }));
    lines.push(t('tdAnoms', { n: td.anomalies.overrun, h: td.anomalies.high, m: td.anomalies.medium, l: td.anomalies.low }));
    lines.push(t('tdIncidents', { n: td.incidents.open, h: td.incidents.high, m: td.incidents.medium, l: td.incidents.low, u: td.incidents.unrated, unv: td.incidents.unverified, tri: td.incidents.triaged }));
    lines.push(t('tdExt', { n: td.extensions.pending, min: td.extensions.pending ? t('tdExtMin', { min: num(td.extensions.pendingMin) }) : '' }));
    lines.push(t('tdCaution', { n: td.caution.issued, t351: td.caution.t351Issued }));
    const actions: Action[] = [];
    if (td.running?.blockIds[0]) actions.push({ kind: 'block', id: td.running.blockIds[0] });
    actions.push({ kind: 'route', to: 'execution' }, { kind: 'route', to: 'incidents' }, { kind: 'route', to: 'caution' });
    return { text: lines.join('\n'), source: t('srcToday'), labels: ['seededRecords', 'model'], actions };
  };

  /** Workflow records the router reads (computed at ask time, so the wall clock is current). */
  const routerContext = () => {
    const nowMinute = nowMinuteIST();
    return {
      blocks,
      approvals,
      requisitions,
      reports,
      extensions,
      executionLog,
      forms,
      powerBlocks,
      messages: siteMessages,
      conflicts: conflictsFor(snapshot, blocks, approvals, null, { forms, powerBlocks, executionLog }),
      running: blocksRunningPastEnd(blocks, executionLog, nowMinute, 0),
      nowMinute,
    };
  };

  const respond = (q: string): Answer => {
    const ctx = routerContext();
    const first = askCopilot(q, snapshot, ctx) as unknown as EngineAnswer;
    if (first.intent === 'outOfScope') return { text: t('outOfScope'), source: t('srcScope'), labels: [], actions: [] };
    if (first.intent === 'suggest') return suggestAnswer(first.data as SuggestData);
    if (first.intent === 'status') return statusAnswer(first.data as StatusData);
    if (first.intent === 'today') return todayAnswer(first.data as TodayData);
    if (MANDATORY_RE.test(q)) return mandatoryAnswer();
    const day = dayFromQuery(q, snapshot.planStart);
    // the engine router only knows "day N", "today" and "tomorrow"; weekday names are resolved here
    const routed = day !== null && !/\bwhy\b/i.test(q) && /block|possession|planned|scheduled/i.test(q) ? `blocks day ${day}` : q;
    const r = routed === q ? first : (askCopilot(routed, snapshot, ctx) as unknown as EngineAnswer);
    switch (r.intent) {
      case 'why': {
        const task = snapshot.tasks.find((x) => x.id === r.links[0]?.id);
        return task ? whyAnswer(task) : helpAnswer();
      }
      case 'day':
        return dayAnswer(day ?? (r.data as { day?: number } | undefined)?.day ?? 0);
      case 'trains': {
        const block = blocks.find((x) => x.id === r.links[0]?.id);
        return block ? blockAnswer(block) : helpAnswer();
      }
      case 'tsr':
        return tsrAnswer();
      case 'baseline':
        return baselineAnswer();
      case 'top':
        return { text: r.answer, source: 'ARCI ranking of the task register', labels: ['model'], actions: [...r.links.filter((l) => l.type === 'task').map((l): Action => ({ kind: 'task', id: l.id })), { kind: 'route', to: 'risk' }] };
      default:
        return helpAnswer();
    }
  };

  const ask = (q: string) => {
    const query = q.trim();
    if (!query) return;
    const at = clock();
    const stamp = messageStamp();
    setMessages((prev) => [...prev, { id: `u-${stamp}`, who: 'user', text: query, at }, { id: `c-${stamp}`, who: 'copilot', text: '', at, answer: respond(query) }]);
    setInput('');
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    ask(input);
  };

  const presets: { label: string; query: string }[] = [
    ...(suggestTaskId ? [{ label: t('pSuggest', { id: suggestTaskId }), query: `Suggest a block for ${suggestTaskId}` }] : []),
    ...(statusBlock ? [{ label: t('pStatus', { id: statusBlock.id }), query: `Status of ${statusBlock.id}` }] : []),
    { label: t('pToday'), query: 'Today’s report' },
    { label: t('pWhy'), query: 'Why is the top-ranked work first?' },
    { label: t('pTomorrow'), query: 'What blocks are planned tomorrow?' },
    ...(firstBlockWithTrains ? [{ label: t('pBlock', { id: firstBlockWithTrains.id }), query: `Which trains are affected by block ${firstBlockWithTrains.id}?` }] : []),
    { label: t('pTsr'), query: 'Show TSRs in force' },
    { label: t('pBaseline'), query: 'Compare the plan with the baseline' },
    { label: t('pTop'), query: 'Top priority works' },
    { label: t('pMandatory'), query: 'Explain the mandatory safety floor' },
  ];

  const renderAction = (a: Action, i: number) => {
    if (a.kind === 'route') {
      const to = routeFor(a.to);
      if (!to) return null;
      return (
        <button key={i} type="button" className="btn btn-sm btn-ghost" onClick={() => nav(to)}>
          <ExternalLink /> {t(ROUTE_LABEL[a.to])}
        </button>
      );
    }
    if (a.kind === 'req' || a.kind === 'report') {
      const to = a.kind === 'req' ? reqHref(portal, a.id) : reportHref(portal, a.id);
      if (!to) return null;
      return (
        <button key={i} type="button" className="btn btn-sm" onClick={() => nav(to)}>
          <ExternalLink /> {t(a.kind === 'req' ? 'openReq' : 'openReport', { id: a.id })}
        </button>
      );
    }
    const other = a.kind === 'task' ? 'block' : 'task';
    return (
      <button key={i} type="button" className="btn btn-sm" onClick={() => drawer.open(a.kind, a.id, { close: other })}>
        {t(a.kind === 'task' ? 'openTask' : 'openBlock', { id: a.id })}
      </button>
    );
  };

  return (
    <div className="stack-lg" style={{ maxWidth: 960, margin: '0 auto', width: '100%' }}>
      <PageHeader
        title={t('title')}
        lede={t('lede', { corridor: snapshot.corridor.name })}
        actions={
          <button type="button" className="btn btn-sm" onClick={() => setMessages([])} disabled={!messages.length}>
            <RotateCcw /> {t('clear')}
          </button>
        }
      />

      <div className="row-wrap">
        {presets.map((p) => (
          <button key={p.query} type="button" className="btn btn-sm" onClick={() => ask(p.query)}>
            {p.label}
          </button>
        ))}
      </div>

      <Card>
        <CardBody>
          <div className="stack" style={{ gap: 14, minHeight: 280, maxHeight: '60vh', overflowY: 'auto' }} aria-live="polite">
            {!messages.length && <div className="well small muted">{t('welcome')}</div>}
            {messages.map((m) =>
              m.who === 'user' ? (
                <div key={m.id} className="stack" style={{ alignItems: 'flex-end', gap: 4 }}>
                  <span className="tiny muted">
                    {t('you')} · {m.at}
                  </span>
                  <div className="small" style={{ maxWidth: '85%', padding: '10px 14px', borderRadius: 'var(--radius)', background: 'var(--pastel-blue)', color: 'var(--on-blue)', border: '1px solid var(--line)', overflowWrap: 'anywhere' }}>
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="stack" style={{ alignItems: 'flex-start', gap: 4 }}>
                  <span className="tiny muted">
                    <b>{t('copilot')}</b> · {m.at}
                  </span>
                  {m.answer && (
                    <div className="well small" style={{ maxWidth: '92%', lineHeight: 1.6, overflowWrap: 'anywhere' }}>
                      <Rich text={m.answer.text} />
                      {m.answer.actions.length > 0 && <div className="row-wrap mt">{m.answer.actions.map(renderAction)}</div>}
                    </div>
                  )}
                  {m.answer && (
                    <div className="row-wrap tiny muted">
                      <span>{t('source', { source: m.answer.source })}</span>
                      {m.answer.labels.map((kind) => (
                        <SimLabel key={kind} kind={kind} system={kind === 'seededFeed' ? 'TMS / SMMS / TDMS' : undefined} seed={kind === 'seededFeed' ? 26027 : undefined} source={kind === 'assumption' ? 'KPI unit rates' : undefined} short />
                      ))}
                    </div>
                  )}
                </div>
              )
            )}
          </div>

          <form onSubmit={onSubmit} className="mt-lg">
            <div className="row">
              <input
                type="text"
                className="input grow"
                placeholder={t('placeholder')}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                aria-label={t('placeholder')}
                data-tour="copilot-input"
              />
              <button type="submit" className="btn btn-primary" disabled={!input.trim()}>
                <Send /> {t('send')}
              </button>
            </div>
            <div className="tiny muted mt">{t('note')}</div>
          </form>
        </CardBody>
      </Card>

      <TaskDrawer taskId={drawer.taskId} onClose={() => drawer.close('task')} mode={portal === 'planning' ? 'full' : 'readOnly'} />
      <BlockDrawer blockId={drawer.blockId} onClose={() => drawer.close('block')} />
    </div>
  );
}
