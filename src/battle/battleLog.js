// src/battle/battleLog.js
// 戰鬥 Log 產生器：跑完整場、收集初始快照 + 有序事件成可序列化 log。
import { BattleEngine } from './engine.js';

function snapshot(u) {
  return { uid: u.uid, team: u.team, pos: u.pos, name: u.name, element: u.element, class: u.class, cardId: u.cardId, maxHp: u.maxHp, level: u.level };
}
const uidOf = (u) => (u ? u.uid : null);

export function simulateBattle(teamA, teamB, { rng } = {}) {
  const engine = new BattleEngine(teamA, teamB, { rng });
  const setup = [...teamA, ...teamB].map(snapshot);
  const log = [];
  engine.on('turn', ({ unit }) => log.push({ type: 'turn', uid: uidOf(unit) }));
  engine.on('round', ({ round }) => log.push({ type: 'round', round }));
  engine.on('energy', ({ unit, value }) => log.push({ type: 'energy', uid: uidOf(unit), value }));
  engine.on('attack', ({ attacker, target, skill }) => log.push({ type: 'attack', attackerUid: uidOf(attacker), targetUid: uidOf(target), skill }));
  engine.on('ultimate', ({ caster, skill, target }) => log.push({ type: 'ultimate', casterUid: uidOf(caster), skill, targetUid: uidOf(target) }));
  engine.on('damage', (p) => log.push({ type: 'damage', sourceUid: uidOf(p.source), targetUid: uidOf(p.target), amount: p.amount, skill: p.skill, isAdvantage: !!p.isAdvantage, isDisadvantage: !!p.isDisadvantage, isCrit: !!p.isCrit }));
  engine.on('heal', (p) => log.push({ type: 'heal', sourceUid: uidOf(p.source), targetUid: uidOf(p.target), amount: p.amount }));
  engine.on('death', ({ unit }) => log.push({ type: 'death', uid: uidOf(unit) }));
  engine.on('stunned', ({ unit }) => log.push({ type: 'stunned', uid: uidOf(unit) }));
  engine.on('buffchange', ({ unit }) => log.push({ type: 'buffchange', uid: uidOf(unit) }));
  engine.on('battleEnd', ({ winner }) => log.push({ type: 'battleEnd', winner }));

  const MAX = 100000;
  let steps = 0;
  while (!engine.over && steps < MAX) { engine.step(); steps += 1; }
  return { setup, log, winner: engine.winner, rounds: engine.round };
}
