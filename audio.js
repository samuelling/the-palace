/* The Palace: generative score and sound.
   Everything is synthesized with WebAudio at run time; there are no samples.

   Design rule: the score reacts only to what the player can already see or has been told
   (something hunting you, low health, darkness, a safe room). It never reacts to anything a
   measure depends on: which standing figures are ghouls, whether the Architect reshuffled a room,
   or where home is during a blackout. While a homing trial is running every positional sound is
   centred, so nothing in the mix can act as an auditory landmark. */
(function (root) {
  'use strict';
  let C = null, out, musicBus, musicDry, fxBus, ambBus, verb, noise, clickBuf, glassBuf, timer = null;
  const R = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)], clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
  const st = { scene: null, sc: null, tension: 0, safe: false, dark: false, blind: false, hp: 3, running: false, vt: null,
    L: { x: 0, z: 0, yaw: 0 }, layers: null, next: {}, musicOn: store.get('palace.music', true), lastAlert: -99, boxBusy: 0, hbBoost: 0, wasSafe: false, tock: false, side: 1 };
  const T = () => st.vt != null ? st.vt : C.currentTime;

  /* ---------- scenes ----------
     Clara's lullaby is one fixed melody. It plays intact on the chapter cards; inside the house it is
     heard in safe rooms and, rarely, far off. The deeper into Locke's mind, the more notes go missing
     and the further the rest drift out of tune. */
  const PHRYG = [0, 1, 3, 5, 7, 8, 10], HUNG = [0, 2, 3, 6, 7, 8, 11], AEOL = [0, 2, 3, 5, 7, 8, 10];
  const SCENES = {
    card: { root: 50, scale: AEOL, drone: 0, pads: 0, box: 'loop', drop: 0, wobble: 3, tempo: 1, amb: {}, floor: 'stone' },
    grounds: { root: 45, scale: AEOL, drone: .7, pads: 1, voice: 'strings', box: 'rare', drop: .06, wobble: 8, tempo: 1, amb: { wind: .55, crows: 1, thud: .2 }, floor: 'gravel' },
    east: { root: 38, scale: PHRYG, drone: 1, pads: 1, voice: 'organ', box: 'rare', drop: .15, wobble: 14, tempo: .93, amb: { wind: .3, muffle: 1, rain: .25, creak: 1, drip: .2, whisper: .35, thud: .6 }, floor: 'wood' },
    conservatory: { root: 42, scale: HUNG, drone: .9, pads: 1, voice: 'glass', box: 'rare', drop: .25, wobble: 22, tempo: .86, amb: { rain: .6, glass: 1, creak: .35, drip: 1, whisper: .2, hum: .5 }, floor: 'gravel' },
    palace: { root: 36, scale: PHRYG, drone: 1.1, pads: 1, voice: 'choir', box: 'rare', drop: .4, wobble: 35, tempo: .76, amb: { creak: .5, drip: .7, whisper: 1, thud: .4 }, floor: 'stone' },
  };
  const LULLABY = [[7, 1], [10, 1], [8, 1], [7, 2], [3, 1], [5, 1], [7, 1], [8, 1], [7, 2], [3, 1], [2, 1], [3, 1], [5, 1], [2, 2], [-2, 1], [0, 3],
    [7, 1], [12, 1], [10, 1], [8, 2], [7, 1], [5, 1], [3, 1], [5, 1], [7, 2], [8, 1], [2, 1], [3, 1], [-1, 1], [0, 3]];
  const VOWELS = [[700, 1200], [400, 2000], [300, 2300], [500, 900], [350, 700], [600, 1700]];

  /* ---------- graph ---------- */
  function g0(v) { const g = C.createGain(); g.gain.value = v == null ? 1 : v; return g; }
  function filt(type, f, q) { const b = C.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; }
  function pan(p, dest) { if (!C.createStereoPanner) return dest; const s = C.createStereoPanner(); s.pan.value = clamp(p, -1, 1); s.connect(dest); return s; }
  function osc(type, f, t, dur) { const o = C.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); if (dur != null) o.stop(t + dur + .05); return o; }
  function nsrc(t, dur) { const s = C.createBufferSource(); s.buffer = noise; s.loop = true; s.start(t, R(0, 1.9)); if (dur != null) s.stop(t + dur + .05); return s; }
  function env(p, t, a, peak, hold, r) { const pk = Math.max(.0002, peak); p.setValueAtTime(.0001, t); p.exponentialRampToValueAtTime(pk, t + a); p.setValueAtTime(pk, t + a + hold); p.exponentialRampToValueAtTime(.0001, t + a + hold + r); }
  function vsend(a) { const g = g0(a); g.connect(verb); return g; }
  function bus(level, send) { const g = g0(level); g.connect(out); if (send) g.connect(vsend(send)); return g; }
  function impulse(sec, decay) {
    const n = Math.floor(C.sampleRate * sec), b = C.createBuffer(2, n, C.sampleRate), ramp = C.sampleRate * .012;
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let lp = 0; for (let i = 0; i < n; i++) { const t = i / n; lp += ((Math.random() * 2 - 1) - lp) * (.9 - .85 * t); d[i] = lp * Math.pow(1 - t, decay) * (i < ramp ? i / ramp : 1); } }
    return b;
  }
  function init(ctx) {
    if (C && !ctx) { if (C.state !== 'running' && C.resume) C.resume(); return; }
    if (ctx) C = ctx;
    else { const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return; try { C = new AC(); } catch (e) { C = null; return; } }
    const comp = C.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = .004; comp.release.value = .25; comp.connect(C.destination);
    out = g0(.85); out.connect(comp);
    verb = C.createConvolver(); verb.buffer = impulse(4.2, 2.4); verb.connect(g0(.5)).connect(out);
    const m = st.musicOn ? .8 : 0; musicBus = bus(m, .55); musicDry = bus(m); fxBus = bus(1, .16); ambBus = bus(.8, .5);
    noise = C.createBuffer(1, C.sampleRate * 2, C.sampleRate); const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    clickBuf = C.createBuffer(1, Math.floor(C.sampleRate * .004), C.sampleRate); const cd = clickBuf.getChannelData(0); for (let i = 0; i < cd.length; i++) cd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (cd.length / 5));
    // rain on glass: sparse ticks of random size, looped
    glassBuf = C.createBuffer(1, C.sampleRate * 4, C.sampleRate); const gd = glassBuf.getChannelData(0);
    for (let k = 0; k < 4 * 45; k++) { const at = Math.floor(Math.random() * (gd.length - 400)), a = Math.pow(Math.random(), 3); for (let i = 0; i < 300; i++) gd[at + i] += a * (Math.random() * 2 - 1) * Math.exp(-i / 40); }
    st.layers = null;
    if (!ctx) timer = setInterval(tick, 90);
    if (st.sc) st.layers = makeLayers(st.sc);
  }

  /* ---------- persistent layers per scene: drone, chase strings, weather ---------- */
  function makeLayers(sc) {
    const t = T(), L = { nodes: [], out: g0(.0001), aout: g0(.0001) }, keep = n => (L.nodes.push(n), n);
    L.out.connect(musicBus); L.aout.connect(ambBus);
    if (sc.drone) {
      const lp = filt('lowpass', 160, 1.6), dg = g0(.6); lp.connect(dg).connect(L.out); L.lp = lp; L.dg = dg;
      const f0 = mtof(sc.root);   // root in octave 2 (65 to 110 Hz); the sub an octave below stays above 30 Hz, where speakers can still move air
      [[f0, 'sawtooth', .075], [f0 * 1.004, 'sawtooth', .075], [f0 / 2, 'sine', .09], [f0 * 1.4983, 'sawtooth', .03]].forEach(([f, ty, v]) => keep(osc(ty, f, t)).connect(g0(v)).connect(lp));
      L.tri = g0(0); L.tri.connect(lp); keep(osc('sawtooth', f0 * Math.SQRT2, t)).connect(L.tri);          // the tritone arrives with tension
      keep(osc('sine', .045, t)).connect(g0(70)).connect(lp.frequency);
    }
    // high tremolo strings, only audible during a chase
    L.str = g0(0); const bp = filt('bandpass', 1800, .7); bp.connect(L.str).connect(L.out);
    const am = g0(.5); am.connect(bp); keep(osc('sine', 11, t)).connect(g0(.5)).connect(am.gain);
    [0, 1, 6].forEach(k => { const f = mtof(sc.root + 36 + k), o = keep(osc('sawtooth', f, t)); keep(osc('sine', R(4.5, 6), t)).connect(g0(f * .006)).connect(o.frequency); o.connect(g0(.2)).connect(am); });
    const A = sc.amb || {};
    if (A.wind) { const s = keep(nsrc(t)), b = filt('bandpass', 450, .6), g = g0(A.wind * (A.muffle ? 1.1 : .5)); s.connect(b); let n = b; if (A.muffle) { n = filt('lowpass', 520, .5); b.connect(n); } n.connect(g).connect(L.aout); L.wind = { b, g, base: A.wind * (A.muffle ? 1.3 : .5) }; }
    if (A.rain) { const s = keep(nsrc(t)), hp = filt('highpass', A.muffle ? 250 : 1200), lp = filt('lowpass', A.muffle ? 800 : 7000); s.connect(hp).connect(lp).connect(g0(A.rain * (A.muffle ? .14 : .05))).connect(L.aout); }
    if (A.glass) { const s = C.createBufferSource(); s.buffer = glassBuf; s.loop = true; s.start(t); keep(s); s.connect(filt('highpass', 2500)).connect(g0(A.glass * .3)).connect(L.aout); }
    if (A.hum) [50, 100, 151].forEach((f, i) => keep(osc('sine', f, t)).connect(g0(A.hum * [.07, .035, .012][i])).connect(L.aout));
    L.out.gain.setTargetAtTime(1, t, 1.5); L.aout.gain.setTargetAtTime(1, t, 2);
    return L;
  }
  function dropLayers(L) {
    if (!L) return; const t = T();
    [L.out, L.aout].forEach(g => { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(.0001, t, .8); });
    setTimeout(() => L.nodes.forEach(n => { try { n.stop(); } catch (e) { } }), 4000);
  }
  function scene(name) {
    const sc = SCENES[name] || SCENES.east;
    if (st.scene === name && st.layers) return;
    st.scene = name; st.sc = sc; st.next = {}; st.tension = 0;
    if (!C) return;
    dropLayers(st.layers); st.layers = makeLayers(sc);
  }

  /* ---------- the scheduler ---------- */
  function tick() {
    if (!C || !st.sc) return;
    const t = T(), sc = st.sc, L = st.layers, ten = st.tension, A = sc.amb || {};
    if (L) {
      if (L.lp) L.lp.frequency.setTargetAtTime(140 + 650 * ten + (st.dark ? 60 : 0), t, .8);
      if (L.dg) L.dg.gain.setTargetAtTime((st.safe ? .2 : .5 + .5 * ten) * sc.drone, t, 1.2);
      if (L.tri) L.tri.gain.setTargetAtTime(ten > .35 ? (ten - .35) * .16 : 0, t, 1);
      L.str.gain.setTargetAtTime(ten > .55 ? (ten - .55) * .1 : 0, t, ten > .55 ? .3 : 1.5);
      if (L.wind && Math.random() < .08) { L.wind.b.frequency.setTargetAtTime(R(180, 800), t, R(1, 3)); L.wind.g.gain.setTargetAtTime(L.wind.base * R(.2, 1.5), t, R(.8, 2.5)); }   // gusts
    }
    const isCard = sc === SCENES.card;
    if (!st.running && !isCard) return;
    const due = k => t >= (st.next[k] || 0), first = k => st.next[k] == null;
    if (sc.pads && !st.safe && due('pad')) { if (!first('pad')) pad(sc, ten); st.next.pad = t + (first('pad') ? R(2, 5) : R(9, 16) * (1 - .45 * ten)); }
    if (sc.box === 'loop' && due('box')) st.next.box = t + lullaby(sc, { vol: .5 }) + R(2, 4);
    else if (sc.box === 'rare') {
      if (st.safe && !st.wasSafe && t > st.boxBusy) st.boxBusy = t + lullaby(sc, { vol: .45 });
      else if (!st.safe && ten < .2 && due('box')) { if (!first('box') && t > st.boxBusy) st.boxBusy = t + lullaby(sc, { vol: .2, far: true, part: true }); st.next.box = t + R(50, 110); }
    }
    st.wasSafe = st.safe;
    const boost = t < st.hbBoost, drive = Math.max(ten, st.hp <= 1 ? .55 : 0, boost ? .7 : 0);
    if ((ten > .5 || st.hp <= 1 || boost) && !isCard && due('hb')) { heart(t + .02, .5 + .4 * drive); st.next.hb = t + 60 / (56 + 84 * drive); }
    if (st.safe && due('clock')) { clockTick(t + .01, st.tock = !st.tock); st.next.clock = t + 1; }
    const amb = (k, rate, fn) => { if (A[k] && due(k)) { if (!first(k)) fn(); st.next[k] = t + rate(); } };
    amb('creak', () => R(7, 22) / A.creak, () => creak(.5 * A.creak, R(-.8, .8), ambBus));
    amb('drip', () => R(1.2, 6) / A.drip, () => drip(R(-.7, .7), .1 * A.drip));
    amb('whisper', () => R(18, 45) / A.whisper, () => { if (!st.safe) whisper(R(-1, 1), .07 * A.whisper * (st.dark ? 1.5 : 1)); });
    amb('thud', () => R(25, 60), () => thudFar(R(-.6, .6), .3 * A.thud));
    amb('crows', () => R(6, 18), () => caw(pan(R(-1, 1), ambBus), T() + .02, .25));
  }

  /* ---------- music voices ---------- */
  function pad(sc, ten) {
    const t = T() + .05, n = sc.scale.length, deg = pick([0, 0, 3, 5, 1, 4]);
    const note = i => sc.root + 12 + sc.scale[((i % n) + n) % n] + 12 * Math.floor(i / n);
    let notes = [note(deg), note(deg + 2), note(deg + 4)];
    if (ten > .3 || Math.random() < .3) notes.push(note(deg + 1) + 12);          // a close cluster on top
    if (Math.random() < .5) notes[0] -= 12;
    const a = R(2.5, 4), h = R(2, 4), r = R(4, 7), lp = filt('lowpass', 900 + 900 * ten, .7);
    lp.connect(st.layers ? st.layers.out : musicBus);
    notes.forEach(m => voice(sc.voice, mtof(m), t + R(0, .6), a, h, r, .035, lp, R(-.6, .6)));
  }
  function voice(kind, f, t, a, h, r, v, dest, p) {
    const g = g0(0), end = a + h + r; env(g.gain, t, a, v, h, r); g.connect(pan(p, dest));
    if (kind === 'choir') {
      const o = osc('sawtooth', f, t, end); osc('sine', R(4.6, 5.6), t, end).connect(g0(f * .008)).connect(o.frequency);
      pick([[800, 1150, 2900], [450, 800, 2830], [400, 1600, 2700]]).forEach((ff, i) => o.connect(filt('bandpass', ff, 9 + i * 3)).connect(g0([1, .5, .2][i] * 3)).connect(g));
    } else if (kind === 'glass') {
      [[1, .7], [2.01, .2], [3.03, .07]].forEach(([m, a2]) => osc('sine', f * m, t, end).connect(g0(a2)).connect(g));
    } else if (kind === 'organ') {
      [[1, .8, 'triangle'], [2, .3, 'sine'], [3, .12, 'sine']].forEach(([m, a2, ty]) => osc(ty, f * m * (1 + R(-.002, .002)), t, end).connect(g0(a2)).connect(g));
    } else {
      [1, 1.004, .996].forEach(d => osc('sawtooth', f * d, t, end).connect(filt('lowpass', f * 4, .5)).connect(g0(.3)).connect(g));
    }
  }
  function bell(f, t, v, dest) {
    const g = g0(0); g.connect(dest); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * .3, t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + 2.2);
    [[1, 1], [2.76, .28], [5.4, .1], [8.93, .04]].forEach(([m, a]) => { const og = g0(a); if (m > 1) { og.gain.setValueAtTime(a, t); og.gain.exponentialRampToValueAtTime(.0001, t + 1 / m); } osc('sine', f * m, t, 2.3).connect(og).connect(g); });
  }
  function lullaby(sc, o) {
    const t0 = T() + .1, beat = .44 / sc.tempo, len = o.part ? Math.floor(R(5, 12)) : LULLABY.length, start = o.part ? Math.floor(R(0, LULLABY.length - len)) : 0;
    let dest = musicBus; if (o.far) { dest = filt('lowpass', 1400); dest.connect(g0(.6)).connect(musicBus); }
    let t = t0;
    for (let i = start; i < start + len; i++) { const [k, b] = LULLABY[i]; if (Math.random() >= sc.drop) bell(mtof(sc.root + 36 + k) * Math.pow(2, R(-sc.wobble, sc.wobble) / 1200), t, o.vol, dest); t += b * beat * R(.97, 1.06 + sc.drop * .3); }
    return t - t0 + 2;
  }
  function heart(t, v) { [[0, 1], [.2, .65]].forEach(([dt, a]) => { const o = osc('sine', 62, t + dt, .2), g = g0(0); o.frequency.exponentialRampToValueAtTime(36, t + dt + .16); env(g.gain, t + dt, .008, v * a, .02, .16); o.connect(g).connect(musicDry); }); }

  /* ---------- the house ---------- */
  function clicks(dest, t, n, span, amp) { for (let i = 0; i < n; i++) { const b = C.createBufferSource(); b.buffer = clickBuf; b.connect(g0(amp * R(.3, 1))).connect(dest); b.start(t + Math.random() * span); } }
  function creak(vol, p, dest, long) {
    // stick-slip friction: a train of tiny releases through a resonant body, rate rising then falling
    const t = T() + .03, n = Math.floor(R(14, 34) * (long ? 1.7 : 1)), f0 = R(380, 950), bp = filt('bandpass', f0, R(7, 16)), g = g0(vol * 6);
    bp.connect(g).connect(pan(p, dest));
    const r0 = R(16, 32), r1 = R(30, 80); let tt = t;
    for (let i = 0; i < n; i++) { const s = Math.sin(i / n * Math.PI); tt += 1 / (r0 + (r1 - r0) * s) * R(.8, 1.2); const b = C.createBufferSource(); b.buffer = clickBuf; b.connect(g0(.25 + .9 * s * R(.6, 1))).connect(bp); b.start(tt); }
    bp.frequency.setValueAtTime(f0, t); bp.frequency.linearRampToValueAtTime(f0 * R(.8, 1.25), tt);
  }
  function drip(p, v) { const t = T() + .02, o = osc('sine', R(1400, 2200), t, .12), g = g0(0); o.frequency.exponentialRampToValueAtTime(R(500, 800), t + .06); env(g.gain, t, .002, v, 0, .08); o.connect(g).connect(pan(p, ambBus)); }
  function whisper(p, v) {
    const t = T() + .05, syl = Math.floor(R(4, 10)), s = nsrc(t, syl * .35 + 1), hp = filt('highpass', 700), f1 = filt('bandpass', 700, 6), f2 = filt('bandpass', 1500, 8), m = g0(1), g = g0(0);
    s.connect(hp); hp.connect(f1).connect(m); hp.connect(f2).connect(m); m.connect(g).connect(pan(p, ambBus));
    let tt = t; g.gain.setValueAtTime(0, t);
    for (let i = 0; i < syl; i++) { const d = R(.1, .24), vw = pick(VOWELS); f1.frequency.setTargetAtTime(vw[0], tt, .03); f2.frequency.setTargetAtTime(vw[1], tt, .03); g.gain.setTargetAtTime(v * R(.5, 1) * 8, tt, .02); g.gain.setTargetAtTime(0, tt + d * .7, .03); tt += d + (Math.random() < .2 ? R(.15, .4) : R(0, .06)); }
  }
  function thudFar(p, v) {
    const t = T() + .02, o = osc('sine', 55, t, 1), g = g0(0), d = pan(p, ambBus); o.frequency.exponentialRampToValueAtTime(28, t + .8); env(g.gain, t, .01, v, .05, .8); o.connect(g).connect(d);
    const n = nsrc(t, .4), ng = g0(0); env(ng.gain, t, .005, v * .6, .02, .3); n.connect(filt('lowpass', 220)).connect(ng).connect(d);
  }
  function clockTick(t, tock) { const b = C.createBufferSource(); b.buffer = clickBuf; b.connect(filt('bandpass', tock ? 2100 : 2900, 6)).connect(g0(1.4)).connect(ambBus); b.start(t); }
  function caw(dest, t, v) {
    [0, R(.22, .3)].forEach(dt => { const o = osc('sawtooth', R(820, 900), t + dt, .2), g = g0(0), am = g0(.6); o.frequency.exponentialRampToValueAtTime(R(520, 580), t + dt + .16); osc('sine', 60, t + dt, .2).connect(g0(.4)).connect(am.gain);
      env(g.gain, t + dt, .01, v, .06, .1); o.connect(filt('bandpass', 1300, 4)).connect(am).connect(g).connect(dest); });
  }

  /* ---------- positional effects ---------- */
  function place(o) {
    let p = 0, gn = 1, lp = 20000;
    if (o.x != null) {
      const dx = o.x - st.L.x, dz = o.z - st.L.z, d = Math.hypot(dx, dz) || .001;
      gn = 1 / (1 + Math.pow(d / 4, 1.6));
      if (!st.blind) {
        const y = st.L.yaw; p = clamp((dx * Math.cos(y) - dz * Math.sin(y)) / d, -1, 1) * .85;
        if ((-dx * Math.sin(y) - dz * Math.cos(y)) / d < -.3) lp = 5000;      // behind you: a little darker
        if (o.occ) { lp = Math.min(lp, 700); gn *= .7; }
      }
    }
    const g = g0((o.vol == null ? 1 : o.vol) * gn), f = filt('lowpass', lp, .5); g.connect(f); f.connect(pan(p, fxBus)); return g;
  }
  const SURF = { wood: 'wood', parquet: 'wood', carpetRed: 'carpet', carpetBlue: 'carpet', marble: 'stone', stone: 'stone', tile: 'stone', grass: 'grass', gravel: 'gravel' };
  function sfx(type, o) {
    if (!C) return; o = o || {}; const t = T() + .01, dest = place(o);
    const noiseHit = (fl, a, peak, h, r, at, fq) => { const n = nsrc(at || t, a + h + r), g = g0(0); env(g.gain, at || t, a, peak, h, r); n.connect(fl).connect(g).connect(dest); return g; };
    const sweep = (ty, f0, f1, dur, peak, at, a) => { const s = at || t, oo = osc(ty, f0, s, dur), g = g0(0); oo.frequency.exponentialRampToValueAtTime(f1, s + dur); env(g.gain, s, a || .003, peak, .01, dur); oo.connect(g).connect(dest); return g; };
    switch (type) {
      case 'shot': {
        noiseHit(filt('highpass', 500), .001, 1.1, .01, .07);
        sweep('sine', 160, 42, .22, .9);
        noiseHit(filt('lowpass', 1100), .01, .35, .05, .9, t + .01).connect(vsend(.9));
        [.38, .55].forEach((dt, i) => [3150, 4420].forEach(f => { const oo = osc('sine', f * R(.98, 1.02), t + dt, .15), gg = g0(0); env(gg.gain, t + dt, .001, i ? .02 : .04, 0, .12); oo.connect(gg).connect(dest); }));  // the casing
        break;
      }
      case 'empty': noiseHit(filt('bandpass', 3000, 3), .001, .5, 0, .02); break;
      case 'step': {
        const fl = SURF[o.surface] || st.sc && st.sc.floor || 'stone', side = (st.side = -st.side) * .08, d2 = pan(side, dest);
        const hit = (f, peak, r) => { const n = nsrc(t, r + .02), g = g0(0); env(g.gain, t, .003, peak, .01, r); n.connect(f).connect(g).connect(d2); };
        if (fl === 'wood') { hit(filt('lowpass', 600), .35, .09); const s = osc('sine', 95, t, .08), g = g0(0); s.frequency.exponentialRampToValueAtTime(55, t + .07); env(g.gain, t, .003, .25, 0, .07); s.connect(g).connect(d2); if (Math.random() < .07) creak(.12, side, fxBus); }
        else if (fl === 'gravel') { clicks(filt('bandpass', 2600, 1), t, Math.floor(R(6, 10)), .08, 9); hit(filt('lowpass', 400), .4, .08); }
        else if (fl === 'grass') hit(filt('bandpass', 1800, .8), .4, .12);
        else if (fl === 'carpet') hit(filt('lowpass', 350), 1.2, .07);
        else { hit(filt('highpass', 1500), .22, .05); d2.connect(vsend(.3)); }
        break;
      }
      case 'drag': noiseHit(filt('bandpass', R(300, 500), 1.5), .06, .5, .1, .18); sweep('sine', 70, 45, .12, .2); break;
      case 'scrape': noiseHit(filt('bandpass', 900, 3), .01, .25, .03, .12); break;
      case 'thud': sweep('sine', 75, 30, .5, .7, t, .005); noiseHit(filt('lowpass', 250), .005, .4, .02, .3); break;
      case 'hurt': sweep('sine', 90, 40, .3, .8, t, .002); noiseHit(filt('bandpass', 700, 1.5), .002, .6, .02, .2); st.hbBoost = T() + 6; break;
      case 'creak': creak(.9, 0, dest, true); break;
      case 'roar': {
        const g = g0(0), am = g0(.5), lp = filt('lowpass', 520); env(g.gain, t, .15, .45, .6, .8); osc('sine', 27, t, 1.6).connect(g0(.5)).connect(am.gain);
        [52, 55.5, 104].forEach(f => { const s = osc('sawtooth', f, t, 1.6); s.frequency.linearRampToValueAtTime(f * .8, t + 1.5); s.connect(lp); });
        lp.connect(am).connect(g).connect(dest); noiseHit(filt('bandpass', 400, 1), .2, .2, .5, .7);
        break;
      }
      case 'moan': {
        const s = osc('sawtooth', R(85, 110), t, 1.4), g = g0(0), f1 = filt('bandpass', 450, 8), f2 = filt('bandpass', 800, 10);
        s.frequency.linearRampToValueAtTime(R(60, 75), t + 1.2); osc('sine', 6, t, 1.4).connect(g0(3)).connect(s.frequency);
        f1.frequency.linearRampToValueAtTime(350, t + 1.2); f2.frequency.linearRampToValueAtTime(600, t + 1.2);
        s.connect(f1).connect(g); s.connect(f2).connect(g); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.6, t + .25); g.gain.linearRampToValueAtTime(0, t + 1.3); g.connect(dest);
        break;
      }
      case 'caw': caw(dest, t, .5); break;
      case 'veil': {
        const sc = st.sc || SCENES.palace; const v = vsend(1); dest.connect(v);
        sc.scale.slice(0, 5).forEach((k, i) => { const f = mtof(sc.root + 48 + k), s = osc('sine', f, t + i * .05, 1), g = g0(0); s.frequency.exponentialRampToValueAtTime(f * 1.0595, t + i * .05 + .9); env(g.gain, t + i * .05, .05, .07, .2, .7); s.connect(g).connect(dest); });
        const n = nsrc(t, .6), g = g0(0); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.2, t + .5); g.gain.linearRampToValueAtTime(0, t + .52); n.connect(filt('bandpass', 3000, 1)).connect(g).connect(dest);
        break;
      }
      case 'match': {
        const sc2 = filt('bandpass', 3200, 2), g = g0(0); nsrc(t, .2).connect(sc2).connect(g).connect(dest);
        for (let i = 0; i < 6; i++) g.gain.setValueAtTime(R(.1, .6), t + i * .02); g.gain.setValueAtTime(0, t + .13);
        noiseHit(filt('lowpass', 500), .1, .5, .2, .5, t + .12);
        break;
      }
      case 'slash': { const n = nsrc(t, .2), bp = filt('bandpass', 1800, 1.2), g = g0(0); bp.frequency.setValueAtTime(900, t); bp.frequency.exponentialRampToValueAtTime(3800, t + .12); env(g.gain, t, .02, .45, .02, .1); n.connect(bp).connect(g).connect(dest); break; }
      case 'clang': {
        [[1, .5], [2.71, .25], [5.1, .12]].forEach(([m, a]) => { const oo = osc('square', 620 * m * R(.98, 1.02), t, .6), gg = g0(0); env(gg.gain, t, .001, a * .35, 0, .5 / m); oo.connect(filt('bandpass', 620 * m, 6)).connect(gg).connect(dest); });
        noiseHit(filt('highpass', 2500), .001, .5, 0, .05); dest.connect(vsend(.5)); break;
      }
      case 'hit': sweep('sine', 180, 60, .12, .7, t, .002); noiseHit(filt('bandpass', 900, 1), .002, .5, .01, .08); break;
      case 'crumble': for (let i = 0; i < 9; i++) noiseHit(filt('bandpass', R(300, 1600), 2), .002, R(.2, .5), 0, R(.06, .18), t + i * R(.03, .07)); sweep('sine', 90, 35, .5, .5, t, .01); break;
      case 'unlock': [0, .09].forEach((dt, i) => { const oo = osc('square', i ? 1400 : 900, t + dt, .05), gg = g0(0); env(gg.gain, t + dt, .001, .12, 0, .04); oo.connect(filt('bandpass', 2000, 2)).connect(gg).connect(dest); }); creak(.5, 0, dest); break;
      case 'blip': { const oo = osc('square', R(520, 560), t, .03), gg = g0(0); env(gg.gain, t, .001, .03, 0, .025); oo.connect(filt('lowpass', 1800)).connect(gg).connect(dest); break; }
      case 'whoosh': { const n = nsrc(t, .5), bp = filt('bandpass', 400, 1), g = g0(0); bp.frequency.exponentialRampToValueAtTime(1600, t + .35); env(g.gain, t, .15, .25, .05, .25); n.connect(bp).connect(g).connect(dest); break; }
      case 'flap': for (let i = 0; i < 5; i++) noiseHit(filt('bandpass', 700, 1.5), .005, .3, 0, .05, t + i * .07); break;
      case 'pickup': {
        const sc = st.sc || SCENES.east; dest.connect(vsend(.6));
        [[0, 0], [sc.scale[4], .12]].forEach(([k, dt]) => bell(mtof(sc.root + 48 + k), t + dt, .6, dest));
        break;
      }
    }
  }

  /* ---------- stingers ---------- */
  function stinger(kind) {
    if (!C) return; const t = T() + .01, sc = st.sc || SCENES.east;
    if (kind === 'alert') {
      if (t - st.lastAlert < 8) return; st.lastAlert = t;
      const bp = filt('bandpass', 2400, .8); bp.connect(musicBus);
      [0, 1, 2, 6].forEach(k => { const s = osc('sawtooth', mtof(sc.root + 48 + k), t, 1.7), g = g0(0); env(g.gain, t, .01, .06, .15, 1.4); s.connect(g).connect(bp); });
      const b = osc('sine', 45, t, 2), bg = g0(0); b.frequency.exponentialRampToValueAtTime(30, t + 1.8); env(bg.gain, t, .005, .7, .1, 1.7); b.connect(bg).connect(musicDry);
      const n = nsrc(t, .9), nf = filt('bandpass', 4000, 2), ng = g0(0); nf.frequency.exponentialRampToValueAtTime(400, t + .8); env(ng.gain, t, .02, .25, .1, .7); n.connect(nf).connect(ng).connect(musicBus);
      st.hbBoost = Math.max(st.hbBoost, t + 5);
    } else if (kind === 'death') {
      if (st.layers) st.layers.out.gain.setTargetAtTime(.0001, t, .4);
      const lp = filt('lowpass', 1200); lp.connect(musicBus);
      [0, 1, 6].forEach(k => { const f = mtof(sc.root + 24 + k), s = osc('sawtooth', f, t, 4), g = g0(0); s.frequency.exponentialRampToValueAtTime(f / 2, t + 3.5); env(g.gain, t, .05, .1, .5, 3); s.connect(g).connect(lp); });
      const b = osc('sine', 40, t, 3), bg = g0(0); env(bg.gain, t, .005, .8, .2, 2.5); b.connect(bg).connect(musicDry);
      setTimeout(() => { if (st.layers) st.layers.out.gain.setTargetAtTime(1, T(), 3); }, 5000);
    }
  }

  /* ---------- per-frame state from the game ---------- */
  function update(o) {
    st.L.x = o.x; st.L.z = o.z; st.L.yaw = o.yaw; st.safe = !!o.safe; st.dark = !!o.dark; st.blind = !!o.blind; st.hp = o.hp; st.running = !!o.running;
    const target = st.safe ? 0 : clamp(Math.max(o.threat || 0, st.dark ? .3 : .12, o.hp <= 1 ? .45 : 0), 0, 1), dt = o.dt || .016;
    st.tension += (target - st.tension) * (1 - Math.exp(-dt / (target > st.tension ? .6 : 6)));     // quick to rise, slow to settle
  }
  function setMusic(on) {
    st.musicOn = on; store.set('palace.music', on);
    if (C) [musicBus, musicDry].forEach(g => g.gain.setTargetAtTime(on ? .8 : 0, T(), .3));
  }

  // offline rendering for tests and listening: drives the scheduler on a virtual clock
  async function renderOffline(ctx, sceneName, seconds, script) {
    const keep = { C, out, musicBus, musicDry, fxBus, ambBus, verb, noise, clickBuf, glassBuf, st: Object.assign({}, st), L: st.L };
    st.vt = 0; st.scene = null; st.sc = null; st.layers = null; st.next = {}; st.L = { x: 0, z: 0, yaw: 0 }; st.musicOn = true; st.lastAlert = -99; st.hbBoost = 0; st.boxBusy = 0;
    init(ctx); scene(sceneName);
    for (let vt = 0; vt < seconds; vt += .09) { st.vt = vt; if (script) script(vt, api); tick(); }
    const buf = await ctx.startRendering();
    ({ C, out, musicBus, musicDry, fxBus, ambBus, verb, noise, clickBuf, glassBuf } = keep); Object.assign(st, keep.st); st.L = keep.L;
    return buf;
  }
  const api = { init, scene, update, sfx, stinger, setMusic, get musicOn() { return st.musicOn; }, get tension() { return st.tension; }, _st: st, at(vt, fn) { const p = st.vt; st.vt = vt; fn(); st.vt = p; }, renderOffline, SCENES };
  root.PALACE_AUDIO = api;
})(typeof window !== 'undefined' ? window : globalThis);
