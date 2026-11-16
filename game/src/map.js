// map.js — FOUNDRY-9: a 3-lane foundry floor. Builds meshes, collision AABBs,
// waypoints, spawns and the bombsite. One job: the world geometry.
import * as THREE from 'three';

export const MAP = {
  minX: -32, maxX: 32, minZ: -22, maxZ: 22,
  playerSpawn: { x: 0, z: 19, yaw: 0 }, // faces north (-z), toward Site A
  site: { x: 0, z: -18, r: 3.2 },
  roundTime: 100,
};

// Waypoint graph: nodes bots patrol between. {x, z, links:[indices]}
export const WAYPOINTS = [
  { x: -26, z: 16, links: [1, 3] },   // 0 west spawn
  { x: -26, z: 0,  links: [0, 2, 4] },// 1 west mid
  { x: -26, z: -16,links: [1, 5] },   // 2 furnace hall
  { x: -14, z: 16, links: [0, 4, 6] },// 3 west south cross
  { x: -14, z: 0,  links: [1, 3, 5, 7] }, // 4 west centre cross
  { x: -14, z: -16,links: [2, 4, 8] },// 5 west north cross
  { x: 0,   z: 16, links: [3, 7, 9] },// 6 mid south
  { x: 0,   z: 0,  links: [4, 6, 8, 10] }, // 7 mid centre
  { x: 0,   z: -16,links: [5, 7, 11] },// 8 site approach
  { x: 14,  z: 16, links: [6, 10, 12] }, // 9 east south cross
  { x: 14,  z: 0,  links: [7, 9, 11, 13] }, // 10 east centre cross
  { x: 14,  z: -16,links: [8, 10, 14] }, // 11 east north cross
  { x: 26,  z: 16, links: [9, 13] },  // 12 east spawn
  { x: 26,  z: 0,  links: [10, 12, 14] }, // 13 east mid
  { x: 26,  z: -16,links: [11, 13] }, // 14 catwalk hall
];
export const BOT_SPAWNS = [2, 5, 8, 11, 14]; // waypoint indices bots start near

function textTexture(text, fg, bg) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 128);
  g.fillStyle = fg; g.font = 'bold 64px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildMap(scene) {
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const occluders = []; // meshes that block sight / bullets
  const group = new THREE.Group();
  scene.add(group);

  const matFloor = new THREE.MeshLambertMaterial({ color: 0x1e343a });
  const matWall = new THREE.MeshLambertMaterial({ color: 0x2a4a52 });
  const matWallDark = new THREE.MeshLambertMaterial({ color: 0x1d3a42 });
  const matCrate = new THREE.MeshLambertMaterial({ color: 0x4a5d52 });
  const matCrateAmber = new THREE.MeshLambertMaterial({ color: 0x7d5a24 });
  const matPipe = new THREE.MeshLambertMaterial({ color: 0x4a5a5e });
  const matPipeHot = new THREE.MeshLambertMaterial({ color: 0x8a5a20, emissive: 0x442200 });
  const matMetal = new THREE.MeshLambertMaterial({ color: 0x2a3a40 });
  const matFurnace = new THREE.MeshLambertMaterial({ color: 0x3a2a1a, emissive: 0x662200 });
  const matMolten = new THREE.MeshLambertMaterial({ color: 0xff9a1e, emissive: 0xff6a00 });
  const matSite = new THREE.MeshLambertMaterial({ color: 0xf5a623, emissive: 0x7a4d00 });

  function box(w, h, d, x, y, z, mat, collide = true, occlude = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    group.add(m);
    if (collide) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    if (occlude) occluders.push(m);
    return m;
  }
  function pipe(r, len, x, y, z, rotZ, rotX, mat) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat || matPipe);
    m.rotation.z = rotZ || 0; m.rotation.x = rotX || 0;
    m.position.set(x, y, z);
    group.add(m);
    return m;
  }

  // Floor + ceiling beams
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(64, 44), matFloor);
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);
  for (let i = -3; i <= 3; i++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(64, 0.4, 0.6), matMetal);
    beam.position.set(0, 6.4, i * 6);
    group.add(beam);
  }

  // Perimeter walls (height 5)
  box(66, 5, 1, 0, 2.5, -22.5, matWall);
  box(66, 5, 1, 0, 2.5, 22.5, matWall);
  box(1, 5, 46, -32.5, 2.5, 0, matWall);
  box(1, 5, 46, 32.5, 2.5, 0, matWall);

  // Lane divider walls at x = -8 and x = +8, with door gaps at z -18..-14, -2..2, 14..18
  for (const wx of [-8, 8]) {
    box(1, 5, 4, wx, 2.5, -20, matWallDark); // z -22..-18
    box(1, 5, 12, wx, 2.5, -8, matWallDark); // z -14..-2
    box(1, 5, 12, wx, 2.5, 8, matWallDark);  // z 2..14
    box(1, 5, 4, wx, 2.5, 20, matWallDark);  // z 18..22
  }

  // Crates: cover in each lane (collide + occlude)
  const crates = [
    // mid lane
    [2.2, 1.6, 2.2, -3, 8], [-2.5, 1.2, 1.8, 3.5, 2], [2, 2.4, 2, 2.5, -6],
    [-2, 1.4, 2, -2.5, -10], [3, 1.8, 1.6, 0, -12],
    // west flank
    [2.4, 1.8, 2.4, -20, 10], [2, 1.2, 2, -24, -4], [3, 2.2, 2, -18, -8],
    [2, 1.5, 2, -27, -18], [2.2, 1.2, 2.2, -14, -18],
    // east flank
    [2.4, 1.8, 2.4, 20, 10], [2, 1.2, 2, 24, -4], [3, 2.2, 2, 18, -8],
    [2, 1.5, 2, 27, -18], [2.2, 1.2, 2.2, 14, -18],
    // south staging
    [2.5, 1.6, 2.5, -12, 19], [2.5, 1.6, 2.5, 12, 19],
  ];
  for (const [w, h, d, x, z] of crates) box(w, h, d, x, h / 2, z, (x + z) % 3 === 0 ? matCrateAmber : matCrate);

  // Furnace (west-north): big glowing block + molten trough
  box(6, 4.5, 3, -26, 2.25, -19, matFurnace);
  const trough = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 1.2), matMolten);
  trough.position.set(-23, 0.35, -16.5);
  group.add(trough);
  const furnaceLight = new THREE.PointLight(0xff7a1a, 60, 22, 1.8);
  furnaceLight.position.set(-23, 3, -16);
  scene.add(furnaceLight);

  // Pipes along west wall and ceiling runs
  for (let i = 0; i < 3; i++) pipe(0.28, 44, -31.2, 2.2 + i * 0.7, 0, Math.PI / 2, 0, i === 1 ? matPipeHot : matPipe);
  for (let i = 0; i < 2; i++) pipe(0.35, 40, -20 + i * 40, 5.6, 0, 0, Math.PI / 2);
  pipe(0.5, 8, -26, 4.6, -19, 0, 0, matPipeHot);

  // Catwalk (east flank): overhead gantry on pillars, amber edge lights
  box(4, 0.3, 20, 27, 3.4, 0, matMetal, false, false);
  for (const z of [-9, -3, 3, 9]) box(0.4, 3.4, 0.4, 25.2, 1.7, z, matMetal);
  for (const z of [-9, -3, 3, 9]) box(0.4, 3.4, 0.4, 28.8, 1.7, z, matMetal);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 20), matSite);
  rail.position.set(25.1, 4, 0);
  group.add(rail);

  // Bombsite A: amber floor ring + sign
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.2, 32), new THREE.MeshBasicMaterial({ color: 0xf5a623, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(MAP.site.x, 0.02, MAP.site.z);
  group.add(ring);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshLambertMaterial({ map: textTexture('SITE A', '#f5a623', '#10222a'), emissive: 0x332200 }));
  sign.position.set(0, 3.4, -21.8);
  group.add(sign);
  const siteLight = new THREE.PointLight(0xf5a623, 40, 16, 1.8);
  siteLight.position.set(0, 3.5, -18);
  scene.add(siteLight);

  // Hazard stripes near site (thin amber boxes on floor)
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 2.4), matSite);
    s.position.set(-4 + i * 2, 0.03, -13.5);
    s.rotation.y = 0.6;
    group.add(s);
  }

  // Lights
  scene.add(new THREE.HemisphereLight(0xbcd8dc, 0x2a2018, 1.5));
  const sun = new THREE.DirectionalLight(0xe8f4f4, 1.7);
  sun.position.set(12, 18, 8);
  scene.add(sun);
  const fill = new THREE.PointLight(0x2ec4b6, 50, 32, 1.8);
  fill.position.set(0, 4.5, 8);
  scene.add(fill);

  scene.fog = new THREE.FogExp2(0x0a1418, 0.007);
  scene.background = new THREE.Color(0x0a1418);

  return { colliders, occluders, group };
}

// Circle (radius r) vs AABB collision: push the point out. Returns corrected x/z.
export function collideCircle(colliders, x, z, r) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx, dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        z = nz + (dz / d) * r;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const pl = x - c.minX, pr = c.maxX - x, pt = z - c.minZ, pb = c.maxZ - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.minX - r; else if (m === pr) x = c.maxX + r;
        else if (m === pt) z = c.minZ - r; else z = c.maxZ + r;
      }
    }
  }
  return { x, z };
}
