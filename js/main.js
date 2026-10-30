/*
 * Football Blitz '26 — app shell: screens, main loop, events -> sound/FX.
 */
(function () {
  var FB = window.FB;
  var UI = FB.UI, Input = FB.Input, Audio = FB.Audio;

  var OPTS_KEY = 'fb26-options';
  var QLENS = [60, 120, 180, 240];
  var DIFFS = ['ROOKIE', 'PRO', 'ALL-PRO'];
  var GAME_SPEED = 0.88;
  FB.GAME_SPEED = GAME_SPEED;

  var App = {
    mode: 'title',        // title | teams | game
    game: null,
    demo: null,
    paused: false,
    twoPlayer: false,
    lastTeams: null,
    opts: { aimAssist: true, wind: true, powerups: true, music: true, qlen: 120, diff: 1, sound: true, announcer: true, gfx: 'auto', bigHeads: false, infTurbo: false, weather: 'clear', replays: true, unlocked: false },
    rec: { frames: [], players: null },
    replay: null,
    replayPending: false,
    codeBuf: '',
    slow: { scale: 1, t: 0 },
    hitstop: 0,
    acc: 0,
    last: 0,
    finalShown: false,
    returnTo: null,

    init: function () {
      this.loadOpts();
      Input.init();
      this.canvas = document.getElementById('game');
      var isTouchDev = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
      var lowEnd = isTouchDev || (navigator.hardwareConcurrency || 8) <= 4 || Math.min(screen.width, screen.height) < 500;
      this.quality = this.opts.gfx === 'auto' ? (lowEnd ? 'low' : 'high') : this.opts.gfx;
      this.renderer = FB.createRenderer3D ? FB.createRenderer3D(document.getElementById('game3d'), this.canvas, this.quality) : null;
      if (this.renderer) document.body.classList.add('gl');
      else this.renderer = new FB.Renderer(this.canvas);
      var self = this;
      window.addEventListener('resize', function () { self.renderer.resize(); });
      UI.init(function (screen, action) { self.onMenu(screen, action); });
      if (this.opts.unlocked) this.addHiddenTeam();
      FB.cheats = { bigHeads: this.opts.bigHeads };
      // secret code on the title screen: type the name of the game
      window.addEventListener('keydown', function (e) {
        if (self.mode !== 'title' || !/^Key[A-Z]$/.test(e.code)) return;
        self.codeBuf = (self.codeBuf + e.code.charAt(3)).slice(-5);
        if (self.codeBuf === 'BLITZ' && !self.opts.unlocked) {
          self.opts.unlocked = true; self.saveOpts(); self.addHiddenTeam(); self.applyOptLabels();
          self.renderer.banner('SECRET TEAM UNLOCKED!', { sub: 'THE BLITZ LEGENDS', dur: 3, color: '#ffd23a' });
          Audio.init(); Audio.play('fire');
        }
      });
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
      var unlock = function () { Audio.init(); if (self.mode !== 'game') Audio.startMusic(); };
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
          if (['auto', 'high', 'low'].indexOf(o.gfx) >= 0) this.opts.gfx = o.gfx;
          this.opts.bigHeads = !!o.bigHeads;
          this.opts.infTurbo = !!o.infTurbo;
          if (['clear', 'rain', 'snow', 'fog', 'random'].indexOf(o.weather) >= 0) this.opts.weather = o.weather;
          this.opts.replays = o.replays !== false;
          this.opts.unlocked = !!o.unlocked;
          this.opts.music = o.music !== false;
          this.opts.wind = o.wind !== false;
          this.opts.powerups = o.powerups !== false;
          this.opts.aimAssist = o.aimAssist !== false;
        }
      } catch (e) { /* storage unavailable */ }
      Audio.enabled = this.opts.sound;
      Audio.announcer = this.opts.announcer;
      Audio.musicOn = this.opts.music;
    },
    saveOpts: function () {
      try { localStorage.setItem(OPTS_KEY, JSON.stringify(this.opts)); } catch (e) { /* ignore */ }
    },
    applyOptLabels: function () {
      UI.setLabel('options', 'qlen', 'QUARTER LENGTH: ' + FB.fmtClock(this.opts.qlen));
      UI.setLabel('options', 'diff', 'CPU SKILL: ' + DIFFS[this.opts.diff]);
      UI.setLabel('options', 'aim', 'AIM ASSIST: ' + (this.opts.aimAssist ? 'ON' : 'OFF'));
      UI.setLabel('options', 'sound', 'SOUND: ' + (this.opts.sound ? 'ON' : 'OFF'));
      UI.setLabel('pause', 'sound', 'SOUND: ' + (this.opts.sound ? 'ON' : 'OFF'));
      UI.setLabel('options', 'announcer', 'ANNOUNCER VOICE: ' + (this.opts.announcer ? 'ON' : 'OFF'));
      UI.setLabel('options', 'music', 'MENU MUSIC: ' + (this.opts.music ? 'ON' : 'OFF'));
      UI.setLabel('extras', 'bigheads', 'BIG HEADS: ' + (this.opts.bigHeads ? 'ON' : 'OFF'));
      UI.setLabel('extras', 'infturbo', 'INFINITE TURBO: ' + (this.opts.infTurbo ? 'ON' : 'OFF'));
      UI.setLabel('extras', 'weather', 'WEATHER: ' + this.opts.weather.toUpperCase());
      UI.setLabel('extras', 'replays', 'INSTANT REPLAYS: ' + (this.opts.replays ? 'ON' : 'OFF'));
      UI.setLabel('extras', 'wind', 'WIND: ' + (this.opts.wind ? 'ON' : 'OFF'));
      UI.setLabel('extras', 'powerups', 'POWER-UPS: ' + (this.opts.powerups ? 'ON' : 'OFF'));
      var hn = document.getElementById('hidden-note');
      if (hn) hn.textContent = this.opts.unlocked ? 'SECRET TEAM: BLITZ LEGENDS UNLOCKED. Find them at the end of the team list.' : 'SECRET TEAM: LOCKED. Hint: type the name of the game on the title screen.';
      UI.setLabel('options', 'gfx', 'GRAPHICS: ' + this.opts.gfx.toUpperCase() + (this.opts.gfx === 'auto' ? ' (' + (this.quality || 'high').toUpperCase() + ')' : ''));
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
        else if (action === 'extras') { UI.show('extras'); }
        else if (action === 'create') { this.mode = 'create'; UI.openCreatePlay(); }
      } else if (screen === 'extras') {
        if (action === 'bigheads') { o.bigHeads = !o.bigHeads; FB.cheats.bigHeads = o.bigHeads; }
        else if (action === 'infturbo') o.infTurbo = !o.infTurbo;
        else if (action === 'weather') { var W = ['clear', 'rain', 'snow', 'fog', 'random']; o.weather = W[(W.indexOf(o.weather) + 1) % W.length]; }
        else if (action === 'replays') o.replays = !o.replays;
        else if (action === 'wind') o.wind = !o.wind;
        else if (action === 'powerups') o.powerups = !o.powerups;
        else if (action === 'back') UI.hide('extras');
        this.saveOpts(); this.applyOptLabels();
      } else if (screen === 'createplay') {
        if (action === 'save') { FB.saveCustomPlay(UI.cp.sel); this.renderer.banner('PLAY SAVED', { big: false, dur: 1.4 }); }
        UI.hide('createplay'); UI.cp = null; this.mode = 'title';
      } else if (screen === 'options') {
        if (action === 'qlen') o.qlen = QLENS[(QLENS.indexOf(o.qlen) + 1) % QLENS.length];
        else if (action === 'diff') o.diff = (o.diff + 1) % 3;
        else if (action === 'aim') { o.aimAssist = !o.aimAssist; if (this.game) this.game.aimAssist = o.aimAssist; }
        else if (action === 'sound') { o.sound = !o.sound; Audio.setEnabled(o.sound); }
        else if (action === 'announcer') { o.announcer = !o.announcer; Audio.announcer = o.announcer; }
        else if (action === 'music') { o.music = !o.music; Audio.setMusic(o.music); if (o.music && this.mode !== 'game') Audio.startMusic(); }
        else if (action === 'gfx') {
          o.gfx = { auto: 'high', high: 'low', low: 'auto' }[o.gfx];
          this.saveOpts();
          location.reload();
          return;
        }
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
        else if (action === 'timeout') {
          var gg = this.game, mine = gg && gg.ctl.length ? gg.ctl[0].team : null;
          this.setPaused(false);
          if (gg && mine != null && !gg.callTimeout(mine)) this.renderer.banner('NO TIMEOUTS LEFT', { big: false, dur: 1.2, color: '#ff4d1f' });
        }
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
      Audio.startMusic();
      Input.setMode(false);
      UI.show('title');
      this.startDemo();
    },

    setPaused: function (on) {
      this.paused = on;
      this.heldEdges = null;
      if (on) UI.show('pause'); else { UI.hide('pause'); UI.hide('howto'); }
    },

    // -------------------------------------------------------- games
    startDemo: function () {
      var n = FB.TEAMS.length, a = Math.floor(Math.random() * n), b = (a + 1 + Math.floor(Math.random() * (n - 1))) % n;
      this.demo = new FB.Game({ teams: [FB.TEAMS[a], FB.TEAMS[b]], humans: [], quarterLen: 90, attract: true });
      this.renderer.reset();
      if (this.renderer.setWeather) this.renderer.setWeather('clear');
    },

    startGame: function (a, b) {
      this.demo = null;
      var humans = [{ slot: 0, team: 0 }];
      if (this.twoPlayer) humans.push({ slot: 1, team: 1 });
      var weather = this.opts.weather === 'random' ? ['clear', 'clear', 'rain', 'snow', 'fog'][Math.floor(Math.random() * 5)] : this.opts.weather;
      this.game = new FB.Game({ teams: [FB.TEAMS[a], FB.TEAMS[b]], humans: humans, quarterLen: this.opts.qlen, difficulty: this.opts.diff, weather: weather, infTurbo: this.opts.infTurbo, aimAssist: this.opts.aimAssist, wind: this.opts.wind, powerups: this.opts.powerups });
      if (this.renderer.setWeather) this.renderer.setWeather(weather);
      this.replay = null; this.replayPending = false; this.rec = { frames: [], players: null };
      this.mode = 'game';
      this.finalShown = false;
      this.selecting = false;
      this.renderer.reset();
      this.slow = { scale: 1, t: 0 }; this.hitstop = 0;
      document.getElementById('touch').classList.add('show');
      Audio.init();
      Audio.stopMusic();
      Audio.roar(0.6, 3);
      Audio.call('kickoff', true);
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
      // a press that a menu consumed this frame must not also reach the game
      var menuOwnedInput = !!UI.ps || UI.isOpen('pat') || !!top;
      // menus first
      if (top === 'createplay') {
        UI.createPlayInput(inputs[0]);
      } else if (top && ['howto', 'options', 'extras', 'pause', 'pat', 'final'].indexOf(top) >= 0) {
        if (inputs[0].back && (top === 'howto' || top === 'options' || top === 'extras')) UI.hide(top);
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

      // team select: 3D showcase of both uniforms
      if (this.mode === 'teams' && this.renderer.renderShowcase && UI.teamSel) {
        this.renderer.renderShowcase(FB.TEAMS[UI.teamSel.idx[0]], FB.TEAMS[UI.teamSel.idx[1]], dt);
        return;
      }
      var g = this.mode === 'game' ? this.game : this.demo;
      if (!g) return;
      if (this.replay) { this.aimUI = null; this.setAimCursor(false); this.stepReplay(dt, inputs); return; }
      if (this.mode === 'game') this.pointerAim(g, dt, inputs);
      else this.aimUI = null;
      var blocked = this.paused || (this.mode === 'game' && (UI.isOpen('howto')));
      // game feel: hit-stop and slow motion on big moments
      // the whole game runs a touch slower than real time so plays are easier to read
      var simDt = dt * GAME_SPEED;
      if (this.hitstop > 0) { this.hitstop -= dt; simDt = 0; }
      else if (this.slow.t > 0) { this.slow.t -= dt; simDt *= this.slow.scale; }
      var R0 = this.renderer;
      if (!blocked) {
        // fixed-step simulation
        this.acc += simDt;
        var h = 1 / 60, n = 0;
        var gameInputs = this.mode === 'game' && !UI.ps && !UI.isOpen('pat') ? inputs : [];
        // edges only count once; the pointer aim carries over without its release
        var noEdges = function (i) { return { x: i.x, y: i.y, turbo: i.turbo, action: false, special: false, start: false, aim: i.aim ? { x: i.aim.x, y: i.aim.y, power: i.aim.power } : null }; };
        if (menuOwnedInput && gameInputs.length) gameInputs = gameInputs.map(function (i) { return { x: i.x, y: i.y, turbo: i.turbo, action: false, special: false, start: false }; });
        // A press on a frame where no sim step runs (fast monitors, the slowed
        // game speed, hit-stop) is held over until a step does run, so taps
        // like the kick meter are never dropped.
        var held = this.heldEdges || [];
        if (gameInputs.length) gameInputs = gameInputs.map(function (i, k) {
          var e = held[k];
          if (!e || menuOwnedInput) return i;
          return Object.assign({}, i, { action: i.action || e.action, special: i.special || e.special, rec: i.rec || e.rec });
        });
        if (this.renderer.heading && g.phase === 'live') g.camHeading = this.renderer.heading(); else g.camHeading = null;
        while (this.acc >= h && n < 6) {
          g.cpuStep(h);
          g.update(h, gameInputs);
          if (gameInputs.length) gameInputs = gameInputs.map(noEdges);
          this.acc -= h; n++;
        }
        this.heldEdges = n > 0 ? null : gameInputs.map(function (i) { return (i.action || i.special || i.rec) ? { action: i.action, special: i.special, rec: i.rec } : null; });
        // a release that landed on a frame with no sim step waits for the next one
        if (n > 0 && this.aim) this.aim.pending = null;
        if (n === 6) this.acc = 0;
        this.handleEvents(g);
        if (this.mode === 'game') {
          var self3 = this;
          this.prevTurbo = this.prevTurbo || [false, false];
          inputs.forEach(function (inp, i) {
            if (inp && inp.turbo && !self3.prevTurbo[i] && g.phase === 'live' && (Math.abs(inp.x) + Math.abs(inp.y) > 0.2)) Audio.play('turbo');
            self3.prevTurbo[i] = !!(inp && inp.turbo);
          });
          this.footsteps(g, simDt);
          // timeouts: T / numpad minus / gamepad Back
          inputs.forEach(function (inp, i) {
            if (!inp || !inp.timeout || menuOwnedInput) return;
            var cc = null; g.ctl.forEach(function (k) { if (k.slot === i) cc = k; });
            if (cc && !g.callTimeout(cc.team) && g.timeouts[cc.team] <= 0) R0.banner('NO TIMEOUTS LEFT', { big: false, dur: 1.2, color: '#ff4d1f' });
          });
          this.crackleT = (this.crackleT || 0) - dt;
          if ((g.fire[0] || g.fire[1]) && g.phase === 'live' && this.crackleT <= 0) { Audio.play('crackle'); this.crackleT = 0.35; }
          this.record(g);
          if (this.replayPending && g.phase === 'dead' && g.deadT < 0.5) this.startReplay(g);
          this.manageGame(g);
        } else if (g.over) this.startDemo();
      }
      this.renderer.render(g, blocked ? 0 : (simDt > 0 ? Math.max(simDt, dt * 0.25) : 0));
      if (this.mode === 'game' && this.renderer.drawAim) this.renderer.drawAim(g, blocked ? null : this.aimUI);
      if (this.mode === 'game') {
        var touchOn = document.body.classList.contains('touch') && this.mode === 'game';
        this.renderer.drawHUD(g, { hint: this.mode === 'game' ? this.hint(g) : null, top: touchOn || this.mode === 'title' });
      }
      this.renderer.drawBanners(blocked ? 0 : dt);
      if (g.phase === 'break' && g.breakMsg && this.mode === 'game') {
        // break messages are announced via events; nothing extra to draw
      }
    },

    // ------------------------------------------- point-and-click passing
    // Press on the field to start a throw, release to let it go. A quick click
    // is a normal pass; holding fills the power ring from lob to bullet, and
    // releasing on the gold band is a PERFECT throw (much tighter accuracy).
    // Hold too long and the throw wobbles. Right-click cancels.
    pointerAim: function (g, dt, inputs) {
      var TAP = 0.12, FILL = 0.7, GRACE = 0.15, ZONE = [0.8, 0.93];
      var m = Input.pollMouse(), A = this.aim || (this.aim = { charging: false, t: 0, zoneHit: false, flash: 0, pending: null });
      A.flash = Math.max(0, A.flash - dt);
      var c = null;
      g.ctl.forEach(function (k) { if (k.slot === 0) c = k; });
      var pl = c && c.pl, b = g.ball;
      var menu = this.paused || !!UI.ps || UI.isOpen('pat') || !!UI.top();
      var spot = m.on ? this.renderer.groundAt(m.sx, m.sy) : null;
      var canAim = !menu && !!spot && g.phase === 'live' && !!pl && b.state === 'held' && b.holder === pl && g.canPass(pl);
      var ui = { active: false, flash: A.flash, fx: A.fx, fy: A.fy };
      this.aimUI = ui;
      this.setAimCursor(canAim);
      // clicking a receiver icon = pressing his number (hot route before the snap, pass after it)
      var badge = null;
      if (!menu && m.pressed) (FB.recBadges || []).forEach(function (bd) { if (Math.hypot(m.sx - bd.x, m.sy - bd.y) <= bd.r) badge = bd; });
      if (badge) { inputs[0].rec = badge.n; m.pressed = false; }
      if (!canAim) {
        A.charging = false; A.pending = null;
        // elsewhere a click is the Action button (snap, switch, dive, spin) and right-click is Special
        if (!menu && m.pressed) inputs[0].action = true;
        if (!menu && m.right) inputs[0].special = true;
        return;
      }
      if (m.pressed) { A.charging = true; A.t = 0; A.zoneHit = false; }
      if (m.right) {
        if (A.charging) { A.charging = false; Audio.play('menu'); }
        else inputs[0].special = true;
      }
      if (A.charging) A.t += dt;
      var fill = Math.max(0, Math.min(1, (A.t - TAP) / FILL));
      var over = A.charging ? Math.max(0, A.t - TAP - FILL - GRACE) : 0;
      var inZone = fill >= ZONE[0] && fill <= ZONE[1];
      if (A.charging && inZone && !A.zoneHit) { A.zoneHit = true; Audio.play('zone'); }
      var tap = A.t < TAP;
      var power = !A.charging || tap ? 0.5 : fill;
      if (A.charging && (m.released || !m.down)) {
        var perfect = !tap && inZone;
        A.pending = { power: power, perfect: perfect, accMul: perfect ? 0.3 : over > 0 ? 1 + Math.min(1.6, over * 3) : 1 };
        A.charging = false;
        if (perfect) { A.flash = 0.5; A.fx = m.sx; A.fy = m.sy; }
      }
      var P = A.pending;
      inputs[0].aim = { x: spot.x, y: spot.y, power: P ? P.power : power, release: !!P, accMul: P ? P.accMul : 1, perfect: P ? P.perfect : false };
      // preview every frame (not just on sim steps) so it tracks the pointer through hit-stop
      ui.plan = g.planPass(pl, spot, inputs[0].aim.power, null, true);
      ui.active = true; ui.sx = m.sx; ui.sy = m.sy; ui.charging = A.charging; ui.tap = tap; ui.fill = fill; ui.over = over; ui.zone = ZONE;
      ui.flash = A.flash; ui.fx = A.fx; ui.fy = A.fy;
    },

    setAimCursor: function (on) {
      if (this.aimCursor === on) return;
      this.aimCursor = on;
      document.body.classList.toggle('aiming', on);
    },

    // Cleats under the human-controlled players (and the ball carrier), about
    // four strides a second at full speed.
    footsteps: function (g, dt) {
      if (g.phase !== 'live' || dt <= 0) return;
      var b = g.ball;
      g.players.forEach(function (p) {
        var on = p.ctl >= 0 || (b.state === 'held' && b.holder === p);
        if (!on || p.state !== 'ok' || p.z > 0.05) { p.stepAcc = 0; return; }
        var v = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (v < 1.5) return;
        p.stepAcc = (p.stepAcc || 0) + dt * (1.4 + v * 0.36);
        if (p.stepAcc >= 1) { p.stepAcc -= 1; Audio.play('step'); }
      });
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
            g.choosePlays(res.off || cpuOff, res.def || cpuDef, offH ? !!res.flip : Math.random() < 0.5);
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
      if (g.phase === 'anim' && g.kickAnim && g.kickAnim.human && g.kickAnim.stage === 'meter') return A + ': ' + (g.kickAnim.power == null ? 'SET POWER' : 'SET AIM (CENTER = STRAIGHT, AIM INTO THE WIND)');
      if (g.phase === 'presnap') {
        if (g.playType === 'kickoff' && g.koMeter && !g.koMeter.set && c.team === g.kickTeam) return A + ': SET KICK POWER  \u2022  ' + S + ': ONSIDE KICK' + (g.onside ? ' \u2713' : '');
        if (g.playType === 'kickoff') return c.team === g.kickTeam ? A + ': KICK  \u2022  ' + S + ': ONSIDE KICK' + (g.onside ? ' \u2713' : '') : null;
        if (c.team === g.poss) return A + ': SNAP  \u2022  ' + S + ': AUDIBLE' + (g.playType !== 'run' && !pad && !touch ? '  \u2022  1-4: HOT ROUTE' : '');
        return A + ': SWITCH DEFENDER  \u2022  ' + S + ': AUDIBLE';
      }
      if (g.phase === 'live') {
        if (b.state === 'held' && b.holder === c.pl) {
          if (this.aimUI && this.aimUI.active) return 'CLICK: PASS  \u2022  1-4: THROW TO ICON  \u2022  HOLD + RELEASE ON GOLD: PERFECT  \u2022  RIGHT-CLICK: CANCEL';
          if (c.pl.role === 'QB' && !g.passThrown && !g.handedOff && g.playType !== 'run' && g.relX(c.pl.x) <= 0.5) return (touch || pad ? 'AIM + ' + A : 'CLICK A RECEIVER (OR AIM + ' + A + ')') + ': PASS  \u2022  HOLD ' + T + ': BULLET PASS';
          return A + ': SPIN  \u2022  ' + T + '+' + A + ': STIFF ARM  \u2022  ' + S + ': HURDLE  \u2022  ' + T + '+' + S + ': LATERAL';
        }
        if (b.state === 'held' && b.holder && b.holder.team === c.team) return A + ': SWITCH TO BALL CARRIER';
        if (b.state === 'air' && b.kind === 'pass') return A + ': SWITCH PLAYER  \u2022  ' + S + ': JUMP FOR THE BALL';
        if (b.state === 'loose') return A + ': SWITCH TO NEAREST PLAYER';
        if (b.state === 'held' && b.holder && b.holder.team !== c.team) return A + ': DIVE / SWITCH  •  ' + T + ': TURBO';
      }
      if (g.phase === 'dead') return A + ': LATE HIT!';
      if (g.phase === 'break' && g.halftime && g.halftime.t > 1.5) return A + ': SKIP HALFTIME SHOW';
      return null;
    },

    slowmo: function (scale, secs) { this.slow = { scale: scale, t: secs }; },

    addHiddenTeam: function () { if (FB.TEAMS.indexOf(FB.HIDDEN_TEAM) < 0) FB.TEAMS.push(FB.HIDDEN_TEAM); },

    // ------------------------------------------------- instant replay
    record: function (g) {
      var R = this.rec;
      if (g.phase === 'presnap' || R.players !== g.players) { R.frames = []; R.players = g.players; }
      if (g.phase !== 'live' && g.phase !== 'dead') return;
      var last = R.frames[R.frames.length - 1];
      if (last && last.t >= g.time) return;
      var b = g.ball;
      R.frames.push({
        t: g.time,
        p: g.players.map(function (p) { return [p.x, p.y, p.z, p.vx, p.vy, p.face, p.anim, p.state, p.spinT, p.jumpT, p.stiffT || 0, p.eng ? 1 : 0]; }),
        b: [b.x, b.y, b.z, b.state, g.players.indexOf(b.holder), b.spin, b.kind, b.sx, b.sy, b.tx, b.ty, b.t, b.T]
      });
      if (R.frames.length > 900) R.frames.shift();
    },

    startReplay: function (g) {
      this.replayPending = false;
      var F = this.rec.frames;
      if (!this.opts.replays || F.length < 30) return;
      var tEnd = F[F.length - 1].t, i = 0;
      while (i < F.length - 1 && F[i].t < tEnd - 6) i++;
      var proxies = this.rec.players.map(function (p) { var q = Object.create(p); q.eng = null; return q; });
      var view = Object.create(g);
      view.players = proxies; view.ball = {}; view.phase = 'live'; view.replay = true; view.passTarget = null; view.ctl = []; view.events = [];
      this.replay = { g: g, frames: F.slice(i), i: 0, t: F[i].t, view: view, age: 0 };
      this.applyReplayFrame();
      this.renderer.banner('INSTANT REPLAY', { big: false, dur: 1.4, color: '#ff4d1f' });
    },

    applyReplayFrame: function () {
      var r = this.replay, f = r.frames[r.i], ps = r.view.players;
      f.p.forEach(function (a, k) {
        var q = ps[k];
        q.x = a[0]; q.y = a[1]; q.z = a[2]; q.vx = a[3]; q.vy = a[4]; q.face = a[5]; q.anim = a[6]; q.state = a[7];
        q.spinT = a[8]; q.jumpT = a[9]; q.stiffT = a[10]; q.eng = a[11] ? true : null; q.ctl = -1;
      });
      var b = f.b, B = r.view.ball;
      B.x = b[0]; B.y = b[1]; B.z = b[2]; B.state = b[3]; B.holder = b[4] >= 0 ? ps[b[4]] : null; B.spin = b[5]; B.kind = b[6];
      B.sx = b[7]; B.sy = b[8]; B.tx = b[9]; B.ty = b[10]; B.t = b[11]; B.T = b[12]; B.target = null;
    },

    stepReplay: function (dt, inputs) {
      var r = this.replay, skip = false;
      r.age += dt;
      inputs.forEach(function (i) { if (i && (i.action || i.start)) skip = true; });
      r.t += dt * 0.55;
      while (r.i < r.frames.length - 1 && r.frames[r.i + 1].t <= r.t) r.i++;
      this.applyReplayFrame();
      this.renderer.render(r.view, dt * 0.55);
      if (this.renderer.drawReplayBug) this.renderer.drawReplayBug(r.age, 'PRESS ' + (Input.lastDevice === 'gamepad' ? 'A' : 'SPACE') + ' TO SKIP');
      this.renderer.drawBanners(dt);
      if ((skip && r.age > 0.3) || r.i >= r.frames.length - 1) {
        this.replay = null;
        if (this.renderer.cam) this.renderer.cam.init = false;
      }
    },

    // ------------------------------------------------- events -> FX
    handleEvents: function (g) {
      var R = this.renderer, demo = this.mode !== 'game', self = this;
      var evs = g.events.splice(0, g.events.length);
      evs.forEach(function (e) {
        var d = e.data, team = d.team != null ? g.teams[d.team] : null;
        var sfx = !demo;
        switch (e.type) {
          case 'whistle':
            if (sfx) Audio.play('whistle');
            if (!demo && g.result && g.result.data && g.result.data.x != null && g.playType !== 'kickoff' && g.result.ballTeam === g.poss && (g.result.data.x - g.losX) * g.dir >= 25) self.replayPending = true;
            break;
          case 'meter': if (sfx) Audio.play('select'); break;
          case 'powerup':
            R.banner({ speed: 'SPEED BOOST!', hands: 'MAGNET HANDS!', tank: 'TANK MODE!' }[d.type], { sub: d.p && d.p.info.name ? d.p.info.name.toUpperCase() : '', dur: 1.8, color: (FB.POWER_COLORS || {})[d.type] });
            if (sfx) { Audio.play('fire'); }
            if (d.p) R.burst(d.p.x, d.p.y, 1.2, 24, [(FB.POWER_COLORS || {})[d.type] || '#fff', '#ffffff'], 5, 0.1);
            break;
          case 'tipped': R.banner(d.batted ? 'BATTED DOWN!' : 'TIPPED!', { big: false, dur: 1.2, color: '#2ee6ff' }); if (sfx) Audio.play('catch'); break;
          case 'hot': if (!demo && g.isHuman(g.poss)) R.banner('HOT ROUTE', { big: false, dur: 1.0, color: '#ffd23a' }); break;
          case 'hotroute': if (sfx) Audio.play('switch'); break;
          case 'timeoutcalled': if (!demo) R.banner('TIMEOUT CALLED', { big: false, sub: 'AFTER THE PLAY', dur: 1.2, color: '#2ee6ff' }); break;
          case 'timeout':
            R.banner('TIMEOUT', { sub: g.teams[d.team].name.toUpperCase() + '  \u2022  ' + d.left + ' LEFT', dur: 1.8, color: '#2ee6ff' });
            if (sfx) Audio.play('whistle');
            break;
          case 'twomin':
            R.banner(d.at >= 120 ? 'TWO-MINUTE WARNING' : FB.fmtClock(d.at) + ' WARNING', { dur: 2.0, color: '#ffd23a' });
            if (sfx) { Audio.play('whistleLong'); Audio.roar(0.3, 2); }
            break;
          case 'oobcatch': R.banner('OUT OF BOUNDS', { big: false, sub: 'NO CATCH', dur: 1.4, color: '#ff4d1f' }); break;
          case 'audible': R.banner('AUDIBLE!', { big: false, sub: d.name, dur: 1.3, color: '#2ee6ff' }); if (sfx) { Audio.play('switch'); Audio.call('audible'); } break;
          case 'onsidecall': if (sfx) Audio.play('switch'); break;
          case 'onside': R.banner('ONSIDE KICK!', { dur: 1.5, color: '#ff4d1f' }); if (sfx) Audio.call('onside'); break;
          case 'onsidegood':
            R.banner('RECOVERED!', { sub: team ? team.name.toUpperCase() + ' BALL' : '', dur: 2 });
            if (R.cheer) R.cheer(0.9);
            if (!demo) { self.replayPending = true; if (sfx) Audio.say('They recovered it!', true); }
            break;
          case 'onsidefail': R.banner('RECEIVING TEAM RECOVERS', { big: false, dur: 1.5 }); break;
          case 'lateral': R.banner('LATERAL!', { big: false, dur: 1.0 }); if (sfx) { Audio.play('throw'); Audio.call('lateral'); } break;
          case 'stiff': if (sfx) { Audio.play('hit'); if (Math.random() < 0.4) Audio.call('stiff'); } if (!demo && Math.random() < 0.35) R.banner('STIFF ARM!', { big: false, dur: 0.9 }); break;
          case 'cadence': if (sfx) Audio.cadence(d.word, d.n); break;
          case 'snap': if (sfx) Audio.play('snap'); break;
          case 'throw':
            if (sfx) Audio.play(g.ball && g.ball.bullet ? 'bullet' : 'throw');
            if (R.notify) R.notify('throw', d);
            if (d.perfect) {
              if (sfx) Audio.play('perfect');
              if (d.p) R.burst(d.p.x, d.p.y, 1.9, 22, ['#ffd23a', '#ffffff', '#ff9a1f'], 5, 0.09);
              self.hitstop = Math.max(self.hitstop, 0.05);
              Input.rumble(0.3, 0.6, 90);
            }
            break;
          case 'kick': if (sfx) Audio.play('kick'); break;
          case 'catch':
            if (sfx) { Audio.play('catch'); Audio.roar(0.25, 1.4); }
            if (R.cheer) R.cheer(0.25);
            break;
          case 'switch': if (sfx) Audio.play('switch'); break;
          case 'dive': case 'jump': if (sfx) Audio.play('rustle'); break;
          case 'spin': if (sfx) Audio.play('spin'); break;
          case 'hit':
            if (d.p) R.burst(d.p.x, d.p.y, 1.0, d.big ? 18 : 8, ['#ffffff', '#ffe14a', '#9be38a'], d.big ? 6 : 3, 0.09);
            if (d.big) {
              R.shake = Math.max(R.shake, demo ? 0.3 : 0.8);
              if (!demo) { R.flash = 0.25; R.punch = 1; self.hitstop = 0.07; self.slowmo(0.45, 0.35); Input.rumble(1, 0.6, 220); }
            } else if (!demo) Input.rumble(0.4, 0.3, 90);
            if (sfx) { Audio.play(d.big ? 'bighit' : 'hit'); if (d.big && Math.random() < 0.45) Audio.call('bighit'); }
            break;
          case 'pancake': if (!demo && Math.random() < 0.5) R.banner('PANCAKE!', { big: false, dur: 1.1 }); break;
          case 'broken': if (d.p) R.burst(d.p.x, d.p.y, 0.3, 6, ['#6bd16b', '#3a8a3a'], 3, 0.08); break;
          case 'latehit':
            R.banner('LATE HIT!', { big: false, dur: 1.2, color: '#ff4d1f' });
            if (d.p) R.burst(d.p.x, d.p.y, 1.2, 14, ['#fff', '#ff4d1f'], 5, 0.1);
            R.shake = 0.6; if (sfx) { Audio.play('bighit'); Audio.call('late'); }
            break;
          case 'td':
            R.banner('TOUCHDOWN!', { sub: team ? team.city.toUpperCase() + ' ' + team.name.toUpperCase() : '', dur: 2.6 });
            if (d.p) for (var i = 0; i < 4; i++) R.burst(d.p.x, d.p.y, 2, 24, [team.c.jersey, team.c.trim, '#ffffff', '#ffd23a'], 8, 0.14);
            if (sfx) { Audio.play('td'); Audio.play('horn'); Audio.roar(1, 4); Audio.call('td', true); }
            if (R.confetti && d.p) R.confetti(d.p.x, d.p.y, [team.c.jersey, team.c.trim, '#ffffff', '#ffd23a']);
            if (R.cheer) R.cheer(1);
            if (!demo) { self.slowmo(0.35, 1.0); Input.rumble(0.8, 0.8, 400); self.replayPending = true; }
            break;
          case 'first': R.banner('FIRST DOWN', { big: false, dur: 1.4 }); if (sfx) Audio.call('first'); break;
          case 'int':
            R.banner('INTERCEPTED!', { dur: 1.8, color: '#2ee6ff' });
            if (R.cheer) R.cheer(0.8);
            if (!demo) { self.slowmo(0.4, 0.6); R.punch = 1; self.replayPending = true; }
            if (sfx) { Audio.roar(0.8, 2.5); Audio.call('int', true); }
            break;
          case 'fumble': R.banner('FUMBLE!', { dur: 1.6, color: '#ff4d1f' }); if (sfx) { Audio.roar(0.7, 2); Audio.call('fumble', true); } break;
          case 'recovered': R.banner('TURNOVER!', { big: false, dur: 1.4 }); break;
          case 'sack': R.banner('SACK!', { dur: 1.5, color: '#ff4d1f' }); if (R.cheer) R.cheer(0.6); if (sfx) { Audio.roar(0.6, 2); Audio.call('sack', true); } break;
          case 'onfire':
            R.banner(team.abbr + ' ON FIRE!', { dur: 2.4, color: '#ff6a00', band: 'rgba(120,30,0,0.75)' });
            if (R.cheer) R.cheer(0.7);
            if (sfx) { Audio.play('fire'); Audio.call('fire', true); }
            break;
          case 'fireout': if (!demo) R.banner('FIRE\'S OUT', { big: false, dur: 1.2, color: '#6aa0ff' }); break;
          case 'fg':
            if (d.kind === 'xp') R.banner('EXTRA POINT GOOD', { big: false, dur: 1.6 });
            else { R.banner("IT'S GOOD!", { sub: d.dist + ' YARD FIELD GOAL', dur: 2.2 }); if (sfx) { Audio.roar(0.7, 2.5); Audio.call('fg'); } }
            break;
          case 'fgmiss':
            R.banner(d.kind === 'xp' ? 'XP NO GOOD' : 'NO GOOD!', { sub: d.why === 'short' ? 'SHORT' : d.why === 'wide' ? 'WIDE' : '', dur: 1.8, color: '#9aa3c7' });
            if (sfx) { Audio.play('buzz'); if (d.kind !== 'xp') Audio.call('fgmiss'); }
            break;
          case 'twopt': R.banner(d.good ? '2-POINT GOOD!' : '2-POINT NO GOOD', { big: !!d.good, dur: 1.8 }); break;
          case 'safety': R.banner('SAFETY!', { sub: '+2 ' + (team ? team.abbr : ''), dur: 2.2 }); if (sfx) Audio.call('safety'); break;
          case 'incomplete': R.banner('INCOMPLETE', { big: false, dur: 1.1, color: '#9aa3c7' }); break;
          case 'downs': R.banner('TURNOVER ON DOWNS', { big: false, dur: 1.8 }); break;
          case 'touchback': R.banner('TOUCHBACK', { big: false, dur: 1.3, color: '#9aa3c7' }); break;
          case 'punt': R.banner('PUNT', { big: false, dur: 1.2 }); break;
          case 'kickoff': Audio.stopHalftime(); if (!demo && g.time > 1) R.banner('KICKOFF', { big: false, dur: 1.2 }); break;
          case 'half':
            R.banner('HALFTIME', { sub: g.teams[0].name.toUpperCase() + ' CHEERLEADERS', dur: 2.6 });
            if (sfx) { Audio.play('whistleLong'); Audio.play('buzz'); Audio.halftimeShow(g.halftime ? g.halftime.len / GAME_SPEED : 10); }
            break;
          case 'quarter': R.banner(d.ot ? 'OVERTIME' : 'END OF ' + FB.ordinal(d.q - 1) + ' QUARTER', { dur: 2.2, big: !!d.ot }); if (sfx) { Audio.play('whistleLong'); Audio.play('buzz'); } break;
          case 'final':
            R.banner('FINAL', { dur: 2.6 });
            if (sfx) { Audio.play('whistleLong'); Audio.play('buzz'); Audio.roar(0.9, 4); Audio.call('final', true); }
            break;
          case 'select': if (sfx) Audio.roar(0, 1); break;
        }
      });
    }
  };

  FB.App = App;
  window.addEventListener('DOMContentLoaded', function () { App.init(); });
})();
