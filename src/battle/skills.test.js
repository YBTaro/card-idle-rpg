// src/battle/skills.test.js
import { describe, it, expect } from 'vitest';
import { normalAttack, castSkill } from './skills.js';
import { makeUnit } from './testHelpers.js';
import { Rng } from '../core/rng.js';

const ctxFor = (caster, allies, enemies, events = []) => ({
  allies, enemies, rng: new Rng(1),
  emit: (event, payload) => events.push({ event, payload }),
});

describe('普攻集氣', () => {
  it('輸出普攻自身 +25、被擊坦克 +20、隊友輔助 +12', () => {
    const dps = makeUnit({ team: 0, pos: 1, class: 'dps' });
    const support = makeUnit({ team: 0, pos: 5, class: 'support' });
    const foeTank = makeUnit({ team: 1, pos: 1, class: 'tank', hp: 99999 });
    normalAttack(dps, ctxFor(dps, [dps, support], [foeTank]));
    expect(dps.energy).toBe(25);
    expect(support.energy).toBe(12);
    expect(foeTank.energy).toBe(20);
  });
});

describe('castSkill 資料驗證', () => {
  it('guard：全隊上 dmgTaken×0.5 buff、施放者自療', () => {
    const tank = makeUnit({ team: 0, pos: 1, class: 'tank', atk: 100 });
    const ally = makeUnit({ team: 0, pos: 2, class: 'dps' });
    tank.hp = 1; // 便於觀察自療
    castSkill(tank, 'guard', ctxFor(tank, [tank, ally], []));
    expect(ally.buffs.some((b) => b.stat === 'dmgTaken' && b.value === 0.5)).toBe(true);
    expect(tank.hp).toBe(1 + Math.round(tank.effAtk * 2.0)); // 自療 effAtk×2.0
  });

  it('heal：主目標大量、其餘小量', () => {
    const sup = makeUnit({ team: 0, pos: 5, class: 'support', atk: 100 });
    const hurt = makeUnit({ team: 0, pos: 1, hp: 1000 });
    const other = makeUnit({ team: 0, pos: 2, hp: 2000 }); // maxHp 需容納 900+overheal，避免治療被 maxHp 夾住
    hurt.hp = 100; other.hp = 900;
    castSkill(sup, 'heal', ctxFor(sup, [sup, hurt, other], []));
    expect(hurt.hp).toBe(100 + Math.round(sup.effAtk * 3.0)); // 主目標 = 血最低者
    expect(other.hp).toBe(900 + Math.round(sup.effAtk * 1.2));
  });
});
