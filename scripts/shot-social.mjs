// 社交系統頁面截圖驗證：主城入口 → 競技場 → 好友 → 公會。
// 前置：vite（5199）與 game server（8787）都在跑。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

fs.mkdirSync('shots', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });

await page.goto('http://localhost:5199', { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(2500);

const clickText = (sel, t) => page.evaluate((s, txt) => {
  const n = [...document.querySelectorAll(s)].find((x) => x.textContent.trim().includes(txt));
  if (n) n.click();
  return !!n;
}, sel, t);

// FTUE 擋住就點掉
for (let i = 0; i < 6; i += 1) {
  const had = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button, .tut-next, .pressable')].find((x) => /知道了|下一步|開始|✕/.test(x.textContent));
    if (b) { b.click(); return true; }
    return false;
  });
  if (!had) break;
  await sleep(400);
}

const shot = async (n) => { await page.screenshot({ path: `shots/${n}.png` }); console.log('shot:', n); };

await shot('so1-home');

// 競技場
await clickText('.dia', '競技場');
await sleep(1800);
await shot('so2-arena');

// 名片（點第一個對手頭）
await clickText('.ar-foehead', '');
await sleep(700);
await shot('so3-playercard');
await clickText('.ov-close', '✕');
await sleep(400);

// 挑戰 → 戰場回放 → 跳過 → 結算彈窗
const challenged = await clickText('.ar-foe .btn-gold', '挑戰');
if (challenged) {
  await sleep(2500);
  await shot('so6-arena-replay');
  await clickText('.bo-cb', '⏭'); // 快轉
  await sleep(2600); // 結果橫幅 + 冷卻回頁
  await shot('so7-arena-result');
  await clickText('button', '確定');
  await sleep(500);
}

// 好友
await clickText('.back-btn', '🏠');
await sleep(600);
await clickText('.hub-sci', '好友');
await sleep(1500);
await shot('so4-friends');

// 公會
await clickText('.back-btn', '🏠');
await sleep(600);
await clickText('.dia', '公會');
await sleep(1500);
await shot('so5-guild');

await browser.close();
console.log('done');
