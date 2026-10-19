"""Model comparison, replication of the published GLAMPI group effects, and group effects on our lantern parameters."""
import json, sys
import numpy as np
from scipy.stats import mannwhitneyu, ttest_ind
from fit import MODELS

import glob
F = dict(pooled=[r for f in sorted(glob.glob('fits_*.json')) if 'percond' not in f for r in json.load(open(f))], percond=json.load(open('fits_percond.json')))
GROUPS = ['young', 'elderly', 'mci_neg', 'mci_pos', 'mci_unk']
K = {m: len(MODELS[m][2]) for m in MODELS}


def auc(a, b):
    a, b = np.asarray(a), np.asarray(b); a, b = a[np.isfinite(a)], b[np.isfinite(b)]
    return mannwhitneyu(b, a).statistic / (len(a) * len(b))


def d(a, b):
    a, b = np.asarray(a), np.asarray(b); a, b = a[np.isfinite(a)], b[np.isfinite(b)]
    sp = np.sqrt(((len(a) - 1) * a.var(ddof=1) + (len(b) - 1) * b.var(ddof=1)) / (len(a) + len(b) - 2))
    return (b.mean() - a.mean()) / sp


def table(rows, model):
    P = {}
    for r in rows:
        if r['model'] == model and r['params']: P.setdefault(r['group'], {}).setdefault(r['pid'], []).append(r['params'])
    # average over conditions where several fits exist
    return {g: {pid: {k: float(np.mean([x[k] for x in v])) for k in v[0]} for pid, v in G.items()} for g, G in P.items()}


out = {}
# ---------------------------------------------------------------- 1. model comparison (pooled conditions)
pooled = F['pooled']; models = sorted({r['model'] for r in pooled})
ppl = sorted({(r['group'], r['pid']) for r in pooled})
aic = {m: {} for m in models}; bic = {m: {} for m in models}
for r in pooled:
    if r['params']:
        aic[r['model']][(r['group'], r['pid'])] = 2 * r['nll'] + 2 * K[r['model']]
        bic[r['model']][(r['group'], r['pid'])] = 2 * r['nll'] + K[r['model']] * np.log(r['n'])
common = [p for p in ppl if all(p in aic[m] for m in models)]
cmp_models = [m for m in models if m != 'glampi_raw']
print(f'Model comparison, {len(common)} participants, all conditions pooled (lower is better; glampi_raw is scored on a different angle and left out)')
print(f"{'model':8s} {'k':>2s} {'sum AIC':>9s} {'sum BIC':>9s} {'best AIC (n)':>13s}")
best = {m: 0 for m in cmp_models}
for p in common: best[min(cmp_models, key=lambda m: aic[m][p])] += 1
for m in cmp_models:
    print(f"{m:8s} {K[m]:2d} {sum(aic[m][p] for p in common):9.1f} {sum(bic[m][p] for p in common):9.1f} {best[m]:13d}")
out['comparison'] = {m: dict(k=K[m], aic=sum(aic[m][p] for p in common), bic=sum(bic[m][p] for p in common), best=best[m]) for m in cmp_models}

# ---------------------------------------------------------------- 2. replication: GLAMPI per condition, averaged
T = table(F['percond'], 'glampi_raw')
print('\nReplication: GLAMPI fitted per condition and averaged (as published). Group means:')
print(f"{'':8s}" + ''.join(f'{k:>8s}' for k in MODELS['glampi_raw'][2]))
for g in GROUPS:
    if g in T: print(f"{g:8s}" + ''.join(f"{np.mean([v[k] for v in T[g].values()]):8.3f}" for k in MODELS['glampi_raw'][2]) + f"   n={len(T[g])}")
print('MCI+ vs MCI-:  ' + '  '.join(f"{k} AUC {auc([v[k] for v in T['mci_neg'].values()], [v[k] for v in T['mci_pos'].values()]):.2f} p {ttest_ind([v[k] for v in T['mci_pos'].values()], [v[k] for v in T['mci_neg'].values()]).pvalue:.3f}" for k in ('g2', 'nu', 'k', 'beta', 'sigma')))
out['replication'] = {g: {k: float(np.mean([v[k] for v in T[g].values()])) for k in MODELS['glampi_raw'][2]} for g in T}

# ---------------------------------------------------------------- 3. group effects on the lantern-model family
mci_all = lambda TT: {**{('p', k): v for k, v in TT.get('mci_pos', {}).items()}, **{('n', k): v for k, v in TT.get('mci_neg', {}).items()}, **{('u', k): v for k, v in TT.get('mci_unk', {}).items()}}
out['effects'] = {}
for m in [x for x in ('A5', 'H5', 'H6', 'glampi') if x in models]:
    TT = table(pooled, m); names = MODELS[m][2]
    print(f'\n{m}: group means (pooled conditions), effect sizes (d, AUC) vs healthy elderly and MCI+ vs MCI-')
    print(f"{'':8s}" + ''.join(f'{k:>9s}' for k in names))
    for g in GROUPS:
        print(f"{g:8s}" + ''.join(f"{np.median([v[k] for v in TT[g].values()]):9.3f}" for k in names) + f"   (medians, n={len(TT[g])})")
    E = {}
    for k in names:
        el = [v[k] for v in TT['elderly'].values()]; mp = [v[k] for v in TT['mci_pos'].values()]; mn = [v[k] for v in TT['mci_neg'].values()]
        ma = [v[k] for v in mci_all(TT).values()]
        E[k] = dict(d_mci_vs_el=d(el, ma), auc_mci_vs_el=auc(el, ma), d_pos_vs_el=d(el, mp), auc_pos_vs_el=auc(el, mp), d_pos_vs_neg=d(mn, mp), auc_pos_vs_neg=auc(mn, mp),
                    d_el_vs_young=d([v[k] for v in TT['young'].values()], el))
    for lab, key in (('d MCI vs elderly', 'd_mci_vs_el'), ('AUC MCI vs elderly', 'auc_mci_vs_el'), ('d MCI+ vs elderly', 'd_pos_vs_el'), ('AUC MCI+ vs elderly', 'auc_pos_vs_el'),
                     ('d MCI+ vs MCI-', 'd_pos_vs_neg'), ('AUC MCI+ vs MCI-', 'auc_pos_vs_neg'), ('d elderly vs young', 'd_el_vs_young')):
        print(' ' * 8 + ''.join(f"{E[k][key]:9.2f}" for k in names) + f"   {lab}")
    out['effects'][m] = E
    out.setdefault('params', {})[m] = {g: list(TT[g].values()) for g in TT}
json.dump(out, open('analysis.json', 'w'), indent=1)
