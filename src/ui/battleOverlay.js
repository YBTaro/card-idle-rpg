// 戰鬥畫面 DOM 資訊層（依戰鬥參考原型）：
// 左上我方頭像+隊伍血量匯總、右上敵方鏡像、上中關卡菱標、左下回合圓章、
// 右下戰速/跳過菱形鈕、底部戰報 ticker、勝敗橫幅（勝利金幣飛入 / 戰敗導流調整陣容）。
import { gsap } from 'gsap';
import { el, clear } from './dom.js';
import { store } from '../core/state.js';
import { nav } from './router.js';
import { stageLabel } from '../systems/profile.js';
import { avatarEl } from './metaSheets.js';

const COIN_FLY_S = 0.6;
const SPEEDS = [1, 2, 3];

export class BattleOverlay {
  constructor(root) {
    this.root = root;
    this.battle = null; // bind() 後注入
    this._build();
  }

  bind(battle) {
    this.battle = battle;
    this._syncSpeedBtn();
  }

  _build() {
    clear(this.root);

    this.root.appendChild(el('div', { class: 'back-btn pressable', text: '🏠', title: '回主城', onClick: () => nav.go('home') }));

    // 左上：我方
    this.avaLeft = el('div', { class: 'ava' });
    this.nmLeft = el('span', { class: 'nm', text: '我方' });
    this.gaugeLeft = el('i', { style: 'width:100%' });
    this.root.appendChild(
      el('div', { class: 'bo-av left' }, [
        this.avaLeft,
        el('div', { class: 'col' }, [this.nmLeft, el('span', { class: 'gauge' }, [this.gaugeLeft])]),
      ])
    );

    // 右上：敵方
    this.nmRight = el('span', { class: 'nm', text: '敵軍' });
    this.gaugeRight = el('i', { style: 'width:100%' });
    this.root.appendChild(
      el('div', { class: 'bo-av right' }, [
        el('div', { class: 'ava', text: '👹' }),
        el('div', { class: 'col' }, [this.nmRight, el('span', { class: 'gauge' }, [this.gaugeRight])]),
      ])
    );

    // 上中：關卡菱標
    this.waveText = el('span', { text: '1-1' });
    this.root.appendChild(el('div', { class: 'bo-wave' }, [this.waveText]));

    // 左下：回合圓章
    this.roundEl = el('div', { class: 'bo-round', text: 'R1' });
    this.root.appendChild(this.roundEl);

    // 右下：戰速 + 跳過
    this.speedBtn = el('div', { class: 'bo-cb pressable on' }, [el('span', { text: '×2' })]);
    this.speedBtn.addEventListener('click', () => {
      if (!this.battle) return;
      const cur = SPEEDS.indexOf(this.battle.speed);
      const next = SPEEDS[(cur + 1) % SPEEDS.length];
      this.battle.setSpeed(next);
      this._syncSpeedBtn();
    });
    const skipBtn = el('div', { class: 'bo-cb pressable' }, [el('span', { text: '⏭' })]);
    skipBtn.addEventListener('click', () => this.battle?.skip());
    this.root.appendChild(el('div', { class: 'bo-ctrl' }, [this.speedBtn, skipBtn]));

    // 底部 ticker
    this.ticker = el('div', { class: 'bo-ticker', text: '' });
    this.root.appendChild(this.ticker);
  }

  _syncSpeedBtn() {
    const s = this.battle?.speed ?? 2;
    this.speedBtn.querySelector('span').textContent = `×${s}`;
  }

  // 每場開打時同步靜態資訊。
  setBattle({ stage }) {
    const label = stageLabel(stage);
    this.waveText.textContent = label;
    this.nmLeft.textContent = '我方';
    this.nmRight.textContent = `西境軍 ${label}`;
    clear(this.avaLeft);
    this.avaLeft.appendChild(avatarEl());
    this.hideResult();
  }

  // 每 tick 更新（controller 驅動）。
  update({ round, hpRatio0, hpRatio1, aliveA, aliveB }) {
    this.roundEl.textContent = `R${round}`;
    this.gaugeLeft.style.width = `${Math.max(0, hpRatio0 * 100)}%`;
    this.gaugeRight.style.width = `${Math.max(0, hpRatio1 * 100)}%`;
    this.ticker.textContent = `我方 ${aliveA} vs 敵方 ${aliveB}`;
  }

  setNotice(text) {
    this.ticker.innerHTML = '';
    this.ticker.textContent = text;
  }

  // 勝敗橫幅。result: { win, draw?, gold?, nextStage?, cooldown }
  showResult(result) {
    this.hideResult();
    const node = el('div', { class: `bo-result ${result.win ? 'win' : 'lose'}` });
    if (result.win) {
      node.appendChild(el('div', { class: 'vt', text: 'VICTORY' }));
      node.appendChild(el('div', { class: 'vr', text: `🪙 +${result.gold}　✨ 前進 ${stageLabel(result.nextStage)}` }));
      node.appendChild(el('div', { class: 'vnext', text: '即將開始下一場…' }));
      this._flyCoins();
    } else if (result.draw) {
      node.appendChild(el('div', { class: 'vt', text: 'DRAW' }));
      node.appendChild(el('div', { class: 'vr', text: '同歸於盡，重整旗鼓' }));
    } else {
      node.appendChild(el('div', { class: 'vt', text: 'DEFEAT' }));
      node.appendChild(el('div', { class: 'vr', text: '敵方戰力較高，建議強化英雄或調整陣容' }));
      node.appendChild(
        el('button', { class: 'btn-gold', text: '🃏 調整陣容 →', onClick: () => nav.go('team') })
      );
    }
    this.root.appendChild(node);
    this._result = node;
    gsap.fromTo(node.querySelector('.vt'), { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.7)' });
    gsap.fromTo(node, { opacity: 0 }, { opacity: 1, duration: 0.2 });
  }

  hideResult() {
    if (this._result) {
      const node = this._result;
      this._result = null;
      gsap.to(node, { opacity: 0, duration: 0.18, onComplete: () => node.remove() });
    }
  }

  // 勝利金幣飛向左上（帳面同步由 store 驅動）。
  _flyCoins() {
    const fromX = window.innerWidth / 2;
    const fromY = window.innerHeight / 2;
    for (let i = 0; i < 6; i += 1) {
      const coin = el('div', { class: 'coin-fly', text: '🪙' });
      coin.style.left = `${fromX + (Math.random() * 80 - 40)}px`;
      coin.style.top = `${fromY + (Math.random() * 40 - 20)}px`;
      document.body.appendChild(coin);
      gsap.to(coin, {
        left: 60 + Math.random() * 40,
        top: 20 + Math.random() * 16,
        opacity: 0.2,
        duration: COIN_FLY_S,
        delay: i * 0.05,
        ease: 'power2.in',
        onComplete: () => coin.remove(),
      });
    }
  }
}
