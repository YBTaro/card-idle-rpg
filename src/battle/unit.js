// 戰鬥單位：封裝 hp / atb / energy 與衍生數值。純資料 + 小方法，不碰渲染。
import { CLASSES } from '../data/classes.js';
import { rowOf, columnOf } from './positions.js';

export const ATB_MAX = 500; // Task 6 之後移除
export const ENERGY_MAX = 100;

let _uidSeq = 1;

export class Unit {
  constructor(stats, { team, pos }) {
    this.uid = _uidSeq++;
    this.name = stats.name;
    this.element = stats.element;
    this.class = stats.class;
    this.level = stats.level;
    this.team = team;
    this.pos = pos;
    this.row = rowOf(pos);

    this.maxHp = stats.hp;
    this.hp = stats.hp;
    this.atk = stats.atk;
    this.def = stats.def;
    this.spd = stats.spd; // Task 9 移除

    this.atb = 0; // Task 6 移除
    this.energy = 0;
  }

  get column() {
    return columnOf(this.pos);
  }

  get alive() {
    return this.hp > 0;
  }

  get isFront() {
    return this.row === 'front';
  }

  get classDef() {
    return CLASSES[this.class];
  }

  get energyRatio() {
    return Math.min(1, this.energy / ENERGY_MAX);
  }

  get hpRatio() {
    return Math.max(0, this.hp / this.maxHp);
  }

  gainEnergy(amount) {
    this.energy = Math.min(ENERGY_MAX, this.energy + amount);
  }

  // 套用傷害，回傳實際扣血量。
  takeDamage(amount) {
    const dealt = Math.min(this.hp, Math.max(0, Math.round(amount)));
    this.hp -= dealt;
    return dealt;
  }

  heal(amount) {
    const healed = Math.min(this.maxHp - this.hp, Math.max(0, Math.round(amount)));
    this.hp += healed;
    return healed;
  }
}

// 測試用：重置 uid 序號（讓快照穩定）
export function _resetUid(n = 1) {
  _uidSeq = n;
}
