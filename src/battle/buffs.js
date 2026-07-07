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

// 持續回復（HoT）：行動前結算的治療 buff。
export function hotEntries(unit) {
  return unit.buffs ? unit.buffs.filter((b) => b.kind === 'hot') : [];
}

// 驅散/淨化：移除最多 count 個（非光環、非 sticky）buff。negative=true 淨化減益、false 驅散增益。
// 回傳實際移除數。
export function dispelBuffs(unit, { negative = true, count = Infinity } = {}) {
  if (!unit.buffs) return 0;
  let removed = 0;
  unit.buffs = unit.buffs.filter((b) => {
    if (b.aura || b.sticky || removed >= count) return true;
    if (isNegative(b) === negative) {
      removed += 1;
      return false;
    }
    return true;
  });
  return removed;
}

export function hasControl(unit, name) {
  return !!unit.buffs && unit.buffs.some((b) => b.kind === 'control' && b.control === name);
}

export function clearAuras(unit) {
  if (unit.buffs) unit.buffs = unit.buffs.filter((b) => !b.aura);
}

// 把單位當前 buff 狀態摘要成可序列化列表（供戰鬥 log / 前端小圖示）。
// 排除光環（被動每步重算，屬常駐屬性非狀態）；neg = 對持有者不利。
export function summarizeBuffs(unit) {
  return (unit.buffs || [])
    .filter((b) => !b.aura)
    .map((b) => ({
      kind: b.kind,
      stat: b.stat,
      control: b.control,
      element: b.element,
      neg: isNegative(b),
      // 屬性實際升降方向（提升/降低用；與 neg「好壞」不同——如 dotTaken 上升是壞事但方向仍是「提升」）
      up: b.kind === 'stat' ? (b.op === 'mul' ? b.value > 1 : b.value > 0) : null,
      turns: b.duration ?? null, // 剩餘回合（無期限＝null，前端不顯示數字）
      charges: b.charges ?? null, // 格擋層數（debuffBlock 的角標數字）
    }));
}

export function isNegative(b) {
  if (b.kind === 'dot') return true;
  if (b.kind === 'element') return true; // 被轉化屬性＝減益（可被淨化解除）
  if (b.kind === 'nightmare') return true; // 惡夢印記：永久但可被淨化
  if (b.kind === 'mark') return true; // 連動印記：可被淨化
  if (b.kind === 'energyLink') return true; // 吸能印：敵對減益，可被淨化
  if (b.kind === 'shield') return false;
  if (b.kind === 'control') return b.control !== 'taunt'; // 嘲諷是自己開的戰術狀態
  if (b.kind === 'stat') {
    const lowerIsGood = b.stat === 'dmgTaken' || b.stat === 'dotTaken'; // 承傷/受 DoT 越低越好
    const up = b.op === 'mul' ? b.value > 1 : b.value > 0;
    return lowerIsGood ? up : !up;
  }
  return false;
}
