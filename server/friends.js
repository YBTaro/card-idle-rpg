// 好友：搜尋/邀請/同意/列表/每日互贈友情點。REST 輪詢即可，無即時需求。
import { loadDb, saveDb } from './db.js';
import { publicProfile, httpError } from './players.js';

export const FRIEND_CAP = 30;
export const GIFT_POINTS = 5;

const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const pairKey = (a, b) => [a, b].sort().join('|');

export function isFriend(a, b) {
  const db = loadDb();
  return db.friends.links.includes(pairKey(a, b));
}

export function friendIds(pid) {
  const db = loadDb();
  return db.friends.links
    .filter((k) => k.split('|').includes(pid))
    .map((k) => k.split('|').find((x) => x !== pid));
}

export function search(player, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return [];
  const db = loadDb();
  return Object.values(db.players)
    .filter((p) => p.id !== player.id)
    .filter((p) => p.nickname.toLowerCase().includes(q) || p.id.startsWith(q))
    .slice(0, 10)
    .map((p) => ({ ...publicProfile(p, db), isFriend: isFriend(player.id, p.id) }));
}

export function request(player, toId) {
  const db = loadDb();
  if (!db.players[toId]) throw httpError(404, '玩家不存在');
  if (toId === player.id) throw httpError(400, '不能加自己');
  if (isFriend(player.id, toId)) throw httpError(400, '已是好友');
  if (friendIds(player.id).length >= FRIEND_CAP) throw httpError(400, '好友已達上限');
  const dup = db.friends.requests.find((r) => r.from === player.id && r.to === toId);
  if (dup) return { ok: true }; // 冪等
  // 對方也發過邀請 → 直接成為好友
  const reverse = db.friends.requests.findIndex((r) => r.from === toId && r.to === player.id);
  if (reverse >= 0) {
    db.friends.requests.splice(reverse, 1);
    link(player.id, toId);
    saveDb();
    return { ok: true, accepted: true };
  }
  db.friends.requests.push({ from: player.id, to: toId, at: Date.now() });
  saveDb();
  return { ok: true };
}

export function incoming(player) {
  const db = loadDb();
  return db.friends.requests
    .filter((r) => r.to === player.id)
    .map((r) => ({ at: r.at, ...publicProfile(db.players[r.from], db) }))
    .filter((x) => x.playerId);
}

export function respond(player, fromId, accept) {
  const db = loadDb();
  const idx = db.friends.requests.findIndex((r) => r.from === fromId && r.to === player.id);
  if (idx < 0) throw httpError(404, '邀請不存在');
  db.friends.requests.splice(idx, 1);
  if (accept) {
    if (friendIds(player.id).length >= FRIEND_CAP) throw httpError(400, '好友已達上限');
    if (friendIds(fromId).length >= FRIEND_CAP) throw httpError(400, '對方好友已滿');
    link(player.id, fromId);
  }
  saveDb();
  return { ok: true };
}

export function remove(player, otherId) {
  const db = loadDb();
  const key = pairKey(player.id, otherId);
  db.friends.links = db.friends.links.filter((k) => k !== key);
  saveDb();
  return { ok: true };
}

export function list(player, now = Date.now()) {
  const db = loadDb();
  const day = dayKey(now);
  const sentToday = new Set(db.friends.gifts.filter((g) => g.from === player.id && g.day === day).map((g) => g.to));
  return friendIds(player.id)
    .map((fid) => db.players[fid])
    .filter(Boolean)
    .map((p) => ({
      ...publicProfile(p, db),
      giftSentToday: sentToday.has(p.id),
    }));
}

// 一鍵全送：對每位今日未送過的好友送出友情點（進對方待領箱）。
export function sendGifts(player, now = Date.now()) {
  const db = loadDb();
  const day = dayKey(now);
  let sent = 0;
  for (const fid of friendIds(player.id)) {
    const dup = db.friends.gifts.find((g) => g.from === player.id && g.to === fid && g.day === day);
    if (dup) continue;
    db.friends.gifts.push({ from: player.id, to: fid, day });
    db.friends.pending[fid] = (db.friends.pending[fid] ?? 0) + GIFT_POINTS;
    sent += 1;
  }
  // 清掉三天前的贈禮記錄（防無限成長）
  db.friends.gifts = db.friends.gifts.filter((g) => g.day >= dayKey(now - 3 * 86400000));
  saveDb();
  return { sent };
}

// 領取待領友情點。
export function claimGifts(player) {
  const db = loadDb();
  const got = db.friends.pending[player.id] ?? 0;
  db.friends.pending[player.id] = 0;
  const pts = (db.friends.points[player.id] ??= { balance: 0 });
  pts.balance += got;
  saveDb();
  return { claimed: got, balance: pts.balance };
}

export function points(player) {
  const db = loadDb();
  return { balance: db.friends.points[player.id]?.balance ?? 0, pending: db.friends.pending[player.id] ?? 0 };
}

// 友情點商店（產出封頂靠品項單價與客端週限購；回報應得獎勵，客端入帳）。
export const FRIEND_SHOP = [
  { id: 'fp_gold', name: '金幣袋', cost: 20, grants: { gold: 5000 } },
  { id: 'fp_essence', name: '精華結晶', cost: 50, grants: { essence: 40 } },
];

export function buyFriendShop(player, itemId) {
  const item = FRIEND_SHOP.find((i) => i.id === itemId);
  if (!item) throw httpError(404, '品項不存在');
  const db = loadDb();
  const pts = (db.friends.points[player.id] ??= { balance: 0 });
  if (pts.balance < item.cost) throw httpError(400, '友情點不足');
  pts.balance -= item.cost;
  saveDb();
  return { ok: true, grants: item.grants, balance: pts.balance };
}

function link(a, b) {
  const db = loadDb();
  const key = pairKey(a, b);
  if (!db.friends.links.includes(key)) db.friends.links.push(key);
}
