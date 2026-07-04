import { describe, it, expect } from 'vitest';
import { recomputePassives } from './passives.js';
import { makeUnit } from './testHelpers.js';

describe('recomputePassives', () => {
  it('靜態光環：全隊 +10% def', () => {
    const tank = makeUnit({ team: 0, pos: 1, def: 100, passives: [{ target: 'allAllies', effects: [{ stat: 'def', op: 'mul', value: 1.1 }] }] });
    const ally = makeUnit({ team: 0, pos: 2, def: 100 });
    const foe = makeUnit({ team: 1, pos: 1, def: 100 });
    recomputePassives([[tank, ally], [foe]]);
    expect(ally.effDef).toBe(110);
    expect(tank.effDef).toBe(110);
    expect(foe.effDef).toBe(100);
  });

  it('條件 selfHpBelow', () => {
    const dps = makeUnit({ team: 0, pos: 1, atk: 100, hp: 1000, passives: [{ when: { selfHpBelow: 0.5 }, target: 'self', effects: [{ stat: 'atk', op: 'mul', value: 1.3 }] }] });
    const foe = makeUnit({ team: 1, pos: 1 });
    recomputePassives([[dps], [foe]]);
    expect(dps.effAtk).toBe(100); // 滿血無效
    dps.hp = 400;
    recomputePassives([[dps], [foe]]);
    expect(dps.effAtk).toBe(130);
  });

  it('數量縮放：每不死隊友 +5% atk', () => {
    const p = [{ target: 'self', effects: [{ stat: 'atk', op: 'mul', basePct: 0.05, perCountOf: { side: 'allies', where: { race: '不死' } } }] }];
    const a = makeUnit({ team: 0, pos: 1, atk: 100, race: '不死', passives: p });
    const b = makeUnit({ team: 0, pos: 2, race: '不死' });
    const c = makeUnit({ team: 0, pos: 3, race: '人' });
    const foe = makeUnit({ team: 1, pos: 1 });
    recomputePassives([[a, b, c], [foe]]);
    expect(a.effAtk).toBe(110); // 2 不死 → 1+0.05*2=1.1
  });

  it('條件 alliesAtLeast：符合數達標才生效', () => {
    const p = [{ when: { alliesAtLeast: { count: 2, where: { race: '龍' } } }, target: 'self', effects: [{ stat: 'atk', op: 'mul', value: 1.5 }] }];
    const owner = makeUnit({ team: 0, pos: 1, atk: 100, race: '龍', passives: p });
    const dragon2 = makeUnit({ team: 0, pos: 2, race: '龍' });
    const human = makeUnit({ team: 0, pos: 3, race: '人' });
    const foe = makeUnit({ team: 1, pos: 1 });
    // 只有 1 條龍(owner) → 未達 2 → 無效
    recomputePassives([[owner, human], [foe]]);
    expect(owner.effAtk).toBe(100);
    // 2 條龍(owner + dragon2) → 達標 → +50%
    recomputePassives([[owner, dragon2, human], [foe]]);
    expect(owner.effAtk).toBe(150);
  });

  it('targetWhere：光環只作用於符合條件的隊友（種族主題光環）', () => {
    const p = [{ target: 'allAllies', targetWhere: { race: '不死' }, effects: [{ stat: 'def', op: 'mul', value: 1.2 }] }];
    const owner = makeUnit({ team: 0, pos: 1, def: 100, race: '不死', passives: p });
    const undead = makeUnit({ team: 0, pos: 2, def: 100, race: '不死' });
    const human = makeUnit({ team: 0, pos: 3, def: 100, race: '人' });
    const foe = makeUnit({ team: 1, pos: 1, def: 100, race: '不死' });
    recomputePassives([[owner, undead, human], [foe]]);
    expect(owner.effDef).toBe(120); // 自己也是不死 → 吃到
    expect(undead.effDef).toBe(120);
    expect(human.effDef).toBe(100); // 人族不吃
    expect(foe.effDef).toBe(100); // 敵方不死不吃（allAllies 範圍）
  });

  it('targetWhere：屬性主題光環（element）', () => {
    const p = [{ target: 'allAllies', targetWhere: { element: 'water' }, effects: [{ stat: 'atk', op: 'mul', value: 1.1 }] }];
    const owner = makeUnit({ team: 0, pos: 1, atk: 100, element: 'light', passives: p });
    const water = makeUnit({ team: 0, pos: 2, atk: 100, element: 'water' });
    const foe = makeUnit({ team: 1, pos: 1 });
    recomputePassives([[owner, water], [foe]]);
    expect(water.effAtk).toBeCloseTo(110);
    expect(owner.effAtk).toBe(100); // 光屬施放者自己不符條件
  });

  it('重算不累積、非光環 buff 保留', () => {
    const tank = makeUnit({ team: 0, pos: 1, def: 100, passives: [{ target: 'self', effects: [{ stat: 'def', op: 'mul', value: 1.2 }] }] });
    const foe = makeUnit({ team: 1, pos: 1 });
    tank.buffs = [{ kind: 'stat', stat: 'atk', op: 'add', value: 5 }];
    recomputePassives([[tank], [foe]]);
    recomputePassives([[tank], [foe]]);
    expect(tank.effDef).toBe(120); // 不疊加
    expect(tank.buffs.some((b) => b.stat === 'atk' && !b.aura)).toBe(true);
  });
});
