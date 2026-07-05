// 技能描述自動生成：從 SKILLS 的效果資料組出人話。
// 純模組——資料改了描述自動跟上，不用手維護文案。
import { SKILLS, CARD_SKILLS } from './skills.js';
import { CLASSES } from '../data/classes.js';
import { CARDS } from '../data/cards.js';
import { ELEMENT_LABEL } from '../data/elements.js';

const TARGET_LABEL = {
  singleEnemyByColumn: '敵方單體',
  enemyFrontRow: '敵方前排',
  enemyBackRow: '敵方後排',
  enemyColumn: '敵方直排',
  allEnemies: '敵方全體',
  allAllies: '我方全體',
  lowestHpAlly: '血量最低的隊友',
  randomEnemy: '隨機敵人',
  lowestHpEnemy: '血量最低的敵人',
  highestEnergyEnemy: '能量最高的敵人',
  highestAtkAlly: '攻擊最高的隊友',
  deadAlly: '戰力最高的倒下隊友',
  self: '自身',
};

const SCOPE_LABEL = {
  self: '自身',
  target: null, // 用技能主目標的說法
  allAllies: '我方全體',
  allEnemies: '敵方全體',
  alliesExceptTarget: '其他隊友',
  frontAllies: '我方前排',
  backAllies: '我方後排',
  columnAllies: '同直排的隊友',
  attacker: '出手的隊友', // 觸發限定（獵印連動：效果指向攻擊者）
};

const STAT_LABEL = {
  maxHp: '最大生命',
  atk: '攻擊',
  def: '防禦',
  critChance: '暴擊率',
  critMult: '暴擊傷害',
  dmgDealt: '造成傷害',
  dmgTaken: '承受傷害',
  dotTaken: '受到的持續傷害',
  energyGain: '集氣速度',
  dodge: '迴避率',
  accuracy: '命中率',
  healTaken: '受治療量',
  effectHit: '效果命中',
  effectRes: '效果抗性',
  critRes: '抗暴率',
  res_fire: '火屬承傷',
  res_water: '水屬承傷',
  res_wind: '風屬承傷',
  res_light: '光屬承傷',
  res_dark: '暗屬承傷',
};

const CONTROL_LABEL = { taunt: '嘲諷', silence: '沉默（無法行動）', freeze: '凍結（無法回能）' };

const TERRAIN_NAME = { surge: '湧能磁場', erosion: '侵蝕之地', swamp: '迷霧沼澤' };

const pct = (x) => `${Math.round(x * 100)}%`;

// buff 數值 → 「+30%」/「-30%」（mul 相對 1、add 直接百分比）。
function buffDelta(op, value) {
  const d = op === 'mul' ? value - 1 : value;
  return `${d >= 0 ? '+' : '-'}${pct(Math.abs(d))}`;
}

const dur = (d) => (d ? `，持續 ${d} 次行動` : '');

function describeEffect(effect, targetLabel) {
  let who = SCOPE_LABEL[effect.scope] ?? targetLabel ?? '目標';
  // where 條件：作用對象限定（種族/屬性/系列主題技能）
  if (effect.where) who = `${who}中的${describeWhere(effect.where)}單位`;
  const chance = effect.chance != null ? `${pct(effect.chance)} 機率` : '';
  let text = '';
  switch (effect.type) {
    case 'damage': {
      const mods = [];
      if (effect.ignoreDef) mods.push('無視防禦');
      text = `對${who}造成 ${pct(effect.mult)} 攻擊力的傷害${mods.length ? `（${mods.join('、')}）` : ''}`;
      if (effect.executeBelow != null) {
        // 處決＝出手前判定血線、一擊以放大後倍率直接結算（非事後補乘）——描述直接寫出最終倍率
        const execMult = effect.mult * (effect.executeBonus ?? 1.5);
        text += `；若目標生命低於 ${pct(effect.executeBelow)}，此擊改以 ${pct(execMult)} 攻擊力結算（處決）`;
      }
      if (effect.lifesteal) text += `，並回復造成傷害 ${pct(effect.lifesteal)} 的生命`;
      break;
    }
    case 'heal':
      text = `治療${who} ${pct(effect.power)} 攻擊力的生命`;
      break;
    case 'hot':
      text = `為${who}附加持續回復（每次行動前回復 ${pct(effect.power)} 攻擊力的生命${dur(effect.duration)}）`;
      break;
    case 'buff':
      text = `${who}${STAT_LABEL[effect.stat] ?? effect.stat} ${buffDelta(effect.op, effect.value)}${dur(effect.duration)}`;
      break;
    case 'dot': {
      const name = effect.element === 'fire' ? '灼燒' : '中毒';
      const stack = effect.stackable ? '（可疊加）' : '';
      const basis = effect.basis === 'targetMaxHp' ? '最大生命' : '攻擊力';
      text = `對${who}附加${name}${stack}（每次行動前受 ${pct(effect.power)} ${basis}傷害${dur(effect.duration)}）`;
      break;
    }
    case 'shield':
      text = `為${who}套上 ${pct(effect.power)} 攻擊力的護盾${dur(effect.duration)}`;
      break;
    case 'energy':
      text = `${who}獲得 ${effect.amount} 點能量`;
      break;
    case 'control':
      text = `對${who}施加${CONTROL_LABEL[effect.control] ?? effect.control}${dur(effect.duration)}`;
      break;
    case 'weather': {
      // 天氣效果全遊戲固定，不在技能文重複——戰鬥中點上方環境標籤即可看當前效果
      const w = { sunny: '烈日', rain: '暴雨', gale: '颶風' }[effect.weather];
      text = `使天候轉為「${w ?? effect.weather}」`;
      break;
    }
    case 'terrain':
      text = `將場地轉為「${TERRAIN_NAME[effect.terrain] ?? effect.terrain}」`;
      break;
    case 'transmute':
      text = `將${who}轉化為自身剋制的屬性${dur(effect.duration)}`;
      break;
    case 'energySteal':
      text = `奪走${who}當前全部能量，轉移給我方能量最低的隊友`;
      break;
    case 'debuffBlock':
      text = `為${who}套上格擋護符（彈開接下來 ${effect.charges ?? 1} 個負面狀態${dur(effect.duration)}）`;
      break;
    case 'mark':
      text = `對${who}烙上獵印${dur(effect.duration)}（隊友攻擊帶獵印的目標時可觸發連動效果）`;
      break;
    case 'stealBuff':
      text = `偷取${who}的增益效果（最多 ${effect.count ?? 1} 個，轉為己用）`;
      break;
    case 'transferDebuff':
      text = `將自身的減益效果轉移給${who}（最多 ${effect.count ?? 1} 個）`;
      break;
    case 'cheatDeath':
      text = `為${who}套上不滅意志（致死傷害改為保留 1 點生命，觸發後消失${dur(effect.duration)}）`;
      break;
    case 'nightmare':
      text = `對${who}烙上惡夢印記（受到普攻或技能直接傷害時，額外損失 ${pct(effect.pct ?? 0.05)} 最大生命；永久，可被淨化）`;
      break;
    case 'healOnHit':
      text = `為${who}附加受擊回癒 ${effect.charges ?? 2} 層（受到攻擊時回復 ${pct(effect.power ?? 1)} 攻擊力的生命，每次觸發消耗一層${dur(effect.duration)}）`;
      break;
    case 'castDrain':
      text = `展開靈壓領域（敵方施放技能時，其餘敵人能量 -${effect.amount ?? 20}${dur(effect.duration)}）`;
      break;
    case 'extend': {
      const what = effect.what === 'dot'
        ? (effect.element === 'fire' ? '灼燒' : '持續傷害')
        : effect.what === 'control' ? '控制狀態' : '減益狀態';
      text = `使${who}的${what}持續時間 +${effect.turns ?? 1} 次行動`;
      break;
    }
    case 'detonateDot': {
      const what = effect.element === 'fire' ? '灼燒' : '持續傷害';
      const bonus = effect.mult && effect.mult !== 1 ? `的 ${pct(effect.mult)}` : '';
      text = `引爆${who}的${what}：立即結算剩餘全部傷害${bonus}並移除該狀態`;
      break;
    }
    case 'dispel':
      text = effect.what === 'buff'
        ? `驅散${who}的增益效果${effect.count ? `（最多 ${effect.count} 個）` : ''}`
        : `淨化${who}的減益效果${effect.count ? `（最多 ${effect.count} 個）` : ''}`;
      break;
    case 'revive':
      text = `復活${who}並回復 ${pct(effect.power)} 最大生命`;
      break;
    case 'thorns':
      text = `${who}獲得荊棘（受擊時反彈 ${pct(effect.pct)} 傷害${dur(effect.duration)}）`;
      break;
    case 'counter':
      text = `${who}進入反擊姿態（受擊時回敬 ${pct(effect.mult)} 攻擊力${dur(effect.duration)}）`;
      break;
    default:
      return '';
  }
  return chance ? `${chance}${text}` : text;
}

// skillId → 完整描述字串（不含技能名）。未知技能回空字串。
export function describeSkill(skillId) {
  const def = SKILLS[skillId];
  if (!def) return '';
  const targetLabel = def.target ? TARGET_LABEL[def.target] : null;
  return def.effects
    .map((e) => describeEffect(e, targetLabel))
    .filter(Boolean)
    .join('；');
}

// cardId → { id, name, desc }（專屬技優先，無則職業大招）。
export function skillInfoForCard(cardId, cls) {
  const id = CARD_SKILLS[cardId] ?? CLASSES[cls]?.ultimate;
  const def = SKILLS[id];
  if (!def) return null;
  return { id, name: def.name, desc: describeSkill(id) };
}

// ---- 被動描述（passives 資料 → 人話），同 describeSkill 的資料驅動原則 ----

const PASSIVE_TARGET_LABEL = { self: '自身', allAllies: '我方全體', allEnemies: '敵方全體' };

const CLASS_LABEL = { dps: '輸出', tank: '坦克', support: '輔助' };

function describeWhere(where) {
  if (!where) return '';
  if (where.race) return `「${where.race}」`;
  if (where.series) return `「${where.series}」`;
  if (where.element) return `「${ELEMENT_LABEL[where.element] ?? where.element}」屬性`;
  if (where.class) return `「${CLASS_LABEL[where.class] ?? where.class}」`;
  return '';
}

// 單條被動 → 描述字串。未知結構回空字串。
export function describePassive(p) {
  if (!p || !p.effects || p.effects.length === 0) return '';
  let who = PASSIVE_TARGET_LABEL[p.target] ?? '自身';
  // targetWhere：光環只作用於特定種族/屬性/系列
  if (p.targetWhere) who = `${who}${describeWhere(p.targetWhere)}單位`;
  let cond = '';
  if (p.when?.selfHpBelow != null) cond = `生命低於 ${pct(p.when.selfHpBelow)} 時，`;
  else if (p.when?.alliesAtLeast) {
    cond = `我方${describeWhere(p.when.alliesAtLeast.where)}隊友達 ${p.when.alliesAtLeast.count} 名時，`;
  }
  const effs = p.effects
    .map((e) => {
      const statLabel = STAT_LABEL[e.stat] ?? e.stat;
      if (e.perCountOf) {
        const side = e.perCountOf.side === 'enemies' ? '敵方' : '我方';
        const unitDesc = describeWhere(e.perCountOf.where) || '';
        const dead = e.perCountOf.dead ? '倒下的' : ''; // 亡者之勢：數陣亡者
        const per = e.op === 'mul' ? `+${pct(e.basePct || 0)}` : `+${pct(e.valuePer || 0)}`;
        return `${side}每有一名${dead}${unitDesc}單位，${who}${statLabel} ${per}`;
      }
      return `${who}${statLabel} ${buffDelta(e.op, e.value)}`;
    })
    .filter(Boolean);
  return cond + effs.join('；');
}

// ══ 被動類技能四分類（2026-07 定案）══
//   1. 星級里程碑：升星解鎖（deriveStats 追加，星級區顯示）
//   2. 進場被動：onEnter 開天氣/場地（一次性）
//   3. 光環被動：無條件/自身條件光環 ＋ 事件觸發（triggers）——同一分類
//   4. 隊伍技：組隊條件（when.alliesAtLeast——湊滿 X 名系列/種族才生效）

// cardId → 光環被動描述（排除隊伍技；觸發另由 triggerInfoForCard 給、同屬光環被動分類）。
export function passiveInfoForCard(cardId) {
  const card = CARDS[cardId];
  if (!card || !card.passives) return [];
  return card.passives.filter((p) => !p.when?.alliesAtLeast).map(describePassive).filter(Boolean);
}

// cardId → 隊伍技描述陣列（組隊條件被動；進場鎖定、整場有效）。
export function teamSkillInfoForCard(cardId) {
  const card = CARDS[cardId];
  if (!card || !card.passives) return [];
  return card.passives
    .filter((p) => p.when?.alliesAtLeast)
    .map((p) => {
      const d = describePassive(p);
      return d ? `${d}（進場判定，整場有效）` : '';
    })
    .filter(Boolean);
}

// cardId → 進場被動描述（開天氣/場地；無則 null）。
export function onEnterInfoForCard(cardId) {
  const card = CARDS[cardId];
  if (!card?.onEnter) return null;
  const parts = [];
  if (card.onEnter.weather) {
    const w = { sunny: '烈日', rain: '暴雨', gale: '颶風' }[card.onEnter.weather] ?? card.onEnter.weather;
    parts.push(`使天候轉為${w}`);
  }
  if (card.onEnter.terrain) {
    parts.push(`將場地轉為「${TERRAIN_NAME[card.onEnter.terrain] ?? card.onEnter.terrain}」`);
  }
  return parts.length ? `進場時${parts.join('、')}（照行動序結算，後開者覆蓋）` : null;
}

// ---- 觸發描述（triggers 資料 → 人話）----

const TRIGGER_WHEN = {
  death: { self: '自身倒下時', ally: '有隊友倒下時', enemy: '有敵人倒下時', any: '有單位倒下時' },
  cast: { self: '施放絕技後', ally: '隊友施放絕技後', enemy: '敵方施放絕技後', any: '任一方施放絕技後' },
  normal: { self: '普攻時' },
  markedHit: { enemy: '隊友攻擊帶獵印的敵人時' },
  buffGained: { self: '' }, // 由 negative 決定文案
  hpBelow: { self: '' }, // 由 pct 決定文案
  hit: { self: '' }, // 由 via 決定文案
};

// 單條觸發 → 描述字串。
export function describeTrigger(t) {
  if (!t || !t.effects?.length) return '';
  const who = t.who ?? { death: 'ally', cast: 'self', normal: 'self', hit: 'self', hpBelow: 'self', buffGained: 'self' }[t.on];
  let when;
  if (t.on === 'hit') {
    when = t.via === 'normal' ? '受到普攻時' : t.via === 'skill' ? '受到技能傷害時' : '受到直接傷害時';
  } else if (t.on === 'hpBelow') {
    when = `生命首次低於 ${pct(t.pct ?? 0.5)} 時`;
  } else if (t.on === 'buffGained') {
    when = t.negative == null ? '獲得任何狀態時' : t.negative ? '獲得減益時' : '獲得增益時';
  } else {
    when = TRIGGER_WHEN[t.on]?.[who] ?? t.on;
  }
  if (t.where) when = when.replace('隊友', `${describeWhere(t.where)}隊友`).replace('敵人', `${describeWhere(t.where)}敵人`);
  const chance = t.chance != null ? `有 ${pct(t.chance)} 機率` : '';
  const effs = t.effects.map((e) => describeEffect(e, '觸發對象')).filter(Boolean).join('；');
  const once = (t.once ?? (t.on === 'hpBelow')) ? '（每場一次）' : '';
  return `${when}${chance ? `，${chance}` : ''}：${effs}${once}`;
}

// cardId → 觸發描述陣列（含名稱）。
export function triggerInfoForCard(cardId) {
  const card = CARDS[cardId];
  if (!card || !card.triggers) return [];
  return card.triggers.map((t) => ({ name: t.name ?? '觸發', desc: describeTrigger(t) })).filter((t) => t.desc);
}

// cardId → 普攻變體描述（無變體回 null）。
export function basicInfoForCard(cardId) {
  const ba = CARDS[cardId]?.basicAttack;
  // 每張卡都固定顯示普攻資訊——玩家不用先知道「沒寫＝標準」的潛規則
  const STANDARD = '對敵方單體造成 100% 攻擊力的傷害';
  if (!ba) return STANDARD;
  if (ba.hits) return `連擊：每次普攻打出 ${ba.hits} 段（每段 ${pct(ba.mult ?? 1 / ba.hits)} 攻擊力）`;
  if (ba.splash) return `濺射：對敵方單體與相鄰的敵人造成 ${pct(ba.splash)} 攻擊力的傷害`;
  if (ba.heal) return `奶擊：攻擊後治療血量最低的隊友 ${pct(ba.heal)} 攻擊力的生命`;
  if (ba.everyN) return `蓄力：每第 ${ba.everyN} 次普攻改為 ${pct(ba.mult ?? 2)} 攻擊力的強化一擊`;
  return STANDARD;
}

// ---- 戰鬥中狀態小圖示的人話標籤（點擊單位的狀態面板用）----
// 吃 summarizeBuffs 的摘要物件（kind/stat/control/element/neg/turns/charges）。
export function buffLabel(b) {
  switch (b.kind) {
    case 'dot': return b.element === 'fire' ? '灼燒（每次行動前受傷）' : '中毒（每次行動前受傷）';
    case 'hot': return '持續回復（每次行動前回血）';
    case 'shield': return '護盾（優先吸收傷害）';
    case 'thorns': return '荊棘（反彈受到的傷害）';
    case 'counter': return '反擊姿態（受擊時回敬一擊）';
    case 'control':
      return { taunt: '嘲諷（吸引敵方攻擊）', silence: '沉默（無法行動）', freeze: '凍結（無法回能）' }[b.control] ?? b.control;
    case 'element': return `屬性轉化（暫時變為${ELEMENT_LABEL[b.element] ?? b.element}屬性）`;
    case 'castDrain': return '靈壓領域（敵方施法時其餘敵人扣能量）';
    case 'nightmare': return '惡夢印記（受直接傷害時額外損失生命）';
    case 'debuffBlock': return `格擋護符（可再彈開 ${b.charges ?? 1} 個負面狀態）`;
    case 'healOnHit': return `受擊回癒（被打時回血，剩 ${b.charges ?? 1} 層）`;
    case 'mark': return '獵印（被攻擊時可能觸發敵方連動）';
    case 'cheatDeath': return '不滅意志（致死傷害改留 1 點生命）';
    case 'stat': {
      const base = STAT_LABEL[b.stat] ?? b.stat;
      return `${base}${b.neg ? '降低' : '提升'}`;
    }
    default: return b.kind;
  }
}
