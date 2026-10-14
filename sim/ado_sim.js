// Fixed vs adaptive designs, using the game's own ado.js.
// Simulated players do 10 sessions of 5 lantern returns and 11 palace glimpse tests.
// Usage: node ado_sim.js <policy fixed|ado> <misspec 0|1> <n per group> <seed> > out.json
const A = require('../ado.js');
const [, , policy = 'ado', misspec = '0', nArg = '60', seedArg = '1'] = process.argv;
let seed = +seedArg >>> 0;
const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const sig = x => 1 / (1 + Math.exp(-x)), logit = p => Math.log(p / (1 - p));

// half-sized prodromal effects (the realistic case); novices: intact cognition, worse reporting/motor noise
const G = {
  healthy:   { acc: .30, rep: .50, gain: 1.00, leak: .004, rho: .60,  alpha: .60, m: .90 },
  prodromal: { acc: .425, rep: .525, gain: .975, leak: .008, rho: .475, alpha: .49, m: .825 },
  novice:    { acc: .38, rep: .85, gain: .90, leak: .005, rho: .55,  alpha: .57, m: .86 },
};
function person(g) {
  const b = G[g], ln = (v, s) => v * Math.exp(s * gauss()), lg = (v, s) => sig(logit(v) + s * gauss());
  return { acc: ln(b.acc, .25), rep: ln(b.rep, .25), gain: b.gain + .06 * gauss(), leak: Math.max(0, b.leak + .003 * gauss()),
    rho: lg(b.rho, .6), alpha: lg(b.alpha, .6), m: lg(b.m, .6), bias: misspec === '1' ? (15 * gauss()) * Math.PI / 180 : 0 };
}
function candidates() {
  const out = [];
  for (let k = 0; k < 10; k++) {
    const legs = rnd() < .5 ? 2 : 3; let x = 0, z = 0, h = rnd() * 6.283, L = 0;
    for (let i = 0; i < legs; i++) { if (i) h += ([60, 90, 120, 150][Math.floor(rnd() * 4)] * (rnd() < .5 ? -1 : 1)) * Math.PI / 180; const l = 2.5 + rnd() * 6.5; L += l; x += Math.sin(h) * l; z -= Math.cos(h) * l; }
    out.push({ length: L, homeDist: Math.max(.5, Math.hypot(x, z)) });
  }
  return out;
}
function lanternTrial(st, p, s, t) {
  const cands = candidates();
  const d = policy === 'ado' ? A.chooseLantern(st, cands, rnd, t === 0).pick : cands[0];
  const sd = Math.sqrt(p.acc * p.acc * d.length + p.rep * p.rep), c = d.homeDist;
  let er = (p.gain * Math.exp(-p.leak * d.length) - 1) * c + sd * gauss(), et = sd * gauss();
  if (p.bias) { const rx = c + er, ry = et, cs = Math.cos(p.bias), sn = Math.sin(p.bias); er = rx * cs - ry * sn - c; et = rx * sn + ry * cs; }
  A.lanternUpdate(st.lantern, { L: d.length, c }, er, et);
  return d.length;
}
const FIXED = ['swap', 'rotate', 'none'];
function palaceTrial(st, p, i) {
  const anchors = ['swap', 'rotate', 'none'];
  const kind = policy === 'ado' ? A.choosePalace(st, ['swap', 'rotate', 'none'], i < 3 ? anchors[i] : null).kind : FIXED[i % 3];
  const pr = A.palaceProbs(p.rho, p.alpha, p.m, kind), u = rnd();
  A.palaceUpdate(st.palace, kind, u < pr[0] ? 'correct' : u < pr[0] + pr[1] ? 'stale' : 'other');
  return kind;
}
const n = +nArg, rows = [];
for (const g of Object.keys(G)) for (let i = 0; i < n; i++) {
  const p = person(g); let st = A.newState(); const Ls = [], kinds = { swap: 0, rotate: 0, none: 0 }, traj = [];
  for (let s = 0; s < 10; s++) {
    for (let t = 0; t < 5; t++) Ls.push(lanternTrial(st, p, s, t));
    for (let k = 0; k < 11; k++) kinds[palaceTrial(st, p, s * 11 + k)]++;
    if (s === 0 || s === 2 || s === 9) { const L = A.summary(st.lantern), P = A.summary(st.palace); traj.push({ s, acc: L.acc.mean, rho: P.rho.mean, accW: L.acc.hi - L.acc.lo, rhoW: P.rho.hi - P.rho.lo }); }
  }
  const L = A.summary(st.lantern), P = A.summary(st.palace);
  rows.push({ group: g, truth: p, est: { acc: L.acc.mean, rep: L.rep.mean, gain: L.gain.mean, leak: L.leak.mean, rho: P.rho.mean, alpha: P.alpha.mean, m: P.m.mean }, traj,
    meanL: Ls.reduce((a, b) => a + b, 0) / Ls.length, longFrac: Ls.filter(l => l > 15).length / Ls.length, kinds });
}
process.stdout.write(JSON.stringify(rows));
