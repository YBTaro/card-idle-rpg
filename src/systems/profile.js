// 玩家檔案與展示用推導值：玩家等級（由勝場推導，不另設經驗系統）、
// 隊伍總戰力、關卡「章-節」標籤。純推導，無寫入。
import { store } from '../core/state.js';
import { deriveStats, computePower } from '../core/stats.js';

const WINS_PER_LEVEL = 3; // 每 3 勝升 1 級（佔位）

export function playerLevel(state = store.state) {
  return 1 + Math.floor((state.progress.wins || 0) / WINS_PER_LEVEL);
}

// 出戰隊伍總戰力。
export function teamPower(state = store.state) {
  let total = 0;
  for (const entry of state.formation) {
    const inst = state.cards.find((c) => c.instanceId === entry.instanceId);
    if (inst) total += computePower(deriveStats(inst));
  }
  return total;
}

// 關卡編號 → 「章-節」（每章 10 關）：stage 12 → '2-2'。
export function stageLabel(stage = 1) {
  const ch = Math.floor((stage - 1) / 10) + 1;
  const idx = ((stage - 1) % 10) + 1;
  return `${ch}-${idx}`;
}

// 頭像用：等級最高的出戰英雄（無陣容則全卡最高；無卡回 null）。
export function featuredHero(state = store.state) {
  const inFormation = state.formation
    .map((e) => state.cards.find((c) => c.instanceId === e.instanceId))
    .filter(Boolean);
  const pool = inFormation.length ? inFormation : state.cards;
  if (!pool.length) return null;
  return [...pool].sort((a, b) => b.level - a.level)[0];
}
