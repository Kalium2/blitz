// Player input, selection, command card, HUD panels.
(function (SW) {
  'use strict';
  const T = SW.TILE;
  const $ = (id) => document.getElementById(id);

  function fmtCost(def) {
    let s = `<span class="c-k">${def.cost[0]}</span>`;
    if (def.cost[1]) s += ` <span class="c-g">${def.cost[1]}</span>`;
    if (def.supply) s += ` <span class="c-s">${def.supply}</span>`;
    s += ` <span class="c-t">${def.time}s</span>`;
    return s;
  }

  function weaponText(def) {
    return def.weapons.map(w => {
      let s = `${w.dmg}${w.count > 1 ? '×' + w.count : ''} dmg`;
      if (w.bonus) s += ' (' + Object.entries(w.bonus).map(([k, v]) => `+${v} vs ${k}`).join(', ') + ')';
      s += ` · range ${w.range}`;
      s += ` · ${w.hits === 'ga' ? 'ground & air' : w.hits === 'a' ? 'air only' : 'ground only'}`;
      if (w.splash) s += ' · splash';
      s += ` · ${(1 / w.cd * (w.count || 1) * w.dmg).toFixed(1)} dps`;
      return s;
    }).join('<br>');
  }
  SW.weaponText = weaponText;

  class UI {
    constructor(game, renderer, audio, me, opts) {
      this.g = game; this.r = renderer; this.audio = audio; this.me = me;
      this.opts = opts || {};
      this.sel = []; this.selSet = new Set();
      this.groups = {};
      this.mode = null;
      this.menu = 'main';
      this.drag = null;
      this.mouse = { x: 0, y: 0, in: false, wx: 0, wy: 0 };
      this.keys = {};
      this.pings = [];
      this.hover = null;
      this.lastClick = { t: 0, id: 0 };
      this.lastGroupKey = { k: null, t: 0 };
      this.lastAlert = -99;
      this.cardSig = null; this.infoSig = null;
      this.paused = false;
      this.showBars = false;
      this.msgs = [];
      this.bind();
    }

    get p() { return this.g.players[this.me]; }

    // -------------------------------------------------------------- input
    bind() {
      const cv = this.r.cv;
      this.handlers = [];
      const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); this.handlers.push([el, ev, fn, o]); };
      on(cv, 'contextmenu', e => e.preventDefault());
      on(cv, 'mousedown', e => this.onDown(e));
      on(window, 'mousemove', e => this.onMove(e));
      on(window, 'mouseup', e => this.onUp(e));
      on(cv, 'wheel', e => this.onWheel(e), { passive: false });
      on(document, 'mouseleave', () => { this.mouse.in = false; });
      on(document, 'mouseenter', () => { this.mouse.in = true; });
      on(window, 'keydown', e => this.onKey(e, true));
      on(window, 'keyup', e => this.onKey(e, false));
      on(window, 'blur', () => { this.keys = {}; });
      const mm = this.r.mm;
      on(mm, 'contextmenu', e => e.preventDefault());
      on(mm, 'mousedown', e => this.onMini(e, true));
      on(mm, 'mousemove', e => { if (this.miniDrag) this.onMini(e, false); });
      on(window, 'mouseup', () => { this.miniDrag = false; });
      on($('panel'), 'contextmenu', e => e.preventDefault());
    }

    destroy() {
      for (const [el, ev, fn, o] of this.handlers) el.removeEventListener(ev, fn, o);
    }

    world(e) {
      return this.r.screenToWorld(e.clientX, e.clientY);
    }

    onWheel(e) {
      e.preventDefault();
      const cam = this.r.cam;
      const [wx, wy] = this.world(e);
      cam.zoom = Math.max(0.55, Math.min(1.6, cam.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      cam.x = wx - e.clientX / cam.zoom; cam.y = wy - e.clientY / cam.zoom;
      this.r.clampCam();
    }

    onMini(e, down) {
      e.preventDefault();
      const rc = this.r.mm.getBoundingClientRect();
      const fx = (e.clientX - rc.left) / rc.width, fy = (e.clientY - rc.top) / rc.height;
      const wx = fx * this.g.w * T, wy = fy * this.g.h * T;
      if (down && e.button === 2) { this.command(wx, wy, null, e.shiftKey); return; }
      if (down && e.button === 0 && this.mode && this.mode.type === 'target') { this.targetClick(wx, wy, null, e.shiftKey); return; }
      if (e.buttons & 1 || down) { this.miniDrag = true; this.r.centerOn(wx, wy); }
    }

    onDown(e) {
      this.audio.ensure();
      const [wx, wy] = this.world(e);
      if (e.button === 2) {
        if (this.mode) { this.mode = null; return; }
        const t = this.pick(wx, wy);
        this.command(wx, wy, t, e.shiftKey);
        return;
      }
      if (e.button === 1) { this.pan = { x: e.clientX, y: e.clientY, cx: this.r.cam.x, cy: this.r.cam.y }; e.preventDefault(); return; }
      if (e.button !== 0) return;
      if (this.mode && this.mode.type === 'place') { this.placeClick(e.shiftKey); return; }
      if (this.mode && this.mode.type === 'target') { this.targetClick(wx, wy, this.pick(wx, wy), e.shiftKey); return; }
      this.drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
    }

    onMove(e) {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.in = true;
      const [wx, wy] = this.world(e);
      this.mouse.wx = wx; this.mouse.wy = wy;
      if (this.drag) { this.drag.x1 = e.clientX; this.drag.y1 = e.clientY; }
      if (this.pan) {
        this.r.cam.x = this.pan.cx - (e.clientX - this.pan.x) / this.r.cam.zoom;
        this.r.cam.y = this.pan.cy - (e.clientY - this.pan.y) / this.r.cam.zoom;
        this.r.clampCam();
      }
    }

    onUp(e) {
      if (e.button === 1) { this.pan = null; return; }
      if (e.button !== 0 || !this.drag) return;
      const d = this.drag;
      this.drag = null;
      const [ax, ay] = this.r.screenToWorld(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1));
      const [bx, by] = this.r.screenToWorld(Math.max(d.x0, d.x1), Math.max(d.y0, d.y1));
      if (Math.abs(d.x1 - d.x0) < 5 && Math.abs(d.y1 - d.y0) < 5) {
        const t = this.pick(ax, ay);
        const now = performance.now();
        if (t && (d.ctrl || (this.lastClick.id === t.id && now - this.lastClick.t < 350))) {
          // select all of this type on screen
          const list = this.visibleOwned().filter(e => e.type === t.type && e.owner === t.owner);
          this.setSel(d.shift ? this.sel.concat(list) : list);
        } else if (t) {
          if (d.shift && t.owner === this.me && this.sel.length && this.sel[0].owner === this.me) {
            if (this.selSet.has(t.id)) this.setSel(this.sel.filter(e => e !== t));
            else this.setSel(this.sel.concat([t]));
          } else this.setSel([t]);
        } else if (!d.shift) this.setSel([]);
        this.lastClick = { t: now, id: t ? t.id : 0 };
        return;
      }
      const inBox = [];
      for (const e of this.g.list) {
        if (!e.alive || e.owner !== this.me || e.kind !== 'unit' || e.hidden) continue;
        const ey = e.air ? e.y - 14 : e.y;
        if (e.x + e.r >= ax && e.x - e.r <= bx && ey + e.r >= ay && ey - e.r <= by) inBox.push(e);
      }
      if (inBox.length) this.setSel(d.shift ? this.sel.filter(e => e.owner === this.me).concat(inBox) : inBox);
      else if (!d.shift) {
        const bs = this.g.list.filter(e => e.alive && e.owner === this.me && e.kind === 'building' &&
          e.tx * T < bx && (e.tx + e.tw) * T > ax && e.ty * T < by && (e.ty + e.th) * T > ay);
        this.setSel(bs.slice(0, 1));
      }
    }

    visibleOwned() {
      const r = this.r, cam = r.cam;
      const x1 = cam.x + r.vw / cam.zoom, y1 = cam.y + (r.vh - 190) / cam.zoom;
      return this.g.list.filter(e => e.alive && !e.hidden && e.kind !== 'resource' && e.x >= cam.x && e.x <= x1 && e.y >= cam.y && e.y <= y1 && this.r.isVis(e));
    }

    pick(wx, wy) {
      const g = this.g;
      let best = null, bd = Infinity;
      for (const e of g.list) {
        if (!e.alive || e.hidden || e.kind !== 'unit') continue;
        if (!this.r.isVis(e)) continue;
        const ey = e.air ? e.y - 14 : e.y;
        const d = Math.hypot(e.x - wx, ey - wy);
        if (d < e.r + 5 && d < bd) { bd = d; best = e; }
      }
      if (best) return best;
      for (const e of g.list) {
        if (!e.alive || (e.kind !== 'building' && e.kind !== 'resource')) continue;
        if (wx >= e.tx * T && wx <= (e.tx + e.tw) * T && wy >= e.ty * T && wy <= (e.ty + e.th) * T) {
          if (e.kind === 'building' && !this.r.isVis(e) && !e.seen) continue;
          if (e.kind === 'resource' && !this.r.explored(e)) continue;
          // an extractor sits over its geyser: prefer the building
          if (e.kind === 'resource' && e.extractor && g.get(e.extractor)) return g.get(e.extractor);
          return e;
        }
      }
      return null;
    }

    setSel(list) {
      const seen = new Set();
      list = list.filter(e => e && e.alive && !seen.has(e.id) && seen.add(e.id));
      // never mix own and foreign
      if (list.some(e => e.owner === this.me)) list = list.filter(e => e.owner === this.me);
      else list = list.slice(0, 1);
      // units take priority over buildings in multi-select
      if (list.length > 1 && list.some(e => e.kind === 'unit')) list = list.filter(e => e.kind === 'unit');
      this.sel = list;
      this.selSet = new Set(list.map(e => e.id));
      this.menu = 'main';
      if (this.mode && this.mode.type === 'place' && !list.some(e => e.def && e.def.role === 'worker')) this.mode = null;
      this.cardSig = null; this.infoSig = null;
    }

    pruneSel() {
      if (this.sel.some(e => !e.alive || e.hidden && false)) {
        this.sel = this.sel.filter(e => e.alive);
        this.selSet = new Set(this.sel.map(e => e.id));
        this.cardSig = '';
      }
    }

    command(wx, wy, target, queue) {
      const own = this.sel.filter(e => e.owner === this.me);
      if (!own.length) return;
      const units = own.filter(e => e.kind === 'unit');
      const blds = own.filter(e => e.kind === 'building' && e.def.trains.length);
      if (units.length) {
        const r = this.g.cmdSmart(units, wx, wy, target, this.me, queue);
        this.r.markers.push({ x: wx, y: wy, t: 0, color: r === 'attack' ? '#ff4040' : '#4cff6a' });
        this.audio.ui('click');
      } else if (blds.length) {
        this.g.cmdRally(blds, wx, wy, target);
        this.r.markers.push({ x: wx, y: wy, t: 0, color: '#ffd23a' });
        this.audio.ui('click');
      }
    }

    targetClick(wx, wy, target, queue) {
      const m = this.mode;
      const units = this.sel.filter(e => e.owner === this.me && e.kind === 'unit');
      if (m.cmd === 'attack') {
        if (target && target.owner >= 0 && target.owner !== this.me) this.g.cmdAttack(units, target, queue);
        else this.g.cmdAttackMove(units, wx, wy, queue);
        this.r.markers.push({ x: wx, y: wy, t: 0, color: '#ff4040' });
      } else if (m.cmd === 'move') {
        this.g.cmdMove(units, wx, wy, queue);
        this.r.markers.push({ x: wx, y: wy, t: 0, color: '#4cff6a' });
      } else if (m.cmd === 'gather') {
        if (target) this.g.cmdSmart(units, wx, wy, target, this.me, queue);
      } else if (m.cmd === 'rally') {
        this.g.cmdRally(this.sel.filter(e => e.kind === 'building'), wx, wy, target);
        this.r.markers.push({ x: wx, y: wy, t: 0, color: '#ffd23a' });
      }
      this.audio.ui('click');
      if (!queue) this.mode = null;
    }

    placeSpot() {
      const def = SW.BUILDINGS[this.mode.btype];
      const [w, h] = def.size;
      const wx = this.mouse.wx, wy = this.mouse.wy;
      if (def.onGeyser) {
        for (const e of this.g.list) {
          if (e.alive && e.kind === 'resource' && e.rkind === 'gas' && wx >= e.tx * T - 16 && wx <= (e.tx + e.tw) * T + 16 && wy >= e.ty * T - 16 && wy <= (e.ty + e.th) * T + 16) return [e.tx, e.ty];
        }
      }
      return [Math.floor(wx / T - w / 2 + 0.5), Math.floor(wy / T - h / 2 + 0.5)];
    }

    placeClick(shift) {
      const [tx, ty] = this.placeSpot();
      const workers = this.sel.filter(e => e.kind === 'unit' && e.def.role === 'worker');
      if (!workers.length) { this.mode = null; return; }
      const def = SW.BUILDINGS[this.mode.btype];
      const cx = (tx + def.size[0] / 2) * T, cy = (ty + def.size[1] / 2) * T;
      workers.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
      const exploredOk = this.exploredRect(tx, ty, def.size[0], def.size[1]);
      const why = exploredOk ? this.g.cmdBuild(workers[0], this.mode.btype, tx, ty, shift) : "Can't build in unexplored area";
      if (why) { this.flash(why); return; }
      this.audio.ui('click');
      if (!shift) this.mode = null;
    }

    exploredRect(tx, ty, w, h) {
      const ex = this.p.explored, W = this.g.w;
      for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) {
        if (x < 0 || y < 0 || x >= W || y >= this.g.h || !ex[y * W + x]) return false;
      }
      return true;
    }

    onKey(e, down) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      const k = e.key;
      this.keys[k] = down;
      if (!down) { if (k === 'Alt') this.showBars = false; return; }
      if (k === 'Alt') { this.showBars = true; e.preventDefault(); return; }
      if (k === 'F10' || k === 'p' || k === 'P') { e.preventDefault(); if (this.opts.onPause) this.opts.onPause(); return; }
      if (this.paused) return;
      if (k === 'Escape') {
        if (this.mode) this.mode = null;
        else if (this.menu !== 'main') this.menu = 'main';
        else {
          const b = this.sel.find(x => x.kind === 'building' && x.owner === this.me);
          if (b && (b.queue.length || !b.built)) this.g.cmdCancel(b);
        }
        this.cardSig = '';
        return;
      }
      if (/^[0-9]$/.test(k)) {
        e.preventDefault();
        const n = k;
        if (e.ctrlKey || e.metaKey) { this.groups[n] = this.sel.filter(x => x.owner === this.me).map(x => x.id); this.flash(`Group ${n} set`); return; }
        if (e.shiftKey) { this.groups[n] = Array.from(new Set((this.groups[n] || []).concat(this.sel.filter(x => x.owner === this.me).map(x => x.id)))); return; }
        const ents = (this.groups[n] || []).map(id => this.g.get(id)).filter(Boolean);
        if (!ents.length) return;
        const now = performance.now();
        if (this.lastGroupKey.k === n && now - this.lastGroupKey.t < 400) {
          const cx = ents.reduce((s, x) => s + x.x, 0) / ents.length, cy = ents.reduce((s, x) => s + x.y, 0) / ents.length;
          this.r.centerOn(cx, cy);
        }
        this.lastGroupKey = { k: n, t: now };
        this.setSel(ents);
        return;
      }
      // Shift+digit gives symbols on most layouts; handle via code
      if (e.shiftKey && /^Digit[0-9]$/.test(e.code)) {
        const n = e.code.slice(5);
        this.groups[n] = Array.from(new Set((this.groups[n] || []).concat(this.sel.filter(x => x.owner === this.me).map(x => x.id))));
        return;
      }
      if (k === 'F1') { e.preventDefault(); this.selectIdleWorker(); return; }
      if (k === 'F2') { e.preventDefault(); this.selectArmy(); return; }
      if (k === ' ') {
        e.preventDefault();
        const t = this.sel[0] || this.g.list.find(x => x.alive && x.owner === this.me && x.kind === 'building' && x.def.role === 'hq');
        if (t) this.r.centerOn(t.x, t.y);
        return;
      }
      if (k === 'Tab') { e.preventDefault(); this.showBars = !this.showBars; return; }
      // command card hotkeys
      const btn = (this.buttons || []).find(b => b.hotkey && b.hotkey.toLowerCase() === k.toLowerCase());
      if (btn && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        this.press(btn, e.shiftKey);
      }
    }

    selectIdleWorker() {
      const idle = this.g.list.filter(e => e.alive && e.owner === this.me && e.kind === 'unit' && e.def.role === 'worker' && e.order.type === 'idle');
      if (!idle.length) return;
      this.idleIdx = ((this.idleIdx || 0) + 1) % idle.length;
      const w = idle[this.idleIdx];
      this.setSel([w]);
      this.r.centerOn(w.x, w.y);
    }

    selectArmy() {
      this.setSel(this.g.list.filter(e => e.alive && e.owner === this.me && e.kind === 'unit' && e.def.role !== 'worker'));
    }

    flash(text) {
      this.msgs.push({ text, t: performance.now() });
      if (/not enough|required|can't|cannot|requires|full|cap/i.test(text)) this.audio.ui('error');
      this.renderMsgs();
    }

    renderMsgs() {
      const now = performance.now();
      this.msgs = this.msgs.filter(m => now - m.t < 3500).slice(-4);
      $('msgs').innerHTML = this.msgs.map(m => `<div class="msg">${m.text}</div>`).join('');
    }

    // ------------------------------------------------------- command card
    buildButtons() {
      const own = this.sel.filter(e => e.owner === this.me);
      const btns = [];
      if (!own.length) return btns;
      const units = own.filter(e => e.kind === 'unit');
      const g = this.g;
      if (units.length) {
        const allWorkers = units.every(u => u.def.role === 'worker');
        if (allWorkers && this.menu !== 'main') {
          const roles = this.menu === 'build1' ? ['hq', 'supply', 'extractor', 'barracks', 'tower'] : ['factory', 'starport', 'tech'];
          roles.forEach((role, i) => {
            const d = SW.factionBuilding(this.p.faction, role);
            const why = g.whyCantBuild(this.me, d.key);
            const locked = d.requiresRole && !this.p.hasRole[d.requiresRole];
            btns.push({ slot: i, hotkey: d.hotkey, icon: SW.icon(d.key, this.p.color, 44), def: d, disabled: !!why, locked,
              tip: this.tipFor(d, why), act: () => { if (why) { this.flash(why); return; } this.mode = { type: 'place', btype: d.key }; } });
          });
          btns.push({ slot: 14, hotkey: 'Escape', label: '✕', text: 'Back', tip: '<b>Back</b> <kbd>Esc</kbd>', act: () => { this.menu = 'main'; } });
          return btns;
        }
        btns.push({ slot: 0, hotkey: 'M', label: '➜', text: 'Move', tip: '<b>Move</b> <kbd>M</kbd><br>Move, ignoring enemies.', act: () => { this.mode = { type: 'target', cmd: 'move' }; } });
        btns.push({ slot: 1, hotkey: 'S', label: '■', text: 'Stop', tip: '<b>Stop</b> <kbd>S</kbd>', act: () => g.cmdStop(units) });
        btns.push({ slot: 2, hotkey: 'H', label: '⛨', text: 'Hold', tip: '<b>Hold Position</b> <kbd>H</kbd><br>Stay put and fire at enemies in range.', act: () => g.cmdHold(units) });
        if (units.some(u => u.def.weapons.length)) btns.push({ slot: 3, hotkey: 'A', label: '⚔', text: 'Attack', tip: '<b>Attack</b> <kbd>A</kbd><br>Attack-move: engage anything on the way.', act: () => { this.mode = { type: 'target', cmd: 'attack' }; } });
        if (allWorkers) {
          btns.push({ slot: 4, hotkey: 'G', label: '⛏', text: 'Gather', tip: '<b>Gather</b> <kbd>G</kbd><br>Harvest kyber crystals or tibanna from a refinery.', act: () => { this.mode = { type: 'target', cmd: 'gather' }; } });
          btns.push({ slot: 10, hotkey: 'B', label: '⌂', text: 'Build', tip: '<b>Basic Structures</b> <kbd>B</kbd>', act: () => { this.menu = 'build1'; } });
          btns.push({ slot: 11, hotkey: 'V', label: '⌂+', text: 'Adv.', tip: '<b>Advanced Structures</b> <kbd>V</kbd>', act: () => { this.menu = 'build2'; } });
        }
        return btns;
      }
      // buildings: use the first selected building type
      const b0 = own[0];
      const same = own.filter(e => e.type === b0.type);
      if (!b0.built) {
        btns.push({ slot: 14, hotkey: 'Escape', label: '✕', text: 'Cancel', tip: '<b>Cancel construction</b> <kbd>Esc</kbd><br>Refunds 75%.', act: () => g.cmdCancel(b0) });
        return btns;
      }
      b0.def.trains.forEach((type, i) => {
        const d = SW.UNITS[type];
        const best = same.slice().sort((a, b) => a.queue.length - b.queue.length)[0];
        const why = g.whyCantTrain(best, type);
        const locked = d.requires === 'tech' && !this.p.hasRole.tech;
        btns.push({ slot: i, hotkey: d.hotkey, icon: SW.icon(type, this.p.color, 44), def: d, disabled: !!why, locked,
          tip: this.tipFor(d, why),
          act: () => {
            const b = same.slice().sort((a, c) => a.queue.length - c.queue.length)[0];
            const w = g.cmdTrain(b, type);
            if (w) this.flash(w); else this.audio.ui('click');
          } });
      });
      if (b0.def.trains.length) btns.push({ slot: 4, hotkey: 'R', label: '⚑', text: 'Rally', tip: '<b>Set Rally Point</b> <kbd>R</kbd><br>Or right-click with the building selected.', act: () => { this.mode = { type: 'target', cmd: 'rally' }; } });
      if (b0.queue.length) btns.push({ slot: 14, hotkey: 'Escape', label: '✕', text: 'Cancel', tip: '<b>Cancel last</b> <kbd>Esc</kbd>', act: () => g.cmdCancel(b0) });
      return btns;
    }

    tipFor(d, why) {
      let s = `<b>${d.name}</b> <kbd>${d.hotkey}</kbd><div class="cost">${fmtCost(d)}</div>`;
      if (d.desc) s += `<div>${d.desc}</div>`;
      if (!d.building) {
        s += `<div class="stats">HP ${d.hp}${d.shields ? ' + ' + d.shields + ' shields' : ''} · armor ${d.armor} · ${d.tags.filter(t => t !== 'air').join(', ')}${d.air ? ' · <b>air</b>' : ''}<br>${weaponText(d)}${d.spawnCount > 1 ? `<br>Trains ${d.spawnCount} at once` : ''}</div>`;
        if (d.strong) s += `<div class="good">Strong vs: ${d.strong}</div><div class="bad">Weak vs: ${d.weak}</div>`;
      } else {
        if (d.supplyProvided) s += `<div class="stats">Provides ${d.supplyProvided} supply</div>`;
        if (d.weapons.length) s += `<div class="stats">${weaponText(d)}</div>`;
      }
      if (why) s += `<div class="bad">${why}</div>`;
      return s;
    }

    press(btn, shift) {
      if (btn.act) btn.act(shift);
      this.cardSig = '';
    }

    renderCard() {
      const btns = this.buildButtons();
      this.buttons = btns;
      const p = this.p;
      const sig = this.sel.map(e => e.id).join(',') + '|' + this.menu + '|' + btns.map(b => b.slot + (b.disabled ? 'd' : '') + (b.locked ? 'l' : '')).join(',') + '|' + (this.mode ? this.mode.type + this.mode.cmd : '');
      if (sig === this.cardSig) return;
      this.cardSig = sig;
      void p;
      const card = $('card');
      card.innerHTML = '';
      for (let i = 0; i < 15; i++) {
        const b = btns.find(x => x.slot === i);
        const el = document.createElement('button');
        el.className = 'cbtn' + (b ? '' : ' empty') + (b && b.disabled ? ' disabled' : '') + (b && b.locked ? ' locked' : '') + (b && this.mode && ((this.mode.cmd === 'attack' && b.hotkey === 'A') || (this.mode.cmd === 'move' && b.hotkey === 'M') || (this.mode.cmd === 'rally' && b.hotkey === 'R') || (this.mode.cmd === 'gather' && b.hotkey === 'G')) ? ' active' : '');
        if (b) {
          if (b.icon) { const im = document.createElement('img'); im.src = b.icon.toDataURL(); el.appendChild(im); }
          else { const s = document.createElement('span'); s.className = 'glyph'; s.textContent = b.label; el.appendChild(s); }
          if (b.hotkey && b.hotkey !== 'Escape') { const hk = document.createElement('span'); hk.className = 'hk'; hk.textContent = b.hotkey; el.appendChild(hk); }
          el.addEventListener('click', () => this.press(b));
          el.addEventListener('mouseenter', () => this.showTip(b.tip, el));
          el.addEventListener('mouseleave', () => this.hideTip());
        }
        card.appendChild(el);
      }
    }

    showTip(html, el) {
      const t = $('tooltip');
      t.innerHTML = html;
      t.style.display = 'block';
      const rc = el.getBoundingClientRect();
      const tw = t.offsetWidth, th = t.offsetHeight;
      t.style.left = Math.max(8, Math.min(window.innerWidth - tw - 8, rc.right - tw)) + 'px';
      t.style.top = Math.max(8, rc.top - th - 8) + 'px';
    }
    hideTip() { $('tooltip').style.display = 'none'; }

    // --------------------------------------------------------- info panel
    renderInfo() {
      const s = this.sel;
      const el = $('info');
      const sig = s.map(e => `${e.id}:${Math.ceil(e.hp)}:${Math.ceil(e.sh || 0)}:${e.queue ? e.queue.map(q => q.type + Math.floor(q.progress * 20)).join('') : ''}:${e.progress != null ? Math.floor(e.progress * 50) : ''}:${e.amount || ''}`).join('|');
      if (sig === this.infoSig) return;
      this.infoSig = sig;
      if (!s.length) { el.innerHTML = `<div class="hint">Drag to select units · Right-click to command · <kbd>F1</kbd> idle worker · <kbd>F2</kbd> army · <kbd>Ctrl+1-9</kbd> groups</div>`; return; }
      if (s.length === 1) { el.innerHTML = ''; el.appendChild(this.singleInfo(s[0])); return; }
      el.innerHTML = '';
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (const e of s.slice(0, 32)) {
        const d = document.createElement('div');
        d.className = 'gicon';
        const im = document.createElement('img');
        im.src = SW.icon(e.type, this.g.players[e.owner].color, 36).toDataURL();
        d.appendChild(im);
        const f = e.hp / e.maxHp;
        const bar = document.createElement('div');
        bar.className = 'hpb'; bar.style.width = (f * 100) + '%';
        bar.style.background = f > 0.6 ? '#3ce05a' : f > 0.3 ? '#f2c230' : '#f04030';
        d.appendChild(bar);
        if (e.maxSh) { const sb = document.createElement('div'); sb.className = 'shb'; sb.style.width = (e.sh / e.maxSh * 100) + '%'; d.appendChild(sb); }
        d.title = e.def.name;
        d.addEventListener('click', (ev) => {
          if (ev.shiftKey) this.setSel(this.sel.filter(x => x !== e));
          else if (ev.ctrlKey || ev.metaKey) this.setSel(this.sel.filter(x => x.type === e.type));
          else this.setSel([e]);
        });
        grid.appendChild(d);
      }
      if (s.length > 32) { const m = document.createElement('div'); m.className = 'more'; m.textContent = '+' + (s.length - 32); grid.appendChild(m); }
      el.appendChild(grid);
    }

    singleInfo(e) {
      const wrap = document.createElement('div');
      wrap.className = 'single';
      if (e.kind === 'resource') {
        wrap.innerHTML = `<div class="name">${e.rkind === 'kyber' ? 'Kyber Crystals' : 'Tibanna Gas Vent'}</div><div class="sub">${Math.floor(e.amount)} remaining</div><div class="sub">${e.rkind === 'gas' ? 'Build a refinery on top to harvest tibanna.' : 'Workers harvest 5 kyber per trip.'}</div>`;
        return wrap;
      }
      const port = document.createElement('div');
      port.className = 'portrait';
      const im = document.createElement('img');
      im.src = SW.icon(e.type, this.g.players[e.owner].color, 88).toDataURL();
      port.appendChild(im);
      wrap.appendChild(port);
      const d = e.def;
      const txt = document.createElement('div');
      txt.className = 'stxt';
      const own = e.owner === this.me;
      let h = `<div class="name">${d.name}</div><div class="sub">${SW.FACTIONS[d.faction].short}${own ? '' : ' (enemy)'}</div>`;
      h += `<div class="hpline"><span class="hp">${Math.ceil(e.hp)}/${e.maxHp}</span>${e.maxSh ? ` <span class="sh">${Math.ceil(e.sh)}/${e.maxSh}</span>` : ''} · armor ${d.armor}</div>`;
      if (e.kind === 'unit') {
        if (d.weapons.length) h += `<div class="sub">${weaponText(d)}</div>`;
        const ord = { idle: 'Idle', move: 'Moving', amove: 'Attack-moving', attack: 'Attacking', gather: e.carry ? 'Returning cargo' : 'Harvesting', build: 'Going to build', hold: 'Holding position' }[e.order.type] || '';
        if (own) h += `<div class="sub dim">${ord}</div>`;
      } else {
        if (!e.built) h += `<div class="prog"><div style="width:${e.progress * 100}%"></div></div><div class="sub">Under construction ${Math.floor(e.progress * 100)}%</div>`;
        else if (d.supplyProvided) h += `<div class="sub">Provides ${d.supplyProvided} supply</div>`;
        if (d.weapons.length) h += `<div class="sub">${weaponText(d)}</div>`;
        if (d.onGeyser) { const gy = this.g.get(e.geyser); h += `<div class="sub">${gy ? Math.floor(gy.amount) : 0} tibanna remaining</div>`; }
      }
      txt.innerHTML = h;
      wrap.appendChild(txt);
      if (e.kind === 'building' && own && e.queue.length) {
        const q = document.createElement('div');
        q.className = 'queue';
        e.queue.forEach((it, i) => {
          const qi = document.createElement('div');
          qi.className = 'qi';
          const qim = document.createElement('img');
          qim.src = SW.icon(it.type, this.p.color, 34).toDataURL();
          qi.appendChild(qim);
          if (i === 0) { const pb = document.createElement('div'); pb.className = 'qp'; pb.style.width = (it.progress * 100) + '%'; qi.appendChild(pb); }
          qi.title = 'Click to cancel';
          qi.addEventListener('click', () => { this.g.cmdCancel(e, i); this.infoSig = ''; });
          q.appendChild(qi);
        });
        wrap.appendChild(q);
      }
      return wrap;
    }

    // ------------------------------------------------------------- update
    update(dt) {
      this.pruneSel();
      // edge + key scroll
      const cam = this.r.cam;
      const sp = 900 * dt / cam.zoom;
      const m = this.mouse;
      let dx = 0, dy = 0;
      if (this.keys.ArrowLeft) dx -= 1;
      if (this.keys.ArrowRight) dx += 1;
      if (this.keys.ArrowUp) dy -= 1;
      if (this.keys.ArrowDown) dy += 1;
      if (m.in && !this.drag && !this.paused && this.opts.edgeScroll !== false) {
        if (m.x <= 4) dx -= 1; if (m.x >= window.innerWidth - 5) dx += 1;
        if (m.y <= 4) dy -= 1; if (m.y >= window.innerHeight - 5) dy += 1;
      }
      if (dx || dy) { cam.x += dx * sp; cam.y += dy * sp; this.r.clampCam(); }
      this.hover = this.mouse.in ? this.pick(this.mouse.wx, this.mouse.wy) : null;

      // messages from sim
      for (const msg of this.g.messages) if (msg.player === this.me) this.flash(msg.text);
      this.g.messages.length = 0;

      // under attack alerts
      if ((this.alertT = (this.alertT || 0) - dt) <= 0) {
        this.alertT = 0.5;
        const now = this.g.time;
        for (const e of this.g.list) {
          if (!e.alive || e.owner !== this.me || now - e.lastHit > 0.6) continue;
          const [sx, sy] = this.r.worldToScreen(e.x, e.y);
          const onScreen = sx > 0 && sy > 0 && sx < this.r.vw && sy < this.r.vh - 190;
          if (!onScreen && now - this.lastAlert > 12) {
            this.lastAlert = now;
            this.pings.push({ x: e.x, y: e.y, t: now });
            this.alertPos = { x: e.x, y: e.y };
            this.flash(e.def.role === 'worker' ? 'Our workers are under attack!' : e.kind === 'building' ? 'Our base is under attack!' : 'Our forces are under attack!');
            this.audio.ui('alert');
          }
          break;
        }
        this.pings = this.pings.filter(p => now - p.t < 3);
      }

      // HUD numbers
      const p = this.p;
      $('r-kyber').textContent = Math.floor(p.kyber);
      $('r-gas').textContent = Math.floor(p.gas);
      const su = Math.ceil(p.supplyUsed);
      $('r-supply').textContent = `${su}/${p.supplyMax}`;
      $('r-supply').classList.toggle('warn', su >= p.supplyMax && p.supplyMax < SW.MAX_SUPPLY);
      const tt = Math.floor(this.g.time);
      $('clock').textContent = `${String(Math.floor(tt / 60)).padStart(2, '0')}:${String(tt % 60).padStart(2, '0')}`;
      const idle = this.g.list.filter(e => e.alive && e.owner === this.me && e.kind === 'unit' && e.def.role === 'worker' && e.order.type === 'idle').length;
      const iw = $('idle-workers');
      iw.style.display = idle ? 'flex' : 'none';
      iw.querySelector('span').textContent = idle;

      this.renderCard();
      this.renderInfo();
      if (this.msgs.length) this.renderMsgs();
      document.body.style.cursor = this.mode ? (this.mode.type === 'target' ? 'crosshair' : 'cell') : (this.hover && this.hover.owner >= 0 && this.hover.owner !== this.me ? 'pointer' : 'default');
    }

    drawWorldOverlay(c, r) {
      // rally points
      for (const e of this.sel) {
        if (e.kind === 'building' && e.owner === this.me && e.rally) {
          c.strokeStyle = 'rgba(255,210,60,0.7)'; c.setLineDash([6, 5]); c.lineWidth = 1.5;
          c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(e.rally.x, e.rally.y); c.stroke(); c.setLineDash([]);
          c.fillStyle = '#ffd23a';
          c.beginPath(); c.moveTo(e.rally.x, e.rally.y); c.lineTo(e.rally.x, e.rally.y - 16); c.lineTo(e.rally.x + 10, e.rally.y - 12); c.lineTo(e.rally.x, e.rally.y - 8); c.fill();
        }
        if (e.kind === 'unit' && e.owner === this.me && (e.order.type === 'move' || e.order.type === 'amove')) {
          c.strokeStyle = e.order.type === 'amove' ? 'rgba(255,80,80,0.35)' : 'rgba(80,255,110,0.3)'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(e.order.x, e.order.y);
          for (const q of e.queue) if (q.x != null) c.lineTo(q.x, q.y);
          c.stroke();
        }
      }
      // placement ghost
      if (this.mode && this.mode.type === 'place') {
        const def = SW.BUILDINGS[this.mode.btype];
        const [tx, ty] = this.placeSpot();
        const [w, h] = def.size;
        const ok = this.g.canPlace(def.key, tx, ty) && this.exploredRect(tx, ty, w, h);
        for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) {
          const tok = def.onGeyser ? ok : this.g.passable(x, y);
          c.fillStyle = tok && ok ? 'rgba(80,255,110,0.28)' : 'rgba(255,60,60,0.35)';
          c.fillRect(x * T + 1, y * T + 1, T - 2, T - 2);
        }
        c.save(); c.translate((tx + w / 2) * T, (ty + h / 2) * T); c.globalAlpha = 0.55;
        SW.drawBuildingArt(c, def, w * T, h * T, this.p.color, { t: this.g.time, angle: 0, built: true, firing: 0 });
        c.restore(); c.globalAlpha = 1;
        if (def.weapons.length) {
          c.strokeStyle = 'rgba(255,255,255,0.3)';
          c.beginPath(); c.arc((tx + w / 2) * T, (ty + h / 2) * T, def.weapons[0].range * T + w * T * 0.35, 0, Math.PI * 2); c.stroke();
        }
      }
      // drag box (screen coords -> world)
      if (this.drag && (Math.abs(this.drag.x1 - this.drag.x0) > 4 || Math.abs(this.drag.y1 - this.drag.y0) > 4)) {
        const [ax, ay] = r.screenToWorld(Math.min(this.drag.x0, this.drag.x1), Math.min(this.drag.y0, this.drag.y1));
        const [bx, by] = r.screenToWorld(Math.max(this.drag.x0, this.drag.x1), Math.max(this.drag.y0, this.drag.y1));
        c.fillStyle = 'rgba(80,255,110,0.08)'; c.fillRect(ax, ay, bx - ax, by - ay);
        c.strokeStyle = '#4cff6a'; c.lineWidth = 1 / r.cam.zoom; c.strokeRect(ax, ay, bx - ax, by - ay);
      }
    }
  }

  SW.UI = UI;
})(globalThis.SW = globalThis.SW || {});
