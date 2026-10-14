"""Score how well the beta's measures separate simulated groups. Writes results.json."""
import json, sys
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.metrics import roc_auc_score, roc_curve
import montecarlo as mc

METRICS = ['run_time', 'run_dist', 'post_time', 'post_dist', 'bumps', 'consults', 'consults_post', 'accuracy']


def auc(a, b):
    """AUC for 'b looks impaired relative to a', direction chosen by the metric's mean shift."""
    y = np.r_[np.zeros(len(a)), np.ones(len(b))]
    x = np.r_[a, b]
    v = roc_auc_score(y, x)
    return max(v, 1 - v)


def feats(rows, keys):
    X = np.array([[r[k] for k in keys] for r in rows], float)
    X = np.where(np.isin(np.array(keys), ['accuracy']), X, np.log1p(np.maximum(X, 0)))
    return X


def classifier(rows_h, rows_p, rows_n, keys):
    """Train healthy vs prodromal with 5-fold CV; then ask how a healthy novice gets classified."""
    X = np.r_[feats(rows_h, keys), feats(rows_p, keys)]
    y = np.r_[np.zeros(len(rows_h)), np.ones(len(rows_p))]
    mu, sd = X.mean(0), X.std(0) + 1e-9
    clf = LogisticRegression(max_iter=2000)
    cv = StratifiedKFold(5, shuffle=True, random_state=0)
    pr = cross_val_predict(clf, (X - mu) / sd, y, cv=cv, method='predict_proba')[:, 1]
    a = roc_auc_score(y, pr)
    fpr, tpr, thr = roc_curve(y, pr)
    i = np.argmin(np.abs(tpr - .8))
    t80 = thr[i]
    clf.fit((X - mu) / sd, y)
    pn = clf.predict_proba((feats(rows_n, keys) - mu) / sd)[:, 1]
    return dict(auc=round(float(a), 3), fpr_healthy_at_80sens=round(float(fpr[i]), 3),
                novice_flagged_at_80sens=round(float((pn >= t80).mean()), 3))


def single(n=1500):
    out = {}
    for variant in ['current', 'errand']:
        rows = mc.simulate(n, 1, variant, seed=1 if variant == 'current' else 2)
        by = {g: [r for r in rows if r['group'] == g] for g in mc.GROUPS}
        h, p, nv = by['healthy'], by['prodromal'], by['healthy_novice']
        per = {}
        for k in METRICS:
            per[k] = dict(healthy_vs_prodromal=round(auc([r[k] for r in h], [r[k] for r in p]), 3),
                          novice_vs_prodromal=round(auc([r[k] for r in nv], [r[k] for r in p]), 3),
                          healthy_vs_novice=round(auc([r[k] for r in h], [r[k] for r in nv]), 3),
                          medians={g: round(float(np.median([r[k] for r in by[g]])), 2) for g in by},
                          frac_zero={g: round(float(np.mean([r[k] == 0 for r in by[g]])), 3) for g in by})
        out[variant] = dict(per_metric=per,
                            combined_all=classifier(h, p, nv, METRICS),
                            combined_map_only=classifier(h, p, nv, ['post_time', 'post_dist', 'bumps', 'consults_post']),
                            stuck_rate={g: round(float(np.mean([r['stuck'] > 0 for r in by[g]])), 3) for g in by})
        print(variant, json.dumps(out[variant]['combined_all']), json.dumps(out[variant]['combined_map_only']), flush=True)
    return out


def person_features(rows, keys):
    """Per player: mean, slope over sessions, and residual SD (day-to-day variability)."""
    X = []
    for k in keys:
        v = np.log1p(np.maximum(np.array([r[k] for r in rows], float), 0))
        s = np.arange(len(v))
        b, a = np.polyfit(s, v, 1)
        X += [v.mean(), b, np.std(v - (a + b * s), ddof=2)]
    return X


def longitudinal(n=300, sessions=12):
    out = {}
    keys = ['run_time', 'run_dist', 'post_time', 'bumps', 'accuracy']
    for variant in ['current', 'errand']:
        rows = mc.simulate(n, sessions, variant, seed=3 if variant == 'current' else 4)
        P = {}
        for r in rows:
            P.setdefault((r['group'], r['pid']), []).append(r)
        F = {g: np.array([person_features(sorted(v, key=lambda r: r['session']), keys) for (gg, _), v in P.items() if gg == g]) for g in mc.GROUPS}
        names = [f'{k}:{w}' for k in keys for w in ('mean', 'slope', 'iiv')]
        per = {nm: dict(healthy_vs_prodromal=round(auc(F['healthy'][:, j], F['prodromal'][:, j]), 3),
                        novice_vs_prodromal=round(auc(F['healthy_novice'][:, j], F['prodromal'][:, j]), 3))
               for j, nm in enumerate(names)}

        def clf_on(cols):
            X = np.r_[F['healthy'][:, cols], F['prodromal'][:, cols]]
            y = np.r_[np.zeros(len(F['healthy'])), np.ones(len(F['prodromal']))]
            mu, sd = X.mean(0), X.std(0) + 1e-9
            c = LogisticRegression(max_iter=3000)
            pr = cross_val_predict(c, (X - mu) / sd, y, cv=StratifiedKFold(5, shuffle=True, random_state=0), method='predict_proba')[:, 1]
            fpr, tpr, thr = roc_curve(y, pr)
            i = np.argmin(np.abs(tpr - .8))
            c.fit((X - mu) / sd, y)
            pn = c.predict_proba((F['healthy_novice'][:, cols] - mu) / sd)[:, 1]
            return dict(auc=round(float(roc_auc_score(y, pr)), 3), fpr_healthy_at_80sens=round(float(fpr[i]), 3),
                        novice_flagged_at_80sens=round(float((pn >= thr[i]).mean()), 3))
        all_cols = list(range(len(names)))
        out[variant] = dict(per_feature=per,
                            combined_all=clf_on(all_cols),
                            means_only=clf_on([j for j, nm in enumerate(names) if nm.endswith('mean')]),
                            slope_and_iiv=clf_on([j for j, nm in enumerate(names) if not nm.endswith('mean')]))
        # group trajectories for plotting
        traj = {}
        for g in mc.GROUPS:
            for k in ['run_time', 'post_time', 'bumps']:
                traj.setdefault(g, {})[k] = [round(float(np.median([r[k] for r in rows if r['group'] == g and r['session'] == s])), 2) for s in range(sessions)]
        out[variant]['trajectories'] = traj
        print(variant, 'long', json.dumps({k: out[variant][k] for k in ['combined_all', 'means_only', 'slope_and_iiv']}), flush=True)
    return out


if __name__ == '__main__':
    res = {'single_session': single(), 'longitudinal': longitudinal(),
           'assumptions': {g: mc.GROUPS[g] for g in mc.GROUPS}}
    json.dump(res, open('results.json', 'w'), indent=1)
    print('saved results.json')
