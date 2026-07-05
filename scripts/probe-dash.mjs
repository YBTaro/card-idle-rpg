// 探針：跑戰鬥，攔截 replayer 的 attack 事件，記錄每個「近戰玩家單位」的
// 攻擊者站位 / 目標站位 / 目標隊伍 / 目標 sprite x vs 攻擊者 sprite x。
// 若出現「玩家近戰單位的目標是我方，或 dash 目標在自己左邊」→ 就是 bug 現場。
import puppeteer from 'puppeteer-core';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
page.on('console', (m) => { const t = m.text(); if (t.startsWith('[PROBE]')) console.log(t); });
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
// 進戰役，安裝探針
await page.evaluate(() => {
  const b = window.__battle;
  // 每次 _mount 後 scene/replayer 會換新，故用輪詢掛探針
  const install = () => {
    const sc = b.scene, rp = b.replayer;
    if (!sc || !rp || rp.__probed) return;
    rp.__probed = true;
    rp.on('attack', ({ attackerUid, targetUid }) => {
      const s = sc.sprites.get(attackerUid);
      const t = targetUid != null ? sc.sprites.get(targetUid) : null;
      if (!s || !t) return;
      const style = s._info.class === 'support' ? 'ranged' : 'melee';
      if (s._info.team !== 0 || style !== 'melee') return; // 只看玩家近戰
      const dx = Math.round(t.x - s.x); // >0 往右(敵方)、<0 往左(自己方)
      const dead = !rp.aliveOf(targetUid);
      console.log(`[PROBE] pos${s._info.pos}(${s._info.name}) → team${t._info.team} pos${t._info.pos}(${t._info.name}) dx=${dx}${dx < 60 ? '  <<< 疑似往自己方向' : ''}${dead ? ' [目標已死]' : ''}`);
    });
  };
  window.__probeTimer = setInterval(install, 150);
  document.querySelector('.hub-adv')?.click(); // 大冒險鈕 → 戰役
});
console.log('[PROBE] installed, watching 30s...');
await sleep(30000);
console.log('[PROBE] done');
await browser.close();
