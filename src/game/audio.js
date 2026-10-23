// Sound: streamed background music + synthesised car, impacts, ambience and interface sounds.
const MUSIC = ['music/kounine-boy.mp3', 'music/kounine-baguira.mp3', 'music/kounine-sudo.mp3'];
export const TRACKS = ['Kounine — Boy', 'Kounine — Baguira', 'Kounine — Sudo'];

export class Audio {
  constructor() {
    this.ctx = null; this.muted = false; this.ready = false; this.last = {};
    this.musicOn = true; this.sfxOn = true;
    this.revs = 0; this.engVol = 0; this.rollVol = 0; this.skidVol = 0; this.boostVol = 0;
    this.amb = { birdT: 2, owlT: 20, night: 0 };
    this.duckK = 0; this.toon = { level: 0, next: 0, step: 0 };
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); this.playMusic(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 1.35;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = this.sfxOn ? 1 : 0; this.sfx.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0; this.musicBus.connect(this.master);
    this.musicLp = c.createBiquadFilter(); this.musicLp.type = 'lowpass'; this.musicLp.frequency.value = 20000; this.musicLp.Q.value = 0.5;
    this.musicLp.connect(this.musicBus);
    // shared reverb for ambience and a little of the effects
    this.verb = c.createConvolver(); this.verb.buffer = this.impulse(1.8, 2.6);
    this.verbIn = c.createGain(); this.verbIn.gain.value = 0.35; this.verbIn.connect(this.verb); this.verb.connect(this.sfx);
    // noise + crackle buffers
    this.noiseBuf = this.makeNoise(2);
    this.gravelBuf = this.makeCrackle(2, 900, 0.006, 0.9);
    this.fireBuf = this.makeCrackle(3, 120, 0.004, 1);

    // ---- engine: harmonic "muscle" tone + sub, lumpy amplitude, throttle-driven pitch ----
    const real = new Float32Array([0, 1, 0.7, 0.52, 0.36, 0.3, 0.2, 0.16, 0.1, 0.08, 0.05, 0.04]);
    const wave = c.createPeriodicWave(real, new Float32Array(real.length));
    this.eng = c.createGain(); this.eng.gain.value = 0;
    this.engLp = c.createBiquadFilter(); this.engLp.type = 'lowpass'; this.engLp.frequency.value = 420; this.engLp.Q.value = 0.9;
    this.engAm = c.createGain(); this.engAm.gain.value = 0.75;
    this.o1 = c.createOscillator(); this.o1.setPeriodicWave(wave);
    this.o2 = c.createOscillator(); this.o2.setPeriodicWave(wave); this.o2.detune.value = 9;
    this.sub = c.createOscillator(); this.sub.type = 'sine';
    const g1 = c.createGain(); g1.gain.value = 0.55; const g2 = c.createGain(); g2.gain.value = 0.35; const gs = c.createGain(); gs.gain.value = 0.6;
    this.o1.connect(g1); this.o2.connect(g2); this.sub.connect(gs);
    g1.connect(this.engAm); g2.connect(this.engAm); gs.connect(this.engAm);
    this.lfo = c.createOscillator(); this.lfo.type = 'sine'; const lg = c.createGain(); lg.gain.value = 0.25; this.lfo.connect(lg); lg.connect(this.engAm.gain);
    this.engAm.connect(this.engLp); this.engLp.connect(this.eng); this.eng.connect(this.sfx);
    [this.o1, this.o2, this.sub, this.lfo].forEach(o => o.start());
    // ---- tyres on gravel, sliding, whirr, wind, water, boost hum ----
    this.roll = this.loop(this.gravelBuf, 'bandpass', 1700, 0.7);
    this.slide = this.loop(this.gravelBuf, 'bandpass', 1050, 1.1);
    this.whirr = this.loop(this.noiseBuf, 'bandpass', 420, 2.2);
    this.wind = this.loop(this.noiseBuf, 'lowpass', 520, 0.5);
    this.water = this.loop(this.noiseBuf, 'lowpass', 900, 0.8);
    this.river = this.loop(this.noiseBuf, 'lowpass', 650, 0.6);
    {
      const b = this.boost = c.createGain(); b.gain.value = 0;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 6;
      [110, 110.7, 220.4].forEach(fr => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; const g = c.createGain(); g.gain.value = 0.18; o.connect(g); g.connect(f); o.start(); });
      const l = c.createOscillator(); l.frequency.value = 5.5; const lg2 = c.createGain(); lg2.gain.value = 380; l.connect(lg2); lg2.connect(f.frequency); l.start();
      f.connect(b); b.connect(this.sfx);
    }
    // ---- ambience: wind in the trees, crickets, fire, fountain ----
    this.ambWind = this.loop(this.noiseBuf, 'lowpass', 380, 0.4, this.sfx);
    {
      const gl = c.createOscillator(); gl.frequency.value = 0.09; const gg = c.createGain(); gg.gain.value = 160;
      gl.connect(gg); gg.connect(this.ambWind.filter.frequency); gl.start();
    }
    this.crickets = c.createGain(); this.crickets.gain.value = 0; this.crickets.connect(this.sfx); this.crickets.connect(this.verbIn);
    [[4350, 31, 1.7, -0.6], [4720, 27, 1.3, 0.55]].forEach(([f, pr, ch, pan]) => {
      const o = c.createOscillator(); o.frequency.value = f;
      const am = c.createGain(); am.gain.value = 0;
      const p1 = c.createOscillator(); p1.type = 'square'; p1.frequency.value = pr; const p1g = c.createGain(); p1g.gain.value = 0.5; p1.connect(p1g); p1g.connect(am.gain);
      const gate = c.createGain(); gate.gain.value = 0;
      const p2 = c.createOscillator(); p2.type = 'square'; p2.frequency.value = ch; const p2g = c.createGain(); p2g.gain.value = 0.5; p2.connect(p2g); p2g.connect(gate.gain);
      const pn = c.createStereoPanner(); pn.pan.value = pan;
      const v = c.createGain(); v.gain.value = 0.05;
      o.connect(am); am.connect(gate); gate.connect(v); v.connect(pn); pn.connect(this.crickets);
      [o, p1, p2].forEach(x => x.start());
    });
    this.fire = this.loop(this.fireBuf, 'highpass', 900, 0.5, this.sfx);
    this.fount = this.loop(this.noiseBuf, 'highpass', 2600, 0.4, this.sfx);
    this.ambWind.gain.gain.value = 0.05;

    // ---- music (streamed; routed through WebAudio when served over http so it can be muffled) ----
    this.musicEl = document.createElement('audio');
    this.musicEl.preload = 'auto';
    this.viaGraph = /^https?:$/.test(location.protocol);
    if (this.viaGraph) this.musicEl.crossOrigin = 'anonymous';
    this.track = Math.floor(Math.random() * MUSIC.length);
    this.musicEl.src = MUSIC[this.track];
    this.musicEl.volume = this.viaGraph ? 1 : 0;
    this.musicEl.addEventListener('ended', () => { setTimeout(() => this.nextTrack(), 1600); });
    if (this.viaGraph) {
      try { this.musicSrc = c.createMediaElementSource(this.musicEl); this.musicSrc.connect(this.musicLp); } catch (e) { this.viaGraph = false; }
    }
    this.ready = true;
    this.playMusic();
  }
  impulse(dur, decay) {
    const c = this.ctx, n = Math.floor(c.sampleRate * dur), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lp = 0;
      for (let i = 0; i < n; i++) { lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4; d[i] = lp * Math.pow(1 - i / n, decay); }
    }
    return b;
  }
  makeNoise(sec) {
    const c = this.ctx, b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  // sparse little grains: gravel, crackling wood
  makeCrackle(sec, perSec, grain, base) {
    const c = this.ctx, sr = c.sampleRate, b = c.createBuffer(1, sr * sec, sr), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.08 * base;
    const n = Math.floor(perSec * sec);
    for (let k = 0; k < n; k++) {
      const at = Math.floor(Math.random() * d.length), len = Math.floor(sr * grain * (0.4 + Math.random())), a = 0.25 + Math.random() * 0.75;
      for (let i = 0; i < len && at + i < d.length; i++) d[at + i] += (Math.random() * 2 - 1) * a * Math.pow(1 - i / len, 3);
    }
    return b;
  }
  loop(buf, type, f, q, dest) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    s.connect(fl); fl.connect(g); g.connect(dest || this.sfx); s.start(0, Math.random() * buf.duration);
    return { src: s, filter: fl, gain: g };
  }

  // ---------- music ----------
  playMusic() {
    if (!this.musicEl) return;
    if (!this.musicOn || this.muted) { this.fadeMusic(0); return; }
    const p = this.musicEl.play(); if (p && p.catch) p.catch(() => {});
    this.fadeMusic(1);
  }
  fadeMusic(to) {
    const t = this.ctx.currentTime;
    if (this.viaGraph) this.musicBus.gain.setTargetAtTime(to * 0.85 * (1 - this.duckK * 0.7), t, to ? 1.2 : 0.3);
    else {
      // element volume fallback (file:// pages)
      const el = this.musicEl, start = el.volume, t0 = performance.now(), dur = to ? 2500 : 500, target = to * 0.7;
      const step = () => { const k = Math.min(1, (performance.now() - t0) / dur); el.volume = start + (target - start) * k; if (k < 1) requestAnimationFrame(step); else if (!to) el.pause(); };
      step();
    }
    if (!to && this.viaGraph) setTimeout(() => { if (!this.musicOn || this.muted) this.musicEl.pause(); }, 900);
  }
  nextTrack() {
    if (!this.musicEl) return TRACKS[0];
    this.track = (this.track + 1) % MUSIC.length;
    this.musicEl.src = MUSIC[this.track];
    if (this.musicOn && !this.muted) { const p = this.musicEl.play(); if (p && p.catch) p.catch(() => {}); }
    return TRACKS[this.track];
  }
  // quieter background music while something else plays (the cartoon)
  setDuck(k) {
    if (!this.ready || Math.abs(k - this.duckK) < 0.02) return;
    this.duckK = k;
    if (this.musicOn && !this.muted) {
      if (this.viaGraph) this.musicBus.gain.setTargetAtTime(0.85 * (1 - k * 0.7), this.ctx.currentTime, 0.4);
      else this.musicEl.volume = 0.7 * (1 - k * 0.7);
    }
  }
  // cheerful little cartoon tune, scheduled ahead while the TV is near
  cartoonMusic(level) {
    if (!this.ready) return;
    const T = this.toon, c = this.ctx, now = c.currentTime;
    T.level = level;
    if (level < 0.02) { T.next = 0; return; }
    if (!T.next || T.next < now) T.next = now + 0.05;
    const beat = 60 / 138 / 2;
    const mel = [72, 76, 79, 76, 77, 76, 74, 72, 74, 77, 81, 77, 79, 77, 76, 74, 72, 76, 79, 84, 83, 79, 76, 74, 72, 74, 76, 77, 79, -1, 72, -1];
    const bass = [48, 55, 48, 55, 53, 57, 53, 57, 50, 57, 50, 57, 55, 59, 55, 59];
    while (T.next < now + 0.25) {
      const i = T.step % 32, at = T.next, v = 0.07 * level;
      const n = mel[i];
      if (n > 0) this._note(440 * Math.pow(2, (n - 69) / 12), at, beat * 0.9, 'triangle', v, 0.25);
      if (i % 2 === 0) this._note(440 * Math.pow(2, (bass[(i / 2) % 16] - 69) / 12), at, beat * 1.6, 'sine', v * 1.4, 0);
      if (i % 4 === 2) this._click(at, v * 2.2);
      T.step++; T.next += beat;
    }
  }
  _note(f, at, dur, type, vol, verb) {
    const c = this.ctx, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, at);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(this.sfx); if (verb) { const v = c.createGain(); v.gain.value = verb; g.connect(v); v.connect(this.verbIn); }
    o.start(at); o.stop(at + dur + 0.05);
  }
  _click(at, vol) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 4;
    const g = c.createGain(); g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start(at, Math.random()); s.stop(at + 0.08);
  }
  // the giant TV's video soundtrack goes through the graph (distance volume, mute, sfx switch)
  tvAttach(el) {
    if (!this.ready || !this.viaGraph) return false;
    if (this.tvSrc) return true;
    try {
      this.tvSrc = this.ctx.createMediaElementSource(el);
      this.tvGain = this.ctx.createGain(); this.tvGain.gain.value = 0;
      this.tvSrc.connect(this.tvGain); this.tvGain.connect(this.sfx);
      const v = this.ctx.createGain(); v.gain.value = 0.18; this.tvGain.connect(v); v.connect(this.verbIn);
      return true;
    } catch (e) { return false; }
  }
  tvLevel(k) {
    if (!this.tvGain || Math.abs(k - (this.tvK ?? -1)) < 0.01) return;
    this.tvK = k;
    this.tvGain.gain.setTargetAtTime(k * 0.95, this.ctx.currentTime, 0.12);
  }
  popcorn() { if (!this.ready) return; const t = this.ctx.currentTime; for (let i = 0; i < 11; i++) this._click(t + 0.05 + i * 0.07 + Math.random() * 0.05, 0.2 + Math.random() * 0.15); }
  boing() { if (!this.ready) return; this._tone(160, 0.5, 'sine', 0.22, 0, 520); this._tone(320, 0.35, 'triangle', 0.06, 0.02, 900); }
  firework() { if (!this.ready) return; this._noise(0.5, 'bandpass', 1800, 0.8, 0.25, 600, 0, 0.5); this._tone(1200 + Math.random() * 800, 0.3, 'sine', 0.04, 0.05, 2400); }
  ufo() {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(950, t + 1.4); o.frequency.exponentialRampToValueAtTime(420, t + 3.2);
    const vib = c.createOscillator(); vib.frequency.value = 6.5; const vg = c.createGain(); vg.gain.value = 18; vib.connect(vg); vg.connect(o.frequency);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.3); g.gain.setValueAtTime(0.12, t + 2.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
    o.connect(g); g.connect(this.sfx); const v = c.createGain(); v.gain.value = 0.6; g.connect(v); v.connect(this.verbIn);
    o.start(t); vib.start(t); o.stop(t + 3.5); vib.stop(t + 3.5);
    this._noise(3.2, 'bandpass', 600, 2, 0.08, 2400, 0, 0.6);
  }
  notes() { if (!this.ready) return; [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => this._tone(f, 0.25, 'triangle', 0.08, i * 0.07, 0, 0.5)); }
  // muffle the music while reading a panel or under water
  muffle(on) { if (this.ready) this.musicLp.frequency.setTargetAtTime(on ? 900 : 20000, this.ctx.currentTime, 0.25); }
  setMusic(on) { this.musicOn = on; if (this.ready) this.playMusic(); }
  setSfx(on) { this.sfxOn = on; if (this.ready) this.sfx.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05); }
  setMuted(m) {
    this.muted = m;
    if (!this.ready) return;
    this.master.gain.setTargetAtTime(m ? 0 : 1.35, this.ctx.currentTime, 0.05);
    this.playMusic();
  }
  pause() { if (!this.ready) return; this.musicEl.pause(); this.ctx.suspend && this.ctx.suspend(); }
  resume() { if (!this.ready) return; this.ctx.resume && this.ctx.resume(); if (this.musicOn && !this.muted) { const p = this.musicEl.play(); if (p && p.catch) p.catch(() => {}); } }

  // ---------- continuous car sounds, called every frame ----------
  drive(dt, speed, throttle, slip, inWater, air, boosting, grounded, onGrass) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, s = Math.abs(speed), thr = Math.abs(throttle);
    const want = thr * (boosting ? 1 : 0.62) + Math.min(1, s / 22) * 0.3 + (air > 0.15 && thr > 0.1 ? 0.25 : 0);
    this.revs += (want - this.revs) * Math.min(1, dt * (want > this.revs ? 5 : 2.2));
    const f = 34 + this.revs * 52;
    this.o1.frequency.setTargetAtTime(f, t, 0.04);
    this.o2.frequency.setTargetAtTime(f, t, 0.04);
    this.sub.frequency.setTargetAtTime(f * 0.5, t, 0.04);
    this.lfo.frequency.setTargetAtTime(f / 3.2, t, 0.05);
    this.engLp.frequency.setTargetAtTime(300 + this.revs * 1100, t, 0.06);
    const ev = Math.max(0.03, thr * (boosting ? 0.21 : 0.13) + Math.min(s, 25) * 0.002);
    this.engVol += (ev - this.engVol) * Math.min(1, dt * (ev > this.engVol ? 10 : 2.5));
    this.eng.gain.setTargetAtTime(this.engVol, t, 0.03);
    const g = grounded > 0 ? 1 : 0;
    const rv = g * Math.min(1, s * 0.09) * (onGrass ? 0.12 : 0.19);
    this.roll.gain.gain.setTargetAtTime(rv, t, 0.06);
    this.roll.src.playbackRate.setTargetAtTime(0.7 + Math.min(1.1, s / 18), t, 0.1);
    this.roll.filter.frequency.setTargetAtTime(onGrass ? 900 : 1700, t, 0.2);
    const sv = Math.min(0.42, slip * 0.06) * g;
    this.skidVol += (sv - this.skidVol) * Math.min(1, dt * (sv > this.skidVol ? 20 : 5));
    this.slide.gain.gain.setTargetAtTime(this.skidVol, t, 0.02);
    this.slide.src.playbackRate.value = 0.8;
    this.whirr.gain.gain.setTargetAtTime(Math.min(0.09, s * 0.003) * g, t, 0.1);
    this.whirr.filter.frequency.setTargetAtTime(260 + s * 22, t, 0.1);
    this.wind.gain.gain.setTargetAtTime(Math.min(0.1, s * 0.003 + (air > 0.1 ? 0.06 : 0)), t, 0.12);
    this.water.gain.gain.setTargetAtTime(inWater ? Math.min(0.3, 0.08 + s * 0.02) : 0, t, 0.08);
    const bv = boosting ? 0.085 + thr * 0.06 : 0;
    this.boostVol += (bv - this.boostVol) * Math.min(1, dt * (bv > this.boostVol ? 10 : 1.5));
    this.boost.gain.setTargetAtTime(this.boostVol, t, 0.03);
  }
  // ambience: distances to water / fire / fountain and how dark it is
  ambient(dt, a) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const near = (d, r) => Math.max(0, 1 - d / r);
    this.river.gain.gain.setTargetAtTime(near(a.water, 16) * 0.1 + near(a.fall, 40) * 0.2, t, 0.3);
    this.fire.gain.gain.setTargetAtTime(near(a.fire, 14) * 0.5, t, 0.3);
    this.fount.gain.gain.setTargetAtTime(near(a.fountain, 15) * 0.06, t, 0.3);
    this.crickets.gain.setTargetAtTime(a.night * 0.55, t, 1.2);
    this.ambWind.gain.gain.setTargetAtTime(0.04 + a.height * 0.004, t, 1);
    // birds by day, an owl at night
    this.amb.birdT -= dt;
    if (this.amb.birdT <= 0) {
      this.amb.birdT = 2.5 + Math.random() * 6;
      if (a.night < 0.5 && a.trees > 0.15) this.bird(Math.random() * 1.6 - 0.8, 0.35 + a.trees * 0.5);
    }
    this.amb.owlT -= dt;
    if (this.amb.owlT <= 0) { this.amb.owlT = 18 + Math.random() * 25; if (a.night > 0.6) this.owl(Math.random() * 1.4 - 0.7); }
  }
  bird(pan, vol) {
    const c = this.ctx, t0 = c.currentTime + 0.05;
    const p = c.createStereoPanner(); p.pan.value = pan;
    const out = c.createGain(); out.gain.value = vol * 0.11; p.connect(out); out.connect(this.sfx); out.connect(this.verbIn);
    const kind = Math.floor(Math.random() * 3), n = 2 + Math.floor(Math.random() * 5);
    const base = 2600 + Math.random() * 1800;
    for (let k = 0; k < n; k++) {
      const t = t0 + k * (0.09 + Math.random() * 0.05), d = 0.05 + Math.random() * 0.05;
      const o = c.createOscillator(); o.type = 'sine';
      const f0 = base * (1 + (Math.random() - 0.5) * 0.12);
      if (kind === 0) { o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 1.45, t + d * 0.6); o.frequency.exponentialRampToValueAtTime(f0 * 0.9, t + d); }
      else if (kind === 1) { o.frequency.setValueAtTime(f0 * 1.4, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.75, t + d); }
      else { o.frequency.setValueAtTime(f0, t); const fm = c.createOscillator(); fm.frequency.value = 60; const fg = c.createGain(); fg.gain.value = f0 * 0.08; fm.connect(fg); fg.connect(o.frequency); fm.start(t); fm.stop(t + d + 0.02); }
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(p); o.start(t); o.stop(t + d + 0.02);
    }
  }
  owl(pan) {
    const c = this.ctx;
    const p = c.createStereoPanner(); p.pan.value = pan;
    const out = c.createGain(); out.gain.value = 0.08; p.connect(out); out.connect(this.sfx); out.connect(this.verbIn);
    [[0, 0.32], [0.55, 0.22], [0.85, 0.5]].forEach(([d, len]) => {
      const t = c.currentTime + d;
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(390, t); o.frequency.linearRampToValueAtTime(360, t + len);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g); g.connect(p); o.start(t); o.stop(t + len + 0.05);
    });
  }
  idle() { if (!this.ready) return; const t = this.ctx.currentTime; this.eng.gain.setTargetAtTime(0, t, 0.2); this.roll.gain.gain.setTargetAtTime(0, t, 0.05); this.slide.gain.gain.setTargetAtTime(0, t, 0.05); this.wind.gain.gain.setTargetAtTime(0, t, 0.1); this.boost.gain.setTargetAtTime(0, t, 0.05); }

  // ---------- one-shots ----------
  _throttle(key, gap) { const now = performance.now(); if (this.last[key] && now - this.last[key] < gap) return false; this.last[key] = now; return true; }
  _noise(dur, type, f, q, vol, sweepTo, buf, verb = 0) {
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = buf || this.noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (sweepTo) fl.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.sfx); if (verb) { const v = c.createGain(); v.gain.value = verb; g.connect(v); v.connect(this.verbIn); }
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  _tone(freq, dur, type, vol, delay = 0, slideTo, verb = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfx); if (verb) { const v = c.createGain(); v.gain.value = verb; g.connect(v); v.connect(this.verbIn); }
    o.start(t); o.stop(t + dur + 0.05);
  }
  hit(kind, strength) {
    if (!this.ready || strength < 0.6) return;
    if (!this._throttle('hit' + kind, 45)) return;
    const v = Math.min(1, strength / 9);
    switch (kind) {
      case 'metal': this._noise(0.12, 'bandpass', 2600, 3, 0.35 * v); this._tone(620 + Math.random() * 300, 0.4, 'sine', 0.12 * v, 0, 0, 0.4); this._tone(1480 + Math.random() * 200, 0.25, 'sine', 0.05 * v); break;
      case 'wood': this._noise(0.11, 'bandpass', 520, 1.6, 0.6 * v); this._tone(180 + Math.random() * 60, 0.09, 'triangle', 0.25 * v); break;
      case 'plastic': this._noise(0.07, 'bandpass', 1400, 2.4, 0.4 * v); this._tone(420 + Math.random() * 120, 0.07, 'square', 0.04 * v); break;
      case 'rubber': this._tone(110, 0.12, 'sine', 0.35 * v, 0, 70); break;
      case 'ball': this._tone(150, 0.16, 'sine', 0.45 * v, 0, 90); this._noise(0.05, 'lowpass', 800, 1, 0.2 * v); break;
      case 'tree': this._noise(0.35, 'bandpass', 1200, 0.6, 0.3 * v, 4000); this._tone(140, 0.12, 'triangle', 0.22 * v); break;
      case 'car': this._noise(0.16, 'lowpass', 900, 1, 0.5 * v); this._tone(90, 0.18, 'sine', 0.35 * v, 0, 55); break;
      case 'letter': this._noise(0.1, 'bandpass', 900, 1.6, 0.5 * v); this._tone(150 + Math.random() * 80, 0.16, 'triangle', 0.3 * v, 0, 95); this._tone(520 + Math.random() * 160, 0.06, 'sine', 0.05 * v); break;
      case 'snow': this._noise(0.32, 'lowpass', 2400, 0.7, 0.6 * v, 420); this._noise(0.1, 'bandpass', 3600, 1.4, 0.22 * v); this._tone(92, 0.16, 'sine', 0.22 * v, 0, 58); break;
      case 'pin': this._noise(0.09, 'bandpass', 2400, 2.5, 0.5 * v); this._tone(740 + Math.random() * 200, 0.12, 'triangle', 0.16 * v); this._tone(1650 + Math.random() * 300, 0.07, 'sine', 0.06 * v); break;
      default: this._noise(0.1, 'bandpass', 700, 1, 0.4 * v);
    }
  }
  // springs squeak when the wheels touch down
  springs(n) {
    if (!this.ready || !this._throttle('spring', 220)) return;
    const v = Math.min(1, n / 4);
    for (let k = 0; k < 2; k++) this._tone(1900 + Math.random() * 900, 0.09 + Math.random() * 0.05, 'sine', 0.035 * v, k * 0.05, 2600 + Math.random() * 600);
  }
  land(strength) { if (!this.ready || !this._throttle('land', 250)) return; const v = Math.min(1, strength / 8); this._tone(80, 0.22, 'sine', 0.5 * v, 0, 45); this._noise(0.18, 'lowpass', 600, 1, 0.35 * v, 0, this.gravelBuf); this.springs(4); }
  splash() { if (!this.ready || !this._throttle('splash', 300)) return; this._noise(0.7, 'lowpass', 2400, 0.8, 0.5, 300, 0, 0.3); }
  horn() {
    if (!this.ready || !this._throttle('horn', 380)) return;
    const c = this.ctx;
    [0, 0.19].forEach(d => {
      const t = c.currentTime + d, len = d ? 0.24 : 0.14;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200; f.Q.value = 1.5;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.015); g.gain.setValueAtTime(0.12, t + len - 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      [415, 523].forEach(fr => { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = fr; o.connect(f); o.start(t); o.stop(t + len + 0.02); });
      f.connect(g); g.connect(this.sfx);
    });
  }
  quack() {
    if (!this.ready) return;
    const c = this.ctx;
    [0, 0.17].forEach(d => {
      const t = c.currentTime + d;
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(340, t); o.frequency.exponentialRampToValueAtTime(220, t + 0.14);
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(1300, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.14); f.Q.value = 3;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(f); f.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.2);
    });
  }
  jingle(big = false) {
    if (!this.ready) return;
    const notes = big ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : [783.99, 987.77, 1174.66];
    notes.forEach((f, i) => { this._tone(f, 0.45, 'triangle', 0.15, i * 0.085, 0, 0.5); this._tone(f * 2, 0.25, 'sine', 0.05, i * 0.085); });
    if (big) for (let k = 0; k < 6; k++) this._tone(2200 + Math.random() * 2400, 0.12, 'sine', 0.035, 0.45 + k * 0.05, 0, 0.6);
  }
  // reveal at start: airy swell + shimmer
  reveal() {
    if (!this.ready) return;
    this._noise(2.6, 'bandpass', 220, 0.9, 0.22, 3200, 0, 0.6);
    [523.25, 783.99, 1046.5, 1567.98].forEach((f, i) => this._tone(f, 1.6, 'sine', 0.05, 0.25 + i * 0.16, 0, 0.8));
  }
  whoosh() { if (!this.ready || !this._throttle('whoosh', 500)) return; this._noise(0.5, 'bandpass', 300, 1.2, 0.35, 2400, 0, 0.3); }
  pop() { if (!this.ready) return; this._tone(600 + Math.random() * 500, 0.06, 'sine', 0.1, 0, 1400); }
  click() { if (!this.ready) return; this._noise(0.03, 'bandpass', 2400 + Math.random() * 1200, 3, 0.25); }
  open() { if (!this.ready) return; this._tone(523.25, 0.14, 'triangle', 0.1); this._tone(783.99, 0.22, 'triangle', 0.09, 0.07, 0, 0.4); }
}
