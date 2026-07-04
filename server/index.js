// 遊戲後端：node:http + 手寫路由，零外部依賴。
// 啟動：npm run server（port 8787；vite dev 以 /api 代理過來）。
// 防作弊原則：戰鬥一律伺服器模擬（與前端共用 src/battle 引擎），客端只回報意圖。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { loadDb, persistNow } from './db.js';
import { authenticate, playerByToken, updateProfile, publicProfile, uploadSave, downloadSave, httpError } from './players.js';
import * as arena from './arena.js';
import * as friends from './friends.js';
import * as guild from './guild.js';
import { runBattle } from './battleSim.js';

const PORT = config.port;

// 路由表：'METHOD /path' → handler({ player, body, query, params })
// path 支援 :param 佔位。auth:false 的端點不需 token。
const routes = [];
function route(method, path, handler, { auth = true } = {}) {
  const keys = [];
  const pattern = new RegExp(
    '^' + path.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$'
  );
  routes.push({ method, pattern, keys, handler, auth });
}

/* ---------------- 帳號 / 名片 / 雲端存檔 ---------------- */
route('POST', '/api/auth', ({ body }) => authenticate(body ?? {}), { auth: false });
route('GET', '/api/me', ({ player }) => publicProfile(player));
route('PUT', '/api/me', ({ player, body }) => updateProfile(player, body ?? {}));
route('GET', '/api/players/:id', ({ params }) => {
  const p = loadDb().players[params.id];
  if (!p) throw httpError(404, '玩家不存在');
  return publicProfile(p);
});
route('PUT', '/api/save', ({ player, body }) => uploadSave(player, body?.state ?? null));
route('GET', '/api/save', ({ player }) => downloadSave(player) ?? { state: null, version: 0 });

/* ---------------- 競技場 ---------------- */
route('PUT', '/api/arena/defense', ({ player, body }) => arena.setDefense(player, body?.snapshot));
route('GET', '/api/arena/candidates', ({ player }) => arena.candidates(player));
route('POST', '/api/arena/challenge', ({ player, body }) => arena.challenge(player, body ?? {}));
route('GET', '/api/arena/reports', ({ player }) => arena.reports(player));
route('GET', '/api/arena/leaderboard', () => arena.leaderboard());

/* ---------------- 好友 ---------------- */
route('GET', '/api/friends', ({ player }) => friends.list(player));
route('GET', '/api/friends/search', ({ player, query }) => friends.search(player, query.q));
route('GET', '/api/friends/requests', ({ player }) => friends.incoming(player));
route('POST', '/api/friends/requests', ({ player, body }) => friends.request(player, body?.to));
route('POST', '/api/friends/respond', ({ player, body }) => friends.respond(player, body?.from, !!body?.accept));
route('DELETE', '/api/friends/:id', ({ player, params }) => friends.remove(player, params.id));
route('POST', '/api/friends/gifts/send', ({ player }) => friends.sendGifts(player));
route('POST', '/api/friends/gifts/claim', ({ player }) => friends.claimGifts(player));
route('GET', '/api/friends/points', ({ player }) => friends.points(player));
route('GET', '/api/friends/shop', () => friends.FRIEND_SHOP, { auth: false });
route('POST', '/api/friends/shop/buy', ({ player, body }) => friends.buyFriendShop(player, body?.itemId));
// 好友切磋：不動積分/次數，純模擬回放
route('POST', '/api/friends/spar', ({ player, body }) => {
  const db = loadDb();
  const def = db.arena.defenses[body?.opponentId];
  if (!def) throw httpError(404, '對方尚未設定防守隊');
  return runBattle(body?.attack, def, Math.floor(Math.random() * 2 ** 31));
});

/* ---------------- 公會 ---------------- */
route('GET', '/api/guilds', ({ player }) => guild.listGuilds(player));
route('POST', '/api/guilds', ({ player, body }) => guild.createGuild(player, body ?? {}));
route('GET', '/api/guild', ({ player }) => {
  const g = guild.guildOf(player.id);
  return { guild: g ? guild.guildView(g, player) : null }; // 包一層：router 會把裸 null 換成 {ok:true}
});
route('POST', '/api/guild/join', ({ player, body }) => guild.joinGuild(player, body?.guildId));
route('POST', '/api/guild/approve', ({ player, body }) => guild.approveJoin(player, body?.playerId, !!body?.accept));
route('POST', '/api/guild/leave', ({ player }) => guild.leaveGuild(player));
route('POST', '/api/guild/role', ({ player, body }) => guild.setRole(player, body?.playerId, body?.role));
route('POST', '/api/guild/kick', ({ player, body }) => guild.kick(player, body?.playerId));
route('POST', '/api/guild/signin', ({ player }) => guild.signin(player));
route('POST', '/api/guild/donate', ({ player, body }) => guild.donate(player, body?.tierId));
route('POST', '/api/guild/shop/buy', ({ player, body }) => guild.buyShop(player, body?.itemId));
route('POST', '/api/guild/board', ({ player, body }) => guild.postBoard(player, body?.text));
route('POST', '/api/guild/notice', ({ player, body }) => guild.setNotice(player, body?.text));
route('POST', '/api/guild/boss/challenge', ({ player, body }) => guild.bossChallenge(player, body?.attack));
route('GET', '/api/guild/boss/rank', ({ player }) => guild.bossRank(player));

route('GET', '/api/health', () => ({ ok: true, at: Date.now() }), { auth: false });

/* ---------------- HTTP 伺服器 ---------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  // CORS（開發期全開；正式部署同源時可 CORS_ORIGIN=off 關掉）
  if (config.corsOrigin !== 'off') {
    res.setHeader('Access-Control-Allow-Origin', config.corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // 非 /api → 靜態檔（STATIC_DIR 設定時；單容器部署＝前端+API 同源）
  if (!url.pathname.startsWith('/api')) {
    if (config.staticDir) { serveStatic(url.pathname, res); return; }
    send(res, 404, { error: '不存在的端點' });
    return;
  }

  const match = routes.find((r) => r.method === req.method && r.pattern.test(url.pathname));
  if (!match) { send(res, 404, { error: '不存在的端點' }); return; }

  try {
    let player = null;
    if (match.auth) {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      player = playerByToken(token);
      if (!player) { send(res, 401, { error: '未登入' }); return; }
    }
    const m = url.pathname.match(match.pattern);
    const params = Object.fromEntries(match.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const body = await readBody(req);
    const result = await match.handler({ player, body, params, query: Object.fromEntries(url.searchParams) });
    send(res, 200, result ?? { ok: true });
  } catch (err) {
    const status = err.status ?? 500;
    if (status === 500) console.error('[server]', err);
    send(res, status, { error: err.message ?? '伺服器錯誤' });
  }
});

// 靜態檔伺服（SPA：找不到的路徑退回 index.html）。只在 STATIC_DIR 設定時啟用。
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.json': 'application/json', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};
function serveStatic(pathname, res) {
  const root = path.resolve(config.staticDir);
  let file = path.resolve(root, '.' + pathname.replaceAll('..', ''));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  try {
    const buf = fs.readFileSync(file);
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      // 帶 hash 的資產可長快取；HTML 不快取
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400',
    });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end();
  }
}

function send(res, status, data) {
  const buf = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(buf);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 5 * 1024 * 1024) { reject(httpError(413, '內容過大')); req.destroy(); }
    });
    req.on('end', () => {
      if (!raw) { resolve(null); return; }
      try { resolve(JSON.parse(raw)); } catch { resolve(null); }
    });
    req.on('error', reject);
  });
}

loadDb();
server.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}（Ctrl+C 結束）`);
  console.log(`[server] 驅動=${config.dbDriver} 資料=${config.dataDir}${config.staticDir ? ` 靜態=${config.staticDir}` : ''}`);
});
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { persistNow(); process.exit(0); });
}
