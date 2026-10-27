// Procedural vector art for every unit, building and resource. Units are drawn
// top-down facing +x around the origin; the renderer handles rotation.
(function (SW) {
  'use strict';
  const T = SW.TILE;
  const A = {};
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------- helpers
  function circ(c, x, y, r, fill, stroke, lw) {
    c.beginPath(); c.arc(x, y, r, 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
  }
  function ell(c, x, y, rx, ry, fill, stroke, lw, rot) {
    c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
  }
  function poly(c, pts, fill, stroke, lw) {
    c.beginPath(); c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
  }
  function rect(c, x, y, w, h, fill, stroke, lw) {
    if (fill) { c.fillStyle = fill; c.fillRect(x, y, w, h); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.strokeRect(x, y, w, h); }
  }
  function rrect(c, x, y, w, h, r, fill, stroke, lw) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
  }
  function line(c, x0, y0, x1, y1, stroke, lw) {
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1);
    c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke();
  }
  function hex(c, x, y, rx, ry, fill, stroke, lw) {
    const pts = [];
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + Math.PI / 6; pts.push(x + Math.cos(a) * rx, y + Math.sin(a) * ry); }
    poly(c, pts, fill, stroke, lw);
  }
  function glow(c, x, y, r, color, a) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = a == null ? 1 : a;
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.globalAlpha = 1;
  }
  SW.artHelpers = { circ, ell, poly, rect, rrect, line, hex, glow };

  function blaster(c, x, y, len, w) { rect(c, x, y - (w || 1.6) / 2, len, w || 1.6, '#1a1a1a'); }

  // ------------------------------------------------------------------ units
  // s: { team, walk, t, firing, moving, sh, maxSh }
  A.stormtrooper = (c, s) => {
    blaster(c, 1, 3.2, 9, 1.8);
    ell(c, 0, 0, 4.5, 7, '#e9ecef', '#555', 0.8);
    rect(c, -1.5, -6.5, 2.5, 2.4, s.team);
    circ(c, 0.5, 0, 3.9, '#fafafa', '#333', 0.8);
    poly(c, [2.4, -1.8, 4.2, -0.6, 4.2, 0.6, 2.4, 1.8], '#151515');
    line(c, -2.8, 0, -0.6, 0, '#999', 0.8);
  };
  A.rebeltrooper = (c, s) => {
    blaster(c, 1, 3.2, 8, 1.8);
    ell(c, 0, 0, 4.5, 7, '#7a6b46', '#3a3020', 0.8);
    rect(c, -3, -1.5, 3.5, 3, '#4b3d24');
    rect(c, -1.5, -6.5, 2.5, 2.4, s.team);
    circ(c, 0.5, 0, 3.7, '#c9bb8d', '#4a4030', 0.8);
    circ(c, 2.2, 0, 1.5, '#e7c9a3');
  };
  A.wookiee = (c, s) => {
    const spikes = [];
    for (let i = 0; i < 16; i++) { const a = i * TAU / 16, r = i % 2 ? 9 : 7.5; spikes.push(Math.cos(a) * r * 0.85, Math.sin(a) * r); }
    poly(c, spikes, '#6b4426', '#3c2414', 0.8);
    ell(c, 0, 0, 5.5, 7, '#7d5230');
    line(c, -4, -6, 4, 6, '#2b1d10', 2.2);
    for (let i = -3; i <= 3; i += 2) circ(c, i * 0.66 + 0.3, i, 0.7, '#c0c0c0');
    rect(c, 2, 2.5, 11, 2.4, '#4a3a28');
    rect(c, 9, 1, 1.5, 5.4, '#888');
    circ(c, 2.5, 0, 3.2, '#8b5a33', '#3c2414', 0.6);
    circ(c, 4.4, 0, 1.2, '#2b1d10');
    rect(c, -5.5, -2, 1.5, 4, s.team);
  };
  A.speederbike = (c, s) => {
    line(c, 4, -2.2, 15, -2.2, '#3a3d33', 1.4);
    line(c, 4, 2.2, 15, 2.2, '#3a3d33', 1.4);
    rect(c, 13, -4, 3, 2.4, '#4f5446'); rect(c, 13, 1.6, 3, 2.4, '#4f5446');
    poly(c, [-10, -2.5, 6, -1.8, 8, 0, 6, 1.8, -10, 2.5, -12, 0], '#5e6352', '#2a2c25', 0.8);
    rect(c, -11, -3.5, 4, 7, '#45493c');
    rect(c, -12, -1, 1.5, 2, s.team);
    ell(c, -2, 0, 3.4, 4.6, '#d8dad5', '#333', 0.6);
    circ(c, -0.5, 0, 2.6, '#1f2a1f', '#000', 0.5);
    if (s.moving) glow(c, -13, 0, 6, 'rgba(255,170,90,0.9)', 0.6);
  };
  A.atst = (c, s) => {
    const ph = Math.sin(s.walk * 0.18);
    for (const side of [-1, 1]) {
      const f = ph * side * 7;
      line(c, 0, side * 6, f, side * 7.5, '#5d636a', 3);
      ell(c, f, side * 7.5, 3.4, 2.4, '#4a4f55', '#2a2d30', 0.6);
    }
    poly(c, [-8, -6, 6, -6, 10, -3, 10, 3, 6, 6, -8, 6, -10, 0], '#8b9198', '#3d4247', 1);
    poly(c, [-6, -4, 5, -4, 7, 0, 5, 4, -6, 4], '#9fa5ac');
    rect(c, 8, -5, 6, 1.6, '#2a2d30'); rect(c, 8, 3.4, 6, 1.6, '#2a2d30');
    rect(c, 6, -1, 6, 2, '#2a2d30');
    rect(c, 7.2, -3, 2.6, 6, '#1e2124');
    rect(c, -9, -1.5, 2, 3, s.team);
    if (s.firing > 0) { glow(c, 15, -4.2, 4, '#ff7744'); glow(c, 15, 4.2, 4, '#ff7744'); }
  };
  A.atat = (c, s) => {
    const ph = s.walk * 0.09;
    const legs = [[11, -10, 0], [11, 10, Math.PI], [-11, -10, Math.PI], [-11, 10, 0]];
    for (const [lx, ly, o] of legs) {
      const f = Math.sin(ph + o) * 6;
      line(c, lx, ly * 0.6, lx + f, ly * 1.2, '#6d737a', 4.5);
      ell(c, lx + f, ly * 1.2, 4.6, 3.6, '#555b61', '#30343a', 0.8);
    }
    rrect(c, -19, -9, 34, 18, 6, '#a3a9b0', '#4a4f55', 1.2);
    for (let i = -14; i < 12; i += 6) line(c, i, -8.5, i, 8.5, '#8a9097', 0.8);
    rrect(c, -15, -5, 26, 10, 3, '#b4b9bf');
    rect(c, -18, -2, 3, 4, s.team);
    rect(c, 14, -3, 6, 6, '#7c8289');
    poly(c, [20, -6, 31, -4.5, 33, 0, 31, 4.5, 20, 6, 18, 0], '#9aa0a7', '#4a4f55', 1);
    rect(c, 28, -6.5, 8, 1.8, '#2a2d30'); rect(c, 28, 4.7, 8, 1.8, '#2a2d30');
    rect(c, 24, -1, 9, 2, '#2a2d30');
    poly(c, [26, -3, 30, -2.6, 30, 2.6, 26, 3], '#22262a');
    if (s.firing > 0) { glow(c, 37, -5.5, 6, '#ff5544'); glow(c, 37, 5.5, 6, '#ff5544'); }
  };
  A.tie = (c, s) => {
    line(c, 0, -3, 0, -9, '#5c6168', 2.4);
    line(c, 0, 3, 0, 9, '#5c6168', 2.4);
    for (const side of [-1, 1]) {
      hex(c, 0, side * 10.5, 4.5, 9.5, '#2e3338', '#80878f', 1.2);
      // In top view the hex panels appear as tall thin hexagons; draw spokes.
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI / 3;
        line(c, Math.cos(a) * 4, side * 10.5 + Math.sin(a) * 8.5, -Math.cos(a) * 4, side * 10.5 - Math.sin(a) * 8.5, '#555c63', 0.6);
      }
      rect(c, -0.8, side * 10.5 - 0.8, 1.6, 1.6, s.team);
    }
    circ(c, 0, 0, 4.6, '#8a9199', '#3a3f45', 1);
    circ(c, 1.6, 0, 2.6, '#1b1f23', '#666', 0.6);
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8; line(c, 1.6, 0, 1.6 + Math.cos(a) * 2.6, Math.sin(a) * 2.6, '#555', 0.4); }
  };
  A.tiebomber = (c, s) => {
    for (const side of [-1, 1]) {
      poly(c, [-5, side * 9, 7, side * 12, 7, side * 16, -5, side * 18, -9, side * 14], '#2e3338', '#80878f', 1.1);
      line(c, 0, side * 4, 0, side * 10, '#5c6168', 2.2);
    }
    ell(c, -1, -2.6, 9, 3.2, '#8a9199', '#3a3f45', 0.9);
    ell(c, 0, 2.8, 8, 3, '#7a8189', '#3a3f45', 0.9);
    circ(c, 7, -2.6, 2.4, '#1b1f23', '#666', 0.6);
    rect(c, -8, 2, 3, 1.6, s.team);
  };
  A.xwing = (c, s) => {
    for (const side of [-1, 1]) {
      poly(c, [-8, side * 2, -2, side * 2, -4, side * 14, -9, side * 14], '#d6d8da', '#595d61', 0.8);
      poly(c, [-6.5, side * 7, -3.4, side * 7, -3.8, side * 9.5, -6.8, side * 9.5], s.team);
      line(c, -6, side * 14, 9, side * 14, '#6a6e72', 1.2);
      line(c, 9, side * 14, 12, side * 14, '#2a2a2a', 0.9);
      ell(c, -7, side * 4.5, 4, 1.8, '#9a9ea2', '#555', 0.6);
      glow(c, -11.5, side * 4.5, s.moving ? 4 : 2.5, 'rgba(255,120,90,0.95)', 0.8);
    }
    poly(c, [-12, -2.6, 4, -2.2, 15, -0.8, 17, 0, 15, 0.8, 4, 2.2, -12, 2.6], '#e2e4e6', '#595d61', 0.8);
    poly(c, [0, -1.5, 6, -1.1, 6, 1.1, 0, 1.5], '#2a3540');
    circ(c, -4, 0, 1.4, '#3b6fd6');
    if (s.firing > 0) for (const side of [-1, 1]) glow(c, 13, side * 14, 4, '#ff6644');
  };
  A.ywing = (c, s) => {
    for (const side of [-1, 1]) {
      rrect(c, -15, side * 7 - 2.5, 17, 5, 2.4, '#c8c3b5', '#5a5650', 0.8);
      line(c, -12, side * 7, 0, side * 7, '#8a867c', 0.8);
      glow(c, -16, side * 7, s.moving ? 4.5 : 2.5, 'rgba(255,120,90,0.95)', 0.8);
      rect(c, -6, side * 7 - 3, 2.6, 6, s.team);
    }
    rect(c, -6, -7, 3, 14, '#9a9588');
    rect(c, -6, -1.5, 10, 3, '#a8a397');
    ell(c, 8, 0, 6, 3.6, '#d8d3c5', '#5a5650', 0.8);
    poly(c, [8, -2, 13, -1.2, 13, 1.2, 8, 2], '#2a3540');
    line(c, 13, -1, 17, -1, '#333', 0.8); line(c, 13, 1, 17, 1, '#333', 0.8);
  };
  A.t47 = (c, s) => {
    poly(c, [13, 0, 6, -4, -8, -9, -10, -6, -10, 6, -8, 9, 6, 4], '#d9d4c8', '#5a5650', 0.9);
    poly(c, [-6, -7.5, -2, -6, -2, 6, -6, 7.5], s.team);
    poly(c, [5, -2.4, 9, -1, 9, 1, 5, 2.4], '#2a3540');
    rect(c, -11, -5, 3, 10, '#8f8a7e');
    line(c, 0, -6.5, 10, -6.5, '#333', 1); line(c, 0, 6.5, 10, 6.5, '#333', 1);
    rect(c, -12, -1, 3, 2, '#5a5650');
    if (s.moving) glow(c, -12, 0, 5, 'rgba(255,150,90,0.9)', 0.5);
  };
  A.ion = (c, s) => {
    rect(c, -18, -15, 30, 6, '#3a3a36'); rect(c, -18, 9, 30, 6, '#3a3a36');
    for (let i = -17; i < 12; i += 4) { line(c, i, -15, i, -9, '#555', 1); line(c, i, 9, i, 15, '#555', 1); }
    rrect(c, -16, -10, 28, 20, 4, '#9c9480', '#4a463c', 1);
    rect(c, -14, -2, 3, 4, s.team);
    circ(c, -2, 0, 8, '#b9b19b', '#4a463c', 1);
    circ(c, -2, 0, 5, '#7d9db0', '#3a4a55', 1);
    rect(c, 4, -2.5, 20, 5, '#5f625e', '#2a2c2a', 0.8);
    rect(c, 18, -3.5, 4, 7, '#46504f');
    glow(c, 25, 0, s.firing > 0 ? 9 : 4, 'rgba(120,210,255,0.95)', 0.9);
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + s.t * 0.6; line(c, -2, 0, -2 + Math.cos(a) * 5, Math.sin(a) * 5, '#c8e4f0', 0.7); }
  };
  A.b1 = (c, s) => {
    blaster(c, 1, 2.6, 8, 1.5);
    ell(c, -0.5, 0, 3, 5.5, '#c9b27f', '#6a5a38', 0.7);
    rect(c, -3.6, -2, 2, 4, '#a08a5a');
    poly(c, [0.5, -1.4, 7, -0.8, 7.5, 0, 7, 0.8, 0.5, 1.4], '#d7c191', '#6a5a38', 0.6);
    rect(c, -1.5, -5, 2, 1.5, s.team);
  };
  A.droideka = (c, s) => {
    if (s.moving && !s.firing) {
      circ(c, 0, 0, 7.5, '#8a6a3a', '#3a2a14', 1.2);
      const a = s.walk * 0.3;
      for (let i = 0; i < 3; i++) { const b = a + i * TAU / 3; line(c, Math.cos(b) * 2, Math.sin(b) * 7, Math.cos(b) * -2, Math.sin(b) * -7, '#5a4424', 1); }
      circ(c, 0, 0, 3, '#a8885a');
      return;
    }
    for (const a of [Math.PI * 0.75, -Math.PI * 0.75, Math.PI]) line(c, 0, 0, Math.cos(a) * 9, Math.sin(a) * 9, '#6a5030', 2.2);
    for (const side of [-1, 1]) { line(c, 0, side * 3, 7, side * 4.5, '#6a5030', 2); rect(c, 6, side * 4.5 - 1.2, 6, 2.4, '#2a2018'); }
    ell(c, -1, 0, 5, 4.4, '#9a7a48', '#3a2a14', 0.9);
    ell(c, 3.2, 0, 2.6, 2.2, '#b08f5a', '#3a2a14', 0.6);
    rect(c, -5, -1, 1.6, 2, s.team);
    if (s.sh > 0) {
      const a = 0.18 + 0.25 * (s.sh / s.maxSh);
      circ(c, 0, 0, 11, `rgba(120,190,255,${a * 0.5})`, `rgba(160,220,255,${a + 0.2})`, 1.2);
    }
  };
  A.aat = (c, s) => {
    poly(c, [16, -3, 16, 3, 6, 11, -12, 10, -14, 0, -12, -10, 6, -11], '#b5a47e', '#5a4a2c', 1);
    poly(c, [12, -2, 12, 2, 4, 8, -8, 7, -8, -7, 4, -8], '#c6b58e');
    ell(c, 4, -9, 5, 2.2, '#8a7a56'); ell(c, 4, 9, 5, 2.2, '#8a7a56');
    rect(c, 9, -10.5, 6, 1.6, '#2a2418'); rect(c, 9, 8.9, 6, 1.6, '#2a2418');
    circ(c, -2, 0, 5.5, '#a69570', '#5a4a2c', 1);
    rect(c, 2, -1.3, 20, 2.6, '#3a3426');
    rect(c, -11, -3, 3, 6, s.team);
    if (s.firing > 0) glow(c, 23, 0, 6, '#66aaff');
  };
  A.hailfire = (c, s) => {
    const rot = s.walk * 0.25;
    for (const side of [-1, 1]) {
      ell(c, 0, side * 10, 13, 3, null, '#5d4a2a', 3);
      for (let i = 0; i < 8; i++) { const x = Math.cos(rot + i * TAU / 8) * 12; line(c, x, side * 10 - 2.4, x, side * 10 + 2.4, '#3a2e1a', 1); }
    }
    rrect(c, -7, -7, 14, 14, 3, '#9e8a5c', '#4a3a20', 1);
    for (const side of [-1, 1]) {
      rect(c, -5, side * 5 - 2, 9, 4, '#5a4a2c');
      for (let i = 0; i < 3; i++) circ(c, -3.5 + i * 3, side * 5, 0.9, '#d9a040');
    }
    line(c, 6, 0, 13, 0, '#6a5a3a', 2);
    circ(c, 13.5, 0, 2.4, '#b39a64', '#4a3a20', 0.7);
    circ(c, 14.5, 0, 0.9, '#ff4422');
    rect(c, -7, -1, 2, 2, s.team);
  };
  A.vulture = (c, s) => {
    for (const side of [-1, 1]) {
      poly(c, [-2, side * 2, 2, side * 3, -4, side * 13, -9, side * 12], '#8a7650', '#3e3220', 0.8);
      poly(c, [1, side * 2, 5, side * 3, 10, side * 11, 7, side * 12], '#9a8660', '#3e3220', 0.8);
      line(c, 8, side * 11.5, 13, side * 11.5, '#2a2418', 1);
    }
    ell(c, 0, 0, 7, 3, '#a8946a', '#3e3220', 0.8);
    poly(c, [5, -1.5, 11, -0.6, 11, 0.6, 5, 1.5], '#7a6640');
    circ(c, 9, 0, 1, '#ff5533');
    rect(c, -6, -1, 2.4, 2, s.team);
    if (s.moving) glow(c, -8, 0, 4, 'rgba(120,180,255,0.9)', 0.6);
  };
  A.hyena = (c, s) => {
    for (const side of [-1, 1]) {
      poly(c, [-4, side * 3, 2, side * 3.5, -3, side * 15, -10, side * 14], '#7a6a48', '#3e3220', 0.8);
      poly(c, [0, side * 3, 6, side * 3.5, 11, side * 12, 7, side * 13], '#8a7a56', '#3e3220', 0.8);
    }
    rrect(c, -9, -4.5, 18, 9, 3, '#a08c62', '#3e3220', 0.9);
    rect(c, -5, -2.5, 8, 5, '#5a4a30');
    for (let i = 0; i < 3; i++) circ(c, -3.5 + i * 2.5, 0, 0.9, '#ffb040');
    poly(c, [9, -2, 13, -1, 13, 1, 9, 2], '#7a6640');
    circ(c, 12, 0, 1, '#ff5533');
    rect(c, -9, -1, 2, 2, s.team);
  };
  A.mouse = (c, s) => {
    rrect(c, -6, -4.5, 12, 9, 2.5, '#22252a', '#555b62', 0.8);
    rect(c, -3, -3, 6, 6, '#33383e');
    rect(c, 3, -1, 3, 2, s.team);
    circ(c, -6, 3, 1.5, '#111'); circ(c, -6, -3, 1.5, '#111'); circ(c, 6, 3, 1.5, '#111'); circ(c, 6, -3, 1.5, '#111');
    if (s.carry) circ(c, 0, 0, 2.5, s.carryKind === 'gas' ? '#ff9a3a' : '#5ff0ff');
  };
  A.astromech = (c, s) => {
    rect(c, -3, -7.5, 6, 3, '#d8dce0'); rect(c, -3, 4.5, 6, 3, '#d8dce0');
    circ(c, 0, 0, 6, '#eef0f3', '#6a7480', 0.8);
    c.save(); c.beginPath(); c.arc(0, 0, 6, -0.5, 0.5); c.lineTo(0, 0); c.fillStyle = '#3b6fd6'; c.fill(); c.restore();
    circ(c, 3, 0, 1.6, '#1a1a1a'); circ(c, 3.3, -0.4, 0.5, '#f44');
    rect(c, -3, -1, 2, 2, s.team);
    if (s.carry) circ(c, -2.5, 0, 2.2, s.carryKind === 'gas' ? '#ff9a3a' : '#5ff0ff');
  };
  A.labordroid = (c, s) => {
    for (const side of [-1, 1]) line(c, -2, side * 3, 6, side * 5, '#6a5a38', 1.4);
    rrect(c, -6, -4.5, 9, 9, 2, '#b8a070', '#5a4a2c', 0.8);
    circ(c, 3.5, 0, 2.8, '#c9b27f', '#5a4a2c', 0.6);
    circ(c, 5, 0, 0.9, '#ff5533');
    rect(c, -5, -1, 2, 2, s.team);
    if (s.carry) circ(c, -2, 0, 2.2, s.carryKind === 'gas' ? '#ff9a3a' : '#5ff0ff');
  };

  // -------------------------------------------------------------- buildings
  // Drawn centred, w/h in pixels. s: { team, t, angle, built, progress, firing, faction }
  const PAL = {
    empire: { base: '#6f767e', dark: '#3a3f45', mid: '#8d949c', light: '#b8bfc6', glow: '#ff5544', pad: '#4d5359' },
    rebels: { base: '#9a8a68', dark: '#5a4e38', mid: '#b3a37f', light: '#d4c6a2', glow: '#ffb050', pad: '#6e7a52' },
    separatists: { base: '#9c8656', dark: '#54452a', mid: '#b49c68', light: '#d0ba86', glow: '#5ab0ff', pad: '#6e6040' },
  };
  SW.PALETTE = PAL;

  function plate(c, w, h, p, r) {
    rrect(c, -w / 2 + 2, -h / 2 + 2, w - 4, h - 4, r == null ? 6 : r, p.base, p.dark, 1.5);
  }
  function lights(c, pts, color, t) {
    for (let i = 0; i < pts.length; i += 2) {
      const a = 0.5 + 0.5 * Math.sin(t * 3 + i);
      glow(c, pts[i], pts[i + 1], 4, color, a);
    }
  }

  const BA = {};
  // ---- Empire
  BA.imp_hq = (c, w, h, s, p) => {
    const pts = [];
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + TAU / 16; pts.push(Math.cos(a) * w * 0.49, Math.sin(a) * h * 0.49); }
    poly(c, pts, p.base, p.dark, 2);
    rect(c, -w * 0.32, -h * 0.32, w * 0.64, h * 0.64, p.mid, p.dark, 1.5);
    rect(c, -w * 0.22, -h * 0.22, w * 0.44, h * 0.44, p.light, p.dark, 1.2);
    rect(c, -w * 0.1, -h * 0.1, w * 0.2, h * 0.2, p.dark);
    for (let i = 0; i < 4; i++) { c.save(); c.rotate(i * Math.PI / 2); rect(c, -6, -h * 0.47, 12, h * 0.15, p.dark); rect(c, -3, -h * 0.47, 6, 4, s.team); c.restore(); }
    lights(c, [-w * 0.27, -h * 0.27, w * 0.27, -h * 0.27, -w * 0.27, h * 0.27, w * 0.27, h * 0.27], p.glow, s.t);
  };
  BA.imp_supply = (c, w, h, s, p) => {
    plate(c, w, h, p, 4);
    circ(c, 0, 0, w * 0.34, p.dark, p.light, 2);
    const pulse = 0.6 + 0.4 * Math.sin(s.t * 4);
    glow(c, 0, 0, w * 0.3, 'rgba(255,90,70,0.9)', pulse);
    circ(c, 0, 0, w * 0.12, '#ffd0c0');
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; rect(c, Math.cos(a) * w * 0.38 - 3, Math.sin(a) * h * 0.38 - 3, 6, 6, s.team); }
  };
  BA.imp_extractor = (c, w, h, s, p) => {
    plate(c, w, h, p, 10);
    for (const [x, y] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) circ(c, x * w, y * h, w * 0.15, p.mid, p.dark, 1.5);
    circ(c, 0, 0, w * 0.13, p.dark);
    glow(c, 0, 0, w * 0.18, 'rgba(255,160,60,0.8)', 0.5 + 0.3 * Math.sin(s.t * 2));
    rect(c, -w * 0.45, -3, w * 0.9, 6, p.dark); rect(c, -3, -h * 0.45, 6, h * 0.9, p.dark);
    rect(c, -4, -4, 8, 8, s.team);
  };
  BA.imp_barracks = (c, w, h, s, p) => {
    plate(c, w, h, p, 3);
    poly(c, [-w * 0.42, -h * 0.3, w * 0.3, -h * 0.42, w * 0.42, h * 0.3, -w * 0.3, h * 0.42], p.mid, p.dark, 1.5);
    rect(c, -w * 0.2, -h * 0.2, w * 0.4, h * 0.4, p.light, p.dark, 1);
    for (let i = -1; i <= 1; i++) rect(c, i * 10 - 3, h * 0.36, 6, h * 0.1, p.dark);
    rect(c, -6, -6, 12, 12, s.team);
    lights(c, [-w * 0.3, -h * 0.3, w * 0.3, h * 0.3], p.glow, s.t);
  };
  BA.imp_factory = (c, w, h, s, p) => {
    plate(c, w, h, p, 3);
    rect(c, -w * 0.42, -h * 0.38, w * 0.84, h * 0.2, p.dark);
    rect(c, -w * 0.42, h * 0.18, w * 0.84, h * 0.2, p.dark);
    for (let i = 0; i < 5; i++) line(c, -w * 0.4 + i * w * 0.2, -h * 0.18, -w * 0.4 + i * w * 0.2, h * 0.18, p.light, 2);
    rect(c, -w * 0.1, -h * 0.12, w * 0.2, h * 0.24, p.mid, p.dark, 1);
    rect(c, w * 0.3, -6, 10, 12, s.team);
    // AT-ST silhouette on the gantry
    c.save(); c.translate(-w * 0.22, 0); c.scale(0.9, 0.9); A.atst(c, { team: s.team, walk: 0 }); c.restore();
  };
  BA.imp_starport = (c, w, h, s, p) => {
    plate(c, w, h, p, 3);
    for (const x of [-w * 0.22, w * 0.22]) {
      circ(c, x, 0, h * 0.32, p.pad, p.light, 1.5);
      hex(c, x, 0, h * 0.2, h * 0.2, null, p.light, 1);
    }
    c.save(); c.translate(-w * 0.22, 0); A.tie(c, { team: s.team }); c.restore();
    rect(c, -6, -h * 0.46, 12, 6, s.team);
    lights(c, [-w * 0.44, 0, w * 0.44, 0], p.glow, s.t);
  };
  BA.imp_tech = (c, w, h, s, p) => {
    plate(c, w, h, p, 8);
    circ(c, 0, 0, w * 0.36, p.mid, p.dark, 2);
    circ(c, 0, 0, w * 0.24, p.light, p.dark, 1);
    c.save(); c.rotate(s.t * 0.5);
    line(c, 0, 0, w * 0.3, 0, p.dark, 3); circ(c, w * 0.3, 0, 5, p.light, p.dark, 1);
    c.restore();
    circ(c, 0, 0, 5, s.team);
  };
  BA.imp_tower = (c, w, h, s, p) => {
    rect(c, -w * 0.45, -h * 0.45, w * 0.9, h * 0.9, p.base, p.dark, 1.5);
    rect(c, -w * 0.3, -h * 0.3, w * 0.6, h * 0.6, p.mid);
    c.save(); c.rotate(s.angle);
    circ(c, 0, 0, w * 0.24, p.light, p.dark, 1.5);
    rect(c, 2, -6, w * 0.45, 3.5, p.dark); rect(c, 2, 2.5, w * 0.45, 3.5, p.dark);
    rect(c, -6, -2, 4, 4, s.team);
    if (s.firing > 0) { glow(c, w * 0.5, -4, 7, '#ff6655'); glow(c, w * 0.5, 4, 7, '#ff6655'); }
    c.restore();
  };

  // ---- Rebels
  BA.reb_hq = (c, w, h, s, p) => {
    // stepped jungle temple
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const f = 0.96 - i * 0.16;
      const col = ['#7d7058', '#8d7f63', '#9d8f70', '#ad9f7e', '#bdb08e'][i];
      rect(c, -w * f / 2, -h * f / 2, w * f, h * f, col, '#4a4030', 1);
    }
    rect(c, -6, h * 0.1, 12, h * 0.38, '#3a3226');
    for (const [x, y] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) circ(c, x * w, y * h, 7, '#4f6b34', '#2f4220', 1);
    rect(c, -5, -5, 10, 10, s.team);
    lights(c, [0, -h * 0.25], p.glow, s.t);
  };
  BA.reb_supply = (c, w, h, s, p) => {
    circ(c, 0, 0, w * 0.44, p.pad, '#3a4428', 1.5);
    circ(c, 0, 0, w * 0.3, '#cfcac0', '#5a564e', 1.5);
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + s.t * 0.2; line(c, Math.cos(a) * 5, Math.sin(a) * 5, Math.cos(a) * w * 0.42, Math.sin(a) * w * 0.42, '#9a958a', 2.5); }
    circ(c, 0, 0, w * 0.13, '#e8e4dc', '#5a564e', 1);
    circ(c, 0, 0, 3, s.team);
  };
  BA.reb_extractor = (c, w, h, s, p) => {
    plate(c, w, h, p, 12);
    circ(c, 0, 0, w * 0.32, p.mid, p.dark, 2);
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6; circ(c, Math.cos(a) * w * 0.32, Math.sin(a) * h * 0.32, 5, '#cfcac0', p.dark, 1); }
    glow(c, 0, 0, w * 0.2, 'rgba(255,170,70,0.8)', 0.5 + 0.3 * Math.sin(s.t * 2));
    circ(c, 0, 0, 5, s.team);
  };
  BA.reb_barracks = (c, w, h, s, p) => {
    rrect(c, -w * 0.47, -h * 0.47, w * 0.94, h * 0.94, 8, p.pad, '#3a4428', 1.5);
    for (let i = 0; i < 10; i++) { const a = i * TAU / 10; ell(c, Math.cos(a) * w * 0.4, Math.sin(a) * h * 0.4, 6, 4, '#8a7a58', '#4a4030', 0.8, a + Math.PI / 2); }
    poly(c, [-w * 0.28, h * 0.22, 0, -h * 0.3, w * 0.28, h * 0.22], p.mid, p.dark, 1.5);
    line(c, 0, -h * 0.3, 0, h * 0.22, p.dark, 1);
    rect(c, -5, h * 0.05, 10, 8, s.team);
  };
  BA.reb_factory = (c, w, h, s, p) => {
    plate(c, w, h, p, 5);
    rect(c, -w * 0.44, -h * 0.4, w * 0.88, h * 0.8, '#5a5040');
    for (let i = 0; i < 6; i++) line(c, -w * 0.44 + i * w * 0.176, -h * 0.4, -w * 0.44 + i * w * 0.176, h * 0.4, p.mid, 2);
    c.save(); c.translate(-w * 0.12, 0); A.t47(c, { team: s.team }); c.restore();
    rect(c, w * 0.28, -h * 0.3, 14, h * 0.6, p.light, p.dark, 1);
    rect(c, w * 0.31, -5, 8, 10, s.team);
  };
  BA.reb_starport = (c, w, h, s, p) => {
    plate(c, w, h, p, 6);
    rect(c, -w * 0.42, -h * 0.35, w * 0.84, h * 0.7, '#4a4436');
    for (let i = 0; i < 3; i++) line(c, -w * 0.42, -h * 0.35 + (i + 1) * h * 0.175, w * 0.42, -h * 0.35 + (i + 1) * h * 0.175, '#6a6250', 1);
    c.save(); c.translate(0, 0); c.scale(1.1, 1.1); A.xwing(c, { team: s.team }); c.restore();
    lights(c, [-w * 0.44, -h * 0.4, w * 0.44, -h * 0.4, -w * 0.44, h * 0.4, w * 0.44, h * 0.4], '#9fff7a', s.t);
  };
  BA.reb_tech = (c, w, h, s, p) => {
    plate(c, w, h, p, 10);
    rect(c, -w * 0.3, -h * 0.3, w * 0.6, h * 0.6, p.mid, p.dark, 1);
    c.save(); c.rotate(s.t * 0.4);
    ell(c, 0, 0, w * 0.32, w * 0.14, '#cfcac0', '#5a564e', 1.5);
    c.restore();
    circ(c, 0, 0, 5, s.team);
    // holo table glow
    glow(c, 0, 0, w * 0.2, 'rgba(120,200,255,0.8)', 0.4 + 0.2 * Math.sin(s.t * 3));
  };
  BA.reb_tower = (c, w, h, s, p) => {
    circ(c, 0, 0, w * 0.46, p.pad, '#3a4428', 1.5);
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8; ell(c, Math.cos(a) * w * 0.38, Math.sin(a) * h * 0.38, 4, 3, '#8a7a58', null, 0, a + Math.PI / 2); }
    c.save(); c.rotate(s.angle);
    circ(c, 0, 0, w * 0.22, p.light, p.dark, 1.5);
    rect(c, 2, -2, w * 0.48, 4, '#3a3a36');
    rect(c, -6, -2, 4, 4, s.team);
    if (s.firing > 0) glow(c, w * 0.52, 0, 7, '#ffaa55');
    c.restore();
  };

  // ---- Separatists
  BA.sep_hq = (c, w, h, s, p) => {
    circ(c, 0, 0, w * 0.48, p.dark);
    c.save(); c.beginPath(); c.arc(0, 0, w * 0.47, 0.35, TAU - 0.35); c.arc(0, 0, w * 0.3, TAU - 0.35, 0.35, true); c.closePath();
    c.fillStyle = p.mid; c.fill(); c.strokeStyle = p.dark; c.lineWidth = 1.5; c.stroke(); c.restore();
    for (let i = 0; i < 12; i++) { const a = 0.5 + i * (TAU - 1) / 11; circ(c, Math.cos(a) * w * 0.385, Math.sin(a) * h * 0.385, 2, p.light); }
    circ(c, 0, 0, w * 0.2, p.light, p.dark, 1.5);
    circ(c, 0, 0, w * 0.1, s.team);
    rect(c, w * 0.12, -4, w * 0.3, 8, p.base, p.dark, 1);
    lights(c, [w * 0.42, 0], p.glow, s.t);
  };
  BA.sep_supply = (c, w, h, s, p) => {
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6; line(c, 0, 0, Math.cos(a) * w * 0.46, Math.sin(a) * h * 0.46, p.dark, 3); }
    circ(c, 0, 0, w * 0.3, p.mid, p.dark, 1.5);
    glow(c, 0, 0, w * 0.3, 'rgba(90,170,255,0.9)', 0.5 + 0.4 * Math.sin(s.t * 4));
    circ(c, 0, 0, w * 0.1, '#d0ecff');
    circ(c, 0, w * 0.3, 3, s.team);
  };
  BA.sep_extractor = (c, w, h, s, p) => {
    circ(c, 0, 0, w * 0.46, p.base, p.dark, 1.5);
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + 0.5; ell(c, Math.cos(a) * w * 0.25, Math.sin(a) * h * 0.25, w * 0.14, w * 0.09, p.mid, p.dark, 1, a); }
    glow(c, 0, 0, w * 0.18, 'rgba(255,170,70,0.8)', 0.5 + 0.3 * Math.sin(s.t * 2));
    circ(c, 0, 0, 5, s.team);
  };
  BA.sep_barracks = (c, w, h, s, p) => {
    rrect(c, -w * 0.47, -h * 0.47, w * 0.94, h * 0.94, w * 0.25, p.base, p.dark, 1.5);
    rect(c, -w * 0.4, -5, w * 0.8, 10, p.dark);
    for (let i = 0; i < 5; i++) { c.save(); c.translate(-w * 0.32 + i * w * 0.16 + ((s.t * 8) % (w * 0.16)), 0); c.scale(0.6, 0.6); A.b1(c, { team: s.team }); c.restore(); }
    ell(c, 0, -h * 0.28, w * 0.3, h * 0.1, p.mid, p.dark, 1);
    rect(c, -4, h * 0.25, 8, 8, s.team);
  };
  BA.sep_factory = (c, w, h, s, p) => {
    rrect(c, -w * 0.47, -h * 0.47, w * 0.94, h * 0.94, 14, p.base, p.dark, 1.5);
    ell(c, 0, 0, w * 0.4, h * 0.34, p.dark);
    c.save(); c.scale(0.9, 0.9); A.aat(c, { team: s.team }); c.restore();
    for (const x of [-w * 0.42, w * 0.42]) circ(c, x, 0, 6, p.mid, p.dark, 1);
    lights(c, [0, -h * 0.4, 0, h * 0.4], p.glow, s.t);
  };
  BA.sep_starport = (c, w, h, s, p) => {
    rrect(c, -w * 0.47, -h * 0.47, w * 0.94, h * 0.94, h * 0.45, p.base, p.dark, 1.5);
    ell(c, 0, 0, w * 0.38, h * 0.3, '#3a3020', p.mid, 1.5);
    c.save(); c.translate(-w * 0.12, 0); A.vulture(c, { team: s.team }); c.restore();
    c.save(); c.translate(w * 0.16, 0); A.vulture(c, { team: s.team }); c.restore();
    rect(c, -5, -h * 0.47, 10, 6, s.team);
  };
  BA.sep_tech = (c, w, h, s, p) => {
    circ(c, 0, 0, w * 0.45, p.base, p.dark, 1.5);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + s.t * 0.3; ell(c, Math.cos(a) * w * 0.26, Math.sin(a) * h * 0.26, 7, 4, p.mid, p.dark, 1, a); }
    circ(c, 0, 0, w * 0.15, p.light, p.dark, 1.5);
    glow(c, 0, 0, w * 0.15, 'rgba(90,170,255,0.9)', 0.6);
    circ(c, 0, 0, 3, s.team);
  };
  BA.sep_tower = (c, w, h, s, p) => {
    circ(c, 0, 0, w * 0.46, p.base, p.dark, 1.5);
    c.save(); c.rotate(s.angle);
    ell(c, 0, 0, w * 0.26, w * 0.2, p.light, p.dark, 1.5);
    rect(c, 3, -5, w * 0.42, 3, '#2a2418'); rect(c, 3, 2, w * 0.42, 3, '#2a2418');
    rect(c, -7, -2, 4, 4, s.team);
    if (s.firing > 0) { glow(c, w * 0.48, -3.5, 6, '#66aaff'); glow(c, w * 0.48, 3.5, 6, '#66aaff'); }
    c.restore();
  };

  // ------------------------------------------------------------ resources
  function drawKyber(c, w, h, frac, t, seed) {
    ell(c, 0, 3, w * 0.48, h * 0.42, 'rgba(0,0,0,0.28)');
    const n = 6;
    for (let i = 0; i < n; i++) {
      const k = (seed * 9301 + i * 49297) % 233280 / 233280;
      const x = (i / (n - 1) - 0.5) * w * 0.75 + (k - 0.5) * 6;
      const hh = (8 + k * 9) * (0.45 + 0.55 * frac);
      const ww = 4 + k * 3;
      const y = (k - 0.5) * h * 0.4 + 4;
      poly(c, [x - ww, y, x - ww * 0.6, y - hh, x, y - hh - 4, x + ww * 0.6, y - hh, x + ww, y], i % 2 ? '#47c9e8' : '#6fe3ff', '#1d6f8a', 0.8);
      poly(c, [x - ww * 0.3, y - 1, x, y - hh - 2, x + ww * 0.25, y - 1], 'rgba(230,255,255,0.6)');
    }
    glow(c, 0, -2, w * 0.45, 'rgba(110,230,255,0.6)', 0.25 + 0.15 * Math.sin(t * 2 + seed));
  }
  function drawGeyser(c, w, h, t) {
    ell(c, 0, 0, w * 0.47, h * 0.45, '#3a3028', '#2a221c', 2);
    ell(c, 0, 0, w * 0.34, h * 0.32, '#241c16');
    ell(c, 0, 0, w * 0.2, h * 0.18, '#120c08');
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.6 + i * 0.25) % 1;
      glow(c, Math.sin(i * 2.1) * 6, -ph * 26, 10 + ph * 10, 'rgba(255,150,80,0.55)', (1 - ph) * 0.6);
    }
  }

  // --------------------------------------------------------------- public
  SW.drawUnit = function (c, e, team, t) {
    const fn = A[e.def.art];
    if (!fn) { circ(c, 0, 0, e.r, team); return; }
    fn(c, {
      team, t, walk: e.walk || 0, firing: e.firing || 0, moving: !!e.path, sh: e.sh, maxSh: e.maxSh,
      carry: e.carry, carryKind: e.carryKind,
    });
  };

  SW.drawBuildingArt = function (c, def, w, h, team, s) {
    const fn = BA[def.art];
    const p = PAL[def.faction];
    if (fn) fn(c, w, h, Object.assign({ team }, s), p);
    else rect(c, -w / 2, -h / 2, w, h, p.base, p.dark, 2);
  };

  SW.drawResource = function (c, e, t) {
    const w = e.tw * T, h = e.th * T;
    if (e.rkind === 'kyber') drawKyber(c, w, h, e.amount / e.maxAmount, t, e.tx * 31 + e.ty * 17);
    else drawGeyser(c, w, h, t);
  };

  SW.unitArtFn = A;

  // Icon cache: small canvases of unit/building art for UI.
  const iconCache = {};
  SW.icon = function (key, team, size) {
    size = size || 48;
    const id = key + '|' + team + '|' + size;
    if (iconCache[id]) return iconCache[id];
    if (typeof document === 'undefined') return null;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const c = cv.getContext('2d');
    const def = SW.DEFS[key];
    c.translate(size / 2, size / 2);
    if (def.building) {
      const [w, h] = def.size;
      const sc = (size * 0.92) / (Math.max(w, h) * T);
      c.scale(sc, sc);
      SW.drawBuildingArt(c, def, w * T, h * T, team, { t: 0, angle: -0.4, built: true, firing: 0 });
    } else {
      const ext = { atat: 30, ion: 26, hailfire: 18, aat: 22, ywing: 18, tiebomber: 19, xwing: 18, wookiee: 13, atst: 16, speederbike: 16, t47: 13 }[def.art] || Math.max(def.radius + 4, 12);
      const sc = (size * 0.46) / ext;
      c.rotate(-Math.PI / 4);
      c.scale(sc, sc);
      A[def.art](c, { team, t: 0, walk: 0, firing: 0, moving: false, sh: def.shields, maxSh: def.shields });
    }
    return (iconCache[id] = cv);
  };
})(globalThis.SW = globalThis.SW || {});
