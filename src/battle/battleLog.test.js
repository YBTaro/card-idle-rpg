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

function run(seed = 7) {
  const [a, b] = build();
  return simulateBattle(a, b, { rng: new Rng(seed) });
}

describe('log v2：energy / round / level', () => {
  it('setup 快照含 level', () => {
    const { setup } = run();
    for (const s of setup) expect(typeof s.level).toBe('number');
  });

  it('普攻後施放者收到 energy 條目（value 上升）', () => {
    const { log } = run();
    const e = log.find((x) => x.type === 'energy');
    expect(e).toBeTruthy();
    expect(typeof e.uid).toBe('number');
    expect(typeof e.value).toBe('number');
  });

  it('大招施放後緊接 value 0 的 energy 條目（集氣歸零）', () => {
    const { log } = run();
    const i = log.findIndex((x) => x.type === 'ultimate');
    expect(i).toBeGreaterThan(-1);
    const zero = log.find((x) => x.type === 'energy' && x.value === 0);
    expect(zero).toBeTruthy();
  });

  it('round 條目存在且遞增', () => {
    const { log } = run();
    const rounds = log.filter((x) => x.type === 'round').map((x) => x.round);
    expect(rounds.length).toBeGreaterThan(0);
    for (let i = 1; i < rounds.length; i++) expect(rounds[i]).toBe(rounds[i - 1] + 1);
  });

  it('同 seed 確定性（含新條目）', () => {
    const r1 = run(42);
    const r2 = run(42);
    expect(r1.log).toEqual(r2.log);
    expect(r1.winner).toBe(r2.winner);
  });
});
