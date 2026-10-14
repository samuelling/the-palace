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
