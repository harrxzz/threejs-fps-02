import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWeapons, WEAPONS } from '../src/weapons.js';
import { createInput } from '../src/input.js';
import { createBots } from '../src/bots.js';

test('weapon timers clamp, reload completes, and scope follows aiming', () => {
  const w = createWeapons(new THREE.PerspectiveCamera());
  assert.ok(w.fire(0));
  w.step(1, 1, 0, false, false);
  assert.equal(w.canFire(), true);
  assert.equal(w.reload(), true);
  w.step(WEAPONS.rifle.reloadTime + 0.1, 3, 0, false, false);
  assert.equal(w.ammoFor('rifle').mag, WEAPONS.rifle.mag);
  assert.equal(w.ammoFor('rifle').reserve, WEAPONS.rifle.reserve - 1);
  w.switchTo('sniper');
  w.step(0.4, 4, 0, false, true);
  assert.equal(w.canFire(), true);
  assert.equal(w.isScoped(), true);
});

test('input key edge survives render frames without simulation steps', () => {
  const win = new EventTarget(); const doc = new EventTarget();
  globalThis.window = win; globalThis.document = doc;
  const input = createInput({}, () => {});
  const e = new Event('keydown'); Object.defineProperty(e, 'code', {value:'KeyR'}); win.dispatchEvent(e);
  input.endFrame(false);
  assert.equal(input.pressed('KeyR'), true);
  assert.equal(input.pressed('KeyR'), false);
});

test('bot arriving at bomb does not walk away before defusing', () => {
  const scene = new THREE.Scene();
  const bots = createBots(scene, [], [], new THREE.Raycaster());
  const bot = bots.items[0]; bot.group.position.set(-11, 0, -8.5); bot.state = 'converge';
  const bombPos = new THREE.Vector3(-10, 0, -8.5);
  bots.step(1/60, {playerPos:new THREE.Vector3(),playerEyeY:1.6,playerSpeed:0,playerAlive:false,bombPlanted:true,bombPos,onShoot(){},onPlayerHit(){},onDefused(){}});
  assert.equal(bot.state, 'defuse');
  assert.equal(bot.group.position.x, -11);
});
