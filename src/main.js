// 入口：載存檔 → 建 Pixi → 掛五大畫面（主城/隊伍/英雄/召喚/戰役）→
// 主城大廳制導覽 → 登入彈窗佇列 + FTUE。
import './style.css';
import './social.css';
import './redesign.css';
import { loadGame } from './core/save.js';
import { store } from './core/state.js';
import { createPixiApp } from './render/pixiApp.js';
import { BattleController } from './render/battleController.js';
import { nav } from './ui/router.js';
import { HomeUI } from './ui/homeUI.js';
import { TeamUI } from './ui/teamUI.js';
import { HeroesUI } from './ui/heroesUI.js';
import { GachaUI } from './ui/gachaUI.js';
import { ArenaUI } from './ui/arenaUI.js';
import { FriendsUI } from './ui/friendsUI.js';
import { GuildUI } from './ui/guildUI.js';
import { TowerUI } from './ui/towerUI.js';
import { ShopUI } from './ui/shopUI.js';
import { BattleOverlay } from './ui/battleOverlay.js';
import { ensureQuests } from './systems/quests.js';
import { bootAuth, cloudBackup, pushProfile, net } from './net/api.js';

async function main() {
  loadGame();
  ensureQuests(); // 跨日任務重置

  // Pixi 戰場（只在戰役頁運轉：進頁開打、離頁收場——不做背景自動戰鬥）
  const app = await createPixiApp(document.getElementById('battle-canvas'));
  app.canvas.style.width = '100%';
  app.canvas.style.height = '100%';
  app.canvas.style.objectFit = 'contain';

  const overlay = new BattleOverlay(document.getElementById('battle-overlay'));
  const battle = new BattleController(app, overlay);

  // 各功能畫面
  const home = new HomeUI(document.getElementById('screen-home'));
  const team = new TeamUI(document.getElementById('screen-team'));
  const heroes = new HeroesUI(document.getElementById('screen-heroes'));
  const gacha = new GachaUI(document.getElementById('screen-gacha'));
  const arena = new ArenaUI(document.getElementById('screen-arena'), battle);
  const friends = new FriendsUI(document.getElementById('screen-friends'), battle);
  const guild = new GuildUI(document.getElementById('screen-guild'), battle);
  const tower = new TowerUI(document.getElementById('screen-tower'), battle);
  const shop = new ShopUI(document.getElementById('screen-shop'));
  const screens = { home, team, heroes, gacha };

  nav.register('home', document.getElementById('screen-home'), home);
  nav.register('team', document.getElementById('screen-team'), team);
  nav.register('heroes', document.getElementById('screen-heroes'), heroes);
  nav.register('gacha', document.getElementById('screen-gacha'), gacha);
  nav.register('arena', document.getElementById('screen-arena'), arena);
  nav.register('friends', document.getElementById('screen-friends'), friends);
  nav.register('guild', document.getElementById('screen-guild'), guild);
  nav.register('tower', document.getElementById('screen-tower'), tower);
  nav.register('shop', document.getElementById('screen-shop'), shop);
  // 戰鬥只在戰役頁跑：進頁開打、離頁整場收掉（不做背景自動戰鬥）。
  nav.register('battle', document.getElementById('screen-battle'), {
    onShow: () => battle.enter(),
    onHide: () => battle.leave(),
  });

  // 效能：不在戰役頁時 ticker 降頻（此時無戰鬥、僅低成本空轉），戰役頁不限幀（RAF 同步 60+）。
  const throttleBattle = (id) => { app.ticker.maxFPS = id === 'battle' ? 0 : 10; };
  nav.onChange(throttleBattle);
  nav.go('home');
  throttleBattle('home');

  // 前後端分離：背景登入（裝置帳號），失敗＝離線模式（競技場退機器人）。
  bootAuth().then((ok) => {
    if (ok && nav.current() === 'home') home.render(); // 連線標示刷新
  });
  // 雲端備份（防抖）＋ 章節同步：狀態變更後推伺服器（離線靜默）。
  store.subscribe(() => {
    cloudBackup();
  });
  let lastStage = store.state.progress.stage;
  store.subscribe(() => {
    if (store.state.progress.stage !== lastStage) {
      lastStage = store.state.progress.stage;
      if (net.authed) pushProfile();
    }
  });

  // 任何狀態變更 → 重繪目前畫面（戰役頁由事件/ticker 驅動，不重繪）。
  store.subscribe(() => {
    const id = nav.current();
    if (id && screens[id]) screens[id].render?.();
  });

  // 陣容變更 → 重啟當前戰鬥（只在戰役頁上有戰鬥時；其他頁下次進場自然吃新陣容）。
  let lastFormation = JSON.stringify(store.state.formation);
  store.subscribe(() => {
    const f = JSON.stringify(store.state.formation);
    if (f !== lastFormation) {
      lastFormation = f;
      if (nav.current() === 'battle') battle.restart();
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
