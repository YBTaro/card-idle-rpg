# Spec 3d — 每卡專屬技 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 每張卡有專屬主動技——`cardId → skillId`;`skillFor` 優先用專屬技,無則退回職業大招。

**Architecture:** 先接歸屬機制(Unit.cardId + skillFor fallback,附加、既有測試不變),再加 10 招 SKILLS 資料 + CARD_SKILLS 對照。每任務結束全套件綠。

**Tech Stack:** JavaScript (ESM)、Vitest。

## Global Constraints
- 引擎層不得 import pixi/gsap/DOM。Vitest。
- 技能只用已實作原語(damage/heal/buff/dot/shield/energy/control + 選擇器 + scope + where);power = %×effAtk。
- `skillFor(unit) = CARD_SKILLS[unit.cardId] ?? unit.classDef.ultimate`;無 cardId → 退回職業大招(既有行為不變)。
- 技能為佔位設計。
- Spec:`docs/superpowers/specs/2026-07-01-spec3d-card-skills-design.md`。
- 每任務 commit,繁中訊息。

---

## Task 1: 歸屬機制(cardId + skillFor fallback)

**Files:**
- Modify: `src/battle/unit.js`、`src/battle/testHelpers.js`、`src/battle/skills.js`
- Modify: `src/battle/skills.test.js`

**Interfaces:**
- Produces: `Unit.cardId`;`makeUnit({ cardId })`;`CARD_SKILLS`(初始空物件);`skillFor(unit) = CARD_SKILLS[unit.cardId] ?? unit.classDef.ultimate`。

- [ ] **Step 1: 寫失敗測試**（skills.test.js 追加;`skillFor` 從 skills.js 匯入）

```js
import { skillFor } from './skills.js';
describe('skillFor 歸屬', () => {
  it('無 cardId → 退回職業大招', () => {
    expect(skillFor(makeUnit({ class: 'dps' }))).toBe('burst');
    expect(skillFor(makeUnit({ class: 'tank' }))).toBe('guard');
    expect(skillFor(makeUnit({ class: 'support' }))).toBe('heal');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/battle/skills.test.js`
Expected: FAIL（若 skillFor 已存在但未匯出/未依 cardId → 視情況調整;此步確立 fallback 行為）

（註:`skillFor` 目前回 `unit.classDef.ultimate`,本測試在改動後仍應綠——先加測試鎖住 fallback。）

- [ ] **Step 3: 實作**

`src/battle/unit.js` — constructor 加（`this.name = stats.name;` 附近或屬性群內）：
```js
    this.cardId = stats.cardId;
```

`src/battle/testHelpers.js` — `stats` 物件加：
```js
    cardId: opts.cardId,
```

`src/battle/skills.js` — 新增空對照表並改 `skillFor`：
```js
// cardId → skillId（Task 2 填入 10 招）
export const CARD_SKILLS = {};

export function skillFor(unit) {
  return CARD_SKILLS[unit.cardId] ?? unit.classDef.ultimate;
}
```

- [ ] **Step 4: 跑全套件確認通過**

Run: `npm test`
Expected: PASS（CARD_SKILLS 空 → 全部退回職業大招,行為不變）

- [ ] **Step 5: Commit**

```bash
git add src/battle/unit.js src/battle/testHelpers.js src/battle/skills.js src/battle/skills.test.js
git commit -m "feat: 每卡技能歸屬機制（Unit.cardId + CARD_SKILLS + skillFor fallback）"
```

---

## Task 2: 10 招專屬技內容

**Files:**
- Modify: `src/battle/skills.js`（10 招 SKILLS + 填 CARD_SKILLS）
- Modify: `src/battle/skills.test.js`

**Interfaces:**
- Consumes: 現有 effects/selectors/control/where。
- Produces: `SKILLS` 新增 10 招;`CARD_SKILLS` 對照 10 張卡。

- [ ] **Step 1: 寫失敗測試**（skills.test.js 追加;匯入 `SKILLS, CARD_SKILLS, castSkill`、`hasControl`）

```js
import { SKILLS, CARD_SKILLS, castSkill } from './skills.js';
import { hasControl } from './buffs.js';

describe('每卡專屬技', () => {
  it('每張卡的專屬技都存在於 SKILLS', () => {
    const ids = Object.values(CARD_SKILLS);
    expect(ids.length).toBe(10);
    for (const id of ids) expect(SKILLS[id]).toBeTruthy();
  });

  it('shadowExecute（nightreaper）：目標受傷 + 被 stun', () => {
    const caster = makeUnit({ team: 0, pos: 1, cardId: 'nightreaper', atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    const ctx = ctxFor(caster, [caster], [foe]);
    castSkill(caster, skillFor(caster), ctx);
    expect(foe.hp).toBeLessThan(99999);
    expect(hasControl(foe, 'stun')).toBe(true);
  });

  it('tidalPrison（tidecaller）：直排目標受傷 + 被 silence', () => {
    const caster = makeUnit({ team: 0, pos: 1, cardId: 'tidecaller', atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    const ctx = ctxFor(caster, [caster], [foe]);
    castSkill(caster, skillFor(caster), ctx);
    expect(foe.hp).toBeLessThan(99999);
    expect(hasControl(foe, 'silence')).toBe(true);
  });

  it('windsong（galewind）：全隊 energyGain buff + 回血', () => {
    const caster = makeUnit({ team: 0, pos: 1, cardId: 'galewind', atk: 100 });
    const ally = makeUnit({ team: 0, pos: 2, hp: 1000 });
    ally.hp = 500;
    const ctx = ctxFor(caster, [caster, ally], []);
    castSkill(caster, skillFor(caster), ctx);
    expect(ally.buffs.some((b) => b.stat === 'energyGain')).toBe(true);
    expect(ally.hp).toBeGreaterThan(500);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/battle/skills.test.js`
Expected: FAIL（CARD_SKILLS 空、10 招未定義）

- [ ] **Step 3: 實作**（skills.js）

在 `SKILLS` 物件內(burst/guard/heal 之後)新增 10 招:
```js
  infernoNova: { name: '焚天', target: 'enemyFrontRow', effects: [
    { type: 'damage', mult: 1.8, scope: 'target' },
    { type: 'dot', power: 0.4, element: 'fire', duration: 2, scope: 'target' },
  ]},
  moltenBulwark: { name: '熔壁', effects: [
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'shield', power: 1.5, duration: 3, scope: 'allAllies' },
  ]},
  galeAssault: { name: '疾襲', target: 'enemyBackRow', effects: [
    { type: 'damage', mult: 2.2, scope: 'target' },
  ]},
  windsong: { name: '風歌', effects: [
    { type: 'buff', stat: 'energyGain', op: 'mul', value: 1.5, duration: 3, scope: 'allAllies' },
    { type: 'heal', power: 1.0, scope: 'allAllies' },
  ]},
  tidalPrison: { name: '潮牢', target: 'enemyColumn', effects: [
    { type: 'damage', mult: 1.6, scope: 'target' },
    { type: 'control', control: 'silence', duration: 2, scope: 'target' },
  ]},
  dragonGuard: { name: '龍護', effects: [
    { type: 'buff', stat: 'dmgTaken', op: 'mul', value: 0.6, duration: 2, key: 'guard', scope: 'allAllies' },
    { type: 'shield', power: 2.0, duration: 3, scope: 'self' },
  ]},
  radiantGrace: { name: '聖恩', target: 'lowestHpAlly', effects: [
    { type: 'heal', power: 3.5, scope: 'target' },
    { type: 'buff', stat: 'critChance', op: 'add', value: 0.2, duration: 2, scope: 'allAllies' },
  ]},
  dawnStrike: { name: '曙擊', target: 'singleEnemyByColumn', effects: [
    { type: 'damage', mult: 2.8, scope: 'target' },
    { type: 'buff', stat: 'atk', op: 'mul', value: 1.2, duration: 2, scope: 'self' },
  ]},
  shadowExecute: { name: '影誅', target: 'singleEnemyByColumn', effects: [
    { type: 'damage', mult: 3.0, scope: 'target' },
    { type: 'control', control: 'stun', duration: 1, scope: 'target' },
  ]},
  gravePact: { name: '墓約', effects: [
    { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
    { type: 'buff', stat: 'atk', op: 'mul', value: 0.7, duration: 2, scope: 'allEnemies' },
  ]},
```

填 `CARD_SKILLS`:
```js
export const CARD_SKILLS = {
  ifrit: 'infernoNova',
  emberguard: 'moltenBulwark',
  zephyr: 'galeAssault',
  galewind: 'windsong',
  tidecaller: 'tidalPrison',
  aegis: 'dragonGuard',
  seraph: 'radiantGrace',
  dawnblade: 'dawnStrike',
  nightreaper: 'shadowExecute',
  gravewarden: 'gravePact',
};
```

- [ ] **Step 4: 跑全套件確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: 確認建置**

Run: `npm run build`
Expected: 成功

- [ ] **Step 6: Commit**

```bash
git add src/battle/skills.js src/battle/skills.test.js
git commit -m "feat: 10 張卡專屬主動技（用 effects/control/where 組合）"
```

---

## Self-Review
- Spec 覆蓋:歸屬機制(T1)、10 招內容(T2)。
- 型別一致:`Unit.cardId`、`CARD_SKILLS`、`skillFor(unit)`、10 招皆用已實作原語。
- 綠燈:T1 CARD_SKILLS 空 → 全退回職業大招(不變);T2 加內容 + 抽樣驗證。
- 每招只用既有 selectors/effects/scope/control——無需動引擎。
