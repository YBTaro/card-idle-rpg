// 角色分頁：陣容編輯（前/後排 5 格）+ 角色清單（升級、上陣/下陣）。
import { el, clear, toast } from './dom.js';
import { store } from '../core/state.js';
import { deriveStats } from '../core/stats.js';
import { CARDS } from '../data/cards.js';
import { ELEMENT_LABEL } from '../data/elements.js';
import { CLASSES } from '../data/classes.js';
import { levelUp, levelUpCost, canLevelUp, MAX_LEVEL } from '../systems/leveling.js';
import {
  isInFormation,
  toggleFormation,
  toggleRow,
  formationSlot,
  MAX_FORMATION,
} from '../systems/formation.js';

export class RosterUI {
  constructor(root, { onFormationChange } = {}) {
    this.root = root;
    this.onFormationChange = onFormationChange;
    this.render();
  }

  render() {
    clear(this.root);
    this.root.appendChild(this._formationSection());
    this.root.appendChild(this._rosterSection());
  }

  _formationSection() {
    const wrap = el('div');
    wrap.appendChild(
      el('p', { class: 'section-title', text: `出戰陣容（${store.state.formation.length}/${MAX_FORMATION}）` })
    );
    const formation = el('div', { class: 'formation' });
    for (const row of ['front', 'back']) {
      const rowEl = el('div', { class: 'formation-row' }, [
        el('div', { class: 'row-label', text: row === 'front' ? '前排' : '後排' }),
      ]);
      const members = store.state.formation.filter((e) => e.row === row);
      if (members.length === 0) {
        rowEl.appendChild(el('div', { class: 'slot empty', text: '（空）' }));
      }
      for (const entry of members) {
        const inst = store.getCard(entry.instanceId);
        if (!inst) continue;
        const card = CARDS[inst.cardId];
        rowEl.appendChild(
          el(
            'div',
            {
              class: 'slot filled',
              title: '點擊切換前/後排',
              onClick: () => {
                toggleRow(entry.instanceId);
                this._changed();
              },
            },
            [
              el('span', { class: 'slot-name', text: card.name }),
              el('span', { class: 'slot-sub', text: `Lv${inst.level}・${CLASSES[card.class].label}` }),
            ]
          )
        );
      }
      formation.appendChild(rowEl);
    }
    wrap.appendChild(formation);
    return wrap;
  }

  _rosterSection() {
    const wrap = el('div');
    wrap.appendChild(el('p', { class: 'section-title', text: `角色（${store.state.cards.length}）` }));
    const grid = el('div', { class: 'card-grid' });
    // 已上陣排前面
    const sorted = [...store.state.cards].sort(
      (a, b) => Number(isInFormation(b.instanceId)) - Number(isInFormation(a.instanceId))
    );
    for (const inst of sorted) grid.appendChild(this._cardEl(inst));
    wrap.appendChild(grid);
    return wrap;
  }

  _cardEl(inst) {
    const card = CARDS[inst.cardId];
    const st = deriveStats(inst);
    const inForm = isInFormation(inst.instanceId);
    const slot = formationSlot(inst.instanceId);
    const cost = levelUpCost(inst.level);
    const maxed = inst.level >= MAX_LEVEL;

    const node = el('div', { class: `card${inForm ? ' in-formation' : ''}` }, [
      el('div', { class: 'card-head' }, [
        el('span', { class: 'card-name', text: card.name }),
        el('span', { class: 'lvl', text: maxed ? 'MAX' : `Lv${inst.level}` }),
      ]),
      el('div', {}, [
        el('span', { class: `badge element ${card.element}`, text: ELEMENT_LABEL[card.element] }),
        el('span', { class: 'badge class', text: CLASSES[card.class].label }),
      ]),
      el('div', { class: 'stats', html: `❤ <b>${st.hp}</b>　⚔ <b>${st.atk}</b>　🛡 <b>${st.def}</b>　⚡ <b>${st.spd}</b>` }),
    ]);

    const actions = el('div', { class: 'card-actions' });

    // 升級
    const lvBtn = el('button', {
      text: maxed ? '已滿級' : `升級 🔹${cost.essence}/🪙${cost.gold}`,
      onClick: () => {
        const r = levelUp(inst.instanceId);
        if (r.ok) toast(`${card.name} 升到 Lv${r.stats.level}`);
        else if (r.reason === 'no-essence') toast('養成精華不足');
        else if (r.reason === 'no-gold') toast('金幣不足');
      },
    });
    lvBtn.disabled = maxed || !canLevelUp(inst);
    actions.appendChild(lvBtn);

    // 上陣/下陣
    actions.appendChild(
      el('button', {
        text: inForm ? '下陣' : '上陣',
        class: inForm ? '' : 'primary',
        onClick: () => {
          const r = toggleFormation(inst.instanceId, CLASSES[card.class].preferredRow);
          if (!r.ok && r.reason === 'full') toast(`陣容已滿（${MAX_FORMATION} 人）`);
          this._changed();
        },
      })
    );

    // 前/後排切換
    if (inForm) {
      actions.appendChild(
        el('button', {
          text: slot.row === 'front' ? '→後排' : '→前排',
          onClick: () => {
            toggleRow(inst.instanceId);
            this._changed();
          },
        })
      );
    }

    node.appendChild(actions);
    return node;
  }

  _changed() {
    this.onFormationChange?.();
  }
}
