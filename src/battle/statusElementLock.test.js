// 屬性狀態鎖（暫時政策，之後有機會外放）：
//   凍結＝水專屬、燃燒＝火專屬、中毒（無屬性 DoT）＝暗專屬、
//   沉默＝光專屬、易傷（敵方 dmgTaken↑）＝風專屬。
// 這條測試掃描全部卡片技能，防止新內容不小心外漏；開放政策時直接改/刪此檔。
import { describe, it, expect } from 'vitest';
import { SKILLS, CARD_SKILLS } from './skills.js';
import { CARDS } from '../data/cards.js';

const STATUS_ELEMENT = {
  freeze: 'water',
  silence: 'light',
};

describe('屬性狀態鎖（暫時）', () => {
  const entries = Object.entries(CARD_SKILLS).map(([cardId, skillId]) => ({
    cardId,
    element: CARDS[cardId]?.element,
    skill: SKILLS[skillId],
    skillId,
  }));

  it('凍結只出現在水屬、沉默只出現在光屬角色技能', () => {
    for (const { element, skill, cardId } of entries) {
      for (const fx of skill.effects) {
        if (fx.type !== 'control') continue;
        const need = STATUS_ELEMENT[fx.control];
        if (need) expect({ cardId, control: fx.control, element }).toEqual({ cardId, control: fx.control, element: need });
      }
    }
  });

  it('燃燒（fire DoT）只出現在火屬、中毒（無屬性 DoT）只出現在暗屬', () => {
    for (const { element, skill, cardId } of entries) {
      for (const fx of skill.effects) {
        if (fx.type !== 'dot') continue;
        const need = fx.element === 'fire' ? 'fire' : 'dark';
        expect({ cardId, dot: fx.element ?? 'poison', element }).toEqual({ cardId, dot: fx.element ?? 'poison', element: need });
      }
    }
  });

  it('屬性轉化（transmute）只出現在水/火/風角色技能', () => {
    for (const { element, skill, cardId } of entries) {
      for (const fx of skill.effects) {
        if (fx.type !== 'transmute') continue;
        expect(['water', 'fire', 'wind']).toContain(element);
        expect({ cardId, ok: true }).toEqual({ cardId, ok: true });
      }
    }
  });

  it('易傷（敵方 dmgTaken 增加）只出現在風屬角色技能', () => {
    for (const { element, skill, cardId } of entries) {
      for (const fx of skill.effects) {
        if (fx.type === 'buff' && fx.stat === 'dmgTaken' && fx.op === 'mul' && fx.value > 1) {
          expect({ cardId, element }).toEqual({ cardId, element: 'wind' });
        }
      }
    }
  });
});
