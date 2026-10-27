// Core game simulation. No DOM access, so it also runs headless in Node (tools/balance.js).
(function (SW) {
  'use strict';

  const T = SW.TILE;
  const TICK = 1 / 20;
  SW.TICK = TICK;

  let nextId = 1;

  // ------------------------------------------------------------- binary heap
  class Heap {
    constructor() { this.a = []; this.p = []; }
    get size() { return this.a.length; }
    push(v, pri) {
      const a = this.a, p = this.p;
      let i = a.length; a.push(v); p.push(pri);
      while (i > 0) {
        const j = (i - 1) >> 1;
        if (p[j] <= pri) break;
        a[i] = a[j]; p[i] = p[j]; i = j;
      }
      a[i] = v; p[i] = pri;
    }
    pop() {
      const a = this.a, p = this.p;
      const top = a[0];
      const v = a.pop(), pv = p.pop();
      if (a.length) {
        let i = 0;
        const n = a.length;
        for (;;) {
          let l = i * 2 + 1, r = l + 1, m = i;
          let mp = pv;
          if (l < n && p[l] < mp) { m = l; mp = p[l]; }
          if (r < n && p[r] < mp) { m = r; mp = p[r]; }
          if (m === i) break;
          a[i] = a[m]; p[i] = p[m]; i = m;
        }
        a[i] = v; p[i] = pv;
      }
      return top;
    }
  }

  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  // =================================================================== Game
  class Game {
    constructor(opts) {
      const map = opts.map;
      this.map = map;
      this.w = map.w; this.h = map.h;
      this.terrain = map.terrain;
      this.block = new Int32Array(this.w * this.h);
      this.entities = new Map();
      this.list = [];
      this.time = 0;
      this.tickCount = 0;
      this.events = [];
      this.messages = [];
      this.over = false;
      this.winner = -1;
      this.noFog = !!opts.noFog;
      this.headless = !!opts.headless;

      this.players = opts.players.map((p, i) => ({
        index: i, faction: p.faction, name: p.name || SW.FACTIONS[p.faction].short,
        color: p.color || SW.FACTIONS[p.faction].color, isAI: !!p.isAI,
        kyber: p.kyber != null ? p.kyber : SW.START_KYBER, gas: p.gas || 0,
        supplyUsed: 0, supplyMax: 0, alive: true,
        vis: new Uint8Array(this.w * this.h), explored: new Uint8Array(this.w * this.h),
        stats: { unitsBuilt: 0, unitsLost: 0, kills: 0, mined: 0 },
        hasRole: {},
      }));

      // Spatial hash
      this.cell = 4 * T;
      this.hcols = Math.ceil(this.w * T / this.cell);
      this.hrows = Math.ceil(this.h * T / this.cell);
      this.hash = new Array(this.hcols * this.hrows);
      for (let i = 0; i < this.hash.length; i++) this.hash[i] = [];

      this.circleCache = {};
      this.pathBudget = 0;

      if (!opts.empty) this.setupMap();
      this.updateSupply();
      this.updateVision(true);
    }

    // --------------------------------------------------------------- setup
    setupMap() {
      for (const r of this.map.resources) this.spawnResource(r.kind, r.tx, r.ty, r.w, r.h, r.amount);
      this.players.forEach((p, i) => {
        const s = this.map.starts[i];
        const hq = SW.factionBuilding(p.faction, 'hq');
        const b = this.spawnBuilding(hq.key, i, s.x - 2, s.y - 2, true);
        p.startX = b.x; p.startY = b.y;
        const worker = SW.workerOf(p.faction);
        // Workers spawn on the resource side.
        const cx = this.w * T / 2, cy = this.h * T / 2;
        let ax = b.x - cx, ay = b.y - cy;
        const l = Math.hypot(ax, ay); ax /= l; ay /= l;
        for (let k = 0; k < SW.START_WORKERS; k++) {
          const ang = Math.atan2(ay, ax) + (k - (SW.START_WORKERS - 1) / 2) * 0.28;
          this.spawnUnit(worker.key, i, b.x + Math.cos(ang) * 3.8 * T, b.y + Math.sin(ang) * 3.8 * T);
        }
      });
      // Start workers mining.
      for (const e of this.list) {
        if (e.kind === 'unit' && e.def.role === 'worker') {
          const r = this.nearestResource(e.x, e.y, 'kyber', 12 * T);
          if (r) this.cmdGather([e], r);
        }
      }
    }

    // ------------------------------------------------------------ entities
    addEntity(e) {
      e.id = nextId++;
      e.alive = true;
      this.entities.set(e.id, e);
      this.list.push(e);
      return e;
    }

    spawnUnit(type, owner, x, y) {
      const def = SW.UNITS[type];
      const e = this.addEntity({
        kind: 'unit', type, def, owner, x, y,
        hp: def.hp, maxHp: def.hp, sh: def.shields, maxSh: def.shields,
        r: def.radius, air: def.air, angle: owner === 0 ? 0.6 : Math.PI + 0.6,
        order: { type: 'idle' }, queue: [], path: null, pathIdx: 0,
        cd: Math.random() * 0.3, acquireT: Math.random() * 0.25, lastHit: -99,
        carry: 0, carryKind: null, gstate: null, timer: 0,
        target: 0, stuckT: 0, lastX: x, lastY: y, repaths: 0, walk: 0, firing: 0,
      });
      this.players[owner].stats.unitsBuilt++;
      return e;
    }

    spawnBuilding(type, owner, tx, ty, built) {
      const def = SW.BUILDINGS[type];
      const [w, h] = def.size;
      const e = this.addEntity({
        kind: 'building', type, def, owner, tx, ty, tw: w, th: h,
        x: (tx + w / 2) * T, y: (ty + h / 2) * T,
        hp: built ? def.hp : def.hp * 0.1, maxHp: def.hp,
        sh: built ? def.shields : 0, maxSh: def.shields,
        r: Math.max(w, h) * T / 2, built: !!built, progress: built ? 1 : 0,
        queue: [], rally: null, cd: 0, acquireT: 0, target: 0, lastHit: -99, angle: 0, firing: 0,
        miner: 0, geyser: 0,
      });
      if (def.onGeyser) {
        const g = this.resourceAtTile(tx, ty);
        if (g) { g.extractor = e.id; e.geyser = g.id; }
      } else {
        this.setBlock(tx, ty, w, h, e.id);
      }
      return e;
    }

    spawnResource(kind, tx, ty, w, h, amount) {
      const e = this.addEntity({
        kind: 'resource', rkind: kind, type: kind, owner: -1, tx, ty, tw: w, th: h,
        x: (tx + w / 2) * T, y: (ty + h / 2) * T, r: Math.max(w, h) * T / 2,
        amount, maxAmount: amount, miner: 0, extractor: 0, hp: 1, maxHp: 1,
      });
      this.setBlock(tx, ty, w, h, e.id);
      return e;
    }

    setBlock(tx, ty, w, h, id) {
      for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) {
        if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.block[y * this.w + x] = id;
      }
    }

    resourceAtTile(tx, ty) {
      for (const e of this.list) if (e.kind === 'resource' && e.rkind === 'gas' && e.tx === tx && e.ty === ty) return e;
      return null;
    }

    get(id) { const e = this.entities.get(id); return e && e.alive ? e : null; }

    kill(e, killer) {
      if (!e.alive) return;
      e.alive = false;
      if (e.kind === 'building' || e.kind === 'resource') {
        if (e.kind === 'building' && e.def.onGeyser) {
          const g = this.get(e.geyser);
          if (g) g.extractor = 0;
        } else {
          this.setBlock(e.tx, e.ty, e.tw, e.th, 0);
          // Extractor sits on the geyser; destroying a geyser's extractor restores geyser block.
        }
        if (e.kind === 'resource' && e.extractor) {
          const x = this.get(e.extractor);
          if (x) x.depleted = true;
        }
      }
      if (e.kind !== 'resource') {
        this.events.push({ type: 'death', x: e.x, y: e.y, r: e.r, air: !!e.air, building: e.kind === 'building', owner: e.owner, unitType: e.type });
        if (e.kind === 'unit') this.players[e.owner].stats.unitsLost++;
        if (killer && killer.owner >= 0 && killer.owner !== e.owner) this.players[killer.owner].stats.kills++;
      }
    }

    // ------------------------------------------------------------ grid/path
    passable(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
      const i = ty * this.w + tx;
      return this.terrain[i] === 0 && this.block[i] === 0;
    }

    passableAt(x, y) { return this.passable(Math.floor(x / T), Math.floor(y / T)); }

    // Is the straight segment walkable for a circle of radius r?
    lineClear(x0, y0, x1, y1, r) {
      const d = dist(x0, y0, x1, y1);
      const steps = Math.ceil(d / (T / 4));
      const nx = d ? -(y1 - y0) / d : 0, ny = d ? (x1 - x0) / d : 0;
      const off = Math.min(r, T * 0.45);
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        if (!this.passableAt(x, y) || !this.passableAt(x + nx * off, y + ny * off) || !this.passableAt(x - nx * off, y - ny * off)) return false;
      }
      return true;
    }

    nearestPassable(tx, ty, fromTx, fromTy) {
      if (this.passable(tx, ty)) return [tx, ty];
      for (let rad = 1; rad < 10; rad++) {
        let best = null, bd = Infinity;
        for (let y = ty - rad; y <= ty + rad; y++) {
          for (let x = tx - rad; x <= tx + rad; x++) {
            if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== rad) continue;
            if (!this.passable(x, y)) continue;
            const d = (x - fromTx) ** 2 + (y - fromTy) ** 2 + ((x - tx) ** 2 + (y - ty) ** 2) * 0.5;
            if (d < bd) { bd = d; best = [x, y]; }
          }
        }
        if (best) return best;
      }
      return null;
    }

    findPath(sx, sy, gx, gy, r) {
      const W = this.w;
      let stx = Math.floor(sx / T), sty = Math.floor(sy / T);
      let gtx = Math.floor(gx / T), gty = Math.floor(gy / T);
      gtx = Math.max(0, Math.min(this.w - 1, gtx)); gty = Math.max(0, Math.min(this.h - 1, gty));
      const goalBlocked = !this.passable(gtx, gty);
      if (!goalBlocked && this.lineClear(sx, sy, gx, gy, r)) return [{ x: gx, y: gy }];
      if (!this.passable(stx, sty)) {
        const s = this.nearestPassable(stx, sty, stx, sty);
        if (!s) return null;
        [stx, sty] = s;
      }
      let finalX = gx, finalY = gy;
      if (goalBlocked) {
        const g = this.nearestPassable(gtx, gty, stx, sty);
        if (!g) return null;
        [gtx, gty] = g;
        finalX = (gtx + 0.5) * T; finalY = (gty + 0.5) * T;
      }
      if (stx === gtx && sty === gty) return [{ x: finalX, y: finalY }];

      const N = W * this.h;
      if (!this._g || this._g.length !== N) {
        this._g = new Float32Array(N); this._from = new Int32Array(N); this._stamp = new Uint32Array(N); this._closed = new Uint32Array(N);
        this._st = 0;
      }
      const g = this._g, from = this._from, stamp = this._stamp, closed = this._closed;
      const st = ++this._st;
      const start = sty * W + stx, goal = gty * W + gtx;
      const heap = new Heap();
      const H = (i) => {
        const dx = Math.abs(i % W - gtx), dy = Math.abs(((i / W) | 0) - gty);
        return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
      };
      stamp[start] = st; g[start] = 0; from[start] = -1;
      heap.push(start, H(start));
      let best = start, bestH = H(start), expanded = 0, found = false;
      const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
      while (heap.size) {
        const cur = heap.pop();
        if (closed[cur] === st) continue;
        closed[cur] = st;
        if (cur === goal) { found = true; break; }
        if (++expanded > 9000) break;
        const cx = cur % W, cy = (cur / W) | 0;
        const hc = H(cur);
        if (hc < bestH) { bestH = hc; best = cur; }
        for (const [dx, dy, c] of dirs) {
          const nx = cx + dx, ny = cy + dy;
          if (!this.passable(nx, ny)) continue;
          if (dx && dy && (!this.passable(cx + dx, cy) || !this.passable(cx, cy + dy))) continue;
          const ni = ny * W + nx;
          if (closed[ni] === st) continue;
          const ng = g[cur] + c;
          if (stamp[ni] !== st || ng < g[ni]) {
            stamp[ni] = st; g[ni] = ng; from[ni] = cur;
            heap.push(ni, ng + H(ni) * 1.001);
          }
        }
      }
      const end = found ? goal : best;
      const tiles = [];
      for (let i = end; i !== -1; i = from[i]) tiles.push(i);
      tiles.reverse();
      const pts = tiles.map(i => ({ x: (i % W + 0.5) * T, y: (((i / W) | 0) + 0.5) * T }));
      if (found) pts[pts.length - 1] = { x: finalX, y: finalY };
      // String pulling
      const out = [];
      let ax = sx, ay = sy, k = 0;
      while (k < pts.length) {
        let far = k;
        for (let j = pts.length - 1; j > k; j--) {
          if (this.lineClear(ax, ay, pts[j].x, pts[j].y, r)) { far = j; break; }
        }
        out.push(pts[far]);
        ax = pts[far].x; ay = pts[far].y;
        k = far + 1;
      }
      return out;
    }

    // ------------------------------------------------------------- spatial
    rebuildHash() {
      for (const b of this.hash) b.length = 0;
      for (const e of this.list) {
        if (!e.alive || e.kind === 'resource') continue;
        const cx = Math.max(0, Math.min(this.hcols - 1, Math.floor(e.x / this.cell)));
        const cy = Math.max(0, Math.min(this.hrows - 1, Math.floor(e.y / this.cell)));
        this.hash[cy * this.hcols + cx].push(e);
      }
    }

    query(x, y, r, fn) {
      const pad = r + 3 * T; // buildings are bucketed by centre, so pad search
      const x0 = Math.max(0, Math.floor((x - pad) / this.cell)), x1 = Math.min(this.hcols - 1, Math.floor((x + pad) / this.cell));
      const y0 = Math.max(0, Math.floor((y - pad) / this.cell)), y1 = Math.min(this.hrows - 1, Math.floor((y + pad) / this.cell));
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        const b = this.hash[cy * this.hcols + cx];
        for (let i = 0; i < b.length; i++) fn(b[i]);
      }
    }

    // Edge-to-edge distance between an entity and another entity.
    gap(a, b) {
      if (b.kind === 'building' || b.kind === 'resource') {
        const x0 = b.tx * T, y0 = b.ty * T, x1 = x0 + b.tw * T, y1 = y0 + b.th * T;
        const dx = Math.max(x0 - a.x, 0, a.x - x1), dy = Math.max(y0 - a.y, 0, a.y - y1);
        return Math.hypot(dx, dy) - (a.kind === 'unit' ? a.r : 0);
      }
      if (a.kind === 'building') return this.gap(b, a);
      return dist(a.x, a.y, b.x, b.y) - a.r - b.r;
    }

    // -------------------------------------------------------------- vision
    circle(rad) {
      if (this.circleCache[rad]) return this.circleCache[rad];
      const pts = [];
      const r = Math.ceil(rad);
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= rad * rad + 0.5) pts.push(x, y);
      return (this.circleCache[rad] = pts);
    }

    updateVision(force) {
      if (this.noFog && !force) return;
      const W = this.w, Hh = this.h;
      for (const p of this.players) p.vis.fill(0);
      for (const e of this.list) {
        if (!e.alive || e.owner < 0) continue;
        const p = this.players[e.owner];
        const sight = e.kind === 'building' && !e.built ? 4 : e.def.sight;
        const c = this.circle(sight);
        const tx = Math.floor(e.x / T), ty = Math.floor(e.y / T);
        const vis = p.vis;
        for (let i = 0; i < c.length; i += 2) {
          const x = tx + c[i], y = ty + c[i + 1];
          if (x < 0 || y < 0 || x >= W || y >= Hh) continue;
          vis[y * W + x] = 1;
        }
      }
      for (const p of this.players) {
        const v = p.vis, ex = p.explored;
        for (let i = 0; i < v.length; i++) if (v[i]) ex[i] = 1;
      }
    }

    isVisible(player, e) {
      if (this.noFog) return true;
      if (e.owner === player) return true;
      const v = this.players[player].vis;
      if (e.kind === 'building' || e.kind === 'resource') {
        for (let y = e.ty; y < e.ty + e.th; y++) for (let x = e.tx; x < e.tx + e.tw; x++) if (v[y * this.w + x]) return true;
        return false;
      }
      const tx = Math.floor(e.x / T), ty = Math.floor(e.y / T);
      return !!v[ty * this.w + tx];
    }

    // ------------------------------------------------------------- economy
    updateSupply() {
      for (const p of this.players) { p.supplyUsed = 0; p.supplyMax = 0; p.hasRole = {}; p.buildings = 0; }
      for (const e of this.list) {
        if (!e.alive || e.owner < 0) continue;
        const p = this.players[e.owner];
        if (e.kind === 'unit') p.supplyUsed += e.def.supply / e.def.spawnCount;
        else if (e.kind === 'building') {
          p.buildings++;
          if (e.built) {
            p.supplyMax += e.def.supplyProvided;
            p.hasRole[e.def.role] = (p.hasRole[e.def.role] || 0) + 1;
          }
          for (const q of e.queue) p.supplyUsed += SW.UNITS[q.type].supply;
        }
      }
      for (const p of this.players) p.supplyMax = Math.min(SW.MAX_SUPPLY, p.supplyMax);
    }

    canAfford(player, def) {
      const p = this.players[player];
      return p.kyber >= def.cost[0] && p.gas >= def.cost[1];
    }

    // Returns null when allowed, otherwise a reason string.
    whyCantTrain(building, type) {
      const def = SW.UNITS[type];
      const p = this.players[building.owner];
      if (!building.built) return 'Under construction';
      if (building.queue.length >= 5) return 'Queue is full';
      if (def.requires === 'tech' && !p.hasRole.tech) return 'Requires ' + SW.factionBuilding(p.faction, 'tech').name;
      if (p.kyber < def.cost[0]) return 'Not enough kyber';
      if (p.gas < def.cost[1]) return 'Not enough tibanna';
      if (p.supplyUsed + def.supply > p.supplyMax) return p.supplyMax >= SW.MAX_SUPPLY ? 'Supply cap reached' : 'Additional supply required';
      return null;
    }

    whyCantBuild(player, type) {
      const def = SW.BUILDINGS[type];
      const p = this.players[player];
      if (def.requiresRole && !p.hasRole[def.requiresRole]) return 'Requires ' + SW.factionBuilding(p.faction, def.requiresRole).name;
      if (p.kyber < def.cost[0]) return 'Not enough kyber';
      if (p.gas < def.cost[1]) return 'Not enough tibanna';
      return null;
    }

    canPlace(type, tx, ty, ignoreId) {
      const def = SW.BUILDINGS[type];
      const [w, h] = def.size;
      if (def.onGeyser) {
        const g = this.resourceAtTile(tx, ty);
        return !!(g && g.alive && !g.extractor);
      }
      if (tx < 1 || ty < 1 || tx + w > this.w - 1 || ty + h > this.h - 1) return false;
      for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) {
        const i = y * this.w + x;
        if (this.terrain[i] || this.block[i]) return false;
      }
      if (def.role === 'hq') {
        // Keep HQs a few tiles away from resources so mining lines stay open.
        for (const e of this.list) {
          if (!e.alive || e.kind !== 'resource') continue;
          if (e.tx + e.tw > tx - 2 && e.tx < tx + w + 2 && e.ty + e.th > ty - 2 && e.ty < ty + h + 2) return false;
        }
      }
      return true;
    }

    nearestResource(x, y, kind, maxD, exclude) {
      let best = null, bd = maxD || Infinity;
      for (const e of this.list) {
        if (!e.alive || e.kind !== 'resource' || e.rkind !== kind || e === exclude) continue;
        const d = dist(x, y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }

    nearestDropoff(owner, x, y) {
      let best = null, bd = Infinity;
      for (const e of this.list) {
        if (!e.alive || e.kind !== 'building' || e.owner !== owner || e.def.role !== 'hq' || !e.built) continue;
        const d = dist(x, y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }

    // ------------------------------------------------------------ commands
    formation(units, x, y) {
      // Assign each unit a slot around (x,y), keeping slots close to unit's relative position.
      const n = units.length;
      if (n === 1) return [[x, y]];
      let cx = 0, cy = 0;
      for (const u of units) { cx += u.x; cy += u.y; }
      cx /= n; cy /= n;
      const spacing = 2.2 * Math.max(...units.map(u => u.r));
      const slots = [];
      const cols = Math.ceil(Math.sqrt(n));
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / cols), c = i % cols;
        slots.push([x + (c - (cols - 1) / 2) * spacing, y + (r - (Math.ceil(n / cols) - 1) / 2) * spacing]);
      }
      // Greedy matching by relative offset
      const order = units.map((u, i) => ({ u, i, ox: u.x - cx, oy: u.y - cy }));
      const res = new Array(n);
      const used = new Array(n).fill(false);
      order.sort((a, b) => (a.oy - b.oy) || (a.ox - b.ox));
      for (const o of order) {
        let bi = -1, bd = Infinity;
        for (let s = 0; s < n; s++) {
          if (used[s]) continue;
          const d = (slots[s][0] - x - o.ox * 0.5) ** 2 + (slots[s][1] - y - o.oy * 0.5) ** 2;
          if (d < bd) { bd = d; bi = s; }
        }
        used[bi] = true;
        let [sx, sy] = slots[bi];
        if (!o.u.air && !this.passableAt(sx, sy)) { sx = x; sy = y; }
        res[o.i] = [sx, sy];
      }
      return res;
    }

    issue(u, order, queue) {
      if (queue && u.order.type !== 'idle') { u.queue.push(order); return; }
      if (u.order.type === 'gather') this.releaseMiner(u);
      u.queue.length = 0;
      u.order = order;
      u.path = null; u.target = 0; u.gstate = null; u.repaths = 0; u.stuckT = 0;
      u.hidden = false; u.reachId = 0; u.reachFails = 0;
      if (order.type === 'gather') u.gstate = u.carry > 0 ? 'return' : 'toRes';
    }

    cmdMove(units, x, y, queue) {
      const us = units.filter(u => u.kind === 'unit');
      const f = this.formation(us, x, y);
      us.forEach((u, i) => this.issue(u, { type: 'move', x: f[i][0], y: f[i][1] }, queue));
    }

    cmdAttackMove(units, x, y, queue) {
      const us = units.filter(u => u.kind === 'unit');
      const f = this.formation(us, x, y);
      us.forEach((u, i) => {
        if (!u.def.weapons.length) this.issue(u, { type: 'move', x: f[i][0], y: f[i][1] }, queue);
        else this.issue(u, { type: 'amove', x: f[i][0], y: f[i][1] }, queue);
      });
    }

    cmdAttack(units, target, queue) {
      for (const u of units) {
        if (u.kind !== 'unit') continue;
        if (this.weaponFor(u, target)) this.issue(u, { type: 'attack', target: target.id }, queue);
        else this.issue(u, { type: 'move', x: target.x, y: target.y }, queue);
      }
    }

    cmdStop(units) { for (const u of units) if (u.kind === 'unit') this.issue(u, { type: 'idle' }); }
    cmdHold(units) { for (const u of units) if (u.kind === 'unit') this.issue(u, { type: 'hold' }); }

    cmdGather(units, res) {
      for (const u of units) {
        if (u.kind !== 'unit' || u.def.role !== 'worker') continue;
        this.issue(u, { type: 'gather', res: res.id });
      }
    }

    cmdSmart(units, x, y, target, player, queue) {
      const us = units.filter(u => u.kind === 'unit' && u.owner === player);
      if (!us.length) return;
      if (target && target.alive) {
        if (target.owner >= 0 && target.owner !== player) {
          this.cmdAttack(us, target, queue);
          return 'attack';
        }
        const workers = us.filter(u => u.def.role === 'worker');
        const others = us.filter(u => u.def.role !== 'worker');
        if (workers.length) {
          if (target.kind === 'resource' && target.rkind === 'kyber') this.cmdGather(workers, target);
          else if (target.kind === 'resource' && target.rkind === 'gas' && target.extractor) {
            const ex = this.get(target.extractor);
            if (ex && ex.owner === player && ex.built) this.cmdGather(workers, ex);
            else this.cmdMove(workers, x, y, queue);
          } else if (target.kind === 'building' && target.owner === player && target.def.onGeyser && target.built) this.cmdGather(workers, target);
          else if (target.kind === 'building' && target.owner === player && target.def.role === 'hq') {
            for (const w of workers) {
              if (w.carry > 0) {
                const r = this.get(w.lastRes);
                this.issue(w, { type: 'gather', res: r ? r.id : 0 });
                w.gstate = 'return';
              } else this.cmdMove([w], x, y, queue);
            }
          } else this.cmdMove(workers, x, y, queue);
        }
        if (others.length) this.cmdMove(others, x, y, queue);
        return 'move';
      }
      this.cmdMove(us, x, y, queue);
      return 'move';
    }

    cmdBuild(worker, type, tx, ty, queue) {
      const why = this.whyCantBuild(worker.owner, type);
      if (why) return why;
      if (!this.canPlace(type, tx, ty)) return "Can't build there";
      this.issue(worker, { type: 'build', btype: type, tx, ty, resume: worker.order.type === 'gather' ? worker.order.res : 0 }, queue);
      return null;
    }

    cmdTrain(building, type) {
      const why = this.whyCantTrain(building, type);
      if (why) return why;
      const def = SW.UNITS[type];
      const p = this.players[building.owner];
      p.kyber -= def.cost[0]; p.gas -= def.cost[1];
      building.queue.push({ type, progress: 0 });
      this.updateSupply();
      return null;
    }

    cmdCancel(building, idx) {
      if (!building.built) {
        // Cancel construction: refund 75%.
        const p = this.players[building.owner];
        p.kyber += Math.floor(building.def.cost[0] * 0.75);
        p.gas += Math.floor(building.def.cost[1] * 0.75);
        this.kill(building);
        return;
      }
      if (idx == null) idx = building.queue.length - 1;
      const q = building.queue[idx];
      if (!q) return;
      const def = SW.UNITS[q.type];
      const p = this.players[building.owner];
      p.kyber += def.cost[0]; p.gas += def.cost[1];
      building.queue.splice(idx, 1);
      this.updateSupply();
    }

    cmdRally(buildings, x, y, target) {
      for (const b of buildings) {
        if (b.kind !== 'building' || !b.def.trains.length) continue;
        b.rally = { x, y, ent: target ? target.id : 0 };
      }
    }

    msg(player, text) { this.messages.push({ player, text, t: this.time }); }

    // -------------------------------------------------------------- combat
    canHit(w, t) {
      if (!t || !t.alive || t.kind === 'resource' || t.hidden) return false;
      return t.air ? w.hits.includes('a') : w.hits.includes('g');
    }

    weaponFor(u, t) {
      for (const w of u.def.weapons) if (this.canHit(w, t)) return w;
      return null;
    }

    damageOf(w, t) {
      let d = w.dmg;
      if (w.bonus) {
        for (const tag in w.bonus) {
          if (t.def.tags.includes(tag) || (tag === 'air' && t.air)) d += w.bonus[tag];
        }
      }
      return d;
    }

    applyHit(t, dmg, src) {
      if (!t.alive) return;
      t.lastHit = this.time;
      if (t.sh > 0) {
        const a = Math.min(t.sh, dmg);
        t.sh -= a; dmg -= a;
        if (dmg <= 0) return;
      }
      t.hp -= Math.max(0.5, dmg - t.def.armor);
      if (t.hp <= 0) this.kill(t, src);
    }

    fire(u, t, w) {
      u.cd = w.cd;
      u.firing = 0.15;
      const count = w.count || 1;
      const per = this.damageOf(w, t);
      const tx = t.x, ty = t.y;
      for (let i = 0; i < count; i++) this.applyHit(t, per, u);
      if (w.splash) {
        const sr = w.splash * T;
        this.query(tx, ty, sr + 30, (e) => {
          if (e === t || !e.alive || e.owner === u.owner || e.owner < 0 || e.hidden) return;
          if (!this.canHit(w, e)) return;
          const d = e.kind === 'building' ? Math.max(0, this.gap({ x: tx, y: ty, kind: 'pt' }, e)) : Math.max(0, dist(tx, ty, e.x, e.y) - e.r);
          if (d > sr) return;
          const f = d <= sr / 2 ? 1 : 0.5;
          for (let i = 0; i < count; i++) this.applyHit(e, per * f, u);
        });
      }
      if (!this.headless) {
        this.events.push({ type: 'shot', kind: w.kind, color: w.bolt || '#fff', x: u.x, y: u.y, tx, ty, fromAir: !!u.air, toAir: !!t.air, count, splash: w.splash || 0, owner: u.owner, srcType: u.type });
      }
      // Alert: victim and nearby idle allies respond.
      this.alert(t, u);
    }

    alert(victim, attacker) {
      if (victim.owner < 0) return;
      const responder = (e) => {
        if (e.kind !== 'unit' || !e.alive || e.owner !== victim.owner) return;
        const ot = e.order.type;
        if (ot !== 'idle' || e.target) return;
        if (!this.weaponFor(e, attacker)) return;
        if (e.def.role === 'worker') return;
        e.target = attacker.id;
      };
      responder(victim);
      if (this.tickCount % 2 === 0) {
        this.query(victim.x, victim.y, 6 * T, (e) => {
          if (dist(e.x, e.y, victim.x, victim.y) < 6 * T) responder(e);
        });
      }
    }

    acquire(u, radius) {
      let best = null, bs = Infinity;
      const owner = u.owner;
      this.query(u.x, u.y, radius, (e) => {
        if (!e.alive || e.owner < 0 || e.owner === owner || e.hidden) return;
        if (!this.weaponFor(u, e)) return;
        const g = this.gap(u, e);
        if (g > radius) return;
        if (!this.isVisible(owner, e)) return;
        // Prefer threats, then units, then buildings.
        let pri = 2;
        if (e.kind === 'unit') pri = e.def.weapons.length && e.def.role !== 'worker' ? 0 : 1;
        else if (e.def.weapons.length && e.built) pri = 0.5;
        const s = pri * 1000 + g;
        if (s < bs) { bs = s; best = e; }
      });
      return best;
    }

    // Attack target t. Returns false if target invalid.
    engage(u, t, dt, mayMove) {
      const w = this.weaponFor(u, t);
      if (!w || !this.isVisible(u.owner, t)) return false;
      const g = this.gap(u, t);
      const range = w.range * T + (u.air && w.kind === 'bomb' ? 4 : 0);
      if (g <= range) {
        u.path = null;
        u.angle = turn(u.angle, Math.atan2(t.y - u.y, t.x - u.x), dt * 12);
        if (u.cd <= 0) this.fire(u, t, w);
        return true;
      }
      if (!mayMove) return false;
      const moved = u.chaseX != null ? dist(u.chaseX, u.chaseY, t.x, t.y) : Infinity;
      if (!u.path || moved > T * 1.5 || (u.repathT -= dt) <= 0) {
        this.pathTo(u, t.x, t.y);
        u.chaseX = t.x; u.chaseY = t.y; u.repathT = 0.8;
      }
      this.followPath(u, dt);
      return true;
    }

    // ------------------------------------------------------------ movement
    pathTo(u, x, y) {
      u.goalX = x; u.goalY = y;
      if (u.air) { u.path = [{ x, y }]; u.pathIdx = 0; return; }
      this.pathBudget--;
      u.path = this.findPath(u.x, u.y, x, y, u.r) || [{ x, y }];
      u.pathIdx = 0;
    }

    // Returns true when the path is complete.
    followPath(u, dt) {
      if (!u.path) return true;
      const p = u.path[u.pathIdx];
      if (!p) { u.path = null; return true; }
      const dx = p.x - u.x, dy = p.y - u.y;
      const d = Math.hypot(dx, dy);
      const sp = u.def.speed * T * dt;
      const last = u.pathIdx === u.path.length - 1;
      if (d <= sp || (!last && d < 6)) {
        u.x = p.x; u.y = p.y;
        u.pathIdx++;
        if (u.pathIdx >= u.path.length) { u.path = null; return true; }
        return false;
      }
      u.x += dx / d * sp; u.y += dy / d * sp;
      u.angle = turn(u.angle, Math.atan2(dy, dx), dt * 10);
      u.walk += sp;
      return false;
    }

    // Move toward order goal with stuck detection. Returns true on arrival.
    moveOrder(u, dt, x, y, tol) {
      if (!u.path && dist(u.x, u.y, x, y) > (tol || 4)) {
        this.pathTo(u, x, y);
      }
      const done = this.followPath(u, dt);
      if (done && dist(u.x, u.y, x, y) <= (tol || 4) + 8) return true;
      if (done) {
        // Path ended short (blocked goal) — count as arrived if close or out of repaths.
        if (u.repaths++ > 2 || dist(u.x, u.y, x, y) < 2 * T) return true;
        this.pathTo(u, x, y);
        return false;
      }
      // Stuck detection
      u.stuckT += dt;
      if (u.stuckT >= 0.6) {
        const moved = dist(u.x, u.y, u.lastX, u.lastY);
        const expect = u.def.speed * T * u.stuckT;
        if (moved < expect * 0.25) {
          if (dist(u.x, u.y, x, y) < 2.2 * T + u.r) { u.path = null; return true; }
          if (u.repaths++ > 4) { u.path = null; return true; }
          this.pathTo(u, x, y);
        }
        u.stuckT = 0; u.lastX = u.x; u.lastY = u.y;
      }
      return false;
    }

    nextOrder(u) {
      u.path = null; u.target = 0; u.repaths = 0;
      if (u.queue.length) {
        const o = u.queue.shift();
        u.order = o;
        if (o.type === 'gather') u.gstate = u.carry > 0 ? 'return' : 'toRes';
      } else u.order = { type: 'idle' };
    }

    // --------------------------------------------------------------- units
    updateUnit(u, dt) {
      if (u.cd > 0) u.cd -= dt;
      if (u.firing > 0) u.firing -= dt;
      const o = u.order;
      const armed = u.def.weapons.length > 0;

      switch (o.type) {
        case 'idle':
        case 'hold': {
          const hold = o.type === 'hold';
          let t = this.get(u.target);
          if (t && !this.weaponFor(u, t)) t = null;
          if (armed && !t && (u.acquireT -= dt) <= 0) {
            u.acquireT = 0.25;
            if (u.def.role !== 'worker') {
              const r = hold ? Math.max(...u.def.weapons.map(w => w.range)) * T : u.def.sight * T;
              t = this.acquire(u, r);
              if (t) u.target = t.id;
            }
          }
          if (t) {
            if (!this.engage(u, t, dt, !hold)) u.target = 0;
            if (!hold && u.target && this.gap(u, t) > u.def.sight * T + 3 * T) u.target = 0; // leash
          } else {
            u.target = 0;
          }
          break;
        }
        case 'move': {
          if (this.moveOrder(u, dt, o.x, o.y, 4)) this.nextOrder(u);
          break;
        }
        case 'amove': {
          let t = this.get(u.target);
          if (!t) u.target = 0;
          if ((u.acquireT -= dt) <= 0) {
            u.acquireT = 0.25;
            const nt = this.acquire(u, u.def.sight * T);
            if (nt && (!t || nt !== t && this.gap(u, nt) < this.gap(u, t) - T)) { t = nt; u.target = nt.id; }
          }
          if (t) {
            if (!this.engage(u, t, dt, true)) { u.target = 0; u.path = null; }
            else return;
          }
          if (!u.target) {
            if (u.chaseX != null) { u.chaseX = null; u.path = null; }
            if (this.moveOrder(u, dt, o.x, o.y, 6)) this.nextOrder(u);
          }
          break;
        }
        case 'attack': {
          const t = this.get(o.target);
          if (!t || !this.engage(u, t, dt, true)) this.nextOrder(u);
          break;
        }
        case 'gather':
          this.updateGather(u, dt);
          break;
        case 'build':
          this.updateBuild(u, dt);
          break;
      }
    }

    // Walk into contact with a building/resource rect. Returns true when touching.
    reach(u, target, dt, tol) {
      tol = tol || 6;
      if (this.gap(u, target) <= tol) { u.path = null; u.reachId = 0; return true; }
      const key = target.id || (target.tx * 1000 + target.ty);
      if (u.reachId !== key) { u.reachId = key; u.reachPhase = 0; u.reachT = 0; u.path = null; }
      if (u.reachPhase === 0) {
        if (!u.path) this.pathTo(u, target.x, target.y);
        if (this.followPath(u, dt)) u.reachPhase = 1;
        else {
          u.reachT += dt;
          if (u.reachT > 1) {
            if (dist(u.x, u.y, u.lastX, u.lastY) < u.def.speed * T * 0.2) u.path = null; // stuck: repath
            u.reachT = 0; u.lastX = u.x; u.lastY = u.y;
          }
        }
        return false;
      }
      // Direct approach to the closest point of the rect.
      const x0 = target.tx * T, y0 = target.ty * T, x1 = x0 + target.tw * T, y1 = y0 + target.th * T;
      const px = Math.max(x0, Math.min(u.x, x1)), py = Math.max(y0, Math.min(u.y, y1));
      const dx = px - u.x, dy = py - u.y, d = Math.hypot(dx, dy) || 1;
      const sp = u.def.speed * T * dt;
      u.x += dx / d * Math.min(sp, d); u.y += dy / d * Math.min(sp, d);
      u.angle = turn(u.angle, Math.atan2(dy, dx), dt * 10);
      u.walk += sp;
      u.reachT += dt;
      if (u.reachT > 2.5) { u.reachPhase = 0; u.reachT = 0; u.path = null; u.reachFails = (u.reachFails || 0) + 1; }
      return false;
    }

    releaseMiner(u) {
      const r = this.get(u.order.res);
      if (r && r.miner === u.id) r.miner = 0;
      u.hidden = false;
    }

    updateGather(u, dt) {
      const o = u.order;
      let res = this.get(o.res);
      const p = this.players[u.owner];
      if (u.gstate === 'return' || (u.carry > 0 && u.gstate !== 'return')) {
        u.gstate = 'return';
        const hq = this.nearestDropoff(u.owner, u.x, u.y);
        if (!hq) { this.nextOrder(u); return; }
        if (this.gap(u, hq) <= 6) {
          const amt = u.carry * (p.incomeMult || 1);
          if (u.carryKind === 'gas') p.gas += amt; else p.kyber += amt;
          p.stats.mined += u.carry;
          u.carry = 0; u.carryKind = null; u.path = null;
          u.gstate = 'toRes';
          if (!res) {
            // resource gone: find another nearby
            const nr = this.nearestResource(u.x, u.y, 'kyber', 14 * T);
            if (nr) o.res = nr.id; else { this.nextOrder(u); }
          }
          return;
        }
        this.reach(u, hq, dt);
        if (u.reachFails > 4) { u.reachFails = 0; this.nextOrder(u); }
        return;
      }

      if (!res) {
        const nr = this.nearestResource(u.x, u.y, 'kyber', 14 * T);
        if (nr) { o.res = nr.id; res = nr; } else { this.nextOrder(u); return; }
      }
      const isGas = res.kind === 'building';
      if (isGas && (!res.built || res.owner !== u.owner)) { this.nextOrder(u); return; }

      if (u.gstate === 'mining') {
        u.timer -= dt;
        if (u.timer <= 0) {
          if (isGas) {
            const g = this.get(res.geyser);
            const amt = g && g.amount > 0 ? Math.min(SW.GAS_PER_TRIP, g.amount) : 1;
            if (g) g.amount -= amt;
            u.carry = amt; u.carryKind = 'gas';
            u.hidden = false;
            // pop out on the side nearest the HQ
            const hq = this.nearestDropoff(u.owner, u.x, u.y);
            if (hq) {
              const a = Math.atan2(hq.y - res.y, hq.x - res.x);
              u.x = res.x + Math.cos(a) * (res.r + u.r + 2); u.y = res.y + Math.sin(a) * (res.r + u.r + 2);
            }
          } else {
            const amt = Math.min(SW.KYBER_PER_TRIP, res.amount);
            res.amount -= amt;
            u.carry = amt; u.carryKind = 'kyber';
            if (res.amount <= 0) this.kill(res);
          }
          if (res.miner === u.id) res.miner = 0;
          u.lastRes = res.id;
          u.gstate = 'return'; u.path = null; u.repaths = 0;
        }
        return;
      }

      // toRes
      const g = this.gap(u, res);
      if (g <= 6) {
        const busy = res.miner && res.miner !== u.id && this.get(res.miner);
        if (busy) {
          if (!isGas) {
            // try a free neighbour crystal
            let alt = null, ad = Infinity;
            for (const e of this.list) {
              if (!e.alive || e.kind !== 'resource' || e.rkind !== 'kyber' || e === res) continue;
              if (e.miner && this.get(e.miner)) continue;
              const d = dist(e.x, e.y, res.x, res.y);
              if (d < 5 * T && d < ad) { ad = d; alt = e; }
            }
            if (alt) { o.res = alt.id; u.path = null; return; }
          }
          return; // wait
        }
        res.miner = u.id;
        u.gstate = 'mining';
        u.timer = isGas ? SW.GAS_TIME : SW.MINE_TIME;
        u.path = null;
        u.angle = Math.atan2(res.y - u.y, res.x - u.x);
        if (isGas) { u.hidden = true; u.x = res.x; u.y = res.y; }
        return;
      }
      this.reach(u, res, dt);
      if (u.reachFails > 4) { u.reachFails = 0; this.nextOrder(u); }
    }

    updateBuild(u, dt) {
      const o = u.order;
      const def = SW.BUILDINGS[o.btype];
      const [w, h] = def.size;
      const rect = { kind: 'building', tx: o.tx, ty: o.ty, tw: w, th: h };
      if (this.gap(u, rect) <= 8 || (def.onGeyser && this.gap(u, rect) <= 10)) {
        u.path = null;
        const why = this.whyCantBuild(u.owner, o.btype);
        if (why) { this.msg(u.owner, why); this.nextOrder(u); return; }
        if (!this.canPlace(o.btype, o.tx, o.ty)) { this.msg(u.owner, "Can't build there"); this.nextOrder(u); return; }
        const p = this.players[u.owner];
        p.kyber -= def.cost[0]; p.gas -= def.cost[1];
        const b = this.spawnBuilding(o.btype, u.owner, o.tx, o.ty, false);
        this.events.push({ type: 'placed', x: b.x, y: b.y, owner: u.owner });
        this.pushOutOf(b);
        const resume = this.get(o.resume);
        if (def.onGeyser) {
          // builder goes straight to work on the new extractor once done; for now back to minerals
        }
        if (u.queue.length) this.nextOrder(u);
        else if (resume) { this.issue(u, { type: 'gather', res: resume.id }); }
        else this.nextOrder(u);
        return;
      }
      rect.x = (o.tx + w / 2) * T; rect.y = (o.ty + h / 2) * T;
      this.reach(u, rect, dt, 8);
      if (u.reachFails > 3) { u.reachFails = 0; this.msg(u.owner, "Can't reach build site"); this.nextOrder(u); }
    }

    pushOutOf(b) {
      const x0 = b.tx * T, y0 = b.ty * T, x1 = x0 + b.tw * T, y1 = y0 + b.th * T;
      for (const e of this.list) {
        if (!e.alive || e.kind !== 'unit' || e.air || e.hidden) continue;
        if (e.x + e.r > x0 && e.x - e.r < x1 && e.y + e.r > y0 && e.y - e.r < y1) {
          const opts = [[x0 - e.r - 1, e.y], [x1 + e.r + 1, e.y], [e.x, y0 - e.r - 1], [e.x, y1 + e.r + 1]];
          opts.sort((a, c) => dist(a[0], a[1], e.x, e.y) - dist(c[0], c[1], e.x, e.y));
          for (const [nx, ny] of opts) if (this.passableAt(nx, ny)) { e.x = nx; e.y = ny; break; }
          e.path = null;
        }
      }
    }

    // ----------------------------------------------------------- buildings
    updateBuilding(b, dt) {
      if (!b.built) {
        b.progress += dt / b.def.time;
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.9 * dt / b.def.time);
        if (b.progress >= 1) {
          b.progress = 1; b.built = true; b.sh = b.maxSh;
          this.events.push({ type: 'complete', x: b.x, y: b.y, owner: b.owner, btype: b.type });
          if (b.owner >= 0) this.msg(b.owner, b.def.name + ' complete');
        }
        return;
      }
      if (b.queue.length) {
        const q = b.queue[0];
        const def = SW.UNITS[q.type];
        q.progress += dt / def.time;
        if (q.progress >= 1) {
          b.queue.shift();
          for (let i = 0; i < def.spawnCount; i++) this.spawnFrom(b, def, i);
        }
      }
      if (b.def.weapons.length) {
        if (b.cd > 0) b.cd -= dt;
        if (b.firing > 0) b.firing -= dt;
        let t = this.get(b.target);
        const w = b.def.weapons[0];
        if (t && (!this.canHit(w, t) || this.towerGap(b, t) > w.range * T || !this.isVisible(b.owner, t))) t = null;
        if (!t && (b.acquireT -= dt) <= 0) {
          b.acquireT = 0.3;
          t = this.towerAcquire(b, w);
        }
        b.target = t ? t.id : 0;
        if (t) {
          b.angle = turn(b.angle, Math.atan2(t.y - b.y, t.x - b.x), dt * 8);
          if (b.cd <= 0) this.fire(b, t, w);
        }
      }
    }

    towerGap(b, t) { return dist(b.x, b.y, t.x, t.y) - b.r * 0.7 - (t.kind === 'unit' ? t.r : t.r); }

    towerAcquire(b, w) {
      let best = null, bd = Infinity;
      this.query(b.x, b.y, w.range * T + b.r, (e) => {
        if (!e.alive || e.owner < 0 || e.owner === b.owner || !this.canHit(w, e)) return;
        if (!this.isVisible(b.owner, e)) return;
        const g = this.towerGap(b, e);
        if (g > w.range * T) return;
        const s = (e.kind === 'unit' && e.def.weapons.length && e.def.role !== 'worker' ? 0 : 1000) + g;
        if (s < bd) { bd = s; best = e; }
      });
      return best;
    }

    spawnFrom(b, def, i) {
      let tx = b.rally ? b.rally.x : b.x + T * 3, ty = b.rally ? b.rally.y : b.y + T * 3;
      let sx, sy;
      if (def.air) { sx = b.x + (i * 10); sy = b.y; }
      else {
        // best perimeter point toward rally
        const x0 = b.tx * T, y0 = b.ty * T, x1 = x0 + b.tw * T, y1 = y0 + b.th * T;
        const r = def.radius + 2;
        let bd = Infinity;
        const cand = [];
        for (let k = 0; k <= 8; k++) {
          const f = k / 8;
          cand.push([x0 + (x1 - x0) * f, y1 + r], [x0 + (x1 - x0) * f, y0 - r], [x0 - r, y0 + (y1 - y0) * f], [x1 + r, y0 + (y1 - y0) * f]);
        }
        for (const [cx, cy] of cand) {
          if (!this.passableAt(cx, cy)) continue;
          let crowd = 0;
          this.query(cx, cy, 20, (e) => { if (e.kind === 'unit' && !e.air && dist(e.x, e.y, cx, cy) < e.r + r) crowd += 40; });
          const d = dist(cx, cy, tx, ty) + crowd;
          if (d < bd) { bd = d; sx = cx; sy = cy; }
        }
        if (sx == null) { sx = b.x; sy = y1 + r; }
      }
      const u = this.spawnUnit(def.key, b.owner, sx, sy);
      u.angle = Math.atan2(ty - sy, tx - sx);
      if (b.rally) {
        const rt = this.get(b.rally.ent);
        if (rt && def.role === 'worker' && (rt.kind === 'resource' || (rt.kind === 'building' && rt.def.onGeyser && rt.owner === b.owner))) {
          if (rt.kind === 'resource' && rt.rkind === 'gas') {
            const ex = this.get(rt.extractor);
            if (ex && ex.owner === b.owner) this.cmdGather([u], ex);
          } else this.cmdGather([u], rt);
        } else if (rt && rt.owner >= 0 && rt.owner !== b.owner) {
          this.cmdAttack([u], rt);
        } else {
          this.issue(u, { type: 'move', x: b.rally.x + (i * 12), y: b.rally.y });
        }
      }
      this.events.push({ type: 'spawn', x: sx, y: sy, owner: b.owner, unitType: def.key });
      return u;
    }

    // ----------------------------------------------------------- collision
    separate(dt) {
      for (const u of this.list) {
        if (!u.alive || u.kind !== 'unit' || u.hidden) continue;
        const ug = u.order.type === 'gather' && u.def.role === 'worker';
        this.query(u.x, u.y, u.r * 2 + 8, (e) => {
          if (e === u || !e.alive || e.kind !== 'unit' || e.hidden || e.air !== u.air) return;
          if (e.id < u.id) return; // handle each pair once
          const eg = e.order.type === 'gather' && e.def.role === 'worker';
          if ((ug || eg) && !u.air) {
            // miners pass through everything except when both idle
            return;
          }
          let dx = e.x - u.x, dy = e.y - u.y;
          let d = Math.hypot(dx, dy);
          const min = (u.r + e.r) * (u.air ? 0.8 : 1);
          if (d >= min) return;
          if (d < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d = Math.hypot(dx, dy); }
          const over = (min - d) * (u.air ? 0.15 : 0.5);
          const um = u.path ? 1 : 0, em = e.path ? 1 : 0;
          // moving units push stationary ones more
          let wu = 0.5, we = 0.5;
          if (um && !em) { wu = 0.2; we = 0.8; } else if (em && !um) { wu = 0.8; we = 0.2; }
          if (e.def.tags.includes('massive') && !u.def.tags.includes('massive')) { wu = 0.9; we = 0.1; }
          else if (u.def.tags.includes('massive') && !e.def.tags.includes('massive')) { wu = 0.1; we = 0.9; }
          const nx = dx / d, ny = dy / d;
          u.x -= nx * over * wu * 2; u.y -= ny * over * wu * 2;
          e.x += nx * over * we * 2; e.y += ny * over * we * 2;
        });
      }
      // Terrain / building / map bounds resolution
      const W = this.w * T, Hh = this.h * T;
      for (const u of this.list) {
        if (!u.alive || u.kind !== 'unit') continue;
        u.x = Math.max(u.r, Math.min(W - u.r, u.x));
        u.y = Math.max(u.r, Math.min(Hh - u.r, u.y));
        if (u.air || u.hidden) continue;
        this.resolveTerrain(u);
      }
    }

    resolveTerrain(u) {
      const tx0 = Math.floor((u.x - u.r) / T), tx1 = Math.floor((u.x + u.r) / T);
      const ty0 = Math.floor((u.y - u.r) / T), ty1 = Math.floor((u.y + u.r) / T);
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        if (this.passable(tx, ty)) continue;
        const rx0 = tx * T, ry0 = ty * T, rx1 = rx0 + T, ry1 = ry0 + T;
        const cx = Math.max(rx0, Math.min(u.x, rx1)), cy = Math.max(ry0, Math.min(u.y, ry1));
        let dx = u.x - cx, dy = u.y - cy;
        const d = Math.hypot(dx, dy);
        if (d === 0) {
          // centre inside blocked tile: move to nearest passable tile
          const np = this.nearestPassable(tx, ty, tx, ty);
          if (np) { u.x = (np[0] + 0.5) * T; u.y = (np[1] + 0.5) * T; }
          return;
        }
        if (d < u.r) {
          u.x += dx / d * (u.r - d);
          u.y += dy / d * (u.r - d);
        }
      }
    }

    // ----------------------------------------------------------------- tick
    regen(e, dt) {
      if (e.maxSh > 0 && e.sh < e.maxSh && this.time - e.lastHit > SW.SHIELD_REGEN_DELAY) {
        e.sh = Math.min(e.maxSh, e.sh + SW.SHIELD_REGEN_RATE * dt * (e.kind === 'building' ? 3 : 1));
      }
    }

    tick() {
      const dt = TICK;
      this.time += dt;
      this.tickCount++;
      if (this.events.length > 3000) this.events.splice(0, this.events.length - 3000);
      if (this.messages.length > 50) this.messages.splice(0, this.messages.length - 50);
      this.rebuildHash();
      for (let i = 0; i < this.list.length; i++) {
        const e = this.list[i];
        if (!e.alive) continue;
        if (e.kind === 'unit') this.updateUnit(e, dt);
        else if (e.kind === 'building' && e.owner >= 0) this.updateBuilding(e, dt);
        if (e.kind !== 'resource') this.regen(e, dt);
      }
      this.separate(dt);
      // compact entity list
      if (this.tickCount % 10 === 0 || this.list.some(e => !e.alive)) {
        const keep = [];
        for (const e of this.list) {
          if (e.alive) keep.push(e); else this.entities.delete(e.id);
        }
        this.list = keep;
      }
      this.updateSupply();
      if (this.tickCount % 5 === 0) this.updateVision();
      if (this.tickCount % 20 === 0) this.checkVictory();
    }

    checkVictory() {
      if (this.over || this.headless) return;
      for (const p of this.players) if (p.alive && p.buildings === 0) {
        p.alive = false;
        this.events.push({ type: 'defeat', player: p.index });
      }
      const alive = this.players.filter(p => p.alive);
      if (alive.length <= 1) {
        this.over = true;
        this.winner = alive.length ? alive[0].index : -1;
      }
    }
  }

  function turn(a, target, maxStep) {
    let d = target - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) <= maxStep) return target;
    return a + Math.sign(d) * maxStep;
  }

  SW.Game = Game;
  SW.dist = dist;
  if (typeof module !== 'undefined') module.exports = SW;
})(globalThis.SW = globalThis.SW || {});
