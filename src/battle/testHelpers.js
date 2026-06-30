// 測試共用：快速建立 Unit。
import { Unit } from './unit.js';

let seq = 0;
export function makeUnit(opts = {}) {
  const stats = {
    name: opts.name || `U${seq++}`,
    element: opts.element || 'fire',
    class: opts.class || 'dps',
    level: opts.level || 1,
    hp: opts.hp ?? 1000,
    atk: opts.atk ?? 100,
    def: opts.def ?? 20,
    spd: opts.spd ?? 100,
  };
  return new Unit(stats, { team: opts.team ?? 0, row: opts.row || 'front', slot: opts.slot ?? 0 });
}
