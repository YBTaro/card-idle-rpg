// 職業定義：坦 / 輸出 / 輔助。
// statMods 為基礎數值的乘區修正（佔位平衡值）。
// energyOnHitTaken / energyOnAction / energyOnAllyAction 控制能量條成長傾向。
// ultimate 指向 skills.js 內的大招行為 key。

export const CLASSES = {
  // 集氣規格（2026-07 定案）：坦/輔 普攻基本 15、輸出普攻 25；
  // 坦克受擊額外 +5、輔助隊友行動額外 +3。約每 4 回合一輪絕技。
  tank: {
    id: 'tank', label: '坦克',
    statMods: { hp: 1.3, atk: 0.95, def: 1.2 }, // 攻 0.8→0.95：坦克普攻不再軟綿綿（仍最低攻＝輸出靠 DPS）；防禦 1.4→1.2 收窄差距

    energyOnAction: 15,
    energyOnHitTaken: 5,
    energyOnAllyAction: 0,
    ultimate: 'guard',
    preferredRow: 'front',
  },
  dps: {
    id: 'dps', label: '輸出',
    statMods: { hp: 0.9, atk: 1.8, def: 1.0 }, // 防禦 0.85→1.0：不再被防禦懲罰，非坦不會秒死（血量仍最低＝仍是脆皮高輸出）

    energyOnAction: 25,
    energyOnHitTaken: 0,
    energyOnAllyAction: 0,
    ultimate: 'burst',
    preferredRow: 'front',
  },
  support: {
    id: 'support', label: '輔助',
    statMods: { hp: 1.0, atk: 1.2, def: 1.15 }, // 攻 1.2：輔助傷害明顯高於坦克（坦攻 0.95）；防禦 1.15 後排也撐得住
    energyOnAction: 15,
    energyOnHitTaken: 0,
    energyOnAllyAction: 3,
    ultimate: 'heal',
    preferredRow: 'back',
  },
};

export const CLASS_LIST = Object.values(CLASSES);
