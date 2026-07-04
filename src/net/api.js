// API 客戶端：fetch 包裝 + 裝置帳號 + 連線狀態。
// 走 vite 代理 /api → localhost:8787（見 vite.config.js）；伺服器沒開 → offline，
// 各頁自行降級（競技場退本地機器人、好友/公會顯示連線提示）。
import { store } from '../core/state.js';
import { saveGame } from '../core/save.js';

const TIMEOUT_MS = 6000;

export const net = {
  online: false,     // 最近一次請求成功與否
  authed: false,
  profile: null,     // 伺服器端名片（publicProfile）
  _listeners: [],
  onChange(fn) { this._listeners.push(fn); },
  _notify() { for (const fn of this._listeners) fn(this); },
};

function token() {
  return store.state.profile?.token ?? null;
}

async function request(method, path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      method,
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!net.online) { net.online = true; net._notify(); }
    if (!res.ok) {
      const err = new Error(data?.error ?? `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError' || err instanceof TypeError) {
      // 網路層失敗（非業務錯誤）→ 轉離線
      if (net.online || !net._offlineKnown) { net.online = false; net._offlineKnown = true; net._notify(); }
      const e = new Error('伺服器未連線');
      e.offline = true;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, body) => request('POST', p, body ?? {}),
  put: (p, body) => request('PUT', p, body ?? {}),
  del: (p) => request('DELETE', p),
};

// 開機登入：裝置帳號（deviceId 存在 profile），成功後同步名片與最高章節。
export async function bootAuth() {
  const prof = store.state.profile;
  try {
    const res = await request('POST', '/api/auth', { deviceId: prof.deviceId, nickname: prof.nickname });
    prof.playerId = res.playerId;
    prof.token = res.token;
    // 伺服器暱稱為準（首次建立時取本地暱稱）
    net.profile = res.profile;
    net.authed = true;
    saveGame();
    // 回報名片（頭像/簽名/章節只升不降）
    await pushProfile();
    net._notify();
    return true;
  } catch {
    net.authed = false;
    net._notify();
    return false;
  }
}

// 把本地名片推上伺服器。
export async function pushProfile() {
  const s = store.state;
  const prof = s.profile;
  try {
    net.profile = await api.put('/api/me', {
      nickname: prof.nickname,
      avatarCardId: prof.avatarCardId ?? null,
      signature: prof.signature ?? '',
      stage: s.progress.stage || 1,
    });
    net._notify();
  } catch { /* 離線靜默 */ }
}

// 雲端備份（防抖）：重大變更後呼叫。
let _cloudTimer = null;
export function cloudBackup() {
  if (!net.authed) return;
  clearTimeout(_cloudTimer);
  _cloudTimer = setTimeout(async () => {
    try { await api.put('/api/save', { state: store.state }); } catch { /* 離線靜默 */ }
  }, 3000);
}
