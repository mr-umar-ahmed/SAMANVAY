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
        { route: '/app/control', label: { en: 'Control desk', hi: 'नियंत्रण डेस्क' }, icon: 'home', mobile: true, tour: 'nav-control-desk' },
        { route: '/app/control/blocks', label: { en: 'Block requests', hi: 'ब्लॉक अनुरोध' }, icon: 'check-square', mobile: true, tour: 'nav-control-blocks' },
        { route: '/app/control/corridor', label: { en: 'Live corridor', hi: 'लाइव कॉरिडोर' }, icon: 'map', mobile: true },
        { route: '/app/control/caution', label: { en: 'Caution & TSR desk', hi: 'सतर्कता व TSR डेस्क' }, icon: 'file-text', mobile: true },
        { route: '/app/control/execution', label: { en: 'Execution log', hi: 'निष्पादन लॉग' }, icon: 'play-circle' },
        { route: '/app/control/incidents', label: { en: 'Incidents & reports', hi: 'घटनाएँ व रिपोर्ट' }, icon: 'inbox', tour: 'nav-control-incidents' },
        { route: '/app/control/handoff', label: { en: 'Hand-off & export', hi: 'हैंड-ऑफ़ व निर्यात' }, icon: 'clipboard' },
      ],
    },
    {
      label: { en: 'Respond', hi: 'प्रतिक्रिया' },
      items: [
        { route: '/app/control/disruptions', label: { en: 'Disruptions & re-plan', hi: 'व्यवधान व पुनर्योजना' }, icon: 'flame' },
        { route: '/app/control/copilot', label: { en: 'Copilot', hi: 'कोपायलट' }, icon: 'sparkles' },
      ],
    },
  ],
  planning: [
    {
      label: { en: 'Plan', hi: 'योजना' },
      items: [
        { route: '/app/planning', label: { en: 'Overview', hi: 'अवलोकन' }, icon: 'home', mobile: true, tour: 'nav-planning-overview' },
        { route: '/app/planning/weekly', label: { en: 'Weekly block plan', hi: 'साप्ताहिक ब्लॉक योजना' }, icon: 'calendar', mobile: true, tour: 'nav-planning-weekly' },
        { route: '/app/planning/monthly', label: { en: 'Monthly & 26-week', hi: 'मासिक व 26-सप्ताह' }, icon: 'calendar-range', mobile: true },
        { route: '/app/planning/intake', label: { en: 'Demands & reports', hi: 'माँगें व रिपोर्ट' }, icon: 'inbox' },
      ],
    },
    {
      label: { en: 'Analyse', hi: 'विश्लेषण' },
      items: [
        { route: '/app/planning/risk', label: { en: 'Risk & priority (ARCI)', hi: 'जोखिम व प्राथमिकता (ARCI)' }, icon: 'alert-triangle', tour: 'nav-planning-risk' },
        { route: '/app/planning/capacity', label: { en: 'Corridor capacity', hi: 'कॉरिडोर क्षमता' }, icon: 'activity' },
        { route: '/app/planning/integration', label: { en: 'Integration hub', hi: 'एकीकरण हब' }, icon: 'share' },
      ],
    },
    {
      label: { en: 'Act', hi: 'कार्रवाई' },
      items: [
        { route: '/app/planning/studio', label: { en: 'Optimiser studio', hi: 'ऑप्टिमाइज़र स्टूडियो' }, icon: 'sliders', tour: 'nav-planning-studio' },
        { route: '/app/planning/scenarios', label: { en: 'Scenario library', hi: 'परिदृश्य पुस्तकालय' }, icon: 'flame' },
        { route: '/app/planning/handoff', label: { en: 'BDMS hand-off', hi: 'BDMS हैंड-ऑफ़' }, icon: 'check-square', mobile: true, tour: 'nav-planning-handoff' },
        { route: '/app/planning/execution', label: { en: 'Execution & adherence', hi: 'निष्पादन व पालन' }, icon: 'play-circle' },
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
        { route: '/app/division', label: { en: 'DRM overview', hi: 'DRM अवलोकन' }, icon: 'home', mobile: true, tour: 'nav-division-overview' },
        { route: '/app/division/roi', label: { en: 'ROI audit', hi: 'ROI ऑडिट' }, icon: 'trending-up', mobile: true, tour: 'nav-division-roi' },
        { route: '/app/division/programme', label: { en: '26-week programme', hi: '26-सप्ताह कार्यक्रम' }, icon: 'calendar-range', mobile: true },
        { route: '/app/division/audit', label: { en: 'Approvals & audit', hi: 'स्वीकृतियाँ व ऑडिट' }, icon: 'clipboard', mobile: true },
        { route: '/app/division/escalations', label: { en: 'Escalations', hi: 'एस्केलेशन' }, icon: 'alert-triangle', tour: 'nav-division-escalations' },
      ],
    },
    {
      label: { en: 'Systems', hi: 'प्रणालियाँ' },
      items: [
        { route: '/app/division/integration', label: { en: 'Integration health', hi: 'एकीकरण स्थिति' }, icon: 'share' },
        { route: '/app/division/admin', label: { en: 'Users & settings', hi: 'उपयोगकर्ता व सेटिंग' }, icon: 'settings' },
      ],
    },
  ],
  field: [
    {
      label: { en: 'Field', hi: 'फ़ील्ड' },
      items: [
        { route: '/app/field', label: { en: 'Today', hi: 'आज' }, icon: 'home', mobile: true, tour: 'nav-field-today' },
        { route: '/app/field/report', label: { en: 'Report incident', hi: 'घटना रिपोर्ट' }, icon: 'camera', mobile: true, tour: 'nav-field-report' },
        { route: '/app/field/caution', label: { en: 'Caution orders', hi: 'सतर्कता आदेश' }, icon: 'file-text', mobile: true },
        { route: '/app/field/train', label: { en: 'My train', hi: 'मेरी ट्रेन' }, icon: 'train', mobile: true },
      ],
    },
  ],
  citizen: [
    {
      label: { en: 'Citizen', hi: 'नागरिक' },
      items: [
        { route: '/citizen', label: { en: 'Advisories', hi: 'सूचनाएँ' }, icon: 'home', mobile: true },
        { route: '/citizen/report', label: { en: 'Report a hazard', hi: 'खतरे की रिपोर्ट' }, icon: 'camera', mobile: true },
        { route: '/citizen/my-reports', label: { en: 'My reports', hi: 'मेरी रिपोर्ट' }, icon: 'inbox', mobile: true },
      ],
    },
  ],
};

function deptNav(p: 'tms' | 'smms' | 'tdms'): NavGroup[] {
  const base = `/app/${p}`;
  return [
    {
      label: { en: 'Department', hi: 'विभाग' },
      items: [
        { route: base, label: { en: 'Department desk', hi: 'विभाग डेस्क' }, icon: 'home', mobile: true, tour: 'nav-dept-desk' },
        { route: `${base}/register`, label: { en: 'Defect register', hi: 'दोष रजिस्टर' }, icon: 'list', mobile: true, tour: 'nav-dept-register' },
        { route: `${base}/demand`, label: { en: 'Raise block demand', hi: 'ब्लॉक माँग दर्ज करें' }, icon: 'plus-circle', mobile: true, tour: 'nav-dept-demand' },
        { route: `${base}/blocks`, label: { en: 'My blocks & concurrence', hi: 'मेरे ब्लॉक व सहमति' }, icon: 'check-square', mobile: true, tour: 'nav-dept-blocks' },
      ],
    },
    {
      label: { en: 'Resources', hi: 'संसाधन' },
      items: [
        { route: `${base}/forms`, label: p === 'tms' ? { en: 'Caution & TSR', hi: 'सतर्कता व TSR' } : p === 'smms' ? { en: 'Disconnections (T/351)', hi: 'डिस्कनेक्शन (T/351)' } : { en: 'Power blocks', hi: 'पावर ब्लॉक' }, icon: 'file-text', tour: 'nav-dept-forms' },
        { route: `${base}/resources`, label: { en: 'Machines & gangs', hi: 'मशीनें व गैंग' }, icon: 'wrench' },
        { route: `${base}/reports`, label: { en: 'Field & citizen reports', hi: 'फ़ील्ड व नागरिक रिपोर्ट' }, icon: 'inbox', tour: 'nav-dept-reports' },
        { route: `${base}/copilot`, label: { en: 'Copilot', hi: 'कोपायलट' }, icon: 'sparkles' },
      ],
    },
  ];
}

const METHOD = (portal: PortalId): NavGroup => ({
  label: { en: 'Help', hi: 'सहायता' },
  items: [{ route: `/app/${portal}/method`, label: { en: 'How it works', hi: 'यह कैसे काम करता है' }, icon: 'book', tour: 'nav-method' }],
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
