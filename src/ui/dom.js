// 極簡 DOM 輔助。
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v != null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node) {
  node.replaceChildren();
}

// toast(msg) / toast(msg, { icon })：底部置中、上滑進場、自動淡出。
let _toastTimer = null;
export function toast(msg, { icon = '' } = {}) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = el('div', { class: 'toast' });
    document.body.appendChild(t);
  }
  t.textContent = icon ? `${icon} ${msg}` : msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    t.classList.remove('show');
  }, 1800);
}

// 數字滾動（貨幣/數值變化的 COUNT_ROLL）。
export function rollNumber(node, from, to, { duration = 400, format = (n) => String(n) } = {}) {
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) * (1 - t);
    node.textContent = format(Math.round(from + (to - from) * eased));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// 千分位（HUD 貨幣顯示）。
export function fmt(n) {
  return Number(n || 0).toLocaleString('en-US');
}
