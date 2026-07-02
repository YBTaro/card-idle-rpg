// 戰鬥流程控制：每場用 simulateBattle 產 log，交給 Replayer/Director 播放到 BattleScene，掛機自動重開下一場。
import { simulateBattle } from '../battle/battleLog.js';
import { Replayer } from '../battle/replayer.js';
import { AnimationDirector } from './animationDirector.js';
import { BattleScene } from './battleScene.js';
import { buildPlayerUnits, buildEnemyUnits } from '../systems/battleSetup.js';
import { store } from '../core/state.js';
import { saveGame } from '../core/save.js';
import { Rng } from '../core/rng.js';

export const WIN_GOLD = 60; // 勝利掛機獎勵（佔位）
const RESTART_DELAY = 1.4; // 秒

export class BattleController {
  constructor(app, statusEl) {
    this.app = app;
    this.statusEl = statusEl;
    this.speed = 2; // 戰鬥速度倍率
    this.replayer = null;
    this.director = null;
    this.scene = null;
    this._setup = null;
    this._cooldown = 0;
    this._lastResult = '';

    this.app.ticker.add(this._tick, this);
    this.start();
  }

  start() {
    this._teardownScene();
    const player = buildPlayerUnits(store.state);
    if (player.length === 0) {
      this._setStatus('⚠ 尚未編排陣容，請到「角色」分頁上陣');
      this.replayer = null;
      this.director = null;
      this._setup = null;
      return;
    }
    const stage = store.state.progress.stage || 1;
    const enemy = buildEnemyUnits(stage, new Rng());
    const sim = simulateBattle(player, enemy, { rng: new Rng() });
    this._setup = sim.setup;
    this.replayer = new Replayer(sim.setup, sim.log);
    this.scene = new BattleScene(this.app, sim.setup, this.replayer);
    this.director = new AnimationDirector(this.replayer);
    this.director.speed = this.speed;
    this.replayer.on('battleEnd', ({ winner }) => this._onEnd(winner));
    this._cooldown = 0;
  }

  // 陣容/等級變更後呼叫，重啟當前戰鬥。
  restart() {
    this.start();
  }

  setSpeed(x) {
    this.speed = x;
    if (this.director) this.director.speed = x;
  }

  // 快轉當前戰鬥到結束（瞬間結算 log），再刷新一次畫面。battleEnd 事件照常觸發結算。
  skip() {
    if (!this.replayer || this.replayer.done) return;
    this.scene?.setInstant(true);
    this.replayer.skipToEnd();
    this.scene?.renderTick();
  }

  _onEnd(winner) {
    const s = store.state;
    if (winner === 0) {
      s.progress.wins = (s.progress.wins || 0) + 1;
      s.progress.stage = (s.progress.stage || 1) + 1;
      s.currencies.gold += WIN_GOLD;
      this._lastResult = `✅ 勝利！+${WIN_GOLD} 金幣，前進關卡 ${s.progress.stage}`;
    } else if (winner === 1) {
      s.progress.losses = (s.progress.losses || 0) + 1;
      this._lastResult = '❌ 戰敗，整隊休整後再戰';
    } else {
      this._lastResult = '⚖ 同歸於盡';
    }
    saveGame();
    store.notify();
    this._cooldown = RESTART_DELAY;
  }

  _tick(ticker) {
    const dt = Math.min(0.05, ticker.deltaMS / 1000); // 夾住避免分頁切回時暴衝
    if (!this.replayer) return;

    if (this.replayer.done) {
      this.scene?.renderTick();
      this._cooldown -= dt;
      this._setStatus(`${this._lastResult}　下一場 ${Math.max(0, this._cooldown).toFixed(1)}s…`);
      if (this._cooldown <= 0) this.start();
      return;
    }

    this.director.update(dt);
    this.scene?.renderTick();
    this._renderStatus();
  }

  _renderStatus() {
    const setup = this._setup;
    const a = setup.filter((u) => u.team === 0 && this.replayer.aliveOf(u.uid)).length;
    const b = setup.filter((u) => u.team === 1 && this.replayer.aliveOf(u.uid)).length;
    const stage = store.state.progress.stage || 1;
    this._setStatus(`關卡 ${stage}　我方 ${a} vs 敵方 ${b}　|　回合 ${this.replayer.round}`);
  }

  _setStatus(text) {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  _teardownScene() {
    if (this.scene) {
      this.scene.destroy();
      this.scene = null;
    }
  }
}
