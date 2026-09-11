/**
 * Portals, roles and demo accounts. A portal is what a user sees after
 * sign-in: its own navigation, landing page and identity colour. Roles map
 * to exactly one portal and carry the capabilities the JPO workflow checks.
 */
import type { Dept } from '../engine/types';

export type PortalId = 'control' | 'planning' | 'tms' | 'smms' | 'tdms' | 'division' | 'field' | 'citizen';

export type Capability =
  | 'grant'
  | 'lock'
  | 'authorise'
  | 'concur:TMS'
  | 'concur:SMMS'
  | 'concur:TDMS'
  | 'plan'
  | 'intake'
  | 'triage'
  | 'execute'
  | 'issueCaution'
  | 'admin'
  | 'report';

export type RoleId =
  | 'SECTION_CONTROLLER'
  | 'CHIEF_CONTROLLER'
  | 'BLOCK_PLANNER'
  | 'SR_DEN'
  | 'SSE_PWAY'
  | 'SR_DSTE'
  | 'SSE_SIGNAL'
  | 'SR_DEE'
  | 'SSE_TRD'
  | 'DRM'
  | 'ADMIN'
  | 'GANG_INCHARGE'
  | 'LOCO_PILOT'
  | 'CITIZEN';

export type Pastel = 'blue' | 'lavender' | 'yellow' | 'pink' | 'green' | 'gray';

export interface Portal {
  id: PortalId;
  label: { en: string; hi: string };
  short: { en: string; hi: string };
  description: { en: string; hi: string };
  pastel: Pastel;
  landing: string;
  mobileFirst: boolean;
  roles: RoleId[];
  dept?: Dept;
}

export interface Role {
  id: RoleId;
  label: { en: string; hi: string };
  portal: PortalId;
  can: Capability[];
  dept?: Dept;
}

export const PORTALS: Record<PortalId, Portal> = {
  control: {
    id: 'control',
    label: { en: 'Control Office (COA)', hi: 'नियंत्रण कार्यालय (COA)' },
    short: { en: 'Control', hi: 'नियंत्रण' },
    description: { en: 'Section Controllers grant possessions, watch the corridor and issue caution orders.', hi: 'अनुभाग नियंत्रक पज़ेशन प्रदान करते हैं, कॉरिडोर देखते हैं और सतर्कता आदेश जारी करते हैं।' },
    pastel: 'lavender',
    landing: '/app/control',
    mobileFirst: false,
    roles: ['SECTION_CONTROLLER', 'CHIEF_CONTROLLER'],
  },
  planning: {
    id: 'planning',
    label: { en: 'Block Planning Cell', hi: 'ब्लॉक योजना प्रकोष्ठ' },
    short: { en: 'Planning', hi: 'योजना' },
    description: { en: 'Weekly, monthly and 26-week block plans, optimiser tuning, what-if scenarios and BDMS hand-off.', hi: 'साप्ताहिक, मासिक व 26-सप्ताह ब्लॉक योजना, ऑप्टिमाइज़र, परिदृश्य और BDMS हैंड-ऑफ़।' },
    pastel: 'blue',
    landing: '/app/planning',
    mobileFirst: false,
    roles: ['BLOCK_PLANNER'],
  },
  tms: {
    id: 'tms',
    label: { en: 'Civil Engineering (TMS)', hi: 'सिविल इंजीनियरिंग (TMS)' },
    short: { en: 'Civil / TMS', hi: 'सिविल / TMS' },
    description: { en: 'Track defects and due maintenance from the Track Management System, block demands and concurrence.', hi: 'ट्रैक प्रबंधन प्रणाली से ट्रैक दोष व देय अनुरक्षण, ब्लॉक माँग और सहमति।' },
    pastel: 'green',
    landing: '/app/tms',
    mobileFirst: false,
    roles: ['SR_DEN', 'SSE_PWAY'],
    dept: 'TMS',
  },
  smms: {
    id: 'smms',
    label: { en: 'Signal & Telecom (SMMS)', hi: 'सिग्नल व दूरसंचार (SMMS)' },
    short: { en: 'S&T / SMMS', hi: 'S&T / SMMS' },
    description: { en: 'Signalling gear health and overdue overhauls from SMMS, disconnection notices and concurrence.', hi: 'SMMS से सिग्नलिंग उपकरण स्थिति व देय ओवरहॉल, डिस्कनेक्शन सूचना और सहमति।' },
    pastel: 'blue',
    landing: '/app/smms',
    mobileFirst: false,
    roles: ['SR_DSTE', 'SSE_SIGNAL'],
    dept: 'SMMS',
  },
  tdms: {
    id: 'tdms',
    label: { en: 'Traction Distribution (TDMS)', hi: 'कर्षण वितरण (TDMS)' },
    short: { en: 'TRD / TDMS', hi: 'TRD / TDMS' },
    description: { en: 'OHE condition register from TDMS, power blocks and isolations, tower wagon rosters and concurrence.', hi: 'TDMS से OHE स्थिति रजिस्टर, पावर ब्लॉक व आइसोलेशन, टावर वैगन रोस्टर और सहमति।' },
    pastel: 'yellow',
    landing: '/app/tdms',
    mobileFirst: false,
    roles: ['SR_DEE', 'SSE_TRD'],
    dept: 'TDMS',
  },
  division: {
    id: 'division',
    label: { en: 'Divisional Management', hi: 'मंडल प्रबंधन' },
    short: { en: 'Division', hi: 'मंडल' },
    description: { en: 'DRM view: availability, ROI, 26-week programme, notice compliance, audit trail and administration.', hi: 'DRM दृश्य: उपलब्धता, ROI, 26-सप्ताह कार्यक्रम, नोटिस अनुपालन, ऑडिट और प्रशासन।' },
    pastel: 'pink',
    landing: '/app/division',
    mobileFirst: false,
    roles: ['DRM', 'ADMIN'],
  },
  field: {
    id: 'field',
    label: { en: 'Field Staff', hi: 'फ़ील्ड स्टाफ़' },
    short: { en: 'Field', hi: 'फ़ील्ड' },
    description: { en: "Today's possession card, start / done / clear, and incident capture for gangs and loco pilots.", hi: 'आज का पज़ेशन कार्ड, शुरू / पूर्ण / क्लियर, और गैंग व लोको पायलट के लिए घटना कैप्चर।' },
    pastel: 'gray',
    landing: '/app/field',
    mobileFirst: true,
    roles: ['GANG_INCHARGE', 'LOCO_PILOT'],
  },
  citizen: {
    id: 'citizen',
    label: { en: 'Passengers & Citizens', hi: 'यात्री व नागरिक' },
    short: { en: 'Citizen', hi: 'नागरिक' },
    description: { en: 'Planned block advisories for your train or station, and a way to report a track hazard with a photo.', hi: 'आपकी ट्रेन या स्टेशन के लिए नियोजित ब्लॉक सूचना, और फ़ोटो के साथ ट्रैक खतरे की रिपोर्ट।' },
    pastel: 'green',
    landing: '/citizen',
    mobileFirst: true,
    roles: ['CITIZEN'],
  },
};

export const ROLES: Record<RoleId, Role> = {
  SECTION_CONTROLLER: { id: 'SECTION_CONTROLLER', label: { en: 'Section Controller', hi: 'अनुभाग नियंत्रक' }, portal: 'control', can: ['grant', 'issueCaution', 'execute'] },
  CHIEF_CONTROLLER: { id: 'CHIEF_CONTROLLER', label: { en: 'Chief Controller / Sr. DOM', hi: 'मुख्य नियंत्रक / वरिष्ठ DOM' }, portal: 'control', can: ['grant', 'lock', 'issueCaution', 'execute'] },
  BLOCK_PLANNER: { id: 'BLOCK_PLANNER', label: { en: 'Block Planner', hi: 'ब्लॉक योजनाकार' }, portal: 'planning', can: ['plan', 'intake', 'triage'] },
  SR_DEN: { id: 'SR_DEN', label: { en: 'Sr. DEN (Track)', hi: 'वरिष्ठ मंडल इंजीनियर (ट्रैक)' }, portal: 'tms', can: ['concur:TMS', 'intake', 'triage'], dept: 'TMS' },
  SSE_PWAY: { id: 'SSE_PWAY', label: { en: 'SSE / P-Way', hi: 'SSE / पी-वे' }, portal: 'tms', can: ['intake', 'execute', 'report'], dept: 'TMS' },
  SR_DSTE: { id: 'SR_DSTE', label: { en: 'Sr. DSTE (Signal)', hi: 'वरिष्ठ मंडल सिग्नल इंजीनियर' }, portal: 'smms', can: ['concur:SMMS', 'intake', 'triage'], dept: 'SMMS' },
  SSE_SIGNAL: { id: 'SSE_SIGNAL', label: { en: 'SSE / Signal', hi: 'SSE / सिग्नल' }, portal: 'smms', can: ['intake', 'execute', 'report'], dept: 'SMMS' },
  SR_DEE: { id: 'SR_DEE', label: { en: 'Sr. DEE (TRD)', hi: 'वरिष्ठ मंडल विद्युत इंजीनियर (TRD)' }, portal: 'tdms', can: ['concur:TDMS', 'intake', 'triage'], dept: 'TDMS' },
  SSE_TRD: { id: 'SSE_TRD', label: { en: 'SSE / TRD', hi: 'SSE / TRD' }, portal: 'tdms', can: ['intake', 'execute', 'report'], dept: 'TDMS' },
  DRM: { id: 'DRM', label: { en: 'Divisional Railway Manager', hi: 'मंडल रेल प्रबंधक' }, portal: 'division', can: ['grant', 'lock', 'authorise', 'admin'] },
  ADMIN: { id: 'ADMIN', label: { en: 'System Administrator', hi: 'सिस्टम प्रशासक' }, portal: 'division', can: ['admin', 'authorise'] },
  GANG_INCHARGE: { id: 'GANG_INCHARGE', label: { en: 'Gang In-charge / Keyman', hi: 'गैंग प्रभारी / कीमैन' }, portal: 'field', can: ['execute', 'report'] },
  LOCO_PILOT: { id: 'LOCO_PILOT', label: { en: 'Loco Pilot', hi: 'लोको पायलट' }, portal: 'field', can: ['report'] },
  CITIZEN: { id: 'CITIZEN', label: { en: 'Passenger / Citizen', hi: 'यात्री / नागरिक' }, portal: 'citizen', can: ['report'] },
};

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: RoleId;
  portal: PortalId;
  designation: string;
  division: string;
  dept?: Dept;
  demo?: boolean;
}

export interface DemoAccount {
  id: string;
  name: string;
  email: string;
  role: RoleId;
  designation: string;
  division: string;
}

/** Demo accounts — password for all of them is "samanvay". */
export const DEMO_PASSWORD = 'samanvay';

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { id: 'U-SC', name: 'Rajesh Kumar', email: 'sc.mtj@ir.demo', role: 'SECTION_CONTROLLER', designation: 'Section Controller, Mathura board', division: 'Agra' },
  { id: 'U-CC', name: 'Meenakshi Iyer', email: 'chc@ir.demo', role: 'CHIEF_CONTROLLER', designation: 'Chief Controller (Sr. DOM office)', division: 'Agra' },
  { id: 'U-BP', name: 'Priya Sharma', email: 'planner@ir.demo', role: 'BLOCK_PLANNER', designation: 'Block Planner, Divisional planning cell', division: 'Agra' },
  { id: 'U-DEN', name: 'Vikram Singh', email: 'srden@ir.demo', role: 'SR_DEN', designation: 'Sr. Divisional Engineer (Track)', division: 'Agra' },
  { id: 'U-PW', name: 'Suresh Patil', email: 'sse.pway@ir.demo', role: 'SSE_PWAY', designation: 'SSE / P-Way, Mathura', division: 'Agra' },
  { id: 'U-DSTE', name: 'Mohammad Ali', email: 'srdste@ir.demo', role: 'SR_DSTE', designation: 'Sr. Divisional Signal & Telecom Engineer', division: 'Agra' },
  { id: 'U-SIG', name: 'Kavita Rao', email: 'sse.sig@ir.demo', role: 'SSE_SIGNAL', designation: 'SSE / Signal, Aligarh', division: 'Agra' },
  { id: 'U-DEE', name: 'Anita Desai', email: 'srdee@ir.demo', role: 'SR_DEE', designation: 'Sr. Divisional Electrical Engineer (TRD)', division: 'Agra' },
  { id: 'U-TRD', name: 'Harpreet Gill', email: 'sse.trd@ir.demo', role: 'SSE_TRD', designation: 'SSE / TRD, Tundla', division: 'Agra' },
  { id: 'U-DRM', name: 'S. Venkataraman', email: 'drm@ir.demo', role: 'DRM', designation: 'Divisional Railway Manager', division: 'Agra' },
  { id: 'U-ADM', name: 'Nisha Verma', email: 'admin@ir.demo', role: 'ADMIN', designation: 'System Administrator (CRIS)', division: 'Agra' },
  { id: 'U-GANG', name: 'Ramesh Yadav', email: 'gang4@ir.demo', role: 'GANG_INCHARGE', designation: 'Gang In-charge, P-Way Gang 4', division: 'Agra' },
  { id: 'U-LP', name: 'Arun Nair', email: 'lp@ir.demo', role: 'LOCO_PILOT', designation: 'Loco Pilot (Mail/Express)', division: 'Agra' },
];

export function roleOf(id: RoleId): Role {
  return ROLES[id];
}

export function portalOfRole(id: RoleId): Portal {
  return PORTALS[ROLES[id].portal];
}

export function can(user: SessionUser | null | undefined, cap: Capability): boolean {
  if (!user) return false;
  return ROLES[user.role].can.includes(cap);
}

export function toSession(a: DemoAccount, demo = true): SessionUser {
  const role = ROLES[a.role];
  return { id: a.id, name: a.name, email: a.email, role: a.role, portal: role.portal, designation: a.designation, division: a.division, dept: role.dept, demo };
}

export const PORTAL_ORDER: PortalId[] = ['control', 'planning', 'tms', 'smms', 'tdms', 'division', 'field', 'citizen'];
