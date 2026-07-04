// 玩家名片：三系統（競技場對手/好友/公會成員）共用的彈窗元件。
// 顯示：頭像、暱稱、簽名、最高章節、競技場積分、公會、防守隊 6 卡。
// editable＝自己的名片：可改暱稱/簽名/頭像（頭像＝任一已擁有卡的頭像裁切）。
import { el, clear, toast } from './dom.js';
import { openModal } from './modal.js';
import { store } from '../core/state.js';
import { saveGame } from '../core/save.js';
import { stageLabel } from '../systems/profile.js';
import { portraitFor } from '../data/assets.js';
import { CARDS } from '../data/cards.js';
import { cardFrame } from './cardFrame.js';
import { tierOf } from '../systems/arenaLocal.js';
import { pushProfile } from '../net/api.js';

// 玩家頭像節點（avatarCardId 裁切；無則預設圖標）。共用。
export function playerAvatar(avatarCardId, { size = 48 } = {}) {
  const box = el('div', { class: 'pc-ava', style: `width:${size}px;height:${size}px` });
  const p = avatarCardId ? portraitFor(avatarCardId) : null;
  if (p) box.appendChild(el('img', { src: p.src, alt: '', style: `object-position:${p.x * 100}% ${p.y * 100}%` }));
  else box.appendChild(el('span', { text: '🎖️' }));
  return box;
}

// profile：{ nickname, avatarCardId, signature, stage, rating, guildName, defense: [{cardId,level,stars,pos}] }
export function openPlayerCard(profile, { editable = false, onSpar = null } = {}) {
  return openModal({
    className: 'ov-playercard',
    build: (panel, close) => {
      panel.appendChild(el('button', { class: 'ov-close', text: '✕', onClick: () => close() }));
      panel.appendChild(el('div', { class: 'ov-title', text: editable ? '我的名片' : '玩家名片' }));

      const head = el('div', { class: 'pc-head' });
      const ava = playerAvatar(profile.avatarCardId, { size: 56 });
      head.appendChild(ava);
      const info = el('div', { class: 'pc-info' });
      const nameEl = el('div', { class: 'pc-name', text: profile.nickname || '???' });
      const signEl = el('div', { class: 'pc-sign', text: profile.signature || (editable ? '（點「編輯」寫下簽名）' : '') });
      info.appendChild(nameEl);
      info.appendChild(signEl);
      head.appendChild(info);
      panel.appendChild(head);

      // 數據列：章節 / 段位積分 / 公會（無戰力原則：不出現任何加總數值）
      const tier = profile.rating != null ? tierOf(profile.rating) : null;
      const rows = el('div', { class: 'pc-rows' });
      rows.appendChild(pcRow('📖 最高章節', stageLabel(profile.stage || 1)));
      if (tier) rows.appendChild(pcRow(`${tier.icon} 競技場`, `${tier.name} · ${profile.rating}`));
      if (profile.guildName) rows.appendChild(pcRow('🏰 公會', profile.guildName));
      panel.appendChild(rows);

      // 防守隊
      if (profile.defense?.length) {
        panel.appendChild(el('div', { class: 'pc-sub', text: '防守隊伍' }));
        const grid = el('div', { class: 'pc-defense' });
        for (const e of [...profile.defense].sort((a, b) => a.pos - b.pos)) {
          const card = CARDS[e.cardId];
          if (!card) continue;
          const cell = el('div', { class: 'pc-defcell' });
          cell.appendChild(cardFrame(card, { level: e.level, stars: e.stars, size: 'mini' }));
          grid.appendChild(cell);
        }
        panel.appendChild(grid);
      }

      // 動作列
      const actions = el('div', { class: 'pc-actions' });
      if (editable) {
        actions.appendChild(el('button', { class: 'btn btn-gold', text: '✏️ 編輯名片', onClick: () => { close(); openEditProfile(); } }));
      }
      if (onSpar) {
        actions.appendChild(el('button', { class: 'btn', text: '⚔ 切磋', onClick: () => { close(); onSpar(profile); } }));
      }
      if (actions.children.length) panel.appendChild(actions);
    },
  });
}

function pcRow(label, value) {
  return el('div', { class: 'pc-row' }, [el('span', { text: label }), el('b', { text: value })]);
}

// 編輯自己的名片：暱稱 / 簽名 / 頭像（從已擁有卡挑）。
export function openEditProfile(onSaved) {
  const prof = store.state.profile;
  return openModal({
    className: 'ov-playercard',
    build: (panel, close) => {
      panel.appendChild(el('button', { class: 'ov-close', text: '✕', onClick: () => close() }));
      panel.appendChild(el('div', { class: 'ov-title', text: '編輯名片' }));

      const nickIn = el('input', { class: 'pc-input', value: prof.nickname, maxlength: '12', placeholder: '暱稱（12 字內）' });
      const signIn = el('input', { class: 'pc-input', value: prof.signature ?? '', maxlength: '30', placeholder: '簽名（30 字內）' });
      panel.appendChild(el('div', { class: 'pc-sub', text: '暱稱' }));
      panel.appendChild(nickIn);
      panel.appendChild(el('div', { class: 'pc-sub', text: '簽名' }));
      panel.appendChild(signIn);

      // 頭像挑選：已擁有卡（去重 cardId）
      panel.appendChild(el('div', { class: 'pc-sub', text: '頭像（點選）' }));
      const owned = [...new Set(store.state.cards.map((c) => c.cardId))];
      let picked = prof.avatarCardId;
      const grid = el('div', { class: 'pc-avagrid' });
      const cells = new Map();
      for (const cardId of owned) {
        const cell = playerAvatar(cardId, { size: 44 });
        cell.classList.add('pressable');
        if (cardId === picked) cell.classList.add('on');
        cell.addEventListener('click', () => {
          picked = cardId;
          for (const [, c] of cells) c.classList.remove('on');
          cell.classList.add('on');
        });
        cells.set(cardId, cell);
        grid.appendChild(cell);
      }
      panel.appendChild(grid);

      panel.appendChild(el('div', { class: 'pc-actions' }, [
        el('button', {
          class: 'btn btn-gold',
          text: '儲存',
          onClick: () => {
            const nick = nickIn.value.trim().slice(0, 12);
            if (!nick) { toast('暱稱不可為空'); return; }
            prof.nickname = nick;
            prof.signature = signIn.value.trim().slice(0, 30);
            prof.avatarCardId = picked ?? null;
            saveGame();
            store.notify();
            pushProfile(); // 同步伺服器（離線靜默）
            toast('名片已更新', { icon: '✅' });
            close();
            onSaved?.();
          },
        }),
      ]));
    },
  });
}

// 自己的名片資料（本地組裝；與伺服器 publicProfile 同形狀）。
export function myProfileData() {
  const s = store.state;
  return {
    nickname: s.profile.nickname,
    avatarCardId: s.profile.avatarCardId,
    signature: s.profile.signature,
    stage: s.progress.stage || 1,
    rating: s.arena.rating,
    guildName: null, // 連線後由伺服器名片覆蓋
    defense: s.arena.defense?.length ? s.arena.defense : null,
  };
}
