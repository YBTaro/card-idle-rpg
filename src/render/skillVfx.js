// 技能特效派生：從 SKILLS 資料自動選特效（資料驅動，新技能自動有對應演出）。
//   施放端（casterVfx）：範圍傷害=能量橫掃束、治療=上升光、護盾/嘲諷=護罩、純增益=環繞光旋
//   目標端（targetVfx）：單體傷害=大斬擊、範圍=小斬擊、灼燒=落火、暈眩=暗爆、治療=上升光
// 全部 additive、自毀、可被 killFx 掃到；顏色吃施放者元素色，特殊型別有固定色。
import { gsap } from 'gsap';
import { Container, Graphics, Sprite } from 'pixi.js';
import { SKILLS } from '../battle/skills.js';

const HEAL_COLOR = 0x8ef2ae;
const SHIELD_COLOR = 0x9adcff;
const TAUNT_COLOR = 0xffd27a;
const EMBER_COLOR = 0xff9a5c;
const STUN_COLOR = 0xbb8cff;

const MULTI_TARGETS = new Set(['enemyFrontRow', 'enemyBackRow', 'enemyColumn', 'allEnemies']);

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
    gsap
      .timeline({ delay: i * 0.09, onComplete: i === n - 1 ? () => safeDestroy(cont) : undefined })
      .to(g, { alpha: 1, duration: 0.05 }, 0)
      .to(g.scale, { x: 1.15, y: 1.15, duration: 0.22, ease: 'power3.out' }, 0)
      .to(g, { rotation: g.rotation + 0.5, alpha: 0, duration: 0.24, ease: 'power1.in' }, 0.12);
  }
}

// 能量橫掃束：從施放者胸口射向敵方陣地的粗光束＋沿束飛散光屑（範圍傷害技）。
export function beamSweep(fxLayer, fromX, fromY, dir, color, dotTex) {
  const cont = new Container();
  cont.x = fromX;
  cont.y = fromY;
  fxLayer.addChild(cont);
  const LEN = 620;
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
  cont.rotation = dir > 0 ? 0 : Math.PI;
  const tl = gsap
    .timeline({ onComplete: () => safeDestroy(cont) })
    .to([core.scale, halo.scale, edge.scale], { x: 1, duration: 0.16, ease: 'power3.out' }, 0)
    .to([core, halo, edge], { alpha: 0, duration: 0.32, ease: 'power1.in' }, 0.3)
    .to(core, { y: -2, duration: 0.1, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 0);
  // 沿束飛散光屑
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

// 上升光：綠色光點自腳底上升 + 柔和光柱（治療）。
export function healRise(parent, dotTex, color = HEAL_COLOR) {
  const cont = new Container();
  parent.addChild(cont);
  const column = new Graphics();
  column.roundRect(-26, -150, 52, 150, 26).fill({ color, alpha: 0.16 });
  column.blendMode = 'add';
  column.alpha = 0;
  cont.addChild(column);
  gsap
    .timeline({ onComplete: () => safeDestroy(cont) })
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
      gsap.to(p, {
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
  gsap
    .timeline({ onComplete: () => safeDestroy(g) })
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
  gsap.to(state, {
    t: 1,
    duration: 0.9,
    ease: 'power1.out',
    onUpdate: () => {
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
    gsap.to(p, {
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

/* ---------------- 派生器 ---------------- */

// 施放端特效（絕技事件時呼叫）。
export function casterVfx({ fxLayer, dotTex }, sprite, skillId, color) {
  const def = SKILLS[skillId];
  if (!def) return;
  const types = new Set(def.effects.map((e) => e.type));
  const isMulti = MULTI_TARGETS.has(def.target);

  if (types.has('damage') && isMulti) {
    const dir = sprite._info.team === 0 ? 1 : -1;
    beamSweep(fxLayer, sprite.x + dir * 30, sprite.y - 78, dir, color, dotTex);
  }
  if (types.has('heal')) healRise(sprite, dotTex);
  if (types.has('shield')) shieldDome(sprite);
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
