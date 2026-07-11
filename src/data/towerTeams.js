// 精心隊表：每塔 low(2 隊輪替) / mid(3 隊輪替) / apex(60,65,70,75,80 各一)。
// 屬性塔 apex 全隊吃香屬性；沼澤塔 apex 為跨屬性毒隊。隊內順序＝前→後意圖（站位仍由 attackStyle 決定）。
export const TRACK_TEAMS = {
  sunny: {
    low: [
      ['emberguard', 'cinderblade', 'rageclaw', 'emberwitch', 'flarearcher', 'ashpriest'],
      ['redlion', 'magmaturtle', 'ifrit', 'pyrelord', 'flarearcher', 'sunherald'],
    ],
    mid: [
      ['redlion', 'cinderblade', 'emberguard', 'pyrelord', 'emberwitch', 'ashpriest'],
      ['hornchief', 'magmaturtle', 'flamewyrm', 'pyrelord', 'flarearcher', 'sunherald'],
      ['siegemarshal', 'redlion', 'emberguard', 'magmaturtle', 'ironcannon', 'warbanner'],
    ],
    apex: {
      60: ['redlion', 'cinderblade', 'flamewyrm', 'pyrelord', 'emberwitch', 'ashpriest'],
      65: ['siegemarshal', 'redlion', 'emberguard', 'magmaturtle', 'ironcannon', 'warbanner'],
      70: ['hornchief', 'rageclaw', 'magmaturtle', 'pyrelord', 'flarearcher', 'sunherald'],
      75: ['emberguard', 'redlion', 'cinderblade', 'pyrelord', 'emberwitch', 'flarearcher'],
      80: ['redlion', 'emberguard', 'cinderblade', 'pyrelord', 'emberwitch', 'sunherald'],
    },
  },
  rain: {
    low: [
      ['aegis', 'abysshunter', 'mistdancer', 'tidecaller', 'tidesinger', 'coralshaman'],
      ['glacierknight', 'leviathan', 'pearlguard', 'frostmage', 'rainherald', 'mistwarden'],
    ],
    mid: [
      ['aegis', 'drakebastion', 'leviathan', 'frostmage', 'tidecaller', 'rainherald'],
      ['glacierknight', 'mistdancer', 'abysshunter', 'frostmage', 'tidesinger', 'mistwarden'],
      ['pearlguard', 'bulwarkengine', 'aegis', 'tidecaller', 'coralshaman', 'rainherald'],
    ],
    apex: {
      60: ['glacierknight', 'mistdancer', 'drakebastion', 'frostmage', 'tidesinger', 'mistwarden'],
      65: ['aegis', 'pearlguard', 'bulwarkengine', 'tidecaller', 'tidesinger', 'rainherald'],
      70: ['drakebastion', 'leviathan', 'abysshunter', 'frostmage', 'tidecaller', 'coralshaman'],
      75: ['pearlguard', 'bulwarkengine', 'mistdancer', 'frostmage', 'tidesinger', 'mistwarden'],
      80: ['aegis', 'drakebastion', 'leviathan', 'frostmage', 'tidecaller', 'rainherald'],
    },
  },
  gale: {
    low: [
      ['zephyr', 'galeninja', 'grovekeeper', 'tempesthawk', 'galewind', 'windsister'],
      ['stormblade', 'skylancer', 'zephyrmonk', 'huntmarshal', 'galeherald', 'dragonoracle'],
    ],
    mid: [
      ['grovekeeper', 'moonhowler', 'stormblade', 'tempesthawk', 'thundertotem', 'dragonoracle'],
      ['zephyrmonk', 'skylancer', 'galeninja', 'huntmarshal', 'veilwalker', 'wyrmmatriarch'],
      ['grovekeeper', 'zephyr', 'stormblade', 'tempesthawk', 'sylvanqueen', 'windsister'],
    ],
    apex: {
      60: ['grovekeeper', 'zephyrmonk', 'galeninja', 'tempesthawk', 'veilwalker', 'sylvanqueen'],
      65: ['grovekeeper', 'moonhowler', 'stormblade', 'huntmarshal', 'thundertotem', 'dragonoracle'],
      70: ['skylancer', 'zephyr', 'zephyrmonk', 'huntmarshal', 'dragonoracle', 'wyrmmatriarch'],
      75: ['zephyr', 'galeninja', 'stormblade', 'tempesthawk', 'galeherald', 'veilwalker'],
      80: ['grovekeeper', 'zephyrmonk', 'stormblade', 'tempesthawk', 'huntmarshal', 'dragonoracle'],
    },
  },
  surge: {
    low: [
      ['paladin', 'dawnblade', 'holyfencer', 'stargazer', 'seraph', 'dawnharpist'],
      ['radiantgolem', 'suninquisitor', 'sanctumjudge', 'lightweaver', 'dawnmother', 'hawkoracle'],
    ],
    mid: [
      ['sanctumjudge', 'godblade', 'suninquisitor', 'stargazer', 'dawnmother', 'lumenvessel'],
      ['paladin', 'dawnblade', 'holyfencer', 'lightweaver', 'dawnharpist', 'stargazer'],
      ['radiantgolem', 'suninquisitor', 'sanctumjudge', 'stargazer', 'seraph', 'hawkoracle'],
    ],
    apex: {
      60: ['sanctumjudge', 'godblade', 'paladin', 'stargazer', 'dawnmother', 'lumenvessel'],
      65: ['paladin', 'suninquisitor', 'holyfencer', 'lightweaver', 'dawnmother', 'stargazer'],
      70: ['sanctumjudge', 'dawnblade', 'godblade', 'stargazer', 'dawnharpist', 'lumenvessel'],
      75: ['radiantgolem', 'paladin', 'suninquisitor', 'dawnmother', 'seraph', 'hawkoracle'],
      80: ['paladin', 'sanctumjudge', 'godblade', 'stargazer', 'dawnmother', 'dawnharpist'],
    },
  },
  erosion: {
    low: [
      ['gravewarden', 'nightreaper', 'cryptwidow', 'plaguelord', 'shadowpriest', 'soulorganist'],
      ['boneknight', 'nightmare', 'voidshade', 'voidcaller', 'mireweaver', 'knellwitch'],
    ],
    mid: [
      ['deathlessking', 'gravewarden', 'vengefulshade', 'plaguelord', 'voidcaller', 'bonemarshal'],
      ['abysstyrant', 'nightmare', 'mirrorfox', 'plaguelord', 'terrorweaver', 'hexweaver'],
      ['boneknight', 'gravewarden', 'cryptwidow', 'plaguelord', 'voidcaller', 'knellwitch'],
    ],
    apex: {
      60: ['boneknight', 'gravewarden', 'nightreaper', 'plaguelord', 'voidcaller', 'bonemarshal'],
      65: ['abysstyrant', 'nightmare', 'mirrorfox', 'voidcaller', 'terrorweaver', 'hexweaver'],
      70: ['boneknight', 'cryptwidow', 'fluxreaver', 'plaguelord', 'mireweaver', 'knellwitch'],
      75: ['nightreaper', 'voidshade', 'bladeoath', 'voidcaller', 'plaguelord', 'soulorganist'],
      80: ['deathlessking', 'gravewarden', 'vengefulshade', 'plaguelord', 'voidcaller', 'knellwitch'],
    },
  },
  swamp: {
    low: [
      ['magmaturtle', 'cinderblade', 'nightmare', 'plaguelord', 'pyrelord', 'ashpriest'],
      ['boneknight', 'flamewyrm', 'cryptwidow', 'emberwitch', 'mireweaver', 'knellwitch'],
    ],
    mid: [
      ['redlion', 'cinderblade', 'flamewyrm', 'pyrelord', 'emberwitch', 'ashpriest'],
      ['deathlessking', 'cryptwidow', 'fluxreaver', 'plaguelord', 'hexweaver', 'knellwitch'],
      ['abysstyrant', 'flamewyrm', 'nightmare', 'plaguelord', 'terrorweaver', 'ashpriest'],
    ],
    apex: {
      60: ['redlion', 'cinderblade', 'flamewyrm', 'pyrelord', 'emberwitch', 'ashpriest'],
      65: ['deathlessking', 'boneknight', 'cryptwidow', 'plaguelord', 'hexweaver', 'knellwitch'],
      70: ['abysstyrant', 'cryptwidow', 'nightmare', 'terrorweaver', 'plaguelord', 'hexweaver'],
      75: ['hornchief', 'flamewyrm', 'magmaturtle', 'pyrelord', 'emberwitch', 'plaguelord'],
      80: ['abysstyrant', 'flamewyrm', 'fluxreaver', 'plaguelord', 'mireweaver', 'terrorweaver'],
    },
  },
};

// 樓層 → 精心隊（floor 必為 5 倍數）。令 n = floor/5。
export function bossTeamFor(trackId, floor) {
  const T = TRACK_TEAMS[trackId];
  const n = floor / 5;
  if (floor >= 60) return T.apex[floor];
  if (floor >= 30) return T.mid[n % 3];
  return n % 2 === 1 ? T.low[0] : T.low[1];
}
