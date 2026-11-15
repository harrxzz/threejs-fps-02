// SABLE LINE: boot and the one loop. A fixed 60 Hz simulation feeds a render at the
// display's rate; one game-state object holds the match, and every module reads it.
// ?shot=start|play|end with &seed=N sets up a deterministic frame for a capture, renders
// it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPON_ORDER } from './weapons.js';
import { createBots } from './bots.js';
import { createEconomy, BUY_ITEMS, WIN_BONUS, LOSS_BONUS, KILL_BONUS, PLANT_BONUS } from './economy.js';
import { createBomb, PLANT_TIME } from './bomb.js';
import { createRounds } from './rounds.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft was removed in three 0.187.
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 30, 75);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const effects = createEffects(scene);
const economy = createEconomy();
const bomb = createBomb(scene);
const rounds = createRounds();
const hud = createHud();
const player = createPlayer(world.colliders);
const weapons = createWeapons(camera);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const bots = createBots(scene, world.colliders, world.shootables, raycaster);
const input = createInput(renderer.domElement, onLockChange);

// One game-state object: every module reads and writes through it.
const game = {
  health: 100,
  started: false,
  frozen: false,
  suppressPause: false,
  wasFiring: false,
  wasAiming: false,
  stepDistance: 0,
  fov: 74,
  grenade: null, // { pos, vel, fuseLeft, mesh } or null
  plantSite: null,
};

const shootables = world.shootables.concat(bots.hitMeshes);
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const body = player.state;
const markerHoldMs = shot ? 4000 : 90;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();

const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
const grenadeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steelDark), roughness: 0.5, metalness: 0.4 });

hud.setAmmo(weapons.ammoFor('rifle').mag, weapons.ammoFor('rifle').reserve, 'Sable Rifle');
hud.setScore(0, 0, 1);
hud.setMoney(economy.state.money);
hud.setHealth(100, false);
hud.setBotsAlive(4);
hud.setTimer(12, 'buy');
hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (rounds.state.matchOver) restartMatch();
  input.requestLock();
});
hud.onBuy((item) => {
  if (economy.buy(item)) {
    audio.buy();
    if (item.kind === 'weapon') weapons.switchTo(item.id);
    refreshBuyMenu();
    syncHud();
  } else {
    audio.denied();
  }
});

function syncHud() {
  const a = weapons.ammoFor(weapons.current());
  hud.setAmmo(a.mag, a.reserve, weapons.def().name);
  hud.setMoney(economy.state.money);
  hud.setHealth(game.health, economy.state.armor);
  hud.setBotsAlive(bots.aliveCount());
  hud.setGrenades(economy.state.grenades);
  hud.setBombCarried(bomb.state.status === 'carried' || bomb.state.status === 'planting');
  hud.setScore(rounds.state.wins, rounds.state.losses, rounds.state.round);
  // While the bomb is planted the timer is the fuse, not the round clock.
  if (rounds.state.phase === 'live' && bomb.state.status === 'planted') hud.setTimer(bomb.state.fuseLeft, 'planted');
  else hud.setTimer(rounds.state.phaseLeft, rounds.state.phase);
  hud.setBombStatus(rounds.state.phase === 'live' && bomb.state.status === 'planted'
    ? `BOMB PLANTED — SITE ${bomb.state.site} · ${Math.ceil(bomb.state.fuseLeft)}s` : '');
}

function refreshBuyMenu() {
  if (!hud.isBuyOpen()) return;
  hud.showBuy(BUY_ITEMS, economy.state.money, economy.state.owned, economy.state.grenades, economy.state.armor);
}

function openBuyMenu() {
  if (rounds.state.phase !== 'buy' || hud.isBuyOpen()) return;
  game.suppressPause = true;
  hud.showBuy(BUY_ITEMS, economy.state.money, economy.state.owned, economy.state.grenades, economy.state.armor);
  if (document.pointerLockElement) document.exitPointerLock();
}

function closeBuyMenu(relock) {
  if (!hud.isBuyOpen()) return;
  hud.hideBuy();
  game.suppressPause = false;
  if (relock && !shot) input.requestLock();
}

function restartMatch() {
  rounds.resetMatch();
  economy.state.money = 800;
  economy.state.owned = new Set(['rifle', 'pistol']);
  economy.state.grenades = 0;
  economy.state.armor = false;
  startRound();
  hud.hideOverlay();
}

function startRound() {
  game.health = 100;
  game.grenade = null;
  game.suppressPause = false;
  player.reset(world.spawn.x, world.spawn.z);
  weapons.resetRound();
  weapons.switchTo(economy.owns('rifle') ? 'rifle' : 'pistol');
  bots.reset();
  bomb.reset();
  economy.roundStart();
  game.plantSite = null;
  hud.setBombStatus('');
  hud.setPlantProgress(-1);
  hud.hideBanner();
  syncHud();
}

function endRound(won, reason) {
  const result = rounds.endRound(won, reason);
  if (result === null) return;
  bomb.cancelPlant();
  hud.setPlantProgress(-1);
  if (won) {
    economy.add(WIN_BONUS);
    audio.win();
    hud.showBanner('ROUND WON', reason, 3200);
  } else {
    economy.add(LOSS_BONUS);
    audio.lose();
    hud.showBanner('ROUND LOST', reason, 3200);
  }
  if (rounds.state.matchOver) {
    hud.showOverlay(rounds.state.matchWon ? 'matchWin' : 'matchLoss', `${rounds.state.wins} — ${rounds.state.losses}`);
    if (document.pointerLockElement) document.exitPointerLock();
  }
  syncHud();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    game.started = true;
    hud.hideOverlay();
  } else if (!rounds.state.matchOver && !game.suppressPause && !hud.isBuyOpen()) {
    hud.showOverlay(game.started ? 'paused' : 'start');
  }
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function muzzleWorld() {
  camera.getWorldDirection(direction);
  muzzle.copy(camera.position).addScaledVector(direction, 0.55);
  tmpA.crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
  muzzle.addScaledVector(tmpA, 0.18);
  muzzle.y -= 0.12;
  return muzzle;
}

function shoot(spread) {
  const fired = weapons.fire(elapsed);
  if (!fired) {
    if (weapons.ammoFor(weapons.current()).mag === 0) audio.dryFire();
    return false;
  }
  audio.shot(fired.kind);
  const from = muzzleWorld().clone();
  const speed = player.groundSpeed();
  for (let p = 0; p < fired.pellets; p += 1) {
    camera.getWorldDirection(direction);
    direction.x += (random() * 2 - 1) * spread;
    direction.y += (random() * 2 - 1) * spread;
    direction.z += (random() * 2 - 1) * spread;
    direction.normalize();
    scene.updateMatrixWorld(true);
    raycaster.set(camera.position, direction);
    raycaster.far = 90;
    const hit = raycaster.intersectObjects(shootables, false)[0];
    const end = hit ? hit.point : tmpB.copy(camera.position).addScaledVector(direction, 80);
    effects.tracer(from, end);
    if (!hit) continue;
    if (hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const part = hit.object.userData.part;
      const dmg = fired.damage * (part === 'head' ? fired.headMult : 1);
      const killed = bots.damage(bot, dmg);
      if (killed) {
        economy.add(KILL_BONUS);
        audio.kill();
        hud.killFeed(`You eliminated Defender ${bot.index + 1}${part === 'head' ? ' — headshot' : ''}`);
        hud.hitMarker(true, markerHoldMs);
        if (bots.aliveCount() === 0) {
          endRound(true, bomb.state.status === 'planted' ? 'Site cleared — the bomb will do the rest.' : 'All defenders eliminated.');
        }
      } else {
        audio.hit();
        hud.hitMarker(false, markerHoldMs);
      }
      effects.impact(hit.point, hit.face ? hit.face.normal : tmpC.set(0, 1, 0), 6, 0.7);
    } else {
      effects.impact(hit.point, hit.face ? hit.face.normal : tmpC.set(0, 1, 0), 4, 0.7);
    }
  }
  const recoil = weapons.recoil();
  player.recoil(recoil.pitch + random() * 0.004, (random() * 2 - 1) * recoil.yaw);
  bots.hearShot(body.position);
  syncHud();
  return true;
}

function throwGrenade() {
  if (economy.state.grenades <= 0 || game.grenade) return;
  economy.state.grenades -= 1;
  const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  mesh.castShadow = true;
  scene.add(mesh);
  camera.getWorldDirection(direction);
  game.grenade = {
    pos: muzzleWorld().clone(),
    vel: direction.clone().multiplyScalar(16).add(new THREE.Vector3(0, 4.5, 0)),
    fuseLeft: 1.2,
    mesh,
    bounced: false,
  };
  mesh.position.copy(game.grenade.pos);
  syncHud();
}

function explodeGrenade(pos) {
  effects.explosion(pos);
  audio.explosion();
  // Damage falls off with distance: 90 at the centre, 15 at the edge of the 5 m blast.
  for (const bot of bots.items) {
    if (!bot.alive) continue;
    const d = Math.hypot(bot.group.position.x - pos.x, bot.group.position.z - pos.z);
    if (d > 5) continue;
    const dmg = Math.round(90 - (d / 5) * 75);
    const killed = bots.damage(bot, dmg);
    if (killed) {
      economy.add(KILL_BONUS);
      audio.kill();
      hud.killFeed(`Grenade eliminated Defender ${bot.index + 1}`);
      if (bots.aliveCount() === 0) endRound(true, 'All defenders eliminated.');
    }
  }
  const pd = Math.hypot(body.position.x - pos.x, body.position.z - pos.z);
  if (pd <= 5 && game.health > 0) {
    const dmg = Math.round(90 - (pd / 5) * 75);
    damagePlayer(dmg, pos, 'torso');
  }
  scene.remove(game.grenade.mesh);
  game.grenade = null;
}

function damagePlayer(amount, fromPos, part) {
  if (game.health <= 0 || rounds.state.phase !== 'live') return;
  let dmg = amount;
  if (economy.state.armor) dmg = Math.round(dmg * 0.5);
  game.health -= dmg;
  audio.hurt();
  hud.vignetteFlash();
  const dx = fromPos.x - body.position.x;
  const dz = fromPos.z - body.position.z;
  const bearing = Math.atan2(dx, dz);
  let rel = bearing - (body.yaw + Math.PI);
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;
  hud.damageFrom(rel);
  if (game.health <= 0) {
    game.health = 0;
    economy.onDeath();
    bomb.cancelPlant();
    hud.setPlantProgress(-1);
    if (bomb.state.status === 'planted') {
      // Down after the plant: the round plays on. The fuse or a defuse decides it —
      // the player watches from where they fell. No pause overlay: the round is live.
      game.suppressPause = true;
      hud.showBanner('YOU ARE DOWN', 'The bomb decides the round now.', 60000);
      if (document.pointerLockElement) document.exitPointerLock();
    } else {
      endRound(false, 'You were eliminated.');
    }
  }
  syncHud();
}

function siteAt(pos) {
  if (world.siteA.containsPoint(tmpA.set(pos.x, 1, pos.z))) return 'A';
  if (world.siteB.containsPoint(tmpA.set(pos.x, 1, pos.z))) return 'B';
  return null;
}

function step(dt) {
  elapsed += dt;
  const keys = input.state.keys;
  const phase = rounds.state.phase;

  // --- Round clock. ---
  const tick = rounds.step(dt);
  if (tick === 'live') {
    closeBuyMenu(false);
    hud.showBanner(`ROUND ${rounds.state.round}`, 'Plant the bomb at A or B — or clear the site.', 2600);
  } else if (tick === 'timeout') {
    endRound(false, 'Time expired — the bomb was never planted.');
  } else if (tick === 'next') {
    startRound();
  }

  // A dead player stays where they fell while the round plays on.
  if (game.health > 0) player.step(dt, keys);
  weapons.step(dt, elapsed, player.groundSpeed(), body.crouching, input.state.aiming);
  effects.step(dt);

  // --- Footsteps. ---
  const speed = player.groundSpeed();
  if (body.onGround && speed > 1) {
    game.stepDistance += speed * dt;
    const stride = body.sprinting ? 2.6 : 2.1;
    if (game.stepDistance >= stride) {
      game.stepDistance = 0;
      audio.step();
    }
  }

  // --- Weapon switching: 1-5 and the wheel cycle owned weapons. ---
  for (let i = 0; i < WEAPON_ORDER.length; i += 1) {
    if (input.pressed(`Digit${i + 1}`) && economy.owns(WEAPON_ORDER[i])) {
      if (weapons.switchTo(WEAPON_ORDER[i])) audio.scope();
    }
  }
  const wheel = input.takeWheel();
  if (wheel !== 0) {
    const owned = WEAPON_ORDER.filter((id) => economy.owns(id));
    if (owned.length > 1) {
      const idx = owned.indexOf(weapons.current());
      const next = owned[(idx + (wheel > 0 ? 1 : -1) + owned.length) % owned.length];
      weapons.switchTo(next);
    }
  }
  if (input.pressed('KeyR') && weapons.reload()) audio.reload();

  // --- Buy menu (buy phase only). ---
  if (input.pressed('KeyB')) {
    if (hud.isBuyOpen()) closeBuyMenu(true);
    else openBuyMenu();
  }
  if (input.pressed('Escape') && hud.isBuyOpen()) closeBuyMenu(true);

  // --- Grenade. ---
  if (input.pressed('KeyG') && phase === 'live') throwGrenade();

  // --- Grenade flight. ---
  if (game.grenade) {
    const g = game.grenade;
    g.fuseLeft -= dt;
    g.vel.y -= 14 * dt;
    g.pos.addScaledVector(g.vel, dt);
    g.mesh.position.copy(g.pos);
    let hitWall = false;
    for (const c of world.colliders) {
      if (c.containsPoint(g.pos)) {
        hitWall = true;
        break;
      }
    }
    if (g.pos.y <= 0.05) {
      g.pos.y = 0.05;
      if (Math.abs(g.vel.y) > 3 && !g.bounced) {
        g.vel.y = -g.vel.y * 0.4;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
        g.bounced = true;
        audio.grenadeBounce();
      } else {
        g.vel.set(0, 0, 0);
      }
    }
    if (hitWall || g.fuseLeft <= 0) explodeGrenade(g.pos.clone());
  }

  // --- Bomb planting: hold E inside a site while the round is live. ---
  if (phase === 'live' && game.health > 0) {
    if (bomb.state.status === 'carried') {
      const site = siteAt(body.position);
      if (site && keys.has('KeyE')) {
        bomb.startPlant(site, body.position);
        game.plantSite = site;
      }
    } else if (bomb.state.status === 'planting') {
      const site = siteAt(body.position);
      if (site === bomb.state.site && keys.has('KeyE')) {
        const done = bomb.stepPlant(dt);
        hud.setPlantProgress(bomb.state.plantProgress / PLANT_TIME);
        if (done === 'planted') {
          economy.add(PLANT_BONUS);
          rounds.setPlanted(true);
          audio.plantBeep(true);
          hud.killFeed(`Bomb planted at site ${site}`);
          hud.setPlantProgress(-1);
          bots.converge();
          syncHud();
        }
      } else {
        bomb.cancelPlant();
        hud.setPlantProgress(-1);
      }
    }
  }
  // The fuse runs while the round is live — including after the player is down.
  if (bomb.state.status === 'planted' && phase === 'live') {
    const done = bomb.stepFuse(dt);
    if (done === 'exploded') {
      effects.explosion(bomb.state.position);
      audio.explosion();
      endRound(true, 'The bomb detonated.');
    }
  }

  // --- Bots. ---
  bots.step(dt, {
    playerPos: body.position,
    playerEyeY: body.position.y + body.eye,
    playerSpeed: speed,
    playerAlive: game.health > 0 && phase === 'live',
    bombPlanted: bomb.state.status === 'planted' && phase === 'live',
    bombPos: bomb.state.position,
    onShoot: (from, to, dist) => {
      effects.tracer(from, to);
      audio.enemyShot(dist);
    },
    onPlayerHit: (dmg, fromPos, part) => damagePlayer(dmg, fromPos, part),
    onDefused: () => {
      bomb.state.status = 'defused';
      endRound(false, 'The bomb was defused.');
    },
  });

  // --- Scope: the sniper zooms the camera while the right button is held. ---
  const targetFov = weapons.isScoped() ? 28 : 74;
  if (Math.abs(game.fov - targetFov) > 0.1) {
    game.fov += (targetFov - game.fov) * Math.min(1, dt * 14);
    camera.fov = game.fov;
    camera.updateProjectionMatrix();
  }
  hud.setScoped(weapons.isScoped());

  // --- Crosshair spread follows the gun's real cone. ---
  const spread = weapons.spread(speed, body.crouching, input.state.aiming);
  hud.setCrosshairSpread(3 + spread * 420);
  syncHud();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!game.frozen) {
    const look = input.takeLook();
    const sens = weapons.isScoped() ? 0.45 : 1;
    player.look(look.x * sens, look.y * sens);
    const firing = input.state.firing;
    const def = weapons.def();
    const wantFire = rounds.state.phase === 'live' && game.health > 0 && !hud.isBuyOpen();
    if (wantFire && firing && weapons.ready()) {
      if (def.auto || !game.wasFiring) shoot(shot ? 0 : weapons.spread(player.groundSpeed(), body.crouching, input.state.aiming));
    }
    game.wasFiring = firing;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    input.endFrame(steps > 0);
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  game.started = true;
  // A scripted mid-match state, so the HUD reads like a real game.
  rounds.state.round = 3;
  rounds.state.wins = 2;
  rounds.state.losses = 1;
  rounds.state.phase = 'live';
  rounds.state.phaseLeft = 87;
  economy.state.money = 1250;
  economy.state.owned = new Set(['rifle', 'smg', 'pistol']);
  economy.state.grenades = 1;
  game.health = 100;
  startRound();
  rounds.state.round = 3;
  rounds.state.wins = 2;
  rounds.state.losses = 1;
  rounds.state.phase = 'live';
  rounds.state.phaseLeft = 87;
  economy.state.money = 1250;
  economy.state.grenades = 1;
  syncHud();
  // Clear the round-start draw time so a scripted shot fires on the first frame.
  weapons.state.drawLeft = 0;
  weapons.state.cooldown = 0;
  if (name === 'start') {
    body.position.set(0, 0, 12);
    body.yaw = 0;
    body.pitch = 0;
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showOverlay('start');
  } else if (name === 'play') {
    // Mid-fight: the player is up mid, the mid defender in the sights. The bot
    // stands just south of the mid block, in the open lane — never behind it.
    body.position.set(0, 0, 5);
    settle(10);
    const bot = bots.items[2];
    bot.group.position.set(0, 0, 2.2);
    bot.yaw = 0;
    bot.group.rotation.y = bot.yaw;
    aimAt(bots.aimPoint(2));
    shoot(0);
    settle(6);
    aimAt(bots.aimPoint(2));
  } else {
    // Round won at site A: the banner over the cleared site.
    body.position.set(-9, 0, -7.5);
    settle(10);
    const dead = bots.items[0];
    dead.group.position.set(-13, 0, -11);
    bots.damage(dead, 1000);
    bots.items[1].group.position.set(11, 0, -8);
    bots.damage(bots.items[1], 1000);
    aimAt(new THREE.Vector3(-13, 1.2, -11));
    settle(20);
    hud.showBanner('ROUND WON', 'All defenders eliminated — site A is yours.', 60000);
    // The round win counts: update the state itself (syncHud below reads it).
    rounds.state.wins = 3;
    rounds.state.phase = 'over';
    rounds.state.phaseLeft = 0;
  }
  syncCamera();
  syncHud();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      game.frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
startRound();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
