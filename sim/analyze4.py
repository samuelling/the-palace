"""Step 1 revisions (v4) vs the tuned design (v3), under two hypotheses about the prodromal deficit.

v4 adds lantern triangle-completion trials (3 per session) and reward-vs-transition revaluation
(a reward leg in the conservatory; announced goal moves in the palace, half with a veil reshuffle).
Profiles: 'general' = prodromal players are worse at map memory and map updating alike;
'transition' = map memory near normal, deficit concentrated in updating a changed map.
Half-sized effects, no decline: the hard, realistic case. Writes results4.json."""
import json, time
import numpy as np
import sim2
from analyze2 import col, auc1, classify, POSITIVE
from analyze3 import MODEL as M3, plateau

POSITIVE.update({'homing_mean', 'tr_eff', 'rr_eff'})
M4 = M3 + ['tr_eff', 'rr_eff', 'trrr', 'c3_rr', 'c3_tr', 'c3_seek_contrast']
NEW = ['homing_mean', 'trrr', 'tr_eff', 'rr_eff', 'c3_seek_contrast', 'c3_rr', 'c3_tr']


def lantern_fit(rows):
    """Pool every lantern trial a player has done: squared error against outbound length.
    Slope ~ accumulating noise (plus leak), intercept ~ reporting noise."""
    tr = [t for r in rows for t in r.get('_lantern', [])]
    if len(tr) < 4: return [np.nan, np.nan]
    L = np.array([a for a, _ in tr]); e2 = np.array([b for _, b in tr]) ** 2
    b, a = np.polyfit(L, e2, 1); return [b, a]


def person_feats(rows, keys, design):
    rows = sorted(rows, key=lambda r: r['session']); s = np.arange(len(rows)); out = []
    for k in keys:
        v = col(rows, k); b, a = np.polyfit(s, v, 1); out += [v.mean(), b, np.std(v - (a + b * s), ddof=2)]
    tr = [t for r in rows for t in r['_fig']]
    try: v, aa, ter = sim2.ez(tr)
    except Exception: v, aa, ter = np.nan, np.nan, np.nan
    out += [v, aa, ter, np.log(np.mean([r['scale'] for r in rows[-4:]]))]
    if design == 'v4': out += lantern_fit(rows)
    return out


def fill(D):
    allx = np.vstack(list(D.values())); med = np.nanmedian(allx, 0)
    return {g: np.where(np.isnan(D[g]), med, D[g]) for g in D}


def run(design, profile, n_single=300, n_long=80, sessions=10):
    sim2.set_knobs(design=design, profile=profile, effect=.5, decline=0.0)
    keys = M4 if design == 'v4' else M3
    rows = sim2.simulate(n_single, 1, seed=31)
    by = {g: [r for r in rows if r['group'] == g] for g in sim2.GROUPS}
    M = lambda ks, g: np.column_stack([col(by[g], k) for k in ks])
    single = classify(M(keys, 'healthy'), M(keys, 'prodromal'), M(keys, 'healthy_novice'))
    per = {}
    for k in (NEW if design == 'v4' else ['homing_mean']):
        h, p_, n = col(by['healthy'], k), col(by['prodromal'], k), col(by['healthy_novice'], k)
        per[k] = dict(hp=round(auc1(h, p_), 3), np=round(auc1(n, p_), 3), hn=round(auc1(h, n), 3))
    rows = sim2.simulate(n_long, sessions, seed=32)
    P = {}
    for r in rows: P.setdefault((r['group'], r['pid']), []).append(r)
    D = fill({g: np.array([person_feats(v, keys, design) for (gg, _), v in P.items() if gg == g], float) for g in sim2.GROUPS})
    long = classify(D['healthy'], D['prodromal'], D['healthy_novice'])
    extra = {}
    if design == 'v4':
        LF = fill({g: np.array([lantern_fit(sorted(v, key=lambda r: r['session'])) for (gg, _), v in P.items() if gg == g], float) for g in sim2.GROUPS})
        extra['lantern_slope'] = dict(hp=round(auc1(LF['healthy'][:, 0], LF['prodromal'][:, 0]), 3), np=round(auc1(LF['healthy_novice'][:, 0], LF['prodromal'][:, 0]), 3), hn=round(auc1(LF['healthy'][:, 0], LF['healthy_novice'][:, 0]), 3))
        extra['lantern_intercept'] = dict(hp=round(auc1(LF['healthy'][:, 1], LF['prodromal'][:, 1]), 3), np=round(auc1(LF['healthy_novice'][:, 1], LF['prodromal'][:, 1]), 3), hn=round(auc1(LF['healthy'][:, 1], LF['healthy_novice'][:, 1]), 3))
    return dict(single=single, per_measure=per, longitudinal=long, **extra)


if __name__ == '__main__':
    res = {}
    for profile in ['general', 'transition']:
        for design in ['v3', 'v4']:
            t = time.time(); res[f'{profile}:{design}'] = r = run(design, profile)
            print(profile, design, round(time.time() - t), 's', json.dumps(r), flush=True)
            json.dump(res, open('results4.json', 'w'), indent=1)
    print('saved')
