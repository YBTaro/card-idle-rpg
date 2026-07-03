// 角色分頁：陣容編輯（前/後排 5 格）+ 角色清單（升級、上陣/下陣）。
import { el, clear, toast } from './dom.js';
import { store } from '../core/state.js';
import { deriveStats } from '../core/stats.js';
import { CARDS } from '../data/cards.js';
import { ELEMENT_LABEL } from '../data/elements.js';
import { CLASSES } from '../data/classes.js';
import { cardFrame } from './cardFrame.js';
import { levelUp, levelUpCost, canLevelUp, MAX_LEVEL } from '../systems/leveling.js';
import { skillInfoForCard } from '../battle/skillText.js';
import {
  isInFormation,
  toggleFormation,
  setPosition,
  formationSlot,
  positionTaken,
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
    const rows = [
      { label: '前排', positions: [1, 2, 3] },
      { label: '後排', positions: [4, 5, 6] },
    ];
    for (const { label, positions } of rows) {
      const rowEl = el('div', { class: 'formation-row' }, [
        el('div', { class: 'row-label', text: label }),
      ]);
      for (const pos of positions) {
        const entry = store.state.formation.find((e) => e.pos === pos);
        if (!entry) {
          rowEl.appendChild(el('div', { class: 'slot empty', text: `${pos}・（空）` }));
          continue;
        }
        const inst = store.getCard(entry.instanceId);
        const card = inst ? CARDS[inst.cardId] : null;
        rowEl.appendChild(
          el('div', { class: 'slot filled', title: '點擊下陣', onClick: () => {
            toggleFormation(entry.instanceId);
            this._changed();
          } }, [
            card ? cardFrame(card, { size: 'mini' }) : el('span', { class: 'slot-name', text: '?' }),
            el('span', { class: 'slot-name', text: card ? card.name : '' }),
            el('span', { class: 'slot-sub', text: card ? `${pos}・Lv${inst.level}・${CLASSES[card.class].label}` : '' }),
          ])
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
      cardFrame(card, { level: maxed ? 'MAX' : inst.level, size: 'full' }),
      el('div', {}, [
        el('span', { class: `badge element ${card.element}`, text: ELEMENT_LABEL[card.element] }),
        el('span', { class: 'badge class', text: CLASSES[card.class].label }),
      ]),
      el('div', { class: 'stats', html: `❤ <b>${st.hp}</b>　⚔ <b>${st.atk}</b>　🛡 <b>${st.def}</b>` }),
    ]);

    // 技能描述（由技能資料自動生成，數值改了描述跟著變）。
    const skill = skillInfoForCard(inst.cardId, card.class);
    if (skill) {
      node.appendChild(
        el('div', { class: 'card-skill' }, [
          el('span', { class: 'card-skill-name', text: `絕技・${skill.name}` }),
          el('span', { class: 'card-skill-desc', text: skill.desc }),
        ])
      );
    }

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
          const r = toggleFormation(inst.instanceId, null);
          if (!r.ok && r.reason === 'full') toast(`陣容已滿（${MAX_FORMATION} 人）`);
          this._changed();
        },
      })
    );

    // 換位置
    if (inForm) {
      actions.appendChild(
        el('button', {
          text: '換位置',
          onClick: () => {
            const slot = formationSlot(inst.instanceId);
            if (!slot) return;
            const cur = slot.pos;
            // 找下一個未被占用的位置（環狀）
            let next = cur;
            for (let i = 1; i <= 6; i++) {
              const cand = ((cur - 1 + i) % 6) + 1;
              if (!positionTaken(cand) || cand === cur) { next = cand; break; }
            }
            if (next !== cur) {
              setPosition(inst.instanceId, next);
              this._changed();
            }
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
