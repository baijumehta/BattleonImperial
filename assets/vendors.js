/* ==========================================================================
   Battle on Imperial — vendor registration form
   Writes to public.vendor_registrations (insert-only for the public key).
   With Supabase unconfigured, or if the insert fails, it composes an email
   instead so a request is never lost.
   ========================================================================== */
(function () {
  'use strict';

  var cfg = window.BOI_CONFIG || {};
  var url = (cfg.SUPABASE_URL || '').replace(/\/+$/, '');
  var key = cfg.SUPABASE_ANON_KEY || '';

  var form = document.getElementById('vendorForm');
  var status = document.getElementById('vendorStatus');
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

  /* The permits acknowledgement only applies to food vendors. It appears when
     Food is chosen and is required from then on; picking a food category
     switches the booth type to Food so nobody books a merchant booth for a
     taco truck by accident. */
  var boothSel = form.elements.booth_type;
  var catSel = form.elements.category;
  var permitsField = document.getElementById('permitsField');
  var permitsBox = form.elements.permits_ack;
  function syncPermits() {
    var food = boothSel.value === 'Food';
    permitsField.hidden = !food;
    permitsBox.required = food;
    if (!food) permitsBox.checked = false;
  }
  if (boothSel && permitsField && permitsBox) {
    boothSel.addEventListener('change', syncPermits);
    if (catSel) {
      catSel.addEventListener('change', function () {
        if (/food/i.test(catSel.value) && !boothSel.value) { boothSel.value = 'Food'; syncPermits(); }
      });
    }
    syncPermits();
  }

  function mailtoFallback(note) {
    var to = form.getAttribute('data-mailto') || cfg.CONTACT_EMAIL || 'battleonimperial@gmail.com';
    var lines = [
      'Business: ' + get('business'),
      'Category: ' + (get('category') || '—'),
      'Will bring: ' + (get('products') || '—'),
      'Website: ' + (get('website') || '—'),
      '',
      'Booth: ' + (get('booth_type') || '—') + ' × ' + (get('booths') || '1'),
      'Permits acknowledged: ' + (permitsBox && permitsBox.checked ? 'yes' : 'n/a'),
      '',
      'Contact: ' + get('contact_name'),
      'Email: ' + get('email'),
      'Cell: ' + (get('phone') || '—'),
      '',
      'Notes:',
      get('notes') || '—',
      '',
      '— Sent from the Battle on Imperial website'
    ];
    window.location.href = 'mailto:' + to +
      '?subject=' + encodeURIComponent('Vendor booth at Battle on Imperial — ' + get('business')) +
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

    fetch(url + '/rest/v1/vendor_registrations', {
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
        category: get('category') || null,
        products: get('products') || null,
        website: get('website') || null,
        booth_type: get('booth_type'),
        booths: parseInt(get('booths'), 10) || 1,
        permits_ack: !!(permitsBox && permitsBox.checked),
        contact_name: get('contact_name'),
        email: get('email'),
        phone: get('phone') || null,
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
        syncPermits();
        show('Thanks — we have your booth request. Lydie will confirm your space and send ' +
             'the invoice to the email you gave us.');
      })
      .catch(function (err) {
        setBusy(false);
        if (window.console && console.warn) console.warn('[Battle on Imperial] vendor request failed:', err);
        // Never lose a request to a backend problem — hand it to email.
        mailtoFallback('We could not reach our system just now, so we have opened an email ' +
          'with your details instead — please hit send and we will pick it up from there.');
      });
  });
})();
