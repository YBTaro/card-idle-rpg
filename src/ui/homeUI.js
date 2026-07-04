// 主城大廳：登入落點與樞紐（hub-and-spoke 的 hub）。
// 版式依參考原型：左上檔案+貨幣、左中事件卡+台詞泡泡、左下營運捷徑、
// 中央看板英雄、右側菱形模式入口、右上工具列、底部飾條功能列。
import { gsap } from 'gsap';
import { el, clear, fmt } from './dom.js';
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

    // 左上：玩家橫幅（頭像＋暱稱＋章節；點開名片可編輯）——參考原型的角色橫幅
    const ava = el('div', {
      class: 'hub-ava pressable',
      onClick: () => openPlayerCard({ ...myProfileData(), ...(net.profile ?? {}) }, { editable: true }),
    });
    const p = hero ? portraitFor(hero.cardId) : null;
    if (p) ava.appendChild(el('img', { src: p.src, alt: '', style: `object-position:${p.x * 100}% ${p.y * 100}%` }));
    this.root.appendChild(
      el('div', { class: 'hub-tl pressable', onClick: () => openPlayerCard({ ...myProfileData(), ...(net.profile ?? {}) }, { editable: true }) }, [
        ava,
        el('div', { class: 'cols' }, [
          el('div', { class: 'pname', text: s.profile?.nickname ?? '指揮官' }),
          el('div', { class: 'pstage', text: `📖 ${stageLabel(s.progress.stage || 1)}` }),
        ]),
      ])
    );

    // 右上：貨幣列 + 設定（參考原型：資源集中右上）
    this.root.appendChild(
      el('div', { class: 'hub-cur' }, [
        currencyPill('coin', s.currencies.gold),
        currencyPill('ticket', s.currencies.tickets),
        currencyPill('essence', s.inventory.materials.essence || 0),
        el('div', { class: 'icon-btn pressable', onClick: () => openSettingsSheet({ onReset: () => this.render() }) }, [icon('settings', 20)]),
      ])
    );

    // 右側小功能列（貨幣列下方）：好友 / 任務 / 簽到 / 掛機箱
    const feats = el('div', { class: 'hub-feats' });
    feats.appendChild(featBtn('friends', '好友', false, () => nav.go('friends')));
    feats.appendChild(featBtn('quests', '任務', badges.quests, () => openQuestsSheet()));
    feats.appendChild(featBtn('signin', '簽到', badges.signin, () => openSigninSheet()));
    this._idleShortcut = featBtn('idle', '掛機箱', badges.idle, () => openIdleSheet());
    feats.appendChild(this._idleShortcut);
    this.root.appendChild(feats);

    // 右下：大冒險鈕（參考原型的「X-X 立刻出發」）
    this._battleDia = el('div', { class: 'hub-adv pressable', onClick: () => nav.go('battle') }, [
      el('div', { class: 'a1', text: stageLabel(s.progress.stage || 1) }),
      el('div', { class: 'a2', text: '立刻出發！' }),
    ]);
    this._battleDia.prepend(icon('battle', 30));
    this.root.appendChild(this._battleDia);

    // 底部大功能鈕列（參考原型的圓章＋名牌）
    const dock = el('div', { class: 'hub-dock' });
    this._gachaBar = dockBtn('gacha', '召喚', () => nav.go('gacha'));
    dock.appendChild(this._gachaBar);
    dock.appendChild(dockBtn('shop', '商店', () => nav.go('shop')));
    dock.appendChild(dockBtn('team', '隊伍', () => nav.go('team')));
    this._heroesBar = dockBtn('heroes', '英雄', () => nav.go('heroes'));
    dock.appendChild(this._heroesBar);
    dock.appendChild(dockBtn('guild', '公會', () => nav.go('guild')));
    dock.appendChild(dockBtn('arena', '競技場', () => nav.go('arena')));
    dock.appendChild(dockBtn('tower', '試煉塔', () => nav.go('tower')));
    this.root.appendChild(dock);

    // 進場動效：功能列交錯浮現（登入的儀式感，不瞬間全亮）
    staggerIn(feats.children, { dy: 10, step: 0.05 });
    staggerIn(dock.children, { dy: 14, step: 0.05 });
    staggerIn([this._battleDia], { dy: 14, step: 0 });
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

// 右側小功能鈕：圓角方章 + 下方小字（參考原型的活動視窗/好友/任務列）
function featBtn(iconName, label, badge, onClick) {
  const sq = el('div', { class: 'fsq' });
  sq.appendChild(icon(iconName, 26));
  if (badge) sq.appendChild(dot());
  return el('div', { class: 'hub-feat pressable', onClick }, [sq, el('span', { text: label })]);
}

// 底部大功能鈕：金框圓章 + 名牌（參考原型的招募/商店/編制陣容列）
function dockBtn(iconName, label, onClick) {
  const sq = el('div', { class: 'dksq' });
  sq.appendChild(icon(iconName, 30));
  return el('div', { class: 'hub-dk pressable', onClick }, [sq, el('span', { class: 'dkl', text: label })]);
}
