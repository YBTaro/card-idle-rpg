// 資料層：記憶體為真相、持久化可插拔（DB_DRIVER=json|sqlite）。
// 業務模組只碰 loadDb()/saveDb()，換驅動（甚至將來換 Postgres repo 層）不動業務碼。
// - json（開發預設）：單一 db.json，tmp+rename 原子寫
// - sqlite（正式）：node:sqlite WAL，逐 collection 存列，單檔可備份
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

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
      links: [],     // 'a|b'（排序成對，唯一）
      requests: [],  // { from, to, at }
      gifts: [],     // { from, to, day }（防同日重複）
      points: {},    // pid → { balance }
      pending: {},   // pid → 待領友情點（收禮箱）
    },
    guilds: {},      // gid → guild
    guildOf: {},     // pid → gid
    seq: 1,
  };
}

// 補齊 schema（新版欄位）——兩種驅動共用。
function upgrade(db) {
  const base = emptyDb();
  for (const k of Object.keys(base)) db[k] ??= base[k];
  for (const k of Object.keys(base.arena)) db.arena[k] ??= base.arena[k];
  for (const k of Object.keys(base.friends)) db.friends[k] ??= base.friends[k];
  return db;
}

/* ---------------- json 驅動 ---------------- */
function jsonStore() {
  const file = path.join(config.dataDir, 'db.json');
  return {
    load() {
      try { return upgrade(JSON.parse(fs.readFileSync(file, 'utf8'))); }
      catch { return emptyDb(); }
    },
    persist(db) {
      fs.mkdirSync(config.dataDir, { recursive: true });
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(db));
      fs.renameSync(tmp, file);
    },
  };
}

/* ---------------- sqlite 驅動（node:sqlite，零外部依賴） ---------------- */
function sqliteStore() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  // 動態 import 放模組頂層會在 json 模式也觸發 ExperimentalWarning——lazy require。
  let sqlite;
  try {
    sqlite = process.getBuiltinModule('node:sqlite');
  } catch { /* fall through */ }
  if (!sqlite?.DatabaseSync) {
    console.warn('[db] node:sqlite 不可用，退回 json 驅動');
    return jsonStore();
  }
  const conn = new sqlite.DatabaseSync(path.join(config.dataDir, 'game.db'));
  conn.exec('PRAGMA journal_mode = WAL');
  conn.exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
  const upsert = conn.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v');
  const selectAll = conn.prepare('SELECT k, v FROM kv');
  return {
    load() {
      const db = emptyDb();
      for (const row of selectAll.all()) {
        try { db[row.k] = JSON.parse(row.v); } catch { /* 略過壞列 */ }
      }
      return upgrade(db);
    },
    persist(db) {
      conn.exec('BEGIN');
      try {
        for (const k of Object.keys(db)) upsert.run(k, JSON.stringify(db[k]));
        conn.exec('COMMIT');
      } catch (err) {
        conn.exec('ROLLBACK');
        throw err;
      }
    },
  };
}

/* ---------------- 對業務模組的介面（不變） ---------------- */
let store = null;
let db = null;
let _timer = null;

function ensureStore() {
  if (!store) store = config.dbDriver === 'sqlite' ? sqliteStore() : jsonStore();
  return store;
}

export function loadDb() {
  if (!db) db = ensureStore().load();
  return db;
}

// 防抖落地（200ms 合併寫入）。
export function saveDb() {
  if (_timer) return;
  _timer = setTimeout(() => {
    _timer = null;
    persistNow();
  }, 200);
}

export function persistNow() {
  if (!db) return;
  ensureStore().persist(db);
}

export function nextId(prefix) {
  const d = loadDb();
  d.seq += 1;
  return `${prefix}${d.seq}`;
}

// 測試用：重置為全新空庫（不落地、不碰驅動）。
export function _resetForTest() {
  db = emptyDb();
  return db;
}
