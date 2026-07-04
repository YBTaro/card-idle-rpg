// 戰鬥流程控制：每場用 simulateBattle 產 log，交給 Replayer/Director 播放到 BattleScene，
// 掛機自動重開下一場。資訊層（頭像/血量匯總/回合/勝敗橫幅）由 BattleOverlay 呈現。
import { simulateBattle } from '../battle/battleLog.js';
import { Replayer } from '../battle/replayer.js';
import { AnimationDirector } from './animationDirector.js';
import { BattleScene } from './battleScene.js';
import { buildPlayerUnits, buildEnemyUnits } from '../systems/battleSetup.js';
import { store } from '../core/state.js';
import { saveGame } from '../core/save.js';
import { Rng } from '../core/rng.js';
import { trackQuest } from '../systems/quests.js';
import { setFxSpeed } from './fx.js';
import { ultTiming } from './skillVfx.js';
import { DELAYS } from './animationDirector.js';

export const WIN_GOLD = 60; // 勝利掛機獎勵（佔位）
const RESTART_DELAY_WIN = 1.8; // 勝利橫幅停留
const RESTART_DELAY_LOSE = 3.4; // 戰敗要留時間給「調整陣容」CTA
const RESTART_DELAY_DRAW = 2.0;

export class BattleController {
  constructor(app, overlay = null) {
    this.app = app;
    this.overlay = overlay;
    this.speed = 2;
    setFxSpeed(this.speed); // 特效時長與倍速同步
    this.replayer = null;
    this.director = null;
    this.scene = null;
    this._setup = null;
    this._cooldown = 0;

    overlay?.bind?.(this);
    this.app.ticker.add(this._tick, this);
    this.start();
  }

  start() {
    this._teardownScene();
    const player = buildPlayerUnits(store.state);
    if (player.length === 0) {
      this.overlay?.setNotice('⚠ 尚未編排陣容——到「隊伍」上陣後自動開戰');
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
    this.director = new AnimationDirector(this.replayer, {
      // 絕技的施放停頓依技能不同（單體快、範圍長、治療居中）——見 skillVfx.ultTiming
      delays: { ...DELAYS, ultimate: (entry) => ultTiming(entry.skill).castDelay },
    });
    this.director.speed = this.speed;
    // 絕技聚光燈演出未收燈前，不放行下一個單位的回合（要等特效放完才下一個動作）。
    this.director.gate = (entry) => this.scene?.gateEvent?.(entry) ?? false;
    this.replayer.on('battleEnd', ({ winner }) => this._onEnd(winner));
    this._cooldown = 0;
    this.overlay?.setBattle({ stage });
  }

  // 陣容/等級變更後呼叫，重啟當前戰鬥。
  restart() {
    this.start();
  }

  setSpeed(x) {
    this.speed = x;
    setFxSpeed(x); // 之後新建的特效跟上倍速
    if (this.director) this.director.speed = x;
  }

  // 快轉當前戰鬥到結束（瞬間結算 log）。battleEnd 事件照常觸發結算。
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
      trackQuest('win');
      this.overlay?.showResult({ win: true, gold: WIN_GOLD, nextStage: s.progress.stage });
      this._cooldown = RESTART_DELAY_WIN;
    } else if (winner === 1) {
      s.progress.losses = (s.progress.losses || 0) + 1;
      this.overlay?.showResult({ win: false });
      this._cooldown = RESTART_DELAY_LOSE;
    } else {
      this.overlay?.showResult({ win: false, draw: true });
      this._cooldown = RESTART_DELAY_DRAW;
    }
    saveGame();
    store.notify();
  }

  _tick(ticker) {
    const dt = Math.min(0.05, ticker.deltaMS / 1000); // 夾住避免分頁切回時暴衝
    if (!this.replayer) return;

    if (this.replayer.done) {
      this.scene?.renderTick();
      this._cooldown -= dt;
      if (this._cooldown <= 0) this.start();
      return;
    }

    this.director.update(dt);
    this.scene?.renderTick();
    this._pushOverlay();
  }

  _pushOverlay() {
    if (!this.overlay || !this._setup) return;
    let hp0 = 0;
    let max0 = 0;
    let hp1 = 0;
    let max1 = 0;
    let aliveA = 0;
    let aliveB = 0;
    for (const u of this._setup) {
      const hp = this.replayer.hpOf(u.uid);
      if (u.team === 0) {
        hp0 += hp;
        max0 += u.maxHp;
        if (this.replayer.aliveOf(u.uid)) aliveA += 1;
      } else {
        hp1 += hp;
        max1 += u.maxHp;
        if (this.replayer.aliveOf(u.uid)) aliveB += 1;
      }
    }
    this.overlay.update({
      round: this.replayer.round,
      hpRatio0: max0 > 0 ? hp0 / max0 : 0,
      hpRatio1: max1 > 0 ? hp1 / max1 : 0,
      aliveA,
      aliveB,
    });
  }

  _teardownScene() {
    if (this.scene) {
      this.scene.destroy();
      this.scene = null;
    }
  }
}
