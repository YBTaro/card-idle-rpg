// 素材清單（asset manifest）—— 全遊戲從這裡取卡圖；沒有素材時退回程序化佔位。
// 純模組：不 import pixi / gsap / DOM，前端與 pixi 端都能吃。
//
// 加素材三步驟：
//   1. 把圖丟到 public/assets/cards/<cardId>.png
//   2. 在 CARD_ART 填一行： <cardId>: { art: 'assets/cards/<cardId>.png' }
//      （可選 portrait 覆寫裁切焦點/縮放，見下方預設）
//   3. 重整頁面 → 全遊戲換皮（一張立繪裁三用：卡圖 / 頭像 / 戰鬥棋子）
//
// cardId → 素材描述。art 相對於 /public；portrait 用同一張圖 + 裁切參數
// （CSS object-position / pixi 位移），未指定時套用下方 DEFAULT_PORTRAIT。
// 目前為程式生成的佔位 SVG 立繪（640×880，人物頭部約在 y 0.34）。
// AI 生圖到位時：換檔案 + 改這裡的路徑即可全遊戲換皮。
const P = { x: 0.5, y: 0.34, zoom: 2.0 };
export const CARD_ART = {
  ifrit: { art: 'assets/cards/ifrit.svg', portrait: P },
  emberguard: { art: 'assets/cards/emberguard.svg', portrait: P },
  zephyr: { art: 'assets/cards/zephyr.svg', portrait: P },
  galewind: { art: 'assets/cards/galewind.svg', portrait: P },
  tidecaller: { art: 'assets/cards/tidecaller.svg', portrait: P },
  aegis: { art: 'assets/cards/aegis.svg', portrait: P },
  seraph: { art: 'assets/cards/seraph.svg', portrait: P },
  dawnblade: { art: 'assets/cards/dawnblade.svg', portrait: P },
  nightreaper: { art: 'assets/cards/nightreaper.svg', portrait: P },
  gravewarden: { art: 'assets/cards/gravewarden.svg', portrait: P },
};

// portrait 焦點 x/y 為 0..1，zoom 為倍率。
const DEFAULT_PORTRAIT = { x: 0.5, y: 0.25, zoom: 2.0 };

// 元素色值與 style.css 的 CSS 變數同步（新暖色票；hex 寫死，因 pixi 端吃不到 CSS 變數）。
const ELEMENT_COLORS = {
  fire: '#ff7d5c',
  wind: '#7fe497',
  water: '#6cb2ff',
  light: '#ffe789',
  dark: '#bb8cff',
};
const NEUTRAL_COLOR = '#8a8f99'; // 未知元素退中性灰

// → 卡圖路徑字串或 null
export function artFor(cardId) {
  const entry = CARD_ART[cardId];
  return entry && entry.art ? entry.art : null;
}

// → { src, x, y, zoom } 或 null（同一張圖 + 裁切焦點/縮放；未指定套預設 0.5/0.25/2.0）
export function portraitFor(cardId) {
  const entry = CARD_ART[cardId];
  if (!entry || !entry.art) return null;
  const p = entry.portrait || {};
  return {
    src: entry.art,
    x: p.x ?? DEFAULT_PORTRAIT.x,
    y: p.y ?? DEFAULT_PORTRAIT.y,
    zoom: p.zoom ?? DEFAULT_PORTRAIT.zoom,
  };
}

// 把 hex 調暗（factor < 1）作為漸層深色端。
function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 0xff) * factor);
  const g = Math.round(((n >> 8) & 0xff) * factor);
  const b = Math.round((n & 0xff) * factor);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// → CSS linear-gradient 字串（元素色系深→淺兩段），未知元素給中性灰。
export function elementGradient(element) {
  const base = ELEMENT_COLORS[element] || NEUTRAL_COLOR;
  const dark = shade(base, 0.55);
  return `linear-gradient(160deg, ${dark} 0%, ${base} 100%)`;
}
