// 觸發系統：時機比對（triggers.js）＋引擎派發（_fireTriggers）。
//   時機：death（亡語/隊友/敵人）/ cast / normal / hit（via）/ hpBelow / buffGained
//   once/chance/連鎖上限 2 層；效果沿用 applyEffect（scope 相對持有者、target=事件主體）。
import { describe, it, expect } from 'vitest';
import { makeUnit } from './testHelpers.js';
import { BattleEngine } from './engine.js';
import { ENERGY_MAX } from './unit.js';
import { Rng } from '../core/rng.js';

const mk = (opts) => makeUnit(opts);

describe('觸發：死亡類', () => {
  it('隊友倒下 → 全隊攻buff（軍魂不滅型）', () => {
    const banner = mk({ team: 0, pos: 4, class: 'support', triggers: [
      { name: '軍魂不滅', on: 'death', who: 'ally', effects: [{ type: 'buff', stat: 'atk', op: 'mul', value: 1.1, duration: 2, scope: 'allAllies' }] },
    ] });
    const ally = mk({ team: 0, pos: 1, hp: 10 });
    const foe = mk({ team: 1, pos: 1, atk: 500, hp: 99999 });
    const engine = new BattleEngine([banner, ally], [foe], { rng: new Rng(1) });
    while (ally.alive && !engine.over) engine.step();
    expect(ally.alive).toBe(false);
    expect(banner.buffs.some((b) => b.stat === 'atk' && b.value === 1.1)).toBe(true);
  });

  it('敵人倒下 → 自身回能（死神收割型）；亡語（自身倒下）也能觸發', () => {
    const widow = mk({ team: 0, pos: 1, atk: 5000, triggers: [
      { name: '死神收割', on: 'death', who: 'enemy', effects: [{ type: 'energy', amount: 25, scope: 'self' }] },
    ] });
    const foe = mk({ team: 1, pos: 1, hp: 10, def: 0 });
    const engine = new BattleEngine([widow], [foe], { rng: new Rng(1) });
    engine.step(); // 普攻擊殺 → 觸發收割
    expect(widow.energy).toBeGreaterThanOrEqual(25);

    // 亡語：死者自己的 death 觸發允許發動
    const martyr = mk({ team: 0, pos: 1, hp: 10, triggers: [
      { name: '遺志', on: 'death', who: 'self', effects: [{ type: 'buff', stat: 'atk', op: 'mul', value: 1.3, duration: 2, scope: 'allAllies' }] },
    ] });
    const buddy = mk({ team: 0, pos: 2 });
    const killer = mk({ team: 1, pos: 1, atk: 900, hp: 99999 });
    const e2 = new BattleEngine([martyr, buddy], [killer], { rng: new Rng(1) });
    while (martyr.alive && !e2.over) e2.step();
    expect(buddy.buffs.some((b) => b.stat === 'atk' && b.value === 1.3)).toBe(true); // 遺志傳承給隊友
  });
});

describe('觸發：受擊 / 血線 / 獲得狀態', () => {
  it('hit via:normal 只吃普攻；hpBelow 跨線觸發且預設每場一次', () => {
    const bruiser = mk({ team: 0, pos: 1, hp: 1000, triggers: [
      { name: '硬化', on: 'hit', via: 'normal', effects: [{ type: 'buff', stat: 'def', op: 'mul', value: 1.2, duration: 1, scope: 'self' }] },
    ] });
    const foe = mk({ team: 1, pos: 1, atk: 100, hp: 99999 });
    const engine = new BattleEngine([bruiser], [foe], { rng: new Rng(2) });
    engine.step(); // 我方普攻
    engine.step(); // 敵方普攻 → 觸發硬化
    expect(bruiser.buffs.some((b) => b.stat === 'def' && b.value === 1.2)).toBe(true);

    const lowhp = mk({ team: 0, pos: 1, hp: 1000, triggers: [
      { name: '背水', on: 'hpBelow', pct: 0.5, effects: [{ type: 'buff', stat: 'atk', op: 'mul', value: 1.5, duration: 3, scope: 'self' }] },
    ] });
    const heavy = mk({ team: 1, pos: 1, atk: 260, hp: 99999 });
    const e2 = new BattleEngine([lowhp], [heavy], { rng: new Rng(3) });
    let fired = 0;
    e2.on('trigger', ({ name }) => { if (name === '背水') fired += 1; });
    for (let i = 0; i < 12 && lowhp.alive && !e2.over; i++) e2.step();
    expect(fired).toBe(1); // 跨線一次、每場一次
  });

  it('buffGained negative:true 只吃減益', () => {
    const cleanser = mk({ team: 0, pos: 1, hp: 1000, triggers: [
      { name: '逆襲', on: 'buffGained', negative: true, effects: [{ type: 'buff', stat: 'atk', op: 'mul', value: 1.2, duration: 2, scope: 'self' }] },
    ] });
    const foe = mk({ team: 1, pos: 1, hp: 99999 });
    const engine = new BattleEngine([cleanser], [foe], { rng: new Rng(1) });
    // 直接透過引擎事件驗證（applyEffect 上狀態時會發 buffApplied）
    engine.emit('buffApplied', { unit: cleanser, negative: false });
    expect((cleanser.buffs ?? []).some((b) => b.stat === 'atk' && b.value === 1.2)).toBe(false); // 增益不觸發
    engine.emit('buffApplied', { unit: cleanser, negative: true });
    expect((cleanser.buffs ?? []).some((b) => b.stat === 'atk' && b.value === 1.2)).toBe(true); // 減益觸發
  });
});

describe('觸發：連鎖上限與機率', () => {
  it('亡語連環爆會結算但不會無限連鎖（深度上限 2、戰鬥正常收尾）', () => {
    // A 普攻炸死 B → 殉爆B（第一層）炸死 A 與 C → 殉爆A/殉爆C（第二層，扇出）→ 更深的觸發被斷
    const bomb = (name) => ({ name, on: 'death', who: 'self', effects: [{ type: 'damage', mult: 50, scope: 'allEnemies' }] });
    const a = mk({ team: 0, pos: 1, hp: 10, atk: 100, triggers: [bomb('殉爆A')] });
    const b = mk({ team: 1, pos: 1, hp: 10, atk: 900, triggers: [bomb('殉爆B')] });
    const c = mk({ team: 0, pos: 2, hp: 10, atk: 1, triggers: [bomb('殉爆C')] });
    const engine = new BattleEngine([a, c], [b], { rng: new Rng(1) });
    const fired = [];
    engine.on('trigger', ({ name }) => fired.push(name));
    while (!engine.over) engine.step();
    expect(fired.length).toBe(3); // 三發殉爆各一次，沒有重複連鎖
    expect(engine.over).toBe(true); // 全滅收尾，不卡死
  });

  it('自我餵養迴圈被深度上限斷開（buffGained → 上buff → buffGained…）', () => {
    const looper = mk({ team: 0, pos: 1, hp: 1000, triggers: [
      { name: '共鳴', on: 'buffGained', effects: [{ type: 'buff', stat: 'atk', op: 'mul', value: 1.05, duration: 2, scope: 'self', stackable: true }] },
    ] });
    const foe = mk({ team: 1, pos: 1, hp: 99999 });
    const engine = new BattleEngine([looper], [foe], { rng: new Rng(1) });
    let fired = 0;
    engine.on('trigger', () => { fired += 1; });
    engine.emit('buffApplied', { unit: looper, negative: false }); // 外部上一個 buff
    expect(fired).toBe(2); // 第一層＋自餵一層，第三層被斷——不會掛死
  });

  it('once:true 只發一次；chance:0 永不觸發', () => {
    const u = mk({ team: 0, pos: 1, hp: 5000, triggers: [
      { name: '一次', on: 'hit', once: true, effects: [{ type: 'energy', amount: 10, scope: 'self' }] },
      { name: '不可能', on: 'hit', chance: 0, effects: [{ type: 'energy', amount: 99, scope: 'self' }] },
    ] });
    const foe = mk({ team: 1, pos: 1, atk: 50, hp: 99999 });
    const engine = new BattleEngine([u], [foe], { rng: new Rng(4) });
    const fired = [];
    engine.on('trigger', ({ name }) => fired.push(name));
    for (let i = 0; i < 10 && !engine.over; i++) engine.step();
    expect(fired.filter((n) => n === '一次').length).toBe(1);
    expect(fired).not.toContain('不可能');
  });

  it('滿氣觸發回能不會超出施放門檻語義（能量夾在 0..200）', () => {
    const u = mk({ team: 0, pos: 1, energy: ENERGY_MAX, triggers: [
      { name: '收割', on: 'death', who: 'enemy', effects: [{ type: 'energy', amount: 999, scope: 'self' }] },
    ] });
    const foe = mk({ team: 1, pos: 1, hp: 1, def: 0 });
    const engine = new BattleEngine([u], [foe], { rng: new Rng(1) });
    while (!engine.over) engine.step();
    expect(u.energy).toBeLessThanOrEqual(200);
  });
});
