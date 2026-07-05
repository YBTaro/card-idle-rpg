// 通用觸發系統：卡片 triggers 欄位 → 事件時機自動施放效果。
// 純比對邏輯（不碰引擎狀態）；派發與連鎖控制在 engine._fireTriggers。
//
// trigger 資料格式（cards.js 的 triggers: [...]）：
//   on:    'death'（死亡）| 'cast'（施放絕技）| 'normal'（普攻出手）|
//          'hit'（受到直接傷害）| 'hpBelow'（血線首次跌破）| 'buffGained'（獲得狀態）
//   who:   事件主體與持有者的關係：'self' | 'ally' | 'enemy' | 'any'（預設見 DEFAULT_WHO）
//   where: 過濾事件主體（matchesWhere：race/element/row/class…）
//   via:   hit 限定：'normal'（普攻）| 'skill'（技能直傷）| 'any'（預設）
//   negative: buffGained 限定：true＝減益、false＝增益（不填＝都觸發）
//   pct:   hpBelow 限定：跌破的血線比例（事件帶 before/after，跨線才觸發）
//   chance / once / name：機率、每場一次（hpBelow 預設 once）、顯示名
//   effects: applyEffect 格式陣列；scope 相對持有者；scope:'target' ＝事件主體
import { matchesWhere } from './effects.js';

// 各時機的預設關係（省得每條都寫 who）
export const DEFAULT_WHO = {
  death: 'ally',
  cast: 'self',
  normal: 'self',
  hit: 'self',
  hpBelow: 'self',
  buffGained: 'self',
};

export function relationOf(owner, subject) {
  if (owner === subject) return 'self';
  return owner.team === subject.team ? 'ally' : 'enemy';
}

// owner 的單條 trigger 是否對此事件成立（不含 once/chance——那是派發層的事）。
export function triggerMatches(trig, owner, event) {
  if (trig.on !== event.on) return false;
  const who = trig.who ?? DEFAULT_WHO[event.on] ?? 'self';
  const rel = relationOf(owner, event.subject);
  if (who !== 'any' && rel !== who) return false;
  if (event.on === 'hit' && trig.via && trig.via !== 'any' && trig.via !== event.via) return false;
  if (event.on === 'buffGained' && trig.negative != null && event.negative !== trig.negative) return false;
  if (event.on === 'hpBelow') {
    const pct = trig.pct ?? 0.5;
    if (!(event.after < pct && event.before >= pct)) return false;
  }
  if (trig.where && !matchesWhere(event.subject, trig.where)) return false;
  return true;
}
