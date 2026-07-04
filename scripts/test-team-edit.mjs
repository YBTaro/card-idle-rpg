// 英雄替換編輯模式驗證（含儀器）：點隊上英雄移出 + 從抽屜拖英雄上格位替換。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync('scripts/shots', { recursive: true });
const b = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new',
  args: ['--no-sandbox'],
});
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720 });
await p.goto('http://localhost:5199', { waitUntil: 'networkidle2' });
await sleep(2000);
for (let i = 0; i < 6; i++) {
  const c = await p.evaluate(() => {
    const x = [...document.querySelectorAll('.ftue-tip button')].find((n) => n.textContent.includes('跳過'));
    if (x) { x.click(); return true; }
    return false;
  });
  if (!c) break;
  await sleep(200);
}
await p.evaluate(() => {
  [...document.querySelectorAll('.hub-bar .bn')].find((n) => n.textContent.includes('隊伍'))?.click();
});
await sleep(700);

const team = () =>
  p.evaluate(() =>
    [...document.querySelectorAll('.tcard')].map((n) => `${n.dataset.pos}:${n.querySelector('.nm')?.textContent || '空'}`).join(' | ')
  );

// 開抽屜 → 點卡移出
await p.evaluate(() => {
  [...document.querySelectorAll('.tp-bottom button')].find((n) => n.textContent.includes('英雄替換'))?.click();
});
await sleep(500);
await p.evaluate(() => document.querySelector('.tcard:not(.empty)')?.click());
await sleep(600);
console.log('點卡移出後:', await team());

// 儀器：監聽 window pointer 事件計數/座標 + swap-item 上的 pointerdown + 頁面錯誤
p.on('pageerror', (e) => console.log('PAGEERR:', e.stack?.split('\n').slice(0, 3).join(' | ')));
await p.evaluate(() => {
  window.__ev = { wDown: 0, wMove: 0, iDown: 0, downXY: null, moves: [] };
  window.addEventListener('pointerdown', (e) => {
    window.__ev.wDown += 1;
    window.__ev.downXY = [e.clientX, e.clientY, e.button, e.pointerType];
  }, true);
  window.addEventListener('pointermove', (e) => {
    window.__ev.wMove += 1;
    if (window.__ev.moves.length < 20) window.__ev.moves.push([Math.round(e.clientX), Math.round(e.clientY)]);
  }, true);
  document.querySelector('.swap-item')?.addEventListener('pointerdown', () => (window.__ev.iDown += 1), true);
});

const rects = await p.evaluate(() => {
  const src = document.querySelector('.swap-item');
  const dst = document.querySelector('.tcard:not(.empty)');
  const r = (n) => {
    const bb = n.getBoundingClientRect();
    return { x: bb.left + bb.width / 2, y: bb.top + bb.height / 2 };
  };
  return { src: r(src), dst: r(dst) };
});
console.log('src', rects.src, 'dst', rects.dst);
// headless 會把 pointermove 餓死（每批只送 1 個），改用合成 PointerEvent 驗證處理器邏輯
const mkOpts = (x, y) =>
  `{bubbles:true,cancelable:true,clientX:${x},clientY:${y},button:0,pointerId:7,pointerType:'mouse',isPrimary:true}`;
await p.evaluate(
  `(() => {
    const item = document.querySelector('.swap-item');
    item.dispatchEvent(new PointerEvent('pointerdown', ${mkOpts(rects.src.x, rects.src.y)}));
    item.dispatchEvent(new PointerEvent('pointermove', ${mkOpts(rects.src.x, rects.src.y - 40)}));
  })()`
);
console.log('ghost exists mid-up:', await p.evaluate(() => !!document.querySelector('.drag-ghost')));
await p.evaluate(
  `(() => {
    const item = document.querySelector('.swap-item');
    item.dispatchEvent(new PointerEvent('pointermove', ${mkOpts(rects.dst.x, rects.dst.y)}));
  })()`
);
console.log('drop-hint on target:', await p.evaluate(() => !!document.querySelector('.tcard.drop-hint')));
await p.screenshot({ path: 'scripts/shots/swap2-dragging.png' });
await p.evaluate(
  `(() => {
    const item = document.querySelector('.swap-item');
    item.dispatchEvent(new PointerEvent('pointerup', ${mkOpts(rects.dst.x, rects.dst.y)}));
  })()`
);
await sleep(300);
console.log('toast:', await p.evaluate(() => document.querySelector('.toast')?.textContent || '(無)'));
console.log('ghost cleaned:', await p.evaluate(() => !document.querySelector('.drag-ghost')));
await sleep(600);
console.log('拖曳替換後:', await team());
await b.close();
console.log('done');
