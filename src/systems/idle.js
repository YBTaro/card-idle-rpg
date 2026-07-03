// 掛機獎勵箱：離線/放置期間按關卡進度累積金幣與精華，上限 12 小時（製造回訪理由）。
// 純函式 + store 寫入；速率為佔位平衡值。
import { store } from '../core/state.js';
import { saveGame } from '../core/save.js';

export const IDLE_CAP_MS = 12 * 3600 * 1000; // 累積上限 12 小時
export const IDLE_MIN_CLAIM_MS = 60 * 1000; // 低於 1 分鐘視為空箱

// 每分鐘產出（依當前關卡成長）。
export function idleRates(stage = 1) {
  return {
    gold: 3 + stage * 2,
    essence: 0.5 + stage * 0.15,
  };
}

// 目前累積量（不落地）。
export function idlePending(state = store.state, now = Date.now()) {
  const last = state.idle?.lastClaim ?? now;
  const ms = Math.max(0, Math.min(now - last, IDLE_CAP_MS));
  const minutes = ms / 60000;
  const r = idleRates(state.progress.stage || 1);
  return {
    gold: Math.floor(minutes * r.gold),
    essence: Math.floor(minutes * r.essence),
    minutes: Math.floor(minutes),
    capped: ms >= IDLE_CAP_MS,
    ratio: ms / IDLE_CAP_MS,
  };
}

export function canClaimIdle(state = store.state, now = Date.now()) {
  const last = state.idle?.lastClaim ?? now;
  return now - last >= IDLE_MIN_CLAIM_MS;
}

// 開箱。回傳 { ok, reward? }
export function claimIdle(state = store.state, now = Date.now()) {
  if (!canClaimIdle(state, now)) return { ok: false, reason: 'empty' };
  const reward = idlePending(state, now);
  state.currencies.gold += reward.gold;
  state.inventory.materials.essence = (state.inventory.materials.essence || 0) + reward.essence;
  state.idle.lastClaim = now;
  saveGame();
  store.notify();
  return { ok: true, reward };
}
