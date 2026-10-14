# The Palace

A survival-horror game in the Resident Evil tradition, built so that playing it fits cognitive models of change in the background.

Dr. Elias Locke has turned Locke Hall into a memory palace, and he keeps rearranging it. The story moves inward and downward, toward the palace he is building in the cellar: the core of his mind.

## Beta: three chapters

A first-person 3D survival-horror game. Play it on GitHub Pages or open `index.html`. Every session generates new layouts, so practice doesn't reduce to memorizing one house.

1. **The East Wing.** Keys, locked doors, ghouls, and Clara's three mementos. While you're in the dark servants' corridor, the Architect moves two doorways and takes one memento back into a wing, so the return trip has to use the moved doorways.
2. **The Conservatory.** A hedge maze under glass, regenerated every session with loops and real route choices. Three rose cuttings at the statues, then the boiler. The steam blackout leaves you walking back to the hedge gap in the dark and striking a match where you think it is. Then the hedges regrow before the trip back to the office.
3. **The Palace.** Locke's memory palace in the cellar: a rotunda of six veils opening onto memory rooms. Each memory you return makes the Architect reshuffle which veil leads where. An unkillable Guardian patrols the rotunda. The finale is leading Locke up the stairs.

Some figures in the dark are dress forms or scarecrows. Some are ghouls standing still, and those sway very slightly.

Controls. Desktop: WASD move, mouse look (click to capture), click or Space fire, E use, Shift run, M to read a plan while standing at it. Phone: left stick, drag to look, Fire, Use and Map buttons.

### What is recorded, silently

- Route choices at junctions, scored against the true layout and against the (never updated) plan
- Walking into doorways that have moved
- Veil choices in the palace: correct, where the room used to be, or what the plan says
- Homing error in the conservatory blackout
- Decisions about the standing figures (shoot or walk past) and time from first seeing them
- Motor calibration kept separate: walking speed on straight runs, wall scrapes, aim error
- Position and heading at 5 Hz

The session notes after each chapter summarize these and offer "Copy session data" (JSON).

### Files

- `levels.js`: seeded chapter generators (pure; also loadable from node for simulation)
- `game.js`: engine, telemetry, chapter flow
- `shell.html`: page body; `python3 build.py` wraps it into `index.html`
- `sim/`: Monte Carlo players
