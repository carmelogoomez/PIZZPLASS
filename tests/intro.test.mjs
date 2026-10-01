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

test('la intro original de Three.js prepara la pizza y después revela la web', { timeout: 30_000 }, async (t) => {
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
  assert.equal(await read("getComputedStyle(document.querySelector('.pizza-intro')).backgroundImage"), 'none', 'no debe mostrarse una mesa CSS antes del canvas Three.js');
  for (let attempt = 0; attempt < 80 && !await read("document.querySelector('.pizza-intro__canvas')?.dataset.ready === 'true'"); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(await read("Boolean(document.querySelector('.pizza-intro video'))"), false, 'la intro no debe contener ningún vídeo');
  assert.equal(await read("document.querySelectorAll('.pizza-intro canvas').length"), 1, 'la intro debe usar un único canvas Three.js');
  assert.equal(await read("document.querySelector('.pizza-intro__canvas')?.dataset.renderer"), 'three', 'el canvas debe pertenecer al renderizador Three.js');
  assert.equal(await read("document.querySelector('.pizza-intro__canvas')?.dataset.ready"), 'true', 'la escena debe cargar todos sus recursos');
  const introReadyAt = Date.now();
  assert.equal(await read("document.querySelector('.pizza-intro__canvas')?.dataset.recipe"), 'tomate-mozzarella-pepperoni', 'la receta animada debe ser la pizza pepperoni');
  assert.equal(await read("document.querySelector('.pizza-intro__canvas')?.dataset.pepperoniCount"), '5', 'la última capa debe contener exactamente cinco rodajas de pepperoni');
  assert.equal(await read("Boolean(document.querySelector('.pizza-intro__particles, .pizza-intro__flour-veil'))"), false, 'no deben quedar capas de la intro de vídeo');
  await read("(() => { window.__introOpacityMin = 1; window.__introPhaseOrder = []; const sample = () => { const stage = document.querySelector('.pizza-intro'); if (!stage) return; window.__introOpacityMin = Math.min(window.__introOpacityMin, Number(getComputedStyle(stage).opacity)); const phase = stage.querySelector('canvas')?.dataset.phase; if (phase && window.__introPhaseOrder.at(-1) !== phase) window.__introPhaseOrder.push(phase); requestAnimationFrame(sample); }; requestAnimationFrame(sample); return true; })()");
  assert.equal(await read("document.querySelector('.site-frame')?.inert"), true, 'la web debe estar inerte durante la secuencia');
  assert.equal(await read("getComputedStyle(document.body).overflow"), 'hidden', 'el desplazamiento debe estar bloqueado');
  assert.equal(await read("getComputedStyle(document.documentElement).overflow"), 'hidden', 'el documento tampoco debe desplazarse');

  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 100, y: 100, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 100, y: 100, button: 'left', clickCount: 1 });
  assert.equal(await read("Boolean(document.querySelector('.pizza-intro'))"), true, 'un clic no debe saltar la intro');
  await cdp.send('Input.synthesizeScrollGesture', { x: 200, y: 350, yDistance: -500, speed: 900 });
  assert.equal(await read('window.scrollY'), 0, 'la rueda no debe desplazar la web durante la intro');

  for (let attempt = 0; attempt < 140 && !await read("window.__introPhaseOrder.includes('flour')"); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(await read("window.__introPhaseOrder.includes('pepperoni')"), true, 'el pepperoni debe ser la última capa de ingredientes');
  assert.equal(await read("window.__introPhaseOrder.indexOf('pepperoni') < window.__introPhaseOrder.indexOf('flour')"), true, 'la harina debe comenzar después del pepperoni');
  assert.equal(await read("Boolean(document.querySelector('.pizza-intro__canvas'))"), true, 'la escena Three.js debe seguir activa mientras se prepara la pizza');
  for (let attempt = 0; attempt < 35 && !await read("document.querySelector('.pizza-intro')?.classList.contains('is-ending')"); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(await read("document.querySelector('.pizza-intro')?.classList.contains('is-ending')"), true, 'la escena debe iniciar su dispersión original');
  assert.equal(await read("document.querySelector('.site-frame')?.inert"), true, 'la web sigue bloqueada durante la dispersión');
  for (let attempt = 0; attempt < 45 && await read("Boolean(document.querySelector('.pizza-intro'))"); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(await read("Boolean(document.querySelector('.pizza-intro'))"), false, 'la intro debe terminar tras la secuencia original');
  assert.ok(Date.now() - introReadyAt <= 6_900, 'la web debe quedar operativa en unos 6,5 segundos');
  assert.ok(await read("window.__introOpacityMin < .9"), 'la dispersión debe revelar la web gradualmente');
  assert.equal(await read("document.querySelector('.site-frame')?.inert"), false, 'la web debe quedar operativa');
  assert.notEqual(await read("getComputedStyle(document.body).overflow"), 'hidden', 'se recupera el desplazamiento');
  assert.notEqual(await read("getComputedStyle(document.documentElement).overflow"), 'hidden', 'se recupera el desplazamiento del documento');
  assert.equal(await read("Boolean(document.querySelector('.home-hero .button[href=\"/contacto.html\"]'))"), true);

  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.setBlockedURLs', { urls: ['*pizza-scene.js*'] });
  await cdp.send('Runtime.evaluate', { expression: "sessionStorage.removeItem('pizzplass-intro-seen')" });
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4176/?fallback-test=1' });
  for (let attempt = 0; attempt < 40 && !await read("Boolean(document.querySelector('.pizza-intro--fallback'))"); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await read("window.__fallbackObservedAt = performance.now()");
  assert.equal(await read("Boolean(document.querySelector('.pizza-intro--fallback'))"), true, 'si Three.js falla debe mostrarse el respaldo 2D');
  assert.equal(await read("document.querySelectorAll('.pizza-intro__fallback-pepperoni').length"), 5, 'el respaldo debe mostrar las cinco rodajas de pepperoni');
  assert.equal(await read("Boolean(document.querySelector('.pizza-intro__fallback-ham, .pizza-intro__fallback-basil'))"), false, 'el respaldo no debe contener jamón ni albahaca');
  assert.notEqual(await read("getComputedStyle(document.querySelector('.pizza-intro__fallback-base')).animationName"), 'none', 'la masa del respaldo debe entrar animada');
  assert.notEqual(await read("getComputedStyle(document.querySelector('.pizza-intro__fallback-pepperoni')).animationName"), 'none', 'el pepperoni del respaldo debe entrar animado');
  assert.equal(await read("Boolean(document.querySelector('.pizza-intro__fallback-flour'))"), true, 'el respaldo debe terminar con harina animada');
  assert.equal(await read("getComputedStyle(document.querySelector('.pizza-intro__fallback-pepperoni')).opacity"), '0', 'el pepperoni no debe aparecer antes de su turno');
  for (let attempt = 0; attempt < 90 && Number(await read("getComputedStyle(document.querySelector('.pizza-intro__fallback-pepperoni')).opacity")) < .5; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(Number(await read("getComputedStyle(document.querySelector('.pizza-intro__fallback-pepperoni')).opacity")) >= .5, 'el pepperoni debe aparecer durante la secuencia 2D');
  for (let attempt = 0; attempt < 140 && await read("Boolean(document.querySelector('.pizza-intro'))"); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(await read("Boolean(document.querySelector('.pizza-intro'))"), false, 'el respaldo animado debe dejar paso a la web');
  const fallbackElapsed = await read("performance.now() - window.__fallbackObservedAt");
  assert.ok(fallbackElapsed >= 5_900, 'el respaldo no debe terminar antes de completar la secuencia');
  assert.ok(fallbackElapsed <= 7_400, 'el respaldo debe dejar la web operativa en unos 6,5 segundos');
  await cdp.send('Network.setBlockedURLs', { urls: [] });
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });

  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4176/eventos.html' });
  for (let attempt = 0; attempt < 30 && !await read("Boolean(document.querySelector('.events-gallery'))"); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(await read("Boolean(document.querySelector('.pizza-intro'))"), false, 'no se repite al navegar en la misma pestaña');
});
