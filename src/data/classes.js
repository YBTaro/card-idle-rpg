// 職業定義：坦 / 輸出 / 輔助。
// statMods 為基礎數值的乘區修正（佔位平衡值）。
// energyOnHitTaken / energyOnAction 控制能量條成長傾向。
// ultimate 指向 skills.js 內的大招行為 key。

export const CLASSES = {
  tank: {
    id: 'tank',
    label: '坦克',
    statMods: { hp: 1.3, atk: 0.8, def: 1.4, spd: 0.85 },
    energyOnAction: 12,
    energyOnHitTaken: 14, // 坦克受擊回能多 → 常駐減傷大招
    ultimate: 'guard',
    preferredRow: 'front',
  },
  dps: {
    id: 'dps',
    label: '輸出',
    statMods: { hp: 0.9, atk: 1.8, def: 0.85, spd: 1.1 },
    energyOnAction: 20,
    energyOnHitTaken: 8,
    ultimate: 'burst',
    preferredRow: 'front',
  },
  support: {
    id: 'support',
    label: '輔助',
    statMods: { hp: 1.0, atk: 0.9, def: 1.0, spd: 1.05 },
    energyOnAction: 22,
    energyOnHitTaken: 10,
    ultimate: 'heal',
    preferredRow: 'back',
  },
};

export const CLASS_LIST = Object.values(CLASSES);
