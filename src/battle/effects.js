// src/battle/effects.js
// 效果原語：技能由多個 effect 組成，每個 effect 依 type 套用到 scope 解析出的目標。
import { computeDamage } from './damage.js';
import { elementMultiplier } from '../data/elements.js';
import { applyBuff, summarizeBuffs, dispelBuffs, isNegative, resolve } from './buffs.js';

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
    case 'targetIncludingDead': // 復活用：不過濾存活
      return primary;
    default:
      return [];
  }
}

// 共用傷害：走完整公式、護盾/hp、被擊回能、事件。
// opts.ignoreDef＝無視防禦；opts.noRetaliate＝不觸發荊棘/反擊（避免連鎖遞迴）。
export function dealDamage(caster, target, mult, ctx, skill = 'skill', opts = {}) {
  const res = computeDamage(caster, target, mult, ctx.rng, opts);
  const dealt = target.takeDamage(res.amount);
  target.gainEnergy(target.classDef.energyOnHitTaken);
  ctx.emit('energy', { unit: target, value: target.energy });
  ctx.emit('damage', {
    source: caster, target, amount: dealt, skill,
    isAdvantage: res.isAdvantage, isDisadvantage: res.isDisadvantage, isCrit: res.isCrit,
    trueDmg: !!opts.ignoreDef, execute: !!opts.execute, // 演出用旗標（真傷/處決）
  });
  if (!target.alive) ctx.emit('death', { unit: target });

  // 受擊觸發（直接攻擊才觸發；反傷/反擊本身不再連鎖）
  if (!opts.noRetaliate && dealt > 0 && caster) {
    // 荊棘反傷：受擊者身上 thorns 總和 × 實際傷害，直接回敬攻擊者
    const thornsPct = (target.buffs || []).filter((b) => b.kind === 'thorns').reduce((s, b) => s + b.pct, 0);
    if (thornsPct > 0 && caster.alive) {
      const reflect = Math.max(1, Math.round(dealt * thornsPct));
      const rDealt = caster.takeDamage(reflect);
      ctx.emit('damage', {
        source: target, target: caster, amount: rDealt, skill: 'thorns',
        isAdvantage: false, isDisadvantage: false, isCrit: false,
      });
      if (!caster.alive) ctx.emit('death', { unit: caster });
    }
    // 反擊：受擊者存活且掛 counter → 立即回敬一擊（不觸發對方的荊棘/反擊）
    if (target.alive && caster.alive) {
      const counter = (target.buffs || []).find((b) => b.kind === 'counter');
      if (counter) dealDamage(target, caster, counter.mult, ctx, 'counter', { noRetaliate: true });
    }
  }
  return dealt;
}

// DoT：套用預存 damage，直接扣 hp（不吃護盾、不吃暴擊）。
// 吃 dotTaken 易傷（「增加受到的灼燒傷害%」型 debuff）。
export function dealDot(target, dot, ctx) {
  if (!target.alive) return 0;
  const amount = Math.round(dot.damage * resolve(target, 'dotTaken', 1));
  const dealt = Math.min(target.hp, amount);
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
  // buff 類效果套用後發布狀態摘要（戰鬥 log / 前端小圖示用）。
  const emitBuffs = (u) => ctx.emit('buffchange', { unit: u, buffs: summarizeBuffs(u) });
  // 疊加規則：預設「同技能的同一效果」不可疊加——重施＝刷新覆蓋（值與持續時間重設）。
  // 技能資料可用 key 讓跨技能互斥（如 'guard'），或 stackable:true 明示可疊層。
  const defaultKey = (kindTag) => effect.key ?? `${skillId}:${kindTag}`;
  for (const u of targets) {
    // 機率觸發：每個目標獨立擲骰，未中則此效果跳過該目標
    if (effect.chance != null) {
      const roll = ctx.rng ? ctx.rng.next() : Math.random();
      if (roll >= effect.chance) continue;
    }
    switch (effect.type) {
      case 'damage': {
        // 處決：目標血量比例低於 executeBelow → 倍率乘 executeBonus
        let mult = effect.mult;
        let executed = false;
        if (effect.executeBelow != null && u.hpRatio < effect.executeBelow) {
          mult *= effect.executeBonus ?? 1.5;
          executed = true;
        }
        const dealt = dealDamage(caster, u, mult, ctx, skillId, { ignoreDef: effect.ignoreDef, execute: executed });
        // 吸血：實際傷害的一定比例回復施放者
        if (effect.lifesteal && dealt > 0 && caster.alive) {
          const healed = caster.heal(Math.round(dealt * effect.lifesteal));
          if (healed > 0) ctx.emit('heal', { source: caster, target: caster, amount: healed, kind: 'lifesteal' });
        }
        break;
      }
      case 'heal': {
        const healed = u.heal(Math.round(resolvePower(effect, caster, u)));
        if (healed > 0) ctx.emit('heal', { source: caster, target: u, amount: healed });
        break;
      }
      case 'hot': // 持續回復：行動前結算（engine 與 DoT 同點）
        applyBuff(u, {
          kind: 'hot', amount: Math.round(resolvePower(effect, caster, u)),
          duration: effect.duration, key: defaultKey('hot'), stackable: effect.stackable,
        });
        emitBuffs(u);
        break;
      case 'extend': {
        // 延長狀態持續時間：what:'dot'（可配 element 限灼燒）/'control'/'negative'（全部減益）
        let touched = 0;
        for (const b of u.buffs ?? []) {
          if (b.aura || b.duration == null) continue;
          if (effect.what === 'dot' && b.kind !== 'dot') continue;
          if (effect.what === 'control' && b.kind !== 'control') continue;
          if ((effect.what === 'negative' || effect.what == null) && !isNegative(b)) continue;
          if (effect.element && b.element !== effect.element) continue;
          b.duration += effect.turns ?? 1;
          touched += 1;
        }
        if (touched) emitBuffs(u);
        break;
      }
      case 'detonateDot': {
        // 引爆：把目標身上的 DoT（可限 element）一次結算＝每跳傷害×剩餘回合，並移除。
        // 結算同 DoT 語義（不吃護盾/暴擊），吃 dotTaken 易傷與 effect.mult 加成。
        const targets = (u.buffs ?? []).filter(
          (b) => b.kind === 'dot' && (!effect.element || b.element === effect.element)
        );
        if (!targets.length) break;
        let total = 0;
        for (const b of targets) total += b.damage * Math.max(1, b.duration ?? 1);
        u.buffs = u.buffs.filter((b) => !targets.includes(b));
        emitBuffs(u);
        total = Math.round(total * (effect.mult ?? 1) * resolve(u, 'dotTaken', 1));
        const dealt = Math.min(u.hp, total);
        u.hp -= dealt;
        ctx.emit('damage', {
          source: caster, target: u, amount: dealt, skill: skillId,
          isAdvantage: false, isDisadvantage: false, isCrit: false, detonate: true,
        });
        if (!u.alive) ctx.emit('death', { unit: u });
        break;
      }
      case 'dispel': {
        // what:'debuff' 淨化減益（用在隊友）/ 'buff' 驅散增益（用在敵人）
        const removed = dispelBuffs(u, { negative: effect.what !== 'buff', count: effect.count ?? Infinity });
        if (removed > 0) {
          ctx.emit('dispel', { unit: u, what: effect.what === 'buff' ? 'buff' : 'debuff', count: removed });
          emitBuffs(u);
        }
        break;
      }
      case 'revive':
        if (!u.alive) {
          u.hp = Math.max(1, Math.round(u.maxHp * effect.power));
          u.energy = 0;
          u.buffs = []; // 復活淨身：清掉生前所有狀態
          ctx.emit('revive', { unit: u, hp: u.hp });
          ctx.emit('energy', { unit: u, value: 0 });
          emitBuffs(u);
        }
        break;
      case 'thorns': // 荊棘反傷：受直接攻擊時反彈實際傷害的 pct
        applyBuff(u, {
          kind: 'thorns', pct: effect.pct,
          duration: effect.duration, key: defaultKey('thorns'), stackable: effect.stackable,
        });
        emitBuffs(u);
        break;
      case 'counter': // 反擊：受直接攻擊存活時回敬 mult 倍攻擊
        applyBuff(u, {
          kind: 'counter', mult: effect.mult,
          duration: effect.duration, key: defaultKey('counter'), stackable: effect.stackable,
        });
        emitBuffs(u);
        break;
      case 'buff':
        applyBuff(u, {
          kind: 'stat', stat: effect.stat, op: effect.op, value: effect.value,
          duration: effect.duration, key: defaultKey(`buff:${effect.stat}:${effect.op}`), stackable: effect.stackable,
        });
        emitBuffs(u);
        break;
      case 'dot': {
        const elem = effect.element ? elementMultiplier(caster.element, u.element) : 1;
        const damage = Math.round(resolvePower(effect, caster, u) * elem);
        applyBuff(u, {
          kind: 'dot', damage, element: effect.element,
          duration: effect.duration, key: defaultKey(`dot:${effect.element ?? ''}`), stackable: effect.stackable,
        });
        emitBuffs(u);
        break;
      }
      case 'shield':
        applyBuff(u, {
          kind: 'shield', amount: Math.round(resolvePower(effect, caster, u)),
          duration: effect.duration, key: defaultKey('shield'), stackable: effect.stackable,
        });
        emitBuffs(u);
        break;
      case 'energy':
        u.gainEnergy(effect.amount);
        ctx.emit('energy', { unit: u, value: u.energy });
        break;
      case 'control':
        applyBuff(u, {
          kind: 'control', control: effect.control,
          duration: effect.duration, key: defaultKey(`control:${effect.control}`), stackable: effect.stackable,
        });
        emitBuffs(u);
        break;
    }
  }
}
