/* ==========================================================================
   Battle on Imperial — site behavior
   No dependencies. Everything degrades gracefully if JS is off.
   ========================================================================== */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------- mobile nav -- */
  var nav = document.getElementById('nav');
  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');

  if (nav && toggle && links) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    // Close the menu after tapping a link on mobile.
    links.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });
  }

  /* --------------------------------------------------- scroll reveals -- */
  var pending = Array.prototype.slice.call(document.querySelectorAll('.reveal'));

  var revealAll = function () {
    pending.forEach(function (el) { el.classList.add('is-in'); });
    pending = [];
  };

  if (reduceMotion) {
    revealAll();
  } else {
    // Deliberately not using IntersectionObserver alone: an element that jumps
    // from below the viewport to above it in a single scroll (anchor links,
    // flicked scrolling, restored scroll position) never crosses a threshold,
    // so it would stay stuck at opacity 0. A cheap rAF-throttled sweep reveals
    // anything at or above the fold and can't leave content invisible.
    var ticking = false;

    var sweep = function () {
      ticking = false;
      if (!pending.length) return;

      var fold = window.innerHeight * 0.92;
      var still = [];

      for (var i = 0; i < pending.length; i++) {
        var el = pending[i];
        if (el.getBoundingClientRect().top < fold) {
          el.classList.add('is-in');
        } else {
          still.push(el);
        }
      }
      pending = still;

      if (!pending.length) {
        window.removeEventListener('scroll', request);
        window.removeEventListener('resize', request);
      }
    };

    var request = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(sweep);
    };

    // Stagger siblings slightly so grids cascade instead of popping.
    pending.forEach(function (el, i) {
      el.style.transitionDelay = (i % 4) * 70 + 'ms';
    });

    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    sweep();

    // Last-resort guarantee: nothing stays invisible, whatever happens.
    window.addEventListener('load', request);
    setTimeout(function () { if (pending.length) request(); }, 1200);
  }

  /* ------------------------------------------------ active nav section -- */
  var sections = document.querySelectorAll('main section[id]');
  var navAnchors = links ? links.querySelectorAll('a[href^="#"]') : [];

  if (sections.length && navAnchors.length && 'IntersectionObserver' in window) {
    var setActive = function (id) {
      Array.prototype.forEach.call(navAnchors, function (a) {
        a.classList.toggle('is-active', a.getAttribute('href') === '#' + id);
      });
    };

    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) setActive(entry.target.id);
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    Array.prototype.forEach.call(sections, function (s) {
      sectionObserver.observe(s);
    });
  }

  /* ------------------------------------------------ stat count-up ----- */
  var counters = document.querySelectorAll('[data-count]');

  if (counters.length && !reduceMotion && 'IntersectionObserver' in window) {
    var countObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        countObserver.unobserve(el);

        var target = parseInt(el.getAttribute('data-count'), 10);
        if (isNaN(target)) return;

        var duration = 900;
        var start = null;

        var step = function (ts) {
          if (start === null) start = ts;
          var p = Math.min((ts - start) / duration, 1);
          // ease-out cubic
          var eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(target * eased);
          if (p < 1) requestAnimationFrame(step);
        };

        el.textContent = '0';
        requestAnimationFrame(step);
      });
    }, { threshold: 0.5 });

    Array.prototype.forEach.call(counters, function (el) {
      countObserver.observe(el);
    });
  }

  /* ---------------------------------------------- 20-slot capacity bar -- */
  var track = document.getElementById('capacityTrack');
  if (track) {
    for (var i = 0; i < 20; i++) {
      var slot = document.createElement('span');
      slot.className = 'capacity__slot';
      track.appendChild(slot);
    }
  }

  /* ---------------------------------------------------- interest form -- */
  var form = document.getElementById('regForm');
  var status = document.getElementById('formStatus');

  if (form && status) {
    var show = function (msg, isError) {
      status.textContent = msg;
      status.classList.add('is-shown');
      status.classList.toggle('is-error', !!isError);
    };

    form.addEventListener('submit', function (e) {
      // Native validation first.
      if (!form.checkValidity()) {
        e.preventDefault();
        form.reportValidity();
        return;
      }

      // If the form has been wired to a real endpoint (Formspree, Netlify,
      // Google Forms, etc.), let the browser POST it normally.
      if (form.getAttribute('action')) return;

      // Otherwise fall back to composing an email — works with no backend.
      e.preventDefault();

      var to = form.getAttribute('data-mailto') || 'info@battleonimperial.com';
      var get = function (name) {
        var f = form.elements[name];
        return f && f.value ? f.value.trim() : '';
      };

      var school = get('school');
      var lines = [
        'Team: ' + school,
        'Level: ' + get('level'),
        'Contact: ' + get('contact'),
        'Email: ' + get('email'),
        'Phone: ' + (get('phone') || '—'),
        '',
        'Notes:',
        get('notes') || '—',
        '',
        '— Sent from the Battle on Imperial website'
      ];

      var href = 'mailto:' + to +
        '?subject=' + encodeURIComponent('Battle on Imperial — Team Interest: ' + school) +
        '&body=' + encodeURIComponent(lines.join('\n'));

      window.location.href = href;

      show('Thanks! Your email app should be opening with your team details filled in — ' +
           'just hit send and a tournament coordinator will follow up.');
    });
  }

  /* ------------------------------------------------------------ year -- */
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
