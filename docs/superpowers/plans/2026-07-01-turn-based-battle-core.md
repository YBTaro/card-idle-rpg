# 回合制戰鬥核心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「連續時間 + ATB 速度條」的自動戰鬥改成「固定 6 位置、回合制、普攻輪↔技能階段」的自動戰鬥，並加入暴擊。

**Architecture:** 採 expand/contract 重構順序：先建純函式葉模組（位置、暴擊、直行選擇器），再讓舊 ATB 引擎改吃「位置」資料，接著把引擎翻成離散 `step()` 狀態機，最後移除 `spd`。每個任務結束時整個 vitest 套件都是綠的。

**Tech Stack:** JavaScript (ESM)、Vite、Vitest、Pixi.js、GSAP。測試用 `npm test`（vitest）。

## Global Constraints

- 測試框架：**Vitest**；跑全部：`npm test`；跑單檔：`npx vitest run <path>`。
- 引擎層（`src/battle/**`）**不得** import pixi / gsap / DOM，維持可純單元測試。
- 所有平衡常數集中於各自的 data / 模組頂部，維持「可調參數」慣例。
- 位置模型：前排 `1/2/3`、後排 `4/5/6`；直行 A=(1,4)、B=(2,5)、C=(3,6)。
- 能量：`ENERGY_MAX = 100`；暴擊：`CRIT_CHANCE = 0.1`、`CRIT_MULT = 1.5`。
- 集氣（占位值）：普攻自身 `energyOnAction`（坦15/輸25/輔15）、被擊 `energyOnHitTaken`（坦20/輸8/輔8）、隊友普攻 `energyOnAllyAction`（輔12/其餘0）。
- Spec：`docs/superpowers/specs/2026-07-01-turn-based-battle-core-design.md`。
- 每個任務最後 commit；commit message 用繁中、feat/refactor/test/chore 前綴。

---

## File Structure

**新增**
- `src/battle/positions.js` — 位置模型純函式（`rowOf` / `columnOf` / `TURN_SEQUENCE`）。
- `src/battle/positions.test.js`
- `src/battle/damage.test.js` — 暴擊測試。

**修改**
- `src/battle/unit.js` — 移除 `atb`（Task6）、`spd`（Task9）；改吃 `pos`、加 `column`。
- `src/battle/testHelpers.js` — `makeUnit` 改用 `pos`。
- `src/battle/targeting.js` — 新增 `singleEnemyByColumn`；移除 `pickMeleeTarget`（Task5）。
- `src/battle/damage.js` — 暴擊。
- `src/battle/skills.js` — 普攻用直行選擇器 + 集氣（自身/隊友）；burst 改直行選擇器。
- `src/battle/engine.js` — 翻成離散 `step()` 雙階段狀態機。
- `src/data/classes.js` — 集氣欄位；移除 `spd`（Task9）。
- `src/data/cards.js` — 移除 `spd`（Task9）。
- `src/core/stats.js` — 移除 `spd`（Task9）。
- `src/systems/battleSetup.js` — 依 `pos` 建單位。
- `src/systems/formation.js` — `MAX_FORMATION=6`、以 `pos` 管理。
- `src/core/state.js` — 陣容存 `pos`。
- `src/core/save.js` — `row → pos` 遷移。
- `src/render/battleController.js` — 用累加器驅動 `step()`。
- `src/render/battleScene.js` — 移除藍條、依 `pos` 定位。
- `src/ui/rosterUI.js` — 6 位置編輯 UI、移除 spd 顯示。
- 測試：`engine.test.js`（Task6 重寫）、`targeting.test.js`、`gameflow.test.js`。

---

## Task 1: 位置模型 `positions.js`

**Files:**
- Create: `src/battle/positions.js`
- Test: `src/battle/positions.test.js`

**Interfaces:**
- Produces: `rowOf(pos: 1..6): 'front'|'back'`、`columnOf(pos: 1..6): 1|2|3`、
  `FRONT_POSITIONS=[1,2,3]`、`BACK_POSITIONS=[4,5,6]`、`ALL_POSITIONS=[1..6]`、
  `TURN_SEQUENCE: Array<[team:0|1, pos:1..6]>`（我1,敵1,…,我6,敵6）。

- [ ] **Step 1: 寫失敗測試**

```js
// src/battle/positions.test.js
import { describe, it, expect } from 'vitest';
import { rowOf, columnOf, TURN_SEQUENCE } from './positions.js';

describe('positions', () => {
  it('rowOf：1-3 前排、4-6 後排', () => {
    expect([1, 2, 3].map(rowOf)).toEqual(['front', 'front', 'front']);
    expect([4, 5, 6].map(rowOf)).toEqual(['back', 'back', 'back']);
  });

  it('columnOf：直行 1|4、2|5、3|6', () => {
    expect([columnOf(1), columnOf(4)]).toEqual([1, 1]);
    expect([columnOf(2), columnOf(5)]).toEqual([2, 2]);
    expect([columnOf(3), columnOf(6)]).toEqual([3, 3]);
  });

  it('TURN_SEQUENCE：我1,敵1,…,我6,敵6', () => {
    expect(TURN_SEQUENCE).toEqual([
      [0, 1], [1, 1], [0, 2], [1, 2], [0, 3], [1, 3],
      [0, 4], [1, 4], [0, 5], [1, 5], [0, 6], [1, 6],
    ]);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/battle/positions.test.js`
Expected: FAIL（`positions.js` 不存在）

- [ ] **Step 3: 實作**

```js
// src/battle/positions.js
// 位置模型：6 格固定站位。前排 1/2/3、後排 4/5/6；直行 A=(1,4) B=(2,5) C=(3,6)。
export const FRONT_POSITIONS = [1, 2, 3];
export const BACK_POSITIONS = [4, 5, 6];
export const ALL_POSITIONS = [1, 2, 3, 4, 5, 6];

export function rowOf(pos) {
  return pos <= 3 ? 'front' : 'back';
}

export function columnOf(pos) {
  return ((pos - 1) % 3) + 1; // 1|4→1, 2|5→2, 3|6→3
}

// 出手序列：我1,敵1,我2,敵2,…,我6,敵6
export const TURN_SEQUENCE = ALL_POSITIONS.flatMap((pos) => [[0, pos], [1, pos]]);
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/battle/positions.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/battle/positions.js src/battle/positions.test.js
git commit -m "feat: 新增位置模型 positions.js（前後排/直行/出手序列）"
```

---

## Task 2: Unit / testHelpers / battleSetup 改吃位置

讓 Unit 以 `pos` 建立、`row` 由 `pos` 推導、加 `column`；同時更新既有建構點。
本任務**保留** `spd` / `atb`，舊 ATB 引擎仍照常運作，全套件維持綠燈。

**Files:**
- Modify: `src/battle/unit.js`
- Modify: `src/battle/testHelpers.js`
- Modify: `src/systems/battleSetup.js`
- Modify: `src/battle/engine.test.js`（把建構參數 `row/slot` 改成 `pos`）
- Modify: `src/battle/targeting.test.js`（同上）

**Interfaces:**
- Consumes: `rowOf`、`columnOf`（Task 1）。
- Produces:
  - `new Unit(stats, { team, pos })`；欄位 `pos`、`team`、`row`（= `rowOf(pos)`）、
    getter `column`（= `columnOf(pos)`）、`hp/maxHp/atk/def/spd/energy`、`atb`、
    方法 `gainEnergy/takeDamage/heal`、getter `alive/isFront/classDef/hpRatio/energyRatio`。
  - `makeUnit({ team, pos, hp, atk, def, element, class, level, spd, energy })`。
  - `buildPlayerUnits(state)`、`buildEnemyUnits(stage, rng)` 回傳帶 `pos` 的 `Unit[]`。

- [ ] **Step 1: 改 `unit.js`**（保留 spd/atb；constructor 改 pos）

把 constructor 與衍生欄位改為：

```js
// src/battle/unit.js（頂部 import 追加）
import { CLASSES } from '../data/classes.js';
import { rowOf, columnOf } from './positions.js';

export const ATB_MAX = 500; // Task 6 之後移除
export const ENERGY_MAX = 100;

let _uidSeq = 1;

export class Unit {
  constructor(stats, { team, pos }) {
    this.uid = _uidSeq++;
    this.name = stats.name;
    this.element = stats.element;
    this.class = stats.class;
    this.level = stats.level;
    this.team = team;
    this.pos = pos;
    this.row = rowOf(pos);

    this.maxHp = stats.hp;
    this.hp = stats.hp;
    this.atk = stats.atk;
    this.def = stats.def;
    this.spd = stats.spd; // Task 9 移除

    this.atb = 0; // Task 6 移除
    this.energy = 0;
  }

  get column() {
    return columnOf(this.pos);
  }

  get alive() {
    return this.hp > 0;
  }

  get isFront() {
    return this.row === 'front';
  }

  get classDef() {
    return CLASSES[this.class];
  }

  get energyRatio() {
    return Math.min(1, this.energy / ENERGY_MAX);
  }

  get hpRatio() {
    return Math.max(0, this.hp / this.maxHp);
  }

  gainEnergy(amount) {
    this.energy = Math.min(ENERGY_MAX, this.energy + amount);
  }

  takeDamage(amount) {
    const dealt = Math.min(this.hp, Math.max(0, Math.round(amount)));
    this.hp -= dealt;
    return dealt;
  }

  heal(amount) {
    const healed = Math.min(this.maxHp - this.hp, Math.max(0, Math.round(amount)));
    this.hp += healed;
    return healed;
  }
}

export function _resetUid(n = 1) {
  _uidSeq = n;
}
```

（移除舊的 `atbRatio` getter 與 `slot` 欄位；`row` 改為由 `pos` 推導的實體欄位。）

- [ ] **Step 2: 改 `testHelpers.js`**

```js
// src/battle/testHelpers.js
import { Unit } from './unit.js';

let seq = 0;
export function makeUnit(opts = {}) {
  const stats = {
    name: opts.name || `U${seq++}`,
    element: opts.element || 'fire',
    class: opts.class || 'dps',
    level: opts.level || 1,
    hp: opts.hp ?? 1000,
    atk: opts.atk ?? 100,
    def: opts.def ?? 20,
    spd: opts.spd ?? 100,
  };
  const u = new Unit(stats, { team: opts.team ?? 0, pos: opts.pos ?? 1 });
  if (opts.energy != null) u.energy = opts.energy;
  return u;
}
```

- [ ] **Step 3: 改 `battleSetup.js`**（依位置建單位；玩家相容 `row`/`pos` 兩種格式）

```js
// src/systems/battleSetup.js
import { Unit } from '../battle/unit.js';
import { deriveStats } from '../core/stats.js';
import { store } from '../core/state.js';
import { CARD_LIST, CARDS } from '../data/cards.js';
import { Rng } from '../core/rng.js';

export function buildPlayerUnits(state = store.state) {
  const units = [];
  const front = [1, 2, 3];
  const back = [4, 5, 6];
  for (const entry of state.formation) {
    const inst = state.cards.find((c) => c.instanceId === entry.instanceId);
    if (!inst) continue;
    const stats = deriveStats(inst);
    const pos =
      entry.pos ?? (entry.row === 'back' ? back.shift() : front.shift());
    if (pos == null) continue; // 超過 6 格
    units.push(new Unit(stats, { team: 0, pos }));
  }
  return units;
}

export function buildEnemyUnits(stage = 1, rng = new Rng()) {
  const level = Math.max(1, stage);
  const scale = 0.8 + (stage - 1) * 0.06;
  const tanks = CARD_LIST.filter((c) => c.class === 'tank');
  const picks = [rng.pick(tanks)];
  for (let i = 1; i < 5; i++) picks.push(rng.pick(CARD_LIST));

  const front = [1, 2, 3];
  const back = [4, 5, 6];
  const units = [];
  for (const card of picks) {
    const stats = deriveStats({ cardId: card.id, level });
    stats.hp = Math.round(stats.hp * scale);
    stats.atk = Math.round(stats.atk * scale);
    stats.def = Math.round(stats.def * scale);
    const wantBack = card.class === 'support';
    const pos = wantBack ? (back.shift() ?? front.shift()) : (front.shift() ?? back.shift());
    if (pos == null) continue;
    units.push(new Unit(stats, { team: 1, pos }));
  }
  return units;
}

export { CARDS };
```

- [ ] **Step 4: 改測試建構參數**（`engine.test.js` / `targeting.test.js`）

`engine.test.js`：把所有 `makeUnit({ ... spd, ... })` 保留 `spd`（此時仍是 ATB 引擎），
並把需要區分前後排/站位的單位補上 `pos`。例如：

```js
// engine.test.js「坦克大招給全隊減傷 buff」
const tank = makeUnit({ team: 0, pos: 1, class: 'tank', name: 'tank', spd: 100 });
const ally = makeUnit({ team: 0, pos: 2, class: 'dps', name: 'ally', spd: 1 });
const foe = makeUnit({ team: 1, pos: 1, spd: 1, hp: 99999 });
```

`targeting.test.js`：把 `row:'front'` → `pos:1`、`row:'back'` → `pos:4`：

```js
// targeting.test.js
const front = makeUnit({ pos: 1, name: 'F' });
const back = makeUnit({ pos: 4, name: 'B' });
// …其餘同理，凡 row:'front' 改 pos:1、row:'back' 改 pos:4
```

- [ ] **Step 5: 跑全套件確認通過**

Run: `npm test`
Expected: PASS（舊 ATB 引擎照舊，現在改吃 `pos`）

- [ ] **Step 6: Commit**

```bash
git add src/battle/unit.js src/battle/testHelpers.js src/systems/battleSetup.js src/battle/engine.test.js src/battle/targeting.test.js
git commit -m "refactor: Unit 改以位置(pos)建立、row 由 pos 推導、加 column"
```

---

## Task 3: 直行選擇器 `singleEnemyByColumn`

**Files:**
- Modify: `src/battle/targeting.js`（新增，暫時保留 `pickMeleeTarget`）
- Modify: `src/battle/targeting.test.js`（新增 describe）

**Interfaces:**
- Consumes: `columnOf`、`rowOf`（Task 1）；`Unit.pos`（Task 2）。
- Produces: `singleEnemyByColumn(attacker, enemies): Unit | null`。

- [ ] **Step 1: 寫失敗測試**（涵蓋 Spec §9 驗證案例）

```js
// src/battle/targeting.test.js —— 追加到檔案
import { singleEnemyByColumn } from './targeting.js';

describe('直行選擇器 singleEnemyByColumn', () => {
  const enemies = (posList) => posList.map((pos) => makeUnit({ team: 1, pos, name: `E${pos}` }));

  it('前排 1 有人、2 空 → 直行B 打 1 號', () => {
    const es = enemies([1, 3]); // 2 號空
    const attacker = makeUnit({ team: 0, pos: 2 }); // 直行B
    expect(singleEnemyByColumn(attacker, es).pos).toBe(1);
  });

  it('前排 1、2 空、3 有人 → 打 3 號', () => {
    const es = enemies([3]);
    const attacker = makeUnit({ team: 0, pos: 2 });
    expect(singleEnemyByColumn(attacker, es).pos).toBe(3);
  });

  it('前排 3 空 → 直行C 打 2 號', () => {
    const es = enemies([1, 2]); // 3 號空
    const attacker = makeUnit({ team: 0, pos: 3 }); // 直行C
    expect(singleEnemyByColumn(attacker, es).pos).toBe(2);
  });

  it('前排全空 → 打後排對位（直行A → 4）', () => {
    const es = enemies([4, 5, 6]);
    const attacker = makeUnit({ team: 0, pos: 1 }); // 直行A
    expect(singleEnemyByColumn(attacker, es).pos).toBe(4);
  });

  it('全部陣亡回傳 null', () => {
    const es = enemies([1]);
    es[0].takeDamage(es[0].hp);
    expect(singleEnemyByColumn(makeUnit({ team: 0, pos: 1 }), es)).toBe(null);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/battle/targeting.test.js`
Expected: FAIL（`singleEnemyByColumn` 未定義）

- [ ] **Step 3: 實作**（加到 `targeting.js`，保留既有函式）

```js
// src/battle/targeting.js —— 頂部追加 import
import { columnOf, rowOf } from './positions.js';

// 直行偏好序：本行 → 往小號 → 往大號（值為前排位置號，後排 +3）
const COLUMN_PREF = {
  1: [1, 2, 3], // 直行A
  2: [2, 1, 3], // 直行B
  3: [3, 2, 1], // 直行C
};

function aliveInRowT(enemies, row) {
  return enemies.filter((u) => u.alive && rowOf(u.pos) === row);
}

// 普攻預設選擇器：直行對位、前排優先、缺位往小號靠、前排全空才打後排。
export function singleEnemyByColumn(attacker, enemies) {
  const col = columnOf(attacker.pos);
  for (const row of ['front', 'back']) {
    const pool = aliveInRowT(enemies, row);
    if (pool.length === 0) continue; // 該排全空 → 換下一排
    const offset = row === 'front' ? 0 : 3;
    for (const c of COLUMN_PREF[col]) {
      const hit = pool.find((u) => u.pos === c + offset);
      if (hit) return hit;
    }
    return pool[0]; // 保險（理論上不會走到）
  }
  return null;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/battle/targeting.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/battle/targeting.js src/battle/targeting.test.js
git commit -m "feat: 新增直行/前排優先/往小號的普攻選擇器 singleEnemyByColumn"
```

---

## Task 4: 傷害公式加暴擊

**Files:**
- Modify: `src/battle/damage.js`
- Create: `src/battle/damage.test.js`

**Interfaces:**
- Produces: `CRIT_CHANCE`、`CRIT_MULT`；`computeDamage(...)` 回傳新增 `isCrit: boolean`。
  擲骰順序：先 `variance` 再 `crit`（各消耗一次 `rng.next()`）。

- [ ] **Step 1: 寫失敗測試**（用假 rng 精準控制擲骰）

```js
// src/battle/damage.test.js
import { describe, it, expect } from 'vitest';
import { computeDamage, CRIT_MULT } from './damage.js';

// 依序回傳指定值的假亂數
function fakeRng(values) {
  let i = 0;
  return { next: () => values[i++] };
}

const atk = { element: 'fire', atk: 100 };
const def = { element: 'light', def: 0 }; // 火 vs 光 = 無剋制(1.0)

describe('暴擊', () => {
  it('暴擊傷害為非暴擊的 1.5 倍（variance 相同）', () => {
    // 擲骰順序：variance=0.5(→倍率1.0), crit
    const noCrit = computeDamage(atk, def, 1, fakeRng([0.5, 0.9]), 1); // 0.9 ≥ 0.1 → 無暴擊
    const crit = computeDamage(atk, def, 1, fakeRng([0.5, 0.05]), 1); // 0.05 < 0.1 → 暴擊
    expect(noCrit.isCrit).toBe(false);
    expect(crit.isCrit).toBe(true);
    expect(crit.amount).toBe(Math.round(noCrit.amount * CRIT_MULT));
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/battle/damage.test.js`
Expected: FAIL（`CRIT_MULT` 未匯出、無 `isCrit`）

- [ ] **Step 3: 實作**

```js
// src/battle/damage.js —— 追加常數
export const CRIT_CHANCE = 0.1; // 暴擊率 10%
export const CRIT_MULT = 1.5; // 暴擊傷害 1.5x
```

把 `computeDamage` 改為：

```js
export function computeDamage(attacker, defender, mult, rng, guardMult = 1) {
  const elemMult = elementMultiplier(attacker.element, defender.element);
  const base = attacker.atk * mult;
  const afterDef = Math.max(base * 0.15, base - defender.def * 0.75);
  const variance = rng ? 1 + (rng.next() * 2 - 1) * DAMAGE_VARIANCE : 1;
  const isCrit = rng ? rng.next() < CRIT_CHANCE : false;
  const critMult = isCrit ? CRIT_MULT : 1;
  const raw = afterDef * elemMult * guardMult * variance * critMult * DAMAGE_GLOBAL;
  return {
    amount: Math.max(1, Math.round(raw)),
    elementMult: elemMult,
    isAdvantage: elemMult > 1,
    isDisadvantage: elemMult < 1,
    isCrit,
  };
}
```

- [ ] **Step 4: 跑全套件確認通過**

Run: `npm test`
Expected: PASS（舊 engine.test 的剋制比較仍成立：同 seed 下暴擊擲骰對兩邊一致）

- [ ] **Step 5: Commit**

```bash
git add src/battle/damage.js src/battle/damage.test.js
git commit -m "feat: 傷害公式加入暴擊 10% / 1.5x，回傳 isCrit"
```

---

## Task 5: 集氣分職業 + 普攻改直行選擇器

**Files:**
- Modify: `src/data/classes.js`（加 `energyOnAllyAction`、調數值；保留 `spd` statMods 至 Task 9）
- Modify: `src/battle/skills.js`
- Modify: `src/battle/targeting.js`（移除 `pickMeleeTarget`）
- Modify: `src/battle/targeting.test.js`（移除舊 `pickMeleeTarget` 測試）

**Interfaces:**
- Consumes: `singleEnemyByColumn`（Task 3）；`classDef.energyOnAction/energyOnHitTaken/energyOnAllyAction`。
- Produces:
  - `normalAttack(caster, ctx)`：用 `singleEnemyByColumn` 選敵、施放者集氣、
    其餘存活隊友各 `gainEnergy(energyOnAllyAction)`。
  - `applyDamage(...)` 的 `damage` 事件 payload 追加 `isCrit`。
  - `burst` 大招改用 `singleEnemyByColumn`。
  - `ctx` 形狀不變：`{ allies, enemies, rng, emit }`。

- [ ] **Step 1: 改 `classes.js`**（能量欄位）

把三職業改為（`statMods` 暫留 `spd`）：

```js
export const CLASSES = {
  tank: {
    id: 'tank', label: '坦克',
    statMods: { hp: 1.3, atk: 0.8, def: 1.4, spd: 0.85 },
    energyOnAction: 15,
    energyOnHitTaken: 20,
    energyOnAllyAction: 0,
    ultimate: 'guard',
    preferredRow: 'front',
  },
  dps: {
    id: 'dps', label: '輸出',
    statMods: { hp: 0.9, atk: 1.8, def: 0.85, spd: 1.1 },
    energyOnAction: 25, // 含 +10 額外
    energyOnHitTaken: 8,
    energyOnAllyAction: 0,
    ultimate: 'burst',
    preferredRow: 'front',
  },
  support: {
    id: 'support', label: '輔助',
    statMods: { hp: 1.0, atk: 0.9, def: 1.0, spd: 1.05 },
    energyOnAction: 15,
    energyOnHitTaken: 8,
    energyOnAllyAction: 12,
    ultimate: 'heal',
    preferredRow: 'back',
  },
};

export const CLASS_LIST = Object.values(CLASSES);
```

- [ ] **Step 2: 寫/改測試**（普攻集氣 + 隊友集氣）

在 `src/battle/skills.test.js`（新建）驗證集氣：

```js
// src/battle/skills.test.js
import { describe, it, expect } from 'vitest';
import { normalAttack } from './skills.js';
import { makeUnit } from './testHelpers.js';
import { Rng } from '../core/rng.js';

function ctxFor(caster, allies, enemies) {
  return { allies, enemies, rng: new Rng(1), emit: () => {} };
}

describe('普攻集氣', () => {
  it('輸出普攻自身 +25、被擊坦克 +20、隊友輔助 +12', () => {
    const dps = makeUnit({ team: 0, pos: 1, class: 'dps' });
    const support = makeUnit({ team: 0, pos: 5, class: 'support' });
    const foeTank = makeUnit({ team: 1, pos: 1, class: 'tank', hp: 99999 });
    normalAttack(dps, ctxFor(dps, [dps, support], [foeTank]));
    expect(dps.energy).toBe(25);
    expect(support.energy).toBe(12);
    expect(foeTank.energy).toBe(20);
  });
});
```

Run: `npx vitest run src/battle/skills.test.js` → Expected: FAIL（尚未改 skills）

- [ ] **Step 3: 改 `skills.js`**

頂部 import 改用直行選擇器；`applyDamage`/`normalAttack`/`burst` 改為：

```js
// src/battle/skills.js
import { computeDamage } from './damage.js';
import { singleEnemyByColumn, lowestHpAlly } from './targeting.js';

// …ULT 常數不變…

function applyDamage(attacker, target, mult, ctx, skill) {
  const guardMult = activeGuardMult(target);
  const res = computeDamage(attacker, target, mult, ctx.rng, guardMult);
  const dealt = target.takeDamage(res.amount);
  target.gainEnergy(target.classDef.energyOnHitTaken);
  ctx.emit('damage', {
    source: attacker,
    target,
    amount: dealt,
    skill,
    isAdvantage: res.isAdvantage,
    isDisadvantage: res.isDisadvantage,
    isCrit: res.isCrit,
  });
  if (!target.alive) ctx.emit('death', { unit: target });
}

// …activeGuardMult 不變…

export function normalAttack(caster, ctx) {
  const target = singleEnemyByColumn(caster, ctx.enemies);
  if (!target) return;
  ctx.emit('attack', { attacker: caster, target, skill: 'normal' });
  applyDamage(caster, target, 1.0, ctx, 'normal');
  caster.gainEnergy(caster.classDef.energyOnAction);
  for (const ally of ctx.allies) {
    if (ally === caster || !ally.alive) continue;
    const gain = ally.classDef.energyOnAllyAction || 0;
    if (gain) ally.gainEnergy(gain);
  }
}

export const ULTIMATES = {
  burst(caster, ctx) {
    const target = singleEnemyByColumn(caster, ctx.enemies);
    if (!target) return;
    ctx.emit('ultimate', { caster, skill: 'burst', target });
    applyDamage(caster, target, ULT.burstMult, ctx, 'burst');
  },
  // guard / heal 內容不變（見原檔）
};
```

（`guard`、`heal` 兩個大招內容照舊；只有 import 與 `burst`/`normalAttack`/`applyDamage` 有變。）

- [ ] **Step 4: 移除 `pickMeleeTarget`**

`targeting.js`：刪除 `pickMeleeTarget` 函式與其 `aliveInRow` 舊 helper（`singleEnemyByColumn` 用自己的 `aliveInRowT`）。
`targeting.test.js`：刪除「普攻前排優先選敵」整個 describe（改由 Task 3 的直行選擇器測試涵蓋），保留「治療目標」describe。

- [ ] **Step 5: 跑全套件確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/data/classes.js src/battle/skills.js src/battle/skills.test.js src/battle/targeting.js src/battle/targeting.test.js
git commit -m "feat: 普攻改直行選擇器並加入分職業集氣（自身/隊友/被擊）"
```

---

## Task 6: 引擎翻成離散 `step()` 雙階段狀態機（核心）

**Files:**
- Modify: `src/battle/engine.js`（重寫）
- Modify: `src/battle/unit.js`（移除 `atb` 與 `ATB_MAX`）
- Modify: `src/battle/engine.test.js`（重寫）
- Modify: `src/render/battleController.js`（累加器驅動 `step()`）
- Modify: `src/render/battleScene.js`（移除藍條）

**Interfaces:**
- Consumes: `TURN_SEQUENCE`（Task 1）；`ENERGY_MAX`；`normalAttack`、`ultimateFor`（Task 5）。
- Produces:
  - `new BattleEngine(teamA, teamB, { rng })`：欄位 `teams/units/over/winner/round`；
    方法 `on/emit/enemiesOf/alliesOf/teamAlive`；核心 `step(): {type, unit?} | null`。
  - 事件：`turn`、`attack`、`ultimate`、`damage`、`heal`、`death`、`buffchange`、`battleEnd`。
  - 常數 `ENERGY_MAX`（re-export）、`MAX_ROUNDS`、`MAX_SKILL_PASSES`。
  - `guard` buff 改為 `{ type:'guard', mult, rounds }`，每輪結束遞減。
- 移除：`update(dt)`、`ATB_MAX`、`elapsed`、`unit.atb`。

- [ ] **Step 1: 先移除 `unit.js` 的 atb / ATB_MAX**

刪掉 `unit.js` 內 `export const ATB_MAX = 500;` 與 constructor 的 `this.atb = 0;`。

- [ ] **Step 2: 改 `skills.js` guard 大招用 rounds**

把 `ULT.guardDuration` 語意改為「回合數」，`guard` 大招 push 的 buff 帶 `rounds`：

```js
// skills.js —— ULT 常數
export const ULT = {
  burstMult: 2.6,
  guardReduction: 0.5,
  guardDuration: 2, // 回合
  guardSelfHeal: 0.15,
  healPower: 3.0,
  healSplash: 0.4,
};

// guard 大招內：
ally.buffs = (ally.buffs || []).filter((b) => b.type !== 'guard');
ally.buffs.push({ type: 'guard', mult: ULT.guardReduction, rounds: ULT.guardDuration });
```

- [ ] **Step 3: 重寫 `engine.js`**

```js
// src/battle/engine.js
// 回合制戰鬥引擎（純邏輯）：固定位置出手序列 + 普攻輪↔技能階段。
import { EventEmitter } from '../core/events.js';
import { Rng } from '../core/rng.js';
import { ENERGY_MAX } from './unit.js';
import { TURN_SEQUENCE } from './positions.js';
import { normalAttack, ultimateFor } from './skills.js';

export const MAX_ROUNDS = 100; // 回合上限，防打不完
export const MAX_SKILL_PASSES = 50; // 技能階段掃描上限，防死迴圈

export class BattleEngine {
  constructor(teamA, teamB, { rng } = {}) {
    this.teams = [teamA, teamB];
    this.units = [...teamA, ...teamB];
    this.rng = rng || new Rng();
    this.emitter = new EventEmitter();
    this.over = false;
    this.winner = null;
    this.round = 0;

    this.phase = 'normal';
    this.cursor = 0; // 目前序列索引
    this.resumeIndex = 0; // 技能階段結束後普攻接續處
    this._lastActedIdx = -1; // 偵測繞回換算回合
    this._skillPasses = 0;
    this._skillCastThisPass = false;
  }

  on(event, fn) { return this.emitter.on(event, fn); }
  emit(event, payload) { this.emitter.emit(event, payload); }
  enemiesOf(unit) { return this.teams[unit.team ^ 1]; }
  alliesOf(unit) { return this.teams[unit.team]; }
  teamAlive(team) { return this.teams[team].some((u) => u.alive); }

  _unitAt(team, pos) {
    return this.teams[team].find((u) => u.alive && u.pos === pos) || null;
  }

  _anyoneCharged() {
    return this.units.some((u) => u.alive && u.energy >= ENERGY_MAX);
  }

  _advanceToActor(startIdx) {
    for (let k = 0; k < TURN_SEQUENCE.length; k++) {
      const idx = (startIdx + k) % TURN_SEQUENCE.length;
      const [team, pos] = TURN_SEQUENCE[idx];
      const u = this._unitAt(team, pos);
      if (u) return { unit: u, idx };
    }
    return null;
  }

  // 推進一個動作。回傳動作紀錄或 null（戰鬥已結束）。
  step() {
    if (this.over) return null;
    return this.phase === 'normal' ? this._stepNormal() : this._stepSkill();
  }

  _stepNormal() {
    const found = this._advanceToActor(this.cursor);
    if (!found) { this._endByHp(); return null; }
    const { unit, idx } = found;

    if (idx <= this._lastActedIdx) {
      this.round += 1;
      this._tickRoundBuffs();
      if (this.round >= MAX_ROUNDS) { this._endByHp(); return { type: 'timeout', unit }; }
    }
    this._lastActedIdx = idx;

    this._act(unit, false);
    this._checkEnd();
    if (this.over) return { type: 'attack', unit };

    this.cursor = (idx + 1) % TURN_SEQUENCE.length;
    if (this._anyoneCharged()) {
      this.resumeIndex = this.cursor;
      this.phase = 'skill';
      this.cursor = 0;
      this._skillPasses = 0;
      this._skillCastThisPass = false;
    }
    return { type: 'attack', unit };
  }

  _stepSkill() {
    while (this.cursor < TURN_SEQUENCE.length) {
      const [team, pos] = TURN_SEQUENCE[this.cursor];
      this.cursor += 1;
      const u = this._unitAt(team, pos);
      if (u && u.energy >= ENERGY_MAX) {
        this._act(u, true);
        this._checkEnd();
        this._skillCastThisPass = true;
        return { type: 'ultimate', unit: u };
      }
    }
    // 一趟掃完
    this._skillPasses += 1;
    if (this._skillCastThisPass && this._skillPasses < MAX_SKILL_PASSES) {
      this._skillCastThisPass = false;
      this.cursor = 0;
      return this._stepSkill(); // 同一 step 內接著找下一個要放的人
    }
    // 零施放或超過上限 → 回普攻、從中斷處接續
    this.phase = 'normal';
    this.cursor = this.resumeIndex;
    return { type: 'skillPhaseEnd' };
  }

  _act(u, isSkill) {
    const ctx = {
      allies: this.alliesOf(u),
      enemies: this.enemiesOf(u),
      rng: this.rng,
      emit: (event, payload) => this.emit(event, payload),
    };
    this.emit('turn', { unit: u });
    if (isSkill) {
      u.energy = 0;
      ultimateFor(u)(u, ctx);
    } else {
      normalAttack(u, ctx);
    }
  }

  _tickRoundBuffs() {
    for (const u of this.units) {
      if (!u.buffs || u.buffs.length === 0) continue;
      for (const b of u.buffs) if (b.rounds != null) b.rounds -= 1;
      const before = u.buffs.length;
      u.buffs = u.buffs.filter((b) => b.rounds == null || b.rounds > 0);
      if (u.buffs.length !== before) this.emit('buffchange', { unit: u });
    }
  }

  _checkEnd() {
    if (this.over) return;
    const a = this.teamAlive(0);
    const b = this.teamAlive(1);
    if (!a || !b) {
      this.over = true;
      this.winner = a ? 0 : b ? 1 : -1;
      this.emit('battleEnd', { winner: this.winner });
    }
  }

  _endByHp() {
    if (this.over) return;
    const sum = (t) => this.teams[t].reduce((s, u) => s + Math.max(0, u.hp), 0);
    const a = sum(0);
    const b = sum(1);
    this.over = true;
    this.winner = a > b ? 0 : b > a ? 1 : -1;
    this.emit('battleEnd', { winner: this.winner });
  }
}

export { ENERGY_MAX };
```

- [ ] **Step 4: 重寫 `engine.test.js`**

```js
// src/battle/engine.test.js
import { describe, it, expect } from 'vitest';
import { BattleEngine, ENERGY_MAX } from './engine.js';
import { makeUnit } from './testHelpers.js';
import { Rng } from '../core/rng.js';

function runSteps(engine, maxSteps = 200000) {
  let n = 0;
  while (!engine.over && n < maxSteps) { engine.step(); n += 1; }
  return engine;
}

describe('BattleEngine（回合制）', () => {
  it('出手序列：我方先於敵方', () => {
    const me = makeUnit({ team: 0, pos: 1, name: 'me' });
    const foe = makeUnit({ team: 1, pos: 1, name: 'foe' });
    const engine = new BattleEngine([me], [foe], { rng: new Rng(1) });
    const order = [];
    engine.on('turn', ({ unit }) => order.push(unit.name));
    engine.step();
    expect(order[0]).toBe('me');
  });

  it('一方全滅即結束並判定勝者', () => {
    const hero = makeUnit({ team: 0, pos: 1, atk: 300, hp: 2000 });
    const dummy = makeUnit({ team: 1, pos: 1, atk: 5, hp: 100, def: 0 });
    const engine = new BattleEngine([hero], [dummy], { rng: new Rng(7) });
    let ended = null;
    engine.on('battleEnd', ({ winner }) => (ended = winner));
    runSteps(engine);
    expect(engine.over).toBe(true);
    expect(ended).toBe(0);
    expect(dummy.alive).toBe(false);
  });

  it('有人滿氣→技能階段自動施放並清空能量', () => {
    const dps = makeUnit({ team: 0, pos: 1, class: 'dps', atk: 100, name: 'dps', energy: ENERGY_MAX });
    const foe = makeUnit({ team: 1, pos: 1, hp: 100000, def: 0, name: 'foe' });
    const engine = new BattleEngine([dps], [foe], { rng: new Rng(3) });
    let ult = false;
    engine.on('ultimate', () => (ult = true));
    engine.step(); // 普攻（滿氣）→ 觸發中斷
    engine.step(); // 技能階段施放
    expect(ult).toBe(true);
    expect(dps.energy).toBe(0);
  });

  it('屬性剋制傷害較高', () => {
    const a0 = makeUnit({ team: 0, pos: 1, element: 'fire', atk: 100, def: 0 });
    const aF = makeUnit({ team: 1, pos: 1, element: 'wind', hp: 100000, def: 0 });
    const e1 = new BattleEngine([a0], [aF], { rng: new Rng(0) });
    e1.step();
    const advDmg = aF.maxHp - aF.hp;

    const d0 = makeUnit({ team: 0, pos: 1, element: 'fire', atk: 100, def: 0 });
    const dW = makeUnit({ team: 1, pos: 1, element: 'water', hp: 100000, def: 0 });
    const e2 = new BattleEngine([d0], [dW], { rng: new Rng(0) });
    e2.step();
    const disDmg = dW.maxHp - dW.hp;

    expect(advDmg).toBeGreaterThan(disDmg);
  });

  it('坦克技能給全隊減傷 buff', () => {
    const tank = makeUnit({ team: 0, pos: 1, class: 'tank', name: 'tank', energy: ENERGY_MAX });
    const ally = makeUnit({ team: 0, pos: 2, class: 'dps', name: 'ally' });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, name: 'foe' });
    const engine = new BattleEngine([tank, ally], [foe], { rng: new Rng(5) });
    for (let i = 0; i < 6; i += 1) engine.step();
    expect(ally.buffs?.some((b) => b.type === 'guard')).toBe(true);
  });

  it('達回合上限依存活血量判定（同分平手）', () => {
    const a = makeUnit({ team: 0, pos: 1, atk: 1, def: 100000, hp: 100000 });
    const b = makeUnit({ team: 1, pos: 1, atk: 1, def: 100000, hp: 100000 });
    const engine = new BattleEngine([a], [b], { rng: new Rng(2) });
    let winner = 'none';
    engine.on('battleEnd', ({ winner: w }) => (winner = w));
    runSteps(engine);
    expect(engine.over).toBe(true);
    expect(winner).toBe(-1);
  });
});
```

- [ ] **Step 5: 改 `battleController.js`**（累加器驅動 step）

把 `_tick` 內的 `this.engine.update(...)` 段落改成：

```js
// battleController.js —— 類別頂部常數
const STEP_INTERVAL = 0.35; // 每個動作間隔（秒），再除以速度

// constructor 內新增：
this._stepAccum = 0;

// _tick 內，非結束分支：
this._stepAccum += dt * this.speed;
let guard = 0;
while (this._stepAccum >= STEP_INTERVAL && this.engine && !this.engine.over && guard < 50) {
  this._stepAccum -= STEP_INTERVAL;
  this.engine.step();
  guard += 1;
}
this.scene?.renderTick();
this._renderStatus();
```

並把 `_renderStatus` 的 `${e.elapsed.toFixed(1)}s` 改為 `回合 ${e.round}`：

```js
this._setStatus(`關卡 ${stage}　我方 ${a} vs 敵方 ${b}　|　回合 ${e.round}`);
```

- [ ] **Step 6: 改 `battleScene.js`**（移除藍條）

- import：把 `import { ATB_MAX, ENERGY_MAX } from '../battle/unit.js';` 改成
  `import { ENERGY_MAX } from '../battle/unit.js';`
- `renderTick()` 內移除 ATB 那行，能量條上移：

```js
renderTick() {
  for (const sprite of this.sprites.values()) {
    const u = sprite._unit;
    const g = sprite._bars;
    g.clear();
    this._bar(g, 0, u.hpRatio, 0x57d77a, 0x2a3b30); // HP
    this._bar(g, 9, u.energyRatio, 0xf5c451, 0x33301f); // 能量
  }
}
```

- [ ] **Step 7: 跑全套件確認通過**

Run: `npm test`
Expected: PASS（新回合制引擎 + 既有 targeting/damage/skills 測試）

- [ ] **Step 8: Commit**

```bash
git add src/battle/engine.js src/battle/unit.js src/battle/engine.test.js src/battle/skills.js src/render/battleController.js src/render/battleScene.js
git commit -m "refactor: 引擎改離散 step() 雙階段狀態機，移除 ATB；controller 用累加器驅動"
```

---

## Task 7: 陣容位置模型 + 存檔遷移

**Files:**
- Modify: `src/systems/formation.js`
- Modify: `src/core/state.js`
- Modify: `src/core/save.js`
- Modify: `src/systems/gameflow.test.js`

**Interfaces:**
- Produces:
  - `MAX_FORMATION = 6`。
  - `addToFormation(instanceId, pos=null, state)`（`pos` 省略 → 第一個空位）→ `{ ok, pos?, reason? }`。
  - `setPosition(instanceId, pos, state)`（占位者自動交換）→ `{ ok, pos?, reason? }`。
  - `toggleFormation(instanceId, pos=null, state)`、`removeFromFormation`、`isInFormation`、
    `formationSlot`、`canStartBattle`、`positionTaken`、`firstFreePosition`。
  - 存檔 `formation` 項目為 `{ instanceId, pos }`。
- 移除：`toggleRow`。

- [ ] **Step 1: 改 `formation.js`**

```js
// src/systems/formation.js
import { store } from '../core/state.js';
import { saveGame } from '../core/save.js';

export const MAX_FORMATION = 6;
const POSITIONS = [1, 2, 3, 4, 5, 6];

export function isInFormation(instanceId, state = store.state) {
  return state.formation.some((e) => e.instanceId === instanceId);
}
export function formationSlot(instanceId, state = store.state) {
  return state.formation.find((e) => e.instanceId === instanceId) || null;
}
export function positionTaken(pos, state = store.state) {
  return state.formation.some((e) => e.pos === pos);
}
export function firstFreePosition(state = store.state) {
  return POSITIONS.find((p) => !positionTaken(p, state)) ?? null;
}

export function addToFormation(instanceId, pos = null, state = store.state) {
  if (isInFormation(instanceId, state)) return { ok: false, reason: 'already' };
  if (state.formation.length >= MAX_FORMATION) return { ok: false, reason: 'full' };
  if (!state.cards.some((c) => c.instanceId === instanceId)) return { ok: false, reason: 'not-owned' };
  const p = pos ?? firstFreePosition(state);
  if (p == null) return { ok: false, reason: 'full' };
  if (positionTaken(p, state)) return { ok: false, reason: 'pos-taken' };
  state.formation.push({ instanceId, pos: p });
  persist();
  return { ok: true, pos: p };
}

export function removeFromFormation(instanceId, state = store.state) {
  const before = state.formation.length;
  state.formation = state.formation.filter((e) => e.instanceId !== instanceId);
  if (state.formation.length !== before) persist();
  return { ok: state.formation.length !== before };
}

export function toggleFormation(instanceId, pos = null, state = store.state) {
  return isInFormation(instanceId, state)
    ? removeFromFormation(instanceId, state)
    : addToFormation(instanceId, pos, state);
}

// 移動到指定位置；若該位置已有人則兩者互換。
export function setPosition(instanceId, pos, state = store.state) {
  const slot = formationSlot(instanceId, state);
  if (!slot) return { ok: false, reason: 'not-in' };
  const occupant = state.formation.find((e) => e.pos === pos && e.instanceId !== instanceId);
  if (occupant) occupant.pos = slot.pos;
  slot.pos = pos;
  persist();
  return { ok: true, pos };
}

export function canStartBattle(state = store.state) {
  return state.formation.length > 0;
}

function persist() {
  saveGame();
  store.notify();
}
```

- [ ] **Step 2: 改 `state.js`**（初始陣容給 pos）

把 `createNewGame` 內建初始隊伍那段改為：

```js
// state.js
formation: [], // [{ instanceId, pos: 1..6 }] 最多 6

// …建立初始隊伍：
const front = [1, 2, 3];
const back = [4, 5, 6];
for (const cardId of STARTER_CARD_IDS) {
  const inst = addCardInstance(state, cardId);
  const cls = CARDS[cardId]?.class;
  const pos = cls === 'support' ? (back.shift() ?? front.shift()) : (front.shift() ?? back.shift());
  state.formation.push({ instanceId: inst.instanceId, pos });
}
```

移除已不需要的 `defaultRowFor`（`CARDS` import 保留）。

- [ ] **Step 3: 改 `save.js`**（`row → pos` 遷移）

在 `migrate(data)` 內、`data.formation ??= [];` 之後加入：

```js
// formation：舊格式 { instanceId, row } → { instanceId, pos }
if (Array.isArray(data.formation)) {
  const used = new Set(data.formation.filter((e) => e && e.pos).map((e) => e.pos));
  const front = [1, 2, 3].filter((p) => !used.has(p));
  const back = [4, 5, 6].filter((p) => !used.has(p));
  data.formation = data.formation
    .filter(Boolean)
    .map((e) => {
      if (e.pos) return { instanceId: e.instanceId, pos: e.pos };
      const p = e.row === 'back' ? (back.shift() ?? front.shift()) : (front.shift() ?? back.shift());
      return p == null ? null : { instanceId: e.instanceId, pos: p };
    })
    .filter(Boolean)
    .slice(0, 6);
}
```

- [ ] **Step 4: 改 `gameflow.test.js`**（陣容那段改用 pos / setPosition）

```js
// gameflow.test.js —— import 改
import { addToFormation, setPosition, MAX_FORMATION } from './formation.js';

// 「陣容」describe 改為：
describe('陣容', () => {
  it('最多 6 人、同卡不可重複、可換位置', () => {
    expect(store.state.formation.length).toBe(5); // 初始 5 人（6 格）
    store.state.currencies.tickets = 500;
    let newInst = null;
    const rng = new Rng(7);
    for (let i = 0; i < 500 && !newInst; i++) {
      const r = pull(store.state, rng);
      if (r.type === 'card') newInst = store.state.cards.find((c) => c.cardId === r.cardId);
    }
    expect(newInst).toBeTruthy();
    // 還有第 6 格 → 可上陣
    expect(addToFormation(newInst.instanceId).ok).toBe(true);
    expect(store.state.formation.length).toBe(MAX_FORMATION);

    // 換位置：把第一人移到一個空位（先移走再驗證交換）
    const slot = store.state.formation[0];
    const target = slot.pos === 1 ? 2 : 1;
    setPosition(slot.instanceId, target);
    expect(slot.pos).toBe(target);
  });
});
```

（若初始陣容數量與 `5` 不符，以實際 `STARTER_CARD_IDS.length` 為準調整第一個 expect。）

- [ ] **Step 5: 跑全套件確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/systems/formation.js src/core/state.js src/core/save.js src/systems/gameflow.test.js
git commit -m "feat: 陣容改 6 位置模型 + 舊存檔 row→pos 遷移"
```

---

## Task 8: 角色分頁 6 位置編輯 UI + 移除 spd 顯示

**Files:**
- Modify: `src/ui/rosterUI.js`

**Interfaces:**
- Consumes: `MAX_FORMATION`、`isInFormation`、`toggleFormation`、`formationSlot`、
  `setPosition`、`firstFreePosition`、`positionTaken`（Task 7）。
- Produces: 無新對外介面（純 UI）。此任務以「`npm run build` 成功 + 手動檢視」為驗收。

- [ ] **Step 1: 改 import**

```js
import {
  isInFormation,
  toggleFormation,
  setPosition,
  formationSlot,
  positionTaken,
  MAX_FORMATION,
} from '../systems/formation.js';
```

- [ ] **Step 2: 重寫 `_formationSection`**（畫 6 格：前排 1/2/3、後排 4/5/6）

```js
_formationSection() {
  const wrap = el('div');
  wrap.appendChild(
    el('p', { class: 'section-title', text: `出戰陣容（${store.state.formation.length}/${MAX_FORMATION}）` })
  );
  const formation = el('div', { class: 'formation' });
  const rows = [
    { label: '前排', positions: [1, 2, 3] },
    { label: '後排', positions: [4, 5, 6] },
  ];
  for (const { label, positions } of rows) {
    const rowEl = el('div', { class: 'formation-row' }, [
      el('div', { class: 'row-label', text: label }),
    ]);
    for (const pos of positions) {
      const entry = store.state.formation.find((e) => e.pos === pos);
      if (!entry) {
        rowEl.appendChild(el('div', { class: 'slot empty', text: `${pos}・（空）` }));
        continue;
      }
      const inst = store.getCard(entry.instanceId);
      const card = inst ? CARDS[inst.cardId] : null;
      rowEl.appendChild(
        el('div', { class: 'slot filled', title: '點擊下陣' , onClick: () => {
          toggleFormation(entry.instanceId);
          this._changed();
        } }, [
          el('span', { class: 'slot-name', text: card ? card.name : '?' }),
          el('span', { class: 'slot-sub', text: card ? `${pos}・Lv${inst.level}・${CLASSES[card.class].label}` : '' }),
        ])
      );
    }
    formation.appendChild(rowEl);
  }
  wrap.appendChild(formation);
  return wrap;
}
```

- [ ] **Step 3: 卡片列移除 spd、換位置改用 setPosition**

- 移除 `stats` 那行的 `⚡ <b>${st.spd}</b>`：

```js
el('div', { class: 'stats', html: `❤ <b>${st.hp}</b>　⚔ <b>${st.atk}</b>　🛡 <b>${st.def}</b>` }),
```

- 把原本「前/後排切換」按鈕改為「移到下一個空位」：

```js
if (inForm) {
  actions.appendChild(
    el('button', {
      text: '換位置',
      onClick: () => {
        const cur = formationSlot(inst.instanceId).pos;
        // 找下一個未被占用的位置（環狀）
        let next = cur;
        for (let i = 1; i <= 6; i++) {
          const cand = ((cur - 1 + i) % 6) + 1;
          if (!positionTaken(cand) || cand === cur) { next = cand; break; }
        }
        setPosition(inst.instanceId, next);
        this._changed();
      },
    })
  );
}
```

- 「上陣」呼叫維持 `toggleFormation(inst.instanceId, null)`（自動找空位）：

```js
const r = toggleFormation(inst.instanceId, null);
if (!r.ok && r.reason === 'full') toast(`陣容已滿（${MAX_FORMATION} 人）`);
```

- [ ] **Step 4: 建置確認**

Run: `npm run build`
Expected: 成功（無 import 錯誤、無殘留 `toggleRow`）

- [ ] **Step 5: Commit**

```bash
git add src/ui/rosterUI.js
git commit -m "feat: 角色分頁改 6 位置陣容編輯，移除 spd 顯示"
```

---

## Task 9: 完全移除 spd（清理）

**Files:**
- Modify: `src/data/cards.js`
- Modify: `src/data/classes.js`
- Modify: `src/core/stats.js`
- Modify: `src/battle/unit.js`
- Modify: `src/battle/testHelpers.js`

**Interfaces:**
- Produces: `deriveStats` 輸出不再含 `spd`；`Unit` 不再有 `spd`。

- [ ] **Step 1: `stats.js` 移除 spd**

```js
export function rawStatsAtLevel(card, level) {
  const out = {};
  for (const key of ['hp', 'atk', 'def']) {
    out[key] = card.base[key] + card.growth[key] * (level - 1);
  }
  return out;
}
```

`deriveStats` 回傳物件移除 `spd: Math.round(...)` 那行。

- [ ] **Step 2: `classes.js` 移除 statMods.spd**

三職業 `statMods` 皆刪掉 `spd` 鍵（`tank {hp,atk,def}`、`dps {hp,atk,def}`、`support {hp,atk,def}`）。

- [ ] **Step 3: `cards.js` 移除 base/growth 的 spd**

每張卡的 `base` 與 `growth` 刪掉 `spd` 欄位（10 張卡，共 20 處）。例：

```js
ifrit: { id: 'ifrit', name: '炎獄魔將', element: 'fire', class: 'dps', base: { hp: 520, atk: 95, def: 40 }, growth: { hp: 58, atk: 11, def: 4 } },
```

- [ ] **Step 4: `unit.js` / `testHelpers.js` 移除 spd**

- `unit.js` constructor 刪除 `this.spd = stats.spd;`。
- `testHelpers.js` 的 `stats` 物件刪除 `spd: opts.spd ?? 100,`。

- [ ] **Step 5: 確認無殘留並跑全套件**

Run: `git grep -n "spd"`
Expected: 無結果（或僅剩本計畫/spec 文件）

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/data/cards.js src/data/classes.js src/core/stats.js src/battle/unit.js src/battle/testHelpers.js
git commit -m "chore: 完全移除 spd 屬性（不再影響戰鬥）"
```

---

## Self-Review

- **Spec 覆蓋**：位置模型(T1/T2/T7)、移除 spd(T2 導入/T9 清除)、出手序列(T1/T6)、
  雙階段+立即中斷+接續(T6)、鎖定規則(T3)、分職業集氣(T5)、暴擊(T4)、引擎 step+controller(T6)、
  渲染改版(T6/T8)、測試(各任務)。皆有對應任務。
- **型別一致**：`singleEnemyByColumn(attacker, enemies)`、`normalAttack(caster, ctx)`、
  `engine.step()`、`addToFormation(instanceId, pos)`、`setPosition(instanceId, pos)`、
  `computeDamage(...) → { …, isCrit }` 在各任務間名稱/簽名一致。
- **綠燈連續性**：expand/contract 排序——葉模組(T1/T3/T4)為新增；T2 讓舊 ATB 引擎改吃 pos；
  T5 在舊引擎上換選擇器/集氣；T6 才翻引擎並重寫 engine.test；T7 換陣容資料模型；T9 最後清 spd。
  每個任務尾端 `npm test` 綠。
- **範圍**：可擴充技能/Buff 系統、每卡專屬技、豐富目標選擇器、嘲諷/控場/DoT/集氣速度 → Spec 2，不在本計畫。
