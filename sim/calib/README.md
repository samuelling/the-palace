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

- **Game (`ado.js`):** the lantern model is now A5, an adaptive grid over gain, leak, turn gain, distance noise and direction noise. It integrates each trial's actual legs and turns, so the adaptive choice now favours paths whose turns are informative. Both games pass legs and turns, and the lab overlay and notes show the new parameters.
- **Simulator (`sim16`, `pi_model='v2'`):**
  - **`pi_source='data'`:** healthy players are drawn from the healthy-elderly fits and prodromal players from the MCI+ fits, scaled by the effect knob (0.5 = halfway, a stand-in for the preclinical stage).
  - **Spread:** shrunk by reliability where reliability is at least .5. The turn-gain spread is set from the model-free over-turning effect.
  - **Scale to the game:** distance noise ×1.5 and leak ×.72 for the game's longer legs.
  - **Novices:** same parameters as healthy players, plus steering scatter that adds to both noise terms.

## Limits

- **Small, symptomatic sample.** 11 biomarker-positive MCI patients are prodromal AD in the IWG sense, not preclinical. Halving the effect for preclinical players is still an assumption.
- **Different task.** Real walking in VR, not keyboard steering on a lawn. Absolute values don't transfer, which is why the simulator uses relative shifts.
- **Optimistic group effects.** The MCI+ effects come from 11 people, so they are likely inflated by winner's-curse selection: this is the study that found them.
