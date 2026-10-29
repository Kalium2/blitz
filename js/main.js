/*
 * Football Blitz '26 — app shell: screens, main loop, events -> sound/FX.
 */
(function () {
  var FB = window.FB;
  var UI = FB.UI, Input = FB.Input, Audio = FB.Audio;

  var OPTS_KEY = 'fb26-options';
  var QLENS = [60, 120, 180, 240];
  var DIFFS = ['ROOKIE', 'PRO', 'ALL-PRO'];

  var App = {
    mode: 'title',        // title | teams | game
    game: null,
    demo: null,
    paused: false,
    twoPlayer: false,
    lastTeams: null,
    opts: { qlen: 120, diff: 1, sound: true, announcer: true },
    acc: 0,
    last: 0,
    finalShown: false,
    returnTo: null,

    init: function () {
      this.loadOpts();
      Input.init();
      this.canvas = document.getElementById('game');
      this.renderer = new FB.Renderer(this.canvas);
      var self = this;
      window.addEventListener('resize', function () { self.renderer.resize(); });
      UI.init(function (screen, action) { self.onMenu(screen, action); });
      this.applyOptLabels();
      document.getElementById('roster-note').textContent = 'Rosters: ' + FB.ROSTER_DATE + '. Ratings are derived from fantasy points per game.';
      if (location.protocol === 'file:') document.getElementById('download-link').style.display = 'none';
      // touch support
      var isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
      if (isTouch) {
        document.body.classList.add('touch');
        Input.initTouch(document.getElementById('touch'));
      }
      // unlock audio on first interaction
      var unlock = function () { Audio.init(); };
      window.addEventListener('keydown', unlock, { once: true });
      window.addEventListener('pointerdown', unlock, { once: true });
      window.addEventListener('gamepadconnected', unlock);
      this.startDemo();
      requestAnimationFrame(function (t) { self.last = t; self.frame(t); });
      if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
        navigator.serviceWorker.register('sw.js').catch(function () { /* offline cache is optional */ });
      }
    },

    // -------------------------------------------------------- options
    loadOpts: function () {
      try {
        var o = JSON.parse(localStorage.getItem(OPTS_KEY) || 'null');
        if (o) {
          if (QLENS.indexOf(o.qlen) >= 0) this.opts.qlen = o.qlen;
          if (o.diff >= 0 && o.diff <= 2) this.opts.diff = o.diff;
          this.opts.sound = o.sound !== false;
          this.opts.announcer = o.announcer !== false;
        }
      } catch (e) { /* storage unavailable */ }
      Audio.enabled = this.opts.sound;
      Audio.announcer = this.opts.announcer;
    },
    saveOpts: function () {
      try { localStorage.setItem(OPTS_KEY, JSON.stringify(this.opts)); } catch (e) { /* ignore */ }
    },
    applyOptLabels: function () {
      UI.setLabel('options', 'qlen', 'QUARTER LENGTH: ' + FB.fmtClock(this.opts.qlen));
      UI.setLabel('options', 'diff', 'CPU SKILL: ' + DIFFS[this.opts.diff]);
      UI.setLabel('options', 'sound', 'SOUND: ' + (this.opts.sound ? 'ON' : 'OFF'));
      UI.setLabel('pause', 'sound', 'SOUND: ' + (this.opts.sound ? 'ON' : 'OFF'));
      UI.setLabel('options', 'announcer', 'ANNOUNCER VOICE: ' + (this.opts.announcer ? 'ON' : 'OFF'));
    },

    // ------------------------------------------------------- menus
    onMenu: function (screen, action) {
      var o = this.opts;
      if (screen === 'title') {
        if (action === '1p' || action === '2p') {
          this.twoPlayer = action === '2p';
          Input.setMode(this.twoPlayer);
          UI.hide('title');
          this.mode = 'teams';
          UI.openTeams(this.twoPlayer, this.lastTeams);
        } else if (action === 'howto') { this.returnTo = 'title'; UI.show('howto'); }
        else if (action === 'options') { UI.show('options'); }
      } else if (screen === 'options') {
        if (action === 'qlen') o.qlen = QLENS[(QLENS.indexOf(o.qlen) + 1) % QLENS.length];
        else if (action === 'diff') o.diff = (o.diff + 1) % 3;
        else if (action === 'sound') { o.sound = !o.sound; Audio.setEnabled(o.sound); }
        else if (action === 'announcer') { o.announcer = !o.announcer; Audio.announcer = o.announcer; }
        else if (action === 'back') UI.hide('options');
        this.saveOpts(); this.applyOptLabels();
      } else if (screen === 'howto') {
        if (action === 'back') UI.hide('howto');
      } else if (screen === 'teams') {
        if (action === 'start') {
          var ts = UI.teamSel;
          this.lastTeams = ts.idx.slice();
          UI.hide('teams');
          this.startGame(ts.idx[0], ts.idx[1]);
        } else if (action === 'back') {
          UI.hide('teams');
          this.toTitle();
        }
      } else if (screen === 'pat') {
        UI.hide('pat');
        if (this.game) this.game.choosePAT(action);
      } else if (screen === 'pause') {
        if (action === 'resume') this.setPaused(false);
        else if (action === 'howto') { UI.show('howto'); }
        else if (action === 'sound') { o.sound = !o.sound; Audio.setEnabled(o.sound); this.saveOpts(); this.applyOptLabels(); }
        else if (action === 'quit') { this.setPaused(false); this.endGame(); this.toTitle(); }
      } else if (screen === 'final') {
        UI.hide('final');
        if (action === 'rematch') this.startGame(this.lastTeams[0], this.lastTeams[1]);
        else if (action === 'teams') { this.endGame(); this.mode = 'teams'; UI.openTeams(this.twoPlayer, this.lastTeams); }
        else { this.endGame(); this.toTitle(); }
      }
    },

    toTitle: function () {
      this.mode = 'title';
      Input.setMode(false);
      UI.show('title');
      this.startDemo();
    },

    setPaused: function (on) {
      this.paused = on;
      if (on) UI.show('pause'); else { UI.hide('pause'); UI.hide('howto'); }
    },

    // -------------------------------------------------------- games
    startDemo: function () {
      var n = FB.TEAMS.length, a = Math.floor(Math.random() * n), b = (a + 1 + Math.floor(Math.random() * (n - 1))) % n;
      this.demo = new FB.Game({ teams: [FB.TEAMS[a], FB.TEAMS[b]], humans: [], quarterLen: 90, attract: true });
      this.renderer.banners = [];
    },

    startGame: function (a, b) {
      this.demo = null;
      var humans = [{ slot: 0, team: 0 }];
      if (this.twoPlayer) humans.push({ slot: 1, team: 1 });
      this.game = new FB.Game({ teams: [FB.TEAMS[a], FB.TEAMS[b]], humans: humans, quarterLen: this.opts.qlen, difficulty: this.opts.diff });
      this.mode = 'game';
      this.finalShown = false;
      this.selecting = false;
      this.renderer.banners = [];
      this.renderer.particles = [];
      this.renderer.cam.init = false;
      document.getElementById('touch').classList.add('show');
      Audio.init();
      Audio.roar(0.6, 3);
      var recv = this.game.teams[this.game.receiveFirst];
      this.renderer.banner('KICKOFF', { sub: recv.name.toUpperCase() + ' RECEIVE', dur: 2.2 });
    },

    endGame: function () {
      this.game = null;
      this.selecting = false;
      UI.hide('plays'); UI.hide('pat'); UI.hide('final');
      UI.ps = null;
      document.getElementById('touch').classList.remove('show');
    },

    // ------------------------------------------------------- frame
    frame: function (t) {
      var self = this;
      var dt = Math.min(0.1, (t - this.last) / 1000 || 0);
      this.last = t;
      try { this.step(dt); }
      catch (err) { if (window.console) console.error(err); }
      requestAnimationFrame(function (tt) { self.frame(tt); });
    },

    step: function (dt) {
      var inputs = Input.poll();
      var top = UI.top();
      // menus first
      if (top && ['howto', 'options', 'pause', 'pat', 'final'].indexOf(top) >= 0) {
        if (inputs[0].back && (top === 'howto' || top === 'options')) UI.hide(top);
        else if (inputs[0].start && top === 'pause') this.setPaused(false);
        else {
          var navIn = top === 'pat' && this.game && this.twoPlayer ? inputs[this.slotForTeam(this.game.patTeam)] : inputs[0];
          UI.navMenu(top, navIn);
        }
      } else if (this.mode === 'title') {
        UI.navMenu('title', inputs[0]);
      } else if (this.mode === 'teams') {
        UI.teamInput(inputs);
      } else if (this.mode === 'game' && UI.ps) {
        UI.playInput(inputs);
        if (inputs[0].start || inputs[1].start) this.setPaused(true);
      } else if (this.mode === 'game' && (inputs[0].start || inputs[1].start)) {
        this.setPaused(true);
      }

      var g = this.mode === 'game' ? this.game : this.demo;
      if (!g) return;
      var blocked = this.paused || (this.mode === 'game' && (UI.isOpen('howto')));
      if (!blocked) {
        // fixed-step simulation
        this.acc += dt;
        var h = 1 / 60, n = 0;
        var gameInputs = this.mode === 'game' && !UI.ps && !UI.isOpen('pat') ? inputs : [];
        while (this.acc >= h && n < 6) {
          g.cpuStep(h);
          g.update(h, gameInputs);
          // edge-triggered buttons only count once
          if (gameInputs.length) gameInputs = gameInputs.map(function (i) { return { x: i.x, y: i.y, turbo: i.turbo, action: false, special: false, start: false }; });
          this.acc -= h; n++;
        }
        if (n === 6) this.acc = 0;
        this.handleEvents(g);
        if (this.mode === 'game') this.manageGame(g);
        else if (g.over) this.startDemo();
      }
      this.renderer.render(g, blocked ? 0 : dt);
      if (this.mode === 'game' || this.mode === 'title') {
        this.renderer.drawHUD(g, { hint: this.mode === 'game' ? this.hint(g) : null });
      }
      this.renderer.drawBanners(blocked ? 0 : dt);
      if (g.phase === 'break' && g.breakMsg && this.mode === 'game') {
        // break messages are announced via events; nothing extra to draw
      }
    },

    slotForTeam: function (team) {
      var g = this.game;
      for (var i = 0; i < g.ctl.length; i++) if (g.ctl[i].team === team) return g.ctl[i].slot;
      return 0;
    },

    manageGame: function (g) {
      // play selection
      if (g.phase === 'select' && g.selectWait <= 0 && !UI.ps && !this.selecting) {
        var humans = [];
        var offH = g.isHuman(g.poss), defH = g.isHuman(1 - g.poss);
        if (offH) humans.push({ slot: this.slotForTeam(g.poss), team: g.poss, side: 'off' });
        if (defH) humans.push({ slot: this.slotForTeam(1 - g.poss), team: 1 - g.poss, side: 'def' });
        humans.sort(function (x, y) { return x.slot - y.slot; });
        if (humans.length) {
          this.selecting = true;
          var self = this;
          var cpuOff = offH ? null : FB.AI.pickOffense(g);
          var cpuDef = defH ? null : FB.AI.pickDefense(g);
          UI.openPlays(g, humans, function (res) {
            self.selecting = false;
            if (self.game !== g) return;
            g.choosePlays(res.off || cpuOff, res.def || cpuDef);
          });
        }
      }
      if (g.phase === 'pat' && g.isHuman(g.patTeam) && !g.patChoice && !UI.isOpen('pat')) {
        UI.focus.pat = 0;
        UI.show('pat');
      }
      if (g.phase === 'final' && !this.finalShown) {
        this.finalShown = true;
        var self2 = this;
        setTimeout(function () {
          if (self2.game !== g) return;
          UI.renderFinal(g);
          UI.focus.final = 0;
          UI.show('final');
        }, 1800);
      }
    },

    hint: function (g) {
      if (this.twoPlayer || !g.ctl.length) return null;
      var c = g.ctl[0], pad = Input.lastDevice === 'gamepad', touch = document.body.classList.contains('touch') && Input.touch.active;
      var A = touch ? 'GO' : pad ? 'A' : 'SPACE', T = touch ? 'TURBO' : pad ? 'X' : 'SHIFT', S = touch ? 'JUMP' : pad ? 'B' : 'E';
      var b = g.ball;
      if (g.phase === 'presnap') {
        if (g.playType === 'kickoff') return null;
        if (c.team === g.poss) return A + ': SNAP';
        return A + ': SWITCH DEFENDER  •  MOVE TO SHIFT';
      }
      if (g.phase === 'live') {
        if (b.state === 'held' && b.holder === c.pl) {
          if (c.pl.role === 'QB' && !g.passThrown && !g.handedOff && g.playType !== 'run' && g.relX(c.pl.x) <= 0.5) return 'AIM + ' + A + ': PASS  •  ' + T + ': TURBO';
          return A + ': SPIN  •  ' + S + ': HURDLE  •  ' + T + ': TURBO';
        }
        if (b.state === 'air' && b.kind === 'pass') return S + ': JUMP FOR THE BALL';
        if (b.state === 'held' && b.holder && b.holder.team !== c.team) return A + ': DIVE / SWITCH  •  ' + T + ': TURBO';
      }
      if (g.phase === 'dead') return A + ': LATE HIT!';
      return null;
    },

    // ------------------------------------------------- events -> FX
    handleEvents: function (g) {
      var R = this.renderer, demo = this.mode !== 'game', self = this;
      var evs = g.events.splice(0, g.events.length);
      evs.forEach(function (e) {
        var d = e.data, team = d.team != null ? g.teams[d.team] : null;
        var sfx = !demo;
        switch (e.type) {
          case 'whistle': if (sfx) Audio.play('whistle'); break;
          case 'snap': if (sfx) Audio.play('snap'); break;
          case 'throw': if (sfx) Audio.play('throw'); break;
          case 'kick': if (sfx) Audio.play('kick'); break;
          case 'catch':
            if (sfx) { Audio.play('catch'); Audio.roar(0.25, 1.4); }
            break;
          case 'switch': if (sfx) Audio.play('switch'); break;
          case 'spin': if (sfx) Audio.play('spin'); break;
          case 'hit':
            if (d.p) R.burst(d.p.x, d.p.y, 1.0, d.big ? 18 : 8, ['#ffffff', '#ffe14a', '#9be38a'], d.big ? 6 : 3, 0.09);
            if (d.big) { R.shake = Math.max(R.shake, demo ? 0.3 : 0.8); if (!demo) R.flash = 0.4; }
            if (sfx) Audio.play(d.big ? 'bighit' : 'hit');
            break;
          case 'pancake': if (!demo && Math.random() < 0.5) R.banner('PANCAKE!', { big: false, dur: 1.1 }); break;
          case 'broken': if (d.p) R.burst(d.p.x, d.p.y, 0.3, 6, ['#6bd16b', '#3a8a3a'], 3, 0.08); break;
          case 'latehit':
            R.banner('LATE HIT!', { big: false, dur: 1.2, color: '#ff4d1f' });
            if (d.p) R.burst(d.p.x, d.p.y, 1.2, 14, ['#fff', '#ff4d1f'], 5, 0.1);
            R.shake = 0.6; if (sfx) Audio.play('bighit');
            break;
          case 'td':
            R.banner('TOUCHDOWN!', { sub: team ? team.city.toUpperCase() + ' ' + team.name.toUpperCase() : '', dur: 2.6 });
            if (d.p) for (var i = 0; i < 4; i++) R.burst(d.p.x, d.p.y, 2, 24, [team.c.jersey, team.c.trim, '#ffffff', '#ffd23a'], 8, 0.14);
            if (sfx) { Audio.play('td'); Audio.roar(1, 4); Audio.say('Touchdown!'); }
            break;
          case 'first': R.banner('FIRST DOWN', { big: false, dur: 1.4 }); if (sfx) Audio.say('First down'); break;
          case 'int':
            R.banner('INTERCEPTED!', { dur: 1.8, color: '#2ee6ff' });
            if (sfx) { Audio.roar(0.8, 2.5); Audio.say('Intercepted!'); }
            break;
          case 'fumble': R.banner('FUMBLE!', { dur: 1.6, color: '#ff4d1f' }); if (sfx) { Audio.roar(0.7, 2); Audio.say('Fumble!'); } break;
          case 'recovered': R.banner('TURNOVER!', { big: false, dur: 1.4 }); break;
          case 'sack': R.banner('SACK!', { dur: 1.5, color: '#ff4d1f' }); if (sfx) { Audio.roar(0.6, 2); Audio.say('Sacked!'); } break;
          case 'onfire':
            R.banner(team.abbr + ' ON FIRE!', { dur: 2.4, color: '#ff6a00' });
            if (sfx) { Audio.play('fire'); Audio.say("They're on fire!"); }
            break;
          case 'fireout': if (!demo) R.banner('FIRE\'S OUT', { big: false, dur: 1.2, color: '#6aa0ff' }); break;
          case 'fg':
            if (d.kind === 'xp') R.banner('EXTRA POINT GOOD', { big: false, dur: 1.6 });
            else { R.banner("IT'S GOOD!", { sub: d.dist + ' YARD FIELD GOAL', dur: 2.2 }); if (sfx) { Audio.roar(0.7, 2.5); Audio.say("It's good!"); } }
            break;
          case 'fgmiss':
            R.banner(d.kind === 'xp' ? 'XP NO GOOD' : 'NO GOOD!', { dur: 1.8, color: '#9aa3c7' });
            if (sfx) { Audio.play('buzz'); }
            break;
          case 'twopt': R.banner(d.good ? '2-POINT GOOD!' : '2-POINT NO GOOD', { big: !!d.good, dur: 1.8 }); break;
          case 'safety': R.banner('SAFETY!', { sub: '+2 ' + (team ? team.abbr : ''), dur: 2.2 }); if (sfx) Audio.say('Safety!'); break;
          case 'incomplete': R.banner('INCOMPLETE', { big: false, dur: 1.1, color: '#9aa3c7' }); break;
          case 'downs': R.banner('TURNOVER ON DOWNS', { big: false, dur: 1.8 }); break;
          case 'touchback': R.banner('TOUCHBACK', { big: false, dur: 1.3, color: '#9aa3c7' }); break;
          case 'punt': R.banner('PUNT', { big: false, dur: 1.2 }); break;
          case 'kickoff': if (!demo && g.time > 1) R.banner('KICKOFF', { big: false, dur: 1.2 }); break;
          case 'half': R.banner('HALFTIME', { dur: 2.4 }); if (sfx) Audio.play('buzz'); break;
          case 'quarter': R.banner(d.ot ? 'OVERTIME' : 'END OF ' + FB.ordinal(d.q - 1) + ' QUARTER', { dur: 2.2, big: !!d.ot }); if (sfx) Audio.play('buzz'); break;
          case 'final':
            R.banner('FINAL', { dur: 2.6 });
            if (sfx) { Audio.play('buzz'); Audio.roar(0.9, 4); }
            break;
          case 'select': if (sfx) Audio.roar(0, 1); break;
        }
      });
    }
  };

  FB.App = App;
  window.addEventListener('DOMContentLoaded', function () { App.init(); });
})();
