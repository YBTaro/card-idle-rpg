// 每日任務：以每日發放時刻（12:00，同 daily.js）為週期 key，過期自動重置。
// 追蹤點由呼叫端觸發（battleController 勝場 / 召喚流程 / 強化流程）。
import { store } from '../core/state.js';
import { saveGame } from '../core/save.js';
import { lastNoonBefore } from './daily.js';

export const DAILY_QUESTS = [
  { id: 'win3', label: '贏得 3 場戰鬥', type: 'win', target: 3, reward: { gold: 300 }, icon: '⚔' },
  { id: 'summon1', label: '進行 1 次召喚', type: 'summon', target: 1, reward: { gold: 200 }, icon: '🎴' },
  { id: 'levelup1', label: '強化英雄 1 次', type: 'levelup', target: 1, reward: { tickets: 1 }, icon: '⬆' },
];
export const ALL_DONE_ID = 'all';
export const ALL_DONE_REWARD = { tickets: 2 };

// 確保任務資料屬於當前週期（跨日自動重置）。
export function ensureQuests(state = store.state, now = Date.now()) {
  const key = lastNoonBefore(now);
  if (!state.daily.quests || state.daily.quests.key !== key) {
    state.daily.quests = { key, counters: {}, claimed: [] };
  }
  return state.daily.quests;
}

// 記一筆行為（type: 'win' | 'summon' | 'levelup'，可帶次數）。
export function trackQuest(type, count = 1, state = store.state, now = Date.now()) {
  const q = ensureQuests(state, now);
  q.counters[type] = (q.counters[type] || 0) + count;
  saveGame();
  store.notify();
}

export function questProgress(def, state = store.state, now = Date.now()) {
  const q = ensureQuests(state, now);
  return Math.min(def.target, q.counters[def.type] || 0);
}

export function questClaimed(id, state = store.state, now = Date.now()) {
  return ensureQuests(state, now).claimed.includes(id);
}

export function questClaimable(def, state = store.state, now = Date.now()) {
  return questProgress(def, state, now) >= def.target && !questClaimed(def.id, state, now);
}

// 全部每日任務都領過 → 總獎勵可領。
export function allDoneClaimable(state = store.state, now = Date.now()) {
  return DAILY_QUESTS.every((d) => questClaimed(d.id, state, now)) && !questClaimed(ALL_DONE_ID, state, now);
}

function applyReward(state, reward) {
  if (reward.gold) state.currencies.gold += reward.gold;
  if (reward.tickets) state.currencies.tickets += reward.tickets;
  if (reward.essence) state.inventory.materials.essence = (state.inventory.materials.essence || 0) + reward.essence;
}

// 領取單一任務（id 可為 ALL_DONE_ID）。回傳 { ok, reward? }
export function claimQuest(id, state = store.state, now = Date.now()) {
  const q = ensureQuests(state, now);
  if (id === ALL_DONE_ID) {
    if (!allDoneClaimable(state, now)) return { ok: false, reason: 'not-ready' };
    applyReward(state, ALL_DONE_REWARD);
    q.claimed.push(ALL_DONE_ID);
    saveGame();
    store.notify();
    return { ok: true, reward: ALL_DONE_REWARD };
  }
  const def = DAILY_QUESTS.find((d) => d.id === id);
  if (!def) return { ok: false, reason: 'unknown' };
  if (!questClaimable(def, state, now)) return { ok: false, reason: 'not-ready' };
  applyReward(state, def.reward);
  q.claimed.push(def.id);
  saveGame();
  store.notify();
  return { ok: true, reward: def.reward };
}

// 紅點：有任何可領取的任務。
export function questsBadge(state = store.state, now = Date.now()) {
  return DAILY_QUESTS.some((d) => questClaimable(d, state, now)) || allDoneClaimable(state, now);
}
