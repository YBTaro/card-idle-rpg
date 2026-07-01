# Spec 1 — 回合制戰鬥核心（Turn-Based Battle Core）

日期：2026-07-01
分支：`claude/card-game-auto-battle-78qyha`
狀態：待審

## 背景與目標

現行戰鬥是「連續時間 + ATB 速度條」自動戰鬥：`engine.update(dt)` 每幀依 `spd` 累積
ATB，滿了就出手；出手時能量滿就放大招、否則普攻。

本次要改成參考《三國志幻想大陸》的**回合制、固定位置**玩法：

- 移除 `spd`，出手順序改由**固定位置序列**決定。
- 6 個固定位置（前排 3、後排 3），可留空。
- 戰鬥分兩階段：**普攻輪** 與 **技能階段**，滿氣會即時中斷普攻進入技能階段。
- 新的**鎖定規則**（直行 / 前排優先 / 往小號）。
- **分職業集氣**、新增**暴擊**。
- 引擎由「連續時間」改為「離散逐步 `step()`」，由 controller 控制播放節奏。

本 Spec 只做「核心戰鬥可跑起來」。可擴充技能/Buff 系統、每卡專屬技、豐富目標選擇器、
嘲諷/控場/DoT/集氣速度 buff 等，留給 **Spec 2**（本文件末有預覽，僅為前向相容參考）。

---

## 1. 位置模型

6 個固定位置，編號 1–6：

```
        直行A   直行B   直行C
前排:    1      2      3
後排:    4      5      6
```

- `row(pos)`：`pos <= 3 ? 'front' : 'back'`
- `column(pos)`：`((pos - 1) % 3) + 1`　→　1/4→A、2/5→B、3/6→C
- 位置可留空；至少 1 人才能開戰。

### 陣容資料與存檔遷移

- `state.formation`：改為 `Array<{ instanceId, pos }>`，`pos ∈ 1..6` 且不重複。
- `MAX_FORMATION = 6`（原 5）。
- **遷移**（`save.js` 載入時）：舊檔 entry 為 `{ instanceId, row }` 無 `pos` →
  依序把 `row === 'front'` 者填入 {1,2,3} 空位、`row === 'back'` 者填入 {4,5,6} 空位；
  超過 6 個的多餘 entry 丟棄。已是新格式（含 `pos`）則不動。
- `state.js` 預設 `formation` 空陣列不變。

### 影響檔案

- `src/systems/formation.js`：`MAX_FORMATION = 6`；改為以 `pos` 管理（`addToFormation(instanceId, pos)`、
  防重複 pos；`row` 由 `pos` 推導，移除 `toggleRow`，改為 `setPosition(instanceId, pos)`）。
- `src/core/save.js`：新增遷移邏輯。
- `src/ui/rosterUI.js`：陣容 UI 改為 6 格選位（前 3 / 後 3），移除前後排切換鈕改為選位置。

---

## 2. 移除 spd（完全移除）

- `src/battle/unit.js`：移除 `this.spd`、`this.atb`、`ATB_MAX`（保留 `energy`、`ENERGY_MAX`）。
- `src/data/classes.js`：`statMods` 移除 `spd`。
- `src/data/cards.js`：`base` / `growth` 移除 `spd` 欄位。
- `src/core/stats.js`：`rawStatsAtLevel` / `deriveStats` 的 key 迴圈移除 `'spd'`，輸出不再含 `spd`。
- `src/ui/rosterUI.js`、`src/ui/hud.js`：養成/數值面板不再顯示 `spd`。
- `src/render/battleScene.js`：移除藍色 ATB 條。
- 測試（`engine.test.js`、`testHelpers.js` 等）中設定 `spd` 的地方一併移除。

---

## 3. 出手順序（固定位置序列）

固定序列 `S`（12 格，team 0 = 我方、team 1 = 敵方）：

```
我1, 敵1, 我2, 敵2, 我3, 敵3, 我4, 敵4, 我5, 敵5, 我6, 敵6
```

- 走訪時**跳過空格與陣亡**單位。
- 走完 12 格為「一輪（round）」，接續下一輪。

---

## 4. 戰鬥主迴圈（雙階段狀態機）

引擎維護：`phase ∈ {'normal','skill'}`、普攻游標 `cursor`、技能游標、`resumeIndex`。

### 普攻輪（normal phase）

1. 從 `cursor` 沿 `S` 找到下一個「有人且存活」的位置 → 該單位執行**普攻**（集氣見 §6，傷害見 §7）。
2. 執行後檢查勝負。
3. **動作後檢查**：若任一方存活單位 `energy >= ENERGY_MAX` →
   - 記 `resumeIndex = cursor`（下一個要動的位置），
   - `phase = 'skill'`，技能游標歸 0，進入技能階段。
4. 若沒有人滿氣 → `cursor` 前進，繼續普攻（走到底自動回到序列開頭，即下一輪）。

### 技能階段（skill phase）

1. 沿 `S` 找下一個「存活且 `energy >= ENERGY_MAX`」的單位 → 施放其**技能**（Spec 1 用職業大招，見 §5），
   施放後能量歸零，結算勝負。
2. 一次施放算一步（維持一步一動作的節奏）。
3. 施放可能因傷害讓對方被打到滿氣（坦克受擊回能）→ 這些人會在後續的「掃描回合」被納入。
4. 掃完整條序列且「這一趟有施放過」→ 再掃一趟（游標歸 0）。
5. 掃完整條序列且「這一趟零施放」→ 技能階段結束：`phase = 'normal'`、`cursor = resumeIndex`，
   **從中斷處接續**普攻。
6. **安全上限**：技能階段最多掃 `MAX_SKILL_PASSES = 50` 趟，超過強制回普攻，避免病態無限迴圈。

### 勝負與平手保護

- 每個動作後 `checkEnd`：任一隊全滅 → 另一隊勝；同時全滅 → 平手（-1）。發 `battleEnd`。
- **回合上限**：達 `MAX_ROUNDS = 100` 仍未分勝負 → 依雙方存活單位總血量比例判定，較高者勝、相等平手。
  （避免純補師互耗打不完。）

---

## 5. 技能（Spec 1 範圍）

Spec 1 沿用現有三個職業大招作為「技能階段施放的技能」，僅調整鎖定：

- `burst`（輸出）：對「用普攻鎖定規則選出的單一目標」造成 `ULT.burstMult` 倍傷害（吃暴擊）。
- `guard`（坦克）：全體我方 `guard` 減傷 buff + 自療。Spec 1 保留此 buff，
  duration 改以「回合」計；`_tickBuffs` 改為每輪結束呼叫一次遞減（暫行；Spec 2 以通用 Buff 系統取代）。
- `heal`（輔助）：治療最低血隊友 + 其餘小量回復。

> 「每張卡專屬技」是 Spec 2 的工作；Spec 1 以職業大招占位，確保三職在技能階段都有作用。

---

## 6. 集氣（分職業）

在 `src/data/classes.js` 以可調參數定義（占位平衡值）：

| 職業 | 普攻自身回能 `energyOnAction` | 被擊中回能 `energyOnHitTaken` | 隊友普攻回能 `energyOnAllyAction` |
|---|---|---|---|
| 坦克 tank | 15 | **20** | 0 |
| 輸出 dps | **25**（含 +10 額外） | 8 | 0 |
| 輔助 support | 15 | 8 | **12** |

- 普攻結束時：施放者 `gainEnergy(energyOnAction)`；被擊中的目標 `gainEnergy(energyOnHitTaken)`
  （在 `applyDamage` 內，已存在）；**其餘每個存活隊友**（不含施放者）`gainEnergy(energyOnAllyAction)`。
- `ENERGY_MAX = 100`；技能施放後歸零。
- Spec 1 為固定數值；Spec 2 會讓 `gainEnergy` 乘上 `energyGainMult`（集氣速度 buff）。

---

## 7. 傷害公式 + 暴擊

`src/battle/damage.js`：

```
最終傷害 = max(1, round( afterDef × elemMult × guardMult × variance × critMult × DAMAGE_GLOBAL ))
```

- `base = atk × mult`
- `afterDef = max(base × 0.15, base − def × 0.75)`
- `elemMult`：剋 1.5 / 被剋 0.75 / 無 1.0
- `guardMult`：坦克 guard buff = 0.5，平時 1.0
- `variance`：`1 ± DAMAGE_VARIANCE(0.1)`
- `DAMAGE_GLOBAL = 1.6`
- **新增暴擊**：
  ```js
  export const CRIT_CHANCE = 0.1; // 10%
  export const CRIT_MULT = 1.5;   // 1.5x
  ```
  以傳入的 `rng` 擲骰；`critMult = 命中 ? CRIT_MULT : 1`。
- `computeDamage` 回傳新增 `isCrit`；暴擊對普攻與大招都生效。

---

## 8. 引擎 API 與 controller 節奏

### 引擎（`src/battle/engine.js`）

- 移除 `update(dt)` 的連續時間模型與 ATB 累積。
- 新增 `step()`：推進**一個動作**（一次普攻 / 一次技能施放 / 一次階段轉換 no-op），
  透過事件對外溝通，回傳一個動作紀錄（或 `null`/no-op 標記）。戰鬥結束回傳後不再前進。
- 保留事件：`turn`（高亮用）、`attack`、`ultimate`、`damage`、`heal`、`death`、`battleEnd`、`buffchange`。
- 保留 `on/emit/enemiesOf/alliesOf/teamAlive/teams/over/winner`。

### Controller（`src/render/battleController.js`）

- `_tick` 改用累加器控制步進節奏：
  ```
  _stepAccum += dt * this.speed
  while (_stepAccum >= STEP_INTERVAL && !engine.over) { _stepAccum -= STEP_INTERVAL; engine.step() }
  ```
  `STEP_INTERVAL ≈ 0.35s`（可調）；`speed` 倍率照舊。
- 狀態列 `elapsed` 秒數改為顯示「回合數 / 步數」或存活數即可（次要）。

---

## 9. 鎖定規則（`src/battle/targeting.js`，寫成具名選擇器）

把選敵改寫成**具名選擇器 registry**，Spec 1 只實作普攻預設，Spec 2 往上加。

### `singleEnemyByColumn(attacker, enemies)` — 普攻預設

1. 決定攻擊者直行 `c = column(attacker.pos)`。
2. 若敵方前排（pos 1/2/3）有存活 → 在**前排**依偏好序取第一個存活：
   - 直行A：`1 → 2 → 3`
   - 直行B：`2 → 1 → 3`
   - 直行C：`3 → 2 → 1`
3. 前排全空/全滅 → 改打**後排**，同邏輯：
   - 直行A：`4 → 5 → 6`
   - 直行B：`5 → 4 → 6`
   - 直行C：`6 → 5 → 4`
4. 回傳單一 `Unit` 或 `null`。

**驗證案例**（寫進測試）：

- 前排 1 有人、2 空 → 直行B 打 **1**。
- 前排 1、2 空、3 有人 → 打 **3**。
- 前排 3 空 → 直行C 打 **2**。
- 前排全空、後排有人 → 直行A 打 **4**（不足再往 5、6）。

### 保留

`aliveEnemies`、`lowestHpAlly`。Spec 2 會新增 `enemyFrontRow / enemyBackRow / enemyColumn /
allEnemies / self / allAllies / oneAlly …` 等選擇器，並在其前插入**嘲諷覆蓋層**。

---

## 10. 渲染（`src/render/battleScene.js`）

- 移除藍色 ATB 條；保留 HP（綠）+ 能量（黃）兩條。
- 依 `pos` 定位：前排欄放 1/2/3（縱向索引 `pos-1`）、後排欄放 4/5/6（縱向索引 `pos-4`）。
- （選配）`turn` 事件時高亮當前出手者（描邊/微縮放）。

---

## 11. 測試

- `src/battle/targeting.test.js`：涵蓋 §9 所有驗證案例與前後排切換。
- `src/battle/engine.test.js`：改寫為 `step()` 位置制 + 雙階段：
  - 普攻輪照序列出手、跳過空/死；
  - 有人滿氣立即中斷、技能階段依序放、從中斷處接續；
  - 暴擊以固定 seed 可重播；
  - 回合上限判定、平手。
- `src/systems/daily.test.js`、`src/systems/gameflow.test.js`：改用 `pos` 陣容模型、移除 `spd`。
- `src/battle/testHelpers.js`：建構 Unit 的輔助改為帶 `pos`、移除 `spd`。

---

## 12. 影響檔案總覽

邏輯：`unit.js`、`engine.js`、`targeting.js`、`skills.js`、`damage.js`、
`data/classes.js`、`data/cards.js`、`core/stats.js`、`systems/formation.js`、
`systems/battleSetup.js`、`core/save.js`、`core/state.js`
渲染/UI：`render/battleScene.js`、`render/battleController.js`、`ui/rosterUI.js`、`ui/hud.js`
測試：`targeting.test.js`、`engine.test.js`、`daily.test.js`、`gameflow.test.js`、`testHelpers.js`

---

## Spec 2 預覽（僅供前向相容，非本 Spec 範圍）

- **通用 Buff 容器**：`{ stat, op:'mul'|'add', value, duration(行動次數), kind }`；
  duration 以「帶 buff 者每次輪到出手」遞減。
- **有效值 resolver**：`effAtk / effDef / critChance / critMult / dmgTakenMult / energyGainMult`，
  damage.js 與集氣改讀有效值 → 任何 buff 自動生效。
- **效果原語 handler**：`damage / heal / buff / debuff / dot / shield / energy / taunt / control`。
- **技能即資料**：`{ name, target, effects:[...] }`；每張卡 `cardId → skillId`。
- **豐富目標選擇器**：`singleEnemyByColumn / enemyFrontRow / enemyBackRow / enemyColumn /
  allEnemies / self / allAllies / lowestHpAlly / oneAlly …`（例：對全體後排 100% 傷害）。
- **嘲諷/控場**：選擇器前的嘲諷覆蓋層；控場狀態（暈眩/沉默）。
- **集氣速度 buff**：即「速度」語意，套用於 `energyGainMult`。
