// 戰鬥引擎（純邏輯）：ATB 速度條 + 能量條自動大招 + 勝負判定。
// 對外只透過事件溝通，完全不 import pixi/gsap/DOM，可獨立單元測試。
import { EventEmitter } from '../core/events.js';
import { Rng } from '../core/rng.js';
import { ATB_MAX, ENERGY_MAX } from './unit.js';
import { normalAttack, ultimateFor } from './skills.js';

export class BattleEngine {
  // teamA / teamB 為 Unit 陣列（team 屬性需分別為 0 / 1）。
  constructor(teamA, teamB, { rng } = {}) {
    this.teams = [teamA, teamB];
    this.units = [...teamA, ...teamB];
    this.rng = rng || new Rng();
    this.emitter = new EventEmitter();
    this.over = false;
    this.winner = null; // 0 / 1 / -1(平手)
    this.elapsed = 0;
  }

  on(event, fn) {
    return this.emitter.on(event, fn);
  }

  emit(event, payload) {
    this.emitter.emit(event, payload);
  }

  enemiesOf(unit) {
    return this.teams[unit.team ^ 1];
  }

  alliesOf(unit) {
    return this.teams[unit.team];
  }

  teamAlive(team) {
    return this.teams[team].some((u) => u.alive);
  }

  // 推進模擬 dt 秒。渲染端用「真實 dt × 戰鬥速度」呼叫。
  update(dt) {
    if (this.over || dt <= 0) return;
    this.elapsed += dt;

    this._tickBuffs(dt);

    // 1) 累積 ATB
    for (const u of this.units) {
      if (u.alive) u.atb += u.spd * dt;
    }

    // 2) 處理已就緒單位（atb 較滿者先動，確保確定性順序）
    const ready = this.units.filter((u) => u.alive && u.atb >= ATB_MAX).sort((a, b) => b.atb - a.atb);

    for (const u of ready) {
      if (this.over) break;
      if (!u.alive || u.atb < ATB_MAX) continue;
      u.atb -= ATB_MAX;
      this._act(u);
      this._checkEnd();
    }
  }

  _act(u) {
    const ctx = {
      allies: this.alliesOf(u),
      enemies: this.enemiesOf(u),
      rng: this.rng,
      emit: (event, payload) => this.emit(event, payload),
    };
    this.emit('turn', { unit: u });

    if (u.energy >= ENERGY_MAX) {
      u.energy = 0; // 放大招清空能量
      ultimateFor(u)(u, ctx);
    } else {
      normalAttack(u, ctx);
    }
  }

  _tickBuffs(dt) {
    for (const u of this.units) {
      if (!u.buffs || u.buffs.length === 0) continue;
      for (const b of u.buffs) b.time -= dt;
      const before = u.buffs.length;
      u.buffs = u.buffs.filter((b) => b.time > 0);
      if (u.buffs.length !== before) this.emit('buffchange', { unit: u });
    }
  }

  _checkEnd() {
    if (this.over) return;
    const aAlive = this.teamAlive(0);
    const bAlive = this.teamAlive(1);
    if (!aAlive || !bAlive) {
      this.over = true;
      this.winner = aAlive ? 0 : bAlive ? 1 : -1;
      this.emit('battleEnd', { winner: this.winner });
    }
  }
}

export { ATB_MAX, ENERGY_MAX };
