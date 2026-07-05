import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new', args: ['--no-sandbox', '--disable-gpu-sandbox'],
});
const page = await browser.newPage();
page.on('console', (m) => console.log('[console]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5173', { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(2500);
const typeofGrant = await page.evaluate(() => typeof window.__grant);
console.log('typeof __grant =', typeofGrant);
const before = await page.evaluate(() => JSON.parse(localStorage.getItem('card-idle-rpg:save')).cards.filter((c) => c.cardId === 'emberwitch').length);
console.log('魔女(發卡前) =', before);
const ret = await page.evaluate(() => (window.__grant ? window.__grant('emberwitch') : 'NO __grant'));
console.log('__grant 回傳 =', ret);
await sleep(300);
const after = await page.evaluate(() => JSON.parse(localStorage.getItem('card-idle-rpg:save')).cards.filter((c) => c.cardId === 'emberwitch').length);
console.log('魔女(發卡後) =', after);
await browser.close();
