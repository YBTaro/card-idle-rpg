// 重設計驗證：新首頁 / 英雄頁(篩選欄+卡面徽章) / 角色詳情(頁簽) / 隊伍戰區。
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
await page.goto('http://localhost:5199', { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(2500);
for (let i = 0; i < 6; i += 1) {
  const had = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button,.pressable')].find((x) => /知道了|下一步|開始|✕/.test(x.textContent));
    if (b) { b.click(); return true; }
    return false;
  });
  if (!had) break;
  await sleep(300);
}
const shot = async (n) => { await page.screenshot({ path: `shots/${n}.png` }); console.log('shot:', n); };
const click = (sel, t) => page.evaluate((s, txt) => {
  const n = [...document.querySelectorAll(s)].find((x) => x.textContent.trim().includes(txt));
  if (n) n.click();
  return !!n;
}, sel, t);

await shot('rd1-home');

// 英雄頁 + 篩選
await click('.hub-dk', '英雄');
await sleep(1300);
await shot('rd2-heroes');
await click('.fchip', '坦克');
await sleep(700);
await shot('rd3-heroes-filter');
await click('.fchip', '坦克'); // 取消

// 角色詳情（點第一張卡）→ 三頁簽
await page.evaluate(() => document.querySelector('.deck-item')?.click());
await sleep(900);
await shot('rd4-sheet-grow');
await click('.hs-tabbtn', '資訊');
await sleep(500);
await shot('rd5-sheet-info');
await click('.hs-tabbtn', '技能');
await sleep(500);
await shot('rd6-sheet-skill');
await page.evaluate(() => document.querySelector('.hs-arrow, .back-btn')?.click());
await sleep(600);
await page.evaluate(() => document.querySelector('.back-btn')?.click());
await sleep(600);

// 隊伍
await click('.hub-dk', '隊伍');
await sleep(1200);
await shot('rd7-team');

await browser.close();
console.log('done');
