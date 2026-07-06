// 傷害門檻命中模型：
//   對敵技能的傷害是否命中，決定其後續所有敵對效果是否落實。
//   命中即全套落實、閃避即全套落空；對我方/自身永遠 100%；weather/terrain 全場照常。
import { describe, it, expect } from 'vitest';
import { castSkill } from './skills.js';
import { makeUnit } from './testHelpers.js';
import { applyBuff } from './buffs.js';
import { Rng } from '../core/rng.js';

const ctxFor = (caster, allies, enemies) => ({ allies, enemies, rng: new Rng(1), emit: () => {} });
const dodgeBuff = (v) => ({ kind: 'stat', stat: 'dodge', op: 'add', value: v, duration: 2 });

describe('純減益對敵技補傷害段', () => {
  it('雷紋：對敵全體造成 80% 傷害 + 受傷提升', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    const before = foe.hp;
    castSkill(caster, 'thunderMark', ctxFor(caster, [caster], [foe]));
    expect(foe.hp).toBeLessThan(before); // 已有傷害段
    expect(foe.buffs.some((b) => b.stat === 'dmgTaken')).toBe(true);
  });

  it('嫁禍：對單體造成 150% 傷害 + 中毒', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    const before = foe.hp;
    castSkill(caster, 'blameShift', ctxFor(caster, [caster], [foe]));
    expect(foe.hp).toBeLessThanOrEqual(before - Math.round(caster.effAtk * 1.5));
    expect(foe.buffs.some((b) => b.kind === 'dot')).toBe(true);
  });

  it('熔壁：對敵前排造成 120% 傷害 + 受持續傷害提升', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    const before = foe.hp;
    castSkill(caster, 'moltenBulwark', ctxFor(caster, [caster], [foe]));
    expect(foe.hp).toBeLessThan(before); // 已有傷害段
    expect(foe.buffs.some((b) => b.stat === 'dotTaken')).toBe(true);
  });
});

describe('傷害門檻：命中決定後續', () => {
  it('閃掉傷害 → 後續減益全部落空', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    applyBuff(foe, dodgeBuff(1.0)); // 必閃
    castSkill(caster, 'thunderMark', ctxFor(caster, [caster], [foe]));
    expect(foe.buffs.some((b) => b.stat === 'dmgTaken')).toBe(false);
  });

  it('打中 → 後續減益落實', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 }); // dodge 0 → 必中
    castSkill(caster, 'thunderMark', ctxFor(caster, [caster], [foe]));
    expect(foe.buffs.some((b) => b.stat === 'dmgTaken')).toBe(true);
  });

  it('多目標：只閃的那個沒吃減益，被打中的照吃', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const dodger = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    const hit = makeUnit({ team: 1, pos: 2, hp: 99999, def: 0 });
    applyBuff(dodger, dodgeBuff(1.0));
    castSkill(caster, 'thunderMark', ctxFor(caster, [caster], [dodger, hit]));
    expect(dodger.buffs.some((b) => b.stat === 'dmgTaken')).toBe(false);
    expect(hit.buffs.some((b) => b.stat === 'dmgTaken')).toBe(true);
  });

  it('對我方效果不受門檻：閃避拉滿的隊友照吃增益', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const ally = makeUnit({ team: 0, pos: 2, hp: 1000 });
    applyBuff(ally, dodgeBuff(1.0));
    castSkill(caster, 'windsong', ctxFor(caster, [caster, ally], []));
    expect(ally.buffs.some((b) => b.stat === 'energyGain')).toBe(true);
  });

  it('energySteal 受門檻：閃掉就不奪能', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    foe.energy = 80;
    applyBuff(foe, dodgeBuff(1.0));
    castSkill(caster, 'energyLeech', ctxFor(caster, [caster], [foe]));
    expect(foe.energy).toBe(80);
  });
});
