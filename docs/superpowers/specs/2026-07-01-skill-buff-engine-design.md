# Spec 2 — 可擴充技能 / Buff 引擎（Skill & Buff Engine）

日期：2026-07-01
分支：`claude/skill-buff-system`
狀態：待審
前置：Spec 1（回合制戰鬥核心，已合併 main）

## 背景與目標

Spec 1 完成回合制戰鬥核心。目前技能仍是 3 個寫死的職業大招（`guard`/`burst`/`heal`），
buff 只有一種 `{ type:'guard', mult, rounds }`，`damage.js` 直接讀 `attacker.atk` 與傳入的
`guardMult`。

本 Spec 建立**資料驅動、可組合**的技能/Buff 引擎,讓日後新增各式各樣技能時
「只加資料、不動引擎」。範圍限定「引擎基礎設施」:

- 通用 **Buff 容器** + **有效值 resolver**
- **效果原語 (effect handlers)**:damage / heal / buff / dot / shield / energy
- **技能即資料** (`SKILLS` registry) + `castSkill`,並把現有 3 大招改寫成資料以驗證等價
- **目標選擇器 registry** + 列型/直排退位
- 把 buff 有效值接進 `damage.js` 與集氣

**明確排除(留 Spec 3)**:每卡專屬技能內容、嘲諷 (taunt)、控場 (暈眩/沉默) 等控制類效果、
更多具體技能。本 Spec 只做能承載它們的引擎與少量示範。

---

## 1. 通用 Buff 容器與有效值 resolver（新 `src/battle/buffs.js`）

每個單位持有 `unit.buffs: Array<BuffEntry>`。三種 `kind`:

```js
// 屬性修正
{ kind: 'stat', stat, op: 'mul'|'add', value, duration, key, stackable }
// 持續傷害（套用時已預算好每跳 damage）
{ kind: 'dot', damage, element, duration, key, stackable }
// 護盾（吸收池）
{ kind: 'shield', amount, duration, key, stackable }
```

- `duration`:以**行動次數**計；帶者每次出手後 −1,歸零移除（見 §5 引擎）。
- `key`:同 key 的套用行為——
  - 預設(`stackable` 省略/false):**取代刷新**(移除同 key 舊項,推入新項)。
  - `stackable: true`:**併存**(可多層,全部生效)。
- `element`(DoT 用):結算傷害時的屬性;省略則視為無屬性(倍率 1.0)。

### 有效值 resolver

單一核心函式聚合 `kind:'stat'` 修正:

```js
// base × (所有符合 stat 的 mul 相乘) + (所有 add 相加)
resolve(unit, stat, base) => base * Π(mul) + Σ(add)
```

對外有效值(供 `damage.js`、集氣、UI 讀):

| 有效值 | 定義 | base |
|---|---|---|
| `effAtk(u)` | `round(resolve(u,'atk',u.atk))` | 職業修正後 atk |
| `effDef(u)` | `round(resolve(u,'def',u.def))` | 職業修正後 def |
| `critChance(u)` | `clamp01(resolve(u,'critChance',CRIT_CHANCE))` | 0.1 |
| `critMult(u)` | `resolve(u,'critMult',CRIT_MULT)` | 1.5 |
| `dmgTakenMult(u)` | `resolve(u,'dmgTaken',1)` | 1 |
| `dmgDealtMult(u)` | `resolve(u,'dmgDealt',1)` | 1 |
| `energyGainMult(u)` | `resolve(u,'energyGain',1)` | 1 |

> `dmgTaken`/`dmgDealt`/`energyGain` 通常只用 `mul`(相乘);`crit*` 通常只用 `add`。resolver 對兩種 op 都支援。

### `buffs.js` 對外介面

```js
applyBuff(unit, spec)          // 依 key/stackable 取代或併存
tickBuffs(unit)                // 帶者出手後：所有 buff.duration -= 1，移除 <=0，回傳是否有變動
resolve(unit, stat, base)      // 聚合
absorbWithShields(unit, amount)// 先扣護盾池，回傳 { remaining, absorbed }（供 unit.takeDamage 用）
dotEntries(unit)               // 回傳 kind:'dot' 清單（供引擎在帶者出手前結算）
```

`buffs.js` 為純模組（不 import pixi/gsap/DOM）。

---

## 2. 效果原語（新 `src/battle/effects.js`）

一個技能由多個 **effect** 組成。**每個 effect 必填 `scope`(不預設繼承)**。

> **數值約定(全域)**:效果數值 `power` 是百分比,乘上一個**基準值**。基準由可選欄位 `basis` 決定:
> - `basis` **省略(預設)** → `caster.effAtk × power`(治療/護盾/DoT/大多數技能都用這個)
> - `basis: 'targetMaxHp'` → `target.maxHp × power`(給「%最大生命」類,例:中毒每跳扣目標 10% maxHp)
> - (日後可再擴充 `casterMaxHp` 等;新增基準 = 在 value 解析器加一個 case)
>
> `damage` 的 `mult` 同一套(預設 `base = caster.effAtk × mult`)。**用一個共用的 `resolvePower(effect, caster, target)` 解析,集中此邏輯**,新增基準時只改一處。具體的 %maxHp 技能內容屬 Spec 3;本 Spec 只確保引擎支援 `basis` 欄位並實作 `targetMaxHp` 一種以驗證擴充點。

### scope（作用對象,相對 caster 與技能主目標 `primary`）

`self` / `target`(技能 `target` 選擇器結果) / `allAllies` / `allEnemies` / `alliesExceptTarget`。
以 `resolveScope(scope, caster, primary, ctx) => Unit[]`(存活過濾)解析。

### 效果類型（`applyEffect(effect, caster, units, ctx)` 依 `type` 分派）

| type | 欄位 | 行為 |
|---|---|---|
| `damage` | `mult` | 對 `units` 每個呼叫 `dealDamage(caster, u, mult, ctx)`(走 §4 完整公式:`base = caster.effAtk × mult`,吃防禦/屬性/暴擊)。`%maxHp` 類傷害請用 `dot` 表達,不走此公式 |
| `heal` | `power, basis?` | 治療量 = `resolvePower(effect, caster, u)`;對 `units` 各 `u.heal()` |
| `buff` | `stat, op, value, duration, key?, stackable?` | 對 `units` 各 `applyBuff` 一個 `kind:'stat'` |
| `dot` | `power, basis?, element?, duration, key?, stackable?` | 對 `units` 各 `applyBuff` 一個 `kind:'dot'`,套用時**預先算好每跳傷害** `damage = round(resolvePower(effect, caster, u) × (element ? elemMult(caster.element,u.element) : 1))` 存入 buff |
| `shield` | `power, basis?, duration?` | 對 `units` 各 `applyBuff` 一個 `kind:'shield'`,`amount = resolvePower(effect, caster, u)` |
| `energy` | `amount`（可負） | 對 `units` 各 `gainEnergy(amount)`（負值即扣能，夾 0） |

> 「debuff」不是獨立 type——就是 `buff`/`dot` 效果搭配 `scope:'allEnemies'|'target'` 與不利數值。

### 共用傷害函式

`dealDamage(caster, target, mult, ctx)`（`effects.js` 匯出,普攻與 damage 效果共用):

1. `res = computeDamage(caster, target, mult, ctx.rng)`（§4 已讀有效值）
2. 先扣護盾:`{ remaining } = target.takeDamage(res.amount)`（`takeDamage` 內部走護盾,見 §5）
3. 被擊回能:`target.gainEnergy(target.classDef.energyOnHitTaken)`
4. `ctx.emit('damage', { source, target, amount, skill, isAdvantage, isDisadvantage, isCrit })`
5. `if (!target.alive) ctx.emit('death', { unit: target })`

`dealDot(target, dot, ctx)`:套用預存的 `dot.damage`(不吃暴擊/浮動),扣血(不吃護盾)、發 `damage`(標記 `skill:'dot'`)、死亡事件。

`resolvePower(effect, caster, target)`:集中的基準解析——`basis` 省略 → `caster.effAtk × power`;
`'targetMaxHp'` → `target.maxHp × power`;回傳數值(未 round,由呼叫端決定)。新增基準只改這裡。

`effects.js` 為純模組。

---

## 3. 技能即資料（改寫 `src/battle/skills.js`）

```js
export const SKILLS = {
  burst: { name: '爆發', target: 'singleEnemyByColumn',
    effects: [ { type:'damage', mult: 2.6, scope:'target' } ] },

  guard: { name: '守護',
    effects: [
      { type:'buff', stat:'dmgTaken', op:'mul', value:0.5, duration:2, key:'guard', scope:'allAllies' },
      { type:'heal', power:2.0, scope:'self' }, // 自療 = effAtk×2.0（占位平衡值；原 15% maxHp 改為 atk 制）
    ] },

  heal: { name: '治癒', target: 'lowestHpAlly',
    effects: [
      { type:'heal', power:3.0, scope:'target' },              // 主目標 = effAtk×3.0
      { type:'heal', power:1.2, scope:'alliesExceptTarget' },  // 其餘 = effAtk×1.2
    ] },
};
```

### `castSkill(caster, skillId, ctx)`

1. `def = SKILLS[skillId]`
2. `primary = def.target ? SELECTORS[def.target](caster, ctx) : []`（回傳陣列;單體選擇器回傳 `[unit]` 或 `[]`）
3. `ctx.emit('ultimate', { caster, skill: skillId, target: primary[0] })`
4. 逐一 `effect`:`units = resolveScope(effect.scope, caster, primary, ctx)`;`applyEffect(effect, caster, units, ctx)`

### `skillFor(unit)`

目前仍由 `unit.classDef.ultimate` → skillId(即 `'guard'|'burst'|'heal'`)。每卡專屬技(cardId→skillId)留 Spec 3。

### `normalAttack(caster, ctx)`（保留為普攻,共用 `dealDamage`）

```js
const target = singleEnemyByColumn(caster, ctx.enemies);
if (!target) return;
ctx.emit('attack', { attacker: caster, target, skill: 'normal' });
dealDamage(caster, target, 1.0, ctx);           // 共用 effects.dealDamage
caster.gainEnergy(caster.classDef.energyOnAction);
for (const ally of ctx.allies) {                // 隊友集氣
  if (ally === caster || !ally.alive) continue;
  const g = ally.classDef.energyOnAllyAction || 0;
  if (g) ally.gainEnergy(g);
}
```

> 移除舊 `applyDamage`/`activeGuardMult`（減傷改由 `defender.dmgTakenMult()` 走 buff 系統）與 `ULTIMATES`/`ultimateFor`/`ULT` 常數;等價數值移進 `SKILLS` 資料。

---

## 4. 傷害公式接有效值（改 `src/battle/damage.js`）

`computeDamage(attacker, defender, mult, rng)`（**移除 `guardMult` 參數**,改讀有效值）:

```
base      = attacker.effAtk × mult
afterDef  = max(base×0.15, base − defender.effDef×0.75)
isCrit    = rng.next() < attacker.critChance
critMult  = isCrit ? attacker.critMult : 1
raw = afterDef × elemMult × defender.dmgTakenMult × attacker.dmgDealtMult × variance × critMult × DAMAGE_GLOBAL
```

- 擲骰順序不變:variance 先、crit 後。
- 常數 `CRIT_CHANCE`/`CRIT_MULT`/`DAMAGE_GLOBAL`/`DAMAGE_VARIANCE` 保留(作為 base 與全域係數)。

---

## 5. Unit 接線（改 `src/battle/unit.js`）與引擎（改 `src/battle/engine.js`）

### Unit

- 有效值 getter,委派 `buffs.js`:`effAtk / effDef / critChance / critMult / dmgTakenMult / dmgDealtMult / energyGainMult`。
- `gainEnergy(amount)`:`this.energy = min(MAX, this.energy + round(amount × energyGainMult))`。
- `takeDamage(amount)`:先經 `buffs.absorbWithShields(this, amount)` 扣護盾,再扣 hp;回傳實際扣血。
- 保留 `unit.buffs`(Spec 1 已有欄位);移除 Spec 1 暫行的 `{type:'guard',...}` 讀取路徑。

### 引擎

- 移除 Spec 1 的**每輪** `_tickRoundBuffs`。改成**每次出手**在 `_act(u, isSkill)` 內處理:
  1. **出手前**:結算 `u` 身上的 DoT(`buffs.dotEntries(u)` → `effects.dealDot`),並 `_checkEnd()`。
  2. emit `turn`;`isSkill ? (u.energy=0, castSkill(u, skillFor(u), ctx)) : normalAttack(u, ctx)`。
  3. **行動後**:`tickBuffs(u)`(所有 duration −1、移除到期,含 stat/dot/shield);有變動則 emit `buffchange`。
- `ctx` 形狀不變:`{ allies, enemies, rng, emit }`。
- guard 減傷不再需要特別 tick——它就是一個 `kind:'stat' stat:'dmgTaken'` buff,隨帶者行動遞減。

> 註:guard buff 現在依「帶者行動次數」遞減(Spec 1 是每輪),語意更貼近 Spec 2 的行動次數模型;數值 `duration:2` 沿用。

---

## 6. 目標選擇器 registry（擴充 `src/battle/targeting.js`）

`SELECTORS` 對照表(key → `(caster, ctx) => Unit[]`,存活過濾):

| key | 回傳 |
|---|---|
| `singleEnemyByColumn` | Spec 1 規則,單體 → `[unit]` 或 `[]` |
| `enemyFrontRow` | 敵方存活前排;**全空→退位打後排** |
| `enemyBackRow` | 敵方存活後排;**全空→退位打前排** |
| `enemyColumn` | 攻擊者直行的敵方整排;**該直行全空→就近往小號直行** |
| `allEnemies` | 敵方全部存活 |
| `allAllies` | 我方全部存活 |
| `lowestHpAlly` | 我方血比例最低(單體 `[unit]`) |
| `oneAlly` | 我方隨機一個(`ctx.rng`) |
| `self` | `[caster]` |

- **列型退位**:`enemyFrontRow`/`enemyBackRow` 指定排全空 → 自動轉另一排。
- **直排退位**:`enemyColumn` 指定直行全空 → 就近往小號的有人直行(B→A→C、A→B→C、C→B→A)。
- `resolveScope` 重用這些:`allAllies/allEnemies/self` 直接對應;`target` = 傳入的 `primary`;
  `alliesExceptTarget` = `allAllies` 去掉 `primary`。

---

## 7. 檔案總覽

**新增**:`buffs.js`、`buffs.test.js`、`effects.js`、`effects.test.js`
**修改**:`skills.js`(SKILLS/castSkill/normalAttack/skillFor)、`skills.test.js`、
`targeting.js`(SELECTORS + 退位)、`targeting.test.js`、`damage.js`(讀有效值)、`damage.test.js`、
`unit.js`(有效值 getter/護盾/energyGainMult)、`engine.js`(每次出手結算 buff/DoT)、`engine.test.js`
**不動**:每卡技能資料、嘲諷/控場(Spec 3)、渲染層(事件不變;暴擊/DoT 數字沿用現有 `damage` 事件)

---

## 8. 測試 / 驗收

- **Parity(等價)**:`guard`/`burst`/`heal` 改資料後,行為與 Spec 1 等價(治療改 atk 制除外)——
  - `burst` 對直行單體造成 `effAtk×2.6`;`guard` 給全隊 `dmgTaken×0.5`(2 次行動)且自療 `effAtk×2.0`;
    `heal` 主目標 `effAtk×3.0`、其餘隊友 `effAtk×1.2`。以測試斷言。
  - 註:所有治療改為「% × 自身 effAtk」,故 `guard` 自療由 Spec 1 的 15% maxHp 改為 atk 制(刻意)。
- **有效值 resolver**:mul 相乘/add 相加;同 key 取代;`stackable` 併存(單元測試)。
- **damage 接線**:atk-buff 提升傷害、`dmgTaken` buff 降低受傷、crit-buff 提升暴擊率/傷害(以 fake rng)。
- **DoT**:上 DoT 後,帶者每次出手前扣固定傷害,duration 用完停止。
- **basis 擴充點**:`resolvePower` 預設 `caster.effAtk × power`;`basis:'targetMaxHp'` → `target.maxHp × power`
  (例:每跳扣目標 10% maxHp 的中毒),以測試斷言兩種基準各自正確。
- **shield**:護盾吸收傷害後才扣血;護盾用盡/到期後恢復正常受傷。
- **集氣速度**:`energyGain×1.5` buff 下,普攻回能為 1.5 倍。
- **退位選擇器**:前/後排、直排退位各案例。
- 全套件綠;`npm run build` 成功。

---

## Spec 3 預覽（非本 Spec 範圍）

- 每卡專屬主動技(cardId → skillId)與技能內容庫。
- 控制類效果:嘲諷(選擇器前插入 taunt 覆蓋層)、暈眩(跳過出手)、沉默(禁技能)。
- **種族 (race)**:卡片/單位新增 `race` 標籤(如 人/妖/龍/機械…)。**種族之間無相剋**
  (純分類標籤,不像 element 有循環剋制),僅供條件過濾與種族專屬效果使用。
- **通用條件過濾 `where`**(關鍵擴充點):效果與選擇器可帶可選 `where` 條件,依單位屬性
  過濾目標集合——支援 `race` / `element` / `row`(前後排) / `class` 等,可組合。範例:
  - 對種族加傷:`{ type:'damage', mult:1.3, scope:'target', where:{ race:'undead' } }`
  - 種族限定 buff/debuff:`{ type:'buff', stat:'atk', op:'mul', value:1.2, scope:'allAllies', where:{ race:'dragon' } }`
  - 條件不限種族:`where:{ element:'fire' }`、`where:{ row:'back' }` 等各種變化皆走同一機制。
- **被動 / 光環類技能**:如「場上每有一位同族,全隊 +攻」等統計/常駐效果(需引擎支援被動掛勾)。
- 更多選擇器與效果類型按需擴充。
