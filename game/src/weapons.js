// The arsenal: five hitscan guns plus the view models that show them. The numbers live
// here; main.js owns the ray, the damage and the grenade. Spread is bloom plus movement:
// firing continuously and moving both open the cone, standing still and crouching close it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPON_ORDER = ['rifle', 'smg', 'shotgun', 'sniper', 'pistol'];

export const WEAPONS = {
  rifle: {
    name: 'Sable Rifle', price: 1000, mag: 30, reserve: 90, gap: 0.096, auto: true,
    damage: 34, headMult: 4, pellets: 1, spreadStill: 0.0022, spreadMove: 0.028,
    bloomPerShot: 0.0035, bloomMax: 0.03, recoilPitch: 0.009, recoilYaw: 0.004,
    reloadTime: 1.9, kick: 0.055, kind: 'rifle', scope: false,
  },
  smg: {
    name: 'Dune SMG', price: 700, mag: 32, reserve: 128, gap: 0.07, auto: true,
    damage: 22, headMult: 4, pellets: 1, spreadStill: 0.004, spreadMove: 0.04,
    bloomPerShot: 0.0028, bloomMax: 0.034, recoilPitch: 0.005, recoilYaw: 0.003,
    reloadTime: 1.5, kick: 0.04, kind: 'smg', scope: false,
  },
  shotgun: {
    name: 'Breacher', price: 900, mag: 6, reserve: 24, gap: 0.85, auto: false,
    damage: 12, headMult: 4, pellets: 8, spreadStill: 0.05, spreadMove: 0.07,
    bloomPerShot: 0.02, bloomMax: 0.05, recoilPitch: 0.032, recoilYaw: 0.012,
    reloadTime: 2.4, kick: 0.12, kind: 'shotgun', scope: false,
  },
  sniper: {
    name: 'Longshot', price: 2500, mag: 5, reserve: 15, gap: 1.15, auto: false,
    damage: 95, headMult: 4, pellets: 1, spreadStill: 0.0006, spreadMove: 0.06,
    bloomPerShot: 0.03, bloomMax: 0.05, recoilPitch: 0.05, recoilYaw: 0.015,
    reloadTime: 2.8, kick: 0.16, kind: 'sniper', scope: true,
  },
  pistol: {
    name: 'Sidearm', price: 300, mag: 12, reserve: 48, gap: 0.16, auto: false,
    damage: 28, headMult: 4, pellets: 1, spreadStill: 0.004, spreadMove: 0.03,
    bloomPerShot: 0.006, bloomMax: 0.02, recoilPitch: 0.008, recoilYaw: 0.003,
    reloadTime: 1.3, kick: 0.045, kind: 'pistol', scope: false,
  },
};

const DRAW_TIME = 0.35;
const MUZZLE_TIME = 0.06;

export function createWeapons(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steelDark), roughness: 0.55, metalness: 0.4 });
  const wood = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.8, metalness: 0.05 });

  function part(geo, mat, x, y, z) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    return mesh;
  }

  function buildModel(kind) {
    const model = new THREE.Group();
    if (kind === 'rifle') {
      model.add(
        part(new THREE.BoxGeometry(0.09, 0.1, 0.42), body, 0, 0, 0),
        part(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip, 0, 0.025, -0.38),
        part(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip, 0, -0.02, 0.3),
        part(new THREE.BoxGeometry(0.03, 0.05, 0.12), dark, 0, -0.06, -0.05),
      );
    } else if (kind === 'smg') {
      model.add(
        part(new THREE.BoxGeometry(0.11, 0.12, 0.3), body, 0, 0, 0),
        part(new THREE.BoxGeometry(0.05, 0.05, 0.22), grip, 0, 0.02, -0.24),
        part(new THREE.BoxGeometry(0.04, 0.16, 0.05), dark, 0, -0.12, 0.02),
      );
    } else if (kind === 'shotgun') {
      model.add(
        part(new THREE.BoxGeometry(0.08, 0.09, 0.5), wood, 0, 0, 0),
        part(new THREE.BoxGeometry(0.06, 0.06, 0.42), dark, 0, 0.03, -0.42),
        part(new THREE.BoxGeometry(0.07, 0.07, 0.2), grip, 0, -0.03, -0.3),
        part(new THREE.BoxGeometry(0.07, 0.08, 0.16), wood, 0, -0.02, 0.28),
      );
    } else if (kind === 'sniper') {
      model.add(
        part(new THREE.BoxGeometry(0.07, 0.09, 0.5), dark, 0, 0, 0),
        part(new THREE.BoxGeometry(0.03, 0.03, 0.62), grip, 0, 0.02, -0.5),
        part(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10), body, 0, 0.09, -0.05),
        part(new THREE.BoxGeometry(0.06, 0.07, 0.2), wood, 0, -0.02, 0.3),
      );
      model.children[2].rotation.x = Math.PI / 2;
    } else {
      model.add(
        part(new THREE.BoxGeometry(0.07, 0.09, 0.2), body, 0, 0, 0),
        part(new THREE.BoxGeometry(0.035, 0.035, 0.16), grip, 0, 0.01, -0.16),
        part(new THREE.BoxGeometry(0.06, 0.12, 0.06), grip, 0, -0.09, 0.06),
      );
    }
    model.position.set(0.24, -0.2, -0.42);
    model.visible = false;
    camera.add(model);
    return model;
  }

  const models = {};
  for (const id of WEAPON_ORDER) models[id] = buildModel(WEAPONS[id].kind);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const ammo = {};
  for (const id of WEAPON_ORDER) ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };

  const state = {
    current: 'rifle',
    cooldown: 0,
    reloadLeft: 0,
    drawLeft: 0,
    flash: 0,
    kick: 0,
    bloom: 0,
    scoped: false,
    lastShotAt: -10,
  };
  models.rifle.visible = true;

  function def() {
    return WEAPONS[state.current];
  }

  function step(dt, now, speed, crouching, aiming) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.drawLeft = Math.max(0, state.drawLeft - dt);
    // Bloom recovers when the trigger is quiet for a beat.
    if (now - state.lastShotAt > 0.25) state.bloom = Math.max(0, state.bloom - dt * 0.09);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    if (state.reloadLeft > 0) {
      model.rotation.x = -0.55 * Math.min(1, (def().reloadTime - state.reloadLeft) * 2);
    } else if (state.drawLeft > 0) {
      model.rotation.x = 0.5 * (state.drawLeft / DRAW_TIME);
      model.position.y = -0.2 - 0.12 * (state.drawLeft / DRAW_TIME);
    }
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      if (state.reloadLeft === 0) {
        const a = ammo[state.current];
        const need = def().mag - a.mag;
        const take = Math.min(need, a.reserve);
        a.mag += take;
        a.reserve -= take;
      }
    }
    // The sniper only scopes when it is the gun in hand and the right button is held.
    const wantScope = def().scope && aiming && state.reloadLeft === 0 && state.drawLeft === 0;
    state.scoped = wantScope;
  }

  return {
    state,
    def,
    ammoFor(id) {
      return ammo[id];
    },
    current() {
      return state.current;
    },
    isScoped() {
      return state.scoped;
    },
    ready() {
      const a = ammo[state.current];
      return a.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0 && state.drawLeft === 0;
    },
    canFire() {
      return state.cooldown === 0 && state.reloadLeft === 0 && state.drawLeft === 0 && ammo[state.current].mag > 0;
    },
    // Fires one trigger pull: spends a round, starts the cooldown and the bloom, returns
    // the shot's numbers or null when the gun cannot fire.
    fire(now) {
      const a = ammo[state.current];
      if (a.mag <= 0 || state.cooldown !== 0 || state.reloadLeft > 0 || state.drawLeft > 0) return null;
      a.mag -= 1;
      state.cooldown = def().gap;
      state.flash = MUZZLE_TIME;
      state.kick = def().kick;
      state.bloom = Math.min(def().bloomMax, state.bloom + def().bloomPerShot);
      state.lastShotAt = now;
      return { pellets: def().pellets, damage: def().damage, headMult: def().headMult, kind: def().kind };
    },
    reload() {
      const a = ammo[state.current];
      if (state.reloadLeft > 0 || a.mag === def().mag || a.reserve === 0) return false;
      state.reloadLeft = def().reloadTime;
      return true;
    },
    switchTo(id) {
      if (id === state.current || !WEAPONS[id]) return false;
      models[state.current].visible = false;
      state.current = id;
      models[id].visible = true;
      state.drawLeft = DRAW_TIME;
      state.reloadLeft = 0;
      state.bloom = 0;
      state.scoped = false;
      return true;
    },
    spread(speed, crouching, aiming) {
      const d = def();
      const move = Math.min(1, speed / 5.2);
      let s = d.spreadStill + state.bloom + move * d.spreadMove;
      if (crouching) s *= 0.55;
      if (state.scoped) s *= 0.12;
      else if (aiming && d.scope) s *= 0.5;
      return s;
    },
    recoil() {
      return { pitch: def().recoilPitch, yaw: def().recoilYaw };
    },
    // Advance clamped timers, animations, reload and scope once per fixed step.
    step,

  resetRound() {
      for (const id of WEAPON_ORDER) {
        ammo[id].mag = WEAPONS[id].mag;
        ammo[id].reserve = WEAPONS[id].reserve;
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.drawLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
      state.scoped = false;
    },
  };
}
