// 抽卡系統：一抽一個 item。高機率素材、低機率稀有卡（不分 R/SR/SSR）。
import { store, addCardInstance } from '../core/state.js';
import { saveGame } from '../core/save.js';
import { rng } from '../core/rng.js';
import { GACHA_TABLE, GACHA_COST_TICKETS, DUPLICATE_TO_MATERIAL, RARITY_WEIGHT } from '../data/gachaTable.js';
import { MAX_STARS } from '../core/stats.js';
import { GACHA_CARD_POOL, CARDS, rarityOf } from '../data/cards.js';
import { MATERIALS } from '../data/materials.js';

export function canPull(state = store.state) {
  return state.currencies.tickets >= GACHA_COST_TICKETS;
}

// 執行一抽。回傳結果物件供 UI 展示：
//   { ok:false, reason }
//   { ok:true, type:'material', materialId, amount, label }
//   { ok:true, type:'card', cardId, isNew, label }             // 新角色
//   { ok:true, type:'starup', cardId, stars, label }           // 重複 → 升星（0→5）
//   { ok:true, type:'duplicate', cardId, materialId, amount }  // 已滿星的重複 → 轉素材
export function pull(state = store.state, _rng = rng) {
  if (state.currencies.tickets < GACHA_COST_TICKETS) {
    return { ok: false, reason: 'no-ticket' };
  }
  state.currencies.tickets -= GACHA_COST_TICKETS;

  const entry = _rng.weightedPick(GACHA_TABLE);
  let result;

  if (entry.type === 'material') {
    const [min, max] = entry.amount;
    const amount = _rng.int(min, max);
    addMaterial(state, entry.materialId, amount);
    result = {
      ok: true,
      type: 'material',
      materialId: entry.materialId,
      amount,
      label: `${MATERIALS[entry.materialId].label} ×${amount}`,
    };
  } else {
    // 稀有卡：依稀有度權重從卡池抽一張（目前全 R 等權＝均勻隨機）
    const pool = GACHA_CARD_POOL.map((id) => ({ id, weight: RARITY_WEIGHT[rarityOf(CARDS[id])] ?? 1 }));
    const cardId = _rng.weightedPick(pool).id;
    const ownedInst = state.cards.find((c) => c.cardId === cardId);
    if (ownedInst) {
      if ((ownedInst.stars ?? 0) < MAX_STARS) {
        // 重複 → 升星
        ownedInst.stars = (ownedInst.stars ?? 0) + 1;
        result = {
          ok: true,
          type: 'starup',
          cardId,
          stars: ownedInst.stars,
          label: `${CARDS[cardId].name} 升星 ★${ownedInst.stars}`,
        };
      } else {
        // 已滿星 → 轉素材
        const { materialId, amount } = DUPLICATE_TO_MATERIAL;
        addMaterial(state, materialId, amount);
        result = {
          ok: true,
          type: 'duplicate',
          cardId,
          materialId,
          amount,
          label: `${CARDS[cardId].name}（重複）→ ${MATERIALS[materialId].label} ×${amount}`,
        };
      }
    } else {
      addCardInstance(state, cardId);
      result = {
        ok: true,
        type: 'card',
        cardId,
        isNew: true,
        label: `★ 新角色：${CARDS[cardId].name}`,
      };
    }
  }

  saveGame();
  store.notify();
  return result;
}

function addMaterial(state, materialId, amount) {
  state.inventory.materials[materialId] = (state.inventory.materials[materialId] || 0) + amount;
}
