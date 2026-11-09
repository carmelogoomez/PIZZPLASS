import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';

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

test('el logo se ensambla, cubre la pantalla de masa y libera la web una vez por pestaña', { timeout: 35_000 }, async (t) => {
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
  await cdp.send('Page.enable');
  t.after(async () => {
    try { await Promise.race([cdp.send('Browser.close'), new Promise(resolve => setTimeout(resolve, 1000))]); } catch {}
    await Promise.race([browserExit, new Promise((resolve) => setTimeout(resolve, 2000))]);
    if (browser.exitCode === null) browser.kill();
    cdp.close();
    await vite.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  const read = async (expression) => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true })).result.value;

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const navigate = async (path = '/') => {
    await read("document.documentElement.dataset.leaving = 'true'");
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:4176${path}` });
    for (let i = 0; i < 60 && !await read("!document.documentElement.dataset.leaving && Boolean(document.querySelector('.site-frame'))"); i++) await wait(100);
  };
  const waitForEnd = async () => {
    for (let i = 0; i < 100 && await read("Boolean(document.querySelector('.logo-intro'))"); i++) await wait(100);
    assert.equal(await read("Boolean(document.querySelector('.logo-intro'))"), false);
    assert.equal(await read("document.querySelector('.site-frame').inert"), false);
    assert.notEqual(await read('getComputedStyle(document.body).overflow'), 'hidden');
  };

  await navigate();
  assert.equal(await read("Boolean(document.querySelector('.logo-intro'))"), true, 'el logo debe ser la entrada principal');
  assert.equal(await read("document.querySelector('.site-frame').inert"), true);
  assert.equal(await read('getComputedStyle(document.body).overflow'), 'hidden');
  for (let i = 0; i < 60 && !await read("document.querySelectorAll('.logo-intro__piece').length === 11"); i++) await wait(50);
  assert.equal(await read("document.querySelectorAll('.logo-intro__piece').length"), 11);
  assert.equal(await read("Boolean(document.querySelector('.logo-intro canvas, .logo-intro video, .logo-demo'))"), false);
  assert.equal(await read("getComputedStyle(document.querySelector('.logo-intro__whiteout')).backgroundColor"), 'rgb(255, 226, 160)');
  const started = Date.now();
  await read("document.querySelectorAll('.logo-intro, .logo-intro *').forEach(el => el.getAnimations().forEach(a => { a.pause(); a.currentTime = 3700; }))");
  assert.equal(await read("getComputedStyle(document.querySelector('.logo-intro__whiteout')).opacity"), '1');
  assert.equal(await read("getComputedStyle(document.querySelector('.logo-intro')).opacity"), '1');
  await waitForEnd();
  assert.ok(Date.now() - started >= 3900 && Date.now() - started < 6000, 'la secuencia debe durar unos 4,5 segundos');
  assert.equal(await read("sessionStorage.getItem('pizzplass-logo-intro-seen')"), '1');
  await navigate('/eventos.html');
  assert.equal(await read("Boolean(document.querySelector('.logo-intro'))"), false, 'no se repite al navegar');
  await navigate('/?intro=logo');
  assert.equal(await read("Boolean(document.querySelector('.logo-intro, .logo-demo'))"), false, 'no queda el modo de prueba');

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await read("sessionStorage.removeItem('pizzplass-logo-intro-seen')");
  await navigate();
  for (let i = 0; i < 60 && !await read("Boolean(document.querySelector('.logo-intro__piece'))"); i++) await wait(50);
  assert.equal(await read("getComputedStyle(document.querySelector('.logo-intro__piece')).animationName"), 'logo-appear');
  assert.equal(await read('document.documentElement.scrollWidth <= innerWidth'), true);
  await waitForEnd();

  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `HTMLCanvasElement.prototype.getContext = function () { return null; };` });
  await read("sessionStorage.removeItem('pizzplass-logo-intro-seen')");
  await navigate();
  for (let i = 0; i < 60 && !await read("Boolean(document.querySelector('.logo-intro__original'))"); i++) await wait(50);
  assert.equal(await read("Boolean(document.querySelector('.logo-intro__original'))"), true, 'si falla canvas se muestra el logo estático');
  await waitForEnd();
});
