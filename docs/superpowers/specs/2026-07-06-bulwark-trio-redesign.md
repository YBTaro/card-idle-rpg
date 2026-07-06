# Spec — 壁壘三卡改版（Bulwark Trio Redesign）

日期：2026-07-06
分支：`feat/damage-gated-hostile-effects`（接續本 session）
狀態：已定案（使用者逐項確認），實作中

## 目標

重做三張水系坦克的主動技與光環被動，並補上其所需的新引擎機制。

## 新增引擎機制

1. **DEF 基準傷害** `basis:'selfDef'`：傷害以施放者**防禦力**計算（`base = effDef × mult`），
   預設仍為 `effAtk`。貫穿 `damage.js computeDamage` ← `effects.js dealDamage` ← damage 效果。
1b. **最大生命%傷害** `basis:'targetMaxHp'`：定額直傷 = 目標最大生命 × mult（走 `dealDirect`，
   繞防禦/屬性/超充/暴擊；支援 lifesteal）。龍鱗壁主動用。
2. **無屬性傷害** `noElement:true`：跳過屬性相剋與屬性抗性（`elemMult=1, elemRes=1`）。
3. **多門檻血線觸發**：`hpBelow` 支援 `pcts:[0.75,0.5,0.25]`，各門檻**首次跌破各觸發一次**
   （一條 trigger 承載，符合「每卡 1 trigger」治理）。
4. **普攻掛載 buff（盾襲）** `kind:'atkRider'`：持有者普攻命中後，額外對該目標造成
   **目標最大生命 × pct** 的傷害（`ignoreDef + noElement`）；由 `normalAttack` 讀取結算。

（吸血：damage 效果既有 `lifesteal`，觸發傷害走同一 `applyEffect` damage case，直接沿用。）

## 卡片改動

### 龍晶壁壘 drakebastion（skill wyrmBulwark）
- **主動「龍鱗壁」完全取代**：對敵前排造成**目標最大生命 20%** 的定額傷害
  （繞防禦/屬性/超充/暴擊；`basis:'targetMaxHp'`）。
  ```js
  wyrmBulwark: { name: '龍鱗壁', target: 'enemyFrontRow', effects: [
    { type: 'damage', mult: 0.2, basis: 'targetMaxHp', scope: 'target' },
  ]},
  ```
  （2026-07-06 追加：原 `basis:'selfDef'` 100% 改為 `basis:'targetMaxHp'` 20%；DEF 基準機制仍由被動沿用。）
- **被動 多門檻觸發**（cards.js `triggers`）：自身血量首次跌破 75% / 50% / 25% 各一次 →
  對敵全體造成**自身防禦力 200%**、無視防禦、**無屬性**傷害，**吸血 30%**。
  ```js
  triggers: [{ name: '崩壁反噬', on: 'hpBelow', pcts: [0.75, 0.5, 0.25], who: 'self',
    effects: [{ type: 'damage', mult: 2.0, basis: 'selfDef', ignoreDef: true, noElement: true, lifesteal: 0.3, scope: 'allEnemies' }] }]
  ```
  （原被動「生命<50% 自身防禦+30%」移除——改為此觸發軸；仍是單一被動軸。）

### 珠貝衛士 pearlguard（skill pearlBulwark）
- **主動「貝盾」改成**：為我方**坦克**附加 2 回合「盾襲」——普攻額外造成**目標最大生命 10%**
  （**機械族坦克 20%**）、無視防禦、無屬性傷害。原全體護盾**移除**。
  ```js
  pearlBulwark: { name: '貝盾', effects: [
    { type: 'atkRider', pctMaxHp: 0.10, duration: 2, scope: 'allAllies', where: { class: 'tank' } },
    { type: 'atkRider', pctMaxHp: 0.20, duration: 2, scope: 'allAllies', where: { class: 'tank', race: '機械' } },
  ]},
  ```
  （同 `key` → 機械坦克的 20% 覆蓋 10%；非機械坦克保留 10%。）
- 被動不動（我方機械承傷 -15%）。

### 堡壘引擎 bulwarkengine（skill aegisProtocol）
- **主動「壁壘協定」保留護盾 + 新增全體格擋**：
  ```js
  aegisProtocol: { name: '壁壘協定', effects: [
    { type: 'shield', power: 1.8, duration: 3, scope: 'frontAllies' },
    { type: 'debuffBlock', charges: 1, duration: 3, scope: 'allAllies' },
  ]},
  ```
- **被動改成**：我方**全體「水」屬**單位抗暴 +15%（原自身 +25%）。
  ```js
  passives: [{ target: 'allAllies', targetWhere: { element: 'water' }, effects: [{ stat: 'critRes', op: 'add', value: 0.15 }] }]
  ```

## 說明文字（skillText）

- DEF 基準傷害：`對…造成自身防禦力 X% 的傷害`（basis:'selfDef' 時將「攻擊力」改「防禦力」）。
- 無屬性：附註「（無屬性）」；無視防禦既有「（無視防禦）」。
- atkRider：`為…附加盾襲（普攻額外造成目標最大生命 X% 的無視防禦無屬性傷害，持續 N 次行動）`。
- 多門檻觸發：`自身血量首次跌破 75%/50%/25% 時各一次：…`。

## 測試

- DEF 基準：`effDef×mult`（配合無視防禦/無屬性驗算）。
- 無屬性：剋制屬性下傷害不變（elemMult 不生效）。
- 多門檻：跌破 75/50/25 各觸發一次、同門檻不重觸發、回血後再破仍不重觸（首次語義）。
- atkRider：坦克普攻額外扣目標 10%/20% 最大生命；非坦克無效；持續 2 回合後消失。
- 三卡資料：castSkill/passive 產生預期狀態；skillText 產出對應文字。
- 全套回歸綠燈。
