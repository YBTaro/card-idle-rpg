// 受治療量（healTaken）：Unit.heal 唯一入口。
//   治療增幅＝神專屬（甘霖：全隊受治療 +30%）、重傷＝不死專屬（喪鐘：敵方受治療 -50%）。
//   復活直接設 hp，不吃 healTaken。
import { describe, it, expect } from 'vitest';
import { makeUnit } from './testHelpers.js';
import { castSkill, SKILLS, CARD_SKILLS } from './skills.js';
import { applyBuff, isNegative } from './buffs.js';
import { CARDS } from '../data/cards.js';
import { Rng } from '../core/rng.js';

const ctxFor = (caster, allies, enemies) => ({
  allies, enemies, rng: new Rng(5),
  emit: () => {},
});

describe('受治療量（healTaken）', () => {
  it('增幅：+30% 後同量治療多 3 成；重傷：-50% 治療砍半', () => {
    const u = makeUnit({ hp: 1000 });
    u.hp = 100;
    expect(u.heal(100)).toBe(100); // 基準
    applyBuff(u, { kind: 'stat', stat: 'healTaken', op: 'mul', value: 1.3, duration: 2, key: 'amp' });
    expect(u.heal(100)).toBe(130);
    u.buffs = [];
    applyBuff(u, { kind: 'stat', stat: 'healTaken', op: 'mul', value: 0.5, duration: 2 });
    expect(u.heal(100)).toBe(50);
  });

  it('重傷是減益（可被淨化）、增幅是增益', () => {
    expect(isNegative({ kind: 'stat', stat: 'healTaken', op: 'mul', value: 0.5 })).toBe(true);
    expect(isNegative({ kind: 'stat', stat: 'healTaken', op: 'mul', value: 1.3 })).toBe(false);
  });

  it('甘霖（dawnmother）：全隊治療 + 受治療量 buff', () => {
    const caster = makeUnit({ team: 0, pos: 1, race: '神', atk: 100, hp: 1000 });
    const ally = makeUnit({ team: 0, pos: 2, hp: 1000 });
    ally.hp = 500;
    castSkill(caster, 'mercyRain', ctxFor(caster, [caster, ally], []));
    expect(ally.hp).toBeGreaterThan(500);
    expect(ally.buffs.some((b) => b.stat === 'healTaken' && b.value === 1.3)).toBe(true);
  });

  it('喪鐘（knellwitch）：敵方全體重傷 50%', () => {
    const caster = makeUnit({ team: 0, pos: 1, race: '不死' });
    const foe = makeUnit({ team: 1, pos: 1, hp: 1000 });
    foe.hp = 100;
    castSkill(caster, 'deathKnell', ctxFor(caster, [caster], [foe]));
    expect(foe.heal(100)).toBe(50); // 治療砍半
  });
});

describe('治療量機制的種族鎖（暫時政策）', () => {
  const entries = Object.entries(CARD_SKILLS).map(([cardId, skillId]) => ({
    cardId, race: CARDS[cardId]?.race, skill: SKILLS[skillId],
  }));

  it('受治療量↑只出現在神族技能、受治療量↓只出現在不死技能', () => {
    for (const { cardId, race, skill } of entries) {
      for (const fx of skill.effects) {
        if (fx.type !== 'buff' || fx.stat !== 'healTaken') continue;
        const need = fx.value > 1 ? '神' : '不死';
        expect({ cardId, dir: fx.value > 1 ? 'up' : 'down', race }).toEqual({ cardId, dir: fx.value > 1 ? 'up' : 'down', race: need });
      }
    }
  });
});
