# Spec 4 — 前端 log 化 + AnimationDirector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 前端斷開 live engine：`simulateBattle` 瞬間算完 → `Replayer` 供狀態 → `AnimationDirector` 控節奏 → `BattleScene` 由 setup 建場、訂閱 replayer 事件。

**Architecture:** 先補 log 資料（energy/round/level），再擴 Replayer，再做純節奏層 director，最後 render 層換線。每任務結束全套件綠 + build 成功。

**Tech Stack:** JavaScript (ESM)、Vitest、Pixi.js、GSAP。

## Global Constraints
- `src/battle/**` 與 `src/render/animationDirector.js` 不得 import pixi/gsap/DOM。
- 引擎行為不變：新增事件為**附加**，既有測試（85/85）不得改行為性斷言；同 seed 確定性必須維持。
- 能量事件格式固定 `{ type:'energy', uid, value }`（value = 變動後能量）；回合事件 `{ type:'round', round }`。
- DELAYS 精確值：turn 0.1、attack 0.25、ultimate 0.7、damage 0.18、heal 0.15、death 0.25、stunned 0.25、其餘 0。
- Spec：`docs/superpowers/specs/2026-07-02-spec4-log-frontend-design.md`。
- 每任務 commit，繁中訊息。render 層無單元測試 → 以 `npm run build` 驗證。

---

## Task 1: Log v2 —— energy / round 事件 + setup.level

**Files:**
- Modify: `src/battle/engine.js`、`src/battle/skills.js`、`src/battle/effects.js`、`src/battle/battleLog.js`
- Modify: `src/battle/battleLog.test.js`

**Interfaces:**
- Produces: engine 事件 `round` `{ round }`、`energy` `{ unit, value }`；log 條目 `{ type:'round', round }`、`{ type:'energy', uid, value }`；setup 快照加 `level`。

- [ ] **Step 1: 寫失敗測試**（battleLog.test.js 追加；沿用該檔既有的建隊/seed helper 慣例）

```js
describe('log v2：energy / round / level', () => {
  it('setup 快照含 level', () => {
    const { setup } = run(); // 沿用檔內既有 helper；若無，仿現有測試建 5v5 + seed
    for (const s of setup) expect(typeof s.level).toBe('number');
  });

  it('普攻後施放者收到 energy 條目（value 上升）', () => {
    const { log, setup } = run();
    const e = log.find((x) => x.type === 'energy');
    expect(e).toBeTruthy();
    expect(typeof e.uid).toBe('number');
    expect(typeof e.value).toBe('number');
  });

  it('大招施放後緊接 value 0 的 energy 條目（集氣歸零）', () => {
    const { log } = run();
    const i = log.findIndex((x) => x.type === 'ultimate');
    expect(i).toBeGreaterThan(-1);
    const after = log.slice(i + 1, i + 3); // ultimate 前一刻 engine 先歸零再 castSkill → 條目在 ultimate 前或後皆可,放寬:
    const zero = log.find((x) => x.type === 'energy' && x.value === 0);
    expect(zero).toBeTruthy();
  });

  it('round 條目存在且遞增', () => {
    const { log } = run();
    const rounds = log.filter((x) => x.type === 'round').map((x) => x.round);
    expect(rounds.length).toBeGreaterThan(0);
    for (let i = 1; i < rounds.length; i++) expect(rounds[i]).toBe(rounds[i - 1] + 1);
  });

  it('同 seed 確定性（含新條目）', () => {
    // 沿用既有確定性測試手法：_resetUid + 相同 seed 兩次 → log 深度相等
  });
});
```

- [ ] **Step 2: 跑測試確認失敗** — `npx vitest run src/battle/battleLog.test.js`

- [ ] **Step 3: 實作**

`src/battle/engine.js`：
- `_stepNormal` 中 `this.round += 1;` 之後：`this.emit('round', { round: this.round });`
- `_act` 技能分支 `u.energy = 0;` 之後：`this.emit('energy', { unit: u, value: 0 });`

`src/battle/skills.js` `normalAttack`：
```js
  caster.gainEnergy(caster.classDef.energyOnAction);
  ctx.emit('energy', { unit: caster, value: caster.energy });
  for (const ally of ctx.allies) {
    if (ally === caster || !ally.alive) continue;
    const gain = ally.classDef.energyOnAllyAction || 0;
    if (gain) { ally.gainEnergy(gain); ctx.emit('energy', { unit: ally, value: ally.energy }); }
  }
```

`src/battle/effects.js`：
- `dealDamage` 中 `target.gainEnergy(...)` 之後：`ctx.emit('energy', { unit: target, value: target.energy });`
- `applyEffect` `case 'energy'`：`u.gainEnergy(effect.amount); ctx.emit('energy', { unit: u, value: u.energy });`

`src/battle/battleLog.js`：
- `snapshot` 加 `level: u.level`。
- 訂閱：`engine.on('round', ({ round }) => log.push({ type: 'round', round }));`
  `engine.on('energy', ({ unit, value }) => log.push({ type: 'energy', uid: uidOf(unit), value }));`

- [ ] **Step 4: 全套件** — `npm test` PASS（既有測試不變）
- [ ] **Step 5: Commit** — `feat: 戰鬥 log v2（energy/round 事件 + setup.level）`

---

## Task 2: Replayer v2 —— energy / round 追蹤

**Files:**
- Modify: `src/battle/replayer.js`、`src/battle/replayer.test.js`

**Interfaces:**
- Produces: `Replayer.energyOf(uid)`、`Replayer.round`。
- Consumes: Task 1 的 `energy`/`round` 條目。

- [ ] **Step 1: 寫失敗測試**（replayer.test.js 追加；用 simulateBattle 真 log 或手造小 log）

```js
it('energy 條目更新 energyOf', () => {
  const setup = [{ uid: 1, team: 0, pos: 1, maxHp: 100 }];
  const r = new Replayer(setup, [{ type: 'energy', uid: 1, value: 25 }]);
  expect(r.energyOf(1)).toBe(0);
  r.step();
  expect(r.energyOf(1)).toBe(25);
});

it('round 條目更新 round', () => {
  const r = new Replayer([], [{ type: 'round', round: 3 }]);
  expect(r.round).toBe(0);
  r.step();
  expect(r.round).toBe(3);
});
```

- [ ] **Step 2: 確認失敗** → **Step 3: 實作**（state 加 `energy: 0`；`_apply` 加兩分支；`energyOf(uid)` 仿 `hpOf`；constructor `this.round = 0`）
- [ ] **Step 4: 全套件綠** → **Step 5: Commit** — `feat: Replayer 追蹤 energy/round（供前端畫條與狀態列）`

---

## Task 3: AnimationDirector（純節奏層）

**Files:**
- Create: `src/render/animationDirector.js`、`src/render/animationDirector.test.js`

**Interfaces:**
- Produces: `DELAYS`、`class AnimationDirector { constructor(replayer, { delays } = {}); speed; update(dt); get done() }`。
- Consumes: Replayer（只用 `done`/`step()`）。

- [ ] **Step 1: 寫失敗測試**

```js
import { AnimationDirector, DELAYS } from './animationDirector.js';
import { Replayer } from '../battle/replayer.js';

const mkReplayer = (log) => new Replayer([], log);

it('依 DELAYS 節奏播放：attack 後要等預算時間才播下一筆', () => {
  const r = mkReplayer([
    { type: 'attack' }, { type: 'attack' }, { type: 'attack' },
  ]);
  const d = new AnimationDirector(r);
  d.update(0.01);           // 第一筆立即播
  expect(r.cursor).toBe(1);
  d.update(0.1);            // 未達 0.25 預算
  expect(r.cursor).toBe(1);
  d.update(0.2);            // 累計超過
  expect(r.cursor).toBe(2);
});

it('零預算條目同幀連發', () => {
  const r = mkReplayer([
    { type: 'energy', uid: 1, value: 5 }, { type: 'round', round: 1 }, { type: 'buffchange', uid: 1 }, { type: 'attack' },
  ]);
  const d = new AnimationDirector(r);
  d.update(0.01);
  expect(r.cursor).toBe(4); // 三筆零預算 + 一筆 attack 全在同幀
});

it('speed 3 播完所需 update 次數少於 speed 1', () => {
  const log = Array.from({ length: 10 }, () => ({ type: 'attack' }));
  const count = (speed) => {
    const r = mkReplayer([...log]);
    const d = new AnimationDirector(r);
    d.speed = speed;
    let n = 0;
    while (!d.done && n < 1000) { d.update(0.05); n += 1; }
    return n;
  };
  expect(count(3)).toBeLessThan(count(1));
});

it('done 跟隨 replayer', () => {
  const r = mkReplayer([{ type: 'attack' }]);
  const d = new AnimationDirector(r);
  expect(d.done).toBe(false);
  d.update(1);
  expect(d.done).toBe(true);
});
```

- [ ] **Step 2: 確認失敗** → **Step 3: 實作**

```js
// src/render/animationDirector.js
// 動畫節奏層：把 replayer 的事件流按型別時間預算播出。純邏輯，不碰 pixi/gsap。
export const DELAYS = {
  turn: 0.1, attack: 0.25, ultimate: 0.7, damage: 0.18,
  heal: 0.15, death: 0.25, stunned: 0.25,
};

export class AnimationDirector {
  constructor(replayer, { delays = DELAYS } = {}) {
    this.replayer = replayer;
    this.delays = delays;
    this.speed = 1;
    this._wait = 0;
  }
  get done() { return this.replayer.done; }
  update(dt) {
    if (this.done) return;
    this._wait -= dt * this.speed;
    while (this._wait <= 0 && !this.replayer.done) {
      const entry = this.replayer.step();
      this._wait += this.delays[entry.type] ?? 0;
    }
  }
}
```

- [ ] **Step 4: 全套件綠** → **Step 5: Commit** — `feat: AnimationDirector 節奏層（事件型別時間預算 × 變速）`

---

## Task 4: BattleScene log 化 + cut-in 橫幅 / 震屏

**Files:**
- Modify: `src/render/battleScene.js`、`src/render/fx.js`

**Interfaces:**
- Produces: `BattleScene(app, setup, replayer)`、`scene.setInstant(bool)`；fx `banner(layer, textObj)`、`screenShake(container, strength = 6)`。
- Consumes: Replayer 事件（payload 為 uid）、`SKILLS`（技能名）、`ENERGY_MAX`。

- [ ] **Step 1: fx.js 新增**
  - `banner(layer, textObj)`：置中（呼叫端先設 x/y）、`scale 0.6→1` back.out 進場 0.25s、停留 0.6s、alpha 淡出 0.3s、onComplete destroy（仿 `floatText` 的 done 防重複銷毀寫法）。
  - `screenShake(container, strength = 6)`：記 `_homeX/_homeY`，x/y 快速抖 4~5 下（0.04s/下）回原位；`gsap.killTweensOf(container)` 防疊。

- [ ] **Step 2: battleScene.js 改造**（重點差異；其餘結構沿用）
  - constructor `(app, setup, replayer)`；`this.setup = setup; this.replayer = replayer; this._instant = false;`
  - `_buildUnits()`：迭代 `setup`（每筆有 uid/team/pos/name/level/element/class/maxHp）；`_makeSprite(info)` 改吃 setup 快照（name 行：`${info.name} Lv${info.level}`）；`sprite._info = info`（不再 `_unit`）。
  - `renderTick()`：
    ```js
    for (const [uid, sprite] of this.sprites) {
      const info = sprite._info;
      const hp = this.replayer.hpOf(uid);
      const energy = this.replayer.energyOf(uid);
      // …_bar(hp / info.maxHp)、_bar(Math.min(1, energy / ENERGY_MAX))
      if (!this.replayer.aliveOf(uid) && !this._dead.has(uid)) {
        this._dead.add(uid);
        sprite.alpha = 0.25; sprite.scale.set(0.85); // 跳過/瞬時模式下的終局視覺
      }
    }
    ```
  - `_bindEvents()`：訂閱 `this.replayer`，payload 用 uid：
    - 每個 handler 開頭 `if (this._instant) return;`
    - `attack`：`sprites.get(attackerUid)` → lunge（方向由 `_info.team`）。
    - `ultimate`：ultPulse + 震屏（`screenShake(this.root)`）+ 技能名橫幅：`SKILLS[skill]?.name ?? skill` 建 Text（fontSize 34、fill 元素色、粗體、黑描邊）置於畫面中央 `banner(this.fxLayer, txt)`。
    - `damage`：hitFlash + 飄字；`isCrit` → 文字 `暴擊 ${amount}`、fontSize 30、fill 0xffa940；並 `screenShake(this.root, 4)`。
    - `stunned`：飄「暈眩」灰字。
    - `heal`/`death` 同現行（death 走 `_dead` 集合去重，與 renderTick 共用）。
  - `setInstant(v)`：`this._instant = v;`
  - import 改：`SKILLS`（`../battle/skills.js`）、`ENERGY_MAX` 保留、移除對 engine 的依賴。
- [ ] **Step 3: 驗證** — `npm test`（全綠）、`npm run build`（成功；此任務無單元測試，靠 Task 5 整合後手動）
- [ ] **Step 4: Commit** — `feat: BattleScene 改由 setup+replayer 驅動；大招橫幅與震屏、暴擊飄字`

---

## Task 5: BattleController 重接（log 播放取代 live engine）

**Files:**
- Modify: `src/render/battleController.js`

**Interfaces:**
- Consumes: `simulateBattle`、`Replayer`、`AnimationDirector`、新 `BattleScene`。
- HUD/main.js 介面不變（`setSpeed`/`skip`/`restart`/`speed`）。

- [ ] **Step 1: 實作**
  - 移除 `BattleEngine` import；改 import `simulateBattle`、`Replayer`、`AnimationDirector`。
  - `start()`：
    ```js
    this._teardownScene();
    const player = buildPlayerUnits(store.state);
    if (player.length === 0) { /* 現行提示 */ this.replayer = null; this.director = null; return; }
    const stage = store.state.progress.stage || 1;
    const enemy = buildEnemyUnits(stage, new Rng());
    const sim = simulateBattle(player, enemy, { rng: new Rng() });
    this.replayer = new Replayer(sim.setup, sim.log);
    this.scene = new BattleScene(this.app, sim.setup, this.replayer);
    this.director = new AnimationDirector(this.replayer);
    this.director.speed = this.speed;
    this.replayer.on('battleEnd', ({ winner }) => this._onEnd(winner));
    this._cooldown = 0;
    ```
  - `setSpeed(x)`：`this.speed = x; if (this.director) this.director.speed = x;`
  - `skip()`：`if (!this.replayer || this.replayer.done) return; this.scene?.setInstant(true); this.replayer.skipToEnd(); this.scene?.renderTick();`
  - `_tick(ticker)`：`engine` 判斷全部換 `replayer`/`director`：
    - `if (!this.replayer) return;`
    - `if (this.replayer.done) { scene.renderTick(); 冷卻倒數重開（現行）; return; }`
    - `this.director.update(dt); this.scene?.renderTick(); this._renderStatus();`
  - `_renderStatus()`：存活數 `this.replayer.setup ? …` —— 用 `sim.setup`（存 `this._setup = sim.setup`）統計：
    `const a = this._setup.filter((u) => u.team === 0 && this.replayer.aliveOf(u.uid)).length;`（敵方同理）；回合 = `this.replayer.round`。
  - 舊 `engine` 欄位全移除；`this.engine` 不再存在（確認 repo 內無其他讀取 `controller.engine` 之處；main.js/hud 只用 speed/skip/restart）。
- [ ] **Step 2: 驗證** — `npm test` 全綠、`npm run build` 成功。
- [ ] **Step 3: Commit** — `feat: 戰鬥改為 log 播放（simulateBattle→Replayer→Director），skip=瞬間結算`

---

## Self-Review
- Spec §1→T1、§2→T2、§3→T3、§4→T4、§5→T5，檔案清單吻合。
- 相依順序：T1（資料）→T2（狀態）→T3（節奏）→T4（畫面）→T5(接線）；T1~T3 皆可獨立測試,T4/T5 靠 build+整合。
- 風險點:跳過時事件洪流 → `setInstant` 擋 tween;死亡視覺與 skip 的一致性 → renderTick 以 `aliveOf` 補套終局視覺。
- 獎勵時機不變:battleEnd 於播放到尾/跳過當下由 replayer emit。
