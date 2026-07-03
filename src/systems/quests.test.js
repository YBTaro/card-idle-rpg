import { describe, it, expect } from 'vitest';
import {
  DAILY_QUESTS,
  ALL_DONE_ID,
  ALL_DONE_REWARD,
  ensureQuests,
  trackQuest,
  questProgress,
  questClaimable,
  claimQuest,
  allDoneClaimable,
  questsBadge,
} from './quests.js';

function at(y, mo, d, h, mi = 0) {
  return new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
}

function freshState() {
  return {
    currencies: { tickets: 0, gold: 0 },
    inventory: { materials: { essence: 0 } },
    daily: { lastClaim: 0, streak: 0, quests: null },
  };
}

describe('每日任務', () => {
  it('追蹤進度並在達標後可領取', () => {
    const state = freshState();
    const now = at(2026, 6, 30, 13);
    const win3 = DAILY_QUESTS.find((d) => d.id === 'win3');

    expect(questClaimable(win3, state, now)).toBe(false);
    trackQuest('win', 1, state, now);
    trackQuest('win', 1, state, now);
    expect(questProgress(win3, state, now)).toBe(2);
    expect(questClaimable(win3, state, now)).toBe(false);
    trackQuest('win', 1, state, now);
    expect(questClaimable(win3, state, now)).toBe(true);
    expect(questsBadge(state, now)).toBe(true);

    const r = claimQuest('win3', state, now);
    expect(r.ok).toBe(true);
    expect(state.currencies.gold).toBe(win3.reward.gold);
    // 不能重複領
    expect(claimQuest('win3', state, now).ok).toBe(false);
  });

  it('跨日（過 12:00）自動重置', () => {
    const state = freshState();
    const day1 = at(2026, 6, 30, 13);
    trackQuest('summon', 1, state, day1);
    expect(questProgress(DAILY_QUESTS[1], state, day1)).toBe(1);

    const day2 = at(2026, 7, 1, 13);
    ensureQuests(state, day2);
    expect(questProgress(DAILY_QUESTS[1], state, day2)).toBe(0);
    expect(state.daily.quests.claimed).toEqual([]);
  });

  it('全部領完 → 總獎勵可領', () => {
    const state = freshState();
    const now = at(2026, 6, 30, 13);
    trackQuest('win', 3, state, now);
    trackQuest('summon', 1, state, now);
    trackQuest('levelup', 1, state, now);
    for (const d of DAILY_QUESTS) expect(claimQuest(d.id, state, now).ok).toBe(true);
    expect(allDoneClaimable(state, now)).toBe(true);

    const before = state.currencies.tickets;
    const r = claimQuest(ALL_DONE_ID, state, now);
    expect(r.ok).toBe(true);
    expect(state.currencies.tickets).toBe(before + ALL_DONE_REWARD.tickets);
    expect(questsBadge(state, now)).toBe(false);
  });
});
