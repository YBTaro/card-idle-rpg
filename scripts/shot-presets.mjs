import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
fs.mkdirSync('./shots-de', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new', args: ['--no-sandbox', '--disable-gpu-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(1600);
for (let i = 0; i < 5; i++) {
  const c = await page.evaluate(() => { const b = document.querySelector('.ov .ov-close') ?? [...document.querySelectorAll('.ov button, .ftue-tip button')].find((x) => /✕|×|關閉|領取|跳過/.test(x.textContent)); if (b) { b.click(); return true; } return false; });
  if (!c) break; await sleep(400);
}
await page.evaluate(() => [...document.querySelectorAll('.hub-dk')].find((x) => x.textContent.includes('隊伍'))?.click());
await sleep(900);
// 開預設 → 存兩組
await page.evaluate(() => [...document.querySelectorAll('.tp-bottom button')].find((b) => b.textContent.includes('預設'))?.click());
await sleep(500);
await page.evaluate(() => [...document.querySelectorAll('.ov-presets button')].find((b) => b.textContent.includes('儲存目前隊伍'))?.click());
await sleep(400);
await page.evaluate(() => [...document.querySelectorAll('.ov-presets button')].find((b) => b.textContent.includes('儲存目前隊伍'))?.click());
await sleep(500);
await page.screenshot({ path: './shots-de/15-presets.png' });
console.log('done');
await browser.close();
