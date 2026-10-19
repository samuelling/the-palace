"""
Sensitivity of the 16-bit design, and tuning it.

For a design (a dict of DESIGN overrides) this simulates healthy, prodromal (half-sized effects, no
decline) and healthy-novice players, builds per-person features the way the game would summarise them,
and reports cross-validated healthy-vs-prodromal AUC, the share of healthy novices flagged at 80%
sensitivity, and minutes per session, for one session and for ten.

Usage:
  python3 tune16.py run <name> '<json design>' [seed] [n_long] [n_single]   -> results/<name>.json
  python3 tune16.py table                                                    -> prints every result
"""
import json, os, sys, time
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.metrics import roc_auc_score, roc_curve
import sim16

OUT = os.path.join(sim16.HERE, 'results'); os.makedirs(OUT, exist_ok=True)
RAW = ['e_post_opt', 'e_conf_plan', 'e_bumps', 'e_err_eff', 'e_ret_eff', 'm_post_opt', 'm_conf_plan', 'm_bumps', 'm_revisits', 'm_trans_eff', 'm_reward_eff', 'm_contrast',
       'l_err', 'free_err', 'p_swap', 'p_rot', 'p_none', 'p_stale', 'f_acc', 'f_rt']
MODEL = ['L_acc', 'L_rep', 'L_gain', 'L_leak', 'L_bias', 'P_rho', 'P_alpha', 'P_m']
MOTOR = ['speed', 'scrape', 'swing']
POS = {'e_bumps', 'e_err_eff', 'e_ret_eff', 'm_bumps', 'm_revisits', 'm_trans_eff', 'm_reward_eff', 'l_err', 'free_err', 'f_rt'}
GROUPS = ['healthy', 'prodromal', 'healthy_novice']


def tf(k, v):
    v = np.asarray(v, float)
    return np.log1p(np.maximum(v, 0)) if k in POS else v


def ez(trials):
    try: return list(sim16.sim2.ez(trials))
    except Exception: return [np.nan] * 3


def lantern_fit(rows):
    tr = [t for r in rows for t in r['_lantern']]
    if len(tr) < 4: return [np.nan, np.nan]
    L = np.array([a for a, _ in tr]); e2 = np.array([b for _, b in tr]) ** 2
    b, a = np.polyfit(L, e2, 1); return [b, a]


def person_features(rows, motor=False):
    rows = sorted(rows, key=lambda r: r['session']); f = {}
    for k in RAW:
        v = tf(k, [r[k] for r in rows]); f[k] = np.nanmean(v) if np.isfinite(v).any() else np.nan
        if len(rows) > 2: f[k + ':iiv'] = np.nanstd(v) if np.isfinite(v).sum() > 2 else np.nan
    for k in MODEL: f[k] = rows[-1][k]
    v, a, ter = ez([t for r in rows for t in r['_fig']]); f.update(ez_v=v, ez_a=a, ez_ter=ter)
    f['scale'] = np.log(rows[-1]['scale'])
    f['lslope'], f['lint'] = lantern_fit(rows)
    if motor:
        for k in MOTOR: f[k] = np.mean([r[k] for r in rows])
    return f


def matrix(rows, n_sess, motor=False):
    by = {}
    for r in rows:
        if r['session'] < n_sess: by.setdefault((r['group'], r['pid']), []).append(r)
    F = {g: [person_features(v, motor) for (gg, _), v in by.items() if gg == g] for g in GROUPS}
    keys = sorted(F['healthy'][0])
    X = {g: np.array([[f[k] for k in keys] for f in F[g]], float) for g in GROUPS}
    allx = np.vstack(list(X.values())); med = np.nanmedian(allx, 0); med[np.isnan(med)] = 0
    for g in GROUPS:
        bad = ~np.isfinite(X[g]); X[g][bad] = np.take(med, np.where(bad)[1])
    return X, keys


def classify(Xh, Xp, Xn, seed=0):
    X = np.r_[Xh, Xp]; y = np.r_[np.zeros(len(Xh)), np.ones(len(Xp))]
    mu, sd = X.mean(0), X.std(0) + 1e-9
    c = LogisticRegression(max_iter=5000, C=.3)
    pr = cross_val_predict(c, (X - mu) / sd, y, cv=StratifiedKFold(5, shuffle=True, random_state=seed), method='predict_proba')[:, 1]
    fpr, tpr, thr = roc_curve(y, pr); i = int(np.argmin(np.abs(tpr - .8)))
    c.fit((X - mu) / sd, y); pn = c.predict_proba((np.clip(Xn, None, None) - mu) / sd)[:, 1]
    # threshold-free: how well the trained classifier keeps novices apart from prodromal players
    nauc = roc_auc_score(np.r_[np.zeros(len(pn)), np.ones(len(Xp))], np.r_[pn, pr[len(Xh):]])
    return dict(auc=round(float(roc_auc_score(y, pr)), 3), healthy_flagged=round(float(fpr[i]), 3), novice_flagged=round(float((pn >= thr[i]).mean()), 3), novice_auc=round(float(nauc), 3))


def auc1(a, b):
    y = np.r_[np.zeros(len(a)), np.ones(len(b))]; v = roc_auc_score(y, np.r_[a, b]); return round(max(v, 1 - v), 3)


def evaluate(design, seed=1, n_long=120, n_single=300, sessions=10, name=None):
    t = time.time()
    long = sim16.simulate(design, n_long, sessions, seed=seed)
    single = sim16.simulate(design, n_single, 1, seed=seed + 500)
    res = dict(design=design, seed=seed, n_long=n_long, n_single=n_single)
    for nm, rows, ns in (('single', single, 1), ('long', long, sessions)):
        X, keys = matrix(rows, ns); res[nm] = classify(X['healthy'], X['prodromal'], X['healthy_novice'])
        Xm, _ = matrix(rows, ns, motor=True); res[nm + '_motor'] = classify(Xm['healthy'], Xm['prodromal'], Xm['healthy_novice'])
        if nm == 'long':
            res['per_measure'] = {k: dict(hp=auc1(X['healthy'][:, i], X['prodromal'][:, i]), np=auc1(X['healthy_novice'][:, i], X['prodromal'][:, i])) for i, k in enumerate(keys)}
    res['minutes'] = round(float(np.mean([r['minutes'] for r in long])), 2)
    if name:
        import gzip, pickle
        with gzip.open(os.path.join(OUT, name + '.rows.pkl.gz'), 'wb') as fh: pickle.dump(dict(long=long, single=single), fh)
    res['secs'] = round(time.time() - t)
    return res


if __name__ == '__main__':
    if sys.argv[1] == 'run':
        name, design = sys.argv[2], json.loads(sys.argv[3])
        seed = int(sys.argv[4]) if len(sys.argv) > 4 else 1; nl = int(sys.argv[5]) if len(sys.argv) > 5 else 120; ns = int(sys.argv[6]) if len(sys.argv) > 6 else 300
        r = evaluate(design, seed, nl, ns, name=name); json.dump(r, open(os.path.join(OUT, name + '.json'), 'w'), indent=1)
        print(name, 'single', r['single'], 'long', r['long'], 'minutes', r['minutes'], 'secs', r['secs'], flush=True)
    elif sys.argv[1] == 'table':
        for f in sorted(x for x in os.listdir(OUT) if x.endswith('.json') and x != 'reanalysis.json'):
            r = json.load(open(os.path.join(OUT, f)))
            print(f"{f[:-5]:28s} 1s {r['single']['auc']:.3f}/{r['single']['novice_flagged']:.2f}  10s {r['long']['auc']:.3f}/{r['long']['novice_flagged']:.2f}  +motor {r['long_motor']['auc']:.3f}/{r['long_motor']['novice_flagged']:.2f}  {r['minutes']:.1f} min")
