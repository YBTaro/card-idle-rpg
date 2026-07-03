// 七日簽到：沿用 daily.js 的每日 12:00 發放窗口（isClaimable），
// 以 streak 走 7 天循環獎勵表；第 7 天大獎後回到第 1 天。
import { store } from '../core/state.js';
import { saveGame } from '../core/save.js';
import { isClaimable } from './daily.js';

export const SIGNIN_TABLE = [
  { icon: '🎟️', label: '召喚券 ×5', reward: { tickets: 5 } },
  { icon: '🪙', label: '金幣 ×600', reward: { gold: 600 } },
  { icon: '🔹', label: '精華 ×120', reward: { essence: 120 } },
  { icon: '🎟️', label: '召喚券 ×6', reward: { tickets: 6 } },
  { icon: '🪙', label: '金幣 ×1000', reward: { gold: 1000 } },
  { icon: '🔹', label: '精華 ×240', reward: { essence: 240 } },
  { icon: '🎁', label: '大獎：券 ×12 + 金幣 ×1200', reward: { tickets: 12, gold: 1200 } },
];

// 今天要領的是第幾格（0..6）。
export function signinDayIndex(state = store.state) {
  return (state.daily.streak || 0) % 7;
}

export function canSignin(state = store.state, now = Date.now()) {
  return isClaimable(state, now);
}

// 簽到。回傳 { ok, day, reward? }
export function claimSignin(state = store.state, now = Date.now()) {
  if (!canSignin(state, now)) return { ok: false, reason: 'not-ready' };
  const day = signinDayIndex(state);
  const { reward } = SIGNIN_TABLE[day];
  if (reward.tickets) state.currencies.tickets += reward.tickets;
  if (reward.gold) state.currencies.gold += reward.gold;
  if (reward.essence) state.inventory.materials.essence = (state.inventory.materials.essence || 0) + reward.essence;
  state.daily.lastClaim = now;
  state.daily.streak = (state.daily.streak || 0) + 1;
  saveGame();
  store.notify();
  return { ok: true, day, reward };
}
