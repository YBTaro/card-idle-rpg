// 隕星雨（全體技特效）目視驗證：用 dev 鉤子直接在戰場召喚特效（vite 5199）。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

fs.mkdirSync('./shots-de', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('[pageerror]', e.stack || e.message));

await page.goto('http://localhost:5199', { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(1500);
for (let i = 0; i < 4; i += 1) {
  const closed = await page.evaluate(() => {
    const btn = document.querySelector('.ov .ov-close')
      ?? [...document.querySelectorAll('.ov button, .ftue-tip button')].find((b) => /✕|×|關閉|領取|跳過/.test(b.textContent));
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!closed) break;
  await sleep(500);
}
await page.evaluate(() => {
  const n = [...document.querySelectorAll('.bn, .dia, .hub-sci, .pressable')].find((x) => x.textContent.includes('出發'));
  n?.click();
});
await sleep(3500);

await page.evaluate(async () => {
  window.__battle.setSpeed(1); // 特效原速，截圖才抓得到飛行中
  const { meteorRain } = await import('/src/render/skillVfx.js');
  const sc = window.__battle.scene;
  meteorRain(sc.fxLayer, 920, 400, 260, 0xbb8cff, sc._dotTex);
});
await sleep(200);
await page.screenshot({ path: './shots-de/11-meteor-mid.png' });
await sleep(280);
await page.screenshot({ path: './shots-de/12-meteor-impact.png' });
console.log('done');
await browser.close();
