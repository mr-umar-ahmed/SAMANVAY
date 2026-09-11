import { Link } from 'react-router-dom';
import { useLang } from '../../i18n';
import { useAppStore } from '../../store/useAppStore';
import { pct } from '../../lib/format';

/** Left panel of the sign-in / sign-up screens: what the product is, in plain words. */
export function AuthHero() {
  const lang = useLang();
  const snapshot = useAppStore((s) => s.snapshot);
  const status = useAppStore((s) => s.planStatus);
  const k = snapshot?.result.weekly.kpis;
  const b = snapshot?.result.weekly.baseKpis;
  const d = snapshot?.result.weekly.delta;
  const hi = lang === 'hi';
  return (
    <div className="auth-hero">
      <div className="row">
        <img src="/favicon.svg" alt="" width={36} height={36} style={{ borderRadius: 9 }} />
        <div>
          <div style={{ fontWeight: 700, letterSpacing: '0.06em' }}>SAMANVAY <span style={{ fontWeight: 500, letterSpacing: 0 }}>समन्वय</span></div>
          <div className="tiny" style={{ opacity: 0.8 }}>SIH 2026 · PS 26027 · Ministry of Railways</div>
        </div>
      </div>
      <div style={{ maxWidth: 520 }}>
        <h1 style={{ fontSize: 'clamp(26px, 3.4vw, 38px)', letterSpacing: '-0.02em', color: 'inherit' }}>
          {hi ? 'एक माँग। एक समन्वित निर्णय। एक अनुकूलित ब्लॉक।' : 'One demand. One coordinated decision. One optimised block.'}
        </h1>
        <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.55, opacity: 0.9 }}>
          {hi
            ? 'सिविल (TMS), सिग्नल (SMMS) और कर्षण (TDMS) के दोष व देय अनुरक्षण को COA समय-सारणी और FOIS मालगाड़ी पूर्वानुमान के साथ पढ़ा जाता है, हर कार्य को जोखिम के लिए स्कोर किया जाता है, और साप्ताहिक, मासिक व 26-सप्ताह के लिए न्यूनतम पज़ेशन समय-सारणी के प्राकृतिक अंतरालों में रखे जाते हैं — अंतिम मंज़ूरी अनुभाग नियंत्रक की।'
            : 'Track (TMS), signalling (SMMS) and traction (TDMS) defects are read together with the COA timetable and the FOIS goods forecast, every job is scored for risk, and the fewest possible possessions are laid into the natural gaps of the timetable for the week, the month and the 26-week programme. The Section Controller keeps the final word.'}
        </p>
        {k && b && d && status === 'ready' ? (
          <div className="grid grid-3" style={{ marginTop: 20, gap: 10 }}>
            <div className="stat" style={{ background: 'rgba(255,255,255,0.55)', borderColor: 'transparent' }}>
              <div className="label">{hi ? 'लाइन बंदी (सप्ताह)' : 'Line closures (week)'}</div>
              <div className="value num" style={{ fontSize: 26 }}>{k.blockCount}<small>/ {b.blockCount}</small></div>
              <div className="delta"><span>{hi ? 'आधार-रेखा की तुलना में' : 'vs decentralised baseline'}</span></div>
            </div>
            <div className="stat" style={{ background: 'rgba(255,255,255,0.55)', borderColor: 'transparent' }}>
              <div className="label">{hi ? 'सह-स्थित कार्य' : 'Works co-located'}</div>
              <div className="value num" style={{ fontSize: 26 }}>{pct(k.colocationRate, 0)}</div>
              <div className="delta"><span>{hi ? 'एक ब्लॉक में कई विभाग' : 'several departments, one block'}</span></div>
            </div>
            <div className="stat" style={{ background: 'rgba(255,255,255,0.55)', borderColor: 'transparent' }}>
              <div className="label">{hi ? 'उपलब्धता' : 'Availability'}</div>
              <div className="value num" style={{ fontSize: 26 }}>{pct(k.availability, 2)}</div>
              <div className="delta up"><b>{d.availabilityPoints >= 0 ? '+' : ''}{d.availabilityPoints.toFixed(2)} pts</b></div>
            </div>
          </div>
        ) : (
          <div className="small mt-lg" style={{ opacity: 0.8 }}>{hi ? 'योजना इंजन पृष्ठभूमि में चल रहा है…' : 'The planning engine is computing in the background…'}</div>
        )}
        <div className="tiny mt" style={{ opacity: 0.7 }}>{hi ? 'ऊपर के आँकड़े इंजन द्वारा गणित हैं — सिंथेटिक फ़ीड, मूल स्कीमा।' : 'Figures above are computed by the engine from synthetic feeds shaped like the real ones.'}</div>
      </div>
      <div className="row small" style={{ opacity: 0.8 }}>
        <Link to="/citizen" style={{ color: 'inherit' }}>{hi ? 'यात्री / नागरिक पोर्टल →' : 'Passenger / citizen portal →'}</Link>
        <span className="right">{hi ? 'भारत सरकार · रेल मंत्रालय' : 'Government of India · Ministry of Railways'}</span>
      </div>
    </div>
  );
}
