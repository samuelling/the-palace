"""Glimpse-then-integrate palace tests and closure perseveration (v5) vs step 1 (v4).
Both with 5 lantern trials per session, as in the game. Half-sized effects, no decline. Writes results5.json."""
import json, time
import numpy as np
import sim2
from analyze2 import col, auc1, classify, POSITIVE
from analyze4 import M4, lantern_fit, fill

POSITIVE.update({'c2_revisits'})
NEW5 = ['c3_int_swap', 'c3_int_rot', 'c3_int_none', 'c3_int_stale', 'c3_rot_minus_none', 'c2_revisits']
M5 = [k for k in M4 if k not in ('c3_rr', 'c3_tr', 'c3_seek_contrast')] + NEW5


def feats(rows, keys):
    rows = sorted(rows, key=lambda r: r['session']); s = np.arange(len(rows)); out = []
    for k in keys:
        v = col(rows, k); b, a = np.polyfit(s, v, 1); out += [v.mean(), b, np.std(v - (a + b * s), ddof=2)]
    tr = [t for r in rows for t in r['_fig']]
    try: v, aa, ter = sim2.ez(tr)
    except Exception: v, aa, ter = np.nan, np.nan, np.nan
    return out + [v, aa, ter, np.log(np.mean([r['scale'] for r in rows[-4:]]))] + lantern_fit(rows)


def run(design, profile, n_single=300, n_long=80, sessions=10):
    sim2.set_knobs(design=design, profile=profile, effect=.5, decline=0.0, lanterns=5, pairs=1)
    keys = M5 if design == 'v5' else M4
    rows = sim2.simulate(n_single, 1, seed=41)
    by = {g: [r for r in rows if r['group'] == g] for g in sim2.GROUPS}
    M = lambda ks, g: np.column_stack([col(by[g], k) for k in ks])
    single = classify(M(keys, 'healthy'), M(keys, 'prodromal'), M(keys, 'healthy_novice'))
    per = {}
    if design == 'v5':
        for k in NEW5:
            h, p_, n = col(by['healthy'], k), col(by['prodromal'], k), col(by['healthy_novice'], k)
            per[k] = dict(hp=round(auc1(h, p_), 3), np=round(auc1(n, p_), 3), hn=round(auc1(h, n), 3))
    rows = sim2.simulate(n_long, sessions, seed=42)
    P = {}
    for r in rows: P.setdefault((r['group'], r['pid']), []).append(r)
    D = fill({g: np.array([feats(v, keys) for (gg, _), v in P.items() if gg == g], float) for g in sim2.GROUPS})
    long = classify(D['healthy'], D['prodromal'], D['healthy_novice'])
    # person-level means of the new measures, to see which ones resist the novice confound
    perlong = {}
    if design == 'v5':
        for k in NEW5:
            m = {g: np.array([np.nanmean(col(sorted(v, key=lambda r: r['session']), k)) for (gg, _), v in P.items() if gg == g]) for g in sim2.GROUPS}
            perlong[k] = dict(hp=round(auc1(m['healthy'], m['prodromal']), 3), np=round(auc1(m['healthy_novice'], m['prodromal']), 3), hn=round(auc1(m['healthy'], m['healthy_novice']), 3))
    return dict(single=single, longitudinal=long, per_measure_single=per, per_measure_10_sessions=perlong)


if __name__ == '__main__':
    res = {}
    for profile in ['general', 'transition']:
        for design in ['v4', 'v5']:
            t = time.time(); res[f'{profile}:{design}'] = r = run(design, profile)
            print(profile, design, round(time.time() - t), 's', json.dumps(r), flush=True)
            json.dump(res, open('results5.json', 'w'), indent=1)
    print('saved')
