"""Split-half reliability of per-person parameters (odd vs even trials), for de-attenuating group effects.
Usage: python3 splithalf.py model [model ...] -> splithalf_<model>.json"""
import json, sys
import numpy as np
from multiprocessing import Pool
import fit

if __name__ == '__main__':
    np.seterr(all='ignore')
    data = [r for r in json.load(open('trials.json')) if not r['bad_ppt'] and not r['no_oob_record']]
    for m in sys.argv[1:]:
        jobs, keys = [], []
        for r in data:
            good = [t for t in r['trials'] if not t['bad']]
            for half in (0, 1):
                rr = dict(r, trials=good[half::2]); D = fit.arrays(rr)
                if D['n'] < 6: continue
                jobs.append((m, D, r['pid'] * 3 + half, 30)); keys.append((r['group'], r['pid'], half))
        with Pool() as pool: res = pool.map(fit.fit_one, jobs, chunksize=4)
        names = fit.MODELS[m][2]; P = {}
        for (g, p, h), (nll, x) in zip(keys, res):
            if x: P.setdefault((g, p), {})[h] = x
        pairs = [v for v in P.values() if 0 in v and 1 in v]
        rel = {}
        for i, k in enumerate(names):
            a = np.array([v[0][i] for v in pairs]); b = np.array([v[1][i] for v in pairs]); r = np.corrcoef(a, b)[0, 1]
            rel[k] = dict(split_r=float(r), spearman_brown=float(2 * r / (1 + r)) if r > -1 else None)
        print(m, {k: round(v['spearman_brown'], 2) for k, v in rel.items()}, 'pairs', len(pairs))
        json.dump(rel, open(f'splithalf_{m}.json', 'w'), indent=1)
