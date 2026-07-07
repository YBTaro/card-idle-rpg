// 測試共用：快速建立 Unit。
import { Unit } from './unit.js';

let seq = 0;
export function makeUnit(opts = {}) {
  const stats = {
    name: opts.name || `U${seq++}`,
    cardId: opts.cardId,
    element: opts.element || 'fire',
    class: opts.class || 'dps',
    level: opts.level || 1,
    hp: opts.hp ?? 1000,
    atk: opts.atk ?? 100,
    def: opts.def ?? 20,
    race: opts.race ?? '人',
    series: opts.series ?? [],
    passives: opts.passives ?? [],
    triggers: opts.triggers ?? [],
    basicAttack: opts.basicAttack ?? null,
    skillLv: opts.skillLv ?? 1,
    bossTag: opts.bossTag ?? false,
    bossKit: opts.bossKit ?? null,
    guardKit: opts.guardKit ?? null,
    onEnter: opts.onEnter ?? null,
  };
  const u = new Unit(stats, { team: opts.team ?? 0, pos: opts.pos ?? 1 });
  if (opts.energy != null) u.energy = opts.energy;
  return u;
}
