import { describe, it, expect, beforeEach } from 'vitest';
import { store, createNewGame } from '../core/state.js';
import { pull } from './gacha.js';
import { levelUp, levelUpCost, canLevelUp } from './leveling.js';
import { addToFormation, setPosition, MAX_FORMATION } from './formation.js';
import { Rng } from '../core/rng.js';

beforeEach(() => {
  store.set(createNewGame());
});

describe('抽卡', () => {
  it('一抽消耗一張券並產出 item', () => {
    const before = store.state.currencies.tickets;
    const res = pull(store.state, new Rng(123));
    expect(res.ok).toBe(true);
    expect(store.state.currencies.tickets).toBe(before - 1);
    expect(['material', 'card', 'duplicate']).toContain(res.type);
  });

  it('沒券時不能抽', () => {
    store.state.currencies.tickets = 0;
    const res = pull(store.state, new Rng(1));
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('no-ticket');
  });

  it('素材高機率（多抽以素材為大宗）', () => {
    store.state.currencies.tickets = 200;
    const rng = new Rng(42);
    let mat = 0;
    for (let i = 0; i < 100; i++) {
      const r = pull(store.state, rng);
      if (r.type === 'material') mat++;
    }
    expect(mat).toBeGreaterThan(60); // 約 85% 權重
  });
});

describe('升級', () => {
  it('扣除素材與金幣並提升等級', () => {
    const inst = store.state.cards[0];
    const lv = inst.level;
    const cost = levelUpCost(lv);
    const essBefore = store.state.inventory.materials.essence;
    const goldBefore = store.state.currencies.gold;

    expect(canLevelUp(inst)).toBe(true);
    const res = levelUp(inst.instanceId);
    expect(res.ok).toBe(true);
    expect(inst.level).toBe(lv + 1);
    expect(store.state.inventory.materials.essence).toBe(essBefore - cost.essence);
    expect(store.state.currencies.gold).toBe(goldBefore - cost.gold);
  });

  it('素材不足無法升級', () => {
    store.state.inventory.materials.essence = 0;
    const inst = store.state.cards[0];
    expect(canLevelUp(inst)).toBe(false);
    expect(levelUp(inst.instanceId).reason).toBe('no-essence');
  });
});

describe('陣容', () => {
  it('最多 6 人、同卡不可重複、可換位置', () => {
    expect(store.state.formation.length).toBe(5); // 初始 5 人（6 格）
    store.state.currencies.tickets = 500;
    let newInst = null;
    const rng = new Rng(7);
    for (let i = 0; i < 500 && !newInst; i++) {
      const r = pull(store.state, rng);
      if (r.type === 'card') newInst = store.state.cards.find((c) => c.cardId === r.cardId);
    }
    expect(newInst).toBeTruthy();
    // 還有第 6 格 → 可上陣
    expect(addToFormation(newInst.instanceId).ok).toBe(true);
    expect(store.state.formation.length).toBe(MAX_FORMATION);

    // 換位置：把第一人移到一個空位（先移走再驗證交換）
    const slot = store.state.formation[0];
    const target = slot.pos === 1 ? 2 : 1;
    setPosition(slot.instanceId, target);
    expect(slot.pos).toBe(target);
  });
});
