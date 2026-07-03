// 佔位立繪 → 去背 cutout 版：
// 保留 <defs> 與所有 <g>（人物剪影/武器），移除頂層場景元素（背景/地面/光暈/塵點/暗角），
// viewBox 裁到人物範圍（腳底貼齊下緣）。輸出 <cardId>_cutout.svg。
// 真去背 PNG 素材到位後，此腳本與 cutout 檔可整批淘汰。
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('public/assets/cards');
// 人物範圍（所有佔位立繪同構：cx≈320、腳底 y≈672）
const VIEWBOX = '110 110 420 566';

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.svg') && !f.endsWith('_cutout.svg'));
for (const file of files) {
  const src = fs.readFileSync(path.join(DIR, file), 'utf8');
  const lines = src.split('\n');
  const out = [];
  let inDefs = false;
  let gDepth = 0;
  let kept = 0;
  let dropped = 0;

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('<svg')) {
      out.push(
        `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="566" viewBox="${VIEWBOX}">`
      );
      continue;
    }
    if (t.startsWith('<defs')) inDefs = true;
    if (inDefs) {
      out.push(line);
      if (t.includes('</defs>')) inDefs = false;
      continue;
    }
    if (t.startsWith('</svg>')) {
      out.push(line);
      continue;
    }
    const opens = (t.match(/<g[\s>]/g) || []).length;
    const closes = (t.match(/<\/g>/g) || []).length;
    if (gDepth > 0 || opens > 0) {
      out.push(line);
      kept += 1;
    } else if (t.length) {
      dropped += 1;
    }
    gDepth += opens - closes;
  }

  const outFile = file.replace('.svg', '_cutout.svg');
  fs.writeFileSync(path.join(DIR, outFile), out.join('\n'));
  console.log(`${outFile}: kept ${kept} lines, dropped ${dropped}`);
}
