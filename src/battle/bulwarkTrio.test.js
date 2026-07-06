// 壁壘三卡改版：DEF 基準傷害 / 無屬性 / 多門檻血線觸發 / 普攻掛載盾襲。
import { describe, it, expect } from 'vitest';
import { computeDamage, DAMAGE_GLOBAL } from './damage.js';
import { castSkill, normalAttack } from './skills.js';
import { makeUnit } from './testHelpers.js';
import { BattleEngine } from './engine.js';
import { CARDS } from '../data/cards.js';
import { Rng } from '../core/rng.js';

const ctxFor = (caster, allies, enemies) => ({ allies, enemies, rng: new Rng(1), emit: () => {} });

describe('DEF 基準 + 無屬性傷害', () => {
  it('basis:selfDef → 以施放者防禦力計傷', () => {
    const atk = makeUnit({ atk: 50, def: 100 });
    const def = makeUnit({ def: 0, element: 'fire' });
    const r = computeDamage(atk, def, 1.0, null, { basis: 'selfDef', ignoreDef: true, noElement: true });
    expect(r.amount).toBe(Math.round(atk.effDef * DAMAGE_GLOBAL)); // 防禦×全域係數
  });

  it('noElement → 跳過屬性相剋（fire vs wind 不再 ×1.5）', () => {
    const fire = makeUnit({ atk: 100, element: 'fire' });
    const wind = makeUnit({ def: 0, element: 'wind' });
    const withElem = computeDamage(fire, wind, 1.0, null, { ignoreDef: true });
    const noElem = computeDamage(fire, wind, 1.0, null, { ignoreDef: true, noElement: true });
    expect(noElem.amount).toBe(Math.round(fire.effAtk * DAMAGE_GLOBAL));
    expect(withElem.amount).toBeGreaterThan(noElem.amount); // 有屬性時 fire 剋 wind ×1.5
  });
});

describe('龍鱗壁（主動）：按敵方最大生命 20% 打敵前排', () => {
  it('定額扣目標最大生命 20%（不受高防影響）', () => {
    const caster = makeUnit({ team: 0, pos: 1, def: 200, class: 'tank' });
    const foe = makeUnit({ team: 1, pos: 1, hp: 5000, def: 500 });
    const before = foe.hp;
    castSkill(caster, 'wyrmBulwark', ctxFor(caster, [caster], [foe]));
    expect(before - foe.hp).toBe(Math.round(foe.maxHp * 0.2)); // 定額 20% 最大生命
  });
});

describe('多門檻血線觸發（pcts）', () => {
  const trig = [{ name: 't', on: 'hpBelow', pcts: [0.75, 0.5, 0.25], who: 'self', effects: [{ type: 'energy', amount: 10, scope: 'self' }] }];

  it('跌破 75/50/25 各觸發一次，同門檻不重觸', () => {
    const tank = makeUnit({ team: 0, pos: 1, triggers: trig });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999 });
    const engine = new BattleEngine([tank], [foe], { rng: new Rng(1) });
    tank.energy = 0;
    engine._fireTriggers('hpBelow', tank, { before: 1.0, after: 0.7 }); // 破 75
    expect(tank.energy).toBe(10);
    engine._fireTriggers('hpBelow', tank, { before: 0.7, after: 0.4 }); // 破 50
    expect(tank.energy).toBe(20);
    engine._fireTriggers('hpBelow', tank, { before: 0.8, after: 0.7 }); // 75 已觸發過 → 不重觸
    expect(tank.energy).toBe(20);
    engine._fireTriggers('hpBelow', tank, { before: 0.3, after: 0.2 }); // 破 25
    expect(tank.energy).toBe(30);
  });

  it('一擊跨多門檻 → 各觸發一次', () => {
    const tank = makeUnit({ team: 0, pos: 1, triggers: trig });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999 });
    const engine = new BattleEngine([tank], [foe], { rng: new Rng(1) });
    tank.energy = 0;
    engine._fireTriggers('hpBelow', tank, { before: 0.8, after: 0.2 }); // 一次跨 75/50/25
    expect(tank.energy).toBe(30);
  });
});

describe('龍晶壁壘被動資料：DEF 200% 無視防禦無屬性 + 吸血 30%', () => {
  it('跌破門檻 → 敵全體吃 DEF 傷、自身吸血回血', () => {
    const tank = makeUnit({ team: 0, pos: 1, def: 200, hp: 1000, triggers: CARDS.drakebastion.triggers });
    tank.hp = 700;
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 500 });
    const engine = new BattleEngine([tank], [foe], { rng: new Rng(1) });
    const foeBefore = foe.hp; const tankBefore = tank.hp;
    engine._fireTriggers('hpBelow', tank, { before: 1.0, after: 0.7 });
    expect(foe.hp).toBeLessThan(foeBefore);       // 全體吃 DEF 傷
    expect(tank.hp).toBeGreaterThan(tankBefore);  // 吸血 30%
  });
});

describe('貝盾（盾襲 atkRider）', () => {
  it('坦克獲盾襲，普攻額外扣目標最大生命 10%（無視防禦）', () => {
    const caster = makeUnit({ team: 0, pos: 5, class: 'support' });
    const tank = makeUnit({ team: 0, pos: 1, class: 'tank' });
    const foe = makeUnit({ team: 1, pos: 1, hp: 1000, def: 99999 }); // 高防：普攻本體趨近 0，凸顯 %HP 盾襲
    castSkill(caster, 'pearlBulwark', ctxFor(caster, [caster, tank], [foe]));
    expect(tank.buffs.some((b) => b.kind === 'atkRider')).toBe(true);
    const before = foe.hp;
    normalAttack(tank, ctxFor(tank, [tank, caster], [foe]));
    expect(before - foe.hp).toBeGreaterThanOrEqual(Math.round(foe.maxHp * 0.1));
  });

  it('坦克10% / 機械坦克20% / 機械非坦克與其他職業皆無', () => {
    const caster = makeUnit({ team: 0, pos: 5, class: 'support' });
    const tank = makeUnit({ team: 0, pos: 1, class: 'tank', race: '人' });      // 一般坦 → 10%
    const mtank = makeUnit({ team: 0, pos: 2, class: 'tank', race: '機械' });    // 機械坦 → 20%
    const mdps = makeUnit({ team: 0, pos: 3, class: 'dps', race: '機械' });      // 機械輸出 → 無
    const dps = makeUnit({ team: 0, pos: 4, class: 'dps', race: '人' });         // 一般輸出 → 無
    castSkill(caster, 'pearlBulwark', ctxFor(caster, [caster, tank, mtank, mdps, dps], []));
    expect(tank.buffs.find((b) => b.kind === 'atkRider').pctMaxHp).toBe(0.1);
    expect(mtank.buffs.find((b) => b.kind === 'atkRider').pctMaxHp).toBe(0.2); // 20% 蓋過 10%，不疊加
    expect((mdps.buffs ?? []).some((b) => b.kind === 'atkRider')).toBe(false); // 機械但非坦 → 無
    expect((dps.buffs ?? []).some((b) => b.kind === 'atkRider')).toBe(false);
  });
});
