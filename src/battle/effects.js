// src/battle/effects.js
// 效果原語：技能由多個 effect 組成，每個 effect 依 type 套用到 scope 解析出的目標。
import { computeDamage } from './damage.js';
import { elementMultiplier } from '../data/elements.js';
import { applyBuff } from './buffs.js';

// power 的基準：預設 caster.effAtk（含 buff 加成）；basis:'targetMaxHp' 用目標 maxHp。
export function resolvePower(effect, caster, target) {
  const base = effect.basis === 'targetMaxHp' ? target.maxHp : caster.effAtk;
  return base * effect.power;
}

export function resolveScope(scope, caster, primary, ctx) {
  const alive = (arr) => arr.filter((u) => u.alive);
  switch (scope) {
    case 'self':
      return caster.alive ? [caster] : [];
    case 'target':
      return primary.filter((u) => u.alive);
    case 'allAllies':
      return alive(ctx.allies);
    case 'allEnemies':
      return alive(ctx.enemies);
    case 'alliesExceptTarget':
      return alive(ctx.allies).filter((u) => !primary.includes(u));
    default:
      return [];
  }
}

// 共用傷害：走完整公式、護盾/hp、被擊回能、事件。
export function dealDamage(caster, target, mult, ctx, skill = 'skill') {
  const res = computeDamage(caster, target, mult, ctx.rng);
  const dealt = target.takeDamage(res.amount);
  target.gainEnergy(target.classDef.energyOnHitTaken);
  ctx.emit('damage', {
    source: caster, target, amount: dealt, skill,
    isAdvantage: res.isAdvantage, isDisadvantage: res.isDisadvantage, isCrit: res.isCrit,
  });
  if (!target.alive) ctx.emit('death', { unit: target });
  return dealt;
}

// DoT：套用預存 damage，直接扣 hp（不吃護盾、不吃暴擊）。
export function dealDot(target, dot, ctx) {
  if (!target.alive) return 0;
  const dealt = Math.min(target.hp, dot.damage);
  target.hp -= dealt;
  ctx.emit('damage', {
    source: null, target, amount: dealt, skill: 'dot',
    isAdvantage: false, isDisadvantage: false, isCrit: false,
  });
  if (!target.alive) ctx.emit('death', { unit: target });
  return dealt;
}

// where 條件過濾：series 成員判斷、其餘等值；多鍵 AND；無 where → true。
export function matchesWhere(unit, where) {
  if (!where) return true;
  for (const [key, val] of Object.entries(where)) {
    if (key === 'series') {
      if (!unit.series || !unit.series.includes(val)) return false;
    } else if (unit[key] !== val) {
      return false;
    }
  }
  return true;
}

export function applyEffect(effect, caster, units, ctx, skillId = 'skill') {
  const targets = effect.where ? units.filter((u) => matchesWhere(u, effect.where)) : units;
  for (const u of targets) {
    switch (effect.type) {
      case 'damage':
        dealDamage(caster, u, effect.mult, ctx, skillId);
        break;
      case 'heal': {
        const healed = u.heal(Math.round(resolvePower(effect, caster, u)));
        if (healed > 0) ctx.emit('heal', { source: caster, target: u, amount: healed });
        break;
      }
      case 'buff':
        applyBuff(u, {
          kind: 'stat', stat: effect.stat, op: effect.op, value: effect.value,
          duration: effect.duration, key: effect.key, stackable: effect.stackable,
        });
        break;
      case 'dot': {
        const elem = effect.element ? elementMultiplier(caster.element, u.element) : 1;
        const damage = Math.round(resolvePower(effect, caster, u) * elem);
        applyBuff(u, {
          kind: 'dot', damage, element: effect.element,
          duration: effect.duration, key: effect.key, stackable: effect.stackable,
        });
        break;
      }
      case 'shield':
        applyBuff(u, {
          kind: 'shield', amount: Math.round(resolvePower(effect, caster, u)),
          duration: effect.duration, key: effect.key, stackable: effect.stackable,
        });
        break;
      case 'energy':
        u.gainEnergy(effect.amount);
        break;
      case 'control':
        applyBuff(u, {
          kind: 'control', control: effect.control,
          duration: effect.duration, key: effect.key, stackable: effect.stackable,
        });
        break;
    }
  }
}
