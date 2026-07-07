// 職業定義：坦 / 輸出 / 輔助。
// statMods 為基礎數值的乘區修正（佔位平衡值）。
// energyOnHitTaken / energyOnAction / energyOnAllyAction 控制能量條成長傾向。
// ultimate 指向 skills.js 內的大招行為 key。

export const CLASSES = {
  // 集氣規格（2026-07 定案）：坦/輔 普攻基本 15、輸出普攻 25；
  // 坦克受擊額外 +5、輔助隊友行動額外 +3。約每 4 回合一輪絕技。
  tank: {
    id: 'tank', label: '坦克',
    statMods: { hp: 1.3, atk: 1.95, def: 1.3 }, // 血/防 1.3 最厚硬；攻 1.95 使坦傷害約輸出 0.6×（底攻低故乘區高）

    energyOnAction: 15,
    energyOnHitTaken: 5,
    energyOnAllyAction: 0,
    ultimate: 'guard',
    preferredRow: 'front',
  },
  dps: {
    id: 'dps', label: '輸出',
    statMods: { hp: 1.08, atk: 1.8, def: 1.3 }, // 血 0.9→1.08(×1.2)；防 1.3 拉高輸出底防使坦 DEF 約輸出 2×

    energyOnAction: 25,
    energyOnHitTaken: 0,
    energyOnAllyAction: 0,
    ultimate: 'burst',
    preferredRow: 'front',
  },
  support: {
    id: 'support', label: '輔助',
    statMods: { hp: 1.56, atk: 1.85, def: 1.9 }, // 血 1.56≈輸出1.8×、攻 1.85≈輸出0.75×、防 1.9≈輸出1.5×（輔助底值低故乘區偏高）
    energyOnAction: 15,
    energyOnHitTaken: 0,
    energyOnAllyAction: 3,
    ultimate: 'heal',
    preferredRow: 'back',
  },
};

export const CLASS_LIST = Object.values(CLASSES);
