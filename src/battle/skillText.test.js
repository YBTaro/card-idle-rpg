import { describe, it, expect } from 'vitest';
import { describeSkill, skillInfoForCard, describePassive, buffLabel } from './skillText.js';
import { summarizeBuffs } from './buffs.js';

// 用 summarizeBuffs 產出的摘要（含 up 方向）測 buffLabel 的升/降文字
const lbl = (buff) => buffLabel(summarizeBuffs({ buffs: [buff] })[0]);

describe('buffLabel 升降方向（按屬性實際升降，不按好壞）', () => {
  it('火油 dotTaken ×1.25＝提升（雖是壞事）', () => {
    expect(lbl({ kind: 'stat', stat: 'dotTaken', op: 'mul', value: 1.25 })).toBe('受到的持續傷害提升');
  });
  it('減傷 dmgTaken ×0.7＝降低（增益）', () => {
    expect(lbl({ kind: 'stat', stat: 'dmgTaken', op: 'mul', value: 0.7 })).toBe('承受傷害降低');
  });
  it('攻擊 ×1.2＝提升、×0.7＝降低', () => {
    expect(lbl({ kind: 'stat', stat: 'atk', op: 'mul', value: 1.2 })).toBe('攻擊提升');
    expect(lbl({ kind: 'stat', stat: 'atk', op: 'mul', value: 0.7 })).toBe('攻擊降低');
  });
  it('迴避 +0.3＝提升', () => {
    expect(lbl({ kind: 'stat', stat: 'dodge', op: 'add', value: 0.3 })).toBe('迴避率提升');
  });
});

describe('describeSkill（描述自動生成）', () => {
  it('焚天：全體傷害 + 火油（受到的持續傷害 +50%）', () => {
    const d = describeSkill('infernoNova');
    expect(d).toContain('敵方全體');
    expect(d).toContain('100%');
    expect(d).toContain('受到的持續傷害');
    expect(d).toContain('持續 3 次行動');
  });

  it('龍護：全隊承傷 -30% + 自身護盾', () => {
    const d = describeSkill('dragonGuard');
    expect(d).toContain('我方全體承受傷害 -30%');
    expect(d).toContain('自身');
    expect(d).toContain('200%');
    expect(d).toContain('護盾');
  });

  it('影誅：單體純傷害（無附帶狀態）', () => {
    const d = describeSkill('shadowExecute');
    expect(d).toContain('敵方單體');
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
    expect(describeSkill('emberWarmth')).toContain('灼燒持續時間 +2');
    expect(describeSkill('moltenBulwark')).toContain('受到的持續傷害 +30%');
    expect(describeSkill('detonate')).toContain('引爆');
    expect(describeSkill('flameShift')).toContain('轉化為自身剋制的屬性');
  });

  it('附加對敵效果描述為「命中的目標」，傷害段仍寫範圍', () => {
    const d = describeSkill('thunderMark');
    expect(d).toContain('敵方全體');   // 傷害段：範圍
    expect(d).toContain('命中的目標'); // 減益段：命中的目標
  });

  it('對我方/單體治療的可門檻效果不套用「命中的目標」', () => {
    expect(describeSkill('tideHymn')).not.toContain('命中的目標'); // 淨化我方，不改述
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
