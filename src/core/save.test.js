import { describe, it, expect } from 'vitest';
import { migrateTower } from './save.js';

describe('存檔遷移 · tower', () => {
  it('舊 {floor:5} → 烈日塔已通 1..4', () => {
    const data = { tower: { floor: 5 } };
    migrateTower(data);
    expect(data.tower.floor).toBeUndefined();
    expect(data.tower.tracks.sunny.cleared).toEqual([1, 2, 3, 4]);
  });
  it('新結構原封不動', () => {
    const data = { tower: { tracks: { rain: { cleared: [1] } } } };
    migrateTower(data);
    expect(data.tower.tracks.rain.cleared).toEqual([1]);
  });
  it('無 tower 欄位補空結構', () => {
    const data = {};
    migrateTower(data);
    expect(data.tower.tracks).toEqual({});
  });
});
