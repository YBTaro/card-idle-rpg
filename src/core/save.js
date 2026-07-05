// localStorage 存讀檔。含 schema version 與 migrate；防抖寫入。
import { store, createNewGame, SCHEMA_VERSION, DEV_RESOURCES } from './state.js';

const SAVE_KEY = 'card-idle-rpg:save';

// ---- migrate：把舊版存檔升級到當前版本 ----
function migrate(data) {
  const fromVersion = data.version || 0; // 進場版本（欄位補齊後再依此跑一次性升級）
  if (!data.version || data.version < 1) {
    data.version = 1;
  }
  // 保險：補齊可能缺漏的欄位
  data.currencies ??= { tickets: 0, gold: 0 };
  data.inventory ??= { materials: {} };
  data.inventory.materials ??= {};
  data.cards ??= [];
  data.formation ??= [];
  // formation：舊格式 { instanceId, row } → { instanceId, pos }
  if (Array.isArray(data.formation)) {
    const used = new Set(data.formation.filter((e) => e && e.pos).map((e) => e.pos));
    const front = [1, 2, 3].filter((p) => !used.has(p));
    const back = [4, 5, 6].filter((p) => !used.has(p));
    data.formation = data.formation
      .filter(Boolean)
      .map((e) => {
        if (e.pos) return { instanceId: e.instanceId, pos: e.pos };
        const p = e.row === 'back' ? (back.shift() ?? front.shift()) : (front.shift() ?? back.shift());
        return p == null ? null : { instanceId: e.instanceId, pos: p };
      })
      .filter(Boolean)
      .slice(0, 6);
  }
  data.daily ??= { lastClaim: 0 };
  data.progress ??= { wins: 0, losses: 0, stage: 1 };
  // v2/v4：開發期資源補給——舊檔一次性把資源補到至少 DEV_RESOURCES 水準（保留進度，不用清檔）。
  // v4 上調水準（親自測試玩法用），舊檔進場自動補到新值。
  if (fromVersion < 4) {
    data.currencies.tickets = Math.max(data.currencies.tickets || 0, DEV_RESOURCES.tickets);
    data.currencies.gold = Math.max(data.currencies.gold || 0, DEV_RESOURCES.gold);
    data.inventory.materials.essence = Math.max(data.inventory.materials.essence || 0, DEV_RESOURCES.essence);
  }
  // v3：手遊要素欄位（玩家檔案 / 掛機箱 / 簽到 / 每日任務 / FTUE 旗標）。
  for (const c of data.cards) c.stars ??= 0; // 升星欄位
  data.player ??= { name: '指揮官' };
  data.idle ??= { lastClaim: Date.now() };
  data.daily.streak ??= 0;
  data.daily.quests ??= null;
  data.meta ??= { createdAt: Date.now(), nextInstanceId: maxInstanceId(data) + 1 };
  data.meta.ftueDone ??= false;
  // v4：前後端分離——玩家名片（裝置帳號）與競技場本地資料（離線模式用）
  if (!data.profile) {
    const rand = Math.random().toString(36).slice(2, 6);
    data.profile = {
      deviceId: globalThis.crypto?.randomUUID?.() ?? `dev-${Date.now()}-${rand}`,
      playerId: null,
      token: null,
      nickname: data.player?.name && data.player.name !== '指揮官' ? data.player.name : `指揮官${rand.toUpperCase()}`,
      avatarCardId: null,
      signature: '',
    };
  }
  data.arena ??= { rating: 1000, day: '', used: 0, defense: [], reports: [] };
  // v5：試煉塔進度與商店每日購買記錄
  data.tower ??= { floor: 1 };
  data.shop ??= { day: '', bought: {} };
  // 裝備插座（E2）：每張卡帶 gear 陣列（裝備系統之後開；空陣列＝數值乘區 ×1 零影響）
  for (const c of data.cards) c.gear ??= [];
  // 遊戲設定：自動戰鬥（關＝結算後停住等玩家按「下一關」）
  data.settings ??= { autoBattle: true };
  data.settings.autoBattle ??= true;
  data.version = SCHEMA_VERSION;
  return data;
}

function maxInstanceId(data) {
  return (data.cards || []).reduce((m, c) => Math.max(m, c.instanceId || 0), 0);
}

// 載入存檔；無存檔或解析失敗則開新遊戲。設定到 store。
export function loadGame() {
  let state;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      state = migrate(JSON.parse(raw));
    }
  } catch (err) {
    console.warn('[save] 讀檔失敗，開新遊戲：', err);
    state = null;
  }
  if (!state) state = migrate(createNewGame()); // 新檔也跑 migrate 補齊新版欄位（profile/arena）
  store.set(state);
  saveNow(); // 立即落地，確保存檔即時存在（新檔/補欄位後）
  return state;
}

let _saveTimer = null;
// 防抖寫入：頻繁變更時合併為一次寫入。
export function saveGame() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveNow, 150);
}

export function saveNow() {
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(store.state));
  } catch (err) {
    console.warn('[save] 寫檔失敗：', err);
  }
}

// 清檔重來。
export function resetGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (_) {
    /* ignore */
  }
  store.set(createNewGame());
  saveNow();
  return store.state;
}

export { SAVE_KEY };
