// 中央遊戲狀態：單例 store + 簡單 pub/sub。
// 只持有資料與通知機制；存讀檔在 save.js，避免循環相依。
import { EventEmitter } from './events.js';
import { STARTER_CARD_IDS, CARDS } from '../data/cards.js';

export const SCHEMA_VERSION = 4;

// 開發期測試資源水準（新檔直接給；舊檔由 save.js 的版本遷移一次性補到至少此值）。
export const DEV_RESOURCES = { tickets: 1000, gold: 2000000, essence: 200000 };

// 建立全新存檔（首次遊玩）。
export function createNewGame() {
  const state = {
    version: SCHEMA_VERSION,
    meta: { createdAt: Date.now(), nextInstanceId: 1, ftueDone: false },
    player: { name: '指揮官' },
    currencies: { tickets: DEV_RESOURCES.tickets, gold: DEV_RESOURCES.gold }, // 初始資源（開發期加量）
    inventory: { materials: { essence: DEV_RESOURCES.essence } },
    cards: [], // { instanceId, cardId, level }
    formation: [], // [{ instanceId, pos: 1..6 }] 最多 6（＝當前出戰隊）
    teamPresets: [], // 隊伍預設槽（最多 10 組）：[{ name, slots: [{ instanceId, pos }] }]
    daily: { lastClaim: 0, streak: 0, quests: null }, // streak=七日簽到進度；quests=每日任務（見 systems/quests.js）
    idle: { lastClaim: Date.now() }, // 掛機獎勵箱上次領取時間
    progress: { wins: 0, losses: 0, stage: 1 },
  };

  // 送初始角色並自動上陣（support 優先後排 4/5/6，其他前排 1/2/3）。
  const front = [1, 2, 3];
  const back = [4, 5, 6];
  for (const cardId of STARTER_CARD_IDS) {
    const inst = addCardInstance(state, cardId);
    const cls = CARDS[cardId]?.class;
    const pos = cls === 'support' ? (back.shift() ?? front.shift()) : (front.shift() ?? back.shift());
    state.formation.push({ instanceId: inst.instanceId, pos });
  }
  return state;
}

// 在 state 上新增一張角色實例（初始 0 星），回傳該實例。
export function addCardInstance(state, cardId, level = 1) {
  const instanceId = state.meta.nextInstanceId++;
  const inst = { instanceId, cardId, level, stars: 0 };
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
