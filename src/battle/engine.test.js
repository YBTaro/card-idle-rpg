import { describe, it, expect } from 'vitest';
import { BattleEngine, ATB_MAX, ENERGY_MAX } from './engine.js';
import { makeUnit } from './testHelpers.js';
import { Rng } from '../core/rng.js';

function run(engine, maxSeconds = 120, dt = 1 / 30) {
  let t = 0;
  while (!engine.over && t < maxSeconds) {
    engine.update(dt);
    t += dt;
  }
  return engine;
}

describe('BattleEngine', () => {
  it('ATB 速度條：速度高者先行動', () => {
    const fast = makeUnit({ team: 0, spd: 200, name: 'fast' });
    const slow = makeUnit({ team: 1, spd: 50, name: 'slow' });
    const engine = new BattleEngine([fast], [slow], { rng: new Rng(1) });

    const order = [];
    engine.on('turn', ({ unit }) => order.push(unit.name));

    // 推進到第一個行動發生
    while (order.length === 0) engine.update(1 / 30);
    expect(order[0]).toBe('fast');
  });

  it('一方全滅即結束並判定勝者', () => {
    const hero = makeUnit({ team: 0, atk: 300, hp: 2000, spd: 120 });
    const dummy = makeUnit({ team: 1, atk: 5, hp: 100, def: 0, spd: 60 });
    const engine = new BattleEngine([hero], [dummy], { rng: new Rng(7) });

    let ended = null;
    engine.on('battleEnd', ({ winner }) => (ended = winner));
    run(engine);

    expect(engine.over).toBe(true);
    expect(ended).toBe(0);
    expect(dummy.alive).toBe(false);
  });

  it('能量滿時自動施放大招並清空能量', () => {
    const caster = makeUnit({ team: 0, class: 'dps', atk: 100, spd: 100, name: 'ult' });
    const target = makeUnit({ team: 1, hp: 100000, def: 0, spd: 1 });
    caster.energy = ENERGY_MAX;
    caster.atb = ATB_MAX; // 立刻可行動
    const engine = new BattleEngine([caster], [target], { rng: new Rng(3) });

    let ultCast = false;
    engine.on('ultimate', () => (ultCast = true));
    engine.update(0.001);

    expect(ultCast).toBe(true);
    expect(caster.energy).toBe(0);
  });

  it('屬性剋制讓傷害更高', () => {
    // fire 打 wind（剋制） vs fire 打 water（被剋）
    const atkAdv = makeUnit({ team: 0, element: 'fire', atk: 100, def: 0, spd: 100 });
    const defAdv = makeUnit({ team: 1, element: 'wind', hp: 100000, def: 0, spd: 1 });
    const e1 = new BattleEngine([atkAdv], [defAdv], { rng: new Rng(0) });
    atkAdv.atb = ATB_MAX;
    e1.update(0.001);
    const advDmg = defAdv.maxHp - defAdv.hp;

    const atkDis = makeUnit({ team: 0, element: 'fire', atk: 100, def: 0, spd: 100 });
    const defDis = makeUnit({ team: 1, element: 'water', hp: 100000, def: 0, spd: 1 });
    const e2 = new BattleEngine([atkDis], [defDis], { rng: new Rng(0) });
    atkDis.atb = ATB_MAX;
    e2.update(0.001);
    const disDmg = defDis.maxHp - defDis.hp;

    expect(advDmg).toBeGreaterThan(disDmg);
  });

  it('坦克大招給全隊減傷 buff', () => {
    const tank = makeUnit({ team: 0, pos: 1, class: 'tank', name: 'tank', spd: 100 });
    const ally = makeUnit({ team: 0, pos: 2, class: 'dps', name: 'ally', spd: 1 });
    const foe = makeUnit({ team: 1, pos: 1, spd: 1, hp: 99999 });
    tank.energy = ENERGY_MAX;
    tank.atb = ATB_MAX;
    const engine = new BattleEngine([tank, ally], [foe], { rng: new Rng(5) });
    engine.update(0.001);

    expect(ally.buffs?.some((b) => b.type === 'guard')).toBe(true);
  });
});
