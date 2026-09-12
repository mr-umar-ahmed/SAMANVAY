/**
 * Navigation per portal. Each portal sees only the pages it needs.
 * Labels carry English and Hindi; icons are lucide names resolved in the shell.
 */
import type { PortalId } from '../auth/portals';

export type NavIcon =
  | 'home' | 'calendar' | 'calendar-range' | 'activity' | 'alert-triangle' | 'share' | 'sliders' | 'check-square'
  | 'map' | 'users' | 'file-text' | 'plus-circle' | 'play-circle' | 'flame' | 'sparkles' | 'trending-up'
  | 'compass' | 'list' | 'wrench' | 'radio' | 'zap' | 'shield' | 'camera' | 'train' | 'inbox' | 'settings' | 'clipboard' | 'book';

export interface NavItem {
  route: string;
  label: { en: string; hi: string };
  icon: NavIcon;
  /** shown in the mobile bottom bar (max 4 per portal) */
  mobile?: boolean;
  tour?: string;
}

export interface NavGroup {
  label: { en: string; hi: string };
  items: NavItem[];
}

export const PORTAL_NAV: Record<PortalId, NavGroup[]> = {
  control: [
    {
      label: { en: 'Operate', hi: 'संचालन' },
      items: [
        { route: '/app/control/board', label: { en: 'Board', hi: 'बोर्ड' }, icon: 'home', mobile: true, tour: 'nav-control-desk' },
        { route: '/app/control/programme', label: { en: 'Programme', hi: 'कार्यक्रम' }, icon: 'calendar', mobile: true },
        { route: '/app/control/map', label: { en: 'Corridor map', hi: 'कॉरिडोर मानचित्र' }, icon: 'map', mobile: true },
        { route: '/app/control/incidents', label: { en: 'Incidents & reports', hi: 'घटनाएँ व रिपोर्ट' }, icon: 'inbox', tour: 'nav-control-incidents' },
        { route: '/app/control/caution', label: { en: 'Caution & TSR desk', hi: 'सतर्कता व TSR डेस्क' }, icon: 'file-text', mobile: true },
      ],
    },
    {
      label: { en: 'Respond & Coordinate', hi: 'प्रतिक्रिया व समन्वय' },
      items: [
        { route: '/app/control/replan', label: { en: 'Re-plan', hi: 'पुनर्योजना' }, icon: 'flame' },
        { route: '/app/control/weekly', label: { en: 'Weekly review', hi: 'साप्ताहिक समीक्षा' }, icon: 'calendar-range' },
        { route: '/app/control/handoff', label: { en: 'Hand-off & export', hi: 'हैंड-ऑफ़ व निर्यात' }, icon: 'clipboard' },
        { route: '/app/control/log', label: { en: 'Execution log', hi: 'निष्पादन लॉग' }, icon: 'play-circle' },
        { route: '/app/control/copilot', label: { en: 'Copilot', hi: 'कोपायलट' }, icon: 'sparkles' },
      ],
    },
  ],
  planning: [
    {
      label: { en: 'Plan', hi: 'योजना' },
      items: [
        { route: '/app/planning/overview', label: { en: 'Overview', hi: 'अवलोकन' }, icon: 'home', mobile: true, tour: 'nav-planning-overview' },
        { route: '/app/planning/demands', label: { en: 'Demands', hi: 'माँगें' }, icon: 'inbox', mobile: true },
        { route: '/app/planning/risk', label: { en: 'Risk & priority (ARCI)', hi: 'जोखिम व प्राथमिकता (ARCI)' }, icon: 'alert-triangle', tour: 'nav-planning-risk' },
        { route: '/app/planning/weekly', label: { en: 'Weekly plan', hi: 'साप्ताहिक योजना' }, icon: 'calendar', mobile: true, tour: 'nav-planning-weekly' },
        { route: '/app/planning/monthly', label: { en: 'Monthly & 26-week', hi: 'मासिक व 26-सप्ताह' }, icon: 'calendar-range' },
        { route: '/app/planning/capacity', label: { en: 'Corridor capacity', hi: 'कॉरिडोर क्षमता' }, icon: 'activity' },
      ],
    },
    {
      label: { en: 'Optimise & Hand-off', hi: 'अनुकूलन व हैंड-ऑफ़' },
      items: [
        { route: '/app/planning/optimiser', label: { en: 'Optimiser', hi: 'ऑप्टिमाइज़र' }, icon: 'sliders', tour: 'nav-planning-studio' },
        { route: '/app/planning/scenarios', label: { en: 'Scenarios', hi: 'परिदृश्य' }, icon: 'flame' },
        { route: '/app/planning/handoff', label: { en: 'BDMS hand-off', hi: 'BDMS हैंड-ऑफ़' }, icon: 'check-square', mobile: true, tour: 'nav-planning-handoff' },
        { route: '/app/planning/adherence', label: { en: 'Adherence & log', hi: 'पालन व लॉग' }, icon: 'play-circle' },
        { route: '/app/planning/integration', label: { en: 'Integration', hi: 'एकीकरण' }, icon: 'share' },
        { route: '/app/planning/copilot', label: { en: 'Copilot', hi: 'कोपायलट' }, icon: 'sparkles' },
      ],
    },
  ],
  tms: deptNav('tms'),
  smms: deptNav('smms'),
  tdms: deptNav('tdms'),
  division: [
    {
      label: { en: 'Division', hi: 'मंडल' },
      items: [
        { route: '/app/division/brief', label: { en: 'DRM brief', hi: 'DRM सारांश' }, icon: 'home', mobile: true, tour: 'nav-division-overview' },
        { route: '/app/division/plans', label: { en: 'Approvals', hi: 'स्वीकृतियाँ' }, icon: 'clipboard', mobile: true },
        { route: '/app/division/escalations', label: { en: 'Escalations', hi: 'एस्केलेशन' }, icon: 'alert-triangle', tour: 'nav-division-escalations' },
        { route: '/app/division/roi', label: { en: 'ROI audit', hi: 'ROI ऑडिट' }, icon: 'trending-up', mobile: true, tour: 'nav-division-roi' },
        { route: '/app/division/incidents', label: { en: 'Incidents & hazard reports', hi: 'घटनाएँ व खतरे' }, icon: 'inbox' },
      ],
    },
    {
      label: { en: 'Systems', hi: 'प्रणालियाँ' },
      items: [
        { route: '/app/division/feeds', label: { en: 'Feeds & twin', hi: 'फ़ीड्स व डिजिटल ट्विन' }, icon: 'share' },
        { route: '/app/division/audit', label: { en: 'Audit trail', hi: 'ऑडिट ट्रेल' }, icon: 'clipboard' },
        { route: '/app/division/copilot', label: { en: 'Copilot', hi: 'कोपायलट' }, icon: 'sparkles' },
        { route: '/app/division/admin', label: { en: 'Admin', hi: 'व्यवस्थापक' }, icon: 'settings' },
      ],
    },
  ],
  field: [
    {
      label: { en: 'Field', hi: 'फ़ील्ड' },
      items: [
        { route: '/app/field/today', label: { en: 'Today', hi: 'आज' }, icon: 'home', mobile: true, tour: 'nav-field-today' },
        { route: '/app/field/report', label: { en: 'Report incident', hi: 'घटना रिपोर्ट' }, icon: 'camera', mobile: true, tour: 'nav-field-report' },
        { route: '/app/field/reports', label: { en: 'My reports', hi: 'मेरी रिपोर्ट' }, icon: 'inbox', mobile: true },
        { route: '/app/field/caution', label: { en: 'Caution orders', hi: 'सतर्कता आदेश' }, icon: 'file-text', mobile: true, tour: 'nav-field-caution' },
        { route: '/app/field/train', label: { en: 'My train', hi: 'मेरी ट्रेन' }, icon: 'train' },
        { route: '/app/field/copilot', label: { en: 'Copilot', hi: 'कोपायलट' }, icon: 'sparkles' },
      ],
    },
    {
      label: { en: 'Help', hi: 'सहायता' },
      items: [{ route: '/app/field/workflow', label: { en: 'Workflow (8 steps)', hi: 'कार्य-प्रवाह (8 चरण)' }, icon: 'compass', tour: 'nav-workflow' }],
    },
  ],
  citizen: [
    {
      label: { en: 'Citizen', hi: 'नागरिक' },
      items: [
        { route: '/citizen', label: { en: 'Home', hi: 'होम' }, icon: 'home', mobile: true },
        { route: '/citizen/report', label: { en: 'Report a hazard', hi: 'खतरे की रिपोर्ट' }, icon: 'camera', mobile: true },
        { route: '/citizen/reports', label: { en: 'My reports', hi: 'मेरी रिपोर्ट' }, icon: 'inbox', mobile: true },
      ],
    },
  ],
};

function deptNav(p: 'tms' | 'smms' | 'tdms'): NavGroup[] {
  const base = `/app/${p}`;
  const formRoute = p === 'tms' ? `${base}/caution` : p === 'smms' ? `${base}/disconnections` : `${base}/powerblocks`;
  const formLabel = p === 'tms' ? { en: 'Caution & TSR', hi: 'सतर्कता व TSR' } : p === 'smms' ? { en: 'T/351 Disconnections', hi: 'T/351 डिस्कनेक्शन' } : { en: 'Power blocks', hi: 'पावर ब्लॉक' };
  return [
    {
      label: { en: 'Department', hi: 'विभाग' },
      items: [
        { route: `${base}/today`, label: { en: 'Today', hi: 'आज' }, icon: 'home', mobile: true, tour: 'nav-dept-desk' },
        { route: `${base}/register`, label: { en: 'Defect register', hi: 'दोष रजिस्टर' }, icon: 'list', mobile: true, tour: 'nav-dept-register' },
        { route: `${base}/requisitions`, label: { en: 'Requisitions', hi: 'माँगें' }, icon: 'plus-circle', mobile: true, tour: 'nav-dept-demand' },
        { route: `${base}/blocks`, label: { en: 'Blocks & concurrence', hi: 'ब्लॉक व सहमति' }, icon: 'check-square', mobile: true, tour: 'nav-dept-blocks' },
      ],
    },
    {
      label: { en: 'Operations', hi: 'संचालन' },
      items: [
        { route: formRoute, label: formLabel, icon: 'file-text', tour: 'nav-dept-forms' },
        { route: `${base}/incidents`, label: { en: 'Incidents & reports', hi: 'घटनाएँ व रिपोर्ट' }, icon: 'inbox', tour: 'nav-dept-reports' },
        { route: `${base}/resources`, label: { en: 'Machines & gangs', hi: 'मशीनें व गैंग' }, icon: 'wrench' },
        { route: `${base}/copilot`, label: { en: 'Copilot', hi: 'कोपायलट' }, icon: 'sparkles' },
      ],
    },
  ];
}

const METHOD = (portal: PortalId): NavGroup => ({
  label: { en: 'Help', hi: 'सहायता' },
  items: [
    { route: `/app/${portal}/method`, label: { en: 'How it works', hi: 'यह कैसे काम करता है' }, icon: 'book', tour: 'nav-method' },
    { route: `/app/${portal}/workflow`, label: { en: 'Workflow (8 steps)', hi: 'कार्य-प्रवाह (8 चरण)' }, icon: 'compass', tour: 'nav-workflow' },
  ],
});
for (const p of ['control', 'planning', 'tms', 'smms', 'tdms', 'division'] as PortalId[]) PORTAL_NAV[p].push(METHOD(p));

export function navItemsFlat(portal: PortalId): NavItem[] {
  return PORTAL_NAV[portal].flatMap((g) => g.items);
}

export function findNavItem(portal: PortalId, pathname: string): NavItem | undefined {
  const items = navItemsFlat(portal);
  const exact = items.find((i) => i.route === pathname);
  if (exact) return exact;
  // longest prefix match (for /citizen/train/:number etc.)
  return items
    .filter((i) => pathname.startsWith(`${i.route}/`))
    .sort((a, b) => b.route.length - a.route.length)[0];
}
