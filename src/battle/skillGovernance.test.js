// 技能治理規則（設計原則的自動守門）：
//   1. 環境技專職：含 weather/terrain 的技能，環境以外的效果最多 1 條
//      ——開環境是戰略級，不與戰鬥效果打包；一張卡不能又開場又打又控。
//   2. 效果數上限：任何技能最多 4 條效果——角色分工靠組隊，不靠萬能卡。
//   3. 狀態類效果 ≤ 2：buff/debuff/控場/持續狀態每招最多兩條
//      ——一個角色的定位靠單一鮮明狀態，不靠狀態全家桶。
import { describe, it, expect } from 'vitest';
import { SKILLS } from './skills.js';
import { CARDS } from '../data/cards.js';

// 會掛在單位身上、持續存在的效果型別（傷害/治療/能量等瞬發不計）
const STATUS_TYPES = new Set(['buff', 'dot', 'hot', 'shield', 'control', 'thorns', 'counter', 'castDrain', 'transmute', 'nightmare', 'debuffBlock', 'mark', 'cheatDeath']);

describe('技能治理', () => {
  it('環境技專職：開天氣/場地的技能，副效果最多 1 條', () => {
    for (const [id, def] of Object.entries(SKILLS)) {
      const envCount = def.effects.filter((e) => e.type === 'weather' || e.type === 'terrain').length;
      if (envCount === 0) continue;
      const others = def.effects.length - envCount;
      expect({ id, others }).toEqual({ id, others: Math.min(others, 1) });
    }
  });

  it('效果數上限：任何技能 ≤ 4 條效果', () => {
    for (const [id, def] of Object.entries(SKILLS)) {
      expect({ id, n: def.effects.length }).toEqual({ id, n: Math.min(def.effects.length, 4) });
    }
  });

  it('狀態類效果上限：任何技能的 buff/debuff/控場/持續狀態 ≤ 2 條', () => {
    for (const [id, def] of Object.entries(SKILLS)) {
      const n = def.effects.filter((e) => STATUS_TYPES.has(e.type)).length;
      expect({ id, n }).toEqual({ id, n: Math.min(n, 2) });
    }
  });

  it('觸發上限：每卡最多 1 條 trigger、每條效果 ≤ 2（觸發是額外能力軸，不能堆）', () => {
    for (const card of Object.values(CARDS)) {
      const trigs = card.triggers ?? [];
      expect({ id: card.id, n: trigs.length }).toEqual({ id: card.id, n: Math.min(trigs.length, 1) });
      for (const t of trigs) {
        expect({ id: card.id, fx: t.effects.length }).toEqual({ id: card.id, fx: Math.min(t.effects.length, 2) });
      }
    }
  });

  it('觸發不得開環境：weather/terrain 只能由環境技或進場被動承載（戰略級不外漏）', () => {
    for (const card of Object.values(CARDS)) {
      for (const t of card.triggers ?? []) {
        const env = t.effects.filter((e) => e.type === 'weather' || e.type === 'terrain').length;
        expect({ id: card.id, env }).toEqual({ id: card.id, env: 0 });
      }
    }
  });

  it('被動軸互斥：每卡至多一個被動軸（光環/隊伍技/觸發/進場擇一；普攻＋絕技才是必備）', () => {
    for (const card of Object.values(CARDS)) {
      const axes = [];
      if ((card.passives ?? []).some((p) => !p.when?.alliesAtLeast)) axes.push('aura');
      if ((card.passives ?? []).some((p) => p.when?.alliesAtLeast)) axes.push('team');
      if (card.triggers?.length) axes.push('trigger');
      if (card.onEnter) axes.push('enter');
      expect({ id: card.id, axes: axes.length <= 1 ? 'ok' : axes.join('+') }).toEqual({ id: card.id, axes: 'ok' });
    }
  });
});
