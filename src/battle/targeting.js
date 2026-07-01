// 選敵邏輯。普攻前排優先：先打存活前排，前排全滅才打後排。
import { columnOf, rowOf } from './positions.js';

function aliveInRow(units, row) {
  return units.filter((u) => u.alive && u.row === row);
}

// 直行偏好序：本行 → 往小號 → 往大號（值為前排位置號，後排 +3）
const COLUMN_PREF = {
  1: [1, 2, 3], // 直行A
  2: [2, 1, 3], // 直行B
  3: [3, 2, 1], // 直行C
};

function aliveInRowT(enemies, row) {
  return enemies.filter((u) => u.alive && rowOf(u.pos) === row);
}

// 普攻預設選擇器：直行對位、前排優先、缺位往小號靠、前排全空才打後排。
export function singleEnemyByColumn(attacker, enemies) {
  const col = columnOf(attacker.pos);
  for (const row of ['front', 'back']) {
    const pool = aliveInRowT(enemies, row);
    if (pool.length === 0) continue; // 該排全空 → 換下一排
    const offset = row === 'front' ? 0 : 3;
    for (const c of COLUMN_PREF[col]) {
      const hit = pool.find((u) => u.pos === c + offset);
      if (hit) return hit;
    }
    return pool[0]; // 保險（理論上不會走到）
  }
  return null;
}

// 從 enemies 中選一個普攻目標（前排優先）。回傳 Unit 或 null。
// rng 用於同排多目標時隨機挑一個（傳入確保可重播/可測）。
export function pickMeleeTarget(enemies, rng) {
  let pool = aliveInRow(enemies, 'front');
  if (pool.length === 0) pool = aliveInRow(enemies, 'back');
  if (pool.length === 0) return null;
  return rng ? rng.pick(pool) : pool[0];
}

// 所有存活敵人（大招 AoE 用）
export function aliveEnemies(enemies) {
  return enemies.filter((u) => u.alive);
}

// 我方血量最低的存活單位（治療用）。
export function lowestHpAlly(allies) {
  const alive = allies.filter((u) => u.alive);
  if (alive.length === 0) return null;
  return alive.reduce((best, u) => (u.hpRatio < best.hpRatio ? u : best));
}
