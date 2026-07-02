// GSAP 動畫特效，作用在 Pixi 顯示物件上。與遊戲邏輯無關，純呈現。
import { gsap } from 'gsap';

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

// 大招放大脈衝 + 發光。
export function ultPulse(sprite, body, color) {
  gsap.killTweensOf(sprite.scale);
  gsap
    .timeline()
    .to(sprite.scale, { x: 1.3, y: 1.3, duration: 0.16, ease: 'back.out(2)' })
    .to(sprite.scale, { x: 1, y: 1, duration: 0.4, ease: 'power2.out' });
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

// 大招技能名橫幅：置中（呼叫端先設 x/y），放大進場→停留→淡出後銷毀。
export function banner(layer, textObj) {
  textObj.anchor?.set?.(0.5);
  textObj.scale.set(0.6);
  layer.addChild(textObj);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    gsap.killTweensOf(textObj);
    gsap.killTweensOf(textObj.scale);
    if (!textObj.destroyed) textObj.destroy();
  };
  gsap
    .timeline({ onComplete: finish })
    .to(textObj.scale, { x: 1, y: 1, duration: 0.25, ease: 'back.out(2)' }, 0)
    .to(textObj, { alpha: 0, duration: 0.3, ease: 'power1.in' }, 0.25 + 0.6);
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

// 強制停止並清掉某容器下所有子物件的進行中 tween（場景拆除前呼叫）。
export function killFx(container) {
  for (const child of container.children) gsap.killTweensOf(child);
}

// 死亡淡出。
export function deathFade(sprite) {
  gsap.to(sprite, { alpha: 0.25, duration: 0.4 });
  gsap.to(sprite.scale, { x: 0.85, y: 0.85, duration: 0.4 });
}

// 復活/重置時還原視覺。
export function resetVisual(sprite) {
  gsap.killTweensOf(sprite);
  gsap.killTweensOf(sprite.scale);
  sprite.alpha = 1;
  sprite.scale.set(1);
}
