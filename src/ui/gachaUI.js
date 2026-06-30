// 抽卡分頁：抽卡按鈕 + 結果展示。
import { el, clear, toast } from './dom.js';
import { store } from '../core/state.js';
import { pull, canPull } from '../systems/gacha.js';
import { GACHA_COST_TICKETS } from '../data/gachaTable.js';

export class GachaUI {
  constructor(root) {
    this.root = root;
    this.lastResult = null;
    this.render();
  }

  render() {
    clear(this.root);
    const box = el('div', { class: 'gacha-box' });

    box.appendChild(el('p', { class: 'section-title', text: '抽卡（一抽一個・高機率素材／低機率稀有卡）' }));
    box.appendChild(
      el('p', { text: `持有抽卡券：${store.state.currencies.tickets} 　每抽消耗 ${GACHA_COST_TICKETS} 券` })
    );

    const btnRow = el('div', { style: 'display:flex;gap:10px;justify-content:center;margin-top:10px' });
    const pull1 = el('button', {
      class: 'primary',
      text: '抽 1 次',
      onClick: () => this._doPull(1),
    });
    const pull10 = el('button', {
      text: '抽 10 次',
      onClick: () => this._doPull(10),
    });
    pull1.disabled = !canPull();
    pull10.disabled = store.state.currencies.tickets < 1;
    btnRow.append(pull1, pull10);
    box.appendChild(btnRow);

    box.appendChild(this._resultEl());
    this.root.appendChild(box);
  }

  _doPull(times) {
    const results = [];
    for (let i = 0; i < times; i++) {
      if (!canPull()) break;
      results.push(pull());
    }
    if (results.length === 0) {
      toast('抽卡券不足');
      return;
    }
    this.lastResult = results;
    const gotCard = results.some((r) => r.type === 'card');
    toast(gotCard ? '★ 抽到新角色！' : `完成 ${results.length} 抽`);
    this.render();
  }

  _resultEl() {
    if (!this.lastResult) {
      return el('div', { class: 'gacha-result', text: '尚未抽卡' });
    }
    const rare = this.lastResult.some((r) => r.type === 'card');
    const wrap = el('div', { class: `gacha-result${rare ? ' rare' : ''}` });
    if (this.lastResult.length === 1) {
      const r = this.lastResult[0];
      wrap.appendChild(el('div', { class: 'big', text: r.label }));
    } else {
      wrap.appendChild(el('div', { class: 'big', text: `${this.lastResult.length} 連抽結果` }));
      const list = el('div', { style: 'font-size:13px;color:var(--text-dim);line-height:1.7' });
      for (const r of this.lastResult) {
        list.appendChild(el('div', { text: (r.type === 'card' ? '★ ' : '・') + r.label }));
      }
      wrap.appendChild(list);
    }
    return wrap;
  }
}
