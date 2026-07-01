import { describe, it, expect } from 'vitest';
import { computeDamage, CRIT_MULT } from './damage.js';
import { makeUnit } from './testHelpers.js';

function fakeRng(values) {
  let i = 0;
  return { next: () => values[i++] };
}

describe('暴擊', () => {
  it('暴擊傷害為非暴擊的 1.5 倍（variance 相同）', () => {
    const atk = makeUnit({ team: 0, pos: 1, atk: 100, element: 'fire' });
    const def = makeUnit({ team: 1, pos: 1, element: 'light', def: 0, hp: 99999 });
    const noCrit = computeDamage(atk, def, 1, fakeRng([0.5, 0.9])); // crit 0.9 ≥ 0.1 → 無暴擊
    const crit = computeDamage(atk, def, 1, fakeRng([0.5, 0.05])); // 0.05 < 0.1 → 暴擊
    expect(noCrit.isCrit).toBe(false);
    expect(crit.isCrit).toBe(true);
    expect(crit.amount).toBe(Math.round(noCrit.amount * CRIT_MULT));
  });
});
