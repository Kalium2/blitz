// Procedural, point-symmetric 1v1 map generator.
(function (SW) {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  SW.rng = mulberry32;

  // Smooth value noise on a coarse lattice.
  function makeNoise(rand, w, h, cell) {
    const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2;
    const g = new Float32Array(gw * gh);
    for (let i = 0; i < g.length; i++) g[i] = rand();
    const sm = t => t * t * (3 - 2 * t);
    return function (x, y) {
      const fx = x / cell, fy = y / cell;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = sm(fx - ix), ty = sm(fy - iy);
      const a = g[iy * gw + ix], b = g[iy * gw + ix + 1];
      const c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
      return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    };
  }

  SW.generateMap = function (seed, size) {
    const W = size || 88, H = W;
    const rand = mulberry32(seed);
    const n1 = makeNoise(rand, W, H, 9), n2 = makeNoise(rand, W, H, 4);
    const terrain = new Uint8Array(W * H);
    const mirror = (x, y) => [W - 1 - x, H - 1 - y];

    // Base locations (HQ centre tiles); each listed base gets a mirrored twin.
    const half = [
      { x: 11, y: 11, main: true },
      { x: 12, y: 38 },
      { x: W - 15, y: 14 },
      { x: 33, y: Math.floor(H / 2) + 8 },
    ];
    const bases = [];
    half.forEach((b, i) => {
      const [mx, my] = mirror(b.x, b.y);
      bases.push({ x: b.x, y: b.y, main: !!b.main, pair: i });
      bases.push({ x: mx, y: my, main: !!b.main, pair: i });
    });

    const clearAround = (x, y) => {
      let m = Infinity;
      for (const b of bases) m = Math.min(m, Math.hypot(x - b.x, y - b.y));
      return m;
    };

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const [mx, my] = mirror(x, y);
        const v = (n1(x, y) + n1(mx, my)) * 0.5 * 0.75 + (n2(x, y) + n2(mx, my)) * 0.5 * 0.25;
        const d = clearAround(x, y);
        let thr = 0.66;
        if (d < 13) thr = 2; // keep bases open
        else if (d < 17) thr = 0.66 + (17 - d) * 0.06;
        // Keep a lane along the main diagonal open so armies can always meet.
        const diag = Math.abs(x - y) / Math.SQRT2;
        if (diag < 4) thr = 2;
        const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
        if (edge === 0) thr = -1;
        terrain[y * W + x] = v > thr ? 1 : 0;
      }
    }

    // Remove rock regions not reachable from main base (fill enclosed pockets with rock).
    const start = bases[0];
    const seen = new Uint8Array(W * H);
    const stack = [start.y * W + start.x];
    seen[stack[0]] = 1;
    while (stack.length) {
      const i = stack.pop();
      const x = i % W, y = (i / W) | 0;
      const nb = [i - 1, i + 1, i - W, i + W];
      if (x === 0) nb[0] = -1;
      if (x === W - 1) nb[1] = -1;
      for (const j of nb) {
        if (j < 0 || j >= W * H || seen[j] || terrain[j]) continue;
        seen[j] = 1; stack.push(j);
      }
    }
    for (let i = 0; i < W * H; i++) if (!terrain[i] && !seen[i]) terrain[i] = 1;

    // Resources around each base.
    const resources = [];
    const occupied = new Uint8Array(W * H);
    const free = (tx, ty, w, h) => {
      for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) {
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return false;
        if (terrain[y * W + x] || occupied[y * W + x]) return false;
      }
      return true;
    };
    const mark = (tx, ty, w, h) => {
      for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) occupied[y * W + x] = 1;
    };
    // Reserve HQ footprints (+1 tile margin) so resources never overlap a base site.
    for (const b of bases) mark(b.x - 3, b.y - 3, 7, 7);

    const cx = W / 2, cy = H / 2;
    half.forEach((hb, pi) => {
      const b = bases[pi * 2];
      let ax = b.x - cx, ay = b.y - cy;
      const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
      const baseAng = Math.atan2(ay, ax);
      const placed = [];
      const crystals = 8;
      for (let i = 0; i < crystals; i++) {
        const ang = baseAng + (-75 + (150 * i) / (crystals - 1)) * Math.PI / 180;
        for (const r of [7, 8, 6.5, 9]) {
          const tx = Math.round(b.x + Math.cos(ang) * r - 1), ty = Math.round(b.y + Math.sin(ang) * r - 0.5);
          if (free(tx, ty, 2, 1)) {
            mark(tx, ty, 2, 1);
            placed.push({ kind: 'kyber', tx, ty, w: 2, h: 1, amount: i % 3 === 0 ? 900 : 1500 });
            break;
          }
        }
      }
      for (const s of [-1, 1]) {
        const ang = baseAng + s * 108 * Math.PI / 180;
        for (const r of [8, 9, 7.5, 10]) {
          const tx = Math.round(b.x + Math.cos(ang) * r - 1.5), ty = Math.round(b.y + Math.sin(ang) * r - 1.5);
          if (free(tx, ty, 3, 3)) {
            mark(tx, ty, 3, 3);
            placed.push({ kind: 'gas', tx, ty, w: 3, h: 3, amount: 2250 });
            break;
          }
        }
      }
      // Mirror for the twin base: a footprint at (tx,ty,w,h) maps to (W-tx-w, H-ty-h).
      for (const p of placed) {
        resources.push(p);
        const m = Object.assign({}, p, { tx: W - p.tx - p.w, ty: H - p.ty - p.h });
        mark(m.tx, m.ty, m.w, m.h);
        resources.push(m);
      }
    });

    // Decorative doodads (render-only).
    const doodads = [];
    for (let i = 0; i < W * H / 40; i++) {
      const x = rand() * W, y = rand() * H;
      const t = terrain[(y | 0) * W + (x | 0)];
      doodads.push({ x, y, r: rand(), k: rand(), onRock: !!t });
    }

    return {
      w: W, h: H, seed, terrain, resources, doodads,
      bases: bases.map(b => ({ x: b.x, y: b.y, main: b.main })),
      starts: [bases[0], bases[1]].map(b => ({ x: b.x, y: b.y })),
    };
  };

  if (typeof module !== 'undefined') module.exports = SW;
})(globalThis.SW = globalThis.SW || {});
