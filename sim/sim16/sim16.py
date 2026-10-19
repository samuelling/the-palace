"""
Monte Carlo players for the 16-bit version (mixed top-down and first-person views).

Agents play layouts exported from the game's own generator (export16.js -> layouts16.json):
the East Wing as a graph of rooms with intra-room walking distances, the Conservatory maze as a
graph of cells, the lantern trials on the real lawn geometry, the palace glimpse tests, and the
sentinel decisions. The two adaptive models (lantern path integration, palace glimpse integration)
run the same grid-posterior design optimisation as ado.js, ported to numpy.

Populations and session dynamics come from sim2.py so results compare with earlier versions.
Every design choice that tuning may change is a key in DESIGN.

Assumption-driven sensitivity analysis, not validation.
"""
import json, os, sys
import numpy as np
from collections import deque
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import sim2  # noqa: E402

LAY = json.load(open(os.path.join(HERE, 'layouts16.json')))

BASE_DESIGN = dict(
    lantern_trials=5,      # lantern returns per session
    lawn='base',           # 'base' (17 x 17 tiles, legs up to 7 m) or 'large' (23 x 20, legs up to 9 m)
    pi_view='fp',          # blackouts at eye level ('fp') or top-down ('top')
    maze_view='fp',        # maze walked at eye level or top-down
    maze_closures=2,       # regrown hedges
    east_changes=1,        # times the Architect moves doors and hides a memento
    east_loops=2,          # extra doors beyond a spanning tree (more route choices)
    palace_tests=11,       # glimpse tests per session
    swap_min=0.0,          # minimum share of swaps among adaptive palace tests
    sentinels=12,          # top-down sentinel decisions per session
    rt_timing='sight',     # sentinel RT from first sight ('sight', as built) or from entering the decision zone ('zone')
    ado=True,
    pi_model='v1',         # lantern model: 'v1' (as built: accumulating isotropic noise, side bias); 'v2' (A5, calibrated on
                           # Howett/Castegnaro triangle completion: gain, leak, angular gain on turns, distance and direction noise);
                           # 'v3' (H5, best across triangle completion and Stangl et al. 2020: constant direction noise plus
                           # positional noise accumulating with distance walked)
    sentinel_cap=False,    # True: cap the assumed prodromal sentinel deficits at the size of the whole young-to-old ageing effect
                           # on perceptual drift (meta-analysis, Theisen et al. 2021: g = -.61) and give non-decision time d = .6
    pi_source='assumed',   # v2 only: 'assumed' keeps sim2-style group shifts, 'data' draws healthy and prodromal from pi_calib.json
)
DESIGN = dict(BASE_DESIGN)


# ============================================================ adaptive design (port of ado.js)
class Grid:
    def __init__(self, axes):
        self.names = list(axes); self.axes = axes
        mesh = np.meshgrid(*[np.array(axes[n], float) for n in self.names], indexing='ij')
        self.cols = {n: m.ravel() for n, m in zip(self.names, mesh)}
        self.N = mesh[0].size; self.logp = np.zeros(self.N)

    def w(self):
        p = np.exp(self.logp - self.logp.max()); return p / p.sum()

    def entropy(self):
        w = self.w(); w = w[w > 1e-300]; return float(-(w * np.log(w)).sum())

    def mean(self, n): return float((self.w() * self.cols[n]).sum())

    def drift(self, eps=.3): self.logp = np.log((1 - eps) * self.w() + eps / self.N)


LAX = dict(acc=[.1, .2, .3, .4, .55, .7, .9, 1.2], rep=[.2, .35, .5, .7, .9, 1.2, 1.6], gain=[.75, .85, .95, 1.05, 1.15], leak=[0, .006, .012, .02, .03], bias=[-24, -12, 0, 12, 24])
LAX2 = dict(gain=[.4, .55, .7, .85, 1.0, 1.15], leak=[-.03, 0, .02, .05, .08], g2=[.3, .5, .7, .85, 1.0, 1.15, 1.35], sigma=[.4, .7, 1.1, 1.7, 2.6], nu=list(np.radians([8, 15, 25, 40, 60, 90])))   # matches ado.js
LAX3 = dict(gain=[.4, .55, .7, .85, 1.0, 1.15], leak=[-.03, 0, .02, .05, .08], g2=[.3, .5, .7, .85, 1.0, 1.15, 1.35], nu0=list(np.radians([5, 12, 20, 30, 45, 65])), a=[.1, .2, .35, .55, .8])   # matches ado.js
PAX = dict(rho=[.05, .2, .35, .5, .65, .8, .95], alpha=[.05, .2, .35, .5, .65, .8, .95], m=[.2, .35, .5, .65, .8, .9, .97])


def path_geom(lens, turns, g2):
    """Mental homing for a path walked as legs `lens` with turns `turns` (degrees, clockwise positive, as in the game) when every
    turn is registered times g2. Returns (direction error of the mental homing response, radians clockwise positive, measured
    against the true homing direction; mental home distance). g2 may be an array."""
    g2 = np.atleast_1d(np.asarray(g2, float)); tr = np.radians(np.asarray(turns, float))
    def walk(k):
        h = np.zeros_like(g2); x = np.zeros_like(g2); y = np.zeros_like(g2)
        for i, ln in enumerate(lens):
            if i: h = h + k * tr[i - 1]
            x = x + ln * np.sin(h); y = y + ln * np.cos(h)
        return x, y, h
    xt, yt, ht = walk(np.ones_like(g2)); xm, ym, hm = walk(g2)
    turn_true = np.arctan2(-xt, -yt) - ht; turn_m = np.arctan2(-xm, -ym) - hm
    err = (turn_m - turn_true + np.pi) % (2 * np.pi) - np.pi
    return err, np.hypot(xm, ym)


def v2_pred(C, geom):
    L, c, lens, turns = geom
    rot, cm = path_geom(lens, turns, C['g2']); R = C['gain'] * np.exp(-C['leak'] * L) * cm
    return R, rot


def lantern_ll2(G, geom, er, et):
    """Return distance ~ N(R, sigma), direction error ~ N(rot, nu); observations in the true-home frame (er radial, et clockwise)."""
    C = G.cols; L, c = geom[0], geom[1]; R, rot = v2_pred(C, geom)
    er = np.atleast_1d(er)[:, None]; et = np.atleast_1d(et)[:, None]
    r = np.hypot(c + er, et); th = np.arctan2(et, c + er); d = (th - rot + np.pi) % (2 * np.pi) - np.pi
    return -np.log(2 * np.pi * C['sigma'] * C['nu']) - (r - R) ** 2 / (2 * C['sigma'] ** 2) - d ** 2 / (2 * C['nu'] ** 2)


def lantern_eig2(G, geom, rng, S=20):
    w = G.w(); H0 = -(w[w > 1e-300] * np.log(w[w > 1e-300])).sum()
    u = (rng.random() + np.arange(S)) / S; idx = np.minimum(np.searchsorted(np.cumsum(w), u), G.N - 1)
    C = {k: v[idx] for k, v in G.cols.items()}; R, rot = v2_pred(C, geom); c = geom[1]
    r = np.maximum(.05, R + C['sigma'] * rng.normal(size=S)); th = rot + C['nu'] * rng.normal(size=S)
    er, et = r * np.cos(th) - c, r * np.sin(th)
    post = G.logp[None, :] + lantern_ll2(G, geom, er, et); post -= post.max(1, keepdims=True); p = np.exp(post); p /= p.sum(1, keepdims=True)
    Hs = -(np.where(p > 1e-300, p * np.log(np.maximum(p, 1e-300)), 0)).sum(1).mean()
    return H0 - Hs


def lantern_ll3(G, geom, er, et):
    """H5: return distance ~ N(R, a^2 L); direction error ~ N(rot, nu0^2 + a^2 L / c^2)."""
    C = G.cols; L, c = geom[0], geom[1]; R, rot = v2_pred(C, geom)
    er = np.atleast_1d(er)[:, None]; et = np.atleast_1d(et)[:, None]
    r = np.hypot(c + er, et); th = np.arctan2(et, c + er); d = (th - rot + np.pi) % (2 * np.pi) - np.pi
    sr = C['a'] * np.sqrt(L); sn = np.sqrt(C['nu0'] ** 2 + C['a'] ** 2 * L / max(c, .3) ** 2)
    return -np.log(2 * np.pi * sr * sn) - (r - R) ** 2 / (2 * sr ** 2) - d ** 2 / (2 * sn ** 2)


def lantern_eig3(G, geom, rng, S=20):
    w = G.w(); H0 = -(w[w > 1e-300] * np.log(w[w > 1e-300])).sum()
    u = (rng.random() + np.arange(S)) / S; idx = np.minimum(np.searchsorted(np.cumsum(w), u), G.N - 1)
    C = {k: v[idx] for k, v in G.cols.items()}; R, rot = v2_pred(C, geom); L, c = geom[0], geom[1]
    r = np.maximum(.05, R + C['a'] * np.sqrt(L) * rng.normal(size=S)); th = rot + np.sqrt(C['nu0'] ** 2 + C['a'] ** 2 * L / max(c, .3) ** 2) * rng.normal(size=S)
    er, et = r * np.cos(th) - c, r * np.sin(th)
    post = G.logp[None, :] + lantern_ll3(G, geom, er, et); post -= post.max(1, keepdims=True); p = np.exp(post); p /= p.sum(1, keepdims=True)
    Hs = -(np.where(p > 1e-300, p * np.log(np.maximum(p, 1e-300)), 0)).sum(1).mean()
    return H0 - Hs


def lantern_ll(G, L, c, er, et):
    C = G.cols; s2 = C['acc'] ** 2 * L + C['rep'] ** 2; R = C['gain'] * np.exp(-C['leak'] * L) * c; b = np.radians(C['bias'])
    mr, mt = R * np.cos(b) - c, R * np.sin(b)
    er = np.atleast_1d(er)[:, None]; et = np.atleast_1d(et)[:, None]
    return -np.log(2 * np.pi * s2) - ((er - mr) ** 2 + (et - mt) ** 2) / (2 * s2)


def lantern_eig(G, L, c, rng, S=20):
    w = G.w(); H0 = -(w[w > 1e-300] * np.log(w[w > 1e-300])).sum()
    u = (rng.random() + np.arange(S)) / S; idx = np.minimum(np.searchsorted(np.cumsum(w), u), G.N - 1)
    C = G.cols; sd = np.sqrt(C['acc'][idx] ** 2 * L + C['rep'][idx] ** 2); R = C['gain'][idx] * np.exp(-C['leak'][idx] * L) * c; b = np.radians(C['bias'][idx])
    er = R * np.cos(b) - c + sd * rng.normal(size=S); et = R * np.sin(b) + sd * rng.normal(size=S)
    post = G.logp[None, :] + lantern_ll(G, L, c, er, et); post -= post.max(1, keepdims=True); p = np.exp(post); p /= p.sum(1, keepdims=True)
    Hs = -(np.where(p > 1e-300, p * np.log(np.maximum(p, 1e-300)), 0)).sum(1).mean()
    return H0 - Hs


def palace_probs(G, kind):
    C = G.cols; rho, al, m = C['rho'], C['alpha'], C['m']; g6 = 1 / 6
    if kind == 'none': c = m + (1 - m) * g6; return np.stack([c, np.zeros_like(c), 1 - c])
    no = (1 - rho) * (1 - al); st = no * (m + (1 - m) * g6)
    cor = rho + (1 - rho) * al * .25 + no * (1 - m) * g6 if kind == 'rotate' else rho + (1 - rho) * al * (m + (1 - m) * .25) + no * (1 - m) * g6
    return np.stack([cor, st, np.maximum(1e-6, 1 - cor - st)])


def palace_eig(G, kind):
    w = G.w(); P = palace_probs(G, kind); pred = (P * w).sum(1)
    H = -(pred[pred > 1e-12] * np.log(pred[pred > 1e-12])).sum(); cond = -(w * (np.where(P > 1e-12, P * np.log(np.maximum(P, 1e-12)), 0))).sum()
    return H - cond


# ============================================================ person and session parameters
def new_person(g, rng):
    p = sim2.sample_person(g, rng)
    p['bias_deg'] = rng.normal(0, 12)            # a constant turning bias, any group
    p.update(v2_person(g, rng))
    if DESIGN.get('sentinel_cap') and g == 'prodromal':
        # sim2 draws log k ~ N(log mean, .1) and log ter ~ N(log mean, .06); redraw the prodromal means from the healthy ones
        eff = sim2.KNOBS['effect']; h = sim2.BASE['healthy']
        p['k'] = float(np.log(h['k'][0]) - eff * .61 * .1 + rng.normal(0, .1)); p['ter'] = float(np.log(h['ter'][0]) + eff * .6 * .06 + rng.normal(0, .06))
    return p


_CAL = json.load(open(os.path.join(HERE, 'pi_calib.json'))) if os.path.exists(os.path.join(HERE, 'pi_calib.json')) else None
_CAL3 = json.load(open(os.path.join(HERE, 'pi_calib_H5.json'))) if os.path.exists(os.path.join(HERE, 'pi_calib_H5.json')) else None


def v2_person(g, rng):
    """Lantern v2 parameters. 'data': healthy and healthy-novice players from healthy elderly, prodromal from biomarker-positive
    MCI moved by the effect knob (sim2.KNOBS['effect']). 'assumed': the old assumption (deficits in noise and leak), on the new axes."""
    eff = sim2.KNOBS['effect']; out = {}
    v3 = DESIGN.get('pi_model') == 'v3'; CAL = _CAL3 if v3 else _CAL
    if DESIGN.get('pi_source') == 'data' and CAL:
        for k in (('gain', 'leak', 'g2', 'nu0', 'a') if v3 else ('gain', 'leak', 'g2', 'sigma', 'nu')):
            h, pr = CAL['healthy'][k], CAL['prodromal'][k]
            loc = h['loc'] + (eff * (pr['loc'] - h['loc']) if g == 'prodromal' else 0); sc = h['scale'] + (eff * (pr['scale'] - h['scale']) if g == 'prodromal' else 0)
            v = rng.normal(loc, max(sc, 1e-3)); out['v2_' + k] = float(np.exp(v)) if h['log'] else float(v)
    else:
        bad = eff if g == 'prodromal' else 0
        out = dict(v2_gain=float(np.exp(rng.normal(np.log(.95), .1))), v2_leak=float(max(0, rng.normal(.01 + .01 * bad, .006))), v2_g2=float(rng.normal(1.0, .08)),
                   v2_sigma=float(np.exp(rng.normal(np.log(.8 * (1 + .35 * bad)), .3))), v2_nu=float(np.exp(rng.normal(np.log(np.radians(18) * (1 + .35 * bad)), .3))))
    out['v2_g2'] = float(np.clip(out['v2_g2'], .2, 1.6)); out['v2_leak'] = float(np.clip(out['v2_leak'], -.02, .15))
    return out


def session(person, g, s, rng):
    q = sim2.session_params(person, g, s, rng)
    q['bias_deg'] = person['bias_deg']
    for k in person:
        if k.startswith('v2_'): q[k] = person[k]
    nov = g == 'healthy_novice'
    # steering at eye level with turn-and-walk controls: extra scatter for people new to it, learned over sessions
    # a first-person warm-up (a short steering corridor in the prologue) counts as an extra session of practice, plus practice within this one
    wu = DESIGN.get('fp_warmup', False)
    q['fp_ctrl'] = (.55 if nov else .12) * .7 ** (s + (1 if wu else 0)) * (.7 if wu else 1) + .05
    return q


# ============================================================ the East Wing: a graph of rooms
SIDES = {'N': (0, -1), 'S': (0, 1), 'W': (-1, 0), 'E': (1, 0)}
OPP = {'N': 'S', 'S': 'N', 'W': 'E', 'E': 'W'}


class East:
    def __init__(self, lay, rng):
        self.lay = lay; self.rooms = lay['rooms']
        self.edges = {}       # edge key -> (roomA, sideA, roomB, sideB)
        for rid, r in self.rooms.items():
            for e in r['exits']:
                self.edges.setdefault(e['edge'], []).append((rid, e['side']))
        self.state = {}       # truth: True open
        for k, ends in self.edges.items():
            self.state[k] = k in lay['open']
        self.plan = {k: (k in lay['open'] or k == lay['eE']) for k in self.edges}
        self.locked = {lay['eA'], lay['eB']}
        extra = DESIGN['east_loops'] - 2
        if extra > 0:
            cands = [k for k in self.edges if not self.state[k] and k not in (lay['eE'],) and k not in lay['opens'] and k not in lay['seal']]
            for k in rng.permutation(cands)[:extra]:
                self.state[k] = True; self.plan[k] = True

    def nbrs(self, rid):
        out = []
        for k, ends in self.edges.items():
            for i, (r, sd) in enumerate(ends):
                if r == rid: o = ends[1 - i]; out.append((k, sd, o[0], o[1]))
        return out

    def passable(self, k):
        return self.state[k] and k not in self.locked


def room_cost(east, rid, from_port, side):
    return east.rooms[rid]['dist'].get(from_port, {}).get(side, 10) + 2


def east_dist(east, goal, ok):
    """Distances (tiles) from every (room, entry side) to the goal room, Dijkstra over room ports."""
    import heapq
    best = {}; h = []
    for k, sd, o, osd in east.nbrs(goal):
        pass
    best[(goal, None)] = 0; heapq.heappush(h, (0, goal, None))
    dist_room = {goal: 0}
    while h:
        d, rid, _ = heapq.heappop(h)
        if d > dist_room.get(rid, 1e9) + 1e-9: continue
        for k, sd, o, osd in east.nbrs(rid):
            c = ok(k)
            if c is None: continue
            nd = d + c * (10 + 2)
            if nd < dist_room.get(o, 1e9): dist_room[o] = nd; heapq.heappush(h, (nd, o, osd))
    return dist_room


class EastAgent:
    def __init__(self, east, q, rng):
        self.e, self.q, self.rng = east, q, rng
        self.known = {k: (east.plan[k] if rng.random() < q['p_enc'] else None) for k in east.edges}
        self.pos = east.lay['foyer']; self.port = 'C'
        self.moves = 0; self.walk = 0.0; self.time = 0.0; self.bumps = 0; self.junctions = []; self.changed = False; self.consults = 0
        self.verified = set(); self.tried = {}

    def believed(self, k):
        kn = self.known.get(k)
        if k in self.e.locked: return None
        return 1 if kn is True else (None if kn is False else 3)

    def see_room(self):
        for k, sd, o, osd in self.e.nbrs(self.pos):
            t = self.e.state[k]; kn = self.known.get(k)
            if kn is None: self.known[k] = t
            elif kn != t:
                if self.changed and self.rng.random() > self.q['alpha']: pass   # the doorway's absence goes unnoticed: still believed
                else: self.known[k] = t

    def go(self, goal, cap=60):
        rng, q, e = self.rng, self.q, self.e
        for _ in range(cap):
            self.see_room()
            if self.pos == goal: return True
            if q['forget'] > 0:
                for k in list(self.known):
                    if self.known[k] is not None and rng.random() < q['forget'] * 12: self.known[k] = None
            db = east_dist(e, goal, self.believed)
            opts = [(k, sd, o, osd) for k, sd, o, osd in e.nbrs(self.pos) if self.believed(k) is not None and o in db]
            if not opts:
                if self.pos == e.lay['foyer'] and rng.random() < .6:
                    self.consults += 1; self.time += 7
                    for k in e.edges:
                        if rng.random() < q['p_enc'] and not (k in self.verified and rng.random() < q['alpha']): self.known[k] = e.plan[k]
                    continue
                opts = [(k, sd, o, osd) for k, sd, o, osd in e.nbrs(self.pos) if e.passable(k)]
                if not opts: return False
                k, sd, o, osd = opts[rng.integers(len(opts))]
            else:
                vals = np.array([room_cost(e, self.pos, self.port, sd) + db[o] for k, sd, o, osd in opts])
                wts = np.exp(-(vals - vals.min()) / max(q['tau'] * 10, 1e-3)); k, sd, o, osd = opts[rng.choice(len(opts), p=wts / wts.sum())]
            # junction: a room with three or more ways on that are really open
            real = [(kk, s2, oo) for kk, s2, oo, _ in e.nbrs(self.pos) if e.passable(kk)]
            if len(real) >= 3 and e.passable(k):
                dt = east_dist(e, goal, lambda kk: 1 if e.passable(kk) else None)
                dp = east_dist(e, goal, lambda kk: 1 if e.plan[kk] else None)
                vt = {kk: room_cost(e, self.pos, self.port, s2) + dt.get(oo, 1e9) for kk, s2, oo in real}
                vp = {kk: room_cost(e, self.pos, self.port, s2) + dp.get(oo, 1e9) for kk, s2, oo, _ in e.nbrs(self.pos) if e.plan[kk]}
                mt = min(vt.values()); bt = {kk for kk, v in vt.items() if v <= mt + 3}
                mp = min(vp.values()) if vp else 1e9; bp = {kk for kk, v in vp.items() if v <= mp + 3}
                self.junctions.append((k in bt, k in bp, bt != bp, self.changed))
            self.walk += e.rooms[self.pos]['dist'].get(self.port, {}).get(sd, 10)
            if not e.passable(k):
                # walking into a doorway that is not there (or still locked)
                if self.changed and e.plan[k] and k not in e.locked: self.bumps += 1; self.verified.add(k)
                self.time += 2.5; self.port = sd
                self.tried[k] = self.tried.get(k, 0) + 1
                if rng.random() < q['alpha'] or self.tried[k] > 1: self.known[k] = False
                continue
            self.walk += 2; self.pos = o; self.port = osd; self.moves += 1
        return False


def chapter_east(lay, q, rng):
    e = East(lay, rng); a = EastAgent(e, q, rng); out = {}
    rid_of = lambda item: next(r for r, v in e.rooms.items() if item in v['items'])
    seq = [rid_of('medallion'), rid_of('glove'), ('unlock', lay['eA']), rid_of('music'), rid_of('brass'), ('unlock', lay['eB']), next(r for r, v in e.rooms.items() if v['name'] == 'Study'), next(r for r, v in e.rooms.items() if v['name'] == "Servants' Passage")]
    for g in seq:
        if isinstance(g, tuple): e.locked.discard(g[1]); continue
        a.go(g)
    pre_j = list(a.junctions)
    # the Architect: seal, open, hide a memento; then out and back
    eff, rets = [], []
    changes = DESIGN['east_changes']
    for ci in range(changes):
        if ci == 0: seal, opens, errand = lay['seal'], lay['opens'], lay['errand']
        else: seal, opens, errand = make_change(e, rng)
        if errand is None: break
        for k in seal: e.state[k] = False
        for k in opens: e.state[k] = True
        a.changed = True
        if ci == 0: a.go(lay['foyer'])
        for leg_goal, store in ((errand, eff), (lay['foyer'], rets)):
            m0 = a.moves; short = east_dist(e, leg_goal, lambda kk: 1 if e.passable(kk) else None).get(a.pos)
            a.go(leg_goal)
            if short: store.append((a.moves - m0 + 1) / (short / 12 + 1))   # rooms walked through vs the fewest possible
    post = [j for j in a.junctions if j[3]]
    conf = [j for j in post if j[2]]
    out.update(e_pre_opt=np.mean([j[0] for j in pre_j]) if pre_j else np.nan, e_post_opt=np.mean([j[0] for j in post]) if post else np.nan,
               e_conf_plan=np.mean([j[1] for j in conf]) if conf else np.nan, e_n_conf=len(conf), e_bumps=a.bumps,
               e_err_eff=float(np.mean(eff)) if eff else np.nan, e_ret_eff=float(np.mean(rets)) if rets else np.nan,
               e_walk=a.walk, e_time=a.walk * .21 / q['speed'] + a.time + 90)
    return out


def make_change(e, rng):
    """A further rearrangement: brick up two doorways on the way to a far room, open two new ones, keep the house connected."""
    foy = e.lay['foyer']
    d = east_dist(e, foy, lambda kk: 1 if e.passable(kk) else None)
    far = sorted([r for r in e.rooms if r != foy and e.rooms[r]['name'] not in ("Servants' Passage",)], key=lambda r: -d.get(r, 0))[:4]
    for _ in range(30):
        target = far[rng.integers(len(far))]
        path = []; cur = target
        dd = east_dist(e, target, lambda kk: 1 if e.passable(kk) else None)
        # walk from the foyer down the gradient to the target, collecting edges
        pos = foy; guard = 0
        while pos != target and guard < 20:
            guard += 1; best = None
            for k, sd, o, osd in e.nbrs(pos):
                if e.passable(k) and dd.get(o, 1e9) < dd.get(pos, 1e9) and (best is None or dd[o] < dd[best[1]]): best = (k, o)
            if not best: break
            path.append(best[0]); pos = best[1]
        if len(path) < 2: continue
        seal = list(rng.permutation(path)[:2]); closed = [k for k in e.edges if not e.state[k] and k not in seal]
        opens = list(rng.permutation(closed)[:2])
        saved = dict(e.state)
        for k in seal: e.state[k] = False
        for k in opens: e.state[k] = True
        ok = len(east_dist(e, foy, lambda kk: 1 if e.passable(kk) else None)) == len(e.rooms)
        e.state = saved
        if ok: return seal, opens, target
    return [], [], None


# ============================================================ the Conservatory maze: a graph of cells
class Maze:
    def __init__(self, lay, rng):
        self.lay = lay; self.CI, self.CJ = lay['CI'], lay['CJ']; L = lay['lawn']
        self.lawn = lambda c: L[0] <= c[0] <= L[2] and L[1] <= c[1] <= L[3]
        key = lambda a, b: (min(a, b), max(a, b)); self.key = key
        self.plan = {key((i, j), (a, b)) for i, j, a, b in lay['plan']}
        post = {key((i, j), (a, b)) for i, j, a, b in lay['post']}
        closed = sorted(self.plan - post); opened = sorted(post - self.plan)
        n = DESIGN['maze_closures']
        if n > len(closed):
            # more regrowth: close further passages near the way home, keeping every cell reachable
            extra = self._more_closures(post, n - len(closed), rng); post -= set(extra); closed += extra
        self.post = post; self.closures = set(closed); self.truth = set(self.plan)
        self.nbe = {(i, j): [(n, key((i, j), n)) for n in self.nb((i, j))] for i in range(self.CI) for j in range(self.CJ)}
        self.lawnE = {e for c, lst in self.nbe.items() for n, e in lst if self.lawn(c) and self.lawn(n)}

    def _more_closures(self, post, n, rng):
        office = tuple(self.lay['office']); out = []
        cand = [e for e in post if not (self.lawn(e[0]) and self.lawn(e[1]))]
        d = self.bfs(post, [office])
        cand.sort(key=lambda e: d.get(e[0], 99)); cand = cand[:40]
        for e in rng.permutation(len(cand)):
            ed = cand[e]; test = post - {ed} - set(out)
            if len(self.bfs(test, [office])) == self.CI * self.CJ: out.append(ed)
            if len(out) >= n: break
        return out

    def nb(self, c):
        i, j = c
        return [(i + di, j + dj) for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= i + di < self.CI and 0 <= j + dj < self.CJ]

    def bfs(self, edges, goals):
        d = {g: 0 for g in goals}; q = deque(goals)
        while q:
            c = q.popleft()
            for n in self.nb(c):
                if n not in d and self.key(c, n) in edges: d[n] = d[c] + 1; q.append(n)
        return d


class MazeAgent:
    def __init__(self, m, q, rng):
        self.m, self.q, self.rng = m, q, rng
        allp = {m.key(c, n) for j in range(m.CJ) for i in range(m.CI) for c in [(i, j)] for n in m.nb(c)}
        self.known = {e: ((e in m.plan) if rng.random() < q['p_enc'] else None) for e in allp}
        self.pos = tuple(m.lay['office']); self.steps = 0; self.bumps = 0; self.junctions = []; self.changed = False
        self.found = {}; self.revisits = 0; self.tried = {}; self.ver = 0; self._bc = None; self._jc = None

    def cost(self, e):
        if e in self.m.lawnE: return 1
        kn = self.known.get(e)
        return 1 if kn is True else (None if kn is False else 3)

    def bdist(self, goals):
        key = (goals, self.ver)
        if self._bc and self._bc[0] == key: return self._bc[1]
        import heapq
        d = {g: 0 for g in goals}; h = [(0, g) for g in goals]; nbe = self.m.nbe; known = self.known; lawnE = self.m.lawnE
        while h:
            dd, c = heapq.heappop(h)
            if dd > d[c]: continue
            for n, e in nbe[c]:
                if e in lawnE: w = 1
                else:
                    kn = known.get(e); w = 1 if kn is True else (None if kn is False else 3)
                if w is None: continue
                nd = dd + w
                if nd < d.get(n, 1e9): d[n] = nd; heapq.heappush(h, (nd, n))
        self._bc = (key, d); return d

    def note(self, e):
        t = e in self.m.truth; kn = self.known.get(e)
        if kn is None: self.known[e] = t; self.ver += 1
        elif kn != t:
            if self.changed and self.rng.random() > self.q['alpha']: pass
            else: self.known[e] = t; self.ver += 1
        if self.changed and e in self.m.closures and not t:
            if e not in self.found: self.found[e] = self.steps

    def see(self):
        m = self.m
        if DESIGN['maze_view'] == 'top':
            # the whole screen is visible from above, walls or not
            i0, j0 = self.pos
            for j in range(max(0, j0 - 2), min(m.CJ, j0 + 3)):
                for i in range(max(0, i0 - 2), min(m.CI, i0 + 3)):
                    for n in m.nb((i, j)):
                        if abs(n[0] - i0) <= 2 and abs(n[1] - j0) <= 2: self.note(m.key((i, j), n))
        else:
            # at eye level: straight down each open corridor, three cells at most
            for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                c = self.pos
                for _ in range(3):
                    n = (c[0] + di, c[1] + dj)
                    if not (0 <= n[0] < m.CI and 0 <= n[1] < m.CJ): break
                    e = m.key(c, n); self.note(e)
                    if e not in m.truth: break
                    c = n

    def go(self, goals, cap=900):
        goals = frozenset(map(tuple, goals)); rng, q, m = self.rng, self.q, self.m; last = None
        for _ in range(cap):
            if self.pos in goals: return True
            self.see()
            d = self.bdist(goals)
            cand = [n for n in m.nb(self.pos) if n in d and self.cost(m.key(self.pos, n)) is not None]
            if not cand:
                cand = [n for n in m.nb(self.pos) if m.key(self.pos, n) in m.truth]
                if not cand: return False
                nxt = cand[rng.integers(len(cand))]
            else:
                ds = np.array([d[n] + (2 if n == last else 0) for n in cand], float)
                wts = np.exp(-(ds - ds.min()) / max(q['tau'], 1e-3)); nxt = cand[rng.choice(len(cand), p=wts / wts.sum())]
            e = m.key(self.pos, nxt)
            real = [n for n in m.nb(self.pos) if m.key(self.pos, n) in m.truth]
            if len(real) >= 3 and not m.lawn(self.pos) and e in m.truth:
                if self._jc is None or self._jc[0] != (goals, id(m.truth)): self._jc = ((goals, id(m.truth)), m.bfs(m.truth, list(goals)), m.bfs(m.plan, list(goals)))
                dt, dp = self._jc[1], self._jc[2]
                bt = {n for n in real if dt.get(n, 1e9) == min(dt.get(x, 1e9) for x in real)}
                pr = [n for n in m.nb(self.pos) if m.key(self.pos, n) in m.plan]
                bp = {n for n in pr if dp.get(n, 1e9) == min(dp.get(x, 1e9) for x in pr)} if pr else set()
                self.junctions.append((nxt in bt, nxt in bp, bt != bp, self.changed))
            if e not in m.truth:
                if self.changed and e in m.plan: self.bumps += 1; self.found.setdefault(e, self.steps)
                self.tried[e] = self.tried.get(e, 0) + 1
                if rng.random() < q['alpha'] or self.tried[e] > 1: self.known[e] = False; self.ver += 1
                self.steps += .5; continue
            last = self.pos; self.pos = nxt; self.steps += 1
            if self.changed:
                for n in m.nb(nxt):
                    f = self.found.get(m.key(nxt, n))
                    if f is not None and self.steps - f > 6 and m.key(nxt, n) in m.closures: self.revisits += 1; self.found[m.key(nxt, n)] = self.steps
        return False


def chapter_maze(lay, q, rng):
    m = Maze(lay, rng); a = MazeAgent(m, q, rng); out = {}
    todo = [tuple(r) for r in lay['roses']]
    while todo:
        todo.sort(key=lambda c: abs(c[0] - a.pos[0]) + abs(c[1] - a.pos[1])); a.go([todo.pop(0)])
    a.go([tuple(lay['boiler'])])
    L = lay['lawn']; gate = ((L[0] + L[2]) // 2, L[3])
    a.go([gate]); pre_steps = a.steps; pre_j = list(a.junctions)
    # regrowth while the steam is up
    m.truth = set(m.post); a.changed = True
    office = tuple(lay['office'])
    legs = {}
    for name, goal in (('transition', [office]), ('reward', [tuple(lay['roses'][rng.integers(3)])]), ('return', [office])):
        short = m.bfs(m.truth, goal).get(a.pos); s0 = a.steps; a.go(goal)
        legs[name] = (a.steps - s0 + 1) / (short + 1) if short is not None else np.nan
    post = [j for j in a.junctions if j[3]]; conf = [j for j in post if j[2]]
    out.update(m_pre_opt=np.mean([j[0] for j in pre_j]) if pre_j else np.nan, m_post_opt=np.mean([j[0] for j in post]) if post else np.nan,
               m_conf_plan=np.mean([j[1] for j in conf]) if conf else np.nan, m_n_conf=len(conf), m_bumps=a.bumps, m_revisits=a.revisits,
               m_trans_eff=legs['transition'], m_reward_eff=legs['reward'], m_ret_eff=legs['return'],
               m_contrast=np.log(legs['transition']) - np.log(legs['reward']) if legs['transition'] > 0 and legs['reward'] > 0 else np.nan,
               m_time=a.steps * 3 * .21 / q['speed'] + 80)
    return out, m


# ============================================================ lantern trials: triangle completion in the dark
def lawn_box(lay):
    x0, y0, x1, y1 = lay['lawnBox']; fx, fy = lay['fountain']
    if DESIGN['lawn'] == 'large': x0 -= 3; y0 -= 2; x1 += 3; y1 += 2
    return x0, y0, x1, y1, fx, fy


def lantern_path(box, rng):
    x0, y0, x1, y1, fx, fy = box; legmax = 9 if DESIGN['lawn'] == 'large' else 7
    inside = lambda x, y: x0 + 2.5 < x < x1 - 2.5 and y0 + 2.5 < y < y1 - 2.5 and np.hypot(x - fx, y - fy) > 3.6
    for _ in range(800):
        x, y = rng.uniform(x0 + 2, x1 - 2), rng.uniform(y0 + 2, y1 - 2)
        if not inside(x, y): continue
        legs = 2 if rng.random() < .5 else 3; h = rng.integers(8) * np.pi / 4; pts = [(x, y)]; L = 0; good = True; lens, turns = [], []
        for i in range(legs):
            if i: t = int(rng.choice([45, 90, 135]) * rng.choice([-1, 1])); h += np.radians(t); turns.append(t)
            ln = rng.uniform(2.5, legmax); lens.append(round(float(ln), 3))
            for k in range(1, 13):
                if not inside(x + np.sin(h) * ln * k / 12, y - np.cos(h) * ln * k / 12): good = False; break
            if not good: break
            x += np.sin(h) * ln; y -= np.cos(h) * ln; L += ln; pts.append((x, y))
        if good: return L, float(np.hypot(pts[-1][0] - pts[0][0], pts[-1][1] - pts[0][1])), tuple(lens), tuple(turns)
    return None


def pi_params(q, g):
    acc, rep, bias = q['pi_noise'], q['pi_rep'], q['bias_deg']
    if DESIGN['pi_view'] == 'top':
        # heading is supplied by the fixed north-up view: turning bias vanishes and the deficit tied to updating heading is halved
        acc = .75 * np.exp(np.log(.30) + .5 * (np.log(acc) - np.log(.30))); bias = 0.0
    else:
        rep = np.sqrt(rep ** 2 + q['fp_ctrl'] ** 2)
    return acc, rep, q['pi_gain'], q['pi_leak'], bias


def lantern_trial(q, g, L, c, rng, lens=None, turns=()):
    if DESIGN['pi_model'] == 'v3':
        lens = lens or (L,); rot, cm = path_geom(lens, turns, q['v2_g2']); R = q['v2_gain'] * np.exp(-q['v2_leak'] * L) * cm[0]
        sr = np.sqrt(q['v2_a'] ** 2 * L + q['fp_ctrl'] ** 2); sn = np.sqrt(q['v2_nu0'] ** 2 + (q['v2_a'] ** 2 * L + q['fp_ctrl'] ** 2) / max(c, .3) ** 2)
        if DESIGN['pi_view'] == 'top': sn = sn * .6; rot = rot * 0
        r = max(.05, R + sr * rng.normal()); th = rot[0] + sn * rng.normal()
        return r * np.cos(th) - c, r * np.sin(th)
    if DESIGN['pi_model'] == 'v2':
        lens = lens or (L,); rot, cm = path_geom(lens, turns, q['v2_g2']); R = q['v2_gain'] * np.exp(-q['v2_leak'] * L) * cm[0]
        sig, nu = q['v2_sigma'], q['v2_nu']
        if DESIGN['pi_view'] == 'top': nu = nu * .6; rot = rot * 0
        else: sig = np.sqrt(sig ** 2 + q['fp_ctrl'] ** 2); nu = np.sqrt(nu ** 2 + (q['fp_ctrl'] / max(c, 1.0)) ** 2)
        r = max(.05, R + sig * rng.normal()); th = rot[0] + nu * rng.normal()   # fitted direction noise already contains any side bias
        return r * np.cos(th) - c, r * np.sin(th)
    acc, rep, gain, leak, bias = pi_params(q, g)
    R = gain * np.exp(-leak * L) * c; b = np.radians(bias); sd = np.sqrt(acc ** 2 * L + rep ** 2)
    return R * np.cos(b) - c + sd * rng.normal(), R * np.sin(b) + sd * rng.normal()


POOL = {}
_PF = os.path.join(HERE, 'paths16.json')
if os.path.exists(_PF):
    POOL = {(int(k.split(':')[0]), k.split(':')[1]): [(p[0], p[1], tuple(p[2]), tuple(p[3])) if len(p) > 2 else (p[0], p[1], (p[0],), ()) for p in v] for k, v in json.load(open(_PF)).items()}


def path_pool(lay):
    k = (lay['seed'], DESIGN['lawn'])
    if k not in POOL:
        r = np.random.default_rng(lay['seed'] * 7 + (1 if DESIGN['lawn'] == 'large' else 0)); box = lawn_box(lay)
        POOL[k] = [p for p in (lantern_path(box, r) for _ in range(220)) if p]
    return POOL[k]


def lanterns(lay, q, g, G, rng):
    errs = []; T = 0.0; pool = path_pool(lay)
    for t in range(DESIGN['lantern_trials']):
        cands = [pool[i] for i in rng.integers(len(pool), size=10)] if pool else []
        if not cands: break
        v2 = DESIGN['pi_model'] in ('v2', 'v3'); E = lantern_eig3 if DESIGN['pi_model'] == 'v3' else lantern_eig2
        if DESIGN['ado'] and t > 0:
            eig = [E(G, p, rng) if v2 else lantern_eig(G, p[0], p[1], rng) for p in cands[:6]]; pick = cands[int(np.argmax(eig))]
        elif DESIGN['ado']:
            pick = min(cands, key=lambda p: abs(p[0] - 12))
        else: pick = cands[0]
        L, c, lens, turns = pick
        er, et = lantern_trial(q, g, L, c, rng, lens, turns)
        G.logp += ((lantern_ll3 if DESIGN['pi_model'] == 'v3' else lantern_ll2)(G, pick, er, et) if v2 else lantern_ll(G, L, c, er, et))[0]
        errs.append((L, float(np.hypot(er, et)))); T += L / 2.5 + c / (4.75 * q['speed']) + 6
    return errs, T


# ============================================================ the palace: integrating a glimpse
def palace(q, P, rng):
    res = {'swap': [], 'rotate': [], 'none': []}; stale = 0; changed = 0
    anchors = list(rng.permutation(['swap', 'rotate', 'none'])); n = DESIGN['palace_tests']
    for t in range(n):
        if t < 3: kind = anchors[t]
        elif not DESIGN['ado']: kind = ['swap', 'rotate', 'none'][t % 3]
        else:
            nsw = len(res['swap']); done = sum(len(v) for v in res.values())
            if DESIGN['swap_min'] > 0 and nsw < DESIGN['swap_min'] * done: kind = 'swap'
            else: kind = max(['swap', 'rotate', 'none'], key=lambda k: palace_eig(P, k))
        if kind == 'none':
            cls = 'correct' if rng.random() < q['p_enc'] + (1 - q['p_enc']) / 6 else 'other'
        else:
            changed += 1
            if rng.random() < q['infer']: cls = 'correct'
            elif rng.random() < q['alpha']:
                ok = (kind == 'swap' and rng.random() < q['p_enc']) or rng.random() < .25; cls = 'correct' if ok else 'other'
            else:
                if rng.random() < q['p_enc']: cls = 'stale'
                else: cls = 'correct' if rng.random() < 1 / 6 else 'other'
            stale += cls == 'stale'
        res[kind].append(cls == 'correct')
        P.logp += np.log(np.maximum(1e-9, palace_probs(P, kind)[{'correct': 0, 'stale': 1, 'other': 2}[cls]]))
    m = lambda k: float(np.mean(res[k])) if res[k] else np.nan
    return dict(p_swap=m('swap'), p_rot=m('rotate'), p_none=m('none'), p_stale=stale / max(1, changed), p_n_swap=len(res['swap']), p_time=n * 26 + 120)


# ============================================================ sentinels: a diffusion decision
CLEVELS = [.012, .02, .03, .045]


def sentinels(q, g, scale, rng):
    out = []
    for i in range(DESIGN['sentinels']):
        sleeper = rng.random() < .5; c = min(.12, max(.004, CLEVELS[rng.integers(4)] * scale))
        v = q['k'] * (c / .03) * .22 if sleeper else -q['k'] * .14
        a, dt, s = q['a'], .005, .1; x, tt = a / 2, 0.0
        while 0 < x < a and tt < 6: x += v * dt + s * np.sqrt(dt) * rng.normal(); tt += dt
        strike = x >= a
        rt = tt + q['ter'] + rng.normal(0, .05)
        tiles_per_s = 4.75 * q['speed']
        if DESIGN['rt_timing'] == 'sight':
            # as built: the clock runs from first sight, so approach and walking past are in the RT
            d0 = rng.uniform(3, 8); rt += (d0 - 1.2) / tiles_per_s + (2.6 / tiles_per_s if not strike else 0) + abs(rng.normal(0, .4))
        else:
            # from entering the decision zone (2.5 m): a short, nearly fixed walk remains
            rt += 1.2 / tiles_per_s + abs(rng.normal(0, .08))
        out.append((strike == sleeper, rt))
    return out


# ============================================================ one session, one person
def play(person, g, s, rng, state):
    q = session(person, g, s, rng)
    G, P = state['G'], state['P']
    if s > 0: G.drift(.3); P.drift(.3)
    e = LAY['east'][rng.integers(len(LAY['east']))]; c = LAY['conservatory'][rng.integers(len(LAY['conservatory']))]
    r = {}
    r.update(chapter_east(e, q, rng))
    mo, _ = chapter_maze(c, q, rng); r.update(mo)
    errs, lt = lanterns(c, q, g, G, rng); r['_lantern'] = errs; r['l_err'] = float(np.mean([b for _, b in errs])) if errs else np.nan
    r.update(palace(q, P, rng))
    # the rotunda blackout: a free homing walk, at eye level unless the blackout view is top-down
    cdist = rng.uniform(8, 14); er, et = lantern_trial(q, g, cdist, cdist, rng); r['free_err'] = float(np.hypot(er, et))
    f = sentinels(q, g, state['scale'], rng); r['_fig'] = f
    r['f_acc'] = float(np.mean([a for a, _ in f])); r['f_rt'] = float(np.median([t for _, t in f]))
    acc = r['f_acc']; state['scale'] = max(.4, min(2.5, state['scale'] * (.8 if acc > .85 else 1.25 if acc < .65 else 1)))
    for n in G.names: r['L_' + n] = G.mean(n)
    for n in PAX: r['P_' + n] = P.mean(n)
    r['speed'] = q['speed'] * 4.75 * rng.normal(1, .03); r['scrape'] = q['scrape'] * rng.normal(1, .15); r['swing'] = q['aim']
    r['minutes'] = (r['e_time'] + r['m_time'] + lt + r['p_time'] + DESIGN['sentinels'] * 4 + 60) / 60
    r['scale'] = state['scale']
    return r


def one(args):
    g, i, n_sess, seed, design, knobs = args
    DESIGN.clear(); DESIGN.update(design); sim2.set_knobs(**knobs)
    rng = np.random.default_rng(seed); person = new_person(g, rng)
    state = dict(G=Grid({'v2': LAX2, 'v3': LAX3}.get(DESIGN['pi_model'], LAX)), P=Grid(PAX), scale=1.0); rows = []
    for s in range(n_sess):
        r = play(person, g, s, rng, state); r.update(group=g, pid=i, session=s); rows.append(r)
    return rows


def simulate(design, n_per_group, n_sess, seed=0, effect=.5, profile='general', procs=None):
    knobs = dict(effect=effect, decline=0.0, design='v5', profile=profile)
    d = dict(BASE_DESIGN); d.update(design)
    jobs = [(g, i, n_sess, seed * 10_000_000 + gi * 100_000 + i, d, knobs) for gi, g in enumerate(sim2.GROUPS) for i in range(n_per_group)]
    with Pool(procs) as pool:
        out = pool.map(one, jobs, chunksize=2)
    return [r for rows in out for r in rows]
