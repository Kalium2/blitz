/*
 * Football Blitz '26 — input: keyboard, gamepads and touch.
 *
 * Each player slot reads { x, y, action, special, turbo, start } where x/y is
 * a screen-relative stick (x right, y up) and action/special/start are
 * "pressed this frame" edges.
 */
(function () {
  var FB = (window.FB = window.FB || {});

  var KEYMAPS = {
    // one player: everything works
    solo: {
      up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
      action: ['Space', 'KeyJ'], turbo: ['ShiftLeft', 'ShiftRight', 'KeyK'], special: ['KeyL', 'KeyE'], start: ['Escape', 'Enter', 'KeyP'],
      rec: [['Digit1', 'Numpad1'], ['Digit2', 'Numpad2'], ['Digit3', 'Numpad3'], ['Digit4', 'Numpad4']]
    },
    p1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], action: ['Space'], turbo: ['ShiftLeft'], special: ['KeyE'], start: ['Escape'],
      rec: [['Digit1'], ['Digit2'], ['Digit3'], ['Digit4']] },
    p2: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], action: ['Numpad0', 'Slash'], turbo: ['NumpadDecimal', 'Period'], special: ['NumpadEnter', 'Comma'], start: ['Enter'],
      rec: [['Numpad1'], ['Numpad2'], ['Numpad3'], ['Numpad4']] }
  };

  var Input = {
    keys: {},
    latched: {},   // keys pressed since the last poll (so quick taps are never missed)
    mode: 'solo',
    slots: [{}, {}],
    prev: [{}, {}],
    touch: { x: 0, y: 0, action: false, turbo: false, special: false, start: false, active: false },
    // pointer on the field: sx/sy in CSS pixels; pressed/released/right are latched until pollMouse
    mouse: { sx: 0, sy: 0, on: false, down: false, pressed: false, released: false, right: false, touch: false, offAfter: false },
    lastDevice: 'keyboard',

    init: function () {
      var self = this;
      window.addEventListener('keydown', function (e) {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
        self.keys[e.code] = true;
        self.latched[e.code] = true;
        self.lastDevice = 'keyboard';
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Enter'].indexOf(e.code) >= 0) e.preventDefault();
      });
      window.addEventListener('keyup', function (e) {
        self.keys[e.code] = false;
        // stop Space/Enter from also "clicking" whatever button last had focus
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') e.preventDefault();
      });
      window.addEventListener('blur', function () { self.keys = {}; self.latched = {}; self.mouse.down = false; self.mouse.on = false; });
      this.initPointer();
    },

    // Mouse / pen / finger on the game canvas: aim and click to pass.
    initPointer: function () {
      var m = this.mouse, self = this;
      var onField = function (e) { return e.target && e.target.tagName === 'CANVAS' && (e.target.id === 'game3d' || e.target.id === 'game'); };
      var at = function (e) { m.sx = e.clientX; m.sy = e.clientY; m.touch = e.pointerType === 'touch'; };
      window.addEventListener('pointermove', function (e) {
        if (!onField(e) && !m.down) return;
        at(e);
        if (!m.touch || m.down) { m.on = true; self.lastDevice = 'mouse'; }
      });
      window.addEventListener('pointerdown', function (e) {
        if (!onField(e)) return;
        at(e); m.on = true; self.lastDevice = 'mouse';
        if (e.button === 2) { m.right = true; return; }
        if (e.button !== 0) return;
        m.down = true; m.pressed = true; m.offAfter = false;
        try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
        e.preventDefault();
      });
      var up = function (e) {
        if (e.button !== 0 && e.type === 'pointerup') return;
        if (!m.down) return;
        at(e); m.down = false; m.released = true;
        // a finger has no hover: hide the reticle once the release is handled
        if (m.touch) m.offAfter = true;
      };
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      document.addEventListener('mouseout', function (e) { if (!e.relatedTarget && !m.down) m.on = false; });
      window.addEventListener('contextmenu', function (e) { if (onField(e)) e.preventDefault(); });
    },

    // Read the pointer once per frame; edges are cleared after reading.
    pollMouse: function () {
      var m = this.mouse;
      var out = { sx: m.sx, sy: m.sy, on: m.on, down: m.down, pressed: m.pressed, released: m.released, right: m.right, touch: m.touch };
      m.pressed = false; m.released = false; m.right = false;
      if (m.offAfter) { m.on = false; m.offAfter = false; }
      return out;
    },

    setMode: function (twoPlayer) { this.mode = twoPlayer ? 'two' : 'solo'; },

    // true if any button in the merged raw state is still physically held
    keysHeld: function (r) {
      var held = false, k = this.keys, self = this;
      ['solo', 'p1', 'p2'].forEach(function (m) {
        var map = KEYMAPS[m];
        ['action', 'turbo', 'special', 'start'].forEach(function (b) { map[b].forEach(function (c) { if (k[c]) held = true; }); });
        map.rec.forEach(function (keys) { keys.forEach(function (c) { if (k[c]) held = true; }); });
      });
      var pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected && pads[i].buttons.some(function (b) { return b.pressed; })) held = true;
      if (this.touch.action || this.touch.turbo || this.touch.special || this.touch.start) held = true;
      return held;
    },

    keyState: function (map) {
      var k = this.keys, l = this.latched;
      var any = function (list) { for (var i = 0; i < list.length; i++) if (k[list[i]] || l[list[i]]) return true; return false; };
      return {
        x: (any(map.right) ? 1 : 0) - (any(map.left) ? 1 : 0),
        y: (any(map.up) ? 1 : 0) - (any(map.down) ? 1 : 0),
        action: any(map.action), turbo: any(map.turbo), special: any(map.special), start: any(map.start),
        // receiver icon key held (1-4), 0 for none
        rec: map.rec ? map.rec.reduce(function (r, keys, i) { return r || (any(keys) ? i + 1 : 0); }, 0) : 0
      };
    },

    padState: function (index) {
      var pads = navigator.getGamepads ? navigator.getGamepads() : [];
      var list = [];
      for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) list.push(pads[i]);
      var p = list[index];
      if (!p) return null;
      var b = function (i) { return p.buttons[i] && p.buttons[i].pressed; };
      var ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      if (Math.abs(ax) < 0.25) ax = 0;
      if (Math.abs(ay) < 0.25) ay = 0;
      var x = ax + (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
      var y = -ay + (b(12) ? 1 : 0) - (b(13) ? 1 : 0);
      var st = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)), action: b(0), special: b(1) || b(3), turbo: b(2) || b(5) || b(7) || b(4) || b(6), start: b(9) };
      if (st.action || st.special || st.turbo || st.start || st.x || st.y) this.lastDevice = 'gamepad';
      // aiming with the stick hands passing back from the pointer
      if (st.x || st.y) this.mouse.on = false;
      return st;
    },

    merge: function (a, b) {
      if (!b) return a;
      return {
        x: Math.max(-1, Math.min(1, a.x + b.x)), y: Math.max(-1, Math.min(1, a.y + b.y)),
        action: a.action || b.action, turbo: a.turbo || b.turbo, special: a.special || b.special, start: a.start || b.start,
        rec: a.rec || b.rec || 0
      };
    },

    // Call once per frame. Returns per-slot input with edge-triggered buttons.
    poll: function () {
      var raw = [];
      if (this.mode === 'solo') {
        var s = this.keyState(KEYMAPS.solo);
        s = this.merge(s, this.padState(0));
        if (this.touch.active) s = this.merge(s, this.touch);
        raw[0] = s;
        raw[1] = this.merge({ x: 0, y: 0, action: false, turbo: false, special: false, start: false }, this.padState(1));
      } else {
        raw[0] = this.merge(this.merge(this.keyState(KEYMAPS.p1), this.padState(0)), this.touch.active ? this.touch : null);
        raw[1] = this.merge(this.keyState(KEYMAPS.p2), this.padState(1));
      }
      var out = [];
      for (var i = 0; i < 2; i++) {
        var r = raw[i], p = this.prev[i];
        out[i] = {
          x: r.x, y: r.y, turbo: r.turbo, actionHeld: r.action,
          action: r.action && !p.action, special: r.special && !p.special, start: r.start && !p.start,
          rec: r.rec && r.rec !== p.rec ? r.rec : 0,
          // menu navigation edges
          navX: (r.x > 0.5 && !(p.x > 0.5)) ? 1 : (r.x < -0.5 && !(p.x < -0.5)) ? -1 : 0,
          navY: (r.y > 0.5 && !(p.y > 0.5)) ? 1 : (r.y < -0.5 && !(p.y < -0.5)) ? -1 : 0,
          back: r.special && !p.special
        };
        this.prev[i] = r;
        // a tap that started and ended between polls still registered once; make sure
        // the next poll sees the release so the following tap is a fresh edge
        if (!this.keysHeld(r)) this.prev[i] = { x: r.x, y: r.y, action: false, turbo: false, special: false, start: false, rec: 0 };
      }
      this.latched = {};
      return out;
    },

    // Gamepad rumble (where the browser supports it).
    rumble: function (strong, weak, ms) {
      var pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (var i = 0; i < pads.length; i++) {
        var a = pads[i] && pads[i].vibrationActuator;
        if (a && a.playEffect) { try { a.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) { /* unsupported */ } }
      }
      if (this.touch.active && navigator.vibrate && strong > 0.5) { try { navigator.vibrate(Math.min(60, ms)); } catch (e) { /* unsupported */ } }
    },

    // ----------------------------------------------------------- touch
    initTouch: function (root) {
      var self = this, t = this.touch;
      var stick = root.querySelector('.stick'), knob = root.querySelector('.knob');
      var stickId = null, cx = 0, cy = 0;
      function move(e) {
        for (var i = 0; i < e.changedTouches.length; i++) {
          var tt = e.changedTouches[i];
          if (tt.identifier !== stickId) continue;
          var dx = tt.clientX - cx, dy = tt.clientY - cy, d = Math.sqrt(dx * dx + dy * dy), m = 46;
          if (d > m) { dx *= m / d; dy *= m / d; }
          knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
          t.x = Math.abs(dx) > 10 ? dx / m : 0; t.y = Math.abs(dy) > 10 ? -dy / m : 0;
        }
      }
      stick.addEventListener('touchstart', function (e) {
        e.preventDefault();
        var tt = e.changedTouches[0]; stickId = tt.identifier;
        var r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
        t.active = true; move(e);
      }, { passive: false });
      stick.addEventListener('touchmove', function (e) { e.preventDefault(); move(e); }, { passive: false });
      var end = function (e) {
        for (var i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === stickId) {
          stickId = null; t.x = 0; t.y = 0; knob.style.transform = '';
        }
      };
      stick.addEventListener('touchend', end); stick.addEventListener('touchcancel', end);
      root.querySelectorAll('[data-btn]').forEach(function (btn) {
        var name = btn.getAttribute('data-btn');
        btn.addEventListener('touchstart', function (e) { e.preventDefault(); t.active = true; t[name] = true; btn.classList.add('down'); }, { passive: false });
        var up = function (e) { e.preventDefault(); t[name] = false; btn.classList.remove('down'); };
        btn.addEventListener('touchend', up); btn.addEventListener('touchcancel', up);
      });
    }
  };

  FB.Input = Input;
  FB.KEYMAPS = KEYMAPS;
})();
