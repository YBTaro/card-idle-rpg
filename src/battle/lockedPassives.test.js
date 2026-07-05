// 進場鎖定被動（隊伍技 / 星級里程碑）vs 活體光環：
//   隊伍技（alliesAtLeast）：進場判定一次、整場有效——條件成員或持有者死亡都不影響
//   星級里程碑（star:true）：同上
//   光環被動：持有者死亡即消失（既有行為）
import { describe, it, expect } from 'vitest';
import { makeUnit } from './testHelpers.js';
import { recomputePassives } from './passives.js';

describe('進場鎖定：隊伍技', () => {
  it('條件成員死亡後隊伍技仍生效', () => {
    const knight = makeUnit({
      team: 0, pos: 1, def: 100, series: ['霜語'],
      passives: [{ when: { alliesAtLeast: { count: 2, where: { series: '霜語' } } }, target: 'allAllies', effects: [{ stat: 'def', op: 'mul', value: 1.2 }] }],
    });
    const mate = makeUnit({ team: 0, pos: 2, def: 100, series: ['霜語'] });
    const foe = makeUnit({ team: 1, pos: 1 });
    const teams = [[knight, mate], [foe]];
    recomputePassives(teams); // 開場：霜語×2 → 條件成立、鎖定
    expect(knight.effDef).toBe(120);
    mate.hp = 0; // 條件成員陣亡
    recomputePassives(teams);
    expect(knight.effDef).toBe(120); // 進場鎖定：不因隊友死亡失效
  });

  it('持有者死亡後隊伍技仍照拂存活隊友；光環被動則消失', () => {
    const teamSkiller = makeUnit({
      team: 0, pos: 1, series: ['鐵壁'],
      passives: [{ when: { alliesAtLeast: { count: 2, where: { series: '鐵壁' } } }, target: 'allAllies', effects: [{ stat: 'def', op: 'mul', value: 1.2 }] }],
    });
    const auraGuy = makeUnit({
      team: 0, pos: 2, series: ['鐵壁'],
      passives: [{ target: 'allAllies', effects: [{ stat: 'atk', op: 'mul', value: 1.1 }] }], // 光環被動
    });
    const mate = makeUnit({ team: 0, pos: 3, def: 100, atk: 100, series: ['鐵壁'] });
    const foe = makeUnit({ team: 1, pos: 1 });
    const teams = [[teamSkiller, auraGuy, mate], [foe]];
    recomputePassives(teams);
    expect(mate.effDef).toBe(120); // 隊伍技生效
    expect(mate.effAtk).toBe(110); // 光環生效
    teamSkiller.hp = 0;
    auraGuy.hp = 0;
    recomputePassives(teams);
    expect(mate.effDef).toBe(120); // 隊伍技：持有者死亡仍在
    expect(mate.effAtk).toBe(100); // 光環：人死光環滅
  });

  it('開場條件不成立 → 整場都不成立（不會中途湊齊觸發）', () => {
    const knight = makeUnit({
      team: 0, pos: 1, def: 100, series: ['霜語'],
      passives: [{ when: { alliesAtLeast: { count: 2, where: { series: '霜語' } } }, target: 'allAllies', effects: [{ stat: 'def', op: 'mul', value: 1.2 }] }],
    });
    const mate = makeUnit({ team: 0, pos: 2, series: ['潮汐'] }); // 非霜語
    const foe = makeUnit({ team: 1, pos: 1 });
    const teams = [[knight, mate], [foe]];
    recomputePassives(teams); // 開場判定：不成立 → 鎖定為否
    expect(knight.effDef).toBe(100);
    mate.series.push('霜語'); // 就算中途「湊齊」（理論情境）
    recomputePassives(teams);
    expect(knight.effDef).toBe(100); // 鎖定不重驗
  });
});

describe('進場鎖定：星級里程碑', () => {
  it('star:true 被動在持有者死亡後仍保留（復活即恢復效果）', () => {
    const hero = makeUnit({
      team: 0, pos: 1, atk: 100,
      passives: [{ target: 'self', effects: [{ stat: 'dmgDealt', op: 'mul', value: 1.05 }], star: true }],
    });
    const foe = makeUnit({ team: 1, pos: 1 });
    const teams = [[hero], [foe]];
    recomputePassives(teams);
    expect(hero.dmgDealtMult).toBeCloseTo(1.05);
    hero.hp = 0;
    recomputePassives(teams); // 死亡：self 目標收不到（死人不掛buff），但鎖定不失效
    hero.hp = 500; // 復活
    recomputePassives(teams);
    expect(hero.dmgDealtMult).toBeCloseTo(1.05); // 復活後里程碑立即恢復
  });
});
