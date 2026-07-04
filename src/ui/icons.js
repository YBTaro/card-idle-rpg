// 介面圖示集：手繪 SVG 取代 emoji（OS emoji 字型風格不一且醜）。
// 設計語言：金色雙調（亮金 #f2cd6f / 陰影 #c8963e）+ 深棕描邊，圓潤幾何，
// 對齊 AFK 療癒手遊畫風。用法：icon('arena', 26) → <span class="gicon">…svg…</span>
const G1 = '#f2cd6f'; // 亮金
const G2 = '#c8963e'; // 暗金
const LN = '#3a2b18'; // 描邊
const HI = '#fff3d0'; // 高光

const S = (body) =>
  `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

const ICONS = {
  // 主城（城堡）：三塔樓 + 門
  home: S(`
    <path d="M4 10 h4 v-3 l-2-1.4 L4 7 Z M10 8 h4 V4.6 L12 3 l-2 1.6 Z M16 10 h4 V7 l-2-1.4 L16 7 Z" fill="${G2}" stroke="${LN}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M4 10 h16 v10 H4 Z" fill="${G1}" stroke="${LN}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M10 20 v-5 a2 2 0 0 1 4 0 v5 Z" fill="${LN}" opacity=".85"/>
    <path d="M5.2 11.2 h3 v2 h-3 Z M15.8 11.2 h3 v2 h-3 Z" fill="${HI}" opacity=".5"/>`),

  // 隊伍（卡牌扇）：兩張交疊卡
  team: S(`
    <rect x="3.6" y="5.6" width="9.5" height="13.5" rx="1.6" transform="rotate(-8 8 12)" fill="${G2}" stroke="${LN}" stroke-width="1.3"/>
    <rect x="10" y="4.6" width="10" height="14.5" rx="1.6" transform="rotate(7 15 12)" fill="${G1}" stroke="${LN}" stroke-width="1.4"/>
    <path d="M14.6 8.4 l1.1 2.2 2.4.35 -1.75 1.7 .4 2.4 -2.15-1.13 -2.15 1.13 .4-2.4 -1.75-1.7 2.4-.35 Z" fill="${HI}" stroke="${G2}" stroke-width=".6"/>`),

  // 英雄（頭盔）
  heroes: S(`
    <path d="M12 3.5 c4.4 0 7 3.2 7 7 v5.5 h-3.4 V11 h-1.4 v8.5 h-4.4 V11 h-1.4 v5 H5 v-5.5 c0-3.8 2.6-7 7-7 Z" fill="${G1}" stroke="${LN}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M11.2 3.7 c.2-1 1.4-1 1.6 0 l.5 2.6 h-2.6 Z" fill="${G2}" stroke="${LN}" stroke-width="1"/>
    <path d="M8.4 9.4 h2.2 M13.4 9.4 h2.2" stroke="${LN}" stroke-width="1.6" stroke-linecap="round"/>`),

  // 召喚（傳送門水晶球）
  gacha: S(`
    <circle cx="12" cy="11" r="7.2" fill="${G2}" stroke="${LN}" stroke-width="1.4"/>
    <circle cx="12" cy="11" r="4.6" fill="${G1}"/>
    <path d="M12 8 l.9 2 2.1.3 -1.5 1.5 .35 2.1 -1.85-1 -1.85 1 .35-2.1 -1.5-1.5 2.1-.3 Z" fill="${HI}"/>
    <path d="M7.5 19.5 h9 l-1 2.2 h-7 Z" fill="${G2}" stroke="${LN}" stroke-width="1.2" stroke-linejoin="round"/>`),

  // 商店（錢袋）
  shop: S(`
    <path d="M9.5 6.5 l-1.4-2.6 c-.3-.5.1-1.1.7-1 l3.2.6 3.2-.6 c.6-.1 1 .5.7 1 L14.5 6.5 Z" fill="${G2}" stroke="${LN}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M12 6.5 c-4.6 1.6-6.8 5.4-6.8 8.9 0 3.4 2.6 5.4 6.8 5.4 s6.8-2 6.8-5.4 c0-3.5-2.2-7.3-6.8-8.9 Z" fill="${G1}" stroke="${LN}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M12 10.2 v6.8 M9.6 12 c0-1 1-1.6 2.4-1.6 s2.4.6 2.4 1.5 c0 .9-.9 1.2-2.4 1.5 -1.5.3-2.4.6-2.4 1.5 0 .9 1 1.5 2.4 1.5 s2.4-.6 2.4-1.6" stroke="${LN}" stroke-width="1.3" stroke-linecap="round" fill="none"/>`),

  // 戰役（交叉雙劍）
  battle: S(`
    <path d="M5.2 4 L10.6 9.4 M18.8 4 L13.4 9.4 M8 14.8 L5 17.8 M16 14.8 L19 17.8" stroke="${LN}" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M5.2 4 L14.8 13.6 l2.4 5 -5-2.4 L4.6 8.6 Z" fill="${G1}" stroke="${LN}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M18.8 4 L9.2 13.6 l-2.4 5 5-2.4 L19.4 8.6 Z" fill="${G2}" stroke="${LN}" stroke-width="1.2" stroke-linejoin="round"/>
    <circle cx="6.4" cy="19.2" r="1.7" fill="${G1}" stroke="${LN}" stroke-width="1.1"/>
    <circle cx="17.6" cy="19.2" r="1.7" fill="${G1}" stroke="${LN}" stroke-width="1.1"/>`),

  // 競技場（獎盃）
  arena: S(`
    <path d="M7 4 h10 v5.5 a5 5 0 0 1-10 0 Z" fill="${G1}" stroke="${LN}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M7 5.5 H4.2 a3.4 3.4 0 0 0 3.4 4.4 M17 5.5 h2.8 a3.4 3.4 0 0 1-3.4 4.4" stroke="${LN}" stroke-width="1.4" fill="none"/>
    <path d="M10.8 14 h2.4 l.5 3 h-3.4 Z" fill="${G2}" stroke="${LN}" stroke-width="1.1"/>
    <path d="M8 17.6 h8 v2.6 H8 Z" fill="${G2}" stroke="${LN}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M9.2 6 c0 2 .4 4 1.2 5.4" stroke="${HI}" stroke-width="1.3" stroke-linecap="round" fill="none" opacity=".8"/>`),

  // 公會（盾徽旗）
  guild: S(`
    <path d="M12 3.2 l7.5 2 v6.2 c0 4.4-3 7.6-7.5 9.4 C7.5 19 4.5 15.8 4.5 11.4 V5.2 Z" fill="${G1}" stroke="${LN}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M12 3.2 v17.6 C7.5 19 4.5 15.8 4.5 11.4 V5.2 Z" fill="${G2}" opacity=".55"/>
    <path d="M12 7 l1.2 2.4 2.6.4 -1.9 1.85 .45 2.6 L12 13 l-2.35 1.25 .45-2.6 -1.9-1.85 2.6-.4 Z" fill="${HI}" stroke="${LN}" stroke-width=".7"/>`),

  // 試煉塔
  tower: S(`
    <path d="M8 21 L9 9 h6 l1 12 Z" fill="${G1}" stroke="${LN}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M7.6 9 V6.4 h1.8 V8 h1.6 V6.4 h2 V8 h1.6 V6.4 h1.8 V9 Z" fill="${G2}" stroke="${LN}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M10.6 21 v-3.4 a1.4 1.4 0 0 1 2.8 0 V21 Z" fill="${LN}" opacity=".85"/>
    <path d="M12 6.4 V3.6 l2.6.9 -2.6.9" fill="${G2}" stroke="${LN}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M6.2 21 h11.6" stroke="${LN}" stroke-width="1.6" stroke-linecap="round"/>`),

  // 好友（兩人）
  friends: S(`
    <circle cx="9" cy="9" r="3.6" fill="${G1}" stroke="${LN}" stroke-width="1.3"/>
    <path d="M3.4 19.4 c.6-3.6 2.8-5.4 5.6-5.4 s5 1.8 5.6 5.4 Z" fill="${G1}" stroke="${LN}" stroke-width="1.3" stroke-linejoin="round"/>
    <circle cx="16.6" cy="9.6" r="2.9" fill="${G2}" stroke="${LN}" stroke-width="1.2"/>
    <path d="M15.2 13.9 c3.1-.4 5.2 1.5 5.6 5.5 h-4.4" fill="${G2}" stroke="${LN}" stroke-width="1.2" stroke-linejoin="round"/>`),

  // 任務（卷軸）
  quests: S(`
    <path d="M7 4.5 h11 a2 2 0 0 1-2 2 v13 H7.5 A2.5 2.5 0 0 1 5 17 V6.5 a2 2 0 0 1 2-2 Z" fill="${G1}" stroke="${LN}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M16 4.5 a2 2 0 0 1 2 2 H14 a2 2 0 0 1 2-2 Z" fill="${G2}" stroke="${LN}" stroke-width="1.2"/>
    <path d="M8.6 10 h6 M8.6 13 h6 M8.6 16 h4" stroke="${G2}" stroke-width="1.5" stroke-linecap="round"/>`),

  // 簽到（日曆勾）
  signin: S(`
    <rect x="4" y="5.5" width="16" height="14.5" rx="2" fill="${G1}" stroke="${LN}" stroke-width="1.4"/>
    <path d="M4 9.5 h16" stroke="${LN}" stroke-width="1.3"/>
    <path d="M8 3.5 v3.4 M16 3.5 v3.4" stroke="${LN}" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M8.6 14.4 l2.4 2.4 4.4-4.6" stroke="${G2}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`),

  // 掛機箱（寶箱）
  idle: S(`
    <path d="M4.5 10 a7.5 5.5 0 0 1 15 0 v1 H4.5 Z" fill="${G1}" stroke="${LN}" stroke-width="1.4" stroke-linejoin="round"/>
    <rect x="4.5" y="11" width="15" height="8.5" rx="1.6" fill="${G2}" stroke="${LN}" stroke-width="1.4"/>
    <path d="M4.5 11 h15" stroke="${LN}" stroke-width="1.2"/>
    <rect x="10.4" y="9.4" width="3.2" height="5" rx="1" fill="${G1}" stroke="${LN}" stroke-width="1.2"/>
    <circle cx="12" cy="12.6" r=".9" fill="${LN}"/>`),

  // 設定（齒輪）
  settings: S(`
    <path d="M12 2.8 l1.2 2.3 2.6-.5 .6 2.6 2.6.6 -.5 2.6 2.3 1.2 -1.4 2.2 1.4 2.2 -2.3 1.2 .5 2.6 -2.6.6 -.6 2.6 -2.6-.5 -1.2 2.3 -1.2-2.3 -2.6.5 -.6-2.6 -2.6-.6 .5-2.6 -2.3-1.2 1.4-2.2 -1.4-2.2 2.3-1.2 -.5-2.6 2.6-.6 .6-2.6 2.6.5 Z"
      fill="${G1}" stroke="${LN}" stroke-width="1.2" stroke-linejoin="round" transform="scale(.92) translate(1 1)"/>
    <circle cx="12" cy="12" r="3.4" fill="${G2}" stroke="${LN}" stroke-width="1.3"/>`),

  // 金幣
  coin: S(`
    <circle cx="12" cy="12" r="8.6" fill="${G1}" stroke="${LN}" stroke-width="1.4"/>
    <circle cx="12" cy="12" r="5.9" fill="none" stroke="${G2}" stroke-width="1.3"/>
    <path d="M12 8.2 l1 2.1 2.3.3 -1.65 1.6 .4 2.3 -2.05-1.1 -2.05 1.1 .4-2.3 -1.65-1.6 2.3-.3 Z" fill="${G2}"/>
    <path d="M6.5 8.4 a7 7 0 0 1 3.2-2.7" stroke="${HI}" stroke-width="1.4" stroke-linecap="round" fill="none"/>`),

  // 召喚券
  ticket: S(`
    <path d="M3.5 8.2 a1.2 1.2 0 0 1 1.2-1.2 h14.6 a1.2 1.2 0 0 1 1.2 1.2 v2 a2 2 0 0 0 0 3.6 v2 a1.2 1.2 0 0 1-1.2 1.2 H4.7 a1.2 1.2 0 0 1-1.2-1.2 v-2 a2 2 0 0 0 0-3.6 Z"
      fill="${G1}" stroke="${LN}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M9.4 7.2 v9.6" stroke="${G2}" stroke-width="1.3" stroke-dasharray="2 2"/>
    <path d="M14.3 9.6 l.8 1.6 1.8.25 -1.3 1.25 .3 1.8 -1.6-.85 -1.6.85 .3-1.8 -1.3-1.25 1.8-.25 Z" fill="${G2}"/>`),

  // 精華（寶石）
  essence: S(`
    <path d="M8.2 4.5 h7.6 L19.5 9 12 20.5 4.5 9 Z" fill="#7cc4ff" stroke="#1e3a5c" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M4.5 9 h15 M8.2 4.5 L10.5 9 12 20.5 M15.8 4.5 L13.5 9 12 20.5 M10.5 9 h3" stroke="#1e3a5c" stroke-width="1" opacity=".65"/>
    <path d="M8.8 5.6 l1.4 2.2" stroke="#dff1ff" stroke-width="1.4" stroke-linecap="round"/>`),
};

// icon(name, size) → <span class="gicon">。未知名稱回退問號方塊（開發期好抓漏）。
export function icon(name, size = 24) {
  const span = document.createElement('span');
  span.className = `gicon gi-${name}`;
  span.style.width = `${size}px`;
  span.style.height = `${size}px`;
  span.innerHTML = ICONS[name] ?? S(`<rect x="4" y="4" width="16" height="16" rx="3" fill="${G2}"/><text x="12" y="16" text-anchor="middle" font-size="10" fill="#fff">?</text>`);
  return span;
}

export const hasIcon = (name) => !!ICONS[name];
