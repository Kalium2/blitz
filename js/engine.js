/*
 * Football Blitz '26 — game simulation.
 *
 * World coordinates are yards. x runs along the field: 0 and 100 are the goal
 * lines, end zones run to -10 and 110. y runs across the field from 0 to
 * 53.33. Team 0 always attacks x = 100, team 1 always attacks x = 0.
 *
 * Arcade rules (NFL Blitz style): 7 on 7, 10 yards for a first down, no
 * penalties, late hits allowed, 3 straight completions or defensive stops
 * put a team ON FIRE.
 */
(function () {
  var FB = (window.FB = window.FB || {});
  var Plays = FB.Plays;

  var FW = 53.333, MID = FW / 2;
  var TURBO_MUL = 1.27;
  var FIRST_DOWN = 10;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function len(x, y) { return Math.sqrt(x * x + y * y); }
  function dist(a, b) { return len(a.x - b.x, a.y - b.y); }
  function dirOf(t) { return t === 0 ? 1 : -1; }
  // inside the sidelines and end lines (the end zones run to -10 and 110)
  function inBounds(p) { return p.y >= 0 && p.y <= FW && p.x >= -10 && p.x <= 110; }
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
    this.weather = opts.weather || 'clear';      // clear | rain | snow | fog
    this.infTurbo = !!opts.infTurbo;             // cheat: humans never run out of turbo
    this.aimAssist = opts.aimAssist !== false;   // human passes snap to, and favour, open receivers
    // wind: speed in mph and the direction it blows toward (world radians)
    this.wind = opts.wind === false ? { mph: 0, ang: 0 } : { mph: Math.round(rnd(0, 1) < 0.25 ? rnd(0, 3) : rnd(3, 16)), ang: rnd(0, Math.PI * 2) };
    this.powerupsOn = opts.powerups !== false;
    this.powers = {};                            // player id -> { type, plays }
    this.token = null;                           // power-up token on the field
    this.flip = 1;
    this.viewDir = 1;        // which way the camera looks (follows turnovers mid-play)
    this.camHeading = null;  // actual camera heading in radians, reported by the renderer
    this.score = [0, 0];
    this.quarter = 1;
    this.clock = this.qLen;
    this.clockRun = false;          // does the clock keep running between plays?
    this.timeouts = [3, 3];
    this.toPending = [false, false];
    this.warned = false;            // two-minute warning given this half
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

  // ---- power-ups: SPEED (faster, free turbo), HANDS (catch/pick), TANK (break / deliver hits)
  var POWER_TYPES = ['speed', 'hands', 'tank'];
  G.powerOf = function (p) { var pw = this.powers[p.info.id]; return pw ? pw.type : null; };
  G.agePowers = function () {
    var P = this.powers;
    Object.keys(P).forEach(function (id) { if (--P[id].plays <= 0) delete P[id]; });
  };
  G.spawnToken = function () {
    if (!this.powerupsOn || this.conversion || this.attract || Math.random() > 0.25) return;
    var w = this.W(rnd(6, 22), rnd(-15, 15));
    if ((goalOf(this.poss) - w.x) * this.dir < 3) return;
    this.token = { x: w.x, y: clamp(w.y, 4, FW - 4), type: POWER_TYPES[(Math.random() * 3) | 0] };
  };
  G.checkToken = function () {
    var t = this.token, self = this;
    if (!t) return;
    var got = null;
    this.players.forEach(function (p) { if (!got && p.state === 'ok' && dist(p, t) < 1.1) got = p; });
    if (!got) return;
    this.powers[got.info.id] = { type: t.type, plays: 4 };
    this.token = null;
    this.emit('powerup', { p: got, type: t.type, team: got.team });
  };

  // Wind acceleration on a ball in flight (yards/s^2).
  G.windAcc = function () {
    var a = this.wind.mph * 0.045;
    return { x: Math.cos(this.wind.ang) * a, y: Math.sin(this.wind.ang) * a };
  };

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
  // offense-relative -> world, mirrored when the play is flipped
  G.Wf = function (dx, dy) { return this.W(dx, dy * this.flip); };
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
    if (this.powers[p.info.id] && this.powers[p.info.id].type === 'speed') s *= 1.1;
    if (this.fire[p.team]) s *= 1.06;
    return s;
  };

  // ============================================================ SETUP
  G.clearPlay = function () {
    this.players = [];
    // Blitz: everyone starts each play with a full turbo meter
    this.ctl.forEach(function (c) { c.turbo = 1; });
    this.crossedLOS = false;
    this.flightChecked = [];
    this.token = null;
    this.hotChecked = false; this.hotRecv = null;
    this.kickRunT = 0; this.koMeter = null;
    this.viewDir = this.dir;
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
    var spots = [[5, MID], [40, 12], [40, 41], [34, 22], [34, 31], [27, 18], [27, 35]];
    rInfos.forEach(function (info, i) {
      var p = self.mk(recv, info, i === 0 ? 'KR' : 'block', 'R' + i);
      p.x = ownGoal(recv) + rd * spots[i][0]; p.y = spots[i][1];
      p.blocker = i !== 0;
    });
    this.returner = this.players[7];
    this.agePowers();

    this.land = { x: ownGoal(recv) + rd * rnd(-1, 7), y: MID + rnd(-9, 9) };
    this.onside = false;
    // CPU tries an onside kick when trailing late
    var deficit = this.score[recv] - this.score[kickTeam];
    if (!this.isHuman(kickTeam) && !this.attract && deficit > 0 && deficit <= 16 && this.quarter >= 4 && this.clock < this.qLen * 0.5) this.onside = true;
    else if (!this.isHuman(kickTeam) && deficit > 0 && deficit <= 16 && this.quarter >= 4 && this.clock < this.qLen * 0.5 && Math.random() < 0.6) this.onside = true;
    this.koPower = rnd(0.72, 1);
    if (this.isHuman(kickTeam)) this.koMeter = { t: 0, val: 0, set: false };
    this.ball.x = this.losX; this.ball.y = MID; this.ball.z = 0.4; this.ball.state = 'tee';
    this.phase = 'presnap';
    this.snapTimer = 1.4;
    this.assignControl(true);
    this.emit('kickoff', { team: kickTeam });
  };

  // Set up a scrimmage play once both sides have chosen.
  G.choosePlays = function (offPlay, defPlay, flip) {
    if (this.phase !== 'select') return;
    this.offPlay = offPlay; this.defPlay = defPlay;
    this.flip = flip ? -1 : 1;
    this.audibles = 0;
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
      var w = self.Wf(F[role][0], F[role][1]);
      p.x = w.x; p.y = w.y; p.face = self.dir > 0 ? 0 : Math.PI;
      self.off[role] = p;
      p.blocker = role === 'OL0' || role === 'OL1' || !!(play.block && play.block[role]);
      if (play.routes && play.routes[role] && !(play.block && play.block[role])) {
        p.route = play.routes[role].map(function (pt) { return self.Wf(F[role][0] + pt[0], F[role][1] + pt[1]); });
        p.cont = !!(play.cont && play.cont[role]);
      } else if (play.block && play.block[role] && play.routes && play.routes[role]) {
        // blockers on pass plays release a few yards then block
        p.route = play.routes[role].slice(0, 1).map(function (pt) { return self.Wf(F[role][0] + pt[0], F[role][1] + pt[1]); });
      }
    });
    var qb = this.off.QB;
    if (play.type === 'run') {
      // the designed runner follows the run path (the QB himself on a keeper)
      var runner = play.keeper ? qb : this.off.RB, rf = F[play.keeper ? 'QB' : 'RB'];
      runner.route = play.run.map(function (pt) { return self.Wf(rf[0] + pt[0], rf[1] + pt[1]); });
    }
    this.qbDrop = play.boot ? this.Wf(play.boot[0], play.boot[1])
      : play.draw ? this.W(F.QB[0] - 1.5, 0)
      : play.form === 'under' ? this.W(-5.5, 0) : this.W(F.QB[0] - (play.drop ? play.drop - 5 : 1.5), 0);

    // defense
    var dInfos = { F1: dt.defense[0], F2: dt.defense[1], M: dt.defense[2], B1: dt.defense[3], B2: dt.defense[4], NT: dt.depth[0], DB: dt.depth[1] };
    this.def = {};
    var A = Plays.DEF_ALIGN;
    ['F1', 'F2', 'NT', 'M', 'B1', 'DB', 'B2'].forEach(function (key) {
      var p = self.mk(d, dInfos[key], 'D', key);
      var spot = A[key].slice();
      var asg = self.defPlay.a[key];
      // press corners line up on their receiver
      if (asg && asg.man === 'WR1') spot = [self.defPlay.id === 'man' ? 2 : 6, F.WR1[1] * self.flip];
      if (asg && asg.man === 'WR2') spot = [self.defPlay.id === 'man' ? 2 : 6, F.WR2[1] * self.flip];
      if (asg && asg.man === 'TE') spot = [4.5, F.TE[1] * self.flip];
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
    if (!this.audibling) { this.agePowers(); this.spawnToken(); }
    this.phase = 'presnap';
    var humanOff = this.isHuman(o);
    this.snapTimer = humanOff ? 15 : rnd(1.1, 1.8) + (this.isHuman(d) ? 0.7 : 0);
    this.cadence = null;
    this.assignControl(true);
    this.emit('setup', {});
  };

  // Punt / field goal / extra point: snap, run-up and a physically simulated kick.
  G.setupKickAnim = function (kind) {
    var o = this.poss, self = this;
    this.playType = kind;
    this.dir = dirOf(o);
    this.clearPlay();
    var ot = this.teams[o], dt = this.teams[1 - o];
    var oInfos = ot.offense.concat(ot.ol), dInfos = dt.defense.concat(dt.depth);
    var punt = kind === 'punt';
    var oSpots = punt ? [[-12, 0], [-2, 3], [-1, -6], [-1, 6], [-1, 3.2], [-0.6, -1.6], [-0.6, 0]]
                      : [[-7, 0], [-9.6, -1.6], [-1, -4.6], [-1, 4.6], [-1, 3.2], [-0.6, -1.6], [-0.6, 0]];
    var dSpots = punt ? [[1, -3], [1, 3], [1, 0], [6, -8], [6, 8], [35, -6], [38, 4]] : [[1, -3], [1, 3], [1, 0], [1, -6], [1, 6], [5, -9], [5, 9]];
    oInfos.forEach(function (info, i) {
      var p = self.mk(o, info, 'K', 'K' + i); var w = self.W(oSpots[i][0], oSpots[i][1]); p.x = w.x; p.y = w.y; p.face = self.dir > 0 ? 0 : Math.PI;
    });
    dInfos.forEach(function (info, i) {
      var p = self.mk(1 - o, info, 'K', 'D' + i); var w = self.W(dSpots[i][0], dSpots[i][1]); p.x = w.x; p.y = w.y; p.face = self.dir > 0 ? Math.PI : 0;
    });
    var holder = this.players[0], center = this.players[6];
    var kicker = punt ? holder : this.players[1];
    var a = { kind: kind, stage: 'set', t: 0, holder: holder, kicker: kicker, center: center, human: this.isHuman(o),
      spot: { x: holder.x, y: holder.y }, power: null, acc: null, meterT: 0, crossed: false, done: false };
    if (!a.human) {
      // CPU picks power for the distance and aims partly into the wind
      var need = punt ? this.cpuPuntPower() : this.cpuKickPower(kind);
      a.power = clamp(need, 0.15, 1);
      var skill = [1.4, 1, 0.75][this.diff] || 1;
      if (this.attract) skill = 1;
      a.acc = clamp(this.gauss() * (punt ? 0.25 : 0.14 + this.fgDistance() / 170) * skill - this.windAim(kind) * 0.7, -1, 1);
      a.stage = 'wait'; a.t = 0.9;
    } else { a.stage = 'meter'; }
    this.kickAnim = a;
    var b = this.ball;
    b.state = 'kick'; b.x = center.x; b.y = center.y; b.z = 0.25; b.holder = null;
    this.phase = 'anim';
    this.assignControl(true);
    this.emit(punt ? 'punt' : 'fgsetup', { kind: kind });
  };

  G.gauss = function () { var u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  // Kick physics constants (yards, seconds).
  var GRAV = 10.67, FG_ANGLE = 0.66, PUNT_ANGLE = 0.95;
  // CPU punter: full leg from deep in his own end, but from near midfield he
  // drops it around the 15 so the bounce has room before the goal line.
  G.cpuPuntPower = function () {
    var toGoal = (goalOf(this.poss) - this.losX) * this.dir;
    var want = Math.min(62, toGoal + 12 - 15 - 10);               // carry, leaving ~10 yards of roll
    var v = Math.sqrt(Math.max(1, want) * GRAV / Math.sin(2 * PUNT_ANGLE));
    return clamp((v - 18) / 9.5 + rnd(-0.08, 0.08), 0.15, 1);
  };
  G.kickSpeed = function (kind, power) { return kind === 'punt' ? 18 + power * 9.5 : 16 + power * 11.5; };
  G.goalPostX = function () { return goalOf(this.poss) + 10 * dirOf(this.poss); };
  // Power a CPU kicker needs to clear the bar with a little margin.
  G.cpuKickPower = function (kind) {
    var a = this.kickAnim || { spot: this.W(-7, 0) };
    var D = Math.abs(this.goalPostX() - this.W(-7, 0).x), th = FG_ANGLE, ok = 1;
    for (var pw = 0.1; pw <= 1.0001; pw += 0.02) {
      var v = this.kickSpeed(kind, pw), vh = v * Math.cos(th), t = D / vh;
      if (0.4 + v * Math.sin(th) * t - 0.5 * GRAV * t * t > 4.6) { ok = pw; break; }
    }
    return clamp(ok + rnd(0.02, 0.12), 0, 1);
  };
  // Positive = wind pushes the ball toward the kicker's right.
  G.windAim = function () { var w = this.windAcc(); return (w.y * this.dir) / 0.7; };

  G.updateAnim = function (dt, inputs) {
    var a = this.kickAnim, b = this.ball, self = this, o = this.poss;
    a.t -= dt;
    // everyone holds their stance until the snap, then blocks / covers
    this.players.forEach(function (p) {
      p.want.x = 0; p.want.y = 0; p.wantTurbo = false;
      if ((a.stage === 'flight' || a.stage === 'roll') && a.kind === 'punt' && p !== a.kicker) {
        // the outside gunners sprint to the ball to down it; everyone else covers in lanes
        var gunner = p.team === o && (p.key === 'K2' || p.key === 'K3');
        self.goTo(p, b.x, b.y + (gunner ? 0 : p.lane * 4), p.team === o); p.wantSpeed = gunner ? 1 : 0.8;
      }
      else if (a.stage === 'flight' && p.team !== o && p.key.charAt(0) === 'D' && +p.key.slice(1) < 3) { self.goTo(p, a.spot.x, a.spot.y, true); p.wantSpeed = 0.5; }
      self.movePlayer(p, dt);
      p.wantSpeed = 1;
    });
    var c = this.ctlFor(o), inp = c ? (inputs && inputs[c.slot]) || {} : {};
    if (a.stage === 'meter') {
      // two-press meter: power (fills and drains), then accuracy (needle swings)
      a.meterT += dt;
      if (a.power == null) {
        a.meterVal = 1 - Math.abs(((a.meterT * 0.75) % 2) - 1);
        if (inp.action) { a.power = a.meterVal; a.meterT = 0; this.emit('meter', {}); }
      } else {
        a.needle = Math.sin(a.meterT * 4.2);
        if (inp.action) { a.acc = a.needle; a.stage = 'wait'; a.t = 0.2; this.emit('meter', {}); }
      }
      if (a.meterT > 9) { if (a.power == null) a.power = 0.7; a.acc = 0.3; a.stage = 'wait'; a.t = 0.2; }
      b.x = a.center.x; b.y = a.center.y; b.z = 0.25;
      return;
    }
    if (a.stage === 'wait') {
      b.x = a.center.x; b.y = a.center.y; b.z = 0.25;
      // the holder (or punter) calls the same cadence before the long snap
      if (!this.cadence) this.cadence = { t: 0, n: 0, who: a.holder };
      if (this.stepCadence(dt)) { a.stage = 'snap'; a.t = 0.42; this.emit('snap', {}); }
      return;
    }
    if (a.stage === 'snap') {
      var s = 1 - Math.max(0, a.t) / 0.42;
      b.x = a.center.x + (a.holder.x - a.center.x) * s; b.y = a.center.y + (a.holder.y - a.center.y) * s;
      b.z = 0.3 + s * 0.6 + Math.sin(s * Math.PI) * 0.4; b.spin += dt * 20;
      if (a.t <= 0) { a.stage = 'approach'; a.t = a.kind === 'punt' ? 0.55 : 0.5; a.start = { x: a.kicker.x, y: a.kicker.y }; }
      return;
    }
    if (a.stage === 'approach') {
      var hb = a.kind === 'punt' ? { x: a.holder.x + this.dir * 0.6, y: a.holder.y, z: 1.0 } : { x: a.holder.x, y: a.holder.y + 0.4, z: 0.2 };
      b.x = hb.x; b.y = hb.y; b.z = hb.z;
      if (a.kind !== 'punt') { var k = 1 - Math.max(0, a.t) / 0.5; a.kicker.x = a.start.x + (hb.x - this.dir * 0.4 - a.start.x) * k; a.kicker.y = a.start.y + (hb.y - 0.3 - a.start.y) * k; a.kicker.vx = this.dir * 5; }
      else { a.kicker.vx = this.dir * 3; a.kicker.x += this.dir * 2.5 * dt; }
      a.kicker.face = this.dir > 0 ? 0 : Math.PI;
      if (a.t <= 0) this.launchKick(hb);
      return;
    }
    if (a.stage === 'flight') {
      a.ft += dt;
      var w = this.windAcc(), t = a.ft;
      var px = b.x;
      b.x = a.lx + a.vx * t + 0.5 * w.x * t * t;
      b.y = a.ly + a.vy * t + 0.5 * w.y * t * t;
      b.z = a.lz + a.vz * t - 0.5 * GRAV * t * t;
      b.spin += dt * 16;
      if (a.kind !== 'punt' && !a.crossed) {
        var gp = this.goalPostX();
        if ((px - gp) * this.dir < 0 && (b.x - gp) * this.dir >= 0) {
          a.crossed = true;
          a.good = Math.abs(b.y - MID) < 3.08 && b.z > 3.33;
          this.emit(a.good ? 'fg' : 'fgmiss', { kind: a.kind, dist: a.dist, team: o, why: b.z <= 3.33 ? 'short' : 'wide' });
        }
      }
      if (b.z <= 0.15) {
        b.z = 0.15;
        if (a.kind !== 'punt' && !a.crossed) { a.crossed = true; a.good = false; this.emit('fgmiss', { kind: a.kind, dist: a.dist, team: o, why: 'short' }); }
        if (a.kind === 'punt') {
          // a punt doesn't stop where it lands: it bounces and rolls
          var tl = a.ft;
          a.bvx = (a.vx + w.x * tl) * rnd(0.3, 0.55); a.bvy = (a.vy + w.y * tl) * rnd(0.3, 0.55) + rnd(-2, 2);
          a.bvz = Math.max(2.5, -(a.vz - GRAV * tl) * rnd(0.3, 0.45));
          a.stage = 'roll'; a.rollT = 0; a.hops = 0;
          this.emit('puntbounce', { x: b.x, y: b.y });
          return;
        }
        a.stage = 'done'; a.t = 1.1;
      }
      return;
    }
    if (a.stage === 'roll') {
      // Footballs bounce badly: each hop loses speed, can kick sideways, and
      // now and then checks up or hops back toward the kicker.
      a.rollT += dt;
      b.x += a.bvx * dt; b.y += a.bvy * dt; b.z += a.bvz * dt; a.bvz -= GRAV * dt;
      b.spin += dt * (10 + Math.abs(a.bvx));
      if (b.z <= 0.15) {
        b.z = 0.15;
        if (a.bvz < -1.2) {
          a.hops++;
          a.bvz = -a.bvz * rnd(0.3, 0.5);
          var keep = rnd(0.45, 0.8);
          if (Math.random() < 0.22) keep = -rnd(0.15, 0.45);       // checks up and hops back
          a.bvx *= keep; a.bvy = a.bvy * rnd(0.4, 0.9) + rnd(-2.5, 2.5);
          this.emit('puntbounce', { x: b.x, y: b.y });
        } else {
          // rolling: friction until it dies
          a.bvz = 0;
          var sp = len(a.bvx, a.bvy), f = Math.max(0, sp - 10 * dt) / (sp || 1);
          a.bvx *= f; a.bvy *= f;
        }
      }
      var outSide = b.y < 0 || b.y > FW, dead = len(a.bvx, a.bvy) < 0.3 && b.z <= 0.16;
      // the coverage team downs it once they get a hand on it (short of the end zone)
      var downer = null;
      if (b.z < 1.4 && (b.x - goalOf(o)) * this.dir < 0) this.players.forEach(function (p) { if (!downer && p.team === o && p !== a.kicker && p.state === 'ok' && dist(p, b) < 1.1) downer = p; });
      if (downer) this.emit('downed', { p: downer });
      if (outSide || dead || downer || a.rollT > 4 || b.x < -10 || b.x > 110) {
        b.y = clamp(b.y, 0, FW);
        a.land = { x: b.x, y: b.y };
        if (outSide) this.emit('puntoob', {});
        a.stage = 'done'; a.t = 0.8;
      }
      return;
    }
    if (a.stage === 'done' && a.t <= 0) this.finishKickAnim();
  };

  G.launchKick = function (hb) {
    var a = this.kickAnim, b = this.ball;
    var punt = a.kind === 'punt';
    var power = a.power, acc = a.acc || 0;
    // a mistimed accuracy press on a punt shanks it
    if (punt && Math.abs(acc) > 0.85) power *= 0.6;
    var v = this.kickSpeed(a.kind, power), th = punt ? PUNT_ANGLE : FG_ANGLE;
    var yaw = acc * (punt ? 0.17 : 0.12) + this.gauss() * 0.008; // radians off straight
    var vh = v * Math.cos(th);
    a.vx = vh * Math.cos(yaw) * this.dir; a.vy = vh * Math.sin(yaw) * this.dir; a.vz = v * Math.sin(th);
    a.lx = hb.x; a.ly = hb.y; a.lz = hb.z; a.ft = 0;
    a.dist = Math.round(Math.abs(this.goalPostX() - hb.x));
    a.stage = 'flight';
    a.kicker.kickT = 0.45;
    b.state = 'kick';
    this.emit('kick', { p: a.kicker });
  };

  G.finishKickAnim = function () {
    var a = this.kickAnim, o = this.poss;
    if (a.kind === 'punt') {
      var recv = 1 - o, x = a.land ? a.land.x : this.ball.x;
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
    if (a.good) {
      this.score[o] += 3;
      this.scored(o);
      if (this.checkOTWin()) return;
      this.afterScore(o);
    } else {
      var other = 1 - o;
      var spot = a.spot.x;
      if ((spot - ownGoal(other)) * dirOf(other) < 20) spot = ownGoal(other) + 20 * dirOf(other);
      this.newPossession(other, spot);
      this.afterPlayClock(false);
    }
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

  // Turbo belongs to the player for the rest of the play: someone you haven't
  // controlled yet this play starts with a full meter, and going back to a
  // player you already used gives him at least half (or what he had left, if
  // more). Players are rebuilt every play, so this resets with each snap.
  G.setControl = function (c, p) {
    if (c.pl) { c.pl.ctl = -1; c.pl.turboLeft = c.turbo; }
    c.pl = p;
    if (p) {
      p.ctl = this.ctl.indexOf(c);
      c.turbo = p.turboLeft == null ? 1 : Math.max(0.5, p.turboLeft);
    }
  };

  // A human keeps the player they're on until a teammate has held the ball
  // for HOLD_SWITCH seconds (a catch, handoff, pitch, pick or recovery), or
  // until they switch by hand. Passes in the air and loose balls never move
  // control on their own.
  var HOLD_SWITCH = 0.5;
  G.autoControl = function () {
    var b = this.ball, self = this;
    this.ctl.forEach(function (c) {
      var want = null;
      if (b.state === 'held' && b.holder && b.holder.team === c.team) {
        if (self.heldT >= HOLD_SWITCH) want = b.holder;
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
    this.aimPlan = null;
    switch (this.phase) {
      case 'presnap': this.updatePresnap(dt, inputs); break;
      case 'live': this.updateLive(dt, inputs); break;
      case 'dead': this.updateDead(dt, inputs); break;
      case 'anim': this.updateAnim(dt, inputs); break;
      case 'break':
        this.breakT -= dt;
        if (this.halftime) {
          this.halftime.t += dt;
          // any human can skip the show after a moment
          if (this.halftime.t > 1.5 && inputs.some(function (i) { return i && i.action; })) this.breakT = 0;
        }
        if (this.breakT <= 0) { this.halftime = null; this.afterBreak(); }
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

  // The QB's cadence before every scrimmage snap: HUT, HUT, HIKE!, then the ball.
  var CADENCE = { words: ['HUT', 'HUT', 'HIKE'], at: [0, 0.42, 0.84], snap: 0.87 };

  G.updatePresnap = function (dt, inputs) {
    var self = this;
    this.snapTimer -= dt;
    // a running clock keeps going while the offense is at the line
    if (this.clockRun && this.playType !== 'kickoff') {
      this.tickClock(dt);
      if (this.warnPending) { this.warnPending = false; this.clockRun = false; this.emit('twomin', { at: this.warnAt() }); }
      if (this.clock <= 0) { this.clockRun = false; this.cadence = null; this.endQuarter(); return; }
    }
    var callSnap = !!this.cadence && this.playType !== 'kickoff' && this.stepCadence(dt);
    // Humans: defense may move and cycle defenders, offense snaps.
    this.ctl.forEach(function (c) {
      var inp = inputs[c.slot] || {};
      if (self.playType === 'kickoff') {
        if (c.team === self.kickTeam) {
          if (inp.special && !self.onside) { self.onside = true; self.emit('onsidecall', {}); }
          var m = self.koMeter;
          if (m && !m.set) {
            m.t += dt; m.val = 1 - Math.abs(((m.t * 0.75) % 2) - 1);
            self.snapTimer = Math.max(self.snapTimer, 0.1);
            if (inp.action || m.t > 9) { m.set = true; self.koPower = m.t > 9 ? 0.8 : m.val; self.snapTimer = 0; self.emit('meter', {}); }
          } else if (inp.action) self.snapTimer = Math.min(self.snapTimer, 0);
        }
        return;
      }
      if (inp.special && !self.cadence) { self.audible(c.team === self.poss ? 'off' : 'def'); return; }
      if (c.team === self.poss) {
        if (inp.rec && !self.cadence) { self.cycleHotRoute(RECEIVERS[inp.rec - 1]); return; }
        if (inp.action) self.snapTimer = Math.min(self.snapTimer, 0);
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
    if (this.snapTimer <= 0) {
      if (this.playType === 'kickoff') this.snap();
      else if (callSnap) this.snap();
      else if (!this.cadence) this.cadence = { t: 0, n: 0, who: this.off.QB };
    }
  };

  // Advance the cadence, calling each word on its beat. True once it's time to snap.
  G.stepCadence = function (dt) {
    var cd = this.cadence;
    cd.t += dt;
    while (cd.n < CADENCE.at.length && cd.t >= CADENCE.at[cd.n]) {
      cd.word = CADENCE.words[cd.n]; cd.wordT = cd.t;
      this.emit('cadence', { word: cd.word, n: cd.n, last: cd.n === CADENCE.at.length - 1 });
      cd.n++;
    }
    if (cd.t < CADENCE.snap) return false;
    this.cadence = null;
    return true;
  };

  // Audible at the line: swap to a hot route / blitz without going back to the huddle.
  var AUDIBLE = { off: ['slants', 'blast', 'deep'], def: ['allout', 'c2', 'man'] };
  G.audible = function (side) {
    if (this.conversion && side === 'off') { /* still allowed */ }
    var list = AUDIBLE[side], cur = side === 'off' ? this.offPlay : this.defPlay;
    var i = (list.indexOf(cur.id) + 1) % list.length;
    var src = side === 'off' ? Plays.OFFENSE : Plays.DEFENSE;
    var next = src.filter(function (pl) { return pl.id === list[i]; })[0];
    if (!next) return;
    if (side === 'off') this.offPlay = next; else this.defPlay = next;
    var keep = this.snapTimer, tok = this.token;
    this.audibling = true;
    this.setupScrimmage();
    this.audibling = false;
    this.token = tok;
    if (!this.isHuman(this.poss)) this.snapTimer = Math.max(keep, 0.8);
    this.emit('audible', { side: side, name: next.name });
  };

  G.snap = function () {
    this.phase = 'live';
    this.playT = 0;
    if (this.playType === 'kickoff') {
      // kicker takes a short run-up before the ball leaves the tee
      this.kickRunT = 0.55;
      this.kickerStart = { x: this.kicker.x, y: this.kicker.y };
      return;
    }
    this.emit('snap', {});
    this.stats.team[this.poss].plays++;
    if (this.offPlay.keeper) { this.handedOff = true; this.log.rusher = this.off.QB; }
    // Jumping the snap: a defender you control who is already driving forward
    // when the ball moves explodes off the line, and for a moment the blockers
    // can't pick him up.
    var self = this;
    this.ctl.forEach(function (c) {
      var d = c.pl;
      if (!d || c.team === self.poss || d.state !== 'ok') return;
      var wl = len(d.want.x, d.want.y);
      if (wl < 0.3 || (d.want.x / wl) * -self.dir < 0.2) return;   // must be heading into the backfield
      d.immune = 0.55; d.immuneTo = null;
      var sp = self.maxSpeed(d) * 0.7;
      d.vx = d.want.x / wl * sp; d.vy = d.want.y / wl * sp;
      self.emit('getoff', { p: d });
    });
    if (this.playType === 'run' && this.offPlay.pitch) this.pitchAt = 0.18;
  };

  G.launchKickoff = function () {
    {
      var b = this.ball, k = this.kicker;
      var rd = dirOf(this.poss);
      this.land = { x: ownGoal(this.poss) + rd * (lerpN(21, -4, this.koPower) + rnd(-2, 2)), y: MID + rnd(-9, 9) };
      var wa = this.windAcc();
      this.land.x += 0.5 * wa.x * 7.8; this.land.y = clamp(this.land.y + 0.5 * wa.y * 7.8, 6, FW - 6);
      k.kickT = 0.45;
      b.state = 'air'; b.kind = 'kick'; b.sx = this.losX; b.sy = MID; b.sz = 0.4;
      b.tx = this.land.x; b.ty = this.land.y; b.tz = 0.8; b.t = 0; b.T = 2.8; b.peak = 19; b.target = this.returner;
      b.thrower = k;
      b.onside = false;
      if (this.onside) {
        // squib it 11-14 yards so it can be recovered by either team
        var kd = dirOf(this.kickTeam);
        b.tx = this.losX + kd * rnd(11, 14); b.ty = MID + rnd(-10, 10); b.T = 0.9; b.peak = 1.6; b.onside = true;
        this.emit('onside', {});
      }
      this.emit('kick', { p: k });
    }
  };
  function lerpN(a, b, t) { return a + (b - a) * t; }

  // Convert screen-relative stick input to a world-space movement wish.
  // Stick input is screen-relative: map it through the camera's heading so
  // "up" is always away from the camera, even while it swings after a turnover.
  G.inputToWant = function (p, inp, turbo) {
    var ix = inp.x || 0, iy = inp.y || 0;
    var h = this.camHeading != null ? this.camHeading : (this.viewDir > 0 ? 0 : Math.PI);
    var c = Math.cos(h), s = Math.sin(h);
    p.want.x = iy * c - ix * s;
    p.want.y = iy * s + ix * c;
    p.wantTurbo = !!turbo;
  };

  G.updateLive = function (dt, inputs) {
    var self = this, b = this.ball;
    this.playT += dt;
    this.tickClock(dt);
    if (this.kickRunT > 0) {
      this.kickRunT -= dt;
      var kk = this.kicker, ks = this.kickerStart, f = 1 - Math.max(0, this.kickRunT) / 0.55;
      kk.x = ks.x + (b.x - this.dir * -0.4 - ks.x) * f; kk.y = ks.y + (b.y - 0.3 - ks.y) * f;
      kk.vx = -this.dir * 6; kk.face = this.dir > 0 ? Math.PI : 0; kk.anim += dt * 10;
      if (this.kickRunT <= 0) this.launchKickoff();
      return;
    }
    if (this.token) this.checkToken();
    if (!this.hotChecked && this.playT > 0.25 && (this.playType === 'pass' || this.playType === 'screen')) this.hotRoute();

    // QB pitch / handoff on run plays
    if (this.playType === 'run' && !this.handedOff && b.state === 'held' && b.holder === this.off.QB) {
      var rb = this.off.RB, qb = this.off.QB;
      if (this.offPlay.pitch) {
        if (this.playT >= this.pitchAt) this.pitchTo(qb, rb);
      } else if (this.offPlay.draw ? this.playT > 0.45 : (dist(qb, rb) < 1.3 || this.playT > 0.75)) {
        this.giveBall(rb, qb.x < 0);
        this.handedOff = true;
        this.log.rusher = rb;
        this.emit('handoff', {});
      }
    }

    // how long the current ball carrier has had it
    if (b.state === 'held' && b.holder) {
      if (b.holder !== this.heldBy) { this.heldBy = b.holder; this.heldT = 0; }
      else this.heldT += dt;
    } else { this.heldBy = null; this.heldT = 0; }
    // a QB in his throwing motion lets it go at the end of the wind-up
    var wq = b.state === 'held' ? b.holder : null;
    if (wq && wq.windT > 0) {
      wq.windT -= dt;
      if (wq.windT <= 0 && wq.pendingThrow && !this.canPass(wq)) wq.pendingThrow = null;   // drifted past the line
      if (wq.windT <= 0 && wq.pendingThrow) {
        var pt = wq.pendingThrow, o = pt.opt; wq.pendingThrow = null;
        // re-lead a receiver for the time spent winding up
        if (o.plan && o.plan.lock && o.plan.rec) {
          var pr = o.plan.rec;
          o.plan = Object.assign({}, o.plan, { tx: o.plan.tx + pr.vx * THROW_WINDUP * 0.92, ty: o.plan.ty + pr.vy * THROW_WINDUP * 0.92 });
        }
        this.throwTo(wq, pt.rec, pt.bullet, Object.assign({}, o, { release: true }));
      }
    }
    this.autoControl();

    // ---- humans
    this.ctl.forEach(function (c) {
      var p = c.pl, inp = inputs[c.slot] || {};
      if (!p) return;
      var moving = Math.abs(inp.x || 0) + Math.abs(inp.y || 0) > 0.2;
      var wantsTurbo = !!inp.turbo && moving && (c.turbo > 0.02 || self.fire[c.team]);
      if (self.infTurbo || self.powerOf(p) === 'speed') c.turbo = 1;
      else if (wantsTurbo && !self.fire[c.team]) c.turbo = Math.max(0, c.turbo - dt * 0.42);
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
    if (!this.crossedLOS && b.state === 'held' && b.holder && b.holder.team === this.poss && this.playType !== 'kickoff' && this.relX(b.holder.x) > 0.5) this.crossedLOS = true;
    this.updateBall(dt);
    if (this.phase !== 'live') return;
    // scoring and the sidelines come before tackles: a carrier who reaches the
    // end zone in bounds has scored, even if he's hit on the same frame
    this.checkBounds();
    if (this.phase !== 'live') return;
    this.checkTackles();
    if (this.phase !== 'live') return;
    this.checkHumanHits();
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
    if (hasBall && p.windT > 0) return;
    if (hasBall) {
      if (this.canPass(p) && inp.rec) {
        var tr = this.off[RECEIVERS[inp.rec - 1]];
        if (tr && tr !== p && tr.state !== 'down') { this.throwTo(p, tr, !!inp.turbo); return; }
      }
      if (this.canPass(p) && inp.aim) {
        // point-and-click passing: the pass goes where the pointer is
        var plan = this.planPass(p, inp.aim, inp.aim.power, null, true);
        this.aimPlan = plan;
        this.passTarget = plan.lock ? plan.rec : null;
        if (inp.aim.release) this.throwTo(p, plan.rec, false, { plan: plan, accMul: inp.aim.accMul, perfect: inp.aim.perfect });
        else if (inp.action) this.throwTo(p, plan.rec, !!inp.turbo, { plan: inp.turbo ? this.planPass(p, inp.aim, 1, null, false) : plan });
        else if (inp.special) this.startSpin(p);
        return;
      }
      if (this.canPass(p)) {
        this.passTarget = this.pickTarget(p, inp);
        if (inp.action && this.passTarget) this.throwTo(p, this.passTarget, !!inp.turbo);
        else if (inp.special) this.startSpin(p);
        return;
      }
      if (inp.action) { if (inp.turbo) this.startStiff(p); else this.startSpin(p); }
      else if (inp.special) { if (inp.turbo) this.lateral(p); else this.startJump(p); }
      return;
    }
    if (b.state === 'air' && b.kind === 'pass') {
      // near the landing spot both buttons jump for it; farther away Action switches to the closest teammate
      var nearLand = dist(p, { x: b.tx, y: b.ty }) < 4;
      if (inp.special || (inp.action && nearLand)) {
        if (p.team === this.ballTeam || nearLand) { this.startJump(p); return; }
      }
    }
    var teamHasBall = (b.state === 'held' && b.holder && b.holder.team === c.team);
    // a teammate has the ball but control hasn't moved yet: Action takes him now
    if (teamHasBall && inp.action && b.holder !== p) { this.setControl(c, b.holder); this.emit('switch', {}); return; }
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

  // Blitz rule: any ball carrier can throw a forward pass as long as the ball
  // has not crossed the line of scrimmage on this play.
  G.canPass = function (p) {
    if (this.playType === 'kickoff' || this.crossedLOS || p.team !== this.poss) return false;
    if (this.playType === 'run' && (!this.handedOff || this.offPlay.keeper)) return false;
    return this.relX(p.x) <= 0.5;
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
    var recs = this.eligible(qb.team).filter(function (r) { return r !== qb; });
    if (qb.role !== 'QB' && this.off.QB && this.off.QB.state !== 'down') recs.push(this.off.QB);
    if (!recs.length) return null;
    var ix = inp.x || 0, iy = inp.y || 0;
    var self = this;
    if (Math.abs(ix) + Math.abs(iy) > 0.3) {
      var tmp = { want: { x: 0, y: 0 } }; this.inputToWant(tmp, inp, false);
      var wx = tmp.want.x, wy = tmp.want.y, wl = len(wx, wy) || 1;
      var best = null, bs = -1e9, assist = this.aimAssist, cur = this.passTarget;
      recs.forEach(function (r) {
        var dx = r.x - qb.x, dy = r.y - qb.y, dl = len(dx, dy) || 1;
        var cos = (dx * wx + dy * wy) / (dl * wl);
        var s = cos * 10 - dl * 0.03;
        if (assist && cos > 0.5) {
          // aim assist: hold the current target steady; openness only breaks near-ties
          s += Math.min(6, self.openness(r)) * 0.15;
          if (r === cur) s += 1.2;
        }
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
  G.startStiff = function (p) {
    if (p.spinCD > 0 || p.state !== 'ok') return;
    p.stiffT = 0.45; p.spinCD = 1.0;
    this.emit('stiff', { p: p });
  };

  // Pitch the ball to the best trailing teammate (any time after the catch / handoff).
  G.lateral = function (p) {
    if (this.playType !== 'kickoff' && p.role === 'QB' && !this.passThrown && !this.handedOff && this.relX(p.x) <= 0.5) return false;
    var dir = dirOf(p.team), best = null, bs = -1e9, self = this;
    this.players.forEach(function (q) {
      if (q.team !== p.team || q === p || q.state !== 'ok' || q.eng) return;
      var d = dist(p, q), behind = (p.x - q.x) * dir;
      if (d > 11 || d < 1.5 || behind < -1) return;
      var s = self.openness(q) - d * 0.3 + behind * 0.2;
      if (s > bs) { bs = s; best = q; }
    });
    if (!best) return false;
    var b = this.ball;
    b.state = 'pitch'; b.holder = null; b.kind = 'lateral';
    b.sx = p.x; b.sy = p.y; b.sz = 1.1; b.t = 0; b.T = 0.32 + dist(p, best) * 0.025; b.peak = 0.8; b.target = best;
    b.tx = best.x + best.vx * b.T; b.ty = best.y + best.vy * b.T; b.tz = 1.1;
    this.emit('lateral', { p: p, to: best });
    return true;
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
    if (p.eng) sp *= (p.ctl >= 0 ? 0.45 : 0.22);
    if (p.spinT > 0) { p.spinT -= dt; sp *= 0.92; }
    if (p.kickT > 0) p.kickT -= dt;
    if (p.stiffT > 0) p.stiffT -= dt;
    if (this.weather === 'rain') sp *= 0.97;
    if (this.weather === 'snow') sp *= 0.95;
    if (p.stumble > 0) { p.stumble -= dt; sp *= 0.5; }
    if (p.windT > 0) sp *= 0.35;   // planted in the throwing motion
    var wl = len(p.want.x, p.want.y), tx = 0, ty = 0;
    if (wl > 0.02) {
      var m = Math.min(1, wl) * p.wantSpeed;
      tx = p.want.x / wl * sp * m; ty = p.want.y / wl * sp * m;
    }
    var accel = (14 + p.r.agi * 0.14) * (this.weather === 'snow' ? 0.82 : this.weather === 'rain' ? 0.92 : 1);
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
      if (d.ctl >= 0) rate = d.humanTurbo ? 3.2 : 1.6;
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
        if (d.immune > 0 && (d.immuneTo === bl || d.ctl >= 0)) continue;
        // the defender you control can't be picked up once he's at the ball carrier
        if (d.ctl >= 0 && carrier && dist(d, carrier) < 2.4) continue;
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
    if (d.ctl >= 0) t *= 0.25; // the player you control fights off blocks quickly
    bl.eng = d; d.eng = bl; bl.engT = clamp(t, d.ctl >= 0 ? 0.15 : ol ? 0.35 : 0.2, ol ? 3.2 : 1.4); bl.blocking = true;
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
    d.immune = d.ctl >= 0 ? 1.6 : 0.9; d.immuneTo = bl;
  };

  // ------------------------------------------------------------ ball
  G.giveBall = function (p, inEZ) {
    var b = this.ball;
    b.state = 'held'; b.holder = p; b.kind = '';
    if (p.eng) this.release(p.eng, p);
    var prevTeam = this.ballTeam;
    this.ballTeam = p.team;
    p.gotInEZ = (p.x - ownGoal(p.team)) * dirOf(p.team) < 0;
    if (prevTeam !== p.team) {
      if (this.phase === 'live' && this.playType !== 'kickoff') this.viewDir = dirOf(p.team);
      if (this.playType === 'kickoff' && p.team !== this.poss) this.viewDir = dirOf(p.team);
      this.emit('change', { team: p.team });
    }
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

  // Throw power runs from 0 (touch lob) through 0.5 (normal pass) to 1 (bullet).
  function powerCurve(power, lob, mid, bullet) {
    return power < 0.5 ? lob + (mid - lob) * power * 2 : mid + (bullet - mid) * (power - 0.5) * 2;
  }

  // Work out where a pass would go, with no randomness, so the aiming preview
  // and the real throw agree. aim is a field point; with rec set, the throw is
  // led to that receiver. Without it, a receiver near the aim point is locked
  // on (and the pointer's offset from him places the ball), otherwise the ball
  // goes to the spot and the nearest receiver runs for it.
  G.planPass = function (qb, aim, power, rec, preview) {
    power = clamp(power == null ? 0.5 : power, 0, 1);
    var sp = clamp(17 + (qb.r.thp - 60) / 39 * 9, 15, 27) + powerCurve(power, -4, 0, 5);
    if (this.fire[qb.team]) sp += 2;
    var lock = !!rec, ox = 0, oy = 0;
    if (!rec) {
      var recs = this.eligible(qb.team).filter(function (r) { return r !== qb; });
      if (qb.role !== 'QB' && this.off.QB && this.off.QB.state !== 'down') recs.push(this.off.QB);
      var assist = this.aimAssist && qb.ctl >= 0, self = this;
      var lockR = assist ? 4.2 + dist(qb, aim) * 0.08 : 2.6 + dist(qb, aim) * 0.04;
      var best = null, bd = 1e9, bs = 1e9;
      recs.forEach(function (r) {
        // also measure to where he's heading, so leading a receiver still locks on
        var d = Math.min(dist(r, aim), len(r.x + r.vx * 0.6 - aim.x, r.y + r.vy * 0.6 - aim.y));
        if (d >= lockR) return;
        // aim assist: when two receivers are about equally close, take the more open one
        var sc = d - (assist ? Math.min(6, self.openness(r)) * 0.15 : 0);
        if (sc < bs) { bs = sc; bd = d; best = r; }
      });
      if (best) {
        rec = best; lock = true;
        ox = aim.x - rec.x; oy = aim.y - rec.y;
        var ol = len(ox, oy), om = 2.2;
        if (ol > om) { ox *= om / ol; oy *= om / ol; }
        ox *= 0.7; oy *= 0.7;
      }
    }
    var tx, ty, t;
    if (lock) {
      tx = rec.x; ty = rec.y;
      for (var i = 0; i < 4; i++) {
        t = len(tx - qb.x, ty - qb.y) / sp + 0.1;
        tx = rec.x + rec.vx * t * 0.92 + ox; ty = rec.y + rec.vy * t * 0.92 + oy;
      }
    } else {
      tx = aim.x; ty = aim.y;
      var nr = null, nd = 1e9;
      this.eligible(qb.team).forEach(function (r) { if (r !== qb && dist(r, aim) < nd) { nd = dist(r, aim); nr = r; } });
      rec = nr;
    }
    var d = len(tx - qb.x, ty - qb.y);
    var maxR = 28 + qb.r.thp * 0.38, clamped = false;
    if (d > maxR) { tx = qb.x + (tx - qb.x) * maxR / d; ty = qb.y + (ty - qb.y) * maxR / d; d = maxR; clamped = true; }
    var plan = {
      qb: qb, rec: rec, lock: lock, tx: tx, ty: ty, sp: sp, d: d, maxR: maxR, clamped: clamped, power: power,
      T: d / sp + 0.08, peak: clamp(d * powerCurve(power, 0.14, 0.085, 0.035), 0.3, powerCurve(power, 8.5, 6.5, 2.5)),
      bullet: power >= 0.8
    };
    if (preview) this.rateLane(plan);
    return plan;
  };

  // Preview only: mark arc samples a defender could get a hand on (the same
  // reach as laneCheck) and rate the catch window at the landing spot.
  G.rateLane = function (plan) {
    var qb = plan.qb, o = qb.team, N = 16, danger = [], self = this;
    var defs = this.players.filter(function (d) { return d.team !== o && d.state === 'ok' && !d.eng; });
    for (var i = 0; i <= N; i++) {
      var s = i / N, x = qb.x + (plan.tx - qb.x) * s, y = qb.y + (plan.ty - qb.y) * s;
      var z = 1.9 + (1.3 - 1.9) * s + plan.peak * 4 * s * (1 - s), ft = plan.T * s, hot = false;
      if (s > 0.08 && s < 0.9 && z < 3.3) {
        defs.forEach(function (d) {
          if (len(d.x + d.vx * ft * 0.6 - x, d.y + d.vy * ft * 0.6 - y) < (z > 2.6 ? 1.1 : 1.4)) hot = true;
        });
      }
      danger.push(hot);
    }
    var dD = 99;
    defs.forEach(function (d) {
      var k = Math.min(plan.T, 1.2) * 0.7;
      dD = Math.min(dD, len(d.x + d.vx * k - plan.tx, d.y + d.vy * k - plan.ty));
    });
    plan.danger = danger;
    plan.window = !plan.rec ? 'nobody' : dD > 3.2 ? 'open' : dD > 1.7 ? 'tight' : 'covered';
  };

  // bullet = turbo pass: a harder, flatter throw that is a little less accurate.
  // opt.plan (from planPass) overrides the receiver lead; opt.accMul scales the
  // throw's error (a perfectly timed release is much tighter).
  // A pass starts with a wind-up: the QB keeps the ball through his throwing
  // motion and it leaves his hand THROW_WINDUP seconds later, so a rusher who
  // gets there in time still gets the sack.
  var THROW_WINDUP = 0.2;
  G.throwTo = function (qb, rec, bullet, opt) {
    var b = this.ball;
    opt = opt || {};
    if (!opt.release) {
      if (qb.windT > 0 || this.passThrown) return;
      qb.windT = THROW_WINDUP;
      qb.pendingThrow = { rec: rec, bullet: bullet, opt: opt };
      this.emit('windup', { p: qb });
      return;
    }
    var plan = opt.plan || this.planPass(qb, rec, bullet ? 1 : 0.5, rec, false);
    var tx = plan.tx, ty = plan.ty, d = plan.d, sp = plan.sp;
    var err = 0.12 + (1 - (qb.r.tha - 40) / 60) * 0.55;
    err *= Math.max(0.5, d / 22);
    var pressure = this.pressureOn(qb);
    if (pressure < 2.0) err *= 2.2;
    if (len(qb.vx, qb.vy) > 4) err *= 1.6;
    if (qb.role !== 'QB') err *= 1.6;
    if (this.fire[qb.team]) err *= 0.55;
    err *= 1 + Math.max(0, plan.power - 0.5) * 0.5;
    if (this.weather === 'rain' || this.weather === 'snow') err *= 1.12;
    if (opt.accMul) err *= opt.accMul;
    // aim assist: a human throw at a locked-on receiver is pulled in toward him
    if (this.aimAssist && qb.ctl >= 0 && plan.lock) err *= 0.6;
    var a = Math.random() * Math.PI * 2, m = err * Math.sqrt(Math.random());
    tx += Math.cos(a) * m; ty += Math.sin(a) * m;
    d = len(tx - qb.x, ty - qb.y);
    b.state = 'air'; b.kind = 'pass'; b.holder = null;
    b.sx = qb.x; b.sy = qb.y; b.sz = 1.9; b.tx = tx; b.ty = ty; b.tz = 1.3;
    b.t = 0; b.T = d / sp + 0.08; b.peak = plan.peak;
    b.bullet = plan.bullet;
    if (d > 12) { var wa = this.windAcc(); b.tx += 0.5 * wa.x * b.T * b.T; b.ty += 0.5 * wa.y * b.T * b.T; }
    b.target = plan.rec || null; b.thrower = qb;
    this.passThrown = true;
    this.passTarget = null;
    this.aimPlan = null;
    this.log.passer = qb;
    this.stats.team[qb.team].att++;
    this.pstat(qb).att++;
    this.throwTime = this.playT;
    this.emit('throw', { p: qb, perfect: !!opt.perfect, power: plan.power });
  };

  // Sail the ball out of bounds: always incomplete.
  G.throwAway = function (qb) {
    if (qb.windT > 0) return;
    var side = qb.y < MID ? -4 : FW + 4;
    var fake = { x: qb.x + this.dir * 12, y: side, vx: 0, vy: 0, r: qb.r };
    this.throwTo(qb, fake, false, { release: true });
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
      if (b.state === 'air' && b.kind === 'pass' && b.t > 0.12 && s < 0.9 && this.laneCheck()) return;
      if (s >= 1) {
        if (b.state === 'pitch') {
          var tg = b.target;
          if (tg && tg.state === 'ok' && dist(tg, b) < 2.4) { this.giveBall(tg, false); if (b.kind === 'lateral') this.log.rusher = tg; return; }
          // botched pitch: the ball is on the ground and anyone can grab it
          b.state = 'loose'; b.vx = rnd(-2, 2); b.vy = rnd(-2, 2); b.vz = 3; b.looseT = 0; b.fromKick = false;
          this.emit('fumble', { p: tg || b.thrower });
          return;
        }
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
          if (self.playType === 'kickoff' && b.fromKick && !b.onside && p.team !== self.poss && b.looseT < 1.5) return;
          // onside kicks: the kicking team has to fight for it
          var chance = (b.onside && p.team !== self.poss) ? 0.045 : 0.18;
          if (Math.random() < chance) picked = p;
        });
      }
      if (picked) {
        var lost = picked.team !== this.ballTeam;
        this.giveBall(picked, false);
        if (b.fromKick) {
          b.fromKick = false;
          if (b.onside) { b.onside = false; this.emit(picked.team === this.poss ? 'onsidefail' : 'onsidegood', { team: picked.team }); }
        }
        else if (lost) { this.log.fumbleLost = true; this.stats.team[1 - picked.team].fumbles++; this.emit('recovered', { team: picked.team }); }
        else this.emit('recoveredOwn', {});
      } else if (b.looseT > 6) {
        this.endPlay('tackle', { x: b.x });
      }
    }
  };

  G.kickArrive = function () {
    var b = this.ball, r = this.returner;
    if (b.onside) {
      b.state = 'loose'; b.vx = rnd(-2.5, 2.5) + 2 * dirOf(this.kickTeam); b.vy = rnd(-3, 3); b.vz = 4; b.looseT = 0; b.fromKick = true;
      this.emit('bounce', {});
      return;
    }
    if (r && r.state === 'ok' && dist(r, b) < 2.6) {
      this.giveBall(r, false);
      this.emit('catch', { p: r, kick: true });
    } else {
      b.state = 'loose'; b.vx = rnd(-3, 3) + 4 * this.dir; b.vy = rnd(-3, 3); b.vz = 5; b.looseT = 0; b.fromKick = true;
      this.emit('bounce', {});
    }
  };

  // A defender standing in the throwing lane gets one shot at a ball that
  // passes within reach (higher reach if he jumps).
  G.laneCheck = function () {
    var b = this.ball, self = this, o = b.thrower.team, hit = null;
    this.players.forEach(function (d) {
      if (hit || d.team === o || d.state !== 'ok' || d.eng || self.flightChecked.indexOf(d) >= 0) return;
      var jumped = (self.time - d.jumpAt) < 0.75;
      if (b.z > (jumped ? 3.3 : 2.6)) return; // standing / leaping reach
      if (dist(d, b) > (jumped ? 1.1 : 0.7)) return;
      self.flightChecked.push(d);
      var r = Math.random();
      var pInt = 0.15 + (d.r.cth - 60) / 200 + (jumped ? 0.11 : 0) + (self.fire[d.team] ? 0.06 : 0) + (self.powerOf(d) === 'hands' ? 0.1 : 0);
      if (r < pInt) hit = ['int', d];
      else if (r < pInt + 0.3) hit = ['tip', d];
    });
    if (!hit) return false;
    if (hit[0] === 'int') { this.intercept(hit[1]); return true; }
    var d = hit[1];
    if (d.jumpT <= 0) { d.jumpT = 0.55; d.jumpAt = this.time; }
    var near = len(b.x - b.sx, b.y - b.sy) < 4;
    this.emit('tipped', { p: d, batted: near });
    this.incomplete(d, true);
    // the ball pops off his hands instead of just dropping
    b.vx = rnd(-3, 3); b.vy = rnd(-3, 3); b.vz = rnd(3, 5);
    return true;
  };

  G.passArrive = function () {
    var b = this.ball, self = this, o = b.thrower.team;
    var L = { x: b.x, y: b.y };
    var bestO = null, dO = 9, bestD = null, dD = 9;
    this.players.forEach(function (p) {
      if (p.state === 'down' || p === b.thrower || p.eng) return;
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
      var pInt = 0.1 + (bestD.r.cth - 60) / 220 + (bestD.r.cov - 75) / 350 + jumpBonus(bestD);
      if (this.fire[bestD.team]) pInt += 0.08;
      if (this.powerOf(bestD) === 'hands') pInt += 0.15;
      if (Math.random() < clamp(pInt, 0.04, 0.38)) { this.intercept(bestD); return; }
      // deflection, offense can still haul it in sometimes
      if (!(offIn && Math.random() < 0.18)) { this.incomplete(bestD); return; }
    }
    if (offIn) {
      var close = 0;
      this.players.forEach(function (p) { if (p.team !== o && p.state === 'ok' && dist(p, bestO) < 1.3) close++; });
      var pc = 0.8 + (bestO.r.cth - 60) / 150 + jumpBonus(bestO) - close * 0.2 - (dO > 1.2 ? 0.12 : 0);
      if (this.fire[o]) pc += 0.12;
      if (this.weather === 'rain' || this.weather === 'snow') pc -= 0.06;
      if (this.powerOf(bestO) === 'hands') pc += 0.2;
      if (b.bullet) pc -= 0.04;
      if (Math.random() < clamp(pc, 0.12, 0.98)) { this.complete(bestO); return; }
    }
    this.incomplete(null);
  };

  G.complete = function (rec) {
    // a catch has to be made in bounds: past the end line or the sideline it's incomplete
    if (!inBounds(rec)) { this.emit('oobcatch', { p: rec }); this.incomplete(null); return; }
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
      // reach matches the 3D models (shoulder pads touch at ~1 yard); a defender
      // tied up with a blocker can still reach out and grab a runner going by
      var reach = d.state === 'dive' ? 1.4 : d.eng ? 0.95 : 1.1;
      if (dist(d, c) > reach) continue;
      // Contact brings the carrier down. Only a timed move beats it:
      //   spin    -> slips arm tackles (not dives)
      //   stiff   -> shoves off a tackler in front
      //   hurdle  -> clears diving tacklers
      var p = 0.94 + (d.r.tak - c.r.str) / 500;
      if (d.state === 'dive') p += 0.03;
      var fx = Math.cos(c.face), fy = Math.sin(c.face), dd = dist(d, c) || 1;
      var inFront = ((d.x - c.x) * fx + (d.y - c.y) * fy) / dd > 0.2;
      if (c.z > 0.45) p = d.state === 'dive' ? 0.08 : 0.55;
      else if (c.spinT > 0) p = d.state === 'dive' ? 0.6 : 0.16;
      else if (c.stiffT > 0 && inFront) p = d.state === 'dive' ? 0.45 : 0.18;
      if (this.fire[c.team]) p -= 0.08;
      if (this.fire[d.team]) p += 0.05;
      if (d.eng) p -= 0.15;
      if (this.powerOf(c) === 'tank') p -= 0.3;
      if (this.powerOf(d) === 'tank') p += 0.2;
      p = clamp(p, 0.05, 0.99);
      if (Math.random() < p) { this.tackle(c, d); return; }
      d.tackleCD = 0.65;
      if (d.state === 'ok') { d.state = 'down'; d.st = c.stiffT > 0 ? 0.9 : 0.55; }
      c.stumble = 0.28;
      this.emit('broken', { p: c });
    }
  };

  // Blitz-style: no flags, so the defender you control can level any
  // offensive player he runs into with turbo (receivers before the catch too).
  G.checkHumanHits = function () {
    var self = this, b = this.ball;
    this.ctl.forEach(function (c) {
      var d = c.pl;
      if (!d || d.state !== 'ok' && d.state !== 'dive' || !(d.humanTurbo || d.state === 'dive') || d.tackleCD > 0) return;
      if (b.state === 'held' && b.holder && b.holder.team === d.team) return; // only while defending
      self.players.forEach(function (o) {
        if (o.team === d.team || o.state !== 'ok' || o === b.holder || o.eng === d) return;
        if (dist(o, d) > 1.05) return;
        o.state = 'down'; o.st = 1.0;
        var dx = o.x - d.x, dy = o.y - d.y, dl = len(dx, dy) || 1;
        o.vx = dx / dl * 5; o.vy = dy / dl * 5;
        d.tackleCD = 0.4;
        self.emit('hit', { big: true, p: o });
      });
    });
  };

  G.tackle = function (c, d) {
    var big = d.state === 'dive' || d.wantTurbo || d.humanTurbo || this.powerOf(d) === 'tank';
    var fumbleP = 0.012 + (big ? 0.02 : 0) - (c.r.str - 70) / 3000;
    if (c.windT > 0) { fumbleP += 0.2; c.windT = 0; c.pendingThrow = null; }   // strip sack mid-throw
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
      this.emit('sack', { p: d, loss: Math.max(0, Math.round(-this.relX(c.x))) });
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
    var x = c.x;
    // a QB on a sneak lunges forward as he goes down
    if (this.offPlay && this.offPlay.keeper && c === this.off.QB && c.team === this.poss) x += this.dir * 1.3;
    this.endPlay('tackle', { x: x });
  };

  G.checkBounds = function () {
    var b = this.ball;
    if (b.state !== 'held' || !b.holder) return;
    var c = b.holder, t = c.team;
    if (inBounds(c) && (c.x - goalOf(t)) * dirOf(t) >= 0) { this.endPlay('td', { team: t, p: c }); return; }
    if (!inBounds(c)) {
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
    if (b.state === 'tee') { p.want.x = 0; p.want.y = 0; return; }
    var carrier = b.state === 'held' ? b.holder : null;
    // loose kick (onside or muffed): everybody scrambles for it
    if (b.state === 'loose') { this.goTo(p, b.x, b.y, true); return; }
    // hands team reacts to an onside kick in the air
    if (b.state === 'air' && b.onside && p.team === this.poss) { this.goTo(p, b.tx, b.ty, true); return; }
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
    // draw: drop back like a pass, then give it to the back
    if (this.offPlay.draw && this.playT < 0.45) { this.goTo(p, this.qbDrop.x, this.qbDrop.y, false, 0.8); return; }
    this.goTo(p, rb.x, rb.y, false);
  };

  G.thinkQB = function (p) {
    var self = this;
    var drop = this.qbDrop;
    var t = this.playT;
    var pressure = this.pressureOn(p);
    var pa = this.offPlay.pa && t < 0.35;
    var dropped = !pa && (dist(p, drop) < 0.8 || t > (this.offPlay.boot ? 1.6 : 1.1));
    if (pa) { var mesh = this.Wf(-4.5, 1.2); this.goTo(p, mesh.x, mesh.y, true, 1); }   // the fake, at the mesh point
    else if (!dropped) this.goTo(p, drop.x, drop.y, !!this.offPlay.boot, 1);          // a bootleg is a sprint
    // read progression
    var recs = this.eligible(p.team).filter(function (r) { return !(self.offPlay.block && self.offPlay.block[r.role]); });
    var best = null, bs = -1e9, bestOpen = 0;
    var primary = this.hotRecv || this.off[this.offPlay.primary];
    recs.forEach(function (r) {
      var open = self.openness(r);
      var depth = self.relX(r.x);
      var s = open + depth * 0.07 + (r === primary ? 0.6 : 0) - (depth < -2 && self.offPlay.type !== 'screen' ? 1.5 : 0);
      if (s > bs) { bs = s; best = r; bestOpen = open; }
    });
    var tMin = [1.35, 1.05, 0.9][this.isHuman(1 - p.team) ? this.diff : 1];
    if (this.offPlay.type === 'screen') tMin = 1.0;
    if (this.hotRecv && this.openness(this.hotRecv) > 2.5) tMin = 0.6;
    if (this.offPlay.id === 'hail') tMin = 2.4;
    if (this.offPlay.pa) tMin += 0.3;
    var throwIt = false;
    if (best) {
      if (t > tMin && bestOpen > 3.2) throwIt = true;
      else if (t > 2.4 && bestOpen > 1.9) throwIt = true;
      else if (t > 3.4) throwIt = true;
      else if (pressure < 2.0 && t > 0.6 && bestOpen > 1.4) throwIt = true;
    }
    if (throwIt && bestOpen < 1.6 && t > 3.4) { this.throwAway(p); return; }
    if (throwIt) { this.throwTo(p, best, bestOpen < 2.6 && dist(p, best) < 16 && Math.random() < 0.6); return; }
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
    if ((p.role === 'RB' || (p.role === 'QB' && this.offPlay.keeper)) && this.playType === 'run' && p.route && p.ri < p.route.length && this.playT < 1.6) {
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
    if (nearest < 1.8 && p.spinCD <= 0 && p.jumpT <= 0 && Math.random() < 0.03) { var mv = Math.random(); if (mv < 0.4) this.startStiff(p); else if (mv < 0.85) this.startSpin(p); else this.startJump(p); }
    if (nearest < 1.3 && Math.random() < 0.006 && this.lateral(p)) return;
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

  // Receivers by icon number: 1 WR1, 2 WR2, 3 TE, 4 RB.
  var RECEIVERS = ['WR1', 'WR2', 'TE', 'RB'];
  G.RECEIVERS = RECEIVERS;

  // Hot routes at the line. Each press on a receiver's number moves him to
  // the next route; after the last one he goes back to the called play.
  // Routes are [downfield, lateral] from where he lines up; lateral is
  // positive toward his own sideline.
  var HOT_ROUTES = [
    { name: 'GO', pts: [[30, 0]], cont: true },
    { name: 'SLANT', pts: [[2, 0], [10, -7]], cont: true },
    { name: 'OUT', pts: [[7, 0], [7, 10]], cont: true },
    { name: 'CURL', pts: [[11, 0], [9, -1]], cont: false },
    { name: 'IN', pts: [[8, 0], [8, -14]], cont: true },
    { name: 'FLAT', pts: [[2, 0], [3, 9]], cont: false }
  ];
  G.HOT_ROUTES = HOT_ROUTES;

  G.cycleHotRoute = function (role) {
    var p = this.off[role];
    if (!p || this.phase !== 'presnap' || (this.playType !== 'pass' && this.playType !== 'screen')) return;
    if (p.hotIdx == null) { p.hotIdx = -1; p.route0 = p.route; p.cont0 = p.cont; p.blocker0 = p.blocker; }
    p.hotIdx++;
    if (p.hotIdx >= HOT_ROUTES.length) {
      p.hotIdx = -1; p.hotName = null;
      p.route = p.route0; p.cont = p.cont0; p.blocker = p.blocker0;
    } else {
      var r = HOT_ROUTES[p.hotIdx], self = this;
      var rx = this.relX(p.x), ry = (p.y - MID) * this.dir, side = ry >= 0 ? 1 : -1;
      p.route = r.pts.map(function (pt) { return self.W(rx + pt[0], clamp(ry + pt[1] * side, -MID + 2, MID - 2)); });
      p.cont = r.cont; p.blocker = false; p.hotName = r.name;
    }
    p.ri = 0;
    this.emit('hotroute', { p: p, role: role, name: p.hotName || 'PLAY ROUTE' });
  };

  // More rushers than blockers: the back or tight end converts to a quick
  // "hot" route so the QB has an outlet.
  G.hotRoute = function () {
    this.hotChecked = true;
    var self = this, rushers = 0, blockers = 0;
    this.players.forEach(function (p) {
      if (p.team === self.poss) { if (p.blocker || p.role === 'OL0' || p.role === 'OL1') blockers++; }
      else if (p.assign === 'rush' || p.assign === 'runfit') rushers++;
    });
    if (rushers <= blockers) return;
    var hot = [this.off.RB, this.off.TE].filter(function (p) { return p && !p.blocker && !p.hotName && p.state === 'ok'; })[0];
    if (!hot) return;
    var side = (hot.y - MID) * this.dir >= 0 ? 1 : -1;
    hot.route = [this.Wf(this.relX(hot.x) + 4, ((hot.y - MID) * this.dir) / this.flip + side * 2)];
    hot.ri = 0; hot.cont = false; hot.hot = true;
    this.hotRecv = hot;
    this.emit('hot', { p: hot });
  };

  // QB is extending the play: uncovered receivers work back into open space.
  G.scrambleDrill = function (p, qb) {
    p.scrT = (p.scrT || 0) - 1 / 60;
    if (!p.scrSpot || p.scrT <= 0) {
      var best = null, bs = -1e9, self = this;
      for (var k = 0; k < 10; k++) {
        var a = k / 10 * Math.PI * 2, cx = p.x + Math.cos(a) * 5, cy = clamp(p.y + Math.sin(a) * 5, 3, FW - 3);
        var depth = this.relX(cx);
        if (depth < 2 || depth > 25) continue;
        var m = 30;
        this.players.forEach(function (d) { if (d.team !== p.team && d.state === 'ok') m = Math.min(m, len(d.x - cx, d.y - cy)); });
        var sc = m - Math.abs(cy - qb.y) * 0.08;
        if (sc > bs) { bs = sc; best = { x: cx, y: cy }; }
      }
      p.scrSpot = best || { x: p.x, y: p.y }; p.scrT = 0.6;
    }
    this.goTo(p, p.scrSpot.x, p.scrSpot.y, false, 0.8);
  };

  G.runRoute = function (p) {
    var carrier = this.ball.holder;
    var extending = carrier && carrier.role === 'QB' && !this.passThrown && (this.playT > 2.2 || (this.playT > 1.2 && len(carrier.vx, carrier.vy) > 3));
    if (extending && (!p.route || p.ri >= p.route.length || !p.cont) && !p.blocker && p.ri >= 1) { this.scrambleDrill(p, carrier); return; }
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
    var qbInPocket = carrier && carrier.role === 'QB' && !this.handedOff && !this.passThrown && this.relX(carrier.x) <= 0.5 && (this.playType !== 'run' || this.offPlay.draw);
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
    // play-action: for a moment everyone reads run and steps up toward the back
    if (this.offPlay.pa && this.playT < 0.55 && !this.passThrown && a !== 'rush') {
      var rbk = this.off.RB, bite = 0.5 + (95 - p.r.cov) / 100;
      if (this.playT < bite * 0.55) { this.goTo(p, rbk.x + this.dir * 3, lerpN(p.y, rbk.y, 0.3), false, 0.8); return; }
    }
    if (a === 'rush' || a === 'runfit') {
      var tgt = carrier || qb;
      if (a === 'runfit' && this.playType !== 'run' && this.playT < 0.5) tgt = this.off.RB;
      // play-action: the rushers crash down on the back at the fake
      if (a === 'rush' && this.offPlay.pa && this.playT < 0.6 && p.ctl < 0) tgt = this.off.RB;
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
    // crossing the goal line on a 2-point try is a conversion, not a touchdown
    if (reason === 'td') this.emit(this.conversion ? 'twoptscore' : 'td', { team: data.team, p: data.p });
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
    // in-bounds plays keep the clock running; out of bounds only stops it late in a half
    this.afterPlayClock(reason === 'tackle' || (reason === 'oob' && !this.lateInHalf()));
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

  // ======================================================== GAME CLOCK
  // Football clock rules, scaled to the quarter length:
  // - the clock runs during plays;
  // - after an in-bounds play it keeps running through the huddle (a play
  //   clock's worth) and while the offense is at the line;
  // - it stops for incompletions, scores, turnovers, kicks, timeouts and
  //   change of possession, and for out of bounds late in a half;
  // - the two-minute warning (or half the quarter, for short quarters) stops it
  //   in the 2nd and 4th quarters;
  // - each team has three timeouts a half (two in overtime).
  G.warnAt = function () { return Math.min(120, Math.round(this.qLen / 2)); };
  G.lateInHalf = function () { return (this.quarter === 2 || this.quarter >= 4) && this.clock <= this.warnAt(); };
  G.playClock = function () { return clamp(Math.round(this.qLen * 0.05), 4, 30); };

  G.tickClock = function (dt) {
    if (this.conversion) return;
    var prev = this.clock, w = this.warnAt();
    this.clock = Math.max(0, this.clock - dt);
    if ((this.quarter === 2 || this.quarter === 4) && !this.warned && prev > w && this.clock <= w) {
      this.warned = true; this.warnPending = true;
      if (this.phase !== 'live') this.clock = w;
    }
  };

  // A human calls a timeout (any time; it takes effect once the ball is dead).
  G.callTimeout = function (team) {
    if (this.timeouts[team] <= 0 || this.toPending[team] || this.over) return false;
    if (this.phase === 'presnap' && this.playType !== 'kickoff') { this.useTimeout(team); return true; }
    this.toPending[team] = true;
    this.emit('timeoutcalled', { team: team });
    return true;
  };
  G.useTimeout = function (team) {
    this.timeouts[team]--; this.toPending[team] = false;
    this.clockRun = false;
    this.emit('timeout', { team: team, left: this.timeouts[team] });
  };

  // CPU clock management late in a half: the team that needs time stops the clock.
  G.cpuTimeout = function () {
    if (!this.clockRun || !this.lateInHalf()) return;
    for (var t = 0; t < 2; t++) {
      if (this.isHuman(t) || this.timeouts[t] <= 0 || this.attract) continue;
      var behind = this.score[t] < this.score[1 - t];
      if ((this.quarter >= 4 && behind) || (this.quarter === 2 && t === this.poss)) { this.useTimeout(t); return; }
    }
  };

  G.afterPlayClock = function (running) {
    this.clockRun = !!running && this.clock > 0 && !this.conversion;
    for (var t = 0; t < 2; t++) if (this.toPending[t]) { if (this.clockRun) this.useTimeout(t); else this.toPending[t] = false; }
    this.cpuTimeout();
    if (this.warnPending) { this.warnPending = false; this.clockRun = false; this.clock = Math.max(this.clock, 0); this.emit('twomin', { at: this.warnAt() }); }
    // the huddle: a play clock's worth runs off if the clock is running
    if (this.clockRun) {
      this.tickClock(this.playClock());
      if (this.warnPending) { this.warnPending = false; this.clockRun = false; this.emit('twomin', { at: this.warnAt() }); }
    }
    if (this.clock <= 0) { this.clockRun = false; this.endQuarter(); return; }
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
    this.clockRun = false; this.warnPending = false;
    if (this.clock <= 0) { this.pendingKick = team; this.endQuarter(); return; }
    this.setupKickoff(team);
  };

  G.afterSafety = function (team) {
    this.clockRun = false; this.warnPending = false;
    if (this.clock <= 0) { this.pendingKick = team; this.endQuarter(); return; }
    this.setupKickoff(team);
  };

  G.endQuarter = function () {
    var q = this.quarter;
    if (q === 4 || q >= 5) {
      if (this.score[0] === this.score[1] && q === 4) {
        this.quarter = 5; this.ot = true; this.clock = Math.max(60, Math.round(this.qLen * 0.75));
        this.clockRun = false; this.timeouts = [2, 2]; this.toPending = [false, false];
        this.breakMsg = 'OVERTIME'; this.phase = 'break'; this.breakT = 2.6; this.nextAfterBreak = 'otkick';
        this.emit('quarter', { q: 5, ot: true });
        return;
      }
      this.finish();
      return;
    }
    this.quarter++;
    this.clock = this.qLen;
    this.clockRun = false; this.toPending = [false, false];
    if (q === 2) { this.timeouts = [3, 3]; this.warned = false; }
    this.phase = 'break'; this.breakT = 2.4;
    if (q === 2) {
      this.breakMsg = 'HALFTIME'; this.nextAfterBreak = 'half';
      // the home team's cheerleaders put on a ten second (real time) show
      var len = 10 * (FB.GAME_SPEED || 1);
      this.halftime = { t: 0, len: len, team: 0 };
      this.breakT = len + 0.4;
      this.emit('half', { show: true });
    }
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
      if (!offH && !defH) this.choosePlays(FB.AI.pickOffense(this), FB.AI.pickDefense(this), Math.random() < 0.5);
    }
    if (this.phase === 'pat' && !this.isHuman(this.patTeam)) {
      this.patWait -= dt;
      if (this.patWait <= 0) this.choosePAT(this.patChoice);
    }
  };
})();
