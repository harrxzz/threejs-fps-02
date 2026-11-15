// The economy: money that persists across rounds, and the buy menu's catalogue. Weapons
// once bought stay owned; ammo refills free at round start; armour lasts one round and is
// lost when the player dies. The buy menu is a DOM overlay; this module only owns the
// numbers and the purchase rules.
import { WEAPONS } from './weapons.js';

export const START_MONEY = 800;
export const WIN_BONUS = 300;
export const LOSS_BONUS = 150;
export const KILL_BONUS = 100;
export const PLANT_BONUS = 200;
export const GRENADE_PRICE = 200;
export const ARMOR_PRICE = 400;

export const BUY_ITEMS = [
  { id: 'rifle', name: 'Sable Rifle', price: WEAPONS.rifle.price, kind: 'weapon', desc: '30 rd · auto · 34 dmg' },
  { id: 'smg', name: 'Dune SMG', price: WEAPONS.smg.price, kind: 'weapon', desc: '32 rd · fast auto · 22 dmg' },
  { id: 'shotgun', name: 'Breacher', price: WEAPONS.shotgun.price, kind: 'weapon', desc: '6 shells · 8 pellets · 12 dmg' },
  { id: 'sniper', name: 'Longshot', price: WEAPONS.sniper.price, kind: 'weapon', desc: '5 rd · bolt · 95 dmg · scope' },
  { id: 'pistol', name: 'Sidearm', price: WEAPONS.pistol.price, kind: 'weapon', desc: '12 rd · semi · 28 dmg' },
  { id: 'grenade', name: 'Frag Grenade', price: GRENADE_PRICE, kind: 'grenade', desc: 'Throw with G · 5 m blast' },
  { id: 'armor', name: 'Body Armour', price: ARMOR_PRICE, kind: 'armor', desc: 'Absorbs 50% damage · this round' },
];

export function createEconomy() {
  const state = {
    money: START_MONEY,
    owned: new Set(['rifle', 'pistol']),
    grenades: 0,
    armor: false,
  };

  function canBuy(item) {
    if (item.kind === 'weapon' && state.owned.has(item.id)) return false;
    if (item.kind === 'grenade' && state.grenades >= 1) return false;
    if (item.kind === 'armor' && state.armor) return false;
    return state.money >= item.price;
  }

  function buy(item) {
    if (!canBuy(item)) return false;
    state.money -= item.price;
    if (item.kind === 'weapon') state.owned.add(item.id);
    else if (item.kind === 'grenade') state.grenades = 1;
    else if (item.kind === 'armor') state.armor = true;
    return true;
  }

  function roundStart() {
    state.armor = false;
  }

  function onDeath() {
    state.armor = false;
    state.grenades = 0;
  }

  return {
    state,
    canBuy,
    buy,
    roundStart,
    onDeath,
    add(amount) {
      state.money += amount;
    },
    owns(id) {
      return state.owned.has(id);
    },
  };
}
