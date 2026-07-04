import { describe, it, expect } from 'vitest';
import { AnimationDirector, DELAYS } from './animationDirector.js';
import { Replayer } from '../battle/replayer.js';

const mkReplayer = (log) => new Replayer([], log);

describe('AnimationDirector', () => {
  it('依 DELAYS 節奏播放：attack 後要等預算時間才播下一筆', () => {
    const r = mkReplayer([
      { type: 'attack' }, { type: 'attack' }, { type: 'attack' },
    ]);
    const d = new AnimationDirector(r);
    d.update(0.01);           // 第一筆立即播
    expect(r.cursor).toBe(1);
    d.update(0.1);            // 未達 0.25 預算
    expect(r.cursor).toBe(1);
    d.update(0.2);            // 累計超過
    expect(r.cursor).toBe(2);
  });

  it('零預算條目同幀連發', () => {
    const r = mkReplayer([
      { type: 'energy', uid: 1, value: 5 }, { type: 'round', round: 1 }, { type: 'buffchange', uid: 1 }, { type: 'attack' },
    ]);
    const d = new AnimationDirector(r);
    d.update(0.01);
    expect(r.cursor).toBe(4); // 三筆零預算 + 一筆 attack 全在同幀
  });

  it('speed 3 播完所需 update 次數少於 speed 1', () => {
    const log = Array.from({ length: 10 }, () => ({ type: 'attack' }));
    const count = (speed) => {
      const r = mkReplayer([...log]);
      const d = new AnimationDirector(r);
      d.speed = speed;
      let n = 0;
      while (!d.done && n < 1000) { d.update(0.05); n += 1; }
      return n;
    };
    expect(count(3)).toBeLessThan(count(1));
  });

  it('done 跟隨 replayer', () => {
    const r = mkReplayer([{ type: 'attack' }]);
    const d = new AnimationDirector(r);
    expect(d.done).toBe(false);
    d.update(1);
    expect(d.done).toBe(true);
  });

  it('DELAYS 精確值', () => {
    expect(DELAYS).toEqual({
      turn: 0.1, attack: 0.25, ultimate: 1.05, damage: 0.18,
      heal: 0.15, death: 0.25, stunned: 0.25, revive: 0.45, dispel: 0.25,
      weather: 0.55, terrain: 0.55, drain: 0.12, miss: 0.22,
    });
  });
});
