// 選敵邏輯。直行對位優先：本行 → 往小號 → 往大號。
import { columnOf, rowOf } from './positions.js';

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

// 目標選擇器 registry
const COLUMN_FALLBACK = { 1: [1, 2, 3], 2: [2, 1, 3], 3: [3, 2, 1] };

function aliveIn(list) {
  return list.filter((u) => u.alive);
}

function enemiesInColumn(attacker, enemies) {
  const alive = aliveIn(enemies);
  for (const col of COLUMN_FALLBACK[columnOf(attacker.pos)]) {
    const inCol = alive.filter((u) => columnOf(u.pos) === col);
    if (inCol.length) return inCol;
  }
  return [];
}

export const SELECTORS = {
  self: (caster) => [caster],
  singleEnemyByColumn: (caster, ctx) => {
    const t = singleEnemyByColumn(caster, ctx.enemies);
    return t ? [t] : [];
  },
  enemyFrontRow: (caster, ctx) => {
    const front = ctx.enemies.filter((u) => u.alive && rowOf(u.pos) === 'front');
    return front.length ? front : ctx.enemies.filter((u) => u.alive && rowOf(u.pos) === 'back');
  },
  enemyBackRow: (caster, ctx) => {
    const back = ctx.enemies.filter((u) => u.alive && rowOf(u.pos) === 'back');
    return back.length ? back : ctx.enemies.filter((u) => u.alive && rowOf(u.pos) === 'front');
  },
  enemyColumn: (caster, ctx) => enemiesInColumn(caster, ctx.enemies),
  allEnemies: (caster, ctx) => aliveIn(ctx.enemies),
  allAllies: (caster, ctx) => aliveIn(ctx.allies),
  lowestHpAlly: (caster, ctx) => {
    const t = lowestHpAlly(ctx.allies);
    return t ? [t] : [];
  },
  oneAlly: (caster, ctx) => {
    const a = aliveIn(ctx.allies);
    if (!a.length) return [];
    return [ctx.rng ? ctx.rng.pick(a) : a[0]];
  },
};
