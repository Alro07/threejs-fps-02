// DUSTLINE boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. Phases: menu -> buy (15 s) -> live (100 s) -> round end -> next
// buy, first to 5 rounds takes the match. The player attacks with four friendly bots
// against five EMBER defenders; rounds end by elimination, bomb detonation, defuse
// or time. ?shot=start|play|buy|end with &seed=N sets up a deterministic frame for
// a capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITES, SPAWNS } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';
import { createBots } from './bots.js';
import { createHud } from './hud.js';
import { createEconomy, KILL_REWARD, ROUND_WIN, ROUND_LOSS, OBJECTIVE_REWARD } from './economy.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const BUY_SECONDS = 15;
const ROUND_SECONDS = 100;
const BOMB_SECONDS = 35;
const PLANT_SECONDS = 3.5;
const DEFUSE_SECONDS = 5;
const ROUNDS_TO_WIN = 5;
const MAX_ROUNDS = 9;

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
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 90);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const bots = createBots(scene, world);
const weapon = createWeapon(camera);
const hud = createHud();
const input = createInput(renderer.domElement, onLockChange);
const audio = createAudio();
const economy = createEconomy();
const player = createPlayer(world.colliders, SPAWNS.vanguard[0]);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();

// Match state, kept in one place.
const match = {
  phase: 'menu', // menu | buy | live | roundEnd | matchEnd
  round: 1,
  vanguard: 0,
  ember: 0,
  phaseLeft: 0,
  siteKey: 'A',
  bombPlanted: false,
  bombSite: null,
  bombTimer: 0,
  plantProgress: 0,
  defuseProgress: 0,
  playerAlive: true,
  bombCarrier: true,
  grenades: [],
  roundEndAt: 0,
};
const body = player.state;
let elapsed = 0;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let lastPlantBeep = 0;

const bombMesh = new THREE.Group();
{
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.3, 0.35),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.4, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.4 }),
  );
  const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 6, 6);
  light.position.y = 0.4;
  bombMesh.add(box, light);
  bombMesh.visible = false;
  scene.add(bombMesh);
}

// Player tracer: one reusable line from the muzzle to the hit point.
const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffc46a, transparent: true, opacity: 0 }));
tracer.frustumCulled = false;
scene.add(tracer);
let tracerLife = 0;

function siteOf(key) { return SITES[key]; }
function playerSite() {
  for (const [key, site] of Object.entries(SITES)) {
    const d = Math.hypot(body.position.x - site.center.x, body.position.z - site.center.z);
    if (d < site.radius) return key;
  }
  return null;
}

function refreshHud() {
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def.name);
  hud.setHealth(body.health, body.armor);
  hud.setMoney(economy.state.money);
  hud.setScore(match.vanguard, match.ember, match.round);
  hud.setGrenades(weapon.state.grenades);
  if (match.phase === 'roundEnd' || match.phase === 'matchEnd') hud.setTimerText('—');
  else hud.setTimer(match.phase === 'buy' ? match.phaseLeft : match.bombPlanted ? match.bombTimer : match.phaseLeft);
  hud.setBomb(
    match.bombPlanted ? `CHARGE PLANTED — ${Math.ceil(match.bombTimer)}s` :
    match.bombCarrier && match.playerAlive ? 'YOU CARRY THE CHARGE — plant at A or B [E]' :
    match.bombCarrier ? 'CHARGE DROPPED WITH YOU' : '',
    match.bombPlanted,
  );
}

function startRound() {
  match.siteKey = match.round % 2 === 1 ? 'A' : 'B';
  match.bombPlanted = false;
  match.bombSite = null;
  match.plantProgress = 0;
  match.defuseProgress = 0;
  match.playerAlive = true;
  match.bombCarrier = true;
  bombMesh.visible = false;
  player.respawn(SPAWNS.vanguard[0]);
  weapon.equip('pistol');
  weapon.state.grenades = 0;
  bots.reset(SPAWNS.vanguard.slice(1), SPAWNS.ember, match.siteKey);
  match.phase = 'buy';
  match.phaseLeft = BUY_SECONDS;
  hud.showBanner(`ROUND ${match.round}`, `Attack ${siteOf(match.siteKey).name} — buy up [B]`);
  hud.hideOverlay();
  refreshHud();
}

function startMatch() {
  match.round = 1;
  match.vanguard = 0;
  match.ember = 0;
  economy.reset();
  startRound();
}

function endRound(vanguardWon, reason) {
  if (match.phase !== 'live' && match.phase !== 'buy') return;
  match.phase = 'roundEnd';
  match.roundEndAt = elapsed + 4;
  if (vanguardWon) {
    match.vanguard += 1;
    economy.add(ROUND_WIN);
    audio.roundWin();
    hud.showBanner('ROUND WON', reason);
  } else {
    match.ember += 1;
    economy.add(ROUND_LOSS);
    audio.roundLose();
    hud.showBanner('ROUND LOST', reason);
  }
  hud.feed(`Round ${match.round}: ${reason}`, vanguardWon);
  if (document.pointerLockElement) document.exitPointerLock();
  refreshHud();
}

function endMatch() {
  match.phase = 'matchEnd';
  const won = match.vanguard >= ROUNDS_TO_WIN;
  hud.showOverlay(won ? 'matchWin' : 'matchLose', `VANGUARD ${match.vanguard} — ${match.ember} EMBER · ${economy.state.kills} eliminations`);
  if (document.pointerLockElement) document.exitPointerLock();
}

function checkRoundEnd() {
  if (match.phase !== 'live') return;
  const emberAlive = bots.aliveCount('ember');
  const vanguardAlive = bots.aliveCount('vanguard') + (match.playerAlive ? 1 : 0);
  if (emberAlive === 0) { endRound(true, 'EMBER squad eliminated'); return; }
  if (vanguardAlive === 0) {
    if (match.bombPlanted) return; // charge may still win it
    endRound(false, 'VANGUARD squad eliminated');
    return;
  }
  if (match.phaseLeft <= 0 && !match.bombPlanted) endRound(false, 'Time expired — site held');
}

function plantCharge() {
  match.bombPlanted = true;
  match.bombSite = playerSite();
  match.bombTimer = BOMB_SECONDS;
  match.bombCarrier = false;
  const site = siteOf(match.bombSite);
  bombMesh.position.set(site.center.x, 0.35, site.center.z);
  bombMesh.visible = true;
  economy.add(OBJECTIVE_REWARD);
  audio.plantDone();
  hud.showBanner('CHARGE PLANTED', `Defend it for ${BOMB_SECONDS} seconds`);
  hud.feed('Charge planted — defend the site', true);
  // Nearest defender rushes to defuse.
  let nearest = null;
  let nearestD = Infinity;
  for (const bot of bots.bots) {
    if (!bot.alive || bot.team !== 'ember') continue;
    const d = bot.position.distanceTo(site.center);
    if (d < nearestD) { nearestD = d; nearest = bot; }
  }
  if (nearest) {
    nearest.investigate = site.center.clone();
    nearest.investigateUntil = elapsed + BOMB_SECONDS;
  }
  refreshHud();
}

function throwGrenade() {
  if (weapon.state.grenades <= 0 || match.phase !== 'live' || !match.playerAlive) return;
  weapon.state.grenades -= 1;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.5 }),
  );
  camera.getWorldDirection(direction);
  mesh.position.copy(camera.position);
  scene.add(mesh);
  match.grenades.push({
    mesh,
    vel: direction.clone().multiplyScalar(16).add(new THREE.Vector3(0, 4.5, 0)),
    life: 2.2,
  });
  audio.click();
  refreshHud();
}

function explodeGrenade(grenade) {
  const pos = grenade.mesh.position.clone();
  scene.remove(grenade.mesh);
  audio.explosion();
  const flash = new THREE.PointLight(new THREE.Color(PALETTE.accent), 60, 14);
  flash.position.copy(pos);
  scene.add(flash);
  setTimeout(() => scene.remove(flash), 180);
  const damageAt = (target) => {
    const d = target.distanceTo(pos);
    if (d > 6.5) return 0;
    return Math.round(95 * (1 - d / 7));
  };
  if (match.playerAlive) {
    const dmg = damageAt(new THREE.Vector3(body.position.x, body.position.y + 1, body.position.z));
    if (dmg > 0 && player.damage(dmg)) killPlayer('frag');
    else if (dmg > 0) hud.hurt();
  }
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const dmg = damageAt(new THREE.Vector3(bot.position.x, bot.position.y + 1, bot.position.z));
    if (dmg > 0 && bots.damage(bot, dmg)) {
      economy.add(KILL_REWARD);
      economy.state.kills += 1;
      hud.feed(`You eliminated ${bot.name} [frag] +$${KILL_REWARD}`, true);
      audio.kill();
    }
  }
  refreshHud();
}

function killPlayer(cause) {
  if (!match.playerAlive) return;
  match.playerAlive = false;
  economy.state.deaths += 1;
  hud.feed(`You were eliminated (${cause})`, false);
  if (document.pointerLockElement) document.exitPointerLock();
  hud.showOverlay('dead');
  refreshHud();
}

function shoot(spread) {
  if (!weapon.takeRound()) return false;
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const targets = world.shootables.concat(bots.hitMeshes());
  const hit = raycaster.intersectObjects(targets, false)[0];
  muzzle.set(0.24, -0.16, -0.6).applyMatrix4(camera.matrixWorld);
  if (hit) {
    const pos = tracerGeo.attributes.position;
    pos.setXYZ(0, muzzle.x, muzzle.y, muzzle.z);
    pos.setXYZ(1, hit.point.x, hit.point.y, hit.point.z);
    pos.needsUpdate = true;
    tracer.material.opacity = 0.85;
    tracerLife = 0.06;
    const userData = hit.object.userData;
    if (userData.bot) {
      const bot = userData.bot;
      const damage = Math.round(weapon.def.damage * (userData.part === 'head' ? weapon.def.headMult : 1));
      const killed = bots.damage(bot, damage);
      hud.hitMarker(killed, shot ? 4000 : 90);
      if (killed) {
        economy.add(KILL_REWARD);
        economy.state.kills += 1;
        hud.feed(`You eliminated ${bot.name}${userData.part === 'head' ? ' — HEADSHOT' : ''} +$${KILL_REWARD}`, true);
        audio.kill();
      } else audio.hit();
      checkRoundEnd();
    }
  }
  weapon.pullTrigger();
  player.recoil(weapon.def.kick * (0.8 + random() * 0.4), (random() * 2 - 1) * 0.004);
  audio.shot(weapon.state.id);
  bots.hearShot(new THREE.Vector3(body.position.x, body.position.y + 1, body.position.z), 'vanguard');
  refreshHud();
  return true;
}

function buy(item) {
  if (match.phase !== 'buy') return;
  if (item === 'grenade') {
    if (economy.spend(GRENADE_PRICE)) { weapon.state.grenades += 1; audio.buy(); }
    else audio.denied();
  } else if (item === 'armor') {
    if (economy.spend(ARMOR_PRICE)) { body.armor = Math.min(100, body.armor + 50); audio.buy(); }
    else audio.denied();
  } else if (WEAPONS[item]) {
    if (weapon.state.id === item) return;
    if (economy.spend(WEAPONS[item].price)) { weapon.equip(item); audio.buy(); }
    else audio.denied();
  }
  refreshHud();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    audio.unlock();
    hud.hideOverlay();
    hud.showBuy(false);
  } else if (match.phase === 'live' && match.playerAlive) {
    hud.showOverlay('paused');
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

function step(dt) {
  elapsed += dt;
  if (tracerLife > 0) {
    tracerLife -= dt;
    if (tracerLife <= 0) tracer.material.opacity = 0;
  }
  if (match.phase === 'buy') {
    match.phaseLeft -= dt;
    if (match.phaseLeft <= 0) {
      match.phase = 'live';
      match.phaseLeft = ROUND_SECONDS;
      hud.showBuy(false);
      hud.showBanner(`ROUND ${match.round} — GO`, `Attack ${siteOf(match.siteKey).name}`);
    }
    player.step(dt, input.state.keys);
  } else if (match.phase === 'live') {
    if (!match.bombPlanted) match.phaseLeft -= dt;
    else {
      match.bombTimer -= dt;
      bombMesh.rotation.y += dt * 2;
      if (match.bombTimer <= 0) {
        audio.explosion();
        bombMesh.visible = false;
        endRound(true, 'Charge detonated');
        return;
      }
      // A defender standing on the charge defuses it.
      const site = siteOf(match.bombSite);
      let defusing = false;
      for (const bot of bots.bots) {
        if (!bot.alive || bot.team !== 'ember') continue;
        if (Math.hypot(bot.position.x - site.center.x, bot.position.z - site.center.z) < 2.2) defusing = true;
      }
      if (defusing) {
        match.defuseProgress += dt;
        if (match.defuseProgress >= DEFUSE_SECONDS) {
          bombMesh.visible = false;
          endRound(false, 'Charge defused');
          return;
        }
      } else match.defuseProgress = Math.max(0, match.defuseProgress - dt * 2);
    }
    if (match.playerAlive) {
      player.step(dt, input.state.keys);
      // Planting: hold E inside a site while carrying the charge.
      const siteKey = playerSite();
      if (siteKey && match.bombCarrier && input.state.keys.has('KeyE')) {
        match.plantProgress += dt;
        if (match.plantProgress - lastPlantBeep > 1) { lastPlantBeep = match.plantProgress; audio.plantBeep(); }
        if (match.plantProgress >= PLANT_SECONDS) plantCharge();
      } else match.plantProgress = 0;
    }
    weapon.step(dt);
    bots.step(dt, elapsed, body, match.playerAlive, {
      onBotShot(bot, enemy, aim, hit) {
        audio.enemyShot(enemy.dist);
        if (!hit) return;
        if (enemy.kind === 'player') {
          if (shot) return; // captures never end in a death overlay
          if (player.damage(13 + Math.floor(random() * 6))) killPlayer(bot.name);
          else hud.hurt();
          refreshHud();
        } else if (bots.damage(enemy.ref, 13 + Math.floor(random() * 6))) {
          hud.feed(`${bot.name} eliminated ${enemy.ref.name}`, false);
          checkRoundEnd();
        }
      },
    });
    // Grenades fly on a fixed arc and explode on the floor or after their fuse.
    for (let i = match.grenades.length - 1; i >= 0; i -= 1) {
      const grenade = match.grenades[i];
      grenade.vel.y -= 14 * dt;
      grenade.mesh.position.addScaledVector(grenade.vel, dt);
      grenade.life -= dt;
      if (grenade.mesh.position.y <= 0.1 || grenade.life <= 0) {
        match.grenades.splice(i, 1);
        explodeGrenade(grenade);
      }
    }
    checkRoundEnd();
  } else if (match.phase === 'roundEnd') {
    weapon.step(dt);
    bots.step(dt, elapsed, body, false, { onBotShot() {} });
    if (elapsed >= match.roundEndAt) {
      if (match.vanguard >= ROUNDS_TO_WIN || match.ember >= ROUNDS_TO_WIN || match.round >= MAX_ROUNDS) endMatch();
      else {
        match.round += 1;
        startRound();
      }
    }
  }
  if (match.phase === 'live' || match.phase === 'buy') refreshHud();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (match.playerAlive && (match.phase === 'live' || match.phase === 'buy')) player.look(look.x, look.y);
    if (match.phase === 'live' && match.playerAlive) {
      if (input.state.firing && weapon.ready()) shoot(shot ? 0 : weapon.spread(player.groundSpeed()));
      if (input.state.keys.has('KeyR')) weapon.reload();
      if (input.consume('KeyG')) throwGrenade();
      if (input.consume('KeyB')) {
        if (hud.buyVisible()) { hud.showBuy(false); input.requestLock(); }
        else { hud.showBuy(true); if (document.pointerLockElement) document.exitPointerLock(); }
      }
    }
    if (match.phase === 'buy' && input.consume('KeyB')) {
      if (hud.buyVisible()) { hud.showBuy(false); input.requestLock(); }
      else { hud.showBuy(true); if (document.pointerLockElement) document.exitPointerLock(); }
    }
    if (input.consume('Digit1')) buy('pistol');
    if (input.consume('Digit2')) buy('smg');
    if (input.consume('Digit3')) buy('rifle');
    if (input.consume('Digit4')) buy('sniper');
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.showBuy(false);
  startMatch();
  if (name === 'start') {
    body.position.set(-2, 0, 12);
    body.yaw = 0.15;
    body.pitch = 0.02;
    settle(20);
    hud.showOverlay('start');
  } else if (name === 'buy') {
    settle(20);
    hud.showBuy(true);
    refreshHud();
  } else if (name === 'play') {
    weapon.equip('rifle');
    weapon.state.grenades = 1;
    match.phase = 'live';
    match.phaseLeft = ROUND_SECONDS;
    body.position.set(-4, 0, 8);
    settle(30);
    // Put two defenders in the sightline and land shots on the first.
    const defenders = bots.bots.filter((b) => b.team === 'ember');
    defenders[0].position.set(-3, 0, -2);
    defenders[0].group.position.set(-3, 0, -2);
    defenders[1].position.set(3, 0, -4);
    defenders[1].group.position.set(3, 0, -4);
    const point = new THREE.Vector3(-3, 1.4, -2);
    for (let round = 0; round < 3; round += 1) {
      aimAt(point);
      shoot(0);
      settle(6);
    }
    settle(10);
  } else if (name === 'end') {
    match.vanguard = 3;
    match.ember = 2;
    match.round = 6;
    match.phase = 'roundEnd';
    match.roundEndAt = elapsed + 99;
    hud.showBanner('ROUND WON', 'EMBER squad eliminated', Infinity);
    hud.feed('You eliminated Rook — HEADSHOT +$300', true);
    hud.feed('Round 6: EMBER squad eliminated', true);
    refreshHud();
  }
  syncCamera();
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
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (match.phase === 'menu' || match.phase === 'matchEnd') startMatch();
  hud.hideOverlay();
  if (match.playerAlive) input.requestLock();
});
hud.onBuy((item) => buy(item));
// Clicking the game view re-locks the pointer after the buy menu or a pause.
renderer.domElement.addEventListener('click', () => {
  if (shot) return;
  if ((match.phase === 'live' || match.phase === 'buy') && match.playerAlive && !hud.buyVisible()) input.requestLock();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
refreshHud();
// Debug/verification hook: the live match state, for automated playtests.
window.__dustline = { match, player: body, economy: economy.state, bots, weapon: weapon.state };
if (shot) runShot(shot);
else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
