/*
 * Football Blitz '26 — game simulation.
 *
 * World coordinates are yards. x runs along the field: 0 and 100 are the goal
 * lines, end zones run to -10 and 110. y runs across the field from 0 to
 * 53.33. Team 0 always attacks x = 100, team 1 always attacks x = 0.
 *
 * Arcade rules (NFL Blitz style): 7 on 7, 30 yards for a first down, no
 * penalties, late hits allowed, 3 straight completions or defensive stops
 * put a team ON FIRE.
 */
(function () {
  var FB = (window.FB = window.FB || {});
  var Plays = FB.Plays;

  var FW = 53.333, MID = FW / 2;
  var TURBO_MUL = 1.27;
  var FIRST_DOWN = 30;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function len(x, y) { return Math.sqrt(x * x + y * y); }
  function dist(a, b) { return len(a.x - b.x, a.y - b.y); }
  function dirOf(t) { return t === 0 ? 1 : -1; }
  function goalOf(t) { return t === 0 ? 100 : 0; }   // goal line team t attacks
  function ownGoal(t) { return t === 0 ? 0 : 100; }  // goal line team t defends

  // ---------------------------------------------------------------- Player
  function Player(team, info, role, key) {
    this.team = team; this.info = info; this.r = info.r; this.role = role; this.key = key;
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.z = 0;
    this.face = 0; this.anim = Math.random() * 6;
    this.state = 'ok'; this.st = 0;
    this.eng = null; this.engT = 0; this.immune = 0; this.immuneTo = null;
    this.tackleCD = 0; this.spinT = 0; this.spinCD = 0; this.stumble = 0;
    this.diveT = 0; this.diveVx = 0; this.diveVy = 0;
    this.jumpT = 0; this.jumpAt = -99;
    this.want = { x: 0, y: 0 }; this.wantTurbo = false; this.wantSpeed = 1;
    this.route = null; this.ri = 0; this.cont = false; this.contX = 0; this.contY = 0;
    this.assign = null; this.zone = null; this.manTarget = null; this.blocker = false;
    this.ctl = -1; this.cpuMul = 1; this.lane = rnd(-1.5, 1.5);
    this.gotInEZ = false;
    this.stam = 1;
  }

  // ------------------------------------------------------------------ Game
  function Game(opts) {
    this.teams = opts.teams;
    this.qLen = opts.quarterLen || 120;
    this.diff = opts.difficulty == null ? 1 : opts.difficulty;
    this.attract = !!opts.attract;
    this.score = [0, 0];
    this.quarter = 1;
    this.clock = this.qLen;
    this.fire = [false, false];
    this.offStreak = [0, 0];
    this.defStreak = [0, 0];
    this.events = [];
    this.players = [];
    this.ball = { state: 'dead', x: 50, y: MID, z: 0, holder: null };
    this.time = 0;
    this.ctl = (opts.humans || []).map(function (h) { return { slot: h.slot, team: h.team, pl: null, turbo: 1, defKey: 'M' }; });
    this.stats = { team: [this.blankTeamStats(), this.blankTeamStats()], players: {} };
    this.poss = 0; this.losX = 25; this.down = 1; this.firstX = 55; this.dir = 1;
    this.conversion = false; this.ot = false; this.over = false;
    this.receiveFirst = Math.random() < 0.5 ? 0 : 1;
    this.passTarget = null;
    this.phase = 'init';
    this.emit('coin', { team: this.receiveFirst });
    this.setupKickoff(1 - this.receiveFirst);
  }
  FB.Game = Game;
  Game.FW = FW; Game.MID = MID; Game.dirOf = dirOf; Game.goalOf = goalOf; Game.ownGoal = ownGoal;

  var G = Game.prototype;

  G.blankTeamStats = function () {
    return { passYds: 0, rushYds: 0, comp: 0, att: 0, passTD: 0, rushTD: 0, retTD: 0, ints: 0, fumbles: 0, sacks: 0, firstDowns: 0, plays: 0 };
  };

  G.pstat = function (p) {
    var id = p.info.id;
    if (!this.stats.players[id]) {
      this.stats.players[id] = { name: p.info.name || ('#' + p.info.pos), pos: p.info.pos, team: p.team, passYds: 0, passTD: 0, comp: 0, att: 0, rushYds: 0, rushTD: 0, rec: 0, recYds: 0, recTD: 0, retTD: 0, tak: 0, sacks: 0, ints: 0 };
    }
    return this.stats.players[id];
  };

  G.emit = function (type, data) { this.events.push({ type: type, data: data || {} }); };

  G.isHuman = function (team) { return this.ctl.some(function (c) { return c.team === team; }); };
  G.ctlFor = function (team) { for (var i = 0; i < this.ctl.length; i++) if (this.ctl[i].team === team) return this.ctl[i]; return null; };

  // offense-relative -> world
  G.W = function (dx, dy) { return { x: this.losX + dx * this.dir, y: MID + dy * this.dir }; };
  // world -> offense-relative downfield distance from LOS
  G.relX = function (x) { return (x - this.losX) * this.dir; };

  G.difficultyMul = function (team) {
    if (this.isHuman(team) || this.attract) return 1;
    return [0.93, 1, 1.04][this.diff];
  };

  G.mk = function (team, info, role, key) {
    var p = new Player(team, info, role, key);
    p.cpuMul = this.difficultyMul(team);
    this.players.push(p);
    return p;
  };

  G.maxSpeed = function (p) {
    var s = (5.4 + (p.r.spd - 50) * 0.075) * p.cpuMul;
    if (this.fire[p.team]) s *= 1.06;
    return s;
  };

  // ============================================================ SETUP
  G.clearPlay = function () {
    this.players = [];
    this.passThrown = false;
    this.handedOff = false;
    this.playT = 0;
    this.result = null;
    this.lateHitDone = false;
    this.log = { passer: null, catcher: null, rusher: null, completed: false, sack: false, intBy: null, fumbleLost: false, tackler: null, kind: '' };
    this.ball = { state: 'dead', x: this.losX, y: MID, z: 0, holder: null, spin: 0 };
    this.passTarget = null;
    this.ballTeam = this.poss;
    this.off = {}; this.def = {};
  };

  G.setupKickoff = function (kickTeam) {
    var recv = 1 - kickTeam;
    this.poss = recv;
    this.kickTeam = kickTeam;
    this.playType = 'kickoff';
    this.dir = dirOf(recv);
    this.losX = ownGoal(kickTeam) + 35 * dirOf(kickTeam);
    this.conversion = false;
    this.clearPlay();
    this.ballTeam = kickTeam;
    var kt = this.teams[kickTeam], rt = this.teams[recv];
    var kd = dirOf(kickTeam), rd = dirOf(recv);
    var self = this;

    // Kicking team: 5 named defenders + 2 depth players spread across the field.
    var kInfos = kt.defense.concat(kt.depth);
    var lanes = [7, 14, 21, 26.6, 32, 39, 46];
    kInfos.forEach(function (info, i) {
      var p = self.mk(kickTeam, info, 'cover', 'K' + i);
      p.x = self.losX - kd * 1.2; p.y = lanes[i];
    });
    this.kicker = this.players[3];
    this.kicker.x = this.losX - kd * 5;

    // Receiving team: RB returns, everyone else blocks.
    var rInfos = [rt.offense[1], rt.offense[2], rt.offense[3], rt.offense[4], rt.ol[0], rt.ol[1], rt.offense[0]];
    var spots = [[5, MID], [28, 12], [28, 41], [22, 22], [22, 31], [16, 18], [16, 35]];
    rInfos.forEach(function (info, i) {
      var p = self.mk(recv, info, i === 0 ? 'KR' : 'block', 'R' + i);
      p.x = ownGoal(recv) + rd * spots[i][0]; p.y = spots[i][1];
      p.blocker = i !== 0;
    });
    this.returner = this.players[7];

    this.land = { x: ownGoal(recv) + rd * rnd(-1, 7), y: MID + rnd(-9, 9) };
    this.ball.x = this.losX; this.ball.y = MID; this.ball.z = 0.4; this.ball.state = 'tee';
    this.phase = 'presnap';
    this.snapTimer = 1.4;
    this.assignControl(true);
    this.emit('kickoff', { team: kickTeam });
  };

  // Set up a scrimmage play once both sides have chosen.
  G.choosePlays = function (offPlay, defPlay) {
    if (this.phase !== 'select') return;
    this.offPlay = offPlay; this.defPlay = defPlay;
    if (offPlay.type === 'punt' || offPlay.type === 'fg') { this.setupKickAnim(offPlay.type); return; }
    this.setupScrimmage();
  };

  G.setupScrimmage = function () {
    var o = this.poss, d = 1 - o, self = this;
    this.playType = this.offPlay.type;
    this.dir = dirOf(o);
    this.clearPlay();
    var ot = this.teams[o], dt = this.teams[d];
    var F = Plays.FORMATIONS[this.offPlay.form];
    var infos = { QB: ot.offense[0], RB: ot.offense[1], WR1: ot.offense[2], WR2: ot.offense[3], TE: ot.offense[4], OL0: ot.ol[0], OL1: ot.ol[1] };
    var play = this.offPlay;
    this.off = {};
    ['QB', 'RB', 'WR1', 'WR2', 'TE', 'OL0', 'OL1'].forEach(function (role) {
      var p = self.mk(o, infos[role], role, role);
      var w = self.W(F[role][0], F[role][1]);
      p.x = w.x; p.y = w.y; p.face = self.dir > 0 ? 0 : Math.PI;
      self.off[role] = p;
      p.blocker = role === 'OL0' || role === 'OL1' || !!(play.block && play.block[role]);
      if (play.routes && play.routes[role] && !(play.block && play.block[role])) {
        p.route = play.routes[role].map(function (pt) { return self.W(F[role][0] + pt[0], F[role][1] + pt[1]); });
        p.cont = !!(play.cont && play.cont[role]);
      } else if (play.block && play.block[role] && play.routes && play.routes[role]) {
        // blockers on pass plays release a few yards then block
        p.route = play.routes[role].slice(0, 1).map(function (pt) { return self.W(F[role][0] + pt[0], F[role][1] + pt[1]); });
      }
    });
    var qb = this.off.QB;
    if (play.type === 'run') {
      var rb = this.off.RB;
      rb.route = play.run.map(function (pt) { return self.W(F.RB[0] + pt[0], F.RB[1] + pt[1]); });
    }
    this.qbDrop = play.form === 'under' ? this.W(-5.5, 0) : this.W(F.QB[0] - (play.drop ? play.drop - 5 : 1.5), 0);

    // defense
    var dInfos = { F1: dt.defense[0], F2: dt.defense[1], M: dt.defense[2], B1: dt.defense[3], B2: dt.defense[4], NT: dt.depth[0], DB: dt.depth[1] };
    this.def = {};
    var A = Plays.DEF_ALIGN;
    ['F1', 'F2', 'NT', 'M', 'B1', 'DB', 'B2'].forEach(function (key) {
      var p = self.mk(d, dInfos[key], 'D', key);
      var spot = A[key].slice();
      var asg = self.defPlay.a[key];
      // press corners line up on their receiver
      if (asg && asg.man === 'WR1') spot = [self.defPlay.id === 'man' ? 2 : 6, F.WR1[1]];
      if (asg && asg.man === 'WR2') spot = [self.defPlay.id === 'man' ? 2 : 6, F.WR2[1]];
      if (asg && asg.man === 'TE') spot = [4.5, F.TE[1]];
      var w = self.W(spot[0], spot[1]);
      p.x = w.x; p.y = w.y; p.face = self.dir > 0 ? Math.PI : 0;
      p.assign = asg;
      if (asg && asg.zone) p.zone = self.W(asg.zone[0], asg.zone[1]);
      if (asg && asg.man) p.manTarget = self.off[asg.man];
      self.def[key] = p;
    });

    this.ball.holder = qb; this.ball.state = 'held';
    this.ball.x = qb.x; this.ball.y = qb.y; this.ball.z = 1.1;
    this.ballTeam = o;
    this.phase = 'presnap';
    var humanOff = this.isHuman(o);
    this.snapTimer = humanOff ? 15 : rnd(1.1, 1.8) + (this.isHuman(d) ? 0.7 : 0);
    this.assignControl(true);
    this.emit('setup', {});
  };

  // Punt / field goal / extra point: animated kick, no live players.
  G.setupKickAnim = function (kind) {
    var o = this.poss, self = this;
    this.playType = kind;
    this.dir = dirOf(o);
    this.clearPlay();
    var ot = this.teams[o], dt = this.teams[1 - o];
    // cosmetic formation
    var oInfos = ot.offense.concat(ot.ol), dInfos = dt.defense.concat(dt.depth);
    var oSpots = [[-1, -6], [-1, -3], [-1, 0], [-1, 3], [-1, 6], [-2, -9], [-2, 9]];
    var dSpots = [[1, -6], [1, -3], [1, 0], [1, 3], [1, 6], [4, -9], [4, 9]];
    oInfos.forEach(function (info, i) { var p = self.mk(o, info, 'K', 'K' + i); var w = self.W(oSpots[i][0], oSpots[i][1]); p.x = w.x; p.y = w.y; });
    dInfos.forEach(function (info, i) { var p = self.mk(1 - o, info, 'K', 'D' + i); var w = self.W(dSpots[i][0], dSpots[i][1]); p.x = w.x; p.y = w.y; });
    var b = this.ball;
    if (kind === 'punt') {
      var punter = this.players[0];
      var ps = this.W(-12, 0); punter.x = ps.x; punter.y = ps.y;
      var distance = rnd(38, 50);
      var lx = ps.x + this.dir * distance, ly = MID + rnd(-12, 12);
      this.kickAnim = { kind: 'punt', sx: ps.x, sy: ps.y, tx: lx, ty: ly, T: 3.0, peak: 22, t: -0.9 };
    } else {
      var holder = this.players[0];
      var hs = this.W(-7, 0); holder.x = hs.x; holder.y = hs.y;
      var kickDist = (goalOf(o) - hs.x) * this.dir + 10;
      var prob = kind === 'xp' ? 0.94 : this.fgProb(kickDist);
      var good = Math.random() < prob;
      var gx = goalOf(o) + this.dir * 10;
      var miss = good ? 0 : (Math.random() < 0.5 ? -1 : 1) * rnd(3.6, 6.5);
      var tx = gx + this.dir * 4, ty = MID + miss * (tx - hs.x) / (gx - hs.x);
      this.kickAnim = { kind: kind, sx: hs.x, sy: hs.y, tx: tx, ty: ty, T: 1.5, peak: 9, t: -0.9, good: good, dist: Math.round(kickDist), holderX: hs.x };
    }
    b.state = 'kick'; b.x = this.kickAnim.sx; b.y = this.kickAnim.sy; b.z = 0.3;
    this.phase = 'anim';
    this.assignControl(true);
    this.emit(kind === 'punt' ? 'punt' : 'fgsetup', { kind: kind });
  };

  G.fgProb = function (d) {
    if (d <= 33) return 0.96;
    if (d <= 40) return 0.9;
    if (d <= 45) return 0.82;
    if (d <= 50) return 0.72;
    if (d <= 55) return 0.58;
    if (d <= 60) return 0.42;
    if (d <= 64) return 0.25;
    return 0;
  };
  G.fgDistance = function () { return Math.round((goalOf(this.poss) - this.losX) * dirOf(this.poss) + 17); };
  G.yardsToGoal = function () { return Math.round((goalOf(this.poss) - this.losX) * dirOf(this.poss)); };
  G.toGo = function () { return Math.max(1, Math.round((this.firstX - this.losX) * dirOf(this.poss))); };
  G.isGoalToGo = function () { return (this.firstX - goalOf(this.poss)) * dirOf(this.poss) >= 0; };

  // =========================================================== CONTROL
  G.assignControl = function (reset) {
    var self = this;
    this.players.forEach(function (p) { p.ctl = -1; });
    this.ctl.forEach(function (c, i) {
      if (self.phase === 'anim') { c.pl = null; return; }
      var pick = null;
      if (self.playType === 'kickoff') {
        if (c.team === self.poss) pick = self.returner;
        else if (reset || !c.pl || c.pl.team !== c.team) pick = self.players[3];
        else pick = c.pl;
      } else if (self.phase === 'presnap' || reset) {
        if (c.team === self.poss) pick = self.off.QB;
        else pick = self.def[c.defKey] || self.def.M;
      } else {
        pick = c.pl;
      }
      c.pl = pick;
      if (pick) pick.ctl = i;
    });
  };

  G.setControl = function (c, p) {
    if (c.pl) c.pl.ctl = -1;
    c.pl = p;
    if (p) p.ctl = this.ctl.indexOf(c);
  };

  // Keep each human on the most relevant player as the play develops.
  G.autoControl = function () {
    var b = this.ball, self = this;
    this.ctl.forEach(function (c) {
      var want = null;
      if (b.state === 'held' && b.holder && b.holder.team === c.team) want = b.holder;
      else if ((b.state === 'air' || b.state === 'pitch') && b.target && b.target.team === c.team && b.kind !== 'kick') want = b.target;
      else if (b.state === 'loose') {
        if (!c.pl || dist(c.pl, b) > 6) want = self.nearestTo(c.team, b, null);
      } else if (c.pl && c.pl.team !== c.team) {
        want = self.nearestTo(c.team, b, null);
      } else if (!c.pl) {
        want = self.nearestTo(c.team, b, null);
      }
      if (want && want !== c.pl) self.setControl(c, want);
    });
  };

  G.nearestTo = function (team, pt, exclude) {
    var best = null, bd = 1e9;
    this.players.forEach(function (p) {
      if (p.team !== team || p === exclude || p.state === 'down') return;
      var d = dist(p, pt);
      if (d < bd) { bd = d; best = p; }
    });
    return best;
  };

  // ============================================================ UPDATE
  G.update = function (dt, inputs) {
    this.time += dt;
    inputs = inputs || [];
    switch (this.phase) {
      case 'presnap': this.updatePresnap(dt, inputs); break;
      case 'live': this.updateLive(dt, inputs); break;
      case 'dead': this.updateDead(dt, inputs); break;
      case 'anim': this.updateAnim(dt); break;
      case 'break':
        this.breakT -= dt;
        if (this.breakT <= 0) this.afterBreak();
        break;
      case 'select':
        if (this.selectWait > 0) this.selectWait -= dt;
        this.idle(dt);
        break;
      default: this.idle(dt);
    }
  };

  G.idle = function (dt) {
    var self = this;
    this.players.forEach(function (p) {
      p.want.x = 0; p.want.y = 0; p.wantTurbo = false;
      if (p.state === 'down') { p.st -= dt; if (p.st <= 0) p.state = 'ok'; }
      self.movePlayer(p, dt);
    });
  };

  G.updatePresnap = function (dt, inputs) {
    var self = this;
    this.snapTimer -= dt;
    // Humans: defense may move and cycle defenders, offense snaps.
    this.ctl.forEach(function (c) {
      var inp = inputs[c.slot] || {};
      if (self.playType === 'kickoff') {
        if (inp.action && c.team === self.kickTeam) self.snapTimer = Math.min(self.snapTimer, 0);
        return;
      }
      if (c.team === self.poss) {
        if (inp.action) self.snapTimer = 0;
      } else if (c.pl) {
        if (inp.action) {
          var keys = ['M', 'B2', 'B1', 'DB', 'F1', 'F2', 'NT'];
          var k = keys[(keys.indexOf(c.pl.key) + 1) % keys.length];
          c.defKey = k;
          self.setControl(c, self.def[k]);
          self.emit('switch', {});
        }
      }
    });
    this.players.forEach(function (p) {
      p.want.x = 0; p.want.y = 0; p.wantTurbo = false;
      if (p.ctl >= 0 && p.team !== self.poss && self.playType !== 'kickoff') {
        var c = self.ctl[p.ctl], inp = inputs[c.slot] || {};
        self.inputToWant(p, inp, false);
        p.wantSpeed = 0.6;
      }
      self.movePlayer(p, dt);
      // defenders stay on their side of the ball
      if (p.team !== self.poss && self.playType !== 'kickoff' && self.relX(p.x) < 0.9) p.x = self.losX + 0.9 * self.dir;
      p.wantSpeed = 1;
    });
    if (this.snapTimer <= 0) this.snap();
  };

  G.snap = function () {
    this.phase = 'live';
    this.playT = 0;
    if (this.playType === 'kickoff') {
      var b = this.ball, k = this.kicker;
      b.state = 'air'; b.kind = 'kick'; b.sx = this.losX; b.sy = MID; b.sz = 0.4;
      b.tx = this.land.x; b.ty = this.land.y; b.tz = 0.8; b.t = 0; b.T = 2.8; b.peak = 19; b.target = this.returner;
      b.thrower = k;
      this.emit('kick', {});
      return;
    }
    this.emit('snap', {});
    this.stats.team[this.poss].plays++;
    if (this.playType === 'run' && this.offPlay.pitch) this.pitchAt = 0.18;
  };

  // Convert screen-relative stick input to a world-space movement wish.
  G.inputToWant = function (p, inp, turbo) {
    var ix = inp.x || 0, iy = inp.y || 0;
    p.want.x = iy * this.dir;
    p.want.y = ix * this.dir;
    p.wantTurbo = !!turbo;
  };

  G.updateLive = function (dt, inputs) {
    var self = this, b = this.ball;
    this.playT += dt;
    if (!this.conversion) this.clock = Math.max(0, this.clock - dt);

    // QB pitch / handoff on run plays
    if (this.playType === 'run' && !this.handedOff && b.state === 'held' && b.holder === this.off.QB) {
      var rb = this.off.RB, qb = this.off.QB;
      if (this.offPlay.pitch) {
        if (this.playT >= this.pitchAt) this.pitchTo(qb, rb);
      } else if (dist(qb, rb) < 1.3 || this.playT > 0.75) {
        this.giveBall(rb, qb.x < 0);
        this.handedOff = true;
        this.log.rusher = rb;
        this.emit('handoff', {});
      }
    }

    this.autoControl();

    // ---- humans
    this.ctl.forEach(function (c) {
      var p = c.pl, inp = inputs[c.slot] || {};
      if (!p) return;
      var moving = Math.abs(inp.x || 0) + Math.abs(inp.y || 0) > 0.2;
      var wantsTurbo = !!inp.turbo && moving && (c.turbo > 0.02 || self.fire[c.team]);
      if (wantsTurbo && !self.fire[c.team]) c.turbo = Math.max(0, c.turbo - dt * 0.42);
      else if (!inp.turbo) c.turbo = Math.min(1, c.turbo + dt * 0.24);
      self.inputToWant(p, inp, wantsTurbo);
      p.wantSpeed = 1;
      p.humanTurbo = !!inp.turbo;
      self.humanActions(c, p, inp);
      // receiver assist: run to the ball if the player isn't steering
      if (!moving && (b.state === 'air') && b.target === p && b.kind === 'pass') {
        p.want.x = b.tx - p.x; p.want.y = b.ty - p.y;
        if (len(p.want.x, p.want.y) < 0.4) { p.want.x = 0; p.want.y = 0; }
      }
      if (!moving && self.playType === 'kickoff' && p === self.returner && b.state === 'air') {
        p.want.x = b.tx - p.x; p.want.y = b.ty - p.y;
        if (len(p.want.x, p.want.y) < 0.4) { p.want.x = 0; p.want.y = 0; }
      }
    });

    // ---- AI
    this.players.forEach(function (p) {
      if (p.ctl >= 0) return;
      p.want.x = 0; p.want.y = 0; p.wantTurbo = false; p.wantSpeed = 1;
      if (p.state !== 'ok') return;
      self.think(p);
    });

    // ---- move
    this.players.forEach(function (p) {
      p.tackleCD = Math.max(0, p.tackleCD - dt);
      p.immune = Math.max(0, p.immune - dt);
      p.spinCD = Math.max(0, p.spinCD - dt);
      self.movePlayer(p, dt);
    });

    this.updateBlocks(dt);
    this.separate();
    this.updateBall(dt);
    if (this.phase !== 'live') return;
    this.checkTackles();
    if (this.phase !== 'live') return;
    this.checkBounds();
    if (this.phase === 'live' && this.playT > 28) {
      var h = this.ball.holder;
      this.endPlay('tackle', { x: h ? h.x : this.losX });
    }
  };

  G.humanActions = function (c, p, inp) {
    var b = this.ball, self = this;
    if (this.playType === 'kickoff' && b.state === 'air' && c.team === this.poss) return;
    var hasBall = b.state === 'held' && b.holder === p;
    if (hasBall) {
      var canPass = p.role === 'QB' && !this.passThrown && this.relX(p.x) <= 0.5 && this.playType !== 'kickoff' && b.holder === this.off.QB && !this.handedOff && this.playType !== 'run';
      if (canPass) {
        this.passTarget = this.pickTarget(p, inp);
        if (inp.action && this.passTarget) this.throwTo(p, this.passTarget);
        else if (inp.special) this.startSpin(p);
        return;
      }
      if (inp.action) this.startSpin(p);
      else if (inp.special) this.startJump(p);
      return;
    }
    if (b.state === 'air' && b.kind === 'pass') {
      if (inp.special || inp.action) {
        if (p.team === this.ballTeam || dist(p, { x: b.tx, y: b.ty }) < 4) { this.startJump(p); return; }
      }
    }
    var teamHasBall = (b.state === 'held' && b.holder && b.holder.team === c.team);
    if (!teamHasBall && inp.action) {
      var carrier = b.state === 'held' ? b.holder : null;
      if (carrier && dist(p, carrier) < 3.4 && p.state === 'ok' && !p.eng) {
        this.startDive(p, carrier);
      } else {
        var target = carrier || (b.state === 'air' ? { x: b.tx, y: b.ty } : b);
        var best = null, bd = 1e9;
        this.players.forEach(function (q) {
          if (q.team !== c.team || q === p || q.state !== 'ok') return;
          var d = dist(q, target);
          if (d < bd) { bd = d; best = q; }
        });
        if (best) { self.setControl(c, best); self.emit('switch', {}); }
      }
    } else if (!teamHasBall && inp.special) {
      this.startJump(p);
    }
  };

  // Choose the pass target: the receiver closest to the stick direction,
  // or the most open receiver if the stick is neutral.
  G.eligible = function (team) {
    var self = this;
    return this.players.filter(function (p) {
      return p.team === team && (p.role === 'WR1' || p.role === 'WR2' || p.role === 'TE' || p.role === 'RB') && p.state !== 'down';
    });
  };

  G.openness = function (rec) {
    var m = 30, self = this;
    this.players.forEach(function (d) {
      if (d.team === rec.team || d.state === 'down' || d.eng) return;
      var dd = dist(d, rec);
      if (dd < m) m = dd;
    });
    return m;
  };

  G.pickTarget = function (qb, inp) {
    var recs = this.eligible(qb.team);
    if (!recs.length) return null;
    var ix = inp.x || 0, iy = inp.y || 0;
    var self = this;
    if (Math.abs(ix) + Math.abs(iy) > 0.3) {
      var wx = iy * this.dir, wy = ix * this.dir, wl = len(wx, wy);
      var best = null, bs = -1e9;
      recs.forEach(function (r) {
        var dx = r.x - qb.x, dy = r.y - qb.y, dl = len(dx, dy) || 1;
        var cos = (dx * wx + dy * wy) / (dl * wl);
        var s = cos * 10 - dl * 0.03;
        if (s > bs) { bs = s; best = r; }
      });
      return best;
    }
    var bestO = null, bo = -1e9;
    recs.forEach(function (r) {
      var s = self.openness(r) + Math.max(0, self.relX(r.x)) * 0.05;
      if (s > bo) { bo = s; bestO = r; }
    });
    return bestO;
  };

  G.startSpin = function (p) {
    if (p.spinCD > 0 || p.state !== 'ok') return;
    p.spinT = 0.45; p.spinCD = 1.1;
    this.emit('spin', { p: p });
  };
  G.startJump = function (p) {
    if (p.jumpT > 0 || p.state !== 'ok') return;
    p.jumpT = 0.55; p.jumpAt = this.time;
    this.emit('jump', { p: p });
  };
  G.startDive = function (p, target) {
    if (p.state !== 'ok') return;
    var dx = target.x + target.vx * 0.15 - p.x, dy = target.y + target.vy * 0.15 - p.y, dl = len(dx, dy) || 1;
    p.state = 'dive'; p.diveT = 0.36;
    var sp = 10.5;
    p.diveVx = dx / dl * sp; p.diveVy = dy / dl * sp;
    p.face = Math.atan2(dy, dx);
    this.emit('dive', { p: p });
  };

  // ------------------------------------------------------- movement
  G.movePlayer = function (p, dt) {
    if (p.state === 'down') {
      p.st -= dt;
      p.vx *= 0.88; p.vy *= 0.88;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.st <= 0 && this.phase !== 'dead') p.state = 'ok';
      this.clampPos(p);
      return;
    }
    if (p.state === 'dive') {
      p.diveT -= dt;
      p.x += p.diveVx * dt; p.y += p.diveVy * dt;
      p.vx = p.diveVx; p.vy = p.diveVy;
      if (p.diveT <= 0) { p.state = 'down'; p.st = 0.75; p.vx *= 0.25; p.vy *= 0.25; }
      this.clampPos(p);
      return;
    }
    var sp = this.maxSpeed(p);
    var turbo = p.wantTurbo;
    if (p.ctl < 0 && !this.fire[p.team]) {
      // CPU players run on the same turbo budget a human gets
      if (turbo && p.stam > 0.02) p.stam = Math.max(0, p.stam - dt * 0.42);
      else { turbo = false; p.stam = Math.min(1, p.stam + dt * 0.24); }
    }
    if (turbo) sp *= TURBO_MUL;
    if (p.eng) sp *= 0.22;
    if (p.spinT > 0) { p.spinT -= dt; sp *= 0.92; }
    if (p.stumble > 0) { p.stumble -= dt; sp *= 0.5; }
    var wl = len(p.want.x, p.want.y), tx = 0, ty = 0;
    if (wl > 0.02) {
      var m = Math.min(1, wl) * p.wantSpeed;
      tx = p.want.x / wl * sp * m; ty = p.want.y / wl * sp * m;
    }
    var accel = 14 + p.r.agi * 0.14;
    if (turbo) accel *= 1.15;
    var dvx = tx - p.vx, dvy = ty - p.vy, dl = len(dvx, dvy), mx = accel * dt;
    if (dl > mx) { dvx *= mx / dl; dvy *= mx / dl; }
    p.vx += dvx; p.vy += dvy;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.jumpT > 0) { p.jumpT -= dt; p.z = Math.max(0, Math.sin((1 - p.jumpT / 0.55) * Math.PI) * 1.0); }
    else p.z = 0;
    var s = len(p.vx, p.vy);
    p.anim += s * dt * 1.7;
    if (s > 0.4) p.face = Math.atan2(p.vy, p.vx);
    this.clampPos(p);
  };

  G.clampPos = function (p) {
    p.x = clamp(p.x, -13, 113);
    p.y = clamp(p.y, -5, FW + 5);
  };

  G.separate = function () {
    var ps = this.players, n = ps.length;
    for (var i = 0; i < n; i++) {
      var a = ps[i];
      if (a.state === 'down') continue;
      for (var j = i + 1; j < n; j++) {
        var c = ps[j];
        if (c.state === 'down' || a.eng === c) continue;
        var dx = c.x - a.x, dy = c.y - a.y, d = len(dx, dy);
        if (d < 0.7 && d > 0.0001) {
          var push = (0.7 - d) * 0.5;
          dx /= d; dy /= d;
          a.x -= dx * push; a.y -= dy * push;
          c.x += dx * push; c.y += dy * push;
        }
      }
    }
  };

  // ------------------------------------------------------- blocking
  G.updateBlocks = function (dt) {
    var self = this, ps = this.players, b = this.ball;
    var carrier = b.state === 'held' ? b.holder : null;
    ps.forEach(function (p) {
      if (!p.eng || !p.blocking) return;
      var d = p.eng;
      var rate = 1;
      if (d.ctl >= 0 && d.humanTurbo) rate = 2.1;
      p.engT -= dt * rate;
      // blocker stays between defender and the ball
      var tgt = carrier || self.off && self.off.QB || b;
      var dx = tgt.x - d.x, dy = tgt.y - d.y, dl = len(dx, dy) || 1;
      p.x = d.x + dx / dl * 0.85; p.y = d.y + dy / dl * 0.85;
      if (p.engT <= 0 || d.state !== 'ok' || p.state !== 'ok' || carrier === p) {
        self.release(p, d);
      }
    });
    if (this.phase !== 'live') return;
    // new engagements
    ps.forEach(function (bl) {
      if (bl.team !== self.ballTeam || bl.eng || bl.state !== 'ok' || bl === carrier) return;
      if (!self.isBlocking(bl)) return;
      for (var i = 0; i < ps.length; i++) {
        var d = ps[i];
        if (d.team === bl.team || d.eng || d.state !== 'ok') continue;
        if (d.immune > 0 && d.immuneTo === bl) continue;
        if (dist(bl, d) < 1.05) { self.engage(bl, d); break; }
      }
    });
  };

  G.isBlocking = function (p) {
    var b = this.ball;
    if (this.playType === 'kickoff') return p.blocker && (b.state !== 'air' || this.playT > 1.2);
    if (p.role === 'QB') return false;
    if (p.role === 'OL0' || p.role === 'OL1') return true;
    if (b.state === 'air' && b.target === p) return false;
    var runActive = b.state === 'held' && b.holder && b.holder.team === p.team && b.holder !== p && !(b.holder === this.off.QB && !this.handedOff && this.relX(b.holder.x) < 0);
    if (runActive) return true;
    return p.blocker && this.playT > 0.4;
  };

  G.engage = function (bl, d) {
    var ol = bl.role === 'OL0' || bl.role === 'OL1';
    var base = ol ? 1.55 : (this.playType === 'kickoff' ? 0.35 : 0.55);
    var t = base + (bl.r.str - (d.r.prs * 0.55 + d.r.str * 0.45)) / 22 + rnd(-0.45, 0.75);
    if (this.fire[d.team]) t *= 0.6;
    if (this.fire[bl.team]) t *= 1.25;
    bl.eng = d; d.eng = bl; bl.engT = clamp(t, ol ? 0.35 : 0.2, ol ? 3.2 : 1.4); bl.blocking = true;
    // occasional pancake
    if (bl.r.str - d.r.str > 4 && Math.random() < 0.07) {
      d.state = 'down'; d.st = 0.9;
      this.release(bl, d);
      this.emit('pancake', { p: d });
    }
    this.emit('block', {});
  };

  G.release = function (bl, d) {
    if (bl.eng === d) bl.eng = null;
    if (d.eng === bl) d.eng = null;
    bl.blocking = false;
    d.immune = 0.9; d.immuneTo = bl;
  };

  // ------------------------------------------------------------ ball
  G.giveBall = function (p, inEZ) {
    var b = this.ball;
    b.state = 'held'; b.holder = p; b.kind = '';
    if (p.eng) this.release(p.eng, p);
    var prevTeam = this.ballTeam;
    this.ballTeam = p.team;
    p.gotInEZ = (p.x - ownGoal(p.team)) * dirOf(p.team) < 0;
    if (prevTeam !== p.team) this.emit('change', { team: p.team });
  };

  G.pitchTo = function (qb, rb) {
    var b = this.ball;
    b.state = 'pitch'; b.holder = null; b.kind = 'pitch';
    b.sx = qb.x; b.sy = qb.y; b.sz = 1.2; b.t = 0; b.T = 0.32; b.peak = 0.6; b.target = rb;
    b.tx = rb.x + rb.vx * 0.32; b.ty = rb.y + rb.vy * 0.32; b.tz = 1.1;
    this.handedOff = true;
    this.log.rusher = rb;
    this.emit('pitch', {});
  };

  G.throwTo = function (qb, rec) {
    var b = this.ball;
    var sp = clamp(17 + (qb.r.thp - 60) / 39 * 9, 15, 27);
    if (this.fire[qb.team]) sp += 2;
    var tx = rec.x, ty = rec.y, t = 0;
    for (var i = 0; i < 4; i++) {
      var d0 = len(tx - qb.x, ty - qb.y);
      t = d0 / sp + 0.1;
      tx = rec.x + rec.vx * t * 0.92; ty = rec.y + rec.vy * t * 0.92;
    }
    var d = len(tx - qb.x, ty - qb.y);
    var maxR = 28 + qb.r.thp * 0.38;
    if (d > maxR) { tx = qb.x + (tx - qb.x) * maxR / d; ty = qb.y + (ty - qb.y) * maxR / d; d = maxR; }
    var err = (1 - (qb.r.tha - 40) / 60) * 1.5 + 0.25;
    err *= Math.max(0.6, d / 18);
    var pressure = this.pressureOn(qb);
    if (pressure < 2.2) err *= 1.5;
    if (len(qb.vx, qb.vy) > 4) err *= 1.25;
    if (this.fire[qb.team]) err *= 0.55;
    var a = Math.random() * Math.PI * 2, m = err * Math.sqrt(Math.random());
    tx += Math.cos(a) * m; ty += Math.sin(a) * m;
    d = len(tx - qb.x, ty - qb.y);
    b.state = 'air'; b.kind = 'pass'; b.holder = null;
    b.sx = qb.x; b.sy = qb.y; b.sz = 1.9; b.tx = tx; b.ty = ty; b.tz = 1.3;
    b.t = 0; b.T = d / sp + 0.08; b.peak = clamp(d * 0.085, 0.3, 6.5);
    b.target = rec; b.thrower = qb;
    this.passThrown = true;
    this.passTarget = null;
    this.log.passer = qb;
    this.stats.team[qb.team].att++;
    this.pstat(qb).att++;
    this.throwTime = this.playT;
    this.emit('throw', {});
  };

  // Sail the ball out of bounds: always incomplete.
  G.throwAway = function (qb) {
    var side = qb.y < MID ? -4 : FW + 4;
    var fake = { x: qb.x + this.dir * 12, y: side, vx: 0, vy: 0, r: qb.r };
    this.throwTo(qb, fake);
    this.ball.tx = fake.x; this.ball.ty = side;
    var d = len(this.ball.tx - qb.x, this.ball.ty - qb.y);
    this.ball.T = d / 20 + 0.1;
    this.ball.target = null;
  };

  G.pressureOn = function (qb) {
    var m = 99;
    this.players.forEach(function (d) {
      if (d.team === qb.team || d.state !== 'ok' || d.eng) return;
      var dd = dist(d, qb);
      if (dd < m) m = dd;
    });
    return m;
  };

  G.updateBall = function (dt) {
    var b = this.ball;
    b.spin += dt * 12;
    if (b.state === 'held' && b.holder) {
      var h = b.holder;
      b.x = h.x + Math.cos(h.face) * 0.25; b.y = h.y + Math.sin(h.face) * 0.25; b.z = 1.1 + h.z;
      return;
    }
    if (b.state === 'air' || b.state === 'pitch') {
      b.t += dt;
      var s = Math.min(1, b.t / b.T);
      b.x = b.sx + (b.tx - b.sx) * s; b.y = b.sy + (b.ty - b.sy) * s;
      b.z = b.sz + (b.tz - b.sz) * s + b.peak * 4 * s * (1 - s);
      if (s >= 1) {
        if (b.state === 'pitch') { this.giveBall(b.target, false); return; }
        if (b.kind === 'kick') this.kickArrive();
        else this.passArrive();
      }
      return;
    }
    if (b.state === 'loose') {
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vz -= 30 * dt;
      if (b.z < 0.15) { b.z = 0.15; b.vz = Math.abs(b.vz) * 0.45; b.vx *= 0.7; b.vy *= 0.7; if (b.vz < 1) b.vz = 0; }
      b.looseT += dt;
      // out of bounds -> dead, possession to the last team that had it
      if (b.y < 0 || b.y > FW) { this.endPlay('oob', { x: b.x, team: this.ballTeam }); return; }
      var self = this, picked = null;
      if (b.z < 1.4) {
        this.players.forEach(function (p) {
          if (picked || p.state !== 'ok' || dist(p, b) > 1.0) return;
          if (self.playType === 'kickoff' && b.fromKick && p.team !== self.poss && b.looseT < 1.5) return;
          if (Math.random() < 0.18) picked = p;
        });
      }
      if (picked) {
        var lost = picked.team !== this.ballTeam;
        this.giveBall(picked, false);
        if (b.fromKick) { b.fromKick = false; }
        else if (lost) { this.log.fumbleLost = true; this.stats.team[1 - picked.team].fumbles++; this.emit('recovered', { team: picked.team }); }
        else this.emit('recoveredOwn', {});
      } else if (b.looseT > 6) {
        this.endPlay('tackle', { x: b.x });
      }
    }
  };

  G.kickArrive = function () {
    var b = this.ball, r = this.returner;
    if (r && r.state === 'ok' && dist(r, b) < 2.6) {
      this.giveBall(r, false);
      this.emit('catch', { p: r, kick: true });
    } else {
      b.state = 'loose'; b.vx = rnd(-3, 3) + 4 * this.dir; b.vy = rnd(-3, 3); b.vz = 5; b.looseT = 0; b.fromKick = true;
      this.emit('bounce', {});
    }
  };

  G.passArrive = function () {
    var b = this.ball, self = this, o = b.thrower.team;
    var L = { x: b.x, y: b.y };
    var bestO = null, dO = 9, bestD = null, dD = 9;
    this.players.forEach(function (p) {
      if (p.state === 'down' || p.role === 'QB' || p.eng) return;
      if (p.state === 'dive') return;
      var d = dist(p, L);
      if (p.team === o) {
        if (p.role === 'OL0' || p.role === 'OL1') return;
        if (d < dO) { dO = d; bestO = p; }
      } else if (d < dD) { dD = d; bestD = p; }
    });
    var jumpBonus = function (p) { return (self.time - p.jumpAt) < 0.75 ? 0.13 : 0; };
    var reach = function (p) { return 1.7 + ((self.time - p.jumpAt) < 0.75 ? 0.4 : 0); };
    var defIn = bestD && dD < reach(bestD) * 0.62;
    var offIn = bestO && dO < reach(bestO);
    if (defIn && (!offIn || dD < dO)) {
      var pInt = 0.12 + (bestD.r.cth - 60) / 220 + (bestD.r.cov - 75) / 350 + jumpBonus(bestD);
      if (this.fire[bestD.team]) pInt += 0.08;
      if (Math.random() < clamp(pInt, 0.05, 0.45)) { this.intercept(bestD); return; }
      // deflection, offense can still haul it in sometimes
      if (!(offIn && Math.random() < 0.18)) { this.incomplete(bestD); return; }
    }
    if (offIn) {
      var close = 0;
      this.players.forEach(function (p) { if (p.team !== o && p.state === 'ok' && dist(p, bestO) < 1.3) close++; });
      var pc = 0.64 + (bestO.r.cth - 60) / 100 + jumpBonus(bestO) - close * 0.17 - (dO > 1.15 ? 0.14 : 0);
      if (this.fire[o]) pc += 0.12;
      if (Math.random() < clamp(pc, 0.12, 0.98)) { this.complete(bestO); return; }
    }
    this.incomplete(null);
  };

  G.complete = function (rec) {
    this.giveBall(rec, false);
    this.log.completed = true; this.log.catcher = rec;
    this.stats.team[rec.team].comp++;
    this.pstat(this.log.passer).comp++;
    this.pstat(rec).rec++;
    this.offStreak[rec.team]++;
    this.emit('catch', { p: rec });
    if (this.offStreak[rec.team] >= 3 && !this.fire[rec.team]) this.setFire(rec.team, true);
  };

  G.intercept = function (d) {
    this.giveBall(d, false);
    this.log.intBy = d;
    this.stats.team[1 - d.team].ints++;
    this.pstat(d).ints++;
    this.offStreak[1 - d.team] = 0;
    this.defStop(d.team);
    if (this.fire[1 - d.team]) this.setFire(1 - d.team, false);
    this.emit('int', { p: d });
  };

  G.incomplete = function (by) {
    var b = this.ball;
    // the ball falls to the turf and skips away
    b.state = 'dead'; b.vz = 1.5; b.vx = (b.tx - b.sx) / (b.T || 1) * 0.15; b.vy = (b.ty - b.sy) / (b.T || 1) * 0.15;
    this.offStreak[b.thrower.team] = 0;
    this.endPlay('incomplete', { x: this.losX, by: by });
  };

  G.defStop = function (team) {
    this.defStreak[team]++;
    if (this.defStreak[team] >= 3 && !this.fire[team]) this.setFire(team, true);
  };

  G.setFire = function (team, on) {
    this.fire[team] = on;
    if (on) { this.offStreak[team] = 0; this.defStreak[team] = 0; this.ctl.forEach(function (c) { if (c.team === team) c.turbo = 1; }); }
    this.emit(on ? 'onfire' : 'fireout', { team: team });
  };

  G.fumble = function (carrier, hitter) {
    var b = this.ball;
    b.state = 'loose'; b.holder = null;
    b.vx = carrier.vx * 0.6 + rnd(-3, 3); b.vy = carrier.vy * 0.6 + rnd(-3, 3); b.vz = 6; b.z = 1.2; b.looseT = 0; b.fromKick = false;
    carrier.state = 'down'; carrier.st = 1.2;
    this.emit('fumble', { p: carrier });
  };

  // ------------------------------------------------------------ tackles
  G.checkTackles = function () {
    var b = this.ball;
    if (b.state !== 'held' || !b.holder) return;
    var c = b.holder, self = this;
    if (c.state === 'down') return;
    for (var i = 0; i < this.players.length; i++) {
      var d = this.players[i];
      if (d.team === c.team || d.tackleCD > 0) continue;
      if (d.state !== 'ok' && d.state !== 'dive') continue;
      if (d.eng) continue;
      var reach = d.state === 'dive' ? 1.35 : 0.95;
      if (dist(d, c) > reach) continue;
      // hurdling carriers clear low (dive) tackles
      if (c.z > 0.45 && d.state === 'dive' && Math.random() < 0.65) { d.tackleCD = 0.5; continue; }
      var p = 0.7 + (d.r.tak - 75) / 100 - (c.r.str - 70) / 160 - (c.r.agi - 75) / 220;
      if (d.state === 'dive') p += 0.24;
      if (d.wantTurbo || d.humanTurbo) p += 0.07;
      if (c.spinT > 0) p -= 0.42;
      if (this.fire[c.team]) p -= 0.14;
      if (this.fire[d.team]) p += 0.12;
      if (c.role === 'QB' && !this.passThrown && !this.handedOff && this.playType !== 'kickoff' && this.relX(c.x) < 0) p += 0.15;
      p = clamp(p, 0.12, 0.97);
      if (Math.random() < p) { this.tackle(c, d); return; }
      d.tackleCD = 0.65;
      if (d.state === 'ok') { d.state = 'down'; d.st = 0.45; }
      c.stumble = 0.28;
      this.emit('broken', { p: c });
    }
  };

  G.tackle = function (c, d) {
    var big = d.state === 'dive' || d.wantTurbo || d.humanTurbo;
    var fumbleP = 0.012 + (big ? 0.02 : 0) - (c.r.str - 70) / 3000;
    if (this.fire[d.team]) fumbleP += 0.015;
    if (this.fire[c.team]) fumbleP *= 0.3;
    this.log.tackler = d;
    this.pstat(d).tak++;
    d.state = 'down'; d.st = 1.3;
    if (Math.random() < fumbleP && this.playType !== 'kickoff' || (this.playType === 'kickoff' && Math.random() < fumbleP * 0.5)) {
      this.emit('hit', { big: true, p: c });
      this.fumble(c, d);
      return;
    }
    c.state = 'down'; c.st = 1.6;
    c.vx = (c.vx + d.vx) * 0.35; c.vy = (c.vy + d.vy) * 0.35;
    this.emit('hit', { big: big, p: c });
    // sack / tackle for loss
    var behind = this.playType !== 'kickoff' && c.team === this.poss && this.relX(c.x) < 0;
    if (behind && c.role === 'QB' && !this.passThrown && !this.handedOff) {
      this.log.sack = true;
      this.stats.team[d.team].sacks++;
      this.pstat(d).sacks++;
      this.defStop(d.team);
      this.emit('sack', { p: d });
    } else if (behind) {
      this.defStop(d.team);
    }
    this.carrierDown(c);
  };

  G.carrierDown = function (c) {
    var t = c.team;
    var depth = (c.x - ownGoal(t)) * dirOf(t);
    if (depth < 0) {
      if (c.gotInEZ || this.playType === 'kickoff') this.endPlay('touchback', { team: t });
      else this.endPlay('safety', { team: t });
      return;
    }
    this.endPlay('tackle', { x: c.x });
  };

  G.checkBounds = function () {
    var b = this.ball;
    if (b.state !== 'held' || !b.holder) return;
    var c = b.holder, t = c.team;
    if ((c.x - goalOf(t)) * dirOf(t) >= 0) { this.endPlay('td', { team: t, p: c }); return; }
    if (c.y < 0 || c.y > FW || c.x < -10 || c.x > 110) {
      var depth = (c.x - ownGoal(t)) * dirOf(t);
      if (depth < 0) { this.carrierDown(c); return; }
      this.endPlay('oob', { x: c.x });
    }
  };

  // =========================================================== AI
  G.think = function (p) {
    var b = this.ball;
    if (this.playType === 'kickoff') { this.thinkKickoff(p); return; }
    var hasBall = b.state === 'held' && b.holder === p;
    if (hasBall) {
      if (p.role === 'QB' && !this.handedOff && !this.passThrown && this.playType !== 'run' && this.relX(p.x) <= 0.5) this.thinkQB(p);
      else if (p.role === 'QB' && this.playType === 'run' && !this.handedOff) this.thinkHandoffQB(p);
      else this.thinkCarrier(p);
      return;
    }
    if (b.state === 'loose') { this.goTo(p, b.x, b.y, true); return; }
    if (p.team === this.ballTeam || (b.state === 'air' && b.thrower && b.thrower.team === p.team) || (b.state === 'pitch' && p.team === this.poss)) this.thinkOffense(p);
    else this.thinkDefense(p);
  };

  G.goTo = function (p, x, y, turbo, slowR) {
    var dx = x - p.x, dy = y - p.y, d = len(dx, dy);
    if (d < 0.15) { p.want.x = 0; p.want.y = 0; return; }
    p.want.x = dx / d; p.want.y = dy / d;
    if (slowR && d < slowR) p.wantSpeed = Math.max(0.15, d / slowR);
    p.wantTurbo = !!turbo;
  };

  G.thinkKickoff = function (p) {
    var b = this.ball;
    var carrier = b.state === 'held' ? b.holder : null;
    if (p.team === this.kickTeam) {
      if (carrier) { this.pursue(p, carrier); return; }
      var tx = b.state === 'air' ? b.tx : b.x, ty = b.state === 'air' ? b.ty : b.y;
      this.goTo(p, tx, p.y * 0.45 + ty * 0.55 + p.lane * 2, true);
      return;
    }
    if (p === this.returner && !carrier) { this.goTo(p, b.state === 'air' ? b.tx : b.x, b.state === 'air' ? b.ty : b.y, false, 1); return; }
    if (carrier === p) { this.thinkCarrier(p); return; }
    this.thinkBlock(p, carrier || this.returner);
  };

  G.thinkHandoffQB = function (p) {
    var rb = this.off.RB;
    if (this.offPlay.pitch) { p.want.x = -this.dir * 0.2; p.want.y = 0; return; }
    this.goTo(p, rb.x, rb.y, false);
  };

  G.thinkQB = function (p) {
    var self = this;
    var drop = this.qbDrop;
    var t = this.playT;
    var pressure = this.pressureOn(p);
    var dropped = dist(p, drop) < 0.8 || t > 1.1;
    if (!dropped) this.goTo(p, drop.x, drop.y, false, 1);
    // read progression
    var recs = this.eligible(p.team).filter(function (r) { return !(self.offPlay.block && self.offPlay.block[r.role]); });
    var best = null, bs = -1e9, bestOpen = 0;
    var primary = this.off[this.offPlay.primary];
    recs.forEach(function (r) {
      var open = self.openness(r);
      var depth = self.relX(r.x);
      var s = open + depth * 0.07 + (r === primary ? 0.6 : 0) - (depth < -2 && self.offPlay.type !== 'screen' ? 1.5 : 0);
      if (s > bs) { bs = s; best = r; bestOpen = open; }
    });
    var tMin = [1.35, 1.05, 0.9][this.isHuman(1 - p.team) ? this.diff : 1];
    if (this.offPlay.type === 'screen') tMin = 1.0;
    if (this.offPlay.id === 'hail') tMin = 2.4;
    var throwIt = false;
    if (best) {
      if (t > tMin && bestOpen > 3.2) throwIt = true;
      else if (t > 2.4 && bestOpen > 1.9) throwIt = true;
      else if (t > 3.4) throwIt = true;
      else if (pressure < 2.0 && t > 0.6 && bestOpen > 1.4) throwIt = true;
    }
    if (throwIt && bestOpen < 1.6 && t > 3.4) { this.throwAway(p); return; }
    if (throwIt) { this.throwTo(p, best); return; }
    if (pressure < 3.2 && dropped) {
      // escape pressure
      var ex = 0, ey = 0;
      this.players.forEach(function (d) {
        if (d.team === p.team || d.state !== 'ok') return;
        var dd = dist(d, p);
        if (dd < 5) { ex += (p.x - d.x) / (dd * dd); ey += (p.y - d.y) / (dd * dd); }
      });
      var el = len(ex, ey) || 1;
      p.want.x = ex / el + this.dir * 0.2; p.want.y = ey / el;
      p.wantTurbo = pressure < 1.8;
      // scramble if there is room up the field
      if (this.r01(p, 'scr') < 0.4 && p.r.spd > 80 && t > 2.0) { p.want.x = this.dir; p.wantTurbo = true; }
    }
  };

  G.r01 = function (p, key) {
    // stable per-play random value
    p._r = p._r || {};
    if (p._r[key] == null) p._r[key] = Math.random();
    return p._r[key];
  };

  G.thinkCarrier = function (p) {
    var self = this, t = p.team, dir = dirOf(t);
    // follow the designed run path first
    if (p.role === 'RB' && this.playType === 'run' && p.route && p.ri < p.route.length && this.playT < 1.6) {
      var pt = p.route[p.ri];
      if (dist(p, pt) < 1.2) p.ri++;
      if (p.ri < p.route.length) { this.goTo(p, pt.x, pt.y, true); return; }
    }
    var fx = dir * 1.0, fy = 0, nearest = 99;
    this.players.forEach(function (d) {
      if (d.team === t || d.state === 'down') return;
      var dx = p.x - d.x, dy = p.y - d.y, dd = len(dx, dy);
      if (dd < nearest && !d.eng) nearest = dd;
      if (dd > 9 || dd < 0.01) return;
      var ahead = (d.x - p.x) * dir;
      if (ahead < -2.5) return;
      var w = (d.eng ? 0.6 : 2.8) / (dd * dd);
      fx += dx / dd * w * 0.6; fy += dy / dd * w;
    });
    if (p.y < 5) fy += (5 - p.y) * 0.25;
    if (p.y > FW - 5) fy -= (p.y - (FW - 5)) * 0.25;
    var l = len(fx, fy) || 1;
    p.want.x = fx / l; p.want.y = fy / l;
    if ((fx * dir) < 0.15) p.want.x = dir * 0.3;
    p.wantTurbo = nearest < 7 || this.fire[t];
    if (nearest < 1.7 && p.spinCD <= 0 && Math.random() < 0.05) this.startSpin(p);
    if (nearest < 2.2 && p.jumpT <= 0 && Math.random() < 0.012) this.startJump(p);
  };

  G.thinkOffense = function (p) {
    var b = this.ball, self = this;
    var carrier = b.state === 'held' ? b.holder : null;
    if (b.state === 'air' && b.kind === 'pass') {
      if (b.target === p) { this.goTo(p, b.tx, b.ty, true, 0.6); return; }
      if (p.role === 'OL0' || p.role === 'OL1') { this.thinkProtect(p); return; }
      this.runRoute(p);
      return;
    }
    if (b.state === 'pitch') {
      if (b.target === p) { this.goTo(p, b.tx, b.ty, true); return; }
    }
    var inPocket = carrier && carrier.role === 'QB' && !this.handedOff && !this.passThrown && this.relX(carrier.x) <= 0.5;
    if (inPocket && this.playType !== 'run') {
      if (p.role === 'OL0' || p.role === 'OL1' || (p.blocker && !p.route)) { this.thinkProtect(p); return; }
      if (this.playType === 'screen' && (p.role === 'OL0' || p.role === 'OL1')) { this.thinkProtect(p); return; }
      if (p.blocker && p.route && p.ri >= p.route.length) { this.thinkProtect(p); return; }
      this.runRoute(p);
      return;
    }
    if (carrier && carrier !== p) { this.thinkBlock(p, carrier); return; }
    if (this.playType === 'run' && p.role === 'RB' && !this.handedOff) {
      var pt = p.route && p.route[0];
      if (pt) this.goTo(p, pt.x, pt.y, false);
      return;
    }
    if (this.playType === 'run' && (p.role === 'OL0' || p.role === 'OL1')) { this.thinkBlock(p, this.off.RB); return; }
  };

  G.runRoute = function (p) {
    if (!p.route) { p.want.x = 0; p.want.y = 0; return; }
    if (p.ri < p.route.length) {
      var pt = p.route[p.ri];
      var d = dist(p, pt);
      if (d < 0.7) {
        if (p.ri === p.route.length - 1) {
          var prev = p.ri > 0 ? p.route[p.ri - 1] : { x: p.x - this.dir, y: p.y };
          var vx = pt.x - prev.x, vy = pt.y - prev.y, vl = len(vx, vy) || 1;
          p.contX = vx / vl; p.contY = vy / vl;
        }
        p.ri++;
      } else { this.goTo(p, pt.x, pt.y, false); return; }
    }
    if (p.cont) {
      var nx = p.contX, ny = p.contY;
      if (p.y < 3 && ny < 0) ny = 0;
      if (p.y > FW - 3 && ny > 0) ny = 0;
      p.want.x = nx; p.want.y = ny;
      if (Math.abs(nx) + Math.abs(ny) < 0.1) p.want.x = this.dir;
      return;
    }
    // settle: drift away from the nearest defender
    var near = null, nd = 99, self = this;
    this.players.forEach(function (d) { if (d.team !== p.team && d.state === 'ok') { var dd = dist(d, p); if (dd < nd) { nd = dd; near = d; } } });
    if (near && nd < 4) { p.want.y = (p.y - near.y) > 0 ? 1 : -1; p.want.x = 0; p.wantSpeed = 0.35; }
    else { p.want.x = 0; p.want.y = 0; }
  };

  G.thinkProtect = function (p) {
    var qb = this.ball.holder || this.off.QB, self = this;
    if (p.eng) { p.want.x = 0; p.want.y = 0; return; }
    var best = null, bd = 99;
    var mate = p.role === 'OL0' ? this.off.OL1 : p.role === 'OL1' ? this.off.OL0 : null;
    this.players.forEach(function (d) {
      if (d.team === p.team || d.state !== 'ok') return;
      if (d.eng && d.eng !== p) return;
      if (self.relX(d.x) > 9) return;
      var rushing = d.assign === 'rush' || d.assign === 'runfit' || dist(d, qb) < 4.5;
      var dd = dist(d, p) + dist(d, qb) * 0.5 + (rushing ? 0 : 6) + (mate && mate.protTarget === d ? 5 : 0);
      if (dd < bd) { bd = dd; best = d; }
    });
    p.protTarget = best;
    if (best) {
      var tx = best.x + (qb.x - best.x) * 0.25, ty = best.y + (qb.y - best.y) * 0.25;
      this.goTo(p, tx, ty, false);
    } else {
      var hold = this.W(-1.5, p.role === 'OL0' ? -1.5 : 1.5);
      this.goTo(p, hold.x, hold.y, false, 1);
    }
  };

  G.thinkBlock = function (p, carrier) {
    if (p.eng) { p.want.x = 0; p.want.y = 0; return; }
    var best = null, bd = 99, self = this;
    var claimed = [];
    this.players.forEach(function (q) { if (q !== p && q.team === p.team && q.blockTarget) claimed.push(q.blockTarget); });
    var ol = p.role === 'OL0' || p.role === 'OL1';
    this.players.forEach(function (d) {
      if (d.team === p.team || d.state !== 'ok' || (d.eng && d.eng !== p)) return;
      var toCarrier = dist(d, carrier);
      if (toCarrier > 14) return;
      var dd = dist(d, p) * (ol ? 1.6 : 1) + toCarrier * (ol ? 0.3 : 0.8) + (claimed.indexOf(d) >= 0 ? 5 : 0);
      if (dd < bd) { bd = dd; best = d; }
    });
    p.blockTarget = best;
    if (best) {
      var tx = best.x + (carrier.x - best.x) * 0.2, ty = best.y + (carrier.y - best.y) * 0.2;
      this.goTo(p, tx, ty, dist(p, best) > 3);
    } else {
      this.goTo(p, carrier.x + dirOf(p.team) * 5, carrier.y + p.lane * 3, false);
    }
  };

  G.pursue = function (p, c) {
    var sp = this.maxSpeed(p) * 1.15;
    var d = dist(p, c);
    if (c === this.ball.holder && d < 2.5 && d > 0.6 && p.state === 'ok' && !p.eng && Math.random() < 0.16 * (1 + (p.r.tak - 75) / 60)) {
      var cvx = c.vx, cvy = c.vy, rx = p.x - c.x, ry = p.y - c.y;
      // only dive when the carrier is not running straight away from us
      if (cvx * rx + cvy * ry > -len(cvx, cvy) * d * 0.6) { this.startDive(p, c); return; }
    }
    var t = clamp(d / sp, 0, 1.1);
    var tx = c.x + c.vx * t, ty = c.y + c.vy * t;
    // fan out a little so pursuers don't stack
    if (d > 4) ty += p.lane * 0.8;
    this.goTo(p, tx, ty, d < 14);
  };

  G.thinkDefense = function (p) {
    var b = this.ball, self = this;
    if (p.eng) {
      // fight through: push toward the ball
      var tgt = b.holder || b;
      this.goTo(p, tgt.x, tgt.y, false);
      return;
    }
    var carrier = b.state === 'held' ? b.holder : null;
    var qbInPocket = carrier && carrier.role === 'QB' && !this.handedOff && !this.passThrown && this.relX(carrier.x) <= 0.5 && this.playType !== 'run';
    if (b.state === 'air' && b.kind === 'pass') {
      var L = { x: b.tx, y: b.ty };
      var react = 0.45 - (p.r.cov - 60) / 100;
      if (this.playT - this.throwTime < react) { this.cover(p); return; }
      var dL = dist(p, L);
      if (dL < 16) this.goTo(p, L.x, L.y, true, 0.4);
      else this.goTo(p, L.x, L.y, false);
      return;
    }
    if (b.state === 'pitch') { this.pursue(p, b.target); return; }
    if (!carrier) return;
    if (!qbInPocket) {
      // run play read: run fitters attack at once, everyone else needs a beat to diagnose it
      if (this.playType === 'run') {
        var readT = p.assign === 'runfit' ? 0.15 : 0.5 + (95 - p.r.tak) / 110;
        if (this.playT < 0.45 + readT && !(carrier.role === 'QB')) {
          if (p.assign === 'rush') { this.goTo(p, this.off.QB.x, this.off.QB.y, false); return; }
          this.cover(p);
          return;
        }
      }
      this.pursue(p, carrier);
      return;
    }
    // QB has the ball in the pocket
    this.cover(p);
  };

  G.cover = function (p) {
    var a = p.assign, self = this;
    var qb = this.off.QB;
    var carrier = this.ball.holder;
    if (a === 'rush' || a === 'runfit') {
      var tgt = carrier || qb;
      if (a === 'runfit' && this.playType !== 'run' && this.playT < 0.5) tgt = this.off.RB;
      // rushers loop around blockers a bit
      var ty = tgt.y;
      if (p.key === 'F1') ty -= 0.8 * this.dir; else if (p.key === 'F2') ty += 0.8 * this.dir;
      this.goTo(p, tgt.x, ty, this.playT > 0.5 || this.fire[p.team]);
      return;
    }
    if (a === 'spy') {
      var s = { x: qb.x + this.dir * 5, y: qb.y };
      if (this.relX(qb.x) > 0) { this.pursue(p, qb); return; }
      this.goTo(p, s.x, s.y, false, 1.2);
      return;
    }
    if (a && a.man && p.manTarget) {
      var r = p.manTarget;
      var lag = clamp(0.35 - (p.r.cov - 70) / 100, 0.02, 0.4);
      var ax = r.x + r.vx * (0.35 - lag) + this.dir * 1.0, ay = r.y + r.vy * (0.35 - lag);
      var deep = (r.x - p.x) * this.dir > -0.5;
      this.goTo(p, ax, ay, deep && this.playT > 0.4, 0.5);
      return;
    }
    if (a && a.zone) {
      var z = p.zone, best = null, bd = 9.5;
      this.eligible(this.poss).forEach(function (r) {
        var dd = dist(r, z);
        if (dd < bd) { bd = dd; best = r; }
      });
      if (best) {
        var tx = best.x * 0.72 + z.x * 0.28 + this.dir * 1.2, ty = best.y * 0.72 + z.y * 0.28;
        this.goTo(p, tx, ty, false, 0.6);
      } else this.goTo(p, z.x, z.y, false, 1.5);
      return;
    }
    this.goTo(p, qb.x, qb.y, false);
  };

  // ======================================================= PLAY END
  G.endPlay = function (reason, data) {
    if (this.phase !== 'live') return;
    this.phase = 'dead';
    this.deadT = reason === 'td' ? 2.6 : (reason === 'safety' ? 2.4 : 1.7);
    this.result = { reason: reason, data: data || {}, ballTeam: this.ballTeam };
    var b = this.ball;
    if (b.state === 'held' || b.state === 'loose') b.state = 'dead-held';
    this.players.forEach(function (p) { if (p.eng) { p.eng = null; } });
    this.emit('whistle', { reason: reason });
    if (reason === 'td') this.emit('td', { team: data.team, p: data.p });
    if (reason === 'safety') this.emit('safety', { team: 1 - data.team });
    if (reason === 'incomplete') this.emit('incomplete', {});
    if (reason === 'touchback') this.emit('touchback', {});
  };

  G.updateDead = function (dt, inputs) {
    var self = this;
    this.deadT -= dt;
    // late hits!
    this.ctl.forEach(function (c) {
      var p = c.pl, inp = inputs[c.slot] || {};
      if (!p) return;
      self.inputToWant(p, inp, !!inp.turbo);
      if (inp.action && p.state === 'ok') {
        var victim = null, vd = 2.2;
        self.players.forEach(function (q) { if (q.team !== p.team && q.state === 'ok') { var d = dist(p, q); if (d < vd) { vd = d; victim = q; } } });
        if (victim) {
          victim.state = 'down'; victim.st = 1.5;
          var dx = victim.x - p.x, dy = victim.y - p.y, dl = len(dx, dy) || 1;
          victim.vx = dx / dl * 6; victim.vy = dy / dl * 6;
          self.emit('latehit', { p: victim });
        } else self.startDive(p, { x: p.x + p.want.x * 2, y: p.y + p.want.y * 2, vx: 0, vy: 0 });
      }
    });
    this.players.forEach(function (p) {
      if (p.ctl < 0) { p.want.x = 0; p.want.y = 0; p.wantTurbo = false; }
      self.movePlayer(p, dt);
    });
    this.separate();
    var b = this.ball;
    if (b.state === 'dead-held' && b.holder) { b.x = b.holder.x; b.y = b.holder.y; b.z = b.holder.state === 'down' ? 0.3 : 1.1; }
    if (b.state === 'dead' && (b.z > 0.12 || b.vz > 0)) {
      b.x += (b.vx || 0) * dt; b.y += (b.vy || 0) * dt; b.z += b.vz * dt; b.vz -= 30 * dt;
      if (b.z < 0.12) { b.z = 0.12; b.vz = Math.abs(b.vz) > 3 ? Math.abs(b.vz) * 0.35 : 0; b.vx *= 0.5; b.vy *= 0.5; }
    }
    if (this.deadT <= 0) this.resolve();
  };

  G.updateAnim = function (dt) {
    var a = this.kickAnim, b = this.ball, self = this;
    a.t += dt;
    this.players.forEach(function (p) {
      p.want.x = 0; p.want.y = 0; p.wantTurbo = false;
      if (a.t > 0 && a.kind === 'punt') { self.goTo(p, a.tx, a.ty + p.lane * 4, false); p.wantSpeed = 0.55; }
      self.movePlayer(p, dt);
      p.wantSpeed = 1;
    });
    if (a.t < 0) { b.x = a.sx; b.y = a.sy; b.z = 0.4; return; }
    if (!a.kicked) { a.kicked = true; this.emit('kick', {}); }
    var s = Math.min(1, a.t / a.T);
    b.x = a.sx + (a.tx - a.sx) * s; b.y = a.sy + (a.ty - a.sy) * s;
    b.z = 0.4 + a.peak * 4 * s * (1 - s) + (a.kind !== 'punt' ? s * 3.2 : 0);
    b.spin += dt * 14;
    if (a.t >= a.T + 1.0) this.finishKickAnim();
    else if (s >= 1 && !a.announced) {
      a.announced = true;
      if (a.kind !== 'punt') this.emit(a.good ? 'fg' : 'fgmiss', { kind: a.kind, dist: a.dist, team: this.poss });
    }
  };

  G.finishKickAnim = function () {
    var a = this.kickAnim, o = this.poss;
    if (a.kind === 'punt') {
      var recv = 1 - o, x = a.tx;
      if ((x - ownGoal(recv)) * dirOf(recv) <= 0) { x = ownGoal(recv) + 20 * dirOf(recv); this.emit('touchback', {}); }
      this.newPossession(recv, x);
      this.afterPlayClock(false);
      return;
    }
    if (a.kind === 'xp') {
      if (a.good) this.score[o] += 1;
      this.afterScore(o);
      return;
    }
    // field goal
    if (a.good) {
      this.score[o] += 3;
      this.scored(o);
      if (this.checkOTWin()) return;
      this.afterScore(o);
    } else {
      var other = 1 - o;
      var spot = a.holderX;
      if ((spot - ownGoal(other)) * dirOf(other) < 20) spot = ownGoal(other) + 20 * dirOf(other);
      this.newPossession(other, spot);
      this.afterPlayClock(false);
    }
  };

  // Called when the whistle has blown and the dead-ball pause is over.
  G.resolve = function () {
    var r = this.result, o = this.poss, self = this;
    var reason = r.reason, bt = r.ballTeam;
    var log = this.log;

    if (this.playType === 'kickoff') {
      if (reason === 'td') { this.score[bt] += 6; this.statTD(r.data.p); this.scored(bt); if (this.checkOTWin()) return; this.startPAT(bt); return; }
      if (reason === 'safety') { this.score[1 - bt] += 2; this.scored(1 - bt); if (this.checkOTWin()) return; this.afterSafety(bt); return; }
      var x = reason === 'touchback' ? ownGoal(bt) + 25 * dirOf(bt) : r.data.x;
      this.newPossession(bt, x);
      this.afterPlayClock(reason === 'tackle');
      return;
    }

    // credit yardage
    var spotX = r.data.x != null ? r.data.x : this.losX;
    var gained = Math.round((spotX - this.losX) * this.dir);
    if (reason === 'td') gained = Math.round((goalOf(o) - this.losX) * this.dir);
    if (bt === o && reason !== 'incomplete' && reason !== 'safety') this.creditYards(gained, reason === 'td');

    if (this.conversion) {
      this.conversion = false;
      if (reason === 'td' && bt === o) { this.score[o] += 2; this.emit('twopt', { team: o, good: true }); }
      else this.emit('twopt', { team: o, good: false });
      this.afterScore(o);
      return;
    }

    if (reason === 'td') {
      this.score[bt] += 6;
      if (bt !== o) this.statTD(r.data.p);
      this.scored(bt);
      if (this.checkOTWin()) return;
      this.startPAT(bt);
      return;
    }
    if (reason === 'safety') {
      this.score[1 - bt] += 2;
      this.scored(1 - bt);
      if (this.checkOTWin()) return;
      this.afterSafety(bt);
      return;
    }
    if (reason === 'touchback') {
      this.newPossession(bt, ownGoal(bt) + 20 * dirOf(bt));
      this.afterPlayClock(false);
      return;
    }
    if (bt !== o) {
      // turnover returned and downed
      this.newPossession(bt, spotX);
      this.emit('turnover', { team: bt });
      this.afterPlayClock(false);
      return;
    }
    if (reason === 'incomplete') spotX = this.losX;
    spotX = clamp(spotX, 0.5, 99.5);
    var madeFirst = (spotX - this.firstX) * this.dir >= 0;
    if (madeFirst) {
      this.losX = spotX;
      this.down = 1;
      this.firstX = this.losX + FIRST_DOWN * this.dir;
      this.stats.team[o].firstDowns++;
      this.defStreak[1 - o] = 0;
      this.emit('first', { team: o });
    } else {
      this.losX = spotX;
      this.down++;
      if (this.down > 4) {
        this.emit('downs', { team: 1 - o });
        this.defStop(1 - o);
        this.newPossession(1 - o, spotX);
      }
    }
    this.afterPlayClock(reason === 'tackle');
  };

  G.creditYards = function (gained, td) {
    var o = this.poss, log = this.log;
    var ts = this.stats.team[o];
    if (log.completed && log.catcher) {
      ts.passYds += gained;
      this.pstat(log.passer).passYds += gained;
      var cs = this.pstat(log.catcher);
      cs.recYds += gained;
      if (td) { ts.passTD++; this.pstat(log.passer).passTD++; cs.recTD++; }
    } else if (!log.sack && !log.intBy) {
      var runner = log.rusher || (this.ball.holder && this.ball.holder.team === o ? this.ball.holder : null);
      if (runner) {
        ts.rushYds += gained;
        var rs = this.pstat(runner);
        rs.rushYds += gained;
        if (td) { ts.rushTD++; rs.rushTD++; }
      }
    } else if (log.sack) {
      ts.passYds += gained;
    }
  };

  // Return touchdowns (kick returns, interception and fumble returns).
  G.statTD = function (p) {
    if (!p) return;
    this.pstat(p).retTD++;
    this.stats.team[p.team].retTD++;
  };

  G.scored = function (team) {
    if (this.fire[1 - team]) this.setFire(1 - team, false);
    this.offStreak[1 - team] = 0;
    this.defStreak[1 - team] = 0;
  };

  G.checkOTWin = function () {
    if (this.ot && this.score[0] !== this.score[1]) { this.finish(); return true; }
    return false;
  };

  G.newPossession = function (team, x) {
    x = clamp(x, 1, 99);
    var changed = team !== this.poss;
    this.poss = team;
    this.losX = x;
    this.down = 1;
    this.firstX = x + FIRST_DOWN * dirOf(team);
    if (changed) {
      this.offStreak[1 - team] = 0;
      if (this.log && (this.log.intBy || this.log.fumbleLost) && this.fire[1 - team]) this.setFire(1 - team, false);
    }
  };

  G.afterPlayClock = function (runoff) {
    if (runoff && this.clock > 0 && !this.conversion) this.clock = Math.max(0, this.clock - 3);
    if (this.clock <= 0) { this.endQuarter(); return; }
    this.toSelect();
  };

  G.toSelect = function () {
    this.phase = 'select';
    this.selectWait = 0.4;
    this.playType = 'select';
    // reset formation view at the new spot
    this.dir = dirOf(this.poss);
    this.ball.state = 'dead'; this.ball.x = this.losX; this.ball.y = MID; this.ball.z = 0.2; this.ball.holder = null;
    this.emit('select', { off: this.poss });
  };

  G.startPAT = function (team) {
    this.poss = team;
    this.phase = 'pat';
    this.patTeam = team;
    this.dir = dirOf(team);
    if (!this.isHuman(team)) {
      var diff = this.score[team] - this.score[1 - team];
      var two = diff === -2 || diff === -5 || diff === 1 || diff === 5 || diff === -10;
      this.patWait = 1.2;
      this.patChoice = two ? 'two' : 'kick';
    } else this.patChoice = null;
    this.emit('pat', { team: team });
  };

  G.choosePAT = function (choice) {
    if (this.phase !== 'pat') return;
    var t = this.patTeam;
    this.poss = t;
    if (choice === 'two') {
      this.losX = goalOf(t) - 2 * dirOf(t);
      this.firstX = goalOf(t);
      this.down = 1;
      this.conversion = true;
      this.toSelect();
    } else {
      this.losX = goalOf(t) - 15 * dirOf(t);
      this.setupKickAnim('xp');
    }
  };

  G.afterScore = function (team) {
    this.conversion = false;
    if (this.clock <= 0) { this.pendingKick = team; this.endQuarter(); return; }
    this.setupKickoff(team);
  };

  G.afterSafety = function (team) {
    if (this.clock <= 0) { this.pendingKick = team; this.endQuarter(); return; }
    this.setupKickoff(team);
  };

  G.endQuarter = function () {
    var q = this.quarter;
    if (q === 4 || q >= 5) {
      if (this.score[0] === this.score[1] && q === 4) {
        this.quarter = 5; this.ot = true; this.clock = Math.max(60, Math.round(this.qLen * 0.75));
        this.breakMsg = 'OVERTIME'; this.phase = 'break'; this.breakT = 2.6; this.nextAfterBreak = 'otkick';
        this.emit('quarter', { q: 5, ot: true });
        return;
      }
      this.finish();
      return;
    }
    this.quarter++;
    this.clock = this.qLen;
    this.phase = 'break'; this.breakT = 2.4;
    if (q === 2) { this.breakMsg = 'HALFTIME'; this.nextAfterBreak = 'half'; this.emit('half', {}); }
    else { this.breakMsg = 'END OF Q' + q; this.nextAfterBreak = this.pendingKick != null ? 'kick' : 'select'; this.emit('quarter', { q: this.quarter }); }
  };

  G.afterBreak = function () {
    var n = this.nextAfterBreak;
    var pk = this.pendingKick; this.pendingKick = null;
    if (n === 'half') { this.fire = [false, false]; this.setupKickoff(this.receiveFirst); return; }
    if (n === 'otkick') { this.setupKickoff(Math.random() < 0.5 ? 0 : 1); return; }
    if (n === 'kick') { this.setupKickoff(pk); return; }
    this.toSelect();
  };

  G.finish = function () {
    this.phase = 'final';
    this.over = true;
    this.emit('final', { score: this.score.slice() });
  };

  G.mvp = function () {
    var best = null, bs = -1, P = this.stats.players;
    Object.keys(P).forEach(function (id) {
      var s = P[id];
      var v = s.passYds * 0.04 + s.passTD * 4 + s.rushYds * 0.1 + s.rushTD * 6 + s.recYds * 0.1 + s.rec + s.recTD * 6 + s.retTD * 6 + s.tak + s.sacks * 4 + s.ints * 5;
      if (s.name.charAt(0) === '#') v -= 100;
      if (v > bs) { bs = v; best = s; }
    });
    return best;
  };

  // ---------------------------------------------------------- CPU / pacing
  // Lets the engine progress phases that need a decision when no human is involved.
  G.cpuStep = function (dt) {
    if (this.phase === 'select' && this.selectWait <= 0) {
      var offH = this.isHuman(this.poss), defH = this.isHuman(1 - this.poss);
      if (!offH && !defH) this.choosePlays(FB.AI.pickOffense(this), FB.AI.pickDefense(this));
    }
    if (this.phase === 'pat' && !this.isHuman(this.patTeam)) {
      this.patWait -= dt;
      if (this.patWait <= 0) this.choosePAT(this.patChoice);
    }
  };
})();
