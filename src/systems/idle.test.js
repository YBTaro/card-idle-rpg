import { describe, it, expect } from 'vitest';
import { idlePending, claimIdle, canClaimIdle, idleRates, IDLE_CAP_MS } from './idle.js';

function freshState(lastClaim, stage = 1) {
  return {
    currencies: { tickets: 0, gold: 0 },
    inventory: { materials: { essence: 0 } },
    idle: { lastClaim },
    progress: { wins: 0, losses: 0, stage },
  };
}

describe('掛機獎勵箱', () => {
  it('依經過時間與關卡速率累積', () => {
    const t0 = 1_000_000_000;
    const state = freshState(t0, 5);
    const now = t0 + 30 * 60 * 1000; // 30 分鐘
    const p = idlePending(state, now);
    const r = idleRates(5);
    expect(p.gold).toBe(Math.floor(30 * r.gold));
    expect(p.essence).toBe(Math.floor(30 * r.essence));
    expect(p.capped).toBe(false);
  });

  it('12 小時封頂', () => {
    const t0 = 1_000_000_000;
    const state = freshState(t0);
    const now = t0 + IDLE_CAP_MS * 3;
    const p = idlePending(state, now);
    const capped = idlePending(state, t0 + IDLE_CAP_MS);
    expect(p.gold).toBe(capped.gold);
    expect(p.capped).toBe(true);
  });

  it('開箱入帳並重置計時；1 分鐘內視為空箱', () => {
    const t0 = 1_000_000_000;
    const state = freshState(t0, 1);
    const now = t0 + 2 * 60 * 60 * 1000; // 2 小時
    expect(canClaimIdle(state, now)).toBe(true);
    const expected = idlePending(state, now);
    const r = claimIdle(state, now);
    expect(r.ok).toBe(true);
    expect(state.currencies.gold).toBe(expected.gold);
    expect(state.inventory.materials.essence).toBe(expected.essence);
    expect(state.idle.lastClaim).toBe(now);
    // 剛領完馬上再開 → 空箱
    expect(claimIdle(state, now + 1000).ok).toBe(false);
  });
});
