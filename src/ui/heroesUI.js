// 英雄頁：左側篩選欄（職業/屬性/種族三維過濾）＋卡冊/圖鑑頁簽。
// 點卡或長按 → 角色詳情頁；圖鑑未擁有者為灰色剪影（收集慾儀表板）。
import { el, clear, toast } from './dom.js';
import { icon } from './icons.js';
import { staggerIn } from './anim.js';
import { store } from '../core/state.js';
import { nav } from './router.js';
import { CARDS, CARD_LIST } from '../data/cards.js';
import { ELEMENTS, ELEMENT_LABEL } from '../data/elements.js';
import { isInFormation } from '../systems/formation.js';
import { openHeroSheet } from './heroSheet.js';
import { longPress } from './gestures.js';
import { cardFrame } from './cardFrame.js';

const CLASS_META = [
  { id: 'tank', label: '坦克' },
  { id: 'dps', label: '輸出' },
  { id: 'support', label: '輔助' },
];
const RACES = [...new Set(CARD_LIST.map((c) => c.race))];

export class HeroesUI {
  constructor(root) {
    this.root = root;
    this.tab = 'roster'; // roster | codex
    // 三維篩選（Set 多選）：維度內＝或、維度間＝且；空集合＝不限
    this.element = new Set();
    this.cls = new Set();
    this.race = new Set();
    this.render();
  }

  onShow() {
    this.render();
  }

  _matches(card) {
    if (this.element.size && !this.element.has(card.element)) return false;
    if (this.cls.size && !this.cls.has(card.class)) return false;
    if (this.race.size && !this.race.has(card.race)) return false;
    return true;
  }

  _toggle(set, value) {
    if (set.has(value)) set.delete(value);
    else set.add(value);
    this.render();
  }

  render() {
    clear(this.root);
    this.root.appendChild(el('div', { class: 'back-btn pressable', title: '回主城', onClick: () => nav.go('home') }, [icon('home', 22)]));
    this.root.appendChild(el('div', { class: 'page-title left', text: this.tab === 'roster' ? '英雄' : '圖鑑' }));

    // 頁簽（右上）
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

    const wrap = el('div', { class: 'hx-wrap' });

    // ---- 左：篩選欄（職業 / 屬性 / 種族 三段） ----
    const rail = el('div', { class: 'hx-rail' });

    rail.appendChild(el('div', { class: 'hx-rt', text: '職業' }));
    const clsRow = el('div', { class: 'hx-chips' });
    for (const c of CLASS_META) {
      const chip = el('div', {
        class: `fchip pressable${this.cls.has(c.id) ? ' on' : ''}`,
        onClick: () => this._toggle(this.cls, c.id),
      });
      chip.appendChild(icon(`cls_${c.id}`, 15));
      chip.appendChild(el('span', { text: c.label }));
      clsRow.appendChild(chip);
    }
    rail.appendChild(clsRow);

    rail.appendChild(el('div', { class: 'hx-rt', text: '屬性' }));
    const elRow = el('div', { class: 'hx-chips' });
    for (const elId of ELEMENTS) {
      elRow.appendChild(el('div', {
        class: `fchip el-${elId} pressable${this.element.has(elId) ? ' on' : ''}`,
        text: ELEMENT_LABEL[elId],
        onClick: () => this._toggle(this.element, elId),
      }));
    }
    rail.appendChild(elRow);

    rail.appendChild(el('div', { class: 'hx-rt', text: '種族' }));
    const raceRow = el('div', { class: 'hx-chips' });
    for (const r of RACES) {
      raceRow.appendChild(el('div', {
        class: `fchip pressable${this.race.has(r) ? ' on' : ''}`,
        text: r,
        onClick: () => this._toggle(this.race, r),
      }));
    }
    rail.appendChild(raceRow);

    const activeCount = this.element.size + this.cls.size + this.race.size;
    if (activeCount > 0) {
      rail.appendChild(el('button', {
        class: 'btn hx-clear pressable',
        text: `✕ 清除篩選（${activeCount}）`,
        onClick: () => { this.element.clear(); this.cls.clear(); this.race.clear(); this.render(); },
      }));
    }
    wrap.appendChild(rail);

    // ---- 右：計數 + 卡格 ----
    const main = el('div', { class: 'hx-main' });
    const grid = this.tab === 'roster' ? this._rosterGrid() : this._codexGrid();
    main.appendChild(this._countBar());
    const scroll = el('div', { class: 'hx-scroll' });
    scroll.appendChild(grid);
    main.appendChild(scroll);
    wrap.appendChild(main);
    this.root.appendChild(wrap);

    // 卡冊進場：前兩排交錯浮現（後面的直接顯示，不拖捲動）
    staggerIn(grid.children, { dy: 14, step: 0.03, maxN: 12 });
    staggerIn(rail.children, { dy: 8, step: 0.03 });
  }

  _countBar() {
    const s = store.state;
    if (this.tab === 'roster') {
      const total = s.cards.length;
      const shown = s.cards.filter((inst) => this._matches(CARDS[inst.cardId] ?? {})).length;
      return el('div', { class: 'hx-count', text: `顯示 ${shown} / 擁有 ${total}` });
    }
    const ownedCount = new Set(s.cards.map((c) => c.cardId)).size;
    return el('div', { class: 'hx-count', text: `收集進度 ${ownedCount} / ${CARD_LIST.length}` });
  }

  _sortedOwned() {
    const s = store.state;
    const list = s.cards.filter((inst) => this._matches(CARDS[inst.cardId] ?? {}));
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
      grid.appendChild(el('div', { class: 'hx-empty', text: '沒有符合條件的英雄——調整左側篩選看看' }));
      return grid;
    }
    const orderIds = list.map((c) => c.instanceId);
    for (const inst of list) {
      const card = CARDS[inst.cardId];
      const item = el('div', { class: 'deck-item' });
      const frame = cardFrame(card, { level: inst.level, size: 'full', stars: inst.stars });
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
    for (const card of CARD_LIST.filter((c) => this._matches(c))) {
      const owned = s.cards.find((c) => c.cardId === card.id);
      const item = el('div', { class: `deck-item${owned ? '' : ' silhouette'}` });
      const frame = cardFrame(card, owned ? { level: owned.level, size: 'full', stars: owned.stars } : { size: 'full' });
      if (owned) frame.classList.add(`bd-${card.element}`);
      item.appendChild(frame);
      if (!owned) item.appendChild(el('span', { class: 'lockmark', text: '🔒' }));
      longPress(item, () => this._codexTap(card, owned), { onTap: () => this._codexTap(card, owned) });
      grid.appendChild(item);
    }
    if (!grid.children.length) grid.appendChild(el('div', { class: 'hx-empty', text: '沒有符合條件的英雄' }));
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
