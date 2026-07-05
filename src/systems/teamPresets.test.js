// 隊伍預設槽：存/覆蓋/載入（略過已失去的角色）/上限。
import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '../core/state.js';
import { saveCurrentAsPreset, overwritePreset, loadPreset, deletePreset, getPresets, MAX_PRESETS } from './teamPresets.js';

function mkState() {
  return {
    cards: [1, 2, 3, 4].map((id) => ({ instanceId: id, cardId: 'zephyr', level: 1 })),
    formation: [{ instanceId: 1, pos: 1 }, { instanceId: 2, pos: 2 }],
    teamPresets: [],
  };
}

describe('隊伍預設槽', () => {
  beforeEach(() => { store.state = mkState(); });

  it('存目前隊伍成一組預設', () => {
    const i = saveCurrentAsPreset('主力');
    expect(i).toBe(0);
    expect(getPresets()[0].name).toBe('主力');
    expect(getPresets()[0].slots).toEqual([{ instanceId: 1, pos: 1 }, { instanceId: 2, pos: 2 }]);
  });

  it('載入：替換出戰隊', () => {
    saveCurrentAsPreset('A');
    store.state.formation = [{ instanceId: 3, pos: 5 }]; // 改成別的隊
    const r = loadPreset(0);
    expect(r.ok).toBe(true);
    expect(r.loaded).toBe(2);
    expect(store.state.formation).toEqual([{ instanceId: 1, pos: 1 }, { instanceId: 2, pos: 2 }]);
  });

  it('載入：已賣掉/不存在的角色自動略過', () => {
    saveCurrentAsPreset('A');
    store.state.cards = store.state.cards.filter((c) => c.instanceId !== 2); // 賣掉 2 號
    const r = loadPreset(0);
    expect(r.loaded).toBe(1);
    expect(r.skipped).toBe(1);
    expect(store.state.formation).toEqual([{ instanceId: 1, pos: 1 }]);
  });

  it('覆蓋：把槽更新成目前隊伍', () => {
    saveCurrentAsPreset('A');
    store.state.formation = [{ instanceId: 4, pos: 3 }];
    expect(overwritePreset(0)).toBe(true);
    expect(getPresets()[0].slots).toEqual([{ instanceId: 4, pos: 3 }]);
  });

  it('上限 10 組', () => {
    for (let i = 0; i < MAX_PRESETS; i += 1) expect(saveCurrentAsPreset()).toBe(i);
    expect(saveCurrentAsPreset()).toBe(-1); // 滿了
    expect(getPresets().length).toBe(MAX_PRESETS);
  });

  it('刪除', () => {
    saveCurrentAsPreset('A');
    saveCurrentAsPreset('B');
    deletePreset(0);
    expect(getPresets().length).toBe(1);
    expect(getPresets()[0].name).toBe('B');
  });
});
