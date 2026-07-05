// src/render/animationDirector.js
// 動畫節奏層：把 replayer 的事件流按型別時間預算播出。純邏輯，不碰 pixi/gsap。
export const DELAYS = {
  turn: 0.1, attack: 0.25, ultimate: 1.05, damage: 0.18,
  heal: 0.15, death: 0.25, stunned: 0.25, revive: 0.45, dispel: 0.25,
  weather: 1.25, terrain: 1.25, drain: 0.12, // 環境宣告是戰略事件：獨占一整拍（開場互蓋逐一亮相）
  enter: 0.7, // 進場施法演出：cast 特效要一拍看清
  miss: 0.22, // 迴避：側移殘影 + MISS 飄字要看得清
  steal: 0.3, // 竊能：奪走→轉移兩端飄字要有拍點
  shield: 0.15, // 上盾：藍金飄字一拍（盾量統計的資料源同這事件）
  trigger: 0.25, // 觸發：金色 ⚡ 標示要讓玩家看清是誰的什麼觸發了
  resist: 0.2, blocked: 0.22, cheated: 0.4, // 抵抗/免疫/免死 各有一拍
  bossPhase: 0.8, bossBreak: 0.5, bossEnrage: 0.8, // Boss 機制是大事件，拍點要重
};

export class AnimationDirector {
  constructor(replayer, { delays = DELAYS, initialDelay = 0 } = {}) {
    this.replayer = replayer;
    this.delays = delays;
    this.speed = 1;
    this._wait = initialDelay; // 開場橫幅（⚔ 戰鬥開始）先播完，事件流再啟動
    // gate(nextEntry) → true 表示「先卡住別播」（例：絕技演出未結束前不放行下一個回合）。
    this.gate = null;
  }
  get done() { return this.replayer.done; }
  update(dt) {
    if (this.done) return;
    this._wait -= dt * this.speed;
    while (this._wait <= 0 && !this.replayer.done) {
      const next = this.replayer.peek?.();
      if (next && this.gate && this.gate(next)) {
        this._wait = 0; // 等 gate 放行後立即續播
        return;
      }
      const entry = this.replayer.step();
      const d = this.delays[entry.type];
      // 延遲可為函式（依事件內容決定，例：絕技依技能不同有不同演出時間）
      this._wait += typeof d === 'function' ? d(entry) : (d ?? 0);
    }
  }
}
