// 戰鬥場景：6 固定位置(前3後3)，由 setup 建場並訂閱 Replayer 事件播放 GSAP 特效，
// 每幀依 replayer 狀態刷新 HP / 能量條。不依賴 engine/Unit，僅吃可序列化 log 資料。
import { gsap } from 'gsap';
import { Container, Graphics, Text } from 'pixi.js';
import { STAGE_W, STAGE_H } from './pixiApp.js';
import { ENERGY_MAX } from '../battle/unit.js';
import { SKILLS } from '../battle/skills.js';
import {
  lunge,
  hitFlash,
  ultPulse,
  floatText,
  deathFade,
  banner,
  screenShake,
  resetVisual,
  killFx,
} from './fx.js';

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
  constructor(app, setup, replayer) {
    this.app = app;
    this.setup = setup;
    this.replayer = replayer;
    this._instant = false;
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
    for (const info of this.setup) {
      const { x, y } = this._layoutFor(info.team, info.pos);
      const sprite = this._makeSprite(info);
      sprite.x = x;
      sprite.y = y;
      sprite._homeX = x;
      sprite._homeY = y;
      this.root.addChild(sprite);
      this.sprites.set(info.uid, sprite);
    }
  }

  _makeSprite(info) {
    const c = new Container();
    c._info = info;

    const color = ELEMENT_COLOR[info.element] || 0xffffff;
    const body = new Graphics();
    body.circle(0, 0, R).fill(color);
    body.circle(0, 0, R).stroke({ color: 0x0c0e14, width: 3 });
    c.addChild(body);
    c._body = body;

    const glyph = new Text({
      text: CLASS_GLYPH[info.class] || '?',
      style: { fontSize: 24, fill: 0x11131a },
    });
    glyph.anchor.set(0.5);
    c.addChild(glyph);

    const name = new Text({
      text: `${info.name} Lv${info.level}`,
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

  // 每幀刷新所有條（由 controller 的 ticker 呼叫），由 replayer 狀態驅動。
  renderTick() {
    for (const [uid, sprite] of this.sprites) {
      const info = sprite._info;
      const g = sprite._bars;
      const hp = this.replayer.hpOf(uid);
      const energy = this.replayer.energyOf(uid);
      g.clear();
      this._bar(g, 0, info.maxHp > 0 ? hp / info.maxHp : 0, 0x57d77a, 0x2a3b30); // HP
      this._bar(g, 9, Math.min(1, energy / ENERGY_MAX), 0xf5c451, 0x33301f); // 能量

      // 跳過 / 瞬時模式下沒有 death 事件動畫，這裡補套終局視覺（與 death 共用 _dead 去重）。
      // 正常播放時死亡淡出交給 death 事件的 deathFade；此處只在瞬時模式生效，
      // 否則 renderTick 會在致死 damage 當幀（alive 已 false）搶先套終局視覺，淡出永遠不會播。
      if (this._instant && !this.replayer.aliveOf(uid) && !this._dead.has(uid)) {
        this._dead.add(uid);
        sprite.alpha = 0.25;
        sprite.scale.set(0.85);
      }
    }
  }

  _bindEvents() {
    const rp = this.replayer;
    this._unsubs.push(
      rp.on('attack', ({ attackerUid }) => {
        if (this._instant) return;
        const s = this.sprites.get(attackerUid);
        if (s) lunge(s, s._info.team === 0 ? 1 : -1);
      }),
      rp.on('ultimate', ({ casterUid, skill }) => {
        if (this._instant) return;
        const s = this.sprites.get(casterUid);
        if (!s) return;
        const color = ELEMENT_COLOR[s._info.element] ?? 0xffffff;
        ultPulse(s, s._body, color);
        screenShake(this.root);
        const txt = new Text({
          text: SKILLS[skill]?.name ?? skill,
          style: {
            fontSize: 34,
            fill: color,
            fontWeight: '800',
            stroke: { color: 0x000000, width: 5 },
          },
        });
        txt.x = STAGE_W / 2;
        txt.y = STAGE_H / 2;
        banner(this.fxLayer, txt);
      }),
      rp.on('damage', ({ targetUid, amount, isCrit, isAdvantage, isDisadvantage }) => {
        if (this._instant) return;
        const s = this.sprites.get(targetUid);
        if (!s) return;
        hitFlash(s, s._body);
        let text;
        let size;
        let color;
        if (isCrit) {
          text = `暴擊 ${amount}`;
          size = 30;
          color = 0xffa940;
          screenShake(this.root, 4);
        } else {
          color = isAdvantage ? 0xffd54a : isDisadvantage ? 0x9aa3b8 : 0xff6b6b;
          size = isAdvantage ? 26 : 20;
          text = `${amount}`;
        }
        const txt = new Text({
          text,
          style: { fontSize: size, fill: color, fontWeight: '800', stroke: { color: 0x000000, width: 3 } },
        });
        floatText(this.fxLayer, s.x, s.y - R, txt);
      }),
      rp.on('heal', ({ targetUid, amount }) => {
        if (this._instant) return;
        const s = this.sprites.get(targetUid);
        if (!s) return;
        const txt = new Text({
          text: `+${amount}`,
          style: { fontSize: 20, fill: 0x6bdc8a, fontWeight: '800', stroke: { color: 0x000000, width: 3 } },
        });
        floatText(this.fxLayer, s.x, s.y - R, txt);
      }),
      rp.on('stunned', ({ uid }) => {
        if (this._instant) return;
        const s = this.sprites.get(uid);
        if (!s) return;
        const txt = new Text({
          text: '暈眩',
          style: { fontSize: 20, fill: 0x9aa3b8, fontWeight: '800', stroke: { color: 0x000000, width: 3 } },
        });
        floatText(this.fxLayer, s.x, s.y - R, txt);
      }),
      rp.on('death', ({ uid }) => {
        if (this._instant) return;
        const s = this.sprites.get(uid);
        if (s && !this._dead.has(uid)) {
          this._dead.add(uid);
          deathFade(s);
        }
      })
    );
  }

  setInstant(v) {
    this._instant = v;
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
    // screenShake 直接動 root 的 x/y（非子物件），需另外殺掉飛行中 tween，
    // 避免在 root 銷毀後仍寫入座標。
    gsap.killTweensOf(this.root);
    this.root.destroy({ children: true });
    this.fxLayer.destroy({ children: true });
  }
}
