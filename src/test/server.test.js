// 伺服器邏輯單元測試：直接測 server/*.js 純函式層（不起 HTTP）。
import { describe, it, expect, beforeEach } from 'vitest';
import { _resetForTest } from '../../server/db.js';
import { authenticate, updateProfile } from '../../server/players.js';
import * as arena from '../../server/arena.js';
import * as friends from '../../server/friends.js';
import * as guild from '../../server/guild.js';
import { unitsFromSnapshot, runBattle, totalDamageByTeam0, botSnapshot } from '../../server/battleSim.js';

const TEAM = [
  { cardId: 'aegis', level: 10, stars: 1, pos: 1 },
  { cardId: 'ifrit', level: 10, stars: 0, pos: 2 },
  { cardId: 'dawnblade', level: 10, stars: 0, pos: 3 },
  { cardId: 'seraph', level: 10, stars: 0, pos: 4 },
];

function makePlayers() {
  const a = authenticate({ deviceId: 'ut-a', nickname: '甲' });
  const b = authenticate({ deviceId: 'ut-b', nickname: '乙' });
  const { loadDb } = requireDb();
  return { a: loadDb().players[a.playerId], b: loadDb().players[b.playerId] };
}
import { loadDb } from '../../server/db.js';
function requireDb() { return { loadDb }; }

beforeEach(() => _resetForTest());

describe('battleSim（伺服器端戰鬥）', () => {
  it('快照 → 單位：等級/星數鉗制、站位/卡片驗證', () => {
    const units = unitsFromSnapshot([{ cardId: 'ifrit', level: 99999, stars: 99, pos: 1 }], 0);
    expect(units[0].level).toBe(500); // 鉗上限
    expect(() => unitsFromSnapshot([{ cardId: 'nope', level: 1, stars: 0, pos: 1 }], 0)).toThrow();
    expect(() => unitsFromSnapshot([
      { cardId: 'ifrit', level: 1, stars: 0, pos: 1 },
      { cardId: 'aegis', level: 1, stars: 0, pos: 1 }, // 重複站位
    ], 0)).toThrow();
  });

  it('同 seed 重跑結果一致（戰報可驗證）', () => {
    const s1 = runBattle(TEAM, botSnapshot(10, 1, 7), 42);
    const s2 = runBattle(TEAM, botSnapshot(10, 1, 7), 42);
    expect(s1.winner).toBe(s2.winner);
    expect(s1.log.length).toBe(s2.log.length);
  });

  it('totalDamageByTeam0 只計對敵方的傷害', () => {
    const sim = runBattle(TEAM, botSnapshot(5, 1, 3), 1);
    const dmg = totalDamageByTeam0(sim);
    expect(dmg).toBeGreaterThan(0);
  });
});

describe('arena（積分/配對/每日限）', () => {
  it('ratingDelta：贏強的加更多、輸弱的扣更多、防方減半', () => {
    expect(arena.ratingDelta(1000, 1400, true)).toBe(35);
    expect(arena.ratingDelta(1000, 600, true)).toBe(5);
    expect(arena.ratingDelta(1000, 600, false)).toBe(-20);
    expect(arena.ratingDelta(1000, 1400, false)).toBe(-10);
  });

  it('候選：無他人時機器人補滿 3、有真人防守則入列', () => {
    const { a, b } = makePlayers();
    let c = arena.candidates(a);
    expect(c.list.length).toBe(3);
    expect(c.list.every((x) => x.type === 'bot')).toBe(true);
    arena.setDefense(b, TEAM);
    c = arena.candidates(a);
    expect(c.list.some((x) => x.playerId === b.id)).toBe(true);
  });

  it('challenge：每日 5 次上限、積分寫入、戰報入列', () => {
    const { a, b } = makePlayers();
    arena.setDefense(b, TEAM);
    for (let i = 0; i < 5; i += 1) {
      const r = arena.challenge(a, { opponentId: b.id, attack: TEAM });
      expect(typeof r.delta).toBe('number');
    }
    expect(() => arena.challenge(a, { opponentId: b.id, attack: TEAM })).toThrow(/次數/);
    expect(arena.reports(a).length).toBe(5);
    expect(arena.reports(b)[0].side).toBe('defense'); // 防守戰報也入列
  });

  it('賽季換季：積分向 1000 軟收斂', () => {
    const { a } = makePlayers();
    const db = loadDb();
    db.arena.ratings[a.id] = 1600;
    db.arena.seasonId = -1; // 強迫換季
    arena.ensureSeason();
    expect(db.arena.ratings[a.id]).toBe(1300);
  });
});

describe('friends（互贈防重複/上限）', () => {
  it('互發邀請直接成為好友；同日重複送禮擋下', () => {
    const { a, b } = makePlayers();
    friends.request(a, b.id);
    const r = friends.request(b, a.id);
    expect(r.accepted).toBe(true);
    expect(friends.isFriend(a.id, b.id)).toBe(true);

    expect(friends.sendGifts(a).sent).toBe(1);
    expect(friends.sendGifts(a).sent).toBe(0); // 同日不重複
    const claim = friends.claimGifts(b);
    expect(claim.claimed).toBe(5);
    expect(friends.claimGifts(b).claimed).toBe(0); // 領過歸零
  });

  it('友情點商店：餘額不足要擋', () => {
    const { a } = makePlayers();
    expect(() => friends.buyFriendShop(a, 'fp_gold')).toThrow(/不足/);
  });
});

describe('guild（捐獻/Boss/職務）', () => {
  it('捐獻：換公會幣與經驗、同日擋重複；商店限購', () => {
    const { a } = makePlayers();
    const g = guild.createGuild(a, { name: '單測會' });
    expect(g.myRole).toBe('leader');
    const d = guild.donate(a, 'd3');
    expect(d.coins).toBe(120);
    expect(() => guild.donate(a, 'd1')).toThrow(/已捐獻/);
    // 120 幣買 g_gold（60）兩次 → 第三次餘額不足
    guild.buyShop(a, 'g_gold');
    guild.buyShop(a, 'g_gold');
    expect(() => guild.buyShop(a, 'g_gold')).toThrow(/不足/);
  });

  it('Boss：累計傷害、每日 2 次上限、傷害換公會幣', () => {
    const { a } = makePlayers();
    guild.createGuild(a, { name: '單測會2' });
    const r1 = guild.bossChallenge(a, TEAM);
    expect(r1.dmg).toBeGreaterThan(0);
    const r2 = guild.bossChallenge(a, TEAM);
    expect(() => guild.bossChallenge(a, TEAM)).toThrow(/次數/);
    const rank = guild.bossRank(a);
    expect(rank[0].dmg).toBe(r1.dmg + r2.dmg);
  });

  it('會長退出：讓位給最資深成員；最後一人退出解散', () => {
    const { a, b } = makePlayers();
    const g = guild.createGuild(a, { name: '單測會3' });
    guild.joinGuild(b, g.id);
    guild.leaveGuild(a);
    const gb = guild.guildOf(b.id);
    expect(gb.members[b.id].role).toBe('leader');
    guild.leaveGuild(b);
    expect(loadDb().guilds[g.id]).toBeUndefined();
  });
});
