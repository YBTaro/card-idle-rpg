// src/battle/unit.test.js
import { describe, it, expect } from 'vitest';
import { applyBuff } from './buffs.js';
import { makeUnit } from './testHelpers.js';

describe('Unit 有效值 / 護盾 / 集氣速度', () => {
  it('atk buff 提升 effAtk；無 buff 時等於 atk', () => {
    const u = makeUnit({ atk: 100 });
    expect(u.effAtk).toBe(100);
    applyBuff(u, { kind: 'stat', stat: 'atk', op: 'mul', value: 1.5 });
    expect(u.effAtk).toBe(150);
  });

  it('critChance 夾在 0..1；dmgTakenMult 相乘', () => {
    const u = makeUnit();
    expect(u.critChance).toBeCloseTo(0.1);
    applyBuff(u, { kind: 'stat', stat: 'critChance', op: 'add', value: 5 });
    expect(u.critChance).toBe(1); // 夾上限
    applyBuff(u, { kind: 'stat', stat: 'dmgTaken', op: 'mul', value: 0.5 });
    expect(u.dmgTakenMult).toBe(0.5);
  });

  it('energyGainMult 放大集氣', () => {
    const u = makeUnit();
    applyBuff(u, { kind: 'stat', stat: 'energyGain', op: 'mul', value: 1.5 });
    u.gainEnergy(20);
    expect(u.energy).toBe(30); // round(20*1.5)
  });

  it('護盾先吸收再扣血', () => {
    const u = makeUnit({ hp: 100 });
    applyBuff(u, { kind: 'shield', amount: 30 });
    const dealt = u.takeDamage(50);
    expect(dealt).toBe(20); // 30 被護盾吸收，20 扣血
    expect(u.hp).toBe(80);
  });
});
