// 手勢工具：長按（開角色詳情等）＋通用按壓回饋。
// 長按合約：pointerdown 起算 LONG_PRESS_MS；位移超過 SLOP 或提前放開＝取消；
// 觸發後抑制後續 click（避免長按放開又觸發單擊行為）；行動端擋 contextmenu。
export const LONG_PRESS_MS = 400;
export const LONG_PRESS_SLOP_PX = 8;

// longPress(el, onLongPress, { onTap })
//   onLongPress：長按觸發（含蓄力視覺 .pressing → CSS 光圈）
//   onTap：一般單擊（未達長按閾值時）
export function longPress(el, onLongPress, { onTap } = {}) {
  let timer = null;
  let sx = 0;
  let sy = 0;
  let fired = false;

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    el.classList.remove('pressing');
  };

  el.classList.add('pressable');
  el.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    fired = false;
    sx = e.clientX;
    sy = e.clientY;
    el.classList.add('pressing');
    timer = setTimeout(() => {
      timer = null;
      fired = true;
      el.classList.remove('pressing');
      onLongPress?.(e);
    }, LONG_PRESS_MS);
  });
  el.addEventListener('pointermove', (e) => {
    if (timer && (Math.abs(e.clientX - sx) > LONG_PRESS_SLOP_PX || Math.abs(e.clientY - sy) > LONG_PRESS_SLOP_PX)) {
      cancel();
    }
  });
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('pointercancel', cancel);
  // 長按觸發過 → 吃掉這次 click；否則視為單擊。
  el.addEventListener('click', (e) => {
    if (fired) {
      e.stopImmediatePropagation();
      e.preventDefault();
      fired = false;
      return;
    }
    onTap?.(e);
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

// 按住連續觸發（詳情頁「強化」按住連升）：立即觸發一次，
// 之後每 repeatMs 觸發一次直到放開。
export function holdRepeat(el, onFire, { delayMs = 350, repeatMs = 110 } = {}) {
  let delayTimer = null;
  let repeatTimer = null;
  const stop = () => {
    if (delayTimer) clearTimeout(delayTimer);
    if (repeatTimer) clearInterval(repeatTimer);
    delayTimer = null;
    repeatTimer = null;
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    stop();
    onFire();
    delayTimer = setTimeout(() => {
      repeatTimer = setInterval(() => {
        // 按鈕被重繪拆離 DOM 後放開事件收不到 → 計時器會在背景永動。
        // 一旦偵測到已拆離立刻自停（曾造成「一路自動升到 60 等」）。
        if (!el.isConnected) { stop(); return; }
        onFire();
      }, repeatMs);
    }, delayMs);
    // 放開不一定發生在按鈕上（重繪換新節點/拖出畫面）→ window 層兜底
    window.addEventListener('pointerup', stop, { once: true });
    window.addEventListener('pointercancel', stop, { once: true });
  });
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointerleave', stop);
  el.addEventListener('pointercancel', stop);
  // 已由 pointerdown 觸發過，click 不再重複觸發。
  el.addEventListener('click', (e) => e.preventDefault());
}
