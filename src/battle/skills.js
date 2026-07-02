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
  moltenBulwark: { name: '熔壁', effects: [
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'shield', power: 1.5, duration: 3, scope: 'allAllies' },
  ]},
  galeAssault: { name: '疾襲', target: 'enemyBackRow', effects: [
    { type: 'damage', mult: 2.2, scope: 'target' },
  ]},
  windsong: { name: '風歌', effects: [
    { type: 'buff', stat: 'energyGain', op: 'mul', value: 1.5, duration: 3, scope: 'allAllies' },
    { type: 'heal', power: 1.0, scope: 'allAllies' },
  ]},
  tidalPrison: { name: '潮牢', target: 'enemyColumn', effects: [
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
};

// cardId → skillId（Task 2 填入 10 招）
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
