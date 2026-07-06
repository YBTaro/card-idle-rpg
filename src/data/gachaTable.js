// 抽卡掉落表：一抽一個 item。
// 素材高機率、稀有卡低機率（不分 R/SR/SSR）。機率為佔位常數。

export const GACHA_COST_TICKETS = 1; // 一抽消耗一張抽卡券

// 兩大類掉落權重（總和不需為 100，weightedPick 會自動正規化）
export const GACHA_TABLE = [
  { type: 'material', materialId: 'essence', amount: [3, 6], weight: 70 }, // 素材
  { type: 'card', weight: 30 }, // 中卡率 30%（具體角色再從卡池隨機）
];

// 抽到重複角色時轉換成的素材數量（佔位）
export const DUPLICATE_TO_MATERIAL = { materialId: 'essence', amount: 20 };

// 稀有度抽取權重（E1 架構）：每張卡的權重 = RARITY_WEIGHT[該卡稀有度]。
// 目前全卡未標稀有度（皆視為 R）→ 等權，行為與分級前完全一致；
// 之後分級把 SR/SSR 權重調低即可（例：R 70 / SR 25 / SSR 5）。
export const RARITY_WEIGHT = { R: 1, SR: 1, SSR: 1 };
