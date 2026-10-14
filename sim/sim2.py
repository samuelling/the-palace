"""
Monte Carlo players for the three-chapter beta.

Agents play the real seeded layouts exported from levels.js (layouts.json) and produce the
same measures the game logs: route choices at junctions scored against the true layout,
walking into moved doorways, distance after each rearrangement, homing error after the
blackout, veil choices in the palace, and shoot-or-pass decisions about standing figures.
Motor and control skill (speed, wall scrapes, aim) are generated separately so they can be
used as covariates, the way the game keeps them apart.

Assumption-driven sensitivity analysis, not validation. Group parameters are in GROUPS.
"""
import json, os
import numpy as np
from collections import deque
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
LAY = json.load(open(os.path.join(HERE, 'layouts.json')))
N4 = [(1, 0), (-1, 0), (0, 1), (0, -1)]


def sig(x): return 1 / (1 + np.exp(-x))
def logit(p): return np.log(p / (1 - p))


# ---------------------------------------------------------------- grid world
class World:
    def __init__(self, lay):
        self.G, self.P, self.room = lay['G'], lay['planG'], lay['roomGrid']
        self.H, self.W = len(self.G), len(self.G[0])
        self.block = {(p['x'], p['y']) for p in lay['props'] if p['block']}
        self.plan_plugs = {tuple(map(int, k.split(','))): v for k, v in lay['plugs'].items()}
        self.plugs = dict(self.plan_plugs)
        self.doors_open = set()
        self.ver = 0

    def ch(self, x, y):
        return self.G[y][x] if 0 <= y < self.H and 0 <= x < self.W else '#'

    def truth(self, t):
        x, y = t; c = self.ch(x, y)
        if c in '#V' or t in self.block: return False
        if c == 'P': return self.plugs[t]
        if c == 'D': return t in self.doors_open
        return True

    def plan(self, t):
        x, y = t; c = self.P[y][x] if 0 <= y < self.H and 0 <= x < self.W else '#'
        if c in '#V' or t in self.block: return False
        if c == 'P': return self.plan_plugs[t]
        return True

    def nbrs(self, t):
        return [(t[0] + dx, t[1] + dy) for dx, dy in N4]

    def roomname(self, t):
        x, y = t
        return self.room[y][x] if 0 <= y < self.H and 0 <= x < self.W else None

    def adj_goal(self, x, y):
        return {n for n in self.nbrs((x, y)) if self.truth(n)} or {(x, y)}


def bfs_dist(goals, ok):
    d = {g: 0 for g in goals}; q = deque(goals)
    while q:
        t = q.popleft()
        for dx, dy in N4:
            n = (t[0] + dx, t[1] + dy)
            if n not in d and ok(n):
                d[n] = d[t] + 1; q.append(n)
    return d


# ---------------------------------------------------------------- navigating agent
class Nav:
    """Believed map from the plan: each connection is known-open, known-closed or unknown.
    Plans optimistically through unknowns (at a cost), sees down straight corridors,
    updates on contradiction at rate alpha, forgets connections, and can re-read the stale plan."""

    def __init__(self, world, conn, p, rng, start, safe_rooms):
        self.w, self.conn, self.p, self.rng = world, conn, p, rng
        self.safe = set(safe_rooms)
        self.known = {}
        for t in conn:
            if rng.random() < p['p_enc']: self.known[t] = world.plan(t)
        self.pos = start
        self.steps = 0; self.time = 0.0
        self.bumps = 0; self.consults = 0; self.junctions = []
        self.verified_wall = set(); self.trust = 1.0
        self.ver = 0; self._cache = None; self._tcache = None
        self.changed = False

    def cost(self, t):
        if t in self.conn:
            k = self.known.get(t)
            return 1 if k is True else (None if k is False else 3)
        return 1 if self.w.plan(t) else None

    def dist(self, goals):
        key = (frozenset(goals), self.ver)
        if self._cache and self._cache[0] == key: return self._cache[1]
        import heapq
        d = {g: 0 for g in goals}; h = [(0, g) for g in goals]
        while h:
            dd, t = heapq.heappop(h)
            if dd > d.get(t, 1e9): continue
            for dx, dy in N4:
                n = (t[0] + dx, t[1] + dy); c = self.cost(t)
                if c is None and t not in goals: continue
                c2 = self.cost(n)
                if c2 is None: continue
                nd = dd + (c if c else 1)
                if nd < d.get(n, 1e9): d[n] = nd; heapq.heappush(h, (nd, n))
        self._cache = (key, d); return d

    def tdist(self, goals):
        key = (frozenset(goals), self.w.ver)
        if self._tcache and self._tcache[0] == key: return self._tcache[1]
        d = bfs_dist(list(goals), self.w.truth)
        self._tcache = (key, d); return d

    def see(self):
        """Look down each straight line until something blocks the view."""
        w, p, rng = self.w, self.p, self.rng
        for dx, dy in N4:
            t = self.pos
            for _ in range(5):
                t = (t[0] + dx, t[1] + dy)
                tru = w.truth(t)
                if t in self.conn and self.known.get(t) != tru:
                    if w.ch(*t) == 'P' and self.known.get(t) is not None and rng.random() > p['alpha']: pass
                    else: self.known[t] = tru; self.ver += 1
                if not tru: break

    def consult(self):
        self.consults += 1
        self.time += max(2, self.rng.normal(7, 2))
        for t in self.conn:
            if self.rng.random() < self.p['p_enc']:
                if t in self.verified_wall and self.rng.random() < self.p['alpha']: continue
                self.known[t] = self.w.plan(t)
        self.ver += 1

    def is_junction(self, t):
        deg = sum(self.w.truth(n) for n in self.w.nbrs(t))
        diag = sum(self.w.truth((t[0] + a, t[1] + b)) for a, b in [(1, 1), (1, -1), (-1, 1), (-1, -1)])
        return deg >= 3 and diag <= 1

    def step_time(self):
        return max(.3, self.rng.normal(.8, .12)) / self.p['speed']

    def nav(self, goals, cap=1400):
        p, rng, w = self.p, self.rng, self.w
        goals = set(goals); last = None
        for _ in range(cap):
            if self.pos in goals: return True
            self.see()
            if p['forget'] > 0:
                for t in list(self.known):
                    if abs(t[0] - self.pos[0]) + abs(t[1] - self.pos[1]) > 2 and rng.random() < p['forget']:
                        del self.known[t]; self.ver += 1
            d = self.dist(goals)
            cand = [n for n in w.nbrs(self.pos) if n in d]
            if not cand:
                if w.roomname(self.pos) in self.safe and rng.random() < .5 * self.trust:
                    self.consult(); continue
                cand = [n for n in w.nbrs(self.pos) if w.truth(n)]
                if not cand: return False
                self.move(cand[rng.integers(len(cand))]); continue
            ds = np.array([d[n] + (2 if n == last else 0) for n in cand], float)
            wts = np.exp(-(ds - ds.min()) / max(p['tau'], 1e-3))
            nxt = cand[rng.choice(len(cand), p=wts / wts.sum())]
            if w.truth(nxt):
                if self.is_junction(self.pos):
                    td = self.tdist(goals)
                    opts = [n for n in w.nbrs(self.pos) if w.truth(n)]
                    m = min(td.get(n, 1e9) for n in opts)
                    self.junctions.append((td.get(nxt, 1e9) == m, self.changed))
                last = self.pos; self.move(nxt)
            else:
                if self.changed and w.ch(*nxt) == 'P' and w.plan(nxt):
                    self.bumps += 1; self.verified_wall.add(nxt); self.trust *= .6
                self.time += 1.0
                if rng.random() < p['alpha'] and nxt in self.conn:
                    self.known[nxt] = False; self.ver += 1
        return False

    def move(self, nxt):
        self.pos = nxt; self.steps += 1; self.time += self.step_time()


def encounter(p, rng):
    need, shots = 4, 0
    while need > 0 and shots < 30:
        shots += 1
        if rng.random() < p['aim']: need -= 1
    return shots, 4 - need


# ---------------------------------------------------------------- chapter 1: the East Wing
def chapter_east(lay, p, rng):
    w = World(lay)
    in_corr = lambda x, y: (y == 3 and 23 <= x <= 24) or (x == 24 and 3 <= y <= 10) or (y == 10 and 18 <= x <= 24) or (x == 18 and 10 <= y <= 13) or (y == 13 and 16 <= x <= 18)
    conn = {(x, y) for y in range(w.H) for x in range(w.W) if w.ch(x, y) in 'PD' or in_corr(x, y)}
    a = Nav(w, conn, p, rng, (11, 14), ['Foyer'])
    it = {i['id']: i for i in lay['items']}
    g = lambda i: w.adj_goal(it[i]['x'], it[i]['y'])
    shots = hits = 0
    a.nav(g('medallion')); w.doors_open.add((4, 6)); w.ver += 1
    have = {'medallion'}
    if rng.random() < p['p_glove']: a.nav(g('glove')); have.add('glove')
    a.nav({(4, 7)}); a.nav(g('brass')); w.doors_open.add((19, 6)); w.ver += 1
    a.nav(g('music')); have.add('music'); a.nav({(19, 7)}); a.nav(g('locket')); have.add('locket')
    s, h = encounter(p, rng); shots += s; hits += h
    a.nav({(23, 3)})
    for t in w.plugs: w.plugs[t] = t in {(7, 10), (12, 8)}
    w.doors_open.add((15, 13)); w.ver += 1; a.changed = True
    a.nav({(14, 13)})
    t0, s0 = a.time, a.steps
    er = lay['errand']; have.discard(er['item'])
    a.nav({tuple(er['spot'])})
    if 'glove' not in have: a.nav(g('glove'))
    a.nav({(11, 12), (11, 13), (10, 12), (12, 12)})
    pj = [o for o, c in a.junctions if c]
    return dict(c1_time=a.time, c1_dist=a.steps * 2, c1_post_dist=(a.steps - s0) * 2, c1_post_time=a.time - t0, c1_bumps=a.bumps,
                c1_jopt=np.mean([o for o, c in a.junctions]) if a.junctions else np.nan, c1_jopt_post=np.mean(pj) if pj else np.nan,
                c1_consults=a.consults, shots=shots, hits=hits)


# ---------------------------------------------------------------- chapter 2: the Conservatory
def chapter_conservatory(lay, p, rng):
    w = World(lay)
    lawn = lay['lawn']
    in_lawn = lambda x, y: lawn[0] <= x <= lawn[2] and lawn[1] <= y <= lawn[3]
    conn = {(x, y) for y in range(2, 17) for x in range(2, 27) if ((x % 2 == 1) != (y % 2 == 1)) and not in_lawn(x, y)} | {t for t in w.plan_plugs}
    a = Nav(w, conn, p, rng, (4, 21), ['Office'])
    roses = [i for i in lay['items'] if i['kind'] == 'rose']
    todo = list(roses)
    while todo:
        d = a.dist({(a.pos)})
        todo.sort(key=lambda i: min([abs(i['x'] - a.pos[0]) + abs(i['y'] - a.pos[1])]))
        r = todo.pop(0); a.nav(w.adj_goal(r['x'], r['y']))
    a.nav(w.adj_goal(30, 8))
    a.nav({(x, y) for x in range(12, 17) for y in range(7, 12) if abs(x - 14) + abs(y - 9) <= 2 and w.truth((x, y))})
    # blackout homing: walk back to the lawn gate with accumulating path-integration noise
    L = rng.uniform(3, 8) * 2.0
    sd = np.sqrt(p['pi_noise'] ** 2 * L + .5 ** 2)
    homing_err = float(np.hypot(rng.normal(p['pi_bias'], sd), rng.normal(0, sd)))
    for t in lay['regrow']['close']: w.plugs[tuple(t)] = False
    for t in lay['regrow']['open']: w.plugs[tuple(t)] = True
    w.ver += 1; a.changed = True
    t0, s0 = a.time, a.steps
    office = {(2, 17), (2, 18)}
    tr_short = bfs_dist(list(office), w.truth).get(a.pos)
    a.nav(office)
    tr_eff = (a.steps - s0) / max(1, tr_short) if tr_short else np.nan
    out = {}
    if KNOBS['design'] == 'v4':
        # lantern trials: outbound path, then return to the start in the dark
        trials = []
        for _ in range(KNOBS.get('lanterns', 3)):
            Lp = rng.uniform(4, 22) if KNOBS.get('lanterns', 3) > 3 else rng.uniform(6, 16); c = rng.uniform(.45, .85) * Lp       # outbound length and straight-line homing distance
            g = p['pi_gain'] * np.exp(-p['pi_leak'] * Lp)
            sd = np.sqrt(p['pi_noise'] ** 2 * Lp + p['pi_rep'] ** 2)
            ex, ey = (g - 1) * c + rng.normal(0, sd), rng.normal(0, sd)
            trials.append((Lp, float(np.hypot(ex, ey))))
        homing_err = float(np.mean([e for _, e in trials])); out['_lantern'] = trials
        # reward revaluation: the key is at a statue already visited; the maze is as it is now
        trs, rrs = [tr_eff], []
        for pair in range(KNOBS.get('pairs', 1)):
            if pair > 0:
                # another unseen regrowth, then back to the office
                for t in list(w.plugs): w.plugs[t] = not w.plugs[t]
                w.ver += 1; a.pos = (14, 9) if w.truth((14, 10)) else a.pos
                sh = bfs_dist(list(office), w.truth).get(a.pos); s2 = a.steps; a.nav(office)
                if sh: trs.append((a.steps - s2) / max(1, sh))
            ks = roses[rng.integers(len(roses))]; goal = w.adj_goal(ks['x'], ks['y'])
            rr_short = bfs_dist(list(goal), w.truth).get(a.pos); s1 = a.steps
            a.nav(goal)
            if rr_short: rrs.append((a.steps - s1) / max(1, rr_short))
            a.nav(office)
        tr_eff = float(np.nanmean(trs)); rr_eff = float(np.nanmean(rrs)) if rrs else np.nan
        out.update(tr_eff=tr_eff, rr_eff=rr_eff, trrr=np.log(tr_eff) - np.log(rr_eff) if tr_eff == tr_eff and rr_eff == rr_eff and tr_eff > 0 and rr_eff > 0 else np.nan)
    pj = [o for o, c in a.junctions if c]
    return dict(**out, c2_time=a.time, c2_dist=a.steps * 2, c2_post_dist=(a.steps - s0) * 2, c2_bumps=a.bumps, homing_err=homing_err,
                c2_jopt=np.mean([o for o, c in a.junctions]) if a.junctions else np.nan, c2_jopt_post=np.mean(pj) if pj else np.nan, c2_consults=a.consults)


# ---------------------------------------------------------------- chapter 3: the Palace (veils)
def chapter_palace(lay, p, rng):
    rooms = [d['name'] for d in lay['roomDefs']]
    perm = list(lay['perm0'])                        # perm[veil] = room index
    belief = {}                                      # veil -> believed room index
    for v in range(6):
        if rng.random() < p['p_enc']: belief[v] = lay['perm0'][v]
    where = {}                                       # memory id -> believed room index
    item_room = {i['id']: rooms.index(lay['roomGrid'][i['y']][i['x']]) for i in lay['items'] if i['kind'] == 'memory'}
    home = {i['id']: rooms.index(i['home']) for i in lay['items'] if i['kind'] == 'memory'}
    t = 0.0; veils = 0; first_correct = []; stale = []; per_trip = []; prev = None; placed = 0; trust = 1.0

    def cross(v):
        nonlocal t, veils
        veils += 1; t += rng.normal(9, 2) / p['speed']
        r = perm[v]
        if belief.get(v) != r and rng.random() < p['alpha']: belief[v] = r
        elif v not in belief and rng.random() < p['p_enc']: belief[v] = r
        for m, ri in item_room.items():
            if ri == r and m not in where and rng.random() < p['p_enc']: where[m] = r
        return r

    def come_back(r):
        # stepping out of room r lands you at the veil that now leads to it: a local transition observation
        v = perm.index(r)
        if belief.get(v) != r and rng.random() < p['alpha']: belief[v] = r

    def choose(target_room, tried):
        cands = [v for v, r in belief.items() if r == target_room and v not in tried]
        if cands and rng.random() > min(.5, p['tau']):
            return cands[0]
        rest = [v for v in range(6) if v not in tried] or list(range(6))
        return rest[rng.integers(len(rest))]

    shuffles = 0

    def reshuffle():
        nonlocal perm, prev, shuffles
        prev = perm[:]
        if shuffles % 2 == 0:
            a_, b_ = rng.choice(6, 2, replace=False); perm[a_], perm[b_] = perm[b_], perm[a_]
        else:
            k = int(rng.integers(1, 6)); perm = [prev[(i + k) % 6] for i in range(6)]
        shuffles += 1

    v3 = KNOBS['design'] in ('v3', 'v4')
    seek = {'RR': [], 'TR': []}; cond_off = int(rng.integers(2)); done = set()
    order = list(rng.permutation(list(item_room.keys())))
    for m in order:
        done.add(m)
        # find the memory
        tried = set()
        for _ in range(12):
            if m in where: v = choose(where[m], tried)
            else: v = choose(-1, tried)
            tried.add(v); r = cross(v)
            if r == item_room[m]: break
        come_back(item_room[m])
        if v3: reshuffle()                           # the palace moves as you pick a memory up
        # carry it home
        tried = set(); n = 0
        for _ in range(12):
            v = choose(home[m], tried); tried.add(v); n += 1
            if n == 1:
                first_correct.append(perm[v] == home[m])
                if prev is not None:
                    stale_v = prev.index(home[m]) if home[m] in prev else None
                    stale.append(v == stale_v and prev.index(home[m]) != perm.index(home[m]))
            r = cross(v)
            if r == home[m]: break
        per_trip.append(n)
        placed += 1
        come_back(home[m])
        if KNOBS['design'] == 'v4':
            # announced goal change: one waiting memory moves to a new room; on TR events the veils move too
            waiting = [mm for mm in order if mm not in done and mm != m]
            if waiting:
                mm = waiting[rng.integers(len(waiting))]
                newroom = int(rng.choice([r for r in range(6) if r != item_room[mm] and r != home[mm]]))
                item_room[mm] = newroom; where[mm] = newroom
                cond = 'TR' if (placed + cond_off) % 2 else 'RR'
                if cond == 'TR': reshuffle()
                v = choose(newroom, set())
                seek[cond].append(perm[v] == newroom)
        else:
            reshuffle()
        for mm in list(where):
            if rng.random() < p['forget'] * 400: where.pop(mm)
    h2 = np.nan
    if KNOBS['design'] == 'v3':
        L = rng.uniform(3, 7) * 2.0; sd = np.sqrt(p['pi_noise'] ** 2 * L + .5 ** 2)
        h2 = float(np.hypot(rng.normal(p['pi_bias'], sd), rng.normal(0, sd)))
    rr = float(np.mean(seek['RR'])) if seek['RR'] else np.nan; trc = float(np.mean(seek['TR'])) if seek['TR'] else np.nan
    return dict(c3_rr=rr, c3_tr=trc, c3_seek_contrast=rr - trc if rr == rr and trc == trc else np.nan, c3_homing=h2, c3_time=t, c3_veils=veils, c3_first_correct=float(np.mean(first_correct)), c3_stale=float(np.mean(stale)) if stale else np.nan,
                c3_per_trip=float(np.mean(per_trip)))


# ---------------------------------------------------------------- standing figures: a diffusion decision
def figures(lays, p, rng, scale=1.0):
    out = []
    caps = [4, 5, 4] if KNOBS['design'] == 'v2' else [99, 99, 99]
    for lay, cap in zip(lays, caps):
        for f in lay['figures'][:cap]:
            sleeper = f['type'] == 'sleeper'
            sway = min(.07, max(.005, f['sway'] * (scale if KNOBS['design'] in ('v3', 'v4') else 1)))
            v = p['k'] * (sway / .03) * .22 if sleeper else -p['k'] * .14
            a, z, dt, s = p['a'], p['a'] / 2, .005, .1
            x, tt = z, 0.0
            while 0 < x < a and tt < 6:
                x += v * dt + s * np.sqrt(dt) * rng.normal(); tt += dt
            shoot = x >= a
            out.append((shoot == sleeper, tt + p['ter'] + rng.normal(0, .05)))
    return out


def ez(trials):
    n = len(trials); pc = np.mean([c for c, _ in trials])
    if pc >= 1: pc = 1 - 1 / (2 * n)
    if pc <= .5: pc = .5 + 1 / (2 * n)
    rts = np.array([r for c, r in trials if c]); mrt, vrt = rts.mean(), max(rts.var(ddof=1), 1e-4)
    s = .1; L = np.log(pc / (1 - pc)); x = L * (L * pc * pc - L * pc + pc - .5) / vrt
    v = np.sign(pc - .5) * s * x ** .25; aa = s * s * L / v; y = -v * aa / s ** 2
    mdt = (aa / (2 * v)) * (1 - np.exp(y)) / (1 + np.exp(y))
    return v, aa, mrt - mdt


# ---------------------------------------------------------------- populations
GROUPS = {
    'healthy': dict(pi_gain=(1.0, .08), pi_leak=(.004, .4), pi_rep=(.5, .2), p_enc=(.90, .55), alpha=(.60, .6), tau=(.25, .35), forget=(.0004, .5), pi_noise=(.30, .25), pi_bias=(.2, .3),
                    k=(1.0, .2), a=(.12, .15), ter=(.50, .12), speed=(1.0, .15), scrape=(1.0, .3), aim=(.55, .5), p_glove=(.80, .6), iiv=.25),
    'prodromal': dict(pi_gain=(.95, .08), pi_leak=(.012, .4), pi_rep=(.55, .2), p_enc=(.75, .55), alpha=(.38, .6), tau=(.40, .35), forget=(.0012, .5), pi_noise=(.55, .25), pi_bias=(.4, .3),
                      k=(.75, .2), a=(.13, .15), ter=(.56, .12), speed=(.90, .15), scrape=(1.25, .3), aim=(.50, .5), p_glove=(.65, .6), iiv=.50),
    'healthy_novice': dict(pi_gain=(.9, .08), pi_leak=(.005, .4), pi_rep=(.85, .2), p_enc=(.86, .55), alpha=(.57, .6), tau=(.32, .35), forget=(.0005, .5), pi_noise=(.38, .25), pi_bias=(.25, .3),
                           k=(.95, .2), a=(.12, .15), ter=(.72, .12), speed=(.70, .15), scrape=(2.6, .3), aim=(.32, .5), p_glove=(.75, .6), iiv=.30),
}
PROB = {'p_enc', 'alpha', 'aim', 'p_glove'}
LOGN = {'tau', 'forget', 'pi_noise', 'k', 'a', 'ter', 'scrape', 'pi_leak', 'pi_rep'}
BASE = {g: dict(v) for g, v in GROUPS.items()}
KNOBS = dict(decline=1.0, effect=1.0, design='v2', profile='general')


PROFILES = {
    'general': {},
    # deficit concentrated in updating a map that has changed, with map memory itself near normal
    'transition': dict(p_enc=(.88, .55), forget=(.0006, .5), alpha=(.30, .6), tau=(.30, .35)),
}


def set_knobs(decline=1.0, effect=1.0, design='v2', profile='general', **extra):
    KNOBS.update(decline=decline, effect=effect, design=design, profile=profile, **extra)
    h = BASE['healthy']
    src = dict(BASE['prodromal']); src.update(PROFILES[profile])
    for k, v in src.items():
        if k == 'iiv': GROUPS['prodromal'][k] = h[k] + effect * (v - h[k])
        else: GROUPS['prodromal'][k] = (h[k][0] + effect * (v[0] - h[k][0]), v[1])


def sample_person(g, rng):
    spec = GROUPS[g]; out = {'iiv': spec['iiv']}
    for k, v in spec.items():
        if k == 'iiv': continue
        m, s = v
        if k in PROB: out[k] = logit(m) + rng.normal(0, s)
        elif k in LOGN: out[k] = np.log(m) + rng.normal(0, s * (.5 if k in ('k', 'a', 'ter', 'scrape') else 1))
        elif k == 'speed': out[k] = max(.35, rng.normal(m, s))
        else: out[k] = rng.normal(m, s)
    return out


def session_params(person, g, s, rng):
    iiv = person['iiv']; q = {}
    prac = 1 - .82 ** s; ctrl = 1 - .75 ** (s + (1 if KNOBS['design'] in ('v3', 'v4') else 0))
    dec = s * KNOBS['decline'] if g == 'prodromal' else 0
    nov = g == 'healthy_novice'
    q['p_enc'] = sig(person['p_enc'] + .6 * prac * (.55 if g == 'prodromal' else 1) - .06 * dec + rng.normal(0, iiv))
    q['alpha'] = sig(person['alpha'] - .07 * dec + rng.normal(0, iiv))
    q['p_glove'] = sig(person['p_glove'] + .8 * prac + rng.normal(0, iiv * .5))
    q['aim'] = sig(person['aim'] + (1.0 if nov else .3) * ctrl + rng.normal(0, .15))
    q['tau'] = float(np.exp(person['tau'] + (np.log(.25) - person['tau']) * ctrl * .6 * nov + .04 * dec + rng.normal(0, iiv * .6)))
    q['forget'] = float(np.exp(person['forget'] + .05 * dec + rng.normal(0, iiv * .5)))
    q['pi_noise'] = float(np.exp(person['pi_noise'] + .03 * dec - .15 * ctrl * nov + rng.normal(0, iiv * .4)))
    q['pi_bias'] = person['pi_bias']
    q['pi_gain'] = person['pi_gain']; q['pi_leak'] = float(np.exp(person['pi_leak'] + .03 * dec))
    q['pi_rep'] = float(np.exp(person['pi_rep'] - (.35 * ctrl if nov else .05 * ctrl) + rng.normal(0, .1)))
    q['k'] = float(np.exp(person['k'] - .02 * dec + rng.normal(0, iiv * .3)))
    q['a'] = float(np.exp(person['a'] + rng.normal(0, .05)))
    q['ter'] = float(np.exp(person['ter'] - (.25 * ctrl if nov else .03 * ctrl) + rng.normal(0, .05)))
    q['speed'] = max(.35, person['speed'] + (.25 * ctrl if nov else .05 * ctrl) + rng.normal(0, .05 + iiv * .1))
    q['scrape'] = float(np.exp(person['scrape'] - (.6 * ctrl if nov else .1 * ctrl) + rng.normal(0, .15)))
    return q


def play_session(q, rng, scale=1.0):
    i = rng.integers(len(LAY['east']))
    lays = [LAY['east'][i], LAY['conservatory'][rng.integers(80)], LAY['palace'][rng.integers(80)]]
    r = {}
    r.update(chapter_east(lays[0], q, rng)); r.update(chapter_conservatory(lays[1], q, rng)); r.update(chapter_palace(lays[2], q, rng))
    f = figures(lays, q, rng, scale)
    r['fig_acc'] = float(np.mean([c for c, _ in f])); r['fig_rt'] = float(np.median([t for _, t in f])); r['_fig'] = f
    r['total_time'] = r['c1_time'] + r['c2_time'] + r['c3_time']; r['total_dist'] = r['c1_dist'] + r['c2_dist']
    r['speed'] = q['speed'] * 2.5 * rng.normal(1, .03); r['scrape_rate'] = q['scrape'] * rng.normal(1, .15)
    r['aim'] = r['hits'] / max(1, r['shots'])
    r['homing_mean'] = float(np.nanmean([r['homing_err'], r['c3_homing']]))
    return r


def one(args):
    g, i, n_sess, seed, knobs = args
    set_knobs(**knobs); rng = np.random.default_rng(seed)
    person = sample_person(g, rng); rows = []; scale = 1.0
    for s in range(n_sess):
        q = session_params(person, g, s, rng)
        r = play_session(q, rng, scale); r.update(group=g, pid=i, session=s, scale=scale); rows.append(r)
        acc = r['fig_acc']; scale = max(.4, min(2.5, scale * (.8 if acc > .85 else 1.25 if acc < .65 else 1)))
    return rows


def simulate(n_per_group, n_sess, seed=0):
    jobs = [(g, i, n_sess, seed * 10_000_000 + gi * 100_000 + i, dict(KNOBS)) for gi, g in enumerate(GROUPS) for i in range(n_per_group)]
    with Pool() as pool:
        out = pool.map(one, jobs, chunksize=4)
    return [r for rows in out for r in rows]
