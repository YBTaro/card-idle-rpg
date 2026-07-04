// 試煉塔/商店/新圖示 截圖驗證（vite 5199）。
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
const clickText = (sel, t) => page.evaluate((s, txt) => {
  const n = [...document.querySelectorAll(s)].find((x) => x.textContent.trim().includes(txt));
  if (n) n.click();
  return !!n;
}, sel, t);

await shot('ts1-home-icons');

await clickText('.dia', '試煉塔');
await sleep(1400);
await shot('ts2-tower');

// 挑戰第 1 層 → 跳過 → 勝利彈窗（獎勵飛入）
await clickText('.tw-fight', '挑戰');
await sleep(2200);
await clickText('.bo-cb', '⏭');
await sleep(2400);
await shot('ts3-tower-win');
await clickText('button', '繼續攀登');
await sleep(600);
await shot('ts4-tower-advanced');

await clickText('.back-btn', '');
await sleep(600);
await clickText('.bn', '商店');
await sleep(1200);
await shot('ts5-shop');

await browser.close();
console.log('done');
