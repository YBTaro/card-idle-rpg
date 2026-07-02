import { describe, it, expect } from 'vitest';
import { computeDamage, CRIT_MULT, DEF_SOFTCAP } from './damage.js';
import { makeUnit } from './testHelpers.js';

function fakeRng(values) {
  let i = 0;
  return { next: () => values[i++] };
}

describe('暴擊', () => {
  it('暴擊傷害為非暴擊的 1.5 倍（variance 相同）', () => {
    const atk = makeUnit({ team: 0, pos: 1, atk: 100, element: 'fire' });
    const def = makeUnit({ team: 1, pos: 1, element: 'light', def: 0, hp: 99999 });
    const noCrit = computeDamage(atk, def, 1, fakeRng([0.5, 0.9])); // crit 0.9 ≥ 0.05 → 無暴擊
    const crit = computeDamage(atk, def, 1, fakeRng([0.5, 0.03])); // 0.03 < 0.05 → 暴擊
    expect(noCrit.isCrit).toBe(false);
    expect(crit.isCrit).toBe(true);
    expect(crit.amount).toBe(Math.round(noCrit.amount * CRIT_MULT));
  });
});

describe('防禦比值衰減（K/(K+def)）', () => {
  const hit = (defVal) => {
    const atk = makeUnit({ team: 0, pos: 1, atk: 100, element: 'fire' });
    const def = makeUnit({ team: 1, pos: 1, element: 'fire', def: defVal, hp: 99999 });
    return computeDamage(atk, def, 1, fakeRng([0.5, 0.9])).amount; // variance 1、無暴擊、無屬性剋制
  };

  it('def = K（軟上限）→ 傷害為 def 0 時的一半', () => {
    expect(hit(DEF_SOFTCAP)).toBe(Math.round(hit(0) / 2));
  });

  it('防禦遠高於攻擊，傷害遞減但永不歸零', () => {
    const extreme = hit(100000);
    expect(extreme).toBeGreaterThanOrEqual(1);
    expect(hit(300)).toBeGreaterThan(extreme); // 單調遞減
    expect(hit(0)).toBeGreaterThan(hit(300));
  });

  it('高防為遞減報酬：每 +100 def 的減傷幅度遞減', () => {
    const d0 = hit(0);
    const d100 = hit(100);
    const d200 = hit(200);
    expect(d0 - d100).toBeGreaterThan(d100 - d200);
  });
});
