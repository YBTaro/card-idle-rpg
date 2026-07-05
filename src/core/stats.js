// 從卡片實例 { cardId, level, stars } 推導最終戰鬥數值。
// 純函式：base + growth*(level-1)，套職業修正，再套星級加成。供 UI 與戰鬥單位共用。
import { CARDS } from '../data/cards.js';
import { CLASSES } from '../data/classes.js';
import { RACES } from '../data/races.js';

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
  // 三圍層級：職業（影響最大）× 種族（±8~12%；例：龍族輸出的血也不會低）× 個體微調（base）
  const race = RACES[card.race]?.statMods ?? { hp: 1, atk: 1, def: 1 };
  const raw = rawStatsAtLevel(card, cardInst.level);
  const stars = cardInst.stars ?? 0;
  const starMul = 1 + STAR_STAT_BONUS * stars;
  // 里程碑加成 → 追加為無條件自身被動（recomputePassives 每步重算、常駐）
  const passives = card.passives ? [...card.passives] : [];
  for (const [star, m] of Object.entries(STAR_MILESTONES)) {
    // star:true ＝進場鎖定類（與隊伍技同規則：整場有效、不受死活影響）
    if (stars >= Number(star)) passives.push({ target: 'self', effects: m.effects, star: true });
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
    hp: Math.round(raw.hp * cls.statMods.hp * race.hp * starMul),
    atk: Math.round(raw.atk * cls.statMods.atk * race.atk * starMul),
    def: Math.round(raw.def * cls.statMods.def * race.def * starMul),
    passives,
    triggers: card.triggers ? [...card.triggers] : [], // 觸發（亡語/受擊/血線…見 triggers.js）
    onEnter: card.onEnter ?? null, // 進場被動（開天氣/場地）
  };
}
