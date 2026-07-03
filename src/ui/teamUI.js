// 隊伍頁：出戰 6 人以直式全身大卡一字排開（左＝後衛 4-6、右＝前衛 1-3，金線分隔）。
// 互動合約（P3/P5/P6）：
//   拖曳卡片 → 調整站位（拖到有人＝互換、拖到空格＝移動）
//   點大卡 / 長按 → 角色詳情（單擊永遠安全，下陣收在詳情頁）
//   點空格＋ / 「英雄替換」 → 底部滑出英雄選擇抽屜（隊滿→點選被替換者）
import { gsap } from 'gsap';
import { el, clear, toast } from './dom.js';
import { store } from '../core/state.js';
import { nav } from './router.js';
import { CARDS } from '../data/cards.js';
import { ELEMENT_LABEL } from '../data/elements.js';
import { artFor } from '../data/assets.js';
import {
  addToFormation,
  removeFromFormation,
  setPosition,
  isInFormation,
} from '../systems/formation.js';
import { openHeroSheet } from './heroSheet.js';
import { longPress } from './gestures.js';
import { cardFrame } from './cardFrame.js';

const CLASS_GLYPH = { tank: '🛡', dps: '⚔', support: '✚' };
// 版面順序：左群後衛（4,5,6）、右群前衛（1,2,3）——同參考原型
const BACK_POSITIONS = [4, 5, 6];
const FRONT_POSITIONS = [1, 2, 3];
const DRAG_START_PX = 12; // 位移超過即進入拖曳（低於此值仍視為點擊/長按）

export class TeamUI {
  constructor(root) {
    this.root = root;
    this.pendingReplace = null; // 抽屜選了人但隊伍已滿 → 待點選被替換者
    this.render();
  }

  onShow() {
    this.pendingReplace = null;
    this.render();
  }

  render() {
    const s = store.state;
    clear(this.root);

    this.root.appendChild(el('div', { class: 'back-btn pressable', text: '🏠', title: '回主城', onClick: () => nav.go('home') }));
    this.root.appendChild(el('div', { class: 'page-title left', text: '隊伍' }));
    this.root.appendChild(
      el('div', { class: 'tp-power' }, [
        el('span', { class: 'tp-count', text: `${s.formation.length}/6 上陣` }),
      ])
    );

    if (this.pendingReplace) {
      this.root.appendChild(el('div', { class: 'tp-mode-tip', text: '隊伍已滿：點選要被替換的出戰英雄' }));
    }

    // 卡列
    const row = el('div', { class: 'tp-row' });
    row.appendChild(this._group('後　衛', BACK_POSITIONS));
    row.appendChild(el('div', { class: 'tp-div' }));
    row.appendChild(this._group('前　衛', FRONT_POSITIONS));
    this.root.appendChild(row);

    // 底部操作列（單一入口：英雄替換；站位靠拖曳）
    this.root.appendChild(
      el('div', { class: 'tp-bottom' }, [
        el('div', { class: 'hint', text: '拖曳卡片調整站位；點卡查看詳細數值與技能' }),
        el('button', { class: 'btn-gold', text: '英雄替換', onClick: () => this._openDrawer(null) }),
      ])
    );
  }

  _group(label, positions) {
    const group = el('div', { class: 'tp-group' }, [el('span', { class: 'gtag', text: label })]);
    for (const pos of positions) {
      group.appendChild(this._slotCard(pos));
    }
    return group;
  }

  _slotCard(pos) {
    const s = store.state;
    const entry = s.formation.find((e) => e.pos === pos);
    if (!entry) {
      const node = el('div', {
        class: 'tcard empty pressable',
        onClick: () => this._openDrawer(pos),
      }, [el('span', { class: 'plus', text: '＋' }), el('span', { class: 'et', text: '點擊上陣' })]);
      node.dataset.pos = String(pos);
      return node;
    }

    const inst = store.getCard(entry.instanceId);
    const card = inst ? CARDS[inst.cardId] : null;
    if (!card) return el('div', { class: 'tcard empty' });

    const node = el('div', { class: `tcard bd-${card.element}` });
    node.dataset.pos = String(pos);

    const art = el('div', { class: 'art' });
    const src = artFor(card.id);
    if (src) art.appendChild(el('img', { src, alt: card.name, draggable: 'false' }));
    art.appendChild(el('span', { class: `elb el-${card.element}`, text: ELEMENT_LABEL[card.element] }));
    art.appendChild(el('span', { class: 'nm', text: card.name }));
    node.appendChild(art);
    node.appendChild(
      el('div', { class: 'lvpanel' }, [
        el('span', { text: `Lv${inst.level}` }),
        el('span', { class: 'sk', text: CLASS_GLYPH[card.class] || '✦' }),
      ])
    );

    longPress(node, () => this._openSheet(entry.instanceId), {
      onTap: () => {
        if (this.pendingReplace) {
          // 替換：舊人下陣、新人接位
          const newId = this.pendingReplace;
          this.pendingReplace = null;
          removeFromFormation(entry.instanceId);
          addToFormation(newId, pos);
          toast(`${CARDS[store.getCard(newId).cardId].name} 上陣！`, { icon: '⚔' });
          return;
        }
        this._openSheet(entry.instanceId);
      },
    });
    this._bindDrag(node, pos, entry.instanceId);
    return node;
  }

  // 拖曳調整站位：拖到有人＝互換、拖到空格＝移動。
  _bindDrag(node, pos, instanceId) {
    node.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      const sx = e.clientX;
      const sy = e.clientY;
      let ghost = null;

      const setDropHint = (target) => {
        this.root.querySelectorAll('.tcard.drop-hint').forEach((n) => n.classList.remove('drop-hint'));
        if (target && target !== node) target.classList.add('drop-hint');
      };

      const onMove = (ev) => {
        if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > DRAG_START_PX) {
          // 進入拖曳：建幽靈卡、壓暗來源、吃掉後續 click（避免放開時開詳情）
          ghost = node.cloneNode(true);
          ghost.classList.add('drag-ghost');
          const r = node.getBoundingClientRect();
          ghost.style.width = `${r.width}px`;
          ghost.style.height = `${r.height}px`;
          document.body.appendChild(ghost);
          node.classList.add('drag-src');
          const eatClick = (ce) => {
            ce.stopImmediatePropagation();
            ce.preventDefault();
          };
          node.addEventListener('click', eatClick, { capture: true, once: true });
          setTimeout(() => node.removeEventListener('click', eatClick, { capture: true }), 350);
        }
        if (ghost) {
          ghost.style.left = `${ev.clientX}px`;
          ghost.style.top = `${ev.clientY}px`;
          setDropHint(document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.tcard'));
        }
      };

      const onUp = (ev) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        if (!ghost) return;
        ghost.remove();
        node.classList.remove('drag-src');
        setDropHint(null);
        const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.tcard');
        const targetPos = target?.dataset.pos ? Number(target.dataset.pos) : null;
        if (targetPos && targetPos !== pos) {
          setPosition(instanceId, targetPos); // 互換/移動（setPosition 內建交換）
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });
  }

  _openSheet(instanceId) {
    // 詳情頁左右切換順序＝出戰位置順序 + 其餘持有英雄
    const s = store.state;
    const formationIds = [...s.formation].sort((a, b) => a.pos - b.pos).map((e) => e.instanceId);
    const others = s.cards.map((c) => c.instanceId).filter((id) => !formationIds.includes(id));
    openHeroSheet(instanceId, { list: [...formationIds, ...others] });
  }

  // 英雄選擇抽屜。targetPos 為 null 時：有空位放空位、滿了進入替換流程。
  _openDrawer(targetPos) {
    this._closeDrawer();
    const s = store.state;
    const bench = s.cards.filter((c) => !isInFormation(c.instanceId));

    const drawer = el('div', { class: 'swap-drawer' });
    const title = el('div', { class: 'sd-title' }, [
      el('span', { text: bench.length ? '選擇要上陣的英雄' : '沒有待命英雄（全部都在陣上或尚未招募）' }),
      el('button', { text: '關閉', onClick: () => this._closeDrawer() }),
    ]);
    drawer.appendChild(title);

    const list = el('div', { class: 'sd-list' });
    const sorted = [...bench].sort((a, b) => b.level - a.level);
    for (const inst of sorted) {
      const card = CARDS[inst.cardId];
      const item = el('div', { class: 'swap-item pressable' }, [cardFrame(card, { level: inst.level, size: 'full' })]);
      longPress(item, () => this._openSheet(inst.instanceId), {
        onTap: () => {
          const full = store.state.formation.length >= 6;
          if (targetPos != null) {
            addToFormation(inst.instanceId, targetPos);
            this._closeDrawer();
            toast(`${card.name} 上陣！`, { icon: '⚔' });
          } else if (!full) {
            addToFormation(inst.instanceId);
            this._closeDrawer();
            toast(`${card.name} 上陣！`, { icon: '⚔' });
          } else {
            // 滿員：選人 → 回到隊伍點選被替換者
            this.pendingReplace = inst.instanceId;
            this._closeDrawer();
            this.render();
          }
        },
      });
      list.appendChild(item);
    }
    drawer.appendChild(list);
    this.root.appendChild(drawer);
    this._drawer = drawer;
    gsap.fromTo(drawer, { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.24, ease: 'power2.out', clearProps: 'transform' });
  }

  _closeDrawer() {
    this._drawer?.remove();
    this._drawer = null;
  }
}
