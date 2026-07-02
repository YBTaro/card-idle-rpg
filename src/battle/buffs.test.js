import { describe, it, expect } from 'vitest';
import { applyBuff, tickBuffs, resolve, absorbWithShields, dotEntries } from './buffs.js';
import { hasControl } from './buffs.js';
import { clearAuras } from './buffs.js';

const u = () => ({ buffs: [] });

describe('buffs', () => {
  it('resolve：mul 相乘、add 相加', () => {
    const unit = u();
    applyBuff(unit, { kind: 'stat', stat: 'atk', op: 'mul', value: 1.5 });
    applyBuff(unit, { kind: 'stat', stat: 'atk', op: 'add', value: 10 });
    expect(resolve(unit, 'atk', 100)).toBe(160); // 100*1.5 + 10
    expect(resolve(unit, 'def', 50)).toBe(50); // 無相符 buff
  });

  it('applyBuff：同 key 非 stackable 取代刷新', () => {
    const unit = u();
    applyBuff(unit, { kind: 'stat', stat: 'atk', op: 'mul', value: 1.2, key: 'k', duration: 1 });
    applyBuff(unit, { kind: 'stat', stat: 'atk', op: 'mul', value: 1.5, key: 'k', duration: 3 });
    expect(unit.buffs.length).toBe(1);
    expect(unit.buffs[0].value).toBe(1.5);
  });

  it('applyBuff：stackable 併存', () => {
    const unit = u();
    applyBuff(unit, { kind: 'stat', stat: 'atk', op: 'add', value: 5, key: 'k', stackable: true });
    applyBuff(unit, { kind: 'stat', stat: 'atk', op: 'add', value: 5, key: 'k', stackable: true });
    expect(unit.buffs.length).toBe(2);
    expect(resolve(unit, 'atk', 0)).toBe(10);
  });

  it('tickBuffs：duration 用完移除；permanent 保留', () => {
    const unit = u();
    applyBuff(unit, { kind: 'stat', stat: 'atk', op: 'add', value: 5, duration: 1 });
    applyBuff(unit, { kind: 'stat', stat: 'def', op: 'add', value: 5 }); // 無 duration
    expect(tickBuffs(unit)).toBe(true);
    expect(unit.buffs.length).toBe(1);
    expect(unit.buffs[0].stat).toBe('def');
  });

  it('absorbWithShields：先扣護盾再回傳剩餘', () => {
    const unit = u();
    applyBuff(unit, { kind: 'shield', amount: 30 });
    expect(absorbWithShields(unit, 10)).toBe(0); // 30 護盾吸收 10
    expect(unit.buffs[0].amount).toBe(20);
    expect(absorbWithShields(unit, 50)).toBe(30); // 剩 20 護盾吸收，20 耗盡移除，剩 30 到 hp
    expect(unit.buffs.length).toBe(0);
  });

  it('dotEntries：只回傳 dot', () => {
    const unit = u();
    applyBuff(unit, { kind: 'stat', stat: 'atk', op: 'add', value: 1 });
    applyBuff(unit, { kind: 'dot', damage: 20, duration: 3 });
    expect(dotEntries(unit).length).toBe(1);
    expect(dotEntries(unit)[0].damage).toBe(20);
  });
});

describe('control buff', () => {
  it('hasControl 判定', () => {
    const u = { buffs: [] };
    applyBuff(u, { kind: 'control', control: 'stun', duration: 1 });
    expect(hasControl(u, 'stun')).toBe(true);
    expect(hasControl(u, 'silence')).toBe(false);
    expect(hasControl({}, 'stun')).toBe(false);
  });
});

describe('clearAuras', () => {
  it('只移除 aura、保留其他 buff', () => {
    const u = { buffs: [
      { kind: 'stat', stat: 'atk', op: 'add', value: 5 },
      { kind: 'stat', stat: 'def', op: 'mul', value: 1.2, aura: true },
    ] };
    clearAuras(u);
    expect(u.buffs.length).toBe(1);
    expect(u.buffs[0].aura).toBeUndefined();
  });
});

import { summarizeBuffs } from './buffs.js';

describe('summarizeBuffs（前端小圖示摘要）', () => {
  it('正負判定：增益 neg=false、減益 neg=true', () => {
    const unit = u();
    applyBuff(unit, { kind: 'stat', stat: 'atk', op: 'mul', value: 1.2, duration: 2 });
    applyBuff(unit, { kind: 'stat', stat: 'atk', op: 'mul', value: 0.7, duration: 2, key: 'down', stackable: true });
    applyBuff(unit, { kind: 'stat', stat: 'dmgTaken', op: 'mul', value: 0.6, duration: 2, key: 'guard' });
    applyBuff(unit, { kind: 'dot', damage: 10, duration: 2 });
    applyBuff(unit, { kind: 'shield', amount: 50, duration: 2 });
    applyBuff(unit, { kind: 'control', control: 'stun', duration: 1 });
    applyBuff(unit, { kind: 'control', control: 'taunt', duration: 2, key: 't' });
    const s = summarizeBuffs(unit);
    const find = (pred) => s.find(pred);
    expect(find((b) => b.stat === 'atk' && !b.neg)).toBeTruthy();
    expect(find((b) => b.stat === 'atk' && b.neg)).toBeTruthy();
    expect(find((b) => b.stat === 'dmgTaken').neg).toBe(false); // 承傷降低是增益
    expect(find((b) => b.kind === 'dot').neg).toBe(true);
    expect(find((b) => b.kind === 'shield').neg).toBe(false);
    expect(find((b) => b.control === 'stun').neg).toBe(true);
    expect(find((b) => b.control === 'taunt').neg).toBe(false); // 嘲諷是自己開的戰術狀態
  });

  it('排除光環；輸出可序列化欄位', () => {
    const unit = u();
    applyBuff(unit, { kind: 'stat', stat: 'def', op: 'mul', value: 1.1, duration: null, aura: true, key: 'aura' });
    applyBuff(unit, { kind: 'stat', stat: 'def', op: 'mul', value: 1.3, duration: 2 });
    const s = summarizeBuffs(unit);
    expect(s.length).toBe(1);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
