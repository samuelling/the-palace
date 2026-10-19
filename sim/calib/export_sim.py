"""Turn the A5 fits into population distributions for the simulator (sim16/pi_calib.json).

Healthy = healthy elderly; prodromal (full effect) = biomarker-positive MCI, i.e. prodromal AD in the IWG sense.
Each parameter is summarised on a scale where it is roughly normal (log for gain, sigma, nu), with robust location
(median) and spread (MAD x 1.4826). Spread is shrunk by the square root of split-half reliability where that is at least .5 (direction and distance noise),
because fitted values carry estimation noise that true person parameters do not; gain, leak and turn gain are not reliably
measured per person in this task (split-half below .25), so their fitted spread is kept, which errs towards less separation. Scale to the game: legs there are longer, so distance noise is
scaled up and leak per metre down to keep their effect at typical path lengths (an assumption)."""
import json, os
import numpy as np

A = [r for r in json.load(open('fits_A5.json')) if r['params']]
rel = json.load(open('splithalf_A5.json')) if os.path.exists('splithalf_A5.json') else {}
LOG = {'gain', 'sigma', 'nu'}
SCALE = dict(sigma=1.5, leak=.72)          # triangle task -> game lawn (median outbound 6.4 m vs 8.9 m, home distance 3.1 vs 6.3)
out = {'_note': __doc__, 'reliability': {k: v['spearman_brown'] for k, v in rel.items()}}
MADS = {}
for grp, lab in (('elderly', 'healthy'), ('mci_pos', 'prodromal'), ('mci_neg', 'mci_neg'), ('young', 'young')):
    P = [r['params'] for r in A if r['group'] == grp]; out[lab] = {'n': len(P)}
    for k in ('gain', 'leak', 'g2', 'sigma', 'nu'):
        v = np.array([p[k] * SCALE.get(k, 1) for p in P]); v = np.log(v) if k in LOG else v
        med = float(np.median(v)); mad = float(np.median(np.abs(v - med)) * 1.4826)
        r = rel.get(k, {}).get('spearman_brown', 1.0) or 1.0
        r = r if r >= .5 else 1.0      # only de-noise parameters that are measured reliably; otherwise keep the (wider) fitted spread
        out[lab][k] = dict(loc=round(med, 4), scale=round(mad * np.sqrt(r), 4), log=k in LOG)
# Turn gain: per-person estimates are unreliable in triangles (one turn, near-identical angles), but the over-turning they
# stand for is robust at group level. Set its spread so the healthy-to-prodromal shift matches the model-free effect on the
# mean signed direction error (d = 1.43 for biomarker-positive MCI vs healthy elderly).
import fit
data = [r for r in json.load(open('trials.json')) if not r['bad_ppt'] and not r['no_oob_record']]
def signed_err(r): D = fit.arrays(r); return float(np.mean(fit.wrap(D['th3'] - D['alpha'])))
e = {g: np.array([signed_err(r) for r in data if r['group'] == g]) for g in ('elderly', 'mci_pos')}
d_dir = (e['mci_pos'].mean() - e['elderly'].mean()) / np.sqrt((e['mci_pos'].var(ddof=1) + e['elderly'].var(ddof=1)) / 2)
sc = abs(out['prodromal']['g2']['loc'] - out['healthy']['g2']['loc']) / d_dir
for lab in ('healthy', 'prodromal'): out[lab]['g2']['scale'] = round(float(sc), 4)
out['g2_note'] = f'turn-gain spread set from the model-free over-turning effect, d = {d_dir:.2f}'
json.dump(out, open('../sim16/pi_calib.json', 'w'), indent=1)
for lab in ('healthy', 'prodromal', 'mci_neg'):
    print(lab, {k: (round(np.exp(v['loc']) if v['log'] else v['loc'], 3), v['scale']) for k, v in out[lab].items() if k != 'n'})
for k in ('gain', 'leak', 'g2', 'sigma', 'nu'):
    h, p = out['healthy'][k], out['prodromal'][k]; print(k, 'shift in healthy SDs', round((p['loc'] - h['loc']) / h['scale'], 2))
