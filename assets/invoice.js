/* ==========================================================================
   Battle on Imperial — printable invoice page
   invoice.html?t=<token> asks the database for that one invoice through
   get_invoice(token) and fills the template. A signed-in admin (same browser
   as Tournament Control) can also preview drafts.
   ========================================================================== */
(function () {
  'use strict';

  var cfg = window.BOI_CONFIG || {};
  var url = (cfg.SUPABASE_URL || '').replace(/\/+$/, '');
  var key = cfg.SUPABASE_ANON_KEY || '';

  /* EDIT: set once the club has a mailing address for checks. Also
     CHECK_MAIL_TO in supabase/functions/registration-email/invoice-templates.ts. */
  var CHECK_MAIL_TO = 'PO Box 17992, Anaheim, CA 92817';

  var sheet = document.getElementById('sheet');
  var toolbar = document.getElementById('toolbar');
  var note = document.getElementById('toolbarNote');

  function problem(title, detail) {
    sheet.innerHTML = '';
    var p = document.createElement('div');
    p.className = 'problem';
    var b = document.createElement('b'); b.textContent = title;
    p.appendChild(b);
    p.appendChild(document.createTextNode(detail));
    sheet.appendChild(p);
  }

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function money(v) {
    return '$' + num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  // "2027-01-12" → "01/12/2027", as the template asks, read as a calendar date.
  function mdy(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? m[2] + '/' + m[3] + '/' + m[1] : '—';
  }
  var STATUS = { draft: 'Draft', sent: 'Unpaid', partial: 'Partial', paid: 'Paid', void: 'Void' };

  // EDIT: wording by kind of invoice. Teams use the template as written.
  var KIND = {
    team: {
      school: 'School / District', program: 'Team / Program', contact: 'Coach / Contact',
      ft1: 'Thank you for registering for the inaugural Battle on Imperial Girls Lacrosse Tournament!',
      ft2: 'Three games guaranteed per varsity team; two to three per JV team.'
    },
    sponsor: {
      school: 'Business / Organization', program: 'Sponsorship', contact: 'Contact',
      ft1: 'Thank you for sponsoring the inaugural Battle on Imperial Girls Lacrosse Tournament!',
      ft2: 'Sponsorship is payment for the recognition described in your package, not a tax-deductible donation.'
    },
    vendor: {
      school: 'Business', program: 'Booth', contact: 'Contact',
      ft1: 'Thank you for joining the inaugural Battle on Imperial as a vendor!',
      ft2: 'Load-in time and your booth location come with your confirmation.'
    }
  };

  var token = new URLSearchParams(location.search).get('t') || '';
  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    problem('Invoice link not recognised.', 'Please use the link from your invoice email, or email battleonimperial@gmail.com.');
    return;
  }
  if (!url || !key) { problem('Invoices are unavailable.', 'Please email battleonimperial@gmail.com.'); return; }

  // An admin signed in to Tournament Control in this browser can preview drafts.
  var bearer = key;
  try {
    var s = JSON.parse(localStorage.getItem('boi.admin.session') || 'null');
    if (s && s.access_token) bearer = s.access_token;
  } catch (e) { /* no admin session; public view */ }

  function load(withBearer) {
    return fetch(url + '/rest/v1/rpc/get_invoice', {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + withBearer, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: token })
    }).then(function (res) {
      // An expired admin token: fall back to the public view.
      if (res.status === 401 && withBearer !== key) return load(key);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  load(bearer).then(function (inv) {
    if (!inv) {
      problem('Invoice not found.', 'The link may be incomplete. Please email battleonimperial@gmail.com.');
      return;
    }
    render(inv);
  }).catch(function () {
    problem('We could not load this invoice.', 'Please refresh in a moment, or email battleonimperial@gmail.com.');
  });

  function render(inv) {
    var tpl = document.getElementById('invoiceTpl').content.cloneNode(true);
    var set = function (field, value) {
      var n = tpl.querySelector('[data-f="' + field + '"]');
      if (n) n.textContent = value === null || value === undefined || value === '' ? '—' : value;
    };

    var words = KIND[inv.kind] || KIND.team;
    ['school', 'program', 'contact'].forEach(function (k) {
      var n = tpl.querySelector('[data-label="' + k + '"]'); if (n) n.textContent = words[k];
    });
    tpl.querySelector('[data-ft="1"]').textContent = words.ft1;
    tpl.querySelector('[data-ft="2"]').textContent = words.ft2;

    set('invoice_no', inv.invoice_no);
    set('issued_on', mdy(inv.issued_on));
    set('due_on', mdy(inv.due_on));
    set('status', STATUS[inv.status] || inv.status);
    ['bill_school', 'bill_program', 'bill_contact', 'bill_email', 'bill_address', 'po_ref'].forEach(function (f) { set(f, inv[f]); });

    var body = tpl.querySelector('[data-lines]');
    (inv.lines || []).forEach(function (l) {
      var tr = document.createElement('tr');
      var total = Math.round((num(l.qty) * num(l.unit_price) - num(l.discount)) * 100) / 100;
      [[l.description || 'Item', ''], [String(num(l.qty)), 'n'], [money(l.unit_price), 'n'],
       [num(l.discount) ? '−' + money(l.discount) : '—', 'n'], [money(total), 'n']].forEach(function (c) {
        var td = document.createElement('td');
        td.textContent = c[0];
        if (c[1]) td.className = c[1];
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });

    set('subtotal', money(inv.subtotal));
    if (num(inv.credit)) {
      set('credit_label', inv.credit_label || 'Discount / Credit');
      set('credit', '−' + money(inv.credit));
    } else {
      tpl.querySelector('[data-credit-row]').remove();
    }
    set('amount_paid', num(inv.amount_paid) ? '−' + money(inv.amount_paid) : money(0));
    set('balance', money(inv.balance));

    var check = tpl.querySelector('[data-check]');
    check.innerHTML = '';
    var cb = document.createElement('b'); cb.textContent = 'Check: ';
    check.appendChild(cb);
    check.appendChild(document.createTextNode(CHECK_MAIL_TO
      ? 'payable to Canyon Girls Lacrosse Booster Club, mailed to ' + CHECK_MAIL_TO + '.'
      : 'payable to Canyon Girls Lacrosse Booster Club. Email battleonimperial@gmail.com for the mailing address.'));

    var pays = inv.payments || [];
    if (pays.length) {
      var box = tpl.querySelector('[data-payments]');
      var rows = tpl.querySelector('[data-payment-rows]');
      pays.forEach(function (p) {
        var tr = document.createElement('tr');
        [mdy(p.date), [p.method, p.ref].filter(Boolean).join(' · ') || 'Payment', money(p.amount)].forEach(function (v, i) {
          var td = document.createElement('td'); td.textContent = v; if (i === 2) td.className = 'n'; tr.appendChild(td);
        });
        rows.appendChild(tr);
      });
      box.hidden = false;
    }

    if (inv.notes) {
      tpl.querySelector('[data-notes]').hidden = false;
      set('notes', inv.notes);
    }

    var stamp = tpl.querySelector('[data-stamp]');
    if (inv.status === 'paid' || inv.status === 'void' || inv.status === 'draft') {
      stamp.textContent = inv.status === 'paid' ? 'Paid' : inv.status === 'void' ? 'Void' : 'Draft';
      stamp.className = 'stamp stamp--' + inv.status;
      stamp.hidden = false;
    }

    sheet.innerHTML = '';
    sheet.appendChild(tpl);
    document.title = 'Invoice ' + inv.invoice_no + ' | Battle on Imperial';

    toolbar.hidden = false;
    note.textContent = inv.status === 'draft'
      ? 'Draft preview — only you can see this until it is sent.'
      : inv.status === 'void' ? 'This invoice has been voided.'
      : num(inv.balance) <= 0 ? 'Paid in full — thank you.'
      : 'Balance due ' + money(inv.balance) + ' by ' + mdy(inv.due_on) + '.';
  }

  document.getElementById('printBtn').addEventListener('click', function () { window.print(); });
})();
