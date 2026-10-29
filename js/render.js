/*
 * Football Blitz '26 — renderer.
 *
 * A pseudo-3D broadcast camera sits behind the offense, so "up" on the screen
 * is always downfield for the team with the ball. Everything is drawn with
 * Canvas 2D: no sprites or image assets are needed.
 */
(function () {
  var FB = (window.FB = window.FB || {});
  var FW = 53.333, MID = FW / 2;
  var NEAR = 0.6;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 50, y: MID, dir: 1, H: 10.5, B: 14, init: false };
    this.particles = [];
    this.banners = [];
    this.flash = 0;
    this.shake = 0;
    this.crowd = this.makeCrowd();
    this.resize();
  }
  FB.Renderer = Renderer;
  var R = Renderer.prototype;

  R.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.W = w; this.H = h; this.dpr = dpr;
  };

  R.makeCrowd = function () {
    var c = document.createElement('canvas');
    c.width = 160; c.height = 60;
    var x = c.getContext('2d');
    x.fillStyle = '#0d1022'; x.fillRect(0, 0, 160, 60);
    var cols = ['#e8e8f0', '#d02b3a', '#2b62d0', '#f2c230', '#1f9a5a', '#ff7a1f', '#7a3cff', '#ffffff', '#3b3f5c', '#5c3b3b'];
    for (var i = 0; i < 900; i++) {
      x.fillStyle = cols[(Math.random() * cols.length) | 0];
      x.globalAlpha = 0.35 + Math.random() * 0.55;
      x.fillRect((Math.random() * 160) | 0, (Math.random() * 60) | 0, 2, 2);
    }
    x.globalAlpha = 1;
    return c;
  };

  // ------------------------------------------------------------ camera
  R.updateCamera = function (g, dt) {
    var cam = this.cam;
    var b = g.ball, fx, fy, H = 10.5, B = 14;
    if (g.phase === 'select' || g.phase === 'presnap' || g.phase === 'pat') {
      fx = g.losX + g.dir * 7; fy = MID + (b.y - MID) * 0.3;
      if (g.playType === 'kickoff') { fx = FB.Game.ownGoal(g.poss) + g.dir * 24; H = 12; B = 20; }
    } else if (g.phase === 'anim' && g.kickAnim) {
      fx = b.x; fy = b.y; H = 12.5; B = 17;
    } else {
      fx = b.x; fy = b.y;
      if (b.state === 'air' && b.kind === 'pass') { fx = lerp(b.x, b.tx, 0.4); fy = lerp(b.y, b.ty, 0.4); H = 12; B = 16; }
      if (g.playType === 'kickoff' && b.state === 'air') { fx = lerp(b.tx, b.x, 0.45); H = 12; B = 20; }
      fx += g.dir * 4;
    }
    fy = clamp(fy, 15, FW - 15);
    var k = 1 - Math.exp(-dt * 4.5);
    if (!cam.init || cam.dir !== g.dir) { cam.x = fx; cam.y = fy; cam.dir = g.dir; cam.H = H; cam.B = B; cam.init = true; }
    cam.x = lerp(cam.x, fx, k); cam.y = lerp(cam.y, fy, k);
    cam.H = lerp(cam.H, H, k * 0.6); cam.B = lerp(cam.B, B, k * 0.6);
    this.shake = Math.max(0, this.shake - dt * 3);
    this.flash = Math.max(0, this.flash - dt * 2.5);
  };

  R.setupProjection = function () {
    var cam = this.cam;
    this.pitch = Math.atan2(cam.H, cam.B + 6);
    this.cp = Math.cos(this.pitch); this.sp = Math.sin(this.pitch);
    this.f = Math.min(this.H * 1.2, this.W * 0.95);
    this.cx = this.W / 2;
    this.cy = this.H * 0.5;
    this.camX = cam.x - cam.dir * cam.B;
    this.camY = cam.y;
    if (this.shake > 0) { this.cx += (Math.random() - 0.5) * this.shake * 14; this.cy += (Math.random() - 0.5) * this.shake * 10; }
  };

  // world -> camera space
  R.toCam = function (x, y, z) {
    var d = this.cam.dir;
    var X = (x - this.camX) * d, Y = (y - this.camY) * d, Z = (z || 0) - this.cam.H;
    return { d: X * this.cp - Z * this.sp, u: X * this.sp + Z * this.cp, r: Y };
  };
  R.camToScreen = function (c) {
    return { x: this.cx + this.f * c.r / c.d, y: this.cy - this.f * c.u / c.d, s: this.f / c.d, d: c.d };
  };
  R.project = function (x, y, z) {
    var c = this.toCam(x, y, z);
    if (c.d < NEAR) return null;
    return this.camToScreen(c);
  };

  // Clip a world polygon against the near plane, return screen points.
  R.polyScreen = function (pts) {
    var cs = pts.map(function (p) { return this.toCam(p[0], p[1], p[2] || 0); }, this);
    var out = [];
    for (var i = 0; i < cs.length; i++) {
      var a = cs[i], b = cs[(i + 1) % cs.length];
      var ain = a.d >= NEAR, bin = b.d >= NEAR;
      if (ain) out.push(a);
      if (ain !== bin) {
        var t = (NEAR - a.d) / (b.d - a.d);
        out.push({ d: NEAR, u: a.u + (b.u - a.u) * t, r: a.r + (b.r - a.r) * t });
      }
    }
    return out.map(this.camToScreen, this);
  };

  R.fillPoly = function (pts, style) {
    var s = this.polyScreen(pts);
    if (s.length < 3) return;
    var ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(s[0].x, s[0].y);
    for (var i = 1; i < s.length; i++) ctx.lineTo(s[i].x, s[i].y);
    ctx.closePath();
    ctx.fillStyle = style;
    ctx.fill();
  };

  R.line3 = function (x1, y1, z1, x2, y2, z2, color, widthYds, minPx) {
    var a = this.toCam(x1, y1, z1), b = this.toCam(x2, y2, z2);
    if (a.d < NEAR && b.d < NEAR) return;
    if (a.d < NEAR) { var t = (NEAR - a.d) / (b.d - a.d); a = { d: NEAR, u: a.u + (b.u - a.u) * t, r: a.r + (b.r - a.r) * t }; }
    if (b.d < NEAR) { var t2 = (NEAR - b.d) / (a.d - b.d); b = { d: NEAR, u: b.u + (a.u - b.u) * t2, r: b.r + (a.r - b.r) * t2 }; }
    var A = this.camToScreen(a), B = this.camToScreen(b);
    // draw as a screen-space trapezoid so the width follows perspective along the line
    var dx = B.x - A.x, dy = B.y - A.y, l = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / l, ny = dx / l;
    var wa = Math.max(minPx || 1, widthYds * A.s) / 2, wb = Math.max(minPx || 1, widthYds * B.s) / 2;
    var ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(A.x + nx * wa, A.y + ny * wa); ctx.lineTo(B.x + nx * wb, B.y + ny * wb);
    ctx.lineTo(B.x - nx * wb, B.y - ny * wb); ctx.lineTo(A.x - nx * wa, A.y - ny * wa);
    ctx.closePath(); ctx.fill();
  };

  // A painted line lying on the turf (true perspective width).
  R.groundLine = function (x1, y1, x2, y2, widthYds, color) {
    var dx = x2 - x1, dy = y2 - y1, l = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / l * widthYds / 2, ny = dx / l * widthYds / 2;
    this.fillPoly([[x1 + nx, y1 + ny, 0.01], [x2 + nx, y2 + ny, 0.01], [x2 - nx, y2 - ny, 0.01], [x1 - nx, y1 - ny, 0.01]], color);
  };

  // Draw text lying flat on the turf using a local affine approximation.
  R.groundText = function (text, x, y, sizeYds, color) {
    var d = this.cam.dir;
    var ux = 0, uy = d;     // text x-axis: screen right
    var vx = -d, vy = 0;    // text y-axis: toward the camera
    var o = this.project(x, y, 0.01);
    var a = this.project(x + ux, y + uy, 0.01);
    var b = this.project(x + vx, y + vy, 0.01);
    if (!o || !a || !b || o.s < 3) return;
    var ctx = this.ctx;
    ctx.save();
    var k = this.dpr / 20; // text is laid out at 20 units per yard
    ctx.setTransform(k * (a.x - o.x), k * (a.y - o.y), k * (b.x - o.x), k * (b.y - o.y), this.dpr * o.x, this.dpr * o.y);
    ctx.fillStyle = color;
    ctx.font = '900 ' + Math.round(sizeYds * 20) + 'px "Russo One", "Arial Black", Impact, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };

  // ------------------------------------------------------------- frame
  R.render = function (g, dt) {
    var ctx = this.ctx;
    this.updateCamera(g, dt);
    this.setupProjection();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawBackground(g);
    this.drawField(g);
    this.drawMarkers(g);
    this.drawToken(g);
    this.drawEntities(g, dt);
    this.updateParticles(dt, g);
    if (this.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (this.flash * 0.35) + ')'; ctx.fillRect(0, 0, this.W, this.H); }
    this.drawWeather(dt);
  };

  R.drawWeather = function (dt) {
    var w = this.weather, ctx = this.ctx;
    if (!w || w === 'clear') return;
    if (w === 'fog') { ctx.fillStyle = 'rgba(160,170,190,0.28)'; ctx.fillRect(0, 0, this.W, this.H); return; }
    this.wxT = (this.wxT || 0) + dt;
    ctx.save();
    ctx.strokeStyle = w === 'rain' ? 'rgba(180,200,255,0.45)' : 'rgba(255,255,255,0.85)';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1;
    for (var i = 0; i < 160; i++) {
      var sx = (i * 97.3 + this.wxT * (w === 'rain' ? 120 : 15)) % this.W;
      var sy = (i * 61.7 + this.wxT * (w === 'rain' ? 900 : 60) * (0.6 + (i % 5) * 0.1)) % this.H;
      if (w === 'rain') { ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 3, sy + 14); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(sx, sy, 1.6 + (i % 3), 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  };

  R.drawBackground = function (g) {
    var ctx = this.ctx, W = this.W, H = this.H;
    var horizon = this.cy - this.f * Math.tan(this.pitch);
    var grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#05060f');
    grd.addColorStop(clamp(horizon / H, 0.01, 0.99), '#1a1440');
    grd.addColorStop(1, '#0b0b18');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
    // stadium light glows
    for (var i = 0; i < 6; i++) {
      var lx = W * (0.08 + i * 0.168), ly = Math.max(14, horizon - 60);
      var rg = ctx.createRadialGradient(lx, ly, 0, lx, ly, 70);
      rg.addColorStop(0, 'rgba(255,255,235,0.55)'); rg.addColorStop(1, 'rgba(255,255,235,0)');
      ctx.fillStyle = rg; ctx.fillRect(lx - 70, ly - 70, 140, 140);
    }
    // crowd walls behind the end lines and along the sidelines
    var pat = this.crowdPat || (this.crowdPat = ctx.createPattern(this.crowd, 'repeat'));
    var walls = [
      [[-14, -10, 0], [-14, 64, 0], [-14, 64, 9], [-14, -10, 9]],
      [[114, -10, 0], [114, 64, 0], [114, 64, 9], [114, -10, 9]],
      [[-14, -9, 0], [114, -9, 0], [114, -12, 9], [-14, -12, 9]],
      [[-14, 62.3, 0], [114, 62.3, 0], [114, 65.3, 9], [-14, 65.3, 9]]
    ];
    var self = this;
    walls.forEach(function (w) { self.fillPoly(w, pat); });
    walls.forEach(function (w) { self.fillPoly([w[0], w[1], [w[1][0], w[1][1], 1.1], [w[0][0], w[0][1], 1.1]], '#151a35'); });
  };

  R.drawField = function (g) {
    var self = this, t0 = g.teams[0], t1 = g.teams[1];
    // surrounding turf
    this.fillPoly([[-14, -9, 0], [114, -9, 0], [114, 62.3, 0], [-14, 62.3, 0]], '#1d5a2a');
    // stripes
    for (var x = 0; x < 100; x += 5) {
      this.fillPoly([[x, 0, 0], [x + 5, 0, 0], [x + 5, FW, 0], [x, FW, 0]], (x / 5) % 2 ? '#2f8a3c' : '#2a7f37');
    }
    // end zones (each painted in the colors of the team defending it)
    this.fillPoly([[-10, 0, 0], [0, 0, 0], [0, FW, 0], [-10, FW, 0]], t0.c.jersey === '#F4F4F4' ? t0.c.trim : t0.c.jersey);
    this.fillPoly([[100, 0, 0], [110, 0, 0], [110, FW, 0], [100, FW, 0]], t1.c.jersey === '#F4F4F4' ? t1.c.trim : t1.c.jersey);
    this.groundText(t0.name.toUpperCase(), -5, MID, 4.2, 'rgba(255,255,255,0.9)');
    this.groundText(t1.name.toUpperCase(), 105, MID, 4.2, 'rgba(255,255,255,0.9)');
    // midfield logo
    var ring = [];
    for (var i = 0; i < 28; i++) { var a = i / 28 * Math.PI * 2; ring.push([50 + Math.cos(a) * 6, MID + Math.sin(a) * 6, 0]); }
    this.fillPoly(ring, 'rgba(10,20,40,0.55)');
    this.groundText('FB', 50, MID, 6, 'rgba(255,214,64,0.9)');
    // lines
    var W = 'rgba(255,255,255,0.92)';
    this.groundLine(-10, -0.15, 110, -0.15, 0.3, W);
    this.groundLine(-10, FW + 0.15, 110, FW + 0.15, 0.3, W);
    this.groundLine(-10, 0, -10, FW, 0.3, W);
    this.groundLine(110, 0, 110, FW, 0.3, W);
    for (var yl = 0; yl <= 100; yl += 5) this.groundLine(yl, 0, yl, FW, yl % 50 === 0 ? 0.3 : 0.18, W);
    var H = 'rgba(255,255,255,0.7)';
    for (var hy = 1; hy < 100; hy++) {
      if (hy % 5 === 0) continue;
      var c = this.toCam(hy, MID, 0);
      if (c.d < NEAR || c.d > 70) continue; // hash marks only where they are readable
      this.groundLine(hy, 0.5, hy, 1.5, 0.12, H);
      this.groundLine(hy, FW - 1.5, hy, FW - 0.5, 0.12, H);
      this.groundLine(hy, 23.6, hy, 24.3, 0.12, H);
      this.groundLine(hy, 29.0, hy, 29.7, 0.12, H);
    }
    for (var n = 10; n <= 90; n += 10) {
      var label = String(n <= 50 ? n : 100 - n);
      this.groundText(label, n, 7, 2.2, 'rgba(255,255,255,0.85)');
      this.groundText(label, n, FW - 7, 2.2, 'rgba(255,255,255,0.85)');
    }
    // goal posts
    [-10, 110].forEach(function (gx) {
      var Y = '#ffd84a';
      self.line3(gx, MID, 0, gx, MID, 3.3, Y, 0.25, 2);
      self.line3(gx, MID - 3.08, 3.3, gx, MID + 3.08, 3.3, Y, 0.18, 2);
      self.line3(gx, MID - 3.08, 3.3, gx, MID - 3.08, 13, Y, 0.14, 1.5);
      self.line3(gx, MID + 3.08, 3.3, gx, MID + 3.08, 13, Y, 0.14, 1.5);
    });
  };

  R.drawToken = function (g) {
    var t = g.token;
    if (!t) return;
    var sc = this.project(t.x, t.y, 1.2), ctx = this.ctx;
    if (!sc) return;
    var col = (FB.POWER_COLORS || {})[t.type] || '#fff', r = Math.max(5, sc.s * 0.4);
    ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(sc.x, sc.y - r); ctx.lineTo(sc.x + r * 0.7, sc.y); ctx.lineTo(sc.x, sc.y + r); ctx.lineTo(sc.x - r * 0.7, sc.y); ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  R.drawMarkers = function (g) {
    if (g.phase === 'final' || g.playType === 'kickoff' || g.phase === 'anim' || g.phase === 'break') return;
    var los = g.losX;
    this.fillPoly([[los - 0.18, 0, 0.02], [los + 0.18, 0, 0.02], [los + 0.18, FW, 0.02], [los - 0.18, FW, 0.02]], 'rgba(60,140,255,0.85)');
    if (!g.conversion && g.firstX > 0 && g.firstX < 100) {
      var fx = g.firstX;
      this.fillPoly([[fx - 0.18, 0, 0.02], [fx + 0.18, 0, 0.02], [fx + 0.18, FW, 0.02], [fx - 0.18, FW, 0.02]], 'rgba(255,220,40,0.9)');
    }
  };

  // ---------------------------------------------------------- entities
  R.drawEntities = function (g, dt) {
    var self = this, list = [];
    g.players.forEach(function (p) {
      var s = self.project(p.x, p.y, 0);
      if (s) list.push({ kind: 'p', p: p, s: s });
    });
    var b = g.ball;
    if (b && !(b.state === 'held' && b.holder)) {
      var bs = self.project(b.x, b.y, b.z);
      var sh = self.project(b.x, b.y, 0);
      if (bs && sh) list.push({ kind: 'b', s: bs, sh: sh });
    }
    list.sort(function (a, c) { return c.s.d - a.s.d; });
    // shadows first
    var ctx = this.ctx;
    list.forEach(function (e) {
      var s = e.kind === 'p' ? e.s : e.sh;
      var r = e.kind === 'p' ? 0.5 : 0.25;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(s.x, s.y, r * s.s, r * s.s * 0.38, 0, 0, Math.PI * 2); ctx.fill();
    });
    // markers under feet
    list.forEach(function (e) { if (e.kind === 'p') self.drawFootMarker(g, e.p, e.s); });
    list.forEach(function (e) {
      if (e.kind === 'p') self.drawPlayer(g, e.p, e.s);
      else self.drawBall(g, e.s);
    });
    list.forEach(function (e) { if (e.kind === 'p') self.drawTag(g, e.p, e.s); });
    if (b && b.state === 'air' && b.kind === 'pass') {
      var L = self.project(b.tx, b.ty, 0);
      if (L) {
        ctx.strokeStyle = 'rgba(255,240,120,0.75)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(L.x, L.y, 0.9 * L.s, 0.9 * L.s * 0.38, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
  };

  R.drawFootMarker = function (g, p, s) {
    var ctx = this.ctx;
    if (p.ctl >= 0) {
      var col = p.ctl === 0 ? '#2ee6ff' : '#ff8a1f';
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, s.s * 0.12);
      ctx.beginPath(); ctx.ellipse(s.x, s.y, 0.75 * s.s, 0.75 * s.s * 0.38, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = col + '33'; ctx.fill();
    }
    if (g.passTarget === p) {
      var t = (g.time * 4) % 1;
      ctx.strokeStyle = 'rgba(255,230,60,' + (1 - t) + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, (0.6 + t * 0.7) * s.s, (0.6 + t * 0.7) * s.s * 0.38, 0, 0, Math.PI * 2); ctx.stroke();
    }
  };

  R.teamColors = function (g, team) { return g.teams[team].c; };

  R.drawPlayer = function (g, p, s) {
    var ctx = this.ctx, c = this.teamColors(g, p.team);
    var u = s.s * 0.98; // pixels per yard
    if (u < 1.2) return;
    var x = s.x, y = s.y - p.z * u;
    var d = this.cam.dir;
    var fx = Math.cos(p.face) * d, fy = Math.sin(p.face) * d; // fx>0: facing away from camera; fy: screen right
    var big = p.role === 'OL0' || p.role === 'OL1' || p.info.arch === 'DT' || p.info.pos === 'DL';
    var wScale = big ? 1.18 : 1;
    ctx.save();
    ctx.translate(x, y);
    if (p.state === 'down' || p.state === 'dive') {
      var ang = p.state === 'dive' ? 1.2 : 1.45;
      ctx.rotate(fy >= 0 ? ang : -ang);
      ctx.translate(0, -0.15 * u);
    }
    if (p.spinT > 0) ctx.scale(Math.cos(p.spinT / 0.45 * Math.PI * 2), 1);
    var spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    var sw = Math.sin(p.anim * 2.4) * Math.min(1, spd / 4);
    var lw = 0.2 * u * wScale;
    ctx.lineCap = 'round';
    // legs
    ctx.strokeStyle = c.pants; ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(-0.12 * u * wScale, -0.92 * u); ctx.lineTo((-0.14 + sw * 0.22) * u, -0.08 * u - Math.max(0, sw) * 0.15 * u);
    ctx.moveTo(0.12 * u * wScale, -0.92 * u); ctx.lineTo((0.14 - sw * 0.22) * u, -0.08 * u - Math.max(0, -sw) * 0.15 * u);
    ctx.stroke();
    // socks/cleats
    ctx.strokeStyle = '#111'; ctx.lineWidth = lw * 0.9;
    ctx.beginPath();
    ctx.moveTo((-0.14 + sw * 0.22) * u, -0.2 * u - Math.max(0, sw) * 0.15 * u); ctx.lineTo((-0.14 + sw * 0.22) * u, -0.06 * u - Math.max(0, sw) * 0.15 * u);
    ctx.moveTo((0.14 - sw * 0.22) * u, -0.2 * u - Math.max(0, -sw) * 0.15 * u); ctx.lineTo((0.14 - sw * 0.22) * u, -0.06 * u - Math.max(0, -sw) * 0.15 * u);
    ctx.stroke();
    // pants block
    ctx.fillStyle = c.pants;
    ctx.fillRect(-0.24 * u * wScale, -1.08 * u, 0.48 * u * wScale, 0.24 * u);
    // arms
    ctx.strokeStyle = c.jersey; ctx.lineWidth = lw * 0.95;
    ctx.beginPath();
    ctx.moveTo(-0.3 * u * wScale, -1.48 * u); ctx.lineTo((-0.42 - sw * 0.12) * u * wScale, -1.0 * u);
    ctx.moveTo(0.3 * u * wScale, -1.48 * u); ctx.lineTo((0.42 + sw * 0.12) * u * wScale, -1.0 * u);
    ctx.stroke();
    ctx.fillStyle = '#5a3a26';
    ctx.beginPath(); ctx.arc((-0.42 - sw * 0.12) * u * wScale, -0.98 * u, 0.07 * u, 0, 7); ctx.arc((0.42 + sw * 0.12) * u * wScale, -0.98 * u, 0.07 * u, 0, 7); ctx.fill();
    // torso with shoulder pads
    ctx.fillStyle = c.jersey;
    ctx.beginPath();
    ctx.moveTo(-0.38 * u * wScale, -1.56 * u);
    ctx.lineTo(0.38 * u * wScale, -1.56 * u);
    ctx.lineTo(0.27 * u * wScale, -1.02 * u);
    ctx.lineTo(-0.27 * u * wScale, -1.02 * u);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = Math.max(1, u * 0.03); ctx.stroke();
    // sleeve/shoulder trim stripes
    ctx.strokeStyle = c.trim; ctx.lineWidth = Math.max(1, 0.06 * u);
    ctx.beginPath();
    ctx.moveTo(-0.36 * u * wScale, -1.42 * u); ctx.lineTo(-0.22 * u * wScale, -1.5 * u);
    ctx.moveTo(0.36 * u * wScale, -1.42 * u); ctx.lineTo(0.22 * u * wScale, -1.5 * u);
    ctx.stroke();
    // chest band
    ctx.fillStyle = c.trim;
    ctx.fillRect(-0.22 * u * wScale, -1.3 * u, 0.44 * u * wScale, 0.07 * u);
    // helmet
    var hx = fy * 0.05 * u, hy = -1.78 * u, hr = 0.23 * u * (FB.cheats && FB.cheats.bigHeads ? 1.8 : 1);
    ctx.fillStyle = c.helmet;
    ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = Math.max(1, u * 0.03); ctx.stroke();
    ctx.strokeStyle = c.stripe; ctx.lineWidth = Math.max(1, 0.06 * u);
    ctx.beginPath(); ctx.moveTo(hx, hy - hr); ctx.lineTo(hx, hy + hr * 0.2); ctx.stroke();
    if (fx < 0.3) {
      // facemask visible
      var mx = hx + fy * hr * 0.55;
      ctx.strokeStyle = '#c9ccd4'; ctx.lineWidth = Math.max(1, 0.045 * u);
      ctx.beginPath();
      ctx.moveTo(mx - hr * 0.55, hy + hr * 0.15); ctx.lineTo(mx + hr * 0.55, hy + hr * 0.15);
      ctx.moveTo(mx - hr * 0.5, hy + hr * 0.45); ctx.lineTo(mx + hr * 0.5, hy + hr * 0.45);
      ctx.stroke();
    }
    // carried ball
    var b = g.ball;
    if (b && b.holder === p && (b.state === 'held' || b.state === 'dead-held')) {
      ctx.fillStyle = '#7a3f17';
      ctx.beginPath(); ctx.ellipse((0.28 + fy * 0.1) * u, -1.18 * u, 0.17 * u, 0.1 * u, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, 0.025 * u);
      ctx.beginPath(); ctx.moveTo((0.22 + fy * 0.1) * u, -1.2 * u); ctx.lineTo((0.33 + fy * 0.1) * u, -1.16 * u); ctx.stroke();
    }
    ctx.restore();
    // on fire
    if (g.fire[p.team] && Math.random() < 0.5 && (p.ctl >= 0 || (b && b.holder === p))) {
      this.spawn(p.x + (Math.random() - 0.5) * 0.5, p.y + (Math.random() - 0.5) * 0.5, 0.2 + Math.random() * 1.6, { vz: 2 + Math.random() * 2, life: 0.45, color: Math.random() < 0.5 ? '#ff6a00' : '#ffd000', size: 0.09, fire: true });
    }
  };

  R.drawTag = function (g, p, s) {
    var show = p.ctl >= 0 || g.passTarget === p || (g.ball.holder === p && g.phase === 'live');
    if (!show || !p.info.name) return;
    var ctx = this.ctx, u = s.s;
    var y = s.y - (2.25 + p.z) * u - 6;
    var name = p.info.name.split(' ').slice(-1)[0].toUpperCase();
    if (/^(JR\.|II|III|IV|SR\.)$/.test(name)) name = p.info.name.split(' ').slice(-2, -1)[0].toUpperCase();
    ctx.font = '700 12px "Russo One", "Arial Black", sans-serif';
    var w = ctx.measureText(name).width + 12;
    var col = p.ctl === 0 ? '#2ee6ff' : p.ctl === 1 ? '#ff8a1f' : '#ffe14a';
    ctx.fillStyle = 'rgba(8,10,24,0.78)';
    roundRect(ctx, s.x - w / 2, y - 16, w, 18, 5); ctx.fill();
    ctx.fillStyle = col; ctx.fillRect(s.x - w / 2, y + 1, w, 2);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(name, s.x, y - 7);
    if (p.ctl >= 0) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(s.x - 5, y + 4); ctx.lineTo(s.x + 5, y + 4); ctx.lineTo(s.x, y + 9); ctx.fill();
    }
  };

  R.drawBall = function (g, s) {
    var ctx = this.ctx, u = s.s;
    var b = g.ball;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(b.state === 'air' || b.state === 'kick' ? b.spin : 0.4);
    ctx.fillStyle = '#7a3f17';
    ctx.beginPath(); ctx.ellipse(0, 0, Math.max(3, 0.19 * u), Math.max(2, 0.11 * u), 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-0.07 * u, 0); ctx.lineTo(0.07 * u, 0); ctx.stroke();
    ctx.restore();
  };

  // ------------------------------------------------------- particles
  R.spawn = function (x, y, z, o) {
    if (this.particles.length > 400) return;
    o = o || {};
    this.particles.push({ x: x, y: y, z: z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life || 0.6, max: o.life || 0.6, color: o.color || '#fff', size: o.size || 0.12, fire: !!o.fire, grav: o.grav == null ? (o.fire ? -2 : 18) : o.grav });
  };

  R.burst = function (x, y, z, n, colors, speed, size) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = speed * (0.4 + Math.random() * 0.8);
      this.spawn(x, y, z, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: Math.random() * speed, life: 0.4 + Math.random() * 0.5, color: colors[(Math.random() * colors.length) | 0], size: size || 0.1 });
    }
  };

  R.updateParticles = function (dt) {
    var ctx = this.ctx, self = this;
    this.particles = this.particles.filter(function (p) {
      p.life -= dt;
      if (p.life <= 0) return false;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= p.grav * dt;
      if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; }
      var s = self.project(p.x, p.y, p.z);
      if (!s) return true;
      var a = p.life / p.max;
      ctx.globalAlpha = p.fire ? a * 0.8 : a;
      ctx.globalCompositeOperation = p.fire ? 'lighter' : 'source-over';
      ctx.fillStyle = p.color;
      var r = Math.max(1, p.size * s.s * (p.fire ? (0.6 + a) : 1));
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      return true;
    });
  };

  // ------------------------------------------------------------- HUD
  R.banner = function (text, opts) {
    opts = opts || {};
    this.banners.push({ text: text, sub: opts.sub || '', color: opts.color || null, band: opts.band || null, t: 0, dur: opts.dur || 1.8, big: opts.big !== false });
    if (this.banners.length > 3) this.banners.shift();
  };

  R.drawBanners = function (dt) {
    var ctx = this.ctx, W = this.W, H = this.H;
    var self = this;
    this.banners = this.banners.filter(function (b) { b.t += dt; return b.t < b.dur; });
    this.banners.forEach(function (b, i) {
      var t = b.t, inT = Math.min(1, t / 0.18), out = Math.max(0, (t - (b.dur - 0.25)) / 0.25);
      var scale = (inT < 1 ? 0.4 + inT * 0.75 : 1.15 - Math.min(0.15, (t - 0.18) * 0.6));
      var size = Math.min(W / (b.text.length * 0.62 + 2), b.big ? 92 : 56);
      var y = H * 0.34 + i * size * 1.05;
      ctx.save();
      ctx.globalAlpha = 1 - out;
      // light-streak band behind the call
      var bandW = W * Math.min(1, inT * 1.4);
      var bg = ctx.createLinearGradient(W / 2 - bandW / 2, 0, W / 2 + bandW / 2, 0);
      bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(0.5, b.band || 'rgba(10,13,31,0.72)'); bg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(W / 2 - bandW / 2, y - size * 0.62, bandW, size * (b.sub ? 1.75 : 1.24));
      ctx.fillStyle = b.color || '#ffb21f';
      ctx.fillRect(W / 2 - bandW * 0.3, y - size * 0.62, bandW * 0.6, 3);
      ctx.translate(W / 2, y);
      ctx.scale(scale, scale);
      ctx.transform(1, 0, -0.18, 1, 0, 0);
      ctx.font = 'italic 900 ' + size + 'px "Russo One", "Arial Black", Impact, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var grd = ctx.createLinearGradient(0, -size * 0.5, 0, size * 0.5);
      if (b.color) { grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.45, b.color); grd.addColorStop(1, '#3a0d00'); }
      else { grd.addColorStop(0, '#fffbe0'); grd.addColorStop(0.42, '#ffd23a'); grd.addColorStop(0.58, '#ff7a00'); grd.addColorStop(1, '#a01800'); }
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.16; ctx.strokeStyle = '#0a0a18'; ctx.strokeText(b.text, 0, 0);
      ctx.lineWidth = size * 0.05; ctx.strokeStyle = '#ffffff'; ctx.strokeText(b.text, 0, 0);
      ctx.fillStyle = grd; ctx.fillText(b.text, 0, 0);
      if (b.sub) {
        ctx.font = 'italic 700 ' + Math.round(size * 0.32) + 'px "Russo One", "Arial Black", sans-serif';
        ctx.lineWidth = 5; ctx.strokeStyle = '#0a0a18'; ctx.strokeText(b.sub, 0, size * 0.72);
        ctx.fillStyle = '#ffffff'; ctx.fillText(b.sub, 0, size * 0.72);
      }
      ctx.restore();
    });
  };

  function ordinal(n) { return ['1ST', '2ND', '3RD', '4TH'][n - 1] || (n + 'TH'); }
  function fmtClock(t) { t = Math.max(0, Math.ceil(t)); var m = Math.floor(t / 60), s = t % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
  FB.fmtClock = fmtClock;

  R.spotText = function (g) {
    var x = g.losX, t = g.poss;
    var yardsFromOwn = Math.min(99, Math.max(1, Math.round((x - FB.Game.ownGoal(t)) * FB.Game.dirOf(t))));
    if (yardsFromOwn === 50) return 'MIDFIELD';
    return yardsFromOwn < 50 ? 'OWN ' + yardsFromOwn : 'OPP ' + (100 - yardsFromOwn);
  };

  R.clear = function () {
    var ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
  };

  R.reset = function () { this.banners = []; this.particles = []; this.cam.init = false; };

  R.setWeather = function (w) { this.weather = w || 'clear'; };

  // "INSTANT REPLAY" bug with letterbox bars.
  R.drawReplayBug = function (age, skipText) {
    var ctx = this.ctx, W = this.W, H = this.H, bar = Math.min(1, age * 4) * H * 0.07;
    ctx.save();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
    var x = 18, y = bar + 14;
    ctx.fillStyle = 'rgba(10,13,31,0.85)'; roundRect(ctx, x, y, 196, 34, 6); ctx.fill();
    ctx.fillStyle = '#ff2d2d'; ctx.fillRect(x, y, 6, 34);
    if (Math.floor(age * 2) % 2 === 0) { ctx.beginPath(); ctx.arc(x + 24, y + 17, 6, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.font = 'italic 900 15px "Russo One", "Arial Black", sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('INSTANT REPLAY', x + 38, y + 18);
    if (skipText && bar > 20) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '700 13px "Russo One", "Arial Black", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(skipText, W / 2, H - bar / 2);
    }
    ctx.restore();
  };

  // Broadcast-style score bug (bottom center, or top when touch controls are showing).
  R.drawHUD = function (g, opts) {
    var ctx = this.ctx, W = this.W, H = this.H;
    opts = opts || {};
    var t0 = g.teams[0], t1 = g.teams[1];
    var font = function (w, px) { return w + ' ' + px + 'px "Russo One", "Arial Black", sans-serif'; };
    var col = function (t) { return t.c.jersey === '#F4F4F4' ? t.c.trim : t.c.jersey; };
    var compact = W < 640;
    var teamW = compact ? 92 : 132, scoreW = compact ? 40 : 52, clockW = compact ? 92 : 118;
    var dd = null;
    if (g.conversion) dd = '2-PT TRY';
    else if (g.playType === 'kickoff') dd = 'KICKOFF';
    else if (g.phase !== 'anim' && g.phase !== 'break' && g.phase !== 'final' && g.phase !== 'pat') {
      dd = ordinal(g.down) + ' & ' + (g.isGoalToGo() ? 'GOAL' : g.toGo());
    }
    ctx.save();
    ctx.font = font('700', 14);
    var ddW = dd ? Math.max(compact ? 90 : 120, ctx.measureText(dd).width + 30) : 0;
    var spot = (dd && dd !== 'KICKOFF' && !compact) ? this.spotText(g) : '';
    var spotW = spot ? ctx.measureText(spot).width + 26 : 0;
    var bw = (teamW + scoreW) * 2 + clockW + ddW + spotW, bh = 42;
    var bx = Math.round((W - bw) / 2), by = opts.top ? 12 : H - bh - 16;
    // shadow + glass base
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#0a0d1f';
    roundRect(ctx, bx, by, bw, bh, 6); ctx.fill();
    ctx.shadowColor = 'transparent';
    var x = bx;
    var self = this;
    [[t0, 0], [t1, 1]].forEach(function (a) {
      var t = a[0], i = a[1];
      // team slab with diagonal sheen
      var grd = ctx.createLinearGradient(x, by, x + teamW, by + bh);
      grd.addColorStop(0, col(t)); grd.addColorStop(1, shade(col(t), -0.35));
      ctx.fillStyle = grd;
      ctx.save(); roundRect(ctx, x, by, teamW + scoreW, bh, i === 0 ? 6 : 0); ctx.clip();
      ctx.fillRect(x, by, teamW, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x + teamW * 0.55, by); ctx.lineTo(x + teamW * 0.35, by + bh); ctx.lineTo(x, by + bh); ctx.fill();
      ctx.fillStyle = t.c.trim; ctx.fillRect(x, by + bh - 4, teamW, 4);
      ctx.fillStyle = '#f4f6ff'; ctx.fillRect(x + teamW, by, scoreW, bh);
      ctx.restore();
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.font = font('italic 900', compact ? 18 : 22);
      ctx.fillText(t.abbr, x + 12, by + bh / 2);
      if (g.fire[i]) { ctx.font = '15px sans-serif'; ctx.fillText('🔥', x + teamW - 26, by + bh / 2); }
      if (g.poss === i && g.phase !== 'final') {
        ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.moveTo(x + teamW - 6, by + 8); ctx.lineTo(x + teamW - 6, by + bh - 8); ctx.lineTo(x + teamW - 12, by + bh / 2); ctx.fill();
      }
      ctx.fillStyle = '#0a0d1f'; ctx.textAlign = 'center';
      ctx.font = font('900', compact ? 20 : 24);
      ctx.fillText(String(g.score[i]), x + teamW + scoreW / 2, by + bh / 2 + 1);
      x += teamW + scoreW;
    });
    // quarter + clock
    ctx.fillStyle = '#141a3a'; ctx.fillRect(x, by, clockW, bh);
    ctx.fillStyle = '#8fa2ff'; ctx.font = font('700', 12); ctx.textAlign = 'left';
    ctx.fillText(g.quarter <= 4 ? ordinal(g.quarter) : 'OT', x + 10, by + bh / 2);
    ctx.fillStyle = g.clock < 10 && g.phase === 'live' ? '#ff5a5a' : '#fff';
    ctx.font = font('900', compact ? 17 : 20); ctx.textAlign = 'right';
    ctx.fillText(fmtClock(g.clock), x + clockW - 10, by + bh / 2 + 1);
    x += clockW;
    if (dd) {
      ctx.fillStyle = '#ffd23a'; ctx.fillRect(x, by, ddW, bh);
      ctx.fillStyle = '#16120a'; ctx.font = font('900', 14); ctx.textAlign = 'center';
      ctx.fillText(dd, x + ddW / 2, by + bh / 2 + 1);
      x += ddW;
    }
    if (spot) {
      ctx.fillStyle = '#0a0d1f'; ctx.fillRect(x, by, spotW, bh);
      ctx.fillStyle = '#c9d2ff'; ctx.font = font('700', 13); ctx.textAlign = 'center';
      ctx.fillText(spot, x + spotW / 2, by + bh / 2 + 1);
    }
    // turbo meters
    (g.ctl || []).forEach(function (c, i) {
      var mw = Math.min(180, W * 0.24), mh = 8;
      var mx = i === 0 ? 18 : W - mw - 18, my = opts.top ? H - 26 : by - 26;
      if (!opts.top && W < 900) my = by - 50 - i * 0;
      var ccol = c.slot === 0 ? '#2ee6ff' : '#ff8a1f';
      ctx.fillStyle = ccol; ctx.textAlign = i === 0 ? 'left' : 'right';
      ctx.font = font('700', 11);
      ctx.fillText('P' + (c.slot + 1) + '  ' + (g.fire[c.team] ? 'ON FIRE' : 'TURBO'), i === 0 ? mx : mx + mw, my - 9);
      ctx.fillStyle = 'rgba(10,13,31,0.8)'; roundRect(ctx, mx - 2, my - 2, mw + 4, mh + 4, 5); ctx.fill();
      var v = g.fire[c.team] ? 1 : c.turbo;
      var grd2 = ctx.createLinearGradient(mx, 0, mx + mw, 0);
      if (g.fire[c.team]) { grd2.addColorStop(0, '#ff3d00'); grd2.addColorStop(1, '#ffd000'); }
      else { grd2.addColorStop(0, ccol); grd2.addColorStop(1, '#ffffff'); }
      ctx.fillStyle = grd2; roundRect(ctx, mx, my, Math.max(0.01, mw * v), mh, 4); ctx.fill();
    });
    // wind badge
    if (g.wind && g.wind.mph > 0) {
      var wx = W / 2 + bw / 2 + 12, wy = by + bh / 2;
      if (wx + 96 > W) { wx = W - 104; wy = opts.top ? by + bh + 26 : by - 64; }
      ctx.fillStyle = 'rgba(10,13,31,0.85)'; roundRect(ctx, wx, wy - 15, 92, 30, 8); ctx.fill();
      var sr = Math.sin(g.wind.ang) * g.dir, su = Math.cos(g.wind.ang) * g.dir;
      ctx.save(); ctx.translate(wx + 17, wy); ctx.rotate(Math.atan2(-su, sr));
      ctx.fillStyle = '#9fd8ff'; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -6); ctx.lineTo(-3, 0); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#fff'; ctx.font = font('700', 12); ctx.textAlign = 'left';
      ctx.fillText(g.wind.mph + ' MPH', wx + 32, wy + 1);
    }
    // kick meter (field goals, extra points, punts, kickoffs)
    var ka = g.kickAnim, km = g.koMeter;
    var meterOn = (g.phase === 'anim' && ka && ka.human && ka.stage === 'meter') || (km && !km.set && g.phase === 'presnap');
    if (meterOn) {
      var mw = Math.min(420, W - 40), mh = 22, mx = (W - mw) / 2, my = (opts.top ? by + bh + 60 : by - 96);
      var pwr = km ? km.val : (ka.power != null ? ka.power : ka.meterVal || 0);
      ctx.fillStyle = 'rgba(10,13,31,0.88)'; roundRect(ctx, mx - 10, my - 30, mw + 20, mh + 44, 10); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = font('700', 12); ctx.textAlign = 'left';
      ctx.fillText(km ? 'KICKOFF POWER' : (ka.power == null ? 'POWER' : 'ACCURACY'), mx, my - 14);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(mx, my, mw, mh);
      var pg = ctx.createLinearGradient(mx, 0, mx + mw, 0); pg.addColorStop(0, '#3dff8b'); pg.addColorStop(0.7, '#ffd23a'); pg.addColorStop(1, '#ff4d1f');
      ctx.fillStyle = pg; ctx.fillRect(mx, my, mw * pwr, mh);
      if (!km && ka.power != null) {
        // accuracy: needle swings across; the center notch is dead straight
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(mx + mw / 2 - 1, my - 4, 2, mh + 8);
        var nx = mx + mw / 2 + (ka.needle || 0) * mw / 2;
        ctx.fillStyle = '#2ee6ff'; ctx.beginPath(); ctx.moveTo(nx, my - 6); ctx.lineTo(nx - 7, my - 16); ctx.lineTo(nx + 7, my - 16); ctx.fill();
        ctx.fillRect(nx - 1.5, my, 3, mh);
      }
    }
    if (opts.hint) {
      ctx.font = font('700', 13); ctx.textAlign = 'center';
      var hw = ctx.measureText(opts.hint).width + 30;
      var hy = opts.top ? by + bh + 14 : by - 40;
      ctx.fillStyle = 'rgba(10,13,31,0.82)';
      roundRect(ctx, W / 2 - hw / 2, hy, hw, 26, 13); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(opts.hint, W / 2, hy + 13);
    }
    ctx.restore();
  };

  function shade(hex, k) {
    var h = hex.replace('#', ''), n = parseInt(h, 16);
    var r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
    var f = function (v) { return Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k))); };
    return 'rgb(' + f(r) + ',' + f(gg) + ',' + f(b) + ')';
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  FB.roundRect = roundRect;
})();
