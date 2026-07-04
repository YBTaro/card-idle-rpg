// 試煉塔頁：垂直塔軌（上面是未來樓層、最下面是當前層）＋右側我的隊伍/里程碑。
// 動效：進場樓層由下往上交錯滑入（爬塔感）；勝利 → 獎勵飛入 → 塔軌上移推進。
import { gsap } from 'gsap';
import { el, clear, toast, fmt } from './dom.js';
import { icon } from './icons.js';
import { store } from '../core/state.js';
import { nav } from './router.js';
import { CARDS } from '../data/cards.js';
import { ELEMENT_LABEL } from '../data/elements.js';
import { cardFrame } from './cardFrame.js';
import { openModal } from './modal.js';
import { staggerIn, popIn, flyReward } from './anim.js';
import { currentFloor, floorPreview, challengeTower, claimTowerWin, BOSS_EVERY } from '../systems/tower.js';

const ELEMENT_ICON = { fire: '🔥', wind: '🍃', water: '💧', light: '☀️', dark: '🌙' };
const AHEAD = 4; // 顯示未來幾層

export class TowerUI {
  constructor(root, battle) {
    this.root = root;
    this.battle = battle;
    this._busy = false;
  }

  onShow() { this.render(); }

  render() {
    clear(this.root);
    this.root.appendChild(el('div', { class: 'back-btn pressable', title: '回主城', onClick: () => nav.go('home') }, [icon('back', 22)]));
    this.root.appendChild(el('div', { class: 'page-title left', text: '試煉塔' }));

    const s = store.state;
    const cur = currentFloor(s);

    // 頂欄：進度
    this.root.appendChild(el('div', { class: 'tw-top' }, [
      el('div', { class: 'tw-progress', text: `已登頂 ${cur - 1} 層` }),
    ]));

    const body = el('div', { class: 'tw-body' });

    // 左：塔軌（由上到下＝未來 → 當前）
    const track = el('div', { class: 'tw-track' });
    for (let f = cur + AHEAD; f >= cur; f -= 1) {
      track.appendChild(this._floorRow(floorPreview(f), f === cur));
    }
    // 已通關的最近 2 層（灰調、墊在最下面）
    for (let f = cur - 1; f >= Math.max(1, cur - 2); f -= 1) {
      const row = this._floorRow(floorPreview(f), false);
      row.classList.add('cleared');
      row.appendChild(el('div', { class: 'tw-clearmark', text: '✓' }));
      track.appendChild(row);
    }
    body.appendChild(track);

    // 右：我的隊伍 + 里程碑
    const side = el('div', { class: 'tw-side' });
    side.appendChild(el('div', { class: 'ar-sub', text: '我的隊伍' }));
    const myGrid = el('div', { class: 'ar-defgrid' });
    for (const e of s.formation) {
      const inst = s.cards.find((c) => c.instanceId === e.instanceId);
      const card = inst ? CARDS[inst.cardId] : null;
      if (card) myGrid.appendChild(cardFrame(card, { level: inst.level, stars: inst.stars, size: 'mini' }));
    }
    side.appendChild(myGrid);
    side.appendChild(el('button', { class: 'btn pressable', text: '🃏 調整隊伍', onClick: () => nav.go('team') }));

    // 下個 Boss 里程碑預告
    const nextBoss = Math.ceil(cur / BOSS_EVERY) * BOSS_EVERY;
    const bossPrev = floorPreview(nextBoss);
    side.appendChild(el('div', { class: 'ar-sub', text: '下個里程碑' }));
    side.appendChild(el('div', { class: 'tw-mile' }, [
      el('div', { class: 'm1', text: `第 ${nextBoss} 層 Boss` }),
      el('div', { class: 'm2', text: `🎟️ 召喚券 ×${bossPrev.rewards.tickets ?? 1}` }),
    ]));
    body.appendChild(side);
    this.root.appendChild(body);

    // 進場動效：樓層由下（當前層）往上交錯滑入——爬塔的方向感
    const rows = [...track.children].reverse();
    staggerIn(rows, { dy: 22, step: 0.06 });
    // 自動捲到當前層
    requestAnimationFrame(() => { track.scrollTop = track.scrollHeight; });
  }

  _floorRow(fp, isCurrent) {
    const row = el('div', { class: `tw-floor${isCurrent ? ' current' : ''}${fp.isBoss ? ' boss' : ''}` });
    row.appendChild(el('div', { class: 'tw-fno' }, [
      el('b', { text: `${fp.floor}` }),
      el('span', { text: '層' }),
    ]));
    row.appendChild(el('div', { class: 'tw-ftheme', text: `${ELEMENT_ICON[fp.theme]} ${ELEMENT_LABEL[fp.theme]}屬威脅${fp.isBoss ? ' · 👹 BOSS' : ''}` }));
    const mini = el('div', { class: 'tw-fdef' });
    for (const e of [...fp.enemies].sort((a, b) => a.pos - b.pos)) {
      const card = CARDS[e.cardId];
      if (card) mini.appendChild(cardFrame(card, { level: e.level, size: 'mini' }));
    }
    row.appendChild(mini);
    const chips = el('div', { class: 'tw-frw' }, [
      el('span', { text: `🪙${fmt(fp.rewards.gold)}` }),
      el('span', { text: `🔹${fp.rewards.essence}` }),
    ]);
    if (fp.rewards.tickets) chips.appendChild(el('span', { text: `🎟️×${fp.rewards.tickets}` }));
    row.appendChild(chips);
    if (isCurrent) {
      row.appendChild(el('button', { class: 'btn btn-gold pressable tw-fight', text: '⚔ 挑戰', onClick: () => this._challenge() }));
    }
    return row;
  }

  _challenge() {
    if (this._busy) return;
    const res = challengeTower();
    if (!res) { toast('請先到「隊伍」編排上陣'); return; }
    this._busy = true;
    nav.go('battle');
    this.battle.playCustom({ setup: res.sim.setup, log: res.sim.log }, {
      title: `試煉塔 ${res.floor}F`,
      onDone: () => {
        this._busy = false;
        nav.go('tower');
        if (res.win) {
          const granted = claimTowerWin(res.floor);
          this.render(); // 塔軌推進（重繪自帶爬升進場動效）
          this._winModal(res.floor, granted);
        } else {
          toast('差一點！升級英雄或換屬性剋制隊再來', { icon: '🗼' });
        }
      },
    });
  }

  _winModal(floor, rewards) {
    openModal({
      className: 'ov-arena-result',
      build: (panel, close) => {
        const badge = el('div', { class: 'ov-title', text: `🗼 登上第 ${floor + 1} 層！` });
        panel.appendChild(badge);
        popIn(badge);
        const line = el('div', { class: 'arr-line', text: '首通獎勵' });
        panel.appendChild(line);
        const chips = el('div', { class: 'tw-winrw' }, [
          el('span', { text: `🪙 ${fmt(rewards?.gold ?? 0)}` }),
          el('span', { text: `🔹 ${rewards?.essence ?? 0}` }),
        ]);
        if (rewards?.tickets) chips.appendChild(el('span', { text: `🎟️ ×${rewards.tickets}` }));
        panel.appendChild(chips);
        staggerIn(chips.children, { dy: 10, step: 0.1 });
        flyReward(rewards ?? {}, chips);
        panel.appendChild(el('button', { class: 'btn btn-gold', text: '繼續攀登', onClick: () => close() }));
      },
    });
  }
}
