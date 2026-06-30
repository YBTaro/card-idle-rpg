// 把存檔陣容轉成戰鬥單位，並產生敵方隊伍。橋接 state ↔ battle 引擎。
import { Unit } from '../battle/unit.js';
import { deriveStats } from '../core/stats.js';
import { store } from '../core/state.js';
import { CARD_LIST, CARDS } from '../data/cards.js';
import { Rng } from '../core/rng.js';

// 由玩家陣容（最多 5）建立 team 0 的單位。
export function buildPlayerUnits(state = store.state) {
  const units = [];
  let slot = 0;
  for (const entry of state.formation) {
    const inst = state.cards.find((c) => c.instanceId === entry.instanceId);
    if (!inst) continue;
    const stats = deriveStats(inst);
    units.push(new Unit(stats, { team: 0, row: entry.row, slot: slot++ }));
  }
  return units;
}

// 依關卡產生敵方隊伍（team 1）。等級隨關卡成長（佔位）。
export function buildEnemyUnits(stage = 1, rng = new Rng()) {
  // 等級隨關卡平緩成長（stage 1 ≈ 與初始隊伍同級，便於上手）。
  const level = Math.max(1, stage);
  // 難度係數：前期偏弱（玩家好上手），隨關卡逐步提升、後期需靠養成。
  const scale = 0.8 + (stage - 1) * 0.06;
  const count = 5;
  const units = [];
  // 確保至少有前排坦克擋著
  const picks = [];
  const tanks = CARD_LIST.filter((c) => c.class === 'tank');
  picks.push(rng.pick(tanks));
  for (let i = 1; i < count; i++) picks.push(rng.pick(CARD_LIST));

  let slot = 0;
  for (const card of picks) {
    const stats = deriveStats({ cardId: card.id, level });
    stats.hp = Math.round(stats.hp * scale);
    stats.atk = Math.round(stats.atk * scale);
    stats.def = Math.round(stats.def * scale);
    const row = card.class === 'support' ? 'back' : rng.next() < 0.6 ? 'front' : 'back';
    units.push(new Unit(stats, { team: 1, row, slot: slot++ }));
  }
  return units;
}

export { CARDS };
