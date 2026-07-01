import { describe, it, expect } from 'vitest';
import { lowestHpAlly, singleEnemyByColumn, SELECTORS } from './targeting.js';
import { makeUnit } from './testHelpers.js';
import { applyBuff } from './buffs.js';

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

describe('嘲諷（單體選敵）', () => {
  it('有嘲諷者時單體攻擊指向嘲諷者', () => {
    const attacker = makeUnit({ team: 0, pos: 1 }); // 直行A → 平常打 pos1
    const e1 = makeUnit({ team: 1, pos: 1, name: 'e1' });
    const e2 = makeUnit({ team: 1, pos: 2, name: 'e2' });
    applyBuff(e2, { kind: 'control', control: 'taunt', duration: 2 });
    expect(singleEnemyByColumn(attacker, [e1, e2]).name).toBe('e2');
  });

  it('無嘲諷時照原本規則（直行A → pos1）', () => {
    const attacker = makeUnit({ team: 0, pos: 1 });
    const e1 = makeUnit({ team: 1, pos: 1, name: 'e1' });
    const e2 = makeUnit({ team: 1, pos: 2, name: 'e2' });
    expect(singleEnemyByColumn(attacker, [e1, e2]).name).toBe('e1');
  });
});

describe('SELECTORS registry', () => {
  const ctxWith = (enemies, allies = []) => ({ enemies, allies, rng: null });

  it('enemyFrontRow：前排全空退位打後排', () => {
    const back = [makeUnit({ team: 1, pos: 4 }), makeUnit({ team: 1, pos: 5 })];
    const res = SELECTORS.enemyFrontRow(makeUnit({ team: 0, pos: 1 }), ctxWith(back));
    expect(res.map((u) => u.pos).sort()).toEqual([4, 5]);
  });

  it('enemyBackRow：後排全空退位打前排', () => {
    const front = [makeUnit({ team: 1, pos: 2 })];
    const res = SELECTORS.enemyBackRow(makeUnit({ team: 0, pos: 1 }), ctxWith(front));
    expect(res.map((u) => u.pos)).toEqual([2]);
  });

  it('enemyColumn：本直行全空 → 就近往小號', () => {
    // 直行C(攻擊者 pos3)：C 空 → B → A。敵方只有直行B(pos2)
    const enemies = [makeUnit({ team: 1, pos: 2 })];
    const res = SELECTORS.enemyColumn(makeUnit({ team: 0, pos: 3 }), ctxWith(enemies));
    expect(res.map((u) => u.pos)).toEqual([2]);
  });

  it('allEnemies：全部存活', () => {
    const enemies = [makeUnit({ team: 1, pos: 1 }), makeUnit({ team: 1, pos: 2 })];
    expect(SELECTORS.allEnemies(makeUnit({ team: 0, pos: 1 }), ctxWith(enemies)).length).toBe(2);
  });
});
