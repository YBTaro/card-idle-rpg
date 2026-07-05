// 佔位立繪生成器：為還沒有素材的卡產出與前 10 隻同構的 SVG（640×880）。
// 變化維度：元素→配色、職業/攻擊型態→武器、種族→頭飾；cardId 種子決定塵點分布。
// 結構須與 make-cutouts.mjs 的約定一致：人物/武器包 <g>、場景元素為頂層單行。
// 真素材到位後：換 public/assets/cards/<id>.png + 改 assets.js 路徑即可淘汰。
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('public/assets/cards');

// 元素配色（與既有 10 隻同款色票）
const PAL = {
  fire: { bgDark: '#3a1424', bgMid: '#87343c', accent: '#ff9a66', spark: '#ffd2b0' },
  wind: { bgDark: '#14322a', bgMid: '#2e6b4f', accent: '#8ef2ae', spark: '#d8ffb0' },
  water: { bgDark: '#122a4a', bgMid: '#2b5a8f', accent: '#7cc4ff', spark: '#b3e6ff' },
  light: { bgDark: '#4a3a14', bgMid: '#8f742b', accent: '#ffe789', spark: '#fff4c2' },
  dark: { bgDark: '#241436', bgMid: '#4a2b6e', accent: '#c99aff', spark: '#e6ccff' },
};

// cardId → 決定塵點/微變化的種子 RNG
function rngFor(id) {
  let s = 0;
  for (const ch of id) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/* ---------- 種族頭飾（人物 g 內、頭之後） ---------- */
function raceAccent(race, accent) {
  switch (race) {
    case '龍': // 後掠雙角
      return `
      <path d="M276 250 C240 232 218 200 214 160 C246 186 272 214 292 240 Z" fill="#241b3d"/>
      <path d="M364 250 C400 232 422 200 426 160 C394 186 368 214 348 240 Z" fill="#241b3d"/>
      <path d="M276 250 C240 232 218 200 214 160" stroke="${accent}" stroke-width="3" fill="none" opacity="0.55"/>
      <path d="M364 250 C400 232 422 200 426 160" stroke="${accent}" stroke-width="3" fill="none" opacity="0.55"/>`;
    case '妖': // 狐耳
      return `
      <path d="M270 260 L246 178 L302 234 Z" fill="#241b3d"/>
      <path d="M370 260 L394 178 L338 234 Z" fill="#241b3d"/>
      <path d="M272 250 L256 196 L294 234 Z" fill="${accent}" opacity="0.35"/>
      <path d="M368 250 L384 196 L346 234 Z" fill="${accent}" opacity="0.35"/>`;
    case '獸': // 圓耳
      return `
      <circle cx="272" cy="248" r="24" fill="#241b3d"/>
      <circle cx="368" cy="248" r="24" fill="#241b3d"/>
      <circle cx="272" cy="248" r="11" fill="${accent}" opacity="0.4"/>
      <circle cx="368" cy="248" r="11" fill="${accent}" opacity="0.4"/>`;
    case '精靈': // 尖耳
      return `
      <path d="M262 300 L216 278 L262 326 Z" fill="#241b3d"/>
      <path d="M378 300 L424 278 L378 326 Z" fill="#241b3d"/>
      <path d="M262 302 L228 284" stroke="${accent}" stroke-width="3" opacity="0.5"/>
      <path d="M378 302 L412 284" stroke="${accent}" stroke-width="3" opacity="0.5"/>`;
    case '不死': // 傾斜幽環
      return `
      <ellipse cx="320" cy="216" rx="54" ry="14" fill="none" stroke="${accent}" stroke-width="5" opacity="0.7" filter="url(#glowS)" transform="rotate(-9 320 216)"/>`;
    case '神': // 正圓神環
      return `
      <circle cx="320" cy="206" r="42" fill="none" stroke="${accent}" stroke-width="6" opacity="0.85" filter="url(#glowF)"/>`;
    case '機械': // 天線 + 面甲橫紋
      return `
      <rect x="316" y="200" width="8" height="44" rx="4" fill="#241b3d"/>
      <circle cx="320" cy="196" r="9" fill="${accent}" filter="url(#glowF)"/>
      <rect x="286" y="336" width="68" height="5" rx="2.5" fill="${accent}" opacity="0.45"/>`;
    default:
      return '';
  }
}

// 機械族改單條 visor 眼；其餘雙眼
function eyes(race, accent) {
  if (race === '機械') {
    return `<rect x="288" y="306" width="64" height="12" rx="6" fill="${accent}" filter="url(#glowF)"/>`;
  }
  return `<circle cx="301" cy="314" r="8" fill="${accent}" filter="url(#glowF)"/>
    <circle cx="339" cy="314" r="8" fill="${accent}" filter="url(#glowF)"/>`;
}

/* ---------- 職業武器（頂層獨立 g） ---------- */
function prop(card, pal, rnd) {
  const { accent, bgMid, spark } = pal;
  if (card.class === 'tank') {
    // 大盾居中（aegis 同款）
    return `
    <g>
      <path d="M320 470 L408 505 L408 600 C408 665 370 706 320 726 C270 706 232 665 232 600 L232 505 Z"
            fill="${bgMid}" stroke="${spark}" stroke-width="8"/>
      <path d="M320 492 L390 520 L390 598 C390 650 360 684 320 700 C280 684 250 650 250 598 L250 520 Z"
            fill="#141024" opacity="0.55"/>
      <circle cx="320" cy="588" r="30" fill="${accent}" opacity="0.9" filter="url(#glowF)"/>
      <circle cx="320" cy="588" r="14" fill="${spark}"/>
    </g>`;
  }
  if (card.class === 'support') {
    // 法杖 + 頂端光球（galewind 同款）
    return `
    <g>
      <rect x="432" y="330" width="13" height="330" rx="6" fill="#241b3d"/>
      <rect x="432" y="330" width="13" height="330" rx="6" fill="none" stroke="${accent}" stroke-width="2" opacity="0.35"/>
      <circle cx="438" cy="308" r="30" fill="${accent}" opacity="0.95" filter="url(#glowF)"/>
      <circle cx="438" cy="308" r="14" fill="#fff" opacity="0.9"/>
      <circle cx="438" cy="308" r="44" fill="none" stroke="${accent}" stroke-width="3" opacity="0.4"/>
    </g>`;
  }
  if (card.attackStyle === 'ranged') {
    // 遠程輸出：長弓 + 搭箭
    return `
    <g transform="rotate(${Math.round(rnd() * 10 - 5)} 452 460)">
      <path d="M452 300 C520 360 520 560 452 620" fill="none" stroke="#241b3d" stroke-width="13" stroke-linecap="round"/>
      <path d="M452 300 C520 360 520 560 452 620" fill="none" stroke="${accent}" stroke-width="4" opacity="0.5" stroke-linecap="round"/>
      <line x1="452" y1="300" x2="452" y2="620" stroke="${spark}" stroke-width="3" opacity="0.8"/>
      <line x1="392" y1="460" x2="486" y2="460" stroke="${spark}" stroke-width="6" stroke-linecap="round"/>
      <path d="M486 460 L462 448 L462 472 Z" fill="${accent}" filter="url(#glowS)"/>
    </g>`;
  }
  // 近戰輸出：長劍（dawnblade 同款、角度微變）
  return `
  <g transform="rotate(${-28 + Math.round(rnd() * 10)} 440 470)">
    <rect x="432" y="200" width="17" height="250" rx="8" fill="url(#blade)" filter="url(#glowS)"/>
    <path d="M432 200 L440 172 L449 200 Z" fill="url(#blade)"/>
    <rect x="405" y="448" width="70" height="15" rx="7" fill="${spark}"/>
    <rect x="433" y="462" width="15" height="52" rx="7" fill="#241b3d"/>
    <circle cx="440" cy="522" r="10" fill="${accent}"/>
  </g>`;
}

// 坦克加肩甲、輸出加腰帶（人物 g 內的職業體型記號）
function classBodyDetail(cls, accent) {
  if (cls === 'tank') {
    return `
    <ellipse cx="232" cy="352" rx="42" ry="30" fill="#241b3d"/>
    <ellipse cx="408" cy="352" rx="42" ry="30" fill="#241b3d"/>
    <ellipse cx="232" cy="352" rx="42" ry="30" fill="none" stroke="${accent}" stroke-width="3" opacity="0.4"/>
    <ellipse cx="408" cy="352" rx="42" ry="30" fill="none" stroke="${accent}" stroke-width="3" opacity="0.4"/>`;
  }
  if (cls === 'dps') {
    return `
    <path d="M228 500 L412 476" stroke="${accent}" stroke-width="9" opacity="0.4" stroke-linecap="round"/>`;
  }
  return '';
}

function svgFor(card) {
  const pal = PAL[card.element] ?? PAL.light;
  const rnd = rngFor(card.id);
  const dots = Array.from({ length: 14 }, () => {
    const x = Math.round(40 + rnd() * 560);
    const y = Math.round(100 + rnd() * 600);
    const r = (1.5 + rnd() * 3.5).toFixed(1);
    const o = (0.18 + rnd() * 0.5).toFixed(2);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${pal.spark}" opacity="${o}"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="880" viewBox="0 0 640 880">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${pal.bgDark}"/>
      <stop offset="0.55" stop-color="${pal.bgMid}"/>
      <stop offset="1" stop-color="${pal.bgDark}"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.42" r="0.55">
      <stop offset="0" stop-color="${pal.accent}" stop-opacity="0.55"/>
      <stop offset="0.55" stop-color="${pal.accent}" stop-opacity="0.18"/>
      <stop offset="1" stop-color="${pal.accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="blade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.5" stop-color="${pal.accent}"/>
      <stop offset="1" stop-color="${pal.bgMid}"/>
    </linearGradient>
    <linearGradient id="cloak" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#221a3c"/>
      <stop offset="1" stop-color="#120e22"/>
    </linearGradient>
    <radialGradient id="vig" cx="0.5" cy="0.45" r="0.75">
      <stop offset="0.6" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.55"/>
    </radialGradient>
    <filter id="glowF" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glowS" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="3" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="10"/>
    </filter>
  </defs>

  <rect width="640" height="880" fill="url(#bg)"/>
  <path d="M0 610 L150 470 L300 600 L450 480 L640 615 Z" fill="#000" opacity="0.28"/>
  <ellipse cx="320" cy="400" rx="250" ry="270" fill="url(#halo)"/>

  <!-- 地面霧光 -->
  <ellipse cx="320" cy="712" rx="300" ry="58" fill="${pal.accent}" opacity="0.1" filter="url(#soft)"/>

  <!-- 人物剪影 -->
  <g>
    <path d="M320 268 C246 284 210 356 200 470 C190 588 206 648 228 672 L412 672 C434 648 450 588 440 470 C430 356 394 284 320 268 Z"
          fill="url(#cloak)"/>
    <path d="M376 262 C416 310 442 386 440 470 C438 520 432 560 424 592"
          stroke="${pal.accent}" stroke-width="7" fill="none" opacity="0.5" filter="url(#glowS)" stroke-linecap="round"/>
    ${classBodyDetail(card.class, pal.accent)}
    <circle cx="320" cy="298" r="60" fill="url(#cloak)"/>
    <ellipse cx="320" cy="312" rx="42" ry="47" fill="#0c0918"/>
    ${eyes(card.race, pal.accent)}
    ${raceAccent(card.race, pal.accent)}
  </g>
  ${prop(card, pal, rnd)}
  ${dots}
  <rect width="640" height="880" fill="url(#vig)"/>
</svg>
`;
}

const { CARDS } = await import('../src/data/cards.js');

let made = 0;
for (const card of Object.values(CARDS)) {
  if (fs.existsSync(path.join(DIR, card.id + '.svg'))) continue; // 已有檔案不覆蓋（含前 10 隻手做素材）
  fs.writeFileSync(path.join(DIR, `${card.id}.svg`), svgFor(card));
  made += 1;
}
console.log(`generated ${made} placeholder arts`);
