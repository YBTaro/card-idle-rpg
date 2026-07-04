// 公會頁：未入會＝公會列表/創建；入會＝主頁（簽到/捐獻/商店/成員/留言板/Boss）。
// 經濟閉環：金幣（本地扣）→ 公會幣（伺服器記）→ 精華/召喚券（伺服器回報、本地入帳）。
import { el, clear, toast, fmt } from './dom.js';
import { icon } from './icons.js';
import { staggerIn } from './anim.js';
import { store } from '../core/state.js';
import { saveGame } from '../core/save.js';
import { nav } from './router.js';
import { api, net } from '../net/api.js';
import { openModal, confirmSheet } from './modal.js';
import { openPlayerCard, playerAvatar } from './profileCard.js';
import { formationSnapshot } from '../systems/arenaLocal.js';
import { grantRewards, offlineHint } from './friendsUI.js';

const CREATE_COST = 50000;
const ROLE_LABEL = { leader: '會長', officer: '副會長', member: '成員' };

export class GuildUI {
  constructor(root, battle) {
    this.root = root;
    this.battle = battle;
    this.guild = undefined; // undefined=載入中, null=未入會, object=公會視圖
  }

  onShow() { this.refresh(); }

  async refresh() {
    this.guild = undefined;
    this.render();
    if (!net.authed) { this.render(); return; }
    try {
      this.guild = (await api.get('/api/guild')).guild;
    } catch { this.guild = undefined; }
    this.render();
  }

  render() {
    clear(this.root);
    this.root.appendChild(el('div', { class: 'back-btn pressable', title: '回主城', onClick: () => nav.go('home') }, [icon('home', 22)]));
    this.root.appendChild(el('div', { class: 'page-title left', text: '公會' }));

    if (!net.authed) { this.root.appendChild(offlineHint('公會功能需要連線。')); return; }
    if (this.guild === undefined) { this.root.appendChild(el('div', { class: 'ar-empty', text: '載入中…' })); return; }
    if (this.guild === null) { this._renderBrowse(); return; }
    this._renderHome();
  }

  /* ---------------- 未入會：瀏覽/創建 ---------------- */
  async _renderBrowse() {
    const wrap = el('div', { class: 'gd-browse' });
    wrap.appendChild(el('div', { class: 'ar-sub', text: '加入一個公會，一起簽到、捐獻、討伐公會 Boss！' }));
    const listBox = el('div', { class: 'gd-list' }, [el('div', { class: 'ar-empty', text: '載入公會列表…' })]);
    wrap.appendChild(listBox);
    wrap.appendChild(el('button', {
      class: 'btn btn-gold pressable',
      text: `🏰 創建公會（${fmt(CREATE_COST)} 金幣）`,
      onClick: () => this._create(),
    }));
    this.root.appendChild(wrap);

    try {
      const guilds = await api.get('/api/guilds');
      clear(listBox);
      requestAnimationFrame(() => staggerIn(listBox.children, { dy: 14, step: 0.05 }));
      if (!guilds.length) listBox.appendChild(el('div', { class: 'ar-empty', text: '還沒有公會——當第一位會長吧！' }));
      for (const g of guilds) {
        listBox.appendChild(el('div', { class: 'gd-row' }, [
          el('div', { class: 'col' }, [
            el('div', { class: 'n', text: `${g.name} · Lv${g.level}` }),
            el('div', { class: 'r', text: `成員 ${g.members}/${g.cap}${g.notice ? ' · ' + g.notice : ''}` }),
          ]),
          el('button', {
            class: 'btn btn-gold pressable',
            text: g.joinMode === 'approval' ? '申請加入' : '加入',
            onClick: async () => {
              try {
                const r = await api.post('/api/guild/join', { guildId: g.id });
                toast(r.pending ? '已送出申請，等待審核' : `歡迎加入 ${g.name}！`, { icon: '🏰' });
                this.refresh();
              } catch (err) { toast(err.message); }
            },
          }),
        ]));
      }
    } catch (err) {
      clear(listBox);
      listBox.appendChild(el('div', { class: 'ar-empty', text: err.message ?? '載入失敗' }));
    }
  }

  _create() {
    const s = store.state;
    if ((s.currencies.gold || 0) < CREATE_COST) { toast('金幣不足（需 50,000）'); return; }
    openModal({
      className: 'ov-playercard',
      build: (panel, close) => {
        panel.appendChild(el('div', { class: 'ov-title', text: '創建公會' }));
        const nameIn = el('input', { class: 'pc-input', maxlength: '12', placeholder: '公會名稱（12 字內）' });
        panel.appendChild(nameIn);
        let approval = false;
        const modeBtn = el('button', { class: 'btn pressable', text: '加入方式：自由加入', onClick: () => {
          approval = !approval;
          modeBtn.textContent = `加入方式：${approval ? '審核制' : '自由加入'}`;
        }});
        panel.appendChild(modeBtn);
        panel.appendChild(el('div', { class: 'pc-actions' }, [
          el('button', {
            class: 'btn btn-gold', text: `創建（${fmt(CREATE_COST)} 金幣）`,
            onClick: async () => {
              try {
                await api.post('/api/guilds', { name: nameIn.value, joinMode: approval ? 'approval' : 'free' });
                s.currencies.gold -= CREATE_COST;
                saveGame();
                store.notify();
                toast('公會創建成功！', { icon: '🏰' });
                close();
                this.refresh();
              } catch (err) { toast(err.message); }
            },
          }),
        ]));
      },
    });
  }

  /* ---------------- 入會：公會主頁 ---------------- */
  _renderHome() {
    const g = this.guild;
    const day = new Date().toISOString().slice(0, 10);

    // 頂欄
    this.root.appendChild(el('div', { class: 'gd-top' }, [
      el('div', { class: 'gd-name', text: `🏰 ${g.name}` }),
      el('div', { class: 'gd-meta', text: `Lv${g.level} · 成員 ${g.members.length}/30 · 我的公會幣 ${fmt(g.myCoins)}` }),
    ]));

    const body = el('div', { class: 'gd-body' });

    // 左欄：動作
    const left = el('div', { class: 'gd-side' });
    left.appendChild(el('button', {
      class: `btn pressable${g.mySignin === day ? '' : ' btn-gold'}`,
      text: g.mySignin === day ? '✓ 今日已簽到' : '📅 公會簽到',
      onClick: () => this._signin(),
    }));
    left.appendChild(el('button', {
      class: `btn pressable${g.myDonate === day ? '' : ' btn-gold'}`,
      text: g.myDonate === day ? '✓ 今日已捐獻' : '💰 捐獻',
      onClick: () => this._donate(),
    }));
    left.appendChild(el('button', { class: 'btn pressable', text: '🛍 公會商店', onClick: () => this._shop() }));
    left.appendChild(el('button', { class: 'btn pressable', text: '👥 成員列表', onClick: () => this._members() }));
    if (['leader', 'officer'].includes(g.myRole) && g.joinRequests.length) {
      left.appendChild(el('button', { class: 'btn btn-gold pressable', text: `✉ 入會申請 ${g.joinRequests.length}`, onClick: () => this._approvals() }));
    }
    left.appendChild(el('button', { class: 'btn pressable', text: '🚪 退出公會', onClick: () => this._leave() }));
    body.appendChild(left);

    // 右欄：Boss + 公告 + 留言板
    const right = el('div', { class: 'gd-main' });

    // 公會 Boss
    const boss = g.boss;
    const pct = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
    const bossBox = el('div', { class: 'gd-boss' }, [
      el('div', { class: 'b1', text: `👹 公會 Boss：${boss.name}（Lv${boss.level}）` }),
      el('div', { class: 'gauge' }, [el('i', { style: `width:${Math.max(0, pct * 100)}%` })]),
      el('div', { class: 'b2', text: boss.hp > 0 ? `剩餘 ${fmt(boss.hp)} / ${fmt(boss.maxHp)}` : '本週已討伐！' }),
      el('div', { class: 'gd-bossrow' }, [
        el('button', { class: 'btn btn-gold pressable', text: '⚔ 挑戰（每日 2 次）', onClick: () => this._bossFight() }),
        el('button', { class: 'btn pressable', text: '📊 傷害排行', onClick: () => this._bossRank() }),
      ]),
    ]);
    right.appendChild(bossBox);

    // 公告
    if (g.notice || ['leader', 'officer'].includes(g.myRole)) {
      const noticeBox = el('div', { class: 'gd-notice' }, [
        el('span', { text: `📌 ${g.notice || '（尚無公告）'}` }),
      ]);
      if (['leader', 'officer'].includes(g.myRole)) {
        noticeBox.appendChild(el('button', { class: 'btn pressable', text: '✏️', onClick: () => this._editNotice() }));
      }
      right.appendChild(noticeBox);
    }

    // 留言板
    const board = el('div', { class: 'gd-board' });
    board.appendChild(el('div', { class: 'ar-sub', text: '留言板' }));
    const msgs = el('div', { class: 'gd-msgs' });
    if (!g.board.length) msgs.appendChild(el('div', { class: 'ar-empty', text: '還沒有留言' }));
    for (const m of g.board.slice(0, 20)) {
      msgs.appendChild(el('div', { class: 'gd-msg' }, [
        el('b', { text: m.nickname }),
        el('span', { text: m.text }),
      ]));
    }
    board.appendChild(msgs);
    const postIn = el('input', { class: 'pc-input', maxlength: '80', placeholder: '說點什麼…' });
    postIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._post(postIn); });
    board.appendChild(el('div', { class: 'gd-postrow' }, [
      postIn,
      el('button', { class: 'btn pressable', text: '送出', onClick: () => this._post(postIn) }),
    ]));
    right.appendChild(board);

    body.appendChild(right);
    this.root.appendChild(body);

    staggerIn(left.children, { dy: 10, step: 0.05 });
    staggerIn(right.children, { dy: 14, step: 0.08 });
  }

  async _signin() {
    try {
      const r = await api.post('/api/guild/signin');
      grantRewards(r.grants);
      toast(`簽到成功，金幣 +${fmt(r.grants.gold)}`, { icon: '📅' });
      this.refresh();
    } catch (err) { toast(err.message); }
  }

  _donate() {
    const g = this.guild;
    openModal({
      className: 'ov-arena-board',
      build: (panel, close) => {
        panel.appendChild(el('button', { class: 'ov-close', text: '✕', onClick: () => close() }));
        panel.appendChild(el('div', { class: 'ov-title', text: '💰 捐獻（每日一次）' }));
        const box = el('div', { class: 'arb-list' });
        for (const t of g.donateTiers) {
          box.appendChild(el('div', { class: 'arb-row' }, [
            el('span', { class: 'nm', text: `${fmt(t.gold)} 金幣` }),
            el('span', { class: 'rt', text: `→ ${t.coins} 公會幣` }),
            el('button', {
              class: 'btn btn-gold pressable', text: '捐獻',
              onClick: async () => {
                const s = store.state;
                if ((s.currencies.gold || 0) < t.gold) { toast('金幣不足'); return; }
                try {
                  const r = await api.post('/api/guild/donate', { tierId: t.id });
                  s.currencies.gold -= r.costGold;
                  saveGame();
                  store.notify();
                  toast(`捐獻成功，公會幣 +${t.coins}`, { icon: '💰' });
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
  }

  _shop() {
    const g = this.guild;
    openModal({
      className: 'ov-arena-board',
      build: (panel, close) => {
        panel.appendChild(el('button', { class: 'ov-close', text: '✕', onClick: () => close() }));
        panel.appendChild(el('div', { class: 'ov-title', text: `🛍 公會商店（幣 ${fmt(g.myCoins)}）` }));
        const box = el('div', { class: 'arb-list' });
        for (const it of g.shop) {
          const locked = g.level < it.minLevel;
          box.appendChild(el('div', { class: 'arb-row' }, [
            el('span', { class: 'nm', text: it.name }),
            el('span', { class: 'rt', text: `${it.cost} 幣 · 週限 ${it.weeklyLimit}${locked ? ` · 需 Lv${it.minLevel}` : ''}` }),
            el('button', {
              class: `btn pressable${locked ? '' : ' btn-gold'}`, text: locked ? '🔒' : '兌換',
              onClick: async () => {
                if (locked) { toast(`公會等級不足（需 Lv${it.minLevel}）`); return; }
                try {
                  const r = await api.post('/api/guild/shop/buy', { itemId: it.id });
                  grantRewards(r.grants);
                  toast('兌換成功', { icon: '✅' });
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
  }

  _members() {
    const g = this.guild;
    openModal({
      className: 'ov-arena-board',
      build: (panel, close) => {
        panel.appendChild(el('button', { class: 'ov-close', text: '✕', onClick: () => close() }));
        panel.appendChild(el('div', { class: 'ov-title', text: `👥 成員（${g.members.length}/30）` }));
        const box = el('div', { class: 'arb-list' });
        const order = { leader: 0, officer: 1, member: 2 };
        for (const m of [...g.members].sort((a, b) => order[a.role] - order[b.role])) {
          const row = el('div', { class: 'arb-row pressable' }, [
            playerAvatar(m.avatarCardId, { size: 30 }),
            el('span', { class: 'nm', text: m.nickname }),
            el('span', { class: 'rt', text: `${ROLE_LABEL[m.role]} · 活躍 ${m.weeklyActive}` }),
          ]);
          row.addEventListener('click', () => openPlayerCard(m));
          if (g.myRole === 'leader' && m.role !== 'leader') {
            row.appendChild(el('button', {
              class: 'btn pressable', text: m.role === 'officer' ? '降職' : '升副會長',
              onClick: async (e) => {
                e.stopPropagation();
                try {
                  await api.post('/api/guild/role', { playerId: m.playerId, role: m.role === 'officer' ? 'member' : 'officer' });
                  close();
                  this.refresh();
                } catch (err) { toast(err.message); }
              },
            }));
          }
          if (['leader', 'officer'].includes(g.myRole) && m.role === 'member' && m.playerId !== store.state.profile.playerId) {
            row.appendChild(el('button', {
              class: 'btn pressable', text: '踢出',
              onClick: async (e) => {
                e.stopPropagation();
                if (!(await confirmSheet({ title: `踢出 ${m.nickname}？`, danger: true, confirmText: '踢出' }))) return;
                try { await api.post('/api/guild/kick', { playerId: m.playerId }); close(); this.refresh(); }
                catch (err) { toast(err.message); }
              },
            }));
          }
          box.appendChild(row);
        }
        panel.appendChild(box);
      },
    });
  }

  _approvals() {
    const g = this.guild;
    openModal({
      className: 'ov-arena-board',
      build: (panel, close) => {
        panel.appendChild(el('button', { class: 'ov-close', text: '✕', onClick: () => close() }));
        panel.appendChild(el('div', { class: 'ov-title', text: '✉ 入會申請' }));
        const box = el('div', { class: 'arb-list' });
        for (const p of g.joinRequests) {
          box.appendChild(el('div', { class: 'arb-row' }, [
            playerAvatar(p.avatarCardId, { size: 30 }),
            el('span', { class: 'nm', text: p.nickname }),
            el('button', { class: 'btn btn-gold pressable', text: '同意', onClick: async () => { await api.post('/api/guild/approve', { playerId: p.playerId, accept: true }).catch((e) => toast(e.message)); close(); this.refresh(); } }),
            el('button', { class: 'btn pressable', text: '拒絕', onClick: async () => { await api.post('/api/guild/approve', { playerId: p.playerId, accept: false }).catch((e) => toast(e.message)); close(); this.refresh(); } }),
          ]));
        }
        panel.appendChild(box);
      },
    });
  }

  async _leave() {
    if (!(await confirmSheet({ title: '退出公會？', desc: '公會幣與貢獻紀錄會保留在公會。', danger: true, confirmText: '退出' }))) return;
    try {
      await api.post('/api/guild/leave');
      toast('已退出公會');
      this.refresh();
    } catch (err) { toast(err.message); }
  }

  _editNotice() {
    const g = this.guild;
    openModal({
      className: 'ov-playercard',
      build: (panel, close) => {
        panel.appendChild(el('div', { class: 'ov-title', text: '編輯公告' }));
        const input = el('input', { class: 'pc-input', maxlength: '80', value: g.notice ?? '' });
        panel.appendChild(input);
        panel.appendChild(el('div', { class: 'pc-actions' }, [
          el('button', {
            class: 'btn btn-gold', text: '儲存',
            onClick: async () => {
              try { await api.post('/api/guild/notice', { text: input.value }); close(); this.refresh(); }
              catch (err) { toast(err.message); }
            },
          }),
        ]));
      },
    });
  }

  async _post(input) {
    const text = input.value.trim();
    if (!text) return;
    try {
      await api.post('/api/guild/board', { text });
      input.value = '';
      this.refresh();
    } catch (err) { toast(err.message); }
  }

  async _bossFight() {
    const attack = formationSnapshot(store.state);
    if (!attack.length) { toast('請先到「隊伍」編排上陣'); return; }
    try {
      const r = await api.post('/api/guild/boss/challenge', { attack });
      nav.go('battle');
      this.battle.playCustom({ setup: r.setup, log: r.log }, {
        title: '公會 Boss',
        onDone: () => {
          nav.go('guild');
          toast(`造成 ${fmt(r.dmg)} 傷害，公會幣 +${r.coinsGained}`, { icon: '👹' });
          this.refresh();
        },
      });
    } catch (err) { toast(err.message ?? '挑戰失敗'); }
  }

  async _bossRank() {
    try {
      const rank = await api.get('/api/guild/boss/rank');
      openModal({
        className: 'ov-arena-board',
        build: (panel, close) => {
          panel.appendChild(el('button', { class: 'ov-close', text: '✕', onClick: () => close() }));
          panel.appendChild(el('div', { class: 'ov-title', text: '📊 本週傷害排行' }));
          if (!rank.length) { panel.appendChild(el('div', { class: 'ar-empty', text: '還沒有人出手——搶頭香！' })); return; }
          const box = el('div', { class: 'arb-list' });
          rank.forEach((r, i) => {
            box.appendChild(el('div', { class: 'arb-row' }, [
              el('span', { class: 'rk', text: `${i + 1}` }),
              el('span', { class: 'nm', text: r.nickname }),
              el('span', { class: 'rt', text: fmt(r.dmg) }),
            ]));
          });
          panel.appendChild(box);
        },
      });
    } catch (err) { toast(err.message); }
  }
}
