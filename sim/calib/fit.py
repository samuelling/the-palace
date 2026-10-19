"""
Fit path-integration models per participant to the Howett/Castegnaro triangle-completion data (trials.json).

Models, all scored as a density over the response (return distance l3, return direction theta at cone 3):
  glampi      GLAMPI, 7 parameters (beta, k, g2, g3, m3, sigma, nu), the published winner; angle residual wrapped
  glampi_raw  the same with the unwrapped (long-way-turn corrected) return angle, for replicating the paper
  E5          The Palace's lantern model: accumulating noise acc, reporting noise rep, gain, leak (per metre),
              constant turning bias (sign follows the participant's body side, i.e. undone by the left-turn flip)
  E5_in       as E5 with the bias defined relative to the turn (over/under-turning towards the inside)
  E5_g2       as E5 with the bias replaced by an angular gain g2 on the outbound turn
  E6          E5 plus g2
Positional noise in E-models is isotropic: s^2 = acc^2 * L + rep^2 (L = outbound length).
Out-of-bound trials contribute the direction only (projected-normal density for the E-models, as GLAMPI does).

Usage: python3 fit.py [models...]  -> fits.json
"""
import json, sys
import numpy as np
from scipy.optimize import minimize
from scipy.stats import norm
from multiprocessing import Pool

LOG2PI = np.log(2 * np.pi)


def wrap(a): return (a + np.pi) % (2 * np.pi) - np.pi


def sang(u, v): return np.arctan2(u[..., 0] * v[..., 1] - u[..., 1] * v[..., 0], (u * v).sum(-1))


def arrays(r, cond=None):
    T = [t for t in r['trials'] if not t['bad'] and (cond is None or t['cond'] == cond)]
    if len(T) < 2: return dict(n=len(T))
    c1 = np.array([t['c1'] for t in T]); c2 = np.array([t['c2'] for t in T]); c3 = np.array([t['c3'] for t in T]); f = np.array([t['final'] for t in T])
    s1, s2, v = c2 - c1, c3 - c2, f - c3
    D = dict(l1=np.linalg.norm(s1, axis=1), l2=np.linalg.norm(s2, axis=1), th2=sang(s1, s2), l3=np.linalg.norm(v, axis=1),
             th3_raw=np.radians([t['real_ret'] for t in T]), th3=sang(s2, v), oob=np.array([t['oob'] for t in T], bool),
             T1=np.array([t['T_L1'] for t in T]), T2=np.array([t['T_L2'] for t in T]), side=np.where([t['flip'] for t in T], -1.0, 1.0),
             cond=np.array([t['cond'] for t in T]))
    home = c1 - c3; D['c'] = np.linalg.norm(home, axis=1); D['alpha'] = sang(s2, home)   # true return turn and distance
    D['L'] = D['l1'] + D['l2']; D['n'] = len(T)
    return D


# ---------------------------------------------------------------- GLAMPI (port of Estimate_beta_k_g2_g3_m3_sigma_nu)
def glampi_nll(p, D, raw=False):
    beta, k, g2, g3, m3, sigma, nu = p
    def leakf(T):
        x = beta * T
        return np.where(np.abs(x) < 1e-8, 1.0, (1 - np.exp(-x)) / np.where(np.abs(x) < 1e-8, 1, x))
    m1 = D['l1'] * k * leakf(D['T1']) * np.exp(-beta * D['T2']); m2 = D['l2'] * k * leakf(D['T2'])
    t2 = g2 * D['th2']
    p1 = np.stack([m1, 0 * m1], 1); p2 = np.stack([m1 + m2 * np.cos(t2), m2 * np.sin(t2)], 1)
    h = np.linalg.norm(p2, axis=1); a = sang(p2 - p1, -p2)
    th3 = D['th3_raw'] if raw else D['th3']
    mean_angle = np.mean(th3); mean_dist = np.mean(D['l3'][~D['oob']])
    t3 = np.sign(a) * (g3 * np.abs(a) + mean_angle * (1 - g3))
    da = th3 - t3 if raw else wrap(th3 - t3)
    nll = np.sum(.5 * LOG2PI + np.log(nu) + da ** 2 / (2 * nu ** 2))
    l3p = m3 * h + mean_dist * (1 - m3); dd = (D['l3'] - l3p)[~D['oob']]
    return nll + np.sum(.5 * LOG2PI + np.log(sigma) + dd ** 2 / (2 * sigma ** 2))


# ---------------------------------------------------------------- the lantern model family
def e_pred(p, D, kind):
    if kind == 'E5':    acc, rep, gain, leak, bias = p; g2 = 1.0; b = np.radians(bias) * D['side']
    elif kind == 'E5_in': acc, rep, gain, leak, bias = p; g2 = 1.0; b = np.radians(bias) * np.ones(D['n'])
    elif kind == 'E5_g2': acc, rep, gain, leak, g2 = p; b = 0.0
    elif kind == 'E6':  acc, rep, gain, leak, bias, g2 = p; b = np.radians(bias) * D['side']
    if g2 == 1.0: a, c = D['alpha'], D['c']
    else:
        t2 = g2 * D['th2']; p2 = np.stack([D['l1'] + D['l2'] * np.cos(t2), D['l2'] * np.sin(t2)], 1)
        a = sang(np.stack([np.cos(t2), np.sin(t2)], 1), -p2); c = np.linalg.norm(p2, axis=1)
    R = gain * np.exp(-leak * D['L']) * c; s = np.sqrt(acc ** 2 * D['L'] + rep ** 2)
    return R, a + b, s


def e_nll(p, D, kind):
    R, phi, s = e_pred(p, D, kind)
    dth = wrap(D['th3'] - phi); r = D['l3']; ib = ~D['oob']
    # in-bound: 2D isotropic Gaussian on the endpoint, in polar coordinates (Jacobian r)
    d2 = r ** 2 + R ** 2 - 2 * r * R * np.cos(dth)
    ll_in = -np.log(2 * np.pi * s ** 2) - d2 / (2 * s ** 2) + np.log(np.maximum(r, 1e-6))
    # out of bound: direction only, projected normal
    kap = R / s; aa = kap * np.cos(dth)
    ll_oob = -np.log(2 * np.pi) - .5 * (kap * np.sin(dth)) ** 2 + np.log(np.exp(-.5 * aa ** 2) + aa * np.sqrt(2 * np.pi) * norm.cdf(aa) + 1e-300)
    return -np.sum(np.where(ib, ll_in, ll_oob))


# ---------------------------------------------------------------- separable angle/distance models built on our geometry
def a_nll(p, D, kind):
    """Mental path integration with an angular gain g2 on the outbound turn; distance gain and leak (per metre);
    response direction ~ N(mental return turn * gp + inward bias, nu); return distance ~ N(gain*exp(-leak*L)*mental home distance, sigma)."""
    gain, leak, g2, sigma, nu = p[:5]; extra = dict(zip({'A5': [], 'A6b': ['bias'], 'A6p': ['gp'], 'A7': ['bias', 'gp']}[kind], p[5:]))
    t2 = g2 * D['th2']; p2 = np.stack([D['l1'] + D['l2'] * np.cos(t2), D['l2'] * np.sin(t2)], 1)
    a = sang(np.stack([np.cos(t2), np.sin(t2)], 1), -p2); c = np.linalg.norm(p2, axis=1)
    phi = extra.get('gp', 1.0) * a + np.radians(extra.get('bias', 0.0))
    dth = wrap(D['th3'] - phi)
    nll = np.sum(.5 * LOG2PI + np.log(nu) + dth ** 2 / (2 * nu ** 2))
    dd = (D['l3'] - gain * np.exp(-leak * D['L']) * c)[~D['oob']]
    return nll + np.sum(.5 * LOG2PI + np.log(sigma) + dd ** 2 / (2 * sigma ** 2))


def n_nll(p, D, kind):
    """As A5, but noise is positional and anisotropic in the true-home frame: radial sd ar, tangential sd at (metres),
    either accumulating with outbound length (N5: sd^2 = a^2 L) or constant (N5c). Angular spread is then at / distance."""
    gain, leak, g2, ar, at = p
    t2 = g2 * D['th2']; p2 = np.stack([D['l1'] + D['l2'] * np.cos(t2), D['l2'] * np.sin(t2)], 1)
    a = sang(np.stack([np.cos(t2), np.sin(t2)], 1), -p2); c = np.linalg.norm(p2, axis=1)
    R = gain * np.exp(-leak * D['L']) * c
    sr, st = (ar * np.sqrt(D['L']), at * np.sqrt(D['L'])) if kind == 'N5' else (ar * np.ones(D['n']), at * np.ones(D['n']))
    # frame: x along the true home direction from cone 3
    dth = wrap(D['th3'] - D['alpha']); rot = wrap(a - D['alpha'])
    dx = D['l3'] * np.cos(dth) - R * np.cos(rot); dy = D['l3'] * np.sin(dth) - R * np.sin(rot); ib = ~D['oob']
    ll_in = -LOG2PI - np.log(sr * st) - dx ** 2 / (2 * sr ** 2) - dy ** 2 / (2 * st ** 2) + np.log(np.maximum(D['l3'], 1e-3))
    # out of bound: direction only; anisotropic projected normal integrated numerically over distance
    rr = np.linspace(.05, 12, 240)[:, None]; dr = rr[1, 0] - rr[0, 0]
    gx = rr * np.cos(dth)[None] - (R * np.cos(rot))[None]; gy = rr * np.sin(dth)[None] - (R * np.sin(rot))[None]
    dens = np.exp(-gx ** 2 / (2 * sr ** 2) - gy ** 2 / (2 * st ** 2)) * rr / (2 * np.pi * sr * st)
    ll_oob = np.log(dens.sum(0) * dr + 1e-300)
    return -np.sum(np.where(ib, ll_in, ll_oob))


def h_nll(p, D, kind):
    """Hybrid: return distance ~ N(R, ar^2 L); return direction ~ N(mental turn error, nu0^2 + at^2 L / c^2).
    H5 shares one positional noise a = ar = at."""
    if kind == 'H5': gain, leak, g2, nu0, a = p; ar = at = a
    else: gain, leak, g2, nu0, ar, at = p
    t2 = g2 * D['th2']; p2 = np.stack([D['l1'] + D['l2'] * np.cos(t2), D['l2'] * np.sin(t2)], 1)
    am = sang(np.stack([np.cos(t2), np.sin(t2)], 1), -p2); c = np.linalg.norm(p2, axis=1)
    R = gain * np.exp(-leak * D['L']) * c
    sn = np.sqrt(nu0 ** 2 + at ** 2 * D['L'] / np.maximum(D['c'], .3) ** 2); sr = np.sqrt(ar ** 2 * D['L'] + 1e-4)
    dth = wrap(D['th3'] - am)
    nll = np.sum(.5 * LOG2PI + np.log(sn) + dth ** 2 / (2 * sn ** 2))
    dd = (D['l3'] - R)[~D['oob']]
    return nll + np.sum(.5 * LOG2PI + np.log(sr[~D['oob']]) + dd ** 2 / (2 * sr[~D['oob']] ** 2))


ABASE = [(.2, 2.5), (-.1, .3), (0, 3), (1e-3, 3), (1e-3, np.pi)]; ANAMES = ['gain', 'leak', 'g2', 'sigma', 'nu']
MODELS = {
    'A5':  (lambda p, D: a_nll(p, D, 'A5'), ABASE, ANAMES),
    'A6b': (lambda p, D: a_nll(p, D, 'A6b'), ABASE + [(-90, 90)], ANAMES + ['bias']),
    'A6p': (lambda p, D: a_nll(p, D, 'A6p'), ABASE + [(0, 3)], ANAMES + ['gp']),
    'A7':  (lambda p, D: a_nll(p, D, 'A7'), ABASE + [(-90, 90), (0, 3)], ANAMES + ['bias', 'gp']),
    'H5':  (lambda p, D: h_nll(p, D, 'H5'), [(.2, 2.5), (-.1, .3), (0, 3), (1e-3, np.pi), (.01, 2)], ['gain', 'leak', 'g2', 'nu0', 'a']),
    'H6':  (lambda p, D: h_nll(p, D, 'H6'), [(.2, 2.5), (-.1, .3), (0, 3), (1e-3, np.pi), (.01, 2), (.01, 2)], ['gain', 'leak', 'g2', 'nu0', 'ar', 'at']),
    'N5':  (lambda p, D: n_nll(p, D, 'N5'), [(.2, 2.5), (-.1, .3), (0, 3), (.01, 2), (.01, 2)], ['gain', 'leak', 'g2', 'ar', 'at']),
    'N5c': (lambda p, D: n_nll(p, D, 'N5c'), [(.2, 2.5), (-.1, .3), (0, 3), (.01, 4), (.01, 4)], ['gain', 'leak', 'g2', 'ar', 'at']),
    'glampi':     (lambda p, D: glampi_nll(p, D), [(-1, 1), (.5, 2), (0, 3), (0, 3), (0, 3), (1e-3, 3), (1e-3, np.pi)], ['beta', 'k', 'g2', 'g3', 'm3', 'sigma', 'nu']),
    'glampi_raw': (lambda p, D: glampi_nll(p, D, True), [(-1, 1), (.5, 2), (0, 3), (0, 3), (0, 3), (1e-3, 3), (1e-3, np.pi)], ['beta', 'k', 'g2', 'g3', 'm3', 'sigma', 'nu']),
    'E5':     (lambda p, D: e_nll(p, D, 'E5'), [(.01, 2), (.01, 3), (.2, 2.5), (-.1, .3), (-90, 90)], ['acc', 'rep', 'gain', 'leak', 'bias']),
    'E5_in':  (lambda p, D: e_nll(p, D, 'E5_in'), [(.01, 2), (.01, 3), (.2, 2.5), (-.1, .3), (-90, 90)], ['acc', 'rep', 'gain', 'leak', 'bias_in']),
    'E5_g2':  (lambda p, D: e_nll(p, D, 'E5_g2'), [(.01, 2), (.01, 3), (.2, 2.5), (-.1, .3), (0, 3)], ['acc', 'rep', 'gain', 'leak', 'g2']),
    'E6':     (lambda p, D: e_nll(p, D, 'E6'), [(.01, 2), (.01, 3), (.2, 2.5), (-.1, .3), (-90, 90), (0, 3)], ['acc', 'rep', 'gain', 'leak', 'bias', 'g2']),
}


def fit_one(args):
    name, D, seed, starts = args
    f, bounds, _ = MODELS[name]; rng = np.random.default_rng(seed); lo = np.array([b[0] for b in bounds]); hi = np.array([b[1] for b in bounds])
    best = (np.inf, None)
    for _ in range(starts):
        x0 = lo + (hi - lo) * rng.random(len(bounds))
        try:
            r = minimize(lambda x: f(x, D), x0, method='L-BFGS-B', bounds=bounds)
            if np.isfinite(r.fun) and r.fun < best[0]: best = (float(r.fun), r.x.tolist())
        except (FloatingPointError, ValueError): pass
    return best


def run(models, conds=(None,), starts=40):
    data = [r for r in json.load(open('trials.json')) if not r['bad_ppt'] and not r['no_oob_record']]
    jobs, keys = [], []
    for r in data:
        for cond in conds:
            D = arrays(r, cond)
            if D['n'] < 6: continue
            for m in models: jobs.append((m, D, r['pid'] * 7 + (cond or 0), starts)); keys.append((r['group'], r['pid'], cond, m, D['n'], int(D['oob'].sum())))
    np.seterr(all='ignore')
    with Pool() as pool: res = pool.map(fit_one, jobs, chunksize=4)
    out = [dict(group=g, pid=p, cond=c, model=m, n=n, n_oob=no, nll=r[0], params=dict(zip(MODELS[m][2], r[1])) if r[1] else None) for (g, p, c, m, n, no), r in zip(keys, res)]
    return out


if __name__ == '__main__':
    # one file per model so a partial run keeps what it finished: fits_<model>.json, and fits_percond.json
    import os
    starts = int(os.environ.get('STARTS', 15))
    for m in (sys.argv[1:] or list(MODELS)):
        if os.path.exists(f'fits_{m}.json'): continue
        json.dump(run([m], starts=starts), open(f'fits_{m}.json', 'w')); print('done', m, flush=True)
    if not os.path.exists('fits_percond.json'):
        json.dump(run(['glampi_raw'], conds=(1, 2, 3), starts=starts), open('fits_percond.json', 'w')); print('done percond', flush=True)
