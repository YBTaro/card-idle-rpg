// 彈窗層：全部掛在 #overlay-root（在 store 重繪範圍之外，開著彈窗改 state 不會被轟掉）。
// openModal：通用面板（GSAP 上滑彈入 / 下滑退場）；confirmSheet：取代原生 confirm()；
// queuePopup：登入彈窗佇列（簽到→掛機箱……逐一出，永遠最多一層）。
import { gsap } from 'gsap';
import { el } from './dom.js';

const MODAL_IN_S = 0.28;
const MODAL_OUT_S = 0.18;

function root() {
  return document.getElementById('overlay-root');
}

// openModal({ className, build(panel, close), onClose }) → close()
export function openModal({ className = '', build, onClose } = {}) {
  const overlay = el('div', { class: 'ov' });
  const panel = el('div', { class: `ov-panel ${className}` });
  overlay.appendChild(panel);
  root().appendChild(overlay);

  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    gsap.killTweensOf([overlay, panel]);
    gsap.to(panel, { y: 26, opacity: 0, duration: MODAL_OUT_S, ease: 'power2.in' });
    gsap.to(overlay, {
      opacity: 0,
      duration: MODAL_OUT_S,
      onComplete: () => overlay.remove(),
    });
    onClose?.(result);
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  build?.(panel, close);

  gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power1.out' });
  gsap.fromTo(
    panel,
    { y: 30, opacity: 0 },
    { y: 0, opacity: 1, duration: MODAL_IN_S, ease: 'back.out(1.4)' }
  );
  return close;
}

// 確認彈窗（危險操作要摩擦）。回傳 Promise<boolean>。
export function confirmSheet({ title, desc, confirmText = '確定', cancelText = '取消', danger = false } = {}) {
  return new Promise((resolve) => {
    let result = false;
    openModal({
      className: 'ov-confirm',
      onClose: () => resolve(result),
      build: (panel, close) => {
        panel.appendChild(el('div', { class: 'ovc-title', text: title || '確認' }));
        if (desc) panel.appendChild(el('div', { class: 'ovc-desc', text: desc }));
        const row = el('div', { class: 'ovc-row' });
        row.appendChild(
          el('button', { class: 'btn', text: cancelText, onClick: () => close() })
        );
        row.appendChild(
          el('button', {
            class: `btn ${danger ? 'btn-danger' : 'btn-gold'}`,
            text: confirmText,
            onClick: () => {
              result = true;
              close();
            },
          })
        );
        panel.appendChild(row);
      },
    });
  });
}

// ---- 彈窗佇列（登入序列用）----
let _current = false;
const _queue = [];

// queuePopup(show)：show 收到 done 回呼，彈窗關閉時務必呼叫 done。
export function queuePopup(show) {
  _queue.push(show);
  _pump();
}

function _pump() {
  if (_current || _queue.length === 0) return;
  _current = true;
  const show = _queue.shift();
  show(() => {
    _current = false;
    _pump();
  });
}
