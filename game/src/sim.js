// sim.js — fixed-step world update (60 Hz), separate from rendering.
// One job: advance the game state one tick and resolve round outcomes.
import * as THREE from 'three';
import { WEAPONS, canFire, startReload, finishReload, currentSpread, throwGrenade } from './weapons.js';
import { updatePlayer, damagePlayer, newPlayer } from './player.js';
import { spawnBots, removeBots, updateBots, damageBot } from './bots.js';
import { MAP } from './map.js';

export const STEP = 1 / 60;
export const MAX_ROUNDS = 8;
const PLANT_TIME = 3, BOMB_TIME = 35, DEFUSE_TIME = 5;

export function newState(scene, camera, audio, hud) {
  return {
    scene, camera, audio, hud,
    phase: 'menu', // menu | buy | playing | roundEnd | matchEnd
    round: 1, score: { won: 0, lost: 0 }, kills: 0,
    money: 800, time: 0, roundTimeLeft: MAP.roundTime,
    player: newPlayer(), arsenal: null, bots: [],
    bomb: { state: 'carried', x: 0, z: 0, timer: BOMB_TIME },
    plantProgress: 0, defuseProgress: 0,
    grenades: [], tracers: [], events: [], fx: [],
    noiseX: 0, noiseZ: 0, noiseAt: -99,
    aiming: false, spreadPx: 0, hudFlash: 0,
    roundEndAt: 0, endReason: '',
    map: null, ray: new THREE.Raycaster(),
    tmpV: new THREE.Vector3(), tmpV2: new THREE.Vector3(), tmpDir: new THREE.Vector3(),
    botCount: 0,
  };
}

export function startRound(S) {
  removeBots(S);
  const p = S.player;
  p.x = MAP.playerSpawn.x; p.z = MAP.playerSpawn.z;
  p.yaw = MAP.playerSpawn.yaw; p.pitch = 0;
  p.vx = 0; p.vz = 0; p.hp = p.maxHp; p.alive = true; p.bloom = 0;
  // Refill reserve ammo for owned weapons each round.
  for (const id in S.arsenal.owned) {
    if (!S.arsenal.owned[id]) continue;
    S.arsenal.reserve[id] = WEAPONS[id].reserve;
    if (S.arsenal.mag[id] < WEAPONS[id].mag) S.arsenal.mag[id] = WEAPONS[id].mag;
  }
  S.botCount = Math.min(3 + (S.round - 1), 5);
  S.bots = spawnBots(S, S.botCount);
  S.bomb = { state: 'carried', x: 0, z: 0, timer: BOMB_TIME };
  S.plantProgress = 0; S.defuseProgress = 0;
  S.grenades = []; S.tracers = [];
  S.roundTimeLeft = MAP.roundTime;
  S.phase = 'playing';
  S.hud.hideAll();
  S.hud.feedLine(`<b>Round ${S.round}</b> — ${S.botCount} hostiles on the floor`);
}

function endRound(S, won, reason) {
  if (S.phase !== 'playing') return;
  S.phase = 'roundEnd';
  S.endReason = reason;
  if (won) { S.score.won++; S.money += 600; } else { S.score.lost++; S.money += 300; }
  S.roundEndAt = S.time + 3.5;
  S.hud.banner(won, won ? 'ROUND WON' : 'ROUND LOST', reason);
  if (won) S.audio.win(); else S.audio.lose();
}

function aliveBots(S) { let n = 0; for (const b of S.bots) if (b.alive) n++; return n; }

function playerFire(S) {
  const a = S.arsenal;
  const w = WEAPONS[a.current];
  if (a.reloading > 0) return;
  if (a.mag[a.current] <= 0) { S.audio.dry(); a.lastShot = S.time; return; }
  if (!canFire(S)) return;
  a.lastShot = S.time;
  a.mag[a.current]--;
  // Spread + recoil
  const spread = currentSpread(S);
  const cam = S.camera;
  const dir = S.tmpDir.set(0, 0, -1).applyQuaternion(cam.quaternion);
  dir.x += (Math.random() - 0.5) * 2 * spread;
  dir.y += (Math.random() - 0.5) * 2 * spread;
  dir.z += (Math.random() - 0.5) * 2 * spread;
  dir.normalize();
  const origin = S.tmpV.set(S.player.x, S.player.eyeY, S.player.z);
  S.ray.set(origin, dir);
  S.ray.far = 120;
  // Targets: bot meshes + walls. Collect bot meshes first.
  const targets = [];
  for (const b of S.bots) if (b.alive) targets.push(b.mesh);
  const hits = S.ray.intersectObjects([...S.map.occluders, ...targets], true);
  let endX = origin.x + dir.x * 60, endY = origin.y + dir.y * 60, endZ = origin.z + dir.z * 60;
  if (hits.length) {
    const h = hits[0];
    endX = h.point.x; endY = h.point.y; endZ = h.point.z;
    // Walk up to the bot group to find which bot and which part.
    let node = h.object, bot = null, part = 'body';
    while (node) {
      for (const b of S.bots) if (b.mesh === node) { bot = b; break; }
      if (bot) break;
      if (node.userData && node.userData.part) part = node.userData.part;
      node = node.parent;
    }
    if (bot) {
      const isHead = h.object === bot.mesh.userData.head;
      const dmg = Math.round(w.damage * (isHead ? w.headMult : 1));
      damageBot(S, bot, dmg, isHead ? 'head' : 'body');
      S.hud.hitmarker(!bot.alive);
      S.audio.hit();
      if (!bot.alive) S.audio.kill();
    }
  }
  S.tracers.push({ x1: origin.x, y1: origin.y - 0.12, z1: origin.z, x2: endX, y2: endY, z2: endZ, life: 0.07, enemy: false });
  S.audio.shot(a.current);
  S.player.bloom = Math.min(0.06, S.player.bloom + w.kick * 0.5);
  S.player.pitch += w.kick * 0.6; // recoil kick
  S.noiseX = S.player.x; S.noiseZ = S.player.z; S.noiseAt = S.time;
  if (a.mag[a.current] === 0) startReload(S);
}

function updateGrenades(S, dt) {
  for (let i = S.grenades.length - 1; i >= 0; i--) {
    const g = S.grenades[i];
    g.vy -= 14 * dt;
    g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
    if (g.y < 0.12) { g.y = 0.12; g.vy = -g.vy * 0.35; g.vx *= 0.6; g.vz *= 0.6; }
    if (g.x < MAP.minX + 0.3) { g.x = MAP.minX + 0.3; g.vx = -g.vx * 0.5; }
    if (g.x > MAP.maxX - 0.3) { g.x = MAP.maxX - 0.3; g.vx = -g.vx * 0.5; }
    if (g.z < MAP.minZ + 0.3) { g.z = MAP.minZ + 0.3; g.vz = -g.vz * 0.5; }
    if (g.z > MAP.maxZ - 0.3) { g.z = MAP.maxZ - 0.3; g.vz = -g.vz * 0.5; }
    g.fuse -= dt;
    if (g.fuse <= 0) {
      explodeGrenade(S, g);
      S.grenades.splice(i, 1);
    }
  }
}

function explodeGrenade(S, g) {
  if (g.kind === 'frag') {
    S.audio.explosion();
    S.fx.push({ type: 'explosion', x: g.x, y: g.y, z: g.z, big: true });
    for (const b of S.bots) {
      if (!b.alive) continue;
      const d = Math.hypot(b.x - g.x, b.z - g.z);
      if (d < 7) damageBot(S, b, Math.round(110 * (1 - d / 7) + 15), 'body');
    }
    const pd = Math.hypot(S.player.x - g.x, S.player.z - g.z);
    if (pd < 4 && S.player.alive) S.events.push({ type: 'playerHurt', amount: Math.round(50 * (1 - pd / 4)) });
  } else {
    // Flash: blind bots that can see the burst.
    S.fx.push({ type: 'flash', x: g.x, y: g.y, z: g.z });
    for (const b of S.bots) {
      if (!b.alive) continue;
      const d = Math.hypot(b.x - g.x, b.z - g.z);
      if (d > 22) continue;
      const dx = g.x - b.x, dz = g.z - b.z;
      const toYaw = Math.atan2(-dx, -dz);
      let dd = toYaw - b.yaw;
      while (dd > Math.PI) dd -= Math.PI * 2;
      while (dd < -Math.PI) dd += Math.PI * 2;
      if (Math.abs(dd) < 1.4) b.blindUntil = S.time + 3;
    }
  }
}

function updateBomb(S, dt, inp) {
  const p = S.player;
  const site = MAP.site;
  const nearSite = Math.hypot(p.x - site.x, p.z - site.z) < site.r;
  if (S.bomb.state === 'carried') {
    if (nearSite && p.alive && inp.keys.has('KeyE')) {
      S.plantProgress += dt / PLANT_TIME;
      if (Math.random() < dt * 2) S.audio.plantBeep();
      if (S.plantProgress >= 1) {
        S.bomb.state = 'planted';
        S.bomb.x = p.x; S.bomb.z = p.z; S.bomb.timer = BOMB_TIME;
        S.hud.feedLine('<b>Charge planted</b> — hold the site');
        S.events.push({ type: 'planted' });
      }
    } else S.plantProgress = Math.max(0, S.plantProgress - dt * 2);
  } else if (S.bomb.state === 'planted') {
    S.bomb.timer -= dt;
    if (S.bomb.timer < 10 && Math.random() < dt * 1.5) S.audio.bombBeep();
    if (S.bomb.timer <= 0) {
      S.bomb.state = 'exploded';
      S.audio.explosion();
      S.fx.push({ type: 'explosion', x: S.bomb.x, y: 1, z: S.bomb.z, big: true });
      endRound(S, true, 'The charge blew Site A — the floor is yours.');
    }
  }
  S.hud.hint(S.bomb.state === 'carried' && nearSite && p.alive ? 'Hold E to plant the charge' : '');
}

function processEvents(S) {
  for (const e of S.events) {
    if (e.type === 'playerHurt') damagePlayer(S, e.amount);
    else if (e.type === 'botKilled') {
      S.money += 300; S.kills++;
      S.hud.feedLine(`<b>You</b> dropped a hostile ${e.part === 'head' ? '(headshot)' : ''} — +$300`);
    } else if (e.type === 'bombDefused') {
      endRound(S, false, 'Hostiles defused the charge.');
    }
  }
  S.events.length = 0;
}

export function step(S, dt, inp) {
  S.time += dt;
  if (S.phase === 'playing') {
    S.roundTimeLeft -= dt;
    updatePlayer(S, dt, inp);
    updateBots(S, dt);
    updateGrenades(S, dt);
    updateBomb(S, dt, inp);
    // Weapon input
    const a = S.arsenal;
    if (a.reloading > 0) {
      a.reloading -= dt;
      if (a.reloading <= 0) finishReload(S);
    }
    if (inp.mouseDown) playerFire(S);
    if (inp.wasPressed('KeyR')) startReload(S);
    // Weapon slots
    const slots = ['pistol', 'smg', 'rifle', 'sniper'];
    for (let i = 0; i < 4; i++) {
      if (inp.wasPressed(`Digit${i + 1}`) && a.owned[slots[i]]) {
        a.current = slots[i];
        a.reloading = 0;
      }
    }
    if (inp.wasPressed('Digit5')) throwGrenade(S, 'frag');
    if (inp.wasPressed('Digit6')) throwGrenade(S, 'flash');
    // Spread readout for the crosshair
    S.spreadPx = currentSpread(S) * 900;
    // Round end checks
    if (!S.player.alive) endRound(S, false, 'You went down — the floor belongs to the hostiles.');
    else if (aliveBots(S) === 0 && S.bomb.state !== 'planted') endRound(S, true, 'All hostiles eliminated.');
    else if (S.roundTimeLeft <= 0) endRound(S, false, 'Time expired — the defence holds Site A.');
  } else if (S.phase === 'roundEnd') {
    if (S.time >= S.roundEndAt) {
      S.hud.hideBanner();
      if (S.round >= MAX_ROUNDS) {
        S.phase = 'matchEnd';
        S.hud.showEnd(S.score.won, S.score.lost);
      } else {
        S.round++;
        S.phase = 'buy';
        S.hud.showBuy(S);
      }
    }
  }
  processEvents(S);
  // Tracer lifetimes
  for (let i = S.tracers.length - 1; i >= 0; i--) {
    S.tracers[i].life -= dt;
    if (S.tracers[i].life <= 0) S.tracers.splice(i, 1);
  }
}

export function buyItem(S, id) {
  if (S.phase !== 'buy' && S.phase !== 'menu') return false;
  const a = S.arsenal;
  if (id in WEAPONS) {
    const w = WEAPONS[id];
    if (a.owned[id]) { a.current = id; return true; }
    if (S.money < w.price) return false;
    S.money -= w.price;
    a.owned[id] = true;
    a.current = id;
    S.audio.buy();
    if (S.phase === 'buy') S.hud.showBuy(S);
    return true;
  }
  const g = { frag: 300, flash: 200 }[id];
  if (g === undefined) return false;
  if (S.money < g) return false;
  S.money -= g;
  a.grenades[id]++;
  S.audio.buy();
  if (S.phase === 'buy') S.hud.showBuy(S);
  return true;
}
