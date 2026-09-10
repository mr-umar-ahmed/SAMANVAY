/* ================================================================
   SAMANVAY — Golden Journey Seed Data
   New Delhi → Agra Cantt Corridor (~195 km)
   ================================================================ */

import type {
  Station, Train, MaintenanceDemand, JointBlock,
  KPIMetrics, IncidentReport, CautionOrder, DisruptionEvent,
  RecoveryPlan, AuditEntry, User, ARCIBreakdown,
} from './types';

// ── Corridor Stations ─────────────────────────────────────────────
export const STATIONS: Station[] = [
  { id: 'NDLS', name: 'New Delhi', code: 'NDLS', chainage_km: 0, lat: 28.6425, lon: 77.2195, lines: 4, hasInterlocking: true },
  { id: 'NZM', name: 'Hazrat Nizamuddin', code: 'NZM', chainage_km: 7, lat: 28.5891, lon: 77.2536, lines: 4, hasInterlocking: true },
  { id: 'FDB', name: 'Faridabad', code: 'FDB', chainage_km: 28, lat: 28.4089, lon: 77.3178, lines: 4, hasInterlocking: true },
  { id: 'BVH', name: 'Ballabgarh', code: 'BVH', chainage_km: 36, lat: 28.3389, lon: 77.3202, lines: 4, hasInterlocking: true, hasLC: true },
  { id: 'PWL', name: 'Palwal', code: 'PWL', chainage_km: 56, lat: 28.1490, lon: 77.3292, lines: 2, hasInterlocking: true },
  { id: 'KSV', name: 'Kosi Kalan', code: 'KSV', chainage_km: 84, lat: 27.8010, lon: 77.4200, lines: 2, hasInterlocking: false, hasLC: true },
  { id: 'MTJ', name: 'Mathura Jn', code: 'MTJ', chainage_km: 141, lat: 27.4924, lon: 77.6737, lines: 4, hasInterlocking: true },
  { id: 'RKM', name: 'Raja Ki Mandi', code: 'RKM', chainage_km: 185, lat: 27.2060, lon: 78.0038, lines: 2, hasInterlocking: true, hasLC: true },
  { id: 'AGC', name: 'Agra Cantt', code: 'AGC', chainage_km: 195, lat: 27.1575, lon: 78.0081, lines: 4, hasInterlocking: true, hasNeutralSection: true },
];

// ── Train Schedule (Golden Journey day) ───────────────────────────
export const TRAINS: Train[] = [
  {
    id: 'T001', number: '12002', name: 'Bhopal Shatabdi', type: 'shatabdi', direction: 'DN', priority: 1,
    path: [
      { station_id: 'NDLS', chainage_km: 0, arrival: '06:00', departure: '06:15' },
      { station_id: 'NZM', chainage_km: 7, arrival: '06:22', departure: '06:22' },
      { station_id: 'FDB', chainage_km: 28, arrival: '06:38', departure: '06:38' },
      { station_id: 'MTJ', chainage_km: 141, arrival: '07:45', departure: '07:47' },
      { station_id: 'AGC', chainage_km: 195, arrival: '08:20', departure: '08:25' },
    ],
  },
  {
    id: 'T002', number: '12138', name: 'Punjab Mail', type: 'mail', direction: 'DN', priority: 2,
    path: [
      { station_id: 'NDLS', chainage_km: 0, arrival: '04:30', departure: '04:45' },
      { station_id: 'NZM', chainage_km: 7, arrival: '04:52', departure: '04:52' },
      { station_id: 'PWL', chainage_km: 56, arrival: '05:25', departure: '05:27' },
      { station_id: 'MTJ', chainage_km: 141, arrival: '06:35', departure: '06:40' },
      { station_id: 'AGC', chainage_km: 195, arrival: '07:15', departure: '07:20' },
    ],
  },
  {
    id: 'T003', number: '12622', name: 'Tamil Nadu Express', type: 'express', direction: 'DN', priority: 2,
    path: [
      { station_id: 'NDLS', chainage_km: 0, arrival: '22:00', departure: '22:15' },
      { station_id: 'NZM', chainage_km: 7, arrival: '22:22', departure: '22:22' },
      { station_id: 'FDB', chainage_km: 28, arrival: '22:42', departure: '22:42' },
      { station_id: 'MTJ', chainage_km: 141, arrival: '23:55', departure: '00:00' },
      { station_id: 'AGC', chainage_km: 195, arrival: '00:35', departure: '00:40' },
    ],
  },
  {
    id: 'T004', number: '12724', name: 'AP Express', type: 'express', direction: 'DN', priority: 2,
    path: [
      { station_id: 'NDLS', chainage_km: 0, arrival: '18:30', departure: '18:45' },
      { station_id: 'NZM', chainage_km: 7, arrival: '18:52', departure: '18:55' },
      { station_id: 'MTJ', chainage_km: 141, arrival: '20:25', departure: '20:30' },
      { station_id: 'AGC', chainage_km: 195, arrival: '21:10', departure: '21:15' },
    ],
  },
  {
    id: 'T005', number: '12952', name: 'Rajdhani Express', type: 'rajdhani', direction: 'DN', priority: 1,
    path: [
      { station_id: 'NDLS', chainage_km: 0, arrival: '16:30', departure: '16:50' },
      { station_id: 'NZM', chainage_km: 7, arrival: '16:58', departure: '16:58' },
      { station_id: 'MTJ', chainage_km: 141, arrival: '18:15', departure: '18:17' },
      { station_id: 'AGC', chainage_km: 195, arrival: '18:50', departure: '18:55' },
    ],
  },
  {
    id: 'T006', number: '12050', name: 'Gatimaan Express', type: 'shatabdi', direction: 'DN', priority: 1,
    path: [
      { station_id: 'NZM', chainage_km: 7, arrival: '08:10', departure: '08:10' },
      { station_id: 'AGC', chainage_km: 195, arrival: '09:50', departure: '09:55' },
    ],
  },
  {
    id: 'T007', number: '12001', name: 'Bhopal Shatabdi (Up)', type: 'shatabdi', direction: 'UP', priority: 1,
    path: [
      { station_id: 'AGC', chainage_km: 195, arrival: '20:30', departure: '20:35' },
      { station_id: 'MTJ', chainage_km: 141, arrival: '21:10', departure: '21:12' },
      { station_id: 'NDLS', chainage_km: 0, arrival: '22:40', departure: '22:40' },
    ],
  },
  {
    id: 'F001', number: 'BCNA-4521', name: 'Freight BCNA Rake', type: 'freight', direction: 'DN', priority: 5,
    path: [
      { station_id: 'NDLS', chainage_km: 0, arrival: '01:00', departure: '01:10' },
      { station_id: 'FDB', chainage_km: 28, arrival: '01:40', departure: '01:40' },
      { station_id: 'PWL', chainage_km: 56, arrival: '02:10', departure: '02:15' },
      { station_id: 'MTJ', chainage_km: 141, arrival: '03:30', departure: '03:35' },
      { station_id: 'AGC', chainage_km: 195, arrival: '04:30', departure: '04:30' },
    ],
  },
  {
    id: 'F002', number: 'BOXN-7833', name: 'Freight BOXN Coal Rake', type: 'freight', direction: 'UP', priority: 5,
    path: [
      { station_id: 'AGC', chainage_km: 195, arrival: '02:00', departure: '02:10' },
      { station_id: 'MTJ', chainage_km: 141, arrival: '03:00', departure: '03:05' },
      { station_id: 'PWL', chainage_km: 56, arrival: '04:20', departure: '04:25' },
      { station_id: 'NDLS', chainage_km: 0, arrival: '05:30', departure: '05:30' },
    ],
  },
  {
    id: 'F003', number: 'BTPN-2290', name: 'Freight Petroleum Rake', type: 'freight', direction: 'DN', priority: 4,
    path: [
      { station_id: 'NDLS', chainage_km: 0, arrival: '23:30', departure: '23:40' },
      { station_id: 'FDB', chainage_km: 28, arrival: '00:10', departure: '00:10' },
      { station_id: 'MTJ', chainage_km: 141, arrival: '01:30', departure: '01:35' },
      { station_id: 'AGC', chainage_km: 195, arrival: '02:20', departure: '02:20' },
    ],
  },
  {
    id: 'T008', number: '14854', name: 'Jodhpur Express', type: 'express', direction: 'UP', priority: 3,
    path: [
      { station_id: 'AGC', chainage_km: 195, arrival: '05:15', departure: '05:20' },
      { station_id: 'MTJ', chainage_km: 141, arrival: '05:55', departure: '06:00' },
      { station_id: 'PWL', chainage_km: 56, arrival: '07:15', departure: '07:18' },
      { station_id: 'NDLS', chainage_km: 0, arrival: '08:30', departure: '08:30' },
    ],
  },
  {
    id: 'T009', number: '12903', name: 'Golden Temple Mail', type: 'mail', direction: 'UP', priority: 2,
    path: [
      { station_id: 'AGC', chainage_km: 195, arrival: '10:00', departure: '10:10' },
      { station_id: 'MTJ', chainage_km: 141, arrival: '10:45', departure: '10:50' },
      { station_id: 'NDLS', chainage_km: 0, arrival: '12:30', departure: '12:30' },
    ],
  },
];

// ── Golden Journey: 3 Maintenance Demands at KM 142–146 ──────────
export const GOLDEN_DEMANDS: MaintenanceDemand[] = [
  {
    id: 'D-2025-001',
    department: 'Civil',
    title: 'Track Tamping — KM 142+000 to 144+500',
    description: 'Machine tamping required for track geometry restoration. TQI degraded below threshold. Active TSR in effect at 75 km/h. High GMT section (35 GMT).',
    work_type: 'Machine Tamping (09-3X)',
    chainage_start_km: 142.0,
    chainage_end_km: 144.5,
    line: 'UP',
    estimated_duration_min: 150,
    priority: 'urgent',
    status: 'submitted',
    arci_score: 82,
    requires_power_block: false,
    requires_traffic_block: true,
    submitted_by: 'SSE/PW/MTJ',
    submitted_at: '2025-03-15T09:00:00+05:30',
    machine_required: 'Plasser 09-3X Tamper',
  },
  {
    id: 'D-2025-002',
    department: 'TRD',
    title: 'OHE Stagger Correction — Mast 142/18 to 145/06',
    description: 'Contact wire stagger exceeds 300mm at 4 masts. Risk of pantograph damage. Requires power block and tower wagon.',
    work_type: 'OHE Stagger Adjustment',
    chainage_start_km: 142.25,
    chainage_end_km: 145.1,
    line: 'UP',
    estimated_duration_min: 90,
    priority: 'urgent',
    status: 'submitted',
    arci_score: 71,
    requires_power_block: true,
    requires_traffic_block: true,
    submitted_by: 'SSE/TRD/MTJ',
    submitted_at: '2025-03-15T09:30:00+05:30',
  },
  {
    id: 'D-2025-003',
    department: 'S&T',
    title: 'Point Machine PM-04 — KM 143+120',
    description: 'Preventive maintenance of point machine #PM-04 at Mathura South. Intermittent detection faults logged. Requires interlocking possession.',
    work_type: 'Point Machine PM (Clamp-Lock)',
    chainage_start_km: 143.0,
    chainage_end_km: 143.25,
    line: 'BOTH',
    estimated_duration_min: 60,
    priority: 'routine',
    status: 'submitted',
    arci_score: 58,
    requires_power_block: false,
    requires_traffic_block: true,
    submitted_by: 'SSE/SIG/MTJ',
    submitted_at: '2025-03-15T10:00:00+05:30',
  },
];

// ── ARCI Breakdowns for Golden Demands ────────────────────────────
export const GOLDEN_ARCI_BREAKDOWNS: Record<string, ARCIBreakdown> = {
  'D-2025-001': {
    failure_probability: 0.85,
    safety_criticality: 0.70,
    tsr_delay_penalty: 0.95,
    overdue_days: 0.60,
    traffic_density: 0.90,
    route_criticality: 0.85,
  },
  'D-2025-002': {
    failure_probability: 0.65,
    safety_criticality: 0.80,
    tsr_delay_penalty: 0.50,
    overdue_days: 0.40,
    traffic_density: 0.90,
    route_criticality: 0.85,
  },
  'D-2025-003': {
    failure_probability: 0.45,
    safety_criticality: 0.65,
    tsr_delay_penalty: 0.30,
    overdue_days: 0.55,
    traffic_density: 0.90,
    route_criticality: 0.50,
  },
};

// ── Golden Journey: Solver Output (Pre-computed) ──────────────────
export const GOLDEN_JOINT_BLOCK: JointBlock = {
  id: 'JB-2025-001',
  demand_ids: ['D-2025-001', 'D-2025-002', 'D-2025-003'],
  chainage_start_km: 142.0,
  chainage_end_km: 145.1,
  line: 'UP',
  start_time: '2025-03-16T01:05:00+05:30',
  end_time: '2025-03-16T04:15:00+05:30',
  duration_min: 190,
  status: 'planned',
  departments: ['Civil', 'S&T', 'TRD'],
  requires_power_block: true,
  requires_traffic_block: true,
  closures_saved: 2,
  minutes_saved: 120,
  affected_trains: [
    {
      train_id: 'F001',
      train_number: 'BCNA-4521',
      train_name: 'Freight BCNA Rake',
      train_type: 'freight',
      delay_minutes: 6,
      impact_type: 'hold',
    },
  ],
  solver_rationale: 'All three demands (Civil tamping KM 142–144.5, TRD OHE stagger KM 142.25–145.1, S&T point machine KM 143.12) share overlapping protection envelopes within 500m proximity. Combined into single joint shadow block 01:05–04:15 in the identified 00:40–04:30 traffic gap. Civil tamping and TRD OHE work execute in parallel (150 min). S&T point machine runs sequentially after OHE isolation (60 min). Net savings: 2 line closures eliminated, 120 minutes of overhead saved. Only impact: 6-minute hold for Freight BCNA-4521 at Mathura Jn. Zero passenger train delays.',
};

// ── Before/After Bundling Comparison ──────────────────────────────
export const BUNDLING_COMPARISON = {
  before: {
    total_closures: 3,
    total_block_minutes: 300, // 150 + 90 + 60
    setup_overhead_min: 180, // 60 min x 3
    passenger_delays_min: 0,
    freight_delays_min: 18, // 6 x 3
    description: 'Three separate possession requests: Civil tamping (2h 30m block), TRD OHE stagger (1h 30m block), S&T point machine (1h block). Each requires separate protection setup, OHE isolation, crew mobilization.',
  },
  after: {
    total_closures: 1,
    total_block_minutes: 190,
    setup_overhead_min: 60,
    passenger_delays_min: 0,
    freight_delays_min: 6,
    description: 'Single coordinated joint shadow block (3h 10m). Civil tamping and TRD OHE stagger work in parallel. S&T point machine runs after OHE isolation clearance. Shared protection envelope and single crew mobilization.',
  },
};

// ── Disruption Event (Step 7 of Golden Journey) ───────────────────
export const GOLDEN_DISRUPTION: DisruptionEvent = {
  id: 'DISR-001',
  type: 'train_delay',
  description: 'Freight BCNA-4521 running 40 minutes late due to crew change delay at Palwal Junction.',
  affected_chainage_km: 56,
  delay_minutes: 40,
  timestamp: '2025-03-16T00:30:00+05:30',
};

export const GOLDEN_RECOVERY_OPTIONS: RecoveryPlan[] = [
  {
    option: 'compress',
    label: 'Compress Block',
    description: 'Compress block to 2h 40m (01:05–03:45) by deploying additional tamping crew. OHE stagger work reduced to critical 3 masts only. S&T PM-04 unchanged.',
    new_start_time: '2025-03-16T01:05:00+05:30',
    new_end_time: '2025-03-16T03:45:00+05:30',
    new_duration_min: 160,
    passenger_delay_min: 0,
    freight_delay_min: 0,
    feasibility_score: 85,
    solver_time_ms: 2100,
  },
  {
    option: 'shift',
    label: 'Shift Block Forward',
    description: 'Shift entire block to 01:50–05:00 to accommodate delayed freight passage. All work scopes maintained.',
    new_start_time: '2025-03-16T01:50:00+05:30',
    new_end_time: '2025-03-16T05:00:00+05:30',
    new_duration_min: 190,
    passenger_delay_min: 0,
    freight_delay_min: 0,
    feasibility_score: 72,
    solver_time_ms: 1800,
  },
  {
    option: 'split',
    label: 'Split into Two Micro-Blocks',
    description: 'Split: Block-A (01:05–01:45, S&T PM only) → freight passes → Block-B (02:00–04:10, Civil + TRD).',
    new_start_time: '2025-03-16T01:05:00+05:30',
    new_end_time: '2025-03-16T04:10:00+05:30',
    new_duration_min: 185,
    passenger_delay_min: 0,
    freight_delay_min: 0,
    feasibility_score: 65,
    solver_time_ms: 3200,
  },
  {
    option: 'cancel',
    label: 'Cancel Block (Last Resort)',
    description: 'Cancel block and reschedule to next available window (2025-03-17 01:00–04:15). Maintenance debt increases.',
    passenger_delay_min: 0,
    freight_delay_min: 0,
    feasibility_score: 100,
    solver_time_ms: 50,
  },
];

// ── Incident Scanner (Step 8 of Golden Journey) ───────────────────
export const GOLDEN_INCIDENT: IncidentReport = {
  id: 'INC-2025-001',
  photo_url: '/demo/missing_fastener.jpg',
  defect_class: 'missing_fastener',
  confidence: 0.94,
  severity: 'medium',
  chainage_km: 143.12,
  line: 'UP',
  lat: 27.485,
  lon: 77.668,
  reporter_id: 'TRACKMAN-MTJ-04',
  timestamp: '2025-03-16T06:30:00+05:30',
  department: 'Civil',
  verified: false,
};

// ── Caution Order (Step 6 of Golden Journey) ──────────────────────
export const GOLDEN_CAUTION_ORDER: CautionOrder = {
  id: 'CO-2025-001',
  form_number: 'T/409B/MTJ/2025/0312',
  block_id: 'JB-2025-001',
  speed_limit_kmph: 15,
  chainage_from_km: 141.5,
  chainage_to_km: 145.5,
  valid_from: '2025-03-16T01:00:00+05:30',
  valid_until: '2025-03-16T04:30:00+05:30',
  reason: 'Joint Shadow Block — Civil Machine Tamping + TRD OHE Stagger Correction + S&T Point Machine PM. Power block in effect. Traffic block on UP line KM 142.0–145.1.',
  issued_by: 'SC/MTJ',
  issued_at: '2025-03-15T22:00:00+05:30',
  departments_notified: ['Civil', 'S&T', 'TRD'],
};

// ── KPI Dashboard Metrics ─────────────────────────────────────────
export const DEMO_KPIS: KPIMetrics = {
  asset_availability_pct: 94.2,
  corridor_downtime_saved_min: 840,
  joint_block_ratio_pct: 68,
  machine_productive_hours_pct: 82.5,
  delay_minutes_per_possession: 3.2,
  closures_saved_total: 14,
  demands_processed: 47,
  avg_solver_time_ms: 2400,
};

// ── Demo Users ────────────────────────────────────────────────────
export const DEMO_USERS: User[] = [
  {
    id: 'U001',
    name: 'Rajesh Kumar',
    role: 'section_controller',
    designation: 'Section Controller / Mathura Jn',
    zone: 'NCR',
    division: 'Agra',
  },
  {
    id: 'U002',
    name: 'Priya Sharma',
    role: 'block_planner',
    designation: 'Block Planner / NCR Division',
    zone: 'NCR',
    division: 'Agra',
  },
  {
    id: 'U003',
    name: 'Vikram Singh',
    role: 'civil_engineer',
    designation: 'SSE/PW/Mathura',
    zone: 'NCR',
    division: 'Agra',
  },
  {
    id: 'U004',
    name: 'Anita Desai',
    role: 'trd_engineer',
    designation: 'SSE/TRD/Mathura',
    zone: 'NCR',
    division: 'Agra',
  },
  {
    id: 'U005',
    name: 'Mohammad Ali',
    role: 'snt_engineer',
    designation: 'SSE/SIG/Mathura',
    zone: 'NCR',
    division: 'Agra',
  },
  {
    id: 'U006',
    name: 'Suresh Patil',
    role: 'field_reporter',
    designation: 'Trackman/MTJ/Gang-04',
    zone: 'NCR',
    division: 'Agra',
  },
];

// ── Audit Log Entries ─────────────────────────────────────────────
export const DEMO_AUDIT_LOG: AuditEntry[] = [
  {
    id: 'AUD-001',
    timestamp: '2025-03-15T09:00:00+05:30',
    user_id: 'U003',
    user_role: 'civil_engineer',
    action: 'DEMAND_SUBMITTED',
    entity_type: 'maintenance_demand',
    entity_id: 'D-2025-001',
    after_state: 'submitted',
    hash: 'a3f2c8d1e5b7',
  },
  {
    id: 'AUD-002',
    timestamp: '2025-03-15T09:30:00+05:30',
    user_id: 'U004',
    user_role: 'trd_engineer',
    action: 'DEMAND_SUBMITTED',
    entity_type: 'maintenance_demand',
    entity_id: 'D-2025-002',
    after_state: 'submitted',
    hash: 'b4e3d9f2a6c8',
  },
  {
    id: 'AUD-003',
    timestamp: '2025-03-15T10:00:00+05:30',
    user_id: 'U005',
    user_role: 'snt_engineer',
    action: 'DEMAND_SUBMITTED',
    entity_type: 'maintenance_demand',
    entity_id: 'D-2025-003',
    after_state: 'submitted',
    hash: 'c5f4e0a3b7d9',
  },
  {
    id: 'AUD-004',
    timestamp: '2025-03-15T14:00:00+05:30',
    user_id: 'U002',
    user_role: 'block_planner',
    action: 'BUNDLE_CREATED',
    entity_type: 'joint_block',
    entity_id: 'JB-2025-001',
    after_state: 'planned',
    hash: 'd6a5f1b4c8e0',
  },
  {
    id: 'AUD-005',
    timestamp: '2025-03-15T16:30:00+05:30',
    user_id: 'U001',
    user_role: 'section_controller',
    action: 'BLOCK_APPROVED',
    entity_type: 'joint_block',
    entity_id: 'JB-2025-001',
    before_state: 'planned',
    after_state: 'approved',
    hash: 'e7b6a2c5d9f1',
  },
  {
    id: 'AUD-006',
    timestamp: '2025-03-15T22:00:00+05:30',
    user_id: 'U001',
    user_role: 'section_controller',
    action: 'CAUTION_ORDER_ISSUED',
    entity_type: 'caution_order',
    entity_id: 'CO-2025-001',
    after_state: 'issued',
    hash: 'f8c7b3d6e0a2',
  },
];

// ── Additional Demands for Demand Queue View ──────────────────────
export const ADDITIONAL_DEMANDS: MaintenanceDemand[] = [
  {
    id: 'D-2025-004',
    department: 'Civil',
    title: 'Rail Grinding — KM 28+000 to 35+000',
    description: 'Corrective rail grinding to remove surface corrugation on DN line. Machine required.',
    work_type: 'Rail Grinding',
    chainage_start_km: 28.0,
    chainage_end_km: 35.0,
    line: 'DN',
    estimated_duration_min: 240,
    priority: 'routine',
    status: 'validated',
    arci_score: 45,
    requires_power_block: false,
    requires_traffic_block: true,
    submitted_by: 'SSE/PW/FDB',
    submitted_at: '2025-03-14T11:00:00+05:30',
    machine_required: 'RGM Rail Grinder',
  },
  {
    id: 'D-2025-005',
    department: 'S&T',
    title: 'Signal Relay Room Inspection — Palwal',
    description: 'Annual relay room inspection and battery test at Palwal Jn relay room.',
    work_type: 'Relay Room Inspection',
    chainage_start_km: 55.8,
    chainage_end_km: 56.2,
    line: 'BOTH',
    estimated_duration_min: 120,
    priority: 'routine',
    status: 'submitted',
    arci_score: 38,
    requires_power_block: false,
    requires_traffic_block: false,
    submitted_by: 'SSE/SIG/PWL',
    submitted_at: '2025-03-14T14:30:00+05:30',
  },
  {
    id: 'D-2025-006',
    department: 'TRD',
    title: 'Neutral Section Inspection — Agra Cantt',
    description: 'Periodic inspection of neutral section at Agra Cantt. Insulator condition check and gap measurement.',
    work_type: 'Neutral Section PM',
    chainage_start_km: 194.0,
    chainage_end_km: 195.0,
    line: 'UP',
    estimated_duration_min: 90,
    priority: 'routine',
    status: 'validated',
    arci_score: 52,
    requires_power_block: true,
    requires_traffic_block: false,
    submitted_by: 'SSE/TRD/AGC',
    submitted_at: '2025-03-13T16:00:00+05:30',
  },
  {
    id: 'D-2025-007',
    department: 'Civil',
    title: 'Emergency Rail Replacement — KM 87+300',
    description: 'Critical rail crack detected at KM 87+300 UP line. Immediate replacement required. Safety override.',
    work_type: 'Emergency Rail Replacement',
    chainage_start_km: 87.0,
    chainage_end_km: 87.5,
    line: 'UP',
    estimated_duration_min: 180,
    priority: 'emergency',
    status: 'submitted',
    arci_score: 96,
    requires_power_block: false,
    requires_traffic_block: true,
    submitted_by: 'SSE/PW/KSV',
    submitted_at: '2025-03-15T18:00:00+05:30',
  },
];
