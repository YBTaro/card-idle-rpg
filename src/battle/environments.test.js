// 環境系統測試：天氣光環/覆蓋順序、場地規則（湧能/侵蝕/沼澤）、靈壓干擾。
import { describe, it, expect } from 'vitest';
import { BattleEngine } from './engine.js';
import { simulateBattle } from './battleLog.js';
import { makeUnit } from './testHelpers.js';
import { Rng } from '../core/rng.js';
import { resolve, applyBuff } from './buffs.js';
import { campaignEnv, towerEnv, WEATHERS, TERRAINS } from './environments.js';

describe('天氣（烈日/暴雨）', () => {
  it('烈日：火屬 dmgDealt ×1.2、水屬 ×0.8（雙方都吃）', () => {
    const fire = makeUnit({ team: 0, pos: 1, element: 'fire' });
    const water = makeUnit({ team: 1, pos: 1, element: 'water' });
    const e = new BattleEngine([fire], [water], { rng: new Rng(1), env: { weather: 'sunny', terrain: null } });
    e.step();
    expect(resolve(fire, 'dmgDealt', 1)).toBeCloseTo(1.2);
    expect(resolve(water, 'dmgDealt', 1)).toBeCloseTo(0.8);
  });

  it('颶風：風屬造成傷害 ×1.2、承受傷害 ×0.9（其他屬性不受影響）', () => {
    const wind = makeUnit({ team: 0, pos: 1, element: 'wind' });
    const fire = makeUnit({ team: 0, pos: 2, element: 'fire' });
    const water = makeUnit({ team: 1, pos: 1, element: 'water' });
    const e = new BattleEngine([wind, fire], [water], { rng: new Rng(1), env: { weather: 'gale', terrain: null } });
    e.step();
    expect(resolve(wind, 'dmgDealt', 1)).toBeCloseTo(1.2);
    expect(resolve(wind, 'dmgTaken', 1)).toBeCloseTo(0.9);
    expect(resolve(fire, 'dmgDealt', 1)).toBe(1);
    expect(resolve(water, 'dmgDealt', 1)).toBe(1);
  });

  it('進場被動照行動序 1-1-2-2：守方最後一位搶到最終天氣', () => {
    // 攻方 pos1 開烈日、守方 pos2 開暴雨 → 序列 我1(烈日)→敵1→我2→敵2(暴雨) → 暴雨定案
    const a1 = makeUnit({ team: 0, pos: 1, onEnter: { weather: 'sunny' } });
    const a2 = makeUnit({ team: 0, pos: 2 });
    const b1 = makeUnit({ team: 1, pos: 1 });
    const b2 = makeUnit({ team: 1, pos: 2, onEnter: { weather: 'rain' } });
    const e = new BattleEngine([a1, a2], [b1, b2], { rng: new Rng(1) });
    const seen = [];
    e.on('weather', ({ id }) => seen.push(id));
    e.step();
    expect(seen).toEqual(['sunny', 'rain']);
    expect(e.weatherId).toBe('rain');
  });

  it('技能開天氣覆蓋當前（曦喚祭司「喚日」轉烈日）', () => {
    const caster = makeUnit({ team: 0, pos: 1, cardId: 'sunherald', class: 'support', energy: 100, element: 'fire' });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999 });
    const e = new BattleEngine([caster], [foe], { rng: new Rng(1), env: { weather: 'rain', terrain: null } });
    e.step(); // 普攻（滿氣）→ 中斷
    e.step(); // 喚日 → 天氣轉烈日
    expect(e.weatherId).toBe('sunny');
  });
});

describe('場地', () => {
  it('湧能磁場：光屬集氣 +20% 且承傷 -15%（啟動能量已取消）', () => {
    const light = makeUnit({ team: 0, pos: 1, element: 'light' });
    const fire = makeUnit({ team: 1, pos: 1, element: 'fire' });
    const e = new BattleEngine([light], [fire], { rng: new Rng(1), env: { weather: null, terrain: 'surge' } });
    e.step();
    expect(resolve(light, 'energyGain', 1)).toBeCloseTo(1.2);
    expect(resolve(light, 'dmgTaken', 1)).toBeCloseTo(0.85);
    expect(resolve(fire, 'energyGain', 1)).toBe(1);
    expect(resolve(fire, 'dmgTaken', 1)).toBe(1);
  });

  it('侵蝕之地：非暗屬每回合流失 10%、暗屬豁免且暴擊率 +10%', () => {
    const dark = makeUnit({ team: 0, pos: 1, element: 'dark', hp: 1000, def: 100000 });
    const fire = makeUnit({ team: 1, pos: 1, element: 'fire', hp: 1000, def: 100000 });
    const e = new BattleEngine([dark], [fire], { rng: new Rng(1), env: { weather: null, terrain: 'erosion' } });
    e.step();
    expect(dark.critChance).toBeCloseTo(0.05 + 0.2); // 基礎 5% + 場地 20%
    expect(fire.critChance).toBeCloseTo(0.05);
    const envDmg = [];
    e.on('damage', (p) => { if (p.skill === 'env') envDmg.push([p.target.element, p.amount]); });
    // 打到第 2 回合觸發侵蝕（高防互打不掉血，衰減傷害可辨識）
    for (let i = 0; i < 10 && e.round < 2; i += 1) e.step();
    expect(envDmg.some(([el, amt]) => el === 'fire' && amt === 100)).toBe(true); // 10% of 1000
    expect(envDmg.every(([el]) => el !== 'dark')).toBe(true); // 暗屬豁免
  });

  it('迷霧沼澤：dotTaken 光環 ×1.2 全場生效', () => {
    const a = makeUnit({ team: 0, pos: 1 });
    const b = makeUnit({ team: 1, pos: 1 });
    const e = new BattleEngine([a], [b], { rng: new Rng(1), env: { weather: null, terrain: 'swamp' } });
    e.step();
    expect(resolve(a, 'dotTaken', 1)).toBeCloseTo(1.2);
    expect(resolve(b, 'dotTaken', 1)).toBeCloseTo(1.2);
  });

  it('技能中途換場地：聚能星使「引磁」把場地轉為湧能磁場', () => {
    const vessel = makeUnit({ team: 0, pos: 1, cardId: 'lumenvessel', class: 'support', energy: 100, element: 'light' });
    const ally = makeUnit({ team: 0, pos: 2, element: 'light' });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999 });
    const e = new BattleEngine([vessel, ally], [foe], { rng: new Rng(1) });
    e.step(); // 普攻 → 中斷
    e.step(); // 引磁：開湧能磁場 + 光屬隊友充能 10
    expect(e.terrainId).toBe('surge');
    expect(ally.energy).toBeGreaterThanOrEqual(10);
  });
});

describe('靈壓干擾（castDrain）', () => {
  const cast = (engine) => { engine.step(); engine.step(); }; // 普攻中斷 + 技能階段

  it('敵方施法 → 其餘敵人 -20、施法者不扣；可疊加；持續 2 回合', () => {
    // 我方掛兩層 castDrain（模擬疊加）→ 敵施法者的隊友 -40
    const holder = makeUnit({ team: 0, pos: 1, hp: 99999 });
    applyBuff(holder, { kind: 'castDrain', amount: 20, duration: 2, stackable: true });
    applyBuff(holder, { kind: 'castDrain', amount: 20, duration: 2, stackable: true });
    const caster = makeUnit({ team: 1, pos: 1, class: 'dps', energy: 100, hp: 99999 });
    const mate = makeUnit({ team: 1, pos: 2, energy: 60, hp: 99999 });
    const e = new BattleEngine([holder], [caster, mate], { rng: new Rng(1) });
    const drains = [];
    e.on('drain', ({ unit, amount }) => drains.push([unit.pos, amount]));
    // 推進直到敵方施法完成
    for (let i = 0; i < 8 && !drains.length; i += 1) e.step();
    expect(drains).toContainEqual([2, 40]); // 隊友被抽 40（兩層疊加）
    expect(caster.energy).toBe(0); // 施法者只是正常歸零，不被抽
  });

  it('蝕心技能會掛上 castDrain buff', () => {
    const priest = makeUnit({ team: 0, pos: 1, cardId: 'shadowpriest', class: 'support', energy: 100 });
    const foe = makeUnit({ team: 1, pos: 1, hp: 99999 });
    const e = new BattleEngine([priest], [foe], { rng: new Rng(1) });
    cast(e);
    expect(priest.buffs.some((b) => b.kind === 'castDrain' && b.amount === 20)).toBe(true);
  });
});

describe('內容選擇器與序列化', () => {
  it('campaignEnv：第 1 章中立、之後天氣兩種交替', () => {
    expect(campaignEnv(5)).toEqual({ weather: null, terrain: null });
    expect(campaignEnv(11).weather).toBe('sunny');
    expect(campaignEnv(21).weather).toBe('rain');
    expect(Object.keys(TERRAINS)).toContain(campaignEnv(11).terrain);
  });

  it('towerEnv：火/水/風層帶對應天氣、前 5 層無場地', () => {
    expect(towerEnv(1, 'fire')).toEqual({ weather: 'sunny', terrain: null });
    expect(towerEnv(3, 'water').weather).toBe('rain');
    expect(towerEnv(2, 'wind').weather).toBe('gale');
    expect(towerEnv(4, 'light').weather).toBe(null);
    expect(towerEnv(7, 'fire').terrain).not.toBe(null);
  });

  it('log 記錄天氣/場地事件、同種子重播一致', () => {
    const mk = () => [makeUnit({ team: 0, pos: 1, onEnter: { weather: 'sunny' } })];
    const mkB = () => [makeUnit({ team: 1, pos: 1 })];
    const r1 = simulateBattle(mk(), mkB(), { rng: new Rng(9), env: { weather: null, terrain: 'swamp' } });
    expect(r1.log.some((e) => e.type === 'weather' && e.id === 'sunny')).toBe(true);
    expect(r1.log.some((e) => e.type === 'terrain' && e.id === 'swamp')).toBe(true);
    const r2 = simulateBattle(mk(), mkB(), { rng: new Rng(9), env: { weather: null, terrain: 'swamp' } });
    expect(r1.winner).toBe(r2.winner);
    expect(r1.log.length).toBe(r2.log.length);
  });
});
