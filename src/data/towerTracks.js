// 6 座屬性主題塔：每座＝一種固定環境（天氣或場地），對應一個吃香主題。
export const TOWER_TRACKS = [
  { id: 'sunny',   name: '烈日塔', envKind: 'weather', theme: 'fire',  color: '#ff9a5c' },
  { id: 'rain',    name: '暴雨塔', envKind: 'weather', theme: 'water', color: '#7cc4ff' },
  { id: 'gale',    name: '颶風塔', envKind: 'weather', theme: 'wind',  color: '#8ef2ae' },
  { id: 'surge',   name: '湧能塔', envKind: 'terrain', theme: 'light', color: '#f5c451' },
  { id: 'erosion', name: '侵蝕塔', envKind: 'terrain', theme: 'dark',  color: '#c97b8e' },
  { id: 'swamp',   name: '沼澤塔', envKind: 'terrain', theme: 'dot',   color: '#9d8ec9' },
];

export const TRACK_BY_ID = Object.fromEntries(TOWER_TRACKS.map((t) => [t.id, t]));

// 塔 id 與環境 id 同名 → 直接組成戰鬥環境（另一槽為 null）。
export function trackEnv(trackId) {
  const t = TRACK_BY_ID[trackId];
  if (!t) return { weather: null, terrain: null };
  return t.envKind === 'weather'
    ? { weather: t.id, terrain: null }
    : { weather: null, terrain: t.id };
}
