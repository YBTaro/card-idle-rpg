// 隊伍頁：出戰 6 人以直式全身大卡一字排開（左＝後衛 4-6、右＝前衛 1-3，金線分隔）。
// 互動合約（P3/P5/P6）：
//   拖曳隊上卡片 → 調整站位（拖到有人＝互換、拖到空格＝移動）
//   點大卡 / 長按 → 角色詳情（單擊永遠安全，下陣收在詳情頁）
//   「英雄替換」抽屜開啟＝編輯模式：
//     ・下方待命英雄「往上拖」到任一格位 → 上陣/替換該格
//     ・點隊上英雄 → 直接移出隊伍（回到下方待命列）
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
const DRAG_START_PX = 12; // 隊上卡片：位移超過即進入拖曳
const BENCH_DRAG_UP_PX = 14; // 抽屜卡片：明確「往上拖」才進入拖曳（避免和橫向捲動打架）

export class TeamUI {
  constructor(root) {
    this.root = root;
    this.drawerOpen = false; // 英雄替換編輯模式
    this._drawerTarget = null; // 由空格開啟時的目標位置（點抽屜卡直接入該格）
    this.render();
  }

  onShow() {
    this.drawerOpen = false;
    this._drawerTarget = null;
    this._drawerShown = false;
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

    if (this.drawerOpen) {
      this.root.appendChild(el('div', { class: 'tp-mode-tip', text: '點隊上英雄移出；把下方英雄拖到格位上陣' }));
    }

    // 卡列
    const row = el('div', { class: 'tp-row' });
    row.appendChild(this._group('後　衛', BACK_POSITIONS));
    row.appendChild(el('div', { class: 'tp-div' }));
    row.appendChild(this._group('前　衛', FRONT_POSITIONS));
    this.root.appendChild(row);

    // 底部操作列
    this.root.appendChild(
      el('div', { class: 'tp-bottom' }, [
        el('div', { class: 'hint', text: '拖曳卡片調整站位；點卡查看詳細數值與技能' }),
        el('button', {
          class: 'btn-gold',
          text: this.drawerOpen ? '完成' : '英雄替換',
          onClick: () => {
            this.drawerOpen = !this.drawerOpen;
            this._drawerTarget = null;
            if (!this.drawerOpen) this._drawerShown = false;
            this.render();
          },
        }),
      ])
    );

    if (this.drawerOpen) this._mountDrawer();
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
        onClick: () => {
          if (this.drawerOpen) return; // 編輯模式下靠拖曳入格
          this._drawerTarget = pos;
          this.drawerOpen = true;
          this.render();
        },
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
    // 編輯模式：紅色「−」角標＝點一下移出隊伍
    if (this.drawerOpen) node.appendChild(el('span', { class: 'minus', text: '−' }));

    longPress(node, () => this._openSheet(entry.instanceId), {
      onTap: () => {
        if (this.drawerOpen) {
          removeFromFormation(entry.instanceId);
          toast(`${card.name} 已移出隊伍`, { icon: '↩' });
          return;
        }
        this._openSheet(entry.instanceId);
      },
    });
    this._bindDrag(node, pos, entry.instanceId);
    return node;
  }

  // 隊上卡片拖曳：拖到有人＝互換、拖到空格＝移動。
  _bindDrag(node, pos, instanceId) {
    node.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      const sx = e.clientX;
      const sy = e.clientY;
      let ghost = null;

      const onMove = (ev) => {
        if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > DRAG_START_PX) {
          ghost = this._makeGhost(node, ev);
        }
        if (ghost) this._moveGhost(ghost, ev);
      };
      const onUp = (ev) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        if (!ghost) return;
        const targetPos = this._dropGhost(ghost, node, ev);
        if (targetPos && targetPos !== pos) {
          setPosition(instanceId, targetPos); // 互換/移動（setPosition 內建交換）
        }
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });
  }

  // 抽屜卡片拖曳：往上拖進戰場格位 → 上陣/替換。
  _bindBenchDrag(item, inst) {
    item.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      const sx = e.clientX;
      const sy = e.clientY;
      let ghost = null;

      const onMove = (ev) => {
        const dy = ev.clientY - sy;
        if (!ghost && dy < -BENCH_DRAG_UP_PX && Math.abs(dy) > Math.abs(ev.clientX - sx)) {
          ghost = this._makeGhost(item, ev);
        }
        if (ghost) this._moveGhost(ghost, ev);
      };
      const onUp = (ev) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        if (!ghost) return;
        const targetPos = this._dropGhost(ghost, item, ev);
        if (targetPos) {
          const occupied = store.state.formation.find((f) => f.pos === targetPos);
          if (occupied) removeFromFormation(occupied.instanceId); // 替換：原占位者下陣
          addToFormation(inst.instanceId, targetPos);
          toast(`${CARDS[inst.cardId].name} 上陣！`, { icon: '⚔' });
        }
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });
  }

  // ---- 拖曳共用：幽靈卡 / 目標格提示 / 落點解析 ----
  _makeGhost(node, ev) {
    const ghost = node.cloneNode(true);
    ghost.classList.add('drag-ghost');
    const r = node.getBoundingClientRect();
    ghost.style.width = `${r.width}px`;
    ghost.style.height = `${r.height}px`;
    document.body.appendChild(ghost);
    node.classList.add('drag-src');
    // 拖曳後吃掉這次 click（避免放開時觸發單擊行為）
    const eatClick = (ce) => {
      ce.stopImmediatePropagation();
      ce.preventDefault();
    };
    node.addEventListener('click', eatClick, { capture: true, once: true });
    setTimeout(() => node.removeEventListener('click', eatClick, { capture: true }), 350);
    this._moveGhost(ghost, ev);
    return ghost;
  }

  _moveGhost(ghost, ev) {
    ghost.style.left = `${ev.clientX}px`;
    ghost.style.top = `${ev.clientY}px`;
    const t = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.tcard');
    this.root.querySelectorAll('.tcard.drop-hint').forEach((n) => n.classList.remove('drop-hint'));
    if (t) t.classList.add('drop-hint');
  }

  // 回傳落點位置（1..6）或 null；並清理幽靈與提示。
  _dropGhost(ghost, srcNode, ev) {
    ghost.remove();
    srcNode.classList.remove('drag-src');
    this.root.querySelectorAll('.tcard.drop-hint').forEach((n) => n.classList.remove('drop-hint'));
    const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.tcard');
    return target?.dataset.pos ? Number(target.dataset.pos) : null;
  }

  _openSheet(instanceId) {
    // 詳情頁左右切換順序＝出戰位置順序 + 其餘持有英雄
    const s = store.state;
    const formationIds = [...s.formation].sort((a, b) => a.pos - b.pos).map((e) => e.instanceId);
    const others = s.cards.map((c) => c.instanceId).filter((id) => !formationIds.includes(id));
    openHeroSheet(instanceId, { list: [...formationIds, ...others] });
  }

  // 英雄選擇抽屜（編輯模式常駐；store 變更由 render 重建）。
  _mountDrawer() {
    const s = store.state;
    const bench = s.cards.filter((c) => !isInFormation(c.instanceId));

    const drawer = el('div', { class: 'swap-drawer' });
    drawer.appendChild(
      el('div', { class: 'sd-title' }, [
        el('span', { text: bench.length ? '往上拖到格位即可上陣／替換' : '沒有待命英雄（全部都在陣上）' }),
        el('button', {
          text: '完成',
          onClick: () => {
            this.drawerOpen = false;
            this._drawerTarget = null;
            this._drawerShown = false;
            this.render();
          },
        }),
      ])
    );

    const list = el('div', { class: 'sd-list' });
    const sorted = [...bench].sort((a, b) => b.level - a.level);
    for (const inst of sorted) {
      const card = CARDS[inst.cardId];
      const item = el('div', { class: 'swap-item pressable' }, [cardFrame(card, { level: inst.level, size: 'full' })]);
      longPress(item, () => this._openSheet(inst.instanceId), {
        onTap: () => {
          // 點一下：有指定格（從空格開的）→ 入該格並收抽屜；否則放第一個空位
          if (this._drawerTarget != null) {
            addToFormation(inst.instanceId, this._drawerTarget);
            toast(`${card.name} 上陣！`, { icon: '⚔' });
            this.drawerOpen = false;
            this._drawerTarget = null;
            this.render();
            return;
          }
          if (store.state.formation.length < 6) {
            addToFormation(inst.instanceId);
            toast(`${card.name} 上陣！`, { icon: '⚔' });
          } else {
            toast('隊伍已滿：把英雄拖到要替換的格位，或先點隊上英雄移出');
          }
        },
      });
      this._bindBenchDrag(item, inst);
      list.appendChild(item);
    }
    drawer.appendChild(list);
    this.root.appendChild(drawer);
    // 只在剛開啟時做進場動畫（編輯中每次 store 變更重建不再閃動）
    if (!this._drawerShown) {
      this._drawerShown = true;
      gsap.fromTo(drawer, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2, ease: 'power2.out', clearProps: 'transform' });
    }
  }
}
