// src/battle/battleLog.test.js
import { describe, it, expect } from 'vitest';
import { simulateBattle } from './battleLog.js';
import { _resetUid } from './unit.js';
import { makeUnit } from './testHelpers.js';
import { Rng } from '../core/rng.js';

function build() {
  _resetUid(1);
  const a = makeUnit({ team: 0, pos: 1, class: 'dps', name: 'A', atk: 150, hp: 1000 });
  const b = makeUnit({ team: 1, pos: 1, class: 'tank', name: 'B', hp: 1200 });
  return [[a], [b]];
}

describe('battleLog', () => {
  it('確定性：同 seed → 相同 log 與 winner', () => {
    const [a1, b1] = build();
    const r1 = simulateBattle(a1, b1, { rng: new Rng(42) });
    const [a2, b2] = build();
    const r2 = simulateBattle(a2, b2, { rng: new Rng(42) });
    expect(r1.log).toEqual(r2.log);
    expect(r1.winner).toBe(r2.winner);
  });

  it('log 可序列化、battleEnd 為最後一筆', () => {
    const [a, b] = build();
    const { setup, log, winner } = simulateBattle(a, b, { rng: new Rng(7) });
    expect(setup[0]).toHaveProperty('uid');
    expect(setup[0]).toHaveProperty('maxHp');
    expect(JSON.parse(JSON.stringify(log))).toEqual(log); // 只含原始值
    const last = log[log.length - 1];
    expect(last.type).toBe('battleEnd');
    expect(last.winner).toBe(winner);
  });
});
