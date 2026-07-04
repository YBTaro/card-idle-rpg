// 伺服器端戰鬥：與前端共用同一套引擎（src/battle）——這是防作弊的核心，
// 客戶端只回報「想打誰」，戰果一律由伺服器模擬產生。
import { simulateBattle } from '../src/battle/battleLog.js';
import { Unit } from '../src/battle/unit.js';
import { deriveStats } from '../src/core/stats.js';
import { Rng } from '../src/core/rng.js';
import { CARDS, CARD_LIST } from '../src/data/cards.js';
import { httpError } from './players.js';

const LEVEL_MAX = 500;
const TEAM_MAX = 6;

// 隊伍快照 [{cardId, level, stars, pos}] → 驗證並轉 Unit[]。
// 快照只帶「身分」，數值一律由伺服器 deriveStats 重算（改封包也改不了數值）。
export function unitsFromSnapshot(snapshot, team) {
  if (!Array.isArray(snapshot) || snapshot.length === 0 || snapshot.length > TEAM_MAX) {
    throw httpError(400, '隊伍需為 1~6 名');
  }
  const seenPos = new Set();
  const units = [];
  for (const e of snapshot) {
    const card = CARDS[e?.cardId];
    if (!card) throw httpError(400, `未知卡片 ${e?.cardId}`);
    const pos = Number(e.pos);
    if (!(pos >= 1 && pos <= 6) || seenPos.has(pos)) throw httpError(400, '站位不合法');
    seenPos.add(pos);
    const level = Math.max(1, Math.min(LEVEL_MAX, Math.round(Number(e.level) || 1)));
    const stars = Math.max(0, Math.min(5, Math.round(Number(e.stars) || 0)));
    units.push(new Unit(deriveStats({ cardId: card.id, level, stars }), { team, pos }));
  }
  return units;
}

// 跑一場：回傳可序列化戰報（seed 一併存檔，之後可重跑驗證）。
export function runBattle(atkSnapshot, defSnapshot, seed) {
  const a = unitsFromSnapshot(atkSnapshot, 0);
  const b = unitsFromSnapshot(defSnapshot, 1);
  const sim = simulateBattle(a, b, { rng: new Rng(seed) });
  return { setup: sim.setup, log: sim.log, winner: sim.winner, rounds: sim.rounds, seed };
}

// 依 log 統計 team0 對 team1 造成的總傷害（公會 Boss 貢獻用）。
export function totalDamageByTeam0(sim) {
  const teamOf = new Map(sim.setup.map((u) => [u.uid, u.team]));
  let sum = 0;
  for (const e of sim.log) {
    if (e.type === 'damage' && teamOf.get(e.targetUid) === 1) sum += e.amount;
  }
  return sum;
}

// 機器人隊伍生成：依基準等級/強度係數採樣（tank 至少 1、support 至多 2）。
export function botSnapshot(level, mult = 1, seed = 1) {
  const rng = new Rng(seed);
  const tanks = CARD_LIST.filter((c) => c.class === 'tank');
  const rest = CARD_LIST.filter((c) => c.class !== 'tank');
  const picks = [rng.pick(tanks)];
  const used = new Set([picks[0].id]);
  while (picks.length < 6) {
    const c = rng.pick(rest);
    if (used.has(c.id)) continue;
    used.add(c.id);
    picks.push(c);
  }
  const lv = Math.max(1, Math.round(level * mult));
  const front = [1, 2, 3];
  const back = [4, 5, 6];
  return picks.map((c) => {
    const wantBack = c.class === 'support' || c.attackStyle === 'ranged';
    const pos = wantBack ? (back.shift() ?? front.shift()) : (front.shift() ?? back.shift());
    return { cardId: c.id, level: lv, stars: Math.min(5, Math.floor(lv / 40)), pos };
  }).filter((e) => e.pos != null);
}
