// src/core/stats.test.js
import { describe, it, expect } from 'vitest';
import { deriveStats } from './stats.js';

describe('deriveStats 帶出種族/系列', () => {
  it('輸出含 race 與 series', () => {
    const s = deriveStats({ cardId: 'gravewarden', level: 1 });
    expect(s.race).toBe('不死');
    expect(s.series).toContain('影之眷屬');
  });
});
