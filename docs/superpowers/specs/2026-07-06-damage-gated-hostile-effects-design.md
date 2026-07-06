# Spec — 傷害門檻命中模型（Damage-Gated Hostile Effects）

日期：2026-07-06
分支：`main`（實作時另開分支）
狀態：待審
前置：Spec 2（技能 / Buff 引擎，已實裝）

## 背景與目標

目前命中判定是**逐效果各自獨立**：`applyEffect`（`src/battle/effects.js:216-221`）對每一個
列在 `DODGEABLE`（`damage / dot / control / buff / transmute / nightmare`）的效果、對每個敵方
目標各自跑一次 `rollHit`。同一個技能的「傷害」與「附加減益」是兩次獨立擲骰，會出現
「傷害中了但減益閃掉」「傷害閃了但減益中了」這種一中一閃的結果。

本 Spec 改為 **傷害門檻命中模型**：一個對敵技能的**傷害是否命中，決定其後續所有敵對效果
是否落實**。命中即全套生效、閃掉即全套落空，不再各段獨立。

### 設計意圖（使用者定案）

- 對某敵人「有打到」→ 後續 debuff / 操作類效果才落在他身上。
- 對某敵人「閃掉傷害」→ 該敵人的後續效果全部無視。
- 增益（對我方 / 自身）永遠 100% 命中，不經此門檻。
- 開天氣 / 場地這種「不指向特定敵人」的全場效果照常生效。
- 附加減益的**描述**改成「對命中的目標…」，不再用固定範圍（前後排 / 最低血）表述。

---

## 1. 引擎：傷害門檻（兩段式結算）

### 名詞

- **可門檻效果（gated）**：對敵時受傷害門檻管制的效果型別：
  `dot / control / buff / transmute / nightmare / mark / dispel / extend / detonateDot /
  energySteal / stealBuff / transferDebuff`。
  = 敵對狀態（`HOSTILE_STATUS`：dot/control/buff/transmute/nightmare/mark）
  ∪ 操作類（dispel/extend/detonateDot/energySteal/stealBuff/transferDebuff）。
  （規劃期補：`mark`——獵殺令十字印記靠它受門檻放行；`stealBuff/transferDebuff`——奪華/嫁禍用。）
- **命中集合（hitSet）**：本次施放中，至少被一段 `damage` 打中（未被閃避）的敵方單位。

### `castSkill`（`src/battle/skills.js`）改兩段式

```
1. 將 def.effects 依序分成 dmgEffects（type==='damage'）與 restEffects，各自維持原相對順序。
2. hitSet = new Set()
3. 傷害段：逐一 applyEffect(dmgEffect, ..., { recordHits: hitSet })
     —— 傷害段照舊各自擲 rollHit；某敵未被閃 → 加入 hitSet。
4. 其餘段：逐一 applyEffect(restEffect, ..., { gate: hitSet })
```

採兩段式（而非單趟遞增）是因為資料順序不保證「傷害在前」——例如「爆燃」把
`detonateDot` 列在 `damage` 之前。兩段式讓門檻不依賴資料內順序。

### `applyEffect`（`src/battle/effects.js`）調整

新增選用參數 `opts = { recordHits?: Set, gate?: Set }`（不傳 → 維持現行行為，供
onEnter / 環境 / 觸發等非 castSkill 路徑沿用，不受影響）。

- **傷害段（recordHits）**：現行 `DODGEABLE` 命中判定不變；當敵方目標通過 `rollHit`
  （未閃）時，`recordHits.add(u)`。
- **其餘段（gate）**：對「可門檻效果 + 敵方目標」——
  - **移除**該效果自己的 `rollHit`（閃避）判定；
  - 改為：`gate.has(u)` 才生效，否則 `continue` 並 `emit('miss', …)`。
  - 命中後**仍照舊**跑 `chance`（如 70% 燃燒）、效果抗性（effectRes/effectHit）、格擋護符
    （debuffBlock）。門檻只取代「閃避」這一層。
- **我方 / 自身效果**（`u.team === caster.team`）：完全不經門檻，永遠生效（增益 100%）。
- **全場效果**（`weather` / `terrain`）：不進逐目標迴圈，照舊提早 return。

### 語義變化摘要

| 情境 | 舊 | 新 |
|---|---|---|
| 傷害中、減益各自擲 | 可能一中一閃 | 傷害中 → 減益必落實（仍吃 chance/抗性/格擋） |
| 傷害閃 | 減益仍可能中 | 減益必落空 |
| 多段傷害（如燼滅 3 段） | 減益獨立擲 | 任一段傷害中即算命中 → 減益落實 |
| 純增益 / 自身控 | 已 100% | 不變，100% |
| 開天氣 / 場地 | 全場 | 不變，全場 |

---

## 2. 補傷害段（7 支純減益對敵技）

全表共 8 支「無傷害段卻對敵上狀態 / 操作」。各補一段 `damage`，**範圍對齊其
debuff 範圍**（才能逐目標當門檻）。自身 / 我方那幾段不動。

| 技能 | 既有對敵效果 | 範圍 | 補上傷害 |
|---|---|---|---|
| 熔壁 moltenBulwark | 受持續傷害 +30% | 敵前排 | **120%** |
| 墓約 gravePact | 攻擊 -30% | 敵全體 | 80% |
| 雷紋 thunderMark | 受傷 +20% | 敵全體 | 80% |
| 喪鐘 deathKnell | 受治療 -50% | 敵全體 | 80% |
| 骨牆 boneRampart | 延長敵方負面 | 敵全體 | 80% |
| 暮幕 duskVeil | 驅散敵方增益 | 敵全體 | 80% |
| 餘溫 emberWarmth | 延長敵方灼燒 | 敵全體 | 80% |
| 嫁禍 blameShift | 嫁禍我方負面 + 中毒 | 單體(隨機敵) | **150%**（單體較高） |

- 傷害大小不影響閃避機率（門檻機率由 rollHit 決定），只決定打多少。
- 使用者定調：全體技地板 80%；範圍越窄可越高——熔壁（敵前排）120%、嫁禍（單體）150%。
- 補的傷害 scope 對齊 debuff scope：blameShift 兩段效果皆 `target`，故補 `damage scope:'target'`。
- **治理規則**（`skillGovernance.test.js`）不違反：加的是傷害段（非狀態類），效果數仍 ≤ 4、
  狀態類 ≤ 2；這幾支無 weather/terrain，不觸環境技專職規則。
- 定位影響：這 7 支原為 0 傷害的輔助 / 坦克，加傷後略偏攻，屬預期。

---

## 3. 描述：附加效果改「對命中的目標」

`src/battle/skillText.js`：

- **傷害段**照舊用範圍描述（它決定打到誰）：如「對敵方後排造成 190% 攻擊力的傷害」。
- **可門檻的對敵後續段**：不再印固定範圍，改用「對命中的目標…」。
- **對我方 / 自身效果**不變（「為自身…」「為我方前排…」）。

判定「該用命中的目標措辭」的條件：效果型別 ∈ 可門檻集合，且其 scope 指向敵方。

範例（獵翎 huntFeather）：

> 舊：對敵方後排造成 190% 攻擊力的傷害；**敵方後排**集氣速度 -30%，持續 2 次行動
> 新：對敵方後排造成 190% 攻擊力的傷害；**對命中的目標**集氣速度 -30%，持續 2 次行動

---

## 4. 測試

- **更新**現行「逐段獨立閃避」語義的測試（`effects.test.js` 及相關），改驗新的門檻語義。
- **新增**兩段式門檻測試：
  - 傷害閃避 → 後續 debuff 不落實（強制 dodge=1 或以固定 rng 驗證）。
  - 傷害命中 → 後續 debuff 落實，且仍受 chance / 效果抗性 / 格擋管制。
  - 多段傷害任一段命中即算命中。
  - 純增益 / 自身效果不受門檻影響。
  - 開天氣 / 場地不受門檻影響。
  - `energySteal` / `dispel`(敵) / `extend`(敵) / `detonateDot` 受門檻管制。
- **新增 / 更新**描述測試：附加對敵段輸出「對命中的目標」。
- 全套既有測試（governance、environments、triggers 等）維持綠燈。

## 影響檔案

- `src/battle/skills.js` — `castSkill` 兩段式；7 支技能補傷害段。
- `src/battle/effects.js` — `applyEffect` 加 `recordHits`/`gate`；門檻集合定義。
- `src/battle/skillText.js` — 附加對敵段描述改「命中的目標」。
- 對應測試檔。

## 已協調：獵殺令十字擴散印記（2026-07-06）

`huntDecree`（獵殺令）已改為十字範圍（見 `effects.js` 新增 scope
`targetAndAdjacent` / `adjacentExcludingTarget`、`skills.js`）：

- 主目標傷害 180%（scope `target`）
- 周圍相鄰敵人濺射傷害 90%（scope `adjacentExcludingTarget`）
- 印記烙在目標 + 周圍（scope `targetAndAdjacent`）

**與傷害門檻的共存 = 使用者選 (B)**：傷害也走十字濺射，周圍相鄰敵人皆吃到傷害 →
在門檻模型下自然被記入命中集合 → 印記照常落實。**不需要**「門檻豁免」旗標。

實作本 Spec 時無額外處理：兩段 damage 皆進傷害段、記錄命中；`mark`（HOSTILE_STATUS）
在其餘段對命中集合放行即可。

## 明確排除（YAGNI）

- 不改普攻（純傷害、無後續，不受影響）。
- 不改觸發 / onEnter / 環境 DoT 路徑（不傳 gate → 沿用現行 rollHit）。
- 不新增可調開關 / 設定；本模型為全域行為。
