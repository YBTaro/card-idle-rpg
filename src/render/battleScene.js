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
import { CARDS } from '../data/cards.js';
import { cutoutFor } from '../data/assets.js';
import {
  lunge,
  meleeDash,
  bolt,
  hitFlash,
  ultPulse,
  floatText,
  spark,
  castCircle,
  impactBurst,
  lightPillar,
  screenShake,
  deathFade,
  resetVisual,
  killFx,
  fxTl,
  fxTo,
  fxDelay,
} from './fx.js';
import { casterVfx, targetVfx, ultTiming, thornsBurst, executeSlash, pierceFlash, drainMotes, purifyBurst } from './skillVfx.js';
import { syncStatusAuras } from './statusAuras.js';
import { weatherOf, terrainOf } from '../battle/environments.js';
import { playVoice } from './audio.js';
import { iconSvg } from '../ui/icons.js';

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
// 傷害飄字專用屬性色：風用「森林綠」（亮綠留給治療）；無屬性＝白。
const DMG_ELEMENT_COLOR = {
  fire: 0xff7d5c,
  wind: 0x4caf6d, // 森林綠（治療是亮綠 0x8ef2ae，兩者要分得開）
  water: 0x6cb2ff,
  light: 0xffe789,
  dark: 0xbb8cff,
};
const HEAL_GREEN = 0x8ef2ae; // 治療亮綠
const BODY_H = 165; // 立繪基準高（縮放前）
const BAR_W = 44; // 頭頂血條寬
const GROUND_Y = STAGE_H * 0.55;
// 縱深：排內由上（遠）而下（近）
const DEPTH_SCALE = [0.8, 0.92, 1.04];
const ENTRANCE_S = 0.4; // 進場滑入
const ENTRANCE_STAGGER_S = 0.08;
// 絕技聚光燈演出（參考原型：全場壓暗、只亮施放者與目標，技能名小標籤貼施放者旁）
// 收燈為事件/計時混合驅動：施放後保底 hold；每次命中把「餘韻計時」重設為該技能的
// impactTail（skillVfx.ultTiming 依技能資料派生——不同技能不同節奏；純輔助技 hold
// 貼演出長度收燈，不留黑等）；收燈前 director gate 擋住下一個單位的回合。
const ULT_DIM_ALPHA = 0.66; // 壓暗層不透明度
const ULT_DIM_IN_S = 0.16;
const ULT_DIM_OUT_S = 0.35;
const Z_DIM = 500; // 壓暗層（單位 zIndex = y，最多 ~540）
const Z_SPOT_TARGET = 590; // 被點亮的目標
const Z_SPOT_CASTER = 600; // 施放者最上層

export class BattleScene {
  constructor(app, setup, replayer, { env = null } = {}) {
    this.app = app;
    this.setup = setup;
    this.replayer = replayer;
    this.env = env; // 環境（天氣氛圍層用）
    this._instant = false;
    this._destroyed = false;
    this.root = new Container();
    this.root.sortableChildren = true;
    // 以畫面中心為軸（終結演出推鏡用；screenShake 的 home 也以此為基準）
    this.root.pivot.set(STAGE_W / 2, STAGE_H / 2);
    this.root.position.set(STAGE_W / 2, STAGE_H / 2);
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
    this._drawWeather(this.env?.weather ?? null);
    this._drawTerrain(this.env?.terrain ?? null);
    this._buildUnits();
    this._bindEvents();
    this._showBattleStart(); // 開場橫幅；director 的 initialDelay 讓開場宣告不搶拍
  }

  // 開場橫幅：金字大標打入 → 停半拍 → 淡出（director 初始延遲期間播完）。
  _showBattleStart() {
    const txt = new Text({
      text: '⚔ 戰鬥開始',
      style: { fontSize: 36, fill: 0xffe9b0, fontWeight: '900', letterSpacing: 8, stroke: { color: 0x000000, width: 6 } },
    });
    txt.anchor.set(0.5);
    txt.x = STAGE_W / 2;
    txt.y = STAGE_H * 0.34;
    txt.alpha = 0;
    txt.scale.set(1.6);
    this.fxLayer.addChild(txt);
    fxTl({ onComplete: () => { if (!txt.destroyed) txt.destroy(); } })
      .to(txt, { alpha: 1, duration: 0.16, ease: 'power2.out' }, 0)
      .to(txt.scale, { x: 1, y: 1, duration: 0.28, ease: 'back.out(2)' }, 0)
      .to(txt, { alpha: 0, y: txt.y - 26, duration: 0.35, ease: 'power1.in' }, 0.75);
  }

  // 環境宣告演出：開場進場被動與戰中技能開天氣/場地共用——
  // 半拍壓暗＋宣告者光柱抬亮；宣告字直接浮在「發動者頭上」（有 uid 時），
  // 只有關卡預設環境（無宣告者）才用全場置中橫幅。
  // 宣告之間的節奏由 DELAYS.weather/terrain（1.25s）拉開，互蓋依事件順序逐一亮相。
  _envAnnounce(uid, colorHex, title) {
    const color = Number(`0x${colorHex.slice(1)}`);
    const dim = new Graphics();
    dim.rect(0, 0, STAGE_W, STAGE_H).fill({ color: 0x05060c, alpha: 1 });
    dim.alpha = 0;
    dim.zIndex = Z_DIM;
    this.root.addChild(dim);
    fxTl({ onComplete: () => { if (!dim.destroyed) dim.destroy({ children: true }); } })
      .to(dim, { alpha: 0.4, duration: 0.16, ease: 'power1.out' }, 0)
      .to(dim, { alpha: 0, duration: 0.45, ease: 'power1.in' }, 0.72);
    const s = uid != null ? this.sprites.get(uid) : null;
    if (s && !s.destroyed) {
      s.zIndex = Z_SPOT_CASTER; // 宣告者抬到壓暗層之上
      const pillar = lightPillar(s, color); // 內含 repeat:-1 呼吸——呼叫方負責限時回收
      fxDelay(1.15, () => {
        if (!s.destroyed) s.zIndex = s._homeY ?? s.y;
        if (!pillar.destroyed) {
          killFx(pillar);
          gsap.killTweensOf(pillar);
          gsap.killTweensOf(pillar.scale);
          pillar.destroy({ children: true });
        }
      });
      // 宣告字浮在發動者頭上（誰開的環境一目瞭然）
      const txt = new Text({
        text: title,
        style: { fontSize: 22, fill: color, fontWeight: '900', letterSpacing: 2, stroke: { color: 0x000000, width: 4 } },
      });
      floatText(this.fxLayer, s.x, this._chestY(s) - 64, txt);
      return;
    }
    // 關卡預設環境：無宣告者 → 全場置中橫幅
    const txt = new Text({
      text: title,
      style: { fontSize: 30, fill: color, fontWeight: '900', letterSpacing: 3, stroke: { color: 0x000000, width: 5 } },
    });
    floatText(this.fxLayer, STAGE_W / 2, STAGE_H * 0.3, txt);
  }

  // 天氣氛圍層：全螢幕色調 + 天氣專屬動畫——一眼看出現在什麼天氣。
  // 暴雨＝整幕斜落雨絲；烈日＝旋轉光束扇 + 上升熱屑；颶風＝橫掃風痕。
  // 可重複呼叫（技能換天氣時拆舊建新）。
  _drawWeather(weatherId) {
    if (this._weatherLayer) {
      killFx(this._weatherLayer);
      if (!this._weatherLayer.destroyed) this._weatherLayer.destroy({ children: true });
      this._weatherLayer = null;
    }
    const weather = weatherOf(weatherId);
    if (!weather) return;
    const layer = new Container();
    layer.zIndex = -890;
    this._weatherLayer = layer;
    this.root.addChild(layer);
    const color = Number(`0x${weather.color.slice(1)}`);

    // 全螢幕天氣色調（低透明，但足以讓整幕變色）
    const tint = new Graphics();
    tint.rect(0, 0, STAGE_W, STAGE_H).fill({ color, alpha: 0.07 });
    tint.blendMode = 'add';
    layer.addChild(tint);
    gsap.fromTo(tint, { alpha: 0.6 }, { alpha: 1, duration: 2.2, yoyo: true, repeat: -1, ease: 'sine.inOut' });

    // 頂部柔光
    const glow = new Graphics();
    for (let i = 8; i >= 1; i -= 1) {
      const t = i / 8;
      glow.ellipse(STAGE_W / 2, -40, STAGE_W * 0.55 * t, 150 * t).fill({ color, alpha: 0.035 });
    }
    glow.blendMode = 'add';
    layer.addChild(glow);

    if (weather.id === 'rain') {
      // 暴雨：整幕斜落雨絲（快速循環）——最直觀的「正在下雨」
      for (let i = 0; i < 34; i += 1) {
        const drop = new Graphics();
        const len = 22 + Math.random() * 16;
        drop.moveTo(0, 0).lineTo(-5, len).stroke({ width: 2, color: 0xbfe0ff, alpha: 0.5 });
        drop.blendMode = 'add';
        const x0 = Math.random() * (STAGE_W + 120);
        const y0 = -40 - Math.random() * STAGE_H;
        drop.position.set(x0, y0);
        layer.addChild(drop);
        const dur = 0.7 + Math.random() * 0.5;
        gsap.to(drop, {
          y: STAGE_H + 60, x: x0 - 90,
          duration: dur, delay: Math.random() * dur, repeat: -1, ease: 'none',
        });
      }
      return;
    }
    if (weather.id === 'sunny') {
      // 烈日：右上角旋轉光束扇（緩慢擺動）＋上升熱屑
      const rays = new Container();
      rays.position.set(STAGE_W * 0.78, -30);
      for (let i = 0; i < 4; i += 1) {
        const ray = new Graphics();
        ray.moveTo(0, 0).lineTo(-90 - i * 34, STAGE_H * 1.1).lineTo(-160 - i * 34, STAGE_H * 1.1).closePath()
          .fill({ color: 0xffd98a, alpha: 0.05 + i * 0.012 });
        ray.blendMode = 'add';
        ray.rotation = -0.28 + i * 0.17;
        rays.addChild(ray);
      }
      layer.addChild(rays);
      gsap.to(rays, { rotation: 0.09, duration: 5.5, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      gsap.fromTo(rays, { alpha: 0.65 }, { alpha: 1, duration: 2.4, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    }
    if (weather.id === 'gale') {
      // 颶風：橫掃風痕（細長弧線快速掠過）
      for (let i = 0; i < 14; i += 1) {
        const streak = new Graphics();
        const len = 90 + Math.random() * 120;
        streak.moveTo(0, 0).quadraticCurveTo(len * 0.5, -7, len, 0).stroke({ width: 2, color: 0xc8ffd8, alpha: 0.4 });
        streak.blendMode = 'add';
        const y0 = 40 + Math.random() * (STAGE_H - 120);
        streak.position.set(-len - Math.random() * STAGE_W, y0);
        layer.addChild(streak);
        const dur = 0.9 + Math.random() * 0.7;
        gsap.to(streak, {
          x: STAGE_W + len, duration: dur, delay: Math.random() * dur * 1.6,
          repeat: -1, ease: 'none',
        });
      }
    }
    // 烈日/颶風共用：漂浮光屑（熱屑上升/葉屑橫飄的補充層次）
    if (!this._dotTex) return;
    const drift = weather.id === 'gale' ? 'side' : 'up';
    for (let i = 0; i < 12; i += 1) {
      const p = new Sprite(this._dotTex);
      p.anchor.set(0.5);
      p.blendMode = 'add';
      p.tint = color;
      p.alpha = 0;
      const x0 = Math.random() * STAGE_W;
      const y0 = 60 + Math.random() * (STAGE_H - 160);
      p.scale.set(0.3 + Math.random() * 0.3);
      p.position.set(x0, y0);
      layer.addChild(p);
      const dur = 4 + Math.random() * 3;
      const move = drift === 'side'
        ? { x: x0 + 260, y: y0 + (Math.random() * 60 - 30) }
        : { x: x0 + (Math.random() * 50 - 25), y: y0 - 190 };
      gsap.fromTo(p, { alpha: 0 }, { alpha: 0.7, duration: dur * 0.3, delay: i * 0.35, repeat: -1, repeatDelay: dur * 0.7, yoyo: false, ease: 'sine.out' });
      gsap.fromTo(p, { x: x0, y: y0 }, { ...move, duration: dur, delay: i * 0.4, repeat: -1, ease: 'none' });
    }
  }

  // 場地氛圍層：地面色帶 + 各場地專屬的常駐粒子（換場地時拆舊建新）。
  // 湧能磁場＝地面金環＋升騰能量光屑；侵蝕之地＝暗紫地霧脈動＋腐蝕光點；
  // 迷霧沼澤＝貼地橫飄霧帶。全部 additive、循環動畫，killFx 掃得到。
  _drawTerrain(terrainId) {
    if (this._terrainLayer) {
      killFx(this._terrainLayer);
      if (!this._terrainLayer.destroyed) this._terrainLayer.destroy({ children: true });
      this._terrainLayer = null;
    }
    const terrain = terrainOf(terrainId);
    if (!terrain) return;
    const layer = new Container();
    layer.zIndex = -880; // 天氣層(-890)之上、單位之下
    this._terrainLayer = layer;
    this.root.addChild(layer);
    const color = Number(`0x${terrain.color.slice(1)}`);

    // 共通：地面色帶（讓「整個地板」一眼看出場地屬性）
    const band = new Graphics();
    band.ellipse(STAGE_W / 2, GROUND_Y + 150, STAGE_W * 0.62, 190).fill({ color, alpha: 0.2 });
    band.ellipse(STAGE_W / 2, GROUND_Y + 150, STAGE_W * 0.45, 130).fill({ color, alpha: 0.16 });
    band.blendMode = 'add';
    layer.addChild(band);
    gsap.fromTo(band, { alpha: 0.7 }, { alpha: 1, duration: 1.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });

    if (terrain.id === 'surge') {
      // 湧能磁場：兩道地面符文環反向緩轉 + 升騰能量光屑
      const mkRing = (rx, ry, w, a) => {
        const g = new Graphics();
        g.ellipse(0, 0, rx, ry).stroke({ width: w, color, alpha: a });
        g.blendMode = 'add';
        g.x = STAGE_W / 2;
        g.y = GROUND_Y + 130;
        layer.addChild(g);
        return g;
      };
      // 透視橢圓不能繞 z 軸轉（會豎起來）——改用呼吸縮放交錯脈動
      const r1 = mkRing(STAGE_W * 0.34, 95, 3, 0.5);
      const r2 = mkRing(STAGE_W * 0.24, 66, 2, 0.4);
      gsap.fromTo(r1.scale, { x: 0.96, y: 0.96 }, { x: 1.04, y: 1.04, duration: 1.8, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      gsap.fromTo(r2.scale, { x: 1.05, y: 1.05 }, { x: 0.95, y: 0.95, duration: 1.4, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      gsap.fromTo(r1, { alpha: 0.35 }, { alpha: 0.65, duration: 1.8, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      for (let i = 0; i < 10; i += 1) {
        const p = new Sprite(this._dotTex);
        p.anchor.set(0.5);
        p.blendMode = 'add';
        p.tint = color;
        p.scale.set(0.25 + Math.random() * 0.3);
        const x0 = STAGE_W * (0.18 + Math.random() * 0.64);
        const y0 = GROUND_Y + 60 + Math.random() * 160;
        p.position.set(x0, y0);
        p.alpha = 0;
        layer.addChild(p);
        gsap.fromTo(p, { y: y0, alpha: 0 }, {
          y: y0 - 130, alpha: 0.8, duration: 2 + Math.random() * 1.5,
          delay: i * 0.35, repeat: -1, ease: 'power1.out',
        });
      }
    } else if (terrain.id === 'erosion') {
      // 侵蝕之地：暗紫地霧塊脈動 + 緩慢下沉的腐蝕光點
      for (let i = 0; i < 5; i += 1) {
        const fog = new Graphics();
        const w = 160 + Math.random() * 180;
        fog.ellipse(0, 0, w, 34).fill({ color, alpha: 0.18 });
        fog.blendMode = 'add';
        fog.position.set(STAGE_W * (0.12 + Math.random() * 0.76), GROUND_Y + 90 + Math.random() * 150);
        layer.addChild(fog);
        gsap.fromTo(fog, { alpha: 0.4 }, { alpha: 1, duration: 1.4 + Math.random(), yoyo: true, repeat: -1, delay: i * 0.4, ease: 'sine.inOut' });
        gsap.to(fog, { x: fog.x + 40, duration: 6 + Math.random() * 3, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      }
      for (let i = 0; i < 8; i += 1) {
        const p = new Sprite(this._dotTex);
        p.anchor.set(0.5);
        p.blendMode = 'add';
        p.tint = color;
        p.scale.set(0.2 + Math.random() * 0.25);
        const x0 = STAGE_W * (0.15 + Math.random() * 0.7);
        const y0 = GROUND_Y + 40;
        p.position.set(x0, y0);
        layer.addChild(p);
        gsap.fromTo(p, { y: y0, alpha: 0.7 }, {
          y: y0 + 150, alpha: 0, duration: 2.4 + Math.random(),
          delay: i * 0.45, repeat: -1, ease: 'power1.in',
        });
      }
    } else if (terrain.id === 'swamp') {
      // 迷霧沼澤：貼地霧帶橫向緩飄（雙層交錯）
      for (let i = 0; i < 6; i += 1) {
        const mist = new Graphics();
        const w = 220 + Math.random() * 200;
        mist.ellipse(0, 0, w, 26 + Math.random() * 14).fill({ color, alpha: 0.2 });
        mist.blendMode = 'add';
        const y0 = GROUND_Y + 70 + Math.random() * 180;
        mist.position.set(STAGE_W * Math.random(), y0);
        layer.addChild(mist);
        gsap.to(mist, {
          x: `+=${140 + Math.random() * 120}`, duration: 7 + Math.random() * 4,
          yoyo: true, repeat: -1, ease: 'sine.inOut', delay: i * 0.5,
        });
        gsap.fromTo(mist, { alpha: 0.5 }, { alpha: 1, duration: 2 + Math.random(), yoyo: true, repeat: -1, ease: 'sine.inOut' });
      }
    }
  }

  // 職業章材質：與卡面同款 SVG 轉 pixi 材質，app 層級快取（跨場景復用、不銷毀）。
  async _classBadgeTex(cls) {
    const key = `cls_${cls}`;
    this.app._uiIconTex ??= {};
    if (this.app._uiIconTex[key]) return this.app._uiIconTex[key];
    const svg = iconSvg(key);
    if (!svg) return null;
    try {
      const url = `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
      const tex = await Assets.load({ src: url, data: { resolution: 6 } }); // 高解析：13px 顯示也銳利
      this.app._uiIconTex[key] = tex;
      return tex;
    } catch {
      return null;
    }
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
    // ---- 靜態層：烤成 app 層級共用材質（每場重建場景不重烤，開場不卡幀）----
    if (!this.app._bgTexture) {
      this.app._bgTexture = this._bakeBackgroundTexture();
    }
    const bgSprite = new Sprite(this.app._bgTexture);
    bgSprite.zIndex = -1000;
    this.root.addChild(bgSprite);

    this._addAmbientLayers();
  }

  // 天幕 / 遠山兩層 / 地面 / 地平線微光 → 一張材質。
  _bakeBackgroundTexture() {
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

    const tex = this.app.renderer.generateTexture({
      target: bg,
      frame: new Rectangle(0, 0, STAGE_W, STAGE_H),
    });
    bg.destroy();
    return tex;
  }

  // ---- 動態層：雙方元素色柔光 + 微塵粒子 ----
  _addAmbientLayers() {
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

    // 頭頂資訊條：屬性外環 + 卡面同款職業章壓在中央 + 血條/能量條
    // ——外環顏色＝屬性、中央徽章＝職業（與卡面右下角職業章同一套 SVG）
    const infoBar = new Container();
    infoBar.y = -BODY_H - 16;
    const chipX = -BAR_W / 2 - 11;
    const chip = new Graphics();
    chip.circle(chipX, 5, 8.5).fill(color); // 屬性外環（比職業章大一圈）
    chip.circle(chipX, 5, 8.5).stroke({ color: 0x14101f, width: 1.5 });
    infoBar.addChild(chip);
    this._classBadgeTex(info.class).then((tex) => {
      if (!tex || c.destroyed || infoBar.destroyed) return;
      const badge = new Sprite(tex);
      badge.anchor.set(0.5);
      badge.width = 13;
      badge.height = 13;
      badge.position.set(chipX, 5);
      infoBar.addChild(badge);
    });
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
    if (b.kind === 'hot') return '💗';
    if (b.kind === 'thorns') return '🌿';
    if (b.kind === 'counter') return '↩';
    if (b.kind === 'castDrain') return '🌀';
    if (b.kind === 'element') return '🔮';
    if (b.kind === 'nightmare') return '😱';
    if (b.kind === 'debuffBlock') return '🧿';
    if (b.kind === 'mark') return '🎯';
    if (b.kind === 'cheatDeath') return '🕊';
    if (b.kind === 'control') {
      return b.control === 'silence' ? '🤫' : b.control === 'freeze' ? '❄' : '🎯';
    }
    const map = { atk: '⚔', def: '🛡', dmgTaken: '🛡', dotTaken: '🔥', critChance: '✨', critMult: '✨', dmgDealt: '💥', energyGain: '⚡', dodge: '💨', accuracy: '🎯', healTaken: '💊' };
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
      // 剩餘回合小數字（右下角標；無期限狀態不顯示）；格擋護符改顯示剩餘層數
      const badgeN = b.kind === 'debuffBlock' ? b.charges : b.turns;
      if (badgeN != null && badgeN > 0) {
        const badge = new Graphics();
        badge.circle(x + SIZE / 2 - 1, SIZE / 2 - 1, 5).fill({ color: 0x0b0d16, alpha: 0.95 });
        badge.circle(x + SIZE / 2 - 1, SIZE / 2 - 1, 5).stroke({ color: b.neg ? 0xff8a8a : 0x8ef2ae, width: 1, alpha: 0.7 });
        icons.addChild(badge);
        const n = new Text({
          text: String(Math.min(9, badgeN)),
          style: { fontSize: 7, fill: 0xffffff, fontWeight: '800' },
        });
        n.anchor.set(0.5);
        n.x = x + SIZE / 2 - 1;
        n.y = SIZE / 2 - 1;
        icons.addChild(n);
      }
    });
  }

  _bar(g, y, ratio, color, bgColor, glow = 0, ghostRatio = 0) {
    const x = -BAR_W / 2;
    g.roundRect(x - 1, y - 1, BAR_W + 2, 7, 3.5).fill({ color: 0x0b0d16, alpha: 0.9 });
    g.roundRect(x, y, BAR_W, 5, 2.5).fill(bgColor);
    // 掉血殘影：剛扣掉的血先以亮白段停留，再追上實際血量（讀傷害量用）
    if (ghostRatio > ratio) {
      g.roundRect(x, y, BAR_W * ghostRatio, 5, 2.5).fill({ color: 0xfff0d2, alpha: 0.85 });
    }
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
    // 殘影/預告環需要每幀時間差
    const now = performance.now();
    const dt = Math.min(0.05, (now - (this._tickLast ?? now)) / 1000);
    this._tickLast = now;

    for (const [uid, sprite] of this.sprites) {
      const info = sprite._info;
      const g = sprite._bars;
      const hp = this.replayer.hpOf(uid);
      const energy = this.replayer.energyOf(uid);
      const full = energy >= ENERGY_MAX;

      // 掉血殘影：只有「新傷害」（本幀血量比上一幀低）才重置停留 0.28s，
      // 之後殘影持續收攏直到追上實際血量——不會有白段永遠掛著。
      const gh = (sprite._ghost ??= { hp, lastHp: hp, hold: 0 });
      if (hp < gh.lastHp) gh.hold = 0.28;
      gh.lastHp = hp;
      if (hp > gh.hp) gh.hp = hp; // 治療直接跟上
      if (gh.hold > 0) gh.hold -= dt;
      else if (gh.hp > hp) gh.hp = Math.max(hp, gh.hp - info.maxHp * 1.8 * dt);

      // 大招預告：能量滿格 → 腳下亮起脈動金環
      if (full && !sprite._readyRing && this.replayer.aliveOf(uid)) {
        const ring = new Graphics();
        ring.ellipse(0, 2, 30, 9).stroke({ width: 2.5, color: 0xffd781, alpha: 0.9 });
        ring.ellipse(0, 2, 30, 9).fill({ color: 0xffd781, alpha: 0.1 });
        ring.blendMode = 'add';
        sprite.addChildAt(ring, 1); // 影之上
        sprite._readyRing = ring;
        gsap.to(ring, { alpha: 0.45, duration: 0.5, yoyo: true, repeat: -1, ease: 'sine.inOut' });
        gsap.fromTo(ring.scale, { x: 0.4, y: 0.4 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2)' });
      } else if ((!full || !this.replayer.aliveOf(uid)) && sprite._readyRing) {
        const ring = sprite._readyRing;
        sprite._readyRing = null;
        gsap.killTweensOf(ring);
        gsap.killTweensOf(ring.scale);
        if (!ring.destroyed) ring.destroy();
      }

      // 條只在數值/殘影變化時重繪（能量滿格的脈衝光暈需逐幀）
      const bs = (sprite._barState ??= { hp: -1, energy: -1, ghost: -1 });
      if (hp !== bs.hp || energy !== bs.energy || gh.hp !== bs.ghost || full) {
        bs.hp = hp;
        bs.energy = energy;
        bs.ghost = gh.hp;
        const hpRatio = info.maxHp > 0 ? hp / info.maxHp : 0;
        const ghostRatio = info.maxHp > 0 ? gh.hp / info.maxHp : 0;
        const hpColor = hpRatio > 0.5 ? 0x57d77a : hpRatio > 0.25 ? 0xf5c451 : 0xff6b6b;
        g.clear();
        this._bar(g, 0, hpRatio, hpColor, 0x232d26, 0, ghostRatio);
        this._bar(g, 8, Math.min(1, energy / ENERGY_MAX), 0xf5c451, 0x2e2a1c, full ? this._pulse.v : 0);
        // 超充段（100→200）：能量條上疊第二層金白光——溢出多少一眼可見
        const over = Math.max(0, Math.min(1, (energy - ENERGY_MAX) / ENERGY_MAX));
        if (over > 0) {
          g.roundRect(-BAR_W / 2, 8 - 1.5, BAR_W * over, 3, 1.5).fill({ color: 0xfff2c8, alpha: 0.95 });
        }
      }

      const buffs = this.replayer.buffsOf(uid);
      const buffKey = buffs.map((b) => `${b.kind}:${b.stat || b.control || b.element || ''}:${b.neg ? 1 : 0}:${b.turns ?? ''}`).join(',');
      if (buffKey !== sprite._buffKey) {
        sprite._buffKey = buffKey;
        this._rebuildBuffIcons(sprite, buffs);
      }
      // 狀態常駐體表特效（護盾罩/荊棘/餘燼…）：死亡或瞬時模式全拆
      syncStatusAuras(sprite, this._instant || !this.replayer.aliveOf(uid) ? [] : buffs, this._dotTex);

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
      rp.on('attack', ({ attackerUid, targetUid }) => {
        if (this._instant) return;
        const s = this.sprites.get(attackerUid);
        if (!s) return;
        const dir = s._info.team === 0 ? 1 : -1;
        const t = targetUid != null ? this.sprites.get(targetUid) : null;
        playVoice(s._info.cardId, 'attack'); // 普攻語音（抽播；無音檔＝靜默）
        if (!t) {
          lunge(s, dir);
          return;
        }
        // 普攻型態：卡片資料 attackStyle 優先，未標時退回職業判定（support=遠程）
        const style = CARDS[s._info.cardId]?.attackStyle ?? (s._info.class === 'support' ? 'ranged' : 'melee');
        if (style === 'ranged') {
          // 遠程：原地前傾＋發射元素光彈（飛行 0.24s，約與 damage 事件同步命中）
          const color = ELEMENT_COLOR[s._info.element] || 0xffffff;
          bolt(this.fxLayer, s.x + dir * 24, this._chestY(s), t.x, this._chestY(t), color, this._dotTex);
          lunge(s, dir);
        } else {
          // 近戰：突進到目標面前揮擊（期間抬高 zIndex 蓋過沿路單位）
          s.zIndex = 800;
          meleeDash(s, t.x, t.y, dir);
          fxDelay(0.85, () => {
            // 聚光燈期間被點亮者不在此覆蓋（收燈時會統一還原）
            if (!s.destroyed && !this._ultRaised?.has(s)) s.zIndex = s._homeY ?? s.y;
          });
        }
      }),
      rp.on('ultimate', ({ casterUid, skill, targetUid, overcharge }) => {
        if (this._instant) return;
        const s = this.sprites.get(casterUid);
        if (!s) return;
        const info = s._info;
        const color = ELEMENT_COLOR[info.element] ?? 0xffffff;
        // 超充施放：溢出能量轉直傷倍率——金色比例標讓玩家看見「多充的沒白費」
        if (overcharge > 1) {
          const txt = new Text({
            text: `超充 ${Math.round(overcharge * 100)}%！`,
            style: { fontSize: 22, fill: 0xffd54a, fontWeight: '800', stroke: { color: 0x000000, width: 4 } },
          });
          floatText(this.fxLayer, s.x, this._chestY(s) - 46, txt);
        }
        // 聚光燈演出：全場壓暗、施放者置頂 + 施法法陣 + 技能名小標籤（貼施放者旁）
        const timing = ultTiming(skill);
        this._ultTail = timing.impactTail; // 每技能不同的命中餘韻
        this._beginUltSpotlight(s, color, SKILLS[skill]?.name ?? skill, timing.hold);
        if (targetUid != null) this._spotlightTarget(this.sprites.get(targetUid));
        this._ultColor = color;
        ultPulse(s, s._body, color);
        castCircle(s, color);
        // 依技能資料派生施放特效：瞄準主目標；rowMidY/rowSpan＝敵縱列視覺中心/跨距（火牆、彈幕用）
        casterVfx(
          {
            fxLayer: this.fxLayer,
            dotTex: this._dotTex,
            rowMidY: GROUND_Y + 40 + 82 - 60,
            rowSpan: 250,
          },
          s,
          skill,
          color,
          targetUid != null ? this.sprites.get(targetUid) : null
        );
        playVoice(s._info.cardId, 'ultimate'); // 絕技語音（無音檔＝靜默）
        screenShake(this.root);
      }),
      rp.on('damage', ({ targetUid, amount, skill, isCrit, isAdvantage, isDisadvantage, trueDmg, execute, detonate, nightmare, element }) => {
        if (this._instant) return;
        const s = this.sprites.get(targetUid);
        if (!s) return;
        // 絕技窗內被打的目標 → 點亮 + 依技能派生受擊特效 + 地面爆光；命中重設餘韻計時
        if (this._ultDim) {
          this._spotlightTarget(s);
          if (skill && skill !== 'normal') targetVfx({ dotTex: this._dotTex }, s, skill, this._ultColor ?? 0xffffff);
          impactBurst(this.fxLayer, s.x, s.y, this._ultColor ?? 0xff8a6a, this._dotTex);
          this._refreshUltTimer(this._ultTail ?? 0.5);
        }
        const pushDir = s._info.team === 0 ? -1 : 1;
        hitFlash(s, s._body, pushDir);
        spark(this.fxLayer, s.x, this._chestY(s), isCrit ? 0xffa940 : 0xffd27a, this._dotTex, isCrit ? 14 : 8);
        let text;
        let size;
        let color;
        if (execute) {
          // 處決：血紅大 X 斬 + 重拍
          executeSlash(s);
          text = `處決 ${amount}`;
          size = 32;
          color = 0xff4d4d;
          screenShake(this.root, 6);
        } else if (detonate) {
          // 引爆 DoT：橙紅重拍 + 爆點
          impactBurst(this.fxLayer, s.x, this._chestY(s), 0xff7a3c, this._dotTex);
          text = `引爆 ${amount}`;
          size = 28;
          color = 0xff7a3c;
          screenShake(this.root, 5);
        } else if (isCrit) {
          // 暴擊：同屬性色放大（無屬性＝白）
          text = `暴擊 ${amount}`;
          size = 30;
          color = DMG_ELEMENT_COLOR[element] ?? 0xffffff;
          screenShake(this.root, 4);
        } else if (nightmare) {
          // 惡夢印記加傷：暗紫小標
          text = `惡夢 ${amount}`;
          size = 20;
          color = 0xbb8cff;
        } else if (skill === 'thorns') {
          // 荊棘反傷：綠刺爆射，浮字標明來源
          thornsBurst(s);
          text = `荊棘 ${amount}`;
          size = 20;
          color = 0x9dde6a;
        } else if (skill === 'counter') {
          // 反擊回敬：亮橙小標
          text = `反擊 ${amount}`;
          size = 22;
          color = 0xffb066;
        } else if (trueDmg) {
          // 真實傷害：金白貫穿針
          pierceFlash(s);
          text = `${amount}`;
          size = 24;
          color = 0xfff2c8;
        } else {
          // 一般傷害：字色＝攻擊者屬性（風＝森林綠、無屬性＝白）；剋制命中微放大
          color = DMG_ELEMENT_COLOR[element] ?? 0xffffff;
          size = isAdvantage ? 24 : 20;
          if (isDisadvantage) size = 17;
          text = `${amount}`;
        }
        const txt = new Text({
          text,
          style: { fontSize: size, fill: color, fontWeight: '800', stroke: { color: 0x000000, width: 3 } },
        });
        floatText(this.fxLayer, s.x, this._chestY(s) - 20, txt);
      }),
      rp.on('heal', ({ targetUid, amount, kind, isCrit }) => {
        if (this._instant) return;
        const s = this.sprites.get(targetUid);
        if (!s) return;
        if (this._ultDim) {
          this._spotlightTarget(s);
          if (kind !== 'hot') targetVfx({ dotTex: this._dotTex }, s, null, HEAL_GREEN, { heal: true });
          this._refreshUltTimer(this._ultTail ?? 0.5);
        }
        let fill = HEAL_GREEN; // 治療＝亮綠（風屬傷害是森林綠，兩者區分）
        let size = 20;
        if (kind === 'lifesteal') {
          // 吸血：血色光點收束入體，浮字帶血色
          drainMotes(s, this._dotTex);
          fill = 0xe0567a;
        } else if (kind === 'hot') {
          // 持續回復跳字：小而輕，不搶普通治療的戲
          size = 15;
          spark(this.fxLayer, s.x, this._chestY(s), HEAL_GREEN, this._dotTex, 3);
        }
        if (isCrit) size = 28; // 治療暴擊：亮綠放大（前綴「暴擊」）
        if (kind !== 'hot') spark(this.fxLayer, s.x, this._chestY(s), kind === 'lifesteal' ? 0xe0567a : HEAL_GREEN, this._dotTex, isCrit ? 12 : 6);
        const txt = new Text({
          text: `${isCrit ? '暴擊 ' : ''}+${amount}`,
          style: { fontSize: size, fill, fontWeight: '800', stroke: { color: 0x000000, width: 3 } },
        });
        floatText(this.fxLayer, s.x, this._chestY(s) - 20, txt);
      }),
      rp.on('dispel', ({ uid, what }) => {
        if (this._instant) return;
        const s = this.sprites.get(uid);
        if (!s) return;
        // 淨化（洗隊友減益）＝白光環；驅散（拆敵方增益）＝紫光環
        purifyBurst(s, this._dotTex, { hostile: what === 'buff' });
        if (this._ultDim) {
          this._spotlightTarget(s);
          this._refreshUltTimer(this._ultTail ?? 0.5);
        }
        const txt = new Text({
          text: what === 'buff' ? '驅散' : '淨化',
          style: { fontSize: 18, fill: what === 'buff' ? 0xc9a7ff : 0xf4fbff, fontWeight: '800', stroke: { color: 0x000000, width: 3 } },
        });
        floatText(this.fxLayer, s.x, this._chestY(s) - 32, txt);
      }),
      rp.on('stunned', ({ uid }) => {
        if (this._instant) return;
        const s = this.sprites.get(uid);
        if (!s) return;
        const txt = new Text({
          text: '沉默',
          style: { fontSize: 20, fill: 0xbb8cff, fontWeight: '800', stroke: { color: 0x000000, width: 3 } },
        });
        floatText(this.fxLayer, s.x, this._chestY(s) - 20, txt);
      }),
      rp.on('death', ({ uid }) => {
        if (this._instant) return;
        const s = this.sprites.get(uid);
        if (s && !this._dead.has(uid)) {
          this._dead.add(uid);
          deathFade(s, this._greyFilter);
          // 終結演出：擊殺最後一名敵人 → hit-stop（事件暫停）+ 推鏡
          if (s._info.team === 1) {
            const left = this.setup.filter((u) => u.team === 1 && this.replayer.aliveOf(u.uid)).length;
            if (left === 0) this._finisher();
          }
        }
      }),
      rp.on('revive', ({ uid }) => {
        if (this._instant) return;
        const s = this.sprites.get(uid);
        if (!s) return;
        this._dead.delete(uid);
        resetVisual(s); // 清灰階/傾倒/透明
        if (s._ghost) { s._ghost.hp = this.replayer.hpOf(uid); s._ghost.lastHp = s._ghost.hp; }
        // 復活演出：金色光柱 + 腳底法陣 + 光屑（比一般治療隆重一級）
        const pillar = lightPillar(s, 0xffe3a0); // 限時回收（repeat:-1 呼吸不能留到場景結束）
        fxDelay(1.3, () => {
          if (pillar.destroyed) return;
          killFx(pillar);
          gsap.killTweensOf(pillar);
          gsap.killTweensOf(pillar.scale);
          pillar.destroy({ children: true });
        });
        castCircle(s, 0xffd27a, { radius: 40 });
        spark(this.fxLayer, s.x, this._chestY(s), 0x8ef2ae, this._dotTex, 12);
        const txt = new Text({
          text: '復活！',
          style: { fontSize: 24, fill: 0x8ef2ae, fontWeight: '800', stroke: { color: 0x000000, width: 3 } },
        });
        floatText(this.fxLayer, s.x, this._chestY(s) - 20, txt);
        if (this._ultDim) this._spotlightTarget(s);
      }),
      rp.on('weather', ({ id, uid }) => {
        if (this._instant) return;
        this._drawWeather(id);
        const w = weatherOf(id);
        if (!w) return;
        this._envAnnounce(uid, w.color, `${w.name}降臨！`);
      }),
      rp.on('terrain', ({ id, uid }) => {
        if (this._instant) return;
        this._drawTerrain(id);
        const t = terrainOf(id);
        if (!t) return;
        this._envAnnounce(uid, t.color, `場地：${t.name}`);
      }),
      rp.on('miss', ({ targetUid }) => {
        if (this._instant) return;
        const s = this.sprites.get(targetUid);
        if (!s) return;
        // 迴避身體語言：朝後方快速側移再彈回。
        // 若本體正在補間（例如自己的突進攻擊還沒回位）就只飄字——
        // 不可 killTweensOf 打斷回位補間，否則棋子會卡在半路。
        const dir = s._info.team === 0 ? -1 : 1;
        if (!gsap.isTweening(s)) {
          const x0 = s._homeX ?? s.x;
          gsap.timeline()
            .to(s, { x: x0 + dir * 26, duration: 0.08, ease: 'power2.out' })
            .to(s, { x: x0, duration: 0.22, ease: 'power2.inOut' });
        }
        const txt = new Text({
          text: 'MISS',
          style: { fontSize: 18, fill: 0xbfe8d8, fontStyle: 'italic', fontWeight: '800', stroke: { color: 0x000000, width: 3 } },
        });
        floatText(this.fxLayer, s.x, this._chestY(s) - 20, txt);
      }),
      rp.on('resist', ({ uid }) => {
        if (this._instant) return;
        const s = this.sprites.get(uid);
        if (!s) return;
        const txt = new Text({ text: '抵抗', style: { fontSize: 17, fill: 0x9aa3b8, fontWeight: '800', stroke: { color: 0x000000, width: 3 } } });
        floatText(this.fxLayer, s.x, this._chestY(s) - 26, txt);
      }),
      rp.on('blocked', ({ uid }) => {
        if (this._instant) return;
        const s = this.sprites.get(uid);
        if (!s) return;
        const txt = new Text({ text: '免疫', style: { fontSize: 18, fill: 0x7fd4c8, fontWeight: '800', stroke: { color: 0x000000, width: 3 } } });
        floatText(this.fxLayer, s.x, this._chestY(s) - 26, txt);
        purifyBurst(s, this._dotTex, { hostile: false }); // 護符閃光
      }),
      rp.on('cheated', ({ uid }) => {
        if (this._instant) return;
        const s = this.sprites.get(uid);
        if (!s) return;
        const txt = new Text({ text: '免死！', style: { fontSize: 24, fill: 0xffe9b0, fontWeight: '900', stroke: { color: 0x000000, width: 4 } } });
        floatText(this.fxLayer, s.x, this._chestY(s) - 30, txt);
        spark(this.fxLayer, s.x, this._chestY(s), 0xffe9b0, this._dotTex, 10);
      }),
      rp.on('bossPhase', ({ uid, phase }) => {
        if (this._instant) return;
        const s = this.sprites.get(uid);
        const txt = new Text({ text: `⚠ Boss 第 ${phase + 1} 階段！`, style: { fontSize: 30, fill: 0xff6b5c, fontWeight: '900', letterSpacing: 3, stroke: { color: 0x000000, width: 5 } } });
        floatText(this.fxLayer, STAGE_W / 2, STAGE_H * 0.28, txt);
        if (s) { ultPulse(s, s._body, 0xff6b5c); screenShake(this.root, 6); }
      }),
      rp.on('bossBreak', ({ uid }) => {
        if (this._instant) return;
        const s = this.sprites.get(uid);
        if (!s) return;
        const txt = new Text({ text: '破防！', style: { fontSize: 26, fill: 0xffb066, fontWeight: '900', stroke: { color: 0x000000, width: 4 } } });
        floatText(this.fxLayer, s.x, this._chestY(s) - 34, txt);
        hitFlash(s._body);
        screenShake(this.root, 5);
      }),
      rp.on('bossEnrage', ({ uid }) => {
        if (this._instant) return;
        const s = this.sprites.get(uid);
        const txt = new Text({ text: '🔥 狂暴！', style: { fontSize: 30, fill: 0xff4d3a, fontWeight: '900', letterSpacing: 3, stroke: { color: 0x000000, width: 5 } } });
        floatText(this.fxLayer, STAGE_W / 2, STAGE_H * 0.28, txt);
        if (s) { ultPulse(s, s._body, 0xff4d3a); screenShake(this.root, 7); }
      }),
      rp.on('trigger', ({ uid, name }) => {
        if (this._instant) return;
        const s = this.sprites.get(uid);
        if (!s) return;
        const txt = new Text({
          text: `⚡ ${name ?? '觸發'}`,
          style: { fontSize: 17, fill: 0xffd54a, fontWeight: '800', stroke: { color: 0x000000, width: 3 } },
        });
        floatText(this.fxLayer, s.x, this._chestY(s) - 38, txt);
      }),
      rp.on('steal', ({ fromUid, toUid, amount }) => {
        if (this._instant) return;
        const from = this.sprites.get(fromUid);
        const to = toUid != null ? this.sprites.get(toUid) : null;
        if (from) {
          drainMotes(from, this._dotTex); // 能量被抽走的收束光點
          const txt = new Text({
            text: `竊能 -${amount}`,
            style: { fontSize: 18, fill: 0xc9a7ff, fontWeight: '800', stroke: { color: 0x000000, width: 3 } },
          });
          floatText(this.fxLayer, from.x, this._chestY(from) - 14, txt);
        }
        if (to) {
          const txt = new Text({
            text: `+${amount} 能量`,
            style: { fontSize: 18, fill: 0x7ad7ff, fontWeight: '800', stroke: { color: 0x000000, width: 3 } },
          });
          floatText(this.fxLayer, to.x, this._chestY(to) - 14, txt);
        }
      }),
      rp.on('drain', ({ uid, amount }) => {
        if (this._instant) return;
        const s = this.sprites.get(uid);
        if (!s) return;
        const txt = new Text({
          text: `干擾 -${amount}`,
          style: { fontSize: 17, fill: 0xb48cff, fontWeight: '800', stroke: { color: 0x000000, width: 3 } },
        });
        floatText(this.fxLayer, s.x, this._chestY(s) - 14, txt);
      }),
      rp.on('battleEnd', () => this._endUltSpotlight())
    );
  }

  // 終結演出：凍結事件流 0.85s（gate 全擋）、鏡頭推近再收回——最後一擊的拍點。
  _finisher() {
    if (this._finisherHold) return;
    this._finisherHold = true;
    this._endUltSpotlight();
    screenShake(this.root, 9);
    gsap.to(this.root.scale, { x: 1.12, y: 1.12, duration: 0.45, ease: 'power2.out' });
    this._finTimer = gsap.delayedCall(0.85, () => {
      this._finisherHold = false;
      gsap.to(this.root.scale, { x: 1, y: 1, duration: 0.45, ease: 'power2.inOut' });
    });
  }

  // director gate：聚光燈亮著時擋「下一個單位的回合」；終結演出時全擋（hit-stop）。
  gateEvent(entry) {
    if (this._finisherHold) return true;
    return !!this._ultDim && entry.type === 'turn';
  }

  // 重設收燈計時（施放時保底 / 每次命中後餘韻）；隨戰鬥倍速縮放。
  _refreshUltTimer(delayS) {
    this._ultTimer?.kill();
    this._ultTimer = fxDelay(delayS, () => this._endUltSpotlight());
  }

  // ---- 絕技聚光燈：全場壓暗（Z_DIM），施放者/被打目標抬到壓暗層之上 ----
  _beginUltSpotlight(casterSprite, color, skillName, holdS = 1.5) {
    this._endUltSpotlight(true); // 前一發未收尾就先收

    const dim = new Graphics();
    dim.rect(0, 0, STAGE_W, STAGE_H).fill({ color: 0x05060c, alpha: 1 });
    dim.alpha = 0;
    dim.zIndex = Z_DIM;
    this.root.addChild(dim);
    fxTo(dim, { alpha: ULT_DIM_ALPHA, duration: ULT_DIM_IN_S, ease: 'power1.out' });
    this._ultDim = dim;
    this._ultRaised = new Set();

    // 其他單位一律壓回景深層級（突進攻擊的臨時 zIndex=800 可能還沒還原，
    // 否則上一個攻擊者會浮在壓暗層之上跟著發光）
    for (const sp of this.sprites.values()) {
      if (sp !== casterSprite && !sp.destroyed) sp.zIndex = sp._homeY ?? sp.y;
    }
    casterSprite.zIndex = Z_SPOT_CASTER;
    this._ultRaised.add(casterSprite);

    // 施放者背後光柱（窗內常駐，收燈時拆）
    this._ultPillar = lightPillar(casterSprite, color);

    // 技能名小標籤：貼施放者旁（朝戰場中心側），黑底金字，非全寬（參考原型）
    const dir = casterSprite._info.team === 0 ? 1 : -1;
    const tag = new Container();
    const label = new Text({
      text: skillName,
      style: { fontSize: 26, fill: 0xffe9b0, fontWeight: '900', letterSpacing: 4, stroke: { color: 0x0c0e14, width: 4 } },
    });
    label.anchor.set(0.5);
    const padX = 18;
    const bg = new Graphics();
    bg.roundRect(-label.width / 2 - padX, -20, label.width + padX * 2, 40, 8).fill({ color: 0x0a0d1a, alpha: 0.85 });
    bg.roundRect(-label.width / 2 - padX, -20, label.width + padX * 2, 40, 8).stroke({ color, width: 1.5, alpha: 0.7 });
    tag.addChild(bg);
    tag.addChild(label);
    tag.x = casterSprite.x + dir * 30;
    tag.y = this._chestY(casterSprite) - 42;
    tag.alpha = 0;
    tag.scale.set(0.6);
    this.fxLayer.addChild(tag);
    this._ultTag = tag;
    fxTl()
      .to(tag, { alpha: 1, duration: 0.14, ease: 'power1.out' }, 0)
      .to(tag.scale, { x: 1, y: 1, duration: 0.24, ease: 'back.out(1.8)' }, 0);

    this._refreshUltTimer(holdS);
  }

  // 窗內把目標抬到壓暗層之上（施放者保持最上）。
  _spotlightTarget(sprite) {
    if (!this._ultDim || !sprite || sprite.destroyed) return;
    if (this._ultRaised.has(sprite)) return;
    sprite.zIndex = Z_SPOT_TARGET;
    this._ultRaised.add(sprite);
  }

  _endUltSpotlight(instant = false) {
    this._ultTimer?.kill();
    this._ultTimer = null;
    if (this._ultPillar) {
      const pillar = this._ultPillar;
      this._ultPillar = null;
      gsap.killTweensOf(pillar);
      if (instant) {
        if (!pillar.destroyed) pillar.destroy({ children: true });
      } else {
        gsap.to(pillar, {
          alpha: 0,
          duration: 0.25,
          onComplete: () => {
            if (!pillar.destroyed) pillar.destroy({ children: true });
          },
        });
      }
    }
    if (this._ultTag) {
      const tag = this._ultTag;
      this._ultTag = null;
      gsap.killTweensOf(tag);
      gsap.killTweensOf(tag.scale);
      if (instant) {
        if (!tag.destroyed) tag.destroy({ children: true });
      } else {
        gsap.to(tag, {
          alpha: 0,
          y: tag.y - 14,
          duration: 0.2,
          ease: 'power1.in',
          onComplete: () => {
            if (!tag.destroyed) tag.destroy({ children: true });
          },
        });
      }
    }
    if (this._ultRaised) {
      for (const s of this._ultRaised) {
        if (!s.destroyed) s.zIndex = s._homeY ?? s.y; // 還原景深排序
      }
      this._ultRaised = null;
    }
    if (this._ultDim) {
      const dim = this._ultDim;
      this._ultDim = null;
      gsap.killTweensOf(dim);
      if (instant) {
        if (!dim.destroyed) dim.destroy();
      } else {
        fxTo(dim, {
          alpha: 0,
          duration: ULT_DIM_OUT_S,
          ease: 'power1.in',
          onComplete: () => {
            if (!dim.destroyed) dim.destroy();
          },
        });
      }
    }
  }

  setInstant(v) {
    this._instant = v;
    if (v) {
      this._endUltSpotlight(true); // 跳過時立即收掉壓暗層
      this._finTimer?.kill();
      this._finisherHold = false;
      gsap.killTweensOf(this.root.scale);
      this.root.scale.set(1);
    }
  }

  destroy() {
    this._destroyed = true;
    this._endUltSpotlight(true);
    this._finTimer?.kill();
    gsap.killTweensOf(this.root.scale);
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
    killFx(this.root); // 掃 root 全部子樹（天氣氛圍層的 repeat:-1 光屑、宣告壓暗層等）
    gsap.killTweensOf(this.root);
    this.root.destroy({ children: true });
    this.fxLayer.destroy({ children: true });
    this._dotTex = null; // 共享材質不銷毀（掛在 app 上，跨場景復用）
  }
}
