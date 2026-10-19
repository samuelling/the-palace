# Monte Carlo players

Simulated players with explicit cognitive parameters play the East Wing beta's real grid and objective sequence, including the Architect's rearrangement, and log the same measures the game records. This is a sensitivity analysis under stated assumptions, not validation.

- `montecarlo.py`: the agent, the three populations and their parameters
- `analyze.py`: discriminability per measure and a cross-validated logistic classifier
- `sensitivity.py`: runs everything under three assumption sets and writes `results.json`

Run `python3 sensitivity.py` (about 12 minutes on two cores).

## Populations

| Parameter | Meaning | Healthy | Prodromal AD | Healthy novice |
| --- | --- | --- | --- | --- |
| p_enc | chance each doorway/corridor link is encoded from the plan | .90 | .75 | .86 |
| alpha | map-update rate when the world contradicts the map | .60 | .38 | .57 |
| tau | route-choice noise (softmax temperature) | .25 | .40 | .45 |
| forget | per-step loss of an encoded link | .0004 | .0012 | .0005 |
| speed | movement speed | 1.00 | .90 | .70 |
| aim | hit probability | .55 | .50 | .32 |
| p_glove | noticing the glove on the first gallery visit | .80 | .65 | .75 |
| iiv | session-to-session SD (logit scale) | .25 | .50 | .30 |

Across sessions: everyone learns the house (prodromal at about half the rate), novices learn the controls with a time constant of about four sessions, and in the `base` scenario prodromal players decline.

## Variants

- `current`: the beta as built. After the rearrangement most players only walk a few meters to the trapdoor.
- `errand`: the Architect scatters two mementos back into the wings, so the post-change leg has to go through the moved doorways.

## Headline results (healthy vs prodromal AUC; share of healthy novices flagged at 80% sensitivity)

| Scenario | 1 session, current | 1 session, errand | 12 sessions, current | 12 sessions, errand |
| --- | --- | --- | --- | --- |
| base (decline) | .76 · 92% | .80 · 91% | .98 · 9% | .98 · 5% |
| no decline | .76 · 92% | .80 · 91% | .95 · 29% | .92 · 45% |
| half effect, no decline | .64 · 99% | .67 · 96% | .84 · 75% | .79 · 83% |

Time and distance measures carry most of the single-session signal and cannot tell a prodromal player from a healthy one who is new to 3D games. Map-updating measures (walking into sealed doorways, post-change distance) separate prodromal players from novices about as well as from experienced healthy players, once the post-change leg is long enough to measure.

## Version 2: the three-chapter beta (`sim2.py`, `analyze2.py`)

Agents now play the real seeded layouts (`node export_layouts.js` writes `layouts.json`, which is not committed). Navigation uses a three-state map (known open, known closed, unknown) built from the plan, sees down straight corridors, updates at rate `alpha` when the world contradicts it, and can re-read the stale plan. New parameters: path-integration noise for the conservatory blackout, a diffusion-model decision for each standing figure (drift scales with sway), and motor/control covariates (speed, wall scrapes, aim) generated separately.

Healthy vs prodromal AUC · share of healthy novices flagged at 80% sensitivity:

| Scenario | 1 session, time + distance | 1 session, model measures | 10 sessions, time + distance | 10 sessions, model measures |
| --- | --- | --- | --- | --- |
| base (decline) | .68 · 94% | .83 · 48% | .88 · 54% | >.99 · 13% |
| no decline | .68 · 94% | .83 · 48% | .84 · 58% | >.99 · 33% |
| half effect, no decline | .56 · 97% | .67 · 72% | .68 · 79% | .89 · 78% |

"Model measures" are route choices at junctions, walking into moved doorways, distance after each rearrangement, homing error, veil choices, and figure accuracy, plus EZ-diffusion parameters pooled across sessions. Regressing out motor covariates using healthy players did not help, because novices sit outside the healthy range of control skill; that adjustment needs a norming sample that includes novices.

## Version 3: tuning for sensitivity (`analyze3.py`, `analyze3b.py`)

Same simulated players, untuned (v2) vs tuned (v3) design. Tuning: a warm-up prologue each session (crows on posts, a straight avenue), adaptive figure difficulty per player, more figures (13 to 19 per session), palace reshuffles on pickup as well as placement, and a second homing trial in the rotunda. With adaptive difficulty the information moves from accuracy into each player's converged sway threshold, so v3 adds that as a feature.

Healthy vs prodromal AUC · healthy novices flagged at 80% sensitivity:

| Scenario | 1 session v2 | 1 session v3 | 10 sessions v2 | 10 sessions v3 | 10 sessions v3, gated on control plateau |
| --- | --- | --- | --- | --- | --- |
| no decline | .85 · 43% | .87 · 34% | .99 · 15% | >.99 · 16% | >.99 · 8% |
| half effect, no decline | .69 · 74% | .71 · 70% | .87 · 89% | .92 · 73% | .89 · 73% |

Gains are real but modest. Homing became the strongest single measure (AUC .77 with two trials). The palace's stale-choice rate stays near chance in the simulation, partly because the agents ignore what the arrival point after each veil reveals; the palace model is the crudest part of the simulation.

## Step 1 revisions: revaluation contrasts and lantern homing (`analyze4.py`, `analyze4b.py`)

Half-sized effects, no decline, 10 sessions. Two hypotheses about the prodromal deficit: "general" (map memory and map updating both worse) and "transition" (map memory near normal, updating a changed map worse).

| | 10-session AUC · novices flagged |
| --- | --- |
| tuned design (v3), general | .85 · 80% |
| + lantern trials (3) and revaluation probes, general | .89 · 84% |
| + 8 lantern trials over a wider range of path lengths, 3 revaluation pairs, general | .94 · 68% |
| same, transition-specific deficit | .94 · 69% |

The lantern trials carry the gain: pooled across sessions, the slope of squared error on outbound length separates groups at AUC .83 to .86. It needs many trials over a wide range of lengths. The reward-vs-transition contrasts stay near chance even with three pairs per session, for two reasons the simulation exposes: hedge closures are visible as you approach, so they are corrected by sight rather than memory; and veil choices right after an unseen reshuffle are guesses for everyone. A transition probe needs a learning opportunity first (a local glimpse of the new link) and then a choice that requires integrating it.

## Glimpse-then-integrate palace tests and closure perseveration (`analyze5.py`)

Palace reshuffles are now built so a single local glimpse (where you come out of a room) is enough to work out the answer: swaps exchange the room you're in with the target room, rotations shift every veil by one step. The next choice is scored as correct, stale, back to the glimpsed veil, or other. Conservatory closures are placed just past turns, and returning to a closure already found is logged. Agents gain a structure-inference parameter (healthy .60, prodromal .35, novice .55; an assumption).

Half-sized effects, no decline, five lantern trials per session:

| | 1 session | 10 sessions |
| --- | --- | --- |
| step 1 (v4), general deficit | .77 · 77% | .89 · 76% |
| glimpse tests (v5), general deficit | .80 · 72% | .92 · 71% |
| step 1 (v4), transition-specific deficit | .79 · 74% | .85 · 61% |
| glimpse tests (v5), transition-specific deficit | .82 · 66% | .97 · 66% |

Over ten sessions the integration measures carry real signal and resist the novice confound: correct after a rotation, AUC .82 healthy vs prodromal and .59 healthy vs novice; the rotation-minus-no-change contrast .78 vs .54. Closure revisits stay weak (.55 to .59).

## Adaptive design optimization (`ado_sim.js`, `ado_analyze.py`)

`ado_sim.js` runs the game's own `ado.js`. Simulated players (half-sized prodromal effects) do 10 sessions of 5 lantern returns and 11 palace glimpse tests. Fixed design: random lantern paths, palace reshuffles cycling swap, rotation, none. Adaptive: the first lantern trial and first three palace tests are fixed anchors; the rest are chosen by expected information gain over the grid posterior.

| | Fixed | Adaptive |
| --- | --- | --- |
| Healthy vs prodromal AUC, novices flagged (150 per group) | .925 · 69% | .96 · 71% |
| 80% interval width at session 3 (noise · inference) | .26 · .33 | .25 · .26 |
| 80% interval width at session 10 (noise · inference) | .17 · .17 | .15 · .12 |
| Recovery r (noise, inference) | .89, .86 | .91, .91 |

With a misspecification not in the model (a constant turning bias of about 15° per player), recovery of accumulating noise fell to .50 with fixed designs and .32 with adaptive ones: adaptive designs lean harder on the model. Adding a turning-bias parameter to the lantern model restored it to .83 under both, with the adaptive design still ahead (.926 vs .906 AUC; 64% vs 75% of novices flagged). In the palace, the adaptive policy runs mostly rotations and no-change tests and almost no swaps.

## The 16-bit version (`sim16/`)

`sim16/` simulates the mixed-view 16-bit game on layouts exported from its own generator (`node export16.js 200 > layouts16.json`, then `python3 pools.py` for the lantern path pools). The East Wing is a graph of rooms with real intra-room walking distances, the maze a graph of cells seen at eye level (straight down open corridors) or from above (the whole screen), the lantern trials use the real lawn geometry, and both adaptive models run the same grid-posterior design choice as `ado.js`, ported to numpy. Populations and session dynamics are reused from `sim2.py` (half-sized prodromal effects, no decline; healthy novices who learn the controls). Additional assumptions: a person-level turning bias (SD 12°), extra steering scatter at eye level for people new to turn-and-walk controls, and, for a top-down blackout, a halved heading-related deficit.

`tune16.py` evaluates a design (`python3 tune16.py run <name> '<json design>' <seed> <n per group> <n single>`); `reanalyze.py` re-scores saved runs, including paired bootstrap comparisons over the same simulated players.

**Tuning.** One-at-a-time sweep on a tuning seed (120 per group, 10 sessions; seed-to-seed noise about ±.02 AUC), then combinations at 200 per group with paired bootstrap, then confirmation on fresh seeds.

| Change | Effect on 10-session AUC (single runs) |
|---|---|
| Sentinel decisions timed from entering the 2.5 m zone, walk-past at closest approach | +.03 to .04, the largest single gain |
| 8 lantern trials instead of 5 | +.02 to .03 |
| Two more doors in the East Wing (within a lock zone) | about +.02 |
| Larger lawn, more palace tests, minimum swap share, more sentinels, a second Architect change, more regrown hedges | no gain |
| Top-down blackouts | -.03 (keeps first person) |
| Top-down maze | no gain over first person |
| First-person warm-up lane | no measurable effect (+.001, CI spans 0); kept for teaching the controls |

**Scoring rule.** Sentinel decision time, non-decision time, lantern reporting noise and raw homing error are motor or execution by construction. Scoring only the cognitive parameters (accumulating noise, leak, gain, turning bias, glimpse inference and memory, map-updating measures, diffusion drift, contrast threshold) costs some AUC but cuts novice false alarms sharply.

**Confirmation on fresh seeds** (200 per group):

| | 1 session AUC | 10 sessions AUC | Novices flagged at 80% sensitivity |
|---|---|---|---|
| As built, all features | .780 | .915 | 63% |
| Tuned, all features | .820 | .955 | 79% |
| As built, cognitive parameters only | .770 | .873 | 56% |
| Tuned, cognitive parameters only | .792 | .909 | 46% |

The tuned design's gain replicates with all features (+.041, 95% CI .015 to .066), but cleaner decision times also make the classifier lean on speed, which flags novices more. Under the cognitive-only score the gain is +.036 (CI -.001 to .074), and the novice improvement seen on the tuning seed (+.12) did not replicate (+.02, CI -.03 to .07). Time cost: about 25 s per session.

Limits: the novice population carries lasting cognitive-looking differences by assumption (from `sim2.py`), which no design change can remove; map-updating measures stay weak (AUC .53 to .62) because following a stale plan requires both remembering the plan and failing to update it, which partly cancel.

## Calibrated on real triangle completion (`calib/`, `sim16` with `pi_model='v2'`)

The lantern model and the simulated players' path integration are now fitted to real data: Howett et al. 2019 and Castegnaro et al. 2023, 98 people doing triangle completion with real walking, including biomarker-typed MCI. Details are in `calib/README.md`.

In short, the model as built (isotropic accumulating noise) fit real returns worst of all models tested. A same-sized model with separate direction and distance noise plus an angular gain on turns (A5) fit best on BIC, beating the published 7-parameter GLAMPI. Direction noise is the marker: d 2.6 for biomarker-positive MCI vs healthy elderly, AUC .77 against biomarker-negative MCI, split-half reliability .78.

Simulation, tuned design, seed 3, 200 per group, prodromal at half the MCI+ effect:

| Lantern model and prodromal assumption | 1 session AUC | 10 sessions AUC | Novices flagged (10 s) | Novice AUC (10 s) |
|---|---|---|---|---|
| As built, assumed deficits (accumulating noise, leak) | .840 | .958 | 74% | .59 |
| Calibrated model, old assumed deficits moved onto its axes | .760 | .915 | 71% | .63 |
| Calibrated model, deficits from the MCI+ data | .845 | .954 | 46% | .76 |
| ... cognitive parameters only | .828 | .925 | 23% | .88 |

Paired bootstrap, calibrated vs as built:
- **All features:** the AUC difference is −.003 (CI −.023 to .015), but separation from novices improves by +.16 (CI .12 to .21) at 10 sessions and +.30 after one session.
- **Lantern parameters alone:** AUC .80 to .86 either way, but novices flagged fall from 71–89% to 25–36%.

Overall detection is unchanged. The gain is specificity: the measured signal (scattered, over-turned returns) is cognitive, and new players do not mimic it the way they mimicked the assumed noise and leak deficits.

The other chapters' deficits (maze, East Wing, palace, sentinels) remain assumptions, and the independence of deficits across domains still inflates the absolute AUCs.

## Second calibration pass (`calib/README.md`, second half)

**Datasets added:**
- **Stangl et al. 2020:** curved-path homing, young vs older adults.
- **Coughlan / Gillespie:** APOE4 midlife, supermarket task and Sea Hero Quest, test-retest.
- **Marquardt et al. 2024:** real-world wayfinding in SCD.

**What changed:**
- **Lantern model:** now H5 (`pi_model='v3'`, `pi_calib_H5.json`): constant heading noise plus positional noise accumulating with distance walked. It is the best single 5-parameter structure across both path-integration datasets.
- **Sentinels:** the deficit can be capped at the size of the meta-analytic ageing effect (`sentinel_cap`).
- **At-risk scenario:** set with `effect: 0.2`, matching APOE4 midlife effect sizes.

**Results:**
- **Prodromal stage:** about .93 after ten sessions, novices flagged 14% (cognitive-only score).
- **At-risk stage:** about .72 after ten sessions, with novices flagged 71%.
