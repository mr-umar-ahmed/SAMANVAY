import { useState, useEffect } from 'react';
import {
  Camera, MapPin, AlertTriangle, CheckCircle, Eye, Upload, Crosshair,
  Shield, Compass, Battery, Wifi, Gauge, ArrowRight, Zap, RefreshCw,
  Send, FileText, CheckCircle2, ChevronRight, Sliders, Volume2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { soundFx } from '../utils/audio';
import type { GovLanguage } from '../components/layout/NationalHeader';

interface ScannerPageProps {
  language?: GovLanguage;
}

type DefectScenarioKey = 'missing_fastener' | 'rail_crack' | 'ohe_sag' | 'point_gap';

interface DefectScenario {
  id: DefectScenarioKey;
  nameEn: string;
  nameHi: string;
  department: 'Civil' | 'TRD' | 'S&T';
  chainage: string;
  gps: string;
  severity: 'Routine' | 'Urgent' | 'Emergency';
  confidence: number;
  gapMm: number;
  recommendedSR: string;
  assetId: string;
  description: string;
  assignee: string;
}

const SCENARIOS: Record<DefectScenarioKey, DefectScenario> = {
  missing_fastener: {
    id: 'missing_fastener',
    nameEn: 'Missing Pandrol ERC Clip & Displaced Rubber Pad',
    nameHi: 'पैंड्रोल क्लिप अनुपस्थित व रबर पैड विस्थापित',
    department: 'Civil',
    chainage: 'KM 143+120 UP Fast',
    gps: '27.48512° N, 77.66841° E',
    severity: 'Urgent',
    confidence: 96.8,
    gapMm: 24.2,
    recommendedSR: 'SR 30 km/h',
    assetId: 'SLEEPER-PSC60-412 (Kosi Kalan – Chhata)',
    description: 'Pandrol elastic rail clip dislodged due to dynamic freight vibration. Outer liner shifted 24mm outward. Track gauge integrity compromised.',
    assignee: 'SSE / P-Way / Mathura (Sr. Sec Engineer)',
  },
  rail_crack: {
    id: 'rail_crack',
    nameEn: 'Transverse Rail Fatigue Hairline Crack',
    nameHi: 'रेल हेड में अनुप्रस्थ दरार (थकान फ्रैक्चर)',
    department: 'Civil',
    chainage: 'KM 152+400 DN Fast',
    gps: '27.52180° N, 77.63210° E',
    severity: 'Emergency',
    confidence: 94.5,
    gapMm: 18.4,
    recommendedSR: 'SR 20 km/h (Immediate)',
    assetId: 'RAIL-UIC60-W88 (Thermit Weld Zone)',
    description: 'Internal transverse hairline flaw propagated to rail surface. Ultrasonic B-Scan confirmation required. Immediate clamping and speed restriction mandated.',
    assignee: 'SSE / P-Way / Agra Cantt',
  },
  ohe_sag: {
    id: 'ohe_sag',
    nameEn: 'OHE Cantilever Insulator Flashover & Dropper Slack',
    nameHi: 'ओएचई इंसुलेटर फ्लैशओवर व ड्रॉपर ढीला',
    department: 'TRD',
    chainage: 'KM 141+850 UP Fast',
    gps: '27.47210° N, 77.67900° E',
    severity: 'Urgent',
    confidence: 95.2,
    gapMm: 35.0,
    recommendedSR: 'Pantograph Lower Order',
    assetId: 'OHE-MAST-142/18 (25kV AC Traction)',
    description: 'Flashover soot deposits observed on 25kV composite insulator. Dropper tension slack by 35mm, risking pantograph entanglement at >110 km/h.',
    assignee: 'SSE / TRD / Kosi Kalan',
  },
  point_gap: {
    id: 'point_gap',
    nameEn: 'Point Machine Tongue Rail Housing Detection Gap',
    nameHi: 'पॉइंट मशीन स्विच टंग रेल अंतर दोष',
    department: 'S&T',
    chainage: 'KM 148+900 Mathura Yard',
    gps: '27.50290° N, 77.65140° E',
    severity: 'Emergency',
    confidence: 97.4,
    gapMm: 5.2,
    recommendedSR: 'Signal Interlock Clamped',
    assetId: 'POINT-104A (Electric Point Machine M-63)',
    description: 'Switch rail failing to lock against stock rail within 3.2mm limit. Detection microswitch open. Electric interlocking holding signal 104 at DANGER.',
    assignee: 'SSE / Signal / Mathura Jn',
  },
};

export default function ScannerPage({ language = 'bilingual' }: ScannerPageProps) {
  const navigate = useNavigate();
  const [selectedScenario, setSelectedScenario] = useState<DefectScenarioKey>('missing_fastener');
  const [step, setStep] = useState<'capture' | 'analyzing' | 'result'>('capture');
  const [showGradcam, setShowGradcam] = useState(true);
  const [gradcamOpacity, setGradcamOpacity] = useState<number>(0.65);
  const [flashing, setFlashing] = useState(false);
  const [dispatchConfirmed, setDispatchConfirmed] = useState(false);
  const [compassHeading, setCompassHeading] = useState(178);

  const scenario = SCENARIOS[selectedScenario];

  // Micro compass drift effect
  useEffect(() => {
    const timer = setInterval(() => {
      setCompassHeading(prev => 176 + Math.floor(Math.random() * 5));
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const handleCapture = () => {
    soundFx.playCameraShutter();
    setFlashing(true);
    setTimeout(() => setFlashing(false), 200);
    setStep('analyzing');
    setDispatchConfirmed(false);

    setTimeout(() => {
      soundFx.playSuccess();
      setStep('result');
    }, 1800);
  };

  const handleReset = () => {
    soundFx.playClick();
    setStep('capture');
    setDispatchConfirmed(false);
  };

  const handleDispatch = () => {
    soundFx.playSuccess();
    setDispatchConfirmed(true);
  };

  return (
    <div className="animate-fade-in-up" style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* Official Section Header */}
      <div className="page-header" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="page-header__breadcrumb">
          <span>GOVT OF INDIA</span>
          <span className="page-header__breadcrumb-sep">/</span>
          <span>NORTH CENTRAL RAILWAY</span>
          <span className="page-header__breadcrumb-sep">/</span>
          <span style={{ color: '#F59E0B' }}>RAILSURAKSHA GEOVISION-IR AI</span>
        </div>
        <h1 className="page-header__title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Camera size={26} style={{ color: '#F59E0B' }} />
          <span>Geo-Intelligent AI Incident Scanner</span>
          <span className="badge badge--civil" style={{ fontSize: 10, background: 'rgba(122, 40, 76, 0.2)', border: '1px solid #9D3862', color: '#F4C9D6' }}>
            YOLOv8 + Grad-CAM v4.2
          </span>
        </h1>
        <p className="page-header__subtitle">
          Rugged mobile-first field inspection terminal with real-time LRS chainage resolution, NavIC dual-satellite telemetry, neural defect detection, and automated Form T/409B speed restriction dispatch.
        </p>
      </div>

      {/* Preset Scenario Selector Tabs */}
      <div style={{
        background: 'var(--surface-0)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
        padding: '8px 12px',
        marginBottom: 'var(--space-4)',
      }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sliders size={12} style={{ color: '#F59E0B' }} />
          <span>Select Field Inspection Defect Scenario:</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6 }}>
          {(Object.keys(SCENARIOS) as DefectScenarioKey[]).map((key) => {
            const sc = SCENARIOS[key];
            const isSelected = selectedScenario === key;
            return (
              <button
                key={key}
                onClick={() => {
                  soundFx.playClick();
                  setSelectedScenario(key);
                  if (step === 'result') setStep('capture');
                }}
                style={{
                  padding: '7px 10px',
                  borderRadius: 'var(--radius-md)',
                  border: isSelected ? '1.5px solid #F59E0B' : '1px solid var(--border-color)',
                  background: isSelected ? 'rgba(245, 158, 11, 0.16)' : 'var(--surface-1)',
                  color: isSelected ? '#FFFFFF' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 150ms ease-out',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: sc.department === 'Civil' ? '#A85A48' : sc.department === 'TRD' ? '#FBBF24' : '#C084FC' }}>
                    [{sc.department}]
                  </span>
                  <span style={{
                    fontSize: 8.5,
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: 4,
                    background: sc.severity === 'Emergency' ? '#DC2626' : '#EA580C',
                    color: '#FFFFFF',
                  }}>
                    {sc.severity}
                  </span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {language === 'hi' ? sc.nameHi : sc.nameEn}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Rugged Inspection Tablet Frame */}
      <div style={{
        background: 'var(--surface-0)',
        border: '2px solid var(--border-color)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Rugged Hardware Telemetry Bar */}
        <div style={{
          background: 'linear-gradient(90deg, #1C1210 0%, #271916 100%)',
          padding: '8px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          fontSize: 10.5,
          fontFamily: 'var(--font-mono)',
          color: '#E2E8F0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#10B981', fontWeight: 700 }}>
              <Crosshair size={12} /> NavIC/GLONASS LOCKED (11 Sats)
            </span>
            <span style={{ color: '#94A3B8' }}>&bull;</span>
            <span style={{ color: '#D4B2BE' }}>Acc: &plusmn;0.6m</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Compass size={12} style={{ color: '#F59E0B' }} />
              {compassHeading}&deg; SSE
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Gauge size={12} style={{ color: '#F59E0B' }} />
              34.2&deg;C
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Wifi size={12} style={{ color: '#10B981' }} />
              4G Rail-APN
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#10B981' }}>
              <Battery size={12} />
              87%
            </span>
          </div>
        </div>

        {/* Viewfinder Canvas Area */}
        <div style={{ padding: 'var(--space-4)' }}>
          <div style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16/10',
            maxHeight: 460,
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            background: '#070D18',
            border: '2px solid rgba(59, 130, 246, 0.3)',
            boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)',
          }}>
            {/* Shutter flash overlay */}
            {flashing && (
              <div style={{
                position: 'absolute', inset: 0, background: '#FFFFFF', zIndex: 50,
                animation: 'fadeIn 100ms ease-out',
              }} />
            )}

            {/* High-Definition SVG Railway Track Canvas */}
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 800 500"
              preserveAspectRatio="xMidYMid slice"
              style={{ display: 'block', width: '100%', height: '100%' }}
            >
              <defs>
                {/* Ballast Pattern */}
                <pattern id="ballastPat" width="20" height="20" patternUnits="userSpaceOnUse">
                  <rect width="20" height="20" fill="#1A202C" />
                  <circle cx="5" cy="5" r="2.5" fill="#2D3748" />
                  <circle cx="15" cy="12" r="3" fill="#4A5568" />
                  <circle cx="8" cy="16" r="2" fill="#2B3442" />
                  <circle cx="16" cy="4" r="1.8" fill="#3D495C" />
                </pattern>
                {/* Steel Rail Gradient */}
                <linearGradient id="railSteel" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#475569" />
                  <stop offset="30%" stopColor="#94A3B8" />
                  <stop offset="50%" stopColor="#F1F5F9" />
                  <stop offset="70%" stopColor="#94A3B8" />
                  <stop offset="100%" stopColor="#334155" />
                </linearGradient>
                {/* Concrete Sleeper Gradient */}
                <linearGradient id="sleeperConcrete" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#94A3B8" />
                  <stop offset="50%" stopColor="#64748B" />
                  <stop offset="100%" stopColor="#475569" />
                </linearGradient>
                {/* Thermal Grad-CAM Heatmap Radial */}
                <radialGradient id="gradcamHeat" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#DC2626" stopOpacity="0.9" />
                  <stop offset="40%" stopColor="#EA580C" stopOpacity="0.75" />
                  <stop offset="70%" stopColor="#FBBF24" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* 1. Ballast Bed Background */}
              <rect x="0" y="0" width="800" height="500" fill="url(#ballastPat)" />

              {/* 2. Concrete Sleepers (PSC-60) Perspective Rows */}
              {/* Sleeper Previous */}
              <rect x="60" y="40" width="680" height="70" rx="6" fill="url(#sleeperConcrete)" opacity="0.7" />
              {/* Sleeper Target (Center Inspection Focus) */}
              <rect x="40" y="190" width="720" height="130" rx="8" fill="url(#sleeperConcrete)" stroke="#334155" strokeWidth="2" />
              {/* Sleeper Identification Stamp */}
              <text x="70" y="225" fill="#E2E8F0" fontSize="12" fontFamily="monospace" fontWeight="800" opacity="0.8">
                INDIAN RAILWAYS &bull; PSC-60 &bull; 2021 &bull; NCR-MTJ-412
              </text>
              {/* Sleeper Next */}
              <rect x="20" y="400" width="760" height="120" rx="8" fill="url(#sleeperConcrete)" opacity="0.7" />

              {/* 3. Steel Rails (Running vertically across sleepers) */}
              {/* Left Rail (Target Inspection Rail) */}
              <g id="leftRail">
                {/* Rail Base Flange */}
                <rect x="180" y="0" width="80" height="500" fill="#334155" opacity="0.6" />
                {/* Rail Web & Head */}
                <rect x="195" y="0" width="50" height="500" fill="url(#railSteel)" />
                {/* Rail Head Crown Highlight */}
                <line x1="218" y1="0" x2="218" y2="500" stroke="#FFFFFF" strokeWidth="3" opacity="0.7" />
              </g>

              {/* Right Rail */}
              <g id="rightRail">
                <rect x="540" y="0" width="80" height="500" fill="#334155" opacity="0.6" />
                <rect x="555" y="0" width="50" height="500" fill="url(#railSteel)" />
                <line x1="578" y1="0" x2="578" y2="500" stroke="#FFFFFF" strokeWidth="3" opacity="0.7" />
              </g>

              {/* 4. Fasteners / Pandrol Elastic Clips on Sleeper */}
              {/* Right Rail Inner Fastener (Intact Normal) */}
              <circle cx="525" cy="255" r="14" fill="#271916" stroke="#64748B" strokeWidth="3" />
              <path d="M515 255 C520 240 535 240 540 255" stroke="#F59E0B" strokeWidth="6" fill="none" strokeLinecap="round" />

              {/* Right Rail Outer Fastener (Intact Normal) */}
              <circle cx="635" cy="255" r="14" fill="#271916" stroke="#64748B" strokeWidth="3" />
              <path d="M625 255 C630 240 645 240 650 255" stroke="#F59E0B" strokeWidth="6" fill="none" strokeLinecap="round" />

              {/* Left Rail Inner Fastener (Intact) */}
              <circle cx="275" cy="255" r="14" fill="#271916" stroke="#64748B" strokeWidth="3" />
              <path d="M265 255 C270 240 285 240 290 255" stroke="#F59E0B" strokeWidth="6" fill="none" strokeLinecap="round" />

              {/* 5. Defect Representation Based on Selected Scenario */}
              {selectedScenario === 'missing_fastener' && (
                <g id="defectMissingFastener">
                  {/* Empty Fastener Housing on Left Outer Side */}
                  <rect x="150" y="240" width="35" height="35" rx="4" fill="#1C1210" stroke="#EF4444" strokeWidth="2" strokeDasharray="3 3" />
                  {/* Displaced Rubber Pad lying askew */}
                  <polygon points="142,282 170,285 165,302 138,298" fill="#475569" stroke="#DC2626" strokeWidth="2" />
                  <text x="110" y="325" fill="#EF4444" fontSize="11" fontFamily="monospace" fontWeight="bold">
                    [DISPLACED PAD 24mm]
                  </text>
                </g>
              )}

              {selectedScenario === 'rail_crack' && (
                <g id="defectRailCrack">
                  {/* Transverse Crack on Rail Head */}
                  <path d="M198 250 L208 258 L218 252 L232 265 L242 260" stroke="#DC2626" strokeWidth="4" fill="none" />
                  <circle cx="220" cy="256" r="22" stroke="#EF4444" strokeWidth="2" strokeDasharray="3 3" fill="none" />
                  <text x="250" y="260" fill="#EF4444" fontSize="12" fontFamily="monospace" fontWeight="bold">
                    TRANSVERSE CRACK 18.4mm
                  </text>
                </g>
              )}

              {selectedScenario === 'ohe_sag' && (
                <g id="defectOheSag">
                  {/* OHE Contact Wire Line */}
                  <line x1="0" y1="120" x2="800" y2="150" stroke="#FBBF24" strokeWidth="3" strokeDasharray="4 2" />
                  {/* Slack Dropper */}
                  <path d="M380 40 Q410 110 395 140" stroke="#FBBF24" strokeWidth="3" fill="none" />
                  <circle cx="395" cy="140" r="16" stroke="#EF4444" strokeWidth="2" fill="rgba(239,68,68,0.3)" />
                  <text x="420" y="145" fill="#FBBF24" fontSize="12" fontFamily="monospace" fontWeight="bold">
                    DROPPER SAG -35mm
                  </text>
                </g>
              )}

              {selectedScenario === 'point_gap' && (
                <g id="defectPointGap">
                  {/* Switch Tongue Rail Divergence */}
                  <line x1="200" y1="180" x2="260" y2="340" stroke="#FBBF24" strokeWidth="8" />
                  <line x1="210" y1="180" x2="278" y2="340" stroke="#E2E8F0" strokeWidth="8" />
                  {/* Gap Caliper Marker */}
                  <line x1="250" y1="280" x2="268" y2="280" stroke="#EF4444" strokeWidth="3" />
                  <text x="280" y="285" fill="#EF4444" fontSize="12" fontFamily="monospace" fontWeight="bold">
                    SWITCH GAP: 5.2mm (&gt; 3.2mm SAFE)
                  </text>
                </g>
              )}

              {/* 6. Grad-CAM Activation Heatmap Overlay (Toggleable) */}
              {step === 'result' && showGradcam && (
                <g opacity={gradcamOpacity} style={{ mixBlendMode: 'screen', transition: 'opacity 200ms' }}>
                  <ellipse
                    cx={selectedScenario === 'ohe_sag' ? 400 : selectedScenario === 'point_gap' ? 260 : 180}
                    cy={selectedScenario === 'ohe_sag' ? 140 : 260}
                    rx="90"
                    ry="75"
                    fill="url(#gradcamHeat)"
                  />
                </g>
              )}

              {/* 7. YOLOv8 Bounding Box with Confidence & Class (When in Result mode) */}
              {step === 'result' && (
                <g id="yoloBox">
                  <rect
                    x={selectedScenario === 'ohe_sag' ? 320 : selectedScenario === 'point_gap' ? 180 : 120}
                    y={selectedScenario === 'ohe_sag' ? 80 : 210}
                    width={selectedScenario === 'point_gap' ? 170 : 160}
                    height="125"
                    rx="4"
                    fill="none"
                    stroke="#EF4444"
                    strokeWidth="3"
                    style={{ animation: 'countdownPulse 2s infinite' }}
                  />
                  {/* YOLO Label Tag */}
                  <rect
                    x={selectedScenario === 'ohe_sag' ? 320 : selectedScenario === 'point_gap' ? 180 : 120}
                    y={selectedScenario === 'ohe_sag' ? 52 : 182}
                    width={selectedScenario === 'point_gap' ? 170 : 160}
                    height="28"
                    rx="3"
                    fill="#DC2626"
                  />
                  <text
                    x={selectedScenario === 'ohe_sag' ? 326 : selectedScenario === 'point_gap' ? 186 : 126}
                    y={selectedScenario === 'ohe_sag' ? 70 : 200}
                    fill="#FFFFFF"
                    fontSize="11"
                    fontFamily="monospace"
                    fontWeight="800"
                  >
                    {scenario.id} {scenario.confidence}%
                  </text>
                </g>
              )}

              {/* 8. HUD Center Crosshair & Rangefinder */}
              <g id="hudCrosshairs" stroke="#F59E0B" strokeWidth="1.5" opacity="0.85">
                {/* Outer Reticle Ring */}
                <circle cx="400" cy="250" r="60" fill="none" strokeDasharray="4 6" />
                <circle cx="400" cy="250" r="6" fill="#F59E0B" />
                {/* Crosshair Spikes */}
                <line x1="320" y1="250" x2="370" y2="250" />
                <line x1="430" y1="250" x2="480" y2="250" />
                <line x1="400" y1="170" x2="400" y2="220" />
                <line x1="400" y1="280" x2="400" y2="330" />
                {/* Four Viewfinder Corner Brackets */}
                <path d="M 60,70 L 40,70 L 40,90" fill="none" stroke="#F59E0B" strokeWidth="3" />
                <path d="M 740,70 L 760,70 L 760,90" fill="none" stroke="#F59E0B" strokeWidth="3" />
                <path d="M 60,430 L 40,430 L 40,410" fill="none" stroke="#F59E0B" strokeWidth="3" />
                <path d="M 740,430 L 760,430 L 760,410" fill="none" stroke="#F59E0B" strokeWidth="3" />
                {/* Laser Rangefinder Telemetry readout */}
                <text x="408" y="270" fill="#FBBF24" fontSize="11" fontFamily="monospace" fontWeight="bold">
                  RANGE: 1.42m
                </text>
              </g>
            </svg>

            {/* In-viewfinder HUD Status Tag */}
            <div style={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              display: 'flex',
              gap: 8,
              zIndex: 10,
            }}>
              <div style={{
                background: 'rgba(28, 18, 16, 0.9)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: 'var(--radius-full)',
                padding: '4px 10px',
                fontSize: 10.5,
                fontFamily: 'var(--font-mono)',
                color: '#E2E8F0',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <MapPin size={12} style={{ color: '#F59E0B' }} />
                <span>{scenario.chainage}</span>
              </div>
              <div style={{
                background: 'rgba(28, 18, 16, 0.9)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: 'var(--radius-full)',
                padding: '4px 10px',
                fontSize: 10.5,
                fontFamily: 'var(--font-mono)',
                color: '#D4B2BE',
                display: 'none',
              }}>
                <span>GPS: {scenario.gps}</span>
              </div>
            </div>
          </div>

          {/* Analyzing Spinner Screen */}
          {step === 'analyzing' && (
            <div style={{
              padding: 'var(--space-6)',
              textAlign: 'center',
              background: 'var(--surface-1)',
              borderRadius: 'var(--radius-lg)',
              marginTop: 'var(--space-3)',
              border: '1px solid var(--border-color)',
            }}>
              <div style={{
                width: 54, height: 54, borderRadius: '50%', margin: '0 auto var(--space-3)',
                border: '3px solid var(--surface-3)', borderTopColor: '#F59E0B',
                animation: 'spin 0.7s linear infinite',
              }} />
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
                Running Neural Defect Inference...
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                YOLOv8-Railway Backbone &bull; Grad-CAM Saliency Computation &bull; LRS Milepost Mapping
              </p>
            </div>
          )}

          {/* Capture Controls (Step: 'capture') */}
          {step === 'capture' && (
            <div style={{
              display: 'flex',
              gap: 12,
              marginTop: 'var(--space-4)',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}>
              <button
                className="btn btn--primary btn--lg"
                style={{
                  flex: 1,
                  minWidth: 220,
                  background: 'linear-gradient(135deg, #7A284C 0%, #9D3862 100%)',
                  boxShadow: '0 4px 16px rgba(122, 40, 76, 0.4)',
                }}
                onClick={handleCapture}
              >
                <Camera size={18} />
                <span>Capture &amp; Analyze Defect</span>
              </button>

              <button
                className="btn btn--secondary"
                style={{ minWidth: 160 }}
                onClick={() => {
                  soundFx.playClick();
                  handleCapture();
                }}
              >
                <Upload size={16} />
                <span>Upload Field Photo</span>
              </button>
            </div>
          )}

          {/* Result Diagnostics & Government Action Card (Step: 'result') */}
          {step === 'result' && (
            <div className="animate-fade-in-up" style={{ marginTop: 'var(--space-4)' }}>
              {/* Grad-CAM Controls */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 14px',
                background: 'var(--surface-1)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-3)',
                gap: 12,
                flexWrap: 'wrap',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    className={`btn btn--sm ${showGradcam ? 'btn--primary' : 'btn--secondary'}`}
                    onClick={() => {
                      soundFx.playClick();
                      setShowGradcam(!showGradcam);
                    }}
                  >
                    <Eye size={13} />
                    <span>Grad-CAM Explainability Heatmap</span>
                  </button>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {showGradcam ? 'Active (Feature Importance Saliency)' : 'Hidden'}
                  </span>
                </div>

                {showGradcam && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Heatmap Opacity:</span>
                    <input
                      type="range"
                      min="0.2"
                      max="0.9"
                      step="0.05"
                      value={gradcamOpacity}
                      onChange={e => setGradcamOpacity(parseFloat(e.target.value))}
                      style={{ width: 90, accentColor: '#EF4444' }}
                    />
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                      {Math.round(gradcamOpacity * 100)}%
                    </span>
                  </div>
                )}
              </div>

              {/* Detailed Detection Diagnostic Tile */}
              <div className="card" style={{
                borderTop: '4px solid #DC2626',
                background: 'var(--surface-0)',
                border: '1px solid var(--border-color)',
              }}>
                <div className="card__body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 'var(--space-4)' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span className="badge badge--critical" style={{ background: '#DC2626', color: '#FFFFFF', fontWeight: 800 }}>
                          {scenario.severity} SAFETY INCIDENT
                        </span>
                        <span className="badge badge--civil">
                          Dept: {scenario.department}
                        </span>
                        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          Confidence: <strong style={{ color: '#10B981' }}>{scenario.confidence}%</strong>
                        </span>
                      </div>
                      <h2 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
                        {language === 'hi' ? scenario.nameHi : scenario.nameEn}
                      </h2>
                    </div>

                    {/* Retake Button */}
                    <button
                      className="btn btn--secondary btn--sm"
                      onClick={handleReset}
                    >
                      <RefreshCw size={13} />
                      <span>Rescan Frame</span>
                    </button>
                  </div>

                  {/* Telemetry Metric Cards */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                    gap: 10,
                    marginBottom: 'var(--space-4)',
                  }}>
                    <div style={{ background: 'var(--surface-1)', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>LRS Location</span>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#F59E0B', marginTop: 2 }}>{scenario.chainage}</div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{scenario.gps}</span>
                    </div>

                    <div style={{ background: 'var(--surface-1)', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Defect Dimension</span>
                      <div style={{ fontSize: 14, fontWeight: 900, color: '#EF4444', marginTop: 2 }}>{scenario.gapMm} mm Gap</div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Caliper tolerance &plusmn;0.2mm</span>
                    </div>

                    <div style={{ background: 'var(--surface-1)', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Recommended SR</span>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#F59E0B', marginTop: 2 }}>{scenario.recommendedSR}</div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Form T/409B Auto-drafted</span>
                    </div>

                    <div style={{ background: 'var(--surface-1)', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Assigned Authority</span>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>{scenario.assignee}</div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Direct Section Escalation</span>
                    </div>
                  </div>

                  {/* AI Engineering Analysis */}
                  <div style={{
                    padding: '10px 14px',
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: 'var(--space-4)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#EF4444', marginBottom: 2 }}>
                      <AlertTriangle size={13} />
                      <span>AI Engineering Diagnostics &amp; Impact Analysis:</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                      {scenario.description}
                    </p>
                  </div>

                  {/* Action Buttons: 1-Click Form T/409B Dispatch & Bundle into Joint Shadow Block */}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      className="btn btn--primary"
                      style={{
                        flex: 1,
                        minWidth: 240,
                        background: dispatchConfirmed ? '#16A34A' : '#DC2626',
                        borderColor: dispatchConfirmed ? '#22C55E' : '#EF4444',
                        boxShadow: '0 4px 14px rgba(220, 38, 38, 0.3)',
                      }}
                      onClick={handleDispatch}
                      disabled={dispatchConfirmed}
                    >
                      {dispatchConfirmed ? (
                        <>
                          <CheckCircle2 size={16} />
                          <span>Dispatched to SSE &bull; Form T/409B Logged!</span>
                        </>
                      ) : (
                        <>
                          <Send size={16} />
                          <span>Issue Urgent Speed Restriction &amp; Dispatch</span>
                        </>
                      )}
                    </button>

                    <button
                      className="btn btn--secondary"
                      style={{ minWidth: 200 }}
                      onClick={() => {
                        soundFx.playClick();
                        navigate('/bundler');
                      }}
                    >
                      <Zap size={14} style={{ color: '#F59E0B' }} />
                      <span>Bundle into 01:05 Joint Block</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>

                  {/* Dispatch Confirmation receipt simulation */}
                  {dispatchConfirmed && (
                    <div className="animate-fade-in-up" style={{
                      marginTop: 'var(--space-3)',
                      padding: '10px 14px',
                      background: 'rgba(22, 163, 74, 0.12)',
                      border: '1px solid rgba(34, 197, 94, 0.4)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 11.5,
                      fontFamily: 'var(--font-mono)',
                      color: '#4ADE80',
                    }}>
                      &bull; <strong>SMS / COA DISPATCH SENT:</strong> Incident #NCR-IR-2025-8821 dispatched to Section Controller &amp; SSE P-Way Mathura (+91 97605 2XXXX). Form T/409B SR 30 km/h generated.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
