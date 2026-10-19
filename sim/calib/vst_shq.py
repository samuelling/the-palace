"""Third dataset: Virtual Supermarket Task and Sea Hero Quest in cognitively healthy midlife adults by APOE genotype, tested
twice ~18 months apart (Coughlan et al. 2019 PNAS; Gillespie/Coughlan et al. 2020 PLOS ONE test-retest; OSF x2rjz, 6adqk).
Per-person summary scores only. Gives an at-risk (not symptomatic) effect size and test-retest reliability.
Usage: python3 -I vst_shq.py <Allmeasures_data.xlsx> <shq_subgroup.xlsx>"""
import sys, json
import numpy as np, pandas as pd
from scipy.stats import mannwhitneyu, spearmanr

A = pd.read_excel(sys.argv[1]); S = pd.read_excel(sys.argv[2])
print('APOE codes', A['APOE'].value_counts().to_dict(), 'ages', A['B_age'].describe()[['mean', 'min', 'max']].round(1).to_dict())
E4 = lambda df: df['APOE'] == df['APOE'].max()          # two codes: the higher one is e3e4 (checked against the paper's group sizes below)


def eff(df, col):
    x = df[[col, 'APOE']].dropna(); a = x[col][~E4(x)].values; b = x[col][E4(x)].values
    d = (b.mean() - a.mean()) / np.sqrt((a.var(ddof=1) + b.var(ddof=1)) / 2)
    return dict(n3=len(a), n4=len(b), mean3=float(a.mean()), mean4=float(b.mean()), d=float(d), auc=float(mannwhitneyu(b, a).statistic / (len(a) * len(b))))


out = {}
rows = [('egocentric orientation (correct)', 'Begocentric', 'Fegocentric', A), ('heading direction', 'Bheading', 'Fheading', A), ('map drop error', 'Bmap', 'Fmap_drop', A),
        ('central preference', 'Bborder', 'Fborder', A), ('Four Mountains', 'BFour_Mountains', 'FFour_mountains', A), ('SHQ distance travelled', 'BDistance_Travelled', 'FDistance_Travelled', S),
        ('SHQ duration', 'BDuration', 'FDuration_Travelled', S), ('ACE total', 'BACE_Total', 'FACETotal', A)]
print(f"{'measure':34s} {'base d':>7s} {'AUC':>5s} {'retest d':>8s} {'AUC':>5s} {'test-retest r':>13s}  n(e3/e4)")
for lab, b, f, df in rows:
    eb, ef = eff(df, b), eff(df, f); x = df[[b, f]].dropna(); r = float(np.corrcoef(x[b], x[f])[0, 1])
    out[lab] = dict(baseline=eb, retest=ef, test_retest_r=r)
    print(f"{lab:34s} {eb['d']:7.2f} {eb['auc']:5.2f} {ef['d']:8.2f} {ef['auc']:5.2f} {r:13.2f}  {eb['n3']}/{eb['n4']}")
json.dump(out, open('vst_shq_analysis.json', 'w'), indent=1)
