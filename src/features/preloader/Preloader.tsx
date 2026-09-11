/**
 * Cinematic first-load preloader: the train video plays while the planning
 * engine boots in the worker. Progress is real (engine stages), the minimum
 * hold is short, and it can always be skipped.
 */
import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import './preloader.css';

const FULL_MS = 5200;
const SHORT_MS = 2200;

export function Preloader({ onDone }: { onDone: () => void }) {
  const status = useAppStore((s) => s.planStatus);
  const progress = useAppStore((s) => s.planProgress);
  const seen = useAppStore((s) => s.preloaderSeen);
  const setSeen = useAppStore((s) => s.setPreloaderSeen);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const minMs = seen ? SHORT_MS : FULL_MS;
  const [pct, setPct] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const start = useRef(performance.now());
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    setLeaving(true);
    setSeen(true);
    setTimeout(onDone, 700);
  };

  useEffect(() => {
    const t = setTimeout(() => setCanSkip(true), 1200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - start.current;
      const timePart = Math.min(1, elapsed / minMs);
      const enginePart = status === 'ready' ? 1 : status === 'error' ? 1 : 0.9;
      const p = Math.min(timePart, enginePart);
      setPct(Math.round(p * 100));
      if (timePart >= 1 && (status === 'ready' || status === 'error')) finish();
      else if (elapsed > 14000) finish();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, minMs]);

  return (
    <div className={`preloader ${leaving ? 'leaving' : ''}`} aria-busy="true" aria-live="polite">
      {!reduced ? (
        <video className="preloader-video" autoPlay muted playsInline loop preload="auto" poster="/media/train-poster.jpg">
          <source src="/media/train-preloader.webm" type="video/webm" />
          <source src="/media/train-preloader.mp4" type="video/mp4" />
        </video>
      ) : (
        <img className="preloader-video" src="/media/train-poster.jpg" alt="" />
      )}
      <div className="preloader-shade" />
      <div className="preloader-top">
        <div className="preloader-brand">
          <img src="/favicon.svg" alt="" width={40} height={40} />
          <div>
            <div className="preloader-title">SAMANVAY <span>समन्वय</span></div>
            <div className="preloader-sub">Integrated block planning · Indian Railways · PS 26027</div>
          </div>
        </div>
        {canSkip && (
          <button className="preloader-skip" onClick={finish}>
            Skip
          </button>
        )}
      </div>
      <div className="preloader-bottom">
        <div className="preloader-status">
          <span className="preloader-dot" />
          <span className="preloader-msg">{status === 'error' ? 'Engine could not start — opening anyway' : progress || 'Starting the planning engine'}</span>
          <span className="preloader-pct num">{pct}%</span>
        </div>
        <div className="preloader-track">
          <div className="preloader-bar" style={{ width: `${pct}%` }} />
        </div>
        <div className="preloader-meta">
          <span>TMS · SMMS · TDMS · COA · FOIS</span>
          <span>Weibull · logistic escalation · annealing optimiser</span>
        </div>
      </div>
    </div>
  );
}
