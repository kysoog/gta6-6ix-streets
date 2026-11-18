# Vice Meridian — gta6-6ix-streets

Open-world crime sandbox for the browser: a procedurally built neon city (pastel hotels, art-deco offices, a pier, a beach), drivable cars with traffic and police chases, pedestrians, a wanted system, hitscan combat, money drops, and procedural audio — all in one tab, offline, no build step.

## Controls

- WASD / arrow keys — drive and walk
- Mouse — aim (click the canvas to lock the pointer)
- Left click — shoot
- F — enter or exit the nearest vehicle
- H — horn
- R — cycle the radio station (restarts the round when wasted)
- Shift — run on foot / handbrake in a car
- Space — handbrake
- P — pause

## Tech stack

- three.js r160, vendored under `game/vendor/` — zero network calls after the page loads
- ES modules, plain static files — no build step, no bundler, nothing to install
- Procedural geometry, canvas-drawn sign and palm textures, deterministic seeded RNG so every seed replays identically
- One `index.html`; simulation and renderer live in `game/src/` ES modules

## Run it

```sh
# nothing to install; open the page directly
open game/index.html
# or serve it with any static server:
python3 -m http.server 8080 --directory game
# then http://localhost:8080
```

Submission pipeline:

```sh
rm -rf out && MAKEFUN_OUTPUT_DIR=out node main.ts
# writes out/dossier.json plus game/ and screenshots/ for the judge
```

## Screenshots

- `screenshots/01-start.jpg` — title scene, city at dusk
- `screenshots/02-play.jpg` — cruiser chase, shots fired
- `screenshots/03-end.jpg` — wasted screen

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
