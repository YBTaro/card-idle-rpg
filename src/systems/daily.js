// 每日 12:00 發放。規則用佔位常數，之後可調（連續登入、數量等）。
import { store } from '../core/state.js';
import { saveGame } from '../core/save.js';

export const DAILY_HOUR = 12; // 每日 12:00 發放
export const DAILY_REWARD = { tickets: 5, gold: 300 }; // 佔位獎勵

// 「now 之前最近一次 12:00」的時間戳（本地時區）。
export function lastNoonBefore(now = Date.now()) {
  const d = new Date(now);
  d.setHours(DAILY_HOUR, 0, 0, 0);
  if (d.getTime() > now) d.setDate(d.getDate() - 1); // 還沒到今天 12:00 → 昨天 12:00
  return d.getTime();
}

// 「now 之後下一次 12:00」（給倒數用）。
export function nextNoonAfter(now = Date.now()) {
  const d = new Date(now);
  d.setHours(DAILY_HOUR, 0, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function isClaimable(state = store.state, now = Date.now()) {
  return (state.daily.lastClaim || 0) < lastNoonBefore(now);
}

// 領取。回傳 { ok, reward? }
export function claimDaily(state = store.state, now = Date.now()) {
  if (!isClaimable(state, now)) return { ok: false, reason: 'not-ready' };
  state.currencies.tickets += DAILY_REWARD.tickets;
  state.currencies.gold += DAILY_REWARD.gold;
  state.daily.lastClaim = now;
  saveGame();
  store.notify();
  return { ok: true, reward: DAILY_REWARD };
}

// 距離下次發放的毫秒數（倒數用）。
export function msUntilNext(now = Date.now()) {
  return Math.max(0, nextNoonAfter(now) - now);
}
