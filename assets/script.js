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

  /* ------------------------------------------------------ early bird -- */
  /* Early bird runs to the end of 30 November 2026, Pacific. Past that,
     everything marked data-earlybird goes, anything marked data-regular
     appears, and the regular price column takes the large type. The static
     markup names the deadline, so with scripts off the page still reads
     correctly — it just keeps showing an offer that has ended.

     EDIT: to extend the offer, change this date and the copy that names it
     (the hero note, the price panel tag, the FAQ, and the coach email). */
  var EARLY_BIRD_ENDS = new Date('2026-12-01T00:00:00-08:00');
  if (new Date() >= EARLY_BIRD_ENDS) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-earlybird]'), function (el) {
      el.hidden = true;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-regular]'), function (el) {
      el.hidden = false;
    });
    Array.prototype.forEach.call(document.querySelectorAll('.pricetable'), function (t) {
      t.classList.add('is-regular');
    });
  } else {
    /* "· N days left" beside the early-bird tag. Whole days until the
       deadline passes, so on November 30 itself it reads "1 day left". */
    var daysLeft = Math.ceil((EARLY_BIRD_ENDS - new Date()) / 86400000);
    Array.prototype.forEach.call(document.querySelectorAll('[data-earlybird-days]'), function (el) {
      el.textContent = ' · ' + daysLeft + (daysLeft === 1 ? ' day left' : ' days left');
    });
  }

  /* --------------------------------------------------------- key dates -- */
  /* Dates that have passed go grey and the next one up gets the "Next" tag.
     A date counts as passed once that day is over in the visitor's own time
     zone — close enough for deadlines stated as calendar days. */
  var dateItems = document.querySelectorAll('.dates__list [data-date]');
  if (dateItems.length) {
    var today = new Date();
    var nextTagged = false;
    Array.prototype.forEach.call(dateItems, function (li) {
      var p = li.getAttribute('data-date').split('-');
      var endOfDay = new Date(+p[0], +p[1] - 1, +p[2], 23, 59, 59);
      if (today > endOfDay) {
        li.classList.add('is-past');
      } else if (!nextTagged) {
        li.classList.add('is-next');
        nextTagged = true;
      }
    });
  }

  /* -------------------------------------------------------- map dialog -- */
  /* "Enlarge map" opens the campus drawing in a modal where it is laid out
     at least 900px wide and scrolls, so the field labels are readable on a
     phone. The SVG is cloned from the figure, so there is one drawing to
     maintain. Without <dialog> support the button is hidden and the inline
     map still pinch-zooms. */
  var mapZoom = document.getElementById('mapZoom');
  var mapDialog = document.getElementById('mapDialog');
  var mapBody = document.getElementById('mapDialogBody');
  var mapSvg = document.querySelector('.mapfig__frame svg');
  if (mapZoom && mapDialog && mapBody && mapSvg && typeof mapDialog.showModal === 'function') {
    mapZoom.addEventListener('click', function () {
      if (!mapBody.firstChild) {
        var clone = mapSvg.cloneNode(true);
        // No duplicate ids in the document; nothing in the drawing refers to them.
        Array.prototype.forEach.call(clone.querySelectorAll('[id]'), function (n) { n.removeAttribute('id'); });
        mapBody.appendChild(clone);
      }
      mapDialog.showModal();
    });
    var mapClose = document.getElementById('mapClose');
    if (mapClose) mapClose.addEventListener('click', function () { mapDialog.close(); });
    // A tap on the dimmed backdrop lands on the dialog element itself.
    mapDialog.addEventListener('click', function (e) { if (e.target === mapDialog) mapDialog.close(); });
  } else if (mapZoom) {
    mapZoom.hidden = true;
  }

  /* ---------------------------------------------------- interest form -- */
  var form = document.getElementById('regForm');
  var status = document.getElementById('formStatus');

  if (form && status) {
    var cfg = window.BOI_CONFIG || {};
    var submitBtn = form.querySelector('button[type="submit"]');
    var btnLabel = submitBtn ? submitBtn.textContent : '';
    var sending = false;

    var show = function (msg, isError) {
      status.textContent = msg;
      status.classList.add('is-shown');
      status.classList.toggle('is-error', !!isError);
    };

    var setBusy = function (busy) {
      sending = busy;
      if (!submitBtn) return;
      submitBtn.disabled = busy;
      submitBtn.textContent = busy ? 'Sending…' : btnLabel;
    };

    var get = function (name) {
      var f = form.elements[name];
      return f && f.value ? f.value.trim() : '';
    };

    /* Team 2's follow-up only makes sense once there is a team 2. Hiding it
       keeps the form shorter for the programs entering one team, which is
       most of them. */
    var team2 = form.elements.team2_level;
    var team2Field = document.getElementById('team2StrengthField');
    if (team2 && team2Field) {
      var syncTeam2 = function () {
        team2Field.hidden = !team2.value;
        if (!team2.value) form.elements.team2_strength.value = '';
      };
      team2.addEventListener('change', syncTeam2);
      syncTeam2();
    }

    /* A program outside D2/D3 should find that out here, not in a reply three
       weeks later. Warn, never block: an honest "another division" on the form
       is worth more than a guess that fits, and the coordinator still wants the
       submission. */
    var cifSel = form.elements.cif_division;
    var cifHint = document.getElementById('cifHint');
    if (cifSel && cifHint) {
      var cifDefaultHint = cifHint.innerHTML;
      cifSel.addEventListener('change', function () {
        var outside = cifSel.value === 'Another division';
        cifHint.innerHTML = outside
          ? 'This year’s field is <b>Division 2 and Division 3</b> only. Send it ' +
            'anyway — a coordinator will come back to you either way.'
          : cifDefaultHint;
        cifHint.classList.toggle('field__hint--warn', outside);
      });
    }

    /* `contact` and `level` predate the long form and still back the admin
       list and every row submitted before it. Derive them here rather than
       asking twice, so one summary column keeps working across both shapes. */
    var fullName = function () {
      return [get('contact_first'), get('contact_last')].filter(Boolean).join(' ');
    };
    /* `level` is NOT NULL and CHECKed against exactly these three values in
       schema.sql, so this has to collapse to one of them — "Varsity + JV"
       would be rejected and the visitor would land in the mailto fallback
       with no idea why. team1_level / team2_level carry the detail. */
    var levelSummary = function () {
      var a = get('team1_level'), b = get('team2_level');
      if (a && b) return 'Multiple teams';
      return a || 'Varsity';
    };

    var mailtoFallback = function (note) {
      var to = cfg.CONTACT_EMAIL || form.getAttribute('data-mailto') || 'info@battleonimperial.com';
      var school = get('school');
      var coach = function (n) {
        var name = [get('coach' + n + '_first'), get('coach' + n + '_last')].filter(Boolean).join(' ');
        if (!name) return null;
        return 'Coach ' + n + ': ' + name + ' · ' + (get('coach' + n + '_email') || '—') +
               ' · ' + (get('coach' + n + '_phone') || '—');
      };
      var lines = [
        'School: ' + school,
        'CIF division: ' + (get('cif_division') || '—'),
        '',
        'Submitted by: ' + fullName() + ' (' + (get('role') || 'role not given') + ')',
        'Email: ' + get('email'),
        'Cell: ' + (get('phone') || '—'),
        '',
        coach(1) || 'Coach 1: —',
        coach(2) || 'Coach 2: —',
        '',
        'Team 1: ' + (get('team1_level') || '—'),
        '  ' + (get('team1_strength') || 'no notes'),
        'Team 2: ' + (get('team2_level') || 'not entering a second team'),
        '  ' + (get('team2_strength') || 'no notes'),
        '',
        'Deposit terms acknowledged: ' +
          (form.elements.payment_ack && form.elements.payment_ack.checked ? 'yes' : 'no'),
        '',
        'Notes:',
        get('notes') || '—',
        '',
        '— Sent from the Battle on Imperial website'
      ];

      window.location.href = 'mailto:' + to +
        '?subject=' + encodeURIComponent('Battle on Imperial — Team Interest: ' + school) +
        '&body=' + encodeURIComponent(lines.join('\n'));

      show(note || 'Thanks! Your email app should be opening with your team details ' +
           'filled in — just hit send and a tournament coordinator will follow up.');
    };

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (sending) return;

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      // Honeypot: a real person never fills a field they cannot see.
      // Pretend it worked so bots get no signal about being caught.
      if (get('website')) {
        show('Thanks! A tournament coordinator will follow up shortly.');
        form.reset();
        return;
      }

      var url = (cfg.SUPABASE_URL || '').replace(/\/+$/, '');
      var key = cfg.SUPABASE_ANON_KEY || '';

      // Not wired to Supabase yet — compose an email instead.
      if (!url || !key) {
        mailtoFallback();
        return;
      }

      setBusy(true);
      status.classList.remove('is-shown');

      fetch(url + '/rest/v1/registrations', {
        method: 'POST',
        headers: {
          'apikey': key,
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json',
          // RLS grants INSERT only, with no SELECT — asking PostgREST to return
          // the new row would make it try to read back and fail.
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          school: get('school'),
          cif_division: get('cif_division') || null,

          // Derived, not asked — see fullName / levelSummary above.
          contact: fullName(),
          level: levelSummary(),

          contact_first: get('contact_first') || null,
          contact_last: get('contact_last') || null,
          role: get('role') || null,
          email: get('email'),
          phone: get('phone') || null,

          coach1_first: get('coach1_first') || null,
          coach1_last: get('coach1_last') || null,
          coach1_email: get('coach1_email') || null,
          coach1_phone: get('coach1_phone') || null,
          coach2_first: get('coach2_first') || null,
          coach2_last: get('coach2_last') || null,
          coach2_email: get('coach2_email') || null,
          coach2_phone: get('coach2_phone') || null,

          team1_level: get('team1_level') || null,
          team1_strength: get('team1_strength') || null,
          team2_level: get('team2_level') || null,
          team2_strength: get('team2_strength') || null,

          notes: get('notes') || null,
          payment_ack: !!(form.elements.payment_ack && form.elements.payment_ack.checked),
          consent: !!(form.elements.consent && form.elements.consent.checked)
        })
      })
        .then(function (res) {
          if (!res.ok) {
            return res.text().then(function (body) {
              throw new Error('HTTP ' + res.status + ' ' + body.slice(0, 200));
            });
          }
          setBusy(false);
          form.reset();
          show('Thanks — your team is on the list. A tournament coordinator will ' +
               'follow up at the email you gave us with the entry packet and dates.');
        })
        .catch(function (err) {
          setBusy(false);
          if (window.console && console.warn) {
            console.warn('[Battle on Imperial] registration POST failed:', err);
          }
          // Never lose a submission to a backend problem — hand it to email.
          mailtoFallback('We could not reach our sign-up system just now, so we have ' +
            'opened an email with your details instead — please hit send and we will ' +
            'pick it up from there.');
        });
    });
  }

  /* ------------------------------------------------------------ year -- */
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
