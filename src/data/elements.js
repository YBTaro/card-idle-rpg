// 5 屬性與相剋關係。所有平衡常數集中於此，便於日後調整。

export const ELEMENTS = ['fire', 'wind', 'water', 'light', 'dark'];

export const ELEMENT_LABEL = {
  fire: '火',
  wind: '風',
  water: '水',
  light: '光',
  dark: '暗',
};

// 每個屬性「剋制」誰：
// 循環 fire > wind > water > fire；對立 light ↔ dark。
export const COUNTERS = {
  fire: 'wind',
  wind: 'water',
  water: 'fire',
  light: 'dark',
  dark: 'light',
};

// 傷害倍率（佔位常數）
export const ADVANTAGE_MULT = 1.5; // 屬性剋制
export const DISADVANTAGE_MULT = 0.75; // 被剋
export const NEUTRAL_MULT = 1.0;

// 攻擊方 atkEl 對防守方 defEl 的屬性傷害倍率。
export function elementMultiplier(atkEl, defEl) {
  if (COUNTERS[atkEl] === defEl) return ADVANTAGE_MULT; // 我剋你
  if (COUNTERS[defEl] === atkEl) return DISADVANTAGE_MULT; // 你剋我
  return NEUTRAL_MULT;
}

// 給 UI 用：回傳剋制關係文字，例如 fire vs wind → 'advantage'
export function elementRelation(atkEl, defEl) {
  if (COUNTERS[atkEl] === defEl) return 'advantage';
  if (COUNTERS[defEl] === atkEl) return 'disadvantage';
  return 'neutral';
}
