// 從卡片實例 { cardId, level } 推導最終戰鬥數值。
// 純函式：base + growth*(level-1)，再套職業修正。供升級 UI 與戰鬥單位共用。
import { CARDS } from '../data/cards.js';
import { CLASSES } from '../data/classes.js';

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
  return {
    cardId: card.id,
    name: card.name,
    element: card.element,
    class: card.class,
    race: card.race,
    series: card.series ? [...card.series] : [],
    level: cardInst.level,
    hp: Math.round(raw.hp * cls.statMods.hp),
    atk: Math.round(raw.atk * cls.statMods.atk),
    def: Math.round(raw.def * cls.statMods.def),
  };
}
