# Spec 3c — 被動 / 光環 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 常駐/條件式被動與光環——每 step 重算,產生 `aura` 光環 buff(kind:'stat'),沿用有效值 resolver。

**Architecture:** 先加 passives 資料(附加),再做 `passives.js` 重算模組,最後接進引擎 `step()`。每任務結束全套件綠。

**Tech Stack:** JavaScript (ESM)、Vitest。

## Global Constraints
- 引擎層不得 import pixi/gsap/DOM。Vitest。
- 光環 buff = `{ kind:'stat', stat, op, value, duration:null, aura:true }`;每 step 先清 aura 再重建(不累積)。
- 條件 `when`(AND):省略/`selfHpBelow`/`alliesAtLeast{count,where}`。
- 效果:靜態 `{stat,op,value}`;縮放 `perCountOf{side,where}`(mul:`1+basePct×count`、add:`valuePer×count`)。
- 無被動時行為完全不變。
- Spec:`docs/superpowers/specs/2026-07-01-spec3c-passives-design.md`。
- 每任務 commit,繁中訊息。

---

## Task 1: passives 資料 + Unit

**Files:**
- Modify: `src/data/cards.js`、`src/core/stats.js`、`src/battle/unit.js`、`src/battle/testHelpers.js`
- Test: `src/core/stats.test.js`

**Interfaces:**
- Produces: 部分卡有 `passives: PassiveDef[]`;`deriveStats` 輸出 `passives`;`Unit.passives`;`makeUnit({ passives })`(預設 `[]`)。

- [ ] **Step 1: 寫失敗測試**（stats.test.js 追加）

```js
describe('deriveStats 帶出被動', () => {
  it('aegis 有 def 光環被動；無被動卡為空陣列', () => {
    const s = deriveStats({ cardId: 'aegis', level: 1 });
    expect(Array.isArray(s.passives)).toBe(true);
    expect(s.passives.length).toBeGreaterThan(0);
    expect(s.passives[0].effects[0].stat).toBe('def');
    const z = deriveStats({ cardId: 'zephyr', level: 1 });
    expect(z.passives).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/core/stats.test.js`
Expected: FAIL

- [ ] **Step 3: 實作**

`src/data/cards.js` — 為 3 張卡加 `passives`（其餘卡不加,deriveStats 會補 `[]`）：
```js
// aegis：存活時全隊 +10% 防
aegis: { …現有欄位…, passives: [{ target: 'allAllies', effects: [{ stat: 'def', op: 'mul', value: 1.1 }] }] },
// ifrit：殘血(<50%)自身 +30% 攻
ifrit: { …現有欄位…, passives: [{ when: { selfHpBelow: 0.5 }, target: 'self', effects: [{ stat: 'atk', op: 'mul', value: 1.3 }] }] },
// nightreaper：每有一位不死隊友(含自己) +5% 攻
nightreaper: { …現有欄位…, passives: [{ target: 'self', effects: [{ stat: 'atk', op: 'mul', basePct: 0.05, perCountOf: { side: 'allies', where: { race: '不死' } } }] }] },
```
（把 `passives` 加在該卡物件內既有欄位之後即可,不動其他欄位。）

`src/core/stats.js` — `deriveStats` 回傳加：
```js
    passives: card.passives || [],
```

`src/battle/unit.js` — constructor 加（`this.series = …` 之後）：
```js
    this.passives = stats.passives || [];
```

`src/battle/testHelpers.js` — `stats` 物件加：
```js
    passives: opts.passives ?? [],
```

- [ ] **Step 4: 跑全套件確認通過**

Run: `npm test`
Expected: PASS（附加,既有不變）

- [ ] **Step 5: Commit**

```bash
git add src/data/cards.js src/core/stats.js src/battle/unit.js src/battle/testHelpers.js src/core/stats.test.js
git commit -m "feat: 卡片/單位加被動 passives（佔位測試資料）"
```

---

## Task 2: passives.js 重算模組

**Files:**
- Create: `src/battle/passives.js`
- Test: `src/battle/passives.test.js`
- Modify: `src/battle/buffs.js`（`clearAuras`）+ `src/battle/buffs.test.js`

**Interfaces:**
- Consumes: `applyBuff`（buffs）、`matchesWhere`（effects）、Unit `effAtk/effDef/hpRatio`。
- Produces: `clearAuras(unit)`（buffs.js）;`recomputePassives(teams)`（passives.js）——清 aura、依存活單位被動重建。

- [ ] **Step 1: 寫失敗測試**

buffs.test.js 追加:
```js
import { clearAuras } from './buffs.js';
describe('clearAuras', () => {
  it('只移除 aura、保留其他 buff', () => {
    const u = { buffs: [
      { kind: 'stat', stat: 'atk', op: 'add', value: 5 },
      { kind: 'stat', stat: 'def', op: 'mul', value: 1.2, aura: true },
    ] };
    clearAuras(u);
    expect(u.buffs.length).toBe(1);
    expect(u.buffs[0].aura).toBeUndefined();
  });
});
```

passives.test.js（新建）:
```js
import { describe, it, expect } from 'vitest';
import { recomputePassives } from './passives.js';
import { makeUnit } from './testHelpers.js';

describe('recomputePassives', () => {
  it('靜態光環：全隊 +10% def', () => {
    const tank = makeUnit({ team: 0, pos: 1, def: 100, passives: [{ target: 'allAllies', effects: [{ stat: 'def', op: 'mul', value: 1.1 }] }] });
    const ally = makeUnit({ team: 0, pos: 2, def: 100 });
    const foe = makeUnit({ team: 1, pos: 1, def: 100 });
    recomputePassives([[tank, ally], [foe]]);
    expect(ally.effDef).toBe(110);
    expect(tank.effDef).toBe(110);
    expect(foe.effDef).toBe(100);
  });

  it('條件 selfHpBelow', () => {
    const dps = makeUnit({ team: 0, pos: 1, atk: 100, hp: 1000, passives: [{ when: { selfHpBelow: 0.5 }, target: 'self', effects: [{ stat: 'atk', op: 'mul', value: 1.3 }] }] });
    const foe = makeUnit({ team: 1, pos: 1 });
    recomputePassives([[dps], [foe]]);
    expect(dps.effAtk).toBe(100); // 滿血無效
    dps.hp = 400;
    recomputePassives([[dps], [foe]]);
    expect(dps.effAtk).toBe(130);
  });

  it('數量縮放：每不死隊友 +5% atk', () => {
    const p = [{ target: 'self', effects: [{ stat: 'atk', op: 'mul', basePct: 0.05, perCountOf: { side: 'allies', where: { race: '不死' } } }] }];
    const a = makeUnit({ team: 0, pos: 1, atk: 100, race: '不死', passives: p });
    const b = makeUnit({ team: 0, pos: 2, race: '不死' });
    const c = makeUnit({ team: 0, pos: 3, race: '人' });
    const foe = makeUnit({ team: 1, pos: 1 });
    recomputePassives([[a, b, c], [foe]]);
    expect(a.effAtk).toBe(110); // 2 不死 → 1+0.05*2=1.1
  });

  it('重算不累積、非光環 buff 保留', () => {
    const tank = makeUnit({ team: 0, pos: 1, def: 100, passives: [{ target: 'self', effects: [{ stat: 'def', op: 'mul', value: 1.2 }] }] });
    const foe = makeUnit({ team: 1, pos: 1 });
    tank.buffs = [{ kind: 'stat', stat: 'atk', op: 'add', value: 5 }];
    recomputePassives([[tank], [foe]]);
    recomputePassives([[tank], [foe]]);
    expect(tank.effDef).toBe(120); // 不疊加
    expect(tank.buffs.some((b) => b.stat === 'atk' && !b.aura)).toBe(true);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/battle/buffs.test.js src/battle/passives.test.js`
Expected: FAIL（`clearAuras`/`recomputePassives` 未定義）

- [ ] **Step 3: 實作**

`src/battle/buffs.js` 追加:
```js
export function clearAuras(unit) {
  if (unit.buffs) unit.buffs = unit.buffs.filter((b) => !b.aura);
}
```

`src/battle/passives.js`（新建）:
```js
// 被動/光環：每 step 重算。清掉 aura 光環 buff，再依存活單位的 passives 重建。
import { applyBuff, clearAuras } from './buffs.js';
import { matchesWhere } from './effects.js';

function countMatching(list, where) {
  return list.filter((u) => u.alive && matchesWhere(u, where)).length;
}

function conditionHolds(when, owner, teams) {
  if (!when) return true;
  if (when.selfHpBelow != null && !(owner.hpRatio < when.selfHpBelow)) return false;
  if (when.alliesAtLeast) {
    const c = countMatching(teams[owner.team], when.alliesAtLeast.where);
    if (c < when.alliesAtLeast.count) return false;
  }
  return true;
}

function passiveScope(target, owner, teams) {
  const allies = teams[owner.team];
  const enemies = teams[owner.team ^ 1];
  switch (target) {
    case 'self': return owner.alive ? [owner] : [];
    case 'allAllies': return allies.filter((u) => u.alive);
    case 'allEnemies': return enemies.filter((u) => u.alive);
    default: return [];
  }
}

function auraValue(effect, owner, teams) {
  if (effect.perCountOf) {
    const list = effect.perCountOf.side === 'enemies' ? teams[owner.team ^ 1] : teams[owner.team];
    const count = countMatching(list, effect.perCountOf.where);
    if (effect.op === 'mul') return 1 + (effect.basePct || 0) * count;
    return (effect.valuePer || 0) * count;
  }
  return effect.value;
}

export function recomputePassives(teams) {
  const all = [...teams[0], ...teams[1]];
  for (const u of all) clearAuras(u);
  for (const owner of all) {
    if (!owner.alive || !owner.passives || owner.passives.length === 0) continue;
    for (const p of owner.passives) {
      if (!conditionHolds(p.when, owner, teams)) continue;
      const targets = passiveScope(p.target, owner, teams);
      for (const t of targets) {
        for (const e of p.effects) {
          applyBuff(t, { kind: 'stat', stat: e.stat, op: e.op, value: auraValue(e, owner, teams), duration: null, aura: true });
        }
      }
    }
  }
}
```

- [ ] **Step 4: 跑全套件確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/battle/passives.js src/battle/passives.test.js src/battle/buffs.js src/battle/buffs.test.js
git commit -m "feat: 被動/光環重算模組 passives.js（clearAuras + recomputePassives）"
```

---

## Task 3: 引擎整合

**Files:**
- Modify: `src/battle/engine.js`、`src/battle/engine.test.js`

**Interfaces:**
- Consumes: `recomputePassives`（passives）。
- Produces: `step()` 於 phase 分派前呼叫 `recomputePassives(this.teams)`。

- [ ] **Step 1: 寫失敗測試**（engine.test.js 追加）

```js
  it('被動：開打時光環反映在 effDef', () => {
    const tank = makeUnit({ team: 0, pos: 1, def: 100, passives: [{ target: 'allAllies', effects: [{ stat: 'def', op: 'mul', value: 1.1 }] }] });
    const ally = makeUnit({ team: 0, pos: 2, def: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999 });
    const engine = new BattleEngine([tank, ally], [foe], { rng: new Rng(1) });
    engine.step(); // step 內先 recompute
    expect(ally.effDef).toBe(110);
  });
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/battle/engine.test.js`
Expected: FAIL（effDef 仍 100）

- [ ] **Step 3: 實作**（engine.js）

頂部 import 追加:
```js
import { recomputePassives } from './passives.js';
```
`step()` 改為（最前面重算）:
```js
  step() {
    if (this.over) return null;
    recomputePassives(this.teams);
    return this.phase === 'normal' ? this._stepNormal() : this._stepSkill();
  }
```

- [ ] **Step 4: 跑全套件確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: 確認建置**

Run: `npm run build`
Expected: 成功

- [ ] **Step 6: Commit**

```bash
git add src/battle/engine.js src/battle/engine.test.js
git commit -m "feat: 引擎每 step 重算被動/光環"
```

---

## Self-Review
- Spec 覆蓋:passives 資料(T1)、重算模組(T2)、引擎整合(T3)。
- 型別一致:`clearAuras(unit)`、`recomputePassives(teams)`、光環 buff `{kind:'stat',…,aura:true,duration:null}`。
- 綠燈:T1 附加;T2 純新模組;T3 無被動時 recompute 不產生任何 aura → 行為不變。
- 無循環:passives → buffs / effects;engine → passives。effects 不 import passives。
