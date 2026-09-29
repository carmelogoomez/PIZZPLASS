import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';

const browserCandidates = process.platform === 'win32'
  ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ]
  : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];

const browserPath = browserCandidates.find(existsSync);

async function waitForJson(url, attempts = 50) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`El navegador no abrió el puerto de depuración: ${url}`);
}

function createCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  let id = 0;

  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id || !pending.has(message.id)) return;
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

async function waitForApp(cdp, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await cdp.send('Runtime.evaluate', {
      expression: `Boolean(document.querySelector('.header') && document.querySelector('main'))`,
      returnByValue: true,
    });
    if (result.result.value === true) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('React no terminó de montar la cabecera y el contenido');
}

function colorChannels(value) {
  return value.match(/[\d.]+/g).slice(0, 3).map(Number);
}

function contrastRatio(foreground, background) {
  const luminance = (value) => {
    const channels = colorChannels(value).map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test('la navegación y la landing responden correctamente', { timeout: 30_000 }, async (t) => {
  assert.ok(browserPath, 'Se necesita Chrome, Edge o Chromium para comprobar el comportamiento real');

  const profile = await mkdtemp(join(tmpdir(), 'pizzplass-header-'));
  const vite = await createServer({ server: { host: '127.0.0.1', port: 4175, strictPort: true }, logLevel: 'silent' });
  await vite.listen();

  const browser = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--remote-debugging-port=9333',
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: 'ignore' });
  const browserExit = new Promise((resolve) => browser.once('exit', resolve));

  const pages = await waitForJson('http://127.0.0.1:9333/json/list');
  const page = pages.find((candidate) => candidate.type === 'page');
  assert.ok(page, 'Chrome debe exponer una página comprobable');

  const cdp = createCdp(page.webSocketDebuggerUrl);
  await cdp.ready;
  t.after(async () => {
    try { await cdp.send('Browser.close'); } catch {}
    await Promise.race([browserExit, new Promise((resolve) => setTimeout(resolve, 2_000))]);
    if (browser.exitCode === null) browser.kill();
    cdp.close();
    await vite.close();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await rm(profile, { recursive: true, force: true });
        break;
      } catch (error) {
        if (error.code !== 'EBUSY' || attempt === 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  });

  await t.test('el presupuesto avanza, filtra localidades y entrega todos los datos por correo o WhatsApp', async () => {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4175/contacto.html' });
    await waitForApp(cdp);
    const evaluate = async expression => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true })).result.value;
    const current = () => evaluate("document.querySelector('.budget-step [name]')?.name");
    const fill = async value => {
      await evaluate(`(() => {
        const input = document.querySelector('.budget-step [name]');
        const proto = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      })()`);
    };
    const next = () => evaluate("document.querySelector('.budget-wizard button[type=submit]').click()");
    const back = () => evaluate("document.querySelector('.budget-back').click()");
    assert.equal(await current(), 'nombre');
    assert.equal(await evaluate("Boolean(document.querySelector('.budget-back'))"), false);
    await next();
    assert.equal(await current(), 'nombre', 'un campo vacío no debe avanzar');
    const answers = { nombre: 'Cliente de prueba', email: 'prueba@example.com', telefono: '600123456', tipo: 'Catas privadas', fecha: '2027-06-12' };
    for (const [name, value] of Object.entries(answers)) {
      assert.equal(await current(), name);
      if (name === 'email') { await fill('correo-incorrecto'); await next(); assert.equal(await current(), 'email'); }
      if (name === 'tipo') {
        const choices = await evaluate("[...document.querySelector('[name=tipo]').options].map(o=>o.value)");
        assert.ok(choices.includes('Eventos corporativos'));
        assert.ok(choices.includes('Post-Eventos Deportivos'));
        assert.ok(choices.includes('Ferias, Mercados y Festivales'));
      }
      await fill(value); await next();
    }
    assert.equal(await current(), 'provincia');
    const provinceOptions = await evaluate("[...document.querySelector('[name=provincia]').options].map(option => option.value)");
    assert.equal(provinceOptions.length, 48, '47 provincias peninsulares y la opción vacía');
    for (const excluded of ['Balears, Illes', 'Las Palmas', 'Santa Cruz de Tenerife', 'Ceuta', 'Melilla']) assert.ok(!provinceOptions.includes(excluded), excluded);
    assert.ok(provinceOptions.includes('La Rioja'), 'los artículos deben aparecer antes del nombre');
    await fill('Sevilla'); await next();
    assert.equal(await current(), 'localidad');
    assert.equal(await evaluate("[...document.querySelector('[name=localidad]').options].some(o=>o.value==='Dos Hermanas')"), true);
    assert.equal(await evaluate("[...document.querySelector('[name=localidad]').options].some(o=>o.value==='Madrid')"), false);
    await fill('Dos Hermanas'); await next(); await back();
    assert.equal(await evaluate("document.querySelector('[name=localidad]').value"), 'Dos Hermanas');
    assert.equal(await evaluate("[...document.querySelector('[name=localidad]').options].some(o=>o.value==='La Puebla del Río')"), true);
    assert.equal(await evaluate("[...document.querySelector('[name=localidad]').options].some(o=>o.value==='Puebla del Río, La')"), false);
    await back(); await fill('Madrid'); await next();
    assert.equal(await evaluate("document.querySelector('[name=localidad]').value"), '', 'cambiar provincia borra localidad');
    assert.equal(await evaluate("[...document.querySelector('[name=localidad]').options].some(o=>o.value==='Dos Hermanas')"), false);
    await fill('Madrid'); await next();
    await fill('450'); await next();
    await fill('Celebración de prueba, opciones sin lactosa.');
    assert.equal(await evaluate("Boolean(document.querySelector('.budget-next'))"), false);
    assert.equal(await evaluate("document.querySelector('progress').value"), 9);
    const link = new URL(await evaluate("document.querySelector('.budget-whatsapp').href"));
    assert.equal(link.pathname, '/34675264967');
    const message = link.searchParams.get('text');
    for (const value of [...Object.values(answers).filter(v=>v!=='2027-06-12'), '12/06/2027', 'Provincia: Madrid', 'Pueblo/Localidad: Madrid', '450', 'opciones sin lactosa']) assert.ok(message.includes(value), value);
    // Intercept the external boundary only: never send a real request during tests.
    await evaluate(`window.__requests=[]; window.fetch=async(url,options)=>{
      window.__requests.push({url,body:JSON.parse(options.body)});
      return {ok:true,json:async()=>({success:false})};
    }`);
    await next();
    for(let attempt=0;attempt<30 && !(await evaluate("Boolean(document.querySelector('[role=alert]'))"));attempt++) await new Promise(r=>setTimeout(r,30));
    assert.equal(await current(), 'mensaje', 'un rechazo conserva las respuestas');
    assert.equal(await evaluate("document.querySelector('[name=mensaje]').value"), 'Celebración de prueba, opciones sin lactosa.');
    await evaluate(`window.fetch=async(url,options)=>{
      window.__requests.push({url,body:JSON.parse(options.body)});
      return {ok:true,json:async()=>({success:'true'})};
    }`);
    await next();
    for(let attempt=0;attempt<30 && !(await evaluate("Boolean(document.querySelector('.budget-success'))"));attempt++) await new Promise(r=>setTimeout(r,30));
    assert.equal(await evaluate("Boolean(document.querySelector('.budget-success'))"), true);
    const requests = await evaluate("window.__requests");
    assert.equal(requests.length,2);
    assert.equal(requests[1].url,'https://formsubmit.co/ajax/pizzplasspizzas@gmail.com');
    assert.deepEqual(requests[1].body, {...answers, provincia:'Madrid', localidad:'Madrid', invitados:'450', mensaje:'Celebración de prueba, opciones sin lactosa.', _honey:'', _subject:'Nueva solicitud de presupuesto — PizzPlass', _template:'table', _captcha:'false'});

    await evaluate("document.querySelector('.budget-success button').click()");
    const secondAnswers = ['Otra persona', 'otra@example.com', '600987654', 'Cumpleaños', '2027-07-12', 'Sevilla', 'Sevilla', '30'];
    for (const value of secondAnswers) { await fill(value); await next(); }
    assert.equal(await current(), 'mensaje');
    assert.equal(await evaluate("document.querySelector('[name=mensaje]').required"), false);
    assert.equal(await evaluate("document.querySelector('.budget-step label').textContent.includes('*')"), false);
    assert.equal(await evaluate("new URL(document.querySelector('.budget-whatsapp').href).searchParams.get('text').includes('Cuéntanos algo más:')"), false);
    await next();
    for(let attempt=0;attempt<30 && !(await evaluate("Boolean(document.querySelector('.budget-success'))"));attempt++) await new Promise(r=>setTimeout(r,30));
    assert.equal(await evaluate("Boolean(document.querySelector('.budget-success'))"), true, 'el último campo vacío permite enviar');
    assert.equal((await evaluate("window.__requests"))[2].body.mensaje, '');
  });
  await t.test('permanece fija sin tapar el contenido al hacer scroll', async () => {
    for (const viewport of [{ width: 390, height: 844, mobile: true }, { width: 1280, height: 900, mobile: false }]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 });

      for (const route of ['/', '/contacto.html', '/blog/pizza-napolitana-autentica.html']) {
        const context = `${route} a ${viewport.width}px`;
        await cdp.send('Page.navigate', { url: `http://127.0.0.1:4175${route}` });
        await waitForApp(cdp);

        const initialResult = await cdp.send('Runtime.evaluate', {
          expression: `(() => {
            const header = document.querySelector('.header');
            const main = document.querySelector('main');
            return {
              headerHeight: header.getBoundingClientRect().height,
              contentTop: main.firstElementChild.getBoundingClientRect().top,
              position: getComputedStyle(header).position,
              documentHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
              viewportHeight: document.documentElement.clientHeight,
            };
          })()`,
          returnByValue: true,
        });

        assert.equal(initialResult.exceptionDetails, undefined, `${context}: la medición inicial no debe producir errores`);
        const initialState = initialResult.result.value;
        assert.ok(initialState.documentHeight > initialState.viewportHeight, `${context}: la página debe ser desplazable`);

        await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(viewport.width / 2), y: Math.min(700, viewport.height - 100), yDistance: -1000, speed: 800 });
        await new Promise((resolve) => setTimeout(resolve, 100));

        const scrolledResult = await cdp.send('Runtime.evaluate', {
          expression: `(() => {
            const header = document.querySelector('.header');
            return {
              topAfterScroll: header.getBoundingClientRect().top,
              scrollAmount: Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop),
            };
          })()`,
          returnByValue: true,
        });
        assert.equal(scrolledResult.exceptionDetails, undefined, `${context}: la medición tras el scroll no debe producir errores`);

        const state = { ...initialState, ...scrolledResult.result.value };
        assert.equal(state.position, 'fixed', `${context}: la cabecera debe usar posición fija`);
        assert.ok(Math.abs(state.topAfterScroll) < 1, `${context}: la cabecera debe seguir pegada arriba`);
        assert.ok(state.scrollAmount > 0, `${context}: la página debe haberse desplazado (${JSON.stringify(state)})`);
        assert.ok(state.contentTop >= state.headerHeight, `${context}: la cabecera no debe tapar el contenido inicial`);
      }
    }
  });

  await t.test('se distingue del fondo y mantiene contraste accesible', async () => {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4175/' });
    await waitForApp(cdp);

    const result = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const style = (selector) => getComputedStyle(document.querySelector(selector));
        return {
          headerBackground: style('.header').backgroundColor,
          bodyBackground: style('body').backgroundColor,
          navColor: style('.nav > a:not(.button)').color,
          ctaBackground: style('.nav .button').backgroundColor,
          ctaColor: style('.nav .button').color,
          ctaBounds: document.querySelector('.nav .button').getBoundingClientRect().toJSON(),
        };
      })()`,
      returnByValue: true,
    });
    assert.equal(result.exceptionDetails, undefined, 'la medición de color no debe producir errores');
    const colors = result.result.value;
    assert.ok(contrastRatio(colors.headerBackground, colors.bodyBackground) >= 3, 'la barra debe distinguirse claramente del fondo de la web');
    assert.ok(contrastRatio(colors.navColor, colors.headerBackground) >= 4.5, 'los enlaces del menú deben alcanzar contraste WCAG AA');
    const [defaultRed, defaultGreen, defaultBlue] = colorChannels(colors.ctaBackground);
    assert.ok(defaultRed > 240 && defaultGreen > 235 && defaultBlue > 225, 'el botón de presupuesto debe ser crema cuando no se pasa el cursor');
    assert.ok(contrastRatio(colors.ctaColor, colors.ctaBackground) >= 4.5, 'el botón de presupuesto debe alcanzar contraste WCAG AA');

    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 898 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: colors.ctaBounds.x + colors.ctaBounds.width / 2, y: colors.ctaBounds.y + colors.ctaBounds.height / 2 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const hoverResult = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({ background: getComputedStyle(document.querySelector('.nav .button')).backgroundColor, hovered: document.querySelector('.nav .button').matches(':hover') })`,
      returnByValue: true,
    });
    const { background: hoverBackground, hovered } = JSON.parse(hoverResult.result.value);
    assert.equal(hovered, true, 'el navegador debe reconocer el hover en el botón de presupuesto');
    const [hoverRed, hoverGreen, hoverBlue] = colorChannels(hoverBackground);
    assert.ok(hoverRed > 180 && hoverGreen >= 110 && hoverGreen <= 190 && hoverBlue < 100, `el botón de presupuesto debe volverse amarillo pizza al pasar el cursor (${hoverBackground})`);
    assert.ok(contrastRatio(colors.ctaColor, hoverBackground) >= 4.5, 'el texto del botón debe conservar contraste sobre el amarillo');
  });

  await t.test('el menú móvil se desliza al abrirse y cerrarse', async () => {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4175/' });
    await waitForApp(cdp);
    const state = async () => (await cdp.send('Runtime.evaluate', {
      expression: `(() => { const menu = document.querySelector('.nav'); const style = getComputedStyle(menu); return { visible: style.visibility, opacity: style.opacity, duration: style.transitionDuration, expanded: document.querySelector('.menu-button').getAttribute('aria-expanded') }; })()`,
      returnByValue: true,
    })).result.value;

    assert.equal((await state()).visible, 'hidden');
    await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.menu-button').click()` });
    const opening = await state();
    assert.equal(opening.expanded, 'true');
    assert.ok(opening.duration.includes('0.28s'), 'el menú debe animar su aparición');
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.equal((await state()).opacity, '1');

    await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.menu-button').click()` });
    assert.equal((await state()).expanded, 'false');
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.equal((await state()).visible, 'hidden');
  });

  await t.test('todas las páginas muestran un único fondo de humo sin bloquear el contenido', async () => {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    const routes = [
      '/',
      '/nosotros.html',
      '/eventos.html',
      '/blog.html',
      '/blog/pizza-napolitana-autentica.html',
      '/contacto.html',
      '/pagina-inexistente.html',
    ];

    for (const route of routes) {
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:4175${route}` });
      await waitForApp(cdp);
      await new Promise((resolve) => setTimeout(resolve, 120));
      const result = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const canvases = [...document.querySelectorAll('#fondo-humo')];
          const canvas = canvases[0];
          if (!canvas) return { count: 0 };
          const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          let visiblePixels = 0;
          for (let index = 3; index < pixels.length; index += 64) if (pixels[index] > 0) visiblePixels++;
          const style = getComputedStyle(canvas);
          const frameStyle = getComputedStyle(document.querySelector('.site-frame'));
          const mainStyle = getComputedStyle(document.querySelector('main'));
          const headingStyle = getComputedStyle(document.querySelector('main h1'));
          const pageHero = document.querySelector('.page-hero');
          const softSection = document.querySelector('.section--soft');
          return {
            count: canvases.length,
            visiblePixels,
            position: style.position,
            pointerEvents: style.pointerEvents,
            width: canvas.width,
            height: canvas.height,
            frameBackground: frameStyle.backgroundColor,
            mainBackground: mainStyle.backgroundColor,
            headingColor: headingStyle.color,
            pageHeroBackground: pageHero ? getComputedStyle(pageHero).backgroundImage : 'none',
            softSectionBackground: softSection ? getComputedStyle(softSection).backgroundColor : 'rgba(0, 0, 0, 0)',
          };
        })()`,
        returnByValue: true,
      });
      const smoke = result.result.value;
      assert.equal(smoke.count, 1, `${route} debe incluir un solo fondo de humo`);
      assert.ok(smoke.visiblePixels > 0, `${route} debe pintar humo visible`);
      assert.equal(smoke.position, 'fixed');
      assert.equal(smoke.pointerEvents, 'none', 'el humo no debe bloquear los enlaces');
      assert.ok(smoke.width >= 390 && smoke.height >= 844, 'el fondo debe cubrir la pantalla móvil');
      assert.equal(smoke.frameBackground, 'rgb(20, 23, 25)', `${route} debe usar el mismo fondo oscuro que Inicio`);
      assert.equal(smoke.mainBackground, 'rgba(0, 0, 0, 0)', `${route} no debe cubrir el humo con una capa clara`);
      assert.equal(smoke.pageHeroBackground, 'none', `${route} no debe ocultar el humo detrás de su cabecera`);
      assert.equal(smoke.softSectionBackground, 'rgba(0, 0, 0, 0)', `${route} no debe ocultar el humo en sus secciones`);
      assert.ok(contrastRatio(smoke.headingColor, smoke.frameBackground) >= 4.5, `${route} debe conservar contraste en sus títulos`);
    }

    await cdp.send('Runtime.evaluate', { expression: `window.scrollTo(0, 900)` });
    const scrolledCanvas = await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('#fondo-humo').getBoundingClientRect().top`,
      returnByValue: true,
    });
    assert.equal(scrolledCanvas.result.value, 0, 'el humo debe seguir fijo mientras se desplaza cualquier página');
  });

  await t.test('resume las ocasiones de la landing sin perder los iconos principales', async () => {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4175/' });
    await waitForApp(cdp);

    const result = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify([...document.querySelectorAll('.occasion')].map((card) => ({
        title: card.querySelector('strong')?.textContent.trim(),
        icons: card.querySelector('span')?.textContent.trim(),
        href: card.getAttribute('href'),
      })))`,
      returnByValue: true,
    });
    assert.equal(result.exceptionDetails, undefined, 'la lectura de las tarjetas no debe producir errores');
    const cards = JSON.parse(result.result.value);
    assert.equal(cards.length, 6, 'la landing debe incluir una tarjeta para otros tipos de evento');
    assert.deepEqual(cards, [
      { title: 'Bodas y comuniones', icons: '💍 ⛪', href: '/eventos.html' },
      { title: 'Cumpleaños', icons: '🎂', href: '/eventos.html' },
      { title: 'Post-Eventos Deportivos', icons: '🏋️', href: '/eventos.html' },
      { title: 'Ferias, Mercados y Festivales', icons: '🎪 🎉', href: '/eventos.html' },
      { title: 'Eventos corporativos', icons: '🏢', href: '/eventos.html' },
      { title: 'Catas privadas', icons: '🥂 🍕 ✨', href: '/contacto.html' },
    ]);
    const homeCallout = await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('.occasion-callout')?.textContent.trim()`,
      returnByValue: true,
    });
    assert.equal(homeCallout.result.value, '¿Quieres vivir la experiencia? Contacta con nosotros sin compromiso!');

    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4175/eventos.html' });
    await waitForApp(cdp);
    const servicesResult = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify([...document.querySelectorAll('.occasion')].map((card) => ({
        title: card.querySelector('strong')?.textContent.trim(),
        icon: card.querySelector('span')?.textContent.trim(),
        href: card.getAttribute('href'),
      })))`,
      returnByValue: true,
    });
    assert.equal(servicesResult.exceptionDetails, undefined, 'la lectura de los servicios no debe producir errores');
    assert.deepEqual(JSON.parse(servicesResult.result.value).map(({ title, icon }) => ({ title, icon })), cards.map(({ title, icons }) => ({ title, icon: icons })), 'Eventos debe mostrar los mismos tipos e iconos que Inicio');
    const eventsCallout = await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('.occasion-callout')?.textContent.trim()`,
      returnByValue: true,
    });
    assert.equal(eventsCallout.result.value, '¿Quieres vivir la experiencia? Contacta con nosotros sin compromiso!');
    const eventsPageResult = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({
        photos: [...document.querySelectorAll('.events-carousel img')].map((img) => img.getAttribute('src')),
        pizzas: [...document.querySelectorAll('.pizza-list h3')].map((heading) => heading.textContent.trim()),
        notes: [...document.querySelectorAll('.pizza-notes p')].map((paragraph) => paragraph.textContent.trim()),
      })`,
      returnByValue: true,
    });
    const eventsPage = JSON.parse(eventsPageResult.result.value);
    assert.equal(eventsPage.photos.length, 4, 'el carrusel debe incluir todas las fotos de Eventos');
    const eventsGalleryResult = await cdp.send('Runtime.evaluate', {
      expression: `(() => { const carousel = document.querySelector('.events-carousel'); const bounds = carousel.getBoundingClientRect(); return { width: bounds.width, height: bounds.height, fit: getComputedStyle(carousel.querySelector('img')).objectFit }; })()`,
      returnByValue: true,
    });
    assert.ok(eventsGalleryResult.result.value.height > eventsGalleryResult.result.value.width, 'el carrusel de Eventos debe ser vertical en móvil');
    assert.equal(eventsGalleryResult.result.value.fit, 'contain', 'las fotos de Eventos deben verse completas');
    assert.deepEqual(eventsPage.pizzas, ['Prosciutto', '4 quesos', 'Pepperoni', 'Carbonara', 'Especial PizzPlass']);
    assert.match(eventsPage.notes.join(' '), /sin gluten.*sin lactosa.*intolerancias/i);
    assert.match(eventsPage.notes.join(' '), /pizzas personalizadas/i);

    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4175/nosotros.html' });
    await waitForApp(cdp);
    const teamPhotosResult = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify([...document.querySelectorAll('.story__visual img')].map((image) => ({
        alt: image.alt,
        src: image.getAttribute('src'),
      })))`,
      returnByValue: true,
    });
    assert.equal(teamPhotosResult.exceptionDetails, undefined, 'la lectura de las fotos del equipo no debe producir errores');
    assert.deepEqual(JSON.parse(teamPhotosResult.result.value), [
      { alt: 'Leo y Juan Antonio — foto 1', src: '/assets/Nosotros/Foto1.jpeg' },
      { alt: 'Leo y Juan Antonio — foto 2', src: '/assets/Nosotros/Foto2.jpeg' },
    ], 'la página Nosotros debe mostrar las dos fotos de Leo y Juan Antonio');

    const carouselResult = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify((() => {
        const carousel = document.querySelector('.story__carousel');
        return {
          caption: carousel?.querySelector('.story__caption')?.textContent.trim(),
          nextLabel: carousel?.querySelector('[aria-label="Ver siguiente foto"]')?.getAttribute('aria-label'),
          active: [...(carousel?.querySelectorAll('.story__slide') || [])].map((slide) => slide.classList.contains('is-active')),
        };
      })())`,
      returnByValue: true,
    });
    assert.deepEqual(JSON.parse(carouselResult.result.value), {
      caption: 'Leo & Juan Antonio',
      nextLabel: 'Ver siguiente foto',
      active: [true, false],
    }, 'las fotos del equipo deben mostrarse en un carrusel con el nombre siempre encima');

    await cdp.send('Runtime.evaluate', { expression: `document.querySelector('[aria-label="Ver siguiente foto"]').click()` });
    const activePhotoResult = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify([...document.querySelectorAll('.story__carousel .story__slide')].map((slide) => slide.classList.contains('is-active')))`,
      returnByValue: true,
    });
    assert.deepEqual(JSON.parse(activePhotoResult.result.value), [false, true], 'el control debe mostrar la segunda foto');

    const verticalPhotoResult = await cdp.send('Runtime.evaluate', {
      expression: `(() => ({
        height: document.querySelector('.story__carousel').getBoundingClientRect().height,
        fit: getComputedStyle(document.querySelector('.story__slide img')).objectFit,
      }))()`,
      returnByValue: true,
    });
    const verticalPhoto = verticalPhotoResult.result.value;
    assert.ok(verticalPhoto.height >= 400, 'en móvil el carrusel debe tener altura suficiente para mostrar la foto vertical');
    assert.equal(verticalPhoto.fit, 'contain', 'las fotos verticales deben verse completas, sin recorte');

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 607, height: 844, deviceScaleFactor: 1, mobile: true });
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4175/nosotros.html' });
    await waitForApp(cdp);
    const wideMobileResult = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const bounds = document.querySelector('.story__carousel').getBoundingClientRect();
        return { width: bounds.width, height: bounds.height };
      })()`,
      returnByValue: true,
    });
    const wideMobile = wideMobileResult.result.value;
    assert.ok(wideMobile.height > wideMobile.width, 'el carrusel debe conservar un formato vertical en móviles anchos');

    const menuIconResult = await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('.menu-button').textContent.trim()`,
      returnByValue: true,
    });
    assert.equal(menuIconResult.result.value, 'Menú 🍕', 'el botón móvil debe identificar el menú antes del icono de pizza');
    const menuStyleResult = await cdp.send('Runtime.evaluate', {
      expression: `(() => { const button = document.querySelector('.menu-button'); const style = getComputedStyle(button); return { background: style.backgroundColor, color: style.color, alignment: style.placeItems, width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height }; })()`,
      returnByValue: true,
    });
    assert.equal(menuStyleResult.result.value.background, 'rgba(0, 0, 0, 0)', 'el icono pizza no debe tener recuadro de fondo');
    assert.equal(menuStyleResult.result.value.color, 'rgb(255, 255, 255)', 'la palabra Menú debe mostrarse en blanco');
    assert.equal(menuStyleResult.result.value.alignment, 'center', 'el icono pizza debe estar centrado');

    const teamSectionResult = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify((() => {
        const section = document.querySelector('.team-section');
        return {
          title: section?.querySelector('h2')?.textContent.trim(),
          copy: section?.querySelector('p')?.textContent.trim(),
          photos: [...(section?.querySelectorAll('.team-carousel img') || [])].map((image) => image.getAttribute('src')),
        };
      })())`,
      returnByValue: true,
    });
    assert.deepEqual(JSON.parse(teamSectionResult.result.value), {
      title: 'Nuestro equipo',
      copy: 'Hoy contamos con dos puestos de trabajo y seguimos creciendo para llevar PizzPlass a más celebraciones.',
      photos: ['/assets/Equipo/Equipo1.jpeg', '/assets/Equipo/Equipo2.jpeg'],
    }, 'la página Nosotros debe incluir el equipo y todas sus fotos antes de Instagram');
  });

  await t.test('usa la nueva identidad y comunica el servicio sin límites geográficos ni de aforo', async () => {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    const routes = [
      '/', '/nosotros.html', '/eventos.html', '/blog.html', '/contacto.html',
      '/blog/pizza-napolitana-autentica.html', '/blog/pizza-en-tu-boda.html',
      '/blog/historia-pizzplass.html', '/blog/secretos-masa-48-horas.html',
      '/blog/como-elegir-catering-evento.html', '/blog/horno-lena-espectaculo.html',
    ];

    for (const route of routes) {
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:4175${route}` });
      await waitForApp(cdp);
      const copyResult = await cdp.send('Runtime.evaluate', {
        expression: `document.documentElement.textContent`,
        returnByValue: true,
      });
      assert.doesNotMatch(copyResult.result.value, /Palomares del Río/i, `${route} no debe presentar el obrador como ubicación pública`);
      assert.doesNotMatch(copyResult.result.value, /eventos en Andalucía|para eventos en Andalucía|Andalucía y comunidades limítrofes/i, `${route} no debe limitar el servicio a Andalucía`);
      assert.doesNotMatch(copyResult.result.value, /10\s*[–-]\s*400/i, `${route} no debe limitar el número de invitados`);

      const logoResult = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify([...document.querySelectorAll('.brand img')].map((image) => image.getAttribute('src')))`,
        returnByValue: true,
      });
      const logos = JSON.parse(logoResult.result.value);
      assert.ok(logos.length >= 2, `${route} debe mostrar el logo en cabecera y pie`);
      assert.ok(logos.every((src) => /logo2\.png(?:\?|$)/.test(src)), `${route} debe usar logo2.png en cabecera y pie`);
    }

    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4175/' });
    await waitForApp(cdp);
    const identityResult = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({
        heroLogo: document.querySelector('.hero-visual__card img')?.getAttribute('src'),
        favicon: document.querySelector('link[rel="icon"]')?.getAttribute('href'),
        socialImage: document.querySelector('meta[property="og:image"]')?.content,
        structuredData: document.querySelector('script[type="application/ld+json"]')?.textContent,
      })`,
      returnByValue: true,
    });
    const identity = JSON.parse(identityResult.result.value);
    assert.match(identity.heroLogo, /logo2\.png(?:\?|$)/, 'la portada debe usar logo2.png');
    assert.equal(identity.favicon, '/assets/logo2.png', 'el favicon debe usar logo2.png');
    assert.equal(identity.socialImage, 'https://pizzplass.es/assets/logo2.png', 'la imagen al compartir debe usar logo2.png');
    assert.doesNotMatch(identity.structuredData, /Palomares del Río/i, 'los datos SEO no deben publicar Palomares del Río');
    assert.match(identity.structuredData, /España/i, 'los datos SEO deben indicar España como zona de servicio');

    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4175/eventos.html' });
    await waitForApp(cdp);
    const serviceResult = await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('.location')?.innerText`,
      returnByValue: true,
    });
    assert.match(serviceResult.result.value, /mínimo(?: de)? 48 horas de fermentación/i, 'Eventos debe explicar la preparación de la masa en el obrador');
    assert.match(serviceResult.result.value, /ingredientes.*horneado final.*directo/is, 'Eventos debe explicar el acabado en directo');
    assert.match(serviceResult.result.value, /cualquier punto de España/i, 'Eventos debe comunicar la cobertura nacional');
  });
});
