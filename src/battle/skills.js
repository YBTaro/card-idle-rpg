// src/battle/skills.js
// 技能即資料：SKILLS registry + castSkill。普攻與傷害共用 effects.dealDamage。
import { singleEnemyByColumn, lowestHpAlly, SELECTORS } from './targeting.js';
import { dealDamage, resolveScope, applyEffect, rollHit, healAmount } from './effects.js';

// 技能資料（占位平衡值）。所有 power = % × 施放者 effAtk（見 spec 數值約定）。
export const SKILLS = {
  burst: {
    name: '爆發',
    target: 'singleEnemyByColumn',
    effects: [{ type: 'damage', mult: 2.6, scope: 'target' }],
  },
  guard: {
    name: '守護',
    effects: [
      { type: 'buff', stat: 'dmgTaken', op: 'mul', value: 0.5, duration: 2, key: 'guard', scope: 'allAllies' },
      { type: 'heal', power: 2.0, scope: 'self' },
    ],
  },
  heal: {
    name: '治癒',
    target: 'lowestHpAlly',
    effects: [
      { type: 'heal', power: 3.0, scope: 'target' },
      { type: 'heal', power: 1.2, scope: 'alliesExceptTarget' },
    ],
  },
  infernoNova: { name: '焚天', target: 'enemyFrontRow', effects: [
    { type: 'damage', mult: 1.8, scope: 'target' },
    { type: 'dot', power: 0.3, element: 'fire', duration: 2, scope: 'target' }, // 主傷在直擊，餘燼是配菜（灼燒係數依角色定位差異化）
  ]},
  moltenBulwark: { name: '熔壁', target: 'enemyFrontRow', effects: [ // 定位：灼熱裝甲坦——貼近我的人更怕火
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'buff', stat: 'dotTaken', op: 'mul', value: 1.3, duration: 2, scope: 'target' },
  ]},
  galeAssault: { name: '疾襲', target: 'enemyBackRow', effects: [ // 斬幕：突入後排並撕掉增益
    { type: 'damage', mult: 2.0, scope: 'target' },
    { type: 'dispel', what: 'buff', count: 1, scope: 'target' },
  ]},
  windsong: { name: '風歌', effects: [ // 定位：全隊集氣引擎（治療歸和風，集氣歸風歌）
    { type: 'buff', stat: 'energyGain', op: 'mul', value: 1.5, duration: 3, scope: 'allAllies' },
  ]},
  tidalPrison: { name: '潮牢', target: 'enemyColumn', effects: [
    { type: 'damage', mult: 1.6, scope: 'target' },
    { type: 'control', control: 'freeze', duration: 1, scope: 'target' }, // 困於潮牢：凍結（沉默是光屬專屬，水用凍結）
  ]},
  dragonGuard: { name: '龍護', effects: [
    { type: 'buff', stat: 'dmgTaken', op: 'mul', value: 0.7, duration: 2, key: 'guard', scope: 'allAllies' },
    { type: 'shield', power: 2.0, duration: 3, scope: 'self' },
  ]},
  radiantGrace: { name: '聖恩', target: 'lowestHpAlly', effects: [
    { type: 'heal', power: 4.0, scope: 'target' }, // 定位：全遊戲最大單體治療（暴擊 buff 歸晶輝）
  ]},
  dawnStrike: { name: '曙擊', target: 'singleEnemyByColumn', effects: [ // 定位：屠暗劍
    { type: 'damage', mult: 2.8, scope: 'target' },
    { type: 'damage', mult: 1.0, scope: 'target', where: { element: 'dark' } },
  ]},
  shadowExecute: { name: '影誅', target: 'singleEnemyByColumn', effects: [
    { type: 'damage', mult: 3.0, scope: 'target' }, // 全遊戲最高單體倍率＝它的簽名
  ]},
  gravePact: { name: '墓約', effects: [
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'buff', stat: 'atk', op: 'mul', value: 0.7, duration: 2, scope: 'allEnemies' },
  ]},

  /* ================= 測試角色技能池（40 招，涵蓋業界常見原型） =================
     多段連擊 / 可疊層 DoT（stackable）/ 剋種族追打（where）/ 易傷 / 緩速（集氣壓制）/
     群體充能 / 跨技能互斥減傷罩（key:'guard'）/ 斬殺型高倍率 / 控制鏈 / 攻守交換 */

  // ---- 火 ----
  cinderCombo: { name: '燼滅', target: 'singleEnemyByColumn', effects: [ // 連擊收割：雙斬＋處決＋餘燼
    { type: 'damage', mult: 1.2, scope: 'target' },
    { type: 'damage', mult: 1.2, scope: 'target' },
    { type: 'damage', mult: 0.8, scope: 'target', executeBelow: 0.3, executeBonus: 2.0 },
    { type: 'dot', power: 0.35, element: 'fire', duration: 2, scope: 'target', chance: 0.7 }, // 70% 燃燒 2 回合（同人再上＝回合數疊加）
  ]},
  karmicFire: { name: '業火', target: 'enemyFrontRow', effects: [
    { type: 'damage', mult: 1.5, scope: 'target' },
    { type: 'dot', power: 0.45, element: 'fire', duration: 2, scope: 'target', stackable: true }, // 可疊層灼燒——灼燒流本命，單層最痛
  ]},
  emberWarmth: { name: '餘溫', effects: [ // 定位：延燒輔助（淨化歸潮頌）——治療收窄前排、數值加厚
    { type: 'heal', power: 1.5, scope: 'frontAllies' },
    { type: 'extend', what: 'dot', element: 'fire', turns: 1, scope: 'allEnemies' }, // 餘燼不熄：敵方灼燒 +1 回合
  ]},
  shellAegis: { name: '殼護', effects: [ // 定位：荊棘反傷坦（厚盾歸冰甲）
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'thorns', pct: 0.5, duration: 2, scope: 'self' }, // 獸＝蠻力反撲值最高
  ]},
  flameShift: { name: '引火', target: 'enemyColumn', effects: [ // 屬性轉化：敵直排變風屬 → 火隊穩吃剋制
    { type: 'damage', mult: 1.4, scope: 'target' },
    { type: 'transmute', duration: 2, scope: 'target' },
  ]},
  detonate: { name: '爆燃', target: 'enemyColumn', effects: [
    { type: 'detonateDot', element: 'fire', mult: 1.0, scope: 'target' }, // 先引爆舊灼燒（每跳×剩餘回合一次結算）
    { type: 'damage', mult: 1.7, scope: 'target', ignoreDef: true }, // 無視防禦
    { type: 'dot', power: 0.4, element: 'fire', duration: 2, scope: 'target' }, // 再點新火
  ]},
  warBanner: { name: '軍威', effects: [ // 定位：攻擊號令（群體充能歸晨曲）
    { type: 'buff', stat: 'atk', op: 'mul', value: 1.2, duration: 2, scope: 'allAllies' },
    { type: 'buff', stat: 'dmgTaken', op: 'mul', value: 0.88, duration: 2, scope: 'allAllies', where: { series: '鐵壁' } }, // 鐵壁軍團減傷
  ]},
  lionRoar: { name: '獅吼', effects: [ // 定位：反擊坦（攻擊弱化歸墓約）
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'counter', mult: 0.8, duration: 2, scope: 'self' }, // 反擊姿態
  ]},

  // ---- 風 ----
  thunderCut: { name: '雷切', target: 'singleEnemyByColumn', effects: [
    { type: 'damage', mult: 2.4, scope: 'target' },
    { type: 'buff', stat: 'energyGain', op: 'mul', value: 1.3, duration: 2, scope: 'self' }, // 拔刀後蓄勢
  ]},
  windShift: { name: '風蝕', target: 'enemyColumn', effects: [ // 屬性轉化：敵直排變水屬 → 風隊穩吃剋制
    { type: 'damage', mult: 1.3, scope: 'target' },
    { type: 'transmute', duration: 2, scope: 'target' },
  ]},
  huntFeather: { name: '獵翎', target: 'enemyBackRow', effects: [
    { type: 'damage', mult: 1.9, scope: 'target' },
    { type: 'buff', stat: 'energyGain', op: 'mul', value: 0.7, duration: 2, scope: 'target' }, // 緩速：壓制集氣
  ]},
  gentleBreeze: { name: '和風', effects: [ // 定位：精靈專屬群奶（無條件全隊治療歸湧泉；條件範圍＝數值更高）
    { type: 'heal', power: 1.8, scope: 'allAllies', where: { race: '精靈' } },
  ]},
  thunderMark: { name: '雷紋', effects: [ // 定位：風屬專屬狀態載體——全體易傷
    { type: 'buff', stat: 'dmgTaken', op: 'mul', value: 1.2, duration: 2, scope: 'allEnemies' },
  ]},
  cloudPiercer: { name: '貫雲', target: 'enemyColumn', effects: [ // 乘風：貫穿直排並鼓舞風屬同袍
    { type: 'damage', mult: 2.0, scope: 'target' },
    { type: 'buff', stat: 'dmgDealt', op: 'mul', value: 1.25, duration: 2, scope: 'allAllies', where: { element: 'wind' } }, // 條件型＞全隊型
  ]},
  forestWard: { name: '林護', effects: [ // 定位：再生坦——前排持續回復（全隊 HoT 歸湧泉；窄範圍＝值更高）
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'hot', power: 0.45, duration: 2, scope: 'frontAllies' },
  ]},
  galeKicks: { name: '連風腿', target: 'singleEnemyByColumn', effects: [ // 亂舞三連腿＋回氣
    { type: 'damage', mult: 0.9, scope: 'target' },
    { type: 'damage', mult: 0.9, scope: 'target' },
    { type: 'damage', mult: 0.9, scope: 'target' },
    { type: 'energy', amount: 20, scope: 'self' },
  ]},

  // ---- 水 ----
  frostThorns: { name: '冰棘', target: 'allEnemies', effects: [ // 水屬專屬：凍結（無法回能）
    { type: 'damage', mult: 1.1, scope: 'target' },
    { type: 'control', control: 'freeze', duration: 2, scope: 'target', chance: 0.3 }, // 30% 全體凍結 2 回合
  ]},
  tideHymn: { name: '潮頌', target: 'lowestHpAlly', effects: [ // 潮洗：深度淨化單一隊友
    { type: 'heal', power: 2.8, scope: 'target' },
    { type: 'dispel', what: 'debuff', scope: 'target' }, // 洗掉全部減益
  ]},
  glacialArmor: { name: '冰甲', effects: [ // 定位：全遊戲最厚自身盾（群體盾歸貝盾）
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'shield', power: 2.8, duration: 3, scope: 'self' },
  ]},
  abyssBite: { name: '淵噬', target: 'singleEnemyByColumn', effects: [ // 定位：吸血獠牙
    { type: 'damage', mult: 2.2, scope: 'target', lifesteal: 0.5 }, // 妖＝汲取值最高
  ]},
  mistShift: { name: '霧化', target: 'enemyColumn', effects: [ // 屬性轉化：敵直排變火屬 → 水隊穩吃剋制（暴雨下再 -20%）
    { type: 'damage', mult: 1.3, scope: 'target' },
    { type: 'transmute', duration: 2, scope: 'target' },
  ]},
  springSurge: { name: '湧泉', effects: [ // 定位：持續回復泉
    { type: 'heal', power: 1.4, scope: 'allAllies' },
    { type: 'hot', power: 0.35, duration: 2, scope: 'allAllies' },
  ]},
  tsunami: { name: '海嘯', target: 'allEnemies', effects: [
    { type: 'damage', mult: 1.35, scope: 'target' }, // 全場大 AoE
    { type: 'damage', mult: 0.7, scope: 'target', where: { element: 'fire' } }, // 水滅火追打
  ]},
  pearlBulwark: { name: '貝盾', effects: [ // 定位：群體護盾（機械同構強化）
    { type: 'shield', power: 1.0, duration: 3, scope: 'allAllies' },
    { type: 'shield', power: 1.5, duration: 3, scope: 'allAllies', where: { race: '機械' } }, // 機械＝護盾值最高
  ]},

  // ---- 光 ----
  sacredShield: { name: '聖盾', effects: [ // 定位：前線聖騎——窄範圍減傷比龍護的全隊版更深
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'buff', stat: 'dmgTaken', op: 'mul', value: 0.65, duration: 2, key: 'guard', scope: 'frontAllies' }, // 與守護/龍護互斥
  ]},
  crystalGleam: { name: '晶輝', effects: [ // 定位：唯一的暴擊增幅器
    { type: 'buff', stat: 'critChance', op: 'add', value: 0.15, duration: 2, scope: 'allAllies' },
    { type: 'buff', stat: 'critMult', op: 'add', value: 0.3, duration: 2, scope: 'allAllies' },
  ]},
  holyVerdict: { name: '審判', target: 'singleEnemyByColumn', effects: [
    { type: 'damage', mult: 2.6, scope: 'target', executeBelow: 0.35, executeBonus: 1.6 }, // 處決
    { type: 'damage', mult: 1.0, scope: 'target', where: { race: '不死' } }, // 剋不死追打
  ]},
  morningSong: { name: '晨曲', effects: [ // 定位：群體充能號角（聖歌隊合唱加成）
    { type: 'energy', amount: 25, scope: 'allAllies' },
    { type: 'energy', amount: 15, scope: 'allAllies', where: { series: '聖歌隊' } },
  ]},
  luminousWall: { name: '聖壁', effects: [ // 定位：自癒坦——扛著扛著自己就回滿了（厚盾歸冰甲）
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'hot', power: 0.8, duration: 2, scope: 'self' },
  ]},
  starfall: { name: '星隕', target: 'enemyBackRow', effects: [
    { type: 'damage', mult: 1.8, scope: 'target' },
    { type: 'control', control: 'silence', duration: 1, scope: 'target', chance: 0.4 }, // 40% 沉默 1 回合（光屬專屬；沉默＝技能與普攻皆封）
  ]},
  silverThrust: { name: '聖刺', target: 'singleEnemyByColumn', effects: [ // 五成機率追刺第三劍
    { type: 'damage', mult: 1.5, scope: 'target' },
    { type: 'damage', mult: 1.5, scope: 'target' },
    { type: 'damage', mult: 1.0, scope: 'target', chance: 0.5 },
  ]},
  foxGlow: { name: '狐光', target: 'lowestHpAlly', effects: [ // 狐火渡氣：單體充能電池
    { type: 'heal', power: 2.2, scope: 'target' },
    { type: 'energy', amount: 30, scope: 'target' },
  ]},

  // ---- 暗 ----
  plagueSpread: { name: '瘟疫', target: 'allEnemies', effects: [ // 定位：全體中毒散布者
    { type: 'damage', mult: 0.8, scope: 'target' },
    { type: 'dot', power: 0.1, basis: 'targetMaxHp', duration: 2, scope: 'target' }, // 全體散布：每跳低（毒係數依角色差異化——面寬毒淺）
  ]},
  mindGnaw: { name: '蝕心', effects: [ // 定位：靈壓領域——戰略級效果獨立承載（同環境技原則）
    { type: 'castDrain', amount: 20, duration: 2, scope: 'self', stackable: true }, // 敵方施法→其餘敵人 -20 能量
  ]},
  boneRampart: { name: '骨牆', effects: [ // 定位：凝咒坦——把敵人身上所有壞事都拖長
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'extend', what: 'negative', turns: 1, scope: 'allEnemies' },
  ]},
  dreamEater: { name: '噬夢', target: 'randomEnemy', effects: [ // 定位：隨機汲取者——吸血又吸氣（緩速歸獵翎）
    { type: 'damage', mult: 2.1, scope: 'target', lifesteal: 0.4 }, // 妖＝汲取值最高
    { type: 'energy', amount: 15, scope: 'self' },
  ]},
  voidBurst: { name: '虛爆', target: 'enemyColumn', effects: [
    { type: 'damage', mult: 1.6, scope: 'target' },
    { type: 'dot', power: 0.14, basis: 'targetMaxHp', duration: 2, scope: 'target' }, // 直排中毒：每跳 14% 最大生命
  ]},
  webBind: { name: '縛絲', target: 'lowestHpEnemy', effects: [ // 補刀型選目標
    { type: 'damage', mult: 1.8, scope: 'target' },
    { type: 'dot', power: 0.18, basis: 'targetMaxHp', duration: 2, scope: 'target', chance: 0.7 }, // 70% 蛛毒（單體補刀＝毒最深：每跳 18% 最大生命）
  ]},
  duskVeil: { name: '暮幕', effects: [ // 定位：遁影奪光坦——入夜奪增益、自身沒入暮色（精靈＝迴避值最高）
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'buff', stat: 'dodge', op: 'add', value: 0.3, duration: 2, scope: 'self' },
    { type: 'dispel', what: 'buff', count: 1, scope: 'allEnemies' },
  ]},
  requiem: { name: '安魂', target: 'deadAlly', effects: [ // 定位：唯一的復活者
    { type: 'revive', power: 0.35, scope: 'targetIncludingDead' },
    { type: 'heal', power: 1.1, scope: 'allAllies' },
  ]},

  /* ================= 環境使專職技（開環境＋至多一個輕量副效果） =================
     設計原則：開天氣/場地＝戰略級，獨立承載、不與戰鬥效果打包。 */
  callSun: { name: '喚日', effects: [
    { type: 'weather', weather: 'sunny' },
    { type: 'buff', stat: 'atk', op: 'mul', value: 1.1, duration: 2, scope: 'allAllies', where: { element: 'fire' } },
  ]},
  callRain: { name: '祈雨', effects: [
    { type: 'weather', weather: 'rain' },
    { type: 'buff', stat: 'atk', op: 'mul', value: 1.1, duration: 2, scope: 'allAllies', where: { element: 'water' } },
  ]},
  callGale: { name: '喚風', effects: [
    { type: 'weather', weather: 'gale' },
    { type: 'buff', stat: 'dmgTaken', op: 'mul', value: 0.9, duration: 2, scope: 'allAllies', where: { element: 'wind' } },
  ]},
  callSurge: { name: '引磁', effects: [
    { type: 'terrain', terrain: 'surge' },
    { type: 'energy', amount: 10, scope: 'allAllies', where: { element: 'light' } },
  ]},
  callErosion: { name: '蝕地', target: 'singleEnemyByColumn', effects: [
    { type: 'terrain', terrain: 'erosion' },
    { type: 'damage', mult: 1.2, scope: 'target' },
  ]},
  callSwamp: { name: '織沼', effects: [
    { type: 'terrain', terrain: 'swamp' },
    { type: 'buff', stat: 'dmgTaken', op: 'mul', value: 0.85, duration: 2, scope: 'self' }, // 匿身霧中
  ]},

  /* ================= 迴避／命中／惡夢 專職（機制承載卡） ================= */
  mirageVeil: { name: '蜃影', effects: [ // 定位：全隊迴避——敵方攻擊與上狀態每段 20% 落空
    { type: 'buff', stat: 'dodge', op: 'add', value: 0.2, duration: 2, scope: 'allAllies' },
  ]},
  hawkSight: { name: '鷹眼', effects: [ // 定位：反迴避 counter-pick——抵銷敵方迴避
    { type: 'buff', stat: 'accuracy', op: 'add', value: 0.3, duration: 2, scope: 'allAllies' },
  ]},
  nightTerror: { name: '惡夢烙印', target: 'singleEnemyByColumn', effects: [ // 定位：單體永久印記（可淨化）
    { type: 'damage', mult: 1.5, scope: 'target' },
    { type: 'nightmare', pct: 0.05, scope: 'target' }, // 受普攻/技能直傷時額外損失 5% 最大生命
  ]},
  energyLeech: { name: '奪流', target: 'highestEnergyEnemy', effects: [ // 定位：竊能——專打快放大招的人
    { type: 'damage', mult: 1.6, scope: 'target' },
    { type: 'energySteal', scope: 'target' }, // 奪走全部能量 → 轉給我方能量最低者（可疊出超充）
  ]},

  /* ================= 種族號令與種族補位（種族隊特色承載）=================
     設計原則：種族限定 buff 數值＞全隊型；每招仍守「一個定位」。 */
  deathLegion: { name: '亡軍號令', effects: [ // 定位：不死隊長——軍團衝鋒
    { type: 'buff', stat: 'atk', op: 'mul', value: 1.25, duration: 2, scope: 'allAllies', where: { race: '不死' } },
    { type: 'energy', amount: 10, scope: 'allAllies', where: { race: '不死' } },
  ]},
  sylvanHymn: { name: '森靈頌', effects: [ // 定位：精靈隊長——靈巧（迴避＋集氣＝精靈的種族語言）
    { type: 'buff', stat: 'dodge', op: 'add', value: 0.25, duration: 2, scope: 'allAllies', where: { race: '精靈' } }, // 精靈＝迴避值最高
    { type: 'buff', stat: 'energyGain', op: 'mul', value: 1.2, duration: 2, scope: 'allAllies', where: { race: '精靈' } },
  ]},
  bloodFeast: { name: '血宴', target: 'enemyFrontRow', effects: [ // 定位：妖坦——吸血開席（妖＝汲取）
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'damage', mult: 1.3, scope: 'target', lifesteal: 0.6 },
  ]},
  rageRend: { name: '狂怒撕裂', target: 'singleEnemyByColumn', effects: [ // 定位：獸輸出——疊怒（獸＝狂暴）
    { type: 'damage', mult: 1.8, scope: 'target' },
    { type: 'buff', stat: 'atk', op: 'mul', value: 1.15, duration: 3, scope: 'self', stackable: true }, // 狂怒層：每次施放疊一層
  ]},
  mercyRain: { name: '甘霖', effects: [ // 定位：治療增幅——神族專屬（受治療量↑）
    { type: 'heal', power: 1.0, scope: 'allAllies' },
    { type: 'buff', stat: 'healTaken', op: 'mul', value: 1.3, duration: 2, scope: 'allAllies' },
  ]},
  deathKnell: { name: '喪鐘', effects: [ // 定位：重傷——不死專屬（戰略級獨立承載：專剋治療隊）
    { type: 'buff', stat: 'healTaken', op: 'mul', value: 0.5, duration: 2, scope: 'allEnemies' },
  ]},

  /* ================= 機械隊／龍隊補位（種族三圍改版同批）================= */
  cannonBarrage: { name: '主砲齊射', target: 'enemyColumn', effects: [ // 定位：機械輸出——砲擊時展開裝甲
    { type: 'damage', mult: 2.0, scope: 'target' },
    { type: 'shield', power: 1.0, duration: 2, scope: 'self' },
  ]},
  repairProtocol: { name: '維修協議', effects: [ // 定位：機械輔助——機械同構強化維修（機械＝護盾值最高）
    { type: 'heal', power: 1.2, scope: 'allAllies' },
    { type: 'shield', power: 1.0, duration: 2, scope: 'allAllies', where: { race: '機械' } },
  ]},
  wyrmBulwark: { name: '龍鱗壁', effects: [ // 定位：龍坦——自身要塞（跟全隊減傷型的守護/龍護區隔）
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'buff', stat: 'dmgTaken', op: 'mul', value: 0.7, duration: 2, scope: 'self' },
  ]},
  drakeInfusion: { name: '龍魂灌注', target: 'highestAtkAlly', effects: [ // 定位：龍輔——單體超級增益灌主C（單體值＞全隊值）
    { type: 'buff', stat: 'atk', op: 'mul', value: 1.25, duration: 2, scope: 'target' },
    { type: 'energy', amount: 10, scope: 'target' },
  ]},

  /* ================= 機制拼圖批次（17 招，對應 cards.js 同名段落）=================
     每招把一個「引擎已支援、內容未用」的機制軸做成招牌；仍守單一定位原則。 */
  // 機械：格擋工程
  aegisProtocol: { name: '壁壘協定', effects: [ // 定位：前排工事——盾+自身絕緣
    { type: 'shield', power: 1.8, duration: 3, scope: 'frontAllies' },
    { type: 'debuffBlock', charges: 1, scope: 'self' },
  ]},
  nullField: { name: '絕緣力場', effects: [ // 定位：全隊格擋護符唯一承載者（下一個負面狀態直接彈開）
    { type: 'debuffBlock', charges: 1, scope: 'allAllies' },
  ]},
  // 妖：偷與嫁禍
  graceTheft: { name: '奪華', target: 'singleEnemyByColumn', effects: [ // 定位：偷增益刺客——你的 buff 現在是我的了
    { type: 'damage', mult: 2.0, scope: 'target' },
    { type: 'stealBuff', count: 1, scope: 'target' },
  ]},
  blameShift: { name: '嫁禍', target: 'randomEnemy', effects: [ // 定位：轉嫁詛咒——把我方的壞東西丟回去再補一口毒
    { type: 'transferDebuff', count: 2, scope: 'target' },
    { type: 'dot', power: 0.12, basis: 'targetMaxHp', duration: 2, scope: 'target' },
  ]},
  // 不死：不滅與亡語
  undyingOath: { name: '不滅誓約', effects: [ // 定位：免死坦——致死傷害改留 1 血（不死的種族語言）
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'cheatDeath', scope: 'self' },
  ]},
  spiteSlash: { name: '怨斬', target: 'singleEnemyByColumn', effects: [ // 定位：亡語刺客的主動軸（亡語見卡片觸發「遺恨爆發」）
    { type: 'damage', mult: 2.6, scope: 'target' },
  ]},
  // 精靈：獵印
  huntDecree: { name: '獵殺令', target: 'singleEnemyByColumn', effects: [ // 定位：獵印——隊友打標記目標會回能（見觸發「獵印連動」）
    { type: 'damage', mult: 1.8, scope: 'target' },
    { type: 'mark', duration: 3, scope: 'target' },
  ]},
  mistHeal: { name: '霧癒', effects: [ // 定位：前排再生+淨化（精靈霧的治療面）
    { type: 'hot', power: 1.2, duration: 2, scope: 'frontAllies' },
    { type: 'dispel', what: 'debuff', count: 1, scope: 'frontAllies' },
  ]},
  // 獸：血怒與月吼
  hornCrash: { name: '角衝', target: 'enemyFrontRow', effects: [ // 定位：衝撞坦（血怒觸發見卡片）
    { type: 'damage', mult: 1.5, scope: 'target' },
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
  ]},
  lunarHowl: { name: '月吼', target: 'allEnemies', effects: [ // 定位：全體壓制+疊怒（每吼一次更兇）
    { type: 'damage', mult: 1.1, scope: 'target' },
    { type: 'buff', stat: 'atk', op: 'mul', value: 1.1, duration: 99, scope: 'self', stackable: true },
  ]},
  // 龍：龍息與超充推手
  dragonflare: { name: '龍炎滅陣', target: 'allEnemies', effects: [ // 定位：全體吐息+回能（配蓄力普攻＝輸出循環）
    { type: 'damage', mult: 1.4, scope: 'target' },
    { type: 'energy', amount: 15, scope: 'self' },
  ]},
  dragonSurge: { name: '龍血沸騰', target: 'highestAtkAlly', effects: [ // 定位：超充推手——灌爆主 C 的能量條（溢出＝超充傷害）
    { type: 'energy', amount: 40, scope: 'target' },
    { type: 'buff', stat: 'dmgDealt', op: 'mul', value: 1.2, duration: 1, scope: 'target' },
  ]},
  // 神：奇蹟與聖域
  miracleWard: { name: '神蹟', target: 'lowestHpAlly', effects: [ // 定位：免死護符（隊友版）唯一承載者+大治療
    { type: 'cheatDeath', scope: 'target' },
    { type: 'heal', power: 2.2, scope: 'target' },
  ]},
  sanctumWall: { name: '聖域壁壘', effects: [ // 定位：聖域坦（全隊抗暗光環見卡片被動）
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'shield', power: 1.6, duration: 2, scope: 'self' },
  ]},
  smite: { name: '天罰之鋒', target: 'enemyColumn', effects: [ // 定位：神輸出——裁決直排、以聖光自癒
    { type: 'damage', mult: 1.9, scope: 'target' },
    { type: 'heal', power: 0.6, scope: 'self' },
  ]},
  // 人：職業純隊核心的主動軸
  siegeHorn: { name: '攻城號角', target: 'enemyFrontRow', effects: [ // 定位：坦隊隊長——破陣+築牆
    { type: 'damage', mult: 1.3, scope: 'target' },
    { type: 'buff', stat: 'def', op: 'mul', value: 1.15, duration: 2, scope: 'frontAllies' },
  ]},
  battleHymn: { name: '戰歌', effects: [ // 定位：輔隊隊長——後排戰歌（窄範圍：後排值高於全隊版）
    { type: 'buff', stat: 'atk', op: 'mul', value: 1.2, duration: 2, scope: 'backAllies' },
    { type: 'hot', power: 0.8, duration: 2, scope: 'backAllies' },
  ]},
  oathBlade: { name: '誓刃', target: 'singleEnemyByColumn', effects: [ // 定位：殺陣盟主的主動軸——乾淨的高倍率單體
    { type: 'damage', mult: 2.4, scope: 'target' },
  ]},
};

// cardId → skillId
export const CARD_SKILLS = {
  ifrit: 'infernoNova',
  emberguard: 'moltenBulwark',
  zephyr: 'galeAssault',
  galewind: 'windsong',
  tidecaller: 'tidalPrison',
  aegis: 'dragonGuard',
  seraph: 'radiantGrace',
  dawnblade: 'dawnStrike',
  nightreaper: 'shadowExecute',
  gravewarden: 'gravePact',
  // ---- 測試角色（40）----
  cinderblade: 'cinderCombo',
  pyrelord: 'karmicFire',
  ashpriest: 'emberWarmth',
  magmaturtle: 'shellAegis',
  flarearcher: 'flameShift',
  emberwitch: 'detonate',
  warbanner: 'warBanner',
  redlion: 'lionRoar',
  stormblade: 'thunderCut',
  galeninja: 'windShift',
  tempesthawk: 'huntFeather',
  windsister: 'gentleBreeze',
  thundertotem: 'thunderMark',
  skylancer: 'cloudPiercer',
  grovekeeper: 'forestWard',
  zephyrmonk: 'galeKicks',
  frostmage: 'frostThorns',
  tidesinger: 'tideHymn',
  glacierknight: 'glacialArmor',
  abysshunter: 'abyssBite',
  mistdancer: 'mistShift',
  coralshaman: 'springSurge',
  leviathan: 'tsunami',
  pearlguard: 'pearlBulwark',
  paladin: 'sacredShield',
  lightweaver: 'crystalGleam',
  suninquisitor: 'holyVerdict',
  dawnharpist: 'morningSong',
  radiantgolem: 'luminousWall',
  stargazer: 'starfall',
  holyfencer: 'silverThrust',
  lumenfox: 'foxGlow',
  plaguelord: 'plagueSpread',
  shadowpriest: 'mindGnaw',
  boneknight: 'boneRampart',
  nightmare: 'dreamEater',
  voidcaller: 'voidBurst',
  cryptwidow: 'webBind',
  duskwarden: 'duskVeil',
  soulorganist: 'requiem',
  // ---- 環境使（6）----
  sunherald: 'callSun',
  rainherald: 'callRain',
  galeherald: 'callGale',
  lumenvessel: 'callSurge',
  voidshade: 'callErosion',
  mireweaver: 'callSwamp',
  // ---- 機制專職（4）----
  veilwalker: 'mirageVeil',
  hawkoracle: 'hawkSight',
  terrorweaver: 'nightTerror',
  fluxreaver: 'energyLeech',
  // ---- 種族號令與補位（10）----
  bonemarshal: 'deathLegion',
  sylvanqueen: 'sylvanHymn',
  abysstyrant: 'bloodFeast',
  rageclaw: 'rageRend',
  dawnmother: 'mercyRain',
  knellwitch: 'deathKnell',
  ironcannon: 'cannonBarrage',
  gearmedic: 'repairProtocol',
  drakebastion: 'wyrmBulwark',
  dragonoracle: 'drakeInfusion',
  // ---- 機制拼圖批次（17）----
  bulwarkengine: 'aegisProtocol',
  insulatower: 'nullField',
  mirrorfox: 'graceTheft',
  hexweaver: 'blameShift',
  deathlessking: 'undyingOath',
  vengefulshade: 'spiteSlash',
  huntmarshal: 'huntDecree',
  mistwarden: 'mistHeal',
  hornchief: 'hornCrash',
  moonhowler: 'lunarHowl',
  flamewyrm: 'dragonflare',
  wyrmmatriarch: 'dragonSurge',
  miraclenun: 'miracleWard',
  sanctumjudge: 'sanctumWall',
  godblade: 'smite',
  siegemarshal: 'siegeHorn',
  warchoir: 'battleHymn',
  bladeoath: 'oathBlade',
};

export function skillFor(unit) {
  return CARD_SKILLS[unit.cardId] ?? unit.classDef.ultimate;
}

// 技能等級縮放：效果帶 perLv（{欄位: 每級增量}）時按 skillLv 展開。
// 例 { mult: 2.6, perLv: { mult: 0.15 } } → Lv3 ＝ 2.9。無 perLv 或 Lv1＝原值（現況零影響）。
function scaleEffect(effect, lv) {
  if (lv <= 1 || !effect.perLv) return effect;
  const out = { ...effect };
  for (const [field, inc] of Object.entries(effect.perLv)) {
    out[field] = (effect[field] ?? 0) + inc * (lv - 1);
  }
  return out;
}

// 施放技能：解析主目標 → 逐效果依 scope 套用。
// overcharge＝超充倍率（施放瞬間 energy/100），只放大 damage 直傷（見 applyEffect）。
export function castSkill(caster, skillId, ctx, { overcharge = 1 } = {}) {
  const def = SKILLS[skillId];
  if (!def) return;
  const lv = caster.skillLv ?? 1;
  const primary = def.target ? SELECTORS[def.target](caster, ctx) : [];
  ctx.emit('ultimate', { caster, skill: skillId, target: primary[0], overcharge });
  const castCtx = overcharge > 1 ? { ...ctx, overcharge } : ctx;
  for (const effect of def.effects) {
    const eff = scaleEffect(effect, lv);
    const units = resolveScope(eff.scope, caster, primary, ctx);
    applyEffect(eff, caster, units, castCtx, skillId);
  }
}

// 普攻：直行對位選敵、施放者集氣、其餘存活隊友各獲 energyOnAllyAction。
// 普攻變體（卡片 basicAttack 欄位，不填＝1.0 單體）：
//   { hits:2, mult:0.6 }  連擊：多段各自判定命中/暴擊
//   { splash:0.35 }       濺射：同排相鄰位吃 35% 傷害
//   { heal:0.6 }          奶攻：出手後治療血量最低隊友（直接治療＝吃暴擊）
//   { everyN:3, mult:2.2 }蓄力：每第 N 次普攻放大一擊
export function normalAttack(caster, ctx) {
  const target = singleEnemyByColumn(caster, ctx.enemies);
  if (!target) return;
  const ba = caster.basicAttack ?? null;
  ctx.emit('attack', { attacker: caster, target, skill: 'normal' });

  caster._basicCount = (caster._basicCount ?? 0) + 1;
  let mult = 1.0;
  let hits = 1;
  if (ba?.hits) { hits = ba.hits; mult = ba.mult ?? 1 / ba.hits; }
  if (ba?.everyN && caster._basicCount % ba.everyN === 0) mult = ba.mult ?? 2.0;

  for (let i = 0; i < hits; i += 1) {
    if (!target.alive) break;
    if (rollHit(caster, target, ctx)) {
      dealDamage(caster, target, mult, ctx, 'normal');
    } else {
      ctx.emit('miss', { source: caster, target, skill: 'normal' }); // 迴避：該段無效（仍照常回能）
    }
  }
  // 濺射：對位目標同排、相鄰直行的敵人
  if (ba?.splash) {
    const neighbors = ctx.enemies.filter(
      (e) => e.alive && e !== target && e.row === target.row && Math.abs(e.column - target.column) === 1
    );
    for (const n of neighbors) {
      if (rollHit(caster, n, ctx)) dealDamage(caster, n, ba.splash, ctx, 'normal');
      else ctx.emit('miss', { source: caster, target: n, skill: 'normal' });
    }
  }
  // 奶攻：直接治療（吃施放者暴擊，同技能治療規則）
  if (ba?.heal) {
    const ally = lowestHpAlly(ctx.allies);
    if (ally) {
      let amount = healAmount(ctx, caster.effAtk * ba.heal);
      let hCrit = false;
      const roll = ctx.rng ? ctx.rng.next() : Math.random();
      if (roll < caster.critChance) { amount = Math.round(amount * caster.critMult); hCrit = true; }
      const healed = ally.heal(amount);
      if (healed > 0) ctx.emit('heal', { source: caster, target: ally, amount: healed, isCrit: hCrit });
    }
  }
  caster.gainEnergy(caster.classDef.energyOnAction);
  ctx.emit('energy', { unit: caster, value: caster.energy });
  for (const ally of ctx.allies) {
    if (ally === caster || !ally.alive) continue;
    const gain = ally.classDef.energyOnAllyAction || 0;
    if (gain) { ally.gainEnergy(gain); ctx.emit('energy', { unit: ally, value: ally.energy }); }
  }
}
