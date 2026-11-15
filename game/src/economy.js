// Economy: one place holds the money. Kill $300, round win $3,250, round loss
// $1,900, plant $300, defuse $300. Buy menu prices live in weapons.js.
export const KILL_REWARD = 300;
export const ROUND_WIN = 3250;
export const ROUND_LOSS = 1900;
export const OBJECTIVE_REWARD = 300;

export function createEconomy() {
  const state = { money: 800, kills: 0, deaths: 0 };
  return {
    state,
    reset() { state.money = 800; state.kills = 0; state.deaths = 0; },
    add(amount) { state.money = Math.max(0, state.money + amount); },
    canAfford(price) { return state.money >= price; },
    spend(price) {
      if (!this.canAfford(price)) return false;
      state.money -= price;
      return true;
    },
  };
}
