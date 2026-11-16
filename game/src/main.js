// main.js — bootstrap, render loop (fixed-step sim, separate render), viewmodel,
// tracer/grenade/explosion visuals, round state machine. One job: run the game.
import * as THREE from 'three';
import { buildMap, MAP } from './map.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { newArsenal, WEAPONS } from './weapons.js';
import { newState, startRound, step, STEP, buyItem, MAX_ROUNDS } from './sim.js';
import { newPlayer } from './player.js';

const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
// ?pr= scales the render resolution (testing aid; default is the device ratio).
const prParam = Number(new URLSearchParams(location.search).get('pr'));
renderer.setPixelRatio(Number.isFinite(prParam) && prParam > 0 ? prParam : Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.05, 200);
camera.rotation.order = 'YXZ';
scene.add(camera);

const map = buildMap(scene);
const audio = createAudio();
const hud = createHud();
const input = createInput(renderer.domElement);

const S = newState(scene, camera, audio, hud);
S.map = map;
S.arsenal = newArsenal();
S.buyItem = (id) => buyItem(S, id);

// Damage vignette (created here so index.html stays lean).
const vignette = document.createElement('div');
vignette.style.cssText = 'position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 55%,rgba(220,40,20,.55) 100%);opacity:0;z-index:5';
document.body.appendChild(vignette);

// --- Viewmodel gun ---
const gun = new THREE.Group();
{
  const dark = new THREE.MeshLambertMaterial({ color: 0x8a9298, emissive: 0x1a1d1f });
  const accent = new THREE.MeshLambertMaterial({ color: 0xb08030, emissive: 0x2a1c05 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.55), dark);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.34), dark);
  barrel.position.set(0, 0.03, -0.42);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.1), accent);
  grip.position.set(0, -0.12, 0.18);
  gun.add(body, barrel, grip);
  gun.position.set(0.28, -0.24, -0.5);
  camera.add(gun);
}
let gunKick = 0;

// --- Tracer pool (no per-frame allocation) ---
const TRACERS = 32;
const tracerPool = [];
for (let i = 0; i < TRACERS; i++) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  scene.add(line);
  tracerPool.push(line);
}
function syncTracers() {
  for (let i = 0; i < TRACERS; i++) {
    const line = tracerPool[i];
    const t = S.tracers[i];
    if (!t) { line.material.opacity = 0; continue; }
    const pos = line.geometry.attributes.position.array;
    pos[0] = t.x1; pos[1] = t.y1; pos[2] = t.z1;
    pos[3] = t.x2; pos[4] = t.y2; pos[5] = t.z2;
    line.geometry.attributes.position.needsUpdate = true;
    line.material.color.setHex(t.enemy ? 0xff6a3a : 0xffd27a);
    line.material.opacity = Math.min(1, t.life / 0.05);
  }
}

// --- Grenade + explosion visuals ---
const grenadeMeshes = new Map();
const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
const grenadeMatFrag = new THREE.MeshLambertMaterial({ color: 0x3a5a2a });
const grenadeMatFlash = new THREE.MeshLambertMaterial({ color: 0xd8d8d8 });
const explosions = [];
const explosionGeo = new THREE.SphereGeometry(1, 16, 12);
function syncGrenades() {
  const seen = new Set();
  for (const g of S.grenades) {
    seen.add(g);
    let m = grenadeMeshes.get(g);
    if (!m) {
      m = new THREE.Mesh(grenadeGeo, g.kind === 'frag' ? grenadeMatFrag : grenadeMatFlash);
      scene.add(m);
      grenadeMeshes.set(g, m);
    }
    m.position.set(g.x, g.y, g.z);
  }
  for (const [g, m] of grenadeMeshes) {
    if (!seen.has(g)) { scene.remove(m); grenadeMeshes.delete(g); }
  }
}
function spawnExplosion(x, y, z, big) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffa62e, transparent: true, opacity: 0.9 });
  const m = new THREE.Mesh(explosionGeo, mat);
  m.position.set(x, y, z);
  m.scale.setScalar(0.3);
  scene.add(m);
  explosions.push({ mesh: m, life: big ? 0.8 : 0.45, max: big ? 0.8 : 0.45, size: big ? 7 : 3.5 });
}

// --- Bomb mesh (shown when planted) ---
const bombMesh = new THREE.Group();
{
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.36), new THREE.MeshLambertMaterial({ color: 0x222222, emissive: 0x330000 }));
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  light.position.set(0.2, 0.14, 0);
  bombMesh.add(b, light);
  bombMesh.visible = false;
  scene.add(bombMesh);
}

// --- UI wiring ---
document.getElementById('play').addEventListener('click', () => {
  audio.unlock();
  input.requestLock();
  S.phase = 'buy';
  hud.showBuy(S);
});
document.getElementById('deploy').addEventListener('click', () => {
  audio.unlock();
  input.requestLock();
  startRound(S);
});
document.getElementById('restart').addEventListener('click', () => {
  audio.unlock();
  S.round = 1; S.score = { won: 0, lost: 0 }; S.kills = 0; S.money = 800;
  S.player = newPlayer();
  S.arsenal = newArsenal();
  S.phase = 'buy';
  hud.showBuy(S);
});
renderer.domElement.addEventListener('click', () => {
  if (S.phase === 'playing') input.requestLock();
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- Debug / automation API (used by the playtest + screenshot scripts) ---
window.FOUNDRY = {
  S,
  start: () => { S.phase = 'buy'; hud.showBuy(S); },
  deploy: () => startRound(S),
  setYawPitch: (yaw, pitch) => { S.player.yaw = yaw; S.player.pitch = pitch; },
  teleport: (x, z) => { S.player.x = x; S.player.z = z; },
  giveMoney: (n) => { S.money += n; },
  buy: (id) => buyItem(S, id),
  fire: () => { input.mouseDown = true; setTimeout(() => { input.mouseDown = false; }, 120); },
  setFire: (b) => { input.mouseDown = !!b; },
  syncCamera: () => { camera.rotation.y = S.player.yaw; camera.rotation.x = S.player.pitch; },
  setKey: (code, down) => { if (down) input.keys.add(code); else input.keys.delete(code); },
  pressKey: (code) => { input.pressed.add(code); },
  // Aim at the nearest alive bot with a clear line of sight (testing aid).
  aimAtClear: () => {
    const p = S.player;
    for (const b of S.bots) {
      if (!b.alive) continue;
      const dx = b.x - p.x, dz = b.z - p.z;
      const dist = Math.hypot(dx, dz);
      S.ray.set(S.tmpV.set(p.x, p.eyeY, p.z), S.tmpV2.set(dx / dist, (1.3 - p.eyeY) / dist, dz / dist));
      const hits = S.ray.intersectObjects(S.map.occluders, false);
      if (hits.length && hits[0].distance < dist - 0.5) continue;
      S.player.yaw = Math.atan2(-dx, -dz);
      S.player.pitch = Math.atan2(1.3 - p.eyeY, dist);
      return { bot: b.id, dist: +dist.toFixed(1) };
    }
    return null;
  },
  // Advance the fixed-step sim synchronously, without rendering (testing aid).
  stepSim: (n) => { for (let i = 0; i < n; i++) step(S, STEP, input); },
  plant: () => { S.player.x = MAP.site.x; S.player.z = MAP.site.z + 1; S.plantProgress = 1; },
  aliveBots: () => S.bots.filter((b) => b.alive).length,
  killAllBots: () => { for (const b of S.bots) if (b.alive) { b.hp = 0; b.alive = false; b.mesh.rotation.z = Math.PI / 2; b.mesh.position.y = 0.25; } },
  state: () => ({
    phase: S.phase, round: S.round, hp: S.player.hp, money: S.money,
    score: S.score, botsAlive: S.bots.filter((b) => b.alive).length,
    bomb: S.bomb.state, ammo: S.arsenal.mag[S.arsenal.current],
  }),
};

// --- Main loop: fixed-step sim, render every frame ---
let last = performance.now();
let acc = 0;
const STEP_MS = STEP * 1000;
function frame(now) {
  requestAnimationFrame(frame);
  let dtMs = now - last;
  last = now;
  if (dtMs > 250) dtMs = 250; // tab was in background
  acc += dtMs;
  let n = 0;
  while (acc >= STEP_MS && n < 5) {
    // Buy-phase keyboard shortcuts + deploy.
    if (S.phase === 'buy') {
      const ids = ['pistol', 'smg', 'rifle', 'sniper', 'frag', 'flash'];
      for (let i = 0; i < 6; i++) if (input.wasPressed(`Digit${i + 1}`)) buyItem(S, ids[i]);
      if (input.wasPressed('Enter')) startRound(S);
    }
    if (S.phase === 'menu' && input.wasPressed('Enter')) {
      S.phase = 'buy'; hud.showBuy(S);
    }
    step(S, STEP, input);
    input.endFrame();
    acc -= STEP_MS;
    n++;
  }
  if (n === 5) acc = 0;
  // Drain visual fx pushed by the sim.
  for (const fx of S.fx) {
    if (fx.type === 'explosion') spawnExplosion(fx.x, fx.y, fx.z, fx.big);
    if (fx.type === 'flash') spawnExplosion(fx.x, fx.y, fx.z, false);
  }
  S.fx.length = 0;
  // Camera follows the player.
  const p = S.player;
  camera.position.set(p.x, p.eyeY, p.z);
  camera.rotation.y = p.yaw;
  camera.rotation.x = p.pitch;
  // Scope zoom on right mouse with the sniper.
  const targetFov = (input.mouseDownR && S.arsenal.current === 'sniper') ? 30 : 74;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * 0.2;
    camera.updateProjectionMatrix();
  }
  // Viewmodel kick + sway.
  gunKick = Math.max(0, gunKick - 0.004);
  gun.position.z = -0.5 + gunKick;
  gun.position.x = 0.28 + Math.sin(S.time * 1.4) * 0.004 * Math.min(1, Math.hypot(p.vx, p.vz) / 5);
  if (input.mouseDown && S.arsenal.mag[S.arsenal.current] > 0) gunKick = Math.min(0.09, gunKick + 0.02);
  // Bomb mesh + blinking light.
  bombMesh.visible = S.bomb.state === 'planted';
  if (bombMesh.visible) {
    bombMesh.position.set(S.bomb.x, 0.15, S.bomb.z);
    bombMesh.children[1].visible = Math.sin(S.time * 8) > 0;
  }
  // Explosions grow and fade.
  for (let i = explosions.length - 1; i >= 0; i--) {
    const e = explosions[i];
    e.life -= dtMs / 1000;
    const k = 1 - e.life / e.max;
    e.mesh.scale.setScalar(0.3 + k * e.size);
    e.mesh.material.opacity = Math.max(0, 0.9 * (1 - k));
    if (e.life <= 0) { scene.remove(e.mesh); e.mesh.material.dispose(); explosions.splice(i, 1); }
  }
  syncTracers();
  syncGrenades();
  // Damage vignette fades.
  S.hudFlash = Math.max(0, S.hudFlash - dtMs / 900);
  vignette.style.opacity = String(S.hudFlash * 0.9);
  hud.update(S);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
