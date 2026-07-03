// 戰鬥畫面專用截圖：直達戰役，連拍數張。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.argv[2] || './shots') + path.sep;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--window-size=1280,760'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(1800);

// 跳過 FTUE（若有）
for (let i = 0; i < 6; i++) {
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.ftue-tip button')];
    const b = btns.find((x) => x.textContent.includes('跳過'));
    if (b) { b.click(); return true; }
    return false;
  });
  if (!clicked) break;
  await sleep(250);
}
// 關掉彈窗佇列（簽到等）
for (let i = 0; i < 4; i++) {
  const closed = await page.evaluate(() => {
    const c = document.querySelector('.ov-close');
    if (c) { c.click(); return true; }
    return false;
  });
  if (!closed) break;
  await sleep(400);
}

await page.evaluate(() => {
  const dias = [...document.querySelectorAll('.dia')];
  dias.find((d) => d.textContent.includes('戰役'))?.click();
});
await sleep(1600);
await page.screenshot({ path: `${OUT}b1-entrance.png` });
await sleep(2500);
await page.screenshot({ path: `${OUT}b2-mid.png` });
await sleep(3000);
await page.screenshot({ path: `${OUT}b3-late.png` });
await sleep(5000);
await page.screenshot({ path: `${OUT}b4-result.png` });

await browser.close();
console.log('done');
