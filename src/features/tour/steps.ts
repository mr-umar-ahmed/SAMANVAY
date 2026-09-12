/**
 * First-run tour per portal. Targets are data-tour attributes rendered by the
 * shell, the kit (PageHeader → "page-head", WeeklyGantt → "weekly-gantt",
 * StringDiagram → "string-diagram", CorridorMap → "corridor-map") and the
 * pages. A target that is missing or off-screen falls back to a centred card.
 */
import type { PortalId } from '../../auth/portals';
import type { TourStep } from './tour';

type Localised = { en: TourStep[]; hi: TourStep[] };

export const TOUR_STEPS: Partial<Record<PortalId, Localised>> = {
  planning: {
    en: [
      { target: 'portal-chip', route: '/app/planning/overview', title: 'Block Planning Cell', body: 'Every page in this portal reads one plan, computed on your device by the optimiser from the TMS, SMMS and TDMS registers, the COA timetable and the FOIS goods forecast.' },
      { target: 'overview-safety', route: '/app/planning/overview', title: 'Safety before optimisation', body: 'Mandatory safety work is a hard constraint up to its due day. If the optimiser cannot place one on time, this banner names the work and the rule that stops it; otherwise it counts the mandatory works placed on time.' },
      { target: 'overview-kpis', route: '/app/planning/overview', title: 'Plan versus today’s practice', body: 'Each figure is computed twice: by SAMANVAY, and by a simulated decentralised baseline where every department asks for its own block. The difference is the gain.' },
      { target: 'risk-table', route: '/app/planning/risk', title: 'Why this order', body: 'ARCI ranks every job from failure probability, traffic disruption, overdue days and a learned escalation probability, scaled by safety. Open any row to see each term.' },
      { target: 'weekly-gantt', route: '/app/planning/weekly', title: 'Weekly block plan', body: 'Seven days of possessions laid into the natural gaps of the timetable. Striped bars are joint blocks — several departments sharing one line closure. Click a bar for the requisition.' },
      { target: 'weekly-conflicts', route: '/app/planning/weekly', title: 'Conflicts and dependencies', body: 'Double-booked machines and gangs, JPO limits, premium paths, pending T/351s, objections, safety conflicts and requisition dependencies, grouped by severity. Each row opens the block or the work.' },
      { target: 'weekly-send', route: '/app/planning/weekly', title: 'Send to Control', body: 'When the week looks right, send it. Each department concurs on its blocks, then the Section Controller grants them. A block changed by a later re-plan is listed to send again.' },
      { target: 'optimiser-solver', route: '/app/planning/optimiser', title: 'Exact solver', body: 'The plan is built by an exact MILP solved in the browser by HiGHS, then polished by simulated annealing. The last run’s status, objective, best bound and optimality gap are shown here; greedy + annealing is the fallback.' },
      { target: 'optimiser-run', route: '/app/planning/optimiser', title: 'Tune and compare', body: 'Change the objective weights or the JPO rules, run a candidate, and compare it with the working plan before adopting it. The risk weight has a floor so efficiency cannot override safety.' },
      { target: 'handoff-matrix', route: '/app/planning/handoff', title: 'BDMS hand-off', body: 'Concurrence, grant and lock for every block, with the audit trail and the BDMS demand payload as CSV or JSON.' },
      { target: 'replan', title: 'Re-plan at any time', body: 'After a new requisition, an accepted field report or a scenario, re-plan here. The engine runs in the background.' },
    ],
    hi: [
      { target: 'portal-chip', route: '/app/planning/overview', title: 'ब्लॉक योजना प्रकोष्ठ', body: 'इस पोर्टल का हर पेज एक ही योजना पढ़ता है, जिसे ऑप्टिमाइज़र आपके डिवाइस पर TMS, SMMS, TDMS रजिस्टर, COA समय-सारणी और FOIS पूर्वानुमान से बनाता है।' },
      { target: 'overview-safety', route: '/app/planning/overview', title: 'अनुकूलन से पहले सुरक्षा', body: 'अनिवार्य सुरक्षा कार्य अपने देय दिन तक कठोर बाधा है। ऑप्टिमाइज़र किसी को समय पर न रख सके तो यह बैनर कार्य और रोकने वाला नियम बताता है; अन्यथा समय पर रखे अनिवार्य कार्य गिनता है।' },
      { target: 'overview-kpis', route: '/app/planning/overview', title: 'योजना बनाम आज की प्रथा', body: 'हर आँकड़ा दो बार गणित होता है: समन्वय द्वारा, और सिम्युलेटेड विकेंद्रीकृत आधार-रेखा द्वारा। अंतर ही लाभ है।' },
      { target: 'risk-table', route: '/app/planning/risk', title: 'यह क्रम क्यों', body: 'ARCI हर कार्य को विफलता संभावना, यातायात व्यवधान, देय दिन और सीखी गई एस्केलेशन संभावना से रैंक करता है। हर पंक्ति खोलकर हर पद देखें।' },
      { target: 'weekly-gantt', route: '/app/planning/weekly', title: 'साप्ताहिक ब्लॉक योजना', body: 'सात दिनों के पज़ेशन समय-सारणी के प्राकृतिक अंतरालों में। धारीदार पट्टियाँ संयुक्त ब्लॉक हैं। विवरण के लिए पट्टी पर क्लिक करें।' },
      { target: 'weekly-conflicts', route: '/app/planning/weekly', title: 'टकराव और निर्भरताएँ', body: 'दोहरी बुक मशीन व गैंग, JPO सीमाएँ, प्रीमियम पथ, लंबित T/351, आपत्तियाँ, सुरक्षा टकराव और माँग-पत्र निर्भरताएँ, गंभीरता अनुसार। हर पंक्ति ब्लॉक या कार्य खोलती है।' },
      { target: 'weekly-send', route: '/app/planning/weekly', title: 'नियंत्रण को भेजें', body: 'सप्ताह ठीक लगे तो भेजें। हर विभाग अपने ब्लॉक पर सहमति देता है, फिर अनुभाग नियंत्रक प्रदान करते हैं। बाद की पुनः योजना से बदला ब्लॉक फिर से भेजने के लिए सूचीबद्ध होता है।' },
      { target: 'optimiser-solver', route: '/app/planning/optimiser', title: 'सटीक सॉल्वर', body: 'योजना ब्राउज़र में HiGHS से हल होने वाले सटीक MILP से बनती है, फिर सिम्युलेटेड एनीलिंग सुधारती है। पिछले रन की स्थिति, उद्देश्य मान, सर्वश्रेष्ठ सीमा और इष्टतमता अंतर यहाँ दिखते हैं; ग्रीडी + एनीलिंग विकल्प है।' },
      { target: 'optimiser-run', route: '/app/planning/optimiser', title: 'समायोजित करें और तुलना करें', body: 'उद्देश्य भार या JPO नियम बदलें, एक विकल्प चलाएँ और अपनाने से पहले चालू योजना से तुलना करें। जोखिम भार की न्यूनतम सीमा है ताकि दक्षता सुरक्षा पर हावी न हो।' },
      { target: 'handoff-matrix', route: '/app/planning/handoff', title: 'BDMS हैंड-ऑफ़', body: 'हर ब्लॉक की सहमति, प्रदान और लॉक, ऑडिट ट्रेल और BDMS माँग पेलोड CSV या JSON में।' },
      { target: 'replan', title: 'कभी भी पुनः योजना', body: 'नई माँग, स्वीकृत फ़ील्ड रिपोर्ट या परिदृश्य के बाद यहाँ से पुनः योजना बनाएँ।' },
    ],
  },
  control: {
    en: [
      { target: 'portal-chip', route: '/app/control/board', title: 'Control Office', body: 'The Section Controller keeps the final word. Nothing becomes a possession until it is granted here.' },
      { target: 'string-diagram', route: '/app/control/board', title: 'The control chart', body: 'Train paths from the working timetable and the goods forecast, the planned blocks, free headway windows and TSRs on one time–distance chart.' },
      { target: 'control-tonight', route: '/app/control/board', title: 'Tonight', body: 'Blocks in time order with their concurrence status. Grant when every department has concurred, grant with a changed window, or refuse with a reason.' },
      { target: 'control-conflicts', route: '/app/control/board', title: 'Conflicts tonight', body: 'What stands in the way of the day: double-booked machines or gangs, too many simultaneous possessions, premium paths, T/351 and OHE isolation records, objections and safety conflicts. Switch to the whole week; each row opens the block.' },
      { target: 'control-deviations', route: '/app/control/board', title: 'Execution deviations', body: 'Extension requests from site with their delay impact, possessions running past the planned end, site messages with a reply box, and loco pilot acknowledgements of caution orders.' },
      { target: 'control-lock', route: '/app/control/board', title: 'Lock tomorrow', body: 'Locking writes the granted blocks into the next day’s programme. Every action goes to the audit trail.' },
      { target: 'caution-orders', route: '/app/control/caution', title: 'Caution orders', body: 'Form T/409 and T/409B caution orders and T/351 disconnection notices are generated from the plan and print on A4. An emergency TSR re-plans the week.' },
      { target: 'corridor-map', route: '/app/control/map', title: 'Corridor map', body: 'Train positions are derived from the timetable at the chosen minute — no telemetry is invented. Blocks, works and incident reports sit on the same map.' },
      { target: 'nav-control-incidents', title: 'Incidents', body: 'Reports from loco pilots, gangs and citizens arrive here with their location snapped to the corridor. Verify, impose a caution or send them to the department.' },
    ],
    hi: [
      { target: 'portal-chip', route: '/app/control/board', title: 'नियंत्रण कार्यालय', body: 'अंतिम निर्णय अनुभाग नियंत्रक का। यहाँ प्रदान होने तक कुछ भी पज़ेशन नहीं बनता।' },
      { target: 'string-diagram', route: '/app/control/board', title: 'नियंत्रण चार्ट', body: 'कार्य समय-सारणी और मालगाड़ी पूर्वानुमान के ट्रेन पथ, नियोजित ब्लॉक, खाली हेडवे खिड़कियाँ और TSR एक ही समय–दूरी चार्ट पर।' },
      { target: 'control-tonight', route: '/app/control/board', title: 'आज रात', body: 'समय क्रम में ब्लॉक, सहमति स्थिति के साथ। सभी विभागों की सहमति पर प्रदान करें, बदली खिड़की के साथ प्रदान करें, या कारण सहित अस्वीकार करें।' },
      { target: 'control-conflicts', route: '/app/control/board', title: 'आज रात के टकराव', body: 'दिन की बाधाएँ: दोहरी बुक मशीन या गैंग, बहुत अधिक एक साथ पज़ेशन, प्रीमियम पथ, T/351 और OHE आइसोलेशन रिकॉर्ड, आपत्तियाँ और सुरक्षा टकराव। पूरे सप्ताह पर जाएँ; हर पंक्ति ब्लॉक खोलती है।' },
      { target: 'control-deviations', route: '/app/control/board', title: 'निष्पादन विचलन', body: 'साइट से विस्तार अनुरोध उनके विलंब प्रभाव सहित, नियोजित समाप्ति के बाद भी जारी पज़ेशन, उत्तर के साथ साइट संदेश, और सतर्कता आदेशों की लोको पायलट पावती।' },
      { target: 'control-lock', route: '/app/control/board', title: 'कल को लॉक करें', body: 'लॉक करने से प्रदान किए गए ब्लॉक अगले दिन के कार्यक्रम में दर्ज होते हैं। हर कार्रवाई ऑडिट में जाती है।' },
      { target: 'caution-orders', route: '/app/control/caution', title: 'सतर्कता आदेश', body: 'फ़ॉर्म T/409, T/409B और T/351 योजना से बनते हैं और A4 पर प्रिंट होते हैं। आपात TSR सप्ताह की पुनः योजना बनाता है।' },
      { target: 'corridor-map', route: '/app/control/map', title: 'कॉरिडोर मानचित्र', body: 'ट्रेन स्थितियाँ चुने गए मिनट पर समय-सारणी से व्युत्पन्न हैं — कोई टेलीमेट्री गढ़ी नहीं गई।' },
      { target: 'nav-control-incidents', title: 'घटनाएँ', body: 'लोको पायलट, गैंग और नागरिकों की रिपोर्ट स्थान सहित यहाँ आती हैं। सत्यापित करें, सतर्कता लगाएँ या विभाग को भेजें।' },
    ],
  },
  tms: deptTour('tms'),
  smms: deptTour('smms'),
  tdms: deptTour('tdms'),
  division: {
    en: [
      { target: 'portal-chip', route: '/app/division/brief', title: 'Divisional view', body: 'What the DRM needs: availability, closures, safety compliance and money — each against the decentralised baseline.' },
      { target: 'division-kpis', route: '/app/division/brief', title: 'Computed, not asserted', body: 'Every number here comes from the plan. Rupee figures multiply plan quantities by unit assumptions you can edit.' },
      { target: 'roi-table', route: '/app/division/roi', title: 'ROI audit', body: 'Line by line: delay penalties, corridor capacity, demurrage, traction energy, mobilisation. Change an assumption and only its line moves.' },
      { target: 'programme-weeks', route: '/app/division/plans', title: 'Approve the programme', body: 'The 26-week programme with the 10-week JPO notice check. Approve it or return it with remarks.' },
      { target: 'nav-division-escalations', title: 'Escalations', body: 'Mandatory work that could not be placed, blocks refused repeatedly, stale requisitions and old incidents — each with a link to act.' },
    ],
    hi: [
      { target: 'portal-chip', route: '/app/division/brief', title: 'मंडल दृश्य', body: 'DRM को जो चाहिए: उपलब्धता, बंदी, सुरक्षा अनुपालन और धन — हर एक आधार-रेखा की तुलना में।' },
      { target: 'division-kpis', route: '/app/division/brief', title: 'गणित से, दावा नहीं', body: 'यहाँ का हर आँकड़ा योजना से आता है। रुपये के आँकड़े संपादन-योग्य इकाई मान्यताओं से बनते हैं।' },
      { target: 'roi-table', route: '/app/division/roi', title: 'ROI ऑडिट', body: 'पंक्ति दर पंक्ति। मान्यता बदलें और केवल उसकी पंक्ति बदलती है।' },
      { target: 'programme-weeks', route: '/app/division/plans', title: 'कार्यक्रम स्वीकृत करें', body: '10-सप्ताह JPO नोटिस जाँच के साथ 26-सप्ताह कार्यक्रम। स्वीकृत करें या टिप्पणी के साथ लौटाएँ।' },
      { target: 'nav-division-escalations', title: 'एस्केलेशन', body: 'न रखे जा सके अनिवार्य कार्य, बार-बार अस्वीकृत ब्लॉक, पुरानी माँगें और घटनाएँ — हर एक पर कार्रवाई की कड़ी।' },
    ],
  },
  field: {
    en: [
      { target: 'field-card', route: '/app/field/today', title: 'Today’s possession', body: 'Your granted block for today with its window, section, works and partner departments.' },
      { target: 'field-buttons', route: '/app/field/today', title: 'Start, done, clear', body: 'Start when the line is handed over, mark each work done with the actual minutes, clear when the line is handed back. The actual times recalibrate future plans.' },
      { target: 'report-form', route: '/app/field/report', title: 'Report an incident', body: 'Photo, location and a few words. The report goes to Control and the department for checking; if accepted it becomes a planned work.' },
      { target: 'cautions', route: '/app/field/caution', title: 'Caution orders in force', body: 'Speed restrictions on the corridor, generated from the register and Control. Loco pilots acknowledge each order here.' },
    ],
    hi: [
      { target: 'field-card', route: '/app/field/today', title: 'आज का पज़ेशन', body: 'आज का आपका प्रदान किया गया ब्लॉक — खिड़की, सेक्शन, कार्य और साझेदार विभाग।' },
      { target: 'field-buttons', route: '/app/field/today', title: 'शुरू, पूर्ण, क्लियर', body: 'लाइन सौंपे जाने पर शुरू करें, हर कार्य वास्तविक मिनटों के साथ पूर्ण करें, लाइन लौटाने पर क्लियर करें। वास्तविक समय आगे की योजना सुधारते हैं।' },
      { target: 'report-form', route: '/app/field/report', title: 'घटना की रिपोर्ट', body: 'फ़ोटो, स्थान और कुछ शब्द। रिपोर्ट जाँच के लिए नियंत्रण और विभाग तक जाती है; स्वीकृत होने पर नियोजित कार्य बनती है।' },
      { target: 'cautions', route: '/app/field/caution', title: 'लागू सतर्कता आदेश', body: 'कॉरिडोर पर गति प्रतिबंध, रजिस्टर और नियंत्रण से बने। लोको पायलट हर आदेश की पावती यहाँ देते हैं।' },
    ],
  },
  citizen: {
    en: [
      { target: 'lang', route: '/citizen', title: 'Your language', body: 'Choose from eight languages. It applies to everything in this portal.' },
      { target: 'search', route: '/citizen', title: 'Train or station', body: 'Search a train number or a station to see planned track work for the next seven days.' },
      { target: 'advisory', route: '/citizen', title: 'What it means for you', body: 'Each advisory shows the window and how a train is handled. No PNR, seat or live running here — only planned maintenance.' },
      { target: 'report', route: '/citizen', title: 'Report a hazard', body: 'Saw something unsafe near the track? Send a photo and your location, and keep the reference to follow it.' },
      { target: 'install', route: '/citizen', title: 'Keep it on your phone', body: 'Install SAMANVAY for quick access, even on a weak signal.' },
    ],
    hi: [
      { target: 'lang', route: '/citizen', title: 'आपकी भाषा', body: 'आठ भाषाओं में से चुनें। यह इस पोर्टल की हर चीज़ पर लागू होती है।' },
      { target: 'search', route: '/citizen', title: 'ट्रेन या स्टेशन', body: 'अगले सात दिनों के नियोजित ट्रैक कार्य देखने के लिए ट्रेन संख्या या स्टेशन खोजें।' },
      { target: 'advisory', route: '/citizen', title: 'आपके लिए इसका अर्थ', body: 'हर सूचना समय-खिड़की और ट्रेन के संचालन को दिखाती है। यहाँ PNR, सीट या लाइव स्थिति नहीं — केवल नियोजित अनुरक्षण।' },
      { target: 'report', route: '/citizen', title: 'खतरे की रिपोर्ट', body: 'पटरी के पास कुछ असुरक्षित दिखा? फ़ोटो और स्थान भेजें; अनुसरण के लिए संदर्भ रखें।' },
      { target: 'install', route: '/citizen', title: 'फ़ोन पर रखें', body: 'कमज़ोर सिग्नल में भी त्वरित पहुँच के लिए समन्वय इंस्टॉल करें।' },
    ],
  },
};

function deptTour(p: 'tms' | 'smms' | 'tdms'): Localised {
  const base = `/app/${p}`;
  const sys = p.toUpperCase();
  return {
    en: [
      { target: 'portal-chip', route: `${base}/today`, title: 'Your department', body: `Only your department’s works, blocks and resources. Records arrive in the ${sys} native schema and are placed on the corridor graph.` },
      { target: 'dept-queue', route: `${base}/today`, title: 'What needs you today', body: 'Overdue works, mandatory items, blocks awaiting your concurrence and reports routed to you.' },
      { target: 'register-table', route: `${base}/register`, title: 'Defect register', body: 'Every record with its native fields, the block section it maps to, its ARCI score and the plan decision.' },
      { target: 'requisition-form', route: `${base}/requisitions`, title: 'Raise a block requisition', body: 'A BDMS-style form: work type, line, chainage, duration. It is checked against the corridor and the JPO rules before it goes to the planning cell.' },
      { target: 'weekly-gantt', route: `${base}/blocks`, title: 'Concur on joint blocks', body: 'Blocks that include your work need your concurrence before Control can grant them. Object with a reason if your gang or machine is not ready.' },
    ],
    hi: [
      { target: 'portal-chip', route: `${base}/today`, title: 'आपका विभाग', body: `केवल आपके विभाग के कार्य, ब्लॉक और संसाधन। रिकॉर्ड ${sys} मूल स्कीमा में आते हैं और कॉरिडोर ग्राफ़ पर रखे जाते हैं।` },
      { target: 'dept-queue', route: `${base}/today`, title: 'आज आपके लिए', body: 'देय कार्य, अनिवार्य मद, आपकी सहमति की प्रतीक्षा में ब्लॉक और आपको भेजी गई रिपोर्ट।' },
      { target: 'register-table', route: `${base}/register`, title: 'दोष रजिस्टर', body: 'हर रिकॉर्ड अपने मूल फ़ील्ड, ब्लॉक सेक्शन, ARCI स्कोर और योजना निर्णय के साथ।' },
      { target: 'requisition-form', route: `${base}/requisitions`, title: 'ब्लॉक माँग दर्ज करें', body: 'BDMS-शैली का फ़ॉर्म: कार्य प्रकार, लाइन, चेनेज, अवधि। योजना प्रकोष्ठ जाने से पहले कॉरिडोर और JPO नियमों पर जाँचा जाता है।' },
      { target: 'weekly-gantt', route: `${base}/blocks`, title: 'संयुक्त ब्लॉक पर सहमति', body: 'आपके कार्य वाले ब्लॉक को नियंत्रण द्वारा प्रदान से पहले आपकी सहमति चाहिए। गैंग या मशीन तैयार न हो तो कारण सहित आपत्ति करें।' },
    ],
  };
}
