// 技能描述自動生成：從 SKILLS 的效果資料組出人話。
// 純模組——資料改了描述自動跟上，不用手維護文案。
import { SKILLS, CARD_SKILLS } from './skills.js';
import { CLASSES } from '../data/classes.js';
import { CARDS } from '../data/cards.js';

const TARGET_LABEL = {
  singleEnemyByColumn: '對位敵人',
  enemyFrontRow: '敵方前排',
  enemyBackRow: '敵方後排',
  enemyColumn: '敵方直排',
  allEnemies: '敵方全體',
  allAllies: '我方全體',
  lowestHpAlly: '血量最低的隊友',
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
  energyGain: '集氣速度',
};

const CONTROL_LABEL = { taunt: '嘲諷', stun: '暈眩', silence: '沉默' };

const pct = (x) => `${Math.round(x * 100)}%`;

// buff 數值 → 「+30%」/「-30%」（mul 相對 1、add 直接百分比）。
function buffDelta(op, value) {
  const d = op === 'mul' ? value - 1 : value;
  return `${d >= 0 ? '+' : '-'}${pct(Math.abs(d))}`;
}

const dur = (d) => (d ? `，持續 ${d} 次行動` : '');

function describeEffect(effect, targetLabel) {
  const who = SCOPE_LABEL[effect.scope] ?? targetLabel ?? '目標';
  switch (effect.type) {
    case 'damage':
      return `對${who}造成 ${pct(effect.mult)} 攻擊力的傷害`;
    case 'heal':
      return `治療${who} ${pct(effect.power)} 攻擊力的生命`;
    case 'buff':
      return `${who}${STAT_LABEL[effect.stat] ?? effect.stat} ${buffDelta(effect.op, effect.value)}${dur(effect.duration)}`;
    case 'dot': {
      const name = effect.element === 'fire' ? '灼燒' : '持續傷害';
      return `對${who}附加${name}（每次行動前受 ${pct(effect.power)} 攻擊力傷害${dur(effect.duration)}）`;
    }
    case 'shield':
      return `為${who}套上 ${pct(effect.power)} 攻擊力的護盾${dur(effect.duration)}`;
    case 'energy':
      return `${who}獲得 ${effect.amount} 點能量`;
    case 'control':
      return `對${who}施加${CONTROL_LABEL[effect.control] ?? effect.control}${dur(effect.duration)}`;
    default:
      return '';
  }
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

function describeWhere(where) {
  if (!where) return '';
  if (where.race) return `「${where.race}」`;
  if (where.element) return `「${where.element}」屬性`;
  if (where.class) return `「${where.class}」`;
  return '';
}

// 單條被動 → 描述字串。未知結構回空字串。
export function describePassive(p) {
  if (!p || !p.effects || p.effects.length === 0) return '';
  const who = PASSIVE_TARGET_LABEL[p.target] ?? '自身';
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
        const per = e.op === 'mul' ? `+${pct(e.basePct || 0)}` : `+${e.valuePer || 0}`;
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
