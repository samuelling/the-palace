"""
Python port of the GLAMPI preprocessing (Castegnaro, Ji, Rudzka, Chan & Burgess 2023, Current Biology;
data from Howett et al. 2019, Brain). Source: zenodo.org/record/8253734 (MIT licence).

Ports, step for step: TransformPaths, CalculateOoB, CalculateTrackingPath and the ManuallyScoring* files
(trial exclusions and long-way-turn corrections, parsed from the original MATLAB so nothing is retyped).

Usage: python3 -I glampi_data.py <path to HowettBrain2019_Dataset.mat> <path to Functions/DataHandling> > trials.json
"""
import sys, os, re, json
import numpy as np
import scipy.io as sio

GROUPS = {'YoungControls': ('young', 'ManuallyScoringYoung.m', 1.55), 'HealthyControls': ('elderly', 'ManuallyScoringHealthyOld.m', 2.0),
          'MCIPos': ('mci_pos', 'ManuallyScoringMCIPos.m', 0.0), 'MCINeg': ('mci_neg', 'ManuallyScoringMCINeg.m', 0.0), 'Unknown': ('mci_unk', 'ManuallyScoringMCIUnk.m', 0.0)}
FILE_VAR = {'ManuallyScoringYoung.m': 'YoungControls', 'ManuallyScoringHealthyOld.m': 'HealthyControls', 'ManuallyScoringMCIPos.m': 'MCIPos',
            'ManuallyScoringMCINeg.m': 'MCINeg', 'ManuallyScoringMCIUnk.m': 'MCIUnk'}


def ang(va, vb):
    """Signed angle (degrees) from va to vb, as anglebetween in the MATLAB code."""
    return float(np.degrees(np.arctan2(va[0] * vb[1] - va[1] * vb[0], va[0] * vb[0] + va[1] * vb[1])))


def smooth_gauss(x, window=20):
    """MATLAB smoothdata(x,'gaussian',window): Gaussian-weighted moving average, sd = window/5, window shrinks at the ends."""
    n = len(x); out = np.empty(n); sd = window / 5.0
    lo, hi = window // 2, window - window // 2 - 1          # even window: centred on the current and previous element
    for i in range(n):
        a, b = max(0, i - lo), min(n, i + hi + 1); k = np.arange(a, b) - i
        w = np.exp(-.5 * (k / sd) ** 2); out[i] = np.sum(w * x[a:b]) / w.sum()
    return out


def longest_run(mask):
    """findWalkingSegment: start and end index of the longest run of True (first one if tied; 0, 0 if none)."""
    best, bs, be, s = 0, 0, 0, None
    for i, v in enumerate(mask):
        if v:
            if s is None: s = i
            if i - s + 1 > best: best, bs, be = i - s + 1, s, i
        else: s = None
    return bs, be


def parse_scoring(path):
    """Bad trials and angle corrections per participant (1-indexed in MATLAB, returned 0-indexed)."""
    bad, adj = {}, []
    cur = []
    for line in open(path):
        line = line.split('%')[0].strip()
        if not line: continue
        if re.match(r'BadExecution\s*=\s*zeros', line): cur = []; continue
        m = re.match(r'BadExecution\((\d+),1\)\s*=\s*1;', line)
        if m: cur.append(int(m.group(1)) - 1); continue
        m = re.match(r'\w+\.Reconstructed\{1,(\d+)\}\.BadExecution\s*=\s*BadExecution;', line)
        if m: bad[int(m.group(1)) - 1] = list(cur); continue
        m = re.match(r'\w+\.Reconstructed\{1,(\d+)\}\.RealReturnAngle\((\d+)\)\s*=\s*\w+\.Reconstructed\{1,\d+\}\.(RealReturnAngle|InferredReturnAngle)\((\d+)\)\s*([+-]\s*\d+)?;', line)
        if m:
            adj.append((int(m.group(1)) - 1, int(m.group(2)) - 1, m.group(3), int(m.group(5).replace(' ', '')) if m.group(5) else 0)); continue
        if line.startswith('trialsize') or line.startswith('clear'): continue
        raise ValueError('unparsed scoring line: ' + line)
    return bad, adj


def process_group(G, thresh):
    n = len(G.FlagPos); out = []
    for p in range(n):
        C = np.asarray(G.Cond[p]); ntr = len(G.FlagPos[p])
        spawn = np.array(G.FlagSpawnTime[p], float).reshape(ntr, 3); trig_t = np.array(G.FlagTrigTimes[p], float).reshape(ntr, 3)
        diff12 = np.mean(spawn[:, 1] - trig_t[:, 0]); diff23 = np.mean(spawn[:, 2] - trig_t[:, 1])
        trials = []
        # ---- TransformPaths
        for t in range(ntr):
            cones = np.asarray(G.FlagPos[p][t], float)[:, [0, 2]]; trig = np.asarray(G.TrigPos[p][t], float)[[0, 2]]
            o = np.asarray(G.OutOfBoundPos[p][t], float)
            oob = o[[0, 2]] if o.size else np.array([np.nan, np.nan])
            path = np.array(G.Path[p][t], float)
            X = np.vstack([cones, trig]); X0 = X[0].copy(); Xz = X - X0; oz = oob - X0
            path[:, [1, 3]] -= X0
            a = np.radians(ang([1, 0], Xz[1])); R = np.array([[np.cos(a), np.sin(a)], [-np.sin(a), np.cos(a)]])
            Xr = (R @ Xz.T).T; orr = R @ oz
            path[:, [1, 3]] = (R @ path[:, [1, 3]].T).T; path[:, [4, 6]] = (R @ path[:, [4, 6]].T).T
            flip = ang(-(Xr[1] - Xr[0]), Xr[2] - Xr[1]) > 0
            if flip: Xr[2:, 1] *= -1; orr[1] *= -1; path[:, 3] *= -1; path[:, 6] *= -1
            trials.append(dict(c=Xr[:3], trig=Xr[3], oob=orr, path=path, flip=bool(flip), cond=int(C[t, 1]), oobflag=int(C[t, 2])))
        # ---- CalculateOoB (distance of an out-of-bound response set to the mean walked return for that condition)
        walked = np.array([np.linalg.norm(tr['trig'] - tr['c'][2]) for tr in trials])
        isoob = np.array([tr['oobflag'] for tr in trials]); cond = np.array([tr['cond'] for tr in trials])
        overall = np.nanmean(walked[isoob == 0]) if (isoob == 0).any() else np.nan
        for tr in trials:
            tr['oob_rec'] = tr['oob'].copy()
            if tr['oobflag']:
                sel = (cond == tr['cond']) & (isoob == 0); L = np.nanmean(walked[sel]) if sel.any() else np.nan
                if np.isnan(L): L = overall
                d = tr['oob'] - tr['c'][2]; nd = np.linalg.norm(d)
                tr['oob_rec'] = tr['c'][2] + d / nd * L if nd > 0 else np.array([np.nan, np.nan])
        # ---- CalculateTrackingPath
        bad_ppt = False
        for t, tr in enumerate(trials):
            P = tr['path']; T = P[:, 0]; c = tr['c']
            A = P[T > trig_t[t, 2] - 2]
            rot = 0.0
            for i in range(1, len(A)):
                u = A[i - 1, [4, 6]]; v = A[i, [4, 6]]; rot += ang(u / np.linalg.norm(u), v / np.linalg.norm(v))
            d23 = c[2] - c[1]
            f_ret = ang(d23, tr['trig'] - c[2])
            if tr['oobflag']:
                temp = ang(d23, tr['oob_rec'] - c[2]) if np.all(np.isfinite(tr['oob_rec'])) else np.nan
            else: temp = f_ret
            real = temp
            if np.isfinite(temp) and np.sign(rot) * np.sign(temp) == -1: real = temp - 360 if temp > 0 else temp + 360
            tr.update(body_rot=rot, inferred_ret=f_ret, real_ret=real)
            # walking durations on the two outbound legs
            Q = P[T > trig_t[t, 0]]
            durs = []
            for leg, (s_lo, t_hi, dd) in enumerate([(spawn[t, 1], trig_t[t, 1], diff12), (spawn[t, 2], trig_t[t, 2], diff23)]):
                S = Q[(Q[:, 0] > s_lo) & (Q[:, 0] < t_hi + dd + .5)]
                sdir = (c[leg + 1] - c[leg]) / np.linalg.norm(c[leg + 1] - c[leg])
                vx = np.zeros(len(S)); vz = np.zeros(len(S))
                for i in range(1, len(S)):
                    dt = S[i, 0] - S[i - 1, 0]
                    vx[i] = .9 * vx[i - 1] + .1 * (S[i, 1] - S[i - 1, 1]) / dt; vz[i] = .9 * vz[i - 1] + .1 * (S[i, 3] - S[i - 1, 3]) / dt
                vp = vx * sdir[0] + vz * sdir[1]; sm = smooth_gauss(vp, 20)
                s0, s1 = longest_run(sm > .2)
                on = S[s0, 0] - .2; off = S[s1, 0] + .2 if S[s1, 0] + .2 <= S[-1, 0] else S[-1, 0]
                durs.append((on, off))
            tr['T_L1'] = max(durs[0][1] - durs[0][0], 0); tr['T_stand'] = max(durs[1][0] - durs[0][1], 0); tr['T_L2'] = max(durs[1][1] - durs[1][0], 0)
            if np.linalg.norm(c[1] - c[0]) < thresh: bad_ppt = True
        out.append(dict(trials=trials, bad_ppt=bad_ppt, gender=int(np.atleast_1d(G.Gender)[p]) if np.size(G.Gender) > p else None))
    return out


def main(matfile, scoring_dir):
    d = sio.loadmat(matfile, squeeze_me=True, struct_as_record=False)
    res = []
    for key, (name, sfile, thresh) in GROUPS.items():
        parts = process_group(d[key], thresh)
        bad, adj = parse_scoring(os.path.join(scoring_dir, sfile))
        for (pp, t, src, delta) in adj:
            tr = parts[pp]['trials'][t]; tr['real_ret'] = (tr['inferred_ret'] if src == 'InferredReturnAngle' else tr['real_ret']) + delta
        ages = list(np.atleast_1d(d[key].Age)) if hasattr(d[key], 'Age') else None
        for i, P in enumerate(parts):
            badset = set(bad.get(i, []))
            rows = []
            for t, tr in enumerate(P['trials']):
                c = tr['c']
                oob_missing = tr['oobflag'] == 1 and not np.all(np.isfinite(tr['oob']))
                use_oob = tr['oobflag'] == 1 and not oob_missing
                final = tr['oob_rec'] if use_oob else tr['trig']
                rows.append(dict(t=t, cond=tr['cond'], flip=tr['flip'], bad=t in badset, oob=int(use_oob),
                                 c1=list(map(float, c[0])), c2=list(map(float, c[1])), c3=list(map(float, c[2])),
                                 final=list(map(float, final)), real_ret=float(tr['real_ret']), body_rot=float(tr['body_rot']),
                                 T_L1=float(tr['T_L1']), T_L2=float(tr['T_L2']), T_stand=float(tr['T_stand'])))
            no_oob = not np.size(np.asarray(d[key].OutOfBoundPos[i][0], float))
            res.append(dict(group=name, pid=i, bad_ppt=P['bad_ppt'], no_oob_record=bool(no_oob), gender=P['gender'], age=(int(ages[i]) if ages is not None else None), trials=rows))
    json.dump(res, sys.stdout)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
