// 機制拼圖批次（18 名新卡）煙霧測試：
// 每個新啟用的機制軸至少一條「內容真的接上引擎」的驗證（引擎邏輯本身見 newMechanics.test.js）。
import { describe, it, expect } from 'vitest';
import { makeUnit } from './testHelpers.js';
import { dealDamage } from './effects.js';
import { castSkill, CARD_SKILLS, SKILLS } from './skills.js';
import { CARDS } from '../data/cards.js';
import { recomputePassives } from './passives.js';
import { Rng } from '../core/rng.js';

const ctxFor = (caster, allies, enemies) => ({ allies, enemies, rng: new Rng(7), emit: () => {} });

describe('機制拼圖批次：內容接線', () => {
  it('每張新卡都有對應絕技', () => {
    const NEW = ['bulwarkengine', 'insulatower', 'mirrorfox', 'hexweaver', 'deathlessking', 'vengefulshade',
      'huntmarshal', 'mistwarden', 'hornchief', 'moonhowler', 'flamewyrm', 'wyrmmatriarch',
      'miraclenun', 'sanctumjudge', 'godblade', 'siegemarshal', 'warchoir', 'bladeoath'];
    for (const id of NEW) {
      expect({ id, card: !!CARDS[id], skill: !!SKILLS[CARD_SKILLS[id]] }).toEqual({ id, card: true, skill: true });
    }
  });

  it('絕緣力場：全隊獲得格擋護符；下一個減益被彈開', () => {
    const caster = makeUnit({ team: 0, pos: 4 });
    const ally = makeUnit({ team: 0, pos: 1 });
    const foe = makeUnit({ team: 1, pos: 1, atk: 100 });
    castSkill(caster, 'nullField', ctxFor(caster, [caster, ally], [foe]));
    expect(ally.buffs.some((b) => b.kind === 'debuffBlock')).toBe(true);
    // 敵方對 ally 上 dot → 被格擋（不掛 dot、消一層護符）
    castSkill(foe, 'plagueSpread', ctxFor(foe, [foe], [caster, ally]));
    expect(ally.buffs.some((b) => b.kind === 'dot')).toBe(false);
    expect(ally.buffs.some((b) => b.kind === 'debuffBlock')).toBe(false); // 層數用完即消
  });

  it('奪華：偷走目標增益到自己身上', () => {
    const caster = makeUnit({ team: 0, pos: 1, cardId: 'mirrorfox', atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    castSkill(foe, 'rageRend', ctxFor(foe, [foe], [caster])); // 敵人先給自己疊怒
    expect(foe.buffs.some((b) => b.kind === 'stat' && b.stat === 'atk')).toBe(true);
    castSkill(caster, 'graceTheft', ctxFor(caster, [caster], [foe]));
    expect(foe.buffs.some((b) => b.kind === 'stat' && b.stat === 'atk')).toBe(false);
    expect(caster.buffs.some((b) => b.kind === 'stat' && b.stat === 'atk')).toBe(true);
  });

  it('神蹟：最低血隊友獲得免死＋治療', () => {
    const caster = makeUnit({ team: 0, pos: 4, atk: 100 });
    const weak = makeUnit({ team: 0, pos: 1, hp: 1000 });
    weak.hp = 100;
    castSkill(caster, 'miracleWard', ctxFor(caster, [caster, weak], [makeUnit({ team: 1, pos: 1 })]));
    expect(weak.buffs.some((b) => b.kind === 'cheatDeath')).toBe(true);
    expect(weak.hp).toBeGreaterThan(100);
    // 致死傷害 → 留 1 血
    weak.takeDamage(99999);
    expect(weak.hp).toBe(1);
    expect(weak.alive).toBe(true);
  });

  it('職業隊伍技：全坦隊湊 4 坦 → 堅城怒吼全隊攻擊 ×2.05（進場鎖定）', () => {
    const marshal = makeUnit({ team: 0, pos: 1, atk: 100, class: 'tank', passives: CARDS.siegemarshal.passives });
    const tanks = [2, 3, 4].map((pos) => makeUnit({ team: 0, pos, class: 'tank', atk: 100 }));
    const foe = makeUnit({ team: 1, pos: 1 });
    recomputePassives([[marshal, ...tanks], [foe]]);
    expect(marshal.effAtk).toBe(205);
    expect(tanks[0].effAtk).toBe(205);
  });

  it('職業隊伍技：坦不足 4 名 → 不生效', () => {
    const marshal = makeUnit({ team: 0, pos: 1, atk: 100, class: 'tank', passives: CARDS.siegemarshal.passives });
    const others = [2, 3].map((pos) => makeUnit({ team: 0, pos, class: 'dps', atk: 100 }));
    const foe = makeUnit({ team: 1, pos: 1 });
    recomputePassives([[marshal, ...others], [foe]]);
    expect(marshal.effAtk).toBe(100);
  });

  it('聖壁（受擊回癒）：受攻擊回 100% 攻擊力生命、每次消耗一層、兩層用完即失效', () => {
    const golem = makeUnit({ team: 0, pos: 1, cardId: 'radiantgolem', atk: 100, hp: 5000, def: 0 });
    const foe = makeUnit({ team: 1, pos: 1, atk: 50, def: 0 });
    castSkill(golem, 'luminousWall', ctxFor(golem, [golem], [foe]));
    expect(golem.buffs.find((b) => b.kind === 'healOnHit')?.charges).toBe(2);
    golem.hp = 3000;
    // 直接量測回癒事件：打三下，只回兩次、每次 100（=自身攻擊力×1.0）
    const heals = [];
    const ctx = {
      allies: [foe], enemies: [golem], rng: new Rng(7),
      emit: (t, p) => { if (t === 'heal' && p.kind === 'healOnHit') heals.push(p.amount); },
    };
    dealDamage(foe, golem, 1.0, ctx, 'normal');
    dealDamage(foe, golem, 1.0, ctx, 'normal');
    dealDamage(foe, golem, 1.0, ctx, 'normal');
    expect(heals).toEqual([100, 100]);
    expect(golem.buffs.some((b) => b.kind === 'healOnHit')).toBe(false);
  });

  it('龍血沸騰：能量灌給攻擊最高隊友（可溢出成超充素材）', () => {
    const caster = makeUnit({ team: 0, pos: 4, atk: 72 });
    const carry = makeUnit({ team: 0, pos: 1, atk: 200 });
    carry.energy = 80;
    castSkill(caster, 'dragonSurge', ctxFor(caster, [caster, carry], [makeUnit({ team: 1, pos: 1 })]));
    expect(carry.energy).toBe(120); // 80+40 溢出保留（超充區）
    expect(carry.buffs.some((b) => b.stat === 'dmgDealt')).toBe(true);
  });
});
