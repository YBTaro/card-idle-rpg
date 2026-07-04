// 商店：每日免費禮 + 每日特惠（日期種子輪替折扣）+ 常駐兌換（金幣 → 精華/召喚券）。
// 只用現有資源（金幣/精華/召喚券），不引入新貨幣。每日限購防經濟破口。
import { store } from '../core/state.js';
import { saveGame } from '../core/save.js';
import { Rng } from '../core/rng.js';

const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

// 常駐貨架（cost/grants 都用現有資源；daily = 每日限購次數）
export const SHOP_ITEMS = [
  { id: 'essence_s', icon: '🔹', name: '精華結晶', desc: '精華 ×100', cost: { gold: 5000 }, grants: { essence: 100 }, daily: 5 },
  { id: 'essence_l', icon: '💠', name: '精華寶匣', desc: '精華 ×550（加量 10%）', cost: { gold: 25000 }, grants: { essence: 550 }, daily: 2 },
  { id: 'ticket_1', icon: '🎟️', name: '召喚券', desc: '召喚券 ×1', cost: { gold: 20000 }, grants: { tickets: 1 }, daily: 2 },
];

// 每日免費禮
export const FREE_GIFT = { id: 'free', icon: '🎁', name: '每日免費禮', desc: '金幣 ×2,000＋精華 ×20', cost: {}, grants: { gold: 2000, essence: 20 }, daily: 1 };

// 每日特惠池：以常駐品項打折（seed=日期 → 全服同款）
const DEAL_POOL = [
  { base: 'essence_s', off: 0.8 },
  { base: 'essence_s', off: 0.7 },
  { base: 'essence_l', off: 0.8 },
  { base: 'essence_l', off: 0.7 },
  { base: 'ticket_1', off: 0.75 },
  { base: 'ticket_1', off: 0.6 },
];

function daySeed(now = Date.now()) {
  const d = dayKey(now);
  return Number(d.replaceAll('-', '')) % 2147483647;
}

// 今日 3 檔特惠（每檔限購 1）。
export function dailyDeals(now = Date.now()) {
  const rng = new Rng(daySeed(now));
  const picked = [];
  const used = new Set();
  for (let guard = 0; guard < 30 && picked.length < 3; guard += 1) {
    const deal = rng.pick(DEAL_POOL);
    const key = `${deal.base}:${deal.off}`;
    if (used.has(key) || picked.some((p) => p.base === deal.base)) continue;
    used.add(key);
    const item = SHOP_ITEMS.find((i) => i.id === deal.base);
    picked.push({
      id: `deal_${picked.length}`,
      base: deal.base,
      icon: item.icon,
      name: `特惠・${item.name}`,
      desc: item.desc,
      off: deal.off,
      cost: { gold: Math.round(item.cost.gold * deal.off / 100) * 100 },
      origCost: item.cost,
      grants: item.grants,
      daily: 1,
    });
  }
  return picked;
}

// 跨日重置購買記錄。
export function ensureShopDay(state = store.state, now = Date.now()) {
  const day = dayKey(now);
  if (!state.shop || state.shop.day !== day) {
    state.shop = { day, bought: {} };
    saveGame();
  }
  return state.shop;
}

export function boughtCount(itemId, state = store.state) {
  return ensureShopDay(state).bought[itemId] ?? 0;
}

// 購買（免費禮/常駐/特惠通用）。回傳 grants；不足/限購丟 Error。
export function buyShopItem(item, state = store.state) {
  const shop = ensureShopDay(state);
  const bought = shop.bought[item.id] ?? 0;
  if (bought >= item.daily) throw new Error('今日已達限購');
  const costGold = item.cost.gold ?? 0;
  if ((state.currencies.gold || 0) < costGold) throw new Error('金幣不足');
  state.currencies.gold -= costGold;
  if (item.grants.gold) state.currencies.gold += item.grants.gold;
  if (item.grants.tickets) state.currencies.tickets += item.grants.tickets;
  if (item.grants.essence) state.inventory.materials.essence = (state.inventory.materials.essence || 0) + item.grants.essence;
  shop.bought[item.id] = bought + 1;
  saveGame();
  store.notify();
  return item.grants;
}
