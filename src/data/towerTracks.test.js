import { describe, it, expect } from 'vitest';
import { TOWER_TRACKS, TRACK_BY_ID, trackEnv } from './towerTracks.js';

describe('towerTracks', () => {
  it('六座塔、id 唯一、主題覆蓋五屬 + dot', () => {
    expect(TOWER_TRACKS).toHaveLength(6);
    const ids = TOWER_TRACKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(6);
    expect(new Set(TOWER_TRACKS.map((t) => t.theme)))
      .toEqual(new Set(['fire', 'water', 'wind', 'light', 'dark', 'dot']));
  });
  it('trackEnv：天氣塔只給 weather、場地塔只給 terrain', () => {
    expect(trackEnv('sunny')).toEqual({ weather: 'sunny', terrain: null });
    expect(trackEnv('surge')).toEqual({ weather: null, terrain: 'surge' });
  });
});
