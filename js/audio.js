/*
 * Football Blitz '26 — synthesized sound (WebAudio) and announcer (speech).
 * No audio files are needed.
 */
(function () {
  var FB = (window.FB = window.FB || {});

  var Audio = {
    ctx: null, master: null, crowdGain: null, enabled: true, announcer: true, noiseBuf: null,

    init: function () {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { this.ctx = null; return; }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.6 : 0;
      this.master.connect(this.ctx.destination);
      var len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      var d = this.noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startCrowd();
    },

    setEnabled: function (on) {
      this.enabled = on;
      if (this.master) this.master.gain.value = on ? 0.6 : 0;
      if (!on && window.speechSynthesis) window.speechSynthesis.cancel();
    },

    startCrowd: function () {
      var c = this.ctx;
      var src = c.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.4;
      this.crowdGain = c.createGain(); this.crowdGain.gain.value = 0.05;
      src.connect(bp); bp.connect(this.crowdGain); this.crowdGain.connect(this.master);
      src.start();
    },

    roar: function (amount, dur) {
      if (!this.ctx || !this.crowdGain) return;
      var g = this.crowdGain.gain, t = this.ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0.05 + amount * 0.3, t + 0.15);
      g.linearRampToValueAtTime(0.05, t + (dur || 2.5));
    },

    tone: function (type, f0, f1, dur, vol, delay) {
      if (!this.ctx) return;
      var c = this.ctx, t = c.currentTime + (delay || 0);
      var o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    },

    noise: function (dur, freq, vol, type) {
      if (!this.ctx) return;
      var c = this.ctx, t = c.currentTime;
      var s = c.createBufferSource(); s.buffer = this.noiseBuf;
      var f = c.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq;
      var g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start(t, Math.random()); s.stop(t + dur + 0.02);
    },

    play: function (name) {
      if (!this.ctx || !this.enabled) return;
      switch (name) {
        case 'whistle':
          this.tone('square', 2900, 2700, 0.32, 0.05); this.tone('sine', 3100, 2950, 0.32, 0.05); break;
        case 'hit': this.noise(0.18, 500, 0.6); this.tone('sine', 120, 50, 0.18, 0.5); break;
        case 'bighit': this.noise(0.35, 900, 0.9); this.tone('sine', 90, 35, 0.3, 0.8); break;
        case 'kick': this.tone('sine', 160, 60, 0.12, 0.7); this.noise(0.06, 2000, 0.3); break;
        case 'throw': this.noise(0.12, 2500, 0.15, 'highpass'); break;
        case 'catch': this.tone('sine', 220, 140, 0.08, 0.4); this.noise(0.05, 1200, 0.25); break;
        case 'snap': this.tone('triangle', 200, 120, 0.06, 0.4); break;
        case 'switch': this.tone('square', 660, 880, 0.05, 0.06); break;
        case 'menu': this.tone('square', 520, 640, 0.05, 0.05); break;
        case 'select': this.tone('square', 660, 990, 0.09, 0.07); this.tone('square', 990, 1320, 0.09, 0.05, 0.07); break;
        case 'spin': this.noise(0.2, 3000, 0.12, 'bandpass'); break;
        case 'td':
          [523, 659, 784, 1047].forEach(function (f, i) { Audio.tone('sawtooth', f, f, 0.35, 0.06, i * 0.12); });
          this.tone('sawtooth', 1047, 1047, 0.8, 0.07, 0.48); break;
        case 'fire': this.noise(0.8, 1500, 0.35, 'bandpass'); this.tone('sawtooth', 110, 440, 0.6, 0.06); break;
        case 'buzz': this.tone('sawtooth', 110, 100, 0.5, 0.12); break;
      }
    },

    say: function (text) {
      if (!this.enabled || !this.announcer || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
      try {
        window.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        u.rate = 1.12; u.pitch = 0.75; u.volume = 1;
        window.speechSynthesis.speak(u);
      } catch (e) { /* speech is optional */ }
    }
  };

  FB.Audio = Audio;
})();
