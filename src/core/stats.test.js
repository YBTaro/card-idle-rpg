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

describe('deriveStats 帶出被動', () => {
  it('aegis 有 def 光環被動；無被動卡為空陣列', () => {
    const s = deriveStats({ cardId: 'aegis', level: 1 });
    expect(Array.isArray(s.passives)).toBe(true);
    expect(s.passives.length).toBeGreaterThan(0);
    expect(s.passives[0].effects[0].stat).toBe('def');
    const z = deriveStats({ cardId: 'zephyr', level: 1 });
    expect(z.passives).toEqual([]);
  });
});

describe('升星', () => {
  it('每星三圍 +8%，里程碑追加自身被動，舊存檔缺欄位視為 0 星', () => {
    // zephyr lv10：raw atk = 92 + 11×9 = 191，dps 修正 ×1.8
    const rawAtk = (92 + 11 * 9) * 1.8;
    const s0 = deriveStats({ cardId: 'zephyr', level: 10, stars: 0 });
    const s3 = deriveStats({ cardId: 'zephyr', level: 10, stars: 3 });
    const s5 = deriveStats({ cardId: 'zephyr', level: 10, stars: 5 });
    expect(s0.atk).toBe(Math.round(rawAtk));
    expect(s3.atk).toBe(Math.round(rawAtk * 1.24)); // 3 星 ×1.24
    expect(s3.stars).toBe(3);
    // 里程碑：3 星已解鎖 2★（dmgDealt）；5 星 2/4/5★ 全解鎖
    expect(s3.passives.length).toBe(1);
    expect(s3.passives[0].effects[0].stat).toBe('dmgDealt');
    expect(s5.passives.length).toBe(3);
    // 未帶 stars 欄位（舊存檔）＝ 0 星
    expect(deriveStats({ cardId: 'zephyr', level: 10 }).atk).toBe(s0.atk);
  });
});
