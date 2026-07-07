# 卡片改版設計（批次）— 2026-07-07

狀態：**已實作完成（2026-07-07）**。全套 7 卡 + E1–E10 引擎原語已實裝，`vitest` 327 綠（新增 14 條 `cardReworks.test.js`）、`vite build` 通過、實機混戰跑完不崩。

## 卡 8 追加 — 潮汐術士 `tidecaller`（水 / dps）
- **隊伍技**（原「每有一名水屬 +4% 攻擊」改寫）：`when: alliesAtLeast{ count:4, where:{class:'dps'} }`、`target:'allAllies'`、`targetWhere:{class:'dps'}`、`effects:[{ grant:'cheatDeath', healPct:0.5 }]`。＝攻擊成員（dps）≥4 時，所有攻擊成員**首次**受到致命傷害不死並回復 50% 最大生命。
- **新增原語**：
  - **E11 被動 `grant`**：locked 被動可**一次性授予持續（非光環）buff**，用 `_passiveGranted` 追蹤——只在首次符合時發一次，消耗後每步重算不補發，故「首次」語義成立（`passives.js`）。
  - **E12 `cheatDeath` `healPct`**：免死消耗時除了留 1 血，另回復 `healPct` 最大生命（`unit.takeDamage` 記旗標、`effects` 出口 `applyCheatHeal` 補血；`dealDirect` 同步）。
- **與原本免死的差異（重要）**：原 `cheatDeath`（不滅誓約 / 神蹟）是 `duration:1` 的**限時 1 回合免死窗口、留 1 血**；此隊伍技版是 `duration:null` 的**整場保留、觸發一次、回 50% 血**。原版行為未被更動（無 healPct → 仍留 1 血；仍 1 回合到期）。

## 卡 9 / 10 追加 + 誓刃盟主條件修正
- **卡 9 奇蹟聖女 `miraclenun`／神蹟**：對最低血隊友上「保命護符」1 回合——期間內受致死傷害則**免死＋立即大治療（220% 攻）**；若未觸發，到期**減半治療（110% 攻）**。新原語 **E13**（`cheatDeath.healPower`＝觸發治療、`expireHealPower`＝到期治療，到期補血在 engine `tickBuffs` 出口）。移除原本的立即治療段。
- **卡 10 不滅骸王 `deathlessking`／不滅誓約**：保留自身嘲諷 2 回合；免死改為 **1 回合無敵（`undying`）——期間任何致死傷害都留 1 血、不消耗、可連續**。新原語 **E14**（`undying` 效果/buff，結算在 `takeDamage`/`dealDirect`，優先於 cheatDeath）。*假設：嘲諷保留（坦克核心）。*
- **誓刃盟主條件修正**：原批次誤用 `alliesAtLeast count:5`（要湊滿 5 dps）；使用者澄清應為「隊伍**只有**輸出（不論人數，3 名全輸出也算）」。新原語 **E15**（`when.alliesOnly:{class:'dps'}`＝全存活隊友都須命中、進場鎖定）。文字與治理已把 alliesOnly 視為隊伍技軸。

## 實作備註（與草案的差異）
- **maxHp stat key**：血量倍率 buff 的 stat 是 `maxHp`（非 `hp`）——月吼狼王隊伍技用 `{ stat:'maxHp', op:'mul', value:2 }`。
- **虛空喚者被動軸**：治理規則「每卡至多一個被動軸」禁止 team+trigger 並存，故**移除原深淵隊伍技（+12% 傷害）**，改以新觸發（虛空汲取）為唯一被動軸。`skillGovernance.test.js` 已擴充把 `guardKit` 也計為一個被動軸。
- **guardKit 反擊標籤**：反擊傷害沿用 `'counter'` skill 標籤（引擎視為被動傷害，不再連鎖受擊觸發）。
- 其餘一律照下方設計與 §五 預設落地。

---

（以下為原始設計草稿）

狀態：**草稿，待使用者確認**。本文件收齊本輪要改的卡片，並標出每張卡對戰鬥引擎的影響。逐卡設計 + 共用引擎新增 + 未定案的預設決策都列在下面。使用者返回後審閱本文件；確認後才進實作（`writing-plans`）。

---

## 一、共用引擎新增（跨卡）

本輪改版需要 3 個**通用、可重用**的引擎能力。都刻意做成資料驅動的原語，之後別的卡也能用。

### E1. `damage` 效果的 `byClass` 倍率覆寫
`src/battle/effects.js` 的 `applyEffect` → `case 'damage'`：新增可選欄位 `effect.byClass`（`{ [class]: mult }`）。逐目標結算時，若 `effect.byClass[target.class] != null`，用它取代 `effect.mult`（在超充 `ctx.overcharge` 相乘**之前**）。無此欄位者行為不變。

- 用途：迅風武僧絕技「一般 150% / 坦克 350%」。
- 相容：與 `executeBelow`/`lifesteal`/`ignoreDef` 等現有旗標可並存（覆寫的只是基礎倍率）。

### E2. `guardKit` — 傷害上限 + 大傷反擊（反應式 kit）
沿用 `bossKit` 前例：卡片新增 `guardKit` 欄位，於 `Unit` 建構子複製到單位（`unit.js`）。結算集中在 `dealDamage`（`effects.js`）——現有 thorns / counter / healOnHit 也都在這裡。

資料格式：
```js
guardKit: { capPct: 0.2, counterMult: 0.8, lifesteal: 0.3, maxUses: 5 }
```

在 `dealDamage(caster, target, ...)` 內，若 `target.guardKit`：
1. **傷害上限**：算完 `res.amount` 後，若 `res.amount > target.maxHp * capPct`，記 `capped = true`，並把實際套用的傷害夾到 `maxHp * capPct`。
   - 只作用於**直接攻擊**（普攻 / 技能直傷，皆走 `dealDamage`）。DoT / %最大生命真傷 / 環境侵蝕走 `dealDirect`，**不受上限、也不觸發反擊**。
2. **大傷反擊**（承上）：當 `capped === true` 且 `target._guardUses < maxUses`：
   - `target._guardUses += 1`（整場最多 `maxUses` 次；用完後上限仍在，只是不再反擊）。
   - 對持有者的**全體敵人**各造成 `target.effAtk * counterMult` 一般傷害（吃防禦 / 屬性；`noRetaliate: true` 防連鎖）。
   - 加總反擊實際傷害 `sum`，回復持有者 `sum * lifesteal`。
   - 敵人清單：以 `target` 的敵方隊伍解析（實作細節於 plan 決定——`ctx` 提供行動者視角的雙方陣營）。

判定備註：上限夾的是 `res.amount`（過防禦 / 屬性 / 暴擊、過盾之前）；反擊觸發條件為「**夾之前**的傷害 > 20% maxHp」。剛好 20% 不觸發（需嚴格大於）。

> **被否決的替代方案**：把 B/C 做成開場授予的自身 buff。否決原因：被動每 step 重算並清除光環（會把 5 次計數歸零）；改走 `onEnter` 又會放出多餘的「進場施法」演出。`bossKit` 式硬編 kit 最乾淨且有前例。

### E3. 被動的 `columnAllies` 範圍
`src/battle/passives.js` 的 `passiveScope` 目前只支援 `self` / `allAllies` / `allEnemies`。新增 `columnAllies`：與持有者同直排（`column` 相同）的存活隊友（含自己）。

- 用途：深淵獵手被動「同直排隊友回氣 +50%」。
- 語義：光環式（活體、每 step 重算）——與現有被動一致；持有者死亡即失效。

### E4. `damage` 效果的 `critBonus`（單擊暴擊率加成）
`effects.js` `case 'damage'` → `dealDamage` → `computeDamage`：新增可選 `effect.critBonus`，以 `opts.critBonus` 傳入。`computeDamage` 內：`critChance = max(0, attacker.critChance + (opts.critBonus||0) − defender.critRes)`。只影響該次結算。

- 用途：虛空喚者絕技「此傷害附帶 +15 暴擊率」→ `critBonus: 0.15`。
- **為何不用「易暴」減益**：`critRes` getter 走 `clamp01(0..1)`，對基礎 0 的目標加負值會被夾回 0 → 無效。故「+15 暴擊率」只能做在攻方單擊上（此設計），或另闢新的「受暴率」stat（較大工程，暫不做）。

### E5. `mark` 暴擊回能連動（虛空喚者「??狀態」）
- **??狀態** 建議命名 **虛空烙印**，用現有 `mark`（或新 mark 變體 `kind:'voidbrand'` 給獨立圖示）。絕技對後排 `{ type:'mark', duration:N, scope:'target' }`。
- 引擎：engine 的 `damage` 監聽在派發 `markedHit` 時把 `isCrit` 一併帶入 `extra`；`triggers.js` 的 `markedHit` 支援 `crit:true` 條件（`triggerMatches` 加一行）。
- voidcaller 掛 `triggers:[{ on:'markedHit', crit:true, effects:[{ type:'energy', amount:20, scope:'self' }] }]`。
- 語義：帶烙印的後排敵人**被我方暴擊** → 虛空喚者 +20 能量。

### E6. 被動的 `adjacentAllies` 範圍（奪流魅影「周圍角色」）
`passiveScope` 新增 `adjacentAllies`：自身 + 上下左右相鄰存活隊友（沿用 `effects.js` `targetAndAdjacent` 的相鄰判定）。

- 用途：奪流魅影被動「自身與周圍角色回氣 +10%」。
- **開放**：「周圍」= 相鄰四格（本預設）vs 同直排（改用 E3 `columnAllies`）。

### E7. `stealBuff` 隨機挑選（奪流魅影絕技）
現行 `stealBuff` 取目標增益的**前 count 個**（`slice`）。新規格要「**隨機**一個」→ 加可選 `random:true`，用 `ctx.rng` 隨機挑 count 個。無此旗標行為不變。

### E8. `matchesWhere` 陣列值 =「在清單內」
`effects.js` `matchesWhere`：若某鍵的值為陣列，改判 `arr.includes(unit[key])`（`series` 維持既有「成員包含」語義）。現有純量值行為完全不變（向後相容）。

- 用途：月吼狼王隊伍技對「獸族**輔助與攻擊**」＝ `where:{ race:'獸', class:['support','dps'] }`。
- **零成本替代**：改用兩條 passive（support/dps 各一）可不動引擎；但 E8 較簡潔、多卡可用。預設採 E8。

### E9. `damage` 效果的 `vsDot` 倍率覆寫（對中毒目標）
`effects.js` `case 'damage'`：新增可選 `effect.vsDot`。逐目標結算時，若目標身上有任一 `kind:'dot'` buff，用 `effect.vsDot` 取代 `effect.mult`（在超充相乘前）。與 E1 `byClass` 同機制、不同條件。

- 用途：曜鱗龍將絕技「一般 120% / 中毒目標 240%」。
- **開放**：「中毒」是否含**灼燒**（灼燒也是 `kind:'dot'`）。預設**任一 dot 都算**。

### E10. 被動的屬性覆寫光環（全隊轉屬性）
`passives.js` `recomputePassives`：目前每條 effect 一律套 `kind:'stat'` 光環。擴充為——若 effect 帶 `element` 欄位，改套 `{ kind:'element', element:e.element, aura:true }`（沿用 `Unit.element` getter 既有的覆寫語義）。無 `element` 欄位者行為不變。

- 用途：誓刃盟主隊伍技「全體輸出轉暗屬性」。
- 影響面提醒：屬性覆寫會連動剋制 / 天氣光環 / `where` 過濾 / 環境侵蝕豁免——即設計意圖（全隊打暗）。locked passive 條件成立時整場維持。

---

## 二、逐卡設計

### 卡 1 — 迅風武僧 `zephyrmonk`（風 / dps / 近戰）

**現況**：絕技 `galeKicks`（單直排 3 連 90% + 自身 +20 能量）；無被動。

**改後絕技**（用 E1）：
```js
galeKicks: { name: '亂風破', target: 'allEnemies', effects: [
  { type: 'damage', mult: 1.5, byClass: { tank: 3.5 }, scope: 'target' },
]}
```
- 對全體敵人 150% 攻擊；`class === 'tank'` 的敵人改吃 350%。單段、每個敵人只被打一次。

**改後被動**（用 E2，卡片加 `guardKit`）：
- 單次直接攻擊造成的掉血 ≤ 自身總血量 20%。
- 每當一次「夾之前 > 20% maxHp」的直傷被夾：對敵方全體發動 50% 攻擊力反擊（吃防禦/屬性的一般傷害），並回復反擊總傷害的 30%。整場最多 **5 次**。（原 80%，2026-07-07 調降）

**未定案 → 採用預設（可推翻）**：
- (a) 舊絕技的 **+20 能量**：新規格未提 → **移除**。
- (b) 名稱：`連風腿` 已不符 AoE → 顯示名改 **亂風破**（內部 id 維持 `galeKicks`）。
- (c) 反擊傷害：**一般傷害**（吃防禦 / 屬性），非真傷。

### 卡 2 — 深淵獵手 `abysshunter`（水 / dps / 近戰）

**現況**：絕技 `abyssBite`（單體 220% 吸血 50%）；無被動。

**改後絕技**（純用現有原語）：
```js
abyssBite: { name: '<待定>', target: 'allEnemies', effects: [
  { type: 'damage', mult: 1.2, scope: 'target' },
  { type: 'buff', stat: 'critChance', op: 'add', value: 0.3, duration: 2,
    scope: 'allAllies', where: { race: '妖' } },
]}
```
- 對全體敵人 120% 攻擊；我方**妖族**暴擊率 +30%，持續 2 回合。

**改後被動**（用 E3）：
```js
passives: [{ target: 'columnAllies', effects: [
  { stat: 'energyGain', op: 'mul', value: 1.5 },
]}]
```
- 與自身同直排的隊友回氣 +50%。

**未定案 → 採用預設**：
- 絕技顯示名待使用者提供（暫留 `淵噬` 或改新名）。
- 吸血 50% 已隨舊單體技移除（新規格未提吸血）。若要保留需另議。

### 卡 3 — 虛空喚者 `voidcaller`（暗 / dps / 遠程）

**現況**：絕技 `voidBurst`（虛爆，敵直排 160% + 14% maxHp DoT/2）；被動 = 隊伍技（2 名深淵時 `dmgDealt ×1.12`）。

**改後絕技**（用 E4 + E5）：
```js
voidBurst: { name: '虛爆', target: 'enemyBackRow', effects: [
  { type: 'damage', mult: 1.2, critBonus: 0.15, scope: 'target' },
  { type: 'mark', duration: /* 待定，暫 3 */ 3, scope: 'target' }, // 「虛空烙印」
]}
```
外加 voidcaller `triggers`：
```js
triggers: [{ on: 'markedHit', crit: true, name: '虛空汲取',
  effects: [{ type: 'energy', amount: 20, scope: 'self' }] }]
```
- 對**敵方後排**造成 120% 傷害，且此擊 +15% 暴擊率。
- 對後排掛「虛空烙印」；帶烙印者被我方暴擊 → 虛空喚者 +20 能量。
- **原被動（深淵隊伍技）保留**（新規格只改絕技，未提被動）。

**未定案 → 採用預設 / 待確認**：
- 「??狀態」命名 = **虛空烙印**；持續 **3 回合**；每次暴擊都給 20 能量（可多次）。← 全部待你確認。
- 「+15 暴擊率」採 E4（此擊 +15% 暴擊率）解讀。若你原意是別的（例如降敵抗暴 / 永久易暴），請說明。
- `enemyBackRow` = `backEnemies` scope（已存在；後排全空自動轉前排）。

### 卡 4 — 奪流魅影 `fluxreaver`（暗 / dps / 近戰 / 妖 / 深淵）

**現況**：絕技 `energyLeech`（奪流，打能量最高者 160% + 奪全部能量轉我方）；被動 `energyGain ×1.1`（僅自身）。

**改後絕技**（用 E7）：
```js
energyLeech: { name: '奪流', target: 'enemyColumn', effects: [
  { type: 'damage', mult: 1.8, scope: 'target' },
  { type: 'stealBuff', count: 1, random: true, scope: 'target' },
]}
```
- 對**敵方直排**造成 180% 傷害，並將對象**隨機一個增益**轉移到自己身上。
- **未定案**：原「奪能量（energySteal）」新規格未提 → **移除**（改為偷 buff）。若要兩者並存需說明。直排每個目標各偷 1 個，或整組只偷 1 個？預設**各偷 1 個**。

**改後被動**（用 E6）：
```js
passives: [{ target: 'adjacentAllies', effects: [
  { stat: 'energyGain', op: 'mul', value: 1.1 },
]}]
```
- 自身與相鄰隊友回氣 +10%（原本僅自身）。

### 卡 5 — 月吼狼王 `moonhowler`（風 / dps / 近戰 / 獸 / 大地・秘林）

**現況**：絕技 `lunarHowl`（月吼，全體 110% + 自身 atk×1.1 疊層/99）；隊伍技 = 獸≥2 → 自身暴擊 +12%。

**改後絕技**（用現有 buff 原語）：
```js
lunarHowl: { name: '月吼', target: 'allEnemies', effects: [
  { type: 'damage', mult: 1.1, scope: 'target' },
  { type: 'buff', stat: 'dmgDealt', op: 'mul', value: 0.8, duration: /* 待定，暫 2 */ 2, scope: 'target' },
]}
```
- 對全體敵人 110% 傷害；命中的敵人**造成傷害 −20%**（`dmgDealt ×0.8` 減益）。
- **移除**原「自身攻擊 +10%／99 次」自我疊怒（新規格未提）。

**改後隊伍技**（用 E8；locked passive）：
```js
passives: [{ when: { alliesAtLeast: { count: 3, where: { race: '獸' } } },
  target: 'allAllies', targetWhere: { race: '獸', class: ['support', 'dps'] },
  effects: [{ stat: 'hp', op: 'mul', value: 2 }] }]
```
- 我方**獸族達 3 名**時，獸族的**輔助與攻擊**單位**血量 ×2**（進場鎖定，整場有效）。
- **移除**原「自身暴擊 +12%」（新規格改寫整條隊伍技）。

**未定案 → 採用預設 / 待確認**：
- 減傷 −20% 的**持續回合**（預設 2）。
- 「受有 >=3 人」解讀為**獸族隊友 ≥ 3**（沿用原隊伍技的 where:獸；預設）；若指「我方總數 ≥3」請說明。
- HP×2 是否含坦克（預設**否**，只 support+dps）；moonhowler 自身為獸 dps → 會吃到 ×2。

### 卡 6 — 曜鱗龍將 `flamewyrm`（火 / dps / 近戰 / 龍 / 炎之眷屬・蒼雷）

**現況**：絕技 `dragonflare`（龍炎滅陣，全體 140% + 自身 +15 能量）；無進場技、無被動。

**改後絕技**（用 E9）：
```js
dragonflare: { name: '龍炎滅陣', target: 'allEnemies', effects: [
  { type: 'damage', mult: 1.2, vsDot: 2.4, scope: 'target' },
]}
```
- 對全體敵人 120% 傷害；**中毒（帶 dot）目標改吃 240%**。

**新增進場技**（用現有 `dot` 原語）：
```js
onEnter: { name: '劇毒龍息', effects: [
  { type: 'dot', power: 0.05, basis: 'targetMaxHp', duration: 2, scope: 'allEnemies' },
]}
```
- 入場對敵方全體施加中毒 2 回合，每跳 **5% 最大生命**。
- 與絕技 E9 天然聯動（先毒後炸吃 2 倍）；但毒僅 2 回合，實戰是否來得及疊到大招由玩家操作決定。

**未定案 → 採用預設**：
- 原「自身 +15 能量」新規格未提 → **移除**（與其他卡處理一致）。若要保留循環請說明。
- 進場毒可被閃避（`dot` 屬可迴避效果，走命中判定）——符合現有規則；如要必中需另議。

### 卡 7 — 誓刃盟主 `bladeoath`（暗 / dps / 近戰 / 人 / 疾風・深淵）

**現況**：絕技 `oathBlade`（誓刃，`singleEnemyByColumn` 240%）；隊伍技 = 全 DPS 隊(≥5 dps) → 全體 `dmgTaken×0.6` + `dodge+0.12`。

**改後絕技**（僅換目標選擇器；`lowestHpEnemy` 已存在）：
```js
oathBlade: { name: '誓刃', target: 'lowestHpEnemy', effects: [
  { type: 'damage', mult: 2.4, scope: 'target' },
]}
```
- 對敵方**血量最低**單位造成 240% 傷害（原為同直排單體）。

**改後隊伍技**（用 E10；沿用既有 locked 條件）：
```js
passives: [{ when: { alliesAtLeast: { count: 5, where: { class: 'dps' } } },
  target: 'allAllies', effects: [
    { element: 'dark' },                         // 全體輸出轉暗屬性（E10）
    { stat: 'dmgTaken', op: 'mul', value: 0.6 }, // 承傷 −40%（2026-07-07 由 −60% 調回）
    { stat: 'dodge',    op: 'add', value: 0.15 },// 迴避 +15%（原 0.12）
  ] }]
```
- 我方**只有輸出（全隊 dps）**時：全體轉暗屬性、承傷 −40%、迴避 +15%。

**未定案 → 採用預設**：
- 「只有輸出」沿用既有 `count:5 dps`（＝滿編 5 人皆 dps）。若你要「不論人數、只要沒有非 dps 就成立」，需加 `alliesOnly` 條件原語（小工程）——預設**不加**，維持 count:5。
- 240% 未變（現值即 240%）。

---

## 三、卡面文字（各卡共通）
更新 `src/battle/skillText.js` 與卡片 `passives` 的顯示，讓玩家讀得到新技能 / 被動描述。

## 四、測試重點
- E1：`byClass` 對坦克 / 非坦克倍率正確；與 overcharge 相乘；無 `byClass` 行為不變。
- E2：直傷夾 20%；DoT / %maxHp / 環境不夾、不觸發；反擊 AoE 傷害 + 30% 回血；整場 5 次上限；`noRetaliate` 無連鎖；用完後上限續存。
- E3：`columnAllies` 只涵蓋同直排存活隊友（含自己）；持有者死亡失效。
- E4：`critBonus` 提高該擊暴擊率；不影響其他攻擊；仍受守方 critRes 抵扣。
- E5：帶烙印敵人被暴擊 → voidcaller +20 能量；非暴擊不給；無烙印不給；`crit:true` 條件正確。
- E6：`adjacentAllies` 只涵蓋自身 + 上下左右相鄰存活隊友。
- E7：`stealBuff` `random:true` 用 rng 隨機挑；不偷光環 / sticky；無旗標仍取前 N。
- E8：`where` 陣列值 = 在清單內；純量值行為不變；`series` 語義不變。
- 卡 5：命中敵人 dmgDealt ×0.8；獸≥3 時獸族 support/dps HP×2（進場鎖定 + `reconcileMaxHp` 補血）。
- E9 / 卡 6：中毒目標吃 `vsDot` 倍率、無 dot 吃 base；進場毒對全體 2 回合 5% maxHp/跳。
- E10 / 卡 7：全 dps 隊時全體 element→dark（剋制 / where 連動正確）、承傷×0.4、迴避+0.15；`lowestHpEnemy` 選中最低血敵人；條件不成立時無任何光環。
- 全部卡：既有回放 / battleLog 快照決定性不破（rng 消耗順序不變）。

---

## 五、開放事項（待你返回確認）
- **是否還有更多卡要改？** 本文件持續追加；卡越多越值得先收齊再一次實作。
- **卡 1 迅風武僧**：(a) 移除 +20 能量、(b) 改名亂風破、(c) 反擊為一般傷害 —— 預設是否 OK。
- **卡 2 深淵獵手**：絕技新名？是否保留吸血 50%（預設移除）。
- **卡 3 虛空喚者**：??狀態命名（預設「虛空烙印」）/ 持續回合（預設 3）；「+15 暴擊率」解讀（預設 = 此擊 +15% 暴擊率）；每次暴擊都給 20 能量是否可疊。
- **卡 4 奪流魅影**：「周圍」= 相鄰四格（預設）還是同直排；絕技是否同時保留奪能量；直排偷 buff 是各偷 1 還是共偷 1（預設各偷 1）。
- **卡 5 月吼狼王**：減傷 −20% 持續回合（預設 2）；「≥3 人」= 獸族 ≥3（預設）；HP×2 是否含坦克（預設否）。
- **卡 6 曜鱗龍將**：「中毒」是否含灼燒（預設含，任一 dot）；是否保留原 +15 能量（預設移除）；進場毒可被閃避（預設是）。
- **卡 7 誓刃盟主**：「只有輸出」用 `count:5 dps`（預設）還是「無非 dps 即成立」（需加 `alliesOnly` 原語）。
