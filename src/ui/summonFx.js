// 召喚揭曉儀式 3D 版（Three.js + GSAP）——多幕式運鏡：
//   Act0 開場：星空亮起，鏡頭自高空俯視，魔法陣三層紋樣依序「畫出」
//   Act1 蓄力：鏡頭俯衝到低角度，能量流自四面八方匯聚，符文環加速，Bloom 蓄能
//   Act2 爆發：白閃 + 光柱衝天 + 地面衝擊環 + FOV 拳感 + 鏡頭震
//   Act3 卡陣：卡背自光柱螺旋升天 → 環形卡陣旋轉一周（鏡頭反向微繞）
//   Act4 發牌：卡陣甩牌落位（十連固定兩排各 5）
//   Act5 翻面：逐張 3D 翻面 + 跳動；稀有卡金光預告、翻開金粒爆 + 衝擊環 + 背後旋轉光芒
// 卡面/卡背全烘 CanvasTexture；對外 API 不變：openSummonCeremony(results, opts)。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { gsap } from 'gsap';
import { el, fmt } from './dom.js';
import { CARDS } from '../data/cards.js';
import { ELEMENT_LABEL } from '../data/elements.js';
import { MATERIALS } from '../data/materials.js';
import { artFor, cutoutFor } from '../data/assets.js';

/* ---------------- 演出常數（幕表） ---------------- */
const T_OPEN = 0.0; // Act0 開場（魔法陣畫出）
const OPEN_S = 0.95;
const T_CHARGE = 0.9; // Act1 蓄力
const CHARGE_S = 1.0;
const T_BURST = T_CHARGE + CHARGE_S; // Act2 爆發
const BURST_S = 0.3;
const T_HELIX = T_BURST + 0.18; // Act3 螺旋升天
const HELIX_S = 0.95;
const HELIX_STAGGER_S = 0.05;
const T_SPIN = T_HELIX + HELIX_S + 0.15; // 卡陣旋轉一周
const SPIN_S = 0.9;
const T_DEAL = T_SPIN + SPIN_S + 0.05; // Act4 發牌
const DEAL_S = 0.55;
const DEAL_STAGGER_S = 0.06;
const FLIP_S = 0.42; // Act5 翻面
const FLIP_STAGGER_S = 0.12;
// 英雄卡全螢幕登場大轉場（白閃切入 → 全圖亮相 → 縮吸進卡格）
const SPLASH_IN_S = 0.3;
const SPLASH_HOLD_S = 0.62;
const SPLASH_OUT_S = 0.34;

const CARD_W = 1.28;
const CARD_H = CARD_W * (4 / 3);
const GRID_GAP_X = 1.52;
const CAROUSEL_R = 2.35; // 環形卡陣半徑
const CAROUSEL_Y = 0.85;
const BLOOM_BASE = 0.75;
const BLOOM_BURST = 1.7; // 尖峰壓低：亮但不炸白、也減輕 GPU 峰值卡頓
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
    this._rareRays = []; // 稀有卡背後旋轉光芒（render 迴圈轉動）
    this._disposables = new Set();

    // ---- three 基礎 ----
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); // 1.5 夠銳利（貼圖已 2× 烘製），降低 Bloom 全屏成本
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'summon-canvas';
    ov.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 80);
    // 運鏡三站：高空俯視 → 低角度貼法陣 → 牌陣正視
    this._camTop = new THREE.Vector3(0, 8.2, 1.2);
    this._camNear = new THREE.Vector3(0, 0.7, 6.0);
    this._camHome = new THREE.Vector3(0, 1.5, 8.8);
    this.camera.position.copy(this._camTop);
    this._lookAt = new THREE.Vector3(0, -1.5, 0);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // threshold 拉高：只讓真正亮的金光/白閃泛光，卡面文字不糊；半解析度 RT 減輕峰值
    this.bloom = new UnrealBloomPass(new THREE.Vector2(640, 360), 0.4, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this._dotTex = this._makeDotTexture();
    this._buildStars();
    this._buildPortal();
    this._buildParticles();
    this._buildFlash();
    this._buildStreaks();
    this._buildSplash();

    this._runeSpeed = 0.9; // 符文環轉速（蓄力時加速）

    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
    this._resize();
    this._clockLast = performance.now();
    this._tick = () => this._render();
    gsap.ticker.add(this._tick);

    // ---- DOM 操作層 ----
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
    return this._track(new THREE.CanvasTexture(c));
  }

  // 背景星空（緩慢漂移的遠景光點）
  _buildStars() {
    const N = 300;
    const geo = this._track(new THREE.BufferGeometry());
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i += 1) {
      pos[i * 3] = (Math.random() - 0.5) * 46;
      pos[i * 3 + 1] = (Math.random() - 0.3) * 26;
      pos[i * 3 + 2] = -14 - Math.random() * 22;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = this._track(
      new THREE.PointsMaterial({ size: 0.09, map: this._dotTex, color: 0x9fb4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.stars = new THREE.Points(geo, this.starMat);
    this.scene.add(this.stars);
  }

  // 魔法陣紋樣分三層烘製（外環刻度 / 六芒星 / 內環），各自反向旋轉——開場逐層「畫出」
  _bakeCirclePart(part) {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const cx = S / 2;
    ctx.strokeStyle = 'rgba(255,220,140,.95)';
    const ring = (r, w = 5, a = 1) => {
      ctx.lineWidth = w;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(cx, cx, r, 0, Math.PI * 2);
      ctx.stroke();
    };
    if (part === 'outer') {
      ring(244, 7);
      ring(226, 3, 0.8);
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
    } else if (part === 'hex') {
      ctx.lineWidth = 4;
      ring(150, 4, 0.9);
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
    } else {
      ring(66, 3, 0.85);
      ring(96, 2, 0.6);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(255,220,140,.95)';
      ctx.font = '44px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        ctx.fillText('✧', cx + Math.cos(a) * 82, cx + Math.sin(a) * 82);
      }
    }
    ctx.globalAlpha = 1;
    return this._track(new THREE.CanvasTexture(c));
  }

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
    this.glowMat = this._track(new THREE.MeshBasicMaterial({ map: this._track(new THREE.CanvasTexture(glowCanvas)), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    const glow = new THREE.Mesh(this._track(new THREE.CircleGeometry(2.7, 48)), this.glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.02;
    portal.add(glow);

    // 三層魔法陣（開場依序畫出；render 迴圈各自反向旋轉）
    this.circleLayers = [];
    const layerSpecs = [
      { part: 'outer', size: 4.6, spin: 0.18 },
      { part: 'hex', size: 4.6, spin: -0.32 },
      { part: 'inner', size: 4.6, spin: 0.55 },
    ];
    layerSpecs.forEach((spec, i) => {
      const mat = this._track(new THREE.MeshBasicMaterial({ map: this._bakeCirclePart(spec.part), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const mesh = new THREE.Mesh(this._track(new THREE.PlaneGeometry(spec.size, spec.size)), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.01 * (i + 1);
      mesh.scale.setScalar(1.55); // 開場由外向內收攏
      portal.add(mesh);
      this.circleLayers.push({ mesh, mat, spin: spec.spin });
    });

    // 符文環
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
    this.runeMats = [];
    const RUNES = 10;
    for (let i = 0; i < RUNES; i += 1) {
      const mat = this._track(new THREE.SpriteMaterial({ map: runeTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.runeMats.push(mat);
      const s = new THREE.Sprite(mat);
      const a = (i / RUNES) * Math.PI * 2;
      s.position.set(Math.cos(a) * 1.8, 0.08, Math.sin(a) * 1.8);
      s.scale.setScalar(0.34);
      this.runeRing.add(s);
    }
    portal.add(this.runeRing);

    // 爆發光柱
    this.beamMat = this._track(new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.beam = new THREE.Mesh(this._track(new THREE.CylinderGeometry(0.55, 1.5, 7.5, 24, 1, true)), this.beamMat);
    this.beam.position.y = 3.4;
    portal.add(this.beam);

    // 地面衝擊環（爆發時擴散；重複利用）
    this.shockMat = this._track(new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.shock = new THREE.Mesh(this._track(new THREE.RingGeometry(0.85, 1.0, 64)), this.shockMat);
    this.shock.rotation.x = -Math.PI / 2;
    this.shock.position.y = 0.05;
    portal.add(this.shock);
  }

  _buildParticles() {
    const N = 240;
    const geo = this._track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this._pMeta = [];
    for (let i = 0; i < N; i += 1) {
      this._pMeta.push({
        r: 1.2 + Math.random() * 2.6,
        a: Math.random() * Math.PI * 2,
        speed: 0.8 + Math.random() * 1.8,
        y: -1.5 + Math.random() * 3.6,
        rise: 0.25 + Math.random() * 0.8,
      });
    }
    this.pMat = this._track(new THREE.PointsMaterial({ size: 0.09, map: this._dotTex, color: GOLD, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.points = new THREE.Points(geo, this.pMat);
    this.scene.add(this.points);
  }

  _buildFlash() {
    const mat = this._track(new THREE.SpriteMaterial({ map: this._dotTex, color: 0xfff6dd, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flash = new THREE.Sprite(mat);
    this.flash.position.set(0, -0.6, 1.5);
    this.flash.scale.setScalar(8); // 縮小覆蓋面積：白閃有感但不炸整屏（也省 fill rate）
    this.scene.add(this.flash);
  }

  // 能量流：細長光帶自四面八方匯聚到法陣（蓄力用）
  _buildStreaks() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 16;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, 'rgba(255,230,170,0)');
    g.addColorStop(0.75, 'rgba(255,230,170,.9)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 16);
    const tex = this._track(new THREE.CanvasTexture(c));
    this.streaks = [];
    const N = 9;
    for (let i = 0; i < N; i += 1) {
      const mat = this._track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const mesh = new THREE.Mesh(this._track(new THREE.PlaneGeometry(2.6, 0.16)), mat);
      const a = (i / N) * Math.PI * 2 + Math.random() * 0.5;
      const r = 7.5 + Math.random() * 2.5;
      const start = new THREE.Vector3(Math.cos(a) * r, -1.2 + Math.random() * 3.4, Math.sin(a) * r * 0.6 - 1);
      mesh.position.copy(start);
      mesh.lookAt(0, -1.2, 0);
      mesh.rotateY(Math.PI / 2); // 貼圖長邊朝向圓心
      this.scene.add(mesh);
      this.streaks.push({ mesh, mat, start });
    }
  }

  /* ================= 卡面貼圖烘焙 ================= */

  _bakeBack() {
    if (this._backTex) return this._backTex;
    const c = document.createElement('canvas');
    c.width = 1024; // 2× 烘製，近看不糊
    c.height = 1366;
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
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
    c.width = 1024; // 2× 烘製，近看不糊
    c.height = 1366;
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    const isCard = result.type === 'card' || result.type === 'duplicate' || result.type === 'starup';

    if (isCard && CARDS[result.cardId]) {
      const card = CARDS[result.cardId];
      try {
        const img = await loadImage(artFor(card.id));
        ctx.drawImage(img, 0, 0, 512, 683);
      } catch {
        ctx.fillStyle = ELEMENT_HEX[card.element] || '#333959';
        ctx.fillRect(0, 0, 512, 683);
      }
      const grad = ctx.createLinearGradient(0, 500, 0, 683);
      grad.addColorStop(0, 'rgba(14,8,2,0)');
      grad.addColorStop(1, 'rgba(14,8,2,.92)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 500, 512, 183);
      ctx.fillStyle = '#fff';
      ctx.font = '700 52px "Segoe UI","Microsoft JhengHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(card.name, 256, 630);
      ctx.strokeStyle = ELEMENT_HEX[card.element] || '#f8cb5c';
      ctx.lineWidth = 12;
      roundRect(ctx, 6, 6, 500, 671, 30);
      ctx.stroke();
      if (result.type === 'card') {
        ctx.fillStyle = '#ff7d5c';
        roundRect(ctx, 0, 0, 150, 64, 18);
        ctx.fill();
        ctx.fillStyle = '#4a1206';
        ctx.font = '800 40px "Segoe UI",sans-serif';
        ctx.fillText('NEW', 75, 46);
      } else if (result.type === 'starup') {
        // 重複 → 升星：金帶 + 星數
        ctx.fillStyle = 'rgba(14,8,2,.8)';
        ctx.fillRect(0, 440, 512, 60);
        ctx.fillStyle = '#ffd781';
        ctx.font = '700 40px "Segoe UI","Microsoft JhengHei",sans-serif';
        ctx.fillText(`升星！${'★'.repeat(result.stars)}${'☆'.repeat(5 - result.stars)}`, 256, 484);
      } else {
        ctx.fillStyle = 'rgba(14,8,2,.8)';
        ctx.fillRect(0, 440, 512, 60);
        ctx.fillStyle = '#ffd781';
        ctx.font = '700 38px "Segoe UI","Microsoft JhengHei",sans-serif';
        ctx.fillText(`重複 → 🔹${result.amount}`, 256, 483);
      }
    } else {
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
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return this._track(tex);
  }

  // ---- 英雄登場大轉場：壓暗幕 + 元素色光暈 + 大光芒 + 全圖 + 名字 ----
  _buildSplash() {
    const g = new THREE.Group();
    g.visible = false;
    g.position.set(0, 0.85, 4.4); // 鏡頭正前方（home 視角）
    this.scene.add(g);

    // 壓暗幕（隔離背後牌陣，製造「切走」的轉場感）
    this.spDimMat = this._track(new THREE.MeshBasicMaterial({ color: 0x05040c, transparent: true, opacity: 0, depthWrite: false }));
    const dim = new THREE.Mesh(this._track(new THREE.PlaneGeometry(20, 12)), this.spDimMat);
    dim.position.z = -0.4;
    g.add(dim);

    // 元素色光暈（radial，登場時換色）
    this.spWashMat = this._track(new THREE.MeshBasicMaterial({ map: null, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    const wash = new THREE.Mesh(this._track(new THREE.PlaneGeometry(11, 7)), this.spWashMat);
    wash.position.z = -0.3;
    g.add(wash);

    // 大光芒（render 迴圈旋轉）
    this.spRaysMat = this._track(new THREE.MeshBasicMaterial({ map: this._bakeRays(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.spRays = new THREE.Mesh(this._track(new THREE.PlaneGeometry(7.5, 7.5)), this.spRaysMat);
    this.spRays.position.z = -0.2;
    g.add(this.spRays);

    // 角色全圖（去背立繪；每次登場換貼圖）——右偏構圖，讓出左下名字區
    this.spArtMat = this._track(new THREE.MeshBasicMaterial({ map: null, transparent: true, opacity: 0, depthWrite: false }));
    this.spArt = new THREE.Mesh(this._track(new THREE.PlaneGeometry(2.45, 3.3)), this.spArtMat);
    this.spArt.position.set(0.62, 0.06, 0); // 全身入鏡（鏡頭注視點略低，圖心上移補償）
    this.spArt.renderOrder = 1;
    g.add(this.spArt);

    // 名字（slam 入場）——renderOrder 最高，永遠壓在角色圖之上
    this.spNameMat = this._track(new THREE.MeshBasicMaterial({ map: null, transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
    this.spName = new THREE.Mesh(this._track(new THREE.PlaneGeometry(3.6, 0.95)), this.spNameMat);
    this.spName.position.set(-1.5, -1.0, 0.25);
    this.spName.renderOrder = 10;
    g.add(this.spName);

    this.splash = g;
  }

  _bakeWash(hex) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const rg = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    rg.addColorStop(0, hexToRgba(hex, 0.85));
    rg.addColorStop(0.55, hexToRgba(hex, 0.3));
    rg.addColorStop(1, hexToRgba(hex, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, 256, 256);
    return this._track(new THREE.CanvasTexture(c));
  }

  _bakeName(card) {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 270;
    const ctx = c.getContext('2d');
    const hex = ELEMENT_HEX[card.element] || '#f8cb5c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 屬性小字
    ctx.fillStyle = hex;
    ctx.font = '700 52px "Segoe UI","Microsoft JhengHei",sans-serif';
    ctx.fillText(`—— ${ELEMENT_LABEL[card.element] || ''}屬性 英雄 ——`, 512, 52);
    // 名字大字（元素色描邊 + 光暈）
    ctx.font = '900 150px "Segoe UI","Microsoft JhengHei",sans-serif';
    ctx.shadowColor = hex;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = hex;
    ctx.lineWidth = 10;
    ctx.strokeText(card.name, 512, 168);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f3e6c8'; // 米白：低於 bloom 門檻，不會整條炸白
    ctx.fillText(card.name, 512, 168);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return this._track(tex);
  }

  // 稀有卡背後旋轉光芒（12 道放射光，render 迴圈轉動）
  _bakeRays() {
    if (this._rayTex) return this._rayTex;
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    ctx.translate(S / 2, S / 2);
    for (let i = 0; i < 12; i += 1) {
      ctx.rotate(Math.PI / 6);
      const g = ctx.createLinearGradient(0, 0, 0, -S / 2);
      g.addColorStop(0, 'rgba(255,215,130,.55)');
      g.addColorStop(1, 'rgba(255,215,130,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-9, -S / 2);
      ctx.lineTo(9, -S / 2);
      ctx.closePath();
      ctx.fill();
    }
    this._rayTex = this._track(new THREE.CanvasTexture(c));
    return this._rayTex;
  }

  /* ================= 演出 ================= */

  // 卡片落點：十連＝固定兩排各 5 張；≤5 張＝一排置中。
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
    // 併發保護：連點「再抽」可能在貼圖烘焙(await)期間又開一輪 play——
    // 兩條時間線互踩會卡死在半路。以序號為準，舊的一輪在 await 後自行退出。
    const token = (this._playSeq = (this._playSeq ?? 0) + 1);
    this.tl?.kill();
    this._clearCards();
    this._removeActions();
    // 重播時重置登場層
    this.splash.visible = false;
    for (const m of [this.spDimMat, this.spWashMat, this.spRaysMat, this.spArtMat, this.spNameMat]) {
      gsap.killTweensOf(m);
      m.opacity = 0;
    }
    gsap.killTweensOf([this.splash.position, this.splash.scale, this.spArt.position, this.spArt.scale, this.spName.scale]);

    const fronts = await Promise.all(batch.map((r) => this._bakeFront(r)));
    // 英雄登場大轉場素材（去背全圖 2× 點陣化 + 名字 + 元素色光暈）
    const splashes = await Promise.all(
      batch.map(async (r) => {
        const isHero = (r.type === 'card' || r.type === 'duplicate' || r.type === 'starup') && CARDS[r.cardId];
        if (!isHero) return null;
        const card = CARDS[r.cardId];
        let artTex = null;
        try {
          const img = await loadImage(cutoutFor(card.id));
          const cv = document.createElement('canvas');
          cv.width = (img.naturalWidth || 420) * 2;
          cv.height = (img.naturalHeight || 566) * 2;
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          artTex = new THREE.CanvasTexture(cv);
          artTex.colorSpace = THREE.SRGBColorSpace;
          this._track(artTex);
        } catch {
          artTex = null;
        }
        return { artTex, nameTex: this._bakeName(card), wash: this._bakeWash(ELEMENT_HEX[card.element] || '#f8cb5c') };
      })
    );
    if (this.destroyed || token !== this._playSeq) return;
    const backTex = this._bakeBack();
    // 貼圖預上傳 GPU：白閃/登場第一次用到大貼圖時不再現場上傳（那正是「爆白瞬間卡頓」的來源）
    for (const tex of [...fronts, backTex]) this.renderer.initTexture(tex);
    for (const s of splashes) {
      if (!s) continue;
      if (s.artTex) this.renderer.initTexture(s.artTex);
      this.renderer.initTexture(s.nameTex);
      this.renderer.initTexture(s.wash);
    }
    const geo = this._track(new THREE.PlaneGeometry(CARD_W, CARD_H));

    batch.forEach((result, i) => {
      const grp = new THREE.Group();
      const rare = result.type === 'card' || result.type === 'duplicate' || result.type === 'starup';
      const frontMat = this._track(new THREE.MeshBasicMaterial({ map: fronts[i], transparent: true }));
      const backMat = this._track(new THREE.MeshBasicMaterial({ map: backTex, transparent: true }));
      const front = new THREE.Mesh(geo, frontMat);
      const back = new THREE.Mesh(geo, backMat);
      back.rotation.y = Math.PI;
      grp.add(front);
      grp.add(back);
      grp.visible = false;
      this.scene.add(grp);
      // 螺旋參數（Act3 用）：ang/rad/y 由 GSAP 驅動，onUpdate 換算座標
      const ang0 = (i / batch.length) * Math.PI * 2;
      this.cards.push({ grp, backMat, rare, slot: this._slotPos(i, batch.length), p: { ang: ang0, rad: 0.05, y: -1.3, s: 0.12 }, ang0, splash: splashes[i] });
    });

    const applyHelix = (c) => {
      const { ang, rad, y, s } = c.p;
      c.grp.position.set(Math.cos(ang) * rad, y, Math.sin(ang) * rad * 0.82 + 0.2);
      // 卡背永遠朝向鏡頭（billboard）：環轉到任何角度都不會偷看到牌面
      const dx = this.camera.position.x - c.grp.position.x;
      const dz = this.camera.position.z - c.grp.position.z;
      c.grp.rotation.y = Math.atan2(dx, dz) + Math.PI;
      c.grp.scale.setScalar(s);
    };

    const tl = gsap.timeline({ onComplete: () => this._showActions() });
    this.tl = tl;

    /* ---- Act0 開場：星空亮起、鏡頭高空俯視、魔法陣三層依序畫出 ---- */
    tl.set(this.camera.position, { x: this._camTop.x, y: this._camTop.y, z: this._camTop.z }, 0);
    tl.set(this._lookAt, { x: 0, y: -1.5, z: 0 }, 0);
    tl.to(this.starMat, { opacity: 0.75, duration: 0.6 }, T_OPEN);
    tl.to(this.glowMat, { opacity: 1, duration: 0.5 }, T_OPEN + 0.1);
    this.circleLayers.forEach((L, i) => {
      const t0 = T_OPEN + i * 0.18;
      tl.to(L.mat, { opacity: 1, duration: 0.4, ease: 'power1.out' }, t0);
      tl.to(L.mesh.scale, { x: 1, y: 1, z: 1, duration: 0.5, ease: 'back.out(1.8)' }, t0);
    });
    this.runeMats.forEach((m, i) => tl.to(m, { opacity: 1, duration: 0.2 }, T_OPEN + 0.35 + i * 0.045));
    tl.to(this.bloom, { strength: BLOOM_BASE, duration: OPEN_S }, T_OPEN);

    /* ---- Act1 蓄力：鏡頭俯衝、能量流匯聚、符文加速 ---- */
    tl.to(this.camera.position, { x: this._camNear.x, y: this._camNear.y, z: this._camNear.z, duration: CHARGE_S * 0.9, ease: 'power2.inOut' }, T_CHARGE);
    tl.to(this._lookAt, { y: -0.6, duration: CHARGE_S * 0.9, ease: 'power2.inOut' }, T_CHARGE);
    tl.to(this, { _runeSpeed: 3.4, duration: CHARGE_S, ease: 'power2.in' }, T_CHARGE);
    tl.to(this.pMat, { opacity: 0.9, duration: CHARGE_S * 0.7 }, T_CHARGE);
    tl.to(this.bloom, { strength: 1.7, duration: CHARGE_S, ease: 'power2.in' }, T_CHARGE);
    this.streaks.forEach(({ mesh, mat, start }, i) => {
      const t0 = T_CHARGE + 0.08 + i * 0.07;
      tl.set(mesh.position, { x: start.x, y: start.y, z: start.z }, t0);
      tl.to(mat, { opacity: 0.95, duration: 0.1 }, t0);
      tl.to(mesh.position, { x: 0, y: -1.2, z: 0, duration: 0.42, ease: 'power2.in' }, t0);
      tl.to(mat, { opacity: 0, duration: 0.1 }, t0 + 0.36);
    });
    // 法陣蓄力脈動
    tl.to(this.portal.scale, { x: 1.06, y: 1.06, z: 1.06, duration: 0.24, yoyo: true, repeat: 3, ease: 'sine.inOut' }, T_CHARGE + 0.1);

    /* ---- Act2 爆發：白閃 + 光柱 + 衝擊環 + FOV 拳感 + 鏡頭震 ---- */
    tl.to(this.flash.material, { opacity: 0.95, duration: BURST_S * 0.35, ease: 'power1.in' }, T_BURST);
    tl.to(this.flash.material, { opacity: 0, duration: BURST_S * 0.65, ease: 'power1.out' }, T_BURST + BURST_S * 0.35);
    tl.to(this.beamMat, { opacity: 0.9, duration: BURST_S * 0.6, ease: 'power1.in' }, T_BURST);
    tl.fromTo(this.beam.scale, { x: 0.3, z: 0.3 }, { x: 1, z: 1, duration: BURST_S, ease: 'back.out(1.6)' }, T_BURST);
    tl.to(this.beamMat, { opacity: 0, duration: 0.55, ease: 'power1.in' }, T_HELIX + HELIX_S * 0.6);
    tl.fromTo(this.shockMat, { opacity: 0.95 }, { opacity: 0, duration: 0.55, ease: 'power1.out' }, T_BURST);
    tl.fromTo(this.shock.scale, { x: 0.3, y: 0.3, z: 0.3 }, { x: 3.4, y: 3.4, z: 3.4, duration: 0.55, ease: 'power2.out' }, T_BURST);
    tl.to(this.bloom, { strength: BLOOM_BURST, duration: BURST_S * 0.4, ease: 'power1.in' }, T_BURST);
    tl.to(this.bloom, { strength: BLOOM_BASE, duration: 0.6, ease: 'power2.out' }, T_BURST + BURST_S);
    // FOV 拳感 + 位置抖動
    const fov = { v: 45 };
    tl.to(fov, {
      v: 55,
      duration: 0.12,
      yoyo: true,
      repeat: 1,
      onUpdate: () => {
        this.camera.fov = fov.v;
        this.camera.updateProjectionMatrix();
      },
    }, T_BURST);
    for (let i = 0; i < 4; i += 1) {
      tl.to(this.camera.position, { x: (Math.random() - 0.5) * 0.3, y: this._camNear.y + (Math.random() - 0.5) * 0.24, duration: 0.05 }, T_BURST + 0.06 + i * 0.05);
    }

    /* ---- Act3 卡陣：螺旋升天成環形卡陣 → 旋轉一周（鏡頭拉遠反繞） ---- */
    this.cards.forEach((c, i) => {
      const t0 = T_HELIX + i * HELIX_STAGGER_S;
      tl.set(c.grp, { visible: true }, t0);
      tl.to(c.p, {
        ang: c.ang0 + Math.PI * 2.2,
        rad: CAROUSEL_R,
        y: CAROUSEL_Y,
        s: 0.85,
        duration: HELIX_S,
        ease: 'power2.out',
        onUpdate: () => applyHelix(c),
      }, t0);
    });
    // 卡陣整體旋轉一周 + 鏡頭同步拉遠、注視點上移（轉場）
    this.cards.forEach((c) => {
      tl.to(c.p, { ang: `+=${Math.PI * 2}`, duration: SPIN_S, ease: 'power2.inOut', onUpdate: () => applyHelix(c) }, T_SPIN);
    });
    tl.to(this.camera.position, { x: this._camHome.x, y: this._camHome.y, z: this._camHome.z, duration: SPIN_S + 0.3, ease: 'power2.inOut' }, T_SPIN - 0.1);
    tl.to(this._lookAt, { y: 0.45, duration: SPIN_S + 0.3, ease: 'power2.inOut' }, T_SPIN - 0.1);
    tl.to(this, { _runeSpeed: 1.1, duration: 1.0 }, T_SPIN);

    /* ---- Act4 發牌：卡陣甩牌到兩排落點 ---- */
    this.cards.forEach((c, i) => {
      const t0 = T_DEAL + i * DEAL_STAGGER_S;
      // 由螺旋參數座標銜接到世界座標補間
      tl.add(() => {
        gsap.killTweensOf(c.p);
      }, t0);
      tl.to(c.grp.position, { x: c.slot.x, y: c.slot.y, z: c.slot.z, duration: DEAL_S, ease: 'power3.out' }, t0);
      tl.to(c.grp.rotation, { y: Math.PI, z: 0, duration: DEAL_S, ease: 'power2.out' }, t0);
      tl.to(c.grp.scale, { x: 1, y: 1, z: 1, duration: DEAL_S, ease: 'back.out(1.3)' }, t0);
    });

    /* ---- Act5 翻面：素材卡跳動翻面；英雄卡＝全螢幕登場大轉場 → 吸入卡格翻開 ---- */
    let t = T_DEAL + DEAL_S + (this.cards.length - 1) * DEAL_STAGGER_S + 0.15;
    this.cards.forEach((c) => {
      if (c.rare && c.splash) {
        // 白閃切場（大轉場入口）
        tl.to(this.flash.material, { opacity: 0.9, duration: 0.1, ease: 'power1.in' }, t);
        tl.to(this.flash.material, { opacity: 0, duration: 0.18 }, t + 0.1);
        // 換上該英雄的貼圖並顯示登場層
        tl.add(() => {
          this.spWashMat.map = c.splash.wash;
          this.spWashMat.needsUpdate = true;
          if (c.splash.artTex) {
            this.spArtMat.map = c.splash.artTex;
            this.spArtMat.needsUpdate = true;
          }
          this.spNameMat.map = c.splash.nameTex;
          this.spNameMat.needsUpdate = true;
          this.splash.visible = true;
          this.splash.position.set(0, 0.85, 4.4);
          this.splash.scale.setScalar(1);
        }, t + 0.05);
        const tIn = t + 0.08;
        // 亮度配比：厚壓暗幕隔離背景，光暈/光芒收斂——角色是主角，不是白光
        tl.fromTo(this.spDimMat, { opacity: 0 }, { opacity: 0.88, duration: SPLASH_IN_S * 0.6 }, tIn);
        tl.fromTo(this.spWashMat, { opacity: 0 }, { opacity: 0.42, duration: SPLASH_IN_S }, tIn);
        tl.fromTo(this.spRaysMat, { opacity: 0 }, { opacity: 0.5, duration: SPLASH_IN_S }, tIn);
        tl.fromTo(this.spArt.position, { x: 2.0 }, { x: 0.62, duration: SPLASH_IN_S, ease: 'power3.out' }, tIn);
        tl.fromTo(this.spArtMat, { opacity: 0 }, { opacity: 1, duration: SPLASH_IN_S * 0.6 }, tIn);
        tl.fromTo(this.spArt.scale, { x: 1.18, y: 1.18 }, { x: 1, y: 1, duration: SPLASH_IN_S, ease: 'power2.out' }, tIn);
        tl.fromTo(this.spName.scale, { x: 2.2, y: 2.2 }, { x: 1, y: 1, duration: 0.24, ease: 'back.out(2)' }, tIn + 0.14);
        tl.fromTo(this.spNameMat, { opacity: 0 }, { opacity: 1, duration: 0.1 }, tIn + 0.14);
        // 亮相停留 → 整層縮吸進該卡格（沿鏡頭→卡格視線收斂）
        const tOut = tIn + SPLASH_IN_S + SPLASH_HOLD_S;
        tl.to(this.splash.position, {
          x: () => {
            const s = (this.splash.position.z - this.camera.position.z) / (c.slot.z - this.camera.position.z);
            return this.camera.position.x + (c.slot.x - this.camera.position.x) * s;
          },
          y: () => {
            const s = (this.splash.position.z - this.camera.position.z) / (c.slot.z - this.camera.position.z);
            return this.camera.position.y + (c.slot.y - this.camera.position.y) * s;
          },
          duration: SPLASH_OUT_S,
          ease: 'power2.in',
        }, tOut);
        tl.to(this.splash.scale, { x: 0.07, y: 0.07, z: 0.07, duration: SPLASH_OUT_S, ease: 'power2.in' }, tOut);
        tl.to([this.spDimMat, this.spWashMat, this.spRaysMat, this.spArtMat, this.spNameMat], { opacity: 0, duration: SPLASH_OUT_S * 0.85, ease: 'power1.in' }, tOut + 0.06);
        tl.add(() => {
          this.splash.visible = false;
        }, tOut + SPLASH_OUT_S + 0.02);
        // 卡片在吸入尾端翻開 + 金粒爆 + 背後光芒
        const tFlip = tOut + SPLASH_OUT_S * 0.55;
        tl.to(c.grp.rotation, { y: 0, duration: FLIP_S, ease: 'back.out(1.4)' }, tFlip);
        tl.to(c.grp.position, { y: c.slot.y + 0.18, duration: FLIP_S / 2, yoyo: true, repeat: 1, ease: 'power2.out' }, tFlip);
        tl.to(c.grp.scale, { x: 1.12, y: 1.12, duration: FLIP_S / 2, yoyo: true, repeat: 1 }, tFlip);
        tl.add(() => {
          this._goldBurst(c.grp.position);
          this._attachRays(c);
        }, tFlip + FLIP_S * 0.5);
        tl.to(this.bloom, { strength: BLOOM_BASE + 0.9, duration: 0.1 }, tFlip + FLIP_S * 0.5);
        tl.to(this.bloom, { strength: BLOOM_BASE, duration: 0.45, ease: 'power2.out' }, tFlip + FLIP_S * 0.5 + 0.1);
        t = tOut + SPLASH_OUT_S + 0.2;
      } else {
        tl.to(c.grp.rotation, { y: 0, duration: FLIP_S, ease: 'back.out(1.4)' }, t);
        tl.to(c.grp.position, { y: c.slot.y + 0.18, duration: FLIP_S / 2, yoyo: true, repeat: 1, ease: 'power2.out' }, t);
        tl.to(c.grp.scale, { x: 1.12, y: 1.12, duration: FLIP_S / 2, yoyo: true, repeat: 1 }, t);
        t += FLIP_STAGGER_S;
      }
    });

    /* ---- 收尾：法陣轉暗、鏡頭微退 ---- */
    this.circleLayers.forEach((L) => tl.to(L.mat, { opacity: 0.5, duration: 0.6 }, t));
    tl.to(this.camera.position, { z: this._camHome.z + 0.3, duration: 0.8, ease: 'sine.out' }, t);

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) tl.progress(1);
  }

  // 稀有卡背後旋轉光芒
  _attachRays(c) {
    if (this.destroyed || c.rays) return;
    const mat = this._track(new THREE.MeshBasicMaterial({ map: this._bakeRays(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    const mesh = new THREE.Mesh(this._track(new THREE.PlaneGeometry(2.6, 2.6)), mat);
    mesh.position.copy(c.grp.position);
    mesh.position.z -= 0.08;
    this.scene.add(mesh);
    c.rays = mesh;
    this._rareRays.push(mesh);
    gsap.to(mat, { opacity: 0.85, duration: 0.3 });
  }

  _goldBurst(pos) {
    if (this.destroyed) return;
    const N = 26;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const mat = new THREE.PointsMaterial({ size: 0.13, map: this._dotTex, color: GOLD, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
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

    for (const L of this.circleLayers) L.mesh.rotation.z += dt * L.spin;
    this.runeRing.rotation.y += dt * this._runeSpeed;
    for (const r of this._rareRays) r.rotation.z += dt * 0.7;
    if (this.splash.visible) this.spRays.rotation.z += dt * 0.9; // 登場大光芒旋轉
    this.stars.rotation.y += dt * 0.008;

    const p = this.points.geometry.attributes.position;
    for (let i = 0; i < this._pMeta.length; i += 1) {
      const m = this._pMeta[i];
      m.a += dt * m.speed;
      m.y += dt * m.rise;
      if (m.y > 2.6) m.y = -1.6;
      p.setXYZ(i, Math.cos(m.a) * m.r, m.y, Math.sin(m.a) * m.r * 0.7);
    }
    p.needsUpdate = true;

    this.camera.lookAt(this._lookAt);
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
          // 連點保護：按鈕被移除後排隊中的第二個 click 仍會派發到舊節點——
          // 沒有這個 guard 會多抽一批並開出並行演出（卡死主因）
          if (againBtn.disabled) return;
          againBtn.disabled = true;
          const next = onAgain(times);
          if (next && next.length) {
            this._removeActions();
            this.skipBtn.style.display = '';
            this.play(next);
          } else {
            againBtn.disabled = false;
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
      gsap.killTweensOf([c.grp.position, c.grp.rotation, c.grp.scale, c.backMat.color, c.p]);
      this.scene.remove(c.grp);
      if (c.rays) {
        this.scene.remove(c.rays);
        this._rareRays = this._rareRays.filter((r) => r !== c.rays);
      }
    }
    this.cards = [];
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.tl?.kill();
    gsap.ticker.remove(this._tick);
    window.removeEventListener('resize', this._onResize);
    gsap.killTweensOf([this.camera.position, this.pMat, this.bloom, this.flash.material, this.portal.scale, this._lookAt, this]);
    for (const s of this.streaks) gsap.killTweensOf([s.mat, s.mesh.position]);
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

// '#rrggbb' → 'rgba(r,g,b,a)'
function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 0xff},${(n >> 8) & 0xff},${n & 0xff},${a})`;
}
