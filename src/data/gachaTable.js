// 抽卡掉落表：一抽一個 item。
// 素材高機率、稀有卡低機率（不分 R/SR/SSR）。機率為佔位常數。

export const GACHA_COST_TICKETS = 1; // 一抽消耗一張抽卡券

// 兩大類掉落權重（總和不需為 100，weightedPick 會自動正規化）
export const GACHA_TABLE = [
  { type: 'material', materialId: 'essence', amount: [3, 6], weight: 85 }, // 高機率素材
  { type: 'card', weight: 15 }, // 低機率稀有卡（具體角色再從卡池隨機）
];

// 抽到重複角色時轉換成的素材數量（佔位）
export const DUPLICATE_TO_MATERIAL = { materialId: 'essence', amount: 20 };
