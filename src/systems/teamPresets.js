// 隊伍預設槽（最多 10 組）：把「目前出戰隊」存進槽、或把槽載回出戰隊。
// 資料：state.teamPresets = [{ name, slots: [{ instanceId, pos }] }]
import { store } from '../core/state.js';
import { saveGame } from '../core/save.js';

export const MAX_PRESETS = 10;

function persist() {
  saveGame();
  store.notify();
}

export function getPresets(state = store.state) {
  return state.teamPresets ?? [];
}

// 把目前出戰隊存成一組預設（append 到尾端；達上限則失敗）。回傳新槽 index 或 -1。
export function saveCurrentAsPreset(name = null, state = store.state) {
  const presets = (state.teamPresets ??= []);
  if (presets.length >= MAX_PRESETS) return -1;
  if (state.formation.length === 0) return -1;
  presets.push({
    name: name || `隊伍 ${presets.length + 1}`,
    slots: state.formation.map((e) => ({ instanceId: e.instanceId, pos: e.pos })),
  });
  persist();
  return presets.length - 1;
}

// 覆蓋指定槽為目前出戰隊。
export function overwritePreset(index, state = store.state) {
  const presets = state.teamPresets ?? [];
  if (!presets[index] || state.formation.length === 0) return false;
  presets[index].slots = state.formation.map((e) => ({ instanceId: e.instanceId, pos: e.pos }));
  persist();
  return true;
}

// 載入指定槽為出戰隊——只保留「仍持有」的角色（賣掉/不存在的自動略過），沿用其站位。
// 回傳 { ok, loaded, skipped }。
export function loadPreset(index, state = store.state) {
  const preset = (state.teamPresets ?? [])[index];
  if (!preset) return { ok: false };
  const owned = new Set(state.cards.map((c) => c.instanceId));
  const usedPos = new Set();
  const next = [];
  let skipped = 0;
  for (const s of preset.slots) {
    if (!owned.has(s.instanceId) || usedPos.has(s.pos)) { skipped += 1; continue; }
    usedPos.add(s.pos);
    next.push({ instanceId: s.instanceId, pos: s.pos });
  }
  state.formation = next;
  persist();
  return { ok: true, loaded: next.length, skipped };
}

export function renamePreset(index, name, state = store.state) {
  const preset = (state.teamPresets ?? [])[index];
  if (!preset) return false;
  preset.name = name.slice(0, 12) || preset.name;
  persist();
  return true;
}

export function deletePreset(index, state = store.state) {
  const presets = state.teamPresets ?? [];
  if (!presets[index]) return false;
  presets.splice(index, 1);
  persist();
  return true;
}
