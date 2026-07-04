// 召喚揭曉儀式 3D 版（Three.js + GSAP）：
//   蓄力（法陣傳送門升起、粒子匯聚、Bloom 蓄能）→ 爆發（白閃 + 鏡頭推震）→
//   卡背自傳送門弧線飛出定位 → 逐張 3D 翻面（稀有卡金光預告 + 金粒爆 + Bloom 脈衝）。
// 卡面/卡背/素材面都烘成 CanvasTexture（含名牌、NEW/重複標記），無需 DOM 投影。
// 對外 API 與舊版相同：openSummonCeremony(results, { times, onAgain, ticketsLeft })。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { gsap } from 'gsap';
import { el, clear, fmt } from './dom.js';
import { CARDS } from '../data/cards.js';
import { MATERIALS } from '../data/materials.js';
import { artFor } from '../data/assets.js';

/* ---------------- 演出常數 ---------------- */
const CHARGE_S = 0.65; // 法陣蓄力
const BURST_S = 0.18; // 白閃爆發
const FLY_S = 0.55; // 卡背飛出
const FLY_STAGGER_S = 0.07;
const FLIP_S = 0.42; // 單張翻面
const FLIP_STAGGER_S = 0.12;
const RARE_HINT_S = 0.34; // 稀有卡翻面前金光抖動
const CARD_W = 1.28;
const CARD_H = CARD_W * (4 / 3);
const GRID_GAP_X = 1.52;
const BLOOM_BASE = 0.85;
const BLOOM_BURST = 2.6;
const GOLD = 0xffd781;

const ELEMENT_HEX = { fire: '#ff7d5c', wind: '#7fe497', water: '#6cb2ff', light: '#ffe789', dark: '#bb8cff' };

export function openSummonCeremony(results, { times = results.length, onAgain, ticketsLeft } = {}) {
  const ov = el('div', { class: 'summon-ov' });
  document.getElementById('overlay-root').appendChild(ov);
  const stage = new SummonStage(ov, { times, onAgain, ticketsLeft });
  stage.play(results);
  return () => stage.destroy();
}

class SummonStage {
  constructor(ov, opts) {
    this.ov = ov;
    this.opts = opts;
    this.destroyed = false;
    this.tl = null;
    this.cards = [];
    this._disposables = new Set(); // 幾何/材質/貼圖統一回收

    // ---- three 基礎 ----
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'summon-canvas';
    ov.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 60);
    // 運鏡轉場：低角度貼近法陣 →（爆發後）拉遠看牌陣
    this._camNear = new THREE.Vector3(0, 0.6, 6.2);
    this._camHome = new THREE.Vector3(0, 1.5, 8.8);
    this.camera.position.copy(this._camNear);
    this._lookAt = new THREE.Vector3(0, 0.3, 0);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1280, 720), BLOOM_BASE, 0.55, 0.6);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this._dotTex = this._makeDotTexture();
    this._buildPortal();
    this._buildParticles();
    this._buildFlash();

    // ---- 尺寸 / 迴圈 ----
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
    this._resize();
    this._clockLast = performance.now();
    this._tick = () => this._render();
    gsap.ticker.add(this._tick);

    // ---- DOM 操作層（跳過 / 結果按鈕）----
    this.skipBtn = el('div', { class: 'summon-skip pressable', text: '跳過 ⏭' });
    this.skipBtn.addEventListener('click', () => this.skip());
    ov.appendChild(this.skipBtn);
    ov.addEventListener('click', (e) => {
      if (this.tl && this.tl.progress() < 1 && !e.target.closest('.summon-actions')) this.skip();
    });
  }

  /* ================= 場景元件 ================= */

  _track(...objs) {
    for (const o of objs) this._disposables.add(o);
    return objs[0];
  }

  // 柔邊光點貼圖（粒子/閃光共用）
  _makeDotTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    return this._track(tex);
  }

  // 手繪魔法陣紋樣：同心圓 + 六芒星 + 刻度環 + 頂點小圓（烘成貼圖，場中緩轉）
  _bakeMagicCircle() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const cx = S / 2;
    ctx.strokeStyle = 'rgba(255,220,140,.95)';
    ctx.fillStyle = 'rgba(255,220,140,.95)';
    ctx.lineWidth = 5;
    const ring = (r, w = 5, a = 1) => {
      ctx.lineWidth = w;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(cx, cx, r, 0, Math.PI * 2);
      ctx.stroke();
    };
    ring(244, 7);
    ring(226, 3, 0.8);
    ring(150, 4, 0.9);
    ring(66, 3, 0.85);
    // 刻度環
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < 48; i += 1) {
      const a = (i / 48) * Math.PI * 2;
      const r0 = i % 4 === 0 ? 200 : 212;
      ctx.lineWidth = i % 4 === 0 ? 4 : 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cx + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * 222, cx + Math.sin(a) * 222);
      ctx.stroke();
    }
    // 六芒星（雙三角）+ 頂點小圓
    ctx.lineWidth = 4;
    for (const off of [0, Math.PI / 3]) {
      ctx.beginPath();
      for (let i = 0; i <= 3; i += 1) {
        const a = off + (i / 3) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(a) * 150;
        const y = cx + Math.sin(a) * 150;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * 150, cx + Math.sin(a) * 150, 14, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(c);
    return this._track(tex);
  }

  // 法陣傳送門：底部輝光 + 手繪魔法陣（緩轉）+ 旋轉符文環 + 爆發光柱
  _buildPortal() {
    const portal = new THREE.Group();
    portal.position.y = -1.55;
    this.scene.add(portal);
    this.portal = portal;

    // 底部輝光
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 256;
    const gctx = glowCanvas.getContext('2d');
    const rg = gctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    rg.addColorStop(0, 'rgba(255,215,130,.85)');
    rg.addColorStop(0.45, 'rgba(255,180,90,.28)');
    rg.addColorStop(1, 'rgba(255,180,90,0)');
    gctx.fillStyle = rg;
    gctx.fillRect(0, 0, 256, 256);
    const glow = new THREE.Mesh(
      this._track(new THREE.CircleGeometry(2.7, 48)),
      this._track(new THREE.MeshBasicMaterial({ map: this._track(new THREE.CanvasTexture(glowCanvas)), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.02;
    portal.add(glow);

    // 魔法陣本體（緩轉，_render 內轉 rotation.z）
    this.circleMesh = new THREE.Mesh(
      this._track(new THREE.PlaneGeometry(4.6, 4.6)),
      this._track(new THREE.MeshBasicMaterial({ map: this._bakeMagicCircle(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
    );
    this.circleMesh.rotation.x = -Math.PI / 2;
    portal.add(this.circleMesh);

    // 爆發光柱（衝天；平時透明）
    this.beamMat = this._track(
      new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    this.beam = new THREE.Mesh(this._track(new THREE.CylinderGeometry(0.55, 1.5, 7.5, 24, 1, true)), this.beamMat);
    this.beam.position.y = 3.4;
    portal.add(this.beam);

    // 符文環：✦ 精靈繞圈（render loop 內旋轉）
    const runeCanvas = document.createElement('canvas');
    runeCanvas.width = runeCanvas.height = 64;
    const rc = runeCanvas.getContext('2d');
    rc.fillStyle = '#ffe9b0';
    rc.font = '48px serif';
    rc.textAlign = 'center';
    rc.textBaseline = 'middle';
    rc.fillText('✦', 32, 34);
    const runeTex = this._track(new THREE.CanvasTexture(runeCanvas));
    this.runeRing = new THREE.Group();
    const RUNES = 10;
    for (let i = 0; i < RUNES; i += 1) {
      const mat = this._track(new THREE.SpriteMaterial({ map: runeTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      const s = new THREE.Sprite(mat);
      const a = (i / RUNES) * Math.PI * 2;
      s.position.set(Math.cos(a) * 1.8, 0.06, Math.sin(a) * 1.8);
      s.scale.setScalar(0.34);
      this.runeRing.add(s);
    }
    portal.add(this.runeRing);

    portal.scale.setScalar(0.001); // 蓄力時放大進場
  }

  // 環繞粒子：蓄力時繞傳送門盤旋上升
  _buildParticles() {
    const N = 220;
    const geo = this._track(new THREE.BufferGeometry());
    const pos = new Float32Array(N * 3);
    this._pMeta = [];
    for (let i = 0; i < N; i += 1) {
      this._pMeta.push({
        r: 1.2 + Math.random() * 2.4,
        a: Math.random() * Math.PI * 2,
        speed: 0.8 + Math.random() * 1.6,
        y: -1.5 + Math.random() * 3.4,
        rise: 0.25 + Math.random() * 0.7,
      });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.pMat = this._track(
      new THREE.PointsMaterial({
        size: 0.09,
        map: this._dotTex,
        color: GOLD,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.points = new THREE.Points(geo, this.pMat);
    this.scene.add(this.points);
  }

  // 爆發白閃（大型 additive 精靈）
  _buildFlash() {
    const mat = this._track(new THREE.SpriteMaterial({ map: this._dotTex, color: 0xfff6dd, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flash = new THREE.Sprite(mat);
    this.flash.position.set(0, -0.6, 1.5);
    this.flash.scale.setScalar(14);
    this.scene.add(this.flash);
  }

  /* ================= 卡面貼圖烘焙 ================= */

  _bakeBack() {
    if (this._backTex) return this._backTex;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 683;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 683);
    g.addColorStop(0, '#2c2547');
    g.addColorStop(1, '#161129');
    ctx.fillStyle = g;
    roundRect(ctx, 0, 0, 512, 683, 36);
    ctx.fill();
    ctx.strokeStyle = 'rgba(248,203,92,.75)';
    ctx.lineWidth = 10;
    roundRect(ctx, 14, 14, 484, 655, 28);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(248,203,92,.32)';
    ctx.lineWidth = 4;
    roundRect(ctx, 44, 44, 424, 595, 20);
    ctx.stroke();
    ctx.fillStyle = '#ffe9b0';
    ctx.font = '150px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255,215,130,.9)';
    ctx.shadowBlur = 40;
    ctx.fillText('✦', 256, 345);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this._backTex = this._track(tex);
    return tex;
  }

  async _bakeFront(result) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 683;
    const ctx = c.getContext('2d');
    const isCard = result.type === 'card' || result.type === 'duplicate';

    if (isCard && CARDS[result.cardId]) {
      const card = CARDS[result.cardId];
      // 立繪滿版
      try {
        const img = await loadImage(artFor(card.id));
        ctx.drawImage(img, 0, 0, 512, 683);
      } catch {
        ctx.fillStyle = ELEMENT_HEX[card.element] || '#333959';
        ctx.fillRect(0, 0, 512, 683);
      }
      // 底部名牌
      const grad = ctx.createLinearGradient(0, 500, 0, 683);
      grad.addColorStop(0, 'rgba(14,8,2,0)');
      grad.addColorStop(1, 'rgba(14,8,2,.92)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 500, 512, 183);
      ctx.fillStyle = '#fff';
      ctx.font = '700 52px "Segoe UI","Microsoft JhengHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(card.name, 256, 630);
      // 元素框
      ctx.strokeStyle = ELEMENT_HEX[card.element] || '#f8cb5c';
      ctx.lineWidth = 12;
      roundRect(ctx, 6, 6, 500, 671, 30);
      ctx.stroke();
      // NEW / 重複轉化 標記
      if (result.type === 'card') {
        ctx.fillStyle = '#ff7d5c';
        roundRect(ctx, 0, 0, 150, 64, 18);
        ctx.fill();
        ctx.fillStyle = '#4a1206';
        ctx.font = '800 40px "Segoe UI",sans-serif';
        ctx.fillText('NEW', 75, 46);
      } else {
        ctx.fillStyle = 'rgba(14,8,2,.8)';
        ctx.fillRect(0, 440, 512, 60);
        ctx.fillStyle = '#ffd781';
        ctx.font = '700 38px "Segoe UI","Microsoft JhengHei",sans-serif';
        ctx.fillText(`重複 → 🔹${result.amount}`, 256, 483);
      }
    } else {
      // 素材面：暗面板 + 圖示 + 數量
      const g = ctx.createLinearGradient(0, 0, 0, 683);
      g.addColorStop(0, '#2e3554');
      g.addColorStop(1, '#1a2032');
      ctx.fillStyle = g;
      roundRect(ctx, 0, 0, 512, 683, 36);
      ctx.fill();
      ctx.strokeStyle = 'rgba(122,140,200,.5)';
      ctx.lineWidth = 8;
      roundRect(ctx, 10, 10, 492, 663, 28);
      ctx.stroke();
      const mat = MATERIALS[result.materialId];
      ctx.textAlign = 'center';
      ctx.font = '170px serif';
      ctx.fillText(mat?.icon || '🔹', 256, 320);
      ctx.fillStyle = '#ffe9b0';
      ctx.font = '800 72px "Segoe UI",sans-serif';
      ctx.fillText(`×${fmt(result.amount)}`, 256, 460);
      ctx.fillStyle = '#a7a3c2';
      ctx.font = '600 42px "Segoe UI","Microsoft JhengHei",sans-serif';
      ctx.fillText(mat?.label || '', 256, 560);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return this._track(tex);
  }

  /* ================= 演出 ================= */

  // 卡片落點：十連＝固定兩排各 5 張（上下排）；≤5 張＝一排置中。
  _slotPos(i, total) {
    const perRow = total <= 5 ? total : 5;
    const rows = total <= 5 ? 1 : 2;
    const row = Math.floor(i / perRow);
    const inRow = row === rows - 1 ? total - perRow * (rows - 1) : perRow;
    const col = i % perRow;
    const width = (inRow - 1) * GRID_GAP_X;
    const x = col * GRID_GAP_X - width / 2;
    const y = rows === 1 ? 0.55 : row === 0 ? 1.55 : -0.55;
    return new THREE.Vector3(x, y, 0.6 + row * 0.02);
  }

  async play(batch) {
    this.tl?.kill();
    this._clearCards();
    this._removeActions();

    // 先備好全部卡面貼圖（本地 SVG，極快）
    const fronts = await Promise.all(batch.map((r) => this._bakeFront(r)));
    if (this.destroyed) return;
    const backTex = this._bakeBack();

    const geo = this._track(new THREE.PlaneGeometry(CARD_W, CARD_H));
    batch.forEach((result, i) => {
      const grp = new THREE.Group();
      const rare = result.type === 'card' || result.type === 'duplicate';
      const frontMat = this._track(new THREE.MeshBasicMaterial({ map: fronts[i], transparent: true }));
      const backMat = this._track(new THREE.MeshBasicMaterial({ map: backTex, transparent: true }));
      const front = new THREE.Mesh(geo, frontMat);
      const back = new THREE.Mesh(geo, backMat);
      back.rotation.y = Math.PI;
      grp.add(front);
      grp.add(back);
      grp.position.set(0, -1.4, 0.3); // 自傳送門出生
      grp.rotation.y = Math.PI; // 先亮卡背
      grp.scale.setScalar(0.12);
      this.scene.add(grp);
      this.cards.push({ grp, backMat, rare, slot: this._slotPos(i, batch.length) });
    });

    // ---- GSAP 主時間軸 ----
    const tl = gsap.timeline({ onComplete: () => this._showActions() });
    this.tl = tl;

    // 蓄力：鏡頭貼近法陣、傳送門升起、粒子亮起、Bloom 蓄能（anticipation）
    tl.set(this.camera.position, { x: this._camNear.x, y: this._camNear.y, z: this._camNear.z }, 0);
    tl.to(this.portal.scale, { x: 1, y: 1, z: 1, duration: CHARGE_S, ease: 'back.out(1.4)' }, 0);
    tl.to(this.pMat, { opacity: 0.9, duration: CHARGE_S * 0.8 }, 0);
    tl.to(this.bloom, { strength: 1.6, duration: CHARGE_S, ease: 'power2.in' }, 0);
    tl.to(this.camera.position, { z: this._camNear.z - 0.5, duration: CHARGE_S, ease: 'power2.in' }, 0); // 緩推進

    // 爆發：白閃 + 光柱衝天 + Bloom 尖峰（impact），同時運鏡拉遠轉場到牌陣視角
    tl.to(this.flash.material, { opacity: 0.95, duration: BURST_S * 0.4, ease: 'power1.in' }, CHARGE_S);
    tl.to(this.flash.material, { opacity: 0, duration: BURST_S * 0.6, ease: 'power1.out' }, CHARGE_S + BURST_S * 0.4);
    tl.to(this.beamMat, { opacity: 0.85, duration: BURST_S, ease: 'power1.in' }, CHARGE_S);
    tl.fromTo(this.beam.scale, { x: 0.3, z: 0.3 }, { x: 1, z: 1, duration: BURST_S, ease: 'back.out(1.6)' }, CHARGE_S);
    tl.to(this.beamMat, { opacity: 0, duration: 0.5, ease: 'power1.in' }, CHARGE_S + 0.4);
    tl.to(this.bloom, { strength: BLOOM_BURST, duration: BURST_S * 0.4, ease: 'power1.in' }, CHARGE_S);
    tl.to(this.bloom, { strength: BLOOM_BASE, duration: 0.5, ease: 'power2.out' }, CHARGE_S + BURST_S);
    tl.to(this.camera.position, {
      x: this._camHome.x,
      y: this._camHome.y,
      z: this._camHome.z,
      duration: 0.85,
      ease: 'power2.inOut',
    }, CHARGE_S + BURST_S * 0.3);

    // 卡背飛出：弧線 + 旋轉甩尾（action）
    const flyAt = CHARGE_S + BURST_S * 0.5;
    this.cards.forEach((c, i) => {
      const t0 = flyAt + i * FLY_STAGGER_S;
      tl.to(c.grp.position, { x: c.slot.x, z: c.slot.z, duration: FLY_S, ease: 'power2.out' }, t0);
      tl.to(c.grp.position, { y: c.slot.y + 0.35, duration: FLY_S * 0.55, ease: 'power2.out' }, t0);
      tl.to(c.grp.position, { y: c.slot.y, duration: FLY_S * 0.45, ease: 'bounce.out' }, t0 + FLY_S * 0.55);
      tl.to(c.grp.scale, { x: 1, y: 1, z: 1, duration: FLY_S * 0.8, ease: 'back.out(1.4)' }, t0);
      tl.fromTo(c.grp.rotation, { y: Math.PI + 1.4, z: -0.25 }, { y: Math.PI, z: 0, duration: FLY_S, ease: 'power2.out' }, t0);
    });

    // 逐張翻面（follow-through）：稀有卡金光預告 → 翻面 → 金粒爆 + Bloom 脈衝
    let t = flyAt + FLY_S + (this.cards.length - 1) * FLY_STAGGER_S + 0.12;
    this.cards.forEach((c) => {
      if (c.rare) {
        tl.to(c.backMat.color, { r: 2.2, g: 1.8, b: 0.9, duration: RARE_HINT_S * 0.5, yoyo: true, repeat: 1 }, t);
        tl.to(c.grp.rotation, { z: 0.06, duration: RARE_HINT_S / 4, yoyo: true, repeat: 3, ease: 'sine.inOut' }, t);
        t += RARE_HINT_S;
      }
      tl.to(c.grp.rotation, { y: 0, duration: FLIP_S, ease: 'back.out(1.4)' }, t);
      tl.to(c.grp.scale, { x: 1.12, y: 1.12, duration: FLIP_S / 2, yoyo: true, repeat: 1 }, t);
      if (c.rare) {
        tl.add(() => this._goldBurst(c.grp.position), t + FLIP_S * 0.5);
        tl.to(this.bloom, { strength: BLOOM_BASE + 0.9, duration: 0.1 }, t + FLIP_S * 0.5);
        tl.to(this.bloom, { strength: BLOOM_BASE, duration: 0.45, ease: 'power2.out' }, t + FLIP_S * 0.5 + 0.1);
      }
      t += FLIP_STAGGER_S;
    });

    // 減少動態偏好：直接看結果
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) tl.progress(1);
  }

  // 稀有卡翻開的金粒爆（一次性 Points）
  _goldBurst(pos) {
    if (this.destroyed) return;
    const N = 26;
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(N * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.13,
      map: this._dotTex,
      color: GOLD,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.position.copy(pos);
    this.scene.add(pts);
    const dirs = [];
    for (let i = 0; i < N; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.8 + Math.random() * 1.2;
      dirs.push(new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.2) * 1.6, Math.sin(a) * 0.4));
    }
    const st = { t: 0 };
    gsap.to(st, {
      t: 1,
      duration: 0.7,
      ease: 'power2.out',
      onUpdate: () => {
        const p = geo.attributes.position;
        for (let i = 0; i < N; i += 1) {
          p.setXYZ(i, dirs[i].x * st.t, dirs[i].y * st.t - st.t * st.t * 0.6, dirs[i].z * st.t);
        }
        p.needsUpdate = true;
        mat.opacity = 1 - st.t;
      },
      onComplete: () => {
        this.scene.remove(pts);
        geo.dispose();
        mat.dispose();
      },
    });
  }

  /* ================= 迴圈 / 操作 ================= */

  _render() {
    if (this.destroyed) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._clockLast) / 1000);
    this._clockLast = now;

    // 魔法陣緩轉、符文環恆轉、粒子繞柱盤旋上升；鏡頭運鏡時保持注視點
    this.circleMesh.rotation.z += dt * 0.35;
    this.runeRing.rotation.y += dt * 0.9;
    this.camera.lookAt(this._lookAt);
    const p = this.points.geometry.attributes.position;
    for (let i = 0; i < this._pMeta.length; i += 1) {
      const m = this._pMeta[i];
      m.a += dt * m.speed;
      m.y += dt * m.rise;
      if (m.y > 2.4) m.y = -1.6;
      p.setXYZ(i, Math.cos(m.a) * m.r, m.y, Math.sin(m.a) * m.r * 0.7);
    }
    p.needsUpdate = true;

    this.composer.render();
  }

  _resize() {
    const w = this.ov.clientWidth || window.innerWidth;
    const h = this.ov.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  skip() {
    if (this.tl && this.tl.progress() < 1) this.tl.progress(1);
  }

  _showActions() {
    if (this.destroyed || this.ov.querySelector('.summon-actions')) return;
    this.skipBtn.style.display = 'none';
    const actions = el('div', { class: 'summon-actions' });
    const { times, onAgain, ticketsLeft } = this.opts;
    if (onAgain) {
      const left = ticketsLeft?.() ?? 0;
      const n = Math.min(times, Math.max(0, left));
      const againBtn = el('button', {
        class: 'btn-gold',
        text: n > 0 ? `再抽 ${n} 次（🎟️${n}）` : '召喚券不足',
        onClick: () => {
          const next = onAgain(times);
          if (next && next.length) {
            this._removeActions();
            this.skipBtn.style.display = '';
            this.play(next);
          }
        },
      });
      againBtn.disabled = n <= 0;
      actions.appendChild(againBtn);
    }
    actions.appendChild(el('button', { text: '確定', onClick: () => this.destroy() }));
    this.ov.appendChild(actions);
    gsap.fromTo(actions, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out' });
  }

  _removeActions() {
    this.ov.querySelector('.summon-actions')?.remove();
  }

  _clearCards() {
    for (const c of this.cards) {
      gsap.killTweensOf([c.grp.position, c.grp.rotation, c.grp.scale, c.backMat.color]);
      this.scene.remove(c.grp);
    }
    this.cards = [];
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.tl?.kill();
    gsap.ticker.remove(this._tick);
    window.removeEventListener('resize', this._onResize);
    gsap.killTweensOf([this.camera.position, this.pMat, this.bloom, this.flash.material, this.portal.scale]);
    this._clearCards();
    for (const d of this._disposables) d.dispose?.();
    this._disposables.clear();
    this.composer.dispose?.();
    this.renderer.dispose();
    this.ov.remove();
  }
}

/* ---------------- 工具 ---------------- */

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
