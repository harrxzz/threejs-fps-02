// The defenders: four bots that patrol, see, hear, shoot back and converge on a planted
// bomb. Each bot is a small state machine — patrol, hold, engage, investigate, converge,
// defuse, dead — driven by line of sight, hearing and the bomb. They aim with a reaction
// delay and an error that grows with distance and with how fast the player moves, so a
// still player at long range is a fair fight and a sprinting one is hard to hit.
//
// Fairness rules, by design:
// - A bot only knows where the player is when it SEES them (line of sight, ±45 degrees,
//   40 m) or HEARS a shot (25 m). It never tracks the player through a wall.
// - Sight is re-checked 5-10 times a second per bot, staggered, not every frame. The
//   cached result is what the state machine acts on.
// - Losing sight does not snap a bot back to patrol: it holds the last known position
//   for a short grace period, then investigates that spot.
// - Bots fire in bursts of 2-4 with a pause between them, and only while they can see
//   the player. A wall between bot and player eats the shot.
// - When the bomb is planted, every living bot converges on the site — each to its own
//   offset around the bomb, so they never pile on one spot — but spotting the player
//   still wins: engage always has priority over converging.
// - Exactly one bot defuses at a time; the rest hold nearby as cover. Damage, or
//   spotting the player, cancels the defuse.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const HEALTH = 100;
const PATROL_SPEED = 2.2;
const HUNT_SPEED = 3.4;
const SEE_DISTANCE = 40;
const SEE_HALF_FOV = Math.PI / 4; // ±45 degrees
const HEAR_DISTANCE = 25;
const DEFUSE_TIME = 5;
const BOT_DAMAGE = 10;
const BOT_HEAD_MULT = 4;
const LOSE_GRACE = 0.6; // how long an engaging bot keeps the last known spot

// One patrol loop per bot, in open lanes so the routes never cross a wall. Every
// waypoint is clear floor: no waypoint sits on a platform, a crate or a barrel, and no
// leg of a loop crosses a wall (a leg that did would wedge the bot against it).
const ROUTES = [
  [new THREE.Vector3(-10, 0, -8), new THREE.Vector3(-14, 0, -7), new THREE.Vector3(-11, 0, -7), new THREE.Vector3(-11, 0, -5)],
  [new THREE.Vector3(10, 0, -8), new THREE.Vector3(14, 0, -7), new THREE.Vector3(11, 0, -7), new THREE.Vector3(11, 0, -5)],
  [new THREE.Vector3(3.5, 0, 2.5), new THREE.Vector3(3.5, 0, -3), new THREE.Vector3(-3.5, 0, -3), new THREE.Vector3(-3.5, 0, 2.5)],
  [new THREE.Vector3(-6, 0, -9), new THREE.Vector3(-3, 0, -10), new THREE.Vector3(3, 0, -10), new THREE.Vector3(6, 0, -9)],
];

// Waypoint graph for routing. A beeline across the map crosses walls — the site side
// walls have a single doorway each, the dividers have three gaps — so a bot that must
// cross the map routes through this graph instead. Every node is verified-open floor
// and every edge is a straight, unobstructed walk (checked against the map colliders).
// BFS over it is a few dozen operations, so a bot can re-route whenever it needs to.
const NAV_NODES = [
  [0, 12], [-13, 10], [13, 10],
  [0, 5], [0, 7], [-13, 5], [-13, 7], [13, 5], [13, 7],
  [-13, 3], [-13, 0.5], [-16.5, 0],
  [13, 3], [13, 0.5], [16.5, 0],
  [0, 2], [3.5, 2], [3.5, -2], [0, -3], [-3.5, 2], [-3.5, -2],
  [0, -5], [0, -7], [-11, -5], [-11, -7], [11, -5], [11, -7],
  [0, -9], [-9, -9], [-7, -9], [7, -9], [9, -9],
  [-11, -8.5], [11, -8.5],
];
// Index constants for the nodes routing cares about by name.
const NAV_AI = 32;
const NAV_BI = 33;
const NAV_EDGES = [
  [0, 1], [0, 2], [0, 3],
  [1, 5], [2, 7],
  [3, 4], [5, 6], [7, 8],
  [4, 15], [6, 9], [8, 12],
  [9, 10], [12, 13],
  [10, 11], [13, 14],
  [10, 23], [13, 25],
  [11, 19], [14, 16],
  [15, 16], [15, 19],
  [16, 17], [19, 20],
  [17, 18], [20, 18],
  [18, 21],
  [21, 22], [23, 24], [25, 26],
  [22, 27], [24, 32], [26, 33],
  [27, 29], [27, 31],
  [29, 28], [31, 30],
  [28, 32], [30, 33],
  [24, 28], [26, 31],
];
const NAV_ADJ = NAV_NODES.map(() => []);
for (const [a, b] of NAV_EDGES) {
  NAV_ADJ[a].push(b);
  NAV_ADJ[b].push(a);
}

// Breadth-first path from one node to another, as node indices excluding the start
// and including the goal. Returns [] when already there.
function findPath(start, goal) {
  if (start === goal) return [];
  const prev = new Array(NAV_NODES.length).fill(-1);
  const queue = [start];
  prev[start] = start;
  while (queue.length > 0) {
    const node = queue.shift();
    for (const next of NAV_ADJ[node]) {
      if (prev[next] !== -1) continue;
      prev[next] = node;
      if (next === goal) {
        const path = [goal];
        let at = goal;
        while (prev[at] !== at) {
          at = prev[at];
          path.unshift(at);
        }
        return path.slice(1);
      }
      queue.push(next);
    }
  }
  return [];
}

function nearestNode(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < NAV_NODES.length; i += 1) {
    const d = (NAV_NODES[i][0] - x) ** 2 + (NAV_NODES[i][1] - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// Each bot's own spot around a point of interest: a ring, one slot per bot, so four bots
// never stack on the same waypoint.
function offsetFor(index, radius, out) {
  const angle = (index * Math.PI) / 2 + Math.PI / 4;
  out.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  return out;
}

// Cover spots around a site interior node, one per bot. They sit on the far side of the
// node from the bomb (the bomb is south-west of site A, south-east of site B), so a
// defuser closing on the bomb never ends up on top of a covering bot.
const COVER_OFFSETS = [
  [1.8, 0],
  [0, 1.8],
  [1.3, 1.3],
  [-1.8, 1.8],
];

export function createBots(scene, colliders, shootables, raycaster) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.enemy), roughness: 0.65, metalness: 0.05 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.enemyDark), roughness: 0.7, metalness: 0.05 });
  const gunMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steelDark), roughness: 0.5, metalness: 0.4 });
  const visorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber) });
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.7, 0.3);
  const headGeo = new THREE.SphereGeometry(0.16, 14, 10);
  const legGeo = new THREE.BoxGeometry(0.16, 0.5, 0.16);
  const gunGeo = new THREE.BoxGeometry(0.06, 0.08, 0.5);

  const items = [];
  const hitMeshes = [];
  const tmpDir = new THREE.Vector3();
  const tmpTo = new THREE.Vector3();
  const tmpEye = new THREE.Vector3();
  const tmpTarget = new THREE.Vector3();
  const tmpFacing = new THREE.Vector3();
  const tmpOffset = new THREE.Vector3();
  const tmpMuzzle = new THREE.Vector3();
  const tmpEnd = new THREE.Vector3();
  const tmpHead = new THREE.Vector3();
  const tmpTorso = new THREE.Vector3();
  const probe = new THREE.Box3();
  let defuser = null; // the one bot currently defusing, or null

  function buildBot(index, spawn) {
    const group = new THREE.Group();
    group.position.copy(spawn);
    const legL = new THREE.Mesh(legGeo, darkMat);
    legL.position.set(-0.11, 0.25, 0);
    const legR = new THREE.Mesh(legGeo, darkMat);
    legR.position.set(0.11, 0.25, 0);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 0.95;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeo, darkMat);
    head.position.y = 1.5;
    head.userData.part = 'head';
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), visorMat);
    visor.position.set(0, 1.52, 0.14);
    const gun = new THREE.Mesh(gunGeo, gunMat);
    gun.position.set(0.2, 1.1, 0.28);
    group.add(legL, legR, torso, head, visor, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);
    const bot = {
      index,
      group,
      torso,
      head,
      health: HEALTH,
      alive: true,
      state: 'patrol', // patrol | hold | engage | investigate | converge | defuse | dead
      route: ROUTES[index],
      waypoint: 0,
      holdLeft: 0,
      holdKind: 'waypoint', // 'waypoint' | 'cover'
      yaw: 0,
      reactionLeft: 0,
      burstLeft: 0,
      burstTimer: 0,
      pauseBetweenBursts: 0,
      investigateAt: null,
      investigateLeft: 0,
      defuseLeft: 0,
      fall: 0,
      home: spawn.clone(),
      walkPhase: Math.random() * 6,
      // Sight cache: refreshed 5-10 times a second, staggered per bot.
      seeTimer: index * 0.05 + Math.random() * 0.05,
      seesPlayer: false,
      lastSeen: null,
      loseLeft: LOSE_GRACE,
      // Route state: a BFS path through the waypoint graph, or [] when beelining.
      path: [],
      pathIndex: 0,
      pathGoal: -1,
      // Cover spot for a bot that arrived while another bot defuses.
      coverAt: null,
      coverReached: false,
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    hitMeshes.push(torso, head);
    items.push(bot);
    return bot;
  }

  // Spawn order matches ROUTES: A guard, B guard, mid, rotator. Spawns sit on clear
  // floor — never on a platform, crate or barrel, or the bot is wedged from the start.
  const spawns = [
    new THREE.Vector3(-10, 0, -8),
    new THREE.Vector3(10, 0, -8),
    new THREE.Vector3(3.5, 0, 2.5),
    new THREE.Vector3(-6, 0, -9),
  ];
  for (let i = 0; i < 4; i += 1) buildBot(i, spawns[i]);

  function overlapsBot(x, z) {
    probe.min.set(x - 0.35, 0.05, z - 0.35);
    probe.max.set(x + 0.35, 1.7, z + 0.35);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }

  // Walk toward a point, sliding along walls one axis at a time. True once within
  // arriveAt metres — 0.4 for a waypoint, wider for a bomb the bot only needs to
  // reach, not stand on.
  function moveToward(bot, target, speed, dt, arriveAt = 0.4) {
    tmpTo.set(target.x - bot.group.position.x, 0, target.z - bot.group.position.z);
    const dist = tmpTo.length();
    if (dist <= arriveAt) return true;
    tmpTo.normalize();
    const stepLen = speed * dt;
    const nx = bot.group.position.x + tmpTo.x * stepLen;
    const nz = bot.group.position.z + tmpTo.z * stepLen;
    if (!overlapsBot(nx, bot.group.position.z)) bot.group.position.x = nx;
    if (!overlapsBot(bot.group.position.x, nz)) bot.group.position.z = nz;
    bot.yaw = Math.atan2(tmpTo.x, tmpTo.z);
    return dist < arriveAt;
  }

  // Route to a destination through the waypoint graph, then beeline the last leg.
  // Returns true once within arriveAt metres of the destination. The path is
  // (re)computed when the goal node changes; following it is just moveToward per hop.
  const tmpPath = new THREE.Vector3();
  function routeStep(bot, dest, destNode, speed, dt, arriveAt) {
    if (bot.pathGoal !== destNode) {
      bot.path = findPath(nearestNode(bot.group.position.x, bot.group.position.z), destNode);
      bot.pathIndex = 0;
      bot.pathGoal = destNode;
    }
    if (bot.pathIndex < bot.path.length) {
      const wp = NAV_NODES[bot.path[bot.pathIndex]];
      tmpPath.set(wp[0], 0, wp[1]);
      if (moveToward(bot, tmpPath, speed, dt, 0.5)) bot.pathIndex += 1;
      return false;
    }
    return moveToward(bot, dest, speed, dt, arriveAt);
  }

  function clearPath(bot) {
    bot.path = [];
    bot.pathIndex = 0;
    bot.pathGoal = -1;
  }

  function eyeOf(bot) {
    tmpEye.set(bot.group.position.x, bot.group.position.y + 1.45, bot.group.position.z);
    return tmpEye;
  }

  // True when the bot can see the player: close enough, inside its field of view, and
  // no wall between its eye and the player's chest. Pure geometry — no memory, no wallhack.
  function canSee(bot, playerPos, playerEyeY) {
    tmpTo.set(playerPos.x - bot.group.position.x, 0, playerPos.z - bot.group.position.z);
    const dist = tmpTo.length();
    if (dist > SEE_DISTANCE || dist < 0.01) return false;
    tmpTo.normalize();
    tmpFacing.set(Math.sin(bot.yaw), 0, Math.cos(bot.yaw));
    if (tmpFacing.dot(tmpTo) < Math.cos(SEE_HALF_FOV)) return false;
    const eye = eyeOf(bot);
    tmpDir.set(playerPos.x - eye.x, playerEyeY - eye.y, playerPos.z - eye.z);
    const len = tmpDir.length();
    tmpDir.normalize();
    raycaster.set(eye, tmpDir);
    raycaster.far = len;
    const hit = raycaster.intersectObjects(shootables, false)[0];
    return !hit;
  }

  // Refresh one bot's sight cache. Called on a staggered 0.1-0.2 s timer, so four bots
  // cost ~28 raycasts a second instead of one per bot per frame.
  function updateVision(bot, ctx, dt) {
    bot.seeTimer -= dt;
    if (bot.seeTimer > 0) return;
    bot.seeTimer = 0.1 + Math.random() * 0.1;
    const seen = ctx.playerAlive && canSee(bot, ctx.playerPos, ctx.playerEyeY);
    bot.seesPlayer = seen;
    if (seen) {
      if (!bot.lastSeen) bot.lastSeen = new THREE.Vector3();
      bot.lastSeen.copy(ctx.playerPos);
    }
  }

  function enterEngage(bot) {
    bot.state = 'engage';
    bot.reactionLeft = 0.4 + Math.random() * 0.4;
    bot.burstLeft = 0;
    bot.burstTimer = 0;
    bot.pauseBetweenBursts = 0;
    bot.loseLeft = LOSE_GRACE;
    clearPath(bot);
  }

  function startDefuse(bot) {
    bot.state = 'defuse';
    bot.defuseLeft = DEFUSE_TIME;
    defuser = bot;
    clearPath(bot);
  }

  function cancelDefuse(bot) {
    if (defuser === bot) defuser = null;
    bot.defuseLeft = 0;
    if (!bot.alive) {
      bot.state = 'dead';
      return;
    }
    // A cancelled defuse falls back to the site — or fights, if it can see the player.
    if (bot.seesPlayer) enterEngage(bot);
    else bot.state = 'converge';
  }

  function damage(bot, amount) {
    if (!bot.alive) return false;
    bot.health -= amount;
    // A hit interrupts a defuse: the defuser drops the kit and falls back.
    if (bot.state === 'defuse') cancelDefuse(bot);
    if (bot.health > 0) return false;
    if (defuser === bot) defuser = null;
    bot.alive = false;
    bot.state = 'dead';
    bot.fall = 0;
    return true;
  }

  function step(dt, ctx) {
    const { playerPos, playerEyeY, playerSpeed, playerAlive, bombPlanted, bombPos, onShoot, onPlayerHit, onDefused } = ctx;
    for (const bot of items) {
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.group.rotation.x = -bot.fall * 1.45;
        bot.group.position.y = -bot.fall * 0.08;
        continue;
      }
      bot.walkPhase += dt * 6;
      updateVision(bot, ctx, dt);

      // The planted bomb pulls every living bot to the site — except one already
      // defusing, one already fighting, one already converging, and one already
      // holding a cover spot at the site. (A cover hold is bomb duty, not idling.)
      const onBombDuty = bot.state === 'defuse' || bot.state === 'engage' || bot.state === 'converge'
        || (bot.state === 'hold' && bot.holdKind === 'cover');
      if (bombPlanted && !onBombDuty) {
        bot.state = 'converge';
      }
      // The round ended while the bot was on the bomb: stand down.
      if (!bombPlanted && bot.state === 'converge') bot.state = 'patrol';
      if (!bombPlanted && bot.state === 'defuse') {
        defuser = null;
        bot.defuseLeft = 0;
        bot.state = 'patrol';
      }

      if (bot.state === 'defuse') {
        // Standing on the bomb, defusing. A threat cancels it: spotting the player
        // means dropping the kit and fighting.
        if (playerAlive && bot.seesPlayer) {
          cancelDefuse(bot);
        } else {
          bot.defuseLeft -= dt;
          if (bot.defuseLeft <= 0) {
            bot.defuseLeft = 0;
            onDefused();
          }
        }
        continue;
      }

      if (bot.state === 'converge') {
        // Engage always beats converging: a bot that spots the player fights.
        if (playerAlive && bot.seesPlayer) {
          enterEngage(bot);
          continue;
        }
        // Route through the waypoint graph to the planted site's interior node,
        // then close on the bomb itself. A bot only needs to reach the bomb, not
        // stand on it, so 1.6 m counts as arrived.
        const siteNode = bombPos.x < 0 ? NAV_AI : NAV_BI;
        if (routeStep(bot, bombPos, siteNode, HUNT_SPEED, dt, 1.6)) {
          if (defuser === null) {
            startDefuse(bot);
          } else {
            // Another bot has the kit: this one holds a cover spot of its own
            // around the site interior node, so the defenders never stack on the bomb.
            bot.state = 'hold';
            bot.holdKind = 'cover';
            bot.holdLeft = 2 + Math.random() * 2;
            const site = NAV_NODES[siteNode];
            const cover = COVER_OFFSETS[bot.index % COVER_OFFSETS.length];
            // Site B mirrors site A, so the offsets mirror in x.
            const coverX = bombPos.x < 0 ? cover[0] : -cover[0];
            bot.coverAt = new THREE.Vector3(site[0] + coverX, 0, site[1] + cover[1]);
            bot.coverReached = false;
            clearPath(bot);
          }
        }
        bot.group.rotation.y = bot.yaw;
        continue;
      }

      // Vision-driven transition for the roaming states: seeing the player engages.
      if (playerAlive && bot.seesPlayer) {
        if (bot.state !== 'engage') enterEngage(bot);
      } else if (bot.state === 'engage') {
        // Lost sight: hold the last known spot briefly, then go check it.
        bot.loseLeft -= dt;
        if (bot.loseLeft <= 0) {
          bot.state = 'investigate';
          bot.investigateAt = bot.lastSeen
            ? new THREE.Vector3(bot.lastSeen.x, 0, bot.lastSeen.z)
            : new THREE.Vector3(bot.group.position.x, 0, bot.group.position.z);
          bot.investigateLeft = 3.5;
          bot.loseLeft = LOSE_GRACE;
        }
      }

      if (bot.state === 'engage') {
        // Face the last known spot and fire in bursts — but only while the player
        // is actually visible. No shooting through cover, no laser tracking.
        const aim = bot.seesPlayer ? playerPos : bot.lastSeen;
        if (aim) {
          tmpTo.set(aim.x - bot.group.position.x, 0, aim.z - bot.group.position.z);
          bot.yaw = Math.atan2(tmpTo.x, tmpTo.z);
        }
        bot.group.rotation.y = bot.yaw;
        if (bot.seesPlayer) bot.loseLeft = LOSE_GRACE;
        if (bot.reactionLeft > 0) {
          bot.reactionLeft -= dt;
        } else if (bot.seesPlayer && bot.burstLeft > 0) {
          bot.burstTimer -= dt;
          if (bot.burstTimer <= 0) {
            bot.burstTimer = 0.12;
            bot.burstLeft -= 1;
            fireAt(bot, ctx);
            if (bot.burstLeft === 0) bot.pauseBetweenBursts = 0.7 + Math.random() * 0.4;
          }
        } else if (bot.seesPlayer) {
          bot.pauseBetweenBursts -= dt;
          if (bot.pauseBetweenBursts <= 0) {
            bot.burstLeft = 2 + Math.floor(Math.random() * 3);
            bot.burstTimer = 0;
          }
        }
        continue;
      }

      if (bot.state === 'investigate' && bot.investigateAt) {
        // Route to the sound through the graph, then beeline the last leg.
        if (routeStep(bot, bot.investigateAt, nearestNode(bot.investigateAt.x, bot.investigateAt.z), HUNT_SPEED, dt, 0.4)) {
          bot.investigateLeft -= dt;
          bot.yaw += dt * 1.2;
          if (bot.investigateLeft <= 0) {
            bot.state = 'patrol';
            bot.investigateAt = null;
          }
        }
        bot.group.rotation.y = bot.yaw;
        continue;
      }

      if (bot.state === 'hold') {
        // A cover hold first walks to its own cover spot, then stands and scans.
        // A waypoint hold just scans the lane.
        if (bot.holdKind === 'cover' && bot.coverAt && !bot.coverReached) {
          const siteNode = bombPos.x < 0 ? NAV_AI : NAV_BI;
          if (routeStep(bot, bot.coverAt, siteNode, PATROL_SPEED, dt, 0.5)) bot.coverReached = true;
          bot.group.rotation.y = bot.yaw;
          // The kit came free while walking to cover: go defuse instead.
          if (bombPlanted && defuser === null) {
            bot.state = 'converge';
            clearPath(bot);
          }
          continue;
        }
        bot.holdLeft -= dt;
        bot.yaw += dt * 0.9;
        bot.group.rotation.y = bot.yaw;
        if (bot.holdKind === 'cover' && bombPlanted && defuser === null) {
          // The kit is free: walk back to the bomb and defuse it.
          bot.state = 'converge';
          clearPath(bot);
        } else if (bot.holdLeft <= 0) {
          if (bot.holdKind === 'cover' && bombPlanted) {
            bot.holdLeft = 1.5 + Math.random(); // keep covering the site
          } else {
            bot.state = 'patrol';
          }
        }
        continue;
      }

      // Patrol: walk the route, then hold and look around at each waypoint.
      const target = bot.route[bot.waypoint];
      if (moveToward(bot, target, PATROL_SPEED, dt)) {
        bot.waypoint = (bot.waypoint + 1) % bot.route.length;
        bot.state = 'hold';
        bot.holdKind = 'waypoint';
        bot.holdLeft = 1.2 + Math.random() * 1.3;
      }
      bot.group.rotation.y = bot.yaw;
      // A walking bot bobs slightly, so it reads as alive from across the map.
      bot.group.position.y = Math.abs(Math.sin(bot.walkPhase)) * 0.03;
    }
  }

  function fireAt(bot, ctx) {
    const { playerPos, playerEyeY, playerSpeed, onShoot, onPlayerHit } = ctx;
    const eye = eyeOf(bot);
    tmpTarget.set(playerPos.x, playerEyeY - 0.35, playerPos.z);
    tmpDir.subVectors(tmpTarget, eye);
    const dist = tmpDir.length();
    tmpDir.normalize();
    // Accuracy falls off with distance and with how fast the player moves.
    const error = 0.02 + dist * 0.003 + playerSpeed * 0.006;
    tmpDir.x += (Math.random() * 2 - 1) * error;
    tmpDir.y += (Math.random() * 2 - 1) * error;
    tmpDir.z += (Math.random() * 2 - 1) * error;
    tmpDir.normalize();
    tmpMuzzle.set(eye.x + Math.sin(bot.yaw) * 0.4, eye.y - 0.05, eye.z + Math.cos(bot.yaw) * 0.4);
    // A wall between the bot and the player eats the shot.
    raycaster.set(eye, tmpDir);
    raycaster.far = dist + 4;
    const wall = raycaster.intersectObjects(shootables, false)[0];
    tmpEnd.copy(eye).addScaledVector(tmpDir, dist + 6);
    if (wall) tmpEnd.copy(wall.point);
    onShoot(tmpMuzzle, tmpEnd, dist);
    if (wall && wall.distance < dist) return;
    // The player's hitboxes are two spheres: head (r 0.2) and torso (r 0.5).
    tmpHead.set(playerPos.x, playerEyeY - 0.12, playerPos.z);
    tmpTorso.set(playerPos.x, playerEyeY - 0.72, playerPos.z);
    if (rayHitsSphere(eye, tmpDir, tmpHead, 0.2, dist + 2)) {
      onPlayerHit(BOT_DAMAGE * BOT_HEAD_MULT, bot.group.position, 'head');
    } else if (rayHitsSphere(eye, tmpDir, tmpTorso, 0.5, dist + 2)) {
      onPlayerHit(BOT_DAMAGE, bot.group.position, 'torso');
    }
  }

  function rayHitsSphere(origin, dir, center, radius, maxDist) {
    const ox = center.x - origin.x;
    const oy = center.y - origin.y;
    const oz = center.z - origin.z;
    const tca = ox * dir.x + oy * dir.y + oz * dir.z;
    if (tca < 0 || tca > maxDist) return false;
    const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
    return d2 <= radius * radius;
  }

  function hearShot(fromPos) {
    for (const bot of items) {
      if (!bot.alive || bot.state === 'engage' || bot.state === 'converge' || bot.state === 'defuse') continue;
      const d = Math.hypot(bot.group.position.x - fromPos.x, bot.group.position.z - fromPos.z);
      if (d <= HEAR_DISTANCE) {
        // Each bot investigates its own offset around the sound, not the same spot.
        offsetFor(bot.index, 2, tmpOffset);
        bot.state = 'investigate';
        bot.investigateAt = new THREE.Vector3(fromPos.x + tmpOffset.x, 0, fromPos.z + tmpOffset.z);
        bot.investigateLeft = 3.5;
      }
    }
  }

  function converge() {
    for (const bot of items) {
      if (!bot.alive) continue;
      if (bot.state === 'engage' || bot.state === 'defuse') continue;
      bot.state = 'converge';
    }
  }

  function aliveCount() {
    return items.filter((b) => b.alive).length;
  }

  function reset() {
    defuser = null;
    for (const bot of items) {
      bot.health = HEALTH;
      bot.alive = true;
      bot.state = 'patrol';
      bot.waypoint = 0;
      bot.holdLeft = 0;
      bot.holdKind = 'waypoint';
      bot.reactionLeft = 0;
      bot.burstLeft = 0;
      bot.defuseLeft = 0;
      bot.fall = 0;
      bot.investigateAt = null;
      bot.seeTimer = bot.index * 0.05 + Math.random() * 0.05;
      bot.seesPlayer = false;
      bot.lastSeen = null;
      bot.loseLeft = LOSE_GRACE;
      bot.coverAt = null;
      bot.coverReached = false;
      clearPath(bot);
      bot.group.position.copy(bot.home);
      bot.group.position.y = 0;
      bot.group.rotation.set(0, 0, 0);
      bot.yaw = 0;
    }
  }

  function aimPoint(index) {
    const bot = items[index % items.length];
    return new THREE.Vector3(bot.group.position.x, bot.group.position.y + 1.0, bot.group.position.z);
  }

  return { items, hitMeshes, step, damage, hearShot, converge, aliveCount, reset, aimPoint };
}
