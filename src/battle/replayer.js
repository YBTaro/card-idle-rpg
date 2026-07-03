// src/battle/replayer.js
// 消費戰鬥 log 重播：追蹤 hp/alive，可逐步或跳到結尾。不需引擎。
import { EventEmitter } from '../core/events.js';

export class Replayer {
  constructor(setup, log) {
    this.setup = setup;
    this.log = log;
    this.cursor = 0;
    this.winner = null;
    this.round = 0;
    this.emitter = new EventEmitter();
    this.state = new Map();
    for (const u of setup) this.state.set(u.uid, { hp: u.maxHp, maxHp: u.maxHp, alive: true, energy: 0, buffs: [] });
  }

  on(event, fn) { return this.emitter.on(event, fn); }
  get done() { return this.cursor >= this.log.length; }

  _apply(entry) {
    if (entry.type === 'damage') {
      const s = this.state.get(entry.targetUid);
      if (s) { s.hp = Math.max(0, s.hp - entry.amount); if (s.hp === 0) s.alive = false; }
    } else if (entry.type === 'heal') {
      const s = this.state.get(entry.targetUid);
      if (s) s.hp = Math.min(s.maxHp, s.hp + entry.amount);
    } else if (entry.type === 'death') {
      const s = this.state.get(entry.uid);
      if (s) s.alive = false;
    } else if (entry.type === 'energy') {
      const s = this.state.get(entry.uid);
      if (s) s.energy = entry.value;
    } else if (entry.type === 'buffchange') {
      const s = this.state.get(entry.uid);
      if (s) s.buffs = entry.buffs || [];
    } else if (entry.type === 'round') {
      this.round = entry.round;
    } else if (entry.type === 'battleEnd') {
      this.winner = entry.winner;
    }
  }

  // 看下一筆但不前進（AnimationDirector 的 gate 用）。
  peek() {
    return this.done ? null : this.log[this.cursor];
  }

  step() {
    if (this.done) return null;
    const entry = this.log[this.cursor];
    this.cursor += 1;
    this._apply(entry);
    this.emitter.emit(entry.type, entry);
    return entry;
  }

  playAll() { while (!this.done) this.step(); }
  skipToEnd() { this.playAll(); }

  hpOf(uid) { return this.state.get(uid)?.hp ?? 0; }
  energyOf(uid) { return this.state.get(uid)?.energy ?? 0; }
  aliveOf(uid) { return this.state.get(uid)?.alive ?? false; }
  buffsOf(uid) { return this.state.get(uid)?.buffs ?? []; }
}
