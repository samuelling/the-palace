"""Power check: the same step-1 mechanics with more trials per session (8 lantern trials over a wider
range of path lengths, 3 map-change/goal-change pairs). Writes results4b.json."""
import json, time, sim2
import analyze4 as A
res = {}
for profile in ['general', 'transition']:
    t = time.time(); sim2.KNOBS.update(lanterns=8, pairs=3)
    res[profile] = r = A.run('v4', profile)
    print(profile, round(time.time() - t), 's', json.dumps(r), flush=True)
    json.dump(res, open('results4b.json', 'w'), indent=1)
