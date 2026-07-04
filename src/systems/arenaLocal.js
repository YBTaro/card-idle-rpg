// 競技場本地模式：伺服器離線時的降級——機器人對手、本地積分、本地戰報。
// 規則刻意與 server/arena.js 一致（段位/積分/每日次數），連線後無縫換真人。
import { store } from '../core/state.js';
import { saveGame } from '../core/save.js';
import { simulateBattle } from '../battle/battleLog.js';
import { Unit } from '../battle/unit.js';
import { deriveStats } from '../core/stats.js';
import { Rng } from '../core/rng.js';
import { CARDS, CARD_LIST } from '../data/cards.js';

export const FREE_PER_DAY = 5;
export const RATING_START = 1000;

// 段位表（前後端共用規格；顯示用）。
export const TIERS = [
  { name: '青銅', min: 0, icon: '🥉' },
  { name: '白銀', min: 1100, icon: '🥈' },
  { name: '黃金', min: 1300, icon: '🥇' },
  { name: '白金', min: 1500, icon: '🏅' },
  { name: '鑽石', min: 1700, icon: '💎' },
  { name: '傳說', min: 1900, icon: '👑' },
];
export function tierOf(rating) {
  let t = TIERS[0];
  for (const x of TIERS) if (rating >= x.min) t = x;
  return t;
}

const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

// 目前上陣隊伍 → 快照 [{cardId, level, stars, pos}]（進攻/防守通用）。
export function formationSnapshot(state = store.state) {
  return state.formation
    .map((e) => {
      const inst = state.cards.find((c) => c.instanceId === e.instanceId);
      return inst ? { cardId: inst.cardId, level: inst.level, stars: inst.stars ?? 0, pos: e.pos } : null;
    })
    .filter(Boolean);
}

export function snapshotUnits(snapshot, team) {
  return snapshot.map((e) => new Unit(deriveStats({ cardId: e.cardId, level: e.level, stars: e.stars }), { team, pos: e.pos }));
}

function ensureDay(a, now = Date.now()) {
  const day = dayKey(now);
  if (a.day !== day) {
    a.day = day;
    a.used = 0;
  }
}

const BOT_NAMES = ['月下斬', '鐵手套', '疾風之影', '碎星者', '白霜', '燼滅之心', '守夜人', '雷鳴', '深藍', '流浪劍豪'];

function botSnapshot(level, mult, seed) {
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
  return picks
    .map((c) => {
      const wantBack = c.class === 'support' || c.attackStyle === 'ranged';
      const pos = wantBack ? (back.shift() ?? front.shift()) : (front.shift() ?? back.shift());
      return pos == null ? null : { cardId: c.id, level: lv, stars: Math.min(5, Math.floor(lv / 40)), pos };
    })
    .filter(Boolean);
}

function avgLevel(snapshot) {
  if (!snapshot?.length) return 1;
  return Math.round(snapshot.reduce((s, e) => s + (e.level || 1), 0) / snapshot.length);
}

// 3 個機器人候選（0.9 / 1.0 / 1.1 三檔強度）。
export function localCandidates(now = Date.now()) {
  const s = store.state;
  const a = s.arena;
  ensureDay(a, now);
  const base = avgLevel(a.defense.length ? a.defense : formationSnapshot(s)) || 1;
  const MULTS = [0.9, 1.0, 1.1];
  const list = MULTS.map((mult, i) => {
    const seed = Math.floor(now / 3600000) * 7 + i * 131 + (a.refreshSeed ?? 0); // 每小時換一輪；刷新鈕再擾動
    const snap = botSnapshot(base, mult, seed);
    return {
      type: 'bot',
      playerId: `bot:${seed}`,
      nickname: BOT_NAMES[(seed + i) % BOT_NAMES.length],
      avatarCardId: snap[0]?.cardId ?? null,
      signature: '',
      stage: base,
      rating: a.rating + Math.round((mult - 1) * 300),
      defense: snap,
    };
  });
  return { rating: a.rating, daily: { used: a.used }, free: FREE_PER_DAY, list, offline: true };
}

export function localRefresh() {
  store.state.arena.refreshSeed = ((store.state.arena.refreshSeed ?? 0) + 1) % 997;
  saveGame();
}

// ELO-lite（與伺服器同公式）：勝 +5~35、敗 -10~-20。
export function ratingDelta(mine, theirs, win) {
  const diff = Math.max(-400, Math.min(400, theirs - mine));
  if (win) return Math.round(20 + (diff / 400) * 15);
  return -Math.round(15 - (diff / 400) * 5);
}

// 本地挑戰：模擬、記積分、寫戰報。回傳與伺服器 challenge 同形狀（加 offline 旗標）。
export function localChallenge(foe, attack, now = Date.now()) {
  const s = store.state;
  const a = s.arena;
  ensureDay(a, now);
  if (a.used >= FREE_PER_DAY) throw new Error('今日挑戰次數已用完');
  const seed = Math.floor(Math.random() * 2 ** 31);
  const sim = simulateBattle(snapshotUnits(attack, 0), snapshotUnits(foe.defense, 1), { rng: new Rng(seed) });
  const win = sim.winner === 0;
  const delta = ratingDelta(a.rating, foe.rating ?? a.rating, win);
  a.rating = Math.max(0, a.rating + delta);
  a.used += 1;
  a.reports.unshift({ id: `r${now.toString(36)}`, at: now, side: 'attack', foe: { nickname: foe.nickname }, win, delta, seed, attack, defense: foe.defense });
  if (a.reports.length > 20) a.reports.length = 20;
  saveGame();
  return { setup: sim.setup, log: sim.log, winner: sim.winner, win, delta, rating: a.rating, dailyUsed: a.used, free: FREE_PER_DAY, offline: true };
}

// 本地戰報重播：存 seed + 雙方快照，重跑同 seed 即還原整場。
export function localReplay(report) {
  const sim = simulateBattle(snapshotUnits(report.attack, 0), snapshotUnits(report.defense, 1), { rng: new Rng(report.seed) });
  return { setup: sim.setup, log: sim.log, winner: sim.winner };
}

export { CARDS };
