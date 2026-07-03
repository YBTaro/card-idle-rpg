// 營運系統彈窗：每日任務 / 七日簽到 / 掛機獎勵箱 / 玩家檔案 / 設定。
// 全部掛 overlay 層並自行依 store 重繪內容（開著領獎不會被轟掉）。
import { el, clear, toast, fmt } from './dom.js';
import { store } from '../core/state.js';
import { resetGame } from '../core/save.js';
import { openModal, confirmSheet } from './modal.js';
import {
  DAILY_QUESTS,
  ALL_DONE_ID,
  ALL_DONE_REWARD,
  questProgress,
  questClaimed,
  questClaimable,
  allDoneClaimable,
  claimQuest,
} from '../systems/quests.js';
import { SIGNIN_TABLE, signinDayIndex, canSignin, claimSignin } from '../systems/signin.js';
import { idlePending, canClaimIdle, claimIdle, idleRates } from '../systems/idle.js';
import { playerLevel, teamPower, stageLabel, featuredHero } from '../systems/profile.js';
import { artFor, portraitFor } from '../data/assets.js';
import { CARDS } from '../data/cards.js';

function rewardText(r) {
  const parts = [];
  if (r.tickets) parts.push(`🎟️×${r.tickets}`);
  if (r.gold) parts.push(`🪙×${r.gold}`);
  if (r.essence) parts.push(`🔹×${r.essence}`);
  return parts.join('　');
}

// 頭像 <img>（等級最高出戰英雄的立繪裁頭像）；無卡回 emoji。
export function avatarEl(state = store.state) {
  const hero = featuredHero(state);
  const p = hero ? portraitFor(hero.cardId) : null;
  if (p) {
    return el('img', { src: p.src, alt: '', style: `object-position:${p.x * 100}% ${p.y * 100}%` });
  }
  return el('span', { text: '🃏', style: 'font-size:1.4rem;display:flex;align-items:center;justify-content:center;height:100%' });
}

/* ---------------- 每日任務 ---------------- */
export function openQuestsSheet(onDone) {
  let unsub = null;
  const close = openModal({
    onClose: () => {
      unsub?.();
      onDone?.();
    },
    build: (panel, closeFn) => {
      const render = () => {
        clear(panel);
        panel.appendChild(el('button', { class: 'ov-close', text: '✕', onClick: () => closeFn() }));
        panel.appendChild(el('div', { class: 'ov-title', text: '每日任務' }));
        const list = el('div', { class: 'quest-list' });
        for (const def of DAILY_QUESTS) {
          const prog = questProgress(def);
          const claimed = questClaimed(def.id);
          const claimable = questClaimable(def);
          const row = el('div', { class: `quest-row${claimed ? ' done' : ''}` }, [
            el('span', { class: 'qic', text: def.icon }),
            el('div', { class: 'qmain' }, [
              el('div', { class: 'qlabel', text: `${def.label}（${prog}/${def.target}）` }),
              el('div', { class: 'qbar' }, [el('i', { style: `width:${(prog / def.target) * 100}%` })]),
            ]),
            el('span', { class: 'qreward', text: rewardText(def.reward) }),
          ]);
          const btn = el('button', {
            class: claimable ? 'btn-gold' : '',
            text: claimed ? '已領取' : claimable ? '領取' : '進行中',
            onClick: () => {
              const r = claimQuest(def.id);
              if (r.ok) toast(`已領取 ${rewardText(r.reward)}`, { icon: '🎁' });
            },
          });
          btn.disabled = !claimable;
          row.appendChild(btn);
          list.appendChild(row);
        }
        // 全完成總獎勵
        const allClaimed = questClaimed(ALL_DONE_ID);
        const allOk = allDoneClaimable();
        const allRow = el('div', { class: `quest-row${allClaimed ? ' done' : ''}` }, [
          el('span', { class: 'qic', text: '🏆' }),
          el('div', { class: 'qmain' }, [el('div', { class: 'qlabel', text: '完成全部每日任務' })]),
          el('span', { class: 'qreward', text: rewardText(ALL_DONE_REWARD) }),
        ]);
        const allBtn = el('button', {
          class: allOk ? 'btn-gold' : '',
          text: allClaimed ? '已領取' : '領取',
          onClick: () => {
            const r = claimQuest(ALL_DONE_ID);
            if (r.ok) toast(`已領取 ${rewardText(r.reward)}`, { icon: '🏆' });
          },
        });
        allBtn.disabled = !allOk;
        allRow.appendChild(allBtn);
        list.appendChild(allRow);
        panel.appendChild(list);
      };
      render();
      unsub = store.subscribe(render);
    },
  });
  return close;
}

/* ---------------- 七日簽到 ---------------- */
export function openSigninSheet(onDone) {
  let unsub = null;
  return openModal({
    onClose: () => {
      unsub?.();
      onDone?.();
    },
    build: (panel, closeFn) => {
      const render = () => {
        clear(panel);
        panel.appendChild(el('button', { class: 'ov-close', text: '✕', onClick: () => closeFn() }));
        panel.appendChild(el('div', { class: 'ov-title', text: '七日簽到' }));
        const today = signinDayIndex();
        const claimable = canSignin();
        const grid = el('div', { class: 'signin-grid' });
        SIGNIN_TABLE.forEach((cell, i) => {
          const cls = i < today ? 'past' : i === today && claimable ? 'today' : '';
          grid.appendChild(
            el('div', { class: `signin-cell ${cls}` }, [
              el('div', { class: 'sic', text: cell.icon }),
              el('div', { class: 'sd', text: `第 ${i + 1} 天` }),
              el('div', { class: 'sr', text: cell.label }),
            ])
          );
        });
        panel.appendChild(grid);
        const cta = el('button', {
          class: 'signin-cta btn-gold',
          text: claimable ? `簽到領取（${SIGNIN_TABLE[today].label}）` : '今日已簽到，明天 12:00 後再來',
          onClick: () => {
            const r = claimSignin();
            if (r.ok) toast(`第 ${r.day + 1} 天簽到成功！${rewardText(r.reward)}`, { icon: '📅' });
          },
        });
        cta.disabled = !claimable;
        panel.appendChild(cta);
      };
      render();
      unsub = store.subscribe(render);
    },
  });
}

/* ---------------- 掛機獎勵箱 ---------------- */
export function openIdleSheet(onDone) {
  let unsub = null;
  return openModal({
    onClose: () => {
      unsub?.();
      onDone?.();
    },
    build: (panel, closeFn) => {
      const render = () => {
        clear(panel);
        panel.appendChild(el('button', { class: 'ov-close', text: '✕', onClick: () => closeFn() }));
        panel.appendChild(el('div', { class: 'ov-title', text: '掛機獎勵' }));
        const box = el('div', { class: 'idle-box' });
        const p = idlePending();
        const stage = store.state.progress.stage || 1;
        const r = idleRates(stage);
        box.appendChild(el('div', { class: 'idle-chest', text: p.capped ? '🎁' : '📦' }));
        box.appendChild(
          el('div', {
            class: 'idle-time',
            text: p.capped
              ? '已累積滿 12 小時（上限）'
              : `已累積 ${Math.floor(p.minutes / 60)} 小時 ${p.minutes % 60} 分鐘 · 每分鐘 🪙${r.gold} / 🔹${r.essence.toFixed(1)}`,
          })
        );
        box.appendChild(
          el('div', { class: 'idle-rewards' }, [
            el('div', { class: 'ir', html: `🪙 ${fmt(p.gold)}<span class="lab">金幣</span>` }),
            el('div', { class: 'ir', html: `🔹 ${fmt(p.essence)}<span class="lab">養成精華</span>` }),
          ])
        );
        box.appendChild(el('div', { class: 'idle-bar' }, [el('i', { style: `width:${Math.min(100, p.ratio * 100)}%` })]));
        const cta = el('button', {
          class: 'signin-cta btn-gold',
          text: '開箱領取',
          onClick: () => {
            const res = claimIdle();
            if (res.ok) toast(`領取 🪙${fmt(res.reward.gold)}　🔹${fmt(res.reward.essence)}`, { icon: '📦' });
            else toast('箱子還是空的，掛一會兒再來吧');
          },
        });
        cta.disabled = !canClaimIdle();
        box.appendChild(cta);
        panel.appendChild(box);
      };
      render();
      unsub = store.subscribe(render);
    },
  });
}

/* ---------------- 玩家檔案 ---------------- */
export function openProfileSheet() {
  return openModal({
    build: (panel, closeFn) => {
      const s = store.state;
      panel.appendChild(el('button', { class: 'ov-close', text: '✕', onClick: () => closeFn() }));
      panel.appendChild(el('div', { class: 'ov-title', text: '指揮官檔案' }));
      const box = el('div', { class: 'profile-box' });
      box.appendChild(
        el('div', { class: 'profile-head' }, [
          el('div', { class: 'pa' }, [avatarEl()]),
          el('div', {}, [
            el('div', { class: 'pn', text: s.player?.name || '指揮官' }),
            el('div', { class: 'pl', text: `Lv ${playerLevel()}（每 3 勝升 1 級）` }),
          ]),
        ])
      );
      const stats = [
        ['隊伍總戰力', fmt(teamPower())],
        ['目前關卡', stageLabel(s.progress.stage || 1)],
        ['累計勝場', fmt(s.progress.wins || 0)],
        ['累計敗場', fmt(s.progress.losses || 0)],
        ['持有英雄', `${s.cards.length} / ${Object.keys(CARDS).length}`],
        ['簽到累計', `${s.daily.streak || 0} 天`],
      ];
      const grid = el('div', { class: 'profile-stats' });
      for (const [k, v] of stats) {
        grid.appendChild(el('div', { class: 'ps' }, [el('span', { class: 'k', text: k }), el('span', { class: 'v', text: v })]));
      }
      box.appendChild(grid);
      panel.appendChild(box);
    },
  });
}

/* ---------------- 設定 ---------------- */
export function openSettingsSheet({ onReset } = {}) {
  return openModal({
    build: (panel, closeFn) => {
      panel.appendChild(el('button', { class: 'ov-close', text: '✕', onClick: () => closeFn() }));
      panel.appendChild(el('div', { class: 'ov-title', text: '設定' }));
      const box = el('div', { class: 'profile-box' });
      box.appendChild(
        el('div', { class: 'odds-note', text: '存檔保存在本機瀏覽器。重置後所有進度將永久消失，無法復原。' })
      );
      const btn = el('button', {
        class: 'btn-danger signin-cta',
        text: '重置存檔（清除全部進度）',
        onClick: async () => {
          const ok = await confirmSheet({
            title: '確定要重置存檔？',
            desc: '所有英雄、資源與關卡進度將永久刪除，此操作無法復原。',
            confirmText: '永久刪除',
            danger: true,
          });
          if (ok) {
            resetGame();
            closeFn();
            toast('已重置存檔');
            onReset?.();
          }
        },
      });
      box.appendChild(btn);
      panel.appendChild(box);
    },
  });
}

// 讓外部（如立繪點擊）能拿看板英雄的完整立繪。
export function heroArtSrc(cardId) {
  return artFor(cardId);
}
