// 商店頁：每日免費禮 + 每日特惠（折扣標籤）+ 常駐兌換。
// 動效：貨架交錯進場、購買 → 獎勵飛向貨幣列 + 卡片彈跳，拒絕瞬間變動感。
import { gsap } from 'gsap';
import { el, clear, toast, fmt } from './dom.js';
import { icon } from './icons.js';
import { store } from '../core/state.js';
import { nav } from './router.js';
import { staggerIn, flyReward } from './anim.js';
import { SHOP_ITEMS, FREE_GIFT, dailyDeals, boughtCount, buyShopItem } from '../systems/shop.js';

export class ShopUI {
  constructor(root) {
    this.root = root;
  }

  onShow() { this.render(); }

  render() {
    clear(this.root);
    this.root.appendChild(el('div', { class: 'back-btn pressable', title: '回主城', onClick: () => nav.go('home') }, [icon('back', 22)]));
    this.root.appendChild(el('div', { class: 'page-title left', text: '商店' }));

    const body = el('div', { class: 'sh-body' });

    // 每日特惠（含免費禮）—— 金色「購買」
    body.appendChild(el('div', { class: 'sh-head' }, [
      el('span', { class: 't', text: '每日特惠' }),
      el('span', { class: 's', text: '每日 05:00 更新' }),
    ]));
    const deals = el('div', { class: 'sh-grid deals' });
    deals.appendChild(this._itemCard(FREE_GIFT, { free: true }));
    for (const d of dailyDeals()) deals.appendChild(this._itemCard(d, { deal: true }));
    body.appendChild(deals);

    // 常駐兌換所 —— 藍色「兌換」
    body.appendChild(el('div', { class: 'sh-head' }, [el('span', { class: 't', text: '兌換所' })]));
    const fixed = el('div', { class: 'sh-grid' });
    for (const it of SHOP_ITEMS) fixed.appendChild(this._itemCard(it, { exchange: true }));
    body.appendChild(fixed);

    this.root.appendChild(body);
    staggerIn([...deals.children, ...fixed.children], { dy: 18, step: 0.06 });
  }

  _itemCard(item, { free = false, deal = false, exchange = false } = {}) {
    const bought = boughtCount(item.id);
    const soldOut = bought >= item.daily;
    const action = exchange ? '兌換' : '購買';
    const node = el('div', { class: `sh-item${soldOut ? ' sold' : ''}` });
    if (deal) node.appendChild(el('div', { class: 'sh-off', text: `-${Math.round((1 - item.off) * 100)}%` }));
    node.appendChild(el('div', { class: 'sh-name', text: item.name }));
    node.appendChild(el('div', { class: 'sh-ic', text: item.icon }));
    node.appendChild(el('div', { class: 'sh-desc', text: item.desc }));
    // 價格（特惠附原價刪除線；免費顯示「免費」）
    const price = el('div', { class: 'sh-price' });
    if (free) {
      price.appendChild(el('b', { text: '免費' }));
    } else {
      if (deal) price.appendChild(el('s', { text: fmt(item.origCost.gold) }));
      price.appendChild(el('b', { text: fmt(item.cost.gold) }));
    }
    node.appendChild(price);
    // 動作鈕：購買（金）/ 兌換（藍），附今日次數
    const btn = el('button', {
      class: `sh-buy pressable${exchange ? ' blue' : ''}${soldOut ? ' sold' : ''}`,
      text: `${action} · ${bought}/${item.daily}`,
    });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (soldOut) { toast('明天再來吧！'); return; }
      try {
        const grants = buyShopItem(item);
        flyReward(grants, node);
        // 購買回饋：卡片彈一下再刷新（不瞬間重繪）
        gsap.fromTo(node, { scale: 1 }, {
          scale: 1.06, duration: 0.12, yoyo: true, repeat: 1, ease: 'power2.out',
          onComplete: () => this.render(),
        });
        toast(free ? '已領取每日免費禮' : `${action}成功`, { icon: '🛒' });
      } catch (err) {
        toast(err.message);
        gsap.fromTo(node, { x: 0 }, { x: 6, duration: 0.05, yoyo: true, repeat: 5, clearProps: 'transform' }); // 搖頭
      }
    });
    node.appendChild(btn);
    return node;
  }
}
