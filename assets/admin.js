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
  var teams = [];
  var games = [];

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

  /* ------------------------------------------------------- registrations -- */
  function renderRegs(rows) {
    var body = document.getElementById('regRows');
    var count = document.getElementById('regCount');
    body.innerHTML = '';
    count.textContent = rows.length + (rows.length === 1 ? ' submission' : ' submissions');

    if (!rows.length) {
      var tr = el('tr');
      var td = el('td', 'muted', 'No submissions yet.');
      td.colSpan = 7;
      tr.appendChild(td); body.appendChild(tr);
      return;
    }

    rows.forEach(function (r) {
      var tr = el('tr');
      tr.appendChild(el('td', 'nowrap', new Date(r.created_at).toLocaleDateString(undefined,
        { month: 'short', day: 'numeric' })));
      tr.appendChild(el('td', 'strong', r.school));
      tr.appendChild(el('td', null, r.level));
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
      body.appendChild(tr);
    });
  }

  /* ---------------------------------------------------------------- load -- */
  function loadAll() {
    return Promise.all([
      authFetch('/rest/v1/tournament_teams?select=*&order=pool.asc,seed.asc'),
      authFetch('/rest/v1/games?select=*&order=slot.asc,field.asc'),
      authFetch('/rest/v1/registrations?select=*&order=created_at.desc')
    ]).then(function (r) {
      teams = r[0] || []; games = r[1] || [];
      renderTeams();
      renderScores();
      renderRegs(r[2] || []);
      document.getElementById('counts').textContent =
        teams.length + ' teams · ' + games.length + ' games';
    });
  }

  function enterApp() {
    loginView.hidden = true;
    appView.hidden = false;
    whoami.textContent = (session && session.user && session.user.email) || '';
    loadAll().catch(function (err) {
      // Signed in but not on the allowlist: the tables simply return nothing.
      say(err.message || 'Could not load data', 'error');
    });
  }

  /* ---------------------------------------------------------------- init -- */
  if (!URL_BASE || !ANON) {
    loginMsg.textContent = 'Supabase is not configured in assets/config.js.';
    loginMsg.className = 'formmsg is-error';
    return;
  }

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
        return authFetch('/rest/v1/admins?select=user_id&limit=1').then(function (rows) {
          if (!rows || !rows.length) {
            saveSession(null);
            throw new Error('That account is not on the admin list. Ask an organiser to add it.');
          }
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
    authFetch('/rest/v1/admins?select=user_id&limit=1')
      .then(function (rows) {
        if (rows && rows.length) enterApp();
        else signOut();
      })
      .catch(function () { signOut(); });
  }
})();
