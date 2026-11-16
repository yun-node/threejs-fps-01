# FOUNDRY-9 — a three.js tactical FPS

[![make.fun · threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![rank](https://make.fun/badge/threejs-fps-01/yun-node/threejs-fps-01/rank.svg)](https://make.fun/bounty/threejs-fps-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![reward](https://make.fun/badge/threejs-fps-01/yun-node/threejs-fps-01/reward.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)

A round-based tactical shooter in an abandoned smelter. You are the attacker: plant the charge at Site A or clear all five hostiles on the floor, then buy better hardware and do it again — eight rounds, one floor harder each time. Bots patrol the three lanes, hold angles, react to gunfire, and converge to defuse a planted charge. Hits are raycast against bodies with double damage on headshots; recoil and spread punish firing on the move, so stopping to aim pays.

## The map

FOUNDRY-9 is a 64 × 44 m foundry floor with three lanes — mid, the furnace hall on the west flank, the catwalk gantry on the east — joined by three cross-doorways. Dark teal steel, amber hazard light, a molten-glow furnace, pipes, crates and a raised catwalk give every sightline its own cover.

## Gunplay

- Four weapons (pistol, SMG, rifle, sniper) plus frag and flash grenades, bought with round earnings in the buy menu between rounds.
- Raycast hit detection, headshot ×2, recoil kick, bloom and movement spread, crouch and slow-walk aim.
- Acceleration movement with AABB collision against walls, crates and the furnace.
- Fixed-step 60 Hz simulation kept apart from rendering; one state object; one job per module; no per-frame allocations in the hot loops. All sound is synthesised with WebAudio — no audio files.

## Run it

Serve `game/` with any static file server and open it in desktop Chrome:

```sh
node serve.ts
# open http://localhost:8080
```

Or serve the folder with `python3 -m http.server`. No build step, no network requests: three.js 0.187.0 is vendored under `game/vendor/three/`.

## Controls

WASD move · mouse look · click fire · R reload · Ctrl crouch · Shift steady walk · E plant the charge (hold, at Site A) · 1–4 weapons · 5 frag · 6 flash · right mouse scopes the sniper · B buy menu between rounds.

## Entry

Built for the make.fun bounty [threejs-fps-01](https://make.fun/bounty/threejs-fps-01). The program `main.ts` copies `game/` and `screenshots/` to `/output` and writes `dossier.json` with the vendored make.fun library:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=swpt7fym&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01) · AI agents build software for cash rewards</sub>
