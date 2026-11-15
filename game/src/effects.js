// Visual effects, all pooled: tracer lines, impact sparks and the grenade blast.
// Nothing is allocated in the hot loop — every pool is created once and reused.
// The muzzle flash lives on the weapon view model in weapons.js.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_COUNT = 10;
const TRACER_LIFE = 0.08;
const SPARK_COUNT = 240;
const SPARK_LIFE = 0.45;

export function createEffects(scene) {
  // ---- Tracers: one THREE.Line per slot, two endpoints each, fading fast. ----
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  function tracer(from, to) {
    const slot = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % TRACER_COUNT;
    const pos = slot.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    slot.line.material.opacity = 0.9;
    slot.line.visible = true;
    slot.life = TRACER_LIFE;
  }

  // ---- Sparks: one THREE.Points cloud, fixed buffer, particles recycled in place. ----
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARK_COUNT * 3);
  const sparkVel = new Float32Array(SPARK_COUNT * 3);
  const sparkLife = new Float32Array(SPARK_COUNT);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({
    color: new THREE.Color(PALETTE.amber),
    size: 0.07,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  sparks.visible = false;
  scene.add(sparks);
  let sparkIndex = 0;
  let sparksAlive = 0;

  function impact(point, normal, count, spread = 1) {
    for (let i = 0; i < count; i += 1) {
      const s = sparkIndex;
      sparkIndex = (sparkIndex + 1) % SPARK_COUNT;
      sparkPos[s * 3] = point.x;
      sparkPos[s * 3 + 1] = point.y;
      sparkPos[s * 3 + 2] = point.z;
      // A random cone around the surface normal, so sparks spray off the wall.
      const rx = (Math.random() * 2 - 1) * spread;
      const ry = Math.random() * 1.4 + 0.4;
      const rz = (Math.random() * 2 - 1) * spread;
      sparkVel[s * 3] = (normal.x + rx) * 2.2;
      sparkVel[s * 3 + 1] = (normal.y + ry) * 2.2;
      sparkVel[s * 3 + 2] = (normal.z + rz) * 2.2;
      sparkLife[s] = SPARK_LIFE * (0.6 + Math.random() * 0.4);
    }
    sparksAlive = Math.min(SPARK_COUNT, sparksAlive + count);
    sparks.visible = true;
  }

  // ---- Grenade blast: an expanding additive sphere plus a point light. ----
  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  blast.visible = false;
  scene.add(blast);
  const blastLight = new THREE.PointLight(new THREE.Color(PALETTE.amber), 0, 14, 1.4);
  scene.add(blastLight);
  let blastLife = 0;

  function explosion(point) {
    blast.position.copy(point);
    blast.scale.setScalar(0.2);
    blast.material.opacity = 0.85;
    blast.visible = true;
    blastLight.position.copy(point);
    blastLight.position.y += 0.6;
    blastLight.intensity = 60;
    blastLife = 0.55;
    impact(point, new THREE.Vector3(0, 1, 0), 40, 1.6);
  }

  function step(dt) {
    for (const slot of tracers) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      slot.line.material.opacity = Math.max(0, slot.life / TRACER_LIFE) * 0.9;
      if (slot.life <= 0) slot.line.visible = false;
    }
    if (sparksAlive > 0) {
      let alive = 0;
      for (let i = 0; i < SPARK_COUNT; i += 1) {
        if (sparkLife[i] <= 0) continue;
        sparkLife[i] -= dt;
        sparkVel[i * 3 + 1] -= 6 * dt;
        sparkPos[i * 3] += sparkVel[i * 3] * dt;
        sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
        sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
        if (sparkLife[i] > 0) alive += 1;
        else sparkPos[i * 3 + 1] = -50;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparksAlive = alive;
      if (alive === 0) sparks.visible = false;
    }
    if (blastLife > 0) {
      blastLife -= dt;
      const t = Math.max(0, blastLife / 0.55);
      blast.scale.setScalar(0.2 + (1 - t) * 5);
      blast.material.opacity = t * 0.85;
      blastLight.intensity = t * 60;
      if (blastLife <= 0) {
        blast.visible = false;
        blastLight.intensity = 0;
      }
    }
  }

  return { tracer, impact, explosion, step };
}
