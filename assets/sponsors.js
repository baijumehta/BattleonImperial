/* ==========================================================================
   Battle on Imperial — sponsors
   Two jobs, on whichever page has the hooks:
     #sponsorBand   the logo band, read from public.sponsors (visible rows only)
     #sponsorForm   the "become a sponsor" inquiry, written to sponsor_inquiries
   No dependencies. With Supabase unconfigured the band stays hidden and the
   form falls back to composing an email.
   ========================================================================== */
(function () {
  'use strict';

  var cfg = window.BOI_CONFIG || {};
  var url = (cfg.SUPABASE_URL || '').replace(/\/+$/, '');
  var key = cfg.SUPABASE_ANON_KEY || '';

  // EDIT: display order of the band. Mirrors the tier CHECK in
  // supabase/sponsors.sql and the package cards on sponsors.html.
  var TIERS = [
    'Presenting Partner',
    'Field Partner',
    'Player Experience Partner',
    'Athletic Trainer Partner',
    'Coaches Zone Partner',
    'Game Sponsor'
  ];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  /* --------------------------------------------------------- logo band -- */
  // Anything marked data-when-sponsors shows only once there is a sponsor to
  // show; data-when-no-sponsors is the copy for before then. The home page
  // swaps its heading this way, the sponsors page hides a whole section.
  function toggleHeads(has) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-when-sponsors]'), function (n) {
      n.hidden = !has;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-when-no-sponsors]'), function (n) {
      n.hidden = has;
    });
  }

  function renderBand(band, list) {
    band.innerHTML = '';
    if (!list.length) { band.hidden = true; toggleHeads(false); return; }

    TIERS.forEach(function (tier) {
      var items = list.filter(function (s) { return s.tier === tier; });
      if (!items.length) return;

      var slug = tier.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      var group = el('div', 'sponsorband__tier sponsorband__tier--' + slug);
      group.appendChild(el('h3', 'sponsorband__label', items.length > 1 ? tier + 's' : tier));

      var row = el('div', 'sponsorband__row');
      items.forEach(function (s) {
        var card = el(s.website ? 'a' : 'div', 'sponsor');
        if (s.website) {
          card.href = s.website;
          card.target = '_blank';
          card.rel = 'noopener sponsored';
        }

        var nameText = el('span', 'sponsor__name sponsor__name--text', s.name);
        if (s.logo_url) {
          var fig = el('span', 'sponsor__logo');
          var img = new Image();
          img.alt = s.name;
          img.loading = 'lazy';
          img.decoding = 'async';
          // A logo that fails to load leaves the name, not a broken image.
          img.onerror = function () { fig.parentNode && fig.parentNode.replaceChild(nameText, fig); };
          img.src = s.logo_url;
          fig.appendChild(img);
          card.appendChild(fig);
        } else {
          card.appendChild(nameText);
        }
        if (s.blurb) card.appendChild(el('span', 'sponsor__blurb', s.blurb));
        row.appendChild(card);
      });

      group.appendChild(row);
      band.appendChild(group);
    });

    band.hidden = false;
    toggleHeads(true);
  }

  var band = document.getElementById('sponsorBand');
  // Expose for local render testing without a network round trip.
  if (band) window.__renderSponsors = function (rows) { renderBand(band, rows || []); };
  if (band) {
    if (!url || !key) {
      toggleHeads(false);
    } else {
      fetch(url + '/rest/v1/sponsors?select=name,tier,website,logo_url,blurb,sort' +
            '&visible=is.true&order=sort.asc,name.asc', {
        headers: { apikey: key, Authorization: 'Bearer ' + key }
      })
        .then(function (res) { return res.ok ? res.json() : []; })
        .then(function (rows) { renderBand(band, rows || []); })
        .catch(function () { renderBand(band, []); });
    }
  }

  /* ------------------------------------------------------ inquiry form -- */
  var form = document.getElementById('sponsorForm');
  var status = document.getElementById('sponsorStatus');
  if (!form || !status) return;

  var submitBtn = form.querySelector('button[type="submit"]');
  var btnLabel = submitBtn ? submitBtn.textContent : '';
  var sending = false;

  function show(msg, isError) {
    status.textContent = msg;
    status.classList.add('is-shown');
    status.classList.toggle('is-error', !!isError);
  }
  function setBusy(busy) {
    sending = busy;
    if (!submitBtn) return;
    submitBtn.disabled = busy;
    submitBtn.textContent = busy ? 'Sending…' : btnLabel;
  }
  function get(name) {
    var f = form.elements[name];
    return f && f.value ? f.value.trim() : '';
  }

  function mailtoFallback(note) {
    var to = form.getAttribute('data-mailto') || cfg.CONTACT_EMAIL || 'info@battleonimperial.com';
    var lines = [
      'Business: ' + get('business'),
      'Website: ' + (get('website') || '—'),
      '',
      'Contact: ' + get('contact_name'),
      'Email: ' + get('email'),
      'Phone: ' + (get('phone') || '—'),
      '',
      'Package: ' + (get('tier') || 'not chosen'),
      '',
      'Message:',
      get('message') || '—',
      '',
      '— Sent from the Battle on Imperial website'
    ];
    window.location.href = 'mailto:' + to +
      '?subject=' + encodeURIComponent('Sponsoring Battle on Imperial — ' + get('business')) +
      '&body=' + encodeURIComponent(lines.join('\n'));
    show(note || 'Thanks! Your email app should be opening with your details filled in — ' +
         'just hit send and Lydie will follow up.');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) return;

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    // Honeypot: a real person never fills a field they cannot see.
    if (get('company_url')) {
      show('Thanks! Lydie will follow up shortly.');
      form.reset();
      return;
    }

    if (!url || !key) { mailtoFallback(); return; }

    setBusy(true);
    status.classList.remove('is-shown');

    fetch(url + '/rest/v1/sponsor_inquiries', {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        // INSERT only, no SELECT — do not ask PostgREST to read the row back.
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        business: get('business'),
        website: get('website') || null,
        contact_name: get('contact_name'),
        email: get('email'),
        phone: get('phone') || null,
        tier: get('tier') || null,
        message: get('message') || null,
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
        show('Thanks — we have your inquiry. Lydie will follow up at the email you gave ' +
             'us within a few days.');
      })
      .catch(function (err) {
        setBusy(false);
        if (window.console && console.warn) console.warn('[Battle on Imperial] sponsor inquiry failed:', err);
        // Never lose an inquiry to a backend problem — hand it to email.
        mailtoFallback('We could not reach our system just now, so we have opened an email ' +
          'with your details instead — please hit send and we will pick it up from there.');
      });
  });
})();
