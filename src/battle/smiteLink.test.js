// 天罰之鋒改版：直排傷害 + 集氣-15% + 吸能印（energyLink）；神鋒審判者隊伍技。
import { describe, it, expect } from 'vitest';
import { castSkill } from './skills.js';
import { makeUnit } from './testHelpers.js';
import { applyBuff } from './buffs.js';
import { recomputePassives } from './passives.js';
import { BattleEngine } from './engine.js';
import { CARDS } from '../data/cards.js';
import { Rng } from '../core/rng.js';

const ctxFor = (c, a, e) => ({ allies: a, enemies: e, rng: new Rng(1), emit: () => {} });

describe('天罰之鋒 + 吸能印', () => {
  it('施放：直排傷害 + 集氣 -15% + 吸能印（記住施放者）', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    const before = foe.hp;
    castSkill(caster, 'smite', ctxFor(caster, [caster], [foe]));
    expect(foe.hp).toBeLessThan(before);
    expect(foe.buffs.some((b) => b.stat === 'energyGain' && b.value === 0.85)).toBe(true);
    expect(foe.buffs.find((b) => b.kind === 'energyLink')?.src).toBe(caster);
  });

  it('吸能印：被印目標回能→施放者 +5；能量減少（施放歸零）不觸發', () => {
    const caster = makeUnit({ team: 0, pos: 1 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999 });
    const engine = new BattleEngine([caster], [foe], { rng: new Rng(1) });
    applyBuff(foe, { kind: 'energyLink', amount: 5, duration: 2, src: caster });
    caster.energy = 0; foe.energy = 0; foe._prevEnergy = 0;
    foe.gainEnergy(20); engine.emit('energy', { unit: foe, value: foe.energy });
    expect(caster.energy).toBe(5);
    foe.gainEnergy(10); engine.emit('energy', { unit: foe, value: foe.energy });
    expect(caster.energy).toBe(10);
    foe.energy = 0; engine.emit('energy', { unit: foe, value: 0 }); // 減少：不觸發
    expect(caster.energy).toBe(10);
  });
});

describe('神鋒審判者 隊伍技（神族 ≥3 → 神族減傷 20%）', () => {
  it('湊滿 3 神族：神族吃減傷、非神族不吃', () => {
    const blade = makeUnit({ team: 0, pos: 1, race: '神', passives: CARDS.godblade.passives });
    const god2 = makeUnit({ team: 0, pos: 2, race: '神' });
    const god3 = makeUnit({ team: 0, pos: 3, race: '神' });
    const human = makeUnit({ team: 0, pos: 4, race: '人' });
    const teams = [[blade, god2, god3, human], [makeUnit({ team: 1, pos: 1 })]];
    recomputePassives(teams);
    expect(god2.dmgTakenMult).toBe(0.8);
    expect(human.dmgTakenMult).toBe(1);
  });

  it('神族僅 2 名：不生效', () => {
    const blade = makeUnit({ team: 0, pos: 1, race: '神', passives: CARDS.godblade.passives });
    const god2 = makeUnit({ team: 0, pos: 2, race: '神' });
    const human = makeUnit({ team: 0, pos: 3, race: '人' });
    const teams = [[blade, god2, human], [makeUnit({ team: 1, pos: 1 })]];
    recomputePassives(teams);
    expect(god2.dmgTakenMult).toBe(1);
  });
});
