// 角色詳情頁（英雄強化）：全螢幕 overlay——左滿版立繪、右資訊面板。
// 入口統一：任何地方點卡 / 長按卡圖 → openHeroSheet(instanceId, { list })。
// 左右滑動或 ‹ › 切換英雄；「強化」按住連續升級；上陣/下陣收在這裡（P5：破壞性操作不放單擊）。
import { gsap } from 'gsap';
import { el, clear, toast, fmt } from './dom.js';
import { store } from '../core/state.js';
import { CARDS } from '../data/cards.js';
import { CLASSES } from '../data/classes.js';
import { ELEMENT_LABEL } from '../data/elements.js';
import { artFor } from '../data/assets.js';
import { deriveStats, MAX_STARS, STAR_STAT_BONUS, STAR_MILESTONES } from '../core/stats.js';
import { levelUp, levelUpCost, canLevelUp, MAX_LEVEL } from '../systems/leveling.js';
import { isInFormation, toggleFormation, MAX_FORMATION } from '../systems/formation.js';
import { skillInfoForCard, passiveInfoForCard } from '../battle/skillText.js';
import { trackQuest } from '../systems/quests.js';
import { holdRepeat } from './gestures.js';

const SHEET_IN_S = 0.28;
const SHEET_OUT_S = 0.18;
const SWIPE_MIN_PX = 48;

const CLASS_GLYPH = { tank: '🛡', dps: '⚔', support: '✚' };

let _open = null; // 單例：同時只開一張

// openHeroSheet(instanceId, { list })：list 為可左右切換的 instanceId 順序（預設＝持有順序）。
export function openHeroSheet(instanceId, { list } = {}) {
  if (_open) _open.close(true);
  const sheet = new HeroSheet(instanceId, list);
  _open = sheet;
  return sheet;
}

class HeroSheet {
  constructor(instanceId, list) {
    this.list = list && list.length ? list : store.state.cards.map((c) => c.instanceId);
    this.idx = Math.max(0, this.list.indexOf(instanceId));
    this.node = el('div', { class: 'hero-sheet' });
    document.getElementById('overlay-root').appendChild(this.node);

    this._unsub = store.subscribe(() => this.renderPanel());
    this._onKey = (e) => {
      if (e.key === 'Escape') this.close();
      if (e.key === 'ArrowLeft') this.step(-1);
      if (e.key === 'ArrowRight') this.step(1);
    };
    document.addEventListener('keydown', this._onKey);
    this._bindSwipe();

    this.renderAll();
    gsap.fromTo(this.node, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: SHEET_IN_S, ease: 'power2.out', clearProps: 'transform' });
  }

  get inst() {
    return store.getCard(this.list[this.idx]);
  }

  close(instant = false) {
    if (_open === this) _open = null;
    this._unsub?.();
    document.removeEventListener('keydown', this._onKey);
    if (instant) {
      this.node.remove();
      return;
    }
    gsap.to(this.node, { opacity: 0, y: 20, duration: SHEET_OUT_S, ease: 'power2.in', onComplete: () => this.node.remove() });
  }

  step(dir) {
    const n = this.list.length;
    if (n <= 1) return;
    this.idx = (this.idx + dir + n) % n;
    this.renderAll();
    gsap.fromTo(this.node.querySelector('.hs-art'), { opacity: 0, x: dir * 30 }, { opacity: 1, x: 0, duration: 0.22, ease: 'power2.out' });
  }

  _bindSwipe() {
    let sx = null;
    this.node.addEventListener('pointerdown', (e) => {
      // 面板內（可捲動/按鈕）不啟動滑動換人
      if (e.target.closest('.hs-panel')) { sx = null; return; }
      sx = e.clientX;
    });
    this.node.addEventListener('pointerup', (e) => {
      if (sx == null) return;
      const dx = e.clientX - sx;
      sx = null;
      if (Math.abs(dx) >= SWIPE_MIN_PX) this.step(dx < 0 ? 1 : -1);
    });
  }

  renderAll() {
    const inst = this.inst;
    if (!inst) { this.close(true); return; }
    const card = CARDS[inst.cardId];
    clear(this.node);

    // 返回
    this.node.appendChild(el('div', { class: 'back-btn pressable', text: '‹', title: '返回', onClick: () => this.close() }));
    this.node.appendChild(el('div', { class: 'page-title', text: '英雄強化' }));

    // 左：滿版立繪（待機呼吸）
    const art = el('div', { class: 'hs-art' });
    const src = artFor(card.id);
    if (src) {
      const img = el('img', { src, alt: card.name });
      img.style.transformOrigin = '50% 100%';
      art.appendChild(img);
      gsap.to(img, { scaleY: 1.012, duration: 1.4, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    }
    this.node.appendChild(art);

    // 左下：身分名牌
    this.idBar = el('div', { class: 'hs-id' });
    this.node.appendChild(this.idBar);

    // 底部圓點 + 左右箭頭
    if (this.list.length > 1) {
      const dots = el('div', { class: 'hs-dots' });
      this.list.forEach((_, i) => dots.appendChild(el('i', { class: i === this.idx ? 'on' : '' })));
      this.node.appendChild(dots);
      this.node.appendChild(el('div', { class: 'hs-arrow', text: '‹', style: 'left:.4rem', onClick: () => this.step(-1) }));
      this.node.appendChild(el('div', { class: 'hs-arrow', text: '›', style: 'left:52%', onClick: () => this.step(1) }));
    }

    // 右：資訊面板
    this.panel = el('div', { class: 'hs-panel' });
    this.node.appendChild(this.panel);
    this.renderPanel();
  }

  // 面板局部重繪（升級/上下陣後由 store 驅動；立繪不動）。
  renderPanel() {
    const inst = this.inst;
    if (!inst || !this.panel) return;
    const card = CARDS[inst.cardId];
    const st = deriveStats(inst);
    const maxed = inst.level >= MAX_LEVEL;
    const next = maxed ? null : deriveStats({ ...inst, level: inst.level + 1 });
    const cost = levelUpCost(inst.level);
    const affordable = canLevelUp(inst);
    const inForm = isInFormation(inst.instanceId);

    // 身分名牌同步（屬性徽章 + 名字 + 星級）
    const stars = inst.stars ?? 0;
    clear(this.idBar);
    this.idBar.appendChild(el('span', { class: `el el-${card.element}`, text: ELEMENT_LABEL[card.element] }));
    this.idBar.appendChild(el('span', { class: 'nm', text: card.name }));
    this.idBar.appendChild(el('span', { class: 'hs-stars', text: '★'.repeat(stars) + '☆'.repeat(MAX_STARS - stars) }));

    const p = this.panel;
    clear(p);

    // 等級列
    p.appendChild(
      el('div', { class: 'hs-lvrow' }, [
        el('span', { class: 'hs-chip', text: '等級' }),
        el('span', { class: 'lvv', text: `Lv ${inst.level} / ${MAX_LEVEL}` }),
        el('span', {
          class: 'cls',
          text: `${CLASS_GLYPH[card.class]} ${CLASSES[card.class].label} · ${card.race}${card.series?.length ? ' · ' + card.series.join('／') : ''}`,
        }),
      ])
    );

    // 數值
    p.appendChild(el('div', { class: 'hs-ribbon', text: '數值' }));
    const stats = el('div', { class: 'hs-stats' });
    const rows = [
      ['❤ 生命', st.hp, next ? next.hp - st.hp : 0],
      ['⚔ 攻擊', st.atk, next ? next.atk - st.atk : 0],
      ['🛡 防禦', st.def, next ? next.def - st.def : 0],
    ];
    for (const [k, v, d] of rows) {
      stats.appendChild(
        el('div', { class: 'st' }, [
          el('span', { class: 'k', text: k }),
          el('span', { class: 'v', html: `${fmt(v)}${d > 0 ? ` <small>+${fmt(d)}</small>` : ''}` }),
        ])
      );
    }
    p.appendChild(stats);

    // 星級（重複卡自動升星；每星三圍加成 + 里程碑）
    p.appendChild(el('div', { class: 'hs-ribbon', text: '星級' }));
    const starLine = el('div', { class: 'hs-starline' });
    starLine.appendChild(el('span', { class: 'hs-stars big', text: '★'.repeat(stars) + '☆'.repeat(MAX_STARS - stars) }));
    starLine.appendChild(el('span', { class: 'st-note', text: `每星 三圍 +${Math.round(STAR_STAT_BONUS * 100)}%（重複抽到自動升星）` }));
    for (const [star, m] of Object.entries(STAR_MILESTONES)) {
      starLine.appendChild(
        el('span', { class: `st-mile${stars >= Number(star) ? ' on' : ''}`, text: `${star}★ ${m.desc}` })
      );
    }
    p.appendChild(starLine);

    // 技能
    p.appendChild(el('div', { class: 'hs-ribbon', text: '技能' }));
    const skill = skillInfoForCard(inst.cardId, card.class);
    if (skill) {
      p.appendChild(
        el('div', { class: 'hs-skills' }, [
          el('div', { class: 'hs-sk' }, [
            el('div', { class: 'ic', text: CLASS_GLYPH[card.class] || '✦' }),
            el('span', { class: 't', text: '絕技' }),
          ]),
          el('div', { class: 'hs-skdesc', html: `<b>${skill.name}</b>${skill.desc}` }),
        ])
      );
    }
    for (const desc of passiveInfoForCard(inst.cardId)) {
      p.appendChild(
        el('div', { class: 'hs-skills' }, [
          el('div', { class: 'hs-sk' }, [
            el('div', { class: 'ic psv', text: '✨' }),
            el('span', { class: 't', text: '被動' }),
          ]),
          el('div', { class: 'hs-skdesc', html: `<b>被動效果</b>${desc}` }),
        ])
      );
    }

    // 行動列
    const cta = el('div', { class: 'hs-cta' });
    const formBtn = el('div', {
      class: 'hs-btn sub pressable',
      html: inForm ? '下陣<small>移出隊伍</small>' : '上陣<small>加入隊伍</small>',
      onClick: () => {
        const r = toggleFormation(inst.instanceId);
        if (!r.ok && r.reason === 'full') toast(`陣容已滿（${MAX_FORMATION} 人）`);
        else toast(inForm ? `${card.name} 已下陣` : `${card.name} 上陣！`, { icon: inForm ? '↩' : '⚔' });
      },
    });
    cta.appendChild(formBtn);

    const upBtn = el('div', {
      class: `hs-btn pressable${maxed || !affordable ? ' disabled' : ''}`,
      html: maxed
        ? '已滿級<small>MAX</small>'
        : `強　化<small>🔹${cost.essence} · 🪙${cost.gold}</small>`,
    });
    if (!maxed && affordable) upBtn.appendChild(el('span', { class: 'dot' }));
    if (!maxed) {
      holdRepeat(upBtn, () => {
        const r = levelUp(inst.instanceId);
        if (r.ok) {
          trackQuest('levelup');
          gsap.fromTo(upBtn, { scale: 0.97 }, { scale: 1, duration: 0.15 });
        } else if (r.reason === 'no-essence') toast('養成精華不足');
        else if (r.reason === 'no-gold') toast('金幣不足');
      });
    }
    cta.appendChild(upBtn);
    p.appendChild(cta);
  }
}
