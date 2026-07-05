// 戰鬥單位：封裝 hp / energy 與衍生數值。純資料 + 小方法，不碰渲染。
import { CLASSES } from '../data/classes.js';
import { rowOf, columnOf } from './positions.js';
import { CRIT_CHANCE, CRIT_MULT } from './damage.js';
import { resolve, absorbWithShields, hasControl } from './buffs.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));

export const ENERGY_MAX = 100; // 施放門檻：集滿即放
export const ENERGY_CAP = 200; // 能量池上限：溢出（>100）轉為技能直傷「超充」倍率 energy/100

let _uidSeq = 1;

export class Unit {
  constructor(stats, { team, pos }) {
    this.uid = _uidSeq++;
    this.name = stats.name;
    this.cardId = stats.cardId;
    this._baseElement = stats.element; // 屬性可被「轉化」狀態暫時覆蓋（見 element getter）
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
    this.bossTag = stats.bossTag ?? false; // Boss 保護：%最大生命效果改按攻擊力結算
    this.bossKit = stats.bossKit ?? null; // Boss 機制（階段/破盾/狂暴）
    this.basicAttack = stats.basicAttack ?? null; // 普攻變體
    this.skillLv = stats.skillLv ?? 1; // 技能等級
    this.triggers = stats.triggers || []; // 觸發（亡語/受擊/血線…；引擎事件派發）
    this.onEnter = stats.onEnter ?? null; // 進場被動（開天氣/場地；引擎開場照行動序結算）

    this.energy = 0;
  }

  get column() {
    return columnOf(this.pos);
  }

  get alive() {
    return this.hp > 0;
  }

  // 屬性：轉化狀態（kind:'element'）存在時暫時覆蓋，到期自動還原。
  // 影響所有讀 element 的結算：剋制、天氣光環、where 過濾、侵蝕豁免。
  get element() {
    const override = this.buffs?.find((b) => b.kind === 'element');
    return override?.element ?? this._baseElement;
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
  get dodge() { return clamp01(resolve(this, 'dodge', 0)); } // 迴避率：基礎 0，只能靠技能/被動
  get accuracy() { return resolve(this, 'accuracy', 0); } // 命中率加成：抵銷目標迴避
  get critRes() { return clamp01(resolve(this, 'critRes', 0)); } // 抗暴率：直接扣攻方暴擊率（治療暴擊不受影響）
  elementRes(element) { return resolve(this, `res_${element}`, 1); } // 元素抗性：對特定屬性的承傷率（預設 1）

  gainEnergy(amount) {
    if (hasControl(this, 'freeze')) return; // 凍結：無法回能（扣能量不受影響）
    const gained = Math.round(amount * this.energyGainMult);
    this.energy = Math.max(0, Math.min(ENERGY_CAP, this.energy + gained)); // 溢出保留到 200＝超充
  }

  // 套用傷害，回傳實際扣血量。
  // 免死標記（cheatDeath）：致死傷害改留 1 血、消耗標記；_cheated 旗標由 deal* 出口讀取發演出事件。
  takeDamage(amount) {
    const incoming = Math.max(0, Math.round(amount));
    const toHp = absorbWithShields(this, incoming);
    this._absorbed = incoming - toHp; // 護盾吃掉的量（統計歸攻擊者輸出；dealDamage 讀後即清）
    let dealt = Math.min(this.hp, toHp);
    if (dealt >= this.hp && this.hp > 0) {
      const cd = this.buffs?.find((b) => b.kind === 'cheatDeath');
      if (cd) {
        this.buffs = this.buffs.filter((b) => b !== cd);
        dealt = this.hp - 1;
        this._cheated = true;
      }
    }
    this.hp -= dealt;
    return dealt;
  }

  // 受治療倍率（healTaken）唯一入口：治療增幅（神）/ 重傷（不死）都在這裡生效。
  // 復活直接設 hp 不經此路徑（設計上復活不是治療）。
  heal(amount) {
    const scaled = Math.round(Math.max(0, amount) * resolve(this, 'healTaken', 1));
    const healed = Math.min(this.maxHp - this.hp, scaled);
    this.hp += healed;
    return healed;
  }
}

// 測試用：重置 uid 序號（讓快照穩定）
export function _resetUid(n = 1) {
  _uidSeq = n;
}
