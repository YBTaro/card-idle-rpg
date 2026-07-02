// 戰鬥場景：6 固定位置(前3後3)，由 setup 建場並訂閱 Replayer 事件播放 GSAP 特效，
// 每幀依 replayer 狀態刷新 HP / 能量條。不依賴 engine/Unit，僅吃可序列化 log 資料。
import { gsap } from 'gsap';
import { Container, Graphics, Sprite, Assets, Text } from 'pixi.js';
import { STAGE_W, STAGE_H } from './pixiApp.js';
import { ENERGY_MAX } from '../battle/unit.js';
import { SKILLS } from '../battle/skills.js';
import { artFor } from '../data/assets.js';
import {
  lunge,
  hitFlash,
  ultPulse,
  floatText,
  deathFade,
  cutIn,
  screenShake,
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

// 兩個 0xRRGGBB 顏色間線性插值（t 0..1），用於天幕漸層。
function lerpColor(a, b, t) {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

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
    this._glows = []; // 背景柔光暈（destroy 時需 killTweensOf）

    app.stage.addChild(this.root);
    app.stage.addChild(this.fxLayer);

    this._drawBackground();
    this._buildUnits();
    this._bindEvents();
  }

  _drawBackground() {
    const bg = new Graphics();
    bg.zIndex = -1000; // 背景永遠在最底層

    // 垂直漸層天幕：多段 rect 由上（暮藍）到下（暖紫）疊出療癒暖調漸層。
    const skyTop = 0x141a2b;
    const skyBottom = 0x2d2542;
    const bands = 16;
    for (let i = 0; i < bands; i += 1) {
      const t = i / (bands - 1);
      const color = lerpColor(skyTop, skyBottom, t);
      const h = Math.ceil(STAGE_H / bands) + 1;
      bg.rect(0, Math.floor((i * STAGE_H) / bands), STAGE_W, h).fill(color);
    }

    // 地平帶：y ~55% 起，同樣用漸層帶（硬邊平塗會出現生硬接縫），
    // 地平線處比天幕底稍亮、往下收暗，交界再壓一條極淡暖金光當地平線。
    const groundY = STAGE_H * 0.55;
    const groundTop = 0x3b3454;
    const groundBottom = 0x232032;
    const gBands = 12;
    const gH = STAGE_H - groundY;
    for (let i = 0; i < gBands; i += 1) {
      const t = i / (gBands - 1);
      const color = lerpColor(groundTop, groundBottom, t);
      const h = Math.ceil(gH / gBands) + 1;
      bg.rect(0, Math.floor(groundY + (i * gH) / gBands), STAGE_W, h).fill(color);
    }
    bg.rect(0, groundY - 1, STAGE_W, 2).fill({ color: 0xf5c451, alpha: 0.08 });

    // 2~3 條淡透視地面線（愈往下愈寬，模擬透視）。
    const lines = [0.66, 0.78, 0.92];
    for (const ly of lines) {
      const y = STAGE_H * ly;
      const inset = (1 - ly) * STAGE_W * 0.35;
      bg
        .moveTo(inset, y)
        .lineTo(STAGE_W - inset, y)
        .stroke({ color: 0x8a80a8, width: 1, alpha: 0.08 });
    }

    this.root.addChild(bg);

    // 2 個柔光暈（元素色大圓 alpha ~0.06），GSAP 慢速漂移 yoyo。
    const teamColorOf = (team) => {
      const u = this.setup.find((s) => s.team === team);
      return (u && ELEMENT_COLOR[u.element]) || (team === 0 ? 0xff7d5c : 0x6cb2ff);
    };
    const glowSpecs = [
      { x: STAGE_W * 0.26, y: STAGE_H * 0.32, color: teamColorOf(0) },
      { x: STAGE_W * 0.74, y: STAGE_H * 0.32, color: teamColorOf(1) },
    ];
    for (const spec of glowSpecs) {
      const glow = new Graphics();
      // 多圈同心圓疊出徑向衰減——單一平塗大圓沒有衰減，看起來是一塊色盤而非柔光。
      const rings = [
        [55, 0.045],
        [90, 0.03],
        [125, 0.02],
        [160, 0.012],
      ];
      for (const [r, a] of rings) glow.circle(0, 0, r).fill({ color: spec.color, alpha: a });
      glow.x = spec.x;
      glow.y = spec.y;
      glow.zIndex = -999;
      this.root.addChild(glow);
      this._glows.push(glow);
      gsap.to(glow, {
        x: spec.x + (Math.random() * 60 - 30),
        y: spec.y + (Math.random() * 40 - 20),
        duration: 7 + Math.random() * 4,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      });
    }
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

  _makeSprite(info) {
    const c = new Container();
    c._info = info;

    // 腳底橢圓影（最底層，index 0）。緊貼圓底、比條窄，避免和血條疊成「重影」。
    const shadow = new Graphics();
    shadow.ellipse(0, R + 3, 22, 5.5).fill({ color: 0x000000, alpha: 0.22 });
    c.addChild(shadow);

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
    c._glyph = glyph;

    // 有卡圖 → async 載入後以圓形遮罩 Sprite 換掉程序化圓的填色部分。
    this._loadArt(c, info);

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

    return c;
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
        // cover 縮放：短邊填滿直徑 2R，置中。
        const short = Math.min(tex.width, tex.height) || 2 * R;
        img.scale.set((2 * R) / short);

        // 圓形遮罩（需掛進顯示樹才生效）。
        const mask = new Graphics().circle(0, 0, R).fill(0xffffff);
        c.addChild(mask);
        img.mask = mask;

        // 影(0) 之上、body 之下插入圖，讓 body 的外圈 stroke 仍框住圖。
        const bodyIdx = c.getChildIndex(c._body);
        c.addChildAt(img, bodyIdx);

        // body 只留外圈 stroke（清掉填色圓）；符號隱藏。
        c._body.clear();
        c._body.circle(0, 0, R).stroke({ color: 0x0c0e14, width: 3 });
        if (c._glyph) c._glyph.visible = false;

        // hitFlash / ultPulse tint 對象改為圖（Sprite 支援 tint）。
        c._body = img;
        c._artMask = mask;
      })
      .catch(() => {
        // 載入失敗：silently 留程序化圓。
      });
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
    this._destroyed = true; // 阻擋仍在飛行的 async 載圖回填已拆場景
    this._unsubs.forEach((fn) => fn());
    this._unsubs = [];
    // 停掉背景柔光暈的漂移 tween（作用於 root 子物件，需在 root 銷毀前殺）。
    for (const glow of this._glows) gsap.killTweensOf(glow);
    this._glows = [];
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
