/* The Palace: adaptive design optimization.
   Grid posteriors over each task's model parameters. Before each trial, the candidate design with
   the largest expected information gain (EIG) about the parameters is chosen. Runs in the browser
   (window.PALACE_ADO) and in node (module.exports). */
(function (root) {
  'use strict';

  /* ---------- grid posterior ---------- */
  function Grid(axes) {
    const names = Object.keys(axes), sizes = names.map(n => axes[n].length), N = sizes.reduce((a, b) => a * b, 1);
    const cols = {}; names.forEach(n => cols[n] = new Float64Array(N));
    for (let i = 0; i < N; i++) { let r = i; for (let j = names.length - 1; j >= 0; j--) { const n = names[j]; cols[n][i] = axes[n][r % sizes[j]]; r = Math.floor(r / sizes[j]); } }
    return { names, axes, N, cols, logp: new Float64Array(N) };
  }
  function weights(g) {
    let m = -Infinity; for (let i = 0; i < g.N; i++) if (g.logp[i] > m) m = g.logp[i];
    const w = new Float64Array(g.N); let s = 0; for (let i = 0; i < g.N; i++) { w[i] = Math.exp(g.logp[i] - m); s += w[i]; }
    for (let i = 0; i < g.N; i++) w[i] /= s; return w;
  }
  function entropy(w) { let h = 0; for (let i = 0; i < w.length; i++) if (w[i] > 1e-300) h -= w[i] * Math.log(w[i]); return h; }
  function summary(g) {
    const w = weights(g), out = {};
    g.names.forEach(n => {
      let m = 0; for (let i = 0; i < g.N; i++) m += w[i] * g.cols[n][i];
      // marginal 10th and 90th percentiles
      const vals = g.axes[n], marg = vals.map(() => 0);
      for (let i = 0; i < g.N; i++) marg[vals.indexOf(g.cols[n][i])] += w[i];
      let c = 0, lo = vals[0], hi = vals[vals.length - 1], gotLo = false;
      for (let k = 0; k < vals.length; k++) { c += marg[k]; if (!gotLo && c >= .1) { lo = vals[k]; gotLo = true; } if (c >= .9) { hi = vals[k]; break; } }
      out[n] = { mean: +m.toFixed(4), lo, hi };
    });
    return out;
  }
  // carry a posterior into a new session, letting it widen so real change can show up
  function drift(g, eps) { const w = weights(g); for (let i = 0; i < g.N; i++) g.logp[i] = Math.log((1 - eps) * w[i] + eps / g.N); }
  function serialize(g) { return Array.from(g.logp, v => +v.toFixed(3)); }
  function restore(g, arr) { if (arr && arr.length === g.N) for (let i = 0; i < g.N; i++) g.logp[i] = arr[i]; return g; }
  function sampleIdx(w, n, rnd) {
    const out = []; let c = 0, u = rnd() / n, i = 0;
    for (let k = 0; k < n; k++) { const t = u + k / n; while (c + w[i] < t && i < w.length - 1) { c += w[i]; i++; } out.push(i); }
    return out;
  }
  function gauss(rnd) { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  /* ---------- lantern: triangle completion (calibrated on real data, see sim/calib) ----------
     Chosen across two datasets: triangle completion in healthy elderly and biomarker-typed MCI (Howett et al. 2019 /
     Castegnaro et al. 2023, 98 people) and curved-path homing in young and older adults (Stangl et al. 2020, 56 people).
     The model as first built (one isotropic blob of accumulating noise) fit both worse than this one.
       The outbound path is integrated with every turn registered times g2. From that mental position:
       return distance  ~ N(gain * exp(-leak * L) * mental home distance, a^2 L)
       return direction ~ N(true home direction + mental turn error, nu0^2 + a^2 L / c^2)
     nu0 is a constant heading noise; a is positional noise accumulating with distance walked (it spreads direction more
     when home is close). nu0 is the marker: d 2.4 for biomarker-positive MCI vs healthy elderly, also d .9 for older vs
     young adults, so norms must be age-matched. g2 < 1: turns registered as smaller, so the return over-turns. */
  const LANTERN_AXES = { gain: [.4, .55, .7, .85, 1, 1.15], leak: [-.03, 0, .02, .05, .08], g2: [.3, .5, .7, .85, 1, 1.15, 1.35], nu0: [5, 12, 20, 30, 45, 65], a: [.1, .2, .35, .55, .8] };   // axes match sim/sim16 LAX3
  // mental homing for legs `lens` and turns `turns` (degrees, the games' own sign) when turns are registered times k:
  // returns the error of the mental homing direction (radians, same sign as turns) and the mental home distance
  function pathGeom(d, k) {
    if (!d.lens || !d.lens.length) return { rot: 0, cm: d.c };
    const walk = kk => { let h = 0, x = 0, y = 0; d.lens.forEach((ln, i) => { if (i) h += kk * d.turns[i - 1] * Math.PI / 180; x += ln * Math.sin(h); y += ln * Math.cos(h); }); return { x, y, h }; };
    const t = walk(1), m = walk(k);
    let e = (Math.atan2(-m.x, -m.y) - m.h) - (Math.atan2(-t.x, -t.y) - t.h); e = ((e + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    return { rot: e, cm: Math.hypot(m.x, m.y) };
  }
  function geomTable(d) { const T = new Map(); LANTERN_AXES.g2.forEach(k => T.set(k, pathGeom(d, k))); return T; }
  const wrapPi = a => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  function lanternLogLik(g, d, er, et, out, T) {
    const { gain, leak, g2, nu0, a } = g.cols; T = T || geomTable(d);
    const r = Math.hypot(d.c + er, et), th = Math.atan2(et, d.c + er), cc = Math.max(d.c, .3);
    for (let i = 0; i < g.N; i++) {
      const G = T.get(g2[i]), R = gain[i] * Math.exp(-leak[i] * d.L) * G.cm, n0 = nu0[i] * Math.PI / 180, sr2 = a[i] * a[i] * d.L, sn2 = n0 * n0 + sr2 / (cc * cc), dt = wrapPi(th - G.rot);
      out[i] = -Math.log(2 * Math.PI) - .5 * Math.log(sr2 * sn2) - (r - R) * (r - R) / (2 * sr2) - dt * dt / (2 * sn2);
    }
    return out;
  }
  function lanternUpdate(g, d, er, et) { const ll = lanternLogLik(g, d, er, et, new Float64Array(g.N)); for (let i = 0; i < g.N; i++) g.logp[i] += ll[i]; }
  function lanternEIG(g, d, rnd, S) {
    S = S || 20; const w = weights(g), H0 = entropy(w), idx = sampleIdx(w, S, rnd), ll = new Float64Array(g.N), post = new Float64Array(g.N), T = geomTable(d);
    const { gain, leak, g2, nu0, a } = g.cols; let Hs = 0; const cc = Math.max(d.c, .3);
    for (const i of idx) {
      const G = T.get(g2[i]), R = gain[i] * Math.exp(-leak[i] * d.L) * G.cm, n0 = nu0[i] * Math.PI / 180;
      const r = Math.max(.05, R + a[i] * Math.sqrt(d.L) * gauss(rnd)), th = G.rot + Math.sqrt(n0 * n0 + a[i] * a[i] * d.L / (cc * cc)) * gauss(rnd);
      lanternLogLik(g, d, r * Math.cos(th) - d.c, r * Math.sin(th), ll, T);
      let m = -Infinity; for (let k = 0; k < g.N; k++) { post[k] = g.logp[k] + ll[k]; if (post[k] > m) m = post[k]; }
      let z = 0; for (let k = 0; k < g.N; k++) { post[k] = Math.exp(post[k] - m); z += post[k]; }
      let h = 0; for (let k = 0; k < g.N; k++) { const p = post[k] / z; if (p > 1e-300) h -= p * Math.log(p); }
      Hs += h;
    }
    return H0 - Hs / S;
  }
  // errors from a homing result: distance ratio and signed angle relative to the correct homing vector
  function lanternObs(res) {
    const c = res.startDist, a = (res.angErr || 0) * Math.PI / 180, r = (res.distRatio == null ? 1 : res.distRatio) * c;
    return { c, er: r * Math.cos(a) - c, et: r * Math.sin(a) };
  }

  /* ---------- palace: integrating one glimpse ----------
     Outcomes after a reshuffle: correct, stale (where the room used to be), other.
       rho: infers the whole rearrangement from one glimpse; alpha: updates the glimpsed link;
       m: remembers the links that did not change. */
  const PALACE_AXES = { rho: [.05, .2, .35, .5, .65, .8, .95], alpha: [.05, .2, .35, .5, .65, .8, .95], m: [.2, .35, .5, .65, .8, .9, .97] };
  function palaceProbs(rho, alpha, m, kind) {
    const g6 = 1 / 6;
    if (kind === 'none') { const c = m + (1 - m) * g6; return [c, 0, 1 - c]; }
    const noUpd = (1 - rho) * (1 - alpha), stale = noUpd * (m + (1 - m) * g6);
    const correct = kind === 'rotate' ? rho + (1 - rho) * alpha * .25 + noUpd * (1 - m) * g6
      : rho + (1 - rho) * alpha * (m + (1 - m) * .25) + noUpd * (1 - m) * g6;   // swap: exclusion works if other links are remembered
    return [correct, stale, Math.max(1e-6, 1 - correct - stale)];
  }
  const CLS = { correct: 0, stale: 1, glimpse: 2, other: 2 };
  function palaceUpdate(g, kind, cls) {
    const k = CLS[cls], { rho, alpha, m } = g.cols;
    for (let i = 0; i < g.N; i++) g.logp[i] += Math.log(Math.max(1e-9, palaceProbs(rho[i], alpha[i], m[i], kind)[k]));
  }
  function palaceEIG(g, kind) {
    const w = weights(g), { rho, alpha, m } = g.cols, pred = [0, 0, 0]; let condH = 0;
    for (let i = 0; i < g.N; i++) {
      const p = palaceProbs(rho[i], alpha[i], m[i], kind);
      for (let k = 0; k < 3; k++) { pred[k] += w[i] * p[k]; if (p[k] > 1e-12) condH -= w[i] * p[k] * Math.log(p[k]); }
    }
    let H = 0; pred.forEach(q => { if (q > 1e-12) H -= q * Math.log(q); });
    return H - condH;
  }

  /* ---------- per-player state ---------- */
  function newState(saved) {
    const L = Grid(LANTERN_AXES), P = Grid(PALACE_AXES);
    if (saved) { restore(L, saved.lantern); restore(P, saved.palace); drift(L, .3); drift(P, .3); }
    return { lantern: L, palace: P };
  }
  function save(st) { return { lantern: serialize(st.lantern), palace: serialize(st.palace), t: Date.now() }; }
  function chooseLantern(st, cands, rnd, anchor) {
    if (anchor) { let best = cands[0]; cands.forEach(c => { if (Math.abs(c.length - 12) < Math.abs(best.length - 12)) best = c; }); return { pick: best, eig: null, anchor: true }; }
    let best = null, be = -Infinity;
    cands.slice(0, 6).forEach(c => { const e = lanternEIG(st.lantern, { L: c.length, c: c.homeDist, lens: c.lens, turns: c.turns }, rnd); if (e > be) { be = e; best = c; } });
    return { pick: best, eig: +be.toFixed(4), anchor: false };
  }
  function choosePalace(st, kinds, anchor) {
    if (anchor) return { kind: anchor, eig: null, anchor: true };
    let best = kinds[0], be = -Infinity; kinds.forEach(k => { const e = palaceEIG(st.palace, k); if (e > be) { be = e; best = k; } });
    return { kind: best, eig: +be.toFixed(4), anchor: false };
  }

  // marginal posterior per parameter, for display
  function marginals(g) {
    const w = weights(g), out = {};
    g.names.forEach(n => { const vals = g.axes[n], p = vals.map(() => 0); for (let i = 0; i < g.N; i++) p[vals.indexOf(g.cols[n][i])] += w[i]; out[n] = { vals, p }; });
    return out;
  }
  const api = { Grid, weights, entropy, summary, marginals, drift, serialize, restore, LANTERN_AXES, PALACE_AXES, lanternUpdate, lanternEIG, lanternObs, palaceProbs, palaceUpdate, palaceEIG, newState, save, chooseLantern, choosePalace };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PALACE_ADO = api;
})(typeof window !== 'undefined' ? window : globalThis);
