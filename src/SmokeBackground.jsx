import { useEffect, useRef } from 'react';

export default function SmokeBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: true });
    if (!ctx) return undefined;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const particles = [];
    const sprites = [];
    let width = 0;
    let height = 0;
    let lastTime = 0;
    let emission = 0;
    let frame = 0;

    // Las texturas y el movimiento proceden del fondo de humo original.
    for (let variant = 0; variant < 4; variant += 1) {
      const sprite = document.createElement('canvas');
      sprite.width = sprite.height = 160;
      const spriteContext = sprite.getContext('2d');
      const lobes = [
        [80, 82, 55, .65], [53, 73, 37, .5], [106, 65, 42, .42],
        [72, 47, 35, .4], [91, 112, 39, .38], [46, 104, 29, .26],
      ];
      for (let index = 0; index < lobes.length; index += 1) {
        const [x, y, radius, opacity] = lobes[index];
        const shift = Math.sin((variant + 1) * (index + 2) * 2.37) * 9;
        const gradient = spriteContext.createRadialGradient(x + shift, y, 3, x + shift, y, radius);
        gradient.addColorStop(0, `rgba(242,244,245,${opacity})`);
        gradient.addColorStop(.38, `rgba(221,228,231,${opacity * .55})`);
        gradient.addColorStop(1, 'rgba(205,215,220,0)');
        spriteContext.fillStyle = gradient;
        spriteContext.fillRect(0, 0, 160, 160);
      }
      sprites.push(sprite);
    }

    function addParticle(prewarm = false) {
      const random = Math.random;
      particles.push({
        y: prewarm ? random() * (height + 160) : height + 20 + random() * 24,
        speed: 75 + random() * 35,
        xSeed: (random() - .5) * 2,
        drift: random() * 6.28,
        size: .65 + random() * .75,
        sprite: (random() * sprites.length) | 0,
        rotation: random() * 6.28,
        spin: (random() - .5) * .11,
        opacity: .55 + random() * .45,
      });
    }

    function render(time) {
      ctx.clearRect(0, 0, width, height);
      if (!width || !height) return;
      const spreadMax = Math.min(width * .28, 310);
      for (const particle of particles) {
        const rise = Math.max(0, (height - particle.y) / height);
        const spread = 6 + Math.pow(rise, 1.2) * spreadMax;
        const sway = Math.sin(rise * 7.5 - time * .5) * 21 * rise
          + Math.sin(rise * 15 + time * .32) * 10 * rise;
        const curl = Math.sin(time * .8 + particle.drift + rise * 11) * 13 * rise;
        const x = width * .5 + sway + particle.xSeed * spread + curl;
        const size = (24 + rise * Math.min(145, width * .2)) * particle.size;
        const entering = Math.min(1, (height + 30 - particle.y) / 75);
        const leaving = Math.min(1, (particle.y + 110) / 130);
        const alpha = Math.max(0, entering * leaving) * particle.opacity * (.17 - rise * .045);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, particle.y);
        ctx.rotate(particle.rotation + time * particle.spin);
        ctx.drawImage(sprites[particle.sprite], -size, -size * .72, size * 2, size * 1.44);
        ctx.restore();
      }
    }

    function resize() {
      const previousHeight = height;
      width = window.innerWidth;
      height = window.innerHeight;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      if (previousHeight) {
        for (const particle of particles) particle.y *= height / previousHeight;
      }
      render(performance.now() / 1000);
    }

    function tick(milliseconds) {
      const time = milliseconds / 1000;
      const elapsed = Math.min(.05, lastTime ? time - lastTime : .016);
      lastTime = time;
      emission += elapsed * (width < 650 ? 31 : 43);
      while (emission >= 1) { addParticle(); emission -= 1; }
      for (let index = particles.length - 1; index >= 0; index -= 1) {
        particles[index].y -= particles[index].speed * elapsed;
        if (particles[index].y < -140) particles.splice(index, 1);
      }
      render(time);
      frame = requestAnimationFrame(tick);
    }

    function motionChanged() {
      cancelAnimationFrame(frame);
      if (reduceMotion.matches) {
        particles.length = 0;
        for (let index = 0; index < 170; index += 1) addParticle(true);
        render(0);
      } else {
        lastTime = 0;
        if (!particles.length) for (let index = 0; index < 170; index += 1) addParticle(true);
        frame = requestAnimationFrame(tick);
      }
    }

    function visibilityChanged() {
      if (document.hidden) cancelAnimationFrame(frame);
      else if (!reduceMotion.matches) {
        lastTime = 0;
        frame = requestAnimationFrame(tick);
      }
    }

    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', visibilityChanged);
    reduceMotion.addEventListener('change', motionChanged);
    resize();
    motionChanged();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibilityChanged);
      reduceMotion.removeEventListener('change', motionChanged);
    };
  }, []);

  return <canvas id="fondo-humo" className="smoke-background" ref={canvasRef} aria-hidden="true" />;
}
