// Computer opponent: macro (workers, supply, build order, expansion) and army control.
(function (SW) {
  'use strict';
  const T = SW.TILE;

  const DIFFICULTY = {
    easy:   { think: 1.6, maxWorkers: 18, wave0: 10, waveGrow: 4, expand: false, towers: 0, extraProd: 0, income: 1.0, barracks2: false },
    normal: { think: 0.8, maxWorkers: 34, wave0: 18, waveGrow: 6, expand: true,  towers: 1, extraProd: 1, income: 1.0, barracks2: true },
    hard:   { think: 0.4, maxWorkers: 44, wave0: 22, waveGrow: 8, expand: true,  towers: 2, extraProd: 2, income: 1.0, barracks2: true },
    brutal: { think: 0.3, maxWorkers: 50, wave0: 24, waveGrow: 8, expand: true,  towers: 2, extraProd: 3, income: 1.3, barracks2: true },
  };
  SW.AI_DIFFICULTY = DIFFICULTY;

  const COMPOSITION = {
    empire:      { stormtrooper: 3, scout_trooper: 1, at_st: 2, at_at: 1, tie_fighter: 1.2, tie_bomber: 1 },
    rebels:      { rebel_trooper: 3, wookiee: 1.5, t47: 1.3, ion_artillery: 1, xwing: 1.2, ywing: 1 },
    separatists: { b1: 3, droideka: 1.5, aat: 1.5, hailfire: 1, vulture: 1.2, hyena: 1 },
  };

  class AI {
    constructor(game, index, difficulty) {
      this.g = game; this.i = index;
      this.p = game.players[index];
      this.cfg = DIFFICULTY[difficulty] || DIFFICULTY.normal;
      this.p.incomeMult = this.cfg.income;
      this.timer = 1 + Math.random();
      this.wave = 0;
      this.attacking = false;
      this.attackTarget = null;
      this.lastAttackT = 0;
      this.home = { x: this.p.startX, y: this.p.startY };
    }

    update(dt) {
      this.timer -= dt;
      if (this.timer > 0) return;
      this.timer = this.cfg.think;
      if (!this.p.alive) return;
      this.scan();
      this.economy();
      this.buildings();
      this.production();
      this.military();
    }

    scan() {
      const g = this.g, i = this.i;
      this.units = []; this.workers = []; this.army = []; this.blds = []; this.byRole = {}; this.pendingRoles = {};
      this.hqs = [];
      for (const e of g.list) {
        if (!e.alive || e.owner !== i) continue;
        if (e.kind === 'unit') {
          this.units.push(e);
          if (e.def.role === 'worker') {
            this.workers.push(e);
            if (e.order.type === 'build') {
              const r = SW.BUILDINGS[e.order.btype].role;
              this.pendingRoles[r] = (this.pendingRoles[r] || 0) + 1;
            }
          } else this.army.push(e);
        } else if (e.kind === 'building') {
          this.blds.push(e);
          const r = e.def.role;
          this.byRole[r] = (this.byRole[r] || 0) + 1;
          if (r === 'hq') this.hqs.push(e);
        }
      }
      this.count = (role) => (this.byRole[role] || 0) + (this.pendingRoles[role] || 0);
      this.builtCount = (role) => this.blds.filter(b => b.def.role === role && b.built).length;
    }

    def(role) { return SW.factionBuilding(this.p.faction, role); }

    // ------------------------------------------------------------ economy
    economy() {
      const g = this.g;
      const hqs = this.hqs.filter(h => h.built);
      // Gas workers: scale down when gas is piling up relative to kyber
      const gasHeavy = this.p.gas > 350 && this.p.gas > this.p.kyber * 1.5;
      const want = gasHeavy ? (this.p.gas > 800 ? 0 : 1) : 3;
      for (const ex of this.blds) {
        if (!ex.def.onGeyser || !ex.built || ex.depleted) continue;
        const assigned = this.workers.filter(w => w.order.type === 'gather' && w.order.res === ex.id);
        if (assigned.length < want) {
          const w = this.pickWorker(ex.x, ex.y, true);
          if (w) g.cmdGather([w], ex);
        } else if (assigned.length > want) {
          const w = assigned.find(x => !x.hidden && x.carry === 0);
          const r = w && this.bestCrystal(hqs);
          if (r) g.cmdGather([w], r);
        }
      }
      // Idle workers -> kyber at least saturated base
      for (const w of this.workers) {
        if (w.order.type !== 'idle') continue;
        const r = this.bestCrystal(hqs);
        if (r) g.cmdGather([w], r);
      }
      // Train workers
      const target = Math.min(this.cfg.maxWorkers, hqs.length * 19 + this.builtCount('extractor') * 3);
      if (this.workers.length + this.queued('worker') < target) {
        for (const h of hqs) {
          if (h.queue.length === 0) g.cmdTrain(h, SW.workerOf(this.p.faction).key);
        }
      }
    }

    queued(role) {
      let n = 0;
      for (const b of this.blds) for (const q of b.queue) if (SW.UNITS[q.type].role === role) n++;
      return n;
    }

    bestCrystal(hqs) {
      const g = this.g;
      let best = null, bs = Infinity;
      for (const h of hqs) {
        const crystals = g.list.filter(e => e.alive && e.kind === 'resource' && e.rkind === 'kyber' && SW.dist(e.x, e.y, h.x, h.y) < 11 * T);
        if (!crystals.length) continue;
        const miners = this.workers.filter(w => w.order.type === 'gather' && crystals.some(c => c.id === w.order.res)).length;
        const sat = miners / (crystals.length * 2);
        for (const c of crystals) {
          const s = sat * 1000 + SW.dist(c.x, c.y, h.x, h.y) + (c.miner ? 50 : 0);
          if (s < bs) { bs = s; best = c; }
        }
      }
      return best;
    }

    pickWorker(x, y, fromKyber) {
      let best = null, bd = Infinity;
      for (const w of this.workers) {
        const o = w.order.type;
        if (o === 'build') continue;
        if (o === 'gather') {
          const r = this.g.get(w.order.res);
          if (fromKyber && r && r.kind === 'building') continue; // already on gas
          if (w.carry > 0) continue;
        } else if (o !== 'idle') continue;
        const d = SW.dist(w.x, w.y, x, y);
        if (d < bd) { bd = d; best = w; }
      }
      return best;
    }

    // ---------------------------------------------------------- buildings
    nextBuild() {
      const c = this.cfg, p = this.p;
      const sup = p.supplyUsed;
      const workers = this.workers.length;
      const time = this.g.time;
      const steps = [];
      // supply
      const prod = this.blds.filter(b => b.def.trains.length).length;
      const buffer = 3 + prod * 2;
      const pendingSupply = this.blds.filter(b => !b.built && b.def.supplyProvided).length * 10 + (this.pendingRoles.supply || 0) * 10;
      if (p.supplyMax + pendingSupply < SW.MAX_SUPPLY && p.supplyMax + pendingSupply - sup < buffer && (this.pendingRoles.supply || 0) < 1 + Math.floor(prod / 4)) steps.push('supply');
      if (this.count('barracks') < 1 && workers >= 10) steps.push('barracks');
      if (this.count('extractor') < 1 && this.count('barracks') >= 1) steps.push('extractor');
      if (this.count('factory') < 1 && this.builtCount('barracks') >= 1 && workers >= 14) steps.push('factory');
      if (this.count('extractor') < 2 && this.count('factory') >= 1) steps.push('extractor');
      if (c.barracks2 && this.count('barracks') < 2 && this.count('factory') >= 1) steps.push('barracks');
      if (this.count('tech') < 1 && this.builtCount('factory') >= 1 && time > 200) steps.push('tech');
      if (this.count('starport') < 1 && this.builtCount('factory') >= 1 && time > 240) steps.push('starport');
      if (c.expand && this.count('hq') < 2 && time > 300 && workers >= 18) steps.push('hq');
      if (this.count('tower') < c.towers && this.builtCount('barracks') >= 1 && time > 240) steps.push('tower');
      if (this.count('hq') >= 2 && this.count('extractor') < 4 && this.builtCount('hq') >= 2) steps.push('extractor');
      if (c.extraProd > 0 && time > 420 && p.kyber > 400) {
        if (this.count('factory') < 1 + Math.min(1, c.extraProd)) steps.push('factory');
        if (this.count('barracks') < 2 + Math.max(0, c.extraProd - 1)) steps.push('barracks');
        if (this.count('starport') < 1 + Math.max(0, c.extraProd - 2)) steps.push('starport');
      }
      if (c.expand && this.count('hq') < 3 && time > 720 && p.kyber > 500) steps.push('hq');
      return steps;
    }

    buildings() {
      const g = this.g;
      this.reserve = [0, 0];
      const steps = this.nextBuild();
      for (const role of steps) {
        const d = this.def(role);
        if (!d) continue;
        if (d.requiresRole && !this.p.hasRole[d.requiresRole]) continue;
        if (g.whyCantBuild(this.i, d.key)) {
          // save up for it (but only for the first unaffordable step)
          if (!this.reserve[0] && !this.reserve[1]) this.reserve = [d.cost[0], d.cost[1]];
          continue;
        }
        const spot = role === 'hq' ? this.expansionSpot() : role === 'extractor' ? this.geyserSpot() : this.buildSpot(d);
        if (!spot) continue;
        const w = this.pickWorker((spot[0] + d.size[0] / 2) * T, (spot[1] + d.size[1] / 2) * T, true);
        if (!w) continue;
        g.cmdBuild(w, d.key, spot[0], spot[1]);
      }
      // Builders en route reserve their cost (it is paid on arrival).
      for (const w of this.workers) if (w.order.type === 'build') {
        const d = SW.BUILDINGS[w.order.btype];
        this.reserve[0] += d.cost[0]; this.reserve[1] += d.cost[1];
      }
    }

    geyserSpot() {
      const g = this.g;
      let best = null, bd = Infinity;
      for (const e of g.list) {
        if (!e.alive || e.kind !== 'resource' || e.rkind !== 'gas' || e.extractor) continue;
        if (this.workers.some(w => w.order.type === 'build' && w.order.tx === e.tx && w.order.ty === e.ty)) continue;
        for (const h of this.hqs) {
          if (!h.built) continue;
          const d = SW.dist(e.x, e.y, h.x, h.y);
          if (d < 12 * T && d < bd) { bd = d; best = [e.tx, e.ty]; }
        }
      }
      return best;
    }

    expansionSpot() {
      const g = this.g;
      let best = null, bd = Infinity;
      for (const b of g.map.bases) {
        const tx = b.x - 2, ty = b.y - 2;
        if (!g.canPlace(this.def('hq').key, tx, ty)) continue;
        // skip bases with enemies nearby
        let enemy = false;
        for (const e of g.list) if (e.alive && e.owner >= 0 && e.owner !== this.i && SW.dist(e.x, e.y, b.x * T, b.y * T) < 12 * T) { enemy = true; break; }
        if (enemy) continue;
        if (this.workers.some(w => w.order.type === 'build' && w.order.tx === tx && w.order.ty === ty)) continue;
        const d = SW.dist(b.x * T, b.y * T, this.home.x, this.home.y);
        if (d < bd) { bd = d; best = [tx, ty]; }
      }
      return best;
    }

    buildSpot(d) {
      const g = this.g;
      const [w, h] = d.size;
      const hq = this.hqs[0] || this.blds[0];
      if (!hq) return null;
      const cx = g.w * T / 2, cy = g.h * T / 2;
      let ax = cx - hq.x, ay = cy - hq.y;
      const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
      const htx = Math.floor(hq.x / T), hty = Math.floor(hq.y / T);
      const resources = g.list.filter(e => e.alive && e.kind === 'resource' && SW.dist(e.x, e.y, hq.x, hq.y) < 14 * T);
      let best = null, bs = Infinity;
      for (let r = 4; r <= 15; r++) {
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = htx + dx - Math.floor(w / 2), ty = hty + dy - Math.floor(h / 2);
          if (!this.areaFree(tx - 1, ty - 1, w + 2, h + 2)) continue;
          const px = (tx + w / 2) * T, py = (ty + h / 2) * T;
          let nearRes = false;
          for (const e of resources) if (SW.dist(px, py, e.x, e.y) < 4.5 * T) { nearRes = true; break; }
          if (nearRes) continue;
          // avoid the mining area between HQ and resources
          const dot = ((px - hq.x) * ax + (py - hq.y) * ay) / T;
          if (dot < -1) continue;
          if (this.workers.some(wk => wk.order.type === 'build' && Math.abs(wk.order.tx - tx) < 5 && Math.abs(wk.order.ty - ty) < 5)) continue;
          const s = r * 2 - dot * 0.6 + Math.random() * 2;
          if (s < bs) { bs = s; best = [tx, ty]; }
        }
        if (best && r > 6) break;
      }
      return best;
    }

    areaFree(tx, ty, w, h) {
      const g = this.g;
      if (tx < 1 || ty < 1 || tx + w > g.w - 1 || ty + h > g.h - 1) return false;
      for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) {
        const i = y * g.w + x;
        if (g.terrain[i] || g.block[i]) return false;
      }
      return true;
    }

    // --------------------------------------------------------- production
    production() {
      const g = this.g;
      const comp = COMPOSITION[this.p.faction];
      const have = {};
      for (const u of this.army) have[u.type] = (have[u.type] || 0) + u.def.supply / u.def.spawnCount;
      for (const b of this.blds) for (const q of b.queue) have[q.type] = (have[q.type] || 0) + SW.UNITS[q.type].supply;
      // Enemy make-up for counters
      let eAir = 0, eTotal = 0, eArmored = 0;
      for (const e of g.list) {
        if (!e.alive || e.kind !== 'unit' || e.owner === this.i || e.owner < 0 || e.def.role === 'worker') continue;
        if (!g.isVisible(this.i, e)) continue;
        eTotal += e.def.supply;
        if (e.air) eAir += e.def.supply;
        if (e.def.tags.includes('armored')) eArmored += e.def.supply;
      }
      const airFrac = eTotal ? eAir / eTotal : 0, armFrac = eTotal ? eArmored / eTotal : 0;

      for (const b of this.blds) {
        if (!b.built || !b.def.trains.length || b.def.role === 'hq') continue;
        if (b.queue.length >= 1) continue;
        let best = null, bs = Infinity;
        for (const type of b.def.trains) {
          const d = SW.UNITS[type];
          if (g.whyCantTrain(b, type)) continue;
          if (this.p.kyber - d.cost[0] < this.reserve[0] || this.p.gas - d.cost[1] < this.reserve[1]) continue;
          let w = comp[type] || 0.5;
          if (d.cost[1] > 0 && this.p.gas > 400) w *= 1.5 + Math.min(2, this.p.gas / 600);
          const aa = d.weapons.some(x => x.hits.includes('a'));
          if (airFrac > 0.25 && aa) w *= 1 + airFrac * 3;
          if (airFrac > 0.25 && !aa) w *= 0.6;
          if (armFrac > 0.4 && d.weapons.some(x => x.bonus && (x.bonus.armored || x.bonus.mech))) w *= 1.6;
          const s = (have[type] || 0) / w + Math.random() * 0.5;
          if (s < bs) { bs = s; best = type; }
        }
        if (best) {
          g.cmdTrain(b, best);
          have[best] = (have[best] || 0) + SW.UNITS[best].supply;
        }
      }
      // Rally
      const rx = this.home.x + (g.w * T / 2 - this.home.x) * 0.22, ry = this.home.y + (g.h * T / 2 - this.home.y) * 0.22;
      this.rally = { x: rx, y: ry };
      for (const b of this.blds) if (b.def.trains.length && b.def.role !== 'hq') b.rally = { x: rx, y: ry, ent: 0 };
    }

    // ----------------------------------------------------------- military
    military() {
      const g = this.g;
      // Defend: enemies near our buildings
      let threat = null, td = Infinity;
      for (const e of g.list) {
        if (!e.alive || e.owner < 0 || e.owner === this.i || e.kind !== 'unit') continue;
        for (const b of this.blds) {
          const d = SW.dist(e.x, e.y, b.x, b.y);
          if (d < 14 * T && d < td) { td = d; threat = e; }
        }
      }
      if (threat) {
        const defenders = this.army.filter(u => !u.attackGroup || SW.dist(u.x, u.y, threat.x, threat.y) < 30 * T);
        const idle = defenders.filter(u => u.order.type !== 'amove' || !u.target);
        if (idle.length) g.cmdAttackMove(idle, threat.x, threat.y);
        // Desperate: workers fight back if no army
        if (!this.army.length && threat.def.role !== 'worker') {
          const near = this.workers.filter(w => SW.dist(w.x, w.y, threat.x, threat.y) < 8 * T).slice(0, 8);
          if (near.length) g.cmdAttack(near, threat);
        }
        return;
      }
      const waveSize = Math.min(90, this.cfg.wave0 + this.wave * this.cfg.waveGrow);
      const home = this.army.filter(u => !u.attackGroup);
      const homeSupply = home.reduce((s, u) => s + u.def.supply / u.def.spawnCount, 0);
      if (homeSupply >= waveSize || this.p.supplyUsed >= 180 && homeSupply > 10) {
        this.wave++;
        for (const u of home) u.attackGroup = this.wave;
        this.attacking = true;
      }
      // Send attack groups toward the nearest enemy structure (AI knows where you started).
      const target = this.enemyTarget();
      const attackers = this.army.filter(u => u.attackGroup);
      if (target && attackers.length) {
        const idle = attackers.filter(u => u.order.type === 'idle' || (u.order.type === 'amove' && SW.dist(u.order.x, u.order.y, target.x, target.y) > 6 * T));
        if (idle.length) g.cmdAttackMove(idle, target.x, target.y);
      }
      // Keep home army at rally
      const loose = home.filter(u => u.order.type === 'idle' && SW.dist(u.x, u.y, this.rally.x, this.rally.y) > 8 * T);
      if (loose.length) g.cmdAttackMove(loose, this.rally.x, this.rally.y);
    }

    enemyTarget() {
      const g = this.g;
      let best = null, bd = Infinity;
      const from = this.army.find(u => u.attackGroup) || { x: this.home.x, y: this.home.y };
      for (const e of g.list) {
        if (!e.alive || e.owner < 0 || e.owner === this.i || e.kind !== 'building') continue;
        const d = SW.dist(e.x, e.y, from.x, from.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) {
        for (const e of g.list) if (e.alive && e.owner >= 0 && e.owner !== this.i) return e;
      }
      return best;
    }
  }

  SW.AI = AI;
  if (typeof module !== 'undefined') module.exports = SW;
})(globalThis.SW = globalThis.SW || {});
