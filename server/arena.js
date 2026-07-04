// 競技場：異步防守隊 PvP。快照配對、伺服器跑戰鬥、ELO-lite 積分、14 天賽季。
import { loadDb, saveDb } from './db.js';
import { publicProfile, httpError } from './players.js';
import { runBattle, botSnapshot } from './battleSim.js';

export const RATING_START = 1000;
export const FREE_PER_DAY = 5;
const SEASON_MS = 14 * 24 * 3600 * 1000;
const MATCH_BAND = 150;      // 配對積分帶寬（不足再擴）
const REPORT_KEEP = 20;

const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
export const seasonIdOf = (now = Date.now()) => Math.floor(now / SEASON_MS);
export const seasonEndsAt = (now = Date.now()) => (seasonIdOf(now) + 1) * SEASON_MS;

// 賽季換季：積分向 1000 軟收斂（進場時懶結算）。
export function ensureSeason(now = Date.now()) {
  const db = loadDb();
  const sid = seasonIdOf(now);
  if (db.arena.seasonId !== sid) {
    for (const pid of Object.keys(db.arena.ratings)) {
      db.arena.ratings[pid] = Math.round(RATING_START + (db.arena.ratings[pid] - RATING_START) / 2);
    }
    db.arena.seasonId = sid;
    db.arena.daily = {};
    saveDb();
  }
}

export function ratingOf(pid) {
  const db = loadDb();
  return db.arena.ratings[pid] ?? RATING_START;
}

export function dailyOf(pid, now = Date.now()) {
  const db = loadDb();
  const d = db.arena.daily[pid];
  const day = dayKey(now);
  if (!d || d.day !== day) {
    db.arena.daily[pid] = { day, used: 0 };
    saveDb();
  }
  return db.arena.daily[pid];
}

export function setDefense(player, snapshot) {
  // 驗證交給 unitsFromSnapshot（在一次乾跑中）——直接存快照
  const db = loadDb();
  runBattle(snapshot, botSnapshot(1, 1, 1), 1); // 乾跑驗證（不存戰果）
  db.arena.defenses[player.id] = snapshot;
  saveDb();
  return { ok: true };
}

// 玩家防守隊平均等級（機器人基準用）。
function avgLevel(snapshot) {
  if (!snapshot?.length) return 1;
  return Math.round(snapshot.reduce((s, e) => s + (e.level || 1), 0) / snapshot.length);
}

// 3 個候選對手：±150 分內真人（有防守隊者）優先，機器人保底補滿。
export function candidates(player, now = Date.now()) {
  ensureSeason(now);
  const db = loadDb();
  const myRating = ratingOf(player.id);
  const pool = Object.values(db.players)
    .filter((p) => p.id !== player.id && db.arena.defenses[p.id]?.length)
    .map((p) => ({ p, r: ratingOf(p.id) }))
    .sort((a, b) => Math.abs(a.r - myRating) - Math.abs(b.r - myRating));
  const humans = pool.filter((x) => Math.abs(x.r - myRating) <= MATCH_BAND);
  const picked = (humans.length >= 3 ? humans : pool).slice(0, 3).map(({ p, r }) => ({
    type: 'player',
    ...publicProfile(p, db),
    rating: r,
  }));
  // 機器人保底（等級以自己防守隊為基準，三檔強度）
  const base = avgLevel(db.arena.defenses[player.id]) || avgLevel(null);
  const MULTS = [0.9, 1.0, 1.1];
  let i = picked.length;
  while (picked.length < 3) {
    const seed = (now % 100000) + picked.length * 7 + player.id.charCodeAt(0);
    const snap = botSnapshot(base, MULTS[i % 3], seed);
    picked.push({
      type: 'bot',
      playerId: `bot:${seed}:${i}`,
      nickname: BOT_NAMES[(seed + i) % BOT_NAMES.length],
      avatarCardId: snap[0].cardId,
      signature: '',
      stage: base,
      rating: myRating + Math.round((MULTS[i % 3] - 1) * 300),
      defense: snap,
    });
    i += 1;
  }
  return { rating: myRating, seasonEndsAt: seasonEndsAt(now), daily: dailyOf(player.id, now), free: FREE_PER_DAY, list: picked };
}

// ELO-lite：分差 ±400 內線性調整，攻方勝 +5~35、敗 -10~-20；防方變動減半。
export function ratingDelta(mine, theirs, win) {
  const diff = Math.max(-400, Math.min(400, theirs - mine));
  if (win) return Math.round(20 + (diff / 400) * 15); // 打強的加更多（+5 ~ +35）
  return -Math.round(15 - (diff / 400) * 5);          // 輸給弱的扣更多（-10 ~ -20）
}

export function challenge(player, { opponentId, defense, attack }, now = Date.now()) {
  ensureSeason(now);
  const db = loadDb();
  const daily = dailyOf(player.id, now);
  if (daily.used >= FREE_PER_DAY) throw httpError(429, '今日挑戰次數已用完');

  // 防守方：真人查庫（防竄改）；機器人用客戶端回傳的候選快照（bot 無庫存身分）
  let defSnapshot;
  let defenderPid = null;
  let theirRating;
  if (opponentId && !String(opponentId).startsWith('bot:')) {
    defSnapshot = db.arena.defenses[opponentId];
    if (!defSnapshot) throw httpError(404, '對手不存在或未設防守隊');
    defenderPid = opponentId;
    theirRating = ratingOf(opponentId);
  } else {
    if (!Array.isArray(defense)) throw httpError(400, '機器人對手需附防守快照');
    defSnapshot = defense;
    theirRating = Number.isFinite(Number(defense.rating)) ? Number(defense.rating) : ratingOf(player.id);
  }

  const seed = Math.floor(Math.random() * 2 ** 31);
  const sim = runBattle(attack, defSnapshot, seed);
  const win = sim.winner === 0;

  const mine = ratingOf(player.id);
  const delta = ratingDelta(mine, theirRating, win);
  db.arena.ratings[player.id] = Math.max(0, mine + delta);
  if (defenderPid) {
    const dr = ratingOf(defenderPid);
    db.arena.ratings[defenderPid] = Math.max(0, dr - Math.round(delta / 2)); // 防方變動減半、方向相反
  }
  daily.used += 1;

  const report = {
    id: `r${now.toString(36)}${Math.floor(Math.random() * 1e4)}`,
    at: now,
    side: 'attack',
    foe: { playerId: opponentId ?? null, nickname: null },
    win,
    delta,
    seed,
    attack,
    defense: defSnapshot,
  };
  if (defenderPid) {
    report.foe.nickname = db.players[defenderPid]?.nickname ?? null;
    pushReport(defenderPid, {
      ...report,
      side: 'defense',
      win: !win,
      delta: -Math.round(delta / 2),
      foe: { playerId: player.id, nickname: player.nickname },
    });
  }
  pushReport(player.id, report);
  saveDb();

  return {
    ...sim,
    win,
    delta,
    rating: db.arena.ratings[player.id],
    dailyUsed: daily.used,
    free: FREE_PER_DAY,
  };
}

function pushReport(pid, report) {
  const db = loadDb();
  const list = (db.arena.reports[pid] ??= []);
  list.unshift(report);
  if (list.length > REPORT_KEEP) list.length = REPORT_KEEP;
}

export function reports(player) {
  const db = loadDb();
  return db.arena.reports[player.id] ?? [];
}

export function leaderboard(now = Date.now()) {
  ensureSeason(now);
  const db = loadDb();
  return Object.values(db.players)
    .map((p) => ({ ...publicProfile(p, db), rating: ratingOf(p.id) }))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 50);
}

const BOT_NAMES = ['月下斬', '鐵手套', '疾風之影', '碎星者', '白霜', '燼滅之心', '守夜人', '雷鳴', '深藍', '流浪劍豪'];
