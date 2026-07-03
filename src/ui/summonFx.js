// 召喚揭曉儀式（全螢幕）：蓄力 → 白閃爆發 → 卡背飛入 → 逐張翻面。
// 稀有卡翻面前金紋發光抖動「預告」；全程可點擊跳過；結果頁直接放「再抽一次」。
// 時間常數對齊報告 §5 動畫規格。
import { gsap } from 'gsap';
import { el, clear, fmt } from './dom.js';
import { CARDS } from '../data/cards.js';
import { MATERIALS } from '../data/materials.js';
import { cardFrame } from './cardFrame.js';

const CHARGE_S = 0.35; // 法陣蓄力
const FLASH_S = 0.12; // 白閃爆發
const FLY_IN_S = 0.4; // 卡背飛入
const FLIP_S = 0.32; // 單張翻面
const REVEAL_STAGGER_S = 0.08; // 逐張翻面間隔
const RARE_SHAKE_S = 0.3; // 稀有預告抖動

// results：systems/gacha.pull() 的結果陣列。
// opts.onAgain(times)：按「再抽一次」→ 回傳新 results（不足回 null）。
export function openSummonCeremony(results, { times = results.length, onAgain, ticketsLeft } = {}) {
  const ov = el('div', { class: 'summon-ov' });
  document.getElementById('overlay-root').appendChild(ov);

  let tl = null;
  const destroy = () => {
    tl?.kill();
    ov.remove();
  };

  const play = (batch) => {
    clear(ov);
    tl?.kill();

    const circle = el('div', { class: 'summon-circle' });
    const flash = el('div', { class: 'summon-flash' });
    const grid = el('div', { class: 'summon-grid' });
    ov.appendChild(circle);
    ov.appendChild(grid);
    ov.appendChild(flash);

    const skipBtn = el('div', { class: 'summon-skip pressable', text: '跳過 ⏭' });
    ov.appendChild(skipBtn);

    // 建卡（正面內容先備好，蓋著卡背）
    const cards = batch.map((r) => {
      const isCard = r.type === 'card' || r.type === 'duplicate';
      const rare = isCard;
      const node = el('div', { class: `summon-card${rare ? ' rare-hint' : ''}` });
      const flip = el('div', { class: 'flip' });

      const back = el('div', { class: 'face back-face' }, [el('span', { class: 'bicon', text: '✦' })]);
      const front = el('div', { class: 'face front' });
      if (isCard && CARDS[r.cardId]) {
        front.appendChild(cardFrame(CARDS[r.cardId], { size: 'full' }));
        if (r.type === 'card') front.appendChild(el('span', { class: 'newmark', text: 'NEW' }));
        if (r.type === 'duplicate') front.appendChild(el('span', { class: 'dupmark', text: `重複 → 🔹${r.amount}` }));
      } else {
        const icon = MATERIALS[r.materialId]?.icon || '🔹';
        front.appendChild(
          el('div', { class: 'mat-face' }, [
            el('span', { text: icon }),
            el('span', { class: 'amt', text: `×${fmt(r.amount)}` }),
            el('span', { class: 'mlab', text: MATERIALS[r.materialId]?.label || '' }),
          ])
        );
        front.classList.add('mat-holder');
      }
      flip.appendChild(back);
      flip.appendChild(front);
      node.appendChild(flip);
      grid.appendChild(node);
      return { node, flip, rare, isCard };
    });

    // ---- GSAP 主時間軸 ----
    tl = gsap.timeline({ onComplete: () => showActions() });

    // 蓄力（anticipation）：法陣收縮聚能
    tl.fromTo(circle, { scale: 1.15, opacity: 0.4 }, { scale: 0.9, opacity: 1, duration: CHARGE_S, ease: 'power2.in' });
    // 爆發（impact）：白閃
    tl.to(flash, { opacity: 0.9, duration: FLASH_S * 0.4, ease: 'power1.in' });
    tl.to(flash, { opacity: 0, duration: FLASH_S * 0.6, ease: 'power1.out' });
    tl.to(circle, { opacity: 0.25, scale: 1.4, duration: 0.3, ease: 'power2.out' }, '<');

    // 卡背飛入（action）：自中心彈出到格位
    tl.fromTo(
      cards.map((c) => c.node),
      { scale: 0.2, opacity: 0, y: 40 },
      { scale: 1, opacity: 1, y: 0, duration: FLY_IN_S, ease: 'back.out(1.5)', stagger: 0.04 },
      '-=0.1'
    );

    // 逐張翻面（follow-through）：稀有卡先抖動預告
    cards.forEach((c, i) => {
      const at = `+=${i === 0 ? 0.15 : REVEAL_STAGGER_S}`;
      if (c.rare) {
        tl.to(c.node, { x: '+=4', repeat: 5, yoyo: true, duration: RARE_SHAKE_S / 6, ease: 'sine.inOut' }, at);
        tl.to(c.node, { x: 0, duration: 0.05 });
        tl.to(c.flip, { rotationY: 180, duration: FLIP_S * 1.3, ease: 'back.out(1.4)' });
        tl.add(() => {
          if (c.isCard) c.node.classList.add('rare');
          shakeScreen(ov);
        });
      } else {
        tl.to(c.flip, { rotationY: 180, duration: FLIP_S, ease: 'power2.inOut' }, at);
      }
    });

    // 跳過：直接快轉到結尾
    const skip = () => {
      if (tl && tl.progress() < 1) tl.progress(1);
    };
    skipBtn.addEventListener('click', skip);
    ov.addEventListener('click', (e) => {
      // 點空白處也可跳過（動畫中）
      if (tl && tl.progress() < 1 && !e.target.closest('.summon-actions')) skip();
    });

    // 結果操作列
    const showActions = () => {
      if (ov.querySelector('.summon-actions')) return;
      skipBtn.remove();
      const actions = el('div', { class: 'summon-actions' });
      if (onAgain) {
        const left = ticketsLeft?.() ?? 0;
        const n = Math.min(times, Math.max(0, left));
        const againBtn = el('button', {
          class: 'btn-gold',
          text: n > 0 ? `再抽 ${n} 次（🎟️${n}）` : '召喚券不足',
          onClick: () => {
            const next = onAgain(times);
            if (next && next.length) play(next);
          },
        });
        againBtn.disabled = n <= 0;
        actions.appendChild(againBtn);
      }
      actions.appendChild(el('button', { text: '確定', onClick: destroy }));
      ov.appendChild(actions);
      gsap.fromTo(actions, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out' });
    };
  };

  play(results);
  return destroy;
}

// 稀有揭曉微震屏（DOM 版）。
function shakeScreen(node, strength = 5) {
  gsap.fromTo(
    node,
    { x: -strength },
    { x: 0, duration: 0.3, ease: 'elastic.out(1, 0.3)' }
  );
}
