// 陣容管理：最多 5 人，每人指定前 / 後排，同卡不可重複上陣。
import { store } from '../core/state.js';
import { saveGame } from '../core/save.js';

export const MAX_FORMATION = 5;

export function isInFormation(instanceId, state = store.state) {
  return state.formation.some((e) => e.instanceId === instanceId);
}

export function formationSlot(instanceId, state = store.state) {
  return state.formation.find((e) => e.instanceId === instanceId) || null;
}

// 加入陣容（預設 row 由呼叫端決定）。回傳 { ok, reason? }
export function addToFormation(instanceId, row = 'front', state = store.state) {
  if (isInFormation(instanceId, state)) return { ok: false, reason: 'already' };
  if (state.formation.length >= MAX_FORMATION) return { ok: false, reason: 'full' };
  if (!state.cards.some((c) => c.instanceId === instanceId)) return { ok: false, reason: 'not-owned' };
  state.formation.push({ instanceId, row });
  persist();
  return { ok: true };
}

export function removeFromFormation(instanceId, state = store.state) {
  const before = state.formation.length;
  state.formation = state.formation.filter((e) => e.instanceId !== instanceId);
  if (state.formation.length !== before) persist();
  return { ok: state.formation.length !== before };
}

// 點一下切換上陣/下陣。
export function toggleFormation(instanceId, row = 'front', state = store.state) {
  return isInFormation(instanceId, state)
    ? removeFromFormation(instanceId, state)
    : addToFormation(instanceId, row, state);
}

// 切換前 / 後排。
export function toggleRow(instanceId, state = store.state) {
  const slot = formationSlot(instanceId, state);
  if (!slot) return { ok: false, reason: 'not-in' };
  slot.row = slot.row === 'front' ? 'back' : 'front';
  persist();
  return { ok: true, row: slot.row };
}

export function canStartBattle(state = store.state) {
  return state.formation.length > 0;
}

function persist() {
  saveGame();
  store.notify();
}
