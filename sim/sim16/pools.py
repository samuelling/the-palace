# Build the lantern path pools once: every layout, both lawn sizes.
import json, numpy as np, sim16
from multiprocessing import Pool
def build(args):
    lay, lawn = args; sim16.DESIGN['lawn'] = lawn
    r = np.random.default_rng(lay['seed'] * 7 + (1 if lawn == 'large' else 0)); box = sim16.lawn_box(lay)
    return f"{lay['seed']}:{lawn}", [p for p in (sim16.lantern_path(box, r) for _ in range(220)) if p]
if __name__ == '__main__':
    jobs = [(l, lw) for l in sim16.LAY['conservatory'] for lw in ('base', 'large')]
    with Pool() as pool: out = dict(pool.map(build, jobs))
    json.dump({k: [[round(a, 3), round(b, 3)] for a, b in v] for k, v in out.items()}, open('paths16.json', 'w'))
    L = [a for k, v in out.items() if k.endswith('base') for a, _ in v]; L2 = [a for k, v in out.items() if k.endswith('large') for a, _ in v]
    print('pools', len(out), 'base L', np.percentile(L, [5, 50, 95]).round(1), 'large L', np.percentile(L2, [5, 50, 95]).round(1))
