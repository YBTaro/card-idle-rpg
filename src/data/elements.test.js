import { describe, it, expect } from 'vitest';
import { elementMultiplier, elementRelation } from './elements.js';

describe('屬性相剋', () => {
  it('循環相剋 fire > wind > water > fire', () => {
    expect(elementMultiplier('fire', 'wind')).toBe(1.5);
    expect(elementMultiplier('wind', 'water')).toBe(1.5);
    expect(elementMultiplier('water', 'fire')).toBe(1.5);
  });

  it('被剋方傷害降低', () => {
    expect(elementMultiplier('wind', 'fire')).toBe(0.75);
    expect(elementMultiplier('water', 'wind')).toBe(0.75);
    expect(elementMultiplier('fire', 'water')).toBe(0.75);
  });

  it('光暗互剋（雙向皆優勢）', () => {
    expect(elementMultiplier('light', 'dark')).toBe(1.5);
    expect(elementMultiplier('dark', 'light')).toBe(1.5);
  });

  it('無關屬性為中性', () => {
    expect(elementMultiplier('fire', 'light')).toBe(1.0);
    expect(elementMultiplier('water', 'dark')).toBe(1.0);
    expect(elementMultiplier('fire', 'fire')).toBe(1.0);
  });

  it('elementRelation 文字正確', () => {
    expect(elementRelation('fire', 'wind')).toBe('advantage');
    expect(elementRelation('wind', 'fire')).toBe('disadvantage');
    expect(elementRelation('fire', 'light')).toBe('neutral');
  });
});
