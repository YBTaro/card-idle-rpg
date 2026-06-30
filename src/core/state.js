// 中央遊戲狀態：單例 store + 簡單 pub/sub。
// 只持有資料與通知機制；存讀檔在 save.js，避免循環相依。
import { EventEmitter } from './events.js';
import { STARTER_CARD_IDS } from '../data/cards.js';

export const SCHEMA_VERSION = 1;

// 建立全新存檔（首次遊玩）。
export function createNewGame() {
  const state = {
    version: SCHEMA_VERSION,
    meta: { createdAt: Date.now(), nextInstanceId: 1 },
    currencies: { tickets: 10, gold: 500 }, // 初始資源（佔位）
    inventory: { materials: { essence: 30 } },
    cards: [], // { instanceId, cardId, level }
    formation: [], // [{ instanceId, row: 'front' | 'back' }] 最多 5
    daily: { lastClaim: 0 },
    progress: { wins: 0, losses: 0, stage: 1 },
  };

  // 送初始 5 張角色並自動上陣（前 2 後 3 之類，依職業偏好擺放）。
  for (const cardId of STARTER_CARD_IDS) {
    const inst = addCardInstance(state, cardId);
    state.formation.push({ instanceId: inst.instanceId, row: defaultRowFor(cardId) });
  }
  return state;
}

import { CARDS } from '../data/cards.js';
function defaultRowFor(cardId) {
  const cls = CARDS[cardId]?.class;
  return cls === 'support' ? 'back' : 'front';
}

// 在 state 上新增一張角色實例，回傳該實例。
export function addCardInstance(state, cardId, level = 1) {
  const instanceId = state.meta.nextInstanceId++;
  const inst = { instanceId, cardId, level };
  state.cards.push(inst);
  return inst;
}

class Store {
  constructor() {
    this.state = null;
    this.events = new EventEmitter();
  }

  set(state) {
    this.state = state;
    this.notify();
  }

  // 訂閱整體狀態變更（UI 重繪用）。回傳取消訂閱函式。
  subscribe(fn) {
    return this.events.on('change', fn);
  }

  // 任何系統改完 state 後呼叫，觸發 UI 更新。
  notify() {
    this.events.emit('change', this.state);
  }

  get cards() {
    return this.state.cards;
  }

  getCard(instanceId) {
    return this.state.cards.find((c) => c.instanceId === instanceId) || null;
  }
}

export const store = new Store();
