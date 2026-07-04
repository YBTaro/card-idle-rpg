// src/battle/skills.js
// 技能即資料：SKILLS registry + castSkill。普攻與傷害共用 effects.dealDamage。
import { singleEnemyByColumn, SELECTORS } from './targeting.js';
import { dealDamage, resolveScope, applyEffect } from './effects.js';

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
    { type: 'dot', power: 0.4, element: 'fire', duration: 2, scope: 'target' },
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
    { type: 'buff', stat: 'dmgTaken', op: 'mul', value: 0.6, duration: 2, key: 'guard', scope: 'allAllies' },
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
    { type: 'dot', power: 0.4, element: 'fire', duration: 2, scope: 'target', chance: 0.7 }, // 70% 燃燒 2 回合（同人再上＝回合數疊加）
  ]},
  karmicFire: { name: '業火', target: 'enemyFrontRow', effects: [
    { type: 'damage', mult: 1.5, scope: 'target' },
    { type: 'dot', power: 0.35, element: 'fire', duration: 2, scope: 'target', stackable: true }, // 可疊層灼燒
  ]},
  emberWarmth: { name: '餘溫', effects: [ // 定位：延燒輔助（淨化歸潮頌）
    { type: 'heal', power: 1.2, scope: 'allAllies' },
    { type: 'extend', what: 'dot', element: 'fire', turns: 1, scope: 'allEnemies' }, // 餘燼不熄：敵方灼燒 +1 回合
  ]},
  shellAegis: { name: '殼護', effects: [ // 定位：荊棘反傷坦（厚盾歸冰甲）
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'thorns', pct: 0.35, duration: 2, scope: 'self' },
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
  gentleBreeze: { name: '和風', effects: [ // 定位：精靈群奶（集氣加速歸風歌）
    { type: 'heal', power: 1.2, scope: 'allAllies' },
    { type: 'heal', power: 0.7, scope: 'allAllies', where: { race: '精靈' } }, // 精靈同族加護
  ]},
  thunderMark: { name: '雷紋', effects: [ // 定位：風屬專屬狀態載體——全體易傷
    { type: 'buff', stat: 'dmgTaken', op: 'mul', value: 1.2, duration: 2, scope: 'allEnemies' },
  ]},
  cloudPiercer: { name: '貫雲', target: 'enemyColumn', effects: [ // 乘風：貫穿直排並鼓舞風屬同袍
    { type: 'damage', mult: 2.0, scope: 'target' },
    { type: 'buff', stat: 'dmgDealt', op: 'mul', value: 1.25, duration: 2, scope: 'allAllies', where: { element: 'wind' } }, // 條件型＞全隊型
  ]},
  forestWard: { name: '林護', effects: [ // 定位：再生坦——嘲諷 + 全隊持續回復
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'hot', power: 0.3, duration: 2, scope: 'allAllies' },
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
    { type: 'damage', mult: 2.2, scope: 'target', lifesteal: 0.35 },
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
    { type: 'shield', power: 1.2, duration: 3, scope: 'allAllies', where: { race: '機械' } },
  ]},

  // ---- 光 ----
  sacredShield: { name: '聖盾', effects: [
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'buff', stat: 'dmgTaken', op: 'mul', value: 0.75, duration: 2, key: 'guard', scope: 'allAllies' }, // 與守護/龍護互斥
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
    { type: 'dot', power: 0.15, basis: 'targetMaxHp', duration: 2, scope: 'target' }, // 中毒：每跳 15% 最大生命
  ]},
  mindGnaw: { name: '蝕心', effects: [ // 定位：靈壓領域——戰略級效果獨立承載（同環境技原則）
    { type: 'castDrain', amount: 20, duration: 2, scope: 'self', stackable: true }, // 敵方施法→其餘敵人 -20 能量
  ]},
  boneRampart: { name: '骨牆', effects: [ // 定位：凝咒坦——把敵人身上所有壞事都拖長
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'extend', what: 'negative', turns: 1, scope: 'allEnemies' },
  ]},
  dreamEater: { name: '噬夢', target: 'randomEnemy', effects: [ // 定位：隨機汲取者——吸血又吸氣（緩速歸獵翎）
    { type: 'damage', mult: 2.1, scope: 'target', lifesteal: 0.3 },
    { type: 'energy', amount: 15, scope: 'self' },
  ]},
  voidBurst: { name: '虛爆', target: 'enemyColumn', effects: [
    { type: 'damage', mult: 1.6, scope: 'target' },
    { type: 'dot', power: 0.15, basis: 'targetMaxHp', duration: 2, scope: 'target' }, // 中毒：每跳 15% 最大生命
  ]},
  webBind: { name: '縛絲', target: 'lowestHpEnemy', effects: [ // 補刀型選目標
    { type: 'damage', mult: 1.8, scope: 'target' },
    { type: 'dot', power: 0.15, basis: 'targetMaxHp', duration: 2, scope: 'target', chance: 0.7 }, // 70% 蛛毒 2 回合（每跳 15% 最大生命）
  ]},
  duskVeil: { name: '暮幕', effects: [ // 定位：奪光坦——入夜，奪走敵人的增益
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
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
};

export function skillFor(unit) {
  return CARD_SKILLS[unit.cardId] ?? unit.classDef.ultimate;
}

// 施放技能：解析主目標 → 逐效果依 scope 套用。
export function castSkill(caster, skillId, ctx) {
  const def = SKILLS[skillId];
  if (!def) return;
  const primary = def.target ? SELECTORS[def.target](caster, ctx) : [];
  ctx.emit('ultimate', { caster, skill: skillId, target: primary[0] });
  for (const effect of def.effects) {
    const units = resolveScope(effect.scope, caster, primary, ctx);
    applyEffect(effect, caster, units, ctx, skillId);
  }
}

// 普攻：直行對位選敵、施放者集氣、其餘存活隊友各獲 energyOnAllyAction。
export function normalAttack(caster, ctx) {
  const target = singleEnemyByColumn(caster, ctx.enemies);
  if (!target) return;
  ctx.emit('attack', { attacker: caster, target, skill: 'normal' });
  dealDamage(caster, target, 1.0, ctx, 'normal');
  caster.gainEnergy(caster.classDef.energyOnAction);
  ctx.emit('energy', { unit: caster, value: caster.energy });
  for (const ally of ctx.allies) {
    if (ally === caster || !ally.alive) continue;
    const gain = ally.classDef.energyOnAllyAction || 0;
    if (gain) { ally.gainEnergy(gain); ctx.emit('energy', { unit: ally, value: ally.energy }); }
  }
}
