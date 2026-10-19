import cProfile, pstats, numpy as np, sim16
sim16.DESIGN.update(sim16.BASE_DESIGN); sim16.sim2.set_knobs(effect=.5, decline=0, design='v5')
def run():
    for i in range(6): sim16.one(('healthy', i, 2, 100 + i, dict(sim16.BASE_DESIGN), dict(effect=.5, decline=0.0, design='v5', profile='general')))
cProfile.run('run()', 'p.out'); pstats.Stats('p.out').sort_stats('cumtime').print_stats(14)
