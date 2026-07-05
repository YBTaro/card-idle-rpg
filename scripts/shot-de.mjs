// D/E 組驗證截圖（vite 5199）：隊伍羈絆條 / 英雄詳情(絕技Lv+普攻) / 戰役敵情條 / 單位狀態面板 / 結算統計。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const OUT = './shots-de/';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--window-size=1280,760'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('[pageerror]', e.stack || e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });

await page.goto('http://localhost:5199', { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(2000);

const shot = async (name) => { await page.screenshot({ path: `${OUT}${name}.png` }); console.log('shot:', name); };
const clickText = async (sel, t) => {
  const ok = await page.evaluate((s, txt) => {
    const n = [...document.querySelectorAll(s)].find((x) => x.textContent.trim().includes(txt));
    if (n) { n.click(); return true; }
    return false;
  }, sel, t);
  if (!ok) console.log('  !! miss:', sel, t);
  return ok;
};
const click = async (sel) => {
  const ok = await page.evaluate((s) => { const n = document.querySelector(s); if (n) { n.click(); return true; } return false; }, sel);
  if (!ok) console.log('  !! miss:', sel);
  return ok;
};

// 跳過 FTUE
for (let i = 0; i < 6; i++) {
  const has = await page.evaluate(() => !!document.querySelector('.ftue-tip'));
  if (!has) break;
  await clickText('.ftue-tip button', '跳過');
  await sleep(300);
}
await sleep(400);

// 1) 隊伍頁：羈絆提示條
await clickText('.hub-dk', '隊伍');
await sleep(800);
await shot('01-team-synergy');

// 2) 英雄詳情：絕技 Lv chip（＋有特殊普攻的卡會多一列）
await click('.tcard:not(.empty)');
await sleep(700);
await shot('02-hero-sheet');
await click('.hero-sheet .back-btn');
await sleep(400);
await click('#screen-team .back-btn');
await sleep(500);

// 3) 戰役：敵情條 + 開場
await clickText('.bn, .dia, .hub-sci, .pressable', '出發');
await sleep(3000);
await shot('03-battle-foes');

// 4) 點我方單位 → 狀態面板（canvas contain 縮放：直接對 canvas 元素多點試點）
const tapped = await page.evaluate(() => {
  const canvas = document.querySelector('#battle-canvas canvas');
  if (!canvas) return false;
  const r = canvas.getBoundingClientRect();
  // 場景座標（1280×720 設計座標）我方前排約在 x 0.36~0.44、y 0.55~0.75 附近，多試幾點
  const pts = [[0.40, 0.62], [0.36, 0.68], [0.44, 0.58], [0.30, 0.66], [0.42, 0.72]];
  for (const [fx, fy] of pts) {
    const x = r.left + r.width * fx;
    const y = r.top + r.height * fy;
    for (const type of ['pointerdown', 'pointerup']) {
      canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 }));
    }
    if (document.querySelector('.bo-unitpanel')) return true;
  }
  return !!document.querySelector('.bo-unitpanel');
});
console.log('unit tap panel:', tapped);
await sleep(400);
await shot('04-unit-status');
await click('.bo-unitpanel .up-close');

// 5) 跳過 → 結算 → 戰鬥詳情統計
await clickText('.bo-cb', '⏭');
await page.waitForSelector('.bo-result', { timeout: 20000 }).catch(() => {});
await sleep(500);
await shot('05-result');
await clickText('.bo-result button', '詳情');
await sleep(500);
await shot('06-stats');

await browser.close();
console.log('done');
