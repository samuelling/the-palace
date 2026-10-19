"""Re-analyse saved runs without re-simulating.

Feature sets:
  'all'     : means over every session (+ variability), final model estimates (what tune16.py reports)
  'plateau' : means over sessions after the controls have settled (6-10), learning slopes over all ten,
              final model estimates, pooled diffusion and lantern fits; plan adherence before the change as a covariate
Usage: python3 reanalyze.py name [name ...]
"""
import gzip, pickle, sys, os, json
import numpy as np
import tune16 as T
from sklearn.metrics import roc_auc_score

RAW2 = T.RAW + ['e_pre_opt', 'm_pre_opt']


def feats_plateau(rows):
    rows = sorted(rows, key=lambda r: r['session']); s = np.array([r['session'] for r in rows], float); late = s >= 5; f = {}
    for k in RAW2:
        v = T.tf(k, [r[k] for r in rows]); ok = np.isfinite(v)
        f[k] = np.nanmean(v[late]) if (ok & late).any() else np.nan
        f[k + ':slope'] = np.polyfit(s[ok], v[ok], 1)[0] if ok.sum() > 3 else np.nan
        f[k + ':iiv'] = np.nanstd(v[late]) if (ok & late).sum() > 2 else np.nan
    for k in T.model_keys(rows[-1]): f[k] = rows[-1][k]
    v, a, ter = T.ez([t for r in rows if r['session'] >= 5 for t in r['_fig']]); f.update(ez_v=v, ez_a=a, ez_ter=ter)
    f['scale'] = np.log(rows[-1]['scale']); f['lslope'], f['lint'] = T.lantern_fit(rows)
    return f


# parameters that are motor or execution by construction: covariates, never part of the risk score
MOTORISH = ('f_rt', 'ez_ter', 'L_rep', 'L_sigma', 'free_err', 'l_err', 'lint')   # L_sigma: v2 distance noise, carries control scatter


def pure(f):
    return {k: v for k, v in f.items() if not any(k == m or k.startswith(m + ':') for m in MOTORISH)}


def matrix(rows, n_sess, kind):
    by = {}
    for r in rows:
        if r['session'] < n_sess: by.setdefault((r['group'], r['pid']), []).append(r)
    fn = {'plateau': feats_plateau, 'pure': lambda v: pure(feats_plateau(v)), 'pure_all': lambda v: pure(T.person_features(v))}.get(kind, T.person_features)
    F = {g: [(pid, fn(v)) for (gg, pid), v in sorted(by.items()) if gg == g] for g in T.GROUPS}
    keys = sorted(F['healthy'][0][1])
    X = {g: np.array([[f[k] for k in keys] for _, f in F[g]], float) for g in T.GROUPS}
    allx = np.vstack(list(X.values())); med = np.nanmedian(allx, 0); med[np.isnan(med)] = 0
    for g in T.GROUPS:
        bad = ~np.isfinite(X[g]); X[g][bad] = np.take(med, np.where(bad)[1])
    return X, keys


def scores1_pure(name):
    d = load(name); X, keys = matrix(d['single'], 1, 'pure_all')
    return T.classify(X['healthy'], X['prodromal'], X['healthy_novice'])


def load(name):
    with gzip.open(os.path.join(T.OUT, name + '.rows.pkl.gz'), 'rb') as fh: return pickle.load(fh)


def scores(name, kind='plateau', which='long'):
    d = load(name); rows = d[which]; ns = 10 if which == 'long' else 1
    X, keys = matrix(rows, ns, kind if which == 'long' else 'all')
    return T.classify(X['healthy'], X['prodromal'], X['healthy_novice'])


if __name__ == '__main__':
    out = {}
    for nm in sys.argv[1:]:
        try:
            a = scores(nm, 'all'); p = scores(nm, 'plateau'); u = scores(nm, 'pure'); s1 = scores(nm, 'all', 'single'); s1p = scores1_pure(nm)
            out[nm] = dict(single=s1, single_pure=s1p, all=a, plateau=p, pure=u)
            print(f"{nm:10s} 1 session: all {s1['auc']:.3f} ({s1['novice_flagged']:.2f} nov) pure {s1p['auc']:.3f} ({s1p['novice_flagged']:.2f}) | 10 sessions: all {a['auc']:.3f} ({a['novice_flagged']:.2f}) plateau {p['auc']:.3f} ({p['novice_flagged']:.2f}) pure {u['auc']:.3f} ({u['novice_flagged']:.2f}, novice AUC {u['novice_auc']:.2f})", flush=True)
        except FileNotFoundError: print(nm, 'no rows saved')
    json.dump(out, open(os.path.join(T.OUT, 'reanalysis.json'), 'w'), indent=1)


def person_scores(name, kind='plateau', which='long', seed=0):
    """Cross-validated probabilities for healthy and prodromal players; out-of-sample scores for novices."""
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import StratifiedKFold, cross_val_predict
    d = load(name); ns = 10 if which == 'long' else 1
    X, keys = matrix(d[which], ns, kind if which == 'long' else ('pure_all' if kind == 'pure' else 'all'))
    Xa = np.r_[X['healthy'], X['prodromal']]; y = np.r_[np.zeros(len(X['healthy'])), np.ones(len(X['prodromal']))]
    mu, sd = Xa.mean(0), Xa.std(0) + 1e-9; c = LogisticRegression(max_iter=5000, C=.3)
    pr = cross_val_predict(c, (Xa - mu) / sd, y, cv=StratifiedKFold(5, shuffle=True, random_state=seed), method='predict_proba')[:, 1]
    c.fit((Xa - mu) / sd, y); pn = c.predict_proba((X['healthy_novice'] - mu) / sd)[:, 1]
    nh = len(X['healthy']); return pr[:nh], pr[nh:], pn


def paired(a, b, kind='plateau', which='long', B=1000):
    """Difference b - a in healthy-vs-prodromal AUC and novice-vs-prodromal AUC, bootstrapping the same players."""
    ha, pa, na = person_scores(a, kind, which); hb, pb, nb = person_scores(b, kind, which)
    rng = np.random.default_rng(0); n = min(len(ha), len(hb)); m = min(len(na), len(nb))
    auc = lambda h, p: roc_auc_score(np.r_[np.zeros(len(h)), np.ones(len(p))], np.r_[h, p])
    d1, d2 = [], []
    for _ in range(B):
        i = rng.integers(n, size=n); j = rng.integers(n, size=n); k = rng.integers(m, size=m)
        d1.append(auc(hb[i], pb[j]) - auc(ha[i], pa[j])); d2.append(auc(nb[k], pb[j]) - auc(na[k], pa[j]))
    q = lambda v: (round(float(np.mean(v)), 3), round(float(np.percentile(v, 2.5)), 3), round(float(np.percentile(v, 97.5)), 3))
    return dict(auc_diff=q(d1), novice_auc_diff=q(d2))
