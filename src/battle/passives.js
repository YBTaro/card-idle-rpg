// 被動/光環：每 step 重算。清掉 aura 光環 buff，再依存活單位的 passives 重建。
import { applyBuff, clearAuras } from './buffs.js';
import { matchesWhere } from './effects.js';

// dead:true → 數陣亡者（不死「亡者之勢」：人越死越強）；預設數存活者。
function countMatching(list, where, { dead = false } = {}) {
  return list.filter((u) => (dead ? !u.alive : u.alive) && matchesWhere(u, where)).length;
}

function conditionHolds(when, owner, teams) {
  if (!when) return true;
  if (when.selfHpBelow != null && !(owner.hpRatio < when.selfHpBelow)) return false;
  if (when.alliesAtLeast) {
    const c = countMatching(teams[owner.team], when.alliesAtLeast.where);
    if (c < when.alliesAtLeast.count) return false;
  }
  return true;
}

function passiveScope(target, owner, teams) {
  const allies = teams[owner.team];
  const enemies = teams[owner.team ^ 1];
  switch (target) {
    case 'self': return owner.alive ? [owner] : [];
    case 'allAllies': return allies.filter((u) => u.alive);
    case 'allEnemies': return enemies.filter((u) => u.alive);
    default: return [];
  }
}

function auraValue(effect, owner, teams) {
  if (effect.perCountOf) {
    const list = effect.perCountOf.side === 'enemies' ? teams[owner.team ^ 1] : teams[owner.team];
    const count = countMatching(list, effect.perCountOf.where, { dead: effect.perCountOf.dead });
    if (effect.op === 'mul') return 1 + (effect.basePct || 0) * count;
    return (effect.valuePer || 0) * count;
  }
  return effect.value;
}

// 環境光環：把天氣/場地的全場效果當「無主光環」套到雙方符合條件的存活單位。
// 在 recomputePassives 之後呼叫（同為 aura:true，每步重算時一起被清）。
export function applyEnvAuras(teams, auraSpecs) {
  if (!auraSpecs?.length) return;
  const all = [...teams[0], ...teams[1]];
  for (const u of all) {
    if (!u.alive) continue;
    for (const spec of auraSpecs) {
      if (spec.where && !matchesWhere(u, spec.where)) continue;
      for (const e of spec.effects) {
        applyBuff(u, { kind: 'stat', stat: e.stat, op: e.op, value: e.value, duration: null, aura: true });
      }
    }
  }
}

export function recomputePassives(teams) {
  const all = [...teams[0], ...teams[1]];
  for (const u of all) clearAuras(u);
  for (const owner of all) {
    if (!owner.alive || !owner.passives || owner.passives.length === 0) continue;
    for (const p of owner.passives) {
      if (!conditionHolds(p.when, owner, teams)) continue;
      if (!p.effects || p.effects.length === 0) continue;
      let targets = passiveScope(p.target, owner, teams);
      // targetWhere：光環只作用於符合條件的對象（種族/屬性/系列主題光環）
      if (p.targetWhere) targets = targets.filter((t) => matchesWhere(t, p.targetWhere));
      for (const t of targets) {
        for (const e of p.effects) {
          applyBuff(t, { kind: 'stat', stat: e.stat, op: e.op, value: auraValue(e, owner, teams), duration: null, aura: true });
        }
      }
    }
  }
}
