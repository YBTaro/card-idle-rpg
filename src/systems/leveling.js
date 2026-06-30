// 升級系統：消耗養成素材（essence）+ 金幣，提升角色等級。
import { store } from '../core/state.js';
import { saveGame } from '../core/save.js';
import { deriveStats } from '../core/stats.js';

export const MAX_LEVEL = 60;

// 升 (level → level+1) 所需資源（佔位公式）。
export function levelUpCost(level) {
  return {
    essence: 8 + (level - 1) * 4,
    gold: 20 + (level - 1) * 15,
  };
}

export function canLevelUp(inst, state = store.state) {
  if (inst.level >= MAX_LEVEL) return false;
  const cost = levelUpCost(inst.level);
  return (state.inventory.materials.essence || 0) >= cost.essence && state.currencies.gold >= cost.gold;
}

// 執行升級。回傳 { ok, reason?, cost?, stats? }
export function levelUp(instanceId, state = store.state) {
  const inst = state.cards.find((c) => c.instanceId === instanceId);
  if (!inst) return { ok: false, reason: 'not-found' };
  if (inst.level >= MAX_LEVEL) return { ok: false, reason: 'max-level' };
  const cost = levelUpCost(inst.level);
  if ((state.inventory.materials.essence || 0) < cost.essence) return { ok: false, reason: 'no-essence' };
  if (state.currencies.gold < cost.gold) return { ok: false, reason: 'no-gold' };

  state.inventory.materials.essence -= cost.essence;
  state.currencies.gold -= cost.gold;
  inst.level += 1;

  saveGame();
  store.notify();
  return { ok: true, cost, stats: deriveStats(inst) };
}
