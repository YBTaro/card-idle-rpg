// 戰鬥單位：封裝 hp / atb / energy 與衍生數值。純資料 + 小方法，不碰渲染。
import { CLASSES } from '../data/classes.js';

export const ATB_MAX = 500; // ATB 速度條滿值（越低 → 行動越頻繁、戰鬥越快）
export const ENERGY_MAX = 100; // 能量條滿值（觸發大招）

let _uidSeq = 1;

export class Unit {
  // stats 來自 core/stats.js 的 deriveStats；team: 0 或 1；row: 'front'|'back'
  constructor(stats, { team, row, slot }) {
    this.uid = _uidSeq++;
    this.name = stats.name;
    this.element = stats.element;
    this.class = stats.class;
    this.level = stats.level;
    this.team = team;
    this.row = row;
    this.slot = slot;

    this.maxHp = stats.hp;
    this.hp = stats.hp;
    this.atk = stats.atk;
    this.def = stats.def;
    this.spd = stats.spd;

    this.atb = 0;
    this.energy = 0;
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

  // ATB 進度 0..1（渲染用）
  get atbRatio() {
    return Math.min(1, this.atb / ATB_MAX);
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
