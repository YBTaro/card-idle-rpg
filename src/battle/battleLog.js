// src/battle/battleLog.js
// 戰鬥 Log 產生器：跑完整場、收集初始快照 + 有序事件成可序列化 log。
import { BattleEngine } from './engine.js';

function snapshot(u) {
  return { uid: u.uid, team: u.team, pos: u.pos, name: u.name, element: u.element, class: u.class, cardId: u.cardId, maxHp: u.maxHp, level: u.level };
}
const uidOf = (u) => (u ? u.uid : null);

export function simulateBattle(teamA, teamB, { rng, env = null } = {}) {
  const engine = new BattleEngine(teamA, teamB, { rng, env });
  const setup = [...teamA, ...teamB].map(snapshot);
  const log = [];
  // 天氣/場地宣告與變化（開場預設與進場被動由引擎首步發出）
  engine.on('weather', ({ id, unit }) => log.push({ type: 'weather', id, uid: uidOf(unit) }));
  engine.on('terrain', ({ id, unit }) => log.push({ type: 'terrain', id, uid: uidOf(unit) }));
  engine.on('drain', ({ unit, amount }) => log.push({ type: 'drain', uid: uidOf(unit), amount }));
  engine.on('steal', ({ from, to, amount }) => log.push({ type: 'steal', fromUid: uidOf(from), toUid: uidOf(to), amount }));
  engine.on('turn', ({ unit }) => log.push({ type: 'turn', uid: uidOf(unit) }));
  engine.on('round', ({ round }) => log.push({ type: 'round', round }));
  engine.on('energy', ({ unit, value }) => log.push({ type: 'energy', uid: uidOf(unit), value }));
  engine.on('attack', ({ attacker, target, skill }) => log.push({ type: 'attack', attackerUid: uidOf(attacker), targetUid: uidOf(target), skill }));
  engine.on('ultimate', ({ caster, skill, target, overcharge }) => log.push({ type: 'ultimate', casterUid: uidOf(caster), skill, targetUid: uidOf(target), overcharge: overcharge ?? 1 }));
  engine.on('damage', (p) => log.push({ type: 'damage', sourceUid: uidOf(p.source), targetUid: uidOf(p.target), amount: p.amount, absorbed: p.absorbed ?? 0, skill: p.skill, isAdvantage: !!p.isAdvantage, isDisadvantage: !!p.isDisadvantage, isCrit: !!p.isCrit, trueDmg: !!p.trueDmg, execute: !!p.execute, detonate: !!p.detonate, nightmare: !!p.nightmare, element: p.element ?? null }));
  engine.on('heal', (p) => log.push({ type: 'heal', sourceUid: uidOf(p.source), targetUid: uidOf(p.target), amount: p.amount, kind: p.kind ?? null, isCrit: !!p.isCrit }));
  engine.on('shieldApplied', (p) => log.push({ type: 'shield', sourceUid: uidOf(p.source), targetUid: uidOf(p.target), amount: p.amount }));
  engine.on('enter', ({ unit }) => log.push({ type: 'enter', uid: uidOf(unit), cardId: unit.cardId }));
  engine.on('dispel', (p) => log.push({ type: 'dispel', uid: uidOf(p.unit), what: p.what, count: p.count }));
  engine.on('death', ({ unit }) => log.push({ type: 'death', uid: uidOf(unit) }));
  engine.on('revive', ({ unit, hp }) => log.push({ type: 'revive', uid: uidOf(unit), hp }));
  engine.on('stunned', ({ unit, reason }) => log.push({ type: 'stunned', uid: uidOf(unit), reason: reason ?? 'silence' }));
  engine.on('miss', ({ source, target, skill }) => log.push({ type: 'miss', sourceUid: uidOf(source), targetUid: uidOf(target), skill }));
  engine.on('trigger', ({ unit, on, name }) => log.push({ type: 'trigger', uid: uidOf(unit), on, name }));
  engine.on('resist', ({ target, skill }) => log.push({ type: 'resist', uid: uidOf(target), skill }));
  engine.on('blocked', ({ target, skill }) => log.push({ type: 'blocked', uid: uidOf(target), skill }));
  engine.on('cheated', ({ unit }) => log.push({ type: 'cheated', uid: uidOf(unit) }));
  engine.on('bossPhase', ({ unit, phase }) => log.push({ type: 'bossPhase', uid: uidOf(unit), phase }));
  engine.on('bossBreak', ({ unit }) => log.push({ type: 'bossBreak', uid: uidOf(unit) }));
  engine.on('bossEnrage', ({ unit }) => log.push({ type: 'bossEnrage', uid: uidOf(unit) }));
  engine.on('buffchange', ({ unit, buffs }) => log.push({ type: 'buffchange', uid: uidOf(unit), buffs: buffs ?? [] }));
  engine.on('battleEnd', ({ winner }) => log.push({ type: 'battleEnd', winner }));

  const MAX = 100000;
  let steps = 0;
  while (!engine.over && steps < MAX) { engine.step(); steps += 1; }
  return { setup, log, winner: engine.winner, rounds: engine.round, env: env ?? null };
}
