// 把卡面 SVG 光柵化成 WebP（模糊濾鏡烘進點陣、去背），消除手機捲動/進頁的即時光柵化成本。
// 用法：node scripts/make-card-raster.mjs [只做這些id用逗號分隔]
//   無參數＝全部卡面。輸出 public/assets/cards/<id>.webp（640×880，同 SVG 內容）。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const CARDS_DIR = path.resolve('public/assets/cards');
const W = 640, H = 880;           // 同 SVG 原生 viewBox；卡面顯示僅約 170px，640 寬已足夠銳利
const SCALE = 1;                  // scale 1＝存 640×880；避免存過大點陣（手機捲動時解碼成本）
const only = (process.argv[2] || '').split(',').filter(Boolean);

// 卡面 SVG＝不含 _cutout 的 .svg
const files = fs.readdirSync(CARDS_DIR)
  .filter((f) => f.endsWith('.svg') && !f.endsWith('_cutout.svg'))
  .map((f) => f.replace(/\.svg$/, ''))
  .filter((id) => !only.length || only.includes(id));

const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: 'new', args: ['--no-sandbox', '--disable-gpu-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: SCALE });

let done = 0, totalBytes = 0;
for (const id of files) {
  const svgPath = path.join(CARDS_DIR, `${id}.svg`);
  const svg = fs.readFileSync(svgPath, 'utf8');
  // 用 data-URI 內嵌 SVG，撐滿 640×880；body 透明背景
  const html = `<!doctype html><meta charset=utf8><style>html,body{margin:0;padding:0;background:transparent}svg{display:block;width:${W}px;height:${H}px}</style>${svg}`;
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  // 確保 SVG 撐滿（有些 SVG 沒 width/height，靠 CSS 補）+ 等一幀讓濾鏡渲染完
  await page.evaluate((w, h) => { const s = document.querySelector('svg'); if (s) { s.setAttribute('width', w); s.setAttribute('height', h); } }, W, H);
  await new Promise((r) => setTimeout(r, 30));
  const out = path.join(CARDS_DIR, `${id}.webp`);
  await page.screenshot({ path: out, type: 'webp', quality: 92, omitBackground: true, clip: { x: 0, y: 0, width: W, height: H } });
  const sz = fs.statSync(out).size;
  totalBytes += sz;
  done += 1;
  if (done <= 3 || done % 20 === 0) console.log(`  ${id}.webp  ${(sz / 1024).toFixed(0)}KB`);
}
await browser.close();
console.log(`完成 ${done} 張，共 ${(totalBytes / 1024 / 1024).toFixed(1)}MB（平均 ${(totalBytes / done / 1024).toFixed(0)}KB/張）`);
