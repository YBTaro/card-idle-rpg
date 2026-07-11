# 試煉塔改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把單軌爬塔改成 6 座屬性主題塔、自由跳關 1–80 關、等級＝關數、每 5 倍數關為手工強隊的挑戰系統。

**Architecture:** 新增兩支純資料檔（塔定義 `towerTracks.js`、精心隊表 `towerTeams.js`），改寫 `systems/tower.js` 的難度與敵隊生成（Boss 關查表、路關確定性隨機），進度改為每塔獨立的 `cleared` 集合以支援跳關，最後改寫 `ui/towerUI.js` 成「選塔頁 → 關卡格」兩級畫面。

**Tech Stack:** 原生 ES modules、vitest 測試、既有 `Unit`/`deriveStats`/`simulateBattle`/`Rng`/環境系統。零新依賴。

## Global Constraints

- 純前端模擬，不經伺服器（與推關同原則）。
- 關卡範圍固定 `1–80`；`BOSS_EVERY = 5`；玩家滿級 `MAX_LEVEL = 60`（敵人 61–80 刻意超上限）。
- 站位規則：`melee → 前排(1–3)`、`support/ranged → 後排(4–6)`，滿了溢位（沿用 `buildEnemyUnits` 既有邏輯）。
- 塔 id 與環境 id 同名：`sunny/rain/gale/surge/erosion/swamp`；主題屬性 `fire/water/wind/light/dark/dot`。
- 敵隊生成需**確定性**：同 (塔,關) 永遠同隊（路關用 `Rng(雜湊(trackId)+floor)`）。
- 新測試放 `src/**/*.test.js`（vitest `include` 已涵蓋）。

---

## 檔案結構

- **Create** `src/data/towerTracks.js` — 6 座塔定義與 `trackEnv`。
- **Create** `src/data/towerTeams.js` — 精心隊表 + `bossTeamFor`。
- **Create** `src/data/towerTeams.test.js` — 隊伍靜態約束驗證。
- **Modify** `src/systems/tower.js` — 難度函式、`floorEnemies(trackId,floor)`、進度/挑戰改為每塔。
- **Modify** `src/systems/tower.test.js` — 對齊新簽名。
- **Modify** `src/core/save.js:64` — 舊 `{floor}` 遷移到 `{tracks:{...}}`。
- **Modify** `src/ui/towerUI.js` — 兩級畫面（選塔 → 關卡格 → 挑戰）。

---

### Task 1: 塔定義 `towerTracks.js`

**Files:**
- Create: `src/data/towerTracks.js`
- Test: `src/data/towerTracks.test.js`

**Interfaces:**
- Produces:
  - `TOWER_TRACKS: Array<{id,name,envKind:'weather'|'terrain',theme,color}>`（6 筆）
  - `TRACK_BY_ID: Record<string, track>`
  - `trackEnv(trackId): { weather: string|null, terrain: string|null }`

- [ ] **Step 1: 寫失敗測試**

```js
// src/data/towerTracks.test.js
import { describe, it, expect } from 'vitest';
import { TOWER_TRACKS, TRACK_BY_ID, trackEnv } from './towerTracks.js';

describe('towerTracks', () => {
  it('六座塔、id 唯一、主題覆蓋五屬 + dot', () => {
    expect(TOWER_TRACKS).toHaveLength(6);
    const ids = TOWER_TRACKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(6);
    expect(new Set(TOWER_TRACKS.map((t) => t.theme)))
      .toEqual(new Set(['fire', 'water', 'wind', 'light', 'dark', 'dot']));
  });
  it('trackEnv：天氣塔只給 weather、場地塔只給 terrain', () => {
    expect(trackEnv('sunny')).toEqual({ weather: 'sunny', terrain: null });
    expect(trackEnv('surge')).toEqual({ weather: null, terrain: 'surge' });
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run src/data/towerTracks.test.js`
Expected: FAIL（找不到模組 `./towerTracks.js`）

- [ ] **Step 3: 實作**

```js
// src/data/towerTracks.js
// 6 座屬性主題塔：每座＝一種固定環境（天氣或場地），對應一個吃香主題。
export const TOWER_TRACKS = [
  { id: 'sunny',   name: '烈日塔', envKind: 'weather', theme: 'fire',  color: '#ff9a5c' },
  { id: 'rain',    name: '暴雨塔', envKind: 'weather', theme: 'water', color: '#7cc4ff' },
  { id: 'gale',    name: '颶風塔', envKind: 'weather', theme: 'wind',  color: '#8ef2ae' },
  { id: 'surge',   name: '湧能塔', envKind: 'terrain', theme: 'light', color: '#f5c451' },
  { id: 'erosion', name: '侵蝕塔', envKind: 'terrain', theme: 'dark',  color: '#c97b8e' },
  { id: 'swamp',   name: '沼澤塔', envKind: 'terrain', theme: 'dot',   color: '#9d8ec9' },
];

export const TRACK_BY_ID = Object.fromEntries(TOWER_TRACKS.map((t) => [t.id, t]));

// 塔 id 與環境 id 同名 → 直接組成戰鬥環境（另一槽為 null）。
export function trackEnv(trackId) {
  const t = TRACK_BY_ID[trackId];
  if (!t) return { weather: null, terrain: null };
  return t.envKind === 'weather'
    ? { weather: t.id, terrain: null }
    : { weather: null, terrain: t.id };
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run src/data/towerTracks.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/towerTracks.js src/data/towerTracks.test.js
git commit -m "feat(tower): 6 座主題塔定義與環境解析"
```

---

### Task 2: 精心隊表 `towerTeams.js`

**Files:**
- Create: `src/data/towerTeams.js`
- Test: `src/data/towerTeams.test.js`

**Interfaces:**
- Consumes: `CARDS`（`src/data/cards.js`）、`CARD_SKILLS`（`src/battle/skills.js`）驗證用。
- Produces:
  - `TRACK_TEAMS: Record<trackId, { low: string[][], mid: string[][], apex: Record<60|65|70|75|80, string[]> }>`
  - `bossTeamFor(trackId, floor): string[]`（回 6 個 cardId；`floor` 必為 5 的倍數）

- [ ] **Step 1: 寫失敗測試（靜態約束）**

```js
// src/data/towerTeams.test.js
import { describe, it, expect } from 'vitest';
import { TRACK_TEAMS, bossTeamFor } from './towerTeams.js';
import { TOWER_TRACKS } from './towerTracks.js';
import { CARDS } from './cards.js';
import { CARD_SKILLS, SKILLS } from '../battle/skills.js';

// 會產生 dot / nightmare 的技能（沼澤塔「搭配」＝毒隊的判準）
const DOT_SKILLS = new Set(
  Object.entries(SKILLS)
    .filter(([, def]) => def.effects.some((e) => e.type === 'dot' || e.type === 'nightmare' || e.type === 'detonateDot' || e.type === 'extend'))
    .map(([id]) => id)
);
const carriesDot = (cardId) => {
  const c = CARDS[cardId];
  return DOT_SKILLS.has(CARD_SKILLS[cardId]) || Boolean(c.onEnter?.effects?.some((e) => e.type === 'dot'));
};

describe('towerTeams', () => {
  it('每座塔都有 low(2)/mid(3)/apex(60,65,70,75,80)', () => {
    for (const t of TOWER_TRACKS) {
      const T = TRACK_TEAMS[t.id];
      expect(T.low).toHaveLength(2);
      expect(T.mid).toHaveLength(3);
      expect(Object.keys(T.apex).map(Number).sort((a, b) => a - b)).toEqual([60, 65, 70, 75, 80]);
    }
  });

  it('每支隊 6 名、cardId 皆存在', () => {
    for (const t of TOWER_TRACKS) {
      const T = TRACK_TEAMS[t.id];
      const teams = [...T.low, ...T.mid, ...Object.values(T.apex)];
      for (const team of teams) {
        expect(team).toHaveLength(6);
        for (const id of team) expect(CARDS[id], `${t.id}:${id}`).toBeTruthy();
      }
    }
  });

  it('屬性塔 apex 全隊＝主題屬性；沼澤塔 apex ≥3 名帶毒', () => {
    for (const t of TOWER_TRACKS) {
      for (const team of Object.values(TRACK_TEAMS[t.id].apex)) {
        if (t.theme === 'dot') {
          expect(team.filter(carriesDot).length, `${t.id} dot`).toBeGreaterThanOrEqual(3);
        } else {
          for (const id of team) expect(CARDS[id].element, `${t.id}:${id}`).toBe(t.theme);
        }
      }
    }
  });

  it('bossTeamFor：分段對照', () => {
    expect(bossTeamFor('sunny', 15)).toEqual(TRACK_TEAMS.sunny.low[0]); // n=3 奇
    expect(bossTeamFor('sunny', 10)).toEqual(TRACK_TEAMS.sunny.low[1]); // n=2 偶
    expect(bossTeamFor('sunny', 40)).toEqual(TRACK_TEAMS.sunny.mid[2]); // n=8, 8%3=2
    expect(bossTeamFor('sunny', 80)).toEqual(TRACK_TEAMS.sunny.apex[80]);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run src/data/towerTeams.test.js`
Expected: FAIL（找不到 `./towerTeams.js`）

- [ ] **Step 3: 實作（完整資料）**

```js
// src/data/towerTeams.js
// 精心隊表：每塔 low(2 隊輪替) / mid(3 隊輪替) / apex(60,65,70,75,80 各一)。
// 屬性塔 apex 全隊吃香屬性；沼澤塔 apex 為跨屬性毒隊。隊內順序＝前→後意圖（站位仍由 attackStyle 決定）。
export const TRACK_TEAMS = {
  sunny: {
    low: [
      ['emberguard', 'cinderblade', 'rageclaw', 'emberwitch', 'flarearcher', 'ashpriest'],
      ['redlion', 'magmaturtle', 'ifrit', 'pyrelord', 'flarearcher', 'sunherald'],
    ],
    mid: [
      ['redlion', 'cinderblade', 'emberguard', 'pyrelord', 'emberwitch', 'ashpriest'],
      ['hornchief', 'magmaturtle', 'flamewyrm', 'pyrelord', 'flarearcher', 'sunherald'],
      ['siegemarshal', 'redlion', 'emberguard', 'magmaturtle', 'ironcannon', 'warbanner'],
    ],
    apex: {
      60: ['redlion', 'cinderblade', 'flamewyrm', 'pyrelord', 'emberwitch', 'ashpriest'],
      65: ['siegemarshal', 'redlion', 'emberguard', 'magmaturtle', 'ironcannon', 'warbanner'],
      70: ['hornchief', 'rageclaw', 'magmaturtle', 'pyrelord', 'flarearcher', 'sunherald'],
      75: ['emberguard', 'redlion', 'cinderblade', 'pyrelord', 'emberwitch', 'flarearcher'],
      80: ['redlion', 'emberguard', 'cinderblade', 'pyrelord', 'emberwitch', 'sunherald'],
    },
  },
  rain: {
    low: [
      ['aegis', 'abysshunter', 'mistdancer', 'tidecaller', 'tidesinger', 'coralshaman'],
      ['glacierknight', 'leviathan', 'pearlguard', 'frostmage', 'rainherald', 'mistwarden'],
    ],
    mid: [
      ['aegis', 'drakebastion', 'leviathan', 'frostmage', 'tidecaller', 'rainherald'],
      ['glacierknight', 'mistdancer', 'abysshunter', 'frostmage', 'tidesinger', 'mistwarden'],
      ['pearlguard', 'bulwarkengine', 'aegis', 'tidecaller', 'coralshaman', 'rainherald'],
    ],
    apex: {
      60: ['glacierknight', 'mistdancer', 'drakebastion', 'frostmage', 'tidesinger', 'mistwarden'],
      65: ['aegis', 'pearlguard', 'bulwarkengine', 'tidecaller', 'tidesinger', 'rainherald'],
      70: ['drakebastion', 'leviathan', 'abysshunter', 'frostmage', 'tidecaller', 'coralshaman'],
      75: ['pearlguard', 'bulwarkengine', 'mistdancer', 'frostmage', 'tidesinger', 'mistwarden'],
      80: ['aegis', 'drakebastion', 'leviathan', 'frostmage', 'tidecaller', 'rainherald'],
    },
  },
  gale: {
    low: [
      ['zephyr', 'galeninja', 'grovekeeper', 'tempesthawk', 'galewind', 'windsister'],
      ['stormblade', 'skylancer', 'zephyrmonk', 'huntmarshal', 'galeherald', 'dragonoracle'],
    ],
    mid: [
      ['grovekeeper', 'moonhowler', 'stormblade', 'tempesthawk', 'thundertotem', 'dragonoracle'],
      ['zephyrmonk', 'skylancer', 'galeninja', 'huntmarshal', 'veilwalker', 'wyrmmatriarch'],
      ['grovekeeper', 'zephyr', 'stormblade', 'tempesthawk', 'sylvanqueen', 'windsister'],
    ],
    apex: {
      60: ['grovekeeper', 'zephyrmonk', 'galeninja', 'tempesthawk', 'veilwalker', 'sylvanqueen'],
      65: ['grovekeeper', 'moonhowler', 'stormblade', 'huntmarshal', 'thundertotem', 'dragonoracle'],
      70: ['skylancer', 'zephyr', 'zephyrmonk', 'huntmarshal', 'dragonoracle', 'wyrmmatriarch'],
      75: ['zephyr', 'galeninja', 'stormblade', 'tempesthawk', 'galeherald', 'veilwalker'],
      80: ['grovekeeper', 'zephyrmonk', 'stormblade', 'tempesthawk', 'huntmarshal', 'dragonoracle'],
    },
  },
  surge: {
    low: [
      ['paladin', 'dawnblade', 'holyfencer', 'stargazer', 'seraph', 'dawnharpist'],
      ['radiantgolem', 'suninquisitor', 'sanctumjudge', 'lightweaver', 'dawnmother', 'hawkoracle'],
    ],
    mid: [
      ['sanctumjudge', 'godblade', 'suninquisitor', 'stargazer', 'dawnmother', 'lumenvessel'],
      ['paladin', 'dawnblade', 'holyfencer', 'lightweaver', 'dawnharpist', 'stargazer'],
      ['radiantgolem', 'suninquisitor', 'sanctumjudge', 'stargazer', 'seraph', 'hawkoracle'],
    ],
    apex: {
      60: ['sanctumjudge', 'godblade', 'paladin', 'stargazer', 'dawnmother', 'lumenvessel'],
      65: ['paladin', 'suninquisitor', 'holyfencer', 'lightweaver', 'dawnmother', 'stargazer'],
      70: ['sanctumjudge', 'dawnblade', 'godblade', 'stargazer', 'dawnharpist', 'lumenvessel'],
      75: ['radiantgolem', 'paladin', 'suninquisitor', 'dawnmother', 'seraph', 'hawkoracle'],
      80: ['paladin', 'sanctumjudge', 'godblade', 'stargazer', 'dawnmother', 'dawnharpist'],
    },
  },
  erosion: {
    low: [
      ['gravewarden', 'nightreaper', 'cryptwidow', 'plaguelord', 'shadowpriest', 'soulorganist'],
      ['boneknight', 'nightmare', 'voidshade', 'voidcaller', 'mireweaver', 'knellwitch'],
    ],
    mid: [
      ['deathlessking', 'gravewarden', 'vengefulshade', 'plaguelord', 'voidcaller', 'bonemarshal'],
      ['abysstyrant', 'nightmare', 'mirrorfox', 'plaguelord', 'terrorweaver', 'hexweaver'],
      ['boneknight', 'gravewarden', 'cryptwidow', 'plaguelord', 'voidcaller', 'knellwitch'],
    ],
    apex: {
      60: ['boneknight', 'gravewarden', 'nightreaper', 'plaguelord', 'voidcaller', 'bonemarshal'],
      65: ['abysstyrant', 'nightmare', 'mirrorfox', 'voidcaller', 'terrorweaver', 'hexweaver'],
      70: ['boneknight', 'cryptwidow', 'fluxreaver', 'plaguelord', 'mireweaver', 'knellwitch'],
      75: ['nightreaper', 'voidshade', 'bladeoath', 'voidcaller', 'plaguelord', 'soulorganist'],
      80: ['deathlessking', 'gravewarden', 'vengefulshade', 'plaguelord', 'voidcaller', 'knellwitch'],
    },
  },
  swamp: {
    low: [
      ['magmaturtle', 'cinderblade', 'nightmare', 'plaguelord', 'pyrelord', 'ashpriest'],
      ['boneknight', 'flamewyrm', 'cryptwidow', 'emberwitch', 'mireweaver', 'knellwitch'],
    ],
    mid: [
      ['redlion', 'cinderblade', 'flamewyrm', 'pyrelord', 'emberwitch', 'ashpriest'],
      ['deathlessking', 'cryptwidow', 'fluxreaver', 'plaguelord', 'hexweaver', 'knellwitch'],
      ['abysstyrant', 'flamewyrm', 'nightmare', 'plaguelord', 'terrorweaver', 'ashpriest'],
    ],
    apex: {
      60: ['redlion', 'cinderblade', 'flamewyrm', 'pyrelord', 'emberwitch', 'ashpriest'],
      65: ['deathlessking', 'boneknight', 'cryptwidow', 'plaguelord', 'hexweaver', 'knellwitch'],
      70: ['abysstyrant', 'cryptwidow', 'nightmare', 'terrorweaver', 'plaguelord', 'hexweaver'],
      75: ['hornchief', 'flamewyrm', 'magmaturtle', 'pyrelord', 'emberwitch', 'plaguelord'],
      80: ['abysstyrant', 'flamewyrm', 'fluxreaver', 'plaguelord', 'mireweaver', 'terrorweaver'],
    },
  },
};

// 樓層 → 精心隊（floor 必為 5 倍數）。令 n = floor/5。
export function bossTeamFor(trackId, floor) {
  const T = TRACK_TEAMS[trackId];
  const n = floor / 5;
  if (floor >= 60) return T.apex[floor];
  if (floor >= 30) return T.mid[n % 3];
  return n % 2 === 1 ? T.low[0] : T.low[1];
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run src/data/towerTeams.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/towerTeams.js src/data/towerTeams.test.js
git commit -m "feat(tower): 6 塔精心隊表 + bossTeamFor（含屬性/毒隊靜態驗證）"
```

---

### Task 3: `tower.js` 難度與敵隊生成

**Files:**
- Modify: `src/systems/tower.js`（改寫難度區塊與 `floorEnemies`）
- Test: `src/systems/tower.test.js`（改寫）

**Interfaces:**
- Consumes: `TRACK_BY_ID`, `trackEnv`（Task 1）；`bossTeamFor`（Task 2）；`deriveStats`, `Unit`, `Rng`, `CARDS`, `CARD_LIST`。
- Produces:
  - `MAX_FLOOR = 80`、`BOSS_EVERY = 5`、`isBossFloor(floor)`
  - `enemyLevel(floor): number`（＝floor）
  - `enemyStars(floor): number`、`bossPremium(floor): number`
  - `rewardsOf(floor): {gold,essence,tickets?}`
  - `floorEnemies(trackId, floor): Unit[]`

- [ ] **Step 1: 改寫測試（難度＋生成）**

```js
// src/systems/tower.test.js — 取代整檔
import { describe, it, expect, beforeEach } from 'vitest';
import { store, createNewGame } from '../core/state.js';
import {
  isBossFloor, enemyLevel, enemyStars, bossPremium, rewardsOf,
  floorEnemies, floorPreview, isCleared, challengeTower, claimTowerWin,
} from './tower.js';
import { TRACK_TEAMS } from '../data/towerTeams.js';
import { CARDS } from '../data/cards.js';
import { deriveStats } from '../core/stats.js';

beforeEach(() => { store.set(createNewGame()); });

describe('試煉塔 · 難度', () => {
  it('等級＝關數；星級每 12 關 +1、封頂 5', () => {
    expect(enemyLevel(1)).toBe(1);
    expect(enemyLevel(80)).toBe(80);
    expect(enemyStars(11)).toBe(0);
    expect(enemyStars(12)).toBe(1);
    expect(enemyStars(60)).toBe(5);
    expect(enemyStars(80)).toBe(5);
  });
  it('Boss 溢價分三段', () => {
    expect(bossPremium(25)).toBeCloseTo(1.15);
    expect(bossPremium(55)).toBeCloseTo(1.25);
    expect(bossPremium(60)).toBeCloseTo(1.35);
  });
  it('Boss 獎勵含召喚券', () => {
    expect(isBossFloor(5)).toBe(true);
    expect(rewardsOf(5).tickets).toBe(1);
    expect(rewardsOf(50).tickets).toBe(3);
    expect(rewardsOf(4).tickets).toBeUndefined();
  });
});

describe('試煉塔 · 敵隊生成', () => {
  it('Boss 關＝精心隊、等級＝關數、6 名', () => {
    const units = floorEnemies('sunny', 80);
    expect(units).toHaveLength(6);
    expect(units.every((u) => u.level === 80)).toBe(true);
    expect(units.map((u) => u.cardId).sort()).toEqual([...TRACK_TEAMS.sunny.apex[80]].sort());
  });
  it('Boss 溢價：三圍＝基礎×溢價（四捨五入）', () => {
    const floor = 65;
    const units = floorEnemies('sunny', floor);
    expect(units).toHaveLength(6);
    // 首名對照：同卡、同級(=floor)、同星(=enemyStars+1)、無溢價的 deriveStats
    const first = units[0];
    expect(first.cardId).toBe(TRACK_TEAMS.sunny.apex[65][0]);
    const base = deriveStats({ cardId: first.cardId, level: enemyLevel(floor), stars: Math.min(5, enemyStars(floor) + 1) });
    expect(first.maxHp).toBe(Math.round(base.hp * bossPremium(floor)));
  });
  it('路關：確定性、偏主題屬性、至少一坦', () => {
    const a = floorEnemies('sunny', 7).map((u) => `${u.cardId}:${u.pos}`);
    const b = floorEnemies('sunny', 7).map((u) => `${u.cardId}:${u.pos}`);
    expect(a).toEqual(b);
    const units = floorEnemies('sunny', 7);
    expect(units.filter((u) => u.element === 'fire').length).toBeGreaterThanOrEqual(3);
    expect(units.some((u) => u.class === 'tank')).toBe(true);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run src/systems/tower.test.js`
Expected: FAIL（新簽名/函式尚未存在）

- [ ] **Step 3: 改寫 `tower.js`（難度＋生成段）**

取代 `src/systems/tower.js` 檔首至 `floorEnemies` 結尾（保留檔案其餘部分交給 Task 4）。先換 import 與難度/生成：

```js
// src/systems/tower.js — 上半段（難度與敵隊生成）
import { store } from '../core/state.js';
import { saveGame } from '../core/save.js';
import { simulateBattle } from '../battle/battleLog.js';
import { Unit } from '../battle/unit.js';
import { deriveStats } from '../core/stats.js';
import { Rng } from '../core/rng.js';
import { CARDS, CARD_LIST } from '../data/cards.js';
import { buildPlayerUnits } from './battleSetup.js';
import { TRACK_BY_ID, trackEnv } from '../data/towerTracks.js';
import { bossTeamFor } from '../data/towerTeams.js';
import { envLabelOf } from '../battle/environments.js';

export const BOSS_EVERY = 5;
export const MAX_FLOOR = 80;
export const isBossFloor = (floor) => floor % BOSS_EVERY === 0;

// 等級＝關數（玩家滿級 60，故 61–80 刻意超上限＝終局牆）。
export function enemyLevel(floor) { return floor; }

// 星級：每 12 關 +1、封頂 5（60 關滿星）。
export function enemyStars(floor) {
  return Math.max(0, Math.min(5, Math.floor(floor / 12)));
}

// Boss 三圍溢價：分三段愈後愈狠。
export function bossPremium(floor) {
  if (floor >= 60) return 1.35;
  if (floor >= 30) return 1.25;
  return 1.15;
}

// 首通獎勵：隨關數成長；Boss 追加召喚券。
export function rewardsOf(floor) {
  const r = { gold: 200 + floor * 80, essence: 10 + floor * 4 };
  if (isBossFloor(floor)) r.tickets = 1 + Math.floor(floor / 25);
  return r;
}

// 字串雜湊（確定性 rng 種子用）。
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// 路關隨機卡：偏主題屬性（≥半數）、至少一坦、六名不重複、確定性。
function randomFloorCards(track, floor) {
  const rng = new Rng(hashStr(track.id) + floor * 7919 + 13);
  const isElement = track.theme !== 'dot';
  const themed = isElement ? CARD_LIST.filter((c) => c.element === track.theme) : CARD_LIST;
  const tanks = (isElement ? themed : CARD_LIST).filter((c) => c.class === 'tank');
  const picks = [];
  const used = new Set();
  const take = (pool) => {
    for (let g = 0; g < 60; g += 1) {
      const c = rng.pick(pool);
      if (c && !used.has(c.id)) { used.add(c.id); picks.push(c.id); return; }
    }
  };
  take(tanks.length ? tanks : CARD_LIST.filter((c) => c.class === 'tank'));
  while (picks.length < 4 && themed.length) take(themed);
  while (picks.length < 6) take(CARD_LIST);
  return picks;
}

// 樓層敵隊：Boss 關查精心隊表（+1★、溢價）；路關確定性隨機。
export function floorEnemies(trackId, floor) {
  const track = TRACK_BY_ID[trackId];
  if (!track) return [];
  const level = enemyLevel(floor);
  const boss = isBossFloor(floor);
  const stars = boss ? Math.min(5, enemyStars(floor) + 1) : enemyStars(floor);
  const premium = boss ? bossPremium(floor) : 1.0;
  const cardIds = boss ? bossTeamFor(trackId, floor) : randomFloorCards(track, floor);

  const front = [1, 2, 3];
  const back = [4, 5, 6];
  const units = [];
  for (const id of cardIds) {
    const card = CARDS[id];
    if (!card) continue;
    const stats = deriveStats({ cardId: id, level, stars });
    stats.hp = Math.round(stats.hp * premium);
    stats.atk = Math.round(stats.atk * premium);
    stats.def = Math.round(stats.def * premium);
    const wantBack = card.class === 'support' || card.attackStyle === 'ranged';
    const pos = wantBack ? (back.shift() ?? front.shift()) : (front.shift() ?? back.shift());
    if (pos == null) continue;
    units.push(new Unit(stats, { team: 1, pos }));
  }
  return units;
}
```

> 注意：本步驟同時移除舊的 `themeOf`/`enemyLevel(floor*1.5)`/舊 `floorEnemies(floor)`。`floorPreview`/`currentFloor`/`challengeTower`/`claimTowerWin` 由 Task 4 一起改寫；本步驟後檔案暫時缺這些 export（測試只跑到生成段落）。

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run src/systems/tower.test.js -t "難度"` 及 `-t "敵隊生成"`
Expected: PASS（`isCleared/challengeTower/claimTowerWin/floorPreview` 相關案例暫失敗，Task 4 補齊）

- [ ] **Step 5: Commit**

```bash
git add src/systems/tower.js src/systems/tower.test.js
git commit -m "feat(tower): 等級=關數/星級/溢價/Boss查表與路關確定性生成"
```

---

### Task 4: `tower.js` 進度與挑戰（每塔獨立、支援跳關）

**Files:**
- Modify: `src/systems/tower.js`（補進度/挑戰/預覽段）
- Test: `src/systems/tower.test.js`（補進度測試）

**Interfaces:**
- Consumes: `floorEnemies`, `rewardsOf`, `trackEnv`, `envLabelOf`, `buildPlayerUnits`, `simulateBattle`, `Rng`, `saveGame`, `store`。
- Produces:
  - `isCleared(trackId, floor, state?): boolean`
  - `floorPreview(trackId, floor, state?): {trackId,floor,isBoss,level,stars,rewards,env,envLabel,enemies:[{cardId,level,pos}],cleared}`
  - `challengeTower(trackId, floor, state?): {sim,win,trackId,floor,rewards,env}|null`
  - `claimTowerWin(trackId, floor, state?): rewards|null`

- [ ] **Step 1: 補進度測試**

```js
// 追加到 src/systems/tower.test.js
describe('試煉塔 · 進度（跳關 + 每塔獨立首通）', () => {
  it('challengeTower 跳關；claimTowerWin 首通入帳、防重複、每塔獨立', () => {
    const s = store.state;
    const res = challengeTower('sunny', 30, s);
    expect(res.floor).toBe(30);
    expect(res.trackId).toBe('sunny');
    expect(Array.isArray(res.sim.log)).toBe(true);

    const gold0 = s.currencies.gold;
    const granted = claimTowerWin('sunny', 30, s);
    expect(granted.gold).toBe(rewardsOf(30).gold);
    expect(s.currencies.gold).toBe(gold0 + granted.gold);
    expect(isCleared('sunny', 30, s)).toBe(true);
    expect(claimTowerWin('sunny', 30, s)).toBe(null);       // 同塔同關不重領
    expect(isCleared('rain', 30, s)).toBe(false);           // 別塔獨立
  });
  it('floorPreview 帶環境與 cleared 狀態', () => {
    const fp = floorPreview('surge', 60, store.state);
    expect(fp.isBoss).toBe(true);
    expect(fp.level).toBe(60);
    expect(fp.env).toEqual({ weather: null, terrain: 'surge' });
    expect(fp.enemies).toHaveLength(6);
    expect(fp.cleared).toBe(false);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run src/systems/tower.test.js -t "進度"`
Expected: FAIL（函式未定義）

- [ ] **Step 3: 補 `tower.js`（進度/挑戰/預覽段，接在生成段之後）**

```js
// src/systems/tower.js — 下半段（進度與挑戰）
function trackState(trackId, state) {
  state.tower ??= { tracks: {} };
  state.tower.tracks ??= {};
  return (state.tower.tracks[trackId] ??= { cleared: [] });
}

export function isCleared(trackId, floor, state = store.state) {
  return trackState(trackId, state).cleared.includes(floor);
}

export function floorPreview(trackId, floor, state = store.state) {
  const units = floorEnemies(trackId, floor);
  const env = trackEnv(trackId);
  return {
    trackId, floor,
    isBoss: isBossFloor(floor),
    level: enemyLevel(floor),
    stars: enemyStars(floor),
    rewards: rewardsOf(floor),
    env,
    envLabel: envLabelOf(env.weather, env.terrain),
    enemies: units.map((u) => ({ cardId: u.cardId, level: u.level, pos: u.pos })),
    cleared: isCleared(trackId, floor, state),
  };
}

// 挑戰指定 (塔,關)：模擬戰鬥（獎勵不在這裡發，回放播完才 claim）。
export function challengeTower(trackId, floor, state = store.state) {
  const player = buildPlayerUnits(state);
  if (player.length === 0) return null;
  const enemies = floorEnemies(trackId, floor);
  const env = trackEnv(trackId);
  const sim = simulateBattle(player, enemies, { rng: new Rng(), env });
  return { sim, win: sim.winner === 0, trackId, floor, rewards: rewardsOf(floor), env };
}

// 首通入帳（每塔每關一次）。
export function claimTowerWin(trackId, floor, state = store.state) {
  const ts = trackState(trackId, state);
  if (ts.cleared.includes(floor)) return null;
  const r = rewardsOf(floor);
  state.currencies.gold += r.gold;
  state.inventory.materials.essence = (state.inventory.materials.essence || 0) + r.essence;
  if (r.tickets) state.currencies.tickets += r.tickets;
  ts.cleared.push(floor);
  saveGame();
  store.notify();
  return r;
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run src/systems/tower.test.js`
Expected: PASS（全檔）

- [ ] **Step 5: Commit**

```bash
git add src/systems/tower.js src/systems/tower.test.js
git commit -m "feat(tower): 每塔獨立首通進度、跳關挑戰與樓層預覽"
```

---

### Task 5: 存檔遷移

**Files:**
- Modify: `src/core/save.js:64`
- Test: `src/core/save.test.js`（若不存在則 Create）

**Interfaces:**
- Consumes: 舊存檔 `data.tower = { floor: N }`。
- Produces: `data.tower = { tracks: { sunny: { cleared: [1..N-1] }, ... } }`。

- [ ] **Step 1: 寫失敗測試**

```js
// src/core/save.test.js（新增或追加）
import { describe, it, expect } from 'vitest';
import { migrateTower } from './save.js';

describe('存檔遷移 · tower', () => {
  it('舊 {floor:5} → 烈日塔已通 1..4', () => {
    const data = { tower: { floor: 5 } };
    migrateTower(data);
    expect(data.tower.floor).toBeUndefined();
    expect(data.tower.tracks.sunny.cleared).toEqual([1, 2, 3, 4]);
  });
  it('新結構原封不動', () => {
    const data = { tower: { tracks: { rain: { cleared: [1] } } } };
    migrateTower(data);
    expect(data.tower.tracks.rain.cleared).toEqual([1]);
  });
  it('無 tower 欄位補空結構', () => {
    const data = {};
    migrateTower(data);
    expect(data.tower.tracks).toEqual({});
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run src/core/save.test.js`
Expected: FAIL（`migrateTower` 未匯出）

- [ ] **Step 3: 實作**

於 `src/core/save.js` 匯出並在載入流程呼叫（取代 `data.tower ??= { floor: 1 }`）：

```js
// src/core/save.js
export function migrateTower(data) {
  data.tower ??= { tracks: {} };
  data.tower.tracks ??= {};
  if (typeof data.tower.floor === 'number') {
    const cleared = [];
    for (let f = 1; f < data.tower.floor; f += 1) cleared.push(f);
    data.tower.tracks.sunny = { cleared };
    delete data.tower.floor;
  }
}
```

並在既有載入函式中，把第 64 行的 `data.tower ??= { floor: 1 };` 改為 `migrateTower(data);`。

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run src/core/save.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/save.js src/core/save.test.js
git commit -m "feat(tower): 舊爬塔進度遷移到每塔 cleared 結構"
```

---

### Task 6: `towerUI.js` 兩級畫面（選塔 → 關卡格 → 挑戰）

**Files:**
- Modify: `src/ui/towerUI.js`（改寫）
- Modify: `src/ui/towerUI.css` 若存在（否則沿用既有 `.tw-*` class；新增樣式可放既有全域樣式檔）

**Interfaces:**
- Consumes: `TOWER_TRACKS`, `trackEnv`（Task 1）；`floorPreview`, `challengeTower`, `claimTowerWin`, `isBossFloor`, `MAX_FLOOR`, `enemyLevel`, `isCleared`（Task 3/4）；既有 `nav`, `store`, `el/clear/toast/fmt`, `icon`, `cardFrame`, `openModal`, `staggerIn/popIn/flyReward`, `battle.playCustom`。
- Produces: 無（畫面層）。

- [ ] **Step 1: 改寫 `TowerUI`**

```js
// src/ui/towerUI.js
import { el, clear, toast, fmt } from './dom.js';
import { icon } from './icons.js';
import { store } from '../core/state.js';
import { nav } from './router.js';
import { CARDS } from '../data/cards.js';
import { ELEMENT_LABEL } from '../data/elements.js';
import { cardFrame } from './cardFrame.js';
import { openModal } from './modal.js';
import { staggerIn, popIn, flyReward } from './anim.js';
import { TOWER_TRACKS } from '../data/towerTracks.js';
import {
  MAX_FLOOR, isBossFloor, enemyLevel, isCleared,
  floorPreview, challengeTower, claimTowerWin,
} from '../systems/tower.js';

const THEME_ICON = { fire: '🔥', wind: '🍃', water: '💧', light: '☀️', dark: '🌙', dot: '☠️' };
const THEME_NAME = { ...ELEMENT_LABEL, dot: '毒' };

export class TowerUI {
  constructor(root, battle) {
    this.root = root;
    this.battle = battle;
    this.trackId = null; // null＝選塔頁
    this._busy = false;
  }

  onShow() { this.render(); }

  render() {
    clear(this.root);
    if (!this.trackId) return this._renderSelect();
    return this._renderFloors();
  }

  // ---- 選塔頁 ----
  _renderSelect() {
    this.root.appendChild(el('div', { class: 'back-btn pressable', title: '回主城', onClick: () => nav.go('home') }, [icon('back', 22)]));
    this.root.appendChild(el('div', { class: 'page-title left', text: '試煉塔' }));
    const grid = el('div', { class: 'tw-select' });
    for (const t of TOWER_TRACKS) {
      const cleared = (store.state.tower?.tracks?.[t.id]?.cleared ?? []).length;
      const card = el('div', {
        class: 'tw-trackcard pressable',
        onClick: () => { this.trackId = t.id; this.render(); },
      }, [
        el('div', { class: 'tw-trackicon', text: THEME_ICON[t.theme], style: `--tw-col:${t.color}` }),
        el('div', { class: 'tw-trackname', text: t.name }),
        el('div', { class: 'tw-tracksub', text: `吃香：${THEME_NAME[t.theme]}屬` }),
        el('div', { class: 'tw-trackprog', text: `已通 ${cleared}/${MAX_FLOOR}` }),
      ]);
      grid.appendChild(card);
    }
    this.root.appendChild(grid);
    staggerIn([...grid.children], { dy: 18, step: 0.05 });
  }

  // ---- 關卡格頁 ----
  _renderFloors() {
    this.root.appendChild(el('div', { class: 'back-btn pressable', title: '選塔', onClick: () => { this.trackId = null; this.render(); } }, [icon('back', 22)]));
    const track = TOWER_TRACKS.find((t) => t.id === this.trackId);
    this.root.appendChild(el('div', { class: 'page-title left', text: track.name }));

    const grid = el('div', { class: 'tw-grid' });
    for (let f = 1; f <= MAX_FLOOR; f += 1) {
      const done = isCleared(this.trackId, f);
      const boss = isBossFloor(f);
      const cell = el('div', {
        class: `tw-cell${boss ? ' boss' : ''}${done ? ' cleared' : ''}`,
        onClick: () => this._openFloor(f),
      }, [
        el('b', { text: `${f}` }),
        el('span', { class: 'tw-celllv', text: `Lv${enemyLevel(f)}` }),
        boss ? el('span', { class: 'tw-cellstar', text: '★' }) : null,
        done ? el('span', { class: 'tw-cellok', text: '✓' }) : null,
      ].filter(Boolean));
      grid.appendChild(cell);
    }
    this.root.appendChild(grid);
    staggerIn([...grid.children].slice(0, 40), { dy: 8, step: 0.006 });
  }

  // ---- 樓層預覽 modal ----
  _openFloor(floor) {
    const fp = floorPreview(this.trackId, floor);
    openModal({
      className: 'ov-tower-floor',
      build: (panel, close) => {
        panel.appendChild(el('div', { class: 'ov-title', text: `第 ${floor} 層 · Lv${fp.level}${fp.isBoss ? ' · 👹 BOSS' : ''}` }));
        if (fp.envLabel) panel.appendChild(el('div', { class: 'tw-fenv', text: fp.envLabel }));
        const mini = el('div', { class: 'tw-fdef' });
        for (const e of [...fp.enemies].sort((a, b) => a.pos - b.pos)) {
          const card = CARDS[e.cardId];
          if (card) mini.appendChild(cardFrame(card, { level: e.level, size: 'mini' }));
        }
        panel.appendChild(mini);
        const chips = el('div', { class: 'tw-frw' }, [
          el('span', { text: `🪙${fmt(fp.rewards.gold)}` }),
          el('span', { text: `🔹${fp.rewards.essence}` }),
        ]);
        if (fp.rewards.tickets) chips.appendChild(el('span', { text: `🎟️×${fp.rewards.tickets}` }));
        if (fp.cleared) chips.appendChild(el('span', { text: '✓ 已首通' }));
        panel.appendChild(chips);
        panel.appendChild(el('button', {
          class: 'btn btn-gold pressable', text: '⚔ 挑戰',
          onClick: () => { close(); this._challenge(floor); },
        }));
      },
    });
  }

  _challenge(floor) {
    if (this._busy) return;
    const res = challengeTower(this.trackId, floor);
    if (!res) { toast('請先到「隊伍」編排上陣'); return; }
    this._busy = true;
    nav.go('battle');
    this.battle.playCustom({ setup: res.sim.setup, log: res.sim.log }, {
      title: `${TOWER_TRACKS.find((t) => t.id === this.trackId).name} ${floor}F`,
      env: res.env,
      onDone: () => {
        this._busy = false;
        nav.go('tower');
        if (res.win) {
          const granted = claimTowerWin(res.trackId, res.floor);
          this.render();
          if (granted) this._winModal(floor, granted);
        } else {
          toast('差一點！升級英雄、升星或換陣再來', { icon: '🗼' });
        }
      },
    });
  }

  _winModal(floor, rewards) {
    openModal({
      className: 'ov-arena-result',
      build: (panel, close) => {
        const badge = el('div', { class: 'ov-title', text: `🗼 通過第 ${floor} 層！` });
        panel.appendChild(badge); popIn(badge);
        panel.appendChild(el('div', { class: 'arr-line', text: '首通獎勵' }));
        const chips = el('div', { class: 'tw-winrw' }, [
          el('span', { text: `🪙 ${fmt(rewards?.gold ?? 0)}` }),
          el('span', { text: `🔹 ${rewards?.essence ?? 0}` }),
        ]);
        if (rewards?.tickets) chips.appendChild(el('span', { text: `🎟️ ×${rewards.tickets}` }));
        panel.appendChild(chips);
        staggerIn(chips.children, { dy: 10, step: 0.1 });
        flyReward(rewards ?? {}, chips);
        panel.appendChild(el('button', { class: 'btn btn-gold', text: '繼續挑戰', onClick: () => close() }));
      },
    });
  }
}
```

- [ ] **Step 2: 加最小樣式**

於既有全域樣式檔（搜尋現有 `.tw-track` / `.tw-floor` 定義所在的 .css）追加：

```css
.tw-select { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; padding:16px; }
.tw-trackcard { display:flex; flex-direction:column; gap:6px; align-items:center; padding:18px; border-radius:16px; background:rgba(255,255,255,.06); }
.tw-trackicon { font-size:40px; filter:drop-shadow(0 0 10px var(--tw-col)); }
.tw-trackname { font-weight:700; }
.tw-tracksub, .tw-trackprog { font-size:12px; opacity:.8; }
.tw-grid { display:grid; grid-template-columns:repeat(8,1fr); gap:8px; padding:12px; overflow-y:auto; }
.tw-cell { position:relative; aspect-ratio:1; display:flex; flex-direction:column; align-items:center; justify-content:center; border-radius:12px; background:rgba(255,255,255,.06); cursor:pointer; }
.tw-cell.boss { background:rgba(255,180,80,.18); box-shadow:inset 0 0 0 1px rgba(255,180,80,.5); }
.tw-cell.cleared { opacity:.55; }
.tw-cell b { font-size:16px; }
.tw-celllv { font-size:10px; opacity:.75; }
.tw-cellstar { position:absolute; top:2px; right:4px; color:#ffcf6b; font-size:11px; }
.tw-cellok { position:absolute; bottom:2px; right:4px; color:#7ee29a; font-size:11px; }
```

- [ ] **Step 3: 手動煙霧驗證（截圖自驗）**

先啟動 dev（若未啟）：`npm run dev`（port 5173）。用專案截圖腳本或 `scripts/screenshot.mjs` 流程：進試煉塔 → 選一座塔 → 開一個 Boss 關預覽 → 挑戰。確認：選塔頁 6 卡、關卡格 1–80、Boss 關★、可點任意關跳關、預覽顯示環境與敵隊、勝利首通獎入帳且格子變 ✓。

- [ ] **Step 4: 全測試回歸**

Run: `npm test`
Expected: 全綠（含新檔）。

- [ ] **Step 5: Commit**

```bash
git add src/ui/towerUI.js src/ui/*.css
git commit -m "feat(tower): 選塔頁 + 1–80 關卡格 + 跳關挑戰 UI"
```

---

## Self-Review

- **Spec coverage**：
  - 6 主題塔 → Task 1；固定環境 → `trackEnv`（Task 1）＋挑戰用 env（Task 4）。
  - 自由跳關 → 關卡格任點（Task 6）＋每塔 `cleared` 集合（Task 4）。
  - 等級=關數／星級／溢價／60+ 全屬性 → Task 3 ＋ Task 2 靜態驗證。
  - 每 5 倍數精心隊（可重複、低/中/高段） → Task 2 資料 ＋ `bossTeamFor`。
  - 路關隨機偏屬性、≥1 坦 → Task 3 `randomFloorCards`。
  - 每關首通獎（跳關不用補） → Task 4 `claimTowerWin`。
  - 存檔遷移 → Task 5。
- **Placeholder scan**：各步含實際程式與指令；無 TBD/TODO。溢價數字為設計決定值（非佔位），已在 spec 標記後續用模擬微調。
- **Type consistency**：`floorEnemies(trackId, floor)`、`challengeTower(trackId, floor, state?)`、`claimTowerWin(trackId, floor, state?)`、`floorPreview(trackId, floor, state?)` 全程一致；`bossTeamFor(trackId, floor)` 回 `string[]`；`trackEnv` 回 `{weather,terrain}` 與 `simulateBattle`/`envLabelOf` 相容。

## 執行前備註（平衡）

溢價數字（×1.15/1.25/1.35）與星級曲線為佔位，實作後應以既有 pure-team／推關模擬驗「同段路關可過、Boss 需換陣」；此調校可在 Task 6 之後追加一個平衡任務，不阻塞主線落地。
