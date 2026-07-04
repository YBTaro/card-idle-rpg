// 全頁面巡檢截圖（vite 5199）：隊伍/英雄/召喚。
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
const go = (id) => page.evaluate((x) => {
  const n = [...document.querySelectorAll('.bn, .dia, .hub-sci')].find((e) => e.textContent.trim().includes(x));
  n?.click();
}, id);
const home = () => page.evaluate(() => document.querySelector('.back-btn')?.click());

await go('隊伍'); await sleep(1200); await shot('pg-team'); await home(); await sleep(500);
await go('英雄'); await sleep(1200); await shot('pg-heroes'); await home(); await sleep(500);
await go('召喚'); await sleep(1500); await shot('pg-gacha');
await browser.close();
console.log('done');
