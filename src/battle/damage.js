// 傷害公式。集中常數，方便調平衡。
import { elementMultiplier } from '../data/elements.js';

export const DAMAGE_VARIANCE = 0.1; // ±10% 浮動
export const DAMAGE_GLOBAL = 1.6; // 全域傷害係數（調整戰鬥節奏，越高戰鬥越快）
export const CRIT_CHANCE = 0.05; // 暴擊率 5%
export const CRIT_MULT = 1.5; // 暴擊傷害 1.5x
export const DEF_SOFTCAP = 120; // 防禦軟上限 K：承傷比例 = K / (K + def)，def = K 時傷害減半

// 計算一次攻擊傷害。
// attacker / defender 為 Unit；mult 為技能倍率（普攻 1.0、大招更高）。
// 讀取有效值 getter（effAtk/effDef/critChance/critMult/dmgTakenMult/dmgDealtMult）。
export function computeDamage(attacker, defender, mult, rng) {
  const elemMult = elementMultiplier(attacker.element, defender.element);
  const base = attacker.effAtk * mult;
  // 防禦採比值衰減（寶可夢式 A/D 精神）：K/(K+def) 平滑遞減、
  // 防禦再高也不會把傷害壓到 0，且高防有遞減報酬。
  const afterDef = base * (DEF_SOFTCAP / (DEF_SOFTCAP + Math.max(0, defender.effDef)));
  const variance = rng ? 1 + (rng.next() * 2 - 1) * DAMAGE_VARIANCE : 1;
  const isCrit = rng ? rng.next() < attacker.critChance : false;
  const critMult = isCrit ? attacker.critMult : 1;
  const raw =
    afterDef * elemMult * defender.dmgTakenMult * attacker.dmgDealtMult * variance * critMult * DAMAGE_GLOBAL;
  return {
    amount: Math.max(1, Math.round(raw)),
    elementMult: elemMult,
    isAdvantage: elemMult > 1,
    isDisadvantage: elemMult < 1,
    isCrit,
  };
}
