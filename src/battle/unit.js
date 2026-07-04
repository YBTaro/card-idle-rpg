// 戰鬥單位：封裝 hp / energy 與衍生數值。純資料 + 小方法，不碰渲染。
import { CLASSES } from '../data/classes.js';
import { rowOf, columnOf } from './positions.js';
import { CRIT_CHANCE, CRIT_MULT } from './damage.js';
import { resolve, absorbWithShields, hasControl } from './buffs.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));

export const ENERGY_MAX = 100;

let _uidSeq = 1;

export class Unit {
  constructor(stats, { team, pos }) {
    this.uid = _uidSeq++;
    this.name = stats.name;
    this.cardId = stats.cardId;
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
    this.race = stats.race ?? '人';
    this.series = Array.isArray(stats.series) ? [...stats.series] : [];
    this.passives = stats.passives || [];
    this.onEnter = stats.onEnter ?? null; // 進場被動（開天氣/場地；引擎開場照行動序結算）

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

  get effAtk() { return Math.round(resolve(this, 'atk', this.atk)); }
  get effDef() { return Math.round(resolve(this, 'def', this.def)); }
  get critChance() { return clamp01(resolve(this, 'critChance', CRIT_CHANCE)); }
  get critMult() { return resolve(this, 'critMult', CRIT_MULT); }
  get dmgTakenMult() { return resolve(this, 'dmgTaken', 1); }
  get dmgDealtMult() { return resolve(this, 'dmgDealt', 1); }
  get energyGainMult() { return resolve(this, 'energyGain', 1); }

  gainEnergy(amount) {
    if (hasControl(this, 'freeze')) return; // 凍結：無法回能（扣能量不受影響）
    const gained = Math.round(amount * this.energyGainMult);
    this.energy = Math.max(0, Math.min(ENERGY_MAX, this.energy + gained));
  }

  // 套用傷害，回傳實際扣血量。
  takeDamage(amount) {
    const incoming = Math.max(0, Math.round(amount));
    const toHp = absorbWithShields(this, incoming);
    const dealt = Math.min(this.hp, toHp);
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
