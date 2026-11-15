// The bomb: carried, planting, planted, exploded, defused. The player spawns carrying it
// and plants by holding E for three seconds inside a site zone. After the plant the fuse
// runs 35 seconds while the defenders converge; a defender standing on the bomb defuses it
// in five seconds. The bomb is a small dark box with an amber light, dropped where the
// player stands when the plant starts and left there once planted.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const PLANT_TIME = 3;
export const FUSE_TIME = 35;

export function createBomb(scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.26),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steelDark), roughness: 0.5, metalness: 0.4 }),
  );
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber) }),
  );
  light.position.set(0, 0.13, 0);
  group.add(body, light);
  group.visible = false;
  scene.add(group);
  const blinkLight = new THREE.PointLight(new THREE.Color(PALETTE.amber), 0, 4, 1.8);
  scene.add(blinkLight);

  const state = {
    status: 'carried', // carried | planting | planted | exploded | defused
    site: null, // 'A' | 'B'
    plantProgress: 0,
    fuseLeft: 0,
    position: new THREE.Vector3(),
    blink: 0,
  };

  function reset() {
    state.status = 'carried';
    state.site = null;
    state.plantProgress = 0;
    state.fuseLeft = 0;
    group.visible = false;
    blinkLight.intensity = 0;
  }

  function startPlant(site, pos) {
    state.status = 'planting';
    state.site = site;
    state.plantProgress = 0;
    state.position.copy(pos);
    group.position.set(pos.x, 0.12, pos.z);
    group.visible = true;
  }

  function cancelPlant() {
    if (state.status !== 'planting') return;
    state.status = 'carried';
    state.site = null;
    state.plantProgress = 0;
    group.visible = false;
  }

  // Returns 'planted' on the frame the plant completes, else null.
  function stepPlant(dt) {
    if (state.status !== 'planting') return null;
    state.plantProgress += dt;
    if (state.plantProgress >= PLANT_TIME) {
      state.status = 'planted';
      state.fuseLeft = FUSE_TIME;
      state.plantProgress = PLANT_TIME;
      return 'planted';
    }
    return null;
  }

  // Returns 'exploded' on the frame the fuse runs out, else null.
  function stepFuse(dt) {
    if (state.status !== 'planted') return null;
    state.fuseLeft -= dt;
    state.blink += dt;
    const on = Math.sin(state.blink * 14) > 0;
    blinkLight.intensity = on ? 10 : 0;
    blinkLight.position.copy(group.position);
    blinkLight.position.y = 0.4;
    if (state.fuseLeft <= 0) {
      state.status = 'exploded';
      state.fuseLeft = 0;
      blinkLight.intensity = 0;
      return 'exploded';
    }
    return null;
  }

  return {
    state,
    group,
    reset,
    startPlant,
    cancelPlant,
    stepPlant,
    stepFuse,
  };
}
