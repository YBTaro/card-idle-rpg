// 環境系統（寶可夢式）：天氣/場地是「戰鬥中可變的全場狀態」。
//   - 天氣（2 種）：屬性軸數值光環——烈日（火+20%/水-10%）、暴雨（水+20%/火-10%）
//   - 場地（8 種）：職業光環 或 特殊規則（治療減半/湧能/侵蝕/禁復活）
//   - 來源：關卡預設 → 進場被動（照行動序 1-1-2-2 結算，後者覆蓋）→ 戰鬥中技能覆蓋
// 純資料 + 純函式；引擎持有「當前天氣/場地 id」，每步把光環當無主 aura 套雙方。

export const WEATHERS = {
  sunny: {
    id: 'sunny', name: '烈日', color: '#ff9a5c',
    desc: '火屬性造成傷害 +20%；水屬性造成傷害 -20%',
    auras: [
      { where: { element: 'fire' }, effects: [{ stat: 'dmgDealt', op: 'mul', value: 1.2 }] },
      { where: { element: 'water' }, effects: [{ stat: 'dmgDealt', op: 'mul', value: 0.8 }] },
    ],
  },
  rain: {
    id: 'rain', name: '暴雨', color: '#7cc4ff',
    desc: '水屬性造成傷害 +20%；火屬性造成傷害 -20%',
    auras: [
      { where: { element: 'water' }, effects: [{ stat: 'dmgDealt', op: 'mul', value: 1.2 }] },
      { where: { element: 'fire' }, effects: [{ stat: 'dmgDealt', op: 'mul', value: 0.8 }] },
    ],
  },
  gale: {
    id: 'gale', name: '颶風', color: '#8ef2ae',
    desc: '風屬性造成傷害 +20%、受到傷害 -10%',
    auras: [
      { where: { element: 'wind' }, effects: [
        { stat: 'dmgDealt', op: 'mul', value: 1.2 },
        { stat: 'dmgTaken', op: 'mul', value: 0.9 },
      ] },
    ],
  },
};

export const TERRAINS = {
  surge: {
    id: 'surge', name: '湧能磁場', color: '#f5c451',
    desc: '光屬性集氣速度 +20%、所受傷害 -15%',
    auras: [{ where: { element: 'light' }, effects: [
      { stat: 'energyGain', op: 'mul', value: 1.2 },
      { stat: 'dmgTaken', op: 'mul', value: 0.85 },
    ] }],
  },
  erosion: {
    id: 'erosion', name: '侵蝕之地', color: '#c97b8e',
    desc: '每回合「非暗屬性」流失 10% 最大生命；暗屬性暴擊率 +10%',
    auras: [{ where: { element: 'dark' }, effects: [{ stat: 'critChance', op: 'add', value: 0.1 }] }],
    rules: { roundDecay: { pct: 0.1, exemptElement: 'dark' } },
  },
  swamp: {
    id: 'swamp', name: '迷霧沼澤', color: '#9d8ec9',
    desc: '雙方受到的持續傷害 +20%',
    auras: [{ where: null, effects: [{ stat: 'dotTaken', op: 'mul', value: 1.2 }] }],
  },
};

const TERRAIN_LIST = Object.values(TERRAINS);

// 目前天氣/場地的光環清單（id 可為 null）。
export function envAurasOf(weatherId, terrainId) {
  return [...(WEATHERS[weatherId]?.auras ?? []), ...(TERRAINS[terrainId]?.auras ?? [])];
}

// 目前生效的特殊規則（動態：場地被覆蓋後即換）。
export function envRulesOf(weatherId, terrainId) {
  return { ...(WEATHERS[weatherId]?.rules ?? {}), ...(TERRAINS[terrainId]?.rules ?? {}) };
}

// 顯示：名稱/說明/色（UI 徽章與 tooltip）。
export function weatherOf(id) { return WEATHERS[id] ?? null; }
export function terrainOf(id) { return TERRAINS[id] ?? null; }

export function envLabelOf(weatherId, terrainId) {
  return [WEATHERS[weatherId]?.name, TERRAINS[terrainId]?.name].filter(Boolean).join(' · ');
}

export function envDescOf(weatherId, terrainId) {
  const w = WEATHERS[weatherId];
  const t = TERRAINS[terrainId];
  return [w && `${w.name}：${w.desc}`, t && `${t.name}：${t.desc}`].filter(Boolean).join('\n');
}

// ---- 內容選擇器（關卡「預設」環境；進場被動與技能可覆蓋） ----

// 戰役：第 1 章中立；之後每章輪替（天氣三種輪替、場地依章循環）。
const WEATHER_LIST = Object.values(WEATHERS);
export function campaignEnv(stage) {
  const chapter = Math.floor((stage - 1) / 10); // 0-based
  if (chapter === 0) return { weather: null, terrain: null };
  const weather = WEATHER_LIST[(chapter - 1) % WEATHER_LIST.length].id;
  const terrain = TERRAIN_LIST[(chapter - 1) % TERRAIN_LIST.length].id;
  return { weather, terrain };
}

// 試煉塔：火/水/風主題層帶對應天氣；場地每 5 層一換、前 5 層無（新手緩坡）。
const THEME_WEATHER = { fire: 'sunny', water: 'rain', wind: 'gale' };
export function towerEnv(floor, theme) {
  const weather = THEME_WEATHER[theme] ?? null;
  const block = Math.floor((floor - 1) / 5);
  const terrain = block === 0 ? null : TERRAIN_LIST[(block - 1) % TERRAIN_LIST.length].id;
  return { weather, terrain };
}
