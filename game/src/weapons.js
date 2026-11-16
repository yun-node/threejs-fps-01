// weapons.js — weapon definitions, fire / reload / spread / recoil, grenades.
// One job: everything about shooting.
export const WEAPONS = {
  pistol: { name: 'PISTOL', id: 'pistol', price: 0, damage: 26, headMult: 2, rate: 0.28, mag: 12, reserve: 36, reload: 1.3, spread: 0.011, auto: false, moveSpread: 0.02, kick: 0.011 },
  smg:    { name: 'SMG',    id: 'smg',    price: 900,  damage: 22, headMult: 2, rate: 0.08, mag: 25, reserve: 75, reload: 1.8, spread: 0.02,  auto: true,  moveSpread: 0.028, kick: 0.008 },
  rifle:  { name: 'RIFLE',  id: 'rifle',  price: 1500, damage: 33, headMult: 2, rate: 0.11, mag: 30, reserve: 90, reload: 2.1, spread: 0.014, auto: true,  moveSpread: 0.024, kick: 0.013 },
  sniper: { name: 'SNIPER', id: 'sniper', price: 2200, damage: 95, headMult: 2, rate: 1.1,  mag: 5,  reserve: 15, reload: 2.7, spread: 0.002, auto: false, moveSpread: 0.05,  kick: 0.05 },
};
export const GRENADES = {
  frag:  { name: 'FRAG GRENADE',  id: 'frag',  price: 300 },
  flash: { name: 'FLASHBANG',      id: 'flash', price: 200 },
};

export function newArsenal() {
  const a = { owned: { pistol: true }, current: 'pistol', mag: {}, reserve: {}, reloading: 0, reloadEnd: 0, lastShot: -9, grenades: { frag: 0, flash: 0 } };
  for (const id in WEAPONS) { a.mag[id] = WEAPONS[id].mag; a.reserve[id] = WEAPONS[id].reserve; }
  return a;
}

// Current spread in radians: base + movement + firing bloom + crouch/aim bonuses.
export function currentSpread(S) {
  const w = WEAPONS[S.arsenal.current];
  const p = S.player;
  const speed = Math.hypot(p.vx, p.vz);
  let s = w.spread + w.moveSpread * Math.min(1, speed / 5);
  if (p.crouch) s *= 0.7;
  if (S.aiming) s *= 0.55;
  s += p.bloom;
  return s;
}

export function canFire(S) {
  const a = S.arsenal;
  if (a.reloading > 0) return false;
  const w = WEAPONS[a.current];
  return S.time - a.lastShot >= w.rate && a.mag[a.current] > 0;
}

export function startReload(S) {
  const a = S.arsenal;
  const w = WEAPONS[a.current];
  if (a.reloading > 0 || a.mag[a.current] === w.mag || a.reserve[a.current] <= 0) return false;
  a.reloading = w.reload;
  S.audio.reload();
  return true;
}

export function finishReload(S) {
  const a = S.arsenal;
  const w = WEAPONS[a.current];
  const need = w.mag - a.mag[a.current];
  const take = Math.min(need, a.reserve[a.current]);
  a.mag[a.current] += take;
  a.reserve[a.current] -= take;
  a.reloading = 0;
}

// Throw a grenade from the player's eye, along the look direction.
export function throwGrenade(S, kind) {
  const a = S.arsenal;
  if (a.grenades[kind] <= 0) return false;
  a.grenades[kind]--;
  const p = S.player;
  const dir = S.tmpDir;
  dir.set(0, 0, -1).applyQuaternion(S.camera.quaternion);
  S.grenades.push({
    kind, x: p.x, y: p.eyeY, z: p.z,
    vx: dir.x * 14 + p.vx, vy: dir.y * 14 + 3.2, vz: dir.z * 14 + p.vz,
    fuse: kind === 'frag' ? 1.6 : 1.1, mesh: null,
  });
  return true;
}
