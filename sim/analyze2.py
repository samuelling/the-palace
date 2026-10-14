"""Sensitivity of the three-chapter beta under three assumption sets. Writes results2.json."""
import json, time
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.metrics import roc_auc_score, roc_curve
import sim2

LEGACY = ['total_time', 'total_dist']
MODEL = ['c1_post_dist', 'c1_bumps', 'c1_jopt_post', 'c2_jopt', 'c2_jopt_post', 'c2_post_dist', 'c2_bumps', 'homing_err',
         'c3_first_correct', 'c3_stale', 'c3_per_trip', 'fig_acc']
COV = ['speed', 'scrape_rate', 'aim', 'fig_rt']
POSITIVE = {'total_time', 'total_dist', 'c1_post_dist', 'c1_bumps', 'c2_post_dist', 'c2_bumps', 'homing_err', 'c3_stale', 'c3_per_trip', 'fig_rt', 'scrape_rate'}


def col(rows, k):
    v = np.array([r[k] for r in rows], float)
    if k in POSITIVE and k not in ('c3_stale',): v = np.log1p(np.maximum(v, 0))
    med = np.nanmedian(v); v[np.isnan(v)] = med if not np.isnan(med) else 0
    return v


def auc1(a, b):
    y = np.r_[np.zeros(len(a)), np.ones(len(b))]; v = roc_auc_score(y, np.r_[a, b]); return max(v, 1 - v)


def adjust(Xh, Xp, Xn, Ch, Cp, Cn):
    """Remove what motor and control skill predicts, using the healthy reference group's regression."""
    A = np.c_[np.ones(len(Ch)), Ch]
    beta, *_ = np.linalg.lstsq(A, Xh, rcond=None)
    res = lambda X, C: X - np.c_[np.ones(len(C)), C] @ beta
    return res(Xh, Ch), res(Xp, Cp), res(Xn, Cn)


def classify(Xh, Xp, Xn):
    X = np.r_[Xh, Xp]; y = np.r_[np.zeros(len(Xh)), np.ones(len(Xp))]
    mu, sd = X.mean(0), X.std(0) + 1e-9
    c = LogisticRegression(max_iter=4000, C=.5)
    pr = cross_val_predict(c, (X - mu) / sd, y, cv=StratifiedKFold(5, shuffle=True, random_state=0), method='predict_proba')[:, 1]
    fpr, tpr, thr = roc_curve(y, pr); i = np.argmin(np.abs(tpr - .8))
    c.fit((X - mu) / sd, y); pn = c.predict_proba((Xn - mu) / sd)[:, 1]
    return dict(auc=round(float(roc_auc_score(y, pr)), 3), fpr_healthy=round(float(fpr[i]), 3), novice_flagged=round(float((pn >= thr[i]).mean()), 3))


def single(n):
    rows = sim2.simulate(n, 1, seed=11)
    by = {g: [r for r in rows if r['group'] == g] for g in sim2.GROUPS}
    M = lambda keys, g: np.column_stack([col(by[g], k) for k in keys])
    per = {k: dict(hp=round(auc1(col(by['healthy'], k), col(by['prodromal'], k)), 3), np=round(auc1(col(by['healthy_novice'], k), col(by['prodromal'], k)), 3))
           for k in LEGACY + MODEL + COV}
    sets = {'legacy': LEGACY, 'model': MODEL}
    out = {nm: classify(M(ks, 'healthy'), M(ks, 'prodromal'), M(ks, 'healthy_novice')) for nm, ks in sets.items()}
    out['model, motor-adjusted'] = classify(*adjust(M(MODEL, 'healthy'), M(MODEL, 'prodromal'), M(MODEL, 'healthy_novice'), M(COV, 'healthy'), M(COV, 'prodromal'), M(COV, 'healthy_novice')))
    out['legacy, motor-adjusted'] = classify(*adjust(M(LEGACY, 'healthy'), M(LEGACY, 'prodromal'), M(LEGACY, 'healthy_novice'), M(COV, 'healthy'), M(COV, 'prodromal'), M(COV, 'healthy_novice')))
    return dict(per_measure=per, sets=out)


def person_feats(rows, keys, ez_fit):
    rows = sorted(rows, key=lambda r: r['session']); s = np.arange(len(rows)); out = []
    for k in keys:
        v = col(rows, k); b, a = np.polyfit(s, v, 1); out += [v.mean(), b, np.std(v - (a + b * s), ddof=2)]
    if ez_fit:
        tr = [t for r in rows for t in r['_fig']]
        try: v, aa, ter = sim2.ez(tr)
        except Exception: v, aa, ter = np.nan, np.nan, np.nan
        out += [v, aa, ter]
    return out


def longitudinal(n, sessions):
    rows = sim2.simulate(n, sessions, seed=12)
    P = {}
    for r in rows: P.setdefault((r['group'], r['pid']), []).append(r)

    def F(keys, ez_fit):
        D = {g: np.array([person_feats(v, keys, ez_fit) for (gg, _), v in P.items() if gg == g], float) for g in sim2.GROUPS}
        allx = np.vstack(list(D.values())); med = np.nanmedian(allx, 0)
        for g in D: D[g] = np.where(np.isnan(D[g]), med, D[g])
        return D
    sets = {'legacy': (LEGACY, False), 'model': (MODEL, True)}
    out = {}
    for nm, (ks, ezf) in sets.items():
        D = F(ks, ezf); out[nm] = classify(D['healthy'], D['prodromal'], D['healthy_novice'])
    Dm, Dc, Dl = F(MODEL, True), F(COV, False), F(LEGACY, False)
    out['model, motor-adjusted'] = classify(*adjust(Dm['healthy'], Dm['prodromal'], Dm['healthy_novice'], Dc['healthy'], Dc['prodromal'], Dc['healthy_novice']))
    out['legacy, motor-adjusted'] = classify(*adjust(Dl['healthy'], Dl['prodromal'], Dl['healthy_novice'], Dc['healthy'], Dc['prodromal'], Dc['healthy_novice']))
    De = F([], True)
    out['ez_drift_only'] = dict(hp=round(auc1(De['healthy'][:, 0], De['prodromal'][:, 0]), 3), np=round(auc1(De['healthy_novice'][:, 0], De['prodromal'][:, 0]), 3),
                                ter_np=round(auc1(De['healthy_novice'][:, 2], De['prodromal'][:, 2]), 3))
    return out


SCENARIOS = {'base': dict(effect=1.0, decline=1.0), 'no_decline': dict(effect=1.0, decline=0.0), 'half_effect': dict(effect=.5, decline=0.0)}

if __name__ == '__main__':
    res = {}
    for name, k in SCENARIOS.items():
        t = time.time(); sim2.set_knobs(**k)
        res[name] = dict(knobs=k, single=single(400), longitudinal=longitudinal(100, 10))
        print(name, round(time.time() - t), 's', json.dumps(res[name]['single']['sets']), json.dumps({kk: v for kk, v in res[name]['longitudinal'].items()}), flush=True)
        json.dump(res, open('results2.json', 'w'), indent=1)
    print('saved')
