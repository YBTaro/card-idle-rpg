// 戰鬥場景 3.0：單位＝去背全身立繪木偶（進場/呼吸/突進/受擊/死亡），
// 血條+能量條浮在頭頂（元素小圖示靠左）、前後排斜向錯位＋景深縮放、
// 由 setup 建場並訂閱 Replayer 事件播 GSAP 特效，每幀刷新條。
// 不依賴 engine/Unit，僅吃可序列化 log 資料。
import { gsap } from 'gsap';
import {
  Container,
  Graphics,
  Sprite,
  Assets,
  Text,
  FillGradient,
  ParticleContainer,
  Particle,
  ColorMatrixFilter,
  Rectangle,
} from 'pixi.js';
import { STAGE_W, STAGE_H } from './pixiApp.js';
import { ENERGY_MAX } from '../battle/unit.js';
import { SKILLS } from '../battle/skills.js';
import { cutoutFor } from '../data/assets.js';
import {
  lunge,
  hitFlash,
  ultPulse,
  floatText,
  spark,
  shockwave,
  cutIn,
  screenShake,
  deathFade,
  resetVisual,
  killFx,
} from './fx.js';

// 與 style.css 的 --fire/--wind/--water/--light/--dark 同色值。
const ELEMENT_COLOR = {
  fire: 0xff7d5c,
  wind: 0x7fe497,
  water: 0x6cb2ff,
  light: 0xffe789,
  dark: 0xbb8cff,
};
const CLASS_GLYPH = { tank: '🛡', dps: '⚔', support: '✚' };

const GOLD = 0xf5e6b0;
const BODY_H = 165; // 立繪基準高（縮放前）
const BAR_W = 44; // 頭頂血條寬
const GROUND_Y = STAGE_H * 0.55;
// 縱深：排內由上（遠）而下（近）
const DEPTH_SCALE = [0.8, 0.92, 1.04];
const ENTRANCE_S = 0.4; // 進場滑入
const ENTRANCE_STAGGER_S = 0.08;

export class BattleScene {
  constructor(app, setup, replayer) {
    this.app = app;
    this.setup = setup;
    this.replayer = replayer;
    this._instant = false;
    this._destroyed = false;
    this.root = new Container();
    this.root.sortableChildren = true;
    this.fxLayer = new Container();
    this.sprites = new Map();
    this._unsubs = [];
    this._dead = new Set();
    this._glows = [];
    this._ambient = [];
    this._greyFilter = new ColorMatrixFilter();
    this._greyFilter.desaturate(false);
    this._pulse = { v: 0 };
    this._pulseTween = gsap.to(this._pulse, {
      v: 1,
      duration: 0.55,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    });

    app.stage.addChild(this.root);
    app.stage.addChild(this.fxLayer);

    this._dotTex = this._makeDotTexture();
    this._drawBackground();
    this._buildUnits();
    this._bindEvents();
  }

  // 柔邊光點材質：app 層級共享（每場重建場景不重做、也不銷毀——
  // 銷毀會和仍在飛行的特效 sprite 產生 render 競態）。
  _makeDotTexture() {
    if (this.app._sharedDotTex) return this.app._sharedDotTex;
    const g = new Graphics();
    const rings = 14;
    for (let i = rings; i >= 1; i -= 1) {
      const t = i / rings;
      g.circle(0, 0, 16 * t).fill({ color: 0xffffff, alpha: 0.1 + (1 - t) * 0.12 });
    }
    const tex = this.app.renderer.generateTexture(g);
    g.destroy();
    this.app._sharedDotTex = tex;
    return tex;
  }

  _drawBackground() {
    // ---- 靜態層（cacheAsTexture）：天幕 / 遠山兩層 / 地面 / 地平線微光 ----
    const bgStatic = new Container();
    bgStatic.zIndex = -1000;
    const bg = new Graphics();

    const sky = new FillGradient({
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: 0x141a2b },
        { offset: 0.7, color: 0x272042 },
        { offset: 1, color: 0x352c4e },
      ],
    });
    bg.rect(0, 0, STAGE_W, GROUND_Y).fill(sky);

    bg.moveTo(0, GROUND_Y)
      .lineTo(0, GROUND_Y - 52)
      .lineTo(90, GROUND_Y - 88)
      .lineTo(200, GROUND_Y - 46)
      .lineTo(330, GROUND_Y - 96)
      .lineTo(470, GROUND_Y - 40)
      .lineTo(600, GROUND_Y - 78)
      .lineTo(740, GROUND_Y - 34)
      .lineTo(870, GROUND_Y - 110)
      .lineTo(STAGE_W, GROUND_Y - 60)
      .lineTo(STAGE_W, GROUND_Y)
      .closePath()
      .fill({ color: 0x1b1832, alpha: 0.85 });
    bg.moveTo(0, GROUND_Y)
      .lineTo(0, GROUND_Y - 26)
      .lineTo(140, GROUND_Y - 52)
      .lineTo(300, GROUND_Y - 20)
      .lineTo(460, GROUND_Y - 58)
      .lineTo(620, GROUND_Y - 24)
      .lineTo(800, GROUND_Y - 48)
      .lineTo(STAGE_W, GROUND_Y - 18)
      .lineTo(STAGE_W, GROUND_Y)
      .closePath()
      .fill({ color: 0x241f3d, alpha: 0.95 });

    const ground = new FillGradient({
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: 0x3b3454 },
        { offset: 1, color: 0x232032 },
      ],
    });
    bg.rect(0, GROUND_Y, STAGE_W, STAGE_H - GROUND_Y).fill(ground);

    bg.rect(0, GROUND_Y - 1, STAGE_W, 2).fill({ color: 0xf5c451, alpha: 0.12 });
    for (const ly of [0.66, 0.78, 0.92]) {
      const y = STAGE_H * ly;
      const inset = (1 - ly) * STAGE_W * 0.35;
      bg.moveTo(inset, y)
        .lineTo(STAGE_W - inset, y)
        .stroke({ color: 0x8a80a8, width: 1, alpha: 0.07 });
    }

    bgStatic.addChild(bg);
    bgStatic.cacheAsTexture(true);
    this.root.addChild(bgStatic);
    this._bgStatic = bgStatic;

    // ---- 動態層：雙方元素色柔光 + 微塵粒子 ----
    const teamColorOf = (team) => {
      const u = this.setup.find((s) => s.team === team);
      return (u && ELEMENT_COLOR[u.element]) || (team === 0 ? 0xff7d5c : 0x6cb2ff);
    };
    const glowSpecs = [
      { x: STAGE_W * 0.24, y: STAGE_H * 0.3, color: teamColorOf(0) },
      { x: STAGE_W * 0.76, y: STAGE_H * 0.3, color: teamColorOf(1) },
    ];
    for (const spec of glowSpecs) {
      const glow = new Sprite(this._dotTex);
      glow.anchor.set(0.5);
      glow.scale.set(11);
      glow.tint = spec.color;
      glow.alpha = 0.3;
      glow.blendMode = 'add';
      glow.x = spec.x;
      glow.y = spec.y;
      glow.zIndex = -999;
      this.root.addChild(glow);
      this._glows.push(glow);
      gsap.to(glow, {
        x: spec.x + (Math.random() * 60 - 30),
        y: spec.y + (Math.random() * 36 - 18),
        alpha: 0.2,
        duration: 7 + Math.random() * 4,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      });
    }

    const dust = new ParticleContainer({
      texture: this._dotTex,
      boundsArea: new Rectangle(0, 0, STAGE_W, STAGE_H),
      dynamicProperties: { position: true },
    });
    dust.blendMode = 'add';
    dust.zIndex = -998;
    for (let i = 0; i < 30; i += 1) {
      const p = new Particle({
        texture: this._dotTex,
        x: Math.random() * STAGE_W,
        y: STAGE_H * (0.12 + Math.random() * 0.8),
        anchorX: 0.5,
        anchorY: 0.5,
        scaleX: 0.12 + Math.random() * 0.22,
        scaleY: 0.12 + Math.random() * 0.22,
        tint: Math.random() < 0.5 ? GOLD : 0xffffff,
        alpha: 0.12 + Math.random() * 0.3,
      });
      dust.addParticle(p);
      this._ambient.push(p);
      gsap.to(p, {
        x: p.x + (Math.random() * 70 - 35),
        y: p.y - (24 + Math.random() * 40),
        duration: 5 + Math.random() * 6,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
        delay: Math.random() * 4,
      });
    }
    this.root.addChild(dust);
  }

  // 站位（腳底座標）：前排低近大、後排高遠小，排內斜向錯位（同參考原型）。
  _layoutFor(team, pos) {
    const row = pos <= 3 ? 'front' : 'back';
    const indexInRow = row === 'front' ? pos - 1 : pos - 4; // 0..2（0=最遠/最上）
    const colX = team === 0
      ? { back: 130, front: 305 }
      : { front: STAGE_W - 305, back: STAGE_W - 130 };
    // 排內斜隊形：由遠而近往「戰場中心」錯位
    const slant = (indexInRow - 1) * 30 * (team === 0 ? 1 : -1);
    const x = colX[row] + slant;
    const yTop = GROUND_Y + 40; // 最遠腳底
    const ySpacing = 82;
    const y = yTop + indexInRow * ySpacing;
    return { x, y, indexInRow };
  }

  _buildUnits() {
    const units = [...this.setup].sort((a, b) => a.pos - b.pos);
    let order = 0;
    for (const info of units) {
      const { x, y, indexInRow } = this._layoutFor(info.team, info.pos);
      const sprite = this._makeSprite(info);
      sprite.x = x;
      sprite.y = y;
      sprite._homeX = x;
      sprite._homeY = y;
      const base = DEPTH_SCALE[indexInRow] ?? 1;
      sprite._baseScale = base;
      sprite.scale.set(base);
      sprite.zIndex = y; // 愈近（低）愈後畫
      this.root.addChild(sprite);
      this.sprites.set(info.uid, sprite);

      // 進場：自場外滑入 + 微彈（依站位 stagger）
      const fromX = x + (info.team === 0 ? -120 : 120);
      sprite.x = fromX;
      sprite.alpha = 0;
      gsap.to(sprite, {
        x,
        alpha: 1,
        duration: ENTRANCE_S,
        delay: order * ENTRANCE_STAGGER_S,
        ease: 'back.out(1.3)',
        onComplete: () => {
          sprite.x = x;
        },
      });
      order += 1;
    }
  }

  // 待機呼吸：立繪以腳底為原點輕微「起伏」，每隻相位不同。
  _startBreath(body) {
    gsap.killTweensOf(body.scale);
    const bs = body.scale.x;
    gsap.to(body.scale, {
      y: body.scale.y * 1.018,
      x: bs * 1.005,
      duration: 1.3 + Math.random() * 0.7,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
      delay: Math.random() * 1.2,
    });
  }

  // 單位容器：原點＝腳底。影 → 元素底光 → 立繪（anchor 腳底）→ 頭頂資訊條。
  _makeSprite(info) {
    const c = new Container();
    c._info = info;
    const color = ELEMENT_COLOR[info.element] || 0xffffff;

    // 腳底橢圓影
    const shadow = new Graphics();
    shadow.ellipse(0, 2, 30, 8).fill({ color: 0x000000, alpha: 0.3 });
    c.addChild(shadow);

    // 元素底光（additive）
    const aura = new Sprite(this._dotTex);
    aura.anchor.set(0.5);
    aura.scale.set(2.6);
    aura.y = -6;
    aura.tint = color;
    aura.alpha = 0.4;
    aura.blendMode = 'add';
    c.addChild(aura);

    // 佔位主體（立繪載入前）：元素色膠囊 + 職業符號
    const placeholder = new Container();
    const cap = new Graphics();
    cap.roundRect(-24, -BODY_H * 0.72, 48, BODY_H * 0.72, 22).fill({ color, alpha: 0.85 });
    cap.roundRect(-24, -BODY_H * 0.72, 48, BODY_H * 0.72, 22).stroke({ color: GOLD, width: 2, alpha: 0.8 });
    placeholder.addChild(cap);
    const glyph = new Text({ text: CLASS_GLYPH[info.class] || '?', style: { fontSize: 26, fill: 0x11131a } });
    glyph.anchor.set(0.5);
    glyph.y = -BODY_H * 0.4;
    placeholder.addChild(glyph);
    c.addChild(placeholder);
    c._body = placeholder;
    this._startBreath(placeholder);

    // 立繪（async 載入後替換佔位）
    this._loadArt(c, info);

    // 頭頂資訊條：元素小點 + 血條/能量條
    const infoBar = new Container();
    infoBar.y = -BODY_H - 16;
    const chip = new Graphics();
    chip.circle(-BAR_W / 2 - 10, 5, 5.5).fill(color);
    chip.circle(-BAR_W / 2 - 10, 5, 5.5).stroke({ color: 0x14101f, width: 1.5 });
    infoBar.addChild(chip);
    const bars = new Graphics();
    infoBar.addChild(bars);
    c._bars = bars;
    c.addChild(infoBar);
    c._infoBar = infoBar;

    // buff/debuff 小圖示列（資訊條上方）
    const icons = new Container();
    icons.y = -BODY_H - 30;
    c.addChild(icons);
    c._buffIcons = icons;
    c._buffKey = '';

    return c;
  }

  // 依 manifest 載入去背全身立繪，替換佔位主體。
  _loadArt(c, info) {
    const path = cutoutFor(info.cardId);
    if (!path) return;
    Assets.load(path)
      .then((tex) => {
        if (this._destroyed || c.destroyed || !tex) return;
        const img = new Sprite(tex);
        img.anchor.set(0.5, 1); // 腳底
        const scale = BODY_H / tex.height;
        img.scale.set(info.team === 1 ? -scale : scale, scale); // 敵方鏡像
        // 替換佔位
        const idx = c.getChildIndex(c._body);
        gsap.killTweensOf(c._body.scale);
        c._body.destroy({ children: true });
        c.addChildAt(img, idx);
        c._body = img;
        this._startBreath(img);
      })
      .catch(() => {
        /* 載入失敗留佔位 */
      });
  }

  _buffGlyph(b) {
    if (b.kind === 'dot') return b.element === 'fire' ? '🔥' : '☠';
    if (b.kind === 'shield') return '🔰';
    if (b.kind === 'control') {
      return b.control === 'stun' ? '💫' : b.control === 'silence' ? '🤫' : '🎯';
    }
    const map = { atk: '⚔', def: '🛡', dmgTaken: '🛡', critChance: '✨', critMult: '✨', dmgDealt: '💥', energyGain: '⚡' };
    return map[b.stat] || '◆';
  }

  _rebuildBuffIcons(sprite, buffs) {
    const icons = sprite._buffIcons;
    if (!icons || icons.destroyed) return;
    for (const child of [...icons.children]) child.destroy({ children: true });
    const shown = buffs.slice(0, 6);
    const SIZE = 14;
    const GAP = 3;
    const totalW = shown.length * SIZE + (shown.length - 1) * GAP;
    shown.forEach((b, i) => {
      const x = -totalW / 2 + i * (SIZE + GAP) + SIZE / 2;
      const pill = new Graphics();
      pill.roundRect(x - SIZE / 2, -SIZE / 2, SIZE, SIZE, 5).fill({ color: b.neg ? 0x5a2530 : 0x24503a, alpha: 0.95 });
      pill.roundRect(x - SIZE / 2, -SIZE / 2, SIZE, SIZE, 5).stroke({ color: b.neg ? 0xff8a8a : 0x8ef2ae, width: 1, alpha: 0.8 });
      icons.addChild(pill);
      const t = new Text({ text: this._buffGlyph(b), style: { fontSize: 9 } });
      t.anchor.set(0.5);
      t.x = x;
      icons.addChild(t);
    });
  }

  _bar(g, y, ratio, color, bgColor, glow = 0) {
    const x = -BAR_W / 2;
    g.roundRect(x - 1, y - 1, BAR_W + 2, 7, 3.5).fill({ color: 0x0b0d16, alpha: 0.9 });
    g.roundRect(x, y, BAR_W, 5, 2.5).fill(bgColor);
    if (ratio > 0) g.roundRect(x, y, BAR_W * ratio, 5, 2.5).fill(color);
    if (glow > 0) {
      g.roundRect(x - 1, y - 1, BAR_W + 2, 7, 3.5).stroke({ color: 0xffe27a, width: 1.5, alpha: 0.25 + glow * 0.55 });
    }
  }

  // 胸口座標（特效/飄字定位；相對容器腳底原點）。
  _chestY(sprite) {
    return sprite.y - BODY_H * 0.55 * (sprite._baseScale ?? 1);
  }

  renderTick() {
    for (const [uid, sprite] of this.sprites) {
      const info = sprite._info;
      const g = sprite._bars;
      const hp = this.replayer.hpOf(uid);
      const energy = this.replayer.energyOf(uid);
      const hpRatio = info.maxHp > 0 ? hp / info.maxHp : 0;
      const hpColor = hpRatio > 0.5 ? 0x57d77a : hpRatio > 0.25 ? 0xf5c451 : 0xff6b6b;
      const full = energy >= ENERGY_MAX;
      g.clear();
      this._bar(g, 0, hpRatio, hpColor, 0x232d26);
      this._bar(g, 8, Math.min(1, energy / ENERGY_MAX), 0xf5c451, 0x2e2a1c, full ? this._pulse.v : 0);

      const buffs = this.replayer.buffsOf(uid);
      const buffKey = buffs.map((b) => `${b.kind}:${b.stat || b.control || b.element || ''}:${b.neg ? 1 : 0}`).join(',');
      if (buffKey !== sprite._buffKey) {
        sprite._buffKey = buffKey;
        this._rebuildBuffIcons(sprite, buffs);
      }

      // 跳過/瞬時模式：沒有 death 事件動畫，補終局視覺。
      if (this._instant && !this.replayer.aliveOf(uid) && !this._dead.has(uid)) {
        this._dead.add(uid);
        sprite.alpha = 0.25;
        sprite.scale.set((sprite._baseScale ?? 1) * 0.85);
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
        const info = s._info;
        const color = ELEMENT_COLOR[info.element] ?? 0xffffff;
        ultPulse(s, s._body, color);
        shockwave(this.fxLayer, s.x, s.y - 6, color);
        screenShake(this.root);
        cutIn(this.fxLayer, STAGE_W, {
          name: info.name,
          skillName: SKILLS[skill]?.name ?? skill,
          color,
          glyph: CLASS_GLYPH[info.class] || '?',
        });
      }),
      rp.on('damage', ({ targetUid, amount, isCrit, isAdvantage, isDisadvantage }) => {
        if (this._instant) return;
        const s = this.sprites.get(targetUid);
        if (!s) return;
        const pushDir = s._info.team === 0 ? -1 : 1;
        hitFlash(s, s._body, pushDir);
        spark(this.fxLayer, s.x, this._chestY(s), isCrit ? 0xffa940 : 0xffd27a, this._dotTex, isCrit ? 14 : 8);
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
        floatText(this.fxLayer, s.x, this._chestY(s) - 20, txt);
      }),
      rp.on('heal', ({ targetUid, amount }) => {
        if (this._instant) return;
        const s = this.sprites.get(targetUid);
        if (!s) return;
        spark(this.fxLayer, s.x, this._chestY(s), 0x8ef2ae, this._dotTex, 6);
        const txt = new Text({
          text: `+${amount}`,
          style: { fontSize: 20, fill: 0x6bdc8a, fontWeight: '800', stroke: { color: 0x000000, width: 3 } },
        });
        floatText(this.fxLayer, s.x, this._chestY(s) - 20, txt);
      }),
      rp.on('stunned', ({ uid }) => {
        if (this._instant) return;
        const s = this.sprites.get(uid);
        if (!s) return;
        const txt = new Text({
          text: '暈眩',
          style: { fontSize: 20, fill: 0x9aa3b8, fontWeight: '800', stroke: { color: 0x000000, width: 3 } },
        });
        floatText(this.fxLayer, s.x, this._chestY(s) - 20, txt);
      }),
      rp.on('death', ({ uid }) => {
        if (this._instant) return;
        const s = this.sprites.get(uid);
        if (s && !this._dead.has(uid)) {
          this._dead.add(uid);
          deathFade(s, this._greyFilter);
        }
      })
    );
  }

  setInstant(v) {
    this._instant = v;
  }

  destroy() {
    this._destroyed = true;
    this._unsubs.forEach((fn) => fn());
    this._unsubs = [];
    for (const glow of this._glows) gsap.killTweensOf(glow);
    this._glows = [];
    for (const p of this._ambient) gsap.killTweensOf(p);
    this._ambient = [];
    this._pulseTween.kill();
    for (const s of this.sprites.values()) {
      resetVisual(s);
      killFx(s);
    }
    killFx(this.fxLayer);
    gsap.killTweensOf(this.root);
    this._bgStatic?.cacheAsTexture(false);
    this.root.destroy({ children: true });
    this.fxLayer.destroy({ children: true });
    this._dotTex = null; // 共享材質不銷毀（掛在 app 上，跨場景復用）
  }
}
