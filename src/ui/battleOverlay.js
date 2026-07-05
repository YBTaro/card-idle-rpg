// 戰鬥畫面 DOM 資訊層（依戰鬥參考原型）：
// 左上我方頭像+隊伍血量匯總、右上敵方鏡像、上中關卡菱標、左下回合圓章、
// 右下戰速/跳過菱形鈕、底部戰報 ticker、勝敗橫幅（勝利金幣飛入 / 戰敗導流調整陣容）。
import { gsap } from 'gsap';
import { el, clear } from './dom.js';
import { icon } from './icons.js';
import { store } from '../core/state.js';
import { nav } from './router.js';
import { stageLabel } from '../systems/profile.js';
import { avatarEl } from './metaSheets.js';
import { weatherOf, terrainOf, envLabelOf, envDescOf } from '../battle/environments.js';
import { buffLabel } from '../battle/skillText.js';
import { ELEMENT_LABEL } from '../data/elements.js';

const ELEMENT_HEX = { fire: '#ff7d5c', wind: '#7fe497', water: '#6cb2ff', light: '#ffe789', dark: '#bb8cff' };
const CLASS_GLYPH = { tank: '🛡', dps: '⚔', support: '✚' };

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

    this.root.appendChild(el('div', { class: 'back-btn pressable', title: '回主城', onClick: () => nav.go('home') }, [icon('back', 22)]));

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

    // 上中：關卡菱標 + 環境徽章（天氣/場地；hover 看效果說明）
    this.waveText = el('span', { text: '1-1' });
    this.root.appendChild(el('div', { class: 'bo-wave' }, [this.waveText]));
    this.envChip = el('div', { class: 'bo-env' });
    this.root.appendChild(this.envChip);

    // 右上下方：敵情條（敵方 5 人屬性/職業/等級一眼掌握——屬性剋制策略的情報來源）
    this.foesStrip = el('div', { class: 'bo-foes' });
    this.root.appendChild(this.foesStrip);

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

  // 每場開打時同步靜態資訊。title 有值＝自訂回放（競技場/切磋/公會 Boss）。
  // enemies＝敵方單位摘要 [{name, element, class, level}]（敵情條）。
  setBattle({ stage, title = null, env = null, enemies = [] }) {
    const label = stageLabel(stage);
    this.waveText.textContent = title ?? label;
    this.nmLeft.textContent = '我方';
    this.nmRight.textContent = title ? '對手' : `西境軍 ${label}`;
    clear(this.avaLeft);
    this.avaLeft.appendChild(avatarEl());
    this.setEnv(env);
    this.hideResult();
    this.hideUnitStatus();
    this.hideStatsPanel();
    // 敵情條
    clear(this.foesStrip);
    for (const f of enemies) {
      this.foesStrip.appendChild(el('div', { class: 'bo-foe', title: `${f.name}（${ELEMENT_LABEL[f.element] ?? ''}）` }, [
        el('i', { style: `background:${ELEMENT_HEX[f.element] ?? '#999'}` }),
        el('span', { text: CLASS_GLYPH[f.class] ?? '' }),
        el('b', { text: `Lv${f.level}` }),
      ]));
    }
    this.foesStrip.classList.toggle('on', enemies.length > 0);
  }

  // ---- 單位狀態面板（點戰鬥中的棋子 → 目前狀態清單） ----
  showUnitStatus({ name, element, cls, level, buffs }) {
    this.hideUnitStatus();
    const panel = el('div', { class: 'bo-unitpanel' });
    panel.appendChild(el('div', { class: 'up-head' }, [
      el('i', { style: `background:${ELEMENT_HEX[element] ?? '#999'}` }),
      el('b', { text: `${name}` }),
      el('span', { text: ` ${CLASS_GLYPH[cls] ?? ''} Lv${level}` }),
      el('button', { class: 'up-close pressable', text: '✕', onClick: () => this.hideUnitStatus() }),
    ]));
    if (!buffs.length) {
      panel.appendChild(el('div', { class: 'up-empty', text: '目前沒有任何狀態' }));
    }
    for (const b of buffs) {
      panel.appendChild(el('div', { class: `up-row${b.neg ? ' neg' : ''}` }, [
        el('span', { class: 'lb', text: buffLabel(b) }),
        el('span', {
          class: 'tn',
          text: b.kind === 'debuffBlock' && b.charges != null ? `${b.charges} 層`
            : b.turns != null ? `${b.turns} 回合` : '常駐',
        }),
      ]));
    }
    this.root.appendChild(panel);
    this._unitPanel = panel;
    gsap.fromTo(panel, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.16, ease: 'power2.out' });
  }

  hideUnitStatus() {
    this._unitPanel?.remove();
    this._unitPanel = null;
  }

  // ---- 戰鬥統計面板（結算的「詳情」）：輸出/承傷/治療 三排行 ----
  // onClose：面板收起時回呼（controller 靠它恢復自動開下一場）。
  showStatsPanel(rows, onClose = null) {
    this.hideUnitStatus();
    this.hideStatsPanel();
    const panel = el('div', { class: 'bo-stats' });
    panel._onClose = onClose;
    panel.appendChild(el('button', { class: 'up-close pressable', text: '✕', onClick: () => this.hideStatsPanel() }));
    panel.appendChild(el('div', { class: 'st-title', text: '戰鬥統計' }));
    const cols = el('div', { class: 'st-cols' });
    const mkCol = (title, key, color) => {
      const box = el('div', { class: 'st-col' });
      box.appendChild(el('div', { class: 'st-h', style: `color:${color}`, text: title }));
      const sorted = [...rows].sort((a, b) => b[key] - a[key]).filter((r) => r[key] > 0).slice(0, 5);
      if (!sorted.length) box.appendChild(el('div', { class: 'up-empty', text: '—' }));
      for (const r of sorted) {
        box.appendChild(el('div', { class: 'st-row' }, [
          el('i', { style: `background:${ELEMENT_HEX[r.element] ?? '#999'}` }),
          el('span', { class: 'nm', text: r.name }),
          el('b', { text: r[key].toLocaleString() }),
        ]));
      }
      return box;
    };
    cols.appendChild(mkCol('輸出', 'dealt', '#ff9a5c'));
    cols.appendChild(mkCol('承傷', 'taken', '#8ecfe8'));
    cols.appendChild(mkCol('治療', 'healed', '#8ef2ae'));
    panel.appendChild(cols);
    this.root.appendChild(panel);
    this._statsPanel = panel;
    gsap.fromTo(panel, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out' });
  }

  hideStatsPanel() {
    const p = this._statsPanel;
    if (!p) return;
    this._statsPanel = null;
    p.remove();
    p._onClose?.();
  }

  // 環境徽章：天氣/場地色點 + 名稱；戰鬥中被技能覆蓋時即時更新（controller 轉發事件）。
  setEnv(ids) {
    clear(this.envChip);
    const has = !!(ids?.weather || ids?.terrain);
    this.envChip.classList.toggle('on', has);
    if (!has) return;
    this.envChip.title = envDescOf(ids.weather, ids.terrain);
    const w = weatherOf(ids.weather);
    const t = terrainOf(ids.terrain);
    if (w) this.envChip.appendChild(el('i', { style: `background:${w.color}` }));
    if (t) this.envChip.appendChild(el('i', { style: `background:${t.color}` }));
    this.envChip.appendChild(el('span', { text: envLabelOf(ids.weather, ids.terrain) }));
  }

  // 每 tick 呼叫，但只在值變化時寫 DOM（避免每幀 style/layout 重算、
  // 也避免血量條的 CSS transition 被連續重啟而永遠走不完）。
  update({ round, hpRatio0, hpRatio1, aliveA, aliveB }) {
    const c = (this._cache ??= {});
    if (round !== c.round) {
      c.round = round;
      this.roundEl.textContent = `R${round}`;
    }
    const w0 = Math.max(0, Math.round(hpRatio0 * 1000) / 10);
    if (w0 !== c.w0) {
      c.w0 = w0;
      this.gaugeLeft.style.width = `${w0}%`;
    }
    const w1 = Math.max(0, Math.round(hpRatio1 * 1000) / 10);
    if (w1 !== c.w1) {
      c.w1 = w1;
      this.gaugeRight.style.width = `${w1}%`;
    }
    if (aliveA !== c.aliveA || aliveB !== c.aliveB) {
      c.aliveA = aliveA;
      c.aliveB = aliveB;
      this.ticker.textContent = `我方 ${aliveA} vs 敵方 ${aliveB}`;
    }
  }

  setNotice(text) {
    this.ticker.innerHTML = '';
    this.ticker.textContent = text;
  }

  // 勝敗橫幅。result: { win, draw?, gold?, nextStage?, cooldown }
  showResult(result) {
    this.hideResult();
    const node = el('div', { class: `bo-result ${result.win ? 'win' : 'lose'}` });
    if (result.custom) {
      // 自訂回放（競技場等）：不顯示推關文案，結算交回呼叫方頁面
      node.appendChild(el('div', { class: 'vt', text: result.win ? 'VICTORY' : result.draw ? 'DRAW' : 'DEFEAT' }));
      node.appendChild(el('div', { class: 'vr', text: `${result.title ?? ''} 結算中…` }));
    } else if (result.win) {
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
    // 戰鬥統計入口（controller 傳 onStats 才顯示）
    if (result.onStats) {
      node.appendChild(el('button', { class: 'btn pressable', text: '📊 戰鬥詳情', onClick: result.onStats }));
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
