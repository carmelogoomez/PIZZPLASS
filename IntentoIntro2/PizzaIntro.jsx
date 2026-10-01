import { useLayoutEffect, useRef, useState } from 'react';
import table from '../assets/intro/mesa.webp';
import base from '../assets/intro/masa.webp';
import tomato from '../assets/intro/tomate.webp';
import mozzarella from '../assets/intro/mozzarella.webp';
import ham from '../assets/intro/jamon.webp';
import basil from '../assets/intro/albahaca.webp';
import './pizza-intro.css';

const INTRO_DURATION_MS = 8200;
const SEEN_KEY = 'pizzplass-intro-seen';
const assets = { table, base, tomato, mozzarella, ham, basil };

function alreadySeen() {
  try { return sessionStorage.getItem(SEEN_KEY) === '1'; }
  catch { return false; }
}

function PizzaIntro({ onComplete }) {
  const stage = useRef(null);
  const [fallback, setFallback] = useState(false);

  useLayoutEffect(() => {
    let timeout;
    let disposed = false;
    let disposeScene = () => {};
    import('./pizza-scene').then(({ mountPizzaScene }) => {
      if (disposed) return;
      disposeScene = mountPizzaScene(stage.current, assets, {
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        onReady: () => { timeout = window.setTimeout(onComplete, INTRO_DURATION_MS); },
        onError: () => setFallback(true),
      });
    }).catch(() => {
      if (disposed) return;
      setFallback(true);
      timeout = window.setTimeout(onComplete, INTRO_DURATION_MS);
    });
    return () => { disposed = true; window.clearTimeout(timeout); disposeScene(); };
  }, [onComplete]);

  return <div ref={stage} className={`pizza-intro ${fallback ? 'pizza-intro--fallback' : ''}`} role="status" aria-label="Preparando una pizza napolitana" aria-live="off" style={{ backgroundImage: `url(${table})` }}>
    {fallback && <div className="pizza-intro__fallback" aria-hidden="true">
      <img className="pizza-intro__fallback-base" src={base} alt="" />
      <img className="pizza-intro__fallback-tomato" src={tomato} alt="" />
      <img className="pizza-intro__fallback-cheese" src={mozzarella} alt="" />
      <img className="pizza-intro__fallback-ham" src={ham} alt="" />
      <img className="pizza-intro__fallback-basil" src={basil} alt="" />
    </div>}
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
