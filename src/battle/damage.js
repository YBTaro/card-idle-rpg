// 傷害公式。集中常數，方便調平衡。
import { elementMultiplier } from '../data/elements.js';

export const DAMAGE_VARIANCE = 0.1; // ±10% 浮動
export const DAMAGE_GLOBAL = 1.4; // 全域傷害係數（調整戰鬥節奏，越高戰鬥越快）
export const CRIT_CHANCE = 0.05; // 基礎暴擊率 5%（暴擊靠場地/被動堆疊，不靠裸值）
export const CRIT_MULT = 1.5; // 暴擊傷害 1.5x
export const DEF_SOFTCAP = 120; // 防禦軟上限 K：承傷比例 = K / (K + def)，def = K 時傷害減半

// 計算一次攻擊傷害。
// attacker / defender 為 Unit；mult 為技能倍率（普攻 1.0、大招更高）。
// opts.ignoreDef＝無視防禦（防禦視為 0）。
// 讀取有效值 getter（effAtk/effDef/critChance/critMult/dmgTakenMult/dmgDealtMult）。
// 抗暴（critRes）：實際被暴率＝攻方暴擊率−守方抗暴（下限 0）；只影響機率不影響倍率。
// 元素抗性（res_火/水/風/光/暗）：剋制倍率之後再乘「守方對該屬性的承傷率」（預設 1）。
export function computeDamage(attacker, defender, mult, rng, opts = {}) {
  // 無屬性（noElement）：跳過屬性相剋與屬性抗性。
  const elemMult = opts.noElement ? 1 : elementMultiplier(attacker.element, defender.element);
  // 傷害基準：預設攻擊力；basis:'selfDef' 改以施放者防禦力計算。
  const src = opts.basis === 'selfDef' ? attacker.effDef : attacker.effAtk;
  const base = src * mult;
  // 防禦採比值衰減（寶可夢式 A/D 精神）：K/(K+def) 平滑遞減、
  // 防禦再高也不會把傷害壓到 0，且高防有遞減報酬。
  const def = opts.ignoreDef ? 0 : Math.max(0, defender.effDef);
  const afterDef = base * (DEF_SOFTCAP / (DEF_SOFTCAP + def));
  const variance = rng ? 1 + (rng.next() * 2 - 1) * DAMAGE_VARIANCE : 1;
  // opts.critBonus：技能單擊額外暴擊率（加在攻方；仍受守方抗暴 critRes 抵扣）
  const critChance = Math.max(0, attacker.critChance + (opts.critBonus || 0) - defender.critRes);
  const isCrit = rng ? rng.next() < critChance : false;
  const critMult = isCrit ? attacker.critMult : 1;
  const elemRes = opts.noElement ? 1 : defender.elementRes(attacker.element);
  const raw =
    afterDef * elemMult * elemRes * defender.dmgTakenMult * attacker.dmgDealtMult * variance * critMult * DAMAGE_GLOBAL;
  return {
    amount: Math.max(1, Math.round(raw)),
    elementMult: elemMult,
    isAdvantage: elemMult > 1,
    isDisadvantage: elemMult < 1,
    isCrit,
  };
}
