# Spec 3e — 戰鬥 Log / Replay

日期：2026-07-01
分支：`claude/spec3e-battle-log`
狀態：自主執行(使用者已授權)
前置：Spec 2 引擎 + 3a–3d(皆在 main)

## 目標

引擎已是純邏輯、事件驅動、給定 rng seed 完全確定。把整場戰鬥**後端獨立演算**成一份**可序列化的 log**,前端據此播動畫或**直接跳過**。這是未來前後端分離 + 資料庫的地基。

三塊:
1. **Log 產生器**(`battleLog.js`):跑完整場,收集**初始快照 + 有序事件**成自足的 log。
2. **Replayer**(`replayer.js`):消費 log、追蹤 hp、可逐步播放或跳到結尾——不需引擎即可重播。
3. **前端 skip**(`battleController`):加「跳過」把當前戰鬥瞬間結算並顯示結果。

## 1. Log 產生器（`src/battle/battleLog.js`）

`simulateBattle(teamA, teamB, { rng } = {}) → { setup, log, winner, rounds }`

- 建 `BattleEngine`,訂閱所有事件轉成**可序列化**(以 `uid` 取代物件參考),`step()` 跑到結束。
- **setup**:初始單位快照陣列(供前端建場,不需引擎):
  ```js
  { uid, team, pos, name, element, class, cardId, maxHp }
  ```
- **log**:有序事件陣列,每筆以 uid 表示:
  | 事件 | log 條目 |
  |---|---|
  | turn | `{ type:'turn', uid }` |
  | attack | `{ type:'attack', attackerUid, targetUid, skill }` |
  | ultimate | `{ type:'ultimate', casterUid, skill, targetUid }` |
  | damage | `{ type:'damage', sourceUid, targetUid, amount, skill, isAdvantage, isDisadvantage, isCrit }` |
  | heal | `{ type:'heal', sourceUid, targetUid, amount }` |
  | death | `{ type:'death', uid }` |
  | stunned | `{ type:'stunned', uid }` |
  | buffchange | `{ type:'buffchange', uid }` |
  | battleEnd | `{ type:'battleEnd', winner }` |
  - `source` 可為 null(DoT)→ `sourceUid: null`。
- 回傳 `winner`(0/1/-1)、`rounds`。
- **確定性**:相同 setup + 相同 seed → 完全相同 log(以測試斷言)。
- 純模組(不 import pixi/gsap/DOM)。註:`simulateBattle` 會消耗傳入單位的狀態(打到死),故用於「純算 log」;要顯示請由 log 重建。

## 2. Replayer（`src/battle/replayer.js`）

`class Replayer { constructor(setup, log) … }`——不需引擎即可重播:
- 內部維護每個 uid 的輕量狀態:`hp`(初始 = maxHp)、`alive`。
- `on(event, fn)` / `emit`:同 EventEmitter,供前端訂閱(型別同 log 條目 type)。
- `step(): entry | null`:取下一筆 log,更新內部狀態(damage:`hp -= amount`、heal:`hp += amount`(夾 maxHp)、death:`alive=false`),`emit(entry.type, entry)`,回傳該條目;無則回 null。
- `playAll()` / `skipToEnd()`:一次跑完剩餘 log(套用所有狀態、逐一 emit),讓前端可「跳過」。
- `get done()`、`get winner`。
- 純模組。

## 3. 前端 skip（`src/render/battleController.js`）

- 新增 `skip()`:把當前 live engine `step()` 跑到 `over`,再 `scene.renderTick()`(瞬間結算,`battleEnd` 事件照常觸發 `_onEnd`)。
- HUD 加「⏩ 跳過」按鈕(`src/ui/hud.js`)→ `onSkip` callback → `controller.skip()`;於 `src/main.js` 接線。
- （本階段 skip 直接快轉 live engine;log/replayer 為後端與未來 FE/BE 分離所備。前端改用 log 播放為後續工作。)

## 4. 檔案

新增:`src/battle/battleLog.js`、`src/battle/battleLog.test.js`、`src/battle/replayer.js`、`src/battle/replayer.test.js`
修改:`src/render/battleController.js`(skip)、`src/ui/hud.js`(按鈕)、`src/main.js`(接線)

## 5. 測試 / 驗收

- **battleLog**:
  - 確定性:同 seed 兩次 `simulateBattle`(各自 build 相同單位)→ `log` 深度相等、`winner` 相同。
  - 序列化:log 條目只含原始值/uid(無 Unit 物件參考);setup 欄位齊全。
  - `battleEnd` 為最後一筆;`winner` 與 setup 一致。
- **replayer**:
  - `step()` 依序 emit 與 log 相同的 type 序列;hp 追蹤正確(damage 後 hp 下降、death 後 alive=false)。
  - `skipToEnd()` 後 `done` 為真、`winner` 正確、狀態為終局。
- **skip**(render):`npm run build` 成功;控制器 `skip()` 使 `engine.over` 為真(可用純邏輯測試 controller.skip 不需 DOM——若牽涉 pixi 則以 build 驗證)。
- 全套件綠。

## 6. 未來(非本 Spec)

前端完全改用 log 播放(scene 由 setup 建、消費 replayer 事件)、前後端分離、資料庫存 log/戰報。
