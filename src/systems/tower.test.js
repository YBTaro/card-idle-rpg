import { describe, it, expect, beforeEach } from 'vitest';
import { store, createNewGame } from '../core/state.js';
import {
  isBossFloor, enemyLevel, enemyStars, bossPremium, rewardsOf,
  floorEnemies, floorPreview, isCleared, challengeTower, claimTowerWin,
} from './tower.js';
import { TRACK_TEAMS } from '../data/towerTeams.js';
import { CARDS } from '../data/cards.js';
import { deriveStats } from '../core/stats.js';

beforeEach(() => { store.set(createNewGame()); });

describe('試煉塔 · 難度', () => {
  it('等級＝關數；星級每 12 關 +1、封頂 5', () => {
    expect(enemyLevel(1)).toBe(1);
    expect(enemyLevel(80)).toBe(80);
    expect(enemyStars(11)).toBe(0);
    expect(enemyStars(12)).toBe(1);
    expect(enemyStars(60)).toBe(5);
    expect(enemyStars(80)).toBe(5);
  });
  it('Boss 溢價分三段', () => {
    expect(bossPremium(25)).toBeCloseTo(1.15);
    expect(bossPremium(55)).toBeCloseTo(1.25);
    expect(bossPremium(60)).toBeCloseTo(1.35);
  });
  it('Boss 獎勵含召喚券', () => {
    expect(isBossFloor(5)).toBe(true);
    expect(rewardsOf(5).tickets).toBe(1);
    expect(rewardsOf(50).tickets).toBe(3);
    expect(rewardsOf(4).tickets).toBeUndefined();
  });
});

describe('試煉塔 · 敵隊生成', () => {
  it('Boss 關＝精心隊、等級＝關數、6 名', () => {
    const units = floorEnemies('sunny', 80);
    expect(units).toHaveLength(6);
    expect(units.every((u) => u.level === 80)).toBe(true);
    expect(units.map((u) => u.cardId).sort()).toEqual([...TRACK_TEAMS.sunny.apex[80]].sort());
  });
  it('Boss 溢價：三圍＝基礎×溢價（四捨五入）', () => {
    const floor = 65;
    const units = floorEnemies('sunny', floor);
    expect(units).toHaveLength(6);
    // 首名對照：同卡、同級(=floor)、同星(=enemyStars+1)、無溢價的 deriveStats
    const first = units[0];
    expect(first.cardId).toBe(TRACK_TEAMS.sunny.apex[65][0]);
    const base = deriveStats({ cardId: first.cardId, level: enemyLevel(floor), stars: Math.min(5, enemyStars(floor) + 1) });
    expect(first.maxHp).toBe(Math.round(base.hp * bossPremium(floor)));
  });
  it('路關：確定性、偏主題屬性、至少一坦', () => {
    const a = floorEnemies('sunny', 7).map((u) => `${u.cardId}:${u.pos}`);
    const b = floorEnemies('sunny', 7).map((u) => `${u.cardId}:${u.pos}`);
    expect(a).toEqual(b);
    const units = floorEnemies('sunny', 7);
    expect(units.filter((u) => u.element === 'fire').length).toBeGreaterThanOrEqual(3);
    expect(units.some((u) => u.class === 'tank')).toBe(true);
  });
});

describe('試煉塔 · 進度（跳關 + 每塔獨立首通）', () => {
  it('challengeTower 跳關；claimTowerWin 首通入帳、防重複、每塔獨立', () => {
    const s = store.state;
    const res = challengeTower('sunny', 30, s);
    expect(res.floor).toBe(30);
    expect(res.trackId).toBe('sunny');
    expect(Array.isArray(res.sim.log)).toBe(true);

    const gold0 = s.currencies.gold;
    const granted = claimTowerWin('sunny', 30, s);
    expect(granted.gold).toBe(rewardsOf(30).gold);
    expect(s.currencies.gold).toBe(gold0 + granted.gold);
    expect(isCleared('sunny', 30, s)).toBe(true);
    expect(claimTowerWin('sunny', 30, s)).toBe(null);       // 同塔同關不重領
    expect(isCleared('rain', 30, s)).toBe(false);           // 別塔獨立
  });
  it('floorPreview 帶環境與 cleared 狀態', () => {
    const fp = floorPreview('surge', 60, store.state);
    expect(fp.isBoss).toBe(true);
    expect(fp.level).toBe(60);
    expect(fp.env).toEqual({ weather: null, terrain: 'surge' });
    expect(fp.enemies).toHaveLength(6);
    expect(fp.cleared).toBe(false);
  });
});
