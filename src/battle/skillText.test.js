import { describe, it, expect } from 'vitest';
import { describeSkill, skillInfoForCard } from './skillText.js';

describe('describeSkill（描述自動生成）', () => {
  it('焚天：前排傷害 + 灼燒', () => {
    const d = describeSkill('infernoNova');
    expect(d).toContain('敵方前排');
    expect(d).toContain('180%');
    expect(d).toContain('灼燒');
    expect(d).toContain('持續 2 次行動');
  });

  it('龍護：全隊承傷 -40% + 自身護盾', () => {
    const d = describeSkill('dragonGuard');
    expect(d).toContain('我方全體承受傷害 -40%');
    expect(d).toContain('自身');
    expect(d).toContain('200%');
    expect(d).toContain('護盾');
  });

  it('影誅：對位傷害 + 暈眩', () => {
    const d = describeSkill('shadowExecute');
    expect(d).toContain('對位敵人');
    expect(d).toContain('300%');
    expect(d).toContain('暈眩');
  });

  it('聖恩：治療血量最低隊友 + 全隊暴擊率 +20%', () => {
    const d = describeSkill('radiantGrace');
    expect(d).toContain('血量最低的隊友');
    expect(d).toContain('350%');
    expect(d).toContain('暴擊率 +20%');
  });

  it('未知技能 → 空字串', () => {
    expect(describeSkill('nope')).toBe('');
  });
});

describe('skillInfoForCard', () => {
  it('專屬技優先', () => {
    const info = skillInfoForCard('ifrit', 'dps');
    expect(info.id).toBe('infernoNova');
    expect(info.name).toBe('焚天');
    expect(info.desc.length).toBeGreaterThan(0);
  });

  it('無專屬技 → 職業大招', () => {
    const info = skillInfoForCard('no_such_card', 'tank');
    expect(info.id).toBe('guard');
  });
});
