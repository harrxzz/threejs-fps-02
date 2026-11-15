// SABLE LINE: an original desert-industrial compound, 36 x 30 m. Two bomb sites (A
// north-west, B north-east), a mid lane, long west/east lanes, and a north connector
// between the sites. Built from boxes only; every box is a collider for the player and a
// surface a bullet stops on. Plain geometry, no models and no textures.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'amber' || name === 'hazard' ? 0.5 : 0.92,
      metalness: name === 'steel' || name === 'steelDark' ? 0.35 : 0.03,
    });
  }
  // Amber letters and site lamps glow on their own.
  const glowAmber = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber) });
  const glowHazard = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.hazard) });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  function cylinder(radius, height, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 12), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      const half = radius;
      colliders.push(new THREE.Box3(new THREE.Vector3(x - half, y - height / 2, z - half), new THREE.Vector3(x + half, y + height / 2, z + half)));
    }
    shootables.push(mesh);
    return mesh;
  }

  // ---- Ground and perimeter: 36 x 30 m, 4.6 m walls, open to the sky. ----
  box(36.4, 0.4, 30.4, 0, -0.2, 0, 'sand');
  box(0.4, 4.6, 30.4, -18.2, 2.3, 0, 'steel');
  box(0.4, 4.6, 30.4, 18.2, 2.3, 0, 'steel');
  box(36.4, 4.6, 0.4, 0, 2.3, -15.2, 'steel');
  box(36.4, 4.6, 0.4, 0, 2.3, 15.2, 'steel');
  // A darker sand strip down the middle of the spawn hall, so the lanes read at a glance.
  box(6.4, 0.06, 9.2, 0, 0.03, 10.4, 'sandDark', false);

  // ---- Spawn-hall divider (z = 6): three gaps, one per lane. ----
  box(4, 3.4, 0.4, -16, 1.7, 6, 'steelDark');
  box(10.8, 3.4, 0.4, -6.6, 1.7, 6, 'steelDark');
  box(10.8, 3.4, 0.4, 6.6, 1.7, 6, 'steelDark');
  box(4, 3.4, 0.4, 16, 1.7, 6, 'steelDark');

  // ---- Sites divider (z = -6): A entrance, mid doors, B entrance. ----
  box(6, 3.4, 0.4, -15, 1.7, -6, 'steelDark');
  box(8.8, 3.4, 0.4, -5.6, 1.7, -6, 'steelDark');
  box(8.8, 3.4, 0.4, 5.6, 1.7, -6, 'steelDark');
  box(6, 3.4, 0.4, 15, 1.7, -6, 'steelDark');

  // ---- Site side walls (x = -8 and x = 8, z -15..-6): one doorway each into the sites. ----
  box(0.4, 3.4, 5, -8, 1.7, -12.5, 'steelDark');
  box(0.4, 3.4, 2, -8, 1.7, -7, 'steelDark');
  box(0.4, 3.4, 5, 8, 1.7, -12.5, 'steelDark');
  box(0.4, 3.4, 2, 8, 1.7, -7, 'steelDark');

  // ---- Mid block: the big steel crate the mid fight plays around. ----
  box(4, 1.8, 3, 0, 0.9, 0, 'steel');
  box(4.2, 0.15, 3.2, 0, 1.85, 0, 'rust', false);

  // ---- Crates (1.1 m cubes) for cover along every lane. ----
  const crates = [
    [-14, 2, 'rust'], [-13.5, -3, 'rustDark'], [14, 2, 'rust'], [13.5, -3, 'rustDark'],
    [-2.5, 4.5, 'rust'], [2.5, 3.5, 'rustDark'], [-5, -3.5, 'rust'], [5, -3.5, 'rustDark'],
    [-15, -12, 'rust'], [-10.5, -13.5, 'rustDark'], [15, -12, 'rust'], [10.5, -13.5, 'rustDark'],
    [-4, -11, 'rustDark'], [4, -11, 'rust'], [-3, 13, 'rust'], [3, 13, 'rustDark'],
    [-16.5, -9, 'rustDark'], [16.5, -9, 'rustDark'],
  ];
  for (const [x, z, mat] of crates) box(1.1, 1.1, 1.1, x, 0.55, z, mat);

  // ---- Low platforms in the sites (jump up, shoot over the crates). ----
  box(3, 0.5, 2, -13, 0.25, -11, 'steel');
  box(3, 0.5, 2, 13, 0.25, -11, 'steel');

  // ---- Barrels (cylinders) as low cover. ----
  cylinder(0.45, 1.1, -16, 0.55, -8, 'rustDark');
  cylinder(0.45, 1.1, 16, 0.55, -8, 'rustDark');
  cylinder(0.45, 1.1, -1.5, 0.55, 8, 'rust');
  cylinder(0.45, 1.1, 1.5, 0.55, 8, 'rust');
  cylinder(0.45, 1.1, -6, 0.55, -12, 'rustDark');
  cylinder(0.45, 1.1, 6, 0.55, -12, 'rustDark');

  // ---- Watchtower in the north connector: a steel pillar, a cabin, a roof, an amber lamp. ----
  box(2.2, 3.2, 2.2, 0, 1.6, -12, 'steelDark');
  box(3.2, 1.4, 3.2, 0, 3.9, -12, 'steel');
  box(3.6, 0.2, 3.6, 0, 4.7, -12, 'rustDark');
  const towerLamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), glowAmber);
  towerLamp.position.set(0, 4.95, -12);
  group.add(towerLamp);

  // ---- Pipes high on the side walls (visual only). ----
  const pipeGeo = new THREE.CylinderGeometry(0.12, 0.12, 20, 10);
  for (const x of [-17.7, 17.7]) {
    const pipe = new THREE.Mesh(pipeGeo, materials.rust);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, 3.6, 0);
    pipe.castShadow = true;
    group.add(pipe);
    shootables.push(pipe);
  }

  // ---- Site signs: dark panels on the north walls, amber letters in front of them. ----
  function siteSign(cx, letter) {
    box(3.2, 2.2, 0.15, cx, 3.1, -14.9, 'steelDark');
    const g = new THREE.Group();
    g.position.set(cx, 3.1, -14.78);
    if (letter === 'A') {
      const left = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.7, 0.08), glowAmber);
      left.position.set(-0.42, 0, 0);
      left.rotation.z = 0.38;
      const right = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.7, 0.08), glowAmber);
      right.position.set(0.42, 0, 0);
      right.rotation.z = -0.38;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.24, 0.08), glowAmber);
      bar.position.set(0, -0.28, 0);
      g.add(left, right, bar);
    } else {
      const spine = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.7, 0.08), glowAmber);
      spine.position.set(-0.45, 0, 0);
      for (const [y, w] of [[0.72, 1.1], [0, 1.1], [-0.72, 1.1]]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.24, 0.08), glowAmber);
        bar.position.set(0.05, y, 0);
        g.add(bar);
      }
      g.add(spine);
    }
    group.add(g);
    // A hazard stripe under each sign, so the site reads from across the map.
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 0.06), glowHazard);
    stripe.position.set(cx, 1.85, -14.95);
    group.add(stripe);
  }
  siteSign(-13, 'A');
  siteSign(13, 'B');

  // ---- Sky dome: a big sphere whose vertex colours run from blue overhead to warm haze. ----
  const skyGeo = new THREE.SphereGeometry(90, 16, 12);
  const top = new THREE.Color(PALETTE.skyTop);
  const horizon = new THREE.Color(PALETTE.sky);
  const colors = new Float32Array(skyGeo.attributes.position.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < skyGeo.attributes.position.count; i += 1) {
    const y = skyGeo.attributes.position.getY(i) / 90;
    tmp.copy(horizon).lerp(top, Math.max(0, Math.min(1, (y + 0.08) * 1.4)));
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  scene.add(sky);
  scene.background = new THREE.Color(PALETTE.sky);

  // ---- Light: a warm low sun, a cool fill, a warm sky/ground gradient, amber site lamps. ----
  const hemi = new THREE.HemisphereLight(new THREE.Color('#cfd8e6'), new THREE.Color(PALETTE.sand), 1.05);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(new THREE.Color('#ffd9a0'), 2.6);
  sun.position.set(18, 22, 12);
  sun.target.position.set(0, 0, -3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -22;
  sun.shadow.camera.right = 22;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(new THREE.Color('#8fa3c7'), 0.75);
  fill.position.set(-14, 10, -12);
  scene.add(fill);

  for (const [x, z] of [[-13, -11], [13, -11]]) {
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.amber), 14, 11, 1.6);
    lamp.position.set(x, 3.1, z);
    scene.add(lamp);
  }
  const midLamp = new THREE.PointLight(new THREE.Color('#ffb340'), 8, 9, 1.6);
  midLamp.position.set(0, 3.2, 2);
  scene.add(midLamp);

  const siteA = new THREE.Box3(new THREE.Vector3(-18, 0, -15), new THREE.Vector3(-8, 3, -6));
  const siteB = new THREE.Box3(new THREE.Vector3(8, 0, -15), new THREE.Vector3(18, 3, -6));

  return {
    colliders,
    shootables,
    group,
    spawn: new THREE.Vector3(0, 0, 12),
    siteA,
    siteB,
    siteCenterA: new THREE.Vector3(-13, 0, -10.5),
    siteCenterB: new THREE.Vector3(13, 0, -10.5),
    botSpawns: [
      new THREE.Vector3(-10, 0, -8),
      new THREE.Vector3(10, 0, -8),
      new THREE.Vector3(3.5, 0, 2.5),
      new THREE.Vector3(-6, 0, -9),
    ],
  };
}
