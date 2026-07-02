// src/render/animationDirector.js
// 動畫節奏層：把 replayer 的事件流按型別時間預算播出。純邏輯，不碰 pixi/gsap。
export const DELAYS = {
  turn: 0.1, attack: 0.25, ultimate: 0.7, damage: 0.18,
  heal: 0.15, death: 0.25, stunned: 0.25,
};

export class AnimationDirector {
  constructor(replayer, { delays = DELAYS } = {}) {
    this.replayer = replayer;
    this.delays = delays;
    this.speed = 1;
    this._wait = 0;
  }
  get done() { return this.replayer.done; }
  update(dt) {
    if (this.done) return;
    this._wait -= dt * this.speed;
    while (this._wait <= 0 && !this.replayer.done) {
      const entry = this.replayer.step();
      this._wait += this.delays[entry.type] ?? 0;
    }
  }
}
