/* PizzPlass — interacciones del sitio */
(function () {
  'use strict';

  // --- Menú móvil ---
  var toggle = document.querySelector('.nav__toggle');
  var links = document.querySelector('.nav__links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      links.classList.toggle('open');
      var expanded = links.classList.contains('open');
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    });
    links.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { links.classList.remove('open'); });
    });
  }

  // --- Marcar enlace activo según la página ---
  var path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav__links a').forEach(function (a) {
    var href = a.getAttribute('href');
    if (href === path || (path === '' && href === 'index.html')) {
      a.classList.add('active');
    }
  });

  // --- Reveal al hacer scroll ---
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  // Failsafe: si algo quedara oculto (impresión, navegadores raros), revelarlo.
  window.addEventListener('load', function () {
    setTimeout(function () {
      document.querySelectorAll('.reveal:not(.in)').forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight) { el.classList.add('in'); }
      });
    }, 800);
  });

  // --- Año dinámico en el footer ---
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  // --- Formulario de contacto: email (FormSubmit) + WhatsApp ---
  var form = document.querySelector('.form');
  if (form) {
    var WSP_NUMBER = '34675264967'; // WhatsApp de PizzPlass

    var val = function (id) {
      var el = form.querySelector('#' + id);
      return el && el.value ? el.value.trim() : '';
    };
    var firstName = function (v) { return v ? v.trim().split(' ')[0] : ''; };

    // ENTER no debe enviar el formulario (salvo salto de línea en "Cuéntanos más")
    form.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
      }
    });

    // Texto del mensaje a partir de los campos rellenados
    function buildMessage() {
      var campos = [
        ['Nombre', val('nombre')],
        ['Email', val('email')],
        ['Teléfono', val('telefono')],
        ['Tipo de evento', val('tipo')],
        ['Fecha', val('fecha')],
        ['Provincia', val('provincia')],
        ['Invitados', val('invitados')],
        ['Mensaje', val('mensaje')]
      ];
      var lineas = ['¡Hola PizzPlass! Quiero pedir un presupuesto para un evento:', ''];
      campos.forEach(function (c) { if (c[1]) { lineas.push(c[0] + ': ' + c[1]); } });
      return lineas.join('\n');
    }

    var ok = form.querySelector('.form__ok');
    function showMsg(text, isError) {
      if (!ok) { return; }
      ok.textContent = text;
      ok.style.display = 'block';
      ok.style.background = isError ? '#9E2820' : '';
      ok.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // --- Botón de WhatsApp ---
    var wspBtn = form.querySelector('.js-wsp');
    if (wspBtn) {
      wspBtn.addEventListener('click', function () {
        var url = 'https://wa.me/' + WSP_NUMBER + '?text=' + encodeURIComponent(buildMessage());
        window.open(url, '_blank', 'noopener');
        form.reset();
        showMsg('Te hemos abierto WhatsApp con tus datos. Si no se abre, escríbenos al 675 26 49 67. 💬');
      });
    }

    // --- Envío por email (FormSubmit vía AJAX, sin recargar la página) ---
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var nombre = val('nombre');
      var email = val('email');
      if (!nombre || !email) {
        showMsg('Por favor, rellena todos los campos del formulario. 🙏', true);
        return;
      }

      var submitBtn = form.querySelector('button[type="submit"]');
      var btnText = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Enviando…'; }

      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });

      fetch(form.getAttribute('action').replace('formsubmit.co/', 'formsubmit.co/ajax/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(data)
      })
        .then(function (r) { return r.json(); })
        .then(function () {
          showMsg('¡Gracias' + (nombre ? ', ' + firstName(nombre) : '') +
            '! Hemos recibido tu solicitud. Leo y Juan Antonio te responderán muy pronto. 🍕');
          form.reset();
        })
        .catch(function () {
          showMsg('Ups, no hemos podido enviar el formulario. Prueba con el botón de WhatsApp y te atendemos al momento. 💬');
        })
        .then(function () {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = btnText; }
        });
    });
  }
})();
