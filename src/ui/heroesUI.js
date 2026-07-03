// 英雄頁：卡冊（收藏與養成入口）＋圖鑑頁簽。
// 卡冊格只留 4 個識別元素：卡面 / Lv / 元素框色 / 出戰旗標（P3 漸進揭露），
// 點卡或長按 → 角色詳情頁；圖鑑未擁有者為灰色剪影（收集慾儀表板）。
import { el, clear, toast } from './dom.js';
import { store } from '../core/state.js';
import { nav } from './router.js';
import { CARDS, CARD_LIST } from '../data/cards.js';
import { ELEMENTS, ELEMENT_LABEL } from '../data/elements.js';
import { isInFormation } from '../systems/formation.js';
import { openHeroSheet } from './heroSheet.js';
import { longPress } from './gestures.js';
import { cardFrame } from './cardFrame.js';

export class HeroesUI {
  constructor(root) {
    this.root = root;
    this.tab = 'roster'; // roster | codex
    this.element = null; // null = 全部
    this.render();
  }

  onShow() {
    this.render();
  }

  render() {
    clear(this.root);
    this.root.appendChild(el('div', { class: 'back-btn pressable', text: '🏠', title: '回主城', onClick: () => nav.go('home') }));
    this.root.appendChild(el('div', { class: 'page-title', text: this.tab === 'roster' ? '英雄' : '圖鑑' }));

    // 頁簽
    const tabs = el('div', { class: 'hx-tabs' });
    for (const [id, label] of [['roster', '英雄'], ['codex', '圖鑑']]) {
      tabs.appendChild(
        el('div', {
          class: `hx-tab pressable${this.tab === id ? ' on' : ''}`,
          text: label,
          onClick: () => {
            this.tab = id;
            this.render();
          },
        })
      );
    }
    this.root.appendChild(tabs);

    // 篩選列（卡冊限定；固定排序＝出戰中優先、等級降冪）
    if (this.tab === 'roster') {
      const filters = el('div', { class: 'hx-filters' });
      filters.appendChild(
        el('div', {
          class: `fchip pressable${this.element == null ? ' on' : ''}`,
          text: '全部',
          onClick: () => {
            this.element = null;
            this.render();
          },
        })
      );
      for (const elId of ELEMENTS) {
        filters.appendChild(
          el('div', {
            class: `fchip pressable${this.element === elId ? ' on' : ''}`,
            text: ELEMENT_LABEL[elId],
            onClick: () => {
              this.element = this.element === elId ? null : elId;
              this.render();
            },
          })
        );
      }
      this.root.appendChild(filters);
    }

    const scroll = el('div', { class: 'hx-scroll' });
    scroll.appendChild(this.tab === 'roster' ? this._rosterGrid() : this._codexGrid());
    this.root.appendChild(scroll);
  }

  _sortedOwned() {
    const s = store.state;
    let list = [...s.cards];
    if (this.element) list = list.filter((inst) => CARDS[inst.cardId]?.element === this.element);
    // 出戰中永遠排前，再按等級降冪
    list.sort((a, b) => {
      const fa = Number(isInFormation(b.instanceId)) - Number(isInFormation(a.instanceId));
      if (fa !== 0) return fa;
      return b.level - a.level;
    });
    return list;
  }

  _rosterGrid() {
    const list = this._sortedOwned();
    const grid = el('div', { class: 'deck' });
    if (!list.length) {
      grid.appendChild(el('div', { style: 'color:var(--dim);font-size:.9rem', text: '沒有符合條件的英雄' }));
      return grid;
    }
    const orderIds = list.map((c) => c.instanceId);
    for (const inst of list) {
      const card = CARDS[inst.cardId];
      const item = el('div', { class: 'deck-item' });
      const frame = cardFrame(card, { level: inst.level, size: 'full' });
      frame.classList.add(`bd-${card.element}`);
      item.appendChild(frame);
      if (isInFormation(inst.instanceId)) item.appendChild(el('span', { class: 'flag', text: '出戰中' }));
      longPress(item, () => openHeroSheet(inst.instanceId, { list: orderIds }), {
        onTap: () => openHeroSheet(inst.instanceId, { list: orderIds }),
      });
      grid.appendChild(item);
    }
    return grid;
  }

  _codexGrid() {
    const s = store.state;
    const grid = el('div', { class: 'deck' });
    for (const card of CARD_LIST) {
      const owned = s.cards.find((c) => c.cardId === card.id);
      const item = el('div', { class: `deck-item${owned ? '' : ' silhouette'}` });
      const frame = cardFrame(card, owned ? { level: owned.level, size: 'full' } : { size: 'full' });
      if (owned) frame.classList.add(`bd-${card.element}`);
      item.appendChild(frame);
      if (!owned) item.appendChild(el('span', { class: 'lockmark', text: '🔒' }));
      longPress(item, () => this._codexTap(card, owned), { onTap: () => this._codexTap(card, owned) });
      grid.appendChild(item);
    }
    // 收集進度
    const ownedCount = new Set(s.cards.map((c) => c.cardId)).size;
    grid.appendChild(
      el('div', {
        style: 'grid-column:1/-1;text-align:center;color:var(--dim);font-size:.85rem;padding:.5rem 0',
        text: `收集進度 ${ownedCount} / ${CARD_LIST.length}`,
      })
    );
    return grid;
  }

  _codexTap(card, ownedInst) {
    if (ownedInst) {
      openHeroSheet(ownedInst.instanceId);
    } else {
      toast(`尚未獲得「${card.name}」——可透過召喚取得`, { icon: '🎴' });
      nav.go('gacha');
    }
  }
}
