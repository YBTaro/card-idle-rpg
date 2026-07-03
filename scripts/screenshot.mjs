// 全畫面截圖自驗：Edge headless + puppeteer-core
// 用法：node scripts/screenshot.mjs [輸出資料夾] [寬] [高]（預設 ./shots/ 1280 720）
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.argv[2] || './shots') + path.sep;
const VIEW_W = Number(process.argv[3]) || 1280;
const VIEW_H = Number(process.argv[4]) || 720;
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--window-size=1280,760'],
});
const page = await browser.newPage();
await page.setViewport({ width: VIEW_W, height: VIEW_H, deviceScaleFactor: 2 });
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text());
});
page.on('pageerror', (e) => console.log('[pageerror]', e.stack || e.message));

await page.goto('http://localhost:5199', { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(2000);

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log('shot:', name);
};

// 依文字找元素點擊
const clickText = async (selector, text) => {
  const ok = await page.evaluate(
    (sel, t) => {
      const nodes = [...document.querySelectorAll(sel)];
      const n = nodes.find((x) => x.textContent.trim().includes(t));
      if (n) {
        n.click();
        return true;
      }
      return false;
    },
    selector,
    text
  );
  if (!ok) console.log('  !! click miss:', selector, text);
  return ok;
};
const click = async (sel) => {
  const ok = await page.evaluate((s) => {
    const n = document.querySelector(s);
    if (n) {
      n.click();
      return true;
    }
    return false;
  }, sel);
  if (!ok) console.log('  !! click miss:', sel);
  return ok;
};

// 1) 首次進入（FTUE）
await shot('01-home-ftue');
// 跳過 FTUE
for (let i = 0; i < 6; i++) {
  const has = await page.evaluate(() => !!document.querySelector('.ftue-tip'));
  if (!has) break;
  await clickText('.ftue-tip button', '跳過');
  await sleep(300);
}
await sleep(400);
await shot('02-home');

// 2) 任務 / 簽到 / 掛機箱
await clickText('.hub-sci', '任務');
await sleep(600);
await shot('03-quests');
await click('.ov-close');
await sleep(400);
await clickText('.hub-sci', '簽到');
await sleep(600);
await shot('04-signin');
await click('.ov-close');
await sleep(400);

// 3) 隊伍頁
await clickText('.hub-bar .bn', '隊伍');
await sleep(700);
await shot('05-team');
// 打開英雄替換抽屜
await clickText('.tp-bottom button', '英雄替換');
await sleep(500);
await shot('06-team-drawer');
await clickText('.swap-drawer button', '關閉');
await sleep(300);
// 點一張卡開詳情
await click('.tcard:not(.empty)');
await sleep(700);
await shot('07-hero-sheet');
await click('.hero-sheet .back-btn');
await sleep(500);
await click('#screen-team .back-btn');
await sleep(500);

// 4) 英雄頁 + 圖鑑
await clickText('.hub-bar .bn', '英雄');
await sleep(600);
await shot('08-heroes');
await clickText('.hx-tab', '圖鑑');
await sleep(500);
await shot('09-codex');
await click('#screen-heroes .back-btn');
await sleep(400);

// 5) 召喚頁 + 十連揭曉
await clickText('.hub-bar .bn', '召喚');
await sleep(700);
await shot('10-gacha');
await clickText('.gx-odds', '機率');
await sleep(500);
await shot('11-odds');
await click('.ov-close');
await sleep(400);
await clickText('.gxb.gold', '召喚');
await sleep(1200);
await shot('12-summon-mid');
// 等揭曉演出真正結束（.summon-actions 出現）
await page.waitForSelector('.summon-actions', { timeout: 15000 }).catch(() => {});
await sleep(400);
await shot('13-summon-result');
await clickText('.summon-actions button', '確定');
await sleep(500);
await click('#screen-gacha .back-btn');
await sleep(400);

// 6) 戰役
await clickText('.dia', '戰役');
await sleep(2600);
await shot('14-battle');
await sleep(4000);
await shot('15-battle-later');

await browser.close();
console.log('done');
