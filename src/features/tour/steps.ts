/**
 * First-run tour per portal. Targets are data-tour attributes that the pages
 * and the shell render. Keep each tour short: 5–8 steps.
 */
import type { PortalId } from '../../auth/portals';
import type { TourStep } from './tour';

type Localised = { en: TourStep[]; hi: TourStep[] };

export const TOUR_STEPS: Partial<Record<PortalId, Localised>> = {
  planning: {
    en: [
      { target: 'portal-chip', route: '/app/planning', title: 'Your portal', body: 'This is the Block Planning Cell. Every page here reads one plan computed on your device by the optimiser.' },
      { target: 'overview-kpis', route: '/app/planning', title: 'Plan versus today’s practice', body: 'Each figure is computed twice: once by SAMANVAY, once by a simulated decentralised baseline (each department asking on its own). The difference is the gain.' },
      { target: 'nav-planning-weekly', title: 'Weekly block plan', body: 'Seven days of possessions laid into the natural gaps of the timetable. Open any block to see the works bundled inside it and the trains it touches.' },
      { target: 'weekly-gantt', route: '/app/planning/weekly', title: 'Joint blocks', body: 'Bars with more than one colour are joint (shadow) blocks: Civil, S&T and TRD sharing one line closure. Click a bar for the requisition.' },
      { target: 'nav-planning-risk', title: 'Why this order?', body: 'ARCI ranks every job: Weibull failure probability, traffic disruption, overdue days and a learned escalation probability, scaled by safety. Every score is explained term by term.' },
      { target: 'nav-planning-studio', title: 'Tune and re-plan', body: 'Change the objective weights or the JPO rules and run the optimiser again. Nothing is hard-coded — the plan moves.' },
      { target: 'nav-planning-handoff', title: 'Hand-off to BDMS', body: 'Concurrence, grant and lock follow the joint procedure order. Export the demand payload as CSV or JSON.' },
      { target: 'replan', title: 'Re-plan anytime', body: 'After a new demand, a field report or a scenario, re-plan here. The engine runs in a background worker.' },
    ],
    hi: [
      { target: 'portal-chip', route: '/app/planning', title: 'आपका पोर्टल', body: 'यह ब्लॉक योजना प्रकोष्ठ है। यहाँ का हर पेज आपके डिवाइस पर ऑप्टिमाइज़र द्वारा बनी एक ही योजना पढ़ता है।' },
      { target: 'overview-kpis', route: '/app/planning', title: 'योजना बनाम आज की प्रथा', body: 'हर आँकड़ा दो बार गणित होता है: एक बार समन्वय द्वारा, एक बार सिम्युलेटेड विकेंद्रीकृत आधार-रेखा द्वारा। अंतर ही लाभ है।' },
      { target: 'nav-planning-weekly', title: 'साप्ताहिक ब्लॉक योजना', body: 'सात दिनों के पज़ेशन समय-सारणी के प्राकृतिक अंतरालों में। किसी भी ब्लॉक को खोलकर उसमें बंडल कार्य और प्रभावित ट्रेनें देखें।' },
      { target: 'weekly-gantt', route: '/app/planning/weekly', title: 'संयुक्त ब्लॉक', body: 'एक से अधिक रंग वाली पट्टियाँ संयुक्त (शैडो) ब्लॉक हैं: सिविल, S&T और TRD एक ही लाइन बंदी साझा करते हैं।' },
      { target: 'nav-planning-risk', title: 'यह क्रम क्यों?', body: 'ARCI हर कार्य को रैंक करता है: वाइबुल विफलता संभावना, यातायात व्यवधान, देय दिन और सीखी गई एस्केलेशन संभावना, सुरक्षा से भारित।' },
      { target: 'nav-planning-studio', title: 'समायोजित करें और पुनः योजना बनाएँ', body: 'उद्देश्य भार या JPO नियम बदलें और ऑप्टिमाइज़र फिर चलाएँ। कुछ भी हार्ड-कोडेड नहीं है।' },
      { target: 'nav-planning-handoff', title: 'BDMS को हैंड-ऑफ़', body: 'सहमति, प्रदान और लॉक संयुक्त प्रक्रिया आदेश के अनुसार। माँग पेलोड CSV या JSON में निर्यात करें।' },
      { target: 'replan', title: 'कभी भी पुनः योजना', body: 'नई माँग, फ़ील्ड रिपोर्ट या परिदृश्य के बाद यहाँ से पुनः योजना बनाएँ।' },
    ],
  },
  control: {
    en: [
      { target: 'portal-chip', route: '/app/control', title: 'Control Office', body: 'The Section Controller keeps the final word. Nothing becomes a possession until it is granted here.' },
      { target: 'control-today', route: '/app/control', title: 'Today’s possessions', body: 'In time order, with the trains each block touches and how they are handled: single-line working, held, or regulated.' },
      { target: 'nav-control-blocks', title: 'Block requests', body: 'Every proposed block with its concurrence status. Grant when all departments have concurred, or return it with a reason.' },
      { target: 'block-workflow', route: '/app/control/blocks', title: 'Grant, return, lock', body: 'The joint procedure order as buttons: departmental concurrence, controller grant, lock into the COA timetable. Every action is written to the audit trail.' },
      { target: 'caution-orders', route: '/app/control/caution', title: 'Caution orders', body: 'Form T/409 caution orders and T/351 disconnection notices are generated from the plan, printable on A4. Emergency TSRs re-plan the week.' },
      { target: 'corridor-map', route: '/app/control/corridor', title: 'Live corridor', body: 'Train positions are derived from the timetable at the chosen minute — no telemetry is invented. Planned blocks and TSRs sit on the same map.' },
    ],
    hi: [
      { target: 'portal-chip', route: '/app/control', title: 'नियंत्रण कार्यालय', body: 'अंतिम निर्णय अनुभाग नियंत्रक का। यहाँ प्रदान होने तक कुछ भी पज़ेशन नहीं बनता।' },
      { target: 'control-today', route: '/app/control', title: 'आज के पज़ेशन', body: 'समय क्रम में, हर ब्लॉक से प्रभावित ट्रेनों और उनके संचालन के साथ।' },
      { target: 'nav-control-blocks', title: 'ब्लॉक अनुरोध', body: 'हर प्रस्तावित ब्लॉक अपनी सहमति स्थिति के साथ। सभी विभागों की सहमति पर प्रदान करें, या कारण सहित लौटाएँ।' },
      { target: 'block-workflow', route: '/app/control/blocks', title: 'प्रदान, वापसी, लॉक', body: 'संयुक्त प्रक्रिया आदेश बटनों के रूप में। हर कार्रवाई ऑडिट ट्रेल में दर्ज होती है।' },
      { target: 'caution-orders', route: '/app/control/caution', title: 'सतर्कता आदेश', body: 'फ़ॉर्म T/409 और T/351 योजना से बनते हैं, A4 पर प्रिंट योग्य।' },
      { target: 'corridor-map', route: '/app/control/corridor', title: 'लाइव कॉरिडोर', body: 'ट्रेन स्थितियाँ समय-सारणी से व्युत्पन्न हैं — कोई टेलीमेट्री गढ़ी नहीं गई।' },
    ],
  },
  tms: deptTour('tms'),
  smms: deptTour('smms'),
  tdms: deptTour('tdms'),
  division: {
    en: [
      { target: 'portal-chip', route: '/app/division', title: 'Divisional view', body: 'What the DRM needs: availability, closures, safety compliance and money — each against the decentralised baseline.' },
      { target: 'division-kpis', route: '/app/division', title: 'Computed, not asserted', body: 'Every number here comes from the plan. Rupee figures multiply plan quantities by unit assumptions you can edit.' },
      { target: 'nav-division-roi', title: 'ROI audit', body: 'Line by line: delay penalties, corridor capacity, demurrage, traction energy, mobilisation. Change an assumption and only its line moves.' },
      { target: 'programme-weeks', route: '/app/division/programme', title: '26-week programme', body: 'Capital works by week with the 10-week notice check. Shortfalls are flagged, not hidden.' },
      { target: 'audit-trail', route: '/app/division/audit', title: 'Audit trail', body: 'Who concurred, granted, locked, started and cleared what — with time stamps.' },
    ],
    hi: [
      { target: 'portal-chip', route: '/app/division', title: 'मंडल दृश्य', body: 'DRM को जो चाहिए: उपलब्धता, बंदी, सुरक्षा अनुपालन और धन — हर एक आधार-रेखा की तुलना में।' },
      { target: 'division-kpis', route: '/app/division', title: 'गणित से, दावा नहीं', body: 'यहाँ का हर आँकड़ा योजना से आता है। रुपये के आँकड़े संपादन-योग्य इकाई मान्यताओं से गुणा होते हैं।' },
      { target: 'nav-division-roi', title: 'ROI ऑडिट', body: 'पंक्ति दर पंक्ति। मान्यता बदलें और केवल उसकी पंक्ति बदलती है।' },
      { target: 'programme-weeks', route: '/app/division/programme', title: '26-सप्ताह कार्यक्रम', body: 'सप्ताह-वार पूँजीगत कार्य, 10-सप्ताह नोटिस जाँच के साथ।' },
      { target: 'audit-trail', route: '/app/division/audit', title: 'ऑडिट ट्रेल', body: 'किसने क्या सहमति दी, प्रदान किया, लॉक किया — समय के साथ।' },
    ],
  },
  field: {
    en: [
      { target: 'field-card', route: '/app/field', title: 'Today’s possession', body: 'Your block for today with its window, section and works. Start when the line is handed over; mark each work done with the actual minutes; clear when the line is handed back.' },
      { target: 'nav-field-report', title: 'Report an incident', body: 'Photo, location and a few words. The report reaches the department for triage; if accepted it becomes a work item and is planned.' },
      { target: 'nav-field-caution', title: 'Caution orders in force', body: 'Speed restrictions on the corridor, generated from the register — for loco pilots and gangs alike.' },
    ],
    hi: [
      { target: 'field-card', route: '/app/field', title: 'आज का पज़ेशन', body: 'आपका आज का ब्लॉक। लाइन सौंपे जाने पर शुरू करें; हर कार्य को वास्तविक मिनटों के साथ पूर्ण करें; लाइन वापस देने पर क्लियर करें।' },
      { target: 'nav-field-report', title: 'घटना की रिपोर्ट', body: 'फ़ोटो, स्थान और कुछ शब्द। रिपोर्ट विभाग तक जाँच के लिए पहुँचती है।' },
      { target: 'nav-field-caution', title: 'लागू सतर्कता आदेश', body: 'कॉरिडोर पर गति प्रतिबंध, रजिस्टर से बने।' },
    ],
  },
};

function deptTour(p: 'tms' | 'smms' | 'tdms'): Localised {
  const base = `/app/${p}`;
  const sys = p.toUpperCase();
  return {
    en: [
      { target: 'portal-chip', route: base, title: 'Your department', body: `Only your department’s works, blocks and resources. Records arrive in the ${sys} native schema and are placed on the corridor graph.` },
      { target: 'dept-queue', route: base, title: 'Ranked by ARCI', body: 'Your jobs in priority order. Mandatory safety work is floored at 0.92 and scheduled first.' },
      { target: 'nav-dept-demand', title: 'Raise a block demand', body: 'A BDMS-style form: work type, line, chainage, duration. It is validated against the corridor and planned on the next re-plan.' },
      { target: 'nav-dept-blocks', title: 'Concur on joint blocks', body: 'Blocks that include your work need your concurrence before Control can grant them.' },
      { target: 'nav-dept-register', title: 'Defect register', body: 'Every record with its native fields, the block section it maps to, and the plan decision.' },
    ],
    hi: [
      { target: 'portal-chip', route: base, title: 'आपका विभाग', body: `केवल आपके विभाग के कार्य, ब्लॉक और संसाधन। रिकॉर्ड ${sys} मूल स्कीमा में आते हैं।` },
      { target: 'dept-queue', route: base, title: 'ARCI द्वारा रैंक', body: 'आपके कार्य प्राथमिकता क्रम में। अनिवार्य सुरक्षा कार्य 0.92 पर फ़्लोर होकर पहले नियोजित होते हैं।' },
      { target: 'nav-dept-demand', title: 'ब्लॉक माँग दर्ज करें', body: 'BDMS-शैली का फ़ॉर्म: कार्य प्रकार, लाइन, चेनेज, अवधि।' },
      { target: 'nav-dept-blocks', title: 'संयुक्त ब्लॉक पर सहमति', body: 'आपके कार्य वाले ब्लॉक को नियंत्रण द्वारा प्रदान से पहले आपकी सहमति चाहिए।' },
      { target: 'nav-dept-register', title: 'दोष रजिस्टर', body: 'हर रिकॉर्ड अपने मूल फ़ील्ड, ब्लॉक सेक्शन और योजना निर्णय के साथ।' },
    ],
  };
}
