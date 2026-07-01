// 陣容管理：最多 6 位置（前排 1-3，後排 4-6），同卡不可重複上陣。
import { store } from '../core/state.js';
import { saveGame } from '../core/save.js';

export const MAX_FORMATION = 6;
const POSITIONS = [1, 2, 3, 4, 5, 6];

export function isInFormation(instanceId, state = store.state) {
  return state.formation.some((e) => e.instanceId === instanceId);
}
export function formationSlot(instanceId, state = store.state) {
  return state.formation.find((e) => e.instanceId === instanceId) || null;
}
export function positionTaken(pos, state = store.state) {
  return state.formation.some((e) => e.pos === pos);
}
export function firstFreePosition(state = store.state) {
  return POSITIONS.find((p) => !positionTaken(p, state)) ?? null;
}

export function addToFormation(instanceId, pos = null, state = store.state) {
  if (isInFormation(instanceId, state)) return { ok: false, reason: 'already' };
  if (state.formation.length >= MAX_FORMATION) return { ok: false, reason: 'full' };
  if (!state.cards.some((c) => c.instanceId === instanceId)) return { ok: false, reason: 'not-owned' };
  const p = pos ?? firstFreePosition(state);
  if (p == null) return { ok: false, reason: 'full' };
  if (positionTaken(p, state)) return { ok: false, reason: 'pos-taken' };
  state.formation.push({ instanceId, pos: p });
  persist();
  return { ok: true, pos: p };
}

export function removeFromFormation(instanceId, state = store.state) {
  const before = state.formation.length;
  state.formation = state.formation.filter((e) => e.instanceId !== instanceId);
  if (state.formation.length !== before) persist();
  return { ok: state.formation.length !== before };
}

export function toggleFormation(instanceId, pos = null, state = store.state) {
  return isInFormation(instanceId, state)
    ? removeFromFormation(instanceId, state)
    : addToFormation(instanceId, pos, state);
}

// 移動到指定位置；若該位置已有人則兩者互換。
export function setPosition(instanceId, pos, state = store.state) {
  const slot = formationSlot(instanceId, state);
  if (!slot) return { ok: false, reason: 'not-in' };
  const occupant = state.formation.find((e) => e.pos === pos && e.instanceId !== instanceId);
  if (occupant) occupant.pos = slot.pos;
  slot.pos = pos;
  persist();
  return { ok: true, pos };
}

export function canStartBattle(state = store.state) {
  return state.formation.length > 0;
}

function persist() {
  saveGame();
  store.notify();
}
