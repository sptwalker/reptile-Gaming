/**
 * 战斗引擎 (P9)
 * - 30FPS 帧级模拟
 * - 4态 AI 状态机 (aggressive / kiting / defensive / fear)
 * - 恐惧系统 + 狂暴计时器
 * - 技能冷却 + buff 系统
 * - 逐帧记录 + 战斗摘要
 */

'use strict';

const { secureRandomFloat } = require('../utils/random');
const rules = require('../models/game-rules');

/* ═══════════════════════════════════════════
 * 战斗属性计算
 * ═══════════════════════════════════════════ */

/**
 * 从宠物六维属性计算战斗属性
 * @param {{ attr: object, level: number, stamina: number, skills: Array }} fighter
 * @returns {object} 战斗属性
 */
function _calcCombatStats(fighter) {
    const a = fighter.attr;
    const lv = fighter.level;
    return {
        maxHp:  a.vit_base * rules.BATTLE_HP_VIT  + a.str_base * rules.BATTLE_HP_STR  + lv * rules.BATTLE_HP_LVL,
        atk:    a.str_base * rules.BATTLE_ATK_STR  + a.agi_base * rules.BATTLE_ATK_AGI + lv * rules.BATTLE_ATK_LVL,
        def:    a.vit_base * rules.BATTLE_DEF_VIT  + a.str_base * rules.BATTLE_DEF_STR + lv * rules.BATTLE_DEF_LVL,
        spd:    a.agi_base * rules.BATTLE_SPD_AGI  + a.per_base * rules.BATTLE_SPD_PER,
        crit:   rules.BATTLE_CRIT_BASE + (a.per_base || 0) * 0.005,
        dodge:  rules.BATTLE_DODGE_BASE + (a.agi_base || 0) * 0.005,
        battleStamina: (fighter.stamina || 50) * rules.BATTLE_STA_MULTIPLIER,
    };
}

/* ═══════════════════════════════════════════
 * 战斗单位状态
 * ═══════════════════════════════════════════ */

function _createUnit(fighter, side) {
    const stats = _calcCombatStats(fighter);
    const skillList = (fighter.skills || []).map(s => ({
        code: s.skill_code,
        level: s.skill_level || 1,
        cooldownLeft: 0,
    }));

    return {
        side,
        petId: fighter.id,
        name: fighter.name || `Pet#${fighter.id}`,
        quality: fighter.quality,
        stage: fighter.stage,

        // 战斗属性
        maxHp: stats.maxHp,
        hp: stats.maxHp,
        atk: stats.atk,
        baseAtk: stats.atk,
        def: stats.def,
        baseDef: stats.def,
        spd: stats.spd,
        baseSpd: stats.spd,
        crit: stats.crit,
        baseCrit: stats.crit,
        dodge: stats.dodge,
        baseDodge: stats.dodge,
        battleStamina: stats.battleStamina,
        maxBattleStamina: stats.battleStamina,

        // 状态
        fear: 0,
        aiState: 'aggressive',
        skills: skillList,
        buffs: [],

        // 位置（简化为1D距离）
        x: side === 'left' ? 100 : 700,
        y: 300,

        // 攻击冷却（基于速度）
        attackCooldown: 0,
        moveTarget: null,
    };
}

/* ═══════════════════════════════════════════
 * AI 状态机
 * ═══════════════════════════════════════════ */

function _updateAIState(unit, opponent) {
    const hpRatio = unit.hp / unit.maxHp;
    const fearRatio = unit.fear / rules.BATTLE_FEAR_ESCAPE;

    if (fearRatio >= 0.6) {
        unit.aiState = 'fear';
    } else if (hpRatio < rules.AI_HP_DEFENSIVE_THRESHOLD) {
        unit.aiState = 'defensive';
    } else if (unit.fear > rules.AI_FEAR_KITING_THRESHOLD) {
        unit.aiState = 'kiting';
    } else {
        unit.aiState = 'aggressive';
    }
}

/** AI 决策：选择行动 */
function _aiDecide(unit, opponent, frame) {
    // 恐惧逃跑检查
    if (unit.fear >= rules.BATTLE_FEAR_ESCAPE) {
        return { action: 'flee' };
    }

    const dist = Math.abs(unit.x - opponent.x);

    // 检查可用技能
    const readySkill = _pickSkill(unit, opponent, dist);
    if (readySkill) {
        return { action: 'skill', skill: readySkill };
    }

    switch (unit.aiState) {
        case 'aggressive':
            if (dist > 80) return { action: 'move', toward: true };
            if (unit.attackCooldown <= 0) return { action: 'attack' };
            return { action: 'idle' };

        case 'kiting':
            if (dist < 150) return { action: 'move', toward: false };
            if (unit.attackCooldown <= 0 && dist < 200) return { action: 'attack' };
            return { action: 'idle' };

        case 'defensive':
            if (dist > 120) return { action: 'move', toward: true };
            if (unit.attackCooldown <= 0) return { action: 'attack' };
            return { action: 'idle' };

        case 'fear':
            return { action: 'move', toward: false };

        default:
            return { action: 'idle' };
    }
}

/** 选择可用技能 */
function _pickSkill(unit, opponent, dist) {
    for (const sk of unit.skills) {
        if (sk.cooldownLeft > 0) continue;
        const effect = rules.BATTLE_SKILL_EFFECTS[sk.code];
        if (!effect) continue;

        const hpRatio = unit.hp / unit.maxHp;

        // 治疗技能：HP<50%时使用
        if (effect.type === 'heal' && hpRatio < 0.5) return sk;

        // buff技能：HP>30%时使用
        if (effect.type === 'buff' && hpRatio > 0.3) return sk;

        // 恐惧技能：对手恐惧>50时使用
        if (effect.type === 'fear_skill' && opponent.fear > 50) return sk;

        // 攻击技能：距离合适时使用
        if ((effect.type === 'melee' && dist <= 100) ||
            (effect.type === 'ranged' && dist <= 300)) {
            return sk;
        }
    }
    return null;
}

/* ═══════════════════════════════════════════
 * 伤害计算
 * ═══════════════════════════════════════════ */

function _calcDamage(attacker, defender, rageMulti, skillMulti) {
    const baseAtk = attacker.atk * skillMulti;

    // 防御减伤
    const defReduction = 1 - defender.def / (defender.def + rules.BATTLE_DEF_CONSTANT);

    // 伤害浮动 ±15%
    const float = 1 + (secureRandomFloat() * 2 - 1) * rules.BATTLE_DAMAGE_FLOAT;

    // 体力惩罚
    const staPenalty = attacker.battleStamina <= 0 ? rules.BATTLE_STA_EMPTY_PENALTY : 1;

    // 暴击
    let critMulti = 1;
    let isCrit = false;
    if (secureRandomFloat() < attacker.crit) {
        critMulti = rules.BATTLE_CRIT_MULTI;
        isCrit = true;
    }

    // 闪避
    if (secureRandomFloat() < defender.dodge) {
        return { damage: 0, dodged: true, crit: false };
    }

    const damage = Math.max(1, Math.floor(baseAtk * defReduction * float * rageMulti * staPenalty * critMulti));
    return { damage, dodged: false, crit: isCrit };
}

/* ═══════════════════════════════════════════
 * Buff 系统
 * ═══════════════════════════════════════════ */

function _applyBuff(unit, effect, skillCode) {
    if (!effect.effect) return;
    unit.buffs.push({
        code: skillCode,
        effect: effect.effect,
        value: effect.value,
        remaining: effect.duration,
    });
    _recalcBuffs(unit);
}

function _tickBuffs(unit) {
    unit.buffs = unit.buffs.filter(b => {
        b.remaining--;
        return b.remaining > 0;
    });
    _recalcBuffs(unit);
}

function _recalcBuffs(unit) {
    // 重置到基础值
    unit.def = unit.baseDef;
    unit.dodge = unit.baseDodge;
    unit.crit = unit.baseCrit;
    unit.atk = unit.baseAtk;

    for (const b of unit.buffs) {
        switch (b.effect) {
            case 'def_up':   unit.def   = Math.floor(unit.baseDef * (1 + b.value)); break;
            case 'dodge_up': unit.dodge = unit.baseDodge + b.value; break;
            case 'crit_up':  unit.crit  = unit.baseCrit + b.value; break;
            case 'atk_up':   unit.atk   = Math.floor(unit.baseAtk * (1 + b.value)); break;
        }
    }
}

/* ═══════════════════════════════════════════
 * 地图效果
 * ═══════════════════════════════════════════ */

function _applyMapBuff(unit, map) {
    if (!map || !map.buff) return;
    const { stat, mod } = map.buff;
    switch (stat) {
        case 'spd': unit.spd = Math.floor(unit.baseSpd * (1 + mod)); break;
        case 'atk': unit.atk = Math.floor(unit.baseAtk * (1 + mod)); unit.baseAtk = unit.atk; break;
        case 'def': unit.def = Math.floor(unit.baseDef * (1 + mod)); unit.baseDef = unit.def; break;
    }
}

/* ═══════════════════════════════════════════
 * 主模拟循环
 * ═══════════════════════════════════════════ */

/**
 * 执行完整战斗模拟
 * @param {{ pet1: object, pet2: object, mapId: string }} params
 * @returns {{ winner: string, frames: Array, summary: object }}
 */
function simulate({ pet1, pet2, mapId }) {
    const map = rules.ARENA_MAPS.find(m => m.id === mapId) || rules.ARENA_MAPS[0];

    const unitA = _createUnit(pet1, 'left');
    const unitB = _createUnit(pet2, 'right');

    // 应用地图效果
    _applyMapBuff(unitA, map);
    _applyMapBuff(unitB, map);

    const frames = [];
    let winner = null;
    const maxFrames = rules.BATTLE_MAX_FRAMES;

    // 统计
    const stats = {
        left:  { totalDamage: 0, hits: 0, crits: 0, dodges: 0, skillsUsed: 0 },
        right: { totalDamage: 0, hits: 0, crits: 0, dodges: 0, skillsUsed: 0 },
    };

    for (let frame = 0; frame < maxFrames; frame++) {
        // 狂暴倍率
        let rageMulti = 1;
        if (frame >= rules.BATTLE_RAGE_START_FRAME) {
            const rageSec = (frame - rules.BATTLE_RAGE_START_FRAME) / rules.BATTLE_FPS;
            rageMulti = 1 + rageSec * rules.BATTLE_RAGE_PER_SEC;
        }

        // 恐惧衰减（每秒）
        if (frame % rules.BATTLE_FPS === 0) {
            unitA.fear = Math.max(0, unitA.fear - rules.BATTLE_FEAR_DECAY);
            unitB.fear = Math.max(0, unitB.fear - rules.BATTLE_FEAR_DECAY);
        }

        // buff tick（每帧）
        _tickBuffs(unitA);
        _tickBuffs(unitB);

        // 攻击冷却递减
        unitA.attackCooldown = Math.max(0, unitA.attackCooldown - 1);
        unitB.attackCooldown = Math.max(0, unitB.attackCooldown - 1);

        // 技能冷却递减
        for (const sk of unitA.skills) sk.cooldownLeft = Math.max(0, sk.cooldownLeft - 1);
        for (const sk of unitB.skills) sk.cooldownLeft = Math.max(0, sk.cooldownLeft - 1);

        // AI 状态更新
        _updateAIState(unitA, unitB);
        _updateAIState(unitB, unitA);

        // AI 决策
        const decA = _aiDecide(unitA, unitB, frame);
        const decB = _aiDecide(unitB, unitA, frame);

        // 执行行动
        const eventsA = _executeAction(unitA, unitB, decA, rageMulti, stats.left);
        const eventsB = _executeAction(unitB, unitA, decB, rageMulti, stats.right);

        // 记录帧（每3帧记录一次以减少数据量）
        if (frame % 3 === 0) {
            frames.push({
                f: frame,
                a: { x: unitA.x, hp: unitA.hp, fear: unitA.fear, st: unitA.aiState, sta: unitA.battleStamina },
                b: { x: unitB.x, hp: unitB.hp, fear: unitB.fear, st: unitB.aiState, sta: unitB.battleStamina },
                ev: [...eventsA, ...eventsB],
            });
        }

        // 胜负判定
        if (unitA.hp <= 0 && unitB.hp <= 0) {
            winner = 'draw';
            break;
        }
        if (unitA.hp <= 0) { winner = 'right'; break; }
        if (unitB.hp <= 0) { winner = 'left'; break; }

        // 恐惧逃跑判定
        if (decA.action === 'flee') { winner = 'right'; break; }
        if (decB.action === 'flee') { winner = 'left'; break; }
    }

    // 超时判定：HP百分比高者胜
    if (!winner) {
        const ratioA = unitA.hp / unitA.maxHp;
        const ratioB = unitB.hp / unitB.maxHp;
        winner = ratioA > ratioB ? 'left' : ratioB > ratioA ? 'right' : 'draw';
    }

    const summary = {
        winner,
        map: map.id,
        totalFrames: frames.length,
        duration: Math.ceil((frames.length * 3) / rules.BATTLE_FPS),
        left: {
            petId: unitA.petId,
            name: unitA.name,
            hpRemaining: Math.max(0, unitA.hp),
            hpMax: unitA.maxHp,
            ...stats.left,
        },
        right: {
            petId: unitB.petId,
            name: unitB.name,
            hpRemaining: Math.max(0, unitB.hp),
            hpMax: unitB.maxHp,
            ...stats.right,
        },
    };

    return { winner, frames, summary };
}

/* ═══════════════════════════════════════════
 * 行动执行
 * ═══════════════════════════════════════════ */

function _executeAction(unit, opponent, decision, rageMulti, statTracker) {
    const events = [];

    switch (decision.action) {
        case 'move': {
            const dir = decision.toward ? (opponent.x > unit.x ? 1 : -1) : (opponent.x > unit.x ? -1 : 1);
            const moveSpeed = Math.max(2, Math.floor(unit.spd / 10));
            unit.x = Math.max(20, Math.min(780, unit.x + dir * moveSpeed));
            break;
        }

        case 'attack': {
            const dist = Math.abs(unit.x - opponent.x);
            if (dist > 100) break;

            const result = _calcDamage(unit, opponent, rageMulti, 1.0);
            unit.attackCooldown = Math.max(10, 30 - Math.floor(unit.spd / 5));
            unit.battleStamina -= rules.BATTLE_STA_PER_ATK;

            if (result.dodged) {
                statTracker.dodges++;
                events.push({ type: 'dodge', src: unit.side, tgt: opponent.side });
            } else {
                opponent.hp -= result.damage;
                opponent.fear += rules.BATTLE_FEAR_PER_HIT;
                statTracker.totalDamage += result.damage;
                statTracker.hits++;
                if (result.crit) statTracker.crits++;
                events.push({
                    type: result.crit ? 'crit' : 'hit',
                    src: unit.side,
                    tgt: opponent.side,
                    dmg: result.damage,
                });
            }
            break;
        }

        case 'skill': {
            const sk = decision.skill;
            const effect = rules.BATTLE_SKILL_EFFECTS[sk.code];
            if (!effect) break;

            sk.cooldownLeft = effect.cooldown;
            statTracker.skillsUsed++;

            if (effect.type === 'heal') {
                const healAmt = Math.floor(unit.maxHp * effect.value);
                unit.hp = Math.min(unit.maxHp, unit.hp + healAmt);
                events.push({ type: 'heal', src: unit.side, amt: healAmt, skill: sk.code });
            } else if (effect.type === 'buff') {
                _applyBuff(unit, effect, sk.code);
                events.push({ type: 'buff', src: unit.side, skill: sk.code, effect: effect.effect });
            } else if (effect.type === 'fear_skill') {
                opponent.fear += rules.BATTLE_FEAR_SKILL;
                events.push({ type: 'fear', src: unit.side, tgt: opponent.side, skill: sk.code, fear: rules.BATTLE_FEAR_SKILL });
            } else {
                // 攻击型技能
                const dist = Math.abs(unit.x - opponent.x);
                const maxRange = effect.type === 'ranged' ? 300 : 100;
                if (dist > maxRange) break;

                const result = _calcDamage(unit, opponent, rageMulti, effect.dmg_multi);
                unit.battleStamina -= rules.BATTLE_STA_PER_ATK * 2;

                if (result.dodged) {
                    events.push({ type: 'dodge', src: unit.side, tgt: opponent.side, skill: sk.code });
                } else {
                    opponent.hp -= result.damage;
                    opponent.fear += effect.fear;
                    statTracker.totalDamage += result.damage;
                    statTracker.hits++;
                    if (result.crit) statTracker.crits++;
                    events.push({
                        type: 'skill_hit',
                        src: unit.side,
                        tgt: opponent.side,
                        skill: sk.code,
                        dmg: result.damage,
                        crit: result.crit,
                    });
                }

                // 技能附带buff
                if (effect.effect) {
                    _applyBuff(unit, effect, sk.code);
                }
            }
            break;
        }

        case 'flee':
            events.push({ type: 'flee', src: unit.side });
            break;

        case 'idle':
        default:
            break;
    }

    return events;
}

module.exports = { simulate };
