// 競技場頁：異步 PvP。連線＝伺服器真人快照；離線＝本地機器人（規則相同）。
// 挑戰 → （伺服器/本地）模擬 log → 既有戰場回放 → 回來結算積分。
import { el, clear, toast, fmt } from './dom.js';
import { store } from '../core/state.js';
import { saveGame } from '../core/save.js';
import { nav } from './router.js';
import { api, net } from '../net/api.js';
import {
  FREE_PER_DAY, tierOf, formationSnapshot,
  localCandidates, localRefresh, localChallenge, localReplay,
} from '../systems/arenaLocal.js';
import { openPlayerCard, playerAvatar } from './profileCard.js';
import { openModal } from './modal.js';
import { CARDS } from '../data/cards.js';
import { cardFrame } from './cardFrame.js';

const REFRESH_GOLD = 1000;

export class ArenaUI {
  constructor(root, battle) {
    this.root = root;
    this.battle = battle; // BattleController（回放用）
    this.data = null;     // 候選資料（連線或本地）
    this._busy = false;
  }

  onShow() {
    this.refresh();
  }

  async refresh() {
    // 防守隊沒設 → 預設用目前上陣隊伍（無感初始化）
    const s = store.state;
    if (!s.arena.defense?.length && s.formation.length) {
      s.arena.defense = formationSnapshot(s);
      saveGame();
      if (net.authed) api.put('/api/arena/defense', { snapshot: s.arena.defense }).catch(() => {});
    }
    this.data = null;
    this.render();
    try {
      if (net.authed) {
        this.data = await api.get('/api/arena/candidates');
        // 伺服器積分為準，同步回本地（離線時延續）
        s.arena.rating = this.data.rating;
        saveGame();
      } else {
        this.data = localCandidates();
      }
    } catch {
      this.data = localCandidates();
    }
    this.render();
  }

  render() {
    clear(this.root);
    this.root.appendChild(el('div', { class: 'back-btn pressable', text: '🏠', title: '回主城', onClick: () => nav.go('home') }));
    this.root.appendChild(el('div', { class: 'page-title left', text: '競技場' }));

    const s = store.state;
    const d = this.data;
    const rating = d?.rating ?? s.arena.rating;
    const tier = tierOf(rating);
    const used = d?.daily?.used ?? s.arena.used ?? 0;

    // 頂欄：段位積分 + 次數 + 離線標記
    const top = el('div', { class: 'ar-top' }, [
      el('div', { class: 'ar-tier' }, [
        el('span', { class: 'ic', text: tier.icon }),
        el('div', {}, [
          el('div', { class: 't1', text: `${tier.name}` }),
          el('div', { class: 't2', text: `${rating} 分` }),
        ]),
      ]),
      el('div', { class: 'ar-daily', text: `今日挑戰 ${Math.max(0, FREE_PER_DAY - used)}/${FREE_PER_DAY}` }),
      el('div', { class: `ar-net ${net.authed ? 'on' : ''}`, text: net.authed ? '● 已連線' : '○ 離線（機器人對手）' }),
    ]);
    this.root.appendChild(top);

    const body = el('div', { class: 'ar-body' });

    // 左：對手候選
    const left = el('div', { class: 'ar-list' });
    if (!d) {
      left.appendChild(el('div', { class: 'ar-empty', text: '搜尋對手中…' }));
    } else {
      for (const foe of d.list) left.appendChild(this._foeCard(foe));
      left.appendChild(
        el('button', {
          class: 'btn ar-refresh pressable',
          text: `🔄 刷新對手（${fmt(REFRESH_GOLD)} 金幣）`,
          onClick: () => this._refreshFoes(),
        })
      );
    }
    body.appendChild(left);

    // 右：我的防守隊 + 入口
    const right = el('div', { class: 'ar-side' });
    right.appendChild(el('div', { class: 'ar-sub', text: '我的防守隊' }));
    const defGrid = el('div', { class: 'ar-defgrid' });
    for (const e of [...(s.arena.defense ?? [])].sort((a, b) => a.pos - b.pos)) {
      const card = CARDS[e.cardId];
      if (card) defGrid.appendChild(cardFrame(card, { level: e.level, stars: e.stars, size: 'mini' }));
    }
    if (!s.arena.defense?.length) defGrid.appendChild(el('div', { class: 'ar-empty', text: '尚未設定' }));
    right.appendChild(defGrid);
    right.appendChild(
      el('button', {
        class: 'btn pressable',
        text: '🛡 用目前隊伍當防守隊',
        onClick: () => this._setDefense(),
      })
    );
    right.appendChild(el('div', { class: 'ar-links' }, [
      el('button', { class: 'btn pressable', text: '🏆 排行榜', onClick: () => this._openLeaderboard() }),
      el('button', { class: 'btn pressable', text: '📜 戰報', onClick: () => this._openReports() }),
    ]));
    body.appendChild(right);
    this.root.appendChild(body);
  }

  _foeCard(foe) {
    const node = el('div', { class: 'ar-foe' });
    const head = el('div', { class: 'ar-foehead pressable' });
    head.appendChild(playerAvatar(foe.avatarCardId, { size: 40 }));
    head.appendChild(el('div', { class: 'col' }, [
      el('div', { class: 'n', text: foe.nickname }),
      el('div', { class: 'r', text: `${tierOf(foe.rating).icon} ${foe.rating} 分` }),
    ]));
    head.addEventListener('click', () => openPlayerCard(foe));
    node.appendChild(head);
    // 防守隊縮圖（看陣容判強弱是玩法的一部分）
    const mini = el('div', { class: 'ar-foedef' });
    for (const e of [...(foe.defense ?? [])].sort((a, b) => a.pos - b.pos).slice(0, 6)) {
      const card = CARDS[e.cardId];
      if (card) mini.appendChild(cardFrame(card, { level: e.level, size: 'mini' }));
    }
    node.appendChild(mini);
    node.appendChild(el('button', { class: 'btn btn-gold pressable', text: '⚔ 挑戰', onClick: () => this._challenge(foe) }));
    return node;
  }

  async _challenge(foe) {
    if (this._busy) return;
    const s = store.state;
    const attack = formationSnapshot(s);
    if (!attack.length) { toast('請先到「隊伍」編排上陣'); return; }
    this._busy = true;
    try {
      let res;
      if (net.authed && this.data && !this.data.offline) {
        res = await api.post('/api/arena/challenge', { opponentId: foe.playerId, defense: foe.defense, attack });
        s.arena.rating = res.rating;
        s.arena.used = res.dailyUsed;
        saveGame();
      } else {
        res = localChallenge(foe, attack);
      }
      // 回放：切到戰場播 log，播完回來結算
      nav.go('battle');
      this.battle.playCustom({ setup: res.setup, log: res.log }, {
        title: '競技場',
        onDone: () => {
          nav.go('arena');
          this._showResult(res, foe);
          this.refresh();
        },
      });
    } catch (err) {
      toast(err.message ?? '挑戰失敗');
      if (err.offline) this.refresh(); // 掉線 → 轉離線模式重抓
    } finally {
      this._busy = false;
    }
  }

  _showResult(res, foe) {
    openModal({
      className: 'ov-arena-result',
      build: (panel, close) => {
        panel.appendChild(el('div', { class: 'ov-title', text: res.win ? '🏆 勝利' : '💤 惜敗' }));
        panel.appendChild(el('div', { class: 'arr-line', text: `對手：${foe.nickname}` }));
        panel.appendChild(el('div', {
          class: `arr-delta ${res.delta >= 0 ? 'up' : 'down'}`,
          text: `${res.delta >= 0 ? '+' : ''}${res.delta} 分 → ${res.rating}（${tierOf(res.rating).name}）`,
        }));
        panel.appendChild(el('button', { class: 'btn btn-gold', text: '確定', onClick: () => close() }));
      },
    });
  }

  async _refreshFoes() {
    const s = store.state;
    if ((s.currencies.gold || 0) < REFRESH_GOLD) { toast('金幣不足'); return; }
    s.currencies.gold -= REFRESH_GOLD;
    saveGame();
    store.notify();
    if (!net.authed) localRefresh();
    await this.refresh();
  }

  async _setDefense() {
    const s = store.state;
    const snap = formationSnapshot(s);
    if (!snap.length) { toast('請先到「隊伍」編排上陣'); return; }
    s.arena.defense = snap;
    saveGame();
    if (net.authed) {
      try { await api.put('/api/arena/defense', { snapshot: snap }); } catch { /* 離線靜默 */ }
    }
    toast('防守隊已更新', { icon: '🛡' });
    this.render();
  }

  async _openLeaderboard() {
    let list = null;
    try {
      if (net.authed) list = await api.get('/api/arena/leaderboard');
    } catch { /* fall through */ }
    openModal({
      className: 'ov-arena-board',
      build: (panel, close) => {
        panel.appendChild(el('button', { class: 'ov-close', text: '✕', onClick: () => close() }));
        panel.appendChild(el('div', { class: 'ov-title', text: '🏆 排行榜' }));
        if (!list) {
          panel.appendChild(el('div', { class: 'ar-empty', text: '離線模式沒有排行榜——連線後看看你排第幾！' }));
          return;
        }
        const box = el('div', { class: 'arb-list' });
        list.forEach((p, i) => {
          const row = el('div', { class: 'arb-row pressable' }, [
            el('span', { class: 'rk', text: `${i + 1}` }),
            playerAvatar(p.avatarCardId, { size: 30 }),
            el('span', { class: 'nm', text: p.nickname }),
            el('span', { class: 'rt', text: `${tierOf(p.rating).icon} ${p.rating}` }),
          ]);
          row.addEventListener('click', () => openPlayerCard(p));
          box.appendChild(row);
        });
        panel.appendChild(box);
      },
    });
  }

  async _openReports() {
    let list = store.state.arena.reports ?? [];
    try {
      if (net.authed) list = await api.get('/api/arena/reports');
    } catch { /* 用本地 */ }
    openModal({
      className: 'ov-arena-board',
      build: (panel, close) => {
        panel.appendChild(el('button', { class: 'ov-close', text: '✕', onClick: () => close() }));
        panel.appendChild(el('div', { class: 'ov-title', text: '📜 戰報' }));
        if (!list.length) {
          panel.appendChild(el('div', { class: 'ar-empty', text: '還沒有戰報——去挑戰第一場吧！' }));
          return;
        }
        const box = el('div', { class: 'arb-list' });
        for (const r of list) {
          const when = new Date(r.at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          const row = el('div', { class: 'arb-row' }, [
            el('span', { class: `res ${r.win ? 'w' : 'l'}`, text: r.win ? '勝' : '敗' }),
            el('span', { class: 'nm', text: `${r.side === 'defense' ? '🛡 ' : '⚔ '}${r.foe?.nickname ?? '對手'}` }),
            el('span', { class: 'rt', text: `${r.delta >= 0 ? '+' : ''}${r.delta}` }),
            el('span', { class: 'tm', text: when }),
            el('button', { class: 'btn pressable', text: '▶ 觀看', onClick: () => { close(); this._replay(r); } }),
          ]);
          box.appendChild(row);
        }
        panel.appendChild(box);
      },
    });
  }

  _replay(report) {
    // seed + 雙方快照 → 重跑同一場（確定性引擎，重播即還原）
    try {
      const sim = localReplay(report);
      nav.go('battle');
      this.battle.playCustom({ setup: sim.setup, log: sim.log }, {
        title: '戰報回放',
        onDone: () => nav.go('arena'),
      });
    } catch {
      toast('此戰報無法回放');
    }
  }
}
