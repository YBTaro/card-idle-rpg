// 命中/迴避 + 惡夢印記：
//   命中機率 = 1 + 施放者命中 − 目標迴避（夾 0..1）；只對敵對效果判定、每段獨立。
//   我方 buff 恆 100%；DoT 跳傷/荊棘/反擊不判定。
//   惡夢：永久（不隨回合消退）、可被淨化；受普攻/技能直傷後額外損失 5% 最大生命。
import { describe, it, expect } from 'vitest';
import { makeUnit } from './testHelpers.js';
import { applyEffect, dealDamage, dealDot, rollHit } from './effects.js';
import { applyBuff, tickBuffs, dispelBuffs } from './buffs.js';
import { Rng } from '../core/rng.js';

const ctxFor = (caster, allies, enemies) => ({
  allies, enemies, rng: new Rng(1),
  emit: () => {},
});

const dodgeBuff = (v) => ({ kind: 'stat', stat: 'dodge', op: 'add', value: v, duration: 2 });
const accBuff = (v) => ({ kind: 'stat', stat: 'accuracy', op: 'add', value: v, duration: 2 });

describe('命中/迴避判定', () => {
  it('迴避 100%：敵對傷害與上狀態全部落空、發 miss 事件', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 1000, def: 0 });
    applyBuff(foe, dodgeBuff(1.0));
    const misses = [];
    const ctx = { ...ctxFor(caster, [caster], [foe]), emit: (e, p) => { if (e === 'miss') misses.push(p); } };
    applyEffect({ type: 'damage', mult: 2.0, scope: 'target' }, caster, [foe], ctx, 't');
    applyEffect({ type: 'control', control: 'freeze', duration: 2, scope: 'target' }, caster, [foe], ctx, 't');
    expect(foe.hp).toBe(1000); // 傷害落空
    expect((foe.buffs ?? []).some((b) => b.kind === 'control')).toBe(false); // 狀態也落空
    expect(misses.length).toBe(2); // 每段獨立判定、各發一次 miss
  });

  it('命中率抵銷迴避：迴避 30% vs 命中 +30% → 必中', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    applyBuff(foe, dodgeBuff(0.3));
    applyBuff(caster, accBuff(0.3));
    // chance = 1 + 0.3 - 0.3 = 1 → rollHit 不擲骰直接命中
    for (let i = 0; i < 20; i += 1) expect(rollHit(caster, foe, ctxFor(caster, [caster], [foe]))).toBe(true);
  });

  it('對我方效果恆 100%：隊友迴避拉滿也吃得到 buff 與治療', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const ally = makeUnit({ team: 0, pos: 2, hp: 1000 });
    ally.hp = 500;
    applyBuff(ally, dodgeBuff(1.0));
    const ctx = ctxFor(caster, [caster, ally], []);
    applyEffect({ type: 'buff', stat: 'atk', op: 'mul', value: 1.2, duration: 2, scope: 'allAllies' }, caster, [caster, ally], ctx, 't');
    applyEffect({ type: 'heal', power: 1.0, scope: 'allAllies' }, caster, [caster, ally], ctx, 't');
    expect(ally.buffs.some((b) => b.stat === 'atk')).toBe(true);
    expect(ally.hp).toBeGreaterThan(500);
  });

  it('DoT 跳傷不判定迴避：狀態已成立照跳', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 1000, class: 'tank' });
    applyBuff(foe, dodgeBuff(1.0));
    dealDot(foe, { damage: 30 }, ctxFor(caster, [caster], [foe]));
    expect(foe.hp).toBe(970);
  });

  it('荊棘反傷不判定迴避：攻擊者迴避拉滿仍被反彈', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100, hp: 1000 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0, class: 'tank' });
    applyBuff(caster, dodgeBuff(1.0));
    applyBuff(foe, { kind: 'thorns', pct: 0.3, duration: 2 });
    dealDamage(caster, foe, 1.0, ctxFor(caster, [caster], [foe]), 'normal');
    expect(caster.hp).toBeLessThan(1000); // 反傷照吃
  });
});

describe('惡夢印記', () => {
  it('受普攻/技能直傷後額外損失 5% 最大生命（繞盾直傷）', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 2000, def: 0, class: 'tank' });
    const ctx = ctxFor(caster, [caster], [foe]);
    applyEffect({ type: 'nightmare', pct: 0.05, scope: 'target' }, caster, [foe], ctx, 'nightTerror');
    expect(foe.buffs.some((b) => b.kind === 'nightmare')).toBe(true);
    const before = foe.hp;
    const dealt = dealDamage(caster, foe, 1.0, ctx, 'normal');
    expect(foe.hp).toBe(before - dealt - Math.round(foe.maxHp * 0.05)); // 直傷 + 惡夢 5%
  });

  it('DoT 跳傷不觸發惡夢加傷', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 2000, class: 'tank' });
    applyBuff(foe, { kind: 'nightmare', pct: 0.05 });
    dealDot(foe, { damage: 30 }, ctxFor(caster, [caster], [foe]));
    expect(foe.hp).toBe(2000 - 30); // 只有跳傷，無 5% 追加
  });

  it('永久：tickBuffs 不會移除；可被淨化：dispel 減益會移除', () => {
    const foe = makeUnit({ team: 1, pos: 1 });
    applyBuff(foe, { kind: 'nightmare', pct: 0.05 });
    tickBuffs(foe);
    tickBuffs(foe);
    tickBuffs(foe);
    expect(foe.buffs.some((b) => b.kind === 'nightmare')).toBe(true); // 不隨回合消退
    dispelBuffs(foe, { negative: true });
    expect(foe.buffs.some((b) => b.kind === 'nightmare')).toBe(false); // 淨化可解
  });
});
