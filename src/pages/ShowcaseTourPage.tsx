import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Compass, ArrowRight, ArrowLeft, CheckCircle2,
  Shield, GitCommit, Sliders, Map, TrendingUp
} from 'lucide-react';
import { soundFx } from '../utils/audio';

interface TourSlide {
  step: number;
  titleEn: string;
  titleHi: string;
  tagline: string;
  icon: React.ReactNode;
  routeTarget: string;
  routeLabel: string;
  highlights: string[];
  metrics: { label: string; value: string }[];
}

const TOUR_SLIDES: TourSlide[] = [
  {
    step: 1,
    titleEn: 'ARCI Predictive Risk & Asset Health Engine',
    titleHi: 'ARCI पूर्वानुमानात्मक जोखिम व परिसंपत्ति स्वास्थ्य',
    tagline: 'Moving Indian Railways from reactive maintenance to mathematical risk prioritization.',
    icon: <Shield size={28} />,
    routeTarget: '/risk',
    routeLabel: 'Explore ARCI Engine [5]',
    highlights: [
      'Composite scoring formula combining Weibull survival failure probability P_f, operational disruption index ODI, overdue penalties, and emergency uplifts.',
      'Weibull cumulative failure probability trained on 45,000+ ultrasonic flaw records from TMS.',
      'Logistic Regression ML model predicting urgent failure risk with 88.4% accuracy (AUC 0.87).',
      'Eliminates subjective supervisor prioritization and guarantees critical IMR defects are bundled into the immediate next block.'
    ],
    metrics: [
      { label: 'Model Accuracy', value: '88.4%' },
      { label: 'Max Risk Score', value: '0.96 (IMR)' },
      { label: 'Safety Factor', value: 'SIL-4' }
    ]
  },
  {
    step: 2,
    titleEn: 'Headway-Aware Pareto-Optimal Simulated Annealing',
    titleHi: 'हेडवे-सजग बहु-उद्देश्यीय सिमुलेटेड एनीलिंग',
    tagline: 'Zero-conflict block placement inside natural train headway valleys.',
    icon: <Sliders size={28} />,
    routeTarget: '/studio',
    routeLabel: 'Open Optimiser Studio [7]',
    highlights: [
      'Multi-objective heuristic search balancing train delay penalties, corridor downtime, co-location rewards, and TSR persistence.',
      'Strict adherence to Joint Procedure Order (JPO) 6-hour max block limit and machine movement constraints.',
      'Protects premium passenger paths (Vande Bharat 22436, Rajdhani 12424) with a mandatory +14.2 min buffer.',
      'Evaluates 5,000 cooling candidate schedules in under 3.2 seconds.'
    ],
    metrics: [
      { label: 'Compute Time', value: '3.2 sec' },
      { label: 'Iterations', value: '5,000' },
      { label: 'Headway Margin', value: '+14.2 min' }
    ]
  },
  {
    step: 3,
    titleEn: 'Multi-Departmental Co-location & BDMS Pipeline',
    titleHi: 'बहु-विभागीय समन्वय व BDMS पाइपलाइन',
    tagline: 'Engineering, Electrical TRD, and S&T working together under a single line closure.',
    icon: <GitCommit size={28} />,
    routeTarget: '/handoff',
    routeLabel: 'View BDMS Hand-off [8]',
    highlights: [
      'Simultaneous synchronization of track tamping machines (CSM 922) and 25 kV catenary tower wagons.',
      'Reduces required line shutdowns from 32 down to 22 per week (-31.2% network disruption).',
      'Cryptographic Joint Concurrence matrix with digital sign-off from Sr. DEN, Sr. DEE, and Sr. DSTE.',
      'Native BDMS JSON payload export conforming to Railway Board Circular No. 2024/Co-ord/RBP.'
    ],
    metrics: [
      { label: 'Co-location Rate', value: '56.2%' },
      { label: 'Line Closures', value: '22 vs 32' },
      { label: 'Sign-off Status', value: '100% Cryptographic' }
    ]
  },
  {
    step: 4,
    titleEn: 'GIS Digital Twin & In-Cab Kavach Caution Orders',
    titleHi: 'GIS डिजिटल ट्विन व लोको कैब कवच सतर्कता आदेश',
    tagline: 'Real-time spatial situational awareness with statutory electronic documentation.',
    icon: <Map size={28} />,
    routeTarget: '/live-corridor',
    routeLabel: 'Launch Live GIS Digital Twin [9]',
    highlights: [
      'High-fidelity vector GIS map showing all stations, chainage posts, track circuits, and substations on NDLS–CNB chord.',
      'Live train beacon markers with real-time GPS/COA tracking and Kavach SIL-4 ATP link status.',
      'Statutory Form T/409B Caution Order generator with cryptographic DRM seal and In-Cab Kavach QR code.',
      'Electronic Form T/351 Disconnection Memo eliminating verbal miscommunications between S&T and Station Masters.'
    ],
    metrics: [
      { label: 'Corridor Length', value: '440 km' },
      { label: 'ATP Link', value: 'Kavach SIL-4' },
      { label: 'Paperless T/409B', value: 'Instant QR' }
    ]
  },
  {
    step: 5,
    titleEn: 'Audited Economic & Operational Dividend',
    titleHi: 'परीक्षित आर्थिक व परिचालन लाभांश',
    tagline: 'Measurable financial returns and punctuality improvements for Indian Railways.',
    icon: <TrendingUp size={28} />,
    routeTarget: '/roi-audit',
    routeLabel: 'Inspect DRM ROI Audit [M]',
    highlights: [
      'Returns ₹94.75 Lakhs/month in net economic value per railway division.',
      'Recovers 412 freight train hours per month, directly saving ₹76.22 Lakhs in demurrage and crew turnaround.',
      'Guarantees 99.8% passenger punctuality by preventing emergency unscheduled daylight block bursts.',
      'Compresses Temporary Speed Restriction (TSR) drag from 14 days to 1 day (-92.8%), saving massive kinetic braking energy.'
    ],
    metrics: [
      { label: 'Monthly Dividend', value: '₹94.75 Lakhs' },
      { label: 'Punctuality', value: '99.8%' },
      { label: 'TSR Reduction', value: '-92.8%' }
    ]
  }
];

export default function ShowcaseTourPage() {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const navigate = useNavigate();

  const slide = TOUR_SLIDES[currentSlideIndex];

  const handleNext = () => {
    soundFx.playClick();
    if (currentSlideIndex < TOUR_SLIDES.length - 1) {
      setCurrentSlideIndex(currentSlideIndex + 1);
    } else {
      soundFx.playSuccess();
      navigate('/');
    }
  };

  const handlePrev = () => {
    soundFx.playClick();
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(currentSlideIndex - 1);
    }
  };

  const handleJumpToModule = (route: string) => {
    soundFx.playClick();
    navigate(route);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1280px', margin: '0 auto', paddingBottom: '40px' }}>
      
      {/* Editorial Header */}
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '24px 28px',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-dark-olive)',
            color: 'var(--color-warm-stone)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Compass size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: 700, margin: 0, color: '#FFFFFF' }}>
                SAMANVAY Showcase & Tour &bull; सिस्टम टूर
              </h1>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                padding: '2px 8px',
                borderRadius: 'var(--radius-pill)',
                background: 'rgba(75, 101, 92, 0.3)',
                color: 'var(--color-warm-stone)',
                border: '1px solid var(--color-forest-green)'
              }}>
                [G] Module 17
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '0.86rem', color: 'rgba(255,255,255,0.7)' }}>
              Interactive walkthrough of the 5 flagship architectural innovations of SAMANVAY for the Ministry of Railways.
            </p>
          </div>
        </div>

        {/* Slide Counter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {TOUR_SLIDES.map((s, idx) => (
            <button
              key={s.step}
              onClick={() => {
                soundFx.playClick();
                setCurrentSlideIndex(idx);
              }}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                border: `1px solid ${currentSlideIndex === idx ? 'var(--color-warm-stone)' : 'var(--color-border)'}`,
                background: currentSlideIndex === idx ? 'var(--color-dark-olive)' : 'var(--color-surface)',
                color: currentSlideIndex === idx ? '#FFFFFF' : 'var(--color-warm-stone)',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)'
              }}
            >
              {s.step}
            </button>
          ))}
        </div>
      </div>

      {/* Main Showcase Stage */}
      <div className="card--hero-dark" style={{ padding: '36px', display: 'flex', flexDirection: 'column', gap: '28px', border: '1px solid var(--color-border)' }}>
        
        {/* Step Indicator & Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.76rem',
              padding: '4px 10px',
              borderRadius: 'var(--radius-pill)',
              background: 'rgba(0,0,0,0.4)',
              color: 'var(--color-warm-stone)',
              border: '1px solid var(--color-border)'
            }}>
              INNOVATION {slide.step} OF 5
            </span>
          </div>

          <button
            onClick={() => handleJumpToModule(slide.routeTarget)}
            className="btn--forest"
            style={{ padding: '8px 16px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <span>{slide.routeLabel}</span>
            <ArrowRight size={14} />
          </button>
        </div>

        {/* Slide Heading */}
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-forest-green)',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            {slide.icon}
          </div>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.8rem', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
              {slide.titleEn}
            </h2>
            <div style={{ fontSize: '1rem', color: 'var(--color-warm-stone)', marginTop: '2px' }}>
              {slide.titleHi}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: '1rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
              {slide.tagline}
            </p>
          </div>
        </div>

        {/* Metric Cards Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          {slide.metrics.map((m, idx) => (
            <div key={idx} style={{
              background: 'rgba(0,0,0,0.3)',
              padding: '16px 20px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(255,255,255,0.08)'
            }}>
              <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.6)' }}>{m.label}</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-warm-stone)', marginTop: '4px' }}>
                {m.value}
              </div>
            </div>
          ))}
        </div>

        {/* Key Highlights Bulleted Pod */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 'var(--radius-md)',
          padding: '24px',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-warm-stone)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Technical Architecture & Operational Impact:
          </div>
          {slide.highlights.map((h, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <CheckCircle2 size={16} color="var(--color-warm-stone)" style={{ marginTop: '2px', flexShrink: 0 }} />
              <div style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.9)', lineHeight: 1.5 }}>
                {h}
              </div>
            </div>
          ))}
        </div>

        {/* Stage Bottom Navigation Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px' }}>
          <button
            onClick={handlePrev}
            disabled={currentSlideIndex === 0}
            style={{
              padding: '10px 20px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              background: currentSlideIndex === 0 ? 'rgba(255,255,255,0.05)' : 'var(--color-surface)',
              color: currentSlideIndex === 0 ? 'rgba(255,255,255,0.3)' : '#FFFFFF',
              cursor: currentSlideIndex === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.84rem'
            }}
          >
            <ArrowLeft size={16} />
            <span>Previous</span>
          </button>

          <button
            onClick={handleNext}
            className="btn--forest"
            style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem' }}
          >
            <span>{currentSlideIndex === TOUR_SLIDES.length - 1 ? 'Complete Tour & Return' : 'Next Innovation'}</span>
            <ArrowRight size={16} />
          </button>
        </div>

      </div>

    </div>
  );
}
