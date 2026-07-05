// 十連連點重入測試：狂點召喚鈕與「再抽」，驗證只有一場儀式、券數只扣一批。
import puppeteer from 'puppeteer-core';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
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
// 進召喚頁
await page.evaluate(() => {
  const n = [...document.querySelectorAll('.hub-dk')].find((x) => x.textContent.includes('召喚'));
  n?.click();
});
await sleep(900);

const before = await page.evaluate(() => JSON.parse(localStorage.getItem('card-idle-rpg:save')).currencies.tickets);
// 狂點十連 6 次（.click() 直呼，繞過 overlay 遮擋——最嚴苛情境）
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.gxb')].find((b) => b.textContent.includes('10'));
  for (let i = 0; i < 6; i += 1) btn.click();
});
await sleep(800);
const overlays = await page.evaluate(() => document.querySelectorAll('.summon-ov').length);
await page.evaluate(() => { for (let i = 0; i < 5; i += 1) document.querySelector('.summon-skip')?.click(); }); // 跳過演出
await page.waitForSelector('.summon-actions', { timeout: 15000 }).catch(() => {});
// 狂點「再抽」5 次
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.summon-actions button')].find((b) => b.textContent.includes('再抽'));
  for (let i = 0; i < 5; i += 1) btn?.click();
});
await sleep(1200);
const overlays2 = await page.evaluate(() => document.querySelectorAll('.summon-ov').length);
await page.evaluate(() => { for (let i = 0; i < 5; i += 1) document.querySelector('.summon-skip')?.click(); });
await page.waitForSelector('.summon-actions', { timeout: 15000 }).catch(() => {});
await page.evaluate(() => [...document.querySelectorAll('.summon-actions button')].find((b) => b.textContent.includes('確定'))?.click());
await sleep(600);
const after = await page.evaluate(() => JSON.parse(localStorage.getItem('card-idle-rpg:save')).currencies.tickets);

console.log(`儀式層數（狂點十連後）: ${overlays}（應為 1）`);
console.log(`儀式層數（狂點再抽後）: ${overlays2}（應為 1）`);
console.log(`券數 ${before} → ${after}（應扣 20：一批十連＋一批再抽）`);
await browser.close();
console.log('done');
