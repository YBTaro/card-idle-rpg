// FTUE 新手聚光引導：遮罩挖洞 + 提示卡，逐步指向主城的關鍵入口。
// 只在新檔（meta.ftueDone=false）觸發一次，可隨時跳過。
import { el } from './dom.js';
import { store } from '../core/state.js';
import { saveGame } from '../core/save.js';

// steps: [{ target: () => HTMLElement|null, title, desc }]
export function runTutorial(steps) {
  if (store.state.meta.ftueDone) return;
  const ov = el('div', { class: 'ftue-ov' });
  const hole = el('div', { class: 'ftue-hole' });
  const tip = el('div', { class: 'ftue-tip' });
  ov.appendChild(hole);
  ov.appendChild(tip);
  document.body.appendChild(ov);

  let idx = 0;

  const finish = () => {
    store.state.meta.ftueDone = true;
    saveGame();
    ov.remove();
  };

  const show = () => {
    const step = steps[idx];
    const target = step?.target?.();
    if (!step || !target) {
      finish();
      return;
    }
    const r = target.getBoundingClientRect();
    const PAD = 8;
    hole.style.left = `${r.left - PAD}px`;
    hole.style.top = `${r.top - PAD}px`;
    hole.style.width = `${r.width + PAD * 2}px`;
    hole.style.height = `${r.height + PAD * 2}px`;

    tip.replaceChildren(
      el('div', { class: 'ft', text: step.title }),
      el('div', { class: 'fd', text: step.desc }),
      el('div', { class: 'fr' }, [
        el('button', { text: '跳過', onClick: finish }),
        el('button', {
          class: 'btn-gold',
          text: idx === steps.length - 1 ? '開始遊戲' : '下一步',
          onClick: () => {
            idx += 1;
            if (idx >= steps.length) finish();
            else show();
          },
        }),
      ])
    );
    // 提示卡放在挖洞的對側（洞在右半 → 卡放左側，反之亦然）。
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    tip.style.visibility = 'hidden';
    tip.style.left = '0px';
    tip.style.top = '0px';
    requestAnimationFrame(() => {
      const tw = tip.offsetWidth;
      const th = tip.offsetHeight;
      let x = r.left + r.width / 2 > vw / 2 ? r.left - tw - 24 : r.right + 24;
      let y = r.top + r.height / 2 - th / 2;
      x = Math.max(12, Math.min(vw - tw - 12, x));
      y = Math.max(12, Math.min(vh - th - 12, y));
      tip.style.left = `${x}px`;
      tip.style.top = `${y}px`;
      tip.style.visibility = 'visible';
    });
  };

  show();
}
