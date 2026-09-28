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

  await t.test('la portada muestra el humo detrás del contenido sin bloquearlo', async () => {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4175/' });
    await waitForApp(cdp);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const result = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const canvas = document.querySelector('#fondo-humo');
        if (!canvas) return null;
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let visiblePixels = 0;
        for (let index = 3; index < pixels.length; index += 64) if (pixels[index] > 0) visiblePixels++;
        const style = getComputedStyle(canvas);
        return { visiblePixels, position: style.position, pointerEvents: style.pointerEvents, width: canvas.width, height: canvas.height };
      })()`,
      returnByValue: true,
    });
    const smoke = result.result.value;
    assert.ok(smoke?.visiblePixels > 0, 'la animación debe pintar humo visible en la portada');
    assert.equal(smoke.position, 'fixed');
    assert.equal(smoke.pointerEvents, 'none', 'el humo no debe bloquear los enlaces');
    assert.ok(smoke.width >= 390 && smoke.height >= 844, 'el fondo debe cubrir la pantalla móvil');
    await cdp.send('Runtime.evaluate', { expression: `window.scrollTo(0, 900)` });
    const scrolledCanvas = await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('#fondo-humo').getBoundingClientRect().top`,
      returnByValue: true,
    });
    assert.equal(scrolledCanvas.result.value, 0, 'el humo debe seguir fijo mientras se desplaza la portada');

    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4175/eventos.html' });
    await waitForApp(cdp);
    const otherPage = await cdp.send('Runtime.evaluate', { expression: `Boolean(document.querySelector('#fondo-humo'))`, returnByValue: true });
    assert.equal(otherPage.result.value, false, 'el humo debe quedar limitado a la portada');
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
      { title: 'También organizamos catas privadas. ¿Quieres vivir la experiencia? Consúltanos sin compromiso!', icons: '🥂 🍕 ✨', href: '/contacto.html' },
    ]);

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
    assert.equal(menuIconResult.result.value, '🍕', 'el botón que abre el menú móvil debe usar el icono de pizza');
    const menuStyleResult = await cdp.send('Runtime.evaluate', {
      expression: `(() => { const button = document.querySelector('.menu-button'); const style = getComputedStyle(button); return { background: style.backgroundColor, alignment: style.placeItems, width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height }; })()`,
      returnByValue: true,
    });
    assert.equal(menuStyleResult.result.value.background, 'rgba(0, 0, 0, 0)', 'el icono pizza no debe tener recuadro de fondo');
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
});
