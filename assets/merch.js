/* ==========================================================================
   Battle on Imperial — merchandise pre-orders
   Builds the product grid, keeps a running total, and writes the order to
   public.merch_orders (insert-only for the public key). The buyer gets an
   email with the order number and the Zelle details; organisers get an alert.
   With Supabase unconfigured, or if the insert fails, it composes an email.
   ========================================================================== */
(function () {
  'use strict';

  var cfg = window.BOI_CONFIG || {};
  var url = (cfg.SUPABASE_URL || '').replace(/\/+$/, '');
  var key = cfg.SUPABASE_ANON_KEY || '';

  /* EDIT: products, prices and sizes. Must match merch_total() in
     supabase/merch.sql and PRODUCTS in merch-templates.ts — the database
     rejects an order whose total does not agree with these prices. */
  var SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  var PRODUCTS = [
    { id: 'tee',     name: 'T-Shirt',          price: 15, sizes: SIZES, img: 'sq-tee',     blurb: 'Black tee, full-colour crest.' },
    { id: 'hoodie',  name: 'Hoodie',           price: 30, sizes: SIZES, img: 'sq-hoodie',  blurb: 'Black pullover hoodie, front pocket.' },
    { id: 'pants',   name: 'Flannel PJ Pants', price: 20, sizes: SIZES, img: 'sq-pants',   blurb: 'Black and gold plaid, crest on the hip.' },
    { id: 'lanyard', name: 'Lanyard',          price: 7,  sizes: null,  img: 'sq-lanyard', blurb: 'Full-print lanyard with clip.' },
    { id: 'pin',     name: 'Tournament Pin',   price: 5,  sizes: null,  img: 'sq-pin',     blurb: 'Enamel crest pin, first edition.' }
  ];

  /* EDIT: pre-orders close at the end of this day, Pacific. Also stated in
     the page copy and the merch FAQ. */
  var CLOSES = new Date('2027-02-21T00:00:00-08:00');

  var form = document.getElementById('merchForm');
  var grid = document.getElementById('products');
  var totalEl = document.getElementById('merchTotal');
  var status = document.getElementById('merchStatus');
  if (!form || !grid || !totalEl || !status) return;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function money(n) { return '$' + n.toLocaleString('en-US'); }

  /* --------------------------------------------------------- closed? -- */
  if (new Date() >= CLOSES) {
    form.hidden = true;
    var closed = document.getElementById('merchClosed');
    if (closed) closed.hidden = false;
    Array.prototype.forEach.call(document.querySelectorAll('[data-merch-open]'), function (n) { n.hidden = true; });
    return;
  }

  /* ------------------------------------------------------- the grid -- */
  // One card per product. Sized products get a quantity box per size, so a
  // family can order two tees in different sizes in one go; lanyards and pins
  // get a single quantity.
  PRODUCTS.forEach(function (p) {
    // No 'reveal' here: the scroll-in fade collects its elements at page load,
    // and cards created afterwards would stay at opacity 0 forever.
    var card = el('article', 'product');
    card.dataset.id = p.id;

    var pic = document.createElement('picture');
    var src = document.createElement('source');
    src.srcset = 'assets/img/merch-' + p.img + '.webp'; src.type = 'image/webp';
    var img = new Image();
    img.src = 'assets/img/merch-' + p.img + '.jpg';
    // Not lazy: five small images, and a lazy img created by script before
    // insertion never started loading in some browsers.
    img.alt = p.name; img.loading = 'eager'; img.decoding = 'async';
    img.width = 720; img.height = 720;
    pic.appendChild(src); pic.appendChild(img);
    var figure = el('div', 'product__img'); figure.appendChild(pic);
    card.appendChild(figure);

    var body = el('div', 'product__body');
    var head = el('div', 'product__head');
    head.appendChild(el('h3', 'product__name', p.name));
    head.appendChild(el('span', 'product__price', money(p.price)));
    body.appendChild(head);
    body.appendChild(el('p', 'product__blurb', p.blurb));

    var qtys = el('div', 'product__qtys' + (p.sizes ? '' : ' product__qtys--single'));
    (p.sizes || ['']).forEach(function (size) {
      var lab = el('label', 'qty');
      lab.appendChild(el('span', 'qty__size', size || 'Quantity'));
      var inp = document.createElement('input');
      inp.type = 'number'; inp.min = '0'; inp.max = '10'; inp.step = '1'; inp.value = '0';
      inp.inputMode = 'numeric';
      inp.dataset.id = p.id; inp.dataset.size = size;
      inp.setAttribute('aria-label', p.name + (size ? ' size ' + size : '') + ' quantity');
      inp.addEventListener('input', update);
      inp.addEventListener('focus', function () { inp.select(); });
      lab.appendChild(inp);
      qtys.appendChild(lab);
    });
    body.appendChild(qtys);
    card.appendChild(body);
    grid.appendChild(card);
  });

  /* ---------------------------------------------------------- total -- */
  function lines() {
    var out = [];
    Array.prototype.forEach.call(grid.querySelectorAll('input[type=number]'), function (inp) {
      var q = Math.max(0, Math.min(10, parseInt(inp.value, 10) || 0));
      if (!q) return;
      var p = PRODUCTS.filter(function (x) { return x.id === inp.dataset.id; })[0];
      out.push({ id: p.id, name: p.name, size: inp.dataset.size || null, qty: q, price: p.price });
    });
    return out;
  }
  function total(items) {
    return items.reduce(function (s, i) { return s + i.qty * i.price; }, 0);
  }
  function update() {
    var items = lines();
    totalEl.textContent = money(total(items));
    Array.prototype.forEach.call(grid.querySelectorAll('.product'), function (card) {
      card.classList.toggle('is-picked', items.some(function (i) { return i.id === card.dataset.id; }));
    });
  }
  update();

  /* --------------------------------------------------------- submit -- */
  var submitBtn = document.getElementById('merchSubmit');
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

  // Order number: BOI- plus five characters from an alphabet with no 0/O or
  // 1/I/L, so it survives being read out loud and typed into a Zelle memo.
  function orderNo() {
    var alpha = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    var out = 'BOI-';
    var buf = new Uint8Array(5);
    (window.crypto || window.msCrypto).getRandomValues(buf);
    for (var i = 0; i < 5; i++) out += alpha[buf[i] % alpha.length];
    return out;
  }

  function describe(items) {
    return items.map(function (i) {
      return i.qty + ' × ' + i.name + (i.size ? ' (' + i.size + ')' : '') + ' — ' + money(i.qty * i.price);
    });
  }

  function mailtoFallback(no, items, sum, note) {
    var to = form.getAttribute('data-mailto') || cfg.CONTACT_EMAIL || 'battleonimperial@gmail.com';
    var body = [
      'Merchandise pre-order ' + no,
      '',
      'Name: ' + get('name'),
      'Team/school: ' + (get('school') || '—'),
      'Email: ' + get('email'),
      'Cell: ' + get('phone'),
      ''
    ].concat(describe(items)).concat([
      '',
      'Total: ' + money(sum),
      '',
      'Notes: ' + (get('notes') || '—'),
      '',
      '— Sent from the Battle on Imperial website'
    ]);
    window.location.href = 'mailto:' + to +
      '?subject=' + encodeURIComponent('Merchandise pre-order ' + no + ' — ' + get('name')) +
      '&body=' + encodeURIComponent(body.join('\n'));
    show(note || 'Thanks! Your email app should be opening with your order filled in — hit send, ' +
         'then Zelle ' + money(sum) + ' with ' + no + ' in the memo.');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) return;

    var items = lines();
    if (!items.length) {
      show('Pick at least one item first.', true);
      grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    if (get('company_url')) {            // honeypot
      show('Thanks! Check your email for the order details.');
      form.reset(); update();
      return;
    }

    var no = orderNo();
    var sum = total(items);

    if (!url || !key) { mailtoFallback(no, items, sum); return; }

    setBusy(true);
    status.classList.remove('is-shown');

    fetch(url + '/rest/v1/merch_orders', {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        order_no: no,
        name: get('name'),
        school: get('school') || null,
        email: get('email'),
        phone: get('phone'),
        items: items.map(function (i) { return { id: i.id, size: i.size, qty: i.qty }; }),
        total: sum,
        notes: get('notes') || null,
        ack: !!(form.elements.ack && form.elements.ack.checked)
      })
    })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (body) {
            throw new Error('HTTP ' + res.status + ' ' + body.slice(0, 200));
          });
        }
        setBusy(false);
        form.reset(); update();
        show('Order ' + no + ' placed — ' + money(sum) + '. We have emailed you the details. ' +
             'Zelle ' + money(sum) + ' to girlslacrosseboosterclub@gmail.com with ' + no +
             ' in the memo, and your gear will be at the merchandise table on March 13.');
        status.scrollIntoView({ behavior: 'smooth', block: 'center' });
      })
      .catch(function (err) {
        setBusy(false);
        if (window.console && console.warn) console.warn('[Battle on Imperial] merch order failed:', err);
        mailtoFallback(no, items, sum, 'We could not reach our system just now, so we have opened an ' +
          'email with your order instead — please hit send. Your order number is ' + no + '.');
      });
  });
})();
