// GSAP 動畫特效，作用在 Pixi 顯示物件上。與遊戲邏輯無關，純呈現。
// 編排原則（療癒手遊風）：預備→爆發→回彈的三段節奏、back/elastic 彈性 ease、
// 打擊瞬間用 additive 粒子與短促位移擠出「打擊感」。
import { gsap } from 'gsap';
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { STAGE_H } from './pixiApp.js';

// 攻擊突刺：後搖預備 → 衝刺 + 前傾 → 彈回。dir = +1（向右）/ -1（向左）
export function lunge(sprite, dir) {
  const baseX = sprite._homeX ?? sprite.x;
  sprite._homeX = baseX;
  gsap.killTweensOf(sprite, 'x,rotation');
  gsap
    .timeline()
    .to(sprite, { x: baseX - dir * 10, rotation: -dir * 0.05, duration: 0.08, ease: 'power1.in' })
    .to(sprite, { x: baseX + dir * 46, rotation: dir * 0.09, duration: 0.11, ease: 'power3.out' })
    .to(sprite, { x: baseX, rotation: 0, duration: 0.26, ease: 'power2.inOut' });
}

// 受擊：閃白紅 + 朝攻擊反方向擊退再彈回。body 為角色主體（Graphics 或卡圖 Sprite）。
export function hitFlash(sprite, body, dir = 0) {
  gsap.killTweensOf(body, 'tint');
  gsap
    .timeline()
    .set(body, { tint: 0xff5555 })
    .to(body, { tint: 0xffffff, duration: 0.28, ease: 'power1.out' });

  const baseX = sprite._homeX ?? sprite.x;
  const baseY = sprite._homeY ?? sprite.y;
  sprite._homeX = baseX;
  sprite._homeY = baseY;
  gsap.killTweensOf(sprite, 'x,y');
  if (dir) {
    gsap
      .timeline()
      .to(sprite, { x: baseX + dir * 12, duration: 0.06, ease: 'power2.out' })
      .to(sprite, { x: baseX, duration: 0.42, ease: 'elastic.out(1, 0.45)' });
  } else {
    gsap
      .timeline()
      .to(sprite, { y: baseY - 4, duration: 0.05 })
      .to(sprite, { y: baseY, duration: 0.2, ease: 'elastic.out(1, 0.4)' });
  }
}

// 大招放大脈衝 + 發光。脈衝相對於景深基準 _baseScale 計算，避免壓掉 2.5D 縮放。
export function ultPulse(sprite, body, color) {
  const base = sprite._baseScale ?? 1;
  gsap.killTweensOf(sprite.scale);
  gsap
    .timeline()
    .to(sprite.scale, { x: base * 1.28, y: base * 1.28, duration: 0.16, ease: 'back.out(2)' })
    .to(sprite.scale, { x: base, y: base, duration: 0.4, ease: 'power2.out' });
  if (body && color != null) {
    gsap
      .timeline()
      .set(body, { tint: color })
      .to(body, { tint: 0xffffff, duration: 0.5 });
  }
}

// 命中火花：一圈 additive 小光點向外炸開。dotTexture 由場景以 renderer 生成（柔邊白點）。
export function spark(layer, x, y, color, dotTexture, count = 9) {
  if (!dotTexture) return;
  const cont = new Container();
  cont.x = x;
  cont.y = y;
  layer.addChild(cont);

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    for (const c of cont.children) gsap.killTweensOf(c);
    if (!cont.destroyed) cont.destroy({ children: true });
  };
  const tl = gsap.timeline({ onComplete: finish });

  for (let i = 0; i < count; i += 1) {
    const p = new Sprite(dotTexture);
    p.anchor.set(0.5);
    p.blendMode = 'add';
    p.tint = color;
    const s = 0.35 + Math.random() * 0.5;
    p.scale.set(s);
    cont.addChild(p);
    const ang = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 26;
    tl.to(
      p,
      {
        x: Math.cos(ang) * dist,
        y: Math.sin(ang) * dist,
        alpha: 0,
        duration: 0.28 + Math.random() * 0.18,
        ease: 'power2.out',
      },
      0
    );
    tl.to(p.scale, { x: s * 0.25, y: s * 0.25, duration: 0.36, ease: 'power1.in' }, 0);
  }
}

// 衝擊波環：additive 圓環由小放大並淡出（大招施放的地面波）。
export function shockwave(layer, x, y, color) {
  const ring = new Graphics();
  ring.circle(0, 0, 30).stroke({ width: 4, color, alpha: 0.9 });
  ring.blendMode = 'add';
  ring.x = x;
  ring.y = y;
  ring.scale.set(0.3);
  layer.addChild(ring);
  const finish = () => {
    gsap.killTweensOf(ring);
    gsap.killTweensOf(ring.scale);
    if (!ring.destroyed) ring.destroy();
  };
  gsap
    .timeline({ onComplete: finish })
    .to(ring.scale, { x: 2.6, y: 2.6, duration: 0.5, ease: 'power2.out' }, 0)
    .to(ring, { alpha: 0, duration: 0.5, ease: 'power1.in' }, 0.08);
}

// 飄出傷害/治療數字：彈出（back.out）→ 上飄淡出。
export function floatText(layer, x, y, textObj) {
  textObj.x = x;
  textObj.y = y;
  textObj.anchor?.set?.(0.5);
  textObj.scale.set(0.4);
  layer.addChild(textObj);
  const done = () => {
    gsap.killTweensOf(textObj);
    gsap.killTweensOf(textObj.scale);
    if (!textObj.destroyed) textObj.destroy();
  };
  gsap
    .timeline({ onComplete: done })
    .to(textObj.scale, { x: 1, y: 1, duration: 0.18, ease: 'back.out(2.2)' }, 0)
    .to(textObj, { y: y - 46, duration: 0.7, ease: 'power1.out' }, 0)
    .to(textObj, { alpha: 0, duration: 0.45, ease: 'power1.in' }, 0.32);
}

// 施法法陣：掛在施放者容器腳底的旋轉魔法陣（雙環 + 虛線環 + 底光），
// 聚光燈演出期間亮起 → 淡出自毀。additive 疊色，用元素色。
export function castCircle(parent, color, { radius = 46, duration = 1.25 } = {}) {
  const cont = new Container();
  cont.y = 0; // 腳底
  cont.scale.set(0.3, 0.3 * 0.38); // 透視壓扁
  cont.alpha = 0;
  parent.addChildAt(cont, 0); // 陰影之下層級無妨，同容器內在立繪後面即可

  const ring = new Graphics();
  ring.circle(0, 0, radius).stroke({ width: 4, color, alpha: 0.95 });
  ring.circle(0, 0, radius * 0.72).stroke({ width: 2, color: 0xfff2c8, alpha: 0.8 });
  ring.blendMode = 'add';
  cont.addChild(ring);

  // 虛線外環（旋轉層）
  const dashed = new Graphics();
  const SEGS = 12;
  for (let i = 0; i < SEGS; i += 1) {
    const a0 = (i / SEGS) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2) / SEGS / 2;
    dashed.arc(0, 0, radius * 1.22, a0, a1).stroke({ width: 3, color, alpha: 0.7 });
  }
  dashed.blendMode = 'add';
  cont.addChild(dashed);

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    gsap.killTweensOf(cont);
    gsap.killTweensOf(cont.scale);
    gsap.killTweensOf(dashed);
    if (!cont.destroyed) cont.destroy({ children: true });
  };
  gsap.to(dashed, { rotation: Math.PI * 1.5, duration, ease: 'none' });
  gsap
    .timeline({ onComplete: finish })
    .to(cont, { alpha: 1, duration: 0.16, ease: 'power1.out' }, 0)
    .to(cont.scale, { x: 1, y: 0.38, duration: 0.3, ease: 'back.out(1.6)' }, 0)
    .to(cont, { alpha: 0, duration: 0.3, ease: 'power1.in' }, duration - 0.3);
}

// 施放者背後光柱：additive 雙層光帶 + 微幅呼吸，聚光窗內常駐（由呼叫端銷毀）。
export function lightPillar(parent, color) {
  const cont = new Container();
  const halo = new Graphics();
  halo.roundRect(-42, -240, 84, 240, 42).fill({ color, alpha: 0.15 });
  halo.blendMode = 'add';
  const core = new Graphics();
  core.roundRect(-18, -240, 36, 240, 18).fill({ color: 0xfff2c8, alpha: 0.16 });
  core.blendMode = 'add';
  cont.addChild(halo);
  cont.addChild(core);
  cont.scale.set(1, 0);
  parent.addChildAt(cont, Math.min(1, parent.children.length)); // 影之上、立繪之後
  gsap.to(cont.scale, { y: 1, duration: 0.28, ease: 'power3.out' });
  gsap.to(cont, { alpha: 0.75, duration: 0.5, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  return cont;
}

// 目標爆光：大型地面光圈爆發（雙環擴散 + 中心閃光 + 上竄火花）。
// 掛 fxLayer（永遠在壓暗層之上），x/y 為目標腳底。
export function impactBurst(layer, x, y, color, dotTexture) {
  const cont = new Container();
  cont.x = x;
  cont.y = y;
  layer.addChild(cont);

  const mk = (r, w, a) => {
    const g = new Graphics();
    g.ellipse(0, 0, r, r * 0.38).stroke({ width: w, color, alpha: a });
    g.blendMode = 'add';
    g.scale.set(0.25);
    cont.addChild(g);
    return g;
  };
  const ringA = mk(52, 5, 0.95);
  const ringB = mk(34, 3, 0.8);

  let flash = null;
  if (dotTexture) {
    flash = new Sprite(dotTexture);
    flash.anchor.set(0.5);
    flash.y = -14;
    flash.tint = 0xfff2c8;
    flash.alpha = 0.9;
    flash.blendMode = 'add';
    flash.scale.set(1.2);
    cont.addChild(flash);
  }

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    for (const c of cont.children) {
      gsap.killTweensOf(c);
      if (c.scale) gsap.killTweensOf(c.scale);
    }
    if (!cont.destroyed) cont.destroy({ children: true });
  };
  const tl = gsap.timeline({ onComplete: finish });
  tl.to(ringA.scale, { x: 1.6, y: 1.6, duration: 0.5, ease: 'power2.out' }, 0)
    .to(ringA, { alpha: 0, duration: 0.5, ease: 'power1.in' }, 0.1)
    .to(ringB.scale, { x: 1.1, y: 1.1, duration: 0.42, ease: 'power2.out' }, 0.06)
    .to(ringB, { alpha: 0, duration: 0.4, ease: 'power1.in' }, 0.16);
  if (flash) {
    tl.to(flash.scale, { x: 4.2, y: 4.2, duration: 0.3, ease: 'power2.out' }, 0)
      .to(flash, { alpha: 0, duration: 0.34, ease: 'power1.in' }, 0.08);
    // 上竄火花：命中點向上噴散
    for (let i = 0; i < 6; i += 1) {
      const s = new Sprite(dotTexture);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.tint = color;
      s.scale.set(0.3 + Math.random() * 0.3);
      s.y = -10;
      cont.addChild(s);
      tl.to(
        s,
        {
          x: Math.random() * 90 - 45,
          y: -60 - Math.random() * 70,
          alpha: 0,
          duration: 0.45 + Math.random() * 0.2,
          ease: 'power2.out',
        },
        0.02
      );
    }
  }
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

// 死亡：灰階（greyFilter 由場景共用一顆 ColorMatrixFilter 傳入）+ 傾倒下沉淡出。
export function deathFade(sprite, greyFilter) {
  const base = sprite._baseScale ?? 1;
  if (greyFilter) sprite.filters = [greyFilter];
  gsap.to(sprite, {
    alpha: 0.28,
    rotation: 0.14,
    y: (sprite._homeY ?? sprite.y) + 8,
    duration: 0.5,
    ease: 'power2.in',
  });
  gsap.to(sprite.scale, { x: base * 0.85, y: base * 0.85, duration: 0.5 });
}

// 復活/重置時還原視覺，還原到景深基準 _baseScale。
export function resetVisual(sprite) {
  const base = sprite._baseScale ?? 1;
  gsap.killTweensOf(sprite);
  gsap.killTweensOf(sprite.scale);
  sprite.alpha = 1;
  sprite.rotation = 0;
  sprite.filters = null;
  sprite.scale.set(base);
}
