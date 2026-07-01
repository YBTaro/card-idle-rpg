import { describe, it, expect } from 'vitest';
import { pickMeleeTarget, lowestHpAlly, singleEnemyByColumn } from './targeting.js';
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

describe('直行選擇器 singleEnemyByColumn', () => {
  const enemies = (posList) => posList.map((pos) => makeUnit({ team: 1, pos, name: `E${pos}` }));

  it('前排 1 有人、2 空 → 直行B 打 1 號', () => {
    const es = enemies([1, 3]); // 2 號空
    const attacker = makeUnit({ team: 0, pos: 2 }); // 直行B
    expect(singleEnemyByColumn(attacker, es).pos).toBe(1);
  });

  it('前排 1、2 空、3 有人 → 打 3 號', () => {
    const es = enemies([3]);
    const attacker = makeUnit({ team: 0, pos: 2 });
    expect(singleEnemyByColumn(attacker, es).pos).toBe(3);
  });

  it('前排 3 空 → 直行C 打 2 號', () => {
    const es = enemies([1, 2]); // 3 號空
    const attacker = makeUnit({ team: 0, pos: 3 }); // 直行C
    expect(singleEnemyByColumn(attacker, es).pos).toBe(2);
  });

  it('前排全空 → 打後排對位（直行A → 4）', () => {
    const es = enemies([4, 5, 6]);
    const attacker = makeUnit({ team: 0, pos: 1 }); // 直行A
    expect(singleEnemyByColumn(attacker, es).pos).toBe(4);
  });

  it('全部陣亡回傳 null', () => {
    const es = enemies([1]);
    es[0].takeDamage(es[0].hp);
    expect(singleEnemyByColumn(makeUnit({ team: 0, pos: 1 }), es)).toBe(null);
  });
});
