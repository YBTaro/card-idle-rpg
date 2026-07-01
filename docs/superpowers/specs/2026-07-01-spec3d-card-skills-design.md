# Spec 3d — 每卡專屬技(Per-Card Skills)

日期：2026-07-01
分支：`claude/spec3d-card-skills`
狀態：自主執行(使用者已授權)
前置：Spec 2 引擎、3a 屬性/where、3b 控場、3c 被動(皆在 main)

## 目標

把「技能按職業共用(3 招)」升級為「**每張卡有自己的專屬主動技**」——用前面所有原語(effects / where / control / 選擇器)為 10 張卡各配一招,證明整套引擎的表達力。技能佔位設計(使用者授權隨意配)。

## 1. 歸屬機制

- `Unit` 帶 `cardId`(`deriveStats` 已輸出,只需在 Unit 保存)。
- `CARD_SKILLS`:`cardId → skillId` 對照表。
- `skillFor(unit)` 改為:`CARD_SKILLS[unit.cardId] ?? unit.classDef.ultimate`。
  - 有專屬技 → 用之;沒有(或測試單位無 cardId)→ 退回職業大招(burst/guard/heal),故既有行為不變。
- 實戰單位由 `buildPlayerUnits`/`buildEnemyUnits` 建立,`deriveStats` 帶 cardId → 自動吃到專屬技。

## 2. 10 張卡的專屬技(佔位;power = %×effAtk)

全部只用已實作的原語(damage/heal/buff/dot/shield/energy/control + 選擇器 + scope + where):

| cardId | skillId | 設計 |
|---|---|---|
| ifrit | infernoNova | target `enemyFrontRow`;damage 1.8 + fire dot 0.4/2 回(scope target) |
| emberguard | moltenBulwark | 自身 taunt 2;全隊 shield 1.5/3(scope self / allAllies) |
| zephyr | galeAssault | target `enemyBackRow`;damage 2.2(打後排) |
| galewind | windsong | 全隊 energyGain×1.5/3(加速集氣)+ 全隊 heal 1.0 |
| tidecaller | tidalPrison | target `enemyColumn`;damage 1.6 + silence 2(scope target) |
| aegis | dragonGuard | 全隊 dmgTaken×0.6/2(key guard)+ 自身 shield 2.0/3 |
| seraph | radiantGrace | target `lowestHpAlly`;heal 3.5(target)+ 全隊 critChance+0.2/2 |
| dawnblade | dawnStrike | target `singleEnemyByColumn`;damage 2.8 + 自身 atk×1.2/2 |
| nightreaper | shadowExecute | target `singleEnemyByColumn`;damage 3.0 + stun 1(scope target) |
| gravewarden | gravePact | 自身 taunt 2 + 敵方全體 atk×0.7/2(scope self / allEnemies) |

（`target` 只在有效果用 `scope:'target'` 時需要;純 self/allAllies/allEnemies 者可省略 target。）

### 技能資料範例
```js
infernoNova: { name: '焚天', target: 'enemyFrontRow', effects: [
  { type: 'damage', mult: 1.8, scope: 'target' },
  { type: 'dot', power: 0.4, element: 'fire', duration: 2, scope: 'target' },
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
（其餘 7 招同樣風格,見計畫的完整資料。)

## 3. 檔案

修改:`src/battle/unit.js`(cardId)、`src/battle/testHelpers.js`(cardId)、`src/battle/skills.js`(新增 10 招 SKILLS + `CARD_SKILLS` + 改 `skillFor`)、
`src/battle/skills.test.js`
（`stats.js` 已輸出 cardId;`battleSetup` 無需改——deriveStats 已含 cardId。)

## 4. 測試 / 驗收

- `skillFor`:無 cardId / 未對照 → 退回 `classDef.ultimate`;有對照 → 回專屬 skillId。
- 每張卡的 skillId 都存在於 `SKILLS`(對照完整、無錯字)。
- 抽樣驗證幾招經 `castSkill` 產生預期效果:
  - nightreaper `shadowExecute` → 目標受傷 + 被 stun。
  - tidecaller `tidalPrison` → 直排目標受傷 + 被 silence。
  - galewind `windsong` → 全隊 energyGain buff + 回血。
- 既有職業大招(burst/guard/heal)仍在(作為 fallback);無 cardId 的既有引擎測試全綠。
- 全套件綠;build 成功。

## 非本 Spec(後續)

3e 戰鬥 log/replay。真實卡牌數值/技能設計日後由使用者定(本 Spec 為佔位)。
