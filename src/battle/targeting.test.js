import { describe, it, expect } from 'vitest';
import { pickMeleeTarget, lowestHpAlly } from './targeting.js';
import { makeUnit } from './testHelpers.js';

describe('普攻前排優先選敵', () => {
  it('有前排存活時只打前排', () => {
    const front = makeUnit({ pos: 1, name: 'F' });
    const back = makeUnit({ pos: 4, name: 'B' });
    for (let i = 0; i < 20; i++) {
      expect(pickMeleeTarget([front, back])).toBe(front);
    }
  });

  it('前排全滅才打後排', () => {
    const front = makeUnit({ pos: 1, name: 'F', hp: 10 });
    const back = makeUnit({ pos: 4, name: 'B' });
    front.takeDamage(10); // 前排陣亡
    expect(front.alive).toBe(false);
    expect(pickMeleeTarget([front, back])).toBe(back);
  });

  it('全部陣亡回傳 null', () => {
    const u = makeUnit({ hp: 5 });
    u.takeDamage(5);
    expect(pickMeleeTarget([u])).toBe(null);
  });
});

describe('治療目標', () => {
  it('挑血量比例最低的存活隊友', () => {
    const a = makeUnit({ hp: 1000 });
    const b = makeUnit({ hp: 1000 });
    b.takeDamage(800); // b 剩 20%
    expect(lowestHpAlly([a, b])).toBe(b);
  });
});
