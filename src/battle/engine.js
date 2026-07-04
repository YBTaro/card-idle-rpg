// src/battle/engine.js
// 回合制戰鬥引擎（純邏輯）：固定位置出手序列 + 普攻輪↔技能階段。
//
// ═══════════════ 結算順序總表（單一真相來源；改順序＝改這裡＋補測試）═══════════════
//
// 【開場】（首次 step，_start）
//   1. 關卡預設環境宣告（weather → terrain；湧能磁場啟動能量在此觸發）
//   2. 進場被動照行動序 TURN_SEQUENCE（我1→敵1→我2→敵2…）依序開天氣/場地，後者覆蓋
//
// 【每一步】（step）
//   1. recomputePassives：清全部 aura → 依存活單位被動重建（無累積誤差）
//   2. applyEnvAuras：當前天氣/場地光環（同為 aura，被覆蓋即換）
//   3. 進入 普攻輪(_stepNormal) 或 技能階段(_stepSkill)
//
// 【回合換算】（普攻輪繞回序列開頭時）
//   round+1 → 回合上限判定 → 侵蝕之地全體結算（可帶走本動行動者）
//
// 【普攻回合】（_act normal；只有普攻算回合）
//   DoT 結算（可致死→跳過行動）→ HoT 結算 → turn 事件 → 暈眩判定 →
//   普攻 → 全 buff duration -1、到期移除 → buffchange 同步
//
// 【技能施放】（_act skill；免費行動：不結算 DoT/HoT、不遞減 duration）
//   能量歸零 → castSkill：效果陣列「依序」結算（作者寫的順序＝結算順序，
//   例：先引爆舊灼燒→再傷害→再點新火）→ 靈壓干擾（castDrain）結算
//   ＊同時滿氣多人：照 TURN_SEQUENCE 掃描，先掃到先放
//
// 【傷害路徑】（只有兩條，不要開第三條）
//   dealDamage：完整公式＋護盾＋受擊回能＋荊棘/反擊觸發（反傷自身不再連鎖）
//   dealDirect：繞盾直傷（DoT/引爆/侵蝕共用；不暴擊、不回能、不觸發反傷）
//
// 【治療路徑】heal/lifesteal/HoT 全部經 healAmount()（環境 healMul 唯一入口）
//
// 【觸發器掛點】（新增觸發型 buff 先看這裡有沒有現成掛點）
//   受直接攻擊時 → dealDamage 內（thorns/counter）
//   敵方施放技能後 → _act skill 分支尾（castDrain）
//   行動前 → _act normal 頭（dot/hot）
//   回合開始 → _stepNormal 回合換算處（環境侵蝕）
// ═══════════════════════════════════════════════════════════════════
import { EventEmitter } from '../core/events.js';
import { Rng } from '../core/rng.js';
import { ENERGY_MAX } from './unit.js';
import { TURN_SEQUENCE } from './positions.js';
import { normalAttack, castSkill, skillFor } from './skills.js';
import { tickBuffs, dotEntries, hotEntries, hasControl, summarizeBuffs } from './buffs.js';
import { dealDot, dealDirect, healAmount } from './effects.js';
import { recomputePassives, applyEnvAuras } from './passives.js';
import { envAurasOf, envRulesOf, TERRAINS } from './environments.js';

export const MAX_ROUNDS = 100; // 回合上限，防打不完
export const MAX_SKILL_PASSES = 50; // 技能階段掃描上限，防死迴圈

export class BattleEngine {
  constructor(teamA, teamB, { rng, env = null } = {}) {
    this.teams = [teamA, teamB];
    this.units = [...teamA, ...teamB];
    this.rng = rng || new Rng();
    // 環境（戰鬥中可變）：關卡預設 → 進場被動（照行動序）→ 技能覆蓋
    this.weatherId = env?.weather ?? null;
    this.terrainId = env?.terrain ?? null;
    this._started = false; // 首步才結算開場宣告與進場被動（此時 log 監聽已就緒）
    this.emitter = new EventEmitter();
    this.over = false;
    this.winner = null;
    this.round = 0;

    this.phase = 'normal';
    this.cursor = 0; // 目前序列索引
    this.resumeIndex = 0; // 技能階段結束後普攻接續處
    this._lastActedIdx = -1; // 偵測繞回換算回合
    this._skillPasses = 0;
    this._skillCastThisPass = false;
  }

  on(event, fn) { return this.emitter.on(event, fn); }
  emit(event, payload) { this.emitter.emit(event, payload); }
  enemiesOf(unit) { return this.teams[unit.team ^ 1]; }
  alliesOf(unit) { return this.teams[unit.team]; }
  teamAlive(team) { return this.teams[team].some((u) => u.alive); }

  // 目前生效的特殊規則（動態：場地/天氣被覆蓋即換）。
  get rules() { return envRulesOf(this.weatherId, this.terrainId); }

  // 換天氣（技能/進場被動）。後開覆蓋先開。
  setWeather(id, byUnit = null) {
    if (!id) return;
    this.weatherId = id;
    this.emit('weather', { id, unit: byUnit });
  }

  // 換場地。湧能磁場：啟動當下全體 +activateEnergy（一次性）。
  setTerrain(id, byUnit = null) {
    if (!id) return;
    this.terrainId = id;
    this.emit('terrain', { id, unit: byUnit });
    const gain = TERRAINS[id]?.rules?.activateEnergy;
    if (gain) {
      for (const u of this.units) {
        if (!u.alive) continue;
        u.gainEnergy(gain);
        this.emit('energy', { unit: u, value: u.energy });
      }
    }
  }

  // 開場結算：關卡預設環境宣告 → 進場被動照行動序 1-1-2-2 依序開（後者覆蓋，
  // 守方最後一位的被動天然搶到最終天氣/場地）。
  _start() {
    this._started = true;
    if (this.weatherId) this.emit('weather', { id: this.weatherId, unit: null });
    if (this.terrainId) {
      const tid = this.terrainId;
      this.terrainId = null;
      this.setTerrain(tid, null); // 走 setTerrain：湧能磁場開場也要觸發啟動能量
    }
    for (const [team, pos] of TURN_SEQUENCE) {
      const u = this._unitAt(team, pos);
      if (!u?.onEnter) continue;
      if (u.onEnter.weather) this.setWeather(u.onEnter.weather, u);
      if (u.onEnter.terrain) this.setTerrain(u.onEnter.terrain, u);
    }
  }

  _unitAt(team, pos) {
    return this.teams[team].find((u) => u.alive && u.pos === pos) || null;
  }

  _canCast(u) {
    return u.alive && u.energy >= ENERGY_MAX && !hasControl(u, 'silence') && !hasControl(u, 'stun');
  }

  _anyoneCharged() {
    return this.units.some((u) => this._canCast(u));
  }

  _advanceToActor(startIdx) {
    for (let k = 0; k < TURN_SEQUENCE.length; k++) {
      const idx = (startIdx + k) % TURN_SEQUENCE.length;
      const [team, pos] = TURN_SEQUENCE[idx];
      const u = this._unitAt(team, pos);
      if (u) return { unit: u, idx };
    }
    return null;
  }

  // 推進一個動作。回傳動作紀錄或 null（戰鬥已結束）。
  step() {
    if (this.over) return null;
    if (!this._started) this._start();
    recomputePassives(this.teams);
    applyEnvAuras(this.teams, envAurasOf(this.weatherId, this.terrainId)); // 環境光環：動態、每步重算
    return this.phase === 'normal' ? this._stepNormal() : this._stepSkill();
  }

  _stepNormal() {
    const found = this._advanceToActor(this.cursor);
    if (!found) { this._endByHp(); return null; }
    const { unit, idx } = found;

    if (idx <= this._lastActedIdx) {
      this.round += 1;
      this.emit('round', { round: this.round });
      if (this.round >= MAX_ROUNDS) { this._endByHp(); return { type: 'timeout', unit }; }
      // 特殊規則：侵蝕之地——每回合非豁免屬性流失最大生命 %（走 dealDirect：繞盾直傷唯一入口）
      const decay = this.rules.roundDecay;
      if (decay) {
        const ctx = { emit: (event, payload) => this.emit(event, payload) };
        for (const u of this.units) {
          if (!u.alive) continue;
          if (decay.exemptElement && u.element === decay.exemptElement) continue;
          dealDirect(u, Math.max(1, u.maxHp * decay.pct), ctx, { skill: 'env' });
        }
        this._checkEnd();
        if (this.over) return { type: 'attack', unit };
        if (!unit.alive) return { type: 'attack', unit }; // 行動者被侵蝕帶走 → 跳過本動
      }
    }
    this._lastActedIdx = idx;

    this._act(unit, false);
    this._checkEnd();
    if (this.over) return { type: 'attack', unit };

    this.cursor = (idx + 1) % TURN_SEQUENCE.length;
    if (this._anyoneCharged()) {
      this.resumeIndex = this.cursor;
      this.phase = 'skill';
      this.cursor = 0;
      this._skillPasses = 0;
      this._skillCastThisPass = false;
    }
    return { type: 'attack', unit };
  }

  _stepSkill() {
    while (this.cursor < TURN_SEQUENCE.length) {
      const [team, pos] = TURN_SEQUENCE[this.cursor];
      this.cursor += 1;
      const u = this._unitAt(team, pos);
      if (u && this._canCast(u)) {
        this._act(u, true);
        this._checkEnd();
        this._skillCastThisPass = true;
        return { type: 'ultimate', unit: u };
      }
    }
    // 一趟掃完
    this._skillPasses += 1;
    if (this._skillCastThisPass && this._skillPasses < MAX_SKILL_PASSES) {
      this._skillCastThisPass = false;
      this.cursor = 0;
      return this._stepSkill(); // 同一 step 內接著找下一個要放的人
    }
    // 零施放或超過上限 → 回普攻、從中斷處接續
    this.phase = 'normal';
    this.cursor = this.resumeIndex;
    return { type: 'skillPhaseEnd' };
  }

  _act(u, isSkill) {
    const ctx = {
      allies: this.alliesOf(u),
      enemies: this.enemiesOf(u),
      rng: this.rng,
      rules: this.rules, // 效果層規則掛鉤（治療減半/禁復活）
      setWeather: (id) => this.setWeather(id, u),
      setTerrain: (id) => this.setTerrain(id, u),
      emit: (event, payload) => this.emit(event, payload),
    };
    if (isSkill) {
      // 技能不算回合：免費行動，不結算 DoT、不遞減 buff duration
      this.emit('turn', { unit: u });
      u.energy = 0;
      this.emit('energy', { unit: u, value: 0 });
      castSkill(u, skillFor(u), ctx);
      // 靈壓干擾：對面有人掛 castDrain → 施法者的「其他隊友」能量被抽（可疊加）
      const drain = this.enemiesOf(u)
        .filter((e) => e.alive)
        .flatMap((e) => e.buffs?.filter((b) => b.kind === 'castDrain') ?? [])
        .reduce((s, b) => s + (b.amount ?? 0), 0);
      if (drain > 0) {
        for (const ally of this.alliesOf(u)) {
          if (ally === u || !ally.alive) continue;
          const before = ally.energy;
          ally.energy = Math.max(0, ally.energy - drain);
          if (ally.energy !== before) {
            this.emit('drain', { unit: ally, amount: before - ally.energy });
            this.emit('energy', { unit: ally, value: ally.energy });
          }
        }
      }
      return;
    }
    // 普攻才算回合：出手前結算 DoT（可致死 → 跳過行動）與 HoT，行動後遞減 buff
    for (const dot of dotEntries(u)) dealDot(u, dot, ctx);
    if (!u.alive) return;
    for (const hot of hotEntries(u)) {
      const healed = u.heal(healAmount(ctx, hot.amount)); // 治療倍率唯一入口
      if (healed > 0) ctx.emit('heal', { source: null, target: u, amount: healed, kind: 'hot' });
    }
    this.emit('turn', { unit: u });
    if (hasControl(u, 'stun')) {
      this.emit('stunned', { unit: u });
    } else {
      normalAttack(u, ctx);
    }
    // 有掛任何狀態就同步（不只到期移除）——前端剩餘回合數字要跟著遞減
    const hadBuffs = (u.buffs?.length ?? 0) > 0;
    tickBuffs(u);
    if (hadBuffs || (u.buffs?.length ?? 0) > 0) this.emit('buffchange', { unit: u, buffs: summarizeBuffs(u) });
  }

  _checkEnd() {
    if (this.over) return;
    const a = this.teamAlive(0);
    const b = this.teamAlive(1);
    if (!a || !b) {
      this.over = true;
      this.winner = a ? 0 : b ? 1 : -1;
      this.emit('battleEnd', { winner: this.winner });
    }
  }

  _endByHp() {
    if (this.over) return;
    const sum = (t) => this.teams[t].reduce((s, u) => s + Math.max(0, u.hp), 0);
    const a = sum(0);
    const b = sum(1);
    this.over = true;
    this.winner = a > b ? 0 : b > a ? 1 : -1;
    this.emit('battleEnd', { winner: this.winner });
  }
}

export { ENERGY_MAX };
