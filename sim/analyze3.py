"""Untuned (v2) vs tuned (v3) three-chapter design, same simulated players. Writes results3.json.

v3 adds: a warm-up prologue each session, adaptive figure difficulty, more figures, palace
reshuffles on pickup as well as placement, and a second homing trial in the rotunda.
Longitudinal v3 analysis also drops each player's sessions from before their controls
plateaued (judged from walking speed and wall scrapes alone)."""
import json, time
import numpy as np
import sim2
from analyze2 import col, auc1, classify, LEGACY, POSITIVE

POSITIVE.update({'homing_mean'})
MODEL = ['c1_post_dist', 'c1_bumps', 'c1_jopt_post', 'c2_jopt', 'c2_jopt_post', 'c2_post_dist', 'c2_bumps', 'homing_mean',
         'c3_first_correct', 'c3_stale', 'c3_per_trip', 'fig_acc']


def plateau(rows):
    sc = np.array([r['scrape_rate'] for r in rows]); sp = np.array([r['speed'] for r in rows])
    tgt_sc, tgt_sp = sc[-3:].mean(), sp[-3:].mean()
    for s in range(len(rows) - 4):
        if sc[s] <= 1.15 * tgt_sc and sp[s] >= .9 * tgt_sp: return s
    return len(rows) - 4


def person_feats(rows, keys, gate):
    rows = sorted(rows, key=lambda r: r['session'])
    if gate: rows = rows[plateau(rows):]
    s = np.arange(len(rows)); out = []
    for k in keys:
        v = col(rows, k); b, a = np.polyfit(s, v, 1); out += [v.mean(), b, np.std(v - (a + b * s), ddof=2)]
    tr = [t for r in rows for t in r['_fig']]
    try: v, aa, ter = sim2.ez(tr)
    except Exception: v, aa, ter = np.nan, np.nan, np.nan
    return out + [v, aa, ter]


def run(design, n_single=400, n_long=100, sessions=10):
    sim2.KNOBS['design'] = design
    rows = sim2.simulate(n_single, 1, seed=21)
    by = {g: [r for r in rows if r['group'] == g] for g in sim2.GROUPS}
    M = lambda ks, g: np.column_stack([col(by[g], k) for k in ks])
    single = {'legacy': classify(M(LEGACY, 'healthy'), M(LEGACY, 'prodromal'), M(LEGACY, 'healthy_novice')),
              'model': classify(M(MODEL, 'healthy'), M(MODEL, 'prodromal'), M(MODEL, 'healthy_novice'))}
    per = {k: round(auc1(col(by['healthy'], k), col(by['prodromal'], k)), 3) for k in MODEL}
    figacc = {g: round(float(np.mean([r['fig_acc'] for r in by[g]])), 3) for g in by}
    rows = sim2.simulate(n_long, sessions, seed=22)
    P = {}
    for r in rows: P.setdefault((r['group'], r['pid']), []).append(r)
    out = {}
    for gate in ([False, True] if design == 'v3' else [False]):
        D = {g: np.array([person_feats(v, MODEL, gate) for (gg, _), v in P.items() if gg == g], float) for g in sim2.GROUPS}
        allx = np.vstack(list(D.values())); med = np.nanmedian(allx, 0)
        for g in D: D[g] = np.where(np.isnan(D[g]), med, D[g])
        out['model' + (', gated' if gate else '')] = classify(D['healthy'], D['prodromal'], D['healthy_novice'])
        if not gate: out['ez_drift'] = round(auc1(D['healthy'][:, -3], D['prodromal'][:, -3]), 3)
    lastacc = {g: round(float(np.mean([r['fig_acc'] for r in rows if r['group'] == g and r['session'] >= 5])), 3) for g in sim2.GROUPS}
    return dict(single=single, per_measure=per, fig_acc_single=figacc, fig_acc_late=lastacc, longitudinal=out)


SCEN = {'no_decline': dict(effect=1.0, decline=0.0), 'half_effect': dict(effect=.5, decline=0.0)}
if __name__ == '__main__':
    res = {}
    for name, k in SCEN.items():
        for design in ['v2', 'v3']:
            t = time.time(); sim2.set_knobs(design=design, **k)
            res[f'{name}:{design}'] = run(design)
            print(name, design, round(time.time() - t), 's', json.dumps(res[f'{name}:{design}']['single']), json.dumps(res[f'{name}:{design}']['longitudinal']), flush=True)
            json.dump(res, open('results3.json', 'w'), indent=1)
    print('saved')
