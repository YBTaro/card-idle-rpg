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
    { type: 'weather', weather: 'sunny' }, // 焚天：天空轉為烈日
    { type: 'damage', mult: 1.8, scope: 'target' },
    { type: 'dot', power: 0.4, element: 'fire', duration: 2, scope: 'target' },
  ]},
  moltenBulwark: { name: '熔壁', effects: [
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'shield', power: 1.5, duration: 3, scope: 'allAllies' },
  ]},
  galeAssault: { name: '疾襲', target: 'enemyBackRow', effects: [
    { type: 'damage', mult: 2.2, scope: 'target' },
  ]},
  windsong: { name: '風歌', effects: [
    { type: 'weather', weather: 'gale' }, // 風歌：喚來颶風
    { type: 'buff', stat: 'energyGain', op: 'mul', value: 1.5, duration: 3, scope: 'allAllies' },
    { type: 'heal', power: 1.0, scope: 'allAllies' },
  ]},
  tidalPrison: { name: '潮牢', target: 'enemyColumn', effects: [
    { type: 'weather', weather: 'rain' }, // 潮牢：喚來暴雨
    { type: 'damage', mult: 1.6, scope: 'target' },
    { type: 'control', control: 'silence', duration: 2, scope: 'target' },
  ]},
  dragonGuard: { name: '龍護', effects: [
    { type: 'buff', stat: 'dmgTaken', op: 'mul', value: 0.6, duration: 2, key: 'guard', scope: 'allAllies' },
    { type: 'shield', power: 2.0, duration: 3, scope: 'self' },
  ]},
  radiantGrace: { name: '聖恩', target: 'lowestHpAlly', effects: [
    { type: 'heal', power: 3.5, scope: 'target' },
    { type: 'buff', stat: 'critChance', op: 'add', value: 0.2, duration: 2, scope: 'allAllies' },
  ]},
  dawnStrike: { name: '曙擊', target: 'singleEnemyByColumn', effects: [
    { type: 'damage', mult: 2.8, scope: 'target' },
    { type: 'buff', stat: 'atk', op: 'mul', value: 1.2, duration: 2, scope: 'self' },
  ]},
  shadowExecute: { name: '影誅', target: 'singleEnemyByColumn', effects: [
    { type: 'damage', mult: 3.0, scope: 'target' },
    { type: 'control', control: 'stun', duration: 1, scope: 'target' },
  ]},
  gravePact: { name: '墓約', effects: [
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'buff', stat: 'atk', op: 'mul', value: 0.7, duration: 2, scope: 'allEnemies' },
  ]},

  /* ================= 測試角色技能池（40 招，涵蓋業界常見原型） =================
     多段連擊 / 可疊層 DoT（stackable）/ 剋種族追打（where）/ 易傷 / 緩速（集氣壓制）/
     群體充能 / 跨技能互斥減傷罩（key:'guard'）/ 斬殺型高倍率 / 控制鏈 / 攻守交換 */

  // ---- 火 ----
  cinderCombo: { name: '燼滅', target: 'singleEnemyByColumn', effects: [
    { type: 'damage', mult: 1.1, scope: 'target' },
    { type: 'damage', mult: 1.1, scope: 'target' },
    { type: 'damage', mult: 1.1, scope: 'target' },
    { type: 'buff', stat: 'critChance', op: 'add', value: 0.15, duration: 2, scope: 'self' },
  ]},
  karmicFire: { name: '業火', target: 'enemyFrontRow', effects: [
    { type: 'damage', mult: 1.5, scope: 'target' },
    { type: 'dot', power: 0.35, element: 'fire', duration: 2, scope: 'target', stackable: true }, // 可疊層灼燒
  ]},
  emberWarmth: { name: '餘溫', effects: [
    { type: 'heal', power: 1.2, scope: 'allAllies' },
    { type: 'dispel', what: 'debuff', count: 1, scope: 'allAllies' }, // 淨化
    { type: 'buff', stat: 'dmgDealt', op: 'mul', value: 1.15, duration: 2, scope: 'allAllies' },
    { type: 'extend', what: 'dot', element: 'fire', turns: 1, scope: 'allEnemies' }, // 餘燼不熄：敵方灼燒 +1 回合
  ]},
  shellAegis: { name: '殼護', effects: [
    { type: 'thorns', pct: 0.3, duration: 2, scope: 'self' }, // 荊棘反傷
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'shield', power: 2.2, duration: 3, scope: 'self' },
    { type: 'buff', stat: 'def', op: 'mul', value: 1.3, duration: 2, scope: 'self' },
  ]},
  fireArrow: { name: '火矢', target: 'singleEnemyByColumn', effects: [
    { type: 'damage', mult: 2.0, scope: 'target' },
    { type: 'dot', power: 0.5, element: 'fire', duration: 2, scope: 'target' },
    { type: 'buff', stat: 'dotTaken', op: 'mul', value: 1.3, duration: 2, scope: 'target' }, // 火油：灼燒易傷
  ]},
  detonate: { name: '爆燃', target: 'enemyColumn', effects: [
    { type: 'detonateDot', element: 'fire', mult: 1.0, scope: 'target' }, // 先引爆舊灼燒（每跳×剩餘回合一次結算）
    { type: 'damage', mult: 1.7, scope: 'target', ignoreDef: true }, // 無視防禦
    { type: 'dot', power: 0.4, element: 'fire', duration: 2, scope: 'target' }, // 再點新火
  ]},
  warBanner: { name: '軍威', effects: [
    { type: 'buff', stat: 'atk', op: 'mul', value: 1.2, duration: 2, scope: 'allAllies' },
    { type: 'buff', stat: 'dmgTaken', op: 'mul', value: 0.88, duration: 2, scope: 'allAllies', where: { series: '鐵壁' } }, // 鐵壁軍團減傷
    { type: 'energy', amount: 15, scope: 'allAllies' },
  ]},
  lionRoar: { name: '獅吼', target: 'enemyFrontRow', effects: [
    { type: 'counter', mult: 0.8, duration: 2, scope: 'self' }, // 反擊姿態
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'buff', stat: 'atk', op: 'mul', value: 0.8, duration: 2, scope: 'target' },
  ]},

  // ---- 風 ----
  thunderCut: { name: '雷切', target: 'singleEnemyByColumn', effects: [
    { type: 'damage', mult: 2.4, scope: 'target' },
    { type: 'control', control: 'stun', duration: 1, scope: 'target', chance: 0.3 }, // 機率暈眩
    { type: 'buff', stat: 'energyGain', op: 'mul', value: 1.3, duration: 2, scope: 'self' },
  ]},
  phantomEdge: { name: '殘影', target: 'singleEnemyByColumn', effects: [
    { type: 'damage', mult: 1.3, scope: 'target' },
    { type: 'damage', mult: 1.3, scope: 'target' },
    { type: 'buff', stat: 'critMult', op: 'add', value: 0.4, duration: 2, scope: 'self' },
  ]},
  huntFeather: { name: '獵翎', target: 'enemyBackRow', effects: [
    { type: 'damage', mult: 1.9, scope: 'target' },
    { type: 'buff', stat: 'energyGain', op: 'mul', value: 0.7, duration: 2, scope: 'target' }, // 緩速：壓制集氣
  ]},
  gentleBreeze: { name: '和風', effects: [
    { type: 'heal', power: 0.9, scope: 'allAllies' },
    { type: 'buff', stat: 'energyGain', op: 'mul', value: 1.25, duration: 2, scope: 'allAllies' },
    { type: 'heal', power: 0.7, scope: 'allAllies', where: { race: '精靈' } }, // 精靈同族加護
  ]},
  thunderMark: { name: '雷紋', effects: [
    { type: 'buff', stat: 'dmgTaken', op: 'mul', value: 1.2, duration: 2, scope: 'allEnemies' }, // 全體易傷
    { type: 'buff', stat: 'atk', op: 'mul', value: 1.25, duration: 2, scope: 'allAllies', where: { race: '獸' } }, // 獸魂共鳴
  ]},
  cloudPiercer: { name: '貫雲', target: 'enemyColumn', effects: [
    { type: 'damage', mult: 2.0, scope: 'target' },
    { type: 'buff', stat: 'atk', op: 'mul', value: 1.15, duration: 2, scope: 'self' },
  ]},
  forestWard: { name: '林護', effects: [
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'buff', stat: 'def', op: 'mul', value: 1.25, duration: 2, scope: 'allAllies' },
  ]},
  galeKicks: { name: '連風腿', target: 'singleEnemyByColumn', effects: [
    { type: 'damage', mult: 0.9, scope: 'target' },
    { type: 'damage', mult: 0.9, scope: 'target' },
    { type: 'damage', mult: 0.9, scope: 'target' },
    { type: 'energy', amount: 20, scope: 'self' },
  ]},

  // ---- 水 ----
  frostThorns: { name: '冰棘', effects: [
    { type: 'damage', mult: 1.1, scope: 'allEnemies' },
    { type: 'buff', stat: 'energyGain', op: 'mul', value: 0.75, duration: 2, scope: 'allEnemies' }, // 全體霜緩
  ]},
  tideHymn: { name: '潮頌', target: 'lowestHpAlly', effects: [
    { type: 'heal', power: 2.6, scope: 'target' },
    { type: 'heal', power: 0.8, scope: 'alliesExceptTarget' },
  ]},
  glacialArmor: { name: '冰甲', effects: [
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'shield', power: 2.4, duration: 3, scope: 'self' },
    { type: 'shield', power: 0.8, duration: 3, scope: 'allAllies' },
  ]},
  abyssBite: { name: '淵噬', target: 'singleEnemyByColumn', effects: [
    { type: 'damage', mult: 2.2, scope: 'target', lifesteal: 0.35 }, // 吸血
    { type: 'buff', stat: 'def', op: 'mul', value: 0.75, duration: 2, scope: 'target' }, // 破甲
  ]},
  mistBlades: { name: '霧刃', target: 'singleEnemyByColumn', effects: [
    { type: 'damage', mult: 1.4, scope: 'target' },
    { type: 'damage', mult: 1.4, scope: 'target' },
    { type: 'buff', stat: 'dmgTaken', op: 'mul', value: 0.8, duration: 2, scope: 'self' },
  ]},
  springSurge: { name: '湧泉', effects: [
    { type: 'heal', power: 1.4, scope: 'allAllies' },
    { type: 'hot', power: 0.35, duration: 2, scope: 'allAllies' }, // 持續回復
    { type: 'buff', stat: 'dmgTaken', op: 'mul', value: 0.85, duration: 2, scope: 'allAllies' },
    { type: 'buff', stat: 'dmgDealt', op: 'mul', value: 1.15, duration: 2, scope: 'allAllies', where: { element: 'water' } }, // 水屬共鳴
  ]},
  tsunami: { name: '海嘯', target: 'allEnemies', effects: [
    { type: 'damage', mult: 1.35, scope: 'target' }, // 全場大 AoE
    { type: 'damage', mult: 0.7, scope: 'target', where: { element: 'fire' } }, // 水滅火追打
  ]},
  pearlBulwark: { name: '貝盾', effects: [
    { type: 'shield', power: 1.0, duration: 3, scope: 'allAllies' },
    { type: 'shield', power: 1.2, duration: 3, scope: 'allAllies', where: { race: '機械' } }, // 機械同構強化盾
    { type: 'buff', stat: 'def', op: 'mul', value: 1.2, duration: 2, scope: 'self' },
  ]},

  // ---- 光 ----
  sacredShield: { name: '聖盾', effects: [
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'buff', stat: 'dmgTaken', op: 'mul', value: 0.75, duration: 2, key: 'guard', scope: 'allAllies' }, // 與守護/龍護互斥
  ]},
  crystalGleam: { name: '晶輝', effects: [
    { type: 'buff', stat: 'critChance', op: 'add', value: 0.15, duration: 2, scope: 'allAllies' },
    { type: 'buff', stat: 'critMult', op: 'add', value: 0.3, duration: 2, scope: 'allAllies' },
    { type: 'buff', stat: 'critChance', op: 'add', value: 0.1, duration: 2, scope: 'allAllies', where: { series: '星詠' } }, // 星詠共鳴
  ]},
  holyVerdict: { name: '審判', target: 'singleEnemyByColumn', effects: [
    { type: 'damage', mult: 2.6, scope: 'target', executeBelow: 0.35, executeBonus: 1.6 }, // 處決
    { type: 'damage', mult: 1.0, scope: 'target', where: { race: '不死' } }, // 剋不死追打
  ]},
  morningSong: { name: '晨曲', effects: [
    { type: 'terrain', terrain: 'surge' }, // 晨曲：場地轉為湧能磁場（全體+50能量、光屬集氣+15%）
    { type: 'energy', amount: 25, scope: 'allAllies' }, // 群體充能
    { type: 'energy', amount: 15, scope: 'allAllies', where: { series: '聖歌隊' } }, // 聖歌隊合唱加成
    { type: 'heal', power: 0.7, scope: 'allAllies' },
  ]},
  luminousWall: { name: '聖壁', effects: [
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'shield', power: 2.6, duration: 3, scope: 'self' },
    { type: 'buff', stat: 'dmgTaken', op: 'mul', value: 0.8, duration: 2, scope: 'self' },
  ]},
  starfall: { name: '星隕', target: 'enemyBackRow', effects: [
    { type: 'damage', mult: 1.8, scope: 'target' },
    { type: 'control', control: 'silence', duration: 1, scope: 'target' },
  ]},
  silverThrust: { name: '聖刺', target: 'singleEnemyByColumn', effects: [
    { type: 'damage', mult: 1.5, scope: 'target' },
    { type: 'damage', mult: 1.5, scope: 'target' },
    { type: 'buff', stat: 'critChance', op: 'add', value: 0.2, duration: 1, scope: 'self' },
  ]},
  foxGlow: { name: '狐光', target: 'lowestHpAlly', effects: [
    { type: 'heal', power: 2.2, scope: 'target' },
    { type: 'buff', stat: 'atk', op: 'mul', value: 1.2, duration: 2, scope: 'target' },
  ]},

  // ---- 暗 ----
  plagueSpread: { name: '瘟疫', target: 'allEnemies', effects: [
    { type: 'terrain', terrain: 'swamp' }, // 疫沼：場地轉為迷霧沼澤（DoT 加深）
    { type: 'damage', mult: 0.8, scope: 'target' },
    { type: 'damage', mult: 0.6, scope: 'target', where: { race: '人' } }, // 疫病剋人族追打
    { type: 'dot', power: 0.3, duration: 2, scope: 'target', stackable: true }, // 可疊層劇毒
  ]},
  mindGnaw: { name: '蝕心', effects: [
    { type: 'castDrain', amount: 20, duration: 2, scope: 'self', stackable: true }, // 靈壓領域：敵方施法→其餘敵人 -20 能量
    { type: 'buff', stat: 'atk', op: 'mul', value: 0.82, duration: 2, scope: 'allEnemies' },
    { type: 'heal', power: 0.6, scope: 'allAllies' },
  ]},
  boneRampart: { name: '骨牆', effects: [
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'shield', power: 2.0, duration: 3, scope: 'self' },
    { type: 'buff', stat: 'atk', op: 'mul', value: 1.15, duration: 2, scope: 'self' },
  ]},
  dreamEater: { name: '噬夢', target: 'randomEnemy', effects: [ // 隨機目標
    { type: 'damage', mult: 2.1, scope: 'target', lifesteal: 0.3 }, // 吸血
    { type: 'buff', stat: 'energyGain', op: 'mul', value: 0.6, duration: 1, scope: 'target' },
    { type: 'energy', amount: 15, scope: 'self' }, // 汲取式回能
  ]},
  voidBurst: { name: '虛爆', target: 'enemyColumn', effects: [
    { type: 'terrain', terrain: 'erosion' }, // 虛空侵蝕：非暗屬每回合流失 10% 最大生命
    { type: 'damage', mult: 1.6, scope: 'target' },
    { type: 'dot', power: 0.35, duration: 2, scope: 'target' },
  ]},
  webBind: { name: '縛絲', target: 'lowestHpEnemy', effects: [ // 補刀型選目標
    { type: 'damage', mult: 1.8, scope: 'target' },
    { type: 'control', control: 'stun', duration: 1, scope: 'target' },
  ]},
  duskVeil: { name: '暮幕', effects: [
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'buff', stat: 'dmgTaken', op: 'mul', value: 0.8, duration: 2, key: 'guard', scope: 'allAllies' },
  ]},
  requiem: { name: '安魂', target: 'deadAlly', effects: [
    { type: 'revive', power: 0.35, scope: 'targetIncludingDead' }, // 復活
    { type: 'heal', power: 1.1, scope: 'allAllies' },
    { type: 'heal', power: 0.6, scope: 'allAllies', where: { race: '不死' } }, // 不死族額外治療
    { type: 'buff', stat: 'energyGain', op: 'mul', value: 1.2, duration: 2, scope: 'allAllies' },
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
  flarearcher: 'fireArrow',
  emberwitch: 'detonate',
  warbanner: 'warBanner',
  redlion: 'lionRoar',
  stormblade: 'thunderCut',
  galeninja: 'phantomEdge',
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
  mistdancer: 'mistBlades',
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
