import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import logo from '../assets/logo.png';
import table from '../assets/intro/mesa.webp';
import './logo-intro.css';

const SEEN_KEY = 'pizzplass-logo-intro-seen';

function alreadySeen() {
  try { return sessionStorage.getItem(SEEN_KEY) === '1'; }
  catch { return false; }
}

// Regions use the original artwork's 1254 × 1254 coordinates. No redraw:
// every coloured pixel lands back at its exact place in the supplied logo.
const pieces = [
  ['tomato', .35], ['cheese', .47], ['crust', .59],
  ['topping-0', 1.05], ['topping-1', 1.13], ['topping-2', 1.21],
  ['topping-3', 1.29], ['topping-4', 1.37],
  ['wordmark', 1.75], ['tagline', 1.95],
];
const toppings = [[523, 376, 80], [549, 533, 61], [800, 300, 52], [847, 427, 55], [766, 540, 54]];

function splitArtwork(image) {
  const size = 1254;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, size, size);
  const artwork = context.getImageData(0, 0, size, size);
  const pixels = artwork.data;

  // Flood only the light background, preserving white highlights inside the
  // illustration. The counter in the P is a second enclosed background area.
  const visited = new Uint8Array(size * size);
  const queue = new Int32Array(size * size);
  let head = 0;
  let tail = 0;
  const enqueue = (index) => {
    if (index < 0 || index >= visited.length || visited[index]) return;
    visited[index] = 1;
    const at = index * 4;
    const low = Math.min(pixels[at], pixels[at + 1], pixels[at + 2]);
    const high = Math.max(pixels[at], pixels[at + 1], pixels[at + 2]);
    if (low < 210 || high - low > 32) return;
    pixels[at + 3] = 0;
    queue[tail++] = index;
  };
  for (let i = 0; i < size; i += 1) {
    enqueue(i); enqueue((size - 1) * size + i);
    enqueue(i * size); enqueue(i * size + size - 1);
  }
  enqueue(410 * size + 710);
  while (head < tail) {
    const index = queue[head++];
    if (index % size) enqueue(index - 1);
    if (index % size < size - 1) enqueue(index + 1);
    enqueue(index - size); enqueue(index + size);
  }

  const layers = Object.fromEntries(['base', ...pieces.map(([name]) => name)].map(name => [name, context.createImageData(size, size)]));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const at = (y * size + x) * 4;
      if (!pixels[at + 3]) continue;
      // Letter counters are enclosed too; unlike the illustrated symbol,
      // the typography contains no white highlights to preserve.
      if (y >= 850 && Math.min(pixels[at], pixels[at + 1], pixels[at + 2]) > 210
        && Math.max(pixels[at], pixels[at + 1], pixels[at + 2]) - Math.min(pixels[at], pixels[at + 1], pixels[at + 2]) < 32) continue;
      let region;
      if (y >= 1030) region = 'tagline';
      else if (y >= 850) region = 'wordmark';
      else {
        const topping = toppings.findIndex(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r);
        if (topping >= 0) region = `topping-${topping}`;
        else if (y < 310 && x < 820 && y < 320 - (x - 300) * .17) region = 'crust';
        else region = x < 638 ? 'cheese' : 'tomato';
        layers.base.data.set([47, 11, 3, pixels[at + 3]], at);
      }
      layers[region].data.set(pixels.subarray(at, at + 4), at);
    }
  }
  return Object.entries(layers).map(([name, data]) => {
    context.putImageData(data, 0, 0);
    if (name === 'wordmark' || name === 'tagline') {
      const dough = context.createLinearGradient(0, 850, 0, 1100);
      dough.addColorStop(0, '#ffe2a0');
      dough.addColorStop(1, '#eeb75b');
      context.globalCompositeOperation = 'source-in';
      context.fillStyle = dough;
      context.fillRect(0, 0, size, size);
      context.globalCompositeOperation = 'source-over';
    }
    return { name, src: canvas.toDataURL('image/png'), delay: name === 'base' ? .1 : pieces.find(([key]) => key === name)[1] };
  });
}

function LogoAssembly({ onComplete }) {
  const [layers, setLayers] = useState(null);
  const [failed, setFailed] = useState(false);
  const complete = useRef(onComplete);
  complete.current = onComplete;

  useEffect(() => {
    let disposed = false;
    let timer;
    const image = new Image();
    const ready = (result, error = false) => {
      if (disposed) return;
      setLayers(result);
      setFailed(error);
      timer = window.setTimeout(() => complete.current(), 4500);
    };
    image.onload = () => {
      try { ready(splitArtwork(image)); }
      catch { ready([], true); }
    };
    image.onerror = () => ready([], true);
    image.src = logo;
    // A stalled resource must not leave the site locked indefinitely.
    const watchdog = window.setTimeout(() => complete.current(), 12000);
    return () => { disposed = true; clearTimeout(timer); clearTimeout(watchdog); };
  }, []);

  return <div className={`logo-intro ${layers ? 'logo-intro--ready' : ''}`} style={{ backgroundImage: `linear-gradient(#160c0638, #160c0660), url(${table})` }} role="status" aria-label="Formando el logo de Pizzplass" aria-live="off">
    <div className="logo-intro__artwork" aria-hidden="true">
      {failed ? <img className="logo-intro__original" src={logo} alt="" /> : layers?.map(({ name, src, delay }, index) => <img
        key={name} src={src} alt="" className={`logo-intro__piece logo-intro__piece--${name}`}
        style={{ '--delay': `${delay}s`, '--turn': `${index % 2 ? -9 : 8}deg` }}
      />)}
    </div>
    {layers && <>
      <div className="logo-intro__flour" aria-hidden="true" />
      <div className="logo-intro__whiteout" aria-hidden="true" />
    </>}
  </div>;
}

export default function IntroGate({ children }) {
  const [active, setActive] = useState(() => !alreadySeen());
  useLayoutEffect(() => {
    if (!active) return;
    const site = document.querySelector('.site-frame');
    if (site) site.inert = true;
    document.documentElement.classList.add('logo-intro-active');
    document.body.classList.add('logo-intro-active');
    return () => {
      if (site) site.inert = false;
      document.documentElement.classList.remove('logo-intro-active');
      document.body.classList.remove('logo-intro-active');
    };
  }, [active]);

  const finish = () => {
    try { sessionStorage.setItem(SEEN_KEY, '1'); } catch {}
    setActive(false);
  };

  return <>{children}{active && <LogoAssembly onComplete={finish} />}</>;
}
