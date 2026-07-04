// 好友頁：搜尋/邀請/列表/一鍵送收/切磋/友情點商店。純連線功能，離線顯示提示。
import { el, clear, toast, fmt } from './dom.js';
import { icon } from './icons.js';
import { staggerIn } from './anim.js';
import { store } from '../core/state.js';
import { saveGame } from '../core/save.js';
import { nav } from './router.js';
import { api, net } from '../net/api.js';
import { openPlayerCard, playerAvatar } from './profileCard.js';
import { openModal } from './modal.js';
import { formationSnapshot } from '../systems/arenaLocal.js';
import { stageLabel } from '../systems/profile.js';

export class FriendsUI {
  constructor(root, battle) {
    this.root = root;
    this.battle = battle;
    this.friends = null;
    this.requests = [];
    this.points = { balance: 0, pending: 0 };
  }

  onShow() { this.refresh(); }

  async refresh() {
    this.friends = null;
    this.render();
    if (!net.authed) { this.render(); return; }
    try {
      [this.friends, this.requests, this.points] = await Promise.all([
        api.get('/api/friends'),
        api.get('/api/friends/requests'),
        api.get('/api/friends/points'),
      ]);
    } catch { this.friends = null; }
    this.render();
  }

  render() {
    clear(this.root);
    this.root.appendChild(el('div', { class: 'back-btn pressable', title: '回主城', onClick: () => nav.go('home') }, [icon('home', 22)]));
    this.root.appendChild(el('div', { class: 'page-title left', text: '好友' }));

    if (!net.authed) {
      this.root.appendChild(offlineHint('好友功能需要連線——啟動遊戲伺服器後自動接通。'));
      return;
    }

    // 頂欄：搜尋 + 邀請 + 友情點
    const top = el('div', { class: 'fr-top' });
    const searchIn = el('input', { class: 'pc-input fr-search', placeholder: '搜尋玩家暱稱…' });
    searchIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._search(searchIn.value); });
    top.appendChild(searchIn);
    top.appendChild(el('button', { class: 'btn pressable', text: '🔍', onClick: () => this._search(searchIn.value) }));
    const reqBtn = el('button', { class: 'btn pressable', text: `✉ 邀請 ${this.requests.length}`, onClick: () => this._openRequests() });
    if (this.requests.length) reqBtn.classList.add('btn-gold');
    top.appendChild(reqBtn);
    top.appendChild(el('div', { class: 'fr-points', text: `♥ 友情點 ${fmt(this.points.balance)}` }));
    top.appendChild(el('button', { class: 'btn pressable', text: '🛍 商店', onClick: () => this._openShop() }));
    this.root.appendChild(top);

    // 一鍵送收
    const giftRow = el('div', { class: 'fr-gifts' }, [
      el('button', { class: 'btn btn-gold pressable', text: '♥ 一鍵全送', onClick: () => this._sendAll() }),
      el('button', {
        class: `btn pressable${this.points.pending ? ' btn-gold' : ''}`,
        text: `🎁 領取（${this.points.pending}）`,
        onClick: () => this._claimAll(),
      }),
    ]);
    this.root.appendChild(giftRow);

    // 好友列表
    const list = el('div', { class: 'fr-list' });
    if (!this.friends) {
      list.appendChild(el('div', { class: 'ar-empty', text: '載入中…' }));
    } else if (this.friends.length === 0) {
      list.appendChild(el('div', { class: 'ar-empty', text: '還沒有好友——搜尋暱稱把朋友加進來吧！' }));
    } else {
      for (const f of this.friends) {
        const row = el('div', { class: 'fr-row' });
        const head = el('div', { class: 'fr-head pressable' }, [
          playerAvatar(f.avatarCardId, { size: 40 }),
          el('div', { class: 'col' }, [
            el('div', { class: 'n', text: f.nickname }),
            el('div', { class: 'r', text: `章節 ${stageLabel(f.stage || 1)} · ${sinceLabel(f.lastSeen)}` }),
          ]),
        ]);
        head.addEventListener('click', () => openPlayerCard(f, { onSpar: f.defense ? (p) => this._spar(p) : null }));
        row.appendChild(head);
        row.appendChild(el('div', { class: 'fr-acts' }, [
          el('span', { class: `fr-gift ${f.giftSentToday ? 'sent' : ''}`, text: f.giftSentToday ? '♥ 已送' : '' }),
          f.defense ? el('button', { class: 'btn pressable', text: '⚔ 切磋', onClick: () => this._spar(f) }) : el('span'),
          el('button', { class: 'btn pressable', text: '🗑', title: '刪除好友', onClick: () => this._remove(f) }),
        ]));
        list.appendChild(row);
      }
    }
    this.root.appendChild(list);
    staggerIn(list.children, { dy: 14, step: 0.05 });
  }

  async _search(q) {
    if (!q.trim()) return;
    try {
      const found = await api.get(`/api/friends/search?q=${encodeURIComponent(q.trim())}`);
      openModal({
        className: 'ov-arena-board',
        build: (panel, close) => {
          panel.appendChild(el('button', { class: 'ov-close', text: '✕', onClick: () => close() }));
          panel.appendChild(el('div', { class: 'ov-title', text: `搜尋「${q.trim()}」` }));
          if (!found.length) { panel.appendChild(el('div', { class: 'ar-empty', text: '找不到玩家' })); return; }
          const box = el('div', { class: 'arb-list' });
          for (const p of found) {
            box.appendChild(el('div', { class: 'arb-row' }, [
              playerAvatar(p.avatarCardId, { size: 30 }),
              el('span', { class: 'nm', text: p.nickname }),
              el('span', { class: 'rt', text: `章節 ${stageLabel(p.stage || 1)}` }),
              p.isFriend
                ? el('span', { class: 'tm', text: '已是好友' })
                : el('button', {
                    class: 'btn btn-gold pressable', text: '＋ 加好友',
                    onClick: async () => {
                      try {
                        const r = await api.post('/api/friends/requests', { to: p.playerId });
                        toast(r.accepted ? '雙方互加，直接成為好友！' : '邀請已送出', { icon: '✉' });
                        close();
                        this.refresh();
                      } catch (err) { toast(err.message); }
                    },
                  }),
            ]));
          }
          panel.appendChild(box);
        },
      });
    } catch (err) { toast(err.message ?? '搜尋失敗'); }
  }

  _openRequests() {
    openModal({
      className: 'ov-arena-board',
      build: (panel, close) => {
        panel.appendChild(el('button', { class: 'ov-close', text: '✕', onClick: () => close() }));
        panel.appendChild(el('div', { class: 'ov-title', text: '✉ 好友邀請' }));
        if (!this.requests.length) { panel.appendChild(el('div', { class: 'ar-empty', text: '沒有待處理邀請' })); return; }
        const box = el('div', { class: 'arb-list' });
        for (const p of this.requests) {
          box.appendChild(el('div', { class: 'arb-row' }, [
            playerAvatar(p.avatarCardId, { size: 30 }),
            el('span', { class: 'nm', text: p.nickname }),
            el('button', { class: 'btn btn-gold pressable', text: '同意', onClick: () => this._respond(p, true, close) }),
            el('button', { class: 'btn pressable', text: '拒絕', onClick: () => this._respond(p, false, close) }),
          ]));
        }
        panel.appendChild(box);
      },
    });
  }

  async _respond(p, accept, close) {
    try {
      await api.post('/api/friends/respond', { from: p.playerId, accept });
      toast(accept ? `已和 ${p.nickname} 成為好友` : '已拒絕');
      close();
      this.refresh();
    } catch (err) { toast(err.message); }
  }

  async _sendAll() {
    try {
      const r = await api.post('/api/friends/gifts/send');
      toast(r.sent ? `已送出 ${r.sent} 份友情點` : '今天都送過了', { icon: '♥' });
      this.refresh();
    } catch (err) { toast(err.message); }
  }

  async _claimAll() {
    try {
      const r = await api.post('/api/friends/gifts/claim');
      toast(r.claimed ? `領取 ${r.claimed} 友情點` : '沒有待領的禮物', { icon: '🎁' });
      this.refresh();
    } catch (err) { toast(err.message); }
  }

  async _remove(f) {
    try {
      await api.del(`/api/friends/${f.playerId}`);
      toast(`已刪除 ${f.nickname}`);
      this.refresh();
    } catch (err) { toast(err.message); }
  }

  async _spar(f) {
    const attack = formationSnapshot(store.state);
    if (!attack.length) { toast('請先到「隊伍」編排上陣'); return; }
    try {
      const sim = await api.post('/api/friends/spar', { opponentId: f.playerId, attack });
      nav.go('battle');
      this.battle.playCustom({ setup: sim.setup, log: sim.log }, {
        title: '好友切磋',
        onDone: () => { nav.go('friends'); toast(sim.winner === 0 ? '切磋獲勝！' : '技不如人，回去練練', { icon: '⚔' }); },
      });
    } catch (err) { toast(err.message ?? '切磋失敗'); }
  }

  async _openShop() {
    try {
      const items = await api.get('/api/friends/shop');
      openModal({
        className: 'ov-arena-board',
        build: (panel, close) => {
          panel.appendChild(el('button', { class: 'ov-close', text: '✕', onClick: () => close() }));
          panel.appendChild(el('div', { class: 'ov-title', text: `🛍 友情點商店（♥ ${this.points.balance}）` }));
          const box = el('div', { class: 'arb-list' });
          for (const it of items) {
            box.appendChild(el('div', { class: 'arb-row' }, [
              el('span', { class: 'nm', text: it.name }),
              el('span', { class: 'rt', text: `♥ ${it.cost}` }),
              el('button', {
                class: 'btn btn-gold pressable', text: '兌換',
                onClick: async () => {
                  try {
                    const r = await api.post('/api/friends/shop/buy', { itemId: it.id });
                    grantRewards(r.grants);
                    this.points.balance = r.balance;
                    toast('兌換成功', { icon: '✅' });
                    close();
                    this.render();
                  } catch (err) { toast(err.message); }
                },
              }),
            ]));
          }
          panel.appendChild(box);
        },
      });
    } catch (err) { toast(err.message ?? '商店載入失敗'); }
  }
}

// 伺服器回報的獎勵 → 入本地帳（gold/essence/tickets）。
export function grantRewards(grants = {}) {
  const s = store.state;
  if (grants.gold) s.currencies.gold += grants.gold;
  if (grants.tickets) s.currencies.tickets += grants.tickets;
  if (grants.essence) s.inventory.materials.essence = (s.inventory.materials.essence || 0) + grants.essence;
  saveGame();
  store.notify();
}

export function offlineHint(text) {
  return el('div', { class: 'net-offline' }, [
    el('div', { class: 'ic', text: '📡' }),
    el('div', { class: 't', text }),
    el('div', { class: 'd', text: '開發模式：另開終端執行 npm run server，重新整理即可連線。' }),
  ]);
}

function sinceLabel(ts) {
  if (!ts) return '離線';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 3) return '在線 ●';
  if (m < 60) return `${m} 分鐘前`;
  if (m < 1440) return `${Math.floor(m / 60)} 小時前`;
  return `${Math.floor(m / 1440)} 天前`;
}
