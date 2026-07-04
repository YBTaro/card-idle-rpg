// 離線模式驗證：不開 game server，競技場應退回機器人對手＋離線標示。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
await page.goto('http://localhost:5199', { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 2500));
for (let i = 0; i < 6; i += 1) {
  const had = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button,.pressable')].find((x) => /知道了|下一步|開始|✕/.test(x.textContent));
    if (b) { b.click(); return true; }
    return false;
  });
  if (!had) break;
  await new Promise((r) => setTimeout(r, 300));
}
await page.evaluate(() => {
  const n = [...document.querySelectorAll('.dia')].find((x) => x.textContent.includes('競技場'));
  n?.click();
});
await new Promise((r) => setTimeout(r, 7000)); // 等 API timeout → 離線降級
await page.screenshot({ path: 'shots/so8-arena-offline.png' });
await browser.close();
console.log('done');
