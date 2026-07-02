# Spec 5 — 視覺架構 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** asset manifest（佔位退回程序化）→ 卡面元件（roster/gacha/編隊）→ 2.5D 戰場 → 大招 cut-in 帶狀橫幅。

**Architecture:** 先資料層（manifest + helpers,可測）,再 DOM 元件與整合,再 pixi 場景兩步（2.5D、cut-in）。每任務結束 `npm test` 全綠 + `npm run build` 成功。

**Tech Stack:** JavaScript (ESM)、Vitest、Pixi.js v8、GSAP、原生 DOM + CSS。

## Global Constraints
- `src/data/assets.js` 純模組（不 import pixi/gsap/DOM）。
- 既有測試（97）不得壞;UI/render 層以 build 驗證。
- 無素材時全部程序化佔位即成立;manifest 填一行 + 丟一張圖即換皮（不得寫死任何實際圖檔存在的假設）。
- 元素色沿用 style.css `--fire/--wind/--water/--light/--dark` 與 battleScene `ELEMENT_COLOR`。
- 所有新 GSAP tween 必須可被拆場清理（killFx 慣例/onComplete 防重複銷毀）。
- Spec：`docs/superpowers/specs/2026-07-02-spec5-visual-architecture-design.md`（各任務對應章節,細節以 spec 為準）。
- 每任務 commit,繁中訊息。

---

## Task 1: Asset manifest + helpers（spec §1）

**Files:**
- Create: `src/data/assets.js`、`src/data/assets.test.js`

**Interfaces:**
- Produces: `CARD_ART`（初始空物件）、`artFor(cardId)`、`portraitFor(cardId)`、`elementGradient(element)`。

- [ ] **Step 1: 寫失敗測試**

```js
import { CARD_ART, artFor, portraitFor, elementGradient } from './assets.js';

describe('asset manifest', () => {
  it('無素材 → null', () => {
    expect(artFor('ifrit')).toBe(null);
    expect(portraitFor('ifrit')).toBe(null);
    expect(artFor(undefined)).toBe(null);
  });

  it('有素材 → 路徑與預設裁切參數', () => {
    CARD_ART.__test = { art: 'assets/cards/test.png' };
    try {
      expect(artFor('__test')).toBe('assets/cards/test.png');
      expect(portraitFor('__test')).toEqual({ src: 'assets/cards/test.png', x: 0.5, y: 0.25, zoom: 2.0 });
    } finally { delete CARD_ART.__test; }
  });

  it('portrait 參數可覆寫', () => {
    CARD_ART.__test = { art: 'a.png', portrait: { x: 0.4, y: 0.1, zoom: 3 } };
    try {
      expect(portraitFor('__test')).toEqual({ src: 'a.png', x: 0.4, y: 0.1, zoom: 3 });
    } finally { delete CARD_ART.__test; }
  });

  it('elementGradient 五元素皆有值、未知退中性', () => {
    for (const e of ['fire', 'wind', 'water', 'light', 'dark']) {
      expect(elementGradient(e)).toContain('linear-gradient');
    }
    expect(elementGradient('nope')).toContain('linear-gradient');
  });
});
```

- [ ] **Step 2: 確認失敗** — `npx vitest run src/data/assets.test.js`
- [ ] **Step 3: 實作**（檔頭註解寫「加素材三步驟」：1. 丟圖到 `public/assets/cards/<cardId>.png` 2. `CARD_ART` 填一行 3. 重整;portrait 預設 `{ x: 0.5, y: 0.25, zoom: 2.0 }`;元素漸層色以 style.css 變數同色值寫死 hex（css 變數在 pixi 不可用,兩處都要能吃）,深→淺兩段式）
- [ ] **Step 4: 全套件綠** → **Step 5: Commit** — `feat: 素材清單 assets.js（卡圖/頭像/元素漸層,佔位退回機制）`

---

## Task 2: 卡面元件 + roster/gacha 整合（spec §2）

**Files:**
- Create: `src/ui/cardFrame.js`
- Modify: `src/style.css`、`src/ui/rosterUI.js`、`src/ui/gachaUI.js`

**Interfaces:**
- Produces: `cardFrame(card, { level, size = 'full' } = {})` → HTMLElement。
- Consumes: `artFor/portraitFor/elementGradient`、`CLASSES`（職業符號沿 battleScene 的 🛡/⚔/✚）、`ELEMENT_LABEL`。

- [ ] **Step 1: cardFrame 元件**（spec §2 規格：art 區 img-or-漸層+職業符號、元素色框、底部名牌、右上等級章、full/mini 兩尺寸;不含按鈕/數值,那是外層的事）
- [ ] **Step 2: CSS**（`.cardframe`、`.cardframe.mini`、`.cardframe-art`、`.cardframe-name`、`.cardframe-lvl`、`@keyframes cardShine`（斜向光帶,`.cardframe.shine::after` 掃過一次）、`@keyframes cardPop`（scale .7→1 彈入）;色用元素 CSS 變數）
- [ ] **Step 3: rosterUI 整合** — 卡格 `.card` 頂部插 full 卡面（原 card-head/badge/stats/actions 保留其下,名稱與等級已在卡面上的可簡併,避免重複顯示兩次名字——卡面為主,移除原 `card-head`,badge/stats/actions 保留）;編隊 `.slot.filled` 改「mini 卡面 + 原 slot-sub 文案」。
- [ ] **Step 4: gachaUI 整合** — `_resultEl`：單抽抽到卡 → cardFrame full + `cardPop`+`shine`;十連 → 卡結果排成小格（mini 或縮小 full,自行判斷版面）,素材結果維持文字列。
- [ ] **Step 5: 驗證** — `npm test` 全綠、`npm run build` 成功。
- [ ] **Step 6: Commit** — `feat: 卡面元件 cardFrame（manifest 圖/程序化佔位）,roster/編隊/抽卡換裝`

---

## Task 3: 戰場 2.5D（spec §3）

**Files:**
- Modify: `src/render/battleScene.js`

**Interfaces:**
- Consumes: `artFor(cardId)`（setup 快照有 cardId）、pixi `Assets`/`Sprite`/遮罩。

- [ ] **Step 1: 景深與錯位** — `_layoutFor` 加水平錯位 `x += (indexInRow - 1) * 14 * (team === 0 ? 1 : -1)`;`_buildUnits` 依 indexInRow 設 `sprite.scale.set(0.92/1.0/1.08)`（注意:deathFade/ultPulse 動 scale——把基準 scale 存 `sprite._baseScale`,fx 內比例動畫改以倍率計,或最小改法:ultPulse 用 `sprite._baseScale*1.3` 回到 `_baseScale`,deathFade 目標 `*0.85`,resetVisual 還原 `_baseScale`;fx.js 對應調整）。
- [ ] **Step 2: 腳底影 + 遮擋** — 每 sprite 內部 index 0 加橢圓影（黑 alpha .35,y = R+4,寬 R*1.6,高 R*0.45）;root `sortableChildren = true`,單位 `zIndex = sprite.y`,背景 `zIndex = -1000`。
- [ ] **Step 3: 背景升級** — `_drawBackground`：垂直漸層天幕（可用多段 rect 疊 alpha 或 FillGradient）、地平帶（y 55% 起稍亮地面色）、2~3 條淡透視地面線;2 個柔光暈（元素色大圓 alpha ~0.06,GSAP 慢速漂移 yoyo repeat -1,存參考、destroy 時 killTweensOf）。
- [ ] **Step 4: 棋子吃 manifest** — `artFor(info.cardId)` 有值 → `Assets.load(path).then(...)` 成功後:若場景未拆（設 `this._destroyed` 旗標）且 sprite 未 destroy,建圓形遮罩 Sprite（半徑 R,cover 縮放置中）取代程序化圓 body（保留 stroke 圈線),`_body` 引用更新（hitFlash tint 對象）;載入失敗 silently 留程序化圓。無素材（現況全部)完全走現行路徑。
- [ ] **Step 5: 驗證** — `npm test` 全綠、`npm run build` 成功。
- [ ] **Step 6: Commit** — `feat: 戰場 2.5D（景深縮放/斜隊形/腳底影/漸層天幕/棋子可吃卡圖）`

---

## Task 4: 大招 cut-in 帶狀橫幅（spec §4）

**Files:**
- Modify: `src/render/fx.js`、`src/render/battleScene.js`

**Interfaces:**
- Produces: fx `cutIn(layer, stageW, { name, skillName, color, glyph })`（DOM 無關,pixi 物件在函式內建立;portrait 版本後續素材到位再擴充——本階段左圓 = 元素色圓 + 職業符號）。
- Replaces: Spec 4 的 `banner`（呼叫點只剩 ultimate → 直接改造 `banner` 為 `cutIn` 或移除 banner,不留死碼）。

- [ ] **Step 1: cutIn 實作**（spec §4:全寬半透明黑帶高 ~90、上下元素色邊線、左圓頭像位、角色名小字 + 技能名大字滑入→停→滑出,總長 ~0.65s;所有物件 onComplete 銷毀 + 防重複、可被 killFx 掃到——注意 killFx 目前殺 child 與 child.scale,cutIn 若動 container.x 也涵蓋）
- [ ] **Step 2: battleScene ultimate handler 換用 cutIn**（帶入 `_info.name`、`SKILLS[skill]?.name ?? skill`、元素色、職業符號;ultPulse/screenShake 保留)。banner 若無其他呼叫點 → 刪除。
- [ ] **Step 3: 驗證** — `npm test` 全綠、`npm run build` 成功、`grep -n "banner" src` 確認無死碼。
- [ ] **Step 4: Commit** — `feat: 大招 cut-in 帶狀橫幅（角色名+技能名+元素色,對齊 0.7s 節奏）`

---

## Task 5: 療癒手遊風主題換裝（AFK Arena 風,使用者 2026-07-02 定調）

**Files:**
- Modify: `src/style.css`、`src/render/battleScene.js`（背景/棋子配色微調）

**Interfaces:**
- 純視覺,不改任何行為/結構/測試。

**風格基準（劍與遠征療癒手遊風）：**
- 底色從冷黑navy → 深藍偏暖（如 #1a2032 系）,面板帶一點紫暖調;金色 accent 保留並加強存在感。
- 圓角加大（按鈕/卡面/面板 10→14px 級）,按鈕加軟陰影與上亮下暗漸層（立體糖果感）,hover 微浮起。
- 卡面名牌/等級章用暖金框;元素漸層飽和但柔（避免螢光）。
- Tabs 改圓潤膠囊感;HUD 貨幣列加小圓底。
- 戰場：天幕漸層調暖（暮藍→暖紫調）,地面帶暖棕綠,柔光暈色調偏暖;透視線更淡。
- 動效原則已符合（back/elastic ease 保留）。

- [ ] **Step 1: style.css 主題變數與元件全面調整**（:root 色票、按鈕、tabs、卡面、slot、gacha 結果框）
- [ ] **Step 2: battleScene 背景/影/光暈配色調暖**
- [ ] **Step 3: 驗證** — `npm test` 全綠、`npm run build` 成功。
- [ ] **Step 4: Commit** — `style: 全域換裝療癒手遊風（暖色票/大圓角/軟陰影/金點綴）`

---

## Self-Review
- Spec §1→T1、§2→T2、§3→T3、§4→T4;檔案清單吻合。
- 佔位優先:manifest 全空下每條路徑皆程序化成立;T3 Step 4 的 async 載圖有拆場/失敗防護。
- 風險:fx scale 動畫 vs 景深基準 scale 衝突已在 T3 Step 1 指定 `_baseScale` 方案;cut-in 清理沿 killFx 慣例。
- 相依:T2 依 T1;T3/T4 依 T1 與彼此獨立但同檔（battleScene）→ 依序執行。
