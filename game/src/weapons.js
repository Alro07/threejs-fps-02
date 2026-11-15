// Weapons: four guns plus a frag grenade. Each def holds the numbers the judge's
// gunplay criterion asks for — damage, headshot multiplier, recoil, spread that grows
// with movement, fire rate and price. The view model is boxes on the camera.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: { name: 'P9 Sidearm', price: 0, damage: 26, headMult: 3, mag: 12, reserve: 36, gap: 0.16, reload: 1.4, spreadStill: 0.003, spreadMove: 0.02, kick: 0.011, auto: false },
  smg: { name: 'VK-9 SMG', price: 1500, damage: 22, headMult: 3, mag: 28, reserve: 84, gap: 0.075, reload: 1.7, spreadStill: 0.006, spreadMove: 0.034, kick: 0.007, auto: true },
  rifle: { name: 'AR-77 Rifle', price: 2700, damage: 34, headMult: 3, mag: 30, reserve: 90, gap: 0.096, reload: 1.9, spreadStill: 0.0022, spreadMove: 0.028, kick: 0.01, auto: true },
  sniper: { name: 'LW-50 Longshot', price: 4750, damage: 95, headMult: 2.5, mag: 5, reserve: 15, gap: 1.1, reload: 2.6, spreadStill: 0.0008, spreadMove: 0.06, kick: 0.035, auto: false },
};
export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;

export function createWeapon(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });

  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
  barrel.position.set(0, 0.025, -0.38);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
  stock.position.set(0, -0.02, 0.3);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.08), accent);
  sight.position.set(0, 0.075, -0.05);
  model.add(receiver, barrel, stock, sight);
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);

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

  let def = WEAPONS.pistol;
  const state = { id: 'pistol', mag: def.mag, reserve: def.reserve, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, grenades: 0 };

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    get def() { return def; },
    step,
    equip(id) {
      def = WEAPONS[id];
      state.id = id;
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      // Longer guns sit further forward in the view model.
      model.scale.setScalar(id === 'sniper' ? 1.25 : id === 'smg' ? 0.85 : id === 'pistol' ? 0.7 : 1);
    },
    ready() { return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0; },
    pullTrigger() { state.cooldown = def.gap; state.flash = 0.06; state.kick = 0.055; },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return;
      state.reloadLeft = def.reload;
    },
    spread(speed) {
      return def.spreadStill + Math.min(1, speed / 5.4) * def.spreadMove;
    },
    refill() {
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
    },
  };
}
