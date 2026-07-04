// 卡面元件：一張立繪裁三用中的「卡圖」路線。
// 有 manifest 素材 → <img>（portrait 焦點/縮放轉 CSS）；無 → 程序化佔位
//   （元素漸層底 + 大職業符號 + 元素字 + 底部名牌）。
// 只負責「卡面」本身，不含按鈕/數值——那是外層（roster / gacha）的事。
import { el } from './dom.js';
import { ELEMENT_LABEL } from '../data/elements.js';
import { artFor, portraitFor, elementGradient } from '../data/assets.js';

// 職業符號沿用 battleScene 的 CLASS_GLYPH，保持卡圖 / 棋子一致。
const CLASS_GLYPH = { tank: '🛡', dps: '⚔', support: '✚' };

// cardFrame(card, { level, size, stars }) → HTMLElement
//   card：CARDS 內的卡定義（含 id / name / element / class）
//   level：有值才顯示右上等級章（傳 'MAX' 或數字皆可）
//   size：'full'（roster 卡格 / 抽卡結算）或 'mini'（編隊格，約 48px 方形）
//   stars：升星數（>0 才顯示名牌上方的星帶）
export function cardFrame(card, { level, size = 'full', stars } = {}) {
  const element = card.element;
  const frame = el('div', {
    class: `cardframe ${size}${' cardframe-' + element}`,
    // 元素色邊框用 CSS 變數（沿用既有 --fire/--wind/... 五色）。
    style: `border-color: var(--${element}, var(--border))`,
  });

  frame.appendChild(_artEl(card));

  // 底部名牌：漸層遮罩上疊名字（mini 尺寸太小則省略文字，只留頭像）。
  if (size !== 'mini') {
    frame.appendChild(el('div', { class: 'cardframe-name', text: card.name }));
  }

  // 星帶（名牌上方）：升星數 > 0 才顯示。
  if (size !== 'mini' && stars > 0) {
    frame.appendChild(el('div', { class: 'cardframe-stars', text: '★'.repeat(stars) }));
  }

  // 右上等級章（有 level 才顯示）。
  if (level != null && level !== '') {
    frame.appendChild(
      el('div', { class: 'cardframe-lvl', text: typeof level === 'number' ? `Lv${level}` : String(level) })
    );
  }

  return frame;
}

// art 區：有素材走 <img>，無素材走程序化佔位。
function _artEl(card) {
  const art = artFor(card.id);
  const p = art ? portraitFor(card.id) : null;

  if (art && p) {
    // 有圖：object-fit cover 撐滿方框，再用 object-position 對焦點、
    // transform scale 做 zoom（放大後 cover + 焦點偏移＝手動裁切）。
    const img = el('img', {
      class: 'cardframe-art',
      src: p.src,
      alt: card.name,
      loading: 'lazy',
      draggable: 'false', // 擋瀏覽器原生圖片拖曳（否則自訂 pointer 拖曳收不到 move）
      style: `object-position: ${p.x * 100}% ${p.y * 100}%; transform: scale(${p.zoom / 2});`,
    });
    return img;
  }

  // 佔位：元素漸層底 + 大職業符號 + 元素字。
  const art0 = el('div', {
    class: 'cardframe-art placeholder',
    style: `background: ${elementGradient(card.element)}`,
  });
  art0.appendChild(el('div', { class: 'cardframe-glyph', text: CLASS_GLYPH[card.class] || '?' }));
  art0.appendChild(el('div', { class: 'cardframe-el', text: ELEMENT_LABEL[card.element] || '' }));
  return art0;
}
