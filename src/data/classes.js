// 職業定義：坦 / 輸出 / 輔助。
// statMods 為基礎數值的乘區修正（佔位平衡值）。
// energyOnHitTaken / energyOnAction / energyOnAllyAction 控制能量條成長傾向。
// ultimate 指向 skills.js 內的大招行為 key。

export const CLASSES = {
  // 集氣節奏（2026-07 調降 ~40%）：目標「約每 3 回合一輪絕技」——
  //   tank ≈ 行動12＋受擊12（被打 2~3 次/回合）；dps ≈ 行動18＋偶爾受擊；
  //   support ≈ 行動12＋隊友行動5×4~5。充能技（晨曲/湧能磁場）價值相對提升。
  tank: {
    id: 'tank', label: '坦克',
    statMods: { hp: 1.3, atk: 0.8, def: 1.4 },
    energyOnAction: 12,
    energyOnHitTaken: 12,
    energyOnAllyAction: 0,
    ultimate: 'guard',
    preferredRow: 'front',
  },
  dps: {
    id: 'dps', label: '輸出',
    statMods: { hp: 0.9, atk: 1.8, def: 0.85 },
    energyOnAction: 18,
    energyOnHitTaken: 6,
    energyOnAllyAction: 0,
    ultimate: 'burst',
    preferredRow: 'front',
  },
  support: {
    id: 'support', label: '輔助',
    statMods: { hp: 1.0, atk: 0.9, def: 1.0 },
    energyOnAction: 12,
    energyOnHitTaken: 6,
    energyOnAllyAction: 5,
    ultimate: 'heal',
    preferredRow: 'back',
  },
};

export const CLASS_LIST = Object.values(CLASSES);
