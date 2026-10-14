"""Supplement: with adaptive difficulty, the information moves into each player's converged sway scale (their threshold).
Adds that scale as a feature for the tuned design's longitudinal analysis. Writes results3b.json."""
import json, time
import numpy as np
import sim2
import analyze3 as A
from analyze2 import classify, auc1

res = {}
for name, k in A.SCEN.items():
    t = time.time(); sim2.set_knobs(design='v3', **k)
    rows = sim2.simulate(100, 10, seed=22)
    P = {}
    for r in rows: P.setdefault((r['group'], r['pid']), []).append(r)
    out = {}
    for gate in [False, True]:
        feats = lambda v: A.person_feats(v, A.MODEL, gate) + [np.log(np.mean([r['scale'] for r in sorted(v, key=lambda r: r['session'])[-4:]]))]
        D = {g: np.array([feats(v) for (gg, _), v in P.items() if gg == g], float) for g in sim2.GROUPS}
        allx = np.vstack(list(D.values())); med = np.nanmedian(allx, 0)
        for g in D: D[g] = np.where(np.isnan(D[g]), med, D[g])
        out['model+threshold' + (', gated' if gate else '')] = classify(D['healthy'], D['prodromal'], D['healthy_novice'])
        out['threshold_only'] = dict(hp=round(auc1(D['healthy'][:, -1], D['prodromal'][:, -1]), 3), np=round(auc1(D['healthy_novice'][:, -1], D['prodromal'][:, -1]), 3))
    res[name] = out; print(name, round(time.time() - t), 's', json.dumps(out), flush=True)
json.dump(res, open('results3b.json', 'w'), indent=1)
