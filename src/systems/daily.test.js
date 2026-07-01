import { describe, it, expect } from 'vitest';
import { lastNoonBefore, nextNoonAfter, isClaimable, claimDaily, DAILY_REWARD } from './daily.js';

// 用本地時間建立固定時間戳
function at(y, mo, d, h, mi = 0) {
  return new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
}

describe('每日 12:00 邊界', () => {
  it('下午算當天 12:00', () => {
    const now = at(2026, 6, 30, 15); // 15:00
    expect(lastNoonBefore(now)).toBe(at(2026, 6, 30, 12));
  });

  it('上午算前一天 12:00', () => {
    const now = at(2026, 6, 30, 9); // 09:00
    expect(lastNoonBefore(now)).toBe(at(2026, 6, 29, 12));
  });

  it('下一個 12:00 在未來', () => {
    const now = at(2026, 6, 30, 9);
    expect(nextNoonAfter(now)).toBe(at(2026, 6, 30, 12));
    const now2 = at(2026, 6, 30, 13);
    expect(nextNoonAfter(now2)).toBe(at(2026, 7, 1, 12));
  });
});

describe('領取邏輯', () => {
  it('跨過 12:00 後可領，領一次後不可再領', () => {
    const state = { currencies: { tickets: 0, gold: 0 }, daily: { lastClaim: 0 } };
    const now = at(2026, 6, 30, 13);
    expect(isClaimable(state, now)).toBe(true);

    const res = claimDaily(state, now);
    expect(res.ok).toBe(true);
    expect(state.currencies.tickets).toBe(DAILY_REWARD.tickets);
    expect(state.currencies.gold).toBe(DAILY_REWARD.gold);

    // 同一天再領不行
    expect(isClaimable(state, now)).toBe(false);
    expect(claimDaily(state, now).ok).toBe(false);

    // 隔天 12:00 之後又可領
    const tomorrow = at(2026, 7, 1, 13);
    expect(isClaimable(state, tomorrow)).toBe(true);
  });
});
