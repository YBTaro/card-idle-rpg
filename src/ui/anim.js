// 介面動效工具：消滅「瞬間彈開」的生硬感。
// - staggerIn：清單/卡片進場交錯滑入（每個頁面 render 完呼叫一次）
// - flyReward：獎勵圖示飛向左上貨幣列（領獎/購買的視覺回饋）
// - popIn：單一元素彈入（結果徽章、重點數字）
// 全部尊重 prefers-reduced-motion（style.css 已全域降速）。
import { gsap } from 'gsap';

// 子節點交錯進場：淡入 + 上滑。maxN 之後的節點直接顯示（長清單不拖節奏）。
export function staggerIn(nodes, { dy = 16, step = 0.045, duration = 0.32, maxN = 14 } = {}) {
  const list = Array.from(nodes).filter(Boolean);
  if (!list.length) return;
  const animated = list.slice(0, maxN);
  gsap.fromTo(
    animated,
    { opacity: 0, y: dy },
    { opacity: 1, y: 0, duration, ease: 'power2.out', stagger: step, clearProps: 'transform,opacity' }
  );
}

// 元素彈入（back ease）：結果徽章 / 樓層推進數字。
export function popIn(node, { scale = 0.5, duration = 0.4 } = {}) {
  gsap.fromTo(node, { scale, opacity: 0 }, { scale: 1, opacity: 1, duration, ease: 'back.out(1.8)', clearProps: 'transform' });
}

// 獎勵飛行：從來源元素（或畫面中央）飛數枚圖示到左上貨幣列。
// grants: { gold, essence, tickets } → 🪙/🔹/🎟️ 各飛 2~4 枚。
export function flyReward(grants = {}, fromEl = null) {
  const icons = [];
  if (grants.gold) icons.push(...Array(3).fill('🪙'));
  if (grants.essence) icons.push(...Array(3).fill('🔹'));
  if (grants.tickets) icons.push(...Array(2).fill('🎟️'));
  if (!icons.length) return;

  let fx = window.innerWidth / 2;
  let fy = window.innerHeight / 2;
  if (fromEl?.getBoundingClientRect) {
    const r = fromEl.getBoundingClientRect();
    fx = r.left + r.width / 2;
    fy = r.top + r.height / 2;
  }
  icons.forEach((icon, i) => {
    const node = document.createElement('div');
    node.className = 'reward-fly';
    node.textContent = icon;
    node.style.left = `${fx + (Math.random() * 60 - 30)}px`;
    node.style.top = `${fy + (Math.random() * 30 - 15)}px`;
    document.body.appendChild(node);
    gsap.fromTo(node, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.16, delay: i * 0.05 });
    gsap.to(node, {
      left: 70 + Math.random() * 60,
      top: 22 + Math.random() * 14,
      scale: 0.6,
      opacity: 0.15,
      duration: 0.65,
      delay: 0.18 + i * 0.05,
      ease: 'power2.in',
      onComplete: () => node.remove(),
    });
  });
}
