// 普攻列全卡顯示驗證：開一張「標準普攻」卡的詳情頁，應出現「普攻：對位單體 100%」列。
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
  const n = [...document.querySelectorAll('.hub-dk')].find((x) => x.textContent.includes('隊伍'));
  n?.click();
});
await sleep(900);
await page.evaluate(() => document.querySelector('.tcard:not(.empty)')?.click());
await sleep(800);
const hasRow = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.hs-skdesc')];
  return rows.some((r) => r.textContent.includes('對直行對位的敵人造成 100%'));
});
console.log('標準卡顯示普攻列:', hasRow, '（應為 true）');
await page.screenshot({ path: './shots-de/14-basic-row.png' });
console.log('done');
await browser.close();
