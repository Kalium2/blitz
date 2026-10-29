/*
 * Football Blitz '26 — arcade sound (WebAudio) and announcer (speech).
 *
 * Every sound is synthesized here and every music phrase is an original
 * composition; no audio files are used. Effects run through a compressor so
 * hits punch through the crowd the way an arcade cabinet mix does.
 */
(function () {
  var FB = (window.FB = window.FB || {});

  function pick(list) { return list[(Math.random() * list.length) | 0]; }

  // Original announcer lines, picked at random so calls don't repeat.
  var CALLS = {
    td: ['Touchdown!', 'He takes it to the house!', 'Six points!', 'Nobody catches him!', 'Into the end zone!'],
    first: ['First down!', 'Moving the chains!', 'First down, keep it rolling!'],
    int: ['Picked off!', 'Intercepted!', 'Turnover!', 'He jumped the route!'],
    fumble: ['Fumble!', 'The ball is loose!', 'He coughed it up!'],
    sack: ['Sacked!', 'Quarterback down!', 'Got him!', 'No time to throw!'],
    bighit: ['Boom!', 'What a hit!', 'He felt that one!', 'Lights out!', 'Crushed!'],
    late: ['Late hit! No flag!', 'After the whistle!', 'That one\'s personal!'],
    fire: ['Red hot!', 'Turbo for days!', 'They can\'t miss!', 'Heating up!'],
    fg: ['It\'s good!', 'Right down the middle!', 'Three points!'],
    fgmiss: ['No good!', 'Wide!', 'He missed it!'],
    onside: ['Onside kick!', 'They\'re going for it!'],
    audible: ['Audible!', 'Change at the line!'],
    safety: ['Safety!', 'Two points!'],
    stiff: ['Stiff arm!', 'Get off me!'],
    lateral: ['Lateral!', 'Pitch it back!'],
    kickoff: ['Here we go!', 'Let\'s play some football!', 'Kickoff!'],
    final: ['That\'s the game!', 'Final whistle!'],
    hut: ['Hut, hut!', 'Hike!', 'Set, hut!']
  };

  // Original 8-bar loop (A minor) for the menus.
  var MUSIC = {
    bpm: 128,
    chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],   // Am  F  C  G
    bass: [45, 45, 57, 45, 45, 57, 45, 52],
    lead: [76, 0, 74, 72, 0, 72, 69, 0, 72, 0, 74, 76, 0, 79, 76, 74]
  };

  var Audio = {
    ctx: null, master: null, fx: null, crowdGain: null, crowdHi: null, music: null,
    enabled: true, announcer: true, musicOn: true, noiseBuf: null, lastSay: 0,

    init: function () {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { this.ctx = null; return; }
      var c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = this.enabled ? 0.8 : 0;
      var comp = c.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
      this.master.connect(comp); comp.connect(c.destination);
      this.fx = c.createGain(); this.fx.gain.value = 1; this.fx.connect(this.master);
      this.musicBus = c.createGain(); this.musicBus.gain.value = 0.32; this.musicBus.connect(this.master);
      var len = c.sampleRate * 2;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      var d = this.noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.crunch = c.createWaveShaper();
      var curve = new Float32Array(1024);
      for (var k = 0; k < 1024; k++) { var x = k / 512 - 1; curve[k] = Math.tanh(x * 6); }
      this.crunch.curve = curve;
      this.crunch.connect(this.fx);
      this.startCrowd();
      if (this.wantMusic) this.startMusic();
    },

    setEnabled: function (on) {
      this.enabled = on;
      if (this.master) this.master.gain.value = on ? 0.8 : 0;
      if (!on && window.speechSynthesis) window.speechSynthesis.cancel();
    },

    // ----------------------------------------------------------- crowd
    startCrowd: function () {
      var c = this.ctx;
      var mk = function (type, f, q) { var n = c.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
      // low murmur + bright cheer layer, each with a slow wobble so it never sounds like static
      var low = c.createBufferSource(); low.buffer = this.noiseBuf; low.loop = true;
      var lowF = mk('lowpass', 520, 0.7);
      this.crowdGain = c.createGain(); this.crowdGain.gain.value = 0.07;
      low.connect(lowF); lowF.connect(this.crowdGain); this.crowdGain.connect(this.fx);
      var hi = c.createBufferSource(); hi.buffer = this.noiseBuf; hi.loop = true; hi.playbackRate.value = 0.83;
      var hiF = mk('bandpass', 1400, 0.6);
      this.crowdHi = c.createGain(); this.crowdHi.gain.value = 0.015;
      hi.connect(hiF); hiF.connect(this.crowdHi); this.crowdHi.connect(this.fx);
      var lfo = c.createOscillator(), lfoG = c.createGain(); lfo.frequency.value = 0.23; lfoG.gain.value = 180;
      lfo.connect(lfoG); lfoG.connect(lowF.frequency);
      low.start(); hi.start(); lfo.start();
    },

    roar: function (amount, dur) {
      if (!this.ctx || !this.crowdGain) return;
      var t = this.ctx.currentTime;
      [[this.crowdGain.gain, 0.07, 0.38], [this.crowdHi.gain, 0.015, 0.3]].forEach(function (a) {
        var g = a[0];
        g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(a[1] + amount * a[2], t + 0.12);
        g.linearRampToValueAtTime(a[1], t + (dur || 2.5));
      });
    },

    // ---------------------------------------------------- primitives
    tone: function (type, f0, f1, dur, vol, delay, dest) {
      if (!this.ctx) return;
      var c = this.ctx, t = c.currentTime + (delay || 0);
      var o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || this.fx);
      o.start(t); o.stop(t + dur + 0.03);
    },

    noise: function (dur, freq, vol, type, delay, dest, q) {
      if (!this.ctx) return;
      var c = this.ctx, t = c.currentTime + (delay || 0);
      var s = c.createBufferSource(); s.buffer = this.noiseBuf;
      var f = c.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq; if (q) f.Q.value = q;
      var g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest || this.fx);
      s.start(t, Math.random()); s.stop(t + dur + 0.03);
    },

    sweep: function (dur, f0, f1, vol, delay) {
      if (!this.ctx) return;
      var c = this.ctx, t = c.currentTime + (delay || 0);
      var s = c.createBufferSource(); s.buffer = this.noiseBuf;
      var f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.5;
      f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      var g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.fx);
      s.start(t, Math.random()); s.stop(t + dur + 0.03);
    },

    // referee whistle: two detuned tones with a fast pea-rattle vibrato
    whistle: function (dur, delay) {
      var c = this.ctx, t = c.currentTime + (delay || 0), self = this;
      [2950, 3130].forEach(function (f) {
        var o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
        o.type = 'sine'; o.frequency.value = f; lfo.frequency.value = 34; lg.gain.value = 70;
        lfo.connect(lg); lg.connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
        g.gain.setValueAtTime(0.09, t + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(self.fx);
        o.start(t); lfo.start(t); o.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02);
      });
      this.noise(dur, 3000, 0.03, 'bandpass', delay);
    },

    // ------------------------------------------------------- effects
    play: function (name) {
      if (!this.ctx || !this.enabled) return;
      var self = this;
      switch (name) {
        case 'whistle': this.whistle(0.38); break;
        case 'hit':
          this.tone('sine', 150, 45, 0.16, 0.7);
          this.noise(0.09, 1800, 0.5, 'bandpass', 0, this.crunch, 0.9);
          break;
        case 'bighit':
          this.tone('sine', 120, 32, 0.38, 1.0);
          this.tone('square', 70, 30, 0.2, 0.25);
          this.noise(0.22, 2400, 0.9, 'bandpass', 0, this.crunch, 0.7);
          this.noise(0.5, 500, 0.4, 'lowpass', 0.03);
          this.sweep(0.9, 700, 300, 0.12, 0.12);          // crowd "ooh"
          break;
        case 'kick': this.tone('sine', 180, 55, 0.14, 0.9); this.noise(0.05, 2500, 0.45, 'bandpass', 0, this.crunch); break;
        case 'throw': this.sweep(0.22, 900, 3200, 0.22); break;
        case 'bullet': this.sweep(0.16, 1500, 5200, 0.3); this.tone('sawtooth', 300, 900, 0.1, 0.04); break;
        case 'catch': this.tone('sine', 260, 120, 0.07, 0.55); this.noise(0.05, 1600, 0.45, 'bandpass', 0, null, 1.2); break;
        case 'snap': this.tone('triangle', 220, 110, 0.07, 0.5); this.noise(0.04, 900, 0.3); break;
        case 'turbo': this.sweep(0.28, 400, 2600, 0.16); break;
        case 'spin': this.sweep(0.32, 2600, 600, 0.18); break;
        case 'switch': this.tone('square', 740, 990, 0.05, 0.07); break;
        case 'menu': this.tone('square', 560, 700, 0.045, 0.06); break;
        case 'select': this.tone('square', 660, 990, 0.08, 0.08); this.tone('square', 990, 1480, 0.1, 0.07, 0.07); break;
        case 'td':
          // brass-style stab fanfare (original)
          [[0, [523, 659, 784]], [0.16, [587, 740, 880]], [0.32, [659, 831, 988]], [0.5, [784, 988, 1175]]].forEach(function (s) {
            s[1].forEach(function (f) { self.tone('sawtooth', f, f * 1.005, s[0] === 0.5 ? 0.9 : 0.18, 0.06, s[0]); });
          });
          this.tone('sine', 98, 98, 1.0, 0.35, 0.5);
          break;
        case 'fire':
          this.sweep(1.0, 300, 3000, 0.3); this.tone('sawtooth', 110, 440, 0.7, 0.08);
          for (var i = 0; i < 10; i++) this.noise(0.03, 3000, 0.2, 'highpass', Math.random() * 0.8);
          break;
        case 'crackle': for (var j = 0; j < 3; j++) this.noise(0.025, 3500, 0.08, 'highpass', Math.random() * 0.3); break;
        case 'buzz': this.tone('sawtooth', 110, 104, 0.9, 0.16); this.tone('sawtooth', 165, 158, 0.9, 0.08); break;
        case 'horn': this.tone('sawtooth', 233, 233, 0.6, 0.12); this.tone('sawtooth', 311, 311, 0.6, 0.08); break;
      }
    },

    // ------------------------------------------------------ announcer
    say: function (text, force) {
      if (!this.enabled || !this.announcer || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
      var now = Date.now();
      if (!force && now - this.lastSay < 700) return; // don't stack calls on top of each other
      this.lastSay = now;
      try {
        window.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        u.rate = 1.18; u.pitch = 0.62; u.volume = 1;
        var v = this.voice();
        if (v) u.voice = v;
        window.speechSynthesis.speak(u);
      } catch (e) { /* speech is optional */ }
    },

    voice: function () {
      if (this._voice !== undefined) return this._voice;
      var vs = (window.speechSynthesis && window.speechSynthesis.getVoices()) || [];
      if (!vs.length) return null;
      var en = vs.filter(function (v) { return /^en/i.test(v.lang); });
      var pref = en.filter(function (v) { return /male|david|daniel|alex|fred|guy|mark|george/i.test(v.name); });
      this._voice = pref[0] || en[0] || null;
      return this._voice;
    },

    call: function (kind, force) { if (CALLS[kind]) this.say(pick(CALLS[kind]), force); },

    // ---------------------------------------------------------- music
    setMusic: function (on) {
      this.musicOn = on;
      if (!on) this.stopMusic();
    },

    startMusic: function () {
      this.wantMusic = true;
      if (!this.ctx || !this.musicOn || this.music) return;
      var self = this, c = this.ctx, step = 60 / MUSIC.bpm / 2; // eighth notes
      this.music = { next: c.currentTime + 0.1, i: 0 };
      var hz = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };
      var note = function (type, m, t, dur, vol, cutoff) {
        var o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
        o.type = type; o.frequency.value = hz(m);
        f.type = 'lowpass'; f.frequency.value = cutoff || 2400;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(f); f.connect(g); g.connect(self.musicBus);
        o.start(t); o.stop(t + dur + 0.02);
      };
      var drum = function (kind, t) {
        if (kind === 'k') { var o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); o.connect(g); g.connect(self.musicBus); o.start(t); o.stop(t + 0.2); }
        else {
          var s = c.createBufferSource(), f = c.createBiquadFilter(), gg = c.createGain();
          s.buffer = self.noiseBuf; f.type = kind === 's' ? 'bandpass' : 'highpass'; f.frequency.value = kind === 's' ? 1800 : 7000;
          gg.gain.setValueAtTime(kind === 's' ? 0.5 : 0.18, t); gg.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 's' ? 0.16 : 0.04));
          s.connect(f); f.connect(gg); gg.connect(self.musicBus); s.start(t, Math.random()); s.stop(t + 0.2);
        }
      };
      var tick = function () {
        if (!self.music) return;
        while (self.music.next < c.currentTime + 0.25) {
          var t = self.music.next, i = self.music.i, bar = Math.floor(i / 8) % 4, pos = i % 8;
          note('sawtooth', MUSIC.bass[pos], t, step * 0.9, 0.22, 700);
          if (pos === 0 || pos === 4) MUSIC.chords[bar].forEach(function (m) { note('square', m + 12, t, step * 3.6, 0.035, 1800); });
          var ld = MUSIC.lead[i % 16];
          if (ld && Math.floor(i / 32) % 2 === 1) note('square', ld, t, step * 0.85, 0.05, 3200);
          if (pos === 0 || pos === 3 || pos === 4) drum('k', t);
          if (pos === 2 || pos === 6) drum('s', t);
          drum('h', t);
          self.music.next += step; self.music.i++;
        }
        self.music.timer = setTimeout(tick, 60);
      };
      tick();
    },

    stopMusic: function () {
      this.wantMusic = false;
      if (this.music) { clearTimeout(this.music.timer); this.music = null; }
    }
  };

  if (window.speechSynthesis && window.speechSynthesis.addEventListener) {
    window.speechSynthesis.addEventListener('voiceschanged', function () { Audio._voice = undefined; });
  }
  FB.Audio = Audio;
})();
