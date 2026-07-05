// src/battle/effects.js
// 效果原語：技能由多個 effect 組成，每個 effect 依 type 套用到 scope 解析出的目標。
import { computeDamage } from './damage.js';
import { elementMultiplier, COUNTERS } from '../data/elements.js';
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
    // 窄範圍輔助（群輔稀缺原則：範圍越窄數值越高）
    case 'frontAllies':
      return alive(ctx.allies).filter((u) => u.row === 'front');
    case 'backAllies':
      return alive(ctx.allies).filter((u) => u.row === 'back');
    case 'columnAllies': // 與施放者同直排（含自己）
      return alive(ctx.allies).filter((u) => u.column === caster.column);
    case 'targetIncludingDead': // 復活用：不過濾存活
      return primary;
    default:
      return [];
  }
}

// ---- 命中判定（唯一入口）----
// 只對敵對目標判定；命中機率 = 1 ＋ 施放者命中率 − 目標迴避率（夾 0..1）。
// 對我方的效果永遠 100%。DoT 跳傷/荊棘/反擊/侵蝕不經此判定（狀態已成立或屬反應）。
export function rollHit(caster, target, ctx) {
  if (!caster || caster.team === target.team) return true;
  const chance = Math.max(0, Math.min(1, 1 + resolve(caster, 'accuracy', 0) - resolve(target, 'dodge', 0)));
  if (chance >= 1) return true;
  const roll = ctx.rng ? ctx.rng.next() : Math.random();
  return roll < chance;
}

// 可被迴避的效果型別：攻擊與「上狀態」；瞬發操作類（dispel/extend/detonateDot/energy）不判定。
const DODGEABLE = new Set(['damage', 'dot', 'control', 'buff', 'transmute', 'nightmare']);

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

  // 惡夢印記：受普攻/技能直接傷害後額外損失 pct 最大生命（DoT/引爆/侵蝕不觸發）
  if (dealt > 0 && target.alive) {
    const nm = (target.buffs || []).filter((b) => b.kind === 'nightmare').reduce((s, b) => s + b.pct, 0);
    if (nm > 0) dealDirect(target, target.maxHp * nm, ctx, { skill: 'nightmare', source: caster, flags: { nightmare: true } });
  }

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

// ---- 直接傷害（唯一入口）：DoT / 引爆 / 環境侵蝕共用 ----
// 語義：繞過護盾、不吃暴擊、不觸發受擊回能與反傷。只需要 ctx.emit。
// 新的「繞盾扣血」效果一律走這裡，不要再開新的 hp -= 路徑。
export function dealDirect(target, amount, ctx, { skill = 'dot', source = null, flags = {} } = {}) {
  if (!target.alive || amount <= 0) return 0;
  const dealt = Math.min(target.hp, Math.round(amount));
  target.hp -= dealt;
  ctx.emit('damage', {
    source, target, amount: dealt, skill,
    isAdvantage: false, isDisadvantage: false, isCrit: false, ...flags,
  });
  if (!target.alive) ctx.emit('death', { unit: target });
  return dealt;
}

// ---- 治療量結算（唯一入口）：環境規則 healMul 只在這裡生效 ----
export function healAmount(ctx, amount) {
  return Math.round(amount * (ctx.rules?.healMul ?? 1));
}

// DoT：套用預存 damage。吃 dotTaken 易傷（「增加受到的灼燒傷害%」型 debuff）。
export function dealDot(target, dot, ctx) {
  return dealDirect(target, dot.damage * resolve(target, 'dotTaken', 1), ctx, { skill: 'dot' });
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
  // ---- 全場效果（無目標概念）：不進逐目標迴圈，機率整體擲一次 ----
  if (effect.type === 'weather' || effect.type === 'terrain') {
    if (effect.chance != null && (ctx.rng ? ctx.rng.next() : Math.random()) >= effect.chance) return;
    if (effect.type === 'weather') ctx.setWeather?.(effect.weather);
    else ctx.setTerrain?.(effect.terrain);
    return;
  }

  const targets = effect.where ? units.filter((u) => matchesWhere(u, effect.where)) : units;
  // buff 類效果套用後發布狀態摘要（戰鬥 log / 前端小圖示用）。
  const emitBuffs = (u) => ctx.emit('buffchange', { unit: u, buffs: summarizeBuffs(u) });
  // 套 buff + 發 buffApplied（觸發系統的 buffGained 時機；被動光環不經此路徑不觸發）
  const applyBuffN = (u, spec) => {
    applyBuff(u, spec);
    ctx.emit('buffApplied', { unit: u, negative: isNegative(spec) });
  };
  // 疊加規則：預設「同技能的同一效果」不可疊加——重施＝刷新覆蓋（值與持續時間重設）。
  // 技能資料可用 key 讓跨技能互斥（如 'guard'），或 stackable:true 明示可疊層。
  const defaultKey = (kindTag) => effect.key ?? `${skillId}:${kindTag}`;
  for (const u of targets) {
    // 命中判定（迴避）：敵對的攻擊與上狀態「每段」獨立判定，閃掉＝該段對此目標無效
    if (DODGEABLE.has(effect.type) && caster && u.team !== caster.team && !rollHit(caster, u, ctx)) {
      ctx.emit('miss', { source: caster, target: u, skill: skillId });
      continue;
    }
    // 機率觸發：每個目標獨立擲骰，未中則此效果跳過該目標
    if (effect.chance != null) {
      const roll = ctx.rng ? ctx.rng.next() : Math.random();
      if (roll >= effect.chance) continue;
    }
    switch (effect.type) {
      case 'damage': {
        // 超充：施放瞬間溢出的能量（energy/100）只放大直傷，DoT/治療/狀態不吃
        let mult = effect.mult * (ctx.overcharge ?? 1);
        // 處決：目標血量比例低於 executeBelow → 倍率乘 executeBonus
        let executed = false;
        if (effect.executeBelow != null && u.hpRatio < effect.executeBelow) {
          mult *= effect.executeBonus ?? 1.5;
          executed = true;
        }
        const dealt = dealDamage(caster, u, mult, ctx, skillId, { ignoreDef: effect.ignoreDef, execute: executed });
        // 吸血：實際傷害的一定比例回復施放者
        if (effect.lifesteal && dealt > 0 && caster.alive) {
          const healed = caster.heal(healAmount(ctx, dealt * effect.lifesteal));
          if (healed > 0) ctx.emit('heal', { source: caster, target: caster, amount: healed, kind: 'lifesteal' });
        }
        break;
      }
      case 'heal': {
        const healed = u.heal(healAmount(ctx, resolvePower(effect, caster, u)));
        if (healed > 0) ctx.emit('heal', { source: caster, target: u, amount: healed });
        break;
      }
      case 'hot': // 持續回復：行動前結算（engine 與 DoT 同點）
        applyBuffN(u, {
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
        total = total * (effect.mult ?? 1) * resolve(u, 'dotTaken', 1);
        dealDirect(u, total, ctx, { skill: skillId, source: caster, flags: { detonate: true } });
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
        if (ctx.rules?.noRevive) break; // 環境規則：鎮魂墓場禁復活
        if (!u.alive) {
          u.hp = Math.max(1, Math.round(u.maxHp * effect.power));
          u.energy = 0;
          u.buffs = []; // 復活淨身：清掉生前所有狀態
          ctx.emit('revive', { unit: u, hp: u.hp });
          ctx.emit('energy', { unit: u, value: 0 });
          emitBuffs(u);
        }
        break;
      case 'transmute': // 屬性轉化：把目標轉成「施放者剋制的屬性」（穩吃 1.5 剋制），到期還原
        applyBuffN(u, {
          kind: 'element', element: COUNTERS[caster.element],
          duration: effect.duration, key: defaultKey('transmute'),
        });
        emitBuffs(u);
        break;
      case 'castDrain': // 靈壓干擾：掛身期間敵方施法 → 其餘敵人能量被抽
        applyBuffN(u, {
          kind: 'castDrain', amount: effect.amount ?? 20,
          duration: effect.duration, key: defaultKey('castDrain'), stackable: effect.stackable,
        });
        emitBuffs(u);
        break;
      case 'thorns': // 荊棘反傷：受直接攻擊時反彈實際傷害的 pct
        applyBuffN(u, {
          kind: 'thorns', pct: effect.pct,
          duration: effect.duration, key: defaultKey('thorns'), stackable: effect.stackable,
        });
        emitBuffs(u);
        break;
      case 'counter': // 反擊：受直接攻擊存活時回敬 mult 倍攻擊
        applyBuffN(u, {
          kind: 'counter', mult: effect.mult,
          duration: effect.duration, key: defaultKey('counter'), stackable: effect.stackable,
        });
        emitBuffs(u);
        break;
      case 'buff':
        applyBuffN(u, {
          kind: 'stat', stat: effect.stat, op: effect.op, value: effect.value,
          duration: effect.duration, key: defaultKey(`buff:${effect.stat}:${effect.op}`), stackable: effect.stackable,
        });
        emitBuffs(u);
        break;
      case 'dot': {
        const elem = effect.element ? elementMultiplier(caster.element, u.element) : 1;
        const damage = Math.round(resolvePower(effect, caster, u) * elem);
        if (effect.stackable) {
          // 明示可疊層（業火/瘟疫）：同人也疊新層
          applyBuffN(u, { kind: 'dot', damage, element: effect.element, duration: effect.duration, stackable: true });
        } else {
          // DoT 身分＝施放者＋技能＋屬性：
          //   同人再上 → 原層剩餘回合 +1、每跳傷害更新為新值（不重置、不疊層）
          //   不同人上 →（key 含 caster.uid）各自獨立一層，同時各跳各的
          const key = `${caster.uid}:${skillId}:dot:${effect.element ?? ''}`;
          const existing = (u.buffs ?? []).find((b) => b.key === key);
          if (existing) {
            existing.duration = (existing.duration ?? 0) + 1;
            existing.damage = damage;
          } else {
            applyBuffN(u, { kind: 'dot', damage, element: effect.element, duration: effect.duration, key });
          }
        }
        emitBuffs(u);
        break;
      }
      case 'shield':
        applyBuffN(u, {
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
        applyBuffN(u, {
          kind: 'control', control: effect.control,
          duration: effect.duration, key: defaultKey(`control:${effect.control}`), stackable: effect.stackable,
        });
        emitBuffs(u);
        break;
      case 'nightmare': // 惡夢印記：永久（無 duration、不隨回合消退）、可被淨化；觸發見 dealDamage
        applyBuffN(u, { kind: 'nightmare', pct: effect.pct ?? 0.05, key: defaultKey('nightmare') });
        emitBuffs(u);
        break;
      case 'energySteal': {
        // 竊能：奪走目標當前全部能量 → 全數轉給我方能量最低的存活隊友。
        // 瞬發操作類（同 dispel/extend）不吃迴避判定；接收方走 gainEnergy（凍結/上限規則照常）。
        const stolen = u.energy;
        if (stolen <= 0) break;
        u.energy = 0;
        ctx.emit('energy', { unit: u, value: 0 });
        const alive = ctx.allies.filter((a) => a.alive);
        const recv = alive.length ? alive.reduce((m, a) => (a.energy < m.energy ? a : m)) : null;
        if (recv) {
          recv.gainEnergy(stolen);
          ctx.emit('energy', { unit: recv, value: recv.energy });
        }
        ctx.emit('steal', { from: u, to: recv, amount: stolen });
        break;
      }
    }
  }
}
