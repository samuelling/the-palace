# The Palace

A survival-horror game in the Resident Evil tradition, built so that playing it fits cognitive models of change in the background.

Dr. Elias Locke has turned Locke Hall into a memory palace, and he keeps rearranging it. The story moves inward and downward, toward the palace he is building in the cellar: the core of his mind.

## Beta: three chapters

A first-person 3D survival-horror game. Play it on GitHub Pages or open `index.html`. Every session generates new layouts, so practice doesn't reduce to memorizing one house.

1. **The East Wing.** Keys, locked doors, ghouls, and Clara's three mementos. While you're in the dark servants' corridor, the Architect moves two doorways and takes one memento back into a wing, so the return trip has to use the moved doorways.
2. **The Conservatory.** A hedge maze under glass, regenerated every session with loops and real route choices. Three rose cuttings at the statues, then the boiler. The steam blackout leaves you walking back to the hedge gap in the dark and striking a match where you think it is. Then the hedges regrow before the trip back to the office.
3. **The Palace.** Locke's memory palace in the cellar: a rotunda of six veils opening onto memory rooms. Each memory you return makes the Architect reshuffle which veil leads where. An unkillable Guardian patrols the rotunda. The finale is leading Locke up the stairs.

Some figures in the dark are dress forms or scarecrows. Some are ghouls standing still, and those sway very slightly.

Controls. Desktop: WASD move, mouse look (click to capture), click or Space fire, E use, Shift run, M to read a plan while standing at it, N music on/off, L model estimates. Phone: left stick, drag to look, Fire, Use and Map buttons, Lab button for the estimates.

### What is recorded, silently

- Route choices at junctions, scored against the true layout and against the (never updated) plan
- Walking into doorways that have moved
- Veil choices in the palace: correct, where the room used to be, or what the plan says
- Homing error in the conservatory blackout
- Decisions about the standing figures (shoot or walk past) and time from first seeing them
- Motor calibration kept separate: walking speed on straight runs, wall scrapes, aim error
- Position and heading at 5 Hz

The session notes after each chapter summarize these and offer "Copy session data" (JSON).

### Sound

`audio.js` synthesizes the score and every effect at run time with WebAudio; there are no samples. Each chapter has its own key, drone and chord voice (strings on the grounds, organ in the East Wing, glass in the conservatory, a formant choir in the palace) plus weather and the house: wind, rain on glass, the boiler, stick-slip creaks, drips, whispers, distant thuds. Tension rises quickly when something is hunting you and settles slowly: the drone's filter opens, a tritone comes in, then tremolo strings and a heartbeat. Clara's lullaby is one fixed melody, intact on the chapter cards; inside the house it plays in safe rooms (with a clock) and occasionally far off, and the deeper the chapter the more notes go missing and the further the rest drift out of tune.

The score never reacts to anything a measure depends on. Standing figures are not enemies until they move, so a dormant ghoul never changes the music; Architect reshuffles have no cue; and while a homing trial runs every positional sound is centred, so nothing can act as an auditory landmark for path integration.

### Model estimates overlay

Press L (or the Lab button on a phone, or open the page with `#lab`) for a live view of the adaptive layer: the marginal posterior of every parameter, filled for now and outlined for where it started this session, with the mean and 80% interval; the uncertainty left in each model, in bits, trial by trial; the next lantern path or palace reshuffle the design chose and its expected information gain (or that it is a fixed anchor); and the behavioral measures that don't go through a model. It is off by default so players are not steered by watching their own estimates.

### The 16-bit version

`sixteen/` is the same game redrawn as a top-down, flip-screen 16-bit adventure: same story and chapters, same adaptive layer, same score, all pixel art drawn in code. Play it at [samuelling.github.io/the-palace/sixteen](https://samuelling.github.io/the-palace/sixteen/). It keeps its own saved estimates (`palace16.*` in the browser), because some measures change meaning with the camera.

How each test carries over:

- **Map updating (East Wing).** Twelve single-screen rooms joined by doors, generated each session. Locke's plan is on the lectern. After the locket, the Architect bricks up two doorways (one is the bolt door you opened) and opens two new ones, then hides a memento behind the change. Route choices out of rooms with three or more doors are scored against the true house and against the plan; walking into a bricked doorway the plan still shows is a stale bump.
- **Hedge maze (Conservatory), at eye level.** The maze is walked in first person, through a raycaster that runs on the same tile grid and draws in the same pixel style. In a scrolling top-down view you could often see a regrown hedge before committing to a route; at eye level a closure past a corner is found only after you turn into it, and every junction has to be placed on the plan in your head. Junctions are scored cell by cell against the planted plan and the regrown maze; returning to a closure is logged.
- **Glimpse-then-integrate (Palace).** A rotunda with three veils on the north wall and three on the south. Where you step out after leaving a room is the glimpse. Identical logic to the 3D version.
- **Path integration, at eye level.** The blackouts drop into first person, and you steer by turning (tank controls), so heading has to be updated from rotation, as in the 3D version, and distances are foreshortened. The darkness is fully opaque; the lantern lights only about two metres of featureless grass (optic flow, no landmarks), lantern paths keep well clear of the hedges and the fountain, and the grass texture is reseeded when the lantern goes out so no patch can be recognised on the way back. The rotunda blackout drops into first person too.
- **Standing figures become sentinels.** Suits of armour, seen top-down. The live ones' visor glow pulses; the staircase adjusts the luminance contrast of that pulse (a temporal contrast-detection decision), targeting about 75% correct. Strike or walk past; time from first sight to decision feeds the diffusion model as before. The scarecrows in the maze are met at eye level, where the eyes grow as you approach, so their decisions are logged with the distance at first sight and kept out of the contrast staircase.
- **Motor covariates.** Walking speed on straight runs, wall bumps, sword hits and the perpendicular offset of the nearest target from each swing.

The camera is chosen per mission by the reference frame the test needs: top-down where a fixed allocentric view keeps a measure clean (map updating between rooms, palace rule inference, contrast detection), first person where egocentric processing is the construct (maze junctions and closures, path integration). The lantern model is calibrated on real triangle completion from people with biomarker-typed MCI (see `sim/calib/README.md`). It is checked against a second, curved-path dataset in young and older adults. It estimates heading noise, turn gain, distance gain, leak and positional noise (accumulating with distance walked) from each return's actual legs and turns. Heading noise is the clearest marker of biomarker-positive MCI, and it also rises with age, so scores need age-matched norms. The 16-bit game also logs orientation stops (standing still while finding the way), the strongest real-world wayfinding marker of subjective cognitive decline.

Tuned against simulated players (see `sim/README.md`): eight lantern returns per blackout, sentinel decisions timed from stepping within 2.5 m (a walk-past counts at the closest approach), two more doors in the East Wing, and a short first-person lane at the start of the prologue to learn turning before the maze. Sentinel decision time is a motor covariate; the risk score uses only cognitive parameters.

Top-down movement is far easier for novices than mouse-look, so the novice confound found in the simulations should shrink; that is a prediction to check, not a result.

### Files

- `levels.js`: seeded chapter generators (pure; also loadable from node for simulation)
- `game.js`: engine, telemetry, chapter flow, model-estimates overlay
- `ado.js`: adaptive design optimization
- `audio.js`: generative score and sound effects
- `sixteen/`: the 16-bit version (`art.js` pixel art, `world.js` seeded chapters, loadable from node, `game.js` engine and telemetry)
- `shell.html`: page body; `python3 build.py` wraps it into `index.html`
- `sim/`: Monte Carlo players

### Adaptive design

`ado.js` keeps a grid posterior per player for two models: path integration on the lantern trials (accumulating noise, reporting noise, gain, leak, turning bias) and integrating a glimpse in the palace (rule inference, local updating, memory for unchanged links). After a few fixed anchor trials, each lantern path and each palace reshuffle type is chosen to maximize expected information gain. Posteriors are saved in the browser and carried into the next session with some widening, so a real change in a player can still show up. Session notes report the estimates with 80% intervals.
