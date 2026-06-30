// 選敵邏輯。普攻前排優先：先打存活前排，前排全滅才打後排。

function aliveInRow(units, row) {
  return units.filter((u) => u.alive && u.row === row);
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
