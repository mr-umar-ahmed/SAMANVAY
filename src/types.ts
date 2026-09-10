/* ================================================================
   SAMANVAY — Core TypeScript Types
   ================================================================ */

// ── Roles & Auth ──────────────────────────────────────────────────
export type UserRole =
  | 'section_controller'
  | 'block_planner'
  | 'civil_engineer'
  | 'snt_engineer'
  | 'trd_engineer'
  | 'field_reporter'
  | 'zonal_management'
  | 'admin';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  designation: string;
  zone: string;
  division: string;
  avatar?: string;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  section_controller: 'Section Controller',
  block_planner: 'Block Planner',
  civil_engineer: 'Civil Engineer (PWay)',
  snt_engineer: 'S&T Engineer',
  trd_engineer: 'TRD Engineer (OHE)',
  field_reporter: 'Field Reporter',
  zonal_management: 'Zonal Management',
  admin: 'Admin',
};

// ── Department ────────────────────────────────────────────────────
export type Department = 'Civil' | 'S&T' | 'TRD';

export const DEPARTMENT_COLORS: Record<Department, { primary: string; bg: string; badge: string }> = {
  'Civil': { primary: '#5C6BC0', bg: '#E8EAF6', badge: '#C5CAE9' },
  'S&T': { primary: '#7E57C2', bg: '#EDE7F6', badge: '#D1C4E9' },
  'TRD': { primary: '#F9A825', bg: '#FFF8E1', badge: '#FFF9C4' },
};

// ── Corridor / LRS ────────────────────────────────────────────────
export interface Station {
  id: string;
  name: string;
  code: string;
  chainage_km: number;
  lat: number;
  lon: number;
  lines: number; // 2 or 4
  hasInterlocking: boolean;
  hasLC?: boolean;
  hasNeutralSection?: boolean;
}

export interface TrackCircuit {
  id: string;
  name: string;
  chainage_start_km: number;
  chainage_end_km: number;
  line: 'UP' | 'DN' | 'UP_LOOP' | 'DN_LOOP';
  station_id: string;
}

export interface OHEMast {
  id: string;
  mast_number: string;
  chainage_km: number;
  line: 'UP' | 'DN';
  elementary_section: string;
  condition: 'good' | 'fair' | 'poor' | 'critical';
}

export interface CorridorData {
  name: string;
  from: string;
  to: string;
  total_km: number;
  stations: Station[];
  trackCircuits: TrackCircuit[];
  oheMasts: OHEMast[];
}

// ── Maintenance Demand ────────────────────────────────────────────
export type DemandPriority = 'routine' | 'urgent' | 'emergency';
export type DemandStatus = 'submitted' | 'validated' | 'bundled' | 'scheduled' | 'approved' | 'completed' | 'rejected';

export interface MaintenanceDemand {
  id: string;
  department: Department;
  title: string;
  description: string;
  work_type: string;
  chainage_start_km: number;
  chainage_end_km: number;
  line: 'UP' | 'DN' | 'BOTH';
  estimated_duration_min: number;
  priority: DemandPriority;
  status: DemandStatus;
  arci_score: number;
  requires_power_block: boolean;
  requires_traffic_block: boolean;
  submitted_by: string;
  submitted_at: string;
  track_circuit_ids?: string[];
  ohe_mast_ids?: string[];
  machine_required?: string;
}

// ── ARCI Score ────────────────────────────────────────────────────
export interface ARCIBreakdown {
  failure_probability: number;  // 0–1, weight 30%
  safety_criticality: number;   // 0–1, weight 25%
  tsr_delay_penalty: number;    // 0–1, weight 15%
  overdue_days: number;         // 0–1, weight 10%
  traffic_density: number;      // 0–1, weight 10%
  route_criticality: number;    // 0–1, weight 10%
}

export interface ARCIWeights {
  failure_probability: number;
  safety_criticality: number;
  tsr_delay_penalty: number;
  overdue_days: number;
  traffic_density: number;
  route_criticality: number;
}

export const DEFAULT_ARCI_WEIGHTS: ARCIWeights = {
  failure_probability: 0.30,
  safety_criticality: 0.25,
  tsr_delay_penalty: 0.15,
  overdue_days: 0.10,
  traffic_density: 0.10,
  route_criticality: 0.10,
};

// ── Joint Shadow Block ────────────────────────────────────────────
export type BlockStatus = 'planned' | 'protected' | 'in_progress' | 'clearing' | 'closed' | 'cancelled';
export type ControllerAction = 'approve' | 'modify_approve' | 'reject';

export interface JointBlock {
  id: string;
  demand_ids: string[];
  chainage_start_km: number;
  chainage_end_km: number;
  line: 'UP' | 'DN' | 'BOTH';
  start_time: string; // ISO 8601
  end_time: string;
  duration_min: number;
  status: BlockStatus;
  departments: Department[];
  requires_power_block: boolean;
  requires_traffic_block: boolean;
  closures_saved: number;
  minutes_saved: number;
  affected_trains: TrainImpact[];
  solver_rationale: string;
  controller_action?: ControllerAction;
  controller_notes?: string;
  controller_id?: string;
  controller_action_at?: string;
}

// ── Train ─────────────────────────────────────────────────────────
export type TrainType = 'rajdhani' | 'shatabdi' | 'express' | 'mail' | 'freight' | 'suburban' | 'special';

export interface Train {
  id: string;
  number: string;
  name: string;
  type: TrainType;
  direction: 'UP' | 'DN';
  path: TrainPathPoint[];
  priority: number; // 1 = highest (Rajdhani), 5 = lowest (freight)
}

export interface TrainPathPoint {
  station_id: string;
  chainage_km: number;
  arrival: string; // HH:mm
  departure: string;
}

export interface TrainImpact {
  train_id: string;
  train_number: string;
  train_name: string;
  train_type: TrainType;
  delay_minutes: number;
  impact_type: 'none' | 'hold' | 'reroute' | 'reschedule';
}

// ── Disruption & Recovery ─────────────────────────────────────────
export type RecoveryOption = 'shift' | 'compress' | 'split' | 'cancel';

export interface DisruptionEvent {
  id: string;
  type: 'train_delay' | 'equipment_failure' | 'weather' | 'accident';
  description: string;
  affected_chainage_km: number;
  delay_minutes: number;
  timestamp: string;
}

export interface RecoveryPlan {
  option: RecoveryOption;
  label: string;
  description: string;
  new_start_time?: string;
  new_end_time?: string;
  new_duration_min?: number;
  passenger_delay_min: number;
  freight_delay_min: number;
  feasibility_score: number; // 0–100
  solver_time_ms: number;
}

// ── Incident Scanner ──────────────────────────────────────────────
export type DefectClass =
  | 'missing_fastener'
  | 'rail_crack'
  | 'broken_fishplate'
  | 'ballast_washout'
  | 'ohe_obstruction'
  | 'broken_rail'
  | 'gauge_widening'
  | 'vegetation_encroachment'
  | 'signal_damage'
  | 'sleeper_damage';

export interface IncidentReport {
  id: string;
  photo_url: string;
  defect_class: DefectClass;
  confidence: number; // 0–1
  severity: 'low' | 'medium' | 'high' | 'critical';
  chainage_km: number;
  line: 'UP' | 'DN';
  lat: number;
  lon: number;
  reporter_id: string;
  timestamp: string;
  department: Department;
  verified: boolean;
  gradcam_url?: string;
}

// ── Form T/409B ───────────────────────────────────────────────────
export interface CautionOrder {
  id: string;
  form_number: string;
  block_id: string;
  speed_limit_kmph: number;
  chainage_from_km: number;
  chainage_to_km: number;
  valid_from: string;
  valid_until: string;
  reason: string;
  issued_by: string;
  issued_at: string;
  departments_notified: Department[];
}

// ── KPI Dashboard ─────────────────────────────────────────────────
export interface KPIMetrics {
  asset_availability_pct: number;
  corridor_downtime_saved_min: number;
  joint_block_ratio_pct: number;
  machine_productive_hours_pct: number;
  delay_minutes_per_possession: number;
  closures_saved_total: number;
  demands_processed: number;
  avg_solver_time_ms: number;
}

// ── Audit Log ─────────────────────────────────────────────────────
export interface AuditEntry {
  id: string;
  timestamp: string;
  user_id: string;
  user_role: UserRole;
  action: string;
  entity_type: string;
  entity_id: string;
  before_state?: string;
  after_state?: string;
  hash: string;
}

// ── Navigation ────────────────────────────────────────────────────
export interface NavItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  module: string;
  roles: UserRole[];
  children?: NavItem[];
}

// ── Multi-Horizon ─────────────────────────────────────────────────
export type PlanningHorizon = 'strategic' | 'tactical' | 'dispatch';
