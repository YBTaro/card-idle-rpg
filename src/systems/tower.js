// 試煉塔：6 座屬性主題塔，各自獨立進度、一層一戰、首通給獎、每 5 層 Boss 里程碑。
// 敵隊由 (塔, 樓層) 確定性生成（同塔同層永遠同隊 → 玩家可以針對性換隊 counter）。
// Boss 層改查精心隊表（towerTeams.js）；路關仍隨機但確定性。
// 單機內容：純前端模擬（與推關同原則），不經伺服器。
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
