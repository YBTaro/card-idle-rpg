import { describe, it, expect } from 'vitest';
import { computeDamage, CRIT_MULT } from './damage.js';

// 依序回傳指定值的假亂數
function fakeRng(values) {
  let i = 0;
  return { next: () => values[i++] };
}

const atk = { element: 'fire', atk: 100 };
const def = { element: 'light', def: 0 }; // 火 vs 光 = 無剋制(1.0)

describe('暴擊', () => {
  it('暴擊傷害為非暴擊的 1.5 倍（variance 相同）', () => {
    // 擲骰順序：variance=0.5(→倍率1.0), crit
    const noCrit = computeDamage(atk, def, 1, fakeRng([0.5, 0.9]), 1); // 0.9 ≥ 0.1 → 無暴擊
    const crit = computeDamage(atk, def, 1, fakeRng([0.5, 0.05]), 1); // 0.05 < 0.1 → 暴擊
    expect(noCrit.isCrit).toBe(false);
    expect(crit.isCrit).toBe(true);
    expect(crit.amount).toBe(Math.round(noCrit.amount * CRIT_MULT));
  });
});
