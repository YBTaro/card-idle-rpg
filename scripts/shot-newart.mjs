// 新卡立繪驗證：圖鑑頁往下捲到底看機制拼圖批次的佔位立繪。
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
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto('http://localhost:5199', { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(1600);
for (let i = 0; i < 5; i += 1) {
  const closed = await page.evaluate(() => {
    const btn = document.querySelector('.ov .ov-close')
      ?? [...document.querySelectorAll('.ov button, .ftue-tip button')].find((b) => /✕|×|關閉|領取|跳過/.test(b.textContent));
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!closed) break;
  await sleep(400);
}
await page.evaluate(() => {
  const n = [...document.querySelectorAll('.hub-dk')].find((x) => x.textContent.includes('英雄'));
  n?.click();
});
await sleep(1000);
await page.evaluate(() => {
  const t = [...document.querySelectorAll('.hx-tab')].find((x) => x.textContent.includes('圖鑑'));
  t?.click();
});
await sleep(800);
await page.evaluate(() => {
  const sc = document.querySelector('.hx-scroll');
  if (sc) sc.scrollTop = sc.scrollHeight;
});
await sleep(800);
await page.screenshot({ path: './shots-de/13-newcards-codex.png' });
console.log('done');
await browser.close();
