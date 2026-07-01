// 入口：載存檔 → 建 Pixi → 啟動戰鬥迴圈 → 掛載 UI → 分頁切換。
import './style.css';
import { loadGame } from './core/save.js';
import { store } from './core/state.js';
import { createPixiApp } from './render/pixiApp.js';
import { BattleController } from './render/battleController.js';
import { Hud } from './ui/hud.js';
import { GachaUI } from './ui/gachaUI.js';
import { RosterUI } from './ui/rosterUI.js';
import { el } from './ui/dom.js';

async function main() {
  loadGame();

  const app = await createPixiApp(document.getElementById('battle-canvas'));
  const statusEl = document.getElementById('battle-status');
  const battle = new BattleController(app, statusEl);

  const hud = new Hud(document.getElementById('hud'), {
    onSpeedChange: (x) => battle.setSpeed(x),
    getSpeed: () => battle.speed,
    onReset: () => {
      battle.restart();
      roster.render();
      gacha.render();
    },
  });

  const roster = new RosterUI(document.getElementById('screen-roster'), {
    onFormationChange: () => battle.restart(),
  });

  const gacha = new GachaUI(document.getElementById('screen-gacha'));

  setupTabs();

  // 任何狀態變更 → 重繪相關 UI（戰鬥場景靠事件，不在此重繪）。
  store.subscribe(() => {
    hud.render();
    roster.render();
    gacha.render();
  });
}

function setupTabs() {
  const tabsEl = document.getElementById('tabs');
  const defs = [
    ['battle', '⚔ 戰鬥'],
    ['roster', '🃏 角色'],
    ['gacha', '🎴 抽卡'],
  ];
  for (const [id, label] of defs) {
    const b = el('button', { text: label, onClick: () => activate(id) });
    b.dataset.tab = id;
    tabsEl.appendChild(b);
  }
  function activate(id) {
    document
      .querySelectorAll('.screen')
      .forEach((s) => s.classList.toggle('active', s.id === `screen-${id}`));
    tabsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
  }
  activate('battle');
}

main().catch((err) => {
  console.error(err);
  document.getElementById('battle-status').textContent = '初始化失敗：' + err.message;
});
