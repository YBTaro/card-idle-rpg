// src/battle/cardReworks.test.js
// 2026-07 卡片改版新增的引擎原語（E1–E10）與對應卡片行為。
import { describe, it, expect } from 'vitest';
import { applyEffect, dealDamage, dealDot, matchesWhere } from './effects.js';
import { computeDamage } from './damage.js';
import { recomputePassives } from './passives.js';
import { triggerMatches } from './triggers.js';
import { applyBuff } from './buffs.js';
import { BattleEngine } from './engine.js';
import { makeUnit } from './testHelpers.js';
import { Rng } from '../core/rng.js';

const ctxFor = (caster, allies, enemies, events = []) => ({
  allies, enemies, rng: new Rng(1),
  emit: (event, payload) => events.push({ event, payload }),
});

describe('E1 byClass：依目標職業覆寫倍率（迅風武僧 亂風破）', () => {
  const dealtVs = (cls) => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100, element: 'fire' });
    const foe = makeUnit({ team: 1, pos: 1, hp: 999999, def: 0, element: 'fire', class: cls });
    const events = [];
    applyEffect({ type: 'damage', mult: 1.5, byClass: { tank: 3.5 }, scope: 'target' },
      caster, [foe], ctxFor(caster, [caster], [foe], events)); // 每次同種子
    return events.find((e) => e.event === 'damage').payload.amount;
  };
  it('坦克吃 350%、其餘吃 150%（比值 ≈ 2.33）', () => {
    const tank = dealtVs('tank');
    const dps = dealtVs('dps');
    expect(tank).toBeGreaterThanOrEqual(Math.round(dps * 2.2));
  });
});

describe('E9 vsDot：對中毒/灼燒目標覆寫倍率（曜鱗龍將 龍炎滅陣）', () => {
  const dealtDot = (poisoned) => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100, element: 'fire' });
    const foe = makeUnit({ team: 1, pos: 1, hp: 999999, def: 0, element: 'fire', class: 'dps' });
    if (poisoned) applyBuff(foe, { kind: 'dot', damage: 10, duration: 2 });
    const events = [];
    applyEffect({ type: 'damage', mult: 1.2, vsDot: 2.4, scope: 'target' },
      caster, [foe], ctxFor(caster, [caster], [foe], events));
    return events.find((e) => e.event === 'damage').payload.amount;
  };
  it('中毒目標吃 240%、無 dot 吃 120%（比值 ≈ 2）', () => {
    expect(dealtDot(true)).toBeGreaterThanOrEqual(Math.round(dealtDot(false) * 1.9));
  });
});

describe('E4 critBonus：單擊額外暴擊率（虛空喚者 虛爆）', () => {
  it('critBonus 1.0 → 該擊必定暴擊', () => {
    const a = makeUnit({ atk: 100 });
    const d = makeUnit({ def: 0, class: 'tank' });
    expect(computeDamage(a, d, 1, new Rng(1), { critBonus: 1 }).isCrit).toBe(true);
  });
  it('無 critBonus 時仍受守方抗暴：critRes 抵掉加成', () => {
    const a = makeUnit({ atk: 100 });
    const d = makeUnit({ def: 0, class: 'tank' });
    applyBuff(d, { kind: 'stat', stat: 'critRes', op: 'add', value: 1, duration: 2 }); // 抗暴 100%
    expect(computeDamage(a, d, 1, new Rng(1), { critBonus: 0.15 }).isCrit).toBe(false);
  });
});

describe('E7 stealBuff random：隨機偷增益（奪流魅影 奪流）', () => {
  it('random:true 從多個增益中挑 1 個搬走', () => {
    const caster = makeUnit({ team: 0, pos: 1 });
    const foe = makeUnit({ team: 1, pos: 1 });
    applyBuff(foe, { kind: 'shield', amount: 10, duration: 2 });
    applyBuff(foe, { kind: 'stat', stat: 'atk', op: 'mul', value: 1.2, duration: 2 });
    applyBuff(foe, { kind: 'stat', stat: 'def', op: 'mul', value: 1.2, duration: 2 });
    applyEffect({ type: 'stealBuff', count: 1, random: true, scope: 'target' },
      caster, [foe], ctxFor(caster, [caster], [foe]));
    expect(caster.buffs.length).toBe(1);
    expect(foe.buffs.length).toBe(2);
  });
});

describe('E8 matchesWhere 陣列值：在清單內（月吼狼王隊伍技）', () => {
  it('class 陣列＝任一命中；純量仍向後相容', () => {
    const sup = makeUnit({ class: 'support', race: '獸' });
    const dps = makeUnit({ class: 'dps', race: '獸' });
    const tank = makeUnit({ class: 'tank', race: '獸' });
    expect(matchesWhere(sup, { class: ['support', 'dps'] })).toBe(true);
    expect(matchesWhere(dps, { class: ['support', 'dps'] })).toBe(true);
    expect(matchesWhere(tank, { class: ['support', 'dps'] })).toBe(false);
    expect(matchesWhere(sup, { race: '獸', class: ['support', 'dps'] })).toBe(true);
    expect(matchesWhere(dps, { class: 'dps' })).toBe(true); // 純量不受影響
  });
});

describe('E3 columnAllies 被動範圍（深淵獵手 同直排回氣）', () => {
  it('只作用於同直排存活隊友（含自己）', () => {
    const leader = makeUnit({ team: 0, pos: 1, passives: [{ target: 'columnAllies', effects: [{ stat: 'energyGain', op: 'mul', value: 1.5 }] }] }); // 直排 A
    const sameCol = makeUnit({ team: 0, pos: 4 }); // 直排 A（1,4）
    const otherCol = makeUnit({ team: 0, pos: 2 }); // 直排 B
    recomputePassives([[leader, sameCol, otherCol], [makeUnit({ team: 1, pos: 1 })]]);
    expect(leader.energyGainMult).toBe(1.5);
    expect(sameCol.energyGainMult).toBe(1.5);
    expect(otherCol.energyGainMult).toBe(1);
  });
});

describe('E6 adjacentAllies 被動範圍（奪流魅影 周圍回氣）', () => {
  it('自身 + 上下左右相鄰隊友；斜/遠不算', () => {
    const leader = makeUnit({ team: 0, pos: 2, passives: [{ target: 'adjacentAllies', effects: [{ stat: 'energyGain', op: 'mul', value: 1.1 }] }] }); // 前排 B
    const left = makeUnit({ team: 0, pos: 1 }); // 前排 A（同排相鄰）
    const below = makeUnit({ team: 0, pos: 5 }); // 後排 B（同直排上下）
    const far = makeUnit({ team: 0, pos: 6 }); // 後排 C（不相鄰）
    recomputePassives([[leader, left, below, far], [makeUnit({ team: 1, pos: 1 })]]);
    expect(leader.energyGainMult).toBeCloseTo(1.1);
    expect(left.energyGainMult).toBeCloseTo(1.1);
    expect(below.energyGainMult).toBeCloseTo(1.1);
    expect(far.energyGainMult).toBe(1);
  });
});

describe('E10 被動屬性覆寫光環（誓刃盟主 全隊轉暗）', () => {
  it('把符合對象的屬性覆寫為指定屬性', () => {
    const leader = makeUnit({ team: 0, pos: 1, element: 'fire', passives: [{ target: 'allAllies', effects: [{ element: 'dark' }] }] });
    const ally = makeUnit({ team: 0, pos: 2, element: 'water' });
    const foe = makeUnit({ team: 1, pos: 1, element: 'light' });
    recomputePassives([[leader, ally], [foe]]);
    expect(leader.element).toBe('dark');
    expect(ally.element).toBe('dark');
    expect(foe.element).toBe('light'); // 敵方不受影響
  });
});

describe('E5 markedHit crit 條件（虛空喚者 虛空汲取）', () => {
  const owner = makeUnit({ team: 0, pos: 1 });
  const markedFoe = makeUnit({ team: 1, pos: 1 });
  const trig = { on: 'markedHit', crit: true, effects: [{ type: 'energy', amount: 20, scope: 'self' }] };
  it('crit:true → 只在暴擊時成立', () => {
    expect(triggerMatches(trig, owner, { on: 'markedHit', subject: markedFoe, isCrit: true })).toBe(true);
    expect(triggerMatches(trig, owner, { on: 'markedHit', subject: markedFoe, isCrit: false })).toBe(false);
  });
  it('未設 crit → 任何命中都成立（向後相容）', () => {
    const t2 = { on: 'markedHit', effects: [] };
    expect(triggerMatches(t2, owner, { on: 'markedHit', subject: markedFoe, isCrit: false })).toBe(true);
  });
});

describe('E2 guardKit：直傷上限 + 大傷全體反擊（迅風武僧護體）', () => {
  const KIT = { capPct: 0.2, counterMult: 0.8, lifesteal: 0.3, maxUses: 5 };
  const setup = (foeAtk) => {
    const monk = makeUnit({ team: 0, pos: 1, hp: 1000, atk: 100, element: 'fire', guardKit: { ...KIT } });
    const foe = makeUnit({ team: 1, pos: 1, hp: 100000, atk: foeAtk, def: 0, element: 'fire' });
    const events = [];
    // 攻擊者視角 ctx：ctx.allies＝攻擊方＝護體持有者的敵人（反擊對象）
    const ctx = ctxFor(foe, [foe], [monk], events);
    return { monk, foe, events, ctx };
  };

  it('大傷被夾在 20% 最大生命，並觸發全體反擊 + 回血、計入使用次數', () => {
    const { monk, foe, events, ctx } = setup(2000);
    dealDamage(foe, monk, 1.0, ctx, 'normal');
    const monkHit = events.find((e) => e.event === 'damage' && e.payload.target === monk);
    expect(monkHit.payload.amount).toBe(200); // 夾在 1000 × 20%
    expect(monk._guardUses).toBe(1);
    const counter = events.filter((e) => e.event === 'damage' && e.payload.skill === 'counter' && e.payload.target === foe);
    expect(counter.length).toBe(1);
    expect(foe.hp).toBeLessThan(100000);
    const heal = events.find((e) => e.event === 'heal' && e.payload.kind === 'guardCounter');
    expect(heal).toBeTruthy();
    expect(monk.hp).toBe(1000 - 200 + heal.payload.amount); // 夾傷後再吸血回填
  });

  it('小於上限的攻擊不夾、不反擊', () => {
    const { monk, foe, events, ctx } = setup(50); // 小攻擊，遠低於 200
    dealDamage(foe, monk, 1.0, ctx, 'normal');
    expect(monk._guardUses ?? 0).toBe(0);
    expect(events.some((e) => e.payload?.skill === 'counter')).toBe(false);
    expect(foe.hp).toBe(100000);
  });

  it('用完 maxUses 後：上限仍生效，但不再反擊', () => {
    const { monk, foe, events, ctx } = setup(2000);
    monk._guardUses = 5; // 已用滿
    dealDamage(foe, monk, 1.0, ctx, 'normal');
    const monkHit = events.find((e) => e.event === 'damage' && e.payload.target === monk);
    expect(monkHit.payload.amount).toBe(200); // 上限照夾
    expect(monk._guardUses).toBe(5); // 不再增加
    expect(events.some((e) => e.payload?.skill === 'counter')).toBe(false); // 無反擊
    expect(foe.hp).toBe(100000);
  });
});

describe('E12 cheatDeath healPct：免死並回復（潮汐術士隊伍技）', () => {
  it('致命傷害 → 存活並回復 50% 最大生命；再次致命則陣亡', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 10000, element: 'fire' });
    const foe = makeUnit({ team: 1, pos: 1, hp: 1000, def: 0, element: 'fire', class: 'dps' });
    applyBuff(foe, { kind: 'cheatDeath', healPct: 0.5 });
    const events = [];
    const ctx = ctxFor(caster, [caster], [foe], events);
    dealDamage(caster, foe, 1.0, ctx, 'skill');
    expect(foe.alive).toBe(true);
    expect(foe.hp).toBe(501); // 免死留 1 血 + 回復 50%×1000
    expect(events.some((e) => e.event === 'heal' && e.payload.kind === 'cheatDeath')).toBe(true);
    expect(foe.buffs.some((b) => b.kind === 'cheatDeath')).toBe(false); // 一次性，已消耗
    dealDamage(caster, foe, 1.0, ctx, 'skill');
    expect(foe.alive).toBe(false); // 第二次致命 → 陣亡
  });
});

describe('E11 grant-once 被動授予（潮汐術士 攻擊成員≥4 免死）', () => {
  const kit = [{ when: { alliesAtLeast: { count: 4, where: { class: 'dps' } } }, target: 'allAllies', targetWhere: { class: 'dps' }, effects: [{ grant: 'cheatDeath', healPct: 0.5 }] }];
  it('條件成立 → 所有攻擊成員獲免死；輔助不獲得；消耗後不重發', () => {
    const leader = makeUnit({ team: 0, pos: 1, class: 'dps', passives: kit });
    const d2 = makeUnit({ team: 0, pos: 2, class: 'dps' });
    const d3 = makeUnit({ team: 0, pos: 3, class: 'dps' });
    const d4 = makeUnit({ team: 0, pos: 4, class: 'dps' });
    const support = makeUnit({ team: 0, pos: 5, class: 'support' });
    const team0 = [leader, d2, d3, d4, support];
    recomputePassives([team0, [makeUnit({ team: 1, pos: 1 })]]);
    for (const u of [leader, d2, d3, d4]) {
      expect(u.buffs.some((b) => b.kind === 'cheatDeath' && b.healPct === 0.5)).toBe(true);
    }
    expect((support.buffs ?? []).some((b) => b.kind === 'cheatDeath')).toBe(false); // 非攻擊成員
    // 消耗 leader 的免死後重算 → 不再補發（「首次」語義）
    leader.buffs = leader.buffs.filter((b) => b.kind !== 'cheatDeath');
    recomputePassives([team0, [makeUnit({ team: 1, pos: 1 })]]);
    expect(leader.buffs.some((b) => b.kind === 'cheatDeath')).toBe(false);
    expect(d2.buffs.filter((b) => b.kind === 'cheatDeath').length).toBe(1); // 未消耗者維持一層、不疊加
  });

  it('攻擊成員 <4 → 不觸發', () => {
    const leader = makeUnit({ team: 0, pos: 1, class: 'dps', passives: kit });
    const d2 = makeUnit({ team: 0, pos: 2, class: 'dps' });
    const d3 = makeUnit({ team: 0, pos: 3, class: 'dps' });
    const support = makeUnit({ team: 0, pos: 5, class: 'support' });
    recomputePassives([[leader, d2, d3, support], [makeUnit({ team: 1, pos: 1 })]]);
    expect((leader.buffs ?? []).some((b) => b.kind === 'cheatDeath')).toBe(false);
  });
});

describe('alliesOnly：隊伍只有輸出（誓刃盟主，不論人數）', () => {
  const p = [{ when: { alliesOnly: { class: 'dps' } }, target: 'allAllies', effects: [{ stat: 'dmgTaken', op: 'mul', value: 0.4 }] }];
  it('3 名全輸出 → 觸發（不需湊滿 5）', () => {
    const a = makeUnit({ team: 0, pos: 1, class: 'dps', passives: p });
    const b = makeUnit({ team: 0, pos: 2, class: 'dps' });
    const c = makeUnit({ team: 0, pos: 3, class: 'dps' });
    recomputePassives([[a, b, c], [makeUnit({ team: 1, pos: 1 })]]);
    expect(a.dmgTakenMult).toBe(0.4);
  });
  it('含一名非輸出 → 不觸發', () => {
    const a = makeUnit({ team: 0, pos: 1, class: 'dps', passives: p });
    const b = makeUnit({ team: 0, pos: 2, class: 'dps' });
    const sup = makeUnit({ team: 0, pos: 3, class: 'support' });
    recomputePassives([[a, b, sup], [makeUnit({ team: 1, pos: 1 })]]);
    expect(a.dmgTakenMult).toBe(1);
  });
});

describe('E14 undying：1 回合無敵留 1 血（不滅骸王 不滅誓約）', () => {
  it('連續致死傷害都留 1 血，且不消耗 buff', () => {
    const atk = makeUnit({ team: 0, pos: 1, atk: 100000, element: 'fire' });
    const tank = makeUnit({ team: 1, pos: 1, hp: 1000, def: 0, element: 'fire', class: 'tank' });
    applyBuff(tank, { kind: 'undying', duration: 1 });
    const ctx = ctxFor(atk, [atk], [tank]);
    dealDamage(atk, tank, 1.0, ctx, 'skill');
    expect(tank.alive).toBe(true);
    expect(tank.hp).toBe(1);
    dealDamage(atk, tank, 1.0, ctx, 'skill'); // 再一次致死仍留 1 血
    expect(tank.hp).toBe(1);
    expect(tank.buffs.some((b) => b.kind === 'undying')).toBe(true); // 未消耗
  });
  it('DoT 致死也留 1 血（dealDirect 路徑）', () => {
    const tank = makeUnit({ team: 1, pos: 1, hp: 1000, class: 'tank' });
    applyBuff(tank, { kind: 'undying', duration: 1 });
    dealDot(tank, { damage: 99999 }, ctxFor(makeUnit({ team: 0, pos: 1 }), [], [tank]));
    expect(tank.alive).toBe(true);
    expect(tank.hp).toBe(1);
  });
});

describe('E13 神蹟：免死救場治療 / 未觸發到期減半治療（奇蹟聖女）', () => {
  it('觸發免死 → 存活並立即治療 healPower（攻擊力×2.2）', () => {
    const healer = makeUnit({ team: 0, pos: 1, atk: 100 });
    const ally = makeUnit({ team: 0, pos: 2, hp: 1000, class: 'dps' });
    applyEffect({ type: 'cheatDeath', duration: 1, healPower: 2.2, expireHealPower: 1.1, scope: 'target' },
      healer, [ally], ctxFor(healer, [healer, ally], []), 'miracleWard');
    const cd = ally.buffs.find((b) => b.kind === 'cheatDeath');
    expect(cd.healOnSave).toBe(220);
    expect(cd.healOnExpire).toBe(110);
    const atk = makeUnit({ team: 1, pos: 1, atk: 100000, element: 'fire' });
    const events = [];
    dealDamage(atk, ally, 1.0, ctxFor(atk, [atk], [ally], events), 'skill');
    expect(ally.alive).toBe(true);
    expect(ally.hp).toBe(1 + 220); // 免死留 1 血 + 立即治療 220
    expect(events.some((e) => e.event === 'heal' && e.payload.kind === 'cheatDeath')).toBe(true);
  });
  it('未觸發免死 → 到期補一次減半治療（引擎 tick）', () => {
    const ally = makeUnit({ team: 0, pos: 1, hp: 1000, atk: 100, class: 'dps' });
    ally.hp = 500;
    applyBuff(ally, { kind: 'cheatDeath', duration: 1, healOnExpire: 110 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 100000, atk: 1, def: 0 });
    const engine = new BattleEngine([ally], [foe], { rng: new Rng(1) });
    let expireHeal = 0;
    engine.on('heal', ({ kind, amount }) => { if (kind === 'miracle') expireHeal += amount; });
    let n = 0;
    while (n < 6 && expireHeal === 0 && !engine.over) { engine.step(); n += 1; }
    expect(expireHeal).toBe(110);
    expect(ally.buffs.some((b) => b.kind === 'cheatDeath')).toBe(false); // 到期移除
  });
});
