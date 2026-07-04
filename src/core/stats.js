// 從卡片實例 { cardId, level, stars } 推導最終戰鬥數值。
// 純函式：base + growth*(level-1)，套職業修正，再套星級加成。供 UI 與戰鬥單位共用。
import { CARDS } from '../data/cards.js';
import { CLASSES } from '../data/classes.js';

// ---- 升星（重複卡 +1 星，0 → 5）----
export const MAX_STARS = 5;
export const STAR_STAT_BONUS = 0.08; // 每星三圍 +8%
// 里程碑加成（達到該星數即解鎖，走被動光環管線常駐生效）
export const STAR_MILESTONES = {
  2: { desc: '造成傷害 +5%', effects: [{ stat: 'dmgDealt', op: 'mul', value: 1.05 }] },
  4: { desc: '承受傷害 -5%', effects: [{ stat: 'dmgTaken', op: 'mul', value: 0.95 }] },
  5: { desc: '造成傷害 +10%、承受傷害 -5%', effects: [{ stat: 'dmgDealt', op: 'mul', value: 1.1 }, { stat: 'dmgTaken', op: 'mul', value: 0.95 }] },
};

export function rawStatsAtLevel(card, level) {
  const out = {};
  for (const key of ['hp', 'atk', 'def']) {
    out[key] = card.base[key] + card.growth[key] * (level - 1);
  }
  return out;
}

// 回傳含名稱/屬性/職業的完整戰鬥數值（整數）。
export function deriveStats(cardInst) {
  const card = CARDS[cardInst.cardId];
  if (!card) throw new Error(`未知卡片：${cardInst.cardId}`);
  const cls = CLASSES[card.class];
  const raw = rawStatsAtLevel(card, cardInst.level);
  const stars = cardInst.stars ?? 0;
  const starMul = 1 + STAR_STAT_BONUS * stars;
  // 里程碑加成 → 追加為無條件自身被動（recomputePassives 每步重算、常駐）
  const passives = card.passives ? [...card.passives] : [];
  for (const [star, m] of Object.entries(STAR_MILESTONES)) {
    if (stars >= Number(star)) passives.push({ target: 'self', effects: m.effects });
  }
  return {
    cardId: card.id,
    name: card.name,
    element: card.element,
    class: card.class,
    race: card.race,
    series: card.series ? [...card.series] : [],
    level: cardInst.level,
    stars,
    hp: Math.round(raw.hp * cls.statMods.hp * starMul),
    atk: Math.round(raw.atk * cls.statMods.atk * starMul),
    def: Math.round(raw.def * cls.statMods.def * starMul),
    passives,
  };
}
