import { describe, it, expect } from 'vitest';
import { SIGNIN_TABLE, signinDayIndex, canSignin, claimSignin } from './signin.js';

function at(y, mo, d, h) {
  return new Date(y, mo - 1, d, h, 0, 0, 0).getTime();
}

function freshState() {
  return {
    currencies: { tickets: 0, gold: 0 },
    inventory: { materials: { essence: 0 } },
    daily: { lastClaim: 0, streak: 0 },
  };
}

describe('七日簽到', () => {
  it('連續簽到走獎勵表，第 8 天回到第 1 格', () => {
    const state = freshState();
    for (let i = 0; i < 8; i++) {
      const now = at(2026, 6, 1 + i, 13);
      expect(canSignin(state, now)).toBe(true);
      const expectedDay = i % 7;
      expect(signinDayIndex(state)).toBe(expectedDay);
      const r = claimSignin(state, now);
      expect(r.ok).toBe(true);
      expect(r.day).toBe(expectedDay);
    }
    expect(state.daily.streak).toBe(8);
  });

  it('同一天不能簽兩次；獎勵正確入帳', () => {
    const state = freshState();
    const now = at(2026, 6, 30, 13);
    const r = claimSignin(state, now);
    expect(r.ok).toBe(true);
    expect(state.currencies.tickets).toBe(SIGNIN_TABLE[0].reward.tickets);
    expect(claimSignin(state, now).ok).toBe(false);
    expect(canSignin(state, now)).toBe(false);
  });
});
