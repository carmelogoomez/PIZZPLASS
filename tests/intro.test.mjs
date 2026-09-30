import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';

test('conserva el segundo intento antes de sustituirlo', () => {
  for (const file of ['PizzaIntro.jsx', 'pizza-scene.js', 'pizza-intro.css', 'assets/mesa.webp', 'assets/masa.webp', 'assets/tomate.webp', 'assets/mozzarella.webp', 'assets/jamon.webp', 'assets/albahaca.webp']) {
    assert.equal(existsSync(new URL(`../IntentoIntro2/${file}`, import.meta.url)), true, `${file} debe permanecer en la copia`);
  }
});

const browserPath = (process.platform === 'win32'
  ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']
  : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']).find(existsSync);

async function waitForJson(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Chrome no abrió ${url}`);
}

function cdpClient(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let id = 0;
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (!pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(message.error) : resolve(message.result);
  });
  return {
    ready: new Promise((resolve) => socket.addEventListener('open', resolve, { once: true })),
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const messageId = ++id;
        pending.set(messageId, { resolve, reject });
        socket.send(JSON.stringify({ id: messageId, method, params }));
      });
    },
    close: () => socket.close(),
  };
}

test('la nueva explosión cubre la pantalla un segundo antes de revelar la web', { timeout: 30_000 }, async (t) => {
  assert.ok(browserPath, 'Se necesita Chrome, Edge o Chromium');
  const profile = await mkdtemp(join(tmpdir(), 'pizzplass-intro-'));
  const vite = await createServer({ server: { host: '127.0.0.1', port: 4176, strictPort: true }, logLevel: 'silent' });
  await vite.listen();
  const browser = spawn(browserPath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9334',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });
  const browserExit = new Promise((resolve) => browser.once('exit', resolve));
  const page = (await waitForJson('http://127.0.0.1:9334/json/list')).find((item) => item.type === 'page');
  const cdp = cdpClient(page.webSocketDebuggerUrl);
  await cdp.ready;
  t.after(async () => {
    try { await cdp.send('Browser.close'); } catch {}
    await Promise.race([browserExit, new Promise((resolve) => setTimeout(resolve, 2000))]);
    if (browser.exitCode === null) browser.kill();
    cdp.close();
    await vite.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  const read = async (expression) => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true })).result.value;
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4176/' });
  for (let attempt = 0; attempt < 40 && !await read("Boolean(document.querySelector('.home-hero'))"); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  assert.equal(await read("Boolean(document.querySelector('.pizza-intro'))"), true, 'la intro debe cubrir la portada al abrir');
  for (let attempt = 0; attempt < 50 && !await read("document.querySelector('.pizza-intro video')?.readyState >= 2"); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(await read("Boolean(document.querySelector('.pizza-intro video'))"), true, 'debe usarse el vídeo realista');
  assert.equal(await read("document.querySelector('.pizza-intro video')?.currentSrc.includes('intropizza.mp4')"), true, 'debe reproducirse el vídeo elegido');
  assert.equal(await read("[...document.querySelectorAll('.pizza-intro video')].length === 2 && [...document.querySelectorAll('.pizza-intro video')].every(video => video.currentSrc.includes('intropizza.mp4'))"), true, 'las dos capas visuales deben usar exclusivamente el vídeo elegido');
  assert.equal(await read("document.querySelector('.pizza-intro video')?.duration >= 9.99 && document.querySelector('.pizza-intro video')?.duration <= 10.02"), true, 'el vídeo nuevo debe reproducirse completo');
  assert.equal(await read("document.querySelector('.pizza-intro video')?.paused"), false, 'el vídeo debe reproducirse automáticamente');
  assert.equal(await read("Boolean(document.querySelector('.pizza-intro canvas'))"), false, 'la antigua escena 3D no debe reproducirse');
  await read("(() => { const stage=document.querySelector('.pizza-intro'); window.__introPhases={}; new MutationObserver(() => { if (stage.classList.contains('is-covered') && !window.__introPhases.covered) window.__introPhases.covered=performance.now(); if (stage.classList.contains('is-dissolving') && !window.__introPhases.dissolving) window.__introPhases.dissolving=performance.now(); }).observe(stage,{attributes:true,attributeFilter:['class']}); return true; })()");
  const sceneStartedAt = Date.now();
  assert.equal(await read("document.querySelector('.site-frame')?.inert"), true, 'la web debe estar inerte durante la secuencia');
  assert.equal(await read("getComputedStyle(document.body).overflow"), 'hidden', 'el desplazamiento debe estar bloqueado');
  assert.equal(await read("getComputedStyle(document.documentElement).overflow"), 'hidden', 'el documento tampoco debe desplazarse');

  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 100, y: 100, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 100, y: 100, button: 'left', clickCount: 1 });
  assert.equal(await read("Boolean(document.querySelector('.pizza-intro'))"), true, 'un clic no debe saltar la intro');
  await cdp.send('Input.synthesizeScrollGesture', { x: 200, y: 350, yDistance: -500, speed: 900 });
  assert.equal(await read('window.scrollY'), 0, 'la rueda no debe desplazar la web durante la intro');

  await new Promise((resolve) => setTimeout(resolve, Math.max(0, 6200 - (Date.now() - sceneStartedAt))));
  assert.equal(await read("Boolean(document.querySelector('.pizza-intro video'))"), true, 'el vídeo debe seguir activo antes de la explosión');
  for (let attempt = 0; attempt < 70 && !await read("document.querySelector('.pizza-intro')?.classList.contains('is-bursting')"); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(await read("Boolean(document.querySelector('.pizza-intro__particles canvas'))"), true, 'la explosión debe añadir partículas de Three.js al vídeo');
  assert.equal(await read("document.querySelectorAll('.pizza-intro canvas').length"), 1, 'la única escena canvas de la intro debe ser la harina de Three.js');
  assert.equal(await read("Boolean(document.querySelector('.pizza-intro__particles canvas')?.getContext('webgl2'))"), true, 'las partículas deben renderizarse con WebGL');
  assert.equal(await read("(() => { const canvas=document.querySelector('.pizza-intro__particles canvas'); return canvas?.clientWidth === innerWidth && canvas?.clientHeight === innerHeight; })()"), true, 'las partículas deben ocupar toda la pantalla');
  for (let attempt = 0; attempt < 40 && !await read("document.querySelector('.pizza-intro')?.classList.contains('is-covered')"); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(await read("document.querySelector('.pizza-intro')?.classList.contains('is-covered')"), true, 'la nube debe cubrir completamente el vídeo');
  assert.equal(await read("Number(getComputedStyle(document.querySelector('.pizza-intro__particles')).zIndex) > Number(getComputedStyle(document.querySelector('.pizza-intro__flour-veil')).zIndex)"), true, 'los granos 3D deben seguir visibles sobre la nube blanca');
  assert.equal(await read("document.querySelector('.site-frame')?.inert"), true, 'la web sigue bloqueada durante la nube');
  for (let attempt = 0; attempt < 20 && !await read("document.querySelector('.pizza-intro')?.classList.contains('is-dissolving')"); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(await read("document.querySelector('.pizza-intro')?.classList.contains('is-dissolving')"), true, 'la harina debe empezar a difuminarse');
  assert.ok(await read("window.__introPhases.dissolving - window.__introPhases.covered >= 950"), 'la pausa blanca debe durar aproximadamente un segundo');
  const opacityBefore = await read("Number(getComputedStyle(document.querySelector('.pizza-intro')).opacity)");
  await new Promise((resolve) => setTimeout(resolve, 300));
  const opacityDuring = await read("Number(getComputedStyle(document.querySelector('.pizza-intro')).opacity)");
  assert.ok(opacityDuring < opacityBefore, 'el difuminado debe revelar la web gradualmente');
  for (let attempt = 0; attempt < 30 && await read("Boolean(document.querySelector('.pizza-intro'))"); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(await read("Boolean(document.querySelector('.pizza-intro'))"), false, 'la intro debe terminar tras el difuminado');
  assert.equal(await read("document.querySelector('.site-frame')?.inert"), false, 'la web debe quedar operativa');
  assert.notEqual(await read("getComputedStyle(document.body).overflow"), 'hidden', 'se recupera el desplazamiento');
  assert.notEqual(await read("getComputedStyle(document.documentElement).overflow"), 'hidden', 'se recupera el desplazamiento del documento');
  assert.equal(await read("Boolean(document.querySelector('.home-hero .button[href=\"/contacto.html\"]'))"), true);

  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4176/eventos.html' });
  for (let attempt = 0; attempt < 30 && !await read("Boolean(document.querySelector('.events-gallery'))"); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(await read("Boolean(document.querySelector('.pizza-intro'))"), false, 'no se repite al navegar en la misma pestaña');
});
