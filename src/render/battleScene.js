// 戰鬥場景：6 固定位置(前3後3)，由 setup 建場並訂閱 Replayer 事件播放 GSAP 特效，
// 每幀依 replayer 狀態刷新 HP / 能量條。不依賴 engine/Unit，僅吃可序列化 log 資料。
// 視覺：FillGradient 天幕/地面、additive 柔光與微塵粒子、cacheAsTexture 靜態背景、
// 棋子 = 卡圖頭像 + 金環 + 元素底光 + 待機呼吸。
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
import { artFor, portraitFor } from '../data/assets.js';
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

// 與 style.css 的 --fire/--wind/--water/--light/--dark 同色值（療癒手遊風暖調）。
const ELEMENT_COLOR = {
  fire: 0xff7d5c,
  wind: 0x7fe497,
  water: 0x6cb2ff,
  light: 0xffe789,
  dark: 0xbb8cff,
};
const CLASS_GLYPH = { tank: '🛡', dps: '⚔', support: '✚' };

const R = 30; // 角色圓半徑
const BAR_W = 70;
const GOLD = 0xf5e6b0;

export class BattleScene {
  constructor(app, setup, replayer) {
    this.app = app;
    this.setup = setup;
    this.replayer = replayer;
    this._instant = false;
    this._destroyed = false;
    this.root = new Container();
    this.root.sortableChildren = true; // 依 zIndex 做前後遮擋排序
    this.fxLayer = new Container();
    this.sprites = new Map(); // uid -> sprite container
    this._unsubs = [];
    this._dead = new Set();
    this._glows = []; // 背景柔光（destroy 時需 killTweensOf）
    this._ambient = []; // 微塵粒子（destroy 時需 killTweensOf）
    this._greyFilter = new ColorMatrixFilter();
    this._greyFilter.desaturate(false);
    // 能量滿格的呼吸脈衝值（renderTick 讀取；單一 tween 供全場共用）
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

  // 柔邊白色光點材質（粒子 / 光暈共用）：同心圓疊出徑向衰減，烘成一張貼圖。
  _makeDotTexture() {
    const g = new Graphics();
    const rings = 14;
    for (let i = rings; i >= 1; i -= 1) {
      const t = i / rings;
      g.circle(0, 0, 16 * t).fill({ color: 0xffffff, alpha: 0.1 + (1 - t) * 0.12 });
    }
    const tex = this.app.renderer.generateTexture(g);
    g.destroy();
    return tex;
  }

  _drawBackground() {
    // ---- 靜態層（cacheAsTexture：天幕/地面漸層、遠山、地平線、透視線）----
    const bgStatic = new Container();
    bgStatic.zIndex = -1000;

    const groundY = STAGE_H * 0.55;
    const bg = new Graphics();

    // 天幕：暮藍 → 暖紫 的垂直漸層。
    const sky = new FillGradient({
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: 0x141a2b },
        { offset: 0.7, color: 0x272042 },
        { offset: 1, color: 0x352c4e },
      ],
    });
    bg.rect(0, 0, STAGE_W, groundY).fill(sky);

    // 遠山剪影兩層（低對比，只給輪廓感）。
    bg.moveTo(0, groundY)
      .lineTo(0, groundY - 52)
      .lineTo(90, groundY - 88)
      .lineTo(200, groundY - 46)
      .lineTo(330, groundY - 96)
      .lineTo(470, groundY - 40)
      .lineTo(600, groundY - 78)
      .lineTo(740, groundY - 34)
      .lineTo(870, goldenPeak(groundY))
      .lineTo(STAGE_W, groundY - 60)
      .lineTo(STAGE_W, groundY)
      .closePath()
      .fill({ color: 0x1b1832, alpha: 0.85 });
    bg.moveTo(0, groundY)
      .lineTo(0, groundY - 26)
      .lineTo(140, groundY - 52)
      .lineTo(300, groundY - 20)
      .lineTo(460, groundY - 58)
      .lineTo(620, groundY - 24)
      .lineTo(800, groundY - 48)
      .lineTo(STAGE_W, groundY - 18)
      .lineTo(STAGE_W, groundY)
      .closePath()
      .fill({ color: 0x241f3d, alpha: 0.95 });

    // 地面：地平線稍亮 → 底部收暗。
    const ground = new FillGradient({
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: 0x3b3454 },
        { offset: 1, color: 0x232032 },
      ],
    });
    bg.rect(0, groundY, STAGE_W, STAGE_H - groundY).fill(ground);

    // 地平線暖金微光 + 淡透視地面線。
    bg.rect(0, groundY - 1, STAGE_W, 2).fill({ color: 0xf5c451, alpha: 0.12 });
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

    // ---- 動態層：additive 柔光（雙方元素色）+ 微塵粒子 ----
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
      glow.alpha = 0.34;
      glow.blendMode = 'add';
      glow.x = spec.x;
      glow.y = spec.y;
      glow.zIndex = -999;
      this.root.addChild(glow);
      this._glows.push(glow);
      gsap.to(glow, {
        x: spec.x + (Math.random() * 60 - 30),
        y: spec.y + (Math.random() * 36 - 18),
        alpha: 0.22,
        duration: 7 + Math.random() * 4,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      });
    }

    // 微塵：一個 ParticleContainer、單張貼圖、additive —— 一次 draw call。
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

  _layoutFor(team, pos) {
    const row = pos <= 3 ? 'front' : 'back';
    const cols = team === 0 ? { back: 150, front: 330 } : { front: STAGE_W - 330, back: STAGE_W - 150 };
    const indexInRow = row === 'front' ? pos - 1 : pos - 4; // 0..2
    // 斜隊形：沿排水平錯位（上小下大、team0 向右、team1 向左）。
    const x = cols[row] + (indexInRow - 1) * 14 * (team === 0 ? 1 : -1);
    const spacing = 116; // 需大於單位視覺高度（名字頂到條底約 106px），否則上下排疊字
    const rowCount = 3;
    const totalH = (rowCount - 1) * spacing;
    const y = STAGE_H / 2 - totalH / 2 + indexInRow * spacing;
    return { x, y, indexInRow };
  }

  _buildUnits() {
    const DEPTH_SCALE = [0.92, 1.0, 1.08]; // 同排由上而下 → 由遠而近
    for (const info of this.setup) {
      const { x, y, indexInRow } = this._layoutFor(info.team, info.pos);
      const sprite = this._makeSprite(info);
      sprite.x = x;
      sprite.y = y;
      sprite._homeX = x;
      sprite._homeY = y;
      const base = DEPTH_SCALE[indexInRow] ?? 1;
      sprite._baseScale = base; // fx 的比例動畫以此為基準
      sprite.scale.set(base);
      sprite.zIndex = y; // 愈下（近）愈後畫 → 遮擋上方單位
      this.root.addChild(sprite);
      this.sprites.set(info.uid, sprite);
    }
  }

  // 待機呼吸：棋子主體輕微縮放（每隻週期/相位不同，畫面才會「活」）。
  _startBreath(body, base = 1) {
    gsap.killTweensOf(body.scale);
    gsap.to(body.scale, {
      x: base * 1.035,
      y: base * 1.035,
      duration: 1.4 + Math.random() * 0.8,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
      delay: Math.random() * 1.2,
    });
  }

  _makeSprite(info) {
    const c = new Container();
    c._info = info;

    const color = ELEMENT_COLOR[info.element] || 0xffffff;

    // 腳底橢圓影（最底層）。緊貼圓底、比條窄，避免和血條疊成「重影」。
    const shadow = new Graphics();
    shadow.ellipse(0, R + 3, 22, 5.5).fill({ color: 0x000000, alpha: 0.22 });
    c.addChild(shadow);

    // 元素色底光（additive 柔光，襯托棋子輪廓）。
    const aura = new Sprite(this._dotTex);
    aura.anchor.set(0.5);
    aura.scale.set(3.4);
    aura.tint = color;
    aura.alpha = 0.5;
    aura.blendMode = 'add';
    c.addChild(aura);

    const body = new Graphics();
    body.circle(0, 0, R).fill(color);
    body.circle(0, 0, R).stroke({ color: GOLD, width: 2.5, alpha: 0.95 });
    c.addChild(body);
    c._body = body;
    this._startBreath(body, 1);

    const glyph = new Text({
      text: CLASS_GLYPH[info.class] || '?',
      style: { fontSize: 24, fill: 0x11131a },
    });
    glyph.anchor.set(0.5);
    c.addChild(glyph);
    c._glyph = glyph;

    // 有卡圖 → async 載入後以圓形遮罩 Sprite 換掉程序化圓的填色部分。
    this._loadArt(c, info);

    // 元素寶石角標（右下）。
    const gem = new Graphics();
    gem.circle(R * 0.72, R * 0.72, 7).fill(color);
    gem.circle(R * 0.72, R * 0.72, 7).stroke({ color: 0x14101f, width: 2 });
    c.addChild(gem);

    const name = new Text({
      text: `${info.name} Lv${info.level}`,
      style: {
        fontSize: 11,
        fill: 0xdfe4f2,
        fontWeight: '600',
        stroke: { color: 0x10131f, width: 3 },
      },
    });
    name.anchor.set(0.5);
    name.y = -R - 16;
    c.addChild(name);

    const bars = new Graphics();
    bars.y = R + 12; // 與腳底影錯開，否則影從條後緣露出像重影
    c.addChild(bars);
    c._bars = bars;

    // buff/debuff 小圖示列（血條下方；renderTick 依 replayer 狀態變更時重建）。
    const icons = new Container();
    icons.y = R + 30;
    c.addChild(icons);
    c._buffIcons = icons;
    c._buffKey = '';

    return c;
  }

  // buff 摘要 → 顯示字符。
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
    const SIZE = 15;
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

  // 依 manifest 載入卡圖並換掉程序化圓 body。無素材則 artFor 回 null，直接跳過。
  _loadArt(c, info) {
    const path = artFor(info.cardId);
    if (!path) return;
    Assets.load(path)
      .then((tex) => {
        // async 防護：場景已拆或此 sprite 已 destroy 就不動它。
        if (this._destroyed || c.destroyed || !tex) return;

        const img = new Sprite(tex);
        img.anchor.set(0.5);
        // 棋子很小（直徑 2R），整張立繪塞進來人物會太小 →
        // 以 portrait 焦點（頭部）為中心額外放大，呈現頭像式棋子。
        const p = portraitFor(info.cardId);
        const TOKEN_ZOOM = 3.2;
        const short = Math.min(tex.width, tex.height) || 2 * R;
        const scale = ((2 * R) / short) * TOKEN_ZOOM;
        img.scale.set(scale);
        img.x = (0.5 - (p?.x ?? 0.5)) * tex.width * scale;
        img.y = (0.5 - (p?.y ?? 0.3)) * tex.height * scale;

        // 圓形遮罩（需掛進顯示樹才生效）。
        const mask = new Graphics().circle(0, 0, R).fill(0xffffff);
        c.addChild(mask);
        img.mask = mask;

        // 影/底光 之上、body 之下插入圖，讓 body 的外圈金環仍框住圖。
        const bodyIdx = c.getChildIndex(c._body);
        c.addChildAt(img, bodyIdx);

        // body 只留外圈金環（清掉填色圓）；符號隱藏；呼吸改作用在圖上。
        gsap.killTweensOf(c._body.scale);
        c._body.clear();
        c._body.circle(0, 0, R).stroke({ color: GOLD, width: 2.5, alpha: 0.95 });
        if (c._glyph) c._glyph.visible = false;

        // hitFlash / ultPulse tint 對象改為圖（Sprite 支援 tint）。
        c._body = img;
        c._artMask = mask;
        // 注意：呼吸不作用在遮罩圖上（scale 是裁切參數的一部分），改由金環環代替微動效果即可省略。
      })
      .catch(() => {
        // 載入失敗：silently 留程序化圓。
      });
  }

  _bar(g, y, ratio, color, bgColor, glow = 0) {
    const x = -BAR_W / 2;
    g.roundRect(x - 1, y - 1, BAR_W + 2, 8, 4).fill({ color: 0x0b0d16, alpha: 0.9 });
    g.roundRect(x, y, BAR_W, 6, 3).fill(bgColor);
    if (ratio > 0) g.roundRect(x, y, BAR_W * ratio, 6, 3).fill(color);
    if (glow > 0) {
      g.roundRect(x - 1, y - 1, BAR_W + 2, 8, 4).stroke({ color: 0xffe27a, width: 1.5, alpha: 0.25 + glow * 0.55 });
    }
  }

  // 每幀刷新所有條（由 controller 的 ticker 呼叫），由 replayer 狀態驅動。
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
      this._bar(g, 0, hpRatio, hpColor, 0x232d26); // HP（低血變色）
      this._bar(g, 9, Math.min(1, energy / ENERGY_MAX), 0xf5c451, 0x2e2a1c, full ? this._pulse.v : 0); // 能量（滿格脈衝）

      // buff/debuff 圖示：狀態變更時才重建（key 比對，避免每幀重繪）。
      const buffs = this.replayer.buffsOf(uid);
      const buffKey = buffs.map((b) => `${b.kind}:${b.stat || b.control || b.element || ''}:${b.neg ? 1 : 0}`).join(',');
      if (buffKey !== sprite._buffKey) {
        sprite._buffKey = buffKey;
        this._rebuildBuffIcons(sprite, buffs);
      }

      // 跳過 / 瞬時模式下沒有 death 事件動畫，這裡補套終局視覺（與 death 共用 _dead 去重）。
      // 正常播放時死亡淡出交給 death 事件的 deathFade；此處只在瞬時模式生效，
      // 否則 renderTick 會在致死 damage 當幀（alive 已 false）搶先套終局視覺，淡出永遠不會播。
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
        shockwave(this.fxLayer, s.x, s.y, color);
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
        // 被打往「遠離戰場中心」的方向擊退。
        const pushDir = s._info.team === 0 ? -1 : 1;
        hitFlash(s, s._body, pushDir);
        spark(this.fxLayer, s.x, s.y - 4, isCrit ? 0xffa940 : 0xffd27a, this._dotTex, isCrit ? 14 : 8);
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
        spark(this.fxLayer, s.x, s.y - 6, 0x8ef2ae, this._dotTex, 6);
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
          deathFade(s, this._greyFilter);
        }
      })
    );
  }

  setInstant(v) {
    this._instant = v;
  }

  destroy() {
    this._destroyed = true; // 阻擋仍在飛行的 async 載圖回填已拆場景
    this._unsubs.forEach((fn) => fn());
    this._unsubs = [];
    // 停掉背景柔光 / 微塵 / 能量脈衝 tween（作用於 root 子物件，需在 root 銷毀前殺）。
    for (const glow of this._glows) gsap.killTweensOf(glow);
    this._glows = [];
    for (const p of this._ambient) gsap.killTweensOf(p);
    this._ambient = [];
    this._pulseTween.kill();
    // 先停掉所有進行中的 GSAP tween，避免在物件已銷毀後仍寫入屬性。
    for (const s of this.sprites.values()) {
      resetVisual(s);
      killFx(s); // 殺掉子物件（_body 等）的 tint/位移/呼吸 tween
    }
    killFx(this.fxLayer);
    // screenShake 直接動 root 的 x/y（非子物件），需另外殺掉飛行中 tween，
    // 避免在 root 銷毀後仍寫入座標。
    gsap.killTweensOf(this.root);
    // cacheAsTexture 的容器銷毀前必須先關閉快取（performance skill 規範）。
    this._bgStatic?.cacheAsTexture(false);
    this.root.destroy({ children: true });
    this.fxLayer.destroy({ children: true });
    this._dotTex?.destroy(true);
    this._dotTex = null;
  }
}

// 遠山其中一個峰的高度（拉出一個「主峰」讓輪廓不呆板）。
function goldenPeak(groundY) {
  return groundY - 110;
}
