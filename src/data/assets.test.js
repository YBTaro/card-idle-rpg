import { describe, it, expect } from 'vitest';
import { CARD_ART, artFor, portraitFor, elementGradient } from './assets.js';

describe('asset manifest', () => {
  it('無素材 → null', () => {
    expect(artFor('no_such_card')).toBe(null);
    expect(portraitFor('no_such_card')).toBe(null);
    expect(artFor(undefined)).toBe(null);
  });

  it('有素材 → 路徑與預設裁切參數', () => {
    CARD_ART.__test = { art: 'assets/cards/test.png' };
    try {
      expect(artFor('__test')).toBe('assets/cards/test.png');
      expect(portraitFor('__test')).toEqual({ src: 'assets/cards/test.png', x: 0.5, y: 0.25, zoom: 2.0 });
    } finally { delete CARD_ART.__test; }
  });

  it('portrait 參數可覆寫', () => {
    CARD_ART.__test = { art: 'a.png', portrait: { x: 0.4, y: 0.1, zoom: 3 } };
    try {
      expect(portraitFor('__test')).toEqual({ src: 'a.png', x: 0.4, y: 0.1, zoom: 3 });
    } finally { delete CARD_ART.__test; }
  });

  it('elementGradient 五元素皆有值、未知退中性', () => {
    for (const e of ['fire', 'wind', 'water', 'light', 'dark']) {
      expect(elementGradient(e)).toContain('linear-gradient');
    }
    expect(elementGradient('nope')).toContain('linear-gradient');
  });
});
