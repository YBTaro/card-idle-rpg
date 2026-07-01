// src/battle/positions.test.js
import { describe, it, expect } from 'vitest';
import { rowOf, columnOf, TURN_SEQUENCE } from './positions.js';

describe('positions', () => {
  it('rowOf：1-3 前排、4-6 後排', () => {
    expect([1, 2, 3].map(rowOf)).toEqual(['front', 'front', 'front']);
    expect([4, 5, 6].map(rowOf)).toEqual(['back', 'back', 'back']);
  });

  it('columnOf：直行 1|4、2|5、3|6', () => {
    expect([columnOf(1), columnOf(4)]).toEqual([1, 1]);
    expect([columnOf(2), columnOf(5)]).toEqual([2, 2]);
    expect([columnOf(3), columnOf(6)]).toEqual([3, 3]);
  });

  it('TURN_SEQUENCE：我1,敵1,…,我6,敵6', () => {
    expect(TURN_SEQUENCE).toEqual([
      [0, 1], [1, 1], [0, 2], [1, 2], [0, 3], [1, 3],
      [0, 4], [1, 4], [0, 5], [1, 5], [0, 6], [1, 6],
    ]);
  });
});
