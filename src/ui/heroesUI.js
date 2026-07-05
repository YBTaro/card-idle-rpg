// 英雄頁：左側篩選欄（職業/屬性/種族三維過濾）＋卡冊/圖鑑頁簽。
// 點卡或長按 → 角色詳情頁；圖鑑未擁有者為灰色剪影（收集慾儀表板）。
// 效能：卡格只在進頁/換頁簽時建一次；篩選用 display 切換（不重建 DOM）——
//   幾百張卡也只是翻 class；離屏渲染由 CSS content-visibility 跳過。
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

  // 卡冊內容簽章：卡的增減/升級/升星/上下陣才需要重建卡格。
  // 其他 store 變更（金幣、關卡、任務…）打過來時簽章相同 → 跳過整頁重建。
  _sig() {
    const s = store.state;
    const cards = s.cards.map((c) => `${c.instanceId}:${c.level}:${c.stars ?? 0}`).join(',');
    const form = s.formation.map((e) => e.instanceId).join(',');
    return `${this.tab}|${cards}|${form}`;
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
    this._applyFilter();
  }

  render() {
    const sig = this._sig();
    if (sig === this._lastSig && this._grid?.isConnected) return; // 內容沒變：不重建
    this._lastSig = sig;
    this._build();
  }

  _build() {
    clear(this.root);
    this.root.appendChild(el('div', { class: 'back-btn pressable', title: '回主城', onClick: () => nav.go('home') }, [icon('back', 22)]));
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
    // chip 記到 this._chips，篩選切換時原地翻 .on class，不重建
    const rail = el('div', { class: 'hx-rail' });
    this._chips = [];
    const addChip = (row, set, value, build) => {
      const chip = el('div', {
        class: `fchip pressable${set.has(value) ? ' on' : ''}`,
        onClick: () => this._toggle(set, value),
      });
      build(chip);
      this._chips.push({ chip, set, value });
      row.appendChild(chip);
    };

    rail.appendChild(el('div', { class: 'hx-rt', text: '職業' }));
    const clsRow = el('div', { class: 'hx-chips' });
    for (const c of CLASS_META) {
      addChip(clsRow, this.cls, c.id, (chip) => {
        chip.appendChild(icon(`cls_${c.id}`, 15));
        chip.appendChild(el('span', { text: c.label }));
      });
    }
    rail.appendChild(clsRow);

    rail.appendChild(el('div', { class: 'hx-rt', text: '屬性' }));
    const elRow = el('div', { class: 'hx-chips' });
    for (const elId of ELEMENTS) {
      addChip(elRow, this.element, elId, (chip) => {
        chip.classList.add(`el-${elId}`);
        chip.textContent = ELEMENT_LABEL[elId];
      });
    }
    rail.appendChild(elRow);

    rail.appendChild(el('div', { class: 'hx-rt', text: '種族' }));
    const raceRow = el('div', { class: 'hx-chips' });
    for (const r of RACES) {
      addChip(raceRow, this.race, r, (chip) => { chip.textContent = r; });
    }
    rail.appendChild(raceRow);

    // 清除鈕常駐（原地顯隱），避免出現/消失時整欄重排
    this._clearBtn = el('button', {
      class: 'btn hx-clear pressable',
      text: '✕ 清除篩選',
      onClick: () => {
        this.element.clear();
        this.cls.clear();
        this.race.clear();
        this._applyFilter();
      },
    });
    rail.appendChild(this._clearBtn);
    wrap.appendChild(rail);

    // ---- 右：計數 + 卡格（建一次；之後靠 _applyFilter 顯隱） ----
    const main = el('div', { class: 'hx-main' });
    this._countBar = el('div', { class: 'hx-count' });
    main.appendChild(this._countBar);
    const scroll = el('div', { class: 'hx-scroll' });
    this._grid = this.tab === 'roster' ? this._rosterGrid() : this._codexGrid();
    scroll.appendChild(this._grid);
    main.appendChild(scroll);
    wrap.appendChild(main);
    this.root.appendChild(wrap);

    this._applyFilter();

    // 卡冊進場：前兩排交錯浮現（後面的直接顯示，不拖捲動）
    staggerIn(this._grid.children, { dy: 14, step: 0.03, maxN: 12 });
    staggerIn(rail.children, { dy: 8, step: 0.03 });
  }

  // 篩選切換：只翻 chip 狀態 + 卡格顯隱 + 計數，不重建任何卡面 DOM。
  _applyFilter() {
    for (const { chip, set, value } of this._chips) {
      chip.classList.toggle('on', set.has(value));
    }
    const activeCount = this.element.size + this.cls.size + this.race.size;
    this._clearBtn.style.display = activeCount > 0 ? '' : 'none';
    this._clearBtn.textContent = `✕ 清除篩選（${activeCount}）`;

    let shown = 0;
    for (const item of this._grid.children) {
      if (item.classList.contains('hx-empty')) continue;
      const card = CARDS[item.dataset.cardId];
      const ok = card && this._matches(card);
      item.classList.toggle('hidden', !ok);
      if (ok) shown += 1;
    }
    // 空狀態提示（常駐節點顯隱）
    this._empty?.classList.toggle('hidden', shown > 0);

    const s = store.state;
    if (this.tab === 'roster') {
      this._countBar.textContent = `顯示 ${shown} / 擁有 ${s.cards.length}`;
    } else {
      const ownedCount = new Set(s.cards.map((c) => c.cardId)).size;
      this._countBar.textContent = `收集進度 ${ownedCount} / ${CARD_LIST.length}`;
    }
  }

  _sortedOwned() {
    const s = store.state;
    // 出戰中永遠排前，再按等級降冪（formation 查表先建 Set，避免 O(n×m)）
    const inForm = new Set(s.formation.map((e) => e.instanceId));
    const list = [...s.cards];
    list.sort((a, b) => {
      const fa = Number(inForm.has(b.instanceId)) - Number(inForm.has(a.instanceId));
      if (fa !== 0) return fa;
      return b.level - a.level;
    });
    return list;
  }

  // 詳情頁的左右切換清單＝「目前篩選後可見」的卡（點卡當下計算，跟著篩選狀態走）。
  _visibleIds() {
    return this._sortedOwned()
      .filter((inst) => this._matches(CARDS[inst.cardId]))
      .map((c) => c.instanceId);
  }

  _rosterGrid() {
    const list = this._sortedOwned();
    const grid = el('div', { class: 'deck' });
    this._empty = el('div', { class: 'hx-empty', text: '沒有符合條件的英雄——調整左側篩選看看' });
    grid.appendChild(this._empty);
    if (!list.length) return grid;
    const frag = document.createDocumentFragment();
    for (const inst of list) {
      const card = CARDS[inst.cardId];
      const item = el('div', { class: 'deck-item' });
      item.dataset.cardId = card.id;
      const frame = cardFrame(card, { level: inst.level, size: 'full', stars: inst.stars });
      frame.classList.add(`bd-${card.element}`);
      item.appendChild(frame);
      if (isInFormation(inst.instanceId)) item.appendChild(el('span', { class: 'flag', text: '出戰中' }));
      const open = () => openHeroSheet(inst.instanceId, { list: this._visibleIds() });
      longPress(item, open, { onTap: open });
      frag.appendChild(item);
    }
    grid.appendChild(frag);
    return grid;
  }

  _codexGrid() {
    const s = store.state;
    const grid = el('div', { class: 'deck' });
    this._empty = el('div', { class: 'hx-empty', text: '沒有符合條件的英雄' });
    grid.appendChild(this._empty);
    // 擁有查表先建 Map（cardId → 最高星實例），避免每張卡掃 cards 陣列
    const ownedBy = new Map();
    for (const c of s.cards) if (!ownedBy.has(c.cardId)) ownedBy.set(c.cardId, c);
    const frag = document.createDocumentFragment();
    for (const card of CARD_LIST) {
      const owned = ownedBy.get(card.id);
      const item = el('div', { class: `deck-item${owned ? '' : ' silhouette'}` });
      item.dataset.cardId = card.id;
      const frame = cardFrame(card, owned ? { level: owned.level, size: 'full', stars: owned.stars } : { size: 'full' });
      if (owned) frame.classList.add(`bd-${card.element}`);
      item.appendChild(frame);
      if (!owned) item.appendChild(el('span', { class: 'lockmark', text: '🔒' }));
      longPress(item, () => this._codexTap(card, owned), { onTap: () => this._codexTap(card, owned) });
      frag.appendChild(item);
    }
    grid.appendChild(frag);
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
