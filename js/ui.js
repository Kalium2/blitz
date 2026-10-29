/*
 * Football Blitz '26 — DOM menus: title, team select, play select, PAT,
 * pause, final score, how-to and options. Everything is navigable with
 * keyboard, gamepad, mouse and touch.
 */
(function () {
  var FB = (window.FB = window.FB || {});
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ovrClass(v) { return v >= 90 ? 'o90' : v >= 80 ? 'o80' : v >= 70 ? 'o70' : 'o60'; }
  function teamColor(t) { return t.c.jersey === '#F4F4F4' ? t.c.trim : t.c.jersey; }
  function textOn(hex) {
    var h = hex.replace('#', ''), r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    return (r * 0.299 + g * 0.587 + b * 0.114) > 150 ? '#111' : '#fff';
  }

  var UI = {
    stack: [],          // open overlay screens (menus)
    focus: {},          // screen id -> focused item index
    onAction: null,     // callback(screenId, action)

    init: function (onAction) {
      var self = this;
      this.onAction = onAction;
      $$('.screen').forEach(function (scr) {
        $$('.menu-item', scr).forEach(function (el, i) {
          el.addEventListener('click', function (e) {
            if (el.tagName === 'A' && el.id === 'download-link') { FB.Audio.play('select'); return; }
            e.preventDefault();
            if (el.blur) el.blur();
            self.focus[scr.id] = i;
            self.refreshFocus(scr.id);
            FB.Audio.init();
            FB.Audio.play('select');
            self.onAction(scr.id, el.getAttribute('data-action'));
          });
          el.addEventListener('mouseenter', function () { self.focus[scr.id] = i; self.refreshFocus(scr.id); });
        });
      });
    },

    show: function (id) {
      var el = document.getElementById(id);
      el.classList.add('active');
      if (this.stack.indexOf(id) < 0) this.stack.push(id);
      if (this.focus[id] == null) this.focus[id] = 0;
      this.refreshFocus(id);
    },
    hide: function (id) {
      var el = document.getElementById(id);
      el.classList.remove('active');
      var i = this.stack.indexOf(id);
      if (i >= 0) this.stack.splice(i, 1);
    },
    isOpen: function (id) { return document.getElementById(id).classList.contains('active'); },
    top: function () { return this.stack.length ? this.stack[this.stack.length - 1] : null; },

    items: function (id) { return $$('.menu-item', document.getElementById(id)).filter(function (el) { return el.offsetParent !== null && !el.disabled; }); },
    refreshFocus: function (id) {
      var items = $$('.menu-item', document.getElementById(id));
      var f = this.focus[id] || 0;
      items.forEach(function (el, i) { el.classList.toggle('focus', i === f); });
    },

    // Generic vertical/horizontal menu navigation for the top screen.
    navMenu: function (id, inp) {
      var items = $$('.menu-item', document.getElementById(id));
      if (!items.length) return false;
      var visible = items.map(function (el) { return el.offsetParent !== null && !el.hasAttribute('disabled'); });
      var f = this.focus[id] || 0;
      var step = inp.navY ? -inp.navY : inp.navX;
      if (step) {
        for (var k = 0; k < items.length; k++) {
          f = (f + step + items.length) % items.length;
          if (visible[f]) break;
        }
        this.focus[id] = f;
        this.refreshFocus(id);
        FB.Audio.play('menu');
      }
      if (inp.action) {
        var el = items[this.focus[id] || 0];
        if (el) el.click();
        return true;
      }
      return false;
    },

    setLabel: function (screenId, action, text) {
      var el = $('#' + screenId + ' [data-action="' + action + '"]');
      if (el) el.textContent = text;
    },

    // ======================================================= TEAM SELECT
    teamSel: null,

    openTeams: function (twoPlayer, prev) {
      var n = FB.TEAMS.length;
      var a = prev ? prev[0] : Math.floor(Math.random() * n);
      var b = prev ? prev[1] : (a + 1 + Math.floor(Math.random() * (n - 1))) % n;
      this.teamSel = { two: twoPlayer, idx: [a, b], ready: [false, false], step: 0 };
      this.renderTeams();
      this.show('teams');
    },

    renderTeams: function () {
      var ts = this.teamSel, self = this;
      $$('.team-panel').forEach(function (panel) {
        var side = +panel.getAttribute('data-side');
        var t = FB.TEAMS[ts.idx[side]];
        var col = teamColor(t), fg = textOn(col);
        var who = ts.two ? 'P' + (side + 1) : (side === 0 ? 'P1' : 'CPU');
        var whoCls = ts.ready[side] ? 'ready' : (ts.two ? 'p' + (side + 1) : (side === 0 ? 'p1' : ''));
        var rows = [];
        rows.push('<div class="pr sep">OFFENSE</div>');
        t.offense.forEach(function (p) { rows.push(self.playerRow(p)); });
        rows.push('<div class="pr sep">DEFENSE</div>');
        t.defense.forEach(function (p) { rows.push(self.playerRow(p)); });
        panel.innerHTML =
          '<div class="tp-head"><span class="who ' + whoCls + '">' + who + (ts.ready[side] ? ' ✓ READY' : '') + '</span><span>' + (ts.idx[side] + 1) + ' / ' + FB.TEAMS.length + '</span></div>' +
          '<div class="tp-team">' +
            '<button class="tp-arrow" data-dir="-1" aria-label="Previous team">&#9664;</button>' +
            '<div class="tp-badge" style="background:linear-gradient(135deg,' + col + ',' + t.c.trim + ');color:' + fg + '">' +
              '<div class="tp-abbr">' + esc(t.abbr) + '</div>' +
              '<div class="tp-name">' + esc(t.city.toUpperCase() + ' ' + t.name.toUpperCase()) + '</div>' +
              '<div class="tp-conf">' + esc(t.conf.toUpperCase()) + '</div>' +
            '</div>' +
            '<button class="tp-arrow" data-dir="1" aria-label="Next team">&#9654;</button>' +
          '</div>' +
          '<div class="tp-ratings">' +
            '<div class="rt"><b>' + t.ratings.ovr + '</b><span>OVR</span></div>' +
            '<div class="rt"><b>' + t.ratings.pass + '</b><span>PASS</span></div>' +
            '<div class="rt"><b>' + t.ratings.rush + '</b><span>RUSH</span></div>' +
            '<div class="rt"><b>' + t.ratings.def + '</b><span>DEF</span></div>' +
          '</div>' +
          '<div class="tp-roster">' + rows.join('') + '</div>';
        var focused = ts.two ? !ts.ready[side] : (ts.step === side);
        panel.classList.toggle('focus', focused && (side === 0 || !ts.two));
        panel.classList.toggle('p2focus', focused && side === 1 && ts.two);
        panel.classList.toggle('ready', ts.ready[side]);
        $$('.tp-arrow', panel).forEach(function (btn) {
          btn.addEventListener('click', function () {
            if (!ts.two) ts.step = side;
            ts.ready[side] = false;
            self.cycleTeam(side, +btn.getAttribute('data-dir'));
          });
        });
        $('.tp-badge', panel).addEventListener('click', function () { self.teamConfirm(side); });
      });
      var hint = ts.two
        ? 'LEFT / RIGHT: CHANGE TEAM &nbsp;&bull;&nbsp; <b>ACTION</b>: READY &nbsp;&bull;&nbsp; SPECIAL: BACK &nbsp;&bull;&nbsp; TAP A TEAM BADGE TO READY'
        : (ts.step === 0 ? 'PICK <b>YOUR</b> TEAM &nbsp;&bull;&nbsp; LEFT / RIGHT &nbsp;&bull;&nbsp; <b>ACTION</b> TO CONFIRM' : 'PICK THE <b>CPU</b> OPPONENT &nbsp;&bull;&nbsp; <b>ACTION</b> TO KICK OFF &nbsp;&bull;&nbsp; SPECIAL: BACK');
      $('#teams-hint').innerHTML = hint;
    },

    playerRow: function (p) {
      var st = FB.Template.cardStats(p).map(function (s) { return s[0] + ' <i>' + s[1] + '</i>'; }).join(' ');
      var fpLabel = p.arch === 'QB' || p.arch === 'RB' || p.arch === 'WR' || p.arch === 'TE' ? 'PPR' : 'IDP';
      return '<div class="pr" title="Fantasy seed: ' + p.fp + ' ' + fpLabel + ' pts/game' + (p.rookie ? ' (2026 rookie projection)' : '') + '">' +
        '<span class="pos">' + esc(p.pos) + '</span>' +
        '<span class="nm">' + esc(p.name) + (p.rookie ? '<small>R</small>' : '') + '<br><span class="fp">' + p.fp + ' ' + fpLabel + ' FP/G</span></span>' +
        '<span class="ovr ' + ovrClass(p.r.ovr) + '">' + p.r.ovr + '</span>' +
        '<span class="st">' + st + '</span></div>';
    },

    cycleTeam: function (side, d) {
      var ts = this.teamSel, n = FB.TEAMS.length;
      ts.idx[side] = (ts.idx[side] + d + n) % n;
      if (ts.idx[side] === ts.idx[1 - side]) ts.idx[side] = (ts.idx[side] + d + n) % n;
      FB.Audio.play('menu');
      this.renderTeams();
    },

    teamConfirm: function (side) {
      var ts = this.teamSel;
      FB.Audio.init();
      FB.Audio.play('select');
      if (ts.two) {
        ts.ready[side] = true;
        this.renderTeams();
        if (ts.ready[0] && ts.ready[1]) this.onAction('teams', 'start');
        return;
      }
      if (ts.step === 0 && side === 0) { ts.step = 1; ts.ready[0] = true; this.renderTeams(); return; }
      ts.ready[1] = true;
      this.renderTeams();
      this.onAction('teams', 'start');
    },

    teamInput: function (inputs) {
      var ts = this.teamSel;
      if (!ts) return;
      if (ts.two) {
        for (var s = 0; s < 2; s++) {
          var inp = inputs[s];
          if (inp.back && ts.ready[s]) { ts.ready[s] = false; this.renderTeams(); continue; }
          if (inp.back && !ts.ready[0] && !ts.ready[1] && s === 0) { this.onAction('teams', 'back'); return; }
          if (ts.ready[s]) continue;
          if (inp.navX) this.cycleTeam(s, inp.navX);
          if (inp.action) this.teamConfirm(s);
        }
        return;
      }
      var i0 = inputs[0];
      if (i0.back) {
        if (ts.step === 1) { ts.step = 0; ts.ready[0] = false; this.renderTeams(); }
        else this.onAction('teams', 'back');
        return;
      }
      if (i0.navX) this.cycleTeam(ts.step, i0.navX);
      if (i0.navY) { ts.step = i0.navY < 0 ? 1 : 0; ts.ready[0] = ts.step === 1; this.renderTeams(); }
      if (i0.action) this.teamConfirm(ts.step);
    },

    // ======================================================= PLAY SELECT
    ps: null,

    // humans: [{slot, team, side:'off'|'def'}]
    openPlays: function (game, humans, done) {
      var self = this;
      var root = $('#plays .play-panels');
      root.innerHTML = '';
      this.ps = { game: game, panels: [], done: done };
      humans.forEach(function (h) {
        var off = h.side === 'off';
        var list = off ? FB.Plays.OFFENSE.concat(FB.Plays.SPECIAL, [FB.Plays.customPlay(FB.loadCustomPlay())]) : FB.Plays.DEFENSE;
        var panel = document.createElement('div');
        panel.className = 'play-panel p' + (h.slot + 1);
        var t = game.teams[h.team];
        var sit = game.conversion ? '2-PT TRY' : (FB.ordinal(game.down) + ' & ' + (game.isGoalToGo() ? 'GOAL' : game.toGo()) + ' • ' + FB.spotLabel(game));
        panel.innerHTML = '<div class="pp-head"><span class="side">P' + (h.slot + 1) + ' ' + esc(t.abbr) + ' ' + (off ? 'OFFENSE' : 'DEFENSE') + '</span>' +
          (off ? '<span class="flip-tag">TURBO: FLIP</span>' : '') + '<span class="sit">' + esc(sit) + '</span></div>' +
          '<div class="pp-grid"></div>' + (off ? '<div class="pp-special"></div>' : '');
        var grid = $('.pp-grid', panel), spec = $('.pp-special', panel);
        var cards = [];
        var pd = { h: h, list: list, cards: cards, index: 0, locked: false, el: panel, off: off, flip: false, turboPrev: true };
        list.forEach(function (play, i) {
          var card = document.createElement('div');
          card.className = 'pcard' + (play.special ? ' sp' : '');
          if (play.special) {
            var fgd = game.fgDistance();
            var sub = { punt: 'FLIP THE FIELD', fg: fgd + ' YD ATTEMPT', fakepunt: 'SURPRISE!', fakefg: 'SURPRISE!', custom: 'YOUR DESIGN' }[play.id] || '';
            card.innerHTML = '<div class="pn">' + esc(play.name) + '</div><div class="sub">' + sub + '</div>';
            var disabled = (game.conversion && play.id !== 'custom') || (play.id === 'fg' && game.fgProb(fgd) <= 0);
            if (disabled) card.classList.add('disabled');
            card.dataset.disabled = disabled ? '1' : '';
            spec.appendChild(card);
          } else {
            var cv = document.createElement('canvas');
            cv.width = 192; cv.height = 108;
            card.appendChild(cv);
            var pn = document.createElement('div'); pn.className = 'pn'; pn.textContent = play.name;
            card.appendChild(pn);
            grid.appendChild(card);
            self.drawDiagram(cv, play, off, false);
          }
          card.addEventListener('click', function () {
            if (pd.locked || card.dataset.disabled) return;
            pd.index = i; self.refreshPlays(); self.lockPlay(pd);
          });
          cards.push(card);
        });
        if (off) {
          var tag = $('.flip-tag', panel);
          tag.addEventListener('click', function () { self.toggleFlip(pd); });
        }
        root.appendChild(panel);
        self.ps.panels.push(pd);
      });
      this.refreshPlays();
      this.show('plays');
    },

    toggleFlip: function (pd) {
      if (!pd.off || pd.locked) return;
      pd.flip = !pd.flip;
      var self = this;
      pd.cards.forEach(function (c, i) { var cv = c.querySelector('canvas'); if (cv) self.drawDiagram(cv, pd.list[i], true, pd.flip); });
      var tag = $('.flip-tag', pd.el);
      tag.textContent = pd.flip ? 'FLIPPED ⇄' : 'TURBO: FLIP';
      tag.classList.toggle('on', pd.flip);
      FB.Audio.play('switch');
    },

    refreshPlays: function () {
      this.ps.panels.forEach(function (pd) {
        pd.cards.forEach(function (c, i) {
          c.classList.toggle('focus', i === pd.index && !pd.locked);
          c.classList.toggle('locked', pd.locked && i === pd.index);
        });
      });
    },

    lockPlay: function (pd) {
      pd.locked = true;
      FB.Audio.play('select');
      this.refreshPlays();
      var all = this.ps.panels.every(function (x) { return x.locked; });
      if (all) {
        var res = {};
        this.ps.panels.forEach(function (x) { res[x.off ? 'off' : 'def'] = x.list[x.index]; if (x.off) res.flip = x.flip; });
        this.hide('plays');
        var done = this.ps.done;
        this.ps = null;
        done(res);
      }
    },

    // Rows: three rows of three diagrams, then the special-teams row.
    playRows: function (pd) {
      var rows = [[0, 1, 2], [3, 4, 5], [6, 7, 8]];
      if (pd.cards.length > 9) { var r = []; for (var i = 9; i < pd.cards.length; i++) r.push(i); rows.push(r); }
      return rows;
    },

    playInput: function (inputs) {
      var ps = this.ps, self = this;
      if (!ps) return;
      ps.panels.forEach(function (pd) {
        var inp = inputs[pd.h.slot];
        if (!inp) return;
        if (pd.locked) {
          if (inp.back) { pd.locked = false; self.refreshPlays(); }
          return;
        }
        if (inp.turbo && !pd.turboPrev) self.toggleFlip(pd);
        pd.turboPrev = !!inp.turbo;
        var rows = self.playRows(pd), R = 0, C = 0;
        rows.forEach(function (row, ri) { var ci = row.indexOf(pd.index); if (ci >= 0) { R = ri; C = ci; } });
        var ok = function (i) { return pd.cards[i] && !pd.cards[i].dataset.disabled; };
        var i = pd.index;
        if (inp.navX) {
          var row = rows[R];
          for (var k = 1; k <= row.length; k++) { var c2 = ((C + inp.navX * k) % row.length + row.length) % row.length; if (ok(row[c2])) { i = row[c2]; break; } }
        }
        if (inp.navY) {
          var step = inp.navY < 0 ? 1 : -1; // stick down moves to the next row
          for (var t = 1; t <= rows.length; t++) {
            var nr = ((R + step * t) % rows.length + rows.length) % rows.length, nrow = rows[nr];
            var nc = Math.round(C * (nrow.length - 1) / Math.max(1, rows[R].length - 1));
            var cand = nrow[nc];
            if (!ok(cand)) cand = nrow.filter(ok)[0];
            if (cand != null) { i = cand; break; }
          }
        }
        if (i !== pd.index) { pd.index = i; FB.Audio.play('menu'); self.refreshPlays(); }
        if (inp.action && ok(pd.index)) self.lockPlay(pd);
      });
    },

    // Route diagram for a play card.
    drawDiagram: function (cv, play, off, flip) {
      var ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
      var fs = flip ? -1 : 1;
      var X = function (dy) { return W / 2 + dy * 3.6 * fs; };
      var Y = function (dx) { return H * 0.7 - dx * 1.9; };
      ctx.fillStyle = '#1b5a2a'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
      for (var yd = -10; yd <= 40; yd += 5) { ctx.beginPath(); ctx.moveTo(0, Y(yd)); ctx.lineTo(W, Y(yd)); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(80,150,255,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(W, Y(0)); ctx.stroke();
      function arrow(x1, y1, x2, y2, col) {
        var a = Math.atan2(y2 - y1, x2 - x1);
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - Math.cos(a - 0.5) * 7, y2 - Math.sin(a - 0.5) * 7);
        ctx.lineTo(x2 - Math.cos(a + 0.5) * 7, y2 - Math.sin(a + 0.5) * 7);
        ctx.fill();
      }
      if (off) {
        var F = FB.Plays.FORMATIONS[play.form];
        var col = { WR1: '#ffd23a', WR2: '#2ee6ff', TE: '#ff7ad9', RB: '#3dff8b' };
        ['WR1', 'WR2', 'TE', 'RB'].forEach(function (role) {
          var path = play.type === 'run' && role === 'RB' ? play.run : (play.routes && play.routes[role]);
          if (!path) return;
          var blocks = play.block && play.block[role];
          var sx = F[role][0], sy = F[role][1];
          ctx.strokeStyle = blocks ? 'rgba(255,255,255,0.55)' : col[role];
          ctx.lineWidth = play.type === 'run' && role === 'RB' ? 3.5 : 2.2;
          ctx.beginPath(); ctx.moveTo(X(sy), Y(sx));
          var px = sx, py = sy, lx = sx, ly = sy;
          var pts = blocks ? path.slice(0, 1) : path;
          pts.forEach(function (pt) { lx = px; ly = py; px = sx + pt[0]; py = sy + pt[1]; ctx.lineTo(X(py), Y(px)); });
          if (!blocks && play.cont && play.cont[role]) {
            var vx = px - lx, vy = py - ly, l = Math.sqrt(vx * vx + vy * vy) || 1;
            lx = px; ly = py; px += vx / l * 6; py += vy / l * 6; ctx.lineTo(X(py), Y(px));
          }
          ctx.stroke();
          if (blocks) { ctx.beginPath(); ctx.moveTo(X(py) - 5, Y(px)); ctx.lineTo(X(py) + 5, Y(px)); ctx.stroke(); }
          else arrow(X(ly), Y(lx), X(py), Y(px), col[role]);
        });
        ['QB', 'RB', 'WR1', 'WR2', 'TE', 'OL0', 'OL1'].forEach(function (role) {
          var p = F[role];
          ctx.fillStyle = role === 'QB' ? '#fff' : (role.indexOf('OL') === 0 ? '#9aa3c7' : col[role]);
          ctx.beginPath(); ctx.arc(X(p[1]), Y(p[0]), 4.2, 0, 7); ctx.fill();
          ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
        });
        if (play.primary) {
          var pp = F[play.primary];
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(X(pp[1]), Y(pp[0]), 7.5, 0, 7); ctx.stroke();
        }
      } else {
        var A = FB.Plays.DEF_ALIGN, G = FB.Plays.FORMATIONS.gun;
        Object.keys(play.a).forEach(function (key) {
          var a = play.a[key], p = A[key];
          if (a && a.man === 'WR1') p = [6, G.WR1[1]];
          if (a && a.man === 'WR2') p = [6, G.WR2[1]];
          if (a && a.man === 'TE') p = [4.5, G.TE[1]];
          var x = X(p[1]), y = Y(p[0]);
          if (a === 'rush' || a === 'runfit') {
            ctx.strokeStyle = a === 'rush' ? '#ff4d1f' : '#ffb21f'; ctx.lineWidth = 2.4;
            var tx = X(0), ty = Y(-4.5);
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx + (x - tx) * 0.35, ty + (y - ty) * 0.35); ctx.stroke();
            arrow(x, y, tx + (x - tx) * 0.35, ty + (y - ty) * 0.35, ctx.strokeStyle);
          } else if (a && a.zone) {
            ctx.fillStyle = 'rgba(46,230,255,0.22)'; ctx.strokeStyle = 'rgba(46,230,255,0.8)'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.ellipse(X(a.zone[1]), Y(a.zone[0]), 15, 9, 0, 0, 7); ctx.fill(); ctx.stroke();
            ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(X(a.zone[1]), Y(a.zone[0])); ctx.stroke(); ctx.setLineDash([]);
          } else if (a && a.man) {
            var r = G[a.man];
            ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(X(r[1]), Y(r[0])); ctx.stroke(); ctx.setLineDash([]);
          } else if (a === 'spy') {
            ctx.strokeStyle = '#d07aff'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.stroke();
          }
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4;
          ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); ctx.stroke();
        });
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ['QB', 'WR1', 'WR2', 'TE', 'RB'].forEach(function (role) { var p = G[role]; ctx.beginPath(); ctx.arc(X(p[1]), Y(p[0]), 3, 0, 7); ctx.fill(); });
      }
    },

    // ====================================================== CREATE-A-PLAY
    cp: null,
    CP_ROLES: [['WR1', 'LEFT WIDEOUT'], ['WR2', 'RIGHT WIDEOUT'], ['TE', 'TIGHT END'], ['RB', 'RUNNING BACK']],

    openCreatePlay: function () {
      this.cp = { sel: FB.loadCustomPlay(), row: 0, btn: 0 };
      var self = this, rows = $('#cp-rows');
      rows.innerHTML = '';
      this.CP_ROLES.forEach(function (r, i) {
        var el = document.createElement('div');
        el.className = 'cp-row';
        el.innerHTML = '<span class="cp-role">' + r[1] + '</span><button class="tp-arrow sm" data-d="-1">&#9664;</button><span class="cp-route"></span><button class="tp-arrow sm" data-d="1">&#9654;</button>';
        $$('button', el).forEach(function (b) { b.addEventListener('click', function () { self.cp.row = i; self.cycleRoute(i, +b.getAttribute('data-d')); }); });
        rows.appendChild(el);
      });
      this.renderCreatePlay();
      this.show('createplay');
    },

    cycleRoute: function (i, d) {
      var role = this.CP_ROLES[i][0], names = FB.Plays.ROUTE_NAMES;
      var k = names.indexOf(this.cp.sel[role]);
      this.cp.sel[role] = names[((k + d) % names.length + names.length) % names.length];
      FB.Audio.play('menu');
      this.renderCreatePlay();
    },

    renderCreatePlay: function () {
      var cp = this.cp, self = this;
      $$('#cp-rows .cp-row').forEach(function (el, i) {
        $('.cp-route', el).textContent = cp.sel[self.CP_ROLES[i][0]];
        el.classList.toggle('focus', cp.row === i);
      });
      this.focus.createplay = cp.row === 4 ? cp.btn : -1;
      this.refreshFocus('createplay');
      var cv = $('#cp-canvas');
      this.drawDiagram(cv, FB.Plays.customPlay(cp.sel), true, false);
    },

    createPlayInput: function (inp) {
      var cp = this.cp;
      if (!cp) return;
      if (inp.back) { this.onAction('createplay', 'back'); return; }
      if (inp.navY) { cp.row = (cp.row - inp.navY + 5) % 5; FB.Audio.play('menu'); this.renderCreatePlay(); }
      if (inp.navX) {
        if (cp.row < 4) this.cycleRoute(cp.row, inp.navX);
        else { cp.btn = 1 - cp.btn; this.renderCreatePlay(); }
      }
      if (inp.action) {
        if (cp.row < 4) { cp.row++; this.renderCreatePlay(); }
        else $$('#createplay .menu-item')[cp.btn].click();
      }
    },

    // ============================================================ FINAL
    renderFinal: function (game) {
      var t = game.teams, s = game.score, st = game.stats.team;
      var win = s[0] === s[1] ? -1 : (s[0] > s[1] ? 0 : 1);
      var teamBox = function (i) {
        var col = teamColor(t[i]);
        return '<div class="fs-team' + (win === i ? ' win' : '') + '" style="background:' + col + ';color:' + textOn(col) + '"><span class="ab">' + esc(t[i].abbr) + '</span><span class="sc">' + s[i] + '</span></div>';
      };
      var rows = [
        ['TOTAL YARDS', function (x) { return x.passYds + x.rushYds; }],
        ['PASSING', function (x) { return x.passYds + ' (' + x.comp + '/' + x.att + ')'; }],
        ['RUSHING', function (x) { return x.rushYds; }],
        ['FIRST DOWNS', function (x) { return x.firstDowns; }],
        ['TOUCHDOWNS', function (x) { return x.passTD + x.rushTD + x.retTD; }],
        ['TURNOVERS', function (x) { return x.ints + x.fumbles; }],
        ['SACKS', function (x) { return x.sacks; }]
      ];
      var html = '<div class="final-score">' + teamBox(0) + '<span class="vs">' + (game.quarter === 5 ? 'OT' : '\u2013') + '</span>' + teamBox(1) + '</div>';
      html += '<table class="stat-table"><tr><th></th><th>' + esc(t[0].abbr) + '</th><th>' + esc(t[1].abbr) + '</th></tr>';
      rows.forEach(function (r) { html += '<tr><td>' + r[0] + '</td><td>' + r[1](st[0]) + '</td><td>' + r[1](st[1]) + '</td></tr>'; });
      html += '</table>';
      // stat leaders
      var P = game.stats.players, leaders = [
        ['PASSING', function (x) { return x.passYds; }, function (x) { return x.comp + '/' + x.att + ', ' + x.passYds + ' YDS, ' + x.passTD + ' TD'; }],
        ['RUSHING', function (x) { return x.rushYds; }, function (x) { return x.rushYds + ' YDS' + (x.rushTD ? ', ' + x.rushTD + ' TD' : ''); }],
        ['RECEIVING', function (x) { return x.recYds + x.rec; }, function (x) { return x.rec + ' REC, ' + x.recYds + ' YDS' + (x.recTD ? ', ' + x.recTD + ' TD' : ''); }],
        ['DEFENSE', function (x) { return x.tak + x.sacks * 3 + x.ints * 4; }, function (x) { return x.tak + ' TKL' + (x.sacks ? ', ' + x.sacks + ' SACK' : '') + (x.ints ? ', ' + x.ints + ' INT' : ''); }]
      ];
      var lrows = '';
      leaders.forEach(function (L) {
        var best = null, bv = 0;
        Object.keys(P).forEach(function (id) { var x = P[id]; if (x.name.charAt(0) === '#') return; var v = L[1](x); if (v > bv) { bv = v; best = x; } });
        if (best) lrows += '<tr><td>' + L[0] + '</td><td class="ld"><b>' + esc(best.name.toUpperCase()) + '</b> <small>' + esc(t[best.team].abbr) + '</small></td><td>' + esc(L[2](best)) + '</td></tr>';
      });
      if (lrows) html += '<table class="stat-table leaders"><tr><th>LEADERS</th><th></th><th></th></tr>' + lrows + '</table>';
      var m = game.mvp();
      if (m) {
        var line = [];
        if (m.att) line.push(m.comp + '/' + m.att + ', ' + m.passYds + ' PASS YDS, ' + m.passTD + ' TD');
        if (m.rushYds || m.rushTD) line.push(m.rushYds + ' RUSH YDS' + (m.rushTD ? ', ' + m.rushTD + ' TD' : ''));
        if (m.rec) line.push(m.rec + ' REC, ' + m.recYds + ' YDS' + (m.recTD ? ', ' + m.recTD + ' TD' : ''));
        if (m.retTD) line.push(m.retTD + ' RETURN TD');
        if (m.tak || m.sacks || m.ints) line.push(m.tak + ' TKL' + (m.sacks ? ', ' + m.sacks + ' SACK' : '') + (m.ints ? ', ' + m.ints + ' INT' : ''));
        html += '<p class="mvp">PLAYER OF THE GAME: <b>' + esc(m.name.toUpperCase()) + '</b> (' + esc(t[m.team].abbr) + ')<br>' + esc(line.join(' • ')) + '</p>';
      }
      $('#final-body').innerHTML = html;
    }
  };

  FB.loadCustomPlay = function () {
    var sel = Object.assign({}, FB.Plays.DEFAULT_CUSTOM);
    try {
      var o = JSON.parse(localStorage.getItem('fb26-myplay') || 'null');
      if (o) Object.keys(sel).forEach(function (k) { if (FB.Plays.ROUTES[o[k]]) sel[k] = o[k]; });
    } catch (e) { /* storage unavailable */ }
    return sel;
  };
  FB.saveCustomPlay = function (sel) {
    try { localStorage.setItem('fb26-myplay', JSON.stringify(sel)); } catch (e) { /* ignore */ }
  };

  FB.ordinal = function (n) { return ['1ST', '2ND', '3RD', '4TH'][n - 1] || (n + 'TH'); };
  FB.spotLabel = function (g) {
    var yardsFromOwn = Math.min(99, Math.max(1, Math.round((g.losX - FB.Game.ownGoal(g.poss)) * FB.Game.dirOf(g.poss))));
    if (yardsFromOwn === 50) return 'MIDFIELD';
    return yardsFromOwn < 50 ? 'OWN ' + yardsFromOwn : 'OPP ' + (100 - yardsFromOwn);
  };
  FB.UI = UI;
})();
