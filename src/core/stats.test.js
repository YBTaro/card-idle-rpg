// src/core/stats.test.js
import { describe, it, expect } from 'vitest';
import { deriveStats } from './stats.js';

describe('deriveStats 帶出種族/系列', () => {
  it('輸出含 race 與 series', () => {
    const s = deriveStats({ cardId: 'gravewarden', level: 1 });
    expect(s.race).toBe('不死');
    expect(s.series).toContain('影之眷屬');
  });

  it('每個單位的 series 是獨立陣列（非共享參考）', () => {
    const a = deriveStats({ cardId: 'gravewarden', level: 1 });
    const b = deriveStats({ cardId: 'gravewarden', level: 1 });
    expect(a.series).not.toBe(b.series); // 不同陣列物件
    a.series.push('X');
    expect(b.series).not.toContain('X'); // 不互相污染
  });
});
