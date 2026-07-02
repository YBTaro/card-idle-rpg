# Spec 4 — 前端 log 化 + AnimationDirector

日期：2026-07-02
分支：`claude/spec4-log-frontend`
狀態：自主執行（使用者已授權）
前置：Spec 3e（simulateBattle / Replayer 已在 main）

## 目標

前端徹底斷開 live engine：戰鬥一開場就用 `simulateBattle` **瞬間算完**，前端只消費
`{ setup, log }` —— 場景由 setup 建、動畫由 log 播。中間加一層 **AnimationDirector**
控制播放節奏（變速 / 跳過都是純播放問題）。這是視覺升級（Spec 5）與未來前後端分離的最終架構：
之後 log 來源從「本機函式」換成「後端 API」，前端零改動。

```
simulateBattle（瞬間）→ { setup, log }
        │
    Replayer（逐筆吐事件，追蹤 hp/energy/alive/round）
        │
 AnimationDirector（節奏：每種事件一個時間預算 × 速度倍率；skip）
        │
  BattleScene（由 setup 建場、訂閱 replayer 事件放特效、renderTick 讀 replayer 狀態畫條）
```

## 1. Log 格式 v2（battle 層）

現有 log 缺前端畫「能量條 / 回合數」的資料，補齊：

- **engine.js**：回合遞增處（`this.round += 1` 後）`emit('round', { round: this.round })`。
- **能量事件**：每次能量變動後 `emit('energy', { unit, value: unit.energy })`。變動點共 4 處：
  1. `skills.js normalAttack`：施放者 `energyOnAction`、隊友 `energyOnAllyAction`（每個獲得能量的隊友各發一筆）。
  2. `effects.js dealDamage`：受擊者 `energyOnHitTaken`。
  3. `effects.js applyEffect` 的 `case 'energy'`。
  4. `engine.js _act` 技能分支 `u.energy = 0` 後（value 0）。
- **battleLog.js**：訂閱兩事件 → `{ type:'round', round }`、`{ type:'energy', uid, value }`；
  setup 快照加 `level`。
- 引擎其餘行為不變；確定性不變（同 seed → 同 log）。

## 2. Replayer v2

- 每 uid 狀態加 `energy`（初始 0）；`energy` 條目 → 更新；新增 `energyOf(uid)`。
- 新增 `this.round`（初始 0）；`round` 條目 → 更新。
- 既有 hp/alive/winner 行為不變。

## 3. AnimationDirector（`src/render/animationDirector.js`，純模組）

不 import pixi/gsap —— 可用 Vitest 直接測。

- `DELAYS`：事件型別 → 秒數預算（turn 0.1、attack 0.25、ultimate 0.7、damage 0.18、
  heal 0.15、death 0.25、stunned 0.25、其餘（round/energy/buffchange/battleEnd…）0）。
- `class AnimationDirector { constructor(replayer, { delays = DELAYS } = {}) }`
  - `speed`（預設 1；HUD 的 1×/2×/3× 直接設）。
  - `update(dt)`：`_wait -= dt * speed`；`while (_wait <= 0 && !replayer.done)`
    逐筆 `replayer.step()` 並 `_wait += delays[entry.type] ?? 0`。
    零預算條目同幀連發；攻擊/大招自然停頓 —— 即「每事件有節奏」的編排 v1。
  - `get done()` → `replayer.done`。

## 4. BattleScene log 化

- 建構子改 `(app, setup, replayer)`：
  - sprites 由 **setup** 建（uid/team/pos/name/level/element/class/maxHp），不再讀 engine/Unit。
  - 事件全訂閱 **replayer**（payload 是 uid → 用 `sprites.get(uid)`）。
  - `renderTick()`：條改讀 `replayer.hpOf(uid)/maxHp`、`replayer.energyOf(uid)/ENERGY_MAX`；
    另外若 `!replayer.aliveOf(uid)` 且未標記死亡 → 直接套死亡視覺（alpha 0.25 / scale 0.85），
    讓「跳過」不靠事件動畫也能呈現終局。
  - `setInstant(bool)`：instant 模式下事件處理器全部 no-op（跳過時避免上百個 tween），
    畫面由 renderTick 從 replayer 狀態重建。
- 新特效（fx.js）：
  - `banner(layer, textObj)`：技能名橫幅 —— 大招 cut-in v1（置中放大進場、停留、淡出）。
  - `screenShake(container, strength)`：震屏。
- 事件表現：
  - `ultimate` → ultPulse + 技能名橫幅（`SKILLS[skill].name`）+ 震屏。
  - `damage` → hitFlash + 飄字；`isCrit` → 較大橘字前綴「暴擊」。
  - `stunned` → 飄「暈眩」字。
  - 其餘（attack/heal/death）同現行。

## 5. BattleController 重接

- `start()`：建雙方 Unit → `simulateBattle`（瞬間）→ `new Replayer(setup, log)` →
  `new BattleScene(app, setup, replayer)` → `new AnimationDirector(replayer)`；
  訂閱 replayer `battleEnd` → `_onEnd(winner)`（獎勵/關卡推進時機 = 播放到結尾或跳過當下，同現行體感）。
- `_tick`：未完 → `director.update(dt)`；`scene.renderTick()`；狀態列存活數改由
  setup×`replayer.aliveOf` 統計、回合 = `replayer.round`。結束後冷卻重開（現行邏輯不變）。
- `setSpeed(x)` → `director.speed = x`。
- `skip()` → `scene.setInstant(true)` → `replayer.skipToEnd()` → `scene.renderTick()`
  （battleEnd 照常觸發結算）。
- controller 不再 import `BattleEngine`。HUD 介面不變。

## 6. 檔案

新增：`src/render/animationDirector.js`、`src/render/animationDirector.test.js`
修改：`src/battle/engine.js`、`src/battle/skills.js`、`src/battle/effects.js`、
`src/battle/battleLog.js`（+測試）、`src/battle/replayer.js`（+測試）、
`src/render/battleScene.js`、`src/render/fx.js`、`src/render/battleController.js`

## 7. 測試 / 驗收

- log v2：energy/round 條目存在且值正確（普攻後施放者能量 +energyOnAction×mult；
  技能施放後 energy 條目 value 0）；setup 含 level；同 seed 確定性仍成立；條目全可序列化。
- replayer v2：`energyOf` 隨 energy 條目更新；`round` 隨 round 條目更新。
- director：以真 log（simulateBattle 產出）驗證 —— 足量 update 後 `done`；
  單次 `update(0.05)` 於 speed 1 不會把整份 log 播完（節奏存在）；
  speed 3 播完所需 update 次數 < speed 1（變速有效）；零預算條目同幀連發。
- render 層：`npm run build` 成功；全套件綠。
- 引擎既有測試不變（新增事件為附加）。

## 8. 未來（非本 Spec）

Spec 5 視覺架構（asset manifest、卡框/頭像、2.5D 站位、立繪 cut-in）、前後端分離、資料庫存 log。
