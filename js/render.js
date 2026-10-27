// Canvas renderer: terrain, entities, effects, fog of war, minimap.
(function (SW) {
  'use strict';
  const T = SW.TILE;
  const { circ, ell, rect, glow } = SW.artHelpers;

  SW.PLANETS = {
    tatooine: {
      name: 'Tatooine', desc: 'Twin-sun desert world',
      ground: ['#d6b273', '#cba365', '#e2c48c', '#c49a5c'], speck: ['#b98f55', '#ecd3a0'],
      rock: '#93603a', rockLight: '#c08452', rockDark: '#5b3a22', mini: '#d0ab6c', miniRock: '#7a4e2e',
    },
    hoth: {
      name: 'Hoth', desc: 'Frozen ice planet',
      ground: ['#e8eef4', '#dbe4ee', '#f4f8fb', '#d2dde9'], speck: ['#c4d2e2', '#ffffff'],
      rock: '#7a8a9c', rockLight: '#aab9c9', rockDark: '#4a5868', mini: '#e2e9f0', miniRock: '#6a7a8c',
    },
    endor: {
      name: 'Endor', desc: 'Forest moon',
      ground: ['#566f36', '#4b6530', '#62803e', '#45592b'], speck: ['#3b5226', '#79994a'],
      rock: '#2e4a21', rockLight: '#4d7432', rockDark: '#182a12', mini: '#56703a', miniRock: '#22381a', trees: true,
    },
  };

  class Renderer {
    constructor(canvas, minimap, game, planet, me) {
      this.cv = canvas; this.c = canvas.getContext('2d');
      this.mm = minimap; this.mc = minimap.getContext('2d');
      this.g = game; this.me = me;
      this.planet = SW.PLANETS[planet] || SW.PLANETS.tatooine;
      this.cam = { x: 0, y: 0, zoom: 1.2 };
      this.fx = []; this.particles = []; this.decals = [];
      this.markers = [];
      this.shake = 0;
      this.frameN = 0;
      this.buildTerrain();
      this.fogCv = document.createElement('canvas');
      this.fogCv.width = game.w; this.fogCv.height = game.h;
      this.fogCtx = this.fogCv.getContext('2d');
      this.fogImg = this.fogCtx.createImageData(game.w, game.h);
      this.resize();
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.dpr = dpr;
      this.vw = window.innerWidth; this.vh = window.innerHeight;
      this.cv.width = this.vw * dpr; this.cv.height = this.vh * dpr;
      this.cv.style.width = this.vw + 'px'; this.cv.style.height = this.vh + 'px';
    }

    // ------------------------------------------------------------- terrain
    buildTerrain() {
      const g = this.g, P = this.planet;
      const W = g.w, H = g.h;
      const rand = SW.rng(g.map.seed * 7 + 3);
      const cv = document.createElement('canvas');
      cv.width = W * T; cv.height = H * T;
      const c = cv.getContext('2d');
      // low-res colour field upscaled for smooth variation
      const lo = document.createElement('canvas');
      lo.width = W; lo.height = H;
      const lc = lo.getContext('2d');
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const v = (Math.sin(x * 0.21 + y * 0.13) + Math.sin(x * 0.07 - y * 0.19) + rand() * 0.8);
        const idx = Math.max(0, Math.min(P.ground.length - 1, Math.floor((v + 2) / 4.8 * P.ground.length)));
        lc.fillStyle = P.ground[idx];
        lc.fillRect(x, y, 1, 1);
      }
      c.imageSmoothingEnabled = true;
      c.drawImage(lo, 0, 0, W * T, H * T);
      // dune / drift streaks
      c.globalAlpha = 0.12;
      for (let i = 0; i < W * H / 6; i++) {
        const x = rand() * W * T, y = rand() * H * T;
        c.strokeStyle = P.speck[i % 2];
        c.lineWidth = 1 + rand() * 2;
        c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 20, y - 6 * rand(), x + 40 + rand() * 30, y + (rand() - 0.5) * 8); c.stroke();
      }
      c.globalAlpha = 1;
      // speckles
      for (let i = 0; i < W * H * 4; i++) {
        const x = rand() * W * T, y = rand() * H * T;
        c.fillStyle = P.speck[(rand() * 2) | 0];
        c.globalAlpha = 0.25 + rand() * 0.35;
        if (P.trees) { c.fillRect(x, y, 1, 3 + rand() * 3); } else c.fillRect(x, y, 1.5, 1.5);
      }
      c.globalAlpha = 1;
      // doodads
      for (const d of g.map.doodads) {
        if (d.onRock) continue;
        const x = d.x * T, y = d.y * T;
        if (P.trees) {
          if (d.k < 0.5) { for (let i = 0; i < 5; i++) { const a = i * 1.25 + d.r; c.strokeStyle = '#3d5a24'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); c.stroke(); } }
          else ell(c, x, y, 5 + d.r * 4, 4 + d.r * 3, '#3f5a28');
        } else {
          ell(c, x + 2, y + 2, 3 + d.r * 5, 2 + d.r * 3, 'rgba(0,0,0,0.18)');
          ell(c, x, y, 3 + d.r * 5, 2 + d.r * 3, d.k < 0.5 ? P.rockDark : P.rock);
          ell(c, x - 1, y - 1, 1.5 + d.r * 2.5, 1 + d.r * 1.5, P.rockLight);
        }
      }
      // rocks / trees: three passes (shadow, body, highlight)
      const rocks = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g.terrain[y * W + x]) rocks.push([x, y, rand(), rand(), rand()]);
      for (const [x, y, a, b] of rocks) circ(c, (x + 0.5) * T + 7, (y + 0.5) * T + 9, T * (0.62 + a * 0.18), 'rgba(0,0,0,0.25)');
      for (const [x, y, a, b] of rocks) circ(c, (x + 0.5) * T + (b - 0.5) * 8, (y + 0.5) * T + (a - 0.5) * 8, T * (0.62 + a * 0.18), P.rockDark);
      for (const [x, y, a, b] of rocks) circ(c, (x + 0.5) * T + (b - 0.5) * 8 - 2, (y + 0.5) * T + (a - 0.5) * 8 - 3, T * (0.52 + a * 0.15), P.rock);
      for (const [x, y, a, b, k] of rocks) {
        circ(c, (x + 0.5) * T + (b - 0.5) * 8 - 6, (y + 0.5) * T + (a - 0.5) * 8 - 8, T * (0.22 + k * 0.14), P.rockLight);
        if (P.trees) {
          for (let i = 0; i < 4; i++) {
            const ang = k * 6 + i * 1.6;
            circ(c, (x + 0.5) * T + Math.cos(ang) * 9, (y + 0.5) * T + Math.sin(ang) * 9, 5 + a * 3, i % 2 ? P.rock : P.rockLight);
          }
        }
      }
      this.terrain = cv;

      // minimap base
      const mb = document.createElement('canvas');
      mb.width = W; mb.height = H;
      const mc = mb.getContext('2d');
      mc.fillStyle = P.mini; mc.fillRect(0, 0, W, H);
      mc.fillStyle = P.miniRock;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g.terrain[y * W + x]) mc.fillRect(x, y, 1, 1);
      this.miniBase = mb;
    }

    // ------------------------------------------------------------- effects
    consumeEvents(audio) {
      const g = this.g;
      for (const ev of g.events) {
        if (ev.type === 'shot') {
          const visible = this.visibleAt(ev.x, ev.y) || this.visibleAt(ev.tx, ev.ty);
          if (!visible) continue;
          const fy = ev.fromAir ? -14 : 0, ty = ev.toAir ? -14 : 0;
          const d = Math.hypot(ev.tx - ev.x, ev.ty - ev.y);
          const speed = ev.kind === 'missile' ? 420 : ev.kind === 'bomb' ? 260 : 950;
          const dur = Math.min(0.6, Math.max(0.05, d / speed));
          for (let i = 0; i < Math.min(ev.count, 3); i++) {
            const off = (i - (ev.count - 1) / 2) * 5;
            this.fx.push({ k: ev.kind, x: ev.x + off * 0.3, y: ev.y + fy + off, tx: ev.tx + (Math.random() - 0.5) * 6, ty: ev.ty + ty + (Math.random() - 0.5) * 6, t: -i * 0.06, dur, color: ev.color, splash: ev.splash });
          }
          if (audio) audio.shot(ev.kind, ev.x, ev.y, this, ev.srcType);
        } else if (ev.type === 'death') {
          if (!this.visibleAt(ev.x, ev.y)) continue;
          this.explode(ev.x, ev.y - (ev.air ? 14 : 0), ev.r, ev.building);
          if (ev.building) this.decals.push({ x: ev.x, y: ev.y, r: ev.r, t: 0 });
          else if (ev.r > 10 && !ev.air) this.decals.push({ x: ev.x, y: ev.y, r: ev.r * 0.8, t: 0 });
          if (audio) audio.explosion(ev.r, ev.x, ev.y, this);
        } else if (ev.type === 'complete' && ev.owner === this.me) {
          if (audio) audio.ui('complete');
        } else if (ev.type === 'spawn' && ev.owner === this.me) {
          if (audio) audio.ui('spawn');
        }
      }
      g.events.length = 0;
    }

    explode(x, y, r, big) {
      const n = Math.min(40, 6 + r * (big ? 0.8 : 0.6));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = (20 + Math.random() * 60) * (big ? 1.8 : 1) * (0.5 + r / 20);
        this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.6, t: 0, r: 2 + Math.random() * r * 0.35, k: i % 3 });
      }
      this.fx.push({ k: 'boom', x, y, t: 0, dur: big ? 0.9 : 0.45, r: r * (big ? 2.2 : 1.6) });
      if (big || r > 18) this.shake = Math.min(8, this.shake + (big ? 5 : 2));
    }

    visibleAt(x, y) {
      const g = this.g;
      if (g.noFog || this.revealAll) return true;
      const tx = Math.floor(x / T), ty = Math.floor(y / T);
      if (tx < 0 || ty < 0 || tx >= g.w || ty >= g.h) return false;
      return !!g.players[this.me].vis[ty * g.w + tx];
    }

    // --------------------------------------------------------------- frame
    frame(dt, ui) {
      const c = this.c, g = this.g, cam = this.cam;
      this.frameN++;
      const z = cam.zoom * this.dpr;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = '#000'; c.fillRect(0, 0, this.cv.width, this.cv.height);
      let sx = 0, sy = 0;
      if (this.shake > 0) { sx = (Math.random() - 0.5) * this.shake; sy = (Math.random() - 0.5) * this.shake; this.shake = Math.max(0, this.shake - dt * 20); }
      c.setTransform(z, 0, 0, z, (-cam.x + sx) * z, (-cam.y + sy) * z);
      const vw = this.vw / cam.zoom, vh = this.vh / cam.zoom;
      const view = { x0: cam.x - 64, y0: cam.y - 64, x1: cam.x + vw + 64, y1: cam.y + vh + 64 };
      const inView = (e) => e.x > view.x0 && e.x < view.x1 && e.y > view.y0 && e.y < view.y1;

      // terrain
      const srcX = Math.max(0, cam.x), srcY = Math.max(0, cam.y);
      const srcW = Math.min(this.terrain.width - srcX, vw + 2), srcH = Math.min(this.terrain.height - srcY, vh + 2);
      if (srcW > 0 && srcH > 0) c.drawImage(this.terrain, srcX, srcY, srcW, srcH, srcX, srcY, srcW, srcH);

      // scorch decals
      for (let i = this.decals.length - 1; i >= 0; i--) {
        const d = this.decals[i];
        d.t += dt;
        if (d.t > 90) { this.decals.splice(i, 1); continue; }
        c.globalAlpha = Math.min(0.45, (90 - d.t) / 30 * 0.45);
        ell(c, d.x, d.y, d.r * 1.1, d.r * 0.9, '#1a1410');
        c.globalAlpha = 1;
      }

      const t = g.time;
      const me = this.me;
      const sel = ui ? ui.selSet : new Set();
      const ground = [], air = [];
      for (const e of g.list) {
        if (!e.alive || !inView(e) || e.hidden) continue;
        if (e.kind === 'resource') { if (this.explored(e)) ground.push(e); continue; }
        const vis = this.isVis(e);
        if (e.kind === 'building') {
          if (vis) e.seen = true;
          if (!vis && !(e.seen && this.explored(e))) continue;
        } else if (!vis) continue;
        if (e.air) air.push(e); else ground.push(e);
      }
      ground.sort((a, b) => (a.kind === 'unit' ? a.y : a.y - 20) - (b.kind === 'unit' ? b.y : b.y - 20));
      air.sort((a, b) => a.y - b.y);

      // selection rings under ground
      for (const e of ground) if (sel.has(e.id)) this.selRing(e, 0);
      for (const e of ground) this.drawEntity(e, t);
      this.drawFx(dt, false);
      // air shadows, rings, bodies
      for (const e of air) ell(c, e.x + 6, e.y + 10, e.r * 0.9, e.r * 0.6, 'rgba(0,0,0,0.25)');
      for (const e of air) if (sel.has(e.id)) this.selRing(e, -14);
      for (const e of air) this.drawEntity(e, t);
      this.drawFx(dt, true);
      this.drawParticles(dt);

      // fog
      if (!g.noFog && !this.revealAll) {
        if (this.frameN % 4 === 1) this.updateFog();
        c.imageSmoothingEnabled = true;
        c.drawImage(this.fogCv, 0, 0, g.w * T, g.h * T);
      }

      // bars
      for (const e of ground.concat(air)) {
        if (e.kind === 'resource') continue;
        if (!this.isVis(e)) continue;
        const damaged = e.hp < e.maxHp || (e.maxSh && e.sh < e.maxSh);
        if (sel.has(e.id) || damaged || (ui && ui.hover === e) || (ui && ui.showBars)) this.bars(e);
      }
      if (ui) ui.drawWorldOverlay(c, this);

      // markers
      for (let i = this.markers.length - 1; i >= 0; i--) {
        const m = this.markers[i];
        m.t += dt;
        if (m.t > 0.6) { this.markers.splice(i, 1); continue; }
        const f = m.t / 0.6;
        c.globalAlpha = 1 - f;
        ell(c, m.x, m.y, 12 * (1 - f * 0.6), 7 * (1 - f * 0.6), null, m.color, 2);
        c.globalAlpha = 1;
      }

      c.setTransform(1, 0, 0, 1, 0, 0);
      if (this.frameN % 3 === 0) this.drawMinimap(ui);
    }

    explored(e) {
      const g = this.g;
      if (g.noFog || this.revealAll) return true;
      const ex = g.players[this.me].explored;
      for (let y = e.ty; y < e.ty + e.th; y++) for (let x = e.tx; x < e.tx + e.tw; x++) if (ex[y * g.w + x]) return true;
      return false;
    }

    isVis(e) { return this.revealAll || this.g.isVisible(this.me, e); }

    selRing(e, yo) {
      const c = this.c;
      const col = e.owner === this.me ? '#4cff6a' : e.owner < 0 ? '#ffe14c' : '#ff4c4c';
      if (e.kind === 'building' || e.kind === 'resource') {
        c.strokeStyle = col; c.lineWidth = 1.5;
        c.strokeRect(e.tx * T + 1, e.ty * T + 1, e.tw * T - 2, e.th * T - 2);
        return;
      }
      ell(this.c, e.x, e.y + yo + e.r * 0.25, e.r + 3, (e.r + 3) * 0.7, null, col, 1.5);
    }

    drawEntity(e, t) {
      const c = this.c;
      if (e.kind === 'resource') {
        c.save(); c.translate(e.x, e.y);
        SW.drawResource(c, e, t);
        c.restore();
        return;
      }
      const team = this.g.players[e.owner].color;
      if (e.kind === 'building') {
        const w = e.tw * T, h = e.th * T;
        c.save(); c.translate(e.x, e.y);
        const vis = this.isVis(e);
        // shadow
        const round = e.def.faction !== 'empire' && (e.tw === e.th || e.def.role === 'starport');
        if (round) ell(c, 6, 8, w * 0.47, h * 0.47, 'rgba(0,0,0,0.22)');
        else SW.artHelpers.rrect(c, -w / 2 + 8, -h / 2 + 10, w - 6, h - 6, 8, 'rgba(0,0,0,0.22)');
        if (!e.built) {
          c.globalAlpha = 0.35 + 0.65 * e.progress;
          SW.drawBuildingArt(c, e.def, w, h, team, { t, angle: e.angle, built: false, firing: 0 });
          c.globalAlpha = 1;
          c.strokeStyle = 'rgba(255,220,120,0.8)'; c.setLineDash([5, 4]); c.lineWidth = 1.5;
          c.strokeRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4); c.setLineDash([]);
          // scaffold lines
          c.strokeStyle = 'rgba(255,220,120,0.35)';
          for (let i = -w / 2; i < w / 2; i += 10) { c.beginPath(); c.moveTo(i, -h / 2); c.lineTo(i + h * 0.5, h / 2); c.stroke(); }
        } else {
          SW.drawBuildingArt(c, e.def, w, h, team, { t, angle: e.angle, built: true, firing: e.firing });
          if (e.queue.length) glow(c, 0, 0, Math.min(w, h) * 0.3, 'rgba(255,255,200,0.6)', 0.15 + 0.1 * Math.sin(t * 5));
        }
        if (e.maxSh && e.sh > 0 && this.g.time - e.lastHit < 0.4) {
          c.globalAlpha = 0.35;
          c.strokeStyle = '#8fd0ff'; c.lineWidth = 3;
          c.strokeRect(-w / 2, -h / 2, w, h);
          c.globalAlpha = 1;
        }
        if (!vis) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(-w / 2, -h / 2, w, h); }
        c.restore();
        return;
      }
      const yo = e.air ? -14 + Math.sin(t * 2 + e.id) * 1.5 : 0;
      if (!e.air) ell(c, e.x + 2, e.y + 3, e.r * 1.05, e.r * 0.75, 'rgba(0,0,0,0.22)');
      c.save();
      c.translate(e.x, e.y + yo);
      c.rotate(e.angle);
      c.scale(1.2, 1.2);
      SW.drawUnit(c, e, team, t);
      c.restore();
      // shield flash
      if (e.maxSh && e.sh > 0 && this.g.time - e.lastHit < 0.25 && e.def.art !== 'droideka') {
        c.globalAlpha = 0.5;
        circ(c, e.x, e.y + yo, e.r + 4, null, '#8fd0ff', 1.5);
        c.globalAlpha = 1;
      }
    }

    bars(e) {
      const c = this.c;
      const isB = e.kind === 'building';
      const w = isB ? e.tw * T * 0.7 : Math.max(16, e.r * 2.2);
      const x = e.x - w / 2;
      const y = isB ? e.ty * T - 6 : e.y - e.r - (e.air ? 22 : 8);
      const f = Math.max(0, e.hp / e.maxHp);
      rect(c, x - 1, y - 1, w + 2, e.maxSh ? 6 : 4, 'rgba(0,0,0,0.7)');
      rect(c, x, y, w * f, 2.5, f > 0.6 ? '#3ce05a' : f > 0.3 ? '#f2c230' : '#f04030');
      if (e.maxSh) rect(c, x, y + 2.8, w * (e.sh / e.maxSh), 2, '#5ab0ff');
      if (isB && !e.built) { rect(c, x, y - 5, w, 3, 'rgba(0,0,0,0.7)'); rect(c, x, y - 5, w * e.progress, 3, '#ffd23a'); }
      else if (isB && e.queue.length) { rect(c, x, y - 5, w, 3, 'rgba(0,0,0,0.7)'); rect(c, x, y - 5, w * e.queue[0].progress, 3, '#7ad9ff'); }
    }

    drawFx(dt, airPass) {
      const c = this.c;
      for (let i = this.fx.length - 1; i >= 0; i--) {
        const f = this.fx[i];
        const top = f.k === 'boom' || f.k === 'melee';
        if (top !== airPass) continue;
        f.t += dt;
        if (f.t < 0) continue;
        const p = Math.min(1, f.t / f.dur);
        if (f.k === 'boom') {
          const r = f.r * (0.4 + p * 0.8);
          glow(c, f.x, f.y, r * 1.6, 'rgba(255,190,90,0.9)', (1 - p) * 0.8);
          circ(c, f.x, f.y, r * 0.6, `rgba(255,240,200,${(1 - p) * 0.9})`);
          ell(c, f.x, f.y, r * 1.3, r * 1.1, null, `rgba(255,140,60,${(1 - p) * 0.6})`, 2);
        } else if (f.k === 'melee') {
          glow(c, f.tx, f.ty, 5, 'rgba(255,255,200,0.9)', 1 - p);
        } else {
          const x = f.x + (f.tx - f.x) * p, y = f.y + (f.ty - f.y) * p;
          if (f.k === 'bomb') {
            circ(c, x, y, 3, '#222', f.color, 1);
            glow(c, x, y, 6, f.color, 0.5);
          } else if (f.k === 'missile') {
            glow(c, x, y, 5, 'rgba(255,200,120,0.9)', 0.9);
            circ(c, x, y, 1.6, '#fff');
            this.particles.push({ x, y, vx: 0, vy: 0, life: 0.4, t: 0, r: 2.5, k: 3 });
          } else {
            const len = f.k === 'heavy' ? 22 : f.k === 'cannon' ? 14 : 10;
            const d = Math.hypot(f.tx - f.x, f.ty - f.y) || 1;
            const ux = (f.tx - f.x) / d, uy = (f.ty - f.y) / d;
            c.lineCap = 'round';
            c.strokeStyle = f.color; c.globalAlpha = 0.45;
            c.lineWidth = f.k === 'heavy' ? 7 : f.k === 'cannon' ? 5 : 3.5;
            c.beginPath(); c.moveTo(x - ux * len, y - uy * len); c.lineTo(x, y); c.stroke();
            c.globalAlpha = 1; c.strokeStyle = '#fff';
            c.lineWidth = f.k === 'heavy' ? 2.5 : 1.3;
            c.beginPath(); c.moveTo(x - ux * len * 0.8, y - uy * len * 0.8); c.lineTo(x, y); c.stroke();
            c.lineCap = 'butt';
          }
        }
        if (f.t >= f.dur) {
          this.fx.splice(i, 1);
          if (f.k !== 'boom') {
            if (f.splash) this.fx.push({ k: 'boom', x: f.tx, y: f.ty, t: 0, dur: 0.35, r: f.splash * T * 0.7 });
            else this.fx.push({ k: 'melee', tx: f.tx, ty: f.ty, t: 0, dur: 0.12 });
          }
        }
      }
    }

    drawParticles(dt) {
      const c = this.c;
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.t += dt;
        if (p.t > p.life) { this.particles.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.92; p.vy *= 0.92;
        const f = p.t / p.life;
        if (p.k === 3) { c.globalAlpha = (1 - f) * 0.35; circ(c, p.x, p.y, p.r * (1 + f), '#bbb'); }
        else if (p.k === 0) { c.globalAlpha = 1 - f; circ(c, p.x, p.y, p.r * (1 - f * 0.5), '#ffcf6a'); }
        else if (p.k === 1) { c.globalAlpha = 1 - f; circ(c, p.x, p.y, p.r * (0.6 + f), '#ff7a2a'); }
        else { c.globalAlpha = (1 - f) * 0.6; circ(c, p.x, p.y - f * 10, p.r * (1 + f * 1.5), '#333'); }
      }
      c.globalAlpha = 1;
      if (this.particles.length > 1500) this.particles.splice(0, this.particles.length - 1500);
    }

    updateFog() {
      const g = this.g, p = g.players[this.me];
      const d = this.fogImg.data;
      for (let i = 0, n = g.w * g.h; i < n; i++) {
        const a = p.vis[i] ? 0 : p.explored[i] ? 125 : 255;
        d[i * 4] = 4; d[i * 4 + 1] = 6; d[i * 4 + 2] = 12; d[i * 4 + 3] = a;
      }
      this.fogCtx.putImageData(this.fogImg, 0, 0);
    }

    // ------------------------------------------------------------- minimap
    drawMinimap(ui) {
      const g = this.g, mc = this.mc, s = this.mm.width / g.w;
      mc.imageSmoothingEnabled = false;
      mc.drawImage(this.miniBase, 0, 0, this.mm.width, this.mm.height);
      for (const e of g.list) {
        if (!e.alive || e.hidden) continue;
        if (e.kind === 'resource') {
          if (!this.explored(e)) continue;
          mc.fillStyle = e.rkind === 'kyber' ? '#6fe3ff' : '#ff9a3a';
          mc.fillRect(e.tx * s, e.ty * s, e.tw * s, e.th * s);
          continue;
        }
        const vis = this.isVis(e);
        if (!vis && !(e.kind === 'building' && e.seen)) continue;
        mc.fillStyle = e.owner === this.me ? '#4cff6a' : g.players[e.owner].color;
        if (e.kind === 'building') mc.fillRect(e.tx * s, e.ty * s, e.tw * s, e.th * s);
        else { const r = Math.max(2, e.r / T * s * 2); mc.fillRect(e.x / T * s - r / 2, e.y / T * s - r / 2, r, r); }
      }
      if (!g.noFog && !this.revealAll) {
        mc.imageSmoothingEnabled = true;
        mc.drawImage(this.fogCv, 0, 0, this.mm.width, this.mm.height);
      }
      // pings
      if (ui) for (const p of ui.pings) {
        const f = (g.time - p.t) / 3;
        if (f > 1) continue;
        mc.strokeStyle = `rgba(255,60,60,${1 - f})`; mc.lineWidth = 2;
        mc.beginPath(); mc.arc(p.x / T * s, p.y / T * s, 4 + f * 18, 0, Math.PI * 2); mc.stroke();
      }
      const cam = this.cam;
      mc.strokeStyle = '#fff'; mc.lineWidth = 1;
      mc.strokeRect(cam.x / T * s, cam.y / T * s, this.vw / cam.zoom / T * s, this.vh / cam.zoom / T * s);
    }

    worldToScreen(x, y) { return [(x - this.cam.x) * this.cam.zoom, (y - this.cam.y) * this.cam.zoom]; }
    screenToWorld(x, y) { return [x / this.cam.zoom + this.cam.x, y / this.cam.zoom + this.cam.y]; }

    clampCam() {
      const g = this.g, cam = this.cam;
      const vw = this.vw / cam.zoom, vh = this.vh / cam.zoom;
      cam.x = Math.max(-40, Math.min(g.w * T - vw + 40, cam.x));
      cam.y = Math.max(-40, Math.min(g.h * T - vh + 220 / cam.zoom, cam.y));
    }

    centerOn(x, y) {
      this.cam.x = x - this.vw / this.cam.zoom / 2;
      this.cam.y = y - (this.vh - 180) / this.cam.zoom / 2;
      this.clampCam();
    }
  }

  SW.Renderer = Renderer;
})(globalThis.SW = globalThis.SW || {});
