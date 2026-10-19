/* ==========================================================================
   Battle on Imperial — team graphics maker
   A team picks a design, adds its photo and logo, and downloads the finished
   image. Everything happens on a canvas in the browser; nothing is uploaded.

   Each design is a flat image with grey placeholder areas. A slot gives the
   area's rectangle as fractions of the image (so a higher-resolution export
   of the same design needs no new numbers) and how to fill it:

     mode 'rect'  fill the whole rectangle (a clean rectangular placeholder)
     mode 'fill'  fill only the placeholder pixels inside it — the grey area
                  and anything it encloses, like the "ADD YOUR ..." text — so
                  frames, badges and sticks drawn over the edge stay on top

   Each design can also carry a Canva template link (canva: '...'). Then the
   card shows "Customize in Canva" too, for teams that want to change more
   than the photo and logo. In Canva: Share → Template link.

   Each design is for one audience — for: 'teams' | 'sponsors' | 'vendors' —
   and shows under that tab. A tab with no designs shows a coming-soon card.

   EDIT: to add a design, put the image in assets/img/media/ and add an entry.
   ========================================================================== */
(function () {
  'use strict';

  var TEMPLATES = [
    {
      for: 'teams',
      id: 'were-in-poster',
      title: 'We’re In! — Team Poster',
      blurb: 'Team photo strip and logo. Best for an Instagram post.',
      src: 'assets/img/media/were-in-poster.webp',
      thumb: 'assets/img/media/were-in-poster-thumb.webp',
      canva: '',   // Canva template link from Lydie
      slots: [
        { kind: 'photo', x: 58 / 853, y: 518 / 1280, w: 740 / 853, h: 276 / 1280, mode: 'rect' },
        { kind: 'logo',  x: 282 / 853, y: 850 / 1280, w: 288 / 853, h: 126 / 1280, mode: 'fill' }
      ]
    },
    {
      for: 'teams',
      id: 'see-you-at-the-battle',
      title: 'See You at the Battle!',
      blurb: 'Logo only — no team photo needed. Great for a story.',
      src: 'assets/img/media/see-you-at-the-battle.webp',
      thumb: 'assets/img/media/see-you-at-the-battle-thumb.webp',
      canva: '',   // Canva template link from Lydie
      slots: [
        { kind: 'logo', x: 44 / 400, y: 310 / 609, w: 138 / 400, h: 166 / 609, mode: 'fill' }
      ]
    },
    {
      for: 'teams',
      id: 'were-in-frame',
      title: 'We’re In! — Photo Frame',
      blurb: 'A big team photo with your logo on top.',
      src: 'assets/img/media/were-in-frame.webp',
      thumb: 'assets/img/media/were-in-frame-thumb.webp',
      canva: '',   // Canva template link from Lydie
      slots: [
        { kind: 'photo', x: 20 / 400, y: 238 / 608, w: 366 / 400, h: 200 / 608, mode: 'fill' },
        { kind: 'logo',  x: 126 / 400, y: 394 / 608, w: 148 / 400, h: 88 / 608, mode: 'fill' }
      ]
    }
  ];

  // Wording per audience: the page lede, the maker's field labels, the text
  // offered with Share, and the coming-soon card.
  var AUDIENCE = {
    teams: {
      lede: 'Pick a design, add your team photo and logo, and download it ready for Instagram, your team’s stories and the parent group chat. Tag @battleonimperial and we’ll share it.',
      photo: 'Team photo', logo: 'Team logo or mascot', share: 'We’re in! @battleonimperial',
      soon: 'Team designs are on their way.'
    },
    sponsors: {
      lede: 'Proud to back Battle on Imperial? Add your business logo to an official graphic and announce your sponsorship. Tag @battleonimperial and we’ll share it with the tournament’s families.',
      photo: 'Photo', logo: 'Business logo', share: 'Proud to sponsor @battleonimperial — March 13, 2027',
      soon: 'Sponsor graphics are on their way. Each package will have its own “Proud Sponsor” design — check back soon.'
    },
    vendors: {
      lede: 'Coming to Battle on Imperial with a booth? Add your logo to an official graphic and let families know where to find you. Tag @battleonimperial and we’ll share it.',
      photo: 'Product or booth photo', logo: 'Business logo', share: 'Find us at @battleonimperial — March 13, 2027',
      soon: 'Vendor graphics are on their way — check back soon.'
    }
  };
  var audience = 'teams';

  var grid = document.getElementById('mediaGrid');
  var maker = document.getElementById('maker');
  if (!grid || !maker) return;

  var canvas = document.getElementById('makerCanvas');
  var ctx = canvas.getContext('2d');
  var photoInput = document.getElementById('photoInput');
  var logoInput = document.getElementById('logoInput');
  var zoom = document.getElementById('photoZoom');
  var posY = document.getElementById('photoY');
  var posX = document.getElementById('photoX');
  var dlBtn = document.getElementById('makerDownload');
  var shareBtn = document.getElementById('makerShare');
  var statusEl = document.getElementById('makerStatus');

  var current = null;      // the template being edited
  var base = null;         // its image
  var masks = {};          // slot index -> Uint8Array mask over the slot rect
  var photo = null, logo = null;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  /* ----------------------------------------------------------- the cards -- */
  function cardFor(t) {
    var card = el('article', 'mediacard');
    var pic = new Image();
    pic.src = t.thumb; pic.alt = t.title + ' design'; pic.loading = 'lazy'; pic.decoding = 'async';
    var fig = el('div', 'mediacard__img'); fig.appendChild(pic);
    card.appendChild(fig);
    var body = el('div', 'mediacard__body');
    body.appendChild(el('h2', 'mediacard__title', t.title));
    body.appendChild(el('p', 'mediacard__blurb', t.blurb));
    var b = el('button', 'btn btn--primary btn--block', 'Make yours');
    b.type = 'button';
    b.addEventListener('click', function () { open(t, card); });
    body.appendChild(b);
    if (t.canva) {
      var c = el('a', 'btn btn--outline btn--block mediacard__canva', 'Customize in Canva');
      c.href = t.canva; c.target = '_blank'; c.rel = 'noopener';
      body.appendChild(c);
    }
    card.appendChild(body);
    return card;
  }

  function soonCard(a) {
    var card = el('article', 'mediacard mediacard--soon');
    var body = el('div', 'mediacard__body');
    body.appendChild(el('h2', 'mediacard__title', 'Coming soon'));
    body.appendChild(el('p', 'mediacard__blurb', AUDIENCE[a].soon));
    var mail = el('a', 'btn btn--outline btn--block', 'Ask us about it');
    mail.href = 'mailto:battleonimperial@gmail.com?subject=' + encodeURIComponent('Battle on Imperial ' + a + ' graphics');
    body.appendChild(mail);
    card.appendChild(body);
    return card;
  }

  /* ------------------------------------------------------------- tabs -- */
  function showTab(a, push) {
    if (!AUDIENCE[a]) a = 'teams';
    audience = a;
    maker.hidden = true;
    grid.after(maker);   // park the maker outside the grid while it is rebuilt
    grid.innerHTML = '';
    var list = TEMPLATES.filter(function (t) { return t.for === a; });
    if (list.length) list.forEach(function (t) { grid.appendChild(cardFor(t)); });
    else grid.appendChild(soonCard(a));

    document.getElementById('mediaLede').textContent = AUDIENCE[a].lede;
    Array.prototype.forEach.call(document.querySelectorAll('.mediatab'), function (b) {
      b.setAttribute('aria-selected', b.getAttribute('data-for') === a ? 'true' : 'false');
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tips]'), function (n) {
      n.hidden = n.getAttribute('data-tips') !== a;
    });
    if (push && window.history && history.replaceState) {
      history.replaceState(null, '', location.pathname + (a === 'teams' ? '' : '?for=' + a));
    }
  }

  Array.prototype.forEach.call(document.querySelectorAll('.mediatab'), function (b) {
    b.addEventListener('click', function () { showTab(b.getAttribute('data-for'), true); });
  });

  /* ------------------------------------------------------------- loading -- */
  function loadImage(src) {
    return new Promise(function (res, rej) {
      var i = new Image();
      i.onload = function () { res(i); };
      i.onerror = rej;
      i.src = src;
    });
  }

  function slotRect(s) {
    var W = base.naturalWidth, H = base.naturalHeight;
    var x = Math.round(s.x * W), y = Math.round(s.y * H);
    return { x: x, y: y, w: Math.round(s.w * W), h: Math.round(s.h * H) };
  }

  // A placeholder pixel: light and close to grey.
  function isPlaceholder(d, i) {
    var r = d[i], g = d[i + 1], b = d[i + 2];
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return mx > 150 && mx - mn < 24;
  }

  // For a 'fill' slot: flood the placeholder from inside the rectangle, add
  // everything it encloses (the instruction text), then grow by a pixel to
  // swallow the anti-aliased edge.
  function buildMask(rect, data) {
    var w = rect.w, h = rect.h, n = w * h;
    var px = function (x, y) { return ((rect.y + y) * base.naturalWidth + (rect.x + x)) * 4; };
    var region = new Uint8Array(n);

    // Seed: the placeholder pixel nearest the centre.
    var seed = -1;
    for (var r = 0; r < Math.max(w, h) && seed < 0; r += 2) {
      for (var dy = -r; dy <= r && seed < 0; dy += 2) for (var dx = -r; dx <= r && seed < 0; dx += 2) {
        var sx = (w >> 1) + dx, sy = (h >> 1) + dy;
        if (sx >= 0 && sy >= 0 && sx < w && sy < h && isPlaceholder(data, px(sx, sy))) seed = sy * w + sx;
      }
    }
    if (seed < 0) { region.fill(1); return region; }

    var stack = [seed]; region[seed] = 1;
    while (stack.length) {
      var p = stack.pop(), x = p % w, y = (p / w) | 0;
      var nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (var k = 0; k < 4; k++) {
        var q = nb[k];
        if (q < 0 || region[q]) continue;
        if (isPlaceholder(data, px(q % w, (q / w) | 0))) { region[q] = 1; stack.push(q); }
      }
    }

    // Enclosed holes: anything not reachable from the rectangle's border
    // without crossing the region.
    var outside = new Uint8Array(n), q2 = [];
    for (var i = 0; i < w; i++) { q2.push(i, (h - 1) * w + i); }
    for (var j = 0; j < h; j++) { q2.push(j * w, j * w + w - 1); }
    q2.forEach(function (p) { if (!region[p]) outside[p] = 1; });
    var stack2 = q2.filter(function (p) { return outside[p]; });
    while (stack2.length) {
      var p2 = stack2.pop(), x2 = p2 % w, y2 = (p2 / w) | 0;
      var nb2 = [x2 > 0 ? p2 - 1 : -1, x2 < w - 1 ? p2 + 1 : -1, y2 > 0 ? p2 - w : -1, y2 < h - 1 ? p2 + w : -1];
      for (var k2 = 0; k2 < 4; k2++) {
        var q3 = nb2[k2];
        if (q3 < 0 || outside[q3] || region[q3]) continue;
        outside[q3] = 1; stack2.push(q3);
      }
    }
    var mask = new Uint8Array(n);
    for (var m = 0; m < n; m++) mask[m] = outside[m] ? 0 : 1;

    // Grow by one pixel.
    var grown = mask.slice();
    for (var y3 = 0; y3 < h; y3++) for (var x3 = 0; x3 < w; x3++) {
      var p3 = y3 * w + x3;
      if (mask[p3]) continue;
      if ((x3 > 0 && mask[p3 - 1]) || (x3 < w - 1 && mask[p3 + 1]) || (y3 > 0 && mask[p3 - w]) || (y3 < h - 1 && mask[p3 + w])) grown[p3] = 1;
    }
    return grown;
  }

  /* -------------------------------------------------------------- render -- */
  function render() {
    if (!base) return;
    var W = base.naturalWidth, H = base.naturalHeight;
    canvas.width = W; canvas.height = H;
    ctx.drawImage(base, 0, 0);

    current.slots.forEach(function (s, idx) {
      var img = s.kind === 'photo' ? photo : logo;
      if (!img) return;
      var r = slotRect(s);

      // Draw the user's image into an offscreen canvas the size of the slot.
      var off = document.createElement('canvas');
      off.width = r.w; off.height = r.h;
      var o = off.getContext('2d');
      if (s.kind === 'photo') {
        var z = Number(zoom.value) / 100;
        var scale = Math.max(r.w / img.naturalWidth, r.h / img.naturalHeight) * z;
        var dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
        var ox = (r.w - dw) * (Number(posX.value) / 100);
        var oy = (r.h - dh) * (Number(posY.value) / 100);
        o.drawImage(img, ox, oy, dw, dh);
      } else {
        o.fillStyle = '#ffffff';
        o.fillRect(0, 0, r.w, r.h);
        var pad = 0.14;
        var bw = r.w * (1 - 2 * pad), bh = r.h * (1 - 2 * pad);
        var sc = Math.min(bw / img.naturalWidth, bh / img.naturalHeight);
        var lw = img.naturalWidth * sc, lh = img.naturalHeight * sc;
        o.drawImage(img, (r.w - lw) / 2, (r.h - lh) / 2, lw, lh);
      }

      if (s.mode === 'rect') {
        ctx.drawImage(off, r.x, r.y);
        return;
      }
      var mask = masks[idx];
      var dst = ctx.getImageData(r.x, r.y, r.w, r.h);
      var src = o.getImageData(0, 0, r.w, r.h).data;
      for (var p = 0; p < mask.length; p++) {
        if (!mask[p]) continue;
        var i = p * 4;
        dst.data[i] = src[i]; dst.data[i + 1] = src[i + 1]; dst.data[i + 2] = src[i + 2]; dst.data[i + 3] = 255;
      }
      ctx.putImageData(dst, r.x, r.y);
    });

    var need = current.slots.map(function (s) { return s.kind; });
    var missing = [];
    if (need.indexOf('photo') >= 0 && !photo) missing.push('a team photo');
    if (need.indexOf('logo') >= 0 && !logo) missing.push('a logo');
    var ready = !missing.length;
    dlBtn.disabled = !ready;
    shareBtn.disabled = !ready;
    statusEl.textContent = ready ? 'Looks good? Download it and post it.' : 'Add ' + missing.join(' and ') + ' to finish the graphic.';
  }

  /* --------------------------------------------------------------- open -- */
  function open(t, card) {
    current = t; photo = null; logo = null; masks = {};
    photoInput.value = ''; logoInput.value = '';
    zoom.value = 100; posY.value = 50; posX.value = 50;
    var hasPhoto = t.slots.some(function (s) { return s.kind === 'photo'; });
    maker.querySelector('[data-slot="photo"]').hidden = !hasPhoto;
    maker.querySelector('[data-logo-step]').textContent = hasPhoto ? '2.' : '1.';
    var words = AUDIENCE[t.for] || AUDIENCE.teams;
    maker.querySelector('[data-photo-label]').textContent = words.photo;
    maker.querySelector('[data-logo-label]').textContent = words.logo;
    document.getElementById('makerTitle').textContent = t.title;
    card.after(maker);
    maker.hidden = false;
    statusEl.textContent = 'Loading the design…';

    loadImage(t.src).then(function (img) {
      base = img;
      var W = img.naturalWidth, H = img.naturalHeight;
      canvas.width = W; canvas.height = H;
      ctx.drawImage(img, 0, 0);
      var data = ctx.getImageData(0, 0, W, H).data;
      t.slots.forEach(function (s, idx) { if (s.mode === 'fill') masks[idx] = buildMask(slotRect(s), data); });
      render();
      maker.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }).catch(function () { statusEl.textContent = 'The design did not load. Please refresh and try again.'; });
  }

  function readFile(input, cb) {
    var f = input.files && input.files[0];
    if (!f) return;
    var url = URL.createObjectURL(f);
    loadImage(url).then(function (img) { cb(img); render(); })
      .catch(function () { statusEl.textContent = 'That file could not be read as an image.'; });
  }
  photoInput.addEventListener('change', function () { readFile(photoInput, function (i) { photo = i; }); });
  logoInput.addEventListener('change', function () { readFile(logoInput, function (i) { logo = i; }); });
  [zoom, posX, posY].forEach(function (r) { r.addEventListener('input', render); });

  document.getElementById('makerClose').addEventListener('click', function () { maker.hidden = true; });

  /* ------------------------------------------------------ download/share -- */
  function fileName() { return 'battle-on-imperial-' + current.id + '.png'; }

  dlBtn.addEventListener('click', function () {
    canvas.toBlob(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }, 'image/png');
  });

  // On phones, Share hands the image straight to Instagram or Messages.
  if (navigator.canShare && window.File) {
    try {
      if (navigator.canShare({ files: [new File([new Blob()], 'x.png', { type: 'image/png' })] })) shareBtn.hidden = false;
    } catch (e) { /* no file sharing here */ }
  }
  shareBtn.addEventListener('click', function () {
    canvas.toBlob(function (blob) {
      var file = new File([blob], fileName(), { type: 'image/png' });
      navigator.share({ files: [file], title: 'Battle on Imperial', text: (AUDIENCE[current.for] || AUDIENCE.teams).share })
        .catch(function () { /* cancelled */ });
    }, 'image/png');
  });
  /* --------------------------------------------------------------- start -- */
  var startFor = 'teams';
  try { startFor = new URLSearchParams(location.search).get('for') || 'teams'; } catch (e) { /* old browser */ }
  showTab(startFor, false);
})();
