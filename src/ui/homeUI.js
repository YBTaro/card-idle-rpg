// 主城大廳：登入落點與樞紐（hub-and-spoke 的 hub）。
// 版式依參考原型：左上檔案+貨幣、左中事件卡+台詞泡泡、左下營運捷徑、
// 中央看板英雄、右側菱形模式入口、右上工具列、底部飾條功能列。
import { gsap } from 'gsap';
import { el, clear, toast, fmt } from './dom.js';
import { store } from '../core/state.js';
import { nav } from './router.js';
import { computeBadges, dot } from './badges.js';
import {
  openQuestsSheet,
  openSigninSheet,
  openIdleSheet,
  openSettingsSheet,
} from './metaSheets.js';
import { queuePopup } from './modal.js';
import { runTutorial } from './tutorial.js';
import { stageLabel, featuredHero } from '../systems/profile.js';
import { openPlayerCard, myProfileData } from './profileCard.js';
import { net } from '../net/api.js';
import { icon } from './icons.js';
import { staggerIn } from './anim.js';
import { canSignin } from '../systems/signin.js';
import { idlePending, canClaimIdle } from '../systems/idle.js';
import { cutoutFor, portraitFor } from '../data/assets.js';
import { CARDS } from '../data/cards.js';

// 看板英雄台詞（點立繪輪播）。
const SPEECHES = [
  '今天也一起加油吧，指揮官。',
  '掛機寶箱好像快滿出來了……要不要看看？',
  '隊伍的陣型，決定了勝負的一半。',
  '召喚之門今天感覺運氣不錯喔。',
  '再打幾場，我們就能推進下一章了！',
];

const BREATH_S = 2.6; // 看板英雄待機呼吸週期

export class HomeUI {
  constructor(root) {
    this.root = root;
    this._speechIdx = 0;
    this._breath = null;
    this.render();
  }

  onShow() {
    this.render();
  }

  render() {
    const s = store.state;
    const badges = computeBadges(s);
    this._breath?.kill();
    clear(this.root);

    // 背景層
    this.root.appendChild(el('div', { class: 'hub-lake' }));
    this.root.appendChild(el('div', { class: 'hub-hills' }));

    // 中央看板英雄
    const hero = featuredHero(s);
    const heroWrap = el('div', { class: 'hub-hero pressable' });
    heroWrap.appendChild(el('div', { class: 'hub-halo' }));
    if (hero && cutoutFor(hero.cardId)) {
      heroWrap.appendChild(el('img', { src: cutoutFor(hero.cardId), alt: CARDS[hero.cardId]?.name || '' }));
    }
    heroWrap.addEventListener('click', () => this._nextSpeech());
    this.root.appendChild(heroWrap);
    // 待機呼吸（transform origin 腳底）
    heroWrap.style.transformOrigin = '50% 100%';
    this._breath = gsap.to(heroWrap, {
      scaleY: 1.012,
      scaleX: 1.004,
      duration: BREATH_S / 2,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    });

    // 台詞泡泡
    const heroName = hero ? CARDS[hero.cardId]?.name : '';
    this._say = el('div', { class: 'hub-say' }, [
      el('b', { text: heroName || '？？？' }),
      el('span', { text: SPEECHES[this._speechIdx % SPEECHES.length] }),
    ]);
    this.root.appendChild(this._say);

    // 左上：檔案（點開自己的名片，可編輯暱稱/頭像/簽名）+ 貨幣
    const ava = el('div', {
      class: 'hub-ava pressable',
      onClick: () => openPlayerCard({ ...myProfileData(), ...(net.profile ?? {}) }, { editable: true }),
    });
    const p = hero ? portraitFor(hero.cardId) : null;
    if (p) ava.appendChild(el('img', { src: p.src, alt: '', style: `object-position:${p.x * 100}% ${p.y * 100}%` }));
    this.root.appendChild(
      el('div', { class: 'hub-tl' }, [
        ava,
        el('div', { class: 'cols' }, [
          el('div', { class: 'prow' }, [
            currencyPill('coin', s.currencies.gold),
            currencyPill('ticket', s.currencies.tickets),
            currencyPill('essence', s.inventory.materials.essence || 0),
          ]),
        ]),
      ])
    );

    // 左中：事件卡（通關進度導流）
    this.root.appendChild(
      el('div', {
        class: 'hub-event pressable',
        onClick: () => nav.go('battle'),
      }, [
        el('div', { class: 'e1', text: `討伐 第 ${stageLabel(s.progress.stage || 1)} 關` }),
        el('div', { class: 'e2', text: '前往戰役，掃平敵軍 →' }),
      ])
    );

    // 左下：營運捷徑（社交按鈕與營運捷徑並列）
    const sc = el('div', { class: 'hub-sc' });
    sc.appendChild(shortcut('friends', '好友', false, () => nav.go('friends')));
    sc.appendChild(shortcut('quests', '任務', badges.quests, () => openQuestsSheet()));
    sc.appendChild(shortcut('signin', '簽到', badges.signin, () => openSigninSheet()));
    this._idleShortcut = shortcut('idle', '掛機箱', badges.idle, () => openIdleSheet());
    sc.appendChild(this._idleShortcut);
    this.root.appendChild(sc);

    // 右側：菱形模式入口
    const dia = el('div', { class: 'hub-dia' });
    this._battleDia = diamond('battle', '戰役', { big: true, badge: false, onClick: () => nav.go('battle') });
    dia.appendChild(this._battleDia);
    dia.appendChild(diamond('arena', '競技場', { onClick: () => nav.go('arena') }));
    dia.appendChild(diamond('guild', '公會', { onClick: () => nav.go('guild') }));
    dia.appendChild(diamond('tower', '試煉塔', { onClick: () => nav.go('tower') }));
    this.root.appendChild(dia);

    // 右上：工具列
    this.root.appendChild(
      el('div', { class: 'hub-util' }, [
        el('div', { class: 'icon-btn pressable', onClick: () => openSettingsSheet({ onReset: () => this.render() }) }, [icon('settings', 22)]),
      ])
    );

    // 底部飾條功能列
    const bar = el('div', { class: 'hub-bar' });
    bar.appendChild(barItem('home', '主城', { on: true }));
    bar.appendChild(barItem('team', '隊伍', { onClick: () => nav.go('team') }));
    this._heroesBar = barItem('heroes', '英雄', { onClick: () => nav.go('heroes') });
    bar.appendChild(this._heroesBar);
    this._gachaBar = barItem('gacha', '召喚', { onClick: () => nav.go('gacha') });
    bar.appendChild(this._gachaBar);
    bar.appendChild(barItem('shop', '商店', { onClick: () => nav.go('shop') }));
    this.root.appendChild(bar);

    // 進場動效：捷徑/入口/功能列交錯浮現（登入的儀式感，不瞬間全亮）
    staggerIn(sc.children, { dy: 10, step: 0.05 });
    staggerIn(dia.children, { dy: 12, step: 0.07 });
    staggerIn(bar.children, { dy: 8, step: 0.04 });
  }

  _nextSpeech() {
    this._speechIdx += 1;
    const span = this._say?.querySelector('span');
    if (span) {
      span.textContent = SPEECHES[this._speechIdx % SPEECHES.length];
      gsap.fromTo(this._say, { opacity: 0.4, y: 4 }, { opacity: 1, y: 0, duration: 0.25 });
    }
  }

  // 登入彈窗佇列：簽到 → 掛機箱滿。只在啟動時呼叫一次（main.js）。
  startupPopups() {
    if (!store.state.meta.ftueDone) return; // 新手先跑引導，不疊彈窗
    if (canSignin()) queuePopup((done) => openSigninSheet(done));
    const p = idlePending();
    if (canClaimIdle() && (p.capped || p.minutes >= 120)) queuePopup((done) => openIdleSheet(done));
  }

  // FTUE：指向 戰役 → 掛機箱 → 召喚 → 隊伍。
  startupTutorial() {
    runTutorial([
      {
        target: () => this._battleDia,
        title: '⚔ 戰役',
        desc: '隊伍會全自動戰鬥、勝利就推進關卡。點這裡看你的英雄們作戰！',
      },
      {
        target: () => this._idleShortcut,
        title: '📦 掛機獎勵',
        desc: '離線也在累積金幣與精華，記得每天回來開箱（12 小時封頂）。',
      },
      {
        target: () => this._gachaBar,
        title: '🎴 召喚',
        desc: '用召喚券招募新英雄，重複的會自動轉化成養成精華。',
      },
      {
        target: () => this._heroesBar.previousSibling,
        title: '🃏 隊伍',
        desc: '編排前後衛陣型、長按英雄卡查看詳細數值與技能。',
      },
    ]);
  }
}

function currencyPill(iconName, value) {
  const ic = el('span', { class: 'ic' });
  ic.appendChild(icon(iconName, 17));
  return el('div', { class: 'pill' }, [ic, el('span', { text: fmt(value) })]);
}

function shortcut(iconName, label, badge, onClick) {
  const ic = el('span', { class: 'ic' });
  ic.appendChild(icon(iconName, 24));
  const node = el('div', { class: 'hub-sci pressable', onClick }, [ic, el('span', { text: label })]);
  if (badge) ic.appendChild(dot());
  return node;
}

function diamond(iconName, label, { big = false, locked = false, badge = false, onClick } = {}) {
  const sq = el('div', { class: 'dsq' });
  sq.appendChild(icon(iconName, big ? 34 : 26));
  const node = el('div', {
    class: `dia${big ? ' big' : ''}${locked ? ' locked' : ' pressable'}`,
    onClick: locked ? () => toast('敬請期待') : onClick,
  }, [sq, el('span', { class: 'dl', text: label })]);
  if (badge) node.appendChild(dot());
  return node;
}

function barItem(iconName, label, { on = false, locked = false, badge = false, onClick } = {}) {
  const ic = el('span', { class: 'bic' });
  ic.appendChild(icon(iconName, 22));
  const node = el('div', {
    class: `bn${on ? ' on' : ''}${locked ? ' locked' : ' pressable'}`,
    onClick: locked ? () => toast('敬請期待') : onClick,
  }, [ic, el('span', { text: label })]);
  if (badge) node.appendChild(dot());
  return node;
}
