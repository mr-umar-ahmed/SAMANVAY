// ── State Emblem of India (Ashoka Lion Capital) ──────────────────────
export function AshokaEmblem({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="State Emblem of India"
    >
      {/* Golden / Brass Government Glow */}
      <defs>
        <linearGradient id="goldGovGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="50%" stopColor="#D97706" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>
        <linearGradient id="crestGold" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
      </defs>

      {/* Lion Capital Silhouette Representation */}
      {/* Central Lion Head & Mane */}
      <path
        d="M50 10 C42 10 38 16 38 24 C38 28 40 32 42 34 C36 36 32 42 32 50 C32 58 37 64 42 66 C42 68 44 72 45 74 L55 74 C56 72 58 68 58 66 C63 64 68 58 68 50 C68 42 64 36 58 34 C60 32 62 28 62 24 C62 16 58 10 50 10 Z"
        fill="url(#goldGovGrad)"
      />
      {/* Left Lion Profile */}
      <path
        d="M32 26 C26 26 22 31 22 38 C22 44 26 48 29 50 C25 53 22 58 22 64 C22 68 25 72 29 74 L37 72 C35 70 34 66 34 62 C34 56 38 52 41 50 C38 46 36 42 36 38 C36 32 38 28 40 26 Z"
        fill="url(#goldGovGrad)"
        opacity="0.9"
      />
      {/* Right Lion Profile */}
      <path
        d="M68 26 C74 26 78 31 78 38 C78 44 74 48 71 50 C75 53 78 58 78 64 C78 68 75 72 71 74 L63 72 C65 70 66 66 66 62 C66 56 62 52 59 50 C62 46 64 42 64 38 C64 32 62 28 60 26 Z"
        fill="url(#goldGovGrad)"
        opacity="0.9"
      />

      {/* Abacus Platform */}
      <rect x="18" y="75" width="64" height="12" rx="3" fill="url(#crestGold)" />
      
      {/* Ashoka Chakra on the Abacus */}
      <circle cx="50" cy="81" r="5" stroke="#3E2723" strokeWidth="1.2" fill="#FFFFFF" />
      <circle cx="50" cy="81" r="1.5" fill="#3E2723" />
      {/* Spokes (8 representative) */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <line
          key={deg}
          x1="50"
          y1="81"
          x2={50 + 4 * Math.cos((deg * Math.PI) / 180)}
          y2={81 + 4 * Math.sin((deg * Math.PI) / 180)}
          stroke="#3E2723"
          strokeWidth="0.8"
        />
      ))}

      {/* Galloping Horse (Left) & Bull (Right) simplified representation */}
      <path d="M25 80 Q29 78 33 80" stroke="#78350F" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M67 80 Q71 78 75 80" stroke="#78350F" strokeWidth="1.5" strokeLinecap="round" />

      {/* Lotus Base */}
      <path
        d="M24 88 C32 94 40 96 50 96 C60 96 68 94 76 88 L74 93 C66 98 58 100 50 100 C42 100 34 98 26 93 Z"
        fill="url(#goldGovGrad)"
      />

      {/* Motto: Satyameva Jayate (सत्यमेव जयते) */}
      <text
        x="50"
        y="112"
        textAnchor="middle"
        fontSize="7"
        fontWeight="800"
        fill="currentColor"
        fontFamily="'Inter', 'Noto Sans Devanagari', sans-serif"
        letterSpacing="0.05em"
      >
        सत्यमेव जयते
      </text>
    </svg>
  );
}

// ── Indian Railways Official Crest ──────────────────────────────────
export function IndianRailwaysLogo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Indian Railways Crest"
    >
      <defs>
        <linearGradient id="irEspresso" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3E2723" />
          <stop offset="50%" stopColor="#5D2E46" />
          <stop offset="100%" stopColor="#2A1714" />
        </linearGradient>
        <linearGradient id="irGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
      </defs>

      {/* Outer Ring */}
      <circle cx="50" cy="50" r="46" stroke="url(#irGold)" strokeWidth="3.5" fill="url(#irEspresso)" />
      <circle cx="50" cy="50" r="39" stroke="url(#irGold)" strokeWidth="1.5" fill="none" strokeDasharray="2 3" />

      {/* Circular Ashoka Chakra Star Track */}
      {[...Array(16)].map((_, i) => {
        const angle = (i * 360) / 16;
        const rad = (angle * Math.PI) / 180;
        const x = 50 + 42.5 * Math.cos(rad);
        const y = 50 + 42.5 * Math.sin(rad);
        return (
          <circle key={i} cx={x} cy={y} r="1.3" fill="#FDE68A" />
        );
      })}

      {/* Inner Locomotive Silhouette */}
      <g transform="translate(24, 28) scale(0.52)">
        {/* Steam / Electric Engine */}
        <rect x="15" y="30" width="70" height="35" rx="6" fill="#F8FAFC" />
        <rect x="25" y="15" width="40" height="18" rx="3" fill="#E2E8F0" />
        {/* Windshield */}
        <rect x="30" y="19" width="14" height="10" rx="2" fill="#1C1210" />
        <rect x="48" y="19" width="14" height="10" rx="2" fill="#1C1210" />
        {/* Headlight */}
        <circle cx="50" cy="45" r="7" fill="#F59E0B" stroke="#78350F" strokeWidth="2" />
        <circle cx="50" cy="45" r="4" fill="#FEF08A" />
        {/* Cowcatcher / Pilot */}
        <path d="M12 65 L22 80 L78 80 L88 65 Z" fill="#94A3B8" />
        {/* Buffers */}
        <circle cx="20" cy="62" r="4" fill="#475569" />
        <circle cx="80" cy="62" r="4" fill="#475569" />
      </g>

      {/* Circular Text: INDIAN RAILWAYS • भारतीय रेल */}
      <path
        id="textCircle"
        d="M 50, 50 m -32, 0 a 32,32 0 1,1 64,0 a 32,32 0 1,1 -64,0"
        fill="none"
      />
    </svg>
  );
}

// ── National Tricolor Accent Ribbon ──────────────────────────────────
export function TricolorRibbon({ height = 4 }: { height?: number }) {
  return (
    <div
      style={{
        height,
        width: '100%',
        display: 'flex',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        zIndex: 100,
        position: 'relative',
      }}
      role="presentation"
      aria-hidden="true"
    >
      <div style={{ flex: 1, backgroundColor: '#FF9933' }} /> {/* India Saffron */}
      <div style={{ flex: 1, backgroundColor: '#FFFFFF', position: 'relative' }}> {/* White */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: height * 1.8,
            height: height * 1.8,
            borderRadius: '50%',
            border: `${Math.max(1, height / 3)}px solid #000080`,
          }}
        />
      </div>
      <div style={{ flex: 1, backgroundColor: '#138808' }} /> {/* India Green */}
    </div>
  );
}

// ── CRIS / Gati Shakti / Digital India Badges ────────────────────────
export function GovAuthBadge({ type = 'cris' }: { type?: 'cris' | 'gatishakti' | 'digitalindia' | 'kavach' }) {
  if (type === 'kavach') {
    return (
      <span className="gov-auth-badge gov-auth-badge--kavach">
        <span className="gov-auth-badge__pulse" />
        <span className="gov-auth-badge__text">KAVACH 4.0 SIL-4</span>
      </span>
    );
  }

  if (type === 'gatishakti') {
    return (
      <span className="gov-auth-badge gov-auth-badge--gatishakti">
        <span className="gov-auth-badge__icon">⚡</span>
        <span className="gov-auth-badge__text">PM GatiShakti NMP</span>
      </span>
    );
  }

  if (type === 'digitalindia') {
    return (
      <span className="gov-auth-badge gov-auth-badge--digital">
        <span className="gov-auth-badge__text">Digital India</span>
      </span>
    );
  }

  return (
    <span className="gov-auth-badge gov-auth-badge--cris">
      <span className="gov-auth-badge__icon">🏛️</span>
      <span className="gov-auth-badge__text">CRIS AI-DSS</span>
    </span>
  );
}
