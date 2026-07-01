// src/battle/skills.test.js
import { describe, it, expect } from 'vitest';
import { normalAttack } from './skills.js';
import { makeUnit } from './testHelpers.js';
import { Rng } from '../core/rng.js';

function ctxFor(caster, allies, enemies) {
  return { allies, enemies, rng: new Rng(1), emit: () => {} };
}

describe('普攻集氣', () => {
  it('輸出普攻自身 +25、被擊坦克 +20、隊友輔助 +12', () => {
    const dps = makeUnit({ team: 0, pos: 1, class: 'dps' });
    const support = makeUnit({ team: 0, pos: 5, class: 'support' });
    const foeTank = makeUnit({ team: 1, pos: 1, class: 'tank', hp: 99999 });
    normalAttack(dps, ctxFor(dps, [dps, support], [foeTank]));
    expect(dps.energy).toBe(25);
    expect(support.energy).toBe(12);
    expect(foeTank.energy).toBe(20);
  });
});
