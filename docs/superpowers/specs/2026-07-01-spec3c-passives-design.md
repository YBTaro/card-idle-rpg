# Spec 3c — 被動 / 光環(Passive / Aura)

日期：2026-07-01
分支：`claude/spec3c-passives`
狀態：自主執行(使用者已授權)
前置：Spec 2 引擎、3a 屬性/where、3b 控場(皆在 main)

## 目標

新增**常駐/條件式**的被動與光環效果——不靠施放技能觸發,只要條件成立就持續生效(例:「場上每有一位同族,全隊+攻」「自己血量<50% 時+攻」「有龍族隊友時全隊+防」)。

**核心策略——recompute-on-step**:被動不是一次性 buff,而是每個 step 由引擎**重算**。做法:每 step 先清掉所有「光環 buff」,再依當前存活單位的被動重新產生。因為每步重算,永遠不會過期/殘留;且光環是 `kind:'stat'` buff,直接沿用既有有效值 resolver。

## 1. 被動資料(卡片)

卡片加 `passives: PassiveDef[]`(佔位測試資料)。`PassiveDef`:
```js
{
  when?: <條件>,        // 省略 = 只要擁有者存活即生效
  target: 'self' | 'allAllies' | 'allEnemies',
  effects: [ <被動效果> ],
}
```

**條件 `when`**(針對被動擁有者;多條件 AND):
- 省略 → 恆成立(擁有者存活)
- `{ selfHpBelow: 0.5 }` → 擁有者 `hpRatio < 0.5`
- `{ alliesAtLeast: { count: N, where: {...} } }` → 擁有者隊伍中符合 where 的存活數 ≥ N

**被動效果**(套成 `kind:'stat'` 光環 buff):
- 靜態:`{ stat, op, value }` — 直接用 value。
- 數量縮放(乘):`{ stat, op:'mul', basePct, perCountOf:{ side:'allies'|'enemies', where } }` → value = `1 + basePct × count`。
- 數量縮放(加):`{ stat, op:'add', valuePer, perCountOf:{ side, where } }` → value = `valuePer × count`。

`count` = 指定側符合 `where` 的**存活**單位數(沿用 3a 的 `matchesWhere`)。

### 佔位測試資料(隨意配)
- `aegis`(龍,坦):`{ target:'allAllies', effects:[{ stat:'def', op:'mul', value:1.1 }] }` —— 存活時全隊 +10% 防。
- `ifrit`(dps):`{ when:{ selfHpBelow:0.5 }, target:'self', effects:[{ stat:'atk', op:'mul', value:1.3 }] }` —— 殘血時自身 +30% 攻。
- `nightreaper`(不死,dps):`{ target:'self', effects:[{ stat:'atk', op:'mul', basePct:0.05, perCountOf:{ side:'allies', where:{ race:'不死' } } }] }` —— 每有一位不死隊友(含自己)自身 +5% 攻。

## 2. 光環 buff 與 resolver

- 光環 buff 形狀:`{ kind:'stat', stat, op, value, duration:null, aura:true }`。
  - `kind:'stat'` → 既有 `resolve()` 自動納入(effAtk/effDef… 無需改)。
  - `aura:true` → 供重算時辨識清除;`duration:null` → `tickBuffs` 不動它(由重算管理)。
- `src/battle/buffs.js` 新增 `clearAuras(unit)`:移除 `b.aura` 的 buff(其餘 buff 不動)。

## 3. `passives.js` 重算模組

新增 `src/battle/passives.js`,對外 `recomputePassives(teams)`:
1. 對所有單位 `clearAuras`。
2. 對每個**存活**且有 `passives` 的擁有者,逐一被動:
   - `conditionHolds(when, owner, teams)` 為真才套用。
   - `passiveScope(target, owner, teams)` 解析目標(self/allAllies/allEnemies,相對擁有者隊伍,存活過濾)。
   - 對每個目標、每條效果:`applyBuff(target, { kind:'stat', stat, op, value: auraValue(effect, owner, teams), duration:null, aura:true })`。
- `auraValue`:有 `perCountOf` → 依 count 計(mul:`1+basePct×count`、add:`valuePer×count`);否則用 `value`。
- import:`applyBuff`(buffs)、`matchesWhere`(effects)。純模組。

## 4. 引擎整合

`src/battle/engine.js`:`step()` 最前面(phase 分派前)呼叫 `recomputePassives(this.teams)`。
- 於每個動作前重算 → 讀取有效值(effAtk 等)時光環已是最新。
- 首步之前即重算,故第一個動作也吃到被動。
- 戰鬥結束後 `step()` 直接 return(不重算),無妨。

## 5. Unit / 資料流

- `src/core/stats.js` `deriveStats`:輸出 `passives: card.passives || []`。
- `src/battle/unit.js`:`this.passives = stats.passives || []`。
- `src/battle/testHelpers.js` `makeUnit`:`passives: opts.passives ?? []`。

## 6. 檔案

新增:`src/battle/passives.js`、`src/battle/passives.test.js`
修改:`src/data/cards.js`(passives 佔位)、`src/core/stats.js`、`src/battle/unit.js`、`src/battle/testHelpers.js`、`src/battle/buffs.js`(clearAuras)、`src/battle/engine.js`(step 重算)、`src/battle/engine.test.js`

## 7. 測試 / 驗收

- `clearAuras` 只移除 aura、保留其他 buff。
- `recomputePassives`:
  - 靜態光環(aegis +10% def 全隊)→ 隊友 effDef 提升。
  - 條件(ifrit 殘血 +30% atk)→ hp≥50% 無效、<50% 生效。
  - 數量縮放(nightreaper 每不死隊友 +5% atk)→ effAtk 隨不死隊友數變化。
  - 重算不累積:多次呼叫後光環不疊加(每次先清)。
  - 非光環 buff(stat/dot/shield/control)不受重算影響。
- 引擎整合:含被動的隊伍開打,effAtk/effDef 反映被動;無被動的既有測試全綠。
- 全套件綠、build 成功。

## 非本 Spec(後續)

3d 每卡專屬技、3e 戰鬥 log/replay。數量縮放目前支援 allies/enemies count;更複雜的觸發式被動(如「受擊時反擊」)留後續。
