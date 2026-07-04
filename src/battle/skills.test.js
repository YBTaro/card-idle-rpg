// src/battle/skills.test.js
import { describe, it, expect } from 'vitest';
import { normalAttack, castSkill, skillFor, SKILLS, CARD_SKILLS } from './skills.js';
import { CARDS } from '../data/cards.js';
import { makeUnit } from './testHelpers.js';
import { hasControl } from './buffs.js';
import { Rng } from '../core/rng.js';

const ctxFor = (caster, allies, enemies, events = []) => ({
  allies, enemies, rng: new Rng(1),
  emit: (event, payload) => events.push({ event, payload }),
});

describe('普攻集氣（2026-07 定案：坦/輔 15、輸出 25、坦受擊 +5、輔隊友 +3）', () => {
  it('輸出普攻自身 +25、被擊坦克 +5、隊友輔助 +3', () => {
    const dps = makeUnit({ team: 0, pos: 1, class: 'dps' });
    const support = makeUnit({ team: 0, pos: 5, class: 'support' });
    const foeTank = makeUnit({ team: 1, pos: 1, class: 'tank', hp: 99999 });
    normalAttack(dps, ctxFor(dps, [dps, support], [foeTank]));
    expect(dps.energy).toBe(25);
    expect(support.energy).toBe(3);
    expect(foeTank.energy).toBe(5);
  });
});

describe('skillFor 歸屬', () => {
  it('無 cardId → 退回職業大招', () => {
    expect(skillFor(makeUnit({ class: 'dps' }))).toBe('burst');
    expect(skillFor(makeUnit({ class: 'tank' }))).toBe('guard');
    expect(skillFor(makeUnit({ class: 'support' }))).toBe('heal');
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

describe('每卡專屬技', () => {
  it('每張卡的專屬技都存在於 SKILLS', () => {
    const ids = Object.values(CARD_SKILLS);
    expect(Object.keys(CARD_SKILLS).length).toBe(Object.keys(CARDS).length); // 每張卡都有專屬技
    for (const id of ids) expect(SKILLS[id]).toBeTruthy();
  });

  it('shadowExecute（nightreaper）：目標受傷 + 被 stun', () => {
    const caster = makeUnit({ team: 0, pos: 1, cardId: 'nightreaper', atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    const ctx = ctxFor(caster, [caster], [foe]);
    castSkill(caster, skillFor(caster), ctx);
    expect(foe.hp).toBeLessThan(99999);
    expect(hasControl(foe, 'stun')).toBe(true);
  });

  it('tidalPrison（tidecaller）：直排目標受傷 + 被凍結（水屬專屬狀態）', () => {
    const caster = makeUnit({ team: 0, pos: 1, cardId: 'tidecaller', atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    const ctx = ctxFor(caster, [caster], [foe]);
    castSkill(caster, skillFor(caster), ctx);
    expect(foe.hp).toBeLessThan(99999);
    expect(hasControl(foe, 'freeze')).toBe(true);
  });

  it('windsong（galewind）：全隊 energyGain buff + 回血', () => {
    const caster = makeUnit({ team: 0, pos: 1, cardId: 'galewind', atk: 100 });
    const ally = makeUnit({ team: 0, pos: 2, hp: 1000 });
    ally.hp = 500;
    const ctx = ctxFor(caster, [caster, ally], []);
    castSkill(caster, skillFor(caster), ctx);
    expect(ally.buffs.some((b) => b.stat === 'energyGain')).toBe(true);
    expect(ally.hp).toBeGreaterThan(500);
  });
});
