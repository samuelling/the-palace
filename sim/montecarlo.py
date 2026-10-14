"""
Monte Carlo players for The Palace (East Wing beta).

Simulated agents with explicit cognitive parameters play the beta's real grid and
objective sequence, including the Architect's rearrangement, and log the same
measures the game records. The point is to ask, before collecting real data, how
well those measures could separate healthy players from players with
dementia-related changes, under stated assumptions.

Agent parameters
  p_enc   probability each doorway / corridor connection is encoded from the plan
  alpha   map-update rate: chance per encounter of rewriting a connection that
          turned out wrong, or encoding a new one seen up close
  tau     planning noise (softmax temperature over believed distance-to-goal)
  forget  per-step chance of losing an encoded connection
  speed   movement speed multiplier (motor and controller skill)
  aim     probability a shot hits
  p_glove chance of noticing and taking the glove on the first gallery visit

Everything here is an assumption-driven sensitivity analysis, not validation.
"""
import numpy as np
from collections import deque
from multiprocessing import Pool

MW, MH = 26, 18


def build():
    G = [['#'] * MW for _ in range(MH)]

    def carve(x0, y0, x1, y1, c='.'):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                G[y][x] = c
    carve(1, 1, 7, 5); carve(16, 1, 22, 5); carve(2, 7, 21, 7); carve(8, 9, 14, 15); carve(1, 9, 6, 15)
    carve(23, 3, 24, 3); carve(24, 3, 24, 10); carve(18, 10, 24, 10); carve(18, 10, 18, 13); carve(16, 13, 18, 13)
    G[6][4] = 'A'; G[6][19] = 'B'; G[13][15] = 'E'
    for x, y in [(7, 12), (7, 10), (11, 8), (12, 8)]:
        G[y][x] = 'P'
    return G


G = build()
BLOCK = {(14, 11), (2, 11), (5, 13), (6, 2), (2, 4), (17, 2), (21, 2)}
FLOOR = {(x, y) for y in range(MH) for x in range(MW) if G[y][x] != '#' and (x, y) not in BLOCK}


def in_corr(x, y):
    return ((y == 3 and 23 <= x <= 24) or (x == 24 and 3 <= y <= 10) or (y == 10 and 18 <= x <= 24)
            or (x == 18 and 10 <= y <= 13) or (y == 13 and 16 <= x <= 18))


# connections = what the plan teaches and what can be forgotten or go stale
CONN = {t for t in FLOOR if G[t[1]][t[0]] in 'PABE' or in_corr(*t) or t in {(4, 6), (19, 6)}}
PLAN_OPEN = {(7, 12), (11, 8)}            # the plan on the wall never changes
ORIG_OPEN = {(7, 12), (11, 8)}
MOVED_OPEN = {(7, 10), (12, 8)}
NB = [(1, 0), (-1, 0), (0, 1), (0, -1)]


def adj(t):
    return [(t[0] + dx, t[1] + dy) for dx, dy in NB if (t[0] + dx, t[1] + dy) in FLOOR]


def adj_goal(obj):
    return {n for n in adj(obj)} if obj in BLOCK else {obj}


def neighbors_of(obj):
    return {(obj[0] + dx, obj[1] + dy) for dx, dy in NB if (obj[0] + dx, obj[1] + dy) in FLOOR}


def room(t):
    x, y = t
    if 8 <= x <= 14 and 9 <= y <= 15:
        return 'foyer'
    if y == 7 and 2 <= x <= 21:
        return 'hall'
    return 'other'


class Run:
    def __init__(self, p, rng, variant='current'):
        self.p, self.rng, self.variant = p, rng, variant
        self.plug = {t: (t in ORIG_OPEN) for t in [(7, 12), (7, 10), (11, 8), (12, 8)]}
        self.med = self.key = self.dark = self.changed = False
        self.belief = {t for t in FLOOR if t not in CONN}
        for t in CONN:
            if G[t[1]][t[0]] == 'P' and t not in PLAN_OPEN:
                continue
            if rng.random() < p['p_enc']:
                self.belief.add(t)
        self.pos = (11, 14)
        self.time = rng.normal(8, 2) + 4  # opening dialog + first study of the plan
        self.steps = 0
        self.bumps = 0
        self.consults = 1
        self.consults_post = 0
        self.shots = self.hits = 0
        self.visited = {self.pos}
        self.verified_wall = set()
        self.plan_trust = 1.0
        self.halls = 0
        self.ver = 0
        self._cache = (None, None, None)

    # world truth
    def passable(self, t):
        if t not in FLOOR:
            return False
        c = G[t[1]][t[0]]
        if c == 'P':
            return self.plug[t]
        if c == 'A':
            return self.med
        if c == 'B':
            return self.key
        if c == 'E':
            return self.dark
        return True

    def dist_map(self, goals):
        key = (frozenset(goals), self.ver)
        if self._cache[0] == key:
            return self._cache[1]
        d = {g: 0 for g in goals if g in self.belief or g in FLOOR}
        q = deque(d)
        while q:
            t = q.popleft()
            for n in adj(t):
                if n in self.belief and n not in d:
                    d[n] = d[t] + 1
                    q.append(n)
        self._cache = (key, d, None)
        return d

    def step_time(self):
        return max(.3, self.rng.normal(.8, .12)) / self.p['speed']

    def encounter(self, extra=0):
        need, shots = 4, 0
        while need > 0 and shots < 30:
            shots += 1
            if self.rng.random() < self.p['aim']:
                need -= 1
        self.shots += shots
        self.hits += 4 - need
        self.time += shots * .7 + extra

    def forget(self):
        f = self.p['forget']
        if f <= 0:
            return
        for t in list(CONN & self.belief):
            if abs(t[0] - self.pos[0]) + abs(t[1] - self.pos[1]) > 2 and self.rng.random() < f:
                self.belief.discard(t)
                self.ver += 1

    def consult(self):
        self.consults += 1
        if self.changed:
            self.consults_post += 1
        self.time += max(2, self.rng.normal(7, 2))
        for t in CONN:
            if self.rng.random() < self.p['p_enc']:
                show = (t in PLAN_OPEN) if G[t[1]][t[0]] == 'P' else True
                if show and t in self.verified_wall and self.rng.random() < self.p['alpha']:
                    continue          # "I've seen that's a wall now"
                if show:
                    self.belief.add(t)
                else:
                    self.belief.discard(t)
        self.ver += 1

    def nav(self, goals, cap=1500):
        p, rng = self.p, self.rng
        for _ in range(cap):
            if self.pos in goals:
                return True
            # perception of what is right next to you
            for n in [(self.pos[0] + dx, self.pos[1] + dy) for dx, dy in NB]:
                tru = self.passable(n)
                if tru and n not in self.belief and n in FLOOR:
                    if G[n[1]][n[0]] == 'P' and rng.random() > p['alpha']:
                        continue
                    self.belief.add(n); self.ver += 1
                elif (not tru) and n in self.belief and G[n[1]][n[0]] == 'P' and rng.random() < p['alpha'] * .5:
                    self.belief.discard(n); self.ver += 1
            self.forget()
            d = self.dist_map(goals)
            here = d.get(self.pos)
            if here is not None:
                cand = [n for n in [(self.pos[0] + dx, self.pos[1] + dy) for dx, dy in NB] if n in d]
                ds = np.array([d[n] for n in cand], float)
                w = np.exp(-(ds - ds.min()) / max(p['tau'], 1e-3))
                nxt = cand[rng.choice(len(cand), p=w / w.sum())]
                if self.passable(nxt):
                    self.move(nxt)
                else:
                    if self.changed and nxt in ORIG_OPEN:
                        self.bumps += 1
                        self.verified_wall.add(nxt)
                        self.plan_trust *= .6
                    self.time += 1.0
                    if rng.random() < p['alpha']:
                        self.belief.discard(nxt); self.ver += 1
            else:
                if room(self.pos) == 'foyer' and rng.random() < .5 * self.plan_trust:
                    self.consult()
                    continue
                cand = [n for n in adj(self.pos) if self.passable(n)]
                w = np.array([3.0 if n not in self.visited else 1.0 for n in cand])
                self.move(cand[rng.choice(len(cand), p=w / w.sum())])
        self.stuck = getattr(self, 'stuck', 0) + 1
        return False

    def move(self, nxt):
        if room(nxt) == 'hall' and room(self.pos) != 'hall':
            self.halls += 1
            if self.rng.random() < .35:
                self.encounter()
        self.pos = nxt
        self.visited.add(nxt)
        self.steps += 1
        self.time += self.step_time()

    def play(self):
        p, rng = self.p, self.rng
        glove = False
        self.stuck = 0
        self.nav(adj_goal((2, 11))); self.med = True; self.ver += 1
        if rng.random() < p['p_glove']:
            self.nav(adj_goal((5, 13))); glove = True
        self.nav({(4, 7)})
        self.nav(adj_goal((6, 2))); self.key = True; self.ver += 1
        self.nav(adj_goal((2, 4)))
        self.nav({(19, 7)})
        self.nav(adj_goal((21, 2)))
        self.nav({(23, 3)})
        # the Architect: lights out, doorways move
        self.dark = self.changed = True
        for t in self.plug:
            self.plug[t] = t in MOVED_OPEN
        self.ver += 1
        self.encounter(extra=3)  # corridor ghoul
        self.nav({(14, 13)})
        t0, s0, h0, sh0 = self.time, self.steps, self.hits, self.shots
        if self.variant == 'errand':
            # proposed: the Architect scatters two mementos back into the wings
            self.nav(adj_goal((5, 13)))
            self.nav(adj_goal((2, 4)))
        elif not glove:
            self.nav(adj_goal((5, 13)))
        self.nav({(11, 12)})
        return dict(run_time=self.time, run_dist=self.steps * 2.0, consults=self.consults,
                    consults_post=self.consults_post, post_time=self.time - t0,
                    post_dist=(self.steps - s0) * 2.0, bumps=self.bumps,
                    accuracy=self.hits / max(1, self.shots), stuck=self.stuck)


# ---------------- populations (assumptions, stated plainly) ----------------
def logit(p):
    return np.log(p / (1 - p))


def sig(x):
    return 1 / (1 + np.exp(-x))


GROUPS = {
    # healthy older adults who play games
    'healthy': dict(p_enc=(.90, .55), alpha=(.60, .6), tau=(.25, .35), forget=(.0004, .5),
                    speed=(1.0, .15), aim=(.55, .5), p_glove=(.80, .6), iiv=.25),
    # prodromal AD / amnestic MCI: weaker encoding and map updating, more planning noise,
    # slightly slower, and noisier from day to day
    'prodromal': dict(p_enc=(.75, .55), alpha=(.38, .6), tau=(.40, .35), forget=(.0012, .5),
                      speed=(.90, .15), aim=(.50, .5), p_glove=(.65, .6), iiv=.50),
    # healthy older adults new to 3D games: cognition intact, controls are not
    'healthy_novice': dict(p_enc=(.86, .55), alpha=(.57, .6), tau=(.45, .35), forget=(.0005, .5),
                           speed=(.70, .15), aim=(.32, .5), p_glove=(.75, .6), iiv=.30),
}
PROB = ('p_enc', 'alpha', 'aim', 'p_glove')
BASE_PRODROMAL = dict(GROUPS['prodromal'])
KNOBS = dict(decline=1.0, effect=1.0)


def set_knobs(decline=1.0, effect=1.0):
    """effect scales the healthy-to-prodromal difference in every parameter; decline scales within-window decline."""
    KNOBS.update(decline=decline, effect=effect)
    h = GROUPS['healthy']
    for k, v in BASE_PRODROMAL.items():
        if k == 'iiv':
            GROUPS['prodromal'][k] = h[k] + effect * (v - h[k])
        else:
            GROUPS['prodromal'][k] = (h[k][0] + effect * (v[0] - h[k][0]), v[1])


def sample_person(g, rng):
    spec = GROUPS[g]
    out = {}
    out['iiv'] = spec['iiv']
    for k, v in spec.items():
        if k == 'iiv':
            continue
        m, s = v
        if k in PROB:
            out[k] = logit(m) + rng.normal(0, s)          # stored on logit scale
        elif k == 'speed':
            out[k] = max(.35, rng.normal(m, s))
        else:
            out[k] = np.log(m) + rng.normal(0, s)          # tau, forget on log scale
    return out


def session_params(person, g, s, rng):
    """Parameters for session s (0..). Includes practice, decline and day-to-day noise."""
    iiv = person['iiv']
    q = {}
    prac = 1 - .82 ** s                              # familiarity with this house
    ctrl = 1 - .75 ** s                              # familiarity with the controls
    decline = s * KNOBS['decline'] if g == 'prodromal' else 0
    q['p_enc'] = sig(person['p_enc'] + 1.6 * prac * (1 if g != 'prodromal' else .55) - .06 * decline + rng.normal(0, iiv))
    q['alpha'] = sig(person['alpha'] - .07 * decline + rng.normal(0, iiv))
    q['p_glove'] = sig(person['p_glove'] + .8 * prac + rng.normal(0, iiv * .5))
    q['aim'] = sig(person['aim'] + (1.0 if g == 'healthy_novice' else .3) * ctrl + rng.normal(0, .15))
    tau_ctrl = (np.log(.25) - person['tau']) * ctrl * .8 if g == 'healthy_novice' else 0
    q['tau'] = float(np.exp(person['tau'] + tau_ctrl + .04 * decline + rng.normal(0, iiv * .6)))
    q['forget'] = float(np.exp(person['forget'] + .05 * decline + rng.normal(0, iiv * .5)))
    sp = person['speed'] + (.25 * ctrl if g == 'healthy_novice' else .05 * ctrl)
    q['speed'] = max(.35, sp + rng.normal(0, .05 + iiv * .1))
    return q


def one(args):
    g, i, n_sess, variant, seed, knobs = args
    set_knobs(**knobs)
    rng = np.random.default_rng(seed)
    person = sample_person(g, rng)
    rows = []
    for s in range(n_sess):
        q = session_params(person, g, s, rng)
        r = Run(q, rng, variant).play()
        r.update(group=g, pid=i, session=s, variant=variant)
        rows.append(r)
    return rows


def simulate(n_per_group, n_sess, variant, seed=0):
    jobs = [(g, i, n_sess, variant, seed * 10_000_000 + gi * 100_000 + i, dict(KNOBS))
            for gi, g in enumerate(GROUPS) for i in range(n_per_group)]
    with Pool() as pool:
        out = pool.map(one, jobs, chunksize=8)
    return [r for rows in out for r in rows]
