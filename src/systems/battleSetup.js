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
  // 主線成長節奏：敵人等級每 2 關 +1；滿編 6 人（1 坦 + 5 隨機不重複）。
  // 等級＝唯一難度軸，不再打 0.85 折扣——「敵人等級比你高」就要真的比你強；
  // 玩家優勢來自升星（重複抽）、隊伍技羈絆與陣容針對性，而不是敵人天生殘血。
  // 敵人星級隨等級緩升（每 12 級 +1★，封頂 4★）：後期章節跟上玩家的升星曲線。
  const level = 1 + Math.floor((stage - 1) / 2);
  const stars = Math.min(4, Math.floor(level / 12));
  const tanks = CARD_LIST.filter((c) => c.class === 'tank');
  const picks = [rng.pick(tanks)];
  const used = new Set([picks[0].id]);
  while (picks.length < 6) {
    const c = rng.pick(CARD_LIST);
    if (used.has(c.id)) continue;
    used.add(c.id);
    picks.push(c);
  }

  const front = [1, 2, 3];
  const back = [4, 5, 6];
  const units = [];
  for (const card of picks) {
    const stats = deriveStats({ cardId: card.id, level, stars });
    // 輔助與遠程排後衛（與玩家/機器人同一套站位邏輯）
    const wantBack = card.class === 'support' || card.attackStyle === 'ranged';
    const pos = wantBack ? (back.shift() ?? front.shift()) : (front.shift() ?? back.shift());
    if (pos == null) continue;
    units.push(new Unit(stats, { team: 1, pos }));
  }
  return units;
}

export { CARDS };
