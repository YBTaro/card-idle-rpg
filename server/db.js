// JSON 檔資料庫：開發期輕量儲存（之後可換 SQLite/Postgres，介面不變）。
// 單行程假設：Node 伺服器單實例，記憶體為真相、防抖落地（tmp+rename 原子寫）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const FILE = path.join(DIR, 'db.json');

function emptyDb() {
  return {
    players: {},   // pid → { id, token, deviceId, nickname, avatarCardId, signature, stage, createdAt, lastSeen }
    saves: {},     // pid → { state, version, at }（雲端備份）
    arena: {
      seasonId: null,
      ratings: {},   // pid → number
      daily: {},     // pid → { day, used }
      defenses: {},  // pid → [{cardId, level, stars, pos} ×6]
      reports: {},   // pid → [report...]（最新在前，最多 20）
    },
    friends: {
      links: [],     // [pidA, pidB]（排序後成對，唯一）
      requests: [],  // { from, to, at }
      gifts: [],     // { from, to, day }（防同日重複）
      points: {},    // pid → { balance }
      pending: {},   // pid → 待領友情點數（收禮箱）
    },
    guilds: {},      // gid → guild
    guildOf: {},     // pid → gid
    seq: 1,
  };
}

let db = null;
let _timer = null;

export function loadDb() {
  if (db) return db;
  try {
    db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    // 欄位補齊（schema 演進）
    const base = emptyDb();
    for (const k of Object.keys(base)) db[k] ??= base[k];
    for (const k of Object.keys(base.arena)) db.arena[k] ??= base.arena[k];
    for (const k of Object.keys(base.friends)) db.friends[k] ??= base.friends[k];
  } catch {
    db = emptyDb();
  }
  return db;
}

export function saveDb() {
  if (_timer) return;
  _timer = setTimeout(() => {
    _timer = null;
    persistNow();
  }, 200);
}

export function persistNow() {
  if (!db) return;
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE);
}

export function nextId(prefix) {
  const d = loadDb();
  d.seq += 1;
  return `${prefix}${d.seq}`;
}

// 測試用：重置為全新空庫（不落地）。
export function _resetForTest() {
  db = emptyDb();
  return db;
}
