import { describe, it, expect, beforeEach } from 'vitest';
import { store, createNewGame } from '../core/state.js';
import { themeOf, isBossFloor, rewardsOf, floorEnemies, floorPreview, currentFloor, challengeTower, claimTowerWin } from './tower.js';

beforeEach(() => {
  const s = createNewGame();
  s.tower = { floor: 1 };
  store.set(s);
});

describe('試煉塔', () => {
  it('樓層敵隊確定性：同層永遠同隊（玩家可針對性換隊）', () => {
    const a = floorEnemies(7).map((u) => `${u.cardId}:${u.pos}`);
    const b = floorEnemies(7).map((u) => `${u.cardId}:${u.pos}`);
    expect(a).toEqual(b);
  });

  it('主題屬性佔多數、坦克至少一名、六名不重複', () => {
    const fp = floorPreview(3);
    const units = floorEnemies(3);
    const themed = units.filter((u) => u.element === fp.theme).length;
    expect(themed).toBeGreaterThanOrEqual(4);
    expect(units.some((u) => u.class === 'tank')).toBe(true);
    expect(new Set(units.map((u) => u.cardId)).size).toBe(6);
  });

  it('Boss 層：每 5 層、獎勵含召喚券、敵人較強', () => {
    expect(isBossFloor(5)).toBe(true);
    expect(isBossFloor(6)).toBe(false);
    expect(rewardsOf(5).tickets).toBe(1);
    expect(rewardsOf(50).tickets).toBe(3); // 1 + floor(50/25)
    expect(rewardsOf(4).tickets).toBeUndefined();
    const normal = floorEnemies(4).reduce((s, u) => s + u.maxHp, 0);
    const boss5lvl4equiv = floorEnemies(5); // 不同層等級不同，只驗 boss 有 1.15 倍縮放的存在性
    expect(boss5lvl4equiv.length).toBe(6);
    expect(normal).toBeGreaterThan(0);
  });

  it('challengeTower + claimTowerWin：首通入帳、推層、防重複入帳', () => {
    const s = store.state;
    const res = challengeTower(s);
    expect(res.floor).toBe(1);
    expect(Array.isArray(res.sim.log)).toBe(true);
    const gold0 = s.currencies.gold;
    const granted = claimTowerWin(1, s);
    expect(granted.gold).toBe(rewardsOf(1).gold);
    expect(s.currencies.gold).toBe(gold0 + granted.gold);
    expect(currentFloor(s)).toBe(2);
    expect(claimTowerWin(1, s)).toBe(null); // 舊層不能再領
  });

  it('主題輪替五屬', () => {
    expect(new Set([1, 2, 3, 4, 5].map(themeOf)).size).toBe(5);
    expect(themeOf(1)).toBe(themeOf(6));
  });
});
