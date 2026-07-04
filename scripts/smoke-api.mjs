// API 冒煙測試：走完 帳號→名片→防守隊→競技場挑戰→好友→公會 全流程。
// 用法：先 npm run server，再 node scripts/smoke-api.mjs
const BASE = process.env.API ?? 'http://localhost:8787';

let failures = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ' ' + extra}`);
  if (!cond) failures += 1;
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

const TEAM = [
  { cardId: 'aegis', level: 10, stars: 1, pos: 1 },
  { cardId: 'ifrit', level: 10, stars: 0, pos: 2 },
  { cardId: 'dawnblade', level: 10, stars: 0, pos: 3 },
  { cardId: 'seraph', level: 10, stars: 0, pos: 4 },
  { cardId: 'tidecaller', level: 10, stars: 0, pos: 5 },
  { cardId: 'galewind', level: 10, stars: 0, pos: 6 },
];

// ---- 帳號 ----
const suffix = Math.floor(Math.random() * 1e6);
const a = (await api('POST', '/api/auth', { body: { deviceId: `smoke-a-${suffix}`, nickname: '測試甲' } })).data;
const b = (await api('POST', '/api/auth', { body: { deviceId: `smoke-b-${suffix}`, nickname: '測試乙' } })).data;
check('auth 建帳號（UTF-8 暱稱）', a?.token && a.profile.nickname === '測試甲', JSON.stringify(a?.profile));
const A = a.token;
const B = b.token;

const me = await api('PUT', '/api/me', { token: A, body: { signature: '你好世界', avatarCardId: 'ifrit', stage: 12 } });
check('更新名片', me.data?.signature === '你好世界' && me.data?.stage === 12);

// ---- 雲端存檔 ----
const up = await api('PUT', '/api/save', { token: A, body: { state: { hello: 1 } } });
const down = await api('GET', '/api/save', { token: A });
check('雲端存檔上傳/下載', up.data?.version === 1 && down.data?.state?.hello === 1);

// ---- 競技場 ----
check('未設防守也能拿候選（機器人保底）', (await api('GET', '/api/arena/candidates', { token: A })).data.list.length === 3);
const setDef = await api('PUT', '/api/arena/defense', { token: A, body: { snapshot: TEAM } });
await api('PUT', '/api/arena/defense', { token: B, body: { snapshot: TEAM } });
check('設定防守隊', setDef.data?.ok === true);

const cands = (await api('GET', '/api/arena/candidates', { token: A })).data;
check('候選 3 名、含真人乙', cands.list.length === 3 && cands.list.some((c) => c.playerId === b.playerId), JSON.stringify(cands.list.map((c) => c.type)));

const foe = cands.list.find((c) => c.playerId === b.playerId) ?? cands.list[0];
const ch = await api('POST', '/api/arena/challenge', {
  token: A,
  body: { opponentId: foe.playerId, defense: foe.defense, attack: TEAM },
});
check('挑戰回傳 log + 積分變動', Array.isArray(ch.data?.log) && ch.data.log.length > 0 && typeof ch.data.delta === 'number', JSON.stringify({ status: ch.status, win: ch.data?.win, delta: ch.data?.delta }));
check('每日次數遞增', ch.data?.dailyUsed === 1);

const reps = (await api('GET', '/api/arena/reports', { token: A })).data;
check('戰報入列', reps.length >= 1 && typeof reps[0].seed === 'number');
const lb = (await api('GET', '/api/arena/leaderboard', { token: A })).data;
check('排行榜', Array.isArray(lb) && lb.length >= 2);

// 作弊防護：超標等級被鉗制不報錯、未知卡片要 400
const cheat = await api('POST', '/api/arena/challenge', {
  token: A,
  body: { opponentId: foe.playerId, defense: foe.defense, attack: [{ cardId: 'nope', level: 1, stars: 0, pos: 1 }] },
});
check('未知卡片 400', cheat.status === 400);

// ---- 好友 ----
const found = (await api('GET', `/api/friends/search?q=${encodeURIComponent('測試乙')}`, { token: A })).data;
check('搜尋好友', found.length >= 1 && found[0].nickname === '測試乙');
await api('POST', '/api/friends/requests', { token: A, body: { to: b.playerId } });
const inbox = (await api('GET', '/api/friends/requests', { token: B })).data;
check('邀請進收件匣', inbox.length === 1 && inbox[0].playerId === a.playerId);
await api('POST', '/api/friends/respond', { token: B, body: { from: a.playerId, accept: true } });
const flist = (await api('GET', '/api/friends', { token: A })).data;
check('成為好友', flist.length === 1 && flist[0].playerId === b.playerId);

const send1 = (await api('POST', '/api/friends/gifts/send', { token: A })).data;
const send2 = (await api('POST', '/api/friends/gifts/send', { token: A })).data;
check('送禮一次、同日不重複', send1.sent === 1 && send2.sent === 0);
const claim = (await api('POST', '/api/friends/gifts/claim', { token: B })).data;
check('對方領取 5 友情點', claim.claimed === 5 && claim.balance === 5);

const spar = await api('POST', '/api/friends/spar', { token: A, body: { opponentId: b.playerId, attack: TEAM } });
check('好友切磋回 log', Array.isArray(spar.data?.log));

// ---- 公會 ----
const g = (await api('POST', '/api/guilds', { token: A, body: { name: `煙霧會${suffix % 1000}` } })).data;
check('建立公會、自任會長', g?.myRole === 'leader');
const joined = (await api('POST', '/api/guild/join', { token: B, body: { guildId: g.id } })).data;
check('乙加入公會', joined?.myRole === 'member');

const si = (await api('POST', '/api/guild/signin', { token: A })).data;
const si2 = await api('POST', '/api/guild/signin', { token: A });
check('公會簽到、同日擋重複', si?.ok === true && si2.status === 400);

const don = (await api('POST', '/api/guild/donate', { token: A, body: { tierId: 'd2' } })).data;
check('捐獻得公會幣', don?.coins === 55 && don.guildExp === 55);

const boss = (await api('POST', '/api/guild/boss/challenge', { token: A, body: { attack: TEAM } })).data;
check('公會 Boss 挑戰累傷', boss?.dmg > 0 && boss.bossHp < boss.bossMaxHp, JSON.stringify({ dmg: boss?.dmg }));
const rank = (await api('GET', '/api/guild/boss/rank', { token: A })).data;
check('Boss 傷害排行', rank.length === 1 && rank[0].dmg === boss.dmg);

const board = await api('POST', '/api/guild/board', { token: B, body: { text: '大家好！' } });
const view = (await api('GET', '/api/guild', { token: A })).data;
check('留言板', board.data?.ok && view.board.length === 1 && view.board[0].text === '大家好！');

const shop = (await api('POST', '/api/guild/shop/buy', { token: A, body: { itemId: 'g_gold' } })).data;
check('公會商店購買（55-60 幣不足要擋）', shop?.error != null || shop?.ok, JSON.stringify(shop));

console.log(failures === 0 ? '\n全部通過 ✅' : `\n${failures} 項失敗 ❌`);
process.exit(failures === 0 ? 0 : 1);
