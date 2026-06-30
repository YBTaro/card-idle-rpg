// 頂部 HUD：貨幣、每日領取（含倒數）、戰鬥速度、清檔。
import { el, clear, toast } from './dom.js';
import { store } from '../core/state.js';
import { resetGame } from '../core/save.js';
import { isClaimable, claimDaily, msUntilNext } from '../systems/daily.js';

function fmtCountdown(ms) {
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

export class Hud {
  constructor(root, { onSpeedChange, getSpeed, onReset } = {}) {
    this.root = root;
    this.onSpeedChange = onSpeedChange;
    this.getSpeed = getSpeed || (() => 2);
    this.onReset = onReset;
    this.render();
    // 每秒更新倒數
    setInterval(() => this._updateDaily(), 1000);
  }

  render() {
    const s = store.state;
    clear(this.root);

    this.root.appendChild(currency('🎟️', s.currencies.tickets, '抽卡券'));
    this.root.appendChild(currency('🪙', s.currencies.gold, '金幣'));
    this.root.appendChild(currency('🔹', s.inventory.materials.essence || 0, '養成精華'));

    this.root.appendChild(el('div', { class: 'hud-spacer' }));

    // 每日領取
    this.dailyBtn = el('button', {
      class: 'primary',
      onClick: () => {
        const r = claimDaily();
        if (r.ok) toast(`已領取：🎟️ +${r.reward.tickets}　🪙 +${r.reward.gold}`);
        this._updateDaily();
      },
    });
    this.root.appendChild(this.dailyBtn);
    this._updateDaily();

    // 戰鬥速度
    const speedWrap = el('div', { class: 'hud-currency' });
    [1, 2, 3].forEach((x) => {
      const b = el('button', {
        text: `${x}×`,
        class: this.getSpeed() === x ? 'active' : '',
        onClick: () => {
          this.onSpeedChange?.(x);
          this.render();
        },
      });
      if (this.getSpeed() === x) b.style.borderColor = 'var(--accent)';
      speedWrap.appendChild(b);
    });
    this.root.appendChild(speedWrap);

    // 清檔
    this.root.appendChild(
      el('button', {
        text: '重置存檔',
        onClick: () => {
          if (confirm('確定要清除存檔並重新開始嗎？')) {
            resetGame();
            this.onReset?.();
            toast('已重置存檔');
          }
        },
      })
    );
  }

  _updateDaily() {
    if (!this.dailyBtn) return;
    if (isClaimable()) {
      this.dailyBtn.textContent = '🎁 領取每日獎勵';
      this.dailyBtn.disabled = false;
      this.dailyBtn.classList.add('daily-ready');
    } else {
      this.dailyBtn.textContent = `下次發放 ${fmtCountdown(msUntilNext())}`;
      this.dailyBtn.disabled = true;
      this.dailyBtn.classList.remove('daily-ready');
    }
  }
}

function currency(icon, value, title) {
  return el('div', { class: 'hud-currency', title }, [
    el('span', { class: 'icon', text: icon }),
    el('span', { text: String(value) }),
  ]);
}
