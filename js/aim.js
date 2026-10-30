/*
 * Football Blitz '26 — point-and-click passing overlay.
 *
 * Draws the pass preview on the HUD canvas of either renderer: a marching
 * dotted arc (red where a defender can get a hand on it), the landing
 * reticle with a catch-window tag, and the power ring at the pointer.
 * R is the renderer (for project), g the game (g.aimPlan from the engine),
 * ui the pointer state from main.js.
 */
(function () {
  var FB = (window.FB = window.FB || {});
  var TAU = Math.PI * 2;
  var FONT = '"Russo One", "Arial Black", Impact, sans-serif';
  var WINDOW = {
    open: { col: '#3dff8b', text: 'OPEN' },
    tight: { col: '#ffd23a', text: 'TIGHT' },
    covered: { col: '#ff4040', text: 'COVERED' },
    nobody: { col: '#9aa3c7', text: 'NO ONE THERE' }
  };
  var GOLD = '#ffd23a', HOT = '#ff4d1f', DANGER = '#ff3b3b', CYAN = '#2ee6ff';

  // chunky outlined text, flash-game style
  function label(ctx, text, x, y, size, col) {
    ctx.font = size + 'px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size * 0.32);
    ctx.strokeStyle = '#0a0a18'; ctx.strokeText(text, x, y);
    ctx.fillStyle = col; ctx.fillText(text, x, y);
  }

  function groundRing(ctx, R, x, y, r, n) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      var a = i / n * TAU, s = R.project(x + Math.cos(a) * r, y + Math.sin(a) * r, 0.03);
      if (!s) return null;
      pts.push(s);
    }
    ctx.beginPath();
    pts.forEach(function (s, i) { if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
    ctx.closePath();
    return pts;
  }

  function arcColor(ui) {
    if (!ui.charging || ui.tap) return '#f4f6ff';
    if (ui.over > 0) return '#ffffff';
    if (ui.fill >= ui.zone[0] && ui.fill <= ui.zone[1]) return GOLD;
    return CYAN;
  }

  function powerName(ui) {
    if (ui.over > 0) return { t: 'TOO LONG!', c: HOT };
    if (ui.fill >= ui.zone[0] && ui.fill <= ui.zone[1]) return { t: 'PERFECT', c: GOLD };
    if (ui.fill > ui.zone[1]) return { t: 'BULLET', c: '#ffffff' };
    if (ui.fill < 0.3) return { t: 'LOB', c: CYAN };
    if (ui.fill < 0.6) return { t: 'TOUCH', c: CYAN };
    return { t: 'ZIP', c: CYAN };
  }

  function drawArc(ctx, R, plan, ui, time) {
    var qb = plan.qb, N = 34, col = arcColor(ui), idle = !ui.charging;
    var off = (time * 1.6) % 1;
    var at = function (s, ground) {
      var x = qb.x + (plan.tx - qb.x) * s, y = qb.y + (plan.ty - qb.y) * s;
      return R.project(x, y, ground ? 0.03 : 1.9 + (1.3 - 1.9) * s + plan.peak * 4 * s * (1 - s));
    };
    // ground shadow of the flight path
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (var j = 0; j <= N; j += 2) {
      var g0 = at(j / N, true);
      if (g0) { ctx.beginPath(); ctx.arc(g0.x, g0.y, 1.6, 0, TAU); ctx.fill(); }
    }
    for (var i = 0; i < N; i++) {
      var s = (i + off) / N, p = at(s, false);
      if (!p) continue;
      var di = Math.round(s * (plan.danger ? plan.danger.length - 1 : 0));
      var hot = plan.danger && plan.danger[di];
      var r = (idle ? 2.2 : 3.0) * (0.75 + 0.5 * Math.sin(s * Math.PI));
      ctx.globalAlpha = idle ? 0.7 : ui.over > 0 ? 0.55 + 0.45 * Math.sin(time * 40 + i) : 1;
      if (hot) r *= 1.35;
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 1.4, 0, TAU); ctx.fillStyle = '#0a0a18'; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fillStyle = hot ? DANGER : col; ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawReticle(ctx, R, plan, time) {
    var w = WINDOW[plan.window] || WINDOW.nobody;
    var pulse = 0.9 + Math.sin(time * 8) * 0.08;
    if (groundRing(ctx, R, plan.tx, plan.ty, 0.95 * pulse, 28)) {
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(10,10,24,0.85)'; ctx.stroke();
      ctx.lineWidth = 2.5; ctx.strokeStyle = w.col; ctx.stroke();
      ctx.fillStyle = w.col + '26'; ctx.fill();
    }
    // four rotating brackets
    var spin = time * 1.8;
    for (var k = 0; k < 4; k++) {
      var a = spin + k * TAU / 4;
      var p0 = R.project(plan.tx + Math.cos(a) * 1.35, plan.ty + Math.sin(a) * 1.35, 0.03);
      var p1 = R.project(plan.tx + Math.cos(a) * 1.8, plan.ty + Math.sin(a) * 1.8, 0.03);
      if (!p0 || !p1) continue;
      ctx.lineCap = 'round';
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(10,10,24,0.85)';
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
      ctx.lineWidth = 2.5; ctx.strokeStyle = w.col;
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    }
    var c = R.project(plan.tx, plan.ty, 0.03);
    if (c) { ctx.beginPath(); ctx.arc(c.x, c.y, 2.5, 0, TAU); ctx.fillStyle = w.col; ctx.fill(); }
  }

  function drawCursor(ctx, ui, plan, time) {
    var x = ui.sx, y = ui.sy;
    // the catch window rides above the pointer so it never hides under the ring
    var w = WINDOW[plan.window] || WINDOW.nobody;
    var tag = plan.clamped ? 'MAX RANGE' : plan.lock || plan.window === 'nobody' ? w.text : 'SPOT • ' + w.text;
    label(ctx, tag, x, y - (ui.charging && !ui.tap ? 40 : 22), 11, plan.clamped ? HOT : w.col);
    if (ui.over > 0) { x += Math.sin(time * 70) * Math.min(4, ui.over * 10); y += Math.cos(time * 53) * Math.min(4, ui.over * 10); }
    ctx.lineCap = 'round';
    // crosshair
    [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(function (d) {
      ctx.beginPath(); ctx.moveTo(x + d[0] * 5, y + d[1] * 5); ctx.lineTo(x + d[0] * 11, y + d[1] * 11);
      ctx.lineWidth = 5; ctx.strokeStyle = '#0a0a18'; ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    });
    if (!ui.charging || ui.tap) return;
    // power ring: fills clockwise from the top, gold band is the perfect release
    var r = 24, a0 = -Math.PI / 2;
    ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.lineWidth = 11; ctx.strokeStyle = 'rgba(10,10,24,0.85)'; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r, a0 + ui.zone[0] * TAU, a0 + ui.zone[1] * TAU);
    ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(255,210,58,' + (0.35 + 0.25 * Math.sin(time * 14)) + ')'; ctx.stroke();
    var col = arcColor(ui);
    ctx.beginPath(); ctx.arc(x, y, r, a0, a0 + Math.max(0.01, ui.fill) * TAU);
    ctx.lineWidth = 5; ctx.strokeStyle = col; ctx.stroke();
    // zone edges
    [ui.zone[0], ui.zone[1]].forEach(function (z) {
      var a = a0 + z * TAU;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * (r - 6), y + Math.sin(a) * (r - 6)); ctx.lineTo(x + Math.cos(a) * (r + 6), y + Math.sin(a) * (r + 6));
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
    });
    var n = powerName(ui);
    label(ctx, n.t, x, y + r + 16, 12, n.c);
  }

  FB.drawAim = function (ctx, R, g, ui) {
    if (!ui) return;
    var time = g.time || 0, plan = ui.plan || g.aimPlan;
    ctx.save();
    if (plan && ui.active) {
      drawArc(ctx, R, plan, ui, time);
      drawReticle(ctx, R, plan, time);
      drawCursor(ctx, ui, plan, time);
    }
    // perfect-release shockwave at the pointer
    if (ui.flash > 0) {
      var k = 1 - ui.flash / 0.5;
      ctx.globalAlpha = 1 - k;
      ctx.beginPath(); ctx.arc(ui.fx, ui.fy, 24 + k * 46, 0, TAU);
      ctx.lineWidth = 6 * (1 - k) + 1; ctx.strokeStyle = GOLD; ctx.stroke();
      ctx.globalAlpha = 1;
      label(ctx, 'PERFECT!', ui.fx, ui.fy - 38 - k * 18, 18, GOLD);
    }
    ctx.restore();
  };
})();
