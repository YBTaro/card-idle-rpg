// 角色詳情頁（英雄強化）：全螢幕 overlay——左滿版立繪、右資訊面板。
// 入口統一：任何地方點卡 / 長按卡圖 → openHeroSheet(instanceId, { list })。
// 左右滑動或 ‹ › 切換英雄；「強化」按住連續升級。
// 面板為單頁式（無分頁）：身分 → 等級/星級 → 數值(含下一級增量) → 技能 → 強化。
// 上陣/下陣不在這裡（隊伍頁的「英雄替換」抽屜負責）。
import { gsap } from 'gsap';
import { el, clear, toast, fmt } from './dom.js';
import { store } from '../core/state.js';
import { CARDS } from '../data/cards.js';
import { CLASSES } from '../data/classes.js';
import { ELEMENT_LABEL } from '../data/elements.js';
import { artFor } from '../data/assets.js';
import { deriveStats, MAX_STARS, STAR_STAT_BONUS, STAR_MILESTONES } from '../core/stats.js';
import { levelUp, levelUpCost, canLevelUp, MAX_LEVEL } from '../systems/leveling.js';
import { skillInfoForCard, passiveInfoForCard, triggerInfoForCard, teamSkillInfoForCard, onEnterInfoForCard, basicInfoForCard } from '../battle/skillText.js';
import { trackQuest } from '../systems/quests.js';
import { icon } from './icons.js';

const SHEET_IN_S = 0.28;
const SHEET_OUT_S = 0.18;
const SWIPE_MIN_PX = 48;

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

  // 面板局部重繪（升級/升星後由 store 驅動；立繪不動）。
  renderPanel() {
    const inst = this.inst;
    if (!inst || !this.panel) return;
    const card = CARDS[inst.cardId];
    const st = deriveStats(inst);
    const maxed = inst.level >= MAX_LEVEL;
    const next = maxed ? null : deriveStats({ ...inst, level: inst.level + 1 });
    const cost = levelUpCost(inst.level);
    const affordable = canLevelUp(inst);
    const stars = inst.stars ?? 0;

    // 身分名牌同步（屬性寶石 + 名字 + 星級）
    clear(this.idBar);
    this.idBar.appendChild(icon(`el_${card.element}`, 22));
    this.idBar.appendChild(el('span', { class: 'nm', text: card.name }));
    this.idBar.appendChild(el('span', { class: 'hs-stars', text: '★'.repeat(stars) + '☆'.repeat(MAX_STARS - stars) }));

    const p = this.panel;
    clear(p);

    // 1) 身分標籤列：職業 / 屬性 / 種族 / 系列——一行讀完這隻是誰
    const tags = el('div', { class: 'hs-tags' });
    const clsTag = el('span', { class: 'hs-tag cls' });
    clsTag.appendChild(icon(`cls_${card.class}`, 15));
    clsTag.appendChild(el('span', { text: ` ${CLASSES[card.class].label}` }));
    tags.appendChild(clsTag);
    const elTag = el('span', { class: 'hs-tag el' });
    elTag.appendChild(icon(`el_${card.element}`, 14));
    elTag.appendChild(el('span', { text: ` ${ELEMENT_LABEL[card.element]}` }));
    tags.appendChild(elTag);
    tags.appendChild(el('span', { class: 'hs-tag race', text: card.race }));
    for (const sName of card.series ?? []) {
      tags.appendChild(el('span', { class: 'hs-tag series', text: sName }));
    }
    p.appendChild(tags);

    // 2) 等級 × 星級卡：本頁主軸（強化）的現況，一眼看懂「現在幾級、下一級、幾星」
    const lvCard = el('div', { class: 'hs-lvcard' });
    const lvLine = el('div', { class: 'hs-lvbig' });
    lvLine.appendChild(el('b', { text: `Lv.${inst.level}` }));
    if (!maxed) {
      lvLine.appendChild(el('span', { class: 'arr', text: '»' }));
      lvLine.appendChild(el('i', { text: `Lv.${inst.level + 1}` }));
    } else {
      lvLine.appendChild(el('span', { class: 'maxmark', text: 'MAX' }));
    }
    lvCard.appendChild(lvLine);
    lvCard.appendChild(el('span', { class: 'hs-stars big', text: '★'.repeat(stars) + '☆'.repeat(MAX_STARS - stars) }));
    p.appendChild(lvCard);

    // 3) 數值：永遠帶下一級增量（升級的理由直接寫在數字旁）
    p.appendChild(el('div', { class: 'hs-ribbon', text: '數值' }));
    const stats = el('div', { class: 'hs-stats' });
    const rows = [
      ['❤', '生命', st.hp, next ? next.hp - st.hp : 0],
      ['⚔', '攻擊', st.atk, next ? next.atk - st.atk : 0],
      ['🛡', '防禦', st.def, next ? next.def - st.def : 0],
    ];
    for (const [ic, k, v, d] of rows) {
      stats.appendChild(
        el('div', { class: 'st' }, [
          el('span', { class: 'ic', text: ic }),
          el('span', { class: 'k', text: k }),
          el('span', { class: 'v', html: `${fmt(v)}${d > 0 ? ` <small class="up">+${fmt(d)}</small>` : ''}` }),
        ])
      );
    }
    p.appendChild(stats);

    // 4) 星級成長：一行說明 + 里程碑膠囊（達成點亮）
    const starLine = el('div', { class: 'hs-starline' });
    starLine.appendChild(el('span', { class: 'st-note', text: `每星 三圍 +${Math.round(STAR_STAT_BONUS * 100)}%（重複抽到自動升星）` }));
    for (const [star, m] of Object.entries(STAR_MILESTONES)) {
      starLine.appendChild(
        el('span', { class: `st-mile${stars >= Number(star) ? ' on' : ''}`, text: `${star}★ ${m.desc}` })
      );
    }
    p.appendChild(starLine);

    // 5) 技能：絕技 + 被動
    p.appendChild(el('div', { class: 'hs-ribbon', text: '技能' }));
    const skill = skillInfoForCard(inst.cardId, card.class);
    if (skill) {
      const skIc = el('div', { class: 'ic' });
      skIc.appendChild(icon(`cls_${card.class}`, 20));
      const skLv = inst.skillLv ?? 1; // 技能等級（升級入口與材料之後開）
      p.appendChild(
        el('div', { class: 'hs-skills' }, [
          el('div', { class: 'hs-sk' }, [skIc, el('span', { class: 't', text: '絕技' })]),
          el('div', { class: 'hs-skdesc', html: `<b>${skill.name}<i class="sklv">Lv.${skLv}</i></b>${skill.desc}` }),
        ])
      );
    }
    // 普攻：每張卡固定顯示（標準卡寫「對位單體 100%」、變體卡寫各自描述）
    const basic = basicInfoForCard(inst.cardId);
    const basicLabel = card.basicAttack ? '特殊普攻' : '普攻';
    p.appendChild(
      el('div', { class: 'hs-skills' }, [
        el('div', { class: 'hs-sk' }, [el('div', { class: 'ic psv', text: '🗡' }), el('span', { class: 't', text: '普攻' })]),
        el('div', { class: 'hs-skdesc', html: `<b>${basicLabel}</b>${basic}` }),
      ])
    );
    // 被動四分類（進場 / 光環被動含觸發 / 隊伍技；星級里程碑在星級區）
    const skillRow = (glyph, label, html) =>
      el('div', { class: 'hs-skills' }, [
        el('div', { class: 'hs-sk' }, [
          el('div', { class: 'ic psv', text: glyph }),
          el('span', { class: 't', text: label }),
        ]),
        el('div', { class: 'hs-skdesc', html }),
      ]);
    const enter = onEnterInfoForCard(inst.cardId);
    if (enter) p.appendChild(skillRow('🌀', '進場', `<b>進場被動</b>${enter}`));
    for (const desc of passiveInfoForCard(inst.cardId)) {
      p.appendChild(skillRow('✨', '光環', `<b>光環被動</b>${desc}`));
    }
    for (const t of triggerInfoForCard(inst.cardId)) {
      p.appendChild(skillRow('⚡', '光環', `<b>${t.name}</b>${t.desc}`)); // 觸發歸光環被動分類
    }
    for (const desc of teamSkillInfoForCard(inst.cardId)) {
      p.appendChild(skillRow('👥', '隊伍技', `<b>隊伍技</b>${desc}`));
    }

    // 6) 行動列：「強化」一次一級 ＋「升到頂」一鍵升到資源上限（玩家自己選節奏）
    const cta = el('div', { class: 'hs-cta' });
    const upBtn = el('div', {
      class: `hs-btn pressable${maxed || !affordable ? ' disabled' : ''}`,
      html: maxed
        ? '已滿級<small>MAX</small>'
        : `強　化<small>🔹${cost.essence} · 🪙${cost.gold}</small>`,
      onClick: () => {
        if (maxed) return;
        const r = levelUp(inst.instanceId);
        if (r.ok) trackQuest('levelup');
        else if (r.reason === 'no-essence') toast('養成精華不足');
        else if (r.reason === 'no-gold') toast('金幣不足');
      },
    });
    if (!maxed && affordable) upBtn.appendChild(el('span', { class: 'dot' }));
    cta.appendChild(upBtn);
    // 升到頂：連續升級到滿級或資源不足為止
    const maxBtn = el('div', {
      class: `hs-btn sub pressable${maxed || !affordable ? ' disabled' : ''}`,
      html: '升到頂<small>直到滿級或資源不足</small>',
      onClick: () => {
        if (maxed) return;
        const id = inst.instanceId;
        let n = 0;
        while (n < MAX_LEVEL) {
          const r = levelUp(id);
          if (!r.ok) break;
          trackQuest('levelup');
          n += 1;
        }
        if (n > 0) toast(`一口氣升了 ${n} 級！`, { icon: '⏫' });
        else toast('資源不足，無法升級');
      },
    });
    cta.appendChild(maxBtn);
    p.appendChild(cta);
  }
}
