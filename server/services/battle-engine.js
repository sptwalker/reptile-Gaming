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
const animationMapper = require('./battle-animation-mapper');

function _clamp01(v, fallback = 0.5) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(1, n));
}

function _emptyAngleStats() {
    return { front: 0, side: 0, rear: 0, total: 0, flankScoreSum: 0, rearDamage: 0 };
}

function _trackAngleStats(statTracker, result) {
    if (!statTracker || !result) return;
    if (!statTracker.angle) statTracker.angle = _emptyAngleStats();
    const zone = result.attackZone || result.angleBonus && result.angleBonus.zone || 'front';
    if (zone === 'rear') statTracker.angle.rear++;
    else if (zone === 'side') statTracker.angle.side++;
    else statTracker.angle.front++;
    statTracker.angle.total++;
    statTracker.angle.flankScoreSum += Number(result.flankScore || result.angleBonus && result.angleBonus.flankScore || 0);
    if (zone === 'rear' && !result.dodged) statTracker.angle.rearDamage += Number(result.damage || 0);
}

function normalizePersonality(input) {
    const presets = rules.BATTLE_PERSONALITY_PRESETS || {};
    let base = presets.balanced || {};
    let code = 'balanced';
    if (typeof input === 'string' && presets[input]) {
        code = input;
        base = presets[input];
    } else if (input && typeof input === 'object') {
        code = presets[input.code] ? input.code : 'custom';
        base = presets[input.code] || presets.balanced || {};
    }
    const merged = input && typeof input === 'object' ? { ...base, ...input } : base;
    return {
        code,
        name: merged.name || (presets[code] && presets[code].name) || '均衡适应',
        aggression: _clamp01(merged.aggression),
        risk: _clamp01(merged.risk),
        caution: _clamp01(merged.caution),
        mobility: _clamp01(merged.mobility),
        cunning: _clamp01(merged.cunning),
        ferocity: _clamp01(merged.ferocity),
        skill: _clamp01(merged.skill),
        hearing: _clamp01(merged.hearing),
    };
}

function _skillIntent(effect) {
    if (!effect) return 'attack';
    if (effect.type === 'heal') return 'heal';
    if (effect.type === 'buff') {
        if (effect.effect === 'dodge_up' || effect.sound) return 'trick';
        if (effect.effect === 'crit_up') return 'focus';
        return 'guard';
    }
    if (effect.type === 'fear_skill') return 'fear';
    if (effect.type === 'ranged') return 'ranged';
    return 'melee';
}

function _skillScore(unit, opponent, effect, dist, hpRatio) {
    const p = unit.personality;
    const effectiveDist = dist / Math.max(0.1, unit.visionMult);
    let score = 0;
    const intent = _skillIntent(effect);
    if (intent === 'heal') score = hpRatio < 0.72 - p.risk * 0.28 ? 65 + p.caution * 35 : 0;
    else if (intent === 'guard') score = hpRatio > 0.2 ? 38 + p.caution * 42 : 15;
    else if (intent === 'trick') score = 34 + p.cunning * 55 + p.caution * 12;
    else if (intent === 'focus') score = 32 + p.skill * 45 + p.aggression * 16;
    else if (intent === 'fear') score = opponent.fear > 30 + p.ferocity * 28 ? 42 + p.ferocity * 45 : 8;
    else if (intent === 'ranged') score = effectiveDist <= 300 ? 38 + p.skill * 26 + p.cunning * 20 : 0;
    else score = effectiveDist <= 100 ? 42 + p.aggression * 32 + p.ferocity * 18 : 0;
    return score + p.skill * 25 + secureRandomFloat() * 6;
}

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

function normalizeAngle(a) {
    const tau = Math.PI * 2;
    let n = Number(a) % tau;
    if (!Number.isFinite(n)) n = 0;
    if (n < 0) n += tau;
    return n;
}

function _shortestAngleDiff(from, to) {
    let diff = normalizeAngle(to) - normalizeAngle(from);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
}

function _angleTo(from, to) {
    return normalizeAngle(Math.atan2(to.y - from.y, to.x - from.x));
}

function getForwardCone(unit, angle = rules.BATTLE_VISION_CONE_ANGLE) {
    const half = angle / 2;
    return { center: normalizeAngle(unit.facing), left: normalizeAngle(unit.facing - half), right: normalizeAngle(unit.facing + half), half };
}

function getRearArc(unit, angle = rules.BATTLE_REAR_ARC_ANGLE) {
    const center = normalizeAngle(unit.facing + Math.PI);
    const half = angle / 2;
    return { center, left: normalizeAngle(center - half), right: normalizeAngle(center + half), half };
}

function isAngleInArc(angle, arc) {
    return Math.abs(_shortestAngleDiff(arc.center, angle)) <= arc.half;
}

function isInFrontArc(attacker, defender) {
    return isAngleInArc(_angleTo(defender, attacker), getForwardCone(defender));
}

function isInRearArc(attacker, defender) {
    return isAngleInArc(_angleTo(defender, attacker), getRearArc(defender));
}

function flankScore(attacker, defender) {
    const rearCenter = normalizeAngle(defender.facing + Math.PI);
    const angle = _angleTo(defender, attacker);
    const diff = Math.abs(_shortestAngleDiff(rearCenter, angle));
    return Math.max(0, Math.min(1, 1 - diff / Math.PI));
}

function angleAttackBonus(attacker, defender, partKey) {
    const score = flankScore(attacker, defender);
    let zone = 'front';
    let dmgBonus = 1;
    let hitBonus = 0;
    if (score >= 2 / 3 || isInRearArc(attacker, defender)) {
        zone = 'rear';
        dmgBonus += rules.BATTLE_FLANK_DMG_BONUS;
        hitBonus = rules.BATTLE_FLANK_HIT_BONUS;
    } else if (score >= 1 / 3 || !isInFrontArc(attacker, defender)) {
        zone = 'side';
        dmgBonus += rules.BATTLE_SIDE_DMG_BONUS;
        hitBonus = rules.BATTLE_SIDE_HIT_BONUS;
    }
    return {
        zone,
        flankScore: Number(score.toFixed(3)),
        dmgBonus,
        hitBonus,
        angle: Number(_angleTo(defender, attacker).toFixed(3)),
        part: partKey,
    };
}

function weakPointExposure(unit, attacker) {
    let weakKey = 'torso';
    let weakRatio = 1;
    for (const [key, part] of Object.entries(unit.bodyParts)) {
        if (part.detached || part.hp <= 0) continue;
        const ratio = Math.max(0, part.hp) / Math.max(1, part.maxHp);
        if (ratio < weakRatio) {
            weakRatio = ratio;
            weakKey = key;
        }
    }
    const exposure = flankScore(attacker, unit);
    return { part: weakKey, exposure: Number(exposure.toFixed(3)), hpRatio: Number(weakRatio.toFixed(3)) };
}

function _pickTargetPart(defender, attacker) {
    const flank = attacker ? flankScore(attacker, defender) : 0;
    const candidates = Object.entries(rules.BATTLE_BODY_PARTS)
        .map(([key, cfg]) => {
            const part = defender.bodyParts[key];
            if (!part || part.detached || part.hp <= 0) return null;
            let weight = cfg.weight;
            if (flank > 0.7 && (key === 'head' || key === 'torso')) weight *= 1.5;
            if (flank < 0.3 && (key === 'foreLeft' || key === 'foreRight')) weight *= 1.3;
            if (flank >= 0.35 && flank <= 0.75 && (key === 'foreLeft' || key === 'foreRight' || key === 'hindLeft' || key === 'hindRight')) weight *= 1.18;
            const hpRatio = Math.max(0, part.hp) / Math.max(1, part.maxHp);
            const vulnerabilityBonus = Math.min(0.9, Math.max(0, 1 - hpRatio) * 0.85);
            const lowDefBonus = Math.max(0, 1 - part.def / Math.max(1, defender.def + part.def));
            weight *= 1 + vulnerabilityBonus + lowDefBonus * 0.35;
            return [key, Math.max(0.001, weight)];
        })
        .filter(Boolean);
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

function _createUnit(fighter, side, map) {
    const stats = _calcCombatStats(fighter);
    const personality = normalizePersonality(fighter.personality);
    const hearingMult = 1 + (personality.hearing - 0.5) * 0.28;
    const skillList = (fighter.skills || []).map(s => ({
        code: s.skill_code,
        level: s.skill_level || 1,
        cooldownLeft: 0,
    }));

    const spawn = _spawnPoint(map, side);
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
        soundVolumeMult: 1,
        baseSoundVolumeMult: 1,
        hearingMult,
        baseHearingMult: hearingMult,
        personality,
        personalityTrace: { aggressive: 0, kiting: 0, defensive: 0, fear: 0, alert: 0, searching: 0 },
        bodyNoiseSize: Math.max(1, (Number(fighter.attr.str_base || 0) + Number(fighter.attr.vit_base || 0)) / 2 + Number(fighter.stage || 0) * 4),
        perception: {
            hearingRange: 0,
            awareness: 0,
            lastHeardFrame: -Infinity,
            lastHeardSource: null,
            lastKnownTargetX: null,
            lastKnownTargetY: null,
            detectedBySound: false,
            soundConfidence: 0,
            misledByFakeSound: false,
        },

        // 原始六维
        attr: fighter.attr,
        fear: 0,
        fleePressure: 0,
        stuckFrames: 0,
        lastMoveX: spawn.x,
        lastMoveY: spawn.y,
        aiState: 'aggressive',
        skills: skillList,
        buffs: [],

        // 二维地图坐标
        x: spawn.x,
        y: spawn.y,
        facing: side === 'left' ? 0 : Math.PI,
        angularVelocity: 0,
        aiSubState: null,
        flankTarget: null,
        protectTarget: null,
        weakExposure: null,

        // 攻击冷却（基于速度）
        attackCooldown: 0,
        moveTarget: null,
    };
}

/* ═══════════════════════════════════════════
 * AI 状态机
 * ═══════════════════════════════════════════ */

function _updateAIState(unit, opponent, frame) {
    const hpRatio = unit.hp / unit.maxHp;
    const p = unit.personality;
    const fearRatio = unit.fear / rules.BATTLE_FEAR_ESCAPE;
    const recentlyHeard = frame - unit.perception.lastHeardFrame <= rules.BATTLE_SOUND_MEMORY_FRAMES * (0.75 + p.hearing * 0.5);
    const fearLimit = 0.48 + p.risk * 0.26 + p.ferocity * 0.12 - p.caution * 0.1;
    const defensiveHp = Math.max(0.12, Math.min(0.62, rules.AI_HP_DEFENSIVE_THRESHOLD + p.caution * 0.2 - p.risk * 0.16));
    const kiteFear = Math.max(22, rules.AI_FEAR_KITING_THRESHOLD + p.aggression * 18 - p.caution * 16 - p.mobility * 8);

    if (fearRatio >= fearLimit) {
        unit.aiState = 'fear';
    } else if (hpRatio < defensiveHp && p.caution >= 0.35) {
        unit.aiState = p.mobility > 0.62 ? 'kiting' : 'defensive';
    } else if (unit.fear > kiteFear && p.aggression < 0.86) {
        unit.aiState = 'kiting';
    } else if (recentlyHeard && unit.perception.awareness >= 6 + p.caution * 6 - p.hearing * 3) {
        unit.aiState = unit.perception.misledByFakeSound ? 'searching' : 'alert';
    } else {
        unit.aiState = 'aggressive';
    }
    if (unit.personalityTrace[unit.aiState] != null) unit.personalityTrace[unit.aiState]++;
}

function _battleDist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function _arenaBounds(map) {
    const width = Math.max(200, Number(map && map.width) || 800);
    const height = Math.max(200, Number(map && map.height) || 600);
    const margin = Math.max(16, Number(map && map.margin) || 20);
    return {
        width,
        height,
        minX: margin,
        maxX: width - margin,
        minY: margin,
        maxY: height - margin,
    };
}

function _clampPoint(map, point) {
    const b = _arenaBounds(map);
    return {
        x: Math.max(b.minX, Math.min(b.maxX, Number(point.x) || 0)),
        y: Math.max(b.minY, Math.min(b.maxY, Number(point.y) || 0)),
    };
}

function _unstuckPoint(unit, opponent, map) {
    const b = _arenaBounds(map);
    const center = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    const dx = unit.x - opponent.x;
    const dy = unit.y - opponent.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    let vx = dx / len;
    let vy = dy / len;
    const nearX = unit.x <= b.minX + 2 || unit.x >= b.maxX - 2;
    const nearY = unit.y <= b.minY + 2 || unit.y >= b.maxY - 2;
    if (nearX || nearY) {
        vx = center.x - unit.x;
        vy = center.y - unit.y;
        const centerLen = Math.sqrt(vx * vx + vy * vy) || 1;
        vx /= centerLen;
        vy /= centerLen;
    }
    const side = unit.side === 'left' ? 1 : -1;
    const sideX = -vy * side;
    const sideY = vx * side;
    const step = 80 + (unit.personality && unit.personality.mobility || 0.5) * 90;
    return _clampPoint(map, {
        x: unit.x + vx * step + sideX * step * 0.45,
        y: unit.y + vy * step + sideY * step * 0.45,
    });
}


function _spawnPoint(map, side) {
    const b = _arenaBounds(map);
    const usableW = b.maxX - b.minX;
    const usableH = b.maxY - b.minY;
    return {
        x: side === 'left' ? b.minX + usableW * 0.12 : b.maxX - usableW * 0.12,
        y: b.minY + usableH * 0.5,
    };
}

function _calcFlankPosition(unit, opponent, map, meleeRange) {
    const rearDir = normalizeAngle(opponent.facing + Math.PI);
    const dist = Math.max(72, meleeRange * rules.BATTLE_FLANK_TARGET_DIST_MULT);
    const sideBias = unit.side === 'left' ? -0.35 : 0.35;
    const dir = normalizeAngle(rearDir + sideBias * (0.7 + unit.personality.cunning * 0.35));
    return _clampPoint(map, {
        x: opponent.x + Math.cos(dir) * dist,
        y: opponent.y + Math.sin(dir) * dist,
    });
}

function _calcProtectPosition(unit, opponent, map) {
    const frontDir = normalizeAngle(opponent.facing);
    const sideDir = normalizeAngle(frontDir + (unit.side === 'left' ? -1 : 1) * Math.PI / 2);
    const dist = 120 + unit.personality.caution * 80 + unit.personality.mobility * 45;
    return _clampPoint(map, {
        x: unit.x + Math.cos(sideDir) * dist - Math.cos(frontDir) * dist * 0.35,
        y: unit.y + Math.sin(sideDir) * dist - Math.sin(frontDir) * dist * 0.35,
    });
}

function _calcKitePosition(unit, opponent, map) {
    const rearDir = normalizeAngle(opponent.facing + Math.PI);
    const sideDir = normalizeAngle(rearDir + (unit.side === 'left' ? -1 : 1) * Math.PI / 3);
    const retreatStep = 120 + unit.personality.caution * 70 + unit.personality.mobility * 65;
    return _clampPoint(map, {
        x: unit.x + Math.cos(sideDir) * retreatStep,
        y: unit.y + Math.sin(sideDir) * retreatStep,
    });
}

function _updateFacing(unit, opponent) {
    if (!unit || !opponent || unit.headCanMove === false) return;
    const targetFacing = Math.atan2(opponent.y - unit.y, opponent.x - unit.x);
    const turnSpeed = Math.max(0.005, (rules.BATTLE_TURN_SPEED_BASE + unit.personality.mobility * rules.BATTLE_TURN_SPEED_MOBILITY_BONUS) * Math.max(0.1, unit.headTurnMult || 1));
    const diff = _shortestAngleDiff(unit.facing, targetFacing);
    const delta = Math.abs(diff) > turnSpeed ? Math.sign(diff) * turnSpeed : diff;
    unit.angularVelocity = Number(delta.toFixed(4));
    unit.facing = normalizeAngle(unit.facing + delta);
}

function _knownTargetDecision(unit, toward) {
    if (unit.perception.lastKnownTargetX == null || unit.perception.lastKnownTargetY == null) return null;
    return {
        action: 'move',
        toward,
        targetX: unit.perception.lastKnownTargetX,
        targetY: unit.perception.lastKnownTargetY,
    };
}

function _targetPointFor(unit, opponent, decision, map) {
    if (decision.targetX != null || decision.targetY != null) {
        return _clampPoint(map, {
            x: decision.targetX != null ? decision.targetX : opponent.x,
            y: decision.targetY != null ? decision.targetY : opponent.y,
        });
    }

    const p = unit.personality || {};
    const dx = opponent.x - unit.x;
    const dy = opponent.y - unit.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    const lx = -ny;
    const ly = nx;
    const spread = 52 + (p.mobility || 0.5) * 72 + (p.cunning || 0.5) * 48;
    const wave = Math.sin((unit.battleStamina + unit.fear + opponent.x + opponent.y) * 0.017 + (unit.side === 'left' ? 0 : Math.PI)) * spread;

    if (decision.toward === false) {
        const retreat = 120 + (p.caution || 0.5) * 70 + (p.mobility || 0.5) * 55;
        const target = _clampPoint(map, {
            x: unit.x - nx * retreat + lx * wave * 0.45,
            y: unit.y - ny * retreat + ly * wave * 0.45,
        });
        if (_battleDist(unit, target) < 8) return _unstuckPoint(unit, opponent, map);
        return target;
    }

    const closeOffset = 34 + (p.caution || 0.5) * 18;
    return _clampPoint(map, {
        x: opponent.x - nx * closeOffset + lx * wave * 0.18,
        y: opponent.y - ny * closeOffset + ly * wave * 0.18,
    });
}

function _directionFromVector(dx, dy) {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax < 1 && ay < 1) return 'center';
    if (ax > ay * 1.8) return dx > 0 ? 'east' : 'west';
    if (ay > ax * 1.8) return dy > 0 ? 'south' : 'north';
    if (dx >= 0 && dy >= 0) return 'southeast';
    if (dx >= 0 && dy < 0) return 'northeast';
    if (dx < 0 && dy >= 0) return 'southwest';
    return 'northwest';
}

function _shouldPanicMove(unit) {
    const p = unit.personality;
    const hpRatio = unit.hp / Math.max(1, unit.maxHp);
    const escapeFear = rules.BATTLE_FEAR_ESCAPE * (0.82 + p.risk * 0.32 + p.ferocity * 0.12);
    if (unit.fear < escapeFear) {
        unit.fleePressure = 0;
        return false;
    }
    unit.fleePressure = (unit.fleePressure || 0) + 1;
    const criticalFear = unit.fear >= rules.BATTLE_FEAR_ESCAPE * 1.45;
    const wounded = hpRatio <= 0.35 + p.caution * 0.15 - p.risk * 0.08;
    const sustainedPanic = unit.fleePressure >= rules.BATTLE_FPS * 3 && hpRatio <= 0.68;
    return criticalFear || wounded || sustainedPanic;
}

function _aiDecide(unit, opponent, frame, map) {
    if (_shouldPanicMove(unit)) {
        unit.aiSubState = null;
        unit.flankTarget = null;
        unit.protectTarget = null;
        return { action: 'move', toward: false, panic: true };
    }

    const p = unit.personality;
    const dist = _battleDist(unit, opponent);
    const meleeRange = 68 + p.aggression * 34 + p.risk * 18;
    const kiteRange = 115 + p.caution * 80 + p.mobility * 45;
    const exposure = weakPointExposure(unit, opponent);
    unit.weakExposure = exposure;

    if ((unit.aiState === 'aggressive' || unit.aiState === 'kiting') && exposure.exposure > 0.7 && p.caution > 0.4 && unit.hp / Math.max(1, unit.maxHp) < 0.85) {
        unit.aiSubState = 'protecting';
        unit.protectTarget = _calcProtectPosition(unit, opponent, map);
        unit.flankTarget = null;
    } else if (unit.aiSubState === 'protecting' && exposure.exposure < 0.45) {
        unit.aiSubState = null;
        unit.protectTarget = null;
    }

    if (unit.aiSubState === 'protecting' && unit.protectTarget) {
        return { action: 'move', toward: false, targetX: unit.protectTarget.x, targetY: unit.protectTarget.y };
    }

    const score = flankScore(unit, opponent);
    if ((unit.aiState === 'aggressive' || unit.aiState === 'kiting') && dist <= rules.BATTLE_FLANK_MAX_DIST && p.cunning > 0.55 && p.mobility > 0.5 && score < 0.6) {
        if (unit.aiSubState !== 'flanking') {
            unit.flankTarget = _calcFlankPosition(unit, opponent, map, meleeRange);
        }
        unit.aiSubState = 'flanking';
    }

    if (unit.aiSubState === 'flanking') {
        if (!unit.flankTarget) unit.flankTarget = _calcFlankPosition(unit, opponent, map, meleeRange);
        const targetDist = _battleDist(unit, unit.flankTarget);
        if (targetDist <= 24 || score >= 0.72) {
            unit.aiSubState = 'flank_attack';
        } else {
            return { action: 'move', toward: true, targetX: unit.flankTarget.x, targetY: unit.flankTarget.y };
        }
    }

    const readySkill = _pickSkill(unit, opponent, dist);
    if (readySkill && unit.aiSubState !== 'flanking') return { action: 'skill', skill: readySkill };

    switch (unit.aiState) {
        case 'aggressive':
            if (unit.aiSubState === 'flank_attack' && unit.attackCooldown <= 0 && dist <= meleeRange + 35) return { action: 'attack' };
            if (isInFrontArc(unit, opponent) && dist > meleeRange * 0.8 && p.cunning > 0.4 && p.mobility > 0.4) {
                const flankTarget = _calcFlankPosition(unit, opponent, map, meleeRange);
                unit.flankTarget = flankTarget;
                unit.aiSubState = 'flanking';
                return { action: 'move', toward: true, targetX: flankTarget.x, targetY: flankTarget.y };
            }
            if (dist > meleeRange) return { action: 'move', toward: true };
            if (unit.attackCooldown <= 0) return { action: 'attack' };
            if (p.ferocity > 0.82 && dist < 140) return { action: 'move', toward: true };
            return { action: 'idle' };

        case 'kiting': {
            if (dist < kiteRange) {
                const kite = _calcKitePosition(unit, opponent, map);
                return { action: 'move', toward: false, targetX: kite.x, targetY: kite.y };
            }
            if (unit.attackCooldown <= 0 && dist < kiteRange + 55) return { action: 'attack' };
            const known = _knownTargetDecision(unit, true);
            return p.cunning > 0.68 && known ? known : { action: 'idle' };
        }

        case 'defensive':
            unit.aiSubState = null;
            if (dist < 95 + p.caution * 45) return { action: 'move', toward: false };
            if (dist > 105 + p.aggression * 35) return { action: 'move', toward: true };
            if (unit.attackCooldown <= 0 && p.risk > 0.28) return { action: 'attack' };
            return { action: 'idle' };

        case 'alert': {
            unit.aiSubState = null;
            if (dist <= 95 + p.aggression * 35 && unit.attackCooldown <= 0) return { action: 'attack' };
            return _knownTargetDecision(unit, true) || { action: 'move', toward: true };
        }

        case 'searching': {
            unit.aiSubState = null;
            const known = _knownTargetDecision(unit, p.cunning < 0.25);
            if (!known) return { action: 'idle' };
            if (p.cunning >= 0.25) {
                const target = _targetPointFor(unit, { x: known.targetX, y: known.targetY }, { toward: false }, map);
                return { action: 'move', toward: false, targetX: target.x, targetY: target.y };
            }
            return known;
        }

        case 'fear':
            unit.aiSubState = null;
            return { action: 'move', toward: false };

        default:
            return { action: 'idle' };
    }
}

/** 选择可用技能 */
function _pickSkill(unit, opponent, dist) {
    if (!unit.canUseSkills) return null;
    let best = null;
    let bestScore = 0;
    const hpRatio = unit.hp / unit.maxHp;
    for (const sk of unit.skills) {
        if (sk.cooldownLeft > 0) continue;
        const effect = rules.BATTLE_SKILL_EFFECTS[sk.code];
        if (!effect) continue;
        const score = _skillScore(unit, opponent, effect, dist, hpRatio);
        if (score > bestScore) {
            bestScore = score;
            best = sk;
        }
    }
    return bestScore >= 55 ? best : null;
}

/* ═══════════════════════════════════════════
 * 伤害计算
 * ═══════════════════════════════════════════ */

function _calcDamage(attacker, defender, rageMulti, skillMulti, targetPartKey) {
    const angleBonus = angleAttackBonus(attacker, defender, targetPartKey);
    if (defender.tailDecoyFrames > 0 && secureRandomFloat() < rules.BATTLE_TAIL_DECOY_HIT_CHANCE) {
        return { damage: 0, dodged: true, crit: false, part: 'tail_decoy', decoy: true, angleBonus, attackZone: angleBonus.zone, flankScore: angleBonus.flankScore, flankAngle: angleBonus.angle };
    }

    const part = defender.bodyParts[targetPartKey] || defender.bodyParts.torso;
    const baseAtk = attacker.atk * skillMulti * angleBonus.dmgBonus;

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
    if (secureRandomFloat() < attacker.crit * headPenalty * (1 + angleBonus.hitBonus)) {
        critMulti = rules.BATTLE_CRIT_MULTI;
        isCrit = true;
    }

    // 闪避
    const decoyBonus = defender.tailDecoyFrames > 0 ? rules.BATTLE_TAIL_DECOY_DODGE_BONUS : 0;
    const dodgeChance = (defender.dodge + decoyBonus) * Math.max(0.15, defender.moveControl) / (1 + angleBonus.hitBonus);
    if (secureRandomFloat() < dodgeChance) {
        return { damage: 0, dodged: true, crit: false, part: targetPartKey, angleBonus, attackZone: angleBonus.zone, flankScore: angleBonus.flankScore, flankAngle: angleBonus.angle };
    }

    const damage = Math.max(1, Math.floor(baseAtk * defReduction * float * rageMulti * staPenalty * critMulti));
    return { damage, dodged: false, crit: isCrit, part: targetPartKey, angleBonus, attackZone: angleBonus.zone, flankScore: angleBonus.flankScore, flankAngle: angleBonus.angle };
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

function _soundSurface(map) {
    return (map && (map.soundSurface || map.terrain)) || 'grass';
}

function _terrainSoundMultiplier(map) {
    return rules.BATTLE_TERRAIN_SOUND_MULTIPLIER[_soundSurface(map)] || 1;
}

function _refreshPerception(unit) {
    const per = Number(unit.attr.per_base || 0);
    const headPenalty = Math.max(0.1, unit.visionMult || 1) * Math.max(0.1, unit.headTurnMult || 1);
    unit.perception.hearingRange = Math.max(30, (rules.BATTLE_HEARING_BASE_RANGE + per * rules.BATTLE_HEARING_PER_RANGE) * headPenalty * unit.hearingMult);
}

function _decayPerception(unit) {
    unit.perception.awareness = Math.max(0, unit.perception.awareness - rules.BATTLE_AWARENESS_DECAY);
    unit.perception.detectedBySound = false;
    unit.perception.misledByFakeSound = false;
}

function _isFastMove(moveSpeed) {
    return moveSpeed >= rules.BATTLE_FAST_MOVE_SPEED;
}

function _buildSoundEvent(unit, frame, map, moveSpeed, options = {}) {
    const surfaceMult = _terrainSoundMultiplier(map);
    const speedMult = Math.max(0.5, moveSpeed / Math.max(1, rules.BATTLE_FAST_MOVE_SPEED));
    const agilityDamp = Math.max(0.45, 1 - Number(unit.attr.agi_base || 0) * 0.006);
    const sizeMult = Math.max(0.65, 0.85 + unit.bodyNoiseSize / 60);
    const fakeVolume = Number(options.fakeVolume || 0);
    const volume = Math.max(1, fakeVolume || rules.BATTLE_FOOTSTEP_BASE_VOLUME * speedMult * sizeMult * agilityDamp * surfaceMult * unit.soundVolumeMult);
    const radius = Math.max(20, rules.BATTLE_SOUND_BASE_RADIUS * Math.sqrt(volume / rules.BATTLE_FOOTSTEP_BASE_VOLUME) * surfaceMult);
    return {
        type: 'sound',
        soundType: options.soundType || 'footstep',
        src: unit.side,
        frame,
        x: Math.round(options.x != null ? options.x : unit.x),
        y: Math.round(options.y != null ? options.y : unit.y),
        volume: Number(volume.toFixed(2)),
        radius: Math.round(radius),
        surface: _soundSurface(map),
        fake: !!options.fake,
        realSource: options.realSource || unit.side,
    };
}

function _applySoundPerception(listener, sound, frame, map) {
    if (listener.side === sound.src && !sound.fake) return null;
    _refreshPerception(listener);
    const dx = sound.x - listener.x;
    const dy = sound.y - listener.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > Math.min(listener.perception.hearingRange, sound.radius)) return null;

    const rangeRatio = Math.max(0, 1 - dist / Math.max(1, sound.radius));
    const heardVolume = sound.volume * rangeRatio;
    if (heardVolume < rules.BATTLE_HEARING_MIN_VOLUME) return null;

    const confidence = Math.max(0.05, Math.min(1, heardVolume / Math.max(rules.BATTLE_HEARING_MIN_VOLUME, sound.volume)));
    const error = Math.round((1 - confidence) * 80);
    const angle = Math.atan2(dy, dx);
    const estimated = _clampPoint(map, {
        x: sound.x + (secureRandomFloat() * 2 - 1) * error,
        y: sound.y + (secureRandomFloat() * 2 - 1) * error,
    });
    listener.perception.awareness = Math.min(100, listener.perception.awareness + (sound.fake ? rules.BATTLE_AWARENESS_FAKE : rules.BATTLE_AWARENESS_HEARD) * confidence);
    listener.perception.lastHeardFrame = frame;
    listener.perception.lastHeardSource = sound.src;
    listener.perception.lastKnownTargetX = estimated.x;
    listener.perception.lastKnownTargetY = estimated.y;
    listener.perception.detectedBySound = true;
    listener.perception.soundConfidence = Number(confidence.toFixed(2));
    listener.perception.misledByFakeSound = !!sound.fake;

    return {
        type: 'perception',
        subtype: sound.fake ? 'heard_fake_sound' : 'heard_target',
        src: listener.side,
        tgt: sound.realSource || sound.src,
        soundType: sound.soundType,
        frame,
        direction: _directionFromVector(dx, dy),
        angle: Number(angle.toFixed(3)),
        vector: {
            x: Number((dx / Math.max(1, dist)).toFixed(3)),
            y: Number((dy / Math.max(1, dist)).toFixed(3)),
        },
        confidence: listener.perception.soundConfidence,
        distance: Math.round(dist),
        heardVolume: Number(heardVolume.toFixed(2)),
        lastKnownX: Math.round(listener.perception.lastKnownTargetX),
        lastKnownY: Math.round(listener.perception.lastKnownTargetY),
        fake: !!sound.fake,
    };
}

function _emitSoundAndPerception(unit, opponent, frame, map, moveSpeed, options = {}) {
    const events = [];
    const sound = _buildSoundEvent(unit, frame, map, moveSpeed, options);
    events.push(sound);
    const heard = _applySoundPerception(opponent, sound, frame, map);
    if (heard) events.push(heard);
    return events;
}

/* ═══════════════════════════════════════════
 * Buff 系统
 * ═══════════════════════════════════════════ */

function _applyBuff(unit, effect, skillCode) {
    if (!effect.effect && !effect.sound) return;
    unit.buffs.push({
        code: skillCode,
        effect: effect.effect,
        value: effect.value,
        sound: effect.sound,
        remaining: effect.duration || rules.BATTLE_SOUND_MEMORY_FRAMES,
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
    unit.soundVolumeMult = unit.baseSoundVolumeMult;
    unit.hearingMult = unit.baseHearingMult;

    for (const b of unit.buffs) {
        switch (b.effect) {
            case 'def_up':   unit.def   = Math.floor(unit.baseDef * (1 + b.value)); break;
            case 'dodge_up': unit.dodge = unit.baseDodge + b.value; break;
            case 'crit_up':  unit.crit  = unit.baseCrit + b.value; break;
            case 'atk_up':   unit.atk   = Math.floor(unit.baseAtk * (1 + b.value)); break;
        }
        if (b.sound) {
            if (b.sound.selfVolumeMult) unit.soundVolumeMult *= b.sound.selfVolumeMult;
            if (b.sound.hearingMult) unit.hearingMult *= b.sound.hearingMult;
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

function createBattle({ pet1, pet2, mapId, leftPersonality, rightPersonality }) {
    const map = rules.ARENA_MAPS.find(m => m.id === mapId) || rules.ARENA_MAPS[0];
    const unitA = _createUnit({ ...pet1, personality: leftPersonality || pet1.personality }, 'left', map);
    const unitB = _createUnit({ ...pet2, personality: rightPersonality || pet2.personality }, 'right', map);

    _applyMapBuff(unitA, map);
    _applyMapBuff(unitB, map);
    _updateBodyImpairments(unitA);
    _updateBodyImpairments(unitB);
    _refreshPerception(unitA);
    _refreshPerception(unitB);

    return {
        frame: 0,
        map,
        unitA,
        unitB,
        finished: false,
        winner: null,
        finishReason: null,
        frames: [],
        stats: {
            left:  { totalDamage: 0, hits: 0, crits: 0, dodges: 0, skillsUsed: 0, angle: _emptyAngleStats() },
            right: { totalDamage: 0, hits: 0, crits: 0, dodges: 0, skillsUsed: 0, angle: _emptyAngleStats() },
        },
    };
}

function _calcRageMulti(frame) {
    if (frame < rules.BATTLE_RAGE_START_FRAME) return 1;
    const rageSec = (frame - rules.BATTLE_RAGE_START_FRAME) / rules.BATTLE_FPS;
    return 1 + rageSec * rules.BATTLE_RAGE_PER_SEC;
}

function _snapshotMap(map) {
    return {
        id: map.id,
        name: map.name,
        width: map.width,
        height: map.height,
        margin: map.margin || 20,
        terrain: map.terrain,
        soundSurface: map.soundSurface,
    };
}

function _snapshotUnit(unit) {
    return {
        x: unit.x,
        y: unit.y,
        facing: Number(normalizeAngle(unit.facing).toFixed(3)),
        angularVelocity: unit.angularVelocity,
        aiSubState: unit.aiSubState,
        flankTarget: unit.flankTarget ? { x: Math.round(unit.flankTarget.x), y: Math.round(unit.flankTarget.y) } : null,
        protectTarget: unit.protectTarget ? { x: Math.round(unit.protectTarget.x), y: Math.round(unit.protectTarget.y) } : null,
        weakExposure: unit.weakExposure,
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
        personality: unit.personality,
        personalityTrace: { ...unit.personalityTrace },
        perception: {
            hearingRange: Math.round(unit.perception.hearingRange),
            awareness: Number(unit.perception.awareness.toFixed(1)),
            detectedBySound: unit.perception.detectedBySound,
            soundConfidence: unit.perception.soundConfidence,
            lastKnownTargetX: unit.perception.lastKnownTargetX == null ? null : Math.round(unit.perception.lastKnownTargetX),
            lastKnownTargetY: unit.perception.lastKnownTargetY == null ? null : Math.round(unit.perception.lastKnownTargetY),
            lastHeardSource: unit.perception.lastHeardSource,
            misledByFakeSound: unit.perception.misledByFakeSound,
        },
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

function _resolveLegalFinish(session) {
    const unitA = session.unitA;
    const unitB = session.unitB;
    if (unitA.hp <= 0 && unitB.hp <= 0) return { winner: 'draw', reason: 'both_dead' };
    if (unitA.hp <= 0) return { winner: 'right', reason: 'left_dead' };
    if (unitB.hp <= 0) return { winner: 'left', reason: 'right_dead' };
    if (session.frame >= rules.BATTLE_MAX_FRAMES) {
        const ratioA = unitA.hp / unitA.maxHp;
        const ratioB = unitB.hp / unitB.maxHp;
        return { winner: ratioA > ratioB ? 'left' : ratioB > ratioA ? 'right' : 'draw', reason: 'time_limit' };
    }
    return null;
}

function _inferFinishReason(session) {
    const legal = _resolveLegalFinish(session);
    if (legal) return legal.reason;
    return 'unknown';
}

function _buildSummary(session) {
    const unitA = session.unitA;
    const unitB = session.unitB;
    return {
        reason: session.finishReason || _inferFinishReason(session),
        winner: session.winner,
        map: session.map.id,
        mapConfig: _snapshotMap(session.map),
        totalFrames: session.frame,
        duration: Math.ceil(session.frame / rules.BATTLE_FPS),
        left: {
            petId: unitA.petId,
            name: unitA.name,
            hpRemaining: Math.max(0, unitA.hp),
            personality: unitA.personality,
            personalityTrace: { ...unitA.personalityTrace },
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
            personality: unitB.personality,
            personalityTrace: { ...unitB.personalityTrace },
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

function _finishBattle(session, winner, reason) {
    session.finished = true;
    session.winner = winner;
    session.finishReason = reason || 'unknown';
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
            _refreshPerception(unitA);
            _refreshPerception(unitB);
            _decayPerception(unitA);
            _decayPerception(unitB);
            _recoverBodyParts(unitA);
            _recoverBodyParts(unitB);
        }

        if (unitA.tailDecoyFrames > 0) unitA.tailDecoyFrames--;
        if (unitB.tailDecoyFrames > 0) unitB.tailDecoyFrames--;
        _updateBodyImpairments(unitA);
        _updateBodyImpairments(unitB);
        _updateFacing(unitA, unitB);
        _updateFacing(unitB, unitA);

        _tickBuffs(unitA);
        _tickBuffs(unitB);

        unitA.attackCooldown = Math.max(0, unitA.attackCooldown - 1);
        unitB.attackCooldown = Math.max(0, unitB.attackCooldown - 1);
        for (const sk of unitA.skills) sk.cooldownLeft = Math.max(0, sk.cooldownLeft - 1);
        for (const sk of unitB.skills) sk.cooldownLeft = Math.max(0, sk.cooldownLeft - 1);

        _updateAIState(unitA, unitB, frame);
        _updateAIState(unitB, unitA, frame);

        const decA = _aiDecide(unitA, unitB, frame, session.map);
        const decB = _aiDecide(unitB, unitA, frame, session.map);
        const eventsA = _executeAction(unitA, unitB, decA, rageMulti, session.stats.left, frame, session.map);
        const eventsB = _executeAction(unitB, unitA, decB, rageMulti, session.stats.right, frame, session.map);
        lastEvents = animationMapper.appendDerivedAnimationEvents([...eventsA, ...eventsB], frame);

        if (recordFrames && frame % 3 === 0) {
            session.frames.push(_snapshotFrame(session, lastEvents));
        }

        session.frame++;

        const legalFinish = _resolveLegalFinish(session);
        if (legalFinish) return _finishBattle(session, legalFinish.winner, legalFinish.reason);
    }

    session.finished = false;
    session.winner = null;
    session.finishReason = null;
    return getBattleState(session, lastEvents);
}

function getBattleState(session, events = []) {
    return {
        frame: session.frame,
        fps: rules.BATTLE_FPS,
        maxFrames: rules.BATTLE_MAX_FRAMES,
        finished: session.finished,
        reason: session.finishReason || _inferFinishReason(session),
        winner: session.winner,
        map: session.map.id,
        mapConfig: _snapshotMap(session.map),
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
function simulate({ pet1, pet2, mapId, leftPersonality, rightPersonality }) {
    const session = createBattle({ pet1, pet2, mapId, leftPersonality, rightPersonality });
    while (!session.finished) {
        stepBattle(session, 1, { recordFrames: true });
    }
    return {
        reason: session.finishReason || _inferFinishReason(session),
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

function _executeAction(unit, opponent, decision, rageMulti, statTracker, frame, map) {
    const events = [];

    switch (decision.action) {
        case 'move': {
            const from = { x: Math.round(unit.x), y: Math.round(unit.y) };
            let moved = false;
            let moveSpeed = 0;
            if (secureRandomFloat() < unit.spinChance) {
                moveSpeed = rules.BATTLE_FAST_MOVE_SPEED;
                const spinPoint = _clampPoint(map, {
                    x: unit.x + (secureRandomFloat() * 2 - 1) * 18,
                    y: unit.y + (secureRandomFloat() * 2 - 1) * 18,
                });
                const actualMove = _battleDist(unit, spinPoint);
                unit.x = spinPoint.x;
                unit.y = spinPoint.y;
                moved = actualMove >= 0.5;
                if (moved) {
                    unit.stuckFrames = 0;
                    unit.lastMoveX = unit.x;
                    unit.lastMoveY = unit.y;
                    events.push({ type: 'spin', src: unit.side });
                    events.push(..._emitSoundAndPerception(unit, opponent, frame, map, moveSpeed, { soundType: 'scramble' }));
                } else {
                    unit.stuckFrames = (unit.stuckFrames || 0) + 1;
                }
            } else {
                let target = _targetPointFor(unit, opponent, decision, map);
                let dx = target.x - unit.x;
                let dy = target.y - unit.y;
                let len = Math.sqrt(dx * dx + dy * dy) || 1;
                moveSpeed = Math.max(1, Math.floor(unit.effectiveSpd / 10));
                let next = _clampPoint(map, {
                    x: unit.x + dx / len * moveSpeed,
                    y: unit.y + dy / len * moveSpeed,
                });
                let actualMove = _battleDist(unit, next);
                if ((actualMove < 0.5 && decision.toward === false) || (unit.stuckFrames || 0) >= 12) {
                    target = _unstuckPoint(unit, opponent, map);
                    dx = target.x - unit.x;
                    dy = target.y - unit.y;
                    len = Math.sqrt(dx * dx + dy * dy) || 1;
                    next = _clampPoint(map, {
                        x: unit.x + dx / len * Math.max(moveSpeed, 3),
                        y: unit.y + dy / len * Math.max(moveSpeed, 3),
                    });
                    actualMove = _battleDist(unit, next);
                    unit.aiSubState = null;
                    unit.flankTarget = null;
                    unit.protectTarget = null;
                }
                if (actualMove >= 0.5) {
                    unit.x = next.x;
                    unit.y = next.y;
                    moved = from.x !== Math.round(unit.x) || from.y !== Math.round(unit.y);
                    unit.stuckFrames = 0;
                    unit.lastMoveX = unit.x;
                    unit.lastMoveY = unit.y;
                } else {
                    unit.stuckFrames = (unit.stuckFrames || 0) + 1;
                    moved = false;
                }
                if (moved && _isFastMove(moveSpeed)) events.push(..._emitSoundAndPerception(unit, opponent, frame, map, moveSpeed));
            }
            if (moved) {
                events.push(animationMapper.mapMovementAction({
                    actor: unit,
                    from,
                    to: { x: Math.round(unit.x), y: Math.round(unit.y) },
                    speed: moveSpeed,
                    frame,
                    map,
                    actionId: _isFastMove(moveSpeed) ? 'fast_move' : 'move',
                }));
            }
            break;
        }

        case 'attack': {
            const dist = _battleDist(unit, opponent);
            if (dist > 100 * Math.max(0.1, unit.visionMult)) break;

            const targetPart = _pickTargetPart(opponent, unit);
            const result = _calcDamage(unit, opponent, rageMulti, 1.0, targetPart);
            _trackAngleStats(statTracker, result);
            unit.attackCooldown = Math.max(10, 30 - Math.floor(unit.effectiveSpd / 5));
            unit.battleStamina -= rules.BATTLE_STA_PER_ATK;

            if (result.dodged) {
                statTracker.dodges++;
                events.push({ type: result.decoy ? 'tail_decoy' : 'dodge', src: unit.side, tgt: opponent.side, part: result.part, attackZone: result.attackZone, flankScore: result.flankScore });
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
                    attackZone: result.attackZone,
                    flankScore: result.flankScore,
                    angleBonus: result.angleBonus,
                });
            }
            if (unit.aiSubState === 'flank_attack') {
                unit.aiSubState = null;
                unit.flankTarget = null;
            }
            events.push(animationMapper.mapAttackAction({
                actor: unit,
                target: opponent,
                frame,
                result,
                targetPart,
                actionId: 'bite',
            }));
            break;
        }

        case 'skill': {
            if (!unit.canUseSkills) break;
            const sk = decision.skill;
            const effect = rules.BATTLE_SKILL_EFFECTS[sk.code];
            if (!effect) break;

            sk.cooldownLeft = effect.cooldown;
            statTracker.skillsUsed++;
            if (effect.sound && effect.sound.fakeSound) {
                const fakePoint = _clampPoint(map, {
                    x: unit.x - (opponent.x - unit.x) / Math.max(1, _battleDist(unit, opponent)) * 120,
                    y: unit.y - (opponent.y - unit.y) / Math.max(1, _battleDist(unit, opponent)) * 120,
                });
                events.push(..._emitSoundAndPerception(unit, opponent, frame, map, rules.BATTLE_FAST_MOVE_SPEED, {
                    soundType: 'fake_skill_sound',
                    fake: true,
                    fakeVolume: effect.sound.fakeVolume || rules.BATTLE_FOOTSTEP_BASE_VOLUME * 1.4,
                    x: fakePoint.x,
                    y: fakePoint.y,
                    realSource: unit.side,
                }));
            }

            if (effect.type === 'heal') {
                const healAmt = Math.floor(unit.maxHp * effect.value);
                const parts = Object.values(unit.bodyParts).filter(part => !part.detached && part.hp < part.maxHp && part.code !== 'tail');
                const each = parts.length ? Math.max(1, Math.floor(healAmt / parts.length)) : 0;
                for (const part of parts) part.hp = Math.min(part.maxHp, part.hp + each);
                _syncBodyHp(unit);
                _updateBodyImpairments(unit);
                events.push({ type: 'heal', src: unit.side, amt: healAmt, skill: sk.code });
                events.push(animationMapper.mapSkillAction({ actor: unit, target: unit, frame, skillCode: sk.code, effect, result: { damage: 0 }, targetPart: null }));
            } else if (effect.type === 'buff') {
                _applyBuff(unit, effect, sk.code);
                events.push({ type: 'buff', src: unit.side, skill: sk.code, effect: effect.effect });
                events.push(animationMapper.mapSkillAction({ actor: unit, target: unit, frame, skillCode: sk.code, effect, result: { damage: 0 }, targetPart: null }));
            } else if (effect.type === 'fear_skill') {
                opponent.fear += rules.BATTLE_FEAR_SKILL;
                events.push({ type: 'fear', src: unit.side, tgt: opponent.side, skill: sk.code, fear: rules.BATTLE_FEAR_SKILL });
                events.push(animationMapper.mapSkillAction({ actor: unit, target: opponent, frame, skillCode: sk.code, effect, result: { damage: 0 }, targetPart: null }));
            } else {
                // 攻击型技能
                const dist = _battleDist(unit, opponent);
                const maxRange = (effect.type === 'ranged' ? 300 : 100) * Math.max(0.1, unit.visionMult);
                if (dist > maxRange) break;

                const targetPart = _pickTargetPart(opponent, unit);
                const result = _calcDamage(unit, opponent, rageMulti, effect.dmg_multi, targetPart);
                _trackAngleStats(statTracker, result);
                unit.battleStamina -= rules.BATTLE_STA_PER_ATK * 2;

                if (result.dodged) {
                    statTracker.dodges++;
                    events.push({ type: result.decoy ? 'tail_decoy' : 'dodge', src: unit.side, tgt: opponent.side, skill: sk.code, part: result.part, attackZone: result.attackZone, flankScore: result.flankScore });
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
                        attackZone: result.attackZone,
                        flankScore: result.flankScore,
                        angleBonus: result.angleBonus,
                    });
                }
                if (unit.aiSubState === 'flank_attack') {
                    unit.aiSubState = null;
                    unit.flankTarget = null;
                }
                events.push(animationMapper.mapSkillAction({
                    actor: unit,
                    target: opponent,
                    frame,
                    skillCode: sk.code,
                    effect,
                    result,
                    targetPart,
                }));

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

module.exports = { simulate, createBattle, stepBattle, getBattleState, normalizePersonality };
