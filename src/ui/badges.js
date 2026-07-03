// 紅點系統：從 state 純推導「哪裡有東西可領」，各畫面渲染時呼叫。
// 一處領完 → store.notify → 重繪 → 紅點自然熄滅。
import { store } from '../core/state.js';
import { questsBadge } from '../systems/quests.js';
import { canSignin } from '../systems/signin.js';
import { idlePending, canClaimIdle } from '../systems/idle.js';
import { el } from './dom.js';

const IDLE_BADGE_MIN = 30; // 掛機箱累積 ≥30 分鐘才亮點（避免常亮疲乏）

export function computeBadges(state = store.state) {
  const signin = canSignin(state);
  const quests = questsBadge(state);
  const idle = canClaimIdle(state) && idlePending(state).minutes >= IDLE_BADGE_MIN;
  return { signin, quests, idle, any: signin || quests || idle };
}

// 紅點元素（掛在 position:relative 的父元素右上角）。
export function dot() {
  return el('span', { class: 'dot' });
}
