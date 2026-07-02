// src/battle/replayer.test.js
import { describe, it, expect } from 'vitest';
import { Replayer } from './replayer.js';
import { simulateBattle } from './battleLog.js';
import { _resetUid } from './unit.js';
import { makeUnit } from './testHelpers.js';
import { Rng } from '../core/rng.js';

function sim() {
  _resetUid(1);
  const a = makeUnit({ team: 0, pos: 1, class: 'dps', name: 'A', atk: 200, hp: 1000 });
  const b = makeUnit({ team: 1, pos: 1, class: 'tank', name: 'B', hp: 800 });
  return simulateBattle([a], [b], { rng: new Rng(9) });
}

describe('Replayer', () => {
  it('step 依序 emit 與 log 相同的 type 序列', () => {
    const { setup, log } = sim();
    const r = new Replayer(setup, log);
    const seen = [];
    ['turn', 'round', 'energy', 'attack', 'ultimate', 'damage', 'heal', 'death', 'stunned', 'buffchange', 'battleEnd'].forEach((t) => r.on(t, (e) => seen.push(e.type)));
    while (!r.done) r.step();
    expect(seen).toEqual(log.map((e) => e.type));
  });

  it('hp 追蹤：首筆 damage 後 = maxHp - amount', () => {
    const { setup, log } = sim();
    const r = new Replayer(setup, log);
    let e;
    do { e = r.step(); } while (e && e.type !== 'damage');
    const maxHp = setup.find((u) => u.uid === e.targetUid).maxHp;
    expect(r.hpOf(e.targetUid)).toBe(maxHp - e.amount);
  });

  it('skipToEnd 到終局、winner 正確', () => {
    const { setup, log, winner } = sim();
    const r = new Replayer(setup, log);
    r.skipToEnd();
    expect(r.done).toBe(true);
    expect(r.winner).toBe(winner);
  });

  it('energy 條目更新 energyOf', () => {
    const setup = [{ uid: 1, team: 0, pos: 1, maxHp: 100 }];
    const r = new Replayer(setup, [{ type: 'energy', uid: 1, value: 25 }]);
    expect(r.energyOf(1)).toBe(0);
    r.step();
    expect(r.energyOf(1)).toBe(25);
  });

  it('round 條目更新 round', () => {
    const r = new Replayer([], [{ type: 'round', round: 3 }]);
    expect(r.round).toBe(0);
    r.step();
    expect(r.round).toBe(3);
  });
});
