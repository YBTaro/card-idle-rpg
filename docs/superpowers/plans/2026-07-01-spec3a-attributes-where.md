# Spec 3a — 屬性 + where 過濾 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 卡片/單位加 `race`(單值)+`series`(多值)標籤,並讓效果以 `where` 條件過濾目標。

**Architecture:** 先加屬性(cards/stats/unit/testHelpers,附加、既有測試不變),再加 `matchesWhere` + `applyEffect` 過濾。每任務結束全套件綠。

**Tech Stack:** JavaScript (ESM)、Vitest。測試:`npm test`。

## Global Constraints
- 引擎層(`src/battle/**`)不得 import pixi/gsap/DOM。Vitest。
- `race` 單值等值比對;`series` 多值成員判斷;`where` 多鍵 AND;無 `where` 行為不變。
- 種族/系列卡片配置為佔位測試資料。
- Spec:`docs/superpowers/specs/2026-07-01-spec3a-attributes-where-design.md`。
- 每任務 commit,繁中訊息。

---

## Task 1: 屬性 race/series

**Files:**
- Modify: `src/data/cards.js`、`src/core/stats.js`、`src/battle/unit.js`、`src/battle/testHelpers.js`
- Test: `src/core/stats.test.js`（新建）

**Interfaces:**
- Produces: 每張卡有 `race: string`、`series: string[]`;`deriveStats` 輸出含 `race`/`series`;`Unit.race`、`Unit.series`;`makeUnit({ race, series })`（預設 `'人'` / `[]`）。

- [ ] **Step 1: 寫失敗測試**

```js
// src/core/stats.test.js
import { describe, it, expect } from 'vitest';
import { deriveStats } from './stats.js';

describe('deriveStats 帶出種族/系列', () => {
  it('輸出含 race 與 series', () => {
    const s = deriveStats({ cardId: 'gravewarden', level: 1 });
    expect(s.race).toBe('不死');
    expect(s.series).toContain('影之眷屬');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/core/stats.test.js`
Expected: FAIL（deriveStats 未含 race/series）

- [ ] **Step 3: 實作**

`src/data/cards.js` — 每張卡加 `race` 與 `series`（放在 `class` 之後、`base` 之前即可）：

```
ifrit:       race:'妖',   series:['炎之眷屬']
emberguard:  race:'機械', series:['炎之眷屬','守護者']
zephyr:      race:'人',   series:['疾風']
galewind:    race:'人',   series:['疾風','聖歌隊']
tidecaller:  race:'人',   series:['潮汐']
aegis:       race:'龍',   series:['潮汐','守護者']
seraph:      race:'神',   series:['聖歌隊','光輝']
dawnblade:   race:'人',   series:['光輝']
nightreaper: race:'不死', series:['影之眷屬']
gravewarden: race:'不死', series:['影之眷屬','守護者']
```

例（ifrit 一列）：
```js
ifrit: { id: 'ifrit', name: '炎獄魔將', element: 'fire', class: 'dps', race: '妖', series: ['炎之眷屬'], base: { hp: 520, atk: 95, def: 40 }, growth: { hp: 58, atk: 11, def: 4 } },
```

`src/core/stats.js` — `deriveStats` 回傳物件加兩欄：
```js
  return {
    cardId: card.id,
    name: card.name,
    element: card.element,
    class: card.class,
    race: card.race,
    series: card.series,
    level: cardInst.level,
    hp: Math.round(raw.hp * cls.statMods.hp),
    atk: Math.round(raw.atk * cls.statMods.atk),
    def: Math.round(raw.def * cls.statMods.def),
  };
```

`src/battle/unit.js` — constructor 加（在 `this.def = stats.def;` 之後）：
```js
    this.race = stats.race;
    this.series = stats.series || [];
```

`src/battle/testHelpers.js` — `stats` 物件加：
```js
    race: opts.race ?? '人',
    series: opts.series ?? [],
```

- [ ] **Step 4: 跑全套件確認通過**

Run: `npm test`
Expected: PASS（既有測試不受影響——僅新增欄位）

- [ ] **Step 5: Commit**

```bash
git add src/data/cards.js src/core/stats.js src/battle/unit.js src/battle/testHelpers.js src/core/stats.test.js
git commit -m "feat: 卡片/單位加種族(race)與系列(series)標籤（佔位測試資料）"
```

---

## Task 2: where 條件過濾

**Files:**
- Modify: `src/battle/effects.js`
- Modify: `src/battle/effects.test.js`

**Interfaces:**
- Consumes: `Unit.race`/`series`（Task 1）。
- Produces: `matchesWhere(unit, where): boolean`;`applyEffect` 以 `effect.where` 過濾目標。

- [ ] **Step 1: 寫失敗測試**（追加到 effects.test.js）

```js
// src/battle/effects.test.js —— 追加
import { matchesWhere } from './effects.js';

describe('where 條件過濾', () => {
  it('matchesWhere：race 等值、series 成員、AND、無 where', () => {
    const u = makeUnit({ race: '不死', series: ['影之眷屬', '守護者'], element: 'dark' });
    expect(matchesWhere(u, undefined)).toBe(true);
    expect(matchesWhere(u, { race: '不死' })).toBe(true);
    expect(matchesWhere(u, { race: '人' })).toBe(false);
    expect(matchesWhere(u, { series: '守護者' })).toBe(true);
    expect(matchesWhere(u, { series: '聖歌隊' })).toBe(false);
    expect(matchesWhere(u, { race: '不死', element: 'dark' })).toBe(true);
    expect(matchesWhere(u, { race: '不死', element: 'fire' })).toBe(false);
  });

  it('applyEffect 用 where 只作用於符合的目標', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100, element: 'fire' });
    const undead = makeUnit({ team: 1, pos: 1, race: '不死', hp: 99999, def: 0, class: 'tank' });
    const human = makeUnit({ team: 1, pos: 2, race: '人', hp: 99999, def: 0, class: 'tank' });
    const ctx = ctxFor(caster, [caster], [undead, human]);
    applyEffect({ type: 'damage', mult: 1.0, scope: 'allEnemies', where: { race: '不死' } }, caster, [undead, human], ctx);
    expect(undead.hp).toBeLessThan(99999); // 受擊
    expect(human.hp).toBe(99999); // 不受影響
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/battle/effects.test.js`
Expected: FAIL（`matchesWhere` 未定義）

- [ ] **Step 3: 實作**（effects.js）

檔尾（或 resolveScope 附近）新增：
```js
// where 條件過濾：series 成員判斷、其餘等值；多鍵 AND；無 where → true。
export function matchesWhere(unit, where) {
  if (!where) return true;
  for (const [key, val] of Object.entries(where)) {
    if (key === 'series') {
      if (!unit.series || !unit.series.includes(val)) return false;
    } else if (unit[key] !== val) {
      return false;
    }
  }
  return true;
}
```

`applyEffect` 開頭改為先過濾：
```js
export function applyEffect(effect, caster, units, ctx, skillId = 'skill') {
  const targets = effect.where ? units.filter((u) => matchesWhere(u, effect.where)) : units;
  for (const u of targets) {
    switch (effect.type) {
      // ……原本的 case 內容不變……
    }
  }
}
```

- [ ] **Step 4: 跑全套件確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/battle/effects.js src/battle/effects.test.js
git commit -m "feat: 效果加 where 條件過濾（race 等值 / series 成員 / AND）"
```

---

## Self-Review
- Spec 覆蓋:屬性(Task 1)、where(Task 2)、範例技能資料屬後續內容。
- 型別一致:`race:string`、`series:string[]`、`matchesWhere(unit, where)`、`applyEffect` 過濾。
- 綠燈:Task 1 純附加(既有測試不變);Task 2 無 where 時行為不變。
