// 職業定義：坦 / 輸出 / 輔助。
// statMods 為基礎數值的乘區修正（佔位平衡值）。
// energyOnHitTaken / energyOnAction / energyOnAllyAction 控制能量條成長傾向。
// ultimate 指向 skills.js 內的大招行為 key。

export const CLASSES = {
  tank: {
    id: 'tank', label: '坦克',
    statMods: { hp: 1.3, atk: 0.8, def: 1.4 },
    energyOnAction: 15,
    energyOnHitTaken: 20,
    energyOnAllyAction: 0,
    ultimate: 'guard',
    preferredRow: 'front',
  },
  dps: {
    id: 'dps', label: '輸出',
    statMods: { hp: 0.9, atk: 1.8, def: 0.85 },
    energyOnAction: 25, // 含 +10 額外
    energyOnHitTaken: 8,
    energyOnAllyAction: 0,
    ultimate: 'burst',
    preferredRow: 'front',
  },
  support: {
    id: 'support', label: '輔助',
    statMods: { hp: 1.0, atk: 0.9, def: 1.0 },
    energyOnAction: 15,
    energyOnHitTaken: 8,
    energyOnAllyAction: 12,
    ultimate: 'heal',
    preferredRow: 'back',
  },
};

export const CLASS_LIST = Object.values(CLASSES);
