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
  // ---- 測試名冊 40 隻：scripts/make-placeholder-art.mjs 生成的佔位 SVG ----
  cinderblade: { art: 'assets/cards/cinderblade.svg', portrait: P },
  pyrelord: { art: 'assets/cards/pyrelord.svg', portrait: P },
  ashpriest: { art: 'assets/cards/ashpriest.svg', portrait: P },
  magmaturtle: { art: 'assets/cards/magmaturtle.svg', portrait: P },
  flarearcher: { art: 'assets/cards/flarearcher.svg', portrait: P },
  emberwitch: { art: 'assets/cards/emberwitch.svg', portrait: P },
  warbanner: { art: 'assets/cards/warbanner.svg', portrait: P },
  redlion: { art: 'assets/cards/redlion.svg', portrait: P },
  stormblade: { art: 'assets/cards/stormblade.svg', portrait: P },
  galeninja: { art: 'assets/cards/galeninja.svg', portrait: P },
  tempesthawk: { art: 'assets/cards/tempesthawk.svg', portrait: P },
  windsister: { art: 'assets/cards/windsister.svg', portrait: P },
  thundertotem: { art: 'assets/cards/thundertotem.svg', portrait: P },
  skylancer: { art: 'assets/cards/skylancer.svg', portrait: P },
  grovekeeper: { art: 'assets/cards/grovekeeper.svg', portrait: P },
  zephyrmonk: { art: 'assets/cards/zephyrmonk.svg', portrait: P },
  frostmage: { art: 'assets/cards/frostmage.svg', portrait: P },
  tidesinger: { art: 'assets/cards/tidesinger.svg', portrait: P },
  glacierknight: { art: 'assets/cards/glacierknight.svg', portrait: P },
  abysshunter: { art: 'assets/cards/abysshunter.svg', portrait: P },
  mistdancer: { art: 'assets/cards/mistdancer.svg', portrait: P },
  coralshaman: { art: 'assets/cards/coralshaman.svg', portrait: P },
  leviathan: { art: 'assets/cards/leviathan.svg', portrait: P },
  pearlguard: { art: 'assets/cards/pearlguard.svg', portrait: P },
  paladin: { art: 'assets/cards/paladin.svg', portrait: P },
  lightweaver: { art: 'assets/cards/lightweaver.svg', portrait: P },
  suninquisitor: { art: 'assets/cards/suninquisitor.svg', portrait: P },
  dawnharpist: { art: 'assets/cards/dawnharpist.svg', portrait: P },
  radiantgolem: { art: 'assets/cards/radiantgolem.svg', portrait: P },
  stargazer: { art: 'assets/cards/stargazer.svg', portrait: P },
  holyfencer: { art: 'assets/cards/holyfencer.svg', portrait: P },
  lumenfox: { art: 'assets/cards/lumenfox.svg', portrait: P },
  plaguelord: { art: 'assets/cards/plaguelord.svg', portrait: P },
  shadowpriest: { art: 'assets/cards/shadowpriest.svg', portrait: P },
  boneknight: { art: 'assets/cards/boneknight.svg', portrait: P },
  nightmare: { art: 'assets/cards/nightmare.svg', portrait: P },
  voidcaller: { art: 'assets/cards/voidcaller.svg', portrait: P },
  cryptwidow: { art: 'assets/cards/cryptwidow.svg', portrait: P },
  duskwarden: { art: 'assets/cards/duskwarden.svg', portrait: P },
  soulorganist: { art: 'assets/cards/soulorganist.svg', portrait: P },
  // ---- 環境使 6 隻 ----
  sunherald: { art: 'assets/cards/sunherald.svg', portrait: P },
  rainherald: { art: 'assets/cards/rainherald.svg', portrait: P },
  galeherald: { art: 'assets/cards/galeherald.svg', portrait: P },
  lumenvessel: { art: 'assets/cards/lumenvessel.svg', portrait: P },
  voidshade: { art: 'assets/cards/voidshade.svg', portrait: P },
  mireweaver: { art: 'assets/cards/mireweaver.svg', portrait: P },
  // ---- 機制專職 4 隻 ----
  veilwalker: { art: 'assets/cards/veilwalker.svg', portrait: P },
  hawkoracle: { art: 'assets/cards/hawkoracle.svg', portrait: P },
  terrorweaver: { art: 'assets/cards/terrorweaver.svg', portrait: P },
  fluxreaver: { art: 'assets/cards/fluxreaver.svg', portrait: P },
  // ---- 種族號令與補位 6 隻 ----
  bonemarshal: { art: 'assets/cards/bonemarshal.svg', portrait: P },
  sylvanqueen: { art: 'assets/cards/sylvanqueen.svg', portrait: P },
  abysstyrant: { art: 'assets/cards/abysstyrant.svg', portrait: P },
  rageclaw: { art: 'assets/cards/rageclaw.svg', portrait: P },
  dawnmother: { art: 'assets/cards/dawnmother.svg', portrait: P },
  knellwitch: { art: 'assets/cards/knellwitch.svg', portrait: P },
  // ---- 機械隊／龍隊補位 4 隻 ----
  ironcannon: { art: 'assets/cards/ironcannon.svg', portrait: P },
  gearmedic: { art: 'assets/cards/gearmedic.svg', portrait: P },
  drakebastion: { art: 'assets/cards/drakebastion.svg', portrait: P },
  dragonoracle: { art: 'assets/cards/dragonoracle.svg', portrait: P },
  // ---- 機制拼圖批次 18 隻 ----
  bulwarkengine: { art: 'assets/cards/bulwarkengine.svg', portrait: P },
  insulatower: { art: 'assets/cards/insulatower.svg', portrait: P },
  mirrorfox: { art: 'assets/cards/mirrorfox.svg', portrait: P },
  hexweaver: { art: 'assets/cards/hexweaver.svg', portrait: P },
  deathlessking: { art: 'assets/cards/deathlessking.svg', portrait: P },
  vengefulshade: { art: 'assets/cards/vengefulshade.svg', portrait: P },
  huntmarshal: { art: 'assets/cards/huntmarshal.svg', portrait: P },
  mistwarden: { art: 'assets/cards/mistwarden.svg', portrait: P },
  hornchief: { art: 'assets/cards/hornchief.svg', portrait: P },
  moonhowler: { art: 'assets/cards/moonhowler.svg', portrait: P },
  flamewyrm: { art: 'assets/cards/flamewyrm.svg', portrait: P },
  wyrmmatriarch: { art: 'assets/cards/wyrmmatriarch.svg', portrait: P },
  miraclenun: { art: 'assets/cards/miraclenun.svg', portrait: P },
  sanctumjudge: { art: 'assets/cards/sanctumjudge.svg', portrait: P },
  godblade: { art: 'assets/cards/godblade.svg', portrait: P },
  siegemarshal: { art: 'assets/cards/siegemarshal.svg', portrait: P },
  warchoir: { art: 'assets/cards/warchoir.svg', portrait: P },
  bladeoath: { art: 'assets/cards/bladeoath.svg', portrait: P },
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

// 卡面點陣圖：SVG 已用 scripts/make-card-raster.mjs 光柵化成同內容 WebP（模糊濾鏡烘進點陣）。
// DOM/canvas 顯示一律走 WebP——手機捲動/進頁不再即時光柵化 feGaussianBlur（實測捲動繪製 368ms→5ms）。
// 註：cutoutFor 仍走 SVG（見下），pixi 戰場立繪不受影響。
function rasterArt(art) {
  return art ? art.replace(/\.svg$/, '.webp') : art;
}

// → 卡圖路徑字串或 null（DOM/canvas 用；回傳烘好的 WebP）
export function artFor(cardId) {
  const entry = CARD_ART[cardId];
  return entry && entry.art ? rasterArt(entry.art) : null;
}

// → 去背立繪路徑或 null（戰場單位 / 主城看板 / 召喚看板用）。
// 佔位期為 make-cutouts.mjs 生成的 _cutout.svg；真素材到位後改為 body.png 路徑。
export function cutoutFor(cardId) {
  const entry = CARD_ART[cardId];
  if (!entry || !entry.art) return null;
  return entry.cutout ?? entry.art.replace(/\.(svg|png)$/, '_cutout.$1');
}

// 語音 manifest：cardId → { attack, ultimate }（路徑相對 /public）。
// 加語音兩步驟：1. 音檔丟 public/assets/voice/  2. 這裡填一行。目前無素材＝全靜默。
export const VOICE_MANIFEST = {
  // 範例：ifrit: { attack: 'assets/voice/ifrit_attack.mp3', ultimate: 'assets/voice/ifrit_ult.mp3' },
};

// → 音檔路徑或 null。
export function voiceFor(cardId, kind) {
  return VOICE_MANIFEST[cardId]?.[kind] ?? null;
}

// → { src, x, y, zoom } 或 null（同一張圖 + 裁切焦點/縮放；未指定套預設 0.5/0.25/2.0）
export function portraitFor(cardId) {
  const entry = CARD_ART[cardId];
  if (!entry || !entry.art) return null;
  const p = entry.portrait || {};
  return {
    src: rasterArt(entry.art),
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
