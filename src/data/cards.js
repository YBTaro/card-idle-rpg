// 角色卡基礎定義（佔位 roster）。
//
// ══ 三圍決定層級（deriveStats 依序相乘）══
//   1. 職業（CLASSES.statMods，影響最大）：坦＝血防、輸出＝攻、輔助＝均衡
//   2. 種族（RACES.statMods，±8~12%）：龍＝全高（輸出的血也不低）、妖＝攻最高防最低、
//      機械＝防最高攻最低、不死＝血厚防薄、獸＝血攻高防低、精靈＝偏攻脆皮、神＝難殺、人＝均衡
//   3. 個體風味（本檔 base，±4~8%）：sharp 殺手/tough 壁壘/vital 血牛——同職業同種族仍有手感差
//   base 為職業標準值 × 個體風味；種族與職業修正都在 deriveStats 套用，不要手動摻進 base。
//
// ══ 種族簽名效果值（差異化，不同質化）══
//   同型效果，種族簽名版數值最高：妖＝吸血/竊能、機械＝護盾、精靈＝集氣/迴避、
//   獸＝狂暴/低血觸發、不死＝重傷/亡者之勢、神＝治療增幅、人＝系列協同 buff、龍＝裸三圍。
//
// ══ 輔助範圍原則（群輔效益最高，必須稀缺）══
//   範圍越窄數值越高：自身 ＞ 單體 ＞ 直排/前後排 ＞ 條件群體（種族/屬性/系列）＞ 全隊。
//   全隊無條件 buff 是最貴的設計，一種效果最多一個「全隊版」承載者，其餘走窄範圍。
//
// attackStyle：普攻動畫型態 'melee'（突進揮擊）/ 'ranged'（原地發射光彈）；
//   未標時退回職業判定（support=ranged、其餘 melee）。純演出欄位，不影響數值。

export const CARDS = {
  // ---- 火 ----
  ifrit: { id: 'ifrit', name: '炎獄魔將', element: 'fire', class: 'dps', attackStyle: 'melee', race: '妖', series: ['炎之眷屬'], base: { hp: 495, atk: 95, def: 38 }, growth: { hp: 54, atk: 11, def: 4 }, passives: [{ when: { selfHpBelow: 0.5 }, target: 'self', effects: [{ stat: 'atk', op: 'mul', value: 1.3 }] }] },
  emberguard: { id: 'emberguard', name: '熔岩守衛', element: 'fire', class: 'tank', attackStyle: 'melee', race: '機械', series: ['炎之眷屬', '守護者'], base: { hp: 730, atk: 55, def: 79 }, growth: { hp: 82, atk: 6, def: 9 }, passives: [{ target: 'allAllies', targetWhere: { series: '守護者' }, effects: [{ stat: 'def', op: 'mul', value: 1.15 }] }] },

  // ---- 風 ----
  zephyr: { id: 'zephyr', name: '疾風劍客', element: 'wind', class: 'dps', attackStyle: 'melee', race: '人', series: ['疾風'], base: { hp: 495, atk: 95, def: 38 }, growth: { hp: 54, atk: 11, def: 4 }, passives: [{ target: 'self', effects: [{ stat: 'atk', op: 'mul', basePct: 0.04, perCountOf: { side: 'allies', where: { series: '疾風' } } }] }] },
  galewind: { id: 'galewind', name: '風語祭司', element: 'wind', class: 'support', attackStyle: 'ranged', race: '人', series: ['疾風', '聖歌隊'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'allAllies', targetWhere: { element: 'wind' }, effects: [{ stat: 'energyGain', op: 'mul', value: 1.15 }] }] },

  // ---- 水 ----
  tidecaller: { id: 'tidecaller', name: '潮汐術士', element: 'water', class: 'dps', attackStyle: 'ranged', race: '人', series: ['潮汐'], base: { hp: 495, atk: 95, def: 38 }, growth: { hp: 54, atk: 11, def: 4 }, passives: [{ target: 'self', effects: [{ stat: 'atk', op: 'mul', basePct: 0.04, perCountOf: { side: 'allies', where: { element: 'water' } } }] }] },
  aegis: { id: 'aegis', name: '深海壁壘', element: 'water', class: 'tank', attackStyle: 'melee', race: '龍', series: ['潮汐', '守護者'], base: { hp: 774, atk: 58, def: 70 }, growth: { hp: 87, atk: 6, def: 8 }, passives: [{ target: 'allAllies', effects: [{ stat: 'def', op: 'mul', value: 1.1 }] }] },

  // ---- 光 ----
  seraph: { id: 'seraph', name: '聖光天使', element: 'light', class: 'support', attackStyle: 'ranged', race: '神', series: ['聖歌隊', '光輝'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'allAllies', targetWhere: { series: '聖歌隊' }, effects: [{ stat: 'atk', op: 'mul', value: 1.15 }] }] },
  dawnblade: { id: 'dawnblade', name: '曙光劍士', element: 'light', class: 'dps', attackStyle: 'melee', race: '人', series: ['光輝'], base: { hp: 495, atk: 95, def: 38 }, growth: { hp: 54, atk: 11, def: 4 }, passives: [{ when: { alliesAtLeast: { count: 2, where: { series: '光輝' } } }, target: 'self', effects: [{ stat: 'atk', op: 'mul', value: 1.2 }] }] },

  // ---- 暗 ----
  nightreaper: { id: 'nightreaper', name: '暗影收割者', element: 'dark', class: 'dps', attackStyle: 'melee', race: '不死', series: ['影之眷屬'], base: { hp: 475, atk: 101, def: 38 }, growth: { hp: 52, atk: 12, def: 4 }, passives: [{ target: 'self', effects: [{ stat: 'atk', op: 'mul', basePct: 0.05, perCountOf: { side: 'allies', where: { race: '不死' } } }] }] },
  gravewarden: { id: 'gravewarden', name: '幽冥守墓人', element: 'dark', class: 'tank', attackStyle: 'melee', race: '不死', series: ['影之眷屬', '守護者'], base: { hp: 774, atk: 58, def: 70 }, growth: { hp: 87, atk: 6, def: 8 }, passives: [{ target: 'allAllies', targetWhere: { race: '不死' }, effects: [{ stat: 'def', op: 'mul', value: 1.15 }] }] },

  /* ================= 測試角色池（40 名）=================
     主動技見 skills.js 同名對應；被動涵蓋：血線觸發（selfHpBelow）、
     隊伍組成條件（alliesAtLeast）、依場上單位數成長（perCountOf）、全隊光環。 */

  // ---- 火（+8）----
  cinderblade: { id: 'cinderblade', name: '燼刃劍豪', element: 'fire', class: 'dps', attackStyle: 'melee', race: '人', series: ['燼火'], base: { hp: 495, atk: 95, def: 38 }, growth: { hp: 54, atk: 11, def: 4 }, passives: [{ when: { selfHpBelow: 0.5 }, target: 'self', effects: [{ stat: 'critChance', op: 'add', value: 0.15 }] }] },
  pyrelord: { id: 'pyrelord', name: '焚天梟雄', element: 'fire', class: 'dps', attackStyle: 'ranged', race: '妖', series: ['燼火', '炎之眷屬'], base: { hp: 495, atk: 95, def: 38 }, growth: { hp: 54, atk: 11, def: 4 }, passives: [{ target: 'self', effects: [{ stat: 'atk', op: 'mul', basePct: 0.04, perCountOf: { side: 'allies', where: { element: 'fire' } } }] }] },
  ashpriest: { id: 'ashpriest', name: '餘燼祭司', element: 'fire', class: 'support', attackStyle: 'ranged', race: '人', series: ['燼火', '聖歌隊'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'allAllies', targetWhere: { series: '燼火' }, effects: [{ stat: 'atk', op: 'mul', value: 1.12 }] }] },
  magmaturtle: { id: 'magmaturtle', onEnter: { weather: 'sunny' }, name: '熔殼巨龜', element: 'fire', class: 'tank', attackStyle: 'melee', race: '獸', series: ['守護者'], base: { hp: 730, atk: 55, def: 79 }, growth: { hp: 82, atk: 6, def: 9 }, passives: [{ when: { selfHpBelow: 0.4 }, target: 'self', effects: [{ stat: 'def', op: 'mul', value: 1.4 }] }] },
  flarearcher: { id: 'flarearcher', name: '烈焰遊俠', element: 'fire', class: 'dps', attackStyle: 'ranged', race: '精靈', series: ['獵團'], base: { hp: 475, atk: 101, def: 38 }, growth: { hp: 52, atk: 12, def: 4 }, passives: [{ target: 'self', effects: [{ stat: 'atk', op: 'mul', basePct: 0.03, perCountOf: { side: 'enemies' } }] }] },
  emberwitch: { id: 'emberwitch', name: '燼火魔女', element: 'fire', class: 'dps', attackStyle: 'ranged', race: '人', series: ['燼火'], base: { hp: 495, atk: 95, def: 38 }, growth: { hp: 54, atk: 11, def: 4 }, passives: [{ target: 'self', effects: [{ stat: 'dmgDealt', op: 'mul', basePct: 0.06, perCountOf: { side: 'enemies', where: { element: 'wind' } } }] }] },
  warbanner: { id: 'warbanner', name: '戰旗軍魂', element: 'fire', class: 'support', attackStyle: 'melee', race: '不死', series: ['鐵壁'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'allAllies', effects: [{ stat: 'atk', op: 'mul', value: 1.05 }] }], triggers: [{ name: '軍魂不滅', on: 'death', who: 'ally', effects: [{ stat: 'atk', type: 'buff', op: 'mul', value: 1.1, duration: 2, scope: 'allAllies' }] }] }, // 觸發示範：隊友倒下→全軍振奮
  redlion: { id: 'redlion', name: '赤獅騎士', element: 'fire', class: 'tank', attackStyle: 'melee', race: '人', series: ['鐵壁'], base: { hp: 730, atk: 58, def: 73 }, growth: { hp: 82, atk: 6, def: 8 }, passives: [{ when: { alliesAtLeast: { count: 2, where: { series: '鐵壁' } } }, target: 'self', effects: [{ stat: 'dmgTaken', op: 'mul', value: 0.85 }] }] },

  // ---- 風（+8）----
  stormblade: { id: 'stormblade', name: '蒼雷劍聖', element: 'wind', class: 'dps', attackStyle: 'melee', race: '人', series: ['蒼雷'], base: { hp: 475, atk: 101, def: 38 }, growth: { hp: 52, atk: 12, def: 4 }, passives: [{ when: { selfHpBelow: 0.5 }, target: 'self', effects: [{ stat: 'atk', op: 'mul', value: 1.25 }] }] },
  galeninja: { id: 'galeninja', name: '風隱忍者', element: 'wind', class: 'dps', attackStyle: 'melee', race: '人', series: ['疾風'], base: { hp: 475, atk: 101, def: 38 }, growth: { hp: 52, atk: 12, def: 4 }, passives: [{ target: 'self', effects: [{ stat: 'atk', op: 'mul', basePct: 0.03, perCountOf: { side: 'allies', where: { class: 'dps' } } }] }] },
  tempesthawk: { id: 'tempesthawk', name: '暴風鷹匠', element: 'wind', class: 'dps', attackStyle: 'ranged', race: '精靈', series: ['獵團', '疾風'], base: { hp: 495, atk: 95, def: 38 }, growth: { hp: 54, atk: 11, def: 4 }, passives: [{ when: { alliesAtLeast: { count: 2, where: { series: '獵團' } } }, target: 'self', effects: [{ stat: 'critChance', op: 'add', value: 0.12 }] }] },
  windsister: { id: 'windsister', name: '風之雙子', element: 'wind', class: 'support', attackStyle: 'ranged', race: '精靈', series: ['星詠'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'allAllies', targetWhere: { race: '精靈' }, effects: [{ stat: 'energyGain', op: 'mul', value: 1.2 }] }] },
  thundertotem: { id: 'thundertotem', onEnter: { terrain: 'surge' }, name: '雷圖騰師', element: 'wind', class: 'support', attackStyle: 'ranged', race: '獸', series: ['大地'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'allEnemies', effects: [{ stat: 'def', op: 'mul', value: 0.95 }] }] },
  skylancer: { id: 'skylancer', onEnter: { weather: 'gale' }, name: '天嵐槍騎', element: 'wind', class: 'dps', attackStyle: 'melee', race: '龍', series: ['蒼雷'], base: { hp: 495, atk: 95, def: 38 }, growth: { hp: 54, atk: 11, def: 4 }, passives: [{ target: 'self', effects: [{ stat: 'atk', op: 'mul', basePct: 0.05, perCountOf: { side: 'allies', where: { race: '龍' } } }] }] },
  grovekeeper: { id: 'grovekeeper', name: '林守巨熊', element: 'wind', class: 'tank', attackStyle: 'melee', race: '獸', series: ['秘林', '守護者'], base: { hp: 774, atk: 58, def: 70 }, growth: { hp: 87, atk: 6, def: 8 }, passives: [{ target: 'allAllies', effects: [{ stat: 'def', op: 'mul', value: 1.08 }] }] },
  zephyrmonk: { id: 'zephyrmonk', name: '迅風武僧', element: 'wind', class: 'dps', attackStyle: 'melee', race: '人', series: ['疾風'], base: { hp: 495, atk: 95, def: 38 }, growth: { hp: 54, atk: 11, def: 4 }, passives: [{ target: 'self', effects: [{ stat: 'energyGain', op: 'mul', value: 1.15 }] }] },

  // ---- 水（+8）----
  frostmage: { id: 'frostmage', name: '霜語法師', element: 'water', class: 'dps', attackStyle: 'ranged', race: '人', series: ['霜語'], base: { hp: 495, atk: 95, def: 38 }, growth: { hp: 54, atk: 11, def: 4 }, passives: [{ when: { alliesAtLeast: { count: 2, where: { series: '霜語' } } }, target: 'self', effects: [{ stat: 'atk', op: 'mul', value: 1.2 }] }] },
  tidesinger: { id: 'tidesinger', name: '潮音歌者', element: 'water', class: 'support', attackStyle: 'ranged', race: '人', series: ['潮汐', '星詠'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'allAllies', targetWhere: { series: '潮汐' }, effects: [{ stat: 'dmgTaken', op: 'mul', value: 0.94 }] }] },
  glacierknight: { id: 'glacierknight', name: '冰川重騎', element: 'water', class: 'tank', attackStyle: 'melee', race: '人', series: ['霜語', '鐵壁'], base: { hp: 730, atk: 55, def: 79 }, growth: { hp: 82, atk: 6, def: 9 }, passives: [{ when: { alliesAtLeast: { count: 2, where: { series: '霜語' } } }, target: 'allAllies', effects: [{ stat: 'def', op: 'mul', value: 1.06 }] }] },
  abysshunter: { id: 'abysshunter', name: '深淵獵手', element: 'water', class: 'dps', attackStyle: 'melee', race: '妖', series: ['深淵'], base: { hp: 495, atk: 95, def: 38 }, growth: { hp: 54, atk: 11, def: 4 }, passives: [{ target: 'self', effects: [{ stat: 'atk', op: 'mul', basePct: 0.04, perCountOf: { side: 'allies', where: { series: '深淵' } } }] }] },
  mistdancer: { id: 'mistdancer', name: '霧舞者', element: 'water', class: 'dps', attackStyle: 'melee', race: '精靈', series: ['霜語'], base: { hp: 475, atk: 101, def: 38 }, growth: { hp: 52, atk: 12, def: 4 }, passives: [{ when: { selfHpBelow: 0.5 }, target: 'self', effects: [{ stat: 'dmgTaken', op: 'mul', value: 0.8 }] }] },
  coralshaman: { id: 'coralshaman', name: '珊瑚祭巫', element: 'water', class: 'support', attackStyle: 'ranged', race: '獸', series: ['潮汐'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'allAllies', targetWhere: { race: '獸' }, effects: [{ stat: 'atk', op: 'mul', value: 1.15 }] }] },
  leviathan: { id: 'leviathan', onEnter: { weather: 'rain' }, name: '滄海巨蛇', element: 'water', class: 'dps', attackStyle: 'melee', race: '龍', series: ['深淵', '潮汐'], base: { hp: 525, atk: 95, def: 36 }, growth: { hp: 57, atk: 11, def: 4 }, passives: [{ when: { selfHpBelow: 0.6 }, target: 'self', effects: [{ stat: 'dmgDealt', op: 'mul', value: 1.15 }] }] },
  pearlguard: { id: 'pearlguard', name: '珠貝衛士', element: 'water', class: 'tank', attackStyle: 'melee', race: '機械', series: ['潮汐', '守護者'], base: { hp: 730, atk: 58, def: 73 }, growth: { hp: 82, atk: 6, def: 8 }, passives: [{ target: 'allAllies', targetWhere: { race: '機械' }, effects: [{ stat: 'dmgTaken', op: 'mul', value: 0.85 }] }] },

  // ---- 光（+8）----
  paladin: { id: 'paladin', name: '晨曦聖騎', element: 'light', class: 'tank', attackStyle: 'melee', race: '人', series: ['光輝', '鐵壁'], base: { hp: 730, atk: 58, def: 73 }, growth: { hp: 82, atk: 6, def: 8 }, passives: [{ target: 'allAllies', effects: [{ stat: 'def', op: 'mul', value: 1.1 }] }] },
  lightweaver: { id: 'lightweaver', name: '織光晶靈', element: 'light', class: 'support', attackStyle: 'ranged', race: '精靈', series: ['星詠', '光輝'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'allAllies', targetWhere: { series: '星詠' }, effects: [{ stat: 'energyGain', op: 'mul', value: 1.15 }] }] },
  suninquisitor: { id: 'suninquisitor', name: '燦陽審判官', element: 'light', class: 'dps', attackStyle: 'melee', race: '人', series: ['光輝'], base: { hp: 495, atk: 95, def: 38 }, growth: { hp: 54, atk: 11, def: 4 }, passives: [{ target: 'self', effects: [{ stat: 'atk', op: 'mul', basePct: 0.08, perCountOf: { side: 'enemies', where: { race: '不死' } } }] }] },
  dawnharpist: { id: 'dawnharpist', name: '曙光琴師', element: 'light', class: 'support', attackStyle: 'ranged', race: '人', series: ['聖歌隊', '星詠'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'allAllies', effects: [{ stat: 'energyGain', op: 'mul', value: 1.08 }] }] },
  radiantgolem: { id: 'radiantgolem', name: '輝光魔像', element: 'light', class: 'tank', attackStyle: 'melee', race: '機械', series: ['守護者'], base: { hp: 730, atk: 55, def: 79 }, growth: { hp: 82, atk: 6, def: 9 }, passives: [{ when: { selfHpBelow: 0.35 }, target: 'self', effects: [{ stat: 'dmgTaken', op: 'mul', value: 0.75 }] }] },
  stargazer: { id: 'stargazer', name: '觀星者', element: 'light', class: 'dps', attackStyle: 'ranged', race: '人', series: ['星詠'], base: { hp: 475, atk: 101, def: 38 }, growth: { hp: 52, atk: 12, def: 4 }, passives: [{ when: { alliesAtLeast: { count: 3, where: { series: '星詠' } } }, target: 'allAllies', effects: [{ stat: 'critChance', op: 'add', value: 0.08 }] }] },
  holyfencer: { id: 'holyfencer', name: '聖銀劍士', element: 'light', class: 'dps', attackStyle: 'melee', race: '人', series: ['光輝'], base: { hp: 475, atk: 101, def: 38 }, growth: { hp: 52, atk: 12, def: 4 }, passives: [{ when: { alliesAtLeast: { count: 2, where: { series: '光輝' } } }, target: 'self', effects: [{ stat: 'critChance', op: 'add', value: 0.1 }] }] },
  lumenfox: { id: 'lumenfox', name: '流光靈狐', element: 'light', class: 'support', attackStyle: 'ranged', race: '妖', series: ['星詠'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'allAllies', targetWhere: { element: 'light' }, effects: [{ stat: 'atk', op: 'mul', value: 1.12 }] }] },

  // ---- 暗（+8）----
  plaguelord: { id: 'plaguelord', name: '瘟疫領主', element: 'dark', class: 'dps', attackStyle: 'ranged', race: '不死', series: ['影之眷屬'], base: { hp: 495, atk: 95, def: 38 }, growth: { hp: 54, atk: 11, def: 4 }, passives: [{ target: 'self', effects: [{ stat: 'atk', op: 'mul', basePct: 0.05, perCountOf: { side: 'allies', where: { race: '不死' } } }] }] },
  shadowpriest: { id: 'shadowpriest', name: '暗影祭司', element: 'dark', class: 'support', attackStyle: 'ranged', race: '人', series: ['深淵'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'allAllies', targetWhere: { series: '深淵' }, effects: [{ stat: 'atk', op: 'mul', value: 1.12 }] }] },
  boneknight: { id: 'boneknight', onEnter: { terrain: 'erosion' }, name: '白骨騎士', element: 'dark', class: 'tank', attackStyle: 'melee', race: '不死', series: ['影之眷屬', '鐵壁'], base: { hp: 730, atk: 58, def: 73 }, growth: { hp: 82, atk: 6, def: 8 }, passives: [{ when: { selfHpBelow: 0.35 }, target: 'self', effects: [{ stat: 'dmgTaken', op: 'mul', value: 0.8 }] }] },
  nightmare: { id: 'nightmare', name: '夢魘', element: 'dark', class: 'dps', attackStyle: 'melee', race: '妖', series: ['深淵'], base: { hp: 495, atk: 95, def: 38 }, growth: { hp: 54, atk: 11, def: 4 }, passives: [{ target: 'self', effects: [{ stat: 'atk', op: 'mul', basePct: 0.06, perCountOf: { side: 'allies', where: { race: '妖' } } }] }] },
  voidcaller: { id: 'voidcaller', name: '虛空喚者', element: 'dark', class: 'dps', attackStyle: 'ranged', race: '人', series: ['深淵'], base: { hp: 495, atk: 95, def: 38 }, growth: { hp: 54, atk: 11, def: 4 }, passives: [{ when: { alliesAtLeast: { count: 2, where: { series: '深淵' } } }, target: 'self', effects: [{ stat: 'dmgDealt', op: 'mul', value: 1.12 }] }] },
  cryptwidow: { id: 'cryptwidow', name: '墓穴寡婦', element: 'dark', class: 'dps', attackStyle: 'melee', race: '不死', series: ['影之眷屬'], base: { hp: 475, atk: 101, def: 38 }, growth: { hp: 52, atk: 12, def: 4 }, passives: [{ target: 'self', effects: [{ stat: 'critChance', op: 'add', valuePer: 0.03, perCountOf: { side: 'allies', where: { race: '不死' } } }] }], triggers: [{ name: '死神收割', on: 'death', who: 'enemy', effects: [{ type: 'energy', amount: 25, scope: 'self' }] }] }, // 觸發示範：敵人倒下→收割能量
  duskwarden: { id: 'duskwarden', name: '薄暮守望', element: 'dark', class: 'tank', attackStyle: 'melee', race: '精靈', series: ['秘林'], base: { hp: 730, atk: 58, def: 73 }, growth: { hp: 82, atk: 6, def: 8 }, passives: [{ target: 'allAllies', targetWhere: { race: '精靈' }, effects: [{ stat: 'dmgTaken', op: 'mul', value: 0.92 }] }] },
  soulorganist: { id: 'soulorganist', name: '亡魂琴師', element: 'dark', class: 'support', attackStyle: 'ranged', race: '不死', series: ['影之眷屬', '聖歌隊'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'allAllies', effects: [{ stat: 'atk', op: 'mul', basePct: 0.02, perCountOf: { side: 'allies', where: { race: '不死' } } }] }] },

  /* ================= 環境使（6 名）=================
     設計原則：開天氣/場地是戰略級效果 → 專職角色承載，技能＝開環境＋至多一個輕量副效果。
     組隊代價明確：帶環境使＝犧牲一個戰鬥位換整場環境。 */
  sunherald: { id: 'sunherald', name: '曦喚祭司', element: 'fire', class: 'support', attackStyle: 'ranged', race: '人', series: ['燼火', '聖歌隊'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'allAllies', targetWhere: { element: 'fire' }, effects: [{ stat: 'atk', op: 'mul', value: 1.08 }] }] },
  rainherald: { id: 'rainherald', name: '喚雨巫女', element: 'water', class: 'support', attackStyle: 'ranged', race: '人', series: ['潮汐', '星詠'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'allAllies', targetWhere: { element: 'water' }, effects: [{ stat: 'atk', op: 'mul', value: 1.08 }] }] },
  galeherald: { id: 'galeherald', name: '喚風行者', element: 'wind', class: 'support', attackStyle: 'ranged', race: '精靈', series: ['疾風', '星詠'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'allAllies', targetWhere: { element: 'wind' }, effects: [{ stat: 'atk', op: 'mul', value: 1.08 }] }] },
  lumenvessel: { id: 'lumenvessel', name: '聚能星使', element: 'light', class: 'support', attackStyle: 'ranged', race: '神', series: ['星詠', '光輝'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'allAllies', targetWhere: { element: 'light' }, effects: [{ stat: 'energyGain', op: 'mul', value: 1.08 }] }] },
  voidshade: { id: 'voidshade', name: '蝕域行者', element: 'dark', class: 'dps', attackStyle: 'melee', race: '不死', series: ['深淵', '影之眷屬'], base: { hp: 495, atk: 95, def: 38 }, growth: { hp: 54, atk: 11, def: 4 }, passives: [{ when: { selfHpBelow: 0.5 }, target: 'self', effects: [{ stat: 'dmgDealt', op: 'mul', value: 1.15 }] }] },
  mireweaver: { id: 'mireweaver', name: '沼澤織者', element: 'dark', class: 'support', attackStyle: 'ranged', race: '妖', series: ['影之眷屬'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'self', effects: [{ stat: 'dmgTaken', op: 'mul', value: 0.9 }] }] },

  /* ================= 機制專職（4 名）：迴避／命中／惡夢／竊能 =================
     同環境使原則：戰略級機制由專職角色承載，一人一招、定位單一。 */
  veilwalker: { id: 'veilwalker', name: '蜃影舞姬', element: 'wind', class: 'support', attackStyle: 'ranged', race: '精靈', series: ['疾風', '星詠'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'self', effects: [{ stat: 'dodge', op: 'add', value: 0.1 }] }] },
  hawkoracle: { id: 'hawkoracle', name: '鷹眼哨衛', element: 'light', class: 'support', attackStyle: 'ranged', race: '人', series: ['獵團', '光輝'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'allAllies', effects: [{ stat: 'accuracy', op: 'add', value: 0.05 }] }] },
  terrorweaver: { id: 'terrorweaver', name: '惡夢織主', element: 'dark', class: 'support', attackStyle: 'ranged', race: '妖', series: ['深淵', '影之眷屬'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'allAllies', targetWhere: { race: '妖' }, effects: [{ stat: 'atk', op: 'mul', value: 1.1 }] }] },
  fluxreaver: { id: 'fluxreaver', name: '奪流魅影', element: 'dark', class: 'dps', attackStyle: 'melee', race: '妖', series: ['深淵'], base: { hp: 495, atk: 95, def: 38 }, growth: { hp: 54, atk: 11, def: 4 }, passives: [{ target: 'self', effects: [{ stat: 'energyGain', op: 'mul', value: 1.1 }] }] },

  /* ================= 種族號令與種族補位（4 名）=================
     種族特色定調（被動與技能圍繞同一個種族語言，不用羈絆系統）：
       人＝系列協同（吃聖歌隊/鐵壁/光輝等系列紅利，不吃種族紅利）
       不死＝亡者之勢（人越死越強；同族數量疊加）    精靈＝靈巧（集氣＋迴避）
       妖＝汲取（吸血/竊能/惡夢）                    獸＝狂暴（低血觸發＋疊怒）
       機械＝護盾工程、龍＝稀有高壓、神＝稀有輔助（人數不足，之後擴編） */
  bonemarshal: { id: 'bonemarshal', name: '亡骨元帥', element: 'dark', class: 'support', attackStyle: 'ranged', race: '不死', series: ['影之眷屬', '鐵壁'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'self', effects: [{ stat: 'atk', op: 'mul', basePct: 0.12, perCountOf: { side: 'allies', dead: true } }] }] }, // 亡者之勢：每名陣亡隊友自身攻擊 +12%
  sylvanqueen: { id: 'sylvanqueen', name: '翠語女王', element: 'wind', class: 'support', attackStyle: 'ranged', race: '精靈', series: ['秘林', '星詠'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'allAllies', targetWhere: { race: '精靈' }, effects: [{ stat: 'atk', op: 'mul', value: 1.08 }] }] },
  abysstyrant: { id: 'abysstyrant', name: '魔淵僭主', element: 'dark', class: 'tank', attackStyle: 'melee', race: '妖', series: ['深淵'], base: { hp: 774, atk: 58, def: 70 }, growth: { hp: 87, atk: 6, def: 8 }, passives: [{ target: 'allAllies', targetWhere: { race: '妖' }, effects: [{ stat: 'dmgTaken', op: 'mul', value: 0.95 }] }] },
  rageclaw: { id: 'rageclaw', name: '裂爪狂熊', element: 'fire', class: 'dps', attackStyle: 'melee', race: '獸', series: ['大地'], base: { hp: 495, atk: 95, def: 38 }, growth: { hp: 54, atk: 11, def: 4 }, passives: [{ when: { selfHpBelow: 0.5 }, target: 'self', effects: [{ stat: 'critChance', op: 'add', value: 0.2 }] }] },
  // 治療量機制的種族專屬載體：增幅＝神（稀有輔助）、重傷＝不死（亡者詛咒）
  dawnmother: { id: 'dawnmother', name: '霖光聖母', element: 'light', class: 'support', attackStyle: 'ranged', race: '神', series: ['光輝', '聖歌隊'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'allAllies', effects: [{ stat: 'healTaken', op: 'mul', value: 1.05 }] }] },
  knellwitch: { id: 'knellwitch', name: '喪鐘咒師', element: 'dark', class: 'support', attackStyle: 'ranged', race: '不死', series: ['影之眷屬'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'allEnemies', effects: [{ stat: 'healTaken', op: 'mul', value: 0.95 }] }] },

  /* ================= 機械隊／龍隊補位（4 名）＝種族隊拼圖最後兩塊 ================= */
  ironcannon: { id: 'ironcannon', name: '鐵殼砲台', element: 'fire', class: 'dps', attackStyle: 'ranged', race: '機械', series: ['鐵壁'], base: { hp: 495, atk: 95, def: 38 }, growth: { hp: 54, atk: 11, def: 4 }, passives: [{ when: { alliesAtLeast: { count: 2, where: { race: '機械' } } }, target: 'self', effects: [{ stat: 'atk', op: 'mul', value: 1.25 }] }] }, // 機械編隊：同構火控連線
  gearmedic: { id: 'gearmedic', name: '齒輪醫官', element: 'light', class: 'support', attackStyle: 'ranged', race: '機械', series: ['守護者'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'allAllies', targetWhere: { race: '機械' }, effects: [{ stat: 'def', op: 'mul', value: 1.12 }] }] },
  drakebastion: { id: 'drakebastion', name: '龍晶壁壘', element: 'water', class: 'tank', attackStyle: 'melee', race: '龍', series: ['潮汐', '守護者'], base: { hp: 730, atk: 55, def: 79 }, growth: { hp: 82, atk: 6, def: 9 }, passives: [{ when: { selfHpBelow: 0.5 }, target: 'self', effects: [{ stat: 'def', op: 'mul', value: 1.3 }] }] },
  dragonoracle: { id: 'dragonoracle', name: '龍語咏者', element: 'wind', class: 'support', attackStyle: 'ranged', race: '龍', series: ['蒼雷', '星詠'], base: { hp: 510, atk: 72, def: 44 }, growth: { hp: 56, atk: 8, def: 4 }, passives: [{ target: 'allAllies', targetWhere: { race: '龍' }, effects: [{ stat: 'atk', op: 'mul', value: 1.08 }] }] },
};

export const CARD_LIST = Object.values(CARDS);

// 稀有卡池（抽卡可能抽到的角色）。MVP 全部角色都可抽。
export const GACHA_CARD_POOL = CARD_LIST.map((c) => c.id);

// 玩家初始隊伍（首次進遊戲送的 5 張），確保能立即開打。
export const STARTER_CARD_IDS = ['emberguard', 'zephyr', 'tidecaller', 'seraph', 'nightreaper'];
