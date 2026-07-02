// src/battle/engine.js
// 回合制戰鬥引擎（純邏輯）：固定位置出手序列 + 普攻輪↔技能階段。
import { EventEmitter } from '../core/events.js';
import { Rng } from '../core/rng.js';
import { ENERGY_MAX } from './unit.js';
import { TURN_SEQUENCE } from './positions.js';
import { normalAttack, castSkill, skillFor } from './skills.js';
import { tickBuffs, dotEntries, hasControl, summarizeBuffs } from './buffs.js';
import { dealDot } from './effects.js';
import { recomputePassives } from './passives.js';

export const MAX_ROUNDS = 100; // 回合上限，防打不完
export const MAX_SKILL_PASSES = 50; // 技能階段掃描上限，防死迴圈

export class BattleEngine {
  constructor(teamA, teamB, { rng } = {}) {
    this.teams = [teamA, teamB];
    this.units = [...teamA, ...teamB];
    this.rng = rng || new Rng();
    this.emitter = new EventEmitter();
    this.over = false;
    this.winner = null;
    this.round = 0;

    this.phase = 'normal';
    this.cursor = 0; // 目前序列索引
    this.resumeIndex = 0; // 技能階段結束後普攻接續處
    this._lastActedIdx = -1; // 偵測繞回換算回合
    this._skillPasses = 0;
    this._skillCastThisPass = false;
  }

  on(event, fn) { return this.emitter.on(event, fn); }
  emit(event, payload) { this.emitter.emit(event, payload); }
  enemiesOf(unit) { return this.teams[unit.team ^ 1]; }
  alliesOf(unit) { return this.teams[unit.team]; }
  teamAlive(team) { return this.teams[team].some((u) => u.alive); }

  _unitAt(team, pos) {
    return this.teams[team].find((u) => u.alive && u.pos === pos) || null;
  }

  _canCast(u) {
    return u.alive && u.energy >= ENERGY_MAX && !hasControl(u, 'silence') && !hasControl(u, 'stun');
  }

  _anyoneCharged() {
    return this.units.some((u) => this._canCast(u));
  }

  _advanceToActor(startIdx) {
    for (let k = 0; k < TURN_SEQUENCE.length; k++) {
      const idx = (startIdx + k) % TURN_SEQUENCE.length;
      const [team, pos] = TURN_SEQUENCE[idx];
      const u = this._unitAt(team, pos);
      if (u) return { unit: u, idx };
    }
    return null;
  }

  // 推進一個動作。回傳動作紀錄或 null（戰鬥已結束）。
  step() {
    if (this.over) return null;
    recomputePassives(this.teams);
    return this.phase === 'normal' ? this._stepNormal() : this._stepSkill();
  }

  _stepNormal() {
    const found = this._advanceToActor(this.cursor);
    if (!found) { this._endByHp(); return null; }
    const { unit, idx } = found;

    if (idx <= this._lastActedIdx) {
      this.round += 1;
      this.emit('round', { round: this.round });
      if (this.round >= MAX_ROUNDS) { this._endByHp(); return { type: 'timeout', unit }; }
    }
    this._lastActedIdx = idx;

    this._act(unit, false);
    this._checkEnd();
    if (this.over) return { type: 'attack', unit };

    this.cursor = (idx + 1) % TURN_SEQUENCE.length;
    if (this._anyoneCharged()) {
      this.resumeIndex = this.cursor;
      this.phase = 'skill';
      this.cursor = 0;
      this._skillPasses = 0;
      this._skillCastThisPass = false;
    }
    return { type: 'attack', unit };
  }

  _stepSkill() {
    while (this.cursor < TURN_SEQUENCE.length) {
      const [team, pos] = TURN_SEQUENCE[this.cursor];
      this.cursor += 1;
      const u = this._unitAt(team, pos);
      if (u && this._canCast(u)) {
        this._act(u, true);
        this._checkEnd();
        this._skillCastThisPass = true;
        return { type: 'ultimate', unit: u };
      }
    }
    // 一趟掃完
    this._skillPasses += 1;
    if (this._skillCastThisPass && this._skillPasses < MAX_SKILL_PASSES) {
      this._skillCastThisPass = false;
      this.cursor = 0;
      return this._stepSkill(); // 同一 step 內接著找下一個要放的人
    }
    // 零施放或超過上限 → 回普攻、從中斷處接續
    this.phase = 'normal';
    this.cursor = this.resumeIndex;
    return { type: 'skillPhaseEnd' };
  }

  _act(u, isSkill) {
    const ctx = {
      allies: this.alliesOf(u),
      enemies: this.enemiesOf(u),
      rng: this.rng,
      emit: (event, payload) => this.emit(event, payload),
    };
    if (isSkill) {
      // 技能不算回合：免費行動，不結算 DoT、不遞減 buff duration
      this.emit('turn', { unit: u });
      u.energy = 0;
      this.emit('energy', { unit: u, value: 0 });
      castSkill(u, skillFor(u), ctx);
      return;
    }
    // 普攻才算回合：出手前結算 DoT（可致死 → 跳過行動），行動後遞減 buff
    for (const dot of dotEntries(u)) dealDot(u, dot, ctx);
    if (!u.alive) return;
    this.emit('turn', { unit: u });
    if (hasControl(u, 'stun')) {
      this.emit('stunned', { unit: u });
    } else {
      normalAttack(u, ctx);
    }
    if (tickBuffs(u)) this.emit('buffchange', { unit: u, buffs: summarizeBuffs(u) });
  }

  _checkEnd() {
    if (this.over) return;
    const a = this.teamAlive(0);
    const b = this.teamAlive(1);
    if (!a || !b) {
      this.over = true;
      this.winner = a ? 0 : b ? 1 : -1;
      this.emit('battleEnd', { winner: this.winner });
    }
  }

  _endByHp() {
    if (this.over) return;
    const sum = (t) => this.teams[t].reduce((s, u) => s + Math.max(0, u.hp), 0);
    const a = sum(0);
    const b = sum(1);
    this.over = true;
    this.winner = a > b ? 0 : b > a ? 1 : -1;
    this.emit('battleEnd', { winner: this.winner });
  }
}

export { ENERGY_MAX };
