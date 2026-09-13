/* ==========================================================================
   Battle on Imperial — schedule & standings
   Reads tournament_teams and games from Supabase (public read only) and
   renders whichever page it finds itself on.
   ========================================================================== */
(function () {
  'use strict';

  var cfg = window.BOI_CONFIG || {};
  var url = (cfg.SUPABASE_URL || '').replace(/\/+$/, '');
  var key = cfg.SUPABASE_ANON_KEY || '';

  var root = document.getElementById('board');
  if (!root) return;
  var mode = root.getAttribute('data-mode');   // "schedule" | "standings"

  // Every status the admin panel can set needs its own treatment here, or
  // changing one has no visible effect on the public page.
  var STATUS = {
    scheduled:   { label: 'Upcoming',    cls: 'is-upcoming',  showScore: false },
    in_progress: { label: 'In progress', cls: 'is-live',      showScore: true },
    final:       { label: 'Final',       cls: 'is-final',     showScore: true },
    cancelled:   { label: 'Cancelled',   cls: 'is-cancelled', showScore: false }
  };
  function statusOf(g) { return STATUS[g.status] || STATUS.scheduled; }

  // Filter state lives out here so a refresh does not reset the user's choice.
  var filterLevel = 'all', filterTeam = 'all';

  /* ------------------------------------------------------------ helpers -- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function setState(kind, headline, detail) {
    root.innerHTML = '';
    var box = el('div', 'state state--' + kind);
    box.appendChild(el('h2', null, headline));
    if (detail) box.appendChild(el('p', null, detail));
    root.appendChild(box);
  }

  function get(path) {
    return fetch(url + '/rest/v1/' + path, {
      headers: { apikey: key, Authorization: 'Bearer ' + key }
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (b) {
          var err = new Error('HTTP ' + res.status + ' ' + b.slice(0, 200));
          err.status = res.status;
          err.body = b;
          throw err;
        });
      }
      return res.json();
    });
  }

  /* --------------------------------------------------------- standings -- */
  // Ranked on points (win 3, tie 1, loss 0), then goal difference, then goals for.
  // Head-to-head is deliberately not applied here: with a 3-game round robin
  // it resolves only some ties, and the entry packet is where the official
  // tiebreaker order belongs.
  function computeStandings(teams, games) {
    var rows = {};
    teams.forEach(function (t) {
      rows[t.id] = { team: t, p: 0, w: 0, l: 0, ties: 0, gf: 0, ga: 0 };
    });

    games.forEach(function (g) {
      if (g.status !== 'final') return;
      var h = rows[g.home_id], a = rows[g.away_id];
      if (!h || !a) return;
      h.p++; a.p++;
      h.gf += g.home_score; h.ga += g.away_score;
      a.gf += g.away_score; a.ga += g.home_score;
      if (g.home_score > g.away_score) { h.w++; a.l++; }
      else if (g.away_score > g.home_score) { a.w++; h.l++; }
      else { h.ties++; a.ties++; }   // pool play has no overtime — ties are real
    });

    return Object.keys(rows).map(function (k) {
      var r = rows[k];
      r.gd = r.gf - r.ga;
      r.pts = r.w * 3 + r.ties;   // 3-1-0, with goal difference as the first tiebreak
      return r;
    }).sort(function (x, y) {
      return (y.pts - x.pts) || (y.gd - x.gd) || (y.gf - x.gf)
        || x.team.name.localeCompare(y.team.name);
    });
  }

  function renderStandings(teams, games) {
    root.innerHTML = '';
    var pools = {};
    teams.forEach(function (t) { (pools[t.pool] = pools[t.pool] || []).push(t); });

    var anyFinal = games.some(function (g) { return g.status === 'final'; });
    if (!anyFinal) {
      root.appendChild(
        el('p', 'board__note', 'No games have finished yet. Standings appear here as results come in.')
      );
    }

    Object.keys(pools).sort().forEach(function (pool) {
      var poolTeams = pools[pool];
      var rows = computeStandings(poolTeams, games);
      var level = poolTeams[0] ? poolTeams[0].level : '';

      var card = el('section', 'pool');
      var head = el('div', 'pool__head');
      head.appendChild(el('h2', null, 'Pool ' + pool));
      head.appendChild(el('span', 'pool__level', level));
      card.appendChild(head);

      var scroll = el('div', 'table-scroll');
      var table = el('table', 'standings');
      table.innerHTML =
        '<thead><tr>' +
        '<th class="c-team" scope="col">Team</th>' +
        '<th scope="col" title="Games played">GP</th>' +
        '<th scope="col" title="Wins">W</th>' +
        '<th scope="col" title="Losses">L</th>' +
        '<th scope="col" title="Ties">T</th>' +
        '<th class="c-pts" scope="col" title="Points — 3 for a win, 1 for a tie">PTS</th>' +
        '<th scope="col" title="Goals for">GF</th>' +
        '<th scope="col" title="Goals against">GA</th>' +
        '<th scope="col" title="Goal difference">GD</th>' +
        '</tr></thead>';

      var tb = el('tbody');
      rows.forEach(function (r, i) {
        var tr = el('tr');
        if (i === 0 && r.p > 0) tr.className = 'is-leader';

        var name = el('td', 'c-team');
        name.appendChild(el('span', 'rank', String(i + 1)));
        name.appendChild(el('span', 'name', r.team.name));
        tr.appendChild(name);

        [r.p, r.w, r.l, r.ties].forEach(function (v) {
          tr.appendChild(el('td', null, String(v)));
        });
        tr.appendChild(el('td', 'c-pts', String(r.pts)));
        [r.gf, r.ga].forEach(function (v) {
          tr.appendChild(el('td', null, String(v)));
        });
        var gd = el('td', 'c-gd ' + (r.gd > 0 ? 'is-pos' : r.gd < 0 ? 'is-neg' : ''),
          (r.gd > 0 ? '+' : '') + r.gd);
        tr.appendChild(gd);
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      scroll.appendChild(table);
      card.appendChild(scroll);
      root.appendChild(card);
    });
  }

  /* ---------------------------------------------------------- schedule -- */
  function renderSchedule(teams, games) {
    var byId = {};
    teams.forEach(function (t) { byId[t.id] = t; });

    // Controls
    var bar = document.getElementById('filters');
    if (bar && !bar.dataset.ready) {
      bar.dataset.ready = '1';

      var levels = ['all'].concat(teams.map(function (t) { return t.level; })
        .filter(function (v, i, a) { return a.indexOf(v) === i; }));
      var lvl = el('select');
      lvl.id = 'f-level';
      levels.forEach(function (v) {
        var o = el('option', null, v === 'all' ? 'All levels' : v);
        o.value = v; lvl.appendChild(o);
      });

      var tm = el('select');
      tm.id = 'f-team';
      var optAll = el('option', null, 'All teams'); optAll.value = 'all'; tm.appendChild(optAll);
      teams.slice().sort(function (a, b) { return a.name.localeCompare(b.name); })
        .forEach(function (t) {
          var o = el('option', null, t.name); o.value = t.id; tm.appendChild(o);
        });

      var l1 = el('label', 'filter'); l1.appendChild(el('span', null, 'Level')); l1.appendChild(lvl);
      var l2 = el('label', 'filter'); l2.appendChild(el('span', null, 'Team')); l2.appendChild(tm);
      bar.appendChild(l1); bar.appendChild(l2);

      var reset = el('button', 'btn btn--outline filter__reset', 'Show all');
      bar.appendChild(reset);

      lvl.addEventListener('change', function () { filterLevel = lvl.value; draw(); });
      tm.addEventListener('change', function () { filterTeam = tm.value; draw(); });
      reset.addEventListener('click', function () {
        filterLevel = 'all'; filterTeam = 'all'; lvl.value = 'all'; tm.value = 'all'; draw();
      });
    }

    function matches(g) {
      if (filterTeam !== 'all' && g.home_id !== filterTeam && g.away_id !== filterTeam) return false;
      if (filterLevel !== 'all') {
        var t = byId[g.home_id];
        if (!t || t.level !== filterLevel) return false;
      }
      return true;
    }

    function draw() {
      root.innerHTML = '';
      var shown = games.filter(matches);

      if (!shown.length) {
        setState('empty', 'No games match that filter.',
          'Try a different team or level, or choose Show all.');
        return;
      }

      var slots = {};
      shown.forEach(function (g) { (slots[g.slot] = slots[g.slot] || []).push(g); });

      Object.keys(slots).map(Number).sort(function (a, b) { return a - b; })
        .forEach(function (slot) {
          var list = slots[slot].sort(function (a, b) { return a.field - b.field; });

          var block = el('section', 'slot');
          var h = el('div', 'slot__head');
          h.appendChild(el('h2', null, list[0].time_label));
          h.appendChild(el('span', 'slot__count', list.length + (list.length === 1 ? ' game' : ' games')));
          block.appendChild(h);

          var grid = el('div', 'slot__games');
          list.forEach(function (g) {
            var home = byId[g.home_id] || { name: g.home_id };
            var away = byId[g.away_id] || { name: g.away_id };
            var st = statusOf(g);
            var isFinal = g.status === 'final';

            var card = el('article', 'game ' + st.cls);

            var meta = el('div', 'game__meta');
            meta.appendChild(el('span', 'game__field', 'Field ' + g.field));
            meta.appendChild(el('span', 'game__pool', 'Pool ' + g.pool));
            var badge = el('span', 'game__status ' + st.cls);
            if (g.status === 'in_progress') badge.appendChild(el('span', 'livedot'));
            badge.appendChild(el('span', null, st.label));
            meta.appendChild(badge);
            card.appendChild(meta);

            [[home, g.home_score], [away, g.away_score]].forEach(function (pair, idx) {
              var side = el('div', 'game__side');
              var won = isFinal && ((idx === 0 && g.home_score > g.away_score) ||
                                    (idx === 1 && g.away_score > g.home_score));
              if (won) side.classList.add('is-win');
              side.appendChild(el('span', 'game__team', pair[0].name));
              var score = (st.showScore && pair[1] !== null && pair[1] !== undefined)
                ? String(pair[1]) : '–';
              side.appendChild(el('span', 'game__score', score));
              card.appendChild(side);
            });

            grid.appendChild(card);
          });
          block.appendChild(grid);
          root.appendChild(block);
        });
    }

    draw();
  }

  /* -------------------------------------------------------------- load -- */
  function render(teams, games) {
    if (!teams.length) {
      setState('empty', 'The schedule is not published yet.',
        'Pools and game times appear here once the field is set. Teams on the interest list hear first.');
      return;
    }
    if (mode === 'standings') renderStandings(teams, games);
    else renderSchedule(teams, games);
  }

  // Expose for local render testing without a network round trip.
  window.__renderTournament = render;

  if (!url || !key) {
    setState('empty', 'The schedule is not published yet.',
      'Pools and game times appear here once the field is set.');
    return;
  }

  setState('loading', 'Loading…', null);

  function fetchAll() {
    return Promise.all([
      get('tournament_teams?select=id,name,level,pool,seed&order=pool.asc,seed.asc'),
      get('games?select=*&order=slot.asc,field.asc')
    ]);
  }

  // While games are still running, refresh quietly so a parent watching on a
  // phone sees scores move without reloading. Stops once everything is decided,
  // and pauses while the tab is in the background.
  function scheduleRefresh(games) {
    var liveish = games.some(function (g) {
      return g.status === 'scheduled' || g.status === 'in_progress';
    });
    if (!liveish) return;
    setTimeout(function () {
      if (document.hidden) { scheduleRefresh(games); return; }
      fetchAll().then(function (r) {
        render(r[0] || [], r[1] || []);
        scheduleRefresh(r[1] || []);
      }).catch(function () {
        scheduleRefresh(games);   // transient failure: keep trying, stay quiet
      });
    }, 60000);
  }

  fetchAll().then(function (r) {
    render(r[0] || [], r[1] || []);
    scheduleRefresh(r[1] || []);
  }).catch(function (err) {
    if (window.console && console.warn) console.warn('[Battle on Imperial] schedule load failed:', err);
    // A missing table means the schedule simply has not been set up yet —
    // that is not an error worth alarming a visiting coach about.
    if (err.status === 404 || /PGRST205|does not exist/i.test(err.body || '')) {
      setState('empty', 'The schedule is not published yet.',
        'Pools and game times appear here once the field is set. Teams on the interest list hear first.');
    } else {
      setState('error', 'We could not load the schedule.',
        'Please refresh in a moment. If it keeps happening, email info@battleonimperial.com.');
    }
  });
})();
