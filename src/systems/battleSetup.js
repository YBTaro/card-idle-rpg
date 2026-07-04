// 把存檔陣容轉成戰鬥單位，並產生敵方隊伍。橋接 state ↔ battle 引擎。
import { Unit } from '../battle/unit.js';
import { deriveStats } from '../core/stats.js';
import { store } from '../core/state.js';
import { CARD_LIST, CARDS } from '../data/cards.js';
import { Rng } from '../core/rng.js';

export function buildPlayerUnits(state = store.state) {
  const units = [];
  const front = [1, 2, 3];
  const back = [4, 5, 6];
  for (const entry of state.formation) {
    const inst = state.cards.find((c) => c.instanceId === entry.instanceId);
    if (!inst) continue;
    const stats = deriveStats(inst);
    const pos =
      entry.pos ?? (entry.row === 'back' ? back.shift() : front.shift());
    if (pos == null) continue; // 超過 6 格
    units.push(new Unit(stats, { team: 0, pos }));
  }
  return units;
}

export function buildEnemyUnits(stage = 1, rng = new Rng()) {
  // 主線成長節奏：敵人等級每 3 關 +1（不再每關升等）；關內難度改由小倍率平滑爬升
  const level = 1 + Math.floor((stage - 1) / 2);
  const scale = 0.85;
  const tanks = CARD_LIST.filter((c) => c.class === 'tank');
  const picks = [rng.pick(tanks)];
  for (let i = 1; i < 5; i++) picks.push(rng.pick(CARD_LIST));

  const front = [1, 2, 3];
  const back = [4, 5, 6];
  const units = [];
  for (const card of picks) {
    const stats = deriveStats({ cardId: card.id, level });
    stats.hp = Math.round(stats.hp * scale);
    stats.atk = Math.round(stats.atk * scale);
    stats.def = Math.round(stats.def * scale);
    const wantBack = card.class === 'support';
    const pos = wantBack ? (back.shift() ?? front.shift()) : (front.shift() ?? back.shift());
    if (pos == null) continue;
    units.push(new Unit(stats, { team: 1, pos }));
  }
  return units;
}

export { CARDS };
