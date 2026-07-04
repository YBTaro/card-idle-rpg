// 角色卡基礎定義（佔位 roster）。
// base 為 1 級數值，已內含職業修正後的「最終手感數值」可由 deriveStats 計算。
// 這裡的 base 是「未套職業修正」的原始值，職業修正在 unit / leveling 時套用。
// attackStyle：普攻動畫型態 'melee'（突進揮擊）/ 'ranged'（原地發射光彈）；
//   未標時退回職業判定（support=ranged、其餘 melee）。純演出欄位，不影響數值。

export const CARDS = {
  // ---- 火 ----
  ifrit: { id: 'ifrit', name: '炎獄魔將', element: 'fire', class: 'dps', attackStyle: 'melee', race: '妖', series: ['炎之眷屬'], base: { hp: 520, atk: 95, def: 40 }, growth: { hp: 58, atk: 11, def: 4 }, passives: [{ when: { selfHpBelow: 0.5 }, target: 'self', effects: [{ stat: 'atk', op: 'mul', value: 1.3 }] }] },
  emberguard: { id: 'emberguard', name: '熔岩守衛', element: 'fire', class: 'tank', attackStyle: 'melee', race: '機械', series: ['炎之眷屬', '守護者'], base: { hp: 700, atk: 60, def: 70 }, growth: { hp: 80, atk: 6, def: 7 } },

  // ---- 風 ----
  zephyr: { id: 'zephyr', name: '疾風劍客', element: 'wind', class: 'dps', attackStyle: 'melee', race: '人', series: ['疾風'], base: { hp: 480, atk: 92, def: 36 }, growth: { hp: 52, atk: 11, def: 3 } },
  galewind: { id: 'galewind', name: '風語祭司', element: 'wind', class: 'support', attackStyle: 'ranged', race: '人', series: ['疾風', '聖歌隊'], base: { hp: 500, atk: 70, def: 44 }, growth: { hp: 56, atk: 8, def: 4 } },

  // ---- 水 ----
  tidecaller: { id: 'tidecaller', name: '潮汐術士', element: 'water', class: 'dps', attackStyle: 'ranged', race: '人', series: ['潮汐'], base: { hp: 500, atk: 90, def: 40 }, growth: { hp: 55, atk: 10, def: 4 } },
  aegis: { id: 'aegis', name: '深海壁壘', element: 'water', class: 'tank', attackStyle: 'melee', race: '龍', series: ['潮汐', '守護者'], base: { hp: 740, atk: 58, def: 74 }, growth: { hp: 84, atk: 6, def: 8 }, passives: [{ target: 'allAllies', effects: [{ stat: 'def', op: 'mul', value: 1.1 }] }] },

  // ---- 光 ----
  seraph: { id: 'seraph', name: '聖光天使', element: 'light', class: 'support', attackStyle: 'ranged', race: '神', series: ['聖歌隊', '光輝'], base: { hp: 520, atk: 74, def: 46 }, growth: { hp: 58, atk: 8, def: 5 } },
  dawnblade: { id: 'dawnblade', name: '曙光劍士', element: 'light', class: 'dps', attackStyle: 'melee', race: '人', series: ['光輝'], base: { hp: 510, atk: 94, def: 42 }, growth: { hp: 56, atk: 11, def: 4 } },

  // ---- 暗 ----
  nightreaper: { id: 'nightreaper', name: '暗影收割者', element: 'dark', class: 'dps', attackStyle: 'melee', race: '不死', series: ['影之眷屬'], base: { hp: 500, atk: 98, def: 38 }, growth: { hp: 54, atk: 12, def: 3 }, passives: [{ target: 'self', effects: [{ stat: 'atk', op: 'mul', basePct: 0.05, perCountOf: { side: 'allies', where: { race: '不死' } } }] }] },
  gravewarden: { id: 'gravewarden', name: '幽冥守墓人', element: 'dark', class: 'tank', attackStyle: 'melee', race: '不死', series: ['影之眷屬', '守護者'], base: { hp: 720, atk: 62, def: 72 }, growth: { hp: 82, atk: 6, def: 7 } },
};

export const CARD_LIST = Object.values(CARDS);

// 稀有卡池（抽卡可能抽到的角色）。MVP 全部角色都可抽。
export const GACHA_CARD_POOL = CARD_LIST.map((c) => c.id);

// 玩家初始隊伍（首次進遊戲送的 5 張），確保能立即開打。
export const STARTER_CARD_IDS = ['emberguard', 'zephyr', 'tidecaller', 'seraph', 'nightreaper'];
