import { describe, it, expect } from 'vitest';
import { TRACK_TEAMS, bossTeamFor } from './towerTeams.js';
import { TOWER_TRACKS } from './towerTracks.js';
import { CARDS } from './cards.js';
import { CARD_SKILLS, SKILLS } from '../battle/skills.js';

// 會產生 dot / nightmare 的技能（沼澤塔「搭配」＝毒隊的判準）
const DOT_SKILLS = new Set(
  Object.entries(SKILLS)
    .filter(([, def]) => def.effects.some((e) => e.type === 'dot' || e.type === 'nightmare' || e.type === 'detonateDot' || e.type === 'extend'))
    .map(([id]) => id)
);
const carriesDot = (cardId) => {
  const c = CARDS[cardId];
  return DOT_SKILLS.has(CARD_SKILLS[cardId]) || Boolean(c.onEnter?.effects?.some((e) => e.type === 'dot'));
};

describe('towerTeams', () => {
  it('每座塔都有 low(2)/mid(3)/apex(60,65,70,75,80)', () => {
    for (const t of TOWER_TRACKS) {
      const T = TRACK_TEAMS[t.id];
      expect(T.low).toHaveLength(2);
      expect(T.mid).toHaveLength(3);
      expect(Object.keys(T.apex).map(Number).sort((a, b) => a - b)).toEqual([60, 65, 70, 75, 80]);
    }
  });

  it('每支隊 6 名、cardId 皆存在', () => {
    for (const t of TOWER_TRACKS) {
      const T = TRACK_TEAMS[t.id];
      const teams = [...T.low, ...T.mid, ...Object.values(T.apex)];
      for (const team of teams) {
        expect(team).toHaveLength(6);
        for (const id of team) expect(CARDS[id], `${t.id}:${id}`).toBeTruthy();
      }
    }
  });

  it('屬性塔 apex 全隊＝主題屬性；沼澤塔 apex ≥3 名帶毒', () => {
    for (const t of TOWER_TRACKS) {
      for (const team of Object.values(TRACK_TEAMS[t.id].apex)) {
        if (t.theme === 'dot') {
          expect(team.filter(carriesDot).length, `${t.id} dot`).toBeGreaterThanOrEqual(3);
        } else {
          for (const id of team) expect(CARDS[id].element, `${t.id}:${id}`).toBe(t.theme);
        }
      }
    }
  });

  it('bossTeamFor：分段對照', () => {
    expect(bossTeamFor('sunny', 15)).toEqual(TRACK_TEAMS.sunny.low[0]); // n=3 奇
    expect(bossTeamFor('sunny', 10)).toEqual(TRACK_TEAMS.sunny.low[1]); // n=2 偶
    expect(bossTeamFor('sunny', 40)).toEqual(TRACK_TEAMS.sunny.mid[2]); // n=8, 8%3=2
    expect(bossTeamFor('sunny', 80)).toEqual(TRACK_TEAMS.sunny.apex[80]);
  });
});
