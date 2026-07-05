// 環境特效驗證（vite 5199）：改存檔關卡強制進入 烈日+侵蝕(21) / 颶風+沼澤(31)，
// 加上戰鬥頭頂資訊條 2.0（職業章/屬性寶石/Lv）與返回鈕不重疊的目視檢查。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const OUT = './shots-de/';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--window-size=1280,760'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('[pageerror]', e.stack || e.message));

const shot = async (name) => { await page.screenshot({ path: `${OUT}${name}.png` }); console.log('shot:', name); };
const clickText = async (sel, t) => page.evaluate((s, txt) => {
  const n = [...document.querySelectorAll(s)].find((x) => x.textContent.trim().includes(txt));
  if (n) { n.click(); return true; }
  return false;
}, sel, t);

const battleAtStage = async (stage, name) => {
  await page.goto('http://localhost:5199', { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1200);
  await page.evaluate((st) => {
    const key = 'card-idle-rpg:save';
    const data = JSON.parse(localStorage.getItem(key));
    data.progress.stage = st;
    data.meta.ftueDone = true;
    localStorage.setItem(key, JSON.stringify(data));
  }, stage);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(1800);
  // 關掉登入彈窗序列（簽到/掛機箱……最多清 4 層）
  for (let i = 0; i < 4; i += 1) {
    const closed = await page.evaluate(() => {
      const btn = document.querySelector('.ov .ov-close, .ov button.close')
        ?? [...document.querySelectorAll('.ov button')].find((b) => /✕|×|關閉|領取|收下/.test(b.textContent));
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!closed) break;
    await sleep(600);
  }
  await clickText('.bn, .dia, .hub-sci, .pressable', '出發');
  await sleep(4200); // 過開場宣告，看常駐環境特效
  await shot(name);
};

// 用開發鉤子直接切環境（不受關卡/進場被動影響，指定組合 100% 可截）
await battleAtStage(21, '08-env-rain-erosion');
await page.evaluate(() => {
  window.__battle.scene._drawWeather('sunny');
  window.__battle.scene._drawTerrain('swamp');
});
await sleep(2500);
await shot('09-env-sunny-swamp');

// 環境標籤點擊 → 效果面板
await page.evaluate(() => document.querySelector('.bo-env')?.click());
await sleep(500);
await shot('10-env-panel');

await browser.close();
console.log('done');
