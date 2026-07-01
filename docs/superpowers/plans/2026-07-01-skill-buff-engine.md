# 可擴充技能 / Buff 引擎 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把寫死的 3 個職業大招換成資料驅動、可組合的技能/Buff 引擎(通用 Buff 容器 + 有效值 resolver + 效果原語 + 技能即資料 + 目標選擇器),並把現有大招改寫成資料驗證等價。

**Architecture:** expand/contract——先建 4 個獨立葉模組(`buffs.js`、Unit 有效值、`targeting` 選擇器、`effects.js`),各自 TDD 綠燈;再兩個協調式核心任務把 `damage.js` 接上有效值、`guard` buff 改成通用格式、引擎改成每次出手結算 buff/DoT,最後把技能改成 `SKILLS` 資料 + `castSkill`。每個任務結束整套件綠。

**Tech Stack:** JavaScript (ESM)、Vite、Vitest、Pixi.js。測試:`npm test`。

## Global Constraints

- 測試框架 **Vitest**;全部:`npm test`;單檔:`npx vitest run <path>`。
- 引擎層(`src/battle/**`)**不得** import pixi/gsap/DOM。
- Spec:`docs/superpowers/specs/2026-07-01-skill-buff-engine-design.md`。
- **數值約定**:效果 `power` = 百分比 × 基準;`basis` 省略 → `caster.effAtk × power`;`basis:'targetMaxHp'` → `target.maxHp × power`。集中在 `resolvePower`。
- **每個 effect 必填 `scope`**:`self` / `target` / `allAllies` / `allEnemies` / `alliesExceptTarget`。
- Buff 疊加:有效值 = `base × Π(mul) + Σ(add)`;同 `key` 非 `stackable` → 取代刷新;`stackable:true` → 併存。
- Buff `duration` 以行動次數計:帶者每次出手後 −1;DoT 於帶者出手前結算。
- 暴擊常數 `CRIT_CHANCE=0.1`、`CRIT_MULT=1.5`(作為有效值 base);`DAMAGE_GLOBAL=1.6`、`DAMAGE_VARIANCE=0.1`。
- **不做**(Spec 3):每卡專屬技、嘲諷/控場。`skillFor(unit)` 目前回 `unit.classDef.ultimate`。
- 每任務最後 commit;訊息用繁中,feat/refactor/test/chore 前綴。

---

## File Structure

**新增**
- `src/battle/buffs.js` — 通用 Buff 容器 + resolver(`applyBuff`/`tickBuffs`/`resolve`/`absorbWithShields`/`dotEntries`)。
- `src/battle/buffs.test.js`
- `src/battle/effects.js` — 效果原語(`resolvePower`/`resolveScope`/`dealDamage`/`dealDot`/`applyEffect`)。
- `src/battle/effects.test.js`

**修改**
- `src/battle/unit.js` — 有效值 getter、護盾 takeDamage、`gainEnergy × energyGainMult`。
- `src/battle/targeting.js` — `SELECTORS` registry + 新選擇器 + 退位。
- `src/battle/damage.js` — `computeDamage` 讀有效值(移除 `guardMult` 參數)。
- `src/battle/skills.js` — `SKILLS` 資料 + `castSkill` + `skillFor`;`normalAttack` 改用 `effects.dealDamage`。
- `src/battle/engine.js` — 每次出手前結算 DoT、行動後 `tickBuffs`;技能階段呼叫 `castSkill`。
- 測試:`damage.test.js`、`targeting.test.js`、`skills.test.js`、`engine.test.js`。

---

## Task 1: 通用 Buff 容器 `buffs.js`

**Files:**
- Create: `src/battle/buffs.js`
- Test: `src/battle/buffs.test.js`

**Interfaces:**
- Produces:
  - `applyBuff(unit, spec)`:`spec` 為 buff 項(`kind:'stat'|'dot'|'shield'` …)。同 `key` 非 `stackable` → 先移除同 key 再 push;否則直接 push。初始化 `unit.buffs=[]`。
  - `tickBuffs(unit): boolean`:所有 `duration != null` 的 −1,移除 `<=0`,回傳是否有移除。
  - `resolve(unit, stat, base): number`:`base × Π(mul) + Σ(add)`(僅 `kind:'stat'` 且 `stat` 相符)。
  - `absorbWithShields(unit, amount): number`:依序扣 `kind:'shield'` 池,移除耗盡者,回傳仍需作用到 hp 的量。
  - `dotEntries(unit): Array`:回傳 `kind:'dot'` 清單。

- [ ] **Step 1: 寫失敗測試**

```js
// src/battle/buffs.test.js
import { describe, it, expect } from 'vitest';
import { applyBuff, tickBuffs, resolve, absorbWithShields, dotEntries } from './buffs.js';

const u = () => ({ buffs: [] });

describe('buffs', () => {
  it('resolve：mul 相乘、add 相加', () => {
    const unit = u();
    applyBuff(unit, { kind: 'stat', stat: 'atk', op: 'mul', value: 1.5 });
    applyBuff(unit, { kind: 'stat', stat: 'atk', op: 'add', value: 10 });
    expect(resolve(unit, 'atk', 100)).toBe(160); // 100*1.5 + 10
    expect(resolve(unit, 'def', 50)).toBe(50); // 無相符 buff
  });

  it('applyBuff：同 key 非 stackable 取代刷新', () => {
    const unit = u();
    applyBuff(unit, { kind: 'stat', stat: 'atk', op: 'mul', value: 1.2, key: 'k', duration: 1 });
    applyBuff(unit, { kind: 'stat', stat: 'atk', op: 'mul', value: 1.5, key: 'k', duration: 3 });
    expect(unit.buffs.length).toBe(1);
    expect(unit.buffs[0].value).toBe(1.5);
  });

  it('applyBuff：stackable 併存', () => {
    const unit = u();
    applyBuff(unit, { kind: 'stat', stat: 'atk', op: 'add', value: 5, key: 'k', stackable: true });
    applyBuff(unit, { kind: 'stat', stat: 'atk', op: 'add', value: 5, key: 'k', stackable: true });
    expect(unit.buffs.length).toBe(2);
    expect(resolve(unit, 'atk', 0)).toBe(10);
  });

  it('tickBuffs：duration 用完移除；permanent 保留', () => {
    const unit = u();
    applyBuff(unit, { kind: 'stat', stat: 'atk', op: 'add', value: 5, duration: 1 });
    applyBuff(unit, { kind: 'stat', stat: 'def', op: 'add', value: 5 }); // 無 duration
    expect(tickBuffs(unit)).toBe(true);
    expect(unit.buffs.length).toBe(1);
    expect(unit.buffs[0].stat).toBe('def');
  });

  it('absorbWithShields：先扣護盾再回傳剩餘', () => {
    const unit = u();
    applyBuff(unit, { kind: 'shield', amount: 30 });
    expect(absorbWithShields(unit, 10)).toBe(0); // 30 護盾吸收 10
    expect(unit.buffs[0].amount).toBe(20);
    expect(absorbWithShields(unit, 50)).toBe(30); // 剩 20 護盾吸收，20 耗盡移除，剩 30 到 hp
    expect(unit.buffs.length).toBe(0);
  });

  it('dotEntries：只回傳 dot', () => {
    const unit = u();
    applyBuff(unit, { kind: 'stat', stat: 'atk', op: 'add', value: 1 });
    applyBuff(unit, { kind: 'dot', damage: 20, duration: 3 });
    expect(dotEntries(unit).length).toBe(1);
    expect(dotEntries(unit)[0].damage).toBe(20);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/battle/buffs.test.js`
Expected: FAIL（`buffs.js` 不存在）

- [ ] **Step 3: 實作**

```js
// src/battle/buffs.js
// 通用 Buff 容器與有效值 resolver。純資料操作，不 import 引擎/渲染。

export function applyBuff(unit, spec) {
  if (!unit.buffs) unit.buffs = [];
  if (spec.key && !spec.stackable) {
    unit.buffs = unit.buffs.filter((b) => b.key !== spec.key);
  }
  unit.buffs.push(spec);
}

// 帶者行動後：所有 buff.duration -1，移除到期。回傳是否有移除。
export function tickBuffs(unit) {
  if (!unit.buffs || unit.buffs.length === 0) return false;
  for (const b of unit.buffs) if (b.duration != null) b.duration -= 1;
  const before = unit.buffs.length;
  unit.buffs = unit.buffs.filter((b) => b.duration == null || b.duration > 0);
  return unit.buffs.length !== before;
}

// base × Π(mul) + Σ(add)，範圍為 kind:'stat' 且 stat 相符者。
export function resolve(unit, stat, base) {
  let mul = 1;
  let add = 0;
  if (unit.buffs) {
    for (const b of unit.buffs) {
      if (b.kind !== 'stat' || b.stat !== stat) continue;
      if (b.op === 'mul') mul *= b.value;
      else if (b.op === 'add') add += b.value;
    }
  }
  return base * mul + add;
}

// 先扣護盾池，回傳仍需作用到 hp 的傷害量。
export function absorbWithShields(unit, amount) {
  let remaining = amount;
  if (unit.buffs) {
    for (const b of unit.buffs) {
      if (b.kind !== 'shield' || remaining <= 0) continue;
      const absorbed = Math.min(b.amount, remaining);
      b.amount -= absorbed;
      remaining -= absorbed;
    }
    unit.buffs = unit.buffs.filter((b) => b.kind !== 'shield' || b.amount > 0);
  }
  return remaining;
}

export function dotEntries(unit) {
  return unit.buffs ? unit.buffs.filter((b) => b.kind === 'dot') : [];
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/battle/buffs.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/battle/buffs.js src/battle/buffs.test.js
git commit -m "feat: 新增通用 Buff 容器與有效值 resolver（buffs.js）"
```

---

## Task 2: Unit 有效值 getter + 護盾 + 集氣速度

**Files:**
- Modify: `src/battle/unit.js`
- Test: `src/battle/unit.test.js`（新建）

**Interfaces:**
- Consumes: `resolve`、`absorbWithShields`（Task 1）;`CRIT_CHANCE`、`CRIT_MULT`（`damage.js`）。
- Produces（Unit getter/方法）:
  - `effAtk`(round)、`effDef`(round)、`critChance`(clamp 0..1)、`critMult`、`dmgTakenMult`、`dmgDealtMult`、`energyGainMult`。
  - `gainEnergy(amount)`:`energy = clamp(0, MAX, energy + round(amount × energyGainMult))`。
  - `takeDamage(amount)`:先 `absorbWithShields`,再扣 hp,回傳實際扣血。
- 行為相容:無 buff 時 `effAtk===atk`、`energyGainMult===1`、無護盾,既有測試不變。

- [ ] **Step 1: 寫失敗測試**

```js
// src/battle/unit.test.js
import { describe, it, expect } from 'vitest';
import { applyBuff } from './buffs.js';
import { makeUnit } from './testHelpers.js';

describe('Unit 有效值 / 護盾 / 集氣速度', () => {
  it('atk buff 提升 effAtk；無 buff 時等於 atk', () => {
    const u = makeUnit({ atk: 100 });
    expect(u.effAtk).toBe(100);
    applyBuff(u, { kind: 'stat', stat: 'atk', op: 'mul', value: 1.5 });
    expect(u.effAtk).toBe(150);
  });

  it('critChance 夾在 0..1；dmgTakenMult 相乘', () => {
    const u = makeUnit();
    expect(u.critChance).toBeCloseTo(0.1);
    applyBuff(u, { kind: 'stat', stat: 'critChance', op: 'add', value: 5 });
    expect(u.critChance).toBe(1); // 夾上限
    applyBuff(u, { kind: 'stat', stat: 'dmgTaken', op: 'mul', value: 0.5 });
    expect(u.dmgTakenMult).toBe(0.5);
  });

  it('energyGainMult 放大集氣', () => {
    const u = makeUnit();
    applyBuff(u, { kind: 'stat', stat: 'energyGain', op: 'mul', value: 1.5 });
    u.gainEnergy(20);
    expect(u.energy).toBe(30); // round(20*1.5)
  });

  it('護盾先吸收再扣血', () => {
    const u = makeUnit({ hp: 100 });
    applyBuff(u, { kind: 'shield', amount: 30 });
    const dealt = u.takeDamage(50);
    expect(dealt).toBe(20); // 30 被護盾吸收，20 扣血
    expect(u.hp).toBe(80);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/battle/unit.test.js`
Expected: FAIL（getter 未定義）

- [ ] **Step 3: 實作**（改 `unit.js`）

頂部 import 追加:

```js
import { CRIT_CHANCE, CRIT_MULT } from './damage.js';
import { resolve, absorbWithShields } from './buffs.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
```

在 class 內加入 getter 與改寫 `gainEnergy`/`takeDamage`:

```js
  get effAtk() { return Math.round(resolve(this, 'atk', this.atk)); }
  get effDef() { return Math.round(resolve(this, 'def', this.def)); }
  get critChance() { return clamp01(resolve(this, 'critChance', CRIT_CHANCE)); }
  get critMult() { return resolve(this, 'critMult', CRIT_MULT); }
  get dmgTakenMult() { return resolve(this, 'dmgTaken', 1); }
  get dmgDealtMult() { return resolve(this, 'dmgDealt', 1); }
  get energyGainMult() { return resolve(this, 'energyGain', 1); }

  gainEnergy(amount) {
    const gained = Math.round(amount * this.energyGainMult);
    this.energy = Math.max(0, Math.min(ENERGY_MAX, this.energy + gained));
  }

  takeDamage(amount) {
    const incoming = Math.max(0, Math.round(amount));
    const toHp = absorbWithShields(this, incoming);
    const dealt = Math.min(this.hp, toHp);
    this.hp -= dealt;
    return dealt;
  }
```

（移除舊的 `gainEnergy`/`takeDamage`。）

- [ ] **Step 4: 跑全套件確認通過**

Run: `npm test`
Expected: PASS（既有 skills/engine/targeting 測試不受影響——無 buff 時行為相同）

- [ ] **Step 5: Commit**

```bash
git add src/battle/unit.js src/battle/unit.test.js
git commit -m "feat: Unit 加有效值 getter、護盾吸收、集氣速度倍率"
```

---

## Task 3: 目標選擇器 registry `SELECTORS`

**Files:**
- Modify: `src/battle/targeting.js`
- Modify: `src/battle/targeting.test.js`

**Interfaces:**
- Consumes: `columnOf`、`rowOf`（positions）;既有 `singleEnemyByColumn`、`lowestHpAlly`。
- Produces: `SELECTORS`(物件,key → `(caster, ctx) => Unit[]`),`ctx = { allies, enemies, rng }`:
  - `self`、`singleEnemyByColumn`、`enemyFrontRow`、`enemyBackRow`、`enemyColumn`、`allEnemies`、`allAllies`、`lowestHpAlly`、`oneAlly`。
  - `enemyFrontRow`/`enemyBackRow`:指定排全空 → 退位另一排。
  - `enemyColumn`:攻擊者直行全空 → 就近往小號(B→A→C、A→B→C、C→B→A)。

- [ ] **Step 1: 寫失敗測試**（追加到 `targeting.test.js`）

```js
// src/battle/targeting.test.js —— 追加
import { SELECTORS } from './targeting.js';

describe('SELECTORS registry', () => {
  const ctxWith = (enemies, allies = []) => ({ enemies, allies, rng: null });

  it('enemyFrontRow：前排全空退位打後排', () => {
    const back = [makeUnit({ team: 1, pos: 4 }), makeUnit({ team: 1, pos: 5 })];
    const res = SELECTORS.enemyFrontRow(makeUnit({ team: 0, pos: 1 }), ctxWith(back));
    expect(res.map((u) => u.pos).sort()).toEqual([4, 5]);
  });

  it('enemyBackRow：後排全空退位打前排', () => {
    const front = [makeUnit({ team: 1, pos: 2 })];
    const res = SELECTORS.enemyBackRow(makeUnit({ team: 0, pos: 1 }), ctxWith(front));
    expect(res.map((u) => u.pos)).toEqual([2]);
  });

  it('enemyColumn：本直行全空 → 就近往小號', () => {
    // 直行C(攻擊者 pos3)：C 空 → B → A。敵方只有直行B(pos2)
    const enemies = [makeUnit({ team: 1, pos: 2 })];
    const res = SELECTORS.enemyColumn(makeUnit({ team: 0, pos: 3 }), ctxWith(enemies));
    expect(res.map((u) => u.pos)).toEqual([2]);
  });

  it('allEnemies：全部存活', () => {
    const enemies = [makeUnit({ team: 1, pos: 1 }), makeUnit({ team: 1, pos: 2 })];
    expect(SELECTORS.allEnemies(makeUnit({ team: 0, pos: 1 }), ctxWith(enemies)).length).toBe(2);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/battle/targeting.test.js`
Expected: FAIL（`SELECTORS` 未定義）

- [ ] **Step 3: 實作**（追加到 `targeting.js`）

```js
// src/battle/targeting.js —— 檔尾追加
const COLUMN_FALLBACK = { 1: [1, 2, 3], 2: [2, 1, 3], 3: [3, 2, 1] };

function aliveIn(list) {
  return list.filter((u) => u.alive);
}

function enemiesInColumn(attacker, enemies) {
  const alive = aliveIn(enemies);
  for (const col of COLUMN_FALLBACK[columnOf(attacker.pos)]) {
    const inCol = alive.filter((u) => columnOf(u.pos) === col);
    if (inCol.length) return inCol;
  }
  return [];
}

export const SELECTORS = {
  self: (caster) => [caster],
  singleEnemyByColumn: (caster, ctx) => {
    const t = singleEnemyByColumn(caster, ctx.enemies);
    return t ? [t] : [];
  },
  enemyFrontRow: (caster, ctx) => {
    const front = ctx.enemies.filter((u) => u.alive && rowOf(u.pos) === 'front');
    return front.length ? front : ctx.enemies.filter((u) => u.alive && rowOf(u.pos) === 'back');
  },
  enemyBackRow: (caster, ctx) => {
    const back = ctx.enemies.filter((u) => u.alive && rowOf(u.pos) === 'back');
    return back.length ? back : ctx.enemies.filter((u) => u.alive && rowOf(u.pos) === 'front');
  },
  enemyColumn: (caster, ctx) => enemiesInColumn(caster, ctx.enemies),
  allEnemies: (caster, ctx) => aliveIn(ctx.enemies),
  allAllies: (caster, ctx) => aliveIn(ctx.allies),
  lowestHpAlly: (caster, ctx) => {
    const t = lowestHpAlly(ctx.allies);
    return t ? [t] : [];
  },
  oneAlly: (caster, ctx) => {
    const a = aliveIn(ctx.allies);
    if (!a.length) return [];
    return [ctx.rng ? ctx.rng.pick(a) : a[0]];
  },
};
```

- [ ] **Step 4: 跑全套件確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/battle/targeting.js src/battle/targeting.test.js
git commit -m "feat: 目標選擇器 registry（前/後排、直排退位、全體等）"
```

---

## Task 4: 效果原語 `effects.js`

**Files:**
- Create: `src/battle/effects.js`
- Test: `src/battle/effects.test.js`

**Interfaces:**
- Consumes: `computeDamage`（damage）、`elementMultiplier`（elements）、`applyBuff`（buffs）;Unit `effAtk`/`takeDamage`/`heal`/`gainEnergy`（Task 2）。
- Produces:
  - `resolvePower(effect, caster, target): number`:`basis:'targetMaxHp' ? target.maxHp*power : caster.effAtk*power`。
  - `resolveScope(scope, caster, primary, ctx): Unit[]`:`self/target/allAllies/allEnemies/alliesExceptTarget`(存活過濾)。
  - `dealDamage(caster, target, mult, ctx, skill='skill'): number`:傷害→護盾/hp、被擊回能、emit `damage`(+`death`)。
  - `dealDot(target, dot, ctx): number`:直接扣 hp(不吃護盾)、emit `damage`(skill:'dot')(+`death`)。
  - `applyEffect(effect, caster, units, ctx, skillId='skill')`:依 `type` 分派 `damage/heal/buff/dot/shield/energy`。

- [ ] **Step 1: 寫失敗測試**

```js
// src/battle/effects.test.js
import { describe, it, expect } from 'vitest';
import { resolvePower, resolveScope, dealDamage, applyEffect } from './effects.js';
import { makeUnit } from './testHelpers.js';
import { Rng } from '../core/rng.js';

const ctxFor = (caster, allies, enemies, events = []) => ({
  allies, enemies, rng: new Rng(1),
  emit: (event, payload) => events.push({ event, payload }),
});

describe('effects', () => {
  it('resolvePower：預設 atk 制、basis targetMaxHp 用目標 maxHp', () => {
    const caster = makeUnit({ atk: 100 });
    const target = makeUnit({ hp: 500 });
    expect(resolvePower({ power: 2.0 }, caster, target)).toBe(200);
    expect(resolvePower({ power: 0.1, basis: 'targetMaxHp' }, caster, target)).toBe(50);
  });

  it('resolveScope：self / allAllies / alliesExceptTarget', () => {
    const caster = makeUnit({ team: 0, pos: 1 });
    const a2 = makeUnit({ team: 0, pos: 2 });
    const ctx = { allies: [caster, a2], enemies: [] };
    expect(resolveScope('self', caster, [], ctx)).toEqual([caster]);
    expect(resolveScope('allAllies', caster, [], ctx).length).toBe(2);
    expect(resolveScope('alliesExceptTarget', caster, [caster], ctx)).toEqual([a2]);
  });

  it('damage 效果：扣血、被擊回能、發 damage 事件', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100, element: 'fire' });
    const foe = makeUnit({ team: 1, pos: 1, element: 'light', def: 0, hp: 99999, class: 'tank' });
    const events = [];
    const ctx = ctxFor(caster, [caster], [foe], events);
    applyEffect({ type: 'damage', mult: 1.0, scope: 'target' }, caster, [foe], ctx, 'burst');
    expect(foe.hp).toBeLessThan(99999);
    expect(foe.energy).toBe(foe.classDef.energyOnHitTaken); // 被擊回能
    expect(events.some((e) => e.event === 'damage')).toBe(true);
  });

  it('heal / buff / shield / dot 效果', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const ally = makeUnit({ team: 0, pos: 2, hp: 100 });
    ally.hp = 40;
    const ctx = ctxFor(caster, [caster, ally], []);
    // heal = effAtk×0.5 = 50
    applyEffect({ type: 'heal', power: 0.5, scope: 'target' }, caster, [ally], ctx);
    expect(ally.hp).toBe(90);
    // buff atk ×1.5
    applyEffect({ type: 'buff', stat: 'atk', op: 'mul', value: 1.5, duration: 2, scope: 'self' }, caster, [caster], ctx);
    expect(caster.effAtk).toBe(150);
    // shield = effAtk×0.3 = 30
    applyEffect({ type: 'shield', power: 0.3, scope: 'self' }, caster, [caster], ctx);
    expect(caster.buffs.some((b) => b.kind === 'shield' && b.amount === 30)).toBe(true);
    // dot：預存每跳傷害（atk×0.2=20，無屬性）
    applyEffect({ type: 'dot', power: 0.2, duration: 3, scope: 'self' }, caster, [caster], ctx);
    expect(caster.buffs.some((b) => b.kind === 'dot' && b.damage === 20)).toBe(true);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/battle/effects.test.js`
Expected: FAIL（`effects.js` 不存在）

- [ ] **Step 3: 實作**

```js
// src/battle/effects.js
// 效果原語：技能由多個 effect 組成，每個 effect 依 type 套用到 scope 解析出的目標。
import { computeDamage } from './damage.js';
import { elementMultiplier } from '../data/elements.js';
import { applyBuff } from './buffs.js';

// power 的基準：預設 caster.effAtk；basis:'targetMaxHp' 用目標 maxHp。
export function resolvePower(effect, caster, target) {
  const base = effect.basis === 'targetMaxHp' ? target.maxHp : caster.effAtk;
  return base * effect.power;
}

export function resolveScope(scope, caster, primary, ctx) {
  const alive = (arr) => arr.filter((u) => u.alive);
  switch (scope) {
    case 'self':
      return [caster];
    case 'target':
      return primary.filter((u) => u.alive);
    case 'allAllies':
      return alive(ctx.allies);
    case 'allEnemies':
      return alive(ctx.enemies);
    case 'alliesExceptTarget':
      return alive(ctx.allies).filter((u) => !primary.includes(u));
    default:
      return [];
  }
}

// 共用傷害：走 §4 完整公式、護盾/hp、被擊回能、事件。
export function dealDamage(caster, target, mult, ctx, skill = 'skill') {
  const res = computeDamage(caster, target, mult, ctx.rng);
  const dealt = target.takeDamage(res.amount);
  target.gainEnergy(target.classDef.energyOnHitTaken);
  ctx.emit('damage', {
    source: caster, target, amount: dealt, skill,
    isAdvantage: res.isAdvantage, isDisadvantage: res.isDisadvantage, isCrit: res.isCrit,
  });
  if (!target.alive) ctx.emit('death', { unit: target });
  return dealt;
}

// DoT：套用預存 damage，直接扣 hp（不吃護盾、不吃暴擊）。
export function dealDot(target, dot, ctx) {
  const dealt = Math.min(target.hp, dot.damage);
  target.hp -= dealt;
  ctx.emit('damage', {
    source: null, target, amount: dealt, skill: 'dot',
    isAdvantage: false, isDisadvantage: false, isCrit: false,
  });
  if (!target.alive) ctx.emit('death', { unit: target });
  return dealt;
}

export function applyEffect(effect, caster, units, ctx, skillId = 'skill') {
  for (const u of units) {
    switch (effect.type) {
      case 'damage':
        dealDamage(caster, u, effect.mult, ctx, skillId);
        break;
      case 'heal': {
        const healed = u.heal(Math.round(resolvePower(effect, caster, u)));
        if (healed > 0) ctx.emit('heal', { source: caster, target: u, amount: healed });
        break;
      }
      case 'buff':
        applyBuff(u, {
          kind: 'stat', stat: effect.stat, op: effect.op, value: effect.value,
          duration: effect.duration, key: effect.key, stackable: effect.stackable,
        });
        break;
      case 'dot': {
        const elem = effect.element ? elementMultiplier(caster.element, u.element) : 1;
        const damage = Math.round(resolvePower(effect, caster, u) * elem);
        applyBuff(u, {
          kind: 'dot', damage, element: effect.element,
          duration: effect.duration, key: effect.key, stackable: effect.stackable,
        });
        break;
      }
      case 'shield':
        applyBuff(u, {
          kind: 'shield', amount: Math.round(resolvePower(effect, caster, u)),
          duration: effect.duration, key: effect.key, stackable: effect.stackable,
        });
        break;
      case 'energy':
        u.gainEnergy(effect.amount);
        break;
    }
  }
}
```

- [ ] **Step 4: 跑全套件確認通過**

Run: `npm test`
Expected: PASS（新模組;此時 `computeDamage` 仍為舊簽名,無 buff 單位下 `effAtk===atk`,`dealDamage` 行為正確）

- [ ] **Step 5: Commit**

```bash
git add src/battle/effects.js src/battle/effects.test.js
git commit -m "feat: 效果原語 effects.js（damage/heal/buff/dot/shield/energy + scope/power 解析）"
```

---

## Task 5: 傷害接有效值 + guard buff 改格式 + 每次出手結算

**Files:**
- Modify: `src/battle/damage.js`
- Modify: `src/battle/skills.js`（`applyDamage`/`activeGuardMult`/`ULTIMATES.guard`）
- Modify: `src/battle/engine.js`（每輪 tick → 每次出手 tick）
- Modify: `src/battle/damage.test.js`、`src/battle/engine.test.js`

**Interfaces:**
- Produces:
  - `computeDamage(attacker, defender, mult, rng)`（**移除 `guardMult` 參數**）:讀 `effAtk/effDef/critChance/critMult/dmgTakenMult/dmgDealtMult`。
  - `ULTIMATES.guard` 改用 `applyBuff` 推 `{ kind:'stat', stat:'dmgTaken', op:'mul', value:0.5, duration:2, key:'guard' }`。
  - engine 每次出手後 `tickBuffs(u)`;移除 `_tickRoundBuffs`。

- [ ] **Step 1: 改 `damage.js`**

```js
// src/battle/damage.js —— 改寫 computeDamage（常數不動）
export function computeDamage(attacker, defender, mult, rng) {
  const elemMult = elementMultiplier(attacker.element, defender.element);
  const base = attacker.effAtk * mult;
  const afterDef = Math.max(base * 0.15, base - defender.effDef * 0.75);
  const variance = rng ? 1 + (rng.next() * 2 - 1) * DAMAGE_VARIANCE : 1;
  const isCrit = rng ? rng.next() < attacker.critChance : false;
  const critMult = isCrit ? attacker.critMult : 1;
  const raw =
    afterDef * elemMult * defender.dmgTakenMult * attacker.dmgDealtMult * variance * critMult * DAMAGE_GLOBAL;
  return {
    amount: Math.max(1, Math.round(raw)),
    elementMult: elemMult,
    isAdvantage: elemMult > 1,
    isDisadvantage: elemMult < 1,
    isCrit,
  };
}
```

- [ ] **Step 2: 改 `damage.test.js`**（改用真 Unit,讓有效值 getter 存在）

```js
// src/battle/damage.test.js
import { describe, it, expect } from 'vitest';
import { computeDamage, CRIT_MULT } from './damage.js';
import { makeUnit } from './testHelpers.js';

function fakeRng(values) {
  let i = 0;
  return { next: () => values[i++] };
}

describe('暴擊', () => {
  it('暴擊傷害為非暴擊的 1.5 倍（variance 相同）', () => {
    const atk = makeUnit({ team: 0, pos: 1, atk: 100, element: 'fire' });
    const def = makeUnit({ team: 1, pos: 1, element: 'light', def: 0, hp: 99999 });
    const noCrit = computeDamage(atk, def, 1, fakeRng([0.5, 0.9])); // crit 0.9 ≥ 0.1 → 無暴擊
    const crit = computeDamage(atk, def, 1, fakeRng([0.5, 0.05])); // 0.05 < 0.1 → 暴擊
    expect(noCrit.isCrit).toBe(false);
    expect(crit.isCrit).toBe(true);
    expect(crit.amount).toBe(Math.round(noCrit.amount * CRIT_MULT));
  });
});
```

- [ ] **Step 3: 改 `skills.js`**（`applyDamage` 去 guardMult、guard 改新格式）

頂部 import 追加 `applyBuff`:

```js
import { applyBuff } from './buffs.js';
```

`applyDamage` 改為(移除 `activeGuardMult`):

```js
function applyDamage(attacker, target, mult, ctx, skill) {
  const res = computeDamage(attacker, target, mult, ctx.rng);
  const dealt = target.takeDamage(res.amount);
  target.gainEnergy(target.classDef.energyOnHitTaken);
  ctx.emit('damage', {
    source: attacker, target, amount: dealt, skill,
    isAdvantage: res.isAdvantage, isDisadvantage: res.isDisadvantage, isCrit: res.isCrit,
  });
  if (!target.alive) ctx.emit('death', { unit: target });
}
```

刪除 `activeGuardMult` 函式。`ULTIMATES.guard` 內的 buff 推入改為:

```js
  guard(caster, ctx) {
    ctx.emit('ultimate', { caster, skill: 'guard' });
    for (const ally of ctx.allies) {
      if (!ally.alive) continue;
      applyBuff(ally, { kind: 'stat', stat: 'dmgTaken', op: 'mul', value: ULT.guardReduction, duration: ULT.guardDuration, key: 'guard' });
    }
    const healed = caster.heal(caster.maxHp * ULT.guardSelfHeal);
    if (healed > 0) ctx.emit('heal', { source: caster, target: caster, amount: healed });
  },
```

- [ ] **Step 4: 改 `engine.js`**（每次出手結算 buff）

頂部 import 追加:

```js
import { tickBuffs } from './buffs.js';
```

`_stepNormal` 內移除 `this._tickRoundBuffs();`（保留 `round += 1` 與 MAX_ROUNDS 判定）:

```js
    if (idx <= this._lastActedIdx) {
      this.round += 1;
      if (this.round >= MAX_ROUNDS) { this._endByHp(); return { type: 'timeout', unit }; }
    }
```

`_act` 行動後加入 tick:

```js
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
    if (tickBuffs(u)) this.emit('buffchange', { unit: u });
  }
```

刪除 `_tickRoundBuffs` 方法。

- [ ] **Step 5: 改 `engine.test.js`**（guard buff 斷言改新格式,2 步即檢查）

把「坦克技能給全隊減傷 buff」測試改為:

```js
  it('坦克技能給全隊減傷 buff（dmgTaken stat）', () => {
    const tank = makeUnit({ team: 0, pos: 1, class: 'tank', name: 'tank', energy: ENERGY_MAX });
    const ally = makeUnit({ team: 0, pos: 2, class: 'dps', name: 'ally' });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, name: 'foe' });
    const engine = new BattleEngine([tank, ally], [foe], { rng: new Rng(5) });
    engine.step(); // tank 普攻（滿氣）→ 中斷
    engine.step(); // 技能階段：tank 放 guard
    expect(ally.buffs?.some((b) => b.key === 'guard' && b.stat === 'dmgTaken')).toBe(true);
  });
```

- [ ] **Step 6: 跑全套件確認通過**

Run: `npm test`
Expected: PASS（傷害走有效值;guard 以 `dmgTaken` buff 減傷;每次出手遞減 buff）

- [ ] **Step 7: Commit**

```bash
git add src/battle/damage.js src/battle/damage.test.js src/battle/skills.js src/battle/engine.js src/battle/engine.test.js
git commit -m "refactor: 傷害改讀有效值、guard 改通用 dmgTaken buff、引擎每次出手結算 buff"
```

---

## Task 6: 技能改資料 `SKILLS` + `castSkill` + DoT 結算

**Files:**
- Modify: `src/battle/skills.js`（改為 `SKILLS`/`castSkill`/`skillFor`;`normalAttack` 用 `effects.dealDamage`;移除 `ULTIMATES`/`ULT`/`ultimateFor`/`applyDamage`）
- Modify: `src/battle/engine.js`（技能階段 `castSkill`;出手前結算 DoT）
- Modify: `src/battle/skills.test.js`、`src/battle/engine.test.js`

**Interfaces:**
- Consumes: `SELECTORS`、`singleEnemyByColumn`（targeting）;`dealDamage`、`dealDot`、`resolveScope`、`applyEffect`（effects）;`dotEntries`（buffs）。
- Produces:
  - `SKILLS`(資料 registry)。
  - `castSkill(caster, skillId, ctx)`:解析 `target` → 逐效果 `resolveScope` → `applyEffect`;emit `ultimate`。
  - `skillFor(unit)`:回 `unit.classDef.ultimate`。
  - `normalAttack(caster, ctx)`:用 `effects.dealDamage`。
  - engine `_act` 出手前:`for (dot of dotEntries(u)) dealDot(u, dot, ctx)`,DoT 若擊殺則跳過該單位行動。

- [ ] **Step 1: 改 `skills.js`**（全檔改寫）

```js
// src/battle/skills.js
// 技能即資料：SKILLS registry + castSkill。普攻與傷害共用 effects.dealDamage。
import { singleEnemyByColumn, SELECTORS } from './targeting.js';
import { dealDamage, resolveScope, applyEffect } from './effects.js';

// 技能資料（占位平衡值）。所有 power = % × 施放者 effAtk（見 spec 數值約定）。
export const SKILLS = {
  burst: {
    name: '爆發',
    target: 'singleEnemyByColumn',
    effects: [{ type: 'damage', mult: 2.6, scope: 'target' }],
  },
  guard: {
    name: '守護',
    effects: [
      { type: 'buff', stat: 'dmgTaken', op: 'mul', value: 0.5, duration: 2, key: 'guard', scope: 'allAllies' },
      { type: 'heal', power: 2.0, scope: 'self' },
    ],
  },
  heal: {
    name: '治癒',
    target: 'lowestHpAlly',
    effects: [
      { type: 'heal', power: 3.0, scope: 'target' },
      { type: 'heal', power: 1.2, scope: 'alliesExceptTarget' },
    ],
  },
};

export function skillFor(unit) {
  return unit.classDef.ultimate;
}

// 施放技能：解析主目標 → 逐效果依 scope 套用。
export function castSkill(caster, skillId, ctx) {
  const def = SKILLS[skillId];
  if (!def) return;
  const primary = def.target ? SELECTORS[def.target](caster, ctx) : [];
  ctx.emit('ultimate', { caster, skill: skillId, target: primary[0] });
  for (const effect of def.effects) {
    const units = resolveScope(effect.scope, caster, primary, ctx);
    applyEffect(effect, caster, units, ctx, skillId);
  }
}

// 普攻：直行對位選敵、施放者集氣、其餘存活隊友各獲 energyOnAllyAction。
export function normalAttack(caster, ctx) {
  const target = singleEnemyByColumn(caster, ctx.enemies);
  if (!target) return;
  ctx.emit('attack', { attacker: caster, target, skill: 'normal' });
  dealDamage(caster, target, 1.0, ctx, 'normal');
  caster.gainEnergy(caster.classDef.energyOnAction);
  for (const ally of ctx.allies) {
    if (ally === caster || !ally.alive) continue;
    const gain = ally.classDef.energyOnAllyAction || 0;
    if (gain) ally.gainEnergy(gain);
  }
}
```

- [ ] **Step 2: 改 `engine.js`**（castSkill + 出手前 DoT）

import 改為:

```js
import { normalAttack, castSkill, skillFor } from './skills.js';
import { tickBuffs, dotEntries } from './buffs.js';
import { dealDot } from './effects.js';
```

`_act` 改為:

```js
  _act(u, isSkill) {
    const ctx = {
      allies: this.alliesOf(u),
      enemies: this.enemiesOf(u),
      rng: this.rng,
      emit: (event, payload) => this.emit(event, payload),
    };
    // 出手前：結算身上的 DoT
    for (const dot of dotEntries(u)) {
      if (!u.alive) break;
      dealDot(u, dot, ctx);
    }
    if (!u.alive) return; // 被 DoT 擊殺 → 不行動（buff 隨死亡失效）
    this.emit('turn', { unit: u });
    if (isSkill) {
      u.energy = 0;
      castSkill(u, skillFor(u), ctx);
    } else {
      normalAttack(u, ctx);
    }
    if (tickBuffs(u)) this.emit('buffchange', { unit: u });
  }
```

- [ ] **Step 3: 改 `skills.test.js`**（普攻集氣照舊 + 新增 castSkill parity）

```js
// src/battle/skills.test.js
import { describe, it, expect } from 'vitest';
import { normalAttack, castSkill } from './skills.js';
import { makeUnit } from './testHelpers.js';
import { Rng } from '../core/rng.js';

const ctxFor = (caster, allies, enemies, events = []) => ({
  allies, enemies, rng: new Rng(1),
  emit: (event, payload) => events.push({ event, payload }),
});

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

describe('castSkill 資料驗證', () => {
  it('guard：全隊上 dmgTaken×0.5 buff、施放者自療', () => {
    const tank = makeUnit({ team: 0, pos: 1, class: 'tank', atk: 100 });
    const ally = makeUnit({ team: 0, pos: 2, class: 'dps' });
    tank.hp = 1; // 便於觀察自療
    castSkill(tank, 'guard', ctxFor(tank, [tank, ally], []));
    expect(ally.buffs.some((b) => b.stat === 'dmgTaken' && b.value === 0.5)).toBe(true);
    expect(tank.hp).toBe(1 + Math.round(tank.effAtk * 2.0)); // 自療 effAtk×2.0
  });

  it('heal：主目標大量、其餘小量', () => {
    const sup = makeUnit({ team: 0, pos: 5, class: 'support', atk: 100 });
    const hurt = makeUnit({ team: 0, pos: 1, hp: 1000 });
    const other = makeUnit({ team: 0, pos: 2, hp: 1000 });
    hurt.hp = 100; other.hp = 900;
    castSkill(sup, 'heal', ctxFor(sup, [sup, hurt, other], []));
    expect(hurt.hp).toBe(100 + Math.round(sup.effAtk * 3.0)); // 主目標 = 血最低者
    expect(other.hp).toBe(900 + Math.round(sup.effAtk * 1.2));
  });
});
```

- [ ] **Step 4: 改 `engine.test.js` import**

把 `import { BattleEngine, ENERGY_MAX } from './engine.js';` 保持;引擎不再匯出 `ultimateFor`(本就未在測試用)。無其他改動(Task 5 已更新 guard 測試)。

- [ ] **Step 5: 跑全套件確認通過**

Run: `npm test`
Expected: PASS（3 大招改資料後行為等價;DoT 於出手前結算）

- [ ] **Step 6: 確認建置**

Run: `npm run build`
Expected: 成功

- [ ] **Step 7: Commit**

```bash
git add src/battle/skills.js src/battle/engine.js src/battle/skills.test.js src/battle/engine.test.js
git commit -m "refactor: 技能改資料驅動 SKILLS + castSkill，引擎出手前結算 DoT"
```

---

## Self-Review

- **Spec 覆蓋**:
  - §1 Buff 容器/resolver → Task 1;§2 效果原語/scope/power → Task 4;§3 SKILLS/castSkill/skillFor/normalAttack → Task 6;
    §4 damage 有效值 → Task 5;§5 Unit 有效值/護盾/energyGainMult + 引擎每次出手結算 → Task 2 + Task 5/6;
    §6 選擇器 registry/退位 → Task 3;§8 驗收(parity、resolver、damage 接線、DoT、shield、集氣速度、basis、退位)分散於各任務測試。
- **型別一致**:`resolve/applyBuff/tickBuffs/absorbWithShields/dotEntries`(Task 1)、`effAtk/critChance/dmgTakenMult/energyGainMult`(Task 2)、`SELECTORS`(Task 3)、`resolvePower/resolveScope/dealDamage/dealDot/applyEffect`(Task 4)、`computeDamage(attacker,defender,mult,rng)`(Task 5)、`SKILLS/castSkill/skillFor`(Task 6)在各任務間簽名一致。
- **綠燈連續性**:T1–T4 為新增/相容(無 buff 時行為不變);T5 才切 `computeDamage` 簽名並同步更新唯一呼叫端(skills.applyDamage)與 damage.test、guard buff 格式、engine tick;T6 完成資料遷移。每任務尾 `npm test` 綠。
- **佔位符**:`guard` 自療 `power:2.0`、`ULT.guardReduction/guardDuration` 皆為占位平衡值,已於資料註明。無 TBD/TODO。
- **範圍**:每卡專屬技、嘲諷/控場 → Spec 3,不在本計畫。
