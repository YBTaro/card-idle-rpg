// src/battle/effects.test.js
import { describe, it, expect } from 'vitest';
import { resolvePower, resolveScope, dealDamage, applyEffect, dealDot, matchesWhere } from './effects.js';
import { makeUnit } from './testHelpers.js';
import { Rng } from '../core/rng.js';
import { hasControl, applyBuff, hotEntries } from './buffs.js';

const ctxFor = (caster, allies, enemies, events = []) => ({
  allies, enemies, rng: new Rng(1),
  emit: (event, payload) => events.push({ event, payload }),
});

describe('effects', () => {
  it('resolvePower：預設 effAtk 制、basis targetMaxHp 用目標 maxHp', () => {
    const caster = makeUnit({ atk: 100 });
    const target = makeUnit({ hp: 500 });
    expect(resolvePower({ power: 2.0 }, caster, target)).toBe(200);
    expect(resolvePower({ power: 0.1, basis: 'targetMaxHp' }, caster, target)).toBe(50);
  });

  it('resolveScope：self / allAllies / alliesExceptTarget', () => {
    const caster = makeUnit({ team: 0, pos: 1 });
    const a2 = makeUnit({ team: 0, pos: 2 });
    const ctx = { allies: [caster, a2], enemies: [] };
    expect(resolveScope('self', caster, [], ctx)).toEqual([caster]);
    expect(resolveScope('allAllies', caster, [], ctx).length).toBe(2);
    expect(resolveScope('alliesExceptTarget', caster, [caster], ctx)).toEqual([a2]);
  });

  it('damage 效果：扣血、被擊回能、發 damage 事件', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100, element: 'fire' });
    const foe = makeUnit({ team: 1, pos: 1, element: 'light', def: 0, hp: 99999, class: 'tank' });
    const events = [];
    const ctx = ctxFor(caster, [caster], [foe], events);
    applyEffect({ type: 'damage', mult: 1.0, scope: 'target' }, caster, [foe], ctx, 'burst');
    expect(foe.hp).toBeLessThan(99999);
    expect(foe.energy).toBe(foe.classDef.energyOnHitTaken); // 被擊回能
    expect(events.some((e) => e.event === 'damage')).toBe(true);
  });

  it('heal / buff / shield / dot 效果', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const ally = makeUnit({ team: 0, pos: 2, hp: 100 });
    ally.hp = 40;
    const ctx = ctxFor(caster, [caster, ally], []);
    // heal = effAtk×0.5 = 50（尚未 buff）
    applyEffect({ type: 'heal', power: 0.5, scope: 'target' }, caster, [ally], ctx);
    expect(ally.hp).toBe(90);
    // shield = effAtk×0.3 = 30（尚未 buff）
    applyEffect({ type: 'shield', power: 0.3, scope: 'self' }, caster, [caster], ctx);
    expect(caster.buffs.some((b) => b.kind === 'shield' && b.amount === 30)).toBe(true);
    // dot：預存每跳傷害（effAtk×0.2=20，無屬性）
    applyEffect({ type: 'dot', power: 0.2, duration: 3, scope: 'self' }, caster, [caster], ctx);
    expect(caster.buffs.some((b) => b.kind === 'dot' && b.damage === 20)).toBe(true);
    // buff atk ×1.5（最後套用）→ effAtk 提升
    applyEffect({ type: 'buff', stat: 'atk', op: 'mul', value: 1.5, duration: 2, scope: 'self' }, caster, [caster], ctx);
    expect(caster.effAtk).toBe(150);
    // 驗證 buff 會放大 power：buff 後新的護盾 = effAtk×0.3 = 45
    applyEffect({ type: 'shield', power: 0.3, scope: 'self', key: 'sh2' }, caster, [caster], ctx);
    expect(caster.buffs.some((b) => b.kind === 'shield' && b.amount === 45)).toBe(true);
  });

  it('dealDot：直接扣血、繞過護盾、發 damage(skill:dot)/death', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const target = makeUnit({ team: 1, pos: 1, hp: 100, class: 'tank' });
    const events = [];
    const ctx = ctxFor(caster, [caster], [target], events);
    // 給 target 一個護盾，dealDot 應繞過它
    applyEffect({ type: 'shield', power: 0.5, scope: 'target' }, caster, [target], ctx); // 護盾 50
    dealDot(target, { damage: 30 }, ctx);
    expect(target.hp).toBe(70); // 直接扣 30，護盾未被消耗
    expect(target.buffs.some((b) => b.kind === 'shield' && b.amount === 50)).toBe(true);
    expect(events.some((e) => e.event === 'damage' && e.payload.skill === 'dot')).toBe(true);
    // 致命一跳
    dealDot(target, { damage: 9999 }, ctx);
    expect(target.alive).toBe(false);
    expect(events.some((e) => e.event === 'death')).toBe(true);
  });
});

describe('where 條件過濾', () => {
  it('matchesWhere：race 等值、series 成員、AND、無 where', () => {
    const u = makeUnit({ race: '不死', series: ['影之眷屬', '守護者'], element: 'dark' });
    expect(matchesWhere(u, undefined)).toBe(true);
    expect(matchesWhere(u, { race: '不死' })).toBe(true);
    expect(matchesWhere(u, { race: '人' })).toBe(false);
    expect(matchesWhere(u, { series: '守護者' })).toBe(true);
    expect(matchesWhere(u, { series: '聖歌隊' })).toBe(false);
    expect(matchesWhere(u, { race: '不死', element: 'dark' })).toBe(true);
    expect(matchesWhere(u, { race: '不死', element: 'fire' })).toBe(false);
    expect(matchesWhere(u, {})).toBe(true);
  });

  it('applyEffect 用 where 只作用於符合的目標', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100, element: 'fire' });
    const undead = makeUnit({ team: 1, pos: 1, race: '不死', hp: 99999, def: 0, class: 'tank' });
    const human = makeUnit({ team: 1, pos: 2, race: '人', hp: 99999, def: 0, class: 'tank' });
    const ctx = ctxFor(caster, [caster], [undead, human]);
    applyEffect({ type: 'damage', mult: 1.0, scope: 'allEnemies', where: { race: '不死' } }, caster, [undead, human], ctx);
    expect(undead.hp).toBeLessThan(99999); // 受擊
    expect(human.hp).toBe(99999); // 不受影響
  });
});

describe('control 效果', () => {
  it('套用對應 control buff（吃 where）', () => {
    const caster = makeUnit({ team: 0, pos: 1 });
    const foe = makeUnit({ team: 1, pos: 1, class: 'support' });
    const other = makeUnit({ team: 1, pos: 2, class: 'dps' });
    const ctx = ctxFor(caster, [caster], [foe, other]);
    applyEffect({ type: 'control', control: 'silence', duration: 2, scope: 'allEnemies', where: { class: 'support' } }, caster, [foe, other], ctx);
    expect(hasControl(foe, 'silence')).toBe(true);
    expect(hasControl(other, 'silence')).toBe(false);
  });

  it('疊加規則：同技能同效果預設不疊加（重施＝刷新），stackable:true 才可疊層', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const ctx = ctxFor(caster, [caster], []);

    // 預設：重施同一 buff → 只有一層（刷新覆蓋）
    applyEffect({ type: 'buff', stat: 'atk', op: 'mul', value: 1.2, duration: 2, scope: 'self' }, caster, [caster], ctx, 'dawnStrike');
    if (caster.buffs[0].duration != null) caster.buffs[0].duration = 1; // 模擬時間流逝
    applyEffect({ type: 'buff', stat: 'atk', op: 'mul', value: 1.2, duration: 2, scope: 'self' }, caster, [caster], ctx, 'dawnStrike');
    const atkBuffs = caster.buffs.filter((b) => b.kind === 'stat' && b.stat === 'atk');
    expect(atkBuffs.length).toBe(1);
    expect(atkBuffs[0].duration).toBe(2); // 持續時間被刷新

    // 不同技能的同屬性 buff 互不干擾（各自一層）
    applyEffect({ type: 'buff', stat: 'atk', op: 'mul', value: 1.1, duration: 2, scope: 'self' }, caster, [caster], ctx, 'otherSkill');
    expect(caster.buffs.filter((b) => b.kind === 'stat' && b.stat === 'atk').length).toBe(2);

    // 明示 stackable → 可疊層
    applyEffect({ type: 'dot', power: 0.3, duration: 2, scope: 'self', stackable: true }, caster, [caster], ctx, 'poison');
    applyEffect({ type: 'dot', power: 0.3, duration: 2, scope: 'self', stackable: true }, caster, [caster], ctx, 'poison');
    expect(caster.buffs.filter((b) => b.kind === 'dot').length).toBe(2);
  });
});

describe('新原語：吸血 / 處決 / 無視防禦 / 機率', () => {
  it('lifesteal：實際傷害的比例回復施放者', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100, hp: 1000 });
    caster.hp = 500;
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0, class: 'tank' });
    const events = [];
    const ctx = ctxFor(caster, [caster], [foe], events);
    applyEffect({ type: 'damage', mult: 1.0, scope: 'target', lifesteal: 0.5 }, caster, [foe], ctx, 'bite');
    const dealt = events.find((e) => e.event === 'damage').payload.amount;
    const healEvt = events.find((e) => e.event === 'heal');
    expect(healEvt.payload.amount).toBe(Math.round(dealt * 0.5));
    expect(caster.hp).toBe(500 + healEvt.payload.amount);
  });

  it('executeBelow：目標血量低於門檻時傷害乘 executeBonus', () => {
    const mk = () => makeUnit({ team: 1, pos: 1, hp: 100000, def: 0, class: 'tank' });
    const dealtOn = (hpRatio) => {
      const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
      const foe = mk();
      foe.hp = Math.round(foe.maxHp * hpRatio);
      const events = [];
      const ctx = ctxFor(caster, [caster], [foe], events); // 同種子 → 同暴擊/浮動
      applyEffect({ type: 'damage', mult: 1.0, scope: 'target', executeBelow: 0.35, executeBonus: 2.0 }, caster, [foe], ctx, 'verdict');
      return events.find((e) => e.event === 'damage').payload.amount;
    };
    const high = dealtOn(0.9);
    const low = dealtOn(0.2);
    expect(low).toBeGreaterThanOrEqual(high * 1.9); // ×2（容忍取整）
  });

  it('ignoreDef：高防目標受到的傷害顯著高於一般攻擊', () => {
    const dealtWith = (opts) => {
      const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
      const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 5000, class: 'tank' });
      const events = [];
      const ctx = ctxFor(caster, [caster], [foe], events); // 同種子
      applyEffect({ type: 'damage', mult: 1.0, scope: 'target', ...opts }, caster, [foe], ctx);
      return events.find((e) => e.event === 'damage').payload.amount;
    };
    expect(dealtWith({ ignoreDef: true })).toBeGreaterThan(dealtWith({}) * 2);
  });

  it('chance：1 必中、0 必不中（逐目標擲骰）', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, class: 'dps' });
    const ctx = ctxFor(caster, [caster], [foe]);
    applyEffect({ type: 'control', control: 'stun', duration: 1, scope: 'target', chance: 0 }, caster, [foe], ctx, 'cut');
    expect(hasControl(foe, 'stun')).toBe(false);
    applyEffect({ type: 'control', control: 'stun', duration: 1, scope: 'target', chance: 1 }, caster, [foe], ctx, 'cut');
    expect(hasControl(foe, 'stun')).toBe(true);
  });
});

describe('新原語：HoT / 驅散淨化 / 復活', () => {
  it('hot：掛持續回復 buff（amount = effAtk×power）', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const ally = makeUnit({ team: 0, pos: 2 });
    const ctx = ctxFor(caster, [caster, ally], []);
    applyEffect({ type: 'hot', power: 0.35, duration: 2, scope: 'allAllies' }, caster, [ally], ctx, 'spring');
    const hots = hotEntries(ally);
    expect(hots.length).toBe(1);
    expect(hots[0].amount).toBe(35);
    expect(hots[0].duration).toBe(2);
  });

  it('dispel what:debuff 淨化減益（吃 count 上限、不動增益）', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const ally = makeUnit({ team: 0, pos: 2 });
    applyBuff(ally, { kind: 'dot', damage: 10, duration: 2 });
    applyBuff(ally, { kind: 'control', control: 'stun', duration: 1 });
    applyBuff(ally, { kind: 'shield', amount: 50, duration: 2 });
    const ctx = ctxFor(caster, [caster, ally], []);
    applyEffect({ type: 'dispel', what: 'debuff', count: 1, scope: 'target' }, caster, [ally], ctx);
    expect(ally.buffs.length).toBe(2); // 只移除一個減益
    applyEffect({ type: 'dispel', what: 'debuff', scope: 'target' }, caster, [ally], ctx);
    expect(ally.buffs.length).toBe(1);
    expect(ally.buffs[0].kind).toBe('shield'); // 增益保留
  });

  it('dispel what:buff 驅散敵方增益', () => {
    const caster = makeUnit({ team: 0, pos: 1 });
    const foe = makeUnit({ team: 1, pos: 1 });
    applyBuff(foe, { kind: 'shield', amount: 50, duration: 2 });
    applyBuff(foe, { kind: 'dot', damage: 10, duration: 2 });
    const ctx = ctxFor(caster, [caster], [foe]);
    applyEffect({ type: 'dispel', what: 'buff', scope: 'target' }, caster, [foe], ctx);
    expect(foe.buffs.length).toBe(1);
    expect(foe.buffs[0].kind).toBe('dot'); // 減益保留
  });

  it('revive：復活至 maxHp×power、能量歸零、狀態清空、發 revive 事件', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const dead = makeUnit({ team: 0, pos: 2, hp: 1000 });
    applyBuff(dead, { kind: 'dot', damage: 10, duration: 2 });
    dead.takeDamage(99999);
    expect(dead.alive).toBe(false);
    const events = [];
    const ctx = ctxFor(caster, [caster, dead], [], events);
    applyEffect({ type: 'revive', power: 0.35, scope: 'targetIncludingDead' }, caster, [dead], ctx, 'requiem');
    expect(dead.alive).toBe(true);
    expect(dead.hp).toBe(Math.round(dead.maxHp * 0.35));
    expect(dead.energy).toBe(0);
    expect(dead.buffs.length).toBe(0);
    expect(events.some((e) => e.event === 'revive')).toBe(true);
  });

  it('revive 對活人無效', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const ally = makeUnit({ team: 0, pos: 2, hp: 1000 });
    ally.hp = 100;
    const events = [];
    const ctx = ctxFor(caster, [caster, ally], [], events);
    applyEffect({ type: 'revive', power: 0.35, scope: 'targetIncludingDead' }, caster, [ally], ctx);
    expect(ally.hp).toBe(100); // 不變
    expect(events.length).toBe(0);
  });

  it('resolveScope targetIncludingDead：不過濾陣亡者', () => {
    const caster = makeUnit({ team: 0, pos: 1 });
    const dead = makeUnit({ team: 0, pos: 2 });
    dead.takeDamage(99999);
    const ctx = { allies: [caster, dead], enemies: [] };
    expect(resolveScope('target', caster, [dead], ctx)).toEqual([]);
    expect(resolveScope('targetIncludingDead', caster, [dead], ctx)).toEqual([dead]);
  });
});

describe('中毒（%最大生命制）', () => {
  it('中毒每跳＝目標最大生命 15%（與施放者攻擊力無關）', () => {
    const weak = makeUnit({ team: 0, pos: 1, atk: 1 }); // 攻擊力極低也一樣痛
    const foe = makeUnit({ team: 1, pos: 1, hp: 2000, class: 'tank' });
    const ctx = ctxFor(weak, [weak], [foe]);
    applyEffect({ type: 'dot', power: 0.15, basis: 'targetMaxHp', duration: 2, scope: 'target' }, weak, [foe], ctx, 'webBind');
    const dot = foe.buffs.find((b) => b.kind === 'dot');
    expect(dot.damage).toBe(300); // 2000 × 15%
    dealDot(foe, dot, ctx);
    expect(foe.hp).toBe(1700);
  });
});

describe('屬性轉化（transmute）', () => {
  it('轉成施放者剋制的屬性、剋制倍率生效、到期還原', () => {
    const caster = makeUnit({ team: 0, pos: 1, element: 'fire', atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, element: 'water' }); // 水剋火（施放者原本被剋）
    const ctx = ctxFor(caster, [caster], [foe]);
    applyEffect({ type: 'transmute', duration: 2, scope: 'target' }, caster, [foe], ctx, 'flameShift');
    expect(foe.element).toBe('wind'); // 火剋風 → 目標被轉成風
    // 到期還原
    const ov = foe.buffs.find((b) => b.kind === 'element');
    ov.duration = 0;
    foe.buffs = foe.buffs.filter((b) => b.duration == null || b.duration > 0);
    expect(foe.element).toBe('water');
  });

  it('轉化是減益：可被淨化解除', () => {
    const caster = makeUnit({ team: 0, pos: 1, element: 'water' });
    const foe = makeUnit({ team: 1, pos: 1, element: 'wind' });
    const ctx = ctxFor(caster, [caster], [foe]);
    applyEffect({ type: 'transmute', duration: 2, scope: 'target' }, caster, [foe], ctx);
    expect(foe.element).toBe('fire'); // 水剋火
    applyEffect({ type: 'dispel', what: 'debuff', count: 1, scope: 'target' }, foe, [foe], ctx);
    expect(foe.element).toBe('wind'); // 淨化後還原
  });
});

describe('DoT 身分規則：同人延長、異人獨立', () => {
  it('同一施放者同技能再上火：不疊層、剩餘回合 +1、傷害更新', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, element: 'fire' }); // 同屬性：無剋制倍率干擾
    const ctx = ctxFor(caster, [caster], [foe]);
    const fx = { type: 'dot', power: 0.5, element: 'fire', duration: 2, scope: 'target' };
    applyEffect(fx, caster, [foe], ctx, 'fireArrow');
    foe.buffs[0].duration = 1; // 模擬時間流逝
    caster.atk = 200; // 施放者變強
    applyEffect(fx, caster, [foe], ctx, 'fireArrow');
    const dots = foe.buffs.filter((b) => b.kind === 'dot');
    expect(dots.length).toBe(1); // 不疊層
    expect(dots[0].duration).toBe(2); // 剩餘 1 +1
    expect(dots[0].damage).toBe(100); // 傷害更新為新值（200×0.5）
  });

  it('不同施放者（同技能）：各自獨立一層', () => {
    const a = makeUnit({ team: 0, pos: 1, atk: 100 });
    const b = makeUnit({ team: 0, pos: 2, atk: 60 });
    const foe = makeUnit({ team: 1, pos: 1, element: 'fire' });
    const fx = { type: 'dot', power: 0.5, element: 'fire', duration: 2, scope: 'target' };
    applyEffect(fx, a, [foe], ctxFor(a, [a, b], [foe]), 'fireArrow');
    applyEffect(fx, b, [foe], ctxFor(b, [a, b], [foe]), 'fireArrow');
    const dots = foe.buffs.filter((b2) => b2.kind === 'dot');
    expect(dots.length).toBe(2); // 兩層獨立
    expect(dots.map((d) => d.damage).sort((x, y) => x - y)).toEqual([30, 50]);
  });

  it('跨角色 combo：A 的火可被引爆者一併結算', () => {
    const a = makeUnit({ team: 0, pos: 1, atk: 100 });
    const b = makeUnit({ team: 0, pos: 2, atk: 60 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 1000, element: 'fire', class: 'tank' });
    const fx = { type: 'dot', power: 0.5, element: 'fire', duration: 2, scope: 'target' };
    applyEffect(fx, a, [foe], ctxFor(a, [a, b], [foe]), 'fireArrow'); // 50×2=100
    applyEffect(fx, b, [foe], ctxFor(b, [a, b], [foe]), 'fireArrow'); // 30×2=60
    const ctx = ctxFor(b, [a, b], [foe]);
    applyEffect({ type: 'detonateDot', element: 'fire', scope: 'target' }, b, [foe], ctx, 'detonate');
    expect(foe.hp).toBe(1000 - 160); // 兩人的火一起被引爆
    expect(foe.buffs.filter((x) => x.kind === 'dot').length).toBe(0);
  });
});

describe('DoT 操作原語：延長 / 易傷 / 引爆', () => {
  it('extend：延長敵方灼燒 +1 回合（element 過濾、不動增益與光環）', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1 });
    applyBuff(foe, { kind: 'dot', damage: 20, element: 'fire', duration: 2 });
    applyBuff(foe, { kind: 'dot', damage: 10, duration: 2 }); // 無屬性毒（不受 element:'fire' 影響）
    applyBuff(foe, { kind: 'shield', amount: 50, duration: 2 }); // 增益不動
    applyBuff(foe, { kind: 'stat', stat: 'def', op: 'mul', value: 1.1, duration: null, aura: true }); // 光環不動
    const ctx = ctxFor(caster, [caster], [foe]);
    applyEffect({ type: 'extend', what: 'dot', element: 'fire', turns: 1, scope: 'target' }, caster, [foe], ctx);
    expect(foe.buffs.find((b) => b.element === 'fire').duration).toBe(3);
    expect(foe.buffs.find((b) => b.kind === 'dot' && !b.element).duration).toBe(2);
    expect(foe.buffs.find((b) => b.kind === 'shield').duration).toBe(2);
  });

  it('extend what:negative：所有減益 +1（含控制），嘲諷除外', () => {
    const caster = makeUnit({ team: 0, pos: 1 });
    const foe = makeUnit({ team: 1, pos: 1 });
    applyBuff(foe, { kind: 'control', control: 'stun', duration: 1 });
    applyBuff(foe, { kind: 'control', control: 'taunt', duration: 2 }); // 嘲諷非減益
    const ctx = ctxFor(caster, [caster], [foe]);
    applyEffect({ type: 'extend', what: 'negative', turns: 1, scope: 'target' }, caster, [foe], ctx);
    expect(foe.buffs.find((b) => b.control === 'stun').duration).toBe(2);
    expect(foe.buffs.find((b) => b.control === 'taunt').duration).toBe(2);
  });

  it('dotTaken 易傷：DoT 跳傷吃倍率', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 1000, class: 'tank' });
    applyBuff(foe, { kind: 'stat', stat: 'dotTaken', op: 'mul', value: 1.5, duration: 2 });
    const ctx = ctxFor(caster, [caster], [foe]);
    dealDot(foe, { damage: 30 }, ctx);
    expect(foe.hp).toBe(1000 - 45); // 30 × 1.5
  });

  it('detonateDot：每跳×剩餘回合一次結算、移除狀態、吃易傷、element 過濾', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 1000, class: 'tank' });
    applyBuff(foe, { kind: 'dot', damage: 20, element: 'fire', duration: 3 }); // 60
    applyBuff(foe, { kind: 'dot', damage: 15, element: 'fire', duration: 2 }); // 30
    applyBuff(foe, { kind: 'dot', damage: 50, duration: 2 }); // 無屬性：不引爆
    const events = [];
    const ctx = ctxFor(caster, [caster], [foe], events);
    applyEffect({ type: 'detonateDot', element: 'fire', scope: 'target' }, caster, [foe], ctx, 'detonate');
    expect(foe.hp).toBe(1000 - 90); // 60 + 30
    expect(foe.buffs.filter((b) => b.kind === 'dot').length).toBe(1); // 只剩無屬性毒
    const evt = events.find((e) => e.event === 'damage' && e.payload.detonate);
    expect(evt.payload.amount).toBe(90);
    // 身上沒有可引爆的 → 不發事件不扣血
    const foe2 = makeUnit({ team: 1, pos: 2, hp: 500 });
    applyEffect({ type: 'detonateDot', element: 'fire', scope: 'target' }, caster, [foe2], ctx);
    expect(foe2.hp).toBe(500);
  });

  it('detonateDot 吃 dotTaken 易傷與 mult 加成', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 1000, class: 'tank' });
    applyBuff(foe, { kind: 'dot', damage: 20, element: 'fire', duration: 2 }); // 40
    applyBuff(foe, { kind: 'stat', stat: 'dotTaken', op: 'mul', value: 1.5, duration: 2 });
    const ctx = ctxFor(caster, [caster], [foe]);
    applyEffect({ type: 'detonateDot', element: 'fire', mult: 1.2, scope: 'target' }, caster, [foe], ctx);
    expect(foe.hp).toBe(1000 - Math.round(40 * 1.2 * 1.5)); // 72
  });
});

describe('新原語：荊棘反傷 / 反擊', () => {
  it('thorns：受直接攻擊時反彈實際傷害的 pct 給攻擊者', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100, hp: 1000 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0, class: 'tank' });
    applyBuff(foe, { kind: 'thorns', pct: 0.3, duration: 2 });
    const events = [];
    const ctx = ctxFor(caster, [caster], [foe], events);
    const dealt = dealDamage(caster, foe, 1.0, ctx, 'hit');
    const thornEvt = events.find((e) => e.event === 'damage' && e.payload.skill === 'thorns');
    expect(thornEvt.payload.target).toBe(caster);
    expect(thornEvt.payload.amount).toBe(Math.max(1, Math.round(dealt * 0.3)));
    expect(caster.hp).toBe(1000 - thornEvt.payload.amount);
  });

  it('counter：受擊存活時回敬一擊，且不會連鎖反擊', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100, hp: 100000 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, def: 0, atk: 100, class: 'tank' });
    applyBuff(foe, { kind: 'counter', mult: 0.8, duration: 2 });
    applyBuff(caster, { kind: 'counter', mult: 0.8, duration: 2 }); // 攻擊者也有反擊 → 不得連鎖
    const events = [];
    const ctx = ctxFor(caster, [caster], [foe], events);
    dealDamage(caster, foe, 1.0, ctx, 'hit');
    const counters = events.filter((e) => e.event === 'damage' && e.payload.skill === 'counter');
    expect(counters.length).toBe(1); // 只有 foe 的反擊，caster 的反擊不因反擊而觸發
    expect(counters[0].payload.target).toBe(caster);
    expect(caster.hp).toBeLessThan(100000);
  });

  it('DoT 結算不觸發荊棘/反擊（僅直接攻擊觸發）', () => {
    const caster = makeUnit({ team: 0, pos: 1, atk: 100, hp: 1000 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999, class: 'tank' });
    applyBuff(foe, { kind: 'thorns', pct: 0.3, duration: 2 });
    applyBuff(foe, { kind: 'counter', mult: 0.8, duration: 2 });
    const events = [];
    const ctx = ctxFor(caster, [caster], [foe], events);
    dealDot(foe, { damage: 100 }, ctx);
    expect(events.filter((e) => e.payload?.skill === 'thorns' || e.payload?.skill === 'counter').length).toBe(0);
    expect(caster.hp).toBe(1000);
  });
});
