// GSAP 動畫特效，作用在 Pixi 顯示物件上。與遊戲邏輯無關，純呈現。
import { gsap } from 'gsap';
import { Container, Graphics, Text } from 'pixi.js';
import { STAGE_H } from './pixiApp.js';

// 攻擊向前突刺再回位。dir = +1（向右）/ -1（向左）
export function lunge(sprite, dir) {
  const baseX = sprite._homeX ?? sprite.x;
  sprite._homeX = baseX;
  gsap.killTweensOf(sprite, 'x');
  gsap
    .timeline()
    .to(sprite, { x: baseX + dir * 34, duration: 0.12, ease: 'power2.out' })
    .to(sprite, { x: baseX, duration: 0.22, ease: 'power2.in' });
}

// 受擊閃白 + 輕微震動。body 為角色主體 Graphics。
export function hitFlash(sprite, body) {
  gsap.killTweensOf(body, 'tint');
  gsap.fromTo(body, { tint: 0xffffff }, { tint: 0xffffff, duration: 0.02 });
  gsap
    .timeline()
    .set(body, { tint: 0xff4444 })
    .to(body, { tint: 0xffffff, duration: 0.25, ease: 'power1.out' });

  const baseY = sprite._homeY ?? sprite.y;
  sprite._homeY = baseY;
  gsap.killTweensOf(sprite, 'y');
  gsap
    .timeline()
    .to(sprite, { y: baseY - 4, duration: 0.05 })
    .to(sprite, { y: baseY, duration: 0.18, ease: 'elastic.out(1,0.4)' });
}

// 大招放大脈衝 + 發光。脈衝相對於景深基準 _baseScale 計算，避免壓掉 2.5D 縮放。
export function ultPulse(sprite, body, color) {
  const base = sprite._baseScale ?? 1;
  gsap.killTweensOf(sprite.scale);
  gsap
    .timeline()
    .to(sprite.scale, { x: base * 1.3, y: base * 1.3, duration: 0.16, ease: 'back.out(2)' })
    .to(sprite.scale, { x: base, y: base, duration: 0.4, ease: 'power2.out' });
  if (body && color != null) {
    gsap
      .timeline()
      .set(body, { tint: color })
      .to(body, { tint: 0xffffff, duration: 0.5 });
  }
}

// 飄出傷害/治療數字。layer 為文字容器，textObj 為已建立的 Text。
export function floatText(layer, x, y, textObj) {
  textObj.x = x;
  textObj.y = y;
  textObj.anchor?.set?.(0.5);
  layer.addChild(textObj);
  const done = () => {
    gsap.killTweensOf(textObj);
    if (!textObj.destroyed) textObj.destroy();
  };
  gsap
    .timeline({ onComplete: done })
    .to(textObj, { y: y - 42, duration: 0.7, ease: 'power1.out' }, 0)
    .to(textObj, { alpha: 0, duration: 0.7, ease: 'power1.in' }, 0.25);
}

// 大招 cut-in 帶狀橫幅（劍與遠征/AFK Arena 療癒手遊風）：
// 全寬半透明深藍紫底帶（置中）+ 上下柔和元素色細邊線 + 左側元素色圓（職業符號 + 淡金描邊）；
// 角色名（小、dim）+ 技能名（大、元素色、粗體黑描邊）自左滑入（back.out 帶彈性）→停→右滑出。
// 整段 ~0.65s，對齊 DELAYS.ultimate = 0.7。所有物件 onComplete 銷毀 + 防重複；可被 killFx 掃到。
export function cutIn(layer, stageW, { name, skillName, color, glyph }) {
  const BAND_H = 90;

  const cont = new Container();
  cont.x = 0;
  cont.y = STAGE_H / 2; // 帶垂直置中
  cont.alpha = 0;
  layer.addChild(cont);

  // 半透明深藍紫底帶（圓潤細邊，兩端輕微圓角）+ 上下柔和元素色邊線。
  const band = new Graphics();
  const top = -BAND_H / 2;
  // 底帶要明顯比天幕深（天幕 ~0x1e2438 系），否則整條帶只剩上下邊線看得見。
  band.roundRect(0, top, stageW, BAND_H, 6).fill({ color: 0x0a0d1a, alpha: 0.88 });
  band.rect(0, top, stageW, 2).fill({ color, alpha: 0.55 });
  band.rect(0, top + BAND_H - 2, stageW, 2).fill({ color, alpha: 0.55 });
  cont.addChild(band);

  // 左側圓形頭像位（本階段 = 元素色圓 + 職業符號 + 淡金描邊；portrait 版待素材到位）。
  const circleX = 72;
  const circle = new Graphics();
  circle.circle(0, 0, 32).fill(color);
  circle.circle(0, 0, 32).stroke({ color: 0xf5e6b0, width: 2, alpha: 0.9 });
  circle.x = circleX;
  cont.addChild(circle);

  const gl = new Text({ text: glyph || '?', style: { fontSize: 30, fill: 0x11131a } });
  gl.anchor.set(0.5);
  gl.x = circleX;
  cont.addChild(gl);

  // 文字群（滑入 / 滑出的唯一移動對象；band 與圓維持不動）。
  const textGroup = new Container();
  const nameText = new Text({
    text: name,
    style: { fontSize: 14, fill: 0xaab3c8, fontWeight: '600' },
  });
  nameText.anchor.set(0, 0.5);
  nameText.y = -16;
  const skillText = new Text({
    text: skillName,
    style: { fontSize: 34, fill: color, fontWeight: '800', stroke: { color: 0x0c0e14, width: 5 } },
  });
  skillText.anchor.set(0, 0.5);
  skillText.y = 12;
  textGroup.addChild(nameText);
  textGroup.addChild(skillText);
  cont.addChild(textGroup);

  const restX = circleX + 46;
  textGroup.x = restX - 60; // 自左偏移入場
  textGroup.alpha = 0;

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    gsap.killTweensOf(cont);
    gsap.killTweensOf(textGroup);
    if (!cont.destroyed) cont.destroy({ children: true });
  };

  // 進場(帶淡入 + 文字彈性滑入) → 停 → 右滑出淡出。總長 ~0.66s。
  gsap
    .timeline({ onComplete: finish })
    .to(cont, { alpha: 1, duration: 0.15, ease: 'power1.out' }, 0)
    .to(textGroup, { x: restX, alpha: 1, duration: 0.28, ease: 'back.out(1.7)' }, 0.02)
    .to(textGroup, { x: restX + 80, alpha: 0, duration: 0.18, ease: 'power2.in' }, 0.48)
    .to(cont, { alpha: 0, duration: 0.16, ease: 'power1.in' }, 0.5);
}

// 震屏：記 home 座標，快速抖 4~5 下後回原位。作用於整體容器（root）。
export function screenShake(container, strength = 6) {
  const homeX = container._homeX ?? container.x;
  const homeY = container._homeY ?? container.y;
  container._homeX = homeX;
  container._homeY = homeY;
  gsap.killTweensOf(container);
  const shakes = 4 + Math.floor(Math.random() * 2); // 4~5 下
  const tl = gsap.timeline({
    onComplete: () => {
      container.x = homeX;
      container.y = homeY;
    },
  });
  for (let i = 0; i < shakes; i += 1) {
    const dx = (Math.random() * 2 - 1) * strength;
    const dy = (Math.random() * 2 - 1) * strength;
    tl.to(container, { x: homeX + dx, y: homeY + dy, duration: 0.04 });
  }
  tl.to(container, { x: homeX, y: homeY, duration: 0.04 });
}

// 強制停止並清掉某容器下所有子物件（含孫層）的進行中 tween（場景拆除前呼叫）。
// 遞迴，確保像 cutIn 這種「容器內還有子群組在動 x/alpha」的特效也被掃到。
export function killFx(container) {
  for (const child of container.children) {
    gsap.killTweensOf(child);
    if (child.scale) gsap.killTweensOf(child.scale);
    if (child.children && child.children.length) killFx(child);
  }
}

// 死亡淡出。目標縮放相對景深基準 _baseScale。
export function deathFade(sprite) {
  const base = sprite._baseScale ?? 1;
  gsap.to(sprite, { alpha: 0.25, duration: 0.4 });
  gsap.to(sprite.scale, { x: base * 0.85, y: base * 0.85, duration: 0.4 });
}

// 復活/重置時還原視覺，還原到景深基準 _baseScale。
export function resetVisual(sprite) {
  const base = sprite._baseScale ?? 1;
  gsap.killTweensOf(sprite);
  gsap.killTweensOf(sprite.scale);
  sprite.alpha = 1;
  sprite.scale.set(base);
}
