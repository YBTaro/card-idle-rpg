// src/battle/effects.test.js
import { describe, it, expect } from 'vitest';
import { resolvePower, resolveScope, dealDamage, applyEffect } from './effects.js';
import { makeUnit } from './testHelpers.js';
import { Rng } from '../core/rng.js';

const ctxFor = (caster, allies, enemies, events = []) => ({
  allies, enemies, rng: new Rng(1),
  emit: (event, payload) => events.push({ event, payload }),
});

describe('effects', () => {
  it('resolvePower：預設 atk 制、basis targetMaxHp 用目標 maxHp', () => {
    const caster = makeUnit({ atk: 100 });
    const target = makeUnit({ hp: 500 });
    expect(resolvePower({ power: 2.0 }, caster, target)).toBe(200);
    expect(resolvePower({ power: 0.1, basis: 'targetMaxHp' }, caster, target)).toBe(50);
  });

  it('resolveScope：self / allAllies / alliesExceptTarget', () => {
    const caster = makeUnit({ team: 0, pos: 1 });
    const a2 = makeUnit({ team: 0, pos: 2 });
    const ctx = { allies: [caster, a2], enemies: [] };
    expect(resolveScope('self', caster, [], ctx)).toEqual([caster]);
    expect(resolveScope('allAllies', caster, [], ctx).length).toBe(2);
    expect(resolveScope('alliesExceptTarget', caster, [caster], ctx)).toEqual([a2]);
  });

  it('damage 效果：扣血、被擊回能、發 damage 事件', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100, element: 'fire' });
    const foe = makeUnit({ team: 1, pos: 1, element: 'light', def: 0, hp: 99999, class: 'tank' });
    const events = [];
    const ctx = ctxFor(caster, [caster], [foe], events);
    applyEffect({ type: 'damage', mult: 1.0, scope: 'target' }, caster, [foe], ctx, 'burst');
    expect(foe.hp).toBeLessThan(99999);
    expect(foe.energy).toBe(foe.classDef.energyOnHitTaken); // 被擊回能
    expect(events.some((e) => e.event === 'damage')).toBe(true);
  });

  it('heal / buff / shield / dot 效果', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const ally = makeUnit({ team: 0, pos: 2, hp: 100 });
    ally.hp = 40;
    const ctx = ctxFor(caster, [caster, ally], []);
    // heal = effAtk×0.5 = 50（尚未 buff）
    applyEffect({ type: 'heal', power: 0.5, scope: 'target' }, caster, [ally], ctx);
    expect(ally.hp).toBe(90);
    // shield = effAtk×0.3 = 30（尚未 buff）
    applyEffect({ type: 'shield', power: 0.3, scope: 'self' }, caster, [caster], ctx);
    expect(caster.buffs.some((b) => b.kind === 'shield' && b.amount === 30)).toBe(true);
    // dot：預存每跳傷害（effAtk×0.2=20，無屬性）
    applyEffect({ type: 'dot', power: 0.2, duration: 3, scope: 'self' }, caster, [caster], ctx);
    expect(caster.buffs.some((b) => b.kind === 'dot' && b.damage === 20)).toBe(true);
    // buff atk ×1.5（最後套用）→ effAtk 提升
    applyEffect({ type: 'buff', stat: 'atk', op: 'mul', value: 1.5, duration: 2, scope: 'self' }, caster, [caster], ctx);
    expect(caster.effAtk).toBe(150);
    // 驗證 buff 會放大 power：buff 後新的護盾 = effAtk×0.3 = 45
    applyEffect({ type: 'shield', power: 0.3, scope: 'self', key: 'sh2' }, caster, [caster], ctx);
    expect(caster.buffs.some((b) => b.kind === 'shield' && b.amount === 45)).toBe(true);
  });
});
