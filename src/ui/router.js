// hub-and-spoke 導覽：主城為樞紐，各功能頁全螢幕進出，左上返回鍵回主城。
// 切換動畫：淡入 + 12px 上滑（TAB_SWITCH_S）。
import { gsap } from 'gsap';

const TAB_SWITCH_S = 0.18;

const screens = new Map(); // id -> { elm, ui }
let currentId = null;
const listeners = [];

export const nav = {
  register(id, elm, ui = null) {
    screens.set(id, { elm, ui });
  },

  go(id) {
    if (id === currentId) return;
    const target = screens.get(id);
    if (!target) return;
    const prev = currentId ? screens.get(currentId) : null;
    currentId = id;

    if (prev) {
      prev.elm.classList.remove('active');
      prev.ui?.onHide?.();
    }
    target.elm.classList.add('active');
    target.ui?.onShow?.();
    gsap.fromTo(
      target.elm,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: TAB_SWITCH_S, ease: 'power2.out', clearProps: 'transform' }
    );
    for (const fn of listeners) fn(id);
  },

  current() {
    return currentId;
  },

  onChange(fn) {
    listeners.push(fn);
  },
};
