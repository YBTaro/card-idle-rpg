// 技能描述自動生成：從 SKILLS 的效果資料組出人話。
// 純模組——資料改了描述自動跟上，不用手維護文案。
import { SKILLS, CARD_SKILLS } from './skills.js';
import { CLASSES } from '../data/classes.js';
import { CARDS } from '../data/cards.js';
import { ELEMENT_LABEL } from '../data/elements.js';

const TARGET_LABEL = {
  singleEnemyByColumn: '對位敵人',
  enemyFrontRow: '敵方前排',
  enemyBackRow: '敵方後排',
  enemyColumn: '敵方直排',
  allEnemies: '敵方全體',
  allAllies: '我方全體',
  lowestHpAlly: '血量最低的隊友',
  randomEnemy: '隨機敵人',
  lowestHpEnemy: '血量最低的敵人',
  deadAlly: '倒下的隊友',
  self: '自身',
};

const SCOPE_LABEL = {
  self: '自身',
  target: null, // 用技能主目標的說法
  allAllies: '我方全體',
  allEnemies: '敵方全體',
  alliesExceptTarget: '其他隊友',
};

const STAT_LABEL = {
  atk: '攻擊',
  def: '防禦',
  critChance: '暴擊率',
  critMult: '暴擊傷害',
  dmgDealt: '造成傷害',
  dmgTaken: '承受傷害',
  dotTaken: '受到的持續傷害',
  energyGain: '集氣速度',
};

const CONTROL_LABEL = { taunt: '嘲諷', stun: '暈眩', silence: '沉默（無法行動）', freeze: '凍結（無法回能）' };

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
        text += `；目標生命低於 ${pct(effect.executeBelow)} 時傷害 ×${effect.executeBonus ?? 1.5}`;
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
      const w = {
        sunny: '烈日（火屬傷害 +20%、水屬 -20%）',
        rain: '暴雨（水屬傷害 +20%、火屬 -20%）',
        gale: '颶風（風屬傷害 +20%、風屬承傷 -10%）',
      }[effect.weather];
      text = `使天候轉為${w ?? effect.weather}`;
      break;
    }
    case 'terrain':
      text = `將場地轉為「${TERRAIN_NAME[effect.terrain] ?? effect.terrain}」`;
      break;
    case 'transmute':
      text = `將${who}轉化為自身剋制的屬性${dur(effect.duration)}`;
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
        const per = e.op === 'mul' ? `+${pct(e.basePct || 0)}` : `+${pct(e.valuePer || 0)}`;
        return `${side}每有一名${unitDesc}單位，${who}${statLabel} ${per}`;
      }
      return `${who}${statLabel} ${buffDelta(e.op, e.value)}`;
    })
    .filter(Boolean);
  return cond + effs.join('；');
}

// cardId → 被動描述陣列（無被動回空陣列）。
export function passiveInfoForCard(cardId) {
  const card = CARDS[cardId];
  if (!card || !card.passives) return [];
  return card.passives.map(describePassive).filter(Boolean);
}
