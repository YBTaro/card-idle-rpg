// 種族三圍與種族隊完整性：
//   三圍層級＝職業 × 種族 × 個體風味（deriveStats）；
//   主要種族（≥5 名）必須坦/輸出/輔助齊全——種族隊組得起來是設計承諾。
import { describe, it, expect } from 'vitest';
import { deriveStats } from '../core/stats.js';
import { RACES } from '../data/races.js';
import { CARD_LIST } from '../data/cards.js';

const at10 = (cardId) => deriveStats({ cardId, level: 10, stars: 0 });

describe('種族三圍修正', () => {
  it('龍族輸出的血量高於人族輸出（種族修正乘在職業基準上）', () => {
    const dragon = at10('skylancer'); // 龍/輸出
    const human = at10('zephyr'); // 人/輸出
    expect(dragon.hp).toBeGreaterThan(human.hp);
    expect(dragon.atk).toBeGreaterThan(human.atk);
  });

  it('妖＝攻最高防最低；機械＝防最高攻最低（同職業比較）', () => {
    const fiend = at10('fluxreaver'); // 妖/輸出
    const machine = at10('ironcannon'); // 機械/輸出
    const human = at10('zephyr'); // 人/輸出
    expect(fiend.atk).toBeGreaterThan(human.atk);
    expect(fiend.def).toBeLessThan(human.def);
    expect(machine.def).toBeGreaterThan(human.def * 1.15);
    expect(machine.atk).toBeLessThanOrEqual(human.atk); // 攻不懲罰（盾量吃攻擊力），但絕不高於人族
  });

  it('不死坦＝血厚防薄；機械坦＝裝甲要塞', () => {
    const undead = at10('gravewarden');
    const machine = at10('emberguard');
    const human = at10('paladin');
    expect(undead.hp).toBeGreaterThan(human.hp);
    expect(undead.def).toBeLessThan(human.def);
    expect(machine.def).toBeGreaterThan(human.def * 1.2);
  });

  it('所有卡的種族都在 RACES 定義內', () => {
    for (const c of CARD_LIST) {
      expect({ id: c.id, known: !!RACES[c.race] }).toEqual({ id: c.id, known: true });
    }
  });
});

describe('種族隊完整性（設計承諾守門）', () => {
  it('成員 ≥5 的種族必須坦/輸出/輔助齊全', () => {
    const byRace = new Map();
    for (const c of CARD_LIST) {
      if (!byRace.has(c.race)) byRace.set(c.race, []);
      byRace.get(c.race).push(c);
    }
    for (const [race, cards] of byRace) {
      if (cards.length < 5) continue; // 稀有種族（神）豁免
      const classes = new Set(cards.map((c) => c.class));
      expect({ race, n: cards.length, classes: [...classes].sort() })
        .toEqual({ race, n: cards.length, classes: ['dps', 'support', 'tank'] });
    }
  });
});
