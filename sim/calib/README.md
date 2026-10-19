# Calibrating the lantern model on real triangle completion

**Data.** Howett et al. 2019 (*Brain*) and Castegnaro, Ji, Rudzka, Chan & Burgess 2023 (*Current Biology*), released with code at [zenodo.org/record/8253734](https://zenodo.org/record/8253734) (MIT licence).

The task is immersive-VR triangle completion with real walking, under three environment conditions:
- young adults (24 usable)
- healthy older adults (33)
- MCI split by CSF biomarkers: positive 11, negative 14, unknown 16

The dataset is not committed here. Download it and run the steps below.

```
python3 -I glampi_data.py <HowettBrain2019_Dataset.mat> <repo>/Functions/DataHandling > trials.json   # port of their preprocessing
python3 behav.py                                    # behavioural replication
STARTS=15 python3 fit.py                            # every model, every participant -> fits_<model>.json, fits_percond.json
python3 splithalf.py A5 glampi                      # odd/even-trial reliability
python3 analyze.py                                  # comparison, replication, group effects -> analysis.json
python3 export_sim.py                               # population distributions for the simulator -> ../sim16/pi_calib.json
```

## The port reproduces the paper

`glampi_data.py` ports their preprocessing step by step:
- **Path transform:** align each path to the first leg and mirror right turns into left turns.
- **Out-of-bound responses:** keep the direction and set the distance to the mean return.
- **Return angle:** taken from tracking, with a long-way-turn correction.
- **Leg durations:** taken from tracking.
- **Manual exclusions and angle fixes:** parsed from their MATLAB files rather than retyped.

Proportional errors, averaged per participant over conditions:

| | return turn / correct | return distance / correct |
|---|---|---|
| Healthy elderly | 1.02 | .82 |
| MCI, biomarker negative | 1.15 | .81 |
| MCI, biomarker positive | 1.46 | .63 |
| MCI pooled | 1.26 | .77 |

These are the published values. Their 7-parameter GLAMPI model, fitted per condition and averaged as they did, separates MCI+ from MCI−:
- **Angular gain:** AUC .89, p = .002
- **Angular noise:** AUC .81, p = .009
- **Distance gain, leak and distance noise:** no difference

That is the published pattern.

## Model comparison

Each model is fitted per person to all conditions pooled. All are scored on the same density over return distance and return direction. Out-of-bound trials contribute direction only.

| Model | Parameters | Sum AIC | Sum BIC |
|---|---|---|---|
| **E5**: the game's lantern model as built (accumulating isotropic noise, reporting noise, gain, leak, side bias) | 5 | 9287 | 9936 |
| E5 with the bias defined relative to the turn | 5 | 8842 | 9490 |
| E5 with the bias replaced by an angular gain on the turn | 5 | 8862 | 9511 |
| E5 plus angular gain | 6 | 8681 | 9460 |
| **A5**: gain, leak, angular gain on turns, separate distance noise and direction noise | 5 | 8223 | **8871** |
| A5 plus angular production gain | 6 | **8053** | **8831** |
| GLAMPI (published) | 7 | 8064 | 8972 |

**The model as built fits real returns worst.** It puts all noise in one isotropic blob around the endpoint. Real direction errors and distance errors behave independently: someone can walk the right distance in the wrong direction.

**A5 fixes this with the same number of parameters,** and beats GLAMPI on BIC. GLAMPI regresses angle and distance toward each person's *observed* mean response. Those two data-derived intercepts are not counted as parameters, so its AIC is flattering.

## Group effects (A5, pooled conditions)

| | Direction noise ν | Turn gain g2 | Distance noise σ | Leak | Distance gain |
|---|---|---|---|---|---|
| Medians: elderly | 26° | 1.00 | .48 | −.06 | .56 |
| Medians: MCI+ | 55° | .46 | .64 | .01 | .37 |
| d, MCI+ vs elderly | **2.63** | −2.08 | .87 | .78 | −.36 |
| AUC, MCI+ vs elderly | **.97** | .82 (inverted) | .69 | .66 | .66 (inverted) |
| AUC, MCI+ vs MCI− | **.77** | .75 (inverted) | .63 | .55 | .67 (inverted) |
| Split-half reliability | .78 | **−.62** | .63 | .25 | .13 |

**The marker is direction noise.** It is large, it is measured reliably, and it separates biomarker-positive from biomarker-negative MCI.

**Over-turning is real at group level but not measurable per person in this task.** Model-free, the mean signed direction error is +31° in MCI+, d = 1.43. In A5 this is a turn gain below 1: turns are registered as smaller, so the return over-turns. In GLAMPI it shows up as g2 > 1 together with a production regression term. Neither g2 is reliable per person (split-half −.62 here and .15 for GLAMPI's). Triangles with one turn of 114–137° can't separate turn registration from turn production. The game's paths have one or two turns of ±45/90/135°, so in principle they can.

**What the simulator had assumed:** prodromal players differed mostly in accumulating noise (1.4 SD) and leak (1.7 SD), with no direction-specific deficit. In real data accumulating noise separates the groups only while it is absorbing direction noise: d .83 in E5, but .15 once a turn gain is added (E6). Distance noise and leak carry modest effects (d about .8). The signal was assumed on the wrong axis.

## What changed

- **Game (`ado.js`):** the lantern model was A5 after this first pass (superseded by H5 in the second pass, below), an adaptive grid over gain, leak, turn gain, distance noise and direction noise. It integrates each trial's actual legs and turns, so the adaptive choice now favours paths whose turns are informative. Both games pass legs and turns, and the lab overlay and notes show the new parameters.
- **Simulator (`sim16`, `pi_model='v2'`):**
  - **`pi_source='data'`:** healthy players are drawn from the healthy-elderly fits and prodromal players from the MCI+ fits, scaled by the effect knob (0.5 = halfway, a stand-in for the preclinical stage).
  - **Spread:** shrunk by reliability where reliability is at least .5. The turn-gain spread is set from the model-free over-turning effect.
  - **Scale to the game:** distance noise ×1.5 and leak ×.72 for the game's longer legs.
  - **Novices:** same parameters as healthy players, plus steering scatter that adds to both noise terms.

## Limits

- **Small, symptomatic sample.** 11 biomarker-positive MCI patients are prodromal AD in the IWG sense, not preclinical. Halving the effect for preclinical players is still an assumption.
- **Different task.** Real walking in VR, not keyboard steering on a lawn. Absolute values don't transfer, which is why the simulator uses relative shifts.
- **Optimistic group effects.** The MCI+ effects come from 11 people, so they are likely inflated by winner's-curse selection: this is the study that found them.

---

# More datasets (second pass)

Three more open datasets match parts of the game. The raw data are not committed; the scripts regenerate everything from the downloads.

| Dataset | What it is | Licence | Script |
|---|---|---|---|
| Stangl, Kanitscheider, Riemer, Fiete & Wolbers 2020, *Nat Commun* ([OSF ufk4x](https://osf.io/ufk4x/)) | Curved-path homing in VR with real walking, verbal distance and body-turn direction at up to 4 stops; 30 young, 26 older adults; trial level | none stated (analysed, not redistributed) | `stangl.py` |
| Coughlan et al. 2019 *PNAS*; Gillespie/Coughlan et al. 2020 *PLOS ONE* ([OSF x2rjz](https://osf.io/x2rjz), [6adqk](https://osf.io/6adqk)) | Virtual Supermarket Task and Sea Hero Quest in cognitively healthy adults aged 51–75 by APOE genotype, tested twice about 18 months apart; per-person scores | OSF public | `vst_shq.py` |
| Marquardt et al. 2024, *PLOS Digital Health* ([OSF f9br5](https://doi.org/10.17605/OSF.IO/F9BR5)) | Real-world smartphone wayfinding to 5 campus buildings; 24 young, 25 healthy older, 23 subjective cognitive decline (SCD); per-track measures | OSF public | `wayfind.py` |

## 1. Lantern model structure, tested on a second dataset (Stangl et al.)

The paths here are curved, home distances range from 0.5 to 10 m, and outbound lengths range from 2 to 17 m. That tests two things the triangles could not: how noise grows with distance walked, and how direction error depends on how far away home is.

| Model (per person, 56 people) | k | Sum AIC | Sum BIC |
|---|---|---|---|
| Isotropic accumulating noise (the game as first built) | 5 | 38218 | 39038 |
| Separate distance and direction noise, both constant (like A5) | 5 | 40154 | 40973 |
| Separate, both accumulating | 7 | 38050 | 39198 |
| Anisotropic positional noise, accumulating | 5 | **37731** | **38551** |
| **H5**: constant heading noise plus positional noise accumulating with distance walked | 5 | 38175 | 38995 |

**What each dataset shows:**
- **Curved paths (Stangl et al.):** noise grows with distance walked, and direction error is larger when home is close. A constant angular noise alone (A5's structure) fits worst.
- **Triangles (Castegnaro et al.):** direction noise in angular units is what separates the groups.

**Choosing H5.** It fits both datasets (triangle data below). It is the best 5-parameter model on the triangles, and in the curved-path data it beats the isotropic model and every separable one. It keeps the marker in one reliable parameter. The pure positional model (anisotropic) wins on the curved paths, but on the triangles it loses the marker and fits worse than A5 (AIC 8494 vs 8223). The game now uses H5.

Triangle data (refit):

| | k | Sum AIC | Sum BIC |
|---|---|---|---|
| A5 | 5 | 8223 | 8871 |
| **H5** | 5 | **8205** | **8853** |
| GLAMPI | 7 | 8064 | 8972 |

H5 group effects:

| | heading noise ν0 | turn gain | positional noise a | distance gain | leak |
|---|---|---|---|---|---|
| MCI+ vs healthy elderly, d (AUC) | **2.37 (.94)** | −2.08 | .91 | −.32 | .73 |
| MCI+ vs MCI−, AUC | **.74** | .75 (inv.) | .62 | .66 (inv.) | .52 |
| Older vs young (Stangl), d (AUC) | **.93 (.77)** | — | −.22 | −.48 | .01 |
| Split-half reliability (triangles / Stangl) | .77 / .92 | −.63 / — | .64 / .92 | .14 / .98 | .24 / .90 |

**Heading noise is both the disease marker and the main ageing marker.** A screening score built on it needs age-matched norms. The disease effect is large relative to ageing: d 2.4 for MCI+ vs age-matched controls, against d .9 for roughly 45 years of healthy ageing. That gap is what a normed score would exploit.

## 2. What the at-risk stage looks like (APOE4, midlife)

Cognitively healthy adults, mean age 62 (ε3ε3 n = 32, ε3ε4 n = 27):

| Measure | APOE4 d, baseline (AUC) | APOE4 d, 18 months | Test-retest r |
|---|---|---|---|
| Egocentric orientation (pointing home after a route) | −.65 (.63 inv.) | −.39 | .57 |
| Heading direction | −.19 | −.32 | .34 |
| Allocentric map drop | −.04 | .28 | −.50 (task changed) |
| Central (border-avoiding) preference | −.97 | −.62 | .18 |
| Sea Hero Quest distance travelled | .70 | .25 | .35 |
| ACE-III total | −.47 | .16 | .29 |

**The at-risk egocentric effect is d .4–.65,** in line with Newton et al. 2024 (path-integration AUC .67 for midlife double risk). That is about a fifth of the MCI+ heading-noise effect, so the simulator now has an at-risk scenario with the prodromal effect at 0.2.

## 3. Real-world wayfinding in subjective cognitive decline

Per person, averaged over 5 tracks:

| Measure | SCD vs healthy older, d (AUC) | Older vs young, d | Reliability (odd/even tracks) |
|---|---|---|---|
| Orientation stops (< 1 m in 5 s) | **.93 (.73)** | .97 | .57 |
| Map checks | .69 (.70) | .54 | **.83** |
| Duration | .69 (.68) | 1.01 | .61 |
| Distance relative to the young median | .52 (.62) | .66 | .31 |
| Movement speed | −.43 | −1.35 | .89 |

The published AUC for orientation stops (.757) is reproduced to within the CI.

**What this means for the game:**
- **Map checks** are the game's plan readings, already logged.
- **Orientation stops** are now logged too, in the 16-bit game's `stops` log and notes, using the same definition. They are excluded while homing, in safe rooms and near enemies.
- **Speed is the confound:** it is larger for age than for SCD, which is why speed is kept as a covariate.
- **Plausibility check:** the simulator's route measures (single-measure AUC .55–.68 at half the prodromal effect) are in the range seen for SCD. The assumed route deficits are not wildly inflated.

## 4. Sentinels: capping the assumed deficit

There is no open perceptual-decision dataset in MCI, but a meta-analysis of 30 perceptual studies gives the whole young-to-old ageing effect on drift: g = −.61 (Theisen et al. 2021, *Psychological Research*). The simulator had assumed a prodromal drift deficit of about 2.7 SD at full effect, larger than 50 years of ageing, which is implausible. `sentinel_cap=True` now caps drift at d .61 and non-decision time at d .6.

## Simulation with everything calibrated

Tuned design, seed 3, 200 per group:

| Scenario | 1 session AUC | 10 sessions AUC | 10 s, cognitive only | Novices flagged (cognitive only) |
|---|---|---|---|---|
| As first built (v1), prodromal at half the MCI+ effect | .840 | .958 | .944 | 41% |
| H5 lantern from data, same | .844 | .949 | .934 | 18% |
| + sentinel cap | .820 | .927 | .935 | 14% |
| **At-risk stage (effect 0.2), H5 + cap** | **.591** | **.719** | .705 | 71% |
| At-risk stage, v1 assumptions | .625 | .790 | .737 | 80% |

**Paired bootstrap, v1 vs H5 + cap, 10 sessions:**
- **All features:** AUC −.030 (CI −.057 to −.003). Novice separation +.20 (CI .14 to .25).
- **Cognitive only:** AUC −.009 (CI −.034 to .018). Novice separation +.11 (CI .06 to .16).

**The honest bottom line:**
- **Prodromal stage (MCI with AD pathology):** the calibrated game separates well in simulation (about .93 after ten sessions) and mostly ignores new players.
- **At-risk midlife stage (APOE4-sized effects):** expect about .72 after ten sessions. That matches what real path-integration tasks achieve at that stage (AUC .63 to .67), and new players are still flagged at high rates, so the control-learning confound matters most exactly where early detection is the goal.
- **The old assumptions looked better at risk (.79)** only by leaning on signals that new players also produce.
