// src/battle/engine.test.js
import { describe, it, expect } from 'vitest';
import { BattleEngine, ENERGY_MAX } from './engine.js';
import { makeUnit } from './testHelpers.js';
import { Rng } from '../core/rng.js';
import { applyBuff } from './buffs.js';

function runSteps(engine, maxSteps = 200000) {
  let n = 0;
  while (!engine.over && n < maxSteps) { engine.step(); n += 1; }
  return engine;
}

describe('BattleEngine（回合制）', () => {
  it('出手序列：我方先於敵方', () => {
    const me = makeUnit({ team: 0, pos: 1, name: 'me' });
    const foe = makeUnit({ team: 1, pos: 1, name: 'foe' });
    const engine = new BattleEngine([me], [foe], { rng: new Rng(1) });
    const order = [];
    engine.on('turn', ({ unit }) => order.push(unit.name));
    engine.step();
    expect(order[0]).toBe('me');
  });

  it('一方全滅即結束並判定勝者', () => {
    const hero = makeUnit({ team: 0, pos: 1, atk: 300, hp: 2000 });
    const dummy = makeUnit({ team: 1, pos: 1, atk: 5, hp: 100, def: 0 });
    const engine = new BattleEngine([hero], [dummy], { rng: new Rng(7) });
    let ended = null;
    engine.on('battleEnd', ({ winner }) => (ended = winner));
    runSteps(engine);
    expect(engine.over).toBe(true);
    expect(ended).toBe(0);
    expect(dummy.alive).toBe(false);
  });

  it('有人滿氣→技能階段自動施放並清空能量', () => {
    const dps = makeUnit({ team: 0, pos: 1, class: 'dps', atk: 100, name: 'dps', energy: ENERGY_MAX });
    const foe = makeUnit({ team: 1, pos: 1, hp: 100000, def: 0, name: 'foe' });
    const engine = new BattleEngine([dps], [foe], { rng: new Rng(3) });
    let ult = false;
    engine.on('ultimate', () => (ult = true));
    engine.step(); // 普攻（滿氣）→ 觸發中斷
    engine.step(); // 技能階段施放
    expect(ult).toBe(true);
    expect(dps.energy).toBe(0);
  });

  it('屬性剋制傷害較高', () => {
    const a0 = makeUnit({ team: 0, pos: 1, element: 'fire', atk: 100, def: 0 });
    const aF = makeUnit({ team: 1, pos: 1, element: 'wind', hp: 100000, def: 0 });
    const e1 = new BattleEngine([a0], [aF], { rng: new Rng(0) });
    e1.step();
    const advDmg = aF.maxHp - aF.hp;

    const d0 = makeUnit({ team: 0, pos: 1, element: 'fire', atk: 100, def: 0 });
    const dW = makeUnit({ team: 1, pos: 1, element: 'water', hp: 100000, def: 0 });
    const e2 = new BattleEngine([d0], [dW], { rng: new Rng(0) });
    e2.step();
    const disDmg = dW.maxHp - dW.hp;

    expect(advDmg).toBeGreaterThan(disDmg);
  });

  it('坦克技能給全隊減傷 buff（dmgTaken stat）', () => {
    const tank = makeUnit({ team: 0, pos: 1, class: 'tank', name: 'tank', energy: ENERGY_MAX });
    const ally = makeUnit({ team: 0, pos: 2, class: 'dps', name: 'ally' });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, name: 'foe' });
    const engine = new BattleEngine([tank, ally], [foe], { rng: new Rng(5) });
    engine.step(); // tank 普攻（滿氣）→ 中斷
    engine.step(); // 技能階段：tank 放 guard
    expect(ally.buffs?.some((b) => b.key === 'guard' && b.stat === 'dmgTaken')).toBe(true);
  });

  it('達回合上限依存活血量判定（同分平手）', () => {
    const a = makeUnit({ team: 0, pos: 1, atk: 1, def: 100000, hp: 100000 });
    const b = makeUnit({ team: 1, pos: 1, atk: 1, def: 100000, hp: 100000 });
    const engine = new BattleEngine([a], [b], { rng: new Rng(2) });
    let winner = 'none';
    engine.on('battleEnd', ({ winner: w }) => (winner = w));
    runSteps(engine);
    expect(engine.over).toBe(true);
    expect(winner).toBe(-1);
  });

  it('普攻會遞減 buff duration', () => {
    const me = makeUnit({ team: 0, pos: 1, class: 'dps', atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999 });
    applyBuff(me, { kind: 'stat', stat: 'atk', op: 'add', value: 5, duration: 2 });
    const engine = new BattleEngine([me], [foe], { rng: new Rng(1) });
    engine.step(); // me 普攻（我1 先手，能量不足 → 普攻）
    expect(me.buffs.find((b) => b.stat === 'atk').duration).toBe(1);
  });

  it('放技能不算回合、不遞減 buff duration', () => {
    const me = makeUnit({ team: 0, pos: 1, class: 'dps', atk: 100, energy: ENERGY_MAX });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999 });
    applyBuff(me, { kind: 'stat', stat: 'atk', op: 'add', value: 5, duration: 2 });
    const engine = new BattleEngine([me], [foe], { rng: new Rng(1) });
    engine.step(); // me 普攻（滿氣）→ tick 2→1，之後中斷進技能階段
    engine.step(); // 技能階段：me 放技能 → 不 tick → 維持 1
    expect(me.buffs.find((b) => b.stat === 'atk')?.duration).toBe(1);
  });
});
