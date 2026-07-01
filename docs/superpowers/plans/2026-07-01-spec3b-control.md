# Spec 3b — 控場效果 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 新增 taunt/stun/silence 三種控場,作為 `control` 效果 + 引擎掛勾。

**Architecture:** 先加 `hasControl` + `control` 效果(附加),再加嘲諷單體選敵覆蓋,最後加暈眩/沉默引擎掛勾。每任務結束全套件綠。

**Tech Stack:** JavaScript (ESM)、Vitest。

## Global Constraints
- 引擎層不得 import pixi/gsap/DOM。Vitest。
- 控場 = `{ kind:'control', control:'taunt'|'stun'|'silence', duration, key, stackable }`。
- 嘲諷只影響**單體**選敵;多目標選擇器不受影響。
- 暈眩=跳過普攻(仍結算 DoT、仍 tick);沉默=不能放技能(仍普攻、能量保留);兩者滿氣時**不觸發技能階段**。
- 回合規則:普攻回合(攻擊或被暈跳過)都算一次行動並 tick;技能施放免費不計。
- Spec:`docs/superpowers/specs/2026-07-01-spec3b-control-design.md`。
- 每任務 commit,繁中訊息。

---

## Task 1: hasControl + control 效果

**Files:**
- Modify: `src/battle/buffs.js`、`src/battle/buffs.test.js`
- Modify: `src/battle/effects.js`、`src/battle/effects.test.js`

**Interfaces:**
- Produces: `hasControl(unit, name): boolean`（buffs.js）;`applyEffect` 支援 `type:'control'`（套 control buff,吃 where）。

- [ ] **Step 1: 寫失敗測試**

buffs.test.js 追加:
```js
import { hasControl } from './buffs.js';
describe('control buff', () => {
  it('hasControl 判定', () => {
    const u = { buffs: [] };
    applyBuff(u, { kind: 'control', control: 'stun', duration: 1 });
    expect(hasControl(u, 'stun')).toBe(true);
    expect(hasControl(u, 'silence')).toBe(false);
    expect(hasControl({}, 'stun')).toBe(false);
  });
});
```
effects.test.js 追加（`hasControl` 從 buffs 匯入）:
```js
import { hasControl } from './buffs.js';
describe('control 效果', () => {
  it('套用對應 control buff（吃 where）', () => {
    const caster = makeUnit({ team: 0, pos: 1 });
    const foe = makeUnit({ team: 1, pos: 1, class: 'support' });
    const other = makeUnit({ team: 1, pos: 2, class: 'dps' });
    const ctx = ctxFor(caster, [caster], [foe, other]);
    applyEffect({ type: 'control', control: 'silence', duration: 2, scope: 'allEnemies', where: { class: 'support' } }, caster, [foe, other], ctx);
    expect(hasControl(foe, 'silence')).toBe(true);
    expect(hasControl(other, 'silence')).toBe(false);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/battle/buffs.test.js src/battle/effects.test.js`
Expected: FAIL（`hasControl` 未定義 / `control` case 未處理）

- [ ] **Step 3: 實作**

`src/battle/buffs.js` 追加:
```js
export function hasControl(unit, name) {
  return !!unit.buffs && unit.buffs.some((b) => b.kind === 'control' && b.control === name);
}
```

`src/battle/effects.js` 在 `applyEffect` 的 switch 內新增（`energy` case 之後）:
```js
      case 'control':
        applyBuff(u, {
          kind: 'control', control: effect.control,
          duration: effect.duration, key: effect.key, stackable: effect.stackable,
        });
        break;
```

- [ ] **Step 4: 跑全套件確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/battle/buffs.js src/battle/buffs.test.js src/battle/effects.js src/battle/effects.test.js
git commit -m "feat: 控場基礎——hasControl 與 control 效果類型"
```

---

## Task 2: 嘲諷（單體選敵覆蓋）

**Files:**
- Modify: `src/battle/targeting.js`、`src/battle/targeting.test.js`

**Interfaces:**
- Consumes: `hasControl`（buffs）。
- Produces: `singleEnemyByColumn` 在有存活嘲諷者時,把選敵範圍限制為嘲諷者(再跑原本前排/直行邏輯)。

- [ ] **Step 1: 寫失敗測試**（targeting.test.js 追加）

```js
import { applyBuff } from './buffs.js';
describe('嘲諷（單體選敵）', () => {
  it('有嘲諷者時單體攻擊指向嘲諷者', () => {
    const attacker = makeUnit({ team: 0, pos: 1 }); // 直行A → 平常打 pos1
    const e1 = makeUnit({ team: 1, pos: 1, name: 'e1' });
    const e2 = makeUnit({ team: 1, pos: 2, name: 'e2' });
    applyBuff(e2, { kind: 'control', control: 'taunt', duration: 2 });
    expect(singleEnemyByColumn(attacker, [e1, e2]).name).toBe('e2');
  });

  it('無嘲諷時照原本規則（直行A → pos1）', () => {
    const attacker = makeUnit({ team: 0, pos: 1 });
    const e1 = makeUnit({ team: 1, pos: 1, name: 'e1' });
    const e2 = makeUnit({ team: 1, pos: 2, name: 'e2' });
    expect(singleEnemyByColumn(attacker, [e1, e2]).name).toBe('e1');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/battle/targeting.test.js`
Expected: FAIL（嘲諷未實作,`e2` 案例回傳 e1）

- [ ] **Step 3: 實作**（targeting.js）

頂部 import 追加:
```js
import { hasControl } from './buffs.js';
```
`singleEnemyByColumn` 最前面加入嘲諷限制（其餘邏輯不變,但改對 `pool` 跑）:
```js
export function singleEnemyByColumn(attacker, enemies) {
  const taunters = enemies.filter((u) => u.alive && hasControl(u, 'taunt'));
  const pool = taunters.length ? taunters : enemies;
  const col = columnOf(attacker.pos);
  for (const row of ['front', 'back']) {
    const inRow = pool.filter((u) => u.alive && rowOf(u.pos) === row);
    if (inRow.length === 0) continue;
    const offset = row === 'front' ? 0 : 3;
    for (const c of COLUMN_PREF[col]) {
      const hit = inRow.find((u) => u.pos === c + offset);
      if (hit) return hit;
    }
    return inRow[0];
  }
  return null;
}
```
（把原本 `aliveInRowT(enemies, row)` 改為對 `pool` 過濾;`aliveInRowT` 若不再被其他函式使用可保留或移除——保留無妨。）

- [ ] **Step 4: 跑全套件確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/battle/targeting.js src/battle/targeting.test.js
git commit -m "feat: 嘲諷——單體選敵被迫指向嘲諷者"
```

---

## Task 3: 暈眩 / 沉默（引擎掛勾）

**Files:**
- Modify: `src/battle/engine.js`、`src/battle/engine.test.js`

**Interfaces:**
- Consumes: `hasControl`（buffs）。
- Produces: `_canCast(u)`（排除 stun/silence）;`_anyoneCharged`/`_stepSkill` 用之;`_act` 普攻分支對 stun 者跳過攻擊、發 `stunned`。

- [ ] **Step 1: 寫失敗測試**（engine.test.js 追加;`applyBuff` 已匯入）

```js
  it('暈眩：輪到時跳過攻擊、發 stunned', () => {
    const me = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 1000, def: 0 });
    applyBuff(me, { kind: 'control', control: 'stun', duration: 1 });
    const engine = new BattleEngine([me], [foe], { rng: new Rng(1) });
    let stunned = false;
    engine.on('stunned', () => (stunned = true));
    engine.step(); // me 輪到 → 被暈跳過
    expect(stunned).toBe(true);
    expect(foe.hp).toBe(1000); // 未被攻擊
  });

  it('沉默：滿氣不放技能、仍普攻、能量保留', () => {
    const me = makeUnit({ team: 0, pos: 1, class: 'dps', atk: 100, energy: ENERGY_MAX });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    applyBuff(me, { kind: 'control', control: 'silence', duration: 5 });
    const engine = new BattleEngine([me], [foe], { rng: new Rng(1) });
    let ult = false;
    engine.on('ultimate', () => (ult = true));
    engine.step(); // me 普攻（滿氣但被沉默）→ 不觸發技能階段
    expect(ult).toBe(false);
    expect(me.energy).toBe(ENERGY_MAX); // 能量保留
  });
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/battle/engine.test.js`
Expected: FAIL（`stunned` 未發 / 沉默者仍放技能）

- [ ] **Step 3: 實作**（engine.js）

頂部 import 追加:
```js
import { tickBuffs, dotEntries, hasControl } from './buffs.js';
```
（把原本 `import { tickBuffs, dotEntries } from './buffs.js';` 改成上面這行。）

新增可施放判定,並改 `_anyoneCharged`:
```js
  _canCast(u) {
    return u.alive && u.energy >= ENERGY_MAX && !hasControl(u, 'silence') && !hasControl(u, 'stun');
  }

  _anyoneCharged() {
    return this.units.some((u) => this._canCast(u));
  }
```
`_stepSkill` 內的施放條件改用 `_canCast`:
```js
      const u = this._unitAt(team, pos);
      if (u && this._canCast(u)) {
```
`_act` 普攻分支的攻擊改為（stun 跳過）:
```js
    for (const dot of dotEntries(u)) dealDot(u, dot, ctx);
    if (!u.alive) return;
    this.emit('turn', { unit: u });
    if (hasControl(u, 'stun')) {
      this.emit('stunned', { unit: u });
    } else {
      normalAttack(u, ctx);
    }
    if (tickBuffs(u)) this.emit('buffchange', { unit: u });
```
（技能分支不變。)

- [ ] **Step 4: 跑全套件確認通過**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: 確認建置**

Run: `npm run build`
Expected: 成功

- [ ] **Step 6: Commit**

```bash
git add src/battle/engine.js src/battle/engine.test.js
git commit -m "feat: 暈眩(跳過出手)與沉默(禁技能)引擎掛勾"
```

---

## Self-Review
- Spec 覆蓋:hasControl/control 效果(T1)、嘲諷(T2)、暈眩/沉默(T3)。
- 型別一致:`hasControl(unit,name)`、`control` 效果、`_canCast(u)`、`stunned` 事件。
- 綠燈:T1 附加;T2 無嘲諷時不變;T3 無控場時 `_canCast` 等價於原本滿氣判定、`_act` 無 stun 時不變。
