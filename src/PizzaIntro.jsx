import { useLayoutEffect, useRef, useState } from 'react';
import introVideo from '../assets/intro/intropizza.mp4';
import './pizza-intro.css';

const SEEN_KEY = 'pizzplass-intro-seen';
const BURST_AT = 8.55;
const FILL_DURATION_MS = 850;
const COVER_DURATION_MS = 1000;
const DISSOLVE_DURATION_MS = 800;

function alreadySeen() {
  try { return sessionStorage.getItem(SEEN_KEY) === '1'; }
  catch { return false; }
}

function PizzaIntro({ onComplete }) {
  const stage = useRef(null);
  const video = useRef(null);
  const backdrop = useRef(null);
  const [fallback, setFallback] = useState(false);

  useLayoutEffect(() => {
    let disposed = false;
    let bursting = false;
    let frame = 0;
    let coverTimer = 0;
    let dissolveTimer = 0;
    let finishTimer = 0;
    let safetyTimer = 0;
    let disposeParticles = () => {};
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const particles = reducedMotion ? null : import('./flour-burst');

    function finish() {
      if (!disposed) onComplete();
    }

    async function beginBurst() {
      if (bursting || disposed) return;
      bursting = true;
      if (particles) {
        try {
          const { mountFlourBurst } = await particles;
          if (disposed) return;
          disposeParticles = mountFlourBurst(stage.current.querySelector('.pizza-intro__particles'));
        } catch {
          // The flour veil still makes the transition work without WebGL.
        }
      }
      if (disposed) return;
      stage.current.classList.add('is-bursting');
      coverTimer = window.setTimeout(() => {
        stage.current.classList.add('is-covered');
        dissolveTimer = window.setTimeout(() => {
          stage.current.classList.add('is-dissolving');
          finishTimer = window.setTimeout(finish, DISSOLVE_DURATION_MS);
        }, COVER_DURATION_MS);
      }, FILL_DURATION_MS);
    }

    function tick() {
      if (disposed) return;
      const front = video.current;
      const back = backdrop.current;
      if (front && back && back.readyState >= 2 && Math.abs(front.currentTime - back.currentTime) > .09) {
        back.currentTime = front.currentTime;
      }
      if (front && front.currentTime >= BURST_AT) beginBurst();
      frame = window.requestAnimationFrame(tick);
    }

    const front = video.current;
    front?.addEventListener('ended', beginBurst);
    frame = window.requestAnimationFrame(tick);
    safetyTimer = window.setTimeout(beginBurst, 10_500);
    front?.play().catch(() => setFallback(true));
    backdrop.current?.play().catch(() => {});

    return () => {
      disposed = true;
      front?.removeEventListener('ended', beginBurst);
      window.cancelAnimationFrame(frame);
      window.clearTimeout(coverTimer);
      window.clearTimeout(dissolveTimer);
      window.clearTimeout(finishTimer);
      window.clearTimeout(safetyTimer);
      disposeParticles();
    };
  }, [onComplete]);

  return <div ref={stage} className={`pizza-intro ${fallback ? 'pizza-intro--fallback' : ''}`} role="status" aria-label="Preparando una pizza napolitana" aria-live="off">
    <video ref={backdrop} className="pizza-intro__video pizza-intro__video--backdrop" src={introVideo} muted autoPlay playsInline preload="auto" aria-hidden="true" tabIndex={-1} />
    <video ref={video} className="pizza-intro__video pizza-intro__video--main" src={introVideo} muted autoPlay playsInline preload="auto" aria-hidden="true" tabIndex={-1} onError={() => setFallback(true)} />
    <div className="pizza-intro__particles" aria-hidden="true" />
    <div className="pizza-intro__flour-veil" aria-hidden="true" />
  </div>;
}

export default function IntroGate({ children }) {
  const [active, setActive] = useState(() => !alreadySeen());

  useLayoutEffect(() => {
    const site = document.querySelector('.site-frame');
    if (!active || !site) return undefined;
    site.inert = true;
    document.documentElement.classList.add('pizza-intro-active');
    document.body.classList.add('pizza-intro-active');
    return () => {
      site.inert = false;
      document.documentElement.classList.remove('pizza-intro-active');
      document.body.classList.remove('pizza-intro-active');
    };
  }, [active]);

  const finish = () => {
    try { sessionStorage.setItem(SEEN_KEY, '1'); } catch {}
    setActive(false);
  };

  return <>{children}{active && <PizzaIntro onComplete={finish} />}</>;
}
