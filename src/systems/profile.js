// 展示用推導值：關卡「章-節」標籤、看板英雄。純推導，無寫入。
import { store } from '../core/state.js';

// 關卡編號 → 「章-節」（每章 10 關）：stage 12 → '2-2'。
export function stageLabel(stage = 1) {
  const ch = Math.floor((stage - 1) / 10) + 1;
  const idx = ((stage - 1) % 10) + 1;
  return `${ch}-${idx}`;
}

// 看板/頭像用：等級最高的出戰英雄（無陣容則全卡最高；無卡回 null）。
export function featuredHero(state = store.state) {
  const inFormation = state.formation
    .map((e) => state.cards.find((c) => c.instanceId === e.instanceId))
    .filter(Boolean);
  const pool = inFormation.length ? inFormation : state.cards;
  if (!pool.length) return null;
  return [...pool].sort((a, b) => b.level - a.level)[0];
}
