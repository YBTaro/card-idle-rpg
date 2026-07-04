// 狀態常駐特效：buff/debuff 掛在身上期間，角色體表持續顯示對應視覺
// （頭上小圖示之外的「看得見的狀態」）。狀態消失即拆除。
// 全部掛在單位容器內的專屬子容器，跟著單位移動/縮放；循環動畫只補間顯示物件
// （killFx 掃得到），拆除時逐一 killTweensOf。
import { gsap } from 'gsap';
import { Container, Graphics, Sprite } from 'pixi.js';

const COLOR = {
  shield: 0x9adcff,
  thorns: 0x9dde6a,
  counter: 0xffb066,
  dotFire: 0xff9a5c,
  dot: 0xc99cff,
  hot: 0x8ef2ae,
  silence: 0xbb8cff,
  taunt: 0xffd27a,
  nightmare: 0x9d7bff,
  dodge: 0x9be8c0,
  accuracy: 0xffd76a,
};

function killTree(cont) {
  gsap.killTweensOf(cont);
  if (cont.scale) gsap.killTweensOf(cont.scale);
  for (const c of cont.children) {
    gsap.killTweensOf(c);
    if (c.scale) gsap.killTweensOf(c.scale);
    if (c.children?.length) killTree(c);
  }
}

/* ---------- 各狀態的常駐視覺（回傳容器；動畫自帶 repeat:-1） ---------- */

// 護盾：半透明穹頂常駐 + 呼吸微光。
function shieldAura() {
  const cont = new Container();
  const g = new Graphics();
  g.ellipse(0, -62, 56, 76).fill({ color: COLOR.shield, alpha: 0.1 });
  g.ellipse(0, -62, 56, 76).stroke({ width: 2, color: COLOR.shield, alpha: 0.55 });
  g.blendMode = 'add';
  cont.addChild(g);
  gsap.fromTo(g, { alpha: 0.55 }, { alpha: 1, duration: 1.1, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  return cont;
}

// 荊棘：綠刺繞體緩轉。
function thornsAura() {
  const cont = new Container();
  cont.y = -52;
  const ring = new Container();
  cont.addChild(ring);
  const N = 6;
  for (let i = 0; i < N; i += 1) {
    const g = new Graphics();
    g.moveTo(0, -5).lineTo(20, 0).lineTo(0, 5).closePath().fill({ color: COLOR.thorns, alpha: 0.85 });
    g.blendMode = 'add';
    const a = (i / N) * Math.PI * 2;
    g.rotation = a;
    g.x = Math.cos(a) * 52;
    g.y = Math.sin(a) * 34;
    ring.addChild(g);
  }
  ring.scale.y = 0.72; // 透視壓扁
  gsap.to(ring, { rotation: Math.PI * 2, duration: 6, repeat: -1, ease: 'none' });
  return cont;
}

// 反擊：橙色備斬弦月在肩側脈動。
function counterAura(team) {
  const cont = new Container();
  cont.x = team === 0 ? 30 : -30;
  cont.y = -96;
  const g = new Graphics();
  g.arc(0, 0, 20, -1.1, 1.2).stroke({ width: 5, color: COLOR.counter, alpha: 0.9 });
  g.arc(0, 0, 15, -0.9, 1.0).stroke({ width: 2, color: 0xfff2c8, alpha: 0.8 });
  g.blendMode = 'add';
  g.rotation = team === 0 ? -0.4 : Math.PI + 0.4;
  cont.addChild(g);
  gsap.fromTo(g, { alpha: 0.5 }, { alpha: 1, duration: 0.55, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  gsap.fromTo(g.scale, { x: 0.9, y: 0.9 }, { x: 1.1, y: 1.1, duration: 0.55, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  return cont;
}

// 上升光屑循環（DoT 餘燼 / HoT 再生共用；色不同、DoT 稍快）。
function risingMotes(dotTex, color, { speed = 1 } = {}) {
  const cont = new Container();
  if (!dotTex) return cont;
  for (let i = 0; i < 3; i += 1) {
    const p = new Sprite(dotTex);
    p.anchor.set(0.5);
    p.blendMode = 'add';
    p.tint = color;
    p.scale.set(0.28);
    p.x = Math.random() * 40 - 20;
    p.y = -20;
    cont.addChild(p);
    gsap.fromTo(
      p,
      { y: -18, alpha: 0.9 },
      {
        y: -108,
        alpha: 0,
        duration: (1.1 + Math.random() * 0.4) / speed,
        delay: i * 0.35,
        repeat: -1,
        ease: 'power1.out',
      }
    );
  }
  return cont;
}

// 沉默：頭側紫色禁言符（圓 + 斜線）。
function silenceAura() {
  const cont = new Container();
  cont.y = -150;
  const g = new Graphics();
  g.circle(0, 0, 11).stroke({ width: 3, color: COLOR.silence, alpha: 0.9 });
  g.moveTo(-7, 7).lineTo(7, -7).stroke({ width: 3, color: COLOR.silence, alpha: 0.9 });
  g.blendMode = 'add';
  cont.addChild(g);
  gsap.fromTo(g, { alpha: 0.45 }, { alpha: 1, duration: 0.8, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  return cont;
}

// 靈壓領域（castDrain）：腳底紫色雙環反向緩轉——「干擾力場」。
function castDrainAura() {
  const cont = new Container();
  const mk = (r, w, alpha) => {
    const g = new Graphics();
    g.ellipse(0, 0, r, r * 0.36).stroke({ width: w, color: 0x9d7bff, alpha });
    g.blendMode = 'add';
    cont.addChild(g);
    return g;
  };
  const outer = mk(52, 3, 0.7);
  const inner = mk(38, 2, 0.5);
  gsap.to(outer, { rotation: Math.PI * 2, duration: 7, repeat: -1, ease: 'none' });
  gsap.to(inner, { rotation: -Math.PI * 2, duration: 5, repeat: -1, ease: 'none' });
  gsap.fromTo(cont, { alpha: 0.6 }, { alpha: 1, duration: 1.1, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  return cont;
}

// 凍結：冰藍結晶繞體（無法回能的「冰封感」）。
function freezeAura() {
  const cont = new Container();
  cont.y = -58;
  const N = 5;
  for (let i = 0; i < N; i += 1) {
    const g = new Graphics();
    g.moveTo(0, -9).lineTo(4, 0).lineTo(0, 9).lineTo(-4, 0).closePath().fill({ color: 0xbfe8ff, alpha: 0.9 });
    g.blendMode = 'add';
    const a = (i / N) * Math.PI * 2;
    g.x = Math.cos(a) * 42;
    g.y = Math.sin(a) * 28;
    g.rotation = a;
    cont.addChild(g);
  }
  gsap.fromTo(cont, { alpha: 0.55 }, { alpha: 1, duration: 1.2, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  gsap.to(cont, { rotation: Math.PI * 2, duration: 10, repeat: -1, ease: 'none' });
  return cont;
}

// 惡夢印記：三縷暗紫魅影繞頂緩轉——「被夢魘盯上」。
function nightmareAura() {
  const cont = new Container();
  cont.y = -148;
  const orbit = new Container();
  cont.addChild(orbit);
  for (let i = 0; i < 3; i += 1) {
    const g = new Graphics();
    g.moveTo(0, -8).bezierCurveTo(5, -3, 5, 3, 0, 8).bezierCurveTo(-5, 3, -5, -3, 0, -8).fill({ color: COLOR.nightmare, alpha: 0.85 });
    g.blendMode = 'add';
    const a = (i / 3) * Math.PI * 2;
    g.x = Math.cos(a) * 26;
    g.y = Math.sin(a) * 9;
    orbit.addChild(g);
  }
  gsap.to(orbit, { rotation: Math.PI * 2, duration: 3.2, repeat: -1, ease: 'none' });
  gsap.fromTo(orbit, { alpha: 0.5 }, { alpha: 1, duration: 1.0, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  orbit.scale.y = 0.5;
  return cont;
}

// 迴避：身側兩道風痕斜線交替閃現——「抓不到的殘影」。
function dodgeAura() {
  const cont = new Container();
  cont.y = -66;
  for (let i = 0; i < 2; i += 1) {
    const g = new Graphics();
    const side = i === 0 ? -1 : 1;
    g.moveTo(side * 34, -22).lineTo(side * 46, 6).stroke({ width: 3, color: COLOR.dodge, alpha: 0.85 });
    g.moveTo(side * 40, -14).lineTo(side * 50, 10).stroke({ width: 2, color: 0xf4fbff, alpha: 0.6 });
    g.blendMode = 'add';
    cont.addChild(g);
    gsap.fromTo(g, { alpha: 0.15 }, { alpha: 0.95, duration: 0.5, yoyo: true, repeat: -1, delay: i * 0.5, ease: 'sine.inOut' });
  }
  return cont;
}

// 命中：頭頂金色瞄準環（圓 + 十字刻度）緩轉——「無所遁形」。
function accuracyAura() {
  const cont = new Container();
  cont.y = -152;
  const g = new Graphics();
  g.circle(0, 0, 12).stroke({ width: 2, color: COLOR.accuracy, alpha: 0.9 });
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    g.moveTo(Math.cos(a) * 8, Math.sin(a) * 8).lineTo(Math.cos(a) * 15, Math.sin(a) * 15)
      .stroke({ width: 2, color: COLOR.accuracy, alpha: 0.9 });
  }
  g.circle(0, 0, 2.5).fill({ color: 0xfff2c8, alpha: 0.95 });
  g.blendMode = 'add';
  cont.addChild(g);
  gsap.to(g, { rotation: Math.PI * 2, duration: 5, repeat: -1, ease: 'none' });
  gsap.fromTo(g, { alpha: 0.5 }, { alpha: 1, duration: 0.9, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  return cont;
}

// 嘲諷：腳底金色挑釁環脈動。
function tauntAura() {
  const cont = new Container();
  const g = new Graphics();
  g.ellipse(0, 0, 46, 17).stroke({ width: 3, color: COLOR.taunt, alpha: 0.8 });
  g.ellipse(0, 0, 34, 12).stroke({ width: 1.5, color: 0xfff2c8, alpha: 0.6 });
  g.blendMode = 'add';
  cont.addChild(g);
  gsap.fromTo(g.scale, { x: 0.9, y: 0.9 }, { x: 1.08, y: 1.08, duration: 0.7, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  gsap.fromTo(g, { alpha: 0.5 }, { alpha: 1, duration: 0.7, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  return cont;
}

/* ---------- 同步器 ---------- */

// buff 摘要（replayer.buffsOf）→ 該顯示哪些常駐視覺的 key 集合。
function auraKeysOf(buffs) {
  const keys = new Set();
  for (const b of buffs) {
    if (b.kind === 'shield') keys.add('shield');
    else if (b.kind === 'thorns') keys.add('thorns');
    else if (b.kind === 'counter') keys.add('counter');
    else if (b.kind === 'dot') keys.add(b.element === 'fire' ? 'dot:fire' : 'dot');
    else if (b.kind === 'hot') keys.add('hot');
    else if (b.kind === 'castDrain') keys.add('castDrain');
    else if (b.kind === 'nightmare') keys.add('nightmare');
    else if (b.kind === 'stat' && b.stat === 'dodge' && !b.neg) keys.add('dodge');
    else if (b.kind === 'stat' && b.stat === 'accuracy' && !b.neg) keys.add('accuracy');
    else if (b.kind === 'control') keys.add(`control:${b.control}`);
  }
  return keys;
}

function buildAura(key, sprite, dotTex) {
  switch (key) {
    case 'shield': return shieldAura();
    case 'thorns': return thornsAura();
    case 'counter': return counterAura(sprite._info?.team ?? 0);
    case 'dot:fire': return risingMotes(dotTex, COLOR.dotFire, { speed: 1.3 });
    case 'dot': return risingMotes(dotTex, COLOR.dot, { speed: 1.3 });
    case 'hot': return risingMotes(dotTex, COLOR.hot);
    case 'castDrain': return castDrainAura();
    case 'nightmare': return nightmareAura();
    case 'dodge': return dodgeAura();
    case 'accuracy': return accuracyAura();
    case 'control:freeze': return freezeAura();
    case 'control:silence': return silenceAura();
    case 'control:taunt': return tauntAura();
    default: return null;
  }
}

// 每幀呼叫：內部以 key 比對，無變化零成本。死亡/跳過時傳空陣列即可全拆。
export function syncStatusAuras(sprite, buffs, dotTex) {
  const desired = auraKeysOf(buffs);
  const sig = [...desired].sort().join(',');
  if (sprite._auraSig === sig) return;
  sprite._auraSig = sig;

  const auras = (sprite._auras ??= new Map());
  for (const [key, cont] of auras) {
    if (!desired.has(key)) {
      auras.delete(key);
      killTree(cont);
      if (!cont.destroyed) cont.destroy({ children: true });
    }
  }
  for (const key of desired) {
    if (auras.has(key)) continue;
    const cont = buildAura(key, sprite, dotTex);
    if (!cont) continue;
    sprite.addChild(cont);
    auras.set(key, cont);
  }
}
