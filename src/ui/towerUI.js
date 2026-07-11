// 試煉塔頁：兩級畫面。選塔頁（6 座主題塔）→ 關卡格頁（1–80 層，自由跳關）→ 樓層預覽/挑戰。
// 動效：選塔卡/關卡格進場交錯滑入；勝利 → 徽章彈入 + 獎勵飛入。
import { el, clear, toast, fmt } from './dom.js';
import { icon } from './icons.js';
import { store } from '../core/state.js';
import { nav } from './router.js';
import { CARDS } from '../data/cards.js';
import { ELEMENT_LABEL } from '../data/elements.js';
import { cardFrame } from './cardFrame.js';
import { openModal } from './modal.js';
import { staggerIn, popIn, flyReward } from './anim.js';
import { TOWER_TRACKS } from '../data/towerTracks.js';
import {
  MAX_FLOOR, isBossFloor, enemyLevel, isCleared,
  floorPreview, challengeTower, claimTowerWin,
} from '../systems/tower.js';

const THEME_ICON = { fire: '🔥', wind: '🍃', water: '💧', light: '☀️', dark: '🌙', dot: '☠️' };
const THEME_NAME = { ...ELEMENT_LABEL, dot: '毒' };

export class TowerUI {
  constructor(root, battle) {
    this.root = root;
    this.battle = battle;
    this.trackId = null; // null＝選塔頁
    this._busy = false;
  }

  onShow() { this.render(); }

  render() {
    clear(this.root);
    if (!this.trackId) return this._renderSelect();
    return this._renderFloors();
  }

  // ---- 選塔頁 ----
  _renderSelect() {
    this.root.appendChild(el('div', { class: 'back-btn pressable', title: '回主城', onClick: () => nav.go('home') }, [icon('back', 22)]));
    this.root.appendChild(el('div', { class: 'page-title left', text: '試煉塔' }));
    const grid = el('div', { class: 'tw-select' });
    for (const t of TOWER_TRACKS) {
      const cleared = (store.state.tower?.tracks?.[t.id]?.cleared ?? []).length;
      const card = el('div', {
        class: 'tw-trackcard pressable',
        onClick: () => { this.trackId = t.id; this.render(); },
      }, [
        el('div', { class: 'tw-trackicon', text: THEME_ICON[t.theme], style: `--tw-col:${t.color}` }),
        el('div', { class: 'tw-trackname', text: t.name }),
        el('div', { class: 'tw-tracksub', text: `吃香：${THEME_NAME[t.theme]}屬` }),
        el('div', { class: 'tw-trackprog', text: `已通 ${cleared}/${MAX_FLOOR}` }),
      ]);
      grid.appendChild(card);
    }
    this.root.appendChild(grid);
    staggerIn([...grid.children], { dy: 18, step: 0.05 });
  }

  // ---- 關卡格頁 ----
  _renderFloors() {
    this.root.appendChild(el('div', { class: 'back-btn pressable', title: '選塔', onClick: () => { this.trackId = null; this.render(); } }, [icon('back', 22)]));
    const track = TOWER_TRACKS.find((t) => t.id === this.trackId);
    this.root.appendChild(el('div', { class: 'page-title left', text: track.name }));

    const grid = el('div', { class: 'tw-grid' });
    for (let f = 1; f <= MAX_FLOOR; f += 1) {
      const done = isCleared(this.trackId, f);
      const boss = isBossFloor(f);
      const cell = el('div', {
        class: `tw-cell${boss ? ' boss' : ''}${done ? ' cleared' : ''}`,
        onClick: () => this._openFloor(f),
      }, [
        el('b', { text: `${f}` }),
        el('span', { class: 'tw-celllv', text: `Lv${enemyLevel(f)}` }),
        boss ? el('span', { class: 'tw-cellstar', text: '★' }) : null,
        done ? el('span', { class: 'tw-cellok', text: '✓' }) : null,
      ].filter(Boolean));
      grid.appendChild(cell);
    }
    this.root.appendChild(grid);
    staggerIn([...grid.children].slice(0, 40), { dy: 8, step: 0.006 });
  }

  // ---- 樓層預覽 modal ----
  _openFloor(floor) {
    const fp = floorPreview(this.trackId, floor);
    openModal({
      className: 'ov-tower-floor',
      build: (panel, close) => {
        panel.appendChild(el('div', { class: 'ov-title', text: `第 ${floor} 層 · Lv${fp.level}${fp.isBoss ? ' · 👹 BOSS' : ''}` }));
        if (fp.envLabel) panel.appendChild(el('div', { class: 'tw-fenv', text: fp.envLabel }));
        const mini = el('div', { class: 'tw-fdef' });
        for (const e of [...fp.enemies].sort((a, b) => a.pos - b.pos)) {
          const card = CARDS[e.cardId];
          if (card) mini.appendChild(cardFrame(card, { level: e.level, size: 'mini' }));
        }
        panel.appendChild(mini);
        const chips = el('div', { class: 'tw-frw' }, [
          el('span', { text: `🪙${fmt(fp.rewards.gold)}` }),
          el('span', { text: `🔹${fp.rewards.essence}` }),
        ]);
        if (fp.rewards.tickets) chips.appendChild(el('span', { text: `🎟️×${fp.rewards.tickets}` }));
        if (fp.cleared) chips.appendChild(el('span', { text: '✓ 已首通' }));
        panel.appendChild(chips);
        panel.appendChild(el('button', {
          class: 'btn btn-gold pressable', text: '⚔ 挑戰',
          onClick: () => { close(); this._challenge(floor); },
        }));
      },
    });
  }

  _challenge(floor) {
    if (this._busy) return;
    const res = challengeTower(this.trackId, floor);
    if (!res) { toast('請先到「隊伍」編排上陣'); return; }
    this._busy = true;
    nav.go('battle');
    this.battle.playCustom({ setup: res.sim.setup, log: res.sim.log }, {
      title: `${TOWER_TRACKS.find((t) => t.id === this.trackId).name} ${floor}F`,
      env: res.env,
      onDone: () => {
        this._busy = false;
        nav.go('tower');
        if (res.win) {
          const granted = claimTowerWin(res.trackId, res.floor);
          this.render();
          if (granted) this._winModal(floor, granted);
        } else {
          toast('差一點！升級英雄、升星或換陣再來', { icon: '🗼' });
        }
      },
    });
  }

  _winModal(floor, rewards) {
    openModal({
      className: 'ov-arena-result',
      build: (panel, close) => {
        const badge = el('div', { class: 'ov-title', text: `🗼 通過第 ${floor} 層！` });
        panel.appendChild(badge); popIn(badge);
        panel.appendChild(el('div', { class: 'arr-line', text: '首通獎勵' }));
        const chips = el('div', { class: 'tw-winrw' }, [
          el('span', { text: `🪙 ${fmt(rewards?.gold ?? 0)}` }),
          el('span', { text: `🔹 ${rewards?.essence ?? 0}` }),
        ]);
        if (rewards?.tickets) chips.appendChild(el('span', { text: `🎟️ ×${rewards.tickets}` }));
        panel.appendChild(chips);
        staggerIn(chips.children, { dy: 10, step: 0.1 });
        flyReward(rewards ?? {}, chips);
        panel.appendChild(el('button', { class: 'btn btn-gold', text: '繼續挑戰', onClick: () => close() }));
      },
    });
  }
}
