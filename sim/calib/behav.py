"""Behavioural replication check against Castegnaro et al. 2023 (proportional angle and distance errors)."""
import json, numpy as np
d = json.load(open('trials.json'))
def ang(va, vb): return np.degrees(np.arctan2(va[0]*vb[1]-va[1]*vb[0], va[0]*vb[0]+va[1]*vb[1]))
def ppt(r, cond=None):
    pa, pd = [], []
    for t in r['trials']:
        if t['bad'] or (cond and t['cond'] != cond): continue
        c1, c2, c3, f = map(np.array, (t['c1'], t['c2'], t['c3'], t['final']))
        corr = ang(c3-c2, c1-c3); pa.append((t['real_ret'] % 360)/corr)
        if not t['oob']: pd.append(np.linalg.norm(f-c3)/np.linalg.norm(c1-c3))
    return np.mean(pa), np.mean(pd)
G = {}
for g in ['young','elderly','mci_pos','mci_neg','mci_unk']:
    R = [r for r in d if r['group']==g and not r['bad_ppt'] and not r['no_oob_record']]
    # per condition then averaged (as the paper's ANOVAs work per condition)
    v = np.array([np.nanmean([ppt(r, c) for c in (1,2,3)], 0) for r in R]); G[g] = v
    print(f"{g:8s} n={len(R):2d}  prop angle {np.nanmean(v[:,0]):.2f}  prop distance {np.nanmean(v[:,1]):.2f}")
m = np.vstack([G['mci_pos'], G['mci_neg'], G['mci_unk']])
print(f"MCI pooled prop angle {np.nanmean(m[:,0]):.2f} distance {np.nanmean(m[:,1]):.2f}")
