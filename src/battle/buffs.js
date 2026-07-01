// 通用 Buff 容器與有效值 resolver。純資料操作，不 import 引擎/渲染。

export function applyBuff(unit, spec) {
  if (!unit.buffs) unit.buffs = [];
  if (spec.key && !spec.stackable) {
    unit.buffs = unit.buffs.filter((b) => b.key !== spec.key);
  }
  unit.buffs.push(spec);
}

// 帶者行動後：所有 buff.duration -1，移除到期。回傳是否有移除。
export function tickBuffs(unit) {
  if (!unit.buffs || unit.buffs.length === 0) return false;
  for (const b of unit.buffs) if (b.duration != null) b.duration -= 1;
  const before = unit.buffs.length;
  unit.buffs = unit.buffs.filter((b) => b.duration == null || b.duration > 0);
  return unit.buffs.length !== before;
}

// base × Π(mul) + Σ(add)，範圍為 kind:'stat' 且 stat 相符者。
export function resolve(unit, stat, base) {
  let mul = 1;
  let add = 0;
  if (unit.buffs) {
    for (const b of unit.buffs) {
      if (b.kind !== 'stat' || b.stat !== stat) continue;
      if (b.op === 'mul') mul *= b.value;
      else if (b.op === 'add') add += b.value;
    }
  }
  return base * mul + add;
}

// 先扣護盾池，回傳仍需作用到 hp 的傷害量。
export function absorbWithShields(unit, amount) {
  let remaining = amount;
  if (unit.buffs) {
    for (const b of unit.buffs) {
      if (b.kind !== 'shield' || remaining <= 0) continue;
      const absorbed = Math.min(b.amount, remaining);
      b.amount -= absorbed;
      remaining -= absorbed;
    }
    unit.buffs = unit.buffs.filter((b) => b.kind !== 'shield' || b.amount > 0);
  }
  return remaining;
}

export function dotEntries(unit) {
  return unit.buffs ? unit.buffs.filter((b) => b.kind === 'dot') : [];
}

export function hasControl(unit, name) {
  return !!unit.buffs && unit.buffs.some((b) => b.kind === 'control' && b.control === name);
}
