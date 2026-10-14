"""Score fixed vs adaptive designs from ado_sim.js output: parameter recovery and group separation."""
import json, sys
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.metrics import roc_auc_score, roc_curve

P = ['acc', 'rep', 'gain', 'leak', 'rho', 'alpha', 'm']


def auc(a, b):
    y = np.r_[np.zeros(len(a)), np.ones(len(b))]; v = roc_auc_score(y, np.r_[a, b]); return max(v, 1 - v)


def score(rows):
    out = {'recovery_r': {}, 'auc_hp': {}, 'auc_hn': {}}
    for k in P:
        t = np.array([r['truth'][k] for r in rows]); e = np.array([r['est'][k] for r in rows])
        out['recovery_r'][k] = round(float(np.corrcoef(t, e)[0, 1]), 3)
        g = lambda name: np.array([r['est'][k] for r in rows if r['group'] == name])
        out['auc_hp'][k] = round(auc(g('healthy'), g('prodromal')), 3); out['auc_hn'][k] = round(auc(g('healthy'), g('novice')), 3)
    X = {g: np.array([[r['est'][k] for k in P] for r in rows if r['group'] == g]) for g in ('healthy', 'prodromal', 'novice')}
    Xa = np.r_[X['healthy'], X['prodromal']]; y = np.r_[np.zeros(len(X['healthy'])), np.ones(len(X['prodromal']))]
    mu, sd = Xa.mean(0), Xa.std(0) + 1e-9
    c = LogisticRegression(max_iter=3000, C=.5)
    pr = cross_val_predict(c, (Xa - mu) / sd, y, cv=StratifiedKFold(5, shuffle=True, random_state=0), method='predict_proba')[:, 1]
    fpr, tpr, thr = roc_curve(y, pr); i = np.argmin(np.abs(tpr - .8)); c.fit((Xa - mu) / sd, y)
    pn = c.predict_proba((X['novice'] - mu) / sd)[:, 1]
    out['combined'] = dict(auc=round(float(roc_auc_score(y, pr)), 3), novice_flagged=round(float((pn >= thr[i]).mean()), 3))
    tr = lambda s, key: round(float(np.mean([[x for x in r['traj'] if x['s'] == s][0][key] for r in rows])), 3)
    out['interval_width'] = {f'session{s + 1}': dict(acc=tr(s, 'accW'), rho=tr(s, 'rhoW')) for s in (0, 2, 9)}
    out['design'] = dict(mean_path_m=round(float(np.mean([r['meanL'] for r in rows])), 1),
                         palace_mix={k: int(np.sum([r['kinds'][k] for r in rows])) for k in ('swap', 'rotate', 'none')})
    return out


res = {}
for pol in ('fixed', 'ado'):
    for ms in ('0', '1'):
        rows = json.load(open(f'ado_{pol}_{ms}.json'))
        res[f'{pol}{"_misspecified" if ms == "1" else ""}'] = score(rows)
json.dump(res, open('results_ado.json', 'w'), indent=1)
for k, v in res.items(): print(k, json.dumps(v))
