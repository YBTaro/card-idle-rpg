// 試煉塔：單人 PvE 爬塔。一層一戰、首通給獎、每 5 層 Boss 里程碑。
// 敵隊由樓層數確定性生成（同層永遠同隊 → 玩家可以針對性換隊 counter）。
// 單機內容：純前端模擬（與推關同原則），不經伺服器。
import { store } from '../core/state.js';
import { saveGame } from '../core/save.js';
import { simulateBattle } from '../battle/battleLog.js';
import { Unit } from '../battle/unit.js';
import { deriveStats } from '../core/stats.js';
import { Rng } from '../core/rng.js';
import { CARD_LIST } from '../data/cards.js';
import { ELEMENTS } from '../data/elements.js';
import { buildPlayerUnits } from './battleSetup.js';
import { towerEnv, envLabelOf } from '../battle/environments.js';

export const BOSS_EVERY = 5; // 每 5 層 Boss 層（強化 + 里程碑獎勵）

// 樓層屬性主題：輪替五屬（玩家可帶剋制屬性隊伍）。
export function themeOf(floor) {
  return ELEMENTS[(floor - 1) % ELEMENTS.length];
}

export const isBossFloor = (floor) => floor % BOSS_EVERY === 0;

// 敵隊等級曲線：首層新帳號（Lv1 初始隊）必須能贏，之後逐層拉開。
export function enemyLevel(floor) {
  return Math.max(1, Math.ceil(floor * 1.5) - 1); // 1F=1, 2F=2, 5F=7, 10F=14
}

// 首通獎勵：金幣/精華隨層數成長；Boss 層追加召喚券。
export function rewardsOf(floor) {
  const r = { gold: 200 + floor * 80, essence: 10 + floor * 4 };
  if (isBossFloor(floor)) r.tickets = 1 + Math.floor(floor / 25); // 5,10,15… +1 券；25 層後 +2
  return r;
}

// 樓層敵隊（確定性）：主題屬性佔多數、坦克至少 1、Boss 層全隊 +15%。
// 前兩層只出 5 名且整體 -15%（新手緩坡）。
export function floorEnemies(floor) {
  const rng = new Rng(floor * 7919 + 13);
  const theme = themeOf(floor);
  const themed = CARD_LIST.filter((c) => c.element === theme);
  const tanks = CARD_LIST.filter((c) => c.class === 'tank');
  const count = floor < 3 ? 5 : 6;
  const picks = [];
  const used = new Set();
  const take = (pool) => {
    for (let guard = 0; guard < 50; guard += 1) {
      const c = rng.pick(pool);
      if (!used.has(c.id)) { used.add(c.id); picks.push(c); return; }
    }
  };
  take(tanks.filter((c) => c.element === theme).length ? tanks.filter((c) => c.element === theme) : tanks);
  while (picks.length < Math.min(4, count - 1)) take(themed);
  while (picks.length < count) take(CARD_LIST);

  const level = enemyLevel(floor);
  const scale = (isBossFloor(floor) ? 1.15 : 1.0) * (floor < 3 ? 0.85 : 1.0);
  const front = [1, 2, 3];
  const back = [4, 5, 6];
  const units = [];
  for (const card of picks) {
    const stats = deriveStats({ cardId: card.id, level, stars: Math.min(5, Math.floor(floor / 15)) });
    stats.hp = Math.round(stats.hp * scale);
    stats.atk = Math.round(stats.atk * scale);
    stats.def = Math.round(stats.def * scale);
    const wantBack = card.class === 'support' || card.attackStyle === 'ranged';
    const pos = wantBack ? (back.shift() ?? front.shift()) : (front.shift() ?? back.shift());
    if (pos == null) continue;
    units.push(new Unit(stats, { team: 1, pos }));
  }
  return units;
}

// 樓層預覽資料（UI 用；不建 Unit 全量、只拿卡面資訊）。
export function floorPreview(floor) {
  const units = floorEnemies(floor);
  const theme = themeOf(floor);
  const env = towerEnv(floor, theme);
  return {
    floor,
    theme,
    isBoss: isBossFloor(floor),
    level: enemyLevel(floor),
    rewards: rewardsOf(floor),
    env,
    envLabel: envLabelOf(env.weather, env.terrain),
    enemies: units.map((u) => ({ cardId: u.cardId, level: u.level, pos: u.pos })),
  };
}

// 目前要挑戰的層（= 已通過最高層 + 1）。
export function currentFloor(state = store.state) {
  return state.tower?.floor ?? 1;
}

// 挑戰目前層：模擬戰鬥 → 回 {sim, win, floor, rewards}。獎勵不在這裡發
//（等回放播完才入帳，見 claimTowerWin——避免玩家還沒看到勝利就先進帳）。
export function challengeTower(state = store.state) {
  const player = buildPlayerUnits(state);
  if (player.length === 0) return null;
  const floor = currentFloor(state);
  const enemies = floorEnemies(floor);
  const env = towerEnv(floor, themeOf(floor)); // 樓層環境：天氣連動主題、場地每 5 層一換
  const sim = simulateBattle(player, enemies, { rng: new Rng(), env });
  return { sim, win: sim.winner === 0, floor, rewards: rewardsOf(floor), env };
}

// 首通入帳 + 推層。回傳發放的獎勵。
export function claimTowerWin(floor, state = store.state) {
  if (floor !== currentFloor(state)) return null; // 只認當前層（防重複入帳）
  const r = rewardsOf(floor);
  state.currencies.gold += r.gold;
  state.inventory.materials.essence = (state.inventory.materials.essence || 0) + r.essence;
  if (r.tickets) state.currencies.tickets += r.tickets;
  state.tower.floor = floor + 1;
  saveGame();
  store.notify();
  return r;
}
