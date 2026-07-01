// 戰鬥流程控制：建立 engine + scene，驅動 ticker，掛機自動重開下一場。
import { BattleEngine } from '../battle/engine.js';
import { BattleScene } from './battleScene.js';
import { buildPlayerUnits, buildEnemyUnits } from '../systems/battleSetup.js';
import { store } from '../core/state.js';
import { saveGame } from '../core/save.js';
import { Rng } from '../core/rng.js';

export const WIN_GOLD = 60; // 勝利掛機獎勵（佔位）
const RESTART_DELAY = 1.4; // 秒
const STEP_INTERVAL = 0.35; // 每個動作間隔（秒），再除以速度

export class BattleController {
  constructor(app, statusEl) {
    this.app = app;
    this.statusEl = statusEl;
    this.speed = 2; // 戰鬥速度倍率
    this.engine = null;
    this.scene = null;
    this._cooldown = 0;
    this._lastResult = '';
    this._stepAccum = 0;

    this.app.ticker.add(this._tick, this);
    this.start();
  }

  start() {
    this._teardownScene();
    const player = buildPlayerUnits(store.state);
    if (player.length === 0) {
      this._setStatus('⚠ 尚未編排陣容，請到「角色」分頁上陣');
      this.engine = null;
      return;
    }
    const stage = store.state.progress.stage || 1;
    const enemy = buildEnemyUnits(stage, new Rng());
    this.engine = new BattleEngine(player, enemy);
    this.scene = new BattleScene(this.app, this.engine);
    this.engine.on('battleEnd', ({ winner }) => this._onEnd(winner));
    this._cooldown = 0;
  }

  // 陣容/等級變更後呼叫，重啟當前戰鬥。
  restart() {
    this.start();
  }

  setSpeed(x) {
    this.speed = x;
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
    if (!this.engine) return;

    if (this.engine.over) {
      this.scene?.renderTick();
      this._cooldown -= dt;
      this._setStatus(`${this._lastResult}　下一場 ${Math.max(0, this._cooldown).toFixed(1)}s…`);
      if (this._cooldown <= 0) this.start();
      return;
    }

    this._stepAccum += dt * this.speed;
    let guard = 0;
    while (this._stepAccum >= STEP_INTERVAL && this.engine && !this.engine.over && guard < 50) {
      this._stepAccum -= STEP_INTERVAL;
      this.engine.step();
      guard += 1;
    }
    this.scene?.renderTick();
    this._renderStatus();
  }

  _renderStatus() {
    const e = this.engine;
    const a = e.teams[0].filter((u) => u.alive).length;
    const b = e.teams[1].filter((u) => u.alive).length;
    const stage = store.state.progress.stage || 1;
    this._setStatus(`關卡 ${stage}　我方 ${a} vs 敵方 ${b}　|　回合 ${e.round}`);
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
