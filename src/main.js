// 入口：載存檔 → 建 Pixi → 掛五大畫面（主城/隊伍/英雄/召喚/戰役）→
// 主城大廳制導覽 → 登入彈窗佇列 + FTUE。
import './style.css';
import { loadGame } from './core/save.js';
import { store } from './core/state.js';
import { createPixiApp } from './render/pixiApp.js';
import { BattleController } from './render/battleController.js';
import { nav } from './ui/router.js';
import { HomeUI } from './ui/homeUI.js';
import { TeamUI } from './ui/teamUI.js';
import { HeroesUI } from './ui/heroesUI.js';
import { GachaUI } from './ui/gachaUI.js';
import { BattleOverlay } from './ui/battleOverlay.js';
import { ensureQuests } from './systems/quests.js';

async function main() {
  loadGame();
  ensureQuests(); // 跨日任務重置

  // Pixi 戰場（常駐運轉＝掛機推關，不在戰役頁也照打）
  const app = await createPixiApp(document.getElementById('battle-canvas'));
  app.canvas.style.width = '100%';
  app.canvas.style.height = '100%';
  app.canvas.style.objectFit = 'contain';

  const overlay = new BattleOverlay(document.getElementById('battle-overlay'));
  const battle = new BattleController(app, overlay);

  // 五大畫面
  const home = new HomeUI(document.getElementById('screen-home'));
  const team = new TeamUI(document.getElementById('screen-team'));
  const heroes = new HeroesUI(document.getElementById('screen-heroes'));
  const gacha = new GachaUI(document.getElementById('screen-gacha'));
  const screens = { home, team, heroes, gacha };

  nav.register('home', document.getElementById('screen-home'), home);
  nav.register('team', document.getElementById('screen-team'), team);
  nav.register('heroes', document.getElementById('screen-heroes'), heroes);
  nav.register('gacha', document.getElementById('screen-gacha'), gacha);
  nav.register('battle', document.getElementById('screen-battle'), null);
  nav.go('home');

  // 任何狀態變更 → 重繪目前畫面（戰役頁由事件/ticker 驅動，不重繪）。
  store.subscribe(() => {
    const id = nav.current();
    if (id && screens[id]) screens[id].render?.();
  });

  // 陣容變更 → 重啟當前戰鬥（升級不重啟，下一場才吃新數值）。
  let lastFormation = JSON.stringify(store.state.formation);
  store.subscribe(() => {
    const f = JSON.stringify(store.state.formation);
    if (f !== lastFormation) {
      lastFormation = f;
      battle.restart();
    }
  });

  // 新手引導（新檔）→ 之後才排登入彈窗佇列（簽到 / 掛機箱滿）。
  home.startupTutorial();
  home.startupPopups();
}

main().catch((err) => {
  console.error(err);
  const hint = document.createElement('div');
  hint.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#ff7a6b;font-size:16px;z-index:999';
  hint.textContent = '初始化失敗：' + err.message;
  document.body.appendChild(hint);
});
