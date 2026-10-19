"""Collect the calibration and simulation results into the row files the validation dashboard reads."""
import json, os
H = os.path.dirname(os.path.abspath(__file__)); C = os.path.join(H, '..', 'calib'); S = os.path.join(H, '..', 'sim16', 'results')
J = lambda *p: json.load(open(os.path.join(*p)))
r3 = lambda x: None if x is None else round(float(x), 3)

datasets = [
    dict(dataset='Castegnaro / Howett 2019–23', task='Triangle completion, real walking in VR', groups='24 young, 33 healthy elderly, MCI: 11 biomarker+, 14 biomarker−, 16 unknown', level='Trial', used_for='Lantern model structure; MCI+ effects that set the simulated prodromal player', licence='MIT (Zenodo 8253734)'),
    dict(dataset='Stangl et al. 2020', task='Curved-path homing, real walking in VR, up to 4 stops', groups='30 young, 26 older adults', level='Trial', used_for='Lantern model structure (noise growth with distance); ageing effects', licence='None stated (OSF ufk4x); analysed, not redistributed'),
    dict(dataset='Coughlan / Gillespie 2019–20', task='Virtual Supermarket Task, Sea Hero Quest; retest at ~18 months', groups='32 APOE e3e3, 27 e3e4, healthy, age 51–75', level='Person scores', used_for='Size of the at-risk (midlife APOE4) effect; test-retest', licence='OSF public (x2rjz, 6adqk)'),
    dict(dataset='Marquardt et al. 2024', task='Real-world smartphone wayfinding, 5 campus buildings', groups='24 young, 25 healthy older, 23 SCD', level='Per track', used_for='Route measures: orientation stops, map checks', licence='OSF public (f9br5)'),
    dict(dataset='Theisen et al. 2021 (meta-analysis)', task='Diffusion-model parameters, older vs younger', groups='30 perceptual-task studies', level='Published effect sizes', used_for='Cap on the simulated sentinel (perceptual decision) deficit', licence='Published article'),
]

A = J(C, 'analysis.json'); St = J(C, 'stangl_analysis.json')
LAB = {'E5': 'Isotropic accumulating noise (as first built)', 'A5': 'Separate distance and direction noise (A5)', 'H5': 'Heading noise + accumulating positional noise (H5)',
       'glampi': 'GLAMPI, published (7 parameters)', 'iso': 'Isotropic accumulating noise (as first built)', 'sep5': 'Separate distance and direction noise (A5)',
       'h5': 'Heading noise + accumulating positional noise (H5)', 'ani5': 'Anisotropic accumulating positional noise', 'N5': 'Anisotropic accumulating positional noise', 'sep7': 'Separate, both accumulating (7 parameters)'}
models = []
for m in ('E5', 'A5', 'N5', 'H5', 'glampi'):
    c = A['comparison'].get(m)
    if c: models.append(dict(id=f'tri-{m}', data='Triangles (98 people)', model=LAB[m], k=c['k'], aic=round(c['aic'], 1), bic=round(c['bic'], 1)))
for m in ('iso', 'sep5', 'sep7', 'ani5', 'h5'):
    c = St['comparison'][m]; models.append(dict(id=f'cur-{m}', data='Curved paths (56 people)', model=LAB[m], k=c['k'], aic=round(c['aic'], 1), bic=round(c['bic'], 1)))
for dset in {r['data'] for r in models}:
    best = min(r['bic'] for r in models if r['data'] == dset)
    for r in models:
        if r['data'] == dset: r['dbic'] = round(r['bic'] - best, 1)

rel_t = {k: v['spearman_brown'] for k, v in J(C, 'splithalf_H5.json').items()}
NAMES = {'nu0': 'Heading noise', 'g2': 'Turn gain', 'a': 'Positional noise', 'gain': 'Distance gain', 'leak': 'Leak'}
effects = []
E = A['effects']['H5']
for k in ('nu0', 'g2', 'a', 'gain', 'leak'):
    e = E[k]
    effects.append(dict(id=f'{k}-pos-el', parameter=NAMES[k], comparison='MCI+ vs healthy elderly', d=r3(e['d_pos_vs_el']), auc=r3(e['auc_pos_vs_el']), reliability=r3(rel_t[k])))
    effects.append(dict(id=f'{k}-pos-neg', parameter=NAMES[k], comparison='MCI+ vs MCI−', d=r3(e['d_pos_vs_neg']), auc=r3(e['auc_pos_vs_neg']), reliability=r3(rel_t[k])))
SK = {'n0': 'nu0', 'g': 'gain', 'leak': 'leak', 'a': 'a'}
for k, kk in SK.items():
    e = St['effects']['h5'][k]
    effects.append(dict(id=f'{kk}-old-young', parameter=NAMES[kk], comparison='Older vs young (healthy)', d=r3(e['d']), auc=r3(e['auc']), reliability=r3(e['rel'])))

V = J(C, 'vst_shq_analysis.json'); W = J(C, 'wayfind_analysis.json')
field = []
for lab, key in (('Egocentric orientation (pointing home)', 'egocentric orientation (correct)'), ('Heading direction', 'heading direction'), ('Central (border-avoiding) preference', 'central preference'), ('Sea Hero Quest distance', 'SHQ distance travelled'), ('Four Mountains', 'Four Mountains')):
    v = V[key]
    field.append(dict(id=f'apoe-{key[:12]}', study='APOE4 midlife (supermarket, Sea Hero Quest)', measure=lab, d=r3(abs(v['baseline']['d'])), d_retest=r3(abs(v['retest']['d'])), reliability=r3(v['test_retest_r']), reliability_kind='test-retest, 18 months'))
for lab, key in (('Orientation stops', 'orientation_stops'), ('Map checks', 'help_count'), ('Duration', 'wayfinding_duration'), ('Distance vs young median', 'dist_ratio')):
    w = W[key]
    field.append(dict(id=f'scd-{key}', study='SCD vs healthy older (real-world wayfinding)', measure=lab, d=r3(abs(w['d_scd_oa'])), d_retest=None, reliability=r3(w['reliability']), reliability_kind='odd vs even tracks'))

R = J(S, 'reanalysis.json')
SC = [('cal_v1', 'As first built', 'Prodromal', 'Assumed deficits; isotropic lantern model'), ('cal_h5', 'Lantern from data', 'Prodromal', 'H5 lantern, healthy and MCI+ drawn from the triangle fits'),
      ('cal_h5cap', 'Lantern from data + sentinel cap', 'Prodromal', 'Also caps the perceptual-decision deficit at the ageing effect'),
      ('cal_v1_risk', 'As first built', 'At risk', 'Effect at 0.2 of MCI+ (APOE4-sized)'), ('cal_h5cap_risk', 'Lantern from data + sentinel cap', 'At risk', 'Effect at 0.2 of MCI+ (APOE4-sized)')]
R.update(J(S, 'experience_normed.json')) if os.path.exists(os.path.join(S, 'experience_normed.json')) else None
for extra in ('cal_h5cap_nc', 'cal_h5cap_nc_risk'):
    if extra in R: SC.append((extra, 'New players differ only in controls', 'At risk' if 'risk' in extra else 'Prodromal', 'Counterfactual: players new to games differ only in control fluency, which they learn'))
for extra in ('cal_h5cap_exp', 'cal_h5cap_risk_exp'):
    if extra in R: SC.append((extra, 'Scored against gaming-experience norms', 'At risk' if 'risk' in extra else 'Prodromal', 'New players scored against the new-player norm (one question about gaming experience)'))
sims = []
for key, model, stage, note in SC:
    if key not in R: continue
    x = R[key]; al = x.get('all', {})
    sims.append(dict(id=key, model=model, stage=stage, note=note, auc_1=r3(x['single_pure']['auc']), auc_10=r3(x['pure']['auc']), auc_10_all=r3(al.get('auc')),
                     healthy_flagged_10=r3(x['pure']['healthy_flagged']), excess_flagged_10=r3(x['pure']['novice_flagged'] - x['pure']['healthy_flagged']),
                     novices_flagged_10=r3(x['pure']['novice_flagged']), novices_flagged_1=r3(x['single_pure']['novice_flagged']), novice_auc_10=r3(x['pure']['novice_auc'])))
for name, rows in (('open_datasets', datasets), ('model_fit', models), ('lantern_effects', effects), ('field_effects', field), ('sim_scenarios', sims)):
    json.dump(rows, open(os.path.join(H, name + '.json'), 'w'), indent=1)
    print(name, len(rows))
