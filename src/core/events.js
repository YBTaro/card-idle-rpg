// 極簡 EventEmitter — 戰鬥引擎與 UI 都靠它解耦。
// 完全與 DOM / Pixi 無關，方便單元測試。
export class EventEmitter {
  constructor() {
    this._handlers = new Map();
  }

  on(event, fn) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(fn);
    return () => this.off(event, fn); // 回傳取消訂閱函式
  }

  off(event, fn) {
    this._handlers.get(event)?.delete(fn);
  }

  emit(event, payload) {
    const set = this._handlers.get(event);
    if (!set) return;
    // 複製一份避免處理過程中變動集合
    for (const fn of [...set]) fn(payload);
  }

  clear() {
    this._handlers.clear();
  }
}
