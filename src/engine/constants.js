/**
 * Domain constants shared by the data factory, risk engine, scheduler and UI.
 * Everything here is documented in docs/IMPLEMENTATION.md.
 */

export const DEPARTMENTS = {
  TMS: { code: 'TMS', name: 'Civil Engineering (P-Way)', system: 'Track Management System', short: 'Civil', officer: 'Sr. DEN', color: 'tms' },
  SMMS: { code: 'SMMS', name: 'Signal & Telecom', system: 'Signalling Maintenance & Management System', short: 'S&T', officer: 'Sr. DSTE', color: 'smms' },
  TDMS: { code: 'TDMS', name: 'Traction Distribution (OHE)', system: 'Traction Distribution Management System', short: 'TRD', officer: 'Sr. DEE (TRD)', color: 'tdms' }
};

/** Train classes with the weight used in the delay-cost function (0..1). */
export const TRAIN_CLASSES = {
  VB: { code: 'VB', label: 'Vande Bharat', weight: 1.0, premium: true, speedKmph: 130 },
  RAJ: { code: 'RAJ', label: 'Rajdhani / Duronto', weight: 0.95, premium: true, speedKmph: 130 },
  SHT: { code: 'SHT', label: 'Shatabdi / Tejas', weight: 0.9, premium: true, speedKmph: 130 },
  SF: { code: 'SF', label: 'Superfast Express', weight: 0.75, premium: false, speedKmph: 110 },
  EXP: { code: 'EXP', label: 'Mail / Express', weight: 0.65, premium: false, speedKmph: 100 },
  PASS: { code: 'PASS', label: 'Passenger / MEMU', weight: 0.45, premium: false, speedKmph: 80 },
  GOODS: { code: 'GOODS', label: 'Goods (FOIS forecast)', weight: 0.25, premium: false, speedKmph: 65 },
  PARCEL: { code: 'PARCEL', label: 'Parcel / Military', weight: 0.35, premium: false, speedKmph: 75 }
};

/**
 * Work types. Each work type belongs to a department, needs a certain kind of
 * block, and has a typical duration, setup and clearance time.
 *
 * blockKind:
 *   TRAFFIC   – line closed to trains (traffic block)
 *   POWER     – 25 kV OHE de-energised (power block); trains may pass on diesel
 *               only in exceptional cases, so we treat it as line closure too.
 *   TRAFFIC_POWER – both
 *   DISCONNECTION – S&T disconnection of signalling gear (yard / station), the
 *               line stays open but the gear is out of use (needs controller
 *               permission, no line closure)
 */
export const WORK_TYPES = {
  // ---- Civil / TMS
  USFD_IMR_RAIL: { dept: 'TMS', label: 'IMR rail / weld replacement (USFD)', assetClass: 'RAIL', blockKind: 'TRAFFIC', durationMin: 90, setupMin: 15, clearanceMin: 15, machine: null, crew: 'PWAY_GANG', safety: 1.0, mandatoryWithinDays: 1, tsrKmph: 30 },
  USFD_OBS_RAIL: { dept: 'TMS', label: 'OBS rail flaw monitoring & weld', assetClass: 'RAIL', blockKind: 'TRAFFIC', durationMin: 75, setupMin: 15, clearanceMin: 10, machine: null, crew: 'PWAY_GANG', safety: 0.7, mandatoryWithinDays: 14, tsrKmph: null },
  TAMPING: { dept: 'TMS', label: 'Track tamping (CSM/Duomatic)', assetClass: 'BALLAST', blockKind: 'TRAFFIC', durationMin: 150, setupMin: 20, clearanceMin: 20, machine: 'CSM', crew: 'PWAY_GANG', safety: 0.5, mandatoryWithinDays: 30, tsrKmph: null },
  DEEP_SCREENING: { dept: 'TMS', label: 'Deep screening of ballast (BCM)', assetClass: 'BALLAST', blockKind: 'TRAFFIC', durationMin: 210, setupMin: 30, clearanceMin: 30, machine: 'BCM', crew: 'PWAY_GANG', safety: 0.55, mandatoryWithinDays: 45, tsrKmph: 50 },
  TURNOUT_RENEWAL: { dept: 'TMS', label: 'Turnout / crossing renewal', assetClass: 'TURNOUT', blockKind: 'TRAFFIC', durationMin: 180, setupMin: 30, clearanceMin: 30, machine: 'UNIMAT', crew: 'PWAY_GANG', safety: 0.7, mandatoryWithinDays: 21, tsrKmph: 45 },
  RAIL_GRINDING: { dept: 'TMS', label: 'Rail grinding', assetClass: 'RAIL', blockKind: 'TRAFFIC', durationMin: 120, setupMin: 20, clearanceMin: 15, machine: 'RGM', crew: 'PWAY_GANG', safety: 0.35, mandatoryWithinDays: 60, tsrKmph: null },
  DESTRESSING: { dept: 'TMS', label: 'LWR de-stressing', assetClass: 'RAIL', blockKind: 'TRAFFIC', durationMin: 150, setupMin: 20, clearanceMin: 20, machine: null, crew: 'PWAY_GANG', safety: 0.6, mandatoryWithinDays: 30, tsrKmph: null },
  CTR: { dept: 'TMS', label: 'Complete track renewal (capital)', assetClass: 'RAIL', blockKind: 'TRAFFIC', durationMin: 240, setupMin: 30, clearanceMin: 30, machine: 'PQRS', crew: 'PWAY_GANG', safety: 0.6, mandatoryWithinDays: 180, tsrKmph: null, capital: true },
  BRIDGE_GIRDER: { dept: 'TMS', label: 'Bridge re-girdering (capital)', assetClass: 'BRIDGE', blockKind: 'TRAFFIC_POWER', durationMin: 300, setupMin: 45, clearanceMin: 45, machine: 'CRANE', crew: 'BRIDGE_GANG', safety: 0.7, mandatoryWithinDays: 180, tsrKmph: 20, capital: true },
  // ---- S&T / SMMS
  POINT_MACHINE_OVERHAUL: { dept: 'SMMS', label: 'Point machine overhaul', assetClass: 'POINT_MACHINE', blockKind: 'DISCONNECTION', durationMin: 90, setupMin: 10, clearanceMin: 15, machine: null, crew: 'SIG_UNIT', safety: 0.85, mandatoryWithinDays: 7, tsrKmph: null },
  TRACK_CIRCUIT_REPAIR: { dept: 'SMMS', label: 'Track circuit / bond repair', assetClass: 'TRACK_CIRCUIT', blockKind: 'DISCONNECTION', durationMin: 60, setupMin: 10, clearanceMin: 10, machine: null, crew: 'SIG_UNIT', safety: 0.8, mandatoryWithinDays: 7, tsrKmph: null },
  AXLE_COUNTER_RESET: { dept: 'SMMS', label: 'Axle counter head replacement', assetClass: 'AXLE_COUNTER', blockKind: 'DISCONNECTION', durationMin: 75, setupMin: 10, clearanceMin: 15, machine: null, crew: 'SIG_UNIT', safety: 0.75, mandatoryWithinDays: 10, tsrKmph: null },
  EI_CARD_REPLACEMENT: { dept: 'SMMS', label: 'Electronic interlocking card swap', assetClass: 'EI', blockKind: 'DISCONNECTION', durationMin: 60, setupMin: 15, clearanceMin: 20, machine: null, crew: 'SIG_UNIT', safety: 0.95, mandatoryWithinDays: 3, tsrKmph: null },
  SIGNAL_CABLE: { dept: 'SMMS', label: 'Signal cable / OFC re-laying', assetClass: 'CABLE', blockKind: 'TRAFFIC', durationMin: 120, setupMin: 15, clearanceMin: 15, machine: null, crew: 'SIG_UNIT', safety: 0.5, mandatoryWithinDays: 45, tsrKmph: null },
  LC_GATE_INTERLOCK: { dept: 'SMMS', label: 'LC gate interlocking test', assetClass: 'LC_GATE', blockKind: 'DISCONNECTION', durationMin: 45, setupMin: 10, clearanceMin: 10, machine: null, crew: 'SIG_UNIT', safety: 0.8, mandatoryWithinDays: 14, tsrKmph: null },
  // ---- TRD / TDMS
  CONTACT_WIRE_RENEWAL: { dept: 'TDMS', label: 'Contact wire renewal', assetClass: 'CONTACT_WIRE', blockKind: 'TRAFFIC_POWER', durationMin: 180, setupMin: 30, clearanceMin: 25, machine: 'TOWER_WAGON', crew: 'OHE_GANG', safety: 0.85, mandatoryWithinDays: 7, tsrKmph: 60 },
  DROPPER_STAGGER: { dept: 'TDMS', label: 'Dropper / stagger adjustment', assetClass: 'CONTACT_WIRE', blockKind: 'TRAFFIC_POWER', durationMin: 90, setupMin: 20, clearanceMin: 20, machine: 'TOWER_WAGON', crew: 'OHE_GANG', safety: 0.6, mandatoryWithinDays: 21, tsrKmph: null },
  INSULATOR_REPLACEMENT: { dept: 'TDMS', label: 'Insulator replacement / washing', assetClass: 'INSULATOR', blockKind: 'POWER', durationMin: 75, setupMin: 20, clearanceMin: 15, machine: 'TOWER_WAGON', crew: 'OHE_GANG', safety: 0.7, mandatoryWithinDays: 14, tsrKmph: null },
  CANTILEVER_REPLACEMENT: { dept: 'TDMS', label: 'Cantilever assembly replacement', assetClass: 'CANTILEVER', blockKind: 'TRAFFIC_POWER', durationMin: 120, setupMin: 25, clearanceMin: 20, machine: 'TOWER_WAGON', crew: 'OHE_GANG', safety: 0.65, mandatoryWithinDays: 30, tsrKmph: null },
  NEUTRAL_SECTION: { dept: 'TDMS', label: 'Neutral section overhaul', assetClass: 'NEUTRAL_SECTION', blockKind: 'TRAFFIC_POWER', durationMin: 120, setupMin: 25, clearanceMin: 20, machine: 'TOWER_WAGON', crew: 'OHE_GANG', safety: 0.8, mandatoryWithinDays: 14, tsrKmph: 60 },
  TSS_MAINTENANCE: { dept: 'TDMS', label: 'Traction sub-station maintenance', assetClass: 'TSS', blockKind: 'POWER', durationMin: 150, setupMin: 20, clearanceMin: 20, machine: null, crew: 'TSS_CREW', safety: 0.6, mandatoryWithinDays: 45, tsrKmph: null },
  OHE_REWIRING: { dept: 'TDMS', label: 'OHE re-wiring / regulation (capital)', assetClass: 'CONTACT_WIRE', blockKind: 'TRAFFIC_POWER', durationMin: 240, setupMin: 30, clearanceMin: 30, machine: 'WIRING_TRAIN', crew: 'OHE_GANG', safety: 0.6, mandatoryWithinDays: 180, tsrKmph: null, capital: true }
};

/** Track machines available to a division (type → fleet). */
export const MACHINE_TYPES = {
  CSM: { label: 'Continuous tamping machine (CSM 09-32)', dept: 'TMS', speedKmph: 40 },
  BCM: { label: 'Ballast cleaning machine (BCM)', dept: 'TMS', speedKmph: 30 },
  UNIMAT: { label: 'Points & crossing tamper (UNIMAT 4S)', dept: 'TMS', speedKmph: 40 },
  RGM: { label: 'Rail grinding machine', dept: 'TMS', speedKmph: 40 },
  PQRS: { label: 'Track relaying train (PQRS)', dept: 'TMS', speedKmph: 30 },
  CRANE: { label: '140 T breakdown crane', dept: 'TMS', speedKmph: 40 },
  TOWER_WAGON: { label: '8-wheeler OHE tower wagon', dept: 'TDMS', speedKmph: 60 },
  WIRING_TRAIN: { label: 'OHE wiring train', dept: 'TDMS', speedKmph: 40 }
};

export const CREW_TYPES = {
  PWAY_GANG: { label: 'P-Way gang', dept: 'TMS', maxMinPerDay: 480 },
  BRIDGE_GANG: { label: 'Bridge gang', dept: 'TMS', maxMinPerDay: 480 },
  SIG_UNIT: { label: 'S&T maintenance unit', dept: 'SMMS', maxMinPerDay: 480 },
  OHE_GANG: { label: 'OHE gang', dept: 'TDMS', maxMinPerDay: 480 },
  TSS_CREW: { label: 'TSS crew', dept: 'TDMS', maxMinPerDay: 480 }
};

/**
 * Compatibility matrix for sharing one block window (the "safety
 * interlocking compliance" rule of the JPO). Pairs listed here may NOT run
 * concurrently on the same block section, even if both fit in the window.
 */
export const INCOMPATIBLE_PAIRS = [
  ['DEEP_SCREENING', 'CONTACT_WIRE_RENEWAL'],     // BCM spoil vs. wire on ground
  ['DEEP_SCREENING', 'OHE_REWIRING'],
  ['TURNOUT_RENEWAL', 'POINT_MACHINE_OVERHAUL'],  // same points cannot be worked by both
  ['CTR', 'SIGNAL_CABLE'],                        // PQRS crane path vs. cable trench
  ['BRIDGE_GIRDER', 'TAMPING'],
  ['BRIDGE_GIRDER', 'CONTACT_WIRE_RENEWAL']
];

/** Default objective weights of the optimiser (user tunable in the studio). */
export const DEFAULT_WEIGHTS = {
  delay: 1.0,          // rupee-neutral weight per class-weighted train-delay minute
  downtime: 0.6,       // per minute of line unavailable (distinct block spans)
  risk: 900,           // per unit ARCI of an unscheduled task per horizon day of waiting
  colocation: 120,     // bonus per additional department sharing a block
  tsr: 4.0,            // per train-minute lost to speed restrictions while a task waits
  spread: 25           // penalty per block (encourages fewer, fuller blocks)
};

/** Hard planning rules. */
export const RULES = {
  minBlockMin: 60,             // no block shorter than this is worth asking for
  maxBlockMin: 360,            // JPO: mega blocks beyond 6 h need GM sanction
  headwayMarginMin: 6,         // gap kept between a train clearing a section and block start
  slwDelayMin: 12,             // extra minutes when a train is worked over the other line (single line working)
  slwCapacityPerHour: 4,       // trains/hour the surviving line can absorb during a block
  premiumConflictHard: true,   // premium (VB/Raj/Shatabdi) paths may never be blocked in the tactical horizon
  maxBlocksPerDay: 5,          // possessions a divisional control can supervise per day on one corridor
  maxConcurrentBlocks: 2,      // simultaneous line closures on the corridor
  annealT0: 300,               // simulated-annealing start temperature (cost units)
  nightWindow: [0, 300],       // 00:00–05:00 preferred for noisy capital work near stations
  noticeWeeksForRegulation: 10 // JPO advance notice when a block needs passenger train regulation
};

export const HORIZONS = {
  weekly: { days: 7, label: 'Weekly tactical plan' },
  monthly: { days: 30, label: 'Monthly plan' },
  rolling: { weeks: 26, label: '26-week Rolling Block Programme' }
};
