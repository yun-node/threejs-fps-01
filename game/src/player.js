// player.js — player state, acceleration movement, crouch, health, money.
// One job: the player's body in the world.
import { collideCircle, MAP } from './map.js';

export function newPlayer() {
  return {
    x: MAP.playerSpawn.x, z: MAP.playerSpawn.z,
    yaw: MAP.playerSpawn.yaw, pitch: 0,
    vx: 0, vz: 0, radius: 0.42,
    hp: 100, maxHp: 100, alive: true,
    crouch: false, eyeY: 1.62, bloom: 0,
    stepAcc: 0,
  };
}

const WALK = 5.4, CROUCH_SPEED = 2.7, AIM_SPEED = 3.4, ACCEL = 46, FRICTION = 12;

export function updatePlayer(S, dt, inp) {
  const p = S.player;
  if (!p.alive) return;
  // Look
  const m = inp.consumeMouse();
  p.yaw -= m.dx * 0.0021;
  p.pitch -= m.dy * 0.0021;
  p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch));
  p.crouch = inp.keys.has('ControlLeft') || inp.keys.has('ControlRight');
  const aiming = inp.mouseDownR;
  S.aiming = aiming;
  const speed = p.crouch ? CROUCH_SPEED : aiming ? AIM_SPEED : WALK;
  // Wish direction in world space
  let fx = 0, fz = 0;
  if (inp.keys.has('KeyW')) fz -= 1;
  if (inp.keys.has('KeyS')) fz += 1;
  if (inp.keys.has('KeyA')) fx -= 1;
  if (inp.keys.has('KeyD')) fx += 1;
  const len = Math.hypot(fx, fz) || 1;
  fx /= len; fz /= len;
  // forward is -z rotated by yaw: forward = (-sin(yaw), -cos(yaw)), right = (cos(yaw), -sin(yaw))
  const fwdX = -Math.sin(p.yaw), fwdZ = -Math.cos(p.yaw);
  const rightX = Math.cos(p.yaw), rightZ = -Math.sin(p.yaw);
  const wishX = rightX * fx + fwdX * (-fz);
  const wishZ = rightZ * fx + fwdZ * (-fz);
  p.vx += wishX * ACCEL * dt;
  p.vz += wishZ * ACCEL * dt;
  // Friction / clamp to wish speed
  const sp = Math.hypot(p.vx, p.vz);
  const max = speed;
  if (sp > max) { p.vx *= max / sp; p.vz *= max / sp; }
  if (fx === 0 && fz === 0) {
    const damp = Math.max(0, 1 - FRICTION * dt);
    p.vx *= damp; p.vz *= damp;
  }
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  // Map bounds + AABB collision
  p.x = Math.max(MAP.minX + 0.6, Math.min(MAP.maxX - 0.6, p.x));
  p.z = Math.max(MAP.minZ + 0.6, Math.min(MAP.maxZ - 0.6, p.z));
  const c = collideCircle(S.map.colliders, p.x, p.z, p.radius);
  p.x = c.x; p.z = c.z;
  // Eye height eases toward crouch/stand
  const targetEye = p.crouch ? 1.08 : 1.62;
  p.eyeY += (targetEye - p.eyeY) * Math.min(1, dt * 12);
  // Bloom decays; footsteps
  p.bloom = Math.max(0, p.bloom - dt * 0.09);
  p.stepAcc += sp * dt;
  if (p.stepAcc > 2.4 && sp > 1) { p.stepAcc = 0; S.audio.step(); }
}

export function damagePlayer(S, amount) {
  const p = S.player;
  if (!p.alive) return;
  p.hp -= amount;
  S.audio.hurt();
  S.hudFlash = 1;
  if (p.hp <= 0) {
    p.hp = 0;
    p.alive = false;
  }
}
