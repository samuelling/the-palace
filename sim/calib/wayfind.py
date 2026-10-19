"""Fourth dataset: real-world smartphone wayfinding on a campus (Marquardt et al. 2024, PLOS Digital Health; OSF f9br5).
24 young, 25 healthy older and 23 subjective-cognitive-decline (SCD) adults each found 5 buildings. Per-track measures.
Maps onto the game's route measures: map views (plan readings), orientation stops (hesitations), distance (efficiency).
Usage: python3 -I wayfind.py <measures.csv>"""
import sys, json
import numpy as np, pandas as pd
from scipy.stats import mannwhitneyu

W = pd.read_csv(sys.argv[1], sep=';', decimal=',', encoding='utf-8-sig')
W = W.dropna(subset=['wayfinding_distance'])
# efficiency relative to the track's median path among young adults (a stand-in for the shortest route)
ref = W[W.group == 'YA'].groupby('track').wayfinding_distance.median()
W['dist_ratio'] = W.wayfinding_distance / W.track.map(ref)
M = ['dist_ratio', 'wayfinding_duration', 'movement_speed', 'help_count', 'orientation_stops']
tf = lambda k, v: np.log1p(v) if k in ('help_count', 'orientation_stops') else np.log(v)
P = W.groupby(['id', 'group'])[M].agg(lambda v: np.mean(tf(v.name, v))).reset_index()
# split-half across tracks (odd vs even track number) for reliability
H = {h: W[W.track % 2 == h].groupby('id')[M].agg(lambda v: np.mean(tf(v.name, v))) for h in (0, 1)}
out = {}
print('people per group', P.group.value_counts().to_dict())
print(f"{'measure':20s} {'d SCD-OA':>9s} {'AUC':>5s} {'d OA-YA':>8s} {'reliab':>7s}")
for k in M:
    oa, scd, ya = P[P.group == 'OA'][k].values, P[P.group == 'SCD'][k].values, P[P.group == 'YA'][k].values
    d = lambda a, b: (b.mean() - a.mean()) / np.sqrt((a.var(ddof=1) + b.var(ddof=1)) / 2)
    j = H[0][k].to_frame('a').join(H[1][k].to_frame('b')).dropna(); r = np.corrcoef(j.a, j.b)[0, 1]; sb = 2 * r / (1 + r)
    out[k] = dict(d_scd_oa=float(d(oa, scd)), auc_scd_oa=float(mannwhitneyu(scd, oa).statistic / (len(oa) * len(scd))), d_oa_ya=float(d(ya, oa)), reliability=float(sb))
    print(f"{k:20s} {out[k]['d_scd_oa']:9.2f} {out[k]['auc_scd_oa']:5.2f} {out[k]['d_oa_ya']:8.2f} {sb:7.2f}")
json.dump(out, open('wayfind_analysis.json', 'w'), indent=1)
