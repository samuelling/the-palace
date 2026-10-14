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
