"""Re-run the analysis under three sets of assumptions. Writes results.json."""
import json, time
import montecarlo as mc
import analyze as A

SCENARIOS = {
    'base': dict(effect=1.0, decline=1.0),          # prodromal differences as specified, declining across sessions
    'no_decline': dict(effect=1.0, decline=0.0),    # same differences, but stable over the 12-session window
    'half_effect': dict(effect=0.5, decline=0.0),   # differences halved, no decline: a hard, realistic case
}

if __name__ == '__main__':
    out = {'assumptions': {'healthy': mc.GROUPS['healthy'], 'prodromal_base': mc.BASE_PRODROMAL,
                           'healthy_novice': mc.GROUPS['healthy_novice']}}
    for name, k in SCENARIOS.items():
        t = time.time()
        mc.set_knobs(**k)
        out[name] = {'knobs': k, 'single_session': A.single(800), 'longitudinal': A.longitudinal(150, 12)}
        print(name, 'done in', round(time.time() - t), 's', flush=True)
        json.dump(out, open('results.json', 'w'), indent=1)
    print('saved')
