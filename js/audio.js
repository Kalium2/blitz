// Tiny WebAudio synth for blaster shots, explosions and UI cues.
(function (SW) {
  'use strict';

  class Audio {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.volume = 0.5;
      this.recent = 0;
      this.lastT = {};
      try { this.muted = localStorage.getItem('sw_muted') === '1'; } catch (e) { /* storage unavailable */ }
    }

    ensure() {
      if (this.ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      // shared noise buffer
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return true;
    }

    setMuted(m) {
      this.muted = m;
      try { localStorage.setItem('sw_muted', m ? '1' : '0'); } catch (e) { /* storage unavailable */ }
    }

    throttle(key, gap) {
      const now = this.ctx.currentTime;
      if (this.lastT[key] && now - this.lastT[key] < gap) return false;
      this.lastT[key] = now;
      return true;
    }

    spatial(x, y, r) {
      if (!r) return 1;
      const cx = r.cam.x + r.vw / r.cam.zoom / 2, cy = r.cam.y + r.vh / r.cam.zoom / 2;
      const d = Math.hypot(x - cx, y - cy);
      return Math.max(0, 1 - d / 1400);
    }

    shot(kind, x, y, r, src) {
      if (this.muted || !this.ensure()) return;
      const v = this.spatial(x, y, r);
      if (v < 0.05 || !this.throttle('shot' + kind, kind === 'blaster' ? 0.045 : 0.09)) return;
      const c = this.ctx, t = c.currentTime;
      const o = c.createOscillator(), g = c.createGain();
      if (kind === 'blaster' || kind === 'cannon' || kind === 'heavy') {
        // classic descending "pew"
        const f0 = kind === 'heavy' ? 520 : kind === 'cannon' ? 900 : 1500 + Math.random() * 400;
        o.type = kind === 'heavy' ? 'sawtooth' : 'square';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f0 * 0.18, t + (kind === 'heavy' ? 0.35 : 0.16));
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09 * v * (kind === 'heavy' ? 1.6 : 1), t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'heavy' ? 0.4 : 0.18));
        o.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + 0.45);
      } else if (kind === 'missile' || kind === 'bomb') {
        this.noiseBurst(0.25, 0.06 * v, 800, 0.3);
      } else {
        this.noiseBurst(0.05, 0.04 * v, 2000, 0.05);
      }
    }

    noiseBurst(dur, vol, freq, decay) {
      const c = this.ctx, t = c.currentTime;
      const s = c.createBufferSource(); s.buffer = this.noise;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay + dur);
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start(t, Math.random() * 0.5); s.stop(t + dur + decay + 0.05);
    }

    explosion(r, x, y, rend) {
      if (this.muted || !this.ensure()) return;
      const v = this.spatial(x, y, rend);
      if (v < 0.05 || !this.throttle('boom', 0.06)) return;
      this.noiseBurst(0.1, Math.min(0.35, 0.08 + r / 80) * v, 300 + r * 8, 0.4 + r / 60);
    }

    ui(kind) {
      if (this.muted || !this.ensure()) return;
      if (!this.throttle('ui' + kind, 0.12)) return;
      const c = this.ctx, t = c.currentTime;
      const notes = { click: [880], complete: [523, 784], spawn: [660], error: [220, 180], alert: [440, 330, 440, 330], victory: [523, 659, 784, 1046], defeat: [392, 330, 262] }[kind] || [600];
      notes.forEach((f, i) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = kind === 'error' ? 'square' : 'triangle';
        o.frequency.value = f;
        const st = t + i * (kind === 'alert' ? 0.12 : 0.09);
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(kind === 'spawn' ? 0.04 : 0.08, st + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.12);
        o.connect(g); g.connect(this.master);
        o.start(st); o.stop(st + 0.15);
      });
    }
  }

  SW.Audio = Audio;
})(globalThis.SW = globalThis.SW || {});
