/*
 * Football Blitz '26 — real-time 3D renderer (WebGL via three.js).
 *
 * World mapping: engine x (along the field) -> three X, engine y (across)
 * -> three Z, engine z (height) -> three Y. 1 unit = 1 yard.
 *
 * Players are procedurally built, jointed 3D models in team uniforms with
 * procedural animation (stances, run cycles, throws, catches, dives, falls,
 * celebrations). The stadium is a two-deck bowl with an instanced, animated
 * crowd, LED ribbon boards, light towers and jumbotrons.
 *
 * The 2D renderer (render.js) is reused as a transparent overlay for the
 * broadcast HUD, banners and name tags.
 */
(function () {
  var FB = (window.FB = window.FB || {});
  var T = window.THREE;
  var FW = 53.333, MID = FW / 2;
  var TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function angLerp(a, b, t) { var d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * t; }
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  // ================================================================ textures
  function canvasTex(w, h, draw) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    return t;
  }

  function teamColor(t) { return t.c.jersey === '#F4F4F4' ? t.c.trim : t.c.jersey; }

  // Field texture covers x -12..112, y -4.33..57.67 (124 x 62 yards).
  var FX0 = -12, FY0 = -4.333, FLEN = 124, FWID = 62;
  function fieldTexture(t0, t1, W) {
    var H = W / 2, sx = W / FLEN, sy = H / FWID;
    var tex = canvasTex(W, H, function (c) {
      var X = function (x) { return (x - FX0) * sx; }, Y = function (y) { return (y - FY0) * sy; };
      c.fillStyle = '#1f5f2b'; c.fillRect(0, 0, W, H);
      for (var x = 0; x < 100; x += 5) { c.fillStyle = (x / 5) % 2 ? '#2f8a3c' : '#287a34'; c.fillRect(X(x), Y(0), 5 * sx + 1, FW * sy); }
      // end zones painted in the colors of the team defending them
      c.fillStyle = teamColor(t0); c.fillRect(X(-10), Y(0), 10 * sx, FW * sy);
      c.fillStyle = teamColor(t1); c.fillRect(X(100), Y(0), 10 * sx, FW * sy);
      // turf grain
      for (var i = 0; i < W * H / 40; i++) {
        c.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)';
        c.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1 + Math.random() * 3);
      }
      // mow pattern across the field
      for (var m = 0; m < 12; m++) { c.fillStyle = m % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.03)'; c.fillRect(X(-10), Y(m * FW / 12), 120 * sx, FW / 12 * sy); }
      c.fillStyle = 'rgba(255,255,255,0.95)';
      var line = function (x1, y1, x2, y2, w) {
        c.save(); c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = w * sx; c.beginPath(); c.moveTo(X(x1), Y(y1)); c.lineTo(X(x2), Y(y2)); c.stroke(); c.restore();
      };
      line(-10, -0.2, 110, -0.2, 0.4); line(-10, FW + 0.2, 110, FW + 0.2, 0.4);
      line(-10.2, 0, -10.2, FW, 0.4); line(110.2, 0, 110.2, FW, 0.4);
      for (var yl = 0; yl <= 100; yl += 5) line(yl, 0, yl, FW, yl === 0 || yl === 100 ? 0.33 : 0.17);
      for (var hy = 1; hy < 100; hy++) {
        if (hy % 5 === 0) continue;
        line(hy, 0.3, hy, 1.2, 0.12); line(hy, FW - 1.2, hy, FW - 0.3, 0.12);
        line(hy, 23.4, hy, 24.1, 0.12); line(hy, 29.2, hy, 29.9, 0.12);
      }
      // yard numbers (bottoms toward the sideline like a real field)
      c.font = '700 ' + Math.round(2 * sy * 1.1) + 'px "Russo One", "Arial Black", sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      for (var n = 10; n <= 90; n += 10) {
        var lbl = String(n <= 50 ? n : 100 - n);
        c.save(); c.translate(X(n), Y(FW - 10)); c.fillText(lbl, 0, 0); c.restore();
        c.save(); c.translate(X(n), Y(10)); c.rotate(Math.PI); c.fillText(lbl, 0, 0); c.restore();
      }
      // midfield logo
      c.save(); c.translate(X(50), Y(MID));
      c.fillStyle = 'rgba(8,12,30,0.55)'; c.beginPath(); c.ellipse(0, 0, 7.5 * sx, 7.5 * sy, 0, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,210,58,0.9)'; c.lineWidth = 0.35 * sx; c.stroke();
      c.rotate(Math.PI / 2);
      c.font = 'italic 900 ' + Math.round(5.2 * sy) + 'px "Russo One", "Arial Black", sans-serif';
      var g = c.createLinearGradient(0, -3 * sy, 0, 3 * sy); g.addColorStop(0, '#fff6c8'); g.addColorStop(0.5, '#ffb21f'); g.addColorStop(1, '#ff4d1f');
      c.fillStyle = g; c.fillText('BLITZ', 0, 0);
      c.restore();
      // end zone names (readable from the attacking camera)
      var ez = function (x, t, rot) {
        c.save(); c.translate(X(x), Y(MID)); c.rotate(rot);
        c.font = 'italic 900 ' + Math.round(6.2 * sx) + 'px "Russo One", "Arial Black", sans-serif';
        c.fillStyle = 'rgba(255,255,255,0.92)'; c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.4 * sx;
        c.strokeText(t.name.toUpperCase(), 0, 0); c.fillText(t.name.toUpperCase(), 0, 0); c.restore();
      };
      ez(-5, t0, -Math.PI / 2); ez(105, t1, Math.PI / 2);
    });
    tex.anisotropy = 8;
    return tex;
  }

  function glowTexture() {
    return canvasTex(128, 128, function (c) {
      var g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.2, 'rgba(255,250,220,0.7)'); g.addColorStop(1, 'rgba(255,250,220,0)');
      c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    });
  }

  // ============================================================ materials
  var SKIN = ['#5b3a29', '#8d5a3b', '#c48a5c', '#e8b48f', '#3e2a20', '#a8714a'];

  // Tiny procedural knit pattern used as a bump map so jerseys read as mesh fabric.
  var KNIT = null;
  function knitTexture() {
    if (KNIT) return KNIT;
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var x = c.getContext('2d');
    x.fillStyle = '#808080'; x.fillRect(0, 0, 64, 64);
    for (var i = 0; i < 64; i += 4) for (var j = 0; j < 64; j += 4) { x.fillStyle = ((i + j) / 4) % 2 ? '#9a9a9a' : '#5c5c5c'; x.beginPath(); x.arc(i + 2, j + 2, 1.3, 0, TAU); x.fill(); }
    KNIT = new T.CanvasTexture(c);
    KNIT.wrapS = KNIT.wrapT = T.RepeatWrapping; KNIT.repeat.set(6, 6);
    return KNIT;
  }

  function Mats() {
    this.cache = {};
    this.skin = SKIN.map(function (c) { return new T.MeshPhysicalMaterial({ color: c, roughness: 0.55, sheen: 0.25, sheenColor: new T.Color('#ffd9c2') }); });
    this.shoe = new T.MeshPhysicalMaterial({ color: '#111216', roughness: 0.35, clearcoat: 0.6 });
    this.sole = new T.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.6 });
    this.mask = new T.MeshStandardMaterial({ color: '#c8ccd6', roughness: 0.28, metalness: 0.75 });
    this.tape = new T.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.8 });
    this.visor = new T.MeshPhysicalMaterial({ color: '#0b0d14', roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.85 });
    this.eye = new T.MeshStandardMaterial({ color: '#111', roughness: 0.3 });
    this.ball = new T.MeshStandardMaterial({ color: '#7a3c16', roughness: 0.55 });
    this.lace = new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });
  }
  Mats.prototype.team = function (t) {
    if (this.cache[t.abbr]) return this.cache[t.abbr];
    var knit = knitTexture();
    var m = {
      jersey: new T.MeshPhysicalMaterial({ color: t.c.jersey, roughness: 0.68, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new T.Color('#ffffff'), bumpMap: knit, bumpScale: 0.2 }),
      trim: new T.MeshPhysicalMaterial({ color: t.c.trim, roughness: 0.6, sheen: 0.4 }),
      pants: new T.MeshPhysicalMaterial({ color: t.c.pants, roughness: 0.42, sheen: 0.8, sheenRoughness: 0.35, sheenColor: new T.Color('#ffffff') }),
      helmet: new T.MeshPhysicalMaterial({ color: t.c.helmet, roughness: 0.2, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }),
      stripe: new T.MeshPhysicalMaterial({ color: t.c.stripe, roughness: 0.25, clearcoat: 1 }),
      sock: new T.MeshStandardMaterial({ color: t.c.jersey === '#F4F4F4' ? t.c.trim : t.c.jersey, roughness: 0.75 }),
      glove: new T.MeshPhysicalMaterial({ color: t.c.trim, roughness: 0.45, sheen: 0.3 })
    };
    this.cache[t.abbr] = m;
    return m;
  };

  // ========================================================= player model
  // Revolve a profile of [radius, y] points around the vertical axis.
  function lathe(pts, seg, sx, sz) {
    var g = new T.LatheGeometry(pts.map(function (p) { return new T.Vector2(Math.max(0.0005, p[0]), p[1]); }), seg || 20);
    if (sx || sz) g.scale(sx || 1, 1, sz || 1);
    g.computeVertexNormals();
    return g;
  }
  function tube(points, r, seg) { return new T.TubeGeometry(new T.CatmullRomCurve3(points.map(function (p) { return new T.Vector3(p[0], p[1], p[2]); })), seg || 20, r, 6, false); }

  var GEO = null;
  function geos() {
    if (GEO) return GEO;
    var RB = T.RoundedBoxGeometry;
    var HR = 0.155; // helmet radius
    var arcBar = function (y, rad, half) {
      var pts = [];
      for (var i = 0; i <= 8; i++) { var a = -half + (2 * half) * i / 8; pts.push([Math.sin(a) * rad, y, Math.cos(a) * rad]); }
      return tube(pts, 0.0105, 24);
    };
    var stripePts = [];
    for (var k = 0; k <= 10; k++) { var ph = 0.35 + k / 10 * 2.3; stripePts.push([0, Math.sin(ph) * HR * 1.075, Math.cos(ph) * HR * 1.19]); }
    GEO = {
      // lower body
      pelvis: lathe([[0, -0.13], [0.11, -0.12], [0.16, -0.03], [0.168, 0.07], [0.15, 0.13], [0, 0.135]], 22, 1.28, 0.86),
      belt: lathe([[0.152, 0.085], [0.156, 0.1], [0.152, 0.118]], 22, 1.28, 0.86),
      thigh: lathe([[0, 0.03], [0.098, 0.01], [0.113, -0.09], [0.106, -0.24], [0.088, -0.38], [0.075, -0.46], [0, -0.48]], 18),
      kneepad: new T.SphereGeometry(0.068, 14, 10),
      shin: lathe([[0, 0.02], [0.068, 0.0], [0.079, -0.1], [0.067, -0.22], [0.051, -0.35], [0.047, -0.42], [0, -0.43]], 16),
      cleat: new RB(0.115, 0.075, 0.27, 2, 0.03),
      sole: new RB(0.12, 0.022, 0.28, 1, 0.008),
      // torso: V-shaped chest under shoulder pads
      torso: lathe([[0, -0.03], [0.148, -0.03], [0.158, 0.09], [0.19, 0.25], [0.207, 0.36], [0.195, 0.46], [0.12, 0.55], [0, 0.56]], 26, 1.26, 0.78),
      pads: new T.SphereGeometry(0.28, 30, 18),
      joint: new T.SphereGeometry(1, 14, 10),
      epaulet: new T.SphereGeometry(0.13, 20, 12),
      collar: new T.TorusGeometry(0.075, 0.02, 8, 24),
      neck: lathe([[0.062, 0], [0.066, 0.06], [0.06, 0.12]], 14),
      // arms
      sleeve: lathe([[0, 0.05], [0.09, 0.03], [0.096, -0.05], [0.088, -0.13], [0.084, -0.15], [0, -0.155]], 16),
      band: lathe([[0.087, -0.11], [0.09, -0.125], [0.087, -0.14]], 16),
      bicep: lathe([[0.072, -0.1], [0.074, -0.17], [0.062, -0.27], [0.053, -0.325], [0.04, -0.345], [0, -0.35]], 14),
      fore: lathe([[0, 0.035], [0.04, 0.028], [0.052, 0.005], [0.061, -0.06], [0.046, -0.2], [0.039, -0.25], [0, -0.26]], 14),
      wrist: lathe([[0.042, -0.2], [0.044, -0.225], [0.042, -0.25]], 12),
      palm: new RB(0.072, 0.095, 0.042, 2, 0.018),
      thumb: new T.CapsuleGeometry(0.016, 0.04, 3, 6),
      // head and helmet
      crown: new T.SphereGeometry(HR, 34, 18, 0, TAU, 0, Math.PI * 0.47),
      shellBack: new T.SphereGeometry(HR, 34, 10, Math.PI / 2 + 0.95, TAU - 1.9, Math.PI * 0.47, Math.PI * 0.27),
      jaw: new T.SphereGeometry(0.07, 14, 10),
      stripe: tube(stripePts, 0.017, 30),
      face: new T.SphereGeometry(0.094, 18, 14),
      eye: new T.SphereGeometry(0.011, 8, 6),
      bar1: arcBar(-0.02, HR * 1.12, 1.05),
      bar2: arcBar(-0.075, HR * 1.06, 0.95),
      vbar: tube([[0, 0.02, HR * 1.13], [0, -0.05, HR * 1.12], [0, -0.115, HR * 0.95]], 0.0105, 12),
      sidebar: tube([[0, 0.0, 0], [0, -0.06, 0.02], [0, -0.1, 0.0]], 0.0105, 8),
      chin: new RB(0.07, 0.04, 0.04, 2, 0.015),
      visor: new T.SphereGeometry(HR * 1.02, 24, 6, Math.PI / 2 - 0.75, 1.5, Math.PI * 0.43, Math.PI * 0.14),
      // football
      ball: new T.SphereGeometry(0.11, 18, 12),
      lace: new T.BoxGeometry(0.11, 0.012, 0.022)
    };
    return GEO;
  }

  function mesh(geo, mat, parent, x, y, z) {
    var m = new T.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  function grp(parent, x, y, z) { var g = new T.Group(); g.position.set(x || 0, y || 0, z || 0); parent.add(g); return g; }

  function PlayerModel(mats) {
    var G = geos();
    this.mats = mats;
    this.root = new T.Group();
    this.body = grp(this.root);
    this.hips = grp(this.body, 0, 1.0, 0);
    this.parts = { jersey: [], trim: [], pants: [], helmet: [], stripe: [], sock: [], glove: [], skin: [] };
    var P = this.parts, self = this;
    var add = function (kind, geo, parent, x, y, z) { var m = mesh(geo, mats.shoe, parent, x, y, z); if (kind) P[kind].push(m); return m; };
    // --- lower body
    add('pants', G.pelvis, this.hips, 0, 0, 0);
    add('trim', G.belt, this.hips, 0, 0, 0);
    this.legs = [-1, 1].map(function (s) {
      var thigh = grp(self.hips, 0.105 * s, -0.05, 0);
      add('pants', G.thigh, thigh, 0, 0, 0);
      var pad = add('pants', G.kneepad, thigh, 0, -0.43, 0.055); pad.scale.set(1, 1.15, 0.62);
      var knee = grp(thigh, 0, -0.46, 0);
      add('pants', G.joint, knee, 0, 0, 0).scale.set(0.07, 0.07, 0.07);
      add('sock', G.shin, knee, 0, 0, 0);
      var foot = grp(knee, 0, -0.42, 0);
      mesh(G.cleat, mats.shoe, foot, 0, 0.0, 0.055);
      mesh(G.sole, mats.sole, foot, 0, -0.04, 0.055);
      return { thigh: thigh, knee: knee, foot: foot };
    });
    // --- torso and pads
    this.spine = grp(this.hips, 0, 0.1, 0);
    add('jersey', G.torso, this.spine, 0, 0, 0);
    var pads = add('jersey', G.pads, this.spine, 0, 0.405, 0); pads.scale.set(1.3, 0.42, 0.95);
    [-1, 1].forEach(function (s) { var e = add('jersey', G.epaulet, self.spine, 0.255 * s, 0.45, 0); e.scale.set(1.0, 0.72, 1.08); });
    var col = add('trim', G.collar, this.spine, 0, 0.55, 0.0); col.rotation.x = Math.PI / 2; col.scale.set(1.1, 0.9, 1);
    add('skin', G.neck, this.spine, 0, 0.53, 0);
    // --- head: helmet shell, ear/jaw guards, stripe, cage facemask
    this.head = grp(this.spine, 0, 0.75, 0);
    var crown = add('helmet', G.crown, this.head, 0, -0.005, -0.012); crown.scale.set(1, 1.07, 1.17);
    var back = add('helmet', G.shellBack, this.head, 0, -0.005, -0.012); back.scale.set(1, 1.07, 1.17);
    [-1, 1].forEach(function (s) { var j = add('helmet', G.jaw, self.head, 0.118 * s, -0.075, 0.035); j.scale.set(0.42, 0.95, 1.25); });
    add('stripe', G.stripe, this.head, 0, -0.005, -0.012);
    add('skin', G.face, this.head, 0, -0.035, 0.05).scale.set(0.95, 1.08, 1);
    [-1, 1].forEach(function (s) { mesh(G.eye, mats.eye, self.head, 0.032 * s, -0.012, 0.137); });
    mesh(G.bar1, mats.mask, this.head, 0, 0, 0);
    mesh(G.bar2, mats.mask, this.head, 0, 0, 0);
    mesh(G.vbar, mats.mask, this.head, 0, 0, 0);
    [-1, 1].forEach(function (s) { mesh(G.sidebar, mats.mask, self.head, 0.135 * s, -0.01, 0.075); });
    mesh(G.chin, mats.tape, this.head, 0, -0.135, 0.105);
    this.visor = mesh(G.visor, mats.visor, this.head, 0, -0.005, -0.012); this.visor.scale.set(1, 1.07, 1.17);
    // --- arms
    this.arms = [-1, 1].map(function (s) {
      var sh = grp(self.spine, 0.285 * s, 0.44, 0);
      add('jersey', G.sleeve, sh, 0, 0, 0);
      add('trim', G.band, sh, 0, 0, 0);
      add('skin', G.bicep, sh, 0, 0, 0);
      var el = grp(sh, 0, -0.32, 0);
      add('skin', G.joint, el, 0, 0, 0).scale.set(0.044, 0.044, 0.044);
      add('skin', G.fore, el, 0, 0, 0);
      mesh(G.wrist, mats.tape, el, 0, 0, 0);
      var hand = grp(el, 0, -0.29, 0);
      add('glove', G.palm, hand, 0, -0.02, 0.005);
      var th = add('glove', G.thumb, hand, -0.035 * s, 0.0, 0.02); th.rotation.z = 0.5 * s;
      return { sh: sh, el: el, hand: hand };
    });
    this.pose = { crouch: 0, lean: 0, amp: 0, bodyPitch: 0, bodyY: 0, yaw: 0, spin: 0,
      aL: { p: 0, r: 0, e: 0 }, aR: { p: 0, r: 0, e: 0 }, kL: 0, kR: 0, tL: 0, tR: 0 };
    this.teamAbbr = null;
    this.throwT = 0;
  }

  PlayerModel.prototype.setTeam = function (team, skinIdx, big, heightK) {
    var m = this.mats.team(team), P = this.parts, sk = this.mats.skin[skinIdx % this.mats.skin.length];
    ['jersey', 'trim', 'pants', 'helmet', 'stripe', 'sock', 'glove'].forEach(function (k) { P[k].forEach(function (x) { x.material = m[k]; }); });
    P.skin.forEach(function (x) { x.material = sk; });
    this.root.scale.set(big ? 1.16 : 1, heightK, big ? 1.12 : 1);
    this.visor.visible = (skinIdx * 7 + Math.round(heightK * 100)) % 3 === 0;
    this.teamAbbr = team.abbr;
  };

  // Apply a target pose with smoothing.
  PlayerModel.prototype.apply = function (tp, dt, snap) {
    var p = this.pose, k = snap ? 1 : Math.min(1, dt * 14), k2 = snap ? 1 : Math.min(1, dt * 9);
    ['crouch', 'lean', 'bodyPitch', 'bodyY', 'tL', 'tR', 'kL', 'kR'].forEach(function (n) { p[n] = lerp(p[n], tp[n], n === 'bodyPitch' ? k2 : k); });
    ['aL', 'aR'].forEach(function (a) { ['p', 'r', 'e'].forEach(function (n) { p[a][n] = lerp(p[a][n], tp[a][n], k); }); });
    var L = this.legs;
    L[0].thigh.rotation.x = p.tL; L[1].thigh.rotation.x = p.tR;
    L[0].knee.rotation.x = p.kL; L[1].knee.rotation.x = p.kR;
    L[0].foot.rotation.x = -(p.tL + p.kL) * 0.8; L[1].foot.rotation.x = -(p.tR + p.kR) * 0.8;
    // hips height from the planted (longest) leg so the feet stay on the turf
    // thigh 0.46 + shin 0.42 + cleat/sole 0.051 (keeps the planted foot on the turf)
    var hl = function (t, kk) { return 0.46 * Math.cos(t) + 0.42 * Math.cos(t + kk); };
    var hh = Math.max(hl(p.tL, p.kL), hl(p.tR, p.kR)) + 0.051 + 0.05;
    this.hips.position.y = hh;
    this.spine.rotation.x = p.lean;
    this.head.rotation.x = -p.lean * 0.6;
    var A = this.arms;
    A[0].sh.rotation.x = p.aL.p; A[0].sh.rotation.z = -p.aL.r; A[0].el.rotation.x = p.aL.e;
    A[1].sh.rotation.x = p.aR.p; A[1].sh.rotation.z = p.aR.r; A[1].el.rotation.x = p.aR.e;
    this.body.rotation.x = p.bodyPitch;
    this.body.position.y = p.bodyY + Math.abs(Math.sin(p.bodyPitch)) * 0.16;
  };

  // ============================================================ particles
  function Particles(max, additive) {
    this.max = max; this.n = 0; this.list = [];
    var g = new T.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    g.setAttribute('position', new T.BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new T.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new T.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new T.BufferAttribute(this.alpha, 1));
    this.mat = new T.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: 'attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale; varying vec3 vC; varying float vA;' +
        'void main(){ vC=aColor; vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*uScale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard; gl_FragColor=vec4(vC, vA*smoothstep(0.5,0.1,d)); }',
      transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending
    });
    this.points = new T.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.geo = g;
  }
  Particles.prototype.spawn = function (p) { if (this.list.length < this.max) this.list.push(p); };
  Particles.prototype.update = function (dt) {
    var L = this.list, c = new T.Color();
    for (var i = L.length - 1; i >= 0; i--) {
      var p = L[i];
      p.life -= dt;
      if (p.life <= 0) { L.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= p.grav * dt;
      if (p.z < 0.02) { p.z = 0.02; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; }
    }
    for (var j = 0; j < L.length; j++) {
      var q = L[j];
      this.pos[j * 3] = q.x; this.pos[j * 3 + 1] = q.z; this.pos[j * 3 + 2] = q.y;
      c.set(q.color);
      this.col[j * 3] = c.r; this.col[j * 3 + 1] = c.g; this.col[j * 3 + 2] = c.b;
      var a = q.life / q.max;
      this.size[j] = q.size * (q.fire ? 0.5 + a : 1);
      this.alpha[j] = q.fire ? a : Math.min(1, a * 2);
    }
    this.geo.setDrawRange(0, L.length);
    ['position', 'aColor', 'aSize', 'aAlpha'].forEach(function (n) { this.geo.attributes[n].needsUpdate = true; }, this);
  };

  // ============================================================== renderer
  function Renderer3D(glCanvas, hudCanvas, quality) {
    this.canvas = glCanvas;
    this.quality = quality;
    var hi = quality === 'high';
    this.gl = new T.WebGLRenderer({ canvas: glCanvas, antialias: !hi, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, hi ? 2 : 1.5));
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = T.PCFSoftShadowMap;
    this.gl.toneMapping = T.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;
    this.gl.outputColorSpace = T.SRGBColorSpace;
    this.hud = new FB.Renderer(hudCanvas);
    this.hud.hudOnly = true;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(38, 1, 0.3, 900);
    this.mats = new Mats();
    this.models = [];
    this.cam = { x: 50, y: MID, dir: 1, H: 9, B: 13, init: false, look: new T.Vector3(), pos: new T.Vector3() };
    this.shake = 0; this.flash = 0; this.punch = 0;
    this.time = 0;
    this.crowdAmp = 0.05;
    this.teamsKey = '';
    this.buildWorld();
    this.glow = new Particles(700, true);
    this.solid = new Particles(500, false);
    this.scene.add(this.glow.points); this.scene.add(this.solid.points);
    if (hi) {
      var size = new T.Vector2(); this.gl.getSize(size);
      var rt = new T.WebGLRenderTarget(16, 16, { samples: 4, type: T.HalfFloatType });
      this.composer = new T.EffectComposer(this.gl, rt);
      this.composer.addPass(new T.RenderPass(this.scene, this.camera));
      this.bloom = new T.UnrealBloomPass(new T.Vector2(256, 256), 0.5, 0.55, 0.82);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new T.OutputPass());
    }
    this.resize();
  }
  FB.Renderer3D = Renderer3D;
  var R = Renderer3D.prototype;

  R.resize = function () {
    var w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.W = w; this.H = h;
    this.gl.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(this.gl.getPixelRatio()); this.composer.setSize(w, h); }
    this.camera.aspect = w / h;
    // keep enough horizontal field of view on portrait screens
    var hfov = 58 * Math.PI / 180;
    var vfov = 2 * Math.atan(Math.tan(hfov / 2) / this.camera.aspect) * 180 / Math.PI;
    this.camera.fov = clamp(vfov, 36, 75);
    this.baseFov = this.camera.fov;
    this.camera.updateProjectionMatrix();
    this.hud.resize();
  };

  // --------------------------------------------------------------- world
  R.buildWorld = function () {
    var S = this.scene, hi = this.quality === 'high', self = this;
    S.fog = new T.Fog('#0a0c1c', 160, 520);
    // sky dome
    var sky = new T.Mesh(new T.SphereGeometry(600, 32, 16), new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; void main(){ float h=clamp(vP.y,0.0,1.0); vec3 top=vec3(0.01,0.012,0.04); vec3 hor=vec3(0.13,0.08,0.22); gl_FragColor=vec4(mix(hor,top,pow(h,0.45)),1.0); }'
    }));
    S.add(sky);
    var starG = new T.BufferGeometry(), sp = [];
    for (var i = 0; i < 900; i++) { var a = Math.random() * TAU, e = 0.25 + Math.random() * 1.2; sp.push(Math.cos(a) * Math.cos(e) * 550 + 50, Math.sin(e) * 550, Math.sin(a) * Math.cos(e) * 550 + MID); }
    starG.setAttribute('position', new T.Float32BufferAttribute(sp, 3));
    S.add(new T.Points(starG, new T.PointsMaterial({ color: '#cfd6ff', size: 1.4, sizeAttenuation: false, fog: false })));

    // lights
    S.add(new T.HemisphereLight('#c4d4ff', '#1d3a1f', 0.9));
    var key = new T.DirectionalLight('#fff4e6', 2.4);
    key.castShadow = true;
    key.shadow.mapSize.set(hi ? 2048 : 1024, hi ? 2048 : 1024);
    var sc = key.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 200;
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
    S.add(key); S.add(key.target);
    this.key = key;
    var fill = new T.DirectionalLight('#9fb4ff', 0.7); fill.position.set(-40, 50, -60); S.add(fill);

    // ground and field
    var ground = new T.Mesh(new T.PlaneGeometry(400, 300), new T.MeshStandardMaterial({ color: '#163d1f', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(50, -0.02, MID); ground.receiveShadow = true;
    S.add(ground);
    this.fieldMat = new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.88 });
    var field = new T.Mesh(new T.PlaneGeometry(FLEN, FWID), this.fieldMat);
    field.rotation.x = -Math.PI / 2; field.position.set(FX0 + FLEN / 2, 0, FY0 + FWID / 2);
    field.receiveShadow = true;
    S.add(field);

    // sideline benches + team areas
    this.benchMats = [new T.MeshStandardMaterial({ color: '#333', roughness: 0.7 }), new T.MeshStandardMaterial({ color: '#333', roughness: 0.7 })];
    [[-9, 0], [FW + 9, 1]].forEach(function (b) {
      var bench = new T.Mesh(new T.BoxGeometry(40, 1.1, 1.4), self.benchMats[b[1]]);
      bench.position.set(50, 0.55, b[0]); bench.castShadow = true; S.add(bench);
    });

    // stadium bowl: two decks built from a stepped profile revolved into an ellipse
    var A = 80, B = 50;
    this.bowlA = A; this.bowlB = B;
    var concrete = new T.MeshStandardMaterial({ color: '#1a1d2e', roughness: 0.92, side: T.DoubleSide });
    var deck = function (r0, y0, rows, depth, rise) {
      var pts = [new T.Vector2(r0, 0), new T.Vector2(r0, y0)];
      for (var k = 0; k < rows; k++) {
        pts.push(new T.Vector2(r0 + (k + 1) * depth, y0 + k * rise));
        pts.push(new T.Vector2(r0 + (k + 1) * depth, y0 + (k + 1) * rise));
      }
      pts.push(new T.Vector2(r0 + (rows + 1.5) * depth, y0 + rows * rise + 2.5));
      pts.push(new T.Vector2(r0 + (rows + 1.5) * depth, 0));
      var g = new T.LatheGeometry(pts.map(function (v) { return new T.Vector2(v.x, v.y); }), 120);
      var m = new T.Mesh(g, concrete);
      m.scale.set(A, 1, B);
      m.position.set(50, 0, MID);
      m.receiveShadow = true;
      S.add(m);
      return { r0: r0, y0: y0, rows: rows, depth: depth, rise: rise };
    };
    var lower = deck(1.0, 2.4, 22, 0.016, 0.72);
    var upper = deck(1.0 + 23.5 * 0.016 + 0.03, 2.4 + 22 * 0.72 + 4.2, 14, 0.016, 0.95);
    this.decks = [lower, upper];

    // LED ribbon boards (front of lower deck and front of upper deck)
    this.ribbonTex = canvasTex(2048, 64, function () {});
    this.ribbonTex.wrapS = T.RepeatWrapping;
    var ribbon = function (r, y, h) {
      var g = new T.CylinderGeometry(1, 1, h, 160, 1, true);
      var m = new T.Mesh(g, new T.MeshBasicMaterial({ map: self.ribbonTex, side: T.DoubleSide, toneMapped: false }));
      m.scale.set(A * r, 1, B * r); m.position.set(50, y, MID);
      self.ribbonTex.repeat.set(-6, 1); // seen from inside the bowl
      S.add(m);
    };
    ribbon(0.996, 1.5, 1.6);
    ribbon(upper.r0 - 0.002, upper.y0 - 1.6, 1.8);
    // roof rim with light strip
    var rimR = upper.r0 + (upper.rows + 1.5) * upper.depth;
    var rim = new T.Mesh(new T.TorusGeometry(1, 0.012, 6, 160), new T.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
    rim.rotation.x = Math.PI / 2; rim.scale.set(A * rimR, B * rimR, 1); rim.position.set(50, upper.y0 + upper.rows * upper.rise + 3.2, MID);
    S.add(rim);

    // light towers
    var glowTex = glowTexture();
    var towerMat = new T.MeshStandardMaterial({ color: '#2a2f45', roughness: 0.6, metalness: 0.4 });
    var panelMat = new T.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 1], [0, -1]].forEach(function (c) {
      var ang = Math.atan2(c[1] * B, c[0] * A * (c[0] === 0 ? 0.001 : 1));
      var x = 50 + Math.cos(ang) * A * (rimR + 0.04), z = MID + Math.sin(ang) * B * (rimR + 0.04);
      var top = upper.y0 + upper.rows * upper.rise + 14;
      var pole = new T.Mesh(new T.BoxGeometry(1.2, top, 1.2), towerMat); pole.position.set(x, top / 2, z); S.add(pole);
      var panel = new T.Mesh(new T.BoxGeometry(9, 4, 0.6), panelMat); panel.position.set(x, top, z); panel.lookAt(50, 0, MID); S.add(panel);
      var spr = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: '#fff6dc', transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
      spr.scale.set(46, 46, 1); spr.position.set(x, top, z); S.add(spr);
    });

    // jumbotrons at both ends
    this.jumboTex = canvasTex(1024, 512, function () {});
    var jumboMat = new T.MeshBasicMaterial({ map: this.jumboTex, toneMapped: false });
    var jy = upper.y0 + upper.rows * upper.rise + 8;
    [-1, 1].forEach(function (s) {
      var x = 50 + s * A * (rimR - 0.02);
      var frame = new T.Mesh(new T.BoxGeometry(2, 15, 30), towerMat); frame.position.set(x, jy, MID); S.add(frame);
      var scr = new T.Mesh(new T.PlaneGeometry(27, 13.5), jumboMat);
      scr.position.set(x - s * 1.05, jy, MID); scr.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      S.add(scr);
    });

    this.buildCrowd();

    // goal posts
    var postMat = new T.MeshStandardMaterial({ color: '#ffd84a', roughness: 0.35, metalness: 0.3, emissive: '#3a2a00' });
    [-10.2, 110.2].forEach(function (gx) {
      var base = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 3.3, 10), postMat); base.position.set(gx + (gx < 0 ? -1 : 1), 1.65, MID); base.castShadow = true; S.add(base);
      var arm = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 1, 8), postMat); arm.rotation.z = Math.PI / 2; arm.position.set(gx + (gx < 0 ? -0.5 : 0.5), 3.3, MID); S.add(arm);
      var bar = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 6.17, 8), postMat); bar.rotation.x = Math.PI / 2; bar.position.set(gx, 3.3, MID); bar.castShadow = true; S.add(bar);
      [-3.08, 3.08].forEach(function (o) { var up = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 10, 8), postMat); up.position.set(gx, 8.3, MID + o); up.castShadow = true; S.add(up); });
    });

    // markers: line of scrimmage, first down, rings
    var plane = function (color, op) { var m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ color: color, transparent: true, opacity: op, depthWrite: false, toneMapped: false })); m.rotation.x = -Math.PI / 2; m.renderOrder = 2; S.add(m); return m; };
    this.losLine = plane('#3c8cff', 0.85); this.losLine.scale.set(0.3, FW, 1);
    this.fdLine = plane('#ffdc28', 0.9); this.fdLine.scale.set(0.3, FW, 1);
    var ring = function (color, r0, r1) {
      var m = new T.Mesh(new T.RingGeometry(r0, r1, 48), new T.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.95, depthWrite: false, side: T.DoubleSide, toneMapped: false }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 3; S.add(m); return m;
    };
    this.ctlRings = [ring('#2ee6ff', 0.62, 0.82), ring('#ff8a1f', 0.62, 0.82)];
    this.ctlDiscs = this.ctlRings.map(function (r) {
      var d = new T.Mesh(new T.CircleGeometry(0.62, 32), new T.MeshBasicMaterial({ color: r.material.color, transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false }));
      d.rotation.x = -Math.PI / 2; d.renderOrder = 3; S.add(d); return d;
    });
    this.targetRing = ring('#ffe14a', 0.75, 0.92);
    this.landRing = ring('#fff07a', 0.85, 1.0);

    // football
    var G = geos();
    this.ball = new T.Group();
    var bm = new T.Mesh(G.ball, this.mats.ball); bm.scale.set(1.6, 1, 1); bm.castShadow = true; this.ball.add(bm);
    var lace = new T.Mesh(G.lace, this.mats.lace); lace.position.set(0, 0.105, 0); this.ball.add(lace);
    S.add(this.ball);
  };

  R.buildCrowd = function () {
    var hi = this.quality === 'high', self = this;
    var A = this.bowlA, B = this.bowlB;
    var spots = [];
    var spacing = hi ? 1.0 : 1.7;
    this.decks.forEach(function (d) {
      for (var k = 0; k < d.rows; k += hi ? 1 : 2) {
        var r = d.r0 + (k + 0.6) * d.depth, y = d.y0 + k * d.rise;
        var per = TAU * Math.sqrt((A * A + B * B) / 2) * r;
        var n = Math.floor(per / spacing);
        for (var i = 0; i < n; i++) {
          if (Math.random() < 0.06) continue; // empty seats
          var a = (i + Math.random() * 0.4) / n * TAU;
          spots.push([50 + Math.cos(a) * A * r, y, MID + Math.sin(a) * B * r]);
        }
      }
    });
    this.crowdUniforms = { uTime: { value: 0 }, uAmp: { value: 0.05 } };
    var u = this.crowdUniforms;
    var patch = function (mat) {
      mat.onBeforeCompile = function (sh) {
        sh.uniforms.uTime = u.uTime; sh.uniforms.uAmp = u.uAmp;
        sh.vertexShader = 'uniform float uTime; uniform float uAmp;\n' + sh.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\n float sd = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.71;\n' +
          ' float jmp = max(0.0, sin(uTime * (3.0 + fract(sd) * 3.0) + sd * 6.2831));\n' +
          ' transformed.y += jmp * uAmp + sin(uTime * 1.3 + sd) * 0.03;');
      };
      return mat;
    };
    var bodyGeo = new T.BoxGeometry(0.46, 0.85, 0.32); bodyGeo.translate(0, 0.43, 0);
    var headGeo = new T.BoxGeometry(0.24, 0.26, 0.24); headGeo.translate(0, 1.02, 0);
    this.crowdBody = new T.InstancedMesh(bodyGeo, patch(new T.MeshLambertMaterial({ color: '#ffffff' })), spots.length);
    this.crowdHead = new T.InstancedMesh(headGeo, patch(new T.MeshLambertMaterial({ color: '#ffffff' })), spots.length);
    var m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(1, 1, 1), pos = new T.Vector3(), up = new T.Vector3(0, 1, 0);
    var c = new T.Color();
    spots.forEach(function (s, i) {
      q.setFromAxisAngle(up, Math.atan2(50 - s[0], MID - s[2]));
      sc.set(1, 0.85 + Math.random() * 0.3, 1);
      pos.set(s[0], s[1], s[2]);
      m4.compose(pos, q, sc);
      self.crowdBody.setMatrixAt(i, m4);
      self.crowdHead.setMatrixAt(i, m4);
      self.crowdHead.setColorAt(i, c.set(SKIN[(Math.random() * SKIN.length) | 0]));
    });
    this.crowdSpots = spots;
    this.scene.add(this.crowdBody); this.scene.add(this.crowdHead);
  };

  // Recolor the crowd / benches / field / boards for a matchup.
  R.setTeams = function (t0, t1) {
    var key = t0.abbr + '-' + t1.abbr;
    if (key === this.teamsKey) return;
    this.teamsKey = key;
    var hi = this.quality === 'high';
    if (this.fieldMat.map) this.fieldMat.map.dispose();
    this.fieldMat.map = fieldTexture(t0, t1, hi ? 4096 : 2048);
    this.fieldMat.needsUpdate = true;
    this.benchMats[0].color.set(teamColor(t0)); this.benchMats[1].color.set(teamColor(t1));
    var c = new T.Color(), cols0 = [t0.c.jersey, t0.c.trim], cols1 = [t1.c.jersey, t1.c.trim], neutral = ['#d9dbe6', '#2a2d3d', '#565a70'];
    for (var i = 0; i < this.crowdSpots.length; i++) {
      var r = Math.random(), s = this.crowdSpots[i];
      // home crowd behind team 0's sideline and end, visitors elsewhere
      var homeSide = (s[2] < MID ? 0.75 : 0.45);
      var col = r < homeSide ? cols0[(Math.random() < 0.7) ? 0 : 1] : r < 0.92 ? cols1[(Math.random() < 0.7) ? 0 : 1] : neutral[(Math.random() * 3) | 0];
      this.crowdBody.setColorAt(i, c.set(col).multiplyScalar(0.55 + Math.random() * 0.45));
    }
    this.crowdBody.instanceColor.needsUpdate = true;
    // ribbon board
    var tex = this.ribbonTex, cv = tex.image, g = cv.getContext('2d');
    g.fillStyle = '#05060f'; g.fillRect(0, 0, cv.width, cv.height);
    var items = ['FOOTBALL BLITZ \'26', t0.city.toUpperCase() + ' ' + t0.name.toUpperCase(), 'VS', t1.city.toUpperCase() + ' ' + t1.name.toUpperCase(), 'NO RULES. ALL GAME.'];
    g.font = 'italic 900 40px "Russo One", "Arial Black", sans-serif'; g.textBaseline = 'middle';
    var x = 20, i2 = 0;
    while (x < cv.width) {
      var t = items[i2 % items.length];
      g.fillStyle = i2 % items.length === 1 ? teamColor(t0) : i2 % items.length === 3 ? teamColor(t1) : (i2 % 2 ? '#ffd23a' : '#2ee6ff');
      if (g.fillStyle === '#000000' || g.fillStyle === '#101010') g.fillStyle = '#ffffff';
      g.fillText(t, x, 34); x += g.measureText(t).width + 60; i2++;
    }
    tex.needsUpdate = true;
    this.jumboKey = '';
  };

  R.updateJumbo = function (g) {
    var key = g.score.join('-') + '|' + g.quarter + '|' + Math.ceil(g.clock) + '|' + (this.jumboMsg || '');
    if (key === this.jumboKey) return;
    this.jumboKey = key;
    var cv = this.jumboTex.image, c = cv.getContext('2d'), t0 = g.teams[0], t1 = g.teams[1];
    var grd = c.createLinearGradient(0, 0, 0, 512); grd.addColorStop(0, '#0b1030'); grd.addColorStop(1, '#03040c');
    c.fillStyle = grd; c.fillRect(0, 0, 1024, 512);
    c.fillStyle = teamColor(t0); c.fillRect(20, 20, 480, 250);
    c.fillStyle = teamColor(t1); c.fillRect(524, 20, 480, 250);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff';
    c.font = 'italic 900 90px "Russo One", "Arial Black", sans-serif';
    c.fillText(t0.abbr, 260, 85); c.fillText(t1.abbr, 764, 85);
    c.font = '900 120px "Russo One", "Arial Black", sans-serif';
    c.fillText(String(g.score[0]), 260, 200); c.fillText(String(g.score[1]), 764, 200);
    c.fillStyle = '#ffd23a'; c.font = 'italic 900 70px "Russo One", "Arial Black", sans-serif';
    var msg = this.jumboMsg || ((g.quarter <= 4 ? 'Q' + g.quarter : 'OT') + '   ' + FB.fmtClock(g.clock));
    c.fillText(msg, 512, 390);
    this.jumboTex.needsUpdate = true;
  };

  // ------------------------------------------------------------- camera
  R.updateCamera = function (g, dt) {
    var cam = this.cam, b = g.ball, fx, fy, H = 9, Bk = 13.5;
    if (g.replay) {
      // low sideline replay angle that tracks the ball
      var side = cam.replaySide || (cam.replaySide = (b.y < MID ? -1 : 1));
      var tx = b.x - g.dir * 4, ty = b.y + side * 13, tz = 3.6;
      if (!cam.replayInit) { cam.rp = new T.Vector3(tx, tz, ty); cam.rl = new T.Vector3(b.x, 1, b.y); cam.replayInit = true; }
      var kk = 1 - Math.exp(-dt * 5);
      cam.rp.lerp(tmpV.set(tx, tz, ty), kk); cam.rl.lerp(tmpV.set(b.x, 1, b.y), kk);
      this.camera.position.copy(cam.rp); this.camera.lookAt(cam.rl);
      this.key.position.set(b.x + 25, 60, b.y + 35); this.key.target.position.set(b.x, 0, b.y);
      cam.init = false;
      return;
    }
    cam.replayInit = false; cam.replaySide = 0;
    if (g.phase === 'select' || g.phase === 'presnap' || g.phase === 'pat') {
      fx = g.losX + g.dir * 1; fy = MID + (b.y - MID) * 0.3; H = 8.6; Bk = 16;
      if (g.playType === 'kickoff') { fx = FB.Game.ownGoal(g.poss) + g.dir * 22; H = 10; Bk = 18; }
    } else if (g.phase === 'anim' && g.kickAnim) {
      fx = b.x; fy = b.y; H = 9; Bk = 15;
    } else {
      fx = b.x + g.dir * 2; fy = b.y; H = 9.2; Bk = 15.5;
      if (b.state === 'air' && b.kind === 'pass') { fx = lerp(b.x, b.tx, 0.45); fy = lerp(b.y, b.ty, 0.45); H = 11; Bk = 18; }
      if (g.playType === 'kickoff' && b.state === 'air') { fx = lerp(b.tx, b.x, 0.45); H = 10.5; Bk = 18; }
    }
    if (g.phase === 'final' || g.phase === 'break') { H = 6; Bk = 11; }
    fy = clamp(fy, 13, FW - 13);
    var k = 1 - Math.exp(-dt * 4);
    if (!cam.init || cam.dir !== g.dir) { cam.x = fx; cam.y = fy; cam.dir = g.dir; cam.H = H; cam.B = Bk; cam.init = true; }
    cam.x = lerp(cam.x, fx, k); cam.y = lerp(cam.y, fy, k);
    cam.H = lerp(cam.H, H, k * 0.5); cam.B = lerp(cam.B, Bk, k * 0.5);
    this.punch = Math.max(0, this.punch - dt * 2.5);
    var bz = 1 - this.punch * 0.25;
    var px = cam.x - cam.dir * cam.B * bz, py = cam.H * bz, pz = cam.y;
    var sh = this.shake;
    if (sh > 0) { px += rnd(-1, 1) * sh * 0.35; py += rnd(-1, 1) * sh * 0.25; pz += rnd(-1, 1) * sh * 0.35; }
    this.camera.position.set(px, py, pz);
    this.camera.lookAt(cam.x + cam.dir * 3.5, 0.6, cam.y);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    // shadow box follows the action
    this.key.position.set(cam.x + 25, 60, cam.y + 35);
    this.key.target.position.set(cam.x + cam.dir * 6, 0, cam.y);
  };

  // ------------------------------------------------------------- poses
  function blankPose() { return { crouch: 0, lean: 0.05, bodyPitch: 0, bodyY: 0, tL: 0, tR: 0, kL: 0.08, kR: 0.08, aL: { p: 0.1, r: 0.15, e: -0.25 }, aR: { p: 0.1, r: 0.15, e: -0.25 } }; }

  // legs for a crouch amount (0 standing .. 1 deep 3-point stance)
  function crouchLegs(tp, c) {
    tp.tL = tp.tR = -c * 1.05; tp.kL = tp.kR = c * 1.85;
  }

  R.poseFor = function (g, p, m, dt) {
    var tp = blankPose();
    var b = g.ball, sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    var phase = p.anim * 1.0, amp = clamp(sp / 7.5, 0, 1) * 0.95;
    var isOff = p.team === g.poss;
    var t = this.time;
    // breathing / idle
    tp.lean = 0.06 + Math.sin(t * 2 + m.seed * 9) * 0.02;
    if (p.state === 'down') {
      tp.bodyPitch = 1.5; tp.aL = { p: -2.6, r: 0.5, e: -0.2 }; tp.aR = { p: -2.4, r: 0.6, e: -0.3 };
      tp.tL = 0.1; tp.tR = -0.15; tp.kL = 0.3; tp.kR = 0.1; tp.lean = 0;
      return tp;
    }
    if (p.state === 'dive') {
      tp.bodyPitch = 1.2; tp.bodyY = 0.35; tp.aL = { p: -2.9, r: 0.2, e: -0.1 }; tp.aR = { p: -2.9, r: 0.2, e: -0.1 };
      tp.tL = 0.35; tp.tR = 0.2; tp.kL = 0.2; tp.kR = 0.4; tp.lean = 0.1;
      return tp;
    }
    var stance = 0;
    if (g.phase === 'presnap' && g.playType !== 'kickoff') {
      var role = p.role, key = p.key;
      if (role === 'OL0' || role === 'OL1' || key === 'F1' || key === 'F2' || key === 'NT') {
        crouchLegs(tp, 0.95); tp.lean = 1.05;
        var ground = { p: -1.25, r: 0.05, e: 0 };
        tp.aR = ground; tp.aL = (key === 'NT') ? { p: -1.25, r: 0.05, e: 0 } : { p: -0.6, r: 0.25, e: -1.4 };
        return tp;
      }
      if (role === 'QB') {
        var gun = g.offPlay && g.offPlay.form !== 'under';
        crouchLegs(tp, gun ? 0.3 : 0.55); tp.lean = gun ? 0.25 : 0.5;
        tp.aL = { p: -0.9, r: -0.25, e: -1.3 }; tp.aR = { p: -0.9, r: -0.25, e: -1.3 };
        return tp;
      }
      if (role === 'RB' || key === 'M' || key === 'B2') {
        crouchLegs(tp, 0.45); tp.lean = 0.55;
        tp.aL = { p: -0.75, r: 0.1, e: -0.35 }; tp.aR = { p: -0.75, r: 0.1, e: -0.35 };
        return tp;
      }
      crouchLegs(tp, 0.4); tp.lean = 0.5;
      tp.aL = { p: -0.5, r: 0.2, e: -1.4 }; tp.aR = { p: 0.3, r: 0.2, e: -1.2 };
      return tp;
    }
    // running cycle
    var cr = 0.12 + amp * 0.12;
    crouchLegs(tp, cr);
    var sL = Math.sin(phase), sR = Math.sin(phase + Math.PI);
    tp.tL += sL * amp * 0.95; tp.tR += sR * amp * 0.95;
    tp.kL += amp * (1.5 * Math.max(0, -Math.cos(phase)) + 0.25);
    tp.kR += amp * (1.5 * Math.max(0, -Math.cos(phase + Math.PI)) + 0.25);
    tp.lean = 0.08 + amp * 0.3 + (p.wantTurbo || p.humanTurbo ? 0.1 : 0);
    tp.aL = { p: -sL * amp * 0.9 - 0.1, r: 0.12, e: -0.6 - amp * 0.9 };
    tp.aR = { p: -sR * amp * 0.9 - 0.1, r: 0.12, e: -0.6 - amp * 0.9 };
    // blocking
    if (p.eng) { tp.lean = 0.7; crouchLegs(tp, 0.4); tp.tL += sL * 0.2; tp.tR += sR * 0.2; tp.aL = { p: -1.5, r: -0.1, e: -0.5 }; tp.aR = { p: -1.5, r: -0.1, e: -0.5 }; }
    if (p.stiffT > 0) { tp.aL = { p: -1.55, r: 0.05, e: 0 }; tp.lean = 0.35; }
    var holding = b.holder === p && (b.state === 'held' || b.state === 'dead-held');
    if (holding) {
      if (p.role === 'QB' && !g.passThrown && !g.handedOff && g.playType !== 'kickoff' && g.playType !== 'run' && g.relX(p.x) <= 0.5) {
        tp.aR = { p: -1.7, r: 0.5, e: -1.9 }; tp.aL = { p: -1.0, r: -0.3, e: -1.2 };
      } else { tp.aR = { p: -0.45, r: -0.15, e: -1.75 }; }
    }
    if (m.throwT > 0) {
      var k = 1 - m.throwT / 0.32;
      tp.aR = { p: lerp(-2.7, -1.1, k), r: lerp(0.4, 0.1, k), e: lerp(-1.7, -0.1, k) };
      tp.lean = lerp(-0.05, 0.4, k);
    }
    // reaching for a ball in the air
    if (b.state === 'air' && b.kind === 'pass' && (b.target === p || (!isOff && Math.hypot(p.x - b.tx, p.y - b.ty) < 3))) {
      var left = b.T - b.t;
      if (left < 0.55) { tp.aL = { p: -2.8, r: 0.25, e: -0.3 }; tp.aR = { p: -2.8, r: 0.25, e: -0.3 }; }
    }
    if (p.jumpT > 0) { tp.aL = { p: -3.0, r: 0.2, e: -0.2 }; tp.aR = { p: -3.0, r: 0.2, e: -0.2 }; tp.tL = -0.6; tp.kL = 1.2; }
    // celebrate a touchdown
    if (g.phase === 'dead' && g.result && g.result.reason === 'td' && p.team === g.result.ballTeam) {
      var hop = Math.abs(Math.sin(t * 7 + m.seed * 6));
      tp.bodyY = hop * 0.3; tp.aL = { p: -2.9, r: 0.45, e: -0.3 }; tp.aR = { p: -2.9, r: 0.45, e: -0.3 };
      tp.tL = -0.2; tp.tR = -0.2; tp.kL = 0.4; tp.kR = 0.4;
    }
    return tp;
  };

  // ------------------------------------------------------------- frame
  R.render = function (g, dt) {
    this.time += dt;
    this._g = g;
    this.endShowcase();
    this.setTeams(g.teams[0], g.teams[1]);
    this.updateCamera(g, dt);
    this.updatePlayers(g, dt);
    this.updateBall(g, dt);
    this.updateMarkers(g);
    this.updateJumbo(g);
    this.ribbonTex.offset.x = (this.ribbonTex.offset.x + dt * 0.02) % 1;
    this.crowdUniforms.uTime.value = this.time;
    this.crowdAmp = lerp(this.crowdAmp, this.crowdTarget || 0.05, Math.min(1, dt * 3));
    this.crowdTarget = Math.max(0.05, (this.crowdTarget || 0.05) - dt * 0.12);
    this.crowdUniforms.uAmp.value = this.crowdAmp;
    this.glow.update(dt); this.solid.update(dt);
    this.updateWeather(dt);
    var scale = this.gl.domElement.height / (2 * Math.tan(this.camera.fov * Math.PI / 360));
    this.glow.mat.uniforms.uScale.value = scale; this.solid.mat.uniforms.uScale.value = scale;
    this.camera.fov = this.baseFov * (1 - this.punch * 0.12);
    this.camera.updateProjectionMatrix();
    if (this.composer) this.composer.render(dt); else this.gl.render(this.scene, this.camera);
    // HUD overlay
    this.hud.clear();
    this.drawTags(g);
    if (this.flash > 0) { var c = this.hud.ctx; c.fillStyle = 'rgba(255,255,255,' + (this.flash * 0.3) + ')'; c.fillRect(0, 0, this.W, this.H); }
  };

  R.updatePlayers = function (g, dt) {
    var self = this, ps = g.players;
    while (this.models.length < ps.length) {
      var m = new PlayerModel(this.mats);
      this.scene.add(m.root);
      this.models.push(m);
    }
    this.models.forEach(function (m, i) {
      var p = ps[i];
      if (!p) { m.root.visible = false; return; }
      m.root.visible = true;
      var snap = m.lastP !== p;
      if (snap) {
        var id = p.info.id;
        m.seed = hash(id);
        var big = p.role === 'OL0' || p.role === 'OL1' || p.info.arch === 'DT' || p.info.pos === 'DL';
        m.setTeam(g.teams[p.team], Math.floor(hash(id + 's') * 6), big, 0.96 + hash(id + 'h') * 0.08);
        m.lastP = p;
        m.throwT = 0;
      }
      if (m.throwT > 0) m.throwT = Math.max(0, m.throwT - dt);
      m.root.position.set(p.x, p.z || 0, p.y);
      var want = Math.atan2(Math.cos(p.face), Math.sin(p.face));
      if (p.spinT > 0) want += (1 - p.spinT / 0.45) * TAU;
      m.yaw = snap ? want : angLerp(m.yaw || want, want, Math.min(1, dt * (p.spinT > 0 ? 30 : 12)));
      m.root.rotation.y = m.yaw;
      m.apply(self.poseFor(g, p, m, dt), dt, snap);
      var hs = FB.cheats && FB.cheats.bigHeads ? 1.9 : 1;
      m.head.scale.set(hs, hs, hs);
      // turf kicked up by hard cuts
      var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (sp > 7 && Math.random() < dt * 6) self.solid.spawn({ x: p.x, y: p.y, z: 0.05, vx: rnd(-1, 1) - p.vx * 0.1, vy: rnd(-1, 1) - p.vy * 0.1, vz: rnd(1, 3), life: 0.5, max: 0.5, color: Math.random() < 0.5 ? '#3d7a35' : '#5a3a20', size: 0.07, grav: 12 });
      // on fire
      if (g.fire[p.team] && (p.ctl >= 0 || g.ball.holder === p) && Math.random() < dt * 40) {
        self.glow.spawn({ x: p.x + rnd(-0.3, 0.3), y: p.y + rnd(-0.3, 0.3), z: rnd(0.1, 1.8), vx: 0, vy: 0, vz: rnd(2, 4), life: 0.45, max: 0.45, color: Math.random() < 0.5 ? '#ff5a00' : '#ffc400', size: 0.28, fire: true, grav: -2 });
      }
    });
  };

  var tmpV = new T.Vector3();
  R.updateBall = function (g, dt) {
    var b = g.ball, B = this.ball;
    B.visible = true;
    var holderModel = null;
    if (b.holder && (b.state === 'held' || b.state === 'dead-held')) {
      var idx = g.players.indexOf(b.holder);
      holderModel = this.models[idx];
    }
    if (holderModel) {
      holderModel.root.updateMatrixWorld(true);
      holderModel.arms[1].hand.getWorldPosition(tmpV);
      B.position.copy(tmpV);
      B.rotation.set(0, holderModel.yaw + Math.PI / 2, 0.5);
    } else {
      B.position.set(b.x, Math.max(0.12, b.z), b.y);
      if (b.state === 'air' || b.state === 'kick' || b.state === 'pitch') {
        if (b.kind === 'pass' || b.kind === 'pitch') {
          B.rotation.set(0, -Math.atan2(b.ty - b.sy, b.tx - b.sx), 0);
          B.rotateX(b.spin * 3);
          B.rotateZ(clamp((0.5 - (b.t / b.T)) * 1.2, -0.6, 0.6));
        } else { B.rotation.set(0, 0, b.spin * 1.5); }
      } else if (b.state === 'loose') { B.rotation.set(b.spin, b.spin * 0.7, 0); }
      else B.rotation.set(0, 0, Math.PI / 2 * 0.15);
    }
  };

  R.updateMarkers = function (g) {
    var show = g.playType !== 'kickoff' && g.phase !== 'anim' && g.phase !== 'break' && g.phase !== 'final' && g.phase !== 'pat';
    this.losLine.visible = show;
    this.fdLine.visible = show && !g.conversion && g.firstX > 0 && g.firstX < 100;
    this.losLine.position.set(g.losX, 0.03, MID);
    this.fdLine.position.set(g.firstX, 0.03, MID);
    var self = this;
    [0, 1].forEach(function (i) {
      var c = g.ctl && g.ctl[i], p = c && c.pl;
      var vis = !!(p && g.players.indexOf(p) >= 0 && g.phase !== 'anim');
      self.ctlRings[i].visible = vis; self.ctlDiscs[i].visible = vis;
      if (vis) {
        var col = c.slot === 0 ? '#2ee6ff' : '#ff8a1f';
        self.ctlRings[i].material.color.set(col); self.ctlDiscs[i].material.color.set(col);
        self.ctlRings[i].position.set(p.x, 0.04, p.y); self.ctlDiscs[i].position.set(p.x, 0.035, p.y);
      }
    });
    var tg = g.passTarget;
    this.targetRing.visible = !!tg;
    if (tg) { var s = 1 + ((this.time * 3) % 1) * 0.6; this.targetRing.scale.set(s, s, s); this.targetRing.position.set(tg.x, 0.045, tg.y); this.targetRing.material.opacity = 1 - ((this.time * 3) % 1) * 0.8; }
    var b = g.ball;
    this.landRing.visible = b.state === 'air' && (b.kind === 'pass' || b.kind === 'kick');
    if (this.landRing.visible) this.landRing.position.set(b.tx, 0.045, b.ty);
  };

  // ------------------------------------------------------------ weather
  R.setWeather = function (w) {
    this.weather = w || 'clear';
    var S = this.scene;
    if (!this.wx) {
      var n = this.quality === 'high' ? 4000 : 1800, pos = new Float32Array(n * 3);
      var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
      this.wxMat = new T.PointsMaterial({ color: '#ffffff', size: 0.12, transparent: true, opacity: 0.7, depthWrite: false });
      this.wx = new T.Points(g, this.wxMat); this.wx.frustumCulled = false;
      this.wxN = n; this.wxPos = pos;
      for (var i = 0; i < n; i++) { pos[i * 3] = rnd(-30, 30); pos[i * 3 + 1] = rnd(0, 25); pos[i * 3 + 2] = rnd(-30, 30); }
      S.add(this.wx);
    }
    this.wx.visible = w === 'rain' || w === 'snow';
    this.wxMat.size = w === 'snow' ? 0.18 : 0.07;
    this.wxMat.color.set(w === 'snow' ? '#ffffff' : '#a9c4ff');
    this.wxMat.opacity = w === 'snow' ? 0.9 : 0.55;
    S.fog.near = w === 'fog' ? 12 : 160; S.fog.far = w === 'fog' ? 95 : 520;
    S.fog.color.set(w === 'fog' ? '#3a4152' : '#0a0c1c');
    this.fieldMat.roughness = w === 'rain' ? 0.45 : 0.88;
    this.fieldMat.color.set(w === 'snow' ? '#e6ecf2' : w === 'rain' ? '#c9d4c9' : '#ffffff');
    this.gl.toneMappingExposure = w === 'rain' ? 0.92 : w === 'fog' ? 0.98 : 1.05;
  };

  R.updateWeather = function (dt) {
    if (!this.wx || !this.wx.visible) return;
    var p = this.wxPos, n = this.wxN, snow = this.weather === 'snow', t = this.time;
    var cx = this.camera.position.x, cz = this.camera.position.z;
    for (var i = 0; i < n; i++) {
      var k = i * 3;
      p[k + 1] -= dt * (snow ? 2.2 : 26);
      if (snow) { p[k] += Math.sin(t + i) * dt * 0.6; p[k + 2] += Math.cos(t * 0.7 + i) * dt * 0.6; }
      else p[k] += dt * 2.5;
      if (p[k + 1] < 0) { p[k + 1] = rnd(18, 25); p[k] = rnd(-30, 30); p[k + 2] = rnd(-30, 30); }
    }
    this.wx.position.set(cx, 0, cz);
    this.wx.geometry.attributes.position.needsUpdate = true;
  };

  R.drawReplayBug = function (age, skipText) { this.hud.drawReplayBug(age, skipText); };

  R.project = function (x, y, z) {
    tmpV.set(x, z, y).project(this.camera);
    if (tmpV.z > 1 || tmpV.z < -1) return null;
    return { x: (tmpV.x + 1) / 2 * this.W, y: (1 - tmpV.y) / 2 * this.H };
  };

  R.drawTags = function (g) {
    var ctx = this.hud.ctx, self = this;
    g.players.forEach(function (p) {
      var show = p.ctl >= 0 || g.passTarget === p || (g.ball.holder === p && g.phase === 'live');
      if (!show || !p.info.name) return;
      var s = self.project(p.x, p.y, 2.45 + (p.z || 0));
      if (!s) return;
      var name = p.info.name.split(' ').slice(-1)[0].toUpperCase();
      if (/^(JR\.|II|III|IV|SR\.)$/.test(name)) name = p.info.name.split(' ').slice(-2, -1)[0].toUpperCase();
      var col = p.ctl === 0 ? '#2ee6ff' : p.ctl === 1 ? '#ff8a1f' : '#ffe14a';
      ctx.font = '700 12px "Russo One", "Arial Black", sans-serif';
      var w = ctx.measureText(name).width + 14, y = s.y - 6;
      ctx.fillStyle = 'rgba(8,10,24,0.82)';
      FB.roundRect(ctx, s.x - w / 2, y - 17, w, 19, 5); ctx.fill();
      ctx.fillStyle = col; ctx.fillRect(s.x - w / 2, y + 1, w, 2);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(name, s.x, y - 7);
      if (p.ctl >= 0) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(s.x - 5, y + 4); ctx.lineTo(s.x + 5, y + 4); ctx.lineTo(s.x, y + 9); ctx.fill(); }
    });
  };

  // ------------------------------------------------------ FX API (main.js)
  R.spawn = function (x, y, z, o) {
    o = o || {};
    var p = { x: x, y: y, z: z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life || 0.6, max: o.life || 0.6, color: o.color || '#fff', size: (o.size || 0.12) * 1.6, fire: !!o.fire, grav: o.grav == null ? 16 : o.grav };
    (o.fire || o.glow ? this.glow : this.solid).spawn(p);
  };
  R.burst = function (x, y, z, n, colors, speed, size) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, s = speed * (0.4 + Math.random() * 0.8);
      this.spawn(x, y, z, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: Math.random() * speed, life: 0.5 + Math.random() * 0.6, color: colors[(Math.random() * colors.length) | 0], size: size || 0.1, glow: Math.random() < 0.3 });
    }
  };
  R.confetti = function (x, y, colors) {
    for (var i = 0; i < 160; i++) {
      this.solid.spawn({ x: x + rnd(-6, 6), y: y + rnd(-6, 6), z: rnd(6, 12), vx: rnd(-1.5, 1.5), vy: rnd(-1.5, 1.5), vz: rnd(-1, 2), life: rnd(2, 3.5), max: 3.5, color: colors[(Math.random() * colors.length) | 0], size: 0.13, grav: 2.2 });
    }
  };
  R.cheer = function (amount) { this.crowdTarget = Math.max(this.crowdTarget || 0, 0.05 + amount * 0.45); };
  R.notify = function (type, data) { if (type === 'throw' && data && data.p) { var i = this._g ? this._g.players.indexOf(data.p) : -1; if (i >= 0) this.models[i].throwT = 0.32; } };
  R.banner = function (t, o) { this.hud.banner(t, o); };
  R.drawBanners = function (dt) { this.hud.drawBanners(dt); };
  R.drawHUD = function (g, o) { this.hud.drawHUD(g, o); };
  R.reset = function () { this.hud.banners = []; this.glow.list = []; this.solid.list = []; this.cam.init = false; this.crowdTarget = 0.05; this.jumboMsg = ''; };

  // ------------------------------------------- team select showcase scene
  R.renderShowcase = function (t0, t1, dt) {
    this.time += dt;
    this.setTeams(t0, t1);
    var self = this;
    if (!this.show) {
      this.show = [new PlayerModel(this.mats), new PlayerModel(this.mats)];
      this.show.forEach(function (m) { self.scene.add(m.root); });
    }
    this.showing = true;
    this.models.forEach(function (m) { m.root.visible = false; });
    this.ball.visible = false;
    this.glow.list = []; this.solid.list = []; this.glow.update(0); this.solid.update(0);
    [this.losLine, this.fdLine, this.targetRing, this.landRing].concat(this.ctlRings, this.ctlDiscs).forEach(function (o) { o.visible = false; });
    var teams = [t0, t1];
    this.show.forEach(function (m, i) {
      m.root.visible = true;
      if (m.teamAbbr !== teams[i].abbr) { m.seed = i * 0.37; m.setTeam(teams[i], i === 0 ? 1 : 3, false, 1.0); }
      m.root.position.set(50 + (i === 0 ? 0 : 0.6), 0, MID + (i === 0 ? -0.95 : 0.95));
      m.root.rotation.y = -Math.PI / 2 + (i === 0 ? 0.3 : -0.3);
      var t = self.time + i;
      var tp = blankPose();
      tp.lean = 0.04 + Math.sin(t * 1.6) * 0.02;
      tp.tL = -0.08; tp.tR = 0.12; tp.kL = 0.15; tp.kR = 0.1;
      // arms folded / helmet-tucked hero pose
      tp.aL = { p: 0.06 + Math.sin(t * 1.6) * 0.03, r: 0.24, e: -0.38 }; tp.aR = { p: 0.02, r: 0.22, e: -0.32 };
      m.apply(tp, dt, false);
      m.head.rotation.y = Math.sin(t * 0.7) * 0.25;
      var hs = FB.cheats && FB.cheats.bigHeads ? 1.9 : 1;
      m.head.scale.set(hs, hs, hs);
    });
    var a = this.time * 0.18;
    this.camera.position.set(50 - 7.6 + Math.sin(a) * 0.6, 1.45 + Math.sin(a * 0.7) * 0.15, MID + Math.sin(a) * 1.6);
    this.camera.lookAt(50.3, 1.15, MID);
    this.camera.fov = this.baseFov; this.camera.updateProjectionMatrix();
    this.key.position.set(60, 60, MID + 40); this.key.target.position.set(50, 0, MID);
    this.crowdUniforms.uTime.value = this.time;
    this.crowdUniforms.uAmp.value = 0.12;
    this.ribbonTex.offset.x = (this.ribbonTex.offset.x + dt * 0.02) % 1;
    if (this.composer) this.composer.render(dt); else this.gl.render(this.scene, this.camera);
    this.hud.clear();
  };
  R.endShowcase = function () {
    if (!this.showing) return;
    this.showing = false;
    this.show.forEach(function (m) { m.root.visible = false; });
    this.cam.init = false;
  };

  // Try to create a 3D renderer; returns null if WebGL is unavailable.
  FB.createRenderer3D = function (glCanvas, hudCanvas, quality) {
    if (!T) return null;
    try {
      var test = document.createElement('canvas');
      if (!(test.getContext('webgl2') || test.getContext('webgl'))) return null;
      return new Renderer3D(glCanvas, hudCanvas, quality);
    } catch (e) {
      if (window.console) console.warn('3D renderer unavailable, using 2D', e);
      return null;
    }
  };
})();
