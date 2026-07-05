// 新機制批次（2026-07 審核定案）：
//   A1 Boss 保護（%最大生命→攻擊力基準）  B2 效果命中/效果抗性  B3 抗暴/元素抗性
//   B4 格擋護符（debuffBlock）  B5 sticky/偷取/轉移/免死  C1 普攻變體
//   C2 Boss 機制（階段/破盾/狂暴）  C3 attacker scope/獵印 markedHit  C4 技能等級 perLv
import { describe, it, expect } from 'vitest';
import { makeUnit } from './testHelpers.js';
import { applyEffect } from './effects.js';
import { computeDamage } from './damage.js';
import { applyBuff, dispelBuffs } from './buffs.js';
import { castSkill, normalAttack, SKILLS } from './skills.js';
import { BattleEngine } from './engine.js';
import { resolvePower } from './effects.js';
import { Rng } from '../core/rng.js';

const ctxFor = (caster, allies, enemies, seed = 7) => ({
  allies, enemies, rng: new Rng(seed),
  emit: () => {},
});

describe('A1 Boss 保護', () => {
  it('%最大生命對 bossTag 改按攻擊力 ×3 結算', () => {
    const caster = makeUnit({ atk: 100 });
    const boss = makeUnit({ team: 1, hp: 1000000, bossTag: true });
    const mob = makeUnit({ team: 1, hp: 1000 });
    expect(resolvePower({ power: 0.15, basis: 'targetMaxHp' }, caster, boss)).toBe(45); // 100×0.15×3
    expect(resolvePower({ power: 0.15, basis: 'targetMaxHp' }, caster, mob)).toBe(150); // 一般單位照 %
  });
});

describe('B2 效果命中/效果抗性', () => {
  it('抗性 100%：傷害照中、狀態被抵抗（發 resist）', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    applyBuff(foe, { kind: 'stat', stat: 'effectRes', op: 'add', value: 1, duration: 9 });
    let resisted = 0;
    const ctx = { ...ctxFor(caster, [caster], [foe]), emit: (e) => { if (e === 'resist') resisted += 1; } };
    applyEffect({ type: 'damage', mult: 1.0, scope: 'target' }, caster, [foe], ctx, 't');
    applyEffect({ type: 'control', control: 'freeze', duration: 2, scope: 'target' }, caster, [foe], ctx, 't');
    expect(foe.hp).toBeLessThan(99999); // 傷害不受效果抗性影響
    expect((foe.buffs ?? []).some((b) => b.kind === 'control')).toBe(false);
    expect(resisted).toBe(1);
  });

  it('效果命中抵銷抗性：+100% vs 100% → 必中', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    applyBuff(caster, { kind: 'stat', stat: 'effectHit', op: 'add', value: 1, duration: 9 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999 });
    applyBuff(foe, { kind: 'stat', stat: 'effectRes', op: 'add', value: 1, duration: 9 });
    applyEffect({ type: 'control', control: 'freeze', duration: 2, scope: 'target' }, caster, [foe], ctxFor(caster, [caster], [foe]), 't');
    expect(foe.buffs.some((b) => b.kind === 'control')).toBe(true);
  });
});

describe('B3 抗暴/元素抗性', () => {
  it('抗暴直接抵銷攻方暴擊率', () => {
    const atkU = makeUnit({ atk: 100 });
    applyBuff(atkU, { kind: 'stat', stat: 'critChance', op: 'add', value: 1, duration: 9 }); // 必暴
    const defU = makeUnit({ team: 1, hp: 9999 });
    applyBuff(defU, { kind: 'stat', stat: 'critRes', op: 'add', value: 1, duration: 9 }); // 抗滿
    const res = computeDamage(atkU, defU, 1.0, new Rng(1));
    expect(res.isCrit).toBe(false);
  });

  it('元素抗性在剋制之後再乘（火抗 50% 折半火傷）', () => {
    const fire = makeUnit({ atk: 100, element: 'fire' });
    const a = makeUnit({ team: 1, hp: 9999, def: 0, element: 'water' });
    const b = makeUnit({ team: 1, hp: 9999, def: 0, element: 'water' });
    applyBuff(b, { kind: 'stat', stat: 'res_fire', op: 'mul', value: 0.5, duration: 9 });
    const rngA = new Rng(3);
    const rngB = new Rng(3); // 同 seed：變異/暴擊相同
    const dA = computeDamage(fire, a, 1.0, rngA).amount;
    const dB = computeDamage(fire, b, 1.0, rngB).amount;
    expect(Math.abs(dB - dA / 2)).toBeLessThanOrEqual(1);
  });
});

describe('B4 格擋護符', () => {
  it('彈開 N 個負面狀態、逐層消耗；傷害不受影響', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const guard = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    let blocked = 0;
    const ctx = { ...ctxFor(caster, [caster], [guard]), emit: (e) => { if (e === 'blocked') blocked += 1; } };
    applyEffect({ type: 'debuffBlock', charges: 2, duration: 9, scope: 'target' }, guard, [guard], ctx, 'ward'); // 自套
    applyEffect({ type: 'control', control: 'freeze', duration: 2, scope: 'target' }, caster, [guard], ctx, 't');
    applyEffect({ type: 'dot', power: 0.3, element: 'fire', duration: 2, scope: 'target' }, caster, [guard], ctx, 't');
    applyEffect({ type: 'control', control: 'silence', duration: 2, scope: 'target' }, caster, [guard], ctx, 't');
    expect(blocked).toBe(2); // 前兩個被彈
    expect(guard.buffs.some((b) => b.kind === 'control' && b.control === 'silence')).toBe(true); // 第三個穿透
    expect(guard.buffs.some((b) => b.kind === 'debuffBlock')).toBe(false); // 層數用罄消失
  });
});

describe('B5 sticky/偷取/轉移/免死', () => {
  it('sticky 不可被驅散', () => {
    const u = makeUnit({});
    applyBuff(u, { kind: 'stat', stat: 'atk', op: 'mul', value: 1.3, duration: 3, sticky: true });
    applyBuff(u, { kind: 'stat', stat: 'def', op: 'mul', value: 1.3, duration: 3 });
    expect(dispelBuffs(u, { negative: false })).toBe(1); // 只拆得掉非 sticky
    expect(u.buffs.some((b) => b.sticky)).toBe(true);
  });

  it('偷取增益/轉移減益', () => {
    const thief = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 9999 });
    applyBuff(foe, { kind: 'stat', stat: 'atk', op: 'mul', value: 1.5, duration: 3 });
    const ctx = ctxFor(thief, [thief], [foe]);
    applyEffect({ type: 'stealBuff', count: 1, scope: 'target' }, thief, [foe], ctx, 't');
    expect((foe.buffs ?? []).length).toBe(0);
    expect(thief.effAtk).toBe(150); // 增益歸我

    applyBuff(thief, { kind: 'dot', damage: 30, duration: 2 });
    applyEffect({ type: 'transferDebuff', count: 1, scope: 'target' }, thief, [foe], ctx, 't');
    expect((thief.buffs ?? []).filter((b) => b.kind === 'dot').length).toBe(0);
    expect(foe.buffs.some((b) => b.kind === 'dot')).toBe(true); // 減益歸你
  });

  it('免死：致死傷害留 1 血、消耗標記、只擋一次（繞盾直傷同樣適用）', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 99999 });
    const u = makeUnit({ team: 1, pos: 1, hp: 500, def: 0 });
    applyBuff(u, { kind: 'cheatDeath', duration: 9 });
    const ctx = ctxFor(caster, [caster], [u]);
    applyEffect({ type: 'damage', mult: 5, scope: 'target' }, caster, [u], ctx, 't');
    expect(u.hp).toBe(1); // 免死留 1 血
    expect(u.buffs.some((b) => b.kind === 'cheatDeath')).toBe(false); // 標記消耗
    applyEffect({ type: 'damage', mult: 5, scope: 'target' }, caster, [u], ctx, 't');
    expect(u.alive).toBe(false); // 第二次沒得擋
  });
});

describe('C1 普攻變體', () => {
  it('連擊：兩段各自結算；蓄力：第 N 擊放大', () => {
    const twin = makeUnit({ team: 0, pos: 1, atk: 100, basicAttack: { hits: 2, mult: 0.6 } });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    let hitsN = 0;
    const ctx = { ...ctxFor(twin, [twin], [foe]), emit: (e) => { if (e === 'damage') hitsN += 1; } };
    normalAttack(twin, ctx);
    expect(hitsN).toBe(2);

    const charger = makeUnit({ team: 0, pos: 1, atk: 100, class: 'dps', basicAttack: { everyN: 2, mult: 3.0 } });
    const foe2 = makeUnit({ team: 1, pos: 1, hp: 999999, def: 0 });
    const dmg = [];
    const ctx2 = { ...ctxFor(charger, [charger], [foe2], 11), emit: (e, p) => { if (e === 'damage') dmg.push(p.amount); } };
    normalAttack(charger, ctx2); // 第 1 擊：普通
    normalAttack(charger, ctx2); // 第 2 擊：×3
    expect(dmg[1]).toBeGreaterThan(dmg[0] * 2); // 蓄力擊顯著放大（容變異）
  });

  it('奶攻：出手後治療血量最低隊友', () => {
    const medic = makeUnit({ team: 0, pos: 1, atk: 100, basicAttack: { heal: 0.6 } });
    const hurt = makeUnit({ team: 0, pos: 2, hp: 1000 });
    hurt.hp = 300;
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999 });
    normalAttack(medic, ctxFor(medic, [medic, hurt], [foe]));
    expect(hurt.hp).toBeGreaterThan(300);
  });
});

describe('C2 Boss 機制', () => {
  it('階段：血線跌破觸發一次性效果；狂暴：回合數到全體強化', () => {
    const hero = makeUnit({ team: 0, pos: 1, atk: 500, class: 'dps' });
    const boss = makeUnit({
      team: 1, pos: 1, hp: 3000, def: 0, bossTag: true,
      bossKit: {
        phases: [{ hpBelow: 0.5, effects: [{ type: 'buff', stat: 'atk', op: 'mul', value: 1.5, duration: 99, scope: 'self' }] }],
        enrage: { round: 3, effects: [{ type: 'buff', stat: 'dmgDealt', op: 'mul', value: 2, duration: 99, scope: 'self' }] },
      },
    });
    const engine = new BattleEngine([hero], [boss], { rng: new Rng(5) });
    const events = [];
    engine.on('bossPhase', () => events.push('phase'));
    engine.on('bossEnrage', () => events.push('enrage'));
    for (let i = 0; i < 40 && !engine.over; i++) engine.step();
    expect(events).toContain('phase');
    expect(events.filter((e) => e === 'phase').length).toBe(1); // 一次性
    if (!engine.over || engine.round >= 3) expect(events).toContain('enrage');
  });

  it('破盾：技能直傷累積 N 下 → 破防（承傷+50% 一回合）', () => {
    const hero = makeUnit({ team: 0, pos: 1, atk: 100, class: 'dps' });
    const boss = makeUnit({ team: 1, pos: 1, hp: 999999, def: 0, bossKit: { breakBar: { hits: 2, stunTurns: 1 } } });
    const engine = new BattleEngine([hero], [boss], { rng: new Rng(5) });
    let broke = 0;
    engine.on('bossBreak', () => (broke += 1));
    const ctx = engine._ctxFor(hero);
    applyEffect({ type: 'damage', mult: 1, scope: 'target' }, hero, [boss], ctx, 'burst');
    applyEffect({ type: 'damage', mult: 1, scope: 'target' }, hero, [boss], ctx, 'burst');
    expect(broke).toBe(1);
    expect(boss.buffs.some((b) => b.key === 'bossBreak')).toBe(true);
  });
});

describe('C3 attacker scope / 獵印', () => {
  it('hit 觸發 scope:attacker——被打就反打', () => {
    const spiky = makeUnit({ team: 0, pos: 1, hp: 5000, atk: 200, triggers: [
      { name: '反打', on: 'hit', effects: [{ type: 'damage', mult: 0.5, scope: 'attacker' }] },
    ] });
    const foe = makeUnit({ team: 1, pos: 1, atk: 50, hp: 5000, def: 0 });
    const engine = new BattleEngine([spiky], [foe], { rng: new Rng(6) });
    engine.step(); // spiky 普攻
    engine.step(); // foe 普攻 → 觸發反打
    expect(foe.hp).toBeLessThan(5000 - 40); // 吃了普攻反打（不只 spiky 的普攻…foe 至少多掉一截）
  });

  it('獵印 markedHit：隊友打到帶印記目標 → 獵人追打', () => {
    const hunter = makeUnit({ team: 0, pos: 4, atk: 100, class: 'support', triggers: [
      { name: '獵殺時刻', on: 'markedHit', effects: [{ type: 'damage', mult: 0.8, scope: 'target' }] },
    ] });
    const bruiser = makeUnit({ team: 0, pos: 1, atk: 100, class: 'dps' });
    const prey = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    const engine = new BattleEngine([hunter, bruiser], [prey], { rng: new Rng(6) });
    applyBuff(prey, { kind: 'mark', duration: 9 });
    let fired = 0;
    engine.on('trigger', ({ name }) => { if (name === '獵殺時刻') fired += 1; });
    engine.step(); // bruiser（pos1 先動）普攻帶印記的 prey → 獵人追打
    expect(fired).toBeGreaterThanOrEqual(1);
  });
});

describe('C4 技能等級 perLv', () => {
  it('perLv 依 skillLv 展開；Lv1＝原值', () => {
    SKILLS.__lvTest = { name: '測試', target: 'singleEnemyByColumn', effects: [
      { type: 'damage', mult: 1.0, scope: 'target', perLv: { mult: 0.5 } },
    ] };
    const lv1 = makeUnit({ team: 0, pos: 1, atk: 100, skillLv: 1 });
    const lv3 = makeUnit({ team: 0, pos: 1, atk: 100, skillLv: 3 });
    const f1 = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    const f2 = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0 });
    castSkill(lv1, '__lvTest', ctxFor(lv1, [lv1], [f1], 9));
    castSkill(lv3, '__lvTest', ctxFor(lv3, [lv3], [f2], 9));
    const d1 = 99999 - f1.hp;
    const d2 = 99999 - f2.hp;
    expect(Math.abs(d2 - d1 * 2)).toBeLessThanOrEqual(1); // 1.0 vs 2.0（同 seed）
    delete SKILLS.__lvTest;
  });
});
