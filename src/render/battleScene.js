// 戰鬥場景：6 固定位置(前3後3)，訂閱 engine 事件播放 GSAP 特效，
// 每幀依 Unit 狀態刷新 HP / 能量條。與引擎以事件解耦。
import { Container, Graphics, Text } from 'pixi.js';
import { STAGE_W, STAGE_H } from './pixiApp.js';
import { ENERGY_MAX } from '../battle/unit.js';
import { lunge, hitFlash, ultPulse, floatText, deathFade, resetVisual, killFx } from './fx.js';

const ELEMENT_COLOR = {
  fire: 0xff6b4a,
  wind: 0x74e08c,
  water: 0x5aa9ff,
  light: 0xffe27a,
  dark: 0xb07bff,
};
const CLASS_GLYPH = { tank: '🛡', dps: '⚔', support: '✚' };

const R = 30; // 角色圓半徑
const BAR_W = 70;

export class BattleScene {
  constructor(app, engine) {
    this.app = app;
    this.engine = engine;
    this.root = new Container();
    this.fxLayer = new Container();
    this.sprites = new Map(); // uid -> sprite container
    this._unsubs = [];
    this._dead = new Set();

    app.stage.addChild(this.root);
    app.stage.addChild(this.fxLayer);

    this._drawBackground();
    this._buildUnits();
    this._bindEvents();
  }

  _drawBackground() {
    const bg = new Graphics();
    bg.rect(0, 0, STAGE_W, STAGE_H).fill(0x0c0e14);
    bg.moveTo(STAGE_W / 2, 20).lineTo(STAGE_W / 2, STAGE_H - 20).stroke({ color: 0x222838, width: 2 });
    this.root.addChild(bg);
  }

  _layoutFor(team, pos) {
    const row = pos <= 3 ? 'front' : 'back';
    const cols = team === 0 ? { back: 150, front: 330 } : { front: STAGE_W - 330, back: STAGE_W - 150 };
    const x = cols[row];
    const indexInRow = row === 'front' ? pos - 1 : pos - 4; // 0..2
    const spacing = 92;
    const rowCount = 3;
    const totalH = (rowCount - 1) * spacing;
    const y = STAGE_H / 2 - totalH / 2 + indexInRow * spacing;
    return { x, y };
  }

  _buildUnits() {
    for (const team of [0, 1]) {
      for (const unit of this.engine.teams[team]) {
        const { x, y } = this._layoutFor(team, unit.pos);
        const sprite = this._makeSprite(unit);
        sprite.x = x;
        sprite.y = y;
        sprite._homeX = x;
        sprite._homeY = y;
        this.root.addChild(sprite);
        this.sprites.set(unit.uid, sprite);
      }
    }
  }

  _makeSprite(unit) {
    const c = new Container();
    c._unit = unit;

    const color = ELEMENT_COLOR[unit.element] || 0xffffff;
    const body = new Graphics();
    body.circle(0, 0, R).fill(color);
    body.circle(0, 0, R).stroke({ color: 0x0c0e14, width: 3 });
    c.addChild(body);
    c._body = body;

    const glyph = new Text({
      text: CLASS_GLYPH[unit.class] || '?',
      style: { fontSize: 24, fill: 0x11131a },
    });
    glyph.anchor.set(0.5);
    c.addChild(glyph);

    const name = new Text({
      text: `${unit.name} Lv${unit.level}`,
      style: { fontSize: 12, fill: 0xc9d2e6, fontWeight: '600' },
    });
    name.anchor.set(0.5);
    name.y = -R - 26;
    c.addChild(name);

    const bars = new Graphics();
    bars.y = R + 8;
    c.addChild(bars);
    c._bars = bars;

    return c;
  }

  _bar(g, y, ratio, color, bgColor) {
    const x = -BAR_W / 2;
    g.roundRect(x, y, BAR_W, 6, 3).fill(bgColor);
    if (ratio > 0) g.roundRect(x, y, BAR_W * ratio, 6, 3).fill(color);
  }

  // 每幀刷新所有條（由 main 的 ticker 呼叫）。
  renderTick() {
    for (const sprite of this.sprites.values()) {
      const u = sprite._unit;
      const g = sprite._bars;
      g.clear();
      this._bar(g, 0, u.hpRatio, 0x57d77a, 0x2a3b30); // HP
      this._bar(g, 9, u.energyRatio, 0xf5c451, 0x33301f); // 能量
    }
  }

  _spriteOf(unit) {
    return this.sprites.get(unit.uid);
  }

  _bindEvents() {
    const e = this.engine;
    this._unsubs.push(
      e.on('attack', ({ attacker }) => {
        const s = this._spriteOf(attacker);
        if (s) lunge(s, attacker.team === 0 ? 1 : -1);
      }),
      e.on('ultimate', ({ caster }) => {
        const s = this._spriteOf(caster);
        if (s) ultPulse(s, s._body, ELEMENT_COLOR[caster.element]);
      }),
      e.on('damage', ({ target, amount, isAdvantage, isDisadvantage }) => {
        const s = this._spriteOf(target);
        if (!s) return;
        hitFlash(s, s._body);
        const color = isAdvantage ? 0xffd54a : isDisadvantage ? 0x9aa3b8 : 0xff6b6b;
        const size = isAdvantage ? 26 : 20;
        const txt = new Text({
          text: `${amount}`,
          style: { fontSize: size, fill: color, fontWeight: '800', stroke: { color: 0x000000, width: 3 } },
        });
        floatText(this.fxLayer, s.x, s.y - R, txt);
      }),
      e.on('heal', ({ target, amount }) => {
        const s = this._spriteOf(target);
        if (!s) return;
        const txt = new Text({
          text: `+${amount}`,
          style: { fontSize: 20, fill: 0x6bdc8a, fontWeight: '800', stroke: { color: 0x000000, width: 3 } },
        });
        floatText(this.fxLayer, s.x, s.y - R, txt);
      }),
      e.on('death', ({ unit }) => {
        const s = this._spriteOf(unit);
        if (s && !this._dead.has(unit.uid)) {
          this._dead.add(unit.uid);
          deathFade(s);
        }
      })
    );
  }

  destroy() {
    this._unsubs.forEach((fn) => fn());
    this._unsubs = [];
    // 先停掉所有進行中的 GSAP tween，避免在物件已銷毀後仍寫入屬性。
    for (const s of this.sprites.values()) {
      resetVisual(s);
      killFx(s); // 殺掉子物件（_body 等）的 tint/位移 tween
    }
    killFx(this.fxLayer);
    this.root.destroy({ children: true });
    this.fxLayer.destroy({ children: true });
  }
}
