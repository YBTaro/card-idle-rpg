// src/battle/effects.js
// 效果原語：技能由多個 effect 組成，每個 effect 依 type 套用到 scope 解析出的目標。
import { computeDamage } from './damage.js';
import { COUNTERS } from '../data/elements.js';
import { applyBuff, summarizeBuffs, dispelBuffs, isNegative, resolve } from './buffs.js';

// 狀態變更通知：任何在傷害路徑上被消耗/移除的 buff（盾/免死…）都要發，前端圖示才即時清。
const notifyBuffs = (ctx, u) => ctx.emit('buffchange', { unit: u, buffs: summarizeBuffs(u) });

// 免死回血：cheatDeath 帶 healPct 時，免死當下回復對應最大生命（消耗一次性標記 _cheatHealPct）。
function applyCheatHeal(u, ctx) {
  if (!u._cheatHeal) return;
  const healed = u.heal(u._cheatHeal);
  u._cheatHeal = 0;
  if (healed > 0) ctx.emit('heal', { source: u, target: u, amount: healed, kind: 'cheatDeath' });
}

// power 的基準：預設 caster.effAtk（含 buff 加成）；basis:'targetMaxHp' 用目標 maxHp。
// Boss 保護：bossTag 單位不吃 %最大生命（否則巨型血條被毒隊融化）——改按施放者攻擊 ×3 結算。
export function resolvePower(effect, caster, target) {
  if (effect.basis === 'targetMaxHp') {
    if (target.bossTag) return caster.effAtk * effect.power * 3;
    return target.maxHp * effect.power;
  }
  return caster.effAtk * effect.power;
}

export function resolveScope(scope, caster, primary, ctx, effect = null) {
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
    case 'lowestHpAllies': // 血量比例最低的 N 名存活隊友（護盾/治療用；N＝effect.count，預設 1）
      return [...alive(ctx.allies)].sort((a, b) => a.hpRatio - b.hpRatio).slice(0, effect?.count ?? 1);
    case 'alliesExceptTarget':
      return alive(ctx.allies).filter((u) => !primary.includes(u));
    // 窄範圍輔助（群輔稀缺原則：範圍越窄數值越高）——本排/直排全空則轉移到其餘存活隊友，效果不浪費
    case 'frontAllies': {
      const front = alive(ctx.allies).filter((u) => u.row === 'front');
      return front.length ? front : alive(ctx.allies).filter((u) => u.row === 'back');
    }
    case 'backAllies': {
      const back = alive(ctx.allies).filter((u) => u.row === 'back');
      return back.length ? back : alive(ctx.allies).filter((u) => u.row === 'front');
    }
    case 'columnAllies': { // 與施放者同直排（含自己）；該直排無人→全體隊友
      const col = alive(ctx.allies).filter((u) => u.column === caster.column);
      return col.length ? col : alive(ctx.allies);
    }
    case 'frontEnemies': { // 敵方前排（前排全空→轉後排，效果不浪費）
      const front = alive(ctx.enemies).filter((u) => u.row === 'front');
      return front.length ? front : alive(ctx.enemies).filter((u) => u.row === 'back');
    }
    case 'backEnemies': { // 敵方後排（後排全空→轉前排）
      const back = alive(ctx.enemies).filter((u) => u.row === 'back');
      return back.length ? back : alive(ctx.enemies).filter((u) => u.row === 'front');
    }
    case 'targetAndAdjacent': // 目標 + 其上下左右相鄰格（同隊）——十字範圍
    case 'adjacentExcludingTarget': { // 僅上下左右相鄰格（不含主目標）——濺射打折用
      const prim = primary.filter((u) => u.alive);
      if (!prim.length) return [];
      const enemies = alive(ctx.enemies);
      const pool = enemies.includes(prim[0]) ? enemies : alive(ctx.allies);
      const out = new Set(scope === 'targetAndAdjacent' ? prim : []);
      for (const t of prim) {
        for (const u of pool) {
          if (prim.includes(u)) continue; // 主目標另計，避免濺射重複疊在主目標
          const adjacent = (u.row === t.row && Math.abs(u.column - t.column) === 1)
            || (u.column === t.column && u.row !== t.row);
          if (adjacent) out.add(u);
        }
      }
      return [...out];
    }
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
// 敵對「狀態」型別（不含傷害）：效果抗性與格擋 buff 只擋這些——傷害照常命中，狀態可被抵抗/彈開。
const HOSTILE_STATUS = new Set(['dot', 'control', 'buff', 'transmute', 'nightmare', 'mark', 'energyLink']);
// 傷害門檻（castSkill 兩段式）放行的對敵後續效果：敵對狀態 + 操作類。
// 傷害命中的敵人才吃這些——取代其自身閃避判定（命中後仍照跑 chance/抗性/格擋）。
const GATED_FOLLOWUP = new Set([
  'dot', 'control', 'buff', 'transmute', 'nightmare', 'mark', 'energyLink',
  'dispel', 'extend', 'detonateDot', 'energySteal', 'stealBuff', 'transferDebuff',
]);

// 共用傷害：走完整公式、護盾/hp、被擊回能、事件。
// opts.ignoreDef＝無視防禦；opts.noRetaliate＝不觸發荊棘/反擊（避免連鎖遞迴）。
export function dealDamage(caster, target, mult, ctx, skill = 'skill', opts = {}) {
  const res = computeDamage(caster, target, mult, ctx.rng, opts);
  // 護體上限（guardKit）：單次直接攻擊掉血夾在自身最大生命 capPct 內；
  // 夾之前原始傷害若超過門檻 → 記 guardCapped（觸發大傷全體反擊，見函式尾）。
  let guardCapped = false;
  if (target.guardKit) {
    const cap = Math.round(target.maxHp * target.guardKit.capPct);
    if (res.amount > cap) { guardCapped = true; res.amount = cap; }
  }
  const dealt = target.takeDamage(res.amount);
  const absorbed = target._absorbed ?? 0; // 護盾吸收量（統計計入攻擊者輸出；amount 仍＝實際扣血）
  target._absorbed = 0;
  // 護盾被吸收/打破 → 補發 buffchange 讓前端刷新狀態圖示（否則盾破了圖示還殘留）
  if (absorbed > 0) notifyBuffs(ctx, target);
  target.gainEnergy(target.classDef.energyOnHitTaken);
  ctx.emit('energy', { unit: target, value: target.energy });
  ctx.emit('damage', {
    source: caster, target, amount: dealt, skill, absorbed,
    isAdvantage: res.isAdvantage, isDisadvantage: res.isDisadvantage, isCrit: res.isCrit,
    trueDmg: !!opts.ignoreDef, execute: !!opts.execute, // 演出用旗標（真傷/處決）
    element: caster?.element ?? null, // 傷害字色＝攻擊者屬性（演出用）
  });
  if (target._cheated) { target._cheated = false; ctx.emit('cheated', { unit: target }); applyCheatHeal(target, ctx); notifyBuffs(ctx, target); } // 免死消耗→回血→刷圖示
  if (!target.alive) ctx.emit('death', { unit: target });

  // 惡夢印記：受普攻/技能直接傷害後額外損失 pct 最大生命（DoT/引爆/侵蝕不觸發）
  if (dealt > 0 && target.alive) {
    const nm = (target.buffs || []).filter((b) => b.kind === 'nightmare').reduce((s, b) => s + b.pct, 0);
    if (nm > 0) dealDirect(target, target.maxHp * nm, ctx, { skill: 'nightmare', source: caster, flags: { nightmare: true } });
  }

  // 受擊回癒（healOnHit）：受到直接攻擊時回復自身攻擊力×power 的生命，每次觸發消耗一層。
  // 與荊棘/反擊同一時機（直接攻擊限定；DoT/引爆/侵蝕不觸發）；層數歸零即移除。
  if (!opts.noRetaliate && dealt > 0 && target.alive) {
    const hoh = (target.buffs || []).find((b) => b.kind === 'healOnHit' && (b.charges ?? 0) > 0);
    if (hoh) {
      const healed = target.heal(healAmount(ctx, target.effAtk * (hoh.power ?? 1)));
      if (healed > 0) ctx.emit('heal', { source: target, target, amount: healed, kind: 'healOnHit' });
      hoh.charges -= 1;
      if (hoh.charges <= 0) target.buffs = target.buffs.filter((b) => b !== hoh);
      ctx.emit('buffchange', { unit: target, buffs: summarizeBuffs(target) });
    }
  }

  // 受擊觸發（直接攻擊才觸發；反傷/反擊本身不再連鎖）
  if (!opts.noRetaliate && dealt > 0 && caster) {
    // 荊棘反傷：受擊者身上 thorns 總和 × 實際傷害，直接回敬攻擊者
    const thornsPct = (target.buffs || []).filter((b) => b.kind === 'thorns').reduce((s, b) => s + b.pct, 0);
    if (thornsPct > 0 && caster.alive) {
      const reflect = Math.max(1, Math.round(dealt * thornsPct));
      const rDealt = caster.takeDamage(reflect);
      if ((caster._absorbed ?? 0) > 0) notifyBuffs(ctx, caster); // 荊棘打破攻擊者的盾 → 刷圖示
      caster._absorbed = 0;
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
    if (caster._cheated) { caster._cheated = false; ctx.emit('cheated', { unit: caster }); applyCheatHeal(caster, ctx); notifyBuffs(ctx, caster); } // 荊棘反殺被免死→回血→刷圖示
  }

  // 護體反擊（guardKit）：本次直接攻擊超過上限被夾 → 對全體敵人各發動一擊反擊 + 回血。整場限 maxUses 次。
  // 敵人＝行動者（攻擊方）同隊：ctx 以行動者視角建立，故 ctx.allies 即攻擊方全隊（＝持有者的敵人）。
  // 反擊走 noRetaliate（不連鎖荊棘/反擊），並沿用 'counter' 標籤（引擎視為被動傷害，不再觸發受擊連動）。
  if (!opts.noRetaliate && guardCapped && target.guardKit) {
    const gk = target.guardKit;
    const uses = target._guardUses ?? 0;
    if (uses < (gk.maxUses ?? Infinity)) {
      target._guardUses = uses + 1;
      const foes = (ctx.allies ?? []).filter((f) => f.alive);
      let total = 0;
      for (const foe of foes) total += dealDamage(target, foe, gk.counterMult, ctx, 'counter', { noRetaliate: true });
      if (total > 0 && target.alive && gk.lifesteal) {
        const healed = target.heal(healAmount(ctx, total * gk.lifesteal));
        if (healed > 0) ctx.emit('heal', { source: target, target, amount: healed, kind: 'guardCounter' });
      }
    }
  }
  return dealt;
}

// ---- 直接傷害（唯一入口）：DoT / 引爆 / 環境侵蝕共用 ----
// 語義：繞過護盾、不吃暴擊、不觸發受擊回能與反傷。只需要 ctx.emit。
// 新的「繞盾扣血」效果一律走這裡，不要再開新的 hp -= 路徑。
export function dealDirect(target, amount, ctx, { skill = 'dot', source = null, flags = {} } = {}) {
  if (!target.alive || amount <= 0) return 0;
  let dealt = Math.min(target.hp, Math.round(amount));
  // 免死標記：繞盾直傷（DoT/引爆/侵蝕/惡夢）也吃同一條規則
  if (dealt >= target.hp) {
    const undying = target.buffs?.find((b) => b.kind === 'undying');
    const cd = target.buffs?.find((b) => b.kind === 'cheatDeath');
    if (undying) {
      dealt = target.hp - 1; // 無敵：留 1 血、不消耗
      ctx.emit('cheated', { unit: target });
      notifyBuffs(ctx, target);
    } else if (cd) {
      target.buffs = target.buffs.filter((b) => b !== cd);
      dealt = target.hp - 1;
      target._cheatHeal = (cd.healPct ? Math.round(target.maxHp * cd.healPct) : 0) + (cd.healOnSave ?? 0); // 免死回血（扣血後補，見下）
      ctx.emit('cheated', { unit: target });
      notifyBuffs(ctx, target); // 免死消耗→刷圖示
    }
  }
  target.hp -= dealt;
  ctx.emit('damage', {
    source, target, amount: dealt, skill,
    isAdvantage: false, isDisadvantage: false, isCrit: false, ...flags,
  });
  applyCheatHeal(target, ctx); // 免死帶 healPct → 扣到 1 血後回復對應最大生命
  if (!target.alive) ctx.emit('death', { unit: target });
  return dealt;
}

// ---- 治療量結算（唯一入口）：環境規則 healMul 只在這裡生效 ----
export function healAmount(ctx, amount) {
  return Math.round(amount * (ctx.rules?.healMul ?? 1));
}

// DoT：套用預存 damage。吃 dotTaken 易傷（「增加受到的灼燒傷害%」型 debuff）。
// source 掛回上毒者（dot.src）——傷害歸屬正確：Boss 戰傷害計分/戰鬥統計都算得到毒隊頭上。
export function dealDot(target, dot, ctx) {
  return dealDirect(target, dot.damage * resolve(target, 'dotTaken', 1), ctx, {
    skill: 'dot',
    source: dot.src ?? null,
    flags: { element: dot.element ?? null }, // 灼燒橘紅/無屬性毒白（演出字色）
  });
}

// where 條件過濾：series 成員判斷、其餘等值；多鍵 AND；無 where → true。
export function matchesWhere(unit, where) {
  if (!where) return true;
  for (const [key, val] of Object.entries(where)) {
    if (key === 'series') {
      // 陣列＝任一系列成員命中；純量＝該系列成員（向後相容）
      const arr = Array.isArray(val) ? val : [val];
      if (!unit.series || !arr.some((s) => unit.series.includes(s))) return false;
    } else if (Array.isArray(val)) {
      // 陣列值＝「在清單內」（如 class:['support','dps']）
      if (!val.includes(unit[key])) return false;
    } else if (unit[key] !== val) {
      return false;
    }
  }
  return true;
}

export function applyEffect(effect, caster, units, ctx, skillId = 'skill', opts = {}) {
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
    const hostile = caster && u.team !== caster.team;
    // 傷害門檻（castSkill 兩段式）：對敵的可門檻後續效果依「命中集合」放行，取代自身閃避判定；
    // 否則走原本的每段獨立迴避（onEnter/環境/觸發等不傳 opts 的路徑行為不變）。
    if (opts.gate && hostile && GATED_FOLLOWUP.has(effect.type)) {
      if (!opts.gate.has(u)) {
        ctx.emit('miss', { source: caster, target: u, skill: skillId });
        continue;
      }
    } else if (DODGEABLE.has(effect.type) && hostile && !rollHit(caster, u, ctx)) {
      ctx.emit('miss', { source: caster, target: u, skill: skillId });
      continue;
    }
    // 機率觸發：每個目標獨立擲骰，未中則此效果跳過該目標
    if (effect.chance != null) {
      const roll = ctx.rng ? ctx.rng.next() : Math.random();
      if (roll >= effect.chance) continue;
    }
    // 敵對狀態的第二道防線（傷害段不受影響）：
    //   1. 效果抗性：上狀態機率 ×(1＋施放者效果命中−目標效果抗性)，抵抗＝飄「抵抗」
    //   2. 格擋 buff（debuffBlock）：彈掉一個負面狀態、消耗一層，飄「免疫」
    if (HOSTILE_STATUS.has(effect.type) && caster && u.team !== caster.team) {
      const p = 1 + resolve(caster, 'effectHit', 0) - resolve(u, 'effectRes', 0);
      if (p < 1 && (ctx.rng ? ctx.rng.next() : Math.random()) >= Math.max(0, p)) {
        ctx.emit('resist', { target: u, skill: skillId });
        continue;
      }
      const block = (u.buffs ?? []).find((b) => b.kind === 'debuffBlock' && (b.charges ?? 0) > 0);
      if (block) {
        block.charges -= 1;
        if (block.charges <= 0) u.buffs = u.buffs.filter((b) => b !== block);
        ctx.emit('blocked', { target: u, skill: skillId });
        emitBuffs(u);
        continue;
      }
    }
    switch (effect.type) {
      case 'damage': {
        if (opts.recordHits && hostile) opts.recordHits.add(u); // 命中集合：本段未被閃 → 記錄（供後續段門檻放行）
        // 最大生命%傷害（basis:'targetMaxHp'）：定額直傷＝目標最大生命×mult，繞防禦/屬性/超充/處決/暴擊
        if (effect.basis === 'targetMaxHp') {
          const dealt = dealDirect(u, u.maxHp * effect.mult, ctx, { skill: skillId, source: caster });
          if (effect.lifesteal && dealt > 0 && caster.alive) {
            const healed = caster.heal(healAmount(ctx, dealt * effect.lifesteal));
            if (healed > 0) ctx.emit('heal', { source: caster, target: caster, amount: healed, kind: 'lifesteal' });
          }
          break;
        }
        // 條件倍率覆寫：byClass（依目標職業）＞ vsDot（目標帶持續傷害＝中毒/灼燒）＞ 基礎 mult。
        let baseMult = effect.mult;
        if (effect.byClass && effect.byClass[u.class] != null) baseMult = effect.byClass[u.class];
        else if (effect.vsDot != null && (u.buffs ?? []).some((b) => b.kind === 'dot')) baseMult = effect.vsDot;
        // 超充：施放瞬間溢出的能量（energy/100）放大直傷與直接治療，DoT/HoT/護盾/狀態不吃
        let mult = baseMult * (ctx.overcharge ?? 1);
        // 處決：目標血量比例低於 executeBelow → 倍率乘 executeBonus
        let executed = false;
        if (effect.executeBelow != null && u.hpRatio < effect.executeBelow) {
          mult *= effect.executeBonus ?? 1.5;
          executed = true;
        }
        const dealt = dealDamage(caster, u, mult, ctx, skillId, {
          ignoreDef: effect.ignoreDef, execute: executed, basis: effect.basis, noElement: effect.noElement,
          critBonus: effect.critBonus, // 此擊額外暴擊率（加在攻方，仍受守方抗暴抵扣）
        });
        // 吸血：實際傷害的一定比例回復施放者
        if (effect.lifesteal && dealt > 0 && caster.alive) {
          const healed = caster.heal(healAmount(ctx, dealt * effect.lifesteal));
          if (healed > 0) ctx.emit('heal', { source: caster, target: caster, amount: healed, kind: 'lifesteal' });
        }
        break;
      }
      case 'heal': {
        // 直接治療吃施放者暴擊（增益技能不受抗暴影響——只擲施放者的暴擊率/暴傷；
        // HoT 每跳與吸血回填不吃暴擊）
        // 超充也放大直接治療（與直傷同規則）——爆發奶是合法 build；HoT/護盾/狀態仍不吃
        let amount = Math.round(healAmount(ctx, resolvePower(effect, caster, u)) * (ctx.overcharge ?? 1));
        let hCrit = false;
        const roll = ctx.rng ? ctx.rng.next() : Math.random();
        if (roll < caster.critChance) {
          amount = Math.round(amount * caster.critMult);
          hCrit = true;
        }
        const healed = u.heal(amount);
        if (healed > 0) ctx.emit('heal', { source: caster, target: u, amount: healed, isCrit: hCrit });
        break;
      }
      case 'hot': // 持續回復：行動前結算（engine 與 DoT 同點）
        applyBuffN(u, {
          kind: 'hot', amount: Math.round(resolvePower(effect, caster, u)),
          duration: effect.duration, key: defaultKey('hot'), stackable: effect.stackable,
          src: caster, // 每跳治療歸屬掛回施放者（與 dot.src 同規則；戰鬥統計用）
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
        // 灼燒/劇毒不吃屬性相剋（只有直傷才算屬性）；effect.element 僅供演出字色與引爆過濾。
        const damage = Math.round(resolvePower(effect, caster, u));
        if (effect.stackable) {
          // 明示可疊層（業火/瘟疫）：同人也疊新層
          applyBuffN(u, { kind: 'dot', damage, element: effect.element, duration: effect.duration, stackable: true, src: caster });
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
            applyBuffN(u, { kind: 'dot', damage, element: effect.element, duration: effect.duration, key, src: caster });
          }
        }
        emitBuffs(u);
        break;
      }
      case 'shield': {
        const shieldAmt = Math.round(resolvePower(effect, caster, u));
        applyBuffN(u, {
          kind: 'shield', amount: shieldAmt,
          duration: effect.duration, key: defaultKey('shield'), stackable: effect.stackable,
        });
        ctx.emit('shieldApplied', { source: caster, target: u, amount: shieldAmt }); // 盾量統計/飄字
        emitBuffs(u);
        break;
      }
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
      case 'healOnHit': // 受擊回癒：受直接攻擊時回復（power×自身攻擊力）生命，每次觸發消耗一層（結算見 dealDamage）
        applyBuffN(u, {
          kind: 'healOnHit', power: effect.power ?? 1.0, charges: effect.charges ?? 2,
          duration: effect.duration, key: defaultKey('healOnHit'), stackable: effect.stackable,
        });
        emitBuffs(u);
        break;
      case 'debuffBlock': // 格擋護符：接下來 N 個負面狀態被彈掉（每彈一層；可被驅散）
        applyBuffN(u, {
          kind: 'debuffBlock', charges: effect.charges ?? 1,
          duration: effect.duration, key: defaultKey('debuffBlock'), stackable: effect.stackable,
        });
        emitBuffs(u);
        break;
      case 'mark': // 印記：本身無效果的連動旗標——隊友打到帶印記目標時觸發 markedHit（見引擎）
        applyBuffN(u, { kind: 'mark', duration: effect.duration, key: defaultKey('mark') });
        emitBuffs(u);
        break;
      case 'energyLink': // 吸能印：期間目標每次獲得能量，施放者也 +amount（結算見 engine 'energy' 監聽）
        applyBuffN(u, {
          kind: 'energyLink', amount: effect.amount ?? 5,
          duration: effect.duration, key: defaultKey('energyLink'), src: caster,
        });
        emitBuffs(u);
        break;
      case 'atkRider': // 盾襲：持有者普攻命中後額外造成「目標最大生命×pctMaxHp」無視防禦無屬性傷害（結算見 normalAttack）
        applyBuffN(u, {
          kind: 'atkRider', pctMaxHp: effect.pctMaxHp ?? 0.1,
          duration: effect.duration, key: defaultKey('atkRider'), stackable: effect.stackable,
        });
        emitBuffs(u);
        break;
      case 'stealBuff': {
        // 偷取增益：把目標最多 count 個增益（非光環、非 sticky）搬到施放者身上
        // random:true → 用 rng 隨機挑 count 個（決定性回放照 rng 序）；否則取前 count 個。
        const takeable = (u.buffs ?? []).filter((b) => !b.aura && !b.sticky && !isNegative(b));
        let taken;
        if (effect.random) {
          const pool = [...takeable];
          taken = [];
          const n = Math.min(effect.count ?? 1, pool.length);
          for (let k = 0; k < n; k += 1) {
            const idx = Math.floor((ctx.rng ? ctx.rng.next() : Math.random()) * pool.length);
            taken.push(pool.splice(idx, 1)[0]);
          }
        } else {
          taken = takeable.slice(0, effect.count ?? 1);
        }
        if (!taken.length) break;
        u.buffs = u.buffs.filter((b) => !taken.includes(b));
        for (const b of taken) applyBuff(caster, b);
        ctx.emit('dispel', { unit: u, what: 'buff', count: taken.length }); // 沿用驅散演出（拆增益）
        emitBuffs(u);
        emitBuffs(caster);
        break;
      }
      case 'transferDebuff': {
        // 轉移減益：把施放者身上最多 count 個減益（非光環、非 sticky）丟給目標
        const movable = (caster.buffs ?? []).filter((b) => !b.aura && !b.sticky && isNegative(b));
        const moved = movable.slice(0, effect.count ?? 1);
        if (!moved.length) break;
        caster.buffs = caster.buffs.filter((b) => !moved.includes(b));
        for (const b of moved) applyBuff(u, b);
        ctx.emit('dispel', { unit: caster, what: 'debuff', count: moved.length }); // 沿用淨化演出
        emitBuffs(caster);
        emitBuffs(u);
        break;
      }
      case 'cheatDeath': // 免死標記：致死傷害改留 1 血、消耗標記（結算見 Unit.takeDamage/dealDirect）
        // 可選回血：healPower＝觸發免死時回復（攻擊力×power，存 healOnSave）；
        //           expireHealPower＝未觸發、到期時回復（見 engine tickBuffs 出口，存 healOnExpire）。
        applyBuffN(u, {
          kind: 'cheatDeath',
          duration: effect.duration, key: defaultKey('cheatDeath'),
          healPct: effect.healPct,
          healOnSave: effect.healPower != null ? Math.round(healAmount(ctx, caster.effAtk * effect.healPower)) : undefined,
          healOnExpire: effect.expireHealPower != null ? Math.round(healAmount(ctx, caster.effAtk * effect.expireHealPower)) : undefined,
        });
        emitBuffs(u);
        break;
      case 'undying': // 無敵護體：期間內任何致死傷害都留 1 血（不消耗、可連續），結算見 takeDamage/dealDirect
        applyBuffN(u, { kind: 'undying', duration: effect.duration, key: defaultKey('undying') });
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
