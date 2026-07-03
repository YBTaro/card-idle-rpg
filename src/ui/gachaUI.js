// 召喚頁：卡池看板版式——左卡池欄、中央看板英雄、右說明與召喚鈕、機率公示。
// 券不足時按鈕顯示缺口並引導每日簽到（P7 引導閉環）。
import { el, clear, toast, fmt } from './dom.js';
import { store } from '../core/state.js';
import { nav } from './router.js';
import { pull, canPull } from '../systems/gacha.js';
import { GACHA_TABLE, GACHA_COST_TICKETS, DUPLICATE_TO_MATERIAL } from '../data/gachaTable.js';
import { CARDS, GACHA_CARD_POOL } from '../data/cards.js';
import { CLASSES } from '../data/classes.js';
import { ELEMENT_LABEL } from '../data/elements.js';
import { cutoutFor } from '../data/assets.js';
import { openModal } from './modal.js';
import { openSummonCeremony } from './summonFx.js';
import { openSigninSheet } from './metaSheets.js';
import { canSignin } from '../systems/signin.js';
import { trackQuest } from '../systems/quests.js';

export class GachaUI {
  constructor(root) {
    this.root = root;
    // 看板英雄：以「今天」為種子輪換，點立繪可手動切換
    this.featIdx = Math.floor(Date.now() / 86400000) % GACHA_CARD_POOL.length;
    this.render();
  }

  onShow() {
    this.render();
  }

  render() {
    const s = store.state;
    clear(this.root);

    this.root.appendChild(el('div', { class: 'back-btn pressable', text: '‹ 主城', onClick: () => nav.go('home') }));
    this.root.appendChild(
      el('div', { class: 'gx-tickets' }, [
        el('div', { class: 'pill' }, [el('span', { class: 'ic', text: '🎟️' }), el('span', { text: fmt(s.currencies.tickets) })]),
      ])
    );

    // 左：卡池欄（目前僅常駐池；新池之後往下疊）
    this.root.appendChild(
      el('div', { class: 'gx-rail' }, [
        el('div', { class: 'gx-rb' }, [el('span', { text: '命運召喚' }), el('span', { class: 'cd', text: '常駐 · 全英雄' })]),
        el('div', { class: 'gx-rb off' }, [el('span', { text: '新卡池' }), el('span', { class: 'cd', text: '敬請期待' })]),
      ])
    );

    // 中：看板英雄
    const featId = GACHA_CARD_POOL[this.featIdx % GACHA_CARD_POOL.length];
    const feat = CARDS[featId];
    const heroWrap = el('div', {
      class: 'gx-hero pressable',
      onClick: () => {
        this.featIdx += 1;
        this.render();
      },
    });
    const src = cutoutFor(featId);
    if (src) heroWrap.appendChild(el('img', { src, alt: feat.name }));
    this.root.appendChild(heroWrap);
    this.root.appendChild(
      el('div', { class: 'gx-name' }, [
        el('span', { class: `el el-${feat.element}`, text: ELEMENT_LABEL[feat.element] }),
        el('span', { class: 'nm', text: feat.name }),
        el('span', { class: 'tag', text: `${CLASSES[feat.class].label}${feat.series?.length ? ' · ' + feat.series[0] : ''}` }),
      ])
    );

    // 機率公示
    this.root.appendChild(el('div', { class: 'gx-odds pressable', text: '🔍 機率公示', onClick: () => this._openOdds() }));

    // 右：卡池說明
    this.root.appendChild(
      el('div', { class: 'gx-right' }, [
        el('span', { class: 't1', text: '命運召喚' }),
        el('span', { class: 't2', text: '🕐 常駐卡池 · 隨時可抽' }),
        el('span', {
          class: 't3',
          html: '高機率獲得養成素材，<br>低機率召喚稀有英雄；<br>重複英雄自動轉化為 🔹 精華。',
        }),
      ])
    );

    // 右下：召喚鈕
    const btns = el('div', { class: 'gx-btns' });
    btns.appendChild(this._summonBtn(1, false));
    btns.appendChild(this._summonBtn(10, true));
    this.root.appendChild(btns);
  }

  _summonBtn(times, gold) {
    const tickets = store.state.currencies.tickets;
    const cost = times * GACHA_COST_TICKETS;
    const lack = tickets < GACHA_COST_TICKETS;
    // 十連券不足但還有券 → 明示將以剩餘券召喚
    const actual = Math.min(times, Math.floor(tickets / GACHA_COST_TICKETS));
    let label = `${times} 次召喚`;
    let sub = `🎟️ ${cost}`;
    if (lack) {
      sub = `還差 ${GACHA_COST_TICKETS - tickets} 🎟️`;
    } else if (actual < times) {
      label = `${actual} 次召喚`;
      sub = `🎟️ 不足，以剩餘 ${actual} 券召喚`;
    }
    const node = el('div', {
      class: `gxb pressable${gold ? ' gold' : ''}${lack ? ' lack' : ''}`,
      html: `${label}<small>${sub}</small>`,
      onClick: () => {
        if (lack) {
          if (canSignin()) {
            toast('召喚券不足——先領今天的簽到獎勵吧！', { icon: '📅' });
            openSigninSheet();
          } else {
            toast('召喚券不足：每日簽到與任務可獲得 🎟️');
          }
          return;
        }
        this._doSummon(times);
      },
    });
    return node;
  }

  _doSummon(times) {
    const results = this._pullBatch(times);
    if (!results.length) {
      toast('召喚券不足');
      return;
    }
    openSummonCeremony(results, {
      times,
      ticketsLeft: () => store.state.currencies.tickets,
      onAgain: (n) => {
        const next = this._pullBatch(n);
        if (!next.length) {
          toast('召喚券不足');
          return null;
        }
        return next;
      },
    });
  }

  _pullBatch(times) {
    const results = [];
    for (let i = 0; i < times; i += 1) {
      if (!canPull()) break;
      results.push(pull());
    }
    if (results.length) trackQuest('summon', results.length);
    return results;
  }

  _openOdds() {
    openModal({
      build: (panel, close) => {
        panel.appendChild(el('button', { class: 'ov-close', text: '✕', onClick: () => close() }));
        panel.appendChild(el('div', { class: 'ov-title', text: '機率公示' }));
        const box = el('div', { class: 'odds-box' });
        const total = GACHA_TABLE.reduce((sum, e) => sum + e.weight, 0);
        const cardEntry = GACHA_TABLE.find((e) => e.type === 'card');
        const cardPct = ((cardEntry?.weight || 0) / total) * 100;
        const rows = [
          ['稀有英雄（隨機一名）', `${cardPct.toFixed(1)}%`],
          [`　└ 單一英雄（共 ${GACHA_CARD_POOL.length} 名）`, `${(cardPct / GACHA_CARD_POOL.length).toFixed(2)}%`],
        ];
        for (const e of GACHA_TABLE) {
          if (e.type === 'material') {
            rows.push([`養成精華 ×${e.amount[0]}〜${e.amount[1]}`, `${((e.weight / total) * 100).toFixed(1)}%`]);
          }
        }
        for (const [k, v] of rows) {
          box.appendChild(el('div', { class: 'odds-row' }, [el('span', { class: 'k', text: k }), el('span', { class: 'v', text: v })]));
        }
        box.appendChild(
          el('div', {
            class: 'odds-note',
            text: `・每次召喚消耗 ${GACHA_COST_TICKETS} 🎟️。\n・抽到已擁有的英雄時，自動轉化為 🔹 精華 ×${DUPLICATE_TO_MATERIAL.amount}。\n・機率為每一抽獨立計算。`,
          })
        );
        panel.appendChild(box);
      },
    });
  }
}
