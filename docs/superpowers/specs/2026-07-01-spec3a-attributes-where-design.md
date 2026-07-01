# Spec 3a — 屬性(種族/系列)+ `where` 條件過濾

日期：2026-07-01
分支：`claude/spec3a-attributes-where`
狀態：自主執行(使用者已授權:自行決定、做到完成、最後審視)
前置：Spec 2(技能/Buff 引擎,已在 main)

## 目標

為卡片/單位加入兩種**分類標籤**,並讓效果能依條件過濾目標——這是後續每卡技能、種族/系列效果的地基。

- `race`:**單值**標籤,**無相剋**(純分類)。
- `series`:**多值**標籤(`string[]`),無相剋。
- 效果加可選 `where` 條件,依單位屬性過濾 scope 解析出的目標。

> 種族/系列的卡片配置為**佔位測試資料**(使用者授權隨意配);真實卡牌設計日後再定。

## 1. 屬性資料

`src/data/cards.js`:每張卡加 `race: string` 與 `series: string[]`(佔位值):

| cardId | race | series |
|---|---|---|
| ifrit | 妖 | ['炎之眷屬'] |
| emberguard | 機械 | ['炎之眷屬','守護者'] |
| zephyr | 人 | ['疾風'] |
| galewind | 人 | ['疾風','聖歌隊'] |
| tidecaller | 人 | ['潮汐'] |
| aegis | 龍 | ['潮汐','守護者'] |
| seraph | 神 | ['聖歌隊','光輝'] |
| dawnblade | 人 | ['光輝'] |
| nightreaper | 不死 | ['影之眷屬'] |
| gravewarden | 不死 | ['影之眷屬','守護者'] |

- `src/core/stats.js` `deriveStats`:輸出帶 `race`、`series`(直接取自 card)。
- `src/battle/unit.js`:`Unit` 建構時保存 `this.race = stats.race`、`this.series = stats.series || []`。
- `src/battle/testHelpers.js` `makeUnit`:接受 `opts.race`(預設 `'人'`)、`opts.series`(預設 `[]`)。

## 2. `where` 條件過濾

新增 `matchesWhere(unit, where)` 於 `src/battle/effects.js`:

```js
export function matchesWhere(unit, where) {
  if (!where) return true;
  for (const [key, val] of Object.entries(where)) {
    if (key === 'series') {
      if (!unit.series || !unit.series.includes(val)) return false;
    } else if (unit[key] !== val) {
      return false; // race / element / class / row 等值
    }
  }
  return true; // 多條件 → AND
}
```

- **比對**:`series` → 成員判斷;其餘鍵(`race`/`element`/`class`/`row`…)→ 等值。
- **多條件 AND**:`where` 內每個鍵都要成立。
- **套用點**:`applyEffect` 在分派前,以 `effect.where` 過濾 `units`:
  ```js
  export function applyEffect(effect, caster, units, ctx, skillId = 'skill') {
    const targets = effect.where ? units.filter((u) => matchesWhere(u, effect.where)) : units;
    for (const u of targets) { /* 原本的 switch，改跑 targets */ }
  }
  ```
- 無 `where` → 行為與現在完全相同(不過濾)。

### 使用範例(供日後技能資料)

```js
{ type:'damage', mult:1.3, scope:'allEnemies', where:{ race:'不死' } }              // 對不死族加傷
{ type:'buff', stat:'atk', op:'mul', value:1.2, duration:2, scope:'allAllies', where:{ series:'守護者' } } // 守護者系列限定
{ type:'heal', power:1.0, scope:'allAllies', where:{ series:'聖歌隊' } }             // 聖歌隊限定治療
```

## 3. 檔案

修改:`src/data/cards.js`、`src/core/stats.js`、`src/battle/unit.js`、`src/battle/testHelpers.js`、`src/battle/effects.js`
測試:`src/battle/effects.test.js`(where 過濾)、`src/core/stats.test.js`(新建,race/series 帶出)或加到既有測試

## 4. 測試 / 驗收

- `deriveStats` 輸出含正確 `race`/`series`;`Unit` 持有之。
- `matchesWhere`:race 等值命中/不命中;series 成員命中/不命中;多條件 AND;無 where=true。
- `applyEffect` + `where`:混合種族的一組目標,只有符合者受效果(如只對 `race:'不死'` 造成傷害)。
- 無 `where` 的既有技能行為不變;全套件綠。

## 非本 Spec(後續 3b–3e)

3b 控場(嘲諷/暈眩/沉默)、3c 被動/光環、3d 每卡專屬技、3e 戰鬥 log/replay。
