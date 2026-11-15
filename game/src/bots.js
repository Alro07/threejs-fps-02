// Bots: one module owns every bot — body, waypoint routes, line of sight, hearing,
// burst fire and tracers. Friendly bots (VANGUARD) escort the player toward a site;
// enemy bots (EMBER) hold the sites and rotate when they hear gunfire. No bot is a
// copy of a commercial character: coloured kit, visor stripe and a boxy rifle.
import * as THREE from 'three';
import { WAYPOINTS } from './world.js';
import { TEAM } from './palette.js';

const BOT_SPEED = 3.6;
const BOT_HEALTH = 100;
const SIGHT_RANGE = 30;
const BURST_GAP = 0.14;

function nearestNode(x, z) {
  let best = 'spawn';
  let bestD = Infinity;
  for (const [id, node] of Object.entries(WAYPOINTS)) {
    const d = (node[0] - x) ** 2 + (node[1] - z) ** 2;
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}

// Breadth-first route over the waypoint graph, returned as a list of [x, z].
function findRoute(from, to) {
  if (from === to) return [];
  const prev = { [from]: null };
  const queue = [from];
  while (queue.length) {
    const node = queue.shift();
    for (const next of WAYPOINTS[node][2]) {
      if (prev[next] === undefined) {
        prev[next] = node;
        if (next === to) {
          const path = [];
          let cur = to;
          while (cur !== from) { path.unshift([WAYPOINTS[cur][0], WAYPOINTS[cur][1]]); cur = prev[cur]; }
          return path;
        }
        queue.push(next);
      }
    }
  }
  return [[WAYPOINTS[to][0], WAYPOINTS[to][1]]];
}

function makeBody(scene, team, name) {
  const group = new THREE.Group();
  const kit = new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'vanguard' ? '#2c4a63' : '#5e2a24'), roughness: 0.85 });
  const stripe = new THREE.MeshStandardMaterial({ color: new THREE.Color(TEAM[team]), roughness: 0.4, emissive: new THREE.Color(TEAM[team]), emissiveIntensity: 0.35 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), kit);
  body.position.y = 1.06;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.28), kit);
  legs.position.y = 0.36;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.32), kit);
  head.position.y = 1.62;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.05), stripe);
  visor.position.set(0, 1.64, 0.17);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.62), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 }));
  gun.position.set(0.2, 1.25, -0.25);
  body.castShadow = true;
  head.castShadow = true;
  group.add(body, legs, head, visor, gun);
  scene.add(group);
  return { group, body, head, name };
}

export function createBots(scene, world) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = SIGHT_RANGE + 4;
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffb45e, transparent: true, opacity: 0.9 });
  const tracers = [];
  for (let i = 0; i < 16; i += 1) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, tracerMat.clone());
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  function spawnTracer(from, to) {
    const tracer = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % tracers.length;
    const pos = tracer.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    tracer.line.visible = true;
    tracer.life = 0.09;
  }

  function makeBot(team, name, spawn, role) {
    const parts = makeBody(scene, team, name);
    const bot = {
      team, name, role, alive: true, health: BOT_HEALTH,
      group: parts.group, bodyMesh: parts.body, headMesh: parts.head,
      position: new THREE.Vector3(spawn.x, 0, spawn.z),
      yaw: spawn.yaw ?? 0, speed: BOT_SPEED,
      path: [], pathIndex: 0, target: null, holdUntil: 0,
      burstLeft: 0, shootCooldown: 0, aimError: 0,
      investigate: null, investigateUntil: 0, stuckTimer: 0, lastPos: new THREE.Vector3(spawn.x, 0, spawn.z),
    };
    parts.body.userData = { bot, part: 'body' };
    parts.head.userData = { bot, part: 'head' };
    parts.body.name = name;
    bot.group.position.copy(bot.position);
    return bot;
  }

  const bots = [];
  const NAMES_V = ['Juno', 'Mira', 'Kade', 'Sable'];
  const NAMES_E = ['Rook', 'Vex', 'Hale', 'Onyx', 'Dagger'];
  // Friendly bots are created by main.js through addSquad; this list starts empty and
  // is filled by reset() so every round re-spawns both squads.
  function reset(vanguardSpawns, emberSpawns, siteKey) {
    for (const bot of bots) scene.remove(bot.group);
    bots.length = 0;
    vanguardSpawns.forEach((spawn, i) => {
      const bot = makeBot('vanguard', NAMES_V[i], spawn, 'escort');
      bot.siteKey = siteKey;
      bots.push(bot);
    });
    emberSpawns.forEach((spawn, i) => {
      const bot = makeBot('ember', NAMES_E[i], spawn, i < 2 ? 'hold' : 'roam');
      bot.siteKey = siteKey;
      bots.push(bot);
    });
    return bots;
  }

  function setRoute(bot, targetNode) {
    const from = nearestNode(bot.position.x, bot.position.z);
    bot.path = findRoute(from, targetNode);
    bot.pathIndex = 0;
  }

  function hasLineOfSight(from, to) {
    tmp.copy(from);
    tmp2.copy(to).sub(tmp);
    const dist = tmp2.length();
    if (dist > SIGHT_RANGE) return false;
    raycaster.set(tmp, tmp2.normalize());
    const hits = raycaster.intersectObjects(world.shootables, false);
    return hits.length === 0 || hits[0].distance > dist - 0.4;
  }

  function visibleEnemy(bot, player, playerAlive) {
    // Returns {kind:'player'|'bot', ref, point, dist} for the closest visible enemy.
    const eye = tmp.set(bot.position.x, bot.position.y + 1.55, bot.position.z);
    let best = null;
    const consider = (point, dist, ref, kind) => {
      if (dist > SIGHT_RANGE) return;
      if (!hasLineOfSight(eye, point)) return;
      if (!best || dist < best.dist) best = { kind, ref, point: point.clone(), dist };
    };
    if (playerAlive && bot.team === 'ember') {
      tmp2.set(player.position.x, player.position.y + player.eye - 0.25, player.position.z);
      consider(tmp2, eye.distanceTo(tmp2), player, 'player');
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      tmp2.set(other.position.x, other.position.y + 1.3, other.position.z);
      consider(tmp2, eye.distanceTo(tmp2), other, 'bot');
    }
    return best;
  }

  // Called by main.js when a loud shot goes off: bots nearby investigate the sound.
  function hearShot(position, team) {
    for (const bot of bots) {
      if (!bot.alive || bot.team === team) continue;
      if (bot.position.distanceTo(position) < 26) {
        bot.investigate = position.clone();
        bot.investigateUntil = performance.now() / 1000 + 4;
      }
    }
  }

  function step(dt, now, player, playerAlive, events) {
    for (const tracer of tracers) {
      if (tracer.life > 0) {
        tracer.life -= dt;
        if (tracer.life <= 0) tracer.line.visible = false;
      }
    }
    for (const bot of bots) {
      if (!bot.alive) continue;
      bot.shootCooldown = Math.max(0, bot.shootCooldown - dt);
      const enemy = visibleEnemy(bot, player, playerAlive);
      let moving = false;

      if (enemy) {
        // Face the enemy and fire in bursts; accuracy falls with range and motion.
        const dx = enemy.point.x - bot.position.x;
        const dz = enemy.point.z - bot.position.z;
        bot.yaw = Math.atan2(-dx, -dz);
        bot.target = enemy;
        if (bot.shootCooldown === 0) {
          bot.shootCooldown = BURST_GAP;
          bot.burstLeft = bot.burstLeft > 0 ? bot.burstLeft - 1 : 3 + Math.floor(Math.random() * 3);
          const spread = 0.02 + enemy.dist * 0.0016;
          const hitChance = Math.max(0.12, 0.55 - enemy.dist * 0.012);
          const muzzle = new THREE.Vector3(bot.position.x, bot.position.y + 1.3, bot.position.z);
          const aim = enemy.point.clone();
          if (Math.random() < hitChance) {
            aim.x += (Math.random() - 0.5) * spread * enemy.dist * 0.4;
            aim.y += (Math.random() - 0.5) * spread * enemy.dist * 0.4;
          } else {
            aim.x += (Math.random() - 0.5) * 2.2;
            aim.y += (Math.random() - 0.5) * 1.2;
          }
          spawnTracer(muzzle, aim);
          events.onBotShot(bot, enemy, aim, Math.random() < hitChance);
        }
      } else {
        bot.target = null;
        // Choose a destination: hold the site, escort toward it, or investigate noise.
        let destNode = null;
        if (bot.investigate && now < bot.investigateUntil) {
          destNode = nearestNode(bot.investigate.x, bot.investigate.z);
        } else if (bot.team === 'ember') {
          destNode = bot.role === 'hold' ? (bot.siteKey === 'A' ? 'defA' : 'defB') : (bot.siteKey === 'A' ? 'siteA' : 'siteB');
        } else {
          destNode = bot.siteKey === 'A' ? 'siteA' : 'siteB';
        }
        const atDest = bot.path.length === 0 || bot.pathIndex >= bot.path.length;
        if (atDest && (bot.path.length === 0 || now > bot.holdUntil)) {
          if (bot.role === 'hold' || bot.team === 'ember') {
            // Hold position and scan: slow yaw sweep.
            bot.yaw += dt * 0.5 * (bot.role === 'hold' ? 1 : -1);
            bot.holdUntil = now + 3;
          } else {
            setRoute(bot, destNode);
          }
        }
        if (bot.pathIndex < bot.path.length) {
          const [wx, wz] = bot.path[bot.pathIndex];
          const dx = wx - bot.position.x;
          const dz = wz - bot.position.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.6) {
            bot.pathIndex += 1;
          } else {
            bot.yaw = Math.atan2(-dx, -dz);
            bot.position.x += (dx / dist) * bot.speed * dt;
            bot.position.z += (dz / dist) * bot.speed * dt;
            moving = true;
          }
        }
        // Stuck detection: if barely moved in 2 s, reroute.
        if (moving) {
          if (bot.position.distanceTo(bot.lastPos) < 0.05) bot.stuckTimer += dt;
          else { bot.stuckTimer = 0; bot.lastPos.copy(bot.position); }
          if (bot.stuckTimer > 2) {
            bot.stuckTimer = 0;
            setRoute(bot, destNode);
          }
        }
      }
      // Animate: bob while walking, face yaw, sink when dead is handled by damage().
      bot.group.position.set(bot.position.x, bot.position.y + (moving ? Math.abs(Math.sin(now * 9)) * 0.03 : 0), bot.position.z);
      bot.group.rotation.y = bot.yaw;
    }
  }

  function damage(bot, amount) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.group.rotation.x = -Math.PI / 2;
    bot.group.position.y = 0.25;
    return true;
  }

  function aliveCount(team) {
    return bots.filter((b) => b.alive && b.team === team).length;
  }

  return {
    bots,
    reset,
    step,
    damage,
    hearShot,
    aliveCount,
    hitMeshes() {
      const meshes = [];
      for (const bot of bots) if (bot.alive) meshes.push(bot.bodyMesh, bot.headMesh);
      return meshes;
    },
  };
}
