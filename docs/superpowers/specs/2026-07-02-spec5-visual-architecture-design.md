# Spec 5 — 視覺架構（asset manifest + 卡面元件 + 2.5D 戰場 + cut-in 升級）

日期：2026-07-02
分支：`claude/spec5-visual-architecture`
狀態：自主執行（使用者已授權）
前置：Spec 4（前端 log 化，已在 main）

## 目標

把「手遊感」的**結構**先架起來：所有介面與戰場都從一張**素材清單（asset manifest）**取素材；
沒有素材時退回程序化佔位（元素漸層 + 職業符號）。之後使用者用 AI 生一批卡圖、
丟進 `public/assets/cards/<cardId>.png`、在 manifest 填一行 → 全遊戲換皮
（**一張立繪裁三用**：卡圖 / 頭像 / 戰鬥棋子）。

範圍外：稀有度（卡片資料尚無此欄位，屬未來真實卡牌設計）、Spine 骨骼動畫（留素材到位後）。

## 1. Asset manifest（`src/data/assets.js`，純模組）

```js
// cardId → 素材描述。art 相對於 /public;portrait 用同一張圖 + 裁切參數（CSS object-position / pixi 位移）。
export const CARD_ART = {
  // ifrit: { art: 'assets/cards/ifrit.png', portrait: { x: 0.5, y: 0.22, zoom: 2.2 } },
};
export function artFor(cardId)      // → 路徑字串或 null
export function portraitFor(cardId) // → { src, x, y, zoom } 或 null（x/y 為 0..1 焦點,zoom 倍率,預設 0.5/0.25/2.0）
export function elementGradient(element) // → CSS linear-gradient 字串（元素色系深→淺）,未知元素給中性灰
```
- 初始 manifest 全空（本階段就是佔位路線）；helpers 有單元測試。
- 檔頭註解寫清楚「加素材流程」三步驟。

## 2. 卡面元件（`src/ui/cardFrame.js` + CSS）

`cardFrame(card, { level, size = 'full' })` → DOM 節點：
- **art 區**：有 manifest → `<img>`（portrait 參數轉 object-position/scale）；
  無 → 元素漸層底 + 大職業符號（🛡/⚔/✚）+ 元素字。
- **框**：元素色邊框 + 底部名牌（漸層遮罩上疊名字）+ 右上等級章（有 level 才顯示）。
- `size: 'full'`（roster 卡格 / 抽卡結算）與 `'mini'`（編隊格頭像,約 48px 方形）。
- CSS 加 `.cardframe*` 系列與 `@keyframes cardShine`（斜向光帶掃過,抽到卡時播）、
  `cardPop`（彈入）。

**整合**：
- `rosterUI`：卡格頂部加 full 卡面（原名稱/徽章/數值/按鈕保留其下）；編隊格改
  「mini 頭像 + 名字 + 位置/等級」。
- `gachaUI`：抽到卡（`r.type === 'card'`）→ 顯示 cardFrame（cardPop + cardShine）；
  素材結果維持文字列。

## 3. 戰場 2.5D（`src/render/battleScene.js`）

- **景深**：同排三格由上而下 `scale 0.92 / 1.0 / 1.08`（下 = 近 = 大）,並沿排做
  水平錯位（斜隊形）：`x += (indexInRow - 1) * 14 * (team === 0 ? 1 : -1)`。
- **腳底影**：每個 sprite 底下加橢圓影（Graphics ellipse,黑 alpha ~0.35,寬 ~R*1.6）。
- **遮擋排序**：root `sortableChildren = true`,單位 `zIndex = y`（背景 zIndex 極小）。
- **背景升級**：垂直漸層天幕（上深下稍亮）、地平帶（y ~55% 起地面色）、
  2 個大型柔光暈（半透明元素色圓,GSAP 慢速漂移 yoyo）,移除中線改為淡淡地面透視線 2~3 條。
- **戰鬥棋子吃 manifest**：`artFor(cardId)` 有值 → `Assets.load` 該圖,載成後以
  圓形遮罩 Sprite 換掉程序化圓（載入為 async,swap 前檢查 `sprite.destroyed`/場景未拆）;
  無 → 現行程序化圓。棋子上其餘（名牌/條/符號）不變。
- 拆場安全：漂移光暈 tween 於 destroy 殺掉（沿現行 killFx/killTweensOf 慣例）。

## 4. Cut-in 升級（大招帶狀橫幅）

取代 Spec 4 的純文字 banner（fx.banner 保留給其他用途或一併重構,擇一,不留死碼）：
- `cutIn(fxLayer, { name, skillName, color, portrait })`（fx.js 或場景內私有）：
  - 全寬半透明黑帶（高 ~90px,置中）+ 上下元素色細邊線。
  - 左側圓形頭像位：有 portrait（manifest）→ 圖;無 → 元素色圓 + 職業符號。
  - 文字：角色名（小,dim）+ 技能名（大,元素色,粗體黑描邊）,自左滑入 → 停 → 右滑出;
    整段 ~0.65s,對齊 DELAYS.ultimate = 0.7。
  - 帶與文字所有 tween 需 onComplete 銷毀 + 防重複銷毀（仿 floatText）;killFx 能掃到。
- `ultimate` 事件 → ultPulse + screenShake + cutIn（原 banner 呼叫點替換）。

## 5. 檔案

新增：`src/data/assets.js`、`src/data/assets.test.js`、`src/ui/cardFrame.js`
修改：`src/style.css`、`src/ui/rosterUI.js`、`src/ui/gachaUI.js`、
`src/render/battleScene.js`、`src/render/fx.js`

## 6. 測試 / 驗收

- assets helpers 單元測試：manifest 空 → null;塞測試項 → 路徑/預設裁切參數;elementGradient 五元素皆有值且含元素色、未知元素退中性。
- UI/render 層無單元測試：`npm test` 全綠（既有 97）+ `npm run build` 成功。
- 佔位視覺在無任何素材下即成立（全部程序化）;加一張圖 + 一行 manifest 即換皮（人工驗證路徑,寫進 assets.js 檔頭註解）。

## 7. 未來（非本 Spec）

真實卡圖進場（AI 生圖 → public/assets/cards）、稀有度欄位與卡框分級、Spine/幀動畫棋子、
波次/關卡 banner、前後端分離。
