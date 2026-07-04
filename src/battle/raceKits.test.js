// 種族特色套件：
//   不死＝亡者之勢（數陣亡隊友的被動）＋亡軍號令（不死限定 buff）
//   精靈＝靈巧（森靈頌：迴避＋集氣，精靈限定）
//   妖＝汲取（血宴：嘲諷＋吸血）    獸＝狂暴（狂怒撕裂：自身攻擊可疊層）
import { describe, it, expect } from 'vitest';
import { makeUnit } from './testHelpers.js';
import { castSkill } from './skills.js';
import { recomputePassives } from './passives.js';
import { Rng } from '../core/rng.js';

const ctxFor = (caster, allies, enemies) => ({
  allies, enemies, rng: new Rng(3),
  emit: () => {},
});

describe('種族號令（種族限定 buff）', () => {
  it('亡軍號令：只有不死隊友吃到攻buff與充能', () => {
    const caster = makeUnit({ team: 0, pos: 1, cardId: 'bonemarshal', race: '不死', atk: 100 });
    const undead = makeUnit({ team: 0, pos: 2, race: '不死' });
    const human = makeUnit({ team: 0, pos: 3, race: '人' });
    castSkill(caster, 'deathLegion', ctxFor(caster, [caster, undead, human], []));
    expect(undead.buffs.some((b) => b.stat === 'atk')).toBe(true);
    expect(undead.energy).toBe(10);
    expect(human.buffs ?? []).toHaveLength(0); // 人族不吃不死號令
    expect(human.energy).toBe(0);
  });

  it('森靈頌：精靈獲得迴避＋集氣，非精靈不吃', () => {
    const caster = makeUnit({ team: 0, pos: 1, race: '精靈' });
    const elf = makeUnit({ team: 0, pos: 2, race: '精靈' });
    const beast = makeUnit({ team: 0, pos: 3, race: '獸' });
    castSkill(caster, 'sylvanHymn', ctxFor(caster, [caster, elf, beast], []));
    expect(elf.dodge).toBeCloseTo(0.15);
    expect(elf.energyGainMult).toBeCloseTo(1.2);
    expect(beast.dodge).toBe(0);
  });
});

describe('妖坦與獸輸出（種族補位）', () => {
  it('血宴：自身嘲諷 + 前排吸血', () => {
    const caster = makeUnit({ team: 0, pos: 1, race: '妖', atk: 100, hp: 1000 });
    caster.hp = 400;
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    castSkill(caster, 'bloodFeast', ctxFor(caster, [caster], [foe]));
    expect(caster.buffs.some((b) => b.control === 'taunt')).toBe(true);
    expect(foe.hp).toBeLessThan(99999);
    expect(caster.hp).toBeGreaterThan(400); // 吸血回填
  });

  it('狂怒撕裂：自身攻buff 可疊層（兩次施放＝兩層相乘）', () => {
    const caster = makeUnit({ team: 0, pos: 1, race: '獸', atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    const ctx = ctxFor(caster, [caster], [foe]);
    castSkill(caster, 'rageRend', ctx);
    expect(caster.effAtk).toBe(115);
    castSkill(caster, 'rageRend', ctx);
    expect(caster.effAtk).toBe(Math.round(100 * 1.15 * 1.15)); // 疊層＝乘算
  });
});

describe('亡者之勢（perCountOf dead）', () => {
  it('每名陣亡隊友 +12% 攻擊；復活（存活）後不再計入', () => {
    const marshal = makeUnit({
      team: 0, pos: 1, atk: 100, race: '不死',
      passives: [{ target: 'self', effects: [{ stat: 'atk', op: 'mul', basePct: 0.12, perCountOf: { side: 'allies', dead: true } }] }],
    });
    const a = makeUnit({ team: 0, pos: 2 });
    const b = makeUnit({ team: 0, pos: 3 });
    const foe = makeUnit({ team: 1, pos: 1 });
    const teams = [[marshal, a, b], [foe]];
    recomputePassives(teams);
    expect(marshal.effAtk).toBe(100); // 沒人倒下＝無加成
    a.hp = 0;
    recomputePassives(teams);
    expect(marshal.effAtk).toBe(112);
    b.hp = 0;
    recomputePassives(teams);
    expect(marshal.effAtk).toBe(124); // 1 + 0.12×2
    a.hp = 500; // 復活回存活
    recomputePassives(teams);
    expect(marshal.effAtk).toBe(112);
  });
});
