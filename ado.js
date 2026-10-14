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

  /* ---------- lantern: triangle completion ----------
     Error in the frame of the true homing vector (length c, outbound path length L):
       radial  e_r ~ N((gain * exp(-leak * L) - 1) * c, s)   tangential e_t ~ N(0, s)
       s^2 = acc^2 * L + rep^2     (acc: accumulating noise per sqrt(m); rep: reporting noise) */
  // bias: a constant rotation of the homing response (degrees); real path integrators drift to one side
  const LANTERN_AXES = { acc: [.1, .2, .3, .4, .55, .7, .9, 1.2], rep: [.2, .35, .5, .7, .9, 1.2, 1.6], gain: [.75, .85, .95, 1.05, 1.15], leak: [0, .006, .012, .02, .03], bias: [-24, -12, 0, 12, 24] };
  function lanternLogLik(g, d, er, et, out) {
    const { acc, rep, gain, leak, bias } = g.cols;
    for (let i = 0; i < g.N; i++) {
      const s2 = acc[i] * acc[i] * d.L + rep[i] * rep[i], R = gain[i] * Math.exp(-leak[i] * d.L) * d.c, b = bias[i] * Math.PI / 180;
      const mr = R * Math.cos(b) - d.c, mt = R * Math.sin(b);
      out[i] = -Math.log(2 * Math.PI * s2) - ((er - mr) * (er - mr) + (et - mt) * (et - mt)) / (2 * s2);
    }
    return out;
  }
  function lanternUpdate(g, d, er, et) { const ll = lanternLogLik(g, d, er, et, new Float64Array(g.N)); for (let i = 0; i < g.N; i++) g.logp[i] += ll[i]; }
  function lanternEIG(g, d, rnd, S) {
    S = S || 20; const w = weights(g), H0 = entropy(w), idx = sampleIdx(w, S, rnd), ll = new Float64Array(g.N), post = new Float64Array(g.N);
    const { acc, rep, gain, leak, bias } = g.cols; let Hs = 0;
    for (const i of idx) {
      const s = Math.sqrt(acc[i] * acc[i] * d.L + rep[i] * rep[i]), R = gain[i] * Math.exp(-leak[i] * d.L) * d.c, b = bias[i] * Math.PI / 180;
      const er = R * Math.cos(b) - d.c + s * gauss(rnd), et = R * Math.sin(b) + s * gauss(rnd);
      lanternLogLik(g, d, er, et, ll);
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
    cands.slice(0, 6).forEach(c => { const e = lanternEIG(st.lantern, { L: c.length, c: c.homeDist }, rnd); if (e > be) { be = e; best = c; } });
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
