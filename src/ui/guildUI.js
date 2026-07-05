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
    this.root.appendChild(el('div', { class: 'back-btn pressable', title: '回主城', onClick: () => nav.go('home') }, [icon('back', 22)]));
    this.root.appendChild(el('div', { class: 'page-title left', text: '公會' }));

    if (!net.authed) { this.root.appendChild(offlineHint('公會功能需要連線。')); return; }
    if (this.guild === undefined) { this.root.appendChild(el('div', { class: 'ar-empty', text: '載入中…' })); return; }
    if (this.guild === null) { this._renderBrowse(); return; }
    this._renderHome();
  }

  /* ---------------- 未入會：瀏覽/創建（羊皮紙卷軸列表） ---------------- */
  async _renderBrowse() {
    const wrap = el('div', { class: 'gd-browse' });
    wrap.appendChild(el('div', { class: 'gd-banner', text: '推薦公會' }));
    // 欄位標題列（公會名 / 等級 / 人數）
    wrap.appendChild(el('div', { class: 'gd-cols' }, [
      el('span', { text: '公會名' }),
      el('span', { text: '等級' }),
      el('span', { text: '人數' }),
      el('span', { text: '' }),
    ]));
    const listBox = el('div', { class: 'gd-list' }, [el('div', { class: 'gd-empty', text: '載入公會列表…' })]);
    wrap.appendChild(listBox);
    wrap.appendChild(el('div', { class: 'gd-browsecta' }, [
      el('button', {
        class: 'gd-hexbtn blue pressable',
        text: `創建公會（${fmt(CREATE_COST)} 金幣）`,
        onClick: () => this._create(),
      }),
    ]));
    this.root.appendChild(wrap);

    try {
      const guilds = await api.get('/api/guilds');
      clear(listBox);
      requestAnimationFrame(() => staggerIn(listBox.children, { dy: 14, step: 0.05 }));
      if (!guilds.length) listBox.appendChild(el('div', { class: 'gd-empty', text: '還沒有公會——當第一位會長吧！' }));
      for (const g of guilds) {
        listBox.appendChild(el('div', { class: 'gd-paper gd-grow' }, [
          el('div', { class: 'gd-shield', text: '🛡' }),
          el('div', { class: 'gcol' }, [
            el('div', { class: 'n', text: g.name }),
            g.notice ? el('div', { class: 'r', text: g.notice }) : null,
          ].filter(Boolean)),
          el('span', { class: 'glv', text: `Lv.${g.level}` }),
          el('span', { class: 'gmem', text: `${g.members}/${g.cap}` }),
          el('button', {
            class: 'gd-hexbtn pressable',
            text: g.joinMode === 'approval' ? '申請' : '加入',
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
      listBox.appendChild(el('div', { class: 'gd-empty', text: err.message ?? '載入失敗' }));
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

  /* ---------------- 入會：公會主頁（橫向三欄：資訊/動作 · 成員卷軸 · Boss+留言板） ---------------- */
  _renderHome() {
    const g = this.guild;
    const day = new Date().toISOString().slice(0, 10);
    const isMgr = ['leader', 'officer'].includes(g.myRole);

    const body = el('div', { class: 'gd-body' });

    // ── 左欄：公會徽章資訊 + 公告 + 動作 ──
    const left = el('div', { class: 'gd-side' });
    left.appendChild(el('div', { class: 'gd-paper gd-info' }, [
      el('div', { class: 'gd-shield big', text: '🛡' }),
      el('div', { class: 'gcol' }, [
        el('div', { class: 'n', text: g.name }),
        el('div', { class: 'r', text: `Lv.${g.level} · ${g.members.length}/30 人` }),
        el('div', { class: 'r', text: `我的公會幣 ${fmt(g.myCoins)}` }),
      ]),
    ]));
    // 公告（羊皮紙告示）
    const noticeBox = el('div', { class: 'gd-paper gd-notice' }, [
      el('span', { text: g.notice || '（尚無公告）' }),
    ]);
    if (isMgr) {
      noticeBox.appendChild(el('button', { class: 'gd-hexbtn mini pressable', text: '✏️', onClick: () => this._editNotice() }));
    }
    left.appendChild(noticeBox);
    // 動作鈕（金綢帶直排）
    left.appendChild(el('button', {
      class: `gd-hexbtn wide pressable${g.mySignin === day ? ' done' : ''}`,
      text: g.mySignin === day ? '✓ 今日已簽到' : '公會簽到',
      onClick: () => this._signin(),
    }));
    left.appendChild(el('button', {
      class: `gd-hexbtn wide pressable${g.myDonate === day ? ' done' : ''}`,
      text: g.myDonate === day ? '✓ 今日已捐獻' : '捐獻',
      onClick: () => this._donate(),
    }));
    left.appendChild(el('button', { class: 'gd-hexbtn wide stone pressable', text: '公會商店', onClick: () => this._shop() }));
    if (isMgr && g.joinRequests.length) {
      left.appendChild(el('button', { class: 'gd-hexbtn wide pressable', text: `入會申請（${g.joinRequests.length}）`, onClick: () => this._approvals() }));
    }
    left.appendChild(el('button', { class: 'gd-hexbtn wide stone pressable', text: '退出公會', onClick: () => this._leave() }));
    body.appendChild(left);

    // ── 中欄：成員卷軸列表（直接攤在主頁，參考原型） ──
    const mid = el('div', { class: 'gd-mid' });
    mid.appendChild(el('div', { class: 'gd-subtitle', text: `公會人數：${g.members.length}/30` }));
    const memBox = el('div', { class: 'gd-memlist' });
    const order = { leader: 0, officer: 1, member: 2 };
    for (const m of [...g.members].sort((a, b) => order[a.role] - order[b.role])) {
      const row = el('div', { class: 'gd-paper gd-mrow pressable' }, [
        el('div', { class: 'gd-avframe' }, [playerAvatar(m.avatarCardId, { size: 40 })]),
        el('div', { class: 'gcol' }, [
          el('div', { class: 'n', text: m.nickname }),
          el('div', { class: 'r on', text: `本週活躍 ${m.weeklyActive}` }),
        ]),
        m.role !== 'member' ? el('span', { class: 'gd-role', text: `[${ROLE_LABEL[m.role]}]` }) : null,
      ].filter(Boolean));
      row.addEventListener('click', () => openPlayerCard(m));
      // 會長管理：升降職/踢出（列內小鈕）
      if (g.myRole === 'leader' && m.role !== 'leader') {
        row.appendChild(el('button', {
          class: 'gd-hexbtn mini stone pressable', text: m.role === 'officer' ? '降職' : '升職',
          onClick: async (e) => {
            e.stopPropagation();
            try {
              await api.post('/api/guild/role', { playerId: m.playerId, role: m.role === 'officer' ? 'member' : 'officer' });
              this.refresh();
            } catch (err) { toast(err.message); }
          },
        }));
      }
      if (isMgr && m.role === 'member' && m.playerId !== store.state.profile.playerId) {
        row.appendChild(el('button', {
          class: 'gd-hexbtn mini stone pressable', text: '踢出',
          onClick: async (e) => {
            e.stopPropagation();
            if (!(await confirmSheet({ title: `踢出 ${m.nickname}？`, danger: true, confirmText: '踢出' }))) return;
            try { await api.post('/api/guild/kick', { playerId: m.playerId }); this.refresh(); }
            catch (err) { toast(err.message); }
          },
        }));
      }
      memBox.appendChild(row);
    }
    mid.appendChild(memBox);
    body.appendChild(mid);

    // ── 右欄：公會 Boss（皮革戰報卡）+ 留言板 ──
    const right = el('div', { class: 'gd-main' });
    const boss = g.boss;
    const pct = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
    right.appendChild(el('div', { class: 'gd-boss' }, [
      el('div', { class: 'b1', text: `👹 公會 Boss：${boss.name}（Lv${boss.level}）` }),
      el('div', { class: 'gauge' }, [el('i', { style: `width:${Math.max(0, pct * 100)}%` })]),
      el('div', { class: 'b2', text: boss.hp > 0 ? `剩餘 ${fmt(boss.hp)} / ${fmt(boss.maxHp)}` : '本週已討伐！' }),
      el('div', { class: 'gd-bossrow' }, [
        el('button', { class: 'gd-hexbtn pressable', text: '⚔ 挑戰（每日 2 次）', onClick: () => this._bossFight() }),
        el('button', { class: 'gd-hexbtn stone pressable', text: '傷害排行', onClick: () => this._bossRank() }),
      ]),
    ]));

    const board = el('div', { class: 'gd-paper gd-board' });
    board.appendChild(el('div', { class: 'bt', text: '留言板' }));
    const msgs = el('div', { class: 'gd-msgs' });
    if (!g.board.length) msgs.appendChild(el('div', { class: 'gd-empty', text: '還沒有留言' }));
    for (const m of g.board.slice(0, 20)) {
      msgs.appendChild(el('div', { class: 'gd-msg' }, [
        el('b', { text: m.nickname }),
        el('span', { text: m.text }),
      ]));
    }
    board.appendChild(msgs);
    const postIn = el('input', { class: 'pc-input paper-input', maxlength: '80', placeholder: '說點什麼…' });
    postIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._post(postIn); });
    board.appendChild(el('div', { class: 'gd-postrow' }, [
      postIn,
      el('button', { class: 'gd-hexbtn mini pressable', text: '送出', onClick: () => this._post(postIn) }),
    ]));
    right.appendChild(board);
    body.appendChild(right);

    this.root.appendChild(body);
    staggerIn(left.children, { dy: 10, step: 0.05 });
    staggerIn(memBox.children, { dy: 12, step: 0.04, maxN: 8 });
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

  // （成員列表已攤平在主頁中欄，管理鈕直接在列上）

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
