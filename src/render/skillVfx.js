// 技能特效派生：從 SKILLS 資料自動選特效（資料驅動，新技能自動有對應演出）。
//   施放端（casterVfx）：範圍傷害=能量橫掃束、治療=上升光、護盾/嘲諷=護罩、純增益=環繞光旋
//   目標端（targetVfx）：單體傷害=大斬擊、範圍=小斬擊、灼燒=落火、暈眩=暗爆、治療=上升光
// 全部 additive、自毀、可被 killFx 掃到；顏色吃施放者元素色，特殊型別有固定色。
import { gsap } from 'gsap';
import { Container, Graphics, Sprite } from 'pixi.js';
import { SKILLS } from '../battle/skills.js';
import { fxTl, fxTo } from './fx.js';

const HEAL_COLOR = 0x8ef2ae;
const SHIELD_COLOR = 0x9adcff;
const TAUNT_COLOR = 0xffd27a;
const EMBER_COLOR = 0xff9a5c;
const STUN_COLOR = 0xbb8cff;
const THORNS_COLOR = 0x9dde6a;
const COUNTER_COLOR = 0xffb066;
const EXEC_COLOR = 0xff4d4d;
const DRAIN_COLOR = 0xe0567a;

const MULTI_TARGETS = new Set(['enemyFrontRow', 'enemyBackRow', 'enemyColumn', 'allEnemies']);

// ---- 絕技演出節奏：依技能資料派生（不同技能不同演出時間）----
//   castDelay：施放 → 第一次命中的間隔（director 的 ultimate 延遲）
//   impactTail：每次命中後的餘韻（聚光燈收燈計時）
//   hold：聚光燈保底窗長。純輔助技沒有 damage/heal 事件可刷新餘韻，
//         hold 必須「貼著演出長度」收燈，否則特效播完還在黑畫面乾等。
export function ultTiming(skillId) {
  const def = SKILLS[skillId];
  if (!def) return { castDelay: 0.7, impactTail: 0.5, hold: 1.3 };
  const types = new Set(def.effects.map((e) => e.type));
  const isMulti = MULTI_TARGETS.has(def.target);
  const single = def.target === 'singleEnemyByColumn';
  const hasHits = types.has('damage') || types.has('heal'); // 會產生可刷新餘韻的事件

  // 純輔助（護盾/嘲諷/增益）：演出＝護罩穹頂/光旋 ~1s，燈跟著收，不留黑等
  if (!hasHits) {
    return { castDelay: 0.45, impactTail: 0.35, hold: 1.05 };
  }

  let castDelay;
  if (types.has('damage')) {
    castDelay = isMulti ? 0.9 : 0.55; // 大範圍要留施展時間；單體快狠準
  } else {
    castDelay = 0.72; // 治療
  }
  if (def.effects.some((e) => e.type === 'control' || e.type === 'dot')) castDelay += 0.12;

  const impactTail = single ? 0.6 : 0.38; // 單體一擊的餘韻重；多段命中每下短促
  return { castDelay, impactTail, hold: castDelay + 0.6 };
}

function safeDestroy(cont) {
  for (const c of cont.children) {
    gsap.killTweensOf(c);
    if (c.scale) gsap.killTweensOf(c.scale);
  }
  gsap.killTweensOf(cont);
  if (cont.scale) gsap.killTweensOf(cont.scale);
  if (!cont.destroyed) cont.destroy({ children: true });
}

/* ---------------- 基元 ---------------- */

// 斬擊弧：1~2 道弦月弧線快速掃過（單體傷害大、大範圍小）。掛單位容器（跟著抬亮）。
export function slashArc(parent, color, { big = false } = {}) {
  const cont = new Container();
  cont.y = -70;
  parent.addChild(cont);
  const n = big ? 2 : 1;
  for (let i = 0; i < n; i += 1) {
    const g = new Graphics();
    const r = big ? 56 : 38;
    g.arc(0, 0, r, -0.8, 0.9).stroke({ width: big ? 9 : 6, color, alpha: 0.95 });
    g.arc(0, 0, r * 0.8, -0.7, 0.8).stroke({ width: 3, color: 0xfff2c8, alpha: 0.8 });
    g.blendMode = 'add';
    g.rotation = (Math.random() * 0.8 - 0.4) + (i === 1 ? Math.PI * 0.9 : 0);
    g.scale.set(0.4);
    g.alpha = 0;
    cont.addChild(g);
    fxTl({ delay: i * 0.09, onComplete: i === n - 1 ? () => safeDestroy(cont) : undefined })
      .to(g, { alpha: 1, duration: 0.05 }, 0)
      .to(g.scale, { x: 1.15, y: 1.15, duration: 0.22, ease: 'power3.out' }, 0)
      .to(g, { rotation: g.rotation + 0.5, alpha: 0, duration: 0.24, ease: 'power1.in' }, 0.12);
  }
}

// 能量束：從施放者胸口「瞄準目標」射出（打直排用——沿該直排的縱深線）。
export function beamLane(fxLayer, x0, y0, x1, y1, color, dotTex) {
  const cont = new Container();
  cont.x = x0;
  cont.y = y0;
  fxLayer.addChild(cont);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const LEN = Math.hypot(dx, dy) + 130;
  cont.rotation = Math.atan2(dy, dx);

  const core = new Graphics();
  core.roundRect(0, -10, LEN, 20, 10).fill({ color: 0xfff2c8, alpha: 0.9 });
  const halo = new Graphics();
  halo.roundRect(0, -24, LEN, 48, 24).fill({ color, alpha: 0.45 });
  const edge = new Graphics();
  edge.roundRect(0, -14, LEN, 3, 1.5).fill({ color, alpha: 0.9 });
  edge.roundRect(0, 11, LEN, 3, 1.5).fill({ color, alpha: 0.9 });
  for (const g of [halo, core, edge]) {
    g.blendMode = 'add';
    g.scale.set(0, 1);
    cont.addChild(g);
  }
  const tl = fxTl({ onComplete: () => safeDestroy(cont) })
    .to([core.scale, halo.scale, edge.scale], { x: 1, duration: 0.16, ease: 'power3.out' }, 0)
    .to([core, halo, edge], { alpha: 0, duration: 0.32, ease: 'power1.in' }, 0.3)
    .to(core, { y: -2, duration: 0.1, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 0);
  if (dotTex) {
    for (let i = 0; i < 10; i += 1) {
      const p = new Sprite(dotTex);
      p.anchor.set(0.5);
      p.blendMode = 'add';
      p.tint = i % 2 ? color : 0xfff2c8;
      p.scale.set(0.25 + Math.random() * 0.3);
      p.x = 60 + Math.random() * (LEN - 120);
      p.y = Math.random() * 24 - 12;
      cont.addChild(p);
      tl.to(
        p,
        {
          y: p.y + (Math.random() * 50 - 25),
          x: p.x + 40 + Math.random() * 60,
          alpha: 0,
          duration: 0.4 + Math.random() * 0.25,
          ease: 'power1.out',
        },
        0.05 + Math.random() * 0.12
      );
    }
  }
}

// 火牆：目標縱列升起燃燒之牆（打前排用）——牆體漸層 + 餘燼上竄。
export function flameWall(fxLayer, x, midY, span, color, dotTex) {
  const cont = new Container();
  cont.x = x;
  cont.y = midY;
  fxLayer.addChild(cont);
  const H = span;
  const W = 74;
  const wall = new Graphics();
  wall.roundRect(-W / 2, -H / 2, W, H, W / 2).fill({ color, alpha: 0.28 });
  wall.roundRect(-W * 0.28, -H / 2 + 10, W * 0.56, H - 20, W * 0.28).fill({ color: 0xfff2c8, alpha: 0.22 });
  wall.blendMode = 'add';
  wall.scale.set(1, 0.1);
  cont.addChild(wall);
  const tl = fxTl({ onComplete: () => safeDestroy(cont) })
    .to(wall.scale, { y: 1, duration: 0.22, ease: 'power3.out' }, 0)
    .to(wall, { alpha: 0, duration: 0.35, ease: 'power1.in' }, 0.45);
  if (dotTex) {
    for (let i = 0; i < 10; i += 1) {
      const p = new Sprite(dotTex);
      p.anchor.set(0.5);
      p.blendMode = 'add';
      p.tint = i % 2 ? color : 0xffd27a;
      p.scale.set(0.25 + Math.random() * 0.3);
      p.x = Math.random() * W - W / 2;
      p.y = H / 2 - Math.random() * H;
      cont.addChild(p);
      tl.to(
        p,
        { y: p.y - 60 - Math.random() * 60, alpha: 0, duration: 0.4 + Math.random() * 0.3, ease: 'power1.out' },
        0.06 + Math.random() * 0.15
      );
    }
  }
}

// 彈幕飛射：拋物線越過前排、砸向後排區域（打後排用）。N 發散射 + 拖尾光點。
export function volley(fxLayer, x0, y0, x1, y1, color, dotTex) {
  if (!dotTex) return;
  const cont = new Container();
  fxLayer.addChild(cont);
  const N = 4;
  let alive = N;
  for (let i = 0; i < N; i += 1) {
    const head = new Sprite(dotTex);
    head.anchor.set(0.5);
    head.blendMode = 'add';
    head.tint = 0xfff2c8;
    head.scale.set(0.7);
    cont.addChild(head);
    const trail = new Sprite(dotTex);
    trail.anchor.set(0.5);
    trail.blendMode = 'add';
    trail.tint = color;
    trail.scale.set(1.1);
    trail.alpha = 0.45;
    cont.addChild(trail);

    const tx = x1 + (Math.random() * 90 - 45);
    const ty = y1 + (Math.random() * 70 - 35);
    const apexY = Math.min(y0, ty) - 130 - Math.random() * 60; // 拋物線頂點（高過前排）
    const st = { t: 0 };
    let tw = null;
    tw = fxTo(st, {
      t: 1,
      duration: 0.38 + Math.random() * 0.1,
      delay: i * 0.07,
      ease: 'power1.in',
      onUpdate: () => {
        if (cont.destroyed) {
          tw?.kill();
          return;
        }
        const t = st.t;
        // 二次貝茲：起點 →（中點上方 apex）→ 落點
        const mx = (x0 + tx) / 2;
        const ix = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * tx;
        const iy = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * apexY + t * t * ty;
        trail.x = head.x;
        trail.y = head.y;
        head.x = ix;
        head.y = iy;
      },
      onComplete: () => {
        alive -= 1;
        if (alive === 0) safeDestroy(cont);
      },
    });
  }
}

// 上升光：綠色光點自腳底上升 + 柔和光柱（治療）。
export function healRise(parent, dotTex, color = HEAL_COLOR) {
  const cont = new Container();
  parent.addChild(cont);
  const column = new Graphics();
  column.roundRect(-26, -150, 52, 150, 26).fill({ color, alpha: 0.16 });
  column.blendMode = 'add';
  column.alpha = 0;
  cont.addChild(column);
  fxTl({ onComplete: () => safeDestroy(cont) })
    .to(column, { alpha: 1, duration: 0.18 }, 0)
    .to(column, { alpha: 0, duration: 0.4 }, 0.5);
  if (dotTex) {
    for (let i = 0; i < 7; i += 1) {
      const p = new Sprite(dotTex);
      p.anchor.set(0.5);
      p.blendMode = 'add';
      p.tint = color;
      p.scale.set(0.25 + Math.random() * 0.3);
      p.x = Math.random() * 44 - 22;
      p.y = -6;
      cont.addChild(p);
      fxTo(p, {
        y: -110 - Math.random() * 40,
        alpha: 0,
        duration: 0.55 + Math.random() * 0.3,
        delay: Math.random() * 0.2,
        ease: 'power1.out',
      });
    }
  }
}

// 護罩：半透明穹頂彈出（護盾/嘲諷/減傷）。
export function shieldDome(parent, color = SHIELD_COLOR) {
  const g = new Graphics();
  g.ellipse(0, -62, 58, 78).fill({ color, alpha: 0.14 });
  g.ellipse(0, -62, 58, 78).stroke({ width: 3, color, alpha: 0.8 });
  g.blendMode = 'add';
  g.scale.set(0.3);
  g.alpha = 0;
  parent.addChild(g);
  fxTl({ onComplete: () => safeDestroy(g) })
    .to(g, { alpha: 1, duration: 0.12 }, 0)
    .to(g.scale, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2)' }, 0)
    .to(g, { alpha: 0, duration: 0.35, ease: 'power1.in' }, 0.65);
}

// 環繞光旋：光點繞單位盤旋上升（純增益/集氣）。
export function swirl(parent, dotTex, color) {
  if (!dotTex) return;
  const cont = new Container();
  parent.addChild(cont);
  const N = 8;
  const state = { t: 0 };
  const dots = [];
  for (let i = 0; i < N; i += 1) {
    const p = new Sprite(dotTex);
    p.anchor.set(0.5);
    p.blendMode = 'add';
    p.tint = color;
    p.scale.set(0.3);
    cont.addChild(p);
    dots.push(p);
  }
  // 注意：補間目標是 state 物件（不在顯示樹上），場景拆除的 killFx 掃不到它——
  // onUpdate 需自我防衛：容器已銷毀就自殺，否則會對 null position 寫入。
  let tw = null;
  tw = fxTo(state, {
    t: 1,
    duration: 0.9,
    ease: 'power1.out',
    onUpdate: () => {
      if (cont.destroyed) {
        tw?.kill();
        return;
      }
      dots.forEach((p, i) => {
        const a = state.t * Math.PI * 3 + (i / N) * Math.PI * 2;
        p.x = Math.cos(a) * 40;
        p.y = -state.t * 130 + Math.sin(a) * 12;
        p.alpha = 1 - state.t * 0.9;
      });
    },
    onComplete: () => safeDestroy(cont),
  });
}

// 落火：灼燒 DoT——火點自上方落下（附著在目標容器）。
export function emberFall(parent, dotTex, color = EMBER_COLOR) {
  if (!dotTex) return;
  const cont = new Container();
  parent.addChild(cont);
  let left = 6;
  for (let i = 0; i < 6; i += 1) {
    const p = new Sprite(dotTex);
    p.anchor.set(0.5);
    p.blendMode = 'add';
    p.tint = color;
    p.scale.set(0.3 + Math.random() * 0.25);
    p.x = Math.random() * 56 - 28;
    p.y = -150 - Math.random() * 30;
    cont.addChild(p);
    fxTo(p, {
      y: -8,
      alpha: 0,
      duration: 0.4 + Math.random() * 0.25,
      delay: Math.random() * 0.25,
      ease: 'power2.in',
      onComplete: () => {
        left -= 1;
        if (left === 0) safeDestroy(cont);
      },
    });
  }
}

// 荊棘爆刺：受擊反傷——綠刺自單位周圍向外彈射。
export function thornsBurst(parent, color = THORNS_COLOR) {
  const cont = new Container();
  cont.y = -60;
  parent.addChild(cont);
  const N = 6;
  for (let i = 0; i < N; i += 1) {
    const g = new Graphics();
    g.moveTo(0, -6).lineTo(30, 0).lineTo(0, 6).closePath().fill({ color, alpha: 0.95 });
    g.moveTo(4, -2.5).lineTo(22, 0).lineTo(4, 2.5).closePath().fill({ color: 0xeaffd0, alpha: 0.9 });
    g.blendMode = 'add';
    const a = (i / N) * Math.PI * 2 + Math.random() * 0.5;
    g.rotation = a;
    g.x = Math.cos(a) * 16;
    g.y = Math.sin(a) * 12;
    g.alpha = 0;
    cont.addChild(g);
    fxTl({ onComplete: i === N - 1 ? () => safeDestroy(cont) : undefined })
      .to(g, { alpha: 1, duration: 0.05 }, 0)
      .to(g, { x: Math.cos(a) * 52, y: Math.sin(a) * 40, duration: 0.22, ease: 'power3.out' }, 0)
      .to(g, { alpha: 0, duration: 0.16, ease: 'power1.in' }, 0.18);
  }
}

// 處決斬：血紅大 X 交叉斬 + 暗紅震圈——低血補刀的重拍。
export function executeSlash(parent) {
  const cont = new Container();
  cont.y = -70;
  parent.addChild(cont);
  const ring = new Graphics();
  ring.circle(0, 0, 46).stroke({ width: 5, color: EXEC_COLOR, alpha: 0.8 });
  ring.blendMode = 'add';
  ring.scale.set(0.3);
  cont.addChild(ring);
  for (let i = 0; i < 2; i += 1) {
    const g = new Graphics();
    g.roundRect(-64, -6, 128, 12, 6).fill({ color: EXEC_COLOR, alpha: 0.95 });
    g.roundRect(-52, -2.5, 104, 5, 2.5).fill({ color: 0xffe3d0, alpha: 0.95 });
    g.blendMode = 'add';
    g.rotation = i === 0 ? -0.7 : 0.7;
    g.scale.set(0, 1);
    cont.addChild(g);
    fxTl({ delay: i * 0.08, onComplete: i === 1 ? () => safeDestroy(cont) : undefined })
      .to(g.scale, { x: 1.15, duration: 0.14, ease: 'power4.out' }, 0)
      .to(g, { alpha: 0, duration: 0.22, ease: 'power1.in' }, 0.16);
  }
  fxTl()
    .to(ring.scale, { x: 1.3, y: 1.3, duration: 0.3, ease: 'power2.out' }, 0.06)
    .to(ring, { alpha: 0, duration: 0.22 }, 0.18);
}

// 貫穿閃：真實傷害——金白細針穿透體，無視防禦的「穿甲感」。
export function pierceFlash(parent) {
  const cont = new Container();
  cont.y = -66;
  parent.addChild(cont);
  for (let i = 0; i < 3; i += 1) {
    const g = new Graphics();
    g.moveTo(-70, 0).lineTo(56, -3).lineTo(70, 0).lineTo(56, 3).closePath().fill({ color: 0xfff2c8, alpha: 0.95 });
    g.blendMode = 'add';
    g.rotation = -0.2 + i * 0.2;
    g.y = (i - 1) * 14;
    g.scale.set(0, 1);
    g.pivot.x = -70;
    g.x = -70;
    cont.addChild(g);
    fxTl({ delay: i * 0.05, onComplete: i === 2 ? () => safeDestroy(cont) : undefined })
      .to(g.scale, { x: 1, duration: 0.1, ease: 'power4.out' }, 0)
      .to(g, { alpha: 0, x: -40, duration: 0.2, ease: 'power1.in' }, 0.1);
  }
}

// 汲取光點：吸血——血色光點自外圈收束進體內（swirl 的反向）。
export function drainMotes(parent, dotTex, color = DRAIN_COLOR) {
  if (!dotTex) return;
  const cont = new Container();
  cont.y = -64;
  parent.addChild(cont);
  const N = 8;
  const state = { t: 0 };
  const dots = [];
  for (let i = 0; i < N; i += 1) {
    const p = new Sprite(dotTex);
    p.anchor.set(0.5);
    p.blendMode = 'add';
    p.tint = i % 2 ? color : 0xffb8c8;
    p.scale.set(0.35);
    cont.addChild(p);
    dots.push(p);
  }
  let tw = null;
  tw = fxTo(state, {
    t: 1,
    duration: 0.55,
    ease: 'power2.in',
    onUpdate: () => {
      if (cont.destroyed) { tw?.kill(); return; }
      dots.forEach((p, i) => {
        const a = (i / N) * Math.PI * 2 + state.t * 1.6;
        const r = 78 * (1 - state.t);
        p.x = Math.cos(a) * r;
        p.y = Math.sin(a) * r * 0.6;
        p.alpha = 0.3 + state.t * 0.7;
      });
    },
    onComplete: () => safeDestroy(cont),
  });
}

// 淨化/驅散：白環擴散 + 紫白光屑飛散——把狀態「洗掉」的一瞬。
export function purifyBurst(parent, dotTex, { hostile = false } = {}) {
  const color = hostile ? 0xc9a7ff : 0xf4fbff; // 驅散敵增益＝紫、淨化隊友＝白
  const cont = new Container();
  cont.y = -62;
  parent.addChild(cont);
  const ring = new Graphics();
  ring.circle(0, 0, 40).stroke({ width: 4, color, alpha: 0.9 });
  ring.circle(0, 0, 28).stroke({ width: 2, color: 0xffffff, alpha: 0.7 });
  ring.blendMode = 'add';
  ring.scale.set(0.2);
  cont.addChild(ring);
  fxTl({ onComplete: () => safeDestroy(cont) })
    .to(ring.scale, { x: 1.5, y: 1.2, duration: 0.32, ease: 'power2.out' }, 0)
    .to(ring, { alpha: 0, duration: 0.24, ease: 'power1.in' }, 0.16);
  if (dotTex) {
    for (let i = 0; i < 6; i += 1) {
      const p = new Sprite(dotTex);
      p.anchor.set(0.5);
      p.blendMode = 'add';
      p.tint = color;
      p.scale.set(0.3);
      p.x = Math.random() * 40 - 20;
      p.y = Math.random() * 20 - 10;
      cont.addChild(p);
      fxTo(p, {
        x: p.x * 3.2,
        y: p.y * 2 - 46,
        alpha: 0,
        duration: 0.4 + Math.random() * 0.2,
        ease: 'power1.out',
      });
    }
  }
}

/* ---------------- 派生器 ---------------- */

// 施放端特效（絕技事件時呼叫）。依「目標樣式」選招式，並瞄準實際目標：
//   直排＝能量束沿縱深線、前排＝目標縱列火牆、後排＝拋物線彈幕越過前排、單體＝突進斬（目標端）。
// ctx.rowMidY / rowSpan：敵方縱列的視覺中心與跨距（scene 依站位常數提供）。
export function casterVfx({ fxLayer, dotTex, rowMidY = 340, rowSpan = 240 }, sprite, skillId, color, target = null) {
  const def = SKILLS[skillId];
  if (!def) return;
  const types = new Set(def.effects.map((e) => e.type));

  if (types.has('damage') && MULTI_TARGETS.has(def.target)) {
    const dir = sprite._info.team === 0 ? 1 : -1;
    const fromX = sprite.x + dir * 30;
    const fromY = sprite.y - 78;
    const tx = target?.x ?? sprite.x + dir * 430;
    const ty = target ? target.y - 60 : fromY;
    if (def.target === 'enemyBackRow') {
      volley(fxLayer, fromX, fromY, tx, rowMidY, color, dotTex);
    } else if (def.target === 'enemyFrontRow') {
      flameWall(fxLayer, tx, rowMidY, rowSpan, color, dotTex);
    } else {
      beamLane(fxLayer, fromX, fromY, tx + dir * 140, ty, color, dotTex); // 直排 / 全體
    }
  }
  if (types.has('heal')) healRise(sprite, dotTex);
  if (types.has('hot')) swirl(sprite, dotTex, HEAL_COLOR); // 持續回復：綠色光旋（再生感）
  if (types.has('shield')) shieldDome(sprite);
  if (types.has('thorns')) shieldDome(sprite, THORNS_COLOR); // 荊棘姿態：綠棘護罩
  if (types.has('counter')) slashArc(sprite, COUNTER_COLOR, { big: true }); // 反擊姿態：亮橙備斬
  if (def.effects.some((e) => e.control === 'taunt')) shieldDome(sprite, TAUNT_COLOR);
  if (types.has('buff') && !types.has('damage')) swirl(sprite, dotTex, color);
}

// 目標端特效（聚光窗內的 damage/heal 事件呼叫）。
export function targetVfx({ dotTex }, sprite, skillId, color, { heal = false } = {}) {
  if (heal) {
    healRise(sprite, dotTex);
    return;
  }
  const def = SKILLS[skillId];
  if (!def) return;
  const single = def.target === 'singleEnemyByColumn';
  if (def.effects.some((e) => e.type === 'damage')) slashArc(sprite, color, { big: single });
  if (def.effects.some((e) => e.type === 'dot')) emberFall(sprite, dotTex);
  if (def.effects.some((e) => e.control === 'stun')) shieldDome(sprite, STUN_COLOR);
}
