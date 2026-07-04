// 技能治理規則（設計原則的自動守門）：
//   1. 環境技專職：含 weather/terrain 的技能，環境以外的效果最多 1 條
//      ——開環境是戰略級，不與戰鬥效果打包；一張卡不能又開場又打又控。
//   2. 效果數上限：任何技能最多 4 條效果——角色分工靠組隊，不靠萬能卡。
import { describe, it, expect } from 'vitest';
import { SKILLS } from './skills.js';

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
});
