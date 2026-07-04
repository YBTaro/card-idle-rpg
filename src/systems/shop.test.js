import { describe, it, expect, beforeEach } from 'vitest';
import { store, createNewGame } from '../core/state.js';
import { SHOP_ITEMS, FREE_GIFT, dailyDeals, buyShopItem, boughtCount, ensureShopDay } from './shop.js';

beforeEach(() => {
  const s = createNewGame();
  s.shop = { day: '', bought: {} };
  store.set(s);
});

describe('商店', () => {
  it('每日特惠：3 檔、確定性（同日同款）、折扣低於原價', () => {
    const a = dailyDeals();
    const b = dailyDeals();
    expect(a.length).toBe(3);
    expect(a.map((d) => d.base)).toEqual(b.map((d) => d.base));
    for (const d of a) expect(d.cost.gold).toBeLessThan(d.origCost.gold);
  });

  it('購買：扣金幣、發精華、每日限購', () => {
    const s = store.state;
    const item = SHOP_ITEMS.find((i) => i.id === 'essence_s');
    const gold0 = s.currencies.gold;
    const ess0 = s.inventory.materials.essence;
    buyShopItem(item, s);
    expect(s.currencies.gold).toBe(gold0 - item.cost.gold);
    expect(s.inventory.materials.essence).toBe(ess0 + item.grants.essence);
    expect(boughtCount(item.id, s)).toBe(1);
    for (let i = 1; i < item.daily; i += 1) buyShopItem(item, s);
    expect(() => buyShopItem(item, s)).toThrow(/限購/);
  });

  it('免費禮：不扣錢、每日一次', () => {
    const s = store.state;
    const gold0 = s.currencies.gold;
    buyShopItem(FREE_GIFT, s);
    expect(s.currencies.gold).toBe(gold0 + FREE_GIFT.grants.gold);
    expect(() => buyShopItem(FREE_GIFT, s)).toThrow(/限購/);
  });

  it('金幣不足要擋', () => {
    const s = store.state;
    s.currencies.gold = 0;
    expect(() => buyShopItem(SHOP_ITEMS[0], s)).toThrow(/不足/);
  });

  it('跨日重置購買記錄', () => {
    const s = store.state;
    buyShopItem(FREE_GIFT, s);
    s.shop.day = '2000-01-01'; // 模擬昨天
    ensureShopDay(s);
    expect(boughtCount(FREE_GIFT.id, s)).toBe(0);
  });
});
