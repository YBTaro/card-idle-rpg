import { describe, it, expect } from 'vitest';
import { describeSkill, skillInfoForCard, describePassive } from './skillText.js';

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

  it('影誅：對位純傷害（無附帶狀態）', () => {
    const d = describeSkill('shadowExecute');
    expect(d).toContain('對位敵人');
    expect(d).toContain('300%');
    expect(d).not.toContain('暈眩');
  });

  it('聖恩：全遊戲最大單體治療（暴擊 buff 歸晶輝）', () => {
    const d = describeSkill('radiantGrace');
    expect(d).toContain('血量最低的隊友');
    expect(d).toContain('400%');
    expect(d).not.toContain('暴擊率');
  });

  it('未知技能 → 空字串', () => {
    expect(describeSkill('nope')).toBe('');
  });

  it('DoT 操作技能描述：延長/易傷/引爆/轉化', () => {
    expect(describeSkill('emberWarmth')).toContain('灼燒持續時間 +1');
    expect(describeSkill('moltenBulwark')).toContain('受到的持續傷害 +30%');
    expect(describeSkill('detonate')).toContain('引爆');
    expect(describeSkill('flameShift')).toContain('轉化為自身剋制的屬性');
  });

  it('where 條件效果：種族/屬性/系列限定要寫進描述', () => {
    expect(describeSkill('holyVerdict')).toContain('「不死」'); // 剋不死追打
    expect(describeSkill('tsunami')).toContain('「火」屬性'); // 水滅火（element 轉中文）
    expect(describeSkill('gentleBreeze')).toContain('「精靈」'); // 精靈同族加護
    expect(describeSkill('warBanner')).toContain('「鐵壁」'); // 系列 buff
  });
});

describe('describePassive（targetWhere 主題光環）', () => {
  it('種族限定光環：我方全體「不死」單位', () => {
    const d = describePassive({ target: 'allAllies', targetWhere: { race: '不死' }, effects: [{ stat: 'def', op: 'mul', value: 1.12 }] });
    expect(d).toContain('我方全體「不死」單位');
    expect(d).toContain('防禦 +12%');
  });

  it('屬性限定光環：element 轉中文', () => {
    const d = describePassive({ target: 'allAllies', targetWhere: { element: 'light' }, effects: [{ stat: 'atk', op: 'mul', value: 1.08 }] });
    expect(d).toContain('「光」屬性');
  });

  it('perCountOf add 型：valuePer 以百分比呈現', () => {
    const d = describePassive({ target: 'self', effects: [{ stat: 'critChance', op: 'add', valuePer: 0.03, perCountOf: { side: 'allies', where: { race: '不死' } } }] });
    expect(d).toContain('+3%');
    expect(d).toContain('「不死」');
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
