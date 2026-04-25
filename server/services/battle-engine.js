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
    const bodyParts = _createBodyParts(fighter);
    return {
        maxHp:  _calcBodyHp(bodyParts),
        atk:    a.str_base * rules.BATTLE_ATK_STR  + a.agi_base * rules.BATTLE_ATK_AGI + lv * rules.BATTLE_ATK_LVL,
        def:    a.vit_base * rules.BATTLE_DEF_VIT  + a.str_base * rules.BATTLE_DEF_STR + lv * rules.BATTLE_DEF_LVL,
        spd:    a.agi_base * rules.BATTLE_SPD_AGI  + a.per_base * rules.BATTLE_SPD_PER,
        crit:   rules.BATTLE_CRIT_BASE + (a.per_base || 0) * 0.005,
        dodge:  rules.BATTLE_DODGE_BASE + (a.agi_base || 0) * 0.005,
        battleStamina: (fighter.stamina || 50) * rules.BATTLE_STA_MULTIPLIER,
        bodyParts,
    };
}

function _createBodyParts(fighter) {
    const a = fighter.attr;
    const vit = Number(a.vit_base || 0);
    const agi = Number(a.agi_base || 0);
    const lv = Math.max(1, Number(fighter.level || 1));
    const stage = Math.max(0, Number(fighter.stage || 0));
    const levelMul = 1 + (lv - 1) * rules.BATTLE_BODY_LEVEL_GROWTH;
    const regen = rules.BATTLE_BODY_BASE_REGEN + stage;
    const parts = {};

    for (const [code, cfg] of Object.entries(rules.BATTLE_BODY_PARTS)) {
        parts[code] = _makeBodyPart(
            code,
            cfg.name,
            cfg.hp_base + vit * cfg.hp_vit,
            cfg.def_base + agi * cfg.def_agi,
            regen,
            levelMul
        );
    }
    return parts;
}

function _makeBodyPart(code, name, hp, def, regen, levelMul) {
    const maxHp = Math.max(1, Math.round(hp * levelMul));
    return {
        code,
        name,
        maxHp,
        hp: maxHp,
        def: Math.max(0, Math.round(def * levelMul)),
        regen,
        detached: false,
    };
}

function _calcBodyHp(parts) {
    return Object.entries(rules.BATTLE_BODY_PARTS)
        .filter(([, cfg]) => cfg.core)
        .reduce((sum, [key]) => sum + Math.max(0, parts[key].hp), 0);
}

function _syncBodyHp(unit) {
    unit.hp = _calcBodyHp(unit.bodyParts);
}

function _partLossRatio(part) {
    return Math.max(0, Math.min(1, 1 - Math.max(0, part.hp) / part.maxHp));
}

function _pickTargetPart(unit) {
    const candidates = Object.entries(rules.BATTLE_BODY_PARTS)
        .map(([key, cfg]) => [key, cfg.weight])
        .filter(([key]) => !unit.bodyParts[key].detached && unit.bodyParts[key].hp > 0);
    const total = candidates.reduce((sum, item) => sum + item[1], 0);
    let roll = secureRandomFloat() * total;
    for (const item of candidates) {
        roll -= item[1];
        if (roll <= 0) return item[0];
    }
    return candidates.length ? candidates[candidates.length - 1][0] : 'torso';
}

function _recoverBodyParts(unit) {
    let changed = false;
    for (const part of Object.values(unit.bodyParts)) {
        if (part.detached || part.hp >= part.maxHp) continue;
        part.hp = Math.min(part.maxHp, part.hp + part.regen);
        changed = true;
    }
    if (changed) _syncBodyHp(unit);
}

function _updateBodyImpairments(unit) {
    const parts = unit.bodyParts;
    const headLoss = _partLossRatio(parts.head);
    const torsoLoss = _partLossRatio(parts.torso);
    const limbKeys = ['foreLeft', 'foreRight', 'hindLeft', 'hindRight'];
    const detachedLimbs = limbKeys.filter(key => parts[key].detached).length;
    const draggedLimbs = limbKeys.filter(key => !parts[key].detached && _partLossRatio(parts[key]) >= rules.BATTLE_INJURY_HEAVY).length;

    unit.canUseSkills = torsoLoss < 1;
    unit.headCanMove = headLoss < 1;
    unit.visionMult = headLoss >= 1 ? rules.BATTLE_HEAD_VISION_DISABLED
        : headLoss >= rules.BATTLE_INJURY_HEAVY ? rules.BATTLE_HEAD_VISION_HEAVY
            : headLoss >= rules.BATTLE_INJURY_HALF ? rules.BATTLE_HEAD_VISION_HALF : 1;
    unit.headTurnMult = headLoss >= 1 ? 0 : headLoss >= rules.BATTLE_INJURY_HEAVY ? rules.BATTLE_HEAD_TURN_HEAVY : 1;
    unit.stepMult = torsoLoss >= 1 ? rules.BATTLE_TORSO_STEP_DISABLED
        : torsoLoss >= rules.BATTLE_INJURY_HEAVY ? rules.BATTLE_TORSO_STEP_HEAVY
            : torsoLoss >= rules.BATTLE_INJURY_HALF ? rules.BATTLE_TORSO_STEP_HALF : 1;
    unit.limbMoveMult = Math.max(0.08, 1 - draggedLimbs * rules.BATTLE_LIMB_DRAG_SPEED_PENALTY - detachedLimbs * rules.BATTLE_LIMB_DETACH_SPEED_PENALTY);
    unit.moveControl = Math.max(0.05, 1 - detachedLimbs * rules.BATTLE_LIMB_DETACH_CONTROL_PENALTY);
    unit.effectiveSpd = Math.max(1, Math.floor(unit.spd * unit.stepMult * unit.limbMoveMult));
    unit.spinChance = detachedLimbs > 0 ? Math.min(0.75, detachedLimbs * rules.BATTLE_LIMB_DETACH_SPIN_CHANCE) : 0;
}

function _snapshotBodyParts(unit) {
    const result = {};
    for (const [key, part] of Object.entries(unit.bodyParts)) {
        result[key] = {
            hp: Math.max(0, Math.round(part.hp)),
            max: part.maxHp,
            def: part.def,
            regen: part.regen,
            detached: part.detached,
        };
    }
    return result;
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
        bodyParts: stats.bodyParts,
        atk: stats.atk,
        baseAtk: stats.atk,
        def: stats.def,
        baseDef: stats.def,
        spd: stats.spd,
        baseSpd: stats.spd,
        effectiveSpd: stats.spd,
        crit: stats.crit,
        baseCrit: stats.crit,
        dodge: stats.dodge,
        baseDodge: stats.dodge,
        battleStamina: stats.battleStamina,
        maxBattleStamina: stats.battleStamina,
        canUseSkills: true,
        headCanMove: true,
        visionMult: 1,
        headTurnMult: 1,
        stepMult: 1,
        limbMoveMult: 1,
        moveControl: 1,
        spinChance: 0,
        tailDecoyFrames: 0,

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
    if (!unit.canUseSkills) return null;
    const effectiveDist = dist / Math.max(0.1, unit.visionMult);
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
        if ((effect.type === 'melee' && effectiveDist <= 100) ||
            (effect.type === 'ranged' && effectiveDist <= 300)) {
            return sk;
        }
    }
    return null;
}

/* ═══════════════════════════════════════════
 * 伤害计算
 * ═══════════════════════════════════════════ */

function _calcDamage(attacker, defender, rageMulti, skillMulti, targetPartKey) {
    if (defender.tailDecoyFrames > 0 && secureRandomFloat() < rules.BATTLE_TAIL_DECOY_HIT_CHANCE) {
        return { damage: 0, dodged: true, crit: false, part: 'tail_decoy', decoy: true };
    }

    const part = defender.bodyParts[targetPartKey] || defender.bodyParts.torso;
    const baseAtk = attacker.atk * skillMulti;

    // 部位防御减伤
    const totalDef = defender.def + part.def;
    const defReduction = 1 - totalDef / (totalDef + rules.BATTLE_DEF_CONSTANT);

    // 伤害浮动 ±15%
    const float = 1 + (secureRandomFloat() * 2 - 1) * rules.BATTLE_DAMAGE_FLOAT;

    // 体力惩罚
    const staPenalty = attacker.battleStamina <= 0 ? rules.BATTLE_STA_EMPTY_PENALTY : 1;

    // 头部伤势影响视野与攻击命中，转化为暴击/闪避惩罚
    const headPenalty = Math.max(0.25, attacker.visionMult) * Math.max(0.25, attacker.headTurnMult || 1);

    // 暴击
    let critMulti = 1;
    let isCrit = false;
    if (secureRandomFloat() < attacker.crit * headPenalty) {
        critMulti = rules.BATTLE_CRIT_MULTI;
        isCrit = true;
    }

    // 闪避
    const decoyBonus = defender.tailDecoyFrames > 0 ? rules.BATTLE_TAIL_DECOY_DODGE_BONUS : 0;
    if (secureRandomFloat() < (defender.dodge + decoyBonus) * Math.max(0.15, defender.moveControl)) {
        return { damage: 0, dodged: true, crit: false, part: targetPartKey };
    }

    const damage = Math.max(1, Math.floor(baseAtk * defReduction * float * rageMulti * staPenalty * critMulti));
    return { damage, dodged: false, crit: isCrit, part: targetPartKey };
}

function _applyPartDamage(defender, partKey, damage) {
    const part = defender.bodyParts[partKey] || defender.bodyParts.torso;
    const events = [];
    if (!part.detached) {
        part.hp -= damage;
        if (part.code === 'tail' && _partLossRatio(part) >= rules.BATTLE_INJURY_HEAVY) {
            part.detached = true;
            part.hp = 0;
            defender.tailDecoyFrames = rules.BATTLE_TAIL_DECOY_FRAMES;
            events.push({ type: 'tail_detach', src: defender.side });
        } else if (part.code !== 'tail' && part.hp <= 0) {
            part.hp = 0;
            if (part.code === 'foreLeft' || part.code === 'foreRight' || part.code === 'hindLeft' || part.code === 'hindRight') {
                part.detached = true;
                events.push({ type: 'limb_detach', src: defender.side, part: part.code });
            }
        }
    }
    _syncBodyHp(defender);
    _updateBodyImpairments(defender);
    return events;
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

function createBattle({ pet1, pet2, mapId }) {
    const map = rules.ARENA_MAPS.find(m => m.id === mapId) || rules.ARENA_MAPS[0];
    const unitA = _createUnit(pet1, 'left');
    const unitB = _createUnit(pet2, 'right');

    _applyMapBuff(unitA, map);
    _applyMapBuff(unitB, map);
    _updateBodyImpairments(unitA);
    _updateBodyImpairments(unitB);

    return {
        frame: 0,
        map,
        unitA,
        unitB,
        finished: false,
        winner: null,
        frames: [],
        stats: {
            left:  { totalDamage: 0, hits: 0, crits: 0, dodges: 0, skillsUsed: 0 },
            right: { totalDamage: 0, hits: 0, crits: 0, dodges: 0, skillsUsed: 0 },
        },
    };
}

function _calcRageMulti(frame) {
    if (frame < rules.BATTLE_RAGE_START_FRAME) return 1;
    const rageSec = (frame - rules.BATTLE_RAGE_START_FRAME) / rules.BATTLE_FPS;
    return 1 + rageSec * rules.BATTLE_RAGE_PER_SEC;
}

function _snapshotUnit(unit) {
    return {
        x: unit.x,
        y: unit.y,
        hp: unit.hp,
        maxHp: unit.maxHp,
        fear: unit.fear,
        st: unit.aiState,
        sta: unit.battleStamina,
        atk: unit.atk,
        def: unit.def,
        spd: unit.spd,
        effectiveSpd: unit.effectiveSpd,
        body: _snapshotBodyParts(unit),
        vision: unit.visionMult,
        headTurn: unit.headTurnMult,
        step: unit.stepMult,
        limbMove: unit.limbMoveMult,
        moveControl: unit.moveControl,
        canSkill: unit.canUseSkills,
        spin: unit.spinChance,
        decoy: unit.tailDecoyFrames > 0,
        tailDecoyFrames: unit.tailDecoyFrames,
        skills: unit.skills.map(s => ({ code: s.code, cooldownLeft: s.cooldownLeft })),
    };
}

function _snapshotFrame(session, events) {
    return {
        f: session.frame,
        a: _snapshotUnit(session.unitA),
        b: _snapshotUnit(session.unitB),
        ev: events || [],
    };
}

function _buildSummary(session) {
    const unitA = session.unitA;
    const unitB = session.unitB;
    return {
        winner: session.winner,
        map: session.map.id,
        totalFrames: session.frame,
        duration: Math.ceil(session.frame / rules.BATTLE_FPS),
        left: {
            petId: unitA.petId,
            name: unitA.name,
            hpRemaining: Math.max(0, unitA.hp),
            hpMax: unitA.maxHp,
            bodyParts: _snapshotBodyParts(unitA),
            impairments: {
                visionMult: unitA.visionMult,
                headTurnMult: unitA.headTurnMult,
                stepMult: unitA.stepMult,
                limbMoveMult: unitA.limbMoveMult,
                moveControl: unitA.moveControl,
                canUseSkills: unitA.canUseSkills,
            },
            ...session.stats.left,
        },
        right: {
            petId: unitB.petId,
            name: unitB.name,
            hpRemaining: Math.max(0, unitB.hp),
            hpMax: unitB.maxHp,
            bodyParts: _snapshotBodyParts(unitB),
            impairments: {
                visionMult: unitB.visionMult,
                headTurnMult: unitB.headTurnMult,
                stepMult: unitB.stepMult,
                limbMoveMult: unitB.limbMoveMult,
                moveControl: unitB.moveControl,
                canUseSkills: unitB.canUseSkills,
            },
            ...session.stats.right,
        },
    };
}

function _finishBattle(session, winner) {
    session.finished = true;
    session.winner = winner;
    return getBattleState(session);
}

function stepBattle(session, frameCount = 1, options = {}) {
    if (session.finished) return getBattleState(session);
    const recordFrames = options.recordFrames !== false;
    const maxFrames = rules.BATTLE_MAX_FRAMES;
    const steps = Math.max(1, Math.min(300, Math.floor(frameCount || 1)));
    let lastEvents = [];

    for (let i = 0; i < steps && !session.finished; i++) {
        const frame = session.frame;
        const unitA = session.unitA;
        const unitB = session.unitB;
        const rageMulti = _calcRageMulti(frame);

        if (frame % rules.BATTLE_FPS === 0) {
            unitA.fear = Math.max(0, unitA.fear - rules.BATTLE_FEAR_DECAY);
            unitB.fear = Math.max(0, unitB.fear - rules.BATTLE_FEAR_DECAY);
            _recoverBodyParts(unitA);
            _recoverBodyParts(unitB);
        }

        if (unitA.tailDecoyFrames > 0) unitA.tailDecoyFrames--;
        if (unitB.tailDecoyFrames > 0) unitB.tailDecoyFrames--;
        _updateBodyImpairments(unitA);
        _updateBodyImpairments(unitB);

        _tickBuffs(unitA);
        _tickBuffs(unitB);

        unitA.attackCooldown = Math.max(0, unitA.attackCooldown - 1);
        unitB.attackCooldown = Math.max(0, unitB.attackCooldown - 1);
        for (const sk of unitA.skills) sk.cooldownLeft = Math.max(0, sk.cooldownLeft - 1);
        for (const sk of unitB.skills) sk.cooldownLeft = Math.max(0, sk.cooldownLeft - 1);

        _updateAIState(unitA, unitB);
        _updateAIState(unitB, unitA);

        const decA = _aiDecide(unitA, unitB, frame);
        const decB = _aiDecide(unitB, unitA, frame);
        const eventsA = _executeAction(unitA, unitB, decA, rageMulti, session.stats.left);
        const eventsB = _executeAction(unitB, unitA, decB, rageMulti, session.stats.right);
        lastEvents = [...eventsA, ...eventsB];

        if (recordFrames && frame % 3 === 0) {
            session.frames.push(_snapshotFrame(session, lastEvents));
        }

        session.frame++;

        if (unitA.hp <= 0 && unitB.hp <= 0) return _finishBattle(session, 'draw');
        if (unitA.hp <= 0) return _finishBattle(session, 'right');
        if (unitB.hp <= 0) return _finishBattle(session, 'left');
        if (decA.action === 'flee') return _finishBattle(session, 'right');
        if (decB.action === 'flee') return _finishBattle(session, 'left');
        if (session.frame >= maxFrames) {
            const ratioA = unitA.hp / unitA.maxHp;
            const ratioB = unitB.hp / unitB.maxHp;
            return _finishBattle(session, ratioA > ratioB ? 'left' : ratioB > ratioA ? 'right' : 'draw');
        }
    }

    return getBattleState(session, lastEvents);
}

function getBattleState(session, events = []) {
    return {
        frame: session.frame,
        fps: rules.BATTLE_FPS,
        finished: session.finished,
        winner: session.winner,
        map: session.map.id,
        units: {
            left: _snapshotUnit(session.unitA),
            right: _snapshotUnit(session.unitB),
        },
        stats: session.stats,
        events,
        summary: session.finished ? _buildSummary(session) : null,
    };
}

/**
 * 执行完整战斗模拟
 * @param {{ pet1: object, pet2: object, mapId: string }} params
 * @returns {{ winner: string, frames: Array, summary: object }}
 */
function simulate({ pet1, pet2, mapId }) {
    const session = createBattle({ pet1, pet2, mapId });
    while (!session.finished) {
        stepBattle(session, 1, { recordFrames: true });
    }
    return {
        winner: session.winner,
        frames: _compressFrames(session.frames),
        summary: _buildSummary(session),
    };
}

/**
 * 增量压缩帧数据
 * 首帧(i=0)保持完整，后续帧只记录与前帧的差异字段
 * 前端解压时逐帧合并还原
 */
function _compressFrames(frames) {
    if (frames.length === 0) return frames;
    const result = [frames[0]]; // 首帧完整保留
    for (let i = 1; i < frames.length; i++) {
        const prev = frames[i - 1];
        const curr = frames[i];
        const delta = { f: curr.f };
        // 压缩 a 字段
        const da = {};
        for (const k of Object.keys(curr.a)) {
            if (curr.a[k] !== prev.a[k]) da[k] = curr.a[k];
        }
        if (Object.keys(da).length > 0) delta.a = da;
        // 压缩 b 字段
        const db = {};
        for (const k of Object.keys(curr.b)) {
            if (curr.b[k] !== prev.b[k]) db[k] = curr.b[k];
        }
        if (Object.keys(db).length > 0) delta.b = db;
        // 事件始终保留（非空时）
        if (curr.ev && curr.ev.length > 0) delta.ev = curr.ev;
        result.push(delta);
    }
    return result;
}

/* ═══════════════════════════════════════════
 * 行动执行
 * ═══════════════════════════════════════════ */

function _executeAction(unit, opponent, decision, rageMulti, statTracker) {
    const events = [];

    switch (decision.action) {
        case 'move': {
            if (secureRandomFloat() < unit.spinChance) {
                unit.x = Math.max(20, Math.min(780, unit.x + (secureRandomFloat() < 0.5 ? -1 : 1) * 3));
                events.push({ type: 'spin', src: unit.side });
                break;
            }
            const dir = decision.toward ? (opponent.x > unit.x ? 1 : -1) : (opponent.x > unit.x ? -1 : 1);
            const moveSpeed = Math.max(1, Math.floor(unit.effectiveSpd / 10));
            unit.x = Math.max(20, Math.min(780, unit.x + dir * moveSpeed));
            break;
        }

        case 'attack': {
            const dist = Math.abs(unit.x - opponent.x);
            if (dist > 100 * Math.max(0.1, unit.visionMult)) break;

            const targetPart = _pickTargetPart(opponent);
            const result = _calcDamage(unit, opponent, rageMulti, 1.0, targetPart);
            unit.attackCooldown = Math.max(10, 30 - Math.floor(unit.effectiveSpd / 5));
            unit.battleStamina -= rules.BATTLE_STA_PER_ATK;

            if (result.dodged) {
                statTracker.dodges++;
                events.push({ type: result.decoy ? 'tail_decoy' : 'dodge', src: unit.side, tgt: opponent.side, part: result.part });
            } else {
                events.push(..._applyPartDamage(opponent, targetPart, result.damage));
                opponent.fear += rules.BATTLE_FEAR_PER_HIT;
                statTracker.totalDamage += result.damage;
                statTracker.hits++;
                if (result.crit) statTracker.crits++;
                events.push({
                    type: result.crit ? 'crit' : 'hit',
                    src: unit.side,
                    tgt: opponent.side,
                    dmg: result.damage,
                    part: targetPart,
                });
            }
            break;
        }

        case 'skill': {
            if (!unit.canUseSkills) break;
            const sk = decision.skill;
            const effect = rules.BATTLE_SKILL_EFFECTS[sk.code];
            if (!effect) break;

            sk.cooldownLeft = effect.cooldown;
            statTracker.skillsUsed++;

            if (effect.type === 'heal') {
                const healAmt = Math.floor(unit.maxHp * effect.value);
                const parts = Object.values(unit.bodyParts).filter(part => !part.detached && part.hp < part.maxHp && part.code !== 'tail');
                const each = parts.length ? Math.max(1, Math.floor(healAmt / parts.length)) : 0;
                for (const part of parts) part.hp = Math.min(part.maxHp, part.hp + each);
                _syncBodyHp(unit);
                _updateBodyImpairments(unit);
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
                const maxRange = (effect.type === 'ranged' ? 300 : 100) * Math.max(0.1, unit.visionMult);
                if (dist > maxRange) break;

                const targetPart = _pickTargetPart(opponent);
                const result = _calcDamage(unit, opponent, rageMulti, effect.dmg_multi, targetPart);
                unit.battleStamina -= rules.BATTLE_STA_PER_ATK * 2;

                if (result.dodged) {
                    statTracker.dodges++;
                    events.push({ type: result.decoy ? 'tail_decoy' : 'dodge', src: unit.side, tgt: opponent.side, skill: sk.code, part: result.part });
                } else {
                    events.push(..._applyPartDamage(opponent, targetPart, result.damage));
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
                        part: targetPart,
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

module.exports = { simulate, createBattle, stepBattle, getBattleState };
