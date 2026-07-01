// 普攻與大招定義。每個技能 (caster, ctx) 直接套用效果並透過 ctx.emit 發事件。
// ctx = { allies, enemies, rng, emit }
import { computeDamage } from './damage.js';
import { singleEnemyByColumn, lowestHpAlly } from './targeting.js';
import { applyBuff } from './buffs.js';

// 大招倍率與數值（佔位平衡常數）
export const ULT = {
  burstMult: 2.6, // 輸出單體爆發
  guardReduction: 0.5, // 坦克減傷（受傷 x0.5）
  guardDuration: 2, // 回合
  guardSelfHeal: 0.15, // 自療 maxHp 比例
  healPower: 3.0, // 輔助治療 = atk * 此值
  healSplash: 0.4, // 其餘隊友獲得主治療量的比例
};

// 套用一次傷害並處理能量/死亡事件。
function applyDamage(attacker, target, mult, ctx, skill) {
  const res = computeDamage(attacker, target, mult, ctx.rng);
  const dealt = target.takeDamage(res.amount);
  // 受擊回能
  target.gainEnergy(target.classDef.energyOnHitTaken);
  ctx.emit('damage', {
    source: attacker,
    target,
    amount: dealt,
    skill,
    isAdvantage: res.isAdvantage,
    isDisadvantage: res.isDisadvantage,
    isCrit: res.isCrit,
  });
  if (!target.alive) ctx.emit('death', { unit: target });
}

// ---- 普攻：直行對位選敵、施放者集氣、其餘存活隊友各獲 energyOnAllyAction ----
export function normalAttack(caster, ctx) {
  const target = singleEnemyByColumn(caster, ctx.enemies);
  if (!target) return;
  ctx.emit('attack', { attacker: caster, target, skill: 'normal' });
  applyDamage(caster, target, 1.0, ctx, 'normal');
  caster.gainEnergy(caster.classDef.energyOnAction);
  for (const ally of ctx.allies) {
    if (ally === caster || !ally.alive) continue;
    const gain = ally.classDef.energyOnAllyAction || 0;
    if (gain) ally.gainEnergy(gain);
  }
}

// ---- 大招 ----
export const ULTIMATES = {
  // 輸出：對直行對位目標造成高倍率爆發
  burst(caster, ctx) {
    const target = singleEnemyByColumn(caster, ctx.enemies);
    if (!target) return;
    ctx.emit('ultimate', { caster, skill: 'burst', target });
    applyDamage(caster, target, ULT.burstMult, ctx, 'burst');
  },

  // 坦克：全體我方減傷 + 自療
  guard(caster, ctx) {
    ctx.emit('ultimate', { caster, skill: 'guard' });
    for (const ally of ctx.allies) {
      if (!ally.alive) continue;
      applyBuff(ally, { kind: 'stat', stat: 'dmgTaken', op: 'mul', value: ULT.guardReduction, duration: ULT.guardDuration, key: 'guard' });
    }
    const healed = caster.heal(caster.maxHp * ULT.guardSelfHeal);
    if (healed > 0) ctx.emit('heal', { source: caster, target: caster, amount: healed });
  },

  // 輔助：治療最低血隊友 + 其餘小量回復
  heal(caster, ctx) {
    const main = lowestHpAlly(ctx.allies);
    if (!main) return;
    ctx.emit('ultimate', { caster, skill: 'heal', target: main });
    const power = caster.atk * ULT.healPower;
    const mainHealed = main.heal(power);
    if (mainHealed > 0) ctx.emit('heal', { source: caster, target: main, amount: mainHealed });
    for (const ally of ctx.allies) {
      if (!ally.alive || ally === main) continue;
      const h = ally.heal(power * ULT.healSplash);
      if (h > 0) ctx.emit('heal', { source: caster, target: ally, amount: h });
    }
  },
};

// 取得單位的大招行為（依職業）。
export function ultimateFor(unit) {
  return ULTIMATES[unit.classDef.ultimate] || ULTIMATES.burst;
}
