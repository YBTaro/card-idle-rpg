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
      if (s._info.team !== 0) return; // 只看玩家
      const homeX = Math.round(s._homeX ?? s.x);
      const homeY = Math.round(s._homeY ?? s.y);
      // 攻擊後 1.6s 應已回位——若離自己家 >40px＝卡在半路（可能停在隊友格）
      setTimeout(() => {
        if (s.destroyed) return;
        const restX = Math.round(s.x), restY = Math.round(s.y);
        const off = Math.abs(restX - homeX) + Math.abs(restY - homeY);
        if (off <= 40) return;
        // 找最近的隊友格
        let near = null, nd = 1e9;
        for (const sp of sc.sprites.values()) {
          if (sp === s || sp._info.team !== 0) continue;
          const d = Math.abs((sp._homeX ?? sp.x) - restX) + Math.abs((sp._homeY ?? sp.y) - restY);
          if (d < nd) { nd = d; near = sp._info; }
        }
        console.log(`[PROBE] ⚠卡位 pos${s._info.pos}(${s._info.name}) 應停(${homeX},${homeY}) 實停(${restX},${restY}) 偏移${off}`
          + (near && nd < 50 ? `  <<<<< 卡在隊友 pos${near.pos}(${near.name}) 格！` : ''));
      }, 1600);
    });
  };
  window.__probeTimer = setInterval(install, 150);
  document.querySelector('.hub-adv')?.click(); // 大冒險鈕 → 戰役

  // 持續監測：每 120ms 掃所有玩家單位，抓「存活/沒突進/沒補間/卻離家>25px」——
  // 用 window.__gsap 判斷補間；連續 3 次都卡才報（濾掉正常回位途中的瞬間）。
  window.__stuck = {};
  window.__monTimer = setInterval(() => {
    const sc = window.__battle?.scene, rp = window.__battle?.replayer;
    if (!sc || !rp) return;
    for (const [uid, s] of sc.sprites) {
      if (s._info.team !== 0 || s._destroyed) continue;
      const home = (s._homeX != null) && (Math.abs(s.x - s._homeX) + Math.abs(s.y - s._homeY) <= 25);
      const tweening = window.__gsap ? window.__gsap.getTweensOf(s).length > 0 : false;
      const bad = rp.aliveOf(uid) && !s._dashing && !tweening && !home && s._homeX != null;
      window.__stuck[uid] = bad ? (window.__stuck[uid] || 0) + 1 : 0;
      if (window.__stuck[uid] === 3) {
        console.log(`[PROBE] ⚠持續卡位 pos${s._info.pos}(${s._info.name}) x=${Math.round(s.x)} home=${Math.round(s._homeX)} y=${Math.round(s.y)} homeY=${Math.round(s._homeY)}`);
      }
    }
  }, 120);
});
console.log('[PROBE] installed, watching 90s (多場)...');
await sleep(90000);
console.log('[PROBE] done');
await browser.close();
