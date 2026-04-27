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
const { getActionContract } = require('../models/battle-action-contracts');
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

function _actionPhase(activeAction, frame) {
    if (!activeAction) return null;
    const local = Math.max(0, frame - activeAction.startFrame);
    if (local < activeAction.windup) return 'windup';
    if (local <= activeAction.impact) return 'impact';
    if (frame < activeAction.endFrame) return 'recover';
    return 'done';
}

function _startActiveAction(unit, actionId, frame) {
    const contract = _actionContract(actionId);
    unit.activeAction = {
        actionId,
        type: contract.type,
        startFrame: frame,
        windup: contract.windup || 0,
        impact: contract.impact || 0,
        recover: contract.recover || 0,
        endFrame: frame + (contract.duration || 1),
        phase: 'windup',
        interruptible: contract.interruptible !== false,
        armor: Number(contract.armor || 0),
        counterWindow: contract.counterWindow || null,
    };
    return unit.activeAction;
}

function _tickActiveAction(unit, frame) {
    if (!unit.activeAction) return;
    const phase = _actionPhase(unit.activeAction, frame);
    if (!phase || phase === 'done') {
        unit.activeAction = null;
        return;
    }
    unit.activeAction.phase = phase;
}

function _canStartAction(unit) {
    return !unit.activeAction;
}

function _defenseState(unit, frame) {
    const action = unit.activeAction;
    if (!action || action.type !== 'defense') return null;
    const local = Math.max(0, frame - action.startFrame);
    const inCounter = !!(action.counterWindow && local >= action.counterWindow.start && local <= action.counterWindow.end);
    return {
        actionId: action.actionId,
        armor: Number(action.armor || 0),
        inCounter,
    };
}

function _addFear(unit, amount, frame, windowed = true) {
    const gain = Math.max(0, Number(amount || 0));
    if (!unit || gain <= 0) return 0;
    if (!windowed) {
        unit.fear += gain;
        return gain;
    }
    const windowFrames = Math.max(1, rules.BATTLE_FEAR_HIT_WINDOW_FRAMES || rules.BATTLE_FPS * 3);
    const cap = Math.max(1, rules.BATTLE_FEAR_HIT_WINDOW_CAP || 14);
    if (!Number.isFinite(unit.fearWindowFrame) || frame - unit.fearWindowFrame > windowFrames) {
        unit.fearWindowFrame = frame;
        unit.fearWindowGain = 0;
    }
    const room = Math.max(0, cap - Number(unit.fearWindowGain || 0));
    const applied = Math.min(gain, room);
    unit.fearWindowGain = Number(unit.fearWindowGain || 0) + applied;
    unit.fear += applied;
    return applied;
}

function _reduceFear(unit, amount) {
    const relief = Math.max(0, Number(amount || 0));
    if (!unit || relief <= 0) return 0;
    const before = Number(unit.fear || 0);
    unit.fear = Math.max(0, before - relief);
    return before - unit.fear;
}

function _actionContract(code) {
    return getActionContract(code);
}

function _actionCooldown(code, effect) {
    const contract = _actionContract(code);
    return Math.max(0, Number(effect && effect.cooldown != null ? effect.cooldown : contract.cooldown || 0));
}

function _actionStaminaCost(code, effect) {
    const contract = _actionContract(code);
    return Math.max(0, Number(effect && effect.staminaCost != null ? effect.staminaCost : contract.staminaCost || rules.BATTLE_STA_PER_ATK));
}

function _hasActionStamina(unit, code, effect) {
    const cost = _actionStaminaCost(code, effect);
    if (cost <= 0) return true;
    if (unit.battleStamina <= 0) return cost <= rules.BATTLE_STA_LOW_ACTION_LIMIT;
    return unit.battleStamina >= cost;
}

function _actionMaxRange(unit, code, effect) {
    const contract = _actionContract(code);
    return Number(contract.maxRange || (effect && effect.type === 'ranged' ? 300 : 100)) * Math.max(0.1, unit.visionMult);
}

function _skillIntent(effect) {
    if (!effect) return 'attack';
    if (effect.intent) return effect.intent;
    if (effect.type === 'heal') return 'recover';
    if (effect.type === 'defense') return 'defend';
    if (effect.type === 'movement') return 'kite';
    if (effect.type === 'perception') return 'observe';
    if (effect.type === 'trick') return 'bait';
    if (effect.type === 'buff') {
        if (effect.effect === 'dodge_up' || effect.sound) return 'bait';
        if (effect.effect === 'crit_up') return 'execute';
        return 'defend';
    }
    if (effect.type === 'fear_skill') return 'fear';
    if (effect.type === 'ranged') return 'kite';
    return 'attack';
}

const STRATEGY_INTENTS = ['pressure', 'execute', 'defend', 'kite', 'ambush', 'bait', 'observe', 'recover', 'fear', 'idle'];

function _emptyStrategyTrace() {
    return STRATEGY_INTENTS.reduce((out, key) => {
        out[key] = 0;
        return out;
    }, {});
}

function _emptyOpponentModel() {
    return {
        actions: 0,
        skills: 0,
        attacks: 0,
        defenses: 0,
        movement: 0,
        tricks: 0,
        perceptions: 0,
        lastIntent: 'idle',
        lastSkill: null,
        intentTrace: _emptyStrategyTrace(),
        aggression: 0,
        defense: 0,
        mobility: 0,
        deception: 0,
        observation: 0,
    };
}

function _observeOpponentAction(observer, decision) {
    if (!observer || !decision) return;
    if (!observer.opponentModel) observer.opponentModel = _emptyOpponentModel();
    const model = observer.opponentModel;
    const intent = STRATEGY_INTENTS.includes(decision.strategyIntent) ? decision.strategyIntent : 'idle';
    model.actions++;
    model.lastIntent = intent;
    model.intentTrace[intent] = (model.intentTrace[intent] || 0) + 1;

    if (decision.action === 'skill' && decision.skill) {
        model.skills++;
        model.lastSkill = decision.skill.code;
        const effect = rules.BATTLE_SKILL_EFFECTS[decision.skill.code] || {};
        if (effect.type === 'melee' || effect.type === 'ranged' || effect.type === 'fear_skill') model.attacks++;
        else if (effect.type === 'defense') model.defenses++;
        else if (effect.type === 'movement') model.movement++;
        else if (effect.type === 'trick' || effect.sound && effect.sound.fakeSound) model.tricks++;
        else if (effect.type === 'perception') model.perceptions++;
    } else if (decision.action === 'move') {
        model.movement++;
    }

    const total = Math.max(1, model.actions);
    model.aggression = Number(((model.intentTrace.pressure + model.intentTrace.execute + model.intentTrace.fear + model.attacks) / total).toFixed(3));
    model.defense = Number(((model.intentTrace.defend + model.defenses) / total).toFixed(3));
    model.mobility = Number(((model.intentTrace.kite + model.intentTrace.ambush + model.movement) / total).toFixed(3));
    model.deception = Number(((model.intentTrace.bait + model.tricks) / total).toFixed(3));
    model.observation = Number(((model.intentTrace.observe + model.perceptions) / total).toFixed(3));
}

function _strategyDecision(unit, decision, intent, reason, frame) {
    const normalized = STRATEGY_INTENTS.includes(intent) ? intent : 'pressure';
    const changed = unit.strategyIntent !== normalized || unit.strategyReason !== reason;
    if (unit.strategyIntent === normalized) unit.strategyRepeatCount = (unit.strategyRepeatCount || 0) + 1;
    else unit.strategyRepeatCount = 0;
    unit.strategyIntent = normalized;
    unit.strategyReason = reason || normalized;
    unit.strategyFrame = frame;
    unit.strategyChanged = changed;
    if (!unit.strategyTrace) unit.strategyTrace = _emptyStrategyTrace();
    unit.strategyTrace[normalized] = (unit.strategyTrace[normalized] || 0) + 1;
    return { ...decision, strategyIntent: normalized, strategyReason: unit.strategyReason };
}

function _skillStrategyIntent(effect) {
    const intent = _skillIntent(effect);
    if (intent === 'attack' || intent === 'pressure' || intent === 'control' || intent === 'harass') return 'pressure';
    if (intent === 'execute') return 'execute';
    if (intent === 'defend') return 'defend';
    if (intent === 'kite') return 'kite';
    if (intent === 'ambush') return 'ambush';
    if (intent === 'bait') return 'bait';
    if (intent === 'observe') return 'observe';
    if (intent === 'recover') return 'recover';
    if (intent === 'fear') return 'fear';
    return 'pressure';
}

function _decisionForSkill(unit, skill, frame, fallbackIntent = 'pressure', reason = 'skill_score') {
    const effect = skill && rules.BATTLE_SKILL_EFFECTS[skill.code];
    const intent = effect && fallbackIntent === 'pressure' ? _skillStrategyIntent(effect) : fallbackIntent;
    return _strategyDecision(unit, { action: 'skill', skill }, effect ? intent : fallbackIntent, `${reason}:${skill && skill.code || 'unknown'}`, frame);
}

function _skillScore(unit, opponent, effect, dist, hpRatio, code) {
    const p = unit.personality;
    const contract = _actionContract(code);
    const effectiveDist = dist / Math.max(0.1, unit.visionMult);
    const staminaRatio = unit.battleStamina / Math.max(1, unit.maxBattleStamina);
    const opponentHpRatio = opponent.hp / Math.max(1, opponent.maxHp);
    const exposure = unit.weakExposure || weakPointExposure(unit, opponent);
    const flank = flankScore(unit, opponent);
    const intent = _skillIntent(effect);
    let score = 0;

    if (intent === 'recover') score = hpRatio < 0.72 - p.risk * 0.28 ? 65 + p.caution * 35 + (1 - hpRatio) * 40 : 0;
    else if (intent === 'defend') score = 18 + p.caution * 48 + Math.max(0, 1 - hpRatio) * 44 + Math.max(0, exposure.exposure || 0) * 26 + (dist < 120 ? 18 : -10);
    else if (intent === 'bait') score = 28 + p.cunning * 50 + p.caution * 14 + (opponent.aiState === 'aggressive' ? 14 : 0) + (dist < 150 ? 10 : 0);
    else if (intent === 'execute') score = 22 + p.skill * 42 + p.aggression * 18 + (1 - opponentHpRatio) * 45;
    else if (intent === 'fear') score = opponent.fear > 30 + p.ferocity * 28 ? 42 + p.ferocity * 45 : 10 + p.ferocity * 18;
    else if (intent === 'kite') score = 28 + p.mobility * 35 + p.caution * 26 + (dist < 130 ? 28 : -6);
    else if (intent === 'ambush') score = 25 + p.cunning * 44 + p.mobility * 26 + (flank < 0.55 ? 22 : 4);
    else if (intent === 'observe') score = unit.perception.awareness < 35 || unit.perception.misledByFakeSound ? 30 + p.hearing * 48 + p.caution * 22 + (1 - unit.perception.soundConfidence) * 20 : 4;
    else if (intent === 'pressure' || intent === 'control') score = effectiveDist <= 125 ? 38 + p.aggression * 24 + p.skill * 20 + opponent.fear * 0.12 : 0;
    else if (intent === 'harass') score = effectiveDist <= 105 ? 34 + p.aggression * 18 + p.mobility * 18 + (staminaRatio < 0.28 ? 14 : 0) : 0;
    else if (effect.type === 'ranged') score = effectiveDist <= 300 ? 38 + p.skill * 26 + p.cunning * 20 + (dist > 120 ? 16 : 0) : 0;
    else score = effectiveDist <= 115 ? 42 + p.aggression * 32 + p.ferocity * 18 + (1 - opponentHpRatio) * 20 : 0;

    if (contract.tags && contract.tags.includes('heavy')) score += opponentHpRatio < 0.45 ? 24 : -8;
    if (contract.tags && contract.tags.includes('fast')) score += staminaRatio < 0.35 ? 12 : 4;
    if (contract.tags && contract.tags.includes('counter_ready')) score += opponent.aiState === 'aggressive' ? 12 : 0;
    const model = unit.opponentModel || {};
    if (intent === 'defend' && model.aggression > 0.75) score += 18;
    if (intent === 'kite' && model.aggression > 0.65) score += 12 + p.mobility * 8;
    if (intent === 'ambush' && model.defense > 0.45) score += 14 + p.cunning * 10;
    if (intent === 'bait' && model.observation < 0.25) score += 10 + p.cunning * 8;
    if ((intent === 'pressure' || intent === 'attack' || intent === 'execute') && model.deception > 0.5) score -= 10;

    const cost = _actionStaminaCost(code, effect);
    if (cost > 0 && staminaRatio < 0.3 && cost > rules.BATTLE_STA_LOW_ACTION_LIMIT) score -= 22 + cost * 2;
    const strategyIntent = _skillStrategyIntent(effect);
    if (unit.strategyIntent === strategyIntent && (unit.strategyRepeatCount || 0) > (rules.BATTLE_STRATEGY_REPEAT_LIMIT || 75)) {
        score -= rules.BATTLE_STRATEGY_REPEAT_SCORE_PENALTY || 18;
    }
    return score + p.skill * 18 + secureRandomFloat() * 6;
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

function _targetPartIntent(partKey) {
    if (partKey === 'head') return 'disable_sense';
    if (partKey === 'torso') return 'core_kill';
    if (partKey === 'tail') return 'remove_decoy';
    return 'cripple_mobility';
}

function _partTacticalWeight(attacker, defender, partKey, cfg, flank) {
    const part = defender.bodyParts[partKey];
    if (!part || part.detached || part.hp <= 0) return null;
    const p = attacker.personality || {};
    const strategy = attacker.strategyIntent || 'pressure';
    const hpRatio = Math.max(0, part.hp) / Math.max(1, part.maxHp);
    const loss = 1 - hpRatio;
    const lowDefBonus = Math.max(0, 1 - part.def / Math.max(1, defender.def + part.def));
    const coreBonus = cfg.core ? 1.12 : 0.95;
    let weight = cfg.weight * coreBonus * (1 + Math.min(1.15, loss * 1.2) + lowDefBonus * 0.35);

    if (flank > 0.7 && (partKey === 'head' || partKey === 'torso')) weight *= 1.75;
    if (flank < 0.3 && (partKey === 'foreLeft' || partKey === 'foreRight')) weight *= 1.28;
    if (flank >= 0.35 && flank <= 0.75 && (partKey === 'foreLeft' || partKey === 'foreRight' || partKey === 'hindLeft' || partKey === 'hindRight')) weight *= 1.22;

    if (strategy === 'execute') weight *= (cfg.core ? 1.5 : 0.72) * (1 + loss * 1.4);
    else if (strategy === 'ambush') weight *= partKey === 'head' || partKey === 'torso' ? 1.45 + flank * 0.45 : 0.88;
    else if (strategy === 'kite' || strategy === 'harass') weight *= partKey === 'hindLeft' || partKey === 'hindRight' || partKey === 'tail' ? 1.4 : 0.95;
    else if (strategy === 'defend') weight *= partKey === 'foreLeft' || partKey === 'foreRight' ? 1.25 : 0.9;
    else if (strategy === 'bait') weight *= partKey === 'tail' ? 1.35 : 1;

    weight *= 1 + (p.skill || 0.5) * loss * 0.75 + (p.cunning || 0.5) * flank * 0.45;
    return [partKey, Math.max(0.001, weight)];
}

function _recordTargetPart(statTracker, partKey, tactic, damage) {
    if (!statTracker || !partKey) return;
    if (!statTracker.targetParts) statTracker.targetParts = {};
    if (!statTracker.targetParts[partKey]) statTracker.targetParts[partKey] = { attempts: 0, damage: 0 };
    statTracker.targetParts[partKey].attempts++;
    statTracker.targetParts[partKey].damage += Math.max(0, Number(damage || 0));
    if (!statTracker.targetTactics) statTracker.targetTactics = {};
    statTracker.targetTactics[tactic] = (statTracker.targetTactics[tactic] || 0) + 1;
}

function _pickTargetPart(defender, attacker) {
    const flank = attacker ? flankScore(attacker, defender) : 0;
    const candidates = Object.entries(rules.BATTLE_BODY_PARTS)
        .map(([key, cfg]) => _partTacticalWeight(attacker || {}, defender, key, cfg, flank))
        .filter(Boolean);
    const total = candidates.reduce((sum, item) => sum + item[1], 0);
    let roll = secureRandomFloat() * total;
    let chosen = candidates.length ? candidates[candidates.length - 1][0] : 'torso';
    for (const item of candidates) {
        roll -= item[1];
        if (roll <= 0) {
            chosen = item[0];
            break;
        }
    }
    if (attacker) {
        attacker.lastTargetTactic = {
            part: chosen,
            intent: _targetPartIntent(chosen),
            flank: Number(flank.toFixed(3)),
            strategy: attacker.strategyIntent || 'pressure',
        };
    }
    return chosen;
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

function _battleSkillList(fighter) {
    const byCode = new Map();
    for (const item of fighter.skills || []) {
        if (!item || !item.skill_code) continue;
        byCode.set(item.skill_code, {
            code: item.skill_code,
            level: item.skill_level || 1,
            cooldownLeft: 0,
        });
    }
    if (!byCode.has('quick_snap')) byCode.set('quick_snap', { code: 'quick_snap', level: 1, cooldownLeft: 0, virtual: true });
    if (!byCode.has('bite')) byCode.set('bite', { code: 'bite', level: 1, cooldownLeft: 0, virtual: true });
    if (!byCode.has('guard')) byCode.set('guard', { code: 'guard', level: 1, cooldownLeft: 0, virtual: true });
    if (!byCode.has('brace')) byCode.set('brace', { code: 'brace', level: 1, cooldownLeft: 0, virtual: true });
    return Array.from(byCode.values());
}

function _createUnit(fighter, side, map) {
    const stats = _calcCombatStats(fighter);
    const personality = normalizePersonality(fighter.personality);
    const hearingMult = 1 + (personality.hearing - 0.5) * 0.28;
    const skillList = _battleSkillList(fighter);

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
        strategyIntent: 'idle',
        strategyReason: 'spawn',
        strategyFrame: 0,
        strategyChanged: false,
        strategyRepeatCount: 0,
        strategyTrace: _emptyStrategyTrace(),
        opponentModel: _emptyOpponentModel(),
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
        infoStats: { heard: 0, fakeHeard: 0, misled: 0, infoSkills: 0 },

        // 原始六维
        attr: fighter.attr,
        fear: 0,
        fearWindowFrame: -Infinity,
        fearWindowGain: 0,
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

        actionEconomy: { spent: 0, recovered: 0, blockedByStamina: 0 },
        activeAction: null,
        defenseStats: { blocks: 0, blockedDamage: 0, counters: 0 },
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
    if (!_canStartAction(unit)) return _strategyDecision(unit, { action: 'idle' }, unit.strategyIntent || 'idle', 'action_locked', frame);
    if (_shouldPanicMove(unit)) {
        unit.aiSubState = null;
        unit.flankTarget = null;
        unit.protectTarget = null;
        return _strategyDecision(unit, { action: 'move', toward: false, panic: true }, 'fear', 'panic_escape', frame);
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
    const model = unit.opponentModel || {};
    if (!unit.aiSubState && model.aggression > 0.82 && p.caution > 0.35 && unit.hp / Math.max(1, unit.maxHp) < 0.92) {
        unit.aiSubState = 'protecting';
        unit.protectTarget = _calcProtectPosition(unit, opponent, map);
        unit.flankTarget = null;
    } else if (!unit.aiSubState && model.defense > 0.55 && p.cunning > 0.5 && dist <= rules.BATTLE_FLANK_MAX_DIST) {
        unit.aiSubState = 'flanking';
        unit.flankTarget = _calcFlankPosition(unit, opponent, map, meleeRange);
    }

    if (unit.aiSubState === 'protecting' && unit.protectTarget) {
        return _strategyDecision(unit, { action: 'move', toward: false, targetX: unit.protectTarget.x, targetY: unit.protectTarget.y }, 'defend', `protect_weak:${exposure.part}`, frame);
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
            return _strategyDecision(unit, { action: 'move', toward: true, targetX: unit.flankTarget.x, targetY: unit.flankTarget.y }, 'ambush', `seek_flank:${score.toFixed(2)}`, frame);
        }
    }

    const readySkill = _pickSkill(unit, opponent, dist);
    const fallbackSkill = _pickBasicAttack(unit, opponent, dist);
    const defenseSkill = _pickDefenseSkill(unit);
    const exploreRoll = secureRandomFloat();
    if (readySkill && unit.aiSubState !== 'flanking') return _decisionForSkill(unit, readySkill, frame);
    if (exploreRoll < (rules.BATTLE_AI_EXPLORE_CHANCE || 0.12)) {
        if (defenseSkill && unit.strategyIntent === 'pressure' && dist <= 145) return _decisionForSkill(unit, defenseSkill, frame, 'defend', 'explore_guard');
        if (fallbackSkill && unit.strategyIntent === 'defend' && dist <= meleeRange + 28) return _decisionForSkill(unit, fallbackSkill, frame, 'pressure', 'explore_counterpoke');
        if (p.cunning > 0.45 && dist <= rules.BATTLE_FLANK_MAX_DIST) {
            const flankTarget = _calcFlankPosition(unit, opponent, map, meleeRange);
            unit.flankTarget = flankTarget;
            unit.aiSubState = 'flanking';
            return _strategyDecision(unit, { action: 'move', toward: true, targetX: flankTarget.x, targetY: flankTarget.y }, 'ambush', 'explore_flank', frame);
        }
    }

    switch (unit.aiState) {
        case 'aggressive':
            if (unit.aiSubState === 'flank_attack' && fallbackSkill && dist <= meleeRange + 35) return _decisionForSkill(unit, fallbackSkill, frame, 'ambush', 'flank_attack');
            if (isInFrontArc(unit, opponent) && dist > meleeRange * 0.8 && p.cunning > 0.4 && p.mobility > 0.4) {
                const flankTarget = _calcFlankPosition(unit, opponent, map, meleeRange);
                unit.flankTarget = flankTarget;
                unit.aiSubState = 'flanking';
                return _strategyDecision(unit, { action: 'move', toward: true, targetX: flankTarget.x, targetY: flankTarget.y }, 'ambush', 'open_flank_route', frame);
            }
            if (dist > meleeRange) return _strategyDecision(unit, { action: 'move', toward: true }, 'pressure', 'close_distance', frame);
            if (fallbackSkill) return _decisionForSkill(unit, fallbackSkill, frame, 'pressure', 'basic_attack');
            if (p.ferocity > 0.82 && dist < 140) return _strategyDecision(unit, { action: 'move', toward: true }, 'pressure', 'ferocity_chase', frame);
            return _strategyDecision(unit, { action: 'idle' }, 'idle', 'no_aggressive_option', frame);

        case 'kiting': {
            if (dist < kiteRange) {
                const kite = _calcKitePosition(unit, opponent, map);
                return _strategyDecision(unit, { action: 'move', toward: false, targetX: kite.x, targetY: kite.y }, 'kite', 'keep_spacing', frame);
            }
            if (fallbackSkill && dist < kiteRange + 55) return _decisionForSkill(unit, fallbackSkill, frame, 'kite', 'kite_poke');
            const known = _knownTargetDecision(unit, true);
            return p.cunning > 0.68 && known ? _strategyDecision(unit, known, 'observe', 'track_known_target', frame) : _strategyDecision(unit, { action: 'idle' }, 'idle', 'hold_kite_range', frame);
        }

        case 'defensive':
            unit.aiSubState = null;
            if (defenseSkill && dist <= 155) return _decisionForSkill(unit, defenseSkill, frame, 'defend', 'guard_ready');
            if (dist < 95 + p.caution * 45) return _strategyDecision(unit, { action: 'move', toward: false }, 'defend', 'retreat_defense', frame);
            if (dist > 105 + p.aggression * 35) return _strategyDecision(unit, { action: 'move', toward: true }, 'pressure', 'reengage_defense', frame);
            if (fallbackSkill && p.risk > 0.28) return _decisionForSkill(unit, fallbackSkill, frame, 'pressure', 'defensive_counterpoke');
            if (defenseSkill) return _decisionForSkill(unit, defenseSkill, frame, 'defend', 'hold_guard_space');
            return _strategyDecision(unit, { action: 'idle' }, 'defend', 'hold_guard_space', frame);

        case 'alert': {
            unit.aiSubState = null;
            const infoSkill = unit.perception.soundConfidence < 0.55 ? _pickInfoSkill(unit) : null;
            if (infoSkill) return _decisionForSkill(unit, infoSkill, frame, 'observe', 'confirm_sound');
            if (dist <= 95 + p.aggression * 35 && fallbackSkill) return _decisionForSkill(unit, fallbackSkill, frame, 'pressure', 'alert_contact');
            const known = _knownTargetDecision(unit, true);
            return _strategyDecision(unit, known || { action: 'move', toward: true }, 'observe', 'sound_lock', frame);
        }

        case 'searching': {
            unit.aiSubState = null;
            const infoSkill = _pickInfoSkill(unit);
            if (infoSkill && unit.perception.soundConfidence < 0.8) return _decisionForSkill(unit, infoSkill, frame, 'observe', 'disambiguate_fake_sound');
            const known = _knownTargetDecision(unit, p.cunning < 0.25);
            if (!known) return _strategyDecision(unit, { action: 'idle' }, 'observe', 'lost_target', frame);
            if (p.cunning >= 0.25) {
                const target = _targetPointFor(unit, { x: known.targetX, y: known.targetY }, { toward: false }, map);
                return _strategyDecision(unit, { action: 'move', toward: false, targetX: target.x, targetY: target.y }, 'bait', 'fake_sound_suspected', frame);
            }
            return _strategyDecision(unit, known, 'observe', 'search_last_known', frame);
        }

        case 'fear':
            unit.aiSubState = null;
            if (defenseSkill && dist <= 145 && unit.fear < rules.BATTLE_FEAR_ESCAPE * 1.15) return _decisionForSkill(unit, defenseSkill, frame, 'defend', 'fear_guard');
            if (fallbackSkill && dist <= meleeRange && p.ferocity + p.risk > 0.95) return _decisionForSkill(unit, fallbackSkill, frame, 'pressure', 'fear_snap_back');
            return _strategyDecision(unit, { action: 'move', toward: false }, 'fear', 'fear_state_escape', frame);

        default:
            return _strategyDecision(unit, { action: 'idle' }, 'idle', 'unknown_state', frame);
    }
}

/** 选择可用技能 */
function _pickInfoSkill(unit) {
    if (!unit.canUseSkills) return null;
    const preferred = unit.perception.misledByFakeSound ? ['search_sound', 'listen_alert'] : ['listen_alert', 'search_sound'];
    for (const code of preferred) {
        const sk = unit.skills.find(item => item.code === code && item.cooldownLeft <= 0);
        const effect = rules.BATTLE_SKILL_EFFECTS[code];
        if (sk && effect && _hasActionStamina(unit, code, effect)) return sk;
    }
    return null;
}

function _pickSkill(unit, opponent, dist) {
    if (!unit.canUseSkills) return null;
    let best = null;
    let bestScore = 0;
    const hpRatio = unit.hp / unit.maxHp;
    unit.actionEconomy = unit.actionEconomy || { spent: 0, recovered: 0, blockedByStamina: 0 };
    for (const sk of unit.skills) {
        if (sk.cooldownLeft > 0) continue;
        const effect = rules.BATTLE_SKILL_EFFECTS[sk.code];
        if (!effect) continue;
        if (!_hasActionStamina(unit, sk.code, effect)) {
            unit.actionEconomy.blockedByStamina++;
            continue;
        }
        if ((effect.type === 'melee' || effect.type === 'ranged') && dist > _actionMaxRange(unit, sk.code, effect)) continue;
        const score = _skillScore(unit, opponent, effect, dist, hpRatio, sk.code);
        if (score > bestScore) {
            bestScore = score;
            best = sk;
        }
    }
    return bestScore >= 55 ? best : null;
}

function _pickDefenseSkill(unit) {
    if (!unit.canUseSkills) return null;
    const preferred = ['brace', 'guard'];
    for (const code of preferred) {
        const sk = unit.skills.find(item => item.code === code && item.cooldownLeft <= 0);
        const effect = rules.BATTLE_SKILL_EFFECTS[code];
        if (sk && effect && _hasActionStamina(unit, code, effect)) return sk;
    }
    return null;
}

function _pickBasicAttack(unit, opponent, dist) {
    const candidates = ['quick_snap', 'bite'];
    const hpRatio = unit.hp / Math.max(1, unit.maxHp);
    let best = null;
    let bestScore = 0;
    for (const code of candidates) {
        const sk = unit.skills.find(item => item.code === code && item.cooldownLeft <= 0);
        const effect = rules.BATTLE_SKILL_EFFECTS[code];
        if (!sk || !effect) continue;
        const maxRange = _actionMaxRange(unit, code, effect);
        if (dist > maxRange) continue;
        if (!_hasActionStamina(unit, code, effect)) {
            unit.actionEconomy = unit.actionEconomy || { spent: 0, recovered: 0, blockedByStamina: 0 };
            unit.actionEconomy.blockedByStamina++;
            continue;
        }
        const score = _skillScore(unit, opponent, effect, dist, hpRatio, code) + (code === 'quick_snap' ? 8 : 0);
        if (score > bestScore) {
            bestScore = score;
            best = sk;
        }
    }
    return best;
}

/* ═══════════════════════════════════════════
 * 伤害计算
 * ═══════════════════════════════════════════ */

function _calcDamage(attacker, defender, rageMulti, skillMulti, targetPartKey, frame) {
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

    const rawDamage = Math.max(1, Math.floor(baseAtk * defReduction * float * rageMulti * staPenalty * critMulti));
    const defense = _defenseState(defender, frame);
    if (defense && defense.armor > 0) {
        const blockRate = Math.max(0, Math.min(0.9, defense.armor));
        const damage = Math.max(1, Math.floor(rawDamage * (1 - blockRate)));
        return {
            damage,
            rawDamage,
            blockedDamage: rawDamage - damage,
            blocked: true,
            countered: defense.inCounter,
            defenseAction: defense.actionId,
            dodged: false,
            crit: isCrit,
            part: targetPartKey,
            angleBonus,
            attackZone: angleBonus.zone,
            flankScore: angleBonus.flankScore,
            flankAngle: angleBonus.angle,
        };
    }

    return { damage: rawDamage, rawDamage, dodged: false, crit: isCrit, part: targetPartKey, angleBonus, attackZone: angleBonus.zone, flankScore: angleBonus.flankScore, flankAngle: angleBonus.angle };
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
    listener.infoStats.heard++;
    if (sound.fake) {
        listener.infoStats.fakeHeard++;
        listener.infoStats.misled++;
    }

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
            left:  { totalDamage: 0, hits: 0, crits: 0, dodges: 0, skillsUsed: 0, blocks: 0, blockedDamage: 0, counters: 0, angle: _emptyAngleStats(), strategy: _emptyStrategyTrace(), targetParts: {}, targetTactics: {} },
            right: { totalDamage: 0, hits: 0, crits: 0, dodges: 0, skillsUsed: 0, blocks: 0, blockedDamage: 0, counters: 0, angle: _emptyAngleStats(), strategy: _emptyStrategyTrace(), targetParts: {}, targetTactics: {} },
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
        lastTargetTactic: unit.lastTargetTactic || null,
        strategy: {
            intent: unit.strategyIntent || 'idle',
            reason: unit.strategyReason || 'idle',
            frame: unit.strategyFrame || 0,
        },
        strategyTrace: { ...unit.strategyTrace },
        opponentModel: { ...unit.opponentModel, intentTrace: { ...(unit.opponentModel && unit.opponentModel.intentTrace || {}) } },
        hp: unit.hp,
        maxHp: unit.maxHp,
        fear: unit.fear,
        st: unit.aiState,
        sta: Math.round(unit.battleStamina),
        maxSta: unit.maxBattleStamina,
        actionEconomy: { ...unit.actionEconomy },
        defenseStats: { ...unit.defenseStats },
        infoStats: { ...unit.infoStats },
        activeAction: unit.activeAction ? { ...unit.activeAction, phase: unit.activeAction.phase } : null,
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
        skills: unit.skills.map(s => ({
            code: s.code,
            cooldownLeft: s.cooldownLeft,
            cooldown: _actionCooldown(s.code, rules.BATTLE_SKILL_EFFECTS[s.code]),
            staminaCost: _actionStaminaCost(s.code, rules.BATTLE_SKILL_EFFECTS[s.code]),
            ready: s.cooldownLeft <= 0 && _hasActionStamina(unit, s.code, rules.BATTLE_SKILL_EFFECTS[s.code]),
            virtual: !!s.virtual,
        })),
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
            strategyTrace: { ...unitA.strategyTrace },
            currentStrategy: { intent: unitA.strategyIntent, reason: unitA.strategyReason, frame: unitA.strategyFrame },
            opponentModel: { ...unitA.opponentModel, intentTrace: { ...unitA.opponentModel.intentTrace } },
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
            actionEconomy: { ...unitA.actionEconomy },
            infoStats: { ...unitA.infoStats },
            ...session.stats.left,
        },
        right: {
            petId: unitB.petId,
            name: unitB.name,
            hpRemaining: Math.max(0, unitB.hp),
            personality: unitB.personality,
            personalityTrace: { ...unitB.personalityTrace },
            strategyTrace: { ...unitB.strategyTrace },
            currentStrategy: { intent: unitB.strategyIntent, reason: unitB.strategyReason, frame: unitB.strategyFrame },
            opponentModel: { ...unitB.opponentModel, intentTrace: { ...unitB.opponentModel.intentTrace } },
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
            actionEconomy: { ...unitB.actionEconomy },
            infoStats: { ...unitB.infoStats },
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
            for (const unit of [unitA, unitB]) {
                const regen = rules.BATTLE_STA_REGEN_PER_SEC || 0;
                if (regen > 0 && unit.battleStamina < unit.maxBattleStamina) {
                    unit.battleStamina = Math.min(unit.maxBattleStamina, unit.battleStamina + regen);
                    unit.actionEconomy.recovered += regen;
                }
            }
        }

        if (unitA.tailDecoyFrames > 0) unitA.tailDecoyFrames--;
        if (unitB.tailDecoyFrames > 0) unitB.tailDecoyFrames--;
        _updateBodyImpairments(unitA);
        _updateBodyImpairments(unitB);
        _updateFacing(unitA, unitB);
        _updateFacing(unitB, unitA);

        _tickBuffs(unitA);
        _tickBuffs(unitB);

        for (const sk of unitA.skills) sk.cooldownLeft = Math.max(0, sk.cooldownLeft - 1);
        for (const sk of unitB.skills) sk.cooldownLeft = Math.max(0, sk.cooldownLeft - 1);

        _tickActiveAction(unitA, frame);
        _tickActiveAction(unitB, frame);

        _updateAIState(unitA, unitB, frame);
        _updateAIState(unitB, unitA, frame);

        const decA = _aiDecide(unitA, unitB, frame, session.map);
        const decB = _aiDecide(unitB, unitA, frame, session.map);
        _observeOpponentAction(unitA, decB);
        _observeOpponentAction(unitB, decA);
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
    if (decision && statTracker && statTracker.strategy) {
        const intent = decision.strategyIntent || unit.strategyIntent || 'idle';
        statTracker.strategy[intent] = (statTracker.strategy[intent] || 0) + 1;
        if (unit.strategyChanged) {
            events.push({ type: 'strategy_intent', src: unit.side, intent, reason: decision.strategyReason || unit.strategyReason || intent, frame });
            unit.strategyChanged = false;
        }
    }

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

        case 'skill': {
            if (!unit.canUseSkills) break;
            const sk = decision.skill;
            const effect = rules.BATTLE_SKILL_EFFECTS[sk.code];
            if (!effect) break;

            sk.cooldownLeft = _actionCooldown(sk.code, effect);
            statTracker.skillsUsed++;
            const staminaCost = _actionStaminaCost(sk.code, effect);
            if (!_hasActionStamina(unit, sk.code, effect)) {
                unit.actionEconomy.blockedByStamina++;
                break;
            }
            unit.battleStamina = Math.max(0, unit.battleStamina - staminaCost);
            unit.actionEconomy.spent += staminaCost;
            const actionState = _startActiveAction(unit, sk.code, frame);
            events.push({
                type: 'action_phase',
                src: unit.side,
                actionId: sk.code,
                phase: actionState.phase,
                startFrame: actionState.startFrame,
                impactFrame: actionState.startFrame + actionState.impact,
                endFrame: actionState.endFrame,
                interruptible: actionState.interruptible,
                counterWindow: actionState.counterWindow,
            });
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
            } else if (effect.type === 'defense') {
                events.push({
                    type: 'defense_ready',
                    src: unit.side,
                    skill: sk.code,
                    actionId: sk.code,
                    armor: actionState.armor,
                    counterWindow: actionState.counterWindow,
                    endFrame: actionState.endFrame,
                });
                events.push(animationMapper.mapSkillAction({ actor: unit, target: unit, frame, skillCode: sk.code, effect, result: { damage: 0 }, targetPart: null }));
            } else if (effect.type === 'movement') {
                const rootMotion = _actionContract(sk.code).rootMotion || {};
                const away = sk.code === 'retreat_step' || effect.effect === 'retreat';
                const sideStep = sk.code === 'flank_step' || effect.effect === 'flank';
                const dx = opponent.x - unit.x;
                const dy = opponent.y - unit.y;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                const nx = dx / len;
                const ny = dy / len;
                const side = unit.side === 'left' ? 1 : -1;
                const step = Number(effect.value || rootMotion.retreat || rootMotion.sidestep || 28);
                const from = { x: Math.round(unit.x), y: Math.round(unit.y) };
                const next = _clampPoint(map, {
                    x: unit.x + (away ? -nx * step : 0) + (sideStep ? -ny * side * step : 0),
                    y: unit.y + (away ? -ny * step : 0) + (sideStep ? nx * side * step : 0),
                });
                unit.x = next.x;
                unit.y = next.y;
                events.push(animationMapper.mapMovementAction({ actor: unit, from, to: { x: Math.round(unit.x), y: Math.round(unit.y) }, speed: step, frame, map, actionId: sk.code }));
            } else if (effect.type === 'perception') {
                unit.infoStats.infoSkills++;
                unit.perception.awareness = Math.min(100, unit.perception.awareness + (sk.code === 'listen_alert' ? 18 : 28));
                unit.perception.lastKnownTargetX = opponent.x;
                unit.perception.lastKnownTargetY = opponent.y;
                unit.perception.lastHeardSource = opponent.side;
                events.push({ type: 'perception', subtype: sk.code, src: unit.side, tgt: opponent.side, frame, confidence: sk.code === 'listen_alert' ? 0.7 : 0.85, lastKnownX: Math.round(opponent.x), lastKnownY: Math.round(opponent.y) });
            } else if (effect.type === 'trick') {
                if (effect.effect === 'tail_decoy') {
                    unit.tailDecoyFrames = Math.max(unit.tailDecoyFrames, effect.duration || rules.BATTLE_TAIL_DECOY_FRAMES);
                    events.push({ type: 'tail_decoy_ready', src: unit.side, skill: sk.code, duration: unit.tailDecoyFrames });
                }
                events.push(animationMapper.mapSkillAction({ actor: unit, target: opponent, frame, skillCode: sk.code, effect, result: { damage: 0 }, targetPart: null }));
            } else if (effect.type === 'buff') {
                _applyBuff(unit, effect, sk.code);
                events.push({ type: 'buff', src: unit.side, skill: sk.code, effect: effect.effect });
                events.push(animationMapper.mapSkillAction({ actor: unit, target: unit, frame, skillCode: sk.code, effect, result: { damage: 0 }, targetPart: null }));
            } else if (effect.type === 'fear_skill') {
                const fearApplied = _addFear(opponent, rules.BATTLE_FEAR_SKILL, frame, true);
                events.push({ type: 'fear', src: unit.side, tgt: opponent.side, skill: sk.code, fear: fearApplied });
                events.push(animationMapper.mapSkillAction({ actor: unit, target: opponent, frame, skillCode: sk.code, effect, result: { damage: 0 }, targetPart: null }));
            } else {
                // 攻击型技能
                const dist = _battleDist(unit, opponent);
                const maxRange = _actionMaxRange(unit, sk.code, effect);
                if (dist > maxRange) break;

                const targetPart = _pickTargetPart(opponent, unit);
                const result = _calcDamage(unit, opponent, rageMulti, effect.dmg_multi, targetPart, frame);
                const targetTactic = unit.lastTargetTactic || { part: targetPart, intent: _targetPartIntent(targetPart), strategy: unit.strategyIntent || 'pressure' };
                _recordTargetPart(statTracker, targetPart, targetTactic.intent, result.damage);
                _trackAngleStats(statTracker, result);

                if (result.dodged) {
                    statTracker.dodges++;
                    events.push({ type: result.decoy ? 'tail_decoy' : 'dodge', src: unit.side, tgt: opponent.side, skill: sk.code, part: result.part, attackZone: result.attackZone, flankScore: result.flankScore });
                } else {
                    events.push(..._applyPartDamage(opponent, targetPart, result.damage));
                    const fearApplied = _addFear(opponent, effect.fear, frame, true);
                    const attackerRelief = _reduceFear(unit, rules.BATTLE_FEAR_ATTACK_SUCCESS_RELIEF || 0);
                    statTracker.totalDamage += result.damage;
                    statTracker.hits++;
                    if (result.crit) statTracker.crits++;
                    if (result.blocked) {
                        statTracker.blocks++;
                        statTracker.blockedDamage += result.blockedDamage || 0;
                        opponent.defenseStats.blocks++;
                        opponent.defenseStats.blockedDamage += result.blockedDamage || 0;
                        events.push({
                            type: 'guard_block',
                            src: opponent.side,
                            tgt: unit.side,
                            skill: sk.code,
                            actionId: result.defenseAction,
                            blockedDamage: result.blockedDamage || 0,
                            dmg: result.damage,
                            part: targetPart,
                            relief: _reduceFear(opponent, rules.BATTLE_FEAR_BLOCK_SUCCESS_RELIEF || 0),
                        });
                        if (result.countered) {
                            statTracker.counters++;
                            opponent.defenseStats.counters++;
                            const counterFear = _addFear(unit, Math.max(1, Math.floor((effect.fear || 0) * 0.5)), frame, true);
                            const counterRelief = _reduceFear(opponent, rules.BATTLE_FEAR_COUNTER_RELIEF || 0);
                            events.push({
                                type: 'counter',
                                src: opponent.side,
                                tgt: unit.side,
                                actionId: result.defenseAction,
                                against: sk.code,
                                fear: counterFear,
                                relief: counterRelief,
                            });
                        }
                    }
                    events.push({
                        type: 'skill_hit',
                        src: unit.side,
                        tgt: opponent.side,
                        skill: sk.code,
                        dmg: result.damage,
                        rawDmg: result.rawDamage || result.damage,
                        blocked: !!result.blocked,
                        blockedDamage: result.blockedDamage || 0,
                        countered: !!result.countered,
                        defenseAction: result.defenseAction || null,
                        fear: fearApplied,
                        relief: attackerRelief,
                        crit: result.crit,
                        part: targetPart,
                        targetTactic,
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
