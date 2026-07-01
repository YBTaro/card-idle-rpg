# Spec 3b — 控場效果(嘲諷 / 暈眩 / 沉默)

日期：2026-07-01
分支：`claude/spec3b-control`
狀態：自主執行(使用者已授權)
前置：Spec 2 引擎、Spec 3a 屬性/where(皆在 main)

## 目標

新增三種控場狀態,作為新的 `control` 效果類型 + 引擎掛勾:

- **嘲諷 (taunt)**:敵方的**單體攻擊**被迫指向嘲諷者。
- **暈眩 (stun)**:該單位輪到時**跳過行動**(不攻擊、不放技能)。
- **沉默 (silence)**:該單位**不能施放技能**(仍可普攻);能量照集,解除後才放。

## 1. 控場表示與 `hasControl`

控場是一種 buff:`{ kind:'control', control:'taunt'|'stun'|'silence', duration, key, stackable }`。

`src/battle/buffs.js` 新增:
```js
export function hasControl(unit, name) {
  return !!unit.buffs && unit.buffs.some((b) => b.kind === 'control' && b.control === name);
}
```
(`duration` 一樣走 `tickBuffs`,見 §4 的回合規則。)

## 2. `control` 效果類型（effects.js）

`applyEffect` 新增 `case 'control'`:
```js
case 'control':
  applyBuff(u, { kind: 'control', control: effect.control, duration: effect.duration, key: effect.key, stackable: effect.stackable });
  break;
```
資料範例:
```js
{ type:'control', control:'stun',    duration:1, scope:'target' }
{ type:'control', control:'silence', duration:2, scope:'target', where:{ class:'support' } }
{ type:'control', control:'taunt',   duration:2, scope:'self' }
```
(沿用 3a 的 `where` 過濾。)

## 3. 嘲諷:單體選敵覆蓋（targeting.js）

`singleEnemyByColumn(attacker, enemies)` 在既有直行/前排邏輯**之前**,先看敵方是否有存活嘲諷者:
```js
export function singleEnemyByColumn(attacker, enemies) {
  const taunters = enemies.filter((u) => u.alive && hasControl(u, 'taunt'));
  const pool = taunters.length ? taunters : enemies;
  // ……以下對 `pool`(而非 enemies)跑原本的前排/直行/往小號邏輯……
}
```
- 只影響**單體**選擇(普攻、burst、`SELECTORS.singleEnemyByColumn`)。
- **多目標**選擇器(enemyFrontRow/BackRow/Column/allEnemies)不受影響(本來就打全部,含嘲諷者)。
- 多個嘲諷者 → 在嘲諷者池中照原本前排/直行/往小號規則挑。
- `targeting.js` 從 `buffs.js` import `hasControl`(無循環)。

## 4. 暈眩 / 沉默:引擎掛勾（engine.js）

**回合規則微調(延伸 Spec 2「技能不算回合」)**:單位在**普攻回合**輪到時,無論是攻擊或被暈跳過,都算一次行動 → 結算 DoT、遞減 buff duration(這樣暈眩/沉默/DoT 才會隨回合消退)。**技能施放**仍是免費行動、不計。

- `_anyoneCharged()` 與技能階段的「可施放」判定,**排除 silence 與 stun** 的單位:
  ```js
  const canCast = (u) => u.alive && u.energy >= ENERGY_MAX && !hasControl(u, 'silence') && !hasControl(u, 'stun');
  ```
  - `_anyoneCharged` = `this.units.some(canCast)`。
  - `_stepSkill` 掃描時只對 `canCast(u)` 者施放。
  - 效果:被沉默/暈眩者即使滿氣也不會觸發技能階段;能量保留,解除後才放。

- `_act(u, isSkill)` 普攻分支改為:
  ```js
  for (const dot of dotEntries(u)) dealDot(u, dot, ctx);
  if (!u.alive) return;
  this.emit('turn', { unit: u });
  if (hasControl(u, 'stun')) {
    this.emit('stunned', { unit: u }); // 被暈：跳過攻擊
  } else {
    normalAttack(u, ctx);
  }
  if (tickBuffs(u)) this.emit('buffchange', { unit: u });
  ```
  - 技能分支不變(免費行動,不 tick;且能進到技能分支者已排除 stun/silence)。
- 沉默不影響普攻;silence buff 於其普攻回合經 `tickBuffs` 遞減、到期解除。
- 暈眩者跳過攻擊但仍 `tickBuffs`,stun 隨其回合消退;DoT 照樣在暈眩回合結算。

## 5. 檔案

修改:`src/battle/buffs.js`(hasControl)、`src/battle/effects.js`(control 效果)、`src/battle/targeting.js`(嘲諷)、`src/battle/engine.js`(暈眩/沉默)
測試:`buffs.test.js`、`effects.test.js`、`targeting.test.js`、`engine.test.js`

## 6. 測試 / 驗收

- `hasControl` 判定正確。
- `control` 效果套用對應 control buff(吃 where)。
- **嘲諷**:敵方單體攻擊指向嘲諷者;無嘲諷時行為不變;多目標選擇器不受影響。
- **暈眩**:輪到時跳過攻擊、發 `stunned`;stun 隨回合消退;暈眩期間即使滿氣也不放技能。
- **沉默**:滿氣但不放技能(能量保留),仍普攻;解除後恢復可放;`_anyoneCharged` 正確排除。
- 無控場時全部行為不變;全套件綠。

## 非本 Spec(後續)

3c 被動/光環、3d 每卡專屬技、3e 戰鬥 log/replay。
