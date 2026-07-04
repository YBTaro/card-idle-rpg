// 能量超充 + 竊能：
//   能量池上限 200（施放門檻仍 100）；施放瞬間 energy/100 ＝直傷倍率，之後歸零。
//   超充只放大 damage 直傷——DoT/治療/護盾/狀態不吃。
//   竊能（energySteal）：奪走目標當前全部能量 → 轉給我方能量最低的存活隊友。
import { describe, it, expect } from 'vitest';
import { makeUnit } from './testHelpers.js';
import { castSkill } from './skills.js';
import { applyEffect } from './effects.js';
import { BattleEngine } from './engine.js';
import { ENERGY_MAX, ENERGY_CAP } from './unit.js';
import { SELECTORS } from './targeting.js';
import { Rng } from '../core/rng.js';

const ctxFor = (caster, allies, enemies, seed = 7) => ({
  allies, enemies, rng: new Rng(seed),
  emit: () => {},
});

describe('能量超充', () => {
  it('gainEnergy 溢出保留：90 + 25 → 115；上限 200', () => {
    const u = makeUnit();
    u.energy = 90;
    u.gainEnergy(25);
    expect(u.energy).toBe(115); // 不再夾在 100
    u.gainEnergy(999);
    expect(u.energy).toBe(ENERGY_CAP);
  });

  it('超充只放大直傷：同 seed 下 2.0 超充＝兩倍傷害', () => {
    const mk = () => {
      const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
      const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
      return [caster, foe];
    };
    const [c1, f1] = mk();
    castSkill(c1, 'burst', ctxFor(c1, [c1], [f1]), { overcharge: 1 });
    const [c2, f2] = mk();
    castSkill(c2, 'burst', ctxFor(c2, [c2], [f2]), { overcharge: 2 });
    const d1 = 99999 - f1.hp;
    const d2 = 99999 - f2.hp;
    expect(Math.abs(d2 - d1 * 2)).toBeLessThanOrEqual(1); // 同 seed → 兩倍（容許四捨五入差 1）
  });

  it('DoT 每跳傷害不吃超充', () => {
    const mk = (overcharge) => {
      const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
      const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
      castSkill(caster, 'karmicFire', ctxFor(caster, [caster], [foe]), { overcharge });
      return foe.buffs.find((b) => b.kind === 'dot')?.damage;
    };
    expect(mk(2)).toBe(mk(1)); // 每跳值相同——超充不外漏到狀態
  });

  it('引擎整合：溢出能量施放 → ultimate 事件帶超充倍率、能量歸零', () => {
    const me = makeUnit({ team: 0, pos: 1, class: 'dps', atk: 100 });
    me.energy = 115;
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    const engine = new BattleEngine([me], [foe], { rng: new Rng(1) });
    let over = null;
    engine.on('ultimate', ({ overcharge }) => (over = overcharge));
    engine.step(); // 普攻（+25 → 140）
    engine.step(); // 技能階段：以 140 能量施放
    expect(over).toBeCloseTo(1.4);
    expect(me.energy).toBe(0);
  });
});

describe('竊能（energySteal）', () => {
  it('highestEnergyEnemy 選能量最高者', () => {
    const caster = makeUnit({ team: 0, pos: 1 });
    const a = makeUnit({ team: 1, pos: 1, energy: 40 });
    const b = makeUnit({ team: 1, pos: 2, energy: 80 });
    const picked = SELECTORS.highestEnergyEnemy(caster, { enemies: [a, b] });
    expect(picked).toEqual([b]);
  });

  it('奪走目標全部能量 → 轉給我方能量最低者（可疊出超充）', () => {
    const caster = makeUnit({ team: 0, pos: 1, energy: 50 });
    const ally = makeUnit({ team: 0, pos: 2, energy: 90 });
    const foe = makeUnit({ team: 1, pos: 1, energy: 80 });
    const ctx = ctxFor(caster, [caster, ally], [foe]);
    applyEffect({ type: 'energySteal', scope: 'target' }, caster, [foe], ctx, 'energyLeech');
    expect(foe.energy).toBe(0); // 被榨乾
    expect(caster.energy).toBe(130); // 最低者（50）收下 80 → 超過 100＝下次超充
    expect(ally.energy).toBe(90); // 不是最低者，不動
  });

  it('目標 0 能量：無事發生（不發 steal）', () => {
    const caster = makeUnit({ team: 0, pos: 1, energy: 10 });
    const foe = makeUnit({ team: 1, pos: 1, energy: 0 });
    let stole = false;
    const ctx = { ...ctxFor(caster, [caster], [foe]), emit: (e) => { if (e === 'steal') stole = true; } };
    applyEffect({ type: 'energySteal', scope: 'target' }, caster, [foe], ctx, 'energyLeech');
    expect(stole).toBe(false);
    expect(caster.energy).toBe(10);
  });
});
