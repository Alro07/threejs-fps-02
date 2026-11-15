// The map: DUSTLINE, a dusk freight yard. 44 x 30 m, three lanes (A long, mid, B
// underpass), two bomb sites — A Refinery (west) and B Silo (east) — with crates,
// containers and pipes for cover. Every box is a collider and a surface a bullet
// stops on. Colours come only from PALETTE plus the two team colours.
import * as THREE from 'three';
import { PALETTE, TEAM } from './palette.js';

export const SITES = {
  A: { name: 'A · REFINERY', center: new THREE.Vector3(-16, 0, -9), radius: 4.2 },
  B: { name: 'B · SILO', center: new THREE.Vector3(16, 0, -9), radius: 4.2 },
};
export const SPAWNS = {
  vanguard: [
    { x: -2, z: 12, yaw: 0 }, { x: -6, z: 12, yaw: 0.3 }, { x: 2, z: 12, yaw: -0.3 },
    { x: -10, z: 11, yaw: 0.5 }, { x: 6, z: 12, yaw: -0.5 },
  ],
  ember: [
    { x: -16, z: -11, yaw: Math.PI }, { x: 16, z: -11, yaw: Math.PI },
    { x: 0, z: -12, yaw: Math.PI }, { x: -8, z: -6, yaw: Math.PI * 0.8 },
    { x: 8, z: -6, yaw: Math.PI * 1.2 },
  ],
};

// Waypoint graph bots walk: node id -> [x, z, links]. Three lanes to each site.
export const WAYPOINTS = {
  spawn: [-2, 12, ['mid0', 'a0', 'b0']],
  mid0: [0, 6, ['spawn', 'mid1', 'a1', 'b1']],
  mid1: [0, 0, ['mid0', 'mid2']],
  mid2: [0, -6, ['mid1', 'siteA', 'siteB']],
  a0: [-9, 8, ['spawn', 'a1']],
  a1: [-13, 2, ['a0', 'mid0', 'siteA']],
  siteA: [-16, -9, ['a1', 'mid2']],
  b0: [9, 8, ['spawn', 'b1']],
  b1: [13, 2, ['b0', 'mid0', 'siteB']],
  siteB: [16, -9, ['b1', 'mid2']],
  defA: [-13, -11, ['siteA', 'mid2']],
  defB: [13, -11, ['siteB', 'mid2']],
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.94,
      metalness: 0.04,
    });
  }
  const teamMat = {
    vanguard: new THREE.MeshStandardMaterial({ color: new THREE.Color(TEAM.vanguard), roughness: 0.6, metalness: 0.2 }),
    ember: new THREE.MeshStandardMaterial({ color: new THREE.Color(TEAM.ember), roughness: 0.6, metalness: 0.2 }),
  };
  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, mat, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[mat] || mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }
  function cylinder(rTop, rBottom, h, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, 20), materials[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground and perimeter: 44 x 30 m, 5 m walls, open dusk sky.
  box(44.4, 0.4, 30.4, 0, -0.2, 0, 'surface');
  box(0.4, 5, 30.4, -22.2, 2.5, 0, 'surface');
  box(0.4, 5, 30.4, 22.2, 2.5, 0, 'surface');
  box(44.4, 5, 0.4, 0, 2.5, -15.2, 'surface');
  box(44.4, 5, 0.4, 0, 2.5, 15.2, 'surface');

  // Site A — Refinery: pipes and a low platform.
  box(6, 0.5, 4, -16, 0.25, -11, 'hairline');
  cylinder(0.55, 0.55, 3.4, -18.5, 1.7, -12, 'hairline');
  cylinder(0.55, 0.55, 3.4, -13.5, 1.7, -12, 'hairline');
  box(0.7, 0.7, 7, -18.5, 3.6, -9, 'muted');
  box(1.4, 1.0, 1.4, -14, 0.5, -6.5, 'hairline');
  box(1.4, 1.0, 1.4, -18, 0.5, -6.5, 'hairline');
  // Site B — Silo: two big tanks and stacked crates.
  cylinder(2.2, 2.2, 5.5, 18.5, 2.75, -12, 'surface');
  cylinder(1.6, 1.6, 4.2, 13.5, 2.1, -12.5, 'hairline');
  box(1.4, 1.0, 1.4, 14, 0.5, -6.5, 'hairline');
  box(1.4, 2.0, 1.4, 18, 1.0, -6, 'hairline');
  // Mid: the long sightline, split by a central pillar and low wall.
  box(1.4, 3.4, 1.4, 0, 1.7, -2, 'hairline');
  box(4.5, 1.1, 0.9, -3.5, 0.55, 3, 'hairline');
  box(4.5, 1.1, 0.9, 3.5, 0.55, 3, 'hairline');
  box(0.9, 1.1, 4.5, -6, 0.55, -6, 'hairline');
  box(0.9, 1.1, 4.5, 6, 0.55, -6, 'hairline');
  // Containers on the lanes, crouch cover on spawn side.
  box(3.2, 1.2, 1.4, -11, 0.6, 5, 'muted');
  box(3.2, 1.2, 1.4, 11, 0.6, 5, 'muted');
  box(2.2, 0.9, 1.2, -4, 0.45, 9, 'hairline');
  box(2.2, 0.9, 1.2, 4, 0.45, 9, 'hairline');
  box(1.6, 0.8, 1.6, -19, 0.4, 4, 'hairline');
  box(1.6, 0.8, 1.6, 19, 0.4, 4, 'hairline');

  // Site floor markers: glowing rings that read at a glance.
  for (const [key, site] of Object.entries(SITES)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.35, site.radius, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.center.x, 0.02, site.center.z);
    group.add(ring);
    void key;
  }

  // Low sun disc on the horizon, so the top of the frame is never empty dusk.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb45e'), fog: false }),
  );
  sunDisc.position.set(-26, 9, -44);
  sunDisc.lookAt(0, 2, 12);
  scene.add(sunDisc);

  // Dusk light: low warm sun, cool sky fill, long shadows.
  scene.add(new THREE.HemisphereLight(new THREE.Color('#8a6f52'), new THREE.Color(PALETTE.canvas), 1.6));
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 3.2);
  sun.position.set(-14, 10, 12);
  sun.target.position.set(4, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#8a9ab8'), 1.0);
  fill.position.set(12, 8, -10);
  scene.add(fill);

  return { colliders, shootables, group, teamMat };
}
