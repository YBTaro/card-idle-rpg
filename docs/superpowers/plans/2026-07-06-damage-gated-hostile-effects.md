# 傷害門檻命中模型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓對敵技能的「傷害是否命中」成為其後續所有敵對效果的總開關——命中即全套落實、閃避即全套落空。

**Architecture:** `castSkill` 改兩段式：先跑完 `damage` 段並記錄命中的敵人集合，再跑其餘段；`applyEffect` 新增 `recordHits`/`gate` 選用參數，對敵的可門檻效果依命中集合放行、取代自身閃避判定。8 支純減益對敵技各補一段傷害；附加效果描述改「命中的目標」。

**Tech Stack:** 純 JS（ESM）、vitest。零相依。

## Global Constraints

- 命中集合放行只取代「閃避（rollHit）」這一層；命中後仍照舊跑 `chance`、效果抗性（effectRes/effectHit）、格擋護符（debuffBlock）。
- 對我方 / 自身效果永遠 100%（不經門檻）；`weather`/`terrain` 全場效果不進逐目標迴圈、不受影響。
- `applyEffect` 不傳 `opts` 時行為與現況完全一致（onEnter / 環境 / 觸發 / 既有測試沿用）。
- 可門檻效果集合（GATED）= `dot / control / buff / transmute / nightmare / mark / dispel / extend / detonateDot / energySteal / stealBuff / transferDebuff`。
- 傷害數值：全體技地板 80%；熔壁（敵前排）120%、嫁禍（單體）150%。
- 技能治理（`skillGovernance.test.js`）須維持綠燈：效果數 ≤ 4、狀態類 ≤ 2。

**執行前置**：本 plan 在專屬分支上執行。工作區現有本 session 的平衡改動與獵殺令/潮牢改動（未提交），執行者先將這些既有變更提交為一個「session 平衡調整」commit，再於其上開始本 plan 的 Task 1。

---

### Task 1: 8 支純減益對敵技補傷害段

先做（純加法、不啟用門檻），確保全測試綠燈。

**Files:**
- Modify: `src/battle/skills.js`（8 支技能 effects 陣列）
- Test: `src/battle/damageGate.test.js`（新建）

**Interfaces:**
- Consumes: `castSkill(caster, skillId, ctx)`、`makeUnit`、`resolveScope`（皆現有）。
- Produces: 8 支技能各含一段 `{ type:'damage', mult, scope }`，scope 對齊其 debuff scope。

- [ ] **Step 1: 寫失敗測試（新檔）**

`src/battle/damageGate.test.js`：
```js
import { describe, it, expect } from 'vitest';
import { castSkill } from './skills.js';
import { makeUnit } from './testHelpers.js';
import { Rng } from '../core/rng.js';

const ctxFor = (caster, allies, enemies) => ({ allies, enemies, rng: new Rng(1), emit: () => {} });

describe('純減益對敵技補傷害段', () => {
  it('雷紋：對敵全體造成 80% 傷害', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    const before = foe.hp;
    castSkill(caster, 'thunderMark', ctxFor(caster, [caster], [foe]));
    expect(foe.hp).toBe(before - Math.round(caster.effAtk * 0.8));
    expect(foe.buffs.some((b) => b.stat === 'dmgTaken')).toBe(true);
  });

  it('嫁禍：對單體造成 150% 傷害 + 中毒', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    const before = foe.hp;
    castSkill(caster, 'blameShift', ctxFor(caster, [caster], [foe]));
    expect(foe.hp).toBeLessThanOrEqual(before - Math.round(caster.effAtk * 1.5));
    expect(foe.buffs.some((b) => b.kind === 'dot')).toBe(true);
  });

  it('熔壁：對敵前排造成 120% 傷害 + 受持續傷害提升', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    const before = foe.hp;
    castSkill(caster, 'moltenBulwark', ctxFor(caster, [caster], [foe]));
    expect(foe.hp).toBe(before - Math.round(caster.effAtk * 1.2));
    expect(foe.buffs.some((b) => b.stat === 'dotTaken')).toBe(true);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/battle/damageGate.test.js`
Expected: FAIL（現在這些技能無傷害段，`foe.hp` 不變）

- [ ] **Step 3: 8 支技能各加一段 damage**

在 `src/battle/skills.js` 依下表把 `damage` 段加為該技能 effects 的**第一段**（scope 對齊 debuff）：

```js
// moltenBulwark（熔壁）— 敵前排
{ type: 'damage', mult: 1.2, scope: 'target' },
// gravePact（墓約）/ thunderMark（雷紋）/ deathKnell（喪鐘）/
// boneRampart（骨牆）/ duskVeil（暮幕）/ emberWarmth（餘溫）— 敵全體
{ type: 'damage', mult: 0.8, scope: 'allEnemies' },
// blameShift（嫁禍）— 單體
{ type: 'damage', mult: 1.5, scope: 'target' },
```

逐一修改（範例——熔壁）：
```js
moltenBulwark: { name: '熔壁', target: 'enemyFrontRow', effects: [
  { type: 'damage', mult: 1.2, scope: 'target' }, // 補傷害段（傷害門檻模型）
  { type: 'control', control: 'taunt', duration: 2, scope: 'self' },
  { type: 'buff', stat: 'dotTaken', op: 'mul', value: 1.3, duration: 2, scope: 'target' },
]},
```
其餘 7 支同理，各在 effects 最前面插入對應的 `damage` 段（gravePact/thunderMark/deathKnell/boneRampart/duskVeil/emberWarmth 用 `mult:0.8, scope:'allEnemies'`；blameShift 用 `mult:1.5, scope:'target'`）。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/battle/damageGate.test.js`
Expected: PASS

- [ ] **Step 5: 跑治理與全套回歸**

Run: `npx vitest run src/battle/skillGovernance.test.js src/battle/skillText.test.js src/battle/healMod.test.js`
Expected: PASS（治理 ≤4 效果 / ≤2 狀態；describeSkill 既有斷言仍成立）

- [ ] **Step 6: Commit**

```bash
git add src/battle/skills.js src/battle/damageGate.test.js
git commit -m "feat: 8 支純減益對敵技補傷害段（傷害門檻模型前置）"
```

---

### Task 2: 引擎——傷害門檻兩段式

**Files:**
- Modify: `src/battle/effects.js`（`applyEffect` 加 `opts`；新增 `GATED_FOLLOWUP`）
- Modify: `src/battle/skills.js`（`castSkill` 兩段式）
- Test: `src/battle/damageGate.test.js`（追加）

**Interfaces:**
- Consumes: `rollHit`、`DODGEABLE`、`HOSTILE_STATUS`、`resolveScope`（現有）。
- Produces:
  - `applyEffect(effect, caster, units, ctx, skillId = 'skill', opts = {})`，`opts = { recordHits?: Set, gate?: Set }`。
  - `GATED_FOLLOWUP: Set<string>`（模組內常數）。
  - `castSkill` 對 `damage` 段傳 `{ recordHits }`、其餘段傳 `{ gate }`。

- [ ] **Step 1: 追加失敗測試**

在 `src/battle/damageGate.test.js` 追加：
```js
import { applyBuff } from './buffs.js';
const dodgeBuff = (v) => ({ kind: 'stat', stat: 'dodge', op: 'add', value: v, duration: 2 });

describe('傷害門檻：命中決定後續', () => {
  it('閃掉傷害 → 後續減益全部落空', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    applyBuff(foe, dodgeBuff(1.0)); // 必閃
    castSkill(caster, 'thunderMark', ctxFor(caster, [caster], [foe]));
    expect(foe.buffs.some((b) => b.stat === 'dmgTaken')).toBe(false); // 減益未上
  });

  it('打中 → 後續減益落實', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 }); // dodge 0 → 必中
    castSkill(caster, 'thunderMark', ctxFor(caster, [caster], [foe]));
    expect(foe.buffs.some((b) => b.stat === 'dmgTaken')).toBe(true);
  });

  it('多目標：只閃的那個沒吃減益，被打中的照吃', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const dodger = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    const hit = makeUnit({ team: 1, pos: 2, hp: 99999, def: 0 });
    applyBuff(dodger, dodgeBuff(1.0));
    castSkill(caster, 'thunderMark', ctxFor(caster, [caster], [dodger, hit]));
    expect(dodger.buffs.some((b) => b.stat === 'dmgTaken')).toBe(false);
    expect(hit.buffs.some((b) => b.stat === 'dmgTaken')).toBe(true);
  });

  it('對我方效果不受門檻：閃避拉滿的隊友照吃增益', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const ally = makeUnit({ team: 0, pos: 2, hp: 1000 });
    applyBuff(ally, dodgeBuff(1.0));
    castSkill(caster, 'windsong', ctxFor(caster, [caster, ally], []));
    expect(ally.buffs.some((b) => b.stat === 'energyGain')).toBe(true);
  });

  it('energySteal 受門檻：閃掉就不奪能', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    foe.energy = 80;
    applyBuff(foe, dodgeBuff(1.0));
    castSkill(caster, 'energyLeech', ctxFor(caster, [caster], [foe]));
    expect(foe.energy).toBe(80); // 未被奪
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/battle/damageGate.test.js -t 傷害門檻`
Expected: FAIL（目前每段各自擲閃避，閃避 1.0 下減益本就不上——但「多目標」與「energySteal 受門檻」會失敗：energySteal 現不判定閃避，會照奪）

- [ ] **Step 3: `effects.js` 加 `GATED_FOLLOWUP` 與 `opts`**

在 `HOSTILE_STATUS` 定義後加：
```js
// 傷害門檻（castSkill 兩段式）放行的對敵後續效果：敵對狀態 + 操作類。
const GATED_FOLLOWUP = new Set([
  'dot', 'control', 'buff', 'transmute', 'nightmare', 'mark',
  'dispel', 'extend', 'detonateDot', 'energySteal', 'stealBuff', 'transferDebuff',
]);
```

`applyEffect` 簽名改為：
```js
export function applyEffect(effect, caster, units, ctx, skillId = 'skill', opts = {}) {
```

把逐目標迴圈開頭的命中判定區塊（現為 `if (DODGEABLE.has(effect.type) && caster && u.team !== caster.team && !rollHit(...))`）替換為：
```js
  for (const u of targets) {
    const hostile = caster && u.team !== caster.team;
    // 傷害門檻：castSkill「其餘段」對敵的可門檻效果，依命中集合放行（取代自身閃避判定）
    if (opts.gate && hostile && GATED_FOLLOWUP.has(effect.type)) {
      if (!opts.gate.has(u)) {
        ctx.emit('miss', { source: caster, target: u, skill: skillId });
        continue;
      }
    } else if (DODGEABLE.has(effect.type) && hostile && !rollHit(caster, u, ctx)) {
      ctx.emit('miss', { source: caster, target: u, skill: skillId });
      continue;
    }
```
（其後的 `chance` 擲骰、`HOSTILE_STATUS` 抗性/格擋、`switch` 皆不動。）

在 `case 'damage': {` 區塊最上方記錄命中：
```js
      case 'damage': {
        if (opts.recordHits && hostile) opts.recordHits.add(u); // 命中集合：本段未被閃 → 記錄
```

- [ ] **Step 4: `skills.js` `castSkill` 改兩段式**

把 `castSkill` 的效果迴圈替換為：
```js
  const castCtx = overcharge > 1 ? { ...ctx, overcharge } : ctx;
  const scaled = def.effects.map((e) => scaleEffect(e, lv));
  const dmg = scaled.filter((e) => e.type === 'damage');
  const rest = scaled.filter((e) => e.type !== 'damage');
  const hitSet = new Set();
  for (const eff of dmg) {
    const units = resolveScope(eff.scope, caster, primary, ctx, eff);
    applyEffect(eff, caster, units, castCtx, skillId, { recordHits: hitSet });
  }
  for (const eff of rest) {
    const units = resolveScope(eff.scope, caster, primary, ctx, eff);
    applyEffect(eff, caster, units, castCtx, skillId, { gate: hitSet });
  }
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run src/battle/damageGate.test.js`
Expected: PASS

- [ ] **Step 6: 全套回歸（確保 opts 預設路徑不影響既有）**

Run: `npx vitest run`
Expected: PASS（hitDodge/environments/triggers/skills/overcharge 等全綠——非 castSkill 路徑不傳 opts，行為不變）

- [ ] **Step 7: Commit**

```bash
git add src/battle/effects.js src/battle/skills.js src/battle/damageGate.test.js
git commit -m "feat: 傷害門檻命中模型——castSkill 兩段式，傷害命中放行對敵後續效果"
```

---

### Task 3: 附加效果描述改「命中的目標」

**Files:**
- Modify: `src/battle/skillText.js`（`describeSkill` / `describeEffect`）
- Test: `src/battle/skillText.test.js`（追加）

**Interfaces:**
- Consumes: `SKILLS`、`SCOPE_LABEL`、`TARGET_LABEL`（現有）。
- Produces: `describeEffect(effect, targetLabel, enemySkill = false)`；對敵的可門檻後續效果其對象述為「命中的目標」。

- [ ] **Step 1: 追加失敗測試**

在 `src/battle/skillText.test.js` 的 describeSkill 區塊追加：
```js
  it('附加對敵效果描述為「命中的目標」，傷害段仍寫範圍', () => {
    const d = describeSkill('thunderMark');
    expect(d).toContain('敵方全體');        // 傷害段：範圍
    expect(d).toContain('命中的目標');      // 減益段：命中的目標
  });

  it('對我方/單體治療的可門檻效果不套用「命中的目標」', () => {
    expect(describeSkill('tideHymn')).not.toContain('命中的目標'); // 淨化我方，不改述
  });
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/battle/skillText.test.js -t 命中的目標`
Expected: FAIL（目前減益段寫「敵方全體…」，不含「命中的目標」）

- [ ] **Step 3: 加對敵可門檻判定並覆寫 who**

在 `skillText.js` 頂部常數區加：
```js
const GATED_DESC = new Set([
  'dot', 'control', 'buff', 'transmute', 'nightmare', 'mark',
  'dispel', 'extend', 'detonateDot', 'energySteal', 'stealBuff', 'transferDebuff',
]);
const ENEMY_SCOPES = new Set(['allEnemies', 'frontEnemies', 'backEnemies', 'targetAndAdjacent', 'adjacentExcludingTarget']);
const ENEMY_TARGETS = new Set([
  'singleEnemyByColumn', 'allEnemies', 'enemyColumn', 'enemyFrontRow', 'enemyBackRow',
  'randomEnemy', 'lowestHpEnemy', 'highestEnergyEnemy',
]);
```

`describeEffect` 簽名改為 `function describeEffect(effect, targetLabel, enemySkill = false) {`，在 `let who = ...` 與 `lowestHpAllies` 特例之後、`where` 之前插入：
```js
  // ④ 傷害門檻：對敵的可門檻後續效果，其對象改述「命中的目標」（實際落點依傷害命中）
  const enemyDirected = ENEMY_SCOPES.has(effect.scope) || (effect.scope === 'target' && enemySkill);
  if (GATED_DESC.has(effect.type) && enemyDirected) who = '命中的目標';
```

`describeSkill` 改為傳入 `enemySkill`：
```js
export function describeSkill(skillId) {
  const def = SKILLS[skillId];
  if (!def) return '';
  const targetLabel = def.target ? TARGET_LABEL[def.target] : null;
  const enemySkill = def.target ? ENEMY_TARGETS.has(def.target) : false;
  return def.effects
    .map((e) => describeEffect(e, targetLabel, enemySkill))
    .filter(Boolean)
    .join('；');
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/battle/skillText.test.js`
Expected: PASS（新斷言通過；既有 emberWarmth/moltenBulwark/detonate/flameShift/where 斷言仍成立，因其檢查的是狀態文字而非對象詞）

- [ ] **Step 5: 全套回歸**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/battle/skillText.js src/battle/skillText.test.js
git commit -m "feat: 附加對敵效果描述改「命中的目標」（傷害門檻模型）"
```

---

## 自我檢查

- **Spec coverage**：①引擎兩段式→Task 2；②8 支補傷害→Task 1；③測試→各 Task 內含；④描述→Task 3。獵殺令十字（已於 session 實裝）在門檻下靠 `mark`∈GATED 自然放行，Task 2 的 GATED 已含 `mark`。
- **無 placeholder**：每步含實際程式碼與指令。
- **型別一致**：`applyEffect(…, opts)`、`GATED_FOLLOWUP`、`recordHits`/`gate`、`describeEffect(…, enemySkill)` 名稱跨任務一致。
