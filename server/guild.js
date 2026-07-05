// 公會：建立/加入/簽到/捐獻/商店/留言板/公會 Boss（伺服器模擬、累計傷害排行）。
import { loadDb, saveDb, nextId } from './db.js';
import { publicProfile, httpError } from './players.js';
import { runBattle, totalDamageByTeam0, botSnapshot } from './battleSim.js';

export const MEMBER_CAP = 30;
export const BOSS_TRIES_PER_DAY = 2;
const NAME_MAX = 12;
const BOARD_KEEP = 50;
const WEEK_MS = 7 * 24 * 3600 * 1000;

// 捐獻檔位：金幣（客端扣）→ 公會幣 + 公會經驗
export const DONATE_TIERS = [
  { id: 'd1', gold: 1000, coins: 10, exp: 10 },
  { id: 'd2', gold: 5000, coins: 55, exp: 55 },
  { id: 'd3', gold: 10000, coins: 120, exp: 120 },
];

// 公會等級：exp 門檻（升級擴人數上限與商店貨架）
const LEVEL_EXP = [0, 300, 900, 2000, 4000, 8000];
export const GUILD_SHOP = [
  { id: 'g_essence', name: '精華結晶 ×60', cost: 80, grants: { essence: 60 }, weeklyLimit: 3, minLevel: 1 },
  { id: 'g_ticket', name: '召喚券 ×1', cost: 150, grants: { tickets: 1 }, weeklyLimit: 2, minLevel: 2 },
  { id: 'g_gold', name: '金幣袋 ×20000', cost: 60, grants: { gold: 20000 }, weeklyLimit: 5, minLevel: 1 },
];

const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const weekKey = (now = Date.now()) => Math.floor(now / WEEK_MS);

export function guildOf(pid) {
  const db = loadDb();
  const gid = db.guildOf[pid];
  return gid ? db.guilds[gid] ?? null : null;
}

export function levelOf(guild) {
  let lv = 1;
  for (let i = 1; i < LEVEL_EXP.length; i += 1) if (guild.exp >= LEVEL_EXP[i]) lv = i + 1;
  return lv;
}

export function createGuild(player, { name, joinMode = 'free' }) {
  const db = loadDb();
  if (db.guildOf[player.id]) throw httpError(400, '已有公會，請先退出');
  const clean = String(name ?? '').trim().slice(0, NAME_MAX);
  if (!clean) throw httpError(400, '公會名稱不可為空');
  if (Object.values(db.guilds).some((g) => g.name === clean)) throw httpError(400, '名稱已被使用');
  const gid = nextId('g');
  db.guilds[gid] = {
    id: gid,
    name: clean,
    joinMode: joinMode === 'approval' ? 'approval' : 'free',
    exp: 0,
    notice: '',
    createdAt: Date.now(),
    members: { [player.id]: { role: 'leader', joinedAt: Date.now(), coins: 0, signin: null, donate: null, weeklyActive: 0 } },
    board: [],
    joinRequests: [],
    shopBought: {},   // `${week}|${pid}|${itemId}` → count
    boss: null,       // { week, name, maxHp, hp, dmg: {pid: n}, tries: {pid: {day, used}} }
  };
  db.guildOf[player.id] = gid;
  saveDb();
  return guildView(db.guilds[gid], player);
}

export function listGuilds(player) {
  const db = loadDb();
  return Object.values(db.guilds).map((g) => ({
    id: g.id,
    name: g.name,
    level: levelOf(g),
    joinMode: g.joinMode,
    members: Object.keys(g.members).length,
    cap: MEMBER_CAP,
    notice: g.notice,
  }));
}

export function joinGuild(player, gid) {
  const db = loadDb();
  const g = db.guilds[gid];
  if (!g) throw httpError(404, '公會不存在');
  if (db.guildOf[player.id]) throw httpError(400, '已有公會');
  if (Object.keys(g.members).length >= MEMBER_CAP) throw httpError(400, '公會已滿');
  if (g.joinMode === 'approval') {
    if (!g.joinRequests.includes(player.id)) g.joinRequests.push(player.id);
    saveDb();
    return { pending: true };
  }
  addMember(g, player.id);
  saveDb();
  return guildView(g, player);
}

export function approveJoin(player, targetId, accept) {
  const g = requireRole(player, ['leader', 'officer']);
  const idx = g.joinRequests.indexOf(targetId);
  if (idx < 0) throw httpError(404, '申請不存在');
  g.joinRequests.splice(idx, 1);
  if (accept) {
    if (Object.keys(g.members).length >= MEMBER_CAP) throw httpError(400, '公會已滿');
    addMember(g, targetId);
  }
  saveDb();
  return { ok: true };
}

export function leaveGuild(player) {
  const db = loadDb();
  const g = guildOf(player.id);
  if (!g) throw httpError(400, '不在公會中');
  const me = g.members[player.id];
  delete g.members[player.id];
  delete db.guildOf[player.id];
  const rest = Object.keys(g.members);
  if (rest.length === 0) {
    delete db.guilds[g.id]; // 最後一人離開 → 解散
  } else if (me.role === 'leader') {
    // 會長讓位：副會長優先、否則最資深
    const next = rest
      .map((pid) => ({ pid, m: g.members[pid] }))
      .sort((a, b) => (b.m.role === 'officer') - (a.m.role === 'officer') || a.m.joinedAt - b.m.joinedAt)[0];
    g.members[next.pid].role = 'leader';
  }
  saveDb();
  return { ok: true };
}

export function setRole(player, targetId, role) {
  const g = requireRole(player, ['leader']);
  const m = g.members[targetId];
  if (!m) throw httpError(404, '成員不存在');
  if (!['officer', 'member'].includes(role)) throw httpError(400, '不合法職務');
  if (role === 'officer' && Object.values(g.members).filter((x) => x.role === 'officer').length >= 2) {
    throw httpError(400, '副會長最多 2 名');
  }
  m.role = role;
  saveDb();
  return { ok: true };
}

export function kick(player, targetId) {
  const g = requireRole(player, ['leader', 'officer']);
  const m = g.members[targetId];
  if (!m) throw httpError(404, '成員不存在');
  if (m.role === 'leader') throw httpError(400, '不能踢會長');
  const db = loadDb();
  delete g.members[targetId];
  delete db.guildOf[targetId];
  saveDb();
  return { ok: true };
}

export function signin(player, now = Date.now()) {
  const g = requireGuild(player);
  const me = g.members[player.id];
  const day = dayKey(now);
  if (me.signin === day) throw httpError(400, '今日已簽到');
  me.signin = day;
  me.weeklyActive = (me.weeklyActive ?? 0) + 10;
  saveDb();
  return { ok: true, grants: { gold: 2000 }, weeklyActive: me.weeklyActive };
}

export function donate(player, tierId, now = Date.now()) {
  const g = requireGuild(player);
  const tier = DONATE_TIERS.find((t) => t.id === tierId);
  if (!tier) throw httpError(404, '檔位不存在');
  const me = g.members[player.id];
  const day = dayKey(now);
  if (me.donate === day) throw httpError(400, '今日已捐獻');
  me.donate = day;
  me.coins = (me.coins ?? 0) + tier.coins;
  me.weeklyActive = (me.weeklyActive ?? 0) + 10;
  g.exp += tier.exp;
  saveDb();
  return { ok: true, costGold: tier.gold, coins: me.coins, guildExp: g.exp, level: levelOf(g) };
}

export function buyShop(player, itemId, now = Date.now()) {
  const g = requireGuild(player);
  const item = GUILD_SHOP.find((i) => i.id === itemId);
  if (!item) throw httpError(404, '品項不存在');
  if (levelOf(g) < item.minLevel) throw httpError(400, `需公會等級 ${item.minLevel}`);
  const me = g.members[player.id];
  if ((me.coins ?? 0) < item.cost) throw httpError(400, '公會幣不足');
  const key = `${weekKey(now)}|${player.id}|${item.id}`;
  const bought = g.shopBought[key] ?? 0;
  if (bought >= item.weeklyLimit) throw httpError(400, '本週已達限購');
  g.shopBought[key] = bought + 1;
  me.coins -= item.cost;
  saveDb();
  return { ok: true, grants: item.grants, coins: me.coins, bought: g.shopBought[key], weeklyLimit: item.weeklyLimit };
}

export function postBoard(player, text) {
  const g = requireGuild(player);
  const clean = String(text ?? '').trim().slice(0, 80);
  if (!clean) throw httpError(400, '內容不可為空');
  g.board.unshift({ pid: player.id, nickname: player.nickname, text: clean, at: Date.now() });
  if (g.board.length > BOARD_KEEP) g.board.length = BOARD_KEEP;
  saveDb();
  return { ok: true };
}

export function setNotice(player, text) {
  const g = requireRole(player, ['leader', 'officer']);
  g.notice = String(text ?? '').trim().slice(0, 80);
  saveDb();
  return { ok: true };
}

// ---- 公會 Boss（週更）----
const BOSS_NAMES = ['熔核巨像', '霜牙暴龍', '虛空吞噬者', '白骨泰坦'];

export function ensureBoss(g, now = Date.now()) {
  const week = weekKey(now);
  if (!g.boss || g.boss.week !== week) {
    const lv = 10 + levelOf(g) * 8;
    const snap = botSnapshot(lv, 1.15, week * 31 + g.id.length);
    snap[0].boss = true; // 首位（坦）掛 Boss 機制包：階段/破盾/狂暴 + %生命保護
    const maxHp = 200000 + levelOf(g) * 150000;
    g.boss = { week, name: BOSS_NAMES[week % BOSS_NAMES.length], level: lv, snapshot: snap, maxHp, hp: maxHp, dmg: {}, tries: {} };
    saveDb();
  }
  return g.boss;
}

export function bossChallenge(player, attack, now = Date.now()) {
  const g = requireGuild(player);
  const boss = ensureBoss(g, now);
  if (boss.hp <= 0) throw httpError(400, 'Boss 本週已被討伐');
  const day = dayKey(now);
  const t = boss.tries[player.id];
  const tries = !t || t.day !== day ? (boss.tries[player.id] = { day, used: 0 }) : t;
  if (tries.used >= BOSS_TRIES_PER_DAY) throw httpError(429, '今日 Boss 次數已用完');

  const seed = Math.floor(Math.random() * 2 ** 31);
  const sim = runBattle(attack, boss.snapshot, seed);
  const dmg = Math.min(boss.hp, totalDamageByTeam0(sim));
  boss.hp -= dmg;
  boss.dmg[player.id] = (boss.dmg[player.id] ?? 0) + dmg;
  tries.used += 1;
  const me = g.members[player.id];
  me.weeklyActive = (me.weeklyActive ?? 0) + 5;
  // 貢獻換公會幣：每 10000 傷害 1 幣（下取整、即時入帳）
  const coins = Math.floor(dmg / 10000);
  me.coins = (me.coins ?? 0) + coins;
  saveDb();
  return { ...sim, dmg, coinsGained: coins, bossHp: boss.hp, bossMaxHp: boss.maxHp, dailyUsed: tries.used };
}

export function bossRank(player) {
  const g = requireGuild(player);
  const boss = ensureBoss(g);
  const db = loadDb();
  return Object.entries(boss.dmg)
    .map(([pid, dmg]) => ({ pid, dmg, nickname: db.players[pid]?.nickname ?? '?' }))
    .sort((a, b) => b.dmg - a.dmg);
}

// ---- 視圖 ----
export function guildView(g, player) {
  const db = loadDb();
  const boss = ensureBoss(g);
  return {
    id: g.id,
    name: g.name,
    level: levelOf(g),
    exp: g.exp,
    nextExp: LEVEL_EXP[levelOf(g)] ?? null,
    joinMode: g.joinMode,
    notice: g.notice,
    myRole: g.members[player.id]?.role ?? null,
    myCoins: g.members[player.id]?.coins ?? 0,
    mySignin: g.members[player.id]?.signin ?? null,
    myDonate: g.members[player.id]?.donate ?? null,
    members: Object.entries(g.members).map(([pid, m]) => ({
      ...publicProfile(db.players[pid] ?? { id: pid, nickname: '?', lastSeen: 0 }, db),
      role: m.role,
      weeklyActive: m.weeklyActive ?? 0,
    })),
    joinRequests: g.joinRequests.map((pid) => publicProfile(db.players[pid] ?? { id: pid, nickname: '?' }, db)),
    board: g.board,
    boss: { name: boss.name, level: boss.level, hp: boss.hp, maxHp: boss.maxHp, week: boss.week },
    shop: GUILD_SHOP,
    donateTiers: DONATE_TIERS,
  };
}

function addMember(g, pid) {
  const db = loadDb();
  g.members[pid] = { role: 'member', joinedAt: Date.now(), coins: 0, signin: null, donate: null, weeklyActive: 0 };
  db.guildOf[pid] = g.id;
}

function requireGuild(player) {
  const g = guildOf(player.id);
  if (!g) throw httpError(400, '尚未加入公會');
  return g;
}

function requireRole(player, roles) {
  const g = requireGuild(player);
  if (!roles.includes(g.members[player.id]?.role)) throw httpError(403, '權限不足');
  return g;
}
