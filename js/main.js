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

  // --- Formulario de contacto (demo, sin backend) ---
  var form = document.querySelector('.form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = form.querySelector('.form__ok');
      var nombre = (form.querySelector('#nombre') || {}).value || '';
      if (ok) {
        ok.textContent = '¡Gracias' + (nombre ? ', ' + nombre.split(' ')[0] : '') +
          '! Hemos recibido tu solicitud. Leo y Juan Antonio te responderán muy pronto. 🍕';
        ok.style.display = 'block';
      }
      form.reset();
      if (ok) { ok.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    });
  }
})();
