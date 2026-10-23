/* ==========================================================================
   Battle on Imperial — tournament control
   Sign in with a Supabase Auth account, then edit teams, scores and the
   registration list. No dependencies: auth is the GoTrue REST API directly.
   ========================================================================== */
(function () {
  'use strict';

  var cfg = window.BOI_CONFIG || {};
  var URL_BASE = (cfg.SUPABASE_URL || '').replace(/\/+$/, '');
  var ANON = cfg.SUPABASE_ANON_KEY || '';
  var STORE = 'boi.admin.session';

  var loginView = document.getElementById('login');
  var appView = document.getElementById('app');
  var loginForm = document.getElementById('loginForm');
  var loginMsg = document.getElementById('loginMsg');
  var whoami = document.getElementById('whoami');
  var signOutBtn = document.getElementById('signOut');
  var toast = document.getElementById('toast');

  var session = null;
  var role = 'admin';      // narrowed at sign-in from the staff row
  var teams = [];
  var games = [];
  var sponsors = [];
  var invoices = [];

  // EDIT: mirrors the tier CHECK in supabase/sponsors.sql.
  var SPONSOR_TIERS = [
    'Presenting Partner', 'Field Partner', 'Player Experience Partner',
    'Athletic Trainer Partner', 'Coaches Zone Partner', 'Game Sponsor'
  ];

  /* ------------------------------------------------------------- session -- */
  function loadSession() {
    try {
      var raw = localStorage.getItem(STORE);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveSession(s) {
    session = s;
    try {
      if (s) localStorage.setItem(STORE, JSON.stringify(s));
      else localStorage.removeItem(STORE);
    } catch (e) { /* private mode — session lasts this page load only */ }
  }

  function authFetch(path, opts) {
    opts = opts || {};
    var headers = Object.assign({
      apikey: ANON,
      'Content-Type': 'application/json'
    }, opts.headers || {});
    headers.Authorization = 'Bearer ' + (session ? session.access_token : ANON);

    return fetch(URL_BASE + path, Object.assign({}, opts, { headers: headers }))
      .then(function (res) {
        if (res.status === 401 && session && session.refresh_token && !opts._retried) {
          return refresh().then(function (ok) {
            if (!ok) { signOut(); throw new Error('Session expired — please sign in again.'); }
            return authFetch(path, Object.assign({}, opts, { _retried: true }));
          });
        }
        if (!res.ok) {
          return res.text().then(function (b) {
            var msg = b;
            try { msg = JSON.parse(b).message || b; } catch (e) {}
            throw new Error(msg || ('HTTP ' + res.status));
          });
        }
        if (res.status === 204) return null;
        var ct = res.headers.get('content-type') || '';
        return ct.indexOf('json') > -1 ? res.json() : res.text();
      });
  }

  function refresh() {
    return fetch(URL_BASE + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.access_token) return false;
        saveSession(d);
        return true;
      }).catch(function () { return false; });
  }

  function signIn(email, password) {
    return fetch(URL_BASE + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw new Error(d.error_description || d.msg || d.message || 'Sign-in failed.');
        return d;
      });
    });
  }

  function signOut() {
    saveSession(null);
    appView.hidden = true;
    loginView.hidden = false;
    whoami.textContent = '';
  }

  /* --------------------------------------------------------------- toast -- */
  var toastTimer;
  function say(msg, kind) {
    toast.textContent = msg;
    toast.className = 'toast is-shown' + (kind ? ' toast--' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.className = 'toast'; }, kind === 'error' ? 6000 : 2200);
  }

  /* ---------------------------------------------------------------- tabs -- */
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (btn) {
    btn.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
        b.classList.toggle('is-active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });
      Array.prototype.forEach.call(document.querySelectorAll('.panel'), function (p) {
        p.hidden = p.id !== 'panel-' + btn.dataset.panel;
      });
    });
  });

  /* --------------------------------------------------------------- utils -- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function teamName(id) {
    for (var i = 0; i < teams.length; i++) if (teams[i].id === id) return teams[i].name;
    return id;
  }
  function markRow(row, state) {
    row.classList.remove('is-saving', 'is-saved', 'is-failed');
    if (state) row.classList.add('is-' + state);
    if (state === 'saved') setTimeout(function () { row.classList.remove('is-saved'); }, 1600);
  }

  function patch(table, idCol, id, body, row) {
    markRow(row, 'saving');
    return authFetch('/rest/v1/' + table + '?' + idCol + '=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(body)
    }).then(function () {
      markRow(row, 'saved');
      say('Saved');
    }).catch(function (err) {
      markRow(row, 'failed');
      say(err.message || 'Could not save', 'error');
      throw err;
    });
  }

  /* -------------------------------------------------------------- scores -- */
  function renderScores() {
    var wrap = document.getElementById('scores');
    wrap.innerHTML = '';
    if (!games.length) {
      wrap.appendChild(el('p', 'muted', 'No games yet. Add teams, then seed a schedule.'));
      return;
    }

    var slots = {};
    games.forEach(function (g) { (slots[g.slot] = slots[g.slot] || []).push(g); });

    Object.keys(slots).map(Number).sort(function (a, b) { return a - b; }).forEach(function (slot) {
      var list = slots[slot].sort(function (a, b) { return a.field - b.field; });
      var block = el('section', 'adm-slot');
      var head = el('div', 'adm-slot__head');
      head.appendChild(el('h3', null, list[0].time_label));
      block.appendChild(head);

      list.forEach(function (g) {
        var row = el('div', 'adm-game');
        row.dataset.id = g.id;

        var meta = el('div', 'adm-game__meta');
        meta.appendChild(el('span', 'tag tag--field', 'Field ' + g.field));
        meta.appendChild(el('span', 'tag', 'Pool ' + g.pool));
        row.appendChild(meta);

        var line = el('div', 'adm-game__line');

        function sideInput(which, val) {
          var box = el('label', 'adm-side');
          box.appendChild(el('span', 'adm-side__name', teamName(which === 'home' ? g.home_id : g.away_id)));
          var inp = document.createElement('input');
          inp.type = 'number'; inp.min = '0'; inp.max = '99'; inp.inputMode = 'numeric';
          inp.className = 'adm-score';
          inp.value = (val === null || val === undefined) ? '' : val;
          inp.setAttribute('aria-label',
            teamName(which === 'home' ? g.home_id : g.away_id) + ' score');
          inp.addEventListener('change', function () {
            var v = inp.value === '' ? null : Math.max(0, parseInt(inp.value, 10) || 0);
            if (v !== null) inp.value = v;
            var body = {};
            body[which + '_score'] = v;
            patch('games', 'id', g.id, body, row).then(function () {
              g[which + '_score'] = v;
            }).catch(function () {});
          });
          box.appendChild(inp);
          return box;
        }

        line.appendChild(sideInput('home', g.home_score));
        line.appendChild(el('span', 'adm-vs', 'v'));
        line.appendChild(sideInput('away', g.away_score));

        var sel = document.createElement('select');
        sel.className = 'adm-status';
        sel.setAttribute('aria-label', 'Game status');
        [['scheduled', 'Scheduled'], ['in_progress', 'In progress'],
         ['final', 'Final'], ['cancelled', 'Cancelled']].forEach(function (o) {
          var opt = el('option', null, o[1]); opt.value = o[0];
          if (g.status === o[0]) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.addEventListener('change', function () {
          patch('games', 'id', g.id, { status: sel.value }, row).then(function () {
            g.status = sel.value;
            row.classList.toggle('is-final', sel.value === 'final');
          }).catch(function () { sel.value = g.status; });
        });
        line.appendChild(sel);

        if (g.status === 'final') row.classList.add('is-final');
        row.appendChild(line);
        block.appendChild(row);
      });
      wrap.appendChild(block);
    });
  }

  /* --------------------------------------------------------------- teams -- */
  function renderTeams() {
    var body = document.getElementById('teamRows');
    body.innerHTML = '';

    teams.forEach(function (t) {
      var tr = el('tr');
      tr.dataset.id = t.id;

      function cell(field, value, type) {
        var td = el('td');
        var inp;
        if (type === 'select-level' || type === 'select-pool') {
          inp = document.createElement('select');
          var opts = type === 'select-level' ? ['Varsity', 'JV'] : ['A', 'B', 'C', 'D', 'E', 'F'];
          opts.forEach(function (o) {
            var op = el('option', null, o); op.value = o;
            if (value === o) op.selected = true;
            inp.appendChild(op);
          });
        } else {
          inp = document.createElement('input');
          inp.type = type === 'number' ? 'number' : 'text';
          inp.value = value === null || value === undefined ? '' : value;
        }
        inp.setAttribute('aria-label', field);
        inp.addEventListener('change', function () {
          var v = type === 'number' ? (parseInt(inp.value, 10) || 0) : inp.value.trim();
          var b = {}; b[field] = v;
          patch('tournament_teams', 'id', t.id, b, tr).then(function () { t[field] = v; })
            .catch(function () { inp.value = t[field]; });
        });
        td.appendChild(inp);
        return td;
      }

      var idTd = el('td', 'mono', t.id);
      tr.appendChild(idTd);
      tr.appendChild(cell('name', t.name, 'text'));
      tr.appendChild(cell('level', t.level, 'select-level'));
      tr.appendChild(cell('pool', t.pool, 'select-pool'));
      tr.appendChild(cell('seed', t.seed, 'number'));

      var act = el('td');
      var del = el('button', 'linkbtn linkbtn--danger', 'Remove');
      del.addEventListener('click', function () {
        if (!confirm('Remove ' + t.name + '? Any games referencing this team are deleted too.')) return;
        markRow(tr, 'saving');
        authFetch('/rest/v1/tournament_teams?id=eq.' + encodeURIComponent(t.id), { method: 'DELETE' })
          .then(function () { say('Removed ' + t.name); return loadAll(); })
          .catch(function (e) { markRow(tr, 'failed'); say(e.message, 'error'); });
      });
      act.appendChild(del);
      tr.appendChild(act);
      body.appendChild(tr);
    });
  }

  var addForm = document.getElementById('addTeam');
  if (addForm) {
    addForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = addForm.elements.name.value.trim();
      if (!name) return;
      var id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      authFetch('/rest/v1/tournament_teams', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          id: id, name: name,
          level: addForm.elements.level.value,
          pool: addForm.elements.pool.value,
          seed: parseInt(addForm.elements.seed.value, 10) || 0
        })
      }).then(function () {
        addForm.reset();
        say('Added ' + name);
        return loadAll();
      }).catch(function (err) { say(err.message, 'error'); });
    });
  }

  /* ------------------------------------------------------------ sponsors -- */
  // Logos go in the public sponsor-logos bucket (supabase/sponsors.sql) and
  // the row stores the public URL. The file name carries the sponsor id and a
  // timestamp, so replacing a logo never serves a cached old one.
  function uploadLogo(file, sponsorId) {
    var ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    var path = sponsorId + '-' + Date.now() + '.' + ext;
    return authFetch('/storage/v1/object/sponsor-logos/' + path, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' },
      body: file
    }).then(function () {
      return URL_BASE + '/storage/v1/object/public/sponsor-logos/' + path;
    });
  }

  function renderSponsors() {
    var body = document.getElementById('sponsorRows');
    if (!body) return;
    body.innerHTML = '';

    if (!sponsors.length) {
      var tr0 = el('tr');
      var td0 = el('td', 'muted', 'No sponsors yet. Add the first one above and it appears on the site.');
      td0.colSpan = 8;
      tr0.appendChild(td0); body.appendChild(tr0);
      return;
    }

    sponsors.forEach(function (s) {
      var tr = el('tr');
      tr.dataset.id = s.id;

      function save(field, value) {
        var b = {}; b[field] = value;
        return patch('sponsors', 'id', s.id, b, tr).then(function () { s[field] = value; });
      }

      function cell(field, type) {
        var td = el('td');
        var inp;
        if (type === 'tier') {
          inp = document.createElement('select');
          SPONSOR_TIERS.forEach(function (o) {
            var op = el('option', null, o); op.value = o;
            if (s.tier === o) op.selected = true;
            inp.appendChild(op);
          });
        } else if (type === 'checkbox') {
          inp = document.createElement('input');
          inp.type = 'checkbox';
          inp.checked = !!s[field];
        } else {
          inp = document.createElement('input');
          inp.type = type === 'number' ? 'number' : (type === 'url' ? 'url' : 'text');
          inp.value = s[field] === null || s[field] === undefined ? '' : s[field];
          if (type === 'url') inp.placeholder = 'https://';
        }
        inp.setAttribute('aria-label', field + ' for ' + s.name);
        inp.addEventListener('change', function () {
          var v;
          if (type === 'checkbox') v = inp.checked;
          else if (type === 'number') v = parseInt(inp.value, 10) || 0;
          else v = inp.value.trim() || null;
          save(field, v).catch(function () {
            if (type === 'checkbox') inp.checked = !!s[field];
            else inp.value = s[field] === null || s[field] === undefined ? '' : s[field];
          });
        });
        td.appendChild(inp);
        return td;
      }

      // Logo: a preview, and a file input to upload or replace it.
      var logoTd = el('td', 'logocell');
      var preview = el('span', 'logocell__preview');
      if (s.logo_url) {
        var img = new Image();
        img.src = s.logo_url; img.alt = ''; preview.appendChild(img);
      } else {
        preview.appendChild(el('span', 'muted', 'none'));
      }
      logoTd.appendChild(preview);
      var file = document.createElement('input');
      file.type = 'file';
      file.accept = 'image/png,image/jpeg,image/webp,image/svg+xml';
      file.setAttribute('aria-label', 'Logo file for ' + s.name);
      file.addEventListener('change', function () {
        if (!file.files || !file.files[0]) return;
        markRow(tr, 'saving');
        uploadLogo(file.files[0], s.id)
          .then(function (publicUrl) { return save('logo_url', publicUrl); })
          .then(function () { renderSponsors(); })
          .catch(function (e) { markRow(tr, 'failed'); say(e.message || 'Upload failed', 'error'); });
      });
      logoTd.appendChild(file);
      tr.appendChild(logoTd);

      tr.appendChild(cell('name', 'text'));
      tr.appendChild(cell('tier', 'tier'));
      tr.appendChild(cell('website', 'url'));
      tr.appendChild(cell('blurb', 'text'));
      tr.appendChild(cell('sort', 'number'));
      tr.appendChild(cell('visible', 'checkbox'));

      var act = el('td', 'nowrap');
      var del = el('button', 'linkbtn linkbtn--danger', 'Remove');
      del.type = 'button';
      del.addEventListener('click', function () {
        if (!confirm('Remove ' + s.name + ' from the site? To hide them temporarily, untick Visible instead.')) return;
        markRow(tr, 'saving');
        authFetch('/rest/v1/sponsors?id=eq.' + encodeURIComponent(s.id), { method: 'DELETE' })
          .then(function () { say('Removed ' + s.name); return loadAll(); })
          .catch(function (e) { markRow(tr, 'failed'); say(e.message, 'error'); });
      });
      act.appendChild(del);
      tr.appendChild(act);
      body.appendChild(tr);
    });
  }

  var addSponsorForm = document.getElementById('addSponsor');
  if (addSponsorForm) {
    addSponsorForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = addSponsorForm.elements.name.value.trim();
      if (!name) return;
      var website = addSponsorForm.elements.website.value.trim() || null;
      var logoInput = addSponsorForm.elements.logo;
      var logoFile = logoInput && logoInput.files && logoInput.files[0];
      var btn = addSponsorForm.querySelector('button[type=submit]');
      btn.disabled = true;

      // Create the row first so the logo file can be named after its id.
      authFetch('/rest/v1/sponsors', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ name: name, tier: addSponsorForm.elements.tier.value, website: website })
      }).then(function (rows) {
        var created = rows && rows[0];
        if (!logoFile || !created) return null;
        return uploadLogo(logoFile, created.id).then(function (publicUrl) {
          return authFetch('/rest/v1/sponsors?id=eq.' + encodeURIComponent(created.id), {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({ logo_url: publicUrl })
          });
        });
      }).then(function () {
        addSponsorForm.reset();
        say('Added ' + name);
        return loadAll();
      }).catch(function (err) {
        say(err.message, 'error');
      }).then(function () { btn.disabled = false; });
    });
  }

  /* --------------------------------------------------- sponsor inquiries -- */
  function renderInquiries(rows) {
    var body = document.getElementById('inqRows');
    var count = document.getElementById('inqCount');
    if (!body) return;
    body.innerHTML = '';
    if (count) count.textContent = rows.length + (rows.length === 1 ? ' inquiry' : ' inquiries');

    if (!rows.length) {
      var tr0 = el('tr');
      var td0 = el('td', 'muted', 'No inquiries yet.');
      td0.colSpan = 8;
      tr0.appendChild(td0); body.appendChild(tr0);
      return;
    }

    rows.forEach(function (r) {
      var tr = el('tr');
      tr.appendChild(el('td', 'nowrap', new Date(r.created_at).toLocaleDateString(undefined,
        { month: 'short', day: 'numeric' })));

      var biz = el('td', 'strong');
      if (r.website) {
        var w = el('a', null, r.business);
        w.href = /^https?:\/\//i.test(r.website) ? r.website : 'https://' + r.website;
        w.target = '_blank'; w.rel = 'noopener';
        biz.appendChild(w);
      } else {
        biz.textContent = r.business;
      }
      tr.appendChild(biz);

      tr.appendChild(el('td', null, r.contact_name));

      var contact = el('td');
      var a = el('a', null, r.email);
      a.href = 'mailto:' + r.email;
      contact.appendChild(a);
      if (r.phone) { contact.appendChild(document.createElement('br')); contact.appendChild(el('span', 'muted', r.phone)); }
      if (r.consent === false) {
        contact.appendChild(document.createElement('br'));
        contact.appendChild(el('span', 'flag', 'Did not tick "OK to contact"'));
      }
      tr.appendChild(contact);

      tr.appendChild(el('td', 'nowrap', r.tier || '—'));
      tr.appendChild(el('td', 'notes', r.message || '—'));

      var st = el('td');
      var sel = document.createElement('select');
      sel.setAttribute('aria-label', 'Status for ' + r.business);
      ['new', 'contacted', 'confirmed', 'declined'].forEach(function (s) {
        var o = el('option', null, s.charAt(0).toUpperCase() + s.slice(1));
        o.value = s;
        if (r.status === s) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () {
        patch('sponsor_inquiries', 'id', r.id, { status: sel.value }, tr)
          .then(function () { r.status = sel.value; })
          .catch(function () { sel.value = r.status; });
      });
      st.appendChild(sel);
      tr.appendChild(st);

      // Spam and test inquiries can go; a real one is better marked Declined,
      // so the history of who asked stays.
      var act = el('td', 'nowrap');
      invoiceControls(act, r, 'sponsor_inquiry_id', invoiceFromSponsor);
      var del = el('button', 'linkbtn linkbtn--danger', 'Remove');
      del.type = 'button';
      del.addEventListener('click', function () {
        if (!confirm('Remove the inquiry from ' + r.business + '? This cannot be undone. ' +
                     'For a real inquiry you are turning down, set it to Declined instead.')) return;
        markRow(tr, 'saving');
        authFetch('/rest/v1/sponsor_inquiries?id=eq.' + encodeURIComponent(r.id), { method: 'DELETE' })
          .then(function () { say('Removed ' + r.business); return loadAll(); })
          .catch(function (e) { markRow(tr, 'failed'); say(e.message, 'error'); });
      });
      act.appendChild(del);
      tr.appendChild(act);

      body.appendChild(tr);
    });
  }

  /* ------------------------------------------------------------ invoices -- */
  // EDIT: entry pricing and payment terms, as on the site (index.html price
  // panel and Key Dates).
  var PRICE = {
    early: { Varsity: 650, JV: 500, bundleCredit: 50 },     // $1,100 for both
    regular: { Varsity: 850, JV: 750, bundleCredit: 100 }   // $1,500 for both
  };
  var EARLY_BIRD_ENDS = new Date('2026-12-01T00:00:00-08:00');
  var LATE_TERMS_FROM = new Date('2026-12-16T00:00:00-08:00');   // registered after Dec 15
  var LINE_TEXT = {
    Varsity: 'Varsity team registration — three games guaranteed',
    JV: 'JV team registration — two to three games'
  };

  function pacificDate(d) {
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });   // YYYY-MM-DD
  }
  function addDays(iso, n) {
    var p = iso.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10);
  }
  function cents(v) { var n = Number(v); return isFinite(n) ? Math.round(n * 100) / 100 : 0; }
  function usd(v) {
    return '$' + cents(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function mdyShort(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? Number(m[2]) + '/' + Number(m[3]) + '/' + m[1].slice(2) : '—';
  }

  // A draft invoice for a registration: early bird by registration date, the
  // Varsity + JV bundle as a credit, and due 30 days after registering (10 if
  // registered after December 15) — never sooner than a week from today.
  function invoiceFromRegistration(r) {
    var created = new Date(r.created_at);
    var p = created < EARLY_BIRD_ENDS ? PRICE.early : PRICE.regular;
    var levels = [r.team1_level, r.team2_level].filter(Boolean);
    if (!levels.length && (r.level === 'Varsity' || r.level === 'JV')) levels = [r.level];
    var v = levels.filter(function (l) { return l === 'Varsity'; }).length;
    var j = levels.filter(function (l) { return l === 'JV'; }).length;

    var lines = [];
    if (v) lines.push({ description: LINE_TEXT.Varsity, qty: v, unit_price: p.Varsity, discount: 0 });
    if (j) lines.push({ description: LINE_TEXT.JV, qty: j, unit_price: p.JV, discount: 0 });
    if (!lines.length) lines.push({ description: 'Team registration', qty: 1, unit_price: 0, discount: 0 });

    var pairs = Math.min(v, j);
    var regDay = pacificDate(created);
    var due = addDays(regDay, created >= LATE_TERMS_FROM ? 10 : 30);
    var floor = addDays(pacificDate(new Date()), 7);
    if (due < floor) due = floor;

    var name = r.contact || [r.contact_first, r.contact_last].filter(Boolean).join(' ');
    return {
      registration_id: r.id,
      bill_school: r.school,
      bill_program: r.school + ' ' + (v && j ? 'Varsity & JV' : levels.join(' & ') || ''),
      bill_contact: name || null,
      bill_email: r.email || null,
      lines: lines,
      credit: pairs ? pairs * p.bundleCredit : 0,
      credit_label: pairs ? 'Varsity + JV bundle' + (p === PRICE.early ? ' (early bird)' : '') : null,
      issued_on: pacificDate(new Date()),
      due_on: due,
      notes: null
    };
  }

  // EDIT: sponsor packages and vendor booths, as on sponsors.html and
  // vendors.html.
  var SPONSOR_PRICE = {
    'Presenting Partner': 2500, 'Field Partner': 1250, 'Player Experience Partner': 1000,
    'Athletic Trainer Partner': 750, 'Coaches Zone Partner': 500, 'Game Sponsor': 250
  };
  var BOOTH_PRICE = { Merchant: 200, Food: 300 };

  // Sponsors and vendors: invoiced 30 days out from today, and never later
  // than two weeks before the tournament so signage and booths can be planned.
  function dueNet30() {
    var due = addDays(pacificDate(new Date()), 30);
    return due > '2027-02-27' ? '2027-02-27' : due;
  }

  function invoiceFromSponsor(q) {
    var price = SPONSOR_PRICE[q.tier];
    return {
      kind: 'sponsor',
      sponsor_inquiry_id: q.id,
      bill_school: q.business,
      bill_program: price ? q.tier + ' sponsorship' : 'Sponsorship',
      bill_contact: q.contact_name || null,
      bill_email: q.email || null,
      lines: [{
        description: price ? q.tier + ' sponsorship — Battle on Imperial 2027' : 'Sponsorship — Battle on Imperial 2027 (' + (q.tier || 'package to confirm') + ')',
        qty: 1, unit_price: price || 0, discount: 0
      }],
      credit: 0, credit_label: null,
      issued_on: pacificDate(new Date()),
      due_on: dueNet30(),
      notes: null
    };
  }

  function invoiceFromVendor(v) {
    var n = Math.max(1, Math.min(3, Number(v.booths) || 1));
    var food = v.booth_type === 'Food';
    return {
      kind: 'vendor',
      vendor_registration_id: v.id,
      bill_school: v.business,
      bill_program: (food ? 'Food vendor' : 'Merchant') + ' booth' + (n > 1 ? 's' : '') + ' × ' + n,
      bill_contact: v.contact_name || null,
      bill_email: v.email || null,
      lines: [{
        description: (food ? 'Food vendor' : 'Merchant vendor') + ' booth, 10′ × 10′ — March 13, 2027',
        qty: n, unit_price: BOOTH_PRICE[v.booth_type] || 0, discount: 0
      }],
      credit: 0, credit_label: null,
      issued_on: pacificDate(new Date()),
      due_on: dueNet30(),
      notes: food ? 'Food vendors: bring your business licence and Orange County Health Department permits on the day.' : null
    };
  }

  var invForm = document.getElementById('invEditor');
  var invLinesBody = document.getElementById('invLines');
  var editing = null;   // the invoice being edited (has .id once saved)

  function lineRow(l) {
    var tr = el('tr');
    [['description', 'text', l.description || ''], ['qty', 'number', l.qty === undefined ? 1 : l.qty],
     ['unit_price', 'number', l.unit_price || 0], ['discount', 'number', l.discount || 0]].forEach(function (c) {
      var td = el('td');
      var inp = document.createElement('input');
      inp.type = c[1]; inp.value = c[2]; inp.dataset.k = c[0];
      if (c[1] === 'number') { inp.min = '0'; inp.step = c[0] === 'qty' ? '1' : '0.01'; }
      inp.setAttribute('aria-label', c[0].replace('_', ' '));
      inp.addEventListener('input', updateInvTotals);
      td.appendChild(inp);
      tr.appendChild(td);
    });
    tr.appendChild(el('td', 'nowrap invlines__total', '$0.00'));
    var rm = el('td');
    var x = el('button', 'linkbtn linkbtn--danger', 'Remove');
    x.type = 'button';
    x.addEventListener('click', function () { tr.remove(); updateInvTotals(); });
    rm.appendChild(x);
    tr.appendChild(rm);
    return tr;
  }

  function readLines() {
    return Array.prototype.map.call(invLinesBody.querySelectorAll('tr'), function (tr) {
      var g = function (k) { return tr.querySelector('[data-k="' + k + '"]').value; };
      return { description: g('description').trim(), qty: cents(g('qty')), unit_price: cents(g('unit_price')), discount: cents(g('discount')) };
    }).filter(function (l) { return l.description || l.unit_price; });
  }

  function updateInvTotals() {
    var sub = 0;
    Array.prototype.forEach.call(invLinesBody.querySelectorAll('tr'), function (tr) {
      var g = function (k) { return cents(tr.querySelector('[data-k="' + k + '"]').value); };
      var t = cents(g('qty') * g('unit_price') - g('discount'));
      tr.querySelector('.invlines__total').textContent = usd(t);
      sub += t;
    });
    var credit = cents(invForm.elements.credit.value);
    document.getElementById('invSubtotal').textContent = usd(sub);
    document.getElementById('invCredit').textContent = '−' + usd(credit);
    document.getElementById('invTotal').textContent = usd(sub - credit);
  }

  function openInvoiceEditor(inv) {
    editing = inv;
    var tab = document.querySelector('.tab[data-panel="invoices"]');
    if (tab) tab.click();
    ['bill_school', 'bill_program', 'bill_contact', 'bill_email', 'bill_address', 'po_ref',
     'issued_on', 'due_on', 'notes', 'credit_label'].forEach(function (f) {
      invForm.elements[f].value = inv[f] === null || inv[f] === undefined ? '' : inv[f];
    });
    invForm.elements.credit.value = inv.credit || 0;
    invLinesBody.innerHTML = '';
    (inv.lines && inv.lines.length ? inv.lines : [{}]).forEach(function (l) { invLinesBody.appendChild(lineRow(l)); });
    document.getElementById('invEditorTitle').textContent = inv.id
      ? 'Invoice ' + inv.invoice_no + (inv.status === 'draft' ? ' (draft)' : '')
      : 'New invoice' + (inv.registration_id ? ' — from registration'
          : inv.sponsor_inquiry_id ? ' — from sponsor inquiry'
          : inv.vendor_registration_id ? ' — from vendor request' : '');
    var locked = inv.id && (inv.status === 'paid' || inv.status === 'void');
    Array.prototype.forEach.call(invForm.querySelectorAll('input, textarea, button'), function (n) {
      if (n.id !== 'invCancel') n.disabled = !!locked;
    });
    document.getElementById('invEditorNote').textContent = locked
      ? 'This invoice is ' + inv.status + ' and can no longer be edited.'
      : inv.id && inv.status !== 'draft' ? 'Already sent: after saving, use Resend so the school has the latest version.' : '';
    invForm.hidden = false;
    updateInvTotals();
    invForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.getElementById('invNew').addEventListener('click', function () {
    var today = pacificDate(new Date());
    openInvoiceEditor({ issued_on: today, due_on: addDays(today, 30), lines: [{}], credit: 0 });
  });
  document.getElementById('invCancel').addEventListener('click', function () { invForm.hidden = true; editing = null; });
  document.getElementById('invAddLine').addEventListener('click', function () {
    invLinesBody.appendChild(lineRow({})); updateInvTotals();
  });
  invForm.elements.credit.addEventListener('input', updateInvTotals);

  invForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!invForm.checkValidity()) { invForm.reportValidity(); return; }
    var lines = readLines();
    if (!lines.length) { say('Add at least one line item.', 'error'); return; }
    var f = invForm.elements;
    var blank = function (v) { v = v.trim(); return v ? v : null; };
    var body = {
      bill_school: f.bill_school.value.trim(), bill_program: blank(f.bill_program.value),
      bill_contact: blank(f.bill_contact.value), bill_email: blank(f.bill_email.value),
      bill_address: blank(f.bill_address.value), po_ref: blank(f.po_ref.value),
      issued_on: f.issued_on.value, due_on: f.due_on.value, notes: blank(f.notes.value),
      lines: lines, credit: cents(f.credit.value), credit_label: blank(f.credit_label.value)
    };
    var req = editing && editing.id
      ? authFetch('/rest/v1/invoices?id=eq.' + encodeURIComponent(editing.id), {
          method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) })
      : authFetch('/rest/v1/invoices', {
          method: 'POST', headers: { Prefer: 'return=representation' },
          body: JSON.stringify(Object.assign(invoiceLinks(editing), body)) });
    var btn = document.getElementById('invSave');
    btn.disabled = true;
    req.then(function (rows) {
      var saved = rows && rows[0];
      say('Saved ' + (saved ? saved.invoice_no : 'invoice'));
      invForm.hidden = true; editing = null;
      return loadAll();
    }).catch(function (err) { say(err.message, 'error'); })
      .then(function () { btn.disabled = false; });
  });

  // Only the link fields that apply, so a team invoice never depends on the
  // sponsor/vendor columns (supabase/invoices-sponsors-vendors.sql).
  function invoiceLinks(e) {
    var out = { registration_id: e && e.registration_id || null };
    if (e && e.kind && e.kind !== 'team') out.kind = e.kind;
    if (e && e.sponsor_inquiry_id) out.sponsor_inquiry_id = e.sponsor_inquiry_id;
    if (e && e.vendor_registration_id) out.vendor_registration_id = e.vendor_registration_id;
    return out;
  }

  function invoiceUrl(i) { return 'invoice.html?t=' + encodeURIComponent(i.token); }

  function sendInvoice(i) {
    if (!i.bill_email) { say('Add a billing email before sending.', 'error'); return; }
    var again = i.send_count > 0;
    if (!confirm((again ? 'Resend' : 'Send') + ' invoice ' + i.invoice_no + ' to ' + i.bill_email +
                 '? The treasurer is copied.')) return;
    authFetch('/rest/v1/invoices?id=eq.' + encodeURIComponent(i.id), {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: i.status === 'draft' ? 'sent' : i.status,
        send_count: (i.send_count || 0) + 1,
        sent_at: new Date().toISOString(),
        last_sent_to: i.bill_email
      })
    }).then(function () { return markContacted(i); })
      .then(function () { say((again ? 'Resent ' : 'Sent ') + i.invoice_no); return loadAll(); })
      .catch(function (e) { say(e.message, 'error'); });
  }

  // Sending an invoice moves the request it came from from New to Contacted;
  // payment then confirms it (supabase/auto-confirm.sql). Only New moves, so a
  // resend never pulls a Confirmed or Declined entry back.
  function markContacted(i) {
    var link = i.registration_id ? ['registrations', i.registration_id]
      : i.sponsor_inquiry_id ? ['sponsor_inquiries', i.sponsor_inquiry_id]
      : i.vendor_registration_id ? ['vendor_registrations', i.vendor_registration_id]
      : null;
    if (!link) return Promise.resolve();
    return authFetch('/rest/v1/' + link[0] + '?id=eq.' + encodeURIComponent(link[1]) + '&status=eq.new', {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'contacted' })
    });
  }

  // Inline form under the row: amount (defaults to the balance), date, method,
  // reference. Status follows the balance.
  function paymentForm(i, tr) {
    var next = tr.nextSibling;
    if (next && next.classList && next.classList.contains('detailrow')) { next.remove(); return; }
    var row = el('tr', 'detailrow');
    var td = el('td'); td.colSpan = 9;
    var box = el('div', 'invpay');
    var mk = function (label, type, value, attrs) {
      var l = el('label', null, label);
      var inp = document.createElement(type === 'select' ? 'select' : 'input');
      if (type === 'select') {
        ['Zelle', 'Check', 'Bank transfer', 'Card', 'Cash', 'Other'].forEach(function (o) { var op = el('option', null, o); inp.appendChild(op); });
      } else { inp.type = type; inp.value = value; }
      Object.keys(attrs || {}).forEach(function (k) { inp.setAttribute(k, attrs[k]); });
      l.appendChild(inp); box.appendChild(l);
      return inp;
    };
    var amt = mk('Amount ($)', 'number', Math.max(0, cents(i.balance)), { min: '0.01', step: '0.01' });
    var date = mk('Date', 'date', pacificDate(new Date()));
    var method = mk('Method', 'select');
    var ref = mk('Reference (check no., Zelle memo)', 'text', '', { maxlength: '80' });
    var save = el('button', 'btn btn--dark', 'Record payment');
    save.type = 'button';
    save.addEventListener('click', function () {
      var a = cents(amt.value);
      if (!(a > 0)) { say('Enter the amount received.', 'error'); return; }
      var pays = (i.payments || []).concat([{ date: date.value, amount: a, method: method.value, ref: ref.value.trim() || null }]);
      var balance = cents(cents(i.subtotal) - cents(i.credit) - cents(i.amount_paid) - a);
      authFetch('/rest/v1/invoices?id=eq.' + encodeURIComponent(i.id), {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ payments: pays, status: balance <= 0 ? 'paid' : 'partial' })
      }).then(function () { say('Recorded ' + usd(a) + ' on ' + i.invoice_no); return loadAll(); })
        .catch(function (e) { say(e.message, 'error'); });
    });
    box.appendChild(save);
    td.appendChild(box); row.appendChild(td);
    tr.parentNode.insertBefore(row, tr.nextSibling);
    amt.focus();
  }

  var INV_STATUS = { draft: 'Draft', sent: 'Sent', partial: 'Partial', paid: 'Paid', void: 'Void' };

  // What the Registrations tab shows for payment, derived from the invoice so
  // it can never disagree with it: Not invoiced, Draft, Invoiced, Overdue,
  // Part-paid, Paid.
  function invoiceFor(regId, field) {
    field = field || 'registration_id';
    return invoices.filter(function (i) { return i[field] === regId && i.status !== 'void'; })[0] || null;
  }

  // The Invoice button and payment chip for a sponsor or vendor row.
  function invoiceControls(cell, row, field, make) {
    var existing = invoiceFor(row.id, field);
    var b = el('button', 'linkbtn', existing ? existing.invoice_no : 'Invoice');
    b.type = 'button';
    b.title = existing ? 'Open this invoice' : 'Create an invoice from this request';
    b.addEventListener('click', function () { openInvoiceEditor(existing || make(row)); });
    cell.appendChild(b);
    var ps = payState(existing);
    var chip = el('span', 'paychip paychip--' + ps.key, ps.label);
    if (existing && ps.key !== 'paid' && ps.key !== 'draft') chip.title = usd(existing.balance) + ' due ' + mdyShort(existing.due_on);
    cell.appendChild(document.createElement('br'));
    cell.appendChild(chip);
    cell.appendChild(document.createElement('br'));
  }
  function payState(inv) {
    if (!inv) return { key: 'none', label: 'Not invoiced' };
    if (inv.status === 'draft') return { key: 'draft', label: 'Draft invoice' };
    if (inv.status === 'paid' || cents(inv.balance) <= 0) return { key: 'paid', label: 'Paid' };
    var overdue = inv.due_on && inv.due_on < pacificDate(new Date());
    if (inv.status === 'partial') return { key: overdue ? 'overdue' : 'partial', label: overdue ? 'Part-paid · overdue' : 'Part-paid' };
    return { key: overdue ? 'overdue' : 'invoiced', label: overdue ? 'Overdue' : 'Invoiced' };
  }

  function renderInvoices(rows) {
    invoices = rows;
    var body = document.getElementById('invRows');
    var count = document.getElementById('invCount');
    if (!body) return;
    body.innerHTML = '';
    var open = rows.filter(function (i) { return i.status === 'sent' || i.status === 'partial'; });
    var outstanding = open.reduce(function (s, i) { return s + cents(i.balance); }, 0);
    if (count) count.textContent = rows.length + (rows.length === 1 ? ' invoice' : ' invoices') +
      (open.length ? ' · ' + usd(outstanding) + ' outstanding' : '');

    if (!rows.length) {
      var tr0 = el('tr'); var td0 = el('td', 'muted', 'No invoices yet.'); td0.colSpan = 9;
      tr0.appendChild(td0); body.appendChild(tr0); return;
    }

    var today = pacificDate(new Date());
    rows.forEach(function (i) {
      var tr = el('tr');
      if (i.status === 'void') tr.className = 'is-cancelled';
      tr.appendChild(el('td', 'mono', i.invoice_no));
      tr.appendChild(el('td', 'nowrap', mdyShort(i.issued_on)));
      var who = el('td', 'strong', i.bill_school);
      if (i.kind && i.kind !== 'team') who.appendChild(el('span', 'kindtag', i.kind === 'sponsor' ? 'Sponsor' : 'Vendor'));
      if (i.bill_program) { who.appendChild(document.createElement('br')); who.appendChild(el('span', 'muted', i.bill_program)); }
      tr.appendChild(who);
      tr.appendChild(el('td', 'nowrap', usd(cents(i.subtotal) - cents(i.credit))));
      tr.appendChild(el('td', 'nowrap', usd(i.amount_paid)));
      tr.appendChild(el('td', 'nowrap strong', usd(i.balance)));
      var overdue = (i.status === 'sent' || i.status === 'partial') && i.due_on && i.due_on < today;
      tr.appendChild(el('td', 'nowrap' + (overdue ? ' flag' : ''), mdyShort(i.due_on) + (overdue ? ' · overdue' : '')));
      var st = el('td', 'nowrap', INV_STATUS[i.status] || i.status);
      if (i.sent_at) { st.appendChild(document.createElement('br')); st.appendChild(el('span', 'muted', 'sent ' + mdyShort(pacificDate(new Date(i.sent_at))) + (i.send_count > 1 ? ' ×' + i.send_count : ''))); }
      tr.appendChild(st);

      var act = el('td', 'nowrap invactions');
      var add = function (label, fn, cls) {
        var b = el('button', 'linkbtn' + (cls ? ' ' + cls : ''), label);
        b.type = 'button'; b.addEventListener('click', fn); act.appendChild(b);
      };
      add('View', function () { window.open(invoiceUrl(i), '_blank', 'noopener'); });
      if (i.status !== 'void' && i.status !== 'paid') add('Edit', function () { openInvoiceEditor(i); });
      if (i.status !== 'void') add(i.send_count ? 'Resend' : 'Send', function () { sendInvoice(i); });
      if (i.status !== 'void' && i.status !== 'draft' && cents(i.balance) > 0) add('Payment', function () { paymentForm(i, tr); });
      if (i.status !== 'void' && !cents(i.amount_paid)) add('Void', function () {
        if (!confirm('Void invoice ' + i.invoice_no + '? It stays on record, marked void.')) return;
        authFetch('/rest/v1/invoices?id=eq.' + encodeURIComponent(i.id), {
          method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'void' })
        }).then(function () { say('Voided ' + i.invoice_no); return loadAll(); })
          .catch(function (e) { say(e.message, 'error'); });
      }, 'linkbtn--danger');
      tr.appendChild(act);
      body.appendChild(tr);
    });
  }

  /* -------------------------------------------------------- merch orders -- */
  // EDIT: mirrors PRODUCTS in assets/merch.js.
  var MERCH = {
    tee: 'T-Shirt', hoodie: 'Hoodie', pants: 'Flannel PJ Pants', lanyard: 'Lanyard', pin: 'Tournament Pin'
  };
  var MERCH_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

  function money(n) { return '$' + Number(n || 0).toLocaleString('en-US'); }

  function itemText(i) {
    return (i.qty || 0) + ' × ' + (MERCH[i.id] || i.id) + (i.size ? ' (' + i.size + ')' : '');
  }

  // Quantities per product and size across open and paid orders — the number
  // to hand the printer. Cancelled orders are left out; picked-up ones count.
  function renderTally(rows) {
    var box = document.getElementById('merchTally');
    if (!box) return;
    box.innerHTML = '';
    var counts = {};
    rows.forEach(function (o) {
      if (o.status === 'cancelled') return;
      (o.items || []).forEach(function (i) {
        var k = i.id + '|' + (i.size || '');
        counts[k] = (counts[k] || 0) + (i.qty || 0);
      });
    });
    if (!Object.keys(counts).length) { box.hidden = true; return; }
    box.hidden = false;
    Object.keys(MERCH).forEach(function (id) {
      var sizes = MERCH_SIZES.filter(function (s) { return counts[id + '|' + s]; });
      var single = counts[id + '|'] || 0;
      if (!sizes.length && !single) return;
      var card = el('div', 'tally__item');
      card.appendChild(el('strong', null, MERCH[id]));
      var list = el('div', 'tally__sizes');
      if (single) list.appendChild(el('span', null, String(single)));
      sizes.forEach(function (s) { list.appendChild(el('span', null, s + ' × ' + counts[id + '|' + s])); });
      card.appendChild(list);
      box.appendChild(card);
    });
  }

  function renderMerch(rows) {
    var body = document.getElementById('merchRows');
    var count = document.getElementById('merchCount');
    if (!body) return;
    body.innerHTML = '';
    renderTally(rows);
    var open = rows.filter(function (o) { return o.status === 'new'; }).length;
    if (count) count.textContent = rows.length + (rows.length === 1 ? ' order' : ' orders') + (open ? ', ' + open + ' awaiting payment' : '');

    if (!rows.length) {
      var tr0 = el('tr');
      var td0 = el('td', 'muted', 'No pre-orders yet.');
      td0.colSpan = 9;
      tr0.appendChild(td0); body.appendChild(tr0);
      return;
    }

    rows.forEach(function (o) {
      var tr = el('tr');
      if (o.status === 'cancelled') tr.className = 'is-cancelled';

      tr.appendChild(el('td', 'mono', o.order_no));
      tr.appendChild(el('td', 'nowrap', new Date(o.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })));

      var who = el('td', 'strong', o.name);
      if (o.school) { who.appendChild(document.createElement('br')); who.appendChild(el('span', 'muted', o.school)); }
      tr.appendChild(who);

      var contact = el('td');
      var a = el('a', null, o.email); a.href = 'mailto:' + o.email; contact.appendChild(a);
      if (o.phone) { contact.appendChild(document.createElement('br')); contact.appendChild(el('span', 'muted', o.phone)); }
      tr.appendChild(contact);

      var items = el('td', 'notes');
      (o.items || []).forEach(function (i, idx) {
        if (idx) items.appendChild(document.createElement('br'));
        items.appendChild(document.createTextNode(itemText(i)));
      });
      tr.appendChild(items);

      tr.appendChild(el('td', 'strong nowrap', money(o.total)));
      tr.appendChild(el('td', 'notes', o.notes || '—'));

      var st = el('td');
      var sel = document.createElement('select');
      sel.setAttribute('aria-label', 'Status for order ' + o.order_no);
      [['new', 'New'], ['paid', 'Paid'], ['picked_up', 'Picked up'], ['cancelled', 'Cancelled']].forEach(function (s) {
        var op = el('option', null, s[1]); op.value = s[0];
        if (o.status === s[0]) op.selected = true;
        sel.appendChild(op);
      });
      sel.addEventListener('change', function () {
        var b = { status: sel.value };
        if (sel.value === 'paid' && !o.paid_at) b.paid_at = new Date().toISOString();
        patch('merch_orders', 'id', o.id, b, tr)
          .then(function () { o.status = sel.value; if (b.paid_at) o.paid_at = b.paid_at; renderTally(rows); })
          .catch(function () { sel.value = o.status; });
      });
      st.appendChild(sel);
      if (o.paid_at) {
        st.appendChild(document.createElement('br'));
        st.appendChild(el('span', 'muted', 'paid ' + new Date(o.paid_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })));
      }
      tr.appendChild(st);

      var act = el('td', 'nowrap');
      var del = el('button', 'linkbtn linkbtn--danger', 'Remove');
      del.type = 'button';
      del.addEventListener('click', function () {
        if (!confirm('Remove order ' + o.order_no + ' (' + o.name + ')? This cannot be undone. ' +
                     'For an order that was never paid, Cancelled keeps the record.')) return;
        markRow(tr, 'saving');
        authFetch('/rest/v1/merch_orders?id=eq.' + encodeURIComponent(o.id), { method: 'DELETE' })
          .then(function () { say('Removed ' + o.order_no); return loadAll(); })
          .catch(function (e) { markRow(tr, 'failed'); say(e.message, 'error'); });
      });
      act.appendChild(del);
      tr.appendChild(act);

      body.appendChild(tr);
    });
  }

  /* ----------------------------------------------------- confirmed teams -- */
  function renderConfirmed(rows) {
    var body = document.getElementById('confirmedRows');
    var count = document.getElementById('confirmedCount');
    if (!body) return;
    body.innerHTML = '';
    if (count) count.textContent = rows.length + (rows.length === 1 ? ' team' : ' teams');

    if (!rows.length) {
      var tr0 = el('tr');
      var td0 = el('td', 'muted', 'No confirmed teams yet. Add the first above and it appears on the site.');
      td0.colSpan = 5;
      tr0.appendChild(td0); body.appendChild(tr0);
      return;
    }

    rows.forEach(function (t) {
      var tr = el('tr');
      tr.dataset.id = t.id;

      function save(field, value) {
        var b = {}; b[field] = value;
        return patch('confirmed_teams', 'id', t.id, b, tr).then(function () { t[field] = value; });
      }
      function cell(field, type) {
        var td = el('td');
        var inp;
        if (type === 'level') {
          inp = document.createElement('select');
          ['Varsity', 'JV'].forEach(function (o) {
            var op = el('option', null, o); op.value = o;
            if (t.level === o) op.selected = true;
            inp.appendChild(op);
          });
        } else if (type === 'checkbox') {
          inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = !!t[field];
        } else {
          inp = document.createElement('input');
          inp.type = type === 'number' ? 'number' : 'text';
          inp.value = t[field] === null || t[field] === undefined ? '' : t[field];
        }
        inp.setAttribute('aria-label', field + ' for ' + t.school);
        inp.addEventListener('change', function () {
          var v = type === 'checkbox' ? inp.checked : type === 'number' ? (parseInt(inp.value, 10) || 0) : inp.value.trim();
          save(field, v).catch(function () {
            if (type === 'checkbox') inp.checked = !!t[field]; else inp.value = t[field];
          });
        });
        td.appendChild(inp);
        return td;
      }

      tr.appendChild(cell('school', 'text'));
      tr.appendChild(cell('level', 'level'));
      tr.appendChild(cell('sort', 'number'));
      tr.appendChild(cell('visible', 'checkbox'));

      var act = el('td', 'nowrap');
      var del = el('button', 'linkbtn linkbtn--danger', 'Remove');
      del.type = 'button';
      del.addEventListener('click', function () {
        if (!confirm('Remove ' + t.school + ' ' + t.level + ' from the confirmed list?')) return;
        markRow(tr, 'saving');
        authFetch('/rest/v1/confirmed_teams?id=eq.' + encodeURIComponent(t.id), { method: 'DELETE' })
          .then(function () { say('Removed ' + t.school + ' ' + t.level); return loadAll(); })
          .catch(function (e) { markRow(tr, 'failed'); say(e.message, 'error'); });
      });
      act.appendChild(del);
      tr.appendChild(act);
      body.appendChild(tr);
    });
  }

  var addConfirmedForm = document.getElementById('addConfirmed');
  if (addConfirmedForm) {
    addConfirmedForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var school = addConfirmedForm.elements.school.value.trim();
      if (!school) return;
      authFetch('/rest/v1/confirmed_teams', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ school: school, level: addConfirmedForm.elements.level.value })
      }).then(function () {
        addConfirmedForm.reset();
        say('Added ' + school);
        return loadAll();
      }).catch(function (err) {
        say(/duplicate|unique/i.test(err.message) ? school + ' ' + addConfirmedForm.elements.level.value + ' is already listed' : err.message, 'error');
      });
    });
  }

  /* ------------------------------------------------------------- vendors -- */
  function renderVendors(rows) {
    var body = document.getElementById('vendorRows');
    var count = document.getElementById('vendorCount');
    if (!body) return;
    body.innerHTML = '';
    if (count) count.textContent = rows.length + (rows.length === 1 ? ' request' : ' requests');

    if (!rows.length) {
      var tr0 = el('tr');
      var td0 = el('td', 'muted', 'No booth requests yet.');
      td0.colSpan = 9;
      tr0.appendChild(td0); body.appendChild(tr0);
      return;
    }

    rows.forEach(function (r) {
      var tr = el('tr');
      tr.appendChild(el('td', 'nowrap', new Date(r.created_at).toLocaleDateString(undefined,
        { month: 'short', day: 'numeric' })));

      var biz = el('td', 'strong');
      var site = (r.website || '').trim();
      if (site && !/^@/.test(site)) {
        var w = el('a', null, r.business);
        w.href = /^https?:\/\//i.test(site) ? site : 'https://' + site;
        w.target = '_blank'; w.rel = 'noopener';
        biz.appendChild(w);
      } else {
        biz.textContent = r.business;
        if (site) { biz.appendChild(document.createElement('br')); biz.appendChild(el('span', 'muted', site)); }
      }
      tr.appendChild(biz);

      // Booth type and count, with the permit flag where it matters.
      var booth = el('td', 'nowrap');
      var n = r.booths || 1;
      booth.appendChild(el('span', null, (r.booth_type || '—') + ' × ' + n));
      if (r.booth_type === 'Food') {
        booth.appendChild(document.createElement('br'));
        booth.appendChild(el('span', r.permits_ack ? 'muted' : 'flag',
          r.permits_ack ? 'Permits confirmed' : 'Permits NOT confirmed'));
      }
      tr.appendChild(booth);

      var sells = el('td', 'notes');
      sells.appendChild(el('span', 'strong', r.category || '—'));
      if (r.products) { sells.appendChild(document.createElement('br')); sells.appendChild(document.createTextNode(r.products)); }
      tr.appendChild(sells);

      tr.appendChild(el('td', null, r.contact_name));

      var contact = el('td');
      var a = el('a', null, r.email);
      a.href = 'mailto:' + r.email;
      contact.appendChild(a);
      if (r.phone) { contact.appendChild(document.createElement('br')); contact.appendChild(el('span', 'muted', r.phone)); }
      if (r.payment_ack === false) {
        contact.appendChild(document.createElement('br'));
        contact.appendChild(el('span', 'flag', 'Fee terms NOT acknowledged'));
      }
      tr.appendChild(contact);

      tr.appendChild(el('td', 'notes', r.notes || '—'));

      var st = el('td');
      var sel = document.createElement('select');
      sel.setAttribute('aria-label', 'Status for ' + r.business);
      ['new', 'contacted', 'confirmed', 'declined'].forEach(function (s) {
        var o = el('option', null, s.charAt(0).toUpperCase() + s.slice(1));
        o.value = s;
        if (r.status === s) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () {
        patch('vendor_registrations', 'id', r.id, { status: sel.value }, tr)
          .then(function () { r.status = sel.value; })
          .catch(function () { sel.value = r.status; });
      });
      st.appendChild(sel);
      tr.appendChild(st);

      var act = el('td', 'nowrap');
      invoiceControls(act, r, 'vendor_registration_id', invoiceFromVendor);
      var del = el('button', 'linkbtn linkbtn--danger', 'Remove');
      del.type = 'button';
      del.addEventListener('click', function () {
        if (!confirm('Remove the booth request from ' + r.business + '? This cannot be undone. ' +
                     'For a real vendor you are turning down, set it to Declined instead.')) return;
        markRow(tr, 'saving');
        authFetch('/rest/v1/vendor_registrations?id=eq.' + encodeURIComponent(r.id), { method: 'DELETE' })
          .then(function () { say('Removed ' + r.business); return loadAll(); })
          .catch(function (e) { markRow(tr, 'failed'); say(e.message, 'error'); });
      });
      act.appendChild(del);
      tr.appendChild(act);

      body.appendChild(tr);
    });
  }

  /* ------------------------------------------------------- registrations -- */
  function renderRegs(rows) {
    var body = document.getElementById('regRows');
    var count = document.getElementById('regCount');
    body.innerHTML = '';
    var tally = { none: 0, draft: 0, invoiced: 0, partial: 0, overdue: 0, paid: 0 };
    rows.forEach(function (r) { if (r.status !== 'declined') tally[payState(invoiceFor(r.id)).key]++; });
    count.textContent = rows.length + (rows.length === 1 ? ' submission' : ' submissions') +
      ' · ' + tally.paid + ' paid · ' + (tally.invoiced + tally.partial) + ' awaiting payment' +
      (tally.overdue ? ' · ' + tally.overdue + ' overdue' : '') +
      (tally.none + tally.draft ? ' · ' + (tally.none + tally.draft) + ' not yet invoiced' : '');

    if (!rows.length) {
      var tr = el('tr');
      var td = el('td', 'muted', 'No submissions yet.');
      td.colSpan = 9;
      tr.appendChild(td); body.appendChild(tr);
      return;
    }

    rows.forEach(function (r) {
      var tr = el('tr');
      tr.appendChild(el('td', 'nowrap', new Date(r.created_at).toLocaleDateString(undefined,
        { month: 'short', day: 'numeric' })));
      tr.appendChild(el('td', 'strong', r.school));
      tr.appendChild(el('td', null, r.level));

      // Null means the row predates the question, which is not the same as a
      // coach answering "Not sure" — flag it so it gets chased rather than read
      // as an answer. Anything outside D2/D3 is flagged too.
      var cif = r.cif_division;
      var cifCell = el('td', 'nowrap', cif || 'Not asked');
      if (!cif || cif === 'Another division' || cif === 'Not sure') {
        cifCell.className += ' flag';
      }
      tr.appendChild(cifCell);

      tr.appendChild(el('td', null, r.contact));

      var contact = el('td');
      var a = el('a', null, r.email);
      a.href = 'mailto:' + r.email;
      contact.appendChild(a);
      if (r.phone) { contact.appendChild(document.createElement('br')); contact.appendChild(el('span', 'muted', r.phone)); }
      tr.appendChild(contact);

      tr.appendChild(el('td', 'notes', r.notes || '—'));

      var st = el('td');
      var sel = document.createElement('select');
      sel.setAttribute('aria-label', 'Status for ' + r.school);
      ['new', 'contacted', 'confirmed', 'declined'].forEach(function (s) {
        var o = el('option', null, s.charAt(0).toUpperCase() + s.slice(1));
        o.value = s;
        if (r.status === s) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () {
        patch('registrations', 'id', r.id, { status: sel.value }, tr)
          .then(function () { r.status = sel.value; })
          .catch(function () { sel.value = r.status; });
      });
      st.appendChild(sel);
      tr.appendChild(st);

      // The entry form asks twenty-odd questions. They do not belong in a
      // table, so the row carries the summary and expands for the rest.
      var toggleCell = el('td', 'nowrap');
      var toggle = el('button', 'linkbtn', 'Details');
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', 'false');
      toggleCell.appendChild(toggle);

      // Invoice: open the existing one, or start one pre-filled from this entry.
      var existing = invoiceFor(r.id);
      toggleCell.appendChild(document.createElement('br'));
      var invBtn = el('button', 'linkbtn', existing ? existing.invoice_no : 'Invoice');
      invBtn.type = 'button';
      invBtn.title = existing ? 'Open this invoice' : 'Create an invoice from this registration';
      invBtn.addEventListener('click', function () {
        openInvoiceEditor(existing || invoiceFromRegistration(r));
      });
      toggleCell.appendChild(invBtn);
      var ps = payState(existing);
      toggleCell.appendChild(document.createElement('br'));
      var chip = el('span', 'paychip paychip--' + ps.key, ps.label);
      if (existing && ps.key !== 'paid' && ps.key !== 'draft') chip.title = usd(existing.balance) + ' due ' + mdyShort(existing.due_on);
      toggleCell.appendChild(chip);
      tr.appendChild(toggleCell);

      body.appendChild(tr);

      var detailRow = el('tr', 'detailrow');
      detailRow.hidden = true;
      var detailCell = el('td');
      detailCell.colSpan = 9;
      detailCell.appendChild(buildDetail(r));
      detailRow.appendChild(detailCell);
      body.appendChild(detailRow);

      toggle.addEventListener('click', function () {
        var open = detailRow.hidden;
        detailRow.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        toggle.textContent = open ? 'Hide' : 'Details';
      });
    });
  }

  /* Everything the row has no column for. Fields the earlier, shorter form
     never asked come back null; those read "Not asked" rather than being left
     blank, so a gap in the record is never mistaken for an answer. */
  function buildDetail(r) {
    var wrap = el('div', 'detail');
    var person = function (first, last, email, phone) {
      var name = [first, last].filter(Boolean).join(' ');
      if (!name && !email) return null;
      return [name || '(no name)', email || 'no email', phone || 'no phone'].join(' · ');
    };

    var groups = [
      ['Submitted by', [
        ['Name', [r.contact_first, r.contact_last].filter(Boolean).join(' ') || null],
        ['Role', r.role],
        ['Email', r.email],
        ['Cell', r.phone]
      ]],
      ['Coaches', [
        ['Coach 1', person(r.coach1_first, r.coach1_last, r.coach1_email, r.coach1_phone)],
        ['Coach 2', person(r.coach2_first, r.coach2_last, r.coach2_email, r.coach2_phone)]
      ]],
      ['Teams', [
        ['Team 1', r.team1_level],
        ['Team 1 notes', r.team1_strength],
        ['Team 2', r.team2_level],
        ['Team 2 notes', r.team2_strength]
      ]],
      ['Entry', [
        ['Payment terms', r.payment_ack === true ? 'Acknowledged'
          : r.payment_ack === false ? 'NOT acknowledged' : null],
        ['Updates opt-in', r.consent ? 'Yes' : 'No'],
        ['Notes', r.notes]
      ]]
    ];

    groups.forEach(function (g) {
      var box = el('div', 'detail__group');
      box.appendChild(el('h4', null, g[0]));
      var dl = el('dl');
      g[1].forEach(function (pair) {
        dl.appendChild(el('dt', null, pair[0]));
        var empty = pair[1] === null || pair[1] === undefined || pair[1] === '';
        dl.appendChild(el('dd', empty ? 'muted' : null, empty ? 'Not asked' : pair[1]));
      });
      box.appendChild(dl);
      wrap.appendChild(box);
    });

    return wrap;
  }

  /* ---------------------------------------------------------------- load -- */
  function loadAll() {
    var isAdmin = role === 'admin';
    return Promise.all([
      authFetch('/rest/v1/tournament_teams?select=*&order=pool.asc,seed.asc'),
      authFetch('/rest/v1/games?select=*&order=slot.asc,field.asc'),
      isAdmin ? authFetch('/rest/v1/registrations?select=*&order=created_at.desc')
              : Promise.resolve([]),
      // Sponsor tables may not exist until supabase/sponsors.sql has been run.
      // That must not take the rest of the panel down with it.
      isAdmin ? authFetch('/rest/v1/sponsors?select=*&order=tier.asc,sort.asc,name.asc')
                  .catch(function () { return null; })
              : Promise.resolve([]),
      isAdmin ? authFetch('/rest/v1/sponsor_inquiries?select=*&order=created_at.desc')
                  .catch(function () { return null; })
              : Promise.resolve([]),
      isAdmin ? authFetch('/rest/v1/vendor_registrations?select=*&order=created_at.desc')
                  .catch(function () { return null; })
              : Promise.resolve([]),
      isAdmin ? authFetch('/rest/v1/confirmed_teams?select=*&order=sort.asc,school.asc,level.desc')
                  .catch(function () { return null; })
              : Promise.resolve([]),
      isAdmin ? authFetch('/rest/v1/merch_orders?select=*&order=created_at.desc')
                  .catch(function () { return null; })
              : Promise.resolve([]),
      isAdmin ? authFetch('/rest/v1/invoices?select=*&order=created_at.desc')
                  .catch(function () { return null; })
              : Promise.resolve([])
    ]).then(function (r) {
      teams = r[0] || []; games = r[1] || [];
      renderTeams();
      renderScores();
      if (isAdmin) {
        // Invoices first: the registration rows link to theirs.
        if (r[8] === null) say('Invoices table not found — run supabase/invoices.sql', 'error');
        renderInvoices(r[8] || []);
        renderRegs(r[2] || []);
        if (r[3] === null || r[4] === null) {
          say('Sponsor tables not found — run supabase/sponsors.sql', 'error');
        }
        sponsors = sortSponsors(r[3] || []);
        renderSponsors();
        renderInquiries(r[4] || []);
        if (r[5] === null) say('Vendor table not found — run supabase/vendors.sql', 'error');
        renderVendors(r[5] || []);
        if (r[6] === null) say('Confirmed teams table not found — run supabase/confirmed-teams.sql', 'error');
        renderConfirmed(r[6] || []);
        if (r[7] === null) say('Merch orders table not found — run supabase/merch.sql', 'error');
        renderMerch(r[7] || []);
      }
      document.getElementById('counts').textContent =
        teams.length + ' teams · ' + games.length + ' games' +
        (isAdmin && sponsors.length ? ' · ' + sponsors.length + ' sponsors' : '');
    });
  }

  // Package order as on the site, not alphabetical.
  function sortSponsors(list) {
    return list.slice().sort(function (a, b) {
      var ta = SPONSOR_TIERS.indexOf(a.tier), tb = SPONSOR_TIERS.indexOf(b.tier);
      return (ta - tb) || (a.sort - b.sort) || a.name.localeCompare(b.name);
    });
  }

  function applyRole() {
    var admin = role === 'admin';

    // Tabs get shown or hidden by role. Panels are NOT un-hidden here — which
    // tab is open owns that, and setting hidden=false on every admin panel
    // would reveal all three at once.
    Array.prototype.forEach.call(
      document.querySelectorAll('.tab[data-admin-only]'),
      function (n) { n.hidden = !admin; }
    );

    if (!admin) {
      Array.prototype.forEach.call(
        document.querySelectorAll('.panel[data-admin-only]'),
        function (p) { p.hidden = true; }
      );
      var scores = document.querySelector('.tab[data-panel="scores"]');
      if (scores) scores.click();
    }

    var badge = document.getElementById('rolebadge');
    if (badge) badge.textContent = admin ? 'Admin' : 'Scorekeeper';
  }

  function enterApp() {
    loginView.hidden = true;
    appView.hidden = false;
    whoami.textContent = (session && session.user && session.user.email) || '';
    applyRole();
    loadAll().catch(function (err) {
      // A toast fades; a failure to load the whole panel should not. Leave it
      // on screen with the actual message, so a problem here is never silent.
      say(err.message || 'Could not load data', 'error');
      var box = document.getElementById('loadError');
      box.hidden = false;
      box.querySelector('code').textContent = err.message || String(err);
    });
  }

  /* ---------------------------------------------------------------- init -- */
  if (!URL_BASE || !ANON) {
    loginMsg.textContent = 'Supabase is not configured in assets/config.js.';
    loginMsg.className = 'formmsg is-error';
    return;
  }

  // Nothing should ever fail without the operator seeing why. Without these, a
  // throw anywhere outside a promise chain leaves the page looking inert.
  window.addEventListener('error', function (e) {
    say('Unexpected error: ' + (e.message || 'see console'), 'error');
  });
  window.addEventListener('unhandledrejection', function (e) {
    var m = (e.reason && e.reason.message) || String(e.reason || '');
    say('Unexpected error: ' + m, 'error');
    if (!loginView.hidden) {
      loginMsg.textContent = m || 'Something went wrong. Check the browser console.';
      loginMsg.className = 'formmsg is-error';
    }
  });

  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = loginForm.querySelector('button[type=submit]');
    var label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Signing in…';
    loginMsg.textContent = '';
    loginMsg.className = 'formmsg';

    signIn(loginForm.elements.email.value.trim(), loginForm.elements.password.value)
      .then(function (d) {
        saveSession(d);
        return authFetch('/rest/v1/admins?select=user_id,role&limit=1').then(function (rows) {
          if (!rows || !rows.length) {
            saveSession(null);
            throw new Error('That account is not on the staff list. Ask an organiser to add it.');
          }
          role = rows[0].role || 'admin';
          enterApp();
        });
      })
      .catch(function (err) {
        loginMsg.textContent = err.message || 'Sign-in failed.';
        loginMsg.className = 'formmsg is-error';
      })
      .then(function () { btn.disabled = false; btn.textContent = label; });
  });

  signOutBtn.addEventListener('click', signOut);

  session = loadSession();
  if (session && session.access_token) {
    authFetch('/rest/v1/admins?select=user_id,role&limit=1')
      .then(function (rows) {
        if (rows && rows.length) { role = rows[0].role || 'admin'; enterApp(); }
        else signOut();
      })
      .catch(function () { signOut(); });
  }
})();
