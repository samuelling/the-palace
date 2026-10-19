"""
Second dataset: path integration in young and older adults (Stangl, Kanitscheider, Riemer, Fiete & Wolbers 2020,
Nature Communications; OSF ufk4x). 56 healthy people (30 young, 26 older) walked curved paths in VR and at up to four
stops reported distance (verbally) and direction (by turning) back to the start.

Questions for the game's model:
  1. Do direction and distance errors need separate noise (as in the triangle data), or is one isotropic blob enough?
  2. Does noise accumulate with distance walked (which the triangle data, with near-identical paths, could not tell)?
  3. How big are ageing effects on each parameter (healthy ageing is the main confound a screening score must survive)?

Path length to a stop is approximated by the chord sum start -> stop1 -> ... (paths are curved, so this underestimates
slightly but is monotone).

Usage: python3 stangl.py extract <DATA.mat>  -> stangl_trials.json
       python3 stangl.py fit                 -> stangl_fits.json, then prints comparison and effects
"""
import sys, json
import numpy as np
from multiprocessing import Pool
from scipy.optimize import minimize
from scipy.stats import mannwhitneyu

LOG2PI = np.log(2 * np.pi)
wrap = lambda a: (a + np.pi) % (2 * np.pi) - np.pi


def extract(path):
    import scipy.io as sio
    d = sio.loadmat(path, squeeze_me=True, struct_as_record=False)
    out = []
    for i, p in enumerate(d['participant']):
        rows = []
        for b, tb in enumerate(np.atleast_1d(p.taskBlock)):
            for t, tp in enumerate(np.atleast_1d(tb.taskPath)):
                s0 = np.asarray(tp.startPointCoordinatesXY, float); prev = s0; L = 0.0
                for k, sp in enumerate(np.atleast_1d(tp.stopPoint)):
                    xy = np.asarray(sp.responseCoordinatesXY, float)
                    if xy.size != 2: continue
                    L += float(np.linalg.norm(xy - prev)); prev = xy
                    if not np.isfinite(sp.responseDistance): continue
                    rows.append(dict(block=b, path=t, pid=int(tp.pathID), stop=k, inter=int(tp.intermediateStopping), L=L,
                                     dx=float(s0[0] - xy[0]), dy=float(s0[1] - xy[1]), r=float(sp.responseDistance), ori=float(np.asarray(sp.responseOrientation, float))))
        out.append(dict(i=i, group=str(p.ageGroup), trials=rows))
    # orientation convention: pick the mapping from the true start direction to the HMD yaw that best matches responses
    allr = [t for p in out for t in p['trials'] if np.hypot(t['dx'], t['dy']) > 1.5]
    best = None
    for name, f in {'atan2(x,y)': lambda t: np.degrees(np.arctan2(t['dx'], t['dy'])), 'atan2(-x,y)': lambda t: np.degrees(np.arctan2(-t['dx'], t['dy'])),
                    'atan2(y,x)': lambda t: np.degrees(np.arctan2(t['dy'], t['dx'])), 'atan2(-y,x)': lambda t: np.degrees(np.arctan2(-t['dy'], t['dx']))}.items():
        e = np.array([((t['ori'] - f(t)) + 180) % 360 - 180 for t in allr])
        for off in range(-180, 180, 5):
            m = np.median(np.abs(((e - off) + 180) % 360 - 180))
            if best is None or m < best[0]: best = (m, name, off, f)
    print('orientation convention', best[1], 'offset', best[2], 'median abs error', round(best[0], 1), file=sys.stderr)
    for p in out:
        for t in p['trials']:
            t['true_dir'] = float(np.radians(best[3](t) + best[2])); t['c'] = float(np.hypot(t['dx'], t['dy']))
            t['dir_err'] = float(wrap(np.radians(t['ori']) - t['true_dir']))
    json.dump(dict(convention=[best[1], best[2]], people=out), sys.stdout)


def arr(P, sel=None):
    T = [t for t in P['trials'] if t['c'] > .5 and (sel is None or sel(t))]
    return dict(L=np.array([t['L'] for t in T]), c=np.array([t['c'] for t in T]), r=np.array([t['r'] for t in T]), e=np.array([t['dir_err'] for t in T]), n=len(T))


# models over (reported distance r, direction error e)
def nll_iso(p, D):
    acc, rep, g, leak, b = p
    R = g * np.exp(-leak * D['L']) * D['c']; s2 = acc ** 2 * D['L'] + rep ** 2; bb = np.radians(b)
    d2 = D['r'] ** 2 + R ** 2 - 2 * D['r'] * R * np.cos(D['e'] - bb)
    return -np.sum(-np.log(2 * np.pi * s2) - d2 / (2 * s2) + np.log(np.maximum(D['r'], .25)))


def nll_sep(p, D, kind):
    if kind == 'sep5': g, leak, b, s0, n0 = p; s1 = n1 = 0
    elif kind == 'sep6n': g, leak, b, s0, n0, n1 = p; s1 = 0
    elif kind == 'sep6s': g, leak, b, s0, n0, s1 = p; n1 = 0
    else: g, leak, b, s0, n0, s1, n1 = p
    R = g * np.exp(-leak * D['L']) * D['c']; sr = np.sqrt(s0 ** 2 + s1 ** 2 * D['L']); sn = np.sqrt(n0 ** 2 + n1 ** 2 * D['L'])
    de = wrap(D['e'] - np.radians(b))
    return np.sum(.5 * LOG2PI + np.log(sr) + (D['r'] - R) ** 2 / (2 * sr ** 2)) + np.sum(.5 * LOG2PI + np.log(sn) + de ** 2 / (2 * sn ** 2))


def nll_ani(p, D, kind):
    """Anisotropic positional noise in the true-home frame: radial sd^2 = ar^2 L (+ rep^2), tangential sd^2 = at^2 L (+ rep^2)."""
    if kind == 'ani5': g, leak, b, ar, at = p; rep = 0.0
    else: g, leak, b, ar, at, rep = p
    R = g * np.exp(-leak * D['L']) * D['c']; bb = np.radians(b)
    sr = np.sqrt(ar ** 2 * D['L'] + rep ** 2 + 1e-4); st = np.sqrt(at ** 2 * D['L'] + rep ** 2 + 1e-4)
    dx = D['r'] * np.cos(D['e']) - R * np.cos(bb); dy = D['r'] * np.sin(D['e']) - R * np.sin(bb)
    return -np.sum(-LOG2PI - np.log(sr * st) - dx ** 2 / (2 * sr ** 2) - dy ** 2 / (2 * st ** 2) + np.log(np.maximum(D['r'], .25)))


def nll_hyb(p, D, kind):
    """Hybrid: distance ~ N(R, ar^2 L), direction ~ N(b, n0^2 + at^2 L / c^2): a constant angular (heading) noise plus
    positional noise accumulating with distance walked, which spreads direction more when the start is close."""
    if kind == 'h5': g, leak, b, n0, a = p; ar = at = a
    else: g, leak, b, n0, ar, at = p
    R = g * np.exp(-leak * D['L']) * D['c']; sr = np.sqrt(ar ** 2 * D['L'] + 1e-4); sn = np.sqrt(n0 ** 2 + at ** 2 * D['L'] / np.maximum(D['c'], .3) ** 2)
    de = wrap(D['e'] - np.radians(b))
    return np.sum(.5 * LOG2PI + np.log(sr) + (D['r'] - R) ** 2 / (2 * sr ** 2)) + np.sum(.5 * LOG2PI + np.log(sn) + de ** 2 / (2 * sn ** 2))


B = dict(a=(.01, 2), ar=(.01, 2), at=(.01, 2), acc=(.01, 2), rep=(.01, 4), g=(.2, 3), leak=(-.1, .3), b=(-90, 90), s0=(.05, 5), n0=(.01, np.pi), s1=(0, 2), n1=(0, 1))
MODELS = {'iso': (nll_iso, ['acc', 'rep', 'g', 'leak', 'b']),
          'sep5': (lambda p, D: nll_sep(p, D, 'sep5'), ['g', 'leak', 'b', 's0', 'n0']),
          'sep6n': (lambda p, D: nll_sep(p, D, 'sep6n'), ['g', 'leak', 'b', 's0', 'n0', 'n1']),
          'sep6s': (lambda p, D: nll_sep(p, D, 'sep6s'), ['g', 'leak', 'b', 's0', 'n0', 's1']),
          'sep7': (lambda p, D: nll_sep(p, D, 'sep7'), ['g', 'leak', 'b', 's0', 'n0', 's1', 'n1']),
          'ani5': (lambda p, D: nll_ani(p, D, 'ani5'), ['g', 'leak', 'b', 'ar', 'at']),
          'ani6': (lambda p, D: nll_ani(p, D, 'ani6'), ['g', 'leak', 'b', 'ar', 'at', 'rep']),
          'h5': (lambda p, D: nll_hyb(p, D, 'h5'), ['g', 'leak', 'b', 'n0', 'a']),
          'h6': (lambda p, D: nll_hyb(p, D, 'h6'), ['g', 'leak', 'b', 'n0', 'ar', 'at'])}


def fit_one(a):
    m, D, seed = a; f, names = MODELS[m]; bounds = [B[k] for k in names]; rng = np.random.default_rng(seed); best = (np.inf, None)
    lo = np.array([x[0] for x in bounds]); hi = np.array([x[1] for x in bounds])
    for _ in range(15):
        r = minimize(lambda x: f(x, D), lo + (hi - lo) * rng.random(len(bounds)), method='L-BFGS-B', bounds=bounds)
        if np.isfinite(r.fun) and r.fun < best[0]: best = (float(r.fun), r.x.tolist())
    return best


def auc(a, b): return mannwhitneyu(b, a).statistic / (len(a) * len(b))


def dz(a, b): return (np.mean(b) - np.mean(a)) / np.sqrt((np.var(a, ddof=1) + np.var(b, ddof=1)) / 2)


def fit(only=None):
    np.seterr(all='ignore'); import os
    old = json.load(open('stangl_fits.json')) if os.path.exists('stangl_fits.json') and only else []
    S = json.load(open('stangl_trials.json')); people = S['people']
    jobs, keys = [], []
    for P in people:
        for half in (None, 0, 1):
            D = arr(P, None if half is None else (lambda t, h=half: (t['block'] * 16 + t['path']) % 2 == h))
            for m in (only or MODELS): jobs.append((m, D, P['i'] * 11 + (half or 0) + 3 * (half is not None))); keys.append((P['i'], P['group'], half, m, D['n']))
    with Pool() as pool: res = pool.map(fit_one, jobs, chunksize=4)
    F = [dict(i=i, group=g, half=h, model=m, n=n, nll=r[0], params=dict(zip(MODELS[m][1], r[1]))) for (i, g, h, m, n), r in zip(keys, res)]
    json.dump([f for f in old if f['model'] not in (only or [])] + F, open('stangl_fits.json', 'w'))


def report():
    F = json.load(open('stangl_fits.json')); full = [f for f in F if f['half'] is None]; out = {}
    print('Model comparison (56 people, full data):')
    for m, (_, names) in MODELS.items():
        R = [f for f in full if f['model'] == m]; k = len(names)
        aic = sum(2 * f['nll'] + 2 * k for f in R); bic = sum(2 * f['nll'] + k * np.log(f['n']) for f in R)
        out.setdefault('comparison', {})[m] = dict(k=k, aic=aic, bic=bic); print(f'  {m:6s} k={k} AIC {aic:9.1f} BIC {bic:9.1f}')
    for m in ('sep7', 'ani5', 'h5', 'h6'):
        names = MODELS[m][1]; print(f'\n{m}: medians young / old, d (old - young), AUC, split-half reliability')
        out.setdefault('effects', {})[m] = {}
        for k in names:
            y = [f['params'][k] for f in full if f['model'] == m and f['group'] == 'young']; o = [f['params'][k] for f in full if f['model'] == m and f['group'] == 'old']
            h = {}
            for f in F:
                if f['model'] == m and f['half'] is not None: h.setdefault(f['i'], {})[f['half']] = f['params'][k]
            pr = [v for v in h.values() if 0 in v and 1 in v]; r = np.corrcoef([v[0] for v in pr], [v[1] for v in pr])[0, 1]; sb = 2 * r / (1 + r)
            out['effects'][m][k] = dict(young=float(np.median(y)), old=float(np.median(o)), d=float(dz(y, o)), auc=float(auc(y, o)), rel=float(sb))
            print(f'  {k:5s} {np.median(y):8.3f} {np.median(o):8.3f}  d {dz(y, o):5.2f}  AUC {auc(y, o):.2f}  rel {sb:.2f}')
    json.dump(out, open('stangl_analysis.json', 'w'), indent=1)


if __name__ == '__main__':
    if sys.argv[1] == 'extract': extract(sys.argv[2])
    elif sys.argv[1] == 'fit': fit(sys.argv[2:] or None); report()
    else: report()
