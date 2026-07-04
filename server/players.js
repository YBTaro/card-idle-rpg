// 玩家帳號與名片：裝置匿名帳號（deviceId → player + token）、profile、雲端存檔。
import crypto from 'node:crypto';
import { loadDb, saveDb } from './db.js';

const NICK_MAX = 12;
const SIGN_MAX = 30;

export function authenticate({ deviceId, nickname }) {
  if (!deviceId || typeof deviceId !== 'string') throw httpError(400, 'deviceId 必填');
  const db = loadDb();
  let player = Object.values(db.players).find((p) => p.deviceId === deviceId);
  if (!player) {
    const id = crypto.randomUUID();
    player = {
      id,
      token: crypto.randomBytes(24).toString('hex'),
      deviceId,
      nickname: sanitizeNick(nickname) || `指揮官${id.slice(0, 4)}`,
      avatarCardId: null,
      signature: '',
      stage: 1,
      createdAt: Date.now(),
      lastSeen: Date.now(),
    };
    db.players[id] = player;
    saveDb();
  }
  player.lastSeen = Date.now();
  saveDb();
  return { playerId: player.id, token: player.token, profile: publicProfile(player) };
}

// token → player（router 的 auth middleware 用）。
export function playerByToken(token) {
  if (!token) return null;
  const db = loadDb();
  const p = Object.values(db.players).find((x) => x.token === token);
  if (p) {
    p.lastSeen = Date.now();
    saveDb();
  }
  return p ?? null;
}

export function updateProfile(player, { nickname, avatarCardId, signature, stage }) {
  if (nickname != null) {
    const nick = sanitizeNick(nickname);
    if (!nick) throw httpError(400, '暱稱不可為空');
    player.nickname = nick;
  }
  if (avatarCardId !== undefined) player.avatarCardId = avatarCardId;
  if (signature != null) player.signature = String(signature).slice(0, SIGN_MAX);
  if (stage != null) player.stage = Math.max(player.stage, Math.min(9999, Number(stage) || 1)); // 只升不降
  saveDb();
  return publicProfile(player);
}

// 對其他玩家可見的名片資料（不含 token/deviceId）。
export function publicProfile(player, db = loadDb()) {
  return {
    playerId: player.id,
    nickname: player.nickname,
    avatarCardId: player.avatarCardId,
    signature: player.signature,
    stage: player.stage,
    lastSeen: player.lastSeen,
    rating: db.arena.ratings[player.id] ?? null,
    defense: db.arena.defenses[player.id] ?? null,
    guildId: db.guildOf[player.id] ?? null,
    guildName: db.guildOf[player.id] ? db.guilds[db.guildOf[player.id]]?.name ?? null : null,
  };
}

export function uploadSave(player, state) {
  const db = loadDb();
  const prev = db.saves[player.id];
  db.saves[player.id] = { state, version: (prev?.version ?? 0) + 1, at: Date.now() };
  saveDb();
  return { version: db.saves[player.id].version };
}

export function downloadSave(player) {
  const db = loadDb();
  return db.saves[player.id] ?? null;
}

function sanitizeNick(nick) {
  return String(nick ?? '').trim().slice(0, NICK_MAX);
}

export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
