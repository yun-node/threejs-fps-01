// bots.js — enemy bot AI: waypoint patrol, holding angles, vision cones, hearing,
// engaging with spread fire, and defusing a planted charge. One job: the bots.
import * as THREE from 'three';
import { WAYPOINTS, BOT_SPAWNS, collideCircle } from './map.js';

const BOT_HP = 100;
const SEE_DIST = 30, SEE_HALF_ANGLE = 1.0; // ~57 deg half-cone
const HEAR_DIST = 26;

let botGeo = null, botMats = null;
function assets() {
  if (botGeo) return;
  botGeo = {
    torso: new THREE.BoxGeometry(0.56, 0.72, 0.32),
    head: new THREE.BoxGeometry(0.3, 0.3, 0.3),
    leg: new THREE.BoxGeometry(0.2, 0.62, 0.24),
    gun: new THREE.BoxGeometry(0.08, 0.12, 0.7),
  };
  botMats = {
    torso: new THREE.MeshLambertMaterial({ color: 0xb0502e, emissive: 0x180402 }),
    head: new THREE.MeshLambertMaterial({ color: 0xd8b088 }),
    leg: new THREE.MeshLambertMaterial({ color: 0x3a3a40 }),
    gun: new THREE.MeshLambertMaterial({ color: 0x2a2a2a }),
  };
}

function makeBotMesh() {
  assets();
  const g = new THREE.Group();
  const torso = new THREE.Mesh(botGeo.torso, botMats.torso.clone());
  torso.position.y = 1.08;
  const head = new THREE.Mesh(botGeo.head, botMats.head.clone());
  head.position.y = 1.62;
  const legL = new THREE.Mesh(botGeo.leg, botMats.leg);
  legL.position.set(-0.15, 0.31, 0);
  const legR = new THREE.Mesh(botGeo.leg, botMats.leg);
  legR.position.set(0.15, 0.31, 0);
  const gun = new THREE.Mesh(botGeo.gun, botMats.gun);
  gun.position.set(0.2, 1.15, 0.3);
  g.add(torso, head, legL, legR, gun);
  g.userData = { torso, head };
  return g;
}

// Ray vs sphere, no allocation beyond the caller's temps.
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return -1;
  return tca - Math.sqrt(r * r - d2);
}

export function spawnBots(S, count) {
  const bots = [];
  for (let i = 0; i < count; i++) {
    const wp = WAYPOINTS[BOT_SPAWNS[i % BOT_SPAWNS.length]];
    const mesh = makeBotMesh();
    mesh.position.set(wp.x + (Math.random() - 0.5) * 2, 0, wp.z + (Math.random() - 0.5) * 2);
    S.scene.add(mesh);
    bots.push({
      id: i, mesh, x: mesh.position.x, z: mesh.position.z,
      yaw: Math.random() * Math.PI * 2, hp: BOT_HP, alive: true,
      state: 'patrol', wp: BOT_SPAWNS[i % BOT_SPAWNS.length],
      destX: wp.x, destZ: wp.z, holdUntil: 0,
      lastSeenX: 0, lastSeenZ: 0, lastSeenAt: -99,
      fireAt: S.time + 0.5 + Math.random(), blindUntil: 0,
      defuseAt: 0, strafeDir: Math.random() < 0.5 ? 1 : -1, strafeUntil: 0,
      flashUntil: 0,
    });
  }
  return bots;
}

export function removeBots(S) {
  for (const b of S.bots) S.scene.remove(b.mesh);
  S.bots = [];
}

function hasLOS(S, fromX, fromY, fromZ, toX, toY, toZ) {
  const dx = toX - fromX, dy = toY - fromY, dz = toZ - fromZ;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.01) return true;
  S.ray.set(S.tmpV.set(fromX, fromY, fromZ), S.tmpV2.set(dx / dist, dy / dist, dz / dist));
  const hits = S.ray.intersectObjects(S.map.occluders, false);
  return hits.length === 0 || hits[0].distance > dist - 0.1;
}

function seesPlayer(S, b) {
  const p = S.player;
  if (!p.alive) return false;
  const dx = p.x - b.x, dz = p.z - b.z;
  const dist = Math.hypot(dx, dz);
  if (dist > SEE_DIST) return false;
  const toYaw = Math.atan2(-dx, -dz); // yaw whose forward (-sin,-cos) points at player
  let d = toYaw - b.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) > SEE_HALF_ANGLE && dist > 4) return false;
  return hasLOS(S, b.x, 1.5, b.z, p.x, p.eyeY - 0.15, p.z);
}

function moveToward(S, b, tx, tz, speed, dt) {
  const dx = tx - b.x, dz = tz - b.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return true;
  const step = Math.min(d, speed * dt);
  b.x += (dx / d) * step;
  b.z += (dz / d) * step;
  const c = collideCircle(S.map.colliders, b.x, b.z, 0.42);
  b.x = c.x; b.z = c.z;
  b.yaw = Math.atan2(-(dx / d), -(dz / d));
  return d < 0.6;
}

function botFire(S, b) {
  const p = S.player;
  const gx = b.x, gy = 1.35, gz = b.z;
  // Aim at the player's chest with error that grows with distance and target speed.
  const pSpeed = Math.hypot(p.vx, p.vz);
  const dist = Math.hypot(p.x - b.x, p.z - b.z);
  const err = 0.03 + dist * 0.006 + pSpeed * 0.012 + (p.crouch ? -0.015 : 0);
  const tx = p.x + (Math.random() - 0.5) * 2 * err * dist;
  const ty = (p.eyeY - 0.35) + (Math.random() - 0.5) * 2 * err * dist;
  const tz = p.z + (Math.random() - 0.5) * 2 * err * dist;
  let dx = tx - gx, dy = ty - gy, dz = tz - gz;
  const len = Math.hypot(dx, dy, dz);
  dx /= len; dy /= len; dz /= len;
  // Wall occlusion first.
  S.ray.set(S.tmpV.set(gx, gy, gz), S.tmpV2.set(dx, dy, dz));
  const wall = S.ray.intersectObjects(S.map.occluders, false);
  const wallDist = wall.length ? wall[0].distance : Infinity;
  // Player body spheres: chest r=0.42 at eyeY-0.3, head r=0.22 at eyeY.
  const tBody = raySphere(gx, gy, gz, dx, dy, dz, p.x, p.eyeY - 0.3, p.z, 0.42);
  const tHead = raySphere(gx, gy, gz, dx, dy, dz, p.x, p.eyeY, p.z, 0.22);
  let hit = null, hitDist = Infinity;
  if (tBody >= 0 && tBody < hitDist) { hit = 'body'; hitDist = tBody; }
  if (tHead >= 0 && tHead < hitDist) { hit = 'head'; hitDist = tHead; }
  let endX = gx + dx * Math.min(wallDist, 40), endY = gy + dy * Math.min(wallDist, 40), endZ = gz + dz * Math.min(wallDist, 40);
  if (hit && hitDist < wallDist) {
    endX = gx + dx * hitDist; endY = gy + dy * hitDist; endZ = gz + dz * hitDist;
    const dmg = (hit === 'head' ? 16 : 8) + Math.random() * 5;
    S.events.push({ type: 'playerHurt', amount: Math.round(dmg) });
  }
  S.tracers.push({ x1: gx, y1: gy, z1: gz, x2: endX, y2: endY, z2: endZ, life: 0.09, enemy: true });
  S.audio.enemyShot();
  b.fireAt = S.time + 0.6 + Math.random() * 0.5;
}

export function updateBots(S, dt) {
  const p = S.player;
  for (const b of S.bots) {
    if (!b.alive) continue;
    const blind = S.time < b.blindUntil;
    // Vision is throttled: a bot re-checks line of sight ~8x a second, staggered.
    if (!blind && S.time >= (b.seeAt || 0)) {
      b.seeAt = S.time + 0.12 + Math.random() * 0.06;
      if (seesPlayer(S, b)) {
        b.state = 'engage';
        b.lastSeenX = p.x; b.lastSeenZ = p.z; b.lastSeenAt = S.time;
      } else if (b.state === 'engage' && S.time - b.lastSeenAt > 2.5) {
        b.state = 'investigate';
        b.destX = b.lastSeenX; b.destZ = b.lastSeenZ;
      }
    } else if (b.state === 'engage' && S.time - b.lastSeenAt > 2.5) {
      b.state = 'investigate';
      b.destX = b.lastSeenX; b.destZ = b.lastSeenZ;
    }
    // Hearing: gunfire pulls nearby bots to investigate
    if (S.noiseAt > S.time - 0.1 && b.state !== 'engage') {
      const nd = Math.hypot(S.noiseX - b.x, S.noiseZ - b.z);
      if (nd < HEAR_DIST) { b.state = 'investigate'; b.destX = S.noiseX; b.destZ = S.noiseZ; }
    }
    // Bomb planted: nearest bot goes to defuse
    if (S.bomb.state === 'planted' && b.state !== 'engage') {
      b.state = 'defuse';
      b.destX = S.bomb.x; b.destZ = S.bomb.z;
    }
    if (blind) {
      // Stand still, disoriented.
    } else if (b.state === 'engage') {
      // Face the player, strafe, shoot.
      const dx = p.x - b.x, dz = p.z - b.z;
      b.yaw = Math.atan2(-dx, -dz);
      if (S.time > b.strafeUntil) {
        b.strafeDir = Math.random() < 0.5 ? 1 : -1;
        b.strafeUntil = S.time + 0.7 + Math.random() * 0.9;
      }
      const dist = Math.hypot(dx, dz);
      if (dist > 14) moveToward(S, b, p.x, p.z, 2.2, dt);
      else if (dist < 5) moveToward(S, b, b.x - dx, b.z - dz, 1.6, dt);
      else {
        // strafe perpendicular
        const px = -dz / dist * b.strafeDir, pz = dx / dist * b.strafeDir;
        const c = collideCircle(S.map.colliders, b.x + px * 1.8 * dt, b.z + pz * 1.8 * dt, 0.42);
        b.x = c.x; b.z = c.z;
      }
      if (p.alive && S.time >= b.fireAt) botFire(S, b);
    } else if (b.state === 'investigate' || b.state === 'defuse') {
      const arrived = moveToward(S, b, b.destX, b.destZ, b.state === 'defuse' ? 3.6 : 3.0, dt);
      if (arrived) {
        if (b.state === 'investigate') { b.state = 'patrol'; b.holdUntil = S.time + 1.5 + Math.random() * 2; }
        else if (b.state === 'defuse') {
          // Channel the defuse.
          if (b.defuseAt === 0) b.defuseAt = S.time;
          const prog = (S.time - b.defuseAt) / 5;
          S.defuseProgress = Math.max(S.defuseProgress, prog);
          if (prog >= 1) S.events.push({ type: 'bombDefused' });
        }
      } else b.defuseAt = 0;
    } else { // patrol / hold
      if (S.time < b.holdUntil) {
        // Hold the angle: slow scan.
        b.yaw += Math.sin(S.time * 0.7 + b.id) * dt * 0.5;
      } else {
        const wp = WAYPOINTS[b.wp];
        const arrived = moveToward(S, b, wp.x, wp.z, 2.6, dt);
        if (arrived) {
          const links = wp.links;
          b.wp = links[Math.floor(Math.random() * links.length)];
          if (Math.random() < 0.45) b.holdUntil = S.time + 2 + Math.random() * 2.5;
        }
      }
    }
    // Sync mesh
    b.mesh.position.x = b.x;
    b.mesh.position.z = b.z;
    b.mesh.rotation.y = b.yaw;
    // Hit flash fades
    if (b.flashUntil > S.time) {
      b.mesh.userData.torso.material.emissive.setHex(0x661111);
    } else {
      b.mesh.userData.torso.material.emissive.setHex(0x000000);
    }
  }
}

export function damageBot(S, bot, amount, part) {
  if (!bot.alive) return;
  bot.hp -= amount;
  bot.flashUntil = S.time + 0.08;
  if (bot.hp <= 0) {
    bot.hp = 0;
    bot.alive = false;
    bot.mesh.rotation.z = Math.PI / 2;
    bot.mesh.position.y = 0.25;
    S.events.push({ type: 'botKilled', bot, part });
  } else {
    // Getting shot snaps the bot to the shooter.
    bot.state = 'engage';
    bot.lastSeenX = S.player.x; bot.lastSeenZ = S.player.z; bot.lastSeenAt = S.time;
  }
}
