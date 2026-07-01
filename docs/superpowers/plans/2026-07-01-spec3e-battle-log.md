# Spec 3e — 戰鬥 Log / Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 後端算全場 → 可序列化戰鬥 log；Replayer 消費 log 播放/跳過；前端加 skip。

**Architecture:** 純模組先做(battleLog、replayer,皆可單元測試),再做 render 層 skip(build 驗證)。每任務結束全套件綠。

**Tech Stack:** JavaScript (ESM)、Vitest、Pixi。

## Global Constraints
- 引擎/log/replayer(`src/battle/**`)不得 import pixi/gsap/DOM。Vitest。
- Log 自足:`setup`(初始快照)+ `log`(有序事件,以 uid 表示)。確定性:同 setup+seed → 相同 log。
- Spec:`docs/superpowers/specs/2026-07-01-spec3e-battle-log-design.md`。
- 每任務 commit,繁中訊息。

---

## Task 1: battleLog.js（log 產生器）

**Files:**
- Create: `src/battle/battleLog.js`、`src/battle/battleLog.test.js`

**Interfaces:**
- Consumes: `BattleEngine`。
- Produces: `simulateBattle(teamA, teamB, { rng }) → { setup, log, winner, rounds }`。

- [ ] **Step 1: 寫失敗測試**

```js
// src/battle/battleLog.test.js
import { describe, it, expect } from 'vitest';
import { simulateBattle } from './battleLog.js';
import { _resetUid } from './unit.js';
import { makeUnit } from './testHelpers.js';
import { Rng } from '../core/rng.js';

function build() {
  _resetUid(1);
  const a = makeUnit({ team: 0, pos: 1, class: 'dps', name: 'A', atk: 150, hp: 1000 });
  const b = makeUnit({ team: 1, pos: 1, class: 'tank', name: 'B', hp: 1200 });
  return [[a], [b]];
}

describe('battleLog', () => {
  it('確定性：同 seed → 相同 log 與 winner', () => {
    const [a1, b1] = build();
    const r1 = simulateBattle(a1, b1, { rng: new Rng(42) });
    const [a2, b2] = build();
    const r2 = simulateBattle(a2, b2, { rng: new Rng(42) });
    expect(r1.log).toEqual(r2.log);
    expect(r1.winner).toBe(r2.winner);
  });

  it('log 可序列化、battleEnd 為最後一筆', () => {
    const [a, b] = build();
    const { setup, log, winner } = simulateBattle(a, b, { rng: new Rng(7) });
    expect(setup[0]).toHaveProperty('uid');
    expect(setup[0]).toHaveProperty('maxHp');
    expect(JSON.parse(JSON.stringify(log))).toEqual(log); // 只含原始值
    const last = log[log.length - 1];
    expect(last.type).toBe('battleEnd');
    expect(last.winner).toBe(winner);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/battle/battleLog.test.js`
Expected: FAIL（`battleLog.js` 不存在）

- [ ] **Step 3: 實作**

```js
// src/battle/battleLog.js
// 戰鬥 Log 產生器：跑完整場、收集初始快照 + 有序事件成可序列化 log。
import { BattleEngine } from './engine.js';

function snapshot(u) {
  return { uid: u.uid, team: u.team, pos: u.pos, name: u.name, element: u.element, class: u.class, cardId: u.cardId, maxHp: u.maxHp };
}
const uidOf = (u) => (u ? u.uid : null);

export function simulateBattle(teamA, teamB, { rng } = {}) {
  const engine = new BattleEngine(teamA, teamB, { rng });
  const setup = [...teamA, ...teamB].map(snapshot);
  const log = [];
  engine.on('turn', ({ unit }) => log.push({ type: 'turn', uid: uidOf(unit) }));
  engine.on('attack', ({ attacker, target, skill }) => log.push({ type: 'attack', attackerUid: uidOf(attacker), targetUid: uidOf(target), skill }));
  engine.on('ultimate', ({ caster, skill, target }) => log.push({ type: 'ultimate', casterUid: uidOf(caster), skill, targetUid: uidOf(target) }));
  engine.on('damage', (p) => log.push({ type: 'damage', sourceUid: uidOf(p.source), targetUid: uidOf(p.target), amount: p.amount, skill: p.skill, isAdvantage: !!p.isAdvantage, isDisadvantage: !!p.isDisadvantage, isCrit: !!p.isCrit }));
  engine.on('heal', (p) => log.push({ type: 'heal', sourceUid: uidOf(p.source), targetUid: uidOf(p.target), amount: p.amount }));
  engine.on('death', ({ unit }) => log.push({ type: 'death', uid: uidOf(unit) }));
  engine.on('stunned', ({ unit }) => log.push({ type: 'stunned', uid: uidOf(unit) }));
  engine.on('buffchange', ({ unit }) => log.push({ type: 'buffchange', uid: uidOf(unit) }));
  engine.on('battleEnd', ({ winner }) => log.push({ type: 'battleEnd', winner }));

  const MAX = 100000;
  let steps = 0;
  while (!engine.over && steps < MAX) { engine.step(); steps += 1; }
  return { setup, log, winner: engine.winner, rounds: engine.round };
}
```

- [ ] **Step 4: 跑全套件確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/battle/battleLog.js src/battle/battleLog.test.js
git commit -m "feat: 戰鬥 Log 產生器 simulateBattle（可序列化 setup + 有序事件）"
```

---

## Task 2: replayer.js（消費 log）

**Files:**
- Create: `src/battle/replayer.js`、`src/battle/replayer.test.js`

**Interfaces:**
- Consumes: `EventEmitter`（core/events）。
- Produces: `class Replayer { on, step, playAll, skipToEnd, done, winner, hpOf(uid), aliveOf(uid), cursor }`。

- [ ] **Step 1: 寫失敗測試**

```js
// src/battle/replayer.test.js
import { describe, it, expect } from 'vitest';
import { Replayer } from './replayer.js';
import { simulateBattle } from './battleLog.js';
import { _resetUid } from './unit.js';
import { makeUnit } from './testHelpers.js';
import { Rng } from '../core/rng.js';

function sim() {
  _resetUid(1);
  const a = makeUnit({ team: 0, pos: 1, class: 'dps', name: 'A', atk: 200, hp: 1000 });
  const b = makeUnit({ team: 1, pos: 1, class: 'tank', name: 'B', hp: 800 });
  return simulateBattle([a], [b], { rng: new Rng(9) });
}

describe('Replayer', () => {
  it('step 依序 emit 與 log 相同的 type 序列', () => {
    const { setup, log } = sim();
    const r = new Replayer(setup, log);
    const seen = [];
    ['turn', 'attack', 'ultimate', 'damage', 'heal', 'death', 'stunned', 'buffchange', 'battleEnd'].forEach((t) => r.on(t, (e) => seen.push(e.type)));
    while (!r.done) r.step();
    expect(seen).toEqual(log.map((e) => e.type));
  });

  it('hp 追蹤：首筆 damage 後 = maxHp - amount', () => {
    const { setup, log } = sim();
    const r = new Replayer(setup, log);
    let e;
    do { e = r.step(); } while (e && e.type !== 'damage');
    const maxHp = setup.find((u) => u.uid === e.targetUid).maxHp;
    expect(r.hpOf(e.targetUid)).toBe(maxHp - e.amount);
  });

  it('skipToEnd 到終局、winner 正確', () => {
    const { setup, log, winner } = sim();
    const r = new Replayer(setup, log);
    r.skipToEnd();
    expect(r.done).toBe(true);
    expect(r.winner).toBe(winner);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/battle/replayer.test.js`
Expected: FAIL（`replayer.js` 不存在）

- [ ] **Step 3: 實作**

```js
// src/battle/replayer.js
// 消費戰鬥 log 重播：追蹤 hp/alive，可逐步或跳到結尾。不需引擎。
import { EventEmitter } from '../core/events.js';

export class Replayer {
  constructor(setup, log) {
    this.setup = setup;
    this.log = log;
    this.cursor = 0;
    this.winner = null;
    this.emitter = new EventEmitter();
    this.state = new Map();
    for (const u of setup) this.state.set(u.uid, { hp: u.maxHp, maxHp: u.maxHp, alive: true });
  }

  on(event, fn) { return this.emitter.on(event, fn); }
  get done() { return this.cursor >= this.log.length; }

  _apply(entry) {
    if (entry.type === 'damage') {
      const s = this.state.get(entry.targetUid);
      if (s) { s.hp = Math.max(0, s.hp - entry.amount); if (s.hp === 0) s.alive = false; }
    } else if (entry.type === 'heal') {
      const s = this.state.get(entry.targetUid);
      if (s) s.hp = Math.min(s.maxHp, s.hp + entry.amount);
    } else if (entry.type === 'death') {
      const s = this.state.get(entry.uid);
      if (s) s.alive = false;
    } else if (entry.type === 'battleEnd') {
      this.winner = entry.winner;
    }
  }

  step() {
    if (this.done) return null;
    const entry = this.log[this.cursor];
    this.cursor += 1;
    this._apply(entry);
    this.emitter.emit(entry.type, entry);
    return entry;
  }

  playAll() { while (!this.done) this.step(); }
  skipToEnd() { this.playAll(); }

  hpOf(uid) { return this.state.get(uid)?.hp ?? 0; }
  aliveOf(uid) { return this.state.get(uid)?.alive ?? false; }
}
```

- [ ] **Step 4: 跑全套件確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/battle/replayer.js src/battle/replayer.test.js
git commit -m "feat: Replayer 消費戰鬥 log（逐步播放 / 跳到結尾 / hp 追蹤）"
```

---

## Task 3: 前端 skip 按鈕

**Files:**
- Modify: `src/render/battleController.js`（`skip()`）
- Modify: `src/ui/hud.js`（跳過按鈕 + `onSkip`）
- Modify: `src/main.js`（接線）

**Interfaces:**
- Produces: `BattleController.skip()`（快轉當前 live engine 到結束並 renderTick）;HUD `⏩ 跳過` 按鈕。
- 驗收:`npm run build` 成功 + `npm test` 綠(此任務不加單元測試——render/UI 層,以 build 驗證)。

- [ ] **Step 1: `battleController.js` 加 `skip()`**

在類別內新增:
```js
  // 快轉當前戰鬥到結束（不逐格動畫），再刷新一次畫面。battleEnd 事件照常觸發結算。
  skip() {
    if (!this.engine || this.engine.over) return;
    let guard = 0;
    while (!this.engine.over && guard < 100000) {
      this.engine.step();
      guard += 1;
    }
    this.scene?.renderTick();
  }
```

- [ ] **Step 2: `hud.js` 加跳過按鈕**

`Hud` constructor 的 opts 解構加入 `onSkip`：
```js
  constructor(root, { onSpeedChange, getSpeed, onReset, onSkip } = {}) {
    ...
    this.onSkip = onSkip;
    ...
  }
```
在 `render()` 內、速度按鈕(`speedWrap`)之後、清檔按鈕之前,加入:
```js
    this.root.appendChild(
      el('button', {
        text: '⏩ 跳過',
        onClick: () => this.onSkip?.(),
      })
    );
```

- [ ] **Step 3: `main.js` 接線**

找到建立 `Hud` 的地方(傳入 `onSpeedChange`/`getSpeed`/`onReset` 的物件),加入 `onSkip: () => controller.skip()`（`controller` 為該檔中 `BattleController` 實例的變數名——先讀 `main.js` 確認變數名再接線;若 Hud 於 controller 建立前初始化,改用 `onSkip: () => controller?.skip()` 或調整順序確保能取得實例）。

- [ ] **Step 4: 驗收**

Run: `npm run build`
Expected: 成功

Run: `npm test`
Expected: 綠（不受影響）

- [ ] **Step 5: Commit**

```bash
git add src/render/battleController.js src/ui/hud.js src/main.js
git commit -m "feat: HUD 加『跳過』按鈕，快轉當前戰鬥到結果"
```

---

## Self-Review
- Spec 覆蓋:log 產生器(T1)、replayer(T2)、前端 skip(T3)。
- 型別一致:`simulateBattle → {setup,log,winner,rounds}`、`Replayer`、`controller.skip()`。
- 綠燈:T1/T2 純新模組(可測);T3 render/UI,build 驗證。
- 純度:battleLog/replayer 不 import pixi/gsap/DOM。
